/**
 * Modul de pornire al paginii, din URL — PUR, testat pe fiecare URL al lansatoarelor de gate.
 *
 * Un singur predicat pentru „rulare de masura", fiindca inainte erau trei, scrise in trei
 * locuri din main.ts, cu intelesuri diferite (panoul de design al UI-ului, CG-1 / T1):
 *   - `faraUI`     — pagina NU monteaza UI-ul de joc: nici DOM, nici stil, nici ascultatori. Orice
 *                    parametru de masura il aprinde — UI-ul in bucla masurata ar fi drift de gate —,
 *                    si modul de verificare: pasii din OWNER_VERIFY 12 si 13 sunt scrisi pe viewer-ul
 *                    de azi (clic = sapa, HUD-ul si ajutorul lui pe ecran), iar cu panourile noi peste
 *                    ele ecranul nu se mai putea citi (captura din sesiunea UI-ului, 1280×720).
 *   - `masoara`    — `gateRun` de azi: scenariu sau bisectie. Neschimbat.
 *   - `lumeDeGate` — `!AGENTI_ACTIVI` de azi: doar un scenariu incarca fixtura M10 fara pioni.
 *                    `?bisect=1` ramane pe fortareata cu pioni, ca inainte: altfel s-ar muta X_max,
 *                    iar asta e o decizie de gate, nu de UI.
 *
 * Precedenta: orice parametru de masura ⇒ gate, orice altceva ar mai fi in URL. Apoi
 * `incarca` > `joc=nou` > parametrii de verificare (cam, slice, piatra, hrana, pauza, verificare)
 * ⇒ verificare > ecranul de titlu.
 */

export type ModPornire = 'gate' | 'titlu' | 'joc-nou' | 'incarca' | 'verificare'

export interface Pornire {
  readonly mod: ModPornire
  readonly faraUI: boolean
  readonly masoara: boolean
  readonly lumeDeGate: boolean
}

/** Parametrii care fac din pagina o rulare de masura. */
export const PARAMETRI_DE_MASURA: readonly string[] = ['scenario', 'bisect', 'd1b', 'probe', 'ballast']

/** Parametrii modului de verificare (OWNER_VERIFY 12 si 13). */
export const PARAMETRI_DE_VERIFICARE: readonly string[] = ['cam', 'slice', 'piatra', 'hrana', 'pauza', 'verificare']

/** Doar ce foloseste functia din `URLSearchParams`: se poate testa si cu un Map. */
export interface Parametri {
  has(nume: string): boolean
  get(nume: string): string | null
}

export function modPornire(p: Parametri): Pornire {
  const masoara = p.has('scenario') || p.get('bisect') === '1'
  const lumeDeGate = p.has('scenario')
  if (PARAMETRI_DE_MASURA.some((n) => p.has(n))) return { mod: 'gate', faraUI: true, masoara, lumeDeGate }
  if (p.has('incarca')) return { mod: 'incarca', faraUI: false, masoara, lumeDeGate }
  if (p.get('joc') === 'nou') return { mod: 'joc-nou', faraUI: false, masoara, lumeDeGate }
  if (PARAMETRI_DE_VERIFICARE.some((n) => p.has(n))) return { mod: 'verificare', faraUI: true, masoara, lumeDeGate }
  return { mod: 'titlu', faraUI: false, masoara, lumeDeGate }
}

/** Parametrii unui joc nou, cititi si marginiti. Ce nu se poate citi cade pe implicit. */
export interface ParametriJocNou {
  readonly seed: number
  readonly oameni: number
  readonly piatra: number
  readonly hrana: number
}

/**
 * Hrana implicita pe om: ~2 ore de joc la consumul regulilor de azi (panoul, JN-1: 600 de hrana
 * pentru 12 oameni tineau 26–28 de minute, iar colonia se golea singura la ~56). Hrana NU se poate
 * produce inca — UI-ul o spune; implicitul doar da timp jocului.
 */
export const HRANA_PE_OM = 230

export function parametriJocNou(p: Parametri, capacitate: number, seedImplicit: number): ParametriJocNou {
  const intreg = (nume: string, min: number, max: number, implicit: number): number => {
    const v = p.get(nume)
    if (v === null || v.trim() === '') return implicit
    const n = Number(v)
    return Number.isInteger(n) && n >= min && n <= max ? n : implicit
  }
  const oameni = intreg('oameni', 1, capacitate, 12)
  return {
    seed: intreg('seed', 0, 2 ** 31 - 1, seedImplicit),
    oameni,
    piatra: intreg('piatra', 0, 100_000, 1000),
    hrana: intreg('hrana', 0, 100_000, HRANA_PE_OM * oameni),
  }
}
