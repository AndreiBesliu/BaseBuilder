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
 *
 * `dovedita(k)`: celula k e DEJA dovedita intr-o componenta deschisa a unui graf care e
 * subgraf al lui `nod` (aceleasi muchii, aceleasi podele naturale) — flood-ul care o atinge e
 * in aceeasi componenta, deci deschis, si se opreste. Recenzia costului (27.09): fara oprire,
 * fiecare intrebare pe o celula neetichetata redovedea „afara" de la zero, 2.048+ celule.
 * O componenta INCHISA nu atinge nicio celula dovedita, deci se enumera tot integral.
 */
export function componenta(
  nod: Nod,
  rules: Rules,
  x: number,
  y: number,
  z: number,
  dovedita: ((k: number) => boolean) | null = null,
): Componenta {
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
  if (dovedita !== null && dovedita(cellKey(x, y, z))) deschisa = true
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
        if (dovedita !== null && dovedita(k)) deschisa = true
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

/** Un flood retinut: concluzia, marimile, celulele etichetate si cutia din care a CITIT. */
interface FloodMemorat {
  readonly deschisa: boolean
  /** Podelele naturale vizitate — exacte la o componenta INCHISA (enumerata integral). */
  readonly naturale: number
  readonly celule: number[]
  /** Cate celule poarta inca eticheta lui. La 0 nu mai raspunde nimic si se elibereaza. */
  etichete: number
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
 *
 * O editare MONOTONA (un santier scos din C; o celula din C umpluta) sterge doar flood-urile
 * INCHISE din cutie: dupa teorema din antet, ce era deschis ramane deschis. Recenzia costului
 * (27.09): cu stergerea tuturor, fiecare zidire reinunda „afara" (~2.048+ celule), iar intr-un
 * oras de 12 case cu etaj accesul lua 61% din tick.
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
  /**
   * Pentru teste si pentru poarta de cost: nimic din simulare nu le citeste. TOATE flood-urile
   * accesului din simulare trec pe aici — memoria, regula de sigilare, coborarea de urgenta —,
   * ca poarta K05 sa numere tot (recenzia: sigilarea si privirea ocoleau contorul).
   */
  readonly stat: {
    flooduri: number
    celuleFlood: number
    invalidate: number
    goliri: number
    eliberate: number
    sigilari: number
    celuleSigilare: number
    sigilariSarite: number
    coborari: number
    celuleCoborare: number
  }
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
    stat: {
      flooduri: 0,
      celuleFlood: 0,
      invalidate: 0,
      goliri: 0,
      eliberate: 0,
      sigilari: 0,
      celuleSigilare: 0,
      sigilariSarite: 0,
      coborari: 0,
      celuleCoborare: 0,
    },
  }
}

function golesteFlooduri(m: MemorieAcces): void {
  m.floods.length = 0
  m.vii = 0
  m.eticheta.clear()
}

/** Golire integrala: C refacut din store, niciun flood, niciun cititor. */
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
  // Cititorul e al terenului VECHI: o memorie refolosita pe alt teren cu acelasi `editari`
  // citea coloanele lui (recenzia, continuitate 2 — latent: in joc `w.terrain` nu se schimba).
  m.cititor = null
  m.cititorLa = -1
}

/** Eticheta celulei c trece la flood-ul idx; flood-ul care o pierde ramane fara ea. */
function eticheteaza(m: MemorieAcces, c: number, idx: number): void {
  const vechi = m.eticheta.get(c)
  if (vechi === idx) return
  if (vechi !== undefined) {
    const f = m.floods[vechi]!
    // Un flood deschis ramane viu peste editarile monotone, iar etichetele lui pot fi luate
    // toate de flood-uri mai noi. Fara eliberare, satul rasfirat al recenziei tinea 102 flood-uri
    // cu 209.917 celule pentru 8.669 de etichete.
    if (--f.etichete === 0) {
      m.floods[vechi] = null
      m.vii--
      m.stat.eliberate++
    }
  }
  m.eticheta.set(c, idx)
  m.floods[idx]!.etichete++
}

/**
 * O editare la (x, y, z): se sterg flood-urile a caror cutie de dependenta o contine — la o
 * editare MONOTONA, doar cele inchise.
 */
function invalideaza(m: MemorieAcces, x: number, y: number, z: number, monotona: boolean): void {
  for (let i = 0; i < m.floods.length; i++) {
    const f = m.floods[i]
    if (!f) continue
    if (x < f.x0 || x > f.x1 || y < f.y0 || y > f.y1 || z < f.z0 || z > f.z1) continue
    if (monotona && f.deschisa) continue
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
    m.vii = vii.length
    for (const f of vii) {
      const idx = m.floods.length
      f.etichete = 0
      m.floods.push(f)
      for (const c of f.celule) eticheteaza(m, c, idx)
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
  // Santierele scoase din C in fereastra (zidite sau anulate).
  const scoase = new Set<number>()
  for (let n = m.vazuteDes; n < d.editariConstr; n++) {
    const j = (n % JURNAL_DESEMNARI_CAP) * 3
    const x = d.jurnalConstr[j]!, y = d.jurnalConstr[j + 1]!, z = d.jurnalConstr[j + 2]!
    const s = desemnareLaCelula(d, x, y, z)
    const k = cellKey(x, y, z)
    if (s !== -1 && d.kind[s] === Desemnare.CONSTRUIESTE) {
      // Un santier nou strange F: poate scoate celule din graful stabil.
      m.plan.add(k)
      invalideaza(m, x, y, z, false)
    } else {
      // Un santier scos din C: celula lui si cele de sub ea, in limita capului, pot deveni
      // stabile; cea de deasupra n-avea podea in W. Multimea stabila doar CRESTE.
      if (m.plan.delete(k)) scoase.add(k)
      invalideaza(m, x, y, z, true)
    }
  }
  m.vazuteDes = d.editariConstr
  // O celula aparuta O SINGURA data in fereastra si SOLIDA acum a fost umpluta dintr-o celula
  // goala: `fill` refuza o celula plina, iar `dig` lasa aer. Cu doua intrari, ramanea deschisa
  // o gaura in contract (recenzia, verif-cost-0): molozul de pe un santier sapat si zidit in
  // aceeasi fereastra schimba podeaua de deasupra din naturala in structura, deci naturalele
  // unei componente deschise SCAD — memoria spunea „deschis", recalculul „inchis".
  const ori = new Map<number, number>()
  for (let n = m.vazuteTeren; n < t.editari; n++) {
    const j = (n % JURNAL_CAP) * 3
    const k = cellKey(t.jurnal[j]!, t.jurnal[j + 1]!, t.jurnal[j + 2]!)
    ori.set(k, (ori.get(k) ?? 0) + 1)
  }
  for (let n = m.vazuteTeren; n < t.editari; n++) {
    const j = (n % JURNAL_CAP) * 3
    const x = t.jurnal[j]!, y = t.jurnal[j + 1]!, z = t.jurnal[j + 2]!
    const k = cellKey(x, y, z)
    // MONOTONA: o piesa din C (acum, sau la inceputul ferestrei) zidita — efectul net e
    // W ∪ {k} cu F neschimbat, exact teorema. Orice alta editare (sapat, umplere in afara
    // planului) poate inchide ceva, deci sterge tot din cutie.
    let monotona = (m.plan.has(k) || scoase.has(k)) && ori.get(k) === 1
    if (monotona) {
      const mt = materialAt(t, x, y, z)
      monotona = mt.ok && isSolid(mt.value)
    }
    invalideaza(m, x, y, z, monotona)
  }
  m.vazuteTeren = t.editari
}

/** Memoria la zi si cititorul terenului de acum. Orice intrebare pe memorie trece pe aici. */
function pregateste(m: MemorieAcces, t: Terrain, d: DesignationStore, rules: Rules): Cititor {
  sincronizeaza(m, t, d, rules)
  if (m.cititor === null || m.cititorLa !== t.editari) {
    m.cititor = cititor(t)
    m.cititorLa = t.editari
  }
  return m.cititor
}

/** Indexul flood-ului care eticheteaza celula STABILA (x, y, z); o inunda daca nu e etichetata. */
function idMemorat(m: MemorieAcces, rules: Rules, nod: Nod, x: number, y: number, z: number): number {
  const e = m.eticheta.get(cellKey(x, y, z))
  if (e !== undefined) return e
  const c = componenta(nod, rules, x, y, z)
  m.stat.flooduri++
  m.stat.celuleFlood += c.total
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const idx = m.floods.length
  m.floods.push({
    deschisa: c.deschisa,
    naturale: c.naturale,
    celule: c.celule,
    etichete: 0,
    x0: c.x0 - 1,
    x1: c.x1 + 1,
    y0: c.y0 - 1,
    y1: c.y1 + 1,
    z0: c.z0 - pas - 1,
    z1: c.z1 + pas + rules.agentHeadroomM - 1,
  })
  m.vii++
  for (const v of c.celule) eticheteaza(m, v, idx)
  return idx
}

/**
 * E SIGURA celula (x, y, z) in lumea de acum — stabila in (W, C) si in componenta deschisa?
 * Acelasi raspuns ca `esteSiguraPur` pe planul viu, oricand; testul-oracol il compara cu o
 * memorie noua dupa fiecare pas al unui fuzz.
 */
export function siguraMemorat(t: Terrain, d: DesignationStore, rules: Rules, m: MemorieAcces, x: number, y: number, z: number): boolean {
  const r = pregateste(m, t, d, rules)
  const nod = nodStabil({ t, plan: m.plan, zidite: null }, rules, r)
  if (!nod.calcabila(x, y, z)) return false
  return m.floods[idMemorat(m, rules, nod, x, y, z)]!.deschisa
}

/**
 * PRIVIREA INAINTE cu o piesa: celula (x, y, z) nu e sigura acum, dar cu piesa p zidita ar fi?
 * Salvarea din groapa: un pion prins zideste treapta care il scoate. Fara ea, planul care
 * deschide o punga n-ar avea niciodata constructor (masurat de panou: pionul prins in groapa
 * salvat ca pe HEAD doar cu privirea inainte). Sigur prin teorema: dupa zidirea lui p lumea e
 * W ∪ {p} cu acelasi F, iar pionul sta intr-o componenta deschisa.
 *
 * Acelasi raspuns ca `esteSiguraPur` cu Z = {p} (testul-oracol le compara), dar pe etichetele
 * memoriei, fara flood-ul pungii la fiecare intrebare — recenzia costului: intr-o curte fara
 * poarta, 67% din timp era aici. Tot prin teorema: zidirea lui p adauga O SINGURA celula
 * stabila, cea de deasupra lui p. Celula de lucru e intr-o coloana VECINA (stabilitatea ei nu
 * depinde de p), iar componenta ei noua e reuniunea componentelor vecinilor celulei noi, daca
 * a ei e printre ele. O punga e etichetata integral, deci marimile ei sunt exacte; o
 * componenta deschisa printre vecini face reuniunea deschisa.
 */
export function siguraDupaZidire(
  t: Terrain,
  d: DesignationStore,
  rules: Rules,
  m: MemorieAcces,
  x: number,
  y: number,
  z: number,
  px: number,
  py: number,
  pz: number,
): boolean {
  const r = pregateste(m, t, d, rules)
  const nod = nodStabil({ t, plan: m.plan, zidite: null }, rules, r)
  if (!nod.calcabila(x, y, z)) return false
  const ic = idMemorat(m, rules, nod, x, y, z)
  if (m.floods[ic]!.deschisa) return true
  const sus = nodStabil({ t, plan: m.plan, zidite: null, inPlus: cellKey(px, py, pz) }, rules, r)
  if (!sus.calcabila(px, py, pz + 1)) return false
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const vecine: number[] = []
  let deschisa = false
  let total = 1
  let naturale = 0
  let gasita = false
  for (const [dx, dy] of DIR4) {
    for (let dz = -pas; dz <= pas; dz++) {
      const nx = px + dx, ny = py + dy, nz = pz + 1 + dz
      if (!nod.calcabila(nx, ny, nz)) continue
      const id = idMemorat(m, rules, nod, nx, ny, nz)
      if (vecine.includes(id)) continue
      vecine.push(id)
      const f = m.floods[id]!
      if (f.deschisa) deschisa = true
      total += f.celule.length
      naturale += f.naturale
      if (id === ic) gasita = true
    }
  }
  // Punga celulei de lucru nu atinge celula noua: p n-o schimba.
  if (!gasita) return false
  return deschisa || naturale >= rules.accesPlafonNatural || total > rules.accesPlafonTotal
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
 *
 * `r`, `dovedita`, `stat`: ale memoriei, prin `componenteInchiseDeMemorat` — ACEEASI functie,
 * doar mai ieftina; testul-oracol compara cele doua forme, cu tot cu ordinea listelor.
 */
export function componenteInchiseDe(
  t: Terrain,
  rules: Rules,
  px: number,
  py: number,
  pz: number,
  r: Cititor = cititor(t),
  dovedita: ((k: number) => boolean) | null = null,
  stat: MemorieAcces['stat'] | null = null,
): number[][] {
  const H = rules.agentHeadroomM
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const cuP = nodW(t, new Set([cellKey(px, py, pz)]), rules, r)
  const faraP = nodW(t, null, rules, r)
  // p solida scoate din W doar celulele coloanei ei pe care le umple sau carora le ia capul
  // (pz − H + 1 .. pz). Daca niciuna nu era calcabila, graful doar CRESTE (poate aparea
  // celula de peste p) si nimic nu se inchide: acoperisurile, placile, randurile de sus.
  let scoate = false
  for (let h = 0; h < H && !scoate; h++) if (faraP.calcabila(px, py, pz - h)) scoate = true
  if (!scoate) {
    if (stat !== null) stat.sigilariSarite++
    return []
  }
  // celula → componenta ei cu p pusa: indexul in `cuP_` daca e INCHISA, −1 daca e deschisa.
  // O componenta inchisa cu p poate UNI o punga veche din W (creasta peretilor) cu o regiune
  // deschisa in W, prin celula de peste p: verdictul „inchisa DE p" e al ORICAREI seminte din
  // ea, nu al primei. Prima forma il lua de la prima: cand samanta crestei venea inainte,
  // interiorul nu se mai verifica, iar pionul de inauntru era zidit (recenzia, plasa: 6 din
  // 314 cazuri de fuzz; in joc, pionul care dormea, seed 777).
  const cuPId = new Map<number, number>()
  const cuP_: number[][] = []
  const puse: boolean[] = []
  // celula → componenta ei in W e deschisa? (exacta: o componenta, un raspuns)
  const inW = new Map<number, boolean>()
  const out: number[][] = []
  for (const [dx, dy] of DIR4) {
    const x = px + dx, y = py + dy
    for (let z = pz - H - pas; z <= pz + 1 + pas; z++) {
      if (!cuP.calcabila(x, y, z)) continue
      const k = cellKey(x, y, z)
      let id = cuPId.get(k)
      if (id === undefined) {
        const dupa = componenta(cuP, rules, x, y, z, dovedita)
        if (stat !== null) {
          stat.sigilari++
          stat.celuleSigilare += dupa.total
        }
        id = dupa.deschisa ? -1 : cuP_.push(dupa.celule) - 1
        for (const c of dupa.celule) cuPId.set(c, id)
      }
      if (id === -1 || puse[id] === true) continue
      if (!faraP.calcabila(x, y, z)) continue
      let deschisaInW = inW.get(k)
      if (deschisaInW === undefined) {
        const acum = componenta(faraP, rules, x, y, z, dovedita)
        if (stat !== null) {
          stat.sigilari++
          stat.celuleSigilare += acum.total
        }
        deschisaInW = acum.deschisa
        for (const c of acum.celule) inW.set(c, acum.deschisa)
      }
      if (deschisaInW) {
        puse[id] = true
        out.push(cuP_[id]!)
      }
    }
  }
  return out
}

/**
 * Regula de sigilare pe memoria lumii: `componenteInchiseDe`, cu cititorul memoriei si cu
 * flood-urile oprite la prima celula etichetata DESCHISA. Corect pentru ca p ∈ C: graful
 * stabil (W ∩ F) e subgraf si al lui W, si al lui W ∪ {p}, cu aceleasi muchii si aceleasi
 * podele naturale, deci o componenta stabila deschisa e inclusa intr-una deschisa in ambele.
 * Recenzia costului: fara oprire, doua flood-uri complete pe fiecare piesa, 7,98 M coloane
 * citite intr-un oras, nenumarate de nicio poarta.
 */
export function componenteInchiseDeMemorat(
  t: Terrain,
  d: DesignationStore,
  rules: Rules,
  m: MemorieAcces,
  px: number,
  py: number,
  pz: number,
): number[][] {
  const r = pregateste(m, t, d, rules)
  return componenteInchiseDe(t, rules, px, py, pz, r, dovedireMemorie(m), m.stat)
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
 *
 * `dovedite`: celule dovedite DESCHISE intr-un graf care e subgraf al acestuia (aceleasi muchii,
 * aceleasi podele naturale) — un flood se opreste la ele si le adauga pe ale lui. Recenzia
 * costului (27.09): fara oprire, fiecare intrebare pe o celula neetichetata redovedea „afara"
 * de la zero; un oras de 20 de case inunda 370.957 de celule, cu oprire 26.820.
 */
export interface Etichetare {
  readonly nod: Nod
  readonly comp: Map<number, number>
  readonly deschisa: boolean[]
  readonly total: number[]
  readonly naturale: number[]
  readonly dovedite: Set<number> | null
  /** Cate celule s-au inundat, pentru poarta de cost. Nimic nu decide pe el. */
  inundate: number
}

export function etichetare(nod: Nod, dovedite: Set<number> | null = null): Etichetare {
  return { nod, comp: new Map(), deschisa: [], total: [], naturale: [], dovedite, inundate: 0 }
}

/** Componenta celulei (x, y, z), care TREBUIE sa fie calcabila in graf. */
export function idComponenta(e: Etichetare, rules: Rules, x: number, y: number, z: number): number {
  const k = cellKey(x, y, z)
  const gasit = e.comp.get(k)
  if (gasit !== undefined) return gasit
  const D = e.dovedite
  const c = componenta(e.nod, rules, x, y, z, D === null ? null : (v) => D.has(v))
  e.inundate += c.total
  const id = e.deschisa.length
  e.deschisa.push(c.deschisa)
  e.total.push(c.total)
  e.naturale.push(c.naturale)
  for (const v of c.celule) e.comp.set(v, id)
  if (D !== null && c.deschisa) for (const v of c.celule) D.add(v)
  return id
}

/** Predicatul de acces al inchiderii simulate, cu apelul de inceput de trecere. */
export interface PredicatAcces {
  /** Celulele inundate de toate etichetarile lui, pentru poarta de cost. */
  inundate(): number
  /** O trecere noua a inchiderii: etichetele vechi se arunca (in afara de celulele dovedite deschise). */
  trecere(): void
  /** Are piesa `cheie` un loc de lucru SIGUR in lumea W ∪ Z? */
  poate(cheie: number, zidite: ReadonlySet<number>): boolean
  /**
   * Celulele dovedite deschise pana acum, pe un Z care nu face decat sa creasca: raman deschise
   * in orice lume de dupa (teorema) — etichetarea finala si pungile planului se opresc la ele.
   */
  dovedite(): Set<number>
}

/**
 * Predicatul de acces al inchiderii simulate: are piesa `cheie` un loc de lucru SIGUR in
 * lumea W ∪ Z (Z = ce s-a zidit virtual pana acum), cu planul C? Acelasi predicat ca al
 * scanerului (`locSigurPentru`): stabil si in componenta deschisa, sau deschisa dupa ce piesa
 * insasi e pusa (privirea inainte).
 *
 * Etichetele se fac o data pe TRECERE, nu pe piesa: prima forma inunda pungile din nou la
 * fiecare piesa si copia Z pentru privirea inainte — 3,4 s la o previzualizare de 6.003 piese.
 * In timpul trecerii Z mai creste; o eticheta DESCHISA ramane adevarata (teorema), deci celulele
 * ei traiesc peste treceri si opresc flood-urile noi. O eticheta INCHISA facuta pe un Z mai mic
 * poate fi doar o PARTE din componenta de acum: e prudenta cat timp e intrebata singura, dar nu
 * intr-o SUMA — vezi garda de epoca. Trecerea care nu mai adauga nimic are Z fix si etichetele
 * exacte: punctul fix e acelasi, oricare ar fi ordinea planului.
 *
 * Privirea inainte e O(1) tot prin teorema: zidirea lui p adauga o SINGURA celula stabila,
 * cea de deasupra lui p. Componenta ei noua e reuniunea componentelor vecinilor ei; o celula
 * dintr-o punga se deschide daca punga ei e printre ele si reuniunea e deschisa. Si doar daca
 * in punga e un CONSTRUCTOR: o punga e inchisa prin definitie, deci privirea inainte o foloseste
 * doar un pion deja inauntru. `constructori` = celulele pionilor care iau joburi (`null`: se
 * presupune unul peste tot — testele pe teren gol).
 */
export function predicatAcces(t: Terrain, rules: Rules, plan: ReadonlySet<number>, constructori: readonly number[] | null = null): PredicatAcces {
  const r = cititor(t)
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const niveluri = niveluriDeLucru(FelLucru.CONSTRUIESTE, rules)
  const directii = vecinatate(FelLucru.CONSTRUIESTE)
  let et: Etichetare | null = null
  let lumeaEt: ReadonlySet<number> | null = null
  let inundateInainte = 0
  const inchise = new Set<number>()
  const vecine = new Set<number>()
  const dovedite = new Set<number>()
  /** |Z| cand s-a inundat fiecare componenta a etichetarii curente. */
  const epoca: number[] = []
  const id = (e: Etichetare, x: number, y: number, z: number, Z: ReadonlySet<number>): number => {
    const i = idComponenta(e, rules, x, y, z)
    if (epoca[i] === undefined) epoca[i] = Z.size
    return i
  }
  const areConstructor = (e: Etichetare, i: number): boolean => {
    if (constructori === null) return true
    for (const k of constructori) if (e.comp.get(k) === i) return true
    return false
  }
  return {
    inundate() {
      return inundateInainte + (et === null ? 0 : et.inundate)
    },
    trecere() {
      if (et !== null) inundateInainte += et.inundate
      et = null
    },
    dovedite() {
      return dovedite
    },
    poate(cheie, zidite) {
      if (et === null || lumeaEt !== zidite) {
        if (et !== null) inundateInainte += et.inundate
        et = etichetare(nodStabil({ t, plan, zidite }, rules, r), dovedite)
        lumeaEt = zidite
        epoca.length = 0
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
          const i = id(e, x, y, zs, zidite)
          if (e.deschisa[i]) return true
          inchise.add(i)
        }
      }
      if (inchise.size === 0) return false
      // Privirea inainte: celula de deasupra lui p, stabila cu p zidita?
      const sus = nodStabil({ t, plan, zidite, inPlus: cheie }, rules, r)
      if (!sus.calcabila(px, py, pz + 1)) return false
      vecine.clear()
      let deschisa = false
      let veche = false
      let total = 1
      let naturale = 0
      for (const [dx, dy] of DIR4) {
        for (let dz = -pas; dz <= pas; dz++) {
          const x = px + dx, y = py + dy, z = pz + 1 + dz
          if (!e.nod.calcabila(x, y, z)) continue
          const i = id(e, x, y, z, zidite)
          if (vecine.has(i)) continue
          vecine.add(i)
          if (e.deschisa[i]) deschisa = true
          else if (epoca[i] !== zidite.size) veche = true
          total += e.total[i]!
          naturale += e.naturale[i]!
        }
      }
      // O punga inundata pe un Z mai mic poate fi o PARTE dintr-o componenta inundata dupa: suma
      // ar numara-o de doua ori. Recenzia (continuitate 0, scena mesei): 2 × 1.598 ≥ 2.048, deci
      // promitea o piesa pe care pionii n-o zideau, si doar intr-o ordine a planului. Prudent: nu.
      if (!deschisa && veche) return false
      if (!deschisa && naturale < rules.accesPlafonNatural && total <= rules.accesPlafonTotal) return false
      for (const i of inchise) if (vecine.has(i) && areConstructor(e, i)) return true
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

/** Ce ar inchide planul dus pana unde se poate, intrebat pe liste. */
export interface InchideriPlan {
  /** Celulele date (pioni, mormane, zone de ACUM) deschise azi si inchise la capatul planului. */
  inchise(celule: readonly number[]): number[]
  /** Celulele inundate, pentru poarta de cost. */
  inundate(): number
}

/**
 * Ce ar INCHIDE planul, dus pana unde se poate (W ∪ Z): avertisment, nu refuz — regula de
 * sigilare va opri ultima piesa cat timp ceva e inauntru.
 *
 * O componenta a lui W ∪ Z care nu contine si nu atinge nicio celula pe care Z o schimba e si
 * componenta a lui W, cu aceleasi celule — deci inchisa si azi, nu din vina planului. Semintele
 * sunt cele 4 coloane vecine fiecarei piese, pe nivelurile pe care o muchie poate trece prin
 * coloana ei; coloana piesei insesi nu trebuie: celulele de sub ea nu mai sunt calcabile, iar
 * cea de peste ea ori atinge o vecina (si e gasita de acolo), ori e singura, n-a fost calcabila
 * azi si nu poate fi o celula intrebata. Asa ca se
 * enumera O DATA pe Z doar pungile care ating piesele, iar o celula intrebata costa O(1). Prima
 * forma pornea un flood de la fiecare celula intrebata: mormanele din regiuni diferite plateau
 * cate 2.048 de celule fiecare, plus un flood „acum" nereținut pe fiecare celula inchisa —
 * recenzia a masurat 0,4–8,3 s pe click, crescand cu lumea, nu cu planul.
 *
 * `dovediteDupa`: celule dovedite deschise pe grafuri stabile cu Z' ⊆ Z (`PredicatAcces.dovedite`)
 * — subgrafuri ale lui W ∪ Z, deci flood-urile „dupa" se opresc la ele. Enumerarea e lenesa: o
 * intrebare pe o lista goala nu inunda nimic.
 */
export function inchideriPlan(t: Terrain, rules: Rules, zidite: ReadonlySet<number>, dovediteDupa: ReadonlySet<number> | null = null): InchideriPlan {
  const r = cititor(t)
  const H = rules.agentHeadroomM
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const acum = nodW(t, null, rules, r)
  const dupa = nodW(t, zidite, rules, r)
  let inundate = 0
  let punga: Set<number> | null = null
  const enumera = (): Set<number> => {
    const out = new Set<number>()
    const vazute = new Set<number>()
    const deschise = new Set<number>()
    const opreste = (k: number): boolean => deschise.has(k) || (dovediteDupa !== null && dovediteDupa.has(k))
    for (const k of zidite) {
      const px = k % WORLD_CELLS
      const rest = (k - px) / WORLD_CELLS
      const py = rest % WORLD_CELLS
      const pz = (rest - py) / WORLD_CELLS - 512
      for (const [dx, dy] of DIR4) {
        const x = px + dx, y = py + dy
        for (let z = pz - H - pas; z <= pz + 1 + pas; z++) {
          if (!dupa.calcabila(x, y, z) || vazute.has(cellKey(x, y, z))) continue
          const comp = componenta(dupa, rules, x, y, z, opreste)
          inundate += comp.total
          for (const v of comp.celule) vazute.add(v)
          for (const v of comp.celule) (comp.deschisa ? deschise : out).add(v)
        }
      }
    }
    return out
  }
  const acumDeschise = new Set<number>()
  const acumInchise = new Set<number>()
  return {
    inundate: () => inundate,
    inchise(celule) {
      const out: number[] = []
      if (celule.length === 0 || zidite.size === 0) return out
      if (punga === null) punga = enumera()
      for (const k of celule) {
        if (!punga.has(k)) continue
        const x = k % WORLD_CELLS
        const rest = (k - x) / WORLD_CELLS
        const y = rest % WORLD_CELLS
        const z = (rest - y) / WORLD_CELLS - 512
        // Inchisa la capat. Era deschisa acum? Altfel nu e vina planului.
        if (acumInchise.has(k) || !acum.calcabila(x, y, z)) continue
        if (!acumDeschise.has(k)) {
          const comp = componenta(acum, rules, x, y, z, (v) => acumDeschise.has(v))
          inundate += comp.total
          for (const v of comp.celule) (comp.deschisa ? acumDeschise : acumInchise).add(v)
          if (!comp.deschisa) continue
        }
        out.push(k)
      }
      return out
    },
  }
}


// ---------------------------------------------------------------------------
// coborarea de urgenta
// ---------------------------------------------------------------------------

/**
 * Punga lui W in care sta (x, y, z), enumerata integral in ordinea BFS din ea; null daca celula nu
 * e calcabila sau componenta ei e deschisa. `dovedita`: celule dovedite deschise intr-un subgraf al
 * lui W (etichetele memoriei) — o componenta deschisa se opreste la ele.
 */
export function pungaDin(
  t: Terrain,
  rules: Rules,
  x: number,
  y: number,
  z: number,
  r: Cititor,
  dovedita: ((k: number) => boolean) | null,
  stat: MemorieAcces['stat'],
): Componenta | null {
  const nod = nodW(t, null, rules, r)
  if (!nod.calcabila(x, y, z)) return null
  const punga = componenta(nod, rules, x, y, z, dovedita)
  stat.coborari++
  stat.celuleCoborare += punga.total
  return punga.deschisa ? null : punga
}

/**
 * COBORAREA DE URGENTA din `punga` (a lui `pungaDin`): de pe marginea cea mai apropiata de celula
 * de pornire (ordinea BFS), pe prima podea de dedesubt, daca e cel mult `coborareUrgentaM` mai jos
 * si intr-o componenta DESCHISA. Iesirea: o celula a pungii cu un vecin ortogonal liber la
 * inaltimea pionului (`agentHeadroomM` niveluri de aer), sub care se cade prin aer pana la o podea.
 * Intoarce celula de aterizare, sau null (nicio margine de pe care sa se poata sari: jucatorul
 * trebuie sa sape). Coborarea e INSTANTANEE: drumul prin punga nu se simuleaza.
 */
export function iesireDinPunga(
  t: Terrain,
  rules: Rules,
  punga: Componenta,
  r: Cititor,
  dovedita: ((k: number) => boolean) | null,
  stat: MemorieAcces['stat'],
): [number, number, number] | null {
  const H = rules.agentHeadroomM
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  const D = rules.coborareUrgentaM
  if (D === 0) return null
  const nod = nodW(t, null, rules, r)
  const deschise = new Set<number>()
  const opreste = (k: number): boolean => deschise.has(k) || (dovedita !== null && dovedita(k))
  const solid = (a: number, b: number, c: number): boolean => isSolid(materialCitit(r, a, b, c))
  for (const k of punga.celule) {
    const cx = k % WORLD_CELLS
    const rest = (k - cx) / WORLD_CELLS
    const cy = rest % WORLD_CELLS
    const cz = (rest - cy) / WORLD_CELLS - 512
    for (const [dx, dy] of DIR4) {
      const nx = cx + dx, ny = cy + dy
      let liber = true
      for (let h = 0; h < H && liber; h++) if (solid(nx, ny, cz + h)) liber = false
      if (!liber) continue
      // Caderea: prin aer, pana la prima podea — cel mult D niveluri.
      let lz = cz
      while (lz > cz - D && !solid(nx, ny, lz - 1)) lz--
      // Un pas obisnuit ar fi fost o muchie a pungii; fara podea (mai adanc de D) nu e calcabila.
      if (cz - lz <= pas || !nod.calcabila(nx, ny, lz)) continue
      if (!opreste(cellKey(nx, ny, lz))) {
        const jos = componenta(nod, rules, nx, ny, lz, opreste)
        stat.coborari++
        stat.celuleCoborare += jos.total
        if (!jos.deschisa) continue
        for (const v of jos.celule) deschise.add(v)
      }
      return [nx, ny, lz]
    }
  }
  return null
}

/** `pungaDin` + `iesireDinPunga`: de unde coboara pionul de la (x, y, z), sau null. */
export function iesireDeUrgenta(
  t: Terrain,
  rules: Rules,
  x: number,
  y: number,
  z: number,
  r: Cititor,
  dovedita: ((k: number) => boolean) | null,
  stat: MemorieAcces['stat'],
): [number, number, number] | null {
  const punga = pungaDin(t, rules, x, y, z, r, dovedita, stat)
  return punga === null ? null : iesireDinPunga(t, rules, punga, r, dovedita, stat)
}

/**
 * E vreun voxel de SAPAT sau de desfacut (desemnare SAPA vie) pe care un pion din `punga` il poate
 * lucra de acolo — un loc de lucru al lui (felul, nivelurile si vecinatatea lui) in punga? Zidirea
 * nu conteaza: materialul n-are cum ajunge intr-o punga.
 */
export function areDeLucruInPunga(t: Terrain, d: DesignationStore, rules: Rules, punga: Componenta): boolean {
  const celule = new Set(punga.celule)
  const sus = Math.max(Math.max(0, Math.min(4, rules.maxStepM)), rules.atingereSusM)
  for (let s = 0; s < d.count; s++) {
    if (d.alive[s] !== 1 || d.kind[s] !== Desemnare.SAPA) continue
    const x = d.wx[s]!, y = d.wy[s]!, z = d.z[s]!
    // Cutia pungii, largita cu cat ajunge un loc de lucru.
    if (x < punga.x0 - 1 || x > punga.x1 + 1 || y < punga.y0 - 1 || y > punga.y1 + 1 || z < punga.z0 - sus || z > punga.z1 + sus) continue
    const fel = felSapa(t, x, y, z)
    for (const dzs of niveluriDeLucru(fel, rules)) {
      for (const [dx, dy] of vecinatate(fel)) if (celule.has(cellKey(x + dx, y + dy, z + dzs))) return true
    }
  }
  return false
}

/** Celula k e etichetata DESCHISA in memoria lumii (sincronizata)? Pentru opririle flood-urilor pe W. */
export function dovedireMemorie(m: MemorieAcces): (k: number) => boolean {
  return (k) => {
    const e = m.eticheta.get(k)
    return e !== undefined && m.floods[e]!.deschisa
  }
}
