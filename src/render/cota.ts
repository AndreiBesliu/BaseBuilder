/**
 * Cota VIZUALA a solului — unde se vede fata de sus a terenului, nu nivelul intreg al celulei.
 *
 * Suprafata neatinsa se deseneaza NETEZITA, din cotele varfurilor (`vertexCm`), in timp ce un obiect
 * asezat pe o celula are cota intreaga a podelei ei (`z`). Cu `y = z`, mormanele de resurse pluteau
 * sau intrau in pamant cu pana la 0,5 m: pe jocul nou, 22 din 25 deplasate, 3 complet sub iarba
 * (recenzia UI-ului, ECR-1).
 *
 * Doua triangulari, si le urmeaza pe amandoua:
 *  - chunk NEPROMOVAT (heightfield.ts, `buildIndices`): triunghiurile (a, c, b) si (b, c, d) —
 *    diagonala b–c;
 *  - chunk PROMOVAT, coloana cu suprafata naturala (mesher.ts `pushFataNetezita`, scrisa prin
 *    winding.ts `writeQuadIndices`): (0, 1, 2) si (0, 2, 3) — diagonala a–d. Cu formula b–c si aici,
 *    un morman ramanea deplasat dupa prima sapatura din chunk.
 * (a = (x, y), b = (x+1, y), c = (x, y+1), d = (x+1, y+1).) Pe o coloana care nu mai e naturala
 * (sapata, zidita, o podea), fata de sus e plata: cota e `z`.
 *
 * PUR si fara three: e o functie de teren, folosita de viewer (mormanele) si testata in node.
 */

import type { Terrain } from '../sim/terrain/terrain.ts'
import { ensureChunk, materialAt, WORLD_CELLS } from '../sim/terrain/terrain.ts'
import { CHUNK_CELLS, cellHeightCm, groundLevelFromCm, isSolid, VERTS } from '../sim/terrain/chunk.ts'

const solidLa = (t: Terrain, wx: number, wy: number, z: number): boolean => {
  const m = materialAt(t, wx, wy, z)
  return m.ok && isSolid(m.value)
}

/**
 * Cota vizuala a solului in punctul (x, y) — metri de lume, cu fractie — pentru ceva care sta pe
 * podeaua nivelului `z` al coloanei lui. Pe o suprafata naturala, cota triunghiului desenat acolo;
 * altfel `z`.
 */
export function cotaVizuala(t: Terrain, x: number, y: number, z: number): number {
  const wx = Math.floor(x)
  const wy = Math.floor(y)
  if (wx < 0 || wy < 0 || wx >= WORLD_CELLS || wy >= WORLD_CELLS) return z
  const cx = Math.floor(wx / CHUNK_CELLS)
  const cy = Math.floor(wy / CHUNK_CELLS)
  const ch = ensureChunk(t, cx, cy)
  const lx = wx - cx * CHUNK_CELLS
  const ly = wy - cy * CHUNK_CELLS
  // Suprafata naturala a coloanei: solid la nivelul generatorului, aer deasupra — si obiectul chiar
  // sta pe ea. Aceeasi conditie ca `suprafataNaturala` din mesher.
  const g = groundLevelFromCm(cellHeightCm(ch, lx, ly))
  if (z !== g + 1) return z
  const promovat = ch.voxels !== null
  if (promovat && (!solidLa(t, wx, wy, g) || solidLa(t, wx, wy, g + 1))) return z
  const v = ch.vertexCm
  const a = v[ly * VERTS + lx]! / 100
  const b = v[ly * VERTS + lx + 1]! / 100
  const c = v[(ly + 1) * VERTS + lx]! / 100
  const d = v[(ly + 1) * VERTS + lx + 1]! / 100
  const u = x - wx
  const w = y - wy
  if (!promovat) {
    // Diagonala b–c: (a, c, b) cand u + w <= 1, altfel (b, c, d).
    return u + w <= 1 ? a + (b - a) * u + (c - a) * w : d + (c - d) * (1 - u) + (b - d) * (1 - w)
  }
  // Diagonala a–d: (a, b, d) cand u >= w, altfel (a, d, c).
  return u >= w ? a + (b - a) * u + (d - b) * w : a + (c - a) * w + (d - c) * u
}
