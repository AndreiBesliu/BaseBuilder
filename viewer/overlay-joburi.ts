/**
 * Overlay pentru joburi — K13, in aceeasi zi cu sistemul.
 *
 * PLAN K13 numeste sistemele astea — regiuni, rezervari, job curent, iteme,
 * depozite — drept INVIZIBILE: typecheck verde, teste verzi, joc rupt. Overlay-ul
 * de regiuni a gasit un defect in prima privire si a ratat altul fiindca se uita
 * la alt store decat simularea. Asta se uita la `world.desemnari`,
 * `world.iteme`, `world.zone` si `world.rezervari` — obiectele reale, nu copii.
 *
 * Ce arata, si de ce fiecare culoare inseamna ceva ACTIONABIL:
 *   desemnari (cuburi de o celula):
 *   - LIBERA (nimeni n-a respins-o): chihlimbar
 *   - REZERVATA (cineva vine sau lucreaza): albastru
 *   - FARA LOC DE LUCRU (n-are niciun vecin pe care sa stai): rosu — sapa o rampa
 *   - COMPONENTE DIFERITE (are loc, dar nu se ajunge): violet — leaga zonele
 *   - alt refuz memorat (un pion a renuntat: ostil in drum, drum peste buget):
 *     portocaliu — nu e a tintei, e a cuiva; altcineva o poate lua
 *   iteme (cuburi mai mici, inaltimea ∝ cantitate / itemStackMax):
 *   - LIBER: chihlimbar · REZERVAT (vine un caraus): albastru · FARA_DEPOZIT: rosu —
 *     picteaza / mareste depozitul · INACCESIBIL: violet — leaga zonele
 *   celule de depozit (patrate pe podea): luminozitate ∝ umplere; contur albastru
 *   cand e rezervata ca destinatie
 * Plus o linie de la fiecare pion care MERGE (la lucru, la morman, la depozit)
 * catre celula lui tinta, ca „unde se duce ala?" sa aiba raspuns fara sa dai click.
 */

import * as THREE from 'three'
import type { World } from '../src/sim/state.ts'
import { Categorie, CATEGORII, Faction, pasDeMers } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { DetaliuMotiv } from '../src/sim/desemnari.ts'
import { motivDinCod, Reason } from '../src/sim/result.ts'
import { rezervariPentru, Strat } from '../src/sim/rezervari.ts'
import { DetaliuItem, itemLaCelula } from '../src/sim/iteme.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'

const CHIHLIMBAR = new THREE.Color(0xd9a441)
const ALBASTRU = new THREE.Color(0x63aec0)
const ROSU = new THREE.Color(0xb1553f)
const VIOLET = new THREE.Color(0x9b6bb5)
const PORTOCALIU = new THREE.Color(0xe08a3c)
const LINIE = new THREE.Color(0xf2efe6)
const DEPOZIT = new THREE.Color(0x7fa66b)

export interface JobOverlay {
  readonly group: THREE.Group
  visible: boolean
  /** Cifrele pentru HUD, dupa ultima reconstructie. */
  desemnari: number
  rezervate: number
  faraLoc: number
  componente: number
  altRefuz: number
  iteme: number
  itemeRezervate: number
  itemeFaraDepozit: number
  itemeInaccesibile: number
  celuleDepozit: number
  celuleOcupate: number
}

export function createJobOverlay(): JobOverlay {
  const group = new THREE.Group()
  group.visible = false
  return {
    group, visible: false,
    desemnari: 0, rezervate: 0, faraLoc: 0, componente: 0, altRefuz: 0,
    iteme: 0, itemeRezervate: 0, itemeFaraDepozit: 0, itemeInaccesibile: 0,
    celuleDepozit: 0, celuleOcupate: 0,
  }
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

/** Cele 12 muchii ale unui cub retras cu `m` intr-o celula, cu inaltimea `h` (fractiune din celula). */
function cub(out: number[], wx: number, wy: number, z: number, m: number, h: number): void {
  const x0 = wx + m, x1 = wx + 1 - m
  const y0 = z + m, y1 = z + m + Math.max(0.05, h * (1 - 2 * m))
  const z0 = wy + m, z1 = wy + 1 - m
  const c = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ]
  const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
  for (const [a, b] of e) out.push(...c[a!]!, ...c[b!]!)
}

/** Un patrat pe podeaua celulei (wx, wy, z), usor retras. */
function patrat(out: number[], wx: number, wy: number, z: number, m: number): void {
  const x0 = wx + m, x1 = wx + 1 - m
  const y = z + 0.03
  const z0 = wy + m, z1 = wy + 1 - m
  out.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0)
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
  o.iteme = 0
  o.itemeRezervate = 0
  o.itemeFaraDepozit = 0
  o.itemeInaccesibile = 0
  o.celuleDepozit = 0
  o.celuleOcupate = 0
  if (!o.visible) return

  const pos: number[] = []
  const col: number[] = []
  const adauga = (inainte: number, culoare: THREE.Color): void => {
    for (let k = inainte; k < pos.length; k += 3) col.push(culoare.r, culoare.g, culoare.b)
  }

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
    cub(pos, d.wx[i]!, d.wy[i]!, d.z[i]!, 0.1, 1)
    adauga(inainte, culoare)
  }

  // Itemele: cuburi mai mici, cu inaltimea dupa cantitate, colorate pe cauza.
  const it = w.iteme
  const stackMax = DEFAULT_RULES.itemStackMax
  for (let i = 0; i < it.count; i++) {
    if (it.alive[i] === 0) continue
    o.iteme++
    let culoare = CHIHLIMBAR
    if (rezervariPentru(w.rezervari, it.id[i]!, Strat.CARAT).length > 0) {
      culoare = ALBASTRU
      o.itemeRezervate++
    } else {
      const motiv = motivDinCod(it.ultimulMotiv[i]!)
      if (motiv === Reason.FARA_DEPOZIT) { culoare = ROSU; o.itemeFaraDepozit++ }
      else if (motiv === Reason.INACCESIBIL || it.ultimulMotivDetaliu[i] === DetaliuItem.COMPONENTE_DIFERITE) { culoare = VIOLET; o.itemeInaccesibile++ }
      else if (motiv !== null) culoare = PORTOCALIU
    }
    const inainte = pos.length
    cub(pos, it.wx[i]!, it.wy[i]!, it.z[i]!, 0.3, it.cantitate[i]! / stackMax)
    adauga(inainte, culoare)
  }

  // Celulele de depozit: patrate pe podea, mai luminoase cu cat sunt mai pline;
  // contur albastru pentru cele rezervate ca destinatie.
  const c = w.zone.celule
  const culoareCelula = new THREE.Color()
  for (let i = 0; i < c.count; i++) {
    if (c.alive[i] === 0) continue
    o.celuleDepozit++
    const item = itemLaCelula(it, c.wx[i]!, c.wy[i]!, c.z[i]!)
    const umplere = item === -1 ? 0 : it.cantitate[item]! / stackMax
    if (item !== -1) o.celuleOcupate++
    const rezervata = rezervariPentru(w.rezervari, c.id[i]!, Strat.LUCRU).length > 0
    const inainte = pos.length
    patrat(pos, c.wx[i]!, c.wy[i]!, c.z[i]!, rezervata ? 0.2 : 0.08)
    if (rezervata) adauga(inainte, ALBASTRU)
    else {
      culoareCelula.copy(DEPOZIT).multiplyScalar(0.35 + 0.65 * umplere)
      adauga(inainte, culoareCelula)
    }
  }

  // Liniile „unde se duce": de la pion la celula-tinta a pasului curent de mers.
  const a = w.agents
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0 || a.jobKind[i] === 0 || !pasDeMers(a.jobStep[i]!)) continue
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

export interface RezumatJoburi {
  idle: number
  merg: number
  lucreaza: number
  /** Pioni cu marfa in mana. */
  cara: number
  faraMuncitori: boolean
  faraCarausi: boolean
}

/**
 * Rezumatul pentru HUD: cati pioni ai ASEZARII sunt in fiecare stare, si
 * avertismentele „nimeni nu sapa" / „nimeni nu cara". Prioritatile personale se
 * citesc cu pasul `CATEGORII` — un index plat ar fi citit categoria gresita.
 */
export function rezumatJoburi(w: World): RezumatJoburi {
  const a = w.agents
  let idle = 0
  let merg = 0
  let lucreaza = 0
  let cara = 0
  let sapatori = 0
  let carausi = 0
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0 || a.faction[i] !== Faction.ASEZARE) continue
    if (a.prioPersonala[i * CATEGORII + Categorie.SAPA]! > 0) sapatori++
    if (a.prioPersonala[i * CATEGORII + Categorie.CARA]! > 0) carausi++
    if (a.caraCantitate[i]! > 0) cara++
    if (a.jobKind[i] === 0) idle++
    else if (!pasDeMers(a.jobStep[i]!)) lucreaza++
    else merg++
  }
  return {
    idle, merg, lucreaza, cara,
    faraMuncitori: sapatori === 0 && w.desemnari.vii > 0,
    faraCarausi: carausi === 0 && w.iteme.vii > 0 && w.zone.vii > 0,
  }
}
