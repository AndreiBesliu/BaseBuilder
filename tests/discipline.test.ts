import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CHECKER = join(ROOT, 'tools', 'check-sim-discipline.mjs')
const SIM_DIR = join(ROOT, 'src', 'sim')

function runChecker() {
  return spawnSync(process.execPath, [CHECKER], { cwd: ROOT, encoding: 'utf8' })
}

test('src/sim/ respecta disciplina de determinism', () => {
  const r = runChecker()
  assert.equal(r.status, 0, `checker-ul a gasit incalcari:\n${r.stderr}`)
})

test('checker-ul chiar PRINDE o incalcare — proba negativa', () => {
  // Fara testul asta n-as sti daca checker-ul e verde pentru ca e curat codul
  // sau pentru ca e stricat instrumentul. Un semnal verde nu e o masuratoare.
  const probe = join(SIM_DIR, '__discipline_probe.ts')
  const cases = [
    'export const t = Date.now()',
    'export const r = Math.random()',
    'export async function f() { return 1 }',
    'export const d = new Date()',
  ]
  try {
    for (const src of cases) {
      writeFileSync(probe, `${src}\n`, 'utf8')
      const r = runChecker()
      assert.equal(r.status, 1, `checker-ul NU a prins: ${src}`)
    }
  } finally {
    rmSync(probe, { force: true })
  }
  assert.equal(runChecker().status, 0, 'proba nu a fost curatata')
})

test('checker-ul PRINDE functiile transcendente si operatorul ** — proba negativa, fara portita', () => {
  // Panoul temperaturii (L4-7): scanerul interzicea din `Math.*` doar `random`, deci un `Math.exp`
  // grabit in `tSol` ar fi trecut de `npm run check`. Fiecare caz e si cu portita: e o interdictie DURA.
  const probe = join(SIM_DIR, '__transcendent_probe.ts')
  const cases = [
    'export const c = Math.cos(1)',
    'export const s = Math.sin(1)',
    'export const e = Math.exp(-0.5)',
    'export const l = Math.log2(8)',
    'export const a = Math.atan2(1, 1)',
    'export const p = Math.pow(2, 3)',
    'export const h = Math.hypot(3, 4)',
    'export const q = 2 ** 3',
    'export let x = 2; x **= 2',
  ]
  try {
    for (const src of cases) {
      writeFileSync(probe, `${src}\n`, 'utf8')
      assert.equal(runChecker().status, 1, `checker-ul NU a prins: ${src}`)
      writeFileSync(probe, `// determinism-ok: promit ca e in regula\n${src}\n`, 'utf8')
      assert.equal(runChecker().status, 1, `portita a acoperit: ${src}`)
    }
    // Controlul: aritmetica permisa si un docbloc cu `**` nu se raporteaza.
    writeFileSync(probe, '/** **ingrosat** */\nexport const ok = Math.imul(3, 4) + Math.floor(1.5) + Math.sqrt(4) + Math.round(2 * 3) + Math.max(1, 2)\n', 'utf8')
    assert.equal(runChecker().status, 0, 'checker-ul a raportat aritmetica permisa sau un comentariu')
  } finally {
    rmSync(probe, { force: true })
  }
  assert.equal(runChecker().status, 0, 'proba nu a fost curatata')
})

test('portita determinism-ok functioneaza, dar numai cu justificare', () => {
  const probe = join(SIM_DIR, '__exempt_probe.ts')
  try {
    writeFileSync(probe, 'export const k = Object.keys({ a: 1 })\n', 'utf8')
    assert.equal(runChecker().status, 1, 'iterarea nesortata ar fi trebuit semnalata')

    writeFileSync(probe, '// determinism-ok: literal fix, nu stare de rulare\nexport const k = Object.keys({ a: 1 })\n', 'utf8')
    assert.equal(runChecker().status, 0, 'justificarea nu a fost recunoscuta')
  } finally {
    rmSync(probe, { force: true })
  }
})

test('portita NU acopera interdictiile dure', () => {
  // `Date.now()` nu se poate justifica. Daca ai nevoie de el, nu e cod de simulare.
  const probe = join(SIM_DIR, '__hard_probe.ts')
  try {
    writeFileSync(probe, '// determinism-ok: promit ca e in regula\nexport const t = Date.now()\n', 'utf8')
    assert.equal(runChecker().status, 1, 'portita a acoperit o interdictie dura')
  } finally {
    rmSync(probe, { force: true })
  }
})

test('checker-ul nu se raporteaza pe sine cand documentatia mentioneaza tiparele', () => {
  // Prima versiune a picat exact asa: docblocul care ENUMERA tiparele interzise
  // contine chiar tiparele interzise.
  const dir = mkdtempSync(join(tmpdir(), 'kinstead-'))
  const probe = join(SIM_DIR, '__comment_probe.ts')
  try {
    writeFileSync(
      probe,
      ['/**', ' * Aici e interzis Date.now() si Math.random().', ' */', '// si Date.now() in comentariu de linie', 'export const ok = 1', ''].join('\n'),
      'utf8',
    )
    assert.equal(runChecker().status, 0, 'checker-ul a raportat text din comentarii')
  } finally {
    rmSync(probe, { force: true })
    rmSync(dir, { recursive: true, force: true })
  }
})
