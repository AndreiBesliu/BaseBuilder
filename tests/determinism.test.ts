import test from 'node:test'
import assert from 'node:assert/strict'
import { runScenario, standardScenario } from '../src/harness/scenario.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { advance, createWorld, liveAgentCount, tick } from '../src/sim/world.ts'
import { decode, encode } from '../src/sim/save.ts'
import { find, NO_REGION } from '../src/sim/regions.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { Faction } from '../src/sim/state.ts'
import { Reason } from '../src/sim/result.ts'
import { groundLevelM, materialAt, promotedCount, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { lastAgentReport } from '../src/sim/agents.ts'
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
  const spawn = applyCommand(w, { kind: 'spawnAgent', ...locBun(w), faction: Faction.ASEZARE })
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

test('un agent nu se poate naste unde nu se poate STA', () => {
  // Invariantul asta a inlocuit unul mai slab — „un agent care nu poate face nimic
  // nu consuma nimic din flux" — care masura trageri de RNG. Erau zero si cu
  // aparatoarea pusa, si fara ea: testul nu putea deosebi „e gratis" de „nu face
  // nimic". Acum problema e rezolvata mai devreme: un agent inert nici nu se
  // naste.
  //
  // Conteaza fiindca agentii inerti se strecoara TACUT in fixturi. In testul D7c,
  // 15 din 40 stateau nemiscati toate cele 20.000 de tickuri, iar testul trecea.
  const w = createWorld(90)
  const g = groundLevelM(w.terrain, 5000, 5000)
  assert.ok(g.ok)

  const inAer = applyCommand(w, { kind: 'spawnAgent', x: 5_000_500, y: 5_000_500, z: g.value + 40, faction: Faction.ASEZARE })
  assert.equal(inAer.ok, false, 'un agent asezat in aer a fost acceptat')
  if (!inAer.ok) assert.equal(inAer.reason, Reason.LOC_NECALCABIL)

  const inPiatra = applyCommand(w, { kind: 'spawnAgent', x: 5_000_500, y: 5_000_500, z: g.value - 3, faction: Faction.ASEZARE })
  assert.equal(inPiatra.ok, false, 'un agent asezat in piatra a fost acceptat')

  const peSol = applyCommand(w, { kind: 'spawnAgent', x: 5_000_500, y: 5_000_500, z: g.value + 1, faction: Faction.ASEZARE })
  assert.ok(peSol.ok, 'locul bun a fost refuzat — verificarea e prea stricta')
})

test('consumul de RNG e MARGINIT de reguli, nu de teren', () => {
  // Plafonul e ce face cursorul previzibil. Fara el, consumul ar depinde de cat
  // de greu e de gasit o celula libera — adica de relief — si cursorul fluxului
  // ar inceta sa mai fie o functie previzibila de stare.
  //
  // Prima versiune a acestui test asertase `trase <= vii * 50 * attempts * 2`,
  // adica 3600, in timp ce valoarea masurata era 28: o plasa de 128 de ori mai
  // larga decat pestele. `agentGoalAttempts` putea fi inmultit cu 33 fara ca
  // testul sa clipeasca. Acum relatia e EXACTA.
  const w = peSol(4242, 6)
  const vii = liveAgentCount(w)
  assert.equal(vii, 6, 'fixtura n-a asezat agentii pe sol')

  // 200 de tickuri, nu 50: pe o fereastra scurta plafonul nu e ATINS niciodata,
  // deci „nu e depasit" ar fi adevarat si daca plafonul ar lipsi cu totul. Garda
  // de mai jos cere explicit sa fie atins.
  let incercari = 0
  let maxUnAgent = 0
  const before = w.rng.agents.draws
  for (let t = 0; t < 200; t++) {
    advance(w, 1)
    const r = lastAgentReport()
    incercari += r.incercariTinta
    if (r.maxIncercariUnAgent > maxUnAgent) maxUnAgent = r.maxIncercariUnAgent
  }
  const trase = w.rng.agents.draws - before

  assert.ok(incercari > 0, 'niciun agent n-a ales vreo tinta — fixtura e vida, nu invariantul verde')
  // O incercare costa EXACT doua trageri. Nu „cel mult".
  assert.equal(trase, 2 * incercari, `${trase} trageri pentru ${incercari} incercari`)
  assert.ok(
    maxUnAgent <= DEFAULT_RULES.agentGoalAttempts,
    `un agent a facut ${maxUnAgent} incercari, peste plafonul de ${DEFAULT_RULES.agentGoalAttempts}`,
  )
})

test('plafonul de incercari CHIAR opreste cautarea, nu doar o margineste pe hartie', () => {
  // Testul de mai sus nu putea prinde ridicarea plafonului, si motivul merita
  // scris: in fixtura lui, agentul care ajunge la a sasea incercare o si
  // REUSESTE. Plafonul nu e niciodata constrangerea, deci poate fi inmultit cu
  // trei fara ca nimic sa se schimbe.
  //
  // Aici e o fixtura in care fiecare incercare EsUEAZA prin constructie: raza de
  // cautare e atat de mare incat candidatii cad mereu in afara acoperirii de
  // regiuni. Atunci bucla merge pana la plafon de fiecare data, si plafonul e
  // singurul lucru care o opreste.
  const reguli = { ...DEFAULT_RULES, agentGoalRadiusCells: 4000 }
  const w = peSol(4242, 4)
  const vii = liveAgentCount(w)

  let maxUnAgent = 0
  let tickuriCuIncercari = 0
  for (let t = 0; t < 30; t++) {
    tick(w, reguli)
    const r = lastAgentReport()
    if (r.incercariTinta > 0) tickuriCuIncercari++
    if (r.maxIncercariUnAgent > maxUnAgent) maxUnAgent = r.maxIncercariUnAgent
  }

  assert.ok(tickuriCuIncercari > 5, `doar ${tickuriCuIncercari} tickuri cu incercari — fixtura e vida`)
  assert.equal(
    maxUnAgent, reguli.agentGoalAttempts,
    `cea mai lunga serie a fost ${maxUnAgent}, nu ${reguli.agentGoalAttempts}: plafonul nu e ce opreste cautarea`,
  )
  assert.ok(vii > 0)
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
  const loc = locBun(w)
  for (let i = 0; i < cap; i++) {
    const r = applyCommand(w, { kind: 'spawnAgent', ...loc, faction: Faction.ASEZARE })
    assert.ok(r.ok, `spawn ${i} a esuat inainte de plafon`)
  }
  const over = applyCommand(w, { kind: 'spawnAgent', ...loc, faction: Faction.ASEZARE })
  assert.equal(over.ok, false)
  if (!over.ok) {
    assert.equal(over.reason, Reason.CAPACITATE_DEPASITA)
    assert.equal(over.params.capacitate, cap)
  }
})

test('slotul unui agent mort se reutilizeaza, dar id-ul nu', () => {
  const w = createWorld(8)
  const loc = locBun(w)
  const a = applyCommand(w, { kind: 'spawnAgent', ...loc, faction: Faction.ASEZARE })
  assert.ok(a.ok)
  applyCommand(w, { kind: 'killAgent', id: a.value })
  const b = applyCommand(w, { kind: 'spawnAgent', ...loc, faction: Faction.ASEZARE })
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

/**
 * Rularea scenariului standard, cu comenzile lui, pornind dintr-o lume data.
 *
 * Trebuie sa fie aceeasi functie si pentru rularea continua, si pentru cea de
 * dupa incarcare — altfel compari doua lucruri diferite. Prima versiune a acestui
 * harnasament uita sa aplice comenzile lumii INCARCATE si raporta „divergenta"
 * exact la valorile lui N la care mai existau comenzi dupa tickul N. Harnasamentul
 * era stricat, nu codul.
 */
function ruleazaScenariu(seed: number, agenti: number, tickuri: number, w0?: World): World {
  const s = standardScenario(seed, Math.max(tickuri, 1), agenti)
  const coada = [...(s.commands ?? [])]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.tick - b.c.tick) || (a.i - b.i))
    .map((e) => e.c)
  const w = w0 ?? createWorld(seed, DEFAULT_RULES)
  let k = 0
  while (k < coada.length && coada[k]!.tick < w.tick) k++
  const tinta = w.tick + tickuri
  while (w.tick < tinta) {
    while (k < coada.length && coada[k]!.tick === w.tick) { applyCommand(w, coada[k]!.cmd, DEFAULT_RULES); k++ }
    advance(w, 1)
  }
  return w
}

test('M5 pe scenariul REAL: N + save + load + N == 2N, cu tot cu comenzi', () => {
  // Testul din saveload.test.ts foloseste o fixtura simpla si trece si cu doua
  // mecanisme de determinism scoase. Asta e cel care le prinde, fiindca ruleaza
  // scenariul standard — cel cu sapaturi, zidiri si agenti raspanditi pe 16 km.
  //
  // Cele doua mecanisme, si ce se intampla fara ele, masurat pe 72 de combinatii
  // de (seed, agenti, N):
  //   - departajarea pe ANCORA in coridorul de regiuni ... 8 divergente
  //   - EXTINDEREA acoperirii, salvata .................. divergente pe toate
  //     configuratiile din testul asta
  for (const [seed, agenti, N] of [[12345, 40, 500], [777, 40, 250], [12345, 20, 400]] as const) {
    const continuu = ruleazaScenariu(seed, agenti, 2 * N)

    const intrerupt = ruleazaScenariu(seed, agenti, N)
    const laSalvare = hashWorld(intrerupt)
    const incarcat = decode(encode(intrerupt), DEFAULT_RULES)
    assert.ok(incarcat.ok, 'incarcarea a esuat')
    assert.equal(hashWorld(incarcat.value), laSalvare, `seed ${seed}: save/load a schimbat starea pe loc`)

    ruleazaScenariu(seed, agenti, N, incarcat.value)
    assert.equal(
      hashWorld(incarcat.value), hashWorld(continuu),
      `seed=${seed} agenti=${agenti} N=${N}: lumea incarcata a luat alt drum decat cea continua`,
    )
  }
})

test('o lume incarcata are ACELASI graf de regiuni ca cea continua', () => {
  // Invariantul de sub testul de mai sus. Graful e DERIVED, deci nu intra in hash
  // — ceea ce inseamna ca o divergenta a lui sta ascunsa pana se vede in pozitii,
  // adica peste cateva tickuri si fara sa se stie de unde a venit.
  const N = 400
  const w = ruleazaScenariu(12345, 40, N)
  const incarcat = decode(encode(w), DEFAULT_RULES)
  assert.ok(incarcat.ok)

  assert.ok(w.regions.cells.size > 500, `doar ${w.regions.cells.size} blocuri — fixtura e prea saraca`)
  assert.equal(incarcat.value.regions.cells.size, w.regions.cells.size, 'alt numar de blocuri calculate')
  assert.equal(incarcat.value.regions.legate.size, w.regions.legate.size, 'alt numar de blocuri legate')

  // Si aceleasi componente, celula cu celula.
  const amprenta = (s: typeof w.regions): string => {
    const out: string[] = []
    for (const key of [...s.keys].sort((a, b) => a - b)) {
      const cells = s.cells.get(key)!
      const linie: number[] = []
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i]!
        linie.push(r === NO_REGION ? -1 : find(s, r))
      }
      out.push(`${key}:${linie.join(',')}`)
    }
    return out.join('\n')
  }
  assert.equal(amprenta(incarcat.value.regions), amprenta(w.regions), 'componentele difera dupa incarcare')
})

/** Prima celula pe care se poate STA, pentru testele care au nevoie doar de un loc valid. */
function locBun(w: World): { x: number; y: number; z: number } {
  for (let k = 1; k <= 8000; k++) {
    const wx = (k * 1237 + w.seed) % WORLD_CELLS
    const wy = (k * 7919 + w.seed * 31) % WORLD_CELLS
    const g = groundLevelM(w.terrain, wx, wy)
    if (!g.ok) continue
    const sus = materialAt(w.terrain, wx, wy, g.value)
    if (!sus.ok || !isSolid(sus.value)) continue
    return { x: wx * 1000 + 500, y: wy * 1000 + 500, z: g.value + 1 }
  }
  throw new Error('niciun loc bun')
}
