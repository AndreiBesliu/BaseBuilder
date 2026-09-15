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
  /** Tinta e dincolo de raza in care un pion cauta de lucru. Nu „imposibil" — „nu de aici". */
  PREA_DEPARTE: 'PREA_DEPARTE',
  /** Celula are deja o desemnare. Refuzul poarta id-ul ei. */
  DEJA_DESEMNATA: 'DEJA_DESEMNATA',
  /** O verificare de integritate a picat. Nu e un refuz de joc, e un defect gasit la timp. */
  INVARIANT_INCALCAT: 'INVARIANT_INCALCAT',
  /** N-are unde sa fie dus: nicio zona pictata care sa primeasca felul asta, sau toate pline. Actionabil: picteaza / mareste. */
  FARA_DEPOZIT: 'FARA_DEPOZIT',
} as const

export type ReasonCode = (typeof Reason)[keyof typeof Reason]

/**
 * Cauzele, ca lista ORDONATA — ca sa poata fi stocate ca un octet in SoA
 * (`ultimulMotiv` pe o desemnare, `motivFinal` pe un pion). Ordinea e fixa si
 * se extinde doar la coada; codul 0 inseamna „niciun motiv".
 *
 * NU se salveaza si NU intra in hash: e reprezentarea unui camp TRANSIENT, deci
 * renumerotarea n-ar strica niciun save.
 */
export const MOTIVE: readonly ReasonCode[] = [
  Reason.LIPSA_MATERIAL,
  Reason.INACCESIBIL,
  Reason.FARA_MUNCITOR,
  Reason.PRIORITATE_JOASA,
  Reason.REZERVAT,
  Reason.OCUPAT_DE_OSTIL,
  Reason.IN_AFARA_LUMII,
  Reason.ENTITATE_INEXISTENTA,
  Reason.COMANDA_NECUNOSCUTA,
  Reason.BUGET_DEPASIT,
  Reason.CAPACITATE_DEPASITA,
  Reason.LOC_NECALCABIL,
  Reason.CELULA_OCUPATA,
  Reason.VALOARE_INVALIDA,
  Reason.PREA_DEPARTE,
  Reason.DEJA_DESEMNATA,
  Reason.INVARIANT_INCALCAT,
  Reason.FARA_DEPOZIT,
]

/** Codul (1-based) al unei cauze. 0 = niciuna. */
export function codMotiv(r: ReasonCode): number {
  return MOTIVE.indexOf(r) + 1
}

/** Cauza unui cod, sau `null` pentru 0. */
export function motivDinCod(cod: number): ReasonCode | null {
  return cod >= 1 && cod <= MOTIVE.length ? MOTIVE[cod - 1]! : null
}

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
