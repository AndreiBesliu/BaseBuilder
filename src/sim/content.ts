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
import { Item, ITEME } from './state.ts'

/** Ce lasa in urma un voxel sapat: felul de item si cate unitati. `cantitate` 0 = nimic (aer, apa). */
export interface DigYield {
  readonly fel: number
  readonly cantitate: number
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
}

type FieldSpec = { min: number; max: number }

/** Campurile NUMERICE. `digYield` e singurul camp imbricat si se valideaza separat. */
const RULES_SPEC: Record<Exclude<keyof Rules, 'digYield'>, FieldSpec> = {
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
  itemCapacity: { min: 1, max: 1000000 },
  zoneCapacity: { min: 1, max: 1000000 },
  zoneCellCapacity: { min: 1, max: 1000000 },
  zonePriorityLevels: { min: 1, max: 9 },
  zonePriorityDefault: { min: 1, max: 9 },
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
]
const NUME_ITEME: readonly (readonly [string, number])[] = [
  ['PIATRA', Item.PIATRA],
  ['PAMANT', Item.PAMANT],
  ['LEMN', Item.LEMN],
]
const MAX_YIELD = 10000

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
    if (key === 'digYield') continue
    if (!known.includes(key)) {
      return refuse(Reason.COMANDA_NECUNOSCUTA, { camp: key, cunoscute: [...known, 'digYield'].join(', ') })
    }
  }

  const out: Record<string, number | readonly DigYield[]> = {}
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
  for (const y of r.digYield) {
    if (y.cantitate > r.itemStackMax) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: 'digYield', motiv: 'un voxel nu poate da mai mult decat incape intr-un morman', valoare: y.cantitate, max: r.itemStackMax })
    }
  }
  void ITEME

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
  ],
}
