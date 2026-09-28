/**
 * Overlay-ul Încăperi (tasta I): pe NIVELUL ACTIV, aerul acoperit — ca tentă pe podea pentru o
 * încăpere (o culoare pe încăpere, diferită de a vecinelor), hașuri roșii pentru un spațiu acoperit prin
 * care aerul iese, și un stâlp pe fiecare celulă pe unde iese (DESIGN §9 regula 9: culoare ȘI formă).
 *
 * Panoul pe design (JUC-10): un overlay care colorează doar încăperile e gol tocmai unde jucătorul caută
 * — pe o casă cu golul ușii deschis nu arăta nimic, și nici de ce. Hașurile și stâlpii răspund la „de ce".
 *
 * Citește `w.camere` (la zi în afara tickului) și `scurgeriLaNivel`; se reface doar când se schimbă
 * indexul (`epoca`) sau nivelul. Fără nivel nu desenează nimic: legenda spune de ce.
 */

import * as THREE from 'three'
import type { World } from '../src/sim/state.ts'
import { celuleLaNivel, esteIncapere } from '../src/sim/camere.ts'
import type { Componenta } from '../src/sim/camere.ts'
import { scurgeriLaNivel } from '../src/sim/camere-explica.ts'
import { WORLD_CELLS } from '../src/sim/terrain/terrain.ts'

/** Culorile încăperilor: moi, deosebite de culorile lui J și S. Vecinele primesc culori diferite. */
export const CULORI_INCAPERI: readonly number[] = [0x6fb3d9, 0xd9a86f, 0x8fcf73, 0xb98fe0, 0xe0d070, 0x6fd9b8, 0xe08fb0, 0x9aa0e8]
export const CULOARE_DESCHISA = 0xe0503c
export const CULOARE_SCURGERE = 0xff6a3d

export interface OverlayCamere {
  readonly group: THREE.Group
  visible: boolean
  /** Ce s-a desenat ultima oară: (epoca indexului, nivelul). */
  epoca: number
  nivel: number | null
  incaperi: number
  deschise: number
  scurgeri: number
}

export function createCamereOverlay(): OverlayCamere {
  const group = new THREE.Group()
  group.visible = false
  group.renderOrder = 6
  return { group, visible: false, epoca: -1, nivel: null, incaperi: 0, deschise: 0, scurgeri: 0 }
}

/**
 * Culoarea fiecărei componente de la nivel, lacom, în ordinea ancorei: cea mai mică culoare nefolosită de
 * o vecină deja colorată (vecină = o celulă a ei la cel mult 2 celule, adică de partea cealaltă a unui
 * zid). Pură: testată în node.
 */
export function culoriIncaperi(celule: readonly { x: number; y: number; c: Componenta }[]): Map<number, number> {
  const laCelula = new Map<number, number>()
  for (const e of celule) laCelula.set(e.y * WORLD_CELLS + e.x, e.c.id)
  const vecini = new Map<number, Set<number>>()
  for (const e of celule) {
    let s = vecini.get(e.c.id)
    if (!s) { s = new Set(); vecini.set(e.c.id, s) }
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const o = laCelula.get((e.y + dy) * WORLD_CELLS + e.x + dx)
        if (o !== undefined && o !== e.c.id) s.add(o)
      }
    }
  }
  const ancora = new Map<number, number>()
  for (const e of celule) ancora.set(e.c.id, e.c.ancora)
  const ordine = [...ancora.keys()].sort((a, b) => ancora.get(a)! - ancora.get(b)!)
  const culoare = new Map<number, number>()
  for (const id of ordine) {
    const folosite = new Set<number>()
    for (const v of vecini.get(id) ?? []) { const c = culoare.get(v); if (c !== undefined) folosite.add(c) }
    let c = 0
    while (folosite.has(c) && c < CULORI_INCAPERI.length - 1) c++
    culoare.set(id, c)
  }
  return culoare
}

function goleste(g: THREE.Group): void {
  for (const o of [...g.children]) {
    g.remove(o)
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  }
}

/** Reface overlay-ul pentru nivelul `z` (nivelul activ), dacă s-a schimbat ceva. `z = null`: nimic de desenat. */
export function rebuildCamereOverlay(o: OverlayCamere, w: World, z: number | null): void {
  if (!o.visible) return
  if (o.epoca === w.camere.epoca && o.nivel === z) return
  o.epoca = w.camere.epoca
  o.nivel = z
  goleste(o.group)
  o.incaperi = 0
  o.deschise = 0
  o.scurgeri = 0
  if (z === null) return

  const celule: { x: number; y: number; c: Componenta }[] = []
  celuleLaNivel(w.camere, z, (x, y, c) => { celule.push({ x, y, c }) })
  const culori = culoriIncaperi(celule.filter((e) => esteIncapere(e.c)))
  const inc = new Set<number>()
  const des = new Set<number>()

  // Tenta încăperilor: un quad pe celulă, pe podea (y = z + 0,03), culoare pe vârf.
  const pos: number[] = []
  const col: number[] = []
  const hasuri: number[] = []
  const y0 = z + 0.03
  const c3 = new THREE.Color()
  for (const e of celule) {
    if (esteIncapere(e.c)) {
      inc.add(e.c.id)
      c3.setHex(CULORI_INCAPERI[culori.get(e.c.id) ?? 0]!)
      const a = e.x + 0.06, b = e.x + 0.94, p = e.y + 0.06, q = e.y + 0.94
      pos.push(a, y0, p, b, y0, p, b, y0, q, a, y0, p, b, y0, q, a, y0, q)
      for (let i = 0; i < 6; i++) col.push(c3.r, c3.g, c3.b)
    } else {
      des.add(e.c.id)
      // Hașuri: trei diagonale pe celulă.
      for (const t of [0.25, 0.5, 0.75]) {
        hasuri.push(e.x + t, y0, e.y, e.x, y0, e.y + t)
        hasuri.push(e.x + 1, y0, e.y + t, e.x + t, y0, e.y + 1)
      }
      hasuri.push(e.x + 1, y0, e.y, e.x, y0, e.y + 1)
    }
  }
  if (pos.length > 0) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3))
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthTest: false, side: THREE.DoubleSide }))
    m.renderOrder = 6
    o.group.add(m)
  }
  if (hasuri.length > 0) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hasuri), 3))
    const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: CULOARE_DESCHISA, transparent: true, opacity: 0.8, depthTest: false }))
    l.renderOrder = 6
    o.group.add(l)
  }
  // Stâlpii: pe fiecare celulă de cer pe unde iese aerul, de la podea 2 m în sus, plus conturul celulei.
  const sc = scurgeriLaNivel(w.terrain, w.camere, z)
  if (sc.length > 0) {
    const lin: number[] = []
    for (const s of sc) {
      const cx = s.x + 0.5, cz = s.y + 0.5
      lin.push(cx, z, cz, cx, z + 2, cz)
      const a = s.x + 0.1, b = s.x + 0.9, p = s.y + 0.1, q = s.y + 0.9, y = z + 0.05
      lin.push(a, y, p, b, y, p, b, y, p, b, y, q, b, y, q, a, y, q, a, y, q, a, y, p)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lin), 3))
    const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: CULOARE_SCURGERE, depthTest: false }))
    l.renderOrder = 7
    o.group.add(l)
  }
  o.incaperi = inc.size
  o.deschise = des.size
  o.scurgeri = sc.length
}
