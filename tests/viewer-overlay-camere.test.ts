/**
 * Overlay-ul Încăperi (tasta I) — când se reface (recenzia încăperilor, ECR-2). Epoca indexului e globală:
 * refăcut pe ea, overlay-ul se reconstruia, cu materiale noi, la fiecare săpătură din lume. Acum
 * materialele sunt ale overlay-ului, iar o epocă nouă reface nivelul doar dacă amprenta lui (feliile +
 * tripletul componentelor) s-a schimbat. Oracolul: o reconstrucție completă, pe un overlay nou.
 *
 * three rulează în node (obiecte JS, fără WebGL): grupul, geometriile și materialele se citesc direct.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type * as THREE from 'three'
import { sincronizeazaCamere } from '../src/sim/camere.ts'
import type { World } from '../src/sim/state.ts'
import { isSolid, Material } from '../src/sim/terrain/chunk.ts'
import type { MaterialId } from '../src/sim/terrain/chunk.ts'
import { dig, fill, materialAt } from '../src/sim/terrain/terrain.ts'
import { aceeasiAmprenta, amprentaNivel, createCamereOverlay, rebuildCamereOverlay } from '../viewer/overlay-camere.ts'
import type { OverlayCamere } from '../viewer/overlay-camere.ts'
import { sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

/**
 * O casă L×M la (x0, y0) pe solul g: ziduri pe g+1..g+h, acoperiș la g+h+1, golul ușii la (2, 0) pe
 * g+1..g+2 umplut cu `usa` (null = aer: casa rămâne deschisă).
 */
function casa(w: World, x0: number, y0: number, g: number, L: number, M: number, h: number, usa: MaterialId | null): void {
  for (let z = g + 1; z <= g + h; z++) for (let a = 0; a < L; a++) for (let b = 0; b < M; b++) {
    if (a !== 0 && a !== L - 1 && b !== 0 && b !== M - 1) continue
    const gol = a === 2 && b === 0 && z <= g + 2
    if (gol && usa === null) continue
    assert.ok(fill(w.terrain, x0 + a, y0 + b, z, gol ? usa! : P).ok)
  }
  for (let a = 0; a < L; a++) for (let b = 0; b < M; b++) assert.ok(fill(w.terrain, x0 + a, y0 + b, g + h + 1, P).ok)
}

/** O hală sapată sub sol, pe două niveluri (g−4, g−3): acoperită de pământ, sigilată. */
function hala(w: World, x0: number, y0: number, g: number, L: number): void {
  for (const z of [g - 4, g - 3]) for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) assert.ok(dig(w.terrain, x0 + a, y0 + b, z).ok)
}

function overlay(w: World, z: number): OverlayCamere {
  const o = createCamereOverlay()
  o.visible = true
  rebuildCamereOverlay(o, w, z)
  return o
}

/** Ce e desenat: cifrele și, pe fiecare plasă, materialul (al cărui rol), pozițiile și culorile. */
function desen(o: OverlayCamere): unknown {
  const rol = (m: unknown): string => (m === o.materiale.tenta ? 'tenta' : m === o.materiale.hasuri ? 'hasuri' : m === o.materiale.stalpi ? 'stalpi' : 'STRAIN')
  return {
    cifre: [o.incaperi, o.deschise, o.scurgeri],
    plase: o.group.children.map((c) => {
      const m = c as THREE.Mesh
      const col = m.geometry.getAttribute('color')
      return { tip: m.type, rol: rol(m.material), pos: Array.from(m.geometry.getAttribute('position').array), col: col ? Array.from(col.array) : null }
    }),
  }
}

function numaraEliberari(o: OverlayCamere): () => number {
  let n = 0
  for (const m of Object.values(o.materiale)) m.addEventListener('dispose', () => { n++ })
  return () => n
}

test('overlay I (ECR-2): editarile pe ALT nivel nu refac nivelul desenat (contorul de reconstructii); materialele raman aceleasi, neeliberate', () => {
  const { w, wx, wy, g } = sitPlat(12345, 20)
  casa(w, wx + 1, wy + 1, g, 5, 5, 2, Material.USA)
  hala(w, wx + 12, wy + 12, g, 5)
  sincronizeazaCamere(w.camere, w.terrain)
  const o = overlay(w, g + 1)
  const materiale = { ...o.materiale }
  const eliberari = numaraEliberari(o)
  assert.equal(o.reconstructii, 1)
  assert.equal(o.incaperi, 1, 'casa: o incapere la g+1')
  // Hala de sub pamant creste: aer acoperit nou, epoca noua la fiecare sapatura — dar pe alt nivel.
  for (let i = 0; i < 6; i++) {
    const ep = w.camere.epoca
    assert.ok(dig(w.terrain, wx + 17, wy + 12 + i, g - 4).ok)
    sincronizeazaCamere(w.camere, w.terrain)
    assert.notEqual(w.camere.epoca, ep, 'sapatura sub pamant muta epoca (altfel proba n-ar masura nimic)')
    rebuildCamereOverlay(o, w, g + 1)
  }
  assert.equal(o.reconstructii, 1, 'sase epoci noi pe alt nivel: nicio reconstructie')
  assert.equal(o.sarite, 6)
  assert.deepEqual(desen(o), desen(overlay(w, g + 1)), 'desenul sarit e cel al unei reconstructii complete')
  // Un stalp in casa, pe nivelul desenat: se reface.
  assert.ok(fill(w.terrain, wx + 3, wy + 3, g + 1, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  rebuildCamereOverlay(o, w, g + 1)
  assert.equal(o.reconstructii, 2, 'o editare pe nivel il reface')
  assert.deepEqual(desen(o), desen(overlay(w, g + 1)))
  assert.ok(o.materiale.tenta === materiale.tenta && o.materiale.hasuri === materiale.hasuri && o.materiale.stalpi === materiale.stalpi, 'aceleasi materiale')
  assert.equal(eliberari(), 0, 'o reconstructie elibereaza doar geometria: materialele (si programele GL) raman')
  const tenta = o.group.children.find((c) => (c as THREE.Mesh).material === o.materiale.tenta) as THREE.Mesh | undefined
  assert.ok(tenta && tenta.geometry.getAttribute('position').count > 0, 'tenta e in grup, cu varfuri')
})

test('overlay I (ECR-2): o fereastra la etaj deschide incaperea FARA sa atinga feliile nivelului de jos — nivelul de jos se reface (tripletul)', () => {
  const { w, wx, wy, g } = sitPlat(777, 10)
  casa(w, wx + 1, wy + 1, g, 5, 5, 3, Material.USA)
  sincronizeazaCamere(w.camere, w.terrain)
  const o = overlay(w, g + 1)
  assert.equal(o.incaperi, 1)
  const inainte = amprentaNivel(w.camere, g + 1)
  // Fereastra in zidul de vest, la g+3: sub ea e zid, deci jurnalul reface doar feliile de la g+3.
  assert.ok(dig(w.terrain, wx + 1, wy + 3, g + 3).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const dupa = amprentaNivel(w.camere, g + 1)
  assert.ok(inainte.felii.length === dupa.felii.length && inainte.felii.every((f, i) => f === dupa.felii[i]), 'feliile nivelului g+1 sunt ACELEASI obiecte (proba masoara tripletul, nu feliile)')
  rebuildCamereOverlay(o, w, g + 1)
  assert.equal(o.reconstructii, 2, 'componenta s-a deschis prin etaj: nivelul de jos se reface')
  assert.deepEqual([o.incaperi, o.deschise], [0, 1], 'hasuri in loc de tenta')
  assert.deepEqual(desen(o), desen(overlay(w, g + 1)))
  // Felia refacuta cu aceleasi triplete (componenta actualizata pe loc — calea rapida IDX-1 din recenzia
  // indexului o face posibila): obiectul nou al feliei singur cere reconstructia.
  const f1 = {}, f2 = {}
  assert.equal(aceeasiAmprenta({ felii: [f1], comp: [3, 1, 70] }, { felii: [f1], comp: [3, 1, 70] }), true)
  assert.equal(aceeasiAmprenta({ felii: [f1], comp: [3, 1, 70] }, { felii: [f2], comp: [3, 1, 70] }), false, 'alt obiect felie, aceleasi triplete: se reface')
  assert.equal(aceeasiAmprenta({ felii: [f1], comp: [3, 1, 70] }, { felii: [f1], comp: [3, 0, 70] }), false)
})

test('overlay I (ECR-2): dupa fiecare editare dintr-un fuzz, desenul pe trei niveluri e identic cu o reconstructie completa', () => {
  const { w, wx, wy, g } = sitPlat(4242, 20)
  casa(w, wx + 1, wy + 1, g, 5, 5, 3, Material.USA)
  casa(w, wx + 6, wy + 1, g, 5, 5, 2, null)
  hala(w, wx + 2, wy + 9, g, 6)
  sincronizeazaCamere(w.camere, w.terrain)
  const niveluri = [g + 1, g + 2, g - 4]
  const inc = niveluri.map((z) => overlay(w, z))
  let s = 99
  const rnd = (n: number): number => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n }
  let editari = 0
  for (let i = 0; i < 400; i++) {
    const x = wx + rnd(14), y = wy + rnd(17), z = g - 5 + rnd(10)
    const m = materialAt(w.terrain, x, y, z)
    if (!m.ok) continue
    const ok = isSolid(m.value) ? dig(w.terrain, x, y, z).ok : m.value === Material.AER ? fill(w.terrain, x, y, z, rnd(4) === 0 ? Material.USA : P).ok : false
    if (!ok) continue
    editari++
    sincronizeazaCamere(w.camere, w.terrain)
    niveluri.forEach((z0, k) => {
      rebuildCamereOverlay(inc[k]!, w, z0)
      assert.deepEqual(desen(inc[k]!), desen(overlay(w, z0)), `editarea ${editari} (${x - wx},${y - wy},${z - g}), nivelul g${z0 - g >= 0 ? '+' : ''}${z0 - g}`)
    })
  }
  const sarite = inc.reduce((a, o) => a + o.sarite, 0)
  const refacute = inc.reduce((a, o) => a + o.reconstructii, 0)
  assert.ok(editari >= 200 && sarite >= 50 && refacute >= 50, `fuzz-ul trece prin ambele cai: ${editari} editari, ${sarite} sarite, ${refacute} reconstructii`)
})
