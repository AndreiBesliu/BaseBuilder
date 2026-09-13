import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_RULES, parseRules } from '../src/sim/content.ts'
import { Reason } from '../src/sim/result.ts'
import { createWorld } from '../src/sim/world.ts'
import { MM_PER_CELL } from '../src/sim/state.ts'

test('fisierul de reguli livrat cu jocul e valid', () => {
  // Daca asta pica, jocul nu porneste — si vreau sa aflu in CI, nu la rulare.
  const raw = JSON.parse(readFileSync(new URL('../content/rules.json', import.meta.url), 'utf8'))
  const out = parseRules(raw)
  assert.ok(out.ok, out.ok ? '' : `reguli invalide: ${out.reason} ${JSON.stringify(out.params)}`)
})

test('regulile implicite trec propria validare', () => {
  const out = parseRules({ ...DEFAULT_RULES })
  assert.ok(out.ok)
})

test('un camp lipsa e refuzat, cu numele campului', () => {
  const { worldWidthCells: _omit, ...rest } = DEFAULT_RULES
  const out = parseRules(rest)
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.LIPSA_MATERIAL)
    assert.equal(out.params.camp, 'worldWidthCells')
  }
})

test('un camp NECUNOSCUT e refuzat — o cheie scrisa gresit nu trece tacut', () => {
  // Capcana clasica de modding: scrii `agentStepMM` in loc de `agentStepMm`,
  // jocul foloseste implicitul si petreci o zi intrebandu-te de ce nu se schimba nimic.
  const out = parseRules({ ...DEFAULT_RULES, agentStepMM: 500 })
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.COMANDA_NECUNOSCUTA)
    assert.equal(out.params.camp, 'agentStepMM')
  }
})

test('o valoare in afara domeniului e refuzata cu min si max', () => {
  const out = parseRules({ ...DEFAULT_RULES, ticksPerSecond: 5000 })
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.CAPACITATE_DEPASITA)
    assert.equal(out.params.valoare, 5000)
    assert.equal(out.params.max, 240)
  }
})

test('un numar cu virgula e refuzat — starea de simulare e pe intregi', () => {
  const out = parseRules({ ...DEFAULT_RULES, agentStepMm: 12.5 })
  assert.equal(out.ok, false)
})

test('un tip gresit e refuzat, nu convertit tacut', () => {
  const out = parseRules({ ...DEFAULT_RULES, agentCapacity: '64' })
  assert.equal(out.ok, false)
})

test('radacina trebuie sa fie un obiect', () => {
  assert.equal(parseRules(null).ok, false)
  assert.equal(parseRules([]).ok, false)
  assert.equal(parseRules(42).ok, false)
})

test('regulile chiar ajung in lume, nu sunt decorative', () => {
  const rules = { ...DEFAULT_RULES, worldWidthCells: 10, worldHeightCells: 20, agentCapacity: 3 }
  const w = createWorld(1, rules)
  assert.equal(w.bounds.w, 10 * MM_PER_CELL)
  assert.equal(w.bounds.h, 20 * MM_PER_CELL)
  assert.equal(w.agents.capacity, 3)
})
