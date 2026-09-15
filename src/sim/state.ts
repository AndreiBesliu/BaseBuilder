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
import type { PathStore } from './drumuri.ts'
import type { DesignationStore } from './desemnari.ts'
import type { ReservationStore } from './rezervari.ts'
import type { RatiuneStore } from './joburi.ts'

/**
 * Versiunea schemei de stare. Creste la ORICE camp nou. Vezi save.ts.
 *
 *   1 — S1-15: agenti, teren, drumuri, extinderea acoperirii de regiuni
 *   2 — S16-19: desemnari, joburi pe agenti, prioritati personale
 *   3 — S16-19 dupa recenzie: racirea pe pereche ca MULTIME, scanarea imediata
 *       dupa un job, blocurile murdare persistate
 */
export const SCHEMA_VERSION = 3

/**
 * Categoriile de munca. Lista de STRUCTURA (ce feluri de munca exista), nu numar
 * de gameplay: prioritatile personale se stocheaza per categorie, iar semantica
 * lor (0 = niciodata, N = exclusiv) e in content.
 */
export const Categorie = {
  SAPA: 0,
} as const
export type CategorieId = (typeof Categorie)[keyof typeof Categorie]
export const CATEGORII = 1

/** Pasii unui job. Un job e o masina de stare liniara, nu un arbore. */
export const PasJob = {
  MERGE: 0,
  LUCREAZA: 1,
} as const
export type PasJobId = (typeof PasJob)[keyof typeof PasJob]

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
   * trimite oamenii in alta parte decat mergeau. Si drumul e stare — sta in
   * `PathStore` si se salveaza; vezi antetul din `agents.ts` pentru de ce
   * propozitia „se recalculeaza din (pozitie, tinta, teren)" s-a dovedit falsa.
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

  // --- jobul curent (S16-19). Toate PERSISTED. ---
  //
  // Jobul NU se anuleaza la incarcare. PLAN M5 spunea „la load: anuleaza toate
  // joburile si rezervarile", scris inainte sa se dovedeasca (8 divergente din
  // 72) ca tot ce influenteaza miscarea trebuie sa supravietuiasca roundtrip-ului
  // ca `1000 + save + load + 1000 == 2000` sa tina. Un pion cu jobul anulat la
  // load re-scaneaza si reia progresul de la zero: alta pozitie, alt hash.
  // Intentia lui M5 — un save inconsistent nu deadlock-uieste tacut — se
  // pastreaza in `reconstruiesteRezervari`, care anuleaza CU RAPORT ce nu se
  // poate re-rezerva.
  /** 0 = fara job; altfel felul (vezi `Desemnare` din desemnari.ts, +1). */
  jobKind: Uint8Array
  /** Identitatea INSTANTEI de job, din `w.nextId`. E componenta `jobId` din tuplul de rezervare. */
  jobId: Int32Array
  /** Id-ul tintei (o desemnare). */
  jobTarget: Int32Array
  /** `PasJob`. */
  jobStep: Uint8Array
  /** Unitati de munca acumulate in pasul LUCREAZA. */
  jobProgres: Int32Array
  /**
   * Celula de lucru aleasa la scanare. Se persista SEPARAT de `goal*`: cautarea
   * ei nu are raspuns unic in timp (terenul se schimba), deci dupa incarcare
   * agentul ar putea alege alta — iar `goal*` se goleste la sosire.
   */
  jobWorkX: Int32Array
  jobWorkY: Int32Array
  jobWorkZ: Int32Array
  /**
   * Cate refuzuri de drum a primit jobul curent (BUGET_DEPASIT, OCUPAT_DE_OSTIL,
   * sau o celula de lucru pierduta). La `jobMaxIncercari` jobul se incheie: fara
   * plafon, un drum mereu peste buget parca pionul pe viata cu tinta rezervata.
   */
  jobIncercari: Uint8Array
  /**
   * Racirea pe PERECHEA (pion, tinta): dupa ce pionul a renuntat la o tinta din
   * cauze care tin de EL (drumul lui e blocat de un ostil, prea scump pentru el),
   * n-o reia pana la tickul pereche. Pe tinta nu se scrie nimic — altcineva, din
   * alta parte, poate ajunge.
   *
   * E o MULTIME marginita, `evitaSloturi` perechi per pion (`slot * evitaSloturi + k`),
   * nu un scalar. Prima versiune tinea o singura tinta, si recenzia a masurat ce
   * iese: cu doua tinte peste buget, a doua refuzata o stergea pe prima, iar
   * pionul le alterna pe viata — 59 de A*-uri esuate in 1200 de tickuri, zero
   * munca — exact defectul „pion parcat repetand cea mai scumpa cautare" pe care
   * plafonul de incercari trebuia sa-l inchida. Plafonul il mutase, nu il inchisese.
   * Evictia e a celei mai vechi (tickul de expirare cel mai mic). 0 = slot liber.
   */
  evitaSloturi: number
  evitaTinta: Int32Array
  evitaPanaLa: Int32Array
  /**
   * Tickul la care pionul cere de lucru IN AFARA decalajului obisnuit — de
   * exemplu tickul de dupa un job incheiat. Fara asta, dupa fiecare voxel sapat
   * pionul hoinarea aleator pana la urmatorul `(tick + id) % jobRescanTicks`:
   * masurat, 21,6% din timpul unei cariere. 0 = niciunul.
   */
  scanLaTick: Int32Array
  /**
   * Prioritatea personala pe fiecare categorie, `slot * CATEGORII + categorie`.
   * 0 = niciodata; 1..personalPriorityLevels. E „grila manuala"; modul Auto e
   * pur si simplu toata lumea la valoarea implicita din content.
   */
  prioPersonala: Uint8Array
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
  /** PERSISTED — drumurile in curs. Un A* nu are raspuns unic; vezi `agents.ts`. */
  paths: PathStore
  /** PERSISTED — ce a cerut jucatorul sa se faca. Tintele joburilor. */
  desemnari: DesignationStore
  /**
   * DERIVED din joburile agentilor. Se reconstruieste la incarcare, in ordinea
   * slotului; ce nu se poate reconstrui se anuleaza cu raport. Vezi rezervari.ts.
   */
  rezervari: ReservationStore
  /** TRANSIENT — de ce sta fiecare pion. Pentru overlay si teste, nu pentru simulare. */
  ratiune: RatiuneStore
}

export function makeAgentStore(capacity: number, prioPersonalaImplicita = 1, evitaSloturi = 4): AgentStore {
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
    jobKind: new Uint8Array(capacity),
    jobId: new Int32Array(capacity),
    jobTarget: new Int32Array(capacity),
    jobStep: new Uint8Array(capacity),
    jobProgres: new Int32Array(capacity),
    jobWorkX: new Int32Array(capacity),
    jobWorkY: new Int32Array(capacity),
    jobWorkZ: new Int32Array(capacity),
    jobIncercari: new Uint8Array(capacity),
    evitaSloturi,
    evitaTinta: new Int32Array(capacity * evitaSloturi),
    evitaPanaLa: new Int32Array(capacity * evitaSloturi),
    scanLaTick: new Int32Array(capacity),
    prioPersonala: new Uint8Array(capacity * CATEGORII).fill(prioPersonalaImplicita),
  }
}

/** Indexul slotului pentru un id, sau -1. Liniar deocamdata; devine index cand conteaza. */
export function slotOf(agents: AgentStore, id: number): number {
  for (let i = 0; i < agents.count; i++) {
    if (agents.id[i] === id && agents.alive[i] === 1) return i
  }
  return -1
}
