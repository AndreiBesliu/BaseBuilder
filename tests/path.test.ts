import test from 'node:test'
import assert from 'node:assert/strict'
import { cellKey, Coada, findPath, pathLength } from '../src/sim/path.ts'
import type { Ocupare, Path } from '../src/sim/path.ts'
import { canStep, createRegions, ensureArea, isWalkable } from '../src/sim/regions.ts'
import type { RegionStore } from '../src/sim/regions.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { Reason } from '../src/sim/result.ts'
import { createTerrain, fill, groundLevelM, setFocus } from '../src/sim/terrain/terrain.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { Material } from '../src/sim/terrain/chunk.ts'

const R = DEFAULT_RULES
const SEED = 777
// Acelasi chunk uscat ca in testele de regiuni, ales programatic, nu la intamplare.
const CX = 200
const CY = 212

function lume(razaBlocuri = 2): { t: Terrain; s: RegionStore; bx: number; by: number } {
  const t = createTerrain(SEED, 4)
  setFocus(t, CX, CY)
  const s = createRegions()
  const bx = CX * 32
  const by = CY * 32
  const g = groundLevelM(t, bx + 8, by + 8)
  assert.ok(g.ok)
  ensureArea(t, s, bx + 8, by + 8, g.value + 1, razaBlocuri, R)
  return { t, s, bx, by }
}

function pe(t: Terrain, wx: number, wy: number): { wx: number; wy: number; z: number } {
  const g = groundLevelM(t, wx, wy)
  assert.ok(g.ok)
  for (let z = g.value + 2; z >= g.value - 4; z--) {
    if (isWalkable(t, wx, wy, z, R)) return { wx, wy, z }
  }
  throw new Error(`nicio celula de mers la ${wx},${wy}`)
}

/**
 * VERIFICATOR INDEPENDENT.
 *
 * Nu compara drumul cu ce a produs codul — verifica proprietatile pe care un drum
 * TREBUIE sa le aiba, folosind `canStep`, adica regula de mers, nu cautarea.
 * Un test care doar re-ruleaza cautarea si compara rezultatele cu ea insasi trece
 * la fel de bine si cand cautarea e gresita.
 */
function verificaDrum(t: Terrain, p: Path, from: { wx: number; wy: number; z: number }, to: { wx: number; wy: number; z: number }): void {
  const n = pathLength(p)
  assert.ok(n >= 1, 'drum gol')

  assert.deepEqual([p.cells[0], p.cells[1], p.cells[2]], [from.wx, from.wy, from.z], 'nu porneste de unde s-a cerut')
  assert.deepEqual(
    [p.cells[(n - 1) * 3], p.cells[(n - 1) * 3 + 1], p.cells[(n - 1) * 3 + 2]],
    [to.wx, to.wy, to.z],
    'nu ajunge unde s-a cerut',
  )

  const vazute = new Set<number>()
  for (let i = 0; i < n; i++) {
    const x = p.cells[i * 3]!
    const y = p.cells[i * 3 + 1]!
    const z = p.cells[i * 3 + 2]!
    assert.ok(isWalkable(t, x, y, z, R), `celula ${i} (${x},${y},${z}) nu e walkable`)
    const k = cellKey(x, y, z)
    assert.ok(!vazute.has(k), `drumul trece de doua ori prin (${x},${y},${z})`)
    vazute.add(k)

    if (i === 0) continue
    const px = p.cells[(i - 1) * 3]!
    const py = p.cells[(i - 1) * 3 + 1]!
    const pz = p.cells[(i - 1) * 3 + 2]!
    assert.ok(
      canStep(t, px, py, pz, x, y, z, R),
      `pasul ${i - 1}→${i}, (${px},${py},${pz})→(${x},${y},${z}), nu e un pas legal`,
    )
  }
}

// --- drumuri care exista -----------------------------------------------------

test('un drum pe teren deschis exista, si fiecare pas al lui e legal', () => {
  const { t, s, bx, by } = lume()
  const a = pe(t, bx + 6, by + 6)
  const b = pe(t, bx + 22, by + 20)

  const out = findPath(t, s, R, a, b)
  assert.ok(out.ok, out.ok ? '' : `refuzat: ${out.reason}`)
  if (!out.ok) return
  verificaDrum(t, out.value, a, b)

  // Nu poate fi mai scurt decat distanta Manhattan: e o limita inferioara
  // independenta de algoritm.
  const minim = Math.abs(a.wx - b.wx) + Math.abs(a.wy - b.wy) + 1
  assert.ok(pathLength(out.value) >= minim, `drum de ${pathLength(out.value)} sub minimul ${minim}`)
})

test('acelasi drum, de doua ori, e IDENTIC bit cu bit', () => {
  // Fara asta, hash-ul de stare devine nedeterminist de indata ce un agent merge.
  // Departajarea din coada de prioritati exista exact pentru testul asta.
  const { t, s, bx, by } = lume()
  const a = pe(t, bx + 4, by + 10)
  const b = pe(t, bx + 26, by + 18)
  const p1 = findPath(t, s, R, a, b)
  const p2 = findPath(t, s, R, a, b)
  assert.ok(p1.ok && p2.ok)
  if (!p1.ok || !p2.ok) return
  assert.deepEqual([...p1.value.cells], [...p2.value.cells])
  assert.equal(p1.value.cost, p2.value.cost)
  assert.equal(p1.value.explorate, p2.value.explorate)
})

test('coada da aceeasi iesire indiferent de ORDINEA DE INSERARE', () => {
  // Testul asta exista fiindca mutatia a aratat ca cel de „acelasi drum de doua
  // ori" trece si cu departajarea SCOASA: intr-un singur proces, un heap fara
  // departajare e oricum determinist. Deci aia nu dovedea ce credeam.
  //
  // Ce dovedeste ceva: aceleasi perechi, doua ordini de inserare, aceeasi iesire.
  const perechi: Array<[number, number]> = [
    [100, 7], [100, 3], [50, 9], [100, 1], [50, 2], [200, 5], [50, 8], [100, 4],
  ]

  const scoate = (ordine: Array<[number, number]>): number[] => {
    const c = new Coada()
    for (const [f, k] of ordine) c.push(f, k)
    const out: number[] = []
    while (c.size > 0) out.push(c.pop())
    return out
  }

  const directa = scoate(perechi)
  const inversa = scoate([...perechi].reverse())
  const amestecata = scoate([...perechi].sort((a, b) => a[1] - b[1]))

  assert.deepEqual(inversa, directa, 'ordinea de inserare a schimbat iesirea')
  assert.deepEqual(amestecata, directa, 'ordinea de inserare a schimbat iesirea')
  // Si iesirea trebuie sa fie chiar sortata dupa (f, cheie).
  assert.deepEqual(directa, [2, 8, 9, 1, 3, 4, 7, 5])
})

// --- drumuri care NU exista --------------------------------------------------

test('capatul dintr-un bloc necalculat se refuza, nu se cauta', () => {
  const { t, s, bx, by } = lume(0)
  const a = pe(t, bx + 8, by + 8)
  const out = findPath(t, s, R, a, { wx: bx + 4000, wy: by + 8, z: a.z })
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.reason, Reason.INACCESIBIL)
})

test('doua componente diferite se resping FARA cautare pe celule', () => {
  // Asta e apararea centrala: „nu exista drum" trebuie sa coste O(1), nu o
  // parcurgere a hartii. Se verifica pe MOTIV, care spune ce strat a raspuns.
  const { t, bx, by } = lume()
  const a = pe(t, bx + 8, by + 8)

  // Zid inalt care inchide complet o celula.
  const tx = bx + 16
  const ty = by + 16
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const g = groundLevelM(t, tx + dx, ty + dy)
    assert.ok(g.ok)
    for (let h = 1; h <= 4; h++) fill(t, tx + dx, ty + dy, g.value + h, Material.PIATRA_CONSTRUITA)
  }
  const s2 = createRegions()
  const tinta = pe(t, tx, ty)
  ensureArea(t, s2, bx + 8, by + 8, a.z, 2, R)
  ensureArea(t, s2, tx, ty, tinta.z, 1, R)

  const out = findPath(t, s2, R, a, tinta)
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.INACCESIBIL)
    assert.equal(out.params.motiv, 'componente diferite', 'a raspuns alt strat decat cel de regiuni')
  }
})

// --- D7: ostilitatea ---------------------------------------------------------

test('D7c: un ostil care blocheaza singurul drum da OCUPAT_DE_OSTIL, nu INACCESIBIL', () => {
  // Distinctia e tot rostul lui D7c. „Inaccesibil" ii spune jucatorului ca a
  // construit gresit; „ocupat de ostil" ii spune ca are un raider in coridor.
  // Al doilea se poate rezolva, primul nu — si confuzia intre ele e chiar
  // deadlock-ul pe care D7 trebuia sa-l evite.
  const { t, bx, by } = lume()
  const a = pe(t, bx + 8, by + 8)

  // Zidul trebuie sa SIGILEZE, nu doar sa arate a zid. Prima versiune a testului
  // il facea lat de 32 de celule intr-o zona calculata de 64, iar drumul il ocolea
  // pe la capete — testul pica pe fixtura, nu pe cod. Acum acopera toata zona.
  const zidY = by + 12
  const poartaX = bx + 8
  for (let x = bx - 40; x < bx + 72; x++) {
    if (x === poartaX) continue
    const g = groundLevelM(t, x, zidY)
    if (!g.ok) continue
    for (let h = 1; h <= 5; h++) fill(t, x, zidY, g.value + h, Material.PIATRA_CONSTRUITA)
  }

  const s2 = createRegions()
  const dincolo = pe(t, bx + 8, by + 18)
  ensureArea(t, s2, bx + 8, by + 8, a.z, 3, R)
  ensureArea(t, s2, dincolo.wx, dincolo.wy, dincolo.z, 3, R)

  const liber = findPath(t, s2, R, a, dincolo)
  assert.ok(liber.ok, 'fara ostili trebuia sa existe drum prin poarta')
  if (!liber.ok) return

  // DOVADA ca poarta e chiar singurul drum: drumul gasit trebuie sa treaca prin ea.
  let treceePrinPoarta = false
  for (let i = 0; i < pathLength(liber.value); i++) {
    if (liber.value.cells[i * 3] === poartaX && liber.value.cells[i * 3 + 1] === zidY) treceePrinPoarta = true
  }
  assert.ok(treceePrinPoarta, 'zidul nu sigileaza — drumul nu trece prin poarta, deci testul n-ar dovedi nimic')

  // Ostilul sta chiar in poarta. Se blocheaza toate nivelurile pe care s-ar putea sta.
  const ostile = new Set<number>()
  for (let dz = -4; dz <= 4; dz++) ostile.add(cellKey(poartaX, zidY, a.z + dz))
  const ocupare: Ocupare = { ostile, proprii: new Set() }

  const blocat = findPath(t, s2, R, a, dincolo, ocupare)
  assert.equal(blocat.ok, false, 'drumul inca trece prin ostil')
  if (!blocat.ok) {
    assert.equal(
      blocat.reason,
      Reason.OCUPAT_DE_OSTIL,
      `a raspuns ${blocat.reason} in loc de OCUPAT_DE_OSTIL — jucatorul ar crede ca a construit gresit`,
    )
  }
})

test('un agent PROPRIU nu blocheaza, doar scumpeste', () => {
  const { t, s, bx, by } = lume()
  const a = pe(t, bx + 6, by + 6)
  const b = pe(t, bx + 6, by + 14)

  const fara = findPath(t, s, R, a, b)
  assert.ok(fara.ok)
  if (!fara.ok) return

  // Se pun ai nostri pe TOATE celulele drumului gasit, mai putin capetele.
  const proprii = new Set<number>()
  const n = pathLength(fara.value)
  for (let i = 1; i < n - 1; i++) {
    proprii.add(cellKey(fara.value.cells[i * 3]!, fara.value.cells[i * 3 + 1]!, fara.value.cells[i * 3 + 2]!))
  }

  const cu = findPath(t, s, R, a, b, { ostile: new Set(), proprii })
  assert.ok(cu.ok, 'agentii proprii au blocat drumul — ar trebui doar sa-l scumpeasca')
  if (!cu.ok) return
  verificaDrum(t, cu.value, a, b)

  // Aserțiunea dinainte era `cost >= cost`, adevarata trivial cand penalizarea
  // lipseste — dovedit prin mutatie. Penalizarea trebuie sa SCHIMBE ceva:
  // ori drumul ocoleste, ori costa strict mai mult.
  const acelasiDrum =
    cu.value.cells.length === fara.value.cells.length &&
    [...cu.value.cells].every((v, i) => v === fara.value.cells[i])
  assert.ok(
    !acelasiDrum || cu.value.cost > fara.value.cost,
    'agentii proprii n-au schimbat nici drumul, nici costul — penalizarea nu se aplica',
  )
})

// --- bugetul -----------------------------------------------------------------

test('plafonul de noduri da BUGET_DEPASIT, nu INACCESIBIL', () => {
  // Confuzia dintre „prea scump acum" si „imposibil" e felul in care un pion se
  // blocheaza pe viata: cine primeste INACCESIBIL renunta definitiv.
  const { t, s, bx, by } = lume()
  const a = pe(t, bx + 4, by + 4)
  const b = pe(t, bx + 28, by + 28)
  const stramt = { ...R, maxPathNodes: 12 }

  const out = findPath(t, s, stramt, a, b)
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.BUGET_DEPASIT)
    assert.equal(out.params.strat, 'celule')
  }
})
