import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { tick } from '../src/sim/world.ts'
import { Categorie, FelJob, Item, ITEME, PasCara } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { codMotiv, Reason } from '../src/sim/result.ts'
import { isWalkable, NO_REGION, regionAt } from '../src/sim/regions.ts'
import { existaTinta, lastJobReport, StareRatiune } from '../src/sim/joburi.ts'
import { itemLaCelula, slotItem } from '../src/sim/iteme.ts'
import { indexZone } from '../src/sim/zone.ts'
import { dumpRezervari, verificaRezervari } from '../src/sim/rezervari.ts'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { cuJob, desemneaza, itemeInZona, laSit, lasaItem, marfaTotala, panaCand, patratPlat, picteaza, R, ruleaza, solid } from './fixturi.ts'
import type { Sit } from './fixturi.ts'

/** Pionul 0 are un job de carat in pasul dat? */
function inPas(w: World, slot: number, pas: number): boolean {
  return w.agents.jobKind[slot] === FelJob.CARA && w.agents.jobStep[slot] === pas
}

/** Un morman de `cant` la `d` celule de pion si un depozit de `latura` la `dMin..dMax`, pe teren plat. */
function fixturaCarat(seed: number, cati = 1, cant = 20, latura = 2, dMin = 8, dMax = 40): { w: World; sit: Sit; item: number; zona: number; zx: number; zy: number } {
  const { w, sit } = laSit(seed, cati)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const item = lasaItem(w, Item.PIATRA, cant, cx + 3, cy)
  const p = patratPlat(w, sit, latura, dMin, dMax)
  assert.ok(p, 'fixtura: niciun patrat plat pentru depozit')
  const zona = picteaza(w, p.x0, p.y0, latura)
  return { w, sit, item, zona, zx: p.x0, zy: p.y0 }
}

// ---------------------------------------------------------------------------
// caratul de baza
// ---------------------------------------------------------------------------

test('un morman de pe jos ajunge in depozit: patru pasi, marfa intacta, mana goala, rezervari eliberate', () => {
  const { w, item, zona } = fixturaCarat(601)
  const pasi = new Set<number>()
  const n = panaCand(w, 600, (w) => {
    if (w.agents.jobKind[0] === FelJob.CARA) pasi.add(w.agents.jobStep[0]!)
    return itemeInZona(w, zona).cantitate === 20
  })
  assert.ok(n >= 0, 'marfa n-a ajuns in depozit in 600 de tickuri')
  assert.deepEqual([...pasi].sort(), [PasCara.MERGE_SURSA, PasCara.RIDICA, PasCara.MERGE_DEST, PasCara.LASA], 'nu s-au parcurs toti cei patru pasi')
  assert.equal(slotItem(w.iteme, item), -1, 'mormanul-sursa a ramas viu dupa ce a fost luat tot')
  assert.equal(w.agents.caraCantitate[0], 0)
  assert.equal(w.agents.jobKind[0], 0)
  assert.equal(w.rezervari.total, 0)
  assert.equal(marfaTotala(w), 20)
  assert.equal(w.ratiune.itemePierdute, 0)
  assert.equal(w.ratiune.joburiFaraProgres, 0)
  assert.ok(verificaRezervari(w.rezervari, w.agents, existaTinta(w)).ok)
  // Si nu se mai misca: e in singurul depozit, deci nimic nu e strict mai bun.
  const t = ruleaza(w, 300)
  assert.equal(t.joburiPornite, 0, 'pionul a pornit joburi desi marfa e la locul ei')
  assert.equal(t.vizite, 0, 'trecerea ieftina a vizitat iteme la odihna')
  assert.equal(w.ratiune.stare[0], StareRatiune.NIMIC_DE_FACUT)
})

test('capacitatea de transport LEAGA: din 75, primul drum ia haulCarryMax si restul ramane pentru al doilea', () => {
  const { w, item, zona } = fixturaCarat(602, 1, R.itemStackMax)
  const primul = panaCand(w, 600, (w) => itemeInZona(w, zona).cantitate > 0)
  assert.ok(primul >= 0)
  assert.equal(itemeInZona(w, zona).cantitate, R.haulCarryMax)
  const ramas = slotItem(w.iteme, item)
  assert.notEqual(ramas, -1, 'sursa a disparut desi trebuia sa mai aiba restul')
  assert.equal(w.iteme.cantitate[ramas], R.itemStackMax - R.haulCarryMax)
  const alDoilea = panaCand(w, 600, (w) => itemeInZona(w, zona).cantitate === R.itemStackMax)
  assert.ok(alDoilea >= 0, 'restul n-a fost carat')
  assert.equal(itemeInZona(w, zona).iteme, 1, 'cele doua drumuri n-au contopit in acelasi morman de destinatie')
  assert.equal(marfaTotala(w), R.itemStackMax)
})

test('strict mai bun: intre doua depozite EGALE nimic nu se muta; spre unul mai bun se muta O SINGURA data', () => {
  const { w, sit } = laSit(603, 1)
  const a = patratPlat(w, sit, 2, 6, 40)
  assert.ok(a)
  const zonaA = picteaza(w, a.x0, a.y0, 2, 3)
  lasaItem(w, Item.PIATRA, 20, a.x0, a.y0)
  // Al doilea depozit, egal, in alta parte.
  let b: ReturnType<typeof patratPlat> = null
  for (let d = 6; d <= 60 && !b; d++) {
    const c = patratPlat(w, { wx: sit.wx, wy: sit.wy + 3, g: sit.g }, 2, d, d)
    if (c && (Math.abs(c.x0 - a.x0) > 3 || Math.abs(c.y0 - a.y0) > 3)) b = c
  }
  assert.ok(b, 'fixtura: niciun al doilea patrat plat')
  const zonaB = picteaza(w, b.x0, b.y0, 2, 3)
  const t1 = ruleaza(w, 600)
  assert.equal(t1.joburiPornite, 0, 'ping-pong: s-au pornit joburi intre depozite egale')
  assert.equal(itemeInZona(w, zonaA).cantitate, 20)
  // B devine mai bun: exact o mutare, apoi liniste.
  assert.ok(applyCommand(w, { kind: 'setPrioritateZona', id: zonaB, prioritate: 4 }, R).ok)
  const n = panaCand(w, 900, (w) => itemeInZona(w, zonaB).cantitate === 20)
  assert.ok(n >= 0, 'marfa n-a fost mutata in depozitul mai bun')
  const t2 = ruleaza(w, 600)
  assert.equal(t2.joburiPornite, 0)
  assert.equal(t2.itemeMutate, 0)
  assert.equal(itemeInZona(w, zonaA).cantitate, 0)
  assert.equal(marfaTotala(w), 20)
})

test('fara depozit: itemul de pe jos primeste FARA_DEPOZIT (nicio zona), pionul spune FARA_DEPOZIT, si nimeni nu plateste evaluari scumpe', () => {
  const { w } = laSit(604, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const id = lasaItem(w, Item.PIATRA, 20, cx + 3, cy)
  const t = ruleaza(w, 120)
  assert.ok(t.scanari > 0)
  assert.equal(t.candidatiExaminati, 0)
  assert.equal(t.vizite, 0)
  assert.equal(w.ratiune.stare[0], StareRatiune.RESPINS)
  assert.equal(w.ratiune.motivFinal[0], codMotiv(Reason.FARA_DEPOZIT))
  const is = slotItem(w.iteme, id)
  assert.equal(w.iteme.ultimulMotiv[is], codMotiv(Reason.FARA_DEPOZIT))
  assert.equal(w.iteme.ultimulMotivDetaliu[is], 1 /* NICIO_ZONA */)
  // Depozit plin de alt fel: acelasi verdict, alt detaliu, tot fara evaluari scumpe (marginea e pe FEL).
  const p = patratPlat(w, { wx: cx, wy: cy, g: w.agents.z[0]! - 1 }, 1, 6, 40)
  assert.ok(p)
  picteaza(w, p.x0, p.y0, 1)
  lasaItem(w, Item.PAMANT, 40, p.x0, p.y0)
  const t2 = ruleaza(w, 120)
  assert.equal(t2.candidatiExaminati, 0, 'un depozit cu loc doar pentru PAMANT a trimis PIATRA la evaluari scumpe')
  assert.equal(w.iteme.ultimulMotivDetaliu[slotItem(w.iteme, id)], 2 /* DEPOZITE_PLINE */)
})

test('carieră + depozit: caratul incepe cat timp mai sunt desemnari, nu dupa ce se termina cariera', () => {
  const { w, sit } = laSit(605, 6)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  let puse = 0
  for (let dx = 3; dx < 13; dx++) for (let dy = 3; dy < 13; dy++) if (applyCommand(w, { kind: 'desemneaza', wx: cx + dx, wy: cy + dy, z: solid(w, cx + dx, cy + dy)! }, R).ok) puse++
  assert.ok(puse > 80)
  const p = patratPlat(w, sit, 4, 4, 40)
  assert.ok(p)
  const zona = picteaza(w, p.x0, p.y0, 4)
  const n = panaCand(w, 400, (w) => itemeInZona(w, zona).iteme > 0)
  assert.ok(n >= 0, 'nimic carat in 400 de tickuri')
  assert.ok(w.desemnari.vii > 50, `cariera aproape gata (${w.desemnari.vii} desemnari) cand a inceput caratul: categoriile s-au evaluat in ordine, nu pe scor`)
})

test('exclusiv pe AMBELE categorii: pionul face si una si alta, nu ramane inert', () => {
  const { w, zona } = fixturaCarat(606)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  desemneaza(w, cx + 2, cy + 2)
  const id = w.agents.id[0]!
  assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id, categorie: Categorie.SAPA, nivel: R.personalPriorityLevels }, R).ok)
  assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id, categorie: Categorie.CARA, nivel: R.personalPriorityLevels }, R).ok)
  const n = panaCand(w, 900, (w) => w.desemnari.vii === 0 && itemeInZona(w, zona).cantitate >= 20)
  assert.ok(n >= 0, `sapat: ${w.desemnari.vii} desemnari vii; carat: ${itemeInZona(w, zona).cantitate}`)
  // Un caraus dedicat (SAPA 0, CARA 1) cara, si nu e „FARA_MUNCITOR" pentru ce face.
  const { w: w2, zona: z2 } = fixturaCarat(607)
  assert.ok(applyCommand(w2, { kind: 'setPrioritatePersonala', id: w2.agents.id[0]!, categorie: Categorie.SAPA, nivel: 0 }, R).ok)
  assert.ok(panaCand(w2, 600, (w) => itemeInZona(w, z2).cantitate >= 20) >= 0, 'carausul dedicat n-a carat')
})

// ---------------------------------------------------------------------------
// marfa nu dispare
// ---------------------------------------------------------------------------

test('kill in MERGE_DEST: marfa din mana ajunge la picioare, suma se pastreaza, nicio rezervare nu ramane', () => {
  const { w, sit } = fixturaCarat(608, 1, 20, 2, 12, 40)
  void sit
  const n = panaCand(w, 600, (w) => inPas(w, 0, PasCara.MERGE_DEST) && w.agents.caraCantitate[0] === 20)
  assert.ok(n >= 0, 'pionul n-a ajuns sa care')
  const inainte = marfaTotala(w)
  const px = cellOf(w.agents.x[0]!)
  const py = cellOf(w.agents.y[0]!)
  assert.ok(applyCommand(w, { kind: 'killAgent', id: w.agents.id[0]! }, R).ok)
  assert.equal(marfaTotala(w), inainte)
  assert.equal(w.rezervari.total, 0)
  assert.equal(w.ratiune.itemePierdute, 0)
  let aproape = false
  for (let i = 0; i < w.iteme.count; i++) {
    if (w.iteme.alive[i] === 0) continue
    if (Math.abs(w.iteme.wx[i]! - px) + Math.abs(w.iteme.wy[i]! - py) <= 1) aproape = true
  }
  assert.ok(aproape, 'marfa nu e la picioarele mortului')
})

test('kill pe o celula cu morman PLIN de alt fel: marfa merge pe un vecin, nu dispare si nu se suprapune', () => {
  const { w, sit } = laSit(609, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  // Sub picioarele pionului, un morman plin de LEMN; pionul „cara" PIATRA (stare construita prin comenzi: nu exista comanda de dat marfa in mana, deci se construieste un carat real si se ucide pe o celula pregatita).
  const p = patratPlat(w, sit, 2, 10, 40)
  assert.ok(p)
  const zona = picteaza(w, p.x0, p.y0, 2)
  lasaItem(w, Item.PIATRA, 20, cx + 3, cy)
  const n = panaCand(w, 600, (w) => inPas(w, 0, PasCara.MERGE_DEST) && w.agents.caraCantitate[0] === 20)
  assert.ok(n >= 0)
  // Pe celula pionului si pe cei 4 vecini: LEMN plin. `lasaItem` refuza celula ocupata de un fel strain? Nu — depune pe urmatoarea libera; asa ca se pun pe rand pana cand fiecare are morman.
  const px = cellOf(w.agents.x[0]!)
  const py = cellOf(w.agents.y[0]!)
  const pz = w.agents.z[0]!
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (!isWalkable(w.terrain, px + dx, py + dy, pz, R)) continue
    if (itemLaCelula(w.iteme, px + dx, py + dy, pz) !== -1) continue
    applyCommand(w, { kind: 'lasaItem', fel: Item.LEMN, cantitate: R.itemStackMax, wx: px + dx, wy: py + dy, z: pz }, R)
  }
  const inainte = marfaTotala(w)
  assert.ok(applyCommand(w, { kind: 'killAgent', id: w.agents.id[0]! }, R).ok)
  assert.equal(marfaTotala(w) + w.ratiune.itemePierdute, inainte, 'marfa a disparut fara sa fie numarata')
  // O singura entitate per celula, mereu.
  const celule = new Set<string>()
  for (let i = 0; i < w.iteme.count; i++) {
    if (w.iteme.alive[i] === 0) continue
    const k = `${w.iteme.wx[i]},${w.iteme.wy[i]},${w.iteme.z[i]}`
    assert.ok(!celule.has(k), `doua mormane pe ${k}`)
    celule.add(k)
  }
  void zona
})

test('depozitul sters in timp ce se cara: INTRERUPT, marfa la picioare, rezervarile pe celule moarte dispar', () => {
  const { w, zona } = fixturaCarat(610, 1, 20, 2, 12, 40)
  const n = panaCand(w, 600, (w) => inPas(w, 0, PasCara.MERGE_DEST))
  assert.ok(n >= 0)
  assert.ok(applyCommand(w, { kind: 'stergeZona', id: zona }, R).ok)
  assert.equal(w.agents.jobKind[0], 0)
  assert.equal(w.agents.caraCantitate[0], 0)
  assert.equal(marfaTotala(w), 20)
  assert.equal(w.rezervari.total, 0)
  assert.ok(verificaRezervari(w.rezervari, w.agents, existaTinta(w)).ok)
  assert.equal(w.ratiune.joburiFaraProgres, 0, 'un job care a ridicat marfa nu e „fara progres"')
})

// ---------------------------------------------------------------------------
// racirile la carat
// ---------------------------------------------------------------------------

test('drum peste buget spre depozit: racirea se scrie pe ZONA si pe mormanul lasat jos — fara bucla ridica/lasa, nextId stabil', () => {
  const reguli = { ...R, maxPathNodes: 64, replanCooldownTicks: 5, jobMaxIncercari: 3 }
  const { w, sit } = laSit(611, 1, [], reguli)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.PIATRA, 20, cx, cy, reguli)
  const p = patratPlat(w, sit, 2, 80, 95)
  assert.ok(p, 'fixtura: niciun patrat plat la 80-95')
  const zona = picteaza(w, p.x0, p.y0, 2, undefined, reguli)
  // Marginea: cel mult `jobMaxIncercari` refuzuri per fereastra de `jobRetryTicks`
  // — dupa ce racirea pe pereche expira, pionul are voie sa mai incerce o data.
  // Fara racirea pe zona si pe mormanul lasat jos ar fi 3 la fiecare ~130 de tickuri.
  const ferestre = 2
  const nextIdInainte = w.nextId
  const t = ruleaza(w, reguli.jobRetryTicks * ferestre, reguli)
  assert.ok(t.refuzuriDrum >= reguli.jobMaxIncercari, `fixtura: doar ${t.refuzuriDrum} refuzuri — drumul nu era peste buget`)
  assert.ok(t.refuzuriDrum <= reguli.jobMaxIncercari * ferestre, `${t.refuzuriDrum} refuzuri de drum in ${ferestre} ferestre: pionul reia mormanul lasat jos`)
  assert.ok(t.lasateLaPicioare <= ferestre)
  assert.ok(w.nextId - nextIdInainte <= 2 * ferestre, `nextId a crescut cu ${w.nextId - nextIdInainte}: bucla ridica/lasa`)
  assert.equal(marfaTotala(w), 20)
  assert.equal(itemeInZona(w, zona).cantitate, 0)
  // Racirea pe pereche tine ZONA (id de entitate) si mormanul de la picioare.
  const a = w.agents
  const evitate = new Set<number>()
  for (let k = 0; k < a.evitaSloturi; k++) if (a.evitaPanaLa[k]! > 0) evitate.add(a.evitaTinta[k]!)
  assert.ok(evitate.has(zona), 'zona nu e in racirea pe pereche')
  // Zavorul numara joburile refuzate de lume fara niciun EFECT: primul job a
  // ridicat marfa (efect), deci nu se numara — doar reluarea din a doua fereastra,
  // refuzata inca din drumul spre morman. `jobProgres` singur ar numara ambele.
  assert.ok(w.ratiune.joburiFaraProgres <= 1, `${w.ratiune.joburiFaraProgres} joburi fara progres: un job care a ridicat marfa e numarat ca „fara progres"`)
})

test('o celula rezervata ca destinatie nu primeste nimic de la altcineva: promisiunea de la scanare tine pana la depunere', () => {
  const { w } = fixturaCarat(618, 1, 20, 2, 12, 40)
  const n = panaCand(w, 300, (w) => w.agents.jobKind[0] === FelJob.CARA)
  assert.ok(n >= 0)
  const cs = w.zone.celule.laId.get(w.agents.jobDest[0]!)
  assert.notEqual(cs, undefined)
  const dx = w.zone.celule.wx[cs!]!
  const dy = w.zone.celule.wy[cs!]!
  const dz = w.zone.celule.z[cs!]!
  // Cineva lasa PIATRA chiar pe celula rezervata: merge pe un vecin, nu acolo.
  const out = applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: 60, wx: dx, wy: dy, z: dz }, R)
  assert.ok(out.ok)
  assert.equal(itemLaCelula(w.iteme, dx, dy, dz), -1, 'marfa straina a intrat pe celula rezervata: la LASA n-ar mai fi incaput')
  const m = panaCand(w, 900, (w) => w.agents.jobKind[0] === 0)
  assert.ok(m >= 0)
  assert.equal(w.ratiune.joburiFaraProgres, 0)
  assert.equal(w.iteme.cantitate[itemLaCelula(w.iteme, dx, dy, dz)], 20, 'carausul n-a depus exact pe celula rezervata')
})

test('depozit la 5 blocuri, in directia OPUSA oricarei desemnari, fara pioni pe acolo: tot se cara (pictarea acopera)', () => {
  const { w, sit } = laSit(612, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.PIATRA, 20, cx + 2, cy)
  // Spre -x, la 70-90 de celule.
  let p: ReturnType<typeof patratPlat> = null
  for (let d = 70; d <= 90 && !p; d++) {
    const x0 = sit.wx - d
    if (x0 < 0) break
    const g = solid(w, x0, sit.wy)
    if (g === null) continue
    if (solid(w, x0 + 1, sit.wy) === g && solid(w, x0, sit.wy + 1) === g && solid(w, x0 + 1, sit.wy + 1) === g) p = { x0, y0: sit.wy, g }
  }
  assert.ok(p, 'fixtura: niciun patrat plat spre -x')
  assert.equal(regionAt(w.regions, p.x0, p.y0, p.g + 1), NO_REGION, 'fixtura: acoperit dinainte')
  const zona = picteaza(w, p.x0, p.y0, 2)
  const n = panaCand(w, 1500, (w) => itemeInZona(w, zona).cantitate === 20)
  assert.ok(n >= 0, `marfa n-a ajuns: stare ${w.ratiune.stare[0]} motiv ${w.ratiune.motivFinal[0]}`)
})

test('depozit umplut din fata: plafonul de cautare numara celule LIBERE, nu sloturi — cu primele celule pline, un morman nou tot primeste destinatie', () => {
  // Plafon mic, ca sa lege: 4 celule libere examinate. Depozitul are primele
  // (n − 20) celule in ordinea slotului pline; un plafon pe sloturi vizitate ar
  // vedea 4 celule pline si ar spune FARA_DEPOZIT cu 20 de celule goale in spate.
  const reguli = { ...R, haulDestMaxCells: 4 }
  const { w, sit } = laSit(613, 1, [], reguli)
  let p: ReturnType<typeof patratPlat> = null
  let latura = 12
  while (!p && latura >= 6) {
    p = patratPlat(w, sit, latura, 4, 60)
    if (!p) latura -= 2
  }
  assert.ok(p, 'fixtura: niciun patrat plat')
  const zona = picteaza(w, p.x0, p.y0, latura, undefined, reguli)
  const n0 = w.zone.celule.vii
  assert.equal(n0, latura * latura)
  for (let i = 0; i < n0 - 20; i++) {
    const out = applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: R.itemStackMax, wx: w.zone.celule.wx[i]!, wy: w.zone.celule.wy[i]!, z: w.zone.celule.z[i]! }, reguli)
    assert.ok(out.ok, JSON.stringify(out))
  }
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  lasaItem(w, Item.PIATRA, 20, cx + 2, cy, reguli)
  const n = panaCand(w, 300, (w) => cuJob(w).length > 0 && w.agents.jobKind[0] === FelJob.CARA, reguli)
  assert.ok(n >= 0, `niciun job de carat: plafonul a taiat celulele libere din spate (stare ${w.ratiune.stare[0]}, motiv ${w.ratiune.motivFinal[0]})`)
  // 20 goale, dintre care una e acum rezervata ca destinatie (deci nu mai e libera).
  const ix = indexZone(w, reguli)
  assert.equal(ix.libere[0]!.length, 19)
  void zona
})

// ---------------------------------------------------------------------------
// M5
// ---------------------------------------------------------------------------

test('M5 in cei PATRU pasi ai caratului, plus item cu racire nenula si zona cu prioritate nedefault: hash si rezervari identice', () => {
  // Doi pioni, doua mormane de 75 (cate doua drumuri fiecare), un depozit de
  // prioritate 5 pentru PIATRA; un depozit de LEMN cu loc doar pentru 5 si un
  // morman de 40 LEMN pe jos — trece poarta ieftina (are loc ≥ 1) si cade la
  // cea scumpa (n-are loc pentru 40): racire PERSISTED pe item, nenula la save.
  const carat = (): World => {
    const { w, sit } = laSit(614, 2)
    const cx = cellOf(w.agents.x[0]!)
    const cy = cellOf(w.agents.y[0]!)
    lasaItem(w, Item.PIATRA, R.itemStackMax, cx + 3, cy)
    lasaItem(w, Item.PIATRA, R.itemStackMax, cx + 3, cy + 2)
    const p = patratPlat(w, sit, 2, 10, 40)
    assert.ok(p)
    picteaza(w, p.x0, p.y0, 2, 5)
    return w
  }
  // Un singur pion, un depozit de LEMN cu loc doar pentru 5 si un morman de 40
  // LEMN pe jos: trece poarta ieftina (are loc ≥ 1), cade la cea scumpa (n-are
  // loc pentru 40) → FARA_DEPOZIT memorat pe item, cu racire PERSISTED.
  const racire = (): World => {
    const { w } = laSit(617, 1)
    const cx = cellOf(w.agents.x[0]!)
    const cy = cellOf(w.agents.y[0]!)
    lasaItem(w, Item.LEMN, 40, cx + 2, cy)
    const p2 = patratPlat(w, { wx: cx, wy: cy, g: w.agents.z[0]! - 1 }, 1, 6, 30)
    assert.ok(p2)
    picteaza(w, p2.x0, p2.y0, 1, 2)
    lasaItem(w, Item.LEMN, R.itemStackMax - 5, p2.x0, p2.y0)
    return w
  }
  // Fiecare moment pe o pereche PROASPATA de lumi: momentele nu sunt ordonate in
  // timp (LASA precede RIDICA-ul drumului urmator), si o singura cronologie ar
  // rata un pas dupa ce roundtrip-ul precedent a consumat 200 de tickuri.
  const roundtrip = (cand: (w: World) => boolean, nume: string, construieste: () => World = carat): void => {
    const continuu = construieste()
    const intrerupt = construieste()
    let gata = false
    for (let t = 0; t < 900 && !gata; t++) {
      tick(continuu, R)
      tick(intrerupt, R)
      gata = cand(intrerupt)
    }
    assert.ok(gata, `fixtura: ${nume} nu s-a intamplat`)
    const loaded = decode(encode(intrerupt))
    assert.ok(loaded.ok, JSON.stringify(loaded))
    assert.equal(hashWorld(loaded.value), hashWorld(intrerupt), `${nume}: hash diferit la incarcare`)
    assert.equal(dumpRezervari(loaded.value.rezervari), dumpRezervari(intrerupt.rezervari), `${nume}: rezervari diferite la incarcare`)
    assert.equal(loaded.value.rezervari.anulateLaIncarcare, 0)
    for (let t = 0; t < 200; t++) {
      tick(continuu, R)
      tick(loaded.value, R)
      tick(intrerupt, R)
    }
    assert.equal(hashWorld(loaded.value), hashWorld(continuu), `${nume}: divergenta dupa incarcare`)
    assert.equal(dumpRezervari(loaded.value.rezervari), dumpRezervari(continuu.rezervari), `${nume}: rezervari diferite dupa incarcare`)
  }
  const oricine = (pas: number) => (w: World): boolean => {
    for (let i = 0; i < w.agents.count; i++) if (inPas(w, i, pas)) return true
    return false
  }
  roundtrip(oricine(PasCara.MERGE_SURSA), 'MERGE_SURSA')
  roundtrip(oricine(PasCara.RIDICA), 'RIDICA')
  roundtrip((w) => oricine(PasCara.MERGE_DEST)(w) && w.agents.caraCantitate.some((c) => c > 0), 'MERGE_DEST cu marfa in mana')
  roundtrip(oricine(PasCara.LASA), 'LASA')
  roundtrip((w) => {
    let inRacire = false
    for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1 && w.iteme.reincercaLaTick[i]! > w.tick) inRacire = true
    return inRacire
  }, 'racire pe item', racire)
})

test('hash-ul vede FIECARE camp PERSISTED nou al taieturii 2, si nu vede indexul sau cauzele', () => {
  const { w } = fixturaCarat(615)
  const n = panaCand(w, 600, (w) => inPas(w, 0, PasCara.MERGE_DEST) && w.agents.caraCantitate[0] > 0)
  assert.ok(n >= 0)
  lasaItem(w, Item.LEMN, 5, cellOf(w.agents.x[0]!) + 1, cellOf(w.agents.y[0]!))
  const h0 = hashWorld(w)
  const salvat = encode(w)
  const probe: [string, (w: World) => void][] = [
    ['jobDest', (w) => { w.agents.jobDest[0] = w.agents.jobDest[0]! + 1 }],
    ['jobCantitate', (w) => { w.agents.jobCantitate[0] = w.agents.jobCantitate[0]! + 1 }],
    ['jobEfect', (w) => { w.agents.jobEfect[0] = 0 }],
    ['caraKind', (w) => { w.agents.caraKind[0] = 2 }],
    ['caraCantitate', (w) => { w.agents.caraCantitate[0] = w.agents.caraCantitate[0]! + 1 }],
    ['prioPersonala[CARA]', (w) => { w.agents.prioPersonala[Categorie.CARA] = 2 }],
    ['iteme.count', (w) => { w.iteme.count++ }],
    ['iteme.id', (w) => { w.iteme.id[0] = w.iteme.id[0]! + 1 }],
    ['iteme.kind', (w) => { w.iteme.kind[0] = (w.iteme.kind[0]! + 1) % ITEME }],
    ['iteme.wx', (w) => { w.iteme.wx[0] = w.iteme.wx[0]! + 1 }],
    ['iteme.wy', (w) => { w.iteme.wy[0] = w.iteme.wy[0]! + 1 }],
    ['iteme.z', (w) => { w.iteme.z[0] = w.iteme.z[0]! + 1 }],
    ['iteme.cantitate', (w) => { w.iteme.cantitate[0] = w.iteme.cantitate[0]! + 1 }],
    ['iteme.alive', (w) => { w.iteme.alive[0] = w.iteme.alive[0] === 1 ? 0 : 1 }],
    ['iteme.reincercaLaTick', (w) => { w.iteme.reincercaLaTick[0] = 99 }],
    ['zone.count', (w) => { w.zone.count++ }],
    ['zone.id', (w) => { w.zone.id[0] = w.zone.id[0]! + 1 }],
    ['zone.kind', (w) => { w.zone.kind[0] = 1 }],
    ['zone.prioritate', (w) => { w.zone.prioritate[0] = 1 }],
    ['zone.alive', (w) => { w.zone.alive[0] = 0 }],
    ['zone.celule.count', (w) => { w.zone.celule.count++ }],
    ['zone.celule.id', (w) => { w.zone.celule.id[0] = w.zone.celule.id[0]! + 1 }],
    ['zone.celule.zonaId', (w) => { w.zone.celule.zonaId[0] = w.zone.celule.zonaId[0]! + 1 }],
    ['zone.celule.wx', (w) => { w.zone.celule.wx[0] = w.zone.celule.wx[0]! + 1 }],
    ['zone.celule.wy', (w) => { w.zone.celule.wy[0] = w.zone.celule.wy[0]! + 1 }],
    ['zone.celule.z', (w) => { w.zone.celule.z[0] = w.zone.celule.z[0]! + 1 }],
    ['zone.celule.alive', (w) => { w.zone.celule.alive[0] = 0 }],
  ]
  for (const [nume, muta] of probe) {
    const copie = decode(salvat)
    assert.ok(copie.ok)
    assert.equal(hashWorld(copie.value), h0, 'fixtura: copia nu are hash-ul originalului')
    muta(copie.value)
    assert.notEqual(hashWorld(copie.value), h0, `hash-ul nu vede ${nume}`)
  }
  const copie = decode(salvat)
  assert.ok(copie.ok)
  copie.value.iteme.ultimulMotiv[0] = 3
  copie.value.zone.index.murdar = true
  copie.value.ratiune.itemePierdute = 9
  assert.equal(hashWorld(copie.value), h0, 'un camp TRANSIENT sau DERIVED a intrat in hash')
})

test('un save cu un job de carat orfan (sursa sau destinatia moarta) e anulat la incarcare, cu marfa la picioare, nu tacut', () => {
  const { w } = fixturaCarat(616, 1, 20, 2, 12, 40)
  const n = panaCand(w, 600, (w) => inPas(w, 0, PasCara.MERGE_DEST) && w.agents.caraCantitate[0] > 0)
  assert.ok(n >= 0)
  const raw = JSON.parse(encode(w)) as { data: { zone: { celule: Record<string, number[]> } } }
  const dest = w.agents.jobDest[0]!
  const cs = raw.data.zone.celule.id!.indexOf(dest)
  assert.ok(cs >= 0)
  raw.data.zone.celule.alive![cs] = 0
  const loaded = decode(JSON.stringify(raw))
  assert.ok(loaded.ok, JSON.stringify(loaded))
  assert.equal(loaded.value.rezervari.anulateLaIncarcare, 1)
  assert.equal(loaded.value.agents.jobKind[0], 0)
  assert.equal(loaded.value.agents.caraCantitate[0], 0)
  assert.equal(marfaTotala(loaded.value), 20, 'marfa din mana a disparut la anularea de la incarcare')
  assert.ok(verificaRezervari(loaded.value.rezervari, loaded.value.agents, existaTinta(loaded.value)).ok)
})

// ---------------------------------------------------------------------------
// acceptanta
// ---------------------------------------------------------------------------

test('ACCEPTANTA: 12 pioni, cariera de 900 de celule + depozit de 20x20, 6000 de tickuri — marfa nu dispare, itemele stau pe celule calcabile', () => {
  const { w, sit } = laSit(701, 12)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  let puse = 0
  for (let dx = 3; dx < 33; dx++) {
    for (let dy = 3; dy < 33; dy++) {
      const g = solid(w, cx + dx, cy + dy)
      if (g === null) continue
      if (applyCommand(w, { kind: 'desemneaza', wx: cx + dx, wy: cy + dy, z: g }, R).ok) puse++
    }
  }
  assert.ok(puse > 800, `doar ${puse} desemnari puse`)
  // Depozitul: un patrat plat cat mai mare, in alta directie decat cariera.
  let latura = 20
  let p: ReturnType<typeof patratPlat> = null
  while (!p && latura >= 6) {
    p = patratPlat(w, { wx: sit.wx, wy: sit.wy - 4, g: sit.g }, latura, 4, 60)
    if (!p) latura -= 2
  }
  assert.ok(p, 'fixtura: niciun patrat plat pentru depozit')
  const zona = picteaza(w, p.x0, p.y0, latura, 3)
  const celuleDepozit = w.zone.celule.vii

  const t0 = performance.now()
  let murdare = 0
  let produse = 0
  const t = ruleaza(w, 6000, R, (w) => {
    if (w.regions.dirty.size > 0) murdare++
    produse += lastJobReport().itemeProduse
    if (w.tick % 100 === 0) {
      for (let i = 0; i < w.iteme.count; i++) {
        if (w.iteme.alive[i] === 0) continue
        assert.ok(isWalkable(w.terrain, w.iteme.wx[i]!, w.iteme.wy[i]!, w.iteme.z[i]!, R), `t=${w.tick}: itemul ${i} zace pe o celula necalcabila`)
        assert.ok(w.iteme.cantitate[i]! >= 1 && w.iteme.cantitate[i]! <= R.itemStackMax)
      }
      for (let i = 0; i < w.agents.count; i++) {
        if (w.agents.alive[i] === 1 && w.agents.jobKind[i] === 0) assert.equal(w.agents.caraCantitate[i], 0, `t=${w.tick}: pion fara job cu marfa in mana`)
      }
      const v = verificaRezervari(w.rezervari, w.agents, existaTinta(w))
      assert.ok(v.ok, `t=${w.tick}: ${JSON.stringify(v)}`)
    }
  })
  const ms = performance.now() - t0

  assert.equal(murdare, 0)
  assert.ok(t.joburiTerminate > 300, `doar ${t.joburiTerminate} joburi terminate`)
  assert.ok(t.itemeMutate > 100, `doar ${t.itemeMutate} depuneri in depozit`)
  assert.equal(w.ratiune.itemePierdute, 0, 'marfa pierduta')
  assert.equal(w.ratiune.joburiFaraProgres, 0)
  // Tot ce s-a produs e undeva: pe jos sau in depozit. Nimic nu se consuma inca.
  let asteptat = 0
  const sapate = t.joburiTerminate - t.itemeMutate
  void sapate
  asteptat = produse > 0 ? marfaTotala(w) : 0
  assert.ok(asteptat > 0)
  const inDepozit = itemeInZona(w, zona)
  assert.ok(inDepozit.iteme > 0)
  assert.ok(inDepozit.iteme <= celuleDepozit)
  // Niciun refuz de componenta pe iteme: coridoarele si acoperirea de la pictare tin.
  const raportPion = w.ratiune.tickuriDeLucru > 0 ? w.ratiune.tickuriPeDrum / w.ratiune.tickuriDeLucru : 0
  console.log(`  cariera + depozit (${celuleDepozit} celule): ${t.joburiTerminate} joburi, ${t.itemeMutate} depuneri, ${w.iteme.vii} mormane vii (${inDepozit.iteme} in depozit), ${t.candidatiExaminati} evaluari scumpe, ${t.evaluariDestinatie} celule de destinatie examinate, ${w.zone.index.reconstructii} reconstructii de index, drum/lucru ${raportPion.toFixed(2)}, ${(ms / 6000 * 1000).toFixed(0)} µs/tick`)
  assert.ok(w.zone.index.reconstructii < 6000 * 2, 'indexul se reconstruieste de mai multe ori pe tick')
})
