/**
 * Clima (src/sim/clima.ts) — design temperatura v2, §2–§3.
 *
 * Oracolele sunt pe HARTIE (formula scrisa cu cifrele din design) sau `Math.cos`/`Math.exp` aici, in
 * test, unde au voie: nucleul le are interzise (scanerul de disciplina), deci nu se poate testa pe
 * sine cu ele. O autoconsistenta (tabelul comparat cu el insusi) n-ar dovedi nimic.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RULES as R } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { Anotimp, momentul, tickDeStart, tickuriPeAn } from '../src/sim/calendar.ts'
import { ADANCIME_MAX, cosQ14, GRAD_Q16, tAfara, tSol, tSolMediu, valDeFrig, ziuaValului } from '../src/sim/clima.ts'

const ZI = 40320
const ORA = 1680
const AN = 645120
const grade = (q: number): number => q / GRAD_Q16

/** Fara valul de frig: aceleasi reguli, amplitudinea lui 0. */
const FARA_VAL: Rules = { ...R, clima: { ...R.clima, valFrig: { ...R.clima.valFrig, amplitudineMc: 0 } } }
/** Tickul (de la startul jocului) al inceputului zilei `z` (de la 1) a iernii din anul 0. */
const ziDeIarna = (z: number): number => (12 + z - 1) * ZI - tickDeStart(R)

test('cosQ14: eroarea fata de cosinusul real e sub 0,0001 pe toata unda, si la faze negative', () => {
  let maxim = 0
  for (let p = -65536; p <= 2 * 65536; p++) {
    const e = Math.abs(cosQ14(p) / 16384 - Math.cos((2 * Math.PI * p) / 65536))
    if (e > maxim) maxim = e
  }
  assert.ok(maxim < 0.0001, `eroarea maxima ${maxim}`)
  // Punctele exacte ale sferturilor (tabelul are capetele lui, fara interpolare).
  assert.deepEqual([0, 16384, 32768, 49152, 65536, -16384].map(cosQ14), [16384, 0, -16384, 0, 16384, 0])
})

test('tabelele solului: e^(−(d+½)/D_a), e^(−(d+½)/D_s) si intarzierea in ture, contra formulei', () => {
  const t = R.clima.tabele
  assert.equal(t.expAdancQ16.length, ADANCIME_MAX + 1)
  for (let d = 0; d <= ADANCIME_MAX; d++) {
    assert.ok(Math.abs(t.expAdancQ16[d]! / 65536 - Math.exp(-(d + 0.5) / 2)) <= 0.5 / 65536, `e^a la d=${d}`)
    assert.ok(Math.abs(t.expSezonQ16[d]! / 65536 - Math.exp(-(d + 0.5) / 0.8)) <= 0.5 / 65536, `e^s la d=${d}`)
    // LAG[d] = (d + ½) / (2π · 0,8 m) ture = 13.038 de unitati Q16 pe metru (panoul, L1-07).
    assert.ok(Math.abs(t.lagQ16[d]! - ((d + 0.5) * 65536) / (2 * Math.PI * 0.8)) <= 0.5, `lag la d=${d}`)
  }
  assert.deepEqual(t.lagQ16.slice(0, 2), [6519, 19557])
})

test('tSolMediu: media solului pe hartie — 7,41 °C la d=0 (0,5 m), 4,65 la d=1 (1,5 m), 0,40 adanc', () => {
  // T_medie + ΔT · (1 − e^(−(d+½)/D_a)) = 9,4 − 9 · (1 − e^(−(d+½)/2)), la CENTRUL celulei.
  const hartie: readonly [number, number][] = [[0, 7.40921], [1, 4.6513], [2, 2.97854], [3, 1.96397], [64, 0.4]]
  for (const [d, v] of hartie) assert.ok(Math.abs(grade(tSolMediu(d, R)) - v) < 0.001, `d=${d}: ${grade(tSolMediu(d, R))} fata de ${v}`)
  // Cifrele designului la 2 m (3,7 °C) si 3 m (2,4 °C) cad pe granita dintre celule: intre d=1 si d=2,
  // respectiv d=2 si d=3 — iar formula continua le da exact.
  assert.ok(grade(tSolMediu(1, R)) > 3.711 && 3.711 > grade(tSolMediu(2, R)))
  assert.ok(grade(tSolMediu(2, R)) > 2.408 && 2.408 > grade(tSolMediu(3, R)))
  assert.ok(Math.abs(9.4 - 9 * (1 - Math.exp(-2 / 2)) - 3.711) < 0.001 && Math.abs(9.4 - 9 * (1 - Math.exp(-3 / 2)) - 2.408) < 0.001)
})

test('tSol: media pe un an e tSolMediu, iar amplitudinea e 11,2 · e^(−(d+½)/0,8) (5,99 / 1,72 / 0,49 °C)', () => {
  const amplitudini: readonly [number, number][] = [[0, 5.99493], [1, 1.71758], [2, 0.49209]]
  for (const [d, a] of amplitudini) {
    let suma = 0
    let n = 0
    let mn = Infinity
    let mx = -Infinity
    for (let t = 0; t < AN; t += 16) {
      const v = grade(tSol(d, t, R))
      suma += v
      n++
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
    assert.ok(Math.abs(suma / n - grade(tSolMediu(d, R))) < 0.001, `media la d=${d}`)
    assert.ok(Math.abs((mx - mn) / 2 - a) < 0.002, `amplitudinea la d=${d}: ${(mx - mn) / 2} fata de ${a}`)
  }
})

test('tSol: unda anului intarzie cu adancimea — la d=1 minimul vine cu 0,298 ani dupa mijlocul iernii', () => {
  // Mijlocul iernii (cel mai rece aer, in medie) e la inceputul zilei 14 a anului.
  const mijloc = 14 * ZI - tickDeStart(R)
  for (const d of [0, 1]) {
    let mn = Infinity
    let unde = 0
    for (let t = mijloc; t < mijloc + AN; t += 8) {
      const v = tSol(d, t, R)
      if (v < mn) { mn = v; unde = t }
    }
    // (d + ½) / (2π · 0,8) ture: 0,0995 ani la d=0, 0,2984 la d=1.
    const asteptat = mijloc + Math.round(((d + 0.5) / (2 * Math.PI * 0.8)) * AN)
    assert.ok(Math.abs(unde - asteptat) < 1500, `d=${d}: minimul la ${unde}, asteptat ${asteptat}`)
  }
})

test('tSol: d se clampeaza IN functie — T_sol(−11) == T_sol(0), T_sol(100) == T_sol(64), niciodata NaN', () => {
  // Donjonul cu 11 m plini: d = −11 (panoul, L3-1). Fara clamp, tabelul citit la indice negativ da NaN.
  for (let t = 0; t < AN; t += 9973) {
    const zero = tSol(0, t, R)
    assert.ok(Number.isInteger(zero))
    for (const d of [-1, -8, -11, -1000]) assert.equal(tSol(d, t, R), zero, `d=${d}, tick ${t}`)
    assert.equal(tSol(100, t, R), tSol(64, t, R))
    assert.equal(tSolMediu(-11, R), tSolMediu(0, R))
  }
})

test('tAfara: fara val, minimul anului e −6,79 °C (9,4 − 11,2·cos(2π/128) − 5), maximul 25,48 °C', () => {
  let mn = Infinity
  let mx = -Infinity
  let unde = 0
  for (let t = 0; t < AN; t++) {
    const v = tAfara(12345, t, FARA_VAL)
    if (v < mn) { mn = v; unde = t }
    if (v > mx) mx = v
  }
  // Pe hartie: iarna, ziua 3, 03:00 — inceputul zilei 14 plus 3 ore, ora cea mai rece.
  assert.ok(Math.abs(grade(mn) - (9.4 - 11.2 * Math.cos((2 * Math.PI) / 128) - 5)) < 0.005, `minimul ${grade(mn)}`)
  assert.ok(Math.abs(grade(mn) + 6.7865) < 0.005)
  const m = momentul(unde, R)
  assert.deepEqual([m.anotimp, m.zi, m.ora === 2 || m.ora === 3], [Anotimp.IARNA, 3, true])
  // Vara, ziua 2, 15:00 (cu 9 ore inainte de varful anului).
  assert.ok(Math.abs(grade(mx) - (9.4 + 11.2 * Math.cos((2 * Math.PI * 9) / 384) + 5)) < 0.005, `maximul ${grade(mx)}`)
})

test('tAfara: cu val, minimul e −16,15 °C (ziua 2 a iernii) sau −16,79 °C (ziua 3), dupa ziua din seed', () => {
  const vazute = new Set<number>()
  for (const seed of [1, 2, 3, 777, 12345, 20260913]) {
    const z = ziuaValului(seed, 0, R)
    vazute.add(z)
    let mn = Infinity
    for (let t = ziDeIarna(1); t < ziDeIarna(5); t++) mn = Math.min(mn, tAfara(seed, t, R))
    // Pe hartie, la 03:00 in ziua valului: z3 = −6,7865 − 10; z2 = 9,4 − 11,2·cos(2π·21/384) − 5 − 10.
    // In z2 unda anului inca coboara, deci minimul zilei cade putin dupa 03:00 (−16,151).
    if (z === 3) assert.ok(Math.abs(grade(mn) + 16.7865) < 0.005, `seed ${seed}: ${grade(mn)}`)
    else assert.ok(grade(mn) <= -16.145 && grade(mn) > -16.16, `seed ${seed}: ${grade(mn)}`)
  }
  assert.deepEqual([...vazute].sort(), [2, 3], 'fixtura are seed-uri pe ambele zile')
})

test('valul de frig: trapez in ziua lui — −5 °C la 01:30, −10 °C pe platoul 03:00–21:00, 0 in afara zilei', () => {
  const seed = 777
  const z = ziuaValului(seed, 0, R)
  const t0 = ziDeIarna(z)
  const val = (t: number): number => valDeFrig(seed, momentul(t, R), R)
  assert.equal(val(t0), 0)
  assert.equal(val(t0 + 1.5 * ORA), -5 * GRAD_Q16)
  assert.equal(val(t0 + 3 * ORA), -10 * GRAD_Q16)
  assert.equal(val(t0 + 21 * ORA - 1), -10 * GRAD_Q16)
  assert.equal(val(t0 + 22.5 * ORA), -5 * GRAD_Q16)
  assert.equal(val(t0 + ZI - 1) > -10 * GRAD_Q16 && val(t0 + ZI - 1) < 0, true)
  // Ziua dinainte, ziua de dupa si aceeasi ora a altui anotimp: nimic.
  for (const t of [t0 - 1, t0 + ZI, t0 + 3 * ORA - 4 * ZI * 2]) assert.equal(val(t), 0, `tick ${t}`)
  // Valul e exact diferenta dintre clima cu el si clima fara el.
  for (const t of [t0 + ORA, t0 + 5 * ORA, t0 + 22 * ORA]) assert.equal(tAfara(seed, t, R) - tAfara(seed, t, FARA_VAL), val(t))
})

test('ziua valului: in [ziMin, ziMax] pe 2000 de seed-uri, depinde de seed si de an, pura', () => {
  const pe = new Map<number, number>()
  for (let s = 1; s <= 2000; s++) {
    const z = ziuaValului(s, 0, R)
    assert.ok(z >= R.clima.valFrig.ziMin && z <= R.clima.valFrig.ziMax, `seed ${s}: ziua ${z}`)
    pe.set(z, (pe.get(z) ?? 0) + 1)
    assert.equal(ziuaValului(s, 0, R), z, 'acelasi apel, acelasi raspuns')
  }
  // Ambele zile apar, fiecare cam jumatate (masurat: 983 / 1017).
  assert.ok((pe.get(2) ?? 0) > 900 && (pe.get(3) ?? 0) > 900, JSON.stringify([...pe]))
  // Si pe ani, la acelasi seed.
  const ani = new Set<number>()
  for (let an = 0; an < 20; an++) ani.add(ziuaValului(12345, an, R))
  assert.equal(ani.size, 2)
  // Un an intreg mai tarziu, tAfara e aceeasi functie de (seed, tick): fara stare ascunsa.
  const t = ziDeIarna(2) + 5 * ORA
  assert.equal(tAfara(12345, t, R), tAfara(12345, t, R))
  assert.equal(tAfara(12345, t + AN, R) - valDeFrig(12345, momentul(t + AN, R), R), tAfara(12345, t, R) - valDeFrig(12345, momentul(t, R), R))
})

test('clima urmeaza calendarul: cu ziua de doua ori mai scurta, la acelasi tick e alta clima', () => {
  // Cu ziua de doua ori mai scurta, la acelasi tick e alta ora — clima urmeaza calendarul, nu tickul.
  const scurt: Rules = { ...R, calendar: { ...R.calendar, ziTicks: ZI / 2 } }
  assert.equal(tickuriPeAn(scurt), AN / 2)
  assert.notEqual(tAfara(1, 50000, scurt), tAfara(1, 50000, R))
})
