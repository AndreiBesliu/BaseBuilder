import test from 'node:test'
import assert from 'node:assert/strict'
import { compare, format, repeat } from '../src/harness/measure.ts'

// Probele negative ale instrumentului de masurat. Un raportor de masuratori care
// nu poate spune „nedecis" e un generator de imbunatatiri imaginare.

test('mediana nu se lasa trasa de un singur esantion aberant', () => {
  const vals = [100, 100, 100, 100, 100, 100, 100, 100, 100, 5000]
  let i = 0
  const m = repeat(() => vals[i++]!, vals.length, 0)
  assert.equal(m.median, 100)
  assert.ok(m.mean > 500, 'media chiar e trasa — de asta se raporteaza mediana')
})

test('o diferenta sub zgomot iese NEDECIS, nu „mai rapid"', () => {
  // Doua serii care difera cu 2 unitati, cu stdev de ~15. DMD = 42.
  const a = [80, 100, 120, 90, 110, 95, 105, 85, 115, 100]
  const b = [82, 102, 122, 92, 112, 97, 107, 87, 117, 102]
  let i = 0
  let j = 0
  const before = repeat(() => a[i++]!, a.length, 0)
  const after = repeat(() => b[j++]!, b.length, 0)
  assert.equal(compare(before, after), 'nedecis')
})

test('o diferenta peste zgomot se vede', () => {
  const a = [100, 101, 99, 100, 102, 98, 100, 101, 99, 100]
  const b = [50, 51, 49, 50, 52, 48, 50, 51, 49, 50]
  let i = 0
  let j = 0
  const before = repeat(() => a[i++]!, a.length, 0)
  const after = repeat(() => b[j++]!, b.length, 0)
  assert.equal(compare(before, after), 'mai rapid')
})

test('CV-ul peste prag se STRIGA in raport, nu se ascunde', () => {
  const vals = [50, 150, 60, 140, 55, 145, 70, 130, 65, 135]
  let i = 0
  const m = repeat(() => vals[i++]!, vals.length, 0)
  assert.ok(m.cvPct > 10, `CV ${m.cvPct.toFixed(1)}% ar trebui sa fie peste 10`)
  assert.match(format(m, 'µs'), /NU COMPARA/)
})

test('warmup-ul chiar se arunca', () => {
  const vals = [9999, 9999, 10, 10, 10, 10, 10]
  let i = 0
  const m = repeat(() => vals[i++]!, 5, 2)
  assert.equal(m.median, 10)
  assert.equal(m.samples.length, 5)
})
