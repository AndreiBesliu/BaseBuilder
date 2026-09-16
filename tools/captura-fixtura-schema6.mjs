/**
 * Captureaza fixtura golden de schema 6, cu codul de la schema 6.
 *
 * Se ruleaza O SINGURA DATA, INAINTE de bumpul la 7 — de-aia scriptul ramane in
 * repo: fixtura nu se poate re-captura dupa, iar cine o vede trebuie sa poata
 * citi exact ce lume e in ea. Lumea e aceeasi cu `replica6()` din
 * `tests/migrare.test.ts`; daca cele doua diverg, testul se inroseste.
 */

import { writeFileSync } from 'node:fs'
import { applyCommand } from '../src/sim/commands.ts'
import { encode } from '../src/sim/save.ts'
import { advance, createWorld } from '../src/sim/world.ts'
import { SCHEMA_VERSION } from '../src/sim/state.ts'
import { groundLevelM, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'

if (SCHEMA_VERSION !== 6) {
  console.error(`Scriptul captureaza schema 6, dar codul e la ${SCHEMA_VERSION}. Fixtura NU se re-captureaza dupa bump.`)
  process.exit(2)
}

const seed = 4242
const w = createWorld(seed)

// Patru pioni pe sol, exact ca la fixturile 1-3.
let pusi = 0
const situri = []
for (let k = 1; k <= 8000 && pusi < 4; k++) {
  const wx = (k * 1237 + seed) % WORLD_CELLS
  const wy = (k * 7919 + seed * 31) % WORLD_CELLS
  const g = groundLevelM(w.terrain, wx, wy)
  if (!g.ok) continue
  const sus = materialAt(w.terrain, wx, wy, g.value)
  if (!sus.ok || !isSolid(sus.value)) continue
  const r = applyCommand(w, { kind: 'spawnAgent', x: wx * 1000 + 500, y: wy * 1000 + 500, z: g.value + 1, faction: pusi % 4 === 0 ? 2 : 0 })
  if (r.ok) { situri.push({ wx, wy, g: g.value }); pusi++ }
}
if (pusi !== 4) throw new Error(`au intrat ${pusi} pioni, nu 4`)

// Desemnari de sapat langa primul sit: fixtura trebuie sa CONTINA desemnari, ca
// migrarea 6->7 sa aiba ce migra.
const s0 = situri[0]
let desemnate = 0
for (let d = 2; d <= 9 && desemnate < 6; d++) {
  const r = applyCommand(w, { kind: 'desemneaza', wx: s0.wx + d, wy: s0.wy, z: s0.g })
  if (r.ok) desemnate++
}
if (desemnate === 0) throw new Error('nicio desemnare')

advance(w, 300)

let vii = 0
for (let i = 0; i < w.desemnari.count; i++) if (w.desemnari.alive[i] === 1) vii++

const text = encode(w)
const env = JSON.parse(text)
if (env.schema !== 6) throw new Error(`encode a scris schema ${env.schema}`)

writeFileSync(new URL('../tests/fixtures/save-schema6.json', import.meta.url), text, 'utf8')
console.log(`fixtura scrisa: tick=${env.savedAtTick} agenti=${w.agents.count} desemnari=${w.desemnari.count} (vii ${vii}) desemnate=${desemnate}`)
