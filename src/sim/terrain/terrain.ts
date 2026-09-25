/**
 * Streamerul de teren si granita de promovare.
 *
 * Regula care tine totul, si care e si regula de salvare:
 *   **chunk-urile NE-promovate sunt cache (DERIVED); cele promovate sunt date (PERSISTED).**
 * Un chunk ne-promovat se poate arunca oricand si se regenereaza identic din seed.
 * Unul promovat contine munca jucatorului si nu se arunca niciodata.
 *
 * Promovarea vine cu o **apron de un chunk**: orice atingere promoveaza si cei opt
 * vecini. Fara ea, granita heightfield↔voxel e o suprafata care se muta la fiecare
 * sapatura si trebuie sa fie corecta simultan in randare, pathfinding, regiuni,
 * camere, stabilitate si save. Cu ea, granita e un INEL testabil. E riscul numarul
 * unu al arhitecturii (K16) si asta e mitigarea lui.
 */

import type { Outcome } from '../result.ts'
import { accept, refuse, Reason } from '../result.ts'
import type { Chunk, MaterialId } from './chunk.ts'
import { CHUNK_CELLS, cellHeightCm, groundLevelFromCm, generateChunk, isSolid, Material, promote, promotedBaseM, setVoxel, surfaceMatAt, voxelAt, VOXEL_LEVELS } from './chunk.ts'
import { MACRO_METERS, MACRO_SIZE } from './macro.ts'

/** Latimea lumii in chunk-uri: 1024 esantioane × 16 m / 32 m = 512. */
export const CHUNK_GRID = (MACRO_SIZE * MACRO_METERS) / CHUNK_CELLS
/** Latimea lumii in celule de 1 m. */
export const WORLD_CELLS = CHUNK_GRID * CHUNK_CELLS

export interface Terrain {
  readonly seed: number
  /** DERIVED pentru chunk-urile ne-promovate, PERSISTED pentru cele promovate. */
  readonly chunks: Map<number, Chunk>
  /** Cheile rezidente, MEREU sortate. Iterarea peste Map ar fi nedeterminista. */
  readonly keys: number[]
  /** Centrul discului de streaming, in chunk-uri. */
  focusCx: number
  focusCy: number
  /** Raza discului rezident, in chunk-uri. */
  readonly radius: number
  /**
   * DERIVED: indexul voxelilor de GRINDA, pe chunk. Tinut la zi in `editAt` —
   * singura cale de scriere a voxelilor la runtime — si reconstruit la incarcare din
   * coloanele RLE (`reconstruiesteGrinzi`). Nu intra in hash si nu se salveaza.
   * Se citeste DOAR prin `get` (vezi `grinziInRaza`), niciodata iterat: ordinea de
   * insertie a unui Map difera intre lumea continua si cea incarcata.
   */
  readonly grinzi: IndexGrinzi
}

/**
 * Un index de grinzi: chunkKey → chei LOCALE sortate (`cheieLocala`). Acelasi tip
 * pentru grinzile din teren (`Terrain.grinzi`) si pentru cele PLANIFICATE ale unei
 * intrebari de constructie.
 *
 * Cheia e locala chunk-ului, nu `cellKey`, ca modulul de teren sa nu depinda de
 * `path.ts` (care depinde de el). Ordinea ei e (z, ly, lx), deci grinzile unei
 * cote si ale unui interval de randuri stau CONTIGUU: o interogare e doua cautari
 * binare, nu o parcurgere a listei (masurat de panou: la 400 de grinzi pe 5 etaje,
 * 63.560 de candidati scanati liniar fata de 4.854).
 */
export type IndexGrinzi = Map<number, number[]>

/** Cota se deplaseaza ca sa ramana nenegativa: ferestrele de voxeli coboara sub 0. */
const Z_GRINDA = 1024

function cheieLocala(lx: number, ly: number, z: number): number {
  return ((z + Z_GRINDA) * CHUNK_CELLS + ly) * CHUNK_CELLS + lx
}

/** Pozitia inferioara (lower bound) a lui `cheie` intr-o lista sortata. */
function pozitie(lista: readonly number[], cheie: number): number {
  let lo = 0
  let hi = lista.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (lista[mid]! < cheie) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Adauga o grinda in index (idempotent). Lista chunk-ului ramane sortata. */
export function adaugaGrinda(index: IndexGrinzi, wx: number, wy: number, z: number): void {
  const cx = Math.floor(wx / CHUNK_CELLS)
  const cy = Math.floor(wy / CHUNK_CELLS)
  const ck = chunkKey(cx, cy)
  const cheie = cheieLocala(wx - cx * CHUNK_CELLS, wy - cy * CHUNK_CELLS, z)
  let lista = index.get(ck)
  if (lista === undefined) {
    lista = []
    index.set(ck, lista)
  }
  const i = pozitie(lista, cheie)
  if (lista[i] !== cheie) lista.splice(i, 0, cheie)
}

/**
 * Scoate o grinda din index. O lista ramasa GOALA se sterge: altfel indexul lumii
 * continue ar avea `chunk → []` acolo unde cel reconstruit n-are nimic, si orice
 * comparatie de egalitate ar iesi rosie fals.
 */
export function scoateGrinda(index: IndexGrinzi, wx: number, wy: number, z: number): void {
  const cx = Math.floor(wx / CHUNK_CELLS)
  const cy = Math.floor(wy / CHUNK_CELLS)
  const ck = chunkKey(cx, cy)
  const lista = index.get(ck)
  if (lista === undefined) return
  const cheie = cheieLocala(wx - cx * CHUNK_CELLS, wy - cy * CHUNK_CELLS, z)
  const i = pozitie(lista, cheie)
  if (lista[i] !== cheie) return
  lista.splice(i, 1)
  if (lista.length === 0) index.delete(ck)
}

/**
 * Grinzile din `index` de la cota `z`, la distanta Manhattan cel mult `raza` de
 * (wx, wy), ca perechi (x, y) adaugate in `out`.
 *
 * Chunk-urile se enumera TAIATE la lume: `chunkKey` nu e injectiv in afara ei
 * (`chunkKey(-1, 5) === chunkKey(511, 4)`), deci fara taiere cutia de la marginea
 * de vest ar aduce grinzile de la capatul de est. Filtrul Manhattan se face pe
 * coordonatele DECODATE, nu pe chei.
 */
export function grinziInRaza(index: IndexGrinzi, wx: number, wy: number, z: number, raza: number, out: number[]): void {
  const cx0 = Math.max(0, Math.floor((wx - raza) / CHUNK_CELLS))
  const cx1 = Math.min(CHUNK_GRID - 1, Math.floor((wx + raza) / CHUNK_CELLS))
  const cy0 = Math.max(0, Math.floor((wy - raza) / CHUNK_CELLS))
  const cy1 = Math.min(CHUNK_GRID - 1, Math.floor((wy + raza) / CHUNK_CELLS))
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const lista = index.get(chunkKey(cx, cy))
      if (lista === undefined) continue
      const bx = cx * CHUNK_CELLS
      const by = cy * CHUNK_CELLS
      const lyMin = Math.max(0, wy - raza - by)
      const lyMax = Math.min(CHUNK_CELLS - 1, wy + raza - by)
      if (lyMin > lyMax) continue
      const sus = cheieLocala(CHUNK_CELLS - 1, lyMax, z)
      for (let i = pozitie(lista, cheieLocala(0, lyMin, z)); i < lista.length && lista[i]! <= sus; i++) {
        const c = lista[i]!
        const x = bx + (c % CHUNK_CELLS)
        const y = by + (Math.floor(c / CHUNK_CELLS) % CHUNK_CELLS)
        if (Math.abs(x - wx) + Math.abs(y - wy) <= raza) out.push(x, y)
      }
    }
  }
}

/**
 * Reconstruieste `t.grinzi` din coloanele RLE ale chunk-urilor PROMOVATE, in
 * ordinea lui `t.keys` (sortata). Chunk-urile fara nicio grinda se sar dintr-o
 * cautare in `runMaterial`, fara sa se desfaca vreo coloana: masurat de panou,
 * 1,2 ms la 900 de chunk-uri fara grinzi, 14,5 ms la 1024 cu cate o grinda.
 */
export function reconstruiesteGrinzi(t: Terrain): void {
  t.grinzi.clear()
  for (const key of t.keys) {
    const chunk = t.chunks.get(key)!
    const v = chunk.voxels
    if (!v || !v.runMaterial.includes(Material.GRINDA)) continue
    const bx = chunk.cx * CHUNK_CELLS
    const by = chunk.cy * CHUNK_CELLS
    for (let col = 0; col < CHUNK_CELLS * CHUNK_CELLS; col++) {
      let z = v.zBaseM
      const end = v.columnStart[col + 1]!
      for (let r = v.columnStart[col]!; r < end; r++) {
        const len = v.runLength[r]!
        if (v.runMaterial[r] === Material.GRINDA) {
          for (let k = 0; k < len; k++) adaugaGrinda(t.grinzi, bx + (col % CHUNK_CELLS), by + Math.floor(col / CHUNK_CELLS), z + k)
        }
        z += len
      }
    }
  }
}

/** Grinzile din index ca lista sortata (x, y, z) — pentru comparatii in teste. */
export function listaGrinzi(index: IndexGrinzi): string[] {
  const out: string[] = []
  const chei = [...index.keys()].sort((a, b) => a - b)
  for (const ck of chei) {
    const cx = ck % CHUNK_GRID
    const cy = Math.floor(ck / CHUNK_GRID)
    for (const c of index.get(ck)!) {
      const lx = c % CHUNK_CELLS
      const ly = Math.floor(c / CHUNK_CELLS) % CHUNK_CELLS
      const z = Math.floor(c / (CHUNK_CELLS * CHUNK_CELLS)) - Z_GRINDA
      out.push(`${cx * CHUNK_CELLS + lx},${cy * CHUNK_CELLS + ly},${z}`)
    }
  }
  return out
}

export function chunkKey(cx: number, cy: number): number {
  return cy * CHUNK_GRID + cx
}

export function createTerrain(seed: number, radius: number): Terrain {
  return { seed, chunks: new Map(), keys: [], focusCx: 0, focusCy: 0, radius, grinzi: new Map() }
}

function insertKey(t: Terrain, key: number): void {
  // Insertie ordonata: `keys` e singura sursa de ordine din tot modulul.
  let lo = 0
  let hi = t.keys.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (t.keys[mid]! < key) lo = mid + 1
    else hi = mid
  }
  t.keys.splice(lo, 0, key)
}

export function inWorld(cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < CHUNK_GRID && cy < CHUNK_GRID
}

/** Ia chunk-ul, generandu-l daca lipseste. */
export function ensureChunk(t: Terrain, cx: number, cy: number): Chunk {
  const key = chunkKey(cx, cy)
  const found = t.chunks.get(key)
  if (found) return found
  const chunk = generateChunk(t.seed, cx, cy)
  t.chunks.set(key, chunk)
  insertKey(t, key)
  return chunk
}

/**
 * Muta centrul discului rezident. Incarca ce intra, arunca ce iese —
 * DAR numai chunk-uri ne-promovate.
 */
export function setFocus(t: Terrain, cx: number, cy: number): void {
  t.focusCx = cx
  t.focusCy = cy
  const r = t.radius
  const r2 = r * r

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue
      const nx = cx + dx
      const ny = cy + dy
      if (inWorld(nx, ny)) ensureChunk(t, nx, ny)
    }
  }

  const keep: number[] = []
  for (const key of t.keys) {
    const chunk = t.chunks.get(key)!
    const dx = chunk.cx - cx
    const dy = chunk.cy - cy
    const inside = dx * dx + dy * dy <= r2
    if (inside || chunk.voxels !== null) {
      keep.push(key)
    } else {
      t.chunks.delete(key)
    }
  }
  t.keys.length = 0
  for (const k of keep) t.keys.push(k)
}

/** Promoveaza un chunk si cei opt vecini ai lui. */
export function promoteWithApron(t: Terrain, cx: number, cy: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx
      const ny = cy + dy
      if (!inWorld(nx, ny)) continue
      promote(ensureChunk(t, nx, ny))
    }
  }
}

export function promotedCount(t: Terrain): number {
  let n = 0
  for (const key of t.keys) if (t.chunks.get(key)!.voxels !== null) n++
  return n
}

// --- editare ---------------------------------------------------------------

interface CellRef {
  chunk: Chunk
  lx: number
  ly: number
}

function locate(t: Terrain, wx: number, wy: number): CellRef | null {
  if (wx < 0 || wy < 0 || wx >= WORLD_CELLS || wy >= WORLD_CELLS) return null
  const cx = Math.floor(wx / CHUNK_CELLS)
  const cy = Math.floor(wy / CHUNK_CELLS)
  return { chunk: ensureChunk(t, cx, cy), lx: wx - cx * CHUNK_CELLS, ly: wy - cy * CHUNK_CELLS }
}

/** Cota solului intr-o celula, in metri. Merge si pe chunk-uri ne-promovate. */
export function groundLevelM(t: Terrain, wx: number, wy: number): Outcome<number> {
  const ref = locate(t, wx, wy)
  if (!ref) return refuse(Reason.IN_AFARA_LUMII, { x: wx, y: wy, limita: WORLD_CELLS })
  return accept(groundLevelFromCm(cellHeightCm(ref.chunk, ref.lx, ref.ly)))
}

/** Materialul dintr-un voxel. Pe un chunk ne-promovat, derivat din heightfield. */
export function materialAt(t: Terrain, wx: number, wy: number, z: number): Outcome<MaterialId> {
  const ref = locate(t, wx, wy)
  if (!ref) return refuse(Reason.IN_AFARA_LUMII, { x: wx, y: wy, limita: WORLD_CELLS })
  if (ref.chunk.voxels) return accept(voxelAt(ref.chunk, ref.lx, ref.ly, z))

  // Trebuie sa spuna EXACT ce ar spune `promote()` pentru aceeasi celula.
  //
  // Lipsea cazul `z === groundM`, si de aia promovarea SCHIMBA lumea: masurat,
  // 25% din celulele de suprafata treceau din PAMANT in APA in clipa in care
  // chunk-ul devenea voxeli. Adica „ne-promovat = cache" era fals — cache-ul
  // raspundea altceva decat datele.
  //
  // Defectul a iesit la iveala abia cand sistemul de regiuni a intrebat „se poate
  // sta aici?" de doua ori, inainte si dupa promovare, si a primit doua raspunsuri.
  // Exact tiparul din research: sistemele astea sunt invizibile — typecheck verde,
  // teste verzi, joc rupt.
  // Si sub baza pe care AR AVEA-O chunk-ul promovat nu exista voxel: `voxelAt`
  // spune AER acolo, deci si calea derivata spune AER. Altfel o desemnare la 30 m
  // sub sol era acceptata pe chunk-ul ne-promovat (ROCA), iar dupa prima
  // sapatura devenea AER si nu mai putea fi sapata niciodata — cache-ul si datele
  // raspundeau diferit pentru acelasi voxel.
  const baza = promotedBaseM(ref.chunk)
  if (z < baza || z >= baza + VOXEL_LEVELS) return accept(Material.AER)
  const groundM = groundLevelFromCm(cellHeightCm(ref.chunk, ref.lx, ref.ly))
  if (z > groundM) return accept(Material.AER)
  if (z === groundM) return accept(surfaceMatAt(ref.chunk, ref.lx, ref.ly))
  if (z > groundM - 3) return accept(Material.PAMANT)
  return accept(Material.ROCA)
}

/**
 * Baza ferestrei de voxeli a coloanei (wx, wy), pe calea fierbinte.
 *
 * `voxelRangeM` intoarce `Outcome`, adica aloca la fiecare apel — corect la
 * granita sistemului, gresit intr-un BFS care atinge mii de celule. In afara
 * lumii intoarce `+Infinity`, deci ORICE cota e sub baza: marginea lumii e
 * stanca, aceeasi conventie ca `materialFast`.
 *
 * Exista fiindca baza e PER CHUNK si difera pe 86,8% dintre granitele vecine
 * (masurat: medie 3,67 m, maxim 18 m). Cine intreaba despre un vecin lateral
 * trebuie sa foloseasca baza chunk-ului ALUIA, nu pe a lui — altfel roca de sub
 * baza vecinului se citeste ca aer si stabilitatea se rupe pe o linie invizibila.
 */
export function bazaVoxeli(t: Terrain, wx: number, wy: number): number {
  const ref = locate(t, wx, wy)
  return ref ? promotedBaseM(ref.chunk) : Number.POSITIVE_INFINITY
}

/** Intervalul de cote [min, max] in care chunk-ul de sub (wx, wy) are (sau ar avea) voxeli. */
export function voxelRangeM(t: Terrain, wx: number, wy: number): Outcome<{ min: number; max: number }> {
  const ref = locate(t, wx, wy)
  if (!ref) return refuse(Reason.IN_AFARA_LUMII, { x: wx, y: wy, limita: WORLD_CELLS })
  const baza = promotedBaseM(ref.chunk)
  return accept({ min: baza, max: baza + VOXEL_LEVELS - 1 })
}

function editAt(t: Terrain, wx: number, wy: number, z: number, material: MaterialId, expectSolid: boolean): Outcome<void> {
  const ref = locate(t, wx, wy)
  if (!ref) return refuse(Reason.IN_AFARA_LUMII, { x: wx, y: wy, limita: WORLD_CELLS })

  const current = materialAt(t, wx, wy, z)
  if (!current.ok) return current
  if (expectSolid && !isSolid(current.value)) {
    return refuse(Reason.LIPSA_MATERIAL, { motiv: 'nu e nimic de sapat', material: current.value })
  }
  if (!expectSolid && isSolid(current.value)) {
    return refuse(Reason.CELULA_PLINA, { motiv: 'celula e deja plina', material: current.value })
  }

  promoteWithApron(t, ref.chunk.cx, ref.chunk.cy)
  const ok = setVoxel(ref.chunk, ref.lx, ref.ly, z, material)
  if (!ok) {
    const zBase = ref.chunk.voxels!.zBaseM
    return refuse(Reason.IN_AFARA_LUMII, { z, min: zBase, max: zBase + VOXEL_LEVELS - 1 })
  }
  // Indexul DERIVED al grinzilor, tinut aici fiindca aici trece ORICE scriere de voxel
  // la runtime (sapat de job si de comanda, zidire, prabusire, moloz).
  if (current.value === Material.GRINDA) scoateGrinda(t.grinzi, wx, wy, z)
  if (material === Material.GRINDA) adaugaGrinda(t.grinzi, wx, wy, z)
  return accept()
}

/** Sapa un voxel. Promoveaza chunk-ul si apron-ul lui daca e nevoie. */
export function dig(t: Terrain, wx: number, wy: number, z: number): Outcome<void> {
  return editAt(t, wx, wy, z, Material.AER, true)
}

/** Umple un voxel gol cu material. */
export function fill(t: Terrain, wx: number, wy: number, z: number, material: MaterialId): Outcome<void> {
  if (!isSolid(material)) return refuse(Reason.LIPSA_MATERIAL, { motiv: 'materialul nu e solid', material })
  return editAt(t, wx, wy, z, material, false)
}
