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
import { CATEGORII, makeAgentStore, MM_PER_CELL, NEVOI, nevoiaInitiala, Piesa, RNG_STREAMS, SCHEMA_VERSION } from './state.ts'
import { createRegions, restoreRegions } from './regions.ts'
import { makePathStore } from './drumuri.ts'
import type { PathStore } from './drumuri.ts'
import { DEFAULT_RULES } from './content.ts'
import type { Rules } from './content.ts'
import { esteMaterialCunoscut, MATERIAL_MAX, runCount } from './terrain/chunk.ts'
import { createTerrain, ensureChunk, inWorld, reconstruiesteGrinzi, WORLD_CELLS } from './terrain/terrain.ts'
import { Desemnare, makeDesignationStore, reindexeazaDesemnari } from './desemnari.ts'
import type { DesignationStore } from './desemnari.ts'
import { createReservations } from './rezervari.ts'
import { makeRatiuneStore, reconstruiesteRezervari } from './joburi.ts'
import { FelJob, PasConstruieste } from './state.ts'
import { slotDesemnare } from './desemnari.ts'
import { makeItemStore, reindexeazaIteme } from './iteme.ts'
import type { ItemStore } from './iteme.ts'
import { makeZoneStore, reindexeazaZone } from './zone.ts'
import type { ZoneStore } from './zone.ts'
import { memorieSprijin } from './stabilitate.ts'

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
  const it = w.iteme
  const z = w.zone
  const zc = w.zone.celule

  const env: Envelope = {
    game: 'kinstead',
    schema: w.schema,
    build: SAVE_BUILD,
    savedAtTick: w.tick,
    data: {
      seed: w.seed,
      tick: w.tick,
      nextId: w.nextId,
      // PERSISTED: plecatii raman plecati. Vezi `World.plecatiTotal`.
      plecatiTotal: w.plecatiTotal,
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
        // Si blocurile MURDARE. Sunt goale la sfarsit de tick si, de la CONT-1,
        // si dupa orice comanda de teren (`applyCommand` reconstruieste pe loc):
        // salvarea lor NU acoperea fereastra comanda -> tick, fiindca lumea
        // incarcata le reconstruia din terenul nou, iar cea continua citea intai
        // celulele vechi. Campul ramane pentru save-urile vechi, luate in fereastra.
        murdare: [...w.regions.dirty].sort((a, b) => a - b),
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
        // Jobul curent e PERSISTED: nu se anuleaza la incarcare. Vezi state.ts.
        jobKind: Array.from(a.jobKind.subarray(0, a.count)),
        jobId: Array.from(a.jobId.subarray(0, a.count)),
        jobTarget: Array.from(a.jobTarget.subarray(0, a.count)),
        jobStep: Array.from(a.jobStep.subarray(0, a.count)),
        jobProgres: Array.from(a.jobProgres.subarray(0, a.count)),
        jobWorkX: Array.from(a.jobWorkX.subarray(0, a.count)),
        jobWorkY: Array.from(a.jobWorkY.subarray(0, a.count)),
        jobWorkZ: Array.from(a.jobWorkZ.subarray(0, a.count)),
        jobIncercari: Array.from(a.jobIncercari.subarray(0, a.count)),
        jobDest: Array.from(a.jobDest.subarray(0, a.count)),
        jobCantitate: Array.from(a.jobCantitate.subarray(0, a.count)),
        jobEfect: Array.from(a.jobEfect.subarray(0, a.count)),
        caraKind: Array.from(a.caraKind.subarray(0, a.count)),
        caraCantitate: Array.from(a.caraCantitate.subarray(0, a.count)),
        // `jobConsumat` era HASHUIT si citit de `decode`, dar nu se scria niciodata:
        // `decode` il punea pe 0, deci `decode(encode(w))` dadea alt hash decat `w`
        // INAINTE de orice tick, ori de cate ori un pion era in mijlocul mesei.
        // Masurat la gasire: consumat 20 la salvare, 0 dupa incarcare, si divergenta
        // dupa 500 de tickuri. A supravietuit fiindca fixtura pe care sta M5 nu
        // ajunge niciodata sa manance — vezi testul de mai jos in saveload.test.ts.
        jobConsumat: Array.from(a.jobConsumat.subarray(0, a.count)),
        evitaSloturi: a.evitaSloturi,
        evitaTinta: Array.from(a.evitaTinta.subarray(0, a.count * a.evitaSloturi)),
        evitaPanaLa: Array.from(a.evitaPanaLa.subarray(0, a.count * a.evitaSloturi)),
        scanLaTick: Array.from(a.scanLaTick.subarray(0, a.count)),
        // Pasul lui `prioPersonala` se scrie explicit: cand apare o categorie
        // noua, `decode` largeste tabloul in loc sa refuze fiecare save existent.
        categorii: CATEGORII,
        prioPersonala: Array.from(a.prioPersonala.subarray(0, a.count * CATEGORII)),
        // Nevoile. Pasul se scrie EXPLICIT, ca la `prioPersonala`: cand apare o
        // nevoie noua, `decode` largeste tabloul in loc sa refuze fiecare save.
        nevoiFeluri: NEVOI,
        nevoi: Array.from(a.nevoi.subarray(0, a.count * NEVOI)),
        nevoieReincercaLaTick: Array.from(a.nevoieReincercaLaTick.subarray(0, a.count * NEVOI)),
        // Dispozitia si gandurile de EVENIMENT. Tinta NU se scrie: e DERIVED din
        // nevoi si din gandurile astea, deci se recalculeaza la incarcare.
        dispozitie: Array.from(a.dispozitie.subarray(0, a.count)),
        ganduriSloturi: a.ganduriSloturi,
        gandFel: Array.from(a.gandFel.subarray(0, a.count * a.ganduriSloturi)),
        gandPanaLa: Array.from(a.gandPanaLa.subarray(0, a.count * a.ganduriSloturi)),
      },
      // Desemnarile: ce a cerut jucatorul. `ultimulMotiv` e TRANSIENT si nu
      // se scrie; `laCelula` si `vii` sunt DERIVED si se reindexeaza la incarcare.
      // Rezervarile NU se scriu deloc: se refac din joburile agentilor.
      desemnari: {
        count: w.desemnari.count,
        capacity: w.desemnari.capacity,
        id: Array.from(w.desemnari.id.subarray(0, w.desemnari.count)),
        kind: Array.from(w.desemnari.kind.subarray(0, w.desemnari.count)),
        wx: Array.from(w.desemnari.wx.subarray(0, w.desemnari.count)),
        wy: Array.from(w.desemnari.wy.subarray(0, w.desemnari.count)),
        z: Array.from(w.desemnari.z.subarray(0, w.desemnari.count)),
        prioritate: Array.from(w.desemnari.prioritate.subarray(0, w.desemnari.count)),
        piesa: Array.from(w.desemnari.piesa.subarray(0, w.desemnari.count)),
        alive: Array.from(w.desemnari.alive.subarray(0, w.desemnari.count)),
        reincercaLaTick: Array.from(w.desemnari.reincercaLaTick.subarray(0, w.desemnari.count)),
      },
      // Itemele: mormanele, cu racirea lor (PERSISTED din acelasi motiv ca la
      // desemnari — influenteaza plafonul de evaluari). Indexul e DERIVED.
      iteme: {
        count: it.count,
        capacity: it.capacity,
        id: Array.from(it.id.subarray(0, it.count)),
        kind: Array.from(it.kind.subarray(0, it.count)),
        wx: Array.from(it.wx.subarray(0, it.count)),
        wy: Array.from(it.wy.subarray(0, it.count)),
        z: Array.from(it.z.subarray(0, it.count)),
        cantitate: Array.from(it.cantitate.subarray(0, it.count)),
        alive: Array.from(it.alive.subarray(0, it.count)),
        reincercaLaTick: Array.from(it.reincercaLaTick.subarray(0, it.count)),
      },
      // Zonele si celulele lor. Indexul (libere, acceptante, deMutat) e DERIVED
      // si porneste murdar la incarcare.
      zone: {
        count: z.count,
        capacity: z.capacity,
        id: Array.from(z.id.subarray(0, z.count)),
        kind: Array.from(z.kind.subarray(0, z.count)),
        prioritate: Array.from(z.prioritate.subarray(0, z.count)),
        alive: Array.from(z.alive.subarray(0, z.count)),
        celule: {
          count: zc.count,
          capacity: zc.capacity,
          id: Array.from(zc.id.subarray(0, zc.count)),
          zonaId: Array.from(zc.zonaId.subarray(0, zc.count)),
          wx: Array.from(zc.wx.subarray(0, zc.count)),
          wy: Array.from(zc.wy.subarray(0, zc.count)),
          z: Array.from(zc.z.subarray(0, zc.count)),
          alive: Array.from(zc.alive.subarray(0, zc.count)),
        },
      },
    },
  }
  return JSON.stringify(env)
}

const STORE_GOL = { count: 0, capacity: 0, id: [], kind: [], wx: [], wy: [], z: [], alive: [] }

/**
 * Lantul de migrari. O intrare per treapta de schema. Fiecare e idempotenta si
 * are o fixtura golden in `tests/fixtures/`, capturata INAINTE de schimbare.
 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // 6 -> 7 (S20-23, taietura 2): constructia. Un save de schema 6 n-are nicio
  // piesa (nu existau), deci fiecare desemnare din el primeste SANTINELA
  // `Piesa.NICIUNA` — si faptul ca santinela e chiar 0 nu e o coincidenta
  // fericita, e motivul pentru care a fost aleasa acolo. Vezi `Piesa`.
  //
  // Latimea lui `prioPersonala` creste odata cu ea (CATEGORII 2 -> 3), dar aia
  // nu are nevoie de intrare aici: pasul se scrie EXPLICIT in save (`categorii`),
  // iar `decode` largeste cu implicitul din content — acelasi mecanism care a dus
  // save-urile de schema 3 de la o categorie la doua.
  6: (d) => {
    const des = (d.desemnari as Record<string, unknown> | undefined) ?? {}
    const n = (des.count as number | undefined) ?? 0
    return { ...d, desemnari: { ...des, piesa: des.piesa ?? new Array<number>(n).fill(Piesa.NICIUNA) } }
  },
  // 1 -> 2 (S16-19): desemnari, joburi pe agenti, prioritati personale.
  //
  // Un save de schema 1 n-are niciun job in curs si nicio desemnare, deci
  // migrarea lui e sa spuna asta explicit. Campurile de job lipsa pe agenti se
  // completeaza la citire cu „fara job", iar prioritatile personale cu
  // implicitul din content — exact starea in care ar fi fost lumea daca jobul
  // ar fi existat de la inceput si nimeni n-ar fi cerut nimic.
  1: (d) => ({ ...d, desemnari: d.desemnari ?? { ...STORE_GOL, prioritate: [], reincercaLaTick: [] } }),
  // 2 -> 3 (recenzia S16-19): racirea pe pereche devine multime (`evitaTinta`/
  // `evitaPanaLa`, K sloturi per pion) in locul scalarului `tintaRefuzata`/
  // `refuzPanaLa`; apare `scanLaTick`; blocurile murdare se salveaza. Vechea
  // pereche, daca era activa, intra in primul slot al multimii — citirea o face
  // `decode`, care stie K-ul din reguli; aici doar se declara ca `murdare` e gol.
  2: (d) => {
    const r = (d.regiuni as Record<string, unknown> | undefined) ?? {}
    return { ...d, regiuni: { ...r, murdare: r.murdare ?? [] } }
  },
  // 3 -> 4 (S16-19, taietura 2): iteme, zone, carat. Un save de schema 3 n-are
  // niciun morman si nicio zona (nu existau), deci stores goale; pionii n-au
  // nimic in mana si niciun job de carat (`jobDest`, `jobCantitate`, `jobEfect`,
  // `cara*` zero). `prioPersonala` avea o singura categorie: se declara pasul
  // vechi (`categorii: 1`), iar `decode` il largeste la CATEGORII cu implicitul
  // din content — altfel fiecare save de schema 3 ar fi refuzat pe lungime.
  // 5 -> 6 (S16-19, taietura 3): dispozitia si gandurile. Un save de schema 5
  // n-are niciun gand si nicio bara; `decode` pune baza din content si zero
  // ganduri. Fara OPTIMISM_INITIAL: nu sunt nou-nascuti, sunt oameni care traiau
  // deja acolo.
  5: (d) => {
    const a = (d.agents as Record<string, unknown> | undefined) ?? {}
    return {
      ...d,
      plecatiTotal: d.plecatiTotal ?? 0,
      agents: { ...a, ganduriSloturi: a.ganduriSloturi ?? 0 },
    }
  },
  // 4 -> 5 (S16-19, taietura 3): nevoile. Un save de schema 4 n-are nicio
  // coloana de nevoi inregistrata, si asta se spune EXPLICIT: `nevoiFeluri: 0`.
  //
  // Zero NU inseamna aici „nevoi la zero" — inseamna „niciuna inregistrata", iar
  // `decode` le umple DEFAZAT din id. Distinctia e tot ce desparte migrarea asta
  // de o colonie care se incarca infometata: `0` ca VALOARE ar pune fiecare pion
  // sub pragul critic, iar `nevoieMax` pentru toti i-ar porni in lockstep.
  //
  // Si cititorul de nevoi accepta `k === 0`, spre deosebire de cel de
  // `prioPersonala`, care refuza `k < 1`: copiat verbatim, ar fi refuzat fiecare
  // save de schema 4, inclusiv fixtura golden.
  4: (d) => {
    const a = (d.agents as Record<string, unknown> | undefined) ?? {}
    const n = (a.count as number | undefined) ?? 0
    return {
      ...d,
      agents: {
        ...a,
        nevoiFeluri: a.nevoiFeluri ?? 0,
        jobConsumat: a.jobConsumat ?? new Array<number>(n).fill(0),
      },
    }
  },
  3: (d) => {
    const a = (d.agents as Record<string, unknown> | undefined) ?? {}
    const n = (a.count as number | undefined) ?? 0
    const zero = (): number[] => new Array<number>(n).fill(0)
    return {
      ...d,
      agents: {
        ...a,
        categorii: a.categorii ?? 1,
        jobDest: a.jobDest ?? zero(),
        jobCantitate: a.jobCantitate ?? zero(),
        jobEfect: a.jobEfect ?? zero(),
        caraKind: a.caraKind ?? zero(),
        caraCantitate: a.caraCantitate ?? zero(),
      },
      iteme: d.iteme ?? { ...STORE_GOL, cantitate: [], reincercaLaTick: [] },
      zone: d.zone ?? { ...STORE_GOL, prioritate: [], celule: { ...STORE_GOL, zonaId: [] } },
    }
  },
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

  const agents = makeAgentStore(capacity, rules.personalPriorityDefault, rules.jobAvoidSlots, rules.nevoieMax, rules.ganduriSloturi, rules.dispozitieBaza)
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
  // Save-urile de schema 1 n-au job: campurile raman la zero, adica „fara job".
  for (const camp of ['jobKind', 'jobId', 'jobTarget', 'jobStep', 'jobProgres', 'jobWorkX', 'jobWorkY', 'jobWorkZ', 'jobIncercari', 'jobDest', 'jobCantitate', 'jobEfect', 'caraKind', 'caraCantitate', 'jobConsumat', 'scanLaTick'] as const) {
    const v = agentsRaw[camp] as number[] | undefined
    if (!v) continue
    if (v.length !== count) return refuse(Reason.VALOARE_INVALIDA, { camp: `agents.${camp}`, lungime: v.length, asteptat: count })
    agents[camp].set(v)
  }
  if (agentsRaw.evitaTinta && agentsRaw.evitaPanaLa) {
    const k = agentsRaw.evitaSloturi as number
    const t = agentsRaw.evitaTinta as number[]
    const p = agentsRaw.evitaPanaLa as number[]
    if (!Number.isInteger(k) || t.length !== count * k || p.length !== count * k) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'agents.evitaTinta', lungime: t.length, asteptat: count * (k ?? -1) })
    }
    // K-ul din save si cel din reguli pot diferi: se copiaza cat incape, in
    // ordinea sloturilor — restul se pierde, ceea ce e o racire mai scurta, nu
    // o stare invalida.
    const kk = Math.min(k, agents.evitaSloturi)
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < kk; j++) {
        agents.evitaTinta[i * agents.evitaSloturi + j] = t[i * k + j]!
        agents.evitaPanaLa[i * agents.evitaSloturi + j] = p[i * k + j]!
      }
    }
  } else if (agentsRaw.tintaRefuzata && agentsRaw.refuzPanaLa) {
    // Schema 2: o singura pereche per pion. Intra in primul slot.
    const t = agentsRaw.tintaRefuzata as number[]
    const p = agentsRaw.refuzPanaLa as number[]
    for (let i = 0; i < count; i++) {
      agents.evitaTinta[i * agents.evitaSloturi] = t[i] ?? 0
      agents.evitaPanaLa[i * agents.evitaSloturi] = p[i] ?? 0
    }
  }
  if (agentsRaw.prioPersonala) {
    // Pasul din save (`categorii`) poate fi mai mic decat cel din cod: o categorie
    // noua primeste implicitul din content pe fiecare pion. Acelasi tipar ca la
    // `evitaSloturi`.
    const k = (agentsRaw.categorii as number | undefined) ?? 1
    const pp = agentsRaw.prioPersonala as number[]
    if (!Number.isInteger(k) || k < 1 || pp.length !== count * k) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'agents.prioPersonala', lungime: pp.length, asteptat: count * k })
    }
    const kk = Math.min(k, CATEGORII)
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < kk; c++) agents.prioPersonala[i * CATEGORII + c] = pp[i * k + c]!
    }
  }

  // Nevoile. Acelasi tipar de largire ca `prioPersonala`, cu O DIFERENTA care
  // conteaza: pasul poate fi ZERO. Un save de schema 4 n-are nicio coloana de
  // nevoi, iar validatorul lui `prioPersonala` refuza `k < 1` — copiat verbatim,
  // ar fi refuzat fiecare save de dinaintea taieturii asteia.
  //
  // Coloanele care LIPSESC nu se umplu nici cu zero, nici cu maximul: se umplu
  // DEFAZAT din id. Zero ar incarca o colonie deja sub pragul critic; maximul
  // i-ar porni pe toti in acelasi punct al ciclului, si atunci toata asezarea ar
  // flamanzi in aceeasi fereastra, la nesfarsit — valul nu s-ar sparge niciodata.
  {
    const k = (agentsRaw.nevoiFeluri as number | undefined) ?? 0
    if (!Number.isInteger(k) || k < 0 || k > NEVOI) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'agents.nevoiFeluri', valoare: k, min: 0, max: NEVOI })
    }
    const nv = agentsRaw.nevoi as number[] | undefined
    const nr = agentsRaw.nevoieReincercaLaTick as number[] | undefined
    if (k > 0 && (!nv || nv.length !== count * k)) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'agents.nevoi', lungime: nv?.length ?? -1, asteptat: count * k })
    }
    if (k > 0 && nr && nr.length !== count * k) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'agents.nevoieReincercaLaTick', lungime: nr.length, asteptat: count * k })
    }
    for (let i = 0; i < count; i++) {
      for (let n = 0; n < NEVOI; n++) {
        agents.nevoi[i * NEVOI + n] = n < k
          ? nv![i * k + n]!
          : nevoiaInitiala(agents.id[i]!, n, rules.nevoieMax, rules.nevoieFazaPas, rules.nevoieFazaSpan)
        agents.nevoieReincercaLaTick[i * NEVOI + n] = n < k && nr ? nr[i * k + n]! : 0
      }
    }
  }

  // Dispozitia si gandurile de eveniment. Bara lipsa = baza din content, nu zero:
  // zero ar incarca fiecare pion sub pragul de PLECARE, si toata asezarea ar
  // pleca in primele tickuri de dupa incarcare.
  {
    const disp = agentsRaw.dispozitie as number[] | undefined
    if (disp && disp.length !== count) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'agents.dispozitie', lungime: disp.length, asteptat: count })
    }
    for (let i = 0; i < count; i++) agents.dispozitie[i] = disp ? disp[i]! : rules.dispozitieBaza

    const k = (agentsRaw.ganduriSloturi as number | undefined) ?? 0
    if (!Number.isInteger(k) || k < 0) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'agents.ganduriSloturi', valoare: k, min: 0 })
    }
    const gf = agentsRaw.gandFel as number[] | undefined
    const gp = agentsRaw.gandPanaLa as number[] | undefined
    if (k > 0 && (!gf || !gp || gf.length !== count * k || gp.length !== count * k)) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'agents.gandFel', lungime: gf?.length ?? -1, asteptat: count * k })
    }
    // Un save cu MAI MULTE sloturi de gand decat are codul se REFUZA, spre
    // deosebire de racirea din `evitaTinta`, unde restul se poate pierde.
    // Un gand pierdut MUTA dispozitia, deci nu e o degradare gratioasa.
    if (k > agents.ganduriSloturi) {
      return refuse(Reason.CAPACITATE_DEPASITA, { camp: 'agents.ganduriSloturi', valoare: k, capacitate: agents.ganduriSloturi })
    }
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < agents.ganduriSloturi; j++) {
        agents.gandFel[i * agents.ganduriSloturi + j] = j < k && gf ? gf[i * k + j]! : 0
        agents.gandPanaLa[i * agents.ganduriSloturi + j] = j < k && gp ? gp[i * k + j]! : 0
      }
    }
  }

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
    // Un material necunoscut in teren e un save editat sau stricat: refuz, nu fizica
    // noua. Altfel valoarea ar deveni tacut GRINDA (sau ce urmeaza) la prima versiune
    // care o defineste.
    for (const m of saved.runMaterial) {
      if (!esteMaterialCunoscut(m)) {
        return refuse(Reason.VALOARE_INVALIDA, { camp: 'terrain.promoted.runMaterial', cx: saved.cx, cy: saved.cy, valoare: m, max: MATERIAL_MAX })
      }
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

  // Indexul grinzilor e DERIVED din voxeli: se reconstruieste, nu se citeste.
  reconstruiesteGrinzi(terrain)

  const drumuri = incarcaDrumuri(makePathStore(capacity, rules.maxPathCells), agents, agentsRaw)
  if (!drumuri.ok) return drumuri

  // Extinderea acoperirii. Un save mai vechi n-o are: atunci se porneste gol si se
  // reconstruieste lene, ca inainte.
  const rRaw = data.regiuni as { blocuri?: number[]; legate?: number[]; murdare?: number[] } | undefined
  const regiuni = rRaw && Array.isArray(rRaw.blocuri) && rRaw.blocuri.length > 0
    ? restoreRegions(terrain, rRaw.blocuri, rRaw.legate ?? [], rules)
    : createRegions()
  // Blocurile murdare de la momentul salvarii: lumea incarcata le reconstruieste
  // la tickul urmator, exact ca cea continua.
  for (const k of rRaw?.murdare ?? []) regiuni.dirty.add(k)

  const desemnari = incarcaDesemnari(data.desemnari, rules)
  if (!desemnari.ok) return desemnari
  const iteme = incarcaIteme(data.iteme, rules)
  if (!iteme.ok) return iteme
  const zone = incarcaZone(data.zone, rules)
  if (!zone.ok) return zone

  const w: World = {
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
    desemnari: desemnari.value,
    iteme: iteme.value,
    zone: zone.value,
    rezervari: createReservations(),
    ratiune: makeRatiuneStore(capacity),
    sprijin: memorieSprijin(),
    plecatiTotal: (data.plecatiTotal as number | undefined) ?? 0,
  }
  const construit = valideazaJoburiDeConstruit(w, rules)
  if (!construit.ok) return construit
  // Rezervarile sunt DERIVED din joburi. Ce nu se poate reconstrui e un save
  // inconsistent: jobul se anuleaza si se numara, nu se lasa tacut.
  reconstruiesteRezervari(w, rules)
  return accept(w)
}

/**
 * Joburile de construit, contra CONTINUTULUI. `jobCantitate` e count-ul rezervat pe
 * SURSA CURENTA (nu totalul piesei — ala e `piese[].cantitate`, citit de `zideste`),
 * deci pana la RIDICA inclusiv e intre 1 si ce mai lipseste; dupa, codul scrie 0,
 * dar un save de dinaintea taieturii 3 a logisticii are acolo totalul piesei si se
 * ACCEPTA (fixtura golden de schema 7): nu se citeste dupa RIDICA. Ce e in mana e
 * cel mult piesa si e de FELUL ei: `zideste` citeste doar cantitatea, deci un save
 * cu pamant in mana pe un job de perete ar zidi piatra din pamant (recenzia din
 * 25.09). Un santier disparut nu se valideaza aici — reconstructia anuleaza jobul,
 * cu raport. Contradictia se REFUZA, nu se repara tacit.
 */
function valideazaJoburiDeConstruit(w: World, rules: Rules): Outcome<void> {
  const a = w.agents
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] !== 1 || a.jobKind[i] !== FelJob.CONSTRUIESTE) continue
    const ds = slotDesemnare(w.desemnari, a.jobDest[i]!)
    if (ds === -1) continue
    const spec = rules.piese[w.desemnari.piesa[ds]!]!
    const cara = a.caraCantitate[i]!
    const cant = a.jobCantitate[i]!
    if (cara > spec.cantitate) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `agents.caraCantitate[${i}]`, valoare: cara, max: spec.cantitate, motiv: 'mai mult in mana decat costa piesa' })
    }
    if (cara > 0 && a.caraKind[i] !== rules.digYield[spec.material]!.fel) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `agents.caraKind[${i}]`, valoare: a.caraKind[i]!, asteptat: rules.digYield[spec.material]!.fel, motiv: 'alt fel in mana decat cere piesa' })
    }
    if (a.jobStep[i]! <= PasConstruieste.RIDICA) {
      if (cant < 1 || cant > spec.cantitate - cara) {
        return refuse(Reason.VALOARE_INVALIDA, { camp: `agents.jobCantitate[${i}]`, valoare: cant, min: 1, max: spec.cantitate - cara, motiv: 'count-ul pe sursa curenta nu e intre 1 si ce mai lipseste' })
      }
    } else if (cant < 0 || cant > spec.cantitate) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `agents.jobCantitate[${i}]`, valoare: cant, min: 0, max: spec.cantitate })
    }
  }
  return accept()
}

/** Citeste un tablou de store SoA: obligatoriu, de lungime `count`. */
function citesteCampuri<K extends string>(
  r: Record<string, number[] | number | unknown>,
  prefix: string,
  count: number,
  campuri: readonly K[],
  tinta: Record<K, Int32Array | Uint8Array>,
): Outcome<void> {
  for (const camp of campuri) {
    const v = r[camp] as number[] | undefined
    if (!v) return refuse(Reason.LIPSA_MATERIAL, { camp: `${prefix}.${camp}` })
    if (v.length !== count) return refuse(Reason.VALOARE_INVALIDA, { camp: `${prefix}.${camp}`, lungime: v.length, asteptat: count })
    tinta[camp].set(v)
  }
  return accept()
}

function citesteCount(r: Record<string, unknown>, prefix: string, capacity: number): Outcome<number> {
  const count = r.count as number
  if (!Number.isInteger(count) || count < 0 || count > capacity) {
    return refuse(Reason.CAPACITATE_DEPASITA, { camp: `${prefix}.count`, valoare: String(count), maxim: capacity })
  }
  return accept(count)
}

function incarcaDesemnari(raw: unknown, rules: Rules): Outcome<DesignationStore> {
  const r = raw as Record<string, unknown> | undefined
  const d = makeDesignationStore(rules.designationCapacity)
  if (!r) return accept(d)
  const count = citesteCount(r, 'desemnari', d.capacity)
  if (!count.ok) return count
  d.count = count.value
  const c = citesteCampuri(r, 'desemnari', d.count, ['id', 'kind', 'wx', 'wy', 'z', 'prioritate', 'piesa', 'alive', 'reincercaLaTick'] as const, d)
  if (!c.ok) return c
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 0) continue
    const p = d.prioritate[i]!
    if (p < 1 || p > rules.designationPriorityLevels) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `desemnari.prioritate[${i}]`, valoare: p, min: 1, max: rules.designationPriorityLevels })
    }
    // Felul si piesa trebuie sa se potriveasca. Fara refuzul asta, santinela
    // `Piesa.NICIUNA` ar fi decorativa: o migrare care umple cu zero ar produce
    // desemnari de CONSTRUIT fara piesa, si nimic nu le-ar deosebi. Contradictia
    // se REFUZA, nu se repara tacut.
    const felPiesa = d.piesa[i]!
    const eConstructie = d.kind[i] === Desemnare.CONSTRUIESTE
    // Si piesa trebuie sa EXISTE in tabel. Verificarea de mai jos cerea doar ca ea
    // sa fie diferita de santinela, deci un `piesa` din afara tabelului trecea, iar
    // prima scanare care il folosea ca indice (`rules.piese[felPiesa]`, `rez[...]`)
    // crapa cu TypeError — o incarcare acceptata care omoara jocul cateva zeci de
    // tickuri mai tarziu. Un save stricat se REFUZA la usa, nu se descopera in rulare.
    if (felPiesa < 0 || felPiesa >= rules.piese.length) {
      return refuse(Reason.VALOARE_INVALIDA, {
        camp: `desemnari.piesa[${i}]`,
        valoare: felPiesa,
        maxim: rules.piese.length - 1,
        motiv: 'piesa nu exista in tabelul de continut',
      })
    }
    if (eConstructie !== (felPiesa !== Piesa.NICIUNA)) {
      return refuse(Reason.VALOARE_INVALIDA, {
        camp: `desemnari.piesa[${i}]`,
        valoare: felPiesa,
        kind: d.kind[i]!,
        motiv: eConstructie ? 'desemnare de construit fara piesa' : 'piesa pe o desemnare care nu e de construit',
      })
    }
  }
  const idx = reindexeazaDesemnari(d)
  if (!idx.ok) return idx
  return accept(d)
}

function incarcaIteme(raw: unknown, rules: Rules): Outcome<ItemStore> {
  const r = raw as Record<string, unknown> | undefined
  const s = makeItemStore(rules.itemCapacity)
  if (!r) return refuse(Reason.LIPSA_MATERIAL, { camp: 'iteme' })
  const count = citesteCount(r, 'iteme', s.capacity)
  if (!count.ok) return count
  s.count = count.value
  const c = citesteCampuri(r, 'iteme', s.count, ['id', 'kind', 'wx', 'wy', 'z', 'cantitate', 'alive', 'reincercaLaTick'] as const, s)
  if (!c.ok) return c
  const idx = reindexeazaIteme(s, rules)
  if (!idx.ok) return idx
  return accept(s)
}

function incarcaZone(raw: unknown, rules: Rules): Outcome<ZoneStore> {
  const r = raw as Record<string, unknown> | undefined
  const s = makeZoneStore(rules.zoneCapacity, rules.zoneCellCapacity)
  if (!r) return refuse(Reason.LIPSA_MATERIAL, { camp: 'zone' })
  const count = citesteCount(r, 'zone', s.capacity)
  if (!count.ok) return count
  s.count = count.value
  const c = citesteCampuri(r, 'zone', s.count, ['id', 'kind', 'prioritate', 'alive'] as const, s)
  if (!c.ok) return c
  const cr = r.celule as Record<string, unknown> | undefined
  if (!cr) return refuse(Reason.LIPSA_MATERIAL, { camp: 'zone.celule' })
  const ccount = citesteCount(cr, 'zone.celule', s.celule.capacity)
  if (!ccount.ok) return ccount
  s.celule.count = ccount.value
  const cc = citesteCampuri(cr, 'zone.celule', s.celule.count, ['id', 'zonaId', 'wx', 'wy', 'z', 'alive'] as const, s.celule)
  if (!cc.ok) return cc
  const idx = reindexeazaZone(s, rules)
  if (!idx.ok) return idx
  return accept(s)
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
