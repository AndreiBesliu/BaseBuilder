/**
 * Bucla de tick.
 *
 * Reguli valabile in tot folderul `sim/`, impuse mecanic de `tools/check-sim-discipline.mjs`:
 *   - `Date.now()`, `new Date()`, `performance.now()` — INTERZISE. `w.tick` e singurul timp.
 *   - `Math.random()` — INTERZIS. Aleatorul vine din fluxuri numite (rng.ts).
 *   - `async` / `await` / `Promise` — INTERZISE. Simularea e sincrona si pas cu pas.
 *   - iterare peste `Object.keys` / `Map` / `Set` fara sortare — INTERZISA.
 */

import type { Rules } from './content.ts'
import { DEFAULT_RULES } from './content.ts'
import { stream } from './rng.ts'
import type { RngState } from './rng.ts'
import type { RngStreamName, World } from './state.ts'
import { makeAgentStore, MM_PER_CELL, RNG_STREAMS, SCHEMA_VERSION } from './state.ts'
import { createTerrain, WORLD_CELLS } from './terrain/terrain.ts'
import { createRegions } from './regions.ts'
import { stepAgents } from './agents.ts'
import { makePathStore } from './drumuri.ts'
import { makeDesignationStore } from './desemnari.ts'
import { createReservations } from './rezervari.ts'
import { makeRatiuneStore } from './joburi.ts'

/**
 * Creeaza o lume. NU incarca teren: `createTerrain` aloca doar structura goala,
 * iar chunk-urile se genereaza la cerere. Streamingul porneste cand cineva cheama
 * `setFocus` — adica atunci cand exista o camera. Un `createWorld` care ar genera
 * 377 de chunk-uri ar face fiecare test sa coste cateva sute de milisecunde
 * degeaba.
 */
export function createWorld(seed: number, rules: Rules = DEFAULT_RULES): World {
  const rng = {} as Record<RngStreamName, RngState>
  for (const name of RNG_STREAMS) rng[name] = stream(seed, name)

  return {
    schema: SCHEMA_VERSION,
    seed,
    tick: 0,
    nextId: 1,
    rng,
    agents: makeAgentStore(rules.agentCapacity, rules.personalPriorityDefault, rules.jobAvoidSlots),
    // DERIVED. Marimea lumii NU e un numar de gameplay: o determina harta macro
    // (MACRO_SIZE x MACRO_METERS), deci nu are ce cauta in content/rules.json.
    //
    // Cat a stat acolo, au existat doua adevaruri despre cat e de mare lumea:
    // `worldWidthCells: 256` pentru agenti si 16384 de celule pentru teren. Nimic
    // nu le compara, asa ca au divergat tacut din S3. S-a vazut abia cand agentii
    // au inceput sa se nasca pe sol: siturile de sapat sunt imprastiate pe toti
    // cei 16 km, iar `spawnAgent` le refuza pe toate cu IN_AFARA_LUMII.
    bounds: { w: WORLD_CELLS * MM_PER_CELL, h: WORLD_CELLS * MM_PER_CELL },
    terrain: createTerrain(seed, rules.chunkResidentRadius),
    regions: createRegions(),
    paths: makePathStore(rules.agentCapacity, rules.maxPathCells),
    desemnari: makeDesignationStore(rules.designationCapacity),
    rezervari: createReservations(),
    ratiune: makeRatiuneStore(rules.agentCapacity),
  }
}

/** Un singur pas de simulare. */
export function tick(w: World, rules: Rules = DEFAULT_RULES): void {
  // Agentii merg spre tinte reale, pe drumuri reale, si de la S16-19 cer de
  // lucru. Plimbarea aleatoare care a tinut locul pana la S12 si-a facut treaba:
  // a exercitat fluxurile de RNG numite, ordinea fixa de iterare si hash-ul de
  // stare INAINTE sa existe ceva de miscat — adica exact lucrurile care nu se
  // pot retrofita. Ramane ca stare Idle: un pion fara job hoinareste.
  stepAgents(w, rules)
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
