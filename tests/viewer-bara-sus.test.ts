/**
 * Bara de sus: calendarul si aerul de afara (design temperatura v2, §6) — textele, pure (viewer/ui/texte.ts).
 * Latimea pe ecran o masoara ui-fum („bara-sus"); aici, ce scrie.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RULES as R } from '../src/sim/content.ts'
import { Anotimp, momentul, panaLaAnotimp, tickuriPeOra } from '../src/sim/calendar.ts'
import { tAfara } from '../src/sim/clima.ts'
import { textCalendar, textGrade, textMinuteReale, textPesteZile, textTendinta, textTitluCalendar } from '../viewer/ui/texte.ts'

const Q = 65536
const ZI = 40320

/** Ce scrie bara la tickul `t`: aceeasi compunere ca `scrieCalendar` din panouri.ts. */
function bara(t: number, seed = 7): string {
  const acum = tAfara(seed, t, R)
  return textCalendar(momentul(t, R), R.calendar.zilePeAnotimp, acum, tAfara(seed, t + tickuriPeOra(R), R) - acum)
}
function titlu(t: number, viteza: number): string {
  return textTitluCalendar({
    tick: t,
    moment: momentul(t, R),
    panaLaIarna: panaLaAnotimp(t, Anotimp.IARNA, R),
    panaLaPrimavara: panaLaAnotimp(t, Anotimp.PRIMAVARA, R),
    ziTicks: R.calendar.ziTicks,
    ticksPerSecond: R.ticksPerSecond,
    viteza,
  })
}

test('bara de sus: „Toamnă 2/4 · 14:20 · 16° →" — anotimpul, ziua din anotimp, ora, gradele, tendinta', () => {
  // Tickul 50.960 = toamna, ziua 2, 14:20. Aerul: 9,4 + 11,2·0,158 + 5·0,985 = 16,1 °C; in ora urmatoare
  // ziua mai urca 0,06 °C, anul coboara 0,18: sub pragul de un sfert de grad, deci „→".
  assert.equal(bara(50960), 'Toamnă 2/4 · 14:20 · 16° →')
  // Startul: 08:00, aerul urca spre amiaza.
  assert.equal(bara(0), 'Toamnă 1/4 · 08:00 · 15° ↗')
  // Iarna, ziua 3, 03:00, in ziua valului de frig (seed 12345: ziua 3): −16,8 °C, minimul anului. In
  // vale, ora urmatoare incalzeste doar 5 · (1 − cos(2π/24)) = 0,17 °C: „→".
  const val = (12 + 2) * ZI + 3 * 1680 - 336000
  assert.equal(bara(val, 12345), 'Iarnă 3/4 · 03:00 · −17° →')
  // Spre seara, aerul coboara: 18:00 → 19:00 pierde 5 · (cos 45° − cos 60°) + 0,18 = 1,2 °C.
  assert.equal(bara(10 * 1680).slice(-1), '↘')
})

test('textGrade: grade intregi, minus tipografic, si niciodata „−0°"', () => {
  assert.deepEqual([8 * Q, -3 * Q, Math.round(-0.4 * Q), 0, 7.5 * Q, -2.5 * Q, -16.79 * Q].map(textGrade), ['8°', '−3°', '0°', '0°', '8°', '−2°', '−17°'])
})

test('textTendinta: un sfert de grad pe ora e pragul — sub el „→"', () => {
  assert.deepEqual([16384, 16383, 0, -16383, -16384, 5 * Q].map(textTendinta), ['↗', '→', '→', '→', '↘', '↗'])
})

test('tooltip-ul calendarului: „Iarna în 3 zile (≈ 41 min la 3×) · timp de joc 0:00:00", si in iarna cat mai tine', () => {
  // Exemplul designului, la start: 3 zile si 16 ore pana la iarna = 147.840 de tickuri = 41,1 min la 3×.
  assert.equal(titlu(0, 3), 'Iarna în 3 zile (≈ 41 min la 3×) · timp de joc 0:00:00')
  assert.equal(titlu(0, 1), 'Iarna în 3 zile (≈ 2 h 03 min la 1×) · timp de joc 0:00:00')
  // In prima zi a iernii: mai tine 4 zile = 2 h 14 min la 1×; timpul de joc e 2:03:12.
  assert.equal(titlu(147840, 1), 'Iarna se termină în 4 zile (≈ 2 h 14 min la 1×) · timp de joc 2:03:12')
  // Cu o zi si ceva inainte: „într-o zi"; cu 5 ore: „în 5 ore".
  assert.equal(titlu(147840 - ZI - 1680, 2).split(' (')[0], 'Iarna într-o zi')
  assert.equal(titlu(147840 - 5 * 1680, 2).split(' (')[0], 'Iarna în 5 ore')
})

test('textPesteZile si textMinuteReale: zile in jos, ore in sus, „de" de la 20, minute reale cu zero in fata', () => {
  assert.deepEqual([3.9 * ZI, 2 * ZI, 1.5 * ZI, 5 * 1680, 1680 - 1, 20 * ZI].map((t) => textPesteZile(t, ZI)), ['în 3 zile', 'în 2 zile', 'într-o zi', 'în 5 ore', 'într-o oră', 'în 20 de zile'])
  assert.deepEqual([0.4, 41.07, 59.6, 123.2, 134.4].map(textMinuteReale), ['< 1 min', '41 min', '1 h 00 min', '2 h 03 min', '2 h 14 min'])
})
