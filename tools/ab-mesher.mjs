/**
 * Compara mesher-ul cu si fara taierea fetelor de granita.
 *
 *   node tools/ab-mesher.mjs plain    # fara taiere
 *   node tools/ab-mesher.mjs cull     # cu taiere
 *
 * Se ruleaza in PROCESE separate si se ia mediana fiecaruia, fiindca in acelasi
 * proces imprastierea urca la CV 12% si comparatia iese „nedecis". Vezi
 * src/harness/measure.ts pentru cifrele care au impus protocolul asta.
 */

import { meshChunk } from '../src/render/mesher.ts'
import { makeM10 } from '../src/harness/fixture-m10.ts'
import { repeat } from '../src/harness/measure.ts'

const variant = process.argv[2] ?? 'plain'
const { terrain } = makeM10(20260913, 300, 300, 11)
const get = (cx, cy) => terrain.chunks.get(cy * 512 + cx) ?? null
const promovate = [...terrain.keys].map((k) => terrain.chunks.get(k)).filter((c) => c.voxels)

let quads = 0
function run() {
  const t = performance.now()
  quads = 0
  for (const c of promovate) {
    quads +=
      variant === 'cull'
        ? meshChunk(c, {
            xNeg: get(c.cx - 1, c.cy),
            xPos: get(c.cx + 1, c.cy),
            yNeg: get(c.cx, c.cy - 1),
            yPos: get(c.cx, c.cy + 1),
          }).quadCount
        : meshChunk(c).quadCount
  }
  return ((performance.now() - t) * 1000) / promovate.length
}

const m = repeat(run, 15)
console.log(`${variant}\t${m.median.toFixed(1)}\t${quads}`)
