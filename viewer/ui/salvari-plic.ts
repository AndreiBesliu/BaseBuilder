/**
 * Plicul salvarii — PUR, testat in node. Stocarea (IndexedDB) e in salvari-idb.ts: amestecate
 * intr-un fisier, tipurile DOM ar fi inrosit typecheck-ul testelor (panoul, T8).
 *
 * Lumea intra ca text (`encode` din src/sim/save.ts, neatins); plicul adauga doar ce e al
 * VIEWER-ului: camera, nivelul, viteza, bifele „Primii pasi". Masurat: lumea viewer-ului 192–232 KiB,
 * `encode` 3,6 ms; M10 (luna 10) 5,4 MiB, `encode` 61–72 ms.
 */

import type { ModPornire } from './pornire.ts'

export const FORMAT_SALVARE = 1

export interface MetaVizualizare {
  readonly camera: { readonly pos: readonly [number, number, number]; readonly tinta: readonly [number, number, number] }
  /** Cota planului de taiere in metri de lume, sau null = oprit. */
  readonly slice: number | null
  readonly viteza: number
  /** Bifele „Primii pasi" (depozit, sapa, piesa, pion). */
  readonly primiPasi: readonly boolean[]
}

export interface Salvare {
  readonly format: number
  readonly id: string
  readonly nume: string
  /** Ceasul MASINII, ISO — e UI, nu simulare. */
  readonly salvatLa: string
  readonly tick: number
  readonly seed: number
  readonly oameni: number
  readonly meta: MetaVizualizare
  /** `encode(world)`. */
  readonly lume: string
}

/** Rezumatul din lista de incarcare, fara textul lumii (sute de KiB). */
export type RezumatSalvare = Omit<Salvare, 'lume'>

/** Prefixul sloturilor de salvare automata. */
export const ID_AUTOMATA = 'auto'

/**
 * Slotul salvarii automate a unei LUMI: unul pe seed, suprascris. Cu un singur slot pentru tot,
 * un joc nou isi scria salvarea automata peste cea a jocului de dinainte (recenzia UI-ului, INT-1).
 */
export function idAutomata(seed: number): string {
  return `${ID_AUTOMATA}-${seed}`
}

/**
 * Doar un joc al jucatorului se salveaza singur: un joc nou sau unul incarcat. NU demo-ul de sub
 * ecranul de titlu (si dupa „Explorează demo-ul" sau o incarcare esuata, tot `titlu`), NU modul de
 * verificare, NU gate-ul.
 */
export function salvareAutomataPermisa(mod: ModPornire): boolean {
  return mod === 'joc-nou' || mod === 'incarca'
}

const esteNumar = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const esteTriplet = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every(esteNumar)

/**
 * Validarea unui obiect citit din IndexedDB sau dintr-un fisier. Intoarce motivul in cuvinte, nu
 * arunca: un fisier strain se spune jucatorului, nu se inghite. Lumea insasi o valideaza `decode`.
 */
export function valideazaSalvare(x: unknown): { ok: true; value: Salvare } | { ok: false; motiv: string } {
  if (x === null || typeof x !== 'object') return { ok: false, motiv: 'Nu e o salvare Kinstead.' }
  const s = x as Record<string, unknown>
  if (s.format !== FORMAT_SALVARE) {
    return { ok: false, motiv: esteNumar(s.format) && s.format > FORMAT_SALVARE ? 'Salvarea e dintr-o versiune mai nouă a jocului.' : 'Nu e o salvare Kinstead.' }
  }
  if (typeof s.id !== 'string' || s.id === '') return { ok: false, motiv: 'Salvarea n-are identificator.' }
  if (typeof s.nume !== 'string') return { ok: false, motiv: 'Salvarea n-are nume.' }
  if (typeof s.salvatLa !== 'string') return { ok: false, motiv: 'Salvarea n-are data.' }
  if (!esteNumar(s.tick) || !esteNumar(s.seed) || !esteNumar(s.oameni)) return { ok: false, motiv: 'Salvarea are câmpuri numerice stricate.' }
  const m = s.meta as Record<string, unknown> | undefined
  if (!m || typeof m !== 'object') return { ok: false, motiv: 'Salvarea n-are poziția camerei.' }
  const cam = m.camera as Record<string, unknown> | undefined
  if (!cam || !esteTriplet(cam.pos) || !esteTriplet(cam.tinta)) return { ok: false, motiv: 'Poziția camerei e stricată.' }
  if (!(m.slice === null || esteNumar(m.slice))) return { ok: false, motiv: 'Nivelul salvat e stricat.' }
  if (!esteNumar(m.viteza)) return { ok: false, motiv: 'Viteza salvată e stricată.' }
  if (!Array.isArray(m.primiPasi) || !m.primiPasi.every((b) => typeof b === 'boolean')) return { ok: false, motiv: 'Bifele salvate sunt stricate.' }
  if (typeof s.lume !== 'string' || s.lume.length === 0) return { ok: false, motiv: 'Salvarea n-are lumea.' }
  return { ok: true, value: s as unknown as Salvare }
}

/** `kinstead-<seed>-<h>h<mm>.json`: se sorteaza pe seed, iar timpul de joc spune care e mai noua. */
export function numeFisier(s: Pick<Salvare, 'seed' | 'tick'>, ticksPerSecond: number): string {
  const min = Math.floor(s.tick / ticksPerSecond / 60)
  return `kinstead-${s.seed}-${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}.json`
}

/** Intervalul salvarii automate, in minute de JOC. Creste la 10 cand encode-ul a costat peste 50 ms. */
export const SALVARE_AUTOMATA_MIN = 5
export const SALVARE_AUTOMATA_LENT_MIN = 10
export const ENCODE_LENT_MS = 50
/** Cat asteapta un moment linistit (pauza, meniul) dupa ce intervalul a trecut, in secunde de joc. */
export const SALVARE_AUTOMATA_ASTEAPTA_S = 60

export interface MomentSalvare {
  readonly tick: number
  readonly tickUltima: number
  readonly ticksPerSecond: number
  /** Ultimul encode, ms (0 = necunoscut). */
  readonly encodeMs: number
  /** Jucatorul a pus pauza sau a deschis meniul acum: costul nu se vede. */
  readonly linistit: boolean
  /** Se trage un dreptunghi: nu acum. */
  readonly tragere: boolean
  /** Asezarea s-a golit: o salvare automata ar pastra lumea goala (panoul, JN-2). */
  readonly golita: boolean
}

/** E momentul unei salvari automate? Pe TICKURI: pauza nu inainteaza nimic. */
export function eTimpulSalvariiAutomate(m: MomentSalvare): boolean {
  if (m.golita || m.tragere) return false
  const interval = (m.encodeMs > ENCODE_LENT_MS ? SALVARE_AUTOMATA_LENT_MIN : SALVARE_AUTOMATA_MIN) * 60 * m.ticksPerSecond
  const trecut = m.tick - m.tickUltima
  if (trecut < interval) return false
  return m.linistit || trecut >= interval + SALVARE_AUTOMATA_ASTEAPTA_S * m.ticksPerSecond
}
