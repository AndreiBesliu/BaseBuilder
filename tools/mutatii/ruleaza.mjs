/**
 * Ruleaza suitele de mutatii.
 *
 *   node tools/mutatii/ruleaza.mjs                  toate suitele (~40 de minute)
 *   node tools/mutatii/ruleaza.mjs nevoi            o singura suita
 *   node tools/mutatii/ruleaza.mjs nevoi podeaua    doar mutatiile al caror nume contine „podeaua"
 *   node tools/mutatii/ruleaza.mjs --lista          ce suite exista, fara sa ruleze nimic
 *
 * Toate suitele se ruleaza DUPA fiecare transa de cod, nu doar cele noi: tocmai
 * cele vechi putrezesc. Masurat la taietura 3: doua tipare au iesit `TIPAR
 * LIPSA` fiindca refactorizarea mutase codul pe care erau ancorate, iar fara
 * raportarea lor ar fi trecut drept „prinse".
 *
 * Iesirea e 0 doar daca TOATE mutatiile alese au fost prinse si niciun control
 * n-a fost invalid.
 */

import { arboreCurat, ruleazaSuita, testePicate } from './harnasament.mjs'
import { MUTATII as carat } from './carat.mjs'
import { MUTATII as drivere } from './drivere.mjs'
import { MUTATII as nevoi } from './nevoi.mjs'
import { MUTATII as stabilitate } from './stabilitate.mjs'

const SUITE = [
  { nume: 'carat', despre: 'taietura 2: iteme, carat, zone pictate', M: carat },
  { nume: 'drivere', despre: 'taietura 3: tabelul de drivere, felul zonei, costul luatului', M: drivere },
  { nume: 'nevoi', despre: 'taietura 3: foame, odihna, dispozitie', M: nevoi },
  { nume: 'stabil', despre: 'S20-23 t.1: stabilitate, prabusire, previzualizare', M: stabilitate },
]

const argumente = process.argv.slice(2)

if (argumente[0] === '--lista') {
  for (const s of SUITE) console.log(`  ${s.nume.padEnd(9)} ${String(s.M.length).padStart(3)} mutatii   ${s.despre}`)
  console.log(`  ${'TOTAL'.padEnd(9)} ${String(SUITE.reduce((n, s) => n + s.M.length, 0)).padStart(3)}`)
  process.exit(0)
}

const numeSuita = argumente[0]
const filtru = argumente[1] ? argumente[1].split(',') : null
const alese = numeSuita ? SUITE.filter((s) => s.nume === numeSuita) : SUITE
if (alese.length === 0) {
  console.log(`Nu cunosc suita "${numeSuita}". Sunt: ${SUITE.map((s) => s.nume).join(', ')}`)
  process.exit(2)
}

// Arborele trebuie sa fie CURAT: restaurarea e `git checkout --`, deci prima
// mutatie ar arunca orice modificare necomisa a fisierelor atinse.
const murdar = arboreCurat()
if (murdar) {
  console.log('REFUZ: arborele nu e curat. Comite intai — restaurarea se face prin git.\n')
  console.log(murdar)
  process.exit(1)
}

// Bazele, o singura data per fisier de test si nu o data per suita: fisierele
// se repeta intre suite, iar o rulare de teste nu e ieftina.
const fisiereDeTest = new Set()
for (const s of alese) for (const m of s.M) fisiereDeTest.add(m.t)
const baza = new Map()
for (const t of [...fisiereDeTest].sort()) {
  const picate = testePicate(t)
  baza.set(t, picate)
  if (picate.size > 0) console.log(`  !! BAZA ROSIE in ${t}: ${[...picate].join(' | ')}`)
}

const rezultate = []
for (const s of alese) {
  console.log(`\n=== ${s.nume} — ${s.despre} ===`)
  rezultate.push(ruleazaSuita(s.nume, s.M, baza, filtru))
}

console.log('')
let prinse = 0
let valide = 0
let invalide = 0
for (const r of rezultate) {
  prinse += r.prinse
  valide += r.valide
  invalide += r.invalide.length
  console.log(`  ${r.nume.padEnd(9)} ${r.prinse}/${r.valide} prinse${r.invalide.length ? `, ${r.invalide.length} controale invalide` : ''}`)
}
console.log(`\n  TOTAL     ${prinse}/${valide} prinse, ${invalide} controale invalide`)

// Un `TIPAR LIPSA` e un ESEC, la fel ca o mutatie ratata: un tipar invechit nu
// probeaza nimic, dar arata ca si cum ar fi probat.
process.exit(prinse === valide && invalide === 0 ? 0 : 1)
