/**
 * Ruleaza suitele de mutatii.
 *
 *   node tools/mutatii/ruleaza.mjs                  toate suitele (331–476 s la 225 de probe)
 *   node tools/mutatii/ruleaza.mjs nevoi            o singura suita
 *   node tools/mutatii/ruleaza.mjs nevoi podeaua    doar mutatiile al caror nume contine „podeaua"
 *   node tools/mutatii/ruleaza.mjs --lista          ce suite exista, fara sa ruleze nimic
 *   node tools/mutatii/ruleaza.mjs --izolare        fiecare test NUMIT de o proba, singur, pe cod nemutat
 *
 * Toate suitele se ruleaza DUPA fiecare transa de cod, nu doar cele noi: tocmai
 * cele vechi putrezesc. Masurat la taietura 3: doua tipare au iesit `TIPAR
 * LIPSA` fiindca refactorizarea mutase codul pe care erau ancorate, iar fara
 * raportarea lor ar fi trecut drept „prinse".
 *
 * Iesirea e 0 doar daca TOATE mutatiile alese au fost prinse si niciun control
 * n-a fost invalid.
 */

import { arboreCurat, ruleazaSuita, ruleazaTeste, testePicate } from './harnasament.mjs'
import { SUITE } from './suite.mjs'

const argumente = process.argv.slice(2)

if (argumente[0] === '--lista') {
  for (const s of SUITE) console.log(`  ${s.nume.padEnd(9)} ${String(s.M.length).padStart(3)} mutatii   ${s.despre}`)
  console.log(`  ${'TOTAL'.padEnd(9)} ${String(SUITE.reduce((n, s) => n + s.M.length, 0)).padStart(3)}`)
  process.exit(0)
}

// Controlul modului „doar testul numit": fiecare test tintit de vreo proba, rulat
// SINGUR pe cod nemutat, trebuie sa treaca. Unul care pica singur si trece cu
// celelalte depinde de ordinea din fisier, si ar da un PRINSA fals oricarei probe
// care il numeste. Nu modifica nimic, deci nu cere arborele curat.
if (argumente[0] === '--izolare') {
  const perechi = new Map()
  for (const s of SUITE) for (const m of s.M) perechi.set(`${m.t}\u0000${m.e}`, { t: m.t, e: m.e })
  let rele = 0
  for (const cheie of [...perechi.keys()].sort()) {
    const { t, e } = perechi.get(cheie)
    const r = ruleazaTeste(t, e)
    if (r.eroare !== null || [...r.picate].some((p) => p.startsWith(e))) {
      rele++
      console.log(`  !! ${t} „${e.slice(0, 60)}": ${r.eroare ?? 'pica rulat singur, pe cod nemutat'}`)
    }
  }
  console.log(`\n  izolare: ${perechi.size - rele}/${perechi.size} teste numite trec rulate singure`)
  process.exit(rele === 0 ? 0 : 1)
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
