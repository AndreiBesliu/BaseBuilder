/**
 * Din ce e facuta suprafata pe care o vedem.
 *
 *   node tools/mesh-composition.mjs
 *
 * Intrebarea la care raspunde: cat din geometria fixturii M10 sunt PERETI DE
 * TREAPTA de exact 1 m — adica exact ce se vede ca terasare. Daca cifra e mare,
 * problema se poate ataca in culoare, nu numai in geometrie.
 */

import { meshChunk, Face } from '../src/render/mesher.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { makeM10 } from '../src/harness/fixture-m10.ts'

const { terrain } = makeM10(20260913, 300, 300, 11)

const NUME = ['AER', 'ROCA', 'PAMANT', 'IARBA', 'APA', 'LEMN', 'PIATRA']
let total = 0
let lateral1m = 0
const lateralPeMaterial = new Map()

for (const key of terrain.keys) {
  const c = terrain.chunks.get(key)
  if (!c.voxels) continue
  const m = meshChunk(c)
  total += m.quadCount
  for (let q = 0; q < m.quadCount; q++) {
    const f = m.faces[q]
    // Fetele laterale sunt X_POS/X_NEG/Y_POS/Y_NEG (0-3). Z e sus/jos.
    if (f > 3) continue
    // Inaltimea quadului, in metri: componenta verticala din mesher e indexul 2.
    const b = q * 12
    let zmin = Infinity
    let zmax = -Infinity
    for (let v = 0; v < 4; v++) {
      const z = m.positions[b + v * 3 + 2] / 100 // pozitiile sunt in centimetri
      if (z < zmin) zmin = z
      if (z > zmax) zmax = z
    }
    if (zmax - zmin !== 1) continue
    lateral1m++
    const mat = m.materials[q]
    lateralPeMaterial.set(mat, (lateralPeMaterial.get(mat) ?? 0) + 1)
  }
}

console.log(`quaduri totale                      ${total.toLocaleString('ro-RO')}`)
console.log(`pereti laterali de EXACT 1 m        ${lateral1m.toLocaleString('ro-RO')}  (${((lateral1m / total) * 100).toFixed(1)}%)`)
console.log('  din care, pe material:')
for (const [mat, n] of [...lateralPeMaterial].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${(NUME[mat] ?? String(mat)).padEnd(8)} ${n.toLocaleString('ro-RO').padStart(9)}  (${((n / total) * 100).toFixed(1)}% din total)`)
}
void Material
void Face
