/**
 * Masuratori pe fixtura M10 — cifrele care intra in predictia sigilata a gate-ului.
 *
 *   node src/harness/bench-fixture.ts
 *
 * Tot ce scrie aici e masurat in Node, NU in renderer: alt tier de JIT, alta
 * presiune de memorie, si fara concurenta cu randarea pe acelasi thread. Nu se
 * aduna pe hartie cu timpii de cadru din browser — se re-masoara acolo, iar o
 * diferenta peste 30% invalideaza bugetul din PLAN §2.
 */

import { meshChunk } from '../render/mesher.ts'
import { CHUNK_CELLS, VOXEL_LEVELS, runCount } from '../sim/terrain/chunk.ts'
import type { Terrain } from '../sim/terrain/terrain.ts'
import { dig, groundLevelM } from '../sim/terrain/terrain.ts'
import { makeM10, SETTLEMENT_CHUNKS } from './fixture-m10.ts'

const SEED = 20260913
const CX = 300
const CY = 300

function pad(label: string, value: string): void {
  console.log(`${label.padEnd(46)} ${value.padStart(12)}`)
}

const t0 = performance.now()
const { terrain, stats } = makeM10(SEED, CX, CY, 11)
const buildMs = performance.now() - t0

console.log('--- fixtura M10 ---')
pad('camere', String(stats.rooms))
pad('sapaturi acceptate', stats.digsAccepted.toLocaleString('ro-RO'))
pad('zidiri acceptate', stats.fillsAccepted.toLocaleString('ro-RO'))
pad('chunk-uri rezidente', String(stats.residentChunks))
pad('chunk-uri promovate', String(stats.promotedChunks))
pad('constructie', `${buildMs.toFixed(0)} ms`)

function meshAll(terr: Terrain): { quads: number; ms: number; chunks: number } {
  const t1 = performance.now()
  let quads = 0
  let chunks = 0
  for (const key of terr.keys) {
    const c = terr.chunks.get(key)!
    if (!c.voxels) continue
    quads += meshChunk(c).quadCount
    chunks++
  }
  return { quads, ms: performance.now() - t1, chunks }
}

console.log('')
console.log('--- meshing complet ---')
meshAll(terrain) // incalzire
const full = meshAll(terrain)
pad('chunk-uri meshuite', String(full.chunks))
pad('quaduri', full.quads.toLocaleString('ro-RO'))
pad('triunghiuri', (full.quads * 2).toLocaleString('ro-RO'))
pad('timp total', `${full.ms.toFixed(1)} ms`)
pad('  per chunk', `${((full.ms * 1000) / full.chunks).toFixed(0)} µs`)

console.log('')
console.log('--- costul unei sapaturi ---')
// Cele doua costuri se masoara SEPARAT. Prima incercare le-a amestecat si a
// produs 2,73 ms/sapatura: bucla apela meshChunk de 200 de ori, dar imparte la
// sapaturile ACCEPTATE — 144 din 200, restul loveau aer deja sapat. Factorul de
// 1,4× venea din numarator, nu din cod. Exact tiparul „suspecteaza instrumentul".
const midCx = CX + (SETTLEMENT_CHUNKS >> 1)
const midCy = CY + (SETTLEMENT_CHUNKS >> 1)
const mid = terrain.chunks.get(midCy * 512 + midCx)!
const baseX = midCx * CHUNK_CELLS
const baseY = midCy * CHUNK_CELLS

meshChunk(mid) // incalzire
const MESH_ITERS = 200
const tMesh = performance.now()
for (let i = 0; i < MESH_ITERS; i++) meshChunk(mid)
const meshUs = ((performance.now() - tMesh) / MESH_ITERS) * 1000

let attempted = 0
let accepted = 0
const tDig = performance.now()
for (let i = 0; i < 200; i++) {
  const wx = baseX + (i % 16)
  const wy = baseY + ((i * 7) % 16)
  const g = groundLevelM(terrain, wx, wy)
  if (!g.ok) continue
  attempted++
  if (dig(terrain, wx, wy, g.value - 6 - (i % 9)).ok) accepted++
}
const digUs = ((performance.now() - tDig) / Math.max(1, accepted)) * 1000

pad('dig in sim, fara mesh', `${digUs.toFixed(1)} µs`)
pad('  acceptate / incercate', `${accepted} / ${attempted}`)
pad('remesh, 1 chunk de asezare', `${meshUs.toFixed(0)} µs`)
pad('  remesh 3×3, cat platea viewerul', `${((meshUs * 9) / 1000).toFixed(2)} ms`)
pad('  remesh complet, toata asezarea', `${full.ms.toFixed(0)} ms`)

console.log('')
console.log('--- memorie ---')
let bytes = 0
for (const key of terrain.keys) {
  const v = terrain.chunks.get(key)!.voxels
  if (!v) continue
  bytes += runCount(v) * 2 + v.columnStart.length * 4
}
pad('voxeli (RLE)', `${(bytes / 1024 / 1024).toFixed(2)} MB`)
pad('  fara RLE ar fi fost', `${((stats.promotedChunks * CHUNK_CELLS * CHUNK_CELLS * VOXEL_LEVELS) / 1024 / 1024).toFixed(1)} MB`)
