/**
 * Salvare si incarcare, versionate de la primul commit.
 *
 * De ce acum si nu „cand am ce salva": save-ul te OBLIGA sa declari ce e stare
 * persistata si ce e cache derivat, iar declaratia aia modeleaza toate sistemele
 * de dupa. Facuta tarziu, descoperi ca jumatate din sisteme au stare ascunsa.
 *
 * Trei garantii, toate testate:
 *   1. Un save dintr-un build MAI NOU e REFUZAT, nu interpretat pe ghicite.
 *   2. Migrarile sunt un lant `N -> N+1`, idempotente, fiecare cu fixtura ei.
 *   3. Roundtrip-ul e observabil ca no-op: 1000 + salveaza + incarca + 1000
 *      trebuie sa dea acelasi hash ca 2000 de tickuri continue.
 */

import type { Outcome } from './result.ts'
import { accept, refuse, Reason } from './result.ts'
import type { RngState } from './rng.ts'
import type { RngStreamName, World } from './state.ts'
import { makeAgentStore, RNG_STREAMS, SCHEMA_VERSION } from './state.ts'
import { runCount } from './terrain/chunk.ts'
import { createTerrain, ensureChunk, inWorld } from './terrain/terrain.ts'

/** Creste cand se schimba FORMATUL de fisier, independent de schema de stare. */
export const SAVE_BUILD = 1

interface Envelope {
  game: 'kinstead'
  schema: number
  build: number
  savedAtTick: number
  data: unknown
}

export function encode(w: World): string {
  const a = w.agents
  const rng: Record<string, RngState> = {}
  for (const name of RNG_STREAMS) rng[name] = w.rng[name]

  const env: Envelope = {
    game: 'kinstead',
    schema: w.schema,
    build: SAVE_BUILD,
    savedAtTick: w.tick,
    data: {
      seed: w.seed,
      tick: w.tick,
      nextId: w.nextId,
      bounds: w.bounds,
      // Terenul: se salveaza DOAR chunk-urile promovate. Restul lumii — 268 km² —
      // se regenereaza din seed. Asta e trucul care face ca un save sa fie de
      // ordinul megabytelor si nu al gigabytelor.
      terrain: {
        radius: w.terrain.radius,
        focusCx: w.terrain.focusCx,
        focusCy: w.terrain.focusCy,
        promoted: w.terrain.keys
          .map((key) => ({ key, chunk: w.terrain.chunks.get(key)! }))
          .filter((e) => e.chunk.voxels !== null)
          .map((e) => {
            const v = e.chunk.voxels!
            const runs = runCount(v)
            return {
              cx: e.chunk.cx,
              cy: e.chunk.cy,
              zBaseM: v.zBaseM,
              runMaterial: Array.from(v.runMaterial.subarray(0, runs)),
              runLength: Array.from(v.runLength.subarray(0, runs)),
              columnStart: Array.from(v.columnStart),
            }
          }),
      },
      rng,
      agents: {
        count: a.count,
        capacity: a.capacity,
        // `subarray(0, count)` — sloturile nefolosite nu se salveaza.
        id: Array.from(a.id.subarray(0, a.count)),
        x: Array.from(a.x.subarray(0, a.count)),
        y: Array.from(a.y.subarray(0, a.count)),
        z: Array.from(a.z.subarray(0, a.count)),
        faction: Array.from(a.faction.subarray(0, a.count)),
        alive: Array.from(a.alive.subarray(0, a.count)),
      },
    },
  }
  return JSON.stringify(env)
}

/** Lantul de migrari. O intrare per treapta de schema. */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // Exemplu de forma, pentru cand va exista schema 2:
  // 1: (d) => ({ ...d, campNou: 0 }),
}

export function decode(text: string): Outcome<World> {
  let env: Envelope
  try {
    env = JSON.parse(text) as Envelope
  } catch {
    return refuse(Reason.LIPSA_MATERIAL, { camp: '(json)', motiv: 'nu se poate parsa' })
  }

  if (env === null || typeof env !== 'object' || env.game !== 'kinstead') {
    return refuse(Reason.LIPSA_MATERIAL, { camp: 'game', asteptat: 'kinstead', primit: String(env?.game) })
  }
  if (typeof env.build !== 'number' || env.build > SAVE_BUILD) {
    return refuse(Reason.CAPACITATE_DEPASITA, { camp: 'build', valoare: String(env.build), maxim: SAVE_BUILD })
  }
  if (typeof env.schema !== 'number' || env.schema > SCHEMA_VERSION) {
    return refuse(Reason.CAPACITATE_DEPASITA, { camp: 'schema', valoare: String(env.schema), maxim: SCHEMA_VERSION })
  }

  let data = env.data as Record<string, unknown>
  for (let v = env.schema; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (!step) return refuse(Reason.LIPSA_MATERIAL, { camp: 'migrare', de_la: v, la: v + 1 })
    data = step(data)
  }

  const agentsRaw = data.agents as Record<string, number[] | number> | undefined
  if (!agentsRaw) return refuse(Reason.LIPSA_MATERIAL, { camp: 'agents' })

  const count = agentsRaw.count as number
  const capacity = agentsRaw.capacity as number
  if (!Number.isInteger(count) || !Number.isInteger(capacity) || count > capacity) {
    return refuse(Reason.CAPACITATE_DEPASITA, { camp: 'agents.count', valoare: String(count), maxim: String(capacity) })
  }

  const agents = makeAgentStore(capacity)
  agents.count = count
  agents.id.set(agentsRaw.id as number[])
  agents.x.set(agentsRaw.x as number[])
  agents.y.set(agentsRaw.y as number[])
  agents.z.set(agentsRaw.z as number[])
  agents.faction.set(agentsRaw.faction as number[])
  agents.alive.set(agentsRaw.alive as number[])

  // Identitati unice — un save corupt sau editat manual nu are voie sa treaca tacut.
  const seen = new Set<number>()
  for (let i = 0; i < count; i++) {
    const id = agents.id[i]!
    if (agents.alive[i] === 1) {
      if (seen.has(id)) return refuse(Reason.ENTITATE_INEXISTENTA, { camp: 'agents.id', motiv: 'duplicat', id })
      seen.add(id)
    }
  }

  const rngRaw = data.rng as Record<string, RngState>
  const rng = {} as Record<RngStreamName, RngState>
  for (const name of RNG_STREAMS) {
    const st = rngRaw?.[name]
    if (!st) return refuse(Reason.LIPSA_MATERIAL, { camp: `rng.${name}` })
    rng[name] = { s0: st.s0, s1: st.s1, s2: st.s2, s3: st.s3, draws: st.draws }
  }

  const bounds = data.bounds as { w: number; h: number }
  const seed = data.seed as number

  const tRaw = data.terrain as SavedTerrain | undefined
  if (!tRaw) return refuse(Reason.LIPSA_MATERIAL, { camp: 'terrain' })

  const terrain = createTerrain(seed, tRaw.radius)
  terrain.focusCx = tRaw.focusCx
  terrain.focusCy = tRaw.focusCy

  for (const saved of tRaw.promoted) {
    if (!inWorld(saved.cx, saved.cy)) {
      return refuse(Reason.IN_AFARA_LUMII, { camp: 'terrain.promoted', cx: saved.cx, cy: saved.cy })
    }
    // `vertexCm` e DERIVED: se regenereaza din seed, nu se citeste din fisier.
    const chunk = ensureChunk(terrain, saved.cx, saved.cy)
    chunk.voxels = {
      zBaseM: saved.zBaseM,
      runMaterial: Uint8Array.from(saved.runMaterial),
      runLength: Uint8Array.from(saved.runLength),
      columnStart: Uint32Array.from(saved.columnStart),
    }
  }

  return accept({
    schema: SCHEMA_VERSION,
    seed,
    tick: data.tick as number,
    nextId: data.nextId as number,
    rng,
    agents,
    bounds: { w: bounds.w, h: bounds.h },
    terrain,
  })
}

interface SavedTerrain {
  radius: number
  focusCx: number
  focusCy: number
  promoted: {
    cx: number
    cy: number
    zBaseM: number
    runMaterial: number[]
    runLength: number[]
    columnStart: number[]
  }[]
}
