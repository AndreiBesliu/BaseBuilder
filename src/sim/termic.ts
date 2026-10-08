/**
 * Graful termic al încăperilor și regimul lor permanent — S24-27, tăietura 2a (design-temperatura-v2 §4.2,
 * §5, §7) —, plus graful incremental al simulării din tăietura 2b (research/temperatura-t2b.md §6).
 *
 * Grafurile și regimul permanent sunt TRANSIENTE: nu intră în hash și nu se salvează. Graful t.2a și regimul le cere
 * viewer-ul (inspectorul, overlay-ul Temperatură), cel mult o dată pe secundă; graful incremental îl ține la zi
 * sincronizarea lumii (t.2b, commit-ul 4 îl leagă de tick și de comenzi).
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
 * Invariantul fețelor DESCHISE (recenzia FETE, L1-1): pe fiecare nod, Σ fețelor DESCHISA din rânduri ==
 * `deschise` al componentei (camere.ts, din `esteCer`) — două implementări ale aceleiași convenții. Ventilația
 * (gDeschis, 200 W/K pe față) clasificată drept EXT (~5,9 W/K) ar muta tăcut temperatura oricărei componente
 * deschise (o galerie cu gură: vara 10,1 → 2,6 °C), iar oracolul grafului e autoconsistent pe clasificare. Refuz
 * `INVARIANT_INCALCAT`.
 *
 * Graful e TRANSIENT, legat de OBIECTUL indexului (WeakMap), nu de o variabilă de modul cheiată pe epocă:
 * `epoca` e 1 în orice lume nouă (panoul, L4-1). Se reface când (`epoca`, `epocaFete`, regulile) diferă de
 * ștampila lui — `epocaFete` fiindcă fețele se schimbă fără `epoca` nouă (pământ pe acoperiș: 169 din 169
 * de loturi de suprafață care schimbă fețe ies din sincronizare fără `epoca++`; panoul, L2-1/L1-02/L4-1).
 * Altfel se refolosește. Graful t.2a rămâne al viewer-ului (inspectorul, overlay-ul U) și al regimului permanent (migrarea
 * din t.2b); simularea are graful incremental de mai jos.
 *
 * **Contribuția fiecărei bucăți** (Σg pe bin, Σg spre fiecare componentă de dincolo, fețele ei DESCHISE) se
 * memorează pe identitatea TABLOULUI ei de rânduri: fete.ts nu modifică un tablou de rânduri, îl înlocuiește,
 * deci un tablou neschimbat dă aceeași contribuție. Memoria e valabilă pe (`epoca`, regulile): componenta de
 * dincolo a unei muchii (`bComp`) și sloturile bucăților se schimbă doar cu o epocă nouă (o felie refăcută),
 * conductanțele doar cu alte reguli. O editare care schimbă DOAR fețele (`epocaFete`) recalculează deci numai
 * bucățile cu rânduri noi (recenzia GRAF, L3-2: pe M10, 7,4 → 1,65 ms); la o epocă nouă memoria se golește.
 * SINE se hotărăște la asamblare, pe nodul componentei.
 *
 * ## Graful incremental (ii) — t.2b §6
 *
 * Graful SIMULĂRII (pasul de 1 Hz, proveniența, salvarea îl citesc): ținut la zi pe LOT de `actualizeazaGraful`, pe care
 * `sincronizeazaLumea` o cheamă după fiecare `sincronizeazaCamere` — graful e funcție a indexului la fiecare graniță de
 * lot, deci o lume încărcată (graful construit integral) citește aceleași sume ca cea continuă [B5 §4.1].
 *
 * - **Nodurile sunt etichete stabile.** O componentă nouă moștenește nodul sursei-componente vechi de la care are cele
 *   mai multe celule (proveniența sincronizării); SOL / CER / NEC nu concurează; fără nicio sursă veche, nod nou.
 *   Egalitățile se rup GEOMETRIC: ancora componentei noi, apoi ancora sursei de dinainte de lot — niciodată pe slot sau
 *   pe etichetă [IDX-8]. Moștenirea schimbă doar costul (bucățile mutate), nu graful: o poartă K05 pe contoare o probează
 *   (fără ea, pe lărgire20 |S| crește cu așezarea: 589.760 pe 7×7, 1.950.924 pe 13×13).
 * - **Muchiile sunt dirijate**: fiecare capăt își adună fețele lui spre nodul celuilalt, iar simetria se verifică la
 *   citire. Regula t.2a „din capătul cu ancora mai mică" nu ține la delte: ancora se mută la o săpătură sub minimul ei.
 * - **Pe bucată**: ce a adunat (`AdunareBucata`, ca scăderea să fie exactă), contribuția memorată (perechile pe BUCATA de
 *   dincolo, valabilă cât înregistrarea de fețe și feliile de dincolo sunt aceleași obiecte) și indexul invers (cine are
 *   o pereche spre ea). C' pe nod = Σ contoarele de capacitate ale bucăților (`capacitateMu`, aceeași funcție ca la
 *   proveniență).
 * - **Delta** pe S = bucățile născute, moarte, mutate pe alt nod, vecinii lor din indexul invers și cele rescrise de D+:
 *   fiecare se scade exact și se adună din nou. Sumele sunt întregi exacte sub 2^53 pe bin și pe muchie, deci ordinea
 *   (iterarea pe Map / Set) nu contează.
 * - **Nu aruncă**: o ștampilă care nu e a lotului de dinainte sau un invariant încălcat în deltă → refacerea integrală de
 *   urgență, numărată (`refaceriDeUrgenta`). O deltă greșită FĂRĂ asimetrie nu se vede la citire; o prinde compararea cu
 *   graful integral (`comparaGrafulCuIntegral`, la `encode`) [IDX-4].
 *
 * ## Regimul permanent (§5)
 *
 * Temperatura la care AR ajunge fiecare încăpere cu rezervoarele de acum (fără inerție, fără oameni — t.2b):
 * Gauss–Seidel pe întregi, în ordinea ancorelor, pornit din `T_afara(tick)`:
 *
 *   T_i ← rot((Σ_r g_r·T_r + Σ_j g_ij·T_j) / (Σ_r g_r + Σ_j g_ij))
 *
 * cu rotunjirea la cel mai apropiat întreg, jumătatea DEPARTE de zero (simetrică: rot(−x) = −rot(x)), până la
 * o trecere fără nicio schimbare. **Plafonul** (1.000 de treceri, determinist; 783 la 30.000 de camere, măsurat):
 * dacă punctul fix nu e atins în el, regimul se REFUZĂ (`CAPACITATE_DEPASITA`), nu se întoarce cu cifre
 * neconvergente — la plafonul 20, un hotel 30×30×10 ar fi afișat 3,9 °C eroare (recenzia GRAF, L3-3).
 *
 * **Un regim pe (graf, tick).** Rezolvarea se memorează pe index, cheiată pe OBIECTUL grafului (refolosit doar
 * sub ștampila lui), seed, tick și plafon: overlay-ul și inspectorul (`canaleTermice`) împart aceeași rezolvare
 * (recenzia GRAF, L3-2). Regimul și agregarea pe componentă se citesc sub ACEEAȘI ștampilă: `canaleTermice` cere
 * regimul indexului de acum, nu primește unul din afară — un regim de acum o secundă lângă agregarea de acum a dat
 * 25 de refuzuri și 6 citiri ale altei încăperi din 80 (verificatorul L4-2).
 *
 * **Pornirea e mereu `T_afara(tick)`, nu soluția precedentă.** Pornirea caldă ar tăia trecerile de 4–6 ori pe
 * complexele de încăperi interioare (82 → 28, 783 → 131; recenzia GRAF, L3-2), dar punctul fix pe întregi NU e
 * unic (pe un hotel, pornind din 0 față de T_afara: 1–5 Q16 diferență), deci regimul ar depinde de istoria
 * cererilor, nu doar de starea lumii. `regimPermanent` rămâne o funcție a (stării, tick-ului): t.2b îl
 * migrează în stare. Numitorul e > 0 pentru orice nod
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
 * unui Outcome. Grupuri fixe (clasa de direcție, destinația, ușa, golul), ordonate după ponderea în ΣG
 * (geometrică, stabilă între tickuri fără editări; ordinea după flux s-ar schimba de 1–6 ori pe zi — panoul,
 * L5-1), încăperile vecine CONTOPITE într-un rând pe direcție, cel mult 3 rânduri + „rest". Fețele DESCHISE
 * (golul ușii) sunt grupul lor, nu se contopesc cu zidurile spre aerul de afară: DESCHISA și EXT au aceeași
 * destinație, iar pe o casă cu golul ușii neînchis golul e 87% din ΣG, citit „pereți 93%" (recenzia ECRAN,
 * L4-1). O față cu g = 0 (gDeschis 0 e content valid) nu poartă nimic și nu intră în niciun grup — un grup numai
 * din ele ar fi împărțit la 0 (recenzia GRAF, L3-1).
 */

import type { ReguliTermic, Rules } from './content.ts'
import type { Componenta, Felie, IndexCamere, SchimbareCamere, StampilaIndex } from './camere.ts'
import { cheieFelie, decodeazaCelula, FELIE, listaComponente, stampilaIndexului } from './camere.ts'
import type { ClasaDirId, ContoareMasa, FelFataId, InregistrareFete, RandFete } from './fete.ts'
import { ADANCIME_MAX, agregaComponenta, capacitateMu, ClasaDir, FelFata } from './fete.ts'
import { GRAD_Q16, mcLaQ16, tAfara, tSol } from './clima.ts'
import type { World } from './state.ts'
import { eSolNatural, Material, MATERIAL_MAX } from './terrain/chunk.ts'
import { WORLD_CELLS } from './terrain/terrain.ts'
import type { Outcome, Refusal } from './result.ts'
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

/**
 * Binul de rezervor al unui rând care nu e MUCHIE (§5): aerul de afară (DESCHISĂ, EXT), apa sau solul pe adâncimea
 * rândului (SOL, ADÂNC). Un singur loc pentru ambele grafuri (t.2a și incrementalul).
 */
function binulRandului(x: RandFete): number {
  if (x.fel === FelFata.DESCHISA || x.fel === FelFata.EXT) return BIN_AFARA
  if (x.fel === FelFata.APA) return BIN_APA + x.adancime
  return BIN_SOL + x.adancime // SOL, ADANC
}

/** z-ul celulei cu cheia 0: cheia unei celule e ((z − Z0) · L + y) · L + x. */
const Z0_CELULA = decodeazaCelula(0).z

/** Cursorul celulelor de dincolo ale rândurilor MUCHIE: felia ultimei celule (rândurile unei bucăți cad de obicei în aceeași). */
interface CursorDincolo {
  readonly idx: IndexCamere
  readonly z0: number
  ultimaCheie: number
  ultimaFelie: Felie | undefined
}

/**
 * Bucata celulei de dincolo (`cheieCelula`), ca `bucataLa`, cu felia memorată în cursor (`ultimaFelie` rămâne felia
 * celulei); −1 dacă celula nu e aer acoperit. Cheia trece de 2^31: o singură împărțire pe double (exactă), restul pe
 * întregi mici — `decodeazaCelula` face două `%` pe double, jumătate din costul refacerii pe M10.
 */
function bucataDeDincolo(c: CursorDincolo, dincolo: number): number {
  const q = Math.floor(dincolo / WORLD_CELLS)
  const px = dincolo - q * WORLD_CELLS
  const py = q % WORLD_CELLS
  const pz = (q - py) / WORLD_CELLS + c.z0
  const bx = Math.floor(px / FELIE)
  const by = Math.floor(py / FELIE)
  const kf = cheieFelie(bx, by, pz)
  if (kf !== c.ultimaCheie) {
    c.ultimaCheie = kf
    c.ultimaFelie = c.idx.felii.get(kf)
  }
  return c.ultimaFelie === undefined ? -1 : c.ultimaFelie.cel[(py - by * FELIE) * FELIE + (px - bx * FELIE)]!
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

/**
 * Contoarele grafurilor unui index (K05 se probează pe ele, nu pe timp). `refaceri` / `refolosiri`: graful t.2a
 * (`grafTermic`, refăcut la ștampila schimbată). Restul: graful incremental (ii) al simulării (t.2b §6).
 */
export interface StatGraf {
  refaceri: number
  refolosiri: number
  /** Delte aplicate (loturi care au schimbat ceva). */
  loturi: number
  /** Construcții integrale obișnuite: prima, la recalculul indexului, la alte reguli. */
  construiri: number
  /** Refaceri integrale de urgență: o ștampilă care nu e a lotului de dinainte, un invariant încălcat în deltă, o diferență la compararea cu integralul. */
  refaceriDeUrgenta: number
  /** |S|: bucăți scăzute și adunate din nou (născute ∪ moarte ∪ mutate ∪ vecinii lor din indexul invers ∪ rescrise). */
  S: number
  /** Contribuții calculate din rânduri (nu luate din memorie), la delte și la construcții. */
  recalculate: number
  /** Bucăți vii mutate pe alt nod. */
  mutate: number
  /** Bucăți parcurse la moștenire (membrii surselor pierdute, componentele cu nod nou). */
  parcurseMostenire: number
  noduriNoi: number
  mosteniri: number
  /** Perechi (bucată, bucata de dincolo) adunate. */
  perechiAdunate: number
}

function statGol(): StatGraf {
  return { refaceri: 0, refolosiri: 0, loturi: 0, construiri: 0, refaceriDeUrgenta: 0, S: 0, recalculate: 0, mutate: 0, parcurseMostenire: 0, noduriNoi: 0, mosteniri: 0, perechiAdunate: 0 }
}

/** Contoarele memoriilor grafului (antetul): contribuțiile bucăților și regimul pe (graf, tick). */
export interface StatMemorieTermica {
  /** Bucăți a căror contribuție s-a calculat la o refacere (nu s-a luat din memorie). */
  bucatiCalculate: number
  /** Rezolvări Gauss–Seidel ale regimului permanent. */
  regimuriRezolvate: number
  /** Cereri ale regimului servite din memorie (același graf, seed, tick, plafon). */
  regimuriRefolosite: number
}

/**
 * Contribuția unei bucăți la nodul ei (antetul), calculată o dată pe tabloul ei de rânduri: perechi plate
 * (bin, Σg) și (componenta de dincolo, Σg), în ordinea primei apariții, plus fețele DESCHISE. E chiar ramura
 * „ok" a calculului ei (`ok: true` lângă `Refusal`): un `accept` în jurul ei ar fi fost încă un obiect pe bucată, la
 * fiecare refacere completă.
 */
interface ContributieBucata {
  readonly ok: true
  /** Tabloul din care s-a calculat: identitatea lui e validarea. */
  readonly rr: readonly RandFete[]
  readonly binuri: readonly number[]
  readonly vecine: readonly number[]
  readonly deschise: number
}

/** Ultimul regim cerut pe un index (antetul, „un regim pe (graf, tick)"). */
interface MemorieRegim {
  readonly graf: GrafTermic
  readonly seed: number
  readonly tick: number
  readonly plafon: number
  readonly o: Outcome<RegimPermanent>
}

interface IntrareGraf {
  graf: GrafTermic | null
  readonly stat: StatGraf
  /** Contribuția fiecărei bucăți, pe slot; valabilă pe (`epocaContributii`, `reguliContributii`). */
  contributii: (ContributieBucata | undefined)[]
  epocaContributii: number
  reguliContributii: Rules | null
  regim: MemorieRegim | null
  readonly statMemorie: StatMemorieTermica
  /** Graful incremental (ii) al simulării (t.2b §6), ținut la zi pe lot de `actualizeazaGraful`. */
  inc: StareGraf | null
}

/** Graful fiecărui index, legat de OBIECTUL indexului — un index aruncat își ia graful cu el. */
const GRAFURI = new WeakMap<IndexCamere, IntrareGraf>()

function intrarea(idx: IndexCamere): IntrareGraf {
  let e = GRAFURI.get(idx)
  if (e === undefined) {
    e = {
      graf: null,
      stat: statGol(),
      inc: null,
      contributii: [],
      epocaContributii: -1,
      reguliContributii: null,
      regim: null,
      statMemorie: { bucatiCalculate: 0, regimuriRezolvate: 0, regimuriRefolosite: 0 },
    }
    GRAFURI.set(idx, e)
  }
  return e
}

/** Contoarele grafurilor unui index (o copie). Un index pe care nu l-a cerut nimeni are totul 0. */
export function statGraf(idx: IndexCamere): StatGraf {
  const e = GRAFURI.get(idx)
  return e === undefined ? statGol() : { ...e.stat }
}

/** Contoarele memoriilor grafului unui index (o copie). */
export function statMemorieTermica(idx: IndexCamere): StatMemorieTermica {
  const e = GRAFURI.get(idx)
  return e === undefined ? { bucatiCalculate: 0, regimuriRezolvate: 0, regimuriRefolosite: 0 } : { ...e.statMemorie }
}

/**
 * Graful termic al indexului: refolosit dacă ștampila lui (`epoca`, `epocaFete`, regulile) e cea de acum,
 * altfel reconstruit din cache-ul de fețe. Refuz `INVARIANT_INCALCAT` (cu cauza) dacă fețele nu se potrivesc
 * cu indexul — o muchie spre o celulă care nu e aer acoperit, o muchie asimetrică, un numitor 0, alte fețe
 * DESCHISE decât ale componentei.
 */
export function grafTermic(idx: IndexCamere, rules: Rules): Outcome<GrafTermic> {
  const e = intrarea(idx)
  const g = e.graf
  if (g !== null && g.epoca === idx.epoca && g.epocaFete === idx.epocaFete && g.reguli === rules) {
    e.stat.refolosiri++
    return accept(g)
  }
  e.stat.refaceri++
  // Contribuțiile bucăților țin cât (epoca, regulile): componenta de dincolo și sloturile se schimbă doar cu o
  // epocă nouă, conductanțele doar cu alte reguli (antetul).
  if (e.epocaContributii !== idx.epoca || e.reguliContributii !== rules) {
    // Un tablou nou, cât sloturile: scris pe sloturi împrăștiate, unul gol ar trece pe elemente-dicționar.
    e.contributii = new Array<ContributieBucata | undefined>(idx.bUrmator)
    e.epocaContributii = idx.epoca
    e.reguliContributii = rules
  }
  const nou = construiesteGraf(idx, rules, e.contributii, e.statMemorie)
  e.graf = nou.ok ? nou.value : null
  return nou
}

/**
 * Starea de lucru a construirii, într-un singur obiect: bucla fierbinte stă în `acumuleazaBucata`, o funcție
 * mică chemată pe fiecare bucată. Scrisă în corpul lui `construiesteGraf` (chemat o dată pe refacere), bucla
 * rula pe cod OSR care ieșea din optimizare la fiecare refacere (măsurat pe M10: 8,5 ms, față de ~3 ms așa).
 */
interface Lucru extends CursorDincolo {
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
  /** Contribuțiile bucăților (memoria intrării grafului), pe slot. */
  readonly contributii: (ContributieBucata | undefined)[]
  readonly statMemorie: StatMemorieTermica
  /** Fețele DESCHISE ale nodului curent: invariantul (antetul) le compară cu `deschise` al componentei. */
  deschise: number
  /**
   * Σg pe bin și spre fiecare componentă, al bucății care se calculează (golite după ea); listele = cheile atinse,
   * marcate. Nu o căutare în perechi: pe bucățile unui hub, cu zeci de vecine, ar fi O(rânduri × vecine).
   */
  readonly pBin: Float64Array
  readonly pBinAtins: Uint8Array
  readonly pBinLista: number[]
  readonly pComp: Float64Array
  readonly pCompAtins: Uint8Array
  readonly pCompLista: number[]
}

/**
 * Contribuția bucății cu rândurile `rr` (antetul). Refuz dacă un rând n-are conductanță sau dacă celula de
 * dincolo a unei muchii nu e aer acoperit al unei componente.
 */
function contributiaBucatii(l: Lucru, rr: readonly RandFete[]): ContributieBucata | Refusal {
  let deschise = 0
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
      // Celula de dincolo → bucată → componentă (§5). Nodul (și SINE) se hotărăsc la asamblare.
      const bd = bucataDeDincolo(l, x.dincolo)
      const vecina = bd < 0 ? -1 : l.idx.bComp[bd]!
      if (vecina < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'celula de dincolo a unei muchii nu e aer acoperit al unei componente', ...decodeazaCelula(x.dincolo) })
      if (l.pCompAtins[vecina] === 0) {
        l.pCompAtins[vecina] = 1
        l.pCompLista.push(vecina)
      }
      l.pComp[vecina] += G
      continue
    }
    if (x.fel === FelFata.DESCHISA) deschise += x.fete
    const k = binulRandului(x)
    if (l.pBinAtins[k] === 0) {
      l.pBinAtins[k] = 1
      l.pBinLista.push(k)
    }
    l.pBin[k] += G
  }
  // Perechile plate (cheie, Σg), în ordinea primei apariții; zgârietura se golește pentru bucata următoare.
  const binuri: number[] = []
  for (const k of l.pBinLista) {
    binuri.push(k, l.pBin[k]!)
    l.pBin[k] = 0
    l.pBinAtins[k] = 0
  }
  l.pBinLista.length = 0
  const vecine: number[] = []
  for (const c of l.pCompLista) {
    vecine.push(c, l.pComp[c]!)
    l.pComp[c] = 0
    l.pCompAtins[c] = 0
  }
  l.pCompLista.length = 0
  return { ok: true, rr, binuri, vecine, deschise }
}

/**
 * Contribuția bucății `b` a nodului `i` — din memorie dacă tabloul ei de rânduri e același, altfel calculată
 * acum —, adunată în `l`. Întoarce refuzul, sau null.
 */
function acumuleazaBucata(l: Lucru, i: number, b: number, rr: readonly RandFete[]): Refusal | null {
  let cb = l.contributii[b]
  if (cb === undefined || cb.rr !== rr) {
    const o = contributiaBucatii(l, rr)
    if (!o.ok) return o
    cb = o
    l.contributii[b] = cb
    l.statMemorie.bucatiCalculate++
  }
  l.deschise += cb.deschise
  const bins = cb.binuri
  for (let p = 0; p < bins.length; p += 2) {
    const k = bins[p]!
    if (l.binAtins[k] === 0) {
      l.binAtins[k] = 1
      l.atinse.push(k)
    }
    l.bin[k] += bins[p + 1]!
  }
  const vec = cb.vecine
  for (let p = 0; p < vec.length; p += 2) {
    const j = l.nodDupaComp[vec[p]!] ?? -1
    if (j < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'vecina unei muchii nu e un nod al grafului', vecina: vec[p]! })
    if (j === i) continue // SINE
    if (l.vecinAtins[j] === 0) {
      l.vecinAtins[j] = 1
      l.vecine.push(j)
    }
    l.spre[j] += vec[p + 1]!
  }
  return null
}

function construiesteGraf(idx: IndexCamere, rules: Rules, contributii: (ContributieBucata | undefined)[], statMemorie: StatMemorieTermica): Outcome<GrafTermic> {
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
    z0: Z0_CELULA,
    contributii,
    statMemorie,
    deschise: 0,
    pBin: new Float64Array(NR_BINURI),
    pBinAtins: new Uint8Array(NR_BINURI),
    pBinLista: [],
    pComp: new Float64Array(idx.cUrmator),
    pCompAtins: new Uint8Array(idx.cUrmator),
    pCompLista: [],
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
      const rr = idx.fete.inreg[b]?.randuri
      if (rr === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'bucata fara randuri de fete', bucata: b })
      const r = acumuleazaBucata(l, i, b, rr)
      if (r !== null) return r
    }
    // Invariantul fețelor DESCHISE (antetul): cache-ul de fețe și indexul, două implementări ale convenției.
    if (l.deschise !== comps[i]!.deschise) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'fetele DESCHISA nu sunt fetele deschise ale componentei', ancora: comps[i]!.ancora, cache: l.deschise, index: comps[i]!.deschise })
    l.deschise = 0
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
// graful incremental (ii) — t.2b §6
// ---------------------------------------------------------------------------------------------

/**
 * Contribuția unei bucăți la graful incremental: ca la t.2a (Σg pe bin, fețele DESCHISE), dar perechile MUCHIE sunt pe
 * BUCATA de dincolo, nu pe componentă — deci contribuția supraviețuiește unei epoci noi. E valabilă cât (1)
 * înregistrarea de fețe a bucății e același obiect (rândurile și contoarele se scriu împreună, fete.ts) și (2) fiecare
 * felie a celulelor de dincolo e același obiect `Felie` (obiectele nu se modifică; o felie refăcută schimbă bucata de
 * dincolo) [B5 §2.3: fără validarea (2), oracolul pică pe fuzz].
 */
interface ContributieInc {
  readonly ok: true
  readonly inreg: InregistrareFete
  /** (bin, Σg) plate, în ordinea primei apariții. */
  readonly binuri: readonly number[]
  /** (bucata de dincolo, Σg) plate, în ordinea primei apariții. */
  readonly perechi: readonly number[]
  /** Feliile celulelor de dincolo, distincte. */
  readonly felii: readonly Felie[]
  readonly deschise: number
}

/** Ce a ADUNAT o bucată, ca scăderea să fie exactă: aceeași contribuție, același nod, aceleași noduri de dincolo. */
interface AdunareBucata {
  readonly nod: number
  readonly c: ContributieInc
  /** Nodul bucății de dincolo al fiecărei perechi, la adunare. */
  readonly noduriDincolo: readonly number[]
  readonly volum: number
}

/**
 * Un nod al grafului incremental, citit de pasul de 1 Hz (temperatura.ts): sumele bucăților lui. Contoarele de capacitate
 * (`ContoareMasa`) dau C' cu `capacitateMu(nod, rules.termic.mase)` — aceeași funcție ca la proveniență.
 */
export interface NodTermic extends ContoareMasa {
  /** Componenta care îl ține (id-ul din indexul de acum). */
  readonly comp: number
  /** Ancora ei, la ultima actualizare: departajarea moștenirii la lotul următor. */
  readonly ancora: number
  /** Σg spre rezervoare pe bin (`BIN_*`), Q16 W/K; fără intrări 0. */
  readonly bin: ReadonlyMap<number, number>
  /** Σg spre fiecare nod vecin, din fețele ACESTUI capăt (muchie dirijată; simetria se verifică la citire); fără intrări 0. */
  readonly vec: ReadonlyMap<number, number>
  readonly deschise: number
  readonly volum: number
  /** Bucăți adunate; == `membri.size`. */
  readonly nb: number
  readonly membri: ReadonlySet<number>
}

interface NodLucru {
  comp: number
  ancora: number
  readonly bin: Map<number, number>
  readonly vec: Map<number, number>
  deschise: number
  volum: number
  nb: number
  nAer: number
  nConstr: number
  nSolMasiv: number
  nApa: number
  readonly membri: Set<number>
}

/**
 * Graful incremental (ii) al unui index (DERIVED, TRANSIENT; t.2b §6). Nodurile sunt ETICHETE stabile: un nod trece de la
 * o componentă la cea care moștenește cele mai multe celule de la ea, deci o renumerotare a componentelor nu mută nimic.
 * Nicio valoare nu depinde de etichetă (nu se salvează, nu intră în hash, nicio ordine nu se ia din ea): o lume încărcată
 * are alte etichete și același graf.
 */
export interface GrafIncremental {
  readonly reguli: Rules
  /** Ștampila indexului la ultima actualizare: `SchimbareCamere.inainte` a lotului următor trebuie să fie ea. */
  readonly stampila: StampilaIndex
  readonly noduri: ReadonlyMap<number, NodTermic>
  /** Componenta (id-ul din index) → eticheta nodului ei. */
  readonly nodComp: ReadonlyMap<number, number>
  /** M, marginea temperaturilor (Q16): un nod cu Σg · M ≥ 2^52 cere BigInt (antetul, „Exactitatea"). */
  readonly margineT: number
}

interface StareGraf extends GrafIncremental {
  stampila: StampilaIndex
  readonly noduri: Map<number, NodLucru>
  readonly nodComp: Map<number, number>
  /** Nodul fiecărei bucăți, pe slot (−1: niciunul). */
  nodB: Int32Array
  readonly adunari: (AdunareBucata | undefined)[]
  /** Memoria contribuțiilor, pe slot (validată la fiecare folosire). */
  readonly contrib: (ContributieInc | undefined)[]
  /** Indexul invers: bucata de dincolo → bucățile cu o pereche spre ea. */
  readonly inv: (Set<number> | undefined)[]
  /** Etichetele libere (LIFO). */
  readonly libere: number[]
  urm: number
  /** g pe față, pe (compoziție, fel, clasă). Compozițiile se adaugă cu timpul, deci un Map, nu un tablou fix. */
  readonly memoG: Map<number, number>
  readonly cursor: CursorDincolo
  readonly pBin: Float64Array
  readonly pBinAtins: Uint8Array
  readonly pBinLista: number[]
}

function grafGol(idx: IndexCamere, rules: Rules): StareGraf {
  return {
    reguli: rules,
    stampila: stampilaIndexului(idx),
    noduri: new Map(),
    nodComp: new Map(),
    margineT: margineTemperaturi(rules),
    nodB: new Int32Array(Math.max(64, idx.bUrmator)).fill(-1),
    adunari: [],
    contrib: [],
    inv: [],
    libere: [],
    urm: 0,
    memoG: new Map(),
    cursor: { idx, z0: Z0_CELULA, ultimaCheie: -1, ultimaFelie: undefined },
    pBin: new Float64Array(NR_BINURI),
    pBinAtins: new Uint8Array(NR_BINURI),
    pBinLista: [],
  }
}

function cresteNodB(g: StareGraf, b: number): void {
  if (b < g.nodB.length) return
  const n = new Int32Array(Math.max(b + 1, 2 * g.nodB.length)).fill(-1)
  n.set(g.nodB)
  g.nodB = n
}

/** Un nod gol pentru componenta `c`; eticheta din cele libere, altfel una nouă. */
function nodNou(g: StareGraf, c: Componenta): number {
  const s = g.libere.length > 0 ? g.libere.pop()! : g.urm++
  g.noduri.set(s, { comp: c.id, ancora: c.ancora, bin: new Map(), vec: new Map(), deschise: 0, volum: 0, nb: 0, nAer: 0, nConstr: 0, nSolMasiv: 0, nApa: 0, membri: new Set() })
  return s
}

/** Adună `d` la intrarea `k`; o intrare care ajunge la 0 dispare (un g 0 nu poartă nimic). */
function adaugaLa(m: Map<number, number>, k: number, d: number): void {
  if (d === 0) return
  const v = (m.get(k) ?? 0) + d
  if (v === 0) m.delete(k)
  else m.set(k, v)
}

function gPeFata(g: StareGraf, x: RandFete): number {
  const km = (x.compozitie * 8 + x.fel) * 4 + x.clasa
  let v = g.memoG.get(km)
  if (v === undefined) {
    v = conductantaFetei(g.reguli.termic, x.clasa, x.fel, g.cursor.idx.fete.compNumarari[x.compozitie]!)
    g.memoG.set(km, v)
  }
  return v
}

function contributiaInc(g: StareGraf, e: InregistrareFete): ContributieInc | Refusal {
  let deschise = 0
  const perechi = new Map<number, number>()
  const felii: Felie[] = []
  for (const x of e.randuri) {
    const g1 = gPeFata(g, x)
    if (g1 < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'fata fara conductanta (compozitie SOL fara exact o celula de sol)', compozitie: x.compozitie, fel: x.fel })
    const G = x.fete * g1
    if (x.fel === FelFata.MUCHIE) {
      const bd = bucataDeDincolo(g.cursor, x.dincolo)
      if (bd < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'celula de dincolo a unei muchii nu e aer acoperit', ...decodeazaCelula(x.dincolo) })
      const f = g.cursor.ultimaFelie!
      if (!felii.includes(f)) felii.push(f)
      perechi.set(bd, (perechi.get(bd) ?? 0) + G)
      continue
    }
    if (x.fel === FelFata.DESCHISA) deschise += x.fete
    const k = binulRandului(x)
    if (g.pBinAtins[k] === 0) {
      g.pBinAtins[k] = 1
      g.pBinLista.push(k)
    }
    g.pBin[k] += G
  }
  const binuri: number[] = []
  for (const k of g.pBinLista) {
    binuri.push(k, g.pBin[k]!)
    g.pBin[k] = 0
    g.pBinAtins[k] = 0
  }
  g.pBinLista.length = 0
  const per: number[] = []
  // determinism-ok: ordinea inserării (rândurile, sortate în fete.ts); se adună sume întregi exacte.
  for (const [bd, G] of perechi) per.push(bd, G)
  return { ok: true, inreg: e, binuri, perechi: per, felii, deschise }
}

/** Contribuția din memorie e încă a bucății: aceeași înregistrare de fețe și aceleași felii de dincolo. */
function contributieValida(c: ContributieInc, idx: IndexCamere, e: InregistrareFete): boolean {
  if (c.inreg !== e) return false
  for (const f of c.felii) if (idx.felii.get(f.cheie) !== f) return false
  return true
}

/** Adună bucata `b` (vie) la nodul ei, `g.nodB[b]`. Refuz dacă fețele nu se potrivesc cu indexul. */
function adunaBucata(g: StareGraf, idx: IndexCamere, b: number, st: StatGraf): Refusal | null {
  const s = g.nodB[b]!
  const n = g.noduri.get(s)
  if (n === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'bucata pe un nod inexistent', bucata: b, nod: s })
  const e = idx.fete.inreg[b]
  if (e === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'bucata fara randuri de fete', bucata: b })
  let c = g.contrib[b]
  if (c === undefined || !contributieValida(c, idx, e)) {
    const o = contributiaInc(g, e)
    if (!o.ok) return o
    c = o
    g.contrib[b] = c
    st.recalculate++
  }
  for (let p = 0; p < c.binuri.length; p += 2) adaugaLa(n.bin, c.binuri[p]!, c.binuri[p + 1]!)
  const volum = idx.bCelule[b]!
  n.deschise += c.deschise
  n.volum += volum
  n.nb++
  n.nAer += e.nAer
  n.nConstr += e.nConstr
  n.nSolMasiv += e.nSolMasiv
  n.nApa += e.nApa
  const noduriDincolo: number[] = []
  for (let p = 0; p < c.perechi.length; p += 2) {
    const bd = c.perechi[p]!
    const nd = g.nodB[bd] ?? -1
    if (nd < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'bucata de dincolo a unei muchii n-are nod', bucata: b, dincolo: bd })
    noduriDincolo.push(nd)
    let iv = g.inv[bd]
    if (iv === undefined) {
      iv = new Set()
      g.inv[bd] = iv
    }
    iv.add(b)
    if (nd !== s) adaugaLa(n.vec, nd, c.perechi[p + 1]!) // pe același nod: SINE
  }
  st.perechiAdunate += noduriDincolo.length
  g.adunari[b] = { nod: s, c, noduriDincolo, volum }
  return null
}

/** Scade exact ce a adunat bucata `b` (nimic, dacă n-a adunat). */
function scadeBucata(g: StareGraf, b: number): Refusal | null {
  const a = g.adunari[b]
  if (a === undefined) return null
  const n = g.noduri.get(a.nod)
  if (n === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'bucata adunata pe un nod sters', bucata: b, nod: a.nod })
  const c = a.c
  for (let p = 0; p < c.binuri.length; p += 2) adaugaLa(n.bin, c.binuri[p]!, -c.binuri[p + 1]!)
  n.deschise -= c.deschise
  n.volum -= a.volum
  n.nb--
  n.nAer -= c.inreg.nAer
  n.nConstr -= c.inreg.nConstr
  n.nSolMasiv -= c.inreg.nSolMasiv
  n.nApa -= c.inreg.nApa
  for (let p = 0; p < c.perechi.length; p += 2) {
    g.inv[c.perechi[p]!]?.delete(b)
    const nd = a.noduriDincolo[p >> 1]!
    if (nd !== a.nod) adaugaLa(n.vec, nd, -c.perechi[p + 1]!)
  }
  g.adunari[b] = undefined
  return null
}

/** Construcția integrală: un nod pe componentă (în ordinea ancorelor), toate bucățile adunate. */
function construiesteStare(idx: IndexCamere, rules: Rules, st: StatGraf): Outcome<StareGraf> {
  const g = grafGol(idx, rules)
  const comps = listaComponente(idx)
  for (const c of comps) {
    const s = nodNou(g, c)
    const n = g.noduri.get(s)!
    for (const b of c.bucati) {
      cresteNodB(g, b)
      g.nodB[b] = s
      n.membri.add(b)
    }
    g.nodComp.set(c.id, s)
  }
  for (const c of comps) {
    for (const b of c.bucati) {
      const r = adunaBucata(g, idx, b, st)
      if (r !== null) return r
    }
  }
  return accept(g)
}

/**
 * Bucățile cu o pereche spre `b` (indexul invers) intră în S: bucata lor de dincolo a murit sau s-a mutat pe alt nod, deci
 * perechea trebuie scăzută de pe nodul vechi și rezolvată din nou.
 */
function adaugaInversul(g: StareGraf, b: number, S: Set<number>): void {
  const iv = g.inv[b]
  // determinism-ok: doar adaugă într-o mulțime.
  if (iv !== undefined) for (const x of iv) S.add(x)
}

/** Un candidat la moștenire: componenta nouă `c` ar lua nodul `nod` al unei surse vechi, cu `n` celule de la ea. */
interface Candidat {
  readonly c: number
  readonly nod: number
  readonly n: number
  /** Ancora componentei noi. */
  readonly ac: number
  /** Ancora sursei, de dinainte de lot. */
  readonly an: number
}

/**
 * Delta pe un lot (§6; B5 §2.4, pe proveniența reală — panoul IDX):
 * 1. sursele fiecărei componente noi, traduse pe noduri ÎNAINTE de orice schimbare (`nodComp` e încă al indexului de
 *    dinainte); SOL / CER / NEC nu concurează;
 * 2. bucățile moarte ies din nodurile lor;
 * 3. MOȘTENIREA: perechile (componentă nouă, nod-sursă) în ordinea celulelor (descrescător), egalitățile rupte GEOMETRIC
 *    (ancora componentei noi, apoi ancora sursei de dinainte de lot) — niciodată pe slot sau pe etichetă; fiecare
 *    componentă și fiecare nod cel mult o dată; o componentă fără nod moștenit primește unul nou;
 * 4. mutările: toate bucățile unei componente cu nod nou, membrii surselor pierdute ajunși în componentă, bucățile născute;
 * 5. S = născute ∪ moarte ∪ mutate ∪ indexul invers al mutatelor și al moartelor ∪ rescrise: fiecare se scade exact și
 *    se adună din nou (contribuția din memorie, dacă e încă validă);
 * 6. nodurile golite dispar (cu sumele lor exact 0 — altfel deriva s-a văzut).
 * Întoarce refuzul primului invariant încălcat (graful e atunci pe jumătate actualizat: se reface integral).
 */
function aplicaDelta(g: StareGraf, idx: IndexCamere, sch: SchimbareCamere, st: StatGraf): Refusal | null {
  // Felia memorată de cursor e a indexului de la lotul trecut: o felie refăcută între timp e alt obiect sub aceeași cheie.
  g.cursor.ultimaCheie = -1
  g.cursor.ultimaFelie = undefined
  const S = new Set<number>()
  const golite = new Set<number>()
  // (1) Sursele, pe noduri.
  const cand: Candidat[] = []
  const surseNod = new Map<number, number[]>()
  for (const c of sch.noi) {
    const comp = idx.comp.get(c)
    if (comp === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'componenta noua inexistenta', comp: c })
    const lista: number[] = []
    const p = sch.prov.get(c)
    // determinism-ok: candidații se sortează mai jos într-o ordine totală (celule, ancora nouă, ancora veche).
    if (p !== undefined) for (const [s, n] of p) {
      if (s < 0) continue // SOL, CER, NEC: nu sunt componente vechi
      const nod = g.nodComp.get(s)
      if (nod === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'sursa veche fara nod', comp: c, sursa: s })
      lista.push(nod)
      cand.push({ c, nod, n, ac: comp.ancora, an: g.noduri.get(nod)!.ancora })
    }
    surseNod.set(c, lista)
  }
  // (2) Moartele.
  for (const b of sch.bucatiMoarte) {
    const s = g.nodB[b] ?? -1
    if (s >= 0) {
      g.noduri.get(s)!.membri.delete(b)
      g.nodB[b] = -1
      golite.add(s)
    }
    S.add(b)
    adaugaInversul(g, b, S)
  }
  // (3) Moștenirea.
  cand.sort((a, b) => b.n - a.n || a.ac - b.ac || a.an - b.an)
  const dat = new Map<number, number>()
  const luat = new Set<number>()
  for (const k of cand) {
    if (dat.has(k.c) || luat.has(k.nod)) continue
    dat.set(k.c, k.nod)
    luat.add(k.nod)
    st.mosteniri++
  }
  for (const c of sch.noi) {
    if (dat.has(c)) continue
    dat.set(c, nodNou(g, idx.comp.get(c)!))
    st.noduriNoi++
  }
  for (const id of sch.moarte) g.nodComp.delete(id)
  for (const c of sch.noi) {
    const s = dat.get(c)!
    const n = g.noduri.get(s)!
    n.comp = c
    n.ancora = idx.comp.get(c)!.ancora
    g.nodComp.set(c, s)
  }
  // (4) Mutările.
  const muta = (b: number, s: number): void => {
    const v = g.nodB[b]!
    if (v === s) return
    if (v >= 0) {
      g.noduri.get(v)!.membri.delete(b)
      golite.add(v)
      st.mutate++
      adaugaInversul(g, b, S)
    }
    g.nodB[b] = s
    g.noduri.get(s)!.membri.add(b)
    S.add(b)
  }
  for (const c of sch.noi) {
    const s = dat.get(c)!
    const surse = surseNod.get(c)!
    if (!surse.includes(s)) {
      for (const b of idx.comp.get(c)!.bucati) {
        st.parcurseMostenire++
        muta(b, s)
      }
      continue
    }
    for (const s2 of surse) {
      if (s2 === s) continue
      const m = g.noduri.get(s2)
      if (m === undefined) continue
      // determinism-ok: mutarea fiecărei bucăți nu depinde de ordine (copia, fiindcă `muta` scoate din mulțime).
      for (const b of [...m.membri]) {
        st.parcurseMostenire++
        if (idx.bComp[b] === c) muta(b, s)
      }
    }
  }
  for (const b of sch.bucatiNascute) {
    cresteNodB(g, b)
    const c = idx.bComp[b]!
    const s = c < 0 ? undefined : g.nodComp.get(c)
    if (s === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'bucata nascuta fara componenta cu nod', bucata: b, comp: c })
    muta(b, s)
  }
  for (const b of sch.bucatiRescrise) S.add(b)
  st.S += S.size
  // (5) Delta: tot ce era adunat pe S iese, apoi bucățile vii din S intră din nou, pe nodul lor de acum.
  // determinism-ok: sume întregi exacte (sub 2^53 pe bin și pe muchie); ordinea adunărilor nu contează.
  for (const b of S) {
    const r = scadeBucata(g, b)
    if (r !== null) return r
  }
  // determinism-ok: idem.
  for (const b of S) {
    if (idx.bVecini[b] === undefined) continue // moartă
    const c = idx.bComp[b]!
    if (c < 0 || g.nodB[b] !== g.nodComp.get(c)) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'bucata vie pe alt nod decat al componentei ei', bucata: b, comp: c })
    const r = adunaBucata(g, idx, b, st)
    if (r !== null) return r
  }
  // (6) Nodurile golite dispar; cele care au rămas cu membri trebuie să fie ale unei componente vii.
  for (const s of [...golite].sort((a, b) => a - b)) {
    const n = g.noduri.get(s)
    if (n === undefined) continue
    if (n.membri.size > 0) {
      if (g.nodComp.get(n.comp) !== s) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'nod cu bucati fara componenta', nod: s, comp: n.comp })
      continue
    }
    if (n.nb !== 0 || n.bin.size !== 0 || n.vec.size !== 0 || n.volum !== 0 || n.deschise !== 0 || n.nAer !== 0 || n.nConstr !== 0 || n.nSolMasiv !== 0 || n.nApa !== 0) {
      return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'nod golit cu sume ramase', nod: s, nb: n.nb, binuri: n.bin.size, muchii: n.vec.size })
    }
    if (g.nodComp.get(n.comp) === s) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'componenta pe un nod golit', nod: s, comp: n.comp })
    g.noduri.delete(s)
    g.libere.push(s)
  }
  return null
}

/** Construcția integrală, ținută pe index; `urgenta` alege contorul. Un refuz lasă indexul fără graf. */
function refaIntegral(idx: IndexCamere, rules: Rules, e: IntrareGraf, urgenta: boolean): Outcome<GrafIncremental> {
  if (urgenta) e.stat.refaceriDeUrgenta++
  else e.stat.construiri++
  const o = construiesteStare(idx, rules, e.stat)
  e.inc = o.ok ? o.value : null
  if (!o.ok) return o
  o.value.stampila = stampilaIndexului(idx)
  return o
}

/**
 * Delta grafului incremental pe un lot (t.2b §6): `sincronizeazaLumea` (temperatura.ts) o cheamă după FIECARE
 * `sincronizeazaCamere`, cu rezultatul ei, ca graful să fie funcție a indexului la fiecare graniță de lot (o lume încărcată
 * între doi pași îl reface de la zero și trebuie să citească același C' și aceleași sume).
 *
 * - Fără graf, la recalculul indexului sau la alte reguli: construcția integrală (`construiri`).
 * - O ștampilă care nu e `sch.inainte` (un lot pe care graful nu l-a văzut) sau un invariant încălcat în deltă: refacerea
 *   integrală de URGENȚĂ (`refaceriDeUrgenta`) — nu aruncă, continuă pe graful bun.
 * - Altfel delta, în O(lot) (plus moștenirea, numărată în `parcurseMostenire`).
 * Refuz doar dacă nici construcția integrală nu merge (fețele nu se potrivesc cu indexul); indexul rămâne atunci fără graf.
 */
export function actualizeazaGraful(idx: IndexCamere, sch: SchimbareCamere, rules: Rules): Outcome<GrafIncremental> {
  const e = intrarea(idx)
  const g = e.inc
  if (g === null || g.reguli !== rules || sch.recalcul) return refaIntegral(idx, rules, e, false)
  const s = g.stampila
  const a = sch.inainte
  if (s.vazute !== a.vazute || s.epoca !== a.epoca || s.epocaFete !== a.epocaFete) return refaIntegral(idx, rules, e, true)
  if (sch.bucatiMoarte.length > 0 || sch.bucatiNascute.length > 0 || sch.bucatiRescrise.length > 0 || sch.noi.length > 0) {
    e.stat.loturi++
    if (aplicaDelta(g, idx, sch, e.stat) !== null) return refaIntegral(idx, rules, e, true)
  }
  g.stampila = stampilaIndexului(idx)
  return accept(g)
}

/**
 * Graful incremental al indexului, dacă e la zi: aceeași ștampilă (vazute, epoca, epocaFete) ca indexul și aceleași
 * reguli. Altfel refuz `INVARIANT_INCALCAT` — pasul de 1 Hz reface atunci integral (`refaGrafulDeUrgenta`).
 */
export function grafulIncremental(idx: IndexCamere, rules: Rules): Outcome<GrafIncremental> {
  const g = GRAFURI.get(idx)?.inc ?? null
  if (g === null) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'indexul n-are graf incremental' })
  if (g.reguli !== rules) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'graful incremental e al altor reguli' })
  const s = g.stampila
  if (s.vazute !== idx.vazute || s.epoca !== idx.epoca || s.epocaFete !== idx.epocaFete) {
    return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'graful incremental nu e la zi cu indexul', vazute: s.vazute, vazuteIndex: idx.vazute, epoca: s.epoca, epocaIndex: idx.epoca, epocaFete: s.epocaFete, epocaFeteIndex: idx.epocaFete })
  }
  return accept(g)
}

/** Refacerea integrală de urgență (numărată în `refaceriDeUrgenta`): pasul o cheamă la un graf care nu e la zi. */
export function refaGrafulDeUrgenta(idx: IndexCamere, rules: Rules): Outcome<GrafIncremental> {
  return refaIntegral(idx, rules, intrarea(idx), true)
}

/** Graful incremental construit integral pe `idx`, NEȚINUT pe index (oracolul și compararea de la encode). */
export function construiesteGrafIncremental(idx: IndexCamere, rules: Rules): Outcome<GrafIncremental> {
  const o = construiesteStare(idx, rules, statGol())
  if (!o.ok) return o
  o.value.stampila = stampilaIndexului(idx)
  return o
}

/**
 * Forma canonică a grafului incremental, independentă de etichete și de sloturi: un rând pe nod, în ordinea ancorelor —
 * prefixul e rândul t.2a (`formaCanonicaGraf`: ancora, volumul, binurile, Σg, BIG), urmat de contoarele de capacitate
 * și C' (μ) —, apoi muchiile pe ancore. Verificările LA CITIRE: fiecare nod e al unei componente vii care îl are ca nod,
 * cu același volum, aceeași ancoră și aceleași fețe deschise; nodurile sunt exact componentele; fiecare muchie are
 * aceeași sumă din ambele capete (simetria; fețele fiecărui capăt se adună separat). Altfel refuz `INVARIANT_INCALCAT`.
 */
export function formaCanonicaGrafIncremental(idx: IndexCamere, g: GrafIncremental): Outcome<string[]> {
  const mase = g.reguli.termic.mase
  const anc = new Map<number, number>()
  const noduri: [number, number, NodTermic][] = []
  // determinism-ok: rândurile se sortează pe ancoră mai jos.
  for (const [s, n] of g.noduri) {
    const c = idx.comp.get(n.comp)
    if (c === undefined || g.nodComp.get(n.comp) !== s) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'nod fara componenta', nod: s, comp: n.comp })
    if (n.ancora !== c.ancora || n.volum !== c.volum || n.nb !== n.membri.size) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'nodul nu se potriveste cu componenta', ancora: c.ancora, volum: c.volum, volumNod: n.volum })
    if (n.deschise !== c.deschise) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'fetele DESCHISA nu sunt fetele deschise ale componentei', ancora: c.ancora, cache: n.deschise, index: c.deschise })
    anc.set(s, c.ancora)
    noduri.push([c.ancora, s, n])
  }
  if (g.noduri.size !== idx.comp.size || g.nodComp.size !== idx.comp.size) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'nodurile nu sunt componentele indexului', noduri: g.noduri.size, componente: idx.comp.size, nodComp: g.nodComp.size })
  noduri.sort((a, b) => a[0] - b[0])
  const out: string[] = []
  const muchii: [number, number, number][] = []
  for (const [a, s, n] of noduri) {
    let sumaG = 0
    // determinism-ok: binurile se sortează; suma e întreagă exactă.
    const binuri = [...n.bin.entries()].sort((x, y) => x[0] - y[0])
    for (const [, v] of binuri) sumaG += v
    // determinism-ok: muchiile se sortează pe ancore; suma e întreagă exactă.
    for (const [t, G] of n.vec) {
      sumaG += G
      const at = anc.get(t)
      if (at === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'muchie spre un nod inexistent', ancora: a, nod: t })
      const inv = g.noduri.get(t)!.vec.get(s)
      if (inv !== G) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'muchie asimetrica', ancoraA: a, ancoraB: at, gA: G, gB: inv ?? -1 })
      if (a < at) muchii.push([a, at, G])
    }
    const big = sumaG * g.margineT >= MARGINE_NUMBER ? ' BIG' : ''
    out.push(`N ${a} v${n.volum} | ${binuri.map(([k, v]) => `${k}:${v}`).join(' ')} | ${sumaG}${big} | a${n.nAer} c${n.nConstr} s${n.nSolMasiv} w${n.nApa} C${capacitateMu(n, mase)}`)
  }
  muchii.sort((x, y) => x[0] - y[0] || x[1] - y[1])
  for (const [a, b, G] of muchii) out.push(`M ${a}-${b} ${G}`)
  return accept(out)
}

/**
 * Compararea „incremental == integral" pe ACELAȘI index (t.2b §6, la fiecare `encode`; 9–15 ms pe M10 [B5 §2.7]): o
 * deltă greșită fără asimetrie (binuri, C') ar lăsa lumea continuă să integreze pe un graf greșit, iar cea încărcată pe
 * unul refăcut — M5 ar diverge fără alarmă [IDX-4]. Egale → graful incremental, neatins. Diferite (sau graful lipsește,
 * nu e la zi, ori refuză la citire) → graful integral îl ÎNLOCUIEȘTE, `refaceriDeUrgenta` crește și se întoarce refuzul
 * `INVARIANT_INCALCAT` cu prima linie diferită (de jurnalizat); graful indexului e atunci cel bun. Refuzul construcției
 * integrale (fețele nu se potrivesc cu indexul) lasă indexul fără graf.
 */
export function comparaGrafulCuIntegral(idx: IndexCamere, rules: Rules): Outcome<GrafIncremental> {
  const e = intrarea(idx)
  const nou = construiesteStare(idx, rules, statGol())
  if (!nou.ok) {
    e.inc = null
    return nou
  }
  nou.value.stampila = stampilaIndexului(idx)
  const fi = formaCanonicaGrafIncremental(idx, nou.value)
  if (!fi.ok) {
    e.inc = null
    return fi
  }
  const g = e.inc
  let diferenta = 'graful incremental lipseste'
  if (g !== null) {
    const la = grafulIncremental(idx, rules)
    const fg = la.ok ? formaCanonicaGrafIncremental(idx, g) : la
    if (!fg.ok) diferenta = String(fg.params.motiv)
    else {
      let i = 0
      while (i < fg.value.length && i < fi.value.length && fg.value[i] === fi.value[i]) i++
      if (i === fg.value.length && i === fi.value.length) return accept(g)
      diferenta = (fg.value[i] ?? '(lipsa)').slice(0, 160)
    }
  }
  e.stat.refaceriDeUrgenta++
  e.inc = nou.value
  return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'graful incremental difera de cel integral', linie: diferenta, noduri: nou.value.noduri.size })
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
 * nodurile, cel mult `plafon` treceri. `totulPeBigInt` rezolvă și nodurile mici pe BigInt (referința testelor;
 * rezultatul e același).
 */
export function rezolvaRegim(g: GrafTermic, tRez: ArrayLike<number>, tStart: number, totulPeBigInt = false, plafon = PLAFON_TRECERI): SolutieRegim {
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
  while (schimbari > 0 && treceri < plafon) {
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

/**
 * Regimul permanent la un tick. ÎMPĂRȚIT între cererile cu același (graf, seed, tick, plafon) — antetul —, deci
 * `t` și `tRez` se citesc, nu se scriu.
 */
export interface RegimPermanent extends SolutieRegim {
  readonly graf: GrafTermic
  readonly tick: number
  readonly tAfaraQ16: number
  /** Temperaturile binurilor la tick (Q16 °C). */
  readonly tRez: Int32Array
}

/**
 * Regimul permanent al încăperilor lumii la `tick` (§5): unde AR ajunge temperatura fiecărei componente cu
 * rezervoarele de acum. Fără inerție și fără oameni (t.2b). Pornit MEREU din `T_afara(tick)` (antetul): o
 * funcție a stării, nu a istoriei cererilor. Memorat pe (graf, seed, tick, plafon): overlay-ul și inspectorul
 * împart rezolvarea. Refuz dacă graful refuză (fețe nepotrivite) și `CAPACITATE_DEPASITA` dacă Gauss–Seidel nu
 * ajunge la punctul fix în `plafon` treceri — cifre neconvergente nu ies de aici.
 */
export function regimPermanent(w: World, rules: Rules, tick: number, plafon = PLAFON_TRECERI): Outcome<RegimPermanent> {
  const go = grafTermic(w.camere, rules)
  if (!go.ok) return go
  const g = go.value
  const e = intrarea(w.camere)
  const m = e.regim
  if (m !== null && m.graf === g && m.seed === w.seed && m.tick === tick && m.plafon === plafon) {
    e.statMemorie.regimuriRefolosite++
    return m.o
  }
  e.statMemorie.regimuriRezolvate++
  const tRez = temperaturiRezervoare(w.seed, tick, rules)
  const s = rezolvaRegim(g, tRez, tRez[BIN_AFARA]!, false, plafon)
  let o: Outcome<RegimPermanent>
  if (!s.convergent) o = refuse(Reason.CAPACITATE_DEPASITA, { motiv: 'regimul permanent nu converge in plafonul de treceri', treceri: s.treceri, noduri: g.n })
  else o = accept({ ...s, graf: g, tick, tAfaraQ16: tRez[BIN_AFARA]!, tRez })
  e.regim = { graf: g, seed: w.seed, tick, plafon, o }
  return o
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
  /**
   * Fețe DESCHISE (golul, ventilația), nu zid: DESCHISA și EXT au aceeași destinație, deci fără cheia asta golul
   * se contopea cu pereții și se numea „pereți" (antetul).
   */
  readonly deschis: boolean
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
  /** Cel mult 3, după pondere (descrescător), apoi după (clasă, destinație, ușă, gol). */
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
  deschis: boolean
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
    // O față fără conductanță (gDeschis 0 e content valid) nu poartă nimic din ΣG; un grup numai din ele ar
    // împărți la 0 la temperatura destinației (antetul).
    if (G === 0) continue
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
    const deschis = x.fel === FelFata.DESCHISA
    // Cheile de dinainte de `deschis`, dublate: departajările dintre grupurile vechi rămân în aceeași ordine.
    const k = ((x.clasa * 8 + dest) * 2 + (usa ? 1 : 0)) * 2 + (deschis ? 1 : 0)
    let gr = grupuri.get(k)
    if (gr === undefined) {
      gr = { clasa: x.clasa, destinatie: dest, usa, deschis, g: 0, gt: 0n, fete: 0, peCompozitie: new Map() }
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
      deschis: gr.deschis,
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
