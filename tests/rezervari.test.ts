import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cheieRezervare,
  createReservations,
  dumpRezervari,
  elibereaza,
  elibereazaTinta,
  poateRezerva,
  rezervaToate,
  rezervariPentru,
  Strat,
  verificaRezervari,
} from '../src/sim/rezervari.ts'
import type { Cerere } from '../src/sim/rezervari.ts'
import { makeAgentStore } from '../src/sim/state.ts'
import { Reason } from '../src/sim/result.ts'

// Fiecare test de aici corespunde unuia dintre bug-urile clasice din
// research/job-system.md („lista de verificat la fiecare regresie"). Nu sunt
// teste de API — sunt testele care ar pica daca s-ar strecura bug-ul respectiv.

function cerere(targetId: number, extra: Partial<Cerere> = {}): Cerere {
  return { targetId, layer: Strat.LUCRU, count: 1, maxCount: 1, maxClaimants: 1, ...extra }
}

test('maxClaimants: doi constructori pe acelasi zid, al treilea e refuzat cu cine il tine', () => {
  // Bug 13 din lista: maxClaimants ignorat → 8 pioni se inghesuie pe aceeasi celula.
  const s = createReservations()
  const zid = cerere(100, { maxClaimants: 2, maxCount: 2 })
  assert.ok(rezervaToate(s, 1, 10, [zid]).ok)
  assert.ok(rezervaToate(s, 2, 11, [zid]).ok)
  const out = rezervaToate(s, 3, 12, [zid])
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.REZERVAT)
    // Refuzul spune CINE: „Rezervat de Ana (job #4711)" iese direct de aici.
    assert.equal(out.params.de, 1)
    assert.equal(out.params.job, 10)
  }
  assert.equal(s.total, 2)
})

test('count: doi carausi iau din acelasi morman, al treilea ar goli mormanul si e refuzat', () => {
  // Bug 14: stackCount ignorat → al doilea ajunge la un morman gol.
  const s = createReservations()
  const morman = (cat: number): Cerere => cerere(200, { count: cat, maxCount: 100, maxClaimants: 8 })
  assert.ok(rezervaToate(s, 1, 10, [morman(60)]).ok)
  assert.ok(rezervaToate(s, 2, 11, [morman(40)]).ok)
  const out = rezervaToate(s, 3, 12, [morman(1)])
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.CAPACITATE_DEPASITA)
    assert.equal(out.params.ocupat, 100)
  }
})

test('straturile sunt independente: LUCRU rezervat nu blocheaza CARAT pe aceeasi tinta', () => {
  const s = createReservations()
  assert.ok(rezervaToate(s, 1, 10, [cerere(300, { layer: Strat.LUCRU })]).ok)
  assert.ok(rezervaToate(s, 2, 11, [cerere(300, { layer: Strat.CARAT })]).ok)
  assert.equal(rezervaToate(s, 3, 12, [cerere(300, { layer: Strat.LUCRU })]).ok, false)
  assert.equal(rezervariPentru(s, 300, Strat.LUCRU).length, 1)
  assert.equal(rezervariPentru(s, 300, Strat.CARAT).length, 1)
})

test('eliberarea e pe PERECHEA (claimant, job), nu pe claimant', () => {
  // Bug 6: eliberare pe pion → jobul urmator din coada isi pierde claim-ul si
  // esueaza la executie, nu la planificare. Azi un pion are un singur job; API-ul
  // se scrie o singura data.
  const s = createReservations()
  assert.ok(rezervaToate(s, 1, 10, [cerere(400)]).ok)
  assert.ok(rezervaToate(s, 1, 11, [cerere(401)]).ok)
  assert.equal(elibereaza(s, 1, 10), 1)
  assert.equal(rezervariPentru(s, 400, Strat.LUCRU).length, 0, 'jobul 10 nu s-a eliberat')
  assert.equal(rezervariPentru(s, 401, Strat.LUCRU).length, 1, 'eliberarea jobului 10 a furat rezervarea jobului 11')
  assert.equal(s.total, 1)
})

test('tranzactia e atomica: o cerere refuzata la mijloc nu scrie NIMIC', () => {
  // Bug 8 / RimThreaded #789: verificare la scan, rezervare la start, fara
  // re-verificare → scrieri partiale si lanturi circulare.
  const s = createReservations()
  assert.ok(rezervaToate(s, 9, 90, [cerere(501)]).ok) // altcineva tine 501
  const totalInainte = s.total
  const out = rezervaToate(s, 1, 10, [cerere(500), cerere(501), cerere(502)])
  assert.equal(out.ok, false)
  assert.equal(s.total, totalInainte, 'tranzactia refuzata a lasat rezervari scrise')
  assert.equal(rezervariPentru(s, 500, Strat.LUCRU).length, 0)
  assert.equal(rezervariPentru(s, 502, Strat.LUCRU).length, 0)
})

test('tranzactia isi vede propriile cereri: doua cereri pe aceeasi tinta se ADUNA', () => {
  // Doua ridicari din acelasi morman intr-un singur job de carat. Fara acumulare,
  // a doua cerere ar fi verificata contra unui store care nu stie inca de prima.
  const s = createReservations()
  const ia = (cat: number, max: number): Cerere => cerere(600, { count: cat, maxCount: max, maxClaimants: 4 })
  assert.equal(rezervaToate(s, 1, 10, [ia(60, 100), ia(60, 100)]).ok, false, '120 din 100 a trecut')
  assert.equal(s.total, 0)
  assert.ok(rezervaToate(s, 1, 10, [ia(60, 120), ia(60, 120)]).ok)
  assert.equal(s.total, 2)
})

test('poateRezerva nu scrie nimic — e doar intrebarea', () => {
  const s = createReservations()
  assert.ok(poateRezerva(s, 1, cerere(700)).ok)
  assert.equal(s.total, 0)
  assert.equal(rezervariPentru(s, 700, Strat.LUCRU).length, 0)
})

test('elibereazaTinta scoate toate straturile si intoarce claimantii, sortati si fara duplicate', () => {
  const s = createReservations()
  assert.ok(rezervaToate(s, 5, 50, [cerere(800, { layer: Strat.LUCRU })]).ok)
  assert.ok(rezervaToate(s, 3, 30, [cerere(800, { layer: Strat.CARAT })]).ok)
  assert.ok(rezervaToate(s, 5, 51, [cerere(801)]).ok)
  assert.deepEqual(elibereazaTinta(s, 800), [3, 5])
  assert.equal(s.total, 1)
  assert.equal(rezervariPentru(s, 801, Strat.LUCRU).length, 1, 'alta tinta a fost atinsa')
})

test('INVARIANT: o rezervare al carei claimant a murit e prinsa, cu id-urile ei', () => {
  // Bug 4 si 9: pionul moare carand / save cu claimant distrus → obiect „ocupat"
  // pe veci, fara mesaj. Verificarea e singurul lucru care il vede.
  const s = createReservations()
  const a = makeAgentStore(4)
  a.count = 1
  a.id[0] = 7
  a.alive[0] = 1
  a.jobKind[0] = 1
  a.jobId[0] = 3
  assert.ok(rezervaToate(s, 7, 3, [cerere(900)]).ok)
  assert.ok(verificaRezervari(s, a).ok)

  a.alive[0] = 0
  const mort = verificaRezervari(s, a)
  assert.equal(mort.ok, false)
  if (!mort.ok) {
    assert.equal(mort.reason, Reason.INVARIANT_INCALCAT)
    assert.equal(mort.params.claimant, 7)
    assert.equal(mort.params.job, 3)
  }
})

test('INVARIANT: o rezervare pe un job pe care claimantul nu-l mai are e prinsa', () => {
  const s = createReservations()
  const a = makeAgentStore(4)
  a.count = 1
  a.id[0] = 7
  a.alive[0] = 1
  a.jobKind[0] = 1
  a.jobId[0] = 3
  assert.ok(rezervaToate(s, 7, 3, [cerere(901)]).ok)
  a.jobId[0] = 4 // a trecut la alt job fara sa elibereze
  assert.equal(verificaRezervari(s, a).ok, false)
  a.jobId[0] = 3
  a.jobKind[0] = 0 // sau nu mai are niciun job
  assert.equal(verificaRezervari(s, a).ok, false)
})

test('INVARIANT: si celelalte trei clauze au proba negativa — prea multi claimanti, count peste capacitate, total gresit', () => {
  // Recenzia: instrumentul pe care se sprijina acceptanta avea proba negativa
  // doar pentru „claimant mort"; trei sferturi din el se puteau sterge verde.
  const agenti = (): ReturnType<typeof makeAgentStore> => {
    const a = makeAgentStore(4)
    a.count = 2
    for (let i = 0; i < 2; i++) { a.id[i] = 10 + i; a.alive[i] = 1; a.jobKind[i] = 1; a.jobId[i] = 100 + i }
    return a
  }
  const injecteaza = (s: ReturnType<typeof createReservations>, claimant: number, jobId: number, count: number, maxCount: number, maxClaimants: number): void => {
    const k = cheieRezervare(1, Strat.LUCRU)
    const lista = s.peTinta.get(k) ?? []
    lista.push({ claimant, jobId, targetId: 1, layer: Strat.LUCRU, count, maxCount, maxClaimants })
    s.peTinta.set(k, lista)
    s.total++
  }
  const preaMulti = createReservations()
  injecteaza(preaMulti, 10, 100, 1, 2, 1)
  injecteaza(preaMulti, 11, 101, 1, 2, 1)
  const v1 = verificaRezervari(preaMulti, agenti())
  assert.equal(v1.ok, false)
  if (!v1.ok) assert.equal(v1.params.motiv, 'prea multi claimanti')

  const pesteCapacitate = createReservations()
  injecteaza(pesteCapacitate, 10, 100, 2, 2, 2)
  injecteaza(pesteCapacitate, 11, 101, 1, 2, 2)
  const v2 = verificaRezervari(pesteCapacitate, agenti())
  assert.equal(v2.ok, false)
  if (!v2.ok) assert.equal(v2.params.motiv, 'count peste capacitate')

  const totalGresit = createReservations()
  injecteaza(totalGresit, 10, 100, 1, 1, 1)
  totalGresit.total = 5
  const v3 = verificaRezervari(totalGresit, agenti())
  assert.equal(v3.ok, false)
  if (!v3.ok) assert.equal(v3.params.motiv, 'total gresit')
})

test('acelasi claimant nu ocupa un loc NOU: doua ridicari ale aceluiasi job dintr-un morman cu un singur loc trec', () => {
  // Taietura 2 (mormanele) e exact cazul; API-ul se scrie o singura data.
  const s = createReservations()
  const ia = (cat: number): Cerere => cerere(1100, { count: cat, maxCount: 3, maxClaimants: 1 })
  // In aceeasi tranzactie...
  assert.ok(rezervaToate(s, 1, 10, [ia(1), ia(1)]).ok, 'aceeasi pereche (claimant, job) a fost numarata de doua ori')
  assert.equal(s.total, 2)
  // ...si intr-o tranzactie ULTERIOARA a aceluiasi claimant: locul e deja al lui.
  assert.ok(rezervaToate(s, 1, 12, [ia(1)]).ok, 'claimantul care tine deja tinta a fost numarat ca al doilea')
  assert.equal(s.total, 3)
  const altul = rezervaToate(s, 2, 11, [cerere(1100, { count: 1, maxCount: 9, maxClaimants: 1 })])
  assert.equal(altul.ok, false)
  if (!altul.ok) assert.equal(altul.params.de, 1)
})

test('dumpRezervari e canonic: aceeasi multime, scrisa in alta ordine, da acelasi text', () => {
  const unu = createReservations()
  const doi = createReservations()
  const a = makeAgentStore(4)
  void a
  assert.ok(rezervaToate(unu, 1, 10, [cerere(1000, { maxClaimants: 3, maxCount: 3 })]).ok)
  assert.ok(rezervaToate(unu, 2, 11, [cerere(1000, { maxClaimants: 3, maxCount: 3 })]).ok)
  assert.ok(rezervaToate(unu, 3, 12, [cerere(999)]).ok)
  assert.ok(rezervaToate(doi, 3, 12, [cerere(999)]).ok)
  assert.ok(rezervaToate(doi, 2, 11, [cerere(1000, { maxClaimants: 3, maxCount: 3 })]).ok)
  assert.ok(rezervaToate(doi, 1, 10, [cerere(1000, { maxClaimants: 3, maxCount: 3 })]).ok)
  assert.equal(dumpRezervari(unu), dumpRezervari(doi))
  assert.ok(dumpRezervari(unu).length > 0)
})
