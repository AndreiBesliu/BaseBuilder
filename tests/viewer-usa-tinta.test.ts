/**
 * Unealta Usa si inspectorul, pe partile pure (recenzia pe ecran a incaperilor, ECR-1/5/6/8, si recenzia
 * explicatiei, EXP-6): golul tintit PRIN raza, dreptunghiul fara nivel sub acoperis, usa retrasa intreaga,
 * panoul de sus zidit singur, inspectorul care intreaba aerul din fata fetei atinse.
 *
 * Raza si impacturile se construiesc aici, pe voxeli: mesh-ul viewer-ului da, pe fete de voxel, exact
 * primul solid atins de raza (usa nu e in mesh: e un panou al viewer-ului).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { sincronizeazaCamere } from '../src/sim/camere.ts'
import { desemnareLaCelula } from '../src/sim/desemnari.ts'
import { Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { isSolid, Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill, groundLevelM, materialAt } from '../src/sim/terrain/terrain.ts'
import { alegeTinta, normalaLumii } from '../viewer/tinta.ts'
import type { Impact, Raza } from '../viewer/tinta.ts'
import { actualizeazaUsiPeChunk, celuleUsiiInPlan, celuleUsiiPlan, golulTintit, grupUsa, orientareUsa, toateUsile, usiDinTeren, usiPeChunkNoi } from '../viewer/usi.ts'
import { golulColoanei, planDreptunghi, Unealta } from '../viewer/ui/dreptunghi.ts'
import type { Lumea } from '../viewer/ui/dreptunghi.ts'
import { incaperea } from '../viewer/ui/model.ts'
import { textIncapere } from '../viewer/ui/texte.ts'
import { R, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

/**
 * Casa `latura`×`latura` (colturi (x0, y0)…), pereti pe [g+1, g+2], acoperis pe g+3 (daca `acoperis`).
 * `gol(i, j, z)` spune ce e in peretele de la (i, j): null = zid, 'aer' = gol, 'usa' = usa zidita.
 */
function casa(w: World, x0: number, y0: number, g: number, latura: number, gol: (i: number, j: number, z: number) => 'aer' | 'usa' | null, acoperis = true): void {
  const n = latura - 1
  for (let z = g + 1; z <= g + 2; z++) for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    if (i !== 0 && i !== n && j !== 0 && j !== n) continue
    const c = gol(i, j, z)
    if (c === 'aer') continue
    assert.ok(fill(w.terrain, x0 + i, y0 + j, z, c === 'usa' ? Material.USA : P).ok)
  }
  if (acoperis) for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) assert.ok(fill(w.terrain, x0 + i, y0 + j, g + 3, P).ok)
}

/** Raza camerei spre punctul `p` al scenei (x = wx, y = cota, z = wy), de la sud (wy mic), la elevatia `el`°. */
function razaSpre(p: { x: number; y: number; z: number }, el: number, dist = 18, az = 0): Raza {
  const e = (el * Math.PI) / 180, a = (az * Math.PI) / 180
  const o = { x: p.x + dist * Math.sin(a) * Math.cos(e), y: p.y + dist * Math.sin(e), z: p.z - dist * Math.cos(a) * Math.cos(e) }
  const d = { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z }
  const l = Math.hypot(d.x, d.y, d.z)
  return { o, d: { x: d.x / l, y: d.y / l, z: d.z / l } }
}

/** Primul solid atins de raza, ca impact pe fata lui (ce da raycast-ul pe mesh-ul de voxeli). Usa nu e in mesh. */
function impacturiVoxel(w: World, r: Raza, tMax = 200): Impact[] {
  const { o, d } = r
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z)
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z)
  const urm = (p: number, s: number, dd: number): number => (dd === 0 ? Infinity : (s > 0 ? Math.floor(p) + 1 - p : p - Math.floor(p)) / Math.abs(dd))
  let tx = urm(o.x, sx, d.x), ty = urm(o.y, sy, d.y), tz = urm(o.z, sz, d.z)
  let t = 0
  let n = { x: 0, y: 1, z: 0 }
  while (t <= tMax) {
    const m = materialAt(w.terrain, x, z, y)
    if (m.ok && isSolid(m.value) && m.value !== Material.USA) return [{ t, p: { x: o.x + t * d.x, y: o.y + t * d.y, z: o.z + t * d.z }, n }]
    if (tx <= ty && tx <= tz) { t = tx; x += sx; tx += 1 / Math.abs(d.x); n = { x: -sx, y: 0, z: 0 } } else if (ty <= tz) { t = ty; y += sy; ty += 1 / Math.abs(d.y); n = { x: 0, y: -sy, z: 0 } } else { t = tz; z += sz; tz += 1 / Math.abs(d.z); n = { x: 0, y: 0, z: -sz } }
  }
  return []
}

/** Ce face clicul Usa la raza data: tinta generica a piesei, apoi golul tintit (exact lantul din main.ts). */
function tintesteUsa(w: World, r: Raza, slice: number | null = null, impacturi = impacturiVoxel(w, r)) {
  const zActiv = slice === null ? 0 : slice - 1
  const t = alegeTinta({
    mod: 'piesa', raza: r, impacturi, slice, cuburi: [], departeMax: 150,
    desemnataPeNivel: (wx, wy) => desemnareLaCelula(w.desemnari, wx, wy, zActiv) !== -1,
    plinaPeNivel: (wx, wy) => { const m = materialAt(w.terrain, wx, wy, zActiv); return m.ok && isSolid(m.value) },
  })
  const generic = t.ok ? celuleUsiiPlan(w, R, t.wx, t.wy, t.z) : null
  const gol = golulTintit({ raza: r, impacturi, slice, departeMax: 150, tinta: t.ok ? t : null, celuleUsii: celuleUsiiInPlan(w, R) })
  return { t, generic, gol }
}

const rel = (u: readonly { x: number; y: number; z: number }[] | null, x0: number, y0: number, g: number) => u?.map((c) => [c.x - x0, c.y - y0, c.z - g]) ?? null

// --- ECR-1: golul vazut prin raza ----------------------------------------------------------------

test('usa pe ecran (ECR-1): raza prin mijlocul golului acoperit tinteste golul, nu podeaua camerei de dincolo', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g, 5, (i, j) => (i === 2 && j === 0 ? 'aer' : null))
  // (La 50° raza prin centru cade pe prag, deja in gol: acolo tinta generica era buna si inainte.)
  for (const el of [20, 35]) {
    const r = razaSpre({ x: wx + 2.5, y: g + 2, z: wy }, el)
    const { t, generic, gol } = tintesteUsa(w, r)
    // Controlul scenei: tinta generica e in camera (aerul de deasupra podelei), nu in gol — defectul de azi.
    assert.ok(t.ok && t.wy > wy && generic === null, `el ${el}: tinta generica ${JSON.stringify(t)} → ${JSON.stringify(generic)}`)
    assert.deepEqual(rel(gol, wx, wy, g), [[2, 0, 1], [2, 0, 2]], `el ${el}: usa intreaga, in gol`)
  }
})

test('usa pe ecran (ECR-1): pe peretele plin nu e niciun gol — si nici golul din peretele din spate, dincolo de impact', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  // Zidul din fata plin, golul in peretele din spate (j = 4), pe aceeasi coloana.
  casa(w, wx, wy, g, 5, (i, j) => (i === 2 && j === 4 ? 'aer' : null))
  // Raza aproape orizontala spre zidul din fata: dincolo de el, ar trece prin golul din spate.
  const r = razaSpre({ x: wx + 2.5, y: g + 2.5, z: wy }, 10)
  const prinZid = golulTintit({ raza: r, impacturi: [], slice: null, departeMax: 150, tinta: null, celuleUsii: celuleUsiiInPlan(w, R) })
  assert.deepEqual(rel(prinZid, wx, wy, g), [[2, 4, 1], [2, 4, 2]], 'controlul: fara impact, raza ar ajunge la golul din spate')
  const { gol } = tintesteUsa(w, r)
  assert.equal(gol, null, 'zidul se vede: niciun gol')
  // Si pe solul din fata casei: nimic.
  assert.equal(tintesteUsa(w, razaSpre({ x: wx + 2.5, y: g + 1, z: wy - 2 }, 35)).gol, null, 'sol deschis')
})

test('usa pe ecran (ECR-1): golul unui zid DOAR planificat se tinteste prin mijloc', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  for (let z = g + 1; z <= g + 2; z++) for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    if ((i !== 0 && i !== 4 && j !== 0 && j !== 4) || (i === 2 && j === 0)) continue
    assert.ok(applyCommand(w, { kind: 'desemneaza', wx: wx + i, wy: wy + j, z, piesa: Piesa.PERETE }, R).ok)
  }
  const r = razaSpre({ x: wx + 2.5, y: g + 2, z: wy }, 35)
  const { generic, gol } = tintesteUsa(w, r)
  assert.equal(generic, null, 'controlul: tinta generica e podeaua din spatele golului')
  assert.deepEqual(rel(gol, wx, wy, g), [[2, 0, 1], [2, 0, 2]])
})

test('usa pe ecran (ECR-1): raza care nu atinge nimic prin gol (crapatura, cer) tot golul il gaseste', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g, 5, (i, j) => (i === 2 && j === 0 ? 'aer' : null))
  const r = razaSpre({ x: wx + 2.5, y: g + 2, z: wy }, 35)
  const { t, gol } = tintesteUsa(w, r, null, [])
  assert.ok(!t.ok, 'fara impact, tinta generica spune „nimic sub cursor"')
  assert.deepEqual(rel(gol, wx, wy, g), [[2, 0, 1], [2, 0, 2]])
})

test('usa pe ecran (ECR-1): cu nivelul pornit, doar golurile de la nivelul activ in jos', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g, 5, (i, j) => (i === 2 && j === 0 ? 'aer' : null))
  const r = razaSpre({ x: wx + 2.5, y: g + 1.8, z: wy }, 35)
  // Nivelul activ g+1 (slice g+2): golul incepe acolo. Controlul: coloana nivelului e in camera, dincolo
  // de gol (verificatorul: la 35° frontal, cu nivelul pornit, 29 % din pixelii golului erau refuzati).
  const cuNivel = tintesteUsa(w, r, g + 2)
  assert.ok(cuNivel.t.ok && cuNivel.t.wy > wy && cuNivel.generic === null, JSON.stringify(cuNivel.t))
  assert.deepEqual(rel(cuNivel.gol, wx, wy, g), [[2, 0, 1], [2, 0, 2]])
  // Nivelul activ g (solul): golul e deasupra planului de taiere, nu se vede.
  assert.equal(tintesteUsa(w, r, g + 1).gol, null)
})

// --- ECR-5: dreptunghiul fara nivel -----------------------------------------------------------------

function lumeaTerenului(w: World): Lumea {
  const solid = (x: number, y: number, z: number): boolean => { const m = materialAt(w.terrain, x, y, z); return m.ok && isSolid(m.value) }
  return {
    solid,
    suprafata: (x, y) => { for (let z = 200; z > -200; z--) if (solid(x, y, z)) return z; return null },
    calcabil: () => false,
    desemnare: (x, y, z) => { const s = desemnareLaCelula(w.desemnari, x, y, z); return s === -1 ? -1 : w.desemnari.id[s]! },
    inZona: () => false, desemnariIn: () => [], zoneIn: () => [],
    celuleUsii: (x, y, z) => celuleUsiiPlan(w, R, x, y, z),
  }
}

test('usa pe ecran (ECR-5): dreptunghiul Usa FARA nivel pune usa in golul de sub acoperis', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g, 5, (i, j) => (i === 2 && j === 0 ? 'aer' : null))
  // Din fata casei pana pe acoperis, peste coloana golului.
  const p = planDreptunghi({ x0: wx + 1, y0: wy - 2, x1: wx + 3, y1: wy + 1 }, { unealta: Unealta.CONSTRUIESTE, piesa: Piesa.USA, zonaFel: 0, contur: true, unStrat: false, prioritate: 3, zActiv: null, inaltimeOm: 2, locDesemnari: 100, locZone: 100 }, lumeaTerenului(w))
  assert.deepEqual(p.comenzi.map((c) => (c.kind === 'desemneaza' ? [c.wx - wx, c.wy - wy, c.z - g, c.piesa] : null)), [[2, 0, 1, Piesa.USA], [2, 0, 2, Piesa.USA]])
  assert.equal(p.sarite.nepotrivite, 11, 'celelalte 11 coloane n-au gol')
  // Pe suprafata (zidul doar desenat pe teren gol) ramane ca inainte: aerul de deasupra solului.
  assert.equal(golulColoanei(lumeaTerenului(w), wx + 2, wy - 1), null, 'solul din fata casei: nimic')
})

// --- ECR-6: usa se retrage intreaga ---------------------------------------------------------------

test('usa pe ecran (ECR-6): „Anulează" pe un cub al usii ia toata usa — grupul legat de desemnari USA, nu vecinii in diagonala', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g, 5, (i, j) => (i === 2 && j === 0 ? 'aer' : null))
  casa(w, wx + 6, wy, g, 5, (i, j) => (i === 2 && j === 0 ? 'aer' : null))
  for (const [x, y] of [[wx + 2, wy], [wx + 8, wy]]) {
    for (const c of celuleUsiiPlan(w, R, x, y, g + 1)!) assert.ok(applyCommand(w, { kind: 'desemneaza', wx: c.x, wy: c.y, z: c.z, piesa: Piesa.USA }, R).ok)
  }
  const esteUsa = (x: number, y: number, z: number): boolean => { const s = desemnareLaCelula(w.desemnari, x, y, z); return s !== -1 && w.desemnari.piesa[s] === Piesa.USA }
  assert.deepEqual(rel(grupUsa(esteUsa, wx + 2, wy, g + 2), wx, wy, g), [[2, 0, 1], [2, 0, 2]], 'de pe cubul de sus: toata usa, nu si a casei vecine')
  assert.deepEqual(rel(grupUsa(esteUsa, wx + 2, wy, g + 1), wx, wy, g), [[2, 0, 1], [2, 0, 2]])
  assert.deepEqual(grupUsa(esteUsa, wx + 2, wy + 2, g + 1), [], 'fara usa: nimic')
  // O usa lata de 2 e o singura usa; doua cuburi atinse doar pe muchie nu.
  const set = new Set(['0,0,0', '1,0,0', '0,0,1', '1,0,1', '2,1,2'])
  assert.equal(grupUsa((x, y, z) => set.has(`${x},${y},${z}`), 1, 0, 1).length, 4)
})

// --- ECR-8: panoul de sus zidit singur ---------------------------------------------------------------

test('usa pe ecran (ECR-8): usa de sus zidita singura, fara buiandrug, sta in perete (nu chepeng); chepengul peste un coridor ramane orizontal', () => {
  const { w, wx, wy, g } = sitPlat(12345, 16)
  // Casa C (s8.mjs): fara acoperis, doar jumatatea de sus a usii zidita.
  casa(w, wx, wy, g, 5, (i, j, z) => (i === 2 && j === 0 ? (z === g + 2 ? 'usa' : 'aer') : null), false)
  assert.equal(orientareUsa(w.terrain, wx + 2, wy, g + 2), 'subtireY', 'in zidul pe x')
  // Usa de 1 m intr-un zid de 1 m (pe y).
  for (let j = 0; j < 5; j++) assert.ok(fill(w.terrain, wx + 8, wy + j, g + 1, j === 2 ? Material.USA : P).ok)
  assert.equal(orientareUsa(w.terrain, wx + 8, wy + 2, g + 1), 'subtireX')
  // Usa lata de 2, doar randul de sus zidit.
  for (let i = 0; i < 6; i++) for (const z of [g + 1, g + 2]) {
    if (i === 2 || i === 3) { if (z === g + 2) assert.ok(fill(w.terrain, wx + i, wy + 8, z, Material.USA).ok); continue }
    assert.ok(fill(w.terrain, wx + i, wy + 8, z, P).ok)
  }
  assert.equal(orientareUsa(w.terrain, wx + 2, wy + 8, g + 2), 'subtireY')
  assert.equal(orientareUsa(w.terrain, wx + 3, wy + 8, g + 2), 'subtireY')
  // Controlul: gaura unei placi peste un coridor lat de 1 (ziduri sub placa, pe ambele laturi).
  for (let j = 0; j < 5; j++) for (const z of [g + 1, g + 2]) for (const i of [11, 13]) assert.ok(fill(w.terrain, wx + i, wy + j, z, P).ok)
  for (let i = 10; i <= 14; i++) for (let j = 0; j < 5; j++) assert.ok(fill(w.terrain, wx + i, wy + j, g + 3, i === 12 && j === 2 ? Material.USA : P).ok)
  assert.equal(orientareUsa(w.terrain, wx + 12, wy + 2, g + 3), 'orizontala')
  // Si gaura dintr-o pasarela lata de 1 (aer de o parte si de alta, aer sub placa): chepeng, nu zid.
  for (const i of [0, 4]) for (const z of [g + 1, g + 2]) assert.ok(fill(w.terrain, wx + i, wy + 12, z, P).ok)
  for (let i = 0; i <= 4; i++) assert.ok(fill(w.terrain, wx + i, wy + 12, g + 3, i === 2 ? Material.USA : P).ok)
  assert.equal(orientareUsa(w.terrain, wx + 2, wy + 12, g + 3), 'orizontala')
})

// --- ECR-11: stratul usilor, refacut doar unde a scris jurnalul ------------------------------------

test('usa pe ecran (ECR-11): usile pe chunk, din jurnal, sunt exact usiDinTeren — si peste granita de chunk; o editare departe scaneaza cel mult 4 chunk-uri', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const t = w.terrain
  const u = usiPeChunkNoi()
  const la = (): void => { actualizeazaUsiPeChunk(u, t); assert.deepEqual(toateUsile(u), usiDinTeren(t)) }
  la()
  // Usa de 2 m pe ultima coloana a unui chunk (lx = 31), in zidul pe y: panoul sta in planul wx.
  const bx = (Math.floor(wx / 32) + 1) * 32 - 1
  for (const z of [g + 1, g + 2]) for (const [dy, m] of [[-1, P], [0, Material.USA], [1, P]] as const) assert.ok(fill(t, bx, wy + 3 + dy, z, m).ok)
  la()
  const jos = (): string | undefined => toateUsile(u).find((d) => d.x === bx && d.z === g + 1)?.o
  assert.equal(jos(), 'subtireX')
  // Plin pe x de o parte si de alta: panoul de jos se intoarce in planul wy. Al doilea plin e in chunk-ul
  // VECIN (lx = 0): numai jurnalul lui il atinge.
  assert.ok(fill(t, bx - 1, wy + 3, g + 1, P).ok)
  la()
  assert.equal(jos(), 'subtireX')
  assert.ok(fill(t, bx + 1, wy + 3, g + 1, P).ok)
  la()
  assert.equal(jos(), 'subtireY', 'usa s-a reorientat dupa o editare de dincolo de granita')
  // Editari pseudo-aleatoare (usi, pereti, sapaturi), cate 1–5 intre actualizari.
  let s = 7
  const rnd = (n: number): number => { s = (s * 1103515245 + 12345) % 2147483648; return s % n }
  for (let pas = 0; pas < 60; pas++) {
    for (let k = rnd(5); k >= 0; k--) {
      const x = bx - 3 + rnd(7), y = wy + rnd(6), z = g + 1 + rnd(3)
      const r = rnd(3)
      if (r === 2) applyCommand(w, { kind: 'dig', wx: x, wy: y, z }, R)
      else fill(t, x, y, z, r === 0 ? Material.USA : P)
    }
    la()
  }
  assert.ok(toateUsile(u).length > 0, 'fixtura are usi')
  // Toate usile sapate: chunk-urile ramase fara usi nu-si pastreaza usile vechi.
  for (const d of toateUsile(u)) assert.ok(dig(t, d.x, d.y, d.z).ok)
  la()
  assert.equal(toateUsile(u).length, 0)
  // O editare departe de usi: se scaneaza chunk-ul ei (si vecinii de pe granita), nu toata lumea.
  const departe = { x: wx + 70, y: wy + 70 }
  const gd = groundLevelM(t, departe.x, departe.y)
  assert.ok(gd.ok && fill(t, departe.x, departe.y, gd.value + 1, P).ok)
  const scanate = actualizeazaUsiPeChunk(u, t)
  assert.ok(scanate !== null && scanate <= 4 && t.keys.length > 4, `scanate ${scanate} din ${t.keys.length}`)
  assert.deepEqual(toateUsile(u), usiDinTeren(t))
})

// --- EXP-6: inspectorul intreaba aerul din fata fetei atinse ----------------------------------------

/** Casa 7×7 inchisa, cu usa zidita la (3, 0): o incapere de 5×5×2 = 50 m³. */
function casa7(): { w: World; wx: number; wy: number; g: number } {
  const s = sitPlat(12345, 12)
  casa(s.w, s.wx, s.wy, s.g, 7, (i, j) => (i === 3 && j === 0 ? 'usa' : null))
  sincronizeazaCamere(s.w.camere, s.w.terrain)
  return s
}

test('inspector (EXP-6): clic pe fata interioara a unui zid si pe panoul usii → „Încăpere · 50 m³"', () => {
  const { w, wx, wy, g } = casa7()
  const zid = incaperea(w, wx + 1, wy, g + 1, { x: 0, y: 1, z: 0 })
  assert.ok(zid && !zid.sub && zid.e.fel === 'INCAPERE', JSON.stringify(zid))
  assert.match(textIncapere(zid).titlu, /^Încăpere · 50 m³/)
  // Panoul usii, atins din afara: in fata e cerul liber; incaperea e in spatele lui.
  const usa = incaperea(w, wx + 3, wy, g + 2, { x: 0, y: -1, z: 0 })
  assert.ok(usa && usa.e.fel === 'INCAPERE' && usa.e.volum === 50, JSON.stringify(usa))
  // Fara normala (alertele): toate cele 48 de celule de zid si usa din inel.
  let bune = 0
  for (let z = g + 1; z <= g + 2; z++) for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
    if (i !== 0 && i !== 6 && j !== 0 && j !== 6) continue
    const r = incaperea(w, wx + i, wy + j, z)
    if (r && r.e.fel === 'INCAPERE' && r.e.volum === 50) bune++
  }
  assert.equal(bune, 48)
})

test('inspector (EXP-6): un zid intre doua incaperi raspunde despre cea din FATA fetei atinse', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g, 7, () => null)
  // Zid despartitor la i = 2: A = coloana i 1 (1×5×2 = 10 m³), B = i 3..5 (3×5×2 = 30 m³).
  for (let j = 1; j <= 5; j++) for (const z of [g + 1, g + 2]) assert.ok(fill(w.terrain, wx + 2, wy + j, z, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const spreA = incaperea(w, wx + 2, wy + 3, g + 1, { x: -1, y: 0, z: 0 })
  const spreB = incaperea(w, wx + 2, wy + 3, g + 1, { x: 1, y: 0, z: 0 })
  assert.ok(spreA?.e.fel === 'INCAPERE' && spreA.e.volum === 10, JSON.stringify(spreA))
  assert.ok(spreB?.e.fel === 'INCAPERE' && spreB.e.volum === 30, JSON.stringify(spreB))
})

test('inspector (EXP-6): pe un acoperis gros de 2 m, clicul de sus raspunde despre incaperea de dedesubt', () => {
  const { w, wx, wy, g } = casa7()
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) assert.ok(fill(w.terrain, wx + i, wy + j, g + 4, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  for (const n of [{ x: 0, y: 0, z: 1 }, null]) {
    const r = incaperea(w, wx + 3, wy + 3, g + 4, n)
    assert.ok(r && r.sub && r.e.fel === 'INCAPERE' && r.e.volum === 50, `${JSON.stringify(n)}: ${JSON.stringify(r)}`)
  }
  assert.equal(incaperea(w, wx + 10, wy + 10, g), null, 'afara: nimic acoperit')
})

test('inspector (EXP-6): tinta de inspectie poarta normala fetei, in coordonatele lumii', () => {
  // Scena: x = wx, y = cota, z = wy. O fata laterala spre -wy, una de sus, una spre +wx.
  assert.deepEqual(normalaLumii({ t: 1, p: { x: 0, y: 0, z: 0 }, n: { x: 0, y: 0, z: -1 } }), { x: 0, y: -1, z: 0 })
  assert.deepEqual(normalaLumii({ t: 1, p: { x: 0, y: 0, z: 0 }, n: { x: 0.1, y: 0.9, z: 0.2 } }), { x: 0, y: 0, z: 1 })
  assert.deepEqual(normalaLumii({ t: 1, p: { x: 0, y: 0, z: 0 }, n: { x: 1, y: 0, z: 0 } }), { x: 1, y: 0, z: 0 })
  const raza: Raza = { o: { x: 10.5, y: 5.5, z: 0 }, d: { x: 0, y: 0, z: 1 } }
  const t = alegeTinta({ mod: 'inspecteaza', raza, impacturi: [{ t: 20, p: { x: 10.5, y: 5.5, z: 20 }, n: { x: 0, y: 0, z: -1 } }], slice: null, cuburi: [], departeMax: 150, desemnataPeNivel: () => false, plinaPeNivel: () => false })
  assert.ok(t.ok && t.wx === 10 && t.wy === 20 && t.z === 5, JSON.stringify(t))
  assert.deepEqual(t.ok ? t.n : null, { x: 0, y: -1, z: 0 })
})
