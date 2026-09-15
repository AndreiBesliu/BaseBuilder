import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { advance, createWorld } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { CATEGORII, SCHEMA_VERSION } from '../src/sim/state.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { groundLevelM, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'

// Fixturi GOLDEN: fiecare a fost capturata cu codul de la schema ei, INAINTE de
// schimbare. Migrarea se dovedeste pe fisier, nu pe un obiect construit de
// codul nou — altfel testul ar verifica doar ca noul cod se citeste pe sine.

const SCHEMA1 = readFileSync(new URL('./fixtures/save-schema1.json', import.meta.url), 'utf8')

/** Exact lumea din care s-a capturat fixtura: seed 4242, 4 agenti pe sol, 300 de tickuri. */
function replica(): ReturnType<typeof createWorld> {
  const seed = 4242
  const w = createWorld(seed)
  let pusi = 0
  for (let k = 1; k <= 8000 && pusi < 4; k++) {
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(w.terrain, wx, wy)
    if (!g.ok) continue
    const sus = materialAt(w.terrain, wx, wy, g.value)
    if (!sus.ok || !isSolid(sus.value)) continue
    const r = applyCommand(w, { kind: 'spawnAgent', x: wx * 1000 + 500, y: wy * 1000 + 500, z: g.value + 1, faction: pusi % 4 === 0 ? 2 : 0 })
    if (r.ok) pusi++
  }
  assert.equal(pusi, 4)
  advance(w, 300)
  return w
}

test('fixtura de schema 1 e chiar de schema 1, capturata la tickul 300', () => {
  const env = JSON.parse(SCHEMA1) as { schema: number; savedAtTick: number }
  assert.equal(env.schema, 1)
  assert.equal(env.savedAtTick, 300)
  assert.ok(SCHEMA_VERSION > 1, 'testul asta exista pentru ca schema a crescut')
})

test('migrarea 1 -> 2: un save vechi se incarca fara joburi, fara desemnari, cu prioritatile implicite', () => {
  const out = decode(SCHEMA1)
  assert.ok(out.ok, `refuzat: ${JSON.stringify(out)}`)
  const w = out.value
  assert.equal(w.schema, SCHEMA_VERSION)
  assert.equal(w.tick, 300)
  assert.equal(w.agents.count, 4)
  assert.equal(w.desemnari.count, 0)
  assert.equal(w.desemnari.vii, 0)
  assert.equal(w.rezervari.total, 0)
  for (let i = 0; i < w.agents.count; i++) {
    assert.equal(w.agents.jobKind[i], 0)
    for (let c = 0; c < CATEGORII; c++) assert.equal(w.agents.prioPersonala[i * CATEGORII + c], DEFAULT_RULES.personalPriorityDefault)
  }
})

test('migrarea 1 -> 2 da EXACT lumea pe care codul nou ar fi construit-o: acelasi hash, aceeasi evolutie', () => {
  // Fara joburi, comportamentul de la schema 1 si cel de la schema 2 coincid.
  // Daca hash-ul difera, migrarea a inventat sau a pierdut stare.
  const migrat = decode(SCHEMA1)
  assert.ok(migrat.ok)
  const ref = replica()
  assert.equal(hashWorld(migrat.value), hashWorld(ref))
  advance(migrat.value, 300)
  advance(ref, 300)
  assert.equal(hashWorld(migrat.value), hashWorld(ref))
})

test('migrarea e idempotenta: save-ul rescris de codul nou se reincarca identic', () => {
  const unu = decode(SCHEMA1)
  assert.ok(unu.ok)
  const doi = decode(encode(unu.value))
  assert.ok(doi.ok)
  assert.equal(hashWorld(doi.value), hashWorld(unu.value))
  const env = JSON.parse(encode(unu.value)) as { schema: number }
  assert.equal(env.schema, SCHEMA_VERSION)
})
