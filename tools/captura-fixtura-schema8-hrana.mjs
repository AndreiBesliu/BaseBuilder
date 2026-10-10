/**
 * Captureaza fixtura golden de schema 8 CU HRANA (S24-27 t.3, commit-ul A: formatul alterarii).
 *
 * Migrarea 8 -> 9 umple cu zero alterarea mormanelor (`iteme.alterare`), a mainilor (`agents.caraAlterare`),
 * masca refuzata a zonelor (`zone.refuzate`) si totalul stricat (`hranaStricata`): hrana veche porneste PROASPATA,
 * fiecare depozit primeste tot. Fixturile golden de dinainte n-au hrana in mana nimanui, deci migrarea s-ar fi
 * probat fara mana plina. Fixtura asta se ia ACUM, pe codul de schema 8, inainte de bump.
 *
 * Ce contine, facut prin COMENZI: un sit cu 4 pioni, un depozit 3x3, doua mormane de HRANA (75 si 40) pe jos,
 * departe de depozit, si pionii flamanzi (FOAME 200, ca in `lumeBogata`) — lumea merge pana cand, IN ACELASI
 * TICK, un pion duce HRANA in mana spre depozit (CARA, dupa RIDICA) si altul mananca (MANANCA, pe morman).
 *
 * Se ruleaza O SINGURA DATA, pe codul de schema 8 (HEAD eae704d, 10.10.2026). Scriptul ramane in repo ca sa se
 * poata citi exact ce lume e in fixtura; nu se re-captureaza dupa.
 *
 *   node tools/captura-fixtura-schema8-hrana.mjs
 */

import { writeFileSync } from 'node:fs'
import { encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { tick } from '../src/sim/world.ts'
import { FelJob, Item, NEVOI, Nevoie, PasCara, SCHEMA_VERSION } from '../src/sim/state.ts'
import { laSit, lasaItem, picteaza, solidLaDistanta } from '../tests/fixturi.ts'

if (SCHEMA_VERSION !== 8) {
  console.error(`Scriptul captureaza schema 8, dar codul e la ${SCHEMA_VERSION}. Fixtura NU se re-captureaza dupa bump.`)
  process.exit(2)
}

function stare(w) {
  const a = w.agents
  const out = { inMana: 0, mananca: 0 }
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] !== 1) continue
    if (a.jobKind[i] === FelJob.CARA && a.jobStep[i] >= PasCara.MERGE_DEST && a.caraKind[i] === Item.HRANA && a.caraCantitate[i] > 0) out.inMana++
    if (a.jobKind[i] === FelJob.MANANCA && a.jobConsumat[i] > 0) out.mananca++
  }
  return out
}

let gasit = null
for (const seed of [8801, 8802, 8803, 8804, 8805, 8806, 8807, 8808, 8809, 8810]) {
  const { w, sit } = laSit(seed, 4)
  picteaza(w, sit.wx + 2, sit.wy + 3, 3)
  const a = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 12, 18)
  const b = solidLaDistanta(w, sit.wx + 1, sit.wy + 1, sit.g, 14, 20)
  lasaItem(w, Item.HRANA, 75, a.wx, a.wy)
  if (a.wx !== b.wx || a.wy !== b.wy) lasaItem(w, Item.HRANA, 40, b.wx, b.wy)
  for (let i = 0; i < w.agents.count; i++) w.agents.nevoi[i * NEVOI + Nevoie.FOAME] = 200
  let maxMana = 0, maxMananca = 0
  for (let t = 0; t < 3000; t++) {
    tick(w)
    const s = stare(w)
    if (s.inMana > maxMana) maxMana = s.inMana
    if (s.mananca > maxMananca) maxMananca = s.mananca
    // In afara grilei de 1 Hz: o fixtura salvata pe un multiplu de 20 n-ar spune nimic despre faza.
    if (s.inMana >= 1 && s.mananca >= 1 && w.tick % 20 !== 0) { gasit = { w, seed }; break }
  }
  console.log(`seed ${seed}: maxInMana=${maxMana} maxMananca=${maxMananca} ${gasit ? 'GASIT la tickul ' + gasit.w.tick : 'nu'}`)
  if (gasit) break
}
if (!gasit) throw new Error('nicio samanta nu a dat HRANA in mana si un mancator in acelasi tick')

const text = encode(gasit.w)
const env = JSON.parse(text)
if (env.schema !== 8) throw new Error(`encode a scris schema ${env.schema}`)
writeFileSync(new URL('../tests/fixtures/save-schema8-hrana.json', import.meta.url), text, 'utf8')
const s = stare(gasit.w)
let mormane = 0, hrana = 0
for (let i = 0; i < gasit.w.iteme.count; i++) if (gasit.w.iteme.alive[i] === 1 && gasit.w.iteme.kind[i] === Item.HRANA) { mormane++; hrana += gasit.w.iteme.cantitate[i] }
let inMaini = 0
for (let i = 0; i < gasit.w.agents.count; i++) if (gasit.w.agents.caraKind[i] === Item.HRANA) inMaini += gasit.w.agents.caraCantitate[i]
console.log(`fixtura scrisa: seed=${gasit.seed} tick=${env.savedAtTick} hash=${hashWorld(gasit.w)} agenti=${gasit.w.agents.count} inMana=${s.inMana} mananca=${s.mananca} mormane de hrana=${mormane} (${hrana} u) hrana in maini=${inMaini} u`)
