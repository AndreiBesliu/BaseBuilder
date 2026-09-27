/**
 * Accesul vertical — PLASA, dupa recenzia din 27.09.
 *
 * Lentila „plasa" a recenziei a rulat 44 de mutatii plauzibile pe codul feliei, fiecare pe TOATA
 * suita: 31 treceau 563/563. Aici sunt testele care le leaga (codul mutatiei din recenzie e in
 * comentariul fiecaruia), adaptate la codul de dupa remediere. Doua au intrat in alte fisiere:
 * limita de jos a semintelor sigilarii (A11) in acces-sigilare, cutia verticala a memoriei (A04,
 * A05) aici, dar in forma verificatorului — pe ambele directii, deschide si inchide.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { CauzaAcces, componenta, felSapa, FelLucru, memorieAcces, nodStabil, nodW, siguraMemorat } from '../src/sim/acces.ts'
import { adaugaDesemnare, Desemnare, DetaliuMotiv, JURNAL_DESEMNARI_CAP, slotDesemnare, stergeDesemnare } from '../src/sim/desemnari.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { constructiaPrevizualizata } from '../src/sim/joburi.ts'
import { codMotiv, Reason } from '../src/sim/result.ts'
import { isWalkable } from '../src/sim/regions.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { cellKey } from '../src/sim/path.ts'
import { stergeItem } from '../src/sim/iteme.ts'
import { Faction, FelJob, Item, PasConstruieste, Piesa } from '../src/sim/state.ts'
import type { PiesaId, World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill, groundLevelM, JURNAL_CAP, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { createWorld } from '../src/sim/world.ts'
import { DEFAULT_RULES, parseRules } from '../src/sim/content.ts'
import { lasaItem, panaCand, R, ruleaza, sitPlat } from './fixturi.ts'

function inel(t: Parameters<typeof fill>[0], x0: number, y0: number, g: number, L: number, h: number): void {
  for (let z = g + 1; z <= g + h; z++) for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
    assert.ok(fill(t, x0 + dx, y0 + dy, z, Material.PIATRA_CONSTRUITA).ok)
  }
}
function sapaCmd(w: World, x: number, y: number, z: number): void {
  const out = applyCommand(w, { kind: 'dig', wx: x, wy: y, z }, R)
  assert.ok(out.ok, `fixtura: sapatura la (${x},${y},${z}): ${JSON.stringify(out)}`)
}
function zidesteCmd(w: World, x: number, y: number, z: number): void {
  const out = applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: Material.PIATRA_CONSTRUITA }, R)
  assert.ok(out.ok, `fixtura: zidul la (${x},${y},${z}): ${JSON.stringify(out)}`)
}
function curataMormane(w: World, xa: number, ya: number, xb: number, yb: number): void {
  const it = w.iteme
  for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && it.wx[i]! >= xa && it.wx[i]! <= xb && it.wy[i]! >= ya && it.wy[i]! <= yb) stergeItem(it, i)
}
function pion(w: World, x: number, y: number, z: number): number {
  const o = applyCommand(w, { kind: 'spawnAgent', x: x * 1000 + 500, y: y * 1000 + 500, z, faction: Faction.ASEZARE }, R)
  assert.ok(o.ok)
  return w.agents.count - 1
}
function desemneaza(w: World, x: number, y: number, z: number, piesa: PiesaId): number {
  const o = applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z, piesa }, R)
  assert.ok(o.ok, `fixtura: santierul (${x},${y},${z}): ${JSON.stringify(o)}`)
  return o.ok ? o.value : -1
}
function blocati(w: World): string[] {
  const nod = nodW(w.terrain, null, R)
  const out: string[] = []
  for (let i = 0; i < w.agents.count; i++) {
    if (w.agents.alive[i] !== 1) continue
    const x = cellOf(w.agents.x[i]!), y = cellOf(w.agents.y[i]!), z = w.agents.z[i]!
    if (!nod.calcabila(x, y, z)) { out.push(`${x},${y},${z} (necalcabil)`); continue }
    if (!componenta(nod, R, x, y, z).deschisa) out.push(`${x},${y},${z}`)
  }
  return out
}

// S01 — `acces.trecere()` in `constructiaPosibila`: punctul fix e acelasi DOAR fiindca fiecare
// trecere reface etichetele INCHISE. O piesa din mijlocul unei gropi, desenata INAINTEA treptei care
// deschide groapa: in trecerea 1 groapa e etichetata punga; in trecerea 2, fara reetichetare,
// eticheta veche ramane — iar privirea inainte a piesei nu vede treapta.
test('PREVIZUALIZAREA promite piesa din mijlocul gropii desenata INAINTEA treptei de iesire (etichetele se refac pe trecere)', () => {
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  for (const z of [g, g - 1]) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) sapaCmd(w, x0 + dx, y0 + dy, z)
  curataMormane(w, x0 - 1, y0 - 1, x0 + 5, y0 + 5)
  // Un pion prins in groapa: fara el, treapta n-ar avea constructor (si nu s-ar putea promite).
  pion(w, x0 + 1, y0 + 1, g - 1)
  const X = desemneaza(w, x0 + 2, y0 + 2, g - 1, Piesa.PODEA)
  const S = desemneaza(w, x0 + 2, y0 + 4, g - 1, Piesa.SCARA)
  const p = constructiaPrevizualizata(w, R)
  assert.deepEqual(p.faraAcces, [], 'piesa din mijlocul gropii iese fara acces, desi dupa treapta groapa e deschisa')
  assert.equal(p.construibile.length, 2)
  void X; void S
})

// J01 — `ridica`: cauza la oprire. Constructorul pleaca dupa piatra pentru o piesa din camera;
// in timp ce merge, jucatorul deseneaza usa. La ridicare nu mai are loc SIGUR: cauza trebuie
// sa fie FARA_LOC_SIGUR, nu „niciun loc de lucru" (DEVLOG o dadea drept reparata; din cele doua
// locuri care o scriu, doar unul era probat).
test('RIDICAREA: la oprire, cauza e FARA_LOC_SIGUR cand locurile exista dar nu sunt sigure', () => {
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    if (dx === 2 && dy === 0) continue
    zidesteCmd(w, x0 + dx, y0 + dy, z)
  }
  const id = desemneaza(w, x0 + 2, y0 + 3, g + 1, Piesa.PODEA)
  lasaItem(w, Item.PIATRA, 60, x0 + 1, y0 + 1)
  const c = pion(w, x0 + 3, y0 + 1, g + 1)
  let desenat = false
  for (let t = 0; t < 4000 && !desenat; t++) {
    ruleaza(w, 1)
    const a = w.agents
    if (a.jobKind[c] === FelJob.CONSTRUIESTE && (a.jobStep[c] === PasConstruieste.MERGE_SURSA || a.jobStep[c] === PasConstruieste.RIDICA) && a.caraCantitate[c] === 0) {
      for (const z of [g + 1, g + 2]) assert.ok(applyCommand(w, { kind: 'desemneaza', wx: x0 + 2, wy: y0, z, piesa: Piesa.PERETE }, R).ok)
      desenat = true
    }
  }
  assert.ok(desenat, 'fixtura: constructorul n-a pornit spre piatra')
  const oprit = panaCand(w, 400, () => w.agents.jobKind[c] === 0)
  assert.ok(oprit >= 0, 'fixtura: constructorul nu s-a oprit')
  const s = slotDesemnare(w.desemnari, id)
  assert.notEqual(s, -1, 'fixtura: piesa din camera s-a zidit')
  assert.equal(w.desemnari.ultimulMotivDetaliu[s], DetaliuMotiv.FARA_LOC_SIGUR, 'la oprirea din ridicare, cauza spunea „niciun loc de lucru"')
})

// A13 — privirea inainte a previzualizarii cere ca celula de deasupra lui p sa fie STABILA. O
// treapta in groapa cu o alta piesa a planului chiar deasupra ei: treapta nu scoate pe nimeni
// (n-are loc de cap), deci nu se promite. O greseala obisnuita de desen.
test('PREVIZUALIZAREA nu promite treapta de groapa acoperita de alta piesa a planului', () => {
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  for (const z of [g, g - 1]) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) sapaCmd(w, x0 + dx, y0 + dy, z)
  curataMormane(w, x0 - 1, y0 - 1, x0 + 3, y0 + 3)
  pion(w, x0 + 1, y0 + 1, g - 1)
  const S = desemneaza(w, x0 + 1, y0 + 2, g - 1, Piesa.SCARA)
  desemneaza(w, x0 + 1, y0 + 2, g, Piesa.PERETE)
  const p = constructiaPrevizualizata(w, R)
  const kS = cellKey(x0 + 1, y0 + 2, g - 1)
  assert.ok(p.faraAcces.includes(kS), `treapta acoperita e promisa (construibile ${p.construibile.length})`)
  void S
})

// J05 — regula de sigilare numara doar pionii VII: un pion mort (sau plecat) ramas in camera nu
// tine ultima piesa pe veci.
test('SIGILAREA: un pion MORT in camera nu tine ultima piesa pe veci', () => {
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  const ids: number[] = []
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    ids.push(desemneaza(w, x0 + dx, y0 + dy, z, Piesa.PERETE))
  }
  for (let i = 0; i < 12; i++) lasaItem(w, Item.PIATRA, 60, x0 - 4, y0 - 2 + i)
  for (let i = 0; i < 10; i++) lasaItem(w, Item.HRANA, 75, x0 + 12 + (i % 3), y0 + ((i / 3) | 0))
  for (let i = 0; i < 3; i++) pion(w, x0 - 6, y0 + i, g + 1)
  // Mortul DUPA constructori: un spawn ulterior i-ar refolosi slotul.
  const mort = pion(w, x0 + 2, y0 + 2, g + 1)
  assert.ok(applyCommand(w, { kind: 'killAgent', id: w.agents.id[mort]! }, R).ok)
  assert.equal(w.agents.alive[mort], 0, 'fixtura: pionul e mort')
  const n = panaCand(w, 30000, () => ids.every((id) => slotDesemnare(w.desemnari, id) === -1))
  assert.ok(n >= 0, `camera nu s-a inchis: raman ${ids.filter((id) => slotDesemnare(w.desemnari, id) !== -1).length}`)
})

// J06/J07/J08 — pungile planului numara doar ce e VIU.
test('PREVIZUALIZAREA nu numara la „PLANUL INCHIDE" pionii morti, mormanele sterse si celulele de zona sterse', () => {
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    desemneaza(w, x0 + dx, y0 + dy, z, Piesa.PERETE)
  }
  const mort = pion(w, x0 + 1, y0 + 1, g + 1)
  const it = lasaItem(w, Item.HRANA, 20, x0 + 2, y0 + 2)
  const zona = applyCommand(w, { kind: 'picteazaZona', x0: x0 + 3, y0: y0 + 3, x1: x0 + 3, y1: y0 + 3, z: g + 1, fel: 1 }, R)
  assert.ok(zona.ok, JSON.stringify(zona))
  // fixtura VIE: cu toate trei vii, se numara
  assert.deepEqual(constructiaPrevizualizata(w, R).inchise, { pioni: 1, mormane: 1, zone: 1 }, 'fixtura: cu toate vii')
  assert.ok(applyCommand(w, { kind: 'killAgent', id: w.agents.id[mort]! }, R).ok)
  for (let i = 0; i < w.iteme.count; i++) if (w.iteme.id[i] === it) stergeItem(w.iteme, i)
  assert.ok(applyCommand(w, { kind: 'stergeZona', id: zona.ok ? zona.value : -1 }, R).ok)
  assert.deepEqual(constructiaPrevizualizata(w, R).inchise, { pioni: 0, mormane: 0, zone: 0 })
})

// A04/A05 — cutia de dependenta a memoriei pe VERTICALA urmeaza flood-ul, nu celula de start. Scenele
// din acces.test pornesc toate de pe podeaua unei pungi plate, deci z0 = z1 = nivelul de start; aici
// punga se intinde pe doua-trei niveluri si editarea cade exact dincolo de cutia calculata din start.
// In ambele directii: memoria calda n-are voie sa spuna SIGUR pe o punga inchisa, nici NU pe una
// deschisa (verificatorul recenziei, plasa 0).
function platformaCuTreapta(t: Parameters<typeof fill>[0], x0: number, y0: number, g: number): void {
  // platforma 3x3 plina pe g+1..g+2 (se sta la g+3), treapta la (3,1) plina pe g+1 (se sta la g+2)
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
    assert.ok(fill(t, x0 + dx, y0 + dy, g + 1, Material.PIATRA_CONSTRUITA).ok)
    assert.ok(fill(t, x0 + dx, y0 + dy, g + 2, Material.PIATRA_CONSTRUITA).ok)
  }
  assert.ok(fill(t, x0 + 3, y0 + 1, g + 1, Material.PIATRA_CONSTRUITA).ok)
}
const SANT_TREAPTA: [number, number][] = [[4, 1], [3, 0], [3, 2]]

test('memoria urmareste cutia in JOS cu flood-ul: platforma cu treapta, santul de la picior si umplerea lui', () => {
  for (const dir of ['inchide', 'deschide'] as const) {
    const { w, wx, wy, g } = sitPlat(12345, 13)
    const t = w.terrain, d = w.desemnari
    const x0 = wx + 3, y0 = wy + 3
    platformaCuTreapta(t, x0, y0, g)
    if (dir === 'deschide') for (const [dx, dy] of SANT_TREAPTA) assert.ok(dig(t, x0 + dx, y0 + dy, g).ok)
    const m = memorieAcces()
    // flood-ul porneste de pe platforma (g+3) si coboara pe treapta (g+2) pana la sol (g+1)
    assert.equal(siguraMemorat(t, d, R, m, x0 + 1, y0 + 1, g + 3), dir === 'inchide', `fixtura ${dir}: platforma inainte`)
    if (dir === 'inchide') for (const [dx, dy] of SANT_TREAPTA) assert.ok(dig(t, x0 + dx, y0 + dy, g).ok)
    else assert.ok(fill(t, x0 + 4, y0 + 1, g, Material.MOLOZ).ok)
    const b = siguraMemorat(t, d, R, memorieAcces(), x0 + 1, y0 + 1, g + 3)
    assert.equal(b, dir === 'deschide', `fixtura ${dir}: platforma dupa`)
    assert.equal(siguraMemorat(t, d, R, m, x0 + 1, y0 + 1, g + 3), b, `memoria n-a vazut editarea de la z=g (${dir}): cutia n-a coborat cu flood-ul`)
  }
})

test('memoria urmareste cutia in SUS cu flood-ul: groapa cu treapta, blocul peste capul vecinului si sapatul lui', () => {
  for (const dir of ['inchide', 'deschide'] as const) {
    const { w, wx, wy, g } = sitPlat(12345, 13)
    const t = w.terrain, d = w.desemnari
    const x0 = wx + 4, y0 = wy + 4
    // groapa 3x3 adanca de 2 (se sta la g-1), cu treapta la (1,0) adanca de 1 (se sta la g)
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      assert.ok(dig(t, x0 + dx, y0 + dy, g).ok)
      if (!(dx === 1 && dy === 0)) assert.ok(dig(t, x0 + dx, y0 + dy, g - 1).ok)
    }
    if (dir === 'deschide') assert.ok(fill(t, x0 + 1, y0 - 1, g + 2, Material.PIATRA_CONSTRUITA).ok)
    const m = memorieAcces()
    // flood-ul porneste din fundul gropii (g-1) si urca pe treapta (g) pana la sol (g+1)
    assert.equal(siguraMemorat(t, d, R, m, x0 + 1, y0 + 1, g - 1), dir === 'inchide', `fixtura ${dir}: groapa inainte`)
    if (dir === 'inchide') assert.ok(fill(t, x0 + 1, y0 - 1, g + 2, Material.PIATRA_CONSTRUITA).ok)
    else assert.ok(dig(t, x0 + 1, y0 - 1, g + 2).ok)
    const b = siguraMemorat(t, d, R, memorieAcces(), x0 + 1, y0 + 1, g - 1)
    assert.equal(b, dir === 'deschide', `fixtura ${dir}: groapa dupa`)
    assert.equal(siguraMemorat(t, d, R, m, x0 + 1, y0 + 1, g - 1), b, `memoria n-a vazut editarea de la z=g+2 (${dir}): cutia n-a urcat cu flood-ul`)
  }
})

// A08 — depasirea jurnalului de SANTIERE.
test('memoria: peste JURNAL_DESEMNARI_CAP schimbari de santier nevazute, se goleste', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const d = w.desemnari
  const m = memorieAcces()
  assert.equal(siguraMemorat(w.terrain, d, R, m, wx + 3, wy + 3, g + 1), true, 'fixtura: solul e sigur')
  const o = adaugaDesemnare(d, w.nextId++, Desemnare.CONSTRUIESTE, wx + 3, wy + 3, g + 1, 3, Piesa.PERETE)
  assert.ok(o.ok)
  for (let i = 0; i <= JURNAL_DESEMNARI_CAP / 2 + 2; i++) {
    const a = adaugaDesemnare(d, w.nextId++, Desemnare.CONSTRUIESTE, wx + 5, wy + 5, g + 40, 3, Piesa.PERETE)
    assert.ok(a.ok)
    stergeDesemnare(d, a.value)
  }
  const b = siguraMemorat(w.terrain, d, R, memorieAcces(), wx + 3, wy + 3, g + 1)
  assert.equal(b, false, 'fixtura: celula santierului nu e stabila')
  assert.equal(siguraMemorat(w.terrain, d, R, m, wx + 3, wy + 3, g + 1), b, 'memoria nu s-a golit la depasirea jurnalului de santiere')
})

// Depasirea jurnalului TERENULUI, cu o editare care CHIAR schimba un raspuns (in fuzz-ul livrat,
// umplerea de langa casa nu schimba nimic: proba lui era prinsa doar de contorul `goliri`).
test('memoria: peste JURNAL_CAP editari de teren nevazute, vede editarea pierduta din inel', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const t = w.terrain
  const x0 = wx + 3, y0 = wy + 3
  inel(t, x0, y0, g, 5, 2)
  const m = memorieAcces()
  assert.equal(siguraMemorat(t, w.desemnari, R, m, x0 + 2, y0 + 2, g + 1), false, 'fixtura: camera e punga')
  // usa: prima editare dupa ce memoria s-a incalzit, apoi > JURNAL_CAP editari departe
  assert.ok(dig(t, x0 + 2, y0, g + 1).ok && dig(t, x0 + 2, y0, g + 2).ok)
  const x = wx + (wx < WORLD_CELLS / 2 ? 300 : -300), y = wy + (wy < WORLD_CELLS / 2 ? 300 : -300)
  const gl = groundLevelM(t, x, y)
  assert.ok(gl.ok)
  for (let n = 0; n <= JURNAL_CAP + 2; n++) {
    const o = n % 2 === 0 ? fill(t, x, y, gl.value + 1, Material.PIATRA_CONSTRUITA) : dig(t, x, y, gl.value + 1)
    assert.ok(o.ok)
  }
  const b = siguraMemorat(t, w.desemnari, R, memorieAcces(), x0 + 2, y0 + 2, g + 1)
  assert.equal(b, true, 'fixtura: usa deschide camera')
  assert.equal(siguraMemorat(t, w.desemnari, R, m, x0 + 2, y0 + 2, g + 1), b, 'memoria n-a vazut usa sapata inainte de depasire')
})

// A01 — deconstructia unui voxel ZIDIT are atingerea zidirii (+2): randul 3 se desface de pe sol.
test('DECONSTRUCTIA (decizia 1): randul 3 al unui zid zidit se desface de pe sol, cu atingerea zidirii', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const x = wx + 6, y = wy + 6
  for (let z = g + 1; z <= g + 3; z++) zidesteCmd(w, x, y, z)
  const s = applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z: g + 3 }, R)
  assert.ok(s.ok, JSON.stringify(s))
  pion(w, wx + 2, wy + 2, g + 1)
  for (let i = 0; i < 10; i++) lasaItem(w, Item.HRANA, 75, wx + 10 + (i % 3), wy + ((i / 3) | 0))
  const n = panaCand(w, 4000, () => slotDesemnare(w.desemnari, s.ok ? s.value : -1) === -1)
  assert.ok(n >= 0, 'randul 3 nu s-a deconstruit de pe sol')
  const m = materialAt(w.terrain, x, y, g + 3)
  assert.ok(m.ok && m.value === Material.AER)
})

// A22 — LEMN_CONSTRUIT (scarile vechi, din save-urile de dinainte de taietura 5) e de STRUCTURA.
test('o treapta veche de LEMN_CONSTRUIT nu e podea naturala si se DECONSTRUIESTE', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  assert.ok(fill(w.terrain, wx + 2, wy + 2, g + 1, Material.LEMN_CONSTRUIT).ok)
  const nod = nodStabil({ t: w.terrain, plan: new Set(), zidite: null }, R)
  assert.equal(nod.naturala(wx + 2, wy + 2, g + 2), false, 'pe lemn zidit')
  assert.equal(felSapa(w.terrain, wx + 2, wy + 2, g + 1), FelLucru.DECONSTRUIESTE)
})

// A02/A03 — APA nu e calcabila in niciun graf, ca in isWalkable, pe o lume cu apa reala.
function sitCuApa(seed: number): { w: World; x: number; y: number; g: number } {
  const w = createWorld(seed)
  for (let k = 1; k <= 40000; k++) {
    const x = (k * 1237 + seed) % WORLD_CELLS
    const y = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(w.terrain, x, y)
    if (!g.ok) continue
    const m = materialAt(w.terrain, x, y, g.value)
    if (m.ok && m.value === Material.APA) return { w, x, y, g: g.value }
  }
  assert.fail('fixtura: nicio apa')
}
test('pe APA, graful stabil si graful W spun exact ce spune isWalkable', () => {
  const { w, x, y, g } = sitCuApa(12345)
  const nod = nodStabil({ t: w.terrain, plan: new Set(), zidite: null }, R)
  const nw = nodW(w.terrain, null, R)
  let apa = 0
  for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) for (let z = g - 3; z <= g + 3; z++) {
    const e = isWalkable(w.terrain, x + dx, y + dy, z, R)
    const m = materialAt(w.terrain, x + dx, y + dy, z)
    if (m.ok && m.value === Material.APA) apa++
    assert.equal(nod.calcabila(x + dx, y + dy, z), e, `stabil la (${dx},${dy},${z - g})`)
    assert.equal(nw.calcabila(x + dx, y + dy, z), e, `W la (${dx},${dy},${z - g})`)
  }
  assert.ok(apa > 0, 'fixtura: nicio celula de apa in cutie')
})

// A09 — aceeasi lume, alte reguli: memoria nu refoloseaza etichetele.
test('memoria se goleste cand se schimba regulile', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const t = w.terrain
  inel(t, wx + 2, wy + 2, g, 6, 2)
  const m = memorieAcces()
  assert.equal(siguraMemorat(t, w.desemnari, R, m, wx + 4, wy + 4, g + 1), false, 'fixtura: punga la pragurile livrate')
  const r16 = parseRules({ ...DEFAULT_RULES, accesPlafonNatural: 16 })
  assert.ok(r16.ok)
  if (!r16.ok) return
  const b = siguraMemorat(t, w.desemnari, r16.value, memorieAcces(), wx + 4, wy + 4, g + 1)
  assert.equal(b, true, 'fixtura: la pragul 16 incinta e deschisa')
  assert.equal(siguraMemorat(t, w.desemnari, r16.value, m, wx + 4, wy + 4, g + 1), b, 'memoria a raspuns cu etichetele regulilor vechi')
})

void ruleaza

// A06/A07 — compactarea sloturilor moarte ale memoriei: fara ea, `floods` tine TOATE flood-urile
// facute vreodata si fiecare editare le parcurge pe toate (costul creste cu timpul, nu cu planul).
test('memoria accesului nu tine sloturile moarte peste dublul celor vii', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const t = w.terrain
  const m = memorieAcces()
  for (let i = 0; i < 300; i++) {
    assert.equal(siguraMemorat(t, w.desemnari, R, m, wx + 4, wy + 4, g + 1), true)
    const o = i % 2 === 0 ? fill(t, wx + 6, wy + 6, g + 1, Material.PIATRA_CONSTRUITA) : dig(t, wx + 6, wy + 6, g + 1)
    assert.ok(o.ok)
  }
  siguraMemorat(t, w.desemnari, R, m, wx + 4, wy + 4, g + 1)
  assert.ok(m.stat.invalidate >= 290, `fixtura: doar ${m.stat.invalidate} invalidari`)
  void blocati
  const vii = m.floods.filter((x) => x !== null).length
  assert.equal(m.vii, vii, "contorul vii minte")
  assert.ok(m.floods.length <= 2 * vii + 65, `${m.floods.length} sloturi pentru ${vii} flood-uri vii`)
})

// A14/A15 — reuniunea privirii inainte a previzualizarii: fiecare componenta O DATA, si podelele
// naturale se aduna. Reguli cu pragul natural 10, ca sa se poata construi granita pe groapa de 3x3.
function reguli10(): typeof R {
  const r = parseRules({ ...DEFAULT_RULES, accesPlafonNatural: 10 })
  assert.ok(r.ok)
  return r.ok ? r.value : R
}
test('PREVIZUALIZAREA: doua gropi de cate 9 celule naturale, unite de o piesa — reuniunea are 18 >= 10 si se promite', () => {
  const rules = reguli10()
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  const sapa = (x: number, y: number, z: number): void => { assert.ok(applyCommand(w, { kind: 'dig', wx: x, wy: y, z }, rules).ok) }
  for (const z of [g, g - 1]) for (let dy = 0; dy < 3; dy++) for (const dx of [0, 1, 2, 4, 5, 6]) sapa(x0 + dx, y0 + dy, z)
  for (const z of [g, g - 1]) sapa(x0 + 3, y0 + 1, z)
  curataMormane(w, x0 - 1, y0 - 1, x0 + 7, y0 + 3)
  pion(w, x0 + 1, y0 + 1, g - 1) // cine sa zideasca din punga
  const d = (x: number, y: number, z: number, p: PiesaId): void => { const o = applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z, piesa: p }, rules); assert.ok(o.ok, JSON.stringify(o)) }
  // Bordura planificata peste pragul dintre gropi (altfel celula de deasupra piesei vede solul de afara).
  d(x0 + 3, y0, g + 1, Piesa.PERETE)
  d(x0 + 3, y0 + 2, g + 1, Piesa.PERETE)
  d(x0 + 3, y0 + 1, g - 1, Piesa.PODEA)
  const p = constructiaPrevizualizata(w, rules)
  const k = cellKey(x0 + 3, y0 + 1, g - 1)
  assert.ok(p.construibile.includes(k), 'piesa care uneste doua pungi de 9 celule naturale (18 >= 10) nu e promisa')
})
test('PREVIZUALIZAREA: o groapa de 8 celule naturale vazuta de doi vecini ai celulei de deasupra piesei ramane punga', () => {
  const rules = reguli10()
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  for (const z of [g, g - 1]) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) assert.ok(applyCommand(w, { kind: 'dig', wx: x0 + dx, wy: y0 + dy, z }, rules).ok)
  curataMormane(w, x0 - 1, y0 - 1, x0 + 3, y0 + 3)
  const d = (x: number, y: number, z: number, p: PiesaId): void => { const o = applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z, piesa: p }, rules); assert.ok(o.ok, JSON.stringify(o)) }
  // bordura planificata de jur imprejur, la g+1: marginea gropii nu duce afara
  for (let dx = -1; dx <= 3; dx++) for (let dy = -1; dy <= 3; dy++) if (dx === -1 || dx === 3 || dy === -1 || dy === 3) d(x0 + dx, y0 + dy, g + 1, Piesa.PERETE)
  d(x0, y0, g - 1, Piesa.PODEA)
  // Un constructor in groapa: fara el, privirea inainte nu s-ar incerca deloc.
  pion(w, x0 + 2, y0 + 2, g - 1)
  const p = constructiaPrevizualizata(w, rules)
  const k = cellKey(x0, y0, g - 1)
  assert.ok(p.faraAcces.includes(k), 'treapta din coltul gropii e promisa: reuniunea a numarat groapa de doua ori')
})

// A16/A17 — cauza se cauta pe aceleasi locuri de lucru ca zidirea: diagonala si −2. Placa peste o
// camera FARA USA (zidita deja): locurile de lucru ale placii dinspre interior sunt podeaua camerei,
// la −2 — cauza e INCINTA („lasa o usa"), nu INALTIME („pune o scara").
function cameraFaraUsa(w: World, x0: number, y0: number, g: number): void {
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    zidesteCmd(w, x0 + dx, y0 + dy, z)
  }
}
test('CAUZA: placa peste o camera fara usa e fara acces din cauza INCINTEI (locul de lucru e la −2)', () => {
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  cameraFaraUsa(w, x0, y0, g)
  desemneaza(w, x0, y0 + 2, g + 3, Piesa.PODEA)
  desemneaza(w, x0 + 1, y0 + 2, g + 3, Piesa.PODEA)
  const p = constructiaPrevizualizata(w, R)
  const k = cellKey(x0 + 1, y0 + 2, g + 3)
  const i = p.faraAcces.indexOf(k)
  assert.notEqual(i, -1, 'fixtura: placa din interior trebuia sa fie fara acces')
  assert.equal(p.cauze[i], CauzaAcces.INCINTA)
})
test('CAUZA: cand singurul loc de lucru din incinta e pe DIAGONALA, cauza e tot INCINTA', () => {
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  cameraFaraUsa(w, x0, y0, g)
  // umpluturi de 2 m pe vecinii ortogonali (la −2) ai placii de la (1,2): raman doar diagonalele (2,1), (2,3)
  for (const [dx, dy] of [[1, 1], [1, 3], [2, 2]] as const) for (const z of [g + 1, g + 2]) zidesteCmd(w, x0 + dx, y0 + dy, z)
  desemneaza(w, x0, y0 + 2, g + 3, Piesa.PODEA)
  desemneaza(w, x0 + 1, y0 + 2, g + 3, Piesa.PODEA)
  const p = constructiaPrevizualizata(w, R)
  const k = cellKey(x0 + 1, y0 + 2, g + 3)
  const i = p.faraAcces.indexOf(k)
  assert.notEqual(i, -1, 'fixtura: placa din interior trebuia sa fie fara acces')
  assert.equal(p.cauze[i], CauzaAcces.INCINTA)
})

// J13 — scanerul deosebeste „niciun loc SIGUR" de „niciun loc" cu vecinatatea ZIDIRII (diagonala, −2):
// placa peste o camera fara usa, langa un stalp de 2 pe zid; singurele celule pe care se poate sta
// langa ea sunt creasta (diagonal) si podeaua camerei (la −2) — ambele pungi.
test('SCANERUL: placa peste camera fara usa, vazuta doar pe diagonala si la −2, primeste FARA_LOC_SIGUR', () => {
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  cameraFaraUsa(w, x0, y0, g)
  zidesteCmd(w, x0, y0 + 2, g + 3)
  zidesteCmd(w, x0, y0 + 2, g + 4)
  const id = desemneaza(w, x0 + 1, y0 + 2, g + 3, Piesa.PODEA)
  for (let i = 0; i < 2; i++) lasaItem(w, Item.PIATRA, 60, x0 - 4, y0 + i)
  for (let i = 0; i < 6; i++) lasaItem(w, Item.HRANA, 75, x0 + 12, y0 + i)
  pion(w, x0 - 6, y0, g + 1)
  const n = panaCand(w, 3000, () => { const s = slotDesemnare(w.desemnari, id); return s !== -1 && w.desemnari.ultimulMotiv[s] === codMotiv(Reason.INACCESIBIL) })
  assert.ok(n >= 0, 'fixtura: placa n-a primit INACCESIBIL')
  const s = slotDesemnare(w.desemnari, id)
  assert.equal(w.desemnari.ultimulMotivDetaliu[s], DetaliuMotiv.FARA_LOC_SIGUR)
})

// C01 — pragul natural are minimul 1: la 0, orice componenta ar fi „deschisa" si tot accesul s-ar stinge.
test('accesPlafonNatural 0 e refuzat la incarcarea regulilor', () => {
  const r = parseRules({ ...DEFAULT_RULES, accesPlafonNatural: 0 })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.params.camp, 'accesPlafonNatural')
})

// Limitele EXACTE ale jurnalelor (recenzia, continuitate 1): la CAP + 1 intrari nevazute, inelul a
// suprascris-o deja pe cea mai veche. Aici cea mai veche e SINGURA editare care schimba raspunsul,
// deci o memorie care n-ar goli la exact CAP + 1 ar raspunde cu eticheta veche.
test('memoria: la EXACT JURNAL_CAP + 1 editari de teren nevazute, cea mai veche — singura care conteaza — nu se pierde', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const t = w.terrain
  const x0 = wx + 4, y0 = wy + 4
  // Groapa 3×3 adanca de 2, cu o rampa de o celula (sapata 1 m) la nord: deschisa.
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) for (const z of [g, g - 1]) assert.ok(dig(t, x0 + dx, y0 + dy, z).ok)
  assert.ok(dig(t, x0 + 1, y0 - 1, g).ok)
  const m = memorieAcces()
  assert.equal(siguraMemorat(t, w.desemnari, R, m, x0 + 1, y0 + 1, g - 1), true, 'fixtura: groapa e deschisa prin rampa')
  const inainte = t.editari
  // Rampa umpluta: cea mai veche editare nevazuta.
  assert.ok(fill(t, x0 + 1, y0 - 1, g, Material.MOLOZ).ok)
  const x = wx + (wx < WORLD_CELLS / 2 ? 300 : -300), y = wy + (wy < WORLD_CELLS / 2 ? 300 : -300)
  const gl = groundLevelM(t, x, y)
  assert.ok(gl.ok)
  for (let n = 0; n < JURNAL_CAP; n++) {
    const o = n % 2 === 0 ? fill(t, x, y, gl.value + 1, Material.PIATRA_CONSTRUITA) : dig(t, x, y, gl.value + 1)
    assert.ok(o.ok)
  }
  assert.equal(t.editari - inainte, JURNAL_CAP + 1, 'fixtura: exact JURNAL_CAP + 1 editari nevazute')
  const b = siguraMemorat(t, w.desemnari, R, memorieAcces(), x0 + 1, y0 + 1, g - 1)
  assert.equal(b, false, 'fixtura: fara rampa, groapa e punga')
  assert.equal(siguraMemorat(t, w.desemnari, R, m, x0 + 1, y0 + 1, g - 1), b, 'memoria a citit un inel suprascris')
})

test('memoria: la EXACT JURNAL_DESEMNARI_CAP + 1 schimbari de santier nevazute, cea mai veche nu se pierde', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const d = w.desemnari
  const m = memorieAcces()
  assert.equal(siguraMemorat(w.terrain, d, R, m, wx + 3, wy + 3, g + 1), true, 'fixtura: solul e sigur')
  const inainte = d.editariConstr
  // Santierul de pe celula: cea mai veche schimbare nevazuta.
  assert.ok(adaugaDesemnare(d, w.nextId++, Desemnare.CONSTRUIESTE, wx + 3, wy + 3, g + 1, 3, Piesa.PERETE).ok)
  for (let i = 0; i < JURNAL_DESEMNARI_CAP / 2; i++) {
    const a = adaugaDesemnare(d, w.nextId++, Desemnare.CONSTRUIESTE, wx + 5, wy + 5, g + 40, 3, Piesa.PERETE)
    assert.ok(a.ok)
    if (a.ok) stergeDesemnare(d, a.value)
  }
  assert.equal(d.editariConstr - inainte, JURNAL_DESEMNARI_CAP + 1, 'fixtura: exact JURNAL_DESEMNARI_CAP + 1 schimbari nevazute')
  const b = siguraMemorat(w.terrain, d, R, memorieAcces(), wx + 3, wy + 3, g + 1)
  assert.equal(b, false, 'fixtura: celula santierului nu e stabila')
  assert.equal(siguraMemorat(w.terrain, d, R, m, wx + 3, wy + 3, g + 1), b, 'memoria a citit un inel suprascris')
})
