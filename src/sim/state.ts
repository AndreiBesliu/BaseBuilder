/**
 * Starea lumii.
 *
 * Doua reguli de arhitectura, luate din research si valabile de la primul camp:
 *
 * 1. SoA, nu AoS. Agentii stau in array-uri paralele de primitive, nu ca obiecte
 *    per agent. Masuratorile din panou arata multiplicatori de 1,58x-24,9x intre
 *    ECS/SoA si OOP in JS, iar acei multiplicatori nu se mai obtin retroactiv.
 *
 * 2. Fiecare camp e etichetat PERSISTED / DERIVED / TRANSIENT. Ce e DERIVED nu se
 *    salveaza — se reconstruieste la incarcare. Save-ul descrie INTENTIA
 *    jucatorului, nu structurile interne de accelerare.
 *
 * Pozitiile sunt INTREGI, in milimetri. Fara float in starea de simulare: nu
 * pentru multiplayer (nu e in plan), ci fiindca float-ul face hash-ul de stare
 * fragil intre versiuni de runtime, si hash-ul e singura dovada de determinism.
 */

import type { RngState } from './rng.ts'
import type { Terrain } from './terrain/terrain.ts'
import type { RegionStore } from './regions.ts'
import type { PathStore } from './agents.ts'

/** Versiunea schemei de stare. Creste la ORICE camp nou. Vezi save.ts. */
export const SCHEMA_VERSION = 1

/** Un milimetru e unitatea de baza. O celula de 1 m = 1000. */
export const MM_PER_CELL = 1000

/** Cate fluxuri de RNG are lumea. Numele lor sunt cheia in `rng`. */
export const RNG_STREAMS = ['worldgen', 'agents', 'evenimente', 'combat'] as const
export type RngStreamName = (typeof RNG_STREAMS)[number]

/** Relatia dintre doua fractiuni. Determina daca doi agenti pot imparti o celula (D7). */
export const Faction = {
  ASEZARE: 0,
  SALBATIC: 1,
  JEFUITOR: 2,
} as const
export type FactionId = (typeof Faction)[keyof typeof Faction]

/**
 * Depozit de agenti in SoA. `count` e numarul de sloturi FOLOSITE;
 * sloturile sunt stabile (un agent nu isi schimba indexul cat traieste).
 */
export interface AgentStore {
  /** PERSISTED */ count: number
  /** PERSISTED */ capacity: number
  /** PERSISTED */ id: Int32Array
  /** PERSISTED — milimetri */ x: Int32Array
  /** PERSISTED — milimetri */ y: Int32Array
  /** PERSISTED — NIVEL, in metri intregi. Nu milimetri: verticala e pe grila. */ z: Int32Array
  /** PERSISTED */ faction: Uint8Array
  /** PERSISTED — 0 = mort, slotul se poate reutiliza */ alive: Uint8Array
  /**
   * PERSISTED — unde vrea sa ajunga, in CELULE.
   *
   * Tinta e stare reala, nu derivata: fara ea in save, o lume reincarcata ar
   * trimite oamenii in alta parte decat mergeau. Drumul, in schimb, NU e stare —
   * se recalculeaza din (pozitie, tinta, teren) si sta in `PathStore`.
   */
  goalX: Int32Array
  /** PERSISTED */ goalY: Int32Array
  /** PERSISTED */ goalZ: Int32Array
  /** PERSISTED — 0 = nu are tinta */ hasGoal: Uint8Array
  /**
   * PERSISTED — milimetri acumulati spre celula urmatoare de pe drum.
   *
   * Exista fiindca `x`/`y` se schimba continuu, iar `z` discret, si tripletul
   * (celulaX, celulaY, z) trebuie sa fie VALID in orice moment. Cat timp agentul
   * aluneca in milimetri spre celula urmatoare, `cellOf(x)` trece granita cu un
   * tick inaintea lui `z`. Pe o panta, tickul ala il pune in celula destinatie cu
   * cota sursa — adica in piatra. Poarta din `stepAgents` il oprea acolo, si
   * fiindca era oprit nu mai apuca sa se alinieze: blocat pe viata, la 7 celule de
   * unde pornise.
   *
   * Acum simularea sare din centru in centru, dintr-o data, iar aici se aduna cat
   * a mers. Interpolarea neteda e treaba randarii, nu a simularii — exact cum
   * cere „fara float in starea de simulare".
   */
  progresMm: Int32Array
}

export interface World {
  /** PERSISTED */ schema: number
  /** PERSISTED — singura sursa de aleator */ seed: number
  /** PERSISTED — singura sursa de TIMP din toata simularea */ tick: number
  /** PERSISTED — generatorul de identitati stabile */ nextId: number
  /** PERSISTED */ rng: Record<RngStreamName, RngState>
  /** PERSISTED */ agents: AgentStore
  /**
   * PERSISTED — marginile in care se misca agentii-substitut, in milimetri.
   *
   * Deliberat SEPARATE de coordonatele terenului, cat timp agentii sunt un
   * substitut. Se contopesc la S12-15, cand agentii devin reali si incep sa
   * calce pe celule de teren.
   */
  /** DERIVED. Extinderea lumii in mm, din harta macro. Vezi `createWorld`. */
  bounds: { w: number; h: number }
  /**
   * MIXT: chunk-urile ne-promovate sunt DERIVED (se regenereaza din seed),
   * cele promovate sunt PERSISTED (contin munca jucatorului).
   */
  terrain: Terrain
  /**
   * DERIVED — regiunile si reachability. Se reconstruiesc din teren.
   *
   * Stau pe `World` fiindca agentii au nevoie de ele la fiecare tick, iar
   * acoperirea lor trebuie sa fie o functie de starea PERSISTATA (pozitiile
   * agentilor), nu de istoricul intamplator al sesiunii. Vezi antetul din
   * `agents.ts` — fara asta, un roundtrip de save ar putea da alte drumuri.
   */
  regions: RegionStore
  /** TRANSIENT — drumurile in curs. Se recalculeaza din (pozitie, tinta, teren). */
  paths: PathStore
}

export function makeAgentStore(capacity: number): AgentStore {
  return {
    count: 0,
    capacity,
    id: new Int32Array(capacity),
    x: new Int32Array(capacity),
    y: new Int32Array(capacity),
    z: new Int32Array(capacity),
    faction: new Uint8Array(capacity),
    alive: new Uint8Array(capacity),
    goalX: new Int32Array(capacity),
    goalY: new Int32Array(capacity),
    goalZ: new Int32Array(capacity),
    hasGoal: new Uint8Array(capacity),
    progresMm: new Int32Array(capacity),
  }
}

/** Indexul slotului pentru un id, sau -1. Liniar deocamdata; devine index cand conteaza. */
export function slotOf(agents: AgentStore, id: number): number {
  for (let i = 0; i < agents.count; i++) {
    if (agents.id[i] === id && agents.alive[i] === 1) return i
  }
  return -1
}
