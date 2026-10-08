/**
 * Temperatura ca stare — S24-27, tăietura 2b (research/temperatura-t2b.md).
 *
 * Valul 1, commit-ul 2: funcția PURĂ a provenienței (§3). Starea completă (`w.temperatura`), punctul unic de
 * sincronizare (`sincronizeazaLumea`), pasul de 1 Hz și invarianții vin în commit-ul 4; aici sunt tipul stării pe
 * slot și trecerea ei peste o `SchimbareCamere`.
 *
 * ## Starea pe slot
 *
 * Fiecare componentă a indexului are `T` (Q16 °C) și `rest` (μ·Q16), cu energia `H = C'·T + rest` exactă pe
 * întregi, `0 ≤ rest < C'` (C' în unitatea μ = c_aer / 16, din contoarele fețelor — `capacitateMu`). Tablourile
 * sunt pe SLOTUL componentei (id-ul din index), valabile până la lotul următor.
 *
 * ## Regula C3 (§3)
 *
 * - Masa de sol natural și de apă intră ȘI iese la `T_sol(d, tick)`, cu `d` al FIECĂREI fețe;
 * - orice altă masă care dispare iese la T-ul sursei ei (nu schimbă T-ul celor rămase);
 * - orice altă masă care apare (construcția nouă, aerul unei celule alipite) ia T-ul REZULTAT și nu intră în ponderi;
 * - ponderea unei surse = masa ei care PERSISTĂ (`P_{s→Y}`, din evidența maselor a sincronizării).
 *
 * Pe un lot: `Ĥ_s = H_s·(P_s + S_s)/C'_s − Σ_{sol care iese} m·T_sol(d)` (S_s = solul care iese; ce rămâne din
 * C'_s iese la T_s) rămâne pe masa persistentă `P_s`; `H_Y^cunoscut = Σ_s Ĥ_s·P_{s→Y}/P_s + Σ_{sol care intră}
 * m·T_sol(d)` pe `W_Y = Σ_s P_{s→Y} + Σ m_sol`, iar masa apărută ia `T_Y = H_Y^cunoscut / W_Y`: `H_Y =
 * H_Y^cunoscut·C'_Y/W_Y`. Dacă `W_Y = 0` (nimic persistent, niciun sol — o casă cu podea de piatră acoperită),
 * aerul celulelor după origine: CER → `T_afara`, SOL → `T_sol(d)` (NEC e deja rezolvat de sincronizare după solul
 * natural).
 *
 * ## Aritmetica
 *
 * Exactă: H se ține cu restul (nu se aruncă la evenimente — IDX-9); împărțirile de scalare cu `rs` (la cel mai
 * apropiat, jumătatea departe de zero: simetric, fără deriva într-un sens a lui floor), descompunerea finală cu
 * floor (`T = floor(H / C')`, `rest = H − T·C'`, deci `0 ≤ rest < C'`). Numerele rămân pe Number cât fiecare produs
 * e un întreg sigur (< 2^53), altfel trec pe BigInt (`H·P` pe mină trece: C' ~2^29 μ, H ~2^50); comutatorul
 * `totulPeBigInt` le trece pe toate, pentru proba „Number == BigInt". Sursele se adună în ordinea ancorelor lor.
 *
 * ## Ordinea consumatorului (IDX-10)
 *
 * (1) toate valorile noi, din cele VECHI; (2) sloturile moarte se golesc; (3) se scriu cele noi. La recalcul un id
 * nou e adesea chiar al unei surse moarte: un consumator care scrie pe loc în timp ce citește ar da altei
 * componente T-ul deja amestecat.
 */

import type { Rules } from './content.ts'
import type { SchimbareCamere } from './camere.ts'
import type { ContoareMasa, MaseComponentaNoua, MaseComponentaVeche, MasaPeAdancime } from './fete.ts'
import { capacitateMu } from './fete.ts'
import { tAfara, tSol } from './clima.ts'

/** T și rest pe slotul componentei; `are[s] = 1` dacă slotul are o temperatură (TRANSIENT, §1). */
export interface TemperaturiSlot {
  readonly t: Float64Array
  readonly rest: Float64Array
  readonly are: Uint8Array
}

/** Stare goală, cu loc pentru `n` sloturi. */
export function temperaturiGoale(n = 0): TemperaturiSlot {
  return { t: new Float64Array(n), rest: new Float64Array(n), are: new Uint8Array(n) }
}

/** Ce a făcut proveniența pe un lot. */
export interface RezultatProvenienta {
  readonly stare: TemperaturiSlot
  /** Componente calculate pe BigInt (un produs a trecut de 2^53, sau comutatorul). */
  readonly bigInt: number
  /** Componente cu `W_Y = 0`, pe originea aerului (§3). */
  readonly rezerva: number
  /** Surse fără temperatură (slot fără T): masa lor a fost tratată ca apărută. 0 pe o stare la zi. */
  readonly surseFaraT: number
}

// ---------------------------------------------------------------------------
// întregii exacți: Number cât se poate, BigInt altfel
// ---------------------------------------------------------------------------

type Ent = number | bigint

interface Calcul {
  /** Totul pe BigInt (comutatorul de probă). */
  readonly big: boolean
  /** S-a trecut pe BigInt pe componenta curentă. */
  promovat: boolean
}

function bg(a: Ent): bigint {
  return typeof a === 'bigint' ? a : BigInt(a)
}

function inm(a: Ent, b: Ent, c: Calcul): Ent {
  if (!c.big && typeof a === 'number' && typeof b === 'number') {
    const p = a * b
    if (Number.isSafeInteger(p)) return p + 0
  }
  c.promovat = true
  return bg(a) * bg(b)
}

function adun(a: Ent, b: Ent, c: Calcul): Ent {
  if (!c.big && typeof a === 'number' && typeof b === 'number') {
    const s = a + b
    if (Number.isSafeInteger(s)) return s + 0
  }
  c.promovat = true
  return bg(a) + bg(b)
}

/** rs(n / d), d > 0: la cel mai apropiat întreg, jumătatea departe de zero. */
function rs(n: Ent, d: Ent, c: Calcul): Ent {
  if (typeof n === 'number' && typeof d === 'number') {
    const a = n < 0 ? -n : n
    let q = Math.floor(a / d)
    let r = a - q * d
    // Împărțirea pe double e rotunjită: câtul poate ieși cu 1 peste sau sub cel întreg.
    if (r < 0) {
      q--
      r += d
    } else if (r >= d) {
      q++
      r -= d
    }
    if (2 * r >= d) q++
    return (n < 0 ? -q : q) + 0
  }
  c.promovat = true
  const nb = bg(n)
  const db = bg(d)
  const neg = nb < 0n
  const a = neg ? -nb : nb
  let q = a / db
  if (2n * (a - q * db) >= db) q++
  return neg ? -q : q
}

/** floor(n / d) și restul, d > 0; amândouă întregi siguri (T pe Q16, 0 ≤ rest < d). */
function descompune(h: Ent, d: number): { t: number; rest: number } {
  if (typeof h === 'number') {
    let q = Math.floor(h / d)
    let r = h - q * d
    if (r < 0) {
      q--
      r += d
    } else if (r >= d) {
      q++
      r -= d
    }
    return { t: q + 0, rest: r + 0 }
  }
  const db = BigInt(d)
  let q = h / db
  let r = h - q * db
  if (r < 0n) {
    q -= 1n
    r += db
  }
  return { t: Number(q), rest: Number(r) }
}

// ---------------------------------------------------------------------------
// proveniența
// ---------------------------------------------------------------------------

/** Energia masei de sol care intră sau iese, Σ m·T_sol(d) (μ·Q16). */
function energiaSolului(xs: readonly MasaPeAdancime[], tick: number, rules: Rules, c: Calcul): Ent {
  let e: Ent = 0
  for (const x of xs) e = adun(e, inm(capacitateMu(x.masa, rules.termic.mase), tSol(x.d, tick, rules), c), c)
  return e
}

function masaSolului(xs: readonly MasaPeAdancime[], rules: Rules): number {
  let m = 0
  for (const x of xs) m += capacitateMu(x.masa, rules.termic.mase)
  return m
}

/** Ĥ_s: energia rămasă pe masa persistentă a sursei, după ce solul a ieșit la T_sol și restul la T_s. */
function energiaRamasa(s: MaseComponentaVeche, t: number, rest: number, tick: number, rules: Rules, c: Calcul): Ent {
  const C = capacitateMu(s.capacitate, rules.termic.mase)
  const ramas = capacitateMu(s.persista, rules.termic.mase) + masaSolului(s.solIese, rules)
  const h = adun(inm(C, t, c), rest, c)
  // (P_s + S_s) = C'_s pe un lot obișnuit fără altă masă ieșită: Ĥ_s = H_s exact, fără nicio împărțire.
  const peRamas = ramas === C ? h : rs(inm(h, ramas, c), C, c)
  return adun(peRamas, neg(energiaSolului(s.solIese, tick, rules, c)), c)
}

function neg(a: Ent): Ent {
  return typeof a === 'bigint' ? -a : -a + 0
}

/**
 * (T, rest) ale componentei noi `y`, din sursele ei (Ĥ pe sursă, memorat) — sau după originea aerului, dacă nimic
 * nu persistă și niciun sol nu intră.
 */
function valoareNoua(y: MaseComponentaNoua, stare: TemperaturiSlot, vechi: ReadonlyMap<number, MaseComponentaVeche>, ramase: Map<number, Ent>, tick: number, seed: number, rules: Rules, c: Calcul, st: { rezerva: number; surseFaraT: number }): { t: number; rest: number } {
  const mase = rules.termic.mase
  const Cy = capacitateMu(y.capacitate, mase)
  let h: Ent = 0
  let W = 0
  for (const s of y.surse) {
    const v = vechi.get(s.id)
    if (v === undefined || s.id >= stare.are.length || stare.are[s.id] !== 1) {
      st.surseFaraT++
      continue
    }
    let hs = ramase.get(s.id)
    if (hs === undefined) {
      hs = energiaRamasa(v, stare.t[s.id]!, stare.rest[s.id]!, tick, rules, c)
      ramase.set(s.id, hs)
    }
    const P = capacitateMu(s.masa, mase)
    const Ps = capacitateMu(v.persista, mase)
    h = adun(h, P === Ps ? hs : rs(inm(hs, P, c), Ps, c), c)
    W += P
  }
  h = adun(h, energiaSolului(y.solIntra, tick, rules, c), c)
  W += masaSolului(y.solIntra, rules)
  if (W > 0) return descompune(W === Cy ? h : rs(inm(h, Cy, c), W, c), Cy)
  // W_Y = 0: aerul celulelor după origine (§3).
  st.rezerva++
  let n = y.origine.cer
  let e = inm(y.origine.cer, tAfara(seed, tick, rules), c)
  for (const o of y.origine.sol) {
    n += o.celule
    e = adun(e, inm(o.celule, tSol(o.d, tick, rules), c), c)
  }
  if (n === 0) return { t: 0, rest: 0 }
  return descompune(rs(inm(e, Cy, c), n, c), Cy)
}

/**
 * Proveniența temperaturii peste un lot (§3): din (T, rest) VECHI pe slot, `SchimbareCamere` (evidența maselor),
 * tick și reguli → (T, rest) NOI pe slot. Funcție pură: starea dată nu se atinge, se întoarce una nouă. Componentele
 * neatinse își păstrează (T, rest) exact.
 */
export function provenientaTemperaturii(vechiSt: TemperaturiSlot, sch: SchimbareCamere, tick: number, seed: number, rules: Rules, totulPeBigInt = false): RezultatProvenienta {
  let n = vechiSt.t.length
  for (const y of sch.mase.noi) if (y.id + 1 > n) n = y.id + 1
  const stare: TemperaturiSlot = { t: new Float64Array(n), rest: new Float64Array(n), are: new Uint8Array(n) }
  stare.t.set(vechiSt.t)
  stare.rest.set(vechiSt.rest)
  stare.are.set(vechiSt.are)
  const vechi = new Map<number, MaseComponentaVeche>()
  for (const v of sch.mase.vechi) vechi.set(v.id, v)
  const ramase = new Map<number, Ent>()
  const st = { rezerva: 0, surseFaraT: 0 }
  let bigInt = 0
  // (1) Toate valorile noi, din cele VECHI (`stare` e încă o copie a lor).
  const valori: { id: number; t: number; rest: number }[] = []
  for (const y of sch.mase.noi) {
    const c: Calcul = { big: totulPeBigInt, promovat: false }
    const v = valoareNoua(y, stare, vechi, ramase, tick, seed, rules, c, st)
    if (c.promovat) bigInt++
    valori.push({ id: y.id, t: v.t, rest: v.rest })
  }
  // (2) Sloturile moarte se golesc.
  for (const s of sch.moarte) {
    if (s >= n) continue
    stare.t[s] = 0
    stare.rest[s] = 0
    stare.are[s] = 0
  }
  // (3) Se scriu cele noi.
  for (const v of valori) {
    stare.t[v.id] = v.t
    stare.rest[v.id] = v.rest
    stare.are[v.id] = 1
  }
  return { stare, bigInt, rezerva: st.rezerva, surseFaraT: st.surseFaraT }
}

/** Energia componentei din slotul `s`, H = C'·T + rest (μ·Q16), pe BigInt (pentru oracole și invarianți). */
export function energiaSlotului(stare: TemperaturiSlot, s: number, capacitate: ContoareMasa, rules: Rules): bigint {
  return BigInt(capacitateMu(capacitate, rules.termic.mase)) * BigInt(stare.t[s]!) + BigInt(stare.rest[s]!)
}
