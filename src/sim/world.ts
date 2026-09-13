/**
 * Bucla de tick.
 *
 * Reguli valabile in tot folderul `sim/`, impuse mecanic de `tools/check-sim-discipline.mjs`:
 *   - `Date.now()`, `new Date()`, `performance.now()` — INTERZISE. `w.tick` e singurul timp.
 *   - `Math.random()` — INTERZIS. Aleatorul vine din fluxuri numite (rng.ts).
 *   - `async` / `await` / `Promise` — INTERZISE. Simularea e sincrona si pas cu pas.
 *   - iterare peste `Object.keys` / `Map` / `Set` fara sortare — INTERZISA.
 *
 * Ce se simuleaza acum e deliberat un substitut: agentii fac o plimbare aleatoare
 * marginita. NU e gameplay si nu pretinde sa fie. Rolul lui e sa exercite exact
 * mecanismele care nu se pot retrofita — fluxuri de RNG, ordine fixa de iterare,
 * aritmetica intreaga, hash de stare — ca sa existe dovada de determinism INAINTE
 * sa existe teren, agenti adevarati sau joburi. Se inlocuieste la S3-5.
 */

import type { Rules } from './content.ts'
import { DEFAULT_RULES } from './content.ts'
import { nextInt, stream } from './rng.ts'
import type { RngState } from './rng.ts'
import type { RngStreamName, World } from './state.ts'
import { makeAgentStore, MM_PER_CELL, RNG_STREAMS, SCHEMA_VERSION } from './state.ts'

export function createWorld(seed: number, rules: Rules = DEFAULT_RULES): World {
  const rng = {} as Record<RngStreamName, RngState>
  for (const name of RNG_STREAMS) rng[name] = stream(seed, name)

  return {
    schema: SCHEMA_VERSION,
    seed,
    tick: 0,
    nextId: 1,
    rng,
    agents: makeAgentStore(rules.agentCapacity),
    bounds: {
      w: rules.worldWidthCells * MM_PER_CELL,
      h: rules.worldHeightCells * MM_PER_CELL,
    },
  }
}

/** Un singur pas de simulare. */
export function tick(w: World, rules: Rules = DEFAULT_RULES): void {
  const a = w.agents
  const r = w.rng.agents
  const step = rules.agentStepMm

  // Ordinea de parcurgere e indexul slotului — fixa, si independenta de id-uri
  // sau de ordinea de inserare. Asta e ce tine hash-ul stabil.
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0) continue

    // Cele patru directii cardinale. Fiecare agent viu consuma EXACT o tragere
    // pe tick — asa cursorul fluxului e o functie de (tick, numar de agenti vii),
    // deci previzibil si verificabil intr-un test.
    const dir = nextInt(r, 4)
    let nx = a.x[i]!
    let ny = a.y[i]!
    if (dir === 0) nx += step
    else if (dir === 1) nx -= step
    else if (dir === 2) ny += step
    else ny -= step

    // Marginile lumii reflecta, nu opresc — ca sa nu se adune toti agentii pe muchie.
    if (nx < 0) nx = -nx
    else if (nx >= w.bounds.w) nx = 2 * (w.bounds.w - 1) - nx
    if (ny < 0) ny = -ny
    else if (ny >= w.bounds.h) ny = 2 * (w.bounds.h - 1) - ny

    a.x[i] = nx
    a.y[i] = ny
  }

  w.tick++
}

/** N pasi. Exista ca sa nu se scrie bucla in zece locuri diferite. */
export function advance(w: World, ticks: number, rules: Rules = DEFAULT_RULES): void {
  for (let i = 0; i < ticks; i++) tick(w, rules)
}

/** Cati agenti vii sunt. Derivat, nu stocat. */
export function liveAgentCount(w: World): number {
  let n = 0
  for (let i = 0; i < w.agents.count; i++) if (w.agents.alive[i] === 1) n++
  return n
}
