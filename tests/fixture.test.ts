import test from 'node:test'
import assert from 'node:assert/strict'
import { buildM10, makeM10, ROOM_DEPTH, ROOM_INNER, SETTLEMENT_CHUNKS } from '../src/harness/fixture-m10.ts'
import { createTerrain, groundLevelM, materialAt, promotedCount, setFocus } from '../src/sim/terrain/terrain.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { createWorld } from '../src/sim/world.ts'

// Fixtura de gate se valideaza pe proprietati STRUCTURALE, nu pe raportul de
// reducere al mesher-ului. Validarea prin raport e auto-referentiala: selecteaza
// fixturi ieftine de meshuit, adica exact fixturile pe care un motor slab le trece.

test('fixtura M10 promoveaza cat bugetul din plan, nu cat viewerul', () => {
  const { stats } = makeM10(20260913, 300, 300, 11)
  // PLAN §2 bugeteaza ~200 de chunk-uri de fortareata. Fortareata din viewer
  // promoveaza 12 — un gate rulat pe ea trece cu orice stiva.
  assert.ok(stats.promotedChunks >= 180, `doar ${stats.promotedChunks} chunk-uri promovate`)
  assert.ok(stats.promotedChunks <= 400, `${stats.promotedChunks} e peste orice asezare plauzibila`)
  assert.ok(stats.rooms > 500, `doar ${stats.rooms} camere`)
  assert.ok(stats.digsAccepted > 150000, `doar ${stats.digsAccepted} sapaturi`)
})

test('fixtura M10 e reproductibila bit cu bit', () => {
  // Daca asta pica, doua rulari de gate masoara doua lumi diferite si orice
  // comparatie intre ele citeste zgomot ca semnal.
  const a = createWorld(4242)
  setFocus(a.terrain, 300, 300)
  buildM10(a.terrain, 300, 300)

  const b = createWorld(4242)
  setFocus(b.terrain, 300, 300)
  buildM10(b.terrain, 300, 300)

  assert.equal(hashWorld(a), hashWorld(b))
})

test('camerele fixturii chiar sunt goale pe dinauntru', () => {
  // Fara asta, o regresie in `dig` ar produce o fixtura solida care meshuieste
  // instant, iar gate-ul ar trece pe o asezare care nu exista.
  const t = createTerrain(20260913, 11)
  setFocus(t, 300, 300)
  const stats = buildM10(t, 300, 300)
  assert.equal(promotedCount(t), stats.promotedChunks)

  const baseX = 300 * 32
  const baseY = 300 * 32
  const margin = 3 // (ROOM_PITCH - ROOM_INNER) / 2, adica offsetul primei camere

  let hollow = 0
  let probed = 0
  for (let room = 0; room < 8; room++) {
    const rx = baseX + margin + room * 16 + (ROOM_INNER >> 1)
    const ry = baseY + margin + room * 16 + (ROOM_INNER >> 1)
    const g = groundLevelM(t, rx, ry)
    if (!g.ok) continue
    for (let d = 1; d <= ROOM_DEPTH; d++) {
      const m = materialAt(t, rx, ry, g.value - d)
      if (!m.ok) continue
      probed++
      if (m.value === Material.AER) hollow++
    }
  }
  assert.ok(probed > 0, 'nicio camera sondata')
  assert.equal(hollow, probed, `${probed - hollow} din ${probed} celule de camera nu sunt goale`)
})

test('asezarea incape in lume', () => {
  const span = SETTLEMENT_CHUNKS * 32
  assert.ok(300 * 32 + span < 512 * 32, 'fixtura iese din lume la coltul ales')
})

test('fixtura contine si constructie deasupra solului, nu doar sapaturi', () => {
  const { stats } = makeM10(20260913, 300, 300, 11)
  assert.ok(stats.fillsAccepted > 1000, `doar ${stats.fillsAccepted} zidiri`)
})
