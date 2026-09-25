/**
 * Grinda — S20-23, taietura 4.
 *
 * Designul a trecut printr-un panou care masoara (3 lentile, 24 de constatari, doua
 * CRITIC confirmate de cate doi verificatori): `scratchpad/design-grinda-v2.md` in
 * sesiunea din 26.09. Fisierul asta creste odata cu felia: intai indexul DERIVED al
 * grinzilor (regula de stabilitate inca neschimbata), apoi regula.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { chunkKey, listaGrinzi, materialAt, reconstruiesteGrinzi } from '../src/sim/terrain/terrain.ts'
import type { World } from '../src/sim/state.ts'
import { Piesa } from '../src/sim/state.ts'
import { Item } from '../src/sim/state.ts'
import { laSit, lasaItem, panaCand, patratPlat, R, solid } from './fixturi.ts'

/** Un patrat plat de `latura` langa un sit, pe prima samanta care il are. */
function scena(latura: number): { w: World; x0: number; y0: number; g: number } {
  for (const seed of [12345, 7, 12, 17, 18, 19, 23]) {
    const { w, sit } = laSit(seed, 0)
    const T = patratPlat(w, sit, latura, 2, 40)
    if (T) return { w, x0: T.x0, y0: T.y0, g: T.g }
  }
  assert.fail(`fixtura: niciun patrat plat de ${latura}`)
}

/**
 * Indexul lumii ESTE cel reconstruit din voxeli: aceeasi lista si aceeasi forma a
 * Map-ului. `size` conteaza separat de lista — o lista ramasa goala dupa ultima
 * grinda sapata ar fi invizibila in lista, dar ar face indexul continuu diferit de
 * cel reconstruit.
 */
function indexulEReconstruit(w: World, unde: string): void {
  const out = decode(encode(w), R)
  assert.ok(out.ok, `${unde}: decode a refuzat propriul encode`)
  if (!out.ok) return
  assert.deepEqual(listaGrinzi(w.terrain.grinzi), listaGrinzi(out.value.terrain.grinzi), `${unde}: indexul continuu difera de cel reconstruit la incarcare`)
  assert.equal(w.terrain.grinzi.size, out.value.terrain.grinzi.size, `${unde}: forma indexului difera (o lista goala ramasa?)`)
  assert.equal(hashWorld(out.value), hashWorld(w), `${unde}: roundtrip-ul schimba lumea`)
}

test('indexul de grinzi e DERIVED: tinut la zi la zidire, la sapat si la prabusire, egal cu cel reconstruit la incarcare', () => {
  const { w, x0, y0, g } = scena(8)
  // Grinzi ASEZATE pe sol, pe doua randuri, cu o grinda pe cota a doua peste prima.
  for (let dx = 0; dx < 6; dx++) {
    for (const dy of [0, 3]) {
      assert.ok(applyCommand(w, { kind: 'fill', wx: x0 + dx, wy: y0 + dy, z: g + 1, material: Material.GRINDA }, R).ok, `fixtura: grinda la ${dx},${dy}`)
    }
  }
  assert.ok(applyCommand(w, { kind: 'fill', wx: x0, wy: y0, z: g + 2, material: Material.GRINDA }, R).ok)
  assert.equal(listaGrinzi(w.terrain.grinzi).length, 13, 'indexul trebuie sa vada fiecare grinda zidita')
  indexulEReconstruit(w, 'dupa zidire')

  // Sapat direct: grinda iese din index.
  assert.ok(applyCommand(w, { kind: 'dig', wx: x0 + 5, wy: y0 + 3, z: g + 1 }, R).ok)
  assert.equal(listaGrinzi(w.terrain.grinzi).length, 12)
  indexulEReconstruit(w, 'dupa sapat')

  // Prabusire: sapat sub grinda de la (x0, y0, g+1) — cea de deasupra ei (g+2)
  // ramane fara ancora si cade; molozul se aseaza, grinda moare din index pe calea
  // prabusirii, nu pe a comenzii.
  const inainte = listaGrinzi(w.terrain.grinzi).length
  assert.ok(applyCommand(w, { kind: 'dig', wx: x0, wy: y0, z: g + 1 }, R).ok)
  const m = materialAt(w.terrain, x0, y0, g + 2)
  assert.ok(m.ok && m.value !== Material.GRINDA, 'fixtura: grinda de pe cota a doua trebuia sa cada')
  assert.ok(listaGrinzi(w.terrain.grinzi).length <= inainte - 2, 'grinzile sapate si cazute trebuiau scoase din index')
  indexulEReconstruit(w, 'dupa prabusire')

  // Ultima grinda dintr-un chunk: lista lui se sterge, nu ramane goala.
  const ramase = listaGrinzi(w.terrain.grinzi)
  for (const s of ramase) {
    const [x, y, z] = s.split(',').map(Number) as [number, number, number]
    assert.ok(applyCommand(w, { kind: 'dig', wx: x, wy: y, z }, R).ok)
  }
  assert.equal(w.terrain.grinzi.size, 0, 'dupa ultima grinda sapata indexul trebuie sa fie gol, nu plin de liste goale')
  assert.equal(w.terrain.grinzi.get(chunkKey(Math.floor(x0 / 32), Math.floor(y0 / 32))), undefined)
  indexulEReconstruit(w, 'dupa ultima grinda')
})

test('un pion zideste o GRINDA prin job, din piatra, iar indexul o vede — si o vede si lumea incarcata', () => {
  const { w, x0, y0, g } = scena(8)
  const pusa = applyCommand(w, { kind: 'desemneaza', wx: x0 + 5, wy: y0 + 2, z: g + 1, piesa: Piesa.GRINDA }, R)
  assert.ok(pusa.ok, `desemnarea GRINDA refuzata: ${JSON.stringify(pusa)}`)
  lasaItem(w, Item.PIATRA, R.piese[Piesa.GRINDA]!.cantitate, x0 + 1, y0 + 2)
  const gp = solid(w, x0 + 2, y0 + 2)
  assert.notEqual(gp, null)
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (x0 + 2) * 1000 + 500, y: (y0 + 2) * 1000 + 500, z: gp! + 1, faction: 0 }, R).ok)
  let verificari = 0
  const n = panaCand(w, 3000, (w) => {
    if (w.tick % 50 === 0) { indexulEReconstruit(w, `tickul ${w.tick}`); verificari++ }
    const m = materialAt(w.terrain, x0 + 5, y0 + 2, g + 1)
    return m.ok && m.value === Material.GRINDA
  })
  assert.ok(n >= 0, 'grinda nu s-a zidit in 3000 de tickuri')
  assert.ok(verificari > 0)
  assert.deepEqual(listaGrinzi(w.terrain.grinzi), [`${x0 + 5},${y0 + 2},${g + 1}`])
  indexulEReconstruit(w, 'dupa zidirea prin job')
})

test('reconstructia din voxeli e aceeasi functie pe care o foloseste decode: pe lumea continua, nu schimba nimic', () => {
  const { w, x0, y0, g } = scena(6)
  for (let dx = 0; dx < 4; dx++) assert.ok(applyCommand(w, { kind: 'fill', wx: x0 + dx, wy: y0, z: g + 1, material: Material.GRINDA }, R).ok)
  const inainte = listaGrinzi(w.terrain.grinzi)
  const size = w.terrain.grinzi.size
  reconstruiesteGrinzi(w.terrain)
  assert.deepEqual(listaGrinzi(w.terrain.grinzi), inainte)
  assert.equal(w.terrain.grinzi.size, size)
})
