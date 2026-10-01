/**
 * Calendarul (src/sim/calendar.ts) — design temperatura v2, §1. Cifrele sunt pe hartie: ziua de
 * 40.320 de tickuri (1.680 pe ora, 28 pe minut), 4 zile pe anotimp, anul de 645.120, start toamna,
 * ziua 1, 08:00 = tickul 336.000 al anului (8 zile × 40.320 + 8 × 1.680).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RULES as R } from '../src/sim/content.ts'
import { Anotimp, momentul, panaLaAnotimp, tickDeStart, tickuriPeAn, tickuriPeOra } from '../src/sim/calendar.ts'

const ORA = 1680
const MINUT = 28
const ZI = 40320
const AN = 645120

test('calendarul: ziua, ora, minutul si anul au cifrele din design (40.320 / 1.680 / 28 / 645.120)', () => {
  assert.equal(tickuriPeOra(R), ORA)
  assert.equal(R.calendar.ziTicks / 1440, MINUT)
  assert.equal(tickuriPeAn(R), AN)
  // 8 h 57,6 min la 1× (20 de tickuri pe secunda): „8 h 58 min".
  assert.equal(AN / R.ticksPerSecond / 60, 537.6)
})

test('momentul: tickul 0 e toamna, ziua 1, 08:00, in anul 0', () => {
  assert.equal(tickDeStart(R), 8 * ZI + 8 * ORA)
  const m = momentul(0, R)
  assert.deepEqual(
    { an: m.an, anotimp: m.anotimp, zi: m.zi, ora: m.ora, minut: m.minut, ziInAn: m.ziInAn, tickInZi: m.tickInZi },
    { an: 0, anotimp: Anotimp.TOAMNA, zi: 1, ora: 8, minut: 0, ziInAn: 8, tickInZi: 8 * ORA },
  )
})

test('momentul: „Toamnă 2/4 · 14:20" e tickul 50.960, iar minutul urmator vine dupa 28 de tickuri', () => {
  const t = ZI + 6 * ORA + 20 * MINUT
  assert.equal(t, 50960)
  const m = momentul(t, R)
  assert.deepEqual([m.anotimp, m.zi, m.ora, m.minut], [Anotimp.TOAMNA, 2, 14, 20])
  assert.deepEqual([momentul(t + MINUT - 1, R).minut, momentul(t + MINUT, R).minut], [20, 21])
  // Miezul noptii: 16 ore dupa start, ziua 2, 00:00.
  const noapte = momentul(16 * ORA, R)
  assert.deepEqual([noapte.zi, noapte.ora, noapte.minut, noapte.tickInZi], [2, 0, 0, 0])
  assert.deepEqual([momentul(16 * ORA - 1, R).zi, momentul(16 * ORA - 1, R).ora, momentul(16 * ORA - 1, R).minut], [1, 23, 59])
})

test('momentul: anotimpurile vin in ordine, iar anul se reia identic', () => {
  // Iarna incepe la 3 zile si 16 ore dupa start: 147.840 de tickuri.
  const iarna = 3 * ZI + 16 * ORA
  assert.deepEqual([momentul(iarna - 1, R).anotimp, momentul(iarna, R).anotimp, momentul(iarna, R).zi], [Anotimp.TOAMNA, Anotimp.IARNA, 1])
  const primavara = iarna + 4 * ZI
  assert.deepEqual([momentul(primavara, R).anotimp, momentul(primavara, R).an, momentul(primavara - 1, R).an], [Anotimp.PRIMAVARA, 1, 0])
  for (const t of [0, 12345, 400000, 645119]) {
    const a = momentul(t, R)
    const b = momentul(t + AN, R)
    assert.equal(b.an, a.an + 1)
    assert.deepEqual({ ...b, an: 0 }, { ...a, an: 0 }, `tickul ${t} si ${t + AN} difera in afara de an`)
  }
})

test('momentul: tickurile negative cad in anul −1 (impartire cu floor, nu trunchiere)', () => {
  // t = −336.001 e cu un tick inaintea anului 0: iarna, ziua 4, 23:59 a anului −1.
  const m = momentul(-tickDeStart(R) - 1, R)
  assert.deepEqual([m.an, m.anotimp, m.zi, m.ora, m.minut, m.tickInAn], [-1, Anotimp.IARNA, 4, 23, 59, AN - 1])
  assert.equal(momentul(-tickDeStart(R), R).an, 0)
})

test('momentul: fazele in Q16 de tura — mijlocul iernii 57.344, ora 15:00 40.960', () => {
  // Mijlocul iernii = inceputul zilei 14 din 16 = 14/16 de tura. Tickul: 14 zile minus startul.
  const mijloc = 14 * ZI - tickDeStart(R)
  assert.equal(momentul(mijloc, R).fazaAn, 57344)
  assert.equal(momentul(mijloc, R).fazaZi, 0)
  assert.equal(momentul(7 * ORA, R).fazaZi, 40960, '08:00 + 7 h = 15:00 = 15/24 de tura')
  assert.equal(momentul(0, R).fazaAn, Math.floor((336000 * 65536) / AN))
})

test('panaLaAnotimp: prima iarna vine dupa 147.840 de tickuri (2 h 03 min la 1×, 41 min la 3×)', () => {
  const t = panaLaAnotimp(0, Anotimp.IARNA, R)
  assert.equal(t, 3 * ZI + 16 * ORA)
  assert.equal(Math.floor(t / R.ticksPerSecond / 60), 123, '2 h 03 min la 1×')
  assert.equal(Math.round(t / R.ticksPerSecond / 3 / 60), 41, '41 min la 3×')
  // In iarna, urmatoarea iarna e peste un an; la inceputul ei, 0.
  assert.equal(panaLaAnotimp(t, Anotimp.IARNA, R), 0)
  assert.equal(panaLaAnotimp(t + 1, Anotimp.IARNA, R), AN - 1)
  // Iarna tine 4 zile: 2 h 14 min la 1×.
  assert.equal(panaLaAnotimp(t, Anotimp.PRIMAVARA, R), 4 * ZI)
  assert.equal(Math.floor((4 * ZI) / R.ticksPerSecond / 60), 134)
})
