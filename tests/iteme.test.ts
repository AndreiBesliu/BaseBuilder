import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { Item } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { Reason } from '../src/sim/result.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { materialAt } from '../src/sim/terrain/terrain.ts'
import { isWalkable, NO_REGION, regionAt } from '../src/sim/regions.ts'
import { asazaItem, itemLaCelula, reindexeazaIteme, slotItem } from '../src/sim/iteme.ts'
import { decode, encode } from '../src/sim/save.ts'
import { desemneaza, laSit, lasaItem, marfaTotala, panaCand, patratPlat, picteaza, R, ruleaza, solid } from './fixturi.ts'

// ---------------------------------------------------------------------------
// producerea la sapat
// ---------------------------------------------------------------------------

test('sapatul PRODUCE: comanda dig lasa pe celula sapata mormanul din digYield[material], si sub sol da PIATRA', () => {
  const { w } = laSit(501, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const g = solid(w, cx + 2, cy)!
  const sus = materialAt(w.terrain, cx + 2, cy, g)
  assert.ok(sus.ok)
  const asteptat = R.digYield[sus.value]!
  assert.ok(asteptat.cantitate > 0, 'fixtura: suprafata n-are yield')
  assert.ok(applyCommand(w, { kind: 'dig', wx: cx + 2, wy: cy, z: g }, R).ok)
  // Celula sapata e calcabila dupa sapare (podea la g-1, aer deasupra) → mormanul e chiar acolo.
  const it = itemLaCelula(w.iteme, cx + 2, cy, g)
  assert.notEqual(it, -1, 'niciun morman pe celula sapata')
  assert.equal(w.iteme.kind[it], asteptat.fel)
  assert.equal(w.iteme.cantitate[it], asteptat.cantitate)
  assert.equal(w.iteme.vii, 1)
  // Trei niveluri mai jos e ROCA: piatra.
  const roca = materialAt(w.terrain, cx + 4, cy, g - 3)
  assert.ok(roca.ok && roca.value === Material.ROCA, 'fixtura: nu e roca la g-3')
  assert.ok(applyCommand(w, { kind: 'dig', wx: cx + 4, wy: cy, z: g - 3 }, R).ok)
  // Celula (g-3) sapata sub pamant: n-are headroom (g-2 e pamant) → nu e calcabila →
  // mormanul cade pe primul vecin calcabil din ordinea fixa, sau se numara pierdut.
  let piatra = 0
  for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1 && w.iteme.kind[i] === Item.PIATRA) piatra += w.iteme.cantitate[i]!
  assert.equal(piatra + w.ratiune.itemePierdute, R.digYield[Material.ROCA]!.cantitate, 'piatra din voxelul ingropat nici nu e pe jos, nici nu e numarata pierduta')
  assert.equal(marfaTotala(w) + w.ratiune.itemePierdute, asteptat.cantitate + R.digYield[Material.ROCA]!.cantitate)
})

test('content: digYield trebuie sa acopere TOATE materialele solide, si nu accepta unul nesolid sau un fel necunoscut', async () => {
  const { parseRules } = await import('../src/sim/content.ts')
  const baza = { ...R, digYield: { ROCA: { fel: 'PIATRA', cantitate: 20 }, PAMANT: { fel: 'PAMANT', cantitate: 10 }, IARBA: { fel: 'PAMANT', cantitate: 10 }, LEMN_CONSTRUIT: { fel: 'LEMN', cantitate: 5 }, PIATRA_CONSTRUITA: { fel: 'PIATRA', cantitate: 20 }, MOLOZ: { fel: 'PIATRA', cantitate: 10 } } }
  assert.ok(parseRules(baza).ok, JSON.stringify(parseRules(baza)))
  // IARBA lipsa: e suprafata, cel mai comun prim gest al jucatorului — un item de 0 bucati ar fi carat la nesfarsit.
  const faraIarba = { ...baza, digYield: { ...baza.digYield, IARBA: undefined } }
  const out = parseRules(JSON.parse(JSON.stringify(faraIarba)))
  assert.equal(out.ok, false)
  if (!out.ok) { assert.equal(out.reason, Reason.LIPSA_MATERIAL); assert.equal(out.params.camp, 'digYield.IARBA') }
  const apa = parseRules({ ...baza, digYield: { ...baza.digYield, APA: { fel: 'PIATRA', cantitate: 1 } } })
  assert.equal(apa.ok, false)
  const fel = parseRules({ ...baza, digYield: { ...baza.digYield, ROCA: { fel: 'AUR', cantitate: 1 } } })
  assert.equal(fel.ok, false)
  if (!fel.ok) assert.equal(fel.reason, Reason.VALOARE_INVALIDA)
  const zero = parseRules({ ...baza, digYield: { ...baza.digYield, ROCA: { fel: 'PIATRA', cantitate: 0 } } })
  assert.equal(zero.ok, false)
  const preaMult = parseRules({ ...baza, digYield: { ...baza.digYield, ROCA: { fel: 'PIATRA', cantitate: R.itemStackMax + 1 } } })
  assert.equal(preaMult.ok, false)
  const carry = parseRules({ ...baza, haulCarryMax: R.itemStackMax + 1 })
  assert.equal(carry.ok, false)
  if (!carry.ok) assert.equal(carry.params.camp, 'haulCarryMax')
})

// ---------------------------------------------------------------------------
// depunerea — o singura cale
// ---------------------------------------------------------------------------

test('asazaItem: acelasi fel pe aceeasi celula se CONTOPESTE pana la plafon, restul merge pe vecinul urmator din ordinea fixa', () => {
  const { w, sit } = laSit(502, 1)
  const p = patratPlat(w, sit, 5, 3, 40)
  assert.ok(p, 'fixtura: niciun patrat plat')
  const cx = p.x0 + 2
  const cy = p.y0 + 2
  lasaItem(w, Item.PIATRA, 50, cx, cy)
  lasaItem(w, Item.PIATRA, 20, cx, cy)
  assert.equal(w.iteme.vii, 1, 'doua mormane de acelasi fel pe aceeasi celula')
  assert.equal(w.iteme.cantitate[itemLaCelula(w.iteme, cx, cy, p.g + 1)], 70)
  // Inca 20: 5 incap, 15 merg pe primul vecin (+x).
  lasaItem(w, Item.PIATRA, 20, cx, cy)
  assert.equal(w.iteme.cantitate[itemLaCelula(w.iteme, cx, cy, p.g + 1)], R.itemStackMax)
  const vecin = itemLaCelula(w.iteme, cx + 1, cy, p.g + 1)
  assert.notEqual(vecin, -1, 'restul n-a ajuns pe vecinul +x')
  assert.equal(w.iteme.cantitate[vecin], 15)
  // Alt fel pe celula plina: nu se contopeste, nu suprascrie — merge tot pe un vecin.
  lasaItem(w, Item.PAMANT, 10, cx, cy)
  assert.equal(w.iteme.kind[itemLaCelula(w.iteme, cx, cy, p.g + 1)], Item.PIATRA)
  let pamant = 0
  for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1 && w.iteme.kind[i] === Item.PAMANT) pamant++
  assert.equal(pamant, 1)
  assert.equal(marfaTotala(w), 100)
  assert.equal(w.ratiune.itemePierdute, 0)
  // Nicio celula cu doua mormane: indexul e consistent cu store-ul.
  assert.ok(reindexeazaIteme(w.iteme, R).ok)
})

test('asazaItem: cand NICIO celula din ordine nu primeste felul, pierderea se NUMARA in zavorul per lume, nu se pierde tacut', () => {
  const { w, sit } = laSit(503, 1)
  const p = patratPlat(w, sit, 5, 3, 40)
  assert.ok(p)
  const cx = p.x0 + 2
  const cy = p.y0 + 2
  // Celula si cei patru vecini: pline cu LEMN (plafon). Sus e aer fara podea, jos e piatra.
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) lasaItem(w, Item.LEMN, R.itemStackMax, cx + dx, cy + dy)
  assert.equal(w.ratiune.itemePierdute, 0)
  const r = asazaItem(w, R, Item.PIATRA, 7, cx, cy, p.g + 1)
  assert.equal(r.pus, 0)
  assert.equal(r.ultimulSlot, -1)
  assert.equal(w.ratiune.itemePierdute, 7, 'pierderea nu s-a numarat')
  // Comanda `lasaItem` insa REFUZA in loc sa piarda: un ordin respins nu trage zavorul.
  const inainte = w.ratiune.itemePierdute
  const out = applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: 7, wx: cx, wy: cy, z: p.g + 1 }, R)
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.reason, Reason.CAPACITATE_DEPASITA)
  assert.equal(w.ratiune.itemePierdute, inainte)
})

test('un save cu doua iteme vii pe aceeasi celula, sau cu cantitate 0, e refuzat', () => {
  const { w, sit } = laSit(504, 1)
  lasaItem(w, Item.PIATRA, 20, sit.wx + 2, sit.wy)
  const raw = JSON.parse(encode(w)) as { data: { nextId: number; iteme: Record<string, number | number[]> } }
  const it = raw.data.iteme
  it.count = 2
  for (const camp of ['id', 'kind', 'wx', 'wy', 'z', 'cantitate', 'alive', 'reincercaLaTick'] as const) (it[camp] as number[]).push((it[camp] as number[])[0]!)
  ;(it.id as number[])[1] = raw.data.nextId
  raw.data.nextId++
  const dublu = decode(JSON.stringify(raw))
  assert.equal(dublu.ok, false)
  if (!dublu.ok) assert.equal(dublu.reason, Reason.CELULA_OCUPATA)
  const raw2 = JSON.parse(encode(w)) as { data: { iteme: Record<string, number[]> } }
  raw2.data.iteme.cantitate![0] = 0
  const gol = decode(JSON.stringify(raw2))
  assert.equal(gol.ok, false)
  if (!gol.ok) assert.equal(gol.reason, Reason.VALOARE_INVALIDA)
})

// ---------------------------------------------------------------------------
// carligele de teren
// ---------------------------------------------------------------------------

test('podeaua sapata de sub un morman: mormanul CADE pe celula de dedesubt, cu acelasi id, si ramane pe o celula calcabila', () => {
  const { w, sit } = laSit(505, 1)
  const p = patratPlat(w, sit, 3, 3, 40)
  assert.ok(p)
  const cx = p.x0 + 1
  const cy = p.y0 + 1
  const id = lasaItem(w, Item.LEMN, 30, cx, cy)
  assert.equal(w.iteme.z[slotItem(w.iteme, id)], p.g + 1)
  // Se sapa solul de sub el.
  assert.ok(applyCommand(w, { kind: 'dig', wx: cx, wy: cy, z: p.g }, R).ok)
  const is = slotItem(w.iteme, id)
  assert.notEqual(is, -1, 'mormanul si-a pierdut identitatea desi n-a fost contopit')
  assert.equal(w.iteme.z[is], p.g, 'mormanul n-a cazut pe celula sapata')
  assert.ok(isWalkable(w.terrain, w.iteme.wx[is]!, w.iteme.wy[is]!, w.iteme.z[is]!, R))
  // Yield-ul sapaturii (alt fel) a mers pe un vecin, si nimic nu s-a pierdut.
  assert.equal(marfaTotala(w), 30 + R.digYield[Material.IARBA]!.cantitate || marfaTotala(w) === 30 + R.digYield[Material.PAMANT]!.cantitate ? marfaTotala(w) : -1)
  assert.equal(w.ratiune.itemePierdute, 0)
  for (let i = 0; i < w.iteme.count; i++) {
    if (w.iteme.alive[i] === 0) continue
    assert.ok(isWalkable(w.terrain, w.iteme.wx[i]!, w.iteme.wy[i]!, w.iteme.z[i]!, R), `itemul ${i} zace pe o celula necalcabila`)
  }
})

test('fill refuza sa zideasca peste un morman, si peste celula care i-ar lua headroom-ul', () => {
  const { w, sit } = laSit(506, 1)
  const cx = sit.wx + 3
  const cy = sit.wy
  const g = solid(w, cx, cy)!
  const id = lasaItem(w, Item.PIATRA, 10, cx, cy)
  const peste = applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z: g + 1, material: Material.PIATRA_CONSTRUITA }, R)
  assert.equal(peste.ok, false)
  if (!peste.ok) { assert.equal(peste.reason, Reason.CELULA_OCUPATA); assert.equal(peste.params.item, id) }
  const cap = applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z: g + 2, material: Material.PIATRA_CONSTRUITA }, R)
  assert.equal(cap.ok, false)
  if (!cap.ok) assert.equal(cap.reason, Reason.CELULA_OCUPATA)
  // Deasupra headroom-ului, garda de OCUPARE nu se mai aplica. Refuzul poate
  // veni acum din regula de stabilitate (`fill` trece prin ea din taietura 2),
  // dar nu mai are voie sa fie despre morman.
  const sus = applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z: g + 3, material: Material.PIATRA_CONSTRUITA }, R)
  if (!sus.ok) assert.notEqual(sus.reason, Reason.CELULA_OCUPATA, 'garda de ocupare s-a intins peste headroom')
})

test('plafonul de iteme: sapatul REFUZA cand nu mai incape niciun morman — voxelul ramane, marfa nu se pierde', () => {
  const reguli = { ...R, itemCapacity: 2 }
  const { w, sit } = laSit(507, 1, [], reguli)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  void sit
  for (const dx of [3, 5]) assert.ok(applyCommand(w, { kind: 'dig', wx: cx + dx, wy: cy, z: solid(w, cx + dx, cy)! }, reguli).ok)
  assert.equal(w.iteme.vii, 2)
  const g = solid(w, cx + 7, cy)!
  const out = applyCommand(w, { kind: 'dig', wx: cx + 7, wy: cy, z: g }, reguli)
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.reason, Reason.CAPACITATE_DEPASITA)
  const m = materialAt(w.terrain, cx + 7, cy, g)
  assert.ok(m.ok && m.value !== Material.AER, 'voxelul a fost sapat desi marfa n-avea unde sa apara')
  // Si prin job: desemnarea ramane, jobul e INCOMPLET cu cauza pe ea.
  desemneaza(w, cx + 7, cy, undefined, reguli)
  const n = panaCand(w, 600, (w) => w.desemnari.ultimulMotiv[0]! > 0, reguli)
  assert.ok(n >= 0, 'desemnarea n-a primit nicio cauza')
  assert.equal(w.desemnari.vii, 1)
  assert.equal(w.ratiune.itemePierdute, 0)
  assert.equal(w.ratiune.joburiFaraProgres, 0, 'jobul a muncit 40 de tickuri; nu e „fara progres"')
})

// ---------------------------------------------------------------------------
// zonele
// ---------------------------------------------------------------------------

test('picteazaZona: un dreptunghi = O zona, celulele necalcabile si cele deja pictate se sar, nimic in aer nu consuma id', () => {
  const { w, sit } = laSit(508, 1)
  const p = patratPlat(w, sit, 4, 3, 40)
  assert.ok(p)
  const idInainte = w.nextId
  const aer = applyCommand(w, { kind: 'picteazaZona', x0: p.x0, y0: p.y0, x1: p.x0 + 3, y1: p.y0 + 3, z: p.g + 5 }, R)
  assert.equal(aer.ok, false)
  if (!aer.ok) assert.equal(aer.reason, Reason.LOC_NECALCABIL)
  assert.equal(w.nextId, idInainte, 'un refuz a consumat id-uri')
  const id = picteaza(w, p.x0, p.y0, 4)
  assert.equal(w.zone.vii, 1)
  assert.equal(w.zone.celule.vii, 16)
  assert.equal(w.zone.prioritate[0], R.zonePriorityDefault)
  // Pictat din nou peste: celulele existente se sar; nicio zona noua daca n-a intrat nimic.
  const iar = applyCommand(w, { kind: 'picteazaZona', x0: p.x0, y0: p.y0, x1: p.x0 + 1, y1: p.y0 + 1, z: p.g + 1 }, R)
  assert.equal(iar.ok, false)
  assert.equal(w.zone.vii, 1)
  // Extindere in aceeasi zona, cu zonaId.
  const g2 = solid(w, p.x0 + 4, p.y0)
  if (g2 === p.g) {
    assert.ok(applyCommand(w, { kind: 'picteazaZona', x0: p.x0 + 4, y0: p.y0, x1: p.x0 + 4, y1: p.y0, z: p.g + 1, zonaId: id }, R).ok)
    assert.equal(w.zone.vii, 1)
    assert.equal(w.zone.celule.vii, 17)
  }
  // Prioritatea: validata.
  for (const pr of [0, R.zonePriorityLevels + 1, 1.5]) {
    const out = applyCommand(w, { kind: 'setPrioritateZona', id, prioritate: pr }, R)
    assert.equal(out.ok, false)
  }
  assert.ok(applyCommand(w, { kind: 'setPrioritateZona', id, prioritate: 5 }, R).ok)
  assert.equal(w.zone.prioritate[0], 5)
  // Stergerea.
  assert.ok(applyCommand(w, { kind: 'stergeZona', id }, R).ok)
  assert.equal(w.zone.vii, 0)
  assert.equal(w.zone.celule.vii, 0)
  const lipsa = applyCommand(w, { kind: 'stergeZona', id }, R)
  assert.equal(lipsa.ok, false)
  if (!lipsa.ok) assert.equal(lipsa.reason, Reason.ENTITATE_INEXISTENTA)
})

test('pictarea intinde acoperirea de regiuni: fiecare celula de zona e intr-o regiune calculata imediat dupa comanda', () => {
  // Discul la pictare e SINGURUL mecanism care leaga un depozit nou de colonie:
  // coridoarele intinse la evaluare au fost scoase, fiindca acoperirea crestea
  // nemarginit (vezi testul de mai jos si DEVLOG). Deci discul chiar trebuie sa fie
  // aici, si mutatia „fara disc" trebuie sa pice testul de carat la 5 blocuri.
  const { w, sit } = laSit(509, 1)
  const p = patratPlat(w, sit, 3, 40, 70)
  assert.ok(p, 'fixtura: niciun patrat plat la 40-70 de celule')
  assert.equal(regionAt(w.regions, p.x0, p.y0, p.g + 1), NO_REGION, 'fixtura: zona era deja acoperita')
  picteaza(w, p.x0, p.y0, 3)
  for (let i = 0; i < w.zone.celule.count; i++) {
    assert.notEqual(regionAt(w.regions, w.zone.celule.wx[i]!, w.zone.celule.wy[i]!, w.zone.celule.z[i]!), NO_REGION, `celula de zona ${i} fara regiune`)
  }
})

test('indexul zonelor e o functie de stare: dupa orice schimbare se reconstruieste identic in lumea continua si in cea incarcata', () => {
  const { w, sit } = laSit(510, 2)
  const p = patratPlat(w, sit, 3, 4, 40)
  assert.ok(p)
  picteaza(w, p.x0, p.y0, 3, 4)
  lasaItem(w, Item.PIATRA, 30, sit.wx + 2, sit.wy)
  lasaItem(w, Item.PAMANT, 75, p.x0, p.y0)
  const t = ruleaza(w, 120)
  void t
  const loaded = decode(encode(w))
  assert.ok(loaded.ok)
  const { indexZone } = await_import()
  const a = indexZone(w, R)
  const b = indexZone(loaded.value, R)
  assert.deepEqual([...a.maxPrioLibera], [...b.maxPrioLibera])
  assert.deepEqual(a.deMutat, b.deMutat)
  assert.deepEqual(a.depoziteOrdonate, b.depoziteOrdonate)
  assert.deepEqual(a.paturiLibere, b.paturiLibere)
  assert.deepEqual(a.libere.map((l) => [...l]), b.libere.map((l) => [...l]))
  assert.equal(a.peJosFaraDepozit, b.peJosFaraDepozit)
})

function await_import(): { indexZone: (w: World, r: typeof R) => { maxPrioLibera: Int32Array; deMutat: number[]; depoziteOrdonate: number[]; paturiLibere: number[]; libere: number[][]; peJosFaraDepozit: number } } {
  // Import static ar fi mai simplu; functia exista ca testul de mai sus sa ramana sincron.
  return { indexZone: indexZoneRef }
}
import { indexZone as indexZoneRef } from '../src/sim/zone.ts'
