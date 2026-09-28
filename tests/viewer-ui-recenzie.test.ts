/**
 * Recenzia codului UI-ului (28.09): fiecare constatare reparata in model, pe LUME REALA (sim-ul de
 * azi, fixturile din fixturi.ts), cu scenariile pe care le-au masurat lentilele si verificatorii.
 * Id-urile (MOD-n, T-n) sunt cele din DEVLOG, intrarea recenziei.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { Categorie, FelJob, Gand, Item, NEVOI, Nevoie, Piesa } from '../src/sim/state.ts'
import { codMotiv, Reason } from '../src/sim/result.ts'
import { DetaliuMotiv } from '../src/sim/desemnari.ts'
import { rezervariPentru, Strat } from '../src/sim/rezervari.ts'
import { StareRatiune } from '../src/sim/joburi.ts'
import { indexZone, vedereFaraDepozit, Zona } from '../src/sim/zone.ts'
import { materialAt } from '../src/sim/terrain/terrain.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { tick } from '../src/sim/world.ts'
import type { World } from '../src/sim/state.ts'
import { activitatePion, cauzaGolirii, creeazaPrevizualizare, refacePrevizualizarea, inspecteazaCelula, inspecteazaPion, rezumatColonie, semnaleAlerte, stareDesemnare } from '../viewer/ui/model.ts'
import { actualizeaza, creeazaAlerte, REGULI_ALERTE } from '../viewer/ui/alerte.ts'
import { laSit, lasaItem, patratPlat, picteaza, R, solid } from './fixturi.ts'
import type { Sit } from './fixturi.ts'

// ---------------------------------------------------------------------------------------------
// MOD-1: mormanele fara depozit (alerta, inspectorul)
// ---------------------------------------------------------------------------------------------

/** 24 de mormane de 50 de piatra pe jos, in doua randuri langa sit: 1.200 de piatra. */
function cuMormane(seed: number): { w: World; sit: Sit; mormane: number[] } {
  const { w, sit } = laSit(seed, 4)
  const mormane: number[] = []
  for (let i = 0; i < 24; i++) mormane.push(lasaItem(w, Item.PIATRA, 50, sit.wx - 6 + (i % 12), sit.wy + 6 + Math.floor(i / 12)))
  return { w, sit, mormane }
}

const depozit = (w: World, sit: Sit, latura: number, fel?: number): number => {
  const p = patratPlat(w, sit, latura, 3, 60)
  assert.ok(p, `niciun patrat plat de ${latura}`)
  return picteaza(w, p.x0, p.y0, latura, undefined, R, fel)
}

/** Ruleaza si urmareste alerta `id` prin masina reala (la 10 tickuri, cadenta UI-ului la 1×). */
function urmaresteAlerta(w: World, id: string, ticks: number, laTick?: (t: number) => void): { apare: number[]; dispare: number[]; text: string } {
  const a = creeazaAlerte()
  const apare: number[] = []
  const dispare: number[] = []
  let text = ''
  for (let t = 0; t < ticks; t++) {
    laTick?.(t)
    tick(w, R)
    if (t % 10 !== 0) continue
    const inainte = a.jurnal.length
    actualizeaza(a, REGULI_ALERTE, semnaleAlerte(w, R, null), w.tick, R.ticksPerSecond)
    for (const j of a.jurnal.slice(inainte)) {
      if (j.id !== id) continue
      if (j.tip === 'apare') { apare.push(j.tick); text = j.text }
      if (j.tip === 'dispare') dispare.push(j.tick)
    }
  }
  return { apare, dispare, text }
}

/** Starea din inspector a primului morman care zace pe jos (nu intr-o zona). */
function stareaUnuiMormanPeJos(w: World): string {
  for (let i = 0; i < w.iteme.count; i++) {
    if (w.iteme.alive[i] !== 1) continue
    const c = inspecteazaCelula(w, R, w.iteme.wx[i]!, w.iteme.wy[i]!, w.iteme.z[i]! - 1, null)
    if (c.zona === null && c.morman) return c.morman.stare.titlu
  }
  return ''
}

test('MOD-1: depozitul plin ⇒ alerta „nu încap" in 20 s, fara clipire; inspectorul nu promite un caraus', () => {
  const { w, sit } = cuMormane(12345)
  depozit(w, sit, 2)
  // Pe hartie: 4 celule × 75 = 300 din 1.200 — 18+ mormane raman pe jos. Verificatorul: 15,6 s.
  const r = urmaresteAlerta(w, 'fara-depozit', 1600)
  assert.equal(r.apare.length, 1, `aparitii: ${r.apare}`)
  assert.ok(r.apare[0]! <= 20 * R.ticksPerSecond, `a aparut la tickul ${r.apare[0]}`)
  assert.deepEqual(r.dispare, [], 'a clipit')
  assert.match(r.text, /nu încap în depozite/)
  const s = stareaUnuiMormanPeJos(w)
  assert.doesNotMatch(s, /așteaptă un cărăuș/)
  assert.match(s, /pline/)
})

test('MOD-1/MOD-5: doar un loc de dormit ⇒ „niciun depozit", o singura data; inspectorul spune „Niciun depozit"', () => {
  const { w, sit } = cuMormane(12345)
  depozit(w, sit, 3, Zona.DORMIT)
  const r = urmaresteAlerta(w, 'fara-depozit', 3000)
  assert.equal(r.apare.length, 1, `aparitii: ${r.apare}`)
  assert.deepEqual(r.dispare, [], 'a clipit (indexul murdarit de rezervarile de pe paturi)')
  assert.match(r.text, /niciun depozit/)
  assert.match(stareaUnuiMormanPeJos(w), /^Niciun depozit pentru piatră/)
})

test('MOD-1: depozit cu loc ⇒ alerta nu apare; pictat dupa, dispare in 1 s si nu revine cat se cara', () => {
  const mare = cuMormane(12345)
  depozit(mare.w, mare.sit, 5)
  assert.deepEqual(urmaresteAlerta(mare.w, 'fara-depozit', 1600).apare, [], 'fals pozitiv cat se cara intr-un depozit cu loc')

  const tr = cuMormane(12345)
  let pictat = -1
  const r = urmaresteAlerta(tr.w, 'fara-depozit', 2400, (t) => { if (t === 400) { depozit(tr.w, tr.sit, 5); pictat = tr.w.tick } })
  assert.equal(r.apare.length, 1, 'fara nicio zona, alerta trebuie sa apara intai')
  assert.equal(r.dispare.length, 1)
  assert.ok(r.dispare[0]! - pictat <= R.ticksPerSecond, `a disparut la ${r.dispare[0]! - pictat} tickuri dupa pictare`)
})

test('MOD-1: vedereFaraDepozit pe indexul LA ZI — un morman cu loc in depozit nu e „fara depozit"; fara loc, da', () => {
  // Scenariile cu pioni nu prind ramura asta: cat se cara, indexul sta murdar (masurat de verificator).
  // Aici indexul se reconstruieste explicit — testul scrie in lume, e fixtura.
  const { w, sit } = laSit(4242, 1)
  const p = patratPlat(w, sit, 1, 10, 60)!
  picteaza(w, p.x0, p.y0, 1)
  const a = lasaItem(w, Item.PIATRA, 50, sit.wx + 3, sit.wy + 6)
  indexZone(w, R)
  assert.equal(w.zone.index.murdar, false)
  assert.equal(vedereFaraDepozit(w).esteFaraDepozit(w.iteme.laId.get(a)!), false, '50 incap in celula goala de 75')
  lasaItem(w, Item.PIATRA, 75, p.x0, p.y0)
  indexZone(w, R)
  const v = vedereFaraDepozit(w)
  assert.equal(v.esteFaraDepozit(w.iteme.laId.get(a)!), true, 'depozitul e plin')
  assert.equal(v.depozite, 1)
})

test('MOD-5: un loc de dormit nu e depozit (bara de sus, inspectorul, „nimeni-cara")', () => {
  const { w, sit } = laSit(4242, 2)
  const p = patratPlat(w, sit, 3, 3, 30)!
  lasaItem(w, Item.PIATRA, 50, p.x0 + 1, p.y0 + 1)
  picteaza(w, p.x0, p.y0, 3, undefined, R, Zona.DORMIT)
  const m = rezumatColonie(w, R).marfa[Item.PIATRA]!
  assert.equal(m.inDepozit, 0, 'un morman dintr-un dormitor nu e „în depozit"')
  assert.equal(m.peJos, 50)
  const c = inspecteazaCelula(w, R, p.x0 + 1, p.y0 + 1, solid(w, p.x0 + 1, p.y0 + 1)!, null)
  assert.notEqual(c.morman?.stare.titlu, 'În depozit.')
  // Cu un depozit in alta parte si nimeni cu voie la carat, mormanul din dormitor e marfa de carat.
  const alt = patratPlat(w, sit, 2, 40, 90)!
  picteaza(w, alt.x0, alt.y0, 2)
  for (let i = 0; i < w.agents.count; i++) applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[i]!, categorie: Categorie.CARA, nivel: 0 }, R)
  assert.equal(semnaleAlerte(w, R, null).get('nimeni-cara')?.activ, true)
})

// ---------------------------------------------------------------------------------------------
// MOD-2: „De ce nu?" pe o piesa de construit fara loc de lucru
// ---------------------------------------------------------------------------------------------

function faraLoc(w: World, id: number): number {
  const ds = w.desemnari.laId.get(id)!
  w.desemnari.ultimulMotiv[ds] = codMotiv(Reason.INACCESIBIL)
  w.desemnari.ultimulMotivDetaliu[ds] = DetaliuMotiv.FARA_LOC_DE_LUCRU
  w.desemnari.reincercaLaTick[ds] = w.tick + 100
  return ds
}

test('MOD-2: piesa de etaj fara loc de stat ⇒ treapta/scara, nu „Sapă"; piesa dintr-o groapa ⇒ „Sapă lângă ea"', () => {
  const { w, sit } = laSit(20260913, 1)
  const p = patratPlat(w, sit, 5, 4, 40)!
  // Etajul: un perete la sol+4 deasupra unui stalp nezidit, vecinii sunt aer la nivelul lui.
  const sus = applyCommand(w, { kind: 'desemneaza', wx: p.x0 + 2, wy: p.y0 + 2, z: p.g + 4, piesa: Piesa.PERETE }, R)
  assert.ok(sus.ok, JSON.stringify(sus))
  const t = stareDesemnare(w, R, faraLoc(w, sus.value as number), null).text
  assert.doesNotMatch(t.actiune, /^Sapă/)
  assert.match(t.actiune, /scară/)
  assert.match(t.titlu, /2 m mai jos/, 'la zidit omul ajunge si de la atingereSusM mai jos')

  // Groapa 1×1 adanca de 4 (verificatorul: aici „Sapă" e raspunsul corect — o sapatura si se zideste).
  const q = patratPlat(w, sit, 3, 10, 60)!
  const gx = q.x0 + 1, gy = q.y0 + 1
  for (let k = 0; k < 4; k++) assert.ok(applyCommand(w, { kind: 'dig', wx: gx, wy: gy, z: q.g - k }, R).ok)
  let jos: ReturnType<typeof applyCommand> | null = null
  for (const z of [q.g - 2, q.g - 1]) { jos = applyCommand(w, { kind: 'desemneaza', wx: gx, wy: gy, z, piesa: Piesa.PERETE }, R); if (jos.ok) break }
  assert.ok(jos?.ok, JSON.stringify(jos))
  assert.equal(stareDesemnare(w, R, faraLoc(w, jos.value as number), null).text.actiune, 'Sapă lângă ea, de sus în jos.')
  // O sapatura ramane sapatura: textul ei e cel vechi.
  const sapa = applyCommand(w, { kind: 'desemneaza', wx: p.x0, wy: p.y0, z: p.g }, R)
  assert.ok(sapa.ok)
  assert.match(stareDesemnare(w, R, faraLoc(w, sapa.value as number), null).text.actiune, /^Sapă de sus în jos/)
})

test('MOD-2: treapta propusa chiar rezolva — varful unui stalp de 4 se zideste dupa ea', () => {
  const { w, sit } = laSit(777, 4)
  for (let i = 0; i < 6; i++) lasaItem(w, Item.PIATRA, 75, sit.wx + i, sit.wy + 3)
  const p = patratPlat(w, sit, 5, 5, 40)!
  const x = p.x0 + 2, y = p.y0 + 2
  let varf = -1
  for (let h = 1; h <= 4; h++) {
    const o = applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z: p.g + h, piesa: Piesa.PERETE }, R)
    assert.ok(o.ok, JSON.stringify(o))
    if (h === 4) varf = o.value as number
  }
  const faraLocDeLucru = (): boolean => {
    const ds = w.desemnari.laId.get(varf)
    return ds !== undefined && w.desemnari.ultimulMotiv[ds] === codMotiv(Reason.INACCESIBIL) && w.desemnari.ultimulMotivDetaliu[ds] === DetaliuMotiv.FARA_LOC_DE_LUCRU
  }
  let t = 0
  while (!faraLocDeLucru() && t++ < 4000) tick(w, R)
  assert.ok(faraLocDeLucru(), 'varful n-a ajuns la FARA_LOC_DE_LUCRU')
  const ds = w.desemnari.laId.get(varf)!
  assert.match(stareDesemnare(w, R, ds, null).text.actiune, /treaptă/)
  // Ce spune textul: o treapta langa stalp, cel mult 2 m sub varf. Una singura, la sol+1: omul sta pe
  // ea la sol+2 si zideste 2 m mai sus. Pe o latura fara om pe ea (CELULA_OCUPATA).
  const treapta = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => applyCommand(w, { kind: 'desemneaza', wx: x + dx!, wy: y + dy!, z: p.g + 1, piesa: Piesa.PERETE }, R).ok)
  assert.ok(treapta, 'nicio latura libera pentru treapta')
  const zidit = (): boolean => { const m = materialAt(w.terrain, x, y, p.g + 4); return m.ok && m.value === Material.PIATRA_CONSTRUITA }
  t = 0
  while (!zidit() && t++ < 6000) tick(w, R)
  assert.ok(zidit(), 'varful tot nezidit dupa treapta propusa')
})

// ---------------------------------------------------------------------------------------------
// MOD-3: alerta „blocate"
// ---------------------------------------------------------------------------------------------

test('MOD-3: lipsa de piatra si o lucrare de neatins aprind „blocate"; racirea expirata tine inca doua scanari', () => {
  const { w, sit } = laSit(8080, 1)
  const p = patratPlat(w, sit, 3, 20, 60)!
  const o = applyCommand(w, { kind: 'desemneaza', wx: p.x0, wy: p.y0, z: p.g + 1, piesa: Piesa.PERETE }, R)
  assert.ok(o.ok)
  const ds = w.desemnari.laId.get(o.value as number)!
  const d = w.desemnari
  const blocate = () => semnaleAlerte(w, R, null).get('blocate')!
  assert.equal(blocate().activ, false, 'fara motiv, nu e blocata')
  // LIPSA_MATERIAL: sim-ul o scrie FARA racire si o sterge cand apare materialul.
  d.ultimulMotiv[ds] = codMotiv(Reason.LIPSA_MATERIAL)
  d.reincercaLaTick[ds] = 0
  assert.equal(blocate().activ, true)
  assert.match(blocate().text, /^O lucrare stă, fără nicio lucrare în curs lângă: Lipsește piatră/)
  // Un refuz cu racire: activ in racire si inca 2 × jobRescanTicks dupa ea, apoi nu.
  d.ultimulMotiv[ds] = codMotiv(Reason.INACCESIBIL)
  d.ultimulMotivDetaliu[ds] = DetaliuMotiv.FARA_LOC_DE_LUCRU
  d.reincercaLaTick[ds] = w.tick + 50
  assert.equal(blocate().activ, true, 'in racire')
  d.reincercaLaTick[ds] = w.tick - 2 * R.jobRescanTicks + 1
  assert.equal(blocate().activ, true, 'racirea abia a expirat: pana la rescanare, tot blocata')
  assert.doesNotMatch(blocate().text, /Ultimul refuz memorat/, 'textul alertei nu citeaza „ultimul refuz"')
  d.reincercaLaTick[ds] = w.tick - 2 * R.jobRescanTicks
  assert.equal(blocate().activ, false, 'refuz vechi: nu mai e o blocare')
})

test('T-05: „blocate" ignora lucrarile cu o lucrare IN CURS la cel mult 8 celule (8 da, 9 nu)', () => {
  const { w, sit } = laSit(8080, 2)
  const p = patratPlat(w, sit, 10, 20, 80)!
  const a = applyCommand(w, { kind: 'desemneaza', wx: p.x0, wy: p.y0, z: p.g }, R)
  assert.ok(a.ok)
  // O lucrare „in curs": rezervata pe LUCRU de un pion.
  let t = 0
  while (rezervariPentru(w.rezervari, a.value as number, Strat.LUCRU).length === 0 && t++ < 2000) tick(w, R)
  assert.ok(rezervariPentru(w.rezervari, a.value as number, Strat.LUCRU).length > 0, 'nimeni n-a luat sapatura')
  for (const [dx, activ] of [[8, false], [9, true]] as const) {
    const b = applyCommand(w, { kind: 'desemneaza', wx: p.x0 + dx, wy: p.y0, z: solid(w, p.x0 + dx, p.y0)! }, R)
    assert.ok(b.ok)
    const ds = w.desemnari.laId.get(b.value as number)!
    w.desemnari.ultimulMotiv[ds] = codMotiv(Reason.LIPSA_MATERIAL)
    assert.equal(semnaleAlerte(w, R, null).get('blocate')!.activ, activ, `la ${dx} celule`)
    applyCommand(w, { kind: 'anuleazaDesemnarea', id: b.value as number }, R)
  }
})

// ---------------------------------------------------------------------------------------------
// MOD-4: „dorm-pe-jos" citeste starea, cu textul pe cauza
// ---------------------------------------------------------------------------------------------

test('MOD-4: „dorm-pe-jos" e cine doarme pe jos ACUM, cu textul pe paturi (niciunul / prea putine / departe)', () => {
  const { w, sit } = laSit(3030, 3)
  const a = w.agents
  const semnal = () => semnaleAlerte(w, R, null).get('dorm-pe-jos')!
  assert.equal(semnal().activ, false)
  // Gandul de 5 minute singur nu mai aprinde nimic: omul s-a trezit.
  a.gandFel[0] = Gand.DORMIT_PE_JOS
  a.gandPanaLa[0] = w.tick + 6000
  assert.equal(semnal().activ, false, 'a dormit pe jos, dar acum e treaz')
  // Doarme ACUM pe jos: DOARME, pas de oprire (1), fara pat (jobDest 0).
  a.jobKind[0] = FelJob.DOARME
  a.jobStep[0] = 1
  a.jobDest[0] = 0
  assert.equal(semnal().activ, true)
  assert.match(semnal().text, /^Un om doarme pe jos: niciun loc de dormit/)
  const p = patratPlat(w, sit, 3, 8, 40)!
  applyCommand(w, { kind: 'picteazaZona', x0: p.x0, y0: p.y0, x1: p.x0, y1: p.y0, z: p.g + 1, fel: Zona.DORMIT }, R)
  assert.match(semnal().text, /un pat pentru 3 oameni\. Mărește/)
  applyCommand(w, { kind: 'picteazaZona', x0: p.x0 + 1, y0: p.y0, x1: p.x0 + 2, y1: p.y0, z: p.g + 1, fel: Zona.DORMIT }, R)
  assert.match(semnal().text, /departe de paturi/)
  assert.doesNotMatch(semnal().text, /Pictează un loc de dormit \(/, 'paturile exista: nu cere pictarea lor')
})

// ---------------------------------------------------------------------------------------------
// MOD-6, MOD-7, MOD-9, MOD-10: pionul, mormanul, insignele
// ---------------------------------------------------------------------------------------------

test('MOD-6/MOD-7: „Stă:" din punctul pionului, iar cantitatile cu „de" de la 20', () => {
  const { w } = laSit(6161, 2)
  w.ratiune.stare[0] = StareRatiune.RESPINS
  w.ratiune.motivFinal[0] = codMotiv(Reason.FARA_DEPOZIT)
  assert.equal(activitatePion(w, R, 0), 'Stă: marfa de cărat n-are unde fi dusă — pictează sau mărește un depozit')
  w.ratiune.motivFinal[0] = codMotiv(Reason.PREA_DEPARTE)
  assert.match(activitatePion(w, R, 0), /peste 96 de celule de el$/)
  w.agents.caraCantitate[1] = 50
  w.agents.caraKind[1] = Item.PIATRA
  assert.equal(inspecteazaPion(w, R, w.agents.id[1]!)!.mana, '50 de piatră')
  w.agents.caraCantitate[1] = 19
  assert.equal(inspecteazaPion(w, R, w.agents.id[1]!)!.mana, '19 piatră')
})

test('MOD-9: un morman luat de un CONSTRUCTOR nu e „în drum spre depozit"', () => {
  const { w, sit } = laSit(55555, 2)
  picteaza(w, sit.wx, sit.wy + 3, 3)
  const is = lasaItem(w, Item.PIATRA, 60, sit.wx + 1, sit.wy + 4)
  const g = solid(w, sit.wx + 5, sit.wy)!
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: sit.wx + 5, wy: sit.wy, z: g + 1, piesa: Piesa.PERETE }, R).ok)
  let vazut = ''
  for (let t = 0; t < 1500 && vazut === ''; t++) {
    tick(w, R)
    const s = w.iteme.laId.get(is)
    if (s === undefined) break
    const rez = rezervariPentru(w.rezervari, is, Strat.CARAT)
    if (rez.length === 0) continue
    const cine = w.agents.jobKind[0] === FelJob.CONSTRUIESTE || w.agents.jobKind[1] === FelJob.CONSTRUIESTE
    if (!cine) continue
    vazut = inspecteazaCelula(w, R, w.iteme.wx[s]!, w.iteme.wy[s]!, w.iteme.z[s]! - 1, null).morman!.stare.titlu
  }
  assert.match(vazut, /^Luat pentru construit — /)
})

test('MOD-10: insignele „flămânzi"/„obosiți" nu-i numara pe cei care mananca sau dorm', () => {
  const { w } = laSit(9191, 2)
  const a = w.agents
  a.nevoi[0 * NEVOI + Nevoie.FOAME] = R.nevoi[Nevoie.FOAME]!.prag - 1
  a.nevoi[1 * NEVOI + Nevoie.ODIHNA] = R.nevoi[Nevoie.ODIHNA]!.prag - 1
  assert.deepEqual([rezumatColonie(w, R).flamanzi, rezumatColonie(w, R).obositi], [1, 1])
  a.jobKind[0] = FelJob.MANANCA
  a.jobKind[1] = FelJob.DOARME
  assert.deepEqual([rezumatColonie(w, R).flamanzi, rezumatColonie(w, R).obositi], [0, 0])
})

// ---------------------------------------------------------------------------------------------
// MOD-8 / T-03: cauza golirii
// ---------------------------------------------------------------------------------------------

test('MOD-8: cauza golirii vine din lume — fara hrana ramasa, foamea; cu hrana, au plecat', () => {
  const fara = laSit(99, 3)
  const cu = laSit(99, 3)
  lasaItem(cu.w, Item.HRANA, 40, cu.sit.wx + 3, cu.sit.wy + 3)
  for (const w of [fara.w, cu.w]) {
    for (let i = 0; i < w.agents.count; i++) applyCommand(w, { kind: 'killAgent', id: w.agents.id[i]! }, R)
    w.plecatiTotal = 60
  }
  assert.equal(cauzaGolirii(fara.w, R), 'hrana')
  assert.equal(cauzaGolirii(cu.w, R), 'plecati')
})

// ---------------------------------------------------------------------------------------------
// T-05: fiecare regula de alerta, aprinsa pe lume reala, cu pragul pe hartie
// ---------------------------------------------------------------------------------------------

test('T-05: „hrana-scade" sub 10 minute (12 oameni: 150 de hrana da, 300 nu), „fara-hrana" la zero', () => {
  // Pe hartie: 12 × 6 × (20 × 60 / 250) = 345,6 puncte pe minut; 150 × 15 = 2.250 ⇒ 6,5 min; 300 ⇒ 13,0 min.
  const cu150 = laSit(777, 12)
  lasaItem(cu150.w, Item.HRANA, 75, cu150.sit.wx, cu150.sit.wy + 9)
  lasaItem(cu150.w, Item.HRANA, 75, cu150.sit.wx + 1, cu150.sit.wy + 9)
  assert.equal(semnaleAlerte(cu150.w, R, null).get('hrana-scade')!.activ, true)
  const cu300 = laSit(777, 12)
  for (let i = 0; i < 4; i++) lasaItem(cu300.w, Item.HRANA, 75, cu300.sit.wx + i, cu300.sit.wy + 9)
  assert.equal(semnaleAlerte(cu300.w, R, null).get('hrana-scade')!.activ, false)
  const zero = laSit(777, 12)
  const s = semnaleAlerte(zero.w, R, null)
  assert.equal(s.get('fara-hrana')!.activ, true)
  assert.equal(s.get('hrana-scade')!.activ, false, 'la zero spune „fara-hrana", nu „scade"')
  const a = creeazaAlerte()
  assert.deepEqual(actualizeaza(a, REGULI_ALERTE, s, 0, R.ticksPerSecond).map((x) => x.id), [])
  assert.deepEqual(actualizeaza(a, REGULI_ALERTE, s, 5 * R.ticksPerSecond, R.ticksPerSecond).map((x) => x.id)[0], 'fara-hrana', 'critica, prima, dupa 5 s')
})

test('T-05: „infometati" sub pragul critic, dar nu pentru cine mananca', () => {
  const { w, sit } = laSit(2020, 2)
  lasaItem(w, Item.HRANA, 75, sit.wx + 3, sit.wy + 3)
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = R.nevoi[Nevoie.FOAME]!.pragCritic - 1
  const s = () => semnaleAlerte(w, R, null).get('infometati')!
  assert.equal(s().activ, true)
  assert.equal(s().text, 'Un om e înfometat și n-are ce mânca.')
  w.agents.jobKind[0] = FelJob.MANANCA
  assert.equal(s().activ, false)
})

test('T-05: „nimeni-sapa" cu prioritatea 0 la toti si o sapatura ceruta; tace cu prioritatile implicite', () => {
  const { w, sit } = laSit(4040, 2)
  const g = solid(w, sit.wx + 3, sit.wy + 3)!
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: sit.wx + 3, wy: sit.wy + 3, z: g }, R).ok)
  assert.equal(semnaleAlerte(w, R, null).get('nimeni-sapa')!.activ, false)
  for (let i = 0; i < w.agents.count; i++) applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[i]!, categorie: Categorie.SAPA, nivel: 0 }, R)
  assert.equal(semnaleAlerte(w, R, null).get('nimeni-sapa')!.activ, true)
})

test('T-05: „imposibile" pe o podea la sol+5, cu previzualizarea', () => {
  const { w, sit } = laSit(5050, 1)
  const p = patratPlat(w, sit, 3, 6, 40)!
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: p.x0 + 1, wy: p.y0 + 1, z: p.g + 5, piesa: Piesa.PODEA }, R).ok)
  const previz = creeazaPrevizualizare().ia(w, R)
  assert.equal(semnaleAlerte(w, R, previz).get('imposibile')!.activ, true)
  assert.equal(semnaleAlerte(w, R, null).get('imposibile')!.activ, false, 'fara previzualizare nu stie')
})

// ---------------------------------------------------------------------------------------------
// T-06: „De ce nu?" — aserțiuni pe TEXT, nu doar pe fel
// ---------------------------------------------------------------------------------------------

test('T-06: motivul memorat — „Reîncearcă în 5 s" in racire, „Ultimul refuz memorat" dupa', () => {
  const { w, sit } = laSit(6060, 1)
  const p = patratPlat(w, sit, 3, 20, 60)!
  const o = applyCommand(w, { kind: 'desemneaza', wx: p.x0, wy: p.y0, z: p.g }, R)
  assert.ok(o.ok)
  const ds = w.desemnari.laId.get(o.value as number)!
  w.desemnari.ultimulMotiv[ds] = codMotiv(Reason.INACCESIBIL)
  w.desemnari.ultimulMotivDetaliu[ds] = DetaliuMotiv.FARA_LOC_DE_LUCRU
  w.desemnari.reincercaLaTick[ds] = w.tick + 100
  assert.match(stareDesemnare(w, R, ds, null).text.titlu, / Reîncearcă în 5 s\.$/)
  w.desemnari.reincercaLaTick[ds] = w.tick
  assert.match(stareDesemnare(w, R, ds, null).text.titlu, /^Ultimul refuz memorat: niciun loc/)
})

test('T-06: al doilea rand de perete peste primul, nezidit, „așteaptă"; primul rand nu; o podea la sol+4 fara scara, „scară"', () => {
  const { w, sit } = laSit(7070, 1)
  const p = patratPlat(w, sit, 3, 6, 40)!
  const r1 = applyCommand(w, { kind: 'desemneaza', wx: p.x0, wy: p.y0, z: p.g + 1, piesa: Piesa.PERETE }, R)
  const r2 = applyCommand(w, { kind: 'desemneaza', wx: p.x0, wy: p.y0, z: p.g + 2, piesa: Piesa.PERETE }, R)
  assert.ok(r1.ok && r2.ok)
  const previz = creeazaPrevizualizare().ia(w, R)
  assert.equal(stareDesemnare(w, R, w.desemnari.laId.get(r2.value as number)!, previz).fel, 'asteapta')
  assert.notEqual(stareDesemnare(w, R, w.desemnari.laId.get(r1.value as number)!, previz).fel, 'asteapta')
  const q = patratPlat(w, sit, 3, 12, 60)!
  // O podea la sol+4 lipita de un stalp zidit de 4 (sta), fara scara: omul de pe sol ajunge doar 2 m
  // mai sus (sol+1 + 2 = sol+3), deci la ea nu ajunge nimeni. (La sol+3 ar ajunge: atingereSusM.)
  for (let h = 1; h <= 4; h++) assert.ok(applyCommand(w, { kind: 'fill', wx: q.x0 + 1, wy: q.y0, z: q.g + h, material: Material.PIATRA_CONSTRUITA }, R).ok)
  const podea = applyCommand(w, { kind: 'desemneaza', wx: q.x0 + 1, wy: q.y0 + 1, z: q.g + 4, piesa: Piesa.PODEA }, R)
  assert.ok(podea.ok)
  const st = stareDesemnare(w, R, w.desemnari.laId.get(podea.value as number)!, creeazaPrevizualizare().ia(w, R))
  assert.equal(st.fel, 'faraAcces')
  assert.match(st.text.actiune, /scară/)
})

test('T-06: mormanul carat de un caraus e „în drum spre depozit"; Exclusiv pe Sapa spune de ce nu cara', () => {
  const { w, sit } = laSit(8181, 1)
  const is = lasaItem(w, Item.PIATRA, 20, sit.wx + 3, sit.wy + 3)
  picteaza(w, sit.wx, sit.wy + 6, 2)
  let t = 0
  while (rezervariPentru(w.rezervari, is, Strat.CARAT).length === 0 && t++ < 2000) tick(w, R)
  const s = w.iteme.laId.get(is)
  assert.ok(s !== undefined && rezervariPentru(w.rezervari, is, Strat.CARAT).length > 0, 'nimeni n-a luat mormanul')
  assert.equal(inspecteazaCelula(w, R, w.iteme.wx[s]!, w.iteme.wy[s]!, w.iteme.z[s]! - 1, null).morman!.stare.titlu, 'În drum spre depozit.')
  const alt = laSit(8181, 1)
  lasaItem(alt.w, Item.PIATRA, 20, alt.sit.wx + 3, alt.sit.wy + 3)
  picteaza(alt.w, alt.sit.wx, alt.sit.wy + 6, 2)
  assert.equal(inspecteazaPion(alt.w, R, alt.w.agents.id[0]!)!.faraVoie, '')
  applyCommand(alt.w, { kind: 'setPrioritatePersonala', id: alt.w.agents.id[0]!, categorie: Categorie.SAPA, nivel: R.personalPriorityLevels }, R)
  assert.equal(inspecteazaPion(alt.w, R, alt.w.agents.id[0]!)!.faraVoie, 'N-are voie la Cară: e pe Exclusiv la Sapă.')
})

test('T-06: previzualizarea se reface si cand se schimba TERENUL (o sapatura sub o piesa planificata)', () => {
  const { w, sit } = laSit(55555, 1)
  const g = solid(w, sit.wx + 3, sit.wy)!
  applyCommand(w, { kind: 'desemneaza', wx: sit.wx + 3, wy: sit.wy, z: g + 1, piesa: Piesa.PERETE }, R)
  const p = creeazaPrevizualizare()
  p.ia(w, R)
  assert.ok(applyCommand(w, { kind: 'dig', wx: sit.wx + 3, wy: sit.wy, z: g }, R).ok)
  p.ia(w, R)
  assert.equal(p.calculari(), 2)
})

test('C2-2: o previzualizare SCUMPA nu se reface periodic cat se zideste — doar la actiune, plan nou, pauza', () => {
  const baza = { proaspat: false, areMemorie: true, planSchimbat: false, pauza: false, ultimaMs: 50, trecutMs: 60_000 }
  assert.equal(refacePrevizualizarea(baza), false, 'scumpa, planul neschimbat, jocul merge: niciodata periodic')
  assert.equal(refacePrevizualizarea({ ...baza, ultimaMs: 8, trecutMs: 999 }), false, 'ieftina: nu mai des de o data pe secunda')
  assert.equal(refacePrevizualizarea({ ...baza, ultimaMs: 8, trecutMs: 1_000 }), true)
  for (const k of ['proaspat', 'planSchimbat', 'pauza'] as const) assert.equal(refacePrevizualizarea({ ...baza, [k]: true }), true, k)
  assert.equal(refacePrevizualizarea({ ...baza, areMemorie: false }), true)
})

test('ECR-11: inspectorul arata lucrarea celulei atinse; pe cea de deasupra doar cand pe cea atinsa nu e nimic', () => {
  const { w, sit } = laSit(7171, 1)
  const p = patratPlat(w, sit, 3, 6, 40)!
  const jos = applyCommand(w, { kind: 'desemneaza', wx: p.x0, wy: p.y0, z: p.g + 1, piesa: Piesa.PERETE }, R)
  const sus = applyCommand(w, { kind: 'desemneaza', wx: p.x0, wy: p.y0, z: p.g + 2, piesa: Piesa.PERETE }, R)
  assert.ok(jos.ok && sus.ok)
  // Clic pe cubul de la sol+1: doar el, nu si cel de deasupra (doua „Lucrare" identice).
  assert.deepEqual(inspecteazaCelula(w, R, p.x0, p.y0, p.g + 1, null).desemnari.map((d) => d.z), [p.g + 1])
  // Clic pe sol (nimic desemnat acolo): lucrarea de deasupra lui, unde s-ar sta.
  assert.deepEqual(inspecteazaCelula(w, R, p.x0, p.y0, p.g, null).desemnari.map((d) => d.z), [p.g + 1])
})
