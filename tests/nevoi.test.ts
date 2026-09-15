/**
 * Foamea si odihna — S16-19, taietura 3, al doilea commit.
 *
 * Fiecare test de aici are mutatia lui in `scratchpad/mut-t3.mjs`. Cateva dintre
 * fixturi sunt construite ANUME ca sa atinga o cale pe care scenariul standard
 * n-o atinge niciodata: acolo pionii mananca imediat ce trec pragul de
 * preferinta, deci calea CRITICA (cea care intrerupe un job in curs) ar ramane
 * cod fara nicio rulare in spate.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { FelJob, Item, Nevoie, NEVOI, nevoiaInitiala, PasCara, PasNevoie } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { Reason } from '../src/sim/result.ts'
import { indexZone, Zona } from '../src/sim/zone.ts'
import { readFileSync } from 'node:fs'
import { existaTinta } from '../src/sim/joburi.ts'
import { verificaRezervari } from '../src/sim/rezervari.ts'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { desemneaza, laSit, lasaItem, panaCand, patratPlat, picteaza, R, ruleaza, solid } from './fixturi.ts'

/** Valoarea nevoii `n` a pionului din slotul dat. */
function nevoia(w: World, slot: number, n: number): number {
  return w.agents.nevoi[slot * NEVOI + n]!
}

/** Reguli cu ciclurile din JOC. Pentru testele in care ritmul real conteaza. */
function reguli(peste: Partial<Rules> = {}): Rules {
  const out = parseRules({ ...R, ...peste })
  assert.ok(out.ok, `reguli de test invalide: ${JSON.stringify(out)}`)
  return out.value
}

/** Reguli cu o nevoie fortata: cicluri scurte, ca un test sa incapa in cateva mii de tickuri. */
function reguliRapide(peste: Partial<Rules> = {}): Rules {
  const out = parseRules({ ...R, nevoiTicks: 10, ...peste })
  assert.ok(out.ok, `reguli de test invalide: ${JSON.stringify(out)}`)
  return out.value
}

// ---------------------------------------------------------------------------
// zero nu e valoare neutra
// ---------------------------------------------------------------------------

test('un pion se naste SATUL, si defazat fata de vecinii lui', () => {
  const { w } = laSit(3131, 6)
  for (let i = 0; i < 6; i++) {
    for (let n = 0; n < NEVOI; n++) {
      const v = nevoia(w, i, n)
      assert.ok(v > R.nevoi[n]!.prag, `pionul ${i}, nevoia ${n}: ${v} — nascut deja sub pragul de ${R.nevoi[n]!.prag}`)
      assert.ok(v <= R.nevoieMax, `pionul ${i}, nevoia ${n}: ${v} peste maxim`)
    }
  }
  // Si DEFAZAT: cu toti la aceeasi valoare, toata colonia ar trece pragul in
  // aceeasi fereastra, fiecare masa ar adauga exact cat celorlalti, si valul nu
  // s-ar sparge niciodata.
  const foame = new Set<number>()
  for (let i = 0; i < 6; i++) foame.add(nevoia(w, i, Nevoie.FOAME))
  assert.ok(foame.size >= 5, `doar ${foame.size} valori distincte de foame la 6 pioni: colonia porneste in lockstep`)
})

test('un slot REUTILIZAT nu mosteneste foamea mortului', () => {
  const { w } = laSit(3131, 1)
  const rules = reguliRapide()
  // Il flamanzim pe primul, apoi il omoram si nastem altul in acelasi slot.
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 3
  w.agents.nevoi[0 * NEVOI + Nevoie.ODIHNA] = 3
  w.agents.nevoieReincercaLaTick[0 * NEVOI + Nevoie.FOAME] = 999999
  const id = w.agents.id[0]!
  assert.ok(applyCommand(w, { kind: 'killAgent', id }, rules).ok)
  const x = w.agents.x[0]!
  const y = w.agents.y[0]!
  const z = w.agents.z[0]!
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x, y, z, faction: 0 }, rules).ok)
  assert.equal(w.agents.count, 1, 'fixtura: slotul chiar s-a reutilizat')

  for (let n = 0; n < NEVOI; n++) {
    assert.ok(nevoia(w, 0, n) > rules.nevoi[n]!.prag, `nevoia ${n} mostenita de la mort: ${nevoia(w, 0, n)}`)
    assert.equal(w.agents.nevoieReincercaLaTick[0 * NEVOI + n], 0, `racirea ${n} mostenita de la mort`)
  }
})

test('nevoiaInitiala e o functie pura de id, fara RNG, si sta peste prag', () => {
  const vazute = new Set<number>()
  for (let id = 1; id <= 200; id++) {
    const v = nevoiaInitiala(id, Nevoie.FOAME, R.nevoieMax, R.nevoieFazaPas, R.nevoieFazaSpan)
    assert.equal(v, nevoiaInitiala(id, Nevoie.FOAME, R.nevoieMax, R.nevoieFazaPas, R.nevoieFazaSpan), 'nu e pura')
    assert.ok(v > R.nevoi[Nevoie.FOAME]!.prag && v <= R.nevoieMax, `id ${id}: ${v} in afara intervalului`)
    vazute.add(v)
  }
  // Imprastiere reala, nu doua-trei valori.
  assert.ok(vazute.size > 150, `doar ${vazute.size} valori distincte la 200 de id-uri`)
})

// ---------------------------------------------------------------------------
// foamea
// ---------------------------------------------------------------------------

/** Un pion, mancare la cativa pasi, si nimic altceva de facut. */
function fixturaMancare(seed: number, cant = 75, d = 3): { w: World; item: number; cx: number; cy: number } {
  const { w } = laSit(seed, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const item = lasaItem(w, Item.HRANA, cant, cx + d, cy)
  return { w, item, cx, cy }
}

test('un pion flamand cauta mancare, o mananca si se satura', () => {
  const { w } = fixturaMancare(8801)
  const rules = reguliRapide()
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 300 // sub prag (400), peste critic (150)

  const t = panaCand(w, 4000, (ww) => ww.agents.jobKind[0] === FelJob.MANANCA, rules)
  assert.notEqual(t, -1, 'pionul flamand n-a pornit niciun job de mancat')

  // Se satura pana PESTE prag, nu exact la maxim: rezerva la start cat ii lipsea
  // atunci (`ceil(lipsa / nutritie)` unitati), iar cat mananca foamea mai scade
  // putin. Masurat pe fixtura asta: 300 → 891 din 47 de unitati. Sa ceara exact
  // `nevoieMax` ar insemna fie sa re-rezerve in timpul mesei, fie sa inghete o
  // cantitate mai mare decat ii trebuie — si atunci ultimul morman al asezarii
  // ar fi blocat de primul care se aseaza langa el.
  const sfarsit = panaCand(w, 8000, (ww) => ww.agents.jobKind[0] === FelJob.NICIUNUL && ww.agents.jobConsumat[0]! > 0, rules)
  assert.notEqual(sfarsit, -1, `jobul de mancat nu s-a incheiat: foame=${nevoia(w, 0, Nevoie.FOAME)}`)
  assert.ok(nevoia(w, 0, Nevoie.FOAME) > rules.nevoi[Nevoie.FOAME]!.prag, `dupa masa e tot sub prag: ${nevoia(w, 0, Nevoie.FOAME)}`)
  assert.equal(w.rezervari.total, 0, 'si nu lasa rezervari in urma')
})

test('mancarea se CONSUMA: unitatile ies din morman, nu apar din nimic', () => {
  const { w, item } = fixturaMancare(8801)
  const rules = reguliRapide()
  const inainte = w.iteme.cantitate[0]!
  assert.equal(inainte, 75)
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 100

  const t = ruleaza(w, 6000, rules)
  const dupa = w.iteme.count > 0 && w.iteme.alive[0] === 1 ? w.iteme.cantitate[0]! : 0
  const lipsa = inainte - dupa
  assert.ok(lipsa > 0, 'n-a mancat nimic')
  assert.equal(t.unitatiMancate, lipsa, 'contorul si mormanul trebuie sa spuna acelasi lucru')
  // Nutritia e PE UNITATE: cat a crescut foamea = unitati x nutritie, plafonat.
  const crestere = nevoia(w, 0, Nevoie.FOAME) - 100 + (t.unitatiMancate * rules.nutritie[Item.HRANA]! - (rules.nevoieMax - 100))
  void crestere
  assert.ok(nevoia(w, 0, Nevoie.FOAME) <= rules.nevoieMax, 'foamea nu poate trece de maxim')
  void item
})

test('un pion nu mananca dintr-un morman NECOMESTIBIL', () => {
  const { w } = laSit(8802, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.PIATRA, 75, cx + 3, cy)
  const rules = reguliRapide()
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 100

  const t = ruleaza(w, 3000, rules)
  assert.equal(t.unitatiMancate, 0, 'piatra nu se mananca')
  assert.equal(w.iteme.cantitate[0], 75, 'si mormanul ramane intreg')
  // Si nevoia se raceste in loc sa bucleze.
  assert.ok(w.ratiune.nevoiNerezolvate > 0, 'o nevoie fara tinta trebuie sa se declare nerezolvata')
  assert.ok(w.ratiune.nevoiNerezolvate <= 3000 / rules.nevoieRetryTicks + 2, `${w.ratiune.nevoiNerezolvate} reincercari: racirea nu leaga`)
})

test('nevoia NEREZOLVABILA nu blocheaza munca: pionul se intoarce la sapat', () => {
  // Fara mancare in toata asezarea, dar cu de lucru. Fara racire, pionul ar
  // intrerupe, ar cauta, n-ar gasi si ar relua — la nesfarsit, si fara ca vreun
  // zavor existent sa vada ceva.
  const { w } = laSit(8803, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [0, 3]] as const) desemneaza(w, cx + dx, cy + dy)
  const rules = reguliRapide()
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 10 // SUB pragul critic

  const t = ruleaza(w, 4000, rules)
  assert.ok(t.joburiTerminate > 0, `zero voxeli sapati in 4000 de tickuri: nevoia nerezolvabila a blocat munca (${JSON.stringify({ pornite: t.joburiPornite, nevoie: t.joburiDeNevoie })})`)
  // `joburiDeNevoie` numara SI somnul, iar somnul reuseste mereu (pe jos): se
  // asserteaza deci consumul, care e singurul lucru imposibil fara mancare.
  assert.equal(t.unitatiMancate, 0, 'fara mancare nu se poate manca nimic')
  assert.equal(w.ratiune.joburiFaraProgres, 0, 'si niciun job nu s-a incheiat degeaba')
})

test('foamea CRITICA intrerupe un job in curs — dar numai daca are ce manca', () => {
  // Calea pe care scenariul standard n-o atinge niciodata: acolo pionii mananca
  // la pragul de preferinta si nu ajung nici pe departe la cel critic.
  const { w } = laSit(8804, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.HRANA, 75, cx + 2, cy)
  for (const [dx, dy] of [[-3, 0], [0, -3], [-4, 0]] as const) desemneaza(w, cx + dx, cy + dy)
  // `nevoiTicks` RAMANE cel din joc (250), si asta e tot rostul fixturii:
  // pragurile se verifica la FIECARE tick, nu la ticul de nevoie. Cu verificarea
  // pe ticul de nevoie, un pion care devine critic imediat DUPA ticul lui ar
  // astepta pana la 250 de tickuri — iar momentul „liber SI pe tic de nevoie" e
  // o coincidenta de ~1 la 250, deci pragul de preferinta nu s-ar declansa
  // practic niciodata si tot jocul s-ar juca pe calea cu intreruperi.
  // Ciclul de nevoie e LUNG aici, si asta e tot rostul fixturii: verificarea
  // pragurilor e la FIECARE tick, nu la ticul de nevoie. Cu verificarea pe ticul
  // de nevoie, un pion care devine critic imediat dupa ticul lui ar astepta un
  // ciclu intreg — iar momentul „liber SI pe tic de nevoie" e o coincidenta de
  // ~1 la `nevoiTicks`, deci pragul de preferinta nu s-ar declansa practic
  // niciodata si tot jocul s-ar juca pe calea cu intreruperi.
  const rules = reguli({ nevoiTicks: 5000 })

  // Intai il lasam sa apuce un job de sapat, satul.
  const cuJob = panaCand(w, 2000, (ww) => ww.agents.jobKind[0] === FelJob.SAPA, rules)
  assert.notEqual(cuJob, -1, 'fixtura: n-a apucat un job de sapat')
  const jobVechi = w.agents.jobId[0]!

  // Si abia acum ii dam foame CRITICA.
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 20
  const FEREASTRA = 20
  // Fixtura e valida doar daca urmatorul tic de nevoie e DINCOLO de fereastra —
  // altfel testul ar trece si cu verificarea pe ticul de nevoie, adica vid.
  const panaLaTic = (rules.nevoiTicks - ((w.tick + w.agents.id[0]!) % rules.nevoiTicks)) % rules.nevoiTicks
  assert.ok(panaLaTic > FEREASTRA, `fixtura: urmatorul tic de nevoie e peste ${panaLaTic} tickuri, in fereastra`)
  const t = panaCand(w, FEREASTRA, (ww) => ww.agents.jobKind[0] === FelJob.MANANCA, rules)
  assert.notEqual(t, -1, `foamea critica trebuia sa intrerupa jobul in ${FEREASTRA} de tickuri, nu la urmatorul tic de nevoie (${rules.nevoiTicks})`)
  assert.notEqual(w.agents.jobId[0], jobVechi, 'e alt job')
  assert.equal(w.ratiune.intreruperiDeNevoie, 1, 'si intreruperea trebuie NUMARATA')
})

test('foamea sub prag (nu critica) NU intrerupe un job in curs', () => {
  const { w } = laSit(8804, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.HRANA, 75, cx + 2, cy)
  for (const [dx, dy] of [[-3, 0], [0, -3], [-4, 0]] as const) desemneaza(w, cx + dx, cy + dy)
  const rules = reguliRapide({ nevoiTicks: 100000 }) // fara scurgere in intervalul testului

  const cuJob = panaCand(w, 2000, (ww) => ww.agents.jobKind[0] === FelJob.SAPA, rules)
  assert.notEqual(cuJob, -1, 'fixtura: n-a apucat un job de sapat')
  const jobVechi = w.agents.jobId[0]!
  // SUB prag (400), PESTE critic (150): „prefera", nu „intrerupe".
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 300

  for (let i = 0; i < 40; i++) {
    if (w.agents.jobKind[0] !== FelJob.SAPA) break
    ruleaza(w, 1, rules)
  }
  assert.equal(w.agents.jobId[0], jobVechi, 'pragul de preferinta NU are voie sa intrerupa un job in curs')
  assert.equal(w.ratiune.intreruperiDeNevoie, 0)
})

test('un pion cu marfa in mana NU se intrerupe: marfa nu se pierde', () => {
  // Singurul caz in care intreruperea poate DISTRUGE marfa (`asazaItem` poate
  // sa n-aiba unde), iar munca ramasa e marginita prin constructie.
  const { w, sit } = laSit(8805, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.PIATRA, 40, cx + 2, cy)
  lasaItem(w, Item.HRANA, 75, cx + 1, cy + 1)
  const p = patratPlat(w, sit, 2, 10, 40)
  assert.ok(p, 'fixtura: niciun patrat plat')
  picteaza(w, p.x0, p.y0, 2)
  const rules = reguliRapide({ nevoiTicks: 100000 })

  const t = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.CARA && ww.agents.jobStep[0]! >= PasCara.MERGE_DEST, rules)
  assert.notEqual(t, -1, 'fixtura: pionul n-a ajuns sa care cu marfa in mana')
  const jobVechi = w.agents.jobId[0]!
  assert.ok(w.agents.caraCantitate[0]! > 0, 'fixtura: mana trebuie sa fie plina')

  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 10 // critica
  for (let i = 0; i < 30; i++) {
    if (w.agents.jobKind[0] !== FelJob.CARA) break
    ruleaza(w, 1, rules)
  }
  assert.equal(w.agents.jobId[0], jobVechi, 'un carat cu mana plina nu se intrerupe pentru foame')
  assert.equal(w.ratiune.intreruperiDeNevoie, 0)
})

test('jobul de mancat NU se auto-intrerupe la fiecare verificare', () => {
  // Mancarea e departe, deci drumul tine mai multe tici de nevoie. Fara clauza
  // „deja o rezolv pe asta", pionul si-ar arunca jobul la fiecare verificare si
  // n-ar ajunge niciodata la mancare.
  const { w } = laSit(8806, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.HRANA, 75, cx + 12, cy)
  const rules = reguliRapide({ nevoiTicks: 5 })
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 60 // critica, si scade repede

  const t = panaCand(w, 2000, (ww) => ww.agents.jobKind[0] === FelJob.MANANCA, rules)
  assert.notEqual(t, -1, 'n-a pornit jobul de mancat')
  const jobId = w.agents.jobId[0]!
  const ajuns = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.MANANCA && ww.agents.jobStep[0] === PasNevoie.CONSUMA, rules)
  assert.notEqual(ajuns, -1, 'n-a ajuns niciodata la mancare: si-a aruncat jobul pe drum')
  assert.equal(w.agents.jobId[0], jobId, 'si e ACELASI job, nu al saptelea')
  // Si NICIO racire scrisa pe nevoia pe care tocmai o rezolva.
  //
  // Asta e ce desparte cu adevarat cele doua variante, si s-a aflat masurand:
  // fara clauza „deja o rezolv", pionul TOT ajunge la mancare — cautarea lui
  // esueaza pe `poateRezerva`, fiindca isi tine deja singur rezervarea — dar
  // esecul ala se scrie ca racire pe (pion, FOAME). Adica jobul supravietuieste,
  // si pionul iese din masa cu o nevoie pusa in asteptare pentru sute de tickuri
  // fara niciun motiv.
  assert.equal(w.agents.nevoieReincercaLaTick[0 * NEVOI + Nevoie.FOAME], 0, 'nevoia pe care o rezolva chiar acum n-are ce cauta in racire')
  assert.equal(w.ratiune.nevoiNerezolvate, 0, 'si nici in contorul de nevoi nerezolvate')
})

// ---------------------------------------------------------------------------
// odihna
// ---------------------------------------------------------------------------

test('un pion obosit se duce la pat si se odihneste', () => {
  const { w, sit } = laSit(7701, 1)
  const p = patratPlat(w, sit, 2, 4, 20)
  assert.ok(p, 'fixtura: niciun patrat plat')
  const zona = picteaza(w, p.x0, p.y0, 2, 3, R, Zona.DORMIT)
  const rules = reguliRapide()
  w.agents.nevoi[0 * NEVOI + Nevoie.ODIHNA] = 100

  const t = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.DOARME, rules)
  assert.notEqual(t, -1, 'pionul obosit n-a pornit niciun job de dormit')
  assert.notEqual(w.agents.jobDest[0], 0, 'cu un dormitor liber, trebuie sa aleaga un PAT, nu podeaua')

  const odihnit = panaCand(w, 20000, (ww) => nevoia(ww, 0, Nevoie.ODIHNA) >= rules.nevoieMax, rules)
  assert.notEqual(odihnit, -1, `nu s-a odihnit complet: ${nevoia(w, 0, Nevoie.ODIHNA)}`)
  assert.equal(w.agents.jobKind[0], FelJob.NICIUNUL, 'somnul trebuie sa se incheie')
  assert.equal(w.rezervari.total, 0, 'si patul sa se elibereze')
  void zona
})

test('fara pat liber, pionul doarme PE LOC — somnul reuseste mereu', () => {
  const { w } = laSit(7702, 1)
  const rules = reguliRapide()
  w.agents.nevoi[0 * NEVOI + Nevoie.ODIHNA] = 100

  const t = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.DOARME, rules)
  assert.notEqual(t, -1, 'fara dormitor, pionul trebuie totusi sa doarma')
  assert.equal(w.agents.jobDest[0], 0, 'pe loc inseamna fara celula de zona')
  assert.equal(w.rezervari.total, 0, 'si fara rezervare: nu exista entitate de rezervat')

  const odihnit = panaCand(w, 20000, (ww) => nevoia(ww, 0, Nevoie.ODIHNA) >= rules.nevoieMax, rules)
  assert.notEqual(odihnit, -1, 'somnul pe jos trebuie sa refaca odihna la fel')
})

test('doi pioni nu dorm in acelasi pat', () => {
  const { w, sit } = laSit(7703, 2)
  const p = patratPlat(w, sit, 1, 4, 20)
  assert.ok(p, 'fixtura: niciun patrat plat')
  picteaza(w, p.x0, p.y0, 1, 3, R, Zona.DORMIT) // UN singur pat
  const rules = reguliRapide()
  w.agents.nevoi[0 * NEVOI + Nevoie.ODIHNA] = 100
  w.agents.nevoi[1 * NEVOI + Nevoie.ODIHNA] = 100

  const t = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.DOARME && ww.agents.jobKind[1] === FelJob.DOARME, rules)
  assert.notEqual(t, -1, 'amandoi trebuiau sa doarma (unul in pat, unul pe jos)')
  const cuPat = [0, 1].filter((i) => w.agents.jobDest[i] !== 0)
  assert.equal(cuPat.length, 1, `${cuPat.length} pioni au luat patul: un pat, un dormitor`)
  assert.ok(verificaRezervari(w.rezervari, w.agents, existaTinta(w)).ok)
})

test('somnul REFACE odihna doar cand pionul chiar doarme, nu pe drum', () => {
  const { w, sit } = laSit(7704, 1)
  const p = patratPlat(w, sit, 2, 12, 30)
  assert.ok(p, 'fixtura: niciun patrat plat')
  picteaza(w, p.x0, p.y0, 2, 3, R, Zona.DORMIT)
  const rules = reguliRapide({ nevoiTicks: 4 })
  w.agents.nevoi[0 * NEVOI + Nevoie.ODIHNA] = 200

  const peDrum = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.DOARME && ww.agents.jobStep[0] === PasNevoie.MERGE, rules)
  assert.notEqual(peDrum, -1, 'fixtura: n-a pornit spre pat')
  const laPlecare = nevoia(w, 0, Nevoie.ODIHNA)
  // Cat merge, odihna SCADE — altfel patul n-ar mai avea niciun rost.
  const ajuns = panaCand(w, 3000, (ww) => ww.agents.jobStep[0] === PasNevoie.CONSUMA, rules)
  assert.notEqual(ajuns, -1, 'n-a ajuns la pat')
  assert.ok(nevoia(w, 0, Nevoie.ODIHNA) < laPlecare, 'odihna n-are voie sa creasca pe drum')
  // Si de cand doarme, creste.
  const inPat = nevoia(w, 0, Nevoie.ODIHNA)
  ruleaza(w, 200, rules)
  assert.ok(nevoia(w, 0, Nevoie.ODIHNA) > inPat, 'odihna trebuie sa creasca in somn')
})

test('stergerea dormitorului INTRERUPE somnul, nu lasa pionul pe o celula moarta', () => {
  const { w, sit } = laSit(7705, 1)
  const p = patratPlat(w, sit, 2, 4, 20)
  assert.ok(p, 'fixtura: niciun patrat plat')
  const zona = picteaza(w, p.x0, p.y0, 2, 3, R, Zona.DORMIT)
  const rules = reguliRapide()
  w.agents.nevoi[0 * NEVOI + Nevoie.ODIHNA] = 100

  const t = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.DOARME && ww.agents.jobStep[0] === PasNevoie.CONSUMA, rules)
  assert.notEqual(t, -1, 'fixtura: n-a ajuns sa doarma in pat')
  assert.notEqual(w.agents.jobDest[0], 0, 'fixtura: trebuie sa fie intr-un pat, nu pe jos')

  assert.ok(applyCommand(w, { kind: 'stergeZona', id: zona }, rules).ok)
  assert.equal(w.agents.jobKind[0], FelJob.NICIUNUL, 'somnul trebuia intrerupt cand patul dispare')
  assert.equal(w.rezervari.total, 0, 'si rezervarea lui sa dispara')
  assert.ok(verificaRezervari(w.rezervari, w.agents, existaTinta(w)).ok)
})

// ---------------------------------------------------------------------------
// save / load
// ---------------------------------------------------------------------------

test('M5: un pion care MANANCA supravietuieste roundtrip-ului', () => {
  const { w } = fixturaMancare(9901)
  const rules = reguliRapide()
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 200
  const t = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.MANANCA && ww.agents.jobStep[0] === PasNevoie.CONSUMA, rules)
  assert.notEqual(t, -1, 'fixtura: n-a ajuns sa manance')

  const out = decode(encode(w), rules)
  assert.ok(out.ok, `incarcare refuzata: ${JSON.stringify(out)}`)
  const l = out.value
  assert.equal(l.rezervari.anulateLaIncarcare, 0, 'jobul de mancat NU are voie sa fie anulat la incarcare')
  assert.equal(l.agents.jobKind[0], FelJob.MANANCA)
  assert.equal(hashWorld(l), hashWorld(w), 'lumea incarcata trebuie sa fie identica')

  // Si evolueaza identic: 1000 + save + load + 1000 == 2000.
  const continuu = decode(encode(w), rules)
  assert.ok(continuu.ok)
  ruleaza(w, 1000, rules)
  ruleaza(continuu.value, 1000, rules)
  assert.equal(hashWorld(continuu.value), hashWorld(w), 'lumea incarcata a divergat de cea continua')
})

test('M5: un pion care DOARME intr-un pat supravietuieste roundtrip-ului', () => {
  const { w, sit } = laSit(9902, 1)
  const p = patratPlat(w, sit, 2, 4, 20)
  assert.ok(p, 'fixtura: niciun patrat plat')
  picteaza(w, p.x0, p.y0, 2, 3, R, Zona.DORMIT)
  const rules = reguliRapide()
  w.agents.nevoi[0 * NEVOI + Nevoie.ODIHNA] = 150
  const t = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === FelJob.DOARME && ww.agents.jobStep[0] === PasNevoie.CONSUMA, rules)
  assert.notEqual(t, -1, 'fixtura: n-a ajuns sa doarma')
  assert.notEqual(w.agents.jobDest[0], 0, 'fixtura: trebuie sa fie intr-un pat')

  const out = decode(encode(w), rules)
  assert.ok(out.ok, `incarcare refuzata: ${JSON.stringify(out)}`)
  assert.equal(out.value.rezervari.anulateLaIncarcare, 0, 'somnul NU are voie sa fie anulat la incarcare')
  assert.equal(out.value.rezervari.total, 1, 'si patul trebuie sa ramana rezervat')
  assert.equal(hashWorld(out.value), hashWorld(w))

  ruleaza(w, 1000, rules)
  ruleaza(out.value, 1000, rules)
  assert.equal(hashWorld(out.value), hashWorld(w), 'lumea incarcata a divergat de cea continua')
})

test('nevoile intra in hash: o foame diferita e o lume diferita', () => {
  const { w } = laSit(9903, 2)
  const h = hashWorld(w)
  w.agents.nevoi[1 * NEVOI + Nevoie.FOAME] = w.agents.nevoi[1 * NEVOI + Nevoie.FOAME]! - 1
  assert.notEqual(hashWorld(w), h, 'nevoile sunt PERSISTED, deci trebuie sa fie in hash')
  w.agents.nevoi[1 * NEVOI + Nevoie.FOAME] = w.agents.nevoi[1 * NEVOI + Nevoie.FOAME]! + 1
  assert.equal(hashWorld(w), h)
  w.agents.nevoieReincercaLaTick[0 * NEVOI + Nevoie.ODIHNA] = 7
  assert.notEqual(hashWorld(w), h, 'si racirea de nevoi la fel')
})

test('migrarea 4 -> 5: nevoile se umplu DEFAZAT, nu cu zero si nu in lockstep', () => {
  // Fixtura golden de schema 4, capturata inainte de taietura asta.
  const brut = JSON.parse(readFileSync(new URL('./fixtures/save-schema4.json', import.meta.url), 'utf8')) as { schema: number }
  assert.equal(brut.schema, 4, 'fixtura trebuie sa fie de schema 4')
  const out = decode(JSON.stringify(brut), R)
  assert.ok(out.ok, `migrarea 4 -> 5 a picat: ${JSON.stringify(out)}`)
  const l = out.value

  const foame = new Set<number>()
  for (let i = 0; i < l.agents.count; i++) {
    if (l.agents.alive[i] === 0) continue
    for (let n = 0; n < NEVOI; n++) {
      const v = l.agents.nevoi[i * NEVOI + n]!
      assert.ok(v > R.nevoi[n]!.prag, `pionul ${i}, nevoia ${n}: ${v} — migrat deja sub prag`)
      assert.equal(l.agents.nevoieReincercaLaTick[i * NEVOI + n], 0)
    }
    foame.add(l.agents.nevoi[i * NEVOI + Nevoie.FOAME]!)
  }
  assert.ok(l.agents.count >= 3, 'fixtura: cel putin trei pioni')
  assert.equal(foame.size, l.agents.count, 'nevoile migrate trebuie sa fie DEFAZATE, nu toate egale')

  // Si joburile de carat din fixtura trebuie sa supravietuiasca migrarii.
  assert.equal(l.rezervari.anulateLaIncarcare, 0, 'migrarea nu are voie sa anuleze joburile in curs')

  // Idempotenta: rescris de codul nou si reincarcat, acelasi hash.
  const iar = decode(encode(l), R)
  assert.ok(iar.ok)
  assert.equal(hashWorld(iar.value), hashWorld(l), 'migrarea nu e idempotenta')
})

// ---------------------------------------------------------------------------
// content
// ---------------------------------------------------------------------------

test('regulile refuza o lume in care foamea nu se poate satisface niciodata', () => {
  // Un tabel de nutritie cu toate zero trece FIECARE validare de camp si produce
  // o colonie care cauta mancare la nesfarsit si moare de foame in tacere.
  const fara = parseRules({ ...R, nutritie: [0, 0, 0, 0] })
  assert.equal(fara.ok, false)
  if (!fara.ok) {
    assert.equal(fara.reason, Reason.VALOARE_INVALIDA)
    assert.equal(fara.params.camp, 'nutritie')
  }
})

test('regulile refuza praguri inversate si o defazare care naste pioni flamanzi', () => {
  const inversat = parseRules({ ...R, nevoi: [{ scurgere: 6, prag: 100, pragCritic: 400 }, R.nevoi[1]!] })
  assert.equal(inversat.ok, false, 'pragul critic trebuie sa fie STRICT sub prag')

  const egal = parseRules({ ...R, nevoi: [{ scurgere: 6, prag: 400, pragCritic: 400 }, R.nevoi[1]!] })
  assert.equal(egal.ok, false, 'egale inseamna ca „prefera\" nu exista ca stare distincta')

  const moarta = parseRules({ ...R, nevoi: [{ scurgere: 0, prag: 400, pragCritic: 150 }, R.nevoi[1]!] })
  assert.equal(moarta.ok, false, 'o nevoie care nu scade niciodata e un sistem mort')

  // Defazarea nu are voie sa coboare sub prag: `nevoieMax − (fazaSpan − 1)`.
  const preaLarg = parseRules({ ...R, nevoieFazaSpan: 700 })
  assert.equal(preaLarg.ok, false)
  if (!preaLarg.ok) assert.equal(preaLarg.params.camp, 'nevoieFazaSpan')
  assert.ok(parseRules({ ...R, nevoieFazaSpan: 600 }).ok, '600 lasa nevoia in 401..1000, peste pragul de 400')

  // Si o portie mai mare decat un morman n-ar lega niciodata.
  assert.equal(parseRules({ ...R, portieMancare: R.itemStackMax + 1 }).ok, false)
})

test('indexul de comestibile vede DOAR mancarea, si se reface cand ea dispare', () => {
  const { w } = laSit(6006, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.PIATRA, 20, cx + 3, cy)
  lasaItem(w, Item.HRANA, 20, cx + 4, cy)
  lasaItem(w, Item.PAMANT, 20, cx + 5, cy)
  const ix = indexZone(w, R)
  assert.equal(ix.comestibile.length, 1, 'doar hrana e comestibila')
  assert.equal(w.iteme.kind[ix.comestibile[0]!], Item.HRANA)

  const rules = reguliRapide()
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 100
  ruleaza(w, 4000, rules)
  assert.equal(indexZone(w, rules).comestibile.length, 0, 'mancarea consumata trebuie sa iasa din index')
  assert.equal(solid(w, cx + 3, cy) !== null, true)
})
