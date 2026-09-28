/**
 * Overlay-ul Încăperi (tasta I): pe NIVELUL ACTIV, aerul acoperit — ca tentă pe podea pentru o
 * încăpere (o culoare pe încăpere, diferită de a vecinelor), hașuri roșii pentru un spațiu acoperit prin
 * care aerul iese, și un stâlp pe fiecare celulă pe unde iese (DESIGN §9 regula 9: culoare ȘI formă).
 *
 * Panoul pe design (JUC-10): un overlay care colorează doar încăperile e gol tocmai unde jucătorul caută
 * — pe o casă cu golul ușii deschis nu arăta nimic, și nici de ce. Hașurile și stâlpii răspund la „de ce".
 *
 * Citește `w.camere` (la zi în afara tickului) și `scurgeriLaNivel`. Fără nivel nu desenează nimic:
 * legenda spune de ce.
 *
 * ## Când se reface (recenzia încăperilor, ECR-2)
 *
 * `epoca` indexului e GLOBALĂ: crește la orice săpătură sau zidire care atinge aer acoperit, oriunde în
 * lume. Refăcut pe ea, overlay-ul se reconstruia la fiecare săpătură a pionilor dintr-o mină de la 60 m
 * — și, cu materiale noi la fiecare reconstrucție, three.js re-lega 4 programe GL: pe un nivel mare,
 * 32 din 52 de cadre peste 16,7 ms (verificatorul ECR-2, cu pioni reali). Acum:
 * - materialele se creează O DATĂ, cu overlay-ul; `goleste` eliberează doar geometria (re-legările: 4 → 0);
 * - o epocă nouă reface nivelul doar dacă AMPRENTA lui s-a schimbat: identitatea obiectelor felie de la
 *   nivel, plus, pe bucățile lor, (id-ul componentei, e încăpere, ancora). Nu parcurge celulele: costul
 *   e pe felii, 0,0–0,1 ms, față de 3,7–6,1 ms pentru o reconstrucție (semnătura FNV pe celule a lentilei
 *   costa cât reconstrucția pe care o evita — verificatorul a măsurat-o și a respins-o).
 *
 * Amprenta se sprijină pe DOUĂ invariante ale indexului (src/sim/camere.ts, documentate și testate
 * acolo): `refaFelie` pune un obiect felie NOU, iar obiectele vechi nu se modifică niciodată; și orice
 * schimbare a unei celule de la nivel — aerul acoperit, cerul lateral al unei scurgeri — reface felia
 * care o conține sau o atinge (lema jurnalului). Tot ce desenează overlay-ul e funcție de feliile
 * nivelului și de componentele bucăților lor; restul componentei (alt nivel) intră prin triplet.
 */

import * as THREE from 'three'
import type { World } from '../src/sim/state.ts'
import { celuleLaNivel, cheieFelie, esteIncapere } from '../src/sim/camere.ts'
import type { Componenta, IndexCamere } from '../src/sim/camere.ts'
import { scurgeriLaNivel } from '../src/sim/camere-explica.ts'
import { WORLD_CELLS } from '../src/sim/terrain/terrain.ts'

/** Culorile încăperilor: moi, deosebite de culorile lui J și S. Vecinele primesc culori diferite. */
export const CULORI_INCAPERI: readonly number[] = [0x6fb3d9, 0xd9a86f, 0x8fcf73, 0xb98fe0, 0xe0d070, 0x6fd9b8, 0xe08fb0, 0x9aa0e8]
export const CULOARE_DESCHISA = 0xe0503c
export const CULOARE_SCURGERE = 0xff6a3d
/** Numele grupului în scenă: proba de pe ecran (bench/ui-fum.mjs) îl caută după el. */
export const NUME_GRUP = 'overlay-camere'

/** Ce descrie desenul unui nivel, fără să parcurgă celulele. Vezi antetul. */
export interface AmprentaNivel {
  readonly felii: readonly object[]
  /** Pe fiecare bucată a feliilor, în ordine: id-ul componentei, 1 = încăpere, ancora. */
  readonly comp: readonly number[]
}

export interface OverlayCamere {
  readonly group: THREE.Group
  visible: boolean
  /** Ce s-a desenat ultima oară: (epoca indexului, nivelul). */
  epoca: number
  nivel: number | null
  incaperi: number
  deschise: number
  scurgeri: number
  /** Amprenta nivelului desenat; null = nimic desenat. */
  amprenta: AmprentaNivel | null
  /** Create o dată, cu overlay-ul: o reconstrucție nu re-leagă programe GL. */
  readonly materiale: { readonly tenta: THREE.Material; readonly hasuri: THREE.Material; readonly stalpi: THREE.Material }
  /** Contoare: reconstrucții făcute și epoci noi sărite (amprenta nivelului era aceeași). */
  reconstructii: number
  sarite: number
}

export function createCamereOverlay(): OverlayCamere {
  const group = new THREE.Group()
  group.name = NUME_GRUP
  group.visible = false
  group.renderOrder = 6
  const materiale = {
    tenta: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthTest: false, side: THREE.DoubleSide }),
    hasuri: new THREE.LineBasicMaterial({ color: CULOARE_DESCHISA, transparent: true, opacity: 0.8, depthTest: false }),
    stalpi: new THREE.LineBasicMaterial({ color: CULOARE_SCURGERE, depthTest: false }),
  }
  return { group, visible: false, epoca: -1, nivel: null, incaperi: 0, deschise: 0, scurgeri: 0, amprenta: null, materiale, reconstructii: 0, sarite: 0 }
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

/** Prima poziție din `lista` (sortată) cu valoarea ≥ k. */
function primaPozitie(lista: readonly number[], k: number): number {
  let lo = 0
  let hi = lista.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (lista[mid]! < k) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Amprenta nivelului z: feliile lui (cheile sunt sortate pe (z, by, bx), deci nivelul e un interval
 * contiguu) și, pe bucățile lor, tripletul componentei. Proporțională cu feliile, nu cu celulele.
 */
export function amprentaNivel(idx: IndexCamere, z: number): AmprentaNivel {
  const lo = primaPozitie(idx.chei, cheieFelie(0, 0, z))
  const hi = primaPozitie(idx.chei, cheieFelie(0, 0, z + 1))
  const felii: object[] = []
  const comp: number[] = []
  for (let i = lo; i < hi; i++) {
    const f = idx.felii.get(idx.chei[i]!)!
    felii.push(f)
    for (const b of f.bucati) {
      const c = idx.comp.get(idx.bComp[b]!)
      comp.push(c ? c.id : -1, c && esteIncapere(c) ? 1 : 0, c ? c.ancora : -1)
    }
  }
  return { felii, comp }
}

export function aceeasiAmprenta(a: AmprentaNivel, b: AmprentaNivel): boolean {
  if (a.felii.length !== b.felii.length || a.comp.length !== b.comp.length) return false
  for (let i = 0; i < a.felii.length; i++) if (a.felii[i] !== b.felii[i]) return false
  for (let i = 0; i < a.comp.length; i++) if (a.comp[i] !== b.comp[i]) return false
  return true
}

/** Scoate plasele din grup și le eliberează GEOMETRIA; materialele sunt ale overlay-ului și rămân. */
function goleste(g: THREE.Group): void {
  for (const o of [...g.children]) {
    g.remove(o)
    ;(o as THREE.Mesh).geometry?.dispose()
  }
}

/** Reface overlay-ul pentru nivelul `z` (nivelul activ), dacă s-a schimbat ceva. `z = null`: nimic de desenat. */
export function rebuildCamereOverlay(o: OverlayCamere, w: World, z: number | null): void {
  if (!o.visible) return
  if (o.epoca === w.camere.epoca && o.nivel === z) return
  const acelasiNivel = o.nivel === z
  o.epoca = w.camere.epoca
  o.nivel = z
  const amprenta = z === null ? null : amprentaNivel(w.camere, z)
  if (acelasiNivel && amprenta !== null && o.amprenta !== null && aceeasiAmprenta(o.amprenta, amprenta)) {
    o.sarite++
    return
  }
  o.amprenta = amprenta
  o.reconstructii++
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
    const m = new THREE.Mesh(geo, o.materiale.tenta)
    m.renderOrder = 6
    o.group.add(m)
  }
  if (hasuri.length > 0) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(hasuri), 3))
    const l = new THREE.LineSegments(geo, o.materiale.hasuri)
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
    const l = new THREE.LineSegments(geo, o.materiale.stalpi)
    l.renderOrder = 7
    o.group.add(l)
  }
  o.incaperi = inc.size
  o.deschise = des.size
  o.scurgeri = sc.length
}
