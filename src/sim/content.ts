/**
 * Incarcarea continutului din DATE.
 *
 * Regula, din research: **un numar de gameplay in cod e un bug de arhitectura.**
 * Serveste intai iteratia mea de balans (zeci de rulari in loc de doua), si abia
 * apoi modding-ul. Validarea de schema e aici ca sa nu descopar un camp scris
 * gresit la tickul 40.000, ci la incarcare, cu un mesaj care spune ce si unde.
 *
 * Zero dependente: validatorul e de o suta de linii si nu vreau un pachet in
 * nucleul de simulare.
 */

import type { Outcome } from './result.ts'
import { accept, refuse, Reason } from './result.ts'
import { REGION_SIZE } from './regions.ts'
import { isSolid, Material } from './terrain/chunk.ts'
import type { MaterialId } from './terrain/chunk.ts'
import { Gand, GAND_PENTRU_NEVOIE, GANDURI, Item, ITEME, Nevoie, NEVOI, Piesa } from './state.ts'

/** Ce lasa in urma un voxel sapat: felul de item si cate unitati. `cantitate` 0 = nimic (aer, apa). */
export interface DigYield {
  readonly fel: number
  readonly cantitate: number
}

/**
 * Ce costa si ce produce o piesa de constructie, indexat cu `PiesaId`.
 *
 * FELUL materialului consumat NU se scrie aici: se deriva din
 * `digYield[material].fel`. Scris separat, s-ar putea ajunge la un perete de
 * piatra platit in lemn si sapat inapoi in piatra.
 */
export interface SpecPiesa {
  /** Materialul care rezulta. Trebuie sa fie SOLID. */
  readonly material: MaterialId
  /**
   * Cate unitati se consuma. Invariant verificat la incarcare: EXACT cat da
   * `digYield` inapoi la sapatul aceluiasi material.
   */
  readonly cantitate: number
  /** Unitati de munca la santier, pe aceeasi scara cu `digWorkUnits`. */
  readonly lucru: number
}

/**
 * Randul de tabel al unei nevoi. Cat scade la ticul de nevoie, sub ce valoare
 * pionul PREFERA sa si-o rezolve, si sub ce valoare ISI INTRERUPE jobul.
 */
/**
 * Randul de tabel al unui gand: cat muta TINTA de dispozitie, si cat tine.
 * `durata` 0 inseamna gand de STARE — nu se stocheaza, se recalculeaza din nevoi.
 */
export interface SpecGand {
  /** Cat aduna la tinta. Negativ = nefericire. */
  readonly valoare: number
  /** Cate tickuri tine, pentru gandurile de EVENIMENT. 0 = gand de stare. */
  readonly durata: number
}

export interface SpecNevoie {
  /** Cat scade la fiecare tic de nevoie, in miimi. */
  readonly scurgere: number
  /** Sub atat, pionul prefera sa si-o rezolve — dar nu intrerupe nimic. */
  readonly prag: number
  /** Sub atat, pionul isi intrerupe jobul in curs. Strict sub `prag`. */
  readonly pragCritic: number
}

export interface Rules {
  /** Cati agenti incap. Plafon dur, verificat de comanda de spawn. */
  readonly agentCapacity: number
  /** Cati milimetri face un agent intr-un tick. */
  readonly agentStepMm: number
  /** Tickuri de simulare pe secunda de joc. */
  readonly ticksPerSecond: number
  /** Raza discului de chunk-uri rezidente, in chunk-uri. 11 ≈ 377 de chunk-uri. */
  readonly chunkResidentRadius: number
  /** Cate niveluri urca sau coboara un agent dintr-un pas. 1 = o treapta. */
  readonly maxStepM: number
  /** De cate niveluri libere are nevoie un agent deasupra podelei. */
  readonly agentHeadroomM: number
  /** Costul unui pas normal, in sutimi de celula. Toate celelalte se raporteaza la el. */
  readonly stepCost: number
  /** Cat costa in plus pasitul peste un agent PROPRIU. RimWorld foloseste 175. */
  readonly allyStepPenalty: number
  /** Cat costa in plus un pas care schimba nivelul. Fara el, drumurile serpuiesc pe verticala. */
  readonly climbCost: number
  /** Plafon de noduri pentru cautarea peste regiuni. */
  readonly maxRegionNodes: number
  /** Plafon de noduri pentru cautarea pe celule. Depasirea NU inseamna „imposibil". */
  readonly maxPathNodes: number
  /** Cate celule incap intr-un drum stocat. Peste atat, drumul se taie si se reia. */
  readonly maxPathCells: number
  /** Cate re-planificari se fac cel mult intr-un tick. Fara plafon, un zid nou le declanseaza pe toate deodata. */
  readonly maxReplansPerTick: number
  /** Cate tickuri asteapta un agent dupa un drum refuzat, inainte sa reincerce. */
  readonly replanCooldownTicks: number
  /** Cat de departe isi cauta un agent tinta urmatoare, in celule. */
  readonly agentGoalRadiusCells: number
  /** Cate incercari de tinta se fac intr-un tick. Margineste consumul de RNG. */
  readonly agentGoalAttempts: number
  /** Ce raza de blocuri de regiuni isi asigura un agent in jur. */
  readonly agentRegionRadiusBlocks: number

  // --- joburi (S16-19) ---
  /** La cate tickuri cere un pion liber de lucru. Decalat pe id, ca sa nu scaneze toti deodata. */
  readonly jobRescanTicks: number
  /** Cat de departe cauta un pion de lucru, in celule (Manhattan). Peste: PREA_DEPARTE, fara evaluare. */
  readonly jobScanRadiusCells: number
  /** Cate evaluari SCUMPE (loc de lucru, componenta) face o scanare cel mult. Ieftin > optim. */
  readonly jobScanMaxCandidates: number
  /** Ce raza de blocuri de regiuni isi asigura o desemnare sau o celula de zona la creare, ca sa poata fi evaluata. */
  readonly jobRegionRadiusBlocks: number
  /**
   * Cate tickuri evita un PION o tinta la care a renuntat din cauze care tin de el
   * (drum blocat de un ostil, drum peste buget). Racirea e pe perechea (pion, tinta).
   */
  readonly jobRetryTicks: number
  /**
   * Cate tickuri asteapta o DESEMNARE sau un ITEM dupa ce s-a dovedit ca n-are
   * niciun loc de lucru / niciun depozit. E o proprietate a tintei, nu a pionului,
   * deci se scrie pe ea; scurta, fiindca o sapatura vecina o poate deschide oricand.
   */
  readonly jobInfeasibleRetryTicks: number
  /** Cate refuzuri de drum tolereaza un job inainte sa se incheie. Fara plafon, pionul ramane parcat pe viata. */
  readonly jobMaxIncercari: number
  /** Cate tinte refuzate tine minte un pion deodata (racirea pe pereche). Cu una singura, doua tinte refuzate se sterg reciproc. */
  readonly jobAvoidSlots: number
  /** Cata munca cere sapatul unui voxel, in unitati. */
  readonly digWorkUnits: number
  /** Cate unitati de munca face un pion intr-un tick, la productivitate normala. */
  readonly workUnitsPerTick: number
  /** Cate desemnari incap. Plafon dur, refuz explicit. */
  readonly designationCapacity: number
  /** Cate niveluri de prioritate are o desemnare: 1..N. */
  readonly designationPriorityLevels: number
  /** Prioritatea unei desemnari cand jucatorul nu spune. */
  readonly designationPriorityDefault: number
  /** Cate niveluri de prioritate personala: 0 = niciodata, 1..N. */
  readonly personalPriorityLevels: number
  /** Prioritatea personala cu care se naste un pion, pe fiecare categorie. „Auto" = toti la normal. */
  readonly personalPriorityDefault: number

  // --- iteme, carat, zone (S16-19, taietura 2) ---
  /** Cate unitati incap intr-un morman. Doua mormane de acelasi fel pe o celula se contopesc pana aici. */
  readonly itemStackMax: number
  /** Cat ia un pion dintr-un morman intr-un drum. Sub `itemStackMax`, altfel n-ar lega niciodata. */
  readonly haulCarryMax: number
  /** Cata munca cere ridicatul unui morman, in unitati. */
  readonly haulPickupUnits: number
  /** Cata munca cere depusul, in unitati. */
  readonly haulDropUnits: number
  /** Cate celule LIBERE de depozit examineaza cel mult o cautare de destinatie, per zona. */
  readonly haulDestMaxCells: number
  /** Cat de departe de item se cauta o celula de depozit, in celule (Manhattan). */
  readonly haulDestRadiusCells: number
  /**
   * Cati pioni DISTINCTI pot tine acelasi morman deodata pe stratul CARAT —
   * carausi si constructori laolalta. Pana la taietura 3 era 1, scris literal in
   * cinci locuri: un morman de 75 hranea un singur drum o data, iar al doilea
   * pretendent astepta `jobRescanTicks`. Masurat: 3 constructori pe un morman,
   * 220–420 de tickuri; pe trei mormane, 112–120.
   */
  readonly itemClaimantsMax: number
  /**
   * Sub cat nu merita un drum pentru O PARTE dintr-o piesa. Un morman intra in
   * calcul daca are cel putin atat, sau cel putin cat mai lipseste; taiat la
   * cantitatea piesei (SCARA cere 5 — pragul ei e 5, nu 10). Rolul constantei e
   * sa margineasca numarul de cautari O(mormane) per job: cel mult
   * `cantitate / prag` ridicari. Fara ea, un perete s-ar aduna din 20 de mormane
   * de cate 1, cu 20 de drumuri si 20 de cautari.
   */
  readonly constructPickupMinUnits: number
  /** Cate mormane incap in lume. Plafon dur: cand e atins, sapatul refuza pana se cara ceva. */
  readonly itemCapacity: number
  /** Cate zone incap. */
  readonly zoneCapacity: number
  /** Cate celule de zona incap, in total. */
  readonly zoneCellCapacity: number
  /** Cate niveluri de prioritate are o zona: 1..N. */
  readonly zonePriorityLevels: number
  /** Prioritatea unei zone cand jucatorul nu spune. */
  readonly zonePriorityDefault: number
  /**
   * Ce lasa fiecare material la sapat, indexat cu `MaterialId`. In fisier e un
   * obiect cu numele materialelor solide drept chei; loader-ul REFUZA daca
   * lipseste vreunul — un material fara yield ar produce iteme de zero bucati pe
   * care pionii le-ar „cara" la nesfarsit.
   */
  readonly digYield: readonly DigYield[]
  /**
   * Kitul de constructie, indexat cu `PiesaId`. Intrarea 0 (`Piesa.NICIUNA`) e
   * santinela si e goala. In fisier e un obiect cu numele pieselor drept chei.
   */
  readonly piese: readonly SpecPiesa[]

  // --- nevoi (S16-19, taietura 3) ---
  //
  // Aritmetica e scrisa langa fiecare numar, si nu din politete: panoul a aratat
  // ca jumatate din constatarile critice ies exact din faptul ca nu era scrisa
  // nicaieri. La 20 de tickuri pe secunda, un ciclu de foame de 41.700 de
  // tickuri e ~35 de minute de joc.
  /** Valoarea „satul" a oricarei nevoi. Scara e comuna tuturor: miimi. */
  readonly nevoieMax: number
  /** La cate tickuri se scurg nevoile. Decalat pe id, ca scanarea de joburi. */
  readonly nevoiTicks: number
  /**
   * Defazarea initiala: nevoia pionului `id` porneste la
   * `nevoieMax − (id * fazaPas + nevoie * 311) % fazaSpan`. Vezi `nevoiaInitiala`.
   * `fazaSpan` trebuie sa lase valoarea PESTE prag — altfel pionii s-ar naste
   * deja flamanzi, ceea ce e alta forma a aceleiasi greseli ca zero-ul.
   */
  readonly nevoieFazaPas: number
  readonly nevoieFazaSpan: number
  /** Cate tickuri asteapta un pion inainte sa reincerce o nevoie pe care N-A putut s-o rezolve. */
  readonly nevoieRetryTicks: number
  /** Cat de departe isi cauta un pion mancare sau pat, in celule (Manhattan). */
  readonly nevoieScanRadiusCells: number
  /** Cate intrari PARCURGE cel mult o cautare de nevoie. Plafon pe intrari, nu pe potriviri. */
  readonly nevoieScanMaxCandidates: number
  /** Cate unitati mananca un pion dintr-o data. Sub `itemStackMax`. */
  readonly portieMancare: number
  /** Cate tickuri ii ia o portie. La 20 Hz, 60 = 3 secunde; o masa intreaga ~3 portii. */
  readonly mancatTicks: number
  /** Cati pioni pot manca deodata din acelasi morman. */
  readonly mancatoriPeMorman: number
  /**
   * Cat se reface ODIHNA la un tic de nevoie petrecut dormind. Calibrat pe CICLU,
   * nu pe tick: cu 40 pe tick (v1), somnul dura 25 de tickuri = 1,25 secunde, mai
   * putin decat drumul pana la pat — si tot aparatul zonei de dormit ar fi fost
   * continut mort.
   */
  readonly odihnaPeTicDeNevoie: number
  /** Randul de tabel al fiecarei nevoi, indexat cu `Nevoie`. */
  readonly nevoi: readonly SpecNevoie[]

  // --- stabilitate (S20-23, taietura 1) ---
  /**
   * Suportul unui voxel ASEZAT. Scade cu 1 la fiecare pas lateral; 0 = cade.
   *
   * Numarul nu e rotund din intamplare. O camera W×W cade iff ⌈W/2⌉ ≥ `suportMax`,
   * iar testul literal din PLAN §0.5 — pivnita 5×5 tine, 7×7 se prabuseste — il
   * fixeaza UNIC la 4. Consecinta pentru jucator se scrie „cel mult 3 celule de
   * orice sprijin", NU „mai lat de 5": masurat, 6×6 tine si 7×7 cade.
   */
  readonly suportMax: number
  /**
   * Raza pe care o grinda reintroduce un punct de sprijin (DESIGN §5.2).
   * VALIDAT dar NEFOLOSIT in taietura 1: grinda e o piesa de constructie si vine
   * cu blueprints. Sta aici ca sa nu se schimbe conventia cand se adauga.
   */
  readonly suportRazaGrinda: number

  // --- dispozitia (S16-19, taietura 3) ---
  //
  // O SINGURA scara: bara e 0..dispozitieMax, si valorile gandurilor sunt pe
  // aceeasi scara. Panoul a masurat ce se intampla cand nu e asa: valorile
  // copiate dintr-un research cu bara 0..100 intr-o bara 0..1000 faceau ca tinta
  // sa nu poata cobori sub 440, deci „refuza munca" (250) si „pleaca" (60) erau
  // cod mort din ziua in care se scriau. Invariantul de la finalul `parseRules`
  // verifica mecanic ca pragul cel mai de jos CHIAR se poate atinge.
  /** Valoarea maxima a barei de dispozitie. */
  readonly dispozitieMax: number
  /** De la ce porneste un pion, si fata de ce se aduna gandurile. */
  readonly dispozitieBaza: number
  /** La cate tickuri se misca bara spre tinta. Decalat pe id. */
  readonly dispozitieTicks: number
  /** Cat urca bara intr-un pas, si cat coboara. Asimetric: se pierde mai greu decat se castiga. */
  readonly dispozitieUrcare: number
  readonly dispozitieCoborare: number
  /** Sub atat, pionul refuza munca. */
  readonly dispozitiePragRefuz: number
  /** Sub atat (pe TINTA, nu pe bara), HUD-ul avertizeaza ca pionul urmeaza sa plece. */
  readonly dispozitiePragAvertisment: number
  /** Sub atat, pionul pleaca din asezare. */
  readonly dispozitiePragPlecare: number
  /** Multiplicatorul de productivitate la dispozitie 0 si la maxim, in miimi. */
  readonly multiplicatorMin: number
  readonly multiplicatorMax: number
  /** Cate ganduri de EVENIMENT tine minte un pion deodata. */
  readonly ganduriSloturi: number
  /** Valoarea si durata fiecarui gand, indexate cu `Gand`. Durata 0 = gand de STARE (nu se stocheaza). */
  readonly ganduri: readonly SpecGand[]
  /**
   * Cata foame astampara O UNITATE din fiecare fel de item, indexat cu `Item`.
   * 0 = necomestibil. PE UNITATE, nu pe morman: cu nutritie per morman, restul de
   * 15 dintr-o stiva de 75 ar hrani cat o portie intreaga — hrana din nimic, si
   * un numar pe care jucatorul nu-l poate traduce in mese.
   */
  readonly nutritie: readonly number[]
}

type FieldSpec = { min: number; max: number }

/** Campurile NUMERICE. `digYield`, `nevoi` si `nutritie` sunt tabele si se valideaza separat. */
const RULES_SPEC: Record<Exclude<keyof Rules, 'digYield' | 'piese' | 'nevoi' | 'nutritie' | 'ganduri'>, FieldSpec> = {
  agentCapacity: { min: 1, max: 100000 },
  agentStepMm: { min: 1, max: 100000 },
  ticksPerSecond: { min: 1, max: 240 },
  chunkResidentRadius: { min: 0, max: 64 },
  maxStepM: { min: 0, max: 4 },
  agentHeadroomM: { min: 1, max: 8 },
  stepCost: { min: 1, max: 10000 },
  allyStepPenalty: { min: 0, max: 100000 },
  climbCost: { min: 0, max: 100000 },
  maxRegionNodes: { min: 16, max: 1000000 },
  maxPathNodes: { min: 64, max: 10000000 },
  maxPathCells: { min: 8, max: 4096 },
  maxReplansPerTick: { min: 1, max: 10000 },
  replanCooldownTicks: { min: 0, max: 100000 },
  agentGoalRadiusCells: { min: 1, max: 1024 },
  agentGoalAttempts: { min: 1, max: 64 },
  agentRegionRadiusBlocks: { min: 0, max: 16 },
  jobRescanTicks: { min: 1, max: 10000 },
  jobScanRadiusCells: { min: 1, max: 4096 },
  jobScanMaxCandidates: { min: 1, max: 100000 },
  jobRegionRadiusBlocks: { min: 0, max: 16 },
  jobRetryTicks: { min: 0, max: 1000000 },
  jobInfeasibleRetryTicks: { min: 0, max: 1000000 },
  jobMaxIncercari: { min: 1, max: 255 },
  jobAvoidSlots: { min: 1, max: 64 },
  digWorkUnits: { min: 1, max: 1000000 },
  workUnitsPerTick: { min: 1, max: 1000000 },
  designationCapacity: { min: 1, max: 1000000 },
  designationPriorityLevels: { min: 1, max: 9 },
  designationPriorityDefault: { min: 1, max: 9 },
  personalPriorityLevels: { min: 1, max: 9 },
  personalPriorityDefault: { min: 0, max: 9 },
  itemStackMax: { min: 1, max: 1000000 },
  haulCarryMax: { min: 1, max: 1000000 },
  haulPickupUnits: { min: 1, max: 1000000 },
  haulDropUnits: { min: 1, max: 1000000 },
  haulDestMaxCells: { min: 1, max: 1000000 },
  haulDestRadiusCells: { min: 1, max: 4096 },
  itemClaimantsMax: { min: 1, max: 64 },
  constructPickupMinUnits: { min: 1, max: 1000000 },
  itemCapacity: { min: 1, max: 1000000 },
  zoneCapacity: { min: 1, max: 1000000 },
  zoneCellCapacity: { min: 1, max: 1000000 },
  zonePriorityLevels: { min: 1, max: 9 },
  zonePriorityDefault: { min: 1, max: 9 },
  nevoieMax: { min: 1, max: 1000000 },
  nevoiTicks: { min: 1, max: 1000000 },
  nevoieFazaPas: { min: 1, max: 1000000 },
  nevoieFazaSpan: { min: 1, max: 1000000 },
  nevoieRetryTicks: { min: 0, max: 1000000 },
  nevoieScanRadiusCells: { min: 1, max: 4096 },
  nevoieScanMaxCandidates: { min: 1, max: 100000 },
  portieMancare: { min: 1, max: 1000000 },
  mancatTicks: { min: 1, max: 1000000 },
  mancatoriPeMorman: { min: 1, max: 64 },
  odihnaPeTicDeNevoie: { min: 1, max: 1000000 },
  suportMax: { min: 1, max: 64 },
  suportRazaGrinda: { min: 1, max: 64 },
  dispozitieMax: { min: 1, max: 1000000 },
  dispozitieBaza: { min: 0, max: 1000000 },
  dispozitieTicks: { min: 1, max: 1000000 },
  dispozitieUrcare: { min: 1, max: 1000000 },
  dispozitieCoborare: { min: 1, max: 1000000 },
  dispozitiePragRefuz: { min: 0, max: 1000000 },
  dispozitiePragAvertisment: { min: 0, max: 1000000 },
  dispozitiePragPlecare: { min: 0, max: 1000000 },
  multiplicatorMin: { min: 1, max: 1000 },
  multiplicatorMax: { min: 1000, max: 100000 },
  ganduriSloturi: { min: 1, max: 64 },
}

/** Numele materialelor si ale felurilor de item, pentru fisierul de reguli. Liste ORDONATE, nu `Object.keys`. */
const NUME_MATERIALE: readonly (readonly [string, number])[] = [
  ['AER', Material.AER],
  ['ROCA', Material.ROCA],
  ['PAMANT', Material.PAMANT],
  ['IARBA', Material.IARBA],
  ['APA', Material.APA],
  ['LEMN_CONSTRUIT', Material.LEMN_CONSTRUIT],
  ['PIATRA_CONSTRUITA', Material.PIATRA_CONSTRUITA],
  ['MOLOZ', Material.MOLOZ],
]
const NUME_ITEME: readonly (readonly [string, number])[] = [
  ['PIATRA', Item.PIATRA],
  ['PAMANT', Item.PAMANT],
  ['LEMN', Item.LEMN],
  ['HRANA', Item.HRANA],
]
const NUME_NEVOI: readonly (readonly [string, number])[] = [
  ['FOAME', Nevoie.FOAME],
  ['ODIHNA', Nevoie.ODIHNA],
]
const NUME_PIESE: readonly (readonly [string, number])[] = [
  ['PERETE', Piesa.PERETE],
  ['PODEA', Piesa.PODEA],
  ['SCARA', Piesa.SCARA],
]
const MAX_YIELD = 10000
const MAX_LUCRU = 1000000

/**
 * Tabelul `piese` din fisier → tablou indexat cu `PiesaId`.
 *
 * Santinela `Piesa.NICIUNA` primeste o intrare GOALA, si nu se poate numi in
 * fisier: e absenta unei piese, nu o piesa.
 */
function parsePiese(raw: unknown): Outcome<SpecPiesa[]> {
  // Forma deja parsata (tablou indexat cu PiesaId), cum e `DEFAULT_RULES`: se
  // intoarce in forma de fisier si se valideaza cu exact aceleasi reguli.
  if (Array.isArray(raw)) {
    if (raw.length !== NUME_PIESE.length + 1) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'piese', lungime: raw.length, asteptat: NUME_PIESE.length + 1 })
    }
    const obj: Record<string, unknown> = {}
    for (const [nume, id] of NUME_PIESE) {
      const e = raw[id] as SpecPiesa | undefined
      const mat = NUME_MATERIALE.find(([, m]) => m === e?.material)
      obj[nume] = { material: mat ? mat[0] : String(e?.material), cantitate: e?.cantitate, lucru: e?.lucru }
    }
    raw = obj
  }
  if (typeof raw !== 'object' || raw === null) {
    return refuse(Reason.LIPSA_MATERIAL, { camp: 'piese', asteptat: 'obiect', primit: typeof raw })
  }
  const obj = raw as Record<string, unknown>
  const cunoscute = NUME_PIESE.map(([n]) => n)
  for (const key of Object.keys(obj).sort()) {
    if (!cunoscute.includes(key)) return refuse(Reason.COMANDA_NECUNOSCUTA, { camp: `piese.${key}`, cunoscute: cunoscute.join(', ') })
  }
  // Santinela: intrarea 0 e absenta unei piese, nu o piesa. AER e materialul ei,
  // fiindca e singurul care nu se poate zidi.
  const out: SpecPiesa[] = [{ material: Material.AER, cantitate: 0, lucru: 0 }]
  for (const [nume, id] of NUME_PIESE) {
    const v = obj[nume]
    if (v === undefined) return refuse(Reason.LIPSA_MATERIAL, { camp: `piese.${nume}` })
    if (typeof v !== 'object' || v === null) return refuse(Reason.LIPSA_MATERIAL, { camp: `piese.${nume}`, asteptat: 'obiect {material, cantitate, lucru}' })
    const e = v as Record<string, unknown>
    const mat = NUME_MATERIALE.find(([n]) => n === e.material)
    if (!mat) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `piese.${nume}.material`, valoare: String(e.material), cunoscute: NUME_MATERIALE.map(([n]) => n).join(', ') })
    }
    if (!isSolid(mat[1])) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `piese.${nume}.material`, valoare: mat[0], motiv: 'o piesa nu poate fi facuta din aer sau apa' })
    }
    const c = e.cantitate
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > MAX_YIELD) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `piese.${nume}.cantitate`, valoare: String(c), min: 1, max: MAX_YIELD })
    }
    const l = e.lucru
    if (typeof l !== 'number' || !Number.isInteger(l) || l < 1 || l > MAX_LUCRU) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `piese.${nume}.lucru`, valoare: String(l), min: 1, max: MAX_LUCRU })
    }
    // `mat[1]` vine din `NUME_MATERIALE`, care e construit din `Material.*`: cheia
    // a fost deja cautata in tabelul ala, deci ingustarea e sigura.
    out[id] = { material: mat[1] as MaterialId, cantitate: c, lucru: l }
  }
  return accept(out)
}

/**
 * Tabelul `nevoi` din fisier → tablou indexat cu `Nevoie`. Fiecare nevoie
 * trebuie sa aiba o intrare: una lipsa ar insemna o nevoie care nu scade
 * niciodata, adica un sistem intreg mort in tacere.
 *
 * Accepta si forma deja parsata (tablou), ca `DEFAULT_RULES`, cu aceleasi reguli.
 */
function parseNevoi(raw: unknown, nevoieMax: number): Outcome<SpecNevoie[]> {
  if (Array.isArray(raw)) {
    if (raw.length !== NUME_NEVOI.length) return refuse(Reason.VALOARE_INVALIDA, { camp: 'nevoi', lungime: raw.length, asteptat: NUME_NEVOI.length })
    const obj: Record<string, unknown> = {}
    for (const [nume, id] of NUME_NEVOI) obj[nume] = raw[id]
    raw = obj
  }
  if (typeof raw !== 'object' || raw === null) {
    return refuse(Reason.LIPSA_MATERIAL, { camp: 'nevoi', asteptat: 'obiect', primit: typeof raw })
  }
  const obj = raw as Record<string, unknown>
  const cunoscute = NUME_NEVOI.map(([n]) => n)
  for (const key of Object.keys(obj).sort()) {
    if (!cunoscute.includes(key)) return refuse(Reason.COMANDA_NECUNOSCUTA, { camp: `nevoi.${key}`, cunoscute: cunoscute.join(', ') })
  }
  const out: SpecNevoie[] = []
  for (const [nume] of NUME_NEVOI) {
    const v = obj[nume]
    if (typeof v !== 'object' || v === null) return refuse(Reason.LIPSA_MATERIAL, { camp: `nevoi.${nume}`, asteptat: 'obiect' })
    const e = v as Record<string, unknown>
    for (const key of Object.keys(e).sort()) {
      if (key !== 'scurgere' && key !== 'prag' && key !== 'pragCritic') {
        return refuse(Reason.COMANDA_NECUNOSCUTA, { camp: `nevoi.${nume}.${key}`, cunoscute: 'scurgere, prag, pragCritic' })
      }
    }
    const spec: Record<string, number> = {}
    for (const key of ['scurgere', 'prag', 'pragCritic'] as const) {
      const n = e[key]
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
        return refuse(Reason.VALOARE_INVALIDA, { camp: `nevoi.${nume}.${key}`, asteptat: 'intreg >= 0', primit: String(n) })
      }
      spec[key] = n
    }
    // Ordinea pragurilor e o LEGE, nu o preferinta: cu `pragCritic >= prag`,
    // „prefera" n-ar mai exista ca stare distincta si totul s-ar juca pe calea
    // cu intreruperi. Cu `prag > nevoieMax`, pionul ar fi infometat din nastere.
    if (!(spec.pragCritic! < spec.prag!)) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `nevoi.${nume}.pragCritic`, motiv: 'pragul critic trebuie sa fie STRICT sub prag', pragCritic: spec.pragCritic!, prag: spec.prag! })
    }
    if (spec.prag! > nevoieMax) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `nevoi.${nume}.prag`, valoare: spec.prag!, max: nevoieMax })
    }
    if (spec.scurgere! < 1) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `nevoi.${nume}.scurgere`, motiv: 'o nevoie care nu scade niciodata e un sistem mort', valoare: spec.scurgere! })
    }
    out.push({ scurgere: spec.scurgere!, prag: spec.prag!, pragCritic: spec.pragCritic! })
  }
  return accept(out)
}

const NUME_GANDURI: readonly (readonly [string, number])[] = [
  ['FLAMAND', Gand.FLAMAND],
  ['INFOMETAT', Gand.INFOMETAT],
  ['OBOSIT', Gand.OBOSIT],
  ['EPUIZAT', Gand.EPUIZAT],
  ['DORMIT_PE_JOS', Gand.DORMIT_PE_JOS],
  ['OPTIMISM_INITIAL', Gand.OPTIMISM_INITIAL],
]

/** Tabelul `ganduri` din fisier → tablou indexat cu `Gand`. Slotul 0 (NICIUNUL) e mereu inert. */
function parseGanduri(raw: unknown): Outcome<SpecGand[]> {
  if (Array.isArray(raw)) {
    if (raw.length !== GANDURI) return refuse(Reason.VALOARE_INVALIDA, { camp: 'ganduri', lungime: raw.length, asteptat: GANDURI })
    const obj: Record<string, unknown> = {}
    for (const [nume, id] of NUME_GANDURI) obj[nume] = raw[id]
    raw = obj
  }
  if (typeof raw !== 'object' || raw === null) {
    return refuse(Reason.LIPSA_MATERIAL, { camp: 'ganduri', asteptat: 'obiect', primit: typeof raw })
  }
  const obj = raw as Record<string, unknown>
  const cunoscute = NUME_GANDURI.map(([n]) => n)
  for (const key of Object.keys(obj).sort()) {
    if (!cunoscute.includes(key)) return refuse(Reason.COMANDA_NECUNOSCUTA, { camp: `ganduri.${key}`, cunoscute: cunoscute.join(', ') })
  }
  const out: SpecGand[] = new Array<SpecGand>(GANDURI).fill({ valoare: 0, durata: 0 })
  for (const [nume, id] of NUME_GANDURI) {
    const v = obj[nume]
    if (typeof v !== 'object' || v === null) return refuse(Reason.LIPSA_MATERIAL, { camp: `ganduri.${nume}`, asteptat: 'obiect' })
    const e = v as Record<string, unknown>
    for (const key of Object.keys(e).sort()) {
      if (key !== 'valoare' && key !== 'durata') {
        return refuse(Reason.COMANDA_NECUNOSCUTA, { camp: `ganduri.${nume}.${key}`, cunoscute: 'valoare, durata' })
      }
    }
    const valoare = e.valoare
    const durata = e.durata
    if (typeof valoare !== 'number' || !Number.isInteger(valoare)) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `ganduri.${nume}.valoare`, asteptat: 'intreg', primit: String(valoare) })
    }
    if (typeof durata !== 'number' || !Number.isInteger(durata) || durata < 0) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `ganduri.${nume}.durata`, asteptat: 'intreg >= 0', primit: String(durata) })
    }
    out[id] = { valoare, durata }
  }
  return accept(out)
}

/** Tabelul `nutritie` din fisier → tablou indexat cu `Item`. Fiecare fel trebuie sa aiba o intrare. */
function parseNutritie(raw: unknown): Outcome<number[]> {
  if (Array.isArray(raw)) {
    if (raw.length !== NUME_ITEME.length) return refuse(Reason.VALOARE_INVALIDA, { camp: 'nutritie', lungime: raw.length, asteptat: NUME_ITEME.length })
    const obj: Record<string, unknown> = {}
    for (const [nume, id] of NUME_ITEME) obj[nume] = raw[id]
    raw = obj
  }
  if (typeof raw !== 'object' || raw === null) {
    return refuse(Reason.LIPSA_MATERIAL, { camp: 'nutritie', asteptat: 'obiect', primit: typeof raw })
  }
  const obj = raw as Record<string, unknown>
  const cunoscute = NUME_ITEME.map(([n]) => n)
  for (const key of Object.keys(obj).sort()) {
    if (!cunoscute.includes(key)) return refuse(Reason.COMANDA_NECUNOSCUTA, { camp: `nutritie.${key}`, cunoscute: cunoscute.join(', ') })
  }
  const out: number[] = []
  for (const [nume] of NUME_ITEME) {
    const v = obj[nume]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_YIELD) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `nutritie.${nume}`, asteptat: `intreg intre 0 si ${MAX_YIELD}`, primit: String(v) })
    }
    out.push(v)
  }
  return accept(out)
}

/**
 * Tabelul `digYield` din fisier → tablou indexat cu `MaterialId`. Fiecare
 * material SOLID trebuie sa aiba o intrare; AER si APA nu au voie sa aiba.
 */
function parseDigYield(raw: unknown): Outcome<DigYield[]> {
  // Forma deja parsata (un tablou indexat cu MaterialId), cum e `DEFAULT_RULES`:
  // se valideaza cu aceleasi reguli ca fisierul.
  if (Array.isArray(raw)) {
    if (raw.length !== NUME_MATERIALE.length) return refuse(Reason.VALOARE_INVALIDA, { camp: 'digYield', lungime: raw.length, asteptat: NUME_MATERIALE.length })
    const obj: Record<string, unknown> = {}
    for (const [nume, id] of NUME_MATERIALE) {
      const e = raw[id] as { fel?: number; cantitate?: number } | undefined
      if (!isSolid(id)) {
        if (e && e.cantitate !== 0) return refuse(Reason.VALOARE_INVALIDA, { camp: `digYield.${nume}`, motiv: 'materialul nu e solid, nu se sapa' })
        continue
      }
      const fel = NUME_ITEME.find(([, k]) => k === e?.fel)
      obj[nume] = { fel: fel ? fel[0] : String(e?.fel), cantitate: e?.cantitate }
    }
    raw = obj
  }
  if (typeof raw !== 'object' || raw === null) {
    return refuse(Reason.LIPSA_MATERIAL, { camp: 'digYield', asteptat: 'obiect', primit: typeof raw })
  }
  const obj = raw as Record<string, unknown>
  const cunoscute = NUME_MATERIALE.map(([n]) => n)
  for (const key of Object.keys(obj).sort()) {
    if (!cunoscute.includes(key)) return refuse(Reason.COMANDA_NECUNOSCUTA, { camp: `digYield.${key}`, cunoscute: cunoscute.join(', ') })
  }
  const out: DigYield[] = []
  for (const [nume, id] of NUME_MATERIALE) {
    const v = obj[nume]
    if (!isSolid(id)) {
      if (v !== undefined) return refuse(Reason.VALOARE_INVALIDA, { camp: `digYield.${nume}`, motiv: 'materialul nu e solid, nu se sapa' })
      out[id] = { fel: 0, cantitate: 0 }
      continue
    }
    if (v === undefined) return refuse(Reason.LIPSA_MATERIAL, { camp: `digYield.${nume}` })
    if (typeof v !== 'object' || v === null) return refuse(Reason.LIPSA_MATERIAL, { camp: `digYield.${nume}`, asteptat: 'obiect {fel, cantitate}' })
    const e = v as Record<string, unknown>
    const fel = NUME_ITEME.find(([n]) => n === e.fel)
    if (!fel) return refuse(Reason.VALOARE_INVALIDA, { camp: `digYield.${nume}.fel`, valoare: String(e.fel), cunoscute: NUME_ITEME.map(([n]) => n).join(', ') })
    const c = e.cantitate
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > MAX_YIELD) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `digYield.${nume}.cantitate`, valoare: String(c), min: 1, max: MAX_YIELD })
    }
    out[id] = { fel: fel[1], cantitate: c }
  }
  return accept(out)
}

/**
 * Valideaza un obiect brut ca `Rules`. Refuza campurile necunoscute — un camp
 * scris gresit intr-un mod ar trece tacut altfel si ar folosi valoarea implicita.
 */
export function parseRules(raw: unknown): Outcome<Rules> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return refuse(Reason.LIPSA_MATERIAL, { camp: '(radacina)', asteptat: 'obiect', primit: typeof raw })
  }
  const obj = raw as Record<string, unknown>

  // determinism-ok: RULES_SPEC e un literal cu chei-sir; ordinea de inserare e
  // garantata de spec si nu depinde de starea rularii.
  const known = Object.keys(RULES_SPEC)
  for (const key of Object.keys(obj).sort()) {
    if (key === 'digYield' || key === 'piese' || key === 'nevoi' || key === 'nutritie' || key === 'ganduri') continue
    if (!known.includes(key)) {
      return refuse(Reason.COMANDA_NECUNOSCUTA, { camp: key, cunoscute: [...known, 'digYield', 'piese', 'nevoi', 'nutritie', 'ganduri'].join(', ') })
    }
  }

  const out: Record<string, number | readonly DigYield[] | readonly SpecPiesa[] | readonly SpecNevoie[] | readonly SpecGand[] | readonly number[]> = {}
  for (const key of known) {
    const spec = RULES_SPEC[key as keyof typeof RULES_SPEC]
    const v = obj[key]
    if (v === undefined) {
      return refuse(Reason.LIPSA_MATERIAL, { camp: key })
    }
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      return refuse(Reason.LIPSA_MATERIAL, { camp: key, asteptat: 'intreg', primit: String(v) })
    }
    if (v < spec.min || v > spec.max) {
      return refuse(Reason.CAPACITATE_DEPASITA, { camp: key, valoare: v, min: spec.min, max: spec.max })
    }
    out[key] = v
  }
  if (obj.digYield === undefined) return refuse(Reason.LIPSA_MATERIAL, { camp: 'digYield' })
  const yieldOut = parseDigYield(obj.digYield)
  if (!yieldOut.ok) return yieldOut
  out.digYield = yieldOut.value
  if (obj.piese === undefined) return refuse(Reason.LIPSA_MATERIAL, { camp: 'piese' })
  const pieseOut = parsePiese(obj.piese)
  if (!pieseOut.ok) return pieseOut
  out.piese = pieseOut.value
  if (obj.nevoi === undefined) return refuse(Reason.LIPSA_MATERIAL, { camp: 'nevoi' })
  const nevoiOut = parseNevoi(obj.nevoi, out.nevoieMax as number)
  if (!nevoiOut.ok) return nevoiOut
  out.nevoi = nevoiOut.value
  if (obj.nutritie === undefined) return refuse(Reason.LIPSA_MATERIAL, { camp: 'nutritie' })
  const nutritieOut = parseNutritie(obj.nutritie)
  if (!nutritieOut.ok) return nutritieOut
  out.nutritie = nutritieOut.value
  if (obj.ganduri === undefined) return refuse(Reason.LIPSA_MATERIAL, { camp: 'ganduri' })
  const ganduriOut = parseGanduri(obj.ganduri)
  if (!ganduriOut.ok) return ganduriOut
  out.ganduri = ganduriOut.value
  const r = out as unknown as Rules

  // Invarianti INTRE campuri. Fiecare e o lege de care depinde corectitudinea,
  // nu o preferinta, si fiecare a fost gasita de cineva care a cautat esecul.
  //
  // Acoperirea de regiuni e leneasa: un pion isi acopera `agentRegionRadiusBlocks`
  // in jurul lui, o desemnare `jobRegionRadiusBlocks` in jurul ei, iar cele doua
  // discuri trebuie sa se ATINGA pentru orice desemnare din raza de scanare —
  // altfel intre ele raman blocuri calculate dar nelegate, componentele sunt
  // diferite, si desemnarea e INACCESIBILA din motivul gresit, pe veci
  // (hoinareala nu iese niciodata din acoperire, deci golul nu se inchide singur).
  //
  // Aritmetica, masurata pe graf (tests/joburi.test.ts): un disc de raza r
  // LEAGA blocurile pana la r si isi scrie muchiile pana la r + 1, fiindca
  // legarea unui bloc ii calculeaza si ii conecteaza vecinii. Doua discuri la D
  // blocuri sunt legate daca muchiile lor ajung in acelasi bloc: D ≤ a + j + 2.
  // Raza de scanare de 96 de celule inseamna D ≤ 6, deci 2 + 2 + 2 = 6 ajunge.
  //
  // Zonele pictate primesc acelasi disc (`picteazaZona` cheama `ensureArea`),
  // iar coridorul item → celula de depozit acopera lantul pion → item → zona.
  const blocuriDeScan = Math.ceil(r.jobScanRadiusCells / REGION_SIZE)
  if (r.agentRegionRadiusBlocks + r.jobRegionRadiusBlocks + 2 < blocuriDeScan) {
    return refuse(Reason.VALOARE_INVALIDA, {
      camp: 'jobRegionRadiusBlocks',
      motiv: 'discul agentului si al desemnarii nu se ating pe toata raza de scanare',
      agentRegionRadiusBlocks: r.agentRegionRadiusBlocks,
      jobRegionRadiusBlocks: r.jobRegionRadiusBlocks,
      necesar: blocuriDeScan - 2 - r.agentRegionRadiusBlocks,
    })
  }
  // Acelasi invariant, pentru lantul de carat: marfa zace intr-un loc deja
  // acoperit (a sapat sau a umblat cineva acolo — deci discul unui pion sau al
  // unei desemnari, cel mai mic dintre ele), iar celula de depozit isi ia discul
  // la pictare. Ca sa fie in aceeasi componenta cand chiar exista drum, cele doua
  // discuri trebuie sa se atinga pe toata raza in care se cauta o destinatie.
  // Fara asta, singurul leac ar fi un coridor intins la fiecare evaluare — masurat,
  // aia face acoperirea sa creasca nemarginit cu vechimea coloniei (K05).
  const blocuriDeDestinatie = Math.ceil(r.haulDestRadiusCells / REGION_SIZE)
  const discMic = Math.min(r.agentRegionRadiusBlocks, r.jobRegionRadiusBlocks)
  if (discMic + r.jobRegionRadiusBlocks + 2 < blocuriDeDestinatie) {
    return refuse(Reason.VALOARE_INVALIDA, {
      camp: 'haulDestRadiusCells',
      motiv: 'discul locului marfii si al depozitului nu se ating pe toata raza de cautare a destinatiei',
      valoare: r.haulDestRadiusCells,
      maxim: (discMic + r.jobRegionRadiusBlocks + 2) * REGION_SIZE,
    })
  }
  if (r.designationPriorityDefault > r.designationPriorityLevels) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'designationPriorityDefault', valoare: r.designationPriorityDefault, max: r.designationPriorityLevels })
  }
  if (r.personalPriorityDefault > r.personalPriorityLevels) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'personalPriorityDefault', valoare: r.personalPriorityDefault, max: r.personalPriorityLevels })
  }
  if (r.zonePriorityDefault > r.zonePriorityLevels) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'zonePriorityDefault', valoare: r.zonePriorityDefault, max: r.zonePriorityLevels })
  }
  // Un pion nu ia mai mult decat incape intr-un morman: altfel destinatia n-ar
  // putea primi niciodata toata mana, si `haulCarryMax` n-ar lega nimic.
  if (r.haulCarryMax > r.itemStackMax) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'haulCarryMax', valoare: r.haulCarryMax, max: r.itemStackMax })
  }
  // Un prag peste stiva n-ar lasa niciun morman sa fie sursa: acelasi argument.
  if (r.constructPickupMinUnits > r.itemStackMax) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'constructPickupMinUnits', valoare: r.constructPickupMinUnits, max: r.itemStackMax })
  }
  for (const y of r.digYield) {
    if (y.cantitate > r.itemStackMax) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'digYield', motiv: 'un voxel nu poate da mai mult decat incape intr-un morman', valoare: y.cantitate, max: r.itemStackMax })
    }
  }
  // O piesa costa EXACT cat da inapoi la sapat. Cele doua tabele nu se privesc,
  // iar diferenta dintre ele e un ciclu de tiparit materie: masurat pe codul de
  // dinaintea invariantului, `fill PIATRA_CONSTRUITA` + `dig` duce marfa din lume
  // de la 0 la 20. Cu o piesa la 10, ciclul produce 10 unitati pe tura, la
  // nesfarsit.
  //
  // EGALITATE stricta, nu `>=`: o deconstructie cu pierdere e o decizie de joc
  // care trebuie sa-si scrie cifra in continut, nu sa iasa din doua tabele care
  // nu se uita unul la altul.
  for (const [nume, id] of NUME_PIESE) {
    const p = r.piese[id]!
    const y = r.digYield[p.material]!
    if (p.cantitate !== y.cantitate) {
      return refuse(Reason.VALOARE_INVALIDA, {
        camp: `piese.${nume}.cantitate`,
        valoare: p.cantitate,
        asteptat: y.cantitate,
        motiv: 'o piesa trebuie sa coste exact cat da inapoi la sapat, altfel zidirea si sapatul tiparesc materie',
      })
    }
    // Si trebuie sa incapa intr-o mana: jobul de constructie are UN pas de
    // ridicat, deci o piesa mai scumpa decat `haulCarryMax` n-ar putea fi
    // terminata niciodata — acelasi argument ca la `haulCarryMax`/`itemStackMax`.
    if (p.cantitate > r.haulCarryMax) {
      return refuse(Reason.VALOARE_INVALIDA, {
        camp: `piese.${nume}.cantitate`,
        valoare: p.cantitate,
        max: r.haulCarryMax,
        motiv: 'o piesa care nu incape intr-o mana n-ar putea fi carata la santier',
      })
    }
  }
  // Grinda REINTRODUCE un punct de sprijin (DESIGN §5.2), deci raza ei nu poate
  // fi sub plafonul obisnuit — ar micsora tacut regula in loc s-o largeasca.
  // `RULES_SPEC` le valideaza independent, deci fara invariantul asta constanta
  // poate fi pusa sub plafon si nimic nu se inroseste. Platit acum, ca sa nu
  // surprinda cand grinda aterizeaza.
  if (r.suportRazaGrinda < r.suportMax) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'suportRazaGrinda', valoare: r.suportRazaGrinda, min: r.suportMax, motiv: 'o grinda nu poate sprijini mai putin decat sprijina solul' })
  }
  // O portie trebuie sa incapa intr-un morman, altfel n-ar lega niciodata —
  // acelasi argument ca la `haulCarryMax`.
  if (r.portieMancare > r.itemStackMax) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'portieMancare', valoare: r.portieMancare, max: r.itemStackMax })
  }
  // Cel putin un fel COMESTIBIL. Un tabel de nutritie cu toate zero trece
  // fiecare validare de camp si produce o lume in care foamea nu se poate
  // satisface niciodata: pionii ar cauta, n-ar gasi, si ar muri de foame in
  // tacere — cu toate regulile „valide".
  if (r.nutritie.length !== ITEME) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'nutritie', lungime: r.nutritie.length, asteptat: ITEME })
  }
  if (!r.nutritie.some((n) => n > 0)) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'nutritie', motiv: 'niciun fel de item nu e comestibil' })
  }
  if (r.nevoi.length !== NEVOI) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'nevoi', lungime: r.nevoi.length, asteptat: NEVOI })
  }
  // Defazarea initiala nu are voie sa nasca pioni sub prag: `nevoiaInitiala`
  // intoarce cel putin `nevoieMax − (fazaSpan − 1)`. Fara invariantul asta,
  // o valoare prea mare a lui `fazaSpan` e alta forma a greselii cu zero-ul —
  // colonia porneste flamanda, si nimic nu spune de ce.
  const celMaiJos = r.nevoieMax - (r.nevoieFazaSpan - 1)
  for (let n = 0; n < r.nevoi.length; n++) {
    if (celMaiJos <= r.nevoi[n]!.prag) {
      return refuse(Reason.VALOARE_INVALIDA, {
        camp: 'nevoieFazaSpan',
        motiv: 'defazarea initiala ar naste pioni deja sub prag',
        nevoie: NUME_NEVOI[n]![0],
        celMaiJos,
        prag: r.nevoi[n]!.prag,
        max: r.nevoieMax - r.nevoi[n]!.prag,
      })
    }
  }
  // Ordinea pragurilor de dispozitie. Fiecare treapta trebuie sa existe ca stare
  // distincta, si toate sub baza — altfel un pion nascut normal ar refuza munca.
  if (!(r.dispozitiePragPlecare < r.dispozitiePragAvertisment && r.dispozitiePragAvertisment < r.dispozitiePragRefuz && r.dispozitiePragRefuz < r.dispozitieBaza && r.dispozitieBaza <= r.dispozitieMax)) {
    return refuse(Reason.VALOARE_INVALIDA, {
      camp: 'dispozitiePraguri',
      motiv: 'pragurile trebuie sa fie strict crescatoare si sub baza',
      plecare: r.dispozitiePragPlecare,
      avertisment: r.dispozitiePragAvertisment,
      refuz: r.dispozitiePragRefuz,
      baza: r.dispozitieBaza,
      max: r.dispozitieMax,
    })
  }
  if (r.multiplicatorMin > 1000 || r.multiplicatorMax < 1000) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'multiplicator', motiv: 'intervalul trebuie sa contina 1000 (productivitate normala)', min: r.multiplicatorMin, max: r.multiplicatorMax })
  }
  // Podeaua de munca e pe REZULTAT: `max(1, floor(w * m / 1000))`. Ca ea sa nu
  // fie nevoie sa se declanseze niciodata la continut legal, cel mai prost caz
  // trebuie sa dea macar o unitate. Cu podeaua pe FACTOR, un continut perfect
  // valid (`workUnitsPerTick: 1`, minimul din RULES_SPEC) dadea 0 unitati pe
  // tick: jobul nu se incheia niciodata, tinta ramanea rezervata pentru toata
  // colonia, si niciun plafon nu se incrementa.
  if (r.workUnitsPerTick * r.multiplicatorMin < 1000) {
    return refuse(Reason.VALOARE_INVALIDA, {
      camp: 'workUnitsPerTick',
      motiv: 'la productivitate minima un pion n-ar face nicio unitate pe tick',
      workUnitsPerTick: r.workUnitsPerTick,
      multiplicatorMin: r.multiplicatorMin,
      necesar: Math.ceil(1000 / r.multiplicatorMin),
    })
  }
  if (r.ganduri.length !== GANDURI) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'ganduri', lungime: r.ganduri.length, asteptat: GANDURI })
  }
  // CATALOGUL TREBUIE SA POATA ATINGE PRAGUL CEL MAI DE JOS.
  //
  // Asta e invariantul care inchide clasa de greseli pe care panoul a gasit-o:
  // valori de gand copiate dintr-o alta scara fac treptele 2 si 3 cod mort din
  // ziua in care se scriu, si nicio asertiune obisnuita nu observa, fiindca tot
  // ce e acolo pare valid.
  //
  // Minimul REAL, nu suma tuturor negativelor: pentru fiecare nevoie, gandul de
  // prag si cel critic se EXCLUD, deci conteaza doar cel mai negativ dintre ele.
  let minim = r.dispozitieBaza
  for (let n = 0; n < GAND_PENTRU_NEVOIE.length; n++) {
    const par = GAND_PENTRU_NEVOIE[n]!
    minim += Math.min(0, r.ganduri[par.prag]!.valoare, r.ganduri[par.critic]!.valoare)
  }
  const dinNevoi = new Set<number>()
  for (const par of GAND_PENTRU_NEVOIE) { dinNevoi.add(par.prag); dinNevoi.add(par.critic) }
  for (let g = 1; g < GANDURI; g++) {
    if (dinNevoi.has(g)) continue
    minim += Math.min(0, r.ganduri[g]!.valoare)
  }
  if (minim > r.dispozitiePragPlecare) {
    return refuse(Reason.VALOARE_INVALIDA, {
      camp: 'ganduri',
      motiv: 'catalogul nu poate cobori dispozitia pana la pragul de plecare: treptele de jos ar fi cod mort',
      minimAtins: minim,
      pragPlecare: r.dispozitiePragPlecare,
    })
  }
  // Un gand de STARE nu se stocheaza, deci `durata` lui n-are niciun cititor:
  // scrisa, ar fi o promisiune pe care nimic n-o tine.
  for (const par of GAND_PENTRU_NEVOIE) {
    for (const g of [par.prag, par.critic]) {
      if (r.ganduri[g]!.durata !== 0) {
        return refuse(Reason.VALOARE_INVALIDA, { camp: `ganduri[${g}].durata`, motiv: 'gand de STARE: se recalculeaza din nevoi, deci durata n-are cititor', valoare: r.ganduri[g]!.durata })
      }
    }
  }
  for (let g = 1; g < GANDURI; g++) {
    if (dinNevoi.has(g)) continue
    if (r.ganduri[g]!.durata === 0) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `ganduri[${g}].durata`, motiv: 'gand de EVENIMENT fara durata: n-ar fi activ niciun tick' })
    }
  }

  // Acelasi invariant de acoperire ca la desemnari si la carat, pentru lantul
  // pion → mancare / pat. Fara el, singurul leac ar fi un coridor intins la
  // fiecare cautare — adica K05 pe a treia usa.
  const blocuriDeNevoie = Math.ceil(r.nevoieScanRadiusCells / REGION_SIZE)
  if (r.agentRegionRadiusBlocks + r.jobRegionRadiusBlocks + 2 < blocuriDeNevoie) {
    return refuse(Reason.VALOARE_INVALIDA, {
      camp: 'nevoieScanRadiusCells',
      motiv: 'discul pionului si al tintei de nevoie nu se ating pe toata raza de cautare',
      valoare: r.nevoieScanRadiusCells,
      maxim: (r.agentRegionRadiusBlocks + r.jobRegionRadiusBlocks + 2) * REGION_SIZE,
    })
  }

  return accept(r)
}

/** Reguli implicite, folosite doar de teste si de harness cand nu se da un fisier. */
export const DEFAULT_RULES: Rules = {
  agentCapacity: 64,
  agentStepMm: 250,
  ticksPerSecond: 20,
  chunkResidentRadius: 11,
  maxStepM: 1,
  agentHeadroomM: 2,
  stepCost: 100,
  allyStepPenalty: 175,
  climbCost: 60,
  maxRegionNodes: 4000,
  maxPathNodes: 20000,
  maxPathCells: 192,
  maxReplansPerTick: 4,
  replanCooldownTicks: 40,
  agentGoalRadiusCells: 24,
  agentGoalAttempts: 6,
  agentRegionRadiusBlocks: 2,
  jobRescanTicks: 30,
  jobScanRadiusCells: 96,
  jobScanMaxCandidates: 256,
  jobRegionRadiusBlocks: 2,
  jobRetryTicks: 600,
  jobInfeasibleRetryTicks: 100,
  jobMaxIncercari: 3,
  jobAvoidSlots: 4,
  digWorkUnits: 400,
  workUnitsPerTick: 10,
  designationCapacity: 4096,
  designationPriorityLevels: 5,
  designationPriorityDefault: 3,
  personalPriorityLevels: 3,
  personalPriorityDefault: 1,
  itemStackMax: 75,
  haulCarryMax: 50,
  haulPickupUnits: 100,
  haulDropUnits: 100,
  haulDestMaxCells: 512,
  haulDestRadiusCells: 96,
  itemClaimantsMax: 4,
  constructPickupMinUnits: 10,
  itemCapacity: 4096,
  zoneCapacity: 256,
  zoneCellCapacity: 4096,
  zonePriorityLevels: 5,
  zonePriorityDefault: 3,
  // Indexat cu MaterialId: AER, ROCA, PAMANT, IARBA, APA, LEMN_CONSTRUIT, PIATRA_CONSTRUITA.
  digYield: [
    { fel: 0, cantitate: 0 },
    { fel: Item.PIATRA, cantitate: 20 },
    { fel: Item.PAMANT, cantitate: 10 },
    { fel: Item.PAMANT, cantitate: 10 },
    { fel: 0, cantitate: 0 },
    { fel: Item.LEMN, cantitate: 5 },
    { fel: Item.PIATRA, cantitate: 20 },
    // Molozul da inapoi jumatate din ce ar fi dat roca: prabusirea costa munca,
    // nu materie. Si se sapa mai repede — vezi `digWorkUnitsMoloz`.
    { fel: Item.PIATRA, cantitate: 10 },
  ],
  // Kitul de constructie, indexat cu `PiesaId`. Intrarea 0 e santinela.
  // `cantitate` e legata de `digYield` printr-un invariant: vezi `parseRules`.
  piese: [
    { material: Material.AER, cantitate: 0, lucru: 0 },
    { material: Material.PIATRA_CONSTRUITA, cantitate: 20, lucru: 400 },
    { material: Material.PIATRA_CONSTRUITA, cantitate: 20, lucru: 300 },
    { material: Material.LEMN_CONSTRUIT, cantitate: 5, lucru: 250 },
  ],
  // Nevoile. La 20 Hz: FOAME scade 6 la 250 de tickuri, deci 1000/6 × 250 =
  // ~41.700 de tickuri ≈ 35 de minute de la satul la zero; prefera sa manance la
  // ~21 de minute (400), intrerupe la ~29 (150). ODIHNA scade 4, deci ~52 de
  // minute. Somnul reface 60 pe tic de nevoie: de la 150 la 1000 sunt ~15 tici =
  // 3750 de tickuri ≈ 3 minute.
  nevoieMax: 1000,
  nevoiTicks: 250,
  // 137 e prim si nu divide 600, deci id-urile consecutive se imprastie pe tot
  // spanul. 600 lasa nevoia initiala in 401..1000, adica peste pragul de 400.
  nevoieFazaPas: 137,
  nevoieFazaSpan: 600,
  nevoieRetryTicks: 500,
  nevoieScanRadiusCells: 96,
  nevoieScanMaxCandidates: 64,
  portieMancare: 20,
  mancatTicks: 60,
  mancatoriPeMorman: 2,
  odihnaPeTicDeNevoie: 60,
  // 4 e fixat UNIC de testul din PLAN: 5×5 tine, 7×7 cade. Cea mai mare camera
  // care sta singura e 6×6.
  suportMax: 4,
  suportRazaGrinda: 10,
  // Indexat cu `Nevoie`: FOAME, ODIHNA.
  nevoi: [
    { scurgere: 6, prag: 400, pragCritic: 150 },
    { scurgere: 4, prag: 400, pragCritic: 150 },
  ],
  // Indexat cu `Item`: PIATRA, PAMANT, LEMN, HRANA. O unitate de hrana da 15,
  // deci o portie de 20 da 300 si un morman plin (75) da 1125 — un pion si un
  // sfert, de la zero la satul.
  nutritie: [0, 0, 0, 15],
  // Dispozitia, pe ACEEASI scara ca nevoile: 0..1000.
  //
  // Bara se misca la 500 de tickuri (25 s), cu 120 in sus si 80 in jos, deci de
  // la baza (500) la pragul de refuz (250) sunt ~4 pasi = 2000 de tickuri ≈ 100 s.
  // Fereastra dintre avertisment (150) si plecare (60) e ~2 pasi = 1000 de
  // tickuri ≈ 50 s — cat sa apuce jucatorul sa faca ceva.
  dispozitieMax: 1000,
  dispozitieBaza: 500,
  dispozitieTicks: 500,
  dispozitieUrcare: 120,
  dispozitieCoborare: 80,
  dispozitiePragRefuz: 250,
  dispozitiePragAvertisment: 150,
  dispozitiePragPlecare: 60,
  // ±50% productivitate. `workUnitsPerTick` (10) x 500 / 1000 = 5 ≥ 1, deci
  // podeaua nu se declanseaza niciodata la continutul asta.
  multiplicatorMin: 500,
  multiplicatorMax: 1500,
  ganduriSloturi: 4,
  // Indexat cu `Gand`.
  //
  // INFOMETAT e −450, nu −200, si cifra vine dintr-o masuratoare: cu −200, o
  // asezare fara pic de mancare se stabiliza la o dispozitie de 230 si NIMENI nu
  // pleca vreodata, fiindca pragul de plecare e 60. Adica treapta a treia era
  // inaccesibila IN JOC, desi invariantul aritmetic trecea — catalogul putea
  // atinge pragul doar adunand si EPUIZAT, iar somnul pe jos reuseste mereu,
  // deci EPUIZAT nu apare practic niciodata. O colonie care nu-si poate hrani
  // oamenii trebuie sa-i piarda.
  //
  // Cu −450: infometat si in pat da 50 (sub 60, pleaca); infometat si pe jos da
  // 500 − 450 − 70 = −20, plafonat la 0. Bara coboara 80 la 500 de tickuri, deci
  // de la 500 la 60 sunt ~6 pasi = 3000 de tickuri (~2,5 min de joc), din care
  // ~1500 petrecute intre „refuza munca" (250) si plecare — o fereastra reala in
  // care jucatorul poate aduce mancare.
  //
  // Minimul ATINS: 500 − 450 (INFOMETAT) − 200 (EPUIZAT) − 70 (DORMIT_PE_JOS)
  // = −220. Verificat mecanic in `parseRules`, nu pe hartie.
  ganduri: [
    { valoare: 0, durata: 0 },
    { valoare: -50, durata: 0 },
    { valoare: -450, durata: 0 },
    { valoare: -80, durata: 0 },
    { valoare: -200, durata: 0 },
    { valoare: -70, durata: 6000 },
    { valoare: 250, durata: 20000 },
  ],
}
