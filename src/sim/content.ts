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
  /** Ce raza de blocuri de regiuni isi asigura o desemnare la creare, ca sa poata fi evaluata. */
  readonly jobRegionRadiusBlocks: number
  /**
   * Cate tickuri evita un PION o tinta la care a renuntat din cauze care tin de el
   * (drum blocat de un ostil, drum peste buget). Racirea e pe perechea (pion, tinta).
   */
  readonly jobRetryTicks: number
  /**
   * Cate tickuri asteapta o DESEMNARE dupa ce s-a dovedit ca n-are niciun loc de
   * lucru. E o proprietate a ei, nu a pionului, deci se scrie pe ea; scurta,
   * fiindca o sapatura vecina o poate deschide oricand.
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
}

type FieldSpec = { min: number; max: number }

const RULES_SPEC: Record<keyof Rules, FieldSpec> = {
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
    if (!known.includes(key)) {
      return refuse(Reason.COMANDA_NECUNOSCUTA, { camp: key, cunoscute: known.join(', ') })
    }
  }

  const out: Record<string, number> = {}
  for (const key of known) {
    const spec = RULES_SPEC[key as keyof Rules]
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
  const blocuriDeScan = Math.ceil(out.jobScanRadiusCells! / REGION_SIZE)
  if (out.agentRegionRadiusBlocks! + out.jobRegionRadiusBlocks! + 2 < blocuriDeScan) {
    return refuse(Reason.VALOARE_INVALIDA, {
      camp: 'jobRegionRadiusBlocks',
      motiv: 'discul agentului si al desemnarii nu se ating pe toata raza de scanare',
      agentRegionRadiusBlocks: out.agentRegionRadiusBlocks!,
      jobRegionRadiusBlocks: out.jobRegionRadiusBlocks!,
      necesar: blocuriDeScan - 2 - out.agentRegionRadiusBlocks!,
    })
  }
  if (out.designationPriorityDefault! > out.designationPriorityLevels!) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'designationPriorityDefault', valoare: out.designationPriorityDefault!, max: out.designationPriorityLevels! })
  }
  if (out.personalPriorityDefault! > out.personalPriorityLevels!) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'personalPriorityDefault', valoare: out.personalPriorityDefault!, max: out.personalPriorityLevels! })
  }

  return accept(out as unknown as Rules)
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
}
