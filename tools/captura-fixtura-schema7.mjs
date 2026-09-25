/**
 * Captureaza fixtura golden de schema 7, cu codul de la schema 7 — INAINTE de
 * felia de logistica a constructiei (S20-23, taietura 3).
 *
 * Felia nu ridica schema, dar schimba SEMANTICA lui `jobCantitate` pentru
 * CONSTRUIESTE: din „totalul piesei" in „cat s-a rezervat din SURSA CURENTA", cu
 * validare noua la decode. Un save de dinainte are 20 acolo si la pasul ZIDESTE,
 * unde codul nou scrie 0 — deci fixtura trebuie sa CONTINA un constructor la
 * ZIDESTE si unul la RIDICA, ca testul sa probeze ca usa veche ramane deschisa.
 *
 * Se ruleaza O SINGURA DATA, la HEAD fefcac9 (25.09.2026). Scriptul ramane in
 * repo ca sa se poata citi exact ce lume e in fixtura; nu se re-captureaza dupa.
 */

import { writeFileSync } from 'node:fs'
import { applyCommand } from '../src/sim/commands.ts'
import { encode } from '../src/sim/save.ts'
import { tick } from '../src/sim/world.ts'
import { FelJob, Item, PasConstruieste, Piesa, SCHEMA_VERSION } from '../src/sim/state.ts'
import { laSit, lasaItem, solid } from '../tests/fixturi.ts'

if (SCHEMA_VERSION !== 7) {
  console.error(`Scriptul captureaza schema 7, dar codul e la ${SCHEMA_VERSION}. Fixtura NU se re-captureaza dupa bump.`)
  process.exit(2)
}

function santier(w, wx, wy) {
  const g = solid(w, wx, wy)
  if (g === null) throw new Error(`nu e sol la ${wx},${wy}`)
  const r = applyCommand(w, { kind: 'desemneaza', wx, wy, z: g + 1, piesa: Piesa.PERETE })
  if (!r.ok) throw new Error(`santier refuzat: ${JSON.stringify(r)}`)
}

function pasuri(w) {
  const a = w.agents
  const out = { ridica: 0, zideste: 0 }
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] !== 1 || a.jobKind[i] !== FelJob.CONSTRUIESTE) continue
    if (a.jobStep[i] === PasConstruieste.RIDICA) out.ridica++
    if (a.jobStep[i] === PasConstruieste.ZIDESTE) out.zideste++
  }
  return out
}

// Patru pioni la sit, patru mormane de 20 (unul per constructor: lacatul de azi e
// exclusiv), patru pereti. ZIDESTE tine 40 de tickuri, RIDICA 10, iar pornirile
// sunt decalate de re-scanare — deci un pion la RIDICA in acelasi tick in care
// altul e la ZIDESTE e aproape sigur. Semintele se incearca pe rand; fiecare
// spune ce a vazut, ca un esec sa fie citibil, nu ghicit.
let gasit = null
for (const seed of [4243, 4244, 4245, 4246, 4247, 4248, 4249, 4250, 4251, 4252]) {
  const { w, sit } = laSit(seed, 4)
  const celule = [0, 1, 2, 3].map((k) => [solid(w, sit.wx + 2, sit.wy + k), solid(w, sit.wx + 5, sit.wy + k)])
  if (celule.some(([a, b]) => a === null || b === null)) { console.log(`seed ${seed}: relief fara sol pe celulele cerute`); continue }
  for (let k = 0; k < 4; k++) lasaItem(w, Item.PIATRA, 20, sit.wx + 2, sit.wy + k)
  for (let k = 0; k < 4; k++) santier(w, sit.wx + 5, sit.wy + k)
  let maxRidica = 0, maxZideste = 0, porniri = 0
  const vazut = new Int32Array(w.agents.capacity)
  for (let t = 0; t < 2000; t++) {
    tick(w)
    const a = w.agents
    for (let i = 0; i < a.count; i++) if (a.jobKind[i] === FelJob.CONSTRUIESTE && a.jobId[i] !== vazut[i]) { vazut[i] = a.jobId[i]; porniri++ }
    const p = pasuri(w)
    if (p.ridica > maxRidica) maxRidica = p.ridica
    if (p.zideste > maxZideste) maxZideste = p.zideste
    if (p.ridica >= 1 && p.zideste >= 1) { gasit = { w, seed, t: w.tick }; break }
  }
  console.log(`seed ${seed}: porniri=${porniri} maxRidica=${maxRidica} maxZideste=${maxZideste} ${gasit ? 'SUPRAPUNERE la tickul ' + gasit.t : 'fara suprapunere'}`)
  if (gasit) break
}
if (!gasit) throw new Error('nicio samanta nu a dat RIDICA si ZIDESTE in acelasi tick')

const text = encode(gasit.w)
const env = JSON.parse(text)
if (env.schema !== 7) throw new Error(`encode a scris schema ${env.schema}`)

writeFileSync(new URL('../tests/fixtures/save-schema7.json', import.meta.url), text, 'utf8')
const p = pasuri(gasit.w)
console.log(`fixtura scrisa: seed=${gasit.seed} tick=${env.savedAtTick} agenti=${gasit.w.agents.count} la RIDICA=${p.ridica} la ZIDESTE=${p.zideste} rezervari=${gasit.w.rezervari.total}`)
