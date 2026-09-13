import test from 'node:test'
import assert from 'node:assert/strict'
import { countNaiveFaces, Face, meshChunk } from '../src/render/mesher.ts'
import {
  CHUNK_CELLS,
  cellHeightCm,
  encodeAll,
  generateChunk,
  Material,
  promote,
  setVoxel,
  VOXEL_LEVELS,
} from '../src/sim/terrain/chunk.ts'
import type { Chunk } from '../src/sim/terrain/chunk.ts'
import { nextInt, stream } from '../src/sim/rng.ts'

const COLUMNS = CHUNK_CELLS * CHUNK_CELLS

/** Un chunk sintetic, complet gol, ca sa pot pune exact ce vreau in el. */
function emptyChunk(): Chunk {
  const chunk = generateChunk(1, 0, 0)
  const columns = new Uint8Array(COLUMNS * VOXEL_LEVELS)
  chunk.voxels = encodeAll(0, columns)
  return chunk
}

function areaOf(mesh: ReturnType<typeof meshChunk>): number {
  // Aria unui quad se deduce din colturile lui: doua laturi perpendiculare.
  let total = 0
  for (let q = 0; q < mesh.quadCount; q++) {
    const o = q * 12
    const ax = mesh.positions[o]!, ay = mesh.positions[o + 1]!, az = mesh.positions[o + 2]!
    const bx = mesh.positions[o + 3]!, by = mesh.positions[o + 4]!, bz = mesh.positions[o + 5]!
    const dx = mesh.positions[o + 9]!, dy = mesh.positions[o + 10]!, dz = mesh.positions[o + 11]!
    const du = Math.abs(bx - ax) + Math.abs(by - ay) + Math.abs(bz - az)
    const dv = Math.abs(dx - ax) + Math.abs(dy - ay) + Math.abs(dz - az)
    total += du * dv
  }
  return total
}

test('INVARIANTUL CENTRAL: unirea lacoma acopera exact aceleasi fete ca numararea naiva', () => {
  // Daca asta pica, mesh-ul fie pierde fete (gauri in geometrie), fie inventeaza
  // fete (suprapuneri). E singurul test care dovedeste ca unirea e corecta.
  const seed = 77
  for (const [cx, cy] of [[10, 10], [200, 33], [400, 400], [0, 0]] as const) {
    const chunk = generateChunk(seed, cx, cy)
    promote(seed, chunk)
    const naive = countNaiveFaces(chunk)
    const mesh = meshChunk(chunk)
    assert.equal(areaOf(mesh), naive, `aria nu corespunde la chunk (${cx},${cy})`)
  }
})

test('invariantul se tine si dupa sapaturi si constructii', () => {
  const seed = 88
  const chunk = generateChunk(seed, 50, 50)
  promote(seed, chunk)
  const rng = stream(seed, 'agents')
  const zBase = chunk.voxels!.zBaseM

  for (let i = 0; i < 400; i++) {
    const lx = nextInt(rng, CHUNK_CELLS)
    const ly = nextInt(rng, CHUNK_CELLS)
    const level = nextInt(rng, VOXEL_LEVELS)
    const m = nextInt(rng, 2) === 0 ? Material.AER : Material.PIATRA_CONSTRUITA
    setVoxel(chunk, lx, ly, zBase + level, m)
  }

  assert.equal(areaOf(meshChunk(chunk)), countNaiveFaces(chunk))
})

test('un singur voxel solid in gol da exact 6 quaduri de aria 1', () => {
  const chunk = emptyChunk()
  setVoxel(chunk, 10, 10, 20, Material.ROCA)
  const mesh = meshChunk(chunk)
  assert.equal(mesh.quadCount, 6)
  assert.equal(areaOf(mesh), 6)

  const seen = new Set(Array.from(mesh.faces))
  assert.equal(seen.size, 6, 'ar trebui cate o fata pe fiecare directie')
  for (let q = 0; q < mesh.quadCount; q++) assert.equal(mesh.materials[q], Material.ROCA)
})

test('un strat plin pe tot chunk-ul se uneste in 6 quaduri, nu in 6144', () => {
  // Asta e castigul, masurat: un strat de 32 × 32 are 1024 de fete sus, 1024 jos
  // si 128 pe laturi = 2176 de fete, care devin 6 quaduri.
  const chunk = emptyChunk()
  for (let ly = 0; ly < CHUNK_CELLS; ly++) {
    for (let lx = 0; lx < CHUNK_CELLS; lx++) {
      setVoxel(chunk, lx, ly, 30, Material.PIATRA_CONSTRUITA)
    }
  }
  const mesh = meshChunk(chunk)
  const naive = countNaiveFaces(chunk)

  assert.equal(naive, 32 * 32 * 2 + 32 * 4, 'numarul naiv de fete nu e cel asteptat')
  assert.equal(mesh.quadCount, 6, `unirea a produs ${mesh.quadCount} quaduri in loc de 6`)
  assert.equal(areaOf(mesh), naive)
})

test('un perete vertical de 20 × 8 devine un singur quad pe fiecare fata mare', () => {
  const chunk = emptyChunk()
  for (let level = 10; level < 18; level++) {
    for (let lx = 5; lx < 25; lx++) {
      setVoxel(chunk, lx, 16, level, Material.LEMN_CONSTRUIT)
    }
  }
  const mesh = meshChunk(chunk)
  const bigFaces = Array.from({ length: mesh.quadCount }, (_, q) => q).filter((q) => {
    const o = q * 12
    const du = Math.abs(mesh.positions[o + 3]! - mesh.positions[o]!)
    return du === 20
  })
  assert.ok(bigFaces.length >= 2, `peretele ar trebui sa aiba doua fete mari unite, are ${bigFaces.length}`)
  assert.equal(areaOf(mesh), countNaiveFaces(chunk))
})

test('quadurile stau in marginile chunk-ului', () => {
  const seed = 91
  const chunk = generateChunk(seed, 77, 77)
  promote(seed, chunk)
  const mesh = meshChunk(chunk)
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i]!
    const y = mesh.positions[i + 1]!
    const z = mesh.positions[i + 2]!
    assert.ok(x >= 0 && x <= CHUNK_CELLS, `x iesit: ${x}`)
    assert.ok(y >= 0 && y <= CHUNK_CELLS, `y iesit: ${y}`)
    assert.ok(z >= 0 && z <= VOXEL_LEVELS, `z iesit: ${z}`)
  }
})

test('mesh-ul e determinist', () => {
  const seed = 5
  const a = generateChunk(seed, 12, 12)
  promote(seed, a)
  const b = generateChunk(seed, 12, 12)
  promote(seed, b)
  const ma = meshChunk(a)
  const mb = meshChunk(b)
  assert.equal(ma.quadCount, mb.quadCount)
  assert.deepEqual(Array.from(ma.positions), Array.from(mb.positions))
  assert.deepEqual(Array.from(ma.materials), Array.from(mb.materials))
})

test('un chunk gol nu produce niciun quad', () => {
  const mesh = meshChunk(emptyChunk())
  assert.equal(mesh.quadCount, 0)
})

test('sapatul produce fete NOI, nu doar mai putine', () => {
  const seed = 61
  const chunk = generateChunk(seed, 30, 30)
  promote(seed, chunk)
  const before = countNaiveFaces(chunk)

  // O galerie in roca: scoate un voxel ingropat, care expune 6 fete interioare noi.
  const ground = Math.floor(cellHeightCm(chunk, 16, 16) / 100)
  setVoxel(chunk, 16, 16, ground - 8, Material.AER)
  const after = countNaiveFaces(chunk)

  assert.equal(after, before + 6, `o galerie in roca ar trebui sa expuna 6 fete, a expus ${after - before}`)
  assert.equal(areaOf(meshChunk(chunk)), after)
})

test('fetele de sus ale unui teren normal se unesc bine', () => {
  const seed = 101
  const chunk = generateChunk(seed, 150, 150)
  promote(seed, chunk)
  const mesh = meshChunk(chunk)
  let topQuads = 0
  let topArea = 0
  for (let q = 0; q < mesh.quadCount; q++) {
    if (mesh.faces[q] !== Face.Z_POS) continue
    topQuads++
    const o = q * 12
    const du = Math.abs(mesh.positions[o + 3]! - mesh.positions[o]!)
    const dv = Math.abs(mesh.positions[o + 10]! - mesh.positions[o + 1]!)
    topArea += du * dv
  }
  // Suprafata de sus acopera fix cele 1024 de celule ale chunk-ului.
  assert.equal(topArea, CHUNK_CELLS * CHUNK_CELLS, 'suprafata de sus nu acopera tot chunk-ul')
  assert.ok(topQuads < 1024, 'unirea nu a facut nimic pe suprafata')
})
