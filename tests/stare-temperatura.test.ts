/**
 * Starea temperaturii și invarianții ei — S24-27 t.2b, commit-ul 4 (research/temperatura-t2b.md §1, §2, §5.3).
 *
 * A doua plasă a punctului unic (prima e testul AST): ștampila completă `(idx, vazute, epoca, epocaFete)` la intrarea în
 * `sincronizeazaLumea`, la pas și în `encode`; T în AMBELE direcții. Un invariant încălcat nu aruncă din `tick()`: se
 * numără, graful se reface integral, temperaturile pierdute se reiau de la echilibru, simularea continuă; `encode` aruncă.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { componentaLa, construiesteCamere, sincronizeazaCamere } from '../src/sim/camere.ts'
import { decode, encode } from '../src/sim/save.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill } from '../src/sim/terrain/terrain.ts'
import { construiesteGrafIncremental, formaCanonicaGrafIncremental, grafulIncremental, memoriaGrafuluiT2a, regimPermanent, statGraf } from '../src/sim/termic.ts'
import type { GrafIncremental } from '../src/sim/termic.ts'
import { MOTIV_GRAF_URGENTA, MOTIV_TAIERE, pasTermic, PLAFON_ECHILIBRU, sincronizeazaLumea, statTermic, T_SIGURANTA, temperaturaLaEchilibru, verdictulLotului, verificaStampila } from '../src/sim/temperatura.ts'
import { accept, Reason, refuse } from '../src/sim/result.ts'
import { createWorld, tick } from '../src/sim/world.ts'
import { buildM10PeLume } from '../src/harness/fixture-m10.ts'
import { casaPompei, casaTermica, cicluIncrucisat, comanda, oraDeVara } from './fixturi-temperatura.ts'
import { bun, faraInvarianti, hotel, laEchilibru, tPeAncora } from './fixturi-pas.ts'
import { R, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

function canonic(w: ReturnType<typeof createWorld>, g: GrafIncremental): string[] {
  return bun(formaCanonicaGrafIncremental(w.camere, g), 'forma canonica')
}

test('STARE lumea noua: temperatura goala, aliniata la index, fara invarianti; tickurile fara componente nu fac nimic', () => {
  const w = createWorld(12345)
  assert.ok(verificaStampila(w).ok)
  assert.equal(w.temperatura.slot.are.length, 0)
  for (let i = 0; i < 40; i++) tick(w, R)
  assert.deepEqual([statTermic(w).pasi, statTermic(w).invarianti], [0, 0])
  assert.doesNotThrow(() => encode(w))
})

test('STARE ocolirea punctului unic (§2): un lot sincronizat direct (sincronizeazaCamere) — tickul urmator nu arunca, numara invariantul, reface graful integral si reia T de la echilibru pe TOATE componentele', () => {
  const s = casaTermica({ k: 1 })
  const w = laEchilibru(s.w, 300000)
  for (let i = 0; i < 200; i++) tick(w, R)
  faraInvarianti(w, 'inainte')
  // Ocolirea: groapa în podeaua casei, sincronizată pe lângă temperatură.
  const [cx, cy, cz] = s.rep.casa!
  assert.ok(dig(w.terrain, cx + 1, cy, cz - 1).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const v = verificaStampila(w)
  assert.ok(!v.ok && v.params.motiv === 'indexul s-a sincronizat pe langa temperatura (punctul unic ocolit)', JSON.stringify(v))
  assert.throws(() => encode(w), /temperatura nu e la zi cu indexul/)
  const urgente = statGraf(w.camere).refaceriDeUrgenta
  assert.doesNotThrow(() => tick(w, R))
  const st = statTermic(w)
  assert.equal(st.invarianti, 1)
  assert.equal(st.ultimulInvariant, 'indexul s-a sincronizat pe langa temperatura (punctul unic ocolit)')
  assert.ok(statGraf(w.camere).refaceriDeUrgenta > urgente, 'graful refacut de urgenta')
  assert.deepEqual(canonic(w, bun(grafulIncremental(w.camere, R), 'graf')), canonic(w, bun(construiesteGrafIncremental(w.camere, R), 'integral')))
  // T == echilibrul la tickul reluării, apoi pasul acelui tick (300.200 e un tick de pas), pe o lume geamănă construită
  // direct: proveniența s-a pierdut, deci nimic din istoria de dinainte nu rămâne.
  const geaman = casaTermica({ k: 1 })
  assert.ok(dig(geaman.w.terrain, cx + 1, cy, cz - 1).ok)
  bun(sincronizeazaLumea(geaman.w, R), 'geaman')
  laEchilibru(geaman.w, w.tick - 1)
  assert.equal(geaman.w.tick % R.ticksPerSecond, 0, 'fixtura: reluarea cade pe un tick de pas')
  pasTermic(geaman.w, R)
  assert.deepEqual(tPeAncora(w), tPeAncora(geaman.w))
  assert.doesNotThrow(() => encode(w), 'dupa reluare, salvarea merge')
})

test('STARE perechea (epoca, epocaFete): pamant pe acoperis sincronizat pe langa (epoca pe loc, fetele schimbate) — prins de stampila; doar epoca l-ar fi lasat sa treaca', () => {
  const s = casaTermica()
  const w = laEchilibru(s.w, 0)
  const e0 = w.camere.epoca
  const f0 = w.camere.epocaFete
  assert.ok(fill(w.terrain, s.x0 + 3, s.y0 + 3, s.g + 4, Material.PAMANT).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.equal(w.camere.epoca, e0, 'fixtura: epoca pe loc')
  assert.ok(w.camere.epocaFete > f0, 'fixtura: fetele s-au schimbat')
  const v = verificaStampila(w)
  assert.ok(!v.ok, 'stampila vede lotul doar-fete')
  assert.equal(v.ok ? -1 : v.params.epocaFete, f0)
  const r = sincronizeazaLumea(w, R)
  assert.ok(!r.ok && r.reason === 'INVARIANT_INCALCAT')
  assert.equal(statTermic(w).invarianti, 1)
})

test('STARE indexul inlocuit (IDX-6): w.camere = un index nou, cu aceleasi contoare — stampila tine OBIECTUL indexului; tickul numara si reia T pe componentele noi', () => {
  const s = casaTermica({ k: 1 })
  const w = laEchilibru(s.w, 0)
  const nou = construiesteCamere(w.terrain, R.termic.kCelule, R.termic.dSolMasivM)
  // Contoarele indexului nou se aliniază cu ale celui vechi (într-o lume reală pot coincide): doar identitatea îl deosebește.
  nou.vazute = w.camere.vazute
  nou.epoca = w.camere.epoca
  nou.epocaFete = w.camere.epocaFete
  w.camere = nou
  const v = verificaStampila(w)
  assert.ok(!v.ok && v.params.motiv === 'temperatura e a altui index (indexul lumii a fost inlocuit)', JSON.stringify(v))
  tick(w, R)
  assert.equal(statTermic(w).invarianti, 1)
  assert.ok(verificaStampila(w).ok)
  for (const c of w.camere.comp.values()) assert.equal(w.temperatura.slot.are[c.id], 1, 'fiecare componenta a indexului nou are T')
  assert.doesNotThrow(() => encode(w))
})

test('STARE T in ambele directii (IDX-6): o componenta fara T si un slot mort cu T — encode arunca; pasul le repara (cea lipsa de la echilibru, slotul mort golit), numarat, fara sa arunce', () => {
  const s = casaTermica({ k: 1 })
  const w = laEchilibru(s.w, 0)
  const casa = componentaLa(w.camere, ...s.rep.casa!)!.id
  const sl = w.temperatura.slot
  sl.are[casa] = 0
  assert.throws(() => encode(w), /componenta fara T/)
  w.tick = 20
  assert.doesNotThrow(() => pasTermic(w, R))
  assert.equal(statTermic(w).invarianti, 1)
  assert.equal(w.temperatura.slot.are[casa], 1)
  assert.equal(w.temperatura.slot.t.length >= w.camere.cUrmator, true)
  // Un slot mort cu T (dincolo de componentele vii): golit.
  const mort = w.camere.cUrmator + 3
  const lung = new Float64Array(mort + 1)
  const sl2 = { t: lung, rest: new Float64Array(mort + 1), are: new Uint8Array(mort + 1) }
  sl2.t.set(w.temperatura.slot.t)
  sl2.rest.set(w.temperatura.slot.rest)
  sl2.are.set(w.temperatura.slot.are)
  sl2.are[mort] = 1
  w.temperatura.slot = sl2
  assert.throws(() => encode(w), /slot cu T fara componenta/)
  pasTermic(w, R)
  assert.equal(statTermic(w).invarianti, 2)
  assert.equal(w.temperatura.slot.are[mort] ?? 0, 0)
  assert.doesNotThrow(() => encode(w))
  // Valorile reparației le probează testul de mai jos („completeaza pe VALORI"): aici stătea `Number.isFinite(tCasa)`, cu
  // T-ul citit ÎNAINTE de ștergere — vid (PAS-1: șase implementări greșite ale lui `completeaza` treceau toată suita).
})

test('STARE completeaza pe VALORI (§5.3, IDX-6, PAS-1): componenta fara T o primeste de la echilibrul tickului pasului, celelalte isi pastreaza (T, rest) — == lumea geamana cu T-ul pus de mana', () => {
  // Trei gemene cu aceeași istorie: 200 de pași la tickuri k·7919, deci T-urile departe de echilibru și restul nenul.
  const istorie = (): ReturnType<typeof casaTermica> => {
    const s = casaTermica({ k: 1 })
    laEchilibru(s.w, 0)
    for (let k = 1; k <= 200; k++) {
      s.w.tick = k * 7919
      pasTermic(s.w, R)
    }
    return s
  }
  const a = istorie()
  const b = istorie()
  const c = istorie()
  assert.deepEqual(tPeAncora(a.w), tPeAncora(b.w))
  const tk = 1_600_020
  const casa = componentaLa(a.w.camere, ...a.rep.casa!)!
  assert.equal(componentaLa(b.w.camere, ...b.rep.casa!)!.id, casa.id, 'fixtura: gemenele au aceleasi sloturi')
  // Echilibrul jocului la tk, pe geamăna C (aceeași soluție pe care o cere `completeaza`, fără să-i indexăm nodurile).
  const echilibruPeAncora = (tick: number): Map<number, number> => {
    bun(temperaturaLaEchilibru(c.w, R, tick), `echilibrul la ${tick}`)
    return new Map([...c.w.camere.comp.values()].map((x) => [x.ancora, c.w.temperatura.slot.t[x.id]!] as const))
  }
  const laZero = echilibruPeAncora(0)
  const tEcPeAncora = echilibruPeAncora(tk)
  const eq = (ancora: number): number => tEcPeAncora.get(ancora)!
  const tEq = eq(casa.ancora)
  const sl = a.w.temperatura.slot
  const alte = [...a.w.camere.comp.values()].filter((x) => x.id !== casa.id)
  // Precondițiile fac vizibilă fiecare implementare greșită, pe componentele PĂSTRATE: toate de la echilibru (istoria ≠
  // echilibrul), restul pierdut (rest ≠ 0), 0 °C, T-ul vechi, echilibrul altui nod, echilibrul altui tick.
  assert.ok(alte.length >= 1, 'fixtura: casa si pivnita')
  assert.ok(alte.some((x) => sl.t[x.id] !== eq(x.ancora)), 'fixtura: istoria difera de echilibru pe o componenta pastrata')
  assert.ok(alte.some((x) => sl.rest[x.id] !== 0), 'fixtura: rest nenul pe o componenta pastrata')
  assert.ok(tEq !== 0 && tEq !== sl.t[casa.id] && alte.every((x) => eq(x.ancora) !== tEq), 'fixtura: echilibrul casei e distinct (de 0, de T-ul vechi, de al celorlalte)')
  assert.notEqual(laZero.get(casa.ancora), tEq, 'fixtura: echilibrul casei la tickul pasului difera de cel de la tickul 0')
  sl.are[casa.id] = 0
  b.w.temperatura.slot.t[casa.id] = tEq
  b.w.temperatura.slot.rest[casa.id] = 0
  a.w.tick = b.w.tick = tk
  pasTermic(a.w, R)
  pasTermic(b.w, R)
  assert.equal(statTermic(a.w).invarianti, 1)
  faraInvarianti(b.w, 'geamana')
  assert.deepEqual(tPeAncora(a.w), tPeAncora(b.w), 'casa de la echilibru, celelalte (T, rest) pastrate')
})

test('STARE echilibrul nu tine graful t.2a (GRAF-4): dupa lumea fara istorie (harnasamentul M10, temperaturaLaEchilibru) si dupa completeaza, indexul nu mai tine graful t.2a, contributiile si regimul; o cerere noua il reface de la zero, cu acelasi rezultat', () => {
  // Recenzia GRAF-4: graful t.2a și contribuțiile (2,0 MB pe M10) rămâneau pe index după echilibru, cât trăia indexul, deși
  // nimic nu le mai citea (viewer-ul citește graful simulării).
  const gol = { graf: false, regim: false, contributii: 0 }
  const m10 = createWorld(20260913)
  assert.ok(applyCommand(m10, { kind: 'setFocus', cx: 300, cy: 300 }).ok)
  buildM10PeLume(m10, R, 300, 300)
  assert.ok(m10.camere.comp.size > 600, 'fixtura: M10')
  assert.deepEqual(memoriaGrafuluiT2a(m10.camere), gol, 'M10 dupa harnasament')
  const s = casaTermica({ k: 1, etaj: true })
  const w = laEchilibru(s.w, 300000)
  assert.deepEqual(memoriaGrafuluiT2a(w.camere), gol, 'dupa echilibru')
  const t1 = tPeAncora(w)
  laEchilibru(w, 300000)
  assert.deepEqual(tPeAncora(w), t1, 'acelasi echilibru, refacut de la zero')
  // completeaza: o componentă fără T o ia de la echilibru (tot `solutiaEchilibrului`).
  w.temperatura.slot.are[componentaLa(w.camere, ...s.rep.casa!)!.id] = 0
  pasTermic(w, R)
  assert.equal(statTermic(w).invarianti, 1, 'fixtura: completeaza a rulat')
  assert.deepEqual(memoriaGrafuluiT2a(w.camere), gol, 'dupa completeaza')
  // Controlul pozitiv: cerut direct (regimPermanent, referința din teste), graful t.2a rămâne ținut — sonda îl vede.
  assert.ok(regimPermanent(w, R, w.tick).ok)
  const m = memoriaGrafuluiT2a(w.camere)
  assert.ok(m.graf && m.regim && m.contributii > 0, `controlul: memoria vazuta ${JSON.stringify(m)}`)
})

test('STARE pasul nu arunca din tick (§5.3): o muchie stricata in graf fara niciun lot (asimetrica) — pasul o vede, reface graful de urgenta, numara si continua cu graful bun (== pasul pe o lume geamana)', () => {
  const a = laEchilibru(casaTermica({ k: 1, etaj: true }).w, 300000)
  const b = laEchilibru(casaTermica({ k: 1, etaj: true }).w, 300000)
  const g = bun(grafulIncremental(a.camere, R), 'graf')
  let stricat = false
  // determinism-ok: prima muchie găsită.
  for (const n of g.noduri.values()) {
    // determinism-ok: idem.
    for (const [k, G] of n.vec) {
      ;(n.vec as Map<number, number>).set(k, G + 1)
      stricat = true
      break
    }
    if (stricat) break
  }
  assert.ok(stricat, 'fixtura: casa are muchii')
  const urgente = statGraf(a.camere).refaceriDeUrgenta
  assert.doesNotThrow(() => pasTermic(a, R))
  pasTermic(b, R)
  assert.equal(statTermic(a).invarianti, 1)
  assert.equal(statTermic(a).ultimulInvariant, 'muchie asimetrica')
  assert.equal(statGraf(a.camere).refaceriDeUrgenta, urgente + 1)
  assert.deepEqual(tPeAncora(a), tPeAncora(b), 'pasul a continuat pe graful bun')
  faraInvarianti(b, 'geaman')
})

test('STARE refacerea de urgenta a grafului la lot (GRAF-1): o delta care loveste un invariant (sursa unirii fara nod) se reface integral si se NUMARA ca invariant, cu motivul — nu tacut; graful == integralul, T pe toate', () => {
  // Recenzia GRAF (r2): delta stricată → `actualizeazaGraful` reface de urgență și întoarce accept, iar `sincronizeazaLumea`
  // nu număra nimic (invarianti 0) — viewer-ul alertează doar pe `invarianti`, deci un defect real al deltei dispărea fără urmă.
  const { w, wx, wy, g } = sitPlat(12345, 12)
  for (let z = g - 3; z <= g - 2; z++) for (let y = wy + 2; y <= wy + 4; y++) {
    for (let x = wx + 2; x <= wx + 4; x++) assert.ok(dig(w.terrain, x, y, z).ok)
    for (let x = wx + 6; x <= wx + 8; x++) assert.ok(dig(w.terrain, x, y, z).ok)
  }
  bun(sincronizeazaLumea(w, R), 'pivnitele')
  laEchilibru(w, 300000)
  const A = componentaLa(w.camere, wx + 2, wy + 2, g - 3)!
  // Defectul: componenta A pierde intrarea din nodComp (orice defect care lasă o sursă fără nod); unirea o cere.
  ;(bun(grafulIncremental(w.camere, R), 'graf').nodComp as Map<number, number>).delete(A.id)
  const urgente = statGraf(w.camere).refaceriDeUrgenta
  assert.ok(applyCommand(w, { kind: 'dig', wx: wx + 5, wy: wy + 3, z: g - 3 }, R).ok, 'usa dintre pivnite')
  assert.equal(statGraf(w.camere).refaceriDeUrgenta, urgente + 1, 'fixtura: delta a lovit invariantul')
  const st = statTermic(w)
  assert.equal(st.invarianti, 1)
  assert.equal(st.ultimulInvariant, MOTIV_GRAF_URGENTA)
  assert.deepEqual(canonic(w, bun(grafulIncremental(w.camere, R), 'graf')), canonic(w, bun(construiesteGrafIncremental(w.camere, R), 'integral')))
  for (const c of w.camere.comp.values()) assert.equal(w.temperatura.slot.are[c.id], 1)
  assert.doesNotThrow(() => encode(w))
})

test('STARE verdictul lotului (PAS-4, GRAF-1): functie pura — curat → accept; sursa fara T, abaterile evidentei, graful refuzat, refacerea de urgenta → INVARIANT_INCALCAT cu motivul lor, in ordinea asta', () => {
  const gBun = accept(null)
  const gRau = refuse(Reason.INVARIANT_INCALCAT, { motiv: 'muchie asimetrica' })
  const motiv = (o: ReturnType<typeof verdictulLotului>): string => (o.ok ? 'ok' : String(o.params.motiv))
  assert.equal(motiv(verdictulLotului({ surseFaraT: 0, abateri: 0, graf: gBun, deUrgenta: false })), 'ok')
  assert.equal(motiv(verdictulLotului({ surseFaraT: 2, abateri: 0, graf: gBun, deUrgenta: false })), 'o sursa a provenientei n-avea T (stare nesincronizata)')
  assert.equal(motiv(verdictulLotului({ surseFaraT: 0, abateri: 1, graf: gBun, deUrgenta: false })), 'evidenta maselor nu se inchide')
  assert.equal(motiv(verdictulLotului({ surseFaraT: 0, abateri: 0, graf: gRau, deUrgenta: false })), 'muchie asimetrica')
  assert.equal(motiv(verdictulLotului({ surseFaraT: 0, abateri: 0, graf: gBun, deUrgenta: true })), MOTIV_GRAF_URGENTA)
  // Ordinea: primul invariant încălcat.
  assert.equal(motiv(verdictulLotului({ surseFaraT: 1, abateri: 1, graf: gRau, deUrgenta: true })), 'o sursa a provenientei n-avea T (stare nesincronizata)')
  assert.equal(motiv(verdictulLotului({ surseFaraT: 0, abateri: 1, graf: gRau, deUrgenta: true })), 'evidenta maselor nu se inchide')
  assert.equal(motiv(verdictulLotului({ surseFaraT: 0, abateri: 0, graf: gRau, deUrgenta: true })), 'muchie asimetrica')
  const r = verdictulLotului({ surseFaraT: 0, abateri: 3, graf: gBun, deUrgenta: false })
  assert.ok(!r.ok && r.reason === Reason.INVARIANT_INCALCAT && r.params.abateri === 3)
})

test('STARE sursa fara T intr-un lot de comanda (PAS-4): pivnita fara T, apoi o celula sapata in ea — INVARIANT numarat, cu motivul', () => {
  const s = casaTermica({ k: 1 })
  const w = laEchilibru(s.w, 300000)
  const piv = componentaLa(w.camere, ...s.rep.pivnita!)!.id
  w.temperatura.slot.are[piv] = 0
  const [px, py, pz] = s.rep.pivnita!
  assert.ok(applyCommand(w, { kind: 'dig', wx: px + 1, wy: py, z: pz - 1 }, R).ok, 'groapa in podeaua pivnitei')
  assert.equal(statTermic(w).invarianti, 1, JSON.stringify(statTermic(w)))
  assert.equal(statTermic(w).ultimulInvariant, 'o sursa a provenientei n-avea T (stare nesincronizata)')
})

test('STARE pas: indexul nu e la zi cu terenul (PAS-4): o sapatura direct in teren, fara sincronizare (stampila e a indexului) — pasul numara invariantul, sincronizeaza indexul si graful, reia T de la echilibru pe toate', () => {
  const s = casaTermica({ k: 1 })
  const w = laEchilibru(s.w, 300000)
  const [cx, cy, cz] = s.rep.casa!
  assert.ok(dig(w.terrain, cx + 1, cy, cz - 1).ok)
  assert.ok(verificaStampila(w).ok, 'fixtura: stampila e a indexului (indexul doar ramas in urma)')
  pasTermic(w, R)
  assert.equal(statTermic(w).invarianti, 1)
  assert.equal(statTermic(w).ultimulInvariant, 'pas: indexul nu e la zi cu terenul')
  assert.equal(w.camere.vazute, w.terrain.editari, 'indexul sincronizat de pas')
  assert.ok(componentaLa(w.camere, cx + 1, cy, cz - 1) !== null, 'groapa e in index')
  for (const c of w.camere.comp.values()) assert.equal(w.temperatura.slot.are[c.id], 1)
  assert.deepEqual(canonic(w, bun(grafulIncremental(w.camere, R), 'graf')), canonic(w, bun(construiesteGrafIncremental(w.camere, R), 'integral')))
})

test('STARE rezervoareCitite numara fiecare pas cu componente (PAS-4: controlul pozitiv al scenariului standard, care il cere 0)', () => {
  const s = casaTermica()
  const w = laEchilibru(s.w, 0)
  for (let k = 0; k < 7; k++) {
    w.tick = k * R.ticksPerSecond
    pasTermic(w, R)
  }
  assert.deepEqual([statTermic(w).pasi, statTermic(w).rezervoareCitite], [7, 7])
})

test('STARE comenzile trec prin punctul unic: dig si fill pe o casa — fara invarianti, stampila la zi dupa fiecare comanda, salvarea merge intre comanda si tick', () => {
  const s = casaTermica({ k: 1 })
  const w = laEchilibru(s.w, 300000)
  const [cx, cy, cz] = s.rep.casa!
  for (let k = 0; k < 6; k++) {
    assert.ok(applyCommand(w, { kind: 'dig', wx: cx + 1, wy: cy + 1, z: cz - 1 }, R).ok)
    assert.ok(verificaStampila(w).ok, `dupa dig ${k}`)
    assert.doesNotThrow(() => encode(w))
    assert.ok(applyCommand(w, { kind: 'fill', wx: cx + 1, wy: cy + 1, z: cz - 1, material: P }, R).ok)
    assert.ok(verificaStampila(w).ok, `dupa fill ${k}`)
    tick(w, R)
  }
  faraInvarianti(w, 'comenzile')
  assert.ok(statTermic(w).loturi >= 12, JSON.stringify(statTermic(w)))
})

test('STARE incarcarea (schema 8): lumea incarcata are exact (T, rest) ale lumii continue, pe ancora; fara invarianti la tickurile urmatoare', () => {
  const s = casaTermica({ k: 1, etaj: true })
  const w = laEchilibru(s.w, 300000)
  for (let i = 0; i < 100; i++) tick(w, R)
  const d = bun(decode(encode(w), R), 'decode')
  assert.deepEqual(tPeAncora(d), tPeAncora(w))
  assert.ok(tPeAncora(w).some((l) => !l.endsWith(':0')), 'fixtura: restul nenul la salvare')
  assert.ok(verificaStampila(d).ok)
  assert.equal(statTermic(d).restNormalizat, 0, 'aceeasi amprenta: validare stricta, nimic normalizat')
  for (let i = 0; i < 40; i++) tick(d, R)
  faraInvarianti(d, 'dupa incarcare')
})

test('STARE migrarea (schema 7 -> 8, §7): o salvare fara blocul temperaturii porneste de la echilibru — fiecare componenta are T == regimul permanent la tickul salvarii, rest 0, fara invarianti la tickurile urmatoare', () => {
  const s = casaTermica({ k: 1, etaj: true })
  const w = laEchilibru(s.w, 300000)
  for (let i = 0; i < 100; i++) tick(w, R)
  const brut = JSON.parse(encode(w)) as { schema: number; data: Record<string, unknown> }
  brut.schema = 7
  delete brut.data.temperaturi
  const d = bun(decode(JSON.stringify(brut), R), 'decode')
  const reg = bun(regimPermanent(d, R, d.tick, PLAFON_ECHILIBRU), 'regim')
  assert.equal(reg.graf.n, 3)
  for (let i = 0; i < reg.graf.n; i++) {
    const c = reg.graf.comp[i]!
    assert.deepEqual([d.temperatura.slot.t[c], d.temperatura.slot.rest[c], d.temperatura.slot.are[c]], [reg.t[i], 0, 1])
  }
  assert.ok(verificaStampila(d).ok)
  for (let i = 0; i < 40; i++) tick(d, R)
  faraInvarianti(d, 'dupa incarcare')
})

test('STARE plasa de siguranta ±1000 °C (PROV-1 b): exploitul pompei C3 — ciclul incrucisat K=24, o comanda pe tick, cu timpul pornit — T nu trece de 1000 °C dupa nicio comanda si niciun tick, fiecare taiere numarata (taieri, invariant); salvarea merge, iar lumea incarcata continua identic', () => {
  // Măsurat (10.10, F1): FĂRĂ plasă, T trece de 1000 °C la tickul 8.272 și ajunge la 249.724 °C la 20.000, iar `encode`
  // aruncă („temperatura nu se poate salva (temperaturi.t)", T ≥ 2^31 Q16 = 32.768 °C) — la nesfârșit, cât ține jocul.
  const c = casaPompei(24, oraDeVara(15))
  const w = c.w
  const prog = cicluIncrucisat(c)
  let max = -Infinity
  const vede = (): void => {
    const t = w.temperatura.slot.t[c.id()]!
    if (t > max) max = t
  }
  let j = 0
  const pas = (x: typeof w, k: number): void => {
    comanda(x, prog[k % prog.length]!)
    if (x === w) vede()
    tick(x, R)
    if (x === w) vede()
  }
  for (let i = 0; i < 10000; i++) pas(w, j++)
  assert.ok(max <= T_SIGURANTA, `T a trecut de plasa: ${max / 65536} °C`)
  assert.equal(max, T_SIGURANTA, 'fixtura: pompa a ajuns la plasa')
  const st = statTermic(w)
  assert.ok(st.taieri > 0, JSON.stringify(st))
  assert.equal(st.invarianti, st.taieri, 'fiecare taiere e un invariant (un lot sau un pas taie o singura componenta aici)')
  assert.equal(st.ultimulInvariant, MOTIV_TAIERE)
  // Salvarea merge, iar lumea încărcată continuă identic (plasa e în lumea continuă și în cea încărcată, deterministă).
  const d = bun(decode(encode(w), R), 'decode')
  for (let i = 0; i < 400; i++) {
    pas(w, j)
    pas(d, j++)
  }
  assert.deepEqual(tPeAncora(d), tPeAncora(w))
})

test('STARE temperaturaLaEchilibru cere indexul la zi (refuz), iar la plafon (SAV-9) da ultima iterata, determinista, cu contor — hotelul 10x10x4 la 3 treceri', () => {
  const s = casaTermica()
  assert.ok(fill(s.w.terrain, s.x0 - 3, s.y0 - 3, s.g + 1, P).ok)
  const r = temperaturaLaEchilibru(s.w, R, 0)
  assert.ok(!r.ok && r.params.motiv === 'indexul nu e la zi cu terenul')
  bun(sincronizeazaLumea(s.w, R), 'sincronizare')
  const e = bun(temperaturaLaEchilibru(s.w, R, 0), 'echilibru')
  assert.ok(e.convergent)
  assert.equal(statTermic(s.w).echilibreNeconvergente, 0)
  // Hotelul cere zeci de treceri (termic.test.ts): la plafonul 3 nu converge — acceptat, cu contorul, ultima iterată.
  const h1 = hotel(10, 4)
  const h2 = hotel(10, 4)
  const p1 = bun(temperaturaLaEchilibru(h1, R, 0, 3), 'plafon 3')
  const p2 = bun(temperaturaLaEchilibru(h2, R, 0, 3), 'plafon 3, din nou')
  assert.deepEqual([p1.convergent, p1.treceri], [false, 3])
  assert.equal(statTermic(h1).echilibreNeconvergente, 1)
  assert.deepEqual(tPeAncora(h1), tPeAncora(h2), 'ultima iterata e determinista')
  assert.ok(p2 !== null)
  const plin = bun(temperaturaLaEchilibru(h1, R, 0), 'plafonul jocului')
  assert.ok(plin.convergent && plin.treceri > 3, `${plin.treceri} treceri`)
})
