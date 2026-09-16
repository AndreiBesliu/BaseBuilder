/**
 * Construcția — S20-23, tăietura 2.
 *
 * Deocamdată nu există nicio piesă și niciun job de construit. Ce e aici e
 * **poarta pe felul desemnării**, adică pasul 1 din ordinea pe care a scris-o
 * panoul de design — și motivul pentru care el e primul:
 *
 * Până la ea, `cautaJob` nu citea NICIODATĂ `d.kind`. Cu un singur fel, `else`
 * era corect; la al doilea devine o presupunere — aceeași familie cu cele cinci
 * `else` care presupuneau SAPA, reparate cu tabelul de drivere în S16-19. Panoul
 * a reprodus-o în lumea scenariului standard: o desemnare de alt fel e luată cu
 * `jobKind = SAPA`, iar la tickul 3047 desemnarea e ștearsă și celula e goală.
 * Jucătorul cere un perete, primește o groapă — zero refuzuri, zero cauze, și
 * niciun test existent nu se înroșește.
 *
 * Testele de aici pun felul DIRECT pe store, nu printr-o comandă: comanda care
 * creează un blueprint vine în pasul 6. Asta e deliberat — poarta trebuie probată
 * înainte să existe ce apără, altfel prima piesă se autodistruge.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { Desemnare, Piesa, seSapaLa, slotDesemnare } from '../src/sim/desemnari.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { materialAt } from '../src/sim/terrain/terrain.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'
import { CATEGORII, Categorie, FelJob } from '../src/sim/state.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { desemneaza, laSit, R, ruleaza, solidLaDistanta } from './fixturi.ts'

test('o desemnare care NU e de sapat nu e luata niciodata ca job de sapat', () => {
  const { w, sit } = laSit(12345, 4, [0, 0, 0, 0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)
  const { id } = desemneaza(w, tinta.wx, tinta.wy)
  const slot = slotDesemnare(w.desemnari, id)
  assert.notEqual(slot, -1, 'fixtura: desemnarea trebuie sa existe')

  // Felul se schimba direct pe store: comanda vine in pasul 6.
  w.desemnari.kind[slot] = Desemnare.CONSTRUIESTE

  const z = w.desemnari.z[slot]!
  const inainte = materialAt(w.terrain, tinta.wx, tinta.wy, z)
  assert.ok(inainte.ok && isSolid(inainte.value), 'fixtura: celula trebuie sa fie solida la inceput')

  // Oracolul e „niciun pion n-a avut VREODATA un job de sapat", nu
  // `joburiPornite`: ala numara toate felurile, iar pionii mananca si dorm.
  let sapaturi = 0
  ruleaza(w, 1000, R, (ww) => {
    for (let i = 0; i < ww.agents.count; i++) if (ww.agents.jobKind[i] === FelJob.SAPA) sapaturi++
  })

  assert.equal(sapaturi, 0, `poarta a lasat sa treaca ${sapaturi} tickuri de sapat pe o desemnare de alt fel`)
  assert.equal(w.desemnari.alive[slot], 1, 'desemnarea de alt fel n-are voie sa fie consumata de sapat')
  const dupa = materialAt(w.terrain, tinta.wx, tinta.wy, z)
  assert.ok(dupa.ok && isSolid(dupa.value), 'si nici celula ei sapata')
})

test('o desemnare de SAPAT din aceeasi fixtura CHIAR se sapa (controlul negativ)', () => {
  // Fara el, testul de mai sus ar trece si daca fixtura n-ar produce niciodata un
  // job — adica daca n-ar exercita nimic. „Un semnal verde nu e o masuratoare."
  const { w, sit } = laSit(12345, 4, [0, 0, 0, 0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)
  const { id } = desemneaza(w, tinta.wx, tinta.wy)
  const slot = slotDesemnare(w.desemnari, id)
  const z = w.desemnari.z[slot]!

  let sapaturi = 0
  ruleaza(w, 1000, R, (ww) => {
    for (let i = 0; i < ww.agents.count; i++) if (ww.agents.jobKind[i] === FelJob.SAPA) sapaturi++
  })

  assert.ok(sapaturi > 0, 'fixtura: aceeasi asezare trebuie sa produca tickuri de SAPAT cand felul e SAPA')
  const dupa = materialAt(w.terrain, tinta.wx, tinta.wy, z)
  assert.ok(dupa.ok && !isSolid(dupa.value), 'si celula chiar trebuie sapata')
})

test('podeaua unei desemnari de CONSTRUIT nu blocheaza locul de lucru', () => {
  // `celulaDeLucru` si `lucreazaSapa` intreaba „se sapa sub picioarele mele?" ca
  // sa nu puna pionul pe o podea care urmeaza sa dispara. Pana la `seSapaLa`
  // intrebau doar „exista o desemnare aici" — iar pentru o desemnare de CONSTRUIT
  // raspunsul e invers: podeaua ramane, si chiar se intareste.
  const { w, sit } = laSit(12345, 1, [0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)
  const { id } = desemneaza(w, tinta.wx, tinta.wy)
  const slot = slotDesemnare(w.desemnari, id)
  const z = w.desemnari.z[slot]!

  assert.equal(seSapaLa(w.desemnari, tinta.wx, tinta.wy, z), true, 'cat timp e SAPA, se sapa acolo')
  w.desemnari.kind[slot] = Desemnare.CONSTRUIESTE
  assert.equal(seSapaLa(w.desemnari, tinta.wx, tinta.wy, z), false, 'de indata ce e CONSTRUIESTE, nu se mai sapa')
  assert.equal(seSapaLa(w.desemnari, tinta.wx, tinta.wy, z + 3), false, 'si nici pe o celula fara desemnare')
  void R
})

test('un pion pus EXCLUSIV pe construit nu mai sapa', () => {
  // A treia categorie exista inainte de primul job de construit, si asta se poate
  // proba de pe acum: `exclusiv` se calculeaza peste TOATE categoriile. Cu maximul
  // luat doar peste sapat si carat, un pion pus exclusiv pe construit ar continua
  // sa sape — `pS` n-ar fi maxim, dar nici `exclusiv` n-ar fi adevarat, deci
  // poarta s-ar deschide.
  const { w, sit } = laSit(12345, 4, [0, 0, 0, 0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)
  desemneaza(w, tinta.wx, tinta.wy)

  for (let i = 0; i < w.agents.count; i++) {
    const out = applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[i]!, categorie: Categorie.CONSTRUIESTE, nivel: R.personalPriorityLevels }, R)
    assert.ok(out.ok, `a treia categorie trebuie acceptata de comanda: ${JSON.stringify(out)}`)
    assert.equal(w.agents.prioPersonala[i * CATEGORII + Categorie.CONSTRUIESTE], R.personalPriorityLevels)
  }

  let sapaturi = 0
  ruleaza(w, 1000, R, (ww) => {
    for (let i = 0; i < ww.agents.count; i++) if (ww.agents.jobKind[i] === FelJob.SAPA) sapaturi++
  })
  assert.equal(sapaturi, 0, `pionii pusi exclusiv pe construit au sapat ${sapaturi} tickuri`)
})

test('slotul reutilizat nu mostenește piesa desemnarii moarte', () => {
  // `hashWorld` parcurge `subarray(0, count)`, nu doar sloturile vii. Deci un camp
  // ramas de la o desemnare moarta muta hash-ul dintr-un slot pe care nimeni nu-l
  // mai citeste — o divergenta care apare la incarcare si nu are nicio cauza
  // vizibila in joc. Aceeasi grija ca la `reincercaLaTick`, unde o racire
  // mostenita facea desemnarea noua sa fie ignorata pana la un tick pe care nu-l
  // traise.
  const { w, sit } = laSit(12345, 1, [0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)

  const prima = desemneaza(w, tinta.wx, tinta.wy)
  const slot = slotDesemnare(w.desemnari, prima.id)
  w.desemnari.piesa[slot] = Piesa.PERETE
  const anulare = applyCommand(w, { kind: 'anuleazaDesemnarea', id: prima.id }, R)
  assert.ok(anulare.ok, `fixtura: anularea a fost refuzata: ${JSON.stringify(anulare)}`)

  const doua = desemneaza(w, tinta.wx, tinta.wy)
  const slot2 = slotDesemnare(w.desemnari, doua.id)
  assert.equal(slot2, slot, `fixtura: slotul trebuie REUTILIZAT, altfel testul nu probeaza nimic`)
  assert.equal(w.desemnari.piesa[slot2], Piesa.NICIUNA, `piesa mostenita de la desemnarea moarta: ${w.desemnari.piesa[slot2]}`)

  // Si proba care conteaza de fapt: hash-ul nu vede diferenta fata de o lume in
  // care prima desemnare n-a purtat niciodata o piesa.
  const curata = laSit(12345, 1, [0])
  const tintaCurata = solidLaDistanta(curata.w, curata.sit.wx, curata.sit.wy, curata.sit.g, 3, 8)
  const p1 = desemneaza(curata.w, tintaCurata.wx, tintaCurata.wy)
  assert.ok(applyCommand(curata.w, { kind: 'anuleazaDesemnarea', id: p1.id }, R).ok)
  desemneaza(curata.w, tintaCurata.wx, tintaCurata.wy)
  assert.equal(hashWorld(w), hashWorld(curata.w), 'o piesa ramasa intr-un slot mort muta hash-ul')
})
