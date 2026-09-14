/**
 * Cum se raporteaza un timp, ca sa nu minta.
 *
 * Motivul exista si e masurat. Pe masina asta, meshingul intregii fixturi M10
 * rulat de 10 ori la rand in acelasi proces da:
 *
 *   444 389 414 493 434 430 366 416 395 405 µs/chunk   ⇒ CV 8,3%
 *
 * O singura rulare poate cadea oriunde in intervalul ala. Doua „masuratori"
 * consecutive ale ACELUIASI cod pot diferi cu 127 µs/chunk — adica de doua ori
 * mai mult decat orice imbunatatire pe care ai vrea sa o detectezi. Un panou de
 * proiectare a ajuns exact asa la concluzia ca aceeasi bucata de cod costa
 * „+46, −153 si +28 µs/chunk".
 *
 * Cu MEDIANA a 10 rulari, comparata intre procese separate, aceeasi masuratoare
 * da 419,4 · 419,6 · 420,4 · 429,5 · 441,0 · 412,1 ⇒ **CV 2,5%**.
 *
 * Deci regula, aceeasi cu cea din bench/GATE.md §7:
 *   CV ≤ 5%   — compari liber
 *   CV 5–10%  — compari doar diferente peste DMD = 2,8 × stdev, scrisa in raport
 *   CV > 10%  — nu compari deloc; reparat mediul, reiei
 *
 * `dmd` se tipareste MEREU langa rezultat, tocmai ca sa nu se poata revendica o
 * imbunatatire mai mica decat zgomotul propriului instrument.
 */

export interface Measurement {
  /** Mediana, in unitatile returnate de `fn`. Ea se raporteaza, nu media. */
  readonly median: number
  readonly mean: number
  readonly stdev: number
  /** Coeficient de variatie, in procente. */
  readonly cvPct: number
  /** Diferenta minima detectabila: 2,8 × stdev. Sub ea, verdictul e „nedecis". */
  readonly dmd: number
  readonly samples: readonly number[]
}

/** Cate repetari, implicit. Sub 5, mediana nu inseamna mare lucru. */
export const DEFAULT_REPS = 10

/**
 * Ruleaza `fn` de `reps` ori si raporteaza statistica, nu ultimul numar.
 *
 * `warmup` se arunca: prima rulare plateste JIT-ul, alocarea bufferelor si
 * incalzirea cache-urilor, si nu are ce cauta in esantion.
 */
export function repeat(fn: () => number, reps = DEFAULT_REPS, warmup = 2): Measurement {
  for (let i = 0; i < warmup; i++) fn()

  const samples: number[] = []
  for (let i = 0; i < reps; i++) samples.push(fn())

  const sorted = [...samples].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const variance = samples.length < 2 ? 0 : samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1)
  const stdev = Math.sqrt(variance)

  return {
    median,
    mean,
    stdev,
    cvPct: mean === 0 ? 0 : (stdev / mean) * 100,
    dmd: 2.8 * stdev,
    samples,
  }
}

/** Cum se scrie o masuratoare intr-un raport. Niciodata doar mediana. */
export function format(m: Measurement, unit: string, digits = 1): string {
  const flag = m.cvPct > 10 ? ' ⚠ CV PESTE 10%, NU COMPARA' : m.cvPct > 5 ? ' ⚠' : ''
  return (
    `${m.median.toFixed(digits)} ${unit}  (mediana din ${m.samples.length}` +
    ` · CV ${m.cvPct.toFixed(1)}%${flag} · detectabil peste ${m.dmd.toFixed(digits)} ${unit})`
  )
}

/**
 * Verdictul de comparatie intre doua masuratori.
 *
 * Exista ca sa nu se poata scrie „a devenit mai rapid" cand diferenta e sub
 * zgomotul instrumentului. „Nedecis" e un rezultat, nu un esec.
 */
export function compare(before: Measurement, after: Measurement): 'mai rapid' | 'mai lent' | 'nedecis' {
  const delta = after.median - before.median
  const threshold = Math.max(before.dmd, after.dmd)
  if (Math.abs(delta) < threshold) return 'nedecis'
  return delta < 0 ? 'mai rapid' : 'mai lent'
}
