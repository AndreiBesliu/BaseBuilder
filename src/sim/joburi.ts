/**
 * Joburile — S16-19, taietura 1: desemnari → joburi → sapat.
 *
 * Arhitectura e PULL, nu push (DESIGN §5.4): munca nu se impinge catre pioni,
 * pionul liber CERE un job cand ii vine randul. Nicio coada globala de joburi —
 * costul invalidarii ei la fiecare schimbare de lume o face imposibil de
 * intretinut de un singur om.
 *
 * ## Scanarea, in doua treceri
 *
 * **Trecerea ieftina**, peste TOATE desemnarile vii, in ordinea slotului (ordine
 * PERSISTED, identica in lumea continua si in cea incarcata): racire pe
 * desemnare, racire pe perechea (pion, tinta), distanta Manhattan, rezervare. Nu
 * atinge terenul. Ce trece e un candidat cu o MARGINE SUPERIOARA de scor: celula
 * de lucru e la cel mult `1 + maxStepM` de desemnare, deci scorul real nu poate
 * depasi scorul calculat cu distanta pana la desemnare minus atat.
 *
 * **Trecerea scumpa**, pe candidatii sortati dupa margine (descrescator, apoi
 * id): locul de lucru si componenta. Plafonata de `jobScanMaxCandidates` si
 * oprita devreme cand cel mai bun scor REAL bate marginea urmatorului candidat —
 * de acolo incolo nimeni nu-l mai poate intrece.
 *
 * De ce nu „in ordinea slotului, primele 256": panoul de design a aratat ca asa
 * o camera de 16×16 desemnata inaintea rampei ei nu s-ar sapa niciodata — cele
 * 256 de celule fara loc de lucru ar consuma plafonul la fiecare scanare, iar
 * rampa, in sloturile de dupa, n-ar fi evaluata de nimeni, vreodata. Sortarea pe
 * margine face plafonul sa taie DEPARTELE, nu arbitrarul; memorarea refuzurilor
 * pe desemnare (racire scurta) face ca plafonul sa se cheltuie pe candidati noi.
 * Recenzia codului a aratat ca memorarea trebuie sa acopere AMBELE refuzuri
 * scumpe — si „fara loc de lucru", si „componente diferite" — altfel 300 de
 * pereti de sant intr-o alta componenta infometau la fel de bine.
 *
 * In bucla de scan nu se porneste NICIODATA un A* (research: „in bucla de scan
 * ai voie doar canReach si distanta; A* o singura data, la start").
 *
 * ## Scorul, in intregi
 *
 * `2^prioTask × 4^prioPersonala / (1 + costDrum)` — regula pentru jucator:
 * „+1 nivel de prioritate merita jumatate din drum". Fara impartire si fara
 * float: A bate B daca `2^(pA + 2(qA−1)) · (1 + dB) > 2^(pB + 2(qB−1)) · (1 + dA)`.
 *
 * ## Racirea urmeaza SCOPUL predicatului
 *
 * Un refuz e fie o proprietate a TINTEI (n-are niciun loc de lucru; niciunul in
 * componenta celui care intreaba), fie a PERECHII (drumul acestui pion e blocat
 * de un ostil, sau e peste bugetul lui). Prima se scrie pe desemnare, cu racire
 * scurta: nimeni n-o evalueaza o vreme. A doua se scrie pe pion, intr-o multime
 * marginita de perechi: EL n-o reia o vreme, dar altcineva poate.
 *
 * ## Acoperirea se intinde spre munca, nu spre hoinareala
 *
 * Reachability-ul se evalueaza numai pe blocuri LEGATE. Discul unui pion e
 * ancorat la nastere, iar hoinareala nu iese din blocurile legate — altfel
 * fiecare pas ar cere un inel nou si acoperirea ar creste nemarginit (masurat:
 * 124.000 de blocuri la 20.000 de tickuri). Cand o tinta pare in alta componenta,
 * scannerul intinde O DATA un coridor de blocuri intre pion si tinta, memoizat
 * prin acoperirea persistata; abia daca nici asa nu sunt legate, refuzul e
 * onest. Coridoarele sunt ancorate de desemnari, deci acoperirea creste cu
 * munca ceruta de jucator, nu cu plimbarea.
 *
 * ## Fiecare „nu" poarta cauza; politica de preemptiune
 *
 * Scannerul nu intoarce `null`: cauza se scrie pe desemnare si pe pion. Un job
 * in curs e intrerupt DOAR de o nevoie critica (nu exista inca), de pericol (nu
 * exista inca) sau de un ordin direct al jucatorului. Un job nou cu scor mai bun
 * NU intrerupe.
 *
 * ## Garda anti-bucla
 *
 * NU e contorul „10 joburi intr-un tick": aici un agent porneste cel mult un job
 * per tick de scanare. Ce apara: racirea pe desemnare, multimea de raciri pe
 * pereche, `jobMaxIncercari` pe job, si zavorul `ratiune.joburiFaraProgres`
 * (per lume, asertat in teste).
 */

import type { Rules } from './content.ts'
import type { Outcome, ReasonCode } from './result.ts'
import { accept, codMotiv, refuse, Reason } from './result.ts'
import type { World } from './state.ts'
import { Categorie, CATEGORII, PasJob } from './state.ts'
import { cellOf, clearPath } from './drumuri.ts'
import { blockOfCell, ensureArea, find, isWalkable, markDirty, NO_REGION, regionAt, REGION_SIZE } from './regions.ts'
import type { RegionStore } from './regions.ts'
import type { Terrain } from './terrain/terrain.ts'
import { dig } from './terrain/terrain.ts'
import { cellKey } from './path.ts'
import { desemnareLaCelula, DetaliuMotiv, slotDesemnare, stergeDesemnare } from './desemnari.ts'
import type { DesignationStore } from './desemnari.ts'
import type { Cerere } from './rezervari.ts'
import { elibereaza, elibereazaTinta, poateRezerva, rezervaToate, Strat } from './rezervari.ts'

// ---------------------------------------------------------------------------
// ratiunea — TRANSIENT
// ---------------------------------------------------------------------------

/** In ce s-a incheiat ultima scanare a unui pion. Stari interne, nu refuzuri de Outcome. */
export const StareRatiune = {
  /** N-a scanat inca. */
  NIMIC: 0,
  /** A pornit un job. */
  JOB: 1,
  /** Nu exista nicio desemnare vie. */
  NIMIC_DE_FACUT: 2,
  /** Toate candidatele erau in racire (a lor, sau a perechii cu el). */
  IN_ASTEPTARE: 3,
  /** Au fost candidate, toate respinse; `motivFinal` spune de ce cea mai avansata. */
  RESPINS: 4,
  /** Plafonul de evaluari scumpe s-a atins fara sa gaseasca ceva; `taiati` spune cate au ramas. */
  PLAFON: 5,
  /** Are job, dar drumul ii e refuzat si asteapta; `motivFinal` spune de ce. */
  ASTEAPTA_DRUM: 6,
} as const

/**
 * De ce sta fiecare pion. Prima forma a tabului „Ratiune" din panoul pionului
 * (research/pawn-ai.md): feature de produs, nu unealta de dev.
 *
 * TRANSIENT: nu influenteaza nicio decizie, nu intra in hash, nu se salveaza.
 */
export interface RatiuneStore {
  /** Tickul ultimei scanari. -1 = niciodata. */
  readonly ultimaScanareTick: Int32Array
  /** `StareRatiune`. */
  readonly stare: Uint8Array
  /** Cate evaluari scumpe a facut ultima scanare. */
  readonly candidati: Int32Array
  /** Cati candidati au ramas neevaluati din cauza plafonului. */
  readonly taiati: Int32Array
  /** `codMotiv` al cauzei celei mai „avansate" din ultima scanare fara job, sau al asteptarii de drum. */
  readonly motivFinal: Uint8Array
  /**
   * ZAVOR, per lume: joburi incheiate INCOMPLET fara nicio unitate de munca —
   * refuzuri ale lumii, nu ordine ale jucatorului. Se aduna pe toata rularea si
   * se aserteaza in teste. Sta aici, nu in raportul de tick, ca sa nu fie stare
   * de PROCES care depinde de ordinea testelor.
   */
  joburiFaraProgres: number
}

export function makeRatiuneStore(capacity: number): RatiuneStore {
  return {
    ultimaScanareTick: new Int32Array(capacity).fill(-1),
    stare: new Uint8Array(capacity),
    candidati: new Int32Array(capacity),
    taiati: new Int32Array(capacity),
    motivFinal: new Uint8Array(capacity),
    joburiFaraProgres: 0,
  }
}

// ---------------------------------------------------------------------------
// raportul de tick — TRANSIENT
// ---------------------------------------------------------------------------

export interface JobTickReport {
  /** Cati pioni au cerut de lucru in tickul asta. */
  scanari: number
  /** Cate evaluari SCUMPE (loc de lucru + componenta) s-au facut. */
  candidatiExaminati: number
  /** Cati candidati au ramas neevaluati din cauza plafonului, insumat. */
  candidatiTaiati: number
  /** Cate coridoare de acoperire s-au intins (fiecare e cateva blocuri, memoizate). */
  coridoare: number
  joburiPornite: number
  joburiTerminate: number
  /** Incheiate altfel decat TERMINAT: incomplete sau intrerupte. */
  joburiAnulate: number
  /** Cati pioni au muncit efectiv (pasul LUCREAZA) in tickul asta. */
  tickuriDeLucru: number
  /** De cate ori un job si-a schimbat celula de lucru fara sa se incheie. */
  locuriDeLucruRefacute: number
  /** Cate refuzuri de drum au primit joburile in tickul asta. */
  refuzuriDrum: number
  /** Respingeri per cauza, in tickul asta. */
  faraMuncitor: number
  preaDeparte: number
  inaccesibil: number
  rezervat: number
}

const raport: JobTickReport = {
  scanari: 0, candidatiExaminati: 0, candidatiTaiati: 0, coridoare: 0,
  joburiPornite: 0, joburiTerminate: 0, joburiAnulate: 0,
  tickuriDeLucru: 0, locuriDeLucruRefacute: 0, refuzuriDrum: 0,
  faraMuncitor: 0, preaDeparte: 0, inaccesibil: 0, rezervat: 0,
}

export function lastJobReport(): JobTickReport {
  return raport
}

/** Se cheama la inceputul fiecarui tick de agenti. */
export function resetJobReport(): void {
  raport.scanari = 0
  raport.candidatiExaminati = 0
  raport.candidatiTaiati = 0
  raport.coridoare = 0
  raport.joburiPornite = 0
  raport.joburiTerminate = 0
  raport.joburiAnulate = 0
  raport.tickuriDeLucru = 0
  raport.locuriDeLucruRefacute = 0
  raport.refuzuriDrum = 0
  raport.faraMuncitor = 0
  raport.preaDeparte = 0
  raport.inaccesibil = 0
  raport.rezervat = 0
}

/**
 * Cat de „avansata" e o cauza: cat de aproape de reusita a ajuns candidatul.
 * O tinta REZERVATA e una perfect valida pe care o face altcineva; una
 * INACCESIBILA e una la care nu se ajunge; PREA_DEPARTE nici n-a fost evaluata.
 */
function rang(r: ReasonCode): number {
  switch (r) {
    case Reason.FARA_MUNCITOR: return 1
    case Reason.PREA_DEPARTE: return 2
    case Reason.INACCESIBIL: return 3
    case Reason.REZERVAT: return 4
    default: return 0
  }
}

// ---------------------------------------------------------------------------
// ce cere un job
// ---------------------------------------------------------------------------

/**
 * Cererile de rezervare ale unui job, calculate INAINTE de start si identic la
 * reconstructia de dupa incarcare. Functie pura de (fel, tinta).
 *
 * Sapatul: un singur sapator pe un voxel. `count`/`maxCount` sunt 1/1 fiindca un
 * voxel nu se imparte; dimensiunea exista pentru mormanele de mai tarziu.
 */
export function cereriPentru(kind: number, targetId: number): readonly Cerere[] {
  void kind
  return [{ targetId, layer: Strat.LUCRU, count: 1, maxCount: 1, maxClaimants: 1 }]
}

// ---------------------------------------------------------------------------
// scorul
// ---------------------------------------------------------------------------

/**
 * A e strict mai bun decat B?
 *
 * `prio` in 1..designationPriorityLevels, `pers` in 1..personalPriorityLevels,
 * `dist` in celule (Manhattan). Cu prio ≤ 9 si pers ≤ 9 exponentul e ≤ 25, iar
 * distanta ≤ 2·16384, deci produsul ramane sub 2^41 — sigur ca intreg JS.
 */
export function maiBun(prioA: number, persA: number, distA: number, prioB: number, persB: number, distB: number): boolean {
  const gA = 2 ** (prioA + 2 * (persA - 1))
  const gB = 2 ** (prioB + 2 * (persB - 1))
  return gA * (1 + distB) > gB * (1 + distA)
}

// ---------------------------------------------------------------------------
// racirea pe pereche — o multime marginita per pion
// ---------------------------------------------------------------------------

/** E tinta in racire pentru pionul asta, la tickul asta? */
export function esteEvitata(w: World, slot: number, targetId: number): boolean {
  const a = w.agents
  const k = a.evitaSloturi
  const baza = slot * k
  for (let i = 0; i < k; i++) {
    if (a.evitaTinta[baza + i] === targetId && a.evitaPanaLa[baza + i]! > w.tick) return true
  }
  return false
}

/**
 * Scrie o racire pe perechea (pion, tinta). Daca tinta e deja acolo, i se
 * prelungeste termenul; altfel ia un slot liber sau expirat, iar daca nu e
 * niciunul, il ia pe cel cu termenul cel mai mic (cea mai veche). Determinist:
 * ordinea sloturilor e fixa.
 */
export function evitaTinta(w: World, slot: number, targetId: number, panaLa: number): void {
  const a = w.agents
  const k = a.evitaSloturi
  const baza = slot * k
  let liber = -1
  let celMaiVechi = 0
  for (let i = 0; i < k; i++) {
    if (a.evitaTinta[baza + i] === targetId) { a.evitaPanaLa[baza + i] = panaLa; return }
    if (liber === -1 && (a.evitaTinta[baza + i] === 0 || a.evitaPanaLa[baza + i]! <= w.tick)) liber = i
    if (a.evitaPanaLa[baza + i]! < a.evitaPanaLa[baza + celMaiVechi]!) celMaiVechi = i
  }
  const i = liber === -1 ? celMaiVechi : liber
  a.evitaTinta[baza + i] = targetId
  a.evitaPanaLa[baza + i] = panaLa
}

/** Goleste toate racirile pe pereche ale unui slot (la nastere, la anularea de la incarcare). */
export function uitaTintele(w: World, slot: number): void {
  const a = w.agents
  const k = a.evitaSloturi
  a.evitaTinta.fill(0, slot * k, slot * k + k)
  a.evitaPanaLa.fill(0, slot * k, slot * k + k)
}

// ---------------------------------------------------------------------------
// locul de lucru — K01 se declanseaza aici
// ---------------------------------------------------------------------------

const DIRECTII = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * De unde se sapa voxelul (wx, wy, z).
 *
 * PLAN K01 numeste momentul asta — „prima data cand scriu cod care cauta o
 * pozitie de lucru libera in jurul unei tinte" — drept semnalul de alarma al
 * gropii fara fund a genului. De aia e scris cat de ingust se poate:
 *
 *   - cei 4 vecini ORIZONTALI, niciodata voxelul insusi: dupa sapare podeaua
 *     dispare, iar `isWalkable` cere podea solida; un pion care isi sapa celula
 *     de sub picioare ar ramane in aer.
 *   - nici o celula a carei PODEA e o desemnare vie: altfel pionul A sta pe
 *     voxelul lui B, B il sapa, A cade — si abandoneaza cu un motiv care minte.
 *     Intr-o zona pictata asta ar fi regula, nu exceptia.
 *   - nivelurile `z ± maxStepM`, in ordine FIXA: intai z, apoi +1, −1, +2, −2…
 *   - prima celula intr-o regiune calculata, calcabila SI — daca se cere — in
 *     componenta `comp` castiga. Recenzia a aratat de ce componenta intra aici,
 *     nu dupa: primul vecin in ordinea fixa putea fi fundul unei gropi izolate,
 *     iar treapta legata de suprafata, mai tarziu in ordine, nu era privita
 *     niciodata; tinta era respinsa cu „leaga zonele" pentru zone legate.
 *   - `evita` (o cheie de celula) sare peste un loc anume — cel ocupat de un
 *     ostil, cand se cauta o alternativa.
 *
 * `regionAt` se intreaba INAINTE de `isWalkable`: o citire dintr-un Map fata de
 * trei `materialAt` cu decodare RLE. `isWalkable` ramane pe celula gasita ca sa
 * prinda asimetria din acelasi tick (o sapatura de la slotul i poate scoate
 * podeaua de sub o celula pe care regiunile o mai declara vie pana la
 * reconstructie).
 *
 * `null` inseamna „nu exista loc de lucru" cu conditiile date. Cauza o scrie
 * apelantul, dupa cum a intrebat: fara componenta = n-are niciun loc; cu
 * componenta = are, dar nu pentru cine intreaba.
 */
export function celulaDeLucru(
  t: Terrain,
  s: RegionStore,
  d: DesignationStore,
  wx: number,
  wy: number,
  z: number,
  rules: Rules,
  comp: number = NO_REGION,
  evita = -1,
): { wx: number; wy: number; z: number } | null {
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  for (let dz = 0; dz <= pas; dz++) {
    for (const zs of dz === 0 ? [z] : [z + dz, z - dz]) {
      for (const [dx, dy] of DIRECTII) {
        const nx = wx + dx
        const ny = wy + dy
        if (nx < 0 || ny < 0) continue
        const r = regionAt(s, nx, ny, zs)
        if (r === NO_REGION) continue
        if (comp !== NO_REGION && find(s, r) !== comp) continue
        const cheie = cellKey(nx, ny, zs)
        if (cheie === evita) continue
        if (d.laCelula.has(cellKey(nx, ny, zs - 1))) continue
        if (!isWalkable(t, nx, ny, zs, rules)) continue
        return { wx: nx, wy: ny, z: zs }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// acoperirea
// ---------------------------------------------------------------------------

/**
 * Acoperirea de regiuni din jurul unei desemnari noi. Raza e legata de raza de
 * scanare printr-un invariant validat in `parseRules` (content.ts). Acoperirea e
 * PERSISTED prin extinderea ei (save.ts), deci ramane reproductibila.
 */
export function acoperaDesemnarea(w: World, rules: Rules, wx: number, wy: number, z: number): void {
  ensureArea(w.terrain, w.regions, wx, wy, z, rules.jobRegionRadiusBlocks, rules)
}

/**
 * Un coridor de blocuri legate intre doua celule: Bresenham pe coordonate de
 * bloc, cu un bloc de fiecare parte. Memoizat prin `legate`, deci a doua cerere
 * pe acelasi drum nu costa nimic. Intoarce `true` daca s-a legat ceva nou.
 *
 * Exista fiindca invariantul „discul pionului si al desemnarii se ating"
 * presupune pionul in CENTRUL discului lui, si el nu e acolo: e nascut in
 * discul altuia, sau a mers la un job la 90 de celule. Coridorul se intinde
 * DOAR spre o desemnare, deci acoperirea creste cu munca, nu cu hoinareala.
 */
export function acoperaCoridor(w: World, rules: Rules, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const s = w.regions
  const legateInainte = s.legate.size
  const a = blockOfCell(ax, ay)
  const b = blockOfCell(bx, by)
  let x = a.bx
  let y = a.by
  const dx = Math.abs(b.bx - a.bx)
  const dy = Math.abs(b.by - a.by)
  const sx = a.bx < b.bx ? 1 : -1
  const sy = a.by < b.by ? 1 : -1
  let err = dx - dy
  const pasi = dx + dy
  for (let i = 0; ; i++) {
    // Cota se interpoleaza liniar intre capete; `ensureArea` citeste oricum
    // relieful blocului si acopera de acolo.
    const z = pasi === 0 ? az : az + Math.round(((bz - az) * i) / pasi)
    ensureArea(w.terrain, s, x * REGION_SIZE + (REGION_SIZE >> 1), y * REGION_SIZE + (REGION_SIZE >> 1), z, 1, rules)
    if (x === b.bx && y === b.by) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
  }
  if (s.legate.size !== legateInainte) {
    raport.coridoare++
    return true
  }
  return false
}

/**
 * Cat sta o desemnare in racire dupa un refuz scump. Cel putin
 * `jobInfeasibleRetryTicks`; dar cu multe desemnari vii si un plafon mic de
 * evaluari, fereastra trebuie sa acopere TOATE desemnarile inainte ca primele
 * sa expire, altfel plafonul nu ajunge niciodata la coada (recenzia: cu 1700 de
 * desemnari fara loc si racire de 100, exact 1024 primeau vreodata un motiv).
 * Derivat din stare persistata (`vii`), deci acelasi in orice lume.
 */
function racireDesemnare(w: World, rules: Rules): number {
  // `+ 1`: fereastra trebuie sa fie STRICT mai lunga decat scanarile necesare,
  // altfel prima transa expira exact cand scanarea ar fi ajuns la coada.
  const scanari = Math.ceil(w.desemnari.vii / rules.jobScanMaxCandidates) + 1
  return Math.max(rules.jobInfeasibleRetryTicks, rules.jobRescanTicks * scanari)
}

// ---------------------------------------------------------------------------
// scanarea
// ---------------------------------------------------------------------------

/** Buffere de candidati, refolosite intre scanari. Zero alocari in regim stabil. */
let candSlot: number[] = []
let candDist: number[] = []
let candG: number[] = []

/**
 * Un pion liber cere de lucru. Intoarce `true` daca a pornit un job.
 *
 * Apelantul decide CAND (decalajul pe id e al lui `stepAgents`) si CINE (doar
 * asezarea); aici se decide CE. Agentul trebuie sa fie viu, intr-o regiune, si
 * fara job.
 */
export function cautaJob(w: World, rules: Rules, slot: number): boolean {
  const a = w.agents
  const d = w.desemnari
  const rat = w.ratiune
  raport.scanari++
  rat.ultimaScanareTick[slot] = w.tick
  rat.candidati[slot] = 0
  rat.taiati[slot] = 0
  rat.motivFinal[slot] = 0

  // shouldSkip, in O(1): nimic de facut, sau pionul nu face asta.
  if (d.vii === 0) {
    rat.stare[slot] = StareRatiune.NIMIC_DE_FACUT
    return false
  }
  const pers = a.prioPersonala[slot * CATEGORII + Categorie.SAPA]!
  if (pers === 0) {
    raport.faraMuncitor++
    rat.stare[slot] = StareRatiune.RESPINS
    rat.motivFinal[slot] = codMotiv(Reason.FARA_MUNCITOR)
    return false
  }

  const ax = cellOf(a.x[slot]!)
  const ay = cellOf(a.y[slot]!)
  const az = a.z[slot]!
  let compAgent = find(w.regions, regionAt(w.regions, ax, ay, az))
  const eu = a.id[slot]!
  // Celula de lucru e la cel mult atat de desemnare; marginea de scor foloseste
  // distanta pana la desemnare minus atat.
  const margine = 1 + Math.max(0, Math.min(4, rules.maxStepM))

  let celMaiAvansat: ReasonCode | null = null
  const noteaza = (r: ReasonCode): void => {
    if (celMaiAvansat === null || rang(r) > rang(celMaiAvansat)) celMaiAvansat = r
  }

  // --- trecerea ieftina: porti fara teren, peste tot ---
  let n = 0
  let inRacire = 0
  for (let s = 0; s < d.count; s++) {
    if (d.alive[s] === 0) continue
    if (d.reincercaLaTick[s]! > w.tick || esteEvitata(w, slot, d.id[s]!)) { inRacire++; continue }

    const dist0 = Math.abs(d.wx[s]! - ax) + Math.abs(d.wy[s]! - ay) + Math.abs(d.z[s]! - az)
    if (dist0 > rules.jobScanRadiusCells) {
      raport.preaDeparte++
      noteaza(Reason.PREA_DEPARTE)
      continue
    }

    let rezervata = false
    for (const c of cereriPentru(d.kind[s]!, d.id[s]!)) {
      if (!poateRezerva(w.rezervari, eu, c).ok) { rezervata = true; break }
    }
    if (rezervata) {
      raport.rezervat++
      noteaza(Reason.REZERVAT)
      continue
    }

    candSlot[n] = s
    candDist[n] = Math.max(0, dist0 - margine)
    candG[n] = 2 ** d.prioritate[s]!
    n++
  }

  if (n === 0) {
    if (celMaiAvansat === null) {
      rat.stare[slot] = inRacire > 0 ? StareRatiune.IN_ASTEPTARE : StareRatiune.NIMIC_DE_FACUT
    } else {
      rat.stare[slot] = StareRatiune.RESPINS
      rat.motivFinal[slot] = codMotiv(celMaiAvansat)
    }
    return false
  }

  // --- ordinea: dupa marginea superioara a scorului, descrescator; apoi id ---
  //
  // Ordine TOTALA pe date persistate (prioritate, distanta, id), deci aceeasi in
  // orice lume cu aceeasi stare. Marginea e `2^prio / (1 + dist')`; comparatia
  // e cea din `maiBun`, cu prioritatea personala constanta (e a pionului).
  // Cheile sunt precalculate: comparatorul nu face `2 **`.
  const ordine: number[] = []
  for (let i = 0; i < n; i++) ordine.push(i)
  ordine.sort((i, j) => {
    const li = candG[i]! * (1 + candDist[j]!)
    const lj = candG[j]! * (1 + candDist[i]!)
    if (li !== lj) return li > lj ? -1 : 1
    return d.id[candSlot[i]!]! - d.id[candSlot[j]!]!
  })

  // --- trecerea scumpa: loc de lucru si componenta, pe primele K ---
  let best = -1
  let bestPrio = 0
  let bestDist = 0
  let bestWork: { wx: number; wy: number; z: number } | null = null
  let scumpe = 0
  let taiati = 0

  for (let k = 0; k < n; k++) {
    const i = ordine[k]!
    const s = candSlot[i]!
    const prio = d.prioritate[s]!

    // Nimeni de aici incolo nu mai poate intrece cel mai bun scor real: marginea
    // lui e sub el, si urmatorii au margini si mai mici.
    if (best !== -1 && maiBun(bestPrio, pers, bestDist, prio, pers, candDist[i]!)) break

    if (scumpe >= rules.jobScanMaxCandidates) {
      taiati = n - k
      break
    }
    scumpe++
    raport.candidatiExaminati++

    let work = celulaDeLucru(w.terrain, w.regions, d, d.wx[s]!, d.wy[s]!, d.z[s]!, rules, compAgent)
    if (!work) {
      const oricare = celulaDeLucru(w.terrain, w.regions, d, d.wx[s]!, d.wy[s]!, d.z[s]!, rules)
      if (!oricare) {
        // Proprietate a TINTEI: niciun vecin pe care sa se poata sta.
        raport.inaccesibil++
        d.ultimulMotiv[s] = codMotiv(Reason.INACCESIBIL)
        d.ultimulMotivDetaliu[s] = DetaliuMotiv.FARA_LOC_DE_LUCRU
        d.reincercaLaTick[s] = w.tick + racireDesemnare(w, rules)
        noteaza(Reason.INACCESIBIL)
        continue
      }
      // Are loc, dar nu in componenta pionului. Inainte sa spunem „leaga zonele",
      // ne asiguram ca golul nu e doar acoperire necalculata: un coridor, o data.
      if (acoperaCoridor(w, rules, ax, ay, az, d.wx[s]!, d.wy[s]!, d.z[s]!)) {
        compAgent = find(w.regions, regionAt(w.regions, ax, ay, az))
        work = celulaDeLucru(w.terrain, w.regions, d, d.wx[s]!, d.wy[s]!, d.z[s]!, rules, compAgent)
      }
      if (!work) {
        // Acum e onest: componente diferite. Se memoreaza pe tinta cu racire
        // scurta — altfel 300 de pereti de sant intr-o alta componenta ar
        // consuma plafonul la fiecare scanare si ar ascunde tot ce e dupa ei.
        raport.inaccesibil++
        d.ultimulMotiv[s] = codMotiv(Reason.INACCESIBIL)
        d.ultimulMotivDetaliu[s] = DetaliuMotiv.COMPONENTE_DIFERITE
        d.reincercaLaTick[s] = w.tick + racireDesemnare(w, rules)
        noteaza(Reason.INACCESIBIL)
        continue
      }
    }

    const dist = Math.abs(work.wx - ax) + Math.abs(work.wy - ay) + Math.abs(work.z - az)
    if (best === -1 || maiBun(prio, pers, dist, bestPrio, pers, bestDist)) {
      best = s
      bestPrio = prio
      bestDist = dist
      bestWork = work
    }
    // Egalitate de scor real: candidatii vin deja in ordinea id-ului la margini
    // egale, iar la margini diferite cel cu marginea mai mare a fost evaluat
    // primul si ramane — „primul evaluat castiga la egalitate" e o regula fixa.
  }

  rat.candidati[slot] = scumpe
  rat.taiati[slot] = taiati
  raport.candidatiTaiati += taiati

  if (best === -1 || !bestWork) {
    if (taiati > 0) rat.stare[slot] = StareRatiune.PLAFON
    else rat.stare[slot] = StareRatiune.RESPINS
    rat.motivFinal[slot] = celMaiAvansat === null ? 0 : codMotiv(celMaiAvansat)
    return false
  }

  const out = pornesteJob(w, slot, best, bestWork)
  if (!out.ok) {
    // Verificat la scan, refuzat la start: intre ele nu s-a schimbat nimic pe
    // un singur fir, deci nu se intampla. Dar contractul cere re-verificarea,
    // si refuzul se numara, nu se inghite.
    raport.rezervat++
    rat.stare[slot] = StareRatiune.RESPINS
    rat.motivFinal[slot] = codMotiv(out.reason)
    return false
  }
  rat.stare[slot] = StareRatiune.JOB
  return true
}

/**
 * Check+claim atomic la START (research: chiar daca ai verificat la scan,
 * re-verifica si scrie totul sau nimic). Id-ul de job se consuma DOAR daca
 * rezervarea reuseste.
 */
function pornesteJob(w: World, slot: number, ds: number, work: { wx: number; wy: number; z: number }): Outcome<void> {
  const a = w.agents
  const d = w.desemnari
  const jobId = w.nextId
  const out = rezervaToate(w.rezervari, a.id[slot]!, jobId, cereriPentru(d.kind[ds]!, d.id[ds]!))
  if (!out.ok) return out
  w.nextId++

  a.jobKind[slot] = d.kind[ds]! + 1
  a.jobId[slot] = jobId
  a.jobTarget[slot] = d.id[ds]!
  a.jobStep[slot] = PasJob.MERGE
  a.jobProgres[slot] = 0
  a.jobIncercari[slot] = 0
  a.jobWorkX[slot] = work.wx
  a.jobWorkY[slot] = work.wy
  a.jobWorkZ[slot] = work.z
  tintesteLocDeLucru(w, slot)
  raport.joburiPornite++
  return accept()
}

/** Tinta de mers devine celula de lucru. Se cheama la start si ori de cate ori tinta s-a pierdut. */
export function tintesteLocDeLucru(w: World, slot: number): void {
  const a = w.agents
  a.goalX[slot] = a.jobWorkX[slot]!
  a.goalY[slot] = a.jobWorkY[slot]!
  a.goalZ[slot] = a.jobWorkZ[slot]!
  a.hasGoal[slot] = 1
  clearPath(w.paths, slot)
}

// ---------------------------------------------------------------------------
// sfarsitul unui job
// ---------------------------------------------------------------------------

export const Sfarsit = {
  TERMINAT: 0,
  INCOMPLET: 1,
  INTRERUPT: 2,
} as const
export type SfarsitId = (typeof Sfarsit)[keyof typeof Sfarsit]

/** Pe cine se scrie racirea unui INCOMPLET: pe tinta (e a ei) sau pe pereche (e a lui). */
export const Racire = {
  TINTA: 0,
  PERECHE: 1,
} as const
export type RacireId = (typeof Racire)[keyof typeof Racire]

/**
 * Incheie jobul unui agent: elibereaza rezervarile pe PERECHEA (claimant, jobId),
 * scrie racirea si cauza unde le e locul, si lasa agentul liber — cu o scanare
 * la tickul urmator, ca sa nu hoinareasca pana la decalajul obisnuit.
 */
export function terminaJob(
  w: World,
  rules: Rules,
  slot: number,
  cum: SfarsitId,
  motiv?: ReasonCode,
  racire: RacireId = Racire.TINTA,
): void {
  const a = w.agents
  if (a.jobKind[slot] === 0) return
  elibereaza(w.rezervari, a.id[slot]!, a.jobId[slot]!)

  if (cum === Sfarsit.INCOMPLET) {
    const ds = slotDesemnare(w.desemnari, a.jobTarget[slot]!)
    if (racire === Racire.TINTA) {
      if (ds !== -1) {
        w.desemnari.reincercaLaTick[ds] = w.tick + racireDesemnare(w, rules)
        w.desemnari.ultimulMotiv[ds] = codMotiv(motiv ?? Reason.INACCESIBIL)
        w.desemnari.ultimulMotivDetaliu[ds] = DetaliuMotiv.FARA_LOC_DE_LUCRU
      }
    } else {
      evitaTinta(w, slot, a.jobTarget[slot]!, w.tick + rules.jobRetryTicks)
      // Cauza se vede si pe tinta, ca overlay-ul sa aiba ce arata — dar fara
      // racire pe ea: altcineva o poate lua chiar acum.
      if (ds !== -1 && motiv) {
        w.desemnari.ultimulMotiv[ds] = codMotiv(motiv)
        w.desemnari.ultimulMotivDetaliu[ds] = DetaliuMotiv.NICIUNUL
      }
    }
    if (motiv) {
      w.ratiune.stare[slot] = StareRatiune.RESPINS
      w.ratiune.motivFinal[slot] = codMotiv(motiv)
    }
    if (a.jobProgres[slot] === 0) w.ratiune.joburiFaraProgres++
  }
  if (cum === Sfarsit.TERMINAT) raport.joburiTerminate++
  else raport.joburiAnulate++

  a.jobKind[slot] = 0
  a.jobId[slot] = 0
  a.jobTarget[slot] = 0
  a.jobStep[slot] = 0
  a.jobProgres[slot] = 0
  a.jobIncercari[slot] = 0
  a.hasGoal[slot] = 0
  a.scanLaTick[slot] = w.tick + 1
  clearPath(w.paths, slot)
}

// ---------------------------------------------------------------------------
// drumul refuzat, in pasul MERGE
// ---------------------------------------------------------------------------

/**
 * `findPath` a spus nu unui pion cu job. Trei cauze, trei raspunsuri:
 *
 *   INACCESIBIL      — celula de lucru nu mai e buna (i-a disparut podeaua, a
 *                      zidit-o cineva). Se cauta ALTA celula de lucru, in
 *                      componenta pionului, fara sa conteze ca incercare; abia
 *                      daca nu mai e niciuna, jobul se incheie cu racire pe TINTA.
 *   OCUPAT_DE_OSTIL  — drumul EXISTA, cineva sta in el (D7c). Se numara o
 *                      incercare si se cauta alta celula de lucru, sarind peste
 *                      cea curenta (poate ostilul sta chiar pe ea); daca nu e
 *                      alta, se asteapta racirea de drum.
 *   BUGET_DEPASIT    — prea scump ACUM. Se numara o incercare si se asteapta.
 *
 * La `jobMaxIncercari` jobul se incheie cu racire pe PERECHE: pionul asta nu mai
 * insista, dar tinta ramane libera pentru altcineva.
 *
 * Cat timp graful de regiuni are blocuri murdare (o sapatura din acelasi tick,
 * inca nereconstruita), re-alegerea locului de lucru se AMANA la tickul urmator:
 * pe regiuni stale o celula proaspat calcabila e invizibila si jobul s-ar
 * incheia cu un motiv fals.
 */
export function drumRefuzat(w: World, rules: Rules, slot: number, motiv: ReasonCode): void {
  const a = w.agents
  raport.refuzuriDrum++

  if (motiv === Reason.INACCESIBIL) {
    if (w.regions.dirty.size > 0) return
    if (refaLoculDeLucru(w, rules, slot)) return
    terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.INACCESIBIL, Racire.TINTA)
    return
  }

  a.jobIncercari[slot] = a.jobIncercari[slot]! + 1
  if (a.jobIncercari[slot]! >= rules.jobMaxIncercari) {
    terminaJob(w, rules, slot, Sfarsit.INCOMPLET, motiv, Racire.PERECHE)
    return
  }

  if (motiv === Reason.OCUPAT_DE_OSTIL && w.regions.dirty.size === 0) {
    const curenta = cellKey(a.jobWorkX[slot]!, a.jobWorkY[slot]!, a.jobWorkZ[slot]!)
    if (refaLoculDeLucru(w, rules, slot, curenta)) return
  }

  w.ratiune.stare[slot] = StareRatiune.ASTEAPTA_DRUM
  w.ratiune.motivFinal[slot] = codMotiv(motiv)
}

/**
 * Cauta din nou celula de lucru a jobului curent, IN COMPONENTA pionului, si
 * daca gaseste una o scrie si retinteste. Progresul ramane. Intoarce `false`
 * daca nu mai exista.
 */
function refaLoculDeLucru(w: World, rules: Rules, slot: number, evita = -1): boolean {
  const a = w.agents
  const d = w.desemnari
  const ds = slotDesemnare(d, a.jobTarget[slot]!)
  if (ds === -1) return false
  const comp = find(w.regions, regionAt(w.regions, cellOf(a.x[slot]!), cellOf(a.y[slot]!), a.z[slot]!))
  const work = celulaDeLucru(w.terrain, w.regions, d, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, rules, comp, evita)
  if (!work) return false
  a.jobWorkX[slot] = work.wx
  a.jobWorkY[slot] = work.wy
  a.jobWorkZ[slot] = work.z
  a.jobStep[slot] = PasJob.MERGE
  tintesteLocDeLucru(w, slot)
  raport.locuriDeLucruRefacute++
  return true
}

// ---------------------------------------------------------------------------
// pasul LUCREAZA
// ---------------------------------------------------------------------------

/**
 * Un tick de munca. Agentul sta pe celula lui de lucru si sapa.
 *
 * Validarea se face la FIECARE tick, nu doar la start (research: „un job trebuie
 * sa-si poata declara invaliditatea in timpul executiei"): desemnarea poate fi
 * anulata, agentul poate fi mutat de `dezgroapa`, podeaua de sub el poate fi
 * desemnata DUPA ce si-a ales locul, voxelul poate fi sapat de altcineva cu mana.
 */
export function lucreaza(w: World, rules: Rules, slot: number): void {
  const a = w.agents
  const d = w.desemnari
  const ds = slotDesemnare(d, a.jobTarget[slot]!)
  if (ds === -1) {
    terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
    return
  }

  const cx = cellOf(a.x[slot]!)
  const cy = cellOf(a.y[slot]!)
  const cz = a.z[slot]!
  const peLoc = cx === a.jobWorkX[slot] && cy === a.jobWorkY[slot] && cz === a.jobWorkZ[slot]
  const pePodeaDesemnata = d.laCelula.has(cellKey(cx, cy, cz - 1))
  if (!peLoc || pePodeaDesemnata) {
    // Nu mai e unde trebuie, sau sta pe ceva ce altcineva urmeaza sa sape. Alt
    // loc de lucru, cu progresul pastrat — dar nu pe regiuni stale.
    if (w.regions.dirty.size > 0) return
    if (!refaLoculDeLucru(w, rules, slot)) {
      terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.INACCESIBIL, Racire.TINTA)
    }
    return
  }

  a.jobProgres[slot] = a.jobProgres[slot]! + rules.workUnitsPerTick
  raport.tickuriDeLucru++
  if (a.jobProgres[slot]! < rules.digWorkUnits) return

  const out = sapaVoxel(w, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, rules)
  if (!out.ok) {
    // Voxelul nu mai e de sapat (l-a sapat altcineva, sau nu mai e solid).
    // Premisa desemnarii a disparut: se termina jobul si dispare si ea.
    terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
    stergeDesemnare(d, ds)
    return
  }
  terminaJob(w, rules, slot, Sfarsit.TERMINAT)
  stergeDesemnare(d, ds)
}

// ---------------------------------------------------------------------------
// editarea terenului — o singura cale, pentru comanda si pentru job
// ---------------------------------------------------------------------------

/**
 * Sapa un voxel si murdareste graful de regiuni. Comanda `dig` si jobul de sapat
 * trec AMANDOUA pe aici: un voxel sapat de un pion nu are voie sa fie altceva
 * decat un voxel sapat de jucator.
 */
export function sapaVoxel(w: World, wx: number, wy: number, z: number, rules: Rules): Outcome<void> {
  const out = dig(w.terrain, wx, wy, z)
  if (!out.ok) return out
  markDirty(w.regions, wx, wy, z, rules)
  return accept()
}

/**
 * Sapatul MANUAL, din comanda: pe langa voxel, ia si desemnarea de pe celula
 * (daca e una), si intrerupe jobul cui o tinea.
 */
export function sapaManual(w: World, wx: number, wy: number, z: number, rules: Rules): Outcome<void> {
  const out = sapaVoxel(w, wx, wy, z, rules)
  if (!out.ok) return out
  const ds = desemnareLaCelula(w.desemnari, wx, wy, z)
  if (ds !== -1) anuleazaDesemnare(w, rules, ds)
  return accept()
}

/**
 * O desemnare dispare (anulata de jucator, sau facuta cu mana): cine lucra la ea
 * e intrerupt, in ordinea slotului, si rezervarile de pe ea se sterg.
 */
export function anuleazaDesemnare(w: World, rules: Rules, ds: number): void {
  const a = w.agents
  const id = w.desemnari.id[ds]!
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0 || a.jobKind[i] === 0 || a.jobTarget[i] !== id) continue
    terminaJob(w, rules, i, Sfarsit.INTRERUPT)
  }
  elibereazaTinta(w.rezervari, id)
  stergeDesemnare(w.desemnari, ds)
}

// ---------------------------------------------------------------------------
// dupa incarcare
// ---------------------------------------------------------------------------

/**
 * Rezervarile sunt DERIVED: se refac din joburile agentilor VII, in ordinea
 * slotului. Un job care nu se poate re-rezerva e un save inconsistent: se
 * anuleaza — FARA eliberare, fiindca n-a apucat sa rezerve — si se numara in
 * `anulateLaIncarcare`.
 */
export function reconstruiesteRezervari(w: World): number {
  const a = w.agents
  let anulate = 0
  for (let i = 0; i < a.count; i++) {
    if (a.jobKind[i] === 0) continue
    const ds = a.alive[i] === 1 ? slotDesemnare(w.desemnari, a.jobTarget[i]!) : -1
    const out = ds === -1
      ? refuse(Reason.ENTITATE_INEXISTENTA, { id: a.jobTarget[i]! })
      : rezervaToate(w.rezervari, a.id[i]!, a.jobId[i]!, cereriPentru(a.jobKind[i]! - 1, a.jobTarget[i]!))
    if (out.ok) continue
    a.jobKind[i] = 0
    a.jobId[i] = 0
    a.jobTarget[i] = 0
    a.jobStep[i] = 0
    a.jobProgres[i] = 0
    a.jobIncercari[i] = 0
    a.hasGoal[i] = 0
    clearPath(w.paths, i)
    anulate++
  }
  w.rezervari.anulateLaIncarcare = anulate
  return anulate
}
