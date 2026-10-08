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
  decodeazaCelula,
  decodeazaFelie,
  esteAcoperita,
  esteAer,
  esteIncapere,
  formaCanonica,
  listaComponente,
  sincronizeazaCamere,
  varfLa,
} from '../src/sim/camere.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { formaCanonicaFete, formaCanonicaFeteRecalculata } from '../src/sim/fete.ts'
import { formaCanonicaGraf, grafTermic } from '../src/sim/termic.ts'
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

/**
 * Oracolul: indexul == recalculul complet, iar cache-ul de fețe (fete.ts, S24-27 t.2a) == recalculul complet
 * al fețelor pe același index — după fiecare lot al fiecărui test de mai jos, fuzz-ul de cutii inclus. Și graful
 * termic (termic.ts, t.2a): cel FOLOSIT (refolosit cât timp ștampila lui nu s-a mișcat) == graful indexului nou.
 */
function egalCuRecalculul(w: World, mesaj: string): void {
  const nou = construiesteCamere(w.terrain)
  assert.deepEqual(formaCanonica(w.camere), formaCanonica(nou), mesaj)
  assert.deepEqual(formaCanonicaFete(w.camere), formaCanonicaFeteRecalculata(w.camere, w.terrain), `${mesaj} (fetele)`)
  const folosit = grafTermic(w.camere, R)
  const recalculat = grafTermic(nou, R)
  assert.ok(folosit.ok && recalculat.ok, `${mesaj} (graful): ${JSON.stringify(folosit.ok ? recalculat : folosit)}`)
  assert.deepEqual(formaCanonicaGraf(folosit.value), formaCanonicaGraf(recalculat.value), `${mesaj} (graful)`)
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
function fuzz(w: World, c: Cutie, pasi: number, seed: number, eticheta: string, numaraApa = false): { comparatii: number; incaperiVazute: number; celuleSubApa: number } {
  const rnd = lcg(seed)
  let comparatii = 0
  let incaperiVazute = 0
  let celuleSubApa = 0
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
    const r = numaraApa ? cititorCamere(w.terrain) : null
    for (const k of listaComponente(w.camere)) {
      if (esteIncapere(k)) incaperiVazute++
      if (r === null) continue
      // Celulele acoperite de APA: varful coloanei lor e apa (DEF-2).
      for (const cheie of celuleComponentei(w.camere, k)) {
        const { x, y } = decodeazaCelula(cheie)
        const m = materialAt(w.terrain, x, y, varfLa(r, x, y))
        if (m.ok && m.value === Material.APA) celuleSubApa++
      }
    }
  }
  return { comparatii, incaperiVazute, celuleSubApa }
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
  const r = fuzz(w, { x0: x - 3, y0: y - 3, z0: g - 2, X: 7, Y: 7, Z: 6 }, 400, 17, 'iaz', true)
  // Recenzia incaperilor, CTR-4: `comparatii > 50` trecea si pe un iaz mutat sau secat — oracolul ar fi
  // devenit o cutie uscata, vida pentru DEF-2, fara sa se inroseasca. Masurat: 645 de celule.
  assert.ok(r.celuleSubApa > 200, `oracol vid pe iaz: doar ${r.celuleSubApa} celule acoperite de apa`)
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
  const feteInainte = w.camere.fete.stat.recalculari
  // Peste JURNAL_CAP editari nevazute: sapat si zidit la loc, departe de casa. Plus pamant pe acoperis, in
  // acelasi lot depasit: fetele SUS se schimba, iar D+ nu are voie sa citeasca inelul suprascris — cache-ul
  // de fete se reface integral.
  for (let i = 0; i <= JURNAL_CAP / 2; i++) {
    dig(w.terrain, wx + 8, wy + 8, g)
    fill(w.terrain, wx + 8, wy + 8, g, P)
  }
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) fill(w.terrain, wx + dx, wy + dy, g + 4, Material.PAMANT)
  const rez = sincronizeazaCamere(w.camere, w.terrain)
  assert.deepEqual({ felii: rez.felii, recalcul: rez.recalcul }, { felii: [], recalcul: true }, 'contractul: depasirea e un recalcul')
  assert.equal(w.camere.stat.recalculari, inainte + 1)
  assert.equal(w.camere.fete.stat.recalculari, feteInainte + 1, 'cache-ul de fete s-a refacut o data')
  egalCuRecalculul(w, 'dupa depasire')
  assert.equal(listaComponente(w.camere).length, 1)
  // Si un index al ALTUI teren: tot recalcul.
  const alta = sitPlat(777, 10).w
  const rezAlta = sincronizeazaCamere(w.camere, alta.terrain)
  assert.deepEqual({ felii: rezAlta.felii, recalcul: rezAlta.recalcul }, { felii: [], recalcul: true })
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
  // Oracolul dupa FIECARE tick care a editat terenul, nu doar la final (recenzia incaperilor, CTR-9): o
  // abatere care se vindeca la o editare ulterioara din aceeasi felie nu se mai vede la capat. Tickurile
  // fara editari nu pot schimba indexul, deci comparatia pe ele n-ar proba nimic (masurat: 8 editari).
  let prec = w.terrain.editari
  let comparatii = 0
  for (let t = 0; t < 3000; t++) {
    tick(w, R)
    assert.equal(w.camere.vazute, w.terrain.editari, `dupa tickul ${t}`)
    if (w.terrain.editari !== prec) {
      egalCuRecalculul(w, `dupa tickul ${t}`)
      comparatii++
      prec = w.terrain.editari
    }
  }
  assert.ok(comparatii >= 4, `doar ${comparatii} tickuri cu editari: oracolul pe tick e aproape vid`)
  assert.ok(w.terrain.editari > edInainte, 'pionii n-au sapat nimic — proba nu exerseaza tickul')
  assert.ok(w.camere.epoca > epocaInainte, 'sapatul pionilor n-a schimbat nicio componenta — proba nu exerseaza sincronizarea din tick')
  egalCuRecalculul(w, 'dupa pioni')
  assert.ok(listaComponente(w.camere).length > 0)
})

test('PRABUSIRE: placa 5x5 pe un stalp, peste o pivnita acoperita — stalpul sapat prin comanda o darama intr-un singur lot, iar indexul e la zi si egal cu recalculul', () => {
  // Recenzia incaperilor, CTR-9: niciun test nu trecea incaperile printr-o prabusire, iar lotul de mai
  // multe editari pe aceeasi coloana (dig sus, fill cu MOLOZ jos) era exersat doar de fuzz-ul direct pe
  // teren, cu loturi de cel mult 4. Masurat: 53 de editari intr-un lot, 26 de voxeli de MOLOZ.
  const { w, wx, wy, g } = sitPlat(777, 14)
  const t = w.terrain
  // Pivnita 4x4x2 sub un strat de sol; stalpul la (1,1), placa 5x5 la g+3, peste pivnita.
  for (let dx = 2; dx <= 5; dx++) for (let dy = 2; dy <= 5; dy++) for (const z of [g - 2, g - 1]) assert.ok(dig(t, wx + dx, wy + dy, z).ok)
  for (let z = g + 1; z <= g + 2; z++) assert.ok(fill(t, wx + 1, wy + 1, z, P).ok)
  for (let dx = 1; dx <= 5; dx++) for (let dy = 1; dy <= 5; dy++) assert.ok(fill(t, wx + dx, wy + dy, g + 3, P).ok)
  sincronizeazaCamere(w.camere, t)
  const subPlaca = componentaLa(w.camere, wx + 3, wy + 3, g + 1)
  assert.ok(subPlaca && !esteIncapere(subPlaca), 'fixtura: aerul de sub placa e acoperit si deschis')
  const e0 = t.editari
  assert.ok(applyCommand(w, { kind: 'dig', wx: wx + 1, wy: wy + 1, z: g + 1 }, R).ok)
  const lot = t.editari - e0
  let moloz = 0
  for (let dx = 0; dx < 8; dx++) for (let dy = 0; dy < 8; dy++) for (let z = g - 3; z < g + 5; z++) {
    const m = materialAt(t, wx + dx, wy + dy, z)
    if (m.ok && m.value === Material.MOLOZ) moloz++
  }
  assert.ok(lot > 40 && moloz >= 20, `fixtura: placa n-a cazut (${lot} editari in lot, ${moloz} de MOLOZ)`)
  assert.equal(w.camere.vazute, t.editari, 'dupa comanda care a prabusit placa')
  egalCuRecalculul(w, 'dupa prabusire')
  assert.equal(componentaLa(w.camere, wx + 3, wy + 3, g + 1), null, 'placa a cazut: sub ea nu mai e aer acoperit')
  const pivnita = componentaLa(w.camere, wx + 3, wy + 3, g - 1)
  assert.ok(pivnita && esteIncapere(pivnita), 'pivnita ramane incapere')
  assert.equal(pivnita!.volum, 32)
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
  // Cache-ul de fete e TRANSIENT: decode il reface complet, iar el iese identic cu al lumii continue.
  assert.equal(w2.camere.fete.stat.recalculari, 1)
  assert.deepEqual(formaCanonicaFete(w2.camere), formaCanonicaFete(w.camere))
  assert.ok(listaComponente(w2.camere).some(esteIncapere))
})

test('SALVARE (CTR-10): encode refuza o lume cu indexul incaperilor in urma terenului — o editare care a ocolit punctele fixe', () => {
  // Recenzia incaperilor, CTR-10: invariantul `vazute === editari` nu era verificat nicaieri la sursa;
  // prima cale noua de editare (M10 pe lumea gate-ului, IDX-5) l-a stricat tacut.
  const { w, wx, wy, g } = sitPlat(4242, 8)
  casa(w.terrain, wx, wy, g, 5, 2) // direct in teren: in afara tickului si a comenzilor
  assert.notEqual(w.camere.vazute, w.terrain.editari, 'fixtura: indexul e in urma')
  assert.throws(() => encode(w), /indexul incaperilor nu e la zi/)
  sincronizeazaCamere(w.camere, w.terrain)
  const inc = decode(encode(w), R)
  assert.ok(inc.ok, 'dupa sincronizare, salvarea merge')
  // Si un index al ALTUI teren, cu acelasi numar de editari.
  const teren = w.camere.teren
  w.camere.teren = createWorld(4242).terrain
  try {
    assert.throws(() => encode(w), /alt teren/)
  } finally {
    w.camere.teren = teren
  }
  assert.doesNotThrow(() => encode(w))
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
  let bucatiGaleriei = 0
  let ultimDx = 0
  const rapide0 = w.camere.stat.caiRapide
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
      // Bucatile vizitate (recenzia incaperilor, IDX-3): partea care domina costul. Sapatura la fata
      // reparcurge galeria — o singura componenta — dar O DATA, nu o data pe saminta.
      const galeria = componentaLa(w.camere, wx + dx, wy + 5, z)
      assert.ok(galeria, `sapatura ${sapaturi}: celula sapata nu e in galerie`)
      const vizitate = w.camere.stat.bucatiVizitate - a.bucatiVizitate
      assert.ok(vizitate <= galeria!.bucati.length + 8, `sapatura ${sapaturi}: ${vizitate} bucati vizitate, galeria are ${galeria!.bucati.length}`)
      bucatiGaleriei = Math.max(bucatiGaleriei, galeria!.bucati.length)
      sapaturi++
    }
    ultimDx = dx
  }
  assert.ok(sapaturi >= 60, `galeria s-a oprit dupa ${sapaturi} de sapaturi (relief)`)
  // Garda pe bucati musca doar daca galeria are mai mult de 8 bucati (masurat: 12).
  assert.ok(bucatiGaleriei > 8, `galeria are doar ${bucatiGaleriei} bucati: garda pe bucati vizitate e vida`)
  egalCuRecalculul(w, 'galeria')
  const c = componentaLa(w.camere, wx + 20, wy + 5, groundLevelM(t, wx + 20, wy + 5).ok ? (groundLevelM(t, wx + 20, wy + 5) as { value: number }).value - 2 : 0)
  assert.ok(c && !esteIncapere(c) && c.volum >= 60, 'galeria e o componenta deschisa, mare')
  // Pe o fata: felia ei si cel mult o vecina peste marginea blocului.
  assert.ok(felii <= sapaturi * 3, `felii refacute: ${felii} la ${sapaturi} de sapaturi`)
  assert.ok(celule <= sapaturi * 3 * 256, `celule scanate: ${celule}`)
  // Calea rapida (recenzia incaperilor, IDX-1): sapatura la fata lungeste galeria, nu o desparte si nu
  // o uneste cu nimic — deci galeria se reface pe loc, fara BFS. Masurat: 127 din 128; prima sapatura
  // face o componenta noua (gura e cer), deci nu are ce actualiza.
  const rapide = w.camere.stat.caiRapide - rapide0
  assert.ok(rapide >= sapaturi - 1, `doar ${rapide} din ${sapaturi} sapaturi pe calea rapida`)
  // O umplere care taie galeria in doua (ambele niveluri): lotul atinge o singura componenta, dar
  // bucatile noi nu mai leaga cele doua jumatati — calea rapida refuza, iar BFS-ul reparcurge ambele
  // jumatati, o singura data.
  const taie = wx + 25
  const gt = groundLevelM(t, taie, wy + 5)
  assert.ok(gt.ok && ultimDx > 30)
  const b = { ...w.camere.stat }
  // Direct in teren, intr-un singur lot: comanda `fill` refuza celulele cu mormanul sapaturii in ele.
  assert.ok(fill(t, taie, wy + 5, gt.value - 3, P).ok)
  assert.ok(fill(t, taie, wy + 5, gt.value - 2, P).ok)
  sincronizeazaCamere(w.camere, t)
  const gGura = groundLevelM(t, wx + 2, wy + 5) as { value: number }
  const gCapat = groundLevelM(t, wx + ultimDx, wy + 5) as { value: number }
  const gura = componentaLa(w.camere, wx + 2, wy + 5, gGura.value - 2)
  const capat = componentaLa(w.camere, wx + ultimDx, wy + 5, gCapat.value - 3)
  assert.ok(gura && capat && gura.id !== capat.id, 'galeria taiata e doua componente')
  assert.ok(!esteIncapere(gura!) && esteIncapere(capat!), 'jumatatea de la gura ramane deschisa; cealalta e o incapere')
  assert.equal(w.camere.stat.caiRapide - b.caiRapide, 0, 'despartirea a trecut pe calea rapida')
  const vizitate = w.camere.stat.bucatiVizitate - b.bucatiVizitate
  assert.ok(vizitate <= gura!.bucati.length + capat!.bucati.length + 8, `despartirea: ${vizitate} bucati vizitate, jumatatile au ${gura!.bucati.length} + ${capat!.bucati.length}`)
  egalCuRecalculul(w, 'galeria taiata')
})

test('K05 (IDX-1): o sapatura la fata unei mine acoperite mari trece pe calea rapida — mina se reface pe loc, fara s-o reparcurga', () => {
  // Recenzia incaperilor, IDX-1: pe o mina de 1557 de bucati, BFS-ul pe componenta atinsa era 81% din
  // timpul camerelor, desi in 98,9% din sincronizari componenta ramanea una singura.
  const { w, wx, wy } = sitPlat(12345, 8)
  const t = w.terrain
  const N = 64
  // Mina 64x64 pe trei niveluri, sub doua straturi de sol, cu stalpi de 1x1 la fiecare 4 m.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (x % 4 === 0 && y % 4 === 0) continue
    const gg = groundLevelM(t, wx + x, wy + y)
    assert.ok(gg.ok)
    for (let d = 2; d <= 4; d++) assert.ok(dig(t, wx + x, wy + y, gg.value - d).ok)
  }
  sincronizeazaCamere(w.camere, t)
  const mina = componentaLa(w.camere, wx + 1, wy + 1, (groundLevelM(t, wx + 1, wy + 1) as { value: number }).value - 3)
  assert.ok(mina && mina.bucati.length > 40, `fixtura: mina are ${mina?.bucati.length} bucati`)
  let maxVizitate = 0
  for (let i = 0; i < 20; i++) {
    const x = wx + N, y = wy + 2 + i
    const gg = groundLevelM(t, x, y) as { value: number }
    const a = { ...w.camere.stat }
    assert.ok(applyCommand(w, { kind: 'dig', wx: x, wy: y, z: gg.value - 3 }, R).ok)
    assert.equal(w.camere.stat.caiRapide - a.caiRapide, 1, `sapatura ${i} n-a trecut pe calea rapida`)
    maxVizitate = Math.max(maxVizitate, w.camere.stat.bucatiVizitate - a.bucatiVizitate)
  }
  assert.ok(maxVizitate <= 16, `${maxVizitate} bucati vizitate pe o sapatura, mina are ${mina!.bucati.length}`)
  const dupa = componentaLa(w.camere, wx + 1, wy + 1, (groundLevelM(t, wx + 1, wy + 1) as { value: number }).value - 3)
  assert.equal(dupa?.id, mina!.id, 'mina isi pastreaza id-ul pe calea rapida')
  egalCuRecalculul(w, 'mina')
})

test('IDX-1: o gaura intre doua pivnite suprapuse le uneste — lotul atinge doar pivnita de jos, dar bucata noua se leaga si de cea de sus: calea rapida refuza', () => {
  // Felia de deasupra editarii nu se reface (antetul), deci pivnita de sus NU e in `moarte`: unirea se
  // vede doar din vecinii bucatilor noi.
  const { w, wx, wy, g } = sitPlat(4242, 8)
  const t = w.terrain
  for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) {
    assert.ok(dig(t, wx + dx, wy + dy, g - 4).ok)
    assert.ok(dig(t, wx + dx, wy + dy, g - 2).ok)
  }
  sincronizeazaCamere(w.camere, t)
  assert.deepEqual(listaComponente(w.camere).map((c) => c.volum), [9, 9])
  const a = { ...w.camere.stat }
  assert.ok(applyCommand(w, { kind: 'dig', wx: wx + 2, wy: wy + 2, z: g - 3 }, R).ok)
  assert.equal(w.camere.stat.caiRapide - a.caiRapide, 0, 'unirea a trecut pe calea rapida')
  assert.deepEqual(listaComponente(w.camere).map((c) => c.volum), [19], 'cele doua pivnite si gaura sunt o singura incapere')
  egalCuRecalculul(w, 'unirea')
})

test('IDX-1: un lot care umple o nisa si largeste o pivnita atinge doua componente — calea rapida refuza, iar nisa dispare din index', () => {
  // Nisa e sub pivnita, deci felia ei se reface INTAI (ordinea cheilor): pivnita e ultima in `moarte`.
  const { w, wx, wy, g } = sitPlat(12345, 8)
  const t = w.terrain
  assert.ok(dig(t, wx + 6, wy + 6, g - 5).ok)
  for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) assert.ok(dig(t, wx + dx, wy + dy, g - 2).ok)
  sincronizeazaCamere(w.camere, t)
  assert.deepEqual(listaComponente(w.camere).map((c) => c.volum).sort((a, b) => a - b), [1, 9])
  const a = { ...w.camere.stat }
  // Un singur lot: nisa umpluta, pivnita largita cu o celula.
  assert.ok(fill(t, wx + 6, wy + 6, g - 5, P).ok)
  assert.ok(dig(t, wx + 4, wy + 2, g - 2).ok)
  sincronizeazaCamere(w.camere, t)
  assert.equal(w.camere.stat.caiRapide - a.caiRapide, 0, 'lotul cu doua componente a trecut pe calea rapida')
  assert.deepEqual(listaComponente(w.camere).map((c) => c.volum), [10], 'nisa umpluta a ramas in index')
  egalCuRecalculul(w, 'nisa si pivnita')
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

test('K05: o sapatura intr-o pivnita izolata dintre 576 viziteaza doar bucatile ei, iar celelalte 575 de componente isi pastreaza id-ul', () => {
  // Recenzia incaperilor, IDX-3 / CTR-5: o sincronizare care reparcurge TOATE bucatile vii (K01) da
  // acelasi index, deci oracolul e orb la ea; costul insa e O(lume), iar fiecare componenta moare.
  // Masurat pe cod: 3 bucati vizitate si 1 felie; cu K01, 1568 de bucati si 576 de componente aruncate.
  const { w, wx, wy } = sitPlat(12345, 8)
  const t = w.terrain
  let pivnite = 0
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
    const x = wx + i * 5, y = wy + j * 5
    const gg = groundLevelM(t, x + 1, y + 1)
    if (!gg.ok) continue
    let ok = true
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) for (const z of [gg.value - 3, gg.value - 2]) ok = dig(t, x + dx, y + dy, z).ok && ok
    if (ok) pivnite++
  }
  sincronizeazaCamere(w.camere, t)
  assert.equal(pivnite, 576)
  const inainte = new Map([...w.camere.comp.values()].map((c) => [c.id, c.ancora]))
  assert.equal(inainte.size, 576, 'fixtura: fiecare pivnita e o componenta')
  const tinta = componentaLa(w.camere, wx + 1, wy + 1, (groundLevelM(t, wx + 1, wy + 1) as { value: number }).value - 2)!
  const a = { ...w.camere.stat }
  // O groapa in podeaua primei pivnite.
  assert.ok(applyCommand(w, { kind: 'dig', wx: wx + 1, wy: wy + 1, z: (groundLevelM(t, wx + 1, wy + 1) as { value: number }).value - 4 }, R).ok)
  const vizitate = w.camere.stat.bucatiVizitate - a.bucatiVizitate
  assert.ok(vizitate > 0, 'sapatura n-a reparcurs nimic: proba nu exerseaza componentele')
  assert.ok(vizitate <= 16, `bucati vizitate: ${vizitate} (bucati vii: ${w.camere.bUrmator - w.camere.bLibere.length})`)
  let pastrate = 0
  for (const [id, ancora] of inainte) if (id !== tinta.id && w.camere.comp.get(id)?.ancora === ancora) pastrate++
  assert.equal(pastrate, 575, 'componentele neatinse isi pastreaza id-ul')
  egalCuRecalculul(w, 'pivnitele')
})

test('K05 (IDX-4): recalculul complet decodeaza fiecare coloana o singura data — blocul intai, apoi z', () => {
  // Recenzia incaperilor, IDX-4: in ordinea cheii (z, by, bx), un nivel intreg nu incapea in cele 8192
  // de coloane ale cititorului, deci coloanele fiecarui bloc se decodau din nou la fiecare nivel. Pe
  // locul fortaretei din viewer: 144 de blocuri cu cate o pivnita 3x3 pe 3 niveluri, in interiorul
  // blocului — pe hartie, 256 de coloane pe bloc. Masurat: 87.296 de coloane citite in ordinea veche
  // (2,37x), 37.888 in cea noua (fortareata de pivnite: 780.197 -> 181.708, 283 -> 116 ms).
  const w = createWorld(4242)
  const t = w.terrain
  const bx0 = 244 * CHUNK_CELLS, by0 = 244 * CHUNK_CELLS
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      const x = bx0 + i * 16 + 6 + dx, y = by0 + j * 16 + 6 + dy
      const gg = groundLevelM(t, x, y)
      assert.ok(gg.ok)
      for (let d = 2; d <= 4; d++) assert.ok(dig(t, x, y, gg.value - d).ok)
    }
  }
  sincronizeazaCamere(w.camere, t)
  const idx = construiesteCamere(t)
  const blocuri = new Set(idx.chei.map((k) => { const f = decodeazaFelie(k); return f.by * 100000 + f.bx }))
  assert.equal(blocuri.size, 144, 'fixtura: o pivnita in fiecare bloc')
  assert.ok(idx.felii.size >= 3 * 144, `fixtura: ${idx.felii.size} felii, sub 3 niveluri pe bloc`)
  assert.ok(idx.stat.coloaneCitite <= 256 * 144 * 1.1, `coloane citite: ${idx.stat.coloaneCitite}, pe hartie ${256 * 144}`)
  // Lista cheilor, refacuta o data la final: sortata si completa.
  assert.deepEqual(idx.chei, [...idx.felii.keys()].sort((a, b) => a - b))
  assert.deepEqual(formaCanonica(idx), formaCanonica(w.camere), 'recalculul in ordinea noua == indexul incremental')
})

test('K05 (IDX-2): o prabusire de peste 4096 de editari intr-o singura comanda se sincronizeaza incremental, fara recalculul lumii', () => {
  // Recenzia incaperilor, IDX-2: cu jurnalul de 4096, lotul unei prabusiri mari trecea de el si
  // indexul se reconstruia complet (tot terenul promovat) in mijlocul comenzii. O cavitate de 60×60
  // sub un singur strat de sol, pe un stalp de 2×2; stalpul sapat prin comanda darama tavanul, iar
  // un voxel cazut costa doua editari (dig + fill cu MOLOZ), toate in lotul comenzii. Masurat: 5585.
  const { w, wx, wy } = sitPlat(4242, 10)
  const t = w.terrain
  const x0 = wx + 2, y0 = wy + 2, L = 60, c = L >> 1
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    if ((x === c || x === c - 1) && (y === c || y === c - 1)) continue
    const gg = groundLevelM(t, x0 + x, y0 + y)
    assert.ok(gg.ok)
    for (const z of [gg.value - 2, gg.value - 1]) assert.ok(dig(t, x0 + x, y0 + y, z).ok)
  }
  sincronizeazaCamere(w.camere, t)
  const r0 = w.camere.stat.recalculari
  const e0 = t.editari
  const gs = groundLevelM(t, x0 + c, y0 + c)
  assert.ok(gs.ok)
  assert.ok(applyCommand(w, { kind: 'dig', wx: x0 + c, wy: y0 + c, z: gs.value - 1 }, R).ok)
  const lot = t.editari - e0
  assert.ok(lot > 4096, `fixtura: lotul prabusirii are ${lot} editari, sub jurnalul vechi`)
  assert.equal(w.camere.vazute, t.editari)
  assert.equal(w.camere.stat.recalculari, r0, `prabusirea (${lot} de editari) a reconstruit indexul lumii`)
  egalCuRecalculul(w, 'dupa prabusirea mare')
})
