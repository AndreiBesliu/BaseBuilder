/**
 * UI-ul de joc, partea PURA (viewer/ui/*.ts si viewer/tinta.ts, fara DOM si fara three): textele
 * „De ce nu?", numele pionilor, uneltele-dreptunghi, alertele, plicul salvarii, modul de pornire,
 * tastele, tinta clicului. Lumea se intreaba prin functii, deci scenele se construiesc fara teren.
 *
 * Oracolele sunt valori scrise pe hartie (perimetrul unui dreptunghi, cifrele unei grinzi, URL-urile
 * lansatoarelor de gate), nu raspunsul functiei testate: altfel testul ar fi autoconsistent.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { Reason } from '../src/sim/result.ts'
import type { ReasonCode } from '../src/sim/result.ts'
import { DetaliuMotiv } from '../src/sim/desemnari.ts'
import { DetaliuItem } from '../src/sim/iteme.ts'
import { FelJob, Item, PasCara, Piesa } from '../src/sim/state.ts'
import { MATERIAL_MAX } from '../src/sim/terrain/chunk.ts'
import { NUME_MATERIAL, textActivitate, textGeneric, textMotiv, textNumar, textPrioritatePersonala, textSprijin, textTimp } from '../viewer/ui/texte.ts'
import type { SursaMotiv } from '../viewer/ui/texte.ts'
import { FAMILII, numePion, PRENUME } from '../viewer/ui/nume.ts'
import { coloane, normalizeaza, planDreptunghi, Unealta } from '../viewer/ui/dreptunghi.ts'
import type { Dreptunghi, Lumea, Optiuni } from '../viewer/ui/dreptunghi.ts'
import { actualizeaza, creeazaAlerte, eveniment, JURNAL_MAX, Severitate } from '../viewer/ui/alerte.ts'
import type { RegulaAlerta, Semnal } from '../viewer/ui/alerte.ts'
import { eTimpulSalvariiAutomate, FORMAT_SALVARE, numeFisier, valideazaSalvare } from '../viewer/ui/salvari-plic.ts'
import { HRANA_PE_OM, modPornire, parametriJocNou } from '../viewer/ui/pornire.ts'
import { actiuneTasta } from '../viewer/ui/taste.ts'
import type { IntrareTasta } from '../viewer/ui/taste.ts'
import { alegeTinta, slotDeInstanta } from '../viewer/tinta.ts'
import type { CelulaJ, Impact, Raza } from '../viewer/tinta.ts'

// ---------------------------------------------------------------------------------------------
// texte
// ---------------------------------------------------------------------------------------------

const SURSE: readonly SursaMotiv[] = ['desemnare', 'morman', 'comanda', 'incarcare']

test('texte: fiecare valoare din Reason are titlu, pe fiecare sursa', () => {
  // `Reason`, nu `MOTIVE`: toasturile comenzilor primesc codul direct.
  for (const m of Object.values(Reason) as ReasonCode[]) {
    assert.ok(textGeneric(m).titlu.length > 0, `fara text generic: ${m}`)
    for (const s of SURSE) assert.ok(textMotiv(s, m).titlu.length > 0, `fara text: ${s}/${m}`)
  }
})

test('texte: detaliul se citeste pe enumul SURSEI (valorile 1-3 se suprapun)', () => {
  // DetaliuMotiv.COMPONENTE_DIFERITE (2) si DetaliuItem.DEPOZITE_PLINE (2): acelasi numar, alt inteles.
  assert.equal(DetaliuMotiv.COMPONENTE_DIFERITE, DetaliuItem.DEPOZITE_PLINE)
  assert.match(textMotiv('desemnare', Reason.INACCESIBIL, DetaliuMotiv.COMPONENTE_DIFERITE).titlu, /Nu se ajunge acolo din așezare/)
  assert.match(textMotiv('morman', Reason.FARA_DEPOZIT, DetaliuItem.DEPOZITE_PLINE).titlu, /pline sau deja promise/)
  const desemnare = [DetaliuMotiv.FARA_LOC_DE_LUCRU, DetaliuMotiv.COMPONENTE_DIFERITE, DetaliuMotiv.FARA_LOC_SIGUR].map((d) => textMotiv('desemnare', Reason.INACCESIBIL, d).titlu)
  assert.equal(new Set(desemnare).size, 3, 'fiecare detaliu INACCESIBIL are titlul lui')
  assert.notEqual(textMotiv('desemnare', Reason.INACCESIBIL, DetaliuMotiv.FARA_LOC_SIGUR).titlu, textGeneric(Reason.INACCESIBIL).titlu)
  assert.match(textMotiv('desemnare', Reason.INACCESIBIL, DetaliuMotiv.FARA_LOC_SIGUR).actiune, /scară/)
  const morman = [DetaliuItem.NICIO_ZONA, DetaliuItem.DEPOZITE_PLINE].map((d) => textMotiv('morman', Reason.FARA_DEPOZIT, d, undefined, undefined, Item.PAMANT).titlu)
  assert.equal(new Set(morman).size, 2)
  assert.match(morman[0]!, /Niciun depozit pentru pământ/)
})

test('texte: materialul imprastiat nu spune „lipseste", iar cel lipsa spune ce material', () => {
  assert.match(textMotiv('desemnare', Reason.LIPSA_MATERIAL, DetaliuMotiv.MATERIAL_IMPRASTIAT).titlu, /sub 10/)
  assert.match(textMotiv('desemnare', Reason.LIPSA_MATERIAL, DetaliuMotiv.NICIUNUL).titlu, /Lipsește piatră \(20 pe piesă\)/)
})

test('texte: FARA_SPRIJIN pe caz, cu cifrele din params (grinda de la 13 pasi, raza 10)', () => {
  const baza = { raza: 4, razaGrinda: 10 }
  const departe = textSprijin({ ...baza, caz: 'GRINDA_PREA_DEPARTE', grindaD: 13 })
  assert.match(departe.titlu, /13 pași/)
  assert.match(departe.titlu, /cel mult 9/)
  assert.doesNotMatch(departe.actiune, /^Pune o grindă/)
  assert.match(textSprijin({ ...baza, caz: 'GRINDA_INACTIVA', grindaD: 2 }).titlu, /nu ține nimic/)
  assert.match(textSprijin({ ...baza, caz: 'GRINDA_NELEGATA', grindaX: 7, grindaY: 8 }).titlu, /\(7, 8\)/)
  assert.match(textSprijin({ ...baza, caz: 'NU_ATINGE' }).titlu, /Nu atinge nimic/)
  assert.match(textSprijin({ ...baza, caz: 'NICIO_GRINDA' }).titlu, /mai puțin de 4 pași/)
  const toate = ['NU_ATINGE', 'GRINDA_INACTIVA', 'GRINDA_PREA_DEPARTE', 'GRINDA_NELEGATA', 'NICIO_GRINDA'].map((caz) => textSprijin({ ...baza, caz, grindaD: 3 }).titlu)
  assert.equal(new Set(toate).size, 5, 'cinci cazuri, cinci titluri')
  // Comanda (Shift+clic) trece prin `textSprijin`; motivul memorat pe o desemnare n-are params.
  assert.equal(textMotiv('comanda', Reason.FARA_SPRIJIN, 0, { ...baza, caz: 'GRINDA_INACTIVA', grindaD: 2 }).titlu, textSprijin({ ...baza, caz: 'GRINDA_INACTIVA', grindaD: 2 }).titlu)
})

test('texte: refuzurile incarcarii si ale comenzilor pe parametri', () => {
  assert.match(textMotiv('incarcare', Reason.LIPSA_MATERIAL, 0, { camp: '(json)', motiv: 'nu se poate parsa' }).titlu, /nu e o salvare Kinstead/)
  assert.match(textMotiv('incarcare', Reason.CAPACITATE_DEPASITA, 0, { camp: 'schema', valoare: '9', maxim: 7 }).titlu, /versiune mai nouă/)
  assert.match(textMotiv('comanda', Reason.LIPSA_MATERIAL, 0, { motiv: 'nu e nimic de sapat' }).titlu, /aer/)
  assert.match(textMotiv('comanda', Reason.CELULA_OCUPATA, 0, { item: 12 }).titlu, /morman/)
})

test('texte: fiecare material 0..MATERIAL_MAX are nume', () => {
  for (let m = 0; m <= MATERIAL_MAX; m++) assert.ok((NUME_MATERIAL[m] ?? '').length > 0, `material ${m} fara nume`)
})

test('texte: prioritatea maxima e Exclusiv, nu o cifra', () => {
  assert.equal(textPrioritatePersonala(0, 3).eticheta, '–')
  assert.equal(textPrioritatePersonala(1, 3).eticheta, '1')
  assert.equal(textPrioritatePersonala(3, 3).eticheta, 'Excl.')
  assert.match(textPrioritatePersonala(3, 3).titlu, /DOAR/)
})

test('texte: activitatea pe fel si pas (cara: merge, ridica, duce, lasa)', () => {
  assert.equal(textActivitate(FelJob.NICIUNUL, 0), 'Stă')
  assert.equal(textActivitate(FelJob.SAPA, 1), 'Sapă')
  assert.equal(textActivitate(FelJob.SAPA, 0), 'Merge să sape')
  assert.equal(textActivitate(FelJob.CARA, PasCara.MERGE_DEST, '20 piatră'), 'Cară 20 piatră spre depozit')
  const pasi = [PasCara.MERGE_SURSA, PasCara.RIDICA, PasCara.MERGE_DEST, PasCara.LASA].map((p) => textActivitate(FelJob.CARA, p, 'x'))
  assert.equal(new Set(pasi).size, 4)
})

test('texte: timpul de joc din tickuri si numerele ca in romana', () => {
  assert.equal(textTimp(0, 20), '0:00:00')
  assert.equal(textTimp(19, 20), '0:00:00')
  assert.equal(textTimp(20, 20), '0:00:01')
  assert.equal(textTimp(72_000, 20), '1:00:00')
  assert.equal(textTimp(20 * 3725, 20), '1:02:05')
  const ro = new Intl.NumberFormat('ro-RO')
  for (const n of [0, 999, 1240, 1234567]) assert.equal(textNumar(n), ro.format(n))
})

// ---------------------------------------------------------------------------------------------
// nume
// ---------------------------------------------------------------------------------------------

test('nume: 2304 id-uri consecutive dau 2304 nume distincte, iar numele e functie de id', () => {
  assert.equal(PRENUME.length * FAMILII.length, 2304)
  const vazute = new Set<string>()
  for (let id = 0; id < 2304; id++) vazute.add(numePion(id))
  assert.equal(vazute.size, 2304)
  assert.equal(numePion(17), numePion(17))
  assert.equal(numePion(17 + 2304), numePion(17))
})

// ---------------------------------------------------------------------------------------------
// dreptunghi
// ---------------------------------------------------------------------------------------------

/** O lume de test: solul are cota `sol(x, y)`; solid la z <= sol; calcabil la sol+1; desemnari date. */
function lume(o: { sol?: (x: number, y: number) => number; desemnate?: readonly { id: number; wx: number; wy: number; z: number }[]; zone?: readonly { id: number; celule: number; celuleInDreptunghi: number }[]; inZona?: (x: number, y: number, z: number) => boolean } = {}): Lumea {
  const sol = o.sol ?? (() => 9)
  const des = o.desemnate ?? []
  return {
    solid: (x, y, z) => z <= sol(x, y),
    suprafata: (x, y) => sol(x, y),
    calcabil: (x, y, z) => z === sol(x, y) + 1,
    desemnare: (x, y, z) => des.find((d) => d.wx === x && d.wy === y && d.z === z)?.id ?? -1,
    inZona: o.inZona ?? (() => false),
    desemnariIn: (d: Dreptunghi, zMax: number) => des.filter((x) => x.wx >= d.x0 && x.wx <= d.x1 && x.wy >= d.y0 && x.wy <= d.y1 && x.z <= zMax),
    zoneIn: () => o.zone ?? [],
  }
}

const OPT: Optiuni = {
  unealta: Unealta.SAPA, piesa: Piesa.NICIUNA, zonaFel: 0, contur: false, unStrat: false, prioritate: 3,
  zActiv: null, inaltimeOm: 2, locDesemnari: 4096, locZone: 4096,
}

test('dreptunghi: colturile in orice ordine dau acelasi dreptunghi', () => {
  assert.deepEqual(normalizeaza(5, 2, 1, 7), { x0: 1, y0: 2, x1: 5, y1: 7 })
  assert.deepEqual(normalizeaza(1, 7, 5, 2), normalizeaza(5, 2, 1, 7))
})

test('dreptunghi: conturul are exact marginea, fara dubluri (1×1, 1×10, 10×1, 2×2, 5×5)', () => {
  // Oracolul, pe hartie: w·h − (w−2)(h−2) pentru w, h >= 2, altfel w·h. NU 2(w+h)−4: aia numara
  // zidul drept de doua ori (1×10 ar fi 18).
  for (const [w, h, asteptat] of [[1, 1, 1], [1, 10, 10], [10, 1, 10], [2, 2, 4], [5, 5, 16], [7, 7, 24]] as const) {
    const c = coloane(normalizeaza(0, 0, w - 1, h - 1), true)
    assert.equal(c.length, asteptat, `${w}×${h}`)
    assert.equal(new Set(c.map((x) => `${x.wx},${x.wy}`)).size, c.length, `dubluri la ${w}×${h}`)
  }
  assert.equal(coloane(normalizeaza(0, 0, 6, 4), false).length, 35)
})

test('dreptunghi: nicio comanda de doua ori pe aceeasi tinta', () => {
  for (const u of [Unealta.SAPA, Unealta.CONSTRUIESTE, Unealta.ANULEAZA]) {
    const ds = [{ id: 1, wx: 0, wy: 0, z: 9 }, { id: 2, wx: 1, wy: 0, z: 10 }]
    const p = planDreptunghi(normalizeaza(0, 0, 3, 3), { ...OPT, unealta: u, piesa: Piesa.PERETE, contur: true }, lume({ desemnate: ds }))
    const chei = p.comenzi.map((c) => (c.kind === 'desemneaza' ? `${c.wx},${c.wy},${c.z}` : c.kind === 'anuleazaDesemnarea' ? `id${c.id}` : JSON.stringify(c)))
    assert.equal(new Set(chei).size, chei.length, `unealta ${u}`)
  }
})

test('dreptunghi: cu nivelul oprit, Sapa urmeaza solul pe fiecare coloana', () => {
  // Panta: solul urca un metru pe coloana. Cota fixa a lui v1 ar fi dat 1 celula din 4 pe rand.
  const p = planDreptunghi(normalizeaza(0, 0, 3, 2), OPT, lume({ sol: (x) => 10 + x }))
  assert.equal(p.comenzi.length, 12)
  for (const c of p.comenzi) assert.ok(c.kind === 'desemneaza' && c.z === 10 + c.wx && c.piesa === undefined)
  assert.equal(p.niveluri, 4)
})

test('dreptunghi: cu nivelul pornit, Sapa ia nivelul activ si locul de cap; „Un strat" doar nivelul', () => {
  const l = lume({ sol: () => 20 })
  const p = planDreptunghi(normalizeaza(0, 0, 2, 2), { ...OPT, zActiv: 15 }, l)
  assert.equal(p.comenzi.length, 18, '9 coloane × (15 si 16)')
  assert.deepEqual([...new Set(p.comenzi.map((c) => (c.kind === 'desemneaza' ? c.z : -1)))].sort(), [15, 16])
  const unul = planDreptunghi(normalizeaza(0, 0, 2, 2), { ...OPT, zActiv: 15, unStrat: true }, l)
  assert.equal(unul.comenzi.length, 9)
  // Pe suprafata cu slice: aerul de deasupra se sare, nu se desemneaza.
  const sus = planDreptunghi(normalizeaza(0, 0, 2, 2), { ...OPT, zActiv: 20 }, l)
  assert.equal(sus.comenzi.length, 9)
  assert.equal(sus.sarite.nepotrivite, 9)
})

test('dreptunghi: Construieste pune piesa doar in aer, cu prioritatea aleasa; peretele pe contur', () => {
  const p = planDreptunghi(normalizeaza(0, 0, 4, 4), { ...OPT, unealta: Unealta.CONSTRUIESTE, piesa: Piesa.PERETE, contur: true, prioritate: 5 }, lume())
  assert.equal(p.comenzi.length, 16)
  for (const c of p.comenzi) assert.ok(c.kind === 'desemneaza' && c.piesa === Piesa.PERETE && c.z === 10 && c.prioritate === 5)
  const plin = planDreptunghi(normalizeaza(0, 0, 4, 4), { ...OPT, unealta: Unealta.CONSTRUIESTE, piesa: Piesa.PODEA, zActiv: 9 }, lume())
  assert.equal(plin.comenzi.length, 0, 'nivelul activ e plin: nimic de zidit')
  assert.equal(plin.sarite.nepotrivite, 25)
})

test('dreptunghi: Anuleaza retrage doar ce se vede (z <= nivelul activ)', () => {
  const ds = [{ id: 1, wx: 0, wy: 0, z: 5 }, { id: 2, wx: 1, wy: 0, z: 12 }, { id: 3, wx: 9, wy: 9, z: 5 }]
  const p = planDreptunghi(normalizeaza(0, 0, 2, 2), { ...OPT, unealta: Unealta.ANULEAZA, zActiv: 10 }, lume({ desemnate: ds }))
  assert.deepEqual(p.comenzi, [{ kind: 'anuleazaDesemnarea', id: 1 }])
  const tot = planDreptunghi(normalizeaza(0, 0, 2, 2), { ...OPT, unealta: Unealta.ANULEAZA }, lume({ desemnate: ds }))
  assert.equal(tot.comenzi.length, 2)
})

test('dreptunghi: plafonul e locul LIBER, numarat pe ce primeste comanda, si refuza tot', () => {
  const l = lume()
  const p = planDreptunghi(normalizeaza(0, 0, 9, 9), { ...OPT, locDesemnari: 99 }, l)
  assert.equal(p.comenzi.length, 0)
  assert.match(p.refuz ?? '', /mai încap 99/)
  const bun = planDreptunghi(normalizeaza(0, 0, 9, 9), { ...OPT, locDesemnari: 100 }, l)
  assert.equal(bun.refuz, null)
  assert.equal(bun.comenzi.length, 100)
  // Celulele sarite nu intra in numaratoare: 100 de coloane, jumatate deja desemnate.
  const ds = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, wx: i % 10, wy: Math.floor(i / 10), z: 9 }))
  assert.equal(planDreptunghi(normalizeaza(0, 0, 9, 9), { ...OPT, locDesemnari: 50 }, lume({ desemnate: ds })).refuz, null)
  const zone = planDreptunghi(normalizeaza(0, 0, 9, 9), { ...OPT, unealta: Unealta.ZONA, locZone: 99 }, l)
  assert.ok(zone.refuz !== null && zone.zone.length === 0)
})

test('dreptunghi: zona pe panta urmeaza solul, pe randuri; pe plat, o bucata pe rand', () => {
  const panta = planDreptunghi(normalizeaza(0, 0, 3, 1), { ...OPT, unealta: Unealta.ZONA }, lume({ sol: (x) => 10 + x }))
  assert.equal(panta.celule.length, 8)
  assert.equal(panta.zone.length, 8, 'fiecare coloana la alta cota: o bucata pe celula')
  for (const b of panta.zone) assert.equal(b.z, 11 + b.x0)
  const plat = planDreptunghi(normalizeaza(0, 0, 3, 1), { ...OPT, unealta: Unealta.ZONA }, lume())
  assert.deepEqual(plat.zone, [{ x0: 0, y0: 0, x1: 3, y1: 0, z: 10 }, { x0: 0, y0: 1, x1: 3, y1: 1, z: 10 }])
  // O celula deja pictata taie fuga: bucatile nu se suprapun cu ea.
  const taiat = planDreptunghi(normalizeaza(0, 0, 3, 0), { ...OPT, unealta: Unealta.ZONA }, lume({ inZona: (x) => x === 1 }))
  assert.deepEqual(taiat.zone, [{ x0: 0, y0: 0, x1: 0, y1: 0, z: 10 }, { x0: 2, y0: 0, x1: 3, y1: 0, z: 10 }])
  assert.equal(taiat.sarite.deja, 1)
})

test('dreptunghi: Sterge zona spune cate celule se sterg in afara dreptunghiului', () => {
  const p = planDreptunghi(normalizeaza(0, 0, 2, 2), { ...OPT, unealta: Unealta.STERGE_ZONA }, lume({ zone: [{ id: 7, celule: 71, celuleInDreptunghi: 4 }] }))
  assert.deepEqual(p.comenzi, [{ kind: 'stergeZona', id: 7 }])
  assert.equal(p.celuleInAfara, 67)
})

// ---------------------------------------------------------------------------------------------
// alerte
// ---------------------------------------------------------------------------------------------

const TPS = 20
const R: RegulaAlerta[] = [
  { id: 'a', severitate: Severitate.ATENTIE, intarziereS: 5, racireS: 10 },
  { id: 'c', severitate: Severitate.CRITIC, intarziereS: 0, racireS: 0 },
]
const da = (text = 'x'): Semnal => ({ activ: true, text, tinta: null })

test('alerte: apare exact dupa intarziere, si doar daca conditia TINE neintrerupt', () => {
  const a = creeazaAlerte()
  assert.equal(actualizeaza(a, R, new Map([['a', da()]]), 0, TPS).length, 0)
  assert.equal(actualizeaza(a, R, new Map([['a', da()]]), 99, TPS).length, 0, 'la 99 de tickuri (sub 5 s), nu')
  assert.equal(actualizeaza(a, R, new Map([['a', da()]]), 100, TPS).length, 1, 'la 100, da')
  const b = creeazaAlerte()
  actualizeaza(b, R, new Map([['a', da()]]), 0, TPS)
  actualizeaza(b, R, new Map(), 50, TPS)
  assert.equal(actualizeaza(b, R, new Map([['a', da()]]), 120, TPS).length, 0, 'intreruperea reporneste ceasul')
})

test('alerte: dupa ce dispare, nu reapare in racire, chiar daca revine conditia', () => {
  const a = creeazaAlerte()
  actualizeaza(a, R, new Map([['a', da()]]), 0, TPS)
  actualizeaza(a, R, new Map([['a', da()]]), 100, TPS)
  assert.equal(actualizeaza(a, R, new Map(), 150, TPS).length, 0)
  assert.equal(actualizeaza(a, R, new Map([['a', da()]]), 250, TPS).length, 0, 'racirea tine pana la 350')
  assert.equal(actualizeaza(a, R, new Map([['a', da()]]), 350, TPS).length, 1)
})

test('alerte: cele critice primele; jurnalul tine ultimele 50', () => {
  const a = creeazaAlerte()
  actualizeaza(a, R, new Map([['a', da('A')]]), 0, TPS)
  const v = actualizeaza(a, R, new Map([['a', da('A')], ['c', da('C')]]), 100, TPS)
  assert.deepEqual(v.map((x) => x.id), ['c', 'a'])
  actualizeaza(a, R, new Map(), 101, TPS)
  assert.deepEqual(a.jurnal.map((x) => `${x.id}:${x.tip}`), ['a:apare', 'c:apare', 'a:dispare', 'c:dispare'])
  for (let i = 0; i < JURNAL_MAX + 10; i++) eveniment(a, 'e', `e${i}`, 200 + i)
  assert.equal(a.jurnal.length, JURNAL_MAX)
  assert.equal(a.jurnal.at(-1)!.text, `e${JURNAL_MAX + 9}`)
  assert.equal(a.jurnal[0]!.text, 'e10', 'cea mai veche a iesit')
})

test('alerte: pauza (tick neschimbat) nu scoate nimic; inainte de armare, nimic', () => {
  const a = creeazaAlerte()
  for (let i = 0; i < 50; i++) assert.equal(actualizeaza(a, R, new Map([['a', da()]]), 7, TPS).length, 0)
  const b = creeazaAlerte(30)
  assert.equal(actualizeaza(b, R, new Map([['c', da()]]), 29, TPS).length, 0, 'dupa o incarcare, memoriile TRANSIENT sunt goale 30 de tickuri')
  assert.equal(actualizeaza(b, R, new Map([['c', da()]]), 30, TPS).length, 1)
})

// ---------------------------------------------------------------------------------------------
// salvari
// ---------------------------------------------------------------------------------------------

function salvareBuna(): Record<string, unknown> {
  return {
    format: FORMAT_SALVARE, id: 's1', nume: 'x', salvatLa: '2026-09-27T10:00:00.000Z', tick: 100, seed: 7, oameni: 3,
    meta: { camera: { pos: [1, 2, 3], tinta: [4, 5, 6] }, slice: null, viteza: 1, primiPasi: [true, false, false, false] },
    lume: '{"game":"kinstead"}',
  }
}

test('salvari: plicul valid trece, iar fiecare camp stricat spune ce', () => {
  assert.ok(valideazaSalvare(salvareBuna()).ok)
  const strica: [string, (s: Record<string, unknown>) => void, RegExp][] = [
    ['format nou', (s) => { s.format = FORMAT_SALVARE + 1 }, /mai nouă/],
    ['format strain', (s) => { s.format = 'x' }, /Nu e o salvare/],
    ['id', (s) => { s.id = '' }, /identificator/],
    ['tick', (s) => { s.tick = 'x' }, /numerice/],
    ['camera', (s) => { (s.meta as { camera: { pos: number[] } }).camera.pos = [1, 2] }, /camerei/],
    ['slice', (s) => { (s.meta as { slice: unknown }).slice = 'x' }, /Nivelul/],
    ['bife', (s) => { (s.meta as { primiPasi: unknown }).primiPasi = [1] }, /Bifele/],
    ['lume', (s) => { s.lume = '' }, /lumea/],
  ]
  for (const [ce, f, re] of strica) {
    const s = salvareBuna()
    f(s)
    const v = valideazaSalvare(s)
    assert.ok(!v.ok && re.test(v.motiv), `${ce}: ${JSON.stringify(v)}`)
  }
  assert.equal(numeFisier({ seed: 7, tick: 20 * 60 * 65 }, 20), 'kinstead-7-1h05.json')
})

test('salvari: salvarea automata merge pe tickuri, asteapta un moment linistit si tace pe o colonie golita', () => {
  const m = { tick: 0, tickUltima: 0, ticksPerSecond: 20, encodeMs: 4, linistit: false, tragere: false, golita: false }
  const cinci = 5 * 60 * 20
  assert.equal(eTimpulSalvariiAutomate({ ...m, tick: cinci - 1, linistit: true }), false)
  assert.equal(eTimpulSalvariiAutomate({ ...m, tick: cinci, linistit: true }), true)
  assert.equal(eTimpulSalvariiAutomate({ ...m, tick: cinci }), false, 'nelinistit: mai asteapta pana la un minut')
  assert.equal(eTimpulSalvariiAutomate({ ...m, tick: cinci + 60 * 20 }), true)
  assert.equal(eTimpulSalvariiAutomate({ ...m, tick: cinci * 3, golita: true, linistit: true }), false)
  assert.equal(eTimpulSalvariiAutomate({ ...m, tick: cinci * 3, tragere: true, linistit: true }), false)
  assert.equal(eTimpulSalvariiAutomate({ ...m, tick: cinci, linistit: true, encodeMs: 70 }), false, 'encode lent: la 10 minute')
})

// ---------------------------------------------------------------------------------------------
// pornirea
// ---------------------------------------------------------------------------------------------

const P = (q: string) => new URLSearchParams(q)

test('pornire: orice URL al lansatoarelor de gate e gate, fara UI', () => {
  // bench/ruleaza-gate.cmd (Chrome) si bench/gate-electron.mjs (acelasi URL + `flags`).
  const urls = [
    '?bisect=1&ballast=1&warmup=300',
    '?bisect=1&ballast=1&warmup=300&d1b=1',
    '?scenario=fortress&ballast=1&warmup=300&frames=3600',
    '?scenario=dig&ballast=1&warmup=300&frames=3600&d1b=1',
    '?scenario=traverse&ballast=1&warmup=300&frames=3600&flags=in-process-gpu,enable-webgl-developer-extensions',
    '?scenario=fortress&probe=leak',
    '?probe=stall',
    '?d1b=1',
    // Oricat ar mai fi in URL: masura castiga.
    '?scenario=dig&joc=nou&seed=7',
    '?bisect=1&incarca=auto',
    '?scenario=dig&cam=1,2',
  ]
  for (const u of urls) {
    const m = modPornire(P(u))
    assert.equal(m.mod, 'gate', u)
    assert.equal(m.faraUI, true, u)
  }
})

test('pornire: masoara si lumeDeGate raman cele de azi (bisectia pe fortareata cu pioni)', () => {
  assert.deepEqual(modPornire(P('?bisect=1')), { mod: 'gate', faraUI: true, masoara: true, lumeDeGate: false })
  assert.deepEqual(modPornire(P('?scenario=dig')), { mod: 'gate', faraUI: true, masoara: true, lumeDeGate: true })
  assert.deepEqual(modPornire(P('?d1b=1')), { mod: 'gate', faraUI: true, masoara: false, lumeDeGate: false })
})

test('pornire: incarca > joc nou > verificare > titlu', () => {
  assert.equal(modPornire(P('')).mod, 'titlu')
  assert.equal(modPornire(P('')).faraUI, false)
  // Verificarea ruleaza viewer-ul de azi, fara UI-ul de joc (OWNER_VERIFY 12 si 13).
  assert.equal(modPornire(P('?cam=1,2&pauza=1')).faraUI, true)
  assert.equal(modPornire(P('?joc=nou')).faraUI, false)
  assert.equal(modPornire(P('?incarca=auto')).faraUI, false)
  assert.equal(modPornire(P('?cam=1,2&slice=48&piatra=4000&hrana=750&pauza=1')).mod, 'verificare')
  assert.equal(modPornire(P('?verificare=1')).mod, 'verificare')
  assert.equal(modPornire(P('?joc=nou&piatra=10&hrana=10')).mod, 'joc-nou')
  assert.equal(modPornire(P('?incarca=auto&joc=nou&cam=1,2')).mod, 'incarca')
  assert.equal(modPornire(P('?joc=vechi')).mod, 'titlu')
})

test('pornire: jocul nou citeste si margineste parametrii; hrana implicita = 230 × oameni', () => {
  assert.equal(HRANA_PE_OM, 230)
  assert.deepEqual(parametriJocNou(P('?joc=nou'), 64, 99), { seed: 99, oameni: 12, piatra: 1000, hrana: 2760 })
  assert.deepEqual(parametriJocNou(P('?joc=nou&seed=7&oameni=5'), 64, 99), { seed: 7, oameni: 5, piatra: 1000, hrana: 1150 })
  assert.deepEqual(parametriJocNou(P('?seed=-1&oameni=65&piatra=x&hrana=3.5'), 64, 99), { seed: 99, oameni: 12, piatra: 1000, hrana: 2760 })
  assert.equal(parametriJocNou(P('?hrana=0'), 64, 1).hrana, 0)
})

// ---------------------------------------------------------------------------------------------
// tastele
// ---------------------------------------------------------------------------------------------

const T = (key: string, o: Partial<IntrareTasta> = {}): IntrareTasta => ({
  key, ctrl: false, shift: false, alt: false, meta: false, editabil: false, compunere: false, modal: false, mod: 'joc', amprenta: false, ...o,
})

test('taste: nimic dintr-un camp de text (tastat „Kinstead" nu porneste traversarea)', () => {
  for (const k of [...'Kinstead sjgbpqerhtf1230vdcako', 'Escape', 'F1', 'F3', 'ArrowLeft']) {
    const r = actiuneTasta(T(k, { editabil: true }))
    assert.deepEqual(r, { actiune: null, consuma: false }, k)
  }
  assert.equal(actiuneTasta(T('s', { compunere: true })).actiune, null)
})

test('taste: Ctrl+S salveaza (consumat) si nu comuta stabilitatea; literele merg doar fara Ctrl/Alt', () => {
  assert.deepEqual(actiuneTasta(T('s', { ctrl: true })), { actiune: 'salveaza', consuma: true })
  assert.deepEqual(actiuneTasta(T('S', { meta: true })), { actiune: 'salveaza', consuma: true })
  assert.equal(actiuneTasta(T('s')).actiune, 'overlayS')
  assert.equal(actiuneTasta(T('j', { ctrl: true })).actiune, null)
  assert.equal(actiuneTasta(T('q', { alt: true })).actiune, null)
  assert.equal(actiuneTasta(T('T', { shift: true })).actiune, 'traversareSens')
})

test('taste: cu o fereastra deschisa trec doar Esc, F1, F3', () => {
  for (const k of ['s', ' ', 'q', 'd', '1', 'p', 'ArrowUp']) assert.equal(actiuneTasta(T(k, { modal: true })).actiune, null, k)
  assert.equal(actiuneTasta(T('Escape', { modal: true })).actiune, 'esc')
  assert.equal(actiuneTasta(T('F1', { modal: true })).actiune, 'ajutor')
  assert.equal(actiuneTasta(T('F3', { modal: true })).actiune, 'diagnostic')
})

test('taste: fara UI (gate), doar tastele de azi; H e ajutorul in joc si ciclul vechi in verificare', () => {
  for (const k of ['v', 'd', 'c', 'a', 'k', 'o', '1', 'Escape', 'F1', 'ArrowUp', 'PageUp']) assert.equal(actiuneTasta(T(k, { mod: 'faraUI' })).actiune, null, k)
  for (const [k, a] of [['s', 'overlayS'], ['j', 'overlayJ'], ['g', 'overlayG'], ['p', 'piesa'], [' ', 'pauza'], ['q', 'nivelJos'], ['e', 'nivelSus'], ['r', 'nivelOprit'], ['h', 'ciclulH'], ['b', 'amprenta']] as const) {
    assert.equal(actiuneTasta(T(k, { mod: 'faraUI' })).actiune, a, k)
  }
  assert.equal(actiuneTasta(T('h')).actiune, 'ajutor')
  assert.equal(actiuneTasta(T('h', { mod: 'verificare' })).actiune, 'ciclulH')
  assert.equal(actiuneTasta(T('n')).actiune, null, 'N doar cu amprenta aprinsa')
  assert.equal(actiuneTasta(T('n', { amprenta: true })).actiune, 'amprentaForma')
  assert.deepEqual(actiuneTasta(T(' ')), { actiune: 'pauza', consuma: true })
})

// ---------------------------------------------------------------------------------------------
// tinta clicului
// ---------------------------------------------------------------------------------------------

test('tinta: slotul de sub instanta dupa o plecare', () => {
  // Sase pioni, slotul 1 a plecat: instanta 1 e slotul 2, nu 1.
  const out = new Int32Array(8)
  const n = slotDeInstanta(Uint8Array.from([1, 0, 1, 1, 1, 1]), 6, out)
  assert.equal(n, 5)
  assert.deepEqual([...out.subarray(0, n)], [0, 2, 3, 4, 5])
})

const ELEV = (24.8 * Math.PI) / 180
const DIST = Math.hypot(46, 46, 30)
/** Raza camerei de pornire a viewer-ului spre punctul `p`. */
function razaSpre(p: { x: number; y: number; z: number }): Raza {
  const dh = DIST * Math.cos(ELEV)
  const o = { x: p.x - dh / Math.SQRT2, y: p.y + DIST * Math.sin(ELEV), z: p.z + dh / Math.SQRT2 }
  const d = { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z }
  const l = Math.hypot(d.x, d.y, d.z)
  return { o, d: { x: d.x / l, y: d.y / l, z: d.z / l } }
}
/** Impactul razei pe solul plat cu fata de sus la y = `sus`. */
function peSol(r: Raza, sus: number): Impact[] {
  const t = (sus - r.o.y) / r.d.y
  return [{ t, p: { x: r.o.x + t * r.d.x, y: sus, z: r.o.z + t * r.d.z }, n: { x: 0, y: 1, z: 0 } }]
}

test('tinta: Anuleaza si Selecteaza iau cubul J vazut, nu terenul din spatele lui', () => {
  // Sol plat, fata de sus la y = 47 (solid pana la z = 46); un perete desenat, cub J la (100, 100, 47).
  const cub: CelulaJ = { wx: 100, wy: 100, z: 47 }
  const baza = { slice: null, cuburi: [cub], departeMax: 150, desemnataPeNivel: () => false, plinaPeNivel: () => false }
  for (const p of [{ x: 100.5, y: 47.85, z: 100.5 }, { x: 100.5, y: 47.5, z: 100.5 }, { x: 100.15, y: 47.4, z: 100.9 }]) {
    const raza = razaSpre(p)
    const impacturi = peSol(raza, 47)
    for (const mod of ['retrage', 'inspecteaza'] as const) {
      const t = alegeTinta({ ...baza, mod, raza, impacturi })
      assert.ok(t.ok && t.wx === 100 && t.wy === 100 && t.z === 47, `${mod} prin ${JSON.stringify(p)}: ${JSON.stringify(t)}`)
    }
    // Proba negativa: sapatul (sau clicul simplu de azi) ia solul DE DUPA cub — prin capac si prin
    // centru, alta coloana. (Prin fata laterala joasa, raza cade dupa cub tot in coloana lui.)
    const s = alegeTinta({ ...baza, mod: 'sapa', raza, impacturi })
    assert.ok(s.ok && s.z === 46, `sapa prin ${JSON.stringify(p)}: ${JSON.stringify(s)}`)
    if (p.y > 47.45) assert.ok(s.wx !== 100 || s.wy !== 100, `sapa prin ${JSON.stringify(p)} ar fi trebuit sa ia alta coloana: ${JSON.stringify(s)}`)
  }
  // Cu J stins, nimic de tintit pe cub: Anuleaza ia solidul vazut.
  const raza = razaSpre({ x: 100.5, y: 47.5, z: 100.5 })
  const t = alegeTinta({ ...baza, cuburi: [], mod: 'retrage', raza, impacturi: peSol(raza, 47) })
  assert.ok(t.ok && t.z === 46)
})

test('tinta: zona cu nivelul pornit e celula de la nivelul activ (apelantul adauga 1)', () => {
  const raza = razaSpre({ x: 50.5, y: 47, z: 60.5 })
  const t = alegeTinta({ mod: 'zona', raza, impacturi: peSol(raza, 47), slice: 48, cuburi: [], departeMax: 150, desemnataPeNivel: () => false, plinaPeNivel: () => false })
  assert.ok(t.ok && t.wx === 50 && t.wy === 60 && t.z === 46, JSON.stringify(t))
  const piesa = alegeTinta({ mod: 'piesa', raza, impacturi: peSol(raza, 47), slice: 48, cuburi: [], departeMax: 150, desemnataPeNivel: () => false, plinaPeNivel: () => false })
  assert.ok(piesa.ok && piesa.z === 47)
})
