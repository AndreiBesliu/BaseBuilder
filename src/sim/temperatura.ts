/**
 * Temperatura ca stare — S24-27, tăietura 2b (research/temperatura-t2b.md).
 *
 * Starea `w.temperatura` (§1), punctul unic de sincronizare `sincronizeazaLumea` (§2), funcția PURĂ a provenienței
 * (§3), pasul de 1 Hz `pasTermic` în forma ψ (§5), invarianții și inițializarea „lumii fără istorie"
 * (`temperaturaLaEchilibru`, §7).
 *
 * ## Starea (§1)
 *
 * | câmp | clasă |
 * |---|---|
 * | `slot.t`, `slot.rest` (pe slotul componentei) | PERSISTED — pe disc și în hash pe ANCORĂ (save.ts, hash.ts) |
 * | `slot.are` | TRANSIENT — invariant în AMBELE direcții: sloturi cu T == `comp.size`, fiecare componentă vie are T |
 * | `stampila` (`idx`, `vazute`, `epoca`, `epocaFete`) | TRANSIENT — `idx` e OBIECTUL indexului (un index înlocuit repornește contoarele: clasa L4-1) |
 * | `reguli`, `pragBigInt`, `stat` | TRANSIENT |
 * | căldura oamenilor | DERIVED — eșantionată la pas din pozițiile pionilor, fără acumulator |
 *
 * ## Punctul unic (§2)
 *
 * `sincronizeazaLumea`: indexul (`sincronizeazaCamere`) → delta grafului (`actualizeazaGraful`, termic.ts) →
 * proveniența → ștampila. Locurile: capătul tickului (world.ts: `stepAgents → sincronizeazaLumea → pasTermic` la
 * `w.tick % tps === 0` `→ w.tick++`), comenzile `dig` / `fill` (commands.ts), `buildM10PeLume` (harnașamentul) și
 * încărcarea (`incarcaTemperaturi`, save.ts). Un test AST după NUME (tests/sincronizare-plasa.test.ts) refuză
 * aceste nume în afara modulelor permise; a doua plasă e invariantul la rulare.
 *
 * ## Invarianții (§2, §5.3)
 *
 * - **Ștampila completă** `(idx, vazute, epoca, epocaFete)` == a indexului: la intrarea în `sincronizeazaLumea`
 *   (altfel cineva a sincronizat indexul pe lângă proveniență), la pas și în `encode`. Perechea (epoca, epocaFete),
 *   nu doar `epoca`: un lot doar-fețe schimbă graful și C' cu epoca pe loc [IDX-2][SAV-1].
 * - **T în ambele direcții**: fiecare componentă vie are T, niciun slot fără componentă n-are.
 * - Un invariant încălcat dă `INVARIANT_INCALCAT`, dar NU aruncă din `tick()`: se numără în `statTermic(w).invarianti`
 *   (cu motivul în `ultimulInvariant`), graful se reface integral, temperaturile pierdute se reiau de la echilibru, și
 *   simularea continuă. `encode` aruncă (o salvare nu se scrie dintr-o stare care nu e a lumii).
 * - **Plasa de siguranță** (PROV-1 b): după proveniență și după pas, un |T| peste `T_SIGURANTA` (1000 °C) se taie la el,
 *   cu restul 0 — numărat în `taieri` și ca invariant (alerta). Regula C3 păstrată are o pompă încrucișată (zidit →
 *   săpat → scos → astupat urcă T-ul pe același tick; tests/provenienta.test.ts, „POMPA C3"): un exploit deliberat (8+
 *   pioni pe același ciclu, ore în șir) ar duce T-ul peste marginea salvabilă (2^31 Q16 = 32.768 °C), iar `encode` ar
 *   arunca la nesfârșit. Plasa ține starea salvabilă oricât ar pompa cineva.
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
 * Solul (aditiv, la T_sol) și construcția (neutră, la T-ul de atunci) NU comută: ciclurile încrucișate pe aceeași
 * geometrie — zidit → săpat → scos → astupat, sau pietre puse și scoase pe rând — POMPEAZĂ (recenzia PROV-1; vara, 8 pietre
 * într-o casă la 20 °C: +4,9 °C în 20 de cicluri pe același tick, +4,3 °C în 24 h cu o comandă la 20 de tickuri). C3 s-a
 * păstrat (decizia din 10.10: C4 comută, dar holul zidit iarna urcă cu +12,6…+27,7 °C și decizia 3 se rupe); verdictele
 * sunt în tests/provenienta.test.ts („POMPA C3"), iar plasa de siguranță ține starea salvabilă.
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
 *
 * ## Ce vede jucătorul (§8)
 *
 * Citiri PURE pentru ecran, la capătul fișierului (nu scriu nimic, nu cer graful t.2a): `temperaturaAcum` (T din stare),
 * `tragerea` (X din linia grafului simulării), `tragereCuOameni` (X_tot = X + P/ΣG), `canaleAcum` (descompunerea de
 * acum, peste `geometriaCanalelor` din termic.ts) și `oameniPeComponente` (regula oamenilor a pasului).
 */

import type { Rules } from './content.ts'
import type { Componenta, IndexCamere, SchimbareCamere } from './camere.ts'
import { componentaLa, construiesteCamere, listaComponente, sincronizeazaCamere } from './camere.ts'
import type { ContoareMasa, MaseComponentaNoua, MaseComponentaVeche, MasaPeAdancime } from './fete.ts'
import { capacitateMu, PROV_CER, PROV_NEC_CER, PROV_NEC_SOL0, PROV_SOL0 } from './fete.ts'
import { tAfara, tSol } from './clima.ts'
import type { CanaleTermice, GeometrieCanale, GrafIncremental, NodTermic } from './termic.ts'
import { actualizeazaGraful, BIN_AFARA, canaleDinGeometrie, comparaGrafulCuIntegral, grafTermic, grafulIncremental, numarRefaceriDeUrgenta, refaGrafulDeUrgenta, rezolvaRegim, temperaturiRezervoare } from './termic.ts'
import { Hasher } from './hash.ts'
import { cellOf } from './drumuri.ts'
import type { World } from './state.ts'
import type { Terrain } from './terrain/terrain.ts'
import type { Outcome, Refusal } from './result.ts'
import { accept, Reason, refuse } from './result.ts'

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

/**
 * rs(n / d), d > 0, pe Number (|n|, d întregi sub 2^53): la cel mai apropiat întreg, jumătatea DEPARTE de zero — impară,
 * rs(−x) = −rs(x), deci orientarea unei muchii nu contează (SAV-3).
 */
function rsN(n: number, d: number): number {
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

/** rs(n / d), d > 0, pe BigInt: aceeași rotunjire (impară). */
function rsB(n: bigint, d: bigint): bigint {
  const neg = n < 0n
  const a = neg ? -n : n
  let q = a / d
  if (2n * (a - q * d) >= d) q++
  return neg ? -q : q
}

/** rs(n / d), d > 0: Number cât se poate (`rsN`), BigInt altfel (`rsB`). */
function rs(n: Ent, d: Ent, c: Calcul): Ent {
  if (typeof n === 'number' && typeof d === 'number') return rsN(n, d)
  c.promovat = true
  return rsB(bg(n), bg(d))
}

/**
 * floor(n / d) și restul, d > 0; amândouă întregi siguri (T pe Q16, 0 ≤ rest < d). Pe Number se împarte |h|, ca în `rsN`:
 * pentru h < 0, `floor(h/d)·d` are modulul |h| + r, care trece de 2^53 când |h| > 2^53 − d — produsul ieșea rotunjit, iar
 * restul cu ±1 (PROV-6: 109.888 din 2.000.000 de eșantioane lângă −2^53; 0 pe |h|).
 */
function descompune(h: Ent, d: number): { t: number; rest: number } {
  if (typeof h === 'number') {
    const a = h < 0 ? -h : h
    let q = Math.floor(a / d)
    let r = a - q * d
    if (r < 0) {
      q--
      r += d
    } else if (r >= d) {
      q++
      r -= d
    }
    if (h >= 0) return { t: q + 0, rest: r + 0 }
    // floor(−a/d) = −q − 1 și restul d − r; pe un multiplu exact, −q și 0.
    return r === 0 ? { t: -q + 0, rest: 0 } : { t: -q - 1, rest: d - r }
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

// ---------------------------------------------------------------------------
// starea lumii (§1)
// ---------------------------------------------------------------------------

/** Pragul marginii Number / BigInt la pas (§5.3): 2^52. Sub el produsele și sumele unui nod sunt întregi exacți în Number. */
export const PRAG_NUMBER = 4_503_599_627_370_496

/** Plafonul trecerilor Gauss–Seidel ale echilibrului „lumii fără istorie" (§7, SAV-9): determinist, nu un număr de joc. */
export const PLAFON_ECHILIBRU = 5000

/**
 * Plasa de siguranță a temperaturii (PROV-1 b): 1000 °C în Q16. O constantă de SIGURANȚĂ, nu de joc — nicio regulă nu se
 * sprijină pe ea. T-ul jocului stă în marginea climei (±45,6 °C) plus căldura oamenilor (o nișă cu 6 pioni: 72 °C, recenzia
 * PAS); 1000 °C e de peste 13 ori peste orice T fizic al jocului și de 32 de ori sub marginea salvabilă (2^31 Q16 =
 * 32.768 °C, pe care `encode` o refuză). Un T dincolo de ea vine doar dintr-o pompă (C3, cicluri încrucișate deliberate)
 * sau dintr-un content instabil; se taie, cu restul 0, și se numără (`taieri`, plus un invariant).
 */
export const T_SIGURANTA = 65_536_000

/** Motivul invariantului plasei de siguranță (jurnalul, F3). */
export const MOTIV_TAIERE = 'T taiat la plasa de siguranta (±1000 °C)'

/** Taie T-ul slotului `id` la ±`T_SIGURANTA` (restul 0). Întoarce true dacă a tăiat. */
function taieT(sl: TemperaturiSlot, id: number): boolean {
  const t = sl.t[id]!
  if (t > T_SIGURANTA) sl.t[id] = T_SIGURANTA
  else if (t < -T_SIGURANTA) sl.t[id] = -T_SIGURANTA
  else return false
  sl.rest[id] = 0
  return true
}

/** Ștampila sincronizării: OBIECTUL indexului și contoarele lui la ultima trecere prin punctul unic. TRANSIENT. */
export interface StampilaTemperaturii {
  readonly idx: IndexCamere
  readonly vazute: number
  readonly epoca: number
  readonly epocaFete: number
}

/** Contoarele temperaturii (TRANSIENT): K05, invarianții și contoarele de viață ale porților se citesc pe ele. */
export interface StatTermic {
  /** Pași de 1 Hz făcuți (cu cel puțin o componentă). */
  pasi: number
  /** Pași cu cel puțin un nod sau o muchie pe BigInt. */
  pasiBigInt: number
  /** Noduri-pas cu rezervoarele pe BigInt. */
  noduriBigInt: number
  /** Pioni citiți la pas (`componentaLa` pe celula picioarelor). */
  oameniCautati: number
  /** Noduri-pas cu căldură umană (P > 0). */
  adunariOameni: number
  /** Citiri ale rezervoarelor (`temperaturiRezervoare`) la pas. */
  rezervoareCitite: number
  /** Invarianți încălcați (§2, §5.3): ștampila, T în ambele direcții, graful, evidența. */
  invarianti: number
  /** Motivul ultimului invariant încălcat (jurnalul; F3). */
  ultimulInvariant: string
  /** Loturi cu proveniență (componente noi, masă schimbată sau moarte). */
  loturi: number
  /** Dintre ele, loturi doar-fețe: nicio felie refăcută, masa schimbată cu epoca pe loc (C3, §3). */
  loturiDoarFete: number
  /** Componente noi cu W_Y = 0, după originea aerului. */
  rezerva: number
  /** Componente din proveniență calculate pe BigInt. */
  provenienteBigInt: number
  /** Perechi (componentă nouă, sursă) din `prov`: componente vechi, SOL(d), CER, NEC (recalculul). */
  surseVechi: number
  surseSol: number
  surseCer: number
  surseNec: number
  /** Inițializări de la echilibru: lumea fără istorie, migrarea, reluarea după un invariant. */
  echilibre: number
  /** Dintre ele, oprite la plafon: ultima iterată, nu echilibrul (pasul o relaxează). */
  echilibreNeconvergente: number
  /** Salvări la care graful incremental a diferit de cel integral (înlocuit; IDX-4) și prima linie diferită (jurnalul). */
  grafDiferitLaSalvare: number
  ultimaDiferentaGraf: string
  /** La încărcare: componente cu restul pus la 0 fiindcă amprenta C' a salvării nu e a lumii (alt content sau cod; SAV-2). */
  restNormalizat: number
  /**
   * T-uri tăiate la plasa de siguranță (±`T_SIGURANTA`, PROV-1 b), după proveniență și după pas: 0 în orice joc. Fiecare lot
   * sau pas care taie se numără și ca invariant (`MOTIV_TAIERE`).
   */
  taieri: number
}

function statGol(): StatTermic {
  return {
    pasi: 0, pasiBigInt: 0, noduriBigInt: 0, oameniCautati: 0, adunariOameni: 0, rezervoareCitite: 0, invarianti: 0, ultimulInvariant: '',
    loturi: 0, loturiDoarFete: 0, rezerva: 0, provenienteBigInt: 0, surseVechi: 0, surseSol: 0, surseCer: 0, surseNec: 0, echilibre: 0, echilibreNeconvergente: 0,
    grafDiferitLaSalvare: 0, ultimaDiferentaGraf: '', restNormalizat: 0, taieri: 0,
  }
}

/** `w.temperatura` (§1). */
export interface StareTemperatura {
  /** T și rest pe slotul componentei (PERSISTED, pe ancoră la salvare); `are` TRANSIENT. */
  slot: TemperaturiSlot
  /** TRANSIENT: indexul la ultima trecere prin punctul unic. */
  stampila: StampilaTemperaturii
  /** TRANSIENT: regulile ultimei sincronizări (salvarea le citește: masele, graful). */
  reguli: Rules
  /**
   * TRANSIENT, comutatorul de probă (§5.3, NUM-5): un nod sau o muchie trece pe BigInt când marginea ajunge la prag.
   * Implicit 2^52; la 0, TOATE nodurile, muchiile și proveniența merg pe BigInt — rezultatul trebuie să fie același.
   */
  pragBigInt: number
  readonly stat: StatTermic
}

function stampilaDe(idx: IndexCamere): StampilaTemperaturii {
  return { idx, vazute: idx.vazute, epoca: idx.epoca, epocaFete: idx.epocaFete }
}

/**
 * Starea unei lumi fără nicio componentă (`createWorld`): goală, aliniată la index. O lume cu încăperi are istorie —
 * starea ei vine din proveniență, din salvare sau din `temperaturaLaEchilibru`; de aceea un index cu componente aici e o
 * eroare de program (altfel funcția ar realinia ștampila peste proveniența pierdută).
 */
export function temperaturaGoala(idx: IndexCamere, rules: Rules): StareTemperatura {
  if (idx.comp.size !== 0) throw new Error(`temperaturaGoala: indexul are ${idx.comp.size} componente — o lume cu incaperi are istorie`)
  return { slot: temperaturiGoale(0), stampila: stampilaDe(idx), reguli: rules, pragBigInt: PRAG_NUMBER, stat: statGol() }
}

/** Contoarele temperaturii lumii (o copie). */
export function statTermic(w: World): StatTermic {
  return { ...w.temperatura.stat }
}

function invariant(st: StareTemperatura, o: Refusal): void {
  st.stat.invarianti++
  st.stat.ultimulInvariant = String(o.params.motiv ?? o.reason)
}

/**
 * Ștampila temperaturii == a indexului lumii (§2): același OBIECT index, aceleași `vazute`, `epoca`, `epocaFete`. Altfel
 * indexul s-a sincronizat pe lângă `sincronizeazaLumea` (sau a fost înlocuit), iar proveniența loturilor acelora s-a pierdut.
 */
export function verificaStampila(w: World): Outcome<void> {
  const s = w.temperatura.stampila
  const idx = w.camere
  if (s.idx !== idx) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'temperatura e a altui index (indexul lumii a fost inlocuit)' })
  if (s.vazute !== idx.vazute || s.epoca !== idx.epoca || s.epocaFete !== idx.epocaFete) {
    return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'indexul s-a sincronizat pe langa temperatura (punctul unic ocolit)', vazute: s.vazute, vazuteIndex: idx.vazute, epoca: s.epoca, epocaIndex: idx.epoca, epocaFete: s.epocaFete, epocaFeteIndex: idx.epocaFete })
  }
  return accept()
}

/** T în AMBELE direcții (§1, IDX-6): fiecare slot cu T e al unei componente vii, iar numărul lor == `comp.size`. */
export function verificaTemperaturi(w: World): Outcome<void> {
  const sl = w.temperatura.slot
  const idx = w.camere
  let cuT = 0
  for (let s = 0; s < sl.are.length; s++) {
    if (sl.are[s] !== 1) continue
    cuT++
    if (!idx.comp.has(s)) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'slot cu T fara componenta', slot: s })
  }
  if (cuT !== idx.comp.size) {
    // determinism-ok: se întoarce prima componentă fără T; ordinea inserării e deterministă, iar refuzul e oricum unul.
    for (const c of idx.comp.values()) if (c.id >= sl.are.length || sl.are[c.id] !== 1) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'componenta fara T', comp: c.id, ancora: c.ancora })
  }
  return accept()
}

/** Totul de dinaintea unei salvări (§7): indexul la zi, ștampila, T în ambele direcții. `encode` aruncă pe refuz. */
export function temperaturaLaZi(w: World): Outcome<void> {
  const idx = w.camere
  if (idx.teren !== w.terrain || idx.vazute !== w.terrain.editari) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'indexul nu e la zi cu terenul', vazute: idx.vazute, editari: w.terrain.editari })
  const s = verificaStampila(w)
  if (!s.ok) return s
  return verificaTemperaturi(w)
}

// ---------------------------------------------------------------------------
// punctul unic de sincronizare (§2)
// ---------------------------------------------------------------------------

/** Ce a făcut `sincronizeazaLumea` pe un lot. */
export interface SincronizareLume {
  readonly sch: SchimbareCamere
  /** Graful incremental de după lot (sau refuzul lui: pasul îl reface de urgență). */
  readonly graf: Outcome<GrafIncremental>
  /** Componente cu T din proveniență pe lotul ăsta. */
  readonly noi: number
}

/** Ce a văzut punctul unic pe un lot, pentru verdict (`verdictulLotului`). */
export interface StareaLotului {
  /** Surse ale provenienței fără T (o stare nesincronizată): masa lor a fost tratată ca apărută. */
  readonly surseFaraT: number
  /** Componentele pe care identitățile evidenței maselor nu țin (`EvidentaMase.abateri`). */
  readonly abateri: number
  /** Graful incremental de după lot, sau refuzul construcției lui. */
  readonly graf: Outcome<unknown>
  /** Delta a lovit un invariant și graful s-a refăcut integral, de urgență (cu ștampila de intrare bună). */
  readonly deUrgenta: boolean
}

/** Motivul invariantului „refacere de urgență a grafului la lot" (GRAF-1; jurnalul, F3). */
export const MOTIV_GRAF_URGENTA = 'graful incremental refacut de urgenta la lot'

/** Motivul invariantului „graful incremental ≠ integralul la salvare" (GRAF-1, SAV-R2, IDX-4; jurnalul, F3). */
export const MOTIV_GRAF_LA_SALVARE = 'graful incremental difera de cel integral (la salvare)'

/**
 * Verdictul unui lot (§2, §5.3) — funcție PURĂ (PAS-4: o abatere a evidenței nu se poate provoca din afară fără să strici
 * fete.ts, deci verdictul se probează direct): primul invariant încălcat, în ordinea sursă fără T → abaterile evidenței →
 * graful refuzat → graful refăcut de urgență (GRAF-1); altfel accept.
 */
export function verdictulLotului(l: StareaLotului): Outcome<void> {
  if (l.surseFaraT > 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'o sursa a provenientei n-avea T (stare nesincronizata)', surse: l.surseFaraT })
  if (l.abateri > 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'evidenta maselor nu se inchide', abateri: l.abateri })
  if (!l.graf.ok) return l.graf
  if (l.deUrgenta) return refuse(Reason.INVARIANT_INCALCAT, { motiv: MOTIV_GRAF_URGENTA })
  return accept()
}

/** Perechile (componentă nouă, sursă) ale lotului, pe fel (contoarele de viață ale porților, SAV-5). */
function numaraSursele(stat: StatTermic, sch: SchimbareCamere): void {
  // determinism-ok: numărători (sume întregi), ordinea nu contează.
  for (const surse of sch.prov.values()) {
    // determinism-ok: idem.
    for (const s of surse.keys()) {
      if (s >= 0) stat.surseVechi++
      else if (s === PROV_CER) stat.surseCer++
      else if (s === PROV_NEC_CER || s <= PROV_NEC_SOL0) stat.surseNec++
      else if (s <= PROV_SOL0) stat.surseSol++
    }
  }
}

/**
 * Punctul unic de sincronizare (§2): indexul (`sincronizeazaCamere`) → delta grafului (`actualizeazaGraful`) → proveniența
 * temperaturii (§3, la tickul de acum) → ștampila. Se cheamă la capătul tickului, după comenzile de teren, la zidirea
 * harnașamentului și (prin `incarcaTemperaturi`) la încărcare — nicăieri altundeva (testul AST, §2).
 *
 * Invarianții nu aruncă: o ștampilă care nu e a indexului la intrare (un lot sincronizat pe lângă) își pierde
 * proveniența — graful se reface integral, T se reia de la echilibru pe toate componentele, se numără și se întoarce
 * `INVARIANT_INCALCAT`. Altfel verdictul lotului (`verdictulLotului`) numără o sursă fără T (o stare nesincronizată),
 * abaterile evidenței, un graf refuzat și o refacere de URGENȚĂ a grafului în deltă (GRAF-1: un invariant al deltei se
 * repară, dar nu tăcut — viewer-ul alertează doar pe `invarianti`).
 */
export function sincronizeazaLumea(w: World, rules: Rules): Outcome<SincronizareLume> {
  const st = w.temperatura
  const intrare = verificaStampila(w)
  const urgente = numarRefaceriDeUrgenta(w.camere)
  const sch = sincronizeazaCamere(w.camere, w.terrain)
  const graf = actualizeazaGraful(w.camere, sch, rules)
  // După ramura ștampilei de intrare: o ocolire a punctului unic face și ea o refacere de urgență (ștampila grafului nu e
  // `sch.inainte`), dar e numărată acolo — de două ori ar fi un invariant fals în plus.
  if (!intrare.ok) {
    invariant(st, intrare)
    reiaDeLaEchilibru(w, rules)
    return intrare
  }
  const deUrgenta = numarRefaceriDeUrgenta(w.camere) !== urgente
  let noi = 0
  let surseFaraT = 0
  let taiate = 0
  if (sch.mase.noi.length > 0 || sch.moarte.length > 0) {
    const p = provenientaTemperaturii(st.slot, sch, w.tick, w.seed, rules, st.pragBigInt === 0)
    st.slot = p.stare
    // Plasa de siguranță (PROV-1 b), pe componentele noi ale lotului (doar ele și-au schimbat T-ul): O(lot).
    for (const y of sch.mase.noi) if (taieT(st.slot, y.id)) taiate++
    noi = sch.mase.noi.length
    surseFaraT = p.surseFaraT
    st.stat.loturi++
    if (sch.felii.length === 0 && !sch.recalcul && noi > 0) st.stat.loturiDoarFete++
    st.stat.rezerva += p.rezerva
    st.stat.provenienteBigInt += p.bigInt
    numaraSursele(st.stat, sch)
  }
  st.stampila = stampilaDe(w.camere)
  st.reguli = rules
  const v = verdictulLotului({ surseFaraT, abateri: sch.mase.abateri, graf, deUrgenta })
  let o: Outcome<SincronizareLume> = v.ok ? accept({ sch, graf, noi }) : v
  if (!v.ok) invariant(st, v)
  if (taiate > 0) {
    const t = refuse(Reason.INVARIANT_INCALCAT, { motiv: MOTIV_TAIERE, componente: taiate })
    st.stat.taieri += taiate
    invariant(st, t)
    if (o.ok) o = t
  }
  return o
}

// ---------------------------------------------------------------------------
// echilibrul: lumea fără istorie (§7)
// ---------------------------------------------------------------------------

/** Rezultatul lui `temperaturaLaEchilibru`. */
export interface Echilibru {
  readonly treceri: number
  /** false: oprit la `PLAFON_ECHILIBRU`, T e ultima iterată (deterministă), nu echilibrul — pasul o relaxează. */
  readonly convergent: boolean
}

interface SolutieEchilibru extends Echilibru {
  /** Slotul componentei și T-ul ei (Q16), pe nod. */
  readonly comp: Int32Array
  readonly t: Int32Array
}

function solutiaEchilibrului(w: World, rules: Rules, tick: number, plafon: number = PLAFON_ECHILIBRU): Outcome<SolutieEchilibru> {
  const go = grafTermic(w.camere, rules)
  if (!go.ok) return go
  const g = go.value
  const tRez = temperaturiRezervoare(w.seed, tick, rules)
  const s = rezolvaRegim(g, tRez, tRez[BIN_AFARA]!, false, plafon)
  return accept({ comp: g.comp, t: s.t, treceri: s.treceri, convergent: s.convergent })
}

/**
 * T-ul „lumii fără istorie" (§7, SAV-9, SAV-11): regimul permanent al grafului (Gauss–Seidel pe întregi, `rezolvaRegim`
 * direct, plafon `PLAFON_ECHILIBRU`), rest 0, pe TOATE componentele, la `tick`; ștampila se aliniază la index. La
 * neconvergență: ultima iterată + contor (`echilibreNeconvergente`) — nu e echilibrul, pasul îl relaxează. Un singur adevăr
 * pentru „lume fără istorie": migrarea salvărilor vechi (save.ts) și zidirea harnașamentului (fixture-m10.ts) — doar acolo
 * (testul AST, §2). Cere indexul la zi. `plafon` e al probelor (neconvergența); jocul folosește `PLAFON_ECHILIBRU`.
 */
export function temperaturaLaEchilibru(w: World, rules: Rules, tick: number, plafon: number = PLAFON_ECHILIBRU): Outcome<Echilibru> {
  const idx = w.camere
  if (idx.teren !== w.terrain || idx.vazute !== w.terrain.editari) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'indexul nu e la zi cu terenul', vazute: idx.vazute, editari: w.terrain.editari })
  const r = solutiaEchilibrului(w, rules, tick, plafon)
  if (!r.ok) return r
  const st = w.temperatura
  const sl = temperaturiGoale(idx.cUrmator)
  for (let i = 0; i < r.value.comp.length; i++) {
    const c = r.value.comp[i]!
    sl.t[c] = r.value.t[i]!
    sl.are[c] = 1
  }
  st.slot = sl
  st.stampila = stampilaDe(idx)
  st.reguli = rules
  st.stat.echilibre++
  if (!r.value.convergent) st.stat.echilibreNeconvergente++
  return accept({ treceri: r.value.treceri, convergent: r.value.convergent })
}

/** După o ocolire a punctului unic: T-urile nu mai au proveniență, deci toate se reiau de la echilibru (numărat de apelant). */
function reiaDeLaEchilibru(w: World, rules: Rules): void {
  const r = temperaturaLaEchilibru(w, rules, w.tick)
  if (!r.ok) invariant(w.temperatura, r)
}

/** T lipsă pe unele componente (sau T pe sloturi moarte): cele lipsă de la echilibru, sloturile moarte golite. */
function completeaza(w: World, rules: Rules): void {
  const st = w.temperatura
  const idx = w.camere
  const r = solutiaEchilibrului(w, rules, w.tick)
  if (!r.ok) {
    invariant(st, r)
    return
  }
  const vechi = st.slot
  const sl = temperaturiGoale(Math.max(idx.cUrmator, vechi.are.length))
  for (let i = 0; i < r.value.comp.length; i++) {
    const c = r.value.comp[i]!
    if (c < vechi.are.length && vechi.are[c] === 1) {
      sl.t[c] = vechi.t[c]!
      sl.rest[c] = vechi.rest[c]!
    } else sl.t[c] = r.value.t[i]!
    sl.are[c] = 1
  }
  st.slot = sl
  st.stat.echilibre++
}

// ---------------------------------------------------------------------------
// încărcarea (§7)
// ---------------------------------------------------------------------------

/**
 * Blocul `temperaturi` al salvării (schema 8, §7): pe ANCORA componentei (id-urile nu supraviețuiesc unei încărcări: B1),
 * strict crescător; T (Q16 °C) și rest (μ·Q16). `amprenta` = FNV u32 peste VECTORUL C' (n, apoi C' hi/lo în ordinea
 * ancorelor): o schimbare de content SAU de cod a capacității o mută (verif-SAV-2). Nu intră în hash (e a regulilor).
 */
export interface BlocTemperaturi {
  readonly ancora: number[]
  readonly t: number[]
  readonly rest: number[]
  readonly amprenta: number
}

/** T acceptat pe disc: întreg sigur în [−2^31, 2^31) (hash-ul îl scrie ca i32; SAV-4). */
const T_MIN = -2147483648
const T_LIMITA = 2147483648
const DOI_LA_32 = 4294967296

/** FNV u32 peste vectorul C' (§7, verif-SAV-2): n, apoi C' hi/lo, în ordinea dată (a ancorelor). */
export function amprentaCapacitatii(cap: readonly number[]): number {
  const h = new Hasher().u32(cap.length)
  for (const c of cap) h.u32(Math.floor(c / DOI_LA_32)).u32(c % DOI_LA_32)
  return h.value()
}

/** C' (μ) al fiecărei componente din `lista`, din nodul ei din graful incremental. */
function capacitatiPeAncora(g: GrafIncremental, lista: readonly Componenta[], rules: Rules): number[] | Refusal {
  const out: number[] = []
  for (const c of lista) {
    const et = g.nodComp.get(c.id)
    const nod = et === undefined ? undefined : g.noduri.get(et)
    if (nod === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'componenta fara nod in graf', ancora: c.ancora })
    out.push(capacitateMu(nod, rules.termic.mase))
  }
  return out
}

/**
 * Blocul de scris la salvare (§7). Întâi: temperatura e la zi (ștampila, T în ambele direcții), iar graful incremental se
 * compară cu cel INTEGRAL (IDX-4: o deltă greșită fără asimetrie — un bin, un C' — ar lăsa lumea continuă pe alt graf decât
 * cea încărcată); la diferență, integralul îl înlocuiește, se numără (`grafDiferitLaSalvare` și ca invariant) și prima linie
 * diferită intră în jurnal (`ultimaDiferentaGraf`), iar salvarea continuă pe graful bun: restul fiecărei componente se
 * normalizează EXACT pe C'-ul nou (GRAF-2, SAV-R1 — o deltă greșită de C' lăsa restul în [C'_bun, C'_greșit), iar `encode`
 * arunca la fiecare salvare până la pasul următor; în pauză, la nesfârșit). Apoi, pe fiecare componentă, în ordinea
 * ancorelor: T întreg sigur în [−2^31, 2^31), rest întreg sigur în [0, C') — altfel refuz (`encode` aruncă).
 */
export function blocTemperaturi(w: World): Outcome<BlocTemperaturi> {
  const z = temperaturaLaZi(w)
  if (!z.ok) return z
  const st = w.temperatura
  const rules = st.reguli
  const cmp = comparaGrafulCuIntegral(w.camere, rules)
  if (!cmp.ok) {
    if (cmp.params.motiv !== 'graful incremental difera de cel integral') return cmp
    st.stat.grafDiferitLaSalvare++
    st.stat.ultimaDiferentaGraf = String(cmp.params.linie)
    // Numărat și ca invariant (GRAF-1, SAV-R2): viewer-ul alertează doar pe `invarianti` — altfel delta greșită prinsă aici
    // s-ar repara tăcut la fiecare salvare automată.
    invariant(st, refuse(Reason.INVARIANT_INCALCAT, { motiv: MOTIV_GRAF_LA_SALVARE, linie: cmp.params.linie }))
  }
  const go = grafulIncremental(w.camere, rules)
  if (!go.ok) return go
  const lista = listaComponente(w.camere)
  const cap = capacitatiPeAncora(go.value, lista, rules)
  if ('reason' in cap) return cap
  const sl = st.slot
  // Graful tocmai înlocuit poate avea alt C': restul lumii continue a trăit pe C'-ul vechi. Normalizarea exactă pe C'-ul nou
  // (T += floor(rest / C'), rest −= q·C') e chiar cea pe care o face pasul următor (`pasPeGraf`), adusă înainte de scriere și
  // scrisă ÎN lumea continuă — ca ea și lumea încărcată să rămână una (GRAF-2, SAV-R1). Un rest valid rămâne neatins.
  if (!cmp.ok) {
    for (let i = 0; i < lista.length; i++) {
      const id = lista[i]!.id
      const C = cap[i]!
      const r = sl.rest[id]!
      if (!(r >= C) || !Number.isSafeInteger(r)) continue
      let q = Math.floor(r / C)
      let rr = r - q * C
      if (rr < 0) {
        q--
        rr += C
      } else if (rr >= C) {
        q++
        rr -= C
      }
      sl.t[id] = sl.t[id]! + q
      sl.rest[id] = rr
    }
  }
  const b: BlocTemperaturi = { ancora: [], t: [], rest: [], amprenta: amprentaCapacitatii(cap) }
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i]!
    const t = sl.t[c.id]!
    const r = sl.rest[c.id]!
    if (!Number.isSafeInteger(t) || t < T_MIN || t >= T_LIMITA) return refuse(Reason.VALOARE_INVALIDA, { camp: 'temperaturi.t', ancora: c.ancora, valoare: t })
    if (!Number.isSafeInteger(r) || r < 0 || r >= cap[i]!) return refuse(Reason.VALOARE_INVALIDA, { camp: 'temperaturi.rest', ancora: c.ancora, valoare: r, capacitate: cap[i]! })
    b.ancora.push(c.ancora)
    b.t.push(t)
    b.rest.push(r)
  }
  return accept(b)
}

/** Indexul, graful și starea ale unei lumi încărcate. */
export interface LumeIncarcata {
  readonly camere: IndexCamere
  readonly temperatura: StareTemperatura
}

/**
 * Indexul unei lumi încărcate, construit de la zero pe terenul ei (DERIVED), cu graful incremental construit integral și
 * starea temperaturii aliniată la el; T din `bloc` (schema 8) sau, fără bloc (o salvare de dinainte de t.2b), încă fără
 * T — `decode` o umple atunci de la echilibru (`temperaturaLaEchilibru`). Doar save.ts (testul AST, §2).
 *
 * Validarea blocului (§7, B1, SAV-4): ancore întregi sigure, strict crescătoare, fiecare a unei componente
 * (`ENTITATE_INEXISTENTA`), câte una pe componentă (`LIPSA_MATERIAL`); T întreg sigur în [−2^31, 2^31), rest întreg sigur
 * ≥ 0 (`VALOARE_INVALIDA`). Apoi AMPRENTA C' (SAV-2): egală → validare STRICTĂ (rest ≥ C' e o salvare coruptă); diferită
 * (alt content sau alt cod al capacității) → rest = 0 pe TOATE componentele, T rămâne, contorul `restNormalizat` = n —
 * aceeași regulă ca în lumea continuă la o masă schimbată cu aceleași celule (C3 pe o componentă fără celule schimbate).
 * Refuz și dacă graful refuză (fețele nu se potrivesc cu indexul: un defect, nu o salvare stricată).
 */
export function incarcaTemperaturi(terrain: Terrain, rules: Rules, bloc?: unknown): Outcome<LumeIncarcata> {
  const camere = construiesteCamere(terrain, rules.termic.kCelule, rules.termic.dSolMasivM)
  const go = actualizeazaGraful(camere, sincronizeazaCamere(camere, terrain), rules)
  if (!go.ok) return go
  const temperatura: StareTemperatura = { slot: temperaturiGoale(camere.cUrmator), stampila: stampilaDe(camere), reguli: rules, pragBigInt: PRAG_NUMBER, stat: statGol() }
  if (bloc === undefined) return accept({ camere, temperatura })
  const b = bloc as Partial<Record<keyof BlocTemperaturi, unknown>> | null
  if (b === null || typeof b !== 'object' || !Array.isArray(b.ancora) || !Array.isArray(b.t) || !Array.isArray(b.rest)) return refuse(Reason.LIPSA_MATERIAL, { camp: 'temperaturi' })
  const anc = b.ancora as unknown[]
  const ts = b.t as unknown[]
  const rs0 = b.rest as unknown[]
  if (ts.length !== anc.length || rs0.length !== anc.length) return refuse(Reason.VALOARE_INVALIDA, { camp: 'temperaturi', lungime: anc.length, t: ts.length, rest: rs0.length })
  if (typeof b.amprenta !== 'number' || !Number.isInteger(b.amprenta) || b.amprenta < 0 || b.amprenta >= DOI_LA_32) return refuse(Reason.VALOARE_INVALIDA, { camp: 'temperaturi.amprenta', valoare: String(b.amprenta) })
  if (anc.length !== camere.comp.size) return refuse(Reason.LIPSA_MATERIAL, { camp: 'temperaturi', componente: camere.comp.size, cu_t: anc.length })
  const lista = listaComponente(camere)
  const peAncora = new Map<number, Componenta>()
  for (const c of lista) peAncora.set(c.ancora, c)
  const ordonate: Componenta[] = []
  for (let i = 0; i < anc.length; i++) {
    const a = anc[i]
    if (typeof a !== 'number' || !Number.isSafeInteger(a) || (i > 0 && a <= (anc[i - 1] as number))) return refuse(Reason.VALOARE_INVALIDA, { camp: 'temperaturi.ancora', index: i, motiv: 'ancorele nu sunt intregi strict crescatori' })
    const c = peAncora.get(a)
    if (c === undefined) return refuse(Reason.ENTITATE_INEXISTENTA, { camp: 'temperaturi.ancora', ancora: a })
    const t = ts[i]
    const r = rs0[i]
    if (typeof t !== 'number' || !Number.isSafeInteger(t) || t < T_MIN || t >= T_LIMITA) return refuse(Reason.VALOARE_INVALIDA, { camp: 'temperaturi.t', ancora: a, valoare: String(t) })
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) return refuse(Reason.VALOARE_INVALIDA, { camp: 'temperaturi.rest', ancora: a, valoare: String(r) })
    ordonate.push(c)
  }
  const cap = capacitatiPeAncora(go.value, ordonate, rules)
  if ('reason' in cap) return cap
  const strict = amprentaCapacitatii(cap) === b.amprenta
  const sl = temperatura.slot
  for (let i = 0; i < ordonate.length; i++) {
    const c = ordonate[i]!
    const r = rs0[i] as number
    if (strict && r >= cap[i]!) return refuse(Reason.VALOARE_INVALIDA, { camp: 'temperaturi.rest', ancora: c.ancora, valoare: r, capacitate: cap[i]!, motiv: 'rest >= C\' cu aceeasi amprenta: salvare corupta' })
    sl.t[c.id] = ts[i] as number
    sl.rest[c.id] = strict ? r : 0
    sl.are[c.id] = 1
  }
  if (!strict) temperatura.stat.restNormalizat = ordonate.length
  return accept({ camere, temperatura })
}

// ---------------------------------------------------------------------------
// pasul de 1 Hz, forma ψ (§5)
// ---------------------------------------------------------------------------

/** Fracția redusă `tps · 86.400 · μ_aer / (ziTicks · c_aer)`: G (Q16 W/K) → g pe pas (μ, Q16) — §5.1. DERIVED din reguli. */
interface Conversie {
  readonly num: number
  readonly den: number
}

const CONVERSII = new WeakMap<Rules, Conversie>()

function cmmdc(a: number, b: number): number {
  while (b !== 0) {
    const r = a % b
    a = b
    b = r
  }
  return a
}

function conversia(rules: Rules): Conversie {
  let c = CONVERSII.get(rules)
  if (c === undefined) {
    const num = rules.ticksPerSecond * 86400 * rules.termic.mase.aer
    const den = rules.calendar.ziTicks * rules.termic.cAerJPeK
    const d = cmmdc(num, den)
    c = { num: num / d, den: den / d }
    CONVERSII.set(rules, c)
  }
  return c
}

/** rs(a·b / d), exact: Number cât produsul e un întreg sigur, BigInt altfel. */
function rsProdus(a: number, b: number, d: number): number {
  const p = a * b
  if (Number.isSafeInteger(p)) return rsN(p, d)
  return Number(rsB(BigInt(a) * BigInt(b), BigInt(d)))
}

/** g pe pas (§5.1) al unei sume de conductanțe G (Q16 W/K): rs(G · num / den). */
function gPas(G: number, c: Conversie): number {
  return rsProdus(G, c.num, c.den)
}

/** Căldura a `P` W întregi pe un pas, în unități H (μ·Q16): rs(P · 2^16 · num / den) — o conversie pe nod (§5.1). */
function caldura(P: number, c: Conversie): number {
  return rsProdus(P * 65536, c.num, c.den)
}

/** Fluxul unei muchii, F = rs(g·(T_a − T_b), 2^16) (§5.2): Number sub prag, BigInt altfel. `big.v` numără trecerile. */
function fluxMuchie(g: number, d: number, prag: number, big: { v: number }): number {
  const x = g * d
  if ((x < 0 ? -x : x) < prag) return rsN(x, 65536)
  big.v++
  return Number(rsB(BigInt(g) * BigInt(d), 65536n))
}

/** Ce a făcut un pas (pentru oracole: ΔΣH == sumaFr + sumaP — muchiile se anulează). */
export interface RaportPas {
  readonly noduri: number
  /** Σ fluxurile rezervoarelor, H (μ·Q16). */
  readonly sumaFr: number
  /** Σ căldura oamenilor, H. */
  readonly sumaP: number
  readonly noduriBigInt: number
  readonly muchiiBigInt: number
  /** Noduri cu T tăiat la plasa de siguranță după pas (PROV-1 b): atunci ΔΣH ≠ ΣF_r + ΣP. 0 în orice joc. */
  readonly taieri: number
}

/** Opțiunile de probă ale pasului. */
export interface OptiuniPas {
  /**
   * Proba orientării (§9, SAV-3): pentru muchiile (a, b) (etichete, a < b) pe care le alege, fluxul se calculează din
   * capătul b. Cu `rs` impară rezultatul e identic bit cu bit.
   */
  readonly inverseaza?: (a: number, b: number) => boolean
}

/**
 * Modelul pasului (DERIVED din graful incremental și reguli, TRANSIENT): nodurile dense, C', muchiile o dată pe pereche
 * cu g pe pas, rezervoarele pe bin cu g pe pas și S. Memorat pe OBIECTUL grafului, valabil cât ștampila lui (vazute,
 * epoca, epocaFete) și regulile: orice deltă a grafului vine cu un lot, deci cu altă ștampilă (S2). Validările de citire
 * ale grafului (simetria muchiilor, nodurile == componentele indexului, C' > 0) se fac aici, la construire.
 */
interface ModelPas {
  readonly vazute: number
  readonly epoca: number
  readonly epocaFete: number
  readonly reguli: Rules
  readonly n: number
  /** Slotul componentei fiecărui nod dens. */
  readonly comp: Int32Array
  readonly C: Float64Array
  /** Slot → nod dens (−1: niciunul). */
  readonly densDupaComp: Int32Array
  /** Muchiile, o dată pe pereche (din eticheta mai mică): capetele dense, etichetele lor și g pe pas. */
  readonly mA: Int32Array
  readonly mB: Int32Array
  readonly mEa: Int32Array
  readonly mEb: Int32Array
  readonly mG: Float64Array
  /** Rezervoarele nodului i: `rBin/rG[rStart[i] .. rStart[i+1])`, g pe pas; S = Σ rG. */
  readonly rStart: Int32Array
  readonly rBin: Int32Array
  readonly rG: Float64Array
  readonly S: Float64Array
}

const MODELE = new WeakMap<GrafIncremental, ModelPas>()

function modelul(w: World, g: GrafIncremental, rules: Rules): ModelPas | Refusal {
  const s = g.stampila
  const m = MODELE.get(g)
  if (m !== undefined && m.reguli === rules && m.vazute === s.vazute && m.epoca === s.epoca && m.epocaFete === s.epocaFete) return m
  const idx = w.camere
  const n = g.noduri.size
  if (n !== idx.comp.size) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'nodurile grafului nu sunt componentele indexului', noduri: n, componente: idx.comp.size })
  const conv = conversia(rules)
  let maxEt = 0
  // determinism-ok: un maxim.
  for (const et of g.noduri.keys()) if (et > maxEt) maxEt = et
  const dupaEt = new Int32Array(maxEt + 1).fill(-1)
  const comp = new Int32Array(n)
  const C = new Float64Array(n)
  const densDupaComp = new Int32Array(Math.max(1, idx.cUrmator)).fill(-1)
  const noduri: NodTermic[] = []
  const etichete: number[] = []
  let i = 0
  // determinism-ok: indicii denși urmează inserarea; fiecare nod se calculează separat, sumele sunt întregi exacte.
  for (const [et, nod] of g.noduri) {
    const c = nod.comp
    if (!idx.comp.has(c) || g.nodComp.get(c) !== et || c >= densDupaComp.length) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'nod fara componenta', nod: et, comp: c })
    const Cn = capacitateMu(nod, rules.termic.mase)
    if (!(Cn > 0)) return refuse(Reason.INVARIANT_INCALCAT, { motiv: "C' nul pe un nod", comp: c })
    dupaEt[et] = i
    comp[i] = c
    C[i] = Cn
    densDupaComp[c] = i
    noduri.push(nod)
    etichete.push(et)
    i++
  }
  const mA: number[] = []
  const mB: number[] = []
  const mEa: number[] = []
  const mEb: number[] = []
  const mG: number[] = []
  const rStart = new Int32Array(n + 1)
  const rBin: number[] = []
  const rG: number[] = []
  const S = new Float64Array(n)
  for (let a = 0; a < n; a++) {
    const ea = etichete[a]!
    // determinism-ok: listele de muchii și de rezervoare urmează inserarea; fluxurile se adună în sume întregi exacte.
    for (const [eb, G] of noduri[a]!.vec) {
      const inv = g.noduri.get(eb)?.vec.get(ea)
      if (inv !== G) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'muchie asimetrica', a: ea, b: eb, gA: G, gB: inv ?? -1 })
      if (ea > eb) continue
      const b = eb <= maxEt ? dupaEt[eb]! : -1
      if (b < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'muchie spre un nod inexistent', a: ea, b: eb })
      mA.push(a)
      mB.push(b)
      mEa.push(ea)
      mEb.push(eb)
      mG.push(gPas(G, conv))
    }
    rStart[a] = rBin.length
    // determinism-ok: idem.
    for (const [bin, G] of noduri[a]!.bin) {
      const v = gPas(G, conv)
      rBin.push(bin)
      rG.push(v)
      S[a] = S[a]! + v
    }
  }
  rStart[n] = rBin.length
  const nou: ModelPas = {
    vazute: s.vazute, epoca: s.epoca, epocaFete: s.epocaFete, reguli: rules, n, comp, C, densDupaComp,
    mA: Int32Array.from(mA), mB: Int32Array.from(mB), mEa: Int32Array.from(mEa), mEb: Int32Array.from(mEb), mG: Float64Array.from(mG),
    rStart, rBin: Int32Array.from(rBin), rG: Float64Array.from(rG), S,
  }
  MODELE.set(g, nou)
  return nou
}

/**
 * Un pas pe graf, forma ψ (§5.2): (1) rezervoarele la tickul pasului; (2) muchiile din T VECHI, o dată pe pereche
 * (din eticheta mai mică — `rs` impară face orientarea irelevantă); (3) oamenii (W întregi pe nod, o singură
 * conversie); normalizare → **T*** (T după pasul 3, NUM-7); (4) rezervoarele: S = Σ g_r, X = Σ g_r·(T_r − T*),
 * ψ = 2^16 − rs(2^16·S, C'·2^16 + S), F_r = rs(rs(X, 2^16)·ψ, 2^16); normalizare. Marginea e dinamică pe nod (§5.3):
 * S·(M + |T*|) < prag și (C' + S)·2^16 < prag → Number, altfel BigInt (același rezultat). Totul se scrie la sfârșit:
 * un refuz nu lasă un pas pe jumătate.
 */
function pasPeGraf(w: World, g: GrafIncremental, rules: Rules, o: OptiuniPas): RaportPas | Refusal {
  const st = w.temperatura
  const m = modelul(w, g, rules)
  if ('reason' in m) return m
  const conv = conversia(rules)
  const n = m.n
  const sl = st.slot
  const T = new Float64Array(n)
  const rest = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const c = m.comp[i]!
    if (c >= sl.are.length || sl.are[c] !== 1) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'componenta nodului fara T', comp: c })
    T[i] = sl.t[c]!
    rest[i] = sl.rest[c]!
  }
  const prag = st.pragBigInt
  // (1) rezervoarele la tickul pasului.
  const tRez = temperaturiRezervoare(w.seed, w.tick, rules)
  st.stat.rezervoareCitite++
  // (2) muchiile, din T VECHI.
  const acc = new Float64Array(n)
  const big = { v: 0 }
  const inv = o.inverseaza
  for (let e = 0; e < m.mA.length; e++) {
    const a = m.mA[e]!
    const b = m.mB[e]!
    if (inv !== undefined && inv(m.mEa[e]!, m.mEb[e]!)) {
      const F = fluxMuchie(m.mG[e]!, T[b]! - T[a]!, prag, big)
      acc[b] = acc[b]! - F
      acc[a] = acc[a]! + F
    } else {
      const F = fluxMuchie(m.mG[e]!, T[a]! - T[b]!, prag, big)
      acc[a] = acc[a]! - F
      acc[b] = acc[b]! + F
    }
  }
  // (3) oamenii: W întregi pe nod, eșantionați acum, din pozițiile de la capătul tickului (fără acumulator). Un om în
  // tocul ușii sau afară (celula lui nu e aer acoperit) nu încălzește nimic.
  const W = new Float64Array(n)
  const ag = w.agents
  for (let s = 0; s < ag.count; s++) {
    if (ag.alive[s] !== 1) continue
    st.stat.oameniCautati++
    const c = componentaLa(w.camere, cellOf(ag.x[s]!), cellOf(ag.y[s]!), ag.z[s]!)
    if (c === null) continue
    const k = c.id < m.densDupaComp.length ? m.densDupaComp[c.id]! : -1
    if (k < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'pionul sta intr-o componenta fara nod', comp: c.id })
    W[k] = W[k]! + rules.termic.omW
  }
  let sumaP = 0
  let sumaFr = 0
  let bigN = 0
  const M = g.margineT
  for (let i = 0; i < n; i++) {
    let P = 0
    if (W[i]! > 0) {
      P = caldura(W[i]!, conv)
      st.stat.adunariOameni++
    }
    sumaP += P
    // T* = T după muchii și oameni, normalizat (NUM-7).
    let r = rest[i]! + acc[i]! + P
    const C = m.C[i]!
    let q = Math.floor(r / C)
    r -= q * C
    if (r < 0) {
      q--
      r += C
    } else if (r >= C) {
      q++
      r -= C
    }
    const tStar = T[i]! + q
    // (4) rezervoarele, față de T*.
    const S = m.S[i]!
    const aT = tStar < 0 ? -tStar : tStar
    let Fr: number
    if (S * (M + aT) < prag && (C + S) * 65536 < prag) {
      let X = 0
      for (let k = m.rStart[i]!; k < m.rStart[i + 1]!; k++) X += m.rG[k]! * (tRez[m.rBin[k]!]! - tStar)
      const psi = 65536 - rsN(65536 * S, C * 65536 + S)
      Fr = rsN(rsN(X, 65536) * psi, 65536)
    } else {
      bigN++
      const tb = BigInt(tStar)
      let X = 0n
      for (let k = m.rStart[i]!; k < m.rStart[i + 1]!; k++) X += BigInt(m.rG[k]!) * (BigInt(tRez[m.rBin[k]!]!) - tb)
      const Sb = BigInt(S)
      const psi = 65536n - rsB(65536n * Sb, BigInt(C) * 65536n + Sb)
      Fr = Number(rsB(rsB(X, 65536n) * psi, 65536n))
    }
    sumaFr += Fr
    r += Fr
    let q2 = Math.floor(r / C)
    r -= q2 * C
    if (r < 0) {
      q2--
      r += C
    } else if (r >= C) {
      q2++
      r -= C
    }
    T[i] = tStar + q2 + 0
    rest[i] = r + 0
    // Un T în afara întregilor siguri (o stare care a divergat — content care ocolește garda — sau stricată) nu se mai poate
    // calcula exact: pasul se refuză întreg, nu se scrie nimic (și nu aruncă). Starea scrisă rămâne deci mereu pe întregi
    // siguri, iar T* (sumă de doi întregi siguri) e cel mult un întreg exact de double: BigInt(T*) nu aruncă.
    if (!Number.isSafeInteger(T[i]!) || !Number.isSafeInteger(rest[i]!)) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'T iese din intregii siguri', comp: m.comp[i]! })
  }
  // Scrierea, la sfârșit; plasa de siguranță (PROV-1 b) taie un |T| peste 1000 °C (numărat de `pasTermic`).
  let taieri = 0
  for (let i = 0; i < n; i++) {
    sl.t[m.comp[i]!] = T[i]!
    sl.rest[m.comp[i]!] = rest[i]!
    if (taieT(sl, m.comp[i]!)) taieri++
  }
  if (bigN > 0 || big.v > 0) st.stat.pasiBigInt++
  st.stat.noduriBigInt += bigN
  return { noduri: n, sumaFr, sumaP, noduriBigInt: bigN, muchiiBigInt: big.v, taieri }
}

/**
 * Pasul de 1 Hz (§5): world.ts îl cheamă după `sincronizeazaLumea`, la `w.tick % tps === 0` (faza e GLOBALĂ, pe tick —
 * nu de la încărcare). Prima linie: o lume fără nicio componentă (scenariul standard) nu face nimic, nici nu citește
 * rezervoarele.
 *
 * NU aruncă (§5.3): o ștampilă care nu e a indexului (sau un index rămas în urma terenului) reia temperatura de la
 * echilibru; o componentă fără T o primește de la echilibru, un slot mort se golește; un graf care nu e la zi sau refuză la
 * citire (o muchie asimetrică) se reface integral, de urgență — fiecare numărat în `statTermic(w).invarianti`, apoi pasul
 * continuă. După pas, plasa de siguranță taie un |T| peste 1000 °C (numărat în `taieri` și ca invariant, PROV-1 b).
 * Întoarce raportul pasului (sau null: nimic de făcut / graful nu se poate reface).
 */
export function pasTermic(w: World, rules: Rules, o: OptiuniPas = {}): RaportPas | null {
  if (w.camere.comp.size === 0) return null
  const st = w.temperatura
  const idx = w.camere
  const stamp = verificaStampila(w)
  if (!stamp.ok || idx.teren !== w.terrain || idx.vazute !== w.terrain.editari) {
    invariant(st, stamp.ok ? refuse(Reason.INVARIANT_INCALCAT, { motiv: 'pas: indexul nu e la zi cu terenul' }) : stamp)
    if (idx.teren !== w.terrain || idx.vazute !== w.terrain.editari) actualizeazaGraful(idx, sincronizeazaCamere(idx, w.terrain), rules)
    reiaDeLaEchilibru(w, rules)
  } else {
    const t = verificaTemperaturi(w)
    if (!t.ok) {
      invariant(st, t)
      completeaza(w, rules)
    }
  }
  let go = grafulIncremental(idx, rules)
  if (!go.ok) {
    invariant(st, go)
    go = refaGrafulDeUrgenta(idx, rules)
    if (!go.ok) {
      invariant(st, go)
      return null
    }
  }
  let r = pasPeGraf(w, go.value, rules, o)
  if ('reason' in r) {
    invariant(st, r)
    go = refaGrafulDeUrgenta(idx, rules)
    if (!go.ok) {
      invariant(st, go)
      return null
    }
    r = pasPeGraf(w, go.value, rules, o)
    if ('reason' in r) {
      invariant(st, r)
      return null
    }
  }
  st.stat.pasi++
  if (r.taieri > 0) {
    st.stat.taieri += r.taieri
    invariant(st, refuse(Reason.INVARIANT_INCALCAT, { motiv: MOTIV_TAIERE, componente: r.taieri }))
  }
  return r
}

// ---------------------------------------------------------------------------
// ce vede jucătorul (§8): citiri PURE ale stării, pentru ecran (valul 2)
// ---------------------------------------------------------------------------

/**
 * T-ul componentei din stare (Q16 °C; partea întreagă — restul e sub 1/65.536 °C, sub orice zecimală afișată), sau null:
 * componenta n-are T sau starea nu e a indexului de acum (ștampila) — un invariant încălcat, pe care ecranul îl arată
 * „Temperatura nu se știe (eroare internă)" (§8, UI-6), iar pasul următor îl numără. Nu scrie nimic.
 */
export function temperaturaAcum(w: World, compId: number): number | null {
  const sl = w.temperatura.slot
  if (!w.camere.comp.has(compId) || compId >= sl.are.length || sl.are[compId] !== 1) return null
  if (!verificaStampila(w).ok) return null
  return sl.t[compId]!
}

/** „Trage spre" (§8): linia nodului componentei în graful SIMULĂRII. */
export interface Tragere {
  readonly comp: number
  /** Σ g_r·T_r(tick) + Σ g_ij·T_j, Q16 W/K × Q16 °C, exact. */
  readonly numarator: bigint
  /** ΣG al nodului, Q16 W/K. */
  readonly sumaG: number
  /** X = rs(numărător / ΣG), Q16 °C: echilibrul LOCAL — rezervoarele la `w.tick`, vecinele la T-ul lor de ACUM, fără oameni. */
  readonly xQ16: number
}

/**
 * X al componentei din linia grafului incremental al simulării (§8, B6: 8,6–9,1 µs pe hub-ul M10): rezervoarele la tickul
 * lumii, vecinele la T-ul lor din stare — nu la echilibrul lor (graful t.2a nu se cere). Refuz dacă graful nu e la zi
 * (`grafulIncremental`), dacă starea nu e a indexului sau dacă o vecină n-are T; nu reface nimic (asta e treaba pasului).
 */
export function tragerea(w: World, rules: Rules, compId: number): Outcome<Tragere> {
  const s = verificaStampila(w)
  if (!s.ok) return s
  const go = grafulIncremental(w.camere, rules)
  if (!go.ok) return go
  const g = go.value
  const et = g.nodComp.get(compId)
  const nod = et === undefined ? undefined : g.noduri.get(et)
  if (nod === undefined) return refuse(Reason.ENTITATE_INEXISTENTA, { camp: 'nodul componentei', id: compId })
  const tRez = temperaturiRezervoare(w.seed, w.tick, rules)
  let num = 0n
  let S = 0
  // determinism-ok: sumă întreagă exactă (BigInt) și o sumă de întregi sub 2^53; ordinea nu contează.
  for (const [bin, G] of nod.bin) {
    num += BigInt(G) * BigInt(tRez[bin]!)
    S += G
  }
  // determinism-ok: idem.
  for (const [e, G] of nod.vec) {
    const v = g.noduri.get(e)
    const t = v === undefined ? null : temperaturaAcum(w, v.comp)
    if (t === null) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'vecina nodului n-are T', nod: e })
    num += BigInt(G) * BigInt(t)
    S += G
  }
  if (S <= 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'nod fara conductanta', comp: compId })
  return accept({ comp: compId, numarator: num, sumaG: S, xQ16: Number(rsB(num, BigInt(S))) })
}

/**
 * X_tot (§8, UI-2): X + P/ΣG, cu P = `watti` (W întregi) — încotro merge T cu oamenii de acum. P·2^32: W → Q16 W/K × Q16 °C.
 * Cu P = 0 e chiar X.
 */
export function tragereCuOameni(t: Tragere, watti: number): number {
  return Number(rsB(t.numarator + BigInt(watti) * 4294967296n, BigInt(t.sumaG)))
}

/**
 * Descompunerea de ACUM (§8): geometria canalelor (memorată de ecran pe index, `epoca`, `epocaFete`, reguli) cu
 * rezervoarele la `w.tick` și vecinele la T-ul lor din stare; temperatura arătată e T-ul componentei din stare. X din
 * rânduri (`xQ16`) e oracolul liniei grafului (`tragerea`): același număr pe alt drum (agregarea fețelor).
 */
export function canaleAcum(w: World, rules: Rules, geo: GeometrieCanale): Outcome<CanaleTermice> {
  const t = temperaturaAcum(w, geo.comp)
  if (t === null) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'componenta fara T', comp: geo.comp })
  const tRez = temperaturiRezervoare(w.seed, w.tick, rules)
  return canaleDinGeometrie(geo, tRez, (v) => temperaturaAcum(w, v), t, tRez[BIN_AFARA]!)
}

/**
 * Câți oameni stau ACUM în fiecare componentă (id → număr), după regula pasului (§5.2 (3), `pasPeGraf`): pionul viu, pe
 * celula picioarelor (`cellOf(x)`, `cellOf(y)`, `z`); unul în tocul ușii sau afară nu e în nicio componentă. Ecranul o
 * cheamă după tickul în care a rulat pasul — aceleași poziții ca ale pasului. E a doua scriere a regulii (pasul nu se
 * atinge în valul 2); oracolul „oamenii ecranului == căldura pasului" (tests/viewer-termic.test.ts) le ține împreună.
 */
export function oameniPeComponente(w: World): Map<number, number> {
  const out = new Map<number, number>()
  const ag = w.agents
  for (let s = 0; s < ag.count; s++) {
    if (ag.alive[s] !== 1) continue
    const c = componentaLa(w.camere, cellOf(ag.x[s]!), cellOf(ag.y[s]!), ag.z[s]!)
    if (c !== null) out.set(c.id, (out.get(c.id) ?? 0) + 1)
  }
  return out
}
