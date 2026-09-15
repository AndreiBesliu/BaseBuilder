/**
 * L1 si L2 — chunk-ul de teren si promovarea lui la voxeli.
 *
 * L1: heightfield de 1 m. Ieftin, acopera toata lumea, o singura celula walkable
 *     pe coloana. Se regenereaza din seed, deci nu se salveaza.
 * L2: cand jucatorul sapa sau construieste, chunk-ul e PROMOVAT ireversibil la
 *     coloane de voxeli, 64 de niveluri de 1 m, stocate RLE.
 *
 * Latimea de 32 nu e arbitrara: binary greedy meshing lucreaza bitwise pe coloane,
 * iar JavaScript n-are typed array pe 64 de biti. O coloana de 32 incape intr-un
 * Uint32Array; una de 64 nu.
 */

import { macroHeightDm, MACRO_METERS, sampleMacro } from './macro.ts'

/** Latimea unui chunk, in celule de 1 m. */
export const CHUNK_CELLS = 32
/** Cate niveluri verticale are un chunk promovat. */
export const VOXEL_LEVELS = 64
/** Cate niveluri sub baza terenului. Restul sunt deasupra. */
export const LEVELS_BELOW = 24

export const Material = {
  AER: 0,
  ROCA: 1,
  PAMANT: 2,
  IARBA: 3,
  APA: 4,
  LEMN_CONSTRUIT: 5,
  PIATRA_CONSTRUITA: 6,
} as const
export type MaterialId = (typeof Material)[keyof typeof Material]

export function isSolid(m: number): boolean {
  return m !== Material.AER && m !== Material.APA
}

/** Datele de voxeli ale unui chunk promovat. */
export interface VoxelData {
  /** Cota, in metri, a nivelului 0. */
  readonly zBaseM: number
  /** Perechi (material, lungime) concatenate pe coloane. */
  runMaterial: Uint8Array
  runLength: Uint8Array
  /**
   * Offsetul de start al fiecarei coloane; lungime CHUNK_CELLS² + 1.
   * Uint32, nu Uint16: in cazul patologic (material alternant pe fiecare nivel)
   * un chunk are 1024 × 64 = 65.536 de runs, adica exact peste marginea lui Uint16.
   */
  columnStart: Uint32Array
}

export interface Chunk {
  readonly cx: number
  readonly cy: number
  /** DERIVED — inaltimile varfurilor, in centimetri. (CHUNK_CELLS+1)². */
  readonly vertexCm: Int16Array
  /**
   * DERIVED — materialul de suprafata, la rezolutie MACRO (2×2 pe chunk).
   *
   * Se calculeaza o data, la generare, si il folosesc AMANDOUA caile: `promote()`
   * cand construieste coloanele, si `materialAt` cand raspunde pe chunk-uri
   * ne-promovate. O singura sursa, deci nu mai pot sa se contrazica — asta a fost
   * exact defectul: calea derivata nu stia de apa si promovarea schimba 25% din
   * celulele de suprafata.
   *
   * Si e ieftin: fara el, fiecare interogare de suprafata costa un `sampleMacro`,
   * adica trei apeluri de fBm. Suita de teste a sarit de la 3 la 54 de secunde in
   * clipa in care sistemul de regiuni a inceput sa intrebe des.
   */
  readonly surfaceMat: Uint8Array
  /** PERSISTED daca promovat, altfel DERIVED. */
  voxels: VoxelData | null
}

const VERTS = CHUNK_CELLS + 1
const COLUMNS = CHUNK_CELLS * CHUNK_CELLS

/** Cate esantioane macro pe axa atinge un chunk, plus marginea pentru interpolare. */
const PATCH = CHUNK_CELLS / MACRO_METERS + 2 // 32/16 + 2 = 4

/**
 * Inaltimile macro de care are nevoie un chunk: un petec de 4 × 4.
 *
 * Fara petec, fiecare varf ar cere patru evaluari de fbm, adica 4.356 pe chunk.
 * Cu el, un chunk costa 16 — de 272 de ori mai putin, si e si implementarea
 * corecta, fiindca varfurile vecine impart acelasi esantion macro.
 */
function heightPatch(seed: number, cx: number, cy: number): Int32Array {
  const sx0 = (cx * CHUNK_CELLS) / MACRO_METERS
  const sy0 = (cy * CHUNK_CELLS) / MACRO_METERS
  const patch = new Int32Array(PATCH * PATCH)
  for (let j = 0; j < PATCH; j++) {
    for (let i = 0; i < PATCH; i++) {
      patch[j * PATCH + i] = macroHeightDm(seed, sx0 + i, sy0 + j)
    }
  }
  return patch
}

/** Interpolare liniara in petec, coborata la rezolutia de 1 m. Totul in intregi. */
function vertexHeightCm(patch: Int32Array, localVx: number, localVy: number): number {
  const i = Math.floor(localVx / MACRO_METERS)
  const j = Math.floor(localVy / MACRO_METERS)
  // Ponderi in virgula fixa pe 1024, calculate din resturi intregi.
  const tx = ((localVx - i * MACRO_METERS) << 10) / MACRO_METERS
  const ty = ((localVy - j * MACRO_METERS) << 10) / MACRO_METERS

  // Se trece in CENTIMETRI INAINTE de interpolare, nu dupa.
  //
  // Varianta veche interpola in decimetri intregi si inmultea la final, deci
  // toate cotele de varf ieseau multipli de 10 cm: masurat, 111 cote distincte
  // intr-un chunk de 1.089 de varfuri, cu salturi de 20-50 cm intre vecini.
  // Nu se vedea, fiindca heightfield-ul folosea media celor patru varfuri ca
  // inaltime de varf — adica un blur 2×2 care netezea din intamplare exact
  // artefactul asta. Cand media a fost corectata, terenul a iesit in benzi de
  // contur. Instrumentul care ascundea defectul era chiar bug-ul vecin.
  //
  // Ramane aritmetica INTREAGA: doar scara se schimba, de la dm la cm.
  const h00 = patch[j * PATCH + i]! * 10
  const h10 = patch[j * PATCH + i + 1]! * 10
  const h01 = patch[(j + 1) * PATCH + i]! * 10
  const h11 = patch[(j + 1) * PATCH + i + 1]! * 10

  const top = h00 + (((h10 - h00) * tx) >> 10)
  const bottom = h01 + (((h11 - h01) * tx) >> 10)
  return top + (((bottom - top) * ty) >> 10)
}

/** Genereaza heightfield-ul unui chunk. Functie pura de (seed, cx, cy). */
export function generateChunk(seed: number, cx: number, cy: number): Chunk {
  const patch = heightPatch(seed, cx, cy)
  const vertexCm = new Int16Array(VERTS * VERTS)
  for (let vy = 0; vy < VERTS; vy++) {
    for (let vx = 0; vx < VERTS; vx++) {
      vertexCm[vy * VERTS + vx] = vertexHeightCm(patch, vx, vy)
    }
  }
  return { cx, cy, vertexCm, surfaceMat: surfacePatch(seed, cx, cy), voxels: null }
}

/**
 * Cota celui mai de sus voxel SOLID, din inaltimea in centimetri.
 *
 * Conventia traia in trei locuri diferite, scrisa de fiecare data ca
 * `Math.floor(cm / 100)`. Asta punea fata de sus a voxelului — care se randeaza
 * la `groundM + 1` — cu **0,523 m MEDIE deasupra** suprafetei de heightfield,
 * mereu in acelasi sens (`node tools/seam-distribution.mjs`). Adica exact K16:
 * o buza sistematica la granita dintre teren promovat si nepromovat.
 *
 * `round(h) - 1` aduce media la 0,005 m. Nepotrivirea pe celula NU dispare — ramane
 * 0,250 m in medie absoluta, jumatate din cat era — dar isi pierde semnul: o
 * treapta constanta se citeste ca zid, un zgomot simetric se citeste ca teren.
 *
 * Aritmetica ramane intreaga: `floor((cm + 50) / 100)` e rotunjire la jumatate in
 * sus si pe negative, fara sa depinda de modul de rotunjire al lui `Math.round`.
 */
export function groundLevelFromCm(heightCm: number): number {
  return Math.floor((heightCm + 50) / 100) - 1
}

/** Inaltimea solului intr-o celula, in centimetri: media celor patru varfuri. */
/** Materialul de suprafata al unei celule, din patch-ul deja calculat. O citire. */
export function surfaceMatAt(chunk: Chunk, lx: number, ly: number): MaterialId {
  const n = CHUNK_CELLS / MACRO_METERS
  return chunk.surfaceMat[Math.floor(ly / MACRO_METERS) * n + Math.floor(lx / MACRO_METERS)]! as MaterialId
}

export function cellHeightCm(chunk: Chunk, lx: number, ly: number): number {
  const v = chunk.vertexCm
  const a = v[ly * VERTS + lx]!
  const b = v[ly * VERTS + lx + 1]!
  const c = v[(ly + 1) * VERTS + lx]!
  const d = v[(ly + 1) * VERTS + lx + 1]!
  return (a + b + c + d) >> 2
}

function materialFor(soil: number, biome: number): MaterialId {
  if (biome === 0) return Material.APA
  if (soil > 120) return Material.IARBA
  return Material.PAMANT
}

/** Materialul de suprafata pentru o celula, derivat din macro. */
export function surfaceMaterial(seed: number, worldCellX: number, worldCellY: number): MaterialId {
  const s = sampleMacro(seed, Math.floor(worldCellX / MACRO_METERS), Math.floor(worldCellY / MACRO_METERS))
  return materialFor(s.soil, s.biome)
}

/**
 * Petecul de materiale de suprafata al unui chunk: 2 × 2 esantioane macro
 * acopera cei 32 m, deci patru apeluri in loc de 1.024.
 */
function surfacePatch(seed: number, cx: number, cy: number): Uint8Array {
  const n = CHUNK_CELLS / MACRO_METERS // 2
  const sx0 = (cx * CHUNK_CELLS) / MACRO_METERS
  const sy0 = (cy * CHUNK_CELLS) / MACRO_METERS
  const out = new Uint8Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const s = sampleMacro(seed, sx0 + i, sy0 + j)
      out[j * n + i] = materialFor(s.soil, s.biome)
    }
  }
  return out
}

// --- RLE -------------------------------------------------------------------

/** Desface o coloana in `out` (lungime VOXEL_LEVELS). */
export function decodeColumn(v: VoxelData, col: number, out: Uint8Array): void {
  let z = 0
  const start = v.columnStart[col]!
  const end = v.columnStart[col + 1]!
  for (let r = start; r < end; r++) {
    const material = v.runMaterial[r]!
    const length = v.runLength[r]!
    for (let i = 0; i < length; i++) out[z++] = material
  }
  // O coloana bine formata acopera exact VOXEL_LEVELS niveluri.
  while (z < VOXEL_LEVELS) out[z++] = Material.AER
}

/** Numarul de runs necesar pentru o coloana desfacuta. */
function countRuns(column: Uint8Array): number {
  let runs = 1
  for (let z = 1; z < VOXEL_LEVELS; z++) if (column[z] !== column[z - 1]) runs++
  return runs
}

/**
 * Reconstruieste intreg chunk-ul din coloanele desfacute.
 *
 * Da, reconstruieste TOT la fiecare editare. E O(chunk), nu O(coloana), si e
 * deliberat: corectitudinea intai. Un chunk are 1024 de coloane si ~4 runs pe
 * coloana, deci ordinul de marime e de mii de elemente — masurabil in microsecunde.
 * Cand profilerul va spune ca doare, se schimba in splice pe coloana.
 */
function rebuild(zBaseM: number, columns: Uint8Array): VoxelData {
  let total = 0
  const scratch = new Uint8Array(VOXEL_LEVELS)
  for (let c = 0; c < COLUMNS; c++) {
    scratch.set(columns.subarray(c * VOXEL_LEVELS, (c + 1) * VOXEL_LEVELS))
    total += countRuns(scratch)
  }

  const runMaterial = new Uint8Array(total)
  const runLength = new Uint8Array(total)
  const columnStart = new Uint32Array(COLUMNS + 1)

  let w = 0
  for (let c = 0; c < COLUMNS; c++) {
    columnStart[c] = w
    const base = c * VOXEL_LEVELS
    let runMat = columns[base]!
    let runLen = 1
    for (let z = 1; z < VOXEL_LEVELS; z++) {
      const m = columns[base + z]!
      if (m === runMat) {
        runLen++
      } else {
        runMaterial[w] = runMat
        runLength[w] = runLen
        w++
        runMat = m
        runLen = 1
      }
    }
    runMaterial[w] = runMat
    runLength[w] = runLen
    w++
  }
  columnStart[COLUMNS] = w

  return { zBaseM, runMaterial, runLength, columnStart }
}

/** Desface toate coloanele intr-un buffer plat. Folosit de editari si de teste. */
export function decodeAll(v: VoxelData): Uint8Array {
  const columns = new Uint8Array(COLUMNS * VOXEL_LEVELS)
  const scratch = new Uint8Array(VOXEL_LEVELS)
  for (let c = 0; c < COLUMNS; c++) {
    decodeColumn(v, c, scratch)
    columns.set(scratch, c * VOXEL_LEVELS)
  }
  return columns
}

export function encodeAll(zBaseM: number, columns: Uint8Array): VoxelData {
  return rebuild(zBaseM, columns)
}

/**
 * Promoveaza un chunk: transforma heightfield-ul in coloane de voxeli.
 *
 * Nu mai primeste `seed`: materialul de suprafata vine acum din `chunk.surfaceMat`,
 * calculat o data la generare si folosit si de calea derivata. Un parametru mort
 * lasat „pentru compatibilitate" e o urma care deruteaza peste trei luni.
 * Ireversibil prin decizie — o granita care se poate muta in ambele sensuri ar
 * trebui sa fie corecta in ambele sensuri in sase subsisteme.
 */
export function promote(chunk: Chunk): void {
  if (chunk.voxels) return

  let minCm = Infinity
  for (let ly = 0; ly < CHUNK_CELLS; ly++) {
    for (let lx = 0; lx < CHUNK_CELLS; lx++) {
      const h = cellHeightCm(chunk, lx, ly)
      if (h < minCm) minCm = h
    }
  }
  const zBaseM = Math.floor(minCm / 100) - LEVELS_BELOW

  const columns = new Uint8Array(COLUMNS * VOXEL_LEVELS)
  const patch = chunk.surfaceMat
  const patchN = CHUNK_CELLS / MACRO_METERS

  for (let ly = 0; ly < CHUNK_CELLS; ly++) {
    for (let lx = 0; lx < CHUNK_CELLS; lx++) {
      const groundM = groundLevelFromCm(cellHeightCm(chunk, lx, ly))
      const surface = patch[Math.floor(ly / MACRO_METERS) * patchN + Math.floor(lx / MACRO_METERS)]! as MaterialId
      const base = (ly * CHUNK_CELLS + lx) * VOXEL_LEVELS
      for (let level = 0; level < VOXEL_LEVELS; level++) {
        const z = zBaseM + level
        if (z > groundM) {
          columns[base + level] = Material.AER
        } else if (z === groundM) {
          columns[base + level] = surface
        } else if (z > groundM - 3) {
          columns[base + level] = Material.PAMANT
        } else {
          columns[base + level] = Material.ROCA
        }
      }
    }
  }

  chunk.voxels = rebuild(zBaseM, columns)
}

/**
 * Materialul dintr-un voxel al unui chunk promovat. `z` e cota absoluta in metri.
 *
 * Merge pe runs, nu desface coloana. Prima versiune aloca un `Uint8Array` de 64
 * si desfacea TOATA coloana ca sa citeasca un singur nivel — la fiecare
 * interogare. Cand agentii au inceput sa mearga pe drumuri, profilerul a pus
 * `decodeColumn` pe primul loc cu 20,5% si `voxelAt` pe al doilea cu 10,9%, plus
 * 3,4% colector de gunoi din alocarile alea. Un bloc de regiuni intreaba 256 de
 * celule; fiecare platea 64 de scrieri si o alocare pentru un octet.
 *
 * O coloana are ~4 runs, deci asta e O(4) fara alocare in locul lui O(64) cu una.
 * `decodeColumn` ramane — e folosit la editare, unde chiar trebuie toata coloana.
 */
export function voxelAt(chunk: Chunk, lx: number, ly: number, z: number): MaterialId {
  const v = chunk.voxels
  if (!v) throw new Error('voxelAt pe un chunk ne-promovat')
  const level = z - v.zBaseM
  if (level < 0 || level >= VOXEL_LEVELS) return Material.AER
  const col = ly * CHUNK_CELLS + lx
  const end = v.columnStart[col + 1]!
  let sus = 0
  for (let r = v.columnStart[col]!; r < end; r++) {
    sus += v.runLength[r]!
    if (level < sus) return v.runMaterial[r] as MaterialId
  }
  // O coloana care nu acopera toate nivelurile se termina in aer, ca in `decodeColumn`.
  return Material.AER
}

const scratchColumn = new Uint8Array(VOXEL_LEVELS)
const scratchMat = new Uint8Array(VOXEL_LEVELS)
const scratchLen = new Uint8Array(VOXEL_LEVELS)

/** Codeaza o coloana desfacuta in bufferele de lucru. Intoarce numarul de runs. */
function encodeColumnInto(column: Uint8Array): number {
  let w = 0
  let mat = column[0]!
  let len = 1
  for (let z = 1; z < VOXEL_LEVELS; z++) {
    const m = column[z]!
    if (m === mat) {
      len++
    } else {
      scratchMat[w] = mat
      scratchLen[w] = len
      w++
      mat = m
      len = 1
    }
  }
  scratchMat[w] = mat
  scratchLen[w] = len
  return w + 1
}

/**
 * Scrie un voxel. Intoarce false daca `z` e in afara ferestrei de 64 de niveluri.
 *
 * Lucreaza pe COLOANA, nu pe chunk. Prima versiune desfacea si reconstruia tot
 * chunk-ul la fiecare editare: 130.000 de operatii pe sapatura, adica 1,3 miliarde
 * pentru fuzz-ul de 10.000 de operatii din plan. Nu e optimizare prematura —
 * e un numar masurat inainte de a scrie testul.
 *
 * Cazul comun (numarul de runs nu se schimba) scrie in loc, fara mutari.
 */
export function setVoxel(chunk: Chunk, lx: number, ly: number, z: number, material: MaterialId): boolean {
  const v = chunk.voxels
  if (!v) throw new Error('setVoxel pe un chunk ne-promovat')
  const level = z - v.zBaseM
  if (level < 0 || level >= VOXEL_LEVELS) return false

  const col = ly * CHUNK_CELLS + lx
  decodeColumn(v, col, scratchColumn)
  if (scratchColumn[level] === material) return true
  scratchColumn[level] = material

  const start = v.columnStart[col]!
  const end = v.columnStart[col + 1]!
  const oldCount = end - start
  const newCount = encodeColumnInto(scratchColumn)

  if (newCount === oldCount) {
    v.runMaterial.set(scratchMat.subarray(0, newCount), start)
    v.runLength.set(scratchLen.subarray(0, newCount), start)
    return true
  }

  const total = v.columnStart[COLUMNS]!
  const newTotal = total - oldCount + newCount
  const runMaterial = new Uint8Array(newTotal)
  const runLength = new Uint8Array(newTotal)

  runMaterial.set(v.runMaterial.subarray(0, start), 0)
  runLength.set(v.runLength.subarray(0, start), 0)
  runMaterial.set(scratchMat.subarray(0, newCount), start)
  runLength.set(scratchLen.subarray(0, newCount), start)
  runMaterial.set(v.runMaterial.subarray(end, total), start + newCount)
  runLength.set(v.runLength.subarray(end, total), start + newCount)

  const columnStart = new Uint32Array(COLUMNS + 1)
  columnStart.set(v.columnStart.subarray(0, col + 1), 0)
  const delta = newCount - oldCount
  for (let c = col + 1; c <= COLUMNS; c++) columnStart[c] = v.columnStart[c]! + delta

  chunk.voxels = { zBaseM: v.zBaseM, runMaterial, runLength, columnStart }
  return true
}

/** Cate runs ocupa chunk-ul. Pentru teste de compresie si pentru bugetul de memorie. */
export function runCount(v: VoxelData): number {
  return v.columnStart[COLUMNS]!
}
