/**
 * Starea lumii.
 *
 * Doua reguli de arhitectura, luate din research si valabile de la primul camp:
 *
 * 1. SoA, nu AoS. Agentii stau in array-uri paralele de primitive, nu ca obiecte
 *    per agent. Masuratorile din panou arata multiplicatori de 1,58x-24,9x intre
 *    ECS/SoA si OOP in JS, iar acei multiplicatori nu se mai obtin retroactiv.
 *
 * 2. Fiecare camp e etichetat PERSISTED / DERIVED / TRANSIENT. Ce e DERIVED nu se
 *    salveaza — se reconstruieste la incarcare. Save-ul descrie INTENTIA
 *    jucatorului, nu structurile interne de accelerare.
 *
 * Pozitiile sunt INTREGI, in milimetri. Fara float in starea de simulare: nu
 * pentru multiplayer (nu e in plan), ci fiindca float-ul face hash-ul de stare
 * fragil intre versiuni de runtime, si hash-ul e singura dovada de determinism.
 */

import type { RngState } from './rng.ts'
import type { Terrain } from './terrain/terrain.ts'
import type { RegionStore } from './regions.ts'
import type { PathStore } from './drumuri.ts'
import type { DesignationStore } from './desemnari.ts'
import type { ReservationStore } from './rezervari.ts'
import type { RatiuneStore } from './joburi.ts'
import type { ItemStore } from './iteme.ts'
import type { ZoneStore } from './zone.ts'

/**
 * Versiunea schemei de stare. Creste la ORICE camp nou. Vezi save.ts.
 *
 *   1 — S1-15: agenti, teren, drumuri, extinderea acoperirii de regiuni
 *   2 — S16-19: desemnari, joburi pe agenti, prioritati personale
 *   3 — S16-19 dupa recenzie: racirea pe pereche ca MULTIME, scanarea imediata
 *       dupa un job, blocurile murdare persistate
 *   4 — S16-19 taietura 2: iteme, zone pictate, joburi de carat (a doua
 *       categorie, deci `prioPersonala` isi schimba pasul)
 *   5 — S16-19 taietura 3: nevoi (foame, odihna) si racirea lor
 *   6 — S16-19 taietura 3: dispozitia, gandurile de eveniment, plecatii
 */
export const SCHEMA_VERSION = 7

/**
 * Categoriile de munca. Lista de STRUCTURA (ce feluri de munca exista), nu numar
 * de gameplay: prioritatile personale se stocheaza per categorie, iar semantica
 * lor (0 = niciodata, N = exclusiv) e in content.
 */
export const Categorie = {
  SAPA: 0,
  CARA: 1,
  /**
   * Exista inainte de primul job de construit, si asta muta hash-ul: latimea
   * lui `prioPersonala` e PERSISTED. Se face acum, in acelasi pas cu schema 7,
   * ca hash-ul de referinta sa se re-ancoreze O SINGURA data — altfel a doua
   * mutare ar arata ca o regresie.
   */
  CONSTRUIESTE: 2,
} as const
export type CategorieId = (typeof Categorie)[keyof typeof Categorie]
export const CATEGORII = 3

/**
 * Ce piesa se construieste. Tabelul cu materiale, cantitati si timpi sta in
 * `content/rules.json`; aici e doar indexul lui.
 *
 * **`NICIUNA = 0`, si piesele reale incep de la 1.** Zero e valoare VALIDA in
 * enumerarile vecine (`Item.PIATRA = 0`), deci o migrare care ar umple cu zero
 * ar preface fiecare desemnare de sapat dintr-un save vechi intr-un „perete de
 * piatra" pe care nimic nu l-ar putea detecta. Cu o santinela, contradictia
 * dintre fel si piesa se poate REFUZA la incarcare, si chiar se refuza.
 */
export const Piesa = {
  NICIUNA: 0,
  PERETE: 1,
  PODEA: 2,
  SCARA: 3,
} as const
export type PiesaId = (typeof Piesa)[keyof typeof Piesa]

/**
 * Felul jobului curent al unui agent. 0 = fara job. Numerotarea e STRUCTURA si
 * intra in save: SAPA e `Desemnare.SAPA + 1`, cum era din taietura 1.
 */
export const FelJob = {
  NICIUNUL: 0,
  SAPA: 1,
  CARA: 2,
  MANANCA: 3,
  DOARME: 4,
} as const
export type FelJobId = (typeof FelJob)[keyof typeof FelJob]

/**
 * Nevoile, ca TABEL indexat — nu campuri separate.
 *
 * Lista de STRUCTURA. Fiecare nevoie are o coloana in `nevoi` si un rand in
 * `rules.nevoi`; cine o satisface e `DRIVERE[nevoiSpec[n].felJob]`. Asta e ce
 * face adevarata propozitia „o nevoie noua e un rand de tabel".
 */
export const Nevoie = {
  FOAME: 0,
  ODIHNA: 1,
} as const
export type NevoieId = (typeof Nevoie)[keyof typeof Nevoie]
export const NEVOI = 2

/**
 * Pasii unui job de nevoie: un drum, o oprire. Aceeasi paritate ca la celelalte
 * doua masini de stare, deci `pasDeMers` raspunde si pentru ele.
 */
export const PasNevoie = {
  MERGE: 0,
  CONSUMA: 1,
} as const
export type PasNevoieId = (typeof PasNevoie)[keyof typeof PasNevoie]

/**
 * Gandurile — ce trage dispozitia in sus sau in jos.
 *
 * Doua feluri, si distinctia e de ARHITECTURA, nu de continut:
 *
 *   - de STARE (FLAMAND, INFOMETAT, OBOSIT, EPUIZAT): functie PURA a nevoii
 *     curente, prin pragurile ei. NU se stocheaza — un gand stocat care descrie
 *     o stare e inca o copie care poate ramane in urma realitatii.
 *   - de EVENIMENT (DORMIT_PE_JOS, OPTIMISM_INITIAL): s-au INTAMPLAT, deci n-au
 *     de unde fi recalculate. Se tin intr-o multime marginita per pion, cu
 *     termen, exact ca racirea din `evitaTinta`.
 */
export const Gand = {
  NICIUNUL: 0,
  FLAMAND: 1,
  INFOMETAT: 2,
  OBOSIT: 3,
  EPUIZAT: 4,
  DORMIT_PE_JOS: 5,
  OPTIMISM_INITIAL: 6,
} as const
export type GandId = (typeof Gand)[keyof typeof Gand]
export const GANDURI = 7

/**
 * Ce gand produce fiecare nevoie la fiecare prag, indexat cu `Nevoie`.
 *
 * STRUCTURA (care nevoie da care gand), nu continut — valorile lor sunt in
 * `rules.ganduri`. Cele doua se EXCLUD: sub pragul critic e `critic`, nu
 * amandoua, si invariantul din `parseRules` conteaza pe asta cand verifica daca
 * pragul de plecare e atins de catalog.
 */
export const GAND_PENTRU_NEVOIE: readonly { readonly prag: GandId; readonly critic: GandId }[] = [
  { prag: Gand.FLAMAND, critic: Gand.INFOMETAT },
  { prag: Gand.OBOSIT, critic: Gand.EPUIZAT },
]

/** Pasii unui job de sapat. Un job e o masina de stare liniara, nu un arbore. */
export const PasJob = {
  MERGE: 0,
  LUCREAZA: 1,
} as const
export type PasJobId = (typeof PasJob)[keyof typeof PasJob]

/** Pasii unui job de carat: doua drumuri, doua opriri. */
export const PasCara = {
  MERGE_SURSA: 0,
  RIDICA: 1,
  MERGE_DEST: 2,
  LASA: 3,
} as const
export type PasCaraId = (typeof PasCara)[keyof typeof PasCara]

/**
 * E pasul unul de MERS (tinta e `jobWork*`) sau unul de oprire (se munceste pe
 * loc)? Ambele masini de stare alterneaza mers/oprire, pornind cu mers, deci
 * paritatea pasului raspunde pentru amandoua; sosirea la tinta face `pas + 1`.
 */
export function pasDeMers(step: number): boolean {
  return (step & 1) === 0
}

/**
 * Felurile de iteme. Lista de STRUCTURA; ce da fiecare material la sapat e in
 * content (`digYield`), validat contra listei asteia.
 */
export const Item = {
  PIATRA: 0,
  PAMANT: 1,
  LEMN: 2,
  HRANA: 3,
} as const
export type ItemId = (typeof Item)[keyof typeof Item]
export const ITEME = 4

/** Un milimetru e unitatea de baza. O celula de 1 m = 1000. */
export const MM_PER_CELL = 1000

/** Cate fluxuri de RNG are lumea. Numele lor sunt cheia in `rng`. */
export const RNG_STREAMS = ['worldgen', 'agents', 'evenimente', 'combat'] as const
export type RngStreamName = (typeof RNG_STREAMS)[number]

/** Relatia dintre doua fractiuni. Determina daca doi agenti pot imparti o celula (D7). */
export const Faction = {
  ASEZARE: 0,
  SALBATIC: 1,
  JEFUITOR: 2,
} as const
export type FactionId = (typeof Faction)[keyof typeof Faction]

/**
 * Depozit de agenti in SoA. `count` e numarul de sloturi FOLOSITE;
 * sloturile sunt stabile (un agent nu isi schimba indexul cat traieste).
 */
export interface AgentStore {
  /** PERSISTED */ count: number
  /** PERSISTED */ capacity: number
  /** PERSISTED */ id: Int32Array
  /** PERSISTED — milimetri */ x: Int32Array
  /** PERSISTED — milimetri */ y: Int32Array
  /** PERSISTED — NIVEL, in metri intregi. Nu milimetri: verticala e pe grila. */ z: Int32Array
  /** PERSISTED */ faction: Uint8Array
  /** PERSISTED — 0 = mort, slotul se poate reutiliza */ alive: Uint8Array
  /**
   * PERSISTED — unde vrea sa ajunga, in CELULE.
   *
   * Tinta e stare reala, nu derivata: fara ea in save, o lume reincarcata ar
   * trimite oamenii in alta parte decat mergeau. Si drumul e stare — sta in
   * `PathStore` si se salveaza; vezi antetul din `agents.ts` pentru de ce
   * propozitia „se recalculeaza din (pozitie, tinta, teren)" s-a dovedit falsa.
   */
  goalX: Int32Array
  /** PERSISTED */ goalY: Int32Array
  /** PERSISTED */ goalZ: Int32Array
  /** PERSISTED — 0 = nu are tinta */ hasGoal: Uint8Array
  /**
   * PERSISTED — milimetri acumulati spre celula urmatoare de pe drum.
   *
   * Exista fiindca `x`/`y` se schimba continuu, iar `z` discret, si tripletul
   * (celulaX, celulaY, z) trebuie sa fie VALID in orice moment. Cat timp agentul
   * aluneca in milimetri spre celula urmatoare, `cellOf(x)` trece granita cu un
   * tick inaintea lui `z`. Pe o panta, tickul ala il pune in celula destinatie cu
   * cota sursa — adica in piatra. Poarta din `stepAgents` il oprea acolo, si
   * fiindca era oprit nu mai apuca sa se alinieze: blocat pe viata, la 7 celule de
   * unde pornise.
   *
   * Acum simularea sare din centru in centru, dintr-o data, iar aici se aduna cat
   * a mers. Interpolarea neteda e treaba randarii, nu a simularii — exact cum
   * cere „fara float in starea de simulare".
   */
  progresMm: Int32Array

  // --- jobul curent (S16-19). Toate PERSISTED. ---
  //
  // Jobul NU se anuleaza la incarcare. PLAN M5 spunea „la load: anuleaza toate
  // joburile si rezervarile", scris inainte sa se dovedeasca (8 divergente din
  // 72) ca tot ce influenteaza miscarea trebuie sa supravietuiasca roundtrip-ului
  // ca `1000 + save + load + 1000 == 2000` sa tina. Un pion cu jobul anulat la
  // load re-scaneaza si reia progresul de la zero: alta pozitie, alt hash.
  // Intentia lui M5 — un save inconsistent nu deadlock-uieste tacut — se
  // pastreaza in `reconstruiesteRezervari`, care anuleaza CU RAPORT ce nu se
  // poate re-rezerva.
  /** `FelJob`. 0 = fara job. */
  jobKind: Uint8Array
  /** Identitatea INSTANTEI de job, din `w.nextId`. E componenta `jobId` din tuplul de rezervare. */
  jobId: Int32Array
  /** Id-ul tintei: o desemnare (SAPA) sau itemul-sursa (CARA). */
  jobTarget: Int32Array
  /** `PasJob` sau `PasCara`, dupa fel. */
  jobStep: Uint8Array
  /** Unitati de munca acumulate in pasul CURENT de oprire. Se reseteaza la fiecare tranzitie. */
  jobProgres: Int32Array
  /**
   * Celula spre care merge in pasul curent de mers: locul de lucru (SAPA), celula
   * itemului si apoi celula de depunere (CARA). Se persista SEPARAT de `goal*`:
   * cautarea ei nu are raspuns unic in timp (terenul se schimba), deci dupa
   * incarcare agentul ar putea alege alta — iar `goal*` se goleste la sosire.
   */
  jobWorkX: Int32Array
  jobWorkY: Int32Array
  jobWorkZ: Int32Array
  /**
   * Cate refuzuri de drum a primit jobul curent (BUGET_DEPASIT, OCUPAT_DE_OSTIL,
   * sau o celula de lucru pierduta). La `jobMaxIncercari` jobul se incheie: fara
   * plafon, un drum mereu peste buget parca pionul pe viata cu tinta rezervata.
   */
  jobIncercari: Uint8Array
  /**
   * CARA: id-ul CELULEI DE ZONA in care se depune (0 = niciuna). E a doua tinta a
   * jobului si a doua rezervare din tuplu; o celula de zona are id de entitate
   * tocmai ca sa incapa aici si in `evitaTinta` (o cheie de celula n-ar incapea
   * intr-un Int32).
   */
  jobDest: Int32Array
  /**
   * CARA: cat s-a REZERVAT din morman, inghetat la start. Panoul a aratat de ce
   * nu se poate citi din `cantitate`: mormanul creste prin contopire intre
   * rezervare si save, iar la incarcare `cereriPentru` ar re-rezerva alta
   * cantitate — alta lume, alt hash, si marfa care dispare din mana.
   */
  jobCantitate: Int32Array
  /**
   * 1 dupa ce jobul a PRODUS un efect in lume (a ridicat marfa). Zavorul
   * `joburiFaraProgres` citeste asta, nu `jobProgres`, fiindca `jobProgres` se
   * reseteaza la fiecare pas si un INCOMPLET pe drumul spre depozit ar parea „fara
   * nicio munca" desi marfa e in mana.
   */
  jobEfect: Uint8Array
  /** Ce are in mana: felul si cantitatea. Un pion FARA job are `caraCantitate = 0` (invariant). */
  caraKind: Uint8Array
  caraCantitate: Int32Array
  /**
   * MANANCA: cat a consumat deja din rezervare. E un camp PROPRIU, si nu o
   * scadere din `jobCantitate`, tocmai fiindca `jobCantitate` e ce se REZERVA:
   * daca ar scadea, lumea continua ar tine rezervarea initiala iar cea incarcata
   * ar re-rezerva doar restul — doua stari de rezervare diferite pentru aceeasi
   * lume, adica exact divergenta continuu/incarcat pe care o inchide „cererile
   * se calculeaza din tuplul PERSISTAT".
   */
  jobConsumat: Int32Array
  /**
   * Racirea pe PERECHEA (pion, tinta): dupa ce pionul a renuntat la o tinta din
   * cauze care tin de EL (drumul lui e blocat de un ostil, prea scump pentru el),
   * n-o reia pana la tickul pereche. Pe tinta nu se scrie nimic — altcineva, din
   * alta parte, poate ajunge.
   *
   * E o MULTIME marginita, `evitaSloturi` perechi per pion (`slot * evitaSloturi + k`),
   * nu un scalar. Prima versiune tinea o singura tinta, si recenzia a masurat ce
   * iese: cu doua tinte peste buget, a doua refuzata o stergea pe prima, iar
   * pionul le alterna pe viata — 59 de A*-uri esuate in 1200 de tickuri, zero
   * munca — exact defectul „pion parcat repetand cea mai scumpa cautare" pe care
   * plafonul de incercari trebuia sa-l inchida. Plafonul il mutase, nu il inchisese.
   * Evictia e a celei mai vechi (tickul de expirare cel mai mic). 0 = slot liber.
   *
   * Tinta poate fi o desemnare, un item sau o ZONA (id-uri de entitate, toate).
   */
  evitaSloturi: number
  evitaTinta: Int32Array
  evitaPanaLa: Int32Array
  /**
   * Tickul la care pionul cere de lucru IN AFARA decalajului obisnuit — de
   * exemplu tickul de dupa un job incheiat. Fara asta, dupa fiecare voxel sapat
   * pionul hoinarea aleator pana la urmatorul `(tick + id) % jobRescanTicks`:
   * masurat, 21,6% din timpul unei cariere. 0 = niciunul.
   */
  scanLaTick: Int32Array
  /**
   * Prioritatea personala pe fiecare categorie, `slot * CATEGORII + categorie`.
   * 0 = niciodata; 1..personalPriorityLevels. E „grila manuala"; modul Auto e
   * pur si simplu toata lumea la valoarea implicita din content.
   */
  prioPersonala: Uint8Array

  // --- nevoile (S16-19, taietura 3). Toate PERSISTED. ---
  /**
   * Cat de satula e fiecare nevoie, `slot * NEVOI + nevoie`, in miimi, 0..nevoieMax.
   * MARE = bine. Scade cu `nevoiSpec[n].scurgere` la ticul de nevoie al pionului.
   *
   * ZERO NU E VALOARE NEUTRA. Tabloul se UMPLE la creare si se rescrie la
   * nastere — panoul a aratat ca altfel o lume NOUA porneste cu toti pionii sub
   * pragul critic, iar primul inlocuitor al unui slot mort il mosteneste flamand.
   * Un defect care nu apare in nicio rulare scurta, fiindca cere ca un slot sa fi
   * murit intai.
   */
  nevoi: Int32Array
  /**
   * Racirea pe perechea (pion, NEVOIE), `slot * NEVOI + nevoie`: pana la tickul
   * asta, nevoia nu se mai cauta, si pionul cade inapoi pe scanarea de munca.
   *
   * Exista fiindca „sub pragul critic" nu garanteaza ca se poate face ceva: fara
   * mancare in toata asezarea, un pion infometat ar intrerupe jobul la fiecare
   * verificare, ar cauta, n-ar gasi, si ar relua — la nesfarsit, fara ca vreun
   * zavor sa vada ceva (`Sfarsit.INTRERUPT` nu atinge `joburiFaraProgres`).
   * Nu intrerupi ca sa nu faci nimic.
   */
  nevoieReincercaLaTick: Int32Array

  // --- dispozitia (S16-19, taietura 3). Toate PERSISTED. ---
  /**
   * Bara de dispozitie, 0..dispozitieMax. MARE = bine.
   *
   * Bara e PERSISTED, dar TINTA ei e DERIVED: tinta e suma gandurilor active si
   * se recalculeaza oricand, bara o urmareste lent si asimetric. Doua valori, nu
   * una, fiindca altfel un gand care apare si dispare ar smuci bara instantaneu,
   * iar jucatorul n-ar avea nicio fereastra in care sa reactioneze.
   *
   * Ca si nevoile: se UMPLE la creare (cu `dispozitieBaza`) si se rescrie la
   * nastere. Zero ar insemna fiecare pion nascut sub pragul de plecare.
   */
  dispozitie: Int32Array
  /**
   * Gandurile de EVENIMENT: multime marginita per pion, `slot * ganduriSloturi + k`.
   * `gandFel` 0 = slot liber. Acelasi tipar ca `evitaTinta`, si din acelasi motiv:
   * un tablou nemarginit per pion e stare care creste cu timpul de joc.
   *
   * Evictia e a termenului MINIM. La `ganduriSloturi = 4` si doua feluri de
   * eveniment ea e INACCESIBILA azi — testul ei foloseste un content cu cinci
   * feluri, altfel ar fi o garda care nu poate lega.
   */
  ganduriSloturi: number
  gandFel: Uint8Array
  gandPanaLa: Int32Array
}

/**
 * Cu cat porneste nevoia `n` a pionului cu id-ul dat — DEFAZAT, determinist.
 *
 * Decalajul `(tick + id) % nevoiTicks` muta doar MOMENTUL scaderii, nu FAZA
 * ciclului. Cu toti pornind plini si cu aceeasi scurgere, toata colonia trece
 * pragul intr-o fereastra de cateva sute de tickuri dintr-un ciclu de zeci de
 * mii, iar fiecare masa adauga exact aceeasi cantitate — deci valul nu se sparge
 * niciodata. Jucatorul ar vedea productia ca dinte de ferastrau si colonia
 * stingandu-se dintr-un singur pas.
 *
 * Fara RNG: e o functie pura de `id`, deci nu consuma din niciun flux si da
 * acelasi rezultat in lumea continua, in cea incarcata si in migrare.
 */
export function nevoiaInitiala(id: number, nevoie: number, nevoieMax: number, fazaPas: number, fazaSpan: number): number {
  return nevoieMax - (Math.abs(id * fazaPas + nevoie * 311) % fazaSpan)
}

export interface World {
  /** PERSISTED */ schema: number
  /** PERSISTED — singura sursa de aleator */ seed: number
  /** PERSISTED — singura sursa de TIMP din toata simularea */ tick: number
  /** PERSISTED — generatorul de identitati stabile */ nextId: number
  /** PERSISTED */ rng: Record<RngStreamName, RngState>
  /** PERSISTED */ agents: AgentStore
  /**
   * PERSISTED — marginile in care se misca agentii-substitut, in milimetri.
   *
   * Deliberat SEPARATE de coordonatele terenului, cat timp agentii sunt un
   * substitut. Se contopesc la S12-15, cand agentii devin reali si incep sa
   * calce pe celule de teren.
   */
  /** DERIVED. Extinderea lumii in mm, din harta macro. Vezi `createWorld`. */
  bounds: { w: number; h: number }
  /**
   * MIXT: chunk-urile ne-promovate sunt DERIVED (se regenereaza din seed),
   * cele promovate sunt PERSISTED (contin munca jucatorului).
   */
  terrain: Terrain
  /**
   * DERIVED — regiunile si reachability. Se reconstruiesc din teren.
   *
   * Stau pe `World` fiindca agentii au nevoie de ele la fiecare tick, iar
   * acoperirea lor trebuie sa fie o functie de starea PERSISTATA (pozitiile
   * agentilor), nu de istoricul intamplator al sesiunii. Vezi antetul din
   * `agents.ts` — fara asta, un roundtrip de save ar putea da alte drumuri.
   */
  regions: RegionStore
  /** PERSISTED — drumurile in curs. Un A* nu are raspuns unic; vezi `agents.ts`. */
  paths: PathStore
  /** PERSISTED — ce a cerut jucatorul sa se faca. Tintele joburilor de sapat. */
  desemnari: DesignationStore
  /** PERSISTED — mormanele de pe jos si din depozite. Tintele joburilor de carat. */
  iteme: ItemStore
  /** PERSISTED — zonele pictate si celulele lor; indexul lor e DERIVED. */
  zone: ZoneStore
  /**
   * DERIVED din joburile agentilor. Se reconstruieste la incarcare, in ordinea
   * slotului; ce nu se poate reconstrui se anuleaza cu raport. Vezi rezervari.ts.
   */
  rezervari: ReservationStore
  /** TRANSIENT — de ce sta fiecare pion. Pentru overlay si teste, nu pentru simulare. */
  ratiune: RatiuneStore
  /**
   * PERSISTED — cati pioni au PLECAT din asezare, de la inceputul lumii.
   *
   * Pe `World`, nu in `RatiuneStore`: acela e TRANSIENT si ar fi aratat 0 dupa
   * fiecare incarcare, desi plecatii raman plecati. Un numar care se reseteaza
   * cand salvezi nu e un numar. Intra si in hash.
   */
  plecatiTotal: number
}

export function makeAgentStore(capacity: number, prioPersonalaImplicita = 1, evitaSloturi = 4, nevoieMax = 1000, ganduriSloturi = 4, dispozitieBaza = 500): AgentStore {
  return {
    count: 0,
    capacity,
    id: new Int32Array(capacity),
    x: new Int32Array(capacity),
    y: new Int32Array(capacity),
    z: new Int32Array(capacity),
    faction: new Uint8Array(capacity),
    alive: new Uint8Array(capacity),
    goalX: new Int32Array(capacity),
    goalY: new Int32Array(capacity),
    goalZ: new Int32Array(capacity),
    hasGoal: new Uint8Array(capacity),
    progresMm: new Int32Array(capacity),
    jobKind: new Uint8Array(capacity),
    jobId: new Int32Array(capacity),
    jobTarget: new Int32Array(capacity),
    jobStep: new Uint8Array(capacity),
    jobProgres: new Int32Array(capacity),
    jobWorkX: new Int32Array(capacity),
    jobWorkY: new Int32Array(capacity),
    jobWorkZ: new Int32Array(capacity),
    jobIncercari: new Uint8Array(capacity),
    jobDest: new Int32Array(capacity),
    jobCantitate: new Int32Array(capacity),
    jobEfect: new Uint8Array(capacity),
    caraKind: new Uint8Array(capacity),
    caraCantitate: new Int32Array(capacity),
    jobConsumat: new Int32Array(capacity),
    evitaSloturi,
    evitaTinta: new Int32Array(capacity * evitaSloturi),
    evitaPanaLa: new Int32Array(capacity * evitaSloturi),
    scanLaTick: new Int32Array(capacity),
    prioPersonala: new Uint8Array(capacity * CATEGORII).fill(prioPersonalaImplicita),
    // UMPLUT, nu zero: vezi comentariul campului. Faza pe id o scrie
    // `spawnAgent`, care e singurul loc unde id-ul exista.
    nevoi: new Int32Array(capacity * NEVOI).fill(nevoieMax),
    nevoieReincercaLaTick: new Int32Array(capacity * NEVOI),
    // UMPLUTA, ca nevoile: zero ar insemna fiecare pion nascut sub pragul de plecare.
    dispozitie: new Int32Array(capacity).fill(dispozitieBaza),
    ganduriSloturi,
    gandFel: new Uint8Array(capacity * ganduriSloturi),
    gandPanaLa: new Int32Array(capacity * ganduriSloturi),
  }
}

/**
 * Are pionul gandul asta, la tickul asta? Numai gandurile de EVENIMENT stau in
 * multime; cele de stare se calculeaza din nevoi.
 */
export function areGand(a: AgentStore, slot: number, tick: number, fel: number): boolean {
  const k = a.ganduriSloturi
  const baza = slot * k
  for (let i = 0; i < k; i++) {
    if (a.gandFel[baza + i] === fel && a.gandPanaLa[baza + i]! > tick) return true
  }
  return false
}

/**
 * Scrie un gand de EVENIMENT. Acelasi fel isi REINNOIESTE termenul; altfel ia un
 * slot liber sau expirat, iar daca nu e niciunul, pe cel cu termenul cel mai mic.
 * Determinist: ordinea sloturilor e fixa.
 */
export function puneGand(a: AgentStore, slot: number, tick: number, fel: number, panaLa: number): void {
  const k = a.ganduriSloturi
  const baza = slot * k
  let liber = -1
  let celMaiVechi = 0
  for (let i = 0; i < k; i++) {
    if (a.gandFel[baza + i] === fel) { a.gandPanaLa[baza + i] = panaLa; return }
    if (liber === -1 && (a.gandFel[baza + i] === 0 || a.gandPanaLa[baza + i]! <= tick)) liber = i
    if (a.gandPanaLa[baza + i]! < a.gandPanaLa[baza + celMaiVechi]!) celMaiVechi = i
  }
  const i = liber === -1 ? celMaiVechi : liber
  a.gandFel[baza + i] = fel
  a.gandPanaLa[baza + i] = panaLa
}

/** Indexul slotului pentru un id, sau -1. Liniar deocamdata; devine index cand conteaza. */
export function slotOf(agents: AgentStore, id: number): number {
  for (let i = 0; i < agents.count; i++) {
    if (agents.id[i] === id && agents.alive[i] === 1) return i
  }
  return -1
}
