import test from 'node:test'
import assert from 'node:assert/strict'
import { decode, encode, SAVE_BUILD } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { advance, createWorld } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { Faction, SCHEMA_VERSION } from '../src/sim/state.ts'
import { Reason } from '../src/sim/result.ts'

function populated(seed: number, n = 12) {
  const w = createWorld(seed)
  for (let i = 0; i < n; i++) {
    applyCommand(w, { kind: 'spawnAgent', x: i * 1300, y: i * 700, z: 0, faction: i % 4 === 0 ? Faction.JEFUITOR : Faction.ASEZARE })
  }
  return w
}

test('roundtrip-ul de save e un no-op observabil: 1000 + load + 1000 == 2000', () => {
  // Testul central al lui M5. Daca pica, save-ul pierde stare ascunsa undeva.
  const continuous = populated(555)
  advance(continuous, 2000)

  const interrupted = populated(555)
  advance(interrupted, 1000)
  const loaded = decode(encode(interrupted))
  assert.ok(loaded.ok, 'incarcarea a esuat')
  advance(loaded.value, 1000)

  assert.equal(hashWorld(loaded.value), hashWorld(continuous))
})

test('salvarea in mijlocul unei rulari reproduce exact evolutia originala', () => {
  const original = populated(31337)
  advance(original, 137)
  const snapshot = encode(original)
  advance(original, 500)

  const restored = decode(snapshot)
  assert.ok(restored.ok)
  advance(restored.value, 500)

  assert.equal(hashWorld(restored.value), hashWorld(original))
})

test('starea fluxurilor de RNG supravietuieste salvarii', () => {
  const w = populated(77)
  advance(w, 250)
  const loaded = decode(encode(w))
  assert.ok(loaded.ok)
  assert.equal(loaded.value.rng.agents.draws, w.rng.agents.draws)
  assert.equal(loaded.value.rng.agents.s0, w.rng.agents.s0)
  assert.equal(loaded.value.rng.combat.s3, w.rng.combat.s3)
})

test('un save dintr-un build mai NOU e refuzat, nu interpretat pe ghicite', () => {
  const w = populated(1)
  const env = JSON.parse(encode(w)) as Record<string, unknown>
  env.build = SAVE_BUILD + 1
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.CAPACITATE_DEPASITA)
    assert.equal(out.params.camp, 'build')
  }
})

test('o schema mai noua decat cea cunoscuta e refuzata', () => {
  const w = populated(1)
  const env = JSON.parse(encode(w)) as Record<string, unknown>
  env.schema = SCHEMA_VERSION + 1
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.params.camp, 'schema')
})

test('un save de la alt joc e refuzat', () => {
  const w = populated(1)
  const env = JSON.parse(encode(w)) as Record<string, unknown>
  env.game = 'altceva'
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
})

test('identitatile duplicate sunt prinse la incarcare, nu descoperite peste o ora', () => {
  const w = populated(9, 5)
  const env = JSON.parse(encode(w)) as { data: { agents: { id: number[] } } }
  env.data.agents.id[1] = env.data.agents.id[0]!
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.ENTITATE_INEXISTENTA)
    assert.equal(out.params.motiv, 'duplicat')
  }
})

test('un count mai mare decat capacitatea e refuzat', () => {
  const w = populated(9, 5)
  const env = JSON.parse(encode(w)) as { data: { agents: { count: number; capacity: number } } }
  env.data.agents.count = env.data.agents.capacity + 1
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.reason, Reason.CAPACITATE_DEPASITA)
})

test('un JSON stricat produce un refuz, nu o exceptie', () => {
  const out = decode('{ nu e json }')
  assert.equal(out.ok, false)
})

test('un flux de RNG lipsa e prins explicit', () => {
  const w = populated(2)
  const env = JSON.parse(encode(w)) as { data: { rng: Record<string, unknown> } }
  delete env.data.rng.combat
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.params.camp, 'rng.combat')
})

test('sloturile moarte nu se salveaza degeaba, dar indexii raman stabili', () => {
  const w = populated(12, 6)
  const second = w.agents.id[1]!
  applyCommand(w, { kind: 'killAgent', id: second })
  const loaded = decode(encode(w))
  assert.ok(loaded.ok)
  assert.equal(loaded.value.agents.count, 6)
  assert.equal(loaded.value.agents.alive[1], 0)
  assert.equal(hashWorld(loaded.value), hashWorld(w))
})
