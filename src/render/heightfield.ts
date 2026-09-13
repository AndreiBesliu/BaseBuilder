/**
 * Mesh pentru chunk-urile NE-promovate.
 *
 * Un chunk ne-promovat are o singura celula walkable pe coloana, deci n-are nevoie
 * de voxeli: doua triunghiuri per celula, direct din grila de varfuri. Ieftin, si e
 * ce acopera 268 km² din lume.
 *
 * Ce se vede pe ecran e exact teza arhitecturii: peisajul e plan de triunghiuri,
 * iar acolo unde ai sapat apare geometrie de voxeli.
 */

import type { Chunk } from '../sim/terrain/chunk.ts'
import { CHUNK_CELLS, cellHeightCm } from '../sim/terrain/chunk.ts'
import { Biome, MACRO_METERS, sampleMacro, WATER_LEVEL_DM } from '../sim/terrain/macro.ts'

export interface HeightfieldMesh {
  /** 3 componente per varf, in metri, relativ la coltul chunk-ului. */
  positions: Float32Array
  /** RGB per varf, 0-1. */
  colors: Float32Array
  indices: Uint32Array
}

/** Paleta de teren. Culorile sunt date, nu magie imprastiata prin cod. */
const BIOME_COLOR: Record<number, [number, number, number]> = {
  [Biome.APA]: [0.20, 0.34, 0.45],
  [Biome.CAMPIE]: [0.45, 0.52, 0.30],
  [Biome.PADURE]: [0.27, 0.38, 0.24],
  [Biome.DEAL]: [0.44, 0.42, 0.33],
  [Biome.MUNTE]: [0.52, 0.52, 0.52],
}

export function meshHeightfield(seed: number, chunk: Chunk): HeightfieldMesh {
  const n = CHUNK_CELLS
  const positions = new Float32Array((n + 1) * (n + 1) * 3)
  const colors = new Float32Array((n + 1) * (n + 1) * 3)
  const indices = new Uint32Array(n * n * 6)

  const originX = chunk.cx * CHUNK_CELLS
  const originY = chunk.cy * CHUNK_CELLS

  for (let vy = 0; vy <= n; vy++) {
    for (let vx = 0; vx <= n; vx++) {
      const i = vy * (n + 1) + vx
      // Inaltimea unui varf: media celulelor din jurul lui, cu marginile prinse in interval.
      const lx = Math.min(vx, n - 1)
      const ly = Math.min(vy, n - 1)
      const heightM = cellHeightCm(chunk, lx, ly) / 100

      positions[i * 3] = vx
      positions[i * 3 + 1] = heightM
      positions[i * 3 + 2] = vy

      const s = sampleMacro(seed, Math.floor((originX + lx) / MACRO_METERS), Math.floor((originY + ly) / MACRO_METERS))
      const c = BIOME_COLOR[s.biome] ?? BIOME_COLOR[Biome.CAMPIE]!
      // Variatie mica dupa altitudine, ca peisajul sa nu fie plat ca o harta politica.
      const shade = 0.88 + Math.min(0.24, Math.max(-0.12, (s.heightDm - WATER_LEVEL_DM) / 6000))
      colors[i * 3] = c[0] * shade
      colors[i * 3 + 1] = c[1] * shade
      colors[i * 3 + 2] = c[2] * shade
    }
  }

  let w = 0
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const a = cy * (n + 1) + cx
      const b = a + 1
      const c = a + (n + 1)
      const d = c + 1
      indices[w++] = a; indices[w++] = c; indices[w++] = b
      indices[w++] = b; indices[w++] = c; indices[w++] = d
    }
  }

  return { positions, colors, indices }
}
