/**
 * Binary greedy meshing.
 *
 * Transforma un chunk promovat intr-un mesh. Doua etape:
 *
 * 1. **Vizibilitatea, pe biti.** O linie de 32 de voxeli pe axa X incape exact
 *    intr-un `Uint32`. Fetele de pe axa X ies dintr-o singura operatie pe toata
 *    linia: `solid & ~(solid >>> 1)`. Asta e motivul pentru care chunk-ul e lat
 *    de 32 si nu de 64 — JavaScript n-are typed array pe 64 de biti, iar un chunk
 *    de 64 ar cere doua cuvinte pe linie si ar pierde exact trucul.
 *
 * 2. **Unirea in dreptunghiuri.** Fetele vecine de acelasi material se unesc
 *    lacom intr-un singur quad. Un perete de 20 × 8 devine UN quad, nu 160.
 *
 * Modulul e pur: citeste starea de simulare, nu o atinge. Nu importa nimic de
 * motor, ca sa poata fi masurat headless si portat odata cu nucleul.
 *
 * Limita cunoscuta de la S6-8 — fetele de granita emise mereu — e INCHISA:
 * `meshChunk(chunk, neighbours)` taie fetele acoperite de chunk-ul vecin.
 * Masurat pe fixtura M10: 674.582 din 779.888 de fete de granita erau ascunse
 * (86,5%), iar dupa unirea lacoma raman **−5,3% quaduri**. Fara `neighbours`,
 * comportamentul e IDENTIC cu cel dinainte, si asta e testat.
 *
 * Pretul nu e in cod, e in invalidare: o sapatura pe marginea unui chunk trebuie
 * sa re-meshuiasca si vecinul, altfel ramane o gaura prin care se vede fundalul.
 */

import type { Chunk } from '../sim/terrain/chunk.ts'
import { CHUNK_CELLS, decodeColumn, isSolid, VOXEL_LEVELS } from '../sim/terrain/chunk.ts'

const SX = CHUNK_CELLS
const SY = CHUNK_CELLS
const SZ = VOXEL_LEVELS
const ROWS = SY * SZ

/** Directiile de fata, in ordinea folosita peste tot in modul. */
export const Face = {
  X_POS: 0,
  X_NEG: 1,
  Y_POS: 2,
  Y_NEG: 3,
  Z_POS: 4,
  Z_NEG: 5,
} as const

export interface ChunkMesh {
  quadCount: number
  /** 4 varfuri × 3 componente per quad, in coordonate locale de chunk (metri). */
  positions: Int16Array
  /** Materialul fiecarui quad. */
  materials: Uint8Array
  /** Directia fetei fiecarui quad, 0-5. */
  faces: Uint8Array
}

// Buffere de lucru, reutilizate intre chunk-uri. Zero alocari in bucla fierbinte.
const dense = new Uint8Array(SX * SY * SZ)
const solid = new Uint32Array(ROWS)
const vis: Uint32Array[] = [
  new Uint32Array(ROWS),
  new Uint32Array(ROWS),
  new Uint32Array(ROWS),
  new Uint32Array(ROWS),
  new Uint32Array(ROWS),
  new Uint32Array(ROWS),
]
const grid = new Uint8Array(Math.max(SY * SZ, SX * SZ, SX * SY))
const column = new Uint8Array(SZ)

const denseIndex = (lx: number, ly: number, level: number): number => level * SX * SY + ly * SX + lx

/** Desface chunk-ul in materiale dense si in masti de solid pe linii de 32. */
function expand(chunk: Chunk): void {
  const v = chunk.voxels
  if (!v) throw new Error('mesh pe un chunk ne-promovat')
  solid.fill(0)

  for (let ly = 0; ly < SY; ly++) {
    for (let lx = 0; lx < SX; lx++) {
      decodeColumn(v, ly * SX + lx, column)
      const bit = 1 << lx
      for (let level = 0; level < SZ; level++) {
        const m = column[level]!
        dense[denseIndex(lx, ly, level)] = m
        if (isSolid(m)) solid[level * SY + ly]! |= bit
      }
    }
  }
}

/** Mastile de vizibilitate, toate sase, din operatii pe cuvinte intregi. */
function computeVisibility(): void {
  for (let level = 0; level < SZ; level++) {
    for (let ly = 0; ly < SY; ly++) {
      const i = level * SY + ly
      const s = solid[i]!

      // Axa X: vecinul e in acelasi cuvant, la un bit distanta.
      vis[Face.X_POS]![i] = s & ~(s >>> 1)
      vis[Face.X_NEG]![i] = s & ~(s << 1)

      // Axa Y: vecinul e linia urmatoare din aceeasi felie.
      const yNext = ly + 1 < SY ? solid[i + 1]! : 0
      const yPrev = ly > 0 ? solid[i - 1]! : 0
      vis[Face.Y_POS]![i] = s & ~yNext
      vis[Face.Y_NEG]![i] = s & ~yPrev

      // Axa Z: vecinul e aceeasi linie din felia urmatoare.
      const zNext = level + 1 < SZ ? solid[i + SY]! : 0
      const zPrev = level > 0 ? solid[i - SY]! : 0
      vis[Face.Z_POS]![i] = s & ~zNext
      vis[Face.Z_NEG]![i] = s & ~zPrev
    }
  }
}

/** Buffere de iesire, crescute la nevoie si reutilizate. */
let outPositions = new Int16Array(4 * 3 * 4096)
let outMaterials = new Uint8Array(4096)
let outFaces = new Uint8Array(4096)
let quadCount = 0

function ensureCapacity(needed: number): void {
  if (needed <= outMaterials.length) return
  let cap = outMaterials.length
  while (cap < needed) cap *= 2
  const p = new Int16Array(4 * 3 * cap)
  p.set(outPositions)
  outPositions = p
  const m = new Uint8Array(cap)
  m.set(outMaterials)
  outMaterials = m
  const f = new Uint8Array(cap)
  f.set(outFaces)
  outFaces = f
}

function pushQuad(
  face: number,
  material: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
): void {
  ensureCapacity(quadCount + 1)
  const o = quadCount * 12
  outPositions[o] = ax; outPositions[o + 1] = ay; outPositions[o + 2] = az
  outPositions[o + 3] = bx; outPositions[o + 4] = by; outPositions[o + 5] = bz
  outPositions[o + 6] = cx; outPositions[o + 7] = cy; outPositions[o + 8] = cz
  outPositions[o + 9] = dx; outPositions[o + 10] = dy; outPositions[o + 11] = dz
  outMaterials[quadCount] = material
  outFaces[quadCount] = face
  quadCount++
}

/**
 * Randurile care au macar o fata. Fara asta, unirea scaneaza celula cu celula
 * toate cele 128 de felii, inclusiv cele complet goale — iar intr-un chunk de
 * teren obisnuit majoritatea sunt goale. Ablatia a aratat 61% din timp aici.
 */
const rowUsed = new Uint8Array(Math.max(SZ, SY))

/**
 * Unirea lacoma in dreptunghiuri. Consuma `grid` (o goleste pe masura ce uneste).
 * `emit` primeste dreptunghiul in coordonatele (u, v) ale feliei.
 */
function greedy(w: number, h: number, emit: (u: number, v: number, du: number, dv: number, material: number) => void): void {
  for (let v = 0; v < h; v++) {
    if (rowUsed[v] === 0) continue
    let u = 0
    while (u < w) {
      const m = grid[v * w + u]!
      if (m === 0) {
        u++
        continue
      }
      let du = 1
      while (u + du < w && grid[v * w + u + du] === m) du++

      let dv = 1
      grow: while (v + dv < h) {
        for (let k = 0; k < du; k++) {
          if (grid[(v + dv) * w + u + k] !== m) break grow
        }
        dv++
      }

      for (let b = 0; b < dv; b++) {
        const row = (v + b) * w + u
        for (let a = 0; a < du; a++) grid[row + a] = 0
      }

      emit(u, v, du, dv, m)
      u += du
    }
  }
}

/** Construieste mesh-ul unui chunk promovat. */

// ---------------------------------------------------------------------------
// taierea fetelor de la granita de chunk
// ---------------------------------------------------------------------------

/**
 * Vecinii unui chunk, pe cele patru laturi. `null` inseamna „nu stiu ce e acolo",
 * si atunci se pastreaza comportamentul vechi: fata se emite.
 *
 * Presupunerea sigura la granita e „dincolo e aer", fiindca o fata emisa in plus
 * e risipa, iar una taiata gresit e o gaura prin care se vede fundalul.
 */
export interface ChunkNeighbours {
  readonly xNeg?: Chunk | null
  readonly xPos?: Chunk | null
  readonly yNeg?: Chunk | null
  readonly yPos?: Chunk | null
}

/** Masca de solid a unei linii de granita din vecin, per nivel. */
const borderMask = new Uint32Array(SZ)

/**
 * Nivelurile NU se aliniaza intre chunk-uri: fiecare stiva incepe la propriul
 * `zBaseM`. Decalajul se aplica la citire, iar ce cade in afara stivei vecinului
 * se considera AER — adica fata ramane emisa.
 */
function neighbourSolidAt(column_: Uint8Array, level: number, dz: number): boolean {
  const nl = level + dz
  if (nl < 0 || nl >= SZ) return false
  return isSolid(column_[nl]!)
}

/** Taie fetele de pe axa X care sunt acoperite de chunk-ul vecin. */
function cullX(own: Chunk, neighbour: Chunk, face: number, ownBit: number, neighbourLx: number): void {
  const nv = neighbour.voxels
  if (!nv) return
  const dz = own.voxels!.zBaseM - nv.zBaseM
  const mask = vis[face]!
  for (let ly = 0; ly < SY; ly++) {
    decodeColumn(nv, ly * SX + neighbourLx, column)
    for (let level = 0; level < SZ; level++) {
      if (neighbourSolidAt(column, level, dz)) mask[level * SY + ly]! &= ~ownBit
    }
  }
}

/** Taie fetele de pe axa Y care sunt acoperite de chunk-ul vecin. */
function cullY(own: Chunk, neighbour: Chunk, face: number, ownLy: number, neighbourLy: number): void {
  const nv = neighbour.voxels
  if (!nv) return
  const dz = own.voxels!.zBaseM - nv.zBaseM

  borderMask.fill(0)
  for (let lx = 0; lx < SX; lx++) {
    decodeColumn(nv, neighbourLy * SX + lx, column)
    const bit = 1 << lx
    for (let level = 0; level < SZ; level++) {
      if (neighbourSolidAt(column, level, dz)) borderMask[level]! |= bit
    }
  }

  const mask = vis[face]!
  for (let level = 0; level < SZ; level++) mask[level * SY + ownLy]! &= ~borderMask[level]!
}

/**
 * Limita cunoscuta a mesher-ului, inchisa.
 *
 * Pana acum fetele de la marginea chunk-ului se emiteau MEREU, fiindca nu se
 * consulta vecinul. Masurat pe fixtura M10 (`node tools/border-faces.mjs`):
 * 779.888 de fete de granita, din care **674.582 (86,5%) ascunse** de un vecin
 * promovat.
 *
 * Se face DUPA `computeVisibility`, pe mastile deja calculate, si numai pe cele
 * patru linii de granita. Nu atinge trucul bitwise pe care sta tot modulul:
 * o linie de 32 de voxeli ramane un `Uint32`.
 */
function cullChunkBorders(chunk: Chunk, n: ChunkNeighbours): void {
  if (n.xNeg) cullX(chunk, n.xNeg, Face.X_NEG, 1, SX - 1)
  if (n.xPos) cullX(chunk, n.xPos, Face.X_POS, 1 << (SX - 1), 0)
  if (n.yNeg) cullY(chunk, n.yNeg, Face.Y_NEG, 0, SY - 1)
  if (n.yPos) cullY(chunk, n.yPos, Face.Y_POS, SY - 1, 0)
}

export function meshChunk(chunk: Chunk, neighbours?: ChunkNeighbours): ChunkMesh {
  expand(chunk)
  computeVisibility()
  if (neighbours) cullChunkBorders(chunk, neighbours)
  quadCount = 0

  // --- fetele de pe axa X: felii la x = const, grila (ly, level) ---
  for (const face of [Face.X_POS, Face.X_NEG] as const) {
    const plane = face === Face.X_POS ? 1 : 0
    const mask = vis[face]!

    // O singura trecere peste masti spune care felii au macar o fata.
    // Bitul lx din `orAll` inseamna „exista cel putin o fata pe felia lx".
    let orAll = 0
    for (let i = 0; i < ROWS; i++) orAll |= mask[i]!
    if (orAll === 0) continue

    for (let lx = 0; lx < SX; lx++) {
      const bit = 1 << lx
      if ((orAll & bit) === 0) continue
      let any = false
      for (let level = 0; level < SZ; level++) {
        let used = 0
        const base = level * SY
        for (let ly = 0; ly < SY; ly++) {
          const m = (mask[base + ly]! & bit) !== 0 ? dense[denseIndex(lx, ly, level)]! : 0
          grid[base + ly] = m
          used |= m
        }
        rowUsed[level] = used !== 0 ? 1 : 0
        if (used !== 0) any = true
      }
      if (!any) continue
      const x = lx + plane
      greedy(SY, SZ, (u, v, du, dv, m) => {
        pushQuad(face, m, x, u, v, x, u + du, v, x, u + du, v + dv, x, u, v + dv)
      })
    }
  }

  // --- fetele de pe axa Y: felii la y = const, grila (lx, level) ---
  for (const face of [Face.Y_POS, Face.Y_NEG] as const) {
    const plane = face === Face.Y_POS ? 1 : 0
    const mask = vis[face]!
    for (let ly = 0; ly < SY; ly++) {
      // Felia e goala daca toate randurile ei sunt zero — un test pe cuvant,
      // nu pe celula.
      let sliceOr = 0
      for (let level = 0; level < SZ; level++) sliceOr |= mask[level * SY + ly]!
      if (sliceOr === 0) continue

      for (let level = 0; level < SZ; level++) {
        const row = mask[level * SY + ly]!
        const base = level * SX
        if (row === 0) {
          rowUsed[level] = 0
          // Golirea e obligatorie: extinderea pe verticala din `greedy` citeste
          // randurile de dedesubt fara sa verifice rowUsed, deci date ramase
          // de la felia anterioara ar fi unite ca si cum ar fi fete reale.
          grid.fill(0, base, base + SX)
          continue
        }
        rowUsed[level] = 1
        for (let lx = 0; lx < SX; lx++) {
          grid[base + lx] = (row & (1 << lx)) !== 0 ? dense[denseIndex(lx, ly, level)]! : 0
        }
      }
      const y = ly + plane
      greedy(SX, SZ, (u, v, du, dv, m) => {
        pushQuad(face, m, u, y, v, u + du, y, v, u + du, y, v + dv, u, y, v + dv)
      })
    }
  }

  // --- fetele de pe axa Z: felii la level = const, grila (lx, ly) ---
  for (const face of [Face.Z_POS, Face.Z_NEG] as const) {
    const plane = face === Face.Z_POS ? 1 : 0
    const mask = vis[face]!
    for (let level = 0; level < SZ; level++) {
      const base = level * SY
      let sliceOr = 0
      for (let ly = 0; ly < SY; ly++) sliceOr |= mask[base + ly]!
      if (sliceOr === 0) continue

      for (let ly = 0; ly < SY; ly++) {
        const row = mask[base + ly]!
        const gbase = ly * SX
        if (row === 0) {
          rowUsed[ly] = 0
          grid.fill(0, gbase, gbase + SX)
          continue
        }
        rowUsed[ly] = 1
        for (let lx = 0; lx < SX; lx++) {
          grid[gbase + lx] = (row & (1 << lx)) !== 0 ? dense[denseIndex(lx, ly, level)]! : 0
        }
      }
      const z = level + plane
      greedy(SX, SY, (u, v, du, dv, m) => {
        pushQuad(face, m, u, v, z, u + du, v, z, u + du, v + dv, z, u, v + dv, z)
      })
    }
  }

  return {
    quadCount,
    positions: outPositions.slice(0, quadCount * 12),
    materials: outMaterials.slice(0, quadCount),
    faces: outFaces.slice(0, quadCount),
  }
}

/**
 * Mesher naiv, pentru comparatie: o fata per voxel vizibil, fara unire.
 * Exista ca sa pot MASURA castigul unirii lacome pe datele mele, nu pe cifra
 * citata de altcineva.
 */
export function countNaiveFaces(chunk: Chunk): number {
  expand(chunk)
  computeVisibility()
  let faces = 0
  for (let d = 0; d < 6; d++) {
    const mask = vis[d]!
    for (let i = 0; i < ROWS; i++) {
      let bits = mask[i]!
      while (bits !== 0) {
        bits &= bits - 1
        faces++
      }
    }
  }
  return faces
}
