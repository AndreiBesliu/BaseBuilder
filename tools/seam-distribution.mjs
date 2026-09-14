/**
 * Masoara CUSATURA (K16) si eroarea de varf din heightfield.
 *
 *   node tools/seam-distribution.mjs
 *
 * K16 — granita dintre chunk-urile ne-promovate (heightfield, cote fractionare)
 * si cele promovate (voxeli, cote intregi) — e riscul numarul unu al arhitecturii
 * si pana acum era descris, nu masurat. Aici capata o cifra.
 */

import { createTerrain, setFocus } from '../src/sim/terrain/terrain.ts'
import { CHUNK_CELLS, cellHeightCm, groundLevelFromCm } from '../src/sim/terrain/chunk.ts'

const SEED = 20260913
const t = createTerrain(SEED, 6)
setFocus(t, 300, 300)
const VERTS = CHUNK_CELLS + 1

console.log('--- heightfield: cota CELULEI pusa in COLTUL retelei ---')
let n = 0
let sumAbs = 0
let maxAbs = 0
for (const key of t.keys) {
  const c = t.chunks.get(key)
  for (let vy = 0; vy <= CHUNK_CELLS; vy++) {
    for (let vx = 0; vx <= CHUNK_CELLS; vx++) {
      const lx = Math.min(vx, CHUNK_CELLS - 1)
      const ly = Math.min(vy, CHUNK_CELLS - 1)
      const folosit = cellHeightCm(c, lx, ly) / 100
      const corect = c.vertexCm[vy * VERTS + vx] / 100
      const e = Math.abs(folosit - corect)
      n++
      sumAbs += e
      if (e > maxAbs) maxAbs = e
    }
  }
}
console.log(`  varfuri verificate      ${n.toLocaleString('ro-RO')}  (${t.keys.length} chunk-uri)`)
console.log(`  eroare medie absoluta   ${(sumAbs / n).toFixed(3)} m`)
console.log(`  eroare maxima           ${maxAbs.toFixed(3)} m`)

console.log('')
console.log('--- K16: fata de sus a voxelului minus suprafata heightfield ---')
function stat(name, f) {
  let k = 0
  let sum = 0
  let abs = 0
  let max = -1e9
  let min = 1e9
  for (const key of t.keys) {
    const c = t.chunks.get(key)
    for (let ly = 0; ly < CHUNK_CELLS; ly++) {
      for (let lx = 0; lx < CHUNK_CELLS; lx++) {
        const h = cellHeightCm(c, lx, ly) / 100
        const e = f(h) - h
        k++
        sum += e
        abs += Math.abs(e)
        if (e > max) max = e
        if (e < min) min = e
      }
    }
  }
  console.log(
    `  ${name.padEnd(22)} medie ${(sum / k).toFixed(3).padStart(7)} m · |medie| ${(abs / k).toFixed(3)} m · interval [${min.toFixed(2)}, ${max.toFixed(2)}]`,
  )
}
stat('vechi: floor(h) + 1', (h) => Math.floor(h) + 1)
stat('acum: groundLevel + 1', (h) => groundLevelFromCm(Math.round(h * 100)) + 1)
