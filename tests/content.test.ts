import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_RULES, parseRules } from '../src/sim/content.ts'
import { Reason } from '../src/sim/result.ts'
import { createWorld } from '../src/sim/world.ts'
import { MM_PER_CELL } from '../src/sim/state.ts'
import { WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { esteMaterialDeStructura, isSolid, Material, MATERIAL_MAX } from '../src/sim/terrain/chunk.ts'
import { conductantaFetei } from '../src/sim/termic.ts'
import { ClasaDir, FelFata } from '../src/sim/fete.ts'

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
  GRINDA: { material: 'GRINDA', cantitate: 20, lucru: 500 },
  USA: { material: 'USA', cantitate: 20, lucru: 300 },
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

test('piesa GRINDA dintr-un alt material e refuzata; grinda de LEMN se face din digYield', () => {
  // Recenzia (CONT-2): `piese.GRINDA.material = LEMN_CONSTRUIT` trecea validarea, iar grinda nu
  // mai tinea nimic — previzualizarea promitea 12, se zideau 3.
  const brut = (): Record<string, any> => JSON.parse(readFileSync(new URL('../content/rules.json', import.meta.url), 'utf8'))
  const lemn = brut()
  lemn.piese.GRINDA = { ...lemn.piese.GRINDA, material: 'LEMN_CONSTRUIT', cantitate: 5 }
  const out = parseRules(lemn)
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.VALOARE_INVALIDA)
    assert.equal(out.params.camp, 'piese.GRINDA.material')
  }
  // Calea care merge: materialul ramane GRINDA, se schimba ce da (si deci ce costa).
  const buna = brut()
  buna.digYield.GRINDA = { fel: 'LEMN', cantitate: 5 }
  buna.piese.GRINDA = { ...buna.piese.GRINDA, cantitate: 5 }
  assert.equal(parseRules(buna).ok, true, 'grinda de lemn prin digYield trebuia acceptata')
})

test('raza grinzii are un plafon de COST: 16 trece, 17 nu', () => {
  // Recenzia (CONT-3): RULES_SPEC accepta 64, unde o sapatura de grinda costa 5 s.
  assert.equal(parseRules({ ...DEFAULT_RULES, suportRazaGrinda: 16 }).ok, true)
  const out = parseRules({ ...DEFAULT_RULES, suportRazaGrinda: 17 })
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.params.camp, 'suportRazaGrinda')
    assert.equal(out.params.max, 16)
  }
})

test('atingerea la zidire: cel putin un pas, cel mult pana deasupra capului', () => {
  // RULES_SPEC le valideaza independent; fara invariant, o atingere sub pas ar face
  // zidurile pe care pionul urca dar nu le poate continua, iar una peste cap ar zidi prin
  // tavanul de sub el.
  // Pas 2, atingere 1: fiecare valoare trece de RULES_SPEC, deci refuzul e al invariantului.
  const sub = parseRules({ ...DEFAULT_RULES, maxStepM: 2, atingereSusM: 1 })
  assert.equal(sub.ok, false)
  if (!sub.ok) {
    assert.equal(sub.params.camp, 'atingereSusM')
    assert.equal(sub.params.min, 2)
  }
  const peste = parseRules({ ...DEFAULT_RULES, atingereSusM: DEFAULT_RULES.agentHeadroomM + 1 })
  assert.equal(peste.ok, false)
  if (!peste.ok) {
    assert.equal(peste.reason, Reason.VALOARE_INVALIDA)
    assert.equal(peste.params.camp, 'atingereSusM')
    assert.equal(peste.params.max, DEFAULT_RULES.agentHeadroomM)
  }
  // Capetele sunt permise: pas = atingere si atingere = cap.
  assert.equal(parseRules({ ...DEFAULT_RULES, atingereSusM: DEFAULT_RULES.agentHeadroomM }).ok, true)
  assert.equal(parseRules({ ...DEFAULT_RULES, atingereSusM: DEFAULT_RULES.maxStepM }).ok, true)
})

test('pragul natural al accesului nu poate trece de plafonul total', () => {
  const out = parseRules({ ...DEFAULT_RULES, accesPlafonNatural: DEFAULT_RULES.accesPlafonTotal + 1 })
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.params.camp, 'accesPlafonNatural')
    assert.equal(out.params.max, DEFAULT_RULES.accesPlafonTotal)
  }
  assert.equal(parseRules({ ...DEFAULT_RULES, accesPlafonNatural: DEFAULT_RULES.accesPlafonTotal }).ok, true)
})

test('plafoanele accesului au un plafon de COST: 16384 trece, 16385 nu', () => {
  // O intrebare de acces e un flood de cel mult `accesPlafonTotal` celule; panoul a masurat
  // 5–14 ms la 8192. Fara plafon in RULES_SPEC, un 10^6 ar face o singura intrebare de
  // secunde, cu toate regulile „valide".
  assert.equal(parseRules({ ...DEFAULT_RULES, accesPlafonTotal: 16384 }).ok, true)
  const out = parseRules({ ...DEFAULT_RULES, accesPlafonTotal: 16385 })
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.params.camp, 'accesPlafonTotal')
    assert.equal(out.params.max, 16384)
  }
})

test('o piesa dintr-un material NATURAL e refuzata: un zid n-are voie sa arate ca teren', () => {
  const brut = (): Record<string, any> => JSON.parse(readFileSync(new URL('../content/rules.json', import.meta.url), 'utf8'))
  for (const natural of ['ROCA', 'PAMANT', 'IARBA', 'MOLOZ']) {
    const r = brut()
    r.piese.PERETE = { ...r.piese.PERETE, material: natural }
    // Invariantul „costa cat da inapoi" s-ar putea inrosi primul; il satisfacem, ca sa
    // se vada exact garda materialului.
    r.piese.PERETE.cantitate = r.digYield[natural].cantitate
    const out = parseRules(r)
    assert.equal(out.ok, false, `PERETE din ${natural} a trecut`)
    if (!out.ok) {
      assert.equal(out.params.camp, 'piese.PERETE.material')
      assert.equal(out.params.valoare, natural)
    }
  }
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

// ---------------------------------------------------------------------------
// temperatura (S24-27, taietura 2a): calendar, clima, termic
// ---------------------------------------------------------------------------

/** Fisierul de reguli, in forma lui (nume, fara tabele derivate), proaspat la fiecare apel. */
const fisier = (): Record<string, any> => JSON.parse(readFileSync(new URL('../content/rules.json', import.meta.url), 'utf8'))

test('fisierul de reguli si DEFAULT_RULES dau ACELASI obiect parsat — pe TOT obiectul, nu pe piese', () => {
  // Panoul temperaturii (L4-5): jocul ruleaza pe `DEFAULT_RULES`, testele citeau `rules.json` doar pe
  // `piese` — trei mutatii in fisier (`nevoiTicks`, `ticksPerSecond`, `dispozitieTicks`) treceau 128 de
  // teste. O cifra reglata de Andrei in fisier n-ar fi ajuns in joc, si nimic nu s-ar fi inrosit.
  const dinFisier = parseRules(fisier())
  const dinCod = parseRules({ ...DEFAULT_RULES })
  assert.ok(dinFisier.ok && dinCod.ok)
  if (!dinFisier.ok || !dinCod.ok) return
  assert.deepStrictEqual(dinFisier.value, dinCod.value)
  // Si fara dus-intors prin parser: forma livrata e chiar cea parsata.
  assert.deepStrictEqual(dinCod.value, DEFAULT_RULES)
})

test('calendar, clima, termic: o cheie NECUNOSCUTA e refuzata cu numele ei, si in valFrig', () => {
  const cazuri: [string, (r: Record<string, any>) => void][] = [
    ['calendar.zilePeAn', (r) => { r.calendar.zilePeAn = 16 }],
    ['clima.tMedie', (r) => { r.clima.tMedie = 9.4 }],
    ['clima.valFrig.durataOre', (r) => { r.clima.valFrig.durataOre = 24 }],
    ['termic.rSi', (r) => { r.termic.rSi = 130 }],
    ['termic.material.SUB_BAZA', (r) => { r.termic.material.SUB_BAZA = 340 }],
  ]
  for (const [camp, strica] of cazuri) {
    const r = fisier()
    strica(r)
    const out = parseRules(r)
    assert.equal(out.ok, false, camp)
    if (!out.ok) {
      assert.equal(out.reason, Reason.COMANDA_NECUNOSCUTA, camp)
      assert.equal(out.params.camp, camp)
    }
  }
})

test('clima: un numar cu virgula e refuzat — cifrele sunt intregi, cu unitatea in nume (m°C, mm)', () => {
  for (const [sectiune, camp, v] of [['clima', 'tMedieMc', 9.4], ['clima', 'dAdancMm', 2000.5], ['calendar', 'oraStart', 8.5], ['termic', 'rSeMiimi', 0.04]] as const) {
    const r = fisier()
    r[sectiune][camp] = v
    const out = parseRules(r)
    assert.equal(out.ok, false, `${sectiune}.${camp} = ${v}`)
    if (!out.ok) assert.equal(out.params.camp, `${sectiune}.${camp}`)
  }
  const lipsa = fisier()
  delete lipsa.clima.valFrig
  const out = parseRules(lipsa)
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.params.camp, 'clima.valFrig')
})

test('clima: tabelele solului sunt DERIVATE — calculate din D_a si D_s, iar un tabel scris de mana e refuzat', () => {
  // Fisierul nu le are, si le primeste; D_a schimbat da alt tabel.
  const r = fisier()
  r.clima.dAdancMm = 3000
  const out = parseRules(r)
  assert.ok(out.ok)
  if (out.ok) assert.notDeepEqual(out.value.clima.tabele.expAdancQ16, DEFAULT_RULES.clima.tabele.expAdancQ16)
  // Forma parsata cu tabelele altui D (sau cu un tabel atins) e refuzata: altfel ar fi crezut.
  const altD = parseRules({ ...DEFAULT_RULES, clima: { ...DEFAULT_RULES.clima, dAdancMm: 3000 } })
  assert.equal(altD.ok, false)
  if (!altD.ok) assert.equal(altD.params.camp, 'clima.tabele')
  const atins = { ...DEFAULT_RULES.clima.tabele, lagQ16: DEFAULT_RULES.clima.tabele.lagQ16.map((x, d) => (d === 7 ? x + 1 : x)) }
  const outAtins = parseRules({ ...DEFAULT_RULES, clima: { ...DEFAULT_RULES.clima, tabele: atins } })
  assert.equal(outAtins.ok, false)
  if (!outAtins.ok) assert.equal(outAtins.params.camp, 'clima.tabele')
})

test('clima.valFrig: rampa + platou + rampa incap intr-o zi, iar ziua valului e o zi a iernii', () => {
  const lung = fisier()
  lung.clima.valFrig.platouOre = 19
  const out = parseRules(lung)
  assert.equal(out.ok, false, '3 + 19 + 3 = 25 de ore')
  if (!out.ok) assert.equal(out.params.camp, 'clima.valFrig')
  const exact = fisier()
  exact.clima.valFrig = { ...exact.clima.valFrig, platouOre: 24, rampaOre: 0 }
  assert.equal(parseRules(exact).ok, true, 'controlul: 0 + 24 + 0 trece')
  for (const [ziMin, ziMax] of [[3, 2], [2, 5]]) {
    const r = fisier()
    r.clima.valFrig = { ...r.clima.valFrig, ziMin, ziMax }
    const z = parseRules(r)
    assert.equal(z.ok, false, `ziMin ${ziMin}, ziMax ${ziMax}`)
    if (!z.ok) assert.equal(z.params.camp, 'clima.valFrig.ziMax')
  }
  const rece = fisier()
  rece.clima.ziCeaMaiRece = 16
  const zr = parseRules(rece)
  assert.equal(zr.ok, false, 'anul are zilele 0..15')
  if (!zr.ok) assert.equal(zr.params.camp, 'clima.ziCeaMaiRece')
})

test('calendar: minutul e un numar intreg de tickuri, ziua de start incape in anotimp, anotimpul are nume', () => {
  const zi = fisier()
  zi.calendar.ziTicks = 40000
  const out = parseRules(zi)
  assert.equal(out.ok, false, '40.000 / 1.440 nu e intreg')
  if (!out.ok) assert.equal(out.params.camp, 'calendar.ziTicks')
  const start = fisier()
  start.calendar.ziStart = 5
  const s = parseRules(start)
  assert.equal(s.ok, false)
  if (!s.ok) assert.equal(s.params.camp, 'calendar.ziStart')
  for (const a of ['TOMNA', 7, 2.5]) {
    const r = fisier()
    r.calendar.anotimpStart = a
    const o = parseRules(r)
    assert.equal(o.ok, false, String(a))
    if (!o.ok) assert.equal(o.params.camp, 'calendar.anotimpStart')
  }
  // Numele din fisier si numarul din forma parsata dau acelasi calendar.
  const iarna = fisier()
  iarna.calendar.anotimpStart = 'IARNA'
  const oi = parseRules(iarna)
  assert.ok(oi.ok)
  if (oi.ok) assert.equal(oi.value.calendar.anotimpStart, 3)
})

test('termic.material: lungimea gresita a tabloului e refuzata, si un R pe AER sau APA la fel', () => {
  const scurt = parseRules({ ...DEFAULT_RULES, termic: { ...DEFAULT_RULES.termic, material: DEFAULT_RULES.termic.material.slice(0, 9) } })
  assert.equal(scurt.ok, false)
  if (!scurt.ok) {
    assert.equal(scurt.params.camp, 'termic.material')
    assert.equal(scurt.params.lungime, 9)
  }
  const apa = parseRules({ ...DEFAULT_RULES, termic: { ...DEFAULT_RULES.termic, material: DEFAULT_RULES.termic.material.map((r, i) => (i === 4 ? 100 : r)) } })
  assert.equal(apa.ok, false)
  if (!apa.ok) assert.equal(apa.params.camp, 'termic.material.APA')
  const aerInFisier = fisier()
  aerInFisier.termic.material.AER = 1
  const aer = parseRules(aerInFisier)
  assert.equal(aer.ok, false)
  if (!aer.ok) assert.equal(aer.params.camp, 'termic.material.AER')
})

test('termic.material: fiecare material SOLID e obligatoriu, cu R > 0 (R(USA) = 0 e refuzat)', () => {
  // Panoul, L3-5: IARBA (celula de suprafata a oricarei coloane) si LEMN_CONSTRUIT lipseau din tabel.
  for (const nume of ['IARBA', 'LEMN_CONSTRUIT', 'MOLOZ']) {
    const r = fisier()
    delete r.termic.material[nume]
    const out = parseRules(r)
    assert.equal(out.ok, false, nume)
    if (!out.ok) {
      assert.equal(out.reason, Reason.LIPSA_MATERIAL)
      assert.equal(out.params.camp, `termic.material.${nume}`)
    }
  }
  for (const v of [0, -340]) {
    const r = fisier()
    r.termic.material.USA = v
    const out = parseRules(r)
    assert.equal(out.ok, false, `R(USA) = ${v}`)
    if (!out.ok) {
      assert.equal(out.reason, Reason.VALOARE_INVALIDA)
      assert.equal(out.params.camp, 'termic.material.USA')
    }
  }
})

test('termic: garda 6·g_max < 1 — pe MUCHIE: implicitele dau 0,38; c_aer 459 refuzat, 460 trece; R_se nu conteaza; perechea verticala; ziua', () => {
  // Pasul de 1 Hz din t.2b: explicit doar pe muchiile camera–camera (rezervoarele, implicit — design §9; recenzia
  // t.2a, L2-2). G_max = 1/(min(2·R_si_lat, R_si_sus + R_si_jos) + R_min), fara R_se. dt = 20 de tickuri = 42,857 s,
  // c_aer = 1.210: 6 · 42,857 / (1.210 · 0,56) = 0,3795. Pragul pe hartie: c_aer > 6 · 42,857 / 0,56 = 459,18.
  // (Proba veche, „o usa de 72 de miimi", nu mai poate declansa garda: 0,26 + R(USA) > 0,2125 oricare ar fi R > 0.)
  const dt = DEFAULT_RULES.ticksPerSecond * (86400 / DEFAULT_RULES.calendar.ziTicks)
  assert.ok(Math.abs((6 * dt) / (DEFAULT_RULES.termic.cAerJPeK * 0.56) - 0.3795) < 0.0005, 'implicitele: 6·g_max = 0,3795')
  assert.equal(parseRules(fisier()).ok, true)
  const refuz = (r: Record<string, any>, sase: number, rFata: number, ce: string): void => {
    const o = parseRules(r)
    assert.equal(o.ok, false, ce)
    if (!o.ok) {
      assert.equal(o.reason, Reason.VALOARE_INVALIDA, ce)
      assert.equal(o.params.camp, 'termic.stabilitate', ce)
      assert.equal(o.params.rFataMiimi, rFata, ce)
      assert.equal(o.params.saseGMaxMiimi, sase, ce)
    }
  }
  const cu = (f: (r: Record<string, any>) => void): Record<string, any> => { const r = fisier(); f(r); return r }
  refuz(cu((r) => { r.termic.cAerJPeK = 459 }), 1000, 560, 'c_aer 459')
  assert.equal(parseRules(cu((r) => { r.termic.cAerJPeK = 460 })).ok, true, 'controlul: c_aer 460 trece (6·g_max = 0,998)')
  // R_se nu intra: nici 0, nici 10.000 nu muta pragul. Contraexemplul recenziei: R_se 1.000, c_aer 184 trecea garda
  // veche (0,998 pe fata EXT), cu muchia la 6g = 2,495.
  assert.equal(parseRules(cu((r) => { r.termic.cAerJPeK = 460; r.termic.rSeMiimi = 0 })).ok, true, 'R_se 0, c_aer 460')
  refuz(cu((r) => { r.termic.cAerJPeK = 459; r.termic.rSeMiimi = 10000 }), 1000, 560, 'R_se 10.000, c_aer 459')
  refuz(cu((r) => { r.termic.cAerJPeK = 184; r.termic.rSeMiimi = 1000 }), 2495, 560, 'R_se 1.000, c_aer 184')
  // Perechea verticala, cand e EA minima: R_si_lat 1.000 → 0,10 + 0,17 + 0,30 = 0,57; pragul 451,13.
  refuz(cu((r) => { r.termic.rSiLateralMiimi = 1000; r.termic.cAerJPeK = 451 }), 1000, 570, 'R_si_lat 1.000, c_aer 451')
  assert.equal(parseRules(cu((r) => { r.termic.rSiLateralMiimi = 1000; r.termic.cAerJPeK = 452 })).ok, true, 'R_si_lat 1.000, c_aer 452')
  // Garda citeste si ziua: cu ziua de doua ori mai scurta, pasul de 20 de tickuri tine de doua ori mai mult; pragul
  // se dubleaza (918,37).
  refuz(cu((r) => { r.calendar.ziTicks = 20160; r.termic.cAerJPeK = 918 }), 1000, 560, 'ziTicks 20.160, c_aer 918')
  assert.equal(parseRules(cu((r) => { r.calendar.ziTicks = 20160; r.termic.cAerJPeK = 919 })).ok, true, 'ziTicks 20.160, c_aer 919')
})

test('termic: garda == cea mai conductiva MUCHIE din conductantaFetei (ambele directii, pe o grila de continut)', () => {
  // Un singur adevar: garda trebuie sa spuna exact ce spune formula fetelor (termic.ts) despre muchia cea mai
  // conductiva prin o celula de R_min, pe cele trei clase. Acceptat ⇒ 6g < 1; refuzat ⇒ 6g ≥ 0,999 (rotunjirea Q16
  // a conductantei). Pe grila: R_se 0–10.000, cinci seturi de R_si (si cu perechea verticala minima), R(USA)
  // 1/72/300, trei lungimi de zi, c_aer in jurul pragului de pe muchie.
  let acc = 0
  let ref = 0
  for (const rSe of [0, 40, 1000, 10000]) for (const [lat, sus, jos] of [[130, 100, 170], [1000, 100, 170], [20, 500, 500], [1, 1, 1], [300, 10, 10]] as const) {
    for (const usa of [1, 72, 300]) for (const zi of [40320, 20160, 12960]) {
      const rMuchie = Math.min(2 * lat, sus + jos) + Math.min(usa, 340)
      const dt = (20 * 86400) / zi
      const cStar = (6 * dt * 1000) / rMuchie
      for (const cA of [Math.floor(cStar) - 1, Math.floor(cStar), Math.floor(cStar) + 2, Math.ceil(cStar * 1.3), 184, 1210]) {
        if (cA < 1) continue
        const r = fisier()
        r.termic.rSeMiimi = rSe
        r.termic.rSiLateralMiimi = lat
        r.termic.rSiSusMiimi = sus
        r.termic.rSiJosMiimi = jos
        r.termic.material.USA = usa
        r.calendar.ziTicks = zi
        r.termic.cAerJPeK = cA
        const o = parseRules(r)
        const reguli = parseRules({ ...r, termic: { ...r.termic, cAerJPeK: 10_000_000 } })
        assert.ok(reguli.ok, 'aceleasi reguli cu c_aer mare trebuie sa treaca')
        if (!reguli.ok) continue
        const t = reguli.value.termic
        // R_min ales AICI, pe toate materialele solide (independent de lista din content.ts).
        let mMin: number = Material.ROCA
        for (let m = 0; m <= MATERIAL_MAX; m++) if (isSolid(m) && t.material[m]! < t.material[mMin]!) mMin = m
        const numarari = new Array<number>(MATERIAL_MAX + 1).fill(0)
        numarari[mMin] = 1
        let gMax = 0
        for (const cl of [ClasaDir.SUS, ClasaDir.JOS, ClasaDir.LAT]) gMax = Math.max(gMax, conductantaFetei(t, cl, FelFata.MUCHIE, numarari) / 65536)
        const sase = (6 * gMax * dt) / cA
        const ctx = `rSe ${rSe} R_si ${lat}/${sus}/${jos} USA ${usa} zi ${zi} c_aer ${cA}: 6g_muchie = ${sase}`
        if (o.ok) {
          acc++
          assert.ok(sase < 1, `acceptat cu muchia instabila — ${ctx}`)
        } else {
          ref++
          assert.equal(o.params.camp, 'termic.stabilitate', ctx)
          assert.ok(sase >= 0.999, `refuzat cu muchia stabila — ${ctx}`)
        }
      }
    }
  }
  assert.ok(acc > 100 && ref > 100, `ambele ramuri exersate: ${acc} acceptate, ${ref} refuzate`)
})

test('nicio celula construita nu izoleaza mai bine decat 1 m de pamant (R ≤ R(PAMANT))', () => {
  // DESIGN §5.1: „Pamantul izoleaza mai bine decat o podea de lemn". Panoul (L3-5): cu R-ul lemnului,
  // o casa din GRINDA de piatra statea iarna la 22 °C, cea de piatra la 4 °C — un exploit vizibil.
  const R = DEFAULT_RULES.termic.material
  for (const m of [Material.PIATRA_CONSTRUITA, Material.GRINDA, Material.USA, Material.LEMN_CONSTRUIT]) {
    assert.ok(esteMaterialDeStructura(m))
    assert.ok(R[m]! <= R[Material.PAMANT]!, `materialul ${m}: R ${R[m]} > R(PAMANT) ${R[Material.PAMANT]}`)
  }
  // Toate materialele de structura sunt in lista de mai sus.
  for (let m = 0; m < R.length; m++) if (esteMaterialDeStructura(m)) assert.ok([Material.PIATRA_CONSTRUITA, Material.GRINDA, Material.USA, Material.LEMN_CONSTRUIT].includes(m as never), `material de structura nou: ${m}`)
})
