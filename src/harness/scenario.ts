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

/** Un scenariu standard, folosit de teste si de benchmark. Deterministic prin constructie. */
export function standardScenario(seed: number, ticks: number, agents = 20): Scenario {
  const commands: LoggedCommand[] = []
  for (let i = 0; i < agents; i++) {
    const cmd: Command = {
      kind: 'spawnAgent',
      x: (i * 7919) % 200000,
      y: (i * 104729) % 200000,
      z: 0,
      faction: i % 5 === 0 ? 2 : 0,
    }
    commands.push({ tick: i % 3, cmd })
  }
  return { seed, ticks, commands }
}

export { advance, createWorld, hashWorld }
