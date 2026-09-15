/**
 * Contractul de refuz.
 *
 * Regula, luata din research si valabila in TOT `sim/`: nicio verificare nu
 * returneaza `boolean`. Orice „nu" poarta cu el motivul si parametrii lui.
 *
 * Motivul e concret, nu estetic. In colony sim-uri intrebarea numarul unu a
 * jucatorului e „de ce nu se intampla nimic?", iar comunitatea lui Going Medieval
 * a fost nevoita sa scrie o pagina de wiki numita „Why Can't — Checklist" tocmai
 * fiindca jocul nu se explica singur. Din contractul asta ies gratuit: tooltipul
 * care spune ce lipseste, tabul „Ratiune" din panoul pionului, si logurile.
 *
 * Retrofitarea lui inseamna rescrierea fiecarei verificari din joc. Deci e aici
 * de la primul fisier.
 */

/** Cauzele. Se extind, dar niciodata nu se transforma in siruri libere. */
export const Reason = {
  LIPSA_MATERIAL: 'LIPSA_MATERIAL',
  INACCESIBIL: 'INACCESIBIL',
  FARA_MUNCITOR: 'FARA_MUNCITOR',
  PRIORITATE_JOASA: 'PRIORITATE_JOASA',
  REZERVAT: 'REZERVAT',
  OCUPAT_DE_OSTIL: 'OCUPAT_DE_OSTIL',
  IN_AFARA_LUMII: 'IN_AFARA_LUMII',
  ENTITATE_INEXISTENTA: 'ENTITATE_INEXISTENTA',
  COMANDA_NECUNOSCUTA: 'COMANDA_NECUNOSCUTA',
  /** Cautarea a atins plafonul de noduri. NU inseamna imposibil — inseamna prea scump ACUM. */
  BUGET_DEPASIT: 'BUGET_DEPASIT',
  CAPACITATE_DEPASITA: 'CAPACITATE_DEPASITA',
  /** Nu se poate sta acolo: e piatra, e apa, sau nu e podea dedesubt. */
  LOC_NECALCABIL: 'LOC_NECALCABIL',
  /** Cineva sta acolo. Nu se zideste peste un om. */
  CELULA_OCUPATA: 'CELULA_OCUPATA',
  /** Un camp a venit cu o valoare pe care sistemul n-o poate interpreta — nu „lipseste", ci „nu e buna". */
  VALOARE_INVALIDA: 'VALOARE_INVALIDA',
} as const

export type ReasonCode = (typeof Reason)[keyof typeof Reason]

export interface Refusal {
  readonly ok: false
  readonly reason: ReasonCode
  /** Valorile concrete care se afiseaza in UI: „Lipsesc 20 lemn (ai 4)". */
  readonly params: Readonly<Record<string, number | string>>
}

export interface Accepted<T = void> {
  readonly ok: true
  readonly value: T
}

export type Outcome<T = void> = Accepted<T> | Refusal

export function refuse(reason: ReasonCode, params: Record<string, number | string> = {}): Refusal {
  return { ok: false, reason, params }
}

export function accept(): Accepted<void>
export function accept<T>(value: T): Accepted<T>
export function accept<T>(value?: T): Accepted<T | undefined> {
  return { ok: true, value }
}

/** Pentru teste si loguri. NU pentru UI — UI-ul traduce codul, nu afiseaza sirul asta. */
export function describe(r: Outcome<unknown>): string {
  if (r.ok) return 'ok'
  // determinism-ok: produce un sir pentru loguri si teste, nu stare de simulare.
  // Nimic din ce iese de aici nu intra in hash.
  const params = Object.entries(r.params)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' ')
  return params ? `${r.reason} (${params})` : r.reason
}
