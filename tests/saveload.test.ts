import test from 'node:test'
import assert from 'node:assert/strict'
import { decode, encode, SAVE_BUILD } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { advance, createWorld } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { Faction, SCHEMA_VERSION } from '../src/sim/state.ts'
import { Reason } from '../src/sim/result.ts'
import { groundLevelM, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'
import { FelJob, Item, Nevoie, NEVOI, Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { desemneaza, lasaItem, laSit, picteaza, R, solid, solidLaDistanta } from './fixturi.ts'

/**
 * Agenti asezati PE SOL.
 *
 * Prima versiune ii nastea la `z = 0`, iar solul de sub ei e la zeci de metri
 * diferenta. Un agent in aer nu ajunge in nicio regiune, deci nu isi alege tinta,
 * nu cere drum, nu trage din RNG si nu se misca. Masurat pe fixtura veche: dupa
 * 2000 de tickuri, 0 din 12 agenti se mutasera, 0 trageri din fluxul `agents`,
 * 0 drumuri, 0 chunk-uri promovate.
 *
 * Adica testul central al lui M5 — „1000 + load + 1000 == 2000" — compara doua
 * lumi in care nu se intampla NIMIC. Nu poate deveni rosu. A stat asa de la
 * felia 1, si a fost declarat in DEVLOG drept „dovedit ca no-op observabil".
 */
function populated(seed: number, n = 12) {
  const w = createWorld(seed)
  let pusi = 0
  for (let k = 1; k <= 8000 && pusi < n; k++) {
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(w.terrain, wx, wy)
    if (!g.ok) continue
    const sus = materialAt(w.terrain, wx, wy, g.value)
    if (!sus.ok || !isSolid(sus.value)) continue
    const r = applyCommand(w, {
      kind: 'spawnAgent',
      x: wx * 1000 + 500,
      y: wy * 1000 + 500,
      z: g.value + 1,
      faction: pusi % 4 === 0 ? Faction.JEFUITOR : Faction.ASEZARE,
    })
    if (r.ok) pusi++
  }
  assert.equal(pusi, n, 'fixtura n-a reusit sa aseze toti agentii pe sol')
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

/**
 * O lume in care chiar se intampla ceva.
 *
 * `populated` de mai sus a fost reparata odata — agentii se nasteau la `z = 0`,
 * deci nu se miscau deloc — si a murit a doua oara, altfel: se misca, dar in 2000
 * de tickuri singurul fel de job pe care il iau vreodata e DOARME. Zero desemnari,
 * zero iteme, zero zone, `jobConsumat` si `caraCantitate` mereu nule.
 *
 * Adica orice camp PERSISTED al taieturilor 2 si 3 putea fi scos din `encode` si
 * M5 ramanea verde. Unul CHIAR era: `jobConsumat` se hashuia, `decode` il citea,
 * dar `encode` nu-l scria niciodata. A stat asa pana la recenzia din 19.09.
 *
 * Fixtura asta pune ce lipsea: sapaturi, marfa, un depozit, hrana si santiere.
 * Contoarele de viata din test sunt partea care conteaza — fara ele, moartea a
 * treia oara ar arata exact ca vietile de pana acum.
 */
function lumeBogata(seed: number): World {
  const { w, sit } = laSit(seed, 6)
  for (let i = 0; i < 4; i++) {
    const t = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3 + i, 8)
    desemneaza(w, t.wx, t.wy)
  }
  picteaza(w, sit.wx + 2, sit.wy + 3, 3)
  for (let i = 0; i < 3; i++) lasaItem(w, Item.PIATRA, 20, sit.wx + 5 + i, sit.wy + 6)
  lasaItem(w, Item.HRANA, 75, sit.wx + 1, sit.wy + 1)
  // Foamea se pune direct: altfel masa vine dupa mii de tickuri, si testul ar
  // masura rabdarea, nu roundtrip-ul.
  for (let i = 0; i < w.agents.count; i++) w.agents.nevoi[i * NEVOI + Nevoie.FOAME] = 200
  for (let i = 0; i < 2; i++) {
    const g = solid(w, sit.wx + 4 + i, sit.wy + 1)
    if (g !== null) applyCommand(w, { kind: 'desemneaza', wx: sit.wx + 4 + i, wy: sit.wy + 1, z: g + 1, piesa: Piesa.PERETE }, R)
  }
  return w
}


test('M5 pe o lume in care chiar se intampla ceva — si care se PROBEAZA ca atare', () => {
  // Acelasi enunt ca testul central de sus („1000 + load + 1000 == 2000"), dar pe o
  // lume care sapa, cara, mananca si zideste. Pe `populated` el nu putea deveni rosu:
  // acolo nu exista niciun job in afara de DOARME, deci orice camp PERSISTED al
  // taieturilor 2 si 3 putea lipsi din `encode` fara ca nimic sa se schimbe. Unul
  // CHIAR lipsea — `jobConsumat` — si a trecut neobservat pana pe 19.09.2026.
  const N = 400
  const continuu = lumeBogata(12345)
  const intrerupt = lumeBogata(12345)
  assert.equal(hashWorld(continuu), hashWorld(intrerupt), 'fixtura nu e determinista')

  advance(continuu, 2 * N, R)

  advance(intrerupt, N, R)
  const out = decode(encode(intrerupt), R)
  assert.ok(out.ok, `decode a refuzat propriul encode: ${JSON.stringify(out)}`)
  const incarcat = out.ok ? out.value : intrerupt
  advance(incarcat, N, R)

  assert.equal(hashWorld(incarcat), hashWorld(continuu),
    `${N} + save + load + ${N} difera de ${2 * N}: un camp PERSISTED nu supravietuieste salvarii`)
})

test('fixtura bogata ATINGE ce pretinde: toate felurile de job, marfa in mana, si masa', () => {
  // Contorul de viata al testului de deasupra, scris separat ca sa spuna EXACT ce
  // lipseste cand moare. `populated` a murit de doua ori: intai agentii se nasteau
  // la `z = 0` si nu se miscau deloc; apoi se miscau, dar in 2000 de tickuri singurul
  // fel de job pe care il luau vreodata era DOARME. A doua moarte a tinut doi ani.
  const w = lumeBogata(12345)
  const feluri = new Set<number>()
  let cuJobConsumat = 0
  let cuCaraCantitate = 0
  let cuIteme = 0
  let cuDesemnari = 0
  let cuZone = 0
  for (let t = 0; t < 800; t++) {
    advance(w, 1, R)
    for (let i = 0; i < w.agents.count; i++) {
      if (w.agents.alive[i] !== 1) continue
      feluri.add(w.agents.jobKind[i]!)
      if (w.agents.jobConsumat[i]! !== 0) cuJobConsumat++
      if (w.agents.caraCantitate[i]! !== 0) cuCaraCantitate++
    }
    for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1) { cuIteme++; break }
    for (let i = 0; i < w.desemnari.count; i++) if (w.desemnari.alive[i] === 1) { cuDesemnari++; break }
    for (let i = 0; i < w.zone.count; i++) if (w.zone.alive[i] === 1) { cuZone++; break }
  }
  for (const [nume, fel] of [['SAPA', FelJob.SAPA], ['CARA', FelJob.CARA], ['MANANCA', FelJob.MANANCA], ['CONSTRUIESTE', FelJob.CONSTRUIESTE]] as const) {
    assert.ok(feluri.has(fel), `fixtura moarta: niciun pion nu ia vreodata un job de ${nume}`)
  }
  assert.ok(cuJobConsumat > 0, 'fixtura moarta: `jobConsumat` e nul la fiecare tick — exact campul care lipsea din encode')
  assert.ok(cuCaraCantitate > 0, 'fixtura moarta: nimeni nu tine vreodata marfa in mana')
  assert.ok(cuIteme > 100, `fixtura moarta: iteme vii doar ${cuIteme} tickuri din 800`)
  assert.ok(cuDesemnari > 100, `fixtura moarta: desemnari vii doar ${cuDesemnari} tickuri din 800`)
  assert.ok(cuZone > 100, `fixtura moarta: zone vii doar ${cuZone} tickuri din 800`)
})
