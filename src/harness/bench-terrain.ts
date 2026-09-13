/**
 * Masuratori de teren.
 *
 *   node src/harness/bench-terrain.ts
 *
 * Verifica cifrele pe care planul le-a promis: 400 de chunk-uri rezidente,
 * ~16 KB pentru un chunk de fortareata, ~3,2 MB pentru toata asezarea.
 * Un plan care contine numere si nu le masoara niciodata e o lista de dorinte.
 */

import { CHUNK_CELLS, runCount, VOXEL_LEVELS } from '../sim/terrain/chunk.ts'
import { createTerrain, dig, groundLevelM, promotedCount, promoteWithApron, setFocus } from '../sim/terrain/terrain.ts'
import { nextInt, stream } from '../sim/rng.ts'

const SEED = 20260913

function ms(label: string, fn: () => void): number {
  const t0 = performance.now()
  fn()
  const dt = performance.now() - t0
  console.log(`${label.padEnd(46)} ${dt.toFixed(1).padStart(8)} ms`)
  return dt
}

console.log('--- streaming ---')
const t = createTerrain(SEED, 11)
ms('setFocus, raza 11 (disc rezident, la rece)', () => setFocus(t, 200, 200))
console.log(`${'chunk-uri rezidente'.padEnd(46)} ${String(t.keys.length).padStart(8)}`)

ms('setFocus, mutare cu 1 chunk (incremental)', () => setFocus(t, 201, 200))
ms('setFocus, sarit la 300 de chunk-uri distanta', () => setFocus(t, 500, 500))

console.log('\n--- promovare ---')
const p = createTerrain(SEED, 11)
setFocus(p, 200, 200)
ms('promovarea unui chunk + apron (9 chunk-uri)', () => promoteWithApron(p, 200, 200))

function bytesOf(terrain: ReturnType<typeof createTerrain>): number {
  let total = 0
  for (const key of terrain.keys) {
    const v = terrain.chunks.get(key)!.voxels
    if (!v) continue
    // runMaterial + runLength (1 B fiecare) + columnStart (4 B)
    total += runCount(v) * 2 + v.columnStart.length * 4
  }
  return total
}

const afterApron = bytesOf(p)
console.log(`${'memorie, 9 chunk-uri proaspat promovate'.padEnd(46)} ${(afterApron / 1024).toFixed(1).padStart(8)} KB`)
console.log(`${'  din care, per chunk'.padEnd(46)} ${(afterApron / 9 / 1024).toFixed(1).padStart(8)} KB`)

console.log('\n--- o fortareata sapata ---')
const f = createTerrain(SEED, 11)
setFocus(f, 300, 300)
const rng = stream(SEED, 'worldgen')
const baseX = 300 * CHUNK_CELLS
const baseY = 300 * CHUNK_CELLS

// Sapa intens intr-o zona de 4 × 4 chunk-uri: o fortareata plauzibila.
const digSpan = CHUNK_CELLS * 4
let ok = 0
const digTime = ms('20.000 de sapaturi intr-o zona de 128 m', () => {
  for (let i = 0; i < 20000; i++) {
    const wx = baseX + nextInt(rng, digSpan)
    const wy = baseY + nextInt(rng, digSpan)
    const g = groundLevelM(f, wx, wy)
    if (!g.ok) continue
    const z = g.value - nextInt(rng, 12)
    if (dig(f, wx, wy, z).ok) ok++
  }
})
console.log(`${'  sapaturi reusite'.padEnd(46)} ${String(ok).padStart(8)}`)
console.log(`${'  per sapatura'.padEnd(46)} ${((digTime * 1000) / 20000).toFixed(2).padStart(8)} µs`)

const promoted = promotedCount(f)
const bytes = bytesOf(f)
console.log(`${'chunk-uri promovate'.padEnd(46)} ${String(promoted).padStart(8)}`)
console.log(`${'memorie de voxeli'.padEnd(46)} ${(bytes / 1024).toFixed(1).padStart(8)} KB`)
console.log(`${'  per chunk promovat'.padEnd(46)} ${(bytes / promoted / 1024).toFixed(1).padStart(8)} KB`)

const uncompressed = promoted * CHUNK_CELLS * CHUNK_CELLS * VOXEL_LEVELS
console.log(`${'  fara RLE ar fi fost'.padEnd(46)} ${(uncompressed / 1024).toFixed(1).padStart(8)} KB`)
console.log(`${'  raport de compresie'.padEnd(46)} ${(uncompressed / bytes).toFixed(1).padStart(8)} ×`)

console.log('\n--- extrapolare la bugetul din plan ---')
const perChunk = bytes / promoted
console.log(`200 de chunk-uri de fortareata: ${((perChunk * 200) / 1024 / 1024).toFixed(2)} MB (planul spunea ~3,2 MB)`)
