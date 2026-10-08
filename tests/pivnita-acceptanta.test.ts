/**
 * Acceptanța pivniței, RELATIVĂ — S24-27 t.2b §9 (verif-JOC-4), contractul t.2b → t.3 pentru decizia 6.
 *
 * Poarta absolută („sub 5 °C la ore fixe") e oarbă la regula de proveniență (anul 2 al oricărei geometrii fixe nu mai
 * depinde de pornire) și ar alege pompa B. Poarta relativă: pivnița săpată sub casă PROGRESIV, prin comenzi `dig` (o
 * celulă la 55 de tickuri), închisă cu o ușă pusă prin comenzi, la 8 momente (vara 08:00, 15:00, 03:00, toamna, iarna,
 * primăvara, prima toamnă de două ori) — la închiderea ușii |T_piv − T_regim periodic(același tick)| ≤ 2 °C. Măsurat (C3):
 * ΔT în [−0,41; +1,30] °C (verif-JOC-4, pe modelul în float: [−0,49; +1,35]); regula A ar ieși până la +15 °C.
 *
 * Plus verdictul „fără casă" (decizia 6): cu 1 m de pământ, rampă și ușă, vara sub 5 °C doar ~jumătate din ore (49/96,
 * max 5,77 °C), toamna 9/96; cu 2 m, 96/96 în fiecare anotimp. Și ușa scoasă și pusă la loc (decizia 3): casa și pivnița
 * ajung la aceeași T, media lor pe masă.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { componentaLa } from '../src/sim/camere.ts'
import { Anotimp, panaLaAnotimp } from '../src/sim/calendar.ts'
import { capacitateMu } from '../src/sim/fete.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { statTermic } from '../src/sim/temperatura.ts'
import { casaTermica } from './fixturi-temperatura.ts'
import { grafLumii, laEchilibru } from './fixturi-pas.ts'
import { AN, ORA, faraCasa, regimPeriodic, regimulPivnitei, sapaPivnita, tickLa } from './fixturi-pivnita.ts'
import { R } from './fixturi.ts'

test('PIVNITA acceptanta relativa (§9, verif-JOC-4): sapata sub casa prin comenzi dig, la 8 momente — la inchiderea usii |T_piv − T_regim periodic| ≤ 2 °C', () => {
  const reg = regimulPivnitei()
  const cazuri: [string, number, 'regim' | 'acoperis'][] = [
    ['vara z2 08:00', tickLa(AN, Anotimp.VARA, 2, 8), 'regim'],
    ['vara z2 15:00', tickLa(AN, Anotimp.VARA, 2, 15), 'regim'],
    ['vara z4 03:00', tickLa(AN, Anotimp.VARA, 4, 3), 'regim'],
    ['toamna z2 08:00', tickLa(AN, Anotimp.TOAMNA, 2, 8), 'regim'],
    ['iarna z2 08:00', tickLa(AN, Anotimp.IARNA, 2, 8), 'regim'],
    ['primavara z2 08:00', tickLa(AN, Anotimp.PRIMAVARA, 2, 8), 'regim'],
    ['prima toamna z1 10:45', tickLa(0, Anotimp.TOAMNA, 1, 10) + Math.round(0.75 * ORA), 'acoperis'],
    ['prima toamna z1 08:05', 140, 'acoperis'],
  ]
  let min = Infinity
  let max = -Infinity
  for (const [ce, tS, casaDeLa] of cazuri) {
    const s = sapaPivnita(tS, casaDeLa)
    const id = componentaLa(s.w.camere, ...s.piv)!.id
    const d = s.w.temperatura.slot.t[id]! / 65536 - reg(s.tInchidere)
    assert.ok(Math.abs(d) <= 2, `${ce}: pivnita la ${(s.w.temperatura.slot.t[id]! / 65536).toFixed(2)} °C, regimul ${reg(s.tInchidere).toFixed(2)} °C (ΔT ${d.toFixed(2)})`)
    assert.equal(statTermic(s.w).invarianti, 0, ce)
    min = Math.min(min, d)
    max = Math.max(max, d)
  }
  // Fixtura are ce măsura: momentele nu dau toate același ΔT.
  assert.ok(max - min > 0.5, `ΔT intre ${min.toFixed(2)} si ${max.toFixed(2)}`)
})

/** Orele (din primele 96 ale anotimpului, anul 2 al regimului periodic) cu pivnița sub 5 °C, și maximul. */
function oreSub5(f: (tk: number) => number, a: number): { sub: number; max: number } {
  const inceput = 2 * AN + panaLaAnotimp(0, a as 0, R)
  let sub = 0
  let max = -Infinity
  for (let h = 1; h <= 96; h++) {
    const v = f(inceput + h * ORA)
    if (v < 5) sub++
    max = Math.max(max, v)
  }
  return { sub, max }
}

test('PIVNITA verdictul fara casa (decizia 6, verif-JOC-4): cu 1 m de pamant, rampa si usa, vara sub 5 °C sub 85% din ore (~49/96), toamna aproape deloc; cu 2 m, 96/96 in fiecare anotimp', () => {
  const unu = faraCasa(1)
  const r1 = regimPeriodic(unu.w, unu.piv)
  const vara = oreSub5(r1, Anotimp.VARA)
  assert.ok(vara.sub < Math.ceil(0.85 * 96) && vara.sub >= 30, `1 m, vara: ${vara.sub}/96 (max ${vara.max.toFixed(2)} °C)`)
  assert.ok(oreSub5(r1, Anotimp.TOAMNA).sub < 30, '1 m, toamna')
  const doi = faraCasa(2)
  const r2 = regimPeriodic(doi.w, doi.piv)
  for (const a of [Anotimp.PRIMAVARA, Anotimp.VARA, Anotimp.TOAMNA, Anotimp.IARNA]) assert.equal(oreSub5(r2, a).sub, 96, `2 m, anotimpul ${a}`)
})

test('PIVNITA usa scoasa si pusa la loc (decizia 3, verif-JOC-3): chepengul sapat si zidit la loc prin comenzi — casa si pivnita ajung la aceeasi T, media lor pe masa (fetele celulei usii intra la T_sol)', () => {
  const s = casaTermica({ k: 1 })
  const w = laEchilibru(s.w, tickLa(AN, Anotimp.VARA, 2, 15))
  const casa = componentaLa(w.camere, ...s.rep.casa!)!.id
  const piv = componentaLa(w.camere, ...s.rep.pivnita!)!.id
  const sl = w.temperatura.slot
  sl.t[casa] = 20 * 65536
  sl.rest[casa] = 0
  const g = grafLumii(w)
  const C = (id: number): number => capacitateMu(g.noduri.get(g.nodComp.get(id)!)!, R.termic.mase)
  const medie = (C(casa) * sl.t[casa]! + C(piv) * sl.t[piv]! + sl.rest[piv]!) / (C(casa) + C(piv)) / 65536
  assert.ok(Math.abs(sl.t[casa]! - sl.t[piv]!) > 10 * 65536, 'fixtura: casa si pivnita la temperaturi departate')
  // Chepengul: celula USA de la capătul de sus al puțului.
  const c = 1 + (5 >> 1)
  const [ux, uy, uz] = [s.x0 + c - 1, s.y0 + c - 1, s.g]
  assert.ok(applyCommand(w, { kind: 'dig', wx: ux, wy: uy, z: uz }, R).ok)
  const unit = componentaLa(w.camere, ...s.rep.casa!)!
  assert.equal(unit.id, componentaLa(w.camere, ...s.rep.pivnita!)!.id, 'unite')
  assert.ok(applyCommand(w, { kind: 'fill', wx: ux, wy: uy, z: uz, material: Material.USA }, R).ok)
  const tc = w.temperatura.slot.t[componentaLa(w.camere, ...s.rep.casa!)!.id]!
  const tp = w.temperatura.slot.t[componentaLa(w.camere, ...s.rep.pivnita!)!.id]!
  assert.equal(tc, tp, 'despartirea pastreaza T in ambele parti')
  // Media pe masă, cu cele 4 fețe laterale ale celulei ușii (sol de suprafață) intrate și ieșite la T_sol(0). Măsurat:
  // 6,945 °C față de media 6,962 °C (casa la 20 °C, pivnița vara).
  assert.ok(Math.abs(tc / 65536 - medie) <= 0.05, `T dupa ${(tc / 65536).toFixed(3)} °C, media pe masa ${medie.toFixed(3)} °C`)
  assert.equal(statTermic(w).invarianti, 0)
})
