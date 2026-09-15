/**
 * Overlay pentru joburi — K13, in aceeasi zi cu sistemul.
 *
 * PLAN K13 numeste sistemele astea — regiuni, rezervari, job curent — drept
 * INVIZIBILE: typecheck verde, teste verzi, joc rupt. Overlay-ul de regiuni a
 * gasit un defect in prima privire si a ratat altul fiindca se uita la alt
 * store decat simularea. Asta se uita la `world.desemnari` si `world.rezervari`
 * — obiectele reale, nu copii. Cauzele de pe PION (`world.ratiune`) ajung
 * deocamdata doar in rezumatul din HUD, nu pe ecran.
 *
 * Ce arata, si de ce fiecare culoare inseamna ceva ACTIONABIL:
 *   - desemnare LIBERA (nimeni n-a respins-o): chihlimbar
 *   - REZERVATA (cineva vine sau lucreaza): albastru
 *   - FARA LOC DE LUCRU (n-are niciun vecin pe care sa stai): rosu — sapa o rampa
 *   - COMPONENTE DIFERITE (are loc, dar nu se ajunge): violet — leaga zonele
 *   - alt refuz memorat (un pion a renuntat: ostil in drum, drum peste buget):
 *     portocaliu — nu e a tintei, e a cuiva; altcineva o poate lua
 * Plus o linie de la fiecare pion care MERGE la lucru catre celula lui de lucru,
 * ca „unde se duce ala?" sa aiba raspuns fara sa dai click.
 */

import * as THREE from 'three'
import type { World } from '../src/sim/state.ts'
import { Faction, PasJob } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { DetaliuMotiv } from '../src/sim/desemnari.ts'
import { motivDinCod, Reason } from '../src/sim/result.ts'
import { rezervariPentru, Strat } from '../src/sim/rezervari.ts'

const CHIHLIMBAR = new THREE.Color(0xd9a441)
const ALBASTRU = new THREE.Color(0x63aec0)
const ROSU = new THREE.Color(0xb1553f)
const VIOLET = new THREE.Color(0x9b6bb5)
const PORTOCALIU = new THREE.Color(0xe08a3c)
const LINIE = new THREE.Color(0xf2efe6)

export interface JobOverlay {
  readonly group: THREE.Group
  visible: boolean
  /** Cifrele pentru HUD, dupa ultima reconstructie. */
  desemnari: number
  rezervate: number
  faraLoc: number
  componente: number
  altRefuz: number
}

export function createJobOverlay(): JobOverlay {
  const group = new THREE.Group()
  group.visible = false
  return { group, visible: false, desemnari: 0, rezervate: 0, faraLoc: 0, componente: 0, altRefuz: 0 }
}

function goleste(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child)
    const m = child as THREE.Mesh | THREE.LineSegments
    m.geometry.dispose()
    const mat = m.material as THREE.Material
    mat.dispose()
  }
}

/** Cele 12 muchii ale unui cub de o celula, usor retras, la (wx, wy, z). */
function cub(out: number[], wx: number, wy: number, z: number): void {
  const m = 0.1
  const x0 = wx + m, x1 = wx + 1 - m
  const y0 = z + m, y1 = z + 1 - m
  const z0 = wy + m, z1 = wy + 1 - m
  const c = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ]
  const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
  for (const [a, b] of e) out.push(...c[a!]!, ...c[b!]!)
}

/**
 * Reconstruieste overlay-ul. Se cheama cand e vizibil, la cateva cadre — nu la
 * fiecare, si niciodata in calea de masurare a gate-ului. O singura geometrie
 * de linii cu culoare per varf: un draw call, oricate desemnari ar fi.
 */
export function rebuildJobOverlay(o: JobOverlay, w: World): void {
  goleste(o.group)
  o.desemnari = 0
  o.rezervate = 0
  o.faraLoc = 0
  o.componente = 0
  o.altRefuz = 0
  if (!o.visible) return

  const pos: number[] = []
  const col: number[] = []
  const d = w.desemnari
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 0) continue
    o.desemnari++
    let culoare = CHIHLIMBAR
    if (rezervariPentru(w.rezervari, d.id[i]!, Strat.LUCRU).length > 0) {
      culoare = ALBASTRU
      o.rezervate++
    } else {
      const motiv = motivDinCod(d.ultimulMotiv[i]!)
      if (motiv === Reason.INACCESIBIL && d.ultimulMotivDetaliu[i] === DetaliuMotiv.FARA_LOC_DE_LUCRU) { culoare = ROSU; o.faraLoc++ }
      else if (motiv === Reason.INACCESIBIL && d.ultimulMotivDetaliu[i] === DetaliuMotiv.COMPONENTE_DIFERITE) { culoare = VIOLET; o.componente++ }
      else if (motiv !== null) { culoare = PORTOCALIU; o.altRefuz++ }
    }
    const inainte = pos.length
    cub(pos, d.wx[i]!, d.wy[i]!, d.z[i]!)
    for (let k = inainte; k < pos.length; k += 3) col.push(culoare.r, culoare.g, culoare.b)
  }

  // Liniile „unde se duce": de la pion la celula lui de lucru.
  const a = w.agents
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0 || a.jobKind[i] === 0 || a.jobStep[i] !== PasJob.MERGE) continue
    pos.push(cellOf(a.x[i]!) + 0.5, a.z[i]! + 0.9, cellOf(a.y[i]!) + 0.5)
    pos.push(a.jobWorkX[i]! + 0.5, a.jobWorkZ[i]! + 0.1, a.jobWorkY[i]! + 0.5)
    for (let k = 0; k < 2; k++) col.push(LINIE.r, LINIE.g, LINIE.b)
  }

  if (pos.length === 0) return
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3))
  o.group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false })))
}

/** Rezumatul pentru HUD: cati pioni ai ASEZARII sunt in fiecare stare, si avertismentul de „nimeni nu sapa". */
export function rezumatJoburi(w: World): { idle: number; merg: number; lucreaza: number; faraMuncitori: boolean } {
  const a = w.agents
  let idle = 0
  let merg = 0
  let lucreaza = 0
  let activi = 0
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0 || a.faction[i] !== Faction.ASEZARE) continue
    if (a.prioPersonala[i]! > 0) activi++
    if (a.jobKind[i] === 0) idle++
    else if (a.jobStep[i] === PasJob.LUCREAZA) lucreaza++
    else merg++
  }
  return { idle, merg, lucreaza, faraMuncitori: activi === 0 && w.desemnari.vii > 0 }
}
