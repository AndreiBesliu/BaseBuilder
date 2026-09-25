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
import type { FelJobId, World } from './state.ts'
import { Categorie, CATEGORII, FelJob, Gand, GAND_PENTRU_NEVOIE, ITEME, Nevoie, NEVOI, PasCara, PasConstruieste, PasJob, pasDeMers, PasNevoie, puneGand } from './state.ts'
import { cellOf, clearPath } from './drumuri.ts'
import { blockOfCell, ensureArea, find, isWalkable, markDirty, NO_REGION, regionAt, REGION_SIZE } from './regions.ts'
import type { RegionStore } from './regions.ts'
import type { Terrain } from './terrain/terrain.ts'
import { dig, fill, materialAt, WORLD_CELLS } from './terrain/terrain.ts'
import { Material } from './terrain/chunk.ts'
import type { MaterialId } from './terrain/chunk.ts'
import { cadeDaca, constructiaPosibila, cotaDeAsezare, multimeaCareCade, poateSustine, Sol, solLa } from './stabilitate.ts'
import { cellKey, decodeCell } from './path.ts'
import { Desemnare, desemnareLaCelula, DetaliuMotiv, seSapaLa, slotDesemnare, stergeDesemnare } from './desemnari.ts'
import type { DesignationStore } from './desemnari.ts'
import type { Cerere } from './rezervari.ts'
import { elibereaza, elibereazaTinta, elibereazaUna, poateRezerva, rezervaToate, rezervatPe, Strat, sumaRezervata } from './rezervari.ts'
import { asazaItem, creeazaItem, DetaliuItem, iaDinItem, itemLaCelula, locPeCelula, slotItem, stergeItem } from './iteme.ts'
import { celulaDeZonaLa, indexZone, marcheazaZoneMurdare, prioritateaLocului, slotCelulaDeZona, slotZona, stergeCelulaDeZona } from './zone.ts'

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
  /** E prea nefericit ca sa munceasca. Se scrie INAINTE de poarta, nu dupa. */
  REFUZA_MUNCA: 7,
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
  /**
   * Unitati consumate de zidire, pe toata rularea.
   *
   * Al TREILEA termen al conservarii: `marfa in lume + itemePierdute +
   * unitatiZidite == produs`. Fara el, prima zidire ar inrosi noua aserțiuni de
   * `itemePierdute === 0`, iar tentatia ar fi sa le slabesti — adica sa pierzi
   * exact plasa care prinde marfa disparuta.
   */
  unitatiZidite: number
  /** Tickuri-pion petrecute pe drum spre o tinta de job, pe toata rularea. Cu `tickuriDeLucru`, masura pentru batching. */
  tickuriPeDrum: number
  /** Tickuri-pion petrecute muncind (sapat, ridicat, lasat), pe toata rularea. */
  tickuriDeLucru: number
  /**
   * ZAVOR, per lume: de cate ori o nevoie sub pragul critic a intrerupt un job.
   * Sta aici, nu in raportul de tick, fiindca `Sfarsit.INTRERUPT` nu atinge
   * `joburiFaraProgres` — deci fara contorul asta, o bucla intrerupe/reia n-ar
   * fi vazuta de niciun zavor existent.
   */
  intreruperiDeNevoie: number
  /**
   * De cate ori un pion a ajuns la ZIDESTE fara materialul intreg in mana. E o
   * stare pe care nicio cale corecta n-o produce — zavor, asertat 0 in toate
   * suitele. Panoul din 25.09 a masurat ce insemna lipsa lui: cu un ostil pe
   * morman, `refaTinta` trimitea constructorul la santier cu mana goala, 73 din 74
   * de joburi intr-o bucla de 3000 de tickuri, 2586 de tickuri de „zidire" din
   * nimic, si niciun zavor tras — `joburiFaraProgres` vedea progres.
   */
  zidiriCuManaGoala: number
  /**
   * De cate ori un constructor a ridicat prima parte a unei piese si n-a mai
   * gasit a doua sursa: marfa la picioare, rescanare la cadenta obisnuita (nu la
   * tickul urmator), motivul retintirii pe pion. Nu e marginit de un mecanism propriu, ci de faptul ca
   * sonda si retintirea au acelasi predicat si acelasi lant (`lantAcopera`): un
   * job pornit are a doua sursa prin constructie, deci contorul creste doar cand
   * lumea s-a schimbat intre scanare si retintire. Testele cer zero cu lumea
   * nemiscata, si exact unu pe scenariul care o misca.
   */
  ridicariAbandonate: number
  /** ZAVOR, per lume: de cate ori o nevoie sub prag N-A putut fi rezolvata si a primit racire. */
  nevoiNerezolvate: number
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
    unitatiZidite: 0,
    tickuriPeDrum: 0,
    tickuriDeLucru: 0,
    intreruperiDeNevoie: 0,
    nevoiNerezolvate: 0,
    zidiriCuManaGoala: 0,
    ridicariAbandonate: 0,
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
  /**
   * „Verificat la scan, refuzat la start": intre cele doua nu se schimba nimic pe un
   * singur fir, deci ar trebui sa fie zero MEREU. Contor propriu, pe langa
   * `rezervat`: cu mai multi claimanti pe morman, o sonda care ar cere altceva decat
   * pornirea ar produce exact asta — si s-ar ascunde in refuzurile de scanare.
   * ZAVOR fara proba pozitiva: nicio mutatie nu-l poate aprinde (nimic nu rezerva
   * intre sonda si pornire in acelasi apel), deci `=== 0` in teste e o santinela
   * pentru o reordonare viitoare, nu o proba a ceva de azi.
   */
  refuzatLaStart: number
  /** Cate celule de depozit s-au examinat in cautarile de destinatie. */
  evaluariDestinatie: number
  /** Cate mormane a produs sapatul. */
  itemeProduse: number
  /** Cate UNITATI a produs sapatul. Cu asta se poate asserta conservarea; mormanele nu se pot aduna. */
  unitatiProduse: number
  /** Cate depuneri reusite in depozit (LASA). */
  itemeMutate: number
  /** De cate ori s-a lasat marfa la picioare (job incheiat cu mana plina). */
  lasateLaPicioare: number
  /** Cate joburi de NEVOIE au pornit (mancat, dormit). */
  joburiDeNevoie: number
  /** Cate unitati de hrana s-au consumat. Cu ea se poate asserta conservarea mancarii. */
  unitatiMancate: number
  /** Cati voxeli s-au prabusit (S20-23). */
  voxeliPrabusiti: number
  /** Cate piese s-au zidit in tickul asta. */
  pieseZidite: number
  /**
   * Cate tickuri a stat un constructor la ZIDESTE cu celula santierului OCUPATA (un om
   * pe ea), fara sa munceasca: asteptare, nu refuz. Zero cand nimeni nu sta pe santiere.
   */
  santierOcupat: number
  /** Cati pioni au CAZUT odata cu podeaua lor. Nu e acelasi lucru cu `ingropati`. */
  pioniCazuti: number
  /**
   * Cati pioni au PLECAT din asezare in tickul asta (a treia treapta).
   *
   * Refuzul muncii (treapta a doua) e in raportul de AGENTI, nu aici: se decide
   * la poarta de scanare, si un al doilea camp cu acelasi nume in doua rapoarte
   * a facut deja ca o sonda sa citeasca mereu zero.
   */
  plecati: number
  /**
   * Cate INTRARI au parcurs cautarile de nevoie. Ca `zone.index.pasi`: numarul de
   * cautari nu spune nimic despre cost, iar asta e cifra pe care o masoara garda
   * K05 a taieturii 3.
   */
  pasiNevoi: number
  /** Cate cautari de a DOUA sursa (ridicarea in mai multe randuri) s-au facut. */
  cautariSursa: number
  /** Cate INTRARI au parcurs cautarile de a doua sursa. Cifra de cost, ca `pasiNevoi`. */
  pasiCautareSursa: number
  /** Cate INTRARI a parcurs `rezumatMaterial`. O colonie fara santiere: 0. */
  pasiRezumat: number
}

const raport: JobTickReport = {
  scanari: 0, vizite: 0, candidatiExaminati: 0, candidatiTaiati: 0, coridoare: 0,
  joburiPornite: 0, joburiTerminate: 0, joburiAnulate: 0,
  tickuriDeLucru: 0, locuriDeLucruRefacute: 0, refuzuriDrum: 0,
  faraMuncitor: 0, preaDeparte: 0, inaccesibil: 0, rezervat: 0, faraDepozit: 0, refuzatLaStart: 0,
  evaluariDestinatie: 0, itemeProduse: 0, unitatiProduse: 0, itemeMutate: 0, lasateLaPicioare: 0,
  joburiDeNevoie: 0, unitatiMancate: 0, pasiNevoi: 0, plecati: 0, voxeliPrabusiti: 0, pioniCazuti: 0, pieseZidite: 0, santierOcupat: 0,
  cautariSursa: 0, pasiCautareSursa: 0, pasiRezumat: 0,
}

export function lastJobReport(): JobTickReport {
  return raport
}

/** Se cheama la inceputul fiecarui tick de agenti. */
export function resetJobReport(): void {
  // STRUCTURAL, nu camp cu camp. Lista explicita de dinainte a supravietuit trei
  // taieturi si a cazut la a patra: trei campuri noi (`joburiDeNevoie`,
  // `unitatiMancate`, `pasiNevoi`) n-au fost adaugate aici, deci se adunau la
  // infinit. Sonda a raportat 44 de milioane de unitati mancate intr-o lume care
  // continea 900 — un numar imposibil, dar unul pe care nicio asertiune nu-l
  // urmarea. Un contor de tick care nu se reseteaza nu da erori, da cifre.
  //
  // determinism-ok: toate cheile primesc aceeasi valoare, deci ordinea nu poate
  // schimba rezultatul; `sort()` e acolo doar ca scanerul sa nu aiba de ghicit.
  for (const k of (Object.keys(raport) as (keyof JobTickReport)[]).sort()) raport[k] = 0
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
    // Peste FARA_DEPOZIT: intr-o colonie cu santiere si marfa pe jos, „n-am din ce
    // zidi" numeste ce lipseste, iar depozitul e doar cauza generica a oricarei
    // marfi de pe jos — recenzia din 25.09 a masurat ca pe 10 + 5 + 5 fara depozit
    // pionul spunea FARA_DEPOZIT, si jucatorul picta un depozit degeaba. Sub
    // INACCESIBIL si REZERVAT, care sunt „am ajuns la ea si n-am putut".
    case Reason.LIPSA_MATERIAL: return 4
    case Reason.INACCESIBIL: return 5
    case Reason.REZERVAT: return 6
    default: return 0
  }
}

// ---------------------------------------------------------------------------
// ce cere un job
// ---------------------------------------------------------------------------

/**
 * Cererea pe stratul CARAT — UNA pentru toate: carat, construit, sonda din rezumat.
 *
 * Tuplul e CONSTANT pe strat: `maxCount` e plafonul stivei, `maxClaimants` e regula.
 * NU citeste cantitatea vie a mormanului. Aia intra o singura data, la cererea NOUA,
 * in mana apelantului: `liber = Q − sumaRezervata` (`liberPeItem`), din care se cere
 * `count`. Panoul din 25.09 a masurat de ce nu are voie sa fie altfel: un
 * `maxCount = Q vie` in tuplu anula joburi corecte la incarcare, fiindca Q scade
 * pe cai pe care rezervarile nu le vad (mancat pe MANCAT, cadere cu contopire
 * partiala) — iar `verificaRezervari` ia minimul peste tupluri vechi si s-ar
 * inrosi pe un morman care a CRESCUT intre doua cereri.
 *
 * Patru locuri din `src/` scriau tuplul literal, cu `maxClaimants: 1` (si un
 * test al cincilea). Patru copii ale aceluiasi fapt sunt patru feluri de a-l
 * strica pe unul singur.
 */
export function cerereCarat(rules: Rules, itemId: number, count: number): Cerere {
  return { targetId: itemId, layer: Strat.CARAT, count, maxCount: rules.itemStackMax, maxClaimants: rules.itemClaimantsMax }
}

/** Cat mai e LIBER pe un morman: cantitatea vie minus ce tin deja altii pe CARAT. Poate fi 0. */
export function liberPeItem(w: World, is: number): number {
  return w.iteme.cantitate[is]! - sumaRezervata(w.rezervari, w.iteme.id[is]!, Strat.CARAT)
}

/** Sapatul: un singur sapator pe un voxel. `count`/`maxCount` sunt 1/1 fiindca un voxel nu se imparte. */
export function cereriSapa(targetId: number): readonly Cerere[] {
  return [{ targetId, layer: Strat.LUCRU, count: 1, maxCount: 1, maxClaimants: 1 }]
}

/**
 * Caratul: destinatia (celula de zona) se tine tot jobul; sursa (itemul) doar
 * pana la ridicare inclusiv. Pe morman incap `itemClaimantsMax` carausi, fiecare
 * cu `cant`-ul lui din ce era LIBER la scanare (75 = 50 + 25); `haulCarryMax` e
 * ce leaga un drum. `cant` e cantitatea INGHETATA in job, nu cea vie a mormanului.
 */
export function cereriCara(rules: Rules, itemId: number, destId: number, cant: number, step: number): readonly Cerere[] {
  const cereri: Cerere[] = [{ targetId: destId, layer: Strat.LUCRU, count: cant, maxCount: rules.itemStackMax, maxClaimants: 1 }]
  if (step <= PasCara.RIDICA) cereri.push(cerereCarat(rules, itemId, cant))
  return cereri
}

/**
 * Construitul: desemnarea (santierul) se tine TOT jobul, sursa doar pana la
 * ridicare inclusiv — exact ca la carat, cu aceeasi orientare a tuplului.
 *
 * Orientarea NU se inverseaza, desi ar parea ca scapa de reparatia din
 * `anuleazaDesemnare`: `mutaItem` intrerupe pe `jobTarget === id` cu id-ul
 * ITEMULUI, deci cu desemnarea in `jobTarget` constructorul n-ar mai fi intrerupt
 * cand mormanul-sursa se muta. Ar muta defectul dintr-un loc in altul.
 */
export function cereriConstruieste(rules: Rules, itemId: number, desemnareId: number, cant: number, step: number): readonly Cerere[] {
  const cereri: Cerere[] = [{ targetId: desemnareId, layer: Strat.LUCRU, count: 1, maxCount: 1, maxClaimants: 1 }]
  if (step <= PasConstruieste.RIDICA) cereri.push(cerereCarat(rules, itemId, cant))
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
  const drv = driverul(w, slot)
  return drv === undefined ? [] : drv.cereri(w, rules, slot)
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
 * Nu PE un santier viu de construit, oglinda lui `seSapaLa`: locul de lucru al
 * peretelui k dintr-un rand era, in ordinea fixa a directiilor, chiar celula
 * peretelui k + 1 — iar constructorul lui k + 1 era refuzat cu CELULA_OCUPATA de
 * colegul care zidea alaturi (recenzia din 25.09: 1–3 refuzuri per rand de patru,
 * timp de ridicare dublat–triplat, fara nicio marfa pierduta).
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
        if (seSapaLa(d, nx, ny, zs - 1)) continue
        const sant = desemnareLaCelula(d, nx, ny, zs)
        if (sant !== -1 && d.kind[sant] === Desemnare.CONSTRUIESTE) continue
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
 *
 * ## Populatia din care se deriva NU e cea care concureaza
 *
 * `racireDesemnare` ii da `w.desemnari.vii` — TOATE desemnarile vii, de orice fel.
 * De cand exista si CONSTRUIESTE, un pion care doar sapa isi primeste fereastra
 * dimensionata si de santiere. Si in cealalta directie: plafonul de evaluari
 * scumpe e IMPARTIT cu itemele (candidatii de carat), care nu intra deloc in `vii`.
 *
 * Masurat pe 19.09.2026: cu 60 de sapaturi si 2400 de santiere, fereastra iese
 * **330 in loc de 100**. Sub ~768 de desemnari vii nu se vede deloc, fiindca
 * `jobInfeasibleRetryTicks` domina. Debitul sapatului n-a scazut in masuratoare,
 * fiindca racirea atinge doar tintele refuzate SCUMP, si alea erau accesibile.
 *
 * Nu s-a schimbat, si asta e o alegere: abaterea e CONSERVATOARE. O fereastra mai
 * lunga decat trebuie intarzie reincercarea; una mai scurta rupe ACOPERIREA, adica
 * exact defectul pentru care formula a fost scrisa. Un contor per fel ar fi stare
 * DERIVED noua pentru un castig de reglaj, si merita masurat pe o colonie reala
 * inainte de a fi scris.
 */
export function racireTinta(vii: number, rules: Rules): number {
  // `+ 1`: fereastra trebuie sa fie STRICT mai lunga decat scanarile necesare,
  // altfel prima transa expira exact cand scanarea ar fi ajuns la coada.
  const scanari = Math.ceil(vii / rules.jobScanMaxCandidates) + 1
  return Math.max(rules.jobInfeasibleRetryTicks, rules.jobRescanTicks * scanari)
}

function racireDesemnare(w: World, rules: Rules): number {
  return racireTinta(w.desemnari.vii, rules)
}

function racireItem(w: World, rules: Rules): number {
  // Populatia care conteaza e cea SCANATA, nu toate mormanele din lume.
  // Justificarea ferestrei („sa acopere toate tintele inainte sa expire primele")
  // e corecta la desemnari, unde fiecare desemnare vie e candidat. La iteme nu:
  // `deMutat` exclude tot ce sta deja la locul lui. Cu 3000 de mormane depozitate
  // si unul singur de carat, fereastra iesea 390 de tickuri in loc de 100.
  return racireTinta(indexZone(w, rules).deMutat.length, rules)
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

/**
 * Ce material e disponibil pentru fiecare PIESA, din perspectiva unui pion anume.
 *
 * O singura baleiere peste mormanele felurilor CERUTE pe scanare, nu una per
 * santier. Varianta per-santier e `O(candidati x iteme)` fara plafon — masurata de
 * panou la ~1,3 ms pe scanare la plafonul de 256 de candidati, adica ~2,8 ms/tick
 * la 64 de pioni. Aceeasi forma pe care `ix.maxPrioLibera[fel]` o are deja pentru
 * marfa: un scalar per fel, calculat o data, folosit ca margine de toti candidatii
 * felului.
 *
 * ## Un predicat, doua intrebari
 *
 * „Exista" inseamna „LANTUL de ridicari acopera piesa": prima ridicare dintr-un
 * morman cu cel putin pragul, apoi `refaSursa` pe restul, cu acelasi predicat de
 * sursa (`liberPentru`) si aceeasi regula de lant (`lantAcopera`). Recenzia din
 * 25.09 a masurat ce iese cand sonda si retintirea raspund diferit la aceeasi
 * intrebare: cu 5 mormane sigilate in raza, un pion ridica si lasa acelasi morman
 * la nesfarsit (66–126 de cicluri in 3000–6000 de tickuri, `nextId` +2 fiecare);
 * doua mormane de 10 la ±50 de celule nu ridicau niciodata peretele; 15 + 5 nu
 * pornea, desi retintirea ar fi luat restul de 5. Toate trei erau AL DOILEA
 * predicat: componenta verificata doar la retintire, raza ancorata in alt punct,
 * pragul cerut cu alt argument.
 */
export interface MaterialPentruPiesa {
  /**
   * Lantul de ridicari acopera piesa pentru pionul asta: material LIBER, in raza
   * lui, in componenta lui, cu loc de claimant — vezi `lantAcopera`. Fals si cand
   * materialul exista dar e al altora, racit, evitat de mine, sau de neatins.
   */
  readonly exista: boolean
  /**
   * CHEIA primului morman: distanta Manhattan pion -> morman, plus penalizarea unei
   * ridicari in plus daca mormanul nu acopera singur piesa (`penalizareRidicare`).
   * Comparabila prin constructie cu distantele celorlalte categorii din `maiBun`:
   * o ridicare in plus costa exact cat mersul in acelasi numar de tickuri (joc#9).
   */
  readonly cheie: number
  /** Slotul mormanului care a dat cheia minima. -1 daca niciunul. */
  readonly slot: number
}

/**
 * Rezumatul, indexat cu `PiesaId`. Intrarea 0 (`Piesa.NICIUNA`) e santinela si
 * ramane mereu goala.
 *
 * Reutilizat intre scanari ca sa nu aloce: e TRANSIENT, se rescrie complet la
 * fiecare apel. Resetarea e STRUCTURALA — se scriu toate intrarile, nu doar cele
 * ale pieselor vii — fiindca o piesa care dispare dintre desemnari intre doua
 * scanari ar lasa in urma raspunsul vechi, si ala ar fi citit ca proaspat.
 */
const rezumatMat: MaterialPentruPiesa[] = []

/**
 * Indexat cu `PiesaId`: acopera LUMEA piesa — acelasi lant (`lantAcopera`), pe
 * sume BRUTE: fara raza, fara componenta, fara rezervari.
 *
 * Deliberat SEPARAT de `rezumatMat`, fiindca raspunde la alta intrebare. Tot ce
 * e in rezumat e al PIONULUI care a intrebat: `exista` e fals si cand singurul
 * morman e rezervat de altcineva, sau e in racirea lui, sau e evitat de mine.
 * Asta e proprietate a lumii, aceeasi pentru toti.
 *
 * Distinctia nu e teoretica: `ultimulMotiv` pe o desemnare are contract scris
 * — „se scrie DOAR pentru ce e o proprietate a desemnarii insesi, niciodata
 * pentru ce tine de un anume pion". Cu `exista` drept sursa, panoul ar picta
 * portocaliu exact santierele in plina constructie: mormanul lor E rezervat.
 *
 * Se reseteaza STRUCTURAL odata cu rezumatul, din acelasi motiv ca el.
 */
const matOriunde: boolean[] = []
/** Indexat cu `PiesaId`: material DESTUL in lume ca suma, dar niciun lant de ridicari nu-l aduna. */
const matImprastiat: boolean[] = []
/**
 * Tablourile de lucru ale sondei, indexate cu `PiesaId`: TRANSIENT, resetate
 * STRUCTURAL in `rezumatMaterial`, ca `matOriunde`. Perechea (lume, pion) a celor
 * doua intrari ale lui `lantAcopera` — suma peste mormanele de la prag in sus si
 * cel mai mare morman de sub prag — plus suma bruta a lumii pentru „e destul, dar
 * imprastiat".
 */
const sumaBruta: number[] = []
const sumaPragLume: number[] = []
const maxSubPragLume: number[] = []
const sumaPragPion: number[] = []
const maxSubPragPion: number[] = []
/** Per `PiesaId`, o data pe scanare, nu o data pe (morman, piesa): pragul, cantitatea, felul. */
const pragPiesa: number[] = []
const cantPiesa: number[] = []
const felPiesa: number[] = []

type SpecPiesa = Rules['piese'][number]

/**
 * Pragul de ridicare al unei piese: sub cat nu merita un drum pentru o parte din
 * ea. Taiat la cantitatea piesei — SCARA cere 5, deci pragul ei e 5, nu 10.
 */
export function pragRidicare(rules: Rules, spec: SpecPiesa): number {
  return Math.min(rules.constructPickupMinUnits, spec.cantitate)
}

/**
 * Cat trebuie sa aiba LIBER un morman ca sa fie sursa, cand mai lipsesc `lipsa`
 * unitati: cel putin cat mai lipseste, sau cel putin pragul. ACELASI prag, cu
 * argumente diferite: sonda il cere pentru prima ridicare (`lipsa` = toata piesa),
 * retintirea pentru restul. Ca sonda sa nu propuna un lant pe care retintirea
 * nu-l poate incheia, regula lantului e scrisa O DATA, in `lantAcopera`.
 */
export function pragSursa(rules: Rules, spec: SpecPiesa, lipsa: number): number {
  return Math.min(lipsa, pragRidicare(rules, spec))
}

/**
 * O ridicare in plus valoreaza cat mersul in acelasi numar de tickuri: DERIVATA
 * din content, nu constanta noua. Sonda prefera un morman intreg la d + atat
 * celule unuia partial la d.
 */
function penalizareRidicare(rules: Rules): number {
  return Math.ceil(rules.haulPickupUnits / rules.workUnitsPerTick)
}

/**
 * Acopera un LANT de ridicari o piesa de `cantitate`, cu pragul `prag`, cand
 * mormanele de la prag in sus insumeaza `sumaPrag` si cel mai mare de sub prag
 * are `maxSubPrag`?
 *
 * Lantul: fiecare ridicare cere un morman cu `liber >= pragSursa(lipsa)`, adica
 * `>= prag` cat timp mai lipseste cel putin pragul, si `>= lipsa` dupa. Cat timp
 * lipseste cel putin pragul, doar mormanele de la prag in sus intra, si fiecare
 * scade lipsa cu tot ce are (sau o inchide). Deci: ori suma lor acopera piesa,
 * ori o duc pana la un rest sub prag pe care il inchide UN morman cu cel putin
 * atat — de la prag in sus n-a mai ramas niciunul, deci unul de sub prag.
 *
 * Raspunsul NU depinde de ordinea in care se iau mormanele, nici de care e primul
 * (`sumaPrag` il contine): asa sonda, care alege primul morman dupa distanta, si
 * `refaSursa`, care alege urmatoarele dupa drum, cad de acord prin constructie.
 * 10 + 5 + 5 NU acopera 20 (dupa 10 lipsesc 10 = pragul, si niciun morman n-are
 * 10); 15 + 5 acopera (dupa 15 lipsesc 5 < prag, si 5 >= 5); 19 + 1 la fel.
 */
export function lantAcopera(sumaPrag: number, maxSubPrag: number, cantitate: number, prag: number): boolean {
  if (sumaPrag >= cantitate) return true
  const rest = cantitate - sumaPrag
  return rest < prag && maxSubPrag >= rest
}

/** `liberPentru`: mormanul nu e sursa pentru pionul asta (mort, racit, evitat pe pereche). */
const NU_E_SURSA = -1
/** `liberPentru`: mormanul e in alta componenta decat pionul, sau pe o celula neetichetata. */
const ALTA_COMPONENTA = -2
/** `liberPentru`: locurile de claimant ale mormanului sunt pline cu altii. */
const LOCURI_PLINE = -3

/**
 * Cat poate lua pionul `slot` din mormanul `s`: ce e LIBER pe el (cantitatea minus
 * ce tin toti claimantii pe CARAT), sau un cod negativ daca mormanul nu-i e sursa.
 * UN predicat, pentru sonda si pentru `refaSursa` — felul (apelantul parcurge
 * `ix.peFel`), raza (ancora difera, vezi `refaSursa`) si pragul (`pragSursa`, cu
 * `lipsa` a apelantului) raman ale apelantului.
 *
 * Portile, in ordinea costului: viu; neracit; neevitat pe pereche; in componenta
 * `comp` a pionului — o celula neetichetata nu se judeca, nici pe regiuni murdare,
 * nici pe curate (un morman exista numai unde a umblat cineva, si nu se intinde
 * coridor spre el); loc de claimant (`itemClaimantsMax`; un claimant care tine
 * deja nu ocupa inca un loc). Un `Map.get` pentru ultimele doua, prin `rezervatPe`.
 *
 * Nu scrie NIMIC: un morman din alta componenta nu se raceste nici global, nici pe
 * pereche — pur si simplu nu intra in suma pionului asta.
 */
function liberPentru(w: World, rules: Rules, slot: number, s: number, comp: number): number {
  const it = w.iteme
  if (it.alive[s] === 0) return NU_E_SURSA
  if (it.reincercaLaTick[s]! > w.tick || esteEvitata(w, slot, it.id[s]!)) return NU_E_SURSA
  const r = regionAt(w.regions, it.wx[s]!, it.wy[s]!, it.z[s]!)
  if (r === NO_REGION || find(w.regions, r) !== comp) return ALTA_COMPONENTA
  const tinut = rezervatPe(w.rezervari, it.id[s]!, Strat.CARAT, w.agents.id[slot]!)
  if (!tinut.euDeja && tinut.altii >= rules.itemClaimantsMax) return LOCURI_PLINE
  return it.cantitate[s]! - tinut.suma
}

export function rezumatMaterial(w: World, rules: Rules, slot: number): readonly MaterialPentruPiesa[] {
  const a = w.agents
  const it = w.iteme
  const ax = cellOf(a.x[slot]!)
  const ay = cellOf(a.y[slot]!)
  const az = a.z[slot]!
  const comp = find(w.regions, regionAt(w.regions, ax, ay, az))
  const penalizare = penalizareRidicare(rules)

  for (let p = 0; p < rules.piese.length; p++) {
    rezumatMat[p] = { exista: false, cheie: 0, slot: -1 }
    matOriunde[p] = false
    matImprastiat[p] = false
    sumaBruta[p] = 0
    sumaPragLume[p] = 0
    maxSubPragLume[p] = 0
    sumaPragPion[p] = 0
    maxSubPragPion[p] = 0
    if (p === 0) { pragPiesa[p] = 0; cantPiesa[p] = 0; felPiesa[p] = -1; continue }
    const spec = rules.piese[p]!
    // Prin `pragSursa`, cu `lipsa` = toata piesa: acelasi drum ca retintirea si pornirea.
    pragPiesa[p] = pragSursa(rules, spec, spec.cantitate)
    cantPiesa[p] = spec.cantitate
    felPiesa[p] = rules.digYield[spec.material]!.fel
  }

  // Doar felurile pe care le cere vreo piesa, si doar mormanele lor: indexul
  // `peFel` e DERIVED sub steag murdar, in ordinea slotului — aceeasi ordine pe
  // care o parcurgea bucla peste toate itemele, deci acelasi raspuns, mai ieftin.
  const ix = indexZone(w, rules)
  for (let fel = 0; fel < ITEME; fel++) {
    let cerut = false
    for (let p = 1; p < rules.piese.length; p++) if (felPiesa[p] === fel) { cerut = true; break }
    if (!cerut) continue
    for (const s of ix.peFel[fel]!) {
      if (it.alive[s] === 0) continue
      raport.pasiRezumat++
      const cant = it.cantitate[s]!
      // Pana aici e predicatul LUMII: sume brute pe fel, INAINTE de orice poarta
      // per-pion. Nimic despre cine intreaba.
      for (let p = 1; p < rules.piese.length; p++) {
        if (felPiesa[p] !== fel) continue
        sumaBruta[p]! += cant
        if (cant >= pragPiesa[p]!) sumaPragLume[p]! += cant
        else if (cant > maxSubPragLume[p]!) maxSubPragLume[p] = cant
      }
      // Partea PIONULUI: in raza lui — ancora primului drum e pionul — si sursa
      // pentru el. Verificarea scumpa (componenta: un `Map.get` pe bloc; rezervari:
      // un `Map.get` pe id) se plateste doar cand raspunsul poate DEPINDE de
      // mormanul asta: cat timp lantul piesei nu e inca acoperit din mormanele
      // verificate, sau cand cheia lui ar bate-o pe cea mai buna de pana acum.
      // `liber ≤ cant`, deci un morman sub prag care nu bate maximul de sub prag,
      // sau unul mai departe decat cheia minima cand lantul e deja acoperit, nu
      // poate schimba nimic. Raspunsul e IDENTIC cu cel al verificarii complete —
      // sumele sunt margini inferioare care au trecut deja de cantitate, iar cine
      // e sarit pe cheie ar pierde si in fata minimului final. Masurat: 3000 de
      // mormane de piatra in raza (bench-ul recenziei): 98 µs/apel inainte de filtrul de
      // componenta, 172 cu verificarea completa, 72 asa.
      const dist = Math.abs(it.wx[s]! - ax) + Math.abs(it.wy[s]! - ay) + Math.abs(it.z[s]! - az)
      if (dist > rules.jobScanRadiusCells) continue
      let conteaza = false
      for (let p = 1; p < rules.piese.length && !conteaza; p++) {
        if (felPiesa[p] !== fel) continue
        const neacoperit = sumaPragPion[p]! < cantPiesa[p]!
        if (cant >= pragPiesa[p]!) conteaza = neacoperit || rezumatMat[p]!.slot === -1 || dist <= rezumatMat[p]!.cheie
        else conteaza = neacoperit && cant > maxSubPragPion[p]!
      }
      if (!conteaza) continue
      const liber = liberPentru(w, rules, slot, s, comp)
      if (liber < 1) continue
      for (let p = 1; p < rules.piese.length; p++) {
        if (felPiesa[p] !== fel) continue
        if (liber < pragPiesa[p]!) {
          if (liber > maxSubPragPion[p]!) maxSubPragPion[p] = liber
          continue
        }
        sumaPragPion[p]! += liber
        // Un morman partial costa o ridicare in plus: cheia il muta mai departe cu
        // exact atatea celule cat dureaza ridicarea. Departajarea la cheie egala e pe
        // `it.id`, EXPLICIT — o ordine totala pe date persistate, nu pe sloturi.
        const cheie = dist + (liber < cantPiesa[p]! ? penalizare : 0)
        const vechi = rezumatMat[p]!
        if (vechi.slot !== -1) {
          if (cheie > vechi.cheie) continue
          if (cheie === vechi.cheie && it.id[s]! > it.id[vechi.slot]!) continue
        }
        rezumatMat[p] = { exista: false, cheie, slot: s }
      }
    }
  }
  for (let p = 1; p < rules.piese.length; p++) {
    const cant = cantPiesa[p]!
    const prag = pragPiesa[p]!
    matOriunde[p] = lantAcopera(sumaPragLume[p]!, maxSubPragLume[p]!, cant, prag)
    matImprastiat[p] = !matOriunde[p]! && sumaBruta[p]! >= cant
    const m = rezumatMat[p]!
    // `exista` cere LANTUL pe materialul pionului (liber, in raza, in componenta,
    // rezervabil), nu suma lumii: altfel „pompa" — joburi pornite pe material din
    // alta componenta sau din mana altuia, care ridica prima parte, nu gasesc a
    // doua, si o lasa jos (panoul si recenzia, 25.09).
    rezumatMat[p] = { exista: m.slot !== -1 && lantAcopera(sumaPragPion[p]!, maxSubPragPion[p]!, cant, prag), cheie: m.cheie, slot: m.slot }
  }
  return rezumatMat
}

/** Cine e sursa unui candidat de scanare. */
const CAND_SAPA = 0
const CAND_CARA = 1
const CAND_CONSTRUIESTE = 2
/**
 * Felurile de candidat, ca UNIUNE — nu `number`.
 *
 * Tipul e ce face exhaustivitatea din `pornesteCandidatul` sa lege cu adevarat:
 * cu `fel: number`, `const x: never = fel as never` compileaza mereu si nu apara
 * nimic. Adaugarea unui membru aici FARA ramura lui in dispecerizare e eroare de
 * compilare, adica exact ce n-a existat cand s-au scris cele doua ternare.
 */
type CandFel = typeof CAND_SAPA | typeof CAND_CARA | typeof CAND_CONSTRUIESTE

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
  for (const zs of ix.depoziteOrdonate) {
    const prio = s.prioritate[zs]!
    if (prio <= prioLoc) break
    // Poarta ieftina intreaba „incape CAT car?", nu „e vreun loc?": altfel un
    // depozit cu toate celulele la 74/75 trimitea fiecare candidat la o parcurgere
    // completa a listei lui de celule libere, la fiecare scanare, pe veci.
    if (ix.maxLocLiber[zs * ITEME + kind]! < cant) continue
    zoneCuLoc++
    if (esteEvitata(w, slot, s.id[zs]!)) { evitate++; continue }
    let best = -1
    let bestDist = 0
    let bestKey = 0
    // Plafonul numara INTRARI parcurse, nu potriviri. Prima versiune il
    // incrementa dupa filtrele de raza si de loc, deci nu lega niciodata: cu un
    // depozit de celule nepline-dar-prea-pline bucla mergea pana la capatul
    // listei, si `evaluariDestinatie` raporta ~0 exact in cazul care costa cel
    // mai mult. Un plafon care nu se incrementeaza nu e un plafon.
    let vizitate = 0
    for (const cs of ix.libere[zs]!) {
      if (vizitate >= rules.haulDestMaxCells) break
      vizitate++
      raport.evaluariDestinatie++
      const cx = c.wx[cs]!
      const cy = c.wy[cs]!
      const cz = c.z[cs]!
      const dist = Math.abs(cx - fx) + Math.abs(cy - fy) + Math.abs(cz - fz)
      if (dist > rules.haulDestRadiusCells) continue
      if (locPeCelula(w, rules, kind, cx, cy, cz) < cant) continue
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
  // Daca MACAR o zona a fost sarita fiindca pionul ASTA o evita, refuzul e al
  // PERECHII, nu al tintei: altcineva poate duce marfa acolo chiar acum. Prima
  // versiune cerea ca TOATE zonele cu loc sa fie evitate, deci cu doua depozite
  // (unul evitat, unul prea departe) scria pe ITEM o racire PERSISTED pentru o
  // cauza care tinea de un singur pion — si o ascundea de toata colonia.
  if (evitate > 0) return refuse(Reason.FARA_DEPOZIT, { detaliu: 'evitate', zone: zoneCuLoc, evitate })
  if (inAltaComponenta) return refuse(Reason.INACCESIBIL, { detaliu: 'componenta' })
  return refuse(Reason.FARA_DEPOZIT, { detaliu: 'pline', zone: zoneCuLoc })
}

// ---------------------------------------------------------------------------
// scanarea
// ---------------------------------------------------------------------------

/**
 * Ordinea candidatilor: marginea superioara a scorului, descrescator, apoi id.
 *
 * PURA si EXPORTATA ca sa poata avea test. Prima varianta statea ca o inchidere
 * inline in `cautaJob` si continea si o departajare pe al doilea picior, cu garda
 * `candFel[i] === candFel[j]`. Arata ca exprima intentia — „se compara doar in
 * interiorul categoriei" — dar o departajare CONDITIONATA nu e tranzitiva: cu trei
 * candidati legati pe scor, doi de acelasi fel si unul de alt fel cu id-ul intre
 * ei, iese X < S (dupa id), S < Y (dupa id) si Y < X (dupa al doilea picior).
 *
 * `Array.prototype.sort` pe un comparator inconsecvent da un rezultat definit de
 * implementare, iar `maiBun` nu e strict la scor egal, deci castiga primul
 * examinat: santierul DEPARTAT de morman — adica exact regresia pe care
 * departajarea fusese scrisa s-o inchida. Masurat pe situl plat: 12 pozitii de
 * sapatura din 166 rastoarna alegerea, doar prin id-ul lor.
 *
 * Semnatura nu primeste `fel`, si asta e deliberat: forma gresita nu se mai poate
 * nici macar scrie aici. Departajarea sta in bucla scumpa, la locul deciziei, unde
 * se compara doi candidati anume si unde „acelasi fel" e o conditie pe o pereche,
 * nu o relatie de ordine.
 *
 * Ordine TOTALA pe date persistate (prioritate, distanta, id), deci aceeasi in
 * orice lume cu aceeasi stare. `tests/constructie.test.ts` o probeaza exhaustiv.
 */
export function comparaCandidati(
  gA: number, distA: number, idA: number,
  gB: number, distB: number, idB: number,
): number {
  const la = gA * (1 + distB)
  const lb = gB * (1 + distA)
  if (la !== lb) return la > lb ? -1 : 1
  return idA - idB
}

/** Buffere de candidati, refolosite intre scanari. Zero alocari in regim stabil. */
let candFel: CandFel[] = []
let candSlot: number[] = []
let candDist: number[] = []
/**
 * Al DOILEA picior al drumului, cand se stie ieftin. Departajare, nu metrica:
 * nu intra niciodata in scor.
 *
 * Exista fiindca la constructie `candDist` e `m.dMin` — distanta pana la MORMAN
 * — si mormanul e acelasi pentru toate santierele aceleiasi piese. Cu prioritati
 * egale, scorul iese identic pe toata categoria, `maiBun` nu e strict, si atunci
 * castiga primul examinat: ordinea sortarii, adica `candId`, adica ordinea in
 * care jucatorul a desenat santierele. Masurat pe cazul patologic: +72% tickuri.
 *
 * 0 la SAPA si la CARA, si se compara DOAR intre candidati de acelasi fel. La
 * sapat 0 e adevarat (nu exista al doilea picior); la carat e „nu se stie ieftin"
 * — destinatia se alege abia in trecerea scumpa. Comparat intre categorii, zeroul
 * ala ar fi o minciuna care inclina sistematic balanta impotriva constructiei.
 *
 * ## Unde se compara, si de ce NU in comparator
 *
 * Prima varianta punea departajarea in `ordine.sort`, cu garda
 * `candFel[i] === candFel[j]`. Arata ca exprima exact intentia de mai sus, dar o
 * departajare CONDITIONATA nu e tranzitiva: cu trei candidati legati pe scor, doi
 * de acelasi fel si unul de alt fel cu id-ul intre ei, iese X < S (dupa id),
 * S < Y (dupa id) si Y < X (dupa al doilea picior). Un comparator inconsecvent da
 * un rezultat definit de implementare — si `Array.prototype.sort` alegea exact
 * santierul departat de morman, adica regresia pe care departajarea fusese scrisa
 * s-o inchida. Masurat pe situl plat: 12 pozitii de sapatura din 166 o rastoarna.
 *
 * Acum se compara in bucla scumpa, la locul deciziei: acolo sunt doi candidati
 * anume, iar „acelasi fel" e o conditie pe o pereche, nu o relatie de ordine.
 *
 * Conditia `candFel[best] === CAND_CONSTRUIESTE` de acolo e REDUNDANTA azi: la
 * SAPA si la CARA `candDist2` e 0, iar nimic nu e mai mic decat 0. Ramane scrisa
 * fiindca devine purtatoare de sarcina in clipa in care un fel nou primeste al
 * doilea picior — si atunci absenta ei ar fi tacuta. Deci nu are proba de mutatie,
 * si asta e spus aici ca sa nu para o scapare.
 */
let candDist2: number[] = []
let candG: number[] = []
let candId: number[] = []
/** Prioritatea personala a CATEGORIEI din care vine candidatul. */
let candPers: number[] = []
/**
 * Marginea superioara a prioritatii candidatului — pentru desemnari chiar
 * prioritatea lor, pentru marfa cea mai buna prioritate libera a felului.
 *
 * Amandoua se scriu la NASTEREA candidatului, in trecerea ieftina, fiindca acolo
 * se stiu. Se calculau in trecerea scumpa, cu cate un
 * `fel === CAND_SAPA ? persS : persC` — adica „daca nu e sapat, e carat", care e
 * adevarat exact cat timp exista doua feluri. Al treilea fel ar fi cazut tacut pe
 * ramura caratului, cu prioritatea altcuiva.
 */
let candPrio: number[] = []

/**
 * Categoriile pe care le scaneaza un pion, dupa prioritatile lui personale.
 * „Exclusiv" (nivelul maxim) e o proprietate a MULTIMII: daca vreo categorie e
 * la maxim, se scaneaza toate cele la maxim; altfel toate cele nenule. Panoul a
 * aratat ca „fiecare la 3 sare peste celelalte" facea un pion cu ambele la 3
 * inert, fara cauza.
 */
function categoriiActive(w: World, rules: Rules, slot: number): { sapa: boolean; cara: boolean; construieste: boolean } {
  const a = w.agents
  const pS = a.prioPersonala[slot * CATEGORII + Categorie.SAPA]!
  const pC = a.prioPersonala[slot * CATEGORII + Categorie.CARA]!
  // Maximul se ia peste TOATE categoriile, nu doar peste cele doua care au azi
  // job. Altfel un pion pus exclusiv pe CONSTRUIESTE ar continua sa sape: `pS`
  // n-ar fi maxim, dar nici `exclusiv` n-ar fi adevarat, deci poarta s-ar deschide.
  const pB = a.prioPersonala[slot * CATEGORII + Categorie.CONSTRUIESTE]!
  const exclusiv = Math.max(pS, pC, pB) === rules.personalPriorityLevels
  return {
    sapa: pS > 0 && (!exclusiv || pS === rules.personalPriorityLevels),
    cara: pC > 0 && (!exclusiv || pC === rules.personalPriorityLevels),
    construieste: pB > 0 && (!exclusiv || pB === rules.personalPriorityLevels),
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
  const persB = a.prioPersonala[slot * CATEGORII + Categorie.CONSTRUIESTE]!

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
      // Poarta pe FEL, si sta in trecerea IEFTINA, nu in cea scumpa.
      //
      // Pana la ea, bucla asta nu citea niciodata `d.kind`: cu un singur fel,
      // `else` era corect. La al doilea devine o presupunere — aceeasi familie
      // cu cele cinci `else` care presupuneau SAPA, reparate cu tabelul de
      // drivere in S16-19. Panoul de design a reprodus-o in scenariul standard:
      // o desemnare de alt fel era luata cu `jobKind = SAPA`, iar la tickul
      // 3047 desemnarea era stearsa si celula goala. Jucatorul cere un perete,
      // primeste o groapa, cu zero refuzuri.
      //
      // In trecerea ieftina fiindca altfel candidatii de alt fel ar consuma din
      // `jobScanMaxCandidates` si ar infometa sapatul.
      if (d.kind[s] !== Desemnare.SAPA) continue
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
      candDist2[n] = 0
      candG[n] = 2 ** d.prioritate[s]! * gPers
      candId[n] = d.id[s]!
      candPers[n] = persS
      candPrio[n] = d.prioritate[s]!
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
      // Cat e LIBER, nu cat e in morman: cu mai multi claimanti pe strat, al doilea
      // caraus cere restul (75 = 50 + 25). Un `liber` de zero da o cerere de zero, pe
      // care storeul o refuza la usa — si refuzul se numara ca REZERVAT, ca orice alt.
      const cant = Math.min(liberPeItem(w, s), rules.haulCarryMax)
      if (!poateRezerva(w.rezervari, eu, cerereCarat(rules, it.id[s]!, cant)).ok) {
        raport.rezervat++
        noteaza(Reason.REZERVAT)
        continue
      }
      candFel[n] = CAND_CARA
      candSlot[n] = s
      candDist[n] = dist0
      candDist2[n] = 0
      candG[n] = 2 ** ix.maxPrioLibera[it.kind[s]!]! * gPers
      candId[n] = it.id[s]!
      candPers[n] = persC
      candPrio[n] = ix.maxPrioLibera[it.kind[s]!]!
      n++
    }
  }

  // Fara niciun santier viu nu se plateste nicio baleiere de mormane: iesire O(1).
  if (activ.construieste && d.viiConstruieste > 0) {
    const gPers = 4 ** (persB - 1)
    const rez = rezumatMaterial(w, rules, slot)
    // „N-are din ce" se afla O DATA pe fel, nu o data pe santier: un blocaj de
    // material opreste toata categoria, si pe 400 de santiere asta e diferenta
    // dintre o cautare si un scalar. Acoperitor si pentru gaura de continut a
    // SCARII, care cere LEMN intr-o lume unde worldgen nu scrie niciodata lemn.
    let lipsaMaterial = false
    for (let s = 0; s < d.count; s++) {
      if (d.alive[s] === 0) continue
      if (d.kind[s] !== Desemnare.CONSTRUIESTE) continue
      raport.vizite++
      if (d.reincercaLaTick[s]! > w.tick || esteEvitata(w, slot, d.id[s]!)) { inRacire++; continue }
      const dist0 = Math.abs(d.wx[s]! - ax) + Math.abs(d.wy[s]! - ay) + Math.abs(d.z[s]! - az)
      if (dist0 > rules.jobScanRadiusCells) {
        raport.preaDeparte++
        noteaza(Reason.PREA_DEPARTE)
        continue
      }
      const m = rez[d.piesa[s]!]!
      // Cauza pe DESEMNARE, ca sa nu mai fie chihlimbar un santier care n-are din
      // ce sa fie zidit. Din `matOriunde`, nu din `m.exista` — vezi acolo de ce.
      //
      // FARA racire, din exact motivul scris mai jos la poarta de sprijin: materialul
      // poate aparea la orice tick, iar `reincercaLaTick` e hasuit si persistat.
      if (!matOriunde[d.piesa[s]!]!) {
        d.ultimulMotiv[s] = codMotiv(Reason.LIPSA_MATERIAL)
        // „Nu e destul" si „e destul, dar praf" sunt doua raspunsuri actionabile
        // diferite: sapa mai mult, sau picteaza un depozit ca sa se contopeasca.
        d.ultimulMotivDetaliu[s] = matImprastiat[d.piesa[s]!]! ? DetaliuMotiv.MATERIAL_IMPRASTIAT : DetaliuMotiv.NICIUNUL
      } else if (d.ultimulMotiv[s]! === codMotiv(Reason.LIPSA_MATERIAL)) {
        // Se sterge DOAR cauza asta. Un INACCESIBIL scris de trecerea scumpa are
        // racirea lui si nu se afla aici: un santier racit nici nu ajunge pana aici.
        d.ultimulMotiv[s] = 0
        d.ultimulMotivDetaliu[s] = DetaliuMotiv.NICIUNUL
      }
      if (!m.exista) { lipsaMaterial = true; continue }

      // Poarta de sprijin, pe terenul REAL si aici, in trecerea ieftina.
      //
      // NU e apartenenta la inchiderea `constructiaPosibila`: aia raspunde „se poate
      // zidi DACA se zideste tot planul", iar pionul vrea „se poate zidi ACUM".
      // Masurat de panou pe 5 planuri: 71,6-84,4% dintre celulele pe care inchiderea
      // le declara construibile au suport 0 in clipa aia, deci `zidesteVoxel` le-ar
      // refuza dupa ce pionul a carat materialul si a muncit 400 de tickuri. Si
      // invers: „zideste tot ce se poate acum, repeta" CONVERGE exact la inchidere,
      // 5 planuri din 5 — deci santierul vine oricum la rand, si inchiderea nu
      // cumpara scanerului nicio celula in plus.
      //
      // Conjunctia, nu `poateSustine` singur: pe o celula deja SOLIDA `poateSustine`
      // raspunde `ok` prin scurtcircuit, iar `zidesteVoxel` refuza cu CELULA_PLINA.
      // Cazul e real — prabusirea depune MOLOZ, si molozul poate ateriza peste un
      // blueprint desenat.
      if (solLa(w.terrain, d.wx[s]!, d.wy[s]!, d.z[s]!) === Sol.SOLID) continue
      if (!poateSustine(w.terrain, rules, d.wx[s]!, d.wy[s]!, d.z[s]!).ok) {
        // NICIO racire si NICIO cauza. Un santier nezidibil acum nu e un refuz, e o
        // pozitie in coada: `racireDesemnare` da intre 100 si 510 tickuri, iar un job
        // de construit dureaza 76 cap-coada — constructia ar avansa la viteza racirii,
        // nu a muncii. Si `reincercaLaTick` E hasuit, deci un parcaj gresit nu e o
        // pierdere de debit, e stare divergenta.
        continue
      }

      // Doar SANTIERUL. Mormanul l-a verificat deja rezumatul, cu acelasi predicat.
      if (!poateRezerva(w.rezervari, eu, { targetId: d.id[s]!, layer: Strat.LUCRU, count: 1, maxCount: 1, maxClaimants: 1 }).ok) {
        raport.rezervat++
        noteaza(Reason.REZERVAT)
        continue
      }

      candFel[n] = CAND_CONSTRUIESTE
      candSlot[n] = s
      // PRIMUL picior, ca la sapat si la carat: pionul merge intai la morman.
      // `pornesteConstruieste` chiar scrie pozitia mormanului in `jobWork`. Cheia e
      // distanta plus penalizarea unei ridicari in plus (`penalizareRidicare`), in
      // celule — comparabila cu distantele celorlalte doua categorii fiindca o
      // ridicare costa exact cat mersul in acelasi numar de tickuri (joc#9). Distanta
      // pana la santier ar fi o margine pe drumul TOTAL, valida si ea, dar sub alta
      // metrica: constructia ar raporta sistematic distante mai mari pentru aceeasi
      // cantitate de mers, si ar pierde in `maiBun` fata de SAPA si CARA.
      candDist[n] = m.cheie
      // Al doilea picior: morman -> santier. Se stie ieftin fiindca rezumatul tine
      // UN morman per piesa, deci e acelasi pentru toate santierele ei.
      candDist2[n] = Math.abs(it.wx[m.slot]! - d.wx[s]!) + Math.abs(it.wy[m.slot]! - d.wy[s]!) + Math.abs(it.z[m.slot]! - d.z[s]!)
      candG[n] = 2 ** d.prioritate[s]! * gPers
      candId[n] = d.id[s]!
      candPers[n] = persB
      candPrio[n] = d.prioritate[s]!
      n++
    }
    if (lipsaMaterial) { raport.faraDepozit++; noteaza(Reason.LIPSA_MATERIAL) }
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
  ordine.sort((i, j) => comparaCandidati(candG[i]!, candDist[i]!, candId[i]!, candG[j]!, candDist[j]!, candId[j]!))

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
    const fel: CandFel = candFel[i]!
    const persCand = candPers[i]!
    const prioBound = candPrio[i]!

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

    if (fel === CAND_CONSTRUIESTE) {
      scumpe++
      raport.candidatiExaminati++
      const prio = d.prioritate[s]!
      const m = rezumatMat[d.piesa[s]!]!
      // Rezumatul s-a calculat inaintea sortarii, pe aceeasi scanare, si nimic nu
      // l-a invalidat de atunci: trecerea scumpa nu porneste joburi, o face abia
      // apelantul dupa bucla.
      if (m.slot === -1) continue

      // Mormanul l-a verificat sonda cu tot cu COMPONENTA (`liberPentru`): unul din
      // alta componenta n-a intrat in suma pionului si nu poate fi `m.slot`. Nu se
      // scrie nicio racire pentru asta — nici pe morman (prima versiune a trecerii
      // scumpe o facea, si un pion sigilat oprea constructia INTREGII colonii: 0 din
      // 20 de unitati in 1500 de tickuri, campul fiind global si hasuit), nici pe
      // pereche (a doua versiune; inelul de `jobAvoidSlots` nu e o margine, si la 5
      // mormane sigilate mereu unul „uitat" reintra in suma). Mormanul pur si simplu
      // nu e al pionului asta.

      // (b) santierul: un loc de lucru langa el, in componenta pionului. Identic cu
      // sapatul, coridor inclusiv — si la fel ca acolo, aici se intinde, fiindca
      // jucatorul poate cere un perete pe teren pe care n-a umblat nimeni.
      let work = celulaDeLucru(w.terrain, w.regions, d, d.wx[s]!, d.wy[s]!, d.z[s]!, rules, compAgent)
      if (!work) {
        const oricare = celulaDeLucru(w.terrain, w.regions, d, d.wx[s]!, d.wy[s]!, d.z[s]!, rules)
        if (!oricare) {
          raport.inaccesibil++
          d.ultimulMotiv[s] = codMotiv(Reason.INACCESIBIL)
          d.ultimulMotivDetaliu[s] = DetaliuMotiv.FARA_LOC_DE_LUCRU
          d.reincercaLaTick[s] = w.tick + racireDesemnare(w, rules)
          noteaza(Reason.INACCESIBIL)
          continue
        }
        if (acoperaCoridor(w, rules, ax, ay, az, d.wx[s]!, d.wy[s]!, d.z[s]!)) {
          compAgent = find(w.regions, regionAt(w.regions, ax, ay, az))
          work = celulaDeLucru(w.terrain, w.regions, d, d.wx[s]!, d.wy[s]!, d.z[s]!, rules, compAgent)
        }
        if (!work) {
          raport.inaccesibil++
          d.ultimulMotiv[s] = codMotiv(Reason.INACCESIBIL)
          d.ultimulMotivDetaliu[s] = DetaliuMotiv.COMPONENTE_DIFERITE
          d.reincercaLaTick[s] = w.tick + racireDesemnare(w, rules)
          noteaza(Reason.INACCESIBIL)
          continue
        }
      }

      const dist = candDist[i]!
      // La scor EGAL, castiga santierul mai aproape de morman. `maiBun` nu e strict,
      // deci fara asta ar castiga primul examinat — ordinea sortarii, adica ordinea
      // in care jucatorul a desenat santierele. Comparatia are voie sa se uite la
      // `candDist2` numai fiindca ambii candidati sunt de acelasi fel: la constructie
      // al doilea picior e morman -> santier si se stie ieftin, la carat destinatia
      // se afla abia aici, iar la sapat nu exista al doilea picior.
      const egal = best !== -1
        && !maiBun(prio, persB, dist, bestPrio, bestPers, bestDist)
        && !maiBun(bestPrio, bestPers, bestDist, prio, persB, dist)
      const maiAproapeDeMorman = egal
        && candFel[best]! === CAND_CONSTRUIESTE
        && candDist2[i]! < candDist2[best]!
      if (best === -1 || maiBun(prio, persB, dist, bestPrio, bestPers, bestDist) || maiAproapeDeMorman) {
        best = i
        bestPrio = prio
        bestPers = persB
        bestDist = dist
        // Locul de lucru NU se retine: `pornesteConstruieste` trimite pionul intai la
        // MORMAN, iar celula de langa santier se re-alege in `ridica`, in componenta
        // de ATUNCI. Ce s-a verificat aici e ca EXISTA una, adica poarta de candidat.
        bestWork = null
        bestCs = m.slot
        bestCant = 0
      }
      continue
    }

    // De aici incolo e CARA, si ramane singurul fel fara `if` propriu fiindca e
    // ULTIMUL. Un fel nou NU se adauga sub comentariul asta — isi ia propriul
    // `if (fel === CAND_X) { ... continue }` deasupra, altfel mosteneste tacut
    // toata evaluarea marfii.
    //
    // (a) itemul e intr-o regiune, in componenta pionului?
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
    // (b) destinatia. Aceeasi cantitate ca in trecerea ieftina: intre ele nu s-a
    // schimbat nimic pe un singur fir.
    const cant = Math.min(liberPeItem(w, s), rules.haulCarryMax)
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

  const out = pornesteCandidatul(w, rules, slot, candFel[best]!, candSlot[best]!, bestWork, bestCs, bestCant)
  if (!out.ok) {
    // Verificat la scan, refuzat la start: intre ele nu s-a schimbat nimic pe
    // un singur fir, deci nu se intampla. Dar contractul cere re-verificarea,
    // si refuzul se numara, nu se inghite — in `rezervat`, ca totalul refuzurilor
    // sa ramana comparabil intre transe, SI in contorul lui, pe care testele il
    // cer zero. E un zavor, nu o proba: nicio mutatie nu-l poate aprinde pe un
    // singur fir, si asta e scris la el.
    raport.rezervat++
    raport.refuzatLaStart++
    rat.stare[slot] = StareRatiune.RESPINS
    rat.motivFinal[slot] = codMotiv(out.reason)
    return false
  }
  rat.stare[slot] = StareRatiune.JOB
  return true
}

/**
 * Porneste jobul candidatului castigator, pe FEL.
 *
 * Exhaustiva prin `never`: un fel nou care n-are ramura aici nu compileaza. Pana
 * la ea, dispecerizarea era un ternar `=== CAND_SAPA ? sapa : cara`, deci al
 * treilea fel ar fi pornit un job de CARAT cu slotul unei desemnari — adica
 * exact familia de defecte pe care tabelul de drivere a inchis-o la executie, dar
 * lasata deschisa la ALEGERE.
 */
function pornesteCandidatul(
  w: World,
  rules: Rules,
  slot: number,
  fel: CandFel,
  s: number,
  work: { wx: number; wy: number; z: number } | null,
  cs: number,
  cant: number,
): Outcome<void> {
  switch (fel) {
    case CAND_SAPA: return pornesteSapa(w, slot, s, work!)
    case CAND_CARA: return pornesteCara(w, rules, slot, s, cs, cant)
    // `cs` poarta aici slotul MORMANULUI, nu o celula de zona: cele doua feluri
    // folosesc acelasi camp pentru „a doua tinta", si fiecare stie ce e in el.
    case CAND_CONSTRUIESTE: return pornesteConstruieste(w, rules, slot, s, cs)
    default: {
      // Nu se poate atinge cat timp `CandFel` e uniunea de mai sus: daca cineva ii
      // adauga un membru fara ramura, linia asta NU compileaza. Refuzul de dedesubt
      // e pentru cazul in care tipul e ocolit cu un cast.
      const nestiut: never = fel
      void nestiut
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'candFel', valoare: fel })
    }
  }
}

/**
 * Check+claim atomic la START (research: chiar daca ai verificat la scan,
 * re-verifica si scrie totul sau nimic). Id-ul de job se consuma DOAR daca
 * rezervarea reuseste.
 */
/**
 * Porneste un job de CONSTRUIT: sursa in `jobTarget`, santierul in `jobDest`.
 *
 * Cantitatea se INGHEATA din tabelul de piese, nu din mormanul viu — acelasi
 * argument ca la carat: mormanul poate creste prin contopire intre rezervare si
 * ridicare, iar o lume incarcata ar re-rezerva alta cantitate si ar lua alt job.
 */
export function pornesteConstruieste(
  w: World,
  rules: Rules,
  slot: number,
  ds: number,
  is: number,
): Outcome<void> {
  const a = w.agents
  const d = w.desemnari
  const spec = rules.piese[d.piesa[ds]!]!

  // Mormanul trebuie sa fie de felul CERUT, si sa aiba destul. Amandoua sunt
  // treaba scanerului (6c), dar se refuza AICI: `ridica` ia `min(cerut, gasit)`,
  // deci un morman prea mic nu produce niciun refuz — produce un pion care merge,
  // ridica ce e, munceste 400 de tickuri si abia atunci descopera ca n-are din ce
  // zidi. Refuzul la pornire costa zero si are o CAUZA.
  const cerut = rules.digYield[spec.material]!.fel
  if (w.iteme.kind[is] !== cerut) {
    return refuse(Reason.LIPSA_MATERIAL, { cerut, gasit: w.iteme.kind[is]! })
  }
  // Ce e LIBER, nu ce e in morman: restul poate fi deja al altcuiva. Si nu
  // neaparat toata piesa: de la prag in sus, restul vine din a doua sursa.
  const liber = liberPeItem(w, is)
  const necesar = pragSursa(rules, spec, spec.cantitate)
  if (liber < necesar) {
    // E in morman, dar e al altora: REZERVAT, nu „lipsa" — jucatorul vede „il tine
    // cineva", nu „n-ai piatra". Doua raspunsuri actionabile, doua motive.
    if (w.iteme.cantitate[is]! >= necesar) return refuse(Reason.REZERVAT, { cerut: necesar, liber, inMorman: w.iteme.cantitate[is]! })
    return refuse(Reason.LIPSA_MATERIAL, { cerut: necesar, gasit: liber })
  }
  const count = Math.min(spec.cantitate, liber)
  const jobId = w.nextId
  const out = rezervaToate(
    w.rezervari,
    a.id[slot]!,
    jobId,
    cereriConstruieste(rules, w.iteme.id[is]!, d.id[ds]!, count, PasConstruieste.MERGE_SURSA),
  )
  if (!out.ok) return out
  w.nextId++

  a.jobKind[slot] = FelJob.CONSTRUIESTE
  a.jobId[slot] = jobId
  a.jobTarget[slot] = w.iteme.id[is]!
  a.jobDest[slot] = d.id[ds]!
  // Count-ul pe SURSA CURENTA, ca la carat — nu totalul piesei, care e in content
  // si pe care `zideste` il citeste de acolo. Un camp nou ar fi cerut schema 8.
  a.jobCantitate[slot] = count
  a.jobEfect[slot] = 0
  a.jobStep[slot] = PasConstruieste.MERGE_SURSA
  a.jobProgres[slot] = 0
  a.jobIncercari[slot] = 0
  a.jobWorkX[slot] = w.iteme.wx[is]!
  a.jobWorkY[slot] = w.iteme.wy[is]!
  a.jobWorkZ[slot] = w.iteme.z[is]!
  tintesteLocDeLucru(w, slot)
  raport.joburiPornite++
  return accept()
}

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

/** Detaliul de pe o DESEMNARE, derivat din motiv. Vezi `detaliuItemDin`. */
function detaliuDesemnareDin(motiv: ReasonCode): number {
  return motiv === Reason.INACCESIBIL ? DetaliuMotiv.FARA_LOC_DE_LUCRU : DetaliuMotiv.NICIUNUL
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
  const drv = driverul(w, slot)
  elibereaza(w.rezervari, a.id[slot]!, a.jobId[slot]!)
  if (drv?.atingeZone === true) marcheazaZoneMurdare(w)

  // Marfa nu dispare: orice sfarsit cu mana plina o lasa jos.
  const rezultat = lasaLaPicioare(w, rules, slot)

  if (cum === Sfarsit.INCOMPLET) {
    drv?.incheie(w, rules, slot, motiv, racire, rezultat)
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
  const drv = driverul(w, slot)

  // Pe regiuni stale nu se decide nimic: o celula proaspat calcabila e invizibila
  // pana la reconstructie, si jobul s-ar incheia cu un motiv fals.
  if (motiv === Reason.INACCESIBIL && w.regions.dirty.size > 0) return

  // ORICE refuz de drum numara o incercare, INACCESIBIL inclusiv.
  //
  // Prima versiune scutea INACCESIBIL, pe motiv ca „re-alegerea tintei e progres,
  // nu insistenta". Nu e: `findPath` intoarce INACCESIBIL si cand componenta e
  // corecta, dar A*-ul pe celule n-a incaput in banda de regiuni (path.ts, „graful
  // promitea un drum, celulele nu l-au confirmat"). Atunci re-alegerea da acelasi
  // raspuns la nesfarsit — la SAPA fiindca `celulaDeLucru` intoarce prima celula in
  // ordine fixa, adica exact cea de dinainte; la CARA fiindca destinatia alterneaza
  // intre doua celule, cea eliberata redevenind cea mai apropiata. Jobul nu se mai
  // incheia NICIODATA: desemnarea sau celula de depozit ramaneau rezervate pe veci,
  // marfa ramanea in mana, si niciun zavor nu se tragea, fiindca toate se trag la
  // SFARSITUL unui job. Un plafon care nu se incrementeaza nu e un plafon.
  a.jobIncercari[slot] = a.jobIncercari[slot]! + 1
  if (a.jobIncercari[slot]! >= rules.jobMaxIncercari) {
    // La plafon, cauza e a PERECHII: drumul ASTA n-a mers, dar tinta ramane
    // libera pentru altcineva, care poate veni din alta parte.
    terminaJob(w, rules, slot, Sfarsit.INCOMPLET, motiv, Racire.PERECHE)
    return
  }

  // Se incearca ALTA tinta, sarind peste cea curenta — „refacut" trebuie sa
  // insemne „alta", altfel contorul de mai sus doar amana bucla.
  //
  // Doar cand tinta CURENTA e problema: celula nu mai e buna (INACCESIBIL) sau
  // sta cineva ostil in drum. „Prea scump ACUM" nu se repara mutandu-te cu o
  // celula mai incolo — se asteapta, si se numara incercarea.
  if ((motiv === Reason.INACCESIBIL || motiv === Reason.OCUPAT_DE_OSTIL) && w.regions.dirty.size === 0) {
    if (drv !== undefined && drv.refaTinta(w, rules, slot)) return
    // Nicio alta tinta, si drumul spre asta nu exista: e o proprietate a TINTEI.
    if (motiv === Reason.INACCESIBIL) {
      terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.INACCESIBIL, Racire.TINTA)
      return
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
/**
 * Alt loc de lucru langa ACEEASI desemnare, cu progresul pastrat.
 *
 * ## De ce desemnarea si pasul vin din AFARA
 *
 * Functia asta a presupus SAPA in doua feluri deodata, si niciunul nu se vedea
 * de la locul apelului: citea desemnarea din `jobTarget` (adevarat DOAR la sapat,
 * unde tinta E desemnarea — la construit `jobTarget` e mormanul-sursa, iar
 * santierul sta in `jobDest`), si punea `jobStep = PasJob.MERGE`, adica 0, care
 * pentru un job de construit inseamna `MERGE_SURSA` — pionul trimis inapoi dupa
 * material pe care il are deja in mana.
 *
 * Masurat inainte de reparatie: un constructor mutat de pe locul de lucru la
 * tickul 37 avea `slotDesemnare(jobTarget) === -1`, deci refacerea intorcea
 * `false` din prima linie; jobul se abandona intr-un singur tick, iar santierul
 * primea 100 de tickuri de racire cu o cauza care MINTE (`INACCESIBIL` +
 * `FARA_LOC_DE_LUCRU`, cand adevarul era ca ajutorul cauta in alt camp).
 *
 * A sasea din familia „cele cinci `else` care presupuneau SAPA" — dar ascunsa
 * intr-un ajutor, nu intr-o ramura. De asta amandoua vin acum ca argumente:
 * presupunerea sta la fiecare apelant, unde se vede, si un fel nou de job nu o
 * poate mosteni din greseala.
 */
function refaLoculDeLucru(
  w: World,
  rules: Rules,
  slot: number,
  idDesemnare: number,
  pasMerge: number,
  evita = -1,
): boolean {
  const a = w.agents
  const d = w.desemnari
  const ds = slotDesemnare(d, idDesemnare)
  if (ds === -1) return false
  const comp = find(w.regions, regionAt(w.regions, cellOf(a.x[slot]!), cellOf(a.y[slot]!), a.z[slot]!))
  const work = celulaDeLucru(w.terrain, w.regions, d, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, rules, comp, evita)
  if (!work) return false
  a.jobWorkX[slot] = work.wx
  a.jobWorkY[slot] = work.wy
  a.jobWorkZ[slot] = work.z
  a.jobStep[slot] = pasMerge
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

/**
 * A DOUA sursa a unui constructor care are deja o parte din piesa in mana.
 *
 * Acelasi predicat de sursa ca sonda (`liberPentru`: viu, neracit, neevitat, in
 * componenta, cu loc de claimant) si acelasi prag (`pragSursa`, cu ce mai LIPSESTE),
 * deci acelasi lant (`lantAcopera`): ce a numarat sonda se gaseste aici prin
 * constructie, cat timp lumea nu s-a schimbat intre timp.
 *
 * ## Raza: ancorata pe SANTIER, 2R
 *
 * Sonda masoara raza de la PION — ancora primului drum. Retintirea nu poate masura
 * de la celula curenta: recenzia din 25.09 a masurat doua mormane de 10 la ±50 de
 * pion, ambele in raza sondei, dar la 100 unul de altul — dupa prima ridicare al
 * doilea iesea din raza si peretele nu se ridica NICIODATA (8 seminte din 8). Un
 * punct fix, acelasi pe toata durata jobului, e santierul: el e la cel mult R de
 * pionul care a scanat (poarta PREA_DEPARTE din `cautaJob`), deci orice morman
 * numarat de sonda e la cel mult 2R de el — inegalitatea triunghiului, in aceeasi
 * metrica Manhattan cu cota — si ramane asa si cand retintirea vine din
 * reconciliere, cu pionul in alt loc.
 *
 * Ordonat pe `d(curent, M) + d(M, santier)`, nu pe `d(curent, M)`: pionul cu 10 in
 * mana nu are voie sa fie tras de un morman din spatele lui. Panoul a simulat
 * regula „cel mai apropiat de celula curenta" pe 3000 de campuri: 19% peste
 * marginea de 2·dMin din masuratorile feliei, pana la 12·dMin; cu santierul in
 * cheie, 0 din 3000. Departajare pe `it.id`.
 *
 * Rezerva sub ACELASI `jobId` si rescrie tuplul (`jobTarget`, `jobCantitate` =
 * count-ul nou, `jobWork*`, `MERGE_SURSA`, progres 0). Un refuz poarta motivul cel
 * mai avansat dintre cele vazute pe mormanele care AR FI ajuns: REZERVAT (era unul
 * bun, dar al altora), INACCESIBIL (era, dar in alta componenta), altfel
 * LIPSA_MATERIAL — trei raspunsuri actionabile pentru „De ce nu?", nu unul.
 */
function refaSursa(w: World, rules: Rules, slot: number): Outcome<void> {
  const a = w.agents
  const it = w.iteme
  const d = w.desemnari
  const ds = slotDesemnare(d, a.jobDest[slot]!)
  if (ds === -1) return refuse(Reason.ENTITATE_INEXISTENTA, { id: a.jobDest[slot]! })
  const spec = rules.piese[d.piesa[ds]!]!
  const lipsa = spec.cantitate - a.caraCantitate[slot]!
  if (lipsa <= 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'retintire cu mana plina', cara: a.caraCantitate[slot]!, cantitate: spec.cantitate })
  const fel = rules.digYield[spec.material]!.fel
  const necesar = pragSursa(rules, spec, lipsa)
  const ox = cellOf(a.x[slot]!)
  const oy = cellOf(a.y[slot]!)
  const oz = a.z[slot]!
  const comp = find(w.regions, regionAt(w.regions, ox, oy, oz))
  const sx = d.wx[ds]!
  const sy = d.wy[ds]!
  const sz = d.z[ds]!
  raport.cautariSursa++
  let best = -1
  let bestCheie = 0
  let bestCount = 0
  let rezervate = 0
  let deNeatins = 0
  const ix = indexZone(w, rules)
  for (const s of ix.peFel[fel]!) {
    raport.pasiCautareSursa++
    if (it.alive[s] === 0) continue
    const d2 = Math.abs(it.wx[s]! - sx) + Math.abs(it.wy[s]! - sy) + Math.abs(it.z[s]! - sz)
    if (d2 > 2 * rules.jobScanRadiusCells) continue
    // Praful nu e nici rezervat, nici de neatins: `liber ≤ cant`, deci nu ajunge.
    if (it.cantitate[s]! < necesar) continue
    // Cheia INAINTE de verificarea scumpa: cine nu bate cel mai bun de pana acum nu
    // se mai verifica — iar cand nu e niciun `best`, nimeni n-a fost sarit, deci
    // motivele numarate mai jos sunt complete exact cand se raporteaza.
    const d1 = Math.abs(it.wx[s]! - ox) + Math.abs(it.wy[s]! - oy) + Math.abs(it.z[s]! - oz)
    const cheie = d1 + d2
    if (best !== -1 && (cheie > bestCheie || (cheie === bestCheie && it.id[s]! > it.id[best]!))) continue
    const liber = liberPentru(w, rules, slot, s, comp)
    if (necesar > liber) {
      if (liber === ALTA_COMPONENTA) deNeatins++
      else if (liber === LOCURI_PLINE || liber >= 0) rezervate++
      continue
    }
    best = s
    bestCheie = cheie
    bestCount = Math.min(lipsa, liber)
  }
  if (best === -1) {
    if (rezervate > 0) return refuse(Reason.REZERVAT, { lipsa, necesar, rezervate, deNeatins })
    if (deNeatins > 0) return refuse(Reason.INACCESIBIL, { lipsa, necesar, deNeatins })
    return refuse(Reason.LIPSA_MATERIAL, { lipsa, necesar })
  }
  const out = rezervaToate(w.rezervari, a.id[slot]!, a.jobId[slot]!, [cerereCarat(rules, it.id[best]!, bestCount)])
  if (!out.ok) return out
  a.jobTarget[slot] = it.id[best]!
  a.jobCantitate[slot] = bestCount
  a.jobWorkX[slot] = it.wx[best]!
  a.jobWorkY[slot] = it.wy[best]!
  a.jobWorkZ[slot] = it.z[best]!
  a.jobStep[slot] = PasConstruieste.MERGE_SURSA
  a.jobProgres[slot] = 0
  tintesteLocDeLucru(w, slot)
  raport.locuriDeLucruRefacute++
  return accept()
}

/**
 * N-a mai gasit a doua sursa: NU e vina santierului, deci santierul nu primeste nici
 * racire, nici cauza. Marfa se lasa la picioare — material bun pentru toti — iar
 * rescanarea vine la cadenta obisnuita (`(tick + id) % jobRescanTicks`, cel mult
 * un tact), nu la tickul urmator ca la orice alt sfarsit de job si nu la
 * `jobRetryTicks`; motivul retintirii ramane pe pion.
 *
 * Ce MARGINESTE bucla ridica-lasa nu e aici: e faptul ca sonda si retintirea au
 * acelasi predicat si acelasi lant, deci un job pornit are a doua sursa prin
 * constructie si ajunge aici doar cand lumea s-a schimbat intre scanare si
 * retintire (a luat-o altcineva, a cazut, a fost sigilata). Nicio evitare pe
 * pereche nu intra in joc: prima versiune evita mormanul lasat jos (id NOU la
 * fiecare lasare — o pereche nu opreste nimic), a doua evita sursele de neatins
 * din `refaSursa` (inelul de `jobAvoidSlots` sloturi era singura margine, si la
 * 5 mormane sigilate cadea: 66–126 de cicluri in 3000–6000 de tickuri).
 *
 * Nici „esecul consolideaza: 10 + 10 devin 20" nu e adevarat: pionul sta pe celula
 * sursei pe care tocmai a golit-o si lasa marfa exact acolo — acelasi morman, id
 * nou (panoul, 25.09). Se asserteaza no-op-ul, nu consolidarea.
 */
function abandoneazaRidicarea(w: World, rules: Rules, slot: number, motiv: ReasonCode): void {
  const a = w.agents
  terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
  a.scanLaTick[slot] = w.tick + rules.jobRescanTicks
  w.ratiune.stare[slot] = StareRatiune.RESPINS
  w.ratiune.motivFinal[slot] = codMotiv(motiv)
  w.ratiune.ridicariAbandonate++
}

// ---------------------------------------------------------------------------
// pasii de oprire: LUCREAZA, RIDICA, LASA
// ---------------------------------------------------------------------------

/** Un tick intr-un pas de oprire. Dispecerizeaza pe felul jobului si pasul lui. */
export function lucreaza(w: World, rules: Rules, slot: number): void {
  const drv = driverul(w, slot)
  if (drv === undefined) {
    // Fel necunoscut: se incheie, nu se executa ca sapat. Nu se poate ajunge
    // aici pe o cale normala — `reconstruiesteRezervari` refuza deja felurile
    // fara driver la incarcare — dar un `lucreaza` care presupune e exact
    // bucla de doua tickuri pe care tabelul a venit s-o inchida.
    terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
    return
  }
  drv.lucreaza(w, rules, slot)
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
  const pePodeaDesemnata = seSapaLa(d, cx, cy, cz - 1)
  if (!peLoc || pePodeaDesemnata) {
    // Nu mai e unde trebuie, sau sta pe ceva ce altcineva urmeaza sa sape. Alt
    // loc de lucru, cu progresul pastrat — dar nu pe regiuni stale.
    if (w.regions.dirty.size > 0) return
    if (!refaLoculDeLucru(w, rules, slot, a.jobTarget[slot]!, PasJob.MERGE)) {
      terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.INACCESIBIL, Racire.TINTA)
    }
    return
  }

  a.jobProgres[slot] = a.jobProgres[slot]! + unitatiDeMunca(w, rules, slot)
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
 * ZIDESTE: pionul sta LANGA santier si pune piesa.
 *
 * „Reutilizeaza masinaria de CARA" se aplica la rezervarea-tuplu si la carat, NU
 * la pasul final: la carat, destinatia e o celula de ZONA si pionul trebuie sa fie
 * PE ea. Aici destinatia devine SOLIDA — luata literal, masinaria l-ar pune pe
 * pion exact pe celula pe care o zideste, si `celulaLibera` l-ar refuza. Deci
 * locul de lucru e un vecin calcabil, ca la sapat.
 *
 * Corolar util, verificat de panoul de design: pozitia de lucru iese GRATIS din
 * regula de stabilitate — o celula cu suport > 0 e ori asezata (deci are solid
 * dedesubt), ori are un vecin lateral SOLID la aceeasi cota. Nu e nevoie de o
 * regula separata de accesibilitate.
 */
function zideste(w: World, rules: Rules, slot: number): void {
  const a = w.agents
  const d = w.desemnari
  const ds = slotDesemnare(d, a.jobDest[slot]!)
  if (ds === -1) {
    terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
    return
  }

  const cx = cellOf(a.x[slot]!)
  const cy = cellOf(a.y[slot]!)
  const cz = a.z[slot]!
  const peLoc = cx === a.jobWorkX[slot] && cy === a.jobWorkY[slot] && cz === a.jobWorkZ[slot]
  if (!peLoc || seSapaLa(d, cx, cy, cz - 1)) {
    if (w.regions.dirty.size > 0) return
    // Santierul sta in `jobDest`, si se revine la pasul de mers al CONSTRUITULUI.
    if (!refaLoculDeLucru(w, rules, slot, a.jobDest[slot]!, PasConstruieste.MERGE_SANTIER)) {
      terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.INACCESIBIL, Racire.TINTA)
    }
    return
  }

  const spec = rules.piese[d.piesa[ds]!]!
  // Materialul trebuie sa fie in mana INAINTE de a munci, nu dupa 40 de tickuri.
  // Prima versiune verifica abia la capatul lucrului: un pion trimis aici cu mana
  // goala muncea `lucru` unitati din nimic si abia atunci afla. Un pion care ajunge
  // aici fara materialul intreg e un DEFECT, nu un caz — se numara in zavor si se
  // incheie pe loc.
  if (a.caraCantitate[slot]! < spec.cantitate) {
    w.ratiune.zidiriCuManaGoala++
    terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
    return
  }
  // Celula santierului trebuie sa fie LIBERA la fiecare tick de munca, nu doar la
  // capat. Un om pe ea nu e un refuz al santierului, e o asteptare: cu verificarea
  // abia dupa `lucru`, fiecare constructor platea un drum intreg + 40 de tickuri de
  // „munca", lasa marfa jos si racea santierul 100 de tickuri, iar un coleg adormit
  // pe el il tinea asa sute de tickuri (recenzia din 25.09). Cine ajungea NATURAL pe
  // un santier nu mai ajunge — `celulaDeLucru` sare santierele vii, `pornesteDoarme`
  // doarme pe vecin — deci ce ramane e trecator, si se asteapta, fara progres.
  // Sprijinul pierdut si celula plina raman refuzuri ale TINTEI, mai jos.
  if (!celulaLibera(w, rules, d.wx[ds]!, d.wy[ds]!, d.z[ds]!).ok) {
    raport.santierOcupat++
    return
  }
  a.jobProgres[slot] = a.jobProgres[slot]! + unitatiDeMunca(w, rules, slot)
  raport.tickuriDeLucru++
  w.ratiune.tickuriDeLucru++
  if (a.jobProgres[slot]! < spec.lucru) return

  const out = zidesteVoxel(w, rules, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, spec.material)
  if (!out.ok) {
    // Nu se poate zidi ACUM — sprijin pierdut, celula ocupata, celula plina.
    // Cauza e a TINTEI, nu a pionului: nimeni n-o poate zidi in clipa asta.
    terminaJob(w, rules, slot, Sfarsit.INCOMPLET, out.reason, Racire.TINTA)
    return
  }

  // Materialul s-a CONSUMAT. Al treilea termen al conservarii: fara el, prima
  // zidire ar inrosi fiecare asertiune de `itemePierdute === 0`.
  a.caraCantitate[slot] = a.caraCantitate[slot]! - spec.cantitate
  if (a.caraCantitate[slot] === 0) a.caraKind[slot] = 0
  w.ratiune.unitatiZidite += spec.cantitate
  a.jobEfect[slot] = 1
  raport.pieseZidite++
  marcheazaZoneMurdare(w)
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

  a.jobProgres[slot] = a.jobProgres[slot]! + unitatiDeMunca(w, rules, slot)
  raport.tickuriDeLucru++
  w.ratiune.tickuriDeLucru++
  if (a.jobProgres[slot]! < rules.haulPickupUnits) return

  const cant = Math.min(a.jobCantitate[slot]!, it.cantitate[is]!)
  const idItem = it.id[is]!
  a.caraKind[slot] = it.kind[is]!
  a.jobEfect[slot] = 1
  // Sursa s-a consumat: DOAR ea se elibereaza, destinatia ramane tinuta.
  elibereazaUna(w.rezervari, a.id[slot]!, a.jobId[slot]!, idItem, Strat.CARAT)
  const luat = iaDinItem(w, rules, is, cant)
  // Se ADUNA, nu se scrie: la construit mana poate avea deja prima parte a piesei.
  a.caraCantitate[slot] = a.caraCantitate[slot]! + luat
  // Mormanul s-a golit: cine il mai tinea isi incheie jobul ACUM. Varianta veche
  // chema `elibereazaTinta` si ii ARUNCA valoarea de retur — adica stergea rezervarile
  // celorlalti fara sa le incheie joburile, lasand un job viu FARA rezervare.
  if (it.alive[is] === 0) reconciliazaTintaMoarta(w, rules, idItem)

  a.jobProgres[slot] = 0
  a.jobStep[slot] = PasCara.MERGE_DEST

  // Aici se desparte construitul de carat, si e singurul loc in care „reutilizeaza
  // masinaria de CARA" nu se aplica: la carat destinatia e o celula de ZONA si
  // pionul trebuie sa fie PE ea, la construit destinatia devine SOLIDA. Luata
  // literal, masinaria l-ar trimite exact pe celula pe care urmeaza s-o zideasca,
  // iar `celulaLibera` l-ar refuza — pionul si-ar bloca singur santierul.
  if (a.jobKind[slot] === FelJob.CONSTRUIESTE) {
    const d = w.desemnari
    const ds = slotDesemnare(d, a.jobDest[slot]!)
    if (ds === -1) {
      terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
      return
    }
    const spec = rules.piese[d.piesa[ds]!]!
    // Mai lipseste: a doua sursa, aleasa dupa drumul curent → morman → santier.
    // Daca nu exista, marfa se lasa jos si santierul NU e invinuit.
    if (a.caraCantitate[slot]! < spec.cantitate) {
      const sursa = refaSursa(w, rules, slot)
      if (!sursa.ok) abandoneazaRidicarea(w, rules, slot, sursa.reason)
      return
    }
    // Mana e plina: count-ul pe sursa nu mai inseamna nimic, si codul scrie zero.
    // Decode accepta dupa RIDICA orice intre 0 si totalul piesei, fiindca save-urile
    // de schema 7 poarta totalul acolo — deci zeroul e o conventie a scriitorului, nu
    // o forma pe care usa o cere; nimeni nu-l citeste dupa RIDICA.
    a.jobCantitate[slot] = 0
    // IN COMPONENTA pionului, care acum sta pe morman. Fara ea, `celulaDeLucru`
    // intoarce prima celula calcabila in ordinea fixa, indiferent daca pionul
    // ajunge la ea — si atunci el pleaca spre o tinta imposibila, arde plafonul de
    // incercari pe refuzuri de drum, si abia dupa aia afla.
    //
    // Masurat cat NU face: `DIRECTII` e 4-directionala, deci toti vecinii calcabili
    // ai unui santier calcabil sunt conectati INTRE EI prin celula santierului.
    // Filtrul nu poate deci alege alta celula cand pionul ajunge la vreuna; schimba
    // doar cazul in care nu ajunge la NICIUNA — dintr-o plimbare inutila intr-un
    // refuz imediat, cu cauza corecta pe tinta. Fail-fast, nu alegere reparata.
    const comp = find(w.regions, regionAt(w.regions, cellOf(a.x[slot]!), cellOf(a.y[slot]!), a.z[slot]!))
    const loc = celulaDeLucru(w.terrain, w.regions, d, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, rules, comp)
    if (loc === null) {
      terminaJob(w, rules, slot, Sfarsit.INCOMPLET, Reason.INACCESIBIL, Racire.TINTA)
      return
    }
    a.jobWorkX[slot] = loc.wx
    a.jobWorkY[slot] = loc.wy
    a.jobWorkZ[slot] = loc.z
    tintesteLocDeLucru(w, slot)
    return
  }

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

  a.jobProgres[slot] = a.jobProgres[slot]! + unitatiDeMunca(w, rules, slot)
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
 * ajunge morman nou. Post-conditia: id VIU ⇒ cantitate NESCHIMBATA. Daca se
 * contopeste intreg, id-ul vechi moare; daca ramane un fragment cu mai putin, se
 * trateaza ca o moarte — cine il tinea se reconciliaza ACUM: constructorul cu
 * marfa in mana retinteste (si poate realege fragmentul, din cantitatea vie),
 * restul sunt INTRERUPTI.
 */
function mutaItem(w: World, rules: Rules, is: number, wx: number, wy: number, z: number): void {
  const it = w.iteme
  const id = it.id[is]!
  const kind = it.kind[is]!
  const cant = it.cantitate[is]!
  stergeItem(it, is)
  const r = asazaItem(w, rules, kind, cant, wx, wy, z, id)
  marcheazaZoneMurdare(w)
  // Post-conditia: id VIU ⇒ cantitate NESCHIMBATA. `asazaItem` cu id contopeste
  // intai in vecinii cu loc si abia RESTUL primeste id-ul vechi — deci un morman
  // poate supravietui cu mai putin decat avea, sub rezervari care il credeau
  // intreg. Masurat de panoul din 25.09: 8 scene din 8 (A = 75 langa B = 70, dig
  // sub A → A viu cu 70, B cu 75). Un fragment se trateaza ca o moarte: cine il
  // tinea se reconciliaza acum, nu descopera lipsa la ridicare.
  const nou = slotItem(it, id)
  if (nou !== -1 && it.cantitate[nou]! >= cant) return
  reconciliazaTintaMoarta(w, rules, id)
  void r
}

/**
 * Tinta a murit — sau a ramas cu mai putin decat i se rezervase (`mutaItem`): cine
 * o mai tinea isi incheie jobul ACUM, in acelasi tick. Constructorul cu marfa in
 * mana nu-l incheie, ci retinteste (`refaSursa`); rezervarea lui de pe tinta
 * tocmai s-a scos, deci un fragment viu cu destul liber poate fi reales, din
 * cantitatea vie — a-l exclude ar abandona marfa cu sursa buna la un pas.
 *
 * `stergeItem` isi scrie contractul in docstring — „rezervarile de pe un morman mort
 * sunt treaba apelantului" — si are trei apelanti. `mutaItem` si-l respecta de la
 * inceput; `ridica` chema `elibereazaTinta` dar ARUNCA lista de pretendenti pe care o
 * intoarce; `mananca` nu chema nici macar atat.
 *
 * Ce lasa in urma un apelant care nu-si face partea: un job VIU pe un id mort, si o
 * rezervare ORFANA pe acelasi id. Masurat de o recenzie adversariala pe 20 de seminte
 * x 2000 de tickuri: **285 de granite de tick divergente din 40.000**, episoade de
 * pana la 127 de tickuri, iar lumea continua si cea incarcata NU re-converg. Si
 * invariantul propriu al codului, `verificaRezervari(..., existaTinta(w))` clauza 5,
 * era deja ROSU pe 266 de granite — desi e asertat verde in opt locuri din teste, pe
 * fixturi prea mici ca sa atinga cazul.
 *
 * ## De ce filtrul e pe REZERVARE, nu pe campuri de job
 *
 * Pretendentii vin din `elibereazaTinta`, sortati: cine TINEA ceva pe id-ul ala. O
 * regula scrisa pe campuri („toti cei cu `jobTarget === id`") ar parea echivalenta si
 * nu e — dupa RIDICA, `jobTarget` ramane pe mormanul consumat, dar rezervarea a fost
 * deja eliberata, iar jobul e viu si corect. Rezervarea spune cine mai DEPINDE de
 * tinta; campul spune doar cine a atins-o candva.
 *
 * ## Pionul care tocmai a golit mormanul nu se exclude, si nici nu trebuie
 *
 * La `ridica`, el si-a eliberat propria rezervare cu trei linii mai sus, deci nu
 * apare in lista. Prima varianta avea si un parametru `exceptSlot` care il sarea
 * explicit — o centura care nu se poate aprinde: proba ei a iesit RATATA, adica
 * scoaterea ei nu inrosea nimic.
 *
 * S-a scos, si nu din estetica. O centura fara proba e un orb: daca cineva muta
 * vreodata `elibereazaUna` DUPA `iaDinItem`, pionul chiar ar aparea in lista, si-ar
 * primi `terminaJob` la mijlocul lui `ridica`, iar functia ar continua sa-i scrie
 * pasii peste un job mort. Centura ar fi ascuns exact asta. Fara ea, reordonarea
 * produce un job zombi — pe care AMANDOUA plasele per tick il vad, si exista o
 * proba de mutatie care o face.
 *
 * La `mananca` nu se exclude nimeni oricum: mancatorul ramas fara morman TREBUIE
 * incheiat, si asta e exact ce face lumea continua un tick mai tarziu.
 */
function reconciliazaTintaMoarta(w: World, rules: Rules, id: number): void {
  const a = w.agents
  for (const claimant of elibereazaTinta(w.rezervari, id)) {
    for (let i = 0; i < a.count; i++) {
      if (a.alive[i] === 1 && a.id[i] === claimant && a.jobKind[i] !== 0 && a.jobTarget[i] === id) {
        // Un constructor cu prima parte in mana nu arunca ce are: isi cauta alta
        // sursa. AICI, nu in `ridica` — orice moarte de morman trece pe aici in
        // acelasi tick, deci o ramura in `ridica` ar fi cod mort (panoul, 25.09).
        if (a.jobKind[i] === FelJob.CONSTRUIESTE && a.jobStep[i]! <= PasConstruieste.RIDICA && a.caraCantitate[i]! > 0) {
          const sursa = refaSursa(w, rules, i)
          if (!sursa.ok) abandoneazaRidicarea(w, rules, i, sursa.reason)
        } else {
          terminaJob(w, rules, i, Sfarsit.INTRERUPT)
        }
      }
    }
  }
}

/**
 * Sapa un voxel, murdareste graful de regiuni, lasa mormanul de deasupra sa
 * cada si produce yield-ul. Comanda `dig` si jobul de sapat trec AMANDOUA pe
 * aici: un voxel sapat de un pion nu are voie sa fie altceva decat un voxel
 * sapat de jucator. Refuza `CAPACITATE_DEPASITA` cand nu mai incape niciun
 * morman in lume — voxelul ramane, marfa nu se pierde.
 */
/**
 * Celulele de zona de pe coloana (wx, wy), intre `zDeLa` si headroom-ul de sub
 * ea, care nu mai sunt calcabile dupa o editare de teren: se retrag, intrerupand
 * carausii care le tineau ca destinatie (marfa le ajunge la picioare).
 */
export function retrageCeluleDeZonaNecalcabile(w: World, rules: Rules, wx: number, wy: number, zDeLa: number): void {
  for (let h = 0; h <= rules.agentHeadroomM; h++) {
    const cs = celulaDeZonaLa(w.zone, wx, wy, zDeLa - h)
    if (cs === -1) continue
    if (isWalkable(w.terrain, wx, wy, zDeLa - h, rules)) continue
    anuleazaCelulaDeZona(w, rules, cs)
    stergeCelulaDeZona(w.zone, cs)
  }
}

/**
 * Re-alege locul de lucru, EVITAND cel curent.
 *
 * Impartit de SAPA si de CONSTRUIESTE, dar NUMAI pentru partea care chiar e
 * comuna: „celula de evitat e cea pe care stau acum". Desemnarea si pasul la care
 * se revine difera intre feluri si vin de la apelant.
 *
 * Cele doua metode `refaTinta` erau octet cu octet identice cand le-am unit, si
 * am luat asta drept dovada ca spun acelasi lucru. Nu era: erau identice fiindca
 * una era o COPIE a celeilalte, iar copia carase cu ea presupunerea de sapat.
 * „O functie, un adevar" presupune ca exista UN adevar; aici erau doua, si unul
 * era gresit. Doua implementari identice pot fi identice fiindca una e gresita.
 */
function refaLoculDeLucruEvitandCurentul(
  w: World,
  rules: Rules,
  slot: number,
  idDesemnare: number,
  pasMerge: number,
): boolean {
  const a = w.agents
  return refaLoculDeLucru(w, rules, slot, idDesemnare, pasMerge, cellKey(a.jobWorkX[slot]!, a.jobWorkY[slot]!, a.jobWorkZ[slot]!))
}

/**
 * E libera celula (wx, wy, z) pentru ceva SOLID?
 *
 * Un pion ocupa `agentHeadroomM` niveluri, deci un zid la inaltimea capului il
 * face la fel de ingropat ca unul la picioare; si un morman ingropat e
 * inaccesibil pe veci, plus un candidat fals la fiecare racire. Alternativa la
 * refuz — sa-i ingropi — produce un singur semnal, `INACCESIBIL`, si ala MINTE:
 * problema nu e ca nu exista drum, ci ca pionul e in piatra.
 */
export function celulaLibera(w: World, rules: Rules, wx: number, wy: number, z: number): Outcome<void> {
  const a = w.agents
  for (let h = 0; h < rules.agentHeadroomM; h++) {
    for (let i = 0; i < a.count; i++) {
      if (a.alive[i] === 0) continue
      if (a.z[i] !== z - h) continue
      if (cellOf(a.x[i]!) !== wx || cellOf(a.y[i]!) !== wy) continue
      return refuse(Reason.CELULA_OCUPATA, { id: a.id[i]!, wx, wy, z: z - h })
    }
  }
  for (let h = 0; h < rules.agentHeadroomM; h++) {
    const it = itemLaCelula(w.iteme, wx, wy, z - h)
    if (it !== -1) return refuse(Reason.CELULA_OCUPATA, { item: w.iteme.id[it]!, wx, wy, z: z - h })
  }
  return accept()
}

/**
 * Zidirea unui voxel: O SINGURA cale, pentru comanda si pentru job.
 *
 * Sora lui `sapaVoxel`, si exista din acelasi motiv. Cele trei porti — celula
 * libera, sprijinul, si terenul insusi — trebuie sa fie aceleasi indiferent cine
 * zideste; scrise de doua ori, un pion ar putea face ce jucatorului i se refuza.
 */
export function zidesteVoxel(w: World, rules: Rules, wx: number, wy: number, z: number, material: MaterialId): Outcome<void> {
  const liber = celulaLibera(w, rules, wx, wy, z)
  if (!liber.ok) return liber
  const sprijin = poateSustine(w.terrain, rules, wx, wy, z)
  if (!sprijin.ok) return sprijin
  const out = fill(w.terrain, wx, wy, z, material)
  if (!out.ok) return out
  markDirty(w.regions, wx, wy, z, rules)
  // Zidul ia podeaua celulei de deasupra si headroom-ul celor de dedesubt.
  retrageCeluleDeZonaNecalcabile(w, rules, wx, wy, z + 1)
  return accept()
}

export function sapaVoxel(w: World, wx: number, wy: number, z: number, rules: Rules): Outcome<void> {
  if (w.iteme.vii >= w.iteme.capacity) {
    return refuse(Reason.CAPACITATE_DEPASITA, { camp: 'iteme', capacitate: w.iteme.capacity, motiv: 'nu mai incape niciun morman' })
  }
  const mat = materialAt(w.terrain, wx, wy, z)
  if (!mat.ok) return mat
  const out = dig(w.terrain, wx, wy, z)
  if (!out.ok) return out
  markDirty(w.regions, wx, wy, z, rules)
  // Cârligul: mormanul de deasupra si-a pierdut podeaua — cade.
  const sus = itemLaCelula(w.iteme, wx, wy, z + 1)
  if (sus !== -1) mutaItem(w, rules, sus, wx, wy, z)
  // Si celulele de DEPOZIT isi pierd podeaua la fel. Fara carligul asta ramaneau
  // vii pentru totdeauna: indexul le numara drept „libere" si tinea
  // `maxPrioLibera` sus, deci fiecare morman de pe jos ramanea candidat pe veci,
  // iar cauza afisata („leaga zonele") mintea — jucatorul isi sapase depozitul.
  retrageCeluleDeZonaNecalcabile(w, rules, wx, wy, z + 1)
  const y = rules.digYield[mat.value]
  if (y && y.cantitate > 0) {
    asazaItem(w, rules, y.fel, y.cantitate, wx, wy, z)
    raport.itemeProduse++
    raport.unitatiProduse += y.cantitate
  }
  // Si abia acum stabilitatea: sapatul a terminat, deci terenul e cel pe care se
  // judeca. Prabusirea se intampla in ACELASI tick — un tavan care sta un tick
  // in aer si cade la urmatorul e o stare pe care jucatorul o vede si n-o poate
  // explica.
  prabuseste(w, rules, wx, wy, z)
  return accept()
}

/**
 * Ce s-ar prabusi daca s-ar sapa TOATE desemnarile de SAPAT vii.
 *
 * Previzualizarea NU se poate calcula pe comanda individuala, si asta e o
 * constatare masurata, nu o preferinta: `desemneaza` e per celula, deci un
 * dreptunghi de 7×7 e 49 de comenzi, fiecare evaluata pe lumea neatinsa — in
 * care nicio celula sapata singura nu doboara nimic. Panoul a numarat: **0 din
 * 49** arata vreun avertisment, iar tavanul crapa la sapatura 46 din 49. Care
 * celula e a 46-a depinde de scorul de job si de unde erau pionii, nu de ce a
 * ales jucatorul.
 *
 * Se cheama din overlay, nu din comanda: e o intrebare despre ce s-ar intampla,
 * nu o schimbare de stare, si costa un BFS marginit per celula atinsa.
 */
/**
 * Ce se poate si ce NU se poate construi din desemnarile vii, ACUM.
 *
 * Sora lui `prabusireaPrevizualizata`, si exista din acelasi motiv: raspunsul se
 * da pe MULTIME. La desenare, o piesa judecata singura are aproape mereu suport
 * 0 — blueprintul e aer pana se construieste — deci un refuz per celula ar
 * respinge 82% dintr-o casa pe care se poate ridica.
 */
export function constructiaPrevizualizata(w: World, rules: Rules): { construibile: number[]; imposibile: number[] } {
  const d = w.desemnari
  const celule: number[] = []
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 1 && d.kind[i] === Desemnare.CONSTRUIESTE) celule.push(cellKey(d.wx[i]!, d.wy[i]!, d.z[i]!))
  }
  if (celule.length === 0) return { construibile: [], imposibile: [] }
  return constructiaPosibila(w.terrain, rules, celule)
}

export function prabusireaPrevizualizata(w: World, rules: Rules): number[] {
  const d = w.desemnari
  const celule: number[] = []
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 1 && d.kind[i] === Desemnare.SAPA) celule.push(cellKey(d.wx[i]!, d.wy[i]!, d.z[i]!))
  }
  if (celule.length === 0) return []
  return cadeDaca(w.terrain, rules, celule)
}

/**
 * Prabuseste ce si-a pierdut sprijinul dupa o editare la (wx, wy, z).
 *
 * DOUA faze, si separarea lor nu e eleganta: multimea care cade e independenta
 * de ordine (vezi `multimeaCareCade`), DEPUNEREA nu e. Panoul a masurat ca doua
 * depuneri identice in ordine diferita dau hash diferit — `creeazaItem` ia
 * primul slot liber, iar hash-ul parcurge itemele in ordinea slotului.
 *
 * Voxelul cazut devine AER si lasa MOLOZ pe prima celula cu ceva solid dedesubt.
 * Molozul e SOLID, deci blocheaza drumul, trebuie sapat, si e el insusi sprijin —
 * cascada se opreste prin masa, nu doar prin geometrie. Varianta „devine aer si
 * cade marfa" facea prabusirea o recompensa: primeai camera, o lucarna si piatra
 * pe deasupra.
 *
 * Cele patru carlige de mai jos erau declarate „existente" in prima versiune a
 * designului. Panoul le-a verificat pe toate patru: toate false. Doua dintre ele
 * rupeau M5.
 */
/**
 * Unde ajunge ce se afla la (wx, wy, cota) dupa ce terenul s-a schimbat.
 *
 * Doua miscari, in ordinea asta, si amandoua sunt necesare: **iese din solid**,
 * fiindca molozul poate sa fi aterizat chiar peste el, apoi **cade pana la prima
 * podea**, fiindca podeaua poate sa-i fi disparut. Cu doar a doua, un pion zidit
 * primea drept raspuns chiar cota lui si ramanea inchis; cu doar prima, unul
 * ramas in aer nu cobora.
 *
 * Bucla se termina singura: `solLa` raspunde AER deasupra ferestrei de voxeli.
 */
function cotaDeRefugiu(t: Terrain, wx: number, wy: number, cota: number): number {
  let z = cota
  while (solLa(t, wx, wy, z) === Sol.SOLID) z++
  return cotaDeAsezare(t, wx, wy, z)
}

export function prabuseste(w: World, rules: Rules, wx: number, wy: number, z: number): number {
  const chei = multimeaCareCade(w.terrain, rules, wx, wy, z)
  if (chei.length === 0) return 0

  // Faza 2, in ordinea (z crescator, wx, wy) in care `multimeaCareCade` le-a
  // sortat deja: fundul cade inaintea a ce sta pe el, iar molozul se aseaza peste
  // cel de dedesubt.
  // Per coloana, cotele CELULELOR in care ceva s-a schimbat sub sau peste
  // picioarele cuiva:
  //   - `z + 1` pentru fiecare voxel cazut — acea celula si-a pierdut podeaua;
  //   - cota in care a aterizat molozul — acea celula a devenit SOLIDA.
  //
  // Prima versiune retinea doar varful coloanei, si recenzia a masurat ce rateaza:
  // molozul aterizeaza la `cotaDeAsezare`, care la o cadere de mai multe niveluri
  // e cu totul alta celula. Acolo ajungea sa se zideasca un morman (marfa nici pe
  // jos, nici numarata pierduta), o celula de zona ramanea vie pe teren devenit
  // necalcabil, si un pion ramanea INCHIS in moloz fara sa fie numarat cazut.
  const afectate = new Map<number, number[]>()
  const noteaza = (cwx: number, cwy: number, cota: number): void => {
    const cheieColoana = cwx * WORLD_CELLS + cwy
    const lista = afectate.get(cheieColoana)
    if (lista === undefined) afectate.set(cheieColoana, [cota])
    else lista.push(cota)
  }
  for (const cheie of chei) {
    const c = decodeCell(cheie)

    // (1) Desemnarea de pe voxel. `anuleazaDesemnare`, NU `stergeDesemnare`:
    // prima intrerupe joburile si elibereaza tinta, a doua lasa rezervarea pe un
    // id mort. Masurat de panou: `verificaRezervari` refuza, iar un save luat in
    // fereastra aia anuleaza jobul la incarcare in timp ce lumea continua il mai
    // tine 25 de tickuri — doua hash-uri (9389ec95 vs 622bf8ff).
    const ds = desemnareLaCelula(w.desemnari, c.wx, c.wy, c.z)
    if (ds !== -1) anuleazaDesemnare(w, rules, ds)

    const jos = cotaDeAsezare(w.terrain, c.wx, c.wy, c.z)
    const out = dig(w.terrain, c.wx, c.wy, c.z)
    if (!out.ok) continue
    markDirty(w.regions, c.wx, c.wy, c.z, rules)
    noteaza(c.wx, c.wy, c.z + 1)
    if (jos < c.z) {
      const puneMoloz = fill(w.terrain, c.wx, c.wy, jos, Material.MOLOZ)
      if (puneMoloz.ok) {
        markDirty(w.regions, c.wx, c.wy, jos, rules)
        noteaza(c.wx, c.wy, jos)
      }
    }
    raport.voxeliPrabusiti++
  }

  // Per COLOANA, in ordine fixa pe (wx, wy). Ordinea cheilor unui Map e cea de
  // inserare, deci depinde de istorie — se sorteaza.
  //
  // determinism-ok: cheile sunt numere si se sorteaza explicit inainte de folosire.
  for (const cheieColoana of [...afectate.keys()].sort((a, b) => a - b)) {
    const wx2 = Math.floor(cheieColoana / WORLD_CELLS)
    const wy2 = cheieColoana % WORLD_CELLS
    // Crescator si fara dubluri: fundul se rezolva inaintea a ce sta pe el.
    const cote = [...new Set(afectate.get(cheieColoana)!)].sort((p, q) => p - q)

    for (const cota of cote) {
      // (2) Mormanul care si-a pierdut podeaua, SAU peste care a cazut moloz.
      // Carligul din `asazaItem` muta exact UN nivel; masurat, la o cadere de 2+
      // pierderea e 100%, inclusiv hrana rezervata. Deci cota se calculeaza aici.
      const it = itemLaCelula(w.iteme, wx2, wy2, cota)
      if (it !== -1) {
        const tinta = cotaDeRefugiu(w.terrain, wx2, wy2, cota)
        if (tinta !== cota) mutaItem(w, rules, it, wx2, wy2, tinta)
      }

      // (3) Celulele de zona de pe cota atinsa. Argumentul e cota CELULEI — cu
      // cota voxelului cazut, masurat, nu se retrage niciuna.
      retrageCeluleDeZonaNecalcabile(w, rules, wx2, wy2, cota)
    }

    // (4) Pionul ramas fara podea. NU `dezgroapa`: ala cauta doar ±`maxStepM`,
    // care e 1, deci la o cadere de 2+ pionul ramane in aer PE VECI, iar
    // `ingropati` — asertat 0 in acceptanta — nu mai ajunge niciodata la zero.
    // Caderea nu e un pas de mers, deci n-are plafon de pas.
    const a = w.agents
    for (let i = 0; i < a.count; i++) {
      if (a.alive[i] === 0) continue
      if (cellOf(a.x[i]!) !== wx2 || cellOf(a.y[i]!) !== wy2) continue
      if (isWalkable(w.terrain, wx2, wy2, a.z[i]!, rules)) continue
      // `cotaDeRefugiu`, nu `cotaDeAsezare`: pionul poate fi si ZIDIT, nu doar
      // ramas in aer. Cu `cotaDeAsezare` pornita dintr-o celula devenita solida,
      // raspunsul e chiar cota lui (podeaua e sub el), deci bucla il sarea si
      // ramanea inchis in moloz, nenumarat. Masurat: `pioniCazuti` nu crestea.
      const nou = cotaDeRefugiu(w.terrain, wx2, wy2, a.z[i]!)
      if (nou === a.z[i]! || !isWalkable(w.terrain, wx2, wy2, nou, rules)) continue
      // Jobul se incheie INAINTE de mutare, ca marfa din mana sa treaca prin
      // `lasaLaPicioare` pe o celula care inca exista.
      terminaJob(w, rules, i, Sfarsit.INTRERUPT)
      a.z[i] = nou
      a.hasGoal[i] = 0
      // Si progresul din pasul curent: caderea il scoate din pasul ala. Toate
      // celelalte trei locuri care repozitioneaza un agent (`dezgroapa`,
      // `spawnAgent`, abandonul din `avanseaza`) il pun explicit pe 0; asta era
      // singura repozitionare din nucleu care nu o facea, deci pionul ateriza cu
      // pana la un tic de mers cadou.
      a.progresMm[i] = 0
      clearPath(w.paths, i)
      raport.pioniCazuti++
    }
  }
  return chei.length
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
    // AMBELE campuri, exact ca la `anuleazaCelulaDeZona` si din acelasi motiv:
    // `jobDest` e 0 pentru cine nu foloseste o a doua tinta, iar un id viu nu e
    // niciodata 0. Un job de CONSTRUIT tine desemnarea in `jobDest` (sursa e in
    // `jobTarget`, ca la carat), deci cu filtrul doar pe `jobTarget` constructorul
    // ramanea cu un job viu spre un id mort si o rezervare orfana pe sursa — iar
    // `reconstruiesteRezervari` il arunca la incarcare in timp ce lumea continua il
    // tine. M5 rosu din prima zidire, masurat de panoul de design.
    if (a.alive[i] === 0 || a.jobKind[i] === 0) continue
    if (a.jobTarget[i] !== id && a.jobDest[i] !== id) continue
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
    // ORICE job care tine celula, nu doar caratul: `jobDest` e 0 pentru cine nu
    // foloseste o a doua tinta, si un id de celula vie nu e niciodata 0. Cu
    // filtrul pe CARA, stergerea unui dormitor ar lasa un pion adormit pe o
    // celula inexistenta, fara rezervare — si lumea incarcata ar diverge.
    if (a.alive[i] === 0 || a.jobKind[i] === 0 || a.jobDest[i] !== id) continue
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
  // DOUA treceri. Prima re-rezerva ce se poate si doar NOTEAZA ce se anuleaza;
  // a doua lasa marfa la picioare, dupa ce TOATE rezervarile exista.
  //
  // Intr-o singura trecere, `asazaItem` de la slotul i intreaba rezervarile
  // sloturilor > i, care inca nu sunt scrise: ar fi putut umple o celula de
  // depozit pe care slotul j o tine rezervata ca destinatie, si atunci
  // promisiunea „existent + jobCantitate ≤ itemStackMax intre scan si LASA" —
  // aia pe care sta toata rezervarea de destinatie — s-ar rupe in lumea
  // INCARCATA, dupa ordinea sloturilor. Adica exact o divergenta continuu/incarcat.
  const deGolit: number[] = []
  for (let i = 0; i < a.count; i++) {
    if (a.jobKind[i] === 0) continue
    let out: Outcome<void>
    const drv = driverul(w, i)
    if (a.alive[i] === 0) {
      out = refuse(Reason.ENTITATE_INEXISTENTA, { id: a.id[i]!, motiv: 'claimant mort' })
    } else if (drv === undefined) {
      // Un fel de job pe care versiunea asta nu-l cunoaste (save mai nou, sau
      // stare corupta). Se ANULEAZA cu raport — nu se executa ca sapat.
      out = refuse(Reason.VALOARE_INVALIDA, { camp: 'jobKind', valoare: a.jobKind[i]!, motiv: 'fel de job fara driver' })
    } else {
      const vii = drv.tinteVii(w, i)
      out = vii.ok ? rezervaToate(w.rezervari, a.id[i]!, a.jobId[i]!, drv.cereri(w, rules, i)) : vii
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
    deGolit.push(i)
    anulate++
  }
  for (const i of deGolit) {
    if (a.alive[i] === 1) {
      lasaLaPicioare(w, rules, i)
    } else {
      // Un mort n-are unde s-o lase, dar pierderea se NUMARA. Altfel marfa
      // dintr-un slot mort dispare fara sa apara in niciun contor — exact ce
      // interzice regula „marfa nu dispare niciodata tacut".
      w.ratiune.itemePierdute += a.caraCantitate[i]!
      a.caraKind[i] = 0
      a.caraCantitate[i] = 0
    }
  }
  w.rezervari.anulateLaIncarcare = anulate
  marcheazaZoneMurdare(w)
  return anulate
}

/**
 * Jucatorul a schimbat zonele: racirile scrise pe iteme („n-are unde") nu mai au
 * premisa, deci se sterg. O trecere O(iteme) pe o COMANDA a jucatorului e ieftina
 * si ramane determinista (comenzile sunt in log). Fara asta, marfa statea pe loc
 * pana la ~390 de tickuri dupa ce jucatorul picta depozitul de langa ea.
 *
 * Nu se face din `indexZone`: acolo ar face un camp PERSISTED sa depinda de cate
 * ori s-a intamplat sa ruleze reconstructia lenesa, iar lumea continua si cea
 * incarcata n-o ruleaza de acelasi numar de ori.
 */
export function uitaRacirileDeMarfa(w: World): void {
  const it = w.iteme
  for (let i = 0; i < it.count; i++) {
    if (it.alive[i] === 1) it.reincercaLaTick[i] = 0
  }
}

/**
 * Oracolul de CANTITATE, separat de store: pe fiecare morman viu al unui fel
 * NECOMESTIBIL, suma count-urilor CARAT nu depaseste ce e in el.
 *
 * Felurile comestibile NU intra. Mancatul scade Q pe stratul MANCAT fara sa vada
 * CARAT, si `terminaJob(TERMINAT)` al mancatorului nu reconciliaza nimic — deci dupa
 * ce un flamand a terminat, un caraus poate tine 50 pe un morman de 34, LEGAL, pana
 * ajunge si ia `min` (`ridica`). Recenzia din 25.09 a masurat starea pe un mancator
 * la 390 si un caraus la 40–80 de celule: 5 seminte din 7, ferestre de 14–122 de
 * tickuri, decode fara anulari, marfa conservata. Prima versiune „tolera" suma
 * tinuta ACUM pe MANCAT, falsa exact cand mancatorul termina: toleranta dispare,
 * Q ramane scazut. O toleranta corecta ar cere „cat s-a mancat de la fiecare
 * cerere CARAT" — stare noua pentru un oracol; pe HRANA se probeaza CONSERVAREA
 * (nimic nu dispare, decode fara anulari), nu invariantul.
 *
 * NU e clauza 3 din `verificaRezervari`: aia e o proprietate a storeului (suma sub
 * plafonul stratului), aceeasi in ambele lumi. Asta citeste Q vie din `w.iteme`.
 * Ruleaza in teste, nu in tick.
 */
export function verificaCantitatiRezervate(w: World, rules: Rules): Outcome<void> {
  const it = w.iteme
  for (let s = 0; s < it.count; s++) {
    if (it.alive[s] === 0) continue
    if (rules.nutritie[it.kind[s]!]! > 0) continue
    const carat = sumaRezervata(w.rezervari, it.id[s]!, Strat.CARAT)
    if (carat > it.cantitate[s]!) {
      return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'mai mult rezervat pe CARAT decat e in morman', id: it.id[s]!, fel: it.kind[s]!, cantitate: it.cantitate[s]!, carat })
    }
  }
  return accept()
}

/** Exista tinta unei rezervari? Pentru `verificaRezervari` (clauza 5), in teste si acceptanta. */
export function existaTinta(w: World): (targetId: number, layer: number) => boolean {
  return (targetId, layer) => {
    if (layer === Strat.CARAT || layer === Strat.MANCAT) return slotItem(w.iteme, targetId) !== -1
    return slotDesemnare(w.desemnari, targetId) !== -1 || slotCelulaDeZona(w.zone, targetId) !== -1
  }
}

// ---------------------------------------------------------------------------
// nevoile
// ---------------------------------------------------------------------------

/**
 * Ce fel de job satisface fiecare nevoie. Indexat cu `Nevoie`.
 *
 * Asta e randul de tabel care leaga o nevoie de driverul ei. Impreuna cu
 * `rules.nevoi[n]` si cu `DRIVERE[fel]`, o nevoie noua chiar e „un rand de
 * tabel": nimic din motor nu stie ca FOAME se satisface cu mancare.
 */
export const FEL_PENTRU_NEVOIE: readonly FelJobId[] = [FelJob.MANANCA, FelJob.DOARME]

/**
 * MANANCA rezerva pe stratul SAU, nu pe cel de carat. Vezi `Strat`: pe CARAT,
 * `maxClaimants: 1` al caratului ar da unui singur caraus dreptul pe toata
 * mancarea coloniei, pe tot drumul lui.
 */
export function cereriMananca(rules: Rules, itemId: number, cant: number): readonly Cerere[] {
  return [{ targetId: itemId, layer: Strat.MANCAT, count: cant, maxCount: rules.itemStackMax, maxClaimants: rules.mancatoriPeMorman }]
}

/** DOARME tine patul pe stratul de LUCRU, ca destinatia de carat: un pion per celula. */
export function cereriDoarme(celulaId: number): readonly Cerere[] {
  // Somnul pe jos (`jobDest === 0`) nu rezerva nimic: nu exista entitate.
  if (celulaId === 0) return []
  return [{ targetId: celulaId, layer: Strat.LUCRU, count: 1, maxCount: 1, maxClaimants: 1 }]
}

/**
 * Cel mai apropiat morman COMESTIBIL accesibil si rezervabil, sau null.
 *
 * Trei plase, aceleasi ca la carat: raza, plafon numarat pe INTRARI PARCURSE (nu
 * pe potriviri — plafonul pe potriviri nu margineste nimic cand nimic nu se
 * potriveste), si racirea pe PERECHE. Pe item nu se scrie niciodata racire: ar
 * ascunde singura masa a asezarii de toata lumea, pentru cauza unui singur pion.
 */
function cautaMancare(w: World, rules: Rules, slot: number): { is: number; cant: number } | null {
  const a = w.agents
  const it = w.iteme
  const ax = cellOf(a.x[slot]!)
  const ay = cellOf(a.y[slot]!)
  const az = a.z[slot]!
  const rAgent = regionAt(w.regions, ax, ay, az)
  if (rAgent === NO_REGION) return null
  const compAgent = find(w.regions, rAgent)
  const lipsa = rules.nevoieMax - a.nevoi[slot * NEVOI + Nevoie.FOAME]!
  const ix = indexZone(w, rules)
  let best = -1
  let bestD = 0
  let bestCant = 0
  let parcurse = 0
  for (const i of ix.comestibile) {
    if (parcurse >= rules.nevoieScanMaxCandidates) { raport.candidatiTaiati++; break }
    parcurse++
    raport.pasiNevoi++
    if (it.alive[i] === 0) continue
    const d = Math.abs(it.wx[i]! - ax) + Math.abs(it.wy[i]! - ay) + Math.abs(it.z[i]! - az)
    if (d > rules.nevoieScanRadiusCells) continue
    if (best !== -1 && d >= bestD) continue
    if (esteEvitata(w, slot, it.id[i]!)) continue
    const nut = rules.nutritie[it.kind[i]!]!
    // Cat ii trebuie, nu cat e acolo: restul mormanului ramane celorlalti.
    const cant = Math.min(it.cantitate[i]!, Math.ceil(lipsa / nut))
    if (cant <= 0) continue
    const r = regionAt(w.regions, it.wx[i]!, it.wy[i]!, it.z[i]!)
    if (r === NO_REGION || find(w.regions, r) !== compAgent) continue
    if (!poateRezervaToate(w, a.id[slot]!, cereriMananca(rules, it.id[i]!, cant))) continue
    best = i
    bestD = d
    bestCant = cant
  }
  return best === -1 ? null : { is: best, cant: bestCant }
}

/** Cea mai apropiata celula de dormit libera si accesibila, sau -1 („dorm pe loc"). */
function cautaPat(w: World, rules: Rules, slot: number): number {
  const a = w.agents
  const c = w.zone.celule
  const ax = cellOf(a.x[slot]!)
  const ay = cellOf(a.y[slot]!)
  const az = a.z[slot]!
  const rAgent = regionAt(w.regions, ax, ay, az)
  if (rAgent === NO_REGION) return -1
  const compAgent = find(w.regions, rAgent)
  const ix = indexZone(w, rules)
  let best = -1
  let bestD = 0
  let parcurse = 0
  for (const cs of ix.paturiLibere) {
    if (parcurse >= rules.nevoieScanMaxCandidates) { raport.candidatiTaiati++; break }
    parcurse++
    raport.pasiNevoi++
    const d = Math.abs(c.wx[cs]! - ax) + Math.abs(c.wy[cs]! - ay) + Math.abs(c.z[cs]! - az)
    if (d > rules.nevoieScanRadiusCells) continue
    if (best !== -1 && d >= bestD) continue
    if (esteEvitata(w, slot, c.zonaId[cs]!)) continue
    const r = regionAt(w.regions, c.wx[cs]!, c.wy[cs]!, c.z[cs]!)
    if (r === NO_REGION || find(w.regions, r) !== compAgent) continue
    if (!poateRezervaToate(w, a.id[slot]!, cereriDoarme(c.id[cs]!))) continue
    best = cs
    bestD = d
  }
  return best
}

/** Toate cererile trec? Verificarea e a listei INTREGI, ca la `rezervaToate`. */
function poateRezervaToate(w: World, claimant: number, cereri: readonly Cerere[]): boolean {
  for (const c of cereri) if (!poateRezerva(w.rezervari, claimant, c).ok) return false
  return true
}

function pornesteMananca(w: World, rules: Rules, slot: number, is: number, cant: number): Outcome<void> {
  const a = w.agents
  const it = w.iteme
  const jobId = w.nextId
  const out = rezervaToate(w.rezervari, a.id[slot]!, jobId, cereriMananca(rules, it.id[is]!, cant))
  if (!out.ok) return out
  w.nextId++

  a.jobKind[slot] = FelJob.MANANCA
  a.jobId[slot] = jobId
  a.jobTarget[slot] = it.id[is]!
  a.jobDest[slot] = 0
  a.jobCantitate[slot] = cant
  a.jobConsumat[slot] = 0
  a.jobEfect[slot] = 0
  a.jobStep[slot] = PasNevoie.MERGE
  a.jobProgres[slot] = 0
  a.jobIncercari[slot] = 0
  a.jobWorkX[slot] = it.wx[is]!
  a.jobWorkY[slot] = it.wy[is]!
  a.jobWorkZ[slot] = it.z[is]!
  tintesteLocDeLucru(w, slot)
  raport.joburiPornite++
  raport.joburiDeNevoie++
  return accept()
}

/**
 * `cs === -1` inseamna „dorm pe loc": fara pat, fara rezervare, dar tot somn.
 *
 * Pe loc — dar nu PE un santier viu de construit: un pion adormit pe celula pe care
 * altul o zideste il tine pe constructor la usa cat doarme (recenzia din 25.09:
 * 2500–3750 de tickuri, cu marfa la un pas). Atunci doarme pe primul vecin calcabil
 * din componenta lui (`celulaDeLucru`, care sare santierele); daca nu e niciunul,
 * tot pe loc — somnul reuseste mereu.
 */
function pornesteDoarme(w: World, rules: Rules, slot: number, cs: number): Outcome<void> {
  const a = w.agents
  const c = w.zone.celule
  const jobId = w.nextId
  const celulaId = cs === -1 ? 0 : c.id[cs]!
  const out = rezervaToate(w.rezervari, a.id[slot]!, jobId, cereriDoarme(celulaId))
  if (!out.ok) return out
  w.nextId++

  let lx = cellOf(a.x[slot]!)
  let ly = cellOf(a.y[slot]!)
  let lz = a.z[slot]!
  if (cs === -1) {
    const sant = desemnareLaCelula(w.desemnari, lx, ly, lz)
    if (sant !== -1 && w.desemnari.kind[sant] === Desemnare.CONSTRUIESTE) {
      const comp = find(w.regions, regionAt(w.regions, lx, ly, lz))
      const vecin = celulaDeLucru(w.terrain, w.regions, w.desemnari, lx, ly, lz, rules, comp)
      if (vecin) { lx = vecin.wx; ly = vecin.wy; lz = vecin.z }
    }
  }

  a.jobKind[slot] = FelJob.DOARME
  a.jobId[slot] = jobId
  a.jobTarget[slot] = 0
  a.jobDest[slot] = celulaId
  a.jobCantitate[slot] = 0
  a.jobConsumat[slot] = 0
  a.jobEfect[slot] = 0
  a.jobStep[slot] = PasNevoie.MERGE
  a.jobProgres[slot] = 0
  a.jobIncercari[slot] = 0
  a.jobWorkX[slot] = cs === -1 ? lx : c.wx[cs]!
  a.jobWorkY[slot] = cs === -1 ? ly : c.wy[cs]!
  a.jobWorkZ[slot] = cs === -1 ? lz : c.z[cs]!
  tintesteLocDeLucru(w, slot)
  if (cs !== -1) marcheazaZoneMurdare(w)
  raport.joburiPornite++
  raport.joburiDeNevoie++
  return accept()
}

/**
 * Un tick de mancat. Portie cu portie, dintr-o singura rezervare: un pion la 100
 * care ar face trei joburi complete ar plati trei scanari, trei rezervari si trei
 * drumuri, pe o colonie al carei raport drum/lucru e deja 4,7.
 *
 * Mancatul NU trece prin productivitate: satisfacerea unei nevoi nu e munca, si
 * altfel pionul infometat ar manca la 0,5×, adica recuperarea ar incetini exact
 * cand e nevoie de ea.
 */
function mananca(w: World, rules: Rules, slot: number): void {
  const a = w.agents
  const it = w.iteme
  const is = slotItem(it, a.jobTarget[slot]!)
  if (is === -1) {
    // Mormanul a disparut (l-a mancat altcineva pana la capat, sau l-a mutat
    // carligul de teren). Nu e vina nimanui: se incheie si se re-scaneaza.
    terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
    return
  }
  if (!peCelula(w, slot, it.wx[is]!, it.wy[is]!, it.z[is]!)) {
    if (w.regions.dirty.size > 0) return
    a.jobWorkX[slot] = it.wx[is]!
    a.jobWorkY[slot] = it.wy[is]!
    a.jobWorkZ[slot] = it.z[is]!
    a.jobStep[slot] = PasNevoie.MERGE
    tintesteLocDeLucru(w, slot)
    raport.locuriDeLucruRefacute++
    return
  }
  a.jobProgres[slot] = a.jobProgres[slot]! + 1
  if (a.jobProgres[slot]! < rules.mancatTicks) return
  a.jobProgres[slot] = 0

  const ramasDinRezervare = a.jobCantitate[slot]! - a.jobConsumat[slot]!
  const portie = Math.min(rules.portieMancare, ramasDinRezervare, it.cantitate[is]!)
  if (portie <= 0) {
    terminaJob(w, rules, slot, Sfarsit.TERMINAT)
    return
  }
  const fel = it.kind[is]!
  const idMorman = it.id[is]!
  const luat = iaDinItem(w, rules, is, portie)
  const baza = slot * NEVOI + Nevoie.FOAME
  // Nutritia e PE UNITATE: cu ea pe morman, restul de 15 dintr-o stiva de 75 ar
  // hrani cat o portie intreaga — hrana din nimic.
  a.nevoi[baza] = Math.min(rules.nevoieMax, a.nevoi[baza]! + luat * rules.nutritie[fel]!)
  a.jobConsumat[slot] = a.jobConsumat[slot]! + luat
  a.jobEfect[slot] = 1
  raport.unitatiMancate += luat
  if (a.nevoi[baza]! >= rules.nevoieMax || a.jobConsumat[slot]! >= a.jobCantitate[slot]!) {
    terminaJob(w, rules, slot, Sfarsit.TERMINAT)
  }
  // DUPA creditarea hranei, si dupa sfarsitul normal. Ordinea e tot ce conteaza aici:
  // incheiat inainte, pionul ar pierde portia pe care tocmai a mancat-o. Iar daca a
  // terminat cu TERMINAT, `terminaJob` iese devreme pe `jobKind === 0`, deci bucla e
  // un no-op pentru el — si INTRERUPT ramane doar pentru cine chiar a ramas fara.
  if (it.alive[is] === 0) reconciliazaTintaMoarta(w, rules, idMorman)
}

/**
 * Un tick de dormit. Refacerea se aplica la ticul de NEVOIE (vezi
 * `scurgeNevoile`), nu aici: calibrata pe tick, cum era in v1, tot somnul dura
 * 25 de tickuri — mai putin decat drumul pana la pat.
 */
function doarme(w: World, rules: Rules, slot: number): void {
  const a = w.agents
  const c = w.zone.celule
  if (a.jobDest[slot] !== 0) {
    const cs = slotCelulaDeZona(w.zone, a.jobDest[slot]!)
    if (cs === -1) {
      // Patul a disparut sub el (zona stearsa). Se incheie — altfel ar dormi pe
      // o celula inexistenta, fara rezervare, si lumea incarcata ar diverge.
      terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
      return
    }
    if (!peCelula(w, slot, c.wx[cs]!, c.wy[cs]!, c.z[cs]!)) {
      if (w.regions.dirty.size > 0) return
      a.jobWorkX[slot] = c.wx[cs]!
      a.jobWorkY[slot] = c.wy[cs]!
      a.jobWorkZ[slot] = c.z[cs]!
      a.jobStep[slot] = PasNevoie.MERGE
      tintesteLocDeLucru(w, slot)
      raport.locuriDeLucruRefacute++
      return
    }
  }
  a.jobEfect[slot] = 1
  // Un gand de EVENIMENT: s-a intamplat, deci n-are de unde fi recalculat. Se
  // reinnoieste cat timp doarme pe jos, si expira singur dupa aceea.
  if (a.jobDest[slot] === 0) {
    const g = rules.ganduri[Gand.DORMIT_PE_JOS]!
    if (g.durata > 0) puneGand(a, slot, w.tick, Gand.DORMIT_PE_JOS, w.tick + g.durata)
  }
  if (a.nevoi[slot * NEVOI + Nevoie.ODIHNA]! >= rules.nevoieMax) {
    terminaJob(w, rules, slot, Sfarsit.TERMINAT)
  }
}

/**
 * Scurgerea nevoilor, la ticul de nevoie al pionului. Nevoia pe care jobul
 * curent chiar o REFACE creste in loc sa scada.
 */
export function scurgeNevoile(w: World, rules: Rules, slot: number): void {
  const a = w.agents
  const baza = slot * NEVOI
  for (let n = 0; n < NEVOI; n++) {
    const spec = rules.nevoi[n]!
    if (n === Nevoie.ODIHNA && a.jobKind[slot] === FelJob.DOARME && !pasDeMers(a.jobStep[slot]!)) {
      a.nevoi[baza + n] = Math.min(rules.nevoieMax, a.nevoi[baza + n]! + rules.odihnaPeTicDeNevoie)
      continue
    }
    a.nevoi[baza + n] = Math.max(0, a.nevoi[baza + n]! - spec.scurgere)
  }
}

/**
 * Se poate intrerupe jobul curent?
 *
 * Mana plina e singurul caz in care intreruperea poate DISTRUGE marfa
 * (`asazaItem` poate sa n-aiba unde s-o puna), iar munca ramasa pana la capatul
 * jobului e marginita prin constructie. Research: pionii TERMINA task-ul curent
 * inainte sa reciteasca orarul.
 *
 * UN adevar, nu doua: „mana plina", indiferent de felul jobului. Prima versiune
 * spunea „carat, de la MERGE_DEST incolo" — adevarat pentru carat si FALS pentru
 * construit, unde pionul are 20 de unitati in mana de la RIDICA pana la ZIDESTE:
 * foamea critica il intrerupea la 390/400 de progres, marfa cadea langa santier,
 * progresul se pierdea (panoul din 25.09). Bugetul de amanare ramane marginit:
 * un job de construit intreg dureaza ~300 de tickuri, iar de la pragul critic la
 * zero foamea are 6250.
 */
function poateFiIntrerupt(w: World, slot: number): boolean {
  return w.agents.caraCantitate[slot] === 0
}

/**
 * Poarta de nevoi, la FIECARE tick. Intoarce `true` daca pionul e ocupat cu o
 * nevoie (deci nu cauta de lucru).
 *
 * Se cheama in fiecare tick, nu la ticul de nevoie, si asta nu e risipa — sunt
 * doua citiri de tablou per pion. Pe ticul de nevoie, poarta n-ar prinde aproape
 * nimic: un pion termina un job la tickul 1001 cu foamea sub prag, dar 1001 nu e
 * ticul LUI de nevoie, deci ia alt job de 40 de tickuri; iar cand vine ticul,
 * ARE job si foamea e inca peste pragul critic. Momentul „liber SI pe tic de
 * nevoie" e o coincidenta de ~1 la 250, deci „prefera" n-ar exista practic si
 * tot jocul s-ar muta pe calea cu intreruperi.
 *
 * `prag` = PREFERA (nu intrerupe nimic), `pragCritic` = INTRERUPE — dar numai
 * daca are ce face: nu intrerupi ca sa nu faci nimic.
 */
export function verificaNevoi(w: World, rules: Rules, slot: number): boolean {
  const a = w.agents
  const baza = slot * NEVOI
  for (let n = 0; n < NEVOI; n++) {
    const spec = rules.nevoi[n]!
    const v = a.nevoi[baza + n]!
    if (v >= spec.prag) continue
    // Deja o rezolv pe asta: nu ma intrerup pe mine insumi. Fara clauza, un pion
    // care merge 160 de tickuri spre mancare s-ar auto-intrerupe la fiecare
    // verificare si n-ar ajunge niciodata la ea.
    if (a.jobKind[slot] === FEL_PENTRU_NEVOIE[n]) return true
    if (w.tick < a.nevoieReincercaLaTick[baza + n]!) continue
    const critic = v < spec.pragCritic
    const ocupat = a.jobKind[slot] !== 0
    if (ocupat && (!critic || !poateFiIntrerupt(w, slot))) continue

    // Tinta se cauta ÎNAINTE de intrerupere: altfel un pion fara mancare in toata
    // asezarea si-ar arunca jobul ca sa constate ca n-are unde sa se duca.
    let pornit = false
    if (FEL_PENTRU_NEVOIE[n] === FelJob.MANANCA) {
      const g = cautaMancare(w, rules, slot)
      if (g !== null) {
        if (ocupat) { terminaJob(w, rules, slot, Sfarsit.INTRERUPT); w.ratiune.intreruperiDeNevoie++ }
        pornit = pornesteMananca(w, rules, slot, g.is, g.cant).ok
      }
    } else {
      // Somnul reuseste mereu: fara pat liber, pionul doarme pe loc.
      const cs = cautaPat(w, rules, slot)
      if (ocupat) { terminaJob(w, rules, slot, Sfarsit.INTRERUPT); w.ratiune.intreruperiDeNevoie++ }
      pornit = pornesteDoarme(w, rules, slot, cs).ok
    }
    if (pornit) return true

    // N-are cum s-o rezolve ACUM. Racire pe perechea (pion, nevoie) si inapoi la
    // munca. Fara ea, un pion sub pragul critic ar intrerupe, ar cauta, n-ar
    // gasi si ar relua — la nesfarsit, si fara ca vreun zavor sa vada ceva,
    // fiindca `Sfarsit.INTRERUPT` nu atinge `joburiFaraProgres`.
    a.nevoieReincercaLaTick[baza + n] = w.tick + rules.nevoieRetryTicks
    w.ratiune.nevoiNerezolvate++
  }
  return false
}

// ---------------------------------------------------------------------------
// dispozitia
// ---------------------------------------------------------------------------

/**
 * Tinta de dispozitie: baza plus suma gandurilor active. DERIVED — se
 * recalculeaza oricand din nevoi si din multimea de ganduri de eveniment.
 *
 * Gandurile de STARE nu se stocheaza: un gand stocat care descrie o stare e inca
 * o copie care poate ramane in urma realitatii. Cele doua praguri ale unei nevoi
 * se EXCLUD — sub pragul critic conteaza doar gandul critic.
 */
export function tintaDispozitiei(w: World, rules: Rules, slot: number): number {
  const a = w.agents
  let t = rules.dispozitieBaza
  for (let n = 0; n < NEVOI; n++) {
    const spec = rules.nevoi[n]!
    const v = a.nevoi[slot * NEVOI + n]!
    const par = GAND_PENTRU_NEVOIE[n]!
    if (v < spec.pragCritic) t += rules.ganduri[par.critic]!.valoare
    else if (v < spec.prag) t += rules.ganduri[par.prag]!.valoare
  }
  const k = a.ganduriSloturi
  const baza = slot * k
  for (let i = 0; i < k; i++) {
    const fel = a.gandFel[baza + i]!
    if (fel === 0 || a.gandPanaLa[baza + i]! <= w.tick) continue
    t += rules.ganduri[fel]!.valoare
  }
  return Math.max(0, Math.min(rules.dispozitieMax, t))
}

/**
 * Bara urmareste tinta, lent si asimetric. La ticul de dispozitie al pionului.
 *
 * Pasul e LIMITAT la distanta ramasa. Fara limitare, bara sare peste tinta si
 * oscileaza la infinit in jurul ei cu ±rata — marcajul de tinta din HUD nu s-ar
 * suprapune niciodata cu bara, desi situatia e perfect stabila.
 *
 * Si NU se misca in somn (research: cat timp pionul doarme, bara sta pe loc).
 * Altfel un pion ar putea pleca din asezare exact in timp ce isi rezolva nevoia
 * care il facea nefericit.
 */
export function miscaDispozitia(w: World, rules: Rules, slot: number): void {
  const a = w.agents
  if (a.jobKind[slot] === FelJob.DOARME && !pasDeMers(a.jobStep[slot]!)) return
  const tinta = tintaDispozitiei(w, rules, slot)
  const bara = a.dispozitie[slot]!
  if (tinta === bara) return
  const rata = tinta > bara ? rules.dispozitieUrcare : rules.dispozitieCoborare
  const pas = Math.min(rata, Math.abs(tinta - bara))
  a.dispozitie[slot] = tinta > bara ? bara + pas : bara - pas
}

/** Multiplicatorul de productivitate, in miimi: liniar intre min si max pe bara. */
export function multiplicatorDeMunca(w: Rules, dispozitie: number): number {
  return w.multiplicatorMin + Math.floor(((w.multiplicatorMax - w.multiplicatorMin) * dispozitie) / w.dispozitieMax)
}

/**
 * Cate unitati de munca face pionul intr-un tick.
 *
 * PODEAUA E PE REZULTAT, nu pe factor. Cu ea pe factor, un continut perfect
 * legal (`workUnitsPerTick: 1`, minimul din `RULES_SPEC`) dadea 0 unitati pe
 * tick: jobul nu se incheia niciodata, tinta ramanea rezervata pentru toata
 * colonia, si niciun plafon nu se incrementa. Clasa asta a fost inchisa de doua
 * ori la taietura 2; a treia oara intra prin productivitate.
 */
export function unitatiDeMunca(w: World, rules: Rules, slot: number): number {
  const m = multiplicatorDeMunca(rules, w.agents.dispozitie[slot]!)
  return Math.max(1, Math.floor((rules.workUnitsPerTick * m) / 1000))
}

/** E prea nefericit ca sa munceasca? */
export function refuzaMunca(w: World, rules: Rules, slot: number): boolean {
  return w.agents.dispozitie[slot]! < rules.dispozitiePragRefuz
}

/**
 * A treia treapta: pionul pleaca din asezare. Intoarce `true` daca a plecat.
 *
 * Contorul sta pe `World` si e PERSISTED. In `RatiuneStore` (TRANSIENT) ar fi
 * aratat 0 dupa fiecare incarcare, desi plecatii raman plecati — un numar care
 * se reseteaza cand salvezi nu e un numar.
 */
export function verificaPlecarea(w: World, rules: Rules, slot: number): boolean {
  const a = w.agents
  if (a.dispozitie[slot]! >= rules.dispozitiePragPlecare) return false
  // `terminaJob` elibereaza rezervarile si lasa marfa la picioare — exact ca la
  // `killAgent`. Un plecat care si-ar lua marfa cu el ar fi marfa disparuta.
  terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
  a.alive[slot] = 0
  a.hasGoal[slot] = 0
  clearPath(w.paths, slot)
  w.plecatiTotal++
  raport.plecati++
  return true
}

// ---------------------------------------------------------------------------
// tabelul de drivere
// ---------------------------------------------------------------------------

/**
 * Tot ce stie motorul de joburi despre UN fel de job.
 *
 * ## De ce un tabel si nu `if`-uri
 *
 * Pana aici, cinci locuri ramificau pe `=== FelJob.CARA` cu `else` = SAPA:
 * `cereriPentru`, `reconstruiesteRezervari`, `lucreaza`, `terminaJob` si
 * `drumRefuzat`. Cu doua feluri, un `else` e o alternativa. Cu trei, e o
 * PRESUPUNERE — si panoul taieturii 3 a masurat ce presupune gresit, din patru
 * lentile independente care au ajuns la aceeasi radacina:
 *
 *   - la incarcare, `reconstruiesteRezervari` ar fi cerut `slotDesemnare(...)`
 *     pentru un id de ITEM, ar fi primit -1 si ar fi anulat jobul. Adica
 *     `1000 + save + load + 1000 != 2000` pentru FIECARE pion care mananca sau
 *     doarme in momentul salvarii — aproape mereu. Exact invarianta pe care sta
 *     tot determinismul.
 *   - in executie, `lucreaza` ar fi trimis orice fel != CARA in `lucreazaSapa`,
 *     care n-ar fi gasit desemnarea si ar fi facut `terminaJob(INTRERUPT)`;
 *     pionul ar fi reluat, si tot asa — o bucla de ~2 tickuri, fiecare arzand un
 *     `w.nextId`, care e PERSISTED si intra in hash.
 *   - la un refuz de drum, racirea s-ar fi scris pe `slotItem(...)` = -1, adica
 *     NICAIERI, deci reluarea ar fi fost imediata si infinita.
 *
 * Si tabelul e ce face adevarata propozitia „o nevoie noua e un rand de tabel":
 * fara el, un fel nou de job cere noua schimbari imprastiate, nu una.
 *
 * `default` REFUZA, nu presupune. Un `FelJob` necunoscut dintr-un save mai nou
 * anuleaza jobul cu raport, nu il executa ca sapat.
 */
export interface DriverJob {
  readonly fel: FelJobId
  /** Sfarsitul jobului schimba ce e liber intr-o zona? Atunci indexul se murdareste. */
  readonly atingeZone: boolean
  /**
   * Cererile de rezervare ale jobului, calculate DOAR din tuplul PERSISTAT
   * (`jobTarget, jobDest, jobCantitate, jobStep`) — deci identic in lumea
   * continua si in cea incarcata. Nimic de aici nu citeste un camp mutabil al
   * tintei; vezi `cereriPentru`.
   */
  cereri(w: World, rules: Rules, slot: number): readonly Cerere[]
  /** Mai exista tintele jobului in lume? Refuzul poarta id-ul lipsa. */
  tinteVii(w: World, slot: number): Outcome<void>
  /** Un tick intr-un pas de oprire (sapa, ridica, lasa, mananca, doarme). */
  lucreaza(w: World, rules: Rules, slot: number): void
  /**
   * Un INCOMPLET: unde se scrie racirea si cauza. `rezultat` e slotul mormanului
   * lasat la picioare (sau -1); restul se citeste din tuplul jobului, care inca
   * nu s-a sters.
   */
  incheie(w: World, rules: Rules, slot: number, motiv: ReasonCode | undefined, racire: RacireId, rezultat: number): void
  /**
   * Dupa un refuz de drum care tine de TINTA: se poate re-alege tinta pasului de
   * mers curent, sarind peste cea de acum? `false` inseamna „nu mai am unde".
   */
  refaTinta(w: World, rules: Rules, slot: number): boolean
}

const DRIVER_SAPA: DriverJob = {
  fel: FelJob.SAPA,
  atingeZone: false,
  cereri(w, _rules, slot) {
    return cereriSapa(w.agents.jobTarget[slot]!)
  },
  tinteVii(w, slot) {
    const id = w.agents.jobTarget[slot]!
    return slotDesemnare(w.desemnari, id) === -1 ? refuse(Reason.ENTITATE_INEXISTENTA, { id }) : accept()
  },
  lucreaza(w, rules, slot) {
    lucreazaSapa(w, rules, slot)
  },
  incheie(w, rules, slot, motiv, racire) {
    const target = w.agents.jobTarget[slot]!
    const ds = slotDesemnare(w.desemnari, target)
    if (racire === Racire.TINTA) {
      if (ds !== -1) {
        w.desemnari.reincercaLaTick[ds] = w.tick + racireDesemnare(w, rules)
        w.desemnari.ultimulMotiv[ds] = codMotiv(motiv ?? Reason.INACCESIBIL)
        w.desemnari.ultimulMotivDetaliu[ds] = detaliuDesemnareDin(motiv ?? Reason.INACCESIBIL)
      }
      return
    }
    evitaTinta(w, slot, target, w.tick + rules.jobRetryTicks)
    // Cauza se vede si pe tinta, ca overlay-ul sa aiba ce arata — dar fara
    // racire pe ea: altcineva o poate lua chiar acum.
    if (ds !== -1 && motiv) {
      w.desemnari.ultimulMotiv[ds] = codMotiv(motiv)
      w.desemnari.ultimulMotivDetaliu[ds] = DetaliuMotiv.NICIUNUL
    }
  },
  refaTinta(w, rules, slot) {
    const a = w.agents
    return refaLoculDeLucruEvitandCurentul(w, rules, slot, a.jobTarget[slot]!, PasJob.MERGE)
  },
}

const DRIVER_CARA: DriverJob = {
  fel: FelJob.CARA,
  atingeZone: true,
  cereri(w, rules, slot) {
    const a = w.agents
    return cereriCara(rules, a.jobTarget[slot]!, a.jobDest[slot]!, a.jobCantitate[slot]!, a.jobStep[slot]!)
  },
  tinteVii(w, slot) {
    const a = w.agents
    // Sursa conteaza doar pana la ridicare inclusiv; dupa aia marfa e in mana.
    if (a.jobStep[slot]! <= PasCara.RIDICA && slotItem(w.iteme, a.jobTarget[slot]!) === -1) {
      return refuse(Reason.ENTITATE_INEXISTENTA, { id: a.jobTarget[slot]! })
    }
    if (slotCelulaDeZona(w.zone, a.jobDest[slot]!) === -1) {
      return refuse(Reason.ENTITATE_INEXISTENTA, { id: a.jobDest[slot]! })
    }
    return accept()
  },
  lucreaza(w, rules, slot) {
    if (w.agents.jobStep[slot] === PasCara.RIDICA) ridica(w, rules, slot)
    else lasa(w, rules, slot)
  },
  incheie(w, rules, slot, motiv, racire, rezultat) {
    const a = w.agents
    const step = a.jobStep[slot]!
    const target = a.jobTarget[slot]!
    // Ce EXISTA dupa refuz e sursa (daca n-a fost ridicata) sau mormanul lasat
    // la picioare. Racirea se scrie pe ele, nu pe un id mort.
    const sursa = step <= PasCara.RIDICA ? slotItem(w.iteme, target) : -1
    const is = sursa !== -1 ? sursa : rezultat
    if (racire === Racire.TINTA) {
      if (is !== -1) memoreazaPeItem(w, rules, is, motiv ?? Reason.INACCESIBIL, detaliuItemDin(motiv ?? Reason.INACCESIBIL))
      return
    }
    if (step >= PasCara.MERGE_DEST) {
      // Drumul MEU spre depozitul ala e blocat; zona ramane pentru altii.
      const cs = slotCelulaDeZona(w.zone, a.jobDest[slot]!)
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
  },
  refaTinta(w, rules, slot) {
    const a = w.agents
    // Doar destinatia se re-alege. Spre SURSA nu exista „alta celula": mormanul
    // e unde e, si daca drumul pana la el nu tine, jobul se incheie.
    if (a.jobStep[slot] !== PasCara.MERGE_DEST) return false
    return refaDestinatia(w, rules, slot, slotCelulaDeZona(w.zone, a.jobDest[slot]!))
  },
}

const DRIVER_MANANCA: DriverJob = {
  fel: FelJob.MANANCA,
  atingeZone: false,
  cereri(w, rules, slot) {
    const a = w.agents
    // Cantitatea e cea INGHETATA la start, nu `jobCantitate − jobConsumat`:
    // rezervarea vie nu se micsoreaza pe masura ce mananca, deci nici cea
    // reconstruita la incarcare n-are voie.
    return cereriMananca(rules, a.jobTarget[slot]!, a.jobCantitate[slot]!)
  },
  tinteVii(w, slot) {
    const id = w.agents.jobTarget[slot]!
    return slotItem(w.iteme, id) === -1 ? refuse(Reason.ENTITATE_INEXISTENTA, { id }) : accept()
  },
  lucreaza(w, rules, slot) {
    mananca(w, rules, slot)
  },
  incheie(w, rules, slot, motiv, racire) {
    void rules
    // Racirea unei nevoi merge pe PERECHE mereu, niciodata pe morman: o racire
    // pe mormanul de mancare l-ar ascunde de toata colonia pentru sute de
    // tickuri, pentru o cauza care tine de un singur pion. Exact greseala
    // platita la taietura 2, reintrata prin a treia tinta.
    void racire
    void motiv
    evitaTinta(w, slot, w.agents.jobTarget[slot]!, w.tick + rules.jobRetryTicks)
  },
  refaTinta() {
    // Mormanul e unde e: nu exista „alta celula" spre care sa te reorientezi.
    return false
  },
}

const DRIVER_DOARME: DriverJob = {
  fel: FelJob.DOARME,
  atingeZone: true,
  cereri(w, _rules, slot) {
    return cereriDoarme(w.agents.jobDest[slot]!)
  },
  tinteVii(w, slot) {
    const id = w.agents.jobDest[slot]!
    // `0` = doarme pe loc: n-are tinta, deci n-are cum s-o piarda.
    if (id === 0) return accept()
    return slotCelulaDeZona(w.zone, id) === -1 ? refuse(Reason.ENTITATE_INEXISTENTA, { id }) : accept()
  },
  lucreaza(w, rules, slot) {
    doarme(w, rules, slot)
  },
  incheie(w, rules, slot, motiv, racire) {
    void racire
    void motiv
    const cs = slotCelulaDeZona(w.zone, w.agents.jobDest[slot]!)
    if (cs !== -1) evitaTinta(w, slot, w.zone.celule.zonaId[cs]!, w.tick + rules.jobRetryTicks)
  },
  refaTinta(w, rules, slot) {
    // Alt pat liber, daca exista; altfel `false`, si atunci pionul cade pe
    // „dorm pe loc" la urmatoarea verificare de nevoi.
    const a = w.agents
    if (a.jobDest[slot] === 0) return false
    const cs = cautaPat(w, rules, slot)
    if (cs === -1) return false
    const c = w.zone.celule
    if (c.id[cs] === a.jobDest[slot]) return false
    if (!poateRezervaToate(w, a.id[slot]!, cereriDoarme(c.id[cs]!))) return false
    elibereazaUna(w.rezervari, a.id[slot]!, a.jobId[slot]!, a.jobDest[slot]!, Strat.LUCRU)
    if (!rezervaToate(w.rezervari, a.id[slot]!, a.jobId[slot]!, cereriDoarme(c.id[cs]!)).ok) return false
    a.jobDest[slot] = c.id[cs]!
    a.jobWorkX[slot] = c.wx[cs]!
    a.jobWorkY[slot] = c.wy[cs]!
    a.jobWorkZ[slot] = c.z[cs]!
    a.jobStep[slot] = PasNevoie.MERGE
    a.jobProgres[slot] = 0
    tintesteLocDeLucru(w, slot)
    marcheazaZoneMurdare(w)
    raport.locuriDeLucruRefacute++
    return true
  },
}

/** Indexat pe `FelJob`. `undefined` = fel necunoscut, si atunci se REFUZA. */
const DRIVER_CONSTRUIESTE: DriverJob = {
  fel: FelJob.CONSTRUIESTE,
  // Zidirea poate face o celula de zona necalcabila, iar `zidesteVoxel` chiar
  // retrage celulele afectate — deci indexul se murdareste.
  atingeZone: true,
  cereri(w, rules, slot) {
    const a = w.agents
    return cereriConstruieste(rules, a.jobTarget[slot]!, a.jobDest[slot]!, a.jobCantitate[slot]!, a.jobStep[slot]!)
  },
  tinteVii(w, slot) {
    const a = w.agents
    // Sursa conteaza doar pana la ridicare inclusiv; dupa aia materialul e in mana.
    if (a.jobStep[slot]! <= PasConstruieste.RIDICA && slotItem(w.iteme, a.jobTarget[slot]!) === -1) {
      return refuse(Reason.ENTITATE_INEXISTENTA, { id: a.jobTarget[slot]! })
    }
    if (slotDesemnare(w.desemnari, a.jobDest[slot]!) === -1) {
      return refuse(Reason.ENTITATE_INEXISTENTA, { id: a.jobDest[slot]! })
    }
    return accept()
  },
  lucreaza(w, rules, slot) {
    if (w.agents.jobStep[slot] === PasConstruieste.RIDICA) ridica(w, rules, slot)
    else zideste(w, rules, slot)
  },
  incheie(w, rules, slot, motiv, racire) {
    const a = w.agents
    const ds = slotDesemnare(w.desemnari, a.jobDest[slot]!)
    // Pe piciorul SURSEI tinta e MORMANUL, nu santierul: un drum refuzat spre el nu
    // e vina santierului si nu-i scrie nici racire, nici cauza. Iar un morman nu se
    // raceste GLOBAL (`memoreazaPeItem`) niciodata dintr-un job de construit — nici
    // sursa, nici marfa lasata la picioare: o racire globala ascunde mormanul de
    // toata colonia, iar `lasaLaPicioare` CONTOPESTE in mormanul de pe celula, deci
    // ar raci mormanul comun pe care pionul sta, cu o cauza falsa. Prima versiune o
    // facea, in ciuda propozitiei de mai sus: 99 de tickuri de racire pe un morman de
    // 30, al doilea constructor blocat 107 tickuri (recenzia din 25.09). Pe PERECHE.
    if (a.jobStep[slot]! <= PasConstruieste.RIDICA) {
      if (slotItem(w.iteme, a.jobTarget[slot]!) !== -1) evitaTinta(w, slot, a.jobTarget[slot]!, w.tick + rules.jobRetryTicks)
      return
    }
    if (racire === Racire.TINTA) {
      // Santierul e cel care nu se poate zidi acum: racirea si cauza merg pe el,
      // ca overlay-ul si panoul „De ce nu?" sa aiba ce arata.
      if (ds !== -1) {
        w.desemnari.reincercaLaTick[ds] = w.tick + racireDesemnare(w, rules)
        w.desemnari.ultimulMotiv[ds] = codMotiv(motiv ?? Reason.INACCESIBIL)
        w.desemnari.ultimulMotivDetaliu[ds] = detaliuDesemnareDin(motiv ?? Reason.INACCESIBIL)
      }
      // Marfa lasata la picioare NU se raceste: santierul e cel racit, deci nu poate
      // fi re-luata pentru el, iar pentru orice alt santier e material bun.
      return
    }
    // Drumul MEU e blocat: santierul ramane pentru altii.
    evitaTinta(w, slot, a.jobDest[slot]!, w.tick + rules.jobRetryTicks)
    if (ds !== -1 && motiv) {
      w.desemnari.ultimulMotiv[ds] = codMotiv(motiv)
      w.desemnari.ultimulMotivDetaliu[ds] = DetaliuMotiv.NICIUNUL
    }
  },
  refaTinta(w, rules, slot) {
    const a = w.agents
    // Pe piciorul SURSEI nu exista „alta celula": mormanul e unde e — oglinda lui
    // `DRIVER_CARA.refaTinta`. Fara garda asta, un drum refuzat spre morman il
    // trimitea pe pion la SANTIER cu mana goala (jobStep = MERGE_SANTIER scris
    // neconditionat), unde `zideste` aduna progres 40 de tickuri si abia la capat
    // afla ca n-are din ce zidi: INTRERUPT, fara racire, rescanare, de la capat.
    // Masurat de panoul din 25.09, cu un ostil pinuit pe morman: 73 din 74 de
    // joburi intr-o bucla de 3000 de tickuri, 2586 de tickuri de „zidire" din
    // nimic, `nextId` +74, niciun zavor tras.
    if (a.jobStep[slot]! <= PasConstruieste.RIDICA) {
      // Alta SURSA, nu alta celula: drumul spre mormanul asta e blocat pentru mine.
      // Vechea se evita pe pereche INAINTE de cautare — asa nu poate fi realeasa —
      // dar se elibereaza ABIA dupa ce cea noua e rezervata: un job viu fara
      // rezervarea sursei ar fi reconstruit altfel la incarcare.
      const veche = a.jobTarget[slot]!
      evitaTinta(w, slot, veche, w.tick + rules.jobRetryTicks)
      const sursa = refaSursa(w, rules, slot)
      if (!sursa.ok) {
        // Cu prima parte in mana, esecul e o ridicare ABANDONATA — acelasi sfarsit
        // si acelasi contor ca in `ridica`, nu un INCOMPLET prin `drumRefuzat`, care
        // lasa marfa jos fara sa numere nimic (recenzia din 25.09). Cu mana goala nu
        // e nimic de abandonat: `drumRefuzat` incheie jobul cu cauza drumului.
        if (a.caraCantitate[slot]! > 0) { abandoneazaRidicarea(w, rules, slot, sursa.reason); return true }
        return false
      }
      elibereazaUna(w.rezervari, a.id[slot]!, a.jobId[slot]!, veche, Strat.CARAT)
      return true
    }
    // La construit santierul e in `jobDest`, nu in `jobTarget` — acolo e sursa.
    return refaLoculDeLucruEvitandCurentul(w, rules, slot, a.jobDest[slot]!, PasConstruieste.MERGE_SANTIER)
  },
}

const DRIVERE: readonly (DriverJob | undefined)[] = [undefined, DRIVER_SAPA, DRIVER_CARA, DRIVER_MANANCA, DRIVER_DOARME, DRIVER_CONSTRUIESTE]

/** Driverul unui fel de job, sau `undefined` daca felul nu e cunoscut. */
export function driverPentru(fel: number): DriverJob | undefined {
  return DRIVERE[fel]
}

/** Driverul jobului CURENT al unui pion, sau `undefined` (fara job, sau fel necunoscut). */
export function driverul(w: World, slot: number): DriverJob | undefined {
  return DRIVERE[w.agents.jobKind[slot]!]
}

void slotZona
