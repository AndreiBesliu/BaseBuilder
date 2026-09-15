/**
 * Agenti care chiar merg undeva — S12-15.
 *
 * Inlocuieste plimbarea aleatoare care a tinut locul pana acum. Rolul ei era sa
 * exercite mecanismele care nu se pot retrofita (fluxuri de RNG numite, ordine
 * fixa de iterare, aritmetica intreaga, hash de stare) inainte sa existe joburi.
 * Acum exista drumuri, deci substitutul iese.
 *
 * ## Problema pe care o rezolva PRIMA, fiindca altfel tot restul e nisip
 *
 * Drumurile depind de REGIUNI, iar regiunile sunt DERIVED: se calculeaza lene,
 * numai unde a intrebat cineva. Asta inseamna ca doua lumi cu stare PERSISTED
 * identica pot da drumuri diferite, dupa cum s-a nimerit sa fie calculate
 * regiunile — iar invariantul „1000 de tickuri + save + load + 1000 == 2000"
 * s-ar rupe tacut, si s-ar rupe doar uneori.
 *
 * Leacul e sa faci ACOPERIREA o functie de starea persistata: la fiecare tick,
 * fiecare agent viu isi asigura regiunile din jurul lui, in ordinea slotului, cu
 * o raza din `content`. Pozitiile agentilor sunt persistate, deci acoperirea
 * devine reproductibila prin constructie, nu prin noroc.
 *
 * ## Ce e persistat si ce nu
 *
 * **Tinta** unui agent e stare reala: fara ea, un save reincarcat ar trimite
 * oamenii in alta parte.
 *
 * **Drumul e si el stare reala**, si prima versiune a acestui fisier spunea
 * contrariul: „se recalculeaza din (pozitie, tinta, teren), deci e TRANSIENT".
 * Propozitia aia e FALSA, si nu putin — un A* nu are un raspuns unic. Pentru
 * aceeasi pereche (pozitie, tinta) exista de obicei mai multe drumuri la fel de
 * scurte, iar care dintre ele iese depinde de punctul din care a pornit cautarea.
 * Un agent care isi refacea drumul din pozitia lui CURENTA alegea, legitim, alta
 * ruta decat sufixul celui vechi — si de acolo pozitii diferite, apoi tot restul.
 *
 * Masurat: pe scenariul standard, seed 12345, 40 de agenti, N=300, hash-ul era
 * identic la momentul salvarii si diverge la doua tickuri dupa incarcare. Agentul
 * 14 avea ACEEASI tinta in ambele lumi si drumuri diferite spre ea.
 *
 * Deci drumul se salveaza. Nu era o optimizare de spatiu, era o clasificare
 * gresita — exact genul pe care disciplina PERSISTED/DERIVED/TRANSIENT exista ca
 * s-o prinda, si pe care am ratat-o fiindca fixtura care ar fi trebuit s-o prinda
 * nastea agentii in aer.
 *
 * Se salveaza doar coada ramasa, de la cursor incolo; la incarcare cursorul
 * porneste de la zero. Un drum tipic are ~20 de celule.
 *
 * ## Plafonul de re-planificari
 *
 * Cerut explicit de plan. Fara el, o singura schimbare de teren pune toti agentii
 * sa caute in acelasi tick — exact varful pe care research-ul il descrie ca
 * „FPS-ul scade cand construiesti un zid". Cu el, varful se intinde pe mai multe
 * tickuri, iar cine n-a apucat asteapta. Un agent care asteapta nu e blocat: sta
 * pe loc si incearca la tickul urmator.
 */

import type { Rules } from './content.ts'
import { nextInt } from './rng.ts'
import type { RngState } from './rng.ts'
import type { AgentStore, World } from './state.ts'
import { Faction, MM_PER_CELL, PasJob } from './state.ts'
import { blockKey, blockOfCell, canStep, ensureArea, isWalkable, NO_REGION, rebuildDirty, regionAt } from './regions.ts'
import { cellKey, findPath, pathLength } from './path.ts'
import type { Ocupare } from './path.ts'
import { Reason } from './result.ts'
import { cellOf, centerMm, clearPath } from './drumuri.ts'
import { cautaJob, drumRefuzat, lucreaza, resetJobReport, tintesteLocDeLucru } from './joburi.ts'

// Drumurile si aritmetica de celule stau in `drumuri.ts` (ca `joburi.ts` sa le
// poata folosi fara un ciclu de import). Re-exportate de aici pentru cine le
// stia in locul asta.
export { cellOf, clearPath, makePathStore } from './drumuri.ts'
export type { PathStore } from './drumuri.ts'

// ---------------------------------------------------------------------------
// ocuparea
// ---------------------------------------------------------------------------

const ostileBuf = new Set<number>()
const propriiBuf = new Set<number>()

/**
 * Cine sta unde, in tickul asta.
 *
 * Se reconstruieste de la zero la fiecare tick, din pozitii. Ar fi tentant sa se
 * intretina incremental, dar atunci ocuparea ar deveni stare — adica inca un
 * lucru care poate ramane in urma realitatii fara ca cineva sa afle.
 *
 * „Ostil" e o relatie, nu o proprietate: pentru un agent din asezare, ostili sunt
 * jefuitorii; pentru un jefuitor, invers. De aia se construieste per FACTIUNE.
 */
export function buildOcupare(a: AgentStore, pentruFactiune: number): Ocupare {
  ostileBuf.clear()
  propriiBuf.clear()
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0) continue
    const k = cellKey(cellOf(a.x[i]!), cellOf(a.y[i]!), a.z[i]!)
    if (a.faction[i] === pentruFactiune) propriiBuf.add(k)
    else ostileBuf.add(k)
  }
  return { ostile: ostileBuf, proprii: propriiBuf }
}

// ---------------------------------------------------------------------------
// tinte
// ---------------------------------------------------------------------------

/**
 * Alege o tinta noua: o celula la intamplare in jur, pe care chiar se poate sta.
 *
 * E un substitut, si e scris ca substitut: la S16-19 tinta vine de la un job, nu
 * de la zar. Ce ramane insa permanent e FORMA — o tinta se valideaza inainte de
 * a fi adoptata, altfel agentul porneste spre ceva ce nu exista si esueaza abia
 * la cautare, de fiecare data, la nesfarsit.
 *
 * Numarul de trageri din flux e MARGINIT: cel mult `incercari * 2`. Fara plafon,
 * consumul de RNG ar depinde de teren, iar cursorul fluxului n-ar mai fi o
 * functie previzibila de stare.
 */
function alegeTinta(w: World, rules: Rules, rng: RngState, slot: number): boolean {
  const a = w.agents
  const cx = cellOf(a.x[slot]!)
  const cy = cellOf(a.y[slot]!)
  const raza = rules.agentGoalRadiusCells

  let facute = 0
  for (let incercare = 0; incercare < rules.agentGoalAttempts; incercare++) {
    const dx = nextInt(rng, raza * 2 + 1) - raza
    const dy = nextInt(rng, raza * 2 + 1) - raza
    facute++
    raport.incercariTinta++
    if (facute > raport.maxIncercariUnAgent) raport.maxIncercariUnAgent = facute
    const tx = cx + dx
    const ty = cy + dy
    if (tx < 0 || ty < 0) continue

    // Cota se cauta in jurul celei proprii: o tinta la alt etaj cere scari, si
    // scarile nu exista inca.
    //
    // Si NUMAI in blocuri LEGATE, nu doar calculate. Inelul din jurul unui disc
    // de acoperire e calculat (vecinii se creeaza la legare) dar nu e legat: un
    // pion care hoinarea acolo statea intr-o regiune fara muchii — nu putea lua
    // niciun job si nu putea primi niciun drum in afara blocului. Si, mai grav,
    // fiecare pas in afara discului ar cere un inel nou, iar acoperirea ar creste
    // cu plimbarea, nemarginit. Hoinareala ramane in ce e legat; acoperirea
    // creste doar spre munca (vezi `acoperaCoridor` in joburi.ts).
    for (let dz = 0; dz <= rules.maxStepM * 2; dz++) {
      for (const tz of dz === 0 ? [a.z[slot]!] : [a.z[slot]! + dz, a.z[slot]! - dz]) {
        if (!isWalkable(w.terrain, tx, ty, tz, rules)) continue
        if (regionAt(w.regions, tx, ty, tz) === NO_REGION) continue
        const b = blockOfCell(tx, ty)
        if (!w.regions.legate.has(blockKey(b.bx, b.by, tz))) continue
        a.goalX[slot] = tx
        a.goalY[slot] = ty
        a.goalZ[slot] = tz
        a.hasGoal[slot] = 1
        return true
      }
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// tickul de agenti
// ---------------------------------------------------------------------------

export interface AgentTickReport {
  /** Cate re-planificari s-au facut. Plafonate de `maxReplansPerTick`. */
  replans: number
  /** Cati agenti au cerut un drum si au primit un refuz. */
  refuzuri: number
  /** Cati au fost opriti de cineva ostil. Asta e semnalul D7c. */
  blocatiDeOstili: number
  /** Cati agenti au ATINS tinta in tickul asta. Masura pentru „chiar ajung undeva". */
  sosiri: number
  /** Cati stau intr-o celula necalcabila si n-au unde sa iasa. Trebuie sa fie 0. */
  ingropati: number
  /** Cate INCERCARI de tinta s-au facut. Fiecare costa exact doua trageri de RNG. */
  incercariTinta: number
  /** Cea mai lunga serie de incercari a unui singur agent. Nu are voie sa treaca de plafon. */
  maxIncercariUnAgent: number
}

const raport: AgentTickReport = { replans: 0, refuzuri: 0, blocatiDeOstili: 0, sosiri: 0, ingropati: 0, incercariTinta: 0, maxIncercariUnAgent: 0 }

/** Ultimul raport de tick. TRANSIENT, pentru overlay si pentru teste. */
export function lastAgentReport(): AgentTickReport {
  return raport
}

export function stepAgents(w: World, rules: Rules): void {
  const a = w.agents
  const p = w.paths
  const rng = w.rng.agents
  raport.replans = 0
  raport.refuzuri = 0
  raport.blocatiDeOstili = 0
  raport.sosiri = 0
  raport.ingropati = 0
  raport.incercariTinta = 0
  raport.maxIncercariUnAgent = 0
  resetJobReport()

  // 1. Acoperirea de regiuni, ca functie de pozitiile PERSISTATE ale agentilor.
  //    Ordinea slotului, ca peste tot.
  //
  //    **Un agent care nu poate face nimic nu are voie sa coste nimic.** Prima
  //    versiune cerea `ensureArea` ori de cate ori agentul nu era intr-o regiune,
  //    fara nicio racire. Agentii-substitut se nasc la z = 0, iar solul de sub ei
  //    e la -70 m: nu ajungeau NICIODATA intr-o regiune, deci fiecare dintre ei
  //    platea o reconstructie completa de regiuni la FIECARE tick, pe veci.
  //    200 de tickuri nu se terminau in doua minute.
  //
  //    Racirea face din asta un cost marginit: se incearca, si daca tot nu iese,
  //    se asteapta. Un agent care nu poate fi ajutat devine gratis.
  //    Acoperirea se extinde numai pentru agentii care NU sunt intr-o regiune.
  //
  //    Am incercat sa o asigur pentru toti, la fiecare tick, ca sa devina o functie
  //    de pozitii si sa nu mai depinda de istorie. Masurat: acoperirea creste
  //    atunci NEMARGINIT — 124.000 de blocuri la 20.000 de tickuri, cu costul
  //    dublandu-se la fiecare 10.000 — fiindca fiecare pas al fiecarui agent
  //    adauga un inel nou care nu se arunca niciodata. Testul de acceptanta a
  //    trecut de la 7 secunde la peste 578.
  //
  //    Acumularea e deci NECESARA ca sa fie ieftin: agentii se plimba prin ce e
  //    deja calculat si nu platesc nimic. Ea trebuie sa fie REPRODUCTIBILA, nu
  //    eliminata — iar asta se rezolva in `save.ts`, unde extinderea acoperirii se
  //    persista si se reconstruieste identic la incarcare.
  let ceva = false
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0) continue
    const cx = cellOf(a.x[i]!)
    const cy = cellOf(a.y[i]!)
    // „Intr-o regiune" nu ajunge: blocul trebuie sa fie si LEGAT. Un pion nascut
    // in inelul calculat-dar-nelegat al discului altcuiva statea intr-o regiune
    // fara muchii: nicio tinta, niciun drum, niciun job. Hoinareala nu iese din
    // blocuri legate, deci conditia se atinge doar la nastere si dupa o mutare
    // fortata (`dezgroapa`) — un inel nou, o data, nu la fiecare pas.
    if (regionAt(w.regions, cx, cy, a.z[i]!) !== NO_REGION) {
      const b = blockOfCell(cx, cy)
      if (w.regions.legate.has(blockKey(b.bx, b.by, a.z[i]!))) continue
    }
    if (w.tick < p.nextReplanTick[i]!) continue

    ensureArea(w.terrain, w.regions, cx, cy, a.z[i]!, rules.agentRegionRadiusBlocks, rules)
    ceva = true
    if (regionAt(w.regions, cx, cy, a.z[i]!) === NO_REGION) {
      // Nici dupa calcul nu e nicaieri: probabil e in aer sau in piatra.
      p.nextReplanTick[i] = w.tick + rules.replanCooldownTicks
    }
  }
  void ceva
  // Reconstructia se cheama MEREU, nu doar cand un agent e in afara unei regiuni.
  //
  // Varianta de dinainte era cod mort: conditia devenea adevarata numai cand un
  // agent nu era intr-o regiune, iar in regim stabil asta nu se intampla — deci
  // murdaria produsa de sapat si zidit nu s-ar fi procesat NICIODATA.
  // `rebuildDirty` iese singur devreme cand nu e nimic murdar.
  rebuildDirty(w.terrain, w.regions, rules)

  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0) continue

    let cx = cellOf(a.x[i]!)
    let cy = cellOf(a.y[i]!)
    let cz = a.z[i]!

    // Ingropat? Se scoate.
    //
    // `fill` refuza acum sa zideasca peste cineva, dar asta nu acopera tot: un
    // save facut inainte de regula aia, sau o schimbare de teren care face celula
    // necalcabila din alt motiv, lasa agentul in piatra. Iar acolo e prins pe
    // viata: poarta de mai jos il opreste, si fiindca e oprit nu mai ajunge
    // niciodata sa se miste. Un pion care nu poate fi ajutat trebuie sa produca
    // MACAR un semnal, nu tacere.
    if (!isWalkable(w.terrain, cx, cy, cz, rules)) {
      if (!dezgroapa(w, rules, i)) {
        raport.ingropati++
        continue
      }
      cx = cellOf(a.x[i]!)
      cy = cellOf(a.y[i]!)
      cz = a.z[i]!
    }

    // Cine nu e intr-o regiune n-are ce cauta mai departe: nici tinta, nici drum.
    if (regionAt(w.regions, cx, cy, cz) === NO_REGION) continue

    // 2. Munca. Pull, nu push: un pion FARA job cere unul cand ii vine randul —
    //    decalat pe id, ca sa nu scaneze toti in acelasi tick (research: id % 30)
    //    — sau in tickul de dupa un job incheiat, ca sa nu hoinareasca intre
    //    doua joburi (masurat: 21,6% din timpul unei cariere). Daca primeste,
    //    tinta de mers devine celula de lucru si hoinareala se opreste. Un pion
    //    CU job nu re-scaneaza: politica de preemptiune din joburi.ts.
    //
    //    Doar ASEZAREA cere de lucru. Un jefuitor nu sapa pentru jucator:
    //    DESIGN §5.5 il pune sub un Commander AI, nu la tabla de joburi.
    if (
      a.jobKind[i] === 0 &&
      a.faction[i] === Faction.ASEZARE &&
      ((w.tick + a.id[i]!) % rules.jobRescanTicks === 0 || (a.scanLaTick[i] !== 0 && a.scanLaTick[i] === w.tick))
    ) {
      cautaJob(w, rules, i)
    }
    if (a.jobKind[i] !== 0) {
      if (a.jobStep[i] === PasJob.LUCREAZA) {
        lucreaza(w, rules, i)
        continue
      }
      // MERGE: tinta trebuie sa fie celula de lucru. `dezgroapa` o poate fi sters.
      if (a.hasGoal[i] === 0) tintesteLocDeLucru(w, i)
    } else if (a.hasGoal[i] === 0) {
      // 2b. Fara job si fara tinta: hoinareste. Starea Idle trebuie sa fie
      //     VIZIBILA (research), nu un pion intepenit — si un tick pierdut e mai
      //     bun decat o cautare care nu poate reusi.
      if (!alegeTinta(w, rules, rng, i)) continue
      clearPath(p, i)
    }

    // A ajuns?
    if (cx === a.goalX[i] && cy === a.goalY[i] && cz === a.goalZ[i]) {
      a.hasGoal[i] = 0
      clearPath(p, i)
      if (a.jobKind[i] !== 0) {
        // La locul de lucru: de aici munceste, de la tickul urmator.
        a.jobStep[i] = PasJob.LUCREAZA
      } else {
        raport.sosiri++
      }
      continue
    }

    // 3. Fara drum, se cere unul — daca bugetul mai permite si racirea a trecut.
    if (p.len[i] === 0) {
      if (raport.replans >= rules.maxReplansPerTick) continue
      if (w.tick < p.nextReplanTick[i]!) continue
      raport.replans++

      const ocupare = buildOcupare(a, a.faction[i]!)
      const out = findPath(
        w.terrain,
        w.regions,
        rules,
        { wx: cx, wy: cy, z: cz },
        { wx: a.goalX[i]!, wy: a.goalY[i]!, z: a.goalZ[i]! },
        ocupare,
      )

      if (!out.ok) {
        raport.refuzuri++
        if (out.reason === Reason.OCUPAT_DE_OSTIL) raport.blocatiDeOstili++
        p.nextReplanTick[i] = w.tick + rules.replanCooldownTicks
        if (a.jobKind[i] !== 0) {
          // Un job al carui drum e refuzat: decide `joburi.ts`, nu codul de
          // mers. Diferenta dintre „prea scump acum", „blocat de cineva" si
          // „nu se mai poate sta acolo" e exact D7c, si fiecare are alt raspuns.
          drumRefuzat(w, rules, i, out.reason)
          continue
        }
        // Tinta se abandoneaza si se asteapta. Asta e diferenta dintre un agent
        // care incearca si unul care se blocheaza pe viata: nu insista pe o tinta
        // pe care lumea tocmai a refuzat-o.
        a.hasGoal[i] = 0
        continue
      }

      const n = Math.min(pathLength(out.value), p.maxCells)
      const baza = i * p.maxCells * 3
      for (let c = 0; c < n; c++) {
        p.cells[baza + c * 3] = out.value.cells[c * 3]!
        p.cells[baza + c * 3 + 1] = out.value.cells[c * 3 + 1]!
        p.cells[baza + c * 3 + 2] = out.value.cells[c * 3 + 2]!
      }
      p.len[i] = n
      // Cursorul porneste de la 1: celula 0 e chiar cea pe care sta agentul.
      p.cursor[i] = 1
    }

    // 4. Mersul.
    avanseaza(w, rules, i)
  }

  // Si la SFARSIT de tick, nu doar la inceput.
  //
  // Sapaturile facute de pioni se intampla in bucla de mai sus, DUPA reconstructia
  // de la inceputul tickului. Fara pasul asta, tickul s-ar incheia cu blocuri
  // murdare, iar un save facut atunci n-ar contine murdaria (e TRANSIENT): lumea
  // continua ar reconstrui la tickul urmator si ar lega vecini pe care lumea
  // incarcata nu i-ar lega niciodata — alt graf, alte coridoare, alt hash.
  // Costul e acelasi: fiecare multime murdara se reconstruieste o singura data,
  // doar ca acum, nu peste un tick. Invariantul: la sfarsitul oricarui tick,
  // `regions.dirty` e gol.
  rebuildDirty(w.terrain, w.regions, rules)
}

/**
 * Un pas pe drum.
 *
 * Agentul sta MEREU in centrul unei celule. Ce se acumuleaza e progresul, in
 * milimetri; cand trece de o celula intreaga, agentul sare in centrul urmatoare,
 * cu tot cu cota ei.
 *
 * Prima versiune aluneca in milimetri spre centrul urmatoarei celule si aplica
 * `z` abia la sosire. Pe teren plat mergea. Pe o panta, `cellOf(x)` trecea
 * granita cu un tick inaintea lui `z`, si in tickul ala tripletul agentului arata
 * celula noua la cota veche — o celula plina cu piatra, deci fara regiune. Poarta
 * de la inceputul lui `stepAgents` il oprea, si fiindca era oprit nu mai ajungea
 * niciodata la randul asta ca sa se alinieze. Un agent blocat pe viata, la sapte
 * celule de unde pornise, cu racirea prelungindu-se la nesfarsit.
 *
 * Nu era un defect de pathfinding: drumul era corect. Era doua reprezentari ale
 * aceleiasi pozitii care se schimbau la momente diferite. Miscarea atomica
 * inseamna ca nu exista moment in care tripletul sa fie invalid.
 *
 * Randarea neteda nu se pierde: are drumul si `progresMm`, deci poate interpola
 * intre centre. Doar SIMULAREA e discreta — ceea ce e si politica („fara float in
 * starea de simulare"), nu doar o comoditate.
 */
function avanseaza(w: World, rules: Rules, slot: number): void {
  const a = w.agents
  const p = w.paths
  if (p.cursor[slot]! >= p.len[slot]!) {
    clearPath(p, slot)
    return
  }

  a.progresMm[slot] = a.progresMm[slot]! + rules.agentStepMm

  // `while`, nu `if`: un pas mai mare decat o celula trece prin mai multe. Azi
  // nu se intampla, dar regula nu trebuie sa depinda de o valoare din content.
  while (a.progresMm[slot]! >= MM_PER_CELL && p.cursor[slot]! < p.len[slot]!) {
    const baza = slot * p.maxCells * 3 + p.cursor[slot]! * 3
    const tx = p.cells[baza]!
    const ty = p.cells[baza + 1]!
    const tz = p.cells[baza + 2]!

    // Terenul se RE-VERIFICA la fiecare pas, nu doar la planificare.
    //
    // Drumul se calculeaza o data si nimic nu-l invalida cand terenul se schimba
    // sub el. Un zid ridicat in fata unui pion nu-l oprea: continua sa mearga pe
    // drumul vechi, prin piatra, si era desenat in interiorul zidului. Intr-un
    // colony sim asta inseamna „pionii ignora zidurile pe care tocmai le-ai
    // construit". Verificarea costa un `canStep` pe pas — adica o data la patru
    // tickuri per agent.
    if (!canStep(w.terrain, cellOf(a.x[slot]!), cellOf(a.y[slot]!), a.z[slot]!, tx, ty, tz, rules)) {
      clearPath(p, slot)
      a.progresMm[slot] = 0
      return
    }

    a.progresMm[slot] = a.progresMm[slot]! - MM_PER_CELL
    a.x[slot] = centerMm(tx)
    a.y[slot] = centerMm(ty)
    a.z[slot] = tz
    p.cursor[slot] = p.cursor[slot]! + 1
  }
  if (p.cursor[slot]! >= p.len[slot]!) clearPath(p, slot)
}

/**
 * Scoate un agent dintr-o celula in care nu se poate sta.
 *
 * Ordinea de cautare e FIXA si porneste de la celula proprie: patru vecini
 * orizontali, apoi cote in jurul celei proprii. Prima celula calcabila castiga.
 * Nu e teleportare la distanta — daca nu e nimic la un pas, agentul ramane si
 * intra la socoteala ca `ingropat`, fiindca un pion pierdut trebuie NUMARAT, nu
 * mutat in celalalt capat al hartii.
 */
function dezgroapa(w: World, rules: Rules, slot: number): boolean {
  const a = w.agents
  const cx = cellOf(a.x[slot]!)
  const cy = cellOf(a.y[slot]!)
  const cz = a.z[slot]!
  const pas = Math.max(0, Math.min(4, rules.maxStepM))

  for (let dz = 0; dz <= pas; dz++) {
    for (const nz of dz === 0 ? [cz] : [cz + dz, cz - dz]) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (dx === 0 && dy === 0 && nz === cz) continue
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0) continue
        if (!isWalkable(w.terrain, nx, ny, nz, rules)) continue
        a.x[slot] = centerMm(nx)
        a.y[slot] = centerMm(ny)
        a.z[slot] = nz
        a.progresMm[slot] = 0
        a.hasGoal[slot] = 0
        clearPath(w.paths, slot)
        return true
      }
    }
  }
  return false
}
