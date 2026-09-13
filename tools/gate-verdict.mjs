#!/usr/bin/env node
/**
 * Programul de verdict al gate-ului de motor (D1).
 *
 *   node tools/gate-verdict.mjs bench/gate-runs/*.json
 *   node tools/gate-verdict.mjs --self-test
 *
 * Scoate EXACT un șir: REFUZ | SCOPE | FAIL-CANDIDAT | GREY | STAY-PROVIZORIU | STAY,
 * plus motivul. Există dintr-un singur motiv: verdictul se EXECUTĂ, nu se citește
 * de pe un grafic. Un om care se uită la cinci rulări și decide „pare ok" a decis
 * ce voia să decidă.
 *
 * E comis ÎNAINTE de prima rulare de gate, împreună cu `bench/GATE.md`, iar
 * `--self-test` îi dă fixturi sintetice pentru fiecare ieșire — inclusiv una care
 * TREBUIE să producă REFUZ. Un program de verdict care nu poate produce roșu n-are
 * dreptul să producă verde.
 *
 * Pragurile sunt aici o singură dată, ca să nu poată exista două adevăruri.
 * Orice modificare = commit separat, cu motiv scris. Vezi bench/GATE.md §2.
 */

import { readFileSync } from 'node:fs'

// --- pragurile, derivate din bugetul din PLAN §2 ----------------------------

/** Cadru la 60 Hz. */
const FRAME_MS = 16.67
/** Tick de simulare, angajat în PLAN (criteriul de acceptare P1+P2). */
const TICK_MS = 8.0
/** UI dens. NEMĂSURAT în orice motor — asta e D1b. */
const UI_MS = 1.5
/** Ce rămâne pentru randare + teren, pe mașina ȚINTĂ. */
const RENDER_BUDGET_MS = FRAME_MS - TICK_MS - UI_MS // 7,17
/** Marja de STAY. Asimetria dintre fals PASS (~10 luni) și fals FAIL (~2-4 luni). */
const STAY_MARGIN = 1.5

/** Rapoarte față de clasa țintă. AMBELE NEMĂSURATE — vezi GATE.md §2. */
const R = { cpu: 2.0, gpu: 5.5 }
const R_MEASURED = false

/** Sub pragul ăsta nu încape nici măcar bugetul deja promis. */
const FAIL_X_MAX_MS = TICK_MS + UI_MS // 9,5

/** p99 al intervalului de prezentare, criteriul bisecției. */
const PRESENT_P99_MS = 17.5

const MAX_FRAMES_OVER_100 = 0
const MAX_PCT_OVER_33 = 0.3
/** Degradare admisă între primul și al doilea S-FORTRESS (după traversare). */
const MAX_REGRESSION_PCT = 10

const CV_HARD_MS = 10 // peste = REFUZ
const MAX_INVALIDATED_PCT = 20

/** Benzile sweep-ului de rezoluție. Se CALIBREAZĂ (GATE.md §6.7); astea sunt implicite. */
const CPU_BOUND_MAX_DROP_PCT = 10
const GPU_BOUND_MIN_DROP_PCT = 40

const SCENARIOS = ['S-FORTRESS', 'S-DIG', 'S-TRAVERSE']

/** X_max cerut de STAY, pe mașina asta, pentru o axă dată. */
function stayXMax(axis) {
  return FRAME_MS - RENDER_BUDGET_MS / STAY_MARGIN / R[axis]
}

// --- statistică -------------------------------------------------------------

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function stdev(xs) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

function cvPct(xs) {
  const m = mean(xs)
  return m === 0 ? 0 : (stdev(xs) / m) * 100
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// --- verdictul --------------------------------------------------------------

/**
 * @param {object[]} runs rulări, fiecare cu {meta, instrument, scenarios}
 * @returns {{verdict: string, reasons: string[], detail: string[]}}
 */
export function decide(runs) {
  const reasons = []
  const detail = []

  if (runs.length === 0) return { verdict: 'REFUZ', reasons: ['zero rulări'], detail }

  // --- 1. REFUZ DE MĂSURĂTOARE ---------------------------------------------

  const invalidated = runs.filter((r) => r.invalidated === true)
  const invalidPct = (invalidated.length / runs.length) * 100
  if (invalidPct > MAX_INVALIDATED_PCT) {
    reasons.push(`${invalidPct.toFixed(0)}% rulări invalidate (peste ${MAX_INVALIDATED_PCT}%) — mediul e constatarea`)
  }

  const valid = runs.filter((r) => r.invalidated !== true)
  if (valid.length === 0) reasons.push('nicio rulare validă')

  for (const r of valid) {
    const i = r.instrument ?? {}
    const tag = r.meta?.tag ?? '?'
    if (Math.abs((i.nullSceneMedianMs ?? 0) - FRAME_MS) > 0.3) {
      reasons.push(`${tag}: scena nulă la ${i.nullSceneMedianMs} ms, în afara 16,67 ± 0,3 — deja throttled`)
    }
    if (Math.abs((i.knownCostMs ?? 0) - 8.0) > 0.5) {
      reasons.push(`${tag}: costul cunoscut raportat ${i.knownCostMs} ms în loc de 8,0 ± 0,5 — sonda minte`)
    }
    const probes = i.negativeProbes ?? {}
    for (const [name, state] of Object.entries(probes).sort()) {
      if (state !== 'red') reasons.push(`${tag}: proba negativă „${name}" nu e roșie (${state})`)
    }
    if (Object.keys(probes).length < 3) reasons.push(`${tag}: lipsesc probe negative (${Object.keys(probes).length}/3)`)
    if (i.bandsCalibrated !== true) reasons.push(`${tag}: benzile CPU/GPU necalibrate — diagnosticul e inventat`)
    if (i.aaVerdict !== undefined && i.aaVerdict !== 'nedecis') {
      reasons.push(`${tag}: testul A/A a declarat „${i.aaVerdict}" în loc de „nedecis" — programul e rupt`)
    }
  }

  // Reproductibilitate, per scenariu.
  const perScenario = {}
  for (const s of SCENARIOS) {
    const xs = valid.map((r) => r.scenarios?.[s]).filter(Boolean)
    if (xs.length === 0) continue
    const p99s = xs.map((x) => x.p99PresentMs).filter((v) => typeof v === 'number')
    const cv = p99s.length >= 2 ? cvPct(p99s) : 0
    perScenario[s] = {
      n: xs.length,
      cv,
      xMax: median(xs.map((x) => x.xMaxMs)),
      p99: median(p99s),
      framesOver100: Math.max(...xs.map((x) => x.framesOver100ms ?? 0)),
      pctOver33: Math.max(...xs.map((x) => x.pctOver33ms ?? 0)),
      dropAt25: median(xs.map((x) => x.resolutionDropPct25 ?? NaN)),
    }
    if (p99s.length >= 2 && cv > CV_HARD_MS) {
      reasons.push(`${s}: CV(p99) = ${cv.toFixed(1)}% (peste ${CV_HARD_MS}%) — nu am voie să compar`)
    }
  }

  const missing = SCENARIOS.filter((s) => perScenario[s] === undefined)
  if (missing.length > 0 && reasons.length === 0) {
    detail.push(`scenarii lipsă: ${missing.join(', ')} — verdictul acoperă doar ce s-a rulat`)
  }

  if (reasons.length > 0) return { verdict: 'REFUZ', reasons, detail }

  for (const [s, v] of Object.entries(perScenario).sort()) {
    detail.push(
      `${s.padEnd(11)} n=${v.n} X_max=${v.xMax.toFixed(2)} ms  p99=${v.p99.toFixed(2)} ms  ` +
        `CV=${v.cv.toFixed(1)}%  >100ms: ${v.framesOver100}  >33ms: ${v.pctOver33}%  ` +
        `scădere la 25% pixeli: ${Number.isNaN(v.dropAt25) ? '—' : v.dropAt25.toFixed(0) + '%'}`,
    )
  }

  // --- 2. SCOPE — GPU-bound: motorul nu e pârghia --------------------------

  const gpuBound = Object.entries(perScenario)
    .filter(([, v]) => !Number.isNaN(v.dropAt25) && v.dropAt25 >= GPU_BOUND_MIN_DROP_PCT)
    .map(([s]) => s)
  const worst = Object.entries(perScenario).sort((a, b) => a[1].xMax - b[1].xMax)[0]

  if (gpuBound.length > 0 && worst && worst[1].xMax < stayXMax('gpu')) {
    return {
      verdict: 'SCOPE',
      reasons: [
        `GPU-bound pe ${gpuBound.join(', ')} (frametime scade cu ≥${GPU_BOUND_MIN_DROP_PCT}% la 25% din pixeli)`,
        'același GPU, aceleași triunghiuri, aceleași shadere — Unity nu dă hardware nou',
        'remediul e PUNCT DE DECIZIE #1 (LOD, instancing, buget de draw calls), nu portarea',
      ],
      detail,
    }
  }

  // --- 3. FAIL-CANDIDAT ----------------------------------------------------

  const belowFail = Object.entries(perScenario).filter(([, v]) => v.xMax < FAIL_X_MAX_MS)
  const hardHitches = Object.entries(perScenario).filter(([, v]) => v.framesOver100 >= 3)

  if (belowFail.length > 0 || hardHitches.length > 0) {
    const rs = []
    for (const [s, v] of belowFail) {
      rs.push(`${s}: X_max ${v.xMax.toFixed(2)} ms < ${FAIL_X_MAX_MS} ms (tick 8,0 + UI 1,5, deja promise)`)
    }
    for (const [s, v] of hardHitches) rs.push(`${s}: ${v.framesOver100} cadre peste 100 ms`)
    rs.push('NU e MOVE. Deblochează Probe A (1 zi), Probe B (3 zile), spike de portare (2 zile)')
    rs.push('fără Probe A niciun eșec nu e atribuibil: „stiva nu poate" și „codul meu e prost" arată identic')
    return { verdict: 'FAIL-CANDIDAT', reasons: rs, detail }
  }

  // --- 4/5/6. GREY / STAY-PROVIZORIU / STAY --------------------------------

  const axis = worst && !Number.isNaN(worst[1].dropAt25) && worst[1].dropAt25 > CPU_BOUND_MAX_DROP_PCT ? 'gpu' : 'cpu'
  const threshold = stayXMax(axis)
  detail.push(
    `axa care leagă: ${axis.toUpperCase()} (R=${R[axis]}, ${R_MEASURED ? 'măsurat' : 'PRESUPUS'}) ⇒ prag X_max = ${threshold.toFixed(2)} ms`,
  )

  const belowStay = Object.entries(perScenario).filter(([, v]) => v.xMax < threshold)
  const overSoft = Object.entries(perScenario).filter(
    ([, v]) => v.framesOver100 > MAX_FRAMES_OVER_100 || v.pctOver33 > MAX_PCT_OVER_33,
  )

  if (belowStay.length > 0 || overSoft.length > 0) {
    const rs = belowStay.map(([s, v]) => `${s}: X_max ${v.xMax.toFixed(2)} ms < pragul de ${threshold.toFixed(2)} ms`)
    for (const [s, v] of overSoft) {
      rs.push(`${s}: ${v.framesOver100} cadre >100 ms, ${v.pctOver33}% >33 ms`)
    }
    rs.push('O SINGURĂ fereastră de 21 de zile / max 60 de ore, neprelungibilă')
    rs.push('acordată doar dacă lista înghețată din GATE.md §10 acoperă golul cu marjă 1,5×')
    rs.push('reper propriu: ablația mesher-ului a dat 1,83× — peste ~1,8× nu e credibil')
    return { verdict: 'GREY', reasons: rs, detail }
  }

  const regression = runs.find((r) => typeof r.secondFortressRegressionPct === 'number')
  if (regression && regression.secondFortressRegressionPct > MAX_REGRESSION_PCT) {
    return {
      verdict: 'GREY',
      reasons: [
        `al doilea S-FORTRESS e cu ${regression.secondFortressRegressionPct}% mai slab decât primul ` +
          `(peste ${MAX_REGRESSION_PCT}%) — acumulare: leak, fragmentare sau cache invalidat`,
      ],
      detail,
    }
  }

  const d1bMeasured = runs.some((r) => r.meta?.d1bMeasuredBothStacks === true)
  const targetHardware = runs.some((r) => r.meta?.targetClassHardware === true)

  if (R_MEASURED === false && targetHardware === false) {
    return {
      verdict: 'STAY-PROVIZORIU',
      reasons: [
        `toate scenariile peste pragul de ${threshold.toFixed(2)} ms`,
        'PRAG BAZAT PE PRESUPUNERE DE HARDWARE NEVALIDATĂ — R_cpu și R_gpu nu sunt măsurate',
        'se ridică la STAY doar cu o rulare pe hardware de clasă țintă SAU cu R măsurat pe benchmark comun',
        d1bMeasured ? '' : 'și cu D1b (panoul dens) măsurat în ambele stive — criteriul pe care D1 și-l declară singur',
      ].filter(Boolean),
      detail,
    }
  }

  if (d1bMeasured === false) {
    return {
      verdict: 'STAY-PROVIZORIU',
      reasons: [
        `toate scenariile peste pragul de ${threshold.toFixed(2)} ms, pe hardware validat`,
        'D1b NEMĂSURAT: un PASS de randare închide D1a, nu D1',
      ],
      detail,
    }
  }

  return {
    verdict: 'STAY',
    reasons: [
      `toate scenariile peste pragul de ${threshold.toFixed(2)} ms, cu balast pornit`,
      'hardware validat, D1b măsurat în ambele stive',
      'D1 nu se închide: devine traiectorie monitorizată (S15 ≥ 11 ms, S23 ≥ 8 ms, CI de la S41)',
    ],
    detail,
  }
}

// --- fixturi de auto-test ---------------------------------------------------

function goodInstrument(extra = {}) {
  return {
    nullSceneMedianMs: 16.66,
    knownCostMs: 8.02,
    negativeProbes: { drawCalls: 'red', leak: 'red', stall: 'red' },
    bandsCalibrated: true,
    aaVerdict: 'nedecis',
    ...extra,
  }
}

function scenario(xMax, over = {}) {
  return {
    xMaxMs: xMax,
    p99PresentMs: 17.2,
    framesOver100ms: 0,
    pctOver33ms: 0.1,
    resolutionDropPct25: 7,
    ...over,
  }
}

function run(xMaxByScenario, extra = {}) {
  return {
    meta: { tag: 'fixtură', commit: 'abc1234', renderer: 'NVIDIA GeForce RTX 3060', ...extra.meta },
    instrument: goodInstrument(extra.instrument),
    scenarios: Object.fromEntries(
      SCENARIOS.map((s) => [s, scenario(xMaxByScenario[s] ?? xMaxByScenario.default, extra.over?.[s])]),
    ),
    ...extra.top,
  }
}

function replicate(n, make) {
  return Array.from({ length: n }, (_, i) => make(i))
}

const FIXTURES = [
  {
    name: 'instrument stricat: o probă negativă nu e roșie',
    expect: 'REFUZ',
    runs: replicate(5, () => run({ default: 15.0 }, { instrument: { negativeProbes: { drawCalls: 'green', leak: 'red', stall: 'red' } } })),
  },
  {
    name: 'împrăștiere de 25% între rulări identice',
    expect: 'REFUZ',
    runs: replicate(5, (i) => run({ default: 15.0 }, { over: Object.fromEntries(SCENARIOS.map((s) => [s, { p99PresentMs: 14 + i * 1.6 }])) })),
  },
  {
    name: 'scena nulă throttled la 33 ms',
    expect: 'REFUZ',
    runs: replicate(5, () => run({ default: 15.0 }, { instrument: { nullSceneMedianMs: 33.3 } })),
  },
  {
    name: 'GPU-bound: frametime scade cu pixelii',
    expect: 'SCOPE',
    runs: replicate(5, () => run({ default: 11.0 }, { over: Object.fromEntries(SCENARIOS.map((s) => [s, { resolutionDropPct25: 55 }])) })),
  },
  {
    name: 'traversarea nu încape nici în bugetul deja promis',
    expect: 'FAIL-CANDIDAT',
    runs: replicate(5, () => run({ default: 14.5, 'S-TRAVERSE': 7.8 })),
  },
  {
    name: 'hitch-uri peste 100 ms',
    expect: 'FAIL-CANDIDAT',
    runs: replicate(5, () => run({ default: 15.0 }, { over: { 'S-DIG': { framesOver100ms: 4 } } })),
  },
  {
    name: 'între pragul de eșec și cel de STAY',
    expect: 'GREY',
    runs: replicate(5, () => run({ default: 15.0, 'S-TRAVERSE': 11.5 })),
  },
  {
    name: 'tot verde, dar R nemăsurat și fără hardware țintă',
    expect: 'STAY-PROVIZORIU',
    runs: replicate(5, () => run({ default: 15.2 })),
  },
  {
    name: 'hardware validat, dar D1b nemăsurat',
    expect: 'STAY-PROVIZORIU',
    runs: replicate(5, () => run({ default: 15.2 }, { meta: { targetClassHardware: true } })),
  },
  {
    name: 'tot ce cere regula',
    expect: 'STAY',
    runs: replicate(5, () => run({ default: 15.2 }, { meta: { targetClassHardware: true, d1bMeasuredBothStacks: true } })),
  },
]

function selfTest() {
  let failed = 0
  for (const f of FIXTURES) {
    const got = decide(f.runs).verdict
    const ok = got === f.expect
    if (!ok) failed++
    console.log(`${ok ? '✓' : '✗'} ${f.name.padEnd(52)} așteptat ${f.expect.padEnd(16)} obținut ${got}`)
  }
  console.log('')
  console.log(`praguri: FAIL < ${FAIL_X_MAX_MS} ms · STAY(cpu) ≥ ${stayXMax('cpu').toFixed(2)} ms · STAY(gpu) ≥ ${stayXMax('gpu').toFixed(2)} ms`)
  if (failed > 0) {
    console.error(`\n${failed} fixturi au ieșit altfel decât e scris în bench/GATE.md`)
    process.exit(1)
  }
  console.log('programul de verdict poate produce fiecare ieșire, inclusiv roșu.')
}

// --- intrare ----------------------------------------------------------------

const args = process.argv.slice(2)

if (args.includes('--self-test')) {
  selfTest()
} else if (args.length === 0) {
  console.error('folosire: node tools/gate-verdict.mjs <rulare.json>...  |  --self-test')
  process.exit(2)
} else {
  const runs = args.map((p) => JSON.parse(readFileSync(p, 'utf8')))
  const { verdict, reasons, detail } = decide(runs)
  for (const d of detail) console.log(`  ${d}`)
  console.log('')
  console.log(verdict)
  for (const r of reasons) console.log(`  · ${r}`)
  process.exit(verdict === 'REFUZ' ? 3 : 0)
}
