/**
 * Graful termic al încăperilor și regimul lor permanent — S24-27, tăietura 2a (design-temperatura-v2 §4.2,
 * §5, §7).
 *
 * În t.2a NIMIC din simulare nu citește ce e aici: graful și regimul permanent sunt TRANSIENTE, nu intră în
 * hash și nu se salvează; le cere viewer-ul (inspectorul, overlay-ul Temperatură), cel mult o dată pe secundă.
 * Hash-urile de referință nu se mișcă.
 *
 * ## Conductanța unei fețe (§4.2), pe întregi
 *
 * Din rândul cache-ului de fețe (fete.ts): clasa de direcție, felul și compoziția (multisetul celulelor de
 * hotar de pe drum). R în miimi de m²K/W (content `termic`), g în Q16 W/K pe fața de 1 m²:
 * `g = floor(2^16 · 1000 / R_total)`. Calculul se face pe R DUBLAT, ca R(s)/2 al fețelor SOL să rămână
 * întreg: `g = floor(2^17 · 1000 / 2R_total)` — aceeași valoare pentru orice R_total întreg.
 *
 * | felul    | R_total                                                    |
 * |----------|------------------------------------------------------------|
 * | MUCHIE   | R_si(d) + ΣR(toate celulele) + R_si(opus d) — fără R_se     |
 * | SOL      | R_si(d) + ΣR(celulele construite) + R(s)/2                  |
 * | EXT      | R_si(d) + ΣR + R_se                                        |
 * | APA      | R_si(d) + ΣR                                               |
 * | ADÂNC    | R_si(d) + ΣR (cele K celule)                               |
 * | DESCHISĂ | — : g = gDeschis (ventilația)                              |
 *
 * La SOL compoziția conține celula de sol `s` ca SINGURUL material de sol natural (fete.ts); altfel rândul e
 * un defect, nu o față (refuz). SUB_BAZA și MARGINE intră deja în compoziție ca ROCA.
 *
 * ## Graful (§5)
 *
 * Nodurile = componentele indexului, în ordinea ancorelor. Pe fiecare nod, Σg spre rezervoare într-un TABLOU
 * CANONIC de binuri: aerul de afară (DESCHISĂ și EXT), solul pe adâncimea 0..64 (SOL și ADÂNC) și apa pe
 * adâncimea 0..64; ținut rar (doar binurile atinse, crescător). Muchiile cameră–cameră se iau O SINGURĂ DATĂ,
 * din capătul cu ancora mai mică; suma din celălalt capăt se calculează și ea și trebuie să fie IDENTICĂ
 * (R_si(d) + R_si(opus d) e simetric, iar drumul invers trece prin aceleași celule) — altfel refuz: adunarea
 * fețelor din ambele capete dublează G, iar g-ul luat din fiecare capăt cu R_si-ul lui creează energie
 * (panoul, L1-05). Celula de dincolo a unei muchii e aer acoperit al unei componente vii; altfel refuz
 * `INVARIANT_INCALCAT` cu cauza, nu o muchie spre `bComp[−1]`.
 *
 * Graful e TRANSIENT, legat de OBIECTUL indexului (WeakMap), nu de o variabilă de modul cheiată pe epocă:
 * `epoca` e 1 în orice lume nouă (panoul, L4-1). Se reface când (`epoca`, `epocaFete`, regulile) diferă de
 * ștampila lui — `epocaFete` fiindcă fețele se schimbă fără `epoca` nouă (pământ pe acoperiș: 169 din 169
 * de loturi de suprafață care schimbă fețe ies din sincronizare fără `epoca++`; panoul, L2-1/L1-02/L4-1).
 * Altfel se refolosește. Graful incremental cu noduri stabile e pentru t.2b.
 *
 * ## Regimul permanent (§5)
 *
 * Temperatura la care AR ajunge fiecare încăpere cu rezervoarele de acum (fără inerție, fără oameni — t.2b):
 * Gauss–Seidel pe întregi, în ordinea ancorelor, pornit din `T_afara(tick)`:
 *
 *   T_i ← rot((Σ_r g_r·T_r + Σ_j g_ij·T_j) / (Σ_r g_r + Σ_j g_ij))
 *
 * cu rotunjirea la cel mai apropiat întreg, jumătatea DEPARTE de zero (simetrică: rot(−x) = −rot(x)), până la
 * o trecere fără nicio schimbare (plafon: 1.000 de treceri, determinist). Numitorul e > 0 pentru orice nod
 * (lema: fața de sus a celei mai înalte celule nu e SINE, iar orice g e ≥ 1 în domeniul din content) —
 * altfel refuz la construire. Câtul Σ g_r·T_r / Σ g_r fără muchii NU se folosește nicăieri (0/0 pe debaraua
 * din mijlocul unei case cu trei niveluri; panoul, L1-03).
 *
 * ### Exactitatea: 2^53
 *
 * T e în Q16 °C (|T| ≤ M, marginea din content: media + amplitudinile, ~2^21,5), g în Q16 W/K. Pe un nod
 * mare Σg ajunge la ~2^34 (mina de 192×192×3: 123.286 de fețe), deci Σ g·T trece de 2^53 și o sumă pe
 * Number ar ieși dependentă de ordine. Marginea se calculează PE NOD la construirea grafului: dacă
 * Σg · M < 2^52, numărătorul, numitorul și câtul sunt întregi exacți în Number; altfel nodul se rezolvă pe
 * BigInt (același rezultat, mai scump). Toate temperaturile de pe parcurs sunt medii ponderate rotunjite ale
 * unor valori din [min T_r, max T_r], deci rămân în margine.
 *
 * ## Canalele (§5, §6)
 *
 * `canaleTermice`: pe ce „stă" temperatura unei încăperi — DATE, nu text, ca t.3 să le pună în parametrii
 * unui Outcome. Grupuri fixe (clasa de direcție, destinația, ușa), ordonate după ponderea în ΣG (geometrică,
 * stabilă între tickuri fără editări; ordinea după flux s-ar schimba de 1–6 ori pe zi — panoul, L5-1),
 * încăperile vecine CONTOPITE într-un rând pe direcție, cel mult 3 rânduri + „rest".
 */

import type { ReguliTermic, Rules } from './content.ts'
import type { Felie, IndexCamere } from './camere.ts'
import { cheieFelie, decodeazaCelula, FELIE, listaComponente } from './camere.ts'
import type { ClasaDirId, FelFataId, RandFete } from './fete.ts'
import { ADANCIME_MAX, agregaComponenta, ClasaDir, FelFata } from './fete.ts'
import { GRAD_Q16, mcLaQ16, tAfara, tSol } from './clima.ts'
import type { World } from './state.ts'
import { eSolNatural, Material, MATERIAL_MAX } from './terrain/chunk.ts'
import { WORLD_CELLS } from './terrain/terrain.ts'
import type { Outcome } from './result.ts'
import { accept, Reason, refuse } from './result.ts'

// ---------------------------------------------------------------------------------------------
// binurile de rezervor
// ---------------------------------------------------------------------------------------------

/** Câte adâncimi are tabelul solului: 0..ADANCIME_MAX. */
const NR_ADANCIMI = ADANCIME_MAX + 1
/** Binul aerului de afară (fețele DESCHISE și EXT). */
export const BIN_AFARA = 0
/** Binul solului la adâncimea d e `BIN_SOL + d` (fețele SOL și ADÂNC). */
export const BIN_SOL = 1
/** Binul apei la adâncimea d e `BIN_APA + d`. */
export const BIN_APA = BIN_SOL + NR_ADANCIMI
export const NR_BINURI = BIN_APA + NR_ADANCIMI

/** Plafonul trecerilor Gauss–Seidel (§5): determinist, nu un număr de joc. */
export const PLAFON_TRECERI = 1000

/** 2^52: sub ea, Σ g·T e exactă în Number (marginea pe nod; antetul). */
const MARGINE_NUMBER = 4_503_599_627_370_496

/** 2^17 · 1000: g = floor(2^16 · 1000 / R) = floor(2^17 · 1000 / 2R). */
const NUMARATOR_G_DUBLU = 131_072_000

// ---------------------------------------------------------------------------------------------
// conductanța
// ---------------------------------------------------------------------------------------------

function rSi(t: ReguliTermic, clasa: ClasaDirId): number {
  return clasa === ClasaDir.SUS ? t.rSiSusMiimi : clasa === ClasaDir.JOS ? t.rSiJosMiimi : t.rSiLateralMiimi
}

/** Clasa opusă: SUS ↔ JOS, LAT ↔ LAT (capătul celălalt al unei muchii). */
function opusa(clasa: ClasaDirId): ClasaDirId {
  return clasa === ClasaDir.SUS ? ClasaDir.JOS : clasa === ClasaDir.JOS ? ClasaDir.SUS : ClasaDir.LAT
}

/**
 * Conductanța unei fețe de 1 m², în Q16 W/K, din (clasă, fel, compoziție) și content (tabelul din antet).
 * `numarari` = celulele drumului pe `MaterialId` (`compozitia(idx, id).numarari`). −1 = fața nu are
 * conductanță: SINE, sau un rând SOL a cărui compoziție nu are exact o celulă de sol (un defect al cache-ului).
 */
export function conductantaFetei(t: ReguliTermic, clasa: ClasaDirId, fel: FelFataId, numarari: ArrayLike<number>): number {
  if (fel === FelFata.DESCHISA) return Math.floor((t.gDeschisMilliWPeK * GRAD_Q16) / 1000)
  if (fel === FelFata.SINE) return -1
  let r2 = 2 * rSi(t, clasa)
  let sol = 0
  for (let m = 0; m < numarari.length; m++) {
    const c = numarari[m]!
    if (c === 0) continue
    const r = t.material[m] ?? 0
    if (fel === FelFata.SOL && eSolNatural(m)) {
      sol += c
      r2 += c * r
    } else r2 += 2 * c * r
  }
  if (fel === FelFata.MUCHIE) r2 += 2 * rSi(t, opusa(clasa))
  else if (fel === FelFata.EXT) r2 += 2 * t.rSeMiimi
  else if (fel === FelFata.SOL && sol !== 1) return -1
  return Math.floor(NUMARATOR_G_DUBLU / r2)
}

/**
 * Marginea temperaturilor, în Q16 °C: |T| ≤ M pentru orice rezervor la orice tick (aerul: media + amplitudinea
 * anului și a zilei + valul de frig; solul: media + ΔT_adânc + amplitudinea anului), cu 1 °C rezervă pentru
 * rotunjiri. Pe ea stă alegerea Number / BigInt (antetul).
 */
export function margineTemperaturi(rules: Rules): number {
  const c = rules.clima
  const abs = (v: number): number => (v < 0 ? -v : v)
  return mcLaQ16(abs(c.tMedieMc) + abs(c.amplitudineAnMc) + abs(c.amplitudineZiMc) + abs(c.valFrig.amplitudineMc) + abs(c.deltaAdancMc)) + GRAD_Q16
}

// ---------------------------------------------------------------------------------------------
// graful
// ---------------------------------------------------------------------------------------------

/**
 * Graful termic al unui index (TRANSIENT). Nodurile sunt în ordinea ancorelor; g în Q16 W/K.
 * Valabil cât timp (`epoca`, `epocaFete`) ale indexului sunt cele din ștampilă.
 */
export interface GrafTermic {
  readonly epoca: number
  readonly epocaFete: number
  /** Regulile cu care s-a construit (conductanțele și marginea). */
  readonly reguli: Rules
  /** Câte noduri (componente). */
  readonly n: number
  /** Id-ul componentei (slotul din index) al fiecărui nod. */
  readonly comp: Int32Array
  readonly ancora: Float64Array
  readonly volum: Int32Array
  /** Nodul fiecărei componente vii, pe slot (−1 = slot liber). */
  readonly nodDupaComp: Int32Array
  /** Rezervoarele nodului i: `rezBin/rezG[rezStart[i] .. rezStart[i+1])`, binuri crescătoare. */
  readonly rezStart: Int32Array
  readonly rezBin: Uint8Array
  readonly rezG: Float64Array
  /** Muchiile, o dată, cu a < b (ordinea ancorelor), sortate pe (a, b). */
  readonly muchieA: Int32Array
  readonly muchieB: Int32Array
  readonly muchieG: Float64Array
  /** Vecinătatea, în ambele sensuri: `vecNod/vecG[vecStart[i] .. vecStart[i+1])`. */
  readonly vecStart: Int32Array
  readonly vecNod: Int32Array
  readonly vecG: Float64Array
  /** Σ_r g_r + Σ_j g_ij pe nod: numitorul regimului, > 0. */
  readonly sumaG: Float64Array
  /** 1 = nodul se rezolvă pe BigInt (Σg · M ≥ 2^52). */
  readonly mare: Uint8Array
  /** M, marginea temperaturilor (Q16), cu care s-a decis `mare`. */
  readonly margineT: number
}

/** Contoarele refacerii (K05 se probează pe ele). */
export interface StatGraf {
  refaceri: number
  refolosiri: number
}

interface IntrareGraf {
  graf: GrafTermic | null
  readonly stat: StatGraf
}

/** Graful fiecărui index, legat de OBIECTUL indexului — un index aruncat își ia graful cu el. */
const GRAFURI = new WeakMap<IndexCamere, IntrareGraf>()

/** Contoarele grafului unui index (o copie). Un index pe care nu l-a cerut nimeni are 0 / 0. */
export function statGraf(idx: IndexCamere): StatGraf {
  const e = GRAFURI.get(idx)
  return e === undefined ? { refaceri: 0, refolosiri: 0 } : { ...e.stat }
}

/**
 * Graful termic al indexului: refolosit dacă ștampila lui (`epoca`, `epocaFete`, regulile) e cea de acum,
 * altfel reconstruit din cache-ul de fețe. Refuz `INVARIANT_INCALCAT` (cu cauza) dacă fețele nu se potrivesc
 * cu indexul — o muchie spre o celulă care nu e aer acoperit, o muchie asimetrică, un numitor 0.
 */
export function grafTermic(idx: IndexCamere, rules: Rules): Outcome<GrafTermic> {
  let e = GRAFURI.get(idx)
  if (e === undefined) {
    e = { graf: null, stat: { refaceri: 0, refolosiri: 0 } }
    GRAFURI.set(idx, e)
  }
  const g = e.graf
  if (g !== null && g.epoca === idx.epoca && g.epocaFete === idx.epocaFete && g.reguli === rules) {
    e.stat.refolosiri++
    return accept(g)
  }
  e.stat.refaceri++
  const nou = construiesteGraf(idx, rules)
  e.graf = nou.ok ? nou.value : null
  return nou
}

/**
 * Starea de lucru a construirii, într-un singur obiect: bucla fierbinte stă în `acumuleazaBucata`, o funcție
 * mică chemată pe fiecare bucată. Scrisă în corpul lui `construiesteGraf` (chemat o dată pe refacere), bucla
 * rula pe cod OSR care ieșea din optimizare la fiecare refacere (măsurat pe M10: 8,5 ms, față de ~3 ms așa).
 */
interface Lucru {
  readonly idx: IndexCamere
  readonly termic: ReguliTermic
  /** g pe față, pe (compoziție, fel, clasă); −2 = necalculat. */
  readonly memo: Float64Array
  readonly nodDupaComp: Int32Array
  /**
   * Σg pe bin, al nodului curent; `atinse` = binurile atinse, marcate în `binAtins` (nu „Σg ≠ 0": o față cu g 0,
   * în afara domeniului din content, ar fi pus binul de două ori în listă).
   */
  readonly bin: Float64Array
  readonly binAtins: Uint8Array
  readonly atinse: number[]
  /** Σg spre fiecare nod vecin, al nodului curent; `vecine` = nodurile atinse, marcate în `vecinAtins`. */
  readonly spre: Float64Array
  readonly vecinAtins: Uint8Array
  readonly vecine: number[]
  /** Felia ultimei celule de dincolo. */
  ultimaCheie: number
  ultimaFelie: Felie | undefined
  /** −Z_DEPL: cheia celulei e ((z − Z0) · L + y) · L + x. */
  readonly z0: number
}

/** Rândurile bucății `rr` ale nodului `i`, adunate în `l`. Întoarce refuzul, sau null. */
function acumuleazaBucata(l: Lucru, i: number, rr: readonly RandFete[]): Outcome<GrafTermic> | null {
  for (const x of rr) {
    const km = (x.compozitie * 8 + x.fel) * 4 + x.clasa
    let g1 = l.memo[km] ?? -1
    if (g1 === -2) {
      g1 = conductantaFetei(l.termic, x.clasa, x.fel, l.idx.fete.compNumarari[x.compozitie]!)
      l.memo[km] = g1
    }
    if (g1 < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'fata fara conductanta (compozitie SOL fara exact o celula de sol)', compozitie: x.compozitie, fel: x.fel })
    const G = x.fete * g1
    if (x.fel === FelFata.MUCHIE) {
      // Celula de dincolo → bucată → componentă → nod (§5), ca `bucataLa`, cu felia memorată. Cheia trece de
      // 2^31: o singură împărțire pe double (exactă), restul pe întregi mici — `decodeazaCelula` face două `%`
      // pe double, jumătate din costul refacerii pe M10.
      const q = Math.floor(x.dincolo / WORLD_CELLS)
      const px = x.dincolo - q * WORLD_CELLS
      const py = q % WORLD_CELLS
      const pz = (q - py) / WORLD_CELLS + l.z0
      const bx = Math.floor(px / FELIE)
      const by = Math.floor(py / FELIE)
      const kf = cheieFelie(bx, by, pz)
      if (kf !== l.ultimaCheie) {
        l.ultimaCheie = kf
        l.ultimaFelie = l.idx.felii.get(kf)
      }
      const bd = l.ultimaFelie === undefined ? -1 : l.ultimaFelie.cel[(py - by * FELIE) * FELIE + (px - bx * FELIE)]!
      const j = bd < 0 ? -1 : l.nodDupaComp[l.idx.bComp[bd]!] ?? -1
      if (j < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'celula de dincolo a unei muchii nu e aer acoperit al unei componente', x: px, y: py, z: pz })
      if (j === i) continue // SINE
      if (l.vecinAtins[j] === 0) {
        l.vecinAtins[j] = 1
        l.vecine.push(j)
      }
      l.spre[j] += G
      continue
    }
    let k: number
    if (x.fel === FelFata.DESCHISA || x.fel === FelFata.EXT) k = BIN_AFARA
    else if (x.fel === FelFata.APA) k = BIN_APA + x.adancime
    else k = BIN_SOL + x.adancime // SOL, ADANC
    if (l.binAtins[k] === 0) {
      l.binAtins[k] = 1
      l.atinse.push(k)
    }
    l.bin[k] += G
  }
  return null
}

function construiesteGraf(idx: IndexCamere, rules: Rules): Outcome<GrafTermic> {
  const comps = listaComponente(idx)
  const n = comps.length
  const comp = new Int32Array(n)
  const ancora = new Float64Array(n)
  const volum = new Int32Array(n)
  const nodDupaComp = new Int32Array(idx.cUrmator).fill(-1)
  for (let i = 0; i < n; i++) {
    const c = comps[i]!
    comp[i] = c.id
    ancora[i] = c.ancora
    volum[i] = c.volum
    nodDupaComp[c.id] = i
  }

  const l: Lucru = {
    idx,
    termic: rules.termic,
    // Compozițiile sunt câteva zeci, rândurile zeci de mii.
    memo: new Float64Array(idx.fete.compNumarari.length * 32).fill(-2),
    nodDupaComp,
    bin: new Float64Array(NR_BINURI),
    binAtins: new Uint8Array(NR_BINURI),
    atinse: [],
    spre: new Float64Array(n),
    vecinAtins: new Uint8Array(n),
    vecine: [],
    ultimaCheie: -1,
    ultimaFelie: undefined,
    z0: decodeazaCelula(0).z,
  }
  const rezStart = new Int32Array(n + 1)
  const rezBin: number[] = []
  const rezG: number[] = []
  const sumaRez = new Float64Array(n)
  // Muchiile: pe nodul i, sumele spre fiecare vecină j (în `l.spre`). Cele cu j > i se păstrează (capătul cu
  // ancora mai mică); cele cu j < i se COMPARĂ cu muchia (j, i) păstrată deja din capătul j.
  const muchieA: number[] = []
  const muchieB: number[] = []
  const muchieG: number[] = []
  const dinCapatulMic = new Map<number, number>()
  let verificate = 0

  for (let i = 0; i < n; i++) {
    rezStart[i] = rezBin.length
    for (const b of comps[i]!.bucati) {
      const rr = idx.fete.randuri[b]
      if (rr === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'bucata fara randuri de fete', bucata: b })
      const r = acumuleazaBucata(l, i, rr)
      if (r !== null) return r
    }
    l.atinse.sort((a, b) => a - b)
    let s = 0
    for (const k of l.atinse) {
      rezBin.push(k)
      rezG.push(l.bin[k]!)
      s += l.bin[k]!
      l.bin[k] = 0
      l.binAtins[k] = 0
    }
    l.atinse.length = 0
    sumaRez[i] = s
    l.vecine.sort((a, b) => a - b)
    for (const j of l.vecine) {
      const G = l.spre[j]!
      l.spre[j] = 0
      l.vecinAtins[j] = 0
      if (j > i) {
        muchieA.push(i)
        muchieB.push(j)
        muchieG.push(G)
        dinCapatulMic.set(j * n + i, G)
        continue
      }
      // Simetria (panoul, L1-05): aceeași sumă din celălalt capăt — R_si(d) + R_si(opus d) e simetric.
      const mic = dinCapatulMic.get(i * n + j)
      if (mic !== G) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'muchie asimetrica', ancoraA: ancora[j]!, ancoraB: ancora[i]!, gA: mic ?? -1, gB: G })
      verificate++
    }
    l.vecine.length = 0
  }
  rezStart[n] = rezBin.length
  if (verificate !== muchieA.length) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'muchie vazuta dintr-un singur capat', muchii: muchieA.length, verificate })

  // Muchiile ies deja sortate pe (a, b): nodurile în ordine, vecinele sortate.
  const m = muchieA.length
  const grad = new Int32Array(n)
  for (let e = 0; e < m; e++) {
    grad[muchieA[e]!]!++
    grad[muchieB[e]!]!++
  }
  const vecStart = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) vecStart[i + 1] = vecStart[i]! + grad[i]!
  const vecNod = new Int32Array(2 * m)
  const vecG = new Float64Array(2 * m)
  const pune = vecStart.slice(0, n)
  for (let e = 0; e < m; e++) {
    const a = muchieA[e]!
    const b = muchieB[e]!
    vecNod[pune[a]!] = b
    vecG[pune[a]!++] = muchieG[e]!
    vecNod[pune[b]!] = a
    vecG[pune[b]!++] = muchieG[e]!
  }

  const margineT = margineTemperaturi(rules)
  const sumaG = new Float64Array(n)
  const mare = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    let s = sumaRez[i]!
    for (let k = vecStart[i]!; k < vecStart[i + 1]!; k++) s += vecG[k]!
    if (!(s > 0)) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'numitorul regimului e 0 (nicio fata cu conductanta)', ancora: ancora[i]! })
    sumaG[i] = s
    mare[i] = s * margineT >= MARGINE_NUMBER ? 1 : 0
  }

  return accept({
    epoca: idx.epoca,
    epocaFete: idx.epocaFete,
    reguli: rules,
    n,
    comp,
    ancora,
    volum,
    nodDupaComp,
    rezStart,
    rezBin: Uint8Array.from(rezBin),
    rezG: Float64Array.from(rezG),
    muchieA: Int32Array.from(muchieA),
    muchieB: Int32Array.from(muchieB),
    muchieG: Float64Array.from(muchieG),
    vecStart,
    vecNod,
    vecG,
    sumaG,
    mare,
    margineT,
  })
}

/**
 * Forma canonică a grafului, independentă de sloturi: un rând pe nod (ancora, volumul, binurile, Σg) în
 * ordinea ancorelor, apoi muchiile pe ancore. Oracolul: graful folosit == graful unui index nou.
 */
export function formaCanonicaGraf(g: GrafTermic): string[] {
  const out: string[] = []
  for (let i = 0; i < g.n; i++) {
    const rez: string[] = []
    for (let k = g.rezStart[i]!; k < g.rezStart[i + 1]!; k++) rez.push(`${g.rezBin[k]}:${g.rezG[k]}`)
    out.push(`N ${g.ancora[i]} v${g.volum[i]} | ${rez.join(' ')} | ${g.sumaG[i]}${g.mare[i] === 1 ? ' BIG' : ''}`)
  }
  for (let e = 0; e < g.muchieA.length; e++) out.push(`M ${g.ancora[g.muchieA[e]!]}-${g.ancora[g.muchieB[e]!]} ${g.muchieG[e]}`)
  return out
}

// ---------------------------------------------------------------------------------------------
// regimul permanent
// ---------------------------------------------------------------------------------------------

/** rot(num / den) pe Number, den > 0, jumătatea departe de zero. Cere |num|, den < 2^52 (exacte). */
function rotunjitNumber(num: number, den: number): number {
  const a = num < 0 ? -num : num
  let q = Math.floor(a / den)
  let r = a - q * den
  // Împărțirea pe double e rotunjită: câtul poate ieși cu 1 peste sau sub cel întreg.
  if (r < 0) {
    q--
    r += den
  } else if (r >= den) {
    q++
    r -= den
  }
  if (2 * r >= den) q++
  return (num < 0 ? -q : q) + 0
}

/** rot(num / den) pe BigInt, den > 0, jumătatea departe de zero. */
function rotunjitBig(num: bigint, den: bigint): number {
  const neg = num < 0n
  const a = neg ? -num : num
  let q = a / den
  if (2n * (a - q * den) >= den) q++
  return (neg ? -Number(q) : Number(q)) + 0
}

/**
 * Temperaturile binurilor la un tick, în Q16 °C: aerul de afară, solul și apa pe adâncime (apa are
 * temperatura solului de la adâncimea ei, §4.2).
 */
export function temperaturiRezervoare(seed: number, tick: number, rules: Rules): Int32Array {
  const out = new Int32Array(NR_BINURI)
  out[BIN_AFARA] = tAfara(seed, tick, rules)
  for (let d = 0; d < NR_ADANCIMI; d++) {
    const v = tSol(d, tick, rules)
    out[BIN_SOL + d] = v
    out[BIN_APA + d] = v
  }
  return out
}

export interface SolutieRegim {
  /** T de echilibru pe nod (ordinea ancorelor), Q16 °C. */
  readonly t: Int32Array
  /** Treceri făcute; ultima n-a schimbat nimic dacă `convergent`. */
  readonly treceri: number
  readonly convergent: boolean
}

/**
 * Gauss–Seidel pe întregi pe un graf, cu rezervoarele date (`tRez`, pe bin) și pornind din `tStart` pe toate
 * nodurile. `totulPeBigInt` rezolvă și nodurile mici pe BigInt (referința testelor; rezultatul e același).
 */
export function rezolvaRegim(g: GrafTermic, tRez: ArrayLike<number>, tStart: number, totulPeBigInt = false): SolutieRegim {
  const n = g.n
  const big = new Uint8Array(n)
  const numRez = new Float64Array(n)
  const numRezBig: bigint[] = []
  const vecGBig: bigint[] = []
  const sumaGBig: bigint[] = []
  let oriceMare = false
  for (let i = 0; i < n; i++) {
    big[i] = totulPeBigInt || g.mare[i] === 1 ? 1 : 0
    if (big[i] === 1) {
      oriceMare = true
      let s = 0n
      for (let k = g.rezStart[i]!; k < g.rezStart[i + 1]!; k++) s += BigInt(g.rezG[k]!) * BigInt(tRez[g.rezBin[k]!]!)
      numRezBig[i] = s
      sumaGBig[i] = BigInt(g.sumaG[i]!)
    } else {
      let s = 0
      for (let k = g.rezStart[i]!; k < g.rezStart[i + 1]!; k++) s += g.rezG[k]! * tRez[g.rezBin[k]!]!
      numRez[i] = s
    }
  }
  if (oriceMare) for (let k = 0; k < g.vecG.length; k++) vecGBig[k] = BigInt(g.vecG[k]!)

  const T = new Int32Array(n).fill(tStart)
  let treceri = 0
  let schimbari = 1
  while (schimbari > 0 && treceri < PLAFON_TRECERI) {
    schimbari = 0
    treceri++
    for (let i = 0; i < n; i++) {
      let v: number
      if (big[i] === 0) {
        let num = numRez[i]!
        for (let k = g.vecStart[i]!; k < g.vecStart[i + 1]!; k++) num += g.vecG[k]! * T[g.vecNod[k]!]!
        v = rotunjitNumber(num, g.sumaG[i]!)
      } else {
        let num = numRezBig[i]!
        for (let k = g.vecStart[i]!; k < g.vecStart[i + 1]!; k++) num += vecGBig[k]! * BigInt(T[g.vecNod[k]!]!)
        v = rotunjitBig(num, sumaGBig[i]!)
      }
      if (v !== T[i]) {
        T[i] = v
        schimbari++
      }
    }
  }
  return { t: T, treceri, convergent: schimbari === 0 }
}

export interface RegimPermanent extends SolutieRegim {
  readonly graf: GrafTermic
  readonly tick: number
  readonly tAfaraQ16: number
  /** Temperaturile binurilor la tick (Q16 °C). */
  readonly tRez: Int32Array
}

/**
 * Regimul permanent al încăperilor lumii la `tick` (§5): unde AR ajunge temperatura fiecărei componente cu
 * rezervoarele de acum. Fără inerție și fără oameni (t.2b). Refuz doar dacă graful refuză (fețe nepotrivite).
 */
export function regimPermanent(w: World, rules: Rules, tick: number): Outcome<RegimPermanent> {
  const go = grafTermic(w.camere, rules)
  if (!go.ok) return go
  const tRez = temperaturiRezervoare(w.seed, tick, rules)
  const s = rezolvaRegim(go.value, tRez, tRez[BIN_AFARA]!)
  return accept({ ...s, graf: go.value, tick, tAfaraQ16: tRez[BIN_AFARA]!, tRez })
}

/** T de echilibru (Q16) al componentei cu id-ul (slotul) dat, sau null dacă nu e un nod al grafului. */
export function temperaturaComponentei(r: RegimPermanent, compId: number): number | null {
  const i = r.graf.nodDupaComp[compId] ?? -1
  return i < 0 ? null : r.t[i]!
}

// ---------------------------------------------------------------------------------------------
// canalele
// ---------------------------------------------------------------------------------------------

/** Destinația unui canal: unde duce drumul fețelor lui. */
export const Destinatie = { AFARA: 0, SOL: 1, APA: 2, INCAPERI: 3, ADANC: 4 } as const
export type DestinatieId = (typeof Destinatie)[keyof typeof Destinatie]
export const NUME_DESTINATIE: readonly string[] = ['AFARA', 'SOL', 'APA', 'INCAPERI', 'ADANC']

/** Cât face 100% în ponderi: Q16. */
export const PONDERE_TOTALA = 65536

export interface CanalTermic {
  readonly clasa: ClasaDirId
  /**
   * AFARA (DESCHISĂ și EXT), SOL, APA, INCAPERI (toate vecinele de pe direcție, contopite) sau ADANC — o față
   * prin K celule construite, numită separat („peste K m de <material>", nu „sol adânc").
   */
  readonly destinatie: DestinatieId
  /** Drumul trece printr-o ușă (compoziția are USA). */
  readonly usa: boolean
  /** Ponderea în ΣG, Q16 (65536 = 100%). Ponderile rândurilor + restul = 65536 exact. */
  readonly pondereQ16: number
  /** Σ g al grupului, Q16 W/K. */
  readonly gQ16: number
  /** Temperatura destinației, medie ponderată pe g, Q16 °C (vecinele: la echilibrul lor). */
  readonly tDestQ16: number
  /** Compoziția dominantă (cel mai mare g în grup): cheia canonică, de ex. `6x1` (fete.ts). */
  readonly compozitie: string
  /** Câte celule are compoziția dominantă (grosimea drumului). */
  readonly grosime: number
  /** Materialul cu cele mai multe celule în compoziția dominantă; −1 pentru drumul gol (DESCHISĂ, apă directă). */
  readonly material: number
  readonly fete: number
}

export interface CanaleTermice {
  readonly comp: number
  /** Echilibrul componentei (regimul permanent), Q16 °C. */
  readonly tQ16: number
  readonly tAfaraQ16: number
  /** ΣG al componentei, Q16 W/K (= numitorul regimului). */
  readonly sumaG: number
  /** Cel mult 3, după pondere (descrescător), apoi după (clasă, destinație, ușă). */
  readonly randuri: readonly CanalTermic[]
  /** Ce n-a încăput în cele 3 rânduri. */
  readonly rest: { readonly pondereQ16: number; readonly grupuri: number }
}

/** Câte rânduri arată canalele (§5): restul se adună într-un „rest". */
const RANDURI_CANALE = 3

interface Grup {
  clasa: ClasaDirId
  destinatie: DestinatieId
  usa: boolean
  g: number
  gt: bigint
  fete: number
  peCompozitie: Map<string, { g: number; num: readonly number[]; celule: number }>
}

/**
 * Canalele componentei `compId` la `tick` (§5): pe ce stă temperatura ei de echilibru. Rândurile vin din
 * cache-ul de fețe al simulării (agregate pe bucățile componentei), nu dintr-un mers al fețelor.
 */
export function canaleTermice(w: World, rules: Rules, compId: number, tick: number): Outcome<CanaleTermice> {
  const reg = regimPermanent(w, rules, tick)
  if (!reg.ok) return reg
  const r = reg.value
  const i = r.graf.nodDupaComp[compId] ?? -1
  const c = w.camere.comp.get(compId)
  if (i < 0 || c === undefined) return refuse(Reason.ENTITATE_INEXISTENTA, { camp: 'componenta', id: compId })
  const ag = agregaComponenta(w.camere, c)
  if (!ag.ok) return ag
  const t = rules.termic
  const grupuri = new Map<number, Grup>()
  for (const x of ag.value.randuri) {
    const cmp = w.camere.fete.compNumarari[x.compozitie]!
    const g1 = conductantaFetei(t, x.clasa, x.fel, cmp)
    if (g1 < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'fata fara conductanta', compozitie: x.compozitie, fel: x.fel })
    const G = x.fete * g1
    let dest: DestinatieId
    let tD: number
    if (x.fel === FelFata.MUCHIE) {
      dest = Destinatie.INCAPERI
      const j = r.graf.nodDupaComp[x.vecina] ?? -1
      if (j < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'vecina unei muchii nu e un nod al grafului', vecina: x.vecina })
      tD = r.t[j]!
    } else if (x.fel === FelFata.DESCHISA || x.fel === FelFata.EXT) {
      dest = Destinatie.AFARA
      tD = r.tRez[BIN_AFARA]!
    } else if (x.fel === FelFata.APA) {
      dest = Destinatie.APA
      tD = r.tRez[BIN_APA + x.adancime]!
    } else {
      dest = x.fel === FelFata.ADANC ? Destinatie.ADANC : Destinatie.SOL
      tD = r.tRez[BIN_SOL + x.adancime]!
    }
    const usa = (cmp[Material.USA] ?? 0) > 0
    const k = (x.clasa * 8 + dest) * 2 + (usa ? 1 : 0)
    let gr = grupuri.get(k)
    if (gr === undefined) {
      gr = { clasa: x.clasa, destinatie: dest, usa, g: 0, gt: 0n, fete: 0, peCompozitie: new Map() }
      grupuri.set(k, gr)
    }
    gr.g += G
    gr.gt += BigInt(G) * BigInt(tD)
    gr.fete += x.fete
    const cheie = w.camere.fete.compCheie[x.compozitie]!
    const pc = gr.peCompozitie.get(cheie)
    if (pc === undefined) {
      let celule = 0
      for (const v of cmp) celule += v
      gr.peCompozitie.set(cheie, { g: G, num: [...cmp], celule })
    } else pc.g += G
  }

  // Ordinea: ponderea (geometrică), apoi cheia grupului — stabilă între tickuri fără editări.
  const lista = [...grupuri.entries()].sort((a, b) => b[1].g - a[1].g || a[0] - b[0]).map((e) => e[1])
  let suma = 0
  for (const gr of lista) suma += gr.g
  const S = BigInt(suma)
  const Q = BigInt(PONDERE_TOTALA)
  // Ponderile pe sume cumulate rotunjite: se adună EXACT la 65536, iar fiecare e la ±1 de valoarea ei.
  const cumulat = (g: number): number => rotunjitBig(BigInt(g) * Q, S)
  const randuri: CanalTermic[] = []
  let cum = 0
  let prec = 0
  for (let k = 0; k < lista.length && k < RANDURI_CANALE; k++) {
    const gr = lista[k]!
    cum += gr.g
    const acum = cumulat(cum)
    // Compoziția dominantă: cel mai mare g; la egalitate, cheia canonică mai mică (nu id-ul, care ține de istorie).
    let dom = ''
    let domG = -1
    for (const [cheie, pc] of [...gr.peCompozitie.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      if (pc.g > domG) {
        dom = cheie
        domG = pc.g
      }
    }
    const pc = gr.peCompozitie.get(dom)!
    let material = -1
    for (let m = 0; m <= MATERIAL_MAX; m++) if ((pc.num[m] ?? 0) > 0 && (material < 0 || pc.num[m]! > pc.num[material]!)) material = m
    randuri.push({
      clasa: gr.clasa,
      destinatie: gr.destinatie,
      usa: gr.usa,
      pondereQ16: acum - prec,
      gQ16: gr.g,
      tDestQ16: rotunjitBig(gr.gt, BigInt(gr.g)),
      compozitie: dom,
      grosime: pc.celule,
      material,
      fete: gr.fete,
    })
    prec = acum
  }
  return accept({
    comp: compId,
    tQ16: r.t[i]!,
    tAfaraQ16: r.tAfaraQ16,
    sumaG: suma,
    randuri,
    rest: { pondereQ16: PONDERE_TOTALA - prec, grupuri: Math.max(0, lista.length - RANDURI_CANALE) },
  })
}
