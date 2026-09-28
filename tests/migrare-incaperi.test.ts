/**
 * Fixtura golden de schema 7 CU INCAPERI SI USI (recenzia incaperilor, CTR-8).
 *
 * Cele sase fixturi golden de dinainte au 0 componente de aer acoperit si 0 usi, deci migrarea 7 -> 8 a
 * taieturii 2 (temperatura pe ancora) s-ar fi probat pe salvari fara nicio incapere. Fixtura asta a fost
 * capturata cu `tools/captura-fixtura-schema7-incaperi.mjs`, pe codul de schema 7 (28.09.2026); ce e in
 * ea e scris acolo. Aici se probeaza ca se incarca si ca incaperile ies cele de pe hartie.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { componentaLa, esteIncapere, formaCanonica, listaComponente } from '../src/sim/camere.ts'
import { Desemnare } from '../src/sim/desemnari.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { materialAt } from '../src/sim/terrain/terrain.ts'
import { R } from './fixturi.ts'

const FIX = readFileSync(new URL('./fixtures/save-schema7-incaperi.json', import.meta.url), 'utf8')
/** Hash-ul lumii in clipa capturii (iesirea scriptului de captura). */
const HASH_LA_CAPTURA = '0e0666c5'
/** Situl capturii: coltul (wx, wy) si cota solului g. Casele si pivnita sunt pe el, ca in script. */
const SIT = { wx: 12489, wy: 4643, g: 30 }
const A = { x: SIT.wx + 2, y: SIT.wy + 2 }
const B = { x: SIT.wx + 10, y: SIT.wy + 3 }
const C = { x: SIT.wx + 16, y: SIT.wy + 2 }

function incarca(): World {
  const out = decode(FIX, R)
  assert.ok(out.ok, `refuzat: ${JSON.stringify(out)}`)
  return (out as { ok: true; value: World }).value
}

function mat(w: World, x: number, y: number, z: number): number {
  const m = materialAt(w.terrain, x, y, z)
  assert.ok(m.ok)
  return (m as { ok: true; value: number }).value
}

test('fixtura de schema 7 cu incaperi e chiar de schema 7, cu usi in teren (materialul 9) si o piesa USA desemnata', () => {
  const env = JSON.parse(FIX) as { schema: number; data: { terrain: { promoted: { runMaterial: number[] }[] }; desemnari: { piesa: number[] } } }
  assert.equal(env.schema, 7)
  const runuriDeUsa = env.data.terrain.promoted.reduce((n, c) => n + c.runMaterial.filter((m) => m === Material.USA).length, 0)
  assert.ok(runuriDeUsa >= 2, `fixtura: ${runuriDeUsa} runuri de USA in teren (usa casei A si chepengul)`)
  assert.ok(env.data.desemnari.piesa.includes(Piesa.USA), 'fixtura: niciun santier de usa')
})

test('fixtura de schema 7 cu incaperi se incarca: hash stabil, incaperile de pe hartie (18 + 18 sigilate, 20 deschisa cu 2 fete), usa, chepengul, pionul din toc si santierul de usa', () => {
  const w = incarca()
  assert.equal(hashWorld(w), HASH_LA_CAPTURA, 'lumea incarcata nu mai e cea capturata')
  assert.equal(w.camere.vazute, w.terrain.editari, 'indexul e reconstruit in decode')
  const { g } = SIT
  // A: 3x3x2 in inelul 5x5, golul inchis de doua usi.
  assert.equal(mat(w, A.x + 2, A.y, g + 1), Material.USA)
  assert.equal(mat(w, A.x + 2, A.y, g + 2), Material.USA)
  const a = componentaLa(w.camere, A.x + 2, A.y + 2, g + 1)
  assert.ok(a && esteIncapere(a) && a.volum === 18, `casa A: ${JSON.stringify(a)}`)
  assert.equal(componentaLa(w.camere, A.x + 2, A.y, g + 1), null, 'usa e hotar, nu aer')
  // B: pivnita 3x3x2, cu chepengul in tavan (la cota solului).
  assert.equal(mat(w, B.x + 1, B.y + 1, g), Material.USA)
  const b = componentaLa(w.camere, B.x + 1, B.y + 1, g - 1)
  assert.ok(b && esteIncapere(b) && b.volum === 18, `pivnita B: ${JSON.stringify(b)}`)
  // C: 18 in inel + golul de 1x2 sub acoperis = 20; golul da spre cer pe 2 fete.
  const c = componentaLa(w.camere, C.x + 2, C.y + 2, g + 1)
  assert.ok(c && !esteIncapere(c), `casa C: ${JSON.stringify(c)}`)
  assert.equal(c!.volum, 20)
  assert.equal(c!.deschise, 2)
  assert.equal(listaComponente(w.camere).length, 3)
  // Pionul din toc: pe celula de jos a usii casei A.
  let inToc = 0
  for (let i = 0; i < w.agents.count; i++) {
    if (w.agents.alive[i] === 1 && cellOf(w.agents.x[i]!) === A.x + 2 && cellOf(w.agents.y[i]!) === A.y && w.agents.z[i] === g + 1) inToc++
  }
  assert.equal(inToc, 1, 'pionul din toc')
  // Santierul de usa, in golul casei C.
  let santiere = 0
  const d = w.desemnari
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 1 && d.kind[i] === Desemnare.CONSTRUIESTE && d.piesa[i] === Piesa.USA && d.wx[i] === C.x + 2 && d.wy[i] === C.y && d.z[i] === g + 1) santiere++
  }
  assert.equal(santiere, 1, 'santierul de usa din golul casei C')
})

test('fixtura de schema 7 cu incaperi e idempotenta: rescrisa de codul nou si reincarcata, acelasi hash si aceleasi incaperi', () => {
  const w = incarca()
  const rescris = decode(encode(w), R)
  assert.ok(rescris.ok, `refuzat la reincarcare: ${JSON.stringify(rescris)}`)
  if (!rescris.ok) return
  assert.equal(hashWorld(rescris.value), hashWorld(w))
  assert.deepEqual(formaCanonica(rescris.value.camere), formaCanonica(w.camere))
})
