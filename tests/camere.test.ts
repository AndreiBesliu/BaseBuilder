/**
 * Încăperile — S24-27, tăietura 1: indexul pe bucăți (src/sim/camere.ts).
 *
 * Oracolul oricărei implementări: incremental == recalcul complet, pe aceeași lume. Fuzz-ul are patru
 * cutii, fiecare pentru o capcană găsită de panoul pe v1: uscat (încăperile-fantomă după umpleri
 * complete, DEF-1 — 30/30 runde roșii pe v1), colțul a patru chunk-uri cu ferestre diferite, baza
 * ferestrei (sub ea e stâncă, nu aer) și un iaz (apa acoperă, DEF-2 — o cutie uscată e oarbă la el).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  celuleComponentei,
  cititorCamere,
  componentaLa,
  construiesteCamere,
  esteAcoperita,
  esteAer,
  esteIncapere,
  formaCanonica,
  listaComponente,
  sincronizeazaCamere,
} from '../src/sim/camere.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { decode, encode } from '../src/sim/save.ts'
import type { World } from '../src/sim/state.ts'
import { Faction, Item } from '../src/sim/state.ts'
import { CHUNK_CELLS, Material, VOXEL_LEVELS } from '../src/sim/terrain/chunk.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { bazaVoxeli, dig, fill, groundLevelM, JURNAL_CAP, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { createWorld, tick } from '../src/sim/world.ts'
import { runScenario, standardScenario } from '../src/harness/scenario.ts'
import { lasaItem, R, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

/** Inelul de ziduri L×L pe [g+1, g+H] și acoperișul la g+H+1, zidite direct în teren. */
function casa(t: Terrain, x0: number, y0: number, g: number, L: number, H: number, goluri: readonly (readonly [number, number, number])[] = []): void {
  for (let z = g + 1; z <= g + H; z++) {
    for (let dx = 0; dx < L; dx++) {
      for (let dy = 0; dy < L; dy++) {
        if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
        if (goluri.some(([a, b, c]) => a === dx && b === dy && c === z - g)) continue
        assert.ok(fill(t, x0 + dx, y0 + dy, z, P).ok)
      }
    }
  }
  for (let dx = 0; dx < L; dx++) {
    for (let dy = 0; dy < L; dy++) {
      if (goluri.some(([a, b, c]) => a === dx && b === dy && c === H + 1)) continue
      assert.ok(fill(t, x0 + dx, y0 + dy, g + H + 1, P).ok)
    }
  }
}

function egalCuRecalculul(w: World, mesaj: string): void {
  assert.deepEqual(formaCanonica(w.camere), formaCanonica(construiesteCamere(w.terrain)), mesaj)
}

// --- definiția ---------------------------------------------------------------

test('o casa inchisa de 5x5 cu ziduri de 2 m e O incapere de 18 m3, sigilata; peretele interior nu conteaza', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  casa(w.terrain, wx, wy, g, 5, 2)
  sincronizeazaCamere(w.camere, w.terrain)
  const l = listaComponente(w.camere)
  assert.equal(l.length, 1)
  assert.equal(l[0]!.volum, 3 * 3 * 2)
  assert.ok(esteIncapere(l[0]!))
  assert.equal(componentaLa(w.camere, wx + 2, wy + 2, g + 1)?.ancora, l[0]!.ancora)
  assert.equal(componentaLa(w.camere, wx + 2, wy + 2, g + 3), null, 'deasupra acoperisului e cer')
  egalCuRecalculul(w, 'casa')
})

test('o gaura in acoperis sau un gol in perete: aerul e acoperit, dar componenta NU e incapere', () => {
  for (const gol of [[2, 2, 3], [2, 0, 1]] as const) {
    const { w, wx, wy, g } = sitPlat(12345, 8)
    casa(w.terrain, wx, wy, g, 5, 2, [gol])
    sincronizeazaCamere(w.camere, w.terrain)
    const c = componentaLa(w.camere, wx + 1, wy + 1, g + 1)
    assert.ok(c, `gol ${gol}: celula interioara e aer acoperit`)
    assert.ok(!esteIncapere(c!), `gol ${gol}: nu e incapere`)
    assert.ok(c!.deschise > 0)
    egalCuRecalculul(w, `gol ${gol}`)
  }
})

test('un colt de zid lipsa NU deschide incaperea: 6-conexitate, diagonalele nu scurg', () => {
  const { w, wx, wy, g } = sitPlat(777, 8)
  casa(w.terrain, wx, wy, g, 5, 2, [[0, 0, 1], [0, 0, 2]])
  sincronizeazaCamere(w.camere, w.terrain)
  const c = componentaLa(w.camere, wx + 2, wy + 2, g + 1)
  assert.ok(c && esteIncapere(c), 'coltul lipsa e aer sub acoperis, dar e legat de interior doar pe diagonala')
  assert.equal(c!.volum, 18)
})

test('fetele deschise sunt numai laterale: nicio celula acoperita n-are cer deasupra sau dedesubt', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  casa(w.terrain, wx, wy, g, 6, 3, [[2, 2, 4], [3, 3, 4], [0, 2, 1], [0, 2, 2]])
  sincronizeazaCamere(w.camere, w.terrain)
  const r = cititorCamere(w.terrain)
  let verificate = 0
  for (const c of listaComponente(w.camere)) {
    for (const k of celuleComponentei(w.camere, c)) {
      const x = k % WORLD_CELLS, rr = (k - x) / WORLD_CELLS, y = rr % WORLD_CELLS, z = (rr - y) / WORLD_CELLS - 512
      for (const dz of [1, -1]) {
        if (esteAer(r, x, y, z + dz)) assert.ok(esteAcoperita(r, x, y, z + dz), `(${x},${y},${z + dz}) e cer deasupra/dedesubtul unei celule acoperite`)
      }
      verificate++
    }
  }
  assert.ok(verificate > 40, `vidă: ${verificate} celule`)
})

test('sub baza ferestrei e stanca: o pivnita sapata pana la baza e sigilata, nu curge in jos', () => {
  const { w, wx, wy, g } = sitPlat(4242, 6)
  const baza = bazaVoxeli(w.terrain, wx + 2, wy + 2)
  // O cavitate 3x3x2 chiar pe nivelul bazei, cu toata roca de deasupra.
  for (let z = baza; z <= baza + 1; z++) for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) assert.ok(dig(w.terrain, wx + dx, wy + dy, z).ok)
  assert.ok(g > baza + 5)
  sincronizeazaCamere(w.camere, w.terrain)
  const c = componentaLa(w.camere, wx + 2, wy + 2, baza)
  assert.ok(c && esteIncapere(c), 'cavitatea de la baza ferestrei e o incapere')
  assert.equal(c!.volum, 18)
  egalCuRecalculul(w, 'baza')
})

test('peste fereastra de voxeli e aer si e cer: acoperirea se masoara de la cel mai inalt hotar din fereastra', () => {
  const { w, wx, wy } = sitPlat(12345, 4)
  const r = cititorCamere(w.terrain)
  const baza = bazaVoxeli(w.terrain, wx, wy)
  const sus = baza + VOXEL_LEVELS
  assert.ok(esteAer(r, wx, wy, sus + 3))
  assert.ok(!esteAcoperita(r, wx, wy, sus + 3))
  assert.ok(!esteAer(r, wx, wy, baza - 1), 'sub baza: stanca')
  assert.ok(!esteAer(r, -1, wy, 0), 'in afara lumii: stanca')
})

/** Un iaz: o celula de APA la suprafata, cu mal uscat la cel mult 3 celule. */
function gasesteIaz(w: World): { x: number; y: number; g: number } {
  for (let k = 1; k <= 40000; k++) {
    const x = (k * 2311 + 97) % WORLD_CELLS
    const y = (k * 5003 + 13) % WORLD_CELLS
    const g = groundLevelM(w.terrain, x, y)
    if (!g.ok) continue
    const m = materialAt(w.terrain, x, y, g.value)
    if (!m.ok || m.value !== Material.APA) continue
    const mal = materialAt(w.terrain, x + 3, y, g.value)
    if (mal.ok && mal.value !== Material.APA) return { x, y, g: g.value }
  }
  assert.fail('niciun iaz')
}

test('APA acopera (DEF-2): tunelul sapat sub un iaz e aer acoperit, iar un pod peste iaz inchide aerul de deasupra apei', () => {
  const w = createWorld(12345)
  const { x, y, g } = gasesteIaz(w)
  // Sub apa: PAMANT la g-1. Sapat din lateral, sub iaz.
  assert.ok(dig(w.terrain, x, y, g - 1).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const r = cititorCamere(w.terrain)
  assert.ok(esteAcoperita(r, x, y, g - 1), 'aerul de sub apa e acoperit (varful coloanei e apa)')
  assert.ok(componentaLa(w.camere, x, y, g - 1), 'si e in index')
  // Podul peste apa (doua niveluri mai sus) acopera celula de deasupra apei.
  assert.ok(fill(w.terrain, x, y, g + 2, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.ok(componentaLa(w.camere, x, y, g + 1), 'aerul dintre apa si pod e acoperit')
  egalCuRecalculul(w, 'iazul')
})

// --- oracolul ----------------------------------------------------------------

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

interface Cutie { x0: number; y0: number; z0: number; X: number; Y: number; Z: number }

/**
 * Editari aleatoare in cutie, in loturi de 1..4, cu sincronizare dupa fiecare lot si comparatie cu
 * recalculul complet. Umplerile cad si pe aer acoperit izolat (celula unica a unei incaperi) — fara
 * ele fuzz-ul nu vede fantomele (panoul: 0/30 fara umpleri complete, 30/30 cu).
 */
function fuzz(w: World, c: Cutie, pasi: number, seed: number, eticheta: string): { comparatii: number; incaperiVazute: number } {
  const rnd = lcg(seed)
  let comparatii = 0
  let incaperiVazute = 0
  for (let p = 0; p < pasi; ) {
    const lot = 1 + Math.floor(rnd() * 4)
    for (let i = 0; i < lot; i++, p++) {
      const x = c.x0 + Math.floor(rnd() * c.X)
      const y = c.y0 + Math.floor(rnd() * c.Y)
      const z = c.z0 + Math.floor(rnd() * c.Z)
      const m = materialAt(w.terrain, x, y, z)
      if (!m.ok) continue
      if (m.value === Material.AER) fill(w.terrain, x, y, z, P)
      else if (m.value !== Material.APA) dig(w.terrain, x, y, z)
      else if (rnd() < 0.5) fill(w.terrain, x, y, z, P)
    }
    sincronizeazaCamere(w.camere, w.terrain)
    egalCuRecalculul(w, `${eticheta}: pasul ${p}`)
    comparatii++
    for (const k of listaComponente(w.camere)) if (esteIncapere(k)) incaperiVazute++
  }
  return { comparatii, incaperiVazute }
}

test('ORACOL: incremental == recalcul complet, fuzz pe uscat cu umpleri complete (3 seminte)', () => {
  for (const seed of [12345, 777, 4242]) {
    const { w, wx, wy, g } = sitPlat(seed, 10)
    const r = fuzz(w, { x0: wx + 1, y0: wy + 1, z0: g - 2, X: 7, Y: 7, Z: 6 }, 400, seed, `uscat ${seed}`)
    assert.ok(r.incaperiVazute > 20, `seed ${seed}: fuzz-ul n-a produs incaperi (${r.incaperiVazute}) — oracol vid`)
  }
})

test('ORACOL: pe coltul a patru chunk-uri cu ferestre de voxeli diferite', () => {
  const w = createWorld(12345)
  let gasit: { x: number; y: number; g: number } | null = null
  for (let k = 1; k <= 20000 && !gasit; k++) {
    const cx = 10 + ((k * 37) % 480)
    const cy = 10 + ((k * 91) % 480)
    const x = cx * CHUNK_CELLS
    const y = cy * CHUNK_CELLS
    const baze = new Set([bazaVoxeli(w.terrain, x - 1, y - 1), bazaVoxeli(w.terrain, x, y - 1), bazaVoxeli(w.terrain, x - 1, y), bazaVoxeli(w.terrain, x, y)])
    if (baze.size < 3) continue
    const g0 = groundLevelM(w.terrain, x, y)
    if (!g0.ok) continue
    let ok = true
    for (let dx = -4; dx <= 3 && ok; dx++) for (let dy = -4; dy <= 3 && ok; dy++) {
      const gg = groundLevelM(w.terrain, x + dx, y + dy)
      const m = gg.ok ? materialAt(w.terrain, x + dx, y + dy, gg.value) : null
      if (!gg.ok || Math.abs(gg.value - g0.value) > 1 || !m || !m.ok || m.value === Material.APA) ok = false
    }
    if (ok) gasit = { x, y, g: g0.value }
  }
  assert.ok(gasit, 'niciun colt de chunk-uri cu ferestre diferite')
  const r = fuzz(w, { x0: gasit!.x - 4, y0: gasit!.y - 4, z0: gasit!.g - 2, X: 8, Y: 8, Z: 6 }, 400, 91, 'colt')
  assert.ok(r.incaperiVazute > 10, `oracol vid la colt (${r.incaperiVazute})`)
})

test('ORACOL: la baza ferestrei (sub ea e stanca, nu aer)', () => {
  const { w, wx, wy } = sitPlat(4242, 10)
  const baza = bazaVoxeli(w.terrain, wx + 4, wy + 4)
  const r = fuzz(w, { x0: wx + 1, y0: wy + 1, z0: baza, X: 7, Y: 7, Z: 4 }, 400, 5, 'baza')
  assert.ok(r.incaperiVazute > 20, `oracol vid la baza (${r.incaperiVazute})`)
})

test('ORACOL: pe un iaz (apa acopera; o cutie uscata e oarba la asta)', () => {
  const w = createWorld(12345)
  const { x, y, g } = gasesteIaz(w)
  const r = fuzz(w, { x0: x - 3, y0: y - 3, z0: g - 2, X: 7, Y: 7, Z: 6 }, 400, 17, 'iaz')
  assert.ok(r.comparatii > 50)
})

test('umplerea completa a unei incaperi de o celula nu lasa fantoma (DEF-1)', () => {
  const { w, wx, wy, g } = sitPlat(12345, 6)
  // O nișă de o celulă sub sol, acoperită de iarbă.
  assert.ok(dig(w.terrain, wx + 2, wy + 2, g - 1).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.equal(listaComponente(w.camere).length, 1)
  assert.ok(fill(w.terrain, wx + 2, wy + 2, g - 1, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.equal(listaComponente(w.camere).length, 0, 'incaperea umpluta a disparut')
  // Si intr-un singur lot: sapat + umplut.
  assert.ok(dig(w.terrain, wx + 3, wy + 3, g - 1).ok)
  assert.ok(dig(w.terrain, wx + 3, wy + 4, g - 1).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.ok(fill(w.terrain, wx + 3, wy + 3, g - 1, P).ok)
  assert.ok(fill(w.terrain, wx + 3, wy + 4, g - 1, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.equal(listaComponente(w.camere).length, 0)
})

test('depasirea jurnalului reconstruieste complet si da acelasi index', () => {
  const { w, wx, wy, g } = sitPlat(777, 10)
  casa(w.terrain, wx, wy, g, 5, 2)
  sincronizeazaCamere(w.camere, w.terrain)
  const inainte = w.camere.stat.recalculari
  // Peste JURNAL_CAP editari nevazute: sapat si zidit la loc, departe de casa.
  for (let i = 0; i <= JURNAL_CAP / 2; i++) {
    dig(w.terrain, wx + 8, wy + 8, g)
    fill(w.terrain, wx + 8, wy + 8, g, P)
  }
  sincronizeazaCamere(w.camere, w.terrain)
  assert.equal(w.camere.stat.recalculari, inainte + 1)
  egalCuRecalculul(w, 'dupa depasire')
  assert.equal(listaComponente(w.camere).length, 1)
})

// --- punctele fixe ---------------------------------------------------------------

test('PUNCTELE FIXE: dupa orice comanda de teren si orice tick, indexul e la zi cu jurnalul', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  // O pivnita sapata cu comanda, sub un strat de sol, si pioni care sapa in ea.
  for (let dx = 2; dx <= 6; dx++) {
    for (let dy = 2; dy <= 6; dy++) {
      const out = applyCommand(w, { kind: 'dig', wx: wx + dx, wy: wy + dy, z: g - 2 }, R)
      if (out.ok) assert.equal(w.camere.vazute, w.terrain.editari, 'dupa comanda dig')
    }
  }
  const f = applyCommand(w, { kind: 'fill', wx: wx + 1, wy: wy + 1, z: g + 1, material: P }, R)
  assert.ok(f.ok)
  assert.equal(w.camere.vazute, w.terrain.editari, 'dupa comanda fill')
  // O placa 4x4 pe patru stalpi, la g+3, deasupra unei gropi pe care o sapa pionii (din margine):
  // aerul de sub placa se schimba in timpul tickului.
  const px = wx + 2, py = wy + 8
  for (const [dx, dy] of [[0, 0], [3, 0], [0, 3], [3, 3]] as const) for (let z = g + 1; z <= g + 2; z++) assert.ok(fill(w.terrain, px + dx, py + dy, z, P).ok)
  for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 4; dy++) assert.ok(fill(w.terrain, px + dx, py + dy, g + 3, P).ok)
  for (let dx = 1; dx <= 2; dx++) for (let dy = 0; dy <= 3; dy++) {
    assert.ok(applyCommand(w, { kind: 'desemneaza', wx: px + dx, wy: py + dy, z: g }, R).ok)
  }
  for (let i = 0; i < 4; i++) {
    assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 9) * 1000 + 500, y: (wy + 9 + i) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
  }
  lasaItem(w, Item.HRANA, 75, wx + 10, wy + 10)
  const edInainte = w.terrain.editari
  sincronizeazaCamere(w.camere, w.terrain)
  const epocaInainte = w.camere.epoca
  for (let t = 0; t < 3000; t++) {
    tick(w, R)
    assert.equal(w.camere.vazute, w.terrain.editari, `dupa tickul ${t}`)
  }
  assert.ok(w.terrain.editari > edInainte, 'pionii n-au sapat nimic — proba nu exerseaza tickul')
  assert.ok(w.camere.epoca > epocaInainte, 'sapatul pionilor n-a schimbat nicio componenta — proba nu exerseaza sincronizarea din tick')
  egalCuRecalculul(w, 'dupa pioni')
  assert.ok(listaComponente(w.camere).length > 0)
})

test('SALVARE: lumea incarcata are exact indexul lumii continue, reconstruit in decode', () => {
  const { w, wx, wy, g } = sitPlat(4242, 12)
  casa(w.terrain, wx, wy, g, 5, 2)
  casa(w.terrain, wx + 6, wy, g, 4, 3, [[0, 1, 1], [0, 1, 2]])
  assert.ok(applyCommand(w, { kind: 'dig', wx: wx + 2, wy: wy + 2, z: g }, R).ok)
  const blob = encode(w)
  const inc = decode(blob, R)
  assert.ok(inc.ok)
  const w2 = inc.value
  assert.equal(w2.camere.vazute, w2.terrain.editari)
  assert.equal(w2.camere.stat.recalculari, 1)
  assert.deepEqual(formaCanonica(w2.camere), formaCanonica(w.camere))
  assert.ok(listaComponente(w2.camere).some(esteIncapere))
})

test('scenariul standard n-are aer acoperit: hash-ul de referinta e orb la incaperi (de-aia au scene proprii)', () => {
  const r = runScenario(standardScenario(12345, 3000, 20))
  assert.equal(r.world.camere.vazute, r.world.terrain.editari)
  assert.deepEqual(formaCanonica(r.world.camere), [])
  assert.ok(r.world.terrain.editari > 0, 'scenariul sapa')
})

// --- costul (K05) ----------------------------------------------------------------

test('K05: sapatul intr-o cariera deschisa nu reface nicio felie, nici peste granita unui bloc', () => {
  const { w, wx, wy, g } = sitPlat(12345, 24)
  const inainte = { ...w.camere.stat }
  // Cariera traverseaza o granita de bloc pe ambele axe: vecinii laterali din alt bloc nu se refac
  // cat timp n-au bucati.
  const bx = Math.ceil((wx + 5) / 16) * 16
  const by = Math.ceil((wy + 5) / 16) * 16
  let sapate = 0
  for (let d = 0; d < 3; d++) for (let dx = -4; dx < 4; dx++) for (let dy = -4; dy < 4; dy++) {
    if (applyCommand(w, { kind: 'dig', wx: bx + dx, wy: by + dy, z: g - d }, R).ok) sapate++
  }
  assert.ok(sapate > 150)
  assert.equal(w.camere.stat.feliiRefacute - inainte.feliiRefacute, 0)
  assert.equal(w.camere.stat.recalculari - inainte.recalculari, 0)
})

test('K05: o galerie lunga, acoperita si deschisa la gura — fiecare sapatura la fata costa cateva felii, nu galeria', () => {
  const { w, wx, wy, g } = sitPlat(777, 8)
  const t = w.terrain
  // Gura: o groapa deschisa; galeria merge spre est pe 64 m, cu doua straturi de sol deasupra,
  // urmand relieful (pe o treapta de 1 m, cele doua niveluri se suprapun: galeria ramane legata).
  for (let z = g - 3; z <= g; z++) assert.ok(dig(t, wx + 1, wy + 5, z).ok)
  sincronizeazaCamere(w.camere, t)
  let celule = 0
  let felii = 0
  let sapaturi = 0
  let prec = g
  for (let dx = 2; dx <= 65; dx++) {
    const gg = groundLevelM(t, wx + dx, wy + 5)
    if (!gg.ok || Math.abs(gg.value - prec) > 1) break
    prec = gg.value
    for (const z of [gg.value - 2, gg.value - 3]) {
      const a = { ...w.camere.stat }
      assert.ok(applyCommand(w, { kind: 'dig', wx: wx + dx, wy: wy + 5, z }, R).ok)
      celule += w.camere.stat.celuleScanate - a.celuleScanate
      felii += w.camere.stat.feliiRefacute - a.feliiRefacute
      sapaturi++
    }
  }
  assert.ok(sapaturi >= 60, `galeria s-a oprit dupa ${sapaturi} de sapaturi (relief)`)
  egalCuRecalculul(w, 'galeria')
  const c = componentaLa(w.camere, wx + 20, wy + 5, groundLevelM(t, wx + 20, wy + 5).ok ? (groundLevelM(t, wx + 20, wy + 5) as { value: number }).value - 2 : 0)
  assert.ok(c && !esteIncapere(c) && c.volum >= 60, 'galeria e o componenta deschisa, mare')
  // Pe o fata: felia ei si cel mult o vecina peste marginea blocului.
  assert.ok(felii <= sapaturi * 3, `felii refacute: ${felii} la ${sapaturi} de sapaturi`)
  assert.ok(celule <= sapaturi * 3 * 256, `celule scanate: ${celule}`)
})

test('K05: o lume incarcata reconstruieste o data, iar in regim niciodata', () => {
  const { w, wx, wy, g } = sitPlat(12345, 10)
  casa(w.terrain, wx, wy, g, 5, 2)
  sincronizeazaCamere(w.camere, w.terrain)
  const inc = decode(encode(w), R)
  assert.ok(inc.ok)
  const w2 = inc.value
  assert.equal(w2.camere.stat.recalculari, 1)
  for (let i = 0; i < 5; i++) applyCommand(w2, { kind: 'dig', wx: wx + 7, wy: wy + i, z: g }, R)
  for (let i = 0; i < 50; i++) tick(w2, R)
  assert.equal(w2.camere.stat.recalculari, 1)
  assert.equal(w2.camere.stat.coloaneNepromovate, 0, 'nicio coloana nepromovata citita (lema apronului)')
})
