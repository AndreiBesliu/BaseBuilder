/**
 * Sonda de cadre — instrumentul gate-ului de motor (D1).
 *
 * Protocolul e in `bench/GATE.md`, scris si comis INAINTE de prima cifra. Aici e
 * doar unealta. Trei lucruri o deosebesc de un contor de FPS:
 *
 * 1. **Masoara DOUA ceasuri distincte, si gateaza pe cel din afara.**
 *    - intervalul de PREZENTARE = delta dintre argumentele `timestamp` ale rAF.
 *      Aliniat la vsync, deci spune daca ai RATAT un cadru.
 *    - munca PROPRIE = `performance.now()` in jurul randarii. Spune cat ai
 *      consumat — dar NUMAI in JavaScript. In Chromium, submisia GL, rasterul si
 *      compunerea se fac pe alt thread si in procesul GPU, deci un cadru care
 *      costa 14 ms de CPU real poate raporta 4 ms de aici. De asta munca proprie
 *      e DIAGNOSTIC si nu are prag, iar verdictul se da pe X_max (mai jos).
 *
 * 2. **Zero alocari in bucla fierbinte.** Buffer prealocat, fara `console.log`,
 *    fara JSON in timpul rularii. Altfel masori propriul colector de gunoi.
 *
 * 3. **Se poate autodeclara INVALIDA.** Un instrument care nu poate spune „nu am
 *    masurat nimic" va spune mereu ceva.
 */

/** Cadru la 60 Hz, in milisecunde. */
export const FRAME_MS = 16.67
/** Criteriul bisectiei: peste atat, cadrul a ratat vsync-ul. */
export const PRESENT_BUDGET_MS = 17.5

// ---------------------------------------------------------------------------
// granularitatea ceasului
// ---------------------------------------------------------------------------

/**
 * Cel mai mic delta nenul intre doua `performance.now()` consecutive.
 *
 * Fara izolare cross-origin, browserele tocesc ceasul ca aparare impotriva
 * Spectre. Daca iese peste 0,1 ms, nicio cifra sub 1 ms din raport nu inseamna
 * nimic — si atunci se scrie asta in raport, nu se ignora.
 */
export function clockGranularityMs(samples = 1000): number {
  let smallest = Infinity
  let prev = performance.now()
  for (let i = 0; i < samples; i++) {
    const now = performance.now()
    const d = now - prev
    if (d > 0 && d < smallest) smallest = d
    prev = now
  }
  return smallest === Infinity ? 0 : smallest
}

// ---------------------------------------------------------------------------
// balastul
// ---------------------------------------------------------------------------

/**
 * Sarcina artificiala care tine locul jocului care inca nu exista.
 *
 * `tick()` din viewer contine azi DOAR `controls.update()` si `renderer.render()`.
 * Zero simulare, zero agenti, zero UI. Un verde obtinut asa masoara jumatate din
 * sistem si declara ca restul incape.
 *
 * FORMA TEMPORALA conteaza si e usor de gresit: tickul e 20 Hz peste 60 Hz, deci
 * costul lui cade pe UN cadru din TREI. Acelasi buget intins uniform are media
 * corecta si coada gresita — adica sub-reprezinta exact percentila pe care se da
 * verdictul.
 */
export class Ballast {
  /** Proxy pentru tickul de simulare angajat in PLAN §2. */
  readonly tickMs: number
  /** Proxy pentru panoul dens (D1b). Cade pe FIECARE cadru. */
  readonly uiMs: number
  enabled = false

  /** Acumulator global: fara el, JIT-ul sterge bucla de ardere ca fiind moarta. */
  private sink = 0

  constructor(tickMs = 8.0, uiMs = 1.5) {
    this.tickMs = tickMs
    this.uiMs = uiMs
  }

  /** Arde exact `ms` milisecunde de CPU. */
  burnMs(ms: number): void {
    if (ms <= 0) return
    const until = performance.now() + ms
    let x = this.sink
    while (performance.now() < until) {
      // Munca reala, nu un `while` gol: un ciclu gol poate fi optimizat, iar un
      // `performance.now()` in bucla stransa masoara ceasul, nu calculul.
      for (let i = 0; i < 512; i++) x = (x * 1103515245 + 12345) % 2147483648
    }
    this.sink = x
  }

  /** Balastul unui cadru. `frameIndex` decide daca e cadru de tick. */
  burnFrame(frameIndex: number): void {
    if (!this.enabled) return
    this.burnMs(this.uiMs)
    if (frameIndex % 3 === 0) this.burnMs(this.tickMs)
  }

  /** Amprenta constantelor, tiparita in raport ca sa nu poata fi micsorate tacit. */
  fingerprint(): string {
    return `tick=${this.tickMs}ms/3cadre ui=${this.uiMs}ms/cadru`
  }

  /** Ca sa nu fie eliminat acumulatorul de un optimizator prea destept. */
  checksum(): number {
    return this.sink
  }
}

// ---------------------------------------------------------------------------
// sonda
// ---------------------------------------------------------------------------

export interface FrameSummary {
  readonly frames: number
  /** Percentilele intervalului de PREZENTARE. Pe astea se gateaza. */
  readonly presentP50: number
  readonly presentP95: number
  readonly presentP99: number
  readonly presentMax: number
  /** Percentilele muncii proprii. DIAGNOSTIC, fara prag. */
  readonly cpuP50: number
  readonly cpuP99: number
  readonly pctOver16: number
  readonly pctOver33: number
  readonly framesOver100: number
  /** Orientativ, o singura data, ca sa nu se citeasca drept masuratoare. */
  readonly fpsOrientativ: number
  readonly drawCalls: number
  readonly triangles: number
  readonly heapSlopeMbPerS: number
}

const FIELDS = 5 // present, cpu, calls, tris, heapMB

export class FrameProbe {
  private readonly buf: Float64Array
  private readonly cap: number
  private n = 0
  private lastRaf = -1
  private invalidReason: string | null = null

  constructor(capacity = 20000) {
    this.cap = capacity
    this.buf = new Float64Array(capacity * FIELDS)
  }

  /** Marcheaza intreaga rulare invalida. Nu sare un cadru — invalideaza fisierul. */
  invalidate(reason: string): void {
    if (this.invalidReason === null) this.invalidReason = reason
  }

  get invalid(): string | null {
    return this.invalidReason
  }

  get count(): number {
    return this.n
  }

  /**
   * Un cadru. Se apeleaza la finalul buclei, dupa randare. Zero alocari.
   * Intoarce intervalul de PREZENTARE, ca sa nu fie nevoie sa-l recalculeze altcineva
   * — si ca bisectia sa nu poata primi din greseala alt ceas.
   */
  record(rafTs: number, cpuStart: number, cpuEnd: number, calls: number, tris: number, heapMB: number): number {
    const present = this.lastRaf < 0 ? 0 : rafTs - this.lastRaf
    this.lastRaf = rafTs
    if (this.n >= this.cap) return present

    const o = this.n * FIELDS
    this.buf[o] = present
    this.buf[o + 1] = cpuEnd - cpuStart
    this.buf[o + 2] = calls
    this.buf[o + 3] = tris
    this.buf[o + 4] = heapMB
    this.n++
    return present
  }

  reset(): void {
    this.n = 0
    this.lastRaf = -1
    this.invalidReason = null
  }

  /** Statistica. Se calculeaza DUPA ultimul cadru, niciodata in timpul rularii. */
  summary(skipFirst = 1): FrameSummary {
    const from = Math.min(skipFirst, this.n)
    const k = this.n - from
    const present: number[] = []
    const cpu: number[] = []
    let over16 = 0
    let over33 = 0
    let over100 = 0
    let calls = 0
    let tris = 0

    for (let i = from; i < this.n; i++) {
      const o = i * FIELDS
      const p = this.buf[o]!
      present.push(p)
      cpu.push(this.buf[o + 1]!)
      if (p > FRAME_MS) over16++
      if (p > 33.3) over33++
      if (p > 100) over100++
      calls = this.buf[o + 2]!
      tris = this.buf[o + 3]!
    }

    present.sort((a, b) => a - b)
    cpu.sort((a, b) => a - b)
    const q = (arr: number[], f: number) => (arr.length === 0 ? 0 : arr[Math.min(arr.length - 1, Math.floor(arr.length * f))]!)

    const totalMs = present.reduce((a, b) => a + b, 0)

    // Panta heap-ului: daca e pozitiva si mare, p99-ul tau e p99 de GC, nu de
    // randare, si nu ai masurat ce credeai.
    let slope = 0
    if (k > 120 && totalMs > 0) {
      const firstHeap = this.buf[from * FIELDS + 4]!
      const lastHeap = this.buf[(this.n - 1) * FIELDS + 4]!
      slope = (lastHeap - firstHeap) / (totalMs / 1000)
    }

    return {
      frames: k,
      presentP50: q(present, 0.5),
      presentP95: q(present, 0.95),
      presentP99: q(present, 0.99),
      presentMax: present.length > 0 ? present[present.length - 1]! : 0,
      cpuP50: q(cpu, 0.5),
      cpuP99: q(cpu, 0.99),
      pctOver16: k === 0 ? 0 : (over16 / k) * 100,
      pctOver33: k === 0 ? 0 : (over33 / k) * 100,
      framesOver100: over100,
      fpsOrientativ: totalMs > 0 ? (k * 1000) / totalMs : 0,
      drawCalls: calls,
      triangles: tris,
      heapSlopeMbPerS: slope,
    }
  }

}

// ---------------------------------------------------------------------------
// bisectia care da X_max
// ---------------------------------------------------------------------------

/**
 * X_max — bugetul liber, in milisecunde. ASTA e metrica de gate.
 *
 * Sub vsync, 60 FPS e saturatie, nu masuratoare: nu afli daca ai consumat 2 ms
 * sau 16 din cele 16,67. Deci se adauga o sarcina artificiala de X ms pe cadru
 * si se cauta binar cel mai mare X pentru care p99 al intervalului de prezentare
 * ramane sub `PRESENT_BUDGET_MS`.
 *
 * Functioneaza acolo unde munca proprie masurata in rAF esueaza, fiindca
 * criteriul e pe PREZENTARE: include tot ce se intampla in procesul GPU. Daca
 * pui 5 ms in plus si cadrele incep sa rateze vsync-ul, alea sunt 5 ms pe care
 * nu-i aveai, indiferent unde se consumau.
 */
export class Bisector {
  private lo = 0
  private hi = FRAME_MS
  private iter = 0
  private samples: number[] = []
  private frames = 0
  done = false
  result = 0

  readonly framesPerTrial: number
  readonly iterations: number
  readonly budgetMs: number

  constructor(framesPerTrial = 600, iterations = 6, budgetMs = PRESENT_BUDGET_MS) {
    this.framesPerTrial = framesPerTrial
    this.iterations = iterations
    this.budgetMs = budgetMs
  }

  /** Cati ms de balast se ard in cadrul curent. */
  currentX(): number {
    return (this.lo + this.hi) / 2
  }

  /** Rezolutia la care s-a ajuns. Se raporteaza langa rezultat. */
  get resolutionMs(): number {
    return FRAME_MS / 2 ** this.iterations
  }

  /** Un cadru de proba. `present` e intervalul de prezentare. */
  sample(present: number): void {
    if (this.done) return
    this.frames++
    // Primele 60 de cadre ale fiecarei incercari se arunca: schimbarea sarcinii
    // are nevoie de timp ca sa se aseze, iar cadrul de tranzitie e mereu lung.
    if (this.frames > 60) this.samples.push(present)
    if (this.frames < this.framesPerTrial) return

    this.samples.sort((a, b) => a - b)
    const p99 = this.samples[Math.min(this.samples.length - 1, Math.floor(this.samples.length * 0.99))] ?? 0
    const x = this.currentX()
    if (p99 <= this.budgetMs) {
      this.lo = x
      this.result = x
    } else {
      this.hi = x
    }

    this.samples.length = 0
    this.frames = 0
    this.iter++
    if (this.iter >= this.iterations) this.done = true
  }

  get progress(): string {
    return this.done
      ? `X_max = ${this.result.toFixed(2)} ms (±${this.resolutionMs.toFixed(2)})`
      : `bisectie ${this.iter + 1}/${this.iterations} · X = ${this.currentX().toFixed(2)} ms`
  }
}

// ---------------------------------------------------------------------------
// garzile de invalidare
// ---------------------------------------------------------------------------

export interface GuardContext {
  readonly rendererName: string
  readonly expectGpu: string
  readonly isDevServer: boolean
}

/**
 * Conditiile din `bench/GATE.md` §7 care se pot verifica din pagina.
 *
 * Se evalueaza o data la pornire; `visibilitychange` se leaga separat, fiindca
 * poate aparea in timpul rularii — si e cea mai importanta dintre toate:
 * `requestAnimationFrame` pur si simplu NU mai e apelat cand panoul e ascuns,
 * iar rezultatul arata ca „p99 = 7000 ms", deja platit o data in proiectul asta.
 */
export function checkGuards(ctx: GuardContext): string[] {
  const fails: string[] = []
  if (document.visibilityState !== 'visible') fails.push('pagina nu e vizibila — rAF nu ruleaza')
  if (!ctx.rendererName.includes(ctx.expectGpu)) {
    fails.push(`renderer „${ctx.rendererName}" nu contine „${ctx.expectGpu}" — posibil iGPU sau SwiftShader`)
  }
  if (ctx.isDevServer) fails.push('rulezi pe dev server, nu pe build de productie')
  // In microsecunde ROTUNJITE, nu `g > 0.1`: tocirea Spectre din Chromium e exact 100 µs,
  // iar diferenta a doua `performance.now()` multiplu de 0,1 iese, dupa cum cad octetii,
  // 0,09999990 sau 0,10000002. Masurat pe 25.09, sub Electron: aceeasi masina, doua
  // rulari, o data sub prag si o data peste. O garda care decide prin rotunjire flotanta
  // nu e o garda; pragul real e „mai grosier decat tocirea implicita", adica > 100 µs.
  const g = clockGranularityMs()
  if (Math.round(g * 1000) > 100) fails.push(`granularitatea ceasului ${g.toFixed(3)} ms — nicio cifra sub 1 ms nu e credibila`)
  return fails
}

/** Heap-ul, in MB, daca browserul il expune. Altfel 0. */
export function heapMB(): number {
  const perf = performance as unknown as { memory?: { usedJSHeapSize: number } }
  return perf.memory ? perf.memory.usedJSHeapSize / 1048576 : 0
}
