import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_RULES, parseRules } from '../src/sim/content.ts'
import { Reason } from '../src/sim/result.ts'
import { createWorld } from '../src/sim/world.ts'
import { MM_PER_CELL } from '../src/sim/state.ts'
import { WORLD_CELLS } from '../src/sim/terrain/terrain.ts'

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
  const { agentStepMm: _omit, ...rest } = DEFAULT_RULES
  const out = parseRules(rest)
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.LIPSA_MATERIAL)
    assert.equal(out.params.camp, 'agentStepMm')
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
  const rules = { ...DEFAULT_RULES, agentCapacity: 3, chunkResidentRadius: 4 }
  const w = createWorld(1, rules)
  assert.equal(w.agents.capacity, 3)
  assert.equal(w.terrain.radius, 4)
  // Marimea lumii NU mai vine din reguli: o da harta macro.
  assert.equal(w.bounds.w, WORLD_CELLS * MM_PER_CELL)
})

// ---------------------------------------------------------------------------
// kitul de constructie (S20-23, taietura 2)
// ---------------------------------------------------------------------------

/** `DEFAULT_RULES` cu tabelul de piese inlocuit cu forma din FISIER. */
function cuPiese(piese: unknown): unknown {
  return { ...DEFAULT_RULES, piese }
}
const PIESE_BUNE = {
  PERETE: { material: 'PIATRA_CONSTRUITA', cantitate: 20, lucru: 400 },
  PODEA: { material: 'PIATRA_CONSTRUITA', cantitate: 20, lucru: 300 },
  SCARA: { material: 'LEMN_CONSTRUIT', cantitate: 5, lucru: 250 },
}

test('fisierul si forma deja parsata dau ACELASI tabel de piese', () => {
  // Parserul accepta doua forme — obiectul din fisier si tabloul din
  // `DEFAULT_RULES` — si amandoua trec prin aceleasi validari. Daca ar diverge,
  // testele ar rula pe alt continut decat jocul.
  const dinFisier = parseRules(JSON.parse(readFileSync(new URL('../content/rules.json', import.meta.url), 'utf8')))
  const dinCod = parseRules({ ...DEFAULT_RULES })
  assert.ok(dinFisier.ok && dinCod.ok)
  if (!dinFisier.ok || !dinCod.ok) return
  assert.deepEqual(dinCod.value.piese, dinFisier.value.piese)
  assert.deepEqual(dinCod.value.piese[0], { material: 0, cantitate: 0, lucru: 0 }, 'santinela ramane goala')
})

test('o piesa care nu costa cat da inapoi e REFUZATA (altfel zidirea tipareste materie)', () => {
  // Masurat pe codul de dinaintea invariantului: `fill PIATRA_CONSTRUITA` + `dig`
  // duce marfa din lume de la 0 la 20. Cu peretele la 10, ciclul produce 10
  // unitati pe tura, la nesfarsit.
  const out = parseRules(cuPiese({ ...PIESE_BUNE, PERETE: { ...PIESE_BUNE.PERETE, cantitate: 10 } }))
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.VALOARE_INVALIDA)
    assert.equal(out.params.camp, 'piese.PERETE.cantitate')
    assert.equal(out.params.asteptat, 20)
  }

  // Si in CEALALTA directie: mai scump decat da inapoi ar fi o deconstructie cu
  // pierdere, adica o decizie de joc care trebuie sa-si scrie cifra in continut.
  const scump = parseRules(cuPiese({ ...PIESE_BUNE, PERETE: { ...PIESE_BUNE.PERETE, cantitate: 21 } }))
  assert.equal(scump.ok, false, 'egalitatea e STRICTA, nu un plafon')
})

test('o piesa care nu incape intr-o mana e refuzata', () => {
  // Jobul de constructie are UN pas de ridicat. O piesa peste `haulCarryMax`
  // n-ar putea fi carata la santier niciodata — acelasi argument ca la
  // `haulCarryMax` vs `itemStackMax`.
  const reguli = { ...DEFAULT_RULES, haulCarryMax: 10 }
  const out = parseRules({ ...reguli, piese: PIESE_BUNE })
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.VALOARE_INVALIDA)
    assert.equal(out.params.max, 10)
  }
})

test('o piesa din AER sau APA e refuzata, si un material inexistent la fel', () => {
  const aer = parseRules(cuPiese({ ...PIESE_BUNE, PERETE: { ...PIESE_BUNE.PERETE, material: 'AER' } }))
  assert.equal(aer.ok, false)
  if (!aer.ok) assert.equal(aer.params.camp, 'piese.PERETE.material')
  const inexistent = parseRules(cuPiese({ ...PIESE_BUNE, PERETE: { ...PIESE_BUNE.PERETE, material: 'BRANZA' } }))
  assert.equal(inexistent.ok, false)
})

test('o piesa NECUNOSCUTA sau una lipsa sunt refuzate', () => {
  const inPlus = parseRules(cuPiese({ ...PIESE_BUNE, ACOPERIS: PIESE_BUNE.PERETE }))
  assert.equal(inPlus.ok, false)
  if (!inPlus.ok) {
    assert.equal(inPlus.reason, Reason.COMANDA_NECUNOSCUTA)
    assert.equal(inPlus.params.camp, 'piese.ACOPERIS')
  }
  const { SCARA: _fara, ...lipsa } = PIESE_BUNE
  const out = parseRules(cuPiese(lipsa))
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.LIPSA_MATERIAL)
    assert.equal(out.params.camp, 'piese.SCARA')
  }

  // Si santinela nu se poate numi in fisier: e absenta unei piese, nu o piesa.
  const cuSantinela = parseRules(cuPiese({ ...PIESE_BUNE, NICIUNA: PIESE_BUNE.PERETE }))
  assert.equal(cuSantinela.ok, false)
})

test('o grinda nu poate sprijini mai putin decat solul', () => {
  // `RULES_SPEC` le valideaza independent, deci fara invariantul asta constanta
  // poate fi pusa SUB plafon si nimic nu se inroseste — iar cand grinda
  // aterizeaza, „raza 10" ar micsora tacut regula in loc s-o largeasca.
  const out = parseRules({ ...DEFAULT_RULES, suportRazaGrinda: DEFAULT_RULES.suportMax - 1 })
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.VALOARE_INVALIDA)
    assert.equal(out.params.camp, 'suportRazaGrinda')
    assert.equal(out.params.min, DEFAULT_RULES.suportMax)
  }
  // Egal e permis: o grinda care sprijina exact cat solul e o alegere, nu o eroare.
  const egal = parseRules({ ...DEFAULT_RULES, suportRazaGrinda: DEFAULT_RULES.suportMax })
  assert.equal(egal.ok, true)
})

test('pragul de ridicare nu poate depasi stiva, si nu poate fi zero', () => {
  // Peste stiva, niciun morman n-ar mai fi sursa; la zero, praful ar fi sursa.
  const peste = parseRules({ ...DEFAULT_RULES, constructPickupMinUnits: DEFAULT_RULES.itemStackMax + 1 })
  assert.equal(peste.ok, false)
  if (!peste.ok) {
    assert.equal(peste.reason, Reason.VALOARE_INVALIDA)
    assert.equal(peste.params.camp, 'constructPickupMinUnits')
  }
  assert.equal(parseRules({ ...DEFAULT_RULES, constructPickupMinUnits: 0 }).ok, false)
  assert.equal(parseRules({ ...DEFAULT_RULES, constructPickupMinUnits: DEFAULT_RULES.itemStackMax }).ok, true, 'controlul: exact stiva trece')
})
