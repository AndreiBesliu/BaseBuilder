/**
 * Tinta click-ului in viewer (viewer/tinta.ts): coloana LUCRULUI VAZUT sub cursor.
 *
 * Razele sunt construite ca ale camerei de pornire a viewer-ului — elevatie 24,8°, din
 * directia (-x, +z) —, fiindca acolo a masurat recenzia paralaxa. Fiecare scena verifica si
 * ca raspunsul vechi (planul y = zActiv + 1) sau raspunsul „gresit" pe care il evita ar fi fost
 * ALTUL: altfel testul n-ar deosebi regula de defectul pe care il inlocuieste.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alegeColoana, capacAtins, celulaLangaFata, coloanaImpactului, cubAtins, intrareInCutie, MARGINE_CUB_J, primulVizibil, razaPlan,
} from '../viewer/tinta.ts'
import type { CelulaJ, Impact, IntrebareColoana, Raza, V3 } from '../viewer/tinta.ts'

const ELEVATIE = (24.8 * Math.PI) / 180
const DIST = Math.hypot(46, 46, 30)
const ZA = 47

/** Raza camerei de pornire care priveste EXACT punctul `tinta`. */
function razaSpre(tinta: V3, elevatie = ELEVATIE): Raza {
  const dh = DIST * Math.cos(elevatie)
  const o = { x: tinta.x - dh / Math.SQRT2, y: tinta.y + DIST * Math.sin(elevatie), z: tinta.z + dh / Math.SQRT2 }
  const d = { x: tinta.x - o.x, y: tinta.y - o.y, z: tinta.z - o.z }
  const l = Math.hypot(d.x, d.y, d.z)
  return { o, d: { x: d.x / l, y: d.y / l, z: d.z / l } }
}

/** Impactul razei pe un plan orizontal de teren la cota `y` (fata de sus a solului). */
function impactPePlan(r: Raza, y: number): Impact {
  const t = razaPlan(r, y)!
  return { t, p: { x: r.o.x + t * r.d.x, y, z: r.o.z + t * r.d.z }, n: { x: 0, y: 1, z: 0 } }
}

/** Ce dadea codul vechi: planul y = zActiv + 1. */
function coloanaVeche(r: Raza, zActiv: number): { wx: number; wy: number } {
  const t = razaPlan(r, zActiv + 1)!
  return { wx: Math.floor(r.o.x + t * r.d.x), wy: Math.floor(r.o.z + t * r.d.z) }
}

function intrebare(r: Raza, impacturi: Impact[], extra: Partial<IntrebareColoana> = {}): IntrebareColoana {
  return { raza: r, zActiv: ZA, impacturi, cuburi: [], departeMax: 150, desemnataPeNivel: () => false, plinaPeNivel: () => false, ...extra }
}

/** Celula cubului J prin al carui interior trece raza la cota `y` (fractiunea din x si z se verifica). */
function celulaPeRaza(r: Raza, y: number, z: number): CelulaJ {
  const t = razaPlan(r, y)!
  const x = r.o.x + t * r.d.x
  const w = r.o.z + t * r.d.z
  const m = MARGINE_CUB_J
  assert.ok(x - Math.floor(x) > m && x - Math.floor(x) < 1 - m && w - Math.floor(w) > m && w - Math.floor(w) < 1 - m, 'scena: raza trebuie sa treaca prin interiorul cubului desenat')
  return { wx: Math.floor(x), wy: Math.floor(w), z }
}

test('loc plat: piesa merge in coloana solului VAZUT, nu cu 1–2 celule spre departe', () => {
  // Solul are fata de sus la y = zActiv (nivelul activ e primul nivel de aer).
  for (const [wx, wy] of [[10, 20], [12, 18], [7, 23]] as const) {
    const r = razaSpre({ x: wx + 0.5, y: ZA, z: wy + 0.5 })
    const c = alegeColoana(intrebare(r, [impactPePlan(r, ZA)]))
    assert.deepEqual(c, { ok: true, wx, wy, sursa: 'teren' })
    assert.notDeepEqual(coloanaVeche(r, ZA), { wx, wy }, 'scena nu deosebeste regula noua de planul zActiv + 1')
  }
})

test('stiva: capacul unui cub J de sub nivelul activ da coloana cubului, nu a solului din spatele lui', () => {
  // Randul 1 e desemnat (nezidit) la zActiv - 1; solul e la zActiv - 2, cu fata de sus la zActiv - 1.
  const cub: CelulaJ = { wx: 10, wy: 20, z: ZA - 1 }
  const r = razaSpre({ x: 10.5, y: ZA - 0.1, z: 20.5 }) // capacul desenat: z + 0,9
  const solDinSpate = impactPePlan(r, ZA - 1)
  assert.notDeepEqual(coloanaImpactului(solDinSpate), { wx: 10, wy: 20 }, 'raza trebuie sa treaca peste cub, spre solul din spate')
  assert.deepEqual(alegeColoana(intrebare(r, [solDinSpate], { cuburi: [cub] })), { ok: true, wx: 10, wy: 20, sursa: 'J' })
  // Fara overlay-ul J, cubul nu se vede: coloana e a solului.
  assert.deepEqual(alegeColoana(intrebare(r, [solDinSpate])), { ok: true, ...coloanaImpactului(solDinSpate), sursa: 'teren' })
  // Peste o celula deja desemnata, capacul nu mai e tinta: raza merge mai departe.
  const ocupat = alegeColoana(intrebare(r, [solDinSpate], { cuburi: [cub], desemnataPeNivel: (x, y) => x === 10 && y === 20 }))
  assert.deepEqual(ocupat, { ok: true, ...coloanaImpactului(solDinSpate), sursa: 'teren' })
})

test('podeaua camerei cu doua niveluri mai jos: raza trece prin LATERALUL peretelui din fata, nu-l ia drept podea', () => {
  // Pereti desemnati la zActiv - 2 si zActiv - 1, placa se deseneaza la zActiv, solul camerei are
  // fata de sus la zActiv - 2. Tinta: celula (10, 20) a podelei; peretele din fata e cel prin care
  // trece raza la inaltimea randului de sus (zActiv - 0,5).
  const r = razaSpre({ x: 10.5, y: ZA - 2, z: 20.5 })
  const perete = celulaPeRaza(r, ZA - 0.5, ZA - 1)
  assert.notDeepEqual({ wx: perete.wx, wy: perete.wy }, { wx: 10, wy: 20 })
  assert.ok(cubAtins(r, [perete], ZA - 1, ZA - 1) !== null, 'scena: raza chiar trece prin peretele din fata')
  assert.equal(capacAtins(r, [perete], ZA - 1, () => true), null, 'scena: raza nu-i atinge capacul')
  assert.deepEqual(alegeColoana(intrebare(r, [impactPePlan(r, ZA - 2)], { cuburi: [perete] })), { ok: true, wx: 10, wy: 20, sursa: 'teren' })
})

test('cuburile J mai adanci de un nivel sub cel activ NU aleg coloana (vazute prin sol, sunt deplasate)', () => {
  const r = razaSpre({ x: 10.5, y: ZA, z: 20.5 })
  const sol = impactPePlan(r, ZA)
  const adanc = celulaPeRaza(r, ZA - 2.1, ZA - 3)
  assert.notDeepEqual({ wx: adanc.wx, wy: adanc.wy }, { wx: 10, wy: 20 })
  assert.ok(capacAtins(r, [adanc], ZA - 3, () => true) !== null, 'scena: raza chiar ii atinge capacul')
  assert.deepEqual(alegeColoana(intrebare(r, [sol], { cuburi: [adanc] })), { ok: true, wx: 10, wy: 20, sursa: 'teren' })
})

test('placa desenata dinspre camera: cuburile ei deja puse (PE nivelul activ) nu ascund solul din spate', () => {
  // Solul la zActiv - 2 (fata de sus la zActiv - 1): placa se deseneaza cu doua niveluri peste sol.
  const r = razaSpre({ x: 10.5, y: ZA - 1, z: 20.5 })
  const pus = celulaPeRaza(r, ZA + 0.5, ZA)
  assert.notDeepEqual({ wx: pus.wx, wy: pus.wy }, { wx: 10, wy: 20 })
  assert.ok(cubAtins(r, [pus], ZA, ZA) !== null, 'scena: raza chiar trece prin cubul pus')
  const desemnata = (wx: number, wy: number) => wx === pus.wx && wy === pus.wy
  assert.deepEqual(alegeColoana(intrebare(r, [impactPePlan(r, ZA - 1)], { cuburi: [pus], desemnataPeNivel: desemnata })), { ok: true, wx: 10, wy: 20, sursa: 'teren' })
})

test('impacturile TAIATE de slice se sar: se ia primul impact vizibil', () => {
  const r = razaSpre({ x: 10.5, y: ZA, z: 20.5 })
  const sol = impactPePlan(r, ZA)
  const taiat: Impact = { t: sol.t - 20, p: { x: 3, y: ZA + 4, z: 30 }, n: { x: 0, y: 1, z: 0 } }
  assert.equal(primulVizibil([taiat, sol], ZA + 1), sol)
  assert.equal(primulVizibil([taiat, sol], null), taiat, 'fara slice nu se taie nimic')
  assert.deepEqual(alegeColoana(intrebare(r, [taiat, sol])), { ok: true, wx: 10, wy: 20, sursa: 'teren' })
  // Fata de sus a nivelului activ sta EXACT pe plan si se vede.
  const peplan: Impact = { t: 1, p: { x: 4.5, y: ZA + 1, z: 4.5 }, n: { x: 0, y: 1, z: 0 } }
  assert.equal(primulVizibil([peplan], ZA + 1), peplan)
})

test('fata laterala a unui solid de PE nivelul activ: tinta e celula de aer din fata ei, nu solidul (plin)', () => {
  // Fasia din OWNER_VERIFY 12: celula zidita (10, 20, zActiv), fata ei -x, vazuta dinspre camera.
  const fata: Impact = { t: 30, p: { x: 10, y: ZA + 0.5, z: 20.5 }, n: { x: -1, y: 0, z: 0 } }
  const r = razaSpre(fata.p)
  const plin = { plinaPeNivel: (wx: number, wy: number) => wx === 10 && wy === 20 }
  assert.deepEqual(alegeColoana(intrebare(r, [fata], plin)), { ok: true, wx: 9, wy: 20, sursa: 'fata' })
  assert.deepEqual(coloanaImpactului(fata), { wx: 10, wy: 20 }, 'regula de coloana ar fi dat solidul, adica un refuz')
  // Daca celula coloanei NU e plina la nivelul activ (panta de langa fortareata), regula de coloana ramane.
  assert.deepEqual(alegeColoana(intrebare(r, [fata])), { ok: true, wx: 10, wy: 20, sursa: 'teren' })
  // Aceeasi fata, un nivel mai jos (solidul de sub nivelul activ): coloana lui — piesa se pune peste el.
  const jos: Impact = { ...fata, p: { ...fata.p, y: ZA - 0.5 } }
  assert.deepEqual(alegeColoana(intrebare(razaSpre(jos.p), [jos], plin)), { ok: true, wx: 10, wy: 20, sursa: 'teren' })
  // Un triunghi ABRUPT al pantei netezite, la aceeasi cota, nu e perete: coloana punctului, nu celula din fata lui.
  const l = Math.hypot(0.9, 0.3)
  const abrupt: Impact = { ...fata, n: { x: -0.9 / l, y: 0.3 / l, z: 0 } }
  assert.deepEqual(alegeColoana(intrebare(razaSpre(abrupt.p), [abrupt], plin)), { ok: true, wx: 10, wy: 20, sursa: 'teren' })
})

test('fata laterala de voxel: punctul sta pe granita, coloana e a solidului vazut', () => {
  // Fata +x a solidului din coloana 10: punctul are x = 11 exact.
  const i: Impact = { t: 30, p: { x: 11, y: ZA - 0.5, z: 20.5 }, n: { x: 1, y: 0, z: 0 } }
  assert.deepEqual(coloanaImpactului(i), { wx: 10, wy: 20 })
  assert.equal(Math.floor(i.p.x), 11, 'fara impingere, rotunjirea ar lua coloana de aer')
})

test('triunghi de panta: coloana e a PUNCTULUI, nu a punctului impins jumatate de celula', () => {
  const l = Math.hypot(0.5, 0.8)
  const n = { x: 0.5 / l, y: 0.8 / l, z: 0 }
  const i: Impact = { t: 30, p: { x: 10.2, y: ZA + 0.3, z: 20.5 }, n }
  assert.deepEqual(coloanaImpactului(i), { wx: 10, wy: 20 })
  assert.equal(Math.floor(i.p.x - 0.5 * n.x), 9, 'varianta -0,5·n ar fi pierdut celula')
})

test('nimic sub cursor: cerul si planul prea departe nu desemneaza nimic; aproape, planul de rezerva', () => {
  const sus: Raza = { o: { x: 0, y: ZA + 30, z: 0 }, d: { x: 0.8, y: 0.6, z: 0 } }
  assert.deepEqual(alegeColoana(intrebare(sus, [])), { ok: false })
  const l = Math.hypot(1, 0.1)
  const razant: Raza = { o: { x: 0.5, y: ZA + 30, z: 0.5 }, d: { x: 1 / l, y: -0.1 / l, z: 0 } }
  assert.deepEqual(alegeColoana(intrebare(razant, [])), { ok: false }, 'planul la ~301 m: dincolo de departeMax')
  const aproape: Raza = { o: { x: 0.5, y: ZA + 10, z: 0.5 }, d: { x: 1 / l, y: -0.1 / l, z: 0 } }
  assert.deepEqual(alegeColoana(intrebare(aproape, [])), { ok: true, wx: 100, wy: 0, sursa: 'plan' })
})

test('retragerea: cubul J e atins oriunde — capac, lateral, baza — iar dintre doua pe raza, cel din fata', () => {
  const rand: CelulaJ[] = [-3, -2, -1, 0, 1, 2, 3].map((d) => ({ wx: 10 + d, wy: 20, z: ZA }))
  for (const c of rand) {
    for (const punct of [
      { x: c.wx + 0.5, y: c.z + 0.9, z: c.wy + 0.5 }, // capac
      // Lateral: fata +z, care priveste spre camera. Fata -x ar fi ascunsa de cubul vecin din rand.
      { x: c.wx + 0.5, y: c.z + 0.5, z: c.wy + 0.9 },
      { x: c.wx + 0.5, y: c.z + 0.1, z: c.wy + 0.5 }, // baza
    ]) {
      const a = cubAtins(razaSpre(punct), rand, -Infinity, ZA)
      assert.ok(a !== null)
      assert.deepEqual(a.c, c, `punct ${JSON.stringify(punct)}`)
    }
  }
  // Doua cuburi pe aceeasi raza: cel mai apropiat de camera. Al doilea e un cub mai adanc, prin
  // al carui MIJLOC trece raza (primul punct de pe raza, dincolo de primul cub, aflat bine in interiorul unui cub desenat).
  const r = razaSpre({ x: 10.5, y: ZA + 0.5, z: 20.5 })
  const tFata = cubAtins(r, [{ wx: 10, wy: 20, z: ZA }], -Infinity, ZA)!.t
  const fr = (v: number) => v - Math.floor(v)
  let spate: CelulaJ | null = null
  for (let s = 3; s < 20 && spate === null; s += 0.01) {
    const p = { x: 10.5 + s * r.d.x, y: ZA + 0.5 + s * r.d.y, z: 20.5 + s * r.d.z }
    if ([p.x, p.y, p.z].every((v) => fr(v) > 0.25 && fr(v) < 0.75)) spate = { wx: Math.floor(p.x), wy: Math.floor(p.z), z: Math.floor(p.y) }
  }
  assert.ok(spate !== null && spate.z < ZA)
  assert.ok(cubAtins(r, [spate], -Infinity, ZA)!.t > tFata)
  assert.deepEqual(cubAtins(r, [spate, { wx: 10, wy: 20, z: ZA }], -Infinity, ZA)!.c, { wx: 10, wy: 20, z: ZA })
  // Un cub TAIAT (peste nivelul activ) nu se atinge.
  assert.equal(cubAtins(razaSpre({ x: 10.5, y: ZA + 1.5, z: 20.5 }), [{ wx: 10, wy: 20, z: ZA + 1 }], -Infinity, ZA), null)
})

test('celula langa fata: +1 e aerul din fata, -1 solidul din spate', () => {
  const sus: Impact = { t: 1, p: { x: 10.4, y: ZA, z: 20.6 }, n: { x: 0, y: 1, z: 0 } }
  assert.deepEqual(celulaLangaFata(sus, 1), { wx: 10, wy: 20, z: ZA })
  assert.deepEqual(celulaLangaFata(sus, -1), { wx: 10, wy: 20, z: ZA - 1 })
  // Heightfield: suprafata la cota fractionara. Sub 13,37 m, solidul incepe de la 12 in jos (sapat);
  // aerul din fata e 13 (zidit). Cu o patrundere mica in loc de jumatate de celula, sapatul ar tinti aerul.
  const hf: Impact = { t: 1, p: { x: 10.4, y: 13.37, z: 20.6 }, n: { x: 0, y: 1, z: 0 } }
  assert.deepEqual(celulaLangaFata(hf, -1), { wx: 10, wy: 20, z: 12 })
  assert.deepEqual(celulaLangaFata(hf, 1), { wx: 10, wy: 20, z: 13 })
  const lateral: Impact = { t: 1, p: { x: 11, y: ZA + 0.5, z: 20.5 }, n: { x: 1, y: 0, z: 0 } }
  assert.deepEqual(celulaLangaFata(lateral, 1), { wx: 11, wy: 20, z: ZA })
  assert.deepEqual(celulaLangaFata(lateral, -1), { wx: 10, wy: 20, z: ZA })
})

test('intrarea in cutie: din interior e 0, pe langa ea si paralel cu ea e null', () => {
  assert.equal(intrareInCutie({ o: { x: 0.5, y: 0.5, z: 0.5 }, d: { x: 1, y: 0, z: 0 } }, 0, 0, 0, 1, 1, 1), 0)
  assert.equal(intrareInCutie({ o: { x: -1, y: 2, z: 0.5 }, d: { x: 1, y: 0, z: 0 } }, 0, 0, 0, 1, 1, 1), null)
  assert.equal(intrareInCutie({ o: { x: -1, y: 0.5, z: 0.5 }, d: { x: 1, y: 0, z: 0 } }, 0, 0, 0, 1, 1, 1), 1)
  assert.equal(intrareInCutie({ o: { x: 2, y: 0.5, z: 0.5 }, d: { x: 1, y: 0, z: 0 } }, 0, 0, 0, 1, 1, 1), null, 'cutia din spatele camerei')
})
