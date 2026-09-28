/**
 * Captureaza fixtura golden de schema 7 CU INCAPERI SI USI (recenzia incaperilor, CTR-8).
 *
 * Toate cele sase fixturi golden de dinainte au 0 componente de aer acoperit si 0 usi: migrarea 7 -> 8
 * a taieturii 2 a incaperilor (temperatura pe ancora, markerul de migrare) s-ar fi probat pe salvari
 * fara nicio incapere, adica vid. Singurul cod de schema 7 care poate scrie usi e cel de acum, deci
 * fixtura se ia ACUM, inainte de bump.
 *
 * Ce contine, zidit prin COMENZI (nu direct in teren: lumea trebuie sa fie una pe care jocul o poate
 * produce, cu indexul incaperilor la zi — `encode` refuza altfel):
 *   A. o casa 5x5 cu ziduri de 2 m, acoperis, si golul (2,0) inchis de doua USI: incapere sigilata, 18 m³;
 *   B. o pivnita 3x3x2 sub sol, cu un CHEPENG (o usa in tavanul ei, la cota solului): incapere, 18 m³;
 *   C. o casa 5x5 cu golul (2,0) LASAT deschis pe doua niveluri: componenta deschisa, 18 + 2 = 20 m³,
 *      2 fete deschise — si un SANTIER DE USA in gol (piesa USA desemnata, fara piatra: ramane santier);
 *   un pion IN TOCUL usii casei A (la cota de jos a usii), plus doi pioni afara.
 *
 * Se ruleaza O SINGURA DATA, la codul recenziei incaperilor (28.09.2026, ramura fix-index, schema 7).
 * Scriptul ramane in repo ca sa se poata citi exact ce lume e in fixtura; nu se re-captureaza dupa.
 *
 *   node tools/captura-fixtura-schema7-incaperi.mjs
 */

import { writeFileSync } from 'node:fs'
import { applyCommand } from '../src/sim/commands.ts'
import { encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { advance } from '../src/sim/world.ts'
import { Faction, Piesa, SCHEMA_VERSION } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { materialAt } from '../src/sim/terrain/terrain.ts'
import { componentaLa, esteIncapere, listaComponente } from '../src/sim/camere.ts'
import { R, sitPlat } from '../tests/fixturi.ts'

if (SCHEMA_VERSION !== 7) {
  console.error(`Scriptul captureaza schema 7, dar codul e la ${SCHEMA_VERSION}. Fixtura NU se re-captureaza dupa bump.`)
  process.exit(2)
}

const P = Material.PIATRA_CONSTRUITA
const { w, wx, wy, g } = sitPlat(4242, 24)

function cmd(c, ce) {
  const r = applyCommand(w, c, R)
  if (!r.ok) throw new Error(`${ce}: ${JSON.stringify(r)}`)
  return r
}
const zid = (x, y, z, m = P) => cmd({ kind: 'fill', wx: x, wy: y, z, material: m }, `fill (${x - wx},${y - wy},${z - g})`)
const sapa = (x, y, z) => cmd({ kind: 'dig', wx: x, wy: y, z }, `dig (${x - wx},${y - wy},${z - g})`)

/** Inelul 5x5 pe [g+1, g+2] fara golul (2,0), apoi acoperisul la g+3. */
function casa(x0, y0, usa) {
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    if (dx === 2 && dy === 0) { if (usa) zid(x0 + dx, y0 + dy, z, Material.USA); continue }
    zid(x0 + dx, y0 + dy, z)
  }
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) zid(x0 + dx, y0 + dy, g + 3)
}

// A: casa cu usa, la (wx+2, wy+2).
const A = { x: wx + 2, y: wy + 2 }
casa(A.x, A.y, true)
// B: pivnita cu chepeng, la (wx+10, wy+3): 3x3x2 sub sol, apoi o gaura in tavan inchisa cu o usa.
const B = { x: wx + 10, y: wy + 3 }
for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) for (const z of [g - 1, g - 2]) sapa(B.x + dx, B.y + dy, z)
sapa(B.x + 1, B.y + 1, g)
zid(B.x + 1, B.y + 1, g, Material.USA)
// C: casa cu golul deschis, la (wx+16, wy+2), si un santier de usa in gol (jos).
const C = { x: wx + 16, y: wy + 2 }
casa(C.x, C.y, false)
cmd({ kind: 'desemneaza', wx: C.x + 2, wy: C.y, z: g + 1, piesa: Piesa.USA }, 'santierul de usa')

// Doi pioni afara; lumea merge putin (joburile se cauta, santierul fara piatra ramane santier).
for (let i = 0; i < 2; i++) cmd({ kind: 'spawnAgent', x: (wx + 8 + i) * 1000 + 500, y: (wy + 14) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, `pionul ${i}`)
advance(w, 200, R)
// Pionul din toc, ultimul: la cota de jos a usii casei A.
cmd({ kind: 'spawnAgent', x: (A.x + 2) * 1000 + 500, y: A.y * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, 'pionul din toc')

// Verificarile de dinainte de scriere: fixtura contine ce spune antetul.
const incA = componentaLa(w.camere, A.x + 2, A.y + 2, g + 1)
const incB = componentaLa(w.camere, B.x + 1, B.y + 1, g - 1)
const desC = componentaLa(w.camere, C.x + 2, C.y + 2, g + 1)
if (!incA || !esteIncapere(incA) || incA.volum !== 18) throw new Error(`casa A: ${JSON.stringify(incA)}`)
if (!incB || !esteIncapere(incB) || incB.volum !== 18) throw new Error(`pivnita B: ${JSON.stringify(incB)}`)
if (!desC || esteIncapere(desC) || desC.volum !== 20 || desC.deschise !== 2) throw new Error(`casa C: ${JSON.stringify(desC)}`)
const chepeng = materialAt(w.terrain, B.x + 1, B.y + 1, g)
if (!chepeng.ok || chepeng.value !== Material.USA) throw new Error('chepengul lipseste')
const text = encode(w)
const env = JSON.parse(text)
if (env.schema !== 7) throw new Error(`encode a scris schema ${env.schema}`)

writeFileSync(new URL('../tests/fixtures/save-schema7-incaperi.json', import.meta.url), text, 'utf8')
console.log(`fixtura scrisa: seed=${w.seed} tick=${env.savedAtTick} sit=(${wx},${wy},${g}) agenti=${w.agents.count} componente=${listaComponente(w.camere).length} hash=${hashWorld(w)} octeti=${text.length}`)
