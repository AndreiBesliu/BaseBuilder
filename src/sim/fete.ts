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
 * ## Evidența maselor pe lot (t.2b §3, proveniența C3)
 *
 * `evidentaMaselor` spune, pentru fiecare componentă nouă, ce masă PERSISTĂ din fiecare componentă veche, ce sol
 * (și apă) intră, pe adâncimea fiecărei fețe, și ce altă masă apare; pentru fiecare veche, ce persistă, ce sol iese
 * și ce altă masă iese — exact, în contoare. Evaluarea e LOCALĂ: doar articolele celulelor editate, ale rulajelor de
 * sub ele și ale vecinilor celor editate își pot schimba masa; acolo se citesc fețele vechi (materialele de dinainte
 * de lot, din jurnalul terenului) și cele noi. În rest masa persistă și doar își schimbă componenta: celulă cu
 * celulă în feliile refăcute, pe înregistrarea bucății în cele supraviețuitoare. Identitățile (Σ = capacitatea, pe
 * fiecare componentă nouă și veche) se verifică la rulare și se numără în `abateri`.
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
import { bucataLa, cheieCelula, cheieFelie, cititorCamere, coloana, decodeazaCelula, decodeazaFelie, FELIE } from './camere.ts'
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
  /**
   * Bucăți ale căror înregistrări le-a citit evidența maselor ca să adune C'-ul unei componente ÎNTREGI (t.2b §3, PROV-3):
   * componentele refăcute în lot și cele fără C' memorat. Pe un lot doar-fețe al unei componente vechi e 0 — K05-ul
   * evidenței (tests/provenienta.test.ts) îl compară pe o mină mică și pe una mare.
   */
  bucatiEvidenta: number
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
    stat: { loturi: 0, loturiSarite: 0, drumuri: 0, celuleDrum: 0, rulajeSarite: 0, bucatiMarcate: 0, bucatiRecalculate: 0, bucatiPurtate: 0, feteClasificate: 0, recalculari: 0, bucatiEvidenta: 0 },
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
  return (fataCuAdancime(r, x, y, z, dir, dSolMasiv, vechi) & 7) as ClasaMaseiId
}

/**
 * Clasa de masă a feței (biții 0..2) și adâncimea primei celule (de la bitul 3): o singură citire a vecinului,
 * pentru evidența provenienței, care are nevoie de amândouă (masa de sol intră și iese la `T_sol(d)`).
 */
function fataCuAdancime(r: CititorCamere, x: number, y: number, z: number, dir: number, dSolMasiv: number, vechi: MaterialeVechi): number {
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
  const d = adancimeIn(col, nz)
  return clasaMasei(m, d, dSolMasiv) | (d << 3)
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
 * dinaintea lotului, aliniate cu `felii` (`undefined` = felia nu exista). Întoarce bucățile marcate de D+ și
 * înregistrările de DINAINTE ale sloturilor rescrise (proveniența, t.2b §3: C' vechi al componentelor atinse).
 */
export function actualizeazaFete(idx: IndexCamere, r: CititorCamere, lot: readonly number[], felii: readonly number[], vechi: readonly (Felie | undefined)[]): RezultatFete {
  const c = idx.fete
  const marcate = new Set<number>()
  if (idx.felii.size === 0) c.stat.loturiSarite++
  else {
    c.stat.loturi++
    dPlus(idx, c, r, lot, marcate)
  }
  c.stat.bucatiMarcate += marcate.size
  if (marcate.size > 0) idx.epocaFete++
  // Slot → înregistrarea lui de dinainte de lot, pentru fiecare slot pe care lotul îl golește sau îl rescrie.
  const inregVechi = new Map<number, InregistrareFete | undefined>()
  if (felii.length === 0 && marcate.size === 0) return { marcate, inregVechi }

  // 1. Înregistrările bucăților vechi ale feliilor refăcute, luate ÎNAINTE de orice scriere: un slot eliberat
  //    poate fi deja al unei bucăți noi.
  const vechiRanduri = inregVechi
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
    // Bucata supraviețuiește lotului (felia ei nu s-a refăcut), iar rândurile ei se rescriu acum: cele de dinainte.
    if (!inregVechi.has(b)) inregVechi.set(b, c.inreg[b])
  }
  for (const [kf, s] of [...peFelie].sort((a, b) => a[0] - b[0])) c.stat.bucatiRecalculate += scrieRanduri(c, r, idx.felii.get(kf)!, s)
  return { marcate, inregVechi }
}

/** Ce a făcut `actualizeazaFete` pe un lot. */
export interface RezultatFete {
  /** Bucățile marcate de D+ (pe indexul de după lot). */
  readonly marcate: ReadonlySet<number>
  /** Slot → înregistrarea de dinainte de lot, pentru fiecare slot golit sau rescris (`undefined`: slotul era liber). */
  readonly inregVechi: ReadonlyMap<number, InregistrareFete | undefined>
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
// evidența maselor pe lot — proveniența C3 (t.2b §3)
// ---------------------------------------------------------------------------

/**
 * Sursele de celule ale provenienței (`prov`), pe lângă id-urile componentelor vechi (≥ 0): aerul unei celule
 * care n-a fost aer acoperit înainte de lot. CER = aer de sub cer acoperit acum; SOL(d) = `PROV_SOL0 − d`, o
 * celulă plină săpată (d = adâncimea ei); NEC = recalculul (jurnalul pierdut), rezolvat după solul natural:
 * `PROV_NEC_SOL0 − d` sub el, `PROV_NEC_CER` deasupra.
 */
export const PROV_CER = -2
export const PROV_NEC_CER = -3
export const PROV_SOL0 = -100
export const PROV_NEC_SOL0 = -200

/** Masa (pe clase) care intră sau iese la `T_sol(d)`. */
export interface MasaPeAdancime {
  readonly d: number
  readonly masa: ContoareMasa
}

/** Masa unei componente vechi care persistă în cea nouă (în ambele geometrii, cu aceeași clasă). */
export interface SursaPersistenta {
  /** Id-ul componentei vechi (un slot al indexului de DINAINTE de lot). */
  readonly id: number
  /** Ancora ei de dinainte de lot: ordinea surselor în aritmetică. */
  readonly ancora: number
  readonly masa: ContoareMasa
}

/** Originea aerului celulelor care n-au fost aer acoperit înainte de lot: rezerva când nimic nu persistă. */
export interface OrigineAer {
  /** Celule de cer (și NEC deasupra solului natural): `T_afara`. */
  readonly cer: number
  /** Celule pline săpate (și NEC sub solul natural), pe adâncimea lor: `T_sol(d)`. */
  readonly sol: readonly { readonly d: number; readonly celule: number }[]
  /** Dintre ele, câte au fost NEC (recalculul). */
  readonly nec: number
}

/**
 * O componentă de DUPĂ lot a cărei masă s-a putut schimba (nouă, refăcută pe loc sau cu fețe atinse de D+):
 * `capacitate` (contoarele ei) = Σ `surse` + Σ `solIntra` + `aparuta`, exact.
 */
export interface MaseComponentaNoua {
  readonly id: number
  readonly ancora: number
  readonly capacitate: ContoareMasa
  /** În ordinea ancorelor vechi. */
  readonly surse: readonly SursaPersistenta[]
  /** Sol natural și apă care intră, cu `d` al fiecărei fețe, crescător. */
  readonly solIntra: readonly MasaPeAdancime[]
  /** Orice altă masă apărută (construcția nouă, aerul celulelor noi): ia T-ul rezultat. */
  readonly aparuta: ContoareMasa
  readonly origine: OrigineAer
}

/**
 * O componentă de DINAINTE de lot care a pierdut sau și-a mutat masă: `capacitate` = `persista` + Σ `solIese` +
 * `altaIese` (exact pe un lot obișnuit; la recalcul `altaIese` e restul, fiindcă jurnalul s-a pierdut).
 */
export interface MaseComponentaVeche {
  readonly id: number
  readonly ancora: number
  readonly capacitate: ContoareMasa
  readonly persista: ContoareMasa
  readonly solIese: readonly MasaPeAdancime[]
  /** Altă masă care iese (aerul celulelor zidite, fețele construite care dispar): la T-ul sursei. */
  readonly altaIese: ContoareMasa
}

/** Evidența C3 a unui lot (§3), în contoare (masele în μ le pun regulile: `capacitateMu`). */
export interface EvidentaMase {
  /** Pe ancoră. */
  readonly noi: readonly MaseComponentaNoua[]
  /** Pe ancora veche. */
  readonly vechi: readonly MaseComponentaVeche[]
  /**
   * Componentele pe care identitățile nu țin (o bucată fără înregistrare, o celulă cu masa schimbată nemarcată
   * de D+, o acoperire schimbată în afara rulajelor lotului). 0 pe orice lot; testele o asertează.
   */
  readonly abateri: number
}

/**
 * Ce reține sincronizarea despre index ÎNAINTE să-l schimbe (camere.ts): componenta veche a fiecărei celule din
 * feliile refăcute (luată în `refaFelie`, înainte de `stergeBucata`), componenta veche a bucăților supraviețuitoare
 * reparcurse, obiectele componentelor vechi atinse și listele lotului.
 */
export interface CapturaLot {
  /** Felia refăcută → componenta veche a fiecărei celule (−1: nu era aer acoperit). */
  readonly compVecheCel: Map<number, Int32Array>
  /** Bucată supraviețuitoare reparcursă de `componente()` → componenta ei veche. */
  readonly compVecheBucata: Map<number, number>
  /** Obiectele componentelor vechi atinse (id → obiectul de dinainte de lot). */
  readonly compVechi: Map<number, Componenta>
  /** Componentele create sau refăcute pe loc. */
  readonly noi: number[]
  /** Dintre ele, cele care și-au păstrat id-ul (calea rapidă). */
  readonly peLoc: number[]
  /** Id-urile vechi care nu mai există. */
  readonly moarte: number[]
}

export function capturaGoala(): CapturaLot {
  return { compVecheCel: new Map(), compVecheBucata: new Map(), compVechi: new Map(), noi: [], peLoc: [], moarte: [] }
}

/** Indexul de dinainte de un recalcul complet (luat ÎNAINTE de `golesteIndex`, nu prin `Object.assign`). */
export interface InstantaneuIndex {
  readonly felii: ReadonlyMap<number, Felie>
  readonly bComp: Int32Array
  readonly comp: ReadonlyMap<number, Componenta>
  readonly inreg: readonly (InregistrareFete | undefined)[]
}

/** Ce întoarce evidența unui lot. */
export interface RezultatEvidenta {
  readonly mase: EvidentaMase
  /** Id nou → (sursă → celule), pentru componentele din `noi`. */
  readonly prov: Map<number, Map<number, number>>
  /** Componentele ∉ `noi` cu bucăți marcate de D+, pe ancoră. */
  readonly feteSchimbate: number[]
}

/** Acumulatorul unei evidențe (sume întregi; ordinea adunărilor nu contează). */
interface LucruMase {
  readonly dSolMasiv: number
  readonly P: Map<number, Map<number, ContoareMasaMutabile>>
  readonly solIn: Map<number, Map<number, ContoareMasaMutabile>>
  readonly apare: Map<number, ContoareMasaMutabile>
  readonly solOut: Map<number, Map<number, ContoareMasaMutabile>>
  readonly altaOut: Map<number, ContoareMasaMutabile>
  readonly orig: Map<number, { cer: number; nec: number; sol: Map<number, number> }>
  readonly prov: Map<number, Map<number, number>>
  /** Componentele noi pentru care se ține `prov` (cele din `noi`). */
  readonly cuProv: ReadonlySet<number>
  abateri: number
  /** Bucăți citite ca să se adune C'-ul unei componente întregi (`StatFete.bucatiEvidenta`, K05-ul evidenței). */
  bucatiCitite: number
}

function lucruMase(dSolMasiv: number, cuProv: ReadonlySet<number>): LucruMase {
  return { dSolMasiv, P: new Map(), solIn: new Map(), apare: new Map(), solOut: new Map(), altaOut: new Map(), orig: new Map(), prov: new Map(), cuProv, abateri: 0, bucatiCitite: 0 }
}

function vec(m: Map<number, ContoareMasaMutabile>, k: number): ContoareMasaMutabile {
  let v = m.get(k)
  if (v === undefined) {
    v = contoareGoale()
    m.set(k, v)
  }
  return v
}

function vec2(m: Map<number, Map<number, ContoareMasaMutabile>>, k1: number, k2: number): ContoareMasaMutabile {
  let m2 = m.get(k1)
  if (m2 === undefined) {
    m2 = new Map()
    m.set(k1, m2)
  }
  return vec(m2, k2)
}

function adunaProv(L: LucruMase, y: number, sursa: number, n: number): void {
  if (!L.cuProv.has(y)) return
  let h = L.prov.get(y)
  if (h === undefined) {
    h = new Map()
    L.prov.set(y, h)
  }
  h.set(sursa, (h.get(sursa) ?? 0) + n)
}

function adunaContoare(acc: ContoareMasaMutabile, k: ContoareMasa, s: number): void {
  acc.nAer += s * k.nAer
  acc.nConstr += s * k.nConstr
  acc.nSolMasiv += s * k.nSolMasiv
  acc.nApa += s * k.nApa
}

function egaleContoare(a: ContoareMasa, b: ContoareMasa): boolean {
  return a.nAer === b.nAer && a.nConstr === b.nConstr && a.nSolMasiv === b.nSolMasiv && a.nApa === b.nApa
}

const FATA_VECHE = new Int32Array(6)
const FATA_NOUA = new Int32Array(6)

/**
 * Evaluarea LOCALĂ a unei celule (§3): aerul ei și cele 6 fețe, în geometria veche (dacă a fost aer acoperit, în
 * componenta `sv`; vecinii pe materialele de dinainte de lot) și în cea nouă (dacă e, în `yn`). Un articol care
 * există în ambele cu aceeași clasă PERSISTĂ (`P[yn][sv]`); altfel cel vechi iese (solul la `T_sol(d)`, restul la
 * T-ul sursei) și cel nou intră (solul) sau apare. `origine` = sursa aerului unei celule noi (PROV_*), sau 0.
 * `scadeNou`: celula e într-o bucată supraviețuitoare, a cărei înregistrare întreagă a intrat deja în `P` — se scade
 * partea nouă și se adaugă evaluarea. Întoarce false dacă nimic nu s-a schimbat (celula se poate sări).
 */
function evalueazaCelula(L: LucruMase, r: CititorCamere, x: number, y: number, z: number, sv: number, yn: number, vechi: MaterialeVechi, origine: number, scadeNou: boolean): boolean {
  const ds = L.dSolMasiv
  for (let d = 0; d < 6; d++) {
    FATA_VECHE[d] = sv >= 0 ? fataCuAdancime(r, x, y, z, d, ds, vechi) : 0
    FATA_NOUA[d] = yn >= 0 ? fataCuAdancime(r, x, y, z, d, ds, null) : 0
  }
  if (sv >= 0 && sv === yn) {
    let la = true
    for (let d = 0; d < 6 && la; d++) if ((FATA_VECHE[d]! & 7) !== (FATA_NOUA[d]! & 7)) la = false
    if (la && scadeNou) return false
  }
  if (scadeNou) {
    const p = vec2(L.P, yn, sv)
    p.nAer--
    for (let d = 0; d < 6; d++) adunaClasa(p, (FATA_NOUA[d]! & 7) as ClasaMaseiId, -1)
  }
  // Aerul celulei.
  if (sv >= 0 && yn >= 0) vec2(L.P, yn, sv).nAer++
  else if (sv >= 0) vec(L.altaOut, sv).nAer++
  else if (yn >= 0) {
    vec(L.apare, yn).nAer++
    let o = L.orig.get(yn)
    if (o === undefined) {
      o = { cer: 0, nec: 0, sol: new Map() }
      L.orig.set(yn, o)
    }
    if (origine === PROV_CER || origine === PROV_NEC_CER) o.cer++
    else {
      const dc = origine <= PROV_NEC_SOL0 ? PROV_NEC_SOL0 - origine : PROV_SOL0 - origine
      o.sol.set(dc, (o.sol.get(dc) ?? 0) + 1)
    }
    if (origine === PROV_NEC_CER || origine <= PROV_NEC_SOL0) o.nec++
  }
  // Fețele.
  for (let d = 0; d < 6; d++) {
    const kv = (FATA_VECHE[d]! & 7) as ClasaMaseiId
    const kn = (FATA_NOUA[d]! & 7) as ClasaMaseiId
    if (kv === kn && kv !== ClasaMasei.NIMIC) {
      adunaClasa(vec2(L.P, yn, sv), kv, 1)
      continue
    }
    if (kv !== ClasaMasei.NIMIC) {
      if (eClasaDeSol(kv)) adunaClasa(vec2(L.solOut, sv, FATA_VECHE[d]! >> 3), kv, 1)
      else adunaClasa(vec(L.altaOut, sv), kv, 1)
    }
    if (kn !== ClasaMasei.NIMIC) {
      if (eClasaDeSol(kn)) adunaClasa(vec2(L.solIn, yn, FATA_NOUA[d]! >> 3), kn, 1)
      else adunaClasa(vec(L.apare, yn), kn, 1)
    }
  }
  return true
}

/** Sursa aerului unei celule care n-a fost aer acoperit: cer dacă materialul ei de dinainte era aer, altfel sol. */
function origineCelulei(r: CititorCamere, x: number, y: number, z: number, vechi: MaterialeVechi): number {
  const v = vechi === null ? undefined : vechi.get(cheieCelula(x, y, z))
  // Needitată în lot: era aer și acum (acoperirea s-a schimbat), deci cer.
  if (v === undefined || v === Material.AER) return PROV_CER
  return PROV_SOL0 - adancimeIn(coloana(r, x, y), z)
}

/** Contoarele unei componente, pe înregistrările date de `inreg` (o funcție de slot). */
function sumaInregistrari(bucati: readonly number[], inreg: (b: number) => InregistrareFete | undefined, L: LucruMase): ContoareMasaMutabile {
  const acc = contoareGoale()
  L.bucatiCitite += bucati.length
  for (const b of bucati) {
    const e = inreg(b)
    if (e === undefined) {
      L.abateri++
      continue
    }
    adunaContoare(acc, e, 1)
  }
  return acc
}

function peAdancime(m: Map<number, ContoareMasaMutabile> | undefined): MasaPeAdancime[] {
  if (m === undefined) return []
  const out: MasaPeAdancime[] = []
  // determinism-ok: se sortează pe adâncime.
  for (const [d, masa] of m) out.push({ d, masa: { ...masa } })
  return out.sort((a, b) => a.d - b.d)
}

function sumaPeAdancime(xs: readonly MasaPeAdancime[], acc: ContoareMasaMutabile): void {
  for (const x of xs) adunaContoare(acc, x.masa, 1)
}

/**
 * Asamblează evidența: componentele noi `A` (pe ancoră) și cele vechi atinse (pe ancora veche), cu verificarea
 * identităților. `capNoua(y)` / `capVeche(s)` = contoarele lor; `obVechi(s)` = obiectul vechi; `restVechi`: la
 * recalcul `altaIese` e restul (identitatea veche nu se verifică).
 */
function asambleaza(L: LucruMase, idx: IndexCamere, A: ReadonlySet<number>, moarte: readonly number[], obVechi: (s: number) => Componenta | undefined, capNoua: (y: number, c: Componenta) => ContoareMasa, capVeche: (c: Componenta) => ContoareMasa, restVechi: boolean): EvidentaMase {
  const noi: MaseComponentaNoua[] = []
  const persista = new Map<number, ContoareMasaMutabile>()
  // determinism-ok: A se sortează pe ancoră mai jos; aici doar se adună.
  for (const y of A) {
    const comp = idx.comp.get(y)
    if (comp === undefined) {
      L.abateri++
      continue
    }
    const cap = capNoua(y, comp)
    const surse: SursaPersistenta[] = []
    const sum = contoareGoale()
    const ps = L.P.get(y)
    if (ps !== undefined) {
      // determinism-ok: sursele se sortează pe ancora veche.
      for (const [s, masa] of ps) {
        const ov = obVechi(s)
        if (ov === undefined) {
          L.abateri++
          continue
        }
        adunaContoare(vec(persista, s), masa, 1)
        // O masă persistentă negativă: o celulă scăzută din bucata ei fără să fi fost numărată acolo.
        if (masa.nAer < 0 || masa.nConstr < 0 || masa.nSolMasiv < 0 || masa.nApa < 0) L.abateri++
        if (masa.nAer === 0 && masa.nConstr === 0 && masa.nSolMasiv === 0 && masa.nApa === 0) continue
        surse.push({ id: s, ancora: ov.ancora, masa: { ...masa } })
        adunaContoare(sum, masa, 1)
      }
    }
    surse.sort((a, b) => a.ancora - b.ancora)
    const solIntra = peAdancime(L.solIn.get(y))
    sumaPeAdancime(solIntra, sum)
    const aparuta = { ...(L.apare.get(y) ?? contoareGoale()) }
    adunaContoare(sum, aparuta, 1)
    if (!egaleContoare(sum, cap)) L.abateri++
    const o = L.orig.get(y)
    const sol: { d: number; celule: number }[] = []
    if (o !== undefined) {
      // determinism-ok: se sortează pe adâncime.
      for (const [d, n] of o.sol) sol.push({ d, celule: n })
      sol.sort((a, b) => a.d - b.d)
    }
    noi.push({ id: y, ancora: comp.ancora, capacitate: cap, surse, solIntra, aparuta, origine: { cer: o?.cer ?? 0, sol, nec: o?.nec ?? 0 } })
  }
  noi.sort((a, b) => a.ancora - b.ancora)

  // Componentele vechi atinse: sursele, cele din care a ieșit masă, cele moarte.
  const B = new Set<number>(moarte)
  // determinism-ok: B se sortează pe ancora veche mai jos.
  for (const s of persista.keys()) B.add(s)
  // determinism-ok: idem.
  for (const s of L.solOut.keys()) B.add(s)
  // determinism-ok: idem.
  for (const s of L.altaOut.keys()) B.add(s)
  const vechi: MaseComponentaVeche[] = []
  // determinism-ok: rezultatul se sortează pe ancora veche.
  for (const s of B) {
    const ov = obVechi(s)
    if (ov === undefined) {
      L.abateri++
      continue
    }
    const cap = capVeche(ov)
    const pers = { ...(persista.get(s) ?? contoareGoale()) }
    const solIese = peAdancime(L.solOut.get(s))
    const alta = { ...(L.altaOut.get(s) ?? contoareGoale()) }
    const sum = contoareGoale()
    adunaContoare(sum, pers, 1)
    sumaPeAdancime(solIese, sum)
    if (restVechi) {
      // Recalculul: altaIese = ce rămâne din capacitatea veche (editările pierdute din inel nu se pot evalua).
      const r2 = { ...cap }
      adunaContoare(r2, sum, -1)
      vechi.push({ id: s, ancora: ov.ancora, capacitate: cap, persista: pers, solIese, altaIese: r2 })
      continue
    }
    adunaContoare(sum, alta, 1)
    if (!egaleContoare(sum, cap)) L.abateri++
    vechi.push({ id: s, ancora: ov.ancora, capacitate: cap, persista: pers, solIese, altaIese: alta })
  }
  vechi.sort((a, b) => a.ancora - b.ancora)
  return { noi, vechi, abateri: L.abateri }
}

/**
 * Evidența C3 a unui lot obișnuit (§3), pe indexul de DUPĂ el. Masa se schimbă doar pe articolele (aerul și
 * fețele) celulelor din `X ∪ N6(E)`: `X` = celulele editate și rulajele de aer de sub ele (lema din antetul
 * camere.ts: singurele a căror acoperire se poate schimba), `E` = cele editate (singurele al căror material se
 * schimbă). Acolo evaluarea e LOCALĂ, pe materialele vechi din jurnal; în rest masa persistă și doar se mută de la
 * componenta veche la cea nouă: celulă cu celulă în feliile refăcute, pe înregistrarea bucății în cele
 * supraviețuitoare (citită DUPĂ `actualizeazaFete`, deci cu fețele de acum).
 */
export function evidentaMaselor(idx: IndexCamere, r: CititorCamere, lot: readonly number[], vechi: MaterialeVechi, cap: CapturaLot, rf: RezultatFete, felii: readonly number[]): RezultatEvidenta {
  const noiSet = new Set(cap.noi)
  const L = lucruMase(idx.fete.dSolMasiv, noiSet)
  const refacute = new Set(felii)

  // Componentele noi atinse: cele refăcute, plus cele cu bucăți marcate de D+ (fețele lor s-au putut schimba).
  const A = new Set<number>(noiSet)
  const feteSchimbate: number[] = []
  for (const b of [...rf.marcate].sort((a, b2) => a - b2)) {
    if (idx.bVecini[b] === undefined) continue
    const c = idx.bComp[b]!
    if (c < 0 || A.has(c)) continue
    A.add(c)
    feteSchimbate.push(c)
  }

  // Celulele de evaluat local: X ∪ N6(E), sortate (cheia (z, y, x)).
  const aproape = new Set<number>()
  for (let i = 0; i < lot.length; i += 4) {
    const x = lot[i]!
    const y = lot[i + 1]!
    const z = lot[i + 2]!
    for (let zz = lot[i + 3]!; zz <= z; zz++) aproape.add(cheieCelula(x, y, zz))
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d]!
      const ny = y + DY[d]!
      if (nx < 0 || ny < 0 || nx >= WORLD_CELLS || ny >= WORLD_CELLS) continue
      aproape.add(cheieCelula(nx, ny, z + DZ[d]!))
    }
  }
  const compVeche = (x: number, y: number, z: number): number => {
    const kf = cheieFelie(Math.floor(x / FELIE), Math.floor(y / FELIE), z)
    const s = (y - Math.floor(y / FELIE) * FELIE) * FELIE + (x - Math.floor(x / FELIE) * FELIE)
    const arr = cap.compVecheCel.get(kf)
    if (arr !== undefined) return arr[s]!
    const b = bucataLa(idx, x, y, z)
    if (b < 0) return -1
    return cap.compVecheBucata.get(b) ?? idx.bComp[b]!
  }
  // Pe feliile refăcute, celulele de evaluat local ca mască (256 de celule): un Set pe celulă costa cât restul.
  const masca = new Map<number, Uint8Array>()
  for (const kc of [...aproape].sort((a, b) => a - b)) {
    const { x, y, z } = decodeazaCelula(kc)
    const bxc = Math.floor(x / FELIE)
    const byc = Math.floor(y / FELIE)
    const kfc = cheieFelie(bxc, byc, z)
    const inRefacuta = refacute.has(kfc)
    if (inRefacuta) {
      let m = masca.get(kfc)
      if (m === undefined) {
        m = new Uint8Array(FELIE * FELIE)
        masca.set(kfc, m)
      }
      m[(y - byc * FELIE) * FELIE + (x - bxc * FELIE)] = 1
    }
    const sv = compVeche(x, y, z)
    const b = bucataLa(idx, x, y, z)
    const yn = b < 0 ? -1 : idx.bComp[b]!
    if (sv < 0 && yn < 0) continue
    const origine = sv < 0 ? origineCelulei(r, x, y, z, vechi) : 0
    const schimbata = evalueazaCelula(L, r, x, y, z, sv, yn, vechi, origine, !inRefacuta && yn >= 0)
    if (inRefacuta && yn >= 0) adunaProv(L, yn, sv >= 0 ? sv : origine, 1)
    // O celulă cu masa schimbată într-o componentă pe care D+ n-a marcat-o: cache-ul de fețe ar fi vechi.
    if (schimbata && yn >= 0 && !A.has(yn)) {
      L.abateri++
      A.add(yn)
    }
  }

  // Feliile refăcute, în afara celulelor de mai sus: masa persistă. O bucată nouă „curată" (toate celulele ei din
  // aceeași componentă veche, niciuna de evaluat local) intră întreagă, pe înregistrarea ei; restul, celulă cu
  // celulă (o singură evaluare: vecinii lor n-au fost editați).
  for (const kf of felii) {
    const arr = cap.compVecheCel.get(kf)
    if (arr === undefined) continue
    const fn = idx.felii.get(kf)
    const { bx, by, z } = decodeazaFelie(kf)
    const m = masca.get(kf)
    // Bucata nouă → componenta veche comună a celulelor ei, sau −2 (amestecată, ori cu celule de evaluat local).
    const curata = new Map<number, number>()
    if (fn !== undefined) {
      for (let s = 0; s < FELIE * FELIE; s++) {
        const b = fn.cel[s]!
        if (b < 0) continue
        const sv = arr[s]!
        const c = curata.get(b)
        if (sv < 0 || (m !== undefined && m[s] === 1)) curata.set(b, -2)
        else if (c === undefined) curata.set(b, sv)
        else if (c !== sv) curata.set(b, -2)
      }
    }
    // determinism-ok: doar sume întregi pe bucăți; ordinea adunării nu contează.
    for (const [b, sv] of curata) {
      if (sv < 0) continue
      const e = idx.fete.inreg[b]
      if (e === undefined) {
        L.abateri++
        continue
      }
      adunaContoare(vec2(L.P, idx.bComp[b]!, sv), e, 1)
      adunaProv(L, idx.bComp[b]!, sv, idx.bCelule[b]!)
    }
    for (let s = 0; s < FELIE * FELIE; s++) {
      const sv = arr[s]!
      const b = fn === undefined ? -1 : fn.cel[s]!
      if (b >= 0 && curata.get(b)! >= 0) continue
      const yn = b < 0 ? -1 : idx.bComp[b]!
      if (sv < 0 && yn < 0) continue
      if (m !== undefined && m[s] === 1) continue
      const x = bx * FELIE + (s % FELIE)
      const y = by * FELIE + ((s / FELIE) | 0)
      if (sv < 0 || yn < 0) {
        // Acoperire schimbată în afara rulajelor lotului: lema ar fi greșită. Se evaluează local, ca să rămână
        // evidența întreagă, și se numără.
        L.abateri++
        const origine = sv < 0 ? origineCelulei(r, x, y, z, vechi) : 0
        evalueazaCelula(L, r, x, y, z, sv, yn, vechi, origine, false)
        if (yn >= 0) adunaProv(L, yn, sv >= 0 ? sv : origine, 1)
        continue
      }
      capacitateCelulei(r, x, y, z, L.dSolMasiv, null, vec2(L.P, yn, sv))
      adunaProv(L, yn, sv, 1)
    }
  }

  // Bucățile supraviețuitoare ale componentelor atinse: înregistrarea întreagă persistă din componenta lor veche. În
  // aceeași trecere se adună capacitatea componentei noi (O(bucăți), ca volumul — hub-ul minei e în `noi` la aproape
  // fiecare lot, cu ~1.550 de bucăți); bucățile noi și sloturile rescrise se recunosc după un marcaj, nu prin Set-uri.
  const mk = marcaje(idx.bFelie.length)
  for (const kf of felii) {
    const fn = idx.felii.get(kf)
    if (fn !== undefined) for (const b of fn.bucati) mk[b] = mk[b]! | 1
  }
  // determinism-ok: doar marchează sloturi; ordinea nu contează.
  for (const b of rf.inregVechi.keys()) mk[b] = mk[b]! | 2
  const capNoi = new Map<number, ContoareMasa>()
  const faraReparcurse = cap.compVecheBucata.size === 0
  for (const y of [...A].sort((a, b) => a - b)) {
    const comp = idx.comp.get(y)
    if (comp === undefined) continue
    // O componentă cu fețe atinse de D+ care nu e în `noi` (aceleași bucăți, același obiect, toate din ea însăși), cu C'
    // memorat pe obiectul ei: C' nou = memorat + Σ (înregistrarea nouă − cea veche) pe sloturile ei rescrise — O(lot), nu
    // O(componentă) (PROV-3: la 5.568 de bucăți, 121–166 µs pe lot față de 23–30 µs pe main).
    if (!noiSet.has(y)) {
      const v0 = CAP_COMPONENTA.get(comp)
      if (v0 !== undefined) {
        const tot = { nAer: v0.nAer, nConstr: v0.nConstr, nSolMasiv: v0.nSolMasiv, nApa: v0.nApa }
        // determinism-ok: sume întregi exacte; ordinea adunărilor nu contează.
        for (const [b, ev] of rf.inregVechi) {
          if (idx.bComp[b] !== y) continue
          const en = idx.fete.inreg[b]
          if (en === undefined || ev === undefined) {
            L.abateri++
            continue
          }
          tot.nAer += en.nAer - ev.nAer
          tot.nConstr += en.nConstr - ev.nConstr
          tot.nSolMasiv += en.nSolMasiv - ev.nSolMasiv
          tot.nApa += en.nApa - ev.nApa
        }
        adunaContoare(vec2(L.P, y, y), tot, 1)
        adunaProv(L, y, y, comp.volum)
        capNoi.set(y, tot)
        continue
      }
    }
    L.bucatiCitite += comp.bucati.length
    const tot = contoareGoale()
    let svUltim = -1
    let tinta: ContoareMasaMutabile | null = null
    let celule = 0
    for (const b of comp.bucati) {
      const e = idx.fete.inreg[b]
      if (e === undefined) {
        L.abateri++
        continue
      }
      tot.nAer += e.nAer
      tot.nConstr += e.nConstr
      tot.nSolMasiv += e.nSolMasiv
      tot.nApa += e.nApa
      if ((mk[b]! & 1) !== 0) continue
      const sv = faraReparcurse ? y : (cap.compVecheBucata.get(b) ?? y)
      if (sv !== svUltim || tinta === null) {
        if (celule > 0) adunaProv(L, y, svUltim, celule)
        tinta = vec2(L.P, y, sv)
        svUltim = sv
        celule = 0
      }
      tinta.nAer += e.nAer
      tinta.nConstr += e.nConstr
      tinta.nSolMasiv += e.nSolMasiv
      tinta.nApa += e.nApa
      celule += idx.bCelule[b]!
    }
    if (celule > 0) adunaProv(L, y, svUltim, celule)
    capNoi.set(y, tot)
  }

  const obVechi = (s: number): Componenta | undefined => cap.compVechi.get(s) ?? idx.comp.get(s)
  const capVeche = (c: Componenta): ContoareMasa => {
    // C'-ul de DINAINTE de lot al obiectului vechi: memoria lui e de la ultimul lot în care a fost în A (actualizată abia
    // după asamblare, mai jos), iar între timp înregistrările lui nu s-au rescris (atunci ar fi fost în A).
    const m0 = CAP_COMPONENTA.get(c)
    if (m0 !== undefined) return { nAer: m0.nAer, nConstr: m0.nConstr, nSolMasiv: m0.nSolMasiv, nApa: m0.nApa }
    L.bucatiCitite += c.bucati.length
    const acc = contoareGoale()
    for (const b of c.bucati) {
      const e = (mk[b]! & 2) !== 0 ? rf.inregVechi.get(b) : idx.fete.inreg[b]
      if (e === undefined) {
        L.abateri++
        continue
      }
      acc.nAer += e.nAer
      acc.nConstr += e.nConstr
      acc.nSolMasiv += e.nSolMasiv
      acc.nApa += e.nApa
    }
    return acc
  }
  const mase = asambleaza(L, idx, A, cap.moarte, obVechi, (y, c) => capNoi.get(y) ?? sumaInregistrari(c.bucati, (b) => idx.fete.inreg[b], L), capVeche, false)
  // C' memorat pe OBIECTUL componentei (după asamblare: `capVeche` de mai sus a citit memoria de dinainte de lot). E valabil
  // cât obiectul: orice schimbare a bucăților face un obiect nou (camere.ts: `componente`, `caleRapida`), iar înregistrările
  // se rescriu doar pe componentele din A (D+ și feliile refăcute) — deci pe cele de aici.
  // determinism-ok: doar scrie memoria pe obiecte; ordinea nu contează.
  for (const y of A) {
    const c = idx.comp.get(y)
    const t = capNoi.get(y)
    // O copie: `capNoi` ajunge în evidența întoarsă (`capacitate`), iar memoria nu trebuie să depindă de consumatorii ei.
    if (c !== undefined && t !== undefined) CAP_COMPONENTA.set(c, { nAer: t.nAer, nConstr: t.nConstr, nSolMasiv: t.nSolMasiv, nApa: t.nApa })
  }
  idx.fete.stat.bucatiEvidenta += L.bucatiCitite
  // Marcajul se golește: e o zgârietură comună tuturor loturilor.
  for (const kf of felii) {
    const fn = idx.felii.get(kf)
    if (fn !== undefined) for (const b of fn.bucati) mk[b] = 0
  }
  // determinism-ok: doar golește marcaje.
  for (const b of rf.inregVechi.keys()) mk[b] = 0
  feteSchimbate.sort((a, b) => idx.comp.get(a)!.ancora - idx.comp.get(b)!.ancora)
  return { mase, prov: L.prov, feteSchimbate }
}

/**
 * C' (contoarele) al fiecărei componente, memorat pe OBIECTUL ei de evidența maselor (PROV-3). DERIVED, TRANSIENT: o lume
 * încărcată pornește fără el și îl reface la primul lot al fiecărei componente — aceleași sume exacte, doar alt cost.
 */
const CAP_COMPONENTA = new WeakMap<Componenta, ContoareMasa>()

/** Zgârietura de marcaje pe sloturi de bucăți (TRANSIENTĂ, golită după fiecare lot), crescută la nevoie. */
let MARCAJ = new Uint8Array(64)
function marcaje(n: number): Uint8Array {
  if (MARCAJ.length < n) MARCAJ = new Uint8Array(Math.max(n, 2 * MARCAJ.length))
  return MARCAJ
}

/**
 * Evidența unui RECALCUL complet (lot > JURNAL_CAP, alt teren): pe indexul nou și instantaneul celui vechi (null
 * = alt teren, nicio suprapunere). Materialele vechi: `vechi` (partea validă a inelului, prima apariție), plus ce
 * se știe sigur din cele două indexuri — o celulă care era aer acoperit era AER; o celulă acoperită acum, care
 * nu era și nu e în inel, e NEC: sol natural sub `gNat`, cer deasupra (regula solului natural). Toate celulele
 * se evaluează local; ce nu se poate ști (editările ieșite din inel) ajunge în `altaIese`, ca rest.
 */
export function evidentaRecalcul(idx: IndexCamere, r: CititorCamere, inst: InstantaneuIndex | null, vechi: Map<number, number>): RezultatEvidenta {
  const noiSet = new Set<number>(idx.comp.keys())
  const L = lucruMase(idx.fete.dSolMasiv, noiSet)
  const compVeche = (x: number, y: number, z: number): number => {
    if (inst === null) return -1
    const bx = Math.floor(x / FELIE)
    const by = Math.floor(y / FELIE)
    const f = inst.felii.get(cheieFelie(bx, by, z))
    if (f === undefined) return -1
    const b = f.cel[(y - by * FELIE) * FELIE + (x - bx * FELIE)]!
    return b < 0 ? -1 : inst.bComp[b]!
  }
  // Celulele: cele de aer acoperit acum, apoi cele care erau și nu mai sunt.
  const celule: number[] = []
  for (const kf of idx.chei) {
    const f = idx.felii.get(kf)!
    const { bx, by, z } = decodeazaFelie(kf)
    for (let s = 0; s < FELIE * FELIE; s++) if (f.cel[s]! >= 0) celule.push(cheieCelula(bx * FELIE + (s % FELIE), by * FELIE + ((s / FELIE) | 0), z))
  }
  // Celulele de aer acoperit ale indexului vechi.
  const vechiAcoperite = new Set<number>()
  if (inst !== null) {
    for (const kf of [...inst.felii.keys()].sort((a, b) => a - b)) {
      const f = inst.felii.get(kf)!
      const { bx, by, z } = decodeazaFelie(kf)
      for (let s = 0; s < FELIE * FELIE; s++) {
        if (f.cel[s]! < 0) continue
        const x = bx * FELIE + (s % FELIE)
        const y = by * FELIE + ((s / FELIE) | 0)
        const kc = cheieCelula(x, y, z)
        vechiAcoperite.add(kc)
        if (bucataLa(idx, x, y, z) >= 0) continue
        // Era aer acoperit și nu mai e: materialul ei de dinainte era AER, oricum ar spune inelul.
        vechi.set(kc, Material.AER)
        celule.push(kc)
      }
    }
  }
  // Acoperite acum, n-au fost aer acoperit, nu sunt în inel: NEC, după solul natural. Materialul presupus intră în
  // `vechi` doar dacă o celulă veche are o față spre ea; originea se scrie direct.
  const necunoscute = new Map<number, number>()
  for (const kc of celule) {
    if (vechi.has(kc) || vechiAcoperite.has(kc)) continue
    const { x, y, z } = decodeazaCelula(kc)
    const col = coloana(r, x, y)
    const sub = z <= col.gNat
    necunoscute.set(kc, sub ? PROV_NEC_SOL0 - adancimeIn(col, z) : PROV_NEC_CER)
    let langaVeche = false
    for (let d = 0; d < 6 && !langaVeche; d++) {
      const nx = x + DX[d]!
      const ny = y + DY[d]!
      if (nx < 0 || ny < 0 || nx >= WORLD_CELLS || ny >= WORLD_CELLS) continue
      langaVeche = vechiAcoperite.has(cheieCelula(nx, ny, z + DZ[d]!))
    }
    if (langaVeche) vechi.set(kc, sub ? Material.PAMANT : Material.AER)
  }
  celule.sort((a, b) => a - b)
  const atinsa = (x: number, y: number, z: number): boolean => {
    if (vechi.has(cheieCelula(x, y, z))) return true
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d]!
      const ny = y + DY[d]!
      if (nx < 0 || ny < 0 || nx >= WORLD_CELLS || ny >= WORLD_CELLS) continue
      if (vechi.has(cheieCelula(nx, ny, z + DZ[d]!))) return true
    }
    return false
  }
  for (const kc of celule) {
    const { x, y, z } = decodeazaCelula(kc)
    const sv = compVeche(x, y, z)
    const b = bucataLa(idx, x, y, z)
    const yn = b < 0 ? -1 : idx.bComp[b]!
    if (sv >= 0 && yn >= 0 && !atinsa(x, y, z)) {
      // Nici ea, nici vecinii ei nu s-au schimbat (după ce se știe): masa ei persistă, o singură evaluare.
      capacitateCelulei(r, x, y, z, L.dSolMasiv, null, vec2(L.P, yn, sv))
      adunaProv(L, yn, sv, 1)
      continue
    }
    const origine = sv >= 0 ? 0 : (necunoscute.get(kc) ?? origineCelulei(r, x, y, z, vechi))
    evalueazaCelula(L, r, x, y, z, sv, yn, vechi, origine, false)
    if (yn >= 0) adunaProv(L, yn, sv >= 0 ? sv : origine, 1)
  }
  const moarte = inst === null ? [] : [...inst.comp.keys()].sort((a, b) => a - b)
  const obVechi = (s: number): Componenta | undefined => (inst === null ? undefined : inst.comp.get(s))
  const mase = asambleaza(L, idx, noiSet, moarte, obVechi, (_y, c) => sumaInregistrari(c.bucati, (b) => idx.fete.inreg[b], L), (c) => sumaInregistrari(c.bucati, (b) => inst?.inreg[b], L), true)
  return { mase, prov: L.prov, feteSchimbate: [] }
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
