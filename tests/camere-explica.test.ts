/**
 * „De ce nu e încăpere?" — explicația inspectorului (src/sim/camere-explica.ts), pe scene mici
 * zidite direct în teren. Cazurile vin din lentila „jucătorul" a panoului pe design: gaura din
 * acoperiș raportată ca „deschidere în perete" (JUC-1), ușa propusă la intrarea coridorului în loc
 * de golul pivniței (JUC-2).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { sincronizeazaCamere, formaCanonica } from '../src/sim/camere.ts'
import { explicaCelula, scurgeriLaNivel } from '../src/sim/camere-explica.ts'
import type { Explicatie } from '../src/sim/camere-explica.ts'
import { hashWorld } from '../src/sim/hash.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import type { MaterialId } from '../src/sim/terrain/chunk.ts'
import { dig, fill } from '../src/sim/terrain/terrain.ts'
import { sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

/**
 * Inel de ziduri LxL pe [g+1, g+H], cu `usi` (dx, dy) = USA si `goluri` (dx, dy) = aer, pe toata
 * inaltimea; acoperisul la g+H+1 peste `acoperis` ('tot' = toata amprenta, 'interior' = fara inel).
 */
function casa(w: World, x0: number, y0: number, g: number, L: number, H: number, o: { goluri?: [number, number][]; usi?: [number, number][]; acoperis?: 'tot' | 'interior'; gauri?: [number, number][] } = {}): void {
  const t = w.terrain
  const are = (l: [number, number][] | undefined, dx: number, dy: number): boolean => (l ?? []).some(([a, b]) => a === dx && b === dy)
  for (let z = g + 1; z <= g + H; z++) for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
    if (are(o.goluri, dx, dy)) continue
    const m: MaterialId = are(o.usi, dx, dy) ? Material.USA : P
    assert.ok(fill(t, x0 + dx, y0 + dy, z, m).ok)
  }
  for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    const inel = dx === 0 || dx === L - 1 || dy === 0 || dy === L - 1
    if ((o.acoperis ?? 'tot') === 'interior' && inel) continue
    if (are(o.gauri, dx, dy)) continue
    assert.ok(fill(t, x0 + dx, y0 + dy, g + H + 1, P).ok)
  }
  sincronizeazaCamere(w.camere, t)
}

function deschisa(e: Explicatie): Extract<Explicatie, { fel: 'DESCHISA' }> {
  assert.equal(e.fel, 'DESCHISA', JSON.stringify(e))
  return e as Extract<Explicatie, { fel: 'DESCHISA' }>
}

test('explica: incaperea cu usa — volumul, O usa (doua celule), podeaua pe niveluri', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  casa(w, wx, wy, g, 5, 2, { usi: [[2, 0]] })
  const e = explicaCelula(w.terrain, w.camere, wx + 2, wy + 2, g + 1)
  assert.equal(e.fel, 'INCAPERE')
  if (e.fel !== 'INCAPERE') return
  assert.equal(e.volum, 18)
  assert.equal(e.usi, 1, 'o usa de doua celule e O usa')
  assert.deepEqual(e.podea, [[g + 1, 9]])
})

test('explica (JUC-1): o gaura in acoperis iese SUS, cu celula gaurii din planul acoperisului, si fara sfat de usa', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  casa(w, wx, wy, g, 5, 2, { gauri: [[2, 2]] })
  const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 1, wy + 1, g + 1))
  assert.equal(e.directie, 'SUS')
  assert.deepEqual(e.gaura, { x: wx + 2, y: wy + 2, z: g + 3 })
  assert.deepEqual(e.usiPropuse, [])
})

test('explica (JUC-1): golul unei usi iese LATERAL, iar usa propusa in gol inchide incaperea — cu buiandrug si fara', () => {
  for (const acoperis of ['tot', 'interior'] as const) {
    const { w, wx, wy, g } = sitPlat(777, 8)
    casa(w, wx, wy, g, 5, 2, { goluri: [[2, 0]], acoperis })
    const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 2, wy + 3, g + 1))
    assert.equal(e.directie, 'LATERAL', acoperis)
    assert.deepEqual(e.usiPropuse.map((c) => [c.x - wx, c.y - wy, c.z - g]), [[2, 0, 1], [2, 0, 2]], acoperis)
    assert.equal(e.volumCuUsi, 18, acoperis)
  }
})

test('explica: golul unei usi spre o curte inchisa (cerul de la cota usii e marginit) ramane LATERAL, nu „gaura in acoperis"', () => {
  const { w, wx, wy, g } = sitPlat(12345, 16)
  // Casa 5x5 cu golul (2,0) spre o curte: un zid de 3 m in jurul ei, la 3 celule, fara acoperis.
  casa(w, wx + 4, wy + 4, g, 5, 2, { goluri: [[2, 0]] })
  for (let dx = 0; dx < 13; dx++) for (let dy = 0; dy < 13; dy++) {
    if (dx !== 0 && dx !== 12 && dy !== 0 && dy !== 12) continue
    for (let z = g + 1; z <= g + 3; z++) assert.ok(fill(w.terrain, wx + dx, wy + dy, z, P).ok)
  }
  sincronizeazaCamere(w.camere, w.terrain)
  const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 6, wy + 7, g + 1))
  assert.equal(e.directie, 'LATERAL')
  assert.equal(e.volumCuUsi, 18)
})

test('explica: un gol lat de 2 primeste patru celule de usa', () => {
  const { w, wx, wy, g } = sitPlat(4242, 9)
  casa(w, wx, wy, g, 6, 2, { goluri: [[2, 0], [3, 0]] })
  const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 2, wy + 3, g + 1))
  assert.equal(e.usiPropuse.length, 4)
  assert.equal(e.volumCuUsi, 32)
})

test('explica (JUC-2): pivnitele legate de un coridor cu intrare — usa propusa e golul PIVNITEI, nu intrarea', () => {
  const { w, wx, wy, g } = sitPlat(12345, 22)
  const t = w.terrain
  const sapa = (x: number, y: number, z: number): void => { assert.ok(dig(t, wx + x, wy + y, z).ok) }
  // Sub doua straturi de sol: coridorul pe y=6, patru pivnite 3x3 deasupra lui, fiecare cu golul
  // ei de 1x2 spre coridor, si o intrare deschisa la capatul coridorului.
  for (const z of [g - 3, g - 2]) {
    for (let x = 0; x <= 17; x++) sapa(x, 6, z)
    for (const px of [1, 5, 9, 13]) {
      for (let dx = 0; dx < 3; dx++) for (let dy = 1; dy <= 3; dy++) sapa(px + dx, dy, z)
      sapa(px + 1, 4, z)
      sapa(px + 1, 5, z)
    }
  }
  for (const z of [g - 1, g]) sapa(17, 6, z)
  sincronizeazaCamere(w.camere, t)
  const e = deschisa(explicaCelula(t, w.camere, wx + 6, wy + 2, g - 3))
  // Intrarea e un put: din coridor, o gaura in tavan — SUS, cu gaura la gura putului.
  assert.equal(e.directie, 'SUS')
  assert.deepEqual(e.gaura, { x: wx + 17, y: wy + 6, z: g })
  assert.ok(e.pasi > 12, `scurgerea (intrarea) e departe: ${e.pasi} pasi`)
  const usa = e.usiPropuse.map((c) => [c.x - wx, c.y - wy, c.z - g])
  assert.ok(usa.length === 2 && usa.every(([x, y]) => x === 6 && (y === 4 || y === 5)), `usa propusa: ${JSON.stringify(usa)}`)
  assert.equal(e.volumCuUsi, 18 + (usa[0]![1] === 5 ? 2 : 0), 'promisiunea: pivnita (cu golul pana la usa)')
})

test('explica: o pivnita lata de 2 nu primeste usa in mijloc — usa e in golul ei de 1, spre exterior', () => {
  const { w, wx, wy, g } = sitPlat(12345, 14)
  const t = w.terrain
  const sapa = (x: number, y: number, z: number): void => { assert.ok(dig(t, wx + x, wy + y, z).ok) }
  // Pivnita 2x6 sub doua straturi de sol, cu un gol de 1x2 spre o groapa deschisa.
  for (const z of [g - 3, g - 2]) {
    for (let x = 1; x <= 2; x++) for (let y = 1; y <= 6; y++) sapa(x, y, z)
    sapa(1, 7, z)
  }
  for (let z = g - 3; z <= g; z++) sapa(1, 8, z)
  sincronizeazaCamere(w.camere, t)
  const e = deschisa(explicaCelula(t, w.camere, wx + 2, wy + 1, g - 3))
  assert.deepEqual(e.usiPropuse.map((c) => [c.x - wx, c.y - wy, c.z - g]), [[1, 7, -3], [1, 7, -2]])
  assert.equal(e.volumCuUsi, 24)
})

test('explica: doua goluri — doua usi, iar promisiunea vine abia dupa a doua', () => {
  const { w, wx, wy, g } = sitPlat(777, 8)
  casa(w, wx, wy, g, 5, 2, { goluri: [[2, 0], [0, 2]] })
  const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 2, wy + 2, g + 1))
  assert.equal(e.usiPropuse.length, 4)
  assert.equal(e.volumCuUsi, 18)
})

test('explica: scurgerile de la un nivel sunt celulele de cer de langa aerul acoperit deschis; o incapere n-are', () => {
  const { w, wx, wy, g } = sitPlat(777, 16)
  casa(w, wx, wy, g, 5, 2, { goluri: [[2, 0]] })
  casa(w, wx + 8, wy, g, 5, 2, { usi: [[2, 0]] })
  const s = scurgeriLaNivel(w.terrain, w.camere, g + 1).map((c) => [c.x - wx, c.y - wy])
  assert.deepEqual(s, [[2, -1]])
})

test('explica e pura: nu schimba lumea si nici indexul', () => {
  const { w, wx, wy, g } = sitPlat(4242, 9)
  casa(w, wx, wy, g, 6, 2, { goluri: [[2, 0]] })
  const h = hashWorld(w)
  const f = formaCanonica(w.camere)
  const ep = w.camere.epoca
  for (let dx = 1; dx <= 4; dx++) explicaCelula(w.terrain, w.camere, wx + dx, wy + 2, g + 1)
  scurgeriLaNivel(w.terrain, w.camere, g + 1)
  assert.equal(hashWorld(w), h)
  assert.deepEqual(formaCanonica(w.camere), f)
  assert.equal(w.camere.epoca, ep)
})
