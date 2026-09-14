/**
 * Cat costa sistemul de regiuni.
 *
 *   node tools/bench-regions.mjs
 *
 * Cifra care conteaza e a doua: cat dureaza o reconstructie dupa O SINGURA
 * sapatura. Aia cade in cadrul in care jucatorul a dat click.
 */

import { createTerrain, dig, groundLevelM, setFocus } from '../src/sim/terrain/terrain.ts'
import { createRegions, ensureArea, markDirty, rebuildDirty } from '../src/sim/regions.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { format, repeat } from '../src/harness/measure.ts'

const R = DEFAULT_RULES
const SEED = 777
const CX = 200
const CY = 212
const baseX = CX * 32
const baseY = CY * 32

function lume(radiusBlocks) {
  const t = createTerrain(SEED, 4)
  setFocus(t, CX, CY)
  const s = createRegions()
  const g = groundLevelM(t, baseX + 8, baseY + 8)
  ensureArea(t, s, baseX + 8, baseY + 8, g.value + 1, radiusBlocks, R)
  return { t, s, z: g.value + 1 }
}

function pad(label, value) {
  console.log(`${label.padEnd(44)} ${value}`)
}

for (const raza of [1, 2, 3]) {
  const { t, s, z } = lume(raza)
  const blocuri = s.keys.length
  const m = repeat(() => {
    const wx = baseX + 8 + (s.keys.length % 7)
    const wy = baseY + 8
    dig(t, wx, wy, z - 2)
    markDirty(s, wx, wy, z - 2, R)
    const t0 = performance.now()
    rebuildDirty(t, s, R)
    return performance.now() - t0
  }, 8)
  pad(`raza ${raza} bloc(uri) · ${String(blocuri).padStart(4)} blocuri rezidente`, format(m, 'ms'))
}
