/**
 * Prefiltrul overlay-ului de stabilitate: cate o scena pentru fiecare garda care n-avea nicio
 * proba (recenzia grinzii, 26.09, lentila plasei si verificatorul R2) — marginea ferestrei, cu si
 * fara grinzi; aerul de la zA+1; cautarea grinzilor dincolo de rombul inscris in fereastra.
 * Adevarul e `stareSapat` pe FIECARE celula solida din fereastra; prefiltrul are voie sa
 * scaneze in plus, nu sa sara.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { Prefiltru, prefiltruStabilitate, Sol, solLa, StareSapat, stareSapat } from '../src/sim/stabilitate.ts'
import type { World } from '../src/sim/state.ts'
import { laSit, patratPlat, R, solid } from './fixturi.ts'

function sitRoca(r: number): { w: World; bx: number; by: number; zA: number } {
  const { w, sit } = laSit(4242, 0)
  let gmin = 1 << 20
  for (let x = sit.wx - r; x <= sit.wx + r; x++) for (let y = sit.wy - r; y <= sit.wy + r; y++) {
    const g = solid(w, x, y)
    assert.notEqual(g, null, 'fixtura: apa')
    gmin = Math.min(gmin, g!)
  }
  return { w, bx: sit.wx, by: sit.wy, zA: gmin - 3 }
}
const dig = (w: World, x: number, y: number, z: number): void => assert.ok(applyCommand(w, { kind: 'dig', wx: x, wy: y, z }, R).ok, `fixtura: dig ${x},${y},${z}`)
const grinda = (w: World, x: number, y: number, z: number): void => {
  dig(w, x, y, z)
  assert.ok(applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: Material.GRINDA }, R).ok, 'fixtura: grinda')
}
function ascunse(w: World, fx: number, fy: number, lat: number, zA: number): { cade: number; periculoase: number; ascunse: number } {
  const f = prefiltruStabilitate(w.terrain, R, fx, fy, lat, zA)
  let cade = 0, p = 0, a = 0
  for (let i = 0; i < lat; i++) for (let j = 0; j < lat; j++) {
    if (solLa(w.terrain, fx + i, fy + j, zA) !== Sol.SOLID) continue
    const st = stareSapat(w.terrain, R, fx + i, fy + j, zA)
    if (st !== StareSapat.CADE && st !== StareSapat.ULTIMA_CELULA) continue
    p++
    if (st === StareSapat.CADE) cade++
    if (f[i * lat + j] !== Prefiltru.DE_SCANAT) a++
  }
  return { cade, periculoase: p, ascunse: a }
}

test('marginea: o grinda la 1..4 pasi de margine tine un tavan DINCOLO de ea', () => {
  const { w, bx, by, zA } = sitRoca(45)
  grinda(w, bx, by, zA)
  for (let x = bx - 3; x <= bx + 3; x++) for (let y = by + 5; y <= by + 11; y++) dig(w, x, y, zA - 1)
  for (let e = 1; e <= 4; e++) {
    const r = ascunse(w, bx - 16, by + e - 32, 33, zA)
    assert.ok(r.cade >= e, `fixtura: la margine ${e} doar ${r.cade} CADE`)
    assert.equal(r.ascunse, 0, `grinda la ${e} de margine: ${r.ascunse} din ${r.periculoase} ascunse`)
  }
})

test('marginea, fara grinzi: pivnita imediat dincolo, si tavan cu suport 1 dupa un sant', () => {
  {
    const { w, bx, by, zA } = sitRoca(45)
    for (let x = bx - 7; x <= bx - 1; x++) for (let y = by - 3; y <= by + 3; y++) dig(w, x, y, zA - 1)
    const r = ascunse(w, bx, by - 12, 25, zA)
    assert.ok(r.cade > 0, 'fixtura: nimic CADE la margine')
    assert.equal(r.ascunse, 0, `pivnita dincolo: ${r.ascunse} din ${r.periculoase}`)
  }
  {
    const { w, bx, by, zA } = sitRoca(45)
    for (let x = bx - 4; x <= bx - 2; x++) for (let y = by - 2; y <= by + 2; y++) dig(w, x, y, zA - 1)
    for (let y = by - 3; y <= by + 3; y++) dig(w, bx - 1, y, zA)
    assert.equal(stareSapat(w.terrain, R, bx + 1, by, zA), StareSapat.ULTIMA_CELULA, 'fixtura')
    const r = ascunse(w, bx, by - 16, 33, zA)
    assert.equal(r.ascunse, 0, `sant + tavan: ${r.ascunse} din ${r.periculoase}`)
  }
})

test('aerul de la zA+1: stalp cu placa, privit de la nivelul solului', () => {
  let w: World | null = null
  let T: { x0: number; y0: number; g: number } | null = null
  for (const seed of [12345, 7, 12, 17, 18, 19, 23]) { const r = laSit(seed, 0); T = patratPlat(r.w, r.sit, 13, 2, 40); if (T) { w = r.w; break } }
  assert.ok(w && T, 'fixtura: niciun patrat plat')
  const cx = T!.x0 + 6, cy = T!.y0 + 6, g = T!.g
  for (let z = g + 1; z <= g + 3; z++) assert.ok(applyCommand(w!, { kind: 'fill', wx: cx, wy: cy, z, material: Material.PIATRA_CONSTRUITA }, R).ok)
  for (let r = 1; r <= 3; r++) for (let dx = -r; dx <= r; dx++) for (const dy of new Set([r - Math.abs(dx), -(r - Math.abs(dx))])) {
    assert.ok(applyCommand(w!, { kind: 'fill', wx: cx + dx, wy: cy + dy, z: g + 3, material: Material.PIATRA_CONSTRUITA }, R).ok)
  }
  assert.equal(stareSapat(w!.terrain, R, cx, cy, g), StareSapat.CADE, 'fixtura: baza stalpului')
  const r = ascunse(w!, cx - 12, cy - 12, 25, g)
  assert.equal(r.ascunse, 0, `stalp: ${r.ascunse} din ${r.periculoase}`)
})

test('cautarea grinzilor: grinda la coltul ferestrei, in afara rombului 2·jum', () => {
  // (a) ULTIMA: o pivnita 5×5 tinuta prin drumul spre grinda de la colt.
  {
    const { w, bx, by, zA } = sitRoca(45)
    grinda(w, bx - 1, by, zA)
    for (let x = bx + 7; x <= bx + 11; x++) for (let y = by; y <= by + 4; y++) dig(w, x, y, zA - 1)
    assert.equal(stareSapat(w.terrain, R, bx + 2, by + 2, zA), StareSapat.ULTIMA_CELULA, 'fixtura')
    const r = ascunse(w, bx, by, 25, zA)
    assert.equal(r.ascunse, 0, `colt, pivnita 5x5: ${r.ascunse} din ${r.periculoase}`)
  }
  // (b) CADE: celula de colt de pe drumul drept spre o pivnita 7×7, cu d1 = 9.
  {
    const { w, bx, by, zA } = sitRoca(45)
    grinda(w, bx - 1, by, zA)
    for (let x = bx + 5; x <= bx + 11; x++) for (let y = by - 3; y <= by + 3; y++) dig(w, x, y, zA - 1)
    assert.equal(stareSapat(w.terrain, R, bx, by, zA), StareSapat.CADE, 'fixtura')
    const r = ascunse(w, bx, by, 25, zA)
    assert.equal(r.ascunse, 0, `colt, drum pe margine: ${r.ascunse} din ${r.periculoase}`)
  }
})
