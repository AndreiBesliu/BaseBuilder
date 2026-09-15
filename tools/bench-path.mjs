/**
 * Cat costa un drum.
 *
 *   node tools/bench-path.mjs
 *
 * Cifra care conteaza cel mai mult e ULTIMA: cat costa un REFUZ. Research-ul e
 * explicit — „un A* care esueaza e cel mai scump lucru din joc" — iar tot
 * stratul de regiuni exista ca sa faca refuzul ieftin.
 */

import { findPath, pathLength } from '../src/sim/path.ts'
import { createRegions, ensureArea, isWalkable } from '../src/sim/regions.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { createTerrain, fill, groundLevelM, setFocus } from '../src/sim/terrain/terrain.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { format, repeat } from '../src/harness/measure.ts'

const R = DEFAULT_RULES
const SEED = 777
const CX = 200
const CY = 212
const bx = CX * 32
const by = CY * 32

const t = createTerrain(SEED, 4)
setFocus(t, CX, CY)
const s = createRegions()
const g = groundLevelM(t, bx + 8, by + 8)
ensureArea(t, s, bx + 8, by + 8, g.value + 1, 3, R)

function pe(wx, wy) {
  const gg = groundLevelM(t, wx, wy)
  for (let z = gg.value + 2; z >= gg.value - 4; z--) if (isWalkable(t, wx, wy, z, R)) return { wx, wy, z }
  return null
}

function pad(label, value) {
  console.log(`${label.padEnd(46)} ${value}`)
}

const a = pe(bx + 4, by + 4)
const aproape = pe(bx + 10, by + 8)
const departe = pe(bx + 60, by + 56)

const scurt = repeat(() => {
  const t0 = performance.now()
  findPath(t, s, R, a, aproape)
  return (performance.now() - t0) * 1000
}, 20)
pad('drum scurt (6 celule)', format(scurt, 'µs', 0))

const lung = repeat(() => {
  const t0 = performance.now()
  findPath(t, s, R, a, departe)
  return (performance.now() - t0) * 1000
}, 20)
const p = findPath(t, s, R, a, departe)
pad(`drum lung (${p.ok ? pathLength(p.value) : '?'} celule)`, format(lung, 'µs', 0))
if (p.ok) pad('  noduri explorate', String(p.value.explorate))

// Un refuz: se inchide complet o celula si se cere drum spre ea.
const tx = bx + 20
const ty = by + 20
for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
  const gg = groundLevelM(t, tx + dx, ty + dy)
  if (gg.ok) for (let h = 1; h <= 5; h++) fill(t, tx + dx, ty + dy, gg.value + h, Material.PIATRA_CONSTRUITA)
}
const s2 = createRegions()
ensureArea(t, s2, bx + 4, by + 4, a.z, 3, R)
const inchis = pe(tx, ty)
ensureArea(t, s2, tx, ty, inchis.z, 1, R)

const refuz = repeat(() => {
  const t0 = performance.now()
  findPath(t, s2, R, a, inchis)
  return (performance.now() - t0) * 1000
}, 20)
const rez = findPath(t, s2, R, a, inchis)
console.log('')
pad('REFUZ (nu exista drum)', format(refuz, 'µs', 1))
pad('  motivul', rez.ok ? 'a gasit drum?!' : `${rez.reason} · ${rez.params.motiv ?? ''}`)
