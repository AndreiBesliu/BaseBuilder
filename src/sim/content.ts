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

export interface Rules {
  /** Latimea lumii, in celule. */
  readonly worldWidthCells: number
  /** Inaltimea lumii, in celule. */
  readonly worldHeightCells: number
  /** Cati agenti incap. Plafon dur, verificat de comanda de spawn. */
  readonly agentCapacity: number
  /** Cati milimetri face un agent intr-un tick. */
  readonly agentStepMm: number
  /** Tickuri de simulare pe secunda de joc. */
  readonly ticksPerSecond: number
  /** Raza discului de chunk-uri rezidente, in chunk-uri. 11 ≈ 377 de chunk-uri. */
  readonly chunkResidentRadius: number
}

type FieldSpec = { min: number; max: number }

const RULES_SPEC: Record<keyof Rules, FieldSpec> = {
  worldWidthCells: { min: 1, max: 65536 },
  worldHeightCells: { min: 1, max: 65536 },
  agentCapacity: { min: 1, max: 100000 },
  agentStepMm: { min: 1, max: 100000 },
  ticksPerSecond: { min: 1, max: 240 },
  chunkResidentRadius: { min: 0, max: 64 },
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

  return accept(out as unknown as Rules)
}

/** Reguli implicite, folosite doar de teste si de harness cand nu se da un fisier. */
export const DEFAULT_RULES: Rules = {
  worldWidthCells: 256,
  worldHeightCells: 256,
  agentCapacity: 64,
  agentStepMm: 250,
  ticksPerSecond: 20,
  chunkResidentRadius: 11,
}
