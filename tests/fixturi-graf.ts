/**
 * Fixturile grafului termic incremental (t.2b §6, src/sim/termic.ts): lotul și tickul cu delta grafului, oracolele și
 * scenele măsurate de harta B5 și de panoul IDX (lărgire20, mina20, zidul M10, grila M10 pe n×n chunk-uri).
 *
 * Un LOT = punctul unic de sincronizare (`sincronizeazaLumea`, temperatura.ts: indexul, delta grafului, proveniența), cu
 * `SchimbareCamere` lui; tickul = `stepAgents` + lot + pasul de 1 Hz + `w.tick++` (exact `tick` din world.ts, cu
 * schimbarea lotului întoarsă). Testele care ascund un lot de graf cheamă direct `sincronizeazaCamere` și
 * `actualizeazaGraful` (nivelul grafului, nu al lumii).
 */

import assert from 'node:assert/strict'
import { stepAgents } from '../src/sim/agents.ts'
import type { IndexCamere, SchimbareCamere } from '../src/sim/camere.ts'
import { construiesteCamere, listaComponente, sincronizeazaCamere } from '../src/sim/camere.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { capacitateMu, contoareComponentei } from '../src/sim/fete.ts'
import { buildM10PeLume } from '../src/harness/fixture-m10.ts'
import { Faction, Item } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import type { Outcome } from '../src/sim/result.ts'
import { CHUNK_CELLS, Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill, groundLevelM } from '../src/sim/terrain/terrain.ts'
import type { GrafIncremental } from '../src/sim/termic.ts'
import { actualizeazaGraful, construiesteGrafIncremental, formaCanonicaGraf, formaCanonicaGrafIncremental, grafTermic, grafulIncremental, statGraf } from '../src/sim/termic.ts'
import { createWorld } from '../src/sim/world.ts'
import { pasTermic, sincronizeazaLumea } from '../src/sim/temperatura.ts'
import { R, sitPlat } from './fixturi.ts'

/**
 * Un lot la nivelul GRAFULUI (fără temperatură): `sincronizeazaCamere` + `actualizeazaGraful`. Doar pentru testele care
 * ascund un lot de graf sau de punctul unic; o lume care trece pe aici are ștampila temperaturii în urmă.
 */
export function lotGraf(w: World): SchimbareCamere {
  const sch = sincronizeazaCamere(w.camere, w.terrain)
  bun(actualizeazaGraful(w.camere, sch, R), 'actualizeazaGraful')
  return sch
}

/** Un lot: punctul unic de sincronizare (indexul, delta grafului, proveniența), cu schimbarea indexului. */
export function lot(w: World): SchimbareCamere {
  return bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea').sch
}

/**
 * Valoarea unui Outcome acceptat; un refuz pică testul cu motivul. Mesajul se scrie DOAR la refuz: un `JSON.stringify` pe
 * graful acceptat (tablouri pe sloturi, mii de contribuții) costa ~0,5 s pe apel pe M10 — testul zidului dura 200 s.
 */
export function bun<T>(o: Outcome<T>, ce: string): T {
  if (!o.ok) assert.fail(`${ce}: ${JSON.stringify(o)}`)
  return o.value
}

/** Tickul lumii (world.ts: `stepAgents → sincronizeazaLumea → pasTermic la w.tick % tps === 0 → w.tick++`), cu schimbarea lotului. */
export function tickCuGraf(w: World): SchimbareCamere {
  stepAgents(w, R)
  const sch = lot(w)
  if (w.tick % R.ticksPerSecond === 0) pasTermic(w, R)
  w.tick++
  return sch
}

/** Graful incremental al lumii, la zi (altfel testul pică). */
export function graf(w: World): GrafIncremental {
  return bun(grafulIncremental(w.camere, R), 'grafulIncremental')
}

/** Forma canonică a grafului incremental (un refuz la citire face testul să pice). */
export function canonic(idx: IndexCamere, g: GrafIncremental): string[] {
  return bun(formaCanonicaGrafIncremental(idx, g), 'forma canonica')
}

/** Prefixul unui rând de nod: rândul t.2a (`formaCanonicaGraf`), fără contoare și C'. */
export function prefixT2a(linie: string): string {
  return linie.startsWith('N ') ? linie.split(' | ').slice(0, 3).join(' | ') : linie
}

/** Oracolul pe ACELAȘI index: graful incremental == cel construit integral pe el (10–14 ms pe M10). */
export function egalCuIntegralul(w: World, ce: string): void {
  const i = bun(construiesteGrafIncremental(w.camere, R), `${ce}: integral`)
  assert.deepEqual(canonic(w.camere, graf(w)), canonic(w.camere, i), `${ce}: graful incremental fata de cel integral`)
}

/**
 * Oracolul pe un index NOU (construit de la zero pe teren): graful incremental == graful integral al indexului nou; prefixul
 * fiecărui rând == graful t.2a al lui (alt cod: memoria pe epocă, muchia din capătul mic); C' pe nod == C' din contoarele
 * componentei pe indexul nou (`contoareComponentei`, o sumă în afara grafului).
 */
export function egalCuIndexulNou(w: World, ce: string): void {
  const nou = construiesteCamere(w.terrain, R.termic.kCelule, R.termic.dSolMasivM)
  const i = bun(construiesteGrafIncremental(nou, R), `${ce}: integral pe indexul nou`)
  const a = canonic(w.camere, graf(w))
  assert.deepEqual(a, canonic(nou, i), `${ce}: graful incremental fata de un index nou`)
  const t = bun(grafTermic(nou, R), `${ce}: t.2a`)
  assert.deepEqual(a.map(prefixT2a), formaCanonicaGraf(t), `${ce}: fata de graful t.2a al indexului nou`)
  const cPeAncora = new Map<number, number>()
  for (const l of a) {
    if (!l.startsWith('N ')) continue
    cPeAncora.set(Number(l.slice(2, l.indexOf(' ', 2))), Number(l.slice(l.lastIndexOf(' C') + 2)))
  }
  for (const c of listaComponente(nou)) {
    const k = bun(contoareComponentei(nou, c), `${ce}: contoarele`)
    assert.equal(cPeAncora.get(c.ancora), capacitateMu(k, R.termic.mase), `${ce}: C' pe nodul ${c.ancora}`)
  }
}

export function faraUrgente(w: World, ce: string): void {
  assert.equal(statGraf(w.camere).refaceriDeUrgenta, 0, `${ce}: refaceri de urgenta`)
}

/** Diferența contoarelor grafului incremental față de o copie (K05). */
export function delta(w: World, inainte: ReturnType<typeof statGraf>): Record<string, number> {
  const s = statGraf(w.camere)
  const out: Record<string, number> = {}
  for (const k of ['S', 'recalculate', 'mutate', 'parcurseMostenire', 'noduriNoi', 'mosteniri', 'perechiAdunate', 'loturi', 'construiri', 'refaceriDeUrgenta'] as const) out[k] = s[k] - inainte[k]
  return out
}

export const gAt = (w: World, x: number, y: number): number => {
  const g = groundLevelM(w.terrain, x, y)
  assert.ok(g.ok)
  return g.value
}

/** M10 pe o lume (fixtura reală, 677 de componente), cu graful construit (primul lot). */
export function lumeM10(seed = 20260913): World {
  const w = createWorld(seed)
  assert.ok(applyCommand(w, { kind: 'setFocus', cx: 300, cy: 300 }).ok)
  buildM10PeLume(w, R, 300, 300)
  lot(w)
  return w
}

/**
 * Grila M10 pe `n`×`n` chunk-uri (harta B5, `lumeM10n`): camerele 10×10×3 la pasul 16, coridoarele, zidul și turnurile,
 * pentru K05 (aceeași sarcină pe așezări de mărimi diferite), cu graful construit.
 */
export function lumeM10n(n: number, seed = 20260913, cx = 300, cy = 300): World {
  const w = createWorld(seed)
  assert.ok(applyCommand(w, { kind: 'setFocus', cx: cx + (n >> 1), cy: cy + (n >> 1) }).ok)
  const t = w.terrain
  const baseX = cx * CHUNK_CELLS, baseY = cy * CHUNK_CELLS, span = n * CHUNK_CELLS
  const digAt = (x: number, y: number, d: number): void => {
    const g = groundLevelM(t, x, y)
    if (g.ok) dig(t, x, y, g.value - d)
  }
  const fillAt = (x: number, y: number, h: number): void => {
    const g = groundLevelM(t, x, y)
    if (g.ok) fill(t, x, y, g.value + h, Material.PIATRA_CONSTRUITA)
  }
  for (let ry = 3; ry + 10 <= span; ry += 16) for (let rx = 3; rx + 10 <= span; rx += 16) for (let d = 1; d <= 3; d++) for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) digAt(baseX + rx + x, baseY + ry + y, d)
  for (let ry = 0; ry < span; ry += 64) for (let x = 0; x < span; x++) for (let d = 1; d <= 2; d++) digAt(baseX + x, baseY + ry, d)
  for (let rx = 0; rx < span; rx += 64) for (let y = 0; y < span; y++) for (let d = 1; d <= 2; d++) digAt(baseX + rx, baseY + y, d)
  for (let i = 0; i < span; i++) for (let h = 1; h <= 4; h++) {
    fillAt(baseX + i, baseY, h)
    fillAt(baseX, baseY + i, h)
  }
  for (let rx = 0; rx + 5 < span; rx += 128) for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    if (!(x === 0 || y === 0 || x === 4 || y === 4)) continue
    for (let h = 1; h <= 9; h++) fillAt(baseX + rx + x, baseY + 2 + y, h)
  }
  lot(w)
  return w
}

/**
 * Scena „lărgire" (verificatorul L2-2, harta B5): pe M10, 5 camere vecine își lărgesc pereții — inele de desemnări 1..3 la
 * g−3 și g−2, `pioniPeCamera` pioni în fiecare, hrană; camerele se unesc între ele și cu rețeaua de coridoare.
 */
export function scenaLargire(w: World, pioniPeCamera = 4): { des: number; pioni: number } {
  const bx = 300 * 32, by = 300 * 32
  let des = 0, pioni = 0
  const ry = 3 + 16
  for (let k = 1; k <= 5; k++) {
    const rx = 3 + 16 * k
    for (let ring = 1; ring <= 3; ring++) for (let x = rx - ring; x <= rx + 9 + ring; x++) for (let y = ry - ring; y <= ry + 9 + ring; y++) {
      if (x !== rx - ring && x !== rx + 9 + ring && y !== ry - ring && y !== ry + 9 + ring) continue
      const g = gAt(w, bx + x, by + y)
      for (const d of [3, 2]) if (applyCommand(w, { kind: 'desemneaza', wx: bx + x, wy: by + y, z: g - d }, R).ok) des++
    }
    for (let i = 0; i < pioniPeCamera; i++) {
      const x = bx + rx + 2 + i * 2, y = by + ry + 5
      if (applyCommand(w, { kind: 'spawnAgent', x: x * 1000 + 500, y: y * 1000 + 500, z: gAt(w, x, y) - 3, faction: Faction.ASEZARE }, R).ok) pioni++
    }
    for (let i = 0; i < 3; i++) {
      const x = bx + rx + 1 + i * 3, y = by + ry + 1
      applyCommand(w, { kind: 'lasaItem', fel: Item.HRANA, cantitate: 75, wx: x, wy: y, z: gAt(w, x, y) - 3 }, R)
    }
  }
  return { des, pioni }
}

/** Mina N×N×3 cu stâlpi la 4 m (seed 777), inele de desemnări la −3/−4 și `P` pioni (harta B5), cu graful construit. */
export function lumeMina(N: number, P: number): World {
  const s = sitPlat(777, 8)
  const w = s.w
  const t = w.terrain, x0 = s.wx + 2, y0 = s.wy + 2
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (x % 4 === 0 && y % 4 === 0) continue
    for (let d = 2; d <= 4; d++) dig(t, x0 + x, y0 + y, gAt(w, x0 + x, y0 + y) - d)
  }
  lot(w)
  for (let r = 0; r < 3; r++) for (let i = -1 - r; i <= N + r; i++) for (const [x, y] of [[i, -1 - r], [i, N + r], [-1 - r, i], [N + r, i]] as const) {
    const g = gAt(w, x0 + x, y0 + y)
    for (const d of [3, 4]) applyCommand(w, { kind: 'desemneaza', wx: x0 + x, wy: y0 + y, z: g - d }, R)
  }
  for (let i = 0; i < P; i++) {
    const x = x0 + 1 + ((i * 11) % (N - 2)), y = y0 + 1 + ((i * 17) % (N - 2))
    if (x % 4 === 0 && y % 4 === 0) continue
    applyCommand(w, { kind: 'spawnAgent', x: x * 1000 + 500, y: y * 1000 + 500, z: gAt(w, x, y) - 4, faction: Faction.ASEZARE }, R)
  }
  for (let i = 0; i < 16; i++) {
    const x = x0 + 1 + i * 4, y = y0 + 1
    applyCommand(w, { kind: 'lasaItem', fel: Item.HRANA, cantitate: 75, wx: x, wy: y, z: gAt(w, x, y) - 4 }, R)
  }
  return w
}

/** Celulele de zid de lângă camerele M10 (peretele de est, d 1..3), câte 3 pe cameră (harta B5, `zidLangaCamere`). */
export function zidLangaCamere(w: World, nCamere: number): [number, number, number][] {
  const bx = 300 * 32, by = 300 * 32
  const out: [number, number, number][] = []
  for (let k = 0; k < nCamere; k++) {
    const rx = 3 + 16 * (1 + (k % 6)), ry = 3 + 16 * (1 + ((k / 6) | 0) * 2)
    for (const d of [1, 2, 3]) {
      const x = bx + rx + 10, y = by + ry + 4 + (k % 3)
      out.push([x, y, gAt(w, x, y) - d])
    }
  }
  return out
}
