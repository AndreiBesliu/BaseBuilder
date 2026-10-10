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
 *
 * Contoarele nu văd o buclă care nu trece prin ele (recenzia GRAF-3: pasul (6) al deltei pe TOATE nodurile, nu pe cele
 * golite, trecea 15/15 teste ale grafului). De aceea K05 măsoară și TIMPUL: cele două lumi avansează în LOCKSTEP, tick cu
 * tick, în ordine alternată (încărcarea mașinii cade pe amândouă), cu doar `actualizeazaGraful` cronometrat, iar raportul
 * p50(13×13) / p50(7×7) — mediana pe 3 repetiții — trebuie să rămână ≤ 1,35.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { stepAgents } from '../src/sim/agents.ts'
import { sincronizeazaCamere } from '../src/sim/camere.ts'
import { actualizeazaGraful, statGraf } from '../src/sim/termic.ts'
import type { World } from '../src/sim/state.ts'
import { delta, egalCuIndexulNou, egalCuIntegralul, faraUrgente, lumeM10n, scenaLargire, tickCuGraf } from './fixturi-graf.ts'
import { R } from './fixturi.ts'

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

interface Pas {
  readonly w: World
  readonly st0: ReturnType<typeof statGraf>
  readonly serie: number[]
  /** Timpul lui `actualizeazaGraful` (ms) pe loturile cu deltă (felii refăcute sau bucăți rescrise). */
  readonly t: number[]
  s0: number
}

/**
 * Lărgire20 pe 7×7 și pe 13×13 în LOCKSTEP (GRAF-3): cele două lumi avansează tick cu tick, în ordine ALTERNATĂ, la nivelul
 * grafului (`stepAgents` → `sincronizeazaCamere` → `actualizeazaGraful` → tick; temperatura nu schimbă nimic din graf) —
 * încărcarea mașinii cade pe amândouă; se cronometrează DOAR `actualizeazaGraful`. Întoarce contoarele, seriile și p50.
 */
function lockstep(): { mic: Pas; mare: Pas; bucati: [number, number]; p50: [number, number] } {
  const lumi: Pas[] = [7, 13].map((n) => {
    const w = lumeM10n(n)
    const { des, pioni } = scenaLargire(w, 4)
    assert.deepEqual([des, pioni], [1544, 20], 'fixtura: desemnarile si pionii scenei')
    const st0 = statGraf(w.camere)
    return { w, st0, serie: [], t: [], s0: st0.S }
  })
  const bucati = lumi.map((L) => [...L.w.camere.comp.values()].reduce((s, c) => s + c.bucati.length, 0)) as [number, number]
  for (let k = 0; k < 3000; k++) {
    for (const L of k % 2 === 0 ? lumi : [lumi[1]!, lumi[0]!]) {
      const w = L.w
      const e0 = w.terrain.editari
      stepAgents(w, R)
      const sch = sincronizeazaCamere(w.camere, w.terrain)
      const t0 = performance.now()
      const g = actualizeazaGraful(w.camere, sch, R)
      const dt = performance.now() - t0
      assert.ok(g.ok, 'actualizeazaGraful')
      if (sch.felii.length > 0 || sch.bucatiRescrise.length > 0) L.t.push(dt)
      const S = statGraf(w.camere).S
      if (w.terrain.editari !== e0) L.serie.push(S - L.s0)
      L.s0 = S
      w.tick++
    }
  }
  const p50 = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(0.5 * (a.length - 1))]!
  return { mic: lumi[0]!, mare: lumi[1]!, bucati, p50: [p50(lumi[0]!.t), p50(lumi[1]!.t)] }
}

test('GRAF K05: largire20 pe 7x7 si pe 13x13 chunk-uri, in LOCKSTEP — aceleasi contoare EXACT pe deltele de dupa constructie (|S|, recalculate, mutate, parcurse, noduri noi) si aceeasi serie |S| pe lot; timpul deltei p50(13x13) / p50(7x7) ≤ 1,35, mediana pe 3 repetitii', (t) => {
  const rapoarte: number[] = []
  for (let rep = 0; rep < 3; rep++) {
    const { mic, mare, bucati, p50 } = lockstep()
    assert.ok(bucati[1] > 3 * bucati[0], `fixtura: asezarile difera (${bucati[0]} fata de ${bucati[1]} de bucati)`)
    const dm = delta(mic.w, mic.st0)
    const dM = delta(mare.w, mare.st0)
    const k = (d: Record<string, number>): number[] => [d.S!, d.recalculate!, d.mutate!, d.parcurseMostenire!, d.noduriNoi!, d.mosteniri!, d.loturi!]
    assert.deepEqual(k(dM), k(dm), `7x7 ${JSON.stringify(dm)}, 13x13 ${JSON.stringify(dM)}`)
    assert.deepEqual(mare.serie, mic.serie, 'seria |S| pe lot')
    // Măsurat (08.10, la ambele mărimi): |S| 10.402, recalculate 10.252, mutate 31, parcurse 51, noduri noi 20, pe 1.061 de
    // loturi; harta B5 (delta pe pas, proveniența aproximată) dădea p50 48 / p90 66 pe PAS. Moștenirea face ca hub-ul să nu
    // se mute: o bucată mutată la ~34 de loturi.
    assert.ok(dm.mutate! <= 0.1 * mic.serie.length, `prea multe bucati mutate: ${dm.mutate} pe ${mic.serie.length} loturi`)
    assert.equal(dm.construiri, 0)
    faraUrgente(mic.w, '7x7')
    faraUrgente(mare.w, '13x13')
    rapoarte.push(p50[1] / p50[0])
    t.diagnostic(`repetitia ${rep}: p50 7x7 ${p50[0].toFixed(4)} ms, 13x13 ${p50[1].toFixed(4)} ms, raport ${(p50[1] / p50[0]).toFixed(3)}`)
  }
  // GRAF-3: contoarele egale nu spun nimic despre o buclă care nu trece prin ele — un mutant care parcurge TOATE nodurile la
  // pasul (6) al deltei trecea testul (15/15 teste ale grafului verzi; delta +45% pe 7×7, +96–102% pe 13×13). Timpul în
  // lockstep (10.10, câte 3 repetiții): original 1,035–1,066 singur și 1,064–1,085 sub `npm test` întreg (recenzia GRAF:
  // 1,062–1,099), mutantul 1,565–1,873 (recenzia: 1,689–1,874). Mediana pe 3 repetiții, ca o rafală de încărcare să nu
  // decidă singură. Costul testului: ~25 s (K05 fără timp: ~9 s).
  const med = [...rapoarte].sort((a, b) => a - b)[1]!
  assert.ok(med <= 1.35, `p50(13x13) / p50(7x7): ${rapoarte.map((r) => r.toFixed(3)).join(', ')} — delta nu e O(lot)`)
})
