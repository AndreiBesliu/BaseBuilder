/**
 * Dispozitia si consecintele ei — S16-19, taietura 3, al treilea commit.
 *
 * Cele trei trepte (lucreaza mai incet / refuza munca / pleaca) au fiecare garda
 * ei, si fiecare garda o fixtura in care treapta CHIAR se atinge. Panoul a
 * aratat de ce conteaza: cu valorile copiate dintr-o alta scara, treptele 2 si 3
 * erau cod mort din ziua in care se scriau, si tot ce era acolo parea valid.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { areGand, FelJob, Gand, Item, Nevoie, NEVOI, puneGand } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { Reason } from '../src/sim/result.ts'
import { Zona } from '../src/sim/zone.ts'
import {
  miscaDispozitia, multiplicatorDeMunca, refuzaMunca, StareRatiune, tintaDispozitiei, unitatiDeMunca, verificaPlecarea,
} from '../src/sim/joburi.ts'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { desemneaza, laSit, lasaItem, panaCand, patratPlat, picteaza, R, ruleaza } from './fixturi.ts'

function reguli(peste: Partial<Rules> = {}): Rules {
  const out = parseRules({ ...R, ...peste })
  assert.ok(out.ok, `reguli de test invalide: ${JSON.stringify(out)}`)
  return out.value
}

// ---------------------------------------------------------------------------
// tinta si bara
// ---------------------------------------------------------------------------

test('un pion se naste la baza, cu optimismul de inceput', () => {
  const { w } = laSit(4001, 2)
  assert.equal(w.agents.dispozitie[0], R.dispozitieBaza, 'bara porneste de la baza, nu de la zero')
  assert.ok(areGand(w.agents, 0, w.tick, Gand.OPTIMISM_INITIAL), 'optimismul de inceput se ACORDA la nastere')
  // Si TINTA il include: in v1 era continut fara scriitor.
  assert.equal(tintaDispozitiei(w, R, 0), R.dispozitieBaza + R.ganduri[Gand.OPTIMISM_INITIAL]!.valoare)
})

test('un slot reutilizat nu mosteneste bara si gandurile mortului', () => {
  const { w } = laSit(4001, 1)
  w.agents.dispozitie[0] = 5
  puneGand(w.agents, 0, w.tick, Gand.DORMIT_PE_JOS, w.tick + 100000)
  const id = w.agents.id[0]!
  assert.ok(applyCommand(w, { kind: 'killAgent', id }, R).ok)
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: w.agents.x[0]!, y: w.agents.y[0]!, z: w.agents.z[0]!, faction: 0 }, R).ok)
  assert.equal(w.agents.count, 1, 'fixtura: slotul chiar s-a reutilizat')
  assert.equal(w.agents.dispozitie[0], R.dispozitieBaza, 'bara mostenita de la mort')
  assert.ok(!areGand(w.agents, 0, w.tick, Gand.DORMIT_PE_JOS), 'gandul mortului a ramas in slot')
})

test('tinta scade cu foamea, si pragurile unei nevoi se EXCLUD', () => {
  const { w } = laSit(4002, 1)
  // Fara optimism, ca sa se vada doar nevoia.
  w.agents.gandFel[0] = 0
  const baza = tintaDispozitiei(w, R, 0)
  assert.equal(baza, R.dispozitieBaza)

  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = R.nevoi[Nevoie.FOAME]!.prag - 1
  assert.equal(tintaDispozitiei(w, R, 0), R.dispozitieBaza + R.ganduri[Gand.FLAMAND]!.valoare)

  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = R.nevoi[Nevoie.FOAME]!.pragCritic - 1
  // NUMAI cel critic, nu amandoua: un pion infometat nu e si flamand pe deasupra.
  assert.equal(tintaDispozitiei(w, R, 0), R.dispozitieBaza + R.ganduri[Gand.INFOMETAT]!.valoare)
})

test('bara urmareste tinta lent, asimetric, si NU o depaseste', () => {
  const { w } = laSit(4003, 1)
  w.agents.gandFel[0] = 0
  w.agents.dispozitie[0] = R.dispozitieBaza
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = R.nevoi[Nevoie.FOAME]!.pragCritic - 1
  const tinta = tintaDispozitiei(w, R, 0)
  assert.ok(tinta < R.dispozitieBaza, 'fixtura: tinta trebuie sa fie sub bara')

  miscaDispozitia(w, R, 0)
  assert.equal(w.agents.dispozitie[0], R.dispozitieBaza - R.dispozitieCoborare, 'coboara cu rata de coborare')

  // Pana la tinta, si NICI UN pas peste ea. Fara limitarea la distanta ramasa,
  // bara oscileaza la infinit in jurul tintei cu ±rata, si marcajul din HUD nu
  // coincide niciodata cu bara desi situatia e stabila.
  for (let i = 0; i < 40; i++) miscaDispozitia(w, R, 0)
  assert.equal(w.agents.dispozitie[0], tinta, 'bara trebuie sa se OPREASCA pe tinta')
  miscaDispozitia(w, R, 0)
  assert.equal(w.agents.dispozitie[0], tinta, 'si sa ramana acolo')

  // Si in sus, cu alta rata.
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = R.nevoieMax
  const jos = w.agents.dispozitie[0]!
  miscaDispozitia(w, R, 0)
  assert.equal(w.agents.dispozitie[0], jos + R.dispozitieUrcare, 'urca cu rata de urcare')
  assert.notEqual(R.dispozitieUrcare, R.dispozitieCoborare, 'ratele trebuie sa fie ASIMETRICE')
})

test('bara NU se misca in somn', () => {
  // Altfel un pion ar putea pleca din asezare exact in timp ce isi rezolva
  // nevoia care il facea nefericit.
  const { w, sit } = laSit(4004, 1)
  const p = patratPlat(w, sit, 2, 4, 20)
  assert.ok(p, 'fixtura: niciun patrat plat')
  picteaza(w, p.x0, p.y0, 2, 3, R, Zona.DORMIT)
  const rules = reguli({ nevoiTicks: 10 })
  w.agents.nevoi[0 * NEVOI + Nevoie.ODIHNA] = 100

  const t = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.DOARME && ww.agents.jobStep[0] === 1, rules)
  assert.notEqual(t, -1, 'fixtura: n-a ajuns sa doarma')
  w.agents.dispozitie[0] = 400
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 10 // tinta ar trebui sa cada tare
  assert.ok(tintaDispozitiei(w, rules, 0) < 400, 'fixtura: tinta trebuie sa fie sub bara')
  miscaDispozitia(w, rules, 0)
  assert.equal(w.agents.dispozitie[0], 400, 'bara n-are voie sa se miste cat doarme')
})

test('un pion care doarme PE JOS primeste gandul, si el expira singur', () => {
  const { w } = laSit(4005, 1)
  const rules = reguli({ nevoiTicks: 10 })
  w.agents.nevoi[0 * NEVOI + Nevoie.ODIHNA] = 100
  const t = panaCand(w, 3000, (ww) => areGand(ww.agents, 0, ww.tick, Gand.DORMIT_PE_JOS), rules)
  assert.notEqual(t, -1, 'somnul pe jos trebuie sa lase un gand')
  assert.equal(w.agents.jobDest[0], 0, 'fixtura: chiar a dormit pe jos, nu in pat')
  // Si e de EVENIMENT: are termen, nu se recalculeaza.
  const panaLa = w.agents.gandPanaLa[0 * w.agents.ganduriSloturi]
  assert.ok(panaLa !== undefined && panaLa > w.tick)
})

// ---------------------------------------------------------------------------
// treapta 1: lucreaza mai incet
// ---------------------------------------------------------------------------

test('productivitatea urmeaza dispozitia, cu PODEAUA PE REZULTAT', () => {
  const { w } = laSit(4010, 1)
  w.agents.dispozitie[0] = R.dispozitieMax
  const sus = unitatiDeMunca(w, R, 0)
  w.agents.dispozitie[0] = 0
  const jos = unitatiDeMunca(w, R, 0)
  assert.ok(sus > jos, `productivitatea nu depinde de dispozitie: ${sus} vs ${jos}`)
  assert.ok(jos >= 1, 'un pion nefericit face mai putin, dar NU zero')

  // Podeaua e pe REZULTAT, nu pe factor. Cu ea pe factor, un continut legal
  // (`workUnitsPerTick: 1`) ar da 0 unitati pe tick: jobul nu s-ar incheia
  // niciodata, tinta ar ramane rezervata, si niciun plafon nu s-ar incrementa.
  //
  // Regulile astea OCOLESC `parseRules` deliberat: invariantul le refuza (si are
  // testul lui separat), dar podeaua trebuie sa lege PE EA INSASI. Cu garda
  // scoasa din amandoua locurile, `floor(1 * 500 / 1000)` da 0 — si un job cu
  // zero unitati pe tick nu se incheie niciodata.
  const minim = { ...R, workUnitsPerTick: 1, multiplicatorMin: 500 } as Rules
  w.agents.dispozitie[0] = 0
  assert.equal(Math.floor((minim.workUnitsPerTick * multiplicatorDeMunca(minim, 0)) / 1000), 0, 'fixtura: fara podea chiar ar iesi zero')
  assert.ok(unitatiDeMunca(w, minim, 0) >= 1, 'podeaua pe REZULTAT trebuie sa dea macar o unitate')
  assert.equal(multiplicatorDeMunca(minim, 0), minim.multiplicatorMin)
  assert.equal(multiplicatorDeMunca(minim, minim.dispozitieMax), minim.multiplicatorMax)
})

test('regulile REFUZA un continut la care un pion nefericit n-ar face nicio unitate', () => {
  // `workUnitsPerTick: 1` e minimul legal din RULES_SPEC, si cu multiplicator
  // 500 ar da floor(1 * 500 / 1000) = 0.
  const rau = parseRules({ ...R, workUnitsPerTick: 1, multiplicatorMin: 500 })
  assert.equal(rau.ok, false)
  if (!rau.ok) {
    assert.equal(rau.reason, Reason.VALOARE_INVALIDA)
    assert.equal(rau.params.camp, 'workUnitsPerTick')
  }
  assert.ok(parseRules({ ...R, workUnitsPerTick: 2, multiplicatorMin: 500 }).ok)
})

test('un pion nefericit sapa mai INCET, masurat pe voxeli', () => {
  function cati(dispozitie: number): number {
    const { w } = laSit(4011, 1)
    const cx = cellOf(w.agents.x[0]!)
    const cy = cellOf(w.agents.y[0]!)
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [0, 3], [-3, 0], [0, -3]] as const) desemneaza(w, cx + dx, cy + dy)
    // Fara nevoi in intervalul testului, ca sa se masoare DOAR productivitatea.
    const rules = reguli({ nevoiTicks: 1000000, dispozitieTicks: 1000000 })
    w.agents.dispozitie[0] = dispozitie
    return ruleaza(w, 3000, rules).joburiTerminate
  }
  const fericit = cati(R.dispozitieMax)
  const nefericit = cati(0)
  assert.ok(fericit > nefericit, `productivitatea nu se vede in joc: ${fericit} vs ${nefericit} voxeli`)
})

// ---------------------------------------------------------------------------
// treapta 2: refuza munca
// ---------------------------------------------------------------------------

test('sub pragul de refuz, pionul nu mai ia joburi — si RATIUNEA spune de ce', () => {
  const { w } = laSit(4020, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) desemneaza(w, cx + dx, cy + dy)
  const rules = reguli({ nevoiTicks: 1000000, dispozitieTicks: 1000000 })
  w.agents.dispozitie[0] = rules.dispozitiePragRefuz - 1
  assert.ok(refuzaMunca(w, rules, 0))

  const t = ruleaza(w, 600, rules)
  assert.equal(t.joburiPornite, 0, 'un pion sub pragul de refuz nu are voie sa ia joburi')
  // `ratiune` se scrie INAINTE de poarta. Fara asta, ratiunea ingheata exact
  // pentru pionul despre care intreaba jucatorul, iar overlay-ul arata toate
  // desemnarile „libere, nimeni nu le-a respins" in timp ce nimeni nu sapa.
  assert.equal(w.ratiune.stare[0], StareRatiune.REFUZA_MUNCA, 'starea trebuie sa spuna ca REFUZA')
  assert.ok(w.ratiune.ultimaScanareTick[0]! > 0, 'si tickul scanarii sa fie proaspat, nu inghetat')

  // Iar peste prag, munceste.
  w.agents.dispozitie[0] = rules.dispozitiePragRefuz
  const t2 = ruleaza(w, 600, rules)
  assert.ok(t2.joburiPornite > 0, 'peste prag trebuie sa lucreze')
})

test('refuzul muncii NU opreste nevoile: un pion nefericit tot mananca', () => {
  // Nevoile OCOLESC sistemul de prioritati (research, ONI). Daca refuzul le-ar
  // opri si pe ele, un pion nefericit ar muri de foame fiindca e nefericit.
  const { w } = laSit(4021, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.HRANA, 75, cx + 2, cy)
  const rules = reguli({ nevoiTicks: 1000000, dispozitieTicks: 1000000 })
  // SUB pragul de refuz, dar PESTE cel de plecare: cu 0 pionul ar pleca in
  // primul tick si n-ar mai fi nimeni care sa manance.
  w.agents.dispozitie[0] = rules.dispozitiePragRefuz - 1
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 100
  assert.ok(refuzaMunca(w, rules, 0), 'fixtura: chiar refuza munca')
  assert.ok(w.agents.dispozitie[0]! > rules.dispozitiePragPlecare, 'fixtura: dar nu asa de jos incat sa plece')

  const t = ruleaza(w, 4000, rules)
  assert.ok(t.unitatiMancate > 0, 'un pion care refuza munca trebuie totusi sa manance')
})

// ---------------------------------------------------------------------------
// treapta 3: pleaca
// ---------------------------------------------------------------------------

test('sub pragul de plecare, pionul PLEACA si nu mai tine nimic', () => {
  const { w, sit } = laSit(4030, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.PIATRA, 40, cx + 2, cy)
  const p = patratPlat(w, sit, 2, 10, 40)
  assert.ok(p, 'fixtura: niciun patrat plat')
  picteaza(w, p.x0, p.y0, 2)
  const rules = reguli({ nevoiTicks: 1000000, dispozitieTicks: 1000000 })

  // Il lasam sa ia un job cu marfa in mana, ca plecarea sa aiba ce elibera.
  // CARE pion il ia nu conteaza si nu se presupune: cu doi in asezare, poate fi
  // oricare, iar o fixtura care fixeaza slotul 0 e o fixtura care se strica
  // singura la prima schimbare de scanare.
  const t = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.CARA || ww.agents.jobKind[1] === FelJob.CARA, rules)
  assert.notEqual(t, -1, 'fixtura: n-a apucat nimeni un job de carat')
  const car = w.agents.jobKind[0] === FelJob.CARA ? 0 : 1
  const altul = 1 - car
  assert.ok(w.rezervari.total > 0, 'fixtura: trebuie sa tina rezervari')
  const marfa = (): number => { let s = 0; for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1) s += w.iteme.cantitate[i]!; return s }
  const marfaInainte = marfa() + w.agents.caraCantitate[car]!

  w.agents.dispozitie[car] = rules.dispozitiePragPlecare - 1
  assert.equal(verificaPlecarea(w, rules, car), true, 'trebuia sa plece')
  assert.equal(w.agents.alive[car], 0, 'si sa nu mai fie in asezare')
  assert.equal(w.plecatiTotal, 1, 'plecarea se NUMARA, si contorul e PERSISTED')
  assert.equal(w.rezervari.total, 0, 'un plecat nu tine rezervari: altfel tinta lui ramane ocupata pe veci')
  assert.equal(marfa(), marfaInainte, 'marfa nu pleaca cu el')
  assert.equal(w.ratiune.itemePierdute, 0)

  // Celalalt pion, fericit, ramane.
  assert.equal(verificaPlecarea(w, rules, altul), false)
  assert.equal(w.agents.alive[altul], 1)
})

test('o asezare FARA mancare isi pierde oamenii; una cu mancare ii pastreaza', () => {
  // Proba ca treapta a treia CHIAR se atinge din joc, nu doar cand scriu eu bara
  // cu mana. Cu valorile dintr-o alta scara ea ar fi fost inaccesibila — exact
  // ce a gasit panoul, si ce s-a re-gasit MASURAND: cu INFOMETAT la -200, o
  // asezare fara pic de mancare se stabiliza la 230 si nu pleca nimeni niciodata.
  function ruleazaAsa(cuMancare: boolean): { plecati: number; vii: number } {
    const { w } = laSit(4031, 4)
    const cx = cellOf(w.agents.x[0]!)
    const cy = cellOf(w.agents.y[0]!)
    // CATA mancare, nu „niste": 4 pioni x 30.000 de tickuri x 6 la 100 = 7.200
    // de foame, adica 480 de unitati la 15 pe unitate — 7 mormane pline. Cu mai
    // putin, ramura „cu mancare" ar masura tot o asezare care ramane fara, si
    // testul ar trece din alt motiv decat cel scris pe el.
    if (cuMancare) for (let m = 0; m < 8; m++) lasaItem(w, Item.HRANA, 75, cx + 2 + (m % 4), cy + 2 + Math.floor(m / 4))
    const rules = reguli({ nevoiTicks: 100, dispozitieTicks: 100 })
    ruleaza(w, 30000, rules)
    let vii = 0
    for (let i = 0; i < w.agents.count; i++) if (w.agents.alive[i] === 1) vii++
    return { plecati: w.plecatiTotal, vii }
  }
  const fara = ruleazaAsa(false)
  assert.ok(fara.plecati > 0, 'o asezare fara mancare trebuie sa-si piarda oamenii')
  assert.equal(fara.vii, 4 - fara.plecati, 'contorul si numarul de vii trebuie sa fie de acord')

  const cu = ruleazaAsa(true)
  assert.equal(cu.plecati, 0, `cu mancare la doi pasi n-are voie sa plece nimeni (au plecat ${cu.plecati})`)
})

// ---------------------------------------------------------------------------
// save / hash / content
// ---------------------------------------------------------------------------

test('dispozitia, gandurile si plecatii intra in hash si supravietuiesc roundtrip-ului', () => {
  const { w } = laSit(4040, 3)
  const h = hashWorld(w)
  w.agents.dispozitie[1] = w.agents.dispozitie[1]! - 1
  assert.notEqual(hashWorld(w), h, 'bara e PERSISTED, deci in hash')
  w.agents.dispozitie[1] = w.agents.dispozitie[1]! + 1
  assert.equal(hashWorld(w), h)
  puneGand(w.agents, 2, w.tick, Gand.DORMIT_PE_JOS, w.tick + 500)
  assert.notEqual(hashWorld(w), h, 'gandurile de eveniment la fel')
  w.plecatiTotal = 3
  const h2 = hashWorld(w)

  const out = decode(encode(w), R)
  assert.ok(out.ok, `incarcare refuzata: ${JSON.stringify(out)}`)
  assert.equal(out.value.plecatiTotal, 3, 'plecatii raman plecati si dupa incarcare')
  assert.ok(areGand(out.value.agents, 2, out.value.tick, Gand.DORMIT_PE_JOS), 'gandul trebuie sa supravietuiasca')
  assert.equal(hashWorld(out.value), h2)
})

test('migrarea 5 -> 6 pune baza din content, nu zero', () => {
  // Un save de schema 5 (nevoi, fara dispozitie). Zero ar incarca fiecare pion
  // sub pragul de PLECARE, si toata asezarea ar pleca in primele tickuri.
  const { w } = laSit(4041, 3)
  const brut = JSON.parse(encode(w)) as { schema: number; data: Record<string, unknown> }
  brut.schema = 5
  const ag = brut.data.agents as Record<string, unknown>
  delete ag.dispozitie
  delete ag.gandFel
  delete ag.gandPanaLa
  delete ag.ganduriSloturi
  delete brut.data.plecatiTotal

  const out = decode(JSON.stringify(brut), R)
  assert.ok(out.ok, `migrarea 5 -> 6 a picat: ${JSON.stringify(out)}`)
  const l = out.value
  assert.equal(l.plecatiTotal, 0)
  for (let i = 0; i < l.agents.count; i++) {
    assert.equal(l.agents.dispozitie[i], R.dispozitieBaza, `pionul ${i} n-a primit baza`)
    assert.ok(l.agents.dispozitie[i]! > R.dispozitiePragPlecare, 'si trebuie sa fie peste pragul de plecare')
  }
  // Idempotenta.
  const iar = decode(encode(l), R)
  assert.ok(iar.ok)
  assert.equal(hashWorld(iar.value), hashWorld(l))
})

test('un save cu MAI MULTE sloturi de gand decat are codul e REFUZAT', () => {
  // Spre deosebire de racirea din `evitaTinta`, unde restul se poate pierde: un
  // gand pierdut MUTA dispozitia, deci n-ar fi o degradare gratioasa.
  const { w } = laSit(4042, 2)
  const brut = JSON.parse(encode(w)) as { data: { agents: Record<string, unknown> } }
  const ag = brut.data.agents
  const k = (ag.ganduriSloturi as number) + 1
  ag.ganduriSloturi = k
  ag.gandFel = new Array<number>((ag.count as number) * k).fill(0)
  ag.gandPanaLa = new Array<number>((ag.count as number) * k).fill(0)
  const out = decode(JSON.stringify(brut), R)
  assert.ok(!out.ok && out.reason === Reason.CAPACITATE_DEPASITA, `trebuia refuzat: ${JSON.stringify(out)}`)
})

test('regulile REFUZA un catalog de ganduri care nu poate atinge pragul de plecare', () => {
  // Invariantul care inchide clasa gasita de panou: valori dintr-o alta scara fac
  // treptele 2 si 3 cod mort din ziua in care se scriu, si totul pare valid.
  const slab = parseRules({
    ...R,
    ganduri: R.ganduri.map((g, i) => (i === Gand.NICIUNUL ? g : { valoare: Math.trunc(g.valoare / 10), durata: g.durata })),
  })
  assert.equal(slab.ok, false, 'un catalog de zece ori mai slab nu poate atinge pragul de plecare')
  if (!slab.ok) {
    assert.equal(slab.reason, Reason.VALOARE_INVALIDA)
    assert.equal(slab.params.camp, 'ganduri')
  }
  assert.ok(parseRules({ ...R }).ok, 'catalogul livrat trebuie sa treaca')
})

test('regulile REFUZA praguri de dispozitie in ordine gresita', () => {
  assert.equal(parseRules({ ...R, dispozitiePragRefuz: R.dispozitiePragAvertisment - 1 }).ok, false)
  assert.equal(parseRules({ ...R, dispozitiePragPlecare: R.dispozitiePragAvertisment }).ok, false)
  assert.equal(parseRules({ ...R, dispozitieBaza: R.dispozitiePragRefuz }).ok, false)
  assert.equal(parseRules({ ...R, multiplicatorMin: 1200 }).ok, false, 'intervalul trebuie sa contina productivitatea normala')
})

test('un gand de STARE cu durata, sau unul de EVENIMENT fara, sunt REFUZATE', () => {
  const stare = parseRules({ ...R, ganduri: R.ganduri.map((g, i) => (i === Gand.FLAMAND ? { ...g, durata: 100 } : g)) })
  assert.equal(stare.ok, false, 'un gand de stare nu se stocheaza, deci durata lui n-are cititor')
  const eveniment = parseRules({ ...R, ganduri: R.ganduri.map((g, i) => (i === Gand.DORMIT_PE_JOS ? { ...g, durata: 0 } : g)) })
  assert.equal(eveniment.ok, false, 'un gand de eveniment fara durata n-ar fi activ niciun tick')
})

test('evictia gandurilor ia termenul cel mai MIC — probata pe un content care o atinge', () => {
  // La `ganduriSloturi = 4` si doua feluri de eveniment, evictia e INACCESIBILA
  // in joc. Se probeaza pe un store cu doua sloturi, altfel garda n-ar lega.
  const { w } = laSit(4050, 1)
  const a = w.agents
  const k = a.ganduriSloturi
  assert.ok(k >= 3, 'fixtura are nevoie de cel putin trei sloturi')
  // Umplem toate sloturile cu termene distincte.
  for (let i = 0; i < k; i++) {
    a.gandFel[i] = Gand.DORMIT_PE_JOS
    a.gandPanaLa[i] = w.tick + 1000 * (i + 1)
  }
  a.gandFel[0] = Gand.OPTIMISM_INITIAL // cel mai mic termen, alt fel
  puneGand(a, 0, w.tick, Gand.FLAMAND, w.tick + 9999)
  assert.equal(a.gandFel[0], Gand.FLAMAND, 'a fost evacuat slotul cu termenul cel mai mic')
  for (let i = 1; i < k; i++) assert.equal(a.gandFel[i], Gand.DORMIT_PE_JOS, `slotul ${i} n-avea voie sa fie atins`)
})

test('acelasi fel de gand isi REINNOIESTE termenul, nu ocupa un al doilea slot', () => {
  const { w } = laSit(4051, 1)
  const a = w.agents
  for (let i = 0; i < a.ganduriSloturi; i++) { a.gandFel[i] = 0; a.gandPanaLa[i] = 0 }
  puneGand(a, 0, w.tick, Gand.DORMIT_PE_JOS, w.tick + 100)
  puneGand(a, 0, w.tick, Gand.DORMIT_PE_JOS, w.tick + 500)
  let cate = 0
  for (let i = 0; i < a.ganduriSloturi; i++) if (a.gandFel[i] === Gand.DORMIT_PE_JOS) cate++
  assert.equal(cate, 1, 'acelasi fel nu are voie sa ocupe doua sloturi')
  assert.equal(a.gandPanaLa[0], w.tick + 500, 'si termenul se prelungeste')
})
