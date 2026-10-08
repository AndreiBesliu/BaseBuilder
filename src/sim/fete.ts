/**
 * Fețele încăperilor — S24-27, tăietura 2a (design-temperatura-v2 §4.1, §4.2, §4.4).
 *
 * O FAȚĂ = o celulă de aer acoperit a unei componente (camere.ts) + un vecin pe una din cele 6 direcții
 * care NU e aer acoperit. Fețele interioare nu există. Pe fețe stă, din valul 2, graful termic: fiecare
 * față leagă componenta ei de un rezervor (aerul de afară, solul, apa) sau de altă componentă. În
 * tăietura 2a nimic din simulare nu citește fețele: cache-ul e TRANSIENT, nu intră în hash, nu se salvează.
 *
 * ## Clasa de direcție și felul (§4.1, §4.2)
 *
 * Fiecare față are o clasă de direcție explicită, SUS / JOS / LAT (lentila UI, L5-1: „pe unde pierde
 * căldura" se citește pe direcție). Felul vine din MERSUL pe normală prin hotar, pe CONVENȚIA CAMERELOR
 * (`camere.ts`, `esteAer`): sub baza ferestrei și în afara lumii e stâncă (aici: ROCA), peste fereastră e
 * aer — NU `materialAt`, care spune AER sub bază (o cameră săpată la baza ferestrei ar fi avut fețe „spre
 * cer" prin podea). Mersul străbate cel mult K celule de hotar și se oprește la prima celulă care nu e
 * hotar; felul, în ordinea din tabelul designului:
 *
 * | felul    | condiția                                                                         |
 * |----------|----------------------------------------------------------------------------------|
 * | DESCHISĂ | vecinul (lateral) e aer sub cer                                                  |
 * | MUCHIE   | drumul ajunge, în ≤ K celule de hotar, la aer acoperit al ALTEI componente       |
 * | SINE     | ... al aceleiași componente — se ignoră                                          |
 * | SOL      | altfel, drumul trece printr-o celulă de sol natural (`eSolNatural`)              |
 * | EXT      | altfel, drumul ajunge la aer de afară                                            |
 * | APA      | altfel, drumul ajunge la apă (sau fața dă direct în apă)                         |
 * | ADÂNC    | altfel: K celule construite și a K+1-a tot hotar                                 |
 *
 * MUCHIE e decisă ÎNAINTEA solului: două pivnițe la 6 m în rocă rămân legate. Apa e capăt de drum, ca
 * aerul: o pivniță săpată sub un iaz are fețele de sus APA, nu „aer de afară prin apă".
 *
 * **MUCHIE și SINE nu se deosebesc în cache.** Amândouă sunt „drumul ajunge la aer acoperit", cu celula de
 * dincolo; care componentă o ține se hotărăște la CITIRE (`agregaComponenta`). Altfel cache-ul ar ieși vechi
 * fără nicio editare în preajmă: o săpătură în celălalt capăt al așezării unește două camere, iar muchia
 * dintre ele devine SINE — la 50 de metri de orice drum D+.
 *
 * ## Adâncimea (§3, §4.2)
 *
 * `d = clamp(g_natural − z, 0, ADANCIME_MAX)`, pe solul natural al coloanei (heightfield-ul, pe care
 * săpatul nu-l schimbă). Clampată AICI, la scriere, nu doar în `tSol`: două fețe ADÂNC cu capătul la −11 și
 * la −10 m sunt același rând (T_sol(0)), iar tabelul nu se citește niciodată la indice negativ. În afara
 * lumii stânca e adâncă (`ADANCIME_MAX`).
 * - SOL: `d_ef = min(d(s), n_aer − 1)` pe PRIMA celulă de sol `s`, unde `n_aer` = câte celule mai sunt de la
 *   `s` până la aerul de afară pe același drum (∞ dacă nu ajunge în K+1): un perete natural subțire spre un
 *   versant păstrează o urmă de aer de afară (verificatorul L3-1).
 * - APA: `d` celulei de apă. ADÂNC: `d` capătului (a K+1-a celulă) — 0 pentru tot ce e zidit deasupra
 *   solului, adică T_sol(0) din tabel.
 *
 * ## Compoziția
 *
 * Multisetul materialelor de pe drum, până la capăt, internat într-un tabel DERIVED pe cache (37 de valori
 * pe M10, măsurat în design): id 0 = drumul gol. Pentru SOL compoziția INCLUDE celula de sol `s` — e
 * singurul material de sol din ea (celulele dinaintea lui `s` nu sunt sol, prin definiție) —, deci
 * conductanța `1/(R_si + ΣR(dinaintea lui s) + R(s)/2)` se calculează din (clasă, fel, compoziție). SUB_BAZA
 * și MARGINE intră ca ROCA. Cache-ul NU ține conductanța: R-urile vin din content (valul 2).
 *
 * ## Cache-ul pe bucată (§4.4), TRANSIENT
 *
 * Pe fiecare bucată a indexului, rândurile agregate pe (clasă, fel, compoziție, materialul primei celule,
 * adâncime / celula de dincolo), cu numărul de fețe. Ținut la zi în `sincronizeazaCamere`, pe ORICE lot cu
 * editări — și pe cel care nu reface nicio felie (pământ pe acoperiș, o podea pe sol deasupra unei pivnițe,
 * al doilea strat de acoperiș, un zid îngroșat pe blocul vecin: 169 din 169 de loturi de suprafață care
 * schimbă fețe ies devreme, măsurat de panou). Se reface:
 * - **bucățile feliilor refăcute**, cu o excepție, (b): o felie refăcută cu ACEEAȘI mulțime de celule și
 *   nemarcată de D+ își păstrează rândurile, mutate pe bucățile noi (partiția pe 4-conexitate ține doar de
 *   mulțime). Fără (b), un planșeu pus sub acoperișul unei hale de 30 m reagrega 30 de felii, deși fețele se
 *   schimbă pe 2;
 * - **bucățile marcate de D+** (mai jos).
 *
 * La recalculul complet al indexului (alt teren, depășirea jurnalului, `decode`) cache-ul se reface
 * integral; D+ nu citește inelul suprascris.
 *
 * ## D+ — ce fețe se schimbă la un lot (§4.4)
 *
 * Starea unei fețe ține doar de celulele de pe drumul ei (material, acoperire, poziția capătului). La un lot
 * se schimbă: materialul celulelor editate și acoperirea celulelor din rulajul de aer de sub ele (lema din
 * antetul `camere.ts`). Un drum care atinge o celulă schimbată `e` trece, de la fața lui până la `e`, numai
 * prin hotar — deci drumul INVERS, din `e`, ajunge la față în cel mult K+1 pași (K celule de hotar și celula
 * de aer de la capăt; cu K pași rămân 29–105 bucăți vechi, panoul L2-4). D+ = drumurile din fiecare celulă
 * editată și din rulajul de sub ea, pe 6 direcții, de K+1 pași, făcute DUPĂ refacerea feliilor; fiecare
 * marchează bucata primei celule de aer acoperit atinse și se oprește la prima celulă de aer.
 *
 * (a) Din rulajul de sub `e` se pleacă doar dacă deasupra lui `e`, în coloană, NU există după lot un hotar
 * needitat în lotul ăsta: unul ca ăsta era acolo și înainte, deci acoperirea rulajului n-a mișcat. Restricția
 * „naivă" (sari rulajul dacă vârful e deasupra lui `e`) e GREȘITĂ pe un lot cu două editări în aceeași
 * coloană: vârful nou poate fi chiar cealaltă editare (panoul, L2-5).
 *
 * Garda: un index fără nicio felie (scenariul standard, 0 componente) nu pornește niciun drum — fără ea, D+
 * costa +2 µs pe lot acolo unde sincronizarea costă 0,4 µs (verificatorul L2-1).
 *
 * `epocaFete` (pe index, lângă `epoca`) crește ori de câte ori D+ marchează cel puțin o bucată, și la
 * recalculul complet. `epoca` își păstrează sensul (s-a schimbat aerul acoperit). Graful din valul 2 se
 * reface când oricare dintre ele s-a mișcat.
 *
 * ## Capacitatea (t.2b §4): contoarele pe bucată
 *
 * `C = V·c_aer + Σ_fețe c(prima celulă de pe normală)`, cu fețele SINE și MUCHIE incluse. Masa unei fețe ține
 * doar de vecinul imediat (materialul lui pe convenția camerelor și adâncimea lui, `clamp(gNat − z, 0, 64)`):
 * construit → `cConstr`; sol natural masiv (`d ≥ dSolMasivM`) → `cSol`; sol natural de suprafață → `cConstr`;
 * apă → `cSol`; aer (acoperit: nu e față; de sub cer: DESCHISĂ) → 0. Un singur loc o spune: `clasaMasei`, iar
 * `capacitateCelulei` o aplică pe cei 6 vecini (B2 a măsurat: 6 vecini == mersul fețelor pe ~235.800 de celule).
 *
 * Fiecare bucată are în cache o ÎNREGISTRARE: rândurile ei și contoarele `nAer`, `nConstr`, `nSolMasiv`, `nApa`,
 * scrise împreună de `scrieRanduri`. Contoarele sunt un câmp al înregistrării, nu un tablou pe slot: ramura (b)
 * mută înregistrarea pe un slot NOU fără `scrieRanduri`, iar un contor pe slot ar fi rămas al vechiului ocupant
 * (panoul t.2b, IDX-1: C' greșit pe 7 din 10 salvări pe M10 lărgit). Indexul nu știe masele (ele țin de
 * content): contoarele sunt numărători, C' = Σ contoare × mase (`capacitateMu`).
 *
 * ## Importul circular cu camere.ts
 *
 * `camere.ts` cheamă de aici întreținerea, iar de aici se citesc cititorul de coloane și indexul. Ciclul e
 * sigur fiindcă niciunul dintre module nu folosește, la evaluarea lui (în afara funcțiilor), vreo legătură
 * venită din celălalt — de aceea nimic de mai jos nu calculează la nivelul modulului din `FELIE` & co.
 */

import { eSolNatural, Material, MATERIAL_MAX, VOXEL_LEVELS } from './terrain/chunk.ts'
import type { Terrain } from './terrain/terrain.ts'
import { WORLD_CELLS } from './terrain/terrain.ts'
import type { CititorCamere, Coloana, Componenta, Felie, IndexCamere } from './camere.ts'
import { bucataLa, cheieCelula, cititorCamere, coloana, decodeazaCelula, decodeazaFelie, FELIE } from './camere.ts'
import type { Outcome } from './result.ts'
import { accept, Reason, refuse } from './result.ts'
import type { MaseTermice } from './content.ts'
import { DEFAULT_RULES } from './content.ts'

/**
 * K implicit: câte celule de hotar străbate mersul pe normală (§4.2). E un parametru al cache-ului, nu o
 * constantă a codului: lumea îl ia din content (`termic.kCelule`) în `createWorld` și în `decode`; implicitul
 * de aici (indexurile construite fără reguli: oracolele testelor) e același număr, citit din `DEFAULT_RULES`,
 * nu scris a doua oară.
 */
export const K_FETE_IMPLICIT: number = DEFAULT_RULES.termic.kCelule

/** `dSolMasivM` implicit (ca K): lumea îl ia din content în `createWorld` și în `decode`. */
export const D_SOL_MASIV_IMPLICIT: number = DEFAULT_RULES.termic.dSolMasivM

/** Adâncimea maximă a solului, în metri: capătul tabelelor pe adâncime din §3 (0..64). */
export const ADANCIME_MAX = 64

export const ClasaDir = { SUS: 0, JOS: 1, LAT: 2 } as const
export type ClasaDirId = (typeof ClasaDir)[keyof typeof ClasaDir]

export const FelFata = { DESCHISA: 0, MUCHIE: 1, SINE: 2, SOL: 3, EXT: 4, APA: 5, ADANC: 6 } as const
export type FelFataId = (typeof FelFata)[keyof typeof FelFata]

export const NUME_CLASA: readonly string[] = ['SUS', 'JOS', 'LAT']
export const NUME_FEL: readonly string[] = ['DESCHISA', 'MUCHIE', 'SINE', 'SOL', 'EXT', 'APA', 'ADANC']

/** Cele 6 direcții, în ordinea fixă a clasificării: +x, −x, +y, −y, sus, jos. */
const DX = [1, -1, 0, 0, 0, 0] as const
const DY = [0, 0, 1, -1, 0, 0] as const
const DZ = [0, 0, 0, 0, 1, -1] as const
const CLASA: readonly ClasaDirId[] = [ClasaDir.LAT, ClasaDir.LAT, ClasaDir.LAT, ClasaDir.LAT, ClasaDir.SUS, ClasaDir.JOS]

/** Câte materiale are enumerarea (pe cât se numără o compoziție). */
const NR_MAT = MATERIAL_MAX + 1

/** Un rând al cache-ului: fețele unei bucăți cu aceleași (clasă, fel, compoziție, prima, adâncime/dincolo). */
export interface RandFete {
  readonly clasa: ClasaDirId
  /** DESCHISA, MUCHIE, SOL, EXT, APA sau ADANC — niciodată SINE (se hotărăște la citire, vezi antetul). */
  readonly fel: FelFataId
  /** Id-ul compoziției în tabelul cache-ului (`compozitia`). */
  readonly compozitie: number
  /**
   * Materialul primei celule de pe normală: AER pentru DESCHISA, APA pentru o față direct în apă, altfel
   * primul hotar (stânca de sub bază și din afara lumii: ROCA).
   */
  readonly prima: number
  /** SOL: `d_ef`; APA, ADANC: `d`; toate în [0, ADANCIME_MAX]. Altfel −1. */
  readonly adancime: number
  /** MUCHIE: `cheieCelula` celulei de aer acoperit de la capăt. Altfel −1. */
  readonly dincolo: number
  readonly fete: number
}

interface RandMutabil {
  clasa: ClasaDirId
  fel: FelFataId
  compozitie: number
  prima: number
  adancime: number
  dincolo: number
  fete: number
}

/**
 * Contoarele întreținerii (K05 se probează pe ele, nu pe timp: o sarcină dată costă la fel pe o așezare
 * mică și pe una mare).
 */
export interface StatFete {
  /** Loturi cu editări pe un index cu felii: D+ a rulat. */
  loturi: number
  /** Loturi cu editări pe un index FĂRĂ felii: garda a sărit D+ (scenariul standard). */
  loturiSarite: number
  /** Drumuri D+ pornite (6 pe celulă de plecare). */
  drumuri: number
  /** Celule citite de drumurile D+. */
  celuleDrum: number
  /** Rulaje de aer nestrăbătute: restricția (a). */
  rulajeSarite: number
  /** Bucăți marcate de D+ (pe lot, fiecare o dată). */
  bucatiMarcate: number
  /** Bucăți ale căror rânduri s-au recalculat la un lot. */
  bucatiRecalculate: number
  /** Bucăți ale căror rânduri au fost mutate de pe o felie refăcută cu aceleași celule: restricția (b). */
  bucatiPurtate: number
  /** Fețe clasificate, la loturi și la recalcul. */
  feteClasificate: number
  /** Refaceri complete ale cache-ului. */
  recalculari: number
}

/**
 * Contoarele de capacitate (t.2b §4): celulele de aer și fețele pe clasă de masă. `nConstr` cuprinde și solul
 * natural de suprafață (`d < dSolMasivM`), care are masa construcției; `nApa` are masa solului masiv.
 */
export interface ContoareMasa {
  readonly nAer: number
  readonly nConstr: number
  readonly nSolMasiv: number
  readonly nApa: number
}

/** Înregistrarea unei bucăți în cache: rândurile și contoarele, scrise împreună (antetul). */
export interface InregistrareFete extends ContoareMasa {
  readonly randuri: readonly RandFete[]
}

export interface CacheFete {
  /** K: câte celule de hotar străbate mersul. Fix pe viața cache-ului (alt K = alt cache, recalculat). */
  readonly k: number
  /** De la ce adâncime solul natural e masiv (contoarele, §4). Fix pe viața cache-ului, ca K. */
  readonly dSolMasiv: number
  /** Înregistrarea fiecărei bucăți, pe slotul ei din index (`IndexCamere.b*`); `undefined` = slot liber. */
  inreg: (InregistrareFete | undefined)[]
  /** Numărările pe material ale fiecărei compoziții (indexate cu `MaterialId`). Id 0 = drumul gol. */
  compNumarari: Uint8Array[]
  /** Cheia canonică a fiecărei compoziții, independentă de istoria tabelului (oracolul compară pe ea). */
  compCheie: string[]
  readonly compDupaCheie: Map<string, number>
  /** Tranzițiile (id, material) → id-ul multisetului cu o celulă în plus. */
  readonly compUrm: Map<number, number>
  readonly stat: StatFete
}

/** Un cache gol, cu tabelul compozițiilor gata (id 0 = drumul gol). */
export function cacheFete(k: number = K_FETE_IMPLICIT, dSolMasiv: number = D_SOL_MASIV_IMPLICIT): CacheFete {
  if (!Number.isInteger(k) || k < 1 || k > ADANCIME_MAX) throw new RangeError(`K al fetelor trebuie sa fie intreg in [1, ${ADANCIME_MAX}], nu ${k}`)
  if (!Number.isInteger(dSolMasiv) || dSolMasiv < 0 || dSolMasiv > ADANCIME_MAX) throw new RangeError(`dSolMasiv trebuie sa fie intreg in [0, ${ADANCIME_MAX}], nu ${dSolMasiv}`)
  const c: CacheFete = {
    k,
    dSolMasiv,
    inreg: [],
    compNumarari: [],
    compCheie: [],
    compDupaCheie: new Map(),
    compUrm: new Map(),
    stat: { loturi: 0, loturiSarite: 0, drumuri: 0, celuleDrum: 0, rulajeSarite: 0, bucatiMarcate: 0, bucatiRecalculate: 0, bucatiPurtate: 0, feteClasificate: 0, recalculari: 0 },
  }
  golesteFete(c)
  return c
}

/** Golește înregistrările și tabelul compozițiilor (recalculul complet). Contoarele `stat` rămân. */
function golesteFete(c: CacheFete): void {
  c.inreg = []
  c.compNumarari = [new Uint8Array(NR_MAT)]
  c.compCheie = ['']
  c.compDupaCheie.clear()
  c.compDupaCheie.set('', 0)
  c.compUrm.clear()
}

function cheieCompozitie(num: Uint8Array): string {
  let s = ''
  for (let m = 0; m < num.length; m++) {
    if (num[m]! > 0) s += `${s === '' ? '' : '+'}${m}x${num[m]}`
  }
  return s
}

/** Multisetul `id` cu încă o celulă de material `m`. */
function extinde(c: CacheFete, id: number, m: number): number {
  const kt = id * NR_MAT + m
  const gasit = c.compUrm.get(kt)
  if (gasit !== undefined) return gasit
  const num = c.compNumarari[id]!.slice()
  num[m] = num[m]! + 1
  const cheie = cheieCompozitie(num)
  let nou = c.compDupaCheie.get(cheie)
  if (nou === undefined) {
    nou = c.compNumarari.length
    c.compNumarari.push(num)
    c.compCheie.push(cheie)
    c.compDupaCheie.set(cheie, nou)
  }
  c.compUrm.set(kt, nou)
  return nou
}

// ---------------------------------------------------------------------------
// mersul pe normală
// ---------------------------------------------------------------------------

/** Materialul celulei pe convenția camerelor: sub bază și în afara lumii ROCA, peste fereastră AER. */
function materialIn(c: Coloana, z: number): number {
  if (c.afara) return Material.ROCA
  const l = z - c.base
  if (l < 0) return Material.ROCA
  if (l >= VOXEL_LEVELS) return Material.AER
  return c.mat[l]!
}

/** Adâncimea sub solul natural al coloanei, clampată la [0, ADANCIME_MAX]. În afara lumii: maximă. */
function adancimeIn(c: Coloana, z: number): number {
  const d = c.gNat - z
  if (d <= 0) return 0
  return d >= ADANCIME_MAX ? ADANCIME_MAX : d
}

// ---------------------------------------------------------------------------
// masa fețelor (t.2b §4)
// ---------------------------------------------------------------------------

/**
 * Clasa de masă a unei fețe, după PRIMA celulă de pe normală. SOL_SUPRAFATA, SOL_MASIV și APA sunt masa care
 * intră și iese la `T_sol(d)` (proveniența C3, §3); CONSTR iese la T-ul componentei și apare la T-ul rezultat.
 */
export const ClasaMasei = { NIMIC: 0, CONSTR: 1, SOL_SUPRAFATA: 2, SOL_MASIV: 3, APA: 4 } as const
export type ClasaMaseiId = (typeof ClasaMasei)[keyof typeof ClasaMasei]

/** E clasa una care intră și iese la temperatura solului? */
export function eClasaDeSol(k: ClasaMaseiId): boolean {
  return k === ClasaMasei.SOL_SUPRAFATA || k === ClasaMasei.SOL_MASIV || k === ClasaMasei.APA
}

/**
 * Clasa de masă a feței al cărei prim vecin are materialul `m` (pe convenția camerelor) la adâncimea `d`. Aerul
 * — acoperit (nu e față) sau de sub cer (DESCHISĂ) — n-are masă. UN singur loc spune asta: contoarele, evidența
 * C3 a provenienței și oracolele o citesc de aici.
 */
export function clasaMasei(m: number, d: number, dSolMasiv: number): ClasaMaseiId {
  if (m === Material.AER) return ClasaMasei.NIMIC
  if (m === Material.APA) return ClasaMasei.APA
  if (eSolNatural(m)) return d >= dSolMasiv ? ClasaMasei.SOL_MASIV : ClasaMasei.SOL_SUPRAFATA
  return ClasaMasei.CONSTR
}

/**
 * Materialele de DINAINTE de lot ale celulelor editate în el (`cheieCelula` → material), din jurnalul terenului;
 * `null` = terenul de acum. Restul celulelor n-au fost editate, deci au același material.
 */
export type MaterialeVechi = ReadonlyMap<number, number> | null

/**
 * Clasa de masă a feței celulei (x, y, z) pe direcția `dir` (0..5: +x, −x, +y, −y, sus, jos): vecinul pe
 * convenția camerelor (sub bază și în afara lumii ROCA, peste fereastră AER), cu adâncimea lui. Cu `vechi`,
 * pe materialele de dinainte de lot.
 */
export function clasaFetei(r: CititorCamere, x: number, y: number, z: number, dir: number, dSolMasiv: number, vechi: MaterialeVechi): ClasaMaseiId {
  const nx = x + DX[dir]!
  const ny = y + DY[dir]!
  const nz = z + DZ[dir]!
  const col = coloana(r, nx, ny)
  let m = materialIn(col, nz)
  // În afara lumii nu se editează nimic (iar cheia unei celule de acolo s-ar suprapune peste alta).
  if (vechi !== null && !col.afara) {
    const v = vechi.get(cheieCelula(nx, ny, nz))
    if (v !== undefined) m = v
  }
  return clasaMasei(m, adancimeIn(col, nz), dSolMasiv)
}

/** Contoare mutabile, adunate celulă cu celulă. */
export interface ContoareMasaMutabile {
  nAer: number
  nConstr: number
  nSolMasiv: number
  nApa: number
}

export function contoareGoale(): ContoareMasaMutabile {
  return { nAer: 0, nConstr: 0, nSolMasiv: 0, nApa: 0 }
}

/** Adună o față de clasa `k` în contoare (cu semnul `s`, ±1). */
export function adunaClasa(acc: ContoareMasaMutabile, k: ClasaMaseiId, s: number): void {
  if (k === ClasaMasei.CONSTR || k === ClasaMasei.SOL_SUPRAFATA) acc.nConstr += s
  else if (k === ClasaMasei.SOL_MASIV) acc.nSolMasiv += s
  else if (k === ClasaMasei.APA) acc.nApa += s
}

/**
 * Capacitatea celulei de aer acoperit (x, y, z), adunată în `acc`: aerul ei și cele 6 fețe (§4) — o față există
 * doar spre un vecin care nu e aer, deci cele interioare n-au masă, iar SINE și MUCHIE (prin perete) au.
 */
export function capacitateCelulei(r: CititorCamere, x: number, y: number, z: number, dSolMasiv: number, vechi: MaterialeVechi, acc: ContoareMasaMutabile): void {
  acc.nAer++
  for (let d = 0; d < 6; d++) adunaClasa(acc, clasaFetei(r, x, y, z, d, dSolMasiv, vechi), 1)
}

/** C' în unitatea μ (`MaseTermice`): Σ contoare × mase. Exact pe Number cât C' < 2^53. */
export function capacitateMu(n: ContoareMasa, mase: MaseTermice): number {
  return n.nAer * mase.aer + n.nConstr * mase.constr + (n.nSolMasiv + n.nApa) * mase.sol
}

/** O față, scrisă de `clasifica` (un singur obiect, rescris la fiecare apel). */
interface Fata {
  fel: FelFataId
  compozitie: number
  prima: number
  adancime: number
  dincolo: number
}

function scrie(o: Fata, fel: FelFataId, compozitie: number, prima: number, adancime: number, dincolo: number): true {
  o.fel = fel
  o.compozitie = compozitie
  o.prima = prima
  o.adancime = adancime
  o.dincolo = dincolo
  return true
}

/**
 * Clasifică fața celulei de aer acoperit (x, y, z) pe direcția `d` (0..5). `false` = vecinul e aer acoperit,
 * deci nu e față. MUCHIE înseamnă aici doar „ajunge la aer acoperit" (antetul).
 */
function clasifica(c: CacheFete, r: CititorCamere, x: number, y: number, z: number, d: number, o: Fata): boolean {
  const k = c.k
  const dx = DX[d]!
  const dy = DY[d]!
  const dz = DZ[d]!
  const vertical = dz !== 0
  // Pe verticală, toate celulele drumului sunt în coloana celulei; lateral, fiecare pas citește alta.
  let col = coloana(r, x, y)
  let comp = 0
  let prima = -1
  let iSol = -1
  let compSol = 0
  let dSol = 0
  let px = x
  let py = y
  let pz = z
  for (let i = 1; ; i++) {
    px += dx
    py += dy
    pz += dz
    if (!vertical) col = coloana(r, px, py)
    const m = materialIn(col, pz)
    if (m === Material.AER) {
      const acoperit = col.varf > pz
      if (i === 1) {
        if (acoperit) return false
        // Vecinul vertical al unei celule acoperite nu e niciodată cer (antetul camere.ts): DESCHISĂ e laterală.
        return scrie(o, FelFata.DESCHISA, 0, Material.AER, -1, -1)
      }
      if (acoperit) return scrie(o, FelFata.MUCHIE, comp, prima, -1, cheieCelula(px, py, pz))
      if (iSol >= 0) return scrie(o, FelFata.SOL, compSol, prima, Math.min(dSol, i - iSol - 1), -1)
      return scrie(o, FelFata.EXT, comp, prima, -1, -1)
    }
    if (m === Material.APA) {
      if (iSol >= 0) return scrie(o, FelFata.SOL, compSol, prima, dSol, -1)
      return scrie(o, FelFata.APA, comp, i === 1 ? Material.APA : prima, adancimeIn(col, pz), -1)
    }
    if (i > k) {
      // K celule de hotar și a K+1-a tot hotar.
      if (iSol >= 0) return scrie(o, FelFata.SOL, compSol, prima, dSol, -1)
      return scrie(o, FelFata.ADANC, comp, prima, adancimeIn(col, pz), -1)
    }
    if (prima < 0) prima = m
    comp = extinde(c, comp, m)
    if (iSol < 0 && eSolNatural(m)) {
      iSol = i
      compSol = comp
      dSol = adancimeIn(col, pz)
    }
  }
}

const SCRATCH: Fata = { fel: FelFata.DESCHISA, compozitie: 0, prima: 0, adancime: -1, dincolo: -1 }

function comparaRanduri(a: RandFete, b: RandFete): number {
  return a.clasa - b.clasa || a.fel - b.fel || a.compozitie - b.compozitie || a.prima - b.prima || a.adancime - b.adancime || a.dincolo - b.dincolo
}

/**
 * Înregistrările bucăților unei felii (rândurile și contoarele de capacitate), dintr-o singură trecere pe cele
 * 256 de celule. `doar` = bucățile cerute (null: toate). Scrie în cache și întoarce câte bucăți a scris.
 */
function scrieRanduri(c: CacheFete, r: CititorCamere, f: Felie, doar: ReadonlySet<number> | null): number {
  const { bx, by, z } = decodeazaFelie(f.cheie)
  const x0 = bx * FELIE
  const y0 = by * FELIE
  const acc = new Map<number, Map<number, Map<number, RandMutabil>>>()
  const cap = new Map<number, ContoareMasaMutabile>()
  for (const b of f.bucati) {
    if (doar !== null && !doar.has(b)) continue
    acc.set(b, new Map())
    cap.set(b, contoareGoale())
  }
  const n = FELIE * FELIE
  for (let s = 0; s < n; s++) {
    const b = f.cel[s]!
    if (b < 0) continue
    const peBucata = acc.get(b)
    if (peBucata === undefined) continue
    const x = x0 + (s % FELIE)
    const y = y0 + ((s / FELIE) | 0)
    capacitateCelulei(r, x, y, z, c.dSolMasiv, null, cap.get(b)!)
    for (let d = 0; d < 6; d++) {
      if (!clasifica(c, r, x, y, z, d, SCRATCH)) continue
      c.stat.feteClasificate++
      const clasa = CLASA[d]!
      const k1 = ((SCRATCH.compozitie * NR_MAT + SCRATCH.prima) * 8 + SCRATCH.fel) * 4 + clasa
      const k2 = SCRATCH.fel === FelFata.MUCHIE ? SCRATCH.dincolo : SCRATCH.adancime
      let m2 = peBucata.get(k1)
      if (m2 === undefined) {
        m2 = new Map()
        peBucata.set(k1, m2)
      }
      const rr = m2.get(k2)
      if (rr !== undefined) rr.fete++
      else m2.set(k2, { clasa, fel: SCRATCH.fel, compozitie: SCRATCH.compozitie, prima: SCRATCH.prima, adancime: SCRATCH.adancime, dincolo: SCRATCH.dincolo, fete: 1 })
    }
  }
  // determinism-ok: ordinea Map-urilor e ordinea de inserare (bucatile feliei, celulele in ordine); randurile se sorteaza.
  for (const [b, peBucata] of acc) {
    const randuri: RandFete[] = []
    // determinism-ok: idem — inserare in ordinea celulelor, apoi sortare.
    for (const m2 of peBucata.values()) for (const rr of m2.values()) randuri.push(rr)
    randuri.sort(comparaRanduri)
    const k = cap.get(b)!
    c.inreg[b] = { randuri, nAer: k.nAer, nConstr: k.nConstr, nSolMasiv: k.nSolMasiv, nApa: k.nApa }
  }
  return acc.size
}

// ---------------------------------------------------------------------------
// D+ (§4.4)
// ---------------------------------------------------------------------------

/** Drumurile D+ dintr-o celulă: 6 direcții, K+1 pași, până la prima celulă de aer. */
function drumuri(idx: IndexCamere, c: CacheFete, r: CititorCamere, x: number, y: number, z: number, marcate: Set<number>): void {
  const pasi = c.k + 1
  for (let d = 0; d < 6; d++) {
    c.stat.drumuri++
    const dx = DX[d]!
    const dy = DY[d]!
    const dz = DZ[d]!
    const vertical = dz !== 0
    let col = coloana(r, x, y)
    for (let j = 1; j <= pasi; j++) {
      const px = x + dx * j
      const py = y + dy * j
      const pz = z + dz * j
      c.stat.celuleDrum++
      if (!vertical) col = coloana(r, px, py)
      // Apa nu oprește drumul invers: o față se oprește la ea, deci drumul care trece de ea doar marchează în plus.
      if (materialIn(col, pz) !== Material.AER) continue
      if (col.varf > pz) {
        const b = bucataLa(idx, px, py, pz)
        if (b >= 0) marcate.add(b)
      }
      break
    }
  }
}

/**
 * Restricția (a): există DUPĂ lot, deasupra lui (x, y, z), un hotar pe care lotul nu l-a editat? Atunci el
 * era acolo și înainte, iar acoperirea rulajului de sub (x, y, z) n-a mișcat.
 */
function hotarNeeditatDeasupra(r: CititorCamere, x: number, y: number, z: number, editate: ReadonlySet<number>): boolean {
  const col = coloana(r, x, y)
  for (let zz = col.varf; zz > z; zz--) {
    if (materialIn(col, zz) !== Material.AER && !editate.has(cheieCelula(x, y, zz))) return true
  }
  return false
}

function dPlus(idx: IndexCamere, c: CacheFete, r: CititorCamere, lot: readonly number[], marcate: Set<number>): void {
  const editate = new Set<number>()
  for (let i = 0; i < lot.length; i += 4) editate.add(cheieCelula(lot[i]!, lot[i + 1]!, lot[i + 2]!))
  const pornite = new Set<number>()
  const porneste = (x: number, y: number, z: number): void => {
    const kc = cheieCelula(x, y, z)
    if (pornite.has(kc)) return
    pornite.add(kc)
    drumuri(idx, c, r, x, y, z, marcate)
  }
  for (let i = 0; i < lot.length; i += 4) {
    const x = lot[i]!
    const y = lot[i + 1]!
    const z = lot[i + 2]!
    const jos = lot[i + 3]!
    porneste(x, y, z)
    if (jos >= z) continue
    if (hotarNeeditatDeasupra(r, x, y, z, editate)) {
      c.stat.rulajeSarite++
      continue
    }
    for (let zz = z - 1; zz >= jos; zz--) porneste(x, y, zz)
  }
}

/** Bucata nouă → bucata veche, dacă cele două obiecte `Felie` au EXACT aceeași mulțime de celule; altfel null. */
function potrivire(vechi: Felie, nou: Felie): Map<number, number> | null {
  const n = FELIE * FELIE
  for (let s = 0; s < n; s++) if ((vechi.cel[s]! < 0) !== (nou.cel[s]! < 0)) return null
  const m = new Map<number, number>()
  for (let s = 0; s < n; s++) {
    const b = nou.cel[s]!
    if (b >= 0 && !m.has(b)) m.set(b, vechi.cel[s]!)
  }
  return m
}

/**
 * Ține cache-ul la zi după un lot. O cheamă DOAR `sincronizeazaCamere`, pe orice lot cu editări — și pe cel
 * care nu reface nicio felie —, după refacerea feliilor și a componentelor.
 *
 * `lot`: câte 4 numere pe editare — x, y, z și capătul de jos al rulajului de aer de sub ea, citit după lot
 * (rulajul = [jos, z − 1]). `felii`: cheile feliilor refăcute, sortate; `vechi`: obiectele `Felie` de
 * dinaintea lotului, aliniate cu `felii` (`undefined` = felia nu exista). Întoarce câte bucăți a marcat D+.
 */
export function actualizeazaFete(idx: IndexCamere, r: CititorCamere, lot: readonly number[], felii: readonly number[], vechi: readonly (Felie | undefined)[]): number {
  const c = idx.fete
  const marcate = new Set<number>()
  if (idx.felii.size === 0) c.stat.loturiSarite++
  else {
    c.stat.loturi++
    dPlus(idx, c, r, lot, marcate)
  }
  c.stat.bucatiMarcate += marcate.size
  if (marcate.size > 0) idx.epocaFete++
  if (felii.length === 0 && marcate.size === 0) return 0

  // 1. Înregistrările bucăților vechi ale feliilor refăcute, luate ÎNAINTE de orice scriere: un slot eliberat
  //    poate fi deja al unei bucăți noi.
  const vechiRanduri = new Map<number, InregistrareFete | undefined>()
  for (const fv of vechi) {
    if (fv === undefined) continue
    for (const b of fv.bucati) {
      vechiRanduri.set(b, c.inreg[b])
      c.inreg[b] = undefined
    }
  }

  // 2. Feliile refăcute: (b) pe cele cu aceeași mulțime de celule, recalcul pe rest. Înregistrarea se mută
  //    întreagă — rândurile ȘI contoarele (antetul: un contor pe slot ar rămâne al vechiului ocupant).
  for (let i = 0; i < felii.length; i++) {
    const fn = idx.felii.get(felii[i]!)
    if (fn === undefined) continue
    const fv = vechi[i]
    const harta = fv === undefined ? null : potrivire(fv, fn)
    if (harta === null) {
      c.stat.bucatiRecalculate += scrieRanduri(c, r, fn, null)
      continue
    }
    const deCalculat = new Set<number>()
    for (const bn of fn.bucati) {
      const purtate = marcate.has(bn) ? undefined : vechiRanduri.get(harta.get(bn)!)
      if (purtate === undefined) deCalculat.add(bn)
      else {
        c.inreg[bn] = purtate
        c.stat.bucatiPurtate++
      }
    }
    if (deCalculat.size > 0) c.stat.bucatiRecalculate += scrieRanduri(c, r, fn, deCalculat)
  }

  // 3. Bucățile marcate din felii nerefăcute, grupate pe felie (o trecere pe felie).
  const refacute = new Set(felii)
  const peFelie = new Map<number, Set<number>>()
  for (const b of [...marcate].sort((a, b2) => a - b2)) {
    const kf = idx.bFelie[b]!
    if (refacute.has(kf)) continue
    let s = peFelie.get(kf)
    if (s === undefined) {
      s = new Set()
      peFelie.set(kf, s)
    }
    s.add(b)
  }
  for (const [kf, s] of [...peFelie].sort((a, b) => a[0] - b[0])) c.stat.bucatiRecalculate += scrieRanduri(c, r, idx.felii.get(kf)!, s)
  return marcate.size
}

/** Toate rândurile tuturor bucăților indexului, în `c` (gol). Blocul întâi, apoi z, ca în recalculul indexului. */
function calculeazaToate(c: CacheFete, idx: IndexCamere, t: Terrain): void {
  const r = cititorCamere(t)
  const blocuri = WORLD_CELLS / FELIE
  const BB = blocuri * blocuri
  for (const kf of [...idx.chei].sort((a, b) => (a % BB) - (b % BB) || a - b)) {
    scrieRanduri(c, r, idx.felii.get(kf)!, null)
    // Terenul nu se schimbă aici: memoria cititorului rămâne mărginită (ca în `reconstruiesteCamere`).
    if (r.col.size > 8192) r.col.clear()
  }
}

/**
 * Recalculul complet al cache-ului, pe loc: la recalculul indexului (`reconstruiesteCamere`) și la cerere.
 * `epocaFete` crește.
 */
export function reconstruiesteFete(idx: IndexCamere, t: Terrain): void {
  const c = idx.fete
  golesteFete(c)
  c.stat.recalculari++
  calculeazaToate(c, idx, t)
  idx.epocaFete++
}

// ---------------------------------------------------------------------------
// citirea (valul 2: graful, inspectorul)
// ---------------------------------------------------------------------------

/** Rândurile bucății `b` (un slot viu al indexului), sau `undefined` pentru un slot liber. */
export function randuriBucatii(idx: IndexCamere, b: number): readonly RandFete[] | undefined {
  return idx.fete.inreg[b]?.randuri
}

/** Contoarele de capacitate ale bucății `b`, sau `undefined` pentru un slot liber. */
export function contoareBucatii(idx: IndexCamere, b: number): ContoareMasa | undefined {
  return idx.fete.inreg[b]
}

/**
 * Contoarele de capacitate ale componentei: suma pe bucățile ei, O(bucăți), ca volumul. Refuz `INVARIANT_INCALCAT`
 * dacă o bucată n-are înregistrare (fiecare bucată vie are una).
 */
export function contoareComponentei(idx: IndexCamere, comp: Componenta): Outcome<ContoareMasa> {
  const acc = contoareGoale()
  for (const b of comp.bucati) {
    const k = idx.fete.inreg[b]
    if (k === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'bucata fara inregistrare de fete', bucata: b })
    acc.nAer += k.nAer
    acc.nConstr += k.nConstr
    acc.nSolMasiv += k.nSolMasiv
    acc.nApa += k.nApa
  }
  return accept(acc)
}

export interface Compozitie {
  readonly id: number
  /** Cheia canonică: `material x număr`, pe materiale crescătoare (de ex. `1x2+6x1`); '' = drumul gol. */
  readonly cheie: string
  /** Numărul de celule pe fiecare `MaterialId` (lungime MATERIAL_MAX + 1). */
  readonly numarari: readonly number[]
  readonly celule: number
}

/** Compoziția cu id-ul dat, din tabelul cache-ului indexului, sau null. */
export function compozitia(idx: IndexCamere, id: number): Compozitie | null {
  const num = idx.fete.compNumarari[id]
  if (num === undefined) return null
  let celule = 0
  for (const v of num) celule += v
  return { id, cheie: idx.fete.compCheie[id]!, numarari: [...num], celule }
}

/** Un rând agregat pe o componentă: MUCHIE e rezolvată la componenta de dincolo, SINE e scoasă. */
export interface RandComponenta {
  readonly clasa: ClasaDirId
  readonly fel: FelFataId
  readonly compozitie: number
  readonly prima: number
  readonly adancime: number
  /** MUCHIE: id-ul componentei de dincolo (un slot al indexului, valabil până la epoca următoare). Altfel −1. */
  readonly vecina: number
  readonly fete: number
}

export interface AgregareFete {
  readonly randuri: readonly RandComponenta[]
  /** Fețe SINE (drumul se întoarce în aceeași componentă), scoase din rânduri. */
  readonly sine: number
  /** Toate fețele componentei, cu SINE cu tot. */
  readonly fete: number
}

/**
 * Rândurile unei componente, agregate pe bucățile ei, cu MUCHIE rezolvată prin celula de dincolo → bucată →
 * componentă (§5). Refuz `INVARIANT_INCALCAT` dacă o bucată n-are rânduri, dacă celula de dincolo a unei
 * muchii nu e aer acoperit în index — nu o muchie spre nimic (`bComp[−1]`), tăcută (panoul, L2-4) — sau dacă
 * fețele DESCHISA din rânduri nu sunt `deschise` ale componentei (recenzia FETE, L1-1).
 */
export function agregaComponenta(idx: IndexCamere, comp: Componenta): Outcome<AgregareFete> {
  const c = idx.fete
  const acc = new Map<number, Map<number, RandMutabil & { vecina: number }>>()
  let sine = 0
  let total = 0
  let deschise = 0
  for (const b of comp.bucati) {
    const rr = c.inreg[b]?.randuri
    if (rr === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'bucata fara randuri de fete', bucata: b })
    for (const x of rr) {
      total += x.fete
      if (x.fel === FelFata.DESCHISA) deschise += x.fete
      let vecina = -1
      if (x.fel === FelFata.MUCHIE) {
        const p = decodeazaCelula(x.dincolo)
        const bd = bucataLa(idx, p.x, p.y, p.z)
        if (bd < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'celula de dincolo a unei muchii nu e aer acoperit', x: p.x, y: p.y, z: p.z })
        vecina = idx.bComp[bd]!
        if (vecina === comp.id) {
          sine += x.fete
          continue
        }
      }
      const k1 = ((x.compozitie * NR_MAT + x.prima) * 8 + x.fel) * 4 + x.clasa
      const k2 = x.fel === FelFata.MUCHIE ? vecina : x.adancime
      let m2 = acc.get(k1)
      if (m2 === undefined) {
        m2 = new Map()
        acc.set(k1, m2)
      }
      const a = m2.get(k2)
      if (a !== undefined) a.fete += x.fete
      else m2.set(k2, { clasa: x.clasa, fel: x.fel, compozitie: x.compozitie, prima: x.prima, adancime: x.adancime, dincolo: -1, vecina, fete: x.fete })
    }
  }
  const randuri: RandComponenta[] = []
  // determinism-ok: inserare in ordinea bucatilor (sortate) si a randurilor (sortate); rezultatul se sorteaza.
  for (const m2 of acc.values()) for (const a of m2.values()) randuri.push({ clasa: a.clasa, fel: a.fel, compozitie: a.compozitie, prima: a.prima, adancime: a.adancime, vecina: a.vecina, fete: a.fete })
  randuri.sort((a, b) => a.clasa - b.clasa || a.fel - b.fel || a.compozitie - b.compozitie || a.prima - b.prima || a.adancime - b.adancime || a.vecina - b.vecina)
  // Două implementări ale aceleiași mulțimi (`esteCer` în camere.ts, `clasifica` aici): fața DESCHISA e
  // ventilația (gDeschis, ~34× conductanța unui perete EXT), deci o clasificare greșită mută tăcut temperatura
  // oricărei componente deschise — oracolul cache == recalcul e autoconsistent pe clasificare (recenzia FETE, L1-1).
  if (deschise !== comp.deschise) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'fetele DESCHISA nu sunt fetele deschise ale componentei', cache: deschise, index: comp.deschise })
  return accept({ randuri, sine, fete: total })
}

/** O față a unei celule, citită direct (inspectorul, testele): SINE rezolvată, compoziția ca cheie. */
export interface FataCelulei {
  /** 0..5: +x, −x, +y, −y, sus, jos. */
  readonly directie: number
  readonly clasa: ClasaDirId
  readonly fel: FelFataId
  /** Cheia canonică a compoziției (`Compozitie.cheie`). */
  readonly compozitie: string
  readonly prima: number
  readonly adancime: number
  readonly dincolo: number
}

/**
 * Fețele celulei (x, y, z), mers proaspăt pe teren (nu din cache) — cu tabelul de compoziții al unui cache
 * temporar, ca o citire să nu scrie în cel al indexului. Celula trebuie să fie aer acoperit în index; altfel [].
 */
export function feteleCelulei(idx: IndexCamere, r: CititorCamere, x: number, y: number, z: number): FataCelulei[] {
  const b = bucataLa(idx, x, y, z)
  if (b < 0) return []
  const comp = idx.bComp[b]!
  const tmp = cacheFete(idx.fete.k, idx.fete.dSolMasiv)
  const o: Fata = { fel: FelFata.DESCHISA, compozitie: 0, prima: 0, adancime: -1, dincolo: -1 }
  const out: FataCelulei[] = []
  for (let d = 0; d < 6; d++) {
    if (!clasifica(tmp, r, x, y, z, d, o)) continue
    let fel = o.fel
    if (fel === FelFata.MUCHIE) {
      const p = decodeazaCelula(o.dincolo)
      const bd = bucataLa(idx, p.x, p.y, p.z)
      if (bd >= 0 && idx.bComp[bd] === comp) fel = FelFata.SINE
    }
    out.push({ directie: d, clasa: CLASA[d]!, fel, compozitie: tmp.compCheie[o.compozitie]!, prima: o.prima, adancime: o.adancime, dincolo: o.dincolo })
  }
  return out
}

// ---------------------------------------------------------------------------
// oracolul
// ---------------------------------------------------------------------------

function formaRand(c: CacheFete, x: RandFete): string {
  const loc = x.fel === FelFata.MUCHIE ? ` @${x.dincolo}` : x.adancime >= 0 ? ` d${x.adancime}` : ''
  return `${NUME_CLASA[x.clasa]} ${NUME_FEL[x.fel]} [${c.compCheie[x.compozitie]}] p${x.prima}${loc} x${x.fete}`
}

function canonica(idx: IndexCamere, c: CacheFete): string[] {
  const out: string[] = []
  let vii = 0
  for (const kf of idx.chei) {
    for (const b of idx.felii.get(kf)!.bucati) {
      vii++
      const e = c.inreg[b]
      out.push(e === undefined ? `${idx.bAncora[b]}|FARA RANDURI` : `${idx.bAncora[b]}|a${e.nAer} c${e.nConstr} s${e.nSolMasiv} w${e.nApa}|${e.randuri.map((x) => formaRand(c, x)).sort().join('; ')}`)
    }
  }
  let cuRanduri = 0
  for (const e of c.inreg) if (e !== undefined) cuRanduri++
  if (cuRanduri !== vii) out.push(`SLOTURI CU RANDURI ${cuRanduri}, BUCATI VII ${vii}`)
  return out
}

/**
 * Forma canonică a cache-ului: o linie pe bucată (ancora, contoarele de capacitate, rândurile cu compoziția pe
 * cheie, sortate), în ordinea feliilor, plus o linie de alarmă dacă vreun slot liber are rânduri. Oracolul:
 * cache-ul ținut incremental == `formaCanonicaFeteRecalculata` pe același index — deci și „contoarele ținute la
 * zi == Σ capacitateCelulei pe recalcul", după fiecare lot, în testele care îl rulează deja (t.2b §4, IDX-1).
 */
export function formaCanonicaFete(idx: IndexCamere): string[] {
  return canonica(idx, idx.fete)
}

/** Forma canonică a recalculului complet al fețelor indexului, într-un cache nou (indexul nu se atinge). */
export function formaCanonicaFeteRecalculata(idx: IndexCamere, t: Terrain): string[] {
  const c = cacheFete(idx.fete.k, idx.fete.dSolMasiv)
  calculeazaToate(c, idx, t)
  return canonica(idx, c)
}
