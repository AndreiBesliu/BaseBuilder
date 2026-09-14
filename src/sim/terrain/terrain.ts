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
import { CHUNK_CELLS, cellHeightCm, groundLevelFromCm, generateChunk, isSolid, Material, promote, setVoxel, surfaceMatAt, voxelAt, VOXEL_LEVELS } from './chunk.ts'
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
}

export function chunkKey(cx: number, cy: number): number {
  return cy * CHUNK_GRID + cx
}

export function createTerrain(seed: number, radius: number): Terrain {
  return { seed, chunks: new Map(), keys: [], focusCx: 0, focusCy: 0, radius }
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
  const groundM = groundLevelFromCm(cellHeightCm(ref.chunk, ref.lx, ref.ly))
  if (z > groundM) return accept(Material.AER)
  if (z === groundM) return accept(surfaceMatAt(ref.chunk, ref.lx, ref.ly))
  if (z > groundM - 3) return accept(Material.PAMANT)
  return accept(Material.ROCA)
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
    return refuse(Reason.CAPACITATE_DEPASITA, { motiv: 'celula e deja plina', material: current.value })
  }

  promoteWithApron(t, ref.chunk.cx, ref.chunk.cy)
  const ok = setVoxel(ref.chunk, ref.lx, ref.ly, z, material)
  if (!ok) {
    const zBase = ref.chunk.voxels!.zBaseM
    return refuse(Reason.IN_AFARA_LUMII, { z, min: zBase, max: zBase + VOXEL_LEVELS - 1 })
  }
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
