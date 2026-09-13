import test from 'node:test'
import assert from 'node:assert/strict'
import { cloneRng, fnv1a32, nextInt, nextRange, nextU32, stream } from '../src/sim/rng.ts'

test('acelasi seed si acelasi nume de flux dau aceeasi secventa', () => {
  const a = stream(42, 'agents')
  const b = stream(42, 'agents')
  for (let i = 0; i < 1000; i++) assert.equal(nextU32(a), nextU32(b))
})

test('fluxurile numite nu se contamineaza intre ele', () => {
  // Asta e motivul pentru care exista fluxuri numite: o tragere in plus intr-un
  // sistem nu are voie sa mute secventa altui sistem.
  const combat1 = stream(42, 'combat')
  const first = Array.from({ length: 50 }, () => nextU32(combat1))

  const evenimente = stream(42, 'evenimente')
  for (let i = 0; i < 137; i++) nextU32(evenimente) // zgomot intr-un ALT flux

  const combat2 = stream(42, 'combat')
  const second = Array.from({ length: 50 }, () => nextU32(combat2))

  assert.deepEqual(second, first)
})

test('seed-uri diferite dau secvente diferite', () => {
  const a = stream(1, 'agents')
  const b = stream(2, 'agents')
  let same = 0
  for (let i = 0; i < 200; i++) if (nextU32(a) === nextU32(b)) same++
  assert.ok(same < 5, `prea multe coincidente: ${same}/200`)
})

test('nume de flux diferite dau secvente diferite pentru acelasi seed', () => {
  const a = stream(7, 'agents')
  const b = stream(7, 'combat')
  let same = 0
  for (let i = 0; i < 200; i++) if (nextU32(a) === nextU32(b)) same++
  assert.ok(same < 5, `prea multe coincidente: ${same}/200`)
})

test('nextU32 sta in domeniul uint32 si nu produce NaN', () => {
  const st = stream(99, 'agents')
  for (let i = 0; i < 10000; i++) {
    const v = nextU32(st)
    assert.ok(Number.isInteger(v), `nu e intreg la pasul ${i}: ${v}`)
    assert.ok(v >= 0 && v <= 0xffffffff, `in afara domeniului la pasul ${i}: ${v}`)
  }
})

test('nextInt respecta marginile si acopera rezonabil de uniform', () => {
  const st = stream(5, 'agents')
  const buckets = new Array<number>(6).fill(0)
  const n = 60000
  for (let i = 0; i < n; i++) {
    const v = nextInt(st, 6)
    assert.ok(v >= 0 && v < 6, `in afara domeniului: ${v}`)
    buckets[v]!++
  }
  // Cu 60.000 de trageri pe 6 cosuri, o abatere de peste 15% de la asteptare
  // inseamna un bias real, nu zgomot.
  const expected = n / 6
  for (const [i, count] of buckets.entries()) {
    const drift = Math.abs(count - expected) / expected
    assert.ok(drift < 0.15, `cosul ${i} deviaza ${(drift * 100).toFixed(1)}%`)
  }
})

test('nextInt(1) intoarce mereu 0 si nu consuma la infinit', () => {
  const st = stream(3, 'agents')
  for (let i = 0; i < 100; i++) assert.equal(nextInt(st, 1), 0)
})

test('nextInt refuza argumente invalide in loc sa se poarte ciudat', () => {
  const st = stream(3, 'agents')
  assert.throws(() => nextInt(st, 0))
  assert.throws(() => nextInt(st, -5))
  assert.throws(() => nextInt(st, 2.5))
})

test('nextRange e inclusiv la ambele capete', () => {
  const st = stream(11, 'agents')
  let sawMin = false
  let sawMax = false
  for (let i = 0; i < 5000; i++) {
    const v = nextRange(st, 3, 7)
    assert.ok(v >= 3 && v <= 7)
    if (v === 3) sawMin = true
    if (v === 7) sawMax = true
  }
  assert.ok(sawMin && sawMax, 'capetele intervalului nu au fost atinse')
})

test('contorul de trageri creste exact cu o unitate pe tragere', () => {
  const st = stream(13, 'agents')
  assert.equal(st.draws, 0)
  nextU32(st)
  assert.equal(st.draws, 1)
  // nextInt poate consuma mai mult de o tragere daca respinge, dar niciodata zero.
  const before = st.draws
  nextInt(st, 7)
  assert.ok(st.draws > before)
})

test('cloneRng izoleaza starea', () => {
  const a = stream(21, 'agents')
  const b = cloneRng(a)
  nextU32(a)
  assert.notEqual(a.s0 === b.s0 && a.s1 === b.s1 && a.s2 === b.s2 && a.s3 === b.s3, true)
})

test('fnv1a32 e stabil si sensibil la ordine', () => {
  assert.equal(fnv1a32('agents'), fnv1a32('agents'))
  assert.notEqual(fnv1a32('agents'), fnv1a32('stnega'))
  assert.ok(fnv1a32('') >= 0)
})
