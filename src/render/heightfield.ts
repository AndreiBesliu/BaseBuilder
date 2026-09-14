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
  /** Normale per varf, calculate analitic din grila de inaltimi. */
  normals: Float32Array
  /**
   * Indicii. ACELASI buffer pentru toate chunk-urile, fiindca topologia unei
   * grile regulate nu depinde de continut.
   *
   * Nu e o micro-optimizare: masurat, 24 KB per chunk × 377 rezidente = **8,8 MB
   * de indici identici**, alocati si tinuti degeaba. Nu-l modifica nimeni.
   */
  readonly indices: Uint32Array
}

/**
 * Topologia grilei, o singura data pentru toata lumea.
 *
 * Verificat: doua chunk-uri diferite produceau exact aceiasi indici, ceea ce e
 * evident dupa ce te uiti (depind doar de `CHUNK_CELLS`) si complet invizibil
 * inainte.
 */
const SHARED_INDICES = buildIndices()

function buildIndices(): Uint32Array {
  const n = CHUNK_CELLS
  const out = new Uint32Array(n * n * 6)
  let w = 0
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const a = cy * (n + 1) + cx
      const b = a + 1
      const c = a + (n + 1)
      const d = c + 1
      out[w++] = a; out[w++] = c; out[w++] = b
      out[w++] = b; out[w++] = c; out[w++] = d
    }
  }
  return out
}

export function meshHeightfield(seed: number, chunk: Chunk): HeightfieldMesh {
  const n = CHUNK_CELLS
  const positions = new Float32Array((n + 1) * (n + 1) * 3)
  const colors = new Float32Array((n + 1) * (n + 1) * 3)
  const normals = new Float32Array((n + 1) * (n + 1) * 3)

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

  // Normalele, ANALITIC din grila de inaltimi.
  //
  // Inainte se chema `computeVertexNormals()` pe geometrie, adica: parcurge toate
  // triunghiurile, calculeaza produsul vectorial, aduna in varfuri, normalizeaza.
  // Pe o grila REGULATA toata munca aia e inutila — panta se citeste direct din
  // diferentele de inaltime ale vecinilor, si iese si mai neteda.
  //
  // La margine se foloseste diferenta unilaterala, fiindca varful de dincolo
  // apartine chunk-ului vecin. Diferenta fata de cea centrala e mica pe teren
  // continuu; daca se vede vreodata o cusatura de lumina la granita, leacul e un
  // inel de apron in `vertexCm`, nu o intoarcere la `computeVertexNormals`.
  for (let vy = 0; vy <= n; vy++) {
    for (let vx = 0; vx <= n; vx++) {
      const i = vy * (n + 1) + vx
      const hL = positions[(vy * (n + 1) + Math.max(0, vx - 1)) * 3 + 1]!
      const hR = positions[(vy * (n + 1) + Math.min(n, vx + 1)) * 3 + 1]!
      const hD = positions[(Math.max(0, vy - 1) * (n + 1) + vx) * 3 + 1]!
      const hU = positions[(Math.min(n, vy + 1) * (n + 1) + vx) * 3 + 1]!
      // Pasul real dintre esantioane: 2 in interior, 1 la margine.
      const sx = (vx > 0 ? 1 : 0) + (vx < n ? 1 : 0)
      const sy = (vy > 0 ? 1 : 0) + (vy < n ? 1 : 0)
      const dx = (hR - hL) / sx
      const dy = (hU - hD) / sy
      // Normala unei suprafete y = f(x, z) e (-df/dx, 1, -df/dz), normalizata.
      const len = Math.hypot(dx, 1, dy)
      normals[i * 3] = -dx / len
      normals[i * 3 + 1] = 1 / len
      normals[i * 3 + 2] = -dy / len
    }
  }

  return { positions, colors, normals, indices: SHARED_INDICES }
}
