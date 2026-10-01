/**
 * Calendarul: anul, anotimpul, ziua, ora — DERIVED din `w.tick`, fara nicio stare.
 *
 * Formula pe tick sta DOAR aici (design temperatura v2, §1). Cand anotimpurile vor avea lungimi
 * variabile (DESIGN §5.5, directorul de presiune), ceasul va avea stare; pana atunci, oricine vrea
 * „ce ora e" intreaba functia asta, nu imparte singur tickul.
 *
 * ## Conventiile
 *
 * - Anul incepe cu PRIMAVARA, ziua 1, 00:00. Anotimpurile au cate `zilePeAnotimp` zile, in ordinea
 *   primavara, vara, toamna, iarna.
 * - Tickul 0 al jocului e momentul `anotimpStart`, ziua `ziStart`, ora `oraStart` din anul 0 (din
 *   continut: toamna, ziua 1, 08:00). Tickurile NEGATIVE sunt valide (anul −1): impartirile sunt cu
 *   `Math.floor`, nu cu trunchiere.
 * - Fazele sunt in Q16 de TURA (65536 = o tura, 2π), ca sa intre direct in cosinusul pe intregi din
 *   `clima.ts` — fara radiani, fara 1/(2π) irational (panoul, L1-07).
 *
 * Numerele implicite (design §1): ziua de 40.320 de tickuri (24 h × 1.680; o ora de joc = 84 s la
 * 1×), 4 zile pe anotimp, anul de 16 zile = 645.120 de tickuri (8 h 58 min la 1×). De la start pana
 * la prima iarna: 3 zile si 16 ore = 147.840 de tickuri (2 h 03 min la 1×, 41 min la 3×).
 */

import type { Rules } from './content.ts'

/** Anotimpurile, in ordinea anului. */
export const Anotimp = {
  PRIMAVARA: 0,
  VARA: 1,
  TOAMNA: 2,
  IARNA: 3,
} as const
export type AnotimpId = (typeof Anotimp)[keyof typeof Anotimp]

/** Cate anotimpuri are anul. */
export const ANOTIMPURI = 4

/** Numele din fisierul de reguli, in ordinea `Anotimp`. Lista ORDONATA, nu `Object.keys`. */
export const NUME_ANOTIMPURI: readonly string[] = ['PRIMAVARA', 'VARA', 'TOAMNA', 'IARNA']

/** O tura intreaga in Q16: unitatea fazelor (`fazaAn`, `fazaZi`) si a intarzierii solului. */
export const TURA_Q16 = 65536

/** Minute intr-o zi: `ziTicks` trebuie sa se imparta exact la ele (validat in `parseRules`). */
export const MINUTE_PE_ZI = 1440

/** Un moment din calendar. Totul e functie de tick; nimic nu se salveaza. */
export interface Moment {
  /** Anul, de la 0 (anul in care incepe jocul). Negativ inaintea tickului 0 al anului 0. */
  readonly an: number
  readonly anotimp: AnotimpId
  /** Ziua din anotimp, de la 1 la `zilePeAnotimp`. */
  readonly zi: number
  /** Ziua din an, de la 0 (prima zi a primaverii) la `4 · zilePeAnotimp − 1`. */
  readonly ziInAn: number
  /** 0..23 */
  readonly ora: number
  /** 0..59 */
  readonly minut: number
  /** Cat din an a trecut, in Q16 de tura: 0 = primavara, ziua 1, 00:00. */
  readonly fazaAn: number
  /** Cat din zi a trecut, in Q16 de tura: 0 = miezul noptii. */
  readonly fazaZi: number
  /** Tickuri de la inceputul anului. */
  readonly tickInAn: number
  /** Tickuri de la miezul noptii. */
  readonly tickInZi: number
}

/** Tickurile unui an: 4 anotimpuri × `zilePeAnotimp` zile × `ziTicks`. */
export function tickuriPeAn(rules: Rules): number {
  return ANOTIMPURI * rules.calendar.zilePeAnotimp * rules.calendar.ziTicks
}

/** Tickurile unei ore de joc (`ziTicks / 24`, exact: validat). */
export function tickuriPeOra(rules: Rules): number {
  return rules.calendar.ziTicks / 24
}

/** Tickurile unui anotimp. */
export function tickuriPeAnotimp(rules: Rules): number {
  return rules.calendar.zilePeAnotimp * rules.calendar.ziTicks
}

/** Unde cade tickul 0 al jocului in anul 0, in tickuri de la inceputul anului. */
export function tickDeStart(rules: Rules): number {
  const c = rules.calendar
  return (c.anotimpStart * c.zilePeAnotimp + c.ziStart - 1) * c.ziTicks + c.oraStart * tickuriPeOra(rules)
}

/** Momentul din calendar al unui tick. Pur: aceeasi intrare, acelasi rezultat, pe orice masina. */
export function momentul(tick: number, rules: Rules): Moment {
  const c = rules.calendar
  const zi = c.ziTicks
  const lungimeAn = tickuriPeAn(rules)
  const t = tick + tickDeStart(rules)
  const an = Math.floor(t / lungimeAn)
  const tickInAn = t - an * lungimeAn
  const ziInAn = Math.floor(tickInAn / zi)
  const tickInZi = tickInAn - ziInAn * zi
  const anotimp = Math.floor(ziInAn / c.zilePeAnotimp) as AnotimpId
  const minuteZi = Math.floor((tickInZi * MINUTE_PE_ZI) / zi)
  return {
    an,
    anotimp,
    zi: ziInAn - anotimp * c.zilePeAnotimp + 1,
    ziInAn,
    ora: Math.floor(minuteZi / 60),
    minut: minuteZi % 60,
    // Produsele raman sub 2^53 (tickInAn < 2,6e9 la plafoanele din RULES_SPEC, × 65536 < 1,7e14):
    // impartirea intreaga e exacta.
    fazaAn: Math.floor((tickInAn * TURA_Q16) / lungimeAn),
    fazaZi: Math.floor((tickInZi * TURA_Q16) / zi),
    tickInAn,
    tickInZi,
  }
}

/**
 * Cate tickuri mai sunt pana la URMATORUL inceput al anotimpului `a` (0 = incepe chiar acum).
 * Pentru tooltip-ul barei de sus: „Iarna in 3 zile".
 */
export function panaLaAnotimp(tick: number, a: AnotimpId, rules: Rules): number {
  const lungimeAn = tickuriPeAn(rules)
  const inceput = a * tickuriPeAnotimp(rules)
  const { tickInAn } = momentul(tick, rules)
  return (((inceput - tickInAn) % lungimeAn) + lungimeAn) % lungimeAn
}
