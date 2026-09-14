/**
 * Cat costa un chunk NE-promovat, defalcat.
 *
 *   node tools/bench-heightfield.mjs
 *
 * Conteaza fiindca in S-TRAVERSE — scenariul pe care predictia sigilata il da
 * drept primul care pica — o trecere de granita aduce 23 de chunk-uri NOI, si
 * aproape toate sunt ne-promovate.
 */

import * as THREE from 'three'
import { meshHeightfield } from '../src/render/heightfield.ts'
import { createTerrain, setFocus } from '../src/sim/terrain/terrain.ts'
import { format, repeat } from '../src/harness/measure.ts'

const SEED = 20260913
const t = createTerrain(SEED, 4)
setFocus(t, 300, 300)
const chunk = t.chunks.get(300 * 512 + 300)

function pad(label, value) {
  console.log(`${label.padEnd(40)} ${value}`)
}

const mesh = repeat(() => {
  const t0 = performance.now()
  meshHeightfield(SEED, chunk)
  return (performance.now() - t0) * 1000
}, 30)
pad('meshHeightfield', format(mesh, 'µs', 0))

const hf = meshHeightfield(SEED, chunk)
const geoBuild = repeat(() => {
  const t0 = performance.now()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(hf.positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(hf.colors, 3))
  geo.setIndex(new THREE.BufferAttribute(hf.indices, 1))
  const r = (performance.now() - t0) * 1000
  geo.dispose()
  return r
})
pad('BufferGeometry, fara normale', format(geoBuild, 'µs', 0))

// Cat costa varianta VECHE, ca sa existe cu ce compara.
const withNormals = repeat(() => {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(hf.positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(hf.colors, 3))
  geo.setIndex(new THREE.BufferAttribute(hf.indices, 1))
  const t0 = performance.now()
  geo.computeVertexNormals()
  const r = (performance.now() - t0) * 1000
  geo.dispose()
  return r
}, 30)
pad('computeVertexNormals (varianta veche)', format(withNormals, 'µs', 0))

// Indicii sunt identici intre chunk-uri?
const a = meshHeightfield(SEED, t.chunks.get(300 * 512 + 300))
const b = meshHeightfield(SEED, t.chunks.get(301 * 512 + 302))
let identici = a.indices.length === b.indices.length
for (let i = 0; identici && i < a.indices.length; i++) if (a.indices[i] !== b.indices[i]) identici = false
console.log('')
pad('indici identici intre doua chunk-uri', identici ? 'DA' : 'NU')
pad('  octeti per chunk', `${(a.indices.byteLength / 1024).toFixed(1)} KB`)
pad('  × 377 chunk-uri rezidente', `${((a.indices.byteLength * 377) / 1024 / 1024).toFixed(1)} MB duplicati`)
