/**
 * Graful termic incremental (ii) pe scena cu pioni a hărții B5 — S24-27 t.2b, valul 1, commit-ul 3 (§6).
 *
 * „lărgire20": pe grila M10, 5 camere vecine își lărgesc pereții (inele de desemnări la g−3 și g−2), 20 de pioni, 3.000 de
 * tickuri — camerele se unesc între ele și cu rețeaua de coridoare (hub-ul are ~1.200 de bucăți). ORACOLUL după fiecare
 * lot (graful == cel integral pe același index; == indexul nou la fiecare al 100-lea și la final) și K05 cu EGALITATE
 * EXACTĂ: aceeași sarcină pe grila de 7×7 și pe cea de 13×13 chunk-uri (192 față de 672 de componente) dă, pe deltele de
 * DUPĂ construcție, aceleași contoare (|S|, contribuții recalculate, bucăți mutate și parcurse, noduri noi) și aceeași serie
 * |S| pe lot. Fără moștenire (fiecare componentă atinsă pe nod nou, adică „nod = id") |S| crește cu așezarea: 589.760
 * față de 1.950.924 (măsurat) — oracolul nu vede asta, doar contoarele.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { statGraf } from '../src/sim/termic.ts'
import type { World } from '../src/sim/state.ts'
import { delta, egalCuIndexulNou, egalCuIntegralul, faraUrgente, lumeM10n, scenaLargire, tickCuGraf } from './fixturi-graf.ts'

/** Lărgire20 pe grila de `n`×`n`: 3.000 de tickuri; seria |S| pe lot și contoarele de după construcție. */
function largire20(n: number, laFiecareLot: ((w: World, lot: number) => void) | null): { w: World; serie: number[]; d: Record<string, number>; bucati: number } {
  const w = lumeM10n(n)
  const { des, pioni } = scenaLargire(w, 4)
  assert.deepEqual([des, pioni], [1544, 20], 'fixtura: desemnarile si pionii scenei')
  let bucati = 0
  for (const c of w.camere.comp.values()) bucati += c.bucati.length
  const st0 = statGraf(w.camere)
  const serie: number[] = []
  let s0 = st0.S
  for (let k = 0; k < 3000; k++) {
    const e0 = w.terrain.editari
    tickCuGraf(w)
    const S = statGraf(w.camere).S
    if (w.terrain.editari !== e0) {
      serie.push(S - s0)
      laFiecareLot?.(w, serie.length)
    }
    s0 = S
  }
  return { w, serie, d: delta(w, st0), bucati }
}

test('GRAF oracol: largire20 pe grila M10 13x13 (20 de pioni, 3.000 de tickuri) — graful == integralul dupa FIECARE lot, == indexul nou la fiecare al 100-lea si la final', () => {
  const { w, serie } = largire20(13, (x, l) => {
    egalCuIntegralul(x, `lotul ${l}, tickul ${x.tick}`)
    if (l % 100 === 0) egalCuIndexulNou(x, `lotul ${l}`)
  })
  // Măsurat: 1.061 de loturi cu editări.
  assert.ok(serie.length >= 800, `fixtura: doar ${serie.length} loturi`)
  egalCuIndexulNou(w, 'largire20, la final')
  faraUrgente(w, 'largire20')
})

test('GRAF K05: largire20 pe 7x7 si pe 13x13 chunk-uri — aceleasi contoare EXACT pe deltele de dupa constructie (|S|, recalculate, mutate, parcurse, noduri noi) si aceeasi serie |S| pe lot', () => {
  const mic = largire20(7, null)
  const mare = largire20(13, null)
  assert.ok(mare.bucati > 3 * mic.bucati, `fixtura: asezarile difera (${mic.bucati} fata de ${mare.bucati} de bucati)`)
  const k = (r: { d: Record<string, number> }): number[] => [r.d.S!, r.d.recalculate!, r.d.mutate!, r.d.parcurseMostenire!, r.d.noduriNoi!, r.d.mosteniri!, r.d.loturi!]
  assert.deepEqual(k(mare), k(mic), `7x7 ${JSON.stringify(mic.d)}, 13x13 ${JSON.stringify(mare.d)}`)
  assert.deepEqual(mare.serie, mic.serie, 'seria |S| pe lot')
  // Măsurat (08.10, la ambele mărimi): |S| 10.402, recalculate 10.252, mutate 31, parcurse 51, noduri noi 20, pe 1.061 de
  // loturi; harta B5 (delta pe pas, proveniența aproximată) dădea p50 48 / p90 66 pe PAS. Moștenirea face ca hub-ul să nu
  // se mute: o bucată mutată la ~34 de loturi.
  assert.ok(mic.d.mutate! <= 0.1 * mic.serie.length, `prea multe bucati mutate: ${mic.d.mutate} pe ${mic.serie.length} loturi`)
  assert.equal(mic.d.construiri, 0)
  faraUrgente(mic.w, '7x7')
  faraUrgente(mare.w, '13x13')
})
