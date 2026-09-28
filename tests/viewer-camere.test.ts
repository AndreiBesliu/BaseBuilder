/**
 * Viewer-ul incaperilor si al usii — partile pure: unealta Usa pe lumea planului, orientarea panoului,
 * lovitura in panou tradusa pentru tinta, culorile overlay-ului, dreptunghiul cu usa, textele, tasta I,
 * inspectorul pe acoperis si mesher-ul (usa nu e bloc).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { sincronizeazaCamere } from '../src/sim/camere.ts'
import type { Componenta } from '../src/sim/camere.ts'
import { Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import type { MaterialId } from '../src/sim/terrain/chunk.ts'
import { chunkKey, createTerrain, dig, fill, materialAt, setFocus } from '../src/sim/terrain/terrain.ts'
import { meshChunk } from '../src/render/mesher.ts'
import { golDeUsa } from '../src/sim/camere-explica.ts'
import { celuleUsiiPlan, impactPeUsa, lumePlan, orientareUsa, usiDinTeren } from '../viewer/usi.ts'
import { celulaLangaFata } from '../viewer/tinta.ts'
import { culoriIncaperi } from '../viewer/overlay-camere.ts'
import { planDreptunghi, textPlan, Unealta } from '../viewer/ui/dreptunghi.ts'
import type { Lumea } from '../viewer/ui/dreptunghi.ts'
import { textIncapere, textLoc } from '../viewer/ui/texte.ts'
import { actiuneTasta } from '../viewer/ui/taste.ts'
import { incaperea } from '../viewer/ui/model.ts'
import { R, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

/** Zid de 5 pe x (dx 0..4) la wy+3, pe [g+1, g+2], cu golul dx=2; `m` = materialul golului (null = aer). */
function zidCuGol(w: World, wx: number, wy: number, g: number, m: MaterialId | null): void {
  for (let dx = 0; dx < 5; dx++) for (const z of [g + 1, g + 2]) {
    if (dx === 2 && m === null) continue
    assert.ok(fill(w.terrain, wx + dx, wy + 3, z, dx === 2 ? m! : P).ok)
  }
}

// --- unealta Usa ---------------------------------------------------------------------

test('viewer usa: un clic pe golul unui zid DOAR planificat pune usa intreaga (lumea planului); pe teren gol, nu e gol', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  // Zidul desemnat, nezidit: pe teren, golul e doar aer.
  for (let dx = 0; dx < 5; dx++) {
    if (dx === 2) continue
    for (const z of [g + 1, g + 2]) assert.ok(applyCommand(w, { kind: 'desemneaza', wx: wx + dx, wy: wy + 3, z, piesa: Piesa.PERETE }, R).ok)
  }
  for (const z of [g + 1, g + 2]) {
    const u = celuleUsiiPlan(w, R, wx + 2, wy + 3, z)
    assert.deepEqual(u?.map((c) => c.z - g), [1, 2], `clic la g+${z - g}: toata usa`)
  }
  assert.equal(celuleUsiiPlan(w, R, wx + 6, wy + 3, g + 1), null, 'pe teren liber nu e un gol')
  // Jumatatea de jos desemnata: al doilea clic intoarce tot golul (cea desemnata se sare la aplicare).
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: wx + 2, wy: wy + 3, z: g + 1, piesa: Piesa.USA }, R).ok)
  assert.deepEqual(celuleUsiiPlan(w, R, wx + 2, wy + 3, g + 2)?.map((c) => c.z - g), [1, 2])
})

test('viewer usa: in gaura unei placi (a scarii) pune chepengul pe toata gaura, cel mult 4 celule', () => {
  const { w, wx, wy, g } = sitPlat(777, 10)
  // O placa 5x5 la g+3 pe stalpi, cu o gaura de 2 celule.
  for (const [dx, dy] of [[0, 0], [4, 0], [0, 4], [4, 4]] as const) for (let z = g + 1; z <= g + 2; z++) assert.ok(fill(w.terrain, wx + dx, wy + dy, z, P).ok)
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx === 2 && (dy === 2 || dy === 3)) continue
    assert.ok(fill(w.terrain, wx + dx, wy + dy, g + 3, P).ok)
  }
  const u = celuleUsiiPlan(w, R, wx + 2, wy + 2, g + 3)
  assert.deepEqual(u?.map((c) => [c.x - wx, c.y - wy, c.z - g]), [[2, 2, 3], [2, 3, 3]])
  // Zidit, chepengul se deseneaza orizontal, in planul placii.
  for (const c of u!) assert.ok(fill(w.terrain, c.x, c.y, c.z, Material.USA).ok)
  assert.equal(orientareUsa(w.terrain, wx + 2, wy + 2, g + 3), 'orizontala')
})

test('viewer usa (EXP-5): gaura scarii langa zid, la o casa cu etaj — un clic pe oricare celula pune tot chepengul', () => {
  // Casa canonica a usii (tests/usa.test.ts, casaCuUsa), DOAR desemnata: zidul exterior urca peste placa,
  // iar gaura (3,4)(3,5) e lipita de zidul y=6, cu scara dedesubt. Clicul pe (3,4) era refuzat („...sau
  // intr-o gaura de podea"), iar cel pe (3,5), deasupra treptei de sus, punea TACUT o singura celula:
  // etajele ramaneau o incapere de 98 m3 (verificatorul EXP-5).
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 5, y0 = wy + 4
  const d = (dx: number, dy: number, z: number, p: number): void => { assert.ok(applyCommand(w, { kind: 'desemneaza', wx: x0 + dx, wy: y0 + dy, z, piesa: p }, R).ok) }
  for (const [z0, z1] of [[g + 1, g + 2], [g + 4, g + 5]] as const) for (let z = z0; z <= z1; z++) for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
    if (dx > 0 && dx < 6 && dy > 0 && dy < 6) continue
    if (z <= g + 2 && dx === 3 && dy === 0) continue
    d(dx, dy, z, Piesa.PERETE)
  }
  d(3, 4, g + 1, Piesa.SCARA); d(3, 5, g + 1, Piesa.SCARA); d(3, 5, g + 2, Piesa.SCARA)
  for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
    if (dx === 3 && (dy === 4 || dy === 5)) continue
    d(dx, dy, g + 3, Piesa.PODEA)
    d(dx, dy, g + 6, Piesa.PODEA)
  }
  for (const dy of [4, 5]) {
    const u = celuleUsiiPlan(w, R, x0 + 3, y0 + dy, g + 3)
    assert.deepEqual(u?.map((c) => [c.x - x0, c.y - y0, c.z - g]), [[3, 4, 3], [3, 5, 3]], `clic pe (3,${dy})`)
  }
})

test('viewer usa (EXP-5): chepengul langa zidul care urca peste placa — in colt 1x1, 2x2 in colt, 2x2 langa zid', () => {
  // Casa zidita: ziduri pe g+1..g+5, placa interioara la g+3, acoperis la g+6. Forma veche cerea placa pe
  // TOATE laturile gaurii: 3 din 4 asezari obisnuite ale scarii erau refuzate.
  for (const [nume, gauri] of [
    ['1x1 in colt', [[1, 1]]],
    ['2x2 in colt', [[1, 1], [2, 1], [1, 2], [2, 2]]],
    ['2x2 langa zid', [[1, 2], [2, 2], [1, 3], [2, 3]]],
  ] as const) {
    const { w, wx, wy, g } = sitPlat(12345, 10)
    for (let z = g + 1; z <= g + 5; z++) for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
      if (dx > 0 && dx < 6 && dy > 0 && dy < 6) continue
      assert.ok(fill(w.terrain, wx + dx, wy + dy, z, P).ok)
    }
    for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
      assert.ok(fill(w.terrain, wx + dx, wy + dy, g + 6, P).ok)
      if (dx === 0 || dx === 6 || dy === 0 || dy === 6 || gauri.some(([a, b]) => a === dx && b === dy)) continue
      assert.ok(fill(w.terrain, wx + dx, wy + dy, g + 3, P).ok)
    }
    const toata = gauri.map(([a, b]) => [a, b, 3]).sort((p, q) => p[1]! - q[1]! || p[0]! - q[0]!)
    for (const [a, b] of gauri) {
      const u = celuleUsiiPlan(w, R, wx + a, wy + b, g + 3)
      assert.deepEqual(u?.map((c) => [c.x - wx, c.y - wy, c.z - g]), toata, `${nume}: clic pe (${a},${b})`)
    }
  }
})

test('viewer usa (EXP-5, EXP-8): gaura unei placi peste un coridor ingust e un chepeng de o celula, nu o usa verticala de 3', () => {
  // Coridor de 1 (y=1) intre ziduri de 2 m, placa la g+3 cu gaura (5,1). golDeUsa, intrebat intai,
  // cobora prin gaura pana la podeaua coridorului: trei celule, dintre care doua in coridor.
  const { w, wx, wy, g } = sitPlat(777, 14)
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx <= 10; dx++) for (let dy = 0; dy <= 2; dy++) {
    if (dx !== 0 && dx !== 10 && dy !== 0 && dy !== 2) continue
    assert.ok(fill(w.terrain, wx + dx, wy + dy, z, P).ok)
  }
  for (let dx = 0; dx <= 10; dx++) for (let dy = 0; dy <= 2; dy++) if (!(dx === 5 && dy === 1)) assert.ok(fill(w.terrain, wx + dx, wy + dy, g + 3, P).ok)
  assert.deepEqual(celuleUsiiPlan(w, R, wx + 5, wy + 1, g + 3)?.map((c) => [c.x - wx, c.y - wy, c.z - g]), [[5, 1, 3]])
})

test('viewer usa (EXP-8, ECR-9): o groapa, capatul unui sant si fundul unui put nu sunt goluri de usa — golul cere aer de o parte si de alta', () => {
  // golDeUsa primea orice aer cu plin pe doua laturi opuse si podea dedesubt: o groapa de 1 m in sol era
  // un „gol de usa" (fantoma o arata, clicul o desemna).
  const { w, wx, wy, g } = sitPlat(777, 16)
  const sapa = (x: number, y: number, z: number): void => { assert.ok(dig(w.terrain, wx + x, wy + y, z).ok) }
  sapa(3, 3, g)
  const q = lumePlan(w, R)
  for (const [dx, dy] of [[0, 1], [1, 0]] as const) assert.equal(golDeUsa(q, { x: wx + 3, y: wy + 3, z: g }, dx, dy), null, `groapa 1x1, trecerea (${dx},${dy})`)
  // Santul 1x6: capetele n-au pe unde trece.
  for (let x = 2; x <= 7; x++) sapa(x, 8, g)
  assert.equal(celuleUsiiPlan(w, R, wx + 2, wy + 8, g), null, 'capatul de vest al santului')
  assert.equal(celuleUsiiPlan(w, R, wx + 7, wy + 8, g), null, 'capatul de est al santului')
  // Putul de 2 m: la fund, plin de jur imprejur.
  sapa(11, 3, g)
  sapa(11, 3, g - 1)
  assert.equal(celuleUsiiPlan(w, R, wx + 11, wy + 3, g - 1), null, 'fundul putului')
  // Controlul: golul unui zid ramane gol (aer de ambele parti).
  zidCuGol(w, wx + 8, wy + 8, g, null)
  assert.deepEqual(celuleUsiiPlan(w, R, wx + 10, wy + 11, g + 1)?.map((c) => c.z - g), [1, 2])
})

test('viewer usa (EXP-8, ECR-9): golul unei pivnite desemnate la sapat, dar nesapate, e un gol in lumea planului', () => {
  // Pivnita 3x3 sapata sub sol, coridorul spre ea (2,4)(2,5) doar desemnat la sapat.
  const { w, wx, wy, g } = sitPlat(4242, 14)
  for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) for (const z of [g - 3, g - 2]) assert.ok(dig(w.terrain, wx + x, wy + y, z).ok)
  for (const y of [4, 5]) for (const z of [g - 3, g - 2]) assert.ok(applyCommand(w, { kind: 'desemneaza', wx: wx + 2, wy: wy + y, z }, R).ok)
  const m = materialAt(w.terrain, wx + 2, wy + 4, g - 3)
  assert.ok(m.ok && m.value !== Material.AER, 'fixtura: golul nu e sapat')
  assert.deepEqual(celuleUsiiPlan(w, R, wx + 2, wy + 4, g - 3)?.map((c) => [c.x - wx, c.y - wy, c.z - g]), [[2, 4, -3], [2, 4, -2]])
})

test('viewer usa: dreptunghiul cu piesa Usa pune golurile intregi, fara dubluri, si spune de ce a sarit restul', () => {
  const lumea: Lumea = {
    solid: () => false, suprafata: () => 0, calcabil: () => true, desemnare: (x, _y, z) => (x === 2 && z === 2 ? 7 : -1), inZona: () => false,
    desemnariIn: () => [], zoneIn: () => [],
    celuleUsii: (x, _y, _z) => (x === 2 ? [{ x: 2, y: 0, z: 1 }, { x: 2, y: 0, z: 2 }] : null),
  }
  const p = planDreptunghi({ x0: 1, y0: 0, x1: 3, y1: 0 }, { unealta: Unealta.CONSTRUIESTE, piesa: Piesa.USA, zonaFel: 0, contur: true, unStrat: false, prioritate: 3, zActiv: 1, inaltimeOm: 2, locDesemnari: 100, locZone: 100 }, lumea)
  assert.deepEqual(p.comenzi.map((c) => (c.kind === 'desemneaza' ? [c.wx, c.z, c.piesa] : null)), [[2, 1, Piesa.USA]])
  assert.equal(p.sarite.deja, 1)
  assert.equal(p.sarite.nepotrivite, 2)
  assert.match(textPlan(p, Unealta.CONSTRUIESTE), /nu e un gol de ușă/)
})

// --- panoul usii ------------------------------------------------------------------------

test('viewer usa: orientarea panoului — in zidul pe x, pe y, si chepengul', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  zidCuGol(w, wx, wy, g, Material.USA)
  assert.equal(orientareUsa(w.terrain, wx + 2, wy + 3, g + 1), 'subtireY')
  assert.equal(orientareUsa(w.terrain, wx + 2, wy + 3, g + 2), 'subtireY', 'jumatatea de sus, fara buiandrug, ramane verticala')
  for (let dy = 0; dy < 5; dy++) for (const z of [g + 1, g + 2]) assert.ok(fill(w.terrain, wx + 8, wy + dy, z, dy === 2 ? Material.USA : P).ok)
  assert.equal(orientareUsa(w.terrain, wx + 8, wy + 2, g + 1), 'subtireX')
  const l = usiDinTeren(w.terrain).map((u) => [u.x - wx, u.y - wy, u.z - g, u.o])
  assert.deepEqual(l.sort(), [[2, 3, 1, 'subtireY'], [2, 3, 2, 'subtireY'], [8, 2, 1, 'subtireX'], [8, 2, 2, 'subtireX']].sort())
})

test('viewer usa (JUC-4): o lovitura in panou tinteste celula usii spre inauntru si aerul din fata spre camera', () => {
  const u = { x: 10, y: 20, z: 5 }
  for (const [o, d] of [['subtireY', { x: 0.2, y: -0.5, z: 1 }], ['subtireY', { x: 0.2, y: -0.5, z: -1 }], ['subtireX', { x: 1, y: -0.3, z: 0.1 }], ['subtireX', { x: -1, y: -0.3, z: 0.1 }], ['orizontala', { x: 0.1, y: -1, z: 0.2 }]] as const) {
    const i = impactPeUsa(7, { x: 10.5, y: 5.5, z: 20.5 }, { ...u, o }, d)
    assert.deepEqual(celulaLangaFata(i, -1), { wx: 10, wy: 20, z: 5 }, `${o} ${JSON.stringify(d)}: celula usii`)
    const fata = celulaLangaFata(i, 1)
    // Aerul din fata e de partea de unde vine raza.
    if (o === 'subtireY') assert.equal(fata.wy, d.z > 0 ? 19 : 21)
    if (o === 'subtireX') assert.equal(fata.wx, d.x > 0 ? 9 : 11)
    if (o === 'orizontala') assert.equal(fata.z, 6)
  }
})

test('viewer usa: mesher-ul nu deseneaza usa ca bloc (panoul e al viewer-ului); piatra da 6 fete', () => {
  const t = createTerrain(4242, 1)
  setFocus(t, 250, 250)
  const x = 250 * 32 + 16, y = 250 * 32 + 16
  const ch = t.chunks.get(chunkKey(250, 250))!
  // Promovat, cu o celula la 20 m deasupra solului, in aer.
  assert.ok(fill(t, x, y, ch.baseM + 60, P).ok)
  const cuPiatra = meshChunk(ch).quadCount
  assert.ok(fill(t, x + 4, y, ch.baseM + 60, Material.USA).ok)
  assert.equal(meshChunk(ch).quadCount, cuPiatra, 'usa plutind in aer n-adauga nicio fata')
  assert.ok(fill(t, x + 8, y, ch.baseM + 60, P).ok)
  assert.equal(meshChunk(ch).quadCount, cuPiatra + 6)
})

// --- overlay-ul incaperilor ------------------------------------------------------------------

test('viewer incaperi: incaperile vecine (de o parte si de alta a unui zid) primesc culori diferite; cele departe pot repeta', () => {
  const comp = (id: number, ancora: number): Componenta => ({ id, ancora, volum: 1, deschise: 0, bucati: [] })
  const a = comp(1, 10), b = comp(2, 20), c = comp(3, 30)
  const celule = [
    { x: 0, y: 0, c: a }, { x: 1, y: 0, c: a },
    { x: 3, y: 0, c: b }, // zid la x=2
    { x: 40, y: 0, c: c },
  ]
  const k = culoriIncaperi(celule)
  assert.notEqual(k.get(1), k.get(2))
  assert.equal(k.get(3), k.get(1), 'departe: aceeasi prima culoare')
})

// --- texte, taste, inspector -------------------------------------------------------------

test('viewer incaperi: textele — incaperea, gaura in acoperis, golul cu usa promisa; locul relativ, nu coordonate', () => {
  assert.equal(textLoc({ x: 0, y: 0, z: 5 }, { x: 3, y: 4, z: 7 }), 'cu 2 m mai sus, la 5 m')
  assert.equal(textLoc({ x: 0, y: 0, z: 5 }, { x: 0, y: 1, z: 5 }), 'chiar aici')
  const c = { x: 0, y: 0, z: 1 }
  const inc = textIncapere({ sub: true, celula: c, e: { fel: 'INCAPERE', volum: 99, ancora: 0, usi: 1, podea: [[1, 23], [4, 23]] } })
  assert.equal(inc.titlu, 'Sub acoperișul ăsta: Încăpere · 99 m³ · 23 m² jos · 23 m² sus · 1 ușă.')
  const sus = textIncapere({ sub: false, celula: c, e: { fel: 'DESCHISA', volum: 18, scurgere: c, dinainte: c, directie: 'SUS', gaura: { x: 2, y: 0, z: 3 }, pasi: 2, usiPropuse: [], volumCuUsi: null } })
  assert.match(sus.titlu, /gaură în acoperiș, cu 2 m mai sus, la 2 m/)
  assert.equal(sus.actiune, 'Pune o podea peste gaură.')
  const gol = textIncapere({ sub: false, celula: c, e: { fel: 'DESCHISA', volum: 20, scurgere: c, dinainte: c, directie: 'LATERAL', gaura: { x: 0, y: 3, z: 1 }, pasi: 3, usiPropuse: [{ x: 0, y: 3, z: 1 }, { x: 0, y: 3, z: 2 }], volumCuUsi: 18 } })
  assert.equal(gol.actiune, 'Pune o ușă în gol (două celule): devine o încăpere de 18 m³.')
})

test('viewer incaperi: tasta I comuta overlay-ul, cu UI si fara', () => {
  for (const mod of ['joc', 'verificare', 'faraUI'] as const) {
    const o = actiuneTasta({ key: 'i', ctrl: false, shift: false, alt: false, meta: false, editabil: false, compunere: false, modal: false, mod, amprenta: false })
    assert.equal(o.actiune, 'overlayI', mod)
  }
})

test('viewer incaperi (JUC-7): un clic pe acoperisul unei case raspunde despre incaperea de sub el', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    assert.ok(fill(w.terrain, wx + dx, wy + dy, z, dx === 2 && dy === 0 ? Material.USA : P).ok)
  }
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(w.terrain, wx + dx, wy + dy, g + 3, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const pe = incaperea(w, wx + 2, wy + 2, g + 3)
  assert.ok(pe && pe.sub && pe.e.fel === 'INCAPERE' && pe.e.volum === 18, JSON.stringify(pe))
  const inauntru = incaperea(w, wx + 2, wy + 2, g)
  assert.ok(inauntru && !inauntru.sub && inauntru.e.fel === 'INCAPERE')
  assert.equal(incaperea(w, wx + 7, wy + 7, g), null, 'afara: nimic acoperit')
})
