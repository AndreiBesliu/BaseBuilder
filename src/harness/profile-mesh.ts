/**
 * Profilare prin ablatie a mesher-ului.
 *
 *   node src/harness/profile-mesh.ts
 *
 * Nu ghicesc unde se duce timpul — il masor pe etape. Lectia din research e
 * explicita: comunitatea ONI spunea „pathfinding = 80% din frame time", cea a lui
 * Dwarf Fortress spunea 5-6%, iar dezvoltatorul lui Going Medieval spunea ca la el
 * era garbage temporar. Toti trei erau siguri. Doar unul masurase.
 */

import { CHUNK_CELLS, decodeColumn, isSolid, VOXEL_LEVELS } from '../sim/terrain/chunk.ts'
import type { Chunk } from '../sim/terrain/chunk.ts'
import { createTerrain, dig, groundLevelM, setFocus } from '../sim/terrain/terrain.ts'
import { nextInt, stream } from '../sim/rng.ts'
import { meshChunk } from '../render/mesher.ts'

const SX = CHUNK_CELLS
const SY = CHUNK_CELLS
const SZ = VOXEL_LEVELS
const ROWS = SY * SZ

const dense = new Uint8Array(SX * SY * SZ)
const solid = new Uint32Array(ROWS)
const column = new Uint8Array(SZ)
const grid = new Uint8Array(Math.max(SY * SZ, SX * SZ, SX * SY))

function expandOnly(chunk: Chunk): void {
  const v = chunk.voxels!
  solid.fill(0)
  for (let ly = 0; ly < SY; ly++) {
    for (let lx = 0; lx < SX; lx++) {
      decodeColumn(v, ly * SX + lx, column)
      const bit = 1 << lx
      for (let level = 0; level < SZ; level++) {
        const m = column[level]!
        dense[level * SX * SY + ly * SX + lx] = m
        if (isSolid(m)) solid[level * SY + ly]! |= bit
      }
    }
  }
}

function decodeOnly(chunk: Chunk): void {
  const v = chunk.voxels!
  for (let c = 0; c < SX * SY; c++) decodeColumn(v, c, column)
}

/** Cat costa doar umplerea grilelor, fara unire si fara emitere. */
function gridFillOnly(): void {
  for (let lx = 0; lx < SX; lx++) {
    for (let level = 0; level < SZ; level++) {
      for (let ly = 0; ly < SY; ly++) grid[level * SY + ly] = dense[level * SX * SY + ly * SX + lx]!
    }
  }
  for (let ly = 0; ly < SY; ly++) {
    for (let level = 0; level < SZ; level++) {
      for (let lx = 0; lx < SX; lx++) grid[level * SX + lx] = dense[level * SX * SY + ly * SX + lx]!
    }
  }
  for (let level = 0; level < SZ; level++) {
    for (let ly = 0; ly < SY; ly++) {
      for (let lx = 0; lx < SX; lx++) grid[ly * SX + lx] = dense[level * SX * SY + ly * SX + lx]!
    }
  }
}

function bench(label: string, iterations: number, fn: () => void): number {
  fn()
  const t0 = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const us = ((performance.now() - t0) / iterations) * 1000
  console.log(`${label.padEnd(46)} ${us.toFixed(1).padStart(8)} µs`)
  return us
}

const SEED = 20260913
const t = createTerrain(SEED, 4)
setFocus(t, 250, 250)
const baseX = 250 * CHUNK_CELLS
const baseY = 250 * CHUNK_CELLS
const g = groundLevelM(t, baseX, baseY)
if (!g.ok) throw new Error('teren indisponibil')
dig(t, baseX, baseY, g.value)
const chunk = t.chunks.get(250 * 512 + 250)!

console.log('--- chunk proaspat promovat ---')
const whole = bench('meshChunk (tot)', 200, () => void meshChunk(chunk))
const dec = bench('  doar decodeColumn × 1024', 200, () => decodeOnly(chunk))
const exp = bench('  expand (decode + dense + masti)', 200, () => expandOnly(chunk))
expandOnly(chunk)
const fill = bench('  doar umplerea celor 3 grile', 200, () => gridFillOnly())

console.log('')
console.log(`expand         = ${((exp / whole) * 100).toFixed(0)}% din total`)
console.log(`  din care decode = ${((dec / exp) * 100).toFixed(0)}% din expand`)
console.log(`umplerea grilelor = ${((fill / whole) * 100).toFixed(0)}% din total`)
console.log(`rest (vizibilitate + unire + emitere) = ${(((whole - exp - fill) / whole) * 100).toFixed(0)}%`)

console.log('\n--- acelasi chunk, sapat intens ---')
const rng = stream(SEED, 'worldgen')
for (let i = 0; i < 4000; i++) {
  const wx = baseX + nextInt(rng, CHUNK_CELLS)
  const wy = baseY + nextInt(rng, CHUNK_CELLS)
  const gg = groundLevelM(t, wx, wy)
  if (!gg.ok) continue
  dig(t, wx, wy, gg.value - nextInt(rng, 14))
}
const whole2 = bench('meshChunk (tot)', 200, () => void meshChunk(chunk))
const exp2 = bench('  expand', 200, () => expandOnly(chunk))
expandOnly(chunk)
const fill2 = bench('  doar umplerea celor 3 grile', 200, () => gridFillOnly())
console.log('')
console.log(`expand = ${((exp2 / whole2) * 100).toFixed(0)}%, grile = ${((fill2 / whole2) * 100).toFixed(0)}%, rest = ${(((whole2 - exp2 - fill2) / whole2) * 100).toFixed(0)}%`)
