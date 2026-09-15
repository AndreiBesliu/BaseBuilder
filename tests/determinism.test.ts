import test from 'node:test'
import assert from 'node:assert/strict'
import { runScenario, standardScenario } from '../src/harness/scenario.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { advance, createWorld, liveAgentCount } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { Faction } from '../src/sim/state.ts'
import { Reason } from '../src/sim/result.ts'
import { groundLevelM, materialAt, promotedCount, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import type { World } from '../src/sim/state.ts'

test('acelasi seed, 10.000 de tickuri, acelasi hash', () => {
  const a = runScenario(standardScenario(12345, 10000, 40))
  const b = runScenario(standardScenario(12345, 10000, 40))
  assert.equal(a.hash, b.hash)
  assert.equal(a.liveAgents, 40)
  assert.deepEqual(a.refusals, [])
})

test('seed-uri diferite dau stari diferite', () => {
  const a = runScenario(standardScenario(1, 2000, 20))
  const b = runScenario(standardScenario(2, 2000, 20))
  assert.notEqual(a.hash, b.hash)
})

test('rularea in doua transe e identica cu rularea continua', () => {
  // Daca asta pica, inseamna ca tickul depinde de ceva din afara starii.
  const continuous = createWorld(777)
  advance(continuous, 5000)

  const split = createWorld(777)
  advance(split, 1234)
  advance(split, 5000 - 1234)

  assert.equal(hashWorld(split), hashWorld(continuous))
})

test('hash-ul e sensibil la orice bit din stare', () => {
  const w = createWorld(31)
  const spawn = applyCommand(w, { kind: 'spawnAgent', x: 1000, y: 1000, z: 0, faction: Faction.ASEZARE })
  assert.ok(spawn.ok)
  const before = hashWorld(w)
  w.agents.x[0] = w.agents.x[0]! + 1
  assert.notEqual(hashWorld(w), before)
})

test('un tick nu schimba nimic intr-o lume fara agenti, in afara contorului', () => {
  const w = createWorld(5)
  const before = w.rng.agents.draws
  advance(w, 100)
  assert.equal(w.tick, 100)
  assert.equal(w.rng.agents.draws, before, 'fluxul agentilor a fost consumat fara agenti')
})

// Pana la S12-15, contractul era „fiecare agent viu consuma exact o tragere pe
// tick" — adevarat despre plimbarea aleatoare, care tragea un zar pentru directie
// si atat. Agentii care merg pe drumuri trag numai cand isi ALEG o tinta, deci
// contractul ala a disparut odata cu substitutul. Ce ramane insa e motivul pentru
// care exista: cursorul de RNG trebuie sa fie o functie previzibila de STARE, nu
// de teren si nu de cat de norocoasa a fost o cautare.

test('un agent care nu poate face nimic nu consuma nimic din flux', () => {
  // Agentii astia se nasc in aer, deasupra solului: nu ajung in nicio regiune,
  // deci n-au de unde sa-si aleaga o tinta. Regula e ca asta sa fie GRATIS.
  // Contra-exemplul e chiar versiunea dinainte a lui `stepAgents`, in care un
  // agent de negasit cerea o reconstructie completa de regiuni la fiecare tick.
  const w = createWorld(90)
  for (let i = 0; i < 7; i++) {
    const r = applyCommand(w, { kind: 'spawnAgent', x: i * 1000, y: 0, z: 0, faction: Faction.ASEZARE })
    assert.ok(r.ok)
  }
  const before = w.rng.agents.draws
  advance(w, 10)
  assert.equal(w.rng.agents.draws - before, 0)
})

test('consumul de RNG e MARGINIT de reguli, nu de teren', () => {
  // Plafonul e ce face cursorul previzibil. `alegeTinta` face cel mult
  // `agentGoalAttempts` incercari, fiecare cu exact doua trageri, si numai pentru
  // agentii care chiar sunt undeva. Fara plafon, consumul ar depinde de cat de
  // greu e de gasit o celula libera — adica de relief.
  const w = peSol(4242, 6)
  const vii = liveAgentCount(w)
  assert.equal(vii, 6, 'fixtura n-a asezat agentii pe sol')

  const before = w.rng.agents.draws
  advance(w, 50)
  const trase = w.rng.agents.draws - before
  assert.ok(trase > 0, 'niciun agent n-a ales vreo tinta — fixtura e vida, nu invariantul verde')
  assert.ok(
    trase <= vii * 50 * DEFAULT_RULES.agentGoalAttempts * 2,
    `${trase} trageri depasesc plafonul teoretic`,
  )
})

test('un agent mort nu mai consuma din flux', () => {
  const w = peSol(91, 4)
  assert.equal(liveAgentCount(w), 4)
  // Fereastra trebuie sa fie mai LUNGA decat un drum. O tinta se alege o data si
  // se merge spre ea zeci de tickuri fara nicio tragere: pe 30 de tickuri masura
  // dadea zero pentru amandoua lumile si testul ar fi trecut verde fara sa
  // compare nimic. Garda "fixtura e vida" de mai jos e cea care a prins-o.
  advance(w, 20) // se aseaza regiunile, ca masuratoarea sa prinda regimul stabil

  const cuToti = w.rng.agents.draws
  advance(w, 400)
  const cu4 = w.rng.agents.draws - cuToti

  const gol = peSol(91, 4)
  advance(gol, 20)
  const ucis = applyCommand(gol, { kind: 'killAgent', id: gol.agents.id[0]! })
  assert.ok(ucis.ok)
  assert.equal(liveAgentCount(gol), 3)
  const cuTotiGol = gol.rng.agents.draws
  advance(gol, 400)
  const cu3 = gol.rng.agents.draws - cuTotiGol

  assert.ok(cu4 > 0, 'nimeni n-a tras — fixtura e vida')
  assert.ok(cu3 < cu4, `un mort inca trage: ${cu3} fata de ${cu4}`)
})

test('agentii raman intre marginile lumii dupa multe tickuri', () => {
  const w = createWorld(2024)
  for (let i = 0; i < 30; i++) {
    applyCommand(w, { kind: 'spawnAgent', x: 500, y: 500, z: 0, faction: Faction.ASEZARE })
  }
  advance(w, 20000)
  for (let i = 0; i < w.agents.count; i++) {
    assert.ok(w.agents.x[i]! >= 0 && w.agents.x[i]! < w.bounds.w, `x iesit din lume: ${w.agents.x[i]}`)
    assert.ok(w.agents.y[i]! >= 0 && w.agents.y[i]! < w.bounds.h, `y iesit din lume: ${w.agents.y[i]}`)
  }
})

test('comenzile refuzate spun DE CE, si nu schimba starea', () => {
  const w = createWorld(4)
  const before = hashWorld(w)

  const out = applyCommand(w, { kind: 'spawnAgent', x: -1, y: 0, z: 0, faction: Faction.ASEZARE })
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.IN_AFARA_LUMII)
    assert.equal(out.params.x, -1)
  }
  assert.equal(hashWorld(w), before, 'o comanda refuzata a modificat starea')

  const missing = applyCommand(w, { kind: 'moveAgent', id: 999, dx: 1, dy: 0 })
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.equal(missing.reason, Reason.ENTITATE_INEXISTENTA)
})

test('plafonul de agenti e o refuzare explicita, nu o crestere tacuta', () => {
  const w = createWorld(6)
  const cap = w.agents.capacity
  for (let i = 0; i < cap; i++) {
    const r = applyCommand(w, { kind: 'spawnAgent', x: 0, y: 0, z: 0, faction: Faction.ASEZARE })
    assert.ok(r.ok, `spawn ${i} a esuat inainte de plafon`)
  }
  const over = applyCommand(w, { kind: 'spawnAgent', x: 0, y: 0, z: 0, faction: Faction.ASEZARE })
  assert.equal(over.ok, false)
  if (!over.ok) {
    assert.equal(over.reason, Reason.CAPACITATE_DEPASITA)
    assert.equal(over.params.capacitate, cap)
  }
})

test('slotul unui agent mort se reutilizeaza, dar id-ul nu', () => {
  const w = createWorld(8)
  const a = applyCommand(w, { kind: 'spawnAgent', x: 0, y: 0, z: 0, faction: Faction.ASEZARE })
  assert.ok(a.ok)
  applyCommand(w, { kind: 'killAgent', id: a.value })
  const b = applyCommand(w, { kind: 'spawnAgent', x: 0, y: 0, z: 0, faction: Faction.ASEZARE })
  assert.ok(b.ok)
  assert.equal(w.agents.count, 1, 'slotul nu a fost reutilizat')
  assert.notEqual(b.value, a.value, 'id-ul a fost reciclat')
})

test('scenariul standard chiar promoveaza teren — altfel oracolul e orb', () => {
  // Testul asta pazeste o poarta, nu un comportament. `hashWorld` include NUMAI
  // chunk-urile promovate; un scenariu care nu promoveaza niciunul face din
  // hash-ul de referinta din CI un semafor care nu poate deveni rosu.
  //
  // A fost exact cazul pana acum: `HEIGHT_SCALE_DM` mutat de la 1800 la 1900 —
  // tot relieful lumii schimbat cu 5,5% — lasa hash-ul neclintit la `5bc3ca4c`.
  const r = runScenario(standardScenario(12345, 2000, 10))
  assert.ok(promotedCount(r.world.terrain) > 50, `doar ${promotedCount(r.world.terrain)} chunk-uri promovate`)
  assert.deepEqual(r.refusals, [], 'scenariul standard trebuie sa ruleze fara refuzuri')
})

test('scenariul standard sapa si sub cota zero, si peste', () => {
  // Cota se calculeaza cu `Math.floor(cm / 100)`, iar pe negative `Math.floor`
  // nu e acelasi lucru cu trunchierea: -250 cm inseamna -3 m, nu -2 m. Un
  // scenariu care sapa numai pe deal nu ar prinde niciodata o regresie de semn.
  const s = standardScenario(12345, 2000, 0)
  const zs = (s.commands ?? []).filter((c) => c.cmd.kind === 'dig').map((c) => (c.cmd as { z: number }).z)
  assert.ok(zs.some((z) => z < 0), 'niciun dig sub cota zero')
  assert.ok(zs.some((z) => z >= 0), 'niciun dig peste cota zero')
})

test('hash-ul vede un singur voxel schimbat', () => {
  // Proba negativa pentru oracolul de teren: daca asta trece cand n-ar trebui,
  // toate garantiile de determinism pe teren sunt decorative.
  const r = runScenario(standardScenario(12345, 2000, 0))
  const before = hashWorld(r.world)
  const key = r.world.terrain.keys.find((k) => r.world.terrain.chunks.get(k)!.voxels !== null)
  assert.ok(key !== undefined, 'scenariul nu a promovat niciun chunk')
  const v = r.world.terrain.chunks.get(key!)!.voxels!
  v.runLength[0] = v.runLength[0]! ^ 1
  assert.notEqual(hashWorld(r.world), before)
})

/**
 * O lume cu agenti asezati PE SOL, nu la cota zero.
 *
 * Distinctia nu e cosmetica: un agent in aer nu ajunge in nicio regiune, deci nu
 * trece niciodata de primul filtru din `stepAgents` si nu face nimic — inclusiv
 * nu trage din RNG. Un test despre consumul de RNG asezat in aer masoara zero si
 * trece verde orice s-ar intampla.
 */
function peSol(seed: number, cati: number): World {
  const w = createWorld(seed)
  const t = w.terrain
  let pusi = 0
  for (let k = 1; k <= 4000 && pusi < cati; k++) {
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(t, wx, wy)
    if (!g.ok) continue
    const sus = materialAt(t, wx, wy, g.value)
    if (!sus.ok || !isSolid(sus.value)) continue
    const r = applyCommand(w, {
      kind: 'spawnAgent',
      x: wx * 1000 + 500,
      y: wy * 1000 + 500,
      z: g.value + 1,
      faction: Faction.ASEZARE,
    })
    if (r.ok) pusi++
  }
  return w
}
