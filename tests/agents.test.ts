import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { createWorld, tick } from '../src/sim/world.ts'
import { Faction } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { cellOf, lastAgentReport } from '../src/sim/agents.ts'
import { Reason } from '../src/sim/result.ts'
import { isSolid, Material } from '../src/sim/terrain/chunk.ts'
import { groundLevelM, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { isWalkable, NO_REGION, regionAt } from '../src/sim/regions.ts'

const R = DEFAULT_RULES

/**
 * Agenti asezati PE SOL.
 *
 * Distinctia a costat o zi: pana la felia asta, scenariul standard ii nastea la
 * z = 0, iar solul de sub ei era la -70 m. Nu ajungeau in nicio regiune, deci nu
 * faceau nimic — iar un test de agenti care nu fac nimic trece verde orice s-ar
 * strica in cod.
 */
function peSol(seed: number, cati: number): World {
  const w = createWorld(seed)
  let pusi = 0
  for (let k = 1; k <= 8000 && pusi < cati; k++) {
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
      faction: pusi % 5 === 0 ? Faction.JEFUITOR : Faction.ASEZARE,
    })
    if (r.ok) pusi++
  }
  assert.equal(pusi, cati, 'fixtura n-a reusit sa aseze toti agentii pe sol')
  return w
}

test('ACCEPTANTA: 40 de agenti, 100.000 de tickuri, zero blocaje permanente', () => {
  // Cerinta din plan, luata la litera. „Blocaj permanent" e o MASURATOARE, nu o
  // impresie: se retine ultimul tick la care fiecare agent si-a schimbat celula,
  // si la final niciunul n-are voie sa fi stat nemiscat mai mult decat un prag.
  //
  // Pragul nu e ales din burta: un drum are cel mult `maxPathCells` celule, un pas
  // costa MM_PER_CELL / agentStepMm tickuri, iar un refuz aduce o racire. Deci
  // orice pauza mai lunga decat suma asta inseamna ca ceva chiar s-a oprit.
  const AGENTI = 40
  const TICKURI = 100_000
  const w = peSol(20260915, AGENTI)

  const ticksPerCelula = Math.ceil(1000 / R.agentStepMm)
  const PRAG = R.maxPathCells * ticksPerCelula + R.replanCooldownTicks * 4

  const ultimaMiscare = new Int32Array(AGENTI)
  const ultimaCelulaX = new Int32Array(AGENTI)
  const ultimaCelulaY = new Int32Array(AGENTI)
  const ultimaCelulaZ = new Int32Array(AGENTI)
  for (let i = 0; i < AGENTI; i++) {
    ultimaCelulaX[i] = cellOf(w.agents.x[i]!)
    ultimaCelulaY[i] = cellOf(w.agents.y[i]!)
    ultimaCelulaZ[i] = w.agents.z[i]!
  }

  let sosiri = 0
  let pauzaMaxima = 0
  let agentPauzat = -1
  for (let t = 0; t < TICKURI; t++) {
    tick(w, R)
    sosiri += lastAgentReport().sosiri
    for (let i = 0; i < AGENTI; i++) {
      if (w.agents.alive[i] === 0) continue
      const cx = cellOf(w.agents.x[i]!)
      const cy = cellOf(w.agents.y[i]!)
      const cz = w.agents.z[i]!
      if (cx === ultimaCelulaX[i] && cy === ultimaCelulaY[i] && cz === ultimaCelulaZ[i]) {
        const pauza = w.tick - ultimaMiscare[i]!
        if (pauza > pauzaMaxima) { pauzaMaxima = pauza; agentPauzat = i }
        continue
      }
      ultimaCelulaX[i] = cx
      ultimaCelulaY[i] = cy
      ultimaCelulaZ[i] = cz
      ultimaMiscare[i] = w.tick
    }
  }

  assert.ok(sosiri >= 200, `doar ${sosiri} tinte atinse din cele 200 cerute de plan`)
  assert.ok(
    pauzaMaxima <= PRAG,
    `agentul ${agentPauzat} a stat nemiscat ${pauzaMaxima} tickuri (prag ${PRAG}) — blocaj permanent`,
  )
})

test('ACCEPTANTA: fiecare agent viu e intr-o regiune la final, nu in piatra', () => {
  // Plasa pentru defectul care a facut felia asta sa para gata cand nu era: un
  // agent poate ajunge intr-o celula fara regiune si sa ramana acolo pe veci,
  // fiindca poarta care il opreste e chiar cea care l-ar fi scos de acolo.
  const w = peSol(4242, 12)
  for (let t = 0; t < 5000; t++) tick(w, R)
  for (let i = 0; i < w.agents.count; i++) {
    if (w.agents.alive[i] === 0) continue
    const cx = cellOf(w.agents.x[i]!)
    const cy = cellOf(w.agents.y[i]!)
    assert.notEqual(
      regionAt(w.regions, cx, cy, w.agents.z[i]!), NO_REGION,
      `agentul ${i} a ramas la ${cx},${cy},${w.agents.z[i]} fara regiune`,
    )
  }
})

test('pozitia unui agent e MEREU in centrul unei celule', () => {
  // Invariantul care face ca tripletul (celula, cota) sa fie valid in orice
  // moment. Daca pozitia ar aluneca intre centre, ar exista tickuri in care
  // celula si cota descriu impreuna un loc in care nu se poate sta.
  const w = peSol(777, 8)
  for (let t = 0; t < 3000; t++) {
    tick(w, R)
    for (let i = 0; i < w.agents.count; i++) {
      if (w.agents.alive[i] === 0) continue
      assert.equal(w.agents.x[i]! % 1000, 500, `x=${w.agents.x[i]} nu e centru de celula`)
      assert.equal(w.agents.y[i]! % 1000, 500, `y=${w.agents.y[i]} nu e centru de celula`)
    }
  }
})

test('D7c: aglomerarea produce blocare de OSTIL, si nu deadlock', () => {
  // Cazul D7c cerut de plan, la nivel de AGENTI. Testul din `path.test.ts`
  // dovedeste ca `findPath` distinge „ostil in drum" de „inaccesibil" pe o fixtura
  // construita cu mana. Asta dovedeste altceva: ca semnalul ajunge pana sus si ca
  // agentul reactioneaza la el CUM TREBUIE — abandoneaza tinta si asteapta, in loc
  // sa reincerce la nesfarsit acelasi drum blocat.
  //
  // Forma reala in care apare D7c nu e un coridor construit, ci inghesuiala: toti
  // agentii pe acelasi sit, doua factiuni amestecate.
  const seed = 5150
  const w = createWorld(seed)
  let sit: { wx: number; wy: number; g: number } | null = null
  for (let k = 1; k <= 8000 && !sit; k++) {
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(w.terrain, wx, wy)
    if (!g.ok) continue
    const sus = materialAt(w.terrain, wx, wy, g.value)
    if (!sus.ok || !isSolid(sus.value)) continue
    sit = { wx, wy, g: g.value }
  }
  assert.ok(sit, 'nu s-a gasit niciun sit pe uscat')

  for (let i = 0; i < 40; i++) {
    applyCommand(w, {
      kind: 'spawnAgent',
      x: (sit.wx + (i % 6)) * 1000 + 500,
      y: (sit.wy + Math.floor(i / 6)) * 1000 + 500,
      z: sit.g + 1,
      faction: i % 3 === 0 ? Faction.JEFUITOR : Faction.ASEZARE,
    })
  }

  let ostili = 0
  let refuzuri = 0
  let sosiri = 0
  for (let t = 0; t < 20_000; t++) {
    tick(w, R)
    const rep = lastAgentReport()
    ostili += rep.blocatiDeOstili
    refuzuri += rep.refuzuri
    sosiri += rep.sosiri
  }

  assert.ok(ostili > 0, 'niciun agent n-a fost oprit de un ostil — fixtura nu exercita D7c')
  assert.equal(refuzuri, ostili, `${refuzuri - ostili} refuzuri din alt motiv decat ostilii`)
  // Partea care conteaza: ostilii incurca, nu opresc lumea.
  assert.ok(sosiri > 1000, `doar ${sosiri} tinte atinse — inghesuiala a produs deadlock`)
})

// --- terenul ajunge la agenti ------------------------------------------------
//
// Toate testele de aici acopera acelasi defect, vazut din unghiuri diferite:
// `markDirty` nu era chemat NICIODATA pe `w.regions`. Exista, era bine scris, si
// singurul apel din tot proiectul era in viewer, pe un al DOILEA store, folosit
// numai de overlay si numai cand overlay-ul era vizibil. Graful pe care merg
// agentii nu afla niciodata de sapaturile si zidirile jucatorului.

test('o sapatura prin applyCommand ajunge in graful pe care merg agentii', () => {
  const w = peSol(31415, 4)
  const i = 0
  const cx = cellOf(w.agents.x[i]!)
  const cy = cellOf(w.agents.y[i]!)
  const cz = w.agents.z[i]!
  tick(w, R) // acoperirea se calculeaza in jurul agentilor

  // O celula solida de sub picioarele agentului, la doua niveluri mai jos.
  const tinta = { wx: cx + 3, wy: cy, z: cz - 3 }
  assert.equal(regionAt(w.regions, tinta.wx, tinta.wy, tinta.z), NO_REGION, 'celula era deja libera — fixtura nu dovedeste nimic')

  // Se sapa o gaura si tavanul ei, ca sa devina un loc in care se poate sta.
  for (let d = 0; d <= 2; d++) {
    const out = applyCommand(w, { kind: 'dig', wx: tinta.wx, wy: tinta.wy, z: tinta.z + d }, R)
    assert.ok(out.ok, `sapatura ${d} refuzata: ${JSON.stringify(out)}`)
  }
  tick(w, R)

  assert.notEqual(
    regionAt(w.regions, tinta.wx, tinta.wy, tinta.z), NO_REGION,
    'celula sapata n-a capatat regiune — graful nu afla de sapaturi',
  )
})

test('un zid zidit prin applyCommand SCOATE celula din graf', () => {
  const w = peSol(2718, 4)
  const i = 0
  const cx = cellOf(w.agents.x[i]!)
  const cy = cellOf(w.agents.y[i]!)
  const cz = w.agents.z[i]!
  tick(w, R)

  // O celula vecina pe care se poate sta acum.
  let zid: { wx: number; wy: number } | null = null
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2]] as const) {
    if (regionAt(w.regions, cx + dx, cy + dy, cz) !== NO_REGION) { zid = { wx: cx + dx, wy: cy + dy }; break }
  }
  assert.ok(zid, 'niciun vecin calcabil — fixtura e goala')

  for (let h = 0; h < R.agentHeadroomM; h++) {
    const out = applyCommand(w, { kind: 'fill', wx: zid.wx, wy: zid.wy, z: cz + h, material: Material.PIATRA_CONSTRUITA }, R)
    assert.ok(out.ok, `zidirea la h=${h} a fost refuzata: ${JSON.stringify(out)}`)
  }
  tick(w, R)

  assert.equal(
    regionAt(w.regions, zid.wx, zid.wy, cz), NO_REGION,
    'celula zidita e inca in graf — reachability-ul minte peste piatra',
  )
})

test('nu se zideste peste un om: refuz explicit, cu id-ul lui', () => {
  // Alternativa e sa-l ingropi, si atunci singurul semnal pe care il produce e
  // `INACCESIBIL` — un motiv care MINTE: problema nu e ca nu exista drum, ci ca
  // pionul e in piatra.
  const w = peSol(1618, 3)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!

  const out = applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z: cz, material: Material.PIATRA_CONSTRUITA }, R)
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.CELULA_OCUPATA)
    assert.equal(out.params.id, w.agents.id[0])
  }
})

test('un zid ridicat in fata unui agent chiar il OPRESTE', () => {
  // Drumul se calculeaza o data. Daca nimic nu-l re-valideaza, agentul merge mai
  // departe pe el si intra in piatra: „pionii ignora zidurile pe care tocmai
  // le-ai construit".
  const w = peSol(8080, 6)
  for (let t = 0; t < 30; t++) tick(w, R)

  // Un agent care chiar merge undeva, si celula in care va intra peste cateva pasi.
  let slot = -1
  for (let i = 0; i < w.agents.count; i++) {
    if (w.agents.alive[i] === 1 && w.paths.len[i]! - w.paths.cursor[i]! >= 4) { slot = i; break }
  }
  assert.notEqual(slot, -1, 'niciun agent nu are drum destul de lung — fixtura e goala')

  const baza = slot * w.paths.maxCells * 3 + (w.paths.cursor[slot]! + 2) * 3
  const zx = w.paths.cells[baza]!
  const zy = w.paths.cells[baza + 1]!
  const zz = w.paths.cells[baza + 2]!

  for (let h = 0; h < R.agentHeadroomM; h++) {
    applyCommand(w, { kind: 'fill', wx: zx, wy: zy, z: zz + h, material: Material.PIATRA_CONSTRUITA }, R)
  }
  assert.equal(isWalkable(w.terrain, zx, zy, zz, R), false, 'zidul n-a inchis celula — fixtura e gresita')

  for (let t = 0; t < 40; t++) {
    tick(w, R)
    for (let i = 0; i < w.agents.count; i++) {
      if (w.agents.alive[i] === 0) continue
      const ax = cellOf(w.agents.x[i]!)
      const ay = cellOf(w.agents.y[i]!)
      assert.ok(
        !(ax === zx && ay === zy && w.agents.z[i] === zz),
        `agentul ${i} a intrat in zid la tickul ${w.tick}`,
      )
    }
  }
  assert.equal(lastAgentReport().ingropati, 0, 'cineva a ramas ingropat')
})
