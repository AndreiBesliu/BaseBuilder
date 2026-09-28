/**
 * „De ce nu e încăpere?" — explicația inspectorului (src/sim/camere-explica.ts), pe scene mici
 * zidite direct în teren. Cazurile vin din lentila „jucătorul" a panoului pe design: gaura din
 * acoperiș raportată ca „deschidere în perete" (JUC-1), ușa propusă la intrarea coridorului în loc
 * de golul pivniței (JUC-2).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { componentaLa, sincronizeazaCamere, formaCanonica } from '../src/sim/camere.ts'
import { EXPLICA_BUGET, explicaCelula, scurgeriLaNivel } from '../src/sim/camere-explica.ts'
import type { CostExplicatie, Explicatie } from '../src/sim/camere-explica.ts'
import { hashWorld } from '../src/sim/hash.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import type { MaterialId } from '../src/sim/terrain/chunk.ts'
import { dig, fill, groundLevelM, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { createWorld } from '../src/sim/world.ts'
import { textLoc } from '../viewer/ui/texte.ts'
import { sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

/**
 * Inel de ziduri LxL pe [g+1, g+H], cu `usi` (dx, dy) = USA si `goluri` (dx, dy) = aer, pe toata
 * inaltimea; acoperisul la g+H+1 peste `acoperis` ('tot' = toata amprenta, 'interior' = fara inel).
 */
function casa(w: World, x0: number, y0: number, g: number, L: number, H: number, o: { goluri?: [number, number][]; usi?: [number, number][]; acoperis?: 'tot' | 'interior'; gauri?: [number, number][] } = {}): void {
  const t = w.terrain
  const are = (l: [number, number][] | undefined, dx: number, dy: number): boolean => (l ?? []).some(([a, b]) => a === dx && b === dy)
  for (let z = g + 1; z <= g + H; z++) for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
    if (are(o.goluri, dx, dy)) continue
    const m: MaterialId = are(o.usi, dx, dy) ? Material.USA : P
    assert.ok(fill(t, x0 + dx, y0 + dy, z, m).ok)
  }
  for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    const inel = dx === 0 || dx === L - 1 || dy === 0 || dy === L - 1
    if ((o.acoperis ?? 'tot') === 'interior' && inel) continue
    if (are(o.gauri, dx, dy)) continue
    assert.ok(fill(t, x0 + dx, y0 + dy, g + H + 1, P).ok)
  }
  sincronizeazaCamere(w.camere, t)
}

function deschisa(e: Explicatie): Extract<Explicatie, { fel: 'DESCHISA' }> {
  assert.equal(e.fel, 'DESCHISA', JSON.stringify(e))
  return e as Extract<Explicatie, { fel: 'DESCHISA' }>
}

test('explica: incaperea cu usa — volumul, O usa (doua celule), podeaua pe niveluri', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  casa(w, wx, wy, g, 5, 2, { usi: [[2, 0]] })
  const e = explicaCelula(w.terrain, w.camere, wx + 2, wy + 2, g + 1)
  assert.equal(e.fel, 'INCAPERE')
  if (e.fel !== 'INCAPERE') return
  assert.equal(e.volum, 18)
  assert.equal(e.usi, 1, 'o usa de doua celule e O usa')
  assert.deepEqual(e.podea, [[g + 1, 9]])
})

test('explica (JUC-1): o gaura in acoperis iese SUS, cu celula gaurii din planul acoperisului, si fara sfat de usa', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  casa(w, wx, wy, g, 5, 2, { gauri: [[2, 2]] })
  const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 1, wy + 1, g + 1))
  assert.equal(e.directie, 'SUS')
  assert.deepEqual(e.gaura, { x: wx + 2, y: wy + 2, z: g + 3 })
  assert.deepEqual(e.usiPropuse, [])
})

test('explica (JUC-1): golul unei usi iese LATERAL, iar usa propusa in gol inchide incaperea — cu buiandrug si fara', () => {
  for (const acoperis of ['tot', 'interior'] as const) {
    const { w, wx, wy, g } = sitPlat(777, 8)
    casa(w, wx, wy, g, 5, 2, { goluri: [[2, 0]], acoperis })
    const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 2, wy + 3, g + 1))
    assert.equal(e.directie, 'LATERAL', acoperis)
    assert.deepEqual(e.usiPropuse.map((c) => [c.x - wx, c.y - wy, c.z - g]), [[2, 0, 1], [2, 0, 2]], acoperis)
    assert.equal(e.volumCuUsi, 18, acoperis)
  }
})

test('explica (JUC-1): gaura in acoperisul camerei de dincolo de un gol de usa iese tot SUS, cu usa propusa in gol', () => {
  // Casa 9x5 impartita de un perete (x=4) cu golul (4,2); gaura in acoperis la (6,2). Cu un gol pe drum,
  // umplerea cerului nu se mai intreaba (EXP-2): direcția o da doar regula locala.
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const t = w.terrain
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 9; dx++) for (let dy = 0; dy < 5; dy++) {
    const inel = dx === 0 || dx === 8 || dy === 0 || dy === 4
    if (inel || (dx === 4 && dy !== 2)) assert.ok(fill(t, wx + dx, wy + dy, z, P).ok)
  }
  for (let dx = 0; dx < 9; dx++) for (let dy = 0; dy < 5; dy++) if (!(dx === 6 && dy === 2)) assert.ok(fill(t, wx + dx, wy + dy, g + 3, P).ok)
  sincronizeazaCamere(w.camere, t)
  const e = deschisa(explicaCelula(t, w.camere, wx + 2, wy + 2, g + 1))
  assert.equal(e.directie, 'SUS')
  assert.deepEqual(e.gaura, { x: wx + 6, y: wy + 2, z: g + 3 })
  assert.deepEqual(e.usiPropuse.map((c) => [c.x - wx, c.y - wy, c.z - g]), [[4, 2, 1], [4, 2, 2]])
  assert.equal(e.volumCuUsi, 18)
})

test('explica: golul unei usi spre o curte inchisa (cerul de la cota usii e marginit) ramane LATERAL, nu „gaura in acoperis"', () => {
  const { w, wx, wy, g } = sitPlat(12345, 16)
  // Casa 5x5 cu golul (2,0) spre o curte: un zid de 3 m in jurul ei, la 3 celule, fara acoperis.
  casa(w, wx + 4, wy + 4, g, 5, 2, { goluri: [[2, 0]] })
  for (let dx = 0; dx < 13; dx++) for (let dy = 0; dy < 13; dy++) {
    if (dx !== 0 && dx !== 12 && dy !== 0 && dy !== 12) continue
    for (let z = g + 1; z <= g + 3; z++) assert.ok(fill(w.terrain, wx + dx, wy + dy, z, P).ok)
  }
  sincronizeazaCamere(w.camere, w.terrain)
  const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 6, wy + 7, g + 1))
  assert.equal(e.directie, 'LATERAL')
  assert.equal(e.volumCuUsi, 18)
})

test('explica: un gol lat de 2 primeste patru celule de usa', () => {
  const { w, wx, wy, g } = sitPlat(4242, 9)
  casa(w, wx, wy, g, 6, 2, { goluri: [[2, 0], [3, 0]] })
  const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 2, wy + 3, g + 1))
  assert.equal(e.usiPropuse.length, 4)
  assert.equal(e.volumCuUsi, 32)
})

test('explica (JUC-2): pivnitele legate de un coridor cu intrare — usa propusa e golul PIVNITEI, nu intrarea', () => {
  const { w, wx, wy, g } = sitPlat(12345, 22)
  const t = w.terrain
  const sapa = (x: number, y: number, z: number): void => { assert.ok(dig(t, wx + x, wy + y, z).ok) }
  // Sub doua straturi de sol: coridorul pe y=6, patru pivnite 3x3 deasupra lui, fiecare cu golul
  // ei de 1x2 spre coridor, si o intrare deschisa la capatul coridorului.
  for (const z of [g - 3, g - 2]) {
    for (let x = 0; x <= 17; x++) sapa(x, 6, z)
    for (const px of [1, 5, 9, 13]) {
      for (let dx = 0; dx < 3; dx++) for (let dy = 1; dy <= 3; dy++) sapa(px + dx, dy, z)
      sapa(px + 1, 4, z)
      sapa(px + 1, 5, z)
    }
  }
  for (const z of [g - 1, g]) sapa(17, 6, z)
  sincronizeazaCamere(w.camere, t)
  const e = deschisa(explicaCelula(t, w.camere, wx + 6, wy + 2, g - 3))
  // Intrarea e un put: din coridor, o gaura in tavan — SUS, cu gaura la gura putului.
  assert.equal(e.directie, 'SUS')
  assert.deepEqual(e.gaura, { x: wx + 17, y: wy + 6, z: g })
  assert.ok(e.pasi > 12, `scurgerea (intrarea) e departe: ${e.pasi} pasi`)
  const usa = e.usiPropuse.map((c) => [c.x - wx, c.y - wy, c.z - g])
  assert.ok(usa.length === 2 && usa.every(([x, y]) => x === 6 && (y === 4 || y === 5)), `usa propusa: ${JSON.stringify(usa)}`)
  assert.equal(e.volumCuUsi, 18 + (usa[0]![1] === 5 ? 2 : 0), 'promisiunea: pivnita (cu golul pana la usa)')
})

test('explica: o pivnita lata de 2 nu primeste usa in mijloc — usa e in golul ei de 1, spre exterior', () => {
  const { w, wx, wy, g } = sitPlat(12345, 14)
  const t = w.terrain
  const sapa = (x: number, y: number, z: number): void => { assert.ok(dig(t, wx + x, wy + y, z).ok) }
  // Pivnita 2x6 sub doua straturi de sol, cu un gol de 1x2 spre o groapa deschisa.
  for (const z of [g - 3, g - 2]) {
    for (let x = 1; x <= 2; x++) for (let y = 1; y <= 6; y++) sapa(x, y, z)
    sapa(1, 7, z)
  }
  for (let z = g - 3; z <= g; z++) sapa(1, 8, z)
  sincronizeazaCamere(w.camere, t)
  const e = deschisa(explicaCelula(t, w.camere, wx + 2, wy + 1, g - 3))
  assert.deepEqual(e.usiPropuse.map((c) => [c.x - wx, c.y - wy, c.z - g]), [[1, 7, -3], [1, 7, -2]])
  assert.equal(e.volumCuUsi, 24)
})

test('explica: doua goluri — doua usi, iar promisiunea vine abia dupa a doua', () => {
  const { w, wx, wy, g } = sitPlat(777, 8)
  casa(w, wx, wy, g, 5, 2, { goluri: [[2, 0], [0, 2]] })
  const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 2, wy + 2, g + 1))
  assert.equal(e.usiPropuse.length, 4)
  assert.equal(e.volumCuUsi, 18)
})

test('explica: scurgerile de la un nivel sunt celulele de cer de langa aerul acoperit deschis; o incapere n-are', () => {
  const { w, wx, wy, g } = sitPlat(777, 16)
  casa(w, wx, wy, g, 5, 2, { goluri: [[2, 0]] })
  casa(w, wx + 8, wy, g, 5, 2, { usi: [[2, 0]] })
  const s = scurgeriLaNivel(w.terrain, w.camere, g + 1).map((c) => [c.x - wx, c.y - wy])
  assert.deepEqual(s, [[2, -1]])
})

test('explica e pura: nu schimba lumea si nici indexul', () => {
  const { w, wx, wy, g } = sitPlat(4242, 9)
  casa(w, wx, wy, g, 6, 2, { goluri: [[2, 0]] })
  const h = hashWorld(w)
  const f = formaCanonica(w.camere)
  const ep = w.camere.epoca
  for (let dx = 1; dx <= 4; dx++) explicaCelula(w.terrain, w.camere, wx + dx, wy + 2, g + 1)
  scurgeriLaNivel(w.terrain, w.camere, g + 1)
  assert.equal(hashWorld(w), h)
  assert.deepEqual(formaCanonica(w.camere), f)
  assert.equal(w.camere.epoca, ep)
})

// --- recenzia explicatiei (EXP-1..EXP-7) ---------------------------------------------------------

/** Usile propuse, relativ la (wx, wy, g), sortate. */
function usiRel(e: Extract<Explicatie, { fel: 'DESCHISA' }>, wx: number, wy: number, g: number): string[] {
  return e.usiPropuse.map((c) => `${c.x - wx},${c.y - wy},${c.z - g}`).sort()
}

test('explica (EXP-1): un stalp langa zid — usa propusa e golul casei (48 m3), nu coltul dintre stalp si zid', () => {
  // Casa 7x7 cu golul (3,6); un stalp (grinda) pe toata inaltimea. Lentila: stalpul (2,2), clic (1,1)
  // dadea usile (2,1) si (1,2) — „devine o incapere de 2 m3". Stalpul (3,3) inchidea jumatatea de nord
  // (20 m3), iar stalpul (2,3), in linie cu golul casei, adauga o usa de prisos langa el (44 m3).
  for (const [sx, sy] of [[2, 2], [3, 3], [2, 3]] as const) {
    const { w, wx, wy, g } = sitPlat(12345, 10)
    casa(w, wx, wy, g, 7, 2, { goluri: [[3, 6]] })
    for (const z of [g + 1, g + 2]) assert.ok(fill(w.terrain, wx + sx, wy + sy, z, Material.GRINDA).ok)
    sincronizeazaCamere(w.camere, w.terrain)
    for (const [qx, qy] of [[1, 1], [1, 2], [2, 1], [5, 1], [3, 5]] as const) {
      for (const z of [g + 1, g + 2]) {
        const e = deschisa(explicaCelula(w.terrain, w.camere, wx + qx, wy + qy, z))
        const unde = `stalp (${sx},${sy}), clic (${qx},${qy},${z - g})`
        assert.deepEqual(usiRel(e, wx, wy, g), ['3,6,1', '3,6,2'], unde)
        assert.equal(e.volumCuUsi, 48, unde)
      }
    }
  }
})

test('explica (EXP-1): sala 13x13 cu grila de stalpi la (3|6|9) — fiecare raspuns pune usa in golul salii', () => {
  // Cu suportMax = 4, o sala mare cere stalpi. Pe grila asta, doar 18 din 113 raspunsuri erau corecte
  // (58 promiteau sub jumatate din volum, 37 ramaneau fara sfat).
  const { w, wx, wy, g } = sitPlat(12345, 16)
  casa(w, wx, wy, g, 13, 2, { goluri: [[6, 12]] })
  const stalpi = [[3, 3], [6, 3], [9, 3], [3, 6], [9, 6], [3, 9], [6, 9], [9, 9]]
  for (const [sx, sy] of stalpi) for (const z of [g + 1, g + 2]) assert.ok(fill(w.terrain, wx + sx!, wy + sy!, z, Material.GRINDA).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  let intrebari = 0
  for (let qx = 1; qx <= 11; qx++) for (let qy = 1; qy <= 11; qy++) {
    if (stalpi.some(([a, b]) => a === qx && b === qy)) continue
    const e = deschisa(explicaCelula(w.terrain, w.camere, wx + qx, wy + qy, g + 1))
    assert.deepEqual(usiRel(e, wx, wy, g), ['6,12,1', '6,12,2'], `clic (${qx},${qy})`)
    assert.equal(e.volumCuUsi, (121 - 8) * 2, `clic (${qx},${qy})`)
    intrebari++
  }
  assert.equal(intrebari, 113)
})

test('explica (EXP-1): doua goluri despartite de o celula de zid (montantul) — sfatul pune ambele usi', () => {
  // Montantul e un solid izolat in plan: cu regula „latura e zid" singura, cele 25 de clicuri ramaneau
  // fara sfat (verificatorul EXP-1). Si langa colt, si cu goluri late de 2.
  for (const [L, goluri] of [[7, [[2, 6], [4, 6]]], [7, [[3, 6], [5, 6]]], [9, [[2, 8], [3, 8], [5, 8], [6, 8]]]] as const) {
    const { w, wx, wy, g } = sitPlat(777, L + 3)
    casa(w, wx, wy, g, L, 2, { goluri: goluri.map(([a, b]) => [a, b] as [number, number]) })
    const asteptat = goluri.flatMap(([a, b]) => [`${a},${b},1`, `${a},${b},2`]).sort()
    for (let qx = 1; qx < L - 1; qx++) for (let qy = 1; qy < L - 1; qy++) {
      const e = deschisa(explicaCelula(w.terrain, w.camere, wx + qx, wy + qy, g + 1))
      const unde = `${JSON.stringify(goluri)}, clic (${qx},${qy})`
      assert.deepEqual(usiRel(e, wx, wy, g), asteptat, unde)
      assert.equal(e.volumCuUsi, (L - 2) * (L - 2) * 2, unde)
    }
  }
})

test('explica (EXP-2): acoperisul neterminat al unei case inchise iese SUS — jumatate de acoperis, fasia lipsa langa zid', () => {
  // Regula locala vedea un singur vecin acoperit langa scurgere si spunea „gol in perete", desi
  // zidurile sunt intregi: 10 din 17 intrebari in scenele lentilei, 11,5% pe un acoperis zidit celula
  // cu celula.
  for (const [nume, randuri, clicuri] of [
    ['jumatate de acoperis', [0, 1, 2, 3], [[3, 2], [1, 1]]],
    ['fasia lipsa langa zid', [0, 1, 2, 3, 4, 6], [[3, 2], [1, 4]]],
  ] as const) {
    const { w, wx, wy, g } = sitPlat(12345, 10)
    casa(w, wx, wy, g, 7, 2, { acoperis: 'interior', gauri: [] })
    // Acoperisul doar pe randurile date (peste tot inelul si interiorul).
    for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
      const m = materialAt(w.terrain, wx + dx, wy + dy, g + 3)
      const vreau = (randuri as readonly number[]).includes(dy)
      if (vreau && m.ok && m.value === Material.AER) assert.ok(fill(w.terrain, wx + dx, wy + dy, g + 3, P).ok)
      if (!vreau && m.ok && m.value !== Material.AER) assert.ok(dig(w.terrain, wx + dx, wy + dy, g + 3).ok)
    }
    sincronizeazaCamere(w.camere, w.terrain)
    for (const [qx, qy] of clicuri) {
      const e = deschisa(explicaCelula(w.terrain, w.camere, wx + qx, wy + qy, g + 1))
      assert.equal(e.directie, 'SUS', `${nume}, clic (${qx},${qy}): ${JSON.stringify(e)}`)
      assert.equal(e.gaura.z, g + 3, `${nume}: gaura e in planul acoperisului`)
      assert.deepEqual(e.usiPropuse, [], nume)
    }
  }
})

/** Curte SxS inchisa (ziduri pe [g+1, g+3]) cu coltul in (wx, wy). */
function curte(w: World, wx: number, wy: number, g: number, S: number): void {
  for (let z = g + 1; z <= g + 3; z++) for (let dx = 0; dx < S; dx++) for (let dy = 0; dy < S; dy++) {
    if (dx !== 0 && dx !== S - 1 && dy !== 0 && dy !== S - 1) continue
    assert.ok(fill(w.terrain, wx + dx, wy + dy, z, P).ok)
  }
}

test('explica (EXP-2): golul usii spre o curte inchisa, sub o streasina, ramane LATERAL — umplerea cerului decide doar fara gol pe drum', () => {
  // Umplerea singura (forma lentilei) dadea aici SUS pe 50 din 50 de intrebari, cu textul „gaura in
  // acoperis" + „pune o usa in gol" (verificatorul EXP-2): streasina face hotarul cerului din curte
  // acoperit pe mai mult de un sfert.
  const { w, wx, wy, g } = sitPlat(12345, 14)
  curte(w, wx, wy, g, 11)
  casa(w, wx + 2, wy + 3, g, 7, 2, { goluri: [[3, 0]] })
  for (let dx = -1; dx <= 7; dx++) for (let dy = -1; dy <= 7; dy++) {
    const m = materialAt(w.terrain, wx + 2 + dx, wy + 3 + dy, g + 3)
    if (m.ok && m.value === Material.AER) assert.ok(fill(w.terrain, wx + 2 + dx, wy + 3 + dy, g + 3, P).ok)
  }
  sincronizeazaCamere(w.camere, w.terrain)
  for (let qx = 1; qx <= 5; qx++) for (let qy = 1; qy <= 5; qy++) {
    const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 2 + qx, wy + 3 + qy, g + 1))
    assert.equal(e.directie, 'LATERAL', `clic (${qx},${qy})`)
    assert.equal(e.volumCuUsi, 50, `clic (${qx},${qy})`)
  }
})

test('explica (EXP-2): o deschidere lata de 3 spre o curte inchisa ramane LATERAL — cerul curtii e marginit mai ales de ziduri', () => {
  // Nu e gol de usa (lat de 3), deci umplerea decide. Hotarul cerului din curte: 3 celule acoperite
  // (deschiderea, sub buiandrug) fata de ~70 pline — sub un sfert.
  const { w, wx, wy, g } = sitPlat(12345, 16)
  curte(w, wx, wy, g, 13)
  casa(w, wx + 3, wy + 4, g, 7, 2, { goluri: [[2, 0], [3, 0], [4, 0]] })
  sincronizeazaCamere(w.camere, w.terrain)
  for (const [qx, qy] of [[3, 3], [1, 5], [5, 1]] as const) {
    const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 3 + qx, wy + 4 + qy, g + 1))
    assert.equal(e.directie, 'LATERAL', `clic (${qx},${qy})`)
    assert.deepEqual(e.usiPropuse, [])
  }
})

test('explica (EXP-3): gaura din acoperis langa un turn e in planul acoperisului — „cu 2 m mai sus", nu in varful turnului', () => {
  // Casa 7x7 cu acoperis la g+3, zidul x=6 inaltat pana la g+8, gaura la (5,3). Cota se lua din cel mai
  // inalt varf vecin: g+8, „cu 7 m mai sus".
  const { w, wx, wy, g } = sitPlat(12345, 10)
  casa(w, wx, wy, g, 7, 2, { gauri: [[5, 3]] })
  for (let dy = 0; dy < 7; dy++) for (let z = g + 4; z <= g + 8; z++) assert.ok(fill(w.terrain, wx + 6, wy + dy, z, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const e = deschisa(explicaCelula(w.terrain, w.camere, wx + 2, wy + 3, g + 1))
  assert.equal(e.directie, 'SUS')
  assert.deepEqual(e.gaura, { x: wx + 5, y: wy + 3, z: g + 3 })
  assert.equal(textLoc({ x: wx + 2, y: wy + 3, z: g + 1 }, e.gaura), 'cu 2 m mai sus, la 3 m')
})

/**
 * O mina (hala NxN, inalta de H, sub cel putin 3 m de sol) cu K tuneluri 1x2 spre un sant deschis la
 * cer — scena verificatorului EXP-4. Situl: solul variaza cu cel mult 4 m peste toata hala.
 */
function mina(seed: number, N: number, H: number, K: number): { w: World; wx: number; wy: number; z0: number } {
  const w = createWorld(seed)
  for (let k = 1; k <= 20000; k++) {
    const wx = ((k * 1237 + seed * 7) % (WORLD_CELLS - 400)) + 200
    const wy = ((k * 7919 + seed * 31) % (WORLD_CELLS - 400)) + 200
    let lo = Infinity, hi = -Infinity, ok = true
    for (let dx = -2; dx <= N + 10 && ok; dx += 2) for (let dy = -2; dy <= N + 2; dy += 2) {
      const gg = groundLevelM(w.terrain, wx + dx, wy + dy)
      const mm = gg.ok ? materialAt(w.terrain, wx + dx, wy + dy, gg.value) : null
      if (!gg.ok || !mm || !mm.ok || mm.value === Material.APA || mm.value === Material.AER) { ok = false; break }
      lo = Math.min(lo, gg.value)
      hi = Math.max(hi, gg.value)
    }
    if (!ok || hi - lo > 4) continue
    const t = w.terrain
    const z0 = lo - 3 - H
    const sapa = (x: number, y: number, z: number): void => {
      const m = materialAt(t, wx + x, wy + y, z)
      if (m.ok && m.value !== Material.AER) assert.ok(dig(t, wx + x, wy + y, z).ok)
    }
    for (let z = z0; z < z0 + H; z++) for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) sapa(x, y, z)
    for (let x = N + 4; x <= N + 6; x++) for (let y = 0; y < N; y++) {
      const gt = groundLevelM(t, wx + x, wy + y)
      assert.ok(gt.ok)
      for (let z = gt.value; z >= z0; z--) sapa(x, y, z)
    }
    for (let i = 0; i < K; i++) {
      const y = Math.floor(((i + 0.5) * N) / K)
      for (let x = N; x <= N + 3; x++) for (const z of [z0, z0 + 1]) sapa(x, y, z)
    }
    sincronizeazaCamere(w.camere, t)
    return { w, wx, wy, z0 }
  }
  assert.fail('niciun sit pentru mina')
}

test('explica (EXP-4): bugetul e al explicatiei, nu al inundarii — pe o mina, toate inundarile impreuna viziteaza cel mult EXPLICA_BUGET celule', () => {
  // Plafonul vechi era 2^18 celule PE inundare, cu pana la 5 inundari: 0,5–1,6 s pe o mina de
  // 140–250k m3, sincron, in cadrul inspectorului. Pe 35k m3 cu 4 guri, prima inundare incape in buget,
  // dar verificarea usilor nu: se opreste (fara sfat), nu continua.
  const a = mina(9191, 50, 14, 4)
  const costA: CostExplicatie = { celule: 0, inundari: 0 }
  const ea = deschisa(explicaCelula(a.w.terrain, a.w.camere, a.wx, a.wy + 25, a.z0, costA))
  assert.deepEqual(ea.usiPropuse, [], 'bugetul s-a terminat in verificarea usilor')
  assert.equal(ea.volumCuUsi, null)
  assert.ok(costA.celule > 0 && costA.celule <= EXPLICA_BUGET, `celule: ${costA.celule}`)
  assert.ok(costA.inundari >= 2, `cautarea usilor a pornit: ${costA.inundari} inundari`)
  // Peste 2^16 m3 (96k): prima inundare nu ajunge la scurgere — DEPARTE, cu volumul din index.
  const b = mina(9191, 70, 20, 1)
  const costB: CostExplicatie = { celule: 0, inundari: 0 }
  const eb = explicaCelula(b.w.terrain, b.w.camere, b.wx, b.wy + 35, b.z0, costB)
  const c = componentaLa(b.w.camere, b.wx, b.wy + 35, b.z0)
  assert.ok(c && c.volum > EXPLICA_BUGET, `volumul minei: ${c?.volum}`)
  assert.deepEqual(eb, { fel: 'DEPARTE', volum: c!.volum })
  assert.equal(costB.celule, EXPLICA_BUGET)
  assert.equal(costB.inundari, 1)
})

/**
 * Casa canonica a usii (tests/usa.test.ts, casaCuUsa), zidita direct: ziduri g+1..2 cu usa (3,0), scara
 * sub gaura (3,4)(3,5) lipita de zidul y=6, placa la g+3, ziduri g+4..5, acoperis la g+6.
 */
function casaCuEtaj(w: World, x0: number, y0: number, g: number, chepeng: boolean): void {
  const t = w.terrain
  const put = (x: number, y: number, z: number, m: MaterialId = P): void => { assert.ok(fill(t, x0 + x, y0 + y, z, m).ok) }
  for (const [z0, z1] of [[g + 1, g + 2], [g + 4, g + 5]] as const) for (let z = z0; z <= z1; z++) for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
    if (dx > 0 && dx < 6 && dy > 0 && dy < 6) continue
    put(dx, dy, z, z <= g + 2 && dx === 3 && dy === 0 ? Material.USA : P)
  }
  put(3, 4, g + 1); put(3, 5, g + 1); put(3, 5, g + 2)
  for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
    const gaura = dx === 3 && (dy === 4 || dy === 5)
    if (!gaura) put(dx, dy, g + 3)
    else if (chepeng) put(dx, dy, g + 3, Material.USA)
    put(dx, dy, g + 6)
  }
  sincronizeazaCamere(w.camere, t)
}

test('explica (EXP-7, JUC-12): casa cu etaj si scara — podeaua „23 m2 jos, 23 m2 sus", fara trepte si fara chepeng', () => {
  // Aerul de deasupra celor doua trepte era numarat ca doua niveluri de 1 m2 („podea pe 4 niveluri,
  // 48 m2"), iar celulele de deasupra chepengului (USA, pe care nu se sta) ca podea a etajului.
  const { w, wx, wy, g } = sitPlat(12345, 10)
  casaCuEtaj(w, wx, wy, g, false)
  const o = explicaCelula(w.terrain, w.camere, wx + 1, wy + 1, g + 1)
  assert.ok(o.fel === 'INCAPERE', JSON.stringify(o))
  assert.deepEqual(o.podea, [[g + 1, 23], [g + 4, 23]])
  const b = sitPlat(777, 10)
  casaCuEtaj(b.w, b.wx, b.wy, b.g, true)
  const jos = explicaCelula(b.w.terrain, b.w.camere, b.wx + 1, b.wy + 1, b.g + 1)
  const sus = explicaCelula(b.w.terrain, b.w.camere, b.wx + 1, b.wy + 1, b.g + 4)
  assert.ok(jos.fel === 'INCAPERE' && sus.fel === 'INCAPERE', JSON.stringify([jos, sus]))
  assert.deepEqual(jos.podea, [[b.g + 1, 23]], 'parterul: treapta de sus nu e un etaj')
  assert.deepEqual(sus.podea, [[b.g + 4, 23]], 'etajul: chepengul nu e podea')
})
