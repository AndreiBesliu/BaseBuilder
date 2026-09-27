/**
 * Alertele — PUR: reguli ca TABEL si o masina de stare pe TICKURI de simulare.
 *
 * DESIGN §9 regula 3: „alertele au prag, debounce si cooldown, definite in date". Research
 * (Against the Storm 1.8.7): alerta apare abia dupa ce conditia TINE o vreme; una instantanee e
 * exact spamul de care se plang jucatorii. Timpul e `w.tick`, nu ceasul masinii: pauza opreste
 * alertele odata cu lumea, 3× le grabeste odata cu ea, iar testul nu are nevoie de ceas.
 *
 * Starea e un OBIECT (`creeazaAlerte`), nu un singleton de modul: testele trec si rulate singure.
 * Pragurile de CANTITATE (cati flamanzi, ce e „blocat") sunt in `semnaleAlerte` din model.ts.
 */

export const Severitate = {
  EVENIMENT: 0,
  ATENTIE: 1,
  CRITIC: 2,
} as const
export type SeveritateId = (typeof Severitate)[keyof typeof Severitate]

export interface RegulaAlerta {
  readonly id: string
  readonly severitate: SeveritateId
  /** Cat trebuie sa TINA conditia, neintrerupt, pana apare alerta — secunde de JOC. */
  readonly intarziereS: number
  /** Dupa ce dispare, cat nu mai are voie sa reapara (chiar daca revine conditia) — secunde de joc. */
  readonly racireS: number
}

/** Unde duce click-ul pe alerta: o celula, sau un pion (slot). */
export type Tinta =
  | { readonly fel: 'celula'; readonly wx: number; readonly wy: number; readonly z: number }
  | { readonly fel: 'pion'; readonly slot: number }

/** Ce spune lumea ACUM despre o regula. */
export interface Semnal {
  readonly activ: boolean
  readonly text: string
  readonly tinta: Tinta | null
}

export interface StareAlerta {
  readonly id: string
  readonly severitate: SeveritateId
  /** Tickul de la care conditia tine neintrerupt; -1 = nu tine. */
  adevaratDeLa: number
  afisata: boolean
  /** Tickul pana la care nu are voie sa reapara. */
  racitaPanaLa: number
  semnal: Semnal
}

export interface IntrareJurnal {
  readonly tick: number
  readonly id: string
  readonly severitate: SeveritateId
  readonly text: string
  readonly tip: 'apare' | 'dispare' | 'eveniment'
}

export const JURNAL_MAX = 50

export interface Alerte {
  readonly stari: Map<string, StareAlerta>
  readonly jurnal: IntrareJurnal[]
  /** Pana la tickul asta nu se evalueaza nimic: dupa o incarcare, memoriile TRANSIENT pornesc goale. */
  armataLa: number
}

export function creeazaAlerte(armataLa = 0): Alerte {
  return { stari: new Map(), jurnal: [], armataLa }
}

function scrie(a: Alerte, x: IntrareJurnal): void {
  a.jurnal.push(x)
  if (a.jurnal.length > JURNAL_MAX) a.jurnal.splice(0, a.jurnal.length - JURNAL_MAX)
}

/**
 * Un pas: pentru fiecare regula, semnalul de acum → starea alertei. Regulile fara semnal se trateaza
 * ca inactive. Intoarce alertele AFISATE, cele critice primele (la egalitate, ordinea tabelului).
 */
export function actualizeaza(a: Alerte, reguli: readonly RegulaAlerta[], semnale: ReadonlyMap<string, Semnal>, tick: number, ticksPerSecond: number): StareAlerta[] {
  if (tick < a.armataLa) return []
  for (const r of reguli) {
    const s = semnale.get(r.id) ?? { activ: false, text: '', tinta: null }
    let st = a.stari.get(r.id)
    if (!st) { st = { id: r.id, severitate: r.severitate, adevaratDeLa: -1, afisata: false, racitaPanaLa: -1, semnal: s }; a.stari.set(r.id, st) }
    if (s.activ) {
      if (st.adevaratDeLa < 0) st.adevaratDeLa = tick
      st.semnal = s
      if (!st.afisata && tick - st.adevaratDeLa >= r.intarziereS * ticksPerSecond && tick >= st.racitaPanaLa) {
        st.afisata = true
        scrie(a, { tick, id: r.id, severitate: r.severitate, text: s.text, tip: 'apare' })
      }
    } else {
      st.adevaratDeLa = -1
      if (st.afisata) {
        st.afisata = false
        st.racitaPanaLa = tick + r.racireS * ticksPerSecond
        scrie(a, { tick, id: r.id, severitate: r.severitate, text: st.semnal.text, tip: 'dispare' })
      }
    }
  }
  const out: StareAlerta[] = []
  for (const r of reguli) { const st = a.stari.get(r.id)!; if (st.afisata) out.push(st) }
  out.sort((x, y) => y.severitate - x.severitate)
  return out
}

/** Un eveniment (ceva s-a INTAMPLAT, nu o stare): direct in jurnal. */
export function eveniment(a: Alerte, id: string, text: string, tick: number): void {
  scrie(a, { tick, id, severitate: Severitate.EVENIMENT, text, tip: 'eveniment' })
}

/**
 * Regulile. Ordinea e si ordinea de afisare la severitate egala. Timpul e in secunde de joc.
 * Intarzierile de 10–15 s sunt alese, nu masurate pe fiecare regula; `flamanzi` a fost masurat de
 * panou (JN-5): „sub prag" singur se aprindea de 20 de ori in 30 de minute, de aceea semnalul lui
 * cere ca omul sa fi CAUTAT si sa nu fi gasit.
 */
export const REGULI_ALERTE: readonly RegulaAlerta[] = [
  { id: 'fara-hrana', severitate: Severitate.CRITIC, intarziereS: 5, racireS: 30 },
  { id: 'infometati', severitate: Severitate.CRITIC, intarziereS: 5, racireS: 30 },
  { id: 'pleaca', severitate: Severitate.CRITIC, intarziereS: 5, racireS: 30 },
  { id: 'hrana-scade', severitate: Severitate.ATENTIE, intarziereS: 2, racireS: 60 },
  // 30 s > `nevoieRetryTicks` (25 s): un om care n-a prins loc la un morman ocupat (2 mancatori pe
  // morman) reincearca si mananca inainte ca alerta sa apara; unul la care mancarea nu ajunge deloc,
  // nu. Cu 10 s, 4 flamanzi la un morman aprindeau alerta desi mancarea era acolo (testul).
  { id: 'flamanzi', severitate: Severitate.ATENTIE, intarziereS: 30, racireS: 30 },
  { id: 'dorm-pe-jos', severitate: Severitate.ATENTIE, intarziereS: 10, racireS: 60 },
  { id: 'nimeni-sapa', severitate: Severitate.ATENTIE, intarziereS: 5, racireS: 20 },
  { id: 'nimeni-construieste', severitate: Severitate.ATENTIE, intarziereS: 5, racireS: 20 },
  { id: 'nimeni-cara', severitate: Severitate.ATENTIE, intarziereS: 5, racireS: 20 },
  { id: 'imposibile', severitate: Severitate.ATENTIE, intarziereS: 3, racireS: 30 },
  { id: 'blocate', severitate: Severitate.ATENTIE, intarziereS: 15, racireS: 30 },
  { id: 'fara-depozit', severitate: Severitate.ATENTIE, intarziereS: 10, racireS: 30 },
]
