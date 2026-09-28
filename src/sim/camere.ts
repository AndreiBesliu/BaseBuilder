/**
 * Încăperile — S24-27, tăietura 1.
 *
 * O ÎNCĂPERE e un volum de aer închis: o componentă 6-conexă de AER ACOPERIT care nu atinge
 * aerul de sub cer. Din ea ies, în tăieturile următoare, temperatura pe un graf mic (DESIGN §5.1),
 * conservarea hranei sub 5 °C și rolul camerei. În tăietura asta simularea NU citește încăperile
 * (hash-urile nu se mișcă); le ține însă la zi în puncte fixe, fiindcă tăietura 2 va pune stare
 * PERSISTED pe ele — vezi „Cine sincronizează".
 *
 * ## Definiția
 *
 * - **Aer** = celulă cu material `AER`. Orice altceva e **hotar**: solidele (inclusiv ușa), APA,
 *   stânca de sub baza ferestrei de voxeli (convenția lui `solLa`, NU a lui `materialAt`, care spune
 *   AER acolo — altfel orice pivniță săpată până la bază ar „curge" în jos) și marginea lumii.
 *   Peste fereastră e aer.
 * - **Acoperit**: sub cel mai înalt hotar al coloanei (`varf(x, y) > z`). Apa acoperă și ea
 *   (panoul pe v1, DEF-2: cu „cel mai înalt SOLID", aerul săpat sub un iaz era „cer", iar un pod
 *   peste iaz schimba acoperirea fără ca vreo editare s-o atingă — lema de mai jos cădea).
 * - Aerul neacoperit e **cer**. O componentă e **sigilată** dacă nicio celulă a ei nu are un vecin
 *   LATERAL de cer. (Un vecin vertical de cer nu există: dacă `z` e acoperit și `z+1` e aer, atunci
 *   vârful e ≥ z+2, deci și `z+1` e acoperit — demonstrat de panou, 0 fețe verticale din 273.441.)
 * - **Fără plafon de volum.** v1 avea `cameraVolumMax`, un artefact de cost: o pivniță sigilată care
 *   trecea de el devenea „exterior", iar 20 de pivnițe legate de un coridor dispăreau toate deodată
 *   (panoul, CTR-4 / JUC-2). Pe bucăți, costul unei editări nu mai depinde de volum.
 *
 * Toate componentele de aer acoperit stau în index — sigilate (încăperi) și nesigilate, cu numărul
 * de fețe deschise: pentru temperatură, o galerie cu gura de o celulă nu e „afară" (CTR-4).
 *
 * ## Substratul: bucăți pe bloc 16×16 × z (PLAN §0.5)
 *
 * O BUCATĂ = componentă 4-conexă de aer acoperit într-o FELIE (blocul de 16×16 al regiunilor, la
 * un nivel). Muchii: laterale între felii vecine la același z, verticale între (bloc, z) și
 * (bloc, z±1) pe aceeași celulă. Componenta = componentă conexă a grafului de bucăți. O editare
 * reface feliile atinse (≤ 256 de celule fiecare) și reparcurge bucățile componentelor atinse —
 * nu volumul lor. Prototipul panoului: 1–2 ms pe o rețea sigilată de 11.550 m³, față de 13–35 ms
 * pentru inundarea pe celule a lui v1.
 *
 * ## Ce felii se refac la o editare e = (x, y, z) — lema
 *
 * O editare schimbă (i) materialul lui e și (ii) acoperirea celulelor din coloana (x, y) peste care
 * trece vârful. Nimic altceva: APA nu se creează la rulare și nu se sapă, iar `fill` pe apă o
 * înlocuiește la aceeași cotă. Celulele de AER a căror acoperire s-a schimbat într-un lot de
 * editări stau toate în rulajul de aer de DUPĂ lot, direct sub una dintre editările coloanei
 * (dacă au devenit acoperite, cel mai jos hotar de deasupra lor e nou, deci o editare, și între ele
 * e numai aer; dacă au devenit neacoperite, vârful vechi a fost săpat și de acolo în jos e numai
 * aer). Deci celulele schimbate = pentru fiecare editare, e plus rulajul de aer de sub ea, citit pe
 * terenul de acum — fără să țin vârful vechi.
 *
 * O felie se reface dacă are deja bucăți, sau dacă o celulă schimbată din ea e acum aer acoperit;
 * feliile vecine laterale se refac dacă au bucăți (fețele lor deschise s-au putut schimba). Felia
 * celulei editate se reface ÎNTOTDEAUNA când are bucăți, oricare ar fi materialul de acum — v1
 * filtra semințele la „cele care sunt aer" și lăsa încăperi-fantomă pe piatră după o umplere
 * completă (DEF-1, 30/30 runde de fuzz).
 *
 * ## Cine sincronizează
 *
 * DOAR simularea, în puncte fixe: la sfârșitul tickului și la sfârșitul comenzilor `dig` / `fill`
 * (lângă `rebuildDirty`, precedentul CONT-1). Invariant: în afara unui tick și a unei comenzi,
 * `w.camere.vazute === w.terrain.editari`. Viewer-ul și UI-ul CITESC, nu sincronizează. Panoul a
 * arătat de ce contează de acum: cu sincronizare leneșă la citire, granița unui lot o punea oricine
 * citea (overlay-ul, o salvare), iar temperatura transferată la unire / despărțire ieșea diferit
 * după cum era deschis overlay-ul (CTR-1: 4 hash-uri de temperatură pentru aceeași lume).
 * `decode` reconstruiește complet; o lume nouă n-are aer acoperit (heightfield fără surplombe).
 *
 * ## Identitatea
 *
 * Id-urile de bucată și de componentă sunt sloturi reciclate, fără sens în afara indexului.
 * ANCORA unei componente (cea mai mică celulă, ordonată (z, y, x)) e geometrică și independentă de
 * istorie; enumerarea e sortată pe ancoră. Ancora nu e identitate peste editări (o groapă în podea o
 * mută) — tăietura 2 transferă starea pe celule, în sincronizare, pe componentele aruncate.
 */

import type { Terrain } from './terrain/terrain.ts'
import { ensureChunk, JURNAL_CAP, WORLD_CELLS } from './terrain/terrain.ts'
import { CHUNK_CELLS, cellHeightCm, decodeColumn, groundLevelFromCm, Material, promotedBaseM, surfaceMatAt, VOXEL_LEVELS } from './terrain/chunk.ts'

/** Latura unei felii — blocul regiunilor. */
export const FELIE = 16
const FELIE_CELULE = FELIE * FELIE
/** Blocuri pe o axă a lumii: 16.384 / 16 = 1024. */
const BLOCURI = WORLD_CELLS / FELIE
/** Deplasarea cotei în cheie: ferestrele de voxeli coboară sub 0. */
const Z_DEPL = 512

/**
 * Cheia unei felii, ordonată (z, by, bx). Sub 2^30, deci un întreg mic în V8 (SMI): panoul a măsurat
 * cheile de celulă din `path.ts` (peste 2^31) de 1,6× mai scumpe în Map și Set (COST-10).
 */
export function cheieFelie(bx: number, by: number, z: number): number {
  return ((z + Z_DEPL) * BLOCURI + by) * BLOCURI + bx
}

export function decodeazaFelie(k: number): { bx: number; by: number; z: number } {
  const bx = k % BLOCURI
  const r = (k - bx) / BLOCURI
  const by = r % BLOCURI
  return { bx, by, z: (r - by) / BLOCURI - Z_DEPL }
}

/** Cheia globală a unei celule, ordonată (z, y, x) — ancora unei componente. */
export function cheieCelula(x: number, y: number, z: number): number {
  return ((z + Z_DEPL) * WORLD_CELLS + y) * WORLD_CELLS + x
}

export function decodeazaCelula(k: number): { x: number; y: number; z: number } {
  const x = k % WORLD_CELLS
  const r = (k - x) / WORLD_CELLS
  const y = r % WORLD_CELLS
  return { x, y, z: (r - y) / WORLD_CELLS - Z_DEPL }
}

// ---------------------------------------------------------------------------
// cititorul de coloane — trăiește o singură sincronizare
// ---------------------------------------------------------------------------

interface Coloana {
  readonly afara: boolean
  readonly base: number
  readonly mat: Uint8Array
  /** Cel mai înalt hotar din fereastră; `base − 1` dacă nu e niciunul. */
  readonly varf: number
}

const COLOANA_AFARA: Coloana = { afara: true, base: 0, mat: new Uint8Array(0), varf: Number.POSITIVE_INFINITY }

/**
 * Coloane decodate o dată pe sincronizare, apoi aruncate. Panoul a măsurat un cache persistent la
 * 40 MB pe fortăreață pentru ~10% viteză (COST-5); ce ține între sincronizări sunt doar feliile.
 */
export interface CititorCamere {
  readonly t: Terrain
  readonly col: Map<number, Coloana>
  /** Coloane decodate (de la crearea cititorului). */
  citite: number
  nepromovate: number
}

export function cititorCamere(t: Terrain): CititorCamere {
  return { t, col: new Map(), citite: 0, nepromovate: 0 }
}

function coloana(r: CititorCamere, x: number, y: number): Coloana {
  if (x < 0 || y < 0 || x >= WORLD_CELLS || y >= WORLD_CELLS) return COLOANA_AFARA
  const k = y * WORLD_CELLS + x
  const gasit = r.col.get(k)
  if (gasit) return gasit
  const cx = Math.floor(x / CHUNK_CELLS)
  const cy = Math.floor(y / CHUNK_CELLS)
  const ch = ensureChunk(r.t, cx, cy)
  const lx = x - cx * CHUNK_CELLS
  const ly = y - cy * CHUNK_CELLS
  const mat = new Uint8Array(VOXEL_LEVELS)
  r.citite++
  let base: number
  if (ch.voxels) {
    base = ch.voxels.zBaseM
    decodeColumn(ch.voxels, ly * CHUNK_CELLS + lx, mat)
  } else {
    // Un chunk nepromovat n-are aer acoperit (heightfield fără surplombe) și nici nu poate fi vecinul
    // unei celule acoperite: orice editare promovează și apronul. Se citește totuși exact ca
    // `materialAt`, ca un defect al acestei afirmații să iasă în oracol, nu în tăcere.
    r.nepromovate++
    base = promotedBaseM(ch)
    const g = groundLevelFromCm(cellHeightCm(ch, lx, ly))
    const sus = surfaceMatAt(ch, lx, ly)
    for (let l = 0; l < VOXEL_LEVELS; l++) {
      const z = base + l
      mat[l] = z > g ? Material.AER : z === g ? sus : z > g - 3 ? Material.PAMANT : Material.ROCA
    }
  }
  let varf = base - 1
  for (let l = VOXEL_LEVELS - 1; l >= 0; l--) {
    if (mat[l] !== Material.AER) {
      varf = base + l
      break
    }
  }
  const c: Coloana = { afara: false, base, mat, varf }
  r.col.set(k, c)
  return c
}

/** E AER celula? Sub bază și în afara lumii: nu (stâncă). Peste fereastră: da. */
export function esteAer(r: CititorCamere, x: number, y: number, z: number): boolean {
  const c = coloana(r, x, y)
  if (c.afara) return false
  const l = z - c.base
  if (l < 0) return false
  if (l >= VOXEL_LEVELS) return true
  return c.mat[l] === Material.AER
}

/** E celula sub cel mai înalt hotar al coloanei ei? (În afara lumii: da — e stâncă.) */
export function esteAcoperita(r: CititorCamere, x: number, y: number, z: number): boolean {
  return coloana(r, x, y).varf > z
}

export function esteAerAcoperit(r: CititorCamere, x: number, y: number, z: number): boolean {
  return esteAer(r, x, y, z) && esteAcoperita(r, x, y, z)
}

/** Aer sub cerul liber. */
export function esteCer(r: CititorCamere, x: number, y: number, z: number): boolean {
  return esteAer(r, x, y, z) && !esteAcoperita(r, x, y, z)
}

// ---------------------------------------------------------------------------
// indexul
// ---------------------------------------------------------------------------

interface Felie {
  readonly cheie: number
  /** Id-ul bucății fiecărei celule; −1 = nu e aer acoperit. */
  readonly cel: Int32Array
  /** Bucățile feliei, în ordinea creării (ordinea de parcurgere a feliei). */
  readonly bucati: number[]
}

export interface Componenta {
  readonly id: number
  /** Cea mai mică celulă, `cheieCelula` — ordinea enumerării. */
  readonly ancora: number
  readonly volum: number
  /** Fețe laterale spre cer. 0 = sigilată = încăpere. */
  readonly deschise: number
  readonly bucati: readonly number[]
}

export interface StatCamere {
  sincronizari: number
  recalculari: number
  feliiRefacute: number
  celuleScanate: number
  bucatiVizitate: number
  coloaneCitite: number
  /** Coloane citite de pe chunk-uri nepromovate. Lema apronului spune 0 în joc. */
  coloaneNepromovate: number
}

export interface IndexCamere {
  teren: Terrain | null
  /** Până unde s-a citit jurnalul terenului. */
  vazute: number
  /** Crește la fiecare sincronizare care a schimbat ceva: cheia de redesenare a viewer-ului. */
  epoca: number
  readonly felii: Map<number, Felie>
  /** Cheile feliilor, MEREU sortate: singura ordine de iterare. */
  readonly chei: number[]
  // bucățile, pe sloturi reciclate
  bFelie: Int32Array
  bCelule: Int32Array
  bDeschise: Int32Array
  /** Ancora bucății (`cheieCelula` a celei mai mici celule). Float64: cheia trece de 2^31. */
  bAncora: Float64Array
  bComp: Int32Array
  readonly bVecini: (Set<number> | undefined)[]
  readonly bLibere: number[]
  bUrmator: number
  readonly comp: Map<number, Componenta>
  readonly cLibere: number[]
  cUrmator: number
  readonly stat: StatCamere
}

export function indexCamere(t: Terrain | null = null): IndexCamere {
  return {
    teren: t,
    vazute: t ? t.editari : 0,
    epoca: 0,
    felii: new Map(),
    chei: [],
    bFelie: new Int32Array(64),
    bCelule: new Int32Array(64),
    bDeschise: new Int32Array(64),
    bAncora: new Float64Array(64),
    bComp: new Int32Array(64).fill(-1),
    bVecini: [],
    bLibere: [],
    bUrmator: 0,
    comp: new Map(),
    cLibere: [],
    cUrmator: 0,
    stat: { sincronizari: 0, recalculari: 0, feliiRefacute: 0, celuleScanate: 0, bucatiVizitate: 0, coloaneCitite: 0, coloaneNepromovate: 0 },
  }
}

function golesteIndex(idx: IndexCamere, t: Terrain): void {
  idx.teren = t
  idx.vazute = t.editari
  idx.felii.clear()
  idx.chei.length = 0
  idx.bFelie = new Int32Array(64)
  idx.bCelule = new Int32Array(64)
  idx.bDeschise = new Int32Array(64)
  idx.bAncora = new Float64Array(64)
  idx.bComp = new Int32Array(64).fill(-1)
  idx.bVecini.length = 0
  idx.bLibere.length = 0
  idx.bUrmator = 0
  idx.comp.clear()
  idx.cLibere.length = 0
  idx.cUrmator = 0
}

function pozitie(lista: readonly number[], k: number): number {
  let lo = 0
  let hi = lista.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (lista[mid]! < k) lo = mid + 1
    else hi = mid
  }
  return lo
}

function crestePiese(idx: IndexCamere, n: number): void {
  if (n <= idx.bFelie.length) return
  const m = Math.max(n, idx.bFelie.length * 2)
  const creste32 = (a: Int32Array, umple: number): Int32Array => {
    const b = new Int32Array(m).fill(umple)
    b.set(a)
    return b
  }
  idx.bFelie = creste32(idx.bFelie, 0)
  idx.bCelule = creste32(idx.bCelule, 0)
  idx.bDeschise = creste32(idx.bDeschise, 0)
  idx.bComp = creste32(idx.bComp, -1)
  const a = new Float64Array(m)
  a.set(idx.bAncora)
  idx.bAncora = a
}

/** Un slot de bucată. LIFO: ordinea e determinată de istoria indexului, și nu iese din el. */
function alocaBucata(idx: IndexCamere): number {
  const id = idx.bLibere.length > 0 ? idx.bLibere.pop()! : idx.bUrmator++
  crestePiese(idx, id + 1)
  idx.bComp[id] = -1
  idx.bCelule[id] = 0
  idx.bDeschise[id] = 0
  idx.bVecini[id] = new Set()
  return id
}

function leaga(idx: IndexCamere, a: number, b: number): void {
  if (a === b) return
  idx.bVecini[a]!.add(b)
  idx.bVecini[b]!.add(a)
}

/**
 * Scoate o bucată: muchiile ei dispar din AMBELE capete, vecinii care rămân intră în `atinse` (componenta
 * lor trebuie reparcursă), iar componenta ei, în `moarte`.
 */
function stergeBucata(idx: IndexCamere, id: number, atinse: Set<number>, moarte: Set<number>): void {
  const v = idx.bVecini[id]!
  // determinism-ok: doar sterge si adauga intr-o multime; rezultatul nu depinde de ordine.
  for (const q of v) {
    idx.bVecini[q]!.delete(id)
    atinse.add(q)
  }
  idx.bVecini[id] = undefined
  const c = idx.bComp[id]!
  if (c >= 0) moarte.add(c)
  idx.bComp[id] = -1
  atinse.delete(id)
  idx.bLibere.push(id)
}

const coadaFelie = new Int32Array(FELIE_CELULE)

/**
 * Reface o felie: bucățile vechi dispar, se recalculează aerul acoperit, bucățile noi primesc fețele
 * deschise și se leagă de bucățile existente din feliile vecine (lateral la același z, vertical la z±1).
 * O felie vecină refăcută MAI TÂRZIU în aceeași sincronizare își scoate bucățile vechi (și muchiile
 * spre cele de aici) și se leagă din nou — deci ordinea refacerii nu contează.
 */
function refaFelie(idx: IndexCamere, r: CititorCamere, cheie: number, noi: number[], atinse: Set<number>, moarte: Set<number>): void {
  idx.stat.feliiRefacute++
  const veche = idx.felii.get(cheie)
  if (veche) {
    for (const id of veche.bucati) stergeBucata(idx, id, atinse, moarte)
    idx.felii.delete(cheie)
    idx.chei.splice(pozitie(idx.chei, cheie), 1)
  }
  const { bx, by, z } = decodeazaFelie(cheie)
  const x0 = bx * FELIE
  const y0 = by * FELIE
  const ok = new Uint8Array(FELIE_CELULE)
  let are = false
  for (let ly = 0; ly < FELIE; ly++) {
    for (let lx = 0; lx < FELIE; lx++) {
      idx.stat.celuleScanate++
      if (esteAerAcoperit(r, x0 + lx, y0 + ly, z)) {
        ok[ly * FELIE + lx] = 1
        are = true
      }
    }
  }
  if (!are) return

  const cel = new Int32Array(FELIE_CELULE).fill(-1)
  const f: Felie = { cheie, cel, bucati: [] }
  for (let s = 0; s < FELIE_CELULE; s++) {
    if (ok[s] === 0 || cel[s] !== -1) continue
    const id = alocaBucata(idx)
    idx.bFelie[id] = cheie
    // `s` e prima celulă a bucății în ordinea (ly, lx) a feliei, deci cea mai mică: ancora.
    idx.bAncora[id] = cheieCelula(x0 + (s % FELIE), y0 + ((s / FELIE) | 0), z)
    let n = 0
    let deschise = 0
    let cap = 0
    let coada = 0
    coadaFelie[coada++] = s
    cel[s] = id
    while (cap < coada) {
      const a = coadaFelie[cap++]!
      n++
      const lx = a % FELIE
      const ly = (a / FELIE) | 0
      const x = x0 + lx
      const y = y0 + ly
      // Fețele deschise sunt numai laterale (antet).
      if (esteCer(r, x + 1, y, z)) deschise++
      if (esteCer(r, x - 1, y, z)) deschise++
      if (esteCer(r, x, y + 1, z)) deschise++
      if (esteCer(r, x, y - 1, z)) deschise++
      if (lx > 0 && ok[a - 1] === 1 && cel[a - 1] === -1) { cel[a - 1] = id; coadaFelie[coada++] = a - 1 }
      if (lx < FELIE - 1 && ok[a + 1] === 1 && cel[a + 1] === -1) { cel[a + 1] = id; coadaFelie[coada++] = a + 1 }
      if (ly > 0 && ok[a - FELIE] === 1 && cel[a - FELIE] === -1) { cel[a - FELIE] = id; coadaFelie[coada++] = a - FELIE }
      if (ly < FELIE - 1 && ok[a + FELIE] === 1 && cel[a + FELIE] === -1) { cel[a + FELIE] = id; coadaFelie[coada++] = a + FELIE }
    }
    idx.bCelule[id] = n
    idx.bDeschise[id] = deschise
    f.bucati.push(id)
    noi.push(id)
  }
  idx.felii.set(cheie, f)
  idx.chei.splice(pozitie(idx.chei, cheie), 0, cheie)

  // Muchiile spre bucățile existente: vertical în aceeași coloană, lateral peste marginea blocului.
  const jos = idx.felii.get(cheieFelie(bx, by, z - 1))
  const sus = idx.felii.get(cheieFelie(bx, by, z + 1))
  const vest = bx > 0 ? idx.felii.get(cheieFelie(bx - 1, by, z)) : undefined
  const est = bx < BLOCURI - 1 ? idx.felii.get(cheieFelie(bx + 1, by, z)) : undefined
  const sud = by > 0 ? idx.felii.get(cheieFelie(bx, by - 1, z)) : undefined
  const nord = by < BLOCURI - 1 ? idx.felii.get(cheieFelie(bx, by + 1, z)) : undefined
  for (let s = 0; s < FELIE_CELULE; s++) {
    const id = cel[s]!
    if (id === -1) continue
    if (jos && jos.cel[s]! !== -1) leaga(idx, id, jos.cel[s]!)
    if (sus && sus.cel[s]! !== -1) leaga(idx, id, sus.cel[s]!)
    const lx = s % FELIE
    const ly = (s / FELIE) | 0
    if (lx === 0 && vest && vest.cel[s + FELIE - 1]! !== -1) leaga(idx, id, vest.cel[s + FELIE - 1]!)
    if (lx === FELIE - 1 && est && est.cel[s - FELIE + 1]! !== -1) leaga(idx, id, est.cel[s - FELIE + 1]!)
    if (ly === 0 && sud && sud.cel[s + FELIE_CELULE - FELIE]! !== -1) leaga(idx, id, sud.cel[s + FELIE_CELULE - FELIE]!)
    if (ly === FELIE - 1 && nord && nord.cel[s - FELIE_CELULE + FELIE]! !== -1) leaga(idx, id, nord.cel[s - FELIE_CELULE + FELIE]!)
  }
}

/**
 * Reparcurge componentele care conțin semințele. Fiecare parcurgere acoperă o componentă întreagă,
 * deci o componentă veche atinsă (prin orice bucată) moare întreagă și renaște din parcurgeri; cele
 * neatinse își păstrează id-ul și lista. Id-urile moarte se eliberează DUPĂ parcurgeri, ca un id nou
 * să nu poată fi confundat cu unul care tocmai a murit.
 */
function componente(idx: IndexCamere, seminte: readonly number[], moarte: Set<number>): void {
  const vazut = new Set<number>()
  const coada: number[] = []
  for (const s of seminte) {
    if (vazut.has(s) || idx.bVecini[s] === undefined) continue
    const id = idx.cLibere.length > 0 ? idx.cLibere.pop()! : idx.cUrmator++
    const bucati: number[] = []
    let volum = 0
    let deschise = 0
    let ancora = Number.POSITIVE_INFINITY
    vazut.add(s)
    coada.length = 0
    coada.push(s)
    while (coada.length > 0) {
      const p = coada.pop()!
      idx.stat.bucatiVizitate++
      const vechi = idx.bComp[p]!
      if (vechi >= 0 && vechi !== id) moarte.add(vechi)
      idx.bComp[p] = id
      bucati.push(p)
      volum += idx.bCelule[p]!
      deschise += idx.bDeschise[p]!
      if (idx.bAncora[p]! < ancora) ancora = idx.bAncora[p]!
      // determinism-ok: ordinea parcurgerii nu schimba componenta; atributele sunt sume si minime.
      for (const q of idx.bVecini[p]!) {
        if (!vazut.has(q)) {
          vazut.add(q)
          coada.push(q)
        }
      }
    }
    bucati.sort((a, b) => a - b)
    idx.comp.set(id, { id, ancora, volum, deschise, bucati })
    moarte.delete(id)
  }
  for (const c of [...moarte].sort((a, b) => a - b)) {
    if (idx.comp.delete(c)) idx.cLibere.push(c)
  }
}

/**
 * Recalculul complet: aerul acoperit se enumeră pe coloanele chunk-urilor promovate (un chunk
 * nepromovat n-are), apoi se refac feliile care îl conțin, în ordinea cheilor, apoi componentele.
 */
export function reconstruiesteCamere(idx: IndexCamere, t: Terrain): void {
  golesteIndex(idx, t)
  idx.stat.recalculari++
  const felii = new Set<number>()
  const buf = new Uint8Array(VOXEL_LEVELS)
  for (const k of t.keys) {
    const ch = t.chunks.get(k)!
    const v = ch.voxels
    if (!v) continue
    for (let col = 0; col < CHUNK_CELLS * CHUNK_CELLS; col++) {
      decodeColumn(v, col, buf)
      let varf = -1
      for (let l = VOXEL_LEVELS - 1; l >= 0; l--) {
        if (buf[l] !== Material.AER) {
          varf = l
          break
        }
      }
      if (varf <= 0) continue
      const x = ch.cx * CHUNK_CELLS + (col % CHUNK_CELLS)
      const y = ch.cy * CHUNK_CELLS + ((col / CHUNK_CELLS) | 0)
      const bx = Math.floor(x / FELIE)
      const by = Math.floor(y / FELIE)
      for (let l = 0; l < varf; l++) if (buf[l] === Material.AER) felii.add(cheieFelie(bx, by, v.zBaseM + l))
    }
  }
  const r = cititorCamere(t)
  const noi: number[] = []
  const atinse = new Set<number>()
  const moarte = new Set<number>()
  for (const cheie of [...felii].sort((a, b) => a - b)) {
    refaFelie(idx, r, cheie, noi, atinse, moarte)
    // Terenul nu se schimbă în recalcul: cititorul se poate goli oricând, ca memoria să rămână
    // mărginită pe o așezare mare (107.307 de coloane pe fortăreața panoului).
    if (r.col.size > 8192) r.col.clear()
  }
  componente(idx, noi, moarte)
  idx.stat.coloaneCitite += r.citite
  idx.stat.coloaneNepromovate += r.nepromovate
  idx.epoca++
}

/** Un index nou, construit complet pe teren (încărcare, teste). */
export function construiesteCamere(t: Terrain): IndexCamere {
  const idx = indexCamere(t)
  reconstruiesteCamere(idx, t)
  return idx
}

/**
 * Aduce indexul la zi cu jurnalul terenului. Se cheamă DOAR din punctele fixe ale simulării
 * (sfârșitul tickului, sfârșitul comenzilor de teren) — vezi antetul.
 */
export function sincronizeazaCamere(idx: IndexCamere, t: Terrain): void {
  if (idx.teren !== t) {
    reconstruiesteCamere(idx, t)
    return
  }
  const n = t.editari - idx.vazute
  if (n === 0) return
  if (n < 0 || n > JURNAL_CAP) {
    reconstruiesteCamere(idx, t)
    return
  }
  idx.stat.sincronizari++
  const r = cititorCamere(t)
  const murdare = new Set<number>()
  const areFelie = (x: number, y: number, z: number): boolean => idx.felii.has(cheieFelie(Math.floor(x / FELIE), Math.floor(y / FELIE), z))
  const inLume = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < WORLD_CELLS && y < WORLD_CELLS
  for (let i = idx.vazute; i < t.editari; i++) {
    const j = (i % JURNAL_CAP) * 3
    const x = t.jurnal[j]!
    const y = t.jurnal[j + 1]!
    const z = t.jurnal[j + 2]!
    // Celulele schimbate: e și rulajul de aer de sub ea, pe terenul de acum (lema din antet).
    let jos = z
    while (esteAer(r, x, y, jos - 1)) jos--
    const bx = Math.floor(x / FELIE)
    const by = Math.floor(y / FELIE)
    for (let zz = jos; zz <= z; zz++) {
      if (areFelie(x, y, zz) || esteAerAcoperit(r, x, y, zz)) murdare.add(cheieFelie(bx, by, zz))
      for (const [dx, dy] of VECINI_LATERALI) {
        const nx = x + dx
        const ny = y + dy
        if (!inLume(nx, ny)) continue
        const nbx = Math.floor(nx / FELIE)
        const nby = Math.floor(ny / FELIE)
        if (nbx === bx && nby === by) continue
        if (areFelie(nx, ny, zz)) murdare.add(cheieFelie(nbx, nby, zz))
      }
    }
  }
  idx.vazute = t.editari
  if (murdare.size === 0) {
    idx.stat.coloaneCitite += r.citite
    idx.stat.coloaneNepromovate += r.nepromovate
    return
  }
  const noi: number[] = []
  const atinse = new Set<number>()
  const moarte = new Set<number>()
  for (const cheie of [...murdare].sort((a, b) => a - b)) refaFelie(idx, r, cheie, noi, atinse, moarte)
  const seminte = [...noi, ...[...atinse].sort((a, b) => a - b)]
  componente(idx, seminte, moarte)
  idx.stat.coloaneCitite += r.citite
  idx.stat.coloaneNepromovate += r.nepromovate
  idx.epoca++
}

const VECINI_LATERALI = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

// ---------------------------------------------------------------------------
// citirea
// ---------------------------------------------------------------------------

/** Bucata celulei (x, y, z), sau −1. */
export function bucataLa(idx: IndexCamere, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || x >= WORLD_CELLS || y >= WORLD_CELLS) return -1
  const bx = Math.floor(x / FELIE)
  const by = Math.floor(y / FELIE)
  const f = idx.felii.get(cheieFelie(bx, by, z))
  if (!f) return -1
  return f.cel[(y - by * FELIE) * FELIE + (x - bx * FELIE)]!
}

/** Componenta de aer acoperit a celulei (x, y, z), sau null (nu e aer acoperit). */
export function componentaLa(idx: IndexCamere, x: number, y: number, z: number): Componenta | null {
  const b = bucataLa(idx, x, y, z)
  if (b < 0) return null
  return idx.comp.get(idx.bComp[b]!) ?? null
}

export function esteIncapere(c: Componenta): boolean {
  return c.deschise === 0
}

/** Toate componentele, sortate pe ancoră. */
export function listaComponente(idx: IndexCamere): Componenta[] {
  return [...idx.comp.values()].sort((a, b) => a.ancora - b.ancora)
}

/** Celulele unei componente, ca `cheieCelula`, sortate. O(volum + 256 × bucăți). */
export function celuleComponentei(idx: IndexCamere, c: Componenta): number[] {
  const out: number[] = []
  for (const b of c.bucati) {
    const f = idx.felii.get(idx.bFelie[b]!)!
    const { bx, by, z } = decodeazaFelie(f.cheie)
    for (let s = 0; s < FELIE_CELULE; s++) {
      if (f.cel[s] === b) out.push(cheieCelula(bx * FELIE + (s % FELIE), by * FELIE + ((s / FELIE) | 0), z))
    }
  }
  return out.sort((a, b) => a - b)
}

/**
 * Celulele de aer acoperit de la nivelul z, cu componenta lor, în ordinea cheilor de felie. Pentru
 * overlay: cheile sunt sortate pe (z, by, bx), deci nivelul e un interval contiguu.
 */
export function celuleLaNivel(idx: IndexCamere, z: number, cb: (x: number, y: number, c: Componenta) => void): void {
  const lo = pozitie(idx.chei, cheieFelie(0, 0, z))
  const hi = pozitie(idx.chei, cheieFelie(0, 0, z + 1))
  for (let i = lo; i < hi; i++) {
    const f = idx.felii.get(idx.chei[i]!)!
    const { bx, by } = decodeazaFelie(f.cheie)
    for (let s = 0; s < FELIE_CELULE; s++) {
      const b = f.cel[s]!
      if (b < 0) continue
      const c = idx.comp.get(idx.bComp[b]!)
      if (c) cb(bx * FELIE + (s % FELIE), by * FELIE + ((s / FELIE) | 0), c)
    }
  }
}

/**
 * Forma canonică: componentele sortate pe ancoră, fiecare cu volumul, fețele deschise și o amprentă a
 * celulelor. Oracolul oricărei implementări: incremental == recalcul complet, pe aceeași lume.
 */
export function formaCanonica(idx: IndexCamere): string[] {
  return listaComponente(idx).map((c) => {
    let h = 0x811c9dc5
    for (const k of celuleComponentei(idx, c)) {
      // FNV-1a pe cele două jumătăți ale cheii (trece de 2^32).
      const lo = k % 0x100000000
      const hi = Math.floor(k / 0x100000000)
      h = Math.imul(h ^ lo, 0x01000193) >>> 0
      h = Math.imul(h ^ hi, 0x01000193) >>> 0
    }
    return `${c.ancora}:${c.volum}:${c.deschise}:${h.toString(16)}`
  })
}
