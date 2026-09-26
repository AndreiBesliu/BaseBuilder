/**
 * Accesul vertical — S20-23, taietura 5.
 *
 * Intrebarea de aici: poate un pion sa lucreze din celula c FARA sa ramana blocat cand
 * se termina planul? Masurat pe HEAD inainte de taietura: un pion ramanea pe creasta
 * unei camere fara usa pe 3 din 3 seminte (urcase pe randul 1 ca sa zideasca randul 2 al
 * vecinului); pe corpusul panoului de design, 124 de pioni blocati in 465 de rulari.
 *
 * ## Definitii (design v3, dupa doua panouri)
 *
 *   W = terenul de acum;  C = santierele vii (desemnari CONSTRUIESTE);  F = W ∪ C.
 *   Z = piese zidite IPOTETIC (⊆ C) — previzualizarea si privirea inainte.
 *   O celula e STABILA daca se poate sta pe ea in W ∪ Z si in F.
 *   O componenta a grafului stabil (pasi ortogonali <= `maxStepM`) e DESCHISA daca are
 *   cel putin `accesPlafonNatural` celule cu podea naturala, sau peste
 *   `accesPlafonTotal` celule. Altfel e o PUNGA.
 *   O celula e SIGURA daca e stabila si componenta ei e deschisa.
 *
 * ## De ce „stabila", si de ce raspunsul nu depinde de istorie
 *
 * Prima versiune a designului masura „exteriorul" pe desemnarile RAMASE (clustere, cutii,
 * inele): o zidire nu schimba F, dar strangea cutia, deci memoria retinea un raspuns pe
 * care recalculul nu-l mai dadea — M5 cu save la fiecare tick, 1.087 de rosii din 1.200.
 * Aici raspunsul e o functie PURA de (W, C, Z, reguli).
 *
 * **Teorema pe care sta totul** (probata cu test, si de panou pe 7.075.388 de verificari):
 * cat timp se zidesc doar piese din C, multimea stabila doar CRESTE si componentele ei
 * doar se UNESC. Zidirea lui p ∈ C: p nu era stabila (e solida in F); celula de deasupra
 * poate deveni calcabila in W; celulele de sub p, in limita capului, nu erau calcabile in
 * F. Deci un pion pe o celula sigura ramane pe o celula sigura cat timp se executa planul.
 *
 * ## De ce doua praguri, si de ce e o proprietate a COMPONENTEI
 *
 * Flood-ul se opreste la primul prag atins: `naturale >= accesPlafonNatural` dovedeste
 * ca K are atatea celule naturale, `total > accesPlafonTotal` ca K e atat de mare; iar
 * epuizarea cunoaste K integral. Fiecare oprire e o dovada despre K, nu despre celula de
 * start — deci eticheta nu depinde de ordinea intrebarilor. Pragul natural deosebeste
 * „afara" de un acoperis mare fara scara (acolo nicio podea nu e naturala); cel total e
 * plafonul costului.
 *
 * Limitele, pentru jucator: o curte inchisa cu podea naturala de peste ~45×45 conteaza ca
 * „afara"; un acoperis fara scara de peste 8.192 de celule la fel.
 */

import type { Rules } from './content.ts'
import type { Terrain } from './terrain/terrain.ts'
import { ensureChunk, JURNAL_CAP, materialAt, WORLD_CELLS } from './terrain/terrain.ts'
import {
  cellHeightCm,
  CHUNK_CELLS,
  esteMaterialDeStructura,
  groundLevelFromCm,
  isSolid,
  Material,
  promotedBaseM,
  surfaceMatAt,
  VOXEL_LEVELS,
} from './terrain/chunk.ts'
import { cellKey } from './path.ts'
import { Desemnare, desemnareLaCelula, JURNAL_DESEMNARI_CAP } from './desemnari.ts'
import type { DesignationStore } from './desemnari.ts'

// ---------------------------------------------------------------------------
// felul muncii — decide nivelurile si vecinatatea locului de lucru
// ---------------------------------------------------------------------------

/**
 * FELUL muncii facute dintr-o celula de lucru. Decide nivelurile si vecinatatea in
 * `celulaDeLucru`, deci fiecare apelant il spune EXPLICIT — prima versiune a
 * accesului vertical avea felul doar la scaner, iar ridicarea, refacerea locului si
 * testele-oracol chemau forma de sapat pentru un santier de construit.
 *
 *   SAPA           — un voxel natural (roca, pamant, iarba, moloz);
 *   DECONSTRUIESTE — sapatul unui voxel din material de STRUCTURA (ce s-a zidit);
 *   CONSTRUIESTE   — un santier de zidit;
 *   DOARME         — locul de langa un santier pe care un pion ar fi adormit.
 */
export const FelLucru = {
  SAPA: 0,
  DECONSTRUIESTE: 1,
  CONSTRUIESTE: 2,
  DOARME: 3,
} as const
export type FelLucruId = (typeof FelLucru)[keyof typeof FelLucru]

/** Felul sapatului la (wx, wy, z): dupa materialul de ACOLO, nu dupa cine l-a cerut. */
export function felSapa(t: Terrain, wx: number, wy: number, z: number): FelLucruId {
  const m = materialAt(t, wx, wy, z)
  return m.ok && esteMaterialDeStructura(m.value) ? FelLucru.DECONSTRUIESTE : FelLucru.SAPA
}

/** Felul muncii pe o desemnare vie: santier de zidit, sau sapat dupa material. */
export function felDesemnare(t: Terrain, d: DesignationStore, ds: number): FelLucruId {
  return d.kind[ds] === Desemnare.CONSTRUIESTE ? FelLucru.CONSTRUIESTE : felSapa(t, d.wx[ds]!, d.wy[ds]!, d.z[ds]!)
}

const DIR4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
/**
 * Diagonalele DUPA ortogonale. Fara ele, coltul unui zid de etaj n-are niciun loc de lucru:
 * vecinii lui ortogonali sunt doi pereti planificati si aer fara podea, iar interiorul e pe
 * diagonala. Masurat de panou: 288 din 288 de colturi de etaj fara acces; cu diagonala, 36.
 */
const DIR8: readonly (readonly [number, number])[] = [...DIR4, [1, 1], [-1, 1], [1, -1], [-1, -1]]

/** Vecinii din care se lucreaza, dupa fel. Zidirea si deconstructia ajung si pe diagonala. */
export function vecinatate(fel: FelLucruId): readonly (readonly [number, number])[] {
  return fel === FelLucru.CONSTRUIESTE || fel === FelLucru.DECONSTRUIESTE ? DIR8 : DIR4
}

/**
 * Nivelurile de STAT `zs − z` pentru o tinta la `z`, in ordinea incercarii: intai
 * acelasi nivel, apoi pe rand +1, −1, +2, −2… Zidirea si deconstructia ajung in sus
 * pana la `atingereSusM` (pionul sta mai jos si intinde mana pana deasupra capului);
 * in jos si la sapat, cat un pas.
 */
export function niveluriDeLucru(fel: FelLucruId, rules: Rules): number[] {
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const sus = pas
  const jos = fel === FelLucru.CONSTRUIESTE || fel === FelLucru.DECONSTRUIESTE ? Math.max(pas, rules.atingereSusM) : pas
  const out = [0]
  for (let k = 1; k <= Math.max(sus, jos); k++) {
    if (k <= sus) out.push(k)
    if (k <= jos) out.push(-k)
  }
  return out
}

// ---------------------------------------------------------------------------
// citirea pe coloana
// ---------------------------------------------------------------------------

/**
 * O coloana citita o data. Un flood de 2.048 de celule intreaba de ~12 ori pe celula
 * (4 vecini × 3 niveluri) si de 3 ori pe intrebare (celula, podea, cap): pe `materialAt`
 * cu `Outcome` alocat la fiecare citire, panoul a masurat costul de 4× mai mare.
 *
 * Spune EXACT ce spune `materialAt` / `materialFast`: in afara lumii ROCA peste tot; pe un
 * chunk promovat, fereastra de voxeli si aer in afara ei; pe unul nepromovat, derivat din
 * heightfield, cu aer sub baza pe care ar avea-o dupa promovare.
 */
interface Coloana {
  afara: boolean
  base: number
  mat: Uint8Array
}

/** Cache de coloane pentru O serie de intrebari intre care terenul nu se schimba. */
export interface Cititor {
  readonly t: Terrain
  readonly col: Map<number, Coloana>
}

export function cititor(t: Terrain): Cititor {
  return { t, col: new Map() }
}

const COLOANA_AFARA: Coloana = { afara: true, base: 0, mat: new Uint8Array(0) }

function coloana(r: Cititor, wx: number, wy: number): Coloana {
  if (wx < 0 || wy < 0 || wx >= WORLD_CELLS || wy >= WORLD_CELLS) return COLOANA_AFARA
  const k = wy * WORLD_CELLS + wx
  const gasit = r.col.get(k)
  if (gasit) return gasit
  const cx = Math.floor(wx / CHUNK_CELLS)
  const cy = Math.floor(wy / CHUNK_CELLS)
  const ch = ensureChunk(r.t, cx, cy)
  const lx = wx - cx * CHUNK_CELLS
  const ly = wy - cy * CHUNK_CELLS
  const mat = new Uint8Array(VOXEL_LEVELS)
  const v = ch.voxels
  let base: number
  if (v) {
    base = v.zBaseM
    let z = 0
    const col = ly * CHUNK_CELLS + lx
    const end = v.columnStart[col + 1]!
    for (let run = v.columnStart[col]!; run < end && z < VOXEL_LEVELS; run++) {
      const m = v.runMaterial[run]!
      const len = v.runLength[run]!
      for (let i = 0; i < len && z < VOXEL_LEVELS; i++) mat[z++] = m
    }
    // o coloana care nu acopera toate nivelurile se termina in aer (AER = 0)
  } else {
    base = promotedBaseM(ch)
    const g = groundLevelFromCm(cellHeightCm(ch, lx, ly))
    const sus = surfaceMatAt(ch, lx, ly)
    for (let l = 0; l < VOXEL_LEVELS; l++) {
      const z = base + l
      mat[l] = z > g ? Material.AER : z === g ? sus : z > g - 3 ? Material.PAMANT : Material.ROCA
    }
  }
  const c: Coloana = { afara: false, base, mat }
  r.col.set(k, c)
  return c
}

/** Materialul la (wx, wy, z), prin cache. Egal cu `materialFast` (testat pe coloane intregi). */
export function materialCitit(r: Cititor, wx: number, wy: number, z: number): number {
  const c = coloana(r, wx, wy)
  if (c.afara) return Material.ROCA
  const l = z - c.base
  return l < 0 || l >= VOXEL_LEVELS ? Material.AER : c.mat[l]!
}

// ---------------------------------------------------------------------------
// lumea si grafurile
// ---------------------------------------------------------------------------

/**
 * Lumea pe care se intreaba: terenul W, planul C (solid in F) si piesele zidite ipotetic Z
 * (solide si in W; Z ⊆ C). `zidite = null` = nicio ipoteza — cazul scanerului.
 */
export interface LumeAcces {
  readonly t: Terrain
  readonly plan: ReadonlySet<number>
  readonly zidite: ReadonlySet<number> | null
  /** O piesa zidita in plus peste Z (privirea inainte), fara copia lui Z. */
  readonly inPlus?: number
}

function ziditaIpotetic(Z: ReadonlySet<number> | null, inPlus: number, k: number): boolean {
  return k === inPlus || (Z !== null && Z.has(k))
}

/** Un graf de celule pe care se poate sta, cu intrebarea „podeaua e naturala?". */
export interface Nod {
  calcabila(x: number, y: number, z: number): boolean
  naturala(x: number, y: number, z: number): boolean
}

/**
 * Graful STABIL: calcabil in W ∪ Z si in F = W ∪ C.
 *
 * Desfacut: celula libera in W si nu in C (Z ⊆ C); podea solida in W sau in Z (atunci e
 * solida si in F); capul liber in W si in afara lui C. Apa nu e calcabila, ca in
 * `isWalkable`.
 */
export function nodStabil(l: LumeAcces, rules: Rules, r: Cititor = cititor(l.t)): Nod {
  const H = rules.agentHeadroomM
  const C = l.plan
  const Z = l.zidite
  const inPlus = l.inPlus ?? -1
  return {
    calcabila(x, y, z) {
      const m = materialCitit(r, x, y, z)
      if (isSolid(m) || m === Material.APA) return false
      // Afara din lume materialul e ROCA, deci n-am ajuns aici: cheia e injectiva.
      if (C.has(cellKey(x, y, z))) return false
      if (!isSolid(materialCitit(r, x, y, z - 1)) && !ziditaIpotetic(Z, inPlus, cellKey(x, y, z - 1))) return false
      for (let h = 1; h < H; h++) {
        if (isSolid(materialCitit(r, x, y, z + h)) || C.has(cellKey(x, y, z + h))) return false
      }
      return true
    },
    // O piesa din Z e AER in terenul real (santierele stau pe celule goale — `desemneaza`
    // refuza o celula plina), deci podeaua ei iese nenaturala fara nicio verificare in plus.
    naturala(x, y, z) {
      const m = materialCitit(r, x, y, z - 1)
      return isSolid(m) && !esteMaterialDeStructura(m)
    },
  }
}

/**
 * Graful lui W ∪ E, cu E o multime de celule facute solide (piese, deci de structura).
 * `E = null` e W insusi. E graful regulii de sigilare: „ce se intampla daca zidesc p".
 */
export function nodW(t: Terrain, extra: ReadonlySet<number> | null, rules: Rules, r: Cititor = cititor(t)): Nod {
  const H = rules.agentHeadroomM
  const solid = (x: number, y: number, z: number): boolean =>
    isSolid(materialCitit(r, x, y, z)) || (extra !== null && extra.has(cellKey(x, y, z)))
  return {
    calcabila(x, y, z) {
      const m = materialCitit(r, x, y, z)
      if (isSolid(m) || m === Material.APA) return false
      if (extra !== null && extra.has(cellKey(x, y, z))) return false
      if (!solid(x, y, z - 1)) return false
      for (let h = 1; h < H; h++) if (solid(x, y, z + h)) return false
      return true
    },
    naturala(x, y, z) {
      const m = materialCitit(r, x, y, z - 1)
      return isSolid(m) && !esteMaterialDeStructura(m)
    },
  }
}

// ---------------------------------------------------------------------------
// componenta
// ---------------------------------------------------------------------------

export interface Componenta {
  /** Deschisa: dovedit cel putin `accesPlafonNatural` celule naturale, sau peste `accesPlafonTotal`. */
  readonly deschisa: boolean
  readonly total: number
  readonly naturale: number
  /**
   * Celulele VIZITATE, in ordinea BFS. La o componenta inchisa: toata componenta. La una
   * deschisa: doar cat a trebuit ca sa se dovedeasca.
   */
  readonly celule: number[]
  /** Cutia celulelor vizitate — baza cutiei de dependenta a memoriei. */
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
  readonly z0: number
  readonly z1: number
}

/**
 * Componenta celulei (x, y, z) in graful `nod`, oprita la primul prag. Celula de start
 * TREBUIE sa fie calcabila in graf (apelantul intreaba intai).
 *
 * Muchiile sunt ale lui `canStep`: vecin ORTOGONAL, ambele calcabile, `|dz| <= maxStepM`.
 * Ordinea de vizitare e fixa (coada, directii si niveluri in ordine fixa), dar raspunsul nu
 * depinde de ea — vezi antetul.
 */
export function componenta(nod: Nod, rules: Rules, x: number, y: number, z: number): Componenta {
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const pragN = rules.accesPlafonNatural
  const pragT = rules.accesPlafonTotal
  const vazute = new Set<number>()
  const celule: number[] = []
  const coada: number[] = [x, y, z]
  vazute.add(cellKey(x, y, z))
  celule.push(cellKey(x, y, z))
  let naturale = nod.naturala(x, y, z) ? 1 : 0
  let x0 = x, x1 = x, y0 = y, y1 = y, z0 = z, z1 = z
  let deschisa = naturale >= pragN || celule.length > pragT
  for (let h = 0; h < coada.length && !deschisa; h += 3) {
    const cx = coada[h]!, cy = coada[h + 1]!, cz = coada[h + 2]!
    for (const [dx, dy] of DIR4) {
      const nx = cx + dx, ny = cy + dy
      for (let dz = -pas; dz <= pas && !deschisa; dz++) {
        const nz = cz + dz
        if (!nod.calcabila(nx, ny, nz)) continue
        const k = cellKey(nx, ny, nz)
        if (vazute.has(k)) continue
        vazute.add(k)
        celule.push(k)
        coada.push(nx, ny, nz)
        if (nod.naturala(nx, ny, nz)) naturale++
        if (nx < x0) x0 = nx
        if (nx > x1) x1 = nx
        if (ny < y0) y0 = ny
        if (ny > y1) y1 = ny
        if (nz < z0) z0 = nz
        if (nz > z1) z1 = nz
        if (naturale >= pragN || celule.length > pragT) deschisa = true
      }
      if (deschisa) break
    }
  }
  return { deschisa, total: celule.length, naturale, celule, x0, x1, y0, y1, z0, z1 }
}

/** SIGURA, fara memorie: stabila si in componenta deschisa. Oracolul memoriei din `World`. */
export function esteSiguraPur(l: LumeAcces, rules: Rules, x: number, y: number, z: number, r: Cititor = cititor(l.t)): boolean {
  const nod = nodStabil(l, rules, r)
  if (!nod.calcabila(x, y, z)) return false
  return componenta(nod, rules, x, y, z).deschisa
}

// ---------------------------------------------------------------------------
// memoria din lume
// ---------------------------------------------------------------------------

/** Un flood retinut: concluzia, celulele etichetate si cutia din care a CITIT. */
interface FloodMemorat {
  readonly deschisa: boolean
  readonly celule: number[]
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
  readonly z0: number
  readonly z1: number
}

/**
 * TRANSIENT — raspunsurile de siguranta ale scanerului, pe (teren, santiere, reguli).
 *
 * O FUNCTIE PURA de (W, C, reguli), tinuta ieftin: nu decide nimic ce n-ar decide calculul
 * de la zero, iar o lume incarcata porneste goala. Prima forma din design retinea un
 * raspuns peste o zidire („editarea neutra") pe care recalculul nu-l mai dadea, si M5 cu
 * save la fiecare tick iesea rosu de 1.087 de ori din 1.200. Aici nu se retine nimic peste
 * o schimbare care ar putea atinge raspunsul.
 *
 * Invalidarea e pe FLOOD, nu pe lume: o editare (din jurnalul terenului sau al
 * santierelor) sterge doar flood-urile a caror cutie de dependenta o contine. Cutia e
 * cutia celulelor vizitate, largita cu cat CITESTE graful: ±1 pe orizontala (vecinii),
 * iar pe verticala de la `z0 − maxStepM − 1` (podeaua vecinului de sub pas) la
 * `z1 + maxStepM + agentHeadroomM − 1` (capul vecinului de peste pas). Designul v2 avea
 * [−1, +H]: panoul a gasit o umplere pe fundul unui sant de 2 m care nu golea memoria,
 * cu 180 de celule declarate sigure pe care recalculul le refuza.
 */
export interface MemorieAcces {
  teren: Terrain | null
  desemnari: DesignationStore | null
  rules: Rules | null
  /** Pana unde s-a citit jurnalul terenului (`Terrain.editari`). */
  vazuteTeren: number
  /** Pana unde s-a citit jurnalul santierelor (`editariConstr`). */
  vazuteDes: number
  /** C: celulele santierelor vii, tinute la zi din jurnal. */
  readonly plan: Set<number>
  readonly floods: (FloodMemorat | null)[]
  vii: number
  /** celula → indexul flood-ului care a etichetat-o ultimul. */
  readonly eticheta: Map<number, number>
  cititor: Cititor | null
  cititorLa: number
  /** Pentru teste si pentru poarta de cost: nimic din simulare nu le citeste. */
  readonly stat: { flooduri: number; celuleFlood: number; invalidate: number; goliri: number }
}

export function memorieAcces(): MemorieAcces {
  return {
    teren: null,
    desemnari: null,
    rules: null,
    vazuteTeren: 0,
    vazuteDes: 0,
    plan: new Set(),
    floods: [],
    vii: 0,
    eticheta: new Map(),
    cititor: null,
    cititorLa: -1,
    stat: { flooduri: 0, celuleFlood: 0, invalidate: 0, goliri: 0 },
  }
}

function golesteFlooduri(m: MemorieAcces): void {
  m.floods.length = 0
  m.vii = 0
  m.eticheta.clear()
}

/** Golire integrala: C refacut din store, niciun flood. */
function goleste(m: MemorieAcces, t: Terrain, d: DesignationStore, rules: Rules): void {
  m.stat.goliri++
  m.teren = t
  m.desemnari = d
  m.rules = rules
  m.vazuteTeren = t.editari
  m.vazuteDes = d.editariConstr
  m.plan.clear()
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 1 && d.kind[i] === Desemnare.CONSTRUIESTE) m.plan.add(cellKey(d.wx[i]!, d.wy[i]!, d.z[i]!))
  }
  golesteFlooduri(m)
}

/** O editare la (x, y, z): se sterg flood-urile a caror cutie de dependenta o contine. */
function invalideaza(m: MemorieAcces, x: number, y: number, z: number): void {
  for (let i = 0; i < m.floods.length; i++) {
    const f = m.floods[i]
    if (!f) continue
    if (x < f.x0 || x > f.x1 || y < f.y0 || y > f.y1 || z < f.z0 || z > f.z1) continue
    for (const c of f.celule) if (m.eticheta.get(c) === i) m.eticheta.delete(c)
    m.floods[i] = null
    m.vii--
    m.stat.invalidate++
  }
  // Sloturile moarte se strang cand sunt majoritare; etichetele se refac din cele vii,
  // in ordinea slotului — aceeasi ordine ca a suprascrierilor, deci aceleasi etichete.
  if (m.floods.length > 64 && m.vii * 2 < m.floods.length) {
    const vii = m.floods.filter((f): f is FloodMemorat => f !== null)
    m.floods.length = 0
    m.eticheta.clear()
    for (const f of vii) {
      const idx = m.floods.length
      m.floods.push(f)
      for (const c of f.celule) m.eticheta.set(c, idx)
    }
  }
}

/** Aduce memoria la zi cu terenul si cu santierele. */
function sincronizeaza(m: MemorieAcces, t: Terrain, d: DesignationStore, rules: Rules): void {
  if (m.teren !== t || m.desemnari !== d || m.rules !== rules) {
    goleste(m, t, d, rules)
    return
  }
  const nd = d.editariConstr - m.vazuteDes
  const nt = t.editari - m.vazuteTeren
  if (nd > JURNAL_DESEMNARI_CAP || nt > JURNAL_CAP) {
    goleste(m, t, d, rules)
    return
  }
  for (let n = m.vazuteDes; n < d.editariConstr; n++) {
    const j = (n % JURNAL_DESEMNARI_CAP) * 3
    const x = d.jurnalConstr[j]!, y = d.jurnalConstr[j + 1]!, z = d.jurnalConstr[j + 2]!
    const s = desemnareLaCelula(d, x, y, z)
    const k = cellKey(x, y, z)
    if (s !== -1 && d.kind[s] === Desemnare.CONSTRUIESTE) m.plan.add(k)
    else m.plan.delete(k)
    invalideaza(m, x, y, z)
  }
  m.vazuteDes = d.editariConstr
  for (let n = m.vazuteTeren; n < t.editari; n++) {
    const j = (n % JURNAL_CAP) * 3
    invalideaza(m, t.jurnal[j]!, t.jurnal[j + 1]!, t.jurnal[j + 2]!)
  }
  m.vazuteTeren = t.editari
}

/**
 * E SIGURA celula (x, y, z) in lumea de acum — stabila in (W, C) si in componenta deschisa?
 * Acelasi raspuns ca `esteSiguraPur` pe planul viu, oricand; testul-oracol il compara cu o
 * memorie noua dupa fiecare pas al unui fuzz.
 */
export function siguraMemorat(t: Terrain, d: DesignationStore, rules: Rules, m: MemorieAcces, x: number, y: number, z: number): boolean {
  sincronizeaza(m, t, d, rules)
  if (m.cititor === null || m.cititorLa !== t.editari) {
    m.cititor = cititor(t)
    m.cititorLa = t.editari
  }
  const nod = nodStabil({ t, plan: m.plan, zidite: null }, rules, m.cititor)
  if (!nod.calcabila(x, y, z)) return false
  const k = cellKey(x, y, z)
  const e = m.eticheta.get(k)
  if (e !== undefined) return m.floods[e]!.deschisa
  const c = componenta(nod, rules, x, y, z)
  m.stat.flooduri++
  m.stat.celuleFlood += c.total
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const idx = m.floods.length
  m.floods.push({
    deschisa: c.deschisa,
    celule: c.celule,
    x0: c.x0 - 1,
    x1: c.x1 + 1,
    y0: c.y0 - 1,
    y1: c.y1 + 1,
    z0: c.z0 - pas - 1,
    z1: c.z1 + pas + rules.agentHeadroomM - 1,
  })
  m.vii++
  for (const v of c.celule) m.eticheta.set(v, idx)
  return c.deschisa
}

/**
 * PRIVIREA INAINTE cu o piesa: celula (x, y, z) nu e sigura acum, dar cu piesa p zidita ar fi?
 * Salvarea din groapa: un pion prins zideste treapta care il scoate. Fara ea, planul care
 * deschide o punga n-ar avea niciodata constructor (masurat de panou: pionul prins in groapa
 * salvat ca pe HEAD doar cu privirea inainte). Sigur prin teorema: dupa zidirea lui p lumea e
 * W ∪ {p} cu acelasi F, iar pionul sta intr-o componenta deschisa.
 *
 * Cere memoria deja sincronizata (`siguraMemorat` intrebat inainte) — `plan` e al ei, si p
 * e in el: e un santier viu. (Z ⊆ C e ipoteza grafului stabil.)
 */
export function siguraDupaZidire(
  t: Terrain,
  rules: Rules,
  m: MemorieAcces,
  x: number,
  y: number,
  z: number,
  px: number,
  py: number,
  pz: number,
): boolean {
  const kp = cellKey(px, py, pz)
  const r = m.cititor !== null && m.cititorLa === t.editari ? m.cititor : cititor(t)
  return esteSiguraPur({ t, plan: m.plan, zidite: new Set([kp]) }, rules, x, y, z, r)
}

/**
 * REGULA DE SIGILARE: componentele W pe care zidirea lui p le-ar INCHIDE — deschise acum,
 * inchise cu p pusa. Fiecare intoarsa e cunoscuta integral (e inchisa), deci apelantul
 * poate verifica ce e in ea.
 *
 * Pe W, nu pe graful stabil: un pion care sta sub un buiandrug planificat nu e pe nicio
 * celula stabila, iar prima forma a regulii (pe etichetele W ∩ F) nu-l vedea si zidea peste
 * el (panoul v2, 3 din 3 seminte). Si doar ce INCHIDE p: un gard in jurul unei gropi in
 * care un pion era deja prins nu inchide nimic, iar prima forma tinea constructorii pe loc
 * pana murea cel prins.
 *
 * Semintele: celulele calcabile in W ∪ {p} din cele 4 coloane vecine, pe nivelurile pe care
 * o muchie putea trece prin coloana lui p. O componenta care nu atinge coloana lui p nu se
 * poate schimba.
 */
export function componenteInchiseDe(t: Terrain, rules: Rules, px: number, py: number, pz: number): number[][] {
  const r = cititor(t)
  const H = rules.agentHeadroomM
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const cuP = nodW(t, new Set([cellKey(px, py, pz)]), rules, r)
  const faraP = nodW(t, null, rules, r)
  const vazute = new Set<number>()
  const out: number[][] = []
  for (const [dx, dy] of DIR4) {
    const x = px + dx, y = py + dy
    for (let z = pz - H - pas; z <= pz + 1 + pas; z++) {
      if (vazute.has(cellKey(x, y, z)) || !cuP.calcabila(x, y, z)) continue
      const dupa = componenta(cuP, rules, x, y, z)
      for (const c of dupa.celule) vazute.add(c)
      if (dupa.deschisa) continue
      if (!faraP.calcabila(x, y, z)) continue
      if (componenta(faraP, rules, x, y, z).deschisa) out.push(dupa.celule)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// previzualizarea
// ---------------------------------------------------------------------------

/** De ce n-are acces o piesa, in lumea de la capatul planului. */
export const CauzaAcces = {
  /** Nimic pe care sa stai la indemana — sau doar pungi fara podea naturala (un acoperis, o placa fara scara). Pune o scara. */
  INALTIME: 1,
  /** Locurile de lucru sunt intr-o incinta cu podea naturala, fara iesire. Lasa o usa. */
  INCINTA: 2,
} as const
export type CauzaAccesId = (typeof CauzaAcces)[keyof typeof CauzaAcces]

/**
 * Etichetarea unui graf: celula → componenta, cu concluzia si marimile ei. Lenesa: o celula
 * neetichetata se inunda la prima intrebare. O componenta INCHISA e cunoscuta integral (o
 * singura eticheta pentru toata); una deschisa e dovedita doar pe ce a vizitat, deci alte celule
 * ale ei pot primi alte etichete — toate „deschise", ceea ce e tot ce conteaza.
 */
export interface Etichetare {
  readonly nod: Nod
  readonly comp: Map<number, number>
  readonly deschisa: boolean[]
  readonly total: number[]
  readonly naturale: number[]
  /** Cate celule s-au inundat, pentru poarta de cost. Nimic nu decide pe el. */
  inundate: number
}

export function etichetare(nod: Nod): Etichetare {
  return { nod, comp: new Map(), deschisa: [], total: [], naturale: [], inundate: 0 }
}

/** Componenta celulei (x, y, z), care TREBUIE sa fie calcabila in graf. */
export function idComponenta(e: Etichetare, rules: Rules, x: number, y: number, z: number): number {
  const k = cellKey(x, y, z)
  const gasit = e.comp.get(k)
  if (gasit !== undefined) return gasit
  const c = componenta(e.nod, rules, x, y, z)
  e.inundate += c.total
  const id = e.deschisa.length
  e.deschisa.push(c.deschisa)
  e.total.push(c.total)
  e.naturale.push(c.naturale)
  for (const v of c.celule) e.comp.set(v, id)
  return id
}

/** Predicatul de acces al inchiderii simulate, cu apelul de inceput de trecere. */
export interface PredicatAcces {
  /** Celulele inundate de toate etichetarile lui, pentru poarta de cost. */
  inundate(): number
  /** O trecere noua a inchiderii: etichetele vechi se arunca. */
  trecere(): void
  /** Are piesa `cheie` un loc de lucru SIGUR in lumea W ∪ Z? */
  poate(cheie: number, zidite: ReadonlySet<number>): boolean
}

/**
 * Predicatul de acces al inchiderii simulate: are piesa `cheie` un loc de lucru SIGUR in
 * lumea W ∪ Z (Z = ce s-a zidit virtual pana acum), cu planul C? Acelasi predicat ca al
 * scanerului (`locSigurPentru`): stabil si in componenta deschisa, sau deschisa dupa ce piesa
 * insasi e pusa (privirea inainte).
 *
 * Etichetele se fac o data pe TRECERE, nu pe piesa: prima forma inunda pungile din nou la
 * fiecare piesa si copia Z pentru privirea inainte — 3,4 s la o previzualizare de 6.003 piese.
 * In timpul trecerii Z mai creste; etichetele facute pe un Z mai mic sunt o subestimare (ce
 * era deschis ramane deschis — teorema), deci trecerea e doar prudenta, iar trecerea care nu
 * mai adauga nimic are etichetele exacte: punctul fix e acelasi.
 *
 * Privirea inainte e O(1) tot prin teorema: zidirea lui p adauga o SINGURA celula stabila,
 * cea de deasupra lui p. Componenta ei noua e reuniunea componentelor vecinilor ei; o celula
 * dintr-o punga se deschide daca punga ei e printre ele si reuniunea e deschisa.
 */
export function predicatAcces(t: Terrain, rules: Rules, plan: ReadonlySet<number>): PredicatAcces {
  const r = cititor(t)
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const niveluri = niveluriDeLucru(FelLucru.CONSTRUIESTE, rules)
  const directii = vecinatate(FelLucru.CONSTRUIESTE)
  let et: Etichetare | null = null
  let lumeaEt: ReadonlySet<number> | null = null
  let inundateInainte = 0
  const inchise = new Set<number>()
  const vecine = new Set<number>()
  return {
    inundate() {
      return inundateInainte + (et === null ? 0 : et.inundate)
    },
    trecere() {
      if (et !== null) inundateInainte += et.inundate
      et = null
    },
    poate(cheie, zidite) {
      if (et === null || lumeaEt !== zidite) {
        if (et !== null) inundateInainte += et.inundate
        et = etichetare(nodStabil({ t, plan, zidite }, rules, r))
        lumeaEt = zidite
      }
      const e = et
      const px = cheie % WORLD_CELLS
      const rest = (cheie - px) / WORLD_CELLS
      const py = rest % WORLD_CELLS
      const pz = (rest - py) / WORLD_CELLS - 512
      inchise.clear()
      for (const dzs of niveluri) {
        const zs = pz + dzs
        for (const [dx, dy] of directii) {
          const x = px + dx, y = py + dy
          if (!e.nod.calcabila(x, y, zs)) continue
          const id = idComponenta(e, rules, x, y, zs)
          if (e.deschisa[id]) return true
          inchise.add(id)
        }
      }
      if (inchise.size === 0) return false
      // Privirea inainte: celula de deasupra lui p, stabila cu p zidita?
      const sus = nodStabil({ t, plan, zidite, inPlus: cheie }, rules, r)
      if (!sus.calcabila(px, py, pz + 1)) return false
      vecine.clear()
      let deschisa = false
      let total = 1
      let naturale = 0
      for (const [dx, dy] of DIR4) {
        for (let dz = -pas; dz <= pas; dz++) {
          const x = px + dx, y = py + dy, z = pz + 1 + dz
          if (!e.nod.calcabila(x, y, z)) continue
          const id = idComponenta(e, rules, x, y, z)
          if (vecine.has(id)) continue
          vecine.add(id)
          if (e.deschisa[id]) deschisa = true
          total += e.total[id]!
          naturale += e.naturale[id]!
        }
      }
      if (!deschisa && naturale < rules.accesPlafonNatural && total <= rules.accesPlafonTotal) return false
      for (const id of inchise) if (vecine.has(id)) return true
      return false
    },
  }
}

/**
 * Cauza pentru o piesa fara acces, in lumea finala W ∪ Z (etichetarea ei): INCINTA daca vreun
 * loc de lucru calcabil sta intr-o punga cu podea naturala (o camera fara usa); altfel INALTIME
 * (nimic la indemana, sau doar o placa ori un acoperis fara scara). Panoul v2: fara tipul
 * podelei, cauza iesea gresita pe etajul fara scara (0 din 97 INALTIME).
 */
export function cauzaFaraAcces(e: Etichetare, rules: Rules, cheie: number): CauzaAccesId {
  const x0 = cheie % WORLD_CELLS
  const rest = (cheie - x0) / WORLD_CELLS
  const y0 = rest % WORLD_CELLS
  const z0 = (rest - y0) / WORLD_CELLS - 512
  for (const dzs of niveluriDeLucru(FelLucru.CONSTRUIESTE, rules)) {
    for (const [dx, dy] of vecinatate(FelLucru.CONSTRUIESTE)) {
      const x = x0 + dx, y = y0 + dy, z = z0 + dzs
      if (!e.nod.calcabila(x, y, z)) continue
      const id = idComponenta(e, rules, x, y, z)
      if (!e.deschisa[id] && e.naturale[id]! > 0) return CauzaAcces.INCINTA
    }
  }
  return CauzaAcces.INALTIME
}

/**
 * Ce ar INCHIDE planul, dus pana unde se poate (W ∪ Z): celulele date (pioni, mormane,
 * zone de acum) care sunt intr-o componenta deschisa azi si inchisa la capat. Avertisment,
 * nu refuz — regula de sigilare va opri ultima piesa cat timp ceva e inauntru.
 */
export function inchiseDePlan(t: Terrain, rules: Rules, zidite: ReadonlySet<number>, celule: readonly number[]): number[] {
  const r = cititor(t)
  const acum = nodW(t, null, rules, r)
  const dupa = nodW(t, zidite, rules, r)
  const deschiseDupa = new Set<number>()
  const inchiseDupa = new Set<number>()
  const out: number[] = []
  const c = { x: 0, y: 0, z: 0 }
  for (const k of celule) {
    const x = k % WORLD_CELLS
    const rest = (k - x) / WORLD_CELLS
    const y = rest % WORLD_CELLS
    c.x = x; c.y = y; c.z = (rest - y) / WORLD_CELLS - 512
    if (!dupa.calcabila(c.x, c.y, c.z) || deschiseDupa.has(k)) continue
    if (!inchiseDupa.has(k)) {
      const comp = componenta(dupa, rules, c.x, c.y, c.z)
      for (const v of comp.celule) (comp.deschisa ? deschiseDupa : inchiseDupa).add(v)
      if (comp.deschisa) continue
    }
    // Inchisa la capat. Era deschisa acum? Altfel nu e vina planului.
    if (acum.calcabila(c.x, c.y, c.z) && componenta(acum, rules, c.x, c.y, c.z).deschisa) out.push(k)
  }
  return out
}
