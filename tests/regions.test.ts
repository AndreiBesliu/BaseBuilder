import test from 'node:test'
import assert from 'node:assert/strict'
import {
  areConnected,
  BLOCK_CELLS,
  blockOfCell,
  canStep,
  componentCount,
  createRegions,
  decodeBlockKey,
  ensureArea,
  find,
  isWalkable,
  markDirty,
  NO_REGION,
  rebuildDirty,
  regionAt,
  REGION_SIZE,
  regionCount,
  statistici,
} from '../src/sim/regions.ts'
import type { RegionStore } from '../src/sim/regions.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { createTerrain, dig, fill, groundLevelM, setFocus } from '../src/sim/terrain/terrain.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { nextInt, stream } from '../src/sim/rng.ts'

const R = DEFAULT_RULES
const SEED = 777
// Chunk ALES pe uscat, nu la intamplare: la 220/220 solul e la -49 m, sub nivelul
// apei (-30 m), deci nu se poate sta nicaieri si tot testul ar fi fost vid. Cautat
// programatic: 36 din 36 de sonde walkable.
const CX = 200
const CY = 212

function lume(): { t: Terrain; s: RegionStore; baseX: number; baseY: number; z: number } {
  const t = createTerrain(SEED, 4)
  setFocus(t, CX, CY)
  const baseX = CX * 32
  const baseY = CY * 32
  const g = groundLevelM(t, baseX + 8, baseY + 8)
  assert.ok(g.ok)
  const s = createRegions()
  // Se sta PE sol, deci nivelul de mers e chiar deasupra celui mai de sus solid.
  return { t, s, baseX, baseY, z: g.value + 1 }
}

// --- invariantii de structura ----------------------------------------------

test('INVARIANT 1: o regiune nu traverseaza niciodata un bloc', () => {
  const { t, s, baseX, baseY, z } = lume()
  ensureArea(t, s, baseX + 8, baseY + 8, z, 2, R)

  // Pentru fiecare id de regiune, toate celulele lui trebuie sa fie in ACELASI bloc.
  const bloculRegiunii = new Map<number, number>()
  for (const key of s.keys) {
    const cells = s.cells.get(key)!
    for (let i = 0; i < BLOCK_CELLS; i++) {
      const r = cells[i]!
      if (r === NO_REGION) continue
      const vazut = bloculRegiunii.get(r)
      if (vazut === undefined) bloculRegiunii.set(r, key)
      else assert.equal(vazut, key, `regiunea ${r} apare in doua blocuri: ${vazut} si ${key}`)
    }
  }
  assert.ok(bloculRegiunii.size > 0, 'niciun bloc calculat — testul nu verifica nimic')
})

test('INVARIANT 2: o regiune sta pe UN singur nivel z', () => {
  // Consecinta directa a invariantului 1 plus a faptului ca blocul are un z in
  // cheie. Se verifica explicit fiindca e usor de rupt fuzionand niveluri la
  // legare in loc de a le uni prin union-find.
  const { t, s, baseX, baseY, z } = lume()
  ensureArea(t, s, baseX + 8, baseY + 8, z, 1, R)
  const zRegiunii = new Map<number, number>()
  for (const key of s.keys) {
    const cells = s.cells.get(key)!
    const zBloc = (key % 1024) - 512
    for (let i = 0; i < BLOCK_CELLS; i++) {
      const r = cells[i]!
      if (r === NO_REGION) continue
      const vazut = zRegiunii.get(r)
      if (vazut === undefined) zRegiunii.set(r, zBloc)
      else assert.equal(vazut, zBloc, `regiunea ${r} atinge nivelurile ${vazut} si ${zBloc}`)
    }
  }
})

test('celulele dintr-o regiune sunt chiar conexe intre ele, in interiorul blocului', () => {
  // Fara asta, „regiune" ar fi doar o eticheta. Se verifica prin flood fill
  // INDEPENDENT, nu reutilizand codul testat.
  const { t, s, baseX, baseY, z } = lume()
  ensureArea(t, s, baseX + 8, baseY + 8, z, 1, R)

  const key = s.keys[Math.floor(s.keys.length / 2)]!
  const cells = s.cells.get(key)!
  const zBloc = (key % 1024) - 512
  const flat = Math.floor(key / 1024)
  const bx = flat % (16384 / REGION_SIZE)
  const by = Math.floor(flat / (16384 / REGION_SIZE))

  const grupe = new Map<number, number[]>()
  for (let i = 0; i < BLOCK_CELLS; i++) {
    const r = cells[i]!
    if (r === NO_REGION) continue
    const lista = grupe.get(r) ?? []
    lista.push(i)
    grupe.set(r, lista)
  }

  for (const [r, indici] of [...grupe].sort((a, b) => a[0] - b[0])) {
    const set = new Set(indici)
    const vizitate = new Set<number>([indici[0]!])
    const coada = [indici[0]!]
    while (coada.length > 0) {
      const cur = coada.pop()!
      const cx = cur % REGION_SIZE
      const cy = Math.floor(cur / REGION_SIZE)
      const vecini = [
        cx > 0 ? cur - 1 : -1,
        cx < REGION_SIZE - 1 ? cur + 1 : -1,
        cy > 0 ? cur - REGION_SIZE : -1,
        cy < REGION_SIZE - 1 ? cur + REGION_SIZE : -1,
      ]
      for (const v of vecini) {
        if (v < 0 || !set.has(v) || vizitate.has(v)) continue
        vizitate.add(v)
        coada.push(v)
      }
    }
    assert.equal(vizitate.size, indici.length, `regiunea ${r} din blocul ${bx}/${by}@${zBloc} nu e conexa`)
  }
})

// --- reachability -----------------------------------------------------------

test('un zid care inchide complet o zona o RUPE din componenta', () => {
  // Proba care conteaza: daca asta trece cand n-ar trebui, tot sistemul e decor.
  const { t, s, baseX, baseY, z } = lume()

  // Sapa o camera de 5×5 la nivelul solului, apoi o inchide cu un zid de 3 m.
  const cameraX = baseX + 4
  const cameraY = baseY + 4
  for (let dy = 0; dy < 5; dy++) {
    for (let dx = 0; dx < 5; dx++) {
      const g = groundLevelM(t, cameraX + dx, cameraY + dy)
      if (g.ok) dig(t, cameraX + dx, cameraY + dy, g.value)
    }
  }

  ensureArea(t, s, cameraX + 2, cameraY + 2, z, 2, R)
  const inauntru = { x: cameraX + 2, y: cameraY + 2 }
  const afara = { x: baseX + 20, y: baseY + 20 }

  const zIn = celulaDeMers(t, inauntru.x, inauntru.y)
  const zOut = celulaDeMers(t, afara.x, afara.y)
  assert.notEqual(zIn, null)
  assert.notEqual(zOut, null)

  const inainte = areConnected(s, inauntru.x, inauntru.y, zIn!, afara.x, afara.y, zOut!)

  // Zid de 3 m in jurul camerei.
  for (let d = -1; d <= 5; d++) {
    for (const [px, py] of [
      [cameraX + d, cameraY - 1],
      [cameraX + d, cameraY + 5],
      [cameraX - 1, cameraY + d],
      [cameraX + 5, cameraY + d],
    ] as const) {
      const g = groundLevelM(t, px, py)
      if (!g.ok) continue
      for (let h = 1; h <= 3; h++) fill(t, px, py, g.value + h, Material.PIATRA_CONSTRUITA)
      markDirty(s, px, py, g.value + 1, R)
    }
  }
  rebuildDirty(t, s, R)
  ensureArea(t, s, inauntru.x, inauntru.y, zIn!, 2, R)

  const dupa = areConnected(s, inauntru.x, inauntru.y, zIn!, afara.x, afara.y, zOut!)
  assert.equal(inainte, true, 'inainte de zid, camera trebuia sa fie legata de exterior')
  assert.equal(dupa, false, 'zidul n-a rupt legatura — reachability-ul minte, si minte in sus')
})

function celulaDeMers(t: Terrain, wx: number, wy: number): number | null {
  const g = groundLevelM(t, wx, wy)
  if (!g.ok) return null
  for (let z = g.value + 1; z >= g.value - 6; z--) {
    if (isWalkable(t, wx, wy, z, R)) return z
  }
  return null
}

test('reachability e reflexiv si simetric', () => {
  const { t, s, baseX, baseY, z } = lume()
  ensureArea(t, s, baseX + 8, baseY + 8, z, 1, R)
  const a = { x: baseX + 8, y: baseY + 8 }
  const b = { x: baseX + 12, y: baseY + 12 }
  const za = celulaDeMers(t, a.x, a.y)
  const zb = celulaDeMers(t, b.x, b.y)
  assert.notEqual(za, null)
  assert.notEqual(zb, null)
  assert.equal(areConnected(s, a.x, a.y, za!, a.x, a.y, za!), true)
  assert.equal(
    areConnected(s, a.x, a.y, za!, b.x, b.y, zb!),
    areConnected(s, b.x, b.y, zb!, a.x, a.y, za!),
  )
})

test('o celula dintr-un bloc NECALCULAT raspunde „nu", nu „poate"', () => {
  // O necunoscuta nu are voie sa porneasca un A*. Vezi antetul modulului.
  const { t, s, baseX, baseY, z } = lume()
  ensureArea(t, s, baseX + 8, baseY + 8, z, 0, R)
  const departe = baseX + 4000
  assert.equal(regionAt(s, departe, baseY + 8, z), NO_REGION)
  assert.equal(areConnected(s, baseX + 8, baseY + 8, z, departe, baseY + 8, z), false)
})

// --- determinism ------------------------------------------------------------

test('acelasi teren da aceeasi structura de regiuni, indiferent de ordinea calcularii', () => {
  const a = lume()
  ensureArea(a.t, a.s, a.baseX + 8, a.baseY + 8, a.z, 1, R)

  const b = lume()
  // Ordine INVERSA de pregatire: daca union-find-ul depinde de ordinea unirilor,
  // aici se vede. De asta unirea leaga mereu spre id-ul mai mic.
  ensureArea(b.t, b.s, b.baseX + 24, b.baseY + 24, b.z, 1, R)
  ensureArea(b.t, b.s, b.baseX + 8, b.baseY + 8, b.z, 1, R)

  assert.equal(regionCount(a.s) > 0, true)
  assert.equal(componentCount(a.s) > 0, true)
  // Componentele din zona comuna trebuie sa fie la fel de conectate.
  const p1 = { x: a.baseX + 8, y: a.baseY + 8 }
  const p2 = { x: a.baseX + 12, y: a.baseY + 12 }
  const z1 = celulaDeMers(a.t, p1.x, p1.y)!
  const z2 = celulaDeMers(a.t, p2.x, p2.y)!
  assert.equal(
    areConnected(a.s, p1.x, p1.y, z1, p2.x, p2.y, z2),
    areConnected(b.s, p1.x, p1.y, z1, p2.x, p2.y, z2),
  )
})

// --- fuzz -------------------------------------------------------------------

test('fuzz: 10.000 de edituri aleatorii, invariantii rezista', () => {
  // Cerut explicit de PLAN.md la S9-11. Nu cauta un bug anume — cauta starea pe
  // care n-am imaginat-o. Editarile se aplica in loturi, cu recalculare intre
  // ele, exact ca in joc.
  const { t, s, baseX, baseY, z } = lume()
  ensureArea(t, s, baseX + 16, baseY + 16, z, 2, R)

  const rng = stream(SEED, 'worldgen')
  const SPAN = 48
  let sapate = 0
  let zidite = 0

  for (let lot = 0; lot < 100; lot++) {
    for (let i = 0; i < 100; i++) {
      const wx = baseX + nextInt(rng, SPAN)
      const wy = baseY + nextInt(rng, SPAN)
      const g = groundLevelM(t, wx, wy)
      if (!g.ok) continue
      const zz = g.value - nextInt(rng, 3)
      if (nextInt(rng, 2) === 0) {
        if (dig(t, wx, wy, zz).ok) sapate++
      } else {
        if (fill(t, wx, wy, zz + 1, Material.PIATRA_CONSTRUITA).ok) zidite++
      }
      markDirty(s, wx, wy, zz, R)
    }
    rebuildDirty(t, s, R)

    // Invariantul 1 dupa fiecare lot: nicio regiune nu traverseaza un bloc.
    const bloculRegiunii = new Map<number, number>()
    for (const key of s.keys) {
      const cells = s.cells.get(key)!
      for (let c = 0; c < BLOCK_CELLS; c++) {
        const r = cells[c]!
        if (r === NO_REGION) continue
        const vazut = bloculRegiunii.get(r)
        if (vazut === undefined) bloculRegiunii.set(r, key)
        else assert.equal(vazut, key, `lot ${lot}: regiunea ${r} in doua blocuri`)
      }
    }

    // Etichetarea de componente se verifica printr-un ORACOL INDEPENDENT: se
    // reface partitia cu propriul flood peste graful de adiacenta si se compara.
    // Varianta dinainte verifica semantica de union-find (`find(find(x)) === x`),
    // care dupa schimbarea de model nu mai insemna nimic — si un test care nu mai
    // inseamna nimic trece exact la fel de bine ca unul care inseamna.
    const vii: number[] = []
    for (const key of s.keys) {
      const cells = s.cells.get(key)!
      for (let c = 0; c < BLOCK_CELLS; c++) {
        const r = cells[c]!
        if (r !== NO_REGION && !vii.includes(r)) vii.push(r)
      }
    }
    for (const r of vii) {
      assert.ok(find(s, r) >= 0, `lot ${lot}: regiunea vie ${r} n-are eticheta`)
    }

    // Flood propriu peste adiacenta, pornit din fiecare regiune ne-vizitata.
    const aMea = new Map<number, number>()
    let eticheta = 0
    for (const start of [...vii].sort((a, b) => a - b)) {
      if (aMea.has(start)) continue
      const e = eticheta++
      const coada = [start]
      aMea.set(start, e)
      while (coada.length > 0) {
        const cur = coada.pop()!
        for (const v of s.adj.get(cur) ?? []) {
          if (aMea.has(v)) continue
          aMea.set(v, e)
          coada.push(v)
        }
      }
    }

    // Partitiile trebuie sa coincida: aceeasi eticheta la mine <=> aceeasi la el.
    for (let i = 0; i < vii.length; i += 7) {
      for (let j = i; j < vii.length; j += 11) {
        const a = vii[i]!
        const b = vii[j]!
        assert.equal(
          find(s, a) === find(s, b),
          aMea.get(a) === aMea.get(b),
          `lot ${lot}: regiunile ${a} si ${b} sunt in dezacord intre etichetare si oracol`,
        )
      }
    }
  }

  assert.ok(sapate > 1000, `doar ${sapate} sapaturi reusite — fuzz-ul n-a atins terenul`)
  assert.ok(zidite > 500, `doar ${zidite} zidiri reusite`)
  assert.ok(s.keys.length > 0, 'niciun bloc rezident la final')
  void blockOfCell
})

// --- memoizarea legarii ------------------------------------------------------
//
// `linkBlock` nu mai re-deriva muchiile unui bloc deja legat. E schimbarea care a
// scos tickul de agenti de la 6741 µs la 311 µs, si e exact genul de optimizare
// care poate pierde o muchie fara ca nimic sa se planga: graful ar ramane valid,
// doar mai sarac, iar reachability-ar spune „nu exista drum" pentru un drum care
// exista. Testele de mai jos sunt plasa.

/** Amprenta completa a grafului: ce celula e in ce componenta. */
function amprenta(s: RegionStore): string {
  const out: string[] = []
  for (const key of [...s.keys].sort((a, b) => a - b)) {
    const cells = s.cells.get(key)!
    const linie: number[] = []
    for (let i = 0; i < BLOCK_CELLS; i++) {
      const r = cells[i]!
      linie.push(r === NO_REGION ? -1 : find(s, r))
    }
    out.push(`${key}:${linie.join(',')}`)
  }
  return out.join('\n')
}

test('MEMOIZARE: o raza mica urmata de una mare da acelasi graf ca una mare singura', () => {
  // Riscul concret al memoizarii: blocul A se leaga cand vecinul B inca nu exista,
  // iar la a doua cerere A e sarit, deci muchia A-B nu apare niciodata. Daca asta
  // s-ar intampla, amprentele ar diferi.
  const a = lume()
  ensureArea(a.t, a.s, a.baseX + 8, a.baseY + 8, a.z, 1, R)
  ensureArea(a.t, a.s, a.baseX + 8, a.baseY + 8, a.z, 3, R)

  const b = lume()
  ensureArea(b.t, b.s, b.baseX + 8, b.baseY + 8, b.z, 3, R)

  assert.equal(amprenta(a.s), amprenta(b.s))
})

test('MEMOIZARE: o cerere repetata nu mai face nicio MUNCA', () => {
  // Prima versiune a acestui test compara MARIMILE structurilor dupa a doua
  // cerere — `cells.size`, `regionCount`, `legate.size`. Toate trei raman
  // neschimbate si daca memoizarea e scoasa complet, fiindca a doua rulare
  // reconstruieste exact aceleasi blocuri si aceleasi regiuni. Testul nu putea
  // deosebi „n-a facut nimic" de „a refacut acelasi lucru" — adica exact
  // regresia de 21x pe care e pus sa o pazeasca.
  //
  // Acum se masoara MUNCA.
  const { t, s, baseX, baseY, z } = lume()
  ensureArea(t, s, baseX + 8, baseY + 8, z, 2, R)
  assert.ok(s.legate.size > 0, 'prima cerere n-a legat nimic — fixtura e goala')

  const calculatePrima = statistici.blocuriCalculate
  const legatePrima = statistici.blocuriLegate
  assert.ok(legatePrima > 20, `prima cerere a legat doar ${legatePrima} blocuri — fixtura e prea mica`)

  const blocuri = s.cells.size
  const regiuni = regionCount(s)
  ensureArea(t, s, baseX + 8, baseY + 8, z, 2, R)

  assert.equal(statistici.blocuriLegate, legatePrima, 'a doua cerere a mai legat blocuri')
  assert.equal(statistici.blocuriCalculate, calculatePrima, 'a doua cerere a mai calculat blocuri')
  assert.equal(s.cells.size, blocuri)
  assert.equal(regionCount(s), regiuni)
})

test('MEMOIZARE: o sapatura DEZLEAGA blocurile atinse, deci muchiile se refac', () => {
  // Proba negativa a memoizarii. Daca `rebuildDirty` n-ar sterge din `legate`,
  // blocurile atinse ar ramane marcate ca legate si muchiile rupte de sapatura
  // n-ar mai fi recalculate niciodata — graful ar minti pe viata.
  const { t, s, baseX, baseY, z } = lume()
  ensureArea(t, s, baseX + 8, baseY + 8, z, 2, R)

  // Un zid inalt taie o celula de vecinii ei: coloana devine ne-walkable.
  const zx = baseX + 8
  const zy = baseY + 8
  for (let h = 0; h < R.agentHeadroomM + 1; h++) {
    fill(t, zx, zy, z + h, Material.PIATRA_CONSTRUITA)
    markDirty(s, zx, zy, z + h, R)
  }
  rebuildDirty(t, s, R)

  assert.equal(isWalkable(t, zx, zy, z, R), false, 'zidul n-a schimbat nimic — fixtura e gresita')
  assert.equal(regionAt(s, zx, zy, z), NO_REGION, 'celula zidita e inca intr-o regiune')

  // Si graful de dupa trebuie sa fie identic cu unul construit de la zero pe
  // terenul modificat — adica memoizarea n-a lasat cioturi.
  const proaspat = createRegions()
  ensureArea(t, proaspat, baseX + 8, baseY + 8, z, 2, R)
  assert.equal(componentCount(s), componentCount(proaspat))
})

test('ORACOL: graful e COMPLET fata de teren, nu doar consistent cu el insusi', () => {
  // Testul de mai sus compara doua magazine construite in ordini diferite. O
  // mutatie care le strica pe amandoua la fel ii e invizibila — si chiar asa s-a
  // intamplat: scotand `ensureBlock` din bucla de vecini a lui `linkBlock`, toate
  // cele trei teste de memoizare au ramas verzi. Un test care compara codul cu el
  // insusi nu e un oracol.
  //
  // Asta e: pentru fiecare pereche de celule intre care terenul spune ca se poate
  // pasi, graful TREBUIE sa le puna in aceeasi componenta. Sursa adevarului e
  // `canStep`, nu o a doua rulare a aceluiasi cod.
  const { t, s, baseX, baseY, z } = lume()
  ensureArea(t, s, baseX + 8, baseY + 8, z, 2, R)

  const step = Math.max(0, Math.min(4, R.maxStepM))
  let perechi = 0
  for (const key of [...s.keys].sort((a, b) => a - b)) {
    const cells = s.cells.get(key)!
    const { bx, by, z: bz } = decodeBlockKey(key)
    for (let i = 0; i < BLOCK_CELLS; i++) {
      const mine = cells[i]!
      if (mine === NO_REGION) continue
      const wx = bx * REGION_SIZE + (i % REGION_SIZE)
      const wy = by * REGION_SIZE + Math.floor(i / REGION_SIZE)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (let dz = -step; dz <= step; dz++) {
          const nz = bz + dz
          const other = regionAt(s, wx + dx, wy + dy, nz)
          if (other === NO_REGION) continue
          if (!canStep(t, wx, wy, bz, wx + dx, wy + dy, nz, R)) continue
          perechi++
          assert.equal(find(s, mine), find(s, other),
            `pas posibil intre (${wx},${wy},${bz}) si (${wx + dx},${wy + dy},${nz}), dar componente diferite`)
        }
      }
    }
  }
  assert.ok(perechi > 1000, `doar ${perechi} perechi verificate — fixtura e prea saraca ca sa dovedeasca ceva`)
})

test('ORACOL: legarea isi creeaza blocurile vecine de care are nevoie', () => {
  // Mutatia care a trecut neobservata: `linkBlock` nu mai chema `ensureBlock` pe
  // vecin. In interiorul razei nu se vede nimic, fiindca `ensureArea` creeaza ea
  // insasi toate blocurile. Se vede numai la MARGINE — unde acoperirea inceteaza
  // sa fie „necunoscut" si devine „calculat", ceea ce schimba raspunsul lui
  // `areConnected` de la „nu" la un raspuns adevarat.
  const { t, s, baseX, baseY, z } = lume()
  const raza = 1
  ensureArea(t, s, baseX + 8, baseY + 8, z, raza, R)

  const centru = blockOfCell(baseX + 8, baseY + 8)
  // Coloana imediat in afara razei cerute, pe latura +x.
  const dincolo = (centru.bx + raza + 1) * REGION_SIZE
  let gasit = false
  for (let ly = 0; ly < REGION_SIZE && !gasit; ly++) {
    const wy = (centru.by - raza) * REGION_SIZE + ly
    for (let dz = -2; dz <= 2 && !gasit; dz++) {
      if (regionAt(s, dincolo, wy, z + dz) !== NO_REGION) gasit = true
    }
  }
  assert.ok(gasit, 'niciun bloc dincolo de raza n-a fost creat de legare')
})
