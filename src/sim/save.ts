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
import type { AgentStore, RngStreamName, World } from './state.ts'
import { makeAgentStore, MM_PER_CELL, RNG_STREAMS, SCHEMA_VERSION } from './state.ts'
import { createRegions, restoreRegions } from './regions.ts'
import { makePathStore } from './agents.ts'
import type { PathStore } from './agents.ts'
import { DEFAULT_RULES } from './content.ts'
import type { Rules } from './content.ts'
import { runCount } from './terrain/chunk.ts'
import { createTerrain, ensureChunk, inWorld, WORLD_CELLS } from './terrain/terrain.ts'

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
      // Extinderea acoperirii de regiuni: CARE blocuri sunt calculate, si care
      // sunt legate. Continutul nu se salveaza — e o functie pura de teren. Dar
      // care blocuri sunt e ISTORIE, si fara ea o lume reincarcata capata un graf
      // mai sarac decat cea continua: alte coridoare, alte drumuri, alte pozitii.
      // Cateva zeci de kiloocteti, langa megaoctetii de teren promovat.
      regiuni: {
        blocuri: [...w.regions.keys],
        legate: [...w.regions.legate].sort((a, b) => a - b),
      },
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
        // Tinta e PERSISTED: fara ea, un save reincarcat ar trimite oamenii in
        // alta parte decat mergeau. Si DRUMUL e persistat, din acelasi motiv —
        // vezi antetul lui agents.ts.
        goalX: Array.from(a.goalX.subarray(0, a.count)),
        goalY: Array.from(a.goalY.subarray(0, a.count)),
        goalZ: Array.from(a.goalZ.subarray(0, a.count)),
        hasGoal: Array.from(a.hasGoal.subarray(0, a.count)),
        progresMm: Array.from(a.progresMm.subarray(0, a.count)),
        // Numai coada ramasa, de la cursor incolo. La incarcare cursorul e zero.
        drumuri: Array.from({ length: a.count }, (_, i) => {
          const len = w.paths.len[i]!
          const cur = w.paths.cursor[i]!
          if (a.alive[i] === 0 || cur >= len) return []
          const baza = i * w.paths.maxCells * 3
          return Array.from(w.paths.cells.subarray(baza + cur * 3, baza + len * 3))
        }),
        nextReplanTick: Array.from(w.paths.nextReplanTick.subarray(0, a.count)),
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

/**
 * Marcheaza fiecare agent viu ca avand nevoie de un drum refacut, nu re-planificat.
 *
 * Distinctia conteaza: plafonul de re-planificari exista ca sa nu porneasca toata
 * lumea o cautare in acelasi tick. La incarcare insa exact asta trebuie sa se
 * intample, fiindca drumurile sunt TRANSIENT si dispar toate deodata. Orice
 * plafon pe reconstructie face ca ea sa coste tickuri pe care rularea continua nu
 * le plateste, iar diferenta ajunge in pozitii — care sunt PERSISTED.
 */
function incarcaDrumuri(p: PathStore, agents: AgentStore, raw: unknown): Outcome<PathStore> {
  const drumuri = (raw as { drumuri?: number[][]; nextReplanTick?: number[] } | undefined) ?? {}
  if (drumuri.nextReplanTick) p.nextReplanTick.set(drumuri.nextReplanTick)
  const lista = drumuri.drumuri
  if (!lista) return accept(p) // save mai vechi: agentii pornesc fara drum
  for (let i = 0; i < agents.count && i < lista.length; i++) {
    const d = lista[i] ?? []
    if (d.length % 3 !== 0) return refuse(Reason.VALOARE_INVALIDA, { camp: `drumuri[${i}]`, lungime: d.length })
    const celule = d.length / 3
    if (celule > p.maxCells) return refuse(Reason.CAPACITATE_DEPASITA, { camp: `drumuri[${i}]`, valoare: String(celule), maxim: p.maxCells })
    p.cells.set(d, i * p.maxCells * 3)
    p.len[i] = celule
    p.cursor[i] = 0
  }
  return accept(p)
}

export function decode(text: string, rules: Rules = DEFAULT_RULES): Outcome<World> {
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
  // Save-urile de dinainte de S12-15 n-au tinte: agentii pornesc fara si isi
  // aleg una la primul tick. Un camp lipsa nu are voie sa pice incarcarea.
  if (agentsRaw.goalX) agents.goalX.set(agentsRaw.goalX as number[])
  if (agentsRaw.goalY) agents.goalY.set(agentsRaw.goalY as number[])
  if (agentsRaw.goalZ) agents.goalZ.set(agentsRaw.goalZ as number[])
  if (agentsRaw.hasGoal) agents.hasGoal.set(agentsRaw.hasGoal as number[])
  if (agentsRaw.progresMm) agents.progresMm.set(agentsRaw.progresMm as number[])

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

  const drumuri = incarcaDrumuri(makePathStore(capacity, rules.maxPathCells), agents, agentsRaw)
  if (!drumuri.ok) return drumuri

  // Extinderea acoperirii. Un save mai vechi n-o are: atunci se porneste gol si se
  // reconstruieste lene, ca inainte.
  const rRaw = data.regiuni as { blocuri?: number[]; legate?: number[] } | undefined
  const regiuni = rRaw && Array.isArray(rRaw.blocuri) && rRaw.blocuri.length > 0
    ? restoreRegions(terrain, rRaw.blocuri, rRaw.legate ?? [], rules)
    : createRegions()

  return accept({
    schema: SCHEMA_VERSION,
    seed,
    tick: data.tick as number,
    nextId: data.nextId as number,
    rng,
    agents,
    regions: regiuni,
    paths: drumuri.value,
    // DERIVED de cand marimea lumii e o constanta a hartii macro. Un save vechi
    // are inca `data.bounds` scris; se ignora deliberat — daca l-as citi, un save
    // facut inainte de corectie ar readuce cutia de 256 m in lumea incarcata.
    bounds: { w: WORLD_CELLS * MM_PER_CELL, h: WORLD_CELLS * MM_PER_CELL },
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
