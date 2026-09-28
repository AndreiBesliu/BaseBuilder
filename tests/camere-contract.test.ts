/**
 * Încăperile — contractul pe care îl va citi tăietura 2, ancorat pe HÂRTIE (recenzia încăperilor, CTR-4).
 *
 * Oracolul din camere.test.ts (incremental == recalcul complet) e autoconsistent pentru tot ce calculează
 * aceeași funcție în ambele părți: ancora, fețele deschise, ordinea cheilor, `celuleLaNivel`, vârful
 * coloanei. Șase mutații plauzibile pe ele treceau toată suita (N01, N03, M15, N06, N07, M09). Aici
 * fiecare valoare e comparată cu ceva calculat ALTFEL: numărată pe hârtie, sau derivată din celulele
 * feliilor (`celuleComponentei`), nu din atributele bucăților.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { bucataLa, celuleComponentei, celuleLaNivel, cheieCelula, componentaLa, decodeazaCelula, listaComponente, sincronizeazaCamere } from '../src/sim/camere.ts'
import type { World } from '../src/sim/state.ts'
import { Material, VOXEL_LEVELS } from '../src/sim/terrain/chunk.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { bazaVoxeli, dig, fill, materialAt } from '../src/sim/terrain/terrain.ts'
import { sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

/** Inelul de ziduri L×L pe [g+1, g+H] și acoperișul la g+H+1, zidite direct în teren (ca în camere.test.ts). */
function casa(t: Terrain, x0: number, y0: number, g: number, L: number, H: number, goluri: readonly (readonly [number, number, number])[] = []): void {
  for (let z = g + 1; z <= g + H; z++) for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
    if (goluri.some(([a, b, c]) => a === dx && b === dy && c === z - g)) continue
    assert.ok(fill(t, x0 + dx, y0 + dy, z, P).ok)
  }
  for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    if (goluri.some(([a, b, c]) => a === dx && b === dy && c === H + 1)) continue
    assert.ok(fill(t, x0 + dx, y0 + dy, g + H + 1, P).ok)
  }
}

test('CONTRACT: fetele deschise pe hartie — gaura de 1 in acoperis = 8, golul de usa 1x2 = 2, casa inchisa = 0', () => {
  // Casa 5×5 cu ziduri de 2 m: interiorul e 3×3×2.
  //  - gaura (2,2) în acoperiș: coloana ei e cer pe ambele niveluri; cele 4 celule vecine o văd lateral,
  //    pe 2 niveluri = 8 fețe;
  //  - golul de ușă (2,0) pe 2 niveluri: e sub acoperiș, deci aer acoperit al componentei; spre sud
  //    dă în cer = 2 fețe;
  //  - închisă: 0.
  for (const [gol, asteptat] of [[[[2, 2, 3]], 8], [[[2, 0, 1], [2, 0, 2]], 2], [[], 0]] as const) {
    const { w, wx, wy, g } = sitPlat(12345, 8)
    casa(w.terrain, wx, wy, g, 5, 2, gol)
    sincronizeazaCamere(w.camere, w.terrain)
    const c = componentaLa(w.camere, wx + 1, wy + 1, g + 1)
    assert.ok(c, `${JSON.stringify(gol)}: interiorul e aer acoperit`)
    assert.equal(c!.deschise, asteptat, `fete deschise, gol ${JSON.stringify(gol)}`)
  }
})

/**
 * Un fuzz scurt, direct pe teren, lângă o casă cu gol de ușă: după fiecare a treia editare, o
 * sincronizare. `inainte` se cheamă ÎNAINTEA fiecărei sincronizări și întoarce verificarea de după ea.
 * Aceeași secvență pentru toate testele de mai jos.
 */
function fuzzContractInainte(inainte: (w: World, g: number) => () => void): void {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  casa(w.terrain, wx, wy, g, 5, 2, [[2, 0, 1], [2, 0, 2]])
  const sincronizeaza = (): void => {
    const dupa = inainte(w, g)
    sincronizeazaCamere(w.camere, w.terrain)
    dupa()
  }
  sincronizeaza()
  let s = 7
  const rnd = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000 }
  for (let p = 0; p < 300; p++) {
    const x = wx + 6 + Math.floor(rnd() * 7), y = wy + Math.floor(rnd() * 7), z = g - 2 + Math.floor(rnd() * 6)
    const m = materialAt(w.terrain, x, y, z)
    if (!m.ok) continue
    if (m.value === Material.AER) fill(w.terrain, x, y, z, P)
    else dig(w.terrain, x, y, z)
    if (p % 3 !== 0) continue
    sincronizeaza()
  }
}

/** Ca mai sus, cu verificarea doar DUPĂ fiecare sincronizare. */
function fuzzContract(verifica: (w: World, g: number) => void): void {
  fuzzContractInainte((w, g) => () => verifica(w, g))
}

test('CONTRACT: ancora e cea mai mica celula (z, y, x) a componentei — pe hartie si dupa fuzz', () => {
  // Ancora e cheia de salvare a tăieturii 2. Pe hârtie: golul ușii (2,0) are cel mai mic y la z = g+1.
  const { w, wx, wy, g } = sitPlat(12345, 8)
  casa(w.terrain, wx, wy, g, 5, 2, [[2, 0, 1], [2, 0, 2]])
  sincronizeazaCamere(w.camere, w.terrain)
  assert.equal(componentaLa(w.camere, wx + 1, wy + 1, g + 1)!.ancora, cheieCelula(wx + 2, wy, g + 1), 'golul usii e cea mai mica celula')
  // După fuzz: ancora = minimul celulelor citite din felii, nu din ancorele bucăților.
  let verificate = 0
  let cuMaiMulteBucati = 0
  fuzzContract((wf) => {
    for (const c of listaComponente(wf.camere)) {
      assert.equal(c.ancora, celuleComponentei(wf.camere, c)[0], `ancora componentei ${c.id}`)
      verificate++
      if (c.bucati.length > 1) cuMaiMulteBucati++
    }
  })
  assert.ok(verificate > 500, `vid: ${verificate} componente verificate`)
  // O ancoră luată ca MAXIMUL ancorelor de bucată se vede doar pe o componentă din mai multe bucăți.
  assert.ok(cuMaiMulteBucati > 100, `vid: doar ${cuMaiMulteBucati} componente din mai multe bucati`)
})

test('CONTRACT: cheile feliilor sunt MEREU sortate — singura ordine de iterare', () => {
  let comparatii = 0
  let maxFelii = 0
  fuzzContract((w) => {
    assert.deepEqual(w.camere.chei, [...w.camere.felii.keys()].sort((a, b) => a - b), 'cheile feliilor, sortate')
    comparatii++
    maxFelii = Math.max(maxFelii, w.camere.chei.length)
  })
  assert.ok(comparatii > 50 && maxFelii >= 4, `vid: ${comparatii} comparatii, cel mult ${maxFelii} felii`)
})

test('CONTRACT: celuleLaNivel da exact celulele componentelor de la nivelul cerut (forta bruta pe 8 niveluri)', () => {
  let celule = 0
  fuzzContract((w, g) => {
    for (let zz = g - 3; zz <= g + 4; zz++) {
      const vazute: number[] = []
      celuleLaNivel(w.camere, zz, (cx, cy, c) => {
        vazute.push(cheieCelula(cx, cy, zz))
        assert.equal(componentaLa(w.camere, cx, cy, zz), c, `(${cx},${cy},${zz}): componenta data de celuleLaNivel`)
      })
      const bruta: number[] = []
      for (const c of listaComponente(w.camere)) for (const k of celuleComponentei(w.camere, c)) if (decodeazaCelula(k).z === zz) bruta.push(k)
      assert.deepEqual(vazute.sort((a, b) => a - b), bruta.sort((a, b) => a - b), `nivelul ${zz}`)
      celule += bruta.length
    }
  })
  assert.ok(celule > 2000, `vid: ${celule} celule comparate`)
})

test('CONTRACT: o sincronizare nu modifica obiectele Felie vechi — refaFelie creeaza unul nou', () => {
  // Recenzia incaperilor, CTR-2 / CTR-1: identitatea obiectului Felie e versiunea feliei. Pe asta se
  // sprijina un detector de schimbare pe felii si captura provenientei din afara (tăietura 2): o
  // instantanee superficiala luata inainte de sincronizare trebuie sa ramana exacta dupa ea.
  let refacute = 0
  let verificate = 0
  fuzzContractInainte((w) => {
    const vechi = [...w.camere.felii].map(([k, f]) => ({ k, f, cel: f.cel.slice(), bucati: [...f.bucati] }))
    return () => {
      for (const v of vechi) {
        assert.equal(v.f.cheie, v.k)
        assert.deepEqual(v.f.cel, v.cel, `felia ${v.k}: celulele obiectului vechi s-au schimbat`)
        assert.deepEqual(v.f.bucati, v.bucati, `felia ${v.k}: bucatile obiectului vechi s-au schimbat`)
        verificate++
        if (w.camere.felii.get(v.k) !== v.f) refacute++
      }
    }
  })
  assert.ok(verificate > 300 && refacute > 100, `vid: ${verificate} felii vechi verificate, ${refacute} refacute`)
})

test('CONTRACT: un acoperis pe ultimul nivel al ferestrei de voxeli acopera', () => {
  const { w, wx, wy } = sitPlat(12345, 4)
  const sus = bazaVoxeli(w.terrain, wx + 1, wy + 1) + VOXEL_LEVELS - 1
  assert.ok(fill(w.terrain, wx + 1, wy + 1, sus, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.ok(bucataLa(w.camere, wx + 1, wy + 1, sus - 1) >= 0, 'aerul de sub acoperisul de pe ultimul nivel e acoperit')
  assert.equal(bucataLa(w.camere, wx + 1, wy + 1, sus + 1), -1, 'peste fereastra e cer')
})
