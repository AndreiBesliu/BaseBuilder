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
 *   - FARA LOC SIGUR (are unde sta, dar nicaieri de unde n-ar ramane blocat): turcoaz, cu
 *     DIAGONALE pe fete — pune o scara / lasa o usa, sau asteapta o piesa inca nezidita
 *   - AR INCHIDE (zidirea ar inchide un pion, un morman sau o zona): roz
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
import { Faction, Nevoie, NEVOI, pasDeMers } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { DetaliuMotiv } from '../src/sim/desemnari.ts'
import { motivDinCod, Reason } from '../src/sim/result.ts'
import { rezervariPentru, Strat } from '../src/sim/rezervari.ts'
import { DetaliuItem, itemLaCelula } from '../src/sim/iteme.ts'
import { categoriiActive, tintaDispozitiei } from '../src/sim/joburi.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { MARGINE_CUB_J } from './tinta.ts'

const CHIHLIMBAR = new THREE.Color(0xd9a441)
const ALBASTRU = new THREE.Color(0x63aec0)
const ROSU = new THREE.Color(0xb1553f)
const VIOLET = new THREE.Color(0x9b6bb5)
const PORTOCALIU = new THREE.Color(0xe08a3c)
/**
 * Are unde sta, dar niciun loc SIGUR: o scara, o usa — sau asteapta o piesa inca nezidita.
 *
 * Turcoazul singur se confunda cu albastrul „rezervata": dE2000 12,0 la vedere normala si 6,0 in
 * deuteranopie (recenzia, `culori.mjs`). Nicio culoare nu poate sta la dE2000 >= 30 de TOATE cele
 * opt culori J (cu linia alba a pionilor), nici macar la vedere normala: pe grila sRGB cu pas 4
 * (171.616 candidate vizibile pe fundal), cel mai departe ajunge 28,2 la vedere normala si 17,6 in
 * deuteranopie (scratchpad-ul reparatiei, `viewer-fix/culori-cauta.mjs`). Deci
 * deosebirea o poarta FORMA — diagonalele pe fete (`cubCuDiagonale`) —, iar nuanta ramane
 * turcoazul din overlay-ul S, unde inseamna acelasi lucru: nu ajunge nimeni.
 */
const TURCOAZ = new THREE.Color(0x3fb8b0)
/** Zidirea ar inchide un pion, un morman sau o zona. */
const ROZ = new THREE.Color(0xd9708f)
const LINIE = new THREE.Color(0xf2efe6)
const DEPOZIT = new THREE.Color(0x7fa66b)

export interface JobOverlay {
  readonly group: THREE.Group
  visible: boolean
  /** Cifrele pentru HUD, dupa ultima reconstructie. */
  desemnari: number
  rezervate: number
  faraLoc: number
  /** Are vecini, dar niciun loc de lucru SIGUR (FARA_LOC_SIGUR). */
  faraLocSigur: number
  /** Zidirea ar inchide ceva (AR_INCHIDE). */
  inchide: number
  componente: number
  altRefuz: number
  iteme: number
  itemeRezervate: number
  itemeFaraDepozit: number
  itemeInaccesibile: number
  celuleDepozit: number
  celuleOcupate: number
  /** Geometria PREALOCATA: un singur obiect pe viata overlay-ului (vezi `createJobOverlay`). */
  readonly linii: THREE.LineSegments
  readonly pos: Float32Array
  readonly col: Float32Array
  /** Cate varfuri s-au scris la ultima reconstructie. */
  varfuri: number
}

/** Varfuri pe fel: un cub cu diagonale (36), un cub (24), un patrat (8), o linie (2). */
const V_DESEMNARE = 36
const V_ITEM = 24
const V_CELULA = 8
const V_PION = 2

/**
 * Geometria se aloca O DATA, la capacitatea regulilor, si se rescrie pe loc la fiecare
 * reconstructie. Varianta veche facea o geometrie si un material noi la fiecare 6 cadre, din
 * tablouri JS cu `push(...spread)`: 7,7 ms la 4096 de desemnari (12–41 ms pe un plan 64×64 cu
 * pionii la lucru), adica un sughit de 10 ori pe secunda cat J e aprins — si in joc J e aprins
 * implicit (panoul de design al UI-ului, CG-3). Prealocat: 0,68 ms, masurat de panou pe aceeasi
 * clasificare. Cu regulile implicite: 278.656 de varfuri, 6,4 MiB.
 */
export function createJobOverlay(rules: Rules = DEFAULT_RULES): JobOverlay {
  const group = new THREE.Group()
  group.visible = false
  const cap = V_DESEMNARE * rules.designationCapacity + V_ITEM * rules.itemCapacity + V_CELULA * rules.zoneCellCapacity + V_PION * rules.agentCapacity
  const pos = new Float32Array(cap * 3)
  const col = new Float32Array(cap * 3)
  const geo = new THREE.BufferGeometry()
  const aPos = new THREE.BufferAttribute(pos, 3)
  const aCol = new THREE.BufferAttribute(col, 3)
  aPos.setUsage(THREE.DynamicDrawUsage)
  aCol.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', aPos)
  geo.setAttribute('color', aCol)
  geo.setDrawRange(0, 0)
  const linii = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false }))
  // Cuprinde tot: altfel sfera de incadrare, calculata o data pe primul continut, ar taia ce vine dupa.
  linii.frustumCulled = false
  group.add(linii)
  return {
    group, visible: false,
    desemnari: 0, rezervate: 0, faraLoc: 0, faraLocSigur: 0, inchide: 0, componente: 0, altRefuz: 0,
    iteme: 0, itemeRezervate: 0, itemeFaraDepozit: 0, itemeInaccesibile: 0,
    celuleDepozit: 0, celuleOcupate: 0,
    linii, pos, col, varfuri: 0,
  }
}

/** Cursorul de scriere al unei reconstructii. */
interface Scriere {
  readonly pos: Float32Array
  readonly col: Float32Array
  n: number
}

function varf(s: Scriere, x: number, y: number, z: number): void {
  const k = s.n * 3
  s.pos[k] = x
  s.pos[k + 1] = y
  s.pos[k + 2] = z
  s.n++
}

function culoare(s: Scriere, de: number, c: THREE.Color): void {
  for (let v = de; v < s.n; v++) {
    const k = v * 3
    s.col[k] = c.r
    s.col[k + 1] = c.g
    s.col[k + 2] = c.b
  }
}

const MUCHII = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]
const COLT = new Float32Array(24)

/** Cele 12 muchii ale unui cub retras cu `m` intr-o celula, cu inaltimea `h` (fractiune din celula). */
function cub(s: Scriere, wx: number, wy: number, z: number, m: number, h: number): void {
  const x0 = wx + m, x1 = wx + 1 - m
  const y0 = z + m, y1 = z + m + Math.max(0.05, h * (1 - 2 * m))
  const z0 = wy + m, z1 = wy + 1 - m
  const c = COLT
  c[0] = x0; c[1] = y0; c[2] = z0; c[3] = x1; c[4] = y0; c[5] = z0; c[6] = x1; c[7] = y0; c[8] = z1; c[9] = x0; c[10] = y0; c[11] = z1
  c[12] = x0; c[13] = y1; c[14] = z0; c[15] = x1; c[16] = y1; c[17] = z0; c[18] = x1; c[19] = y1; c[20] = z1; c[21] = x0; c[22] = y1; c[23] = z1
  for (const e of MUCHII) varf(s, c[e * 3]!, c[e * 3 + 1]!, c[e * 3 + 2]!)
}

/**
 * Cubul lui `cub`, plus cate o diagonala pe fiecare dintre cele sase fete: semnul lui FARA LOC
 * SIGUR, care se citeste si fara culoare (vezi TURCOAZ).
 */
function cubCuDiagonale(s: Scriere, wx: number, wy: number, z: number, m: number): void {
  cub(s, wx, wy, z, m, 1)
  const x0 = wx + m, x1 = wx + 1 - m
  const y0 = z + m, y1 = z + 1 - m
  const z0 = wy + m, z1 = wy + 1 - m
  varf(s, x0, y0, z0); varf(s, x1, y1, z0) // fata -z
  varf(s, x0, y0, z1); varf(s, x1, y1, z1) // fata +z
  varf(s, x0, y0, z0); varf(s, x0, y1, z1) // fata -x
  varf(s, x1, y0, z0); varf(s, x1, y1, z1) // fata +x
  varf(s, x0, y1, z0); varf(s, x1, y1, z1) // capacul
  varf(s, x0, y0, z0); varf(s, x1, y0, z1) // baza
}

/** Un patrat pe podeaua celulei (wx, wy, z), usor retras. */
function patrat(s: Scriere, wx: number, wy: number, z: number, m: number): void {
  const x0 = wx + m, x1 = wx + 1 - m
  const y = z + 0.03
  const z0 = wy + m, z1 = wy + 1 - m
  varf(s, x0, y, z0); varf(s, x1, y, z0)
  varf(s, x1, y, z0); varf(s, x1, y, z1)
  varf(s, x1, y, z1); varf(s, x0, y, z1)
  varf(s, x0, y, z1); varf(s, x0, y, z0)
}

/**
 * Reconstruieste overlay-ul. Se cheama cand e vizibil, la cateva cadre — nu la fiecare, si niciodata
 * in calea de masurare a gate-ului. NECONDITIONAT: motivele memorate (`ultimulMotiv`) se schimba
 * fara ca vreun contor al lumii sa se miste (panoul: 5–9% din refaceri ar fi ramas invechite).
 * Un singur draw call, oricate desemnari ar fi, si niciun obiect nou.
 */
export function rebuildJobOverlay(o: JobOverlay, w: World, rules: Rules = DEFAULT_RULES): void {
  o.desemnari = 0
  o.rezervate = 0
  o.faraLoc = 0
  o.faraLocSigur = 0
  o.inchide = 0
  o.componente = 0
  o.altRefuz = 0
  o.iteme = 0
  o.itemeRezervate = 0
  o.itemeFaraDepozit = 0
  o.itemeInaccesibile = 0
  o.celuleDepozit = 0
  o.celuleOcupate = 0
  const s: Scriere = { pos: o.pos, col: o.col, n: 0 }
  if (o.visible) scrieOverlay(o, s, w, rules)
  o.varfuri = s.n
  const geo = o.linii.geometry
  geo.setDrawRange(0, s.n)
  const aPos = geo.getAttribute('position') as THREE.BufferAttribute
  const aCol = geo.getAttribute('color') as THREE.BufferAttribute
  aPos.clearUpdateRanges()
  aCol.clearUpdateRanges()
  if (s.n > 0) {
    aPos.addUpdateRange(0, s.n * 3)
    aCol.addUpdateRange(0, s.n * 3)
    aPos.needsUpdate = true
    aCol.needsUpdate = true
  }
}

function scrieOverlay(o: JobOverlay, s: Scriere, w: World, rules: Rules): void {
  const d = w.desemnari
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 0) continue
    o.desemnari++
    let c = CHIHLIMBAR
    if (rezervariPentru(w.rezervari, d.id[i]!, Strat.LUCRU).length > 0) {
      c = ALBASTRU
      o.rezervate++
    } else {
      const motiv = motivDinCod(d.ultimulMotiv[i]!)
      if (motiv === Reason.INACCESIBIL && d.ultimulMotivDetaliu[i] === DetaliuMotiv.FARA_LOC_DE_LUCRU) { c = ROSU; o.faraLoc++ }
      else if (motiv === Reason.INACCESIBIL && d.ultimulMotivDetaliu[i] === DetaliuMotiv.FARA_LOC_SIGUR) { c = TURCOAZ; o.faraLocSigur++ }
      else if (motiv === Reason.AR_INCHIDE) { c = ROZ; o.inchide++ }
      else if (motiv === Reason.INACCESIBIL && d.ultimulMotivDetaliu[i] === DetaliuMotiv.COMPONENTE_DIFERITE) { c = VIOLET; o.componente++ }
      else if (motiv !== null) { c = PORTOCALIU; o.altRefuz++ }
    }
    const de = s.n
    // Cutia desenata e EXACT cea pe care o atinge click-ul (viewer/tinta.ts, `cubAtins`).
    if (c === TURCOAZ) cubCuDiagonale(s, d.wx[i]!, d.wy[i]!, d.z[i]!, MARGINE_CUB_J)
    else cub(s, d.wx[i]!, d.wy[i]!, d.z[i]!, MARGINE_CUB_J, 1)
    culoare(s, de, c)
  }

  // Itemele: cuburi mai mici, cu inaltimea dupa cantitate, colorate pe cauza.
  const it = w.iteme
  const stackMax = rules.itemStackMax
  for (let i = 0; i < it.count; i++) {
    if (it.alive[i] === 0) continue
    o.iteme++
    let c = CHIHLIMBAR
    if (rezervariPentru(w.rezervari, it.id[i]!, Strat.CARAT).length > 0) {
      c = ALBASTRU
      o.itemeRezervate++
    } else {
      const motiv = motivDinCod(it.ultimulMotiv[i]!)
      if (motiv === Reason.FARA_DEPOZIT) { c = ROSU; o.itemeFaraDepozit++ }
      else if (motiv === Reason.INACCESIBIL || it.ultimulMotivDetaliu[i] === DetaliuItem.COMPONENTE_DIFERITE) { c = VIOLET; o.itemeInaccesibile++ }
      else if (motiv !== null) c = PORTOCALIU
    }
    const de = s.n
    cub(s, it.wx[i]!, it.wy[i]!, it.z[i]!, 0.3, it.cantitate[i]! / stackMax)
    culoare(s, de, c)
  }

  // Celulele de depozit: patrate pe podea, mai luminoase cu cat sunt mai pline;
  // contur albastru pentru cele rezervate ca destinatie.
  const zc = w.zone.celule
  for (let i = 0; i < zc.count; i++) {
    if (zc.alive[i] === 0) continue
    o.celuleDepozit++
    const item = itemLaCelula(it, zc.wx[i]!, zc.wy[i]!, zc.z[i]!)
    const umplere = item === -1 ? 0 : it.cantitate[item]! / stackMax
    if (item !== -1) o.celuleOcupate++
    const rezervata = rezervariPentru(w.rezervari, zc.id[i]!, Strat.LUCRU).length > 0
    const de = s.n
    patrat(s, zc.wx[i]!, zc.wy[i]!, zc.z[i]!, rezervata ? 0.2 : 0.08)
    if (rezervata) culoare(s, de, ALBASTRU)
    else {
      CULOARE_CELULA.copy(DEPOZIT).multiplyScalar(0.35 + 0.65 * umplere)
      culoare(s, de, CULOARE_CELULA)
    }
  }

  // Liniile „unde se duce": de la pion la celula-tinta a pasului curent de mers.
  const a = w.agents
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0 || a.jobKind[i] === 0 || !pasDeMers(a.jobStep[i]!)) continue
    const de = s.n
    varf(s, cellOf(a.x[i]!) + 0.5, a.z[i]! + 0.9, cellOf(a.y[i]!) + 0.5)
    varf(s, a.jobWorkX[i]! + 0.5, a.jobWorkZ[i]! + 0.1, a.jobWorkY[i]! + 0.5)
    culoare(s, de, LINIE)
  }
}

const CULOARE_CELULA = new THREE.Color()

export interface RezumatJoburi {
  idle: number
  merg: number
  lucreaza: number
  /** Pioni cu marfa in mana. */
  cara: number
  faraMuncitori: boolean
  faraCarausi: boolean
  /** Cati sunt sub pragul de foame, si cati sub cel de odihna. */
  flamanzi: number
  obositi: number
  /** Cati REFUZA munca. Separat de „nefericiti": nu e acelasi lucru. */
  refuza: number
  /** Cati au TINTA sub pragul de avertisment, deci urmeaza sa plece. */
  pleacaCurand: number
  /** Cati au plecat de la inceputul lumii. PERSISTED. */
  plecati: number
  /**
   * Nu mai e mancare in asezare. Derivat gratuit in aceeasi trecere; fara el,
   * colonia se opreste, contoarele cresc, si nimic nu leaga cele trei.
   */
  faraMancare: boolean
}

/**
 * Rezumatul pentru HUD: cati pioni ai ASEZARII sunt in fiecare stare, si
 * avertismentele „nimeni nu sapa" / „nimeni nu cara". Cine sapa si cine cara se
 * citeste pe categoriile EFECTIVE (`categoriiActive`, aceeasi functie ca scanerul):
 * un pion cu Sapa pe nivelul maxim („exclusiv") nu mai cara, desi prioritatea lui
 * la carat e nenula — cu `> 0` HUD-ul tacea exact cand nimeni nu cara (panoul de
 * design al UI-ului, CS-1).
 */
export function rezumatJoburi(w: World): RezumatJoburi {
  const a = w.agents
  let idle = 0
  let merg = 0
  let lucreaza = 0
  let cara = 0
  let sapatori = 0
  let carausi = 0
  let flamanzi = 0
  let obositi = 0
  let refuza = 0
  let pleacaCurand = 0
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0 || a.faction[i] !== Faction.ASEZARE) continue
    const act = categoriiActive(w, DEFAULT_RULES, i)
    if (act.sapa) sapatori++
    if (act.cara) carausi++
    if (a.caraCantitate[i]! > 0) cara++
    if (a.jobKind[i] === 0) idle++
    else if (!pasDeMers(a.jobStep[i]!)) lucreaza++
    else merg++
    if (a.nevoi[i * NEVOI + Nevoie.FOAME]! < DEFAULT_RULES.nevoi[Nevoie.FOAME]!.prag) flamanzi++
    if (a.nevoi[i * NEVOI + Nevoie.ODIHNA]! < DEFAULT_RULES.nevoi[Nevoie.ODIHNA]!.prag) obositi++
    if (a.dispozitie[i]! < DEFAULT_RULES.dispozitiePragRefuz) refuza++
    // Avertismentul se uita la TINTA, nu la bara. Tinta se muta instantaneu,
    // deci da o fereastra reala; bara ajunge sub prag exact in tickul in care
    // pionul pleaca, deci un avertisment pe bara are fereastra ZERO.
    if (tintaDispozitiei(w, DEFAULT_RULES, i) < DEFAULT_RULES.dispozitiePragAvertisment) pleacaCurand++
  }
  let hrana = 0
  for (let i = 0; i < w.iteme.count; i++) {
    if (w.iteme.alive[i] === 1 && DEFAULT_RULES.nutritie[w.iteme.kind[i]!]! > 0) hrana += w.iteme.cantitate[i]!
  }
  return {
    idle, merg, lucreaza, cara,
    faraMuncitori: sapatori === 0 && w.desemnari.vii - w.desemnari.viiConstruieste > 0,
    faraCarausi: carausi === 0 && w.iteme.vii > 0 && w.zone.vii > 0,
    flamanzi, obositi, refuza, pleacaCurand, plecati: w.plecatiTotal,
    faraMancare: hrana === 0,
  }
}
