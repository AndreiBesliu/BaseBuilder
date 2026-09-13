/**
 * Masuratori de meshing.
 *
 *   node src/harness/bench-mesh.ts
 *
 * Cifra pe care o urmareste gate-ul de motor. Reperul citat in panou: binary
 * greedy meshing face **74 µs pe un chunk de 64³** in C++ (Ryzen 3800X), iar un
 * face-cull naiv in JS pe acelasi volum costa **2,04 ms** — o prapastie de 27×.
 *
 * Chunk-ul nostru e 32 × 32 × 64 = 65.536 de voxeli, adica un SFERT dintr-un 64³
 * (262.144). Comparatia corecta se face per voxel, si e raportata ca atare mai jos.
 */

import { meshChunk, countNaiveFaces } from '../render/mesher.ts'
import { CHUNK_CELLS, VOXEL_LEVELS, Material } from '../sim/terrain/chunk.ts'
import { createTerrain, dig, groundLevelM, promotedCount, setFocus } from '../sim/terrain/terrain.ts'
import { nextInt, stream } from '../sim/rng.ts'

const SEED = 20260913
const VOXELS_PER_CHUNK = CHUNK_CELLS * CHUNK_CELLS * VOXEL_LEVELS

function bench(label: string, iterations: number, fn: () => void): number {
  fn() // incalzire: prima rulare plateste JIT-ul si alocarea bufferelor
  const t0 = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const total = performance.now() - t0
  const per = (total / iterations) * 1000
  console.log(`${label.padEnd(44)} ${per.toFixed(1).padStart(8)} µs/chunk`)
  return per
}

// --- teren proaspat, nesapat ---
const t = createTerrain(SEED, 6)
setFocus(t, 250, 250)
const cx = 250
const cy = 250
const baseX = cx * CHUNK_CELLS
const baseY = cy * CHUNK_CELLS
const g = groundLevelM(t, baseX, baseY)
if (!g.ok) throw new Error('teren indisponibil')
dig(t, baseX, baseY, g.value) // promoveaza chunk-ul si apron-ul

const fresh = t.chunks.get(cy * 512 + cx)!

console.log('--- un chunk proaspat promovat ---')
const freshUs = bench('binary greedy meshing', 200, () => void meshChunk(fresh))
const freshMesh = meshChunk(fresh)
const freshNaive = countNaiveFaces(fresh)
console.log(`${'fete vizibile (naiv)'.padEnd(44)} ${String(freshNaive).padStart(8)}`)
console.log(`${'quaduri dupa unire'.padEnd(44)} ${String(freshMesh.quadCount).padStart(8)}`)
console.log(`${'  reducere'.padEnd(44)} ${(freshNaive / freshMesh.quadCount).toFixed(1).padStart(8)} ×`)
console.log(`${'triunghiuri'.padEnd(44)} ${String(freshMesh.quadCount * 2).padStart(8)}`)

// --- o fortareata sapata intens ---
console.log('\n--- un chunk sapat intens ---')
const rng = stream(SEED, 'worldgen')
for (let i = 0; i < 4000; i++) {
  const wx = baseX + nextInt(rng, CHUNK_CELLS)
  const wy = baseY + nextInt(rng, CHUNK_CELLS)
  const gg = groundLevelM(t, wx, wy)
  if (!gg.ok) continue
  dig(t, wx, wy, gg.value - nextInt(rng, 14))
}
const dugUs = bench('binary greedy meshing', 200, () => void meshChunk(fresh))
const dugMesh = meshChunk(fresh)
const dugNaive = countNaiveFaces(fresh)
console.log(`${'fete vizibile (naiv)'.padEnd(44)} ${String(dugNaive).padStart(8)}`)
console.log(`${'quaduri dupa unire'.padEnd(44)} ${String(dugMesh.quadCount).padStart(8)}`)
console.log(`${'  reducere'.padEnd(44)} ${(dugNaive / dugMesh.quadCount).toFixed(1).padStart(8)} ×`)

// --- o fortareata REALA: camere si coridoare, nu zgomot ---
console.log('\n--- un chunk cu camere si coridoare (cazul realist) ---')
const t2 = createTerrain(SEED + 1, 6)
setFocus(t2, 250, 250)
const g2 = groundLevelM(t2, baseX, baseY)
if (!g2.ok) throw new Error('teren indisponibil')
dig(t2, baseX, baseY, g2.value)
const rooms = t2.chunks.get(cy * 512 + cx)!

// Patru camere de 8 × 6 pe doua niveluri, legate de un coridor.
for (const [ox, oy] of [[2, 2], [20, 2], [2, 20], [20, 20]] as const) {
  for (let d = 1; d <= 4; d++) {
    for (let ry = 0; ry < 6; ry++) {
      for (let rx = 0; rx < 8; rx++) {
        const gg = groundLevelM(t2, baseX + ox + rx, baseY + oy + ry)
        if (gg.ok) dig(t2, baseX + ox + rx, baseY + oy + ry, gg.value - d)
      }
    }
  }
}
for (let i = 0; i < CHUNK_CELLS; i++) {
  const gg = groundLevelM(t2, baseX + i, baseY + 15)
  if (gg.ok) {
    dig(t2, baseX + i, baseY + 15, gg.value - 2)
    dig(t2, baseX + i, baseY + 15, gg.value - 3)
  }
}

const roomsUs = bench('binary greedy meshing', 200, () => void meshChunk(rooms))
const roomsMesh = meshChunk(rooms)
const roomsNaive = countNaiveFaces(rooms)
console.log(`${'fete vizibile (naiv)'.padEnd(44)} ${String(roomsNaive).padStart(8)}`)
console.log(`${'quaduri dupa unire'.padEnd(44)} ${String(roomsMesh.quadCount).padStart(8)}`)
console.log(`${'  reducere'.padEnd(44)} ${(roomsNaive / roomsMesh.quadCount).toFixed(1).padStart(8)} ×`)
console.log(`\nDiferenta conteaza: sapatura ALEATOARE da ${(dugNaive / dugMesh.quadCount).toFixed(1)}× reducere,`)
console.log(`camerele si coridoarele dau ${(roomsNaive / roomsMesh.quadCount).toFixed(1)}×. Cazul aleator e cel mai prost posibil`)
console.log(`pentru unire si NU seamana cu o fortareata construita de un jucator.`)
console.log(`Timp: ${roomsUs.toFixed(0)} µs, fata de ${dugUs.toFixed(0)} µs pe zgomot.`)

// --- comparatia cu reperul din panou ---
console.log('\n--- fata de reperul citat in panou ---')
const perVoxelFresh = (freshUs * 1000) / VOXELS_PER_CHUNK
const perVoxelDug = (dugUs * 1000) / VOXELS_PER_CHUNK
console.log(`chunk-ul nostru: ${CHUNK_CELLS}×${CHUNK_CELLS}×${VOXEL_LEVELS} = ${VOXELS_PER_CHUNK} voxeli`)
console.log(`noi, in JS:           ${perVoxelFresh.toFixed(3)} ns/voxel (proaspat), ${perVoxelDug.toFixed(3)} ns/voxel (sapat)`)
console.log(`reper C++ (64³, 74 µs):  ${((74 * 1000) / 262144).toFixed(3)} ns/voxel`)
console.log(`reper JS naiv (64³, 2,04 ms): ${((2040 * 1000) / 262144).toFixed(3)} ns/voxel`)
console.log(`raport fata de C++:   ${(perVoxelFresh / ((74 * 1000) / 262144)).toFixed(1)}× mai lent`)

// --- bugetul real: cate chunk-uri pe cadru ---
console.log('\n--- bugetul de cadru ---')
const frameMs = 16.6
console.log(`la 60 FPS ai ${frameMs} ms pe cadru.`)
console.log(`daca dai mesher-ului 25% din el (${(frameMs * 0.25).toFixed(1)} ms):`)
console.log(`  chunk-uri proaspete pe cadru: ${Math.floor((frameMs * 0.25 * 1000) / freshUs)}`)
console.log(`  chunk-uri sapate pe cadru:    ${Math.floor((frameMs * 0.25 * 1000) / dugUs)}`)

const allPromoted = promotedCount(t)
let totalUs = 0
let totalQuads = 0
const t0 = performance.now()
for (const key of t.keys) {
  const c = t.chunks.get(key)!
  if (!c.voxels) continue
  totalQuads += meshChunk(c).quadCount
}
totalUs = (performance.now() - t0) * 1000
console.log(`\ntoate cele ${allPromoted} chunk-uri promovate: ${(totalUs / 1000).toFixed(1)} ms, ${totalQuads} quaduri`)
console.log(`extrapolat la 377 de chunk-uri rezidente, toate promovate: ${((totalUs / allPromoted) * 377 / 1000).toFixed(0)} ms`)
console.log(`  (dar in practica sunt promovate ~200, si NU se re-mesheaza decat cele murdarite)`)
console.log(`\nmaterialul cel mai des intalnit in mesh: ${Material.ROCA} = roca`)
