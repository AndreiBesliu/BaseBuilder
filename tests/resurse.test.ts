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
import { inflateSync } from 'node:zlib'
import { resolve } from 'node:path'
import { Item } from '../src/sim/state.ts'
import { FEL_RESURSA, instanteMormane, liniarInSrgb, numePlasa, rotatiaMormanului, treaptaMormanului, TREPTE } from '../viewer/resurse.ts'
import { laSit, lasaItem, R } from './fixturi.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { ensureChunk } from '../src/sim/terrain/terrain.ts'
import { CHUNK_CELLS, cellHeightCm, groundLevelFromCm } from '../src/sim/terrain/chunk.ts'
import { meshHeightfield } from '../src/render/heightfield.ts'
import { meshChunk } from '../src/render/mesher.ts'
import { writeQuadIndices } from '../src/render/winding.ts'
import { cotaVizuala } from '../src/render/cota.ts'
import type { World } from '../src/sim/state.ts'

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

// ---------------------------------------------------------------------------------------------
// cota vizuala: mormanul sta pe fata de sus DESENATA, nu pe nivelul intreg (recenzia UI-ului, ECR-1)
// ---------------------------------------------------------------------------------------------

/** Triunghiurile unei geometrii, in coordonate de LUME (x, y = sus, z = wy). */
type Tri = readonly [number, number, number, number, number, number, number, number, number]

/** Cota geometriei desenate sub (x, y): raza verticala intersectata cu triunghiurile — oracolul, fara formula din cota.ts. */
function cotaPeGeometrie(tri: readonly Tri[], x: number, y: number): number | null {
  let sus: number | null = null
  for (const t of tri) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(d) < 1e-12) continue
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (y - cz)) / d
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (y - cz)) / d
    const l3 = 1 - l1 - l2
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue
    const h = l1 * ay + l2 * by + l3 * cy
    if (sus === null || h > sus) sus = h
  }
  return sus
}

function triHeightfield(w: World, cx: number, cy: number): Tri[] {
  const m = meshHeightfield(w.seed, ensureChunk(w.terrain, cx, cy))
  const p = m.positions
  const o = [cx * CHUNK_CELLS, cy * CHUNK_CELLS]
  const v = (i: number) => [p[i * 3]! + o[0]!, p[i * 3 + 1]!, p[i * 3 + 2]! + o[1]!]
  const out: Tri[] = []
  for (let i = 0; i < m.indices.length; i += 3) out.push([...v(m.indices[i]!), ...v(m.indices[i + 1]!), ...v(m.indices[i + 2]!)] as unknown as Tri)
  return out
}

function triVoxeli(w: World, cx: number, cy: number): Tri[] {
  const ch = ensureChunk(w.terrain, cx, cy)
  const m = meshChunk(ch, undefined, true)
  const ix = new Uint32Array(m.quadCount * 6)
  for (let q = 0; q < m.quadCount; q++) writeQuadIndices(m, q, q * 4, ix, q * 6)
  const z0 = ch.voxels!.zBaseM
  const o = [cx * CHUNK_CELLS, cy * CHUNK_CELLS]
  const v = (i: number) => [m.positions[i * 3]! / 100 + o[0]!, m.positions[i * 3 + 2]! / 100 + z0, m.positions[i * 3 + 1]! / 100 + o[1]!]
  const out: Tri[] = []
  for (let i = 0; i < ix.length; i += 3) out.push([...v(ix[i]!), ...v(ix[i + 1]!), ...v(ix[i + 2]!)] as unknown as Tri)
  return out
}

test('resurse: cota vizuala = fata desenata — heightfield-ul (b–c), voxelii netezisi (a–d), o coloana sapata (z)', () => {
  const { w, sit } = laSit(4242, 1)
  // Celule din interiorul chunk-ului (departe de margini): fara vecini, mesher-ul netezeste doar acolo.
  const cx = Math.floor(sit.wx / CHUNK_CELLS), cy = Math.floor(sit.wy / CHUNK_CELLS)
  const puncte: [number, number][] = []
  for (let i = 0; i < 6; i++) puncte.push([cx * CHUNK_CELLS + 6 + i * 4, cy * CHUNK_CELLS + 20 - i * 2])
  const ch = ensureChunk(w.terrain, cx, cy)
  assert.equal(ch.voxels, null, 'fixtura: chunk-ul trebuie sa fie nepromovat la inceput')
  const zSol = (x: number, y: number) => groundLevelFromCm(cellHeightCm(ch, x - cx * CHUNK_CELLS, y - cy * CHUNK_CELLS)) + 1
  const hf = triHeightfield(w, cx, cy)
  let departe = 0
  for (const [x, y] of puncte) for (const [u, v] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7]] as const) {
    const g = cotaPeGeometrie(hf, x + u, y + v)!
    assert.ok(Math.abs(cotaVizuala(w.terrain, x + u, y + v, zSol(x, y)) - g) < 1e-6, `heightfield ${x},${y} (${u},${v})`)
    if (Math.abs(g - zSol(x, y)) > 0.05) departe++
  }
  assert.ok(departe >= 3, `fixtura: terenul e prea plat (${departe}) — cota intreaga ar trece si ea`)
  // Promovarea: o sapatura in alt colt al chunk-ului. Coloanele de mai sus raman naturale, netezite pe a–d.
  const sx = cx * CHUNK_CELLS + 28, sy = cy * CHUNK_CELLS + 28
  assert.ok(applyCommand(w, { kind: 'dig', wx: sx, wy: sy, z: zSol(sx, sy) - 1 }, R).ok)
  assert.notEqual(ensureChunk(w.terrain, cx, cy).voxels, null, 'sapatura trebuia sa promoveze chunk-ul')
  const vx = triVoxeli(w, cx, cy)
  let difera = 0
  for (const [x, y] of puncte) for (const [u, v] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7]] as const) {
    const g = cotaPeGeometrie(vx, x + u, y + v)!
    assert.ok(Math.abs(cotaVizuala(w.terrain, x + u, y + v, zSol(x, y)) - g) < 1e-6, `voxeli ${x},${y} (${u},${v}): ${cotaVizuala(w.terrain, x + u, y + v, zSol(x, y))} fata de ${g}`)
    if (Math.abs(g - (cotaPeGeometrie(hf, x + u, y + v) ?? g)) > 1e-3) difera++
  }
  assert.ok(difera > 0, 'fixtura: diagonalele dau aceeasi cota peste tot — testul n-ar deosebi b–c de a–d')
  // O coloana sapata nu mai e suprafata naturala: fata de sus e plata, cota e nivelul.
  const [px, py] = puncte[0]!
  assert.ok(applyCommand(w, { kind: 'dig', wx: px, wy: py, z: zSol(px, py) - 1 }, R).ok)
  assert.equal(cotaVizuala(w.terrain, px + 0.5, py + 0.5, zSol(px, py) - 1), zSol(px, py) - 1)
  assert.equal(cotaVizuala(w.terrain, px + 0.5, py + 0.5, zSol(px, py)), zSol(px, py), 'pe aerul de deasupra unei gropi: nivelul')
})

test('resurse: instantele poarta cota vizuala a solului, nu nivelul intreg', () => {
  const { w, sit } = laSit(4242, 1)
  lasaItem(w, Item.PIATRA, 60, sit.wx + 3, sit.wy + 2)
  const p = instanteMormane(w, R.itemStackMax).get('piatra_2')![0]!
  assert.equal(p.y, cotaVizuala(w.terrain, p.wx + 0.5, p.wy + 0.5, p.z))
})

/** Un PNG RGBA pe 8 biti, decodat cu zlib-ul din node (filtrele 0–4 pe scanline). */
function citestePng(b: Buffer): { w: number; h: number; px: Uint8Array } {
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20)
  assert.equal(b[24], 8)
  assert.equal(b[25], 6)
  const idat: Buffer[] = []
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o)
    if (b.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const px = new Uint8Array(w * h * 4)
  const rand = w * 4
  for (let y = 0; y < h; y++) {
    const f = raw[y * (rand + 1)]!
    for (let x = 0; x < rand; x++) {
      const v = raw[y * (rand + 1) + 1 + x]!
      const a = x >= 4 ? px[y * rand + x - 4]! : 0
      const up = y > 0 ? px[(y - 1) * rand + x]! : 0
      const c = x >= 4 && y > 0 ? px[(y - 1) * rand + x - 4]! : 0
      const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c)
      const pr = pa <= pb && pa <= pc ? a : pb <= pc ? up : c
      px[y * rand + x] = (v + (f === 1 ? a : f === 2 ? up : f === 3 ? Math.floor((a + up) / 2) : f === 4 ? pr : 0)) & 0xff
    }
  }
  return { w, h, px }
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255)

test('resurse: iconitele se vad pe bara de sus — contrast mediu >= 3:1 fata de #13120f, desenul pe >= 80% din latime', () => {
  // La 20 px in bara, vechile iconite erau pete: 1,3–2,1:1, desen pe ~20% din patrat (recenzia UI-ului, ECR-6).
  const bara = lum(0x13, 0x12, 0x0f)
  for (const f of FELURI) {
    const { w, h, px } = citestePng(readFileSync(resolve(RAD, 'icoane', `${FEL_RESURSA[f]}.png`)))
    let n = 0, r = 0, g = 0, b = 0, x0 = w, x1 = -1
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (px[i + 3]! < 128) continue
      n++; r += px[i]!; g += px[i + 1]!; b += px[i + 2]!
      if (x < x0) x0 = x
      if (x > x1) x1 = x
    }
    const contrast = (lum(r / n, g / n, b / n) + 0.05) / (bara + 0.05)
    assert.ok(contrast >= 3, `${FEL_RESURSA[f]}: contrast ${contrast.toFixed(2)}:1`)
    assert.ok((x1 - x0 + 1) / w >= 0.8, `${FEL_RESURSA[f]}: desenul pe ${x1 - x0 + 1} din ${w} px`)
  }
})
