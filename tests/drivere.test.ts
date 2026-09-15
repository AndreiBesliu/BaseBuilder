/**
 * Garzile structurii care face loc felurilor noi de job — S16-19, taietura 3,
 * primul commit. Fara comportament nou: ce se probeaza aici e ca punctele in
 * care motorul de joburi RAMIFICA pe felul jobului nu mai presupun nimic.
 *
 * Fiecare test de aici are mutatia lui in `scratchpad/mut-nevoi.mjs`. Ce NU e
 * aici, deliberat: intreruperea unui job de DORMIT la stergerea zonei. Filtrul
 * s-a generalizat („orice job care tine celula", nu doar caratul), dar in commit-ul
 * asta niciun alt fel de job nu scrie `jobDest`, deci un test ar fi vid prin
 * constructie — trece si cu filtrul vechi. Garda vine cu felul DOARME.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { FelJob, Item, ITEME } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { Reason, codMotiv } from '../src/sim/result.ts'
import { indexZone, prioritateaLocului, Zona, celulaDeZonaLa } from '../src/sim/zone.ts'
import { driverPentru } from '../src/sim/joburi.ts'
import { DetaliuItem, iaDinItem, slotItem } from '../src/sim/iteme.ts'
import { decode, encode } from '../src/sim/save.ts'
import { desemneaza, itemeInZona, laSit, lasaItem, panaCand, patratPlat, picteaza, R, ruleaza, solid } from './fixturi.ts'

// ---------------------------------------------------------------------------
// tabelul de drivere
// ---------------------------------------------------------------------------

test('tabelul de drivere acopera exact felurile de job cunoscute', () => {
  assert.equal(driverPentru(FelJob.NICIUNUL), undefined, 'fara job nu are driver')
  assert.equal(driverPentru(FelJob.SAPA)?.fel, FelJob.SAPA)
  assert.equal(driverPentru(FelJob.CARA)?.fel, FelJob.CARA)
  // Proba negativa a tabelului: un fel pe care nimeni nu l-a definit nu cade pe
  // o ramura implicita. Inainte de tabel, orice fel != CARA era tratat ca SAPA.
  assert.equal(driverPentru(7), undefined, 'un fel necunoscut NU are driver')
})

test('un fel de job fara driver ANULEAZA jobul la incarcare, nu il executa ca sapat', () => {
  // Fixtura e un job de SAPAT caruia i se falsifica felul, si asta nu e o
  // alegere de comoditate — e singura forma care desparte cele doua variante.
  //
  // Cu un job de CARAT, un fel necunoscut cadea si la codul vechi pe ramura
  // `else` = SAPA, care cerea o desemnare pentru un id de ITEM, primea -1 si
  // anula jobul. Adica testul ar fi trecut si INAINTE de tabel: verde, si vid.
  //
  // Cu un job de SAPAT, tinta e chiar o desemnare valida. Codul vechi o gasea,
  // re-rezerva linistit si lasa jobul VIU cu un fel pe care nu-l cunoaste
  // nimeni; apoi il executa ca sapat. Tabelul refuza.
  const { w } = laSit(7311, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const d = desemneaza(w, cx + 3, cy)
  const t = panaCand(w, 400, (ww) => ww.agents.jobKind[0] === FelJob.SAPA)
  assert.notEqual(t, -1, 'fixtura: pionul n-a apucat sa ia jobul de sapat')

  const brut = JSON.parse(encode(w)) as { data: { agents: { jobKind: number[]; jobTarget: number[] } } }
  assert.equal(brut.data.agents.jobKind[0], FelJob.SAPA, 'fixtura: save-ul chiar contine jobul')
  assert.equal(brut.data.agents.jobTarget[0], d.id, 'fixtura: tinta e desemnarea, si ea e VIE in save')

  // Acelasi save, cu felul schimbat intr-unul pe care codul asta nu-l cunoaste —
  // cum ar arata un save scris de o versiune mai noua. Tot restul tuplului e
  // valid, deci nimic in afara de FEL nu-i poate spune incarcarii ca e o problema.
  brut.data.agents.jobKind[0] = 7
  const out = decode(JSON.stringify(brut), R)
  assert.ok(out.ok, `incarcarea a picat de tot: ${JSON.stringify(out)}`)
  const l = out.value

  assert.equal(l.rezervari.anulateLaIncarcare, 1, 'jobul cu fel necunoscut trebuie ANULAT, cu raport')
  assert.equal(l.agents.jobKind[0], 0, 'si pionul trebuie sa ramana fara job, nu sa-l pastreze pe cel necunoscut')
  assert.equal(l.agents.jobTarget[0], 0, 'fara job inseamna si fara tinta')
  assert.equal(l.rezervari.total, 0, 'un job anulat nu lasa rezervari in urma')
})

// ---------------------------------------------------------------------------
// felul zonei
// ---------------------------------------------------------------------------

/** Un pion, un morman pe jos, un dormitor incapator langa el. Zero depozite. */
function fixturaDormitor(seed: number, prioritate = 4): { w: World; zona: number; zx: number; zy: number } {
  const { w, sit } = laSit(seed, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.PIATRA, 20, cx + 3, cy)
  const p = patratPlat(w, sit, 2, 8, 40)
  assert.ok(p, 'fixtura: niciun patrat plat')
  const zona = picteaza(w, p.x0, p.y0, 2, prioritate, R, Zona.DORMIT)
  return { w, zona, zx: p.x0, zy: p.y0 }
}
type World = ReturnType<typeof laSit>['w']

test('celulele unui dormitor NU intra in indexul de depozitare', () => {
  const { w, zona } = fixturaDormitor(9042)
  const ix = indexZone(w, R)
  assert.equal(ix.depoziteOrdonate.length, 0, 'un dormitor nu e depozit')
  assert.equal(ix.paturiLibere.length, 4, 'dar celulele lui sunt paturi libere')
  assert.deepEqual([...ix.maxPrioLibera], new Array<number>(ITEME).fill(0), 'si nicio prioritate de depozitare nu creste')
  for (let k = 0; k < ITEME; k++) {
    assert.equal(ix.acceptante[0 * ITEME + k], 0, `felul ${k} nu e acceptat intr-un dormitor`)
    assert.equal(ix.maxLocLiber[0 * ITEME + k], 0)
  }
  assert.equal(ix.deMutat.length, 0, 'si mormanul de pe jos nu are unde sa fie mutat')
  assert.equal(ix.peJosFaraDepozit, 1, 'e pe jos si n-are unde: cauza se scrie')
  void zona
})

test('carausii NU umplu paturile: marfa nu intra intr-un dormitor', () => {
  const { w, zona } = fixturaDormitor(9042)
  const t = ruleaza(w, 1500)
  assert.equal(itemeInZona(w, zona).iteme, 0, 'niciun morman n-are voie sa ajunga in dormitor')
  assert.equal(t.itemeMutate, 0, 'si niciun carat n-are ce cauta aici')
  assert.equal(t.joburiPornite, 0, 'cu zero depozite si zero desemnari, nu exista job')
})

test('un morman CAZUT intr-un dormitor e dus la depozit, nu lasat acolo', () => {
  // Dormitorul are prioritate MAI MARE decat depozitul. Daca
  // `prioritateaLocului` ar citi prioritatea dormitorului, mormanul din el ar
  // parea deja bine asezat — scannerul cere o zona STRICT mai buna — si n-ar mai
  // iesi de acolo niciodata.
  const { w, sit } = laSit(5150, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const dorm = patratPlat(w, sit, 2, 3, 6)
  const dep = patratPlat(w, sit, 2, 10, 40)
  assert.ok(dorm && dep, 'fixtura: nu s-au gasit doua patrate plate')
  const zDorm = picteaza(w, dorm.x0, dorm.y0, 2, 5, R, Zona.DORMIT)
  const zDep = picteaza(w, dep.x0, dep.y0, 2, 2)
  // Mormanul cade CHIAR pe o celula a dormitorului.
  lasaItem(w, Item.PIATRA, 20, dorm.x0, dorm.y0)
  const g = solid(w, dorm.x0, dorm.y0)!
  assert.notEqual(celulaDeZonaLa(w.zone, dorm.x0, dorm.y0, g + 1), -1, 'fixtura: mormanul nu e pe o celula de zona')

  assert.equal(prioritateaLocului(w.zone, dorm.x0, dorm.y0, g + 1), 0, 'o celula de dormit nu are prioritate de depozitare')
  assert.equal(indexZone(w, R).deMutat.length, 1, 'deci mormanul ARE unde sa fie mutat')

  const t = panaCand(w, 3000, (ww) => itemeInZona(ww, zDep).iteme === 1)
  assert.notEqual(t, -1, 'mormanul din dormitor trebuia dus la depozit')
  assert.equal(itemeInZona(w, zDorm).iteme, 0, 'si nu mai are ce cauta in dormitor')
  void cx
  void cy
})

test('„nicio zona" inseamna niciun DEPOZIT, nu nicio zona de niciun fel', () => {
  const { w } = fixturaDormitor(9042)
  indexZone(w, R)
  const is = slotItem(w.iteme, w.iteme.id[0]!)
  assert.notEqual(is, -1)
  assert.equal(w.iteme.ultimulMotiv[is], codMotiv(Reason.FARA_DEPOZIT))
  // Cu un dormitor pictat si zero depozite, cauza corecta ramane
  // „n-ai unde pune", nu „depozitele sunt pline" — nu exista niciun depozit plin.
  assert.equal(w.iteme.ultimulMotivDetaliu[is], DetaliuItem.NICIO_ZONA, 'detaliul trebuie sa fie NICIO_ZONA')
})

// ---------------------------------------------------------------------------
// comanda de pictare
// ---------------------------------------------------------------------------

test('pictarea refuza un fel necunoscut si amestecarea felurilor intr-o zona', () => {
  const { w, sit } = laSit(4477, 1)
  const p = patratPlat(w, sit, 2, 8, 40)
  assert.ok(p, 'fixtura: niciun patrat plat')
  const g = solid(w, p.x0, p.y0)!

  const rau = applyCommand(w, { kind: 'picteazaZona', x0: p.x0, y0: p.y0, x1: p.x0 + 1, y1: p.y0 + 1, z: g + 1, fel: 9 }, R)
  assert.ok(!rau.ok && rau.reason === Reason.VALOARE_INVALIDA, `un fel necunoscut trebuie refuzat: ${JSON.stringify(rau)}`)

  const zona = picteaza(w, p.x0, p.y0, 2, 4, R, Zona.DORMIT)
  const q = patratPlat(w, sit, 2, 41, 60)
  assert.ok(q, 'fixtura: al doilea patrat plat')
  const gq = solid(w, q.x0, q.y0)!
  // O zona are UN fel: indexul o pune intr-o singura lista.
  const amestec = applyCommand(w, { kind: 'picteazaZona', x0: q.x0, y0: q.y0, x1: q.x0 + 1, y1: q.y0 + 1, z: gq + 1, zonaId: zona, fel: Zona.DEPOZIT }, R)
  assert.ok(!amestec.ok && amestec.reason === Reason.VALOARE_INVALIDA, `amestecul de feluri trebuie refuzat: ${JSON.stringify(amestec)}`)
  // Iar extinderea FARA `fel` mosteneste felul zonei, nu cade pe DEPOZIT.
  const extinde = applyCommand(w, { kind: 'picteazaZona', x0: q.x0, y0: q.y0, x1: q.x0 + 1, y1: q.y0 + 1, z: gq + 1, zonaId: zona }, R)
  assert.ok(extinde.ok, `extinderea unui dormitor trebuia sa mearga: ${JSON.stringify(extinde)}`)
  assert.equal(w.zone.kind[0], Zona.DORMIT, 'si felul ramane DORMIT')
})

test('un fel de zona necunoscut dintr-un save e REFUZAT la incarcare', () => {
  const { w, sit } = laSit(4477, 1)
  const p = patratPlat(w, sit, 2, 8, 40)
  assert.ok(p, 'fixtura: niciun patrat plat')
  picteaza(w, p.x0, p.y0, 2)
  const brut = JSON.parse(encode(w)) as { data: { zone: { kind: number[] } } }
  brut.data.zone.kind[0] = 9
  const out = decode(JSON.stringify(brut), R)
  // Tacut, ar cadea pe ramura „nu e depozit" si zona ar deveni inerta: celulele
  // ei ar disparea din index fara ca nimic sa spuna de ce.
  assert.ok(!out.ok && out.reason === Reason.VALOARE_INVALIDA, `un fel de zona necunoscut trebuie refuzat: ${JSON.stringify(out)}`)
})

// ---------------------------------------------------------------------------
// costul luatului dintr-un morman
// ---------------------------------------------------------------------------

test('luatul dintr-un morman murdareste indexul DOAR cand il poate schimba', () => {
  const { w, sit } = laSit(6620, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const p = patratPlat(w, sit, 2, 8, 40)
  assert.ok(p, 'fixtura: niciun patrat plat')
  picteaza(w, p.x0, p.y0, 2)

  // Un morman PE JOS, mult peste `haulCarryMax`, deci `min(cant, haulCarryMax)`
  // nu se schimba la o imbucatura mica.
  const cant = R.itemStackMax
  lasaItem(w, Item.PIATRA, cant, cx + 3, cy)
  const is = slotItem(w.iteme, w.iteme.id[w.iteme.count - 1]!)
  assert.notEqual(is, -1)
  assert.ok(cant - 1 > R.haulCarryMax, 'fixtura: mormanul trebuie sa ramana peste plafonul de carat')

  indexZone(w, R)
  const r0 = w.zone.index.reconstructii
  assert.equal(w.zone.index.murdar, false, 'fixtura: indexul e curat inainte de masuratoare')

  // O imbucatura care nu atinge nici viata mormanului, nici o celula de zona,
  // nici cererea de carat: indexul NU are de ce sa se reconstruiasca.
  iaDinItem(w, R, is, 1)
  assert.equal(w.zone.index.murdar, false, 'o imbucatura inerta nu are voie sa murdareasca indexul')
  indexZone(w, R)
  assert.equal(w.zone.index.reconstructii, r0, 'si deci nu costa nicio reconstructie')

  // Iar cand scade sub plafonul de carat, cererea din `incapeUndeva` se schimba:
  // atunci indexul TREBUIE sa se reconstruiasca.
  iaDinItem(w, R, is, cant - 1 - (R.haulCarryMax - 1))
  assert.equal(w.zone.index.murdar, true, 'scaderea sub plafonul de carat schimba indexul')
  indexZone(w, R)
  assert.equal(w.zone.index.reconstructii, r0 + 1)
})

test('luatul de pe o celula de zona murdareste indexul, si golirea mormanului la fel', () => {
  const { w, sit } = laSit(6620, 1)
  const p = patratPlat(w, sit, 2, 8, 40)
  assert.ok(p, 'fixtura: niciun patrat plat')
  picteaza(w, p.x0, p.y0, 2)
  // Morman IN depozit: locul liber de pe celula lui e chiar ce tine indexul.
  lasaItem(w, Item.PIATRA, R.itemStackMax, p.x0, p.y0)
  const is = slotItem(w.iteme, w.iteme.id[w.iteme.count - 1]!)
  indexZone(w, R)
  assert.equal(w.zone.index.murdar, false)
  iaDinItem(w, R, is, 1)
  assert.equal(w.zone.index.murdar, true, 'o celula de depozit si-a schimbat locul liber')

  // Si golirea de tot, oriunde ar fi: mormanul iese din `deMutat`.
  const { w: w2, sit: s2 } = laSit(6620, 1)
  const p2 = patratPlat(w2, s2, 2, 8, 40)!
  picteaza(w2, p2.x0, p2.y0, 2)
  const cx = cellOf(w2.agents.x[0]!)
  const cy = cellOf(w2.agents.y[0]!)
  lasaItem(w2, Item.PIATRA, 5, cx + 3, cy)
  const is2 = slotItem(w2.iteme, w2.iteme.id[w2.iteme.count - 1]!)
  indexZone(w2, R)
  assert.equal(w2.zone.index.murdar, false)
  iaDinItem(w2, R, is2, 5)
  assert.equal(w2.zone.index.murdar, true, 'un morman care moare schimba indexul')
  assert.equal(w2.iteme.alive[is2], 0)
})
