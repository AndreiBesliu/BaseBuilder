/**
 * Joburile — S16-19: desemnari → joburi → sapat (taietura 1), iteme → carat →
 * depozite (taietura 2).
 *
 * Arhitectura e PULL, nu push (DESIGN §5.4): munca nu se impinge catre pioni,
 * pionul liber CERE un job cand ii vine randul. Nicio coada globala de joburi —
 * costul invalidarii ei la fiecare schimbare de lume o face imposibil de
 * intretinut de un singur om.
 *
 * ## Scanarea, in doua treceri, peste DOUA surse
 *
 * **Trecerea ieftina**, peste desemnarile vii (in ordinea slotului) si peste
 * itemele care AU unde sa fie mutate (lista DERIVED `deMutat` din zone.ts, tot
 * in ordinea slotului): racire pe tinta, racire pe perechea (pion, tinta),
 * distanta Manhattan, rezervare. Nu atinge terenul. Ce trece e un candidat cu o
 * MARGINE SUPERIOARA de scor: pentru o desemnare, celula de lucru e la cel mult
 * `1 + maxStepM` de ea; pentru un item, prioritatea destinatiei e cel mult
 * `maxPrioLibera[fel]`. Candidatii AMBELOR surse intra intr-o singura lista —
 * nu „intai sapatul, apoi caratul": panoul a aratat ca ordinea pe categorii e
 * sortarea lexicografica pe care DESIGN §5.4 o interzice, si ca ar tine depozitul
 * gol cat exista o carieră.
 *
 * **Trecerea scumpa**, pe candidatii sortati dupa margine (descrescator, apoi
 * id): locul de lucru si componenta (SAPA); componenta itemului si celula de
 * destinatie (CARA). Plafonata de `jobScanMaxCandidates` si oprita devreme cand
 * cel mai bun scor REAL bate marginea urmatorului candidat.
 *
 * De ce nu „in ordinea slotului, primele 256": panoul de design a aratat ca asa
 * o camera de 16×16 desemnata inaintea rampei ei nu s-ar sapa niciodata — cele
 * 256 de celule fara loc de lucru ar consuma plafonul la fiecare scanare, iar
 * rampa, in sloturile de dupa, n-ar fi evaluata de nimeni, vreodata. Sortarea pe
 * margine face plafonul sa taie DEPARTELE, nu arbitrarul; memorarea refuzurilor
 * pe tinta (racire scurta) face ca plafonul sa se cheltuie pe candidati noi.
 *
 * In bucla de scan nu se porneste NICIODATA un A* (research: „in bucla de scan
 * ai voie doar canReach si distanta; A* o singura data, la start").
 *
 * ## Scorul, in intregi
 *
 * `2^prioTask × 4^prioPersonala / (1 + costDrum)` — regula pentru jucator:
 * „+1 nivel de prioritate merita jumatate din drum". Fara impartire si fara
 * float: A bate B daca `2^(pA + 2(qA−1)) · (1 + dB) > 2^(pB + 2(qB−1)) · (1 + dA)`.
 * Prioritatea sarcinii de carat e prioritatea depozitului destinatie: asa
 * „depozitul de prioritate mare se umple primul".
 *
 * ## Racirea urmeaza SCOPUL predicatului
 *
 * Un refuz e fie o proprietate a TINTEI (n-are niciun loc de lucru; n-are niciun
 * depozit; niciunul in componenta celui care intreaba), fie a PERECHII (drumul
 * acestui pion e blocat de un ostil, sau e peste bugetul lui). Prima se scrie pe
 * tinta, cu racire scurta: nimeni n-o evalueaza o vreme. A doua se scrie pe pion,
 * intr-o multime marginita de perechi: EL n-o reia o vreme, dar altcineva poate.
 * La carat, racirea pe pereche se scrie pe ce EXISTA dupa refuz — zona (drumul
 * MEU spre depozitul ala e blocat) si mormanul lasat la picioare — nu pe id-ul
 * sursei, care de obicei a murit la ridicare. Panoul a masurat ce iese altfel:
 * ridica / lasa la nesfarsit, cu trei A*-uri esuate pe ciclu.
 *
 * ## Acoperirea se intinde spre munca, nu spre hoinareala
 *
 * Reachability-ul se evalueaza numai pe blocuri LEGATE. Discul unui pion e
 * ancorat la nastere, iar hoinareala nu iese din blocurile legate. Cand o tinta
 * pare in alta componenta, scannerul intinde O DATA un coridor de blocuri
 * (pion → item, item → celula de depozit), memoizat prin acoperirea persistata;
 * abia daca nici asa nu sunt legate, refuzul e onest. Zonele pictate isi primesc
 * discul la pictare, ca desemnarile.
 *
 * ## Fiecare „nu" poarta cauza; politica de preemptiune
 *
 * Scannerul nu intoarce `null`: cauza se scrie pe tinta si pe pion. Un job in
 * curs e intrerupt DOAR de o nevoie critica (nu exista inca), de pericol (nu
 * exista inca) sau de un ordin direct al jucatorului.
 *
 * ## Marfa nu dispare
 *
 * Orice sfarsit de job cu marfa in mana o lasa la picioare prin `asazaItem`
 * (iteme.ts) — inclusiv la `killAgent` si la anularea de la incarcare. Un pion
 * fara job are `caraCantitate = 0`. Ce nu incape nicaieri se NUMARA
 * (`ratiune.itemePierdute`), nu se pierde tacut.
 *
 * ## Garda anti-bucla
 *
 * NU e contorul „10 joburi intr-un tick": aici un agent porneste cel mult un job
 * per tick de scanare. Ce apara: racirea pe tinta, multimea de raciri pe
 * pereche, `jobMaxIncercari` pe job, si zavorul `ratiune.joburiFaraProgres`
 * (per lume, asertat in teste).
 */

import type { Rules } from './content.ts'
import type { Outcome, ReasonCode } from './result.ts'
import { accept, codMotiv, refuse, Reason } from './result.ts'
import type { World } from './state.ts'
import { Categorie, CATEGORII, FelJob, ITEME, PasCara, PasJob } from './state.ts'
import { cellOf, clearPath } from './drumuri.ts'
import { blockOfCell, ensureArea, find, isWalkable, markDirty, NO_REGION, regionAt, REGION_SIZE } from './regions.ts'
import type { RegionStore } from './regions.ts'
import type { Terrain } from './terrain/terrain.ts'
import { dig, materialAt } from './terrain/terrain.ts'
import { cellKey } from './path.ts'
import { desemnareLaCelula, DetaliuMotiv, slotDesemnare, stergeDesemnare } from './desemnari.ts'
import type { DesignationStore } from './desemnari.ts'
import type { Cerere } from './rezervari.ts'
import { elibereaza, elibereazaTinta, elibereazaUna, poateRezerva, rezervaToate, Strat } from './rezervari.ts'
import { asazaItem, creeazaItem, DetaliuItem, iaDinItem, itemLaCelula, locPeCelula, slotItem, stergeItem } from './iteme.ts'
import { indexZone, marcheazaZoneMurdare, prioritateaLocului, slotCelulaDeZona, slotZona } from './zone.ts'

// ---------------------------------------------------------------------------
// ratiunea — TRANSIENT
// ---------------------------------------------------------------------------

/** In ce s-a incheiat ultima scanare a unui pion. Stari interne, nu refuzuri de Outcome. */
export const StareRatiune = {
  /** N-a scanat inca. */
  NIMIC: 0,
  /** A pornit un job. */
  JOB: 1,
  /** Nu exista nicio desemnare vie si niciun item de mutat. */
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
   * ZAVOR, per lume: joburi incheiate INCOMPLET fara niciun efect si fara nicio
   * unitate de munca — refuzuri ale lumii, nu ordine ale jucatorului. Se aduna pe
   * toata rularea si se aserteaza in teste. Sta aici, nu in raportul de tick, ca
   * sa nu fie stare de PROCES care depinde de ordinea testelor.
   */
  joburiFaraProgres: number
  /** ZAVOR, per lume: unitati de marfa care n-au incaput nicaieri. Trebuie sa fie 0. */
  itemePierdute: number
  /** Tickuri-pion petrecute pe drum spre o tinta de job, pe toata rularea. Cu `tickuriDeLucru`, masura pentru batching. */
  tickuriPeDrum: number
  /** Tickuri-pion petrecute muncind (sapat, ridicat, lasat), pe toata rularea. */
  tickuriDeLucru: number
}

export function makeRatiuneStore(capacity: number): RatiuneStore {
  return {
    ultimaScanareTick: new Int32Array(capacity).fill(-1),
    stare: new Uint8Array(capacity),
    candidati: new Int32Array(capacity),
    taiati: new Int32Array(capacity),
    motivFinal: new Uint8Array(capacity),
    joburiFaraProgres: 0,
    itemePierdute: 0,
    tickuriPeDrum: 0,
    tickuriDeLucru: 0,
  }
}

// ---------------------------------------------------------------------------
// raportul de tick — TRANSIENT
// ---------------------------------------------------------------------------

export interface JobTickReport {
  /** Cati pioni au cerut de lucru in tickul asta. */
  scanari: number
  /** Cate intrari a atins trecerea IEFTINA (desemnari vii + iteme de mutat). O colonie in repaus: 0. */
  vizite: number
  /** Cate evaluari SCUMPE (loc de lucru + componenta, sau destinatie) s-au facut. */
  candidatiExaminati: number
  /** Cati candidati au ramas neevaluati din cauza plafonului, insumat. */
  candidatiTaiati: number
  /** Cate coridoare de acoperire s-au intins (fiecare e cateva blocuri, memoizate). */
  coridoare: number
  joburiPornite: number
  joburiTerminate: number
  /** Incheiate altfel decat TERMINAT: incomplete sau intrerupte. */
  joburiAnulate: number
  /** Cati pioni au muncit efectiv (un pas de oprire) in tickul asta. */
  tickuriDeLucru: number
  /** De cate ori un job si-a schimbat celula-tinta (loc de lucru, celula itemului, destinatie) fara sa se incheie. */
  locuriDeLucruRefacute: number
  /** Cate refuzuri de drum au primit joburile in tickul asta. */
  refuzuriDrum: number
  /** Respingeri per cauza, in tickul asta. */
  faraMuncitor: number
  preaDeparte: number
  inaccesibil: number
  rezervat: number
  faraDepozit: number
  /** Cate celule de depozit s-au examinat in cautarile de destinatie. */
  evaluariDestinatie: number
  /** Cate mormane a produs sapatul. */
  itemeProduse: number
  /** Cate depuneri reusite in depozit (LASA). */
  itemeMutate: number
  /** De cate ori s-a lasat marfa la picioare (job incheiat cu mana plina). */
  lasateLaPicioare: number
}

const raport: JobTickReport = {
  scanari: 0, vizite: 0, candidatiExaminati: 0, candidatiTaiati: 0, coridoare: 0,
  joburiPornite: 0, joburiTerminate: 0, joburiAnulate: 0,
  tickuriDeLucru: 0, locuriDeLucruRefacute: 0, refuzuriDrum: 0,
  faraMuncitor: 0, preaDeparte: 0, inaccesibil: 0, rezervat: 0, faraDepozit: 0,
  evaluariDestinatie: 0, itemeProduse: 0, itemeMutate: 0, lasateLaPicioare: 0,
}

export function lastJobReport(): JobTickReport {
  return raport
}

/** Se cheama la inceputul fiecarui tick de agenti. */
export function resetJobReport(): void {
  raport.scanari = 0
  raport.vizite = 0
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
  raport.faraDepozit = 0
  raport.evaluariDestinatie = 0
  raport.itemeProduse = 0
  raport.itemeMutate = 0
  raport.lasateLaPicioare = 0
}

/**
 * Cat de „avansata" e o cauza: cat de aproape de reusita a ajuns candidatul.
 * O tinta REZERVATA e una perfect valida pe care o face altcineva; una
 * INACCESIBILA e una la care nu se ajunge; FARA_DEPOZIT e una care n-are unde;
 * PREA_DEPARTE nici n-a fost evaluata.
 */
function rang(r: ReasonCode): number {
  switch (r) {
    case Reason.FARA_MUNCITOR: return 1
    case Reason.PREA_DEPARTE: return 2
    case Reason.FARA_DEPOZIT: return 3
    case Reason.INACCESIBIL: return 4
    case Reason.REZERVAT: return 5
    default: return 0
  }
}

// ---------------------------------------------------------------------------
// ce cere un job
// ---------------------------------------------------------------------------

/** Sapatul: un singur sapator pe un voxel. `count`/`maxCount` sunt 1/1 fiindca un voxel nu se imparte. */
export function cereriSapa(targetId: number): readonly Cerere[] {
  return [{ targetId, layer: Strat.LUCRU, count: 1, maxCount: 1, maxClaimants: 1 }]
}

/**
 * Caratul: destinatia (celula de zona) se tine tot jobul; sursa (itemul) doar
 * pana la ridicare inclusiv. Un caraus per morman (v1, `maxClaimants = 1`):
 * `haulCarryMax` e ce leaga, restul mormanului ramane jobului urmator.
 * `cant` e cantitatea INGHETATA in job, nu cea vie a mormanului.
 */
export function cereriCara(rules: Rules, itemId: number, destId: number, cant: number, step: number): readonly Cerere[] {
  const cereri: Cerere[] = [{ targetId: destId, layer: Strat.LUCRU, count: cant, maxCount: rules.itemStackMax, maxClaimants: 1 }]
  if (step <= PasCara.RIDICA) cereri.push({ targetId: itemId, layer: Strat.CARAT, count: cant, maxCount: cant, maxClaimants: 1 })
  return cereri
}

/**
 * Cererile jobului CURENT al unui agent, calculate din TUPLUL PERSISTAT
 * (`jobKind, jobStep, jobTarget, jobDest, jobCantitate`) — deci identic la
 * reconstructia de dupa incarcare. Nimic de aici nu citeste un camp mutabil al
 * tintei: panoul a aratat ca `min(cantitate, …)` re-rezerva alta cantitate dupa
 * ce mormanul crescuse prin contopire, si o lume incarcata lua alt job.
 */
export function cereriPentru(w: World, rules: Rules, slot: number): readonly Cerere[] {
  const a = w.agents
  if (a.jobKind[slot] === FelJob.CARA) {
    return cereriCara(rules, a.jobTarget[slot]!, a.jobDest[slot]!, a.jobCantitate[slot]!, a.jobStep[slot]!)
  }
  return cereriSapa(a.jobTarget[slot]!)
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
 * Acoperirea de regiuni din jurul unei desemnari sau al unei celule de zona noi.
 * Raza e legata de raza de scanare printr-un invariant validat in `parseRules`
 * (content.ts). Acoperirea e PERSISTED prin extinderea ei (save.ts), deci ramane
 * reproductibila. Memoizata prin `legate`: 900 de celule pictate una langa alta
 * platesc discul o data.
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
 * DOAR spre o tinta de job, deci acoperirea creste cu munca, nu cu hoinareala.
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
 * Cat sta o tinta in racire dupa un refuz scump. Cel putin
 * `jobInfeasibleRetryTicks`; dar cu multe tinte vii si un plafon mic de
 * evaluari, fereastra trebuie sa acopere TOATE tintele inainte ca primele sa
 * expire, altfel plafonul nu ajunge niciodata la coada (recenzia: cu 1700 de
 * desemnari fara loc si racire de 100, exact 1024 primeau vreodata un motiv).
 * Derivat din stare persistata (`vii`), deci acelasi in orice lume.
 */
function racireTinta(vii: number, rules: Rules): number {
  // `+ 1`: fereastra trebuie sa fie STRICT mai lunga decat scanarile necesare,
  // altfel prima transa expira exact cand scanarea ar fi ajuns la coada.
  const scanari = Math.ceil(vii / rules.jobScanMaxCandidates) + 1
  return Math.max(rules.jobInfeasibleRetryTicks, rules.jobRescanTicks * scanari)
}

function racireDesemnare(w: World, rules: Rules): number {
  return racireTinta(w.desemnari.vii, rules)
}

function racireItem(w: World, rules: Rules): number {
  return racireTinta(w.iteme.vii, rules)
}

/** Memoreaza un refuz pe un item: racire (proprietate a lui) si cauza. */
function memoreazaPeItem(w: World, rules: Rules, is: number, motiv: ReasonCode, detaliu: number): void {
  w.iteme.reincercaLaTick[is] = w.tick + racireItem(w, rules)
  w.iteme.ultimulMotiv[is] = codMotiv(motiv)
  w.iteme.ultimulMotivDetaliu[is] = detaliu
}

// ---------------------------------------------------------------------------
// destinatia unui carat
// ---------------------------------------------------------------------------

/** Cine e sursa unui candidat de scanare. */
const CAND_SAPA = 0
const CAND_CARA = 1

/**
 * Unde se duce o marfa de felul `kind`, `cant` unitati, care sta la (fx, fy, fz)
 * intr-un loc de prioritate `prioLoc`, cautata de pionul `slot` aflat la
 * (ax, ay, az).
 *
 * Zonele se parcurg in ordinea (prioritate desc, id asc), DOAR cele strict mai
 * bune decat locul curent — asa nu exista ping-pong intre doua depozite egale
 * (research, bug-ul 11). Se sar zonele fara nicio celula care sa primeasca felul
 * (contor DERIVED) si zonele pe care pionul le evita (drumul LUI spre ele e
 * blocat). In zona se parcurg DOAR celulele libere (lista DERIVED), plafonat pe
 * celule libere examinate — nu pe celule pline in ordinea slotului, care ar da
 * FARA_DEPOZIT fals cu jumatate de depozit gol. Castiga cea mai apropiata de
 * marfa din prima zona care da ceva; egalitate pe cheia de celula.
 *
 * Refuzul spune DE CE, ca apelantul sa-l memoreze unde ii e locul:
 *   FARA_DEPOZIT / `pline`      — nicio celula cu loc pentru cantitatea asta (pe item)
 *   FARA_DEPOZIT / `evitate`    — toate zonele cu loc sunt evitate de pionul asta (pe pereche)
 *   INACCESIBIL  / `componenta` — exista, dar nu in componenta pionului (pe item)
 */
export function cautaDestinatie(
  w: World,
  rules: Rules,
  slot: number,
  kind: number,
  cant: number,
  fx: number,
  fy: number,
  fz: number,
  prioLoc: number,
  ax: number,
  ay: number,
  az: number,
): Outcome<{ cs: number; zs: number }> {
  const ix = indexZone(w, rules)
  const s = w.zone
  const c = s.celule
  const eu = w.agents.id[slot]!
  let compAgent = find(w.regions, regionAt(w.regions, ax, ay, az))
  let zoneCuLoc = 0
  let evitate = 0
  let inAltaComponenta = false
  for (const zs of ix.zoneOrdonate) {
    const prio = s.prioritate[zs]!
    if (prio <= prioLoc) break
    if (ix.acceptante[zs * ITEME + kind] === 0) continue
    zoneCuLoc++
    if (esteEvitata(w, slot, s.id[zs]!)) { evitate++; continue }
    let best = -1
    let bestDist = 0
    let bestKey = 0
    let examinate = 0
    for (const cs of ix.libere[zs]!) {
      if (examinate >= rules.haulDestMaxCells) break
      const cx = c.wx[cs]!
      const cy = c.wy[cs]!
      const cz = c.z[cs]!
      const dist = Math.abs(cx - fx) + Math.abs(cy - fy) + Math.abs(cz - fz)
      if (dist > rules.haulDestRadiusCells) continue
      if (locPeCelula(w, rules, kind, cx, cy, cz) < cant) continue
      examinate++
      raport.evaluariDestinatie++
      // Aici NU se intinde niciun coridor de acoperire.
      //
      // Prima versiune intindea unul (marfa → celula de depozit) „o data per
      // zona", adica la fiecare evaluare scumpa. Masurat pe scenariul standard:
      // acoperirea crestea nemarginit — 1138 de coloane de blocuri la 5.000 de
      // tickuri, 2225 la 30.000, fara semn de saturare — fiindca fiecare coridor
      // impinge frontiera cu un inel, iar itemele apar mereu in alte locuri.
      // `relabel` (O(regiuni + muchii)) ajunsese 40% din tick. Exact K05: costul
      // creste cu VECHIMEA coloniei, nu cu populatia.
      //
      // Marginirea vine din discuri, nu din coridoare: celula de depozit isi ia
      // discul la pictare, marfa zace intr-o zona deja acoperita (a sapat sau a
      // umblat cineva acolo), iar invariantul din `parseRules` cere ca cele doua
      // discuri sa se atinga pe toata raza `haulDestRadiusCells`. Ce ramane
      // nelegat dupa asta e cu adevarat alta componenta, si se spune cinstit.
      const r = regionAt(w.regions, cx, cy, cz)
      if (r === NO_REGION || find(w.regions, r) !== compAgent) { inAltaComponenta = true; continue }
      if (!poateRezerva(w.rezervari, eu, { targetId: c.id[cs]!, layer: Strat.LUCRU, count: cant, maxCount: rules.itemStackMax, maxClaimants: 1 }).ok) continue
      const key = cellKey(cx, cy, cz)
      if (best === -1 || dist < bestDist || (dist === bestDist && key < bestKey)) {
        best = cs
        bestDist = dist
        bestKey = key
      }
    }
    if (best !== -1) return accept({ cs: best, zs })
  }
  if (zoneCuLoc > 0 && evitate === zoneCuLoc) return refuse(Reason.FARA_DEPOZIT, { detaliu: 'evitate', zone: zoneCuLoc })
  if (inAltaComponenta) return refuse(Reason.INACCESIBIL, { detaliu: 'componenta' })
  return refuse(Reason.FARA_DEPOZIT, { detaliu: 'pline', zone: zoneCuLoc })
}

// ---------------------------------------------------------------------------
// scanarea
// ---------------------------------------------------------------------------

/** Buffere de candidati, refolosite intre scanari. Zero alocari in regim stabil. */
let candFel: number[] = []
let candSlot: number[] = []
let candDist: number[] = []
let candG: number[] = []
let candId: number[] = []

/**
 * Categoriile pe care le scaneaza un pion, dupa prioritatile lui personale.
 * „Exclusiv" (nivelul maxim) e o proprietate a MULTIMII: daca vreo categorie e
 * la maxim, se scaneaza toate cele la maxim; altfel toate cele nenule. Panoul a
 * aratat ca „fiecare la 3 sare peste celelalte" facea un pion cu ambele la 3
 * inert, fara cauza.
 */
function categoriiActive(w: World, rules: Rules, slot: number): { sapa: boolean; cara: boolean } {
  const a = w.agents
  const pS = a.prioPersonala[slot * CATEGORII + Categorie.SAPA]!
  const pC = a.prioPersonala[slot * CATEGORII + Categorie.CARA]!
  const exclusiv = Math.max(pS, pC) === rules.personalPriorityLevels
  return {
    sapa: pS > 0 && (!exclusiv || pS === rules.personalPriorityLevels),
    cara: pC > 0 && (!exclusiv || pC === rules.personalPriorityLevels),
  }
}

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
  const it = w.iteme
  const rat = w.ratiune
  raport.scanari++
  rat.ultimaScanareTick[slot] = w.tick
  rat.candidati[slot] = 0
  rat.taiati[slot] = 0
  rat.motivFinal[slot] = 0

  const ix = indexZone(w, rules)
  const activ = categoriiActive(w, rules, slot)
  const persS = a.prioPersonala[slot * CATEGORII + Categorie.SAPA]!
  const persC = a.prioPersonala[slot * CATEGORII + Categorie.CARA]!

  // shouldSkip, in O(1): nimic de facut nicaieri.
  if (d.vii === 0 && ix.deMutat.length === 0) {
    if (ix.peJosFaraDepozit > 0) {
      raport.faraDepozit++
      rat.stare[slot] = StareRatiune.RESPINS
      rat.motivFinal[slot] = codMotiv(Reason.FARA_DEPOZIT)
    } else {
      rat.stare[slot] = StareRatiune.NIMIC_DE_FACUT
    }
    return false
  }

  let celMaiAvansat: ReasonCode | null = null
  const noteaza = (r: ReasonCode): void => {
    if (celMaiAvansat === null || rang(r) > rang(celMaiAvansat)) celMaiAvansat = r
  }
  if (!activ.sapa && d.vii > 0) { raport.faraMuncitor++; noteaza(Reason.FARA_MUNCITOR) }
  if (!activ.cara && ix.deMutat.length > 0) { raport.faraMuncitor++; noteaza(Reason.FARA_MUNCITOR) }
  if (ix.peJosFaraDepozit > 0) { raport.faraDepozit++; noteaza(Reason.FARA_DEPOZIT) }

  const ax = cellOf(a.x[slot]!)
  const ay = cellOf(a.y[slot]!)
  const az = a.z[slot]!
  let compAgent = find(w.regions, regionAt(w.regions, ax, ay, az))
  const eu = a.id[slot]!
  // Celula de lucru e la cel mult atat de desemnare; marginea de scor foloseste
  // distanta pana la desemnare minus atat.
  const margine = 1 + Math.max(0, Math.min(4, rules.maxStepM))

  // --- trecerea ieftina: porti fara teren, peste tot ---
  let n = 0
  let inRacire = 0
  if (activ.sapa) {
    const gPers = 4 ** (persS - 1)
    for (let s = 0; s < d.count; s++) {
      if (d.alive[s] === 0) continue
      raport.vizite++
      if (d.reincercaLaTick[s]! > w.tick || esteEvitata(w, slot, d.id[s]!)) { inRacire++; continue }
      const dist0 = Math.abs(d.wx[s]! - ax) + Math.abs(d.wy[s]! - ay) + Math.abs(d.z[s]! - az)
      if (dist0 > rules.jobScanRadiusCells) {
        raport.preaDeparte++
        noteaza(Reason.PREA_DEPARTE)
        continue
      }
      let rezervata = false
      for (const c of cereriSapa(d.id[s]!)) {
        if (!poateRezerva(w.rezervari, eu, c).ok) { rezervata = true; break }
      }
      if (rezervata) {
        raport.rezervat++
        noteaza(Reason.REZERVAT)
        continue
      }
      candFel[n] = CAND_SAPA
      candSlot[n] = s
      candDist[n] = Math.max(0, dist0 - margine)
      candG[n] = 2 ** d.prioritate[s]! * gPers
      candId[n] = d.id[s]!
      n++
    }
  }
  if (activ.cara) {
    const gPers = 4 ** (persC - 1)
    for (const s of ix.deMutat) {
      if (it.alive[s] === 0) continue
      raport.vizite++
      if (it.reincercaLaTick[s]! > w.tick || esteEvitata(w, slot, it.id[s]!)) { inRacire++; continue }
      const dist0 = Math.abs(it.wx[s]! - ax) + Math.abs(it.wy[s]! - ay) + Math.abs(it.z[s]! - az)
      if (dist0 > rules.jobScanRadiusCells) {
        raport.preaDeparte++
        noteaza(Reason.PREA_DEPARTE)
        continue
      }
      const cant = Math.min(it.cantitate[s]!, rules.haulCarryMax)
      if (!poateRezerva(w.rezervari, eu, { targetId: it.id[s]!, layer: Strat.CARAT, count: cant, maxCount: cant, maxClaimants: 1 }).ok) {
        raport.rezervat++
        noteaza(Reason.REZERVAT)
        continue
      }
      candFel[n] = CAND_CARA
      candSlot[n] = s
      candDist[n] = dist0
      candG[n] = 2 ** ix.maxPrioLibera[it.kind[s]!]! * gPers
      candId[n] = it.id[s]!
      n++
    }
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
  // orice lume cu aceeasi stare. Marginea e `G / (1 + dist')` cu `G` deja
  // inmultit cu prioritatea personala a categoriei; comparatia e cea din `maiBun`.
  // Cheile sunt precalculate: comparatorul nu face `2 **`.
  const ordine: number[] = []
  for (let i = 0; i < n; i++) ordine.push(i)
  ordine.sort((i, j) => {
    const li = candG[i]! * (1 + candDist[j]!)
    const lj = candG[j]! * (1 + candDist[i]!)
    if (li !== lj) return li > lj ? -1 : 1
    return candId[i]! - candId[j]!
  })

  // --- trecerea scumpa: loc de lucru si componenta / destinatie, pe primele K ---
  let best = -1
  let bestPrio = 0
  let bestPers = 1
  let bestDist = 0
  let bestWork: { wx: number; wy: number; z: number } | null = null
  let bestCs = -1
  let bestCant = 0
  let scumpe = 0
  let taiati = 0

  for (let k = 0; k < n; k++) {
    const i = ordine[k]!
    const s = candSlot[i]!
    const fel = candFel[i]!
    const persCand = fel === CAND_SAPA ? persS : persC
    const prioBound = fel === CAND_SAPA ? d.prioritate[s]! : ix.maxPrioLibera[it.kind[s]!]!

    // Nimeni de aici incolo nu mai poate intrece cel mai bun scor real: marginea
    // lui e sub el, si urmatorii au margini si mai mici.
    if (best !== -1 && maiBun(bestPrio, bestPers, bestDist, prioBound, persCand, candDist[i]!)) break

    if (scumpe >= rules.jobScanMaxCandidates) {
      taiati = n - k
      break
    }

    if (fel === CAND_SAPA) {
      scumpe++
      raport.candidatiExaminati++
      const prio = d.prioritate[s]!
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
      if (best === -1 || maiBun(prio, persS, dist, bestPrio, bestPers, bestDist)) {
        best = i
        bestPrio = prio
        bestPers = persS
        bestDist = dist
        bestWork = work
      }
      continue
    }

    // CARA. (a) itemul e intr-o regiune, in componenta pionului?
    const ixx = it.wx[s]!
    const iy = it.wy[s]!
    const iz = it.z[s]!
    const r = regionAt(w.regions, ixx, iy, iz)
    // Un morman produs in tickul asta zace pe o celula pe care regiunile o mai
    // cred piatra pana la reconstructia de la sfarsitul tickului. Se sare fara
    // cauza si fara racire — la scanarea urmatoare regiunile sunt proaspete.
    if (r === NO_REGION && w.regions.dirty.size > 0) continue
    scumpe++
    raport.candidatiExaminati++
    // Nici aici NU se intinde un coridor de acoperire.
    //
    // La desemnari are sens: jucatorul poate cere sa se sape oriunde, deci tinta
    // poate fi in teren pe care nu l-a atins nimeni. Un morman, nu: el apare
    // NUMAI acolo unde a sapat sau a umblat cineva, deci pe teren deja acoperit.
    // Ce ramane in alta componenta e o groapa din care nu se iese — un refuz
    // onest, memorat pe item.
    //
    // Prima versiune intindea totusi un coridor, „ca la desemnari". Masurat pe
    // scenariul standard: coridorul de la SAPA se declanseaza de 0 ori, cel de la
    // marfa de ~360 de ori la fiecare 4.000 de tickuri, LA NESFARSIT — fiindca e
    // ancorat de pozitia PIONULUI, care se misca, deci fiecare reluare traseaza
    // alta linie si impinge frontiera cu un inel nou. Acoperirea crestea de la
    // 1138 la 2225 de coloane de blocuri in 30.000 de tickuri, fara saturare, si
    // `relabel` ajunsese 40% din tick. E exact ce a inchis recenzia taieturii 1
    // („acoperirea creste cu munca, nu cu plimbarea"), reintrat prin a doua tinta.
    if (r === NO_REGION || find(w.regions, r) !== compAgent) {
      raport.inaccesibil++
      memoreazaPeItem(w, rules, s, Reason.INACCESIBIL, DetaliuItem.COMPONENTE_DIFERITE)
      noteaza(Reason.INACCESIBIL)
      continue
    }
    // (b) destinatia.
    const cant = Math.min(it.cantitate[s]!, rules.haulCarryMax)
    const prioLoc = prioritateaLocului(w.zone, ixx, iy, iz)
    const dest = cautaDestinatie(w, rules, slot, it.kind[s]!, cant, ixx, iy, iz, prioLoc, ax, ay, az)
    if (!dest.ok) {
      if (dest.reason === Reason.INACCESIBIL) {
        raport.inaccesibil++
        memoreazaPeItem(w, rules, s, Reason.INACCESIBIL, DetaliuItem.COMPONENTE_DIFERITE)
        noteaza(Reason.INACCESIBIL)
      } else if (dest.params.detaliu === 'evitate') {
        // Proprietate a PERECHII: pionul asta evita toate depozitele cu loc.
        raport.faraDepozit++
        evitaTinta(w, slot, it.id[s]!, w.tick + rules.jobRetryTicks)
        noteaza(Reason.FARA_DEPOZIT)
      } else {
        raport.faraDepozit++
        memoreazaPeItem(w, rules, s, Reason.FARA_DEPOZIT, DetaliuItem.DEPOZITE_PLINE)
        noteaza(Reason.FARA_DEPOZIT)
      }
      compAgent = find(w.regions, regionAt(w.regions, ax, ay, az))
      continue
    }
    compAgent = find(w.regions, regionAt(w.regions, ax, ay, az))
    const prio = w.zone.prioritate[dest.value.zs]!
    const dist = candDist[i]!
    if (best === -1 || maiBun(prio, persC, dist, bestPrio, bestPers, bestDist)) {
      best = i
      bestPrio = prio
      bestPers = persC
      bestDist = dist
      bestWork = null
      bestCs = dest.value.cs
      bestCant = cant
    }
    // Egalitate de scor real: candidatii vin deja in ordinea id-ului la margini
    // egale, iar la margini diferite cel cu marginea mai mare a fost evaluat
    // primul si ramane — „primul evaluat castiga la egalitate" e o regula fixa.
  }

  rat.candidati[slot] = scumpe
  rat.taiati[slot] = taiati
  raport.candidatiTaiati += taiati

  if (best === -1) {
    if (taiati > 0) rat.stare[slot] = StareRatiune.PLAFON
    else rat.stare[slot] = StareRatiune.RESPINS
    rat.motivFinal[slot] = celMaiAvansat === null ? 0 : codMotiv(celMaiAvansat)
    return false
  }

  const out = candFel[best] === CAND_SAPA
    ? pornesteSapa(w, slot, candSlot[best]!, bestWork!)
    : pornesteCara(w, rules, slot, candSlot[best]!, bestCs, bestCant)
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
function pornesteSapa(w: World, slot: number, ds: number, work: { wx: number; wy: number; z: number }): Outcome<void> {
  const a = w.agents
  const d = w.desemnari
  const jobId = w.nextId
  const out = rezervaToate(w.rezervari, a.id[slot]!, jobId, cereriSapa(d.id[ds]!))
  if (!out.ok) return out
  w.nextId++

  a.jobKind[slot] = FelJob.SAPA
  a.jobId[slot] = jobId
  a.jobTarget[slot] = d.id[ds]!
  a.jobDest[slot] = 0
  a.jobCantitate[slot] = 0
  a.jobEfect[slot] = 0
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

function pornesteCara(w: World, rules: Rules, slot: number, is: number, cs: number, cant: number): Outcome<void> {
  const a = w.agents
  const it = w.iteme
  const c = w.zone.celule
  const jobId = w.nextId
  const out = rezervaToate(w.rezervari, a.id[slot]!, jobId, cereriCara(rules, it.id[is]!, c.id[cs]!, cant, PasCara.MERGE_SURSA))
  if (!out.ok) return out
  w.nextId++

  a.jobKind[slot] = FelJob.CARA
  a.jobId[slot] = jobId
  a.jobTarget[slot] = it.id[is]!
  a.jobDest[slot] = c.id[cs]!
  a.jobCantitate[slot] = cant
  a.jobEfect[slot] = 0
  a.jobStep[slot] = PasCara.MERGE_SURSA
  a.jobProgres[slot] = 0
  a.jobIncercari[slot] = 0
  a.jobWorkX[slot] = it.wx[is]!
  a.jobWorkY[slot] = it.wy[is]!
  a.jobWorkZ[slot] = it.z[is]!
  tintesteLocDeLucru(w, slot)
  // Destinatia s-a rezervat: nu mai e libera pentru altii.
  marcheazaZoneMurdare(w)
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
 * Lasa la picioare ce are pionul in mana, prin `asazaItem`, si goleste mana.
 * Intoarce slotul mormanului rezultat (nou sau contopit), sau -1.
 */
export function lasaLaPicioare(w: World, rules: Rules, slot: number): number {
  const a = w.agents
  if (a.caraCantitate[slot] === 0) return -1
  const r = asazaItem(w, rules, a.caraKind[slot]!, a.caraCantitate[slot]!, cellOf(a.x[slot]!), cellOf(a.y[slot]!), a.z[slot]!)
  a.caraKind[slot] = 0
  a.caraCantitate[slot] = 0
  raport.lasateLaPicioare++
  return r.ultimulSlot
}

function detaliuItemDin(motiv: ReasonCode): number {
  return motiv === Reason.INACCESIBIL ? DetaliuItem.COMPONENTE_DIFERITE : DetaliuItem.DEPOZITE_PLINE
}

/**
 * Incheie jobul unui agent: elibereaza rezervarile pe PERECHEA (claimant, jobId),
 * lasa marfa la picioare daca e cazul, scrie racirea si cauza unde le e locul,
 * si lasa agentul liber — cu o scanare la tickul urmator, ca sa nu hoinareasca
 * pana la decalajul obisnuit.
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
  const fel = a.jobKind[slot]!
  const step = a.jobStep[slot]!
  const target = a.jobTarget[slot]!
  const dest = a.jobDest[slot]!
  elibereaza(w.rezervari, a.id[slot]!, a.jobId[slot]!)
  if (fel === FelJob.CARA) marcheazaZoneMurdare(w)

  // Marfa nu dispare: orice sfarsit cu mana plina o lasa jos.
  const rezultat = lasaLaPicioare(w, rules, slot)

  if (cum === Sfarsit.INCOMPLET) {
    if (fel === FelJob.SAPA) {
      const ds = slotDesemnare(w.desemnari, target)
      if (racire === Racire.TINTA) {
        if (ds !== -1) {
          w.desemnari.reincercaLaTick[ds] = w.tick + racireDesemnare(w, rules)
          w.desemnari.ultimulMotiv[ds] = codMotiv(motiv ?? Reason.INACCESIBIL)
          w.desemnari.ultimulMotivDetaliu[ds] = DetaliuMotiv.FARA_LOC_DE_LUCRU
        }
      } else {
        evitaTinta(w, slot, target, w.tick + rules.jobRetryTicks)
        // Cauza se vede si pe tinta, ca overlay-ul sa aiba ce arata — dar fara
        // racire pe ea: altcineva o poate lua chiar acum.
        if (ds !== -1 && motiv) {
          w.desemnari.ultimulMotiv[ds] = codMotiv(motiv)
          w.desemnari.ultimulMotivDetaliu[ds] = DetaliuMotiv.NICIUNUL
        }
      }
    } else {
      // Caratul: ce EXISTA dupa refuz e sursa (daca n-a fost ridicata) sau
      // mormanul lasat la picioare. Racirea se scrie pe ele, nu pe un id mort.
      const sursa = step <= PasCara.RIDICA ? slotItem(w.iteme, target) : -1
      const is = sursa !== -1 ? sursa : rezultat
      if (racire === Racire.TINTA) {
        if (is !== -1) memoreazaPeItem(w, rules, is, motiv ?? Reason.INACCESIBIL, detaliuItemDin(motiv ?? Reason.INACCESIBIL))
      } else {
        if (step >= PasCara.MERGE_DEST) {
          // Drumul MEU spre depozitul ala e blocat; zona ramane pentru altii.
          const cs = slotCelulaDeZona(w.zone, dest)
          if (cs !== -1) evitaTinta(w, slot, w.zone.celule.zonaId[cs]!, w.tick + rules.jobRetryTicks)
        }
        if (sursa !== -1) evitaTinta(w, slot, target, w.tick + rules.jobRetryTicks)
        // Mormanul lasat jos NU se raceste pe pereche: cu zona evitata, scannerul
        // il respinge singur (toate zonele cu loc sunt evitate → racire pe item,
        // scrisa de scanner), iar daca exista ALT depozit, pionul are voie sa-l
        // incerce. O racire aici ar fi fost redundanta (mutatia a trecut verde)
        // si ar fi ascuns depozitul bun timp de `jobRetryTicks`.
        if (is !== -1 && motiv) {
          w.iteme.ultimulMotiv[is] = codMotiv(motiv)
          w.iteme.ultimulMotivDetaliu[is] = DetaliuItem.NICIUNUL
        }
      }
    }
    if (motiv) {
      w.ratiune.stare[slot] = StareRatiune.RESPINS
      w.ratiune.motivFinal[slot] = codMotiv(motiv)
    }
    if (a.jobProgres[slot] === 0 && a.jobEfect[slot] === 0) w.ratiune.joburiFaraProgres++
  }
  if (cum === Sfarsit.TERMINAT) raport.joburiTerminate++
  else raport.joburiAnulate++

  a.jobKind[slot] = 0
  a.jobId[slot] = 0
  a.jobTarget[slot] = 0
  a.jobDest[slot] = 0
  a.jobCantitate[slot] = 0
  a.jobEfect[slot] = 0
  a.jobStep[slot] = 0
  a.jobProgres[slot] = 0
  a.jobIncercari[slot] = 0
  a.hasGoal[slot] = 0
  a.scanLaTick[slot] = w.tick + 1
  clearPath(w.paths, slot)
}

// ---------------------------------------------------------------------------
// drumul refuzat, intr-un pas de mers
// ---------------------------------------------------------------------------

/**
 * `findPath` a spus nu unui pion cu job. Trei cauze, trei raspunsuri:
 *
 *   INACCESIBIL      — celula-tinta nu mai e buna (i-a disparut podeaua, a
 *                      zidit-o cineva). SAPA: se cauta ALTA celula de lucru, in
 *                      componenta pionului, fara sa conteze ca incercare; abia
 *                      daca nu mai e niciuna, jobul se incheie cu racire pe TINTA.
 *                      CARA spre depozit: alta celula de destinatie (tranzactie
 *                      de rezervare), altfel INCOMPLET cu marfa la picioare.
 *   OCUPAT_DE_OSTIL  — drumul EXISTA, cineva sta in el (D7c). Se numara o
 *                      incercare si se cauta alta celula, sarind peste cea
 *                      curenta (poate ostilul sta chiar pe ea); daca nu e
 *                      alta, se asteapta racirea de drum.
 *   BUGET_DEPASIT    — prea scump ACUM. Se numara o incercare si se asteapta.
 *
 * La `jobMaxIncercari` jobul se incheie cu racire pe PERECHE: pionul asta nu mai
 * insista, dar tinta ramane libera pentru altcineva.
 *
 * Cat timp graful de regiuni are blocuri murdare (o sapatura din acelasi tick,
 * inca nereconstruita), re-alegerea se AMANA la tickul urmator: pe regiuni stale
 * o celula proaspat calcabila e invizibila si jobul s-ar incheia cu un motiv fals.
 */
export function drumRefuzat(w: World, rules: Rules, slot: number, motiv: ReasonCode): void {
  const a = w.agents
  raport.refuzuriDrum++
  const cara = a.jobKind[slot] === FelJob.CARA

  if (motiv === Reason.INACCESIBIL) {
    if (w.regions.dirty.size > 0) return
    if (!cara) {
      if (refaLoculDeLucru(w, rules, slot)) return
    } else if (a.jobStep[slot] === PasCara.MERGE_DEST) {
      if (refaDestinatia(w, rules, slot)) return
    }
    terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.INACCESIBIL, Racire.TINTA)
    return
  }

  a.jobIncercari[slot] = a.jobIncercari[slot]! + 1
  if (a.jobIncercari[slot]! >= rules.jobMaxIncercari) {
    terminaJob(w, rules, slot, Sfarsit.INCOMPLET, motiv, Racire.PERECHE)
    return
  }

  if (motiv === Reason.OCUPAT_DE_OSTIL && w.regions.dirty.size === 0) {
    if (!cara) {
      const curenta = cellKey(a.jobWorkX[slot]!, a.jobWorkY[slot]!, a.jobWorkZ[slot]!)
      if (refaLoculDeLucru(w, rules, slot, curenta)) return
    } else if (a.jobStep[slot] === PasCara.MERGE_DEST) {
      if (refaDestinatia(w, rules, slot, slotCelulaDeZona(w.zone, a.jobDest[slot]!))) return
    }
  }

  w.ratiune.stare[slot] = StareRatiune.ASTEAPTA_DRUM
  w.ratiune.motivFinal[slot] = codMotiv(motiv)
}

/**
 * Cauta din nou celula de lucru a jobului de sapat, IN COMPONENTA pionului, si
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

/**
 * Alta celula de destinatie pentru marfa din mana, ca TRANZACTIE de rezervare:
 * vechea celula se elibereaza si noua se rezerva, altfel jobul e INCOMPLET.
 * Marfa se cauta de la pion (e in mana lui), cu `prioLoc = 0`: orice depozit e
 * mai bun decat mana. `evitaCs` sare peste o celula anume (cea ocupata de un ostil).
 */
function refaDestinatia(w: World, rules: Rules, slot: number, evitaCs = -1): boolean {
  const a = w.agents
  if (a.caraCantitate[slot] === 0) return false
  const ax = cellOf(a.x[slot]!)
  const ay = cellOf(a.y[slot]!)
  const az = a.z[slot]!
  const c = w.zone.celule
  const vechi = slotCelulaDeZona(w.zone, a.jobDest[slot]!)
  // Celula curenta nu e libera in index (e rezervata de noi), deci cautarea n-o
  // vede; `evitaCs` conteaza doar daca intre timp a fost eliberata si re-listata.
  const dest = cautaDestinatie(w, rules, slot, a.caraKind[slot]!, a.caraCantitate[slot]!, ax, ay, az, 0, ax, ay, az)
  if (!dest.ok || dest.value.cs === vechi || dest.value.cs === evitaCs) return false
  const cerere: Cerere = { targetId: c.id[dest.value.cs]!, layer: Strat.LUCRU, count: a.caraCantitate[slot]!, maxCount: rules.itemStackMax, maxClaimants: 1 }
  if (!poateRezerva(w.rezervari, a.id[slot]!, cerere).ok) return false
  elibereazaUna(w.rezervari, a.id[slot]!, a.jobId[slot]!, a.jobDest[slot]!, Strat.LUCRU)
  const out = rezervaToate(w.rezervari, a.id[slot]!, a.jobId[slot]!, [cerere])
  if (!out.ok) return false
  a.jobDest[slot] = c.id[dest.value.cs]!
  a.jobCantitate[slot] = a.caraCantitate[slot]!
  a.jobWorkX[slot] = c.wx[dest.value.cs]!
  a.jobWorkY[slot] = c.wy[dest.value.cs]!
  a.jobWorkZ[slot] = c.z[dest.value.cs]!
  a.jobStep[slot] = PasCara.MERGE_DEST
  a.jobProgres[slot] = 0
  tintesteLocDeLucru(w, slot)
  marcheazaZoneMurdare(w)
  raport.locuriDeLucruRefacute++
  return true
}

// ---------------------------------------------------------------------------
// pasii de oprire: LUCREAZA, RIDICA, LASA
// ---------------------------------------------------------------------------

/** Un tick intr-un pas de oprire. Dispecerizeaza pe felul jobului si pasul lui. */
export function lucreaza(w: World, rules: Rules, slot: number): void {
  const a = w.agents
  if (a.jobKind[slot] === FelJob.CARA) {
    if (a.jobStep[slot] === PasCara.RIDICA) ridica(w, rules, slot)
    else lasa(w, rules, slot)
    return
  }
  lucreazaSapa(w, rules, slot)
}

function peCelula(w: World, slot: number, wx: number, wy: number, z: number): boolean {
  const a = w.agents
  return cellOf(a.x[slot]!) === wx && cellOf(a.y[slot]!) === wy && a.z[slot] === z
}

/**
 * Un tick de munca. Agentul sta pe celula lui de lucru si sapa.
 *
 * Validarea se face la FIECARE tick, nu doar la start (research: „un job trebuie
 * sa-si poata declara invaliditatea in timpul executiei"): desemnarea poate fi
 * anulata, agentul poate fi mutat de `dezgroapa`, podeaua de sub el poate fi
 * desemnata DUPA ce si-a ales locul, voxelul poate fi sapat de altcineva cu mana.
 */
function lucreazaSapa(w: World, rules: Rules, slot: number): void {
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
  w.ratiune.tickuriDeLucru++
  if (a.jobProgres[slot]! < rules.digWorkUnits) return

  const out = sapaVoxel(w, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, rules)
  if (!out.ok) {
    if (out.reason === Reason.CAPACITATE_DEPASITA) {
      // Nu e loc pentru ce ar iesi din voxel. Voxelul si desemnarea raman;
      // cauza e a tintei (nimeni n-o poate sapa acum), cu racire scurta.
      terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.CAPACITATE_DEPASITA, Racire.TINTA)
      return
    }
    // Voxelul nu mai e de sapat (l-a sapat altcineva, sau nu mai e solid).
    // Premisa desemnarii a disparut: se termina jobul si dispare si ea.
    terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
    stergeDesemnare(d, ds)
    return
  }
  terminaJob(w, rules, slot, Sfarsit.TERMINAT)
  stergeDesemnare(d, ds)
}

/**
 * RIDICA: pionul sta pe morman si il ia in mana. Itemul se valideaza la fiecare
 * tick: poate a murit (l-a mutat cârligul de teren si s-a contopit), poate s-a
 * mutat (a cazut la sapat) — atunci se retinteste, cu progresul pastrat.
 */
function ridica(w: World, rules: Rules, slot: number): void {
  const a = w.agents
  const it = w.iteme
  const is = slotItem(it, a.jobTarget[slot]!)
  if (is === -1) {
    terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
    return
  }
  if (!peCelula(w, slot, it.wx[is]!, it.wy[is]!, it.z[is]!)) {
    if (w.regions.dirty.size > 0) return
    a.jobWorkX[slot] = it.wx[is]!
    a.jobWorkY[slot] = it.wy[is]!
    a.jobWorkZ[slot] = it.z[is]!
    a.jobStep[slot] = PasCara.MERGE_SURSA
    tintesteLocDeLucru(w, slot)
    raport.locuriDeLucruRefacute++
    return
  }

  a.jobProgres[slot] = a.jobProgres[slot]! + rules.workUnitsPerTick
  raport.tickuriDeLucru++
  w.ratiune.tickuriDeLucru++
  if (a.jobProgres[slot]! < rules.haulPickupUnits) return

  const cant = Math.min(a.jobCantitate[slot]!, it.cantitate[is]!)
  const idItem = it.id[is]!
  a.caraKind[slot] = it.kind[is]!
  a.caraCantitate[slot] = cant
  a.jobEfect[slot] = 1
  // Sursa s-a consumat: DOAR ea se elibereaza, destinatia ramane tinuta.
  elibereazaUna(w.rezervari, a.id[slot]!, a.jobId[slot]!, idItem, Strat.CARAT)
  const luat = iaDinItem(w, is, cant)
  if (luat !== cant) a.caraCantitate[slot] = luat
  if (it.alive[is] === 0) elibereazaTinta(w.rezervari, idItem)

  a.jobProgres[slot] = 0
  a.jobStep[slot] = PasCara.MERGE_DEST
  const cs = slotCelulaDeZona(w.zone, a.jobDest[slot]!)
  if (cs === -1) {
    terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.FARA_DEPOZIT, Racire.TINTA)
    return
  }
  a.jobWorkX[slot] = w.zone.celule.wx[cs]!
  a.jobWorkY[slot] = w.zone.celule.wy[cs]!
  a.jobWorkZ[slot] = w.zone.celule.z[cs]!
  tintesteLocDeLucru(w, slot)
}

/**
 * LASA: pionul sta pe celula de depozit rezervata si depune. Celula accepta
 * (goala, sau acelasi fel cu loc) prin constructie — nimeni altcineva n-a putut
 * pune nimic pe o celula rezervata ca destinatie — dar se verifica oricum, si
 * daca nu, marfa se lasa la picioare, numarata, nu se pierde.
 */
function lasa(w: World, rules: Rules, slot: number): void {
  const a = w.agents
  const c = w.zone.celule
  const cs = slotCelulaDeZona(w.zone, a.jobDest[slot]!)
  if (cs === -1) {
    terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
    return
  }
  const cx = c.wx[cs]!
  const cy = c.wy[cs]!
  const cz = c.z[cs]!
  if (!peCelula(w, slot, cx, cy, cz)) {
    if (w.regions.dirty.size > 0) return
    a.jobStep[slot] = PasCara.MERGE_DEST
    tintesteLocDeLucru(w, slot)
    raport.locuriDeLucruRefacute++
    return
  }

  a.jobProgres[slot] = a.jobProgres[slot]! + rules.workUnitsPerTick
  raport.tickuriDeLucru++
  w.ratiune.tickuriDeLucru++
  if (a.jobProgres[slot]! < rules.haulDropUnits) return

  const kind = a.caraKind[slot]!
  const cant = a.caraCantitate[slot]!
  if (cant === 0) {
    terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
    return
  }
  if (locPeCelula(w, rules, kind, cx, cy, cz) < cant) {
    terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.CAPACITATE_DEPASITA, Racire.TINTA)
    return
  }
  const it = itemLaCelula(w.iteme, cx, cy, cz)
  if (it !== -1) {
    w.iteme.cantitate[it] = w.iteme.cantitate[it]! + cant
  } else {
    const out = creeazaItem(w.iteme, w.nextId, kind, cx, cy, cz, cant)
    if (!out.ok) {
      terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.CAPACITATE_DEPASITA, Racire.TINTA)
      return
    }
    w.nextId++
  }
  a.caraKind[slot] = 0
  a.caraCantitate[slot] = 0
  marcheazaZoneMurdare(w)
  raport.itemeMutate++
  terminaJob(w, rules, slot, Sfarsit.TERMINAT)
}

// ---------------------------------------------------------------------------
// editarea terenului — o singura cale, pentru comanda si pentru job
// ---------------------------------------------------------------------------

/**
 * Un morman se muta (i-a disparut podeaua): se scoate din locul vechi si se
 * reaseaza prin `asazaItem` pornind de la (wx, wy, z), pastrandu-si id-ul daca
 * ajunge morman nou. Daca se contopeste, id-ul vechi moare si cine il tinea ca
 * sursa e intrerupt — va re-scana si va gasi mormanul contopit.
 */
function mutaItem(w: World, rules: Rules, is: number, wx: number, wy: number, z: number): void {
  const it = w.iteme
  const id = it.id[is]!
  const kind = it.kind[is]!
  const cant = it.cantitate[is]!
  stergeItem(it, is)
  const r = asazaItem(w, rules, kind, cant, wx, wy, z, id)
  marcheazaZoneMurdare(w)
  if (slotItem(it, id) !== -1) return
  for (const claimant of elibereazaTinta(w.rezervari, id)) {
    const a = w.agents
    for (let i = 0; i < a.count; i++) {
      if (a.alive[i] === 1 && a.id[i] === claimant && a.jobKind[i] !== 0 && a.jobTarget[i] === id) terminaJob(w, rules, i, Sfarsit.INTRERUPT)
    }
  }
  void r
}

/**
 * Sapa un voxel, murdareste graful de regiuni, lasa mormanul de deasupra sa
 * cada si produce yield-ul. Comanda `dig` si jobul de sapat trec AMANDOUA pe
 * aici: un voxel sapat de un pion nu are voie sa fie altceva decat un voxel
 * sapat de jucator. Refuza `CAPACITATE_DEPASITA` cand nu mai incape niciun
 * morman in lume — voxelul ramane, marfa nu se pierde.
 */
export function sapaVoxel(w: World, wx: number, wy: number, z: number, rules: Rules): Outcome<void> {
  if (w.iteme.vii >= w.iteme.capacity) {
    return refuse(Reason.CAPACITATE_DEPASITA, { camp: 'iteme', capacitate: w.iteme.capacity, motiv: 'nu mai incape niciun morman' })
  }
  const mat = materialAt(w.terrain, wx, wy, z)
  if (!mat.ok) return mat
  const out = dig(w.terrain, wx, wy, z)
  if (!out.ok) return out
  markDirty(w.regions, wx, wy, z, rules)
  // Cârligul: mormanul de deasupra si-a pierdut podeaua — cade. Sapatul e
  // singurul fel in care dispare o podea, deci un cârlig acopera tot.
  const sus = itemLaCelula(w.iteme, wx, wy, z + 1)
  if (sus !== -1) mutaItem(w, rules, sus, wx, wy, z)
  const y = rules.digYield[mat.value]
  if (y && y.cantitate > 0) {
    asazaItem(w, rules, y.fel, y.cantitate, wx, wy, z)
    raport.itemeProduse++
  }
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

/**
 * O celula de zona dispare (zona stearsa): cine o tinea ca destinatie e
 * intrerupt (marfa la picioare), in ordinea slotului, si rezervarile se sterg.
 * Stergerea din store e a apelantului.
 */
export function anuleazaCelulaDeZona(w: World, rules: Rules, cs: number): void {
  const a = w.agents
  const id = w.zone.celule.id[cs]!
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0 || a.jobKind[i] !== FelJob.CARA || a.jobDest[i] !== id) continue
    terminaJob(w, rules, i, Sfarsit.INTRERUPT)
  }
  elibereazaTinta(w.rezervari, id)
}

// ---------------------------------------------------------------------------
// dupa incarcare
// ---------------------------------------------------------------------------

/**
 * Rezervarile sunt DERIVED: se refac din joburile agentilor VII, in ordinea
 * slotului. Un job care nu se poate re-rezerva e un save inconsistent: se
 * anuleaza — FARA eliberare, fiindca n-a apucat sa rezerve — se numara in
 * `anulateLaIncarcare`, iar marfa din mana se lasa la picioare (nu dispare).
 */
export function reconstruiesteRezervari(w: World, rules: Rules): number {
  const a = w.agents
  let anulate = 0
  for (let i = 0; i < a.count; i++) {
    if (a.jobKind[i] === 0) continue
    let out: Outcome<void>
    if (a.alive[i] === 0) {
      out = refuse(Reason.ENTITATE_INEXISTENTA, { id: a.id[i]!, motiv: 'claimant mort' })
    } else if (a.jobKind[i] === FelJob.CARA) {
      const sursaOk = a.jobStep[i]! > PasCara.RIDICA || slotItem(w.iteme, a.jobTarget[i]!) !== -1
      const destOk = slotCelulaDeZona(w.zone, a.jobDest[i]!) !== -1
      out = !sursaOk
        ? refuse(Reason.ENTITATE_INEXISTENTA, { id: a.jobTarget[i]! })
        : !destOk
          ? refuse(Reason.ENTITATE_INEXISTENTA, { id: a.jobDest[i]! })
          : rezervaToate(w.rezervari, a.id[i]!, a.jobId[i]!, cereriPentru(w, rules, i))
    } else {
      out = slotDesemnare(w.desemnari, a.jobTarget[i]!) === -1
        ? refuse(Reason.ENTITATE_INEXISTENTA, { id: a.jobTarget[i]! })
        : rezervaToate(w.rezervari, a.id[i]!, a.jobId[i]!, cereriPentru(w, rules, i))
    }
    if (out.ok) continue
    a.jobKind[i] = 0
    a.jobId[i] = 0
    a.jobTarget[i] = 0
    a.jobDest[i] = 0
    a.jobCantitate[i] = 0
    a.jobEfect[i] = 0
    a.jobStep[i] = 0
    a.jobProgres[i] = 0
    a.jobIncercari[i] = 0
    a.hasGoal[i] = 0
    clearPath(w.paths, i)
    if (a.alive[i] === 1) lasaLaPicioare(w, rules, i)
    else { a.caraKind[i] = 0; a.caraCantitate[i] = 0 }
    anulate++
  }
  w.rezervari.anulateLaIncarcare = anulate
  marcheazaZoneMurdare(w)
  return anulate
}

/** Exista tinta unei rezervari? Pentru `verificaRezervari` (clauza 5), in teste si acceptanta. */
export function existaTinta(w: World): (targetId: number, layer: number) => boolean {
  return (targetId, layer) => {
    if (layer === Strat.CARAT) return slotItem(w.iteme, targetId) !== -1
    return slotDesemnare(w.desemnari, targetId) !== -1 || slotCelulaDeZona(w.zone, targetId) !== -1
  }
}

void slotZona
