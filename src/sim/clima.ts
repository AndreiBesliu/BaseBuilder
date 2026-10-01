/**
 * Clima: temperatura aerului de afara si a solului — functii PURE de (seed, tick, reguli).
 *
 * In t.2a nimic din simulare nu le citeste (hash-urile raman); le citesc bara de sus si, din valul 2,
 * regimul permanent al incaperilor. Design temperatura v2, §2–§3.
 *
 * ## Aritmetica
 *
 * Temperaturile sunt in Q16 °C (65536 = 1 °C), fazele in Q16 de tura (`calendar.ts`), cosinusul in
 * Q14. Nicio functie transcendenta: `Math.cos`/`Math.exp` sunt aproximate de motor (ECMA-262 nu le
 * cere bit-identice), deci aceeasi lume ar avea alta clima pe alta masina. Scanerul de disciplina le
 * interzice dur in `src/sim`. Tabelele se construiesc din inmultiri si impartiri INTREGI (BigInt),
 * o data: cosinusul la incarcarea modulului, tabelele solului in `parseRules`.
 *
 * Produsele raman exacte in Number: amplitudine Q16 (≤ 2^22) × e^ Q16 (≤ 2^16) × cos Q14 (≤ 2^14)
 * < 2^52; impartirile la puteri ale lui 2 sunt exacte, iar `Math.round` e specificat exact.
 * Rezultatele trec prin `+ 0` / `0 − x`: `Math.round(−0,3)` si `−a · 0` dau −0, care in JSON e „0",
 * dar pentru `Object.is` si `deepStrictEqual` e alt numar.
 */

import type { Rules, TabeleClima } from './content.ts'
import { Anotimp, momentul, tickuriPeAn, tickuriPeOra, TURA_Q16 } from './calendar.ts'
import type { Moment } from './calendar.ts'
import { hash2 } from './terrain/noise.ts'

/** 1 °C in unitatea temperaturilor. */
export const GRAD_Q16 = 65536
/** 1,0 in unitatea cosinusului. */
export const UNU_Q14 = 16384
/** Adancimea maxima a tabelelor solului, in celule (metri). `tSol` clampeaza la [0, ADANCIME_MAX]. */
export const ADANCIME_MAX = 64

/**
 * Sarea valului de frig in `hash2(an, SARE_VAL, seed)` ('valf'). Nu e un numar de gameplay: separa
 * doar fluxul de hash al valului de alte folosiri ale lui `hash2` cu aceleasi coordonate.
 */
export const SARE_VAL = 0x76616c66

// ---------------------------------------------------------------------------------------------
// Virgula fixa, pe BigInt (doar la constructia tabelelor)
// ---------------------------------------------------------------------------------------------

/** π · 2^64, trunchiat (hex: 3,243F6A8885A308D3…). */
const PI_Q64 = 0x3243f6a8885a308d3n
const UNU_Q64 = 1n << 64n
const UNU_Q60 = 1n << 60n

/** cos(x) in Q64, pentru x in Q64 cu 0 ≤ x ≤ π/2: seria Taylor, pana cand termenul devine 0. */
function cosQ64(x: bigint): bigint {
  const x2 = (x * x) >> 64n
  let termen = UNU_Q64
  let suma = UNU_Q64
  for (let n = 1n; termen !== 0n; n++) {
    termen = -((termen * x2) >> 64n) / ((2n * n - 1n) * (2n * n))
    suma += termen
  }
  return suma
}

/**
 * Sfertul de unda al cosinusului: 257 de valori Q14, cos(k · (π/2) / 256) pentru k = 0..256.
 * Eroarea pe valoare ≤ 0,5 / 16384 = 0,00003; cu interpolarea liniara (pasul π/512, eroare
 * ≤ pas²/8 = 0,000005), sub 0,0001 pe toata unda — testat contra `Math.cos` in tests/clima.test.ts.
 * NU Bhaskara (0,00163, la limita; panoul, §2).
 */
const COS_SFERT: readonly number[] = (() => {
  const out: number[] = []
  for (let k = 0n; k <= 256n; k++) {
    const x = (PI_Q64 * k) / 512n
    // Q64 → Q14, rotunjit: + 2^49, apoi >> 50.
    out.push(Number((cosQ64(x) + (1n << 49n)) >> 50n))
  }
  return out
})()

/** Cosinusul pe sfertul [0, π/2], cu `r` in [0, 16384] (Q16 de tura): tabel + interpolare. */
function sfert(r: number): number {
  const i = r >> 6
  const f = r & 63
  const a = COS_SFERT[i]!
  if (f === 0) return a
  return a + (((COS_SFERT[i + 1]! - a) * f + 32) >> 6)
}

/**
 * cos(2π · faza / 65536) in Q14, pentru orice faza intreaga (se ia modulo o tura; si negativa).
 * Eroarea fata de cosinusul real: ≤ 0,0001 (masurat in teste: vezi `COS_SFERT`).
 */
export function cosQ14(fazaQ16: number): number {
  const p = fazaQ16 & 0xffff
  const r = p & 0x3fff
  switch (p >> 14) {
    case 0: return sfert(r)
    case 1: return 0 - sfert(UNU_Q14 - r)
    case 2: return 0 - sfert(r)
    default: return sfert(UNU_Q14 - r)
  }
}

/** e^(num/den) in Q60, seria pozitiva (toti termenii > 0, deci fara anulari). 0 < num/den ≤ 10. */
function expQ60(num: bigint, den: bigint): bigint {
  let termen = UNU_Q60
  let suma = UNU_Q60
  for (let n = 1n; termen !== 0n; n++) {
    termen = (termen * num) / (den * n)
    suma += termen
  }
  return suma
}

/** e^(−num/den) in Q60, rotunjit. */
function expMinusQ60(num: bigint, den: bigint): bigint {
  const e = expQ60(num, den)
  return (UNU_Q60 * UNU_Q60 + e / 2n) / e
}

/** Q60 → Q16, rotunjit. */
function q60laQ16(v: bigint): number {
  return Number((v + (1n << 43n)) >> 44n)
}

/**
 * Tabelele solului pe adancime, d = 0..64, calculate din continut (in `parseRules`):
 *
 * - `expAdancQ16[d]` = e^(−(d + ½)/D_a), `expSezonQ16[d]` = e^(−(d + ½)/D_s), in Q16;
 * - `lagQ16[d]` = (d + ½) / (2π · D_s), intarzierea undei anului, in Q16 de TURA (panoul, L1-07:
 *   scazuta direct din faza, fara conversie din radiani).
 *
 * **d + ½, nu d**: `d` numara celulele intregi de sol natural de deasupra celulei (0 = celula de
 * suprafata), iar temperatura e a CENTRULUI ei, la d + 0,5 m. Fata spre sol are R(s)/2 — tot pana
 * la centrul celulei (design §4.2) —, iar panoul a masurat calibrarea pivnitei cu aceeasi conventie
 * (`gv − z + 0,5`, panou/JOC/retea.ts). Asa, d = 0 e T_sol la 0,5 m (7,41 °C in medie) si d = 1 la
 * 1,5 m (4,65 °C) — cifrele designului.
 *
 * Puterile se fac prin inmultiri succesive in Q60 (eroare 2^−60 pe pas), rotunjite o singura data
 * la Q16: eroarea pe tabel ≤ 0,5 / 65536, adica ≤ 0,0002 °C pe amplitudinea de 11,2 °C (designul
 * cerea ≤ 0,008 °C).
 */
export function tabeleClima(dAdancMm: number, dSezonMm: number): TabeleClima {
  const expAdancQ16: number[] = []
  const expSezonQ16: number[] = []
  const lagQ16: number[] = []
  const tabel = (dMm: number, out: number[]): void => {
    const D = BigInt(dMm)
    const pas = expMinusQ60(1000n, D) // e^(−1 m / D)
    let v = expMinusQ60(500n, D) // e^(−0,5 m / D)
    for (let d = 0; d <= ADANCIME_MAX; d++) {
      out.push(q60laQ16(v))
      v = (v * pas + (1n << 59n)) >> 60n
    }
  }
  tabel(dAdancMm, expAdancQ16)
  tabel(dSezonMm, expSezonQ16)
  // LAG[d] = (d + ½) · 1000 · 65536 / (2π · D_s[mm]) = (2d + 1) · 1000 · 65536 · 2^64 / (4 · π·2^64 · D_s).
  const numitor = 4n * PI_Q64 * BigInt(dSezonMm)
  for (let d = 0; d <= ADANCIME_MAX; d++) {
    const numarator = BigInt(2 * d + 1) * 1000n * BigInt(TURA_Q16) * UNU_Q64
    lagQ16.push(Number((numarator + numitor / 2n) / numitor))
  }
  return { expAdancQ16, expSezonQ16, lagQ16 }
}

// ---------------------------------------------------------------------------------------------
// Temperaturile
// ---------------------------------------------------------------------------------------------

/** m°C (miimi de grad, unitatea din continut) → Q16 °C, rotunjit. */
export function mcLaQ16(mc: number): number {
  return Math.round((mc * GRAD_Q16) / 1000) + 0
}

/** Faza (Q16 de tura) a momentului cel mai rece al anului: inceputul zilei `ziCeaMaiRece`. */
export function fazaCeaMaiRece(rules: Rules): number {
  return Math.floor((rules.clima.ziCeaMaiRece * rules.calendar.ziTicks * TURA_Q16) / tickuriPeAn(rules))
}

/** Faza (Q16 de tura) a orei celei mai calde din zi. */
export function fazaCeaMaiCalda(rules: Rules): number {
  return Math.floor((rules.clima.oraCeaMaiCalda * TURA_Q16) / 24)
}

/**
 * Ziua din iarna (de la 1, ca `Moment.zi`) in care vine valul de frig al anului `an`:
 * `ziMin + hash2(an, SARE_VAL, seed) mod (ziMax − ziMin + 1)`. Functie pura de seed si an — fara
 * stare noua si fara fluxul `evenimente`, pe care il va consuma directorul de presiune (panoul,
 * verificarea L3-2: tragerea din flux ar fi cerut un camp PERSISTED, schema si migrare).
 */
export function ziuaValului(seed: number, an: number, rules: Rules): number {
  const v = rules.clima.valFrig
  return v.ziMin + (hash2(an, SARE_VAL, seed) % (v.ziMax - v.ziMin + 1))
}

/**
 * Valul de frig la momentul `m`, in Q16 °C (≤ 0). Trapez pe intregi, in ziua valului, de la 00:00:
 * rampa de `rampaOre`, platoul de `platouOre`, rampa inapoi. Cu implicitele (3 + 18 + 3 = 24 h),
 * platoul incepe la 03:00, exact ora cea mai rece a zilei.
 */
export function valDeFrig(seed: number, m: Moment, rules: Rules): number {
  const v = rules.clima.valFrig
  if (v.amplitudineMc === 0 || m.anotimp !== Anotimp.IARNA || m.zi !== ziuaValului(seed, m.an, rules)) return 0
  const ora = tickuriPeOra(rules)
  const rampa = v.rampaOre * ora
  const platou = v.platouOre * ora
  const sfarsit = 2 * rampa + platou
  const t = m.tickInZi
  const amp = mcLaQ16(v.amplitudineMc)
  if (t < rampa) return Math.trunc((amp * t) / rampa) + 0
  if (t < rampa + platou) return amp
  if (t < sfarsit) return Math.trunc((amp * (sfarsit - t)) / rampa) + 0
  return 0
}

/**
 * Temperatura aerului de afara, in Q16 °C. Uniforma pe lume (`World` nu stie „situl jucat").
 *
 * T = T_medie − A_an · cos(2π(fazaAn − φ_rece)) + A_zi · cos(2π(fazaZi − φ_cald)) + V(seed, t) + P(t)
 *
 * P(t), termenul directorului de presiune (DESIGN §5.5), e 0 in t.2 si intra aici cand exista.
 * Fara val, nimic nu coboara sub T_medie − A_an − A_zi (−6,8 °C cu implicitele).
 */
export function tAfara(seed: number, tick: number, rules: Rules): number {
  const c = rules.clima
  const m = momentul(tick, rules)
  const an = mcLaQ16(c.amplitudineAnMc) * cosQ14(m.fazaAn - fazaCeaMaiRece(rules))
  const zi = mcLaQ16(c.amplitudineZiMc) * cosQ14(m.fazaZi - fazaCeaMaiCalda(rules))
  return mcLaQ16(c.tMedieMc) + Math.round((zi - an) / UNU_Q14) + valDeFrig(seed, m, rules) + 0
}

/** Adancimea clampata la tabel: sub sol (d < 0, un turn, o placa zidita) e T_sol(0); peste 64, T_sol(64). */
function clampAdancime(d: number): number {
  return d <= 0 ? 0 : d >= ADANCIME_MAX ? ADANCIME_MAX : d | 0
}

/**
 * Media anuala a solului la adancimea `d`, in Q16 °C: T_medie + ΔT_adanc · (1 − e^(−(d+½)/D_a)).
 * Fara unda anului — „~4 °C" din descrierea unei fete spre sol.
 */
export function tSolMediu(d: number, rules: Rules): number {
  const c = rules.clima
  const k = clampAdancime(d)
  return mcLaQ16(c.tMedieMc) + Math.round((mcLaQ16(c.deltaAdancMc) * (GRAD_Q16 - c.tabele.expAdancQ16[k]!)) / GRAD_Q16) + 0
}

/**
 * Temperatura solului natural la `d` celule sub suprafata lui, in Q16 °C (design §3):
 *
 * T_sol(d, t) = T_medie + ΔT_adanc · (1 − e^(−(d+½)/D_a)) − A_an · e^(−(d+½)/D_s) · cos(2π(fazaAn − φ_rece) − LAG[d])
 *
 * `d` se CLAMPEAZA aici, la [0, 64] — singurul loc. Pe M10 sunt 123 de fete cu d = −8..−1, iar
 * donjonul cu 11 m plini are d = −11: fara clamp, amplitudinea iesea 10^7 °C, iar tabelul citit la
 * indice negativ dadea NaN (panoul, L3-1). Sub pamant e frig — regula de JOC (fizic ar fi ~10 °C).
 */
export function tSol(d: number, tick: number, rules: Rules): number {
  const c = rules.clima
  const k = clampAdancime(d)
  const m = momentul(tick, rules)
  const unda = mcLaQ16(c.amplitudineAnMc) * c.tabele.expSezonQ16[k]! * cosQ14(m.fazaAn - fazaCeaMaiRece(rules) - c.tabele.lagQ16[k]!)
  return tSolMediu(k, rules) - Math.round(unda / (GRAD_Q16 * UNU_Q14)) + 0
}
