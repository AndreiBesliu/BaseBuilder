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
import { ensureChunk, materialAt, WORLD_CELLS } from './terrain/terrain.ts'
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
import { Desemnare } from './desemnari.ts'
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
  return {
    calcabila(x, y, z) {
      const m = materialCitit(r, x, y, z)
      if (isSolid(m) || m === Material.APA) return false
      // Afara din lume materialul e ROCA, deci n-am ajuns aici: cheia e injectiva.
      if (C.has(cellKey(x, y, z))) return false
      if (!isSolid(materialCitit(r, x, y, z - 1)) && !(Z !== null && Z.has(cellKey(x, y, z - 1)))) return false
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
