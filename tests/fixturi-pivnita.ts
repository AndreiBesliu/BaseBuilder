/**
 * Fixturile acceptanței pivniței (S24-27 t.2b §9, verif-JOC-4): pivnița săpată sub casă PROGRESIV, prin comenzi `dig`
 * (o celulă la 55 de tickuri, ca pionii), cu ușa pusă prin comenzi `fill` USA, și regimul periodic al geometriei finale
 * (anul 2 al unei rulări de 3 ani, cu inerție), pe același tick. Plus geometriile verdictului „fără casă" (rampa + ușa,
 * 1 m și 2 m de pământ deasupra).
 */

import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { componentaLa } from '../src/sim/camere.ts'
import { momentul, tickuriPeAn, tickuriPeOra } from '../src/sim/calendar.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill } from '../src/sim/terrain/terrain.ts'
import { pasTermic, sincronizeazaLumea } from '../src/sim/temperatura.ts'
import { tick } from '../src/sim/world.ts'
import { avanseazaTermic, bun, laEchilibru } from './fixturi-pas.ts'
import { R, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA
export const AN = tickuriPeAn(R)
export const ORA = tickuriPeOra(R)
export const ZI = R.calendar.ziTicks
const TPS = R.ticksPerSecond

/** Primul tick ≥ `deLa` care e (anotimpul a, ziua zi, ora h:00). */
export function tickLa(deLa: number, a: number, zi: number, h: number): number {
  const tinta = (a * R.calendar.zilePeAnotimp + (zi - 1)) * ZI + h * ORA
  let d = tinta - momentul(deLa, R).tickInAn
  if (d < 0) d += AN
  return deLa + d
}

/** Casa de piatră 7×7 (interior 5×5×2) cu ușa 1×2 pe latura de sud și acoperișul la g+3. */
function casa(w: World, hx: number, hy: number, g: number): void {
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
    if (dx !== 0 && dx !== 6 && dy !== 0 && dy !== 6) continue
    assert.ok(fill(w.terrain, hx + dx, hy + dy, z, dx === 3 && dy === 0 ? Material.USA : P).ok)
  }
  for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) assert.ok(fill(w.terrain, hx + dx, hy + dy, g + 3, P).ok)
}

/** Celulele săpate (rampa prin podea, apoi pivnița 3×3×2 de sus în jos) și cele două celule ale ușii, ca în verif-JOC-4. */
function plan(hx: number, hy: number, g: number): { sapa: [number, number, number][]; usi: [number, number, number][]; piv: [number, number, number]; casa: [number, number, number] } {
  const sapa: [number, number, number][] = [[hx + 1, hy + 1, g], [hx + 2, hy + 1, g], [hx + 2, hy + 1, g - 1], [hx + 3, hy + 1, g], [hx + 3, hy + 1, g - 1], [hx + 3, hy + 1, g - 2], [hx + 3, hy + 2, g - 1], [hx + 3, hy + 2, g - 2]]
  for (const z of [g - 1, g - 2]) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) sapa.push([hx + 2 + dx, hy + 3 + dy, z])
  return { sapa, usi: [[hx + 3, hy + 2, g - 2], [hx + 3, hy + 2, g - 1]], piv: [hx + 3, hy + 4, g - 2], casa: [hx + 3, hy + 3, g + 1] }
}

export interface Sapat {
  readonly w: World
  /** Tickul la care s-a pus a doua celulă a ușii (pivnița închisă). */
  readonly tInchidere: number
  readonly piv: [number, number, number]
  readonly casa: [number, number, number]
}

/**
 * Pivnița săpată sub casă prin comenzi, de la `tStart`: `casaDeLa = 'regim'` — casa stă de două zile (de la echilibru),
 * `'acoperis'` — casa se închide chiar la `tStart` (prima toamnă: acoperișul pus atunci, T din proveniență). O celulă la 55
 * de tickuri, ușa în două celule la 95 de tickuri.
 */
export function sapaPivnita(tStart: number, casaDeLa: 'regim' | 'acoperis'): Sapat {
  const { w, wx, wy, g } = sitPlat(12345, 22)
  const hx = wx + 4, hy = wy + 4
  casa(w, hx, hy, g)
  if (casaDeLa === 'regim') {
    bun(sincronizeazaLumea(w, R), 'casa')
    laEchilibru(w, tStart - 2 * ZI)
    avanseazaTermic(w, tStart)
  } else {
    w.tick = tStart
    bun(sincronizeazaLumea(w, R), 'casa')
  }
  const p = plan(hx, hy, g)
  const pana = (t: number): void => {
    while (w.tick < t) tick(w, R)
  }
  for (const [x, y, z] of p.sapa) {
    pana(w.tick + 55)
    assert.ok(applyCommand(w, { kind: 'dig', wx: x, wy: y, z }, R).ok, `dig ${x - hx},${y - hy},${z - g}`)
  }
  for (const [x, y, z] of p.usi) {
    pana(w.tick + 95)
    assert.ok(applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: Material.USA }, R).ok, `usa ${x - hx},${y - hy},${z - g}`)
  }
  const cp = componentaLa(w.camere, ...p.piv)
  const cc = componentaLa(w.camere, ...p.casa)
  assert.ok(cp && cc && cp.id !== cc.id && cp.deschise === 0, 'fixtura: pivnita e o incapere, despartita de casa')
  return { w, tInchidere: w.tick, piv: p.piv, casa: p.casa }
}

/** O lume cu geometria FINALĂ zidită direct (casa, rampa, pivnița, ușa), la echilibru în tickul 0. */
function geometriaFinala(): { w: World; piv: [number, number, number] } {
  const { w, wx, wy, g } = sitPlat(12345, 22)
  const hx = wx + 4, hy = wy + 4
  casa(w, hx, hy, g)
  const p = plan(hx, hy, g)
  for (const [x, y, z] of p.sapa) assert.ok(dig(w.terrain, x, y, z).ok)
  for (const [x, y, z] of p.usi) assert.ok(fill(w.terrain, x, y, z, Material.USA).ok)
  bun(sincronizeazaLumea(w, R), 'geometria finala')
  laEchilibru(w, 0)
  return { w, piv: p.piv }
}

/**
 * Seria T (°C) a unei componente în regimul periodic: 3 ani de pași de la echilibrul din tickul 0 (anul 2 nu mai depinde
 * de pornire — verif-JOC-4), valoarea de după pasul fiecărui tick de pas al anului 3, pe (tick % AN) / tps.
 */
export function regimPeriodic(w: World, cel: [number, number, number]): (tk: number) => number {
  const id = componentaLa(w.camere, ...cel)!.id
  const serie = new Float64Array(AN / TPS)
  for (let tk = 0; tk < 3 * AN; tk += TPS) {
    w.tick = tk
    pasTermic(w, R)
    if (tk >= 2 * AN) serie[(tk % AN) / TPS] = w.temperatura.slot.t[id]! / 65536
  }
  return (tk: number): number => serie[Math.floor((tk % AN) / TPS)]!
}

/** Regimul periodic al pivniței pe geometria finală (casa, rampa, pivnița, ușa). */
export function regimulPivnitei(): (tk: number) => number {
  const { w, piv } = geometriaFinala()
  return regimPeriodic(w, piv)
}

/** Geometria verdictului: pivnița 3×3×2 FĂRĂ casă, cu rampă în linie dreaptă și ușa 1×2, sub `k` m de pământ. */
export function faraCasa(k: number): { w: World; piv: [number, number, number] } {
  const { w, wx, wy, g } = sitPlat(12345, 22)
  const hx = wx + 4, hy = wy + 4
  const zSus = g - k
  const zJos = g - k - 1
  const sapa: [number, number, number][] = []
  const usi: [number, number, number][] = []
  let x = hx + 1
  for (let i = 0; i < k + 2; i++, x++) for (let z = g - i; z <= g; z++) sapa.push([x, hy + 1, z])
  const xp = x - 1
  const px0 = xp - 1
  for (const z of [zJos, zSus]) {
    sapa.push([xp, hy + 2, z])
    usi.push([xp, hy + 2, z])
  }
  const py0 = hy + 3
  for (const z of [zJos, zSus]) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) sapa.push([px0 + dx, py0 + dy, z])
  for (const [cx, cy, cz] of sapa) assert.ok(dig(w.terrain, cx, cy, cz).ok)
  for (const [cx, cy, cz] of usi) assert.ok(fill(w.terrain, cx, cy, cz, Material.USA).ok)
  bun(sincronizeazaLumea(w, R), 'fara casa')
  laEchilibru(w, 0)
  const piv: [number, number, number] = [px0 + 1, py0 + 1, zJos]
  const c = componentaLa(w.camere, ...piv)
  assert.ok(c && c.deschise === 0, 'fixtura: pivnita fara casa e sigilata')
  return { w, piv }
}
