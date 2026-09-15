/**
 * Harness-ul headless.
 *
 * Ruleaza o lume din seed, aplica un log de comenzi la tickurile lor, si scoate
 * hash-ul starii. Fara motor, fara ecran, fara ceas de perete. Asta e ce face
 * posibila felia 20 — si e singurul lucru pe care il am si care le lipseste
 * majoritatii dezvoltatorilor solo din genul asta.
 */

import type { Rules } from '../sim/content.ts'
import { DEFAULT_RULES } from '../sim/content.ts'
import type { Command, LoggedCommand } from '../sim/commands.ts'
import { applyCommand } from '../sim/commands.ts'
import { hashWorld } from '../sim/hash.ts'
import { describe } from '../sim/result.ts'
import { CHUNK_CELLS, isSolid, Material } from '../sim/terrain/chunk.ts'
import { createTerrain, groundLevelM, materialAt, WORLD_CELLS } from '../sim/terrain/terrain.ts'
import type { World } from '../sim/state.ts'
import { advance, createWorld, liveAgentCount, tick } from '../sim/world.ts'

export interface Scenario {
  readonly seed: number
  readonly ticks: number
  readonly rules?: Rules
  /** Comenzi, fiecare cu tickul la care se aplica. Se sorteaza dupa tick, stabil. */
  readonly commands?: readonly LoggedCommand[]
}

export interface RunReport {
  readonly world: World
  readonly hash: string
  readonly ticks: number
  readonly liveAgents: number
  /** Comenzile refuzate, cu motivul. Un scenariu sanatos are lista goala. */
  readonly refusals: readonly string[]
}

export function runScenario(s: Scenario): RunReport {
  const rules = s.rules ?? DEFAULT_RULES
  const w = createWorld(s.seed, rules)
  const refusals: string[] = []

  // Ordonare stabila pe tick: indexul original departajeaza, ca doua comenzi la
  // acelasi tick sa se aplice mereu in aceeasi ordine.
  const queue = [...(s.commands ?? [])]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.tick - b.c.tick) || (a.i - b.i))
    .map((e) => e.c)

  let next = 0
  for (let t = 0; t < s.ticks; t++) {
    while (next < queue.length && queue[next]!.tick === w.tick) {
      const entry = queue[next]!
      const out = applyCommand(w, entry.cmd)
      if (!out.ok) refusals.push(`t=${entry.tick} ${entry.cmd.kind}: ${describe(out)}`)
      next++
    }
    tick(w, rules)
  }

  return {
    world: w,
    hash: hashWorld(w),
    ticks: w.tick,
    liveAgents: liveAgentCount(w),
    refusals,
  }
}

/**
 * Un scenariu standard, folosit de teste si de benchmark. Deterministic prin constructie.
 *
 * Contine DELIBERAT trei feluri de comenzi, nu unul singur:
 *  - agenti, ca sa miste `AgentStore` si `nextId`
 *  - `setFocus`, ca sa miste discul rezident (chunk-uri incarcate si aruncate)
 *  - sapaturi si zidiri, ca sa PROMOVEZE chunk-uri
 *
 * Ultimul punct e cel care conteaza si a lipsit pana acum. `hashWorld` include
 * numai chunk-urile promovate — decizie corecta, fiindca restul terenului e
 * DERIVED. Dar un scenariu care nu promoveaza nimic face din asta un oracol ORB:
 * hash-ul de referinta din CI acoperea zero teren. Dovedit prin mutatie:
 * cu `HEIGHT_SCALE_DM` mutat de la 1800 la 1900 — adica tot relieful lumii
 * schimbat cu 5,5% — hash-ul ramanea `5bc3ca4c`. O poarta care nu poate sa pice
 * nu e o poarta.
 */
export function standardScenario(seed: number, ticks: number, agents = 20): Scenario {
  const commands: LoggedCommand[] = []

  // Siturile se aleg INAINTE de agenti, fiindca agentii se nasc pe ele.
  const sites = pickSites(seed)

  // Agentii se nasc PE SOL, nu la cota zero.
  //
  // Pana la S12-15 n-a contat: un agent-substitut se plimba aleator si n-avea
  // nevoie de teren sub picioare. De cand merg pe drumuri, conteaza enorm —
  // solul la siturile astea e pe la -70 m, deci la z = 0 agentii pluteau in aer,
  // nu ajungeau niciodata intr-o regiune, si fiecare dintre ei cerea o
  // reconstructie completa de regiuni la fiecare tick. 200 de tickuri nu se
  // terminau in doua minute.
  for (let i = 0; i < agents; i++) {
    const sit = sites[i % Math.max(1, sites.length)]
    const cmd: Command = {
      kind: 'spawnAgent',
      // Centrul celulei, imprastiat putin in jurul situlului.
      x: (sit ? sit.wx + (i % 5) : i * 7) * 1000 + 500,
      y: (sit ? sit.wy + Math.floor(i / 5) % 5 : i * 11) * 1000 + 500,
      z: sit ? sit.groundM + 1 : 0,
      faction: i % 5 === 0 ? 2 : 0,
    }
    commands.push({ tick: i % 3, cmd })
  }

  // Terenul.
  let t = 100
  for (const s of sites) {
    commands.push({ tick: t, cmd: { kind: 'setFocus', cx: Math.floor(s.wx / CHUNK_CELLS), cy: Math.floor(s.wy / CHUNK_CELLS) } })
    // Trei voxeli in jos: garantat solizi, deci zero refuzuri.
    for (let d = 0; d < 3; d++) {
      commands.push({ tick: t + 1 + d, cmd: { kind: 'dig', wx: s.wx, wy: s.wy, z: s.groundM - d } })
    }
    // Si un zid deasupra: garantat gol.
    commands.push({ tick: t + 4, cmd: { kind: 'fill', wx: s.wx, wy: s.wy, z: s.groundM + 1, material: Material.PIATRA_CONSTRUITA } })
    t += 20
  }

  return { seed, ticks, commands }
}

interface Site {
  readonly wx: number
  readonly wy: number
  readonly groundM: number
}

/** Cate situri de fiecare semn. Ambele semne conteaza: `Math.floor` pe centimetri negativi. */
const SITES_PER_SIGN = 6

/**
 * Alege situri de sapat: jumatate sub cota zero, jumatate peste.
 *
 * Ambele semne intentionat: cota se calculeaza cu `Math.floor(cm / 100)`, iar
 * `Math.floor` pe negative nu se comporta ca trunchierea. Un scenariu care sapa
 * numai pe deal nu ar prinde niciodata o regresie de semn.
 *
 * Ruleaza pe un teren TEMPORAR, aruncat imediat: alegerea trebuie sa fie o
 * functie pura de seed, nu sa depinda de starea lumii in care se ruleaza.
 */
function pickSites(seed: number): Site[] {
  const scratch = createTerrain(seed, 1)
  const below: Site[] = []
  const above: Site[] = []

  for (let k = 1; k <= 400; k++) {
    if (below.length >= SITES_PER_SIGN && above.length >= SITES_PER_SIGN) break
    // Doua numere prime mari, ca pasii sa nu se alinieze pe grila de chunk-uri.
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(scratch, wx, wy)
    if (!g.ok) continue
    // Sub apa nu se sapa. Pana la corectarea caii derivate, `materialAt` spunea
    // PAMANT si pe fundul lacului, deci scenariul „reusea" sa sape acolo; acum
    // primeste APA si e refuzat, cum e si corect. Situl se alege pe uscat.
    const sus = materialAt(scratch, wx, wy, g.value)
    if (!sus.ok || !isSolid(sus.value)) continue
    const site: Site = { wx, wy, groundM: g.value }
    if (g.value < 0 && below.length < SITES_PER_SIGN) below.push(site)
    else if (g.value >= 0 && above.length < SITES_PER_SIGN) above.push(site)
  }

  // Intercalate, ca ordinea sa nu grupeze toate promovarile de acelasi semn.
  const out: Site[] = []
  for (let i = 0; i < Math.max(below.length, above.length); i++) {
    if (i < below.length) out.push(below[i]!)
    if (i < above.length) out.push(above[i]!)
  }
  return out
}

export { advance, createWorld, hashWorld }
