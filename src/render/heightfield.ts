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
import { CHUNK_CELLS } from '../sim/terrain/chunk.ts'
import { MACRO_METERS, sampleMacro, WATER_LEVEL_DM } from '../sim/terrain/macro.ts'
import { biomeColor } from './palette.ts'

export interface HeightfieldMesh {
  /** 3 componente per varf, in metri, relativ la coltul chunk-ului. */
  positions: Float32Array
  /** RGB per varf, 0-1. */
  colors: Float32Array
  indices: Uint32Array
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
      // Cota VARFULUI, direct din `vertexCm`. Varianta veche punea aici cota
      // CELULEI — adica media celor patru varfuri din jur — deci deplasa toata
      // suprafata cu o jumatate de celula pe X si pe Y. Masurat pe 123.057 de
      // varfuri (`node tools/seam-distribution.mjs`): eroare medie 0,119 m,
      // maxima 0,370 m. Cotele corecte erau deja in chunk, doar nu se citeau.
      const heightM = chunk.vertexCm[i]! / 100
      const lx = Math.min(vx, n - 1)
      const ly = Math.min(vy, n - 1)

      positions[i * 3] = vx
      positions[i * 3 + 1] = heightM
      positions[i * 3 + 2] = vy

      const s = sampleMacro(seed, Math.floor((originX + lx) / MACRO_METERS), Math.floor((originY + ly) / MACRO_METERS))
      const c = biomeColor(s.biome)
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
