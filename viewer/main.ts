/**
 * Viewer de teren.
 *
 * Prima data cand se vede ceva. NU e joc: e unealta cu care se masoara gate-ul de
 * motor de la S8 si cu care se verifica vizual arhitectura — peisajul e plan de
 * triunghiuri ieftine, iar acolo unde s-a sapat apare geometrie de voxeli.
 *
 * Tot ce e aici citeste starea de simulare READ-ONLY, prin comenzi. Daca stergi
 * folderul asta, harness-ul headless compileaza si trece testele mai departe.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { createWorld } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { CHUNK_CELLS, Material, VOXEL_LEVELS } from '../src/sim/terrain/chunk.ts'
import type { Chunk } from '../src/sim/terrain/chunk.ts'
import { groundLevelM } from '../src/sim/terrain/terrain.ts'
import { Biome, MACRO_METERS, sampleMacro } from '../src/sim/terrain/macro.ts'
import { meshChunk } from '../src/render/mesher.ts'
import { meshHeightfield } from '../src/render/heightfield.ts'

const SEED = 20260913
/** Cate chunk-uri in jurul focusului se deseneaza. 11 = discul rezident intreg. */
const VIEW_RADIUS = 11

// --- paleta de materiale, aceeasi logica de culoare ca la teren ---
const MATERIAL_COLOR: Record<number, number> = {
  [Material.ROCA]: 0x6b6a66,
  [Material.PAMANT]: 0x6a5a45,
  [Material.IARBA]: 0x5c7040,
  [Material.APA]: 0x35566f,
  [Material.LEMN_CONSTRUIT]: 0x8a6a42,
  [Material.PIATRA_CONSTRUITA]: 0x8d8b84,
}
/** Umbrire per directie de fata, ca volumele sa se citeasca fara lumini scumpe. */
const FACE_SHADE = [0.82, 0.72, 0.9, 0.66, 1.0, 0.55]

const busy = document.getElementById('busy')!
const hud = document.getElementById('hud')!
const el = (id: string) => document.getElementById(id)!

// --------------------------------------------------------------------------
// 1. lumea
// --------------------------------------------------------------------------

/**
 * Cauta un loc LOCUIBIL, in loc sa aterizeze orbeste.
 *
 * Prima versiune punea camera la un chunk fix si a nimerit un bazin la -80 m,
 * adica sub nivelul apei — tot ce se vedea era clasificat drept apa. Un joc
 * asaza jucatorul intr-o vale buna, nu la intamplare; viewerul face la fel,
 * si alegerea ramane determinista pentru acelasi seed.
 */
function findSettleableChunk(): { cx: number; cy: number } {
  let best = { cx: 250, cy: 250, score: -Infinity }
  for (let cy = 60; cy < 460; cy += 7) {
    for (let cx = 60; cx < 460; cx += 7) {
      const sx = (cx * CHUNK_CELLS) / MACRO_METERS
      const sy = (cy * CHUNK_CELLS) / MACRO_METERS
      const s = sampleMacro(SEED, sx, sy)
      if (s.biome === Biome.APA) continue
      if (s.heightDm < 50 || s.heightDm > 700) continue
      const around = [
        sampleMacro(SEED, sx + 2, sy).heightDm,
        sampleMacro(SEED, sx - 2, sy).heightDm,
        sampleMacro(SEED, sx, sy + 2).heightDm,
        sampleMacro(SEED, sx, sy - 2).heightDm,
      ]
      // Un pic de relief e bun — o vale in care sa sapi. Prea mult inseamna perete.
      const spread = Math.max(...around) - Math.min(...around)
      const score = s.soil + Math.min(spread, 300) / 4 - Math.max(0, spread - 400) / 2
      if (score > best.score) best = { cx, cy, score }
    }
  }
  return { cx: best.cx, cy: best.cy }
}

const spot = findSettleableChunk()
const FOCUS_CX = spot.cx
const FOCUS_CY = spot.cy

const world = createWorld(SEED)
applyCommand(world, { kind: 'setFocus', cx: FOCUS_CX, cy: FOCUS_CY })

const baseX = FOCUS_CX * CHUNK_CELLS
const baseY = FOCUS_CY * CHUNK_CELLS

/** Sapa o fortareata plauzibila, ca sa existe ce privi: camere, coridor, curte. */
function buildFortress(): void {
  const dig = (wx: number, wy: number, z: number) => applyCommand(world, { kind: 'dig', wx, wy, z })
  const fill = (wx: number, wy: number, z: number, material: number) =>
    applyCommand(world, { kind: 'fill', wx, wy, z, material: material as 5 | 6 })

  // Patru camere pe doua niveluri sub sol.
  for (const [ox, oy] of [[4, 4], [22, 4], [4, 22], [22, 22]] as const) {
    for (let d = 1; d <= 3; d++) {
      for (let ry = 0; ry < 7; ry++) {
        for (let rx = 0; rx < 9; rx++) {
          const g = groundLevelM(world.terrain, baseX + ox + rx, baseY + oy + ry)
          if (g.ok) dig(baseX + ox + rx, baseY + oy + ry, g.value - d)
        }
      }
    }
  }
  // Un coridor care le leaga, pe toata latimea.
  for (let i = 0; i < CHUNK_CELLS * 2; i++) {
    for (let d = 1; d <= 2; d++) {
      const g = groundLevelM(world.terrain, baseX + i, baseY + 16)
      if (g.ok) dig(baseX + i, baseY + 16, g.value - d)
    }
  }
  // Un zid de piatra deasupra solului, ca sa se vada si constructia, nu doar saparea.
  for (let i = 2; i < 30; i++) {
    for (let h = 1; h <= 4; h++) {
      const g = groundLevelM(world.terrain, baseX + i, baseY + 2)
      if (g.ok) fill(baseX + i, baseY + 2, g.value + h, Material.PIATRA_CONSTRUITA)
    }
  }
  // Un turn.
  for (let ry = 0; ry < 5; ry++) {
    for (let rx = 0; rx < 5; rx++) {
      const onEdge = rx === 0 || ry === 0 || rx === 4 || ry === 4
      if (!onEdge) continue
      for (let h = 1; h <= 9; h++) {
        const g = groundLevelM(world.terrain, baseX + 14 + rx, baseY + 8 + ry)
        if (g.ok) fill(baseX + 14 + rx, baseY + 8 + ry, g.value + h, Material.PIATRA_CONSTRUITA)
      }
    }
  }
}

buildFortress()

// --------------------------------------------------------------------------
// 2. scena
// --------------------------------------------------------------------------

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0d0f10)
scene.fog = new THREE.Fog(0x0d0f10, 260, 900)

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 3000)
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

scene.add(new THREE.HemisphereLight(0xbcd3e0, 0x3a3529, 1.5))
const sun = new THREE.DirectionalLight(0xfff0d8, 1.4)
sun.position.set(0.5, 1, 0.35)
scene.add(sun)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.maxPolarAngle = Math.PI * 0.49

const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true })
const voxelMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })

/** Un mesh per chunk, ca sa se poata reconstrui doar cel murdarit. */
const meshes = new Map<number, THREE.Mesh>()
const group = new THREE.Group()
scene.add(group)

let totalQuads = 0
let promotedCount = 0

function buildVoxelGeometry(chunk: Chunk): THREE.BufferGeometry | null {
  const mesh = meshChunk(chunk)
  if (mesh.quadCount === 0) return null
  totalQuads += mesh.quadCount

  const positions = new Float32Array(mesh.quadCount * 4 * 3)
  const colors = new Float32Array(mesh.quadCount * 4 * 3)
  const indices = new Uint32Array(mesh.quadCount * 6)
  const zBase = chunk.voxels!.zBaseM

  for (let q = 0; q < mesh.quadCount; q++) {
    const src = q * 12
    const dst = q * 12
    for (let v = 0; v < 4; v++) {
      positions[dst + v * 3] = mesh.positions[src + v * 3]!
      // Nivelul 0 al stivei sta la cota zBase, nu la zero.
      positions[dst + v * 3 + 1] = mesh.positions[src + v * 3 + 2]! + zBase
      positions[dst + v * 3 + 2] = mesh.positions[src + v * 3 + 1]!
    }
    const base = MATERIAL_COLOR[mesh.materials[q]!] ?? 0x999999
    const shade = FACE_SHADE[mesh.faces[q]!] ?? 1
    const r = (((base >> 16) & 255) / 255) * shade
    const g = (((base >> 8) & 255) / 255) * shade
    const b = ((base & 255) / 255) * shade
    for (let v = 0; v < 4; v++) {
      colors[dst + v * 3] = r
      colors[dst + v * 3 + 1] = g
      colors[dst + v * 3 + 2] = b
    }
    // Winding-ul.
    //
    // Mesher-ul emite aceeasi ordine de colturi pentru ambele directii ale unei
    // axe, iar trecerea in spatiul lui three schimba Y cu Z, ceea ce OGLINDESTE
    // spatiul si inverseaza toate windingurile. Verificat analitic, nu ghicit:
    // pentru fata de sus (Z_POS), ordinea A,B,C da produsul vectorial -Y, dar
    // avem nevoie de +Y. Deci directiile POZITIVE (0, 2, 4) se inverseaza,
    // iar cele negative raman. Fara asta, jumatate din fete sunt back-facing,
    // sunt eliminate de culling, si se vede fundalul prin geometrie.
    const o = q * 4
    const i = q * 6
    if ((mesh.faces[q]! & 1) === 1) {
      indices[i] = o; indices[i + 1] = o + 1; indices[i + 2] = o + 2
      indices[i + 3] = o; indices[i + 4] = o + 2; indices[i + 5] = o + 3
    } else {
      indices[i] = o; indices[i + 1] = o + 2; indices[i + 2] = o + 1
      indices[i + 3] = o; indices[i + 4] = o + 3; indices[i + 5] = o + 2
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  return geo
}

function buildChunkMesh(chunk: Chunk): void {
  const key = chunk.cy * 512 + chunk.cx
  const old = meshes.get(key)
  if (old) {
    group.remove(old)
    old.geometry.dispose()
    meshes.delete(key)
  }

  let mesh: THREE.Mesh
  if (chunk.voxels) {
    promotedCount++
    const geo = buildVoxelGeometry(chunk)
    if (!geo) return
    mesh = new THREE.Mesh(geo, voxelMaterial)
  } else {
    const hf = meshHeightfield(SEED, chunk)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(hf.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(hf.colors, 3))
    geo.setIndex(new THREE.BufferAttribute(hf.indices, 1))
    geo.computeVertexNormals()
    mesh = new THREE.Mesh(geo, terrainMaterial)
  }

  mesh.position.set(chunk.cx * CHUNK_CELLS, 0, chunk.cy * CHUNK_CELLS)
  group.add(mesh)
  meshes.set(key, mesh)
}

const buildStart = performance.now()
for (const key of world.terrain.keys) {
  const chunk = world.terrain.chunks.get(key)!
  const d2 = (chunk.cx - FOCUS_CX) ** 2 + (chunk.cy - FOCUS_CY) ** 2
  if (d2 > VIEW_RADIUS * VIEW_RADIUS) continue
  buildChunkMesh(chunk)
}
const buildMs = performance.now() - buildStart

// Camera peste fortareata, nu peste mijlocul geometric al discului.
const centerX = baseX + 16
const centerZ = baseY + 16
const gCenter = groundLevelM(world.terrain, centerX, centerZ)
const centerY = gCenter.ok ? gCenter.value : 0
controls.target.set(centerX, centerY + 4, centerZ)
camera.position.set(centerX - 46, centerY + 34, centerZ + 46)
controls.update()

// --------------------------------------------------------------------------
// 3. slice view — ascunde tot ce e peste nivelul activ
// --------------------------------------------------------------------------

let sliceLevel = VOXEL_LEVELS
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)

function applySlice(): void {
  if (sliceLevel >= VOXEL_LEVELS) {
    renderer.clippingPlanes = []
    el('slice').textContent = 'toate'
  } else {
    clipPlane.constant = sliceLevel
    renderer.clippingPlanes = [clipPlane]
    el('slice').textContent = `${sliceLevel} m`
  }
}
renderer.localClippingEnabled = true
applySlice()

// --------------------------------------------------------------------------
// 4. interactiune: sapa si construieste
// --------------------------------------------------------------------------

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let dragged = false

renderer.domElement.addEventListener('pointerdown', () => { dragged = false })
renderer.domElement.addEventListener('pointermove', () => { dragged = true })

renderer.domElement.addEventListener('click', (ev) => {
  if (dragged) return
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(group.children, false)
  if (hits.length === 0) return

  const p = hits[0]!.point
  const wx = Math.floor(p.x)
  const wy = Math.floor(p.z)
  const z = Math.round(p.y)

  const out = ev.shiftKey
    ? applyCommand(world, { kind: 'fill', wx, wy, z: z + 1, material: Material.PIATRA_CONSTRUITA })
    : applyCommand(world, { kind: 'dig', wx, wy, z })

  if (!out.ok) return

  // Se reconstruieste DOAR chunk-ul atins si vecinii lui — apron-ul poate fi
  // promovat de aceasta comanda, deci si ei s-au schimbat.
  const cx = Math.floor(wx / CHUNK_CELLS)
  const cy = Math.floor(wy / CHUNK_CELLS)
  totalQuads = 0
  promotedCount = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = world.terrain.chunks.get((cy + dy) * 512 + (cx + dx))
      if (c) buildChunkMesh(c)
    }
  }
  recount()
})

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'q' || ev.key === 'Q') sliceLevel = Math.max(0, sliceLevel - 1)
  else if (ev.key === 'e' || ev.key === 'E') sliceLevel = Math.min(VOXEL_LEVELS, sliceLevel + 1)
  else if (ev.key === 'r' || ev.key === 'R') sliceLevel = VOXEL_LEVELS
  else return
  applySlice()
})

// --------------------------------------------------------------------------
// 5. HUD si masuratori
// --------------------------------------------------------------------------

function recount(): void {
  let quads = 0
  let promoted = 0
  for (const key of world.terrain.keys) {
    const c = world.terrain.chunks.get(key)!
    if (c.voxels) promoted++
  }
  for (const m of meshes.values()) {
    const idx = m.geometry.getIndex()
    if (m.material === voxelMaterial && idx) quads += idx.count / 6
  }
  el('chunks').textContent = String(meshes.size)
  el('promoted').textContent = String(promoted)
  el('quads').textContent = quads.toLocaleString('ro-RO')
}

const frames: number[] = []
let last = performance.now()
let hudTimer = 0

function tick(): void {
  requestAnimationFrame(tick)
  const now = performance.now()
  const dt = now - last
  last = now

  frames.push(dt)
  if (frames.length > 240) frames.shift()

  controls.update()
  renderer.render(scene, camera)

  hudTimer += dt
  if (hudTimer > 400) {
    hudTimer = 0
    const sorted = [...frames].sort((a, b) => a - b)
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 0
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0
    el('fps').textContent = mid > 0 ? (1000 / mid).toFixed(0) : '—'
    el('p99').textContent = `${p99.toFixed(1)} ms`
    el('calls').textContent = String(renderer.info.render.calls)
    el('tris').textContent = renderer.info.render.triangles.toLocaleString('ro-RO')
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

recount()
el('backend').textContent = `WebGL · ${buildMs.toFixed(0)} ms build`
busy.remove()
hud.removeAttribute('hidden')
tick()

// Expus pentru masuratori din consola, nu pentru joc.
Object.assign(globalThis, { __kinstead: { world, renderer, scene, camera, controls, frames } })
