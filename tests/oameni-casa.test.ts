/**
 * Căldura oamenilor, pe ocuparea REALĂ — S24-27 t.2b §9 (harta B4, F2; decizia 1: „oamenii încălzesc imperceptibil").
 *
 * Casa cu uși a tests/usa.test.ts (parter + etaj, ușile 1×2 și chepengul), ridicată de 4 pioni, cu hrană pentru toată
 * rularea; apoi o zonă de DORMIT 3×3 pe parter (un pat: singurul lucru care ține un om înăuntru, B4). Două lumi în pas:
 * una cu `omW` din content (100 W), una cu `omW = 0` — pionii fac exact aceleași lucruri (simularea nu citește T), deci
 * diferența de T e doar căldura lor. ΔT al parterului, mediat pe a doua zi: în [0,15; 0,35] °C (B4: 0,233–0,237 la
 * echilibru); fără pat < 0,03 (B4: ≤ 0,019).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { componentaLa } from '../src/sim/camere.ts'
import { slotDesemnare } from '../src/sim/desemnari.ts'
import { Faction, Item, Piesa } from '../src/sim/state.ts'
import type { PiesaId, World } from '../src/sim/state.ts'
import { statTermic } from '../src/sim/temperatura.ts'
import { tick } from '../src/sim/world.ts'
import { Zona } from '../src/sim/zone.ts'
import { lasaItem, R, sitPlat } from './fixturi.ts'

type Piesa_ = readonly [number, number, number, PiesaId]

function pereti(o: Piesa_[], L: number, z0: number, z1: number, goluri: readonly (readonly [number, number])[] = []): void {
  for (let z = z0; z <= z1; z++) for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
    if (goluri.some(([a, b]) => a === dx && b === dy)) continue
    o.push([dx, dy, z, Piesa.PERETE])
  }
}
function placa(o: Piesa_[], L: number, z: number, goluri: readonly (readonly [number, number])[] = []): void {
  for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) if (!goluri.some(([a, b]) => a === dx && b === dy)) o.push([dx, dy, z, Piesa.PODEA])
}

/** `casaCuUsa(true)` din tests/usa.test.ts: două încăperi sigilate (parterul 47 m³, etajul 50 m³). */
function casaCuUsa(g: number): Piesa_[] {
  const o: Piesa_[] = []
  pereti(o, 7, g + 1, g + 2, [[3, 0]])
  o.push([3, 0, g + 1, Piesa.USA], [3, 0, g + 2, Piesa.USA])
  o.push([3, 4, g + 1, Piesa.SCARA], [3, 5, g + 1, Piesa.SCARA], [3, 5, g + 2, Piesa.SCARA])
  placa(o, 7, g + 3, [[3, 4], [3, 5]])
  o.push([3, 4, g + 3, Piesa.USA], [3, 5, g + 3, Piesa.USA])
  pereti(o, 7, g + 4, g + 5)
  placa(o, 7, g + 6)
  return o
}

const ZI = R.calendar.ziTicks

/** Șantierul casei, ridicată de 4 pioni, cu reguli date (aceleași comenzi în ambele lumi). */
function santier(rules: Rules): { w: World; x0: number; y0: number; g: number; ids: number[]; wx: number; wy: number } {
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 5, y0 = wy + 4
  const ids: number[] = []
  for (const [dx, dy, z, p] of casaCuUsa(g)) {
    const out = applyCommand(w, { kind: 'desemneaza', wx: x0 + dx, wy: y0 + dy, z, piesa: p }, rules)
    assert.ok(out.ok)
    if (out.ok) ids.push(out.value)
  }
  let piatra = ids.length * 20
  for (let i = 0; piatra > 0; i++) {
    const c = Math.min(60, piatra)
    lasaItem(w, Item.PIATRA, c, wx - 2 + (i % 5), wy + ((i / 5) | 0), rules)
    piatra -= c
  }
  for (let i = 0; i < 10; i++) lasaItem(w, Item.HRANA, 75, wx + 14 + (i % 3), wy - 1 + ((i / 3) | 0), rules)
  for (let i = 0; i < 4; i++) assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 3) * 1000 + 500, y: (wy + 12 + i) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, rules).ok)
  return { w, x0, y0, g, ids, wx, wy }
}

/** ΔT (°C) al parterului între lumea cu oameni și cea cu `omW = 0`, mediat pe a doua zi după casă (și pe pași). */
function deltaParter(pat: boolean): { medie: number; oameni: number } {
  const R0 = parseRules({ ...R, termic: { ...R.termic, omW: 0, mase: undefined } } as unknown as Rules)
  assert.ok(R0.ok)
  const reguli = [R, R0.value] as const
  const lumi = reguli.map((r) => santier(r))
  const [a, b] = lumi as [ReturnType<typeof santier>, ReturnType<typeof santier>]
  const gata = (s: ReturnType<typeof santier>): boolean => s.ids.every((id) => slotDesemnare(s.w.desemnari, id) === -1)
  let t = 0
  while (!gata(a) && t < 30000) {
    tick(a.w, R)
    tick(b.w, reguli[1])
    t++
  }
  assert.ok(gata(a) && gata(b), 'fixtura: casa n-a fost terminata')
  for (const [i, s] of lumi.entries()) {
    if (pat) assert.ok(applyCommand(s.w, { kind: 'picteazaZona', x0: s.x0 + 1, y0: s.y0 + 1, x1: s.x0 + 3, y1: s.y0 + 3, z: s.g + 1, prioritate: 3, fel: Zona.DORMIT }, reguli[i]).ok)
    // Hrană pentru toată rularea (~80 pe om pe zi; hrana de start ține ~3,5 zile, B4).
    for (let k = 0; k < 12; k++) lasaItem(s.w, Item.HRANA, 75, s.wx + 13 + (k % 4), s.wy + 4 + ((k / 4) | 0), reguli[i])
  }
  const cel: [number, number, number] = [a.x0 + 3, a.y0 + 2, a.g + 1]
  let suma = 0
  let n = 0
  for (let k = 0; k < 2 * ZI; k++) {
    tick(a.w, R)
    tick(b.w, reguli[1])
    if (k < ZI || a.w.tick % R.ticksPerSecond !== 1) continue
    const ia = componentaLa(a.w.camere, ...cel)!.id
    const ib = componentaLa(b.w.camere, ...cel)!.id
    suma += (a.w.temperatura.slot.t[ia]! - b.w.temperatura.slot.t[ib]!) / 65536
    n++
  }
  assert.equal(a.w.tick, b.w.tick)
  assert.equal(statTermic(a.w).invarianti + statTermic(b.w).invarianti, 0)
  return { medie: suma / n, oameni: statTermic(a.w).adunariOameni }
}

test('OAMENII pe ocuparea reala (§9, B4): casa cu usi ridicata de 4 pioni, cu pat (DORMIT 3x3) pe parter — ΔT mediu al parterului pe a doua zi in [0,15; 0,35] °C fata de omW = 0; fara pat sub 0,03 °C', () => {
  const cu = deltaParter(true)
  assert.ok(cu.oameni > 0, 'fixtura: oamenii au incalzit')
  assert.ok(cu.medie >= 0.15 && cu.medie <= 0.35, `cu pat: ΔT ${cu.medie.toFixed(3)} °C`)
  const fara = deltaParter(false)
  assert.ok(fara.medie >= 0 && fara.medie < 0.03, `fara pat: ΔT ${fara.medie.toFixed(3)} °C`)
})
