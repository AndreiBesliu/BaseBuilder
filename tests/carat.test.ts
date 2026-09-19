import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { tick } from '../src/sim/world.ts'
import { Categorie, FelJob, Item, ITEME, PasCara } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { fill } from '../src/sim/terrain/terrain.ts'
import { codMotiv, Reason } from '../src/sim/result.ts'
import { find, isWalkable, markDirty, NO_REGION, regionAt } from '../src/sim/regions.ts'
import { drumRefuzat, esteEvitata, evitaTinta, existaTinta, lastJobReport, StareRatiune } from '../src/sim/joburi.ts'
import { itemLaCelula, locPeCelula, slotItem } from '../src/sim/iteme.ts'
import { celulaDeZonaLa, indexZone } from '../src/sim/zone.ts'
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

test('trecerea ieftina vede DOAR ce are unde sa fie mutat: 36 de mormane la odihna in depozit nu costa nicio vizita', () => {
  // K05 in forma pura: itemele din depozit traiesc cat colonia. Cu un singur
  // morman de carat pe jos, o scanare viziteaza exact un item, nu 37.
  const { w, sit } = laSit(619, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const a = patratPlat(w, sit, 6, 4, 40)
  assert.ok(a, 'fixtura: niciun patrat plat de 6')
  picteaza(w, a.x0, a.y0, 6, 3)
  for (let i = 0; i < 36; i++) {
    const out = applyCommand(w, { kind: 'lasaItem', fel: Item.PAMANT, cantitate: R.itemStackMax, wx: w.zone.celule.wx[i]!, wy: w.zone.celule.wy[i]!, z: w.zone.celule.z[i]! }, R)
    assert.ok(out.ok, JSON.stringify(out))
  }
  let b: ReturnType<typeof patratPlat> = null
  for (let d = 6; d <= 40 && !b; d++) {
    const c = patratPlat(w, { wx: cx, wy: cy, g: w.agents.z[0]! - 1 }, 1, d, d)
    if (c && celulaDeZonaLa(w.zone, c.x0, c.y0, c.g + 1) === -1) b = c
  }
  assert.ok(b, 'fixtura: nicio celula plata in afara depozitului')
  picteaza(w, b.x0, b.y0, 1, 2)
  lasaItem(w, Item.PIATRA, 20, cx + 2, cy)
  assert.equal(indexZone(w, R).deMutat.length, 1, 'fixtura: altceva decat piatra de pe jos are unde sa se mute')
  const t = ruleaza(w, R.jobRescanTicks + 1)
  assert.ok(t.scanari >= 1)
  assert.ok(t.vizite <= t.scanari, `${t.vizite} vizite la ${t.scanari} scanari: trecerea ieftina parcurge si mormanele la odihna`)
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

/** Cate tickuri petrece fiecare pion pe fiecare fel de job, intr-o lume cu AMBELE. */
function specializarea(seed: number, prioritati: ReadonlyArray<readonly [number, number, number]>): {
  t: Array<{ sapa: number; cara: number }>; ambele: number
} {
  const { w, sit } = fixturaCarat(seed, 2, 20, 2, 8, 40)
  let sapaturi = 0
  for (let d = 2; d <= 8 && sapaturi < 12; d++) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]] as const) {
      if (sapaturi >= 12) break
      if (solid(w, sit.wx + dx, sit.wy + dy) === null) continue
      desemneaza(w, sit.wx + dx, sit.wy + dy)
      sapaturi++
    }
  }
  assert.ok(sapaturi >= 8, `fixtura: doar ${sapaturi} desemnari de sapat`)
  for (const [slot, categorie, nivel] of prioritati) {
    assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[slot]!, categorie, nivel }, R).ok)
  }
  const t = [{ sapa: 0, cara: 0 }, { sapa: 0, cara: 0 }]
  let ambele = 0
  for (let k = 0; k < 1500; k++) {
    tick(w, R)
    let deCarat = 0
    for (let m = 0; m < w.iteme.count; m++) if (w.iteme.alive[m] === 1) deCarat++
    if (w.desemnari.vii > 0 && deCarat > 0) ambele++
    for (const slot of [0, 1] as const) {
      if (w.agents.alive[slot] !== 1) continue
      if (w.agents.jobKind[slot] === FelJob.SAPA) t[slot]!.sapa++
      if (w.agents.jobKind[slot] === FelJob.CARA) t[slot]!.cara++
    }
  }
  return { t, ambele }
}

test('doi pioni cu prioritati DIFERITE se specializeaza COMPLET, si dupa prioritate, nu dupa slot', () => {
  // Prioritatile personale au fost probate pana acum doar UNIFORM (toti pionii la
  // fel) sau pe ZERO (categoria stinsa). Asimetria — doi pioni cu valori diferite si
  // amandoua nenule — n-avea test, desi ea e intregul rost al mecanismului.
  //
  // Prima varianta a testului cerea doar o DIRECTIE („sapatorul sapa mai mult decat
  // carausul"), si nu lega: trei mutatii care scot prioritatea personala din scor
  // treceau toate. Masurat de ce — specializarea e TOTALA, nu partiala: sapatorul nu
  // cara niciodata. Enuntul tare se poate cere, deci se cere.
  const sus = R.personalPriorityLevels
  const sapator = (slot: number) => [[slot, Categorie.SAPA, sus], [slot, Categorie.CARA, 1]] as const
  const caraus = (slot: number) => [[slot, Categorie.CARA, sus], [slot, Categorie.SAPA, 1]] as const

  const a = specializarea(6100, [...sapator(0), ...caraus(1)])
  assert.ok(a.ambele > 300, `doar ${a.ambele} tickuri din 1500 cu ambele feluri de munca disponibile`)
  assert.ok(a.t[0]!.sapa > 100 && a.t[1]!.cara > 100, `un pion a stat degeaba: ${JSON.stringify(a.t)}`)
  assert.equal(a.t[0]!.cara, 0, `sapatorul a carat: ${JSON.stringify(a.t)}`)
  assert.equal(a.t[1]!.sapa, 0, `carausul a sapat: ${JSON.stringify(a.t)}`)

  // OGLINDA: aceeasi lume, aceleasi pozitii, rolurile schimbate intre sloturi. Fara
  // ea, testul de sus ar trece la fel de bine daca specializarea ar veni din geometrie
  // — pionul 0 se naste mai aproape de sapaturi — si n-ar avea nimic de-a face cu
  // prioritatea.
  const b = specializarea(6100, [...caraus(0), ...sapator(1)])
  assert.equal(b.t[0]!.sapa, 0, `oglinda: pionul 0 a sapat desi e caraus: ${JSON.stringify(b.t)}`)
  assert.equal(b.t[1]!.cara, 0, `oglinda: pionul 1 a carat desi e sapator: ${JSON.stringify(b.t)}`)

  // Si controlul care arata ca fixtura NU forteaza specializarea: cu prioritati
  // implicite, macar un pion face amandoua felurile.
  const u = specializarea(6100, [])
  const amestecat = [0, 1].some((k) => u.t[k]!.sapa > 0 && u.t[k]!.cara > 0)
  assert.ok(amestecat, `cu prioritati uniforme pionii tot se specializeaza: ${JSON.stringify(u.t)}`)
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
  // Un morman langa pion si un depozit cu loc, dar DINCOLO de raza de cautare a
  // destinatiei: zona trece poarta ieftina (are loc pentru cat s-ar cara), deci
  // se plateste o evaluare scumpa, dar nicio celula nu e in raza → „n-are unde",
  // memorat pe ITEM cu racire PERSISTED. (Varianta veche — depozit cu loc doar
  // pentru 5 dintr-un morman de 40 — nu mai ajunge la evaluarea scumpa de cand
  // poarta intreaba „incape CAT car?", ceea ce e tocmai ce voiam.)
  const racire = (): World => {
    const { w, sit } = laSit(617, 1)
    const cx = cellOf(w.agents.x[0]!)
    const cy = cellOf(w.agents.y[0]!)
    lasaItem(w, Item.LEMN, 40, cx + 2, cy)
    const departe = patratPlat(w, sit, 1, R.haulDestRadiusCells + 8, R.haulDestRadiusCells + 40)
    assert.ok(departe, 'fixtura: niciun loc de depozit dincolo de raza de destinatie')
    picteaza(w, departe.x0, departe.y0, 1, 5)
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
// K05: costul nu creste cu VECHIMEA coloniei
// ---------------------------------------------------------------------------

test('K05: un morman pe veci inaccesibil nu face acoperirea de regiuni sa creasca — dupa asezare, zero blocuri noi in 2000 de tickuri', () => {
  // Garda care lipsea. Taietura 2 intindea un coridor de acoperire de la PION la
  // marfa, „ca la desemnari". Coridorul e ancorat de pozitia pionului, care se
  // misca, deci fiecare reluare trasa alta linie si adauga un inel nou: masurat pe
  // scenariul standard, 1138 → 2225 de coloane de blocuri in 30.000 de tickuri,
  // fara saturare, cu `relabel` la 40% din tick. Aici: o groapa de 2 niveluri, din
  // care nu se iese cu `maxStepM = 1`, deci mormanul din ea ramane inaccesibil
  // pentru totdeauna si scannerul il reevalueaza la fiecare expirare a racirii.
  const { w, sit } = laSit(620, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const p = patratPlat(w, sit, 2, 8, 40)
  assert.ok(p, 'fixtura: niciun patrat plat pentru depozit')
  picteaza(w, p.x0, p.y0, 2)
  // Un put de o celula, doua niveluri: fundul lui nu are niciun vecin calcabil la
  // ±1 nivel, deci e propria componenta. Mormanul produs cade acolo.
  const gp = solid(w, cx + 5, cy)!
  assert.ok(applyCommand(w, { kind: 'dig', wx: cx + 5, wy: cy, z: gp }, R).ok)
  assert.ok(applyCommand(w, { kind: 'dig', wx: cx + 5, wy: cy, z: gp - 1 }, R).ok)
  ruleaza(w, 5)
  const inPut = itemLaCelula(w.iteme, cx + 5, cy, gp - 1)
  assert.notEqual(inPut, -1, 'fixtura: mormanul n-a ajuns pe fundul putului')
  assert.notEqual(regionAt(w.regions, cx + 5, cy, gp - 1), NO_REGION, 'fixtura: fundul putului n-are regiune')
  const compPion = find(w.regions, regionAt(w.regions, cx, cy, w.agents.z[0]!))
  assert.notEqual(find(w.regions, regionAt(w.regions, cx + 5, cy, gp - 1)), compPion, 'fixtura: putul e in componenta pionului, deci nu exercita refuzul')

  // Se lasa acoperirea sa se aseze, apoi se cere ca ea sa NU mai creasca.
  ruleaza(w, 2000)
  const blocuri = w.regions.keys.length
  const legate = w.regions.legate.size
  const t = ruleaza(w, 2000)
  assert.equal(w.regions.keys.length, blocuri, `acoperirea a crescut cu ${w.regions.keys.length - blocuri} blocuri in 2000 de tickuri fara munca noua`)
  assert.equal(w.regions.legate.size, legate)
  assert.equal(t.coridoare, 0, 'un coridor de acoperire s-a intins spre marfa')
  // Si mormanul e inca acolo, cu cauza lui — nu s-a „rezolvat" tacut.
  assert.notEqual(itemLaCelula(w.iteme, cx + 5, cy, gp - 1), -1)
  assert.ok(t.inaccesibil > 0, 'fixtura: nimeni n-a mai evaluat mormanul inaccesibil, deci testul nu exercita nimic')
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
    produse += lastJobReport().unitatiProduse
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
  // CONSERVAREA, in unitati. Prima versiune calcula un numar si il arunca cu
  // `void`, apoi asserta doar ca totalul e nenul: mutatia „scade 1 unitate la
  // fiecare depunere" trecea verde. Acum: tot ce s-a produs e ori in lume, ori
  // numarat ca pierdut. `itemeProduse` numara MORMANE si nu se poate aduna;
  // `unitatiProduse` e numarul cu care se face contabilitatea.
  assert.ok(produse > 0, 'fixtura: sapatul n-a produs nimic')
  assert.equal(marfaTotala(w) + w.ratiune.itemePierdute, produse, 'marfa nu se conserva: produs vs. (in lume + pierdut)')
  const inDepozit = itemeInZona(w, zona)
  assert.ok(inDepozit.iteme > 0)
  assert.ok(inDepozit.iteme <= celuleDepozit)
  // Niciun refuz de componenta pe iteme: coridoarele si acoperirea de la pictare tin.
  const raportPion = w.ratiune.tickuriDeLucru > 0 ? w.ratiune.tickuriPeDrum / w.ratiune.tickuriDeLucru : 0
  console.log(`  cariera + depozit (${celuleDepozit} celule): ${t.joburiTerminate} joburi, ${t.itemeMutate} depuneri, ${w.iteme.vii} mormane vii (${inDepozit.iteme} in depozit), ${t.candidatiExaminati} evaluari scumpe, ${t.evaluariDestinatie} celule de destinatie examinate, ${w.zone.index.reconstructii} reconstructii de index (${(w.zone.index.pasi / 6000).toFixed(0)} pasi/tick), drum/lucru ${raportPion.toFixed(2)}, ${(ms / 6000 * 1000).toFixed(0)} µs/tick`)
  // Garda pe COST, nu pe frecventa: numarul de reconstructii nu spune nimic —
  // una peste 3000 de mormane costa de 60 de ori cat una peste 50.  numara
  // celulele si sloturile atinse. Masurat ~57 ns/celula si ~38 ns/morman, deci
  // pragul de mai jos e si un buget de timp. Masurat azi: 12 pasi/tick. Pragul e
  // 30, nu 200: un plafon care nu leaga nu e un plafon — cu 200, mutatia „indexul
  // se reconstruieste la FIECARE scanare" (81 pasi/tick) trecea verde.
  const pasiPeTick = w.zone.index.pasi / 6000
  assert.ok(w.zone.index.reconstructii < 6000 * 2, 'indexul se reconstruieste de mai multe ori pe tick')
  assert.ok(pasiPeTick < 30, `reconstructia indexului costa ${pasiPeTick.toFixed(0)} pasi/tick`)
})

// ---------------------------------------------------------------------------
// gardele adaugate dupa recenzia codului
// ---------------------------------------------------------------------------

test('refuz INACCESIBIL repetat in MERGE_DEST: jobul se incheie in plafon, marfa ajunge jos, celula de depozit se elibereaza', () => {
  // Ping-pong-ul de destinatie: se elibereaza A si se rezerva B, iar la refuzul
  // urmator A redevine cea mai apropiata si se revine pe ea. Fara contor, bucla
  // era infinita, cu marfa in mana pe viata si o celula rezervata degeaba.
  const { w, zona } = fixturaCarat(621, 1, 20, 2, 8, 40)
  const n = panaCand(w, 600, (w) => inPas(w, 0, PasCara.MERGE_DEST) && w.agents.caraCantitate[0]! > 0)
  assert.ok(n >= 0, 'fixtura: pionul n-a ajuns sa care')
  assert.equal(w.rezervari.total, 1, 'fixtura: destinatia nu e rezervata')

  let apeluri = 0
  for (let k = 0; k < 50 && w.agents.jobKind[0] !== 0; k++) {
    drumRefuzat(w, R, 0, Reason.INACCESIBIL)
    apeluri++
  }
  assert.equal(w.agents.jobKind[0], 0, `jobul de carat n-a murit dupa ${apeluri} de refuzuri`)
  assert.ok(apeluri <= R.jobMaxIncercari, `${apeluri} refuzuri pana la incheiere, plafonul e ${R.jobMaxIncercari}`)
  assert.equal(w.agents.caraCantitate[0], 0, 'marfa a ramas in mana')
  assert.equal(marfaTotala(w), 20)
  assert.equal(w.rezervari.total, 0, 'celula de depozit a ramas rezervata')
  assert.equal(w.ratiune.itemePierdute, 0)
  void zona
})

test('fill nu zideste un pion la inaltimea capului: garda acopera tot headroom-ul, nu doar celula picioarelor', () => {
  const { w } = laSit(622, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!
  for (let h = 0; h < R.agentHeadroomM; h++) {
    const out = applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z: cz + h, material: Material.PIATRA_CONSTRUITA }, R)
    assert.equal(out.ok, false, `zidirea la z+${h} peste pion a trecut`)
    if (!out.ok) assert.equal(out.reason, Reason.CELULA_OCUPATA)
  }
  // Deasupra headroom-ului, garda de OCUPARE nu se mai aplica — si asta e ce
  // probeaza testul. Comanda poate fi totusi refuzata, dar din alt motiv: din
  // taietura 2 incoace `fill` trece si prin regula de stabilitate, iar la doi
  // metri deasupra solului nu e nimic care sa tina piatra. Ce conteaza aici e ca
  // motivul S-A SCHIMBAT.
  const sus = applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z: cz + R.agentHeadroomM, material: Material.PIATRA_CONSTRUITA }, R)
  if (!sus.ok) assert.notEqual(sus.reason, Reason.CELULA_OCUPATA, 'garda de ocupare s-a intins peste headroom')
})

test('un pion ingropat din care nu se mai iese isi INCHEIE jobul: marfa iese din mana si rezervarea se elibereaza', () => {
  // Fara asta, pionul nu mai ajunge nici la munca, nici la drum, deci niciun
  // plafon nu-l atinge: tinta ramanea rezervata pentru toata colonia si marfa
  // ramanea in mana pe veci — vizibila in suma totala, deci nici macar numarata.
  const { w } = fixturaCarat(623, 1, 20, 2, 8, 40)
  const n = panaCand(w, 600, (w) => inPas(w, 0, PasCara.MERGE_DEST) && w.agents.caraCantitate[0]! > 0)
  assert.ok(n >= 0, 'fixtura: pionul n-a ajuns sa care')
  assert.equal(w.rezervari.total, 1)
  const inainte = marfaTotala(w)
  // Se ingroapa prin editare directa de teren: comanda `fill` refuza acum, si pe
  // drept — dar un save vechi sau alta cale de editare poate produce starea asta.
  const px = cellOf(w.agents.x[0]!)
  const py = cellOf(w.agents.y[0]!)
  const pz = w.agents.z[0]!
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    for (let h = 0; h < R.agentHeadroomM; h++) fill(w.terrain, px + dx, py + dy, pz + h, Material.PIATRA_CONSTRUITA)
  }
  fill(w.terrain, px, py, pz + 1, Material.PIATRA_CONSTRUITA)
  markDirty(w.regions, px, py, pz, R)
  ruleaza(w, 3)
  assert.equal(w.agents.jobKind[0], 0, 'pionul ingropat si-a pastrat jobul')
  assert.equal(w.agents.caraCantitate[0], 0, 'marfa a ramas in mana unui pion ingropat')
  assert.equal(w.rezervari.total, 0, 'rezervarea a ramas pe veci')
  assert.equal(marfaTotala(w) + w.ratiune.itemePierdute, inainte, 'marfa nu se conserva la ingropare')
})

test('marfa din mana unui slot MORT se NUMARA la incarcare, nu se sterge tacut', () => {
  const { w } = fixturaCarat(624, 1, 20, 2, 8, 40)
  const n = panaCand(w, 600, (w) => inPas(w, 0, PasCara.MERGE_DEST) && w.agents.caraCantitate[0]! > 0)
  assert.ok(n >= 0)
  const cant = w.agents.caraCantitate[0]!
  const raw = JSON.parse(encode(w)) as { data: { agents: Record<string, number[]> } }
  raw.data.agents.alive![0] = 0
  const loaded = decode(JSON.stringify(raw))
  assert.ok(loaded.ok, JSON.stringify(loaded))
  assert.equal(loaded.value.rezervari.anulateLaIncarcare, 1)
  assert.equal(loaded.value.agents.caraCantitate[0], 0)
  assert.equal(loaded.value.ratiune.itemePierdute, cant, 'marfa mortului a disparut fara sa fie numarata')
})

test('o zona EVITATA de un pion nu produce racire pe ITEM: cauza e a perechii, nu a marfii', () => {
  // Doua depozite: A (evitat de pionul care intreaba) si B, cu loc. Prima
  // versiune cerea ca TOATE zonele cu loc sa fie evitate ca sa scrie racirea pe
  // pereche; cu B in peisaj scria pe ITEM — si ascundea marfa de toata colonia.
  // Fixtura are nevoie de DOUA zone, altfel nu exercita nimic: cu una singura,
  // `evitate === zoneCuLoc` e adevarat si conditia veche se comporta identic.
  // (Prima versiune a testului avea o zona — vida pentru mutatia asta.)
  const { w, sit } = laSit(625, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const a = patratPlat(w, sit, 2, 6, 40)
  assert.ok(a)
  const zonaA = picteaza(w, a.x0, a.y0, 2, 5)
  // Zona B: GOALA (deci trece si poarta pe „incape cat car?", si intra la
  // `zoneCuLoc`), dar dincolo de raza de cautare a destinatiei, deci nicio celula
  // a ei nu poate fi aleasa. Varianta cu celule la 74/75 a incetat sa exercite
  // cazul cand poarta a inceput sa ceara loc pentru cantitatea carata.
  const b = patratPlat(w, sit, 2, R.haulDestRadiusCells + 8, R.haulDestRadiusCells + 40)
  assert.ok(b, 'fixtura: niciun al doilea patrat plat dincolo de raza')
  picteaza(w, b.x0, b.y0, 2, 4)
  const id = lasaItem(w, Item.PIATRA, 20, cx + 2, cy)
  // Pionul evita zona A — singura cu loc REAL. B ramane numarata la „zone cu loc",
  // dar nicio celula a ei nu primeste 20. Cauza e deci a PERECHII, nu a marfii.
  evitaTinta(w, 0, zonaA, w.tick + 10000)
  ruleaza(w, 2 * R.jobRescanTicks + 2)
  const is = slotItem(w.iteme, id)
  assert.notEqual(is, -1, 'marfa a fost carata desi singura zona cu loc era evitata')
  assert.equal(w.iteme.reincercaLaTick[is], 0, 'racirea unei cauze de PERECHE a ajuns pe item')
  assert.ok(esteEvitata(w, 0, id), 'pionul n-a luat racirea pe el')
})

test('la incarcare, marfa se lasa la picioare DUPA ce toate rezervarile exista: o celula rezervata de alt pion nu se umple', () => {
  // `asazaItem` sare peste celulele rezervate ca destinatie intreband
  // `w.rezervari`. Intr-o singura trecere, slotul 0 intreaba INAINTE ca slotul 1
  // sa-si fi scris rezervarea — deci ar fi umplut exact celula pe care slotul 1
  // o tine, si promisiunea „existent + jobCantitate ≤ itemStackMax intre scan si
  // LASA" s-ar rupe in lumea INCARCATA, dupa ordinea sloturilor.
  const { w, sit } = laSit(626, 2)
  const px = cellOf(w.agents.x[0]!)
  const py = cellOf(w.agents.y[0]!)
  const pz = w.agents.z[0]!
  // Zona Z: exact celula pe care sta pionul 0 (deci acolo ii cade marfa).
  const zid = applyCommand(w, { kind: 'picteazaZona', x0: px, y0: py, x1: px, y1: py, z: pz, prioritate: 3 }, R)
  assert.ok(zid.ok, JSON.stringify(zid))
  const zc = celulaDeZonaLa(w.zone, px, py, pz)
  assert.notEqual(zc, -1)
  const idZ = w.zone.celule.id[zc]!
  // Zona moarta, doar ca sa aiba pionul 0 o destinatie care nu mai exista.
  const alta = patratPlat(w, sit, 1, 6, 40)
  assert.ok(alta)
  picteaza(w, alta.x0, alta.y0, 1, 3)
  const zcMoarta = celulaDeZonaLa(w.zone, alta.x0, alta.y0, alta.g + 1)
  assert.notEqual(zcMoarta, -1)
  const idMoarta = w.zone.celule.id[zcMoarta]!

  const raw = JSON.parse(encode(w)) as { data: { nextId: number; agents: Record<string, number[]>; zone: { celule: Record<string, number[]> } } }
  const a = raw.data.agents
  // Pionul 0: cara 50, destinatia lui e celula care tocmai a MURIT → jobul se
  // anuleaza la incarcare si marfa ii cade la picioare, adica pe celula Z.
  a.jobKind![0] = 2
  a.jobId![0] = raw.data.nextId++
  a.jobTarget![0] = 0
  a.jobStep![0] = 2
  a.jobDest![0] = idMoarta
  a.jobCantitate![0] = 50
  a.jobEfect![0] = 1
  a.caraKind![0] = Item.PIATRA
  a.caraCantitate![0] = 50
  // Pionul 1: cara 50 spre celula Z, si rezervarea lui trebuie sa se refaca.
  a.jobKind![1] = 2
  a.jobId![1] = raw.data.nextId++
  a.jobTarget![1] = 0
  a.jobStep![1] = 2
  a.jobDest![1] = idZ
  a.jobCantitate![1] = 50
  a.jobEfect![1] = 1
  a.caraKind![1] = Item.PIATRA
  a.caraCantitate![1] = 50
  const idx = raw.data.zone.celule.id!.indexOf(idMoarta)
  assert.ok(idx >= 0)
  raw.data.zone.celule.alive![idx] = 0

  const loaded = decode(JSON.stringify(raw))
  assert.ok(loaded.ok, JSON.stringify(loaded))
  const lw = loaded.value
  assert.equal(lw.rezervari.anulateLaIncarcare, 1, 'doar jobul cu destinatia moarta trebuia anulat')
  assert.equal(lw.agents.jobKind[1], 2, 'jobul pionului 1 s-a anulat, desi destinatia lui exista')
  // Marfa pionului 0 a ajuns jos, dar NU pe celula rezervata de pionul 1.
  assert.equal(lw.agents.caraCantitate[0], 0)
  assert.equal(marfaTotala(lw), 100, 'marfa nu se conserva la incarcare')
  const peZ = itemLaCelula(lw.iteme, px, py, pz)
  assert.equal(peZ, -1, 'marfa a fost lasata pe celula rezervata de alt pion')
  assert.ok(locPeCelula(lw, R, Item.PIATRA, px, py, pz) >= 50, 'celula rezervata n-are loc pentru ce a promis pionul 1')
  assert.ok(verificaRezervari(lw.rezervari, lw.agents, existaTinta(lw)).ok)
})

test('poarta ieftina intreaba „incape CAT car?": un depozit cu toate celulele la 74/75 nu trimite pe nimeni la evaluare scumpa', () => {
  // Cu poarta pe „e vreun loc?", fiecare morman de pe jos intra in `deMutat`, e
  // sortat si evaluat scump, iar `cautaDestinatie` parcurgea toata lista de
  // celule libere ale zonei — la fiecare scanare a fiecarui pion, pe veci, cu
  // zero marfa mutata. Costul creste cu marimea depozitului: K05.
  const { w, sit } = laSit(627, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const p = patratPlat(w, sit, 4, 6, 40)
  assert.ok(p, 'fixtura: niciun patrat plat de 4')
  const zona = picteaza(w, p.x0, p.y0, 4, 5)
  for (let dx = 0; dx < 4; dx++) {
    for (let dy = 0; dy < 4; dy++) {
      assert.ok(applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: R.itemStackMax - 1, wx: p.x0 + dx, wy: p.y0 + dy, z: p.g + 1 }, R).ok)
    }
  }
  lasaItem(w, Item.PIATRA, 20, cx + 2, cy)
  const ix = indexZone(w, R)
  assert.ok(ix.acceptante[0 * ITEME + Item.PIATRA]! > 0, 'fixtura: celulele nu mai sunt „nepline", deci poarta veche n-ar fi trecut oricum')
  assert.equal(ix.maxLocLiber[0 * ITEME + Item.PIATRA], 1)
  const t = ruleaza(w, 2 * R.jobRescanTicks + 2)
  assert.ok(t.scanari > 0, 'fixtura: nimeni n-a scanat')
  assert.equal(t.vizite, 0, 'marfa a intrat in trecerea ieftina desi nu incape nicaieri')
  assert.equal(t.candidatiExaminati, 0, 's-a platit o evaluare scumpa pentru un depozit in care nu incape')
  assert.equal(t.evaluariDestinatie, 0, 's-au parcurs celule de depozit degeaba')
  assert.equal(itemeInZona(w, zona).iteme, 16)
})

test('plafonul de destinatie numara INTRARI parcurse, nu potriviri: leaga si cand nicio celula nu trece filtrele', () => {
  // Cu incrementul dupa filtre, plafonul nu lega niciodata (bucla mergea pana la
  // capatul listei) si contorul raporta ~0 exact in cazul care costa cel mai mult.
  const reguli = { ...R, haulDestMaxCells: 4 }
  const { w, sit } = laSit(628, 1, [], reguli)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  // Depozit GOL (deci trece poarta pe „incape cat car"), dar dincolo de raza de
  // cautare a destinatiei: fiecare celula pica pe filtrul de distanta.
  const departe = patratPlat(w, sit, 4, reguli.haulDestRadiusCells + 8, reguli.haulDestRadiusCells + 40)
  assert.ok(departe, 'fixtura: niciun patrat plat dincolo de raza')
  picteaza(w, departe.x0, departe.y0, 4, 5, reguli)
  assert.equal(w.zone.celule.vii, 16)
  lasaItem(w, Item.PIATRA, 20, cx + 2, cy, reguli)
  const t = ruleaza(w, reguli.jobRescanTicks + 2, reguli)
  assert.ok(t.candidatiExaminati >= 1, 'fixtura: nicio evaluare scumpa, deci testul nu exercita bucla')
  assert.ok(t.evaluariDestinatie >= 1, 'contorul de celule de destinatie nu numara nimic: masuratoarea minte')
  assert.ok(
    t.evaluariDestinatie <= reguli.haulDestMaxCells * t.candidatiExaminati,
    `${t.evaluariDestinatie} celule parcurse la ${t.candidatiExaminati} evaluari, plafonul e ${reguli.haulDestMaxCells}`,
  )
})

test('o celula de depozit careia i se sapa podeaua se RETRAGE: nu mai tine indexul sus si nu mai minte cu „leaga zonele"', () => {
  // Fara carlig, celula ramanea alive pentru totdeauna: indexul o numara
  // „libera", `maxPrioLibera` ramanea sus, deci fiecare morman de pe jos ramanea
  // candidat la fiecare scanare a fiecarui pion (K05), iar cauza afisata mintea.
  const { w, sit } = laSit(629, 1)
  const p = patratPlat(w, sit, 2, 6, 40)
  assert.ok(p, 'fixtura: niciun patrat plat')
  const zona = picteaza(w, p.x0, p.y0, 2, 5)
  assert.equal(w.zone.celule.vii, 4)
  assert.ok(indexZone(w, R).maxPrioLibera[Item.PIATRA]! >= 5)

  // Se sapa voxelul de SUB o celula de depozit.
  assert.ok(applyCommand(w, { kind: 'dig', wx: p.x0, wy: p.y0, z: p.g }, R).ok)
  assert.equal(celulaDeZonaLa(w.zone, p.x0, p.y0, p.g + 1), -1, 'celula de depozit a ramas vie desi n-are podea')
  assert.equal(w.zone.celule.vii, 3)
  // Si zidirea peste o celula de depozit o retrage la fel.
  assert.ok(applyCommand(w, { kind: 'fill', wx: p.x0 + 1, wy: p.y0, z: p.g + 1, material: Material.PIATRA_CONSTRUITA }, R).ok)
  assert.equal(celulaDeZonaLa(w.zone, p.x0 + 1, p.y0, p.g + 1), -1, 'celula zidita a ramas vie')
  assert.equal(w.zone.celule.vii, 2)
  void zona
})

test('o comanda de zona sterge racirile de pe marfa: un depozit pictat langa un morman refuzat nu-l lasa sa astepte racirea', () => {
  const { w, sit } = laSit(630, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const id = lasaItem(w, Item.PIATRA, 20, cx + 2, cy)
  // Un depozit cu loc, dar dincolo de raza: marfa primeste racire pe ea.
  const departe = patratPlat(w, sit, 1, R.haulDestRadiusCells + 8, R.haulDestRadiusCells + 40)
  assert.ok(departe, 'fixtura: niciun loc dincolo de raza')
  picteaza(w, departe.x0, departe.y0, 1, 5)
  ruleaza(w, 2 * R.jobRescanTicks + 2)
  const is = slotItem(w.iteme, id)
  assert.notEqual(is, -1)
  assert.ok(w.iteme.reincercaLaTick[is]! > w.tick, 'fixtura: marfa n-a primit nicio racire')

  // Jucatorul picteaza un depozit chiar langa marfa: premisa refuzului a disparut.
  const aproape = patratPlat(w, sit, 1, 4, 20)
  assert.ok(aproape)
  picteaza(w, aproape.x0, aproape.y0, 1, 5)
  assert.equal(w.iteme.reincercaLaTick[is], 0, 'racirea a supravietuit comenzii care i-a sters premisa')
})

test('racirea pe marfa se deriva din cati CANDIDATI sunt, nu din cate mormane exista in lume', () => {
  // Justificarea ferestrei („sa acopere toate tintele inainte sa expire primele")
  // e corecta la desemnari, unde fiecare desemnare vie e candidat. La iteme nu:
  // `deMutat` exclude tot ce sta deja la locul lui. Cu plafonul de candidati mic,
  // cele doua formule dau numere clar diferite, deci aserția leaga.
  const reguli = { ...R, jobScanMaxCandidates: 4 }
  const { w, sit } = laSit(631, 1, [], reguli)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  // Depozit langa sit, UMPLUT la refuz: mormanele din el sunt la odihna.
  let p: ReturnType<typeof patratPlat> = null
  let latura = 5
  while (!p && latura >= 3) { p = patratPlat(w, sit, latura, 4, 40); if (!p) latura-- }
  assert.ok(p, 'fixtura: niciun patrat plat pentru depozitul de odihna')
  picteaza(w, p.x0, p.y0, latura, 5, reguli)
  for (let i = 0; i < w.zone.celule.count; i++) {
    assert.ok(applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: R.itemStackMax, wx: w.zone.celule.wx[i]!, wy: w.zone.celule.wy[i]!, z: w.zone.celule.z[i]! }, reguli).ok)
  }
  const laOdihna = w.iteme.vii
  assert.ok(laOdihna >= 9, `fixtura: doar ${laOdihna} mormane la odihna`)
  // Un depozit cu loc, dar dincolo de raza de cautare: marfa de pe jos primeste
  // racire pe ea, si e SINGURUL candidat.
  const departe = patratPlat(w, sit, 1, reguli.haulDestRadiusCells + 8, reguli.haulDestRadiusCells + 40)
  assert.ok(departe, 'fixtura: niciun loc dincolo de raza')
  picteaza(w, departe.x0, departe.y0, 1, 5, reguli)
  const id = lasaItem(w, Item.PIATRA, 20, cx + 2, cy, reguli)

  const ix = indexZone(w, reguli)
  assert.equal(ix.deMutat.length, 1, `${ix.deMutat.length} candidati: fixtura nu izoleaza formula`)
  const n = panaCand(w, 4 * reguli.jobRescanTicks, (w) => {
    const is = slotItem(w.iteme, id)
    return is !== -1 && w.iteme.reincercaLaTick[is]! > w.tick
  }, reguli)
  assert.ok(n >= 0, 'marfa n-a primit nicio racire')
  const is = slotItem(w.iteme, id)
  const fereastra = w.iteme.reincercaLaTick[is]! - w.tick
  const dinCandidati = Math.max(reguli.jobInfeasibleRetryTicks, reguli.jobRescanTicks * (Math.ceil(1 / reguli.jobScanMaxCandidates) + 1))
  const dinToate = Math.max(reguli.jobInfeasibleRetryTicks, reguli.jobRescanTicks * (Math.ceil((laOdihna + 1) / reguli.jobScanMaxCandidates) + 1))
  assert.notEqual(dinCandidati, dinToate, 'fixtura: cele doua formule dau acelasi numar, deci testul e vid')
  // Se observa cu un tick dupa scriere, deci fereastra masurata e cu 1-2 mai mica.
  assert.ok(fereastra <= dinCandidati && fereastra >= dinCandidati - 3, `fereastra ${fereastra} nu e cea derivata din candidati (${dinCandidati}); din toate mormanele ar fi ${dinToate}`)
})
