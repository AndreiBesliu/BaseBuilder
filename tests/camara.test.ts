/**
 * Camara (S24-27 t.3, commit-ul C): research/hrana-t3.md §5, §6, §9. Filtrul pe fel al depozitului (`zone.refuzate`, comanda
 * `setFiltruZona`), RANGUL la prioritate egala (verif-J-1, verif-UI-3), felul OBLIGATORIU al lui `prioritateaLocului` si
 * cititorii lui din viewer (verif-P4: `poarta-camara`), `VedereFaraDepozit.primeste` (un adevar pentru inspector si alerta),
 * `FEL_REFUZAT` si `PREA_DEPARTE` (H4 E10), groapa de moloz (verif-J-2), predicatul X al indexului pe o camara filtrata
 * (verif-P3) si acceptanta camarii cu oameni pe o geometrie JUCABILA (§6, J-8, J-11).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { tick } from '../src/sim/world.ts'
import { Faction, Item, ONE_ALTERARE, Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import type { Rules } from '../src/sim/content.ts'
import { DetaliuItem, itemLaCelula } from '../src/sim/iteme.ts'
import { cerereCarat, lastJobReport } from '../src/sim/joburi.ts'
import { rezervaToate, Strat } from '../src/sim/rezervari.ts'
import { codMotiv, Reason } from '../src/sim/result.ts'
import { celulaDeZonaLa, indexZone, marcheazaZoneMurdare, prioritateaLocului, rangZona, slotZona, vedereFaraDepozit, Zona } from '../src/sim/zone.ts'
import type { IndexZone } from '../src/sim/zone.ts'
import { groapaDeMoloz } from '../src/sim/camara.ts'
import { pasAlterare, statAlterare } from '../src/sim/alterare.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { fill, materialAt } from '../src/sim/terrain/terrain.ts'
import { componentaLa } from '../src/sim/camere.ts'
import { sincronizeazaLumea, temperaturaLaEchilibru } from '../src/sim/temperatura.ts'
import { aplicaZona, inspecteazaCelula, locGroapa, rezumatColonie, semnaleAlerte } from '../viewer/ui/model.ts'
import { textMotiv } from '../viewer/ui/texte.ts'
import { itemeInZona, laSit, lasaItem, patratPlat, picteaza, R, ruleaza, sitPlat } from './fixturi.ts'
import { tickLa } from './fixturi-pivnita.ts'

const H = Item.HRANA
const TOATE = 15
/** Camara: primeste doar hrana (masca REFUZATA = toate celelalte feluri). */
const DOAR_HRANA = TOATE & ~(1 << H)
const TPS = R.ticksPerSecond

function bun<T>(o: { ok: boolean; value?: T }, ce: string): T {
  assert.ok(o.ok, `${ce}: ${JSON.stringify(o)}`)
  return o.value as T
}

function filtru(w: World, id: number, refuzate: number): void {
  bun(applyCommand(w, { kind: 'setFiltruZona', id, refuzate }, R), `setFiltruZona ${id}`)
}

/** Cata marfa de felul `fel` sta pe celulele zonei `zonaId`. */
function felInZona(w: World, zonaId: number, fel: number): number {
  const c = w.zone.celule
  let n = 0
  for (let cs = 0; cs < c.count; cs++) {
    if (c.alive[cs] === 0 || c.zonaId[cs] !== zonaId) continue
    const i = itemLaCelula(w.iteme, c.wx[cs]!, c.wy[cs]!, c.z[cs]!)
    if (i !== -1 && w.iteme.kind[i] === fel) n += w.iteme.cantitate[i]!
  }
  return n
}

// ---------------------------------------------------------------------------------------------------------------------
// comanda
// ---------------------------------------------------------------------------------------------------------------------

test('setFiltruZona: refuzurile (zona inexistenta, un dormitor, masca neintreaga, negativa, cu biti in afara felurilor) si efectul (masca scrisa, indexul murdar, racirile „n-are unde" uitate)', () => {
  const { w, sit } = laSit(4242, 1)
  const d = patratPlat(w, sit, 2, 4, 12)!
  const p = patratPlat(w, sit, 2, 14, 30)!
  assert.ok(d && p, 'fixtura: doua patrate plate')
  const dep = picteaza(w, d.x0, d.y0, 2)
  const dorm = picteaza(w, p.x0, p.y0, 2, 3, R, Zona.DORMIT)
  const refuz = (o: ReturnType<typeof applyCommand>, motiv: string, camp: string): void => {
    assert.ok(!o.ok, `trebuia refuzat: ${motiv}`)
    if (o.ok) return
    assert.equal(o.reason, motiv)
    assert.equal(o.params.camp ?? 'id', camp)
  }
  refuz(applyCommand(w, { kind: 'setFiltruZona', id: 999999, refuzate: 1 }, R), Reason.ENTITATE_INEXISTENTA, 'id')
  const oDorm = applyCommand(w, { kind: 'setFiltruZona', id: dorm, refuzate: DOAR_HRANA }, R)
  refuz(oDorm, Reason.VALOARE_INVALIDA, 'id')
  assert.ok(!oDorm.ok && oDorm.params.motiv === 'doar un depozit are filtru')
  // 2^32 (si 2^32 + 7, 2^40 + 8): un test pe BITI (`& ~feluri`) le vede prin int32 ca 0 / 7 / 8, iar Uint8Array ar scrie
  // ultimul octet — 2^32 → 0 = „primeste tot". decode le refuza (0..255), deci si comanda (STARE-1).
  for (const v of [1.5, -1, 16, 255, Number.NaN, 2 ** 32, 2 ** 32 + 7, 2 ** 40 + 8]) refuz(applyCommand(w, { kind: 'setFiltruZona', id: dep, refuzate: v }, R), Reason.VALOARE_INVALIDA, 'refuzate')
  const zs = slotZona(w.zone, dep)
  assert.equal(w.zone.refuzate[zs], 0, 'un refuz nu scrie nimic')
  // Efectul: o piatra cu racire „n-are unde" (scrisa ca de scanare), indexul curat.
  const pid = lasaItem(w, Item.PIATRA, 20, sit.wx + 1, sit.wy + 3)
  const ip = w.iteme.laId.get(pid)!
  w.iteme.reincercaLaTick[ip] = w.tick + 5000
  indexZone(w, R)
  assert.equal(w.zone.index.murdar, false)
  bun(applyCommand(w, { kind: 'setFiltruZona', id: dep, refuzate: DOAR_HRANA }, R), 'filtrul')
  assert.equal(w.zone.refuzate[zs], DOAR_HRANA)
  assert.equal(w.zone.index.murdar, true, 'premisa indexului s-a schimbat')
  assert.equal(w.iteme.reincercaLaTick[ip], 0, 'racirile de marfa se uita, ca la orice comanda de zona')
  assert.equal(rangZona(w.zone, zs), 2 * w.zone.prioritate[zs]! + 1, 'filtrul ingust da rangul +1')
  bun(applyCommand(w, { kind: 'setFiltruZona', id: dep, refuzate: 0 }, R), 'filtrul scos')
  assert.equal(rangZona(w.zone, zs), 2 * w.zone.prioritate[zs]!, 'fara filtru, rangul e prioritatea dublata')
})

// ---------------------------------------------------------------------------------------------------------------------
// poarta-camara (verif-P4): cititorii fara fel, cu indexul la zi si murdar
// ---------------------------------------------------------------------------------------------------------------------

interface ScenaP4 { w: World; inC: number; afara: number; hrana: number; camara: number }

/** verif-P4: camara 3×3 „doar hrana" (prio 4), singurul depozit; o piatra inauntru si una afara, o hrana afara; 3 coloni. */
function scenaP4(): ScenaP4 {
  const { w, sit } = laSit(4242, 3)
  const p1 = patratPlat(w, sit, 3, 4, 12)!
  assert.ok(p1, 'fixtura: patrat plat')
  const camara = bun(applyCommand(w, { kind: 'picteazaZona', x0: p1.x0, y0: p1.y0, x1: p1.x0 + 2, y1: p1.y0 + 2, z: p1.g + 1, prioritate: 4 }, R), 'camara')
  filtru(w, camara, DOAR_HRANA)
  bun(applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: 20, wx: p1.x0 + 1, wy: p1.y0 + 1, z: p1.g + 1 }, R), 'piatra in camara')
  const inC = itemLaCelula(w.iteme, p1.x0 + 1, p1.y0 + 1, p1.g + 1)
  const afara = w.iteme.laId.get(lasaItem(w, Item.PIATRA, 20, sit.wx + 2, sit.wy - 4))!
  const hrana = w.iteme.laId.get(lasaItem(w, H, 20, sit.wx + 3, sit.wy - 4))!
  return { w, inC, afara, hrana, camara }
}
const insp = (w: World, i: number) => inspecteazaCelula(w, R, w.iteme.wx[i]!, w.iteme.wy[i]!, w.iteme.z[i]! - 1, null).morman!.stare

test('poarta-camara: vederea (esteFaraDepozit) — piatra din camara si cea de afara n-au depozit, hrana are; cu indexul la zi si murdar', () => {
  const s = scenaP4()
  for (const stare of ['la zi', 'murdar'] as const) {
    if (stare === 'la zi') indexZone(s.w, R)
    else marcheazaZoneMurdare(s.w)
    const v = vedereFaraDepozit(s.w, R)
    assert.equal(v.primeste, 1 << H, `[${stare}] doar hrana e primita undeva`)
    assert.equal(v.esteFaraDepozit(s.afara), true, `[${stare}] piatra de afara`)
    assert.equal(v.esteFaraDepozit(s.inC), true, `[${stare}] piatra din camara`)
    assert.equal(v.esteFaraDepozit(s.hrana), false, `[${stare}] hrana de afara are camara`)
  }
})

test('poarta-camara: inspectorul — piatra din camara nu e „În depozit.", iar nicio piatra nu cere „Mărește": niciun depozit nu-i primeste felul', () => {
  const s = scenaP4()
  for (const stare of ['la zi', 'murdar'] as const) {
    if (stare === 'la zi') indexZone(s.w, R)
    else marcheazaZoneMurdare(s.w)
    for (const [nume, i] of [['din camara', s.inC], ['de afara', s.afara]] as const) {
      const t = insp(s.w, i)
      assert.notEqual(t.titlu, 'În depozit.', `[${stare}] piatra ${nume}`)
      assert.doesNotMatch(t.actiune, /Mărește/, `[${stare}] piatra ${nume}: ${t.actiune}`)
      assert.match(t.titlu, /Niciun depozit nu primește piatră/, `[${stare}] piatra ${nume}: ${t.titlu}`)
    }
    assert.equal(insp(s.w, s.hrana).titlu, 'Pe jos: așteaptă un cărăuș.', `[${stare}] hrana`)
  }
})

test('poarta-camara: rezumatul nu numara piatra din camara „in depozit"', () => {
  const s = scenaP4()
  for (const stare of ['la zi', 'murdar'] as const) {
    if (stare === 'la zi') indexZone(s.w, R)
    else marcheazaZoneMurdare(s.w)
    const m = rezumatColonie(s.w, R).marfa[Item.PIATRA]!
    assert.deepEqual([m.inDepozit, m.peJos], [0, 40], `[${stare}]`)
  }
})

test('poarta-camara: alerta fara-depozit numeste felul refuzat („n-au niciun depozit care să le primească felul"), nu „Mărește-le"; amestecul le numara separat', () => {
  const s = scenaP4()
  for (const stare of ['la zi', 'murdar'] as const) {
    if (stare === 'la zi') indexZone(s.w, R)
    else marcheazaZoneMurdare(s.w)
    const a = semnaleAlerte(s.w, R, null).get('fara-depozit')!
    assert.ok(a.activ, `[${stare}] alerta aprinsa`)
    assert.doesNotMatch(a.text, /[Mm]ărește|nu încap/, `[${stare}] ${a.text}`)
    assert.match(a.text, /^2 mormane n-au niciun depozit care să le primească felul/, `[${stare}] ${a.text}`)
  }
  // Amestecul: un depozit general care primeste pamantul, plin; pamantul de afara „nu incape", piatra „n-are depozit".
  const { w, sit } = laSit(4242, 3)
  const g = patratPlat(w, sit, 1, 4, 12)!
  const c = patratPlat(w, sit, 2, 14, 30)!
  const gen = picteaza(w, g.x0, g.y0, 1)
  filtru(w, gen, 1 << Item.PIATRA)
  lasaItem(w, Item.PAMANT, 75, g.x0, g.y0)
  filtru(w, picteaza(w, c.x0, c.y0, 2), DOAR_HRANA)
  lasaItem(w, Item.PIATRA, 20, sit.wx + 2, sit.wy - 4)
  lasaItem(w, Item.PAMANT, 30, sit.wx + 3, sit.wy - 4)
  indexZone(w, R)
  const a = semnaleAlerte(w, R, null).get('fara-depozit')!
  assert.ok(a.activ)
  assert.match(a.text, /^2 mormane n-au unde fi duse: unul de un fel pe care nu-l primește niciun depozit, restul nu încap/, a.text)
})

test('poarta-camara: „nimeni-cara" vede pamantul din camara, care trebuie dus in depozitul general', () => {
  const { w, sit } = laSit(4242, 2)
  for (let s = 0; s < w.agents.count; s++) if (w.agents.alive[s] === 1) bun(applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[s]!, categorie: 1, nivel: 0 }, R), 'fara carat')
  const c = patratPlat(w, sit, 3, 4, 12)!
  const g = patratPlat(w, sit, 3, 14, 22)!
  assert.ok(c && g)
  const camara = bun(applyCommand(w, { kind: 'picteazaZona', x0: c.x0, y0: c.y0, x1: c.x0 + 2, y1: c.y0 + 2, z: c.g + 1, prioritate: 4 }, R), 'camara')
  filtru(w, camara, DOAR_HRANA)
  bun(applyCommand(w, { kind: 'picteazaZona', x0: g.x0, y0: g.y0, x1: g.x0 + 2, y1: g.y0 + 2, z: g.g + 1, prioritate: 2 }, R), 'general')
  bun(applyCommand(w, { kind: 'lasaItem', fel: Item.PAMANT, cantitate: 20, wx: c.x0 + 1, wy: c.y0 + 1, z: c.g + 1 }, R), 'pamant in camara')
  indexZone(w, R)
  assert.equal(semnaleAlerte(w, R, null).get('nimeni-cara')!.activ, true)
})

test('indexZone: FEL_REFUZAT pe un fel pe care niciun depozit nu-l primeste; DEPOZITE_PLINE doar cand vreunul il primeste; NICIO_ZONA fara depozit', () => {
  const s = scenaP4()
  indexZone(s.w, R)
  const it = s.w.iteme
  for (const i of [s.inC, s.afara]) {
    assert.equal(it.ultimulMotiv[i], codMotiv(Reason.FARA_DEPOZIT))
    assert.equal(it.ultimulMotivDetaliu[i], DetaliuItem.FEL_REFUZAT)
  }
  assert.ok(s.w.zone.index.deMutat.includes(s.hrana), 'hrana are unde')
  // Un depozit general care primeste piatra, dar plin: „pline".
  const { w, sit } = laSit(4242, 1)
  const g = patratPlat(w, sit, 1, 4, 12)!
  picteaza(w, g.x0, g.y0, 1)
  lasaItem(w, Item.PIATRA, 75, g.x0, g.y0)
  const p = w.iteme.laId.get(lasaItem(w, Item.PIATRA, 20, sit.wx + 2, sit.wy - 4))!
  indexZone(w, R)
  assert.equal(w.iteme.ultimulMotivDetaliu[p], DetaliuItem.DEPOZITE_PLINE)
  // Textele celor doua cauze noi, pe enumul mormanului.
  assert.match(textMotiv('morman', Reason.FARA_DEPOZIT, DetaliuItem.FEL_REFUZAT, undefined, undefined, Item.PAMANT).titlu, /Niciun depozit nu primește pământ/)
  assert.match(textMotiv('morman', Reason.FARA_DEPOZIT, DetaliuItem.FEL_REFUZAT).actiune, /filtrul/)
})

// ---------------------------------------------------------------------------------------------------------------------
// rangul la egalitate (verif-J-1, verif-UI-3)
// ---------------------------------------------------------------------------------------------------------------------

interface ScenaRang { w: World; general: number; camara: number }

/** Depozitul general 3×3 pictat INTAI (cu 4×75 de hrana si 2×20 de piatra pe el), camara 3×3 pictata DUPA, 4 pioni. */
function scenaRang(seed: number, prioGeneral: number, prioCamara: number, cuFiltru: boolean): ScenaRang {
  const { w, sit } = laSit(seed, 4)
  const g = patratPlat(w, sit, 3, 4, 12)!
  const c = patratPlat(w, sit, 3, 14, 30)!
  assert.ok(g && c, 'fixtura: doua patrate plate')
  const general = picteaza(w, g.x0, g.y0, 3, prioGeneral)
  for (let k = 0; k < 4; k++) lasaItem(w, H, 75, g.x0 + (k % 3), g.y0 + Math.floor(k / 3))
  for (let k = 0; k < 2; k++) lasaItem(w, Item.PIATRA, 20, g.x0 + 1 + k, g.y0 + 2)
  const camara = picteaza(w, c.x0, c.y0, 3, prioCamara)
  if (cuFiltru) filtru(w, camara, DOAR_HRANA)
  return { w, general, camara }
}

test('rangul: ordinea depozitelor si deMutat — la prioritate egala camara (filtru ingust) e inaintea depozitului general, deci hrana din el are unde; prioritatea jucatorului ramane prima regula', () => {
  {
    const s = scenaRang(31, 3, 3, true)
    const ix = indexZone(s.w, R)
    const zg = slotZona(s.w.zone, s.general), zc = slotZona(s.w.zone, s.camara)
    assert.deepEqual([rangZona(s.w.zone, zg), rangZona(s.w.zone, zc)], [6, 7])
    assert.deepEqual(ix.depoziteOrdonate, [zc, zg], 'camara pictata dupa, dar inaintea lui')
    assert.equal(ix.maxRangLibera[H], 7)
    assert.equal(ix.maxPrioLibera[H], 3, 'castigul jobului ramane pe prioritate')
    const it = s.w.iteme
    let hranaDeMutat = 0, piatraDeMutat = 0
    for (const i of ix.deMutat) { if (it.kind[i] === H) hranaDeMutat++; else if (it.kind[i] === Item.PIATRA) piatraDeMutat++ }
    assert.deepEqual([hranaDeMutat, piatraDeMutat], [4, 0])
    // Locul hranei din general, pe fel: rangul generalului; al pietrei, la fel; piatra in camara ar fi 0.
    const ig = it.laCelula.values().next().value as number
    assert.equal(prioritateaLocului(s.w.zone, it.wx[ig]!, it.wy[ig]!, it.z[ig]!, it.kind[ig]!), 6)
  }
  {
    // Fara filtru, aceeasi prioritate: id-ul decide (generalul), hrana nu pleaca — „strict mai bun" de azi.
    const s = scenaRang(31, 3, 3, false)
    const ix = indexZone(s.w, R)
    assert.deepEqual(ix.depoziteOrdonate, [slotZona(s.w.zone, s.general), slotZona(s.w.zone, s.camara)])
    assert.equal(ix.deMutat.length, 0)
  }
  {
    // Generalul la 4, camara la 3: rangul 8 bate 7 — hrana ramane in general.
    const s = scenaRang(31, 4, 3, true)
    const ix = indexZone(s.w, R)
    assert.deepEqual(ix.depoziteOrdonate, [slotZona(s.w.zone, s.general), slotZona(s.w.zone, s.camara)])
    assert.equal(ix.deMutat.length, 0)
  }
})

test('rangul la egalitate cu pioni: camara pictata DUPA depozitul general, la aceeasi prioritate, ia hrana si din el; piatra ramane in general; fara filtru, 0 u — 3 seminte', () => {
  for (const seed of [31, 77, 4242]) {
    const s = scenaRang(seed, 3, 3, true)
    // Masurat: toata hrana in camara la 250–350 de tickuri; primul mancat la ≥ 2.250 (cele 1.500 nu-l ating, dar se numara).
    const t = ruleaza(s.w, 1500)
    assert.equal(felInZona(s.w, s.general, H), 0, `seed ${seed}: generalul s-a golit de hrana`)
    assert.equal(felInZona(s.w, s.camara, H), 300 - t.unitatiMancate - s.w.hranaStricata, `seed ${seed}: toata hrana ramasa e in camara`)
    assert.ok(felInZona(s.w, s.camara, H) >= 290, `seed ${seed}: ${felInZona(s.w, s.camara, H)} u in camara`)
    assert.equal(felInZona(s.w, s.general, Item.PIATRA), 40, `seed ${seed}: piatra ramane (camara o refuza)`)
    const martor = scenaRang(seed, 3, 3, false)
    ruleaza(martor.w, 1500)
    assert.equal(felInZona(martor.w, martor.camara, H), 0, `seed ${seed}: martorul fara filtru`)
  }
})

test('rangul si filtrul dupa decode (M5): scena camarii, salvata in timp ce hrana se muta — 150 + 1000 == 1150', () => {
  const s = scenaRang(77, 3, 3, true)
  ruleaza(s.w, 150)
  assert.ok(felInZona(s.w, s.camara, H) > 0 && felInZona(s.w, s.general, H) > 0, 'fixtura: salvat la mijlocul mutarii')
  const out = decode(encode(s.w), R)
  assert.ok(out.ok, JSON.stringify(out))
  if (!out.ok) return
  ruleaza(s.w, 1000)
  ruleaza(out.value, 1000)
  assert.equal(hashWorld(out.value), hashWorld(s.w))
})

// ---------------------------------------------------------------------------------------------------------------------
// PREA_DEPARTE (H4 E10)
// ---------------------------------------------------------------------------------------------------------------------

test('PREA_DEPARTE: singurul depozit cu loc e dincolo de raza destinatiei — cauza pe morman nu mai e „pline"; cu raza implicita, mormanul se cara', () => {
  const RR: Rules = { ...R, haulDestRadiusCells: 12 }
  const scena = (rules: Rules) => {
    const { w, sit } = laSit(5150, 1, [], rules)
    const d = patratPlat(w, sit, 2, 20, 40)!
    assert.ok(d, 'fixtura: patrat plat departe')
    const dep = picteaza(w, d.x0, d.y0, 2, 3, rules)
    const id = lasaItem(w, Item.PIATRA, 20, sit.wx + 1, sit.wy, rules)
    return { w, dep, id }
  }
  const s = scena(RR)
  ruleaza(s.w, 300, RR)
  const i = s.w.iteme.laId.get(s.id)!
  assert.equal(s.w.iteme.ultimulMotiv[i], codMotiv(Reason.FARA_DEPOZIT))
  assert.equal(s.w.iteme.ultimulMotivDetaliu[i], DetaliuItem.PREA_DEPARTE)
  const t = insp(s.w, i)
  assert.match(t.titlu, /prea departe/, t.titlu)
  assert.match(t.actiune, /mai aproape/)
  // Martorul: raza implicita, acelasi loc — se cara.
  const m = scena(R)
  ruleaza(m.w, 3000)
  assert.equal(itemeInZona(m.w, m.dep).cantitate, 20)
})

// ---------------------------------------------------------------------------------------------------------------------
// groapa de moloz (verif-J-2)
// ---------------------------------------------------------------------------------------------------------------------

test('groapaDeMoloz pe hartie: felurile refuzate prezente, unitatile nepromise, locul din celelalte depozite, lipsa si marimea propusa', () => {
  const { w, sit } = laSit(4242, 1)
  const c = patratPlat(w, sit, 4, 4, 12)!
  const g = patratPlat(w, sit, 2, 14, 30)!
  assert.ok(c && g)
  const camara = picteaza(w, c.x0, c.y0, 4)
  filtru(w, camara, DOAR_HRANA)
  const general = picteaza(w, g.x0, g.y0, 2)
  for (let k = 0; k < 4; k++) lasaItem(w, H, 75, g.x0 + (k % 2), g.y0 + (k >> 1))
  // Pe camara: 4×75 + 40 de piatra, 60 de pamant, 50 de hrana (primita, nu se numara).
  for (let k = 0; k < 4; k++) lasaItem(w, Item.PIATRA, 75, c.x0 + k, c.y0)
  const p40 = lasaItem(w, Item.PIATRA, 40, c.x0, c.y0 + 1)
  lasaItem(w, Item.PAMANT, 60, c.x0 + 1, c.y0 + 1)
  lasaItem(w, H, 50, c.x0 + 2, c.y0 + 1)
  const r = groapaDeMoloz(w, R, camara)!
  assert.ok(r)
  assert.equal(r.feluri, (1 << Item.PIATRA) | (1 << Item.PAMANT))
  assert.deepEqual([...r.unitatiPeFel], [340, 60, 0, 0])
  assert.deepEqual([r.unitati, r.celuleOcupate, r.loc, r.lipsa, r.lipsaCelule], [400, 6, 0, 400, 6])
  // ⌈400/75⌉ = 6, + 4 de margine = 10 celule; latura 4 (9 < 10 ≤ 16); filtrul gropii primeste doar piatra si pamant.
  assert.deepEqual([r.propusa, r.latura, r.refuzate], [6 + R.groapaMargineCelule, 4, TOATE & ~r.feluri])
  // Ce e deja promis unui caraus nu mai cere loc.
  bun(rezervaToate(w.rezervari, 424242, 434343, [cerereCarat(R, p40, 30)]), 'rezervarea')
  assert.equal(groapaDeMoloz(w, R, camara)!.unitati, 370)
  // Locul. O alta camara „doar hrana" nu e loc de moloz.
  const g2 = patratPlat(w, sit, 3, 32, 60)!
  const g3 = patratPlat(w, sit, 2, 62, 90)!
  const g4 = patratPlat(w, sit, 1, 92, 120)!
  const g5 = patratPlat(w, sit, 1, 122, 150)!
  assert.ok(g2 && g3 && g4 && g5)
  filtru(w, picteaza(w, g3.x0, g3.y0, 2), DOAR_HRANA)
  assert.equal(groapaDeMoloz(w, R, camara)!.loc, 0, 'o alta camara nu e loc de moloz')
  // O celula goala care primeste tot: 75 de loc, deci lipsa scade — dar groapa se dimensioneaza tot pe TOT molozul
  // (⌈370/75⌉ = 5, + 4), fiindca celulele goale sunt comune si hranei.
  picteaza(w, g4.x0, g4.y0, 1)
  const r1 = groapaDeMoloz(w, R, camara)!
  assert.deepEqual([r1.loc, r1.lipsa, r1.lipsaCelule, r1.propusa, r1.latura], [75, 295, 4, 5 + R.groapaMargineCelule, 3])
  // Aceeasi celula, promisa ca destinatie altui caraus (LUCRU): nu mai e loc — aceeasi regula ca indexul.
  const cs4 = celulaDeZonaLa(w.zone, g4.x0, g4.y0, g4.g + 1)
  bun(rezervaToate(w.rezervari, 525252, 535353, [{ targetId: w.zone.celule.id[cs4]!, layer: Strat.LUCRU, count: 50, maxCount: R.itemStackMax, maxClaimants: 1 }]), 'rezervarea destinatiei')
  assert.equal(groapaDeMoloz(w, R, camara)!.loc, 0, 'o celula promisa nu e loc')
  // O celula de sub un santier viu (un perete desemnat pe ea) nu e loc: marfa de acolo ar opri zidirea (USA-5).
  picteaza(w, g5.x0, g5.y0, 1)
  assert.equal(groapaDeMoloz(w, R, camara)!.loc, 75)
  bun(applyCommand(w, { kind: 'desemneaza', wx: g5.x0, wy: g5.y0, z: g5.g + 1, piesa: Piesa.PERETE }, R), 'santierul')
  assert.equal(groapaDeMoloz(w, R, camara)!.loc, 0, 'o celula sub santier nu e loc')
  // Un depozit care primeste tot, cu 8 celule goale si una cu 30 de pamant: 8·75 + 45 acopera molozul.
  picteaza(w, g2.x0, g2.y0, 3)
  lasaItem(w, Item.PAMANT, 30, g2.x0, g2.y0)
  const r2 = groapaDeMoloz(w, R, camara)!
  assert.deepEqual([r2.loc, r2.lipsa, r2.propusa, r2.latura], [8 * 75 + 45, 0, 0, 0])
  void general
  // Nu e o zona de depozit: null.
  assert.equal(groapaDeMoloz(w, R, 999999), null)
})

/** Camara 3×3 „doar hrana" cu moloz (3×75 de piatra + 2×40 de pamant), niciun alt depozit, 6×75 de hrana afara, 4 pioni. */
function scenaMoloz(seed: number): { w: World; camara: number; gx: number; gy: number } {
  const { w, sit } = laSit(seed, 4)
  const c = patratPlat(w, sit, 3, 4, 12)!
  const gr = patratPlat(w, sit, 3, 14, 30)!
  assert.ok(c && gr)
  const camara = picteaza(w, c.x0, c.y0, 3)
  filtru(w, camara, DOAR_HRANA)
  for (let k = 0; k < 3; k++) lasaItem(w, Item.PIATRA, 75, c.x0 + k, c.y0)
  for (let k = 0; k < 2; k++) lasaItem(w, Item.PAMANT, 40, c.x0 + k, c.y0 + 1)
  for (let k = 0; k < 6; k++) lasaItem(w, H, 75, sit.wx + (k % 3), sit.wy - 3 - Math.floor(k / 3))
  return { w, camara, gx: gr.x0, gy: gr.y0 }
}

test('groapaDeMoloz cu pioni: groapa PROPUSA (marime si filtru din functie), pictata odata cu camara, scoate molozul din camara si face loc hranei; fara ea, molozul ramane', () => {
  for (const seed of [31, 77]) {
    const s = scenaMoloz(seed)
    const r = groapaDeMoloz(s.w, R, s.camara)!
    assert.deepEqual([r.unitati, r.loc, r.lipsa, r.propusa, r.latura], [305, 0, 305, 5 + R.groapaMargineCelule, 3], `seed ${seed}`)
    const groapa = picteaza(s.w, s.gx, s.gy, r.latura)
    filtru(s.w, groapa, r.refuzate)
    const t = ruleaza(s.w, 5000)
    const moloz = felInZona(s.w, s.camara, Item.PIATRA) + felInZona(s.w, s.camara, Item.PAMANT)
    assert.equal(moloz, 0, `seed ${seed}: molozul a iesit din camara`)
    assert.equal(felInZona(s.w, groapa, Item.PIATRA) + felInZona(s.w, groapa, Item.PAMANT), 305, `seed ${seed}: tot in groapa`)
    assert.equal(felInZona(s.w, groapa, H), 0, `seed ${seed}: groapa nu primeste hrana`)
    assert.equal(felInZona(s.w, s.camara, H), 450 - t.unitatiMancate - s.w.hranaStricata, `seed ${seed}: toata hrana ramasa e in camara`)
    assert.ok(felInZona(s.w, s.camara, H) > 4 * 75, `seed ${seed}: mai mult decat ar fi incaput langa moloz`)
    assert.equal(groapaDeMoloz(s.w, R, s.camara)!.propusa, 0, `seed ${seed}: nimic de propus dupa`)
    // Martorul: fara groapa, molozul ramane si hrana nu incape toata.
    const m = scenaMoloz(seed)
    ruleaza(m.w, 5000)
    assert.equal(felInZona(m.w, m.camara, Item.PIATRA) + felInZona(m.w, m.camara, Item.PAMANT), 305, `seed ${seed}: martorul`)
    assert.ok(felInZona(m.w, m.camara, H) <= 4 * 75, `seed ${seed}: martorul are 4 celule pentru hrana`)
  }
})

// ---------------------------------------------------------------------------------------------------------------------
// indexul de zone pe o camara filtrata: predicatul X (verif-P3), in ambele sensuri
// ---------------------------------------------------------------------------------------------------------------------

interface Inst {
  libere: number[][]; acceptante: Int32Array; maxLocLiber: Int32Array; maxPrioLibera: Int32Array; maxRangLibera: Int32Array
  depoziteOrdonate: number[]; deMutat: number[]; comestibile: number[]; peJosFaraDepozit: number
}
function inst(ix: IndexZone): Inst {
  return {
    libere: ix.libere.map((l) => (l ? l.slice() : [])), acceptante: ix.acceptante.slice(), maxLocLiber: ix.maxLocLiber.slice(),
    maxPrioLibera: ix.maxPrioLibera.slice(), maxRangLibera: ix.maxRangLibera.slice(), depoziteOrdonate: ix.depoziteOrdonate.slice(),
    deMutat: ix.deMutat.slice(), comestibile: ix.comestibile.slice(), peJosFaraDepozit: ix.peJosFaraDepozit,
  }
}
const eg = (x: ArrayLike<number>, y: ArrayLike<number>) => x.length === y.length && Array.prototype.every.call(x, (v: number, i: number) => v === y[i])
function aceleasi(a: Inst, b: Inst): boolean {
  if (a.libere.length !== b.libere.length || a.libere.some((l, i) => !eg(l, b.libere[i]!))) return false
  return eg(a.acceptante, b.acceptante) && eg(a.maxLocLiber, b.maxLocLiber) && eg(a.maxPrioLibera, b.maxPrioLibera) && eg(a.maxRangLibera, b.maxRangLibera)
    && eg(a.depoziteOrdonate, b.depoziteOrdonate) && eg(a.deMutat, b.deMutat) && eg(a.comestibile, b.comestibile) && a.peJosFaraDepozit === b.peJosFaraDepozit
}

/** Un generator determinist pentru S-urile scrise de test. */
function lcg(seed: number): () => number {
  let x = seed >>> 0
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x / 4294967296
  }
}

/**
 * Scena E' (verif-P3, cu filtrul): camara 6×6 „doar hrana" PLINA de hrana desincronizata, la ACEEASI prioritate cu un depozit
 * general 14×14 cu hrana si piatra (rangul decide), un depozit „fara hrana" 6×6 cu hrana ramasa in el (pline si partiale) si
 * 40 de mormane pe jos. Fara pioni: nicio rezervare, niciun santier — deci predicatul trebuie sa fie exact in ambele sensuri.
 */
function scenaFiltrata(seed: number): World {
  const { w, wx, wy, g } = sitPlat(7, 36)
  const z = g + 1
  const r = lcg(seed)
  const pune = (fel: number, q: number, x: number, y: number): void => {
    bun(applyCommand(w, { kind: 'lasaItem', fel, cantitate: q, wx: x, wy: y, z }, R), 'lasaItem')
    const i = itemLaCelula(w.iteme, x, y, z)
    if (fel === H) w.iteme.alterare[i] = Math.min(Math.floor(r() * ONE_ALTERARE), w.iteme.cantitate[i]! * (ONE_ALTERARE - 1))
  }
  const camara = bun(applyCommand(w, { kind: 'picteazaZona', x0: wx, y0: wy, x1: wx + 5, y1: wy + 5, z }, R), 'camara')
  const general = bun(applyCommand(w, { kind: 'picteazaZona', x0: wx + 8, y0: wy, x1: wx + 21, y1: wy + 13, z }, R), 'general')
  const faraHrana = bun(applyCommand(w, { kind: 'picteazaZona', x0: wx + 24, y0: wy, x1: wx + 29, y1: wy + 5, z }, R), 'fara hrana')
  void general
  for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 6; dx++) pune(H, 75, wx + dx, wy + dy)
  for (let dy = 0; dy < 14; dy++) for (let dx = 0; dx < 14; dx++) {
    const u = Math.floor(r() * 4)
    if (u === 0) continue
    pune(u === 1 ? Item.PIATRA : H, 1 + Math.floor(r() * 75), wx + 8 + dx, wy + dy)
  }
  for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 6; dx++) if (r() < 0.8) pune(H, r() < 0.5 ? 75 : 1 + Math.floor(r() * 74), wx + 24 + dx, wy + dy)
  for (let k = 0; k < 40; k++) pune(k % 3 === 0 ? Item.PIATRA : H, 1 + Math.floor(r() * 75), wx + (k % 20), wy + 20 + Math.floor(k / 20) * 2)
  filtru(w, camara, DOAR_HRANA)
  filtru(w, faraHrana, 1 << H)
  return w
}

test('indexul de zone pe o camara filtrata (predicatul X): dupa fiecare pas de alterare, indexul pastrat == refacut; si nicio murdarire fara schimbare (fara moarte) — vara 15:00 si toamna 12:00, 400 de pasi', () => {
  let curate = 0, murdarite = 0, invechite = 0, degeaba = 0, stricate = 0
  for (const tk of [tickLa(0, 1, 2, 15), tickLa(0, 2, 2, 12)]) {
    for (const seed of [77, 5]) {
      const w = scenaFiltrata(seed)
      const ix = w.zone.index
      const h0 = w.hranaStricata
      w.tick = tk
      indexZone(w, R)
      for (let k = 0; k < 400; k++) {
        const inainte = inst(ix)
        const morti = statAlterare(w).morti
        pasAlterare(w, R)
        w.tick += TPS
        if (ix.murdar) {
          murdarite++
          indexZone(w, R)
          if (statAlterare(w).morti === morti && aceleasi(inainte, inst(ix))) degeaba++
        } else {
          curate++
          const pastrat = inst(ix)
          ix.murdar = true
          indexZone(w, R)
          if (!aceleasi(pastrat, inst(ix))) invechite++
        }
      }
      stricate += w.hranaStricata - h0
    }
  }
  assert.equal(invechite, 0, `${invechite} pasi cu indexul invechit`)
  assert.equal(degeaba, 0, `${degeaba} murdariri fara nicio schimbare in index`)
  // Contoarele de viata: s-a stricat hrana, iar indexul s-a si murdarit si a si ramas curat.
  assert.ok(stricate > 1000 && murdarite > 20 && curate > 500, `stricate ${stricate}, murdarite ${murdarite}, curate ${curate}`)
})

// ---------------------------------------------------------------------------------------------------------------------
// acceptanta camarii cu oameni (§6, J-8, J-11): geometria JUCABILA (H4: casa cu chepeng langa perete)
// ---------------------------------------------------------------------------------------------------------------------

interface Acceptanta {
  gataSapat: number; redesemnate: number; molozLaPictare: number; propusa: number; molozGata: number
  maxCamara: number; pusa: number; stricat: number; mancat: number; mancatCamara: number; plecati: number; plecatiCuHrana: number
  /** Unde a pus-o butonul, fata de coltul casei si de sol (null = nicio groapa); si molozul (piatra + pamant) din ea la final. */
  groapa: { dx: number; dy: number; dz: number } | null; molozInGroapa: number
}

/**
 * Casa de piatra 7×7 (interior 5×5×2, usa pe sud, acoperis la g+3), pe un sit plat; 4 pioni afara; 600 u de hrana pe jos;
 * depozitul general 3×3 pictat INTAI („Primii pasi"); pivnita 3×3×2 sub casa + putul chepengului DESEMNATE (pionii sapa;
 * molozul unei prabusiri se re-desemneaza la 100 de tickuri). Cand sapatul e gata: chepengul (doua usi in podea), paturile in
 * casa, camara la prioritatea IMPLICITA cu filtrul „doar hrana", si — daca `groapaDeMoloz` propune si `groapa` e 'buton' —
 * groapa PE CALEA BUTONULUI (`picteazaGroapa` din panouri.ts: `locGroapa`, apoi `aplicaZona` cu filtrul propus). Apoi colonia
 * traieste 3,5 zile. `generalPlin`: depozitul general primeste 9 × 75 de piatra imediat dupa pictura — molozul n-are loc in
 * el, deci doar groapa il poate scoate din camara (JOC-2: cu generalul gol, hrana plecata spre camara ii facea loc, iar
 * groapa nu era necesara).
 */
function camaraCuOameni(seed: number, anotimp: number, cuFiltru = true, groapa: 'buton' | 'fara' = 'buton', generalPlin = false): Acceptanta {
  const P = Material.PIATRA_CONSTRUITA
  const { w, wx, wy, g } = sitPlat(seed, 30)
  const tk0 = tickLa(0, anotimp, 1, 8)
  w.tick = tk0
  const hx = wx + 12, hy = wy + 12
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
    if (dx !== 0 && dx !== 6 && dy !== 0 && dy !== 6) continue
    bun(fill(w.terrain, hx + dx, hy + dy, z, dx === 3 && dy === 0 ? Material.USA : P), 'perete')
  }
  for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) bun(fill(w.terrain, hx + dx, hy + dy, g + 3, P), 'acoperis')
  bun(sincronizeazaLumea(w, R), 'sincronizarea')
  bun(temperaturaLaEchilibru(w, R, tk0), 'echilibrul')
  for (let i = 0; i < 4; i++) bun(applyCommand(w, { kind: 'spawnAgent', x: (hx - 2 + i) * 1000 + 500, y: (hy - 4) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R), 'pion')
  const pusa = 600
  for (let i = 0; i < 8; i++) bun(applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 75, wx: hx - 8 + (i % 4), wy: hy + (i >> 2), z: g + 1 }, R), 'hrana')
  bun(applyCommand(w, { kind: 'picteazaZona', x0: hx - 14, y0: hy, x1: hx - 12, y1: hy + 2, z: g + 1 }, R), 'depozitul general')
  if (generalPlin) for (let k = 0; k < 9; k++) bun(applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: 75, wx: hx - 14 + (k % 3), wy: hy + Math.floor(k / 3), z: g + 1 }, R), 'piatra in general')
  const sapa: [number, number, number][] = [[hx + 5, hy + 2, g], [hx + 4, hy + 2, g], [hx + 4, hy + 2, g - 1]]
  for (const z of [g - 1, g - 2]) for (let dx = 2; dx <= 4; dx++) for (let dy = 3; dy <= 5; dy++) sapa.push([hx + dx, hy + dy, z])
  for (const [x, y, z] of sapa) bun(applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z }, R), 'desemnarea')
  const inCamara = (i: number): boolean => w.iteme.z[i] === g - 2 && w.iteme.wx[i]! >= hx + 2 && w.iteme.wx[i]! <= hx + 4 && w.iteme.wy[i]! >= hy + 3 && w.iteme.wy[i]! <= hy + 5
  const o: Acceptanta = { gataSapat: -1, redesemnate: 0, molozLaPictare: 0, propusa: 0, molozGata: -1, maxCamara: 0, pusa, stricat: 0, mancat: 0, mancatCamara: 0, plecati: 0, plecatiCuHrana: 0, groapa: null, molozInGroapa: 0 }
  let camara = -1
  let groapaId = -1
  const inainte = new Map<number, number>()
  const ZI = R.calendar.ziTicks
  while (w.tick < tk0 + 3.5 * ZI) {
    tick(w, R)
    const rep = lastJobReport()
    o.mancat += rep.unitatiMancate
    let inC = 0, moloz = 0
    const acum = new Map<number, number>()
    for (let i = 0; i < w.iteme.count; i++) {
      if (w.iteme.alive[i] !== 1 || !inCamara(i)) continue
      if (w.iteme.kind[i] === H) { inC += w.iteme.cantitate[i]!; acum.set(w.iteme.id[i]!, w.iteme.cantitate[i]!) } else moloz += w.iteme.cantitate[i]!
    }
    // Mancat DIN camara: scaderile mormanelor ei intr-un tick cu mancat (sub 5 °C nu se strica, iar filtrul nu le cara afara).
    if (rep.unitatiMancate > 0) for (const [id, q] of inainte) { const n = acum.get(id) ?? 0; if (n < q) o.mancatCamara += Math.min(q - n, rep.unitatiMancate) }
    inainte.clear()
    for (const [id, q] of acum) inainte.set(id, q)
    if (inC > o.maxCamara) o.maxCamara = inC
    if (rep.plecati > 0) { o.plecati += rep.plecati; if (inC > 0) o.plecatiCuHrana += rep.plecati }
    if (camara !== -1 && o.molozGata < 0 && moloz === 0) o.molozGata = w.tick - o.gataSapat
    if (o.gataSapat < 0 && w.tick % 100 === 0) {
      // Jucatorul re-desemneaza molozul unei prabusiri (J-11): altfel „sapatul gata" n-ar veni niciodata.
      for (const [x, y, z] of sapa) { const m = materialAt(w.terrain, x, y, z); if (m.ok && m.value === Material.MOLOZ && applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z }, R).ok) o.redesemnate++ }
      if (sapa.every(([x, y, z]) => { const m = materialAt(w.terrain, x, y, z); return m.ok && m.value === Material.AER })) {
        o.gataSapat = w.tick
        for (const [x, y] of [[hx + 5, hy + 2], [hx + 4, hy + 2]] as const) bun(applyCommand(w, { kind: 'fill', wx: x, wy: y, z: g, material: Material.USA }, R), 'chepengul')
        bun(applyCommand(w, { kind: 'picteazaZona', x0: hx + 1, y0: hy + 3, x1: hx + 2, y1: hy + 5, z: g + 1, fel: Zona.DORMIT }, R), 'paturile')
        camara = bun(applyCommand(w, { kind: 'picteazaZona', x0: hx + 2, y0: hy + 3, x1: hx + 4, y1: hy + 5, z: g - 2 }, R), 'camara')
        if (cuFiltru) filtru(w, camara, DOAR_HRANA)
        o.molozLaPictare = moloz
        const p = groapaDeMoloz(w, R, camara)!
        o.propusa = p.propusa
        if (p.propusa > 0 && groapa === 'buton') {
          // Ce face butonul: locul din `locGroapa`, pictura si filtrul in acelasi pas (`aplicaZona`) — nu o coordonata aleasa
          // de test (pe sol liber, langa casa), care ocolea tocmai alegerea locului (JOC-1: acoperisul casei).
          const loc = locGroapa(w, R, camara, p.latura)
          assert.ok(loc, `seed ${seed}: locGroapa n-a gasit loc`)
          o.groapa = { dx: loc.x0 - hx, dy: loc.y0 - hy, dz: loc.z - g }
          const r = aplicaZona((c) => applyCommand(w, c, R), [{ x0: loc.x0, y0: loc.y0, x1: loc.x0 + p.latura - 1, y1: loc.y0 + p.latura - 1, z: loc.z }], Zona.DEPOZIT, p.refuzate)
          assert.ok(r.zonaId !== null && r.refuzuri.length === 0, `seed ${seed}: groapa refuzata ${JSON.stringify(r.refuzuri)}`)
          groapaId = r.zonaId
        }
        const cp = componentaLa(w.camere, hx + 3, hy + 4, g - 2)
        const cc = componentaLa(w.camere, hx + 3, hy + 3, g + 1)
        assert.ok(cp && cc && cp.id !== cc.id, 'fixtura: pivnita e o incapere, despartita de casa prin chepeng')
      }
    }
  }
  o.stricat = w.hranaStricata
  if (groapaId !== -1) o.molozInGroapa = felInZona(w, groapaId, Item.PIATRA) + felInZona(w, groapaId, Item.PAMANT)
  return o
}

// Groapa de aici iese din buton, dar testul NU o probeaza: cu generalul gol, hrana plecata spre camara face loc molozului in
// general (JOC-2: trecea identic si fara groapa). Groapa o probeaza „acceptanta gropii de moloz", cu generalul plin.
test('acceptanta camarii cu oameni: 4 pioni locuiesc in casa, sapa pivnita, camara „doar hrana" la prioritatea implicita (dupa depozitul general); mananca din camara; „plecati cu hrana in camara" = 0 — toamna si vara, 3 seminte', () => {
  for (const seed of [1, 7, 12345]) {
    for (const [an, nume] of [[2, 'toamna'], [1, 'vara']] as const) {
      const o = camaraCuOameni(seed, an)
      const cine = `seed ${seed} ${nume}: ${JSON.stringify(o)}`
      assert.ok(o.gataSapat > 0, `${cine} — sapatul gata`)
      assert.ok(o.molozLaPictare > 0 && o.propusa > 0, `${cine} — molozul era pe camara si groapa s-a propus`)
      assert.ok(o.molozGata >= 0 && o.molozGata <= 3 * 1680, `${cine} — molozul iesit din camara in 3 h`)
      assert.ok(o.maxCamara >= 450, `${cine} — hrana a intrat in camara`)
      assert.ok(o.mancatCamara >= 0.85 * o.mancat && o.mancat >= 550, `${cine} — s-a mancat din camara`)
      assert.ok(o.stricat <= 0.03 * o.pusa, `${cine} — stricat sub 3%`)
      assert.ok(o.plecati > 0, `${cine} — hrana s-a terminat si au plecat (proba are ce masura)`)
      assert.equal(o.plecatiCuHrana, 0, `${cine} — plecati cu hrana in camara`)
    }
  }
  // Martorul (perechea care trebuie sa difere): aceeasi colonie, camara FARA filtru — la aceeasi prioritate cu generalul,
  // pictata dupa el, nu primeste hrana (rangul egal, id-ul mai mare).
  const m = camaraCuOameni(1, 2, false)
  assert.ok(m.maxCamara <= 150 && m.stricat >= 0.1 * m.pusa, `martorul fara filtru: ${JSON.stringify(m)}`)
})

// JOC-2: aceeasi colonie, cu depozitul general PLIN de piatra — singurul loc al molozului e groapa, pusa de buton.
test('acceptanta gropii de moloz cu oameni: generalul plin de piatra, groapa pusa pe calea butonului (locGroapa + aplicaZona) — molozul camarii ajunge in ea in 3 h, camara se umple, stricat sub 3%; fara groapa, molozul ramane si hrana se strica — toamna, 3 seminte', () => {
  for (const seed of [1, 7, 12345]) {
    const o = camaraCuOameni(seed, 2, true, 'buton', true)
    const cine = `seed ${seed}: ${JSON.stringify(o)}`
    assert.ok(o.gataSapat > 0 && o.molozLaPictare > 0 && o.propusa > 0 && o.groapa !== null, `${cine} — molozul era pe camara, groapa propusa si pictata`)
    assert.ok(o.molozInGroapa >= o.molozLaPictare, `${cine} — molozul camarii a ajuns in groapa`)
    assert.ok(o.molozGata >= 0 && o.molozGata <= 3 * 1680, `${cine} — camara fara moloz in 3 h`)
    assert.ok(o.maxCamara >= 450, `${cine} — hrana a intrat in camara`)
    assert.ok(o.stricat <= 0.03 * o.pusa, `${cine} — stricat sub 3%`)
  }
  // Martorul: fara groapa, molozul n-are unde pleca (generalul e plin), camara ramane pe jumatate goala si hrana se strica.
  const m = camaraCuOameni(1, 2, true, 'fara', true)
  assert.ok(m.molozGata === -1 && m.stricat >= 0.05 * m.pusa, `martorul fara groapa: ${JSON.stringify(m)}`)
})
