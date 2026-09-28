/**
 * Mormanele de resurse: partea pura (viewer/resurse.ts) si CONTRACTUL fisierelor generate in Blender
 * (viewer/public/resurse/, de tools/assets/resurse.py) — citit fara Blender, deci ruleaza si in CI.
 *
 * Contractul e ce presupune viewer-ul: 12 plase numite `<fel>_<treapta>`, cu culoare pe varf, cu baza
 * pe y = 0 si amprenta intr-o celula (±0,45 m), mai inalte pe treapta mai mare, si ieftine (pana la 4096
 * de mormane pe harta). Iconitele: 128×128, cu transparenta.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { Item } from '../src/sim/state.ts'
import { FEL_RESURSA, instanteMormane, liniarInSrgb, numePlasa, rotatiaMormanului, treaptaMormanului, TREPTE } from '../viewer/resurse.ts'
import { laSit, lasaItem, R } from './fixturi.ts'

const RAD = resolve(import.meta.dirname, '..', 'viewer', 'public', 'resurse')
const FELURI = [Item.PIATRA, Item.PAMANT, Item.LEMN, Item.HRANA]
/** Pana la 4096 de mormane pe harta: plafonul pe plasa tine si cel mai rau caz sub ~1,8 M de triunghiuri. */
const TRIUNGHIURI_MAX = 450

test('resurse: treapta pe treimi din itemStackMax (1-25 mic, 26-50 mediu, 51-75 mare)', () => {
  const t = (c: number) => treaptaMormanului(c, 75)
  assert.deepEqual([1, 25, 26, 50, 51, 75].map(t), [0, 0, 1, 1, 2, 2])
  assert.equal(treaptaMormanului(10, 30), 0)
  assert.equal(treaptaMormanului(11, 30), 1)
})

test('resurse: numele plasei si rotatia, functii pure de fel si de celula', () => {
  assert.equal(numePlasa(Item.LEMN, 2), 'lemn_2')
  assert.equal(numePlasa(Item.HRANA, 0), 'hrana_0')
  const r = rotatiaMormanului(12391, 4603)
  assert.equal(rotatiaMormanului(12391, 4603), r)
  assert.ok(r >= 0 && r < Math.PI * 2)
  // Vecinii nu sunt rotiti la fel: 8 celule vecine dau cel putin 6 unghiuri diferite (pe hartie, un hash).
  const u = new Set<string>()
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) u.add(rotatiaMormanului(100 + dx, 200 + dy).toFixed(3))
  assert.ok(u.size >= 6, `doar ${u.size} unghiuri distincte`)
})

test('resurse: instantele din lume, pe plasa; mormanele moarte nu apar', () => {
  const { w, sit } = laSit(4242, 1)
  lasaItem(w, Item.PIATRA, 10, sit.wx + 2, sit.wy + 2)
  lasaItem(w, Item.PIATRA, 60, sit.wx + 3, sit.wy + 2)
  lasaItem(w, Item.HRANA, 40, sit.wx + 4, sit.wy + 2)
  const mort = lasaItem(w, Item.LEMN, 5, sit.wx + 5, sit.wy + 2)
  w.iteme.alive[w.iteme.laId.get(mort)!] = 0
  const inst = instanteMormane(w, R.itemStackMax)
  assert.deepEqual([...inst.keys()].sort(), ['hrana_1', 'piatra_0', 'piatra_2'])
  const p = inst.get('piatra_2')![0]!
  assert.deepEqual([p.wx, p.wy], [sit.wx + 3, sit.wy + 2])
  assert.equal(p.rot, rotatiaMormanului(sit.wx + 3, sit.wy + 2))
})

test('resurse: culoarea liniara din fisier trece in conventia terenului (sRGB)', () => {
  assert.equal(liniarInSrgb(0), 0)
  assert.ok(Math.abs(liniarInSrgb(1) - 1) < 1e-12)
  // Pe hartie: sRGB 0,5 e liniar 0,2140.
  assert.ok(Math.abs(liniarInSrgb(0.214041) - 0.5) < 1e-4)
})

// ---------------------------------------------------------------------------------------------
// contractul fisierelor din Blender
// ---------------------------------------------------------------------------------------------

interface Plasa { nume: string; triunghiuri: number; min: number[]; max: number[]; culoare: boolean }

function citesteGlb(cale: string): { plase: Plasa[]; materiale: number } {
  const b = readFileSync(cale)
  assert.equal(b.toString('ascii', 0, 4), 'glTF', 'nu e un .glb')
  const lenJson = b.readUInt32LE(12)
  const json = JSON.parse(b.subarray(20, 20 + lenJson).toString('utf8')) as {
    meshes: { name: string; primitives: { attributes: Record<string, number>; indices?: number }[] }[]
    accessors: { count: number; min?: number[]; max?: number[] }[]
    materials?: unknown[]
  }
  const plase = json.meshes.map((m) => {
    const pr = m.primitives[0]!
    const pos = json.accessors[pr.attributes.POSITION!]!
    const tri = (pr.indices !== undefined ? json.accessors[pr.indices]!.count : pos.count) / 3
    return { nume: m.name, triunghiuri: tri, min: pos.min!, max: pos.max!, culoare: pr.attributes.COLOR_0 !== undefined }
  })
  return { plase, materiale: json.materials?.length ?? 0 }
}

test('resurse: mormane.glb are cele 12 plase, cu culoare pe varf, in celula, ieftine', () => {
  const cale = resolve(RAD, 'mormane.glb')
  const { plase, materiale } = citesteGlb(cale)
  const asteptate = FELURI.flatMap((f) => Array.from({ length: TREPTE }, (_, t) => numePlasa(f, t))).sort()
  assert.deepEqual(plase.map((p) => p.nume).sort(), asteptate)
  assert.equal(materiale, 1, 'un singur material: culoarea e pe varf')
  for (const p of plase) {
    assert.ok(p.culoare, `${p.nume}: fara COLOR_0`)
    assert.ok(Math.abs(p.min[1]!) < 1e-3, `${p.nume}: baza la y = ${p.min[1]}`)
    for (const k of [0, 2]) assert.ok(Math.abs(p.min[k]!) <= 0.45 + 1e-3 && Math.abs(p.max[k]!) <= 0.45 + 1e-3, `${p.nume}: iese din celula (${p.min} … ${p.max})`)
    assert.ok(p.triunghiuri <= TRIUNGHIURI_MAX, `${p.nume}: ${p.triunghiuri} triunghiuri`)
  }
  // Mai mult marfa, morman mai inalt: pe fiecare fel, inaltimea creste (nestrict la hrana: sacii
  // se inmultesc, nu cresc).
  for (const f of FELURI) {
    const h = Array.from({ length: TREPTE }, (_, t) => plase.find((p) => p.nume === numePlasa(f, t))!.max[1]!)
    assert.ok(h[0]! < h[2]! && h[0]! <= h[1]! && h[1]! <= h[2]!, `${FEL_RESURSA[f]}: inaltimi ${h}`)
  }
  assert.ok(statSync(cale).size < 400 * 1024, 'fisierul a crescut peste 400 KiB')
})

test('resurse: iconitele UI-ului, 128×128 cu transparenta, cate una pe fel', () => {
  for (const f of FELURI) {
    const b = readFileSync(resolve(RAD, 'icoane', `${FEL_RESURSA[f]}.png`))
    assert.equal(b.toString('ascii', 1, 4), 'PNG')
    // IHDR: latimea, inaltimea, adancimea, tipul de culoare (6 = RGBA).
    assert.equal(b.readUInt32BE(16), 128)
    assert.equal(b.readUInt32BE(20), 128)
    assert.equal(b[25], 6, `${FEL_RESURSA[f]}: fara canal alfa`)
  }
})
