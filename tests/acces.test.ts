/**
 * Accesul vertical — S20-23, taietura 5. Modulul PUR (`src/sim/acces.ts`).
 *
 * Aici se probeaza definitiile pe care stau scanerul, previzualizarea si regula de
 * sigilare: citirea pe coloana egala cu `materialFast`, graful stabil egal cu
 * „calcabil in W ∪ Z si in F" masurat pe doua lumi REALE, pragurile la granita,
 * eticheta ca proprietate a componentei, si teorema de monotonie pe care sta totul.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cititor,
  componenta,
  esteSiguraPur,
  FelLucru,
  materialCitit,
  niveluriDeLucru,
  nodStabil,
  nodW,
  vecinatate,
} from '../src/sim/acces.ts'
import type { LumeAcces } from '../src/sim/acces.ts'
import { DEFAULT_RULES, parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { isWalkable, materialFast } from '../src/sim/regions.ts'
import { cellKey } from '../src/sim/path.ts'
import { dig, fill, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { CHUNK_CELLS, Material } from '../src/sim/terrain/chunk.ts'
import { createWorld } from '../src/sim/world.ts'
import { R, sitPlat } from './fixturi.ts'

/** Reguli cu pragurile de acces schimbate — restul, implicit. */
function cuPraguri(natural: number, total: number): Rules {
  const out = parseRules({ ...DEFAULT_RULES, accesPlafonNatural: natural, accesPlafonTotal: total })
  assert.ok(out.ok, JSON.stringify(out))
  return out.ok ? out.value : DEFAULT_RULES
}

/** Zid inchis de `L`×`L` (inelul), inalt de `h`, de la (x0, y0), direct in teren (fara reguli). */
function inel(t: Parameters<typeof fill>[0], x0: number, y0: number, g: number, L: number, h: number): void {
  for (let z = g + 1; z <= g + h; z++) {
    for (let dx = 0; dx < L; dx++) {
      for (let dy = 0; dy < L; dy++) {
        if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
        assert.ok(fill(t, x0 + dx, y0 + dy, z, Material.PIATRA_CONSTRUITA).ok)
      }
    }
  }
}

test('citirea pe coloana spune EXACT ce spune materialFast: promovat, nepromovat, margine de chunk, afara din lume', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  // Un chunk promovat (sapatura) si vecinii lui nepromovati, plus coloane de pe granita.
  assert.ok(dig(w.terrain, wx + 3, wy + 3, g).ok)
  const r = cititor(w.terrain)
  const coloane: [number, number][] = []
  for (let k = -40; k <= 40; k += 7) coloane.push([wx + k, wy + k * 2])
  const cx0 = Math.floor(wx / CHUNK_CELLS) * CHUNK_CELLS
  for (const dx of [-1, 0, CHUNK_CELLS - 1, CHUNK_CELLS]) coloane.push([cx0 + dx, wy])
  coloane.push([-1, 5], [5, -1], [WORLD_CELLS, 3], [3, WORLD_CELLS])
  let citite = 0
  for (const [x, y] of coloane) {
    for (let z = g - 90; z <= g + 90; z++) {
      assert.equal(materialCitit(r, x, y, z), materialFast(w.terrain, x, y, z), `(${x},${y},${z})`)
      citite++
    }
  }
  assert.ok(citite > 3000, `fixtura: prea putine citiri (${citite})`)
})

test('graful STABIL e exact „calcabil in W ∪ Z si in F", masurat pe doua lumi reale', () => {
  // Trei lumi cu acelasi seed: W (neatinsa), A = W ∪ Z (Z zidit), B = W ∪ C (tot planul
  // zidit). Stabila pe W, cu planul si ipoteza date, trebuie sa fie isWalkable(A) && isWalkable(B).
  const s = sitPlat(12345, 13)
  const A = createWorld(12345)
  const B = createWorld(12345)
  const { wx, wy, g } = s
  const C: number[] = []
  // Camera 5x5 cu usa, pereti de 2, placa la g+3, o treapta.
  for (let z = g + 1; z <= g + 2; z++) {
    for (let dx = 0; dx < 5; dx++) {
      for (let dy = 0; dy < 5; dy++) {
        if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
        if (dx === 2 && dy === 0) continue
        C.push(cellKey(wx + 3 + dx, wy + 3 + dy, z))
      }
    }
  }
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) C.push(cellKey(wx + 3 + dx, wy + 3 + dy, g + 3))
  C.push(cellKey(wx + 1, wy + 5, g + 1))
  // Z: o jumatate din plan, deterministic.
  const Z = C.filter((_, i) => i % 2 === 0)
  const dec = (k: number): [number, number, number] => {
    const x = k % WORLD_CELLS
    const rest = (k - x) / WORLD_CELLS
    const y = rest % WORLD_CELLS
    return [x, y, (rest - y) / WORLD_CELLS - 512]
  }
  for (const k of Z) { const [x, y, z] = dec(k); assert.ok(fill(A.terrain, x, y, z, Material.PIATRA_CONSTRUITA).ok) }
  for (const k of C) { const [x, y, z] = dec(k); assert.ok(fill(B.terrain, x, y, z, Material.PIATRA_CONSTRUITA).ok) }
  const l: LumeAcces = { t: s.w.terrain, plan: new Set(C), zidite: new Set(Z) }
  const nod = nodStabil(l, R)
  let stabile = 0
  let diferite = 0
  for (let x = wx - 1; x <= wx + 10; x++) {
    for (let y = wy - 1; y <= wy + 10; y++) {
      for (let z = g - 1; z <= g + 6; z++) {
        const asteptat = isWalkable(A.terrain, x, y, z, R) && isWalkable(B.terrain, x, y, z, R)
        const primit = nod.calcabila(x, y, z)
        if (asteptat !== primit) diferite++
        if (primit) stabile++
      }
    }
  }
  assert.equal(diferite, 0)
  // Fixtura VIE: exista si celule stabile, si celule calcabile in W dar nu in F (santiere).
  assert.ok(stabile > 50, `fixtura: doar ${stabile} celule stabile`)
  assert.ok(isWalkable(s.w.terrain, wx + 3, wy + 4, g + 1, R) && !nod.calcabila(wx + 3, wy + 4, g + 1), 'fixtura: celula de santier trebuia sa fie calcabila in W si nestabila')
  // Graful W cu `extra` e isWalkable pe W ∪ extra.
  const nodB = nodW(s.w.terrain, new Set(C), R)
  for (let x = wx - 1; x <= wx + 10; x++) {
    for (let y = wy - 1; y <= wy + 10; y++) {
      for (let z = g - 1; z <= g + 6; z++) assert.equal(nodB.calcabila(x, y, z), isWalkable(B.terrain, x, y, z, R), `W ∪ C la (${x},${y},${z})`)
    }
  }
})

test('podeaua NATURALA: roca, pamant, iarba si moloz da; piatra zidita, grinda si piesele ipotetice nu', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  assert.ok(fill(w.terrain, wx + 2, wy + 2, g + 1, Material.PIATRA_CONSTRUITA).ok)
  assert.ok(fill(w.terrain, wx + 3, wy + 2, g + 1, Material.GRINDA).ok)
  assert.ok(fill(w.terrain, wx + 4, wy + 2, g + 1, Material.MOLOZ).ok)
  const Z = new Set([cellKey(wx + 5, wy + 2, g + 1)])
  const nod = nodStabil({ t: w.terrain, plan: Z, zidite: Z }, R)
  assert.equal(nod.naturala(wx + 1, wy + 2, g + 1), true, 'solul sitului')
  assert.equal(nod.naturala(wx + 2, wy + 2, g + 2), false, 'pe piatra zidita')
  assert.equal(nod.naturala(wx + 3, wy + 2, g + 2), false, 'pe grinda')
  assert.equal(nod.naturala(wx + 4, wy + 2, g + 2), true, 'pe moloz')
  assert.equal(nod.naturala(wx + 5, wy + 2, g + 2), false, 'pe o piesa zidita IPOTETIC')
})

test('pragul NATURAL la granita: o incinta cu N celule naturale e deschisa la prag N, punga la N+1', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  inel(w.terrain, wx + 2, wy + 2, g, 6, 2) // interior 4x4 = 16 celule naturale
  const l: LumeAcces = { t: w.terrain, plan: new Set(), zidite: null }
  const deLa = (rules: Rules): ReturnType<typeof componenta> => componenta(nodStabil(l, rules), rules, wx + 4, wy + 4, g + 1)
  const la16 = deLa(cuPraguri(16, 16384))
  assert.equal(la16.deschisa, true)
  assert.equal(la16.naturale, 16)
  const la17 = deLa(cuPraguri(17, 16384))
  assert.equal(la17.deschisa, false, 'o incinta cu 16 celule naturale nu poate fi deschisa la pragul 17')
  assert.equal(la17.total, 16)
  // Si ca o punga reala la pragurile livrate: creasta si interiorul, pe rand.
  assert.equal(deLa(R).deschisa, false)
})

test('pragul TOTAL la granita: un acoperis fara scara de T celule e deschis la plafonul T−1, punga la T', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  inel(w.terrain, wx + 2, wy + 2, g, 6, 2)
  for (let dx = 0; dx < 6; dx++) for (let dy = 0; dy < 6; dy++) assert.ok(fill(w.terrain, wx + 2 + dx, wy + 2 + dy, g + 3, Material.PIATRA_CONSTRUITA).ok)
  const l: LumeAcces = { t: w.terrain, plan: new Set(), zidite: null }
  const deLa = (rules: Rules): ReturnType<typeof componenta> => componenta(nodStabil(l, rules), rules, wx + 4, wy + 4, g + 4)
  const la35 = deLa(cuPraguri(1, 35))
  assert.equal(la35.deschisa, true, 'peste plafon: deschis')
  assert.equal(la35.naturale, 0, 'fixtura: un acoperis n-are nicio podea naturala')
  const la36 = deLa(cuPraguri(1, 36))
  assert.equal(la36.deschisa, false)
  assert.equal(la36.total, 36)
})

test('eticheta e a COMPONENTEI: din orice celula a ei, acelasi raspuns', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  inel(w.terrain, wx + 2, wy + 2, g, 6, 2)
  const l: LumeAcces = { t: w.terrain, plan: new Set(), zidite: null }
  const nod = nodStabil(l, R)
  // Punga: toate cele 16 celule dau „inchisa", cu aceeasi marime.
  for (let dx = 1; dx <= 4; dx++) {
    for (let dy = 1; dy <= 4; dy++) {
      const c = componenta(nod, R, wx + 2 + dx, wy + 2 + dy, g + 1)
      assert.equal(c.deschisa, false)
      assert.equal(c.total, 16)
    }
  }
  // Afara: din orice celula de langa zid, deschis.
  for (const [x, y] of [[wx + 1, wy + 4], [wx + 8, wy + 4], [wx + 4, wy + 1], [wx + 4, wy + 8]] as const) {
    assert.equal(componenta(nod, R, x, y, g + 1).deschisa, true, `(${x},${y})`)
  }
})

test('TEOREMA: zidind piese din plan, multimea stabila doar creste si o componenta deschisa nu se mai inchide', () => {
  // Pe o casa cu doua etaje, scara interioara, usa; Z creste piesa cu piesa intr-o ordine
  // pseudo-aleatoare fixa (fara sprijin — teorema e despre multimi, nu despre ordinea buna).
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const C: number[] = []
  const x0 = wx + 3, y0 = wy + 3
  for (let z = g + 1; z <= g + 2; z++) {
    for (let dx = 0; dx < 6; dx++) {
      for (let dy = 0; dy < 6; dy++) {
        if (dx !== 0 && dx !== 5 && dy !== 0 && dy !== 5) continue
        if (dx === 2 && dy === 0) continue
        C.push(cellKey(x0 + dx, y0 + dy, z))
      }
    }
  }
  C.push(cellKey(x0 + 1, y0 + 2, g + 1), cellKey(x0 + 1, y0 + 3, g + 1), cellKey(x0 + 1, y0 + 3, g + 2))
  for (let dx = 0; dx < 6; dx++) {
    for (let dy = 0; dy < 6; dy++) {
      if (dx === 1 && (dy === 2 || dy === 3)) continue
      C.push(cellKey(x0 + dx, y0 + dy, g + 3))
    }
  }
  for (let dx = 0; dx < 6; dx++) for (let dy = 0; dy < 6; dy++) if (dx === 0 || dx === 5 || dy === 0 || dy === 5) C.push(cellKey(x0 + dx, y0 + dy, g + 4))
  const plan = new Set(C)
  let s = 12345
  const ordine = C.slice()
  for (let i = ordine.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0
    const j = s % (i + 1)
    const tmp = ordine[i]!; ordine[i] = ordine[j]!; ordine[j] = tmp
  }
  const cutie: [number, number, number][] = []
  for (let x = x0 - 2; x <= x0 + 7; x++) for (let y = y0 - 2; y <= y0 + 7; y++) for (let z = g; z <= g + 6; z++) cutie.push([x, y, z])

  /** Pentru fiecare celula stabila din cutie: deschisa sau nu (etichetare pe componenta). */
  const eticheteaza = (Z: Set<number>): Map<number, boolean> => {
    const l: LumeAcces = { t: w.terrain, plan, zidite: Z }
    const nod = nodStabil(l, R)
    const et = new Map<number, boolean>()
    for (const [x, y, z] of cutie) {
      const k = cellKey(x, y, z)
      if (et.has(k) || !nod.calcabila(x, y, z)) continue
      const c = componenta(nod, R, x, y, z)
      // O componenta deschisa e dovedita doar pe ce a vizitat; restul cutiei se intreaba singur.
      for (const v of c.celule) et.set(v, c.deschisa)
    }
    for (const k of [...et.keys()]) {
      const x = k % WORLD_CELLS
      const rest = (k - x) / WORLD_CELLS
      const y = rest % WORLD_CELLS
      const z = (rest - y) / WORLD_CELLS - 512
      if (x < x0 - 2 || x > x0 + 7 || y < y0 - 2 || y > y0 + 7 || z < g || z > g + 6) et.delete(k)
    }
    return et
  }
  const Z = new Set<number>()
  let inainte = eticheteaza(Z)
  let pierdute = 0
  let inchise = 0
  let crescut = 0
  let deschiseInainte = 0
  for (const k of ordine) {
    Z.add(k)
    const dupa = eticheteaza(Z)
    for (const [c, deschisa] of inainte) {
      if (!dupa.has(c)) { pierdute++; continue }
      if (deschisa && dupa.get(c) === false) inchise++
      if (deschisa) deschiseInainte++
    }
    if (dupa.size > inainte.size) crescut++
    inainte = dupa
  }
  assert.equal(pierdute, 0, 'o celula stabila a disparut cand s-a zidit o piesa din plan')
  assert.equal(inchise, 0, 'o componenta deschisa s-a inchis cand s-a zidit o piesa din plan')
  // Fixtura VIE: multimea chiar a crescut (varfurile peretilor, placa), si au fost deschise de urmarit.
  assert.ok(crescut > 20, `fixtura: multimea stabila a crescut doar de ${crescut} ori`)
  assert.ok(deschiseInainte > 1000, `fixtura: doar ${deschiseInainte} observatii deschise`)
})

test('siguranta pura: pe sol afara da, pe creasta unui zid fara scara nu, pe o celula de santier nu', () => {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  inel(w.terrain, wx + 2, wy + 2, g, 6, 2)
  const C = new Set([cellKey(wx + 9, wy + 4, g + 1)])
  const l: LumeAcces = { t: w.terrain, plan: C, zidite: null }
  assert.equal(esteSiguraPur(l, R, wx + 1, wy + 4, g + 1), true)
  assert.equal(esteSiguraPur(l, R, wx + 2, wy + 4, g + 3), false, 'creasta: 20 de celule, nicio podea naturala')
  assert.equal(esteSiguraPur(l, R, wx + 4, wy + 4, g + 1), false, 'interiorul camerei fara usa')
  assert.equal(esteSiguraPur(l, R, wx + 9, wy + 4, g + 1), false, 'celula unui santier nu e stabila')
  // Un bloc de 1 m langa sol: celula de pe el e sigura PRIN PAS — legata de sol cu dz = −1.
  assert.ok(fill(w.terrain, wx + 10, wy + 8, g + 1, Material.PIATRA_CONSTRUITA).ok)
  assert.equal(esteSiguraPur(l, R, wx + 10, wy + 8, g + 2), true, 'o treapta de 1 m e legata de sol prin pas')
})

test('nivelurile si vecinatatea locului de lucru, dupa fel', () => {
  assert.deepEqual(niveluriDeLucru(FelLucru.CONSTRUIESTE, R), [0, 1, -1, -2])
  assert.deepEqual(niveluriDeLucru(FelLucru.DECONSTRUIESTE, R), [0, 1, -1, -2])
  assert.deepEqual(niveluriDeLucru(FelLucru.SAPA, R), [0, 1, -1])
  assert.deepEqual(niveluriDeLucru(FelLucru.DOARME, R), [0, 1, -1])
  assert.equal(vecinatate(FelLucru.CONSTRUIESTE).length, 8)
  assert.equal(vecinatate(FelLucru.DECONSTRUIESTE).length, 8)
  assert.equal(vecinatate(FelLucru.SAPA).length, 4)
  assert.equal(vecinatate(FelLucru.DOARME).length, 4)
  // Ortogonalele INTAI: acelasi loc de lucru ca pana acum, cand exista unul ortogonal.
  assert.deepEqual(vecinatate(FelLucru.CONSTRUIESTE).slice(0, 4), vecinatate(FelLucru.SAPA))
  // Cu pas 2 si atingere 2: sus 2, jos 2, alternat.
  const r2 = parseRules({ ...DEFAULT_RULES, maxStepM: 2, agentHeadroomM: 3, atingereSusM: 3 })
  assert.ok(r2.ok)
  if (r2.ok) {
    assert.deepEqual(niveluriDeLucru(FelLucru.CONSTRUIESTE, r2.value), [0, 1, -1, 2, -2, -3])
    assert.deepEqual(niveluriDeLucru(FelLucru.SAPA, r2.value), [0, 1, -1, 2, -2])
  }
})
