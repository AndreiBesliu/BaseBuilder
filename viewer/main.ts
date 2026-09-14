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
import { describe } from '../src/sim/result.ts'
import { CHUNK_CELLS, Material, VOXEL_LEVELS } from '../src/sim/terrain/chunk.ts'
import type { Chunk } from '../src/sim/terrain/chunk.ts'
import { groundLevelM, inWorld } from '../src/sim/terrain/terrain.ts'
import { Biome, MACRO_METERS, sampleMacro } from '../src/sim/terrain/macro.ts'
import { Face, meshChunk } from '../src/render/mesher.ts'
import { quadColor } from '../src/render/palette.ts'
import { Ballast, Bisector, checkGuards, clockGranularityMs, FrameProbe, heapMB } from './probe.ts'
import { meshHeightfield } from '../src/render/heightfield.ts'
import { buildM10 } from '../src/harness/fixture-m10.ts'

const SEED = 20260913
/** Cate chunk-uri in jurul focusului se deseneaza. 11 = discul rezident intreg. */
const VIEW_RADIUS = 11

// Parametrii de rulare se citesc din URL, nu din taste: o rulare de gate trebuie
// sa poata fi repornita identic si sa-si scrie propriile metadate.
const params = new URLSearchParams(location.search)
/** Scenariul de gate. Absent = explorare libera, cu fortareata mica. */
const SCENARIO = params.get('scenario')
/** Proba negativa ceruta: instrumentul TREBUIE sa iasa rosu pe ea. */
const NEGATIVE_PROBE = params.get('probe')

// Paleta si regula de culoare stau in src/render/palette.ts, una singura pentru
// teren si pentru voxeli. `FACE_SHADE` a disparut: umbrirea per directie era un
// inlocuitor de lumina, iar acum voxelii primesc ACEEASI lumina ca heightfield-ul,
// deci ar fi fost numarata de doua ori.

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

// Pe ce se masoara.
//
// Fortareata de mai sus promoveaza 12 chunk-uri. Fixtura M10 promoveaza 225 —
// adica bugetul din PLAN §2 pentru asezarea de la luna 10. Un gate rulat pe cea
// mica trece cu ORICE stiva si nu spune nimic; e fals pozitiv prin constructie.
// De asta scenariile de gate incarca mereu M10, si niciodata fortareata.
if (SCENARIO === null) {
  buildFortress()
} else {
  buildM10(world.terrain, FOCUS_CX, FOCUS_CY)
}

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
// Aceeasi lege de lumina ca terenul. Inainte era MeshBasicMaterial — adica zona
// sapata NU primea deloc lumina si nu putea raspunde la soare, iar la cusatura
// K16 sarea si modelul de iluminare, nu doar geometria.
const voxelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true })

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
  const normals = new Float32Array(mesh.quadCount * 4 * 3)
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
    const face = mesh.faces[q]!
    const [r, g, b] = quadColor(mesh.materials[q]!, face)
    // Normala e AXIALA si se stie din directia fetei — gratis, fara atribut in
    // mesher si fara computeVertexNormals, care pe cuburi ar media colturile si
    // ar rotunji exact ce nu trebuie. Indicii 0-5 sunt in spatiul MESHER-ului
    // (X, Y, Z-in-sus); aici Y si Z sunt deja schimbate, ca la pozitii.
    const nx = face === Face.X_POS ? 1 : face === Face.X_NEG ? -1 : 0
    const ny = face === Face.Z_POS ? 1 : face === Face.Z_NEG ? -1 : 0
    const nz = face === Face.Y_POS ? 1 : face === Face.Y_NEG ? -1 : 0
    for (let v = 0; v < 4; v++) {
      colors[dst + v * 3] = r
      colors[dst + v * 3 + 1] = g
      colors[dst + v * 3 + 2] = b
      normals[dst + v * 3] = nx
      normals[dst + v * 3 + 1] = ny
      normals[dst + v * 3 + 2] = nz
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
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
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
// 2b. streaming — discul rezident urmareste camera
// --------------------------------------------------------------------------
//
// Pana acum viewerul construia o data discul de 377 de chunk-uri si nu mai
// streama niciodata. Adica S-TRAVERSE — exact scenariul scris in PLAN.md ca
// gate de motor — nu se putea rula deloc.
//
// Doua lucruri DIFERITE, care se confunda usor si nu trebuie:
//   REZIDENTA  (date)  — `setFocus` in sim: ce chunk-uri exista in memorie.
//                        Nu arunca NICIODATA un chunk promovat: acolo e munca
//                        jucatorului.
//   VIZIBILITATE (mesh) — ce are geometrie pe GPU. Un chunk promovat de acum
//                        trei vai ramane in date, dar nu merita un draw call.
// De asta evacuarea de mesh-uri se face pe VIEW_RADIUS, nu pe promovare.

/** Cate chunk-uri se construiesc cel mult intr-un cadru. Bugetul, nu graba. */
const BUILD_BUDGET_PER_FRAME = 2

let focusCx = FOCUS_CX
let focusCy = FOCUS_CY
/** Chei de chunk asteptand geometrie, sortate DESCRESCATOR dupa distanta: `pop()` ia cel mai apropiat. */
const buildQueue: number[] = []
let lastFocusMs = 0

function dropMesh(key: number): void {
  const mesh = meshes.get(key)
  if (!mesh) return
  group.remove(mesh)
  // `leakProbeActive` NU e un flag de configurare: e proba negativa B din
  // bench/GATE.md §6. Daca sonda nu vede contorul de geometrii crescand monoton
  // cand asta e pornit, sonda e stricata si n-are dreptul sa dea verde.
  if (!leakProbeActive) mesh.geometry.dispose()
  meshes.delete(key)
}

/** Pune in coada tot ce e in raza de desen si n-are inca geometrie. */
function enqueueVisible(): void {
  buildQueue.length = 0
  const r2 = VIEW_RADIUS * VIEW_RADIUS
  for (const key of world.terrain.keys) {
    if (meshes.has(key)) continue
    const c = world.terrain.chunks.get(key)!
    const d2 = (c.cx - focusCx) ** 2 + (c.cy - focusCy) ** 2
    if (d2 > r2) continue
    buildQueue.push(key)
  }
  // Cele mai departate primele, ca `pop()` sa scoata mereu cel mai apropiat chunk.
  buildQueue.sort((a, b) => {
    const ca = world.terrain.chunks.get(a)!
    const cb = world.terrain.chunks.get(b)!
    const da = (ca.cx - focusCx) ** 2 + (ca.cy - focusCy) ** 2
    const db = (cb.cx - focusCx) ** 2 + (cb.cy - focusCy) ** 2
    return db - da
  })
}

/** Muta centrul discului daca privirea a trecut granita unui chunk. */
function updateFocus(): void {
  const cx = Math.floor(controls.target.x / CHUNK_CELLS)
  const cy = Math.floor(controls.target.z / CHUNK_CELLS)
  if (cx === focusCx && cy === focusCy) return
  if (!inWorld(cx, cy)) return

  const t0 = performance.now()
  focusCx = cx
  focusCy = cy
  applyCommand(world, { kind: 'setFocus', cx, cy })

  const r2 = VIEW_RADIUS * VIEW_RADIUS
  for (const key of [...meshes.keys()]) {
    const c = world.terrain.chunks.get(key)
    // Iesit din rezidenta (aruncat de sim) SAU iesit din raza de desen.
    if (!c || (c.cx - focusCx) ** 2 + (c.cy - focusCy) ** 2 > r2) dropMesh(key)
  }
  enqueueVisible()
  lastFocusMs = performance.now() - t0
}

// Traversare pe sine — scheletul scenariului S-TRAVERSE din bench/GATE.md §5.
//
// Doua ceasuri, deliberat, fiindca masoara lucruri diferite:
//   TIMP REAL      — stresul real de streaming. Pe asta se da verdictul.
//   PAS FIX 1/60 s — acelasi traseu si acelasi numar de cadre in orice rulare,
//                    deci comparabilitate intre configuratii.
// Cu pas fix, o configuratie lenta primeste MAI MULT timp de perete pe metru,
// deci un streamer asincron arata mai bine decat va fi in joc: fals PASS structural.
/** Viteza de traversare, in metri pe secunda. */
const TRAVERSE_MPS = 40
/** Pasul de timp simulat, cand traversarea ruleaza pe ceas fix. */
const FIXED_STEP_S = 1 / 60

let traversing = false
let traverseFixedClock = false
/** +1 sau -1. Intoarcerea nu e un moft: e S4b din protocol — daca a doua trecere
 *  peste acelasi teren e mai slaba decat prima, ai acumulare (leak, fragmentare,
 *  cache invalidat), indiferent ce arata media. */
let traverseDir = 1

function stepTraverse(dtMs: number): void {
  if (!traversing) return
  const dt = traverseFixedClock ? FIXED_STEP_S : dtMs / 1000
  const d = TRAVERSE_MPS * dt * traverseDir
  controls.target.x += d
  camera.position.x += d
}

/** Construieste cel mult BUILD_BUDGET_PER_FRAME chunk-uri. Restul asteapta. */
function pumpBuildQueue(): void {
  let built = 0
  while (buildQueue.length > 0 && built < BUILD_BUDGET_PER_FRAME) {
    const key = buildQueue.pop()!
    const c = world.terrain.chunks.get(key)
    if (!c || meshes.has(key)) continue
    buildChunkMesh(c)
    built++
  }
  if (built > 0) recount()
}

// --------------------------------------------------------------------------
// 3. slice view — ascunde tot ce e peste nivelul activ
// --------------------------------------------------------------------------

let sliceLevel = VOXEL_LEVELS
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)

// Planul e MEREU activ, si cand slice-ul e oprit: impins atat de sus incat nu
// taie nimic. Motivul e de masuratoare, nu de randare — numarul de clipping
// planes intra in cheia de program a shaderului, deci comutarea 0↔1 forteaza o
// recompilare, adica un cadru lung care arata exact ca un hiccup de streaming.
// Cu planul constant, un cadru lung la schimbarea de nivel e o constatare reala.
const SLICE_OFF = 1e6

function applySlice(): void {
  if (sliceLevel >= VOXEL_LEVELS) {
    clipPlane.constant = SLICE_OFF
    el('slice').textContent = 'toate'
  } else {
    clipPlane.constant = sliceLevel
    el('slice').textContent = `${sliceLevel} m`
  }
}
renderer.localClippingEnabled = true
renderer.clippingPlanes = [clipPlane]
applySlice()

// --------------------------------------------------------------------------
// 4. interactiune: sapa si construieste
// --------------------------------------------------------------------------

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

// Drag vs. click se decide pe DISTANTA, nu pe „a existat un pointermove".
// Varianta cu flag ignora orice click in care mouse-ul tremura un pixel intre
// apasare si eliberare — adica majoritatea clickurilor facute cu mana, si toate
// cele facute de un harness de automatizare.
const DRAG_PX = 4
let downX = 0
let downY = 0
let moved = 0

renderer.domElement.addEventListener('pointerdown', (ev) => {
  downX = ev.clientX
  downY = ev.clientY
  moved = 0
})
renderer.domElement.addEventListener('pointermove', (ev) => {
  const dx = ev.clientX - downX
  const dy = ev.clientY - downY
  moved = Math.max(moved, Math.hypot(dx, dy))
})

renderer.domElement.addEventListener('click', (ev) => {
  if (moved > DRAG_PX) return
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(group.children, false)
  if (hits.length === 0) return

  // Punctul de impact sta EXACT pe suprafata, deci nu apartine niciunei celule:
  // rotunjirea lui nimerea sistematic celula de deasupra solului, adica aer, iar
  // fiecare click se termina in LIPSA_MATERIAL. Corect e sa intri o jumatate de
  // celula in directia normalei — inauntru pentru sapat, in afara pentru zidit.
  //
  // Merge la fel pe suprafata de heightfield (unde cota e fractionara: teren la
  // -4,37 m inseamna sol solid de la -5 in jos) si pe o fata de voxel (unde cota
  // e intreaga si punctul cade fix pe granita dintre doua celule).
  const hit = hits[0]!
  const normal = hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0)
  const target = hit.point.clone().addScaledVector(normal, ev.shiftKey ? 0.5 : -0.5)

  const wx = Math.floor(target.x)
  const wy = Math.floor(target.z)
  const z = Math.floor(target.y)

  // Cine era deja promovat INAINTE de comanda. Diferenta de dupa spune exact
  // ce mesh trebuie refacut.
  const promotedBefore = new Set<number>()
  for (const k of world.terrain.keys) {
    if (world.terrain.chunks.get(k)!.voxels !== null) promotedBefore.add(k)
  }

  const out = ev.shiftKey
    ? applyCommand(world, { kind: 'fill', wx, wy, z, material: Material.PIATRA_CONSTRUITA })
    : applyCommand(world, { kind: 'dig', wx, wy, z })

  // Un refuz care nu se vede e un buton care „nu face nimic". Contractul de
  // Outcome poarta motivul — ar fi absurd sa-l arunc exact la capatul lantului.
  if (!out.ok) {
    console.warn(`refuzat la ${wx},${wy},${z}: ${describe(out)}`)
    return
  }

  // Se reconstruieste chunk-ul atins plus vecinii care CHIAR s-au schimbat.
  //
  // `dig` promoveaza un apron de 3×3, dar numai prima data: la a doua sapatura
  // in acelasi chunk, vecinii sunt deja promovati si mesh-ul lor e neschimbat.
  // Varianta care remesh-uia mereu 3×3 platea 9× pretul pentru un singur chunk
  // murdar — 5,4 ms in loc de ~0,6 — si ar fi intrat in gate ca „limita stivei".
  const cx = Math.floor(wx / CHUNK_CELLS)
  const cy = Math.floor(wy / CHUNK_CELLS)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = (cy + dy) * 512 + (cx + dx)
      const c = world.terrain.chunks.get(key)
      if (!c) continue
      const wasPromoted = promotedBefore.has(key)
      const isCenter = dx === 0 && dy === 0
      if (isCenter || !wasPromoted) buildChunkMesh(c)
    }
  }
  recount()
})

window.addEventListener('keydown', (ev) => {
  if (ev.key === 't' || ev.key === 'T') {
    if (ev.shiftKey) traverseDir = -traverseDir
    else traversing = !traversing
    return
  }
  if (ev.key === 'f' || ev.key === 'F') {
    traverseFixedClock = !traverseFixedClock
    return
  }
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

// --- modul de gate, comandat din URL ca rularea sa fie reproductibila ---------
//
// Tastele sunt bune pentru explorat, dar o rulare de gate trebuie sa poata fi
// repornita identic si sa-si scrie propriile metadate. De aia scenariul, balastul
// si bisectia se cer prin `?scenario=...&ballast=1&bisect=1`, nu din degete.
// GPU-ul REAL, nu „WebGL". Masina asta are si un iGPU AMD langa 3060, iar un
// fallback tacut pe el (sau pe SwiftShader) explica singur diferente de 3×.
// E conditia de invalidare nr. 2 din bench/GATE.md — deci trebuie sa se VADA.
function gpuName(): string {
  const gl = renderer.getContext()
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  if (!ext) return 'WebGL (GPU necunoscut)'
  return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
}

const probe = new FrameProbe()
const ballast = new Ballast()
ballast.enabled = params.get('ballast') === '1'
const bisector = params.get('bisect') === '1' ? new Bisector() : null
/** Cadre aruncate la inceput: compilare de shadere, JIT, incalzire de driver. */
const WARMUP_FRAMES = Number(params.get('warmup') ?? 300)
/** Cadre utile. NUMAR FIX, nu durata: la durata fixa o configuratie lenta parcurge alt traseu. */
const MEASURED_FRAMES = Number(params.get('frames') ?? 3600)
const gateRun = params.has('scenario') || bisector !== null
let frameIndex = 0
let gateDone = false

// Garda cea mai importanta, si cea mai usor de scris pe jumatate.
//
// Cand fereastra e ascunsa, `requestAnimationFrame` nu mai e apelat deloc: bucla
// nu incetineste, se OPRESTE. Prima versiune de aici asculta doar
// `visibilitychange` — si a ratat exact cazul care conteaza, adica fereastra
// ascunsa DE LA INCEPUT, cand nu se emite niciun eveniment. Rularea parea ca
// merge, dar contorul de cadre era zero.
//
// Deci: ambele. O verificare la pornire SI ascultatorul pentru tranzitii.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') probe.invalidate('fereastra a devenit invizibila in timpul rularii')
})

armNegativeProbe()

const guardFails = checkGuards({
  rendererName: gpuName(),
  expectGpu: 'RTX 3060',
  isDevServer: 'hot' in import.meta,
})
for (const f of guardFails) probe.invalidate(f)

function finishGateRun(): void {
  gateDone = true
  const s = probe.summary()
  const result = {
    meta: {
      scenario: params.get('scenario') ?? 'liber',
      seed: SEED,
      spot: `${FOCUS_CX}/${FOCUS_CY}`,
      renderer: gpuName(),
      ballast: ballast.enabled ? ballast.fingerprint() : 'OPRIT',
      ballastChecksum: ballast.checksum(),
      devicePixelRatio: window.devicePixelRatio,
      canvasPx: `${renderer.domElement.width}×${renderer.domElement.height}`,
      clockGranularityMs: clockGranularityMs(),
      warmupFrames: WARMUP_FRAMES,
      // Vite injecteaza `hot` doar pe dev server. Daca e prezent, rularea e
      // invalida prin protocol: module netranspilate, HMR, sourcemaps.
      isDevServer: 'hot' in import.meta,
    },
    // Contorul de geometrii: proba negativa B nu se poate verifica fara el.
    geometrii: renderer.info.memory.geometries,
    probaNegativa: NEGATIVE_PROBE ?? 'niciuna',
    invalid: probe.invalid,
    xMaxMs: bisector ? bisector.result : null,
    bisectionResolutionMs: bisector ? bisector.resolutionMs : null,
    summary: s,
  }
  Object.assign(globalThis, { __kinsteadResult: result })
  console.log('REZULTAT DE GATE')
  console.log(JSON.stringify(result, null, 2))

  // Rezultatul se scrie pe disc, nu doar in consola. Motivul e practic: rularea
  // are nevoie de o fereastra REALA, vizibila si focalizata — intr-un panou ascuns
  // `requestAnimationFrame` nu e apelat deloc — deci o face un om, iar fisierul e
  // singurul lucru care supravietuieste momentului ala.
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `gate-${result.meta.scenario}-${probe.count}cadre.json`
  a.click()
  URL.revokeObjectURL(a.href)

  const verdict = result.invalid ? `INVALID · ${result.invalid}` : 'rulare valida'
  el('spot').textContent = `GATA · ${verdict} · fisier descarcat`
  el('spot').className = result.invalid ? 'warn' : ''
}

// --------------------------------------------------------------------------
// 5b. scenariile de gate — camera pe sine, nu pe degete
// --------------------------------------------------------------------------
//
// Un om care misca mouse-ul nu produce doua rulari comparabile. Camera merge pe
// TIMP SIMULAT cu pas fix si se opreste la NUMAR FIX de cadre — la durata fixa,
// o configuratie lenta parcurge alt traseu si compari doua scene diferite.
//
// Exceptia e S-TRAVERSE, care se ruleaza pe timp REAL: cu pas fix, o configuratie
// lenta primeste mai mult timp de perete pe metru, deci streamerul asincron arata
// mai bine decat va fi in joc. Fals PASS structural. Vezi bench/GATE.md §5.

/** Cate cadre are o rotatie completa in S-FORTRESS. */
const ORBIT_FRAMES = 1800
/** La ce cadre comuta slice-ul. Numarul de clipping planes ramane CONSTANT. */
const SLICE_AT = [900, 1800, 2700]
/** Sapaturi pe secunda in S-DIG. La 60 fps inseamna una la trei cadre. */
const DIGS_PER_SECOND = 20

const settleCenterX = FOCUS_CX * CHUNK_CELLS + 16
const settleCenterZ = FOCUS_CY * CHUNK_CELLS + 16
let digCursor = 0

function driveScenario(frame: number): void {
  if (SCENARIO === null) return

  if (SCENARIO === 'fortress') {
    const a = (frame / ORBIT_FRAMES) * Math.PI * 2
    const r = 90
    const g = groundLevelM(world.terrain, Math.floor(settleCenterX), Math.floor(settleCenterZ))
    const y = (g.ok ? g.value : 0) + 45
    camera.position.set(settleCenterX + Math.cos(a) * r, y, settleCenterZ + Math.sin(a) * r)
    controls.target.set(settleCenterX, y - 40, settleCenterZ)
    if (SLICE_AT.includes(frame)) {
      sliceLevel = sliceLevel >= VOXEL_LEVELS ? 18 : VOXEL_LEVELS
      applySlice()
    }
    return
  }

  if (SCENARIO === 'dig') {
    // Camera sta; se masoara bucla de constructie, nu cea de privit.
    if (frame % Math.round(60 / DIGS_PER_SECOND) !== 0) return
    // Pozitii deterministe, imprastiate peste asezare cu doua numere prime.
    const span = 13 * CHUNK_CELLS
    const wx = FOCUS_CX * CHUNK_CELLS + ((digCursor * 1237) % span)
    const wy = FOCUS_CY * CHUNK_CELLS + ((digCursor * 7919) % span)
    digCursor++
    const g = groundLevelM(world.terrain, wx, wy)
    if (!g.ok) return
    const out = applyCommand(world, { kind: 'dig', wx, wy, z: g.value - (digCursor % 5) })
    if (!out.ok) return
    const c = world.terrain.chunks.get(Math.floor(wy / CHUNK_CELLS) * 512 + Math.floor(wx / CHUNK_CELLS))
    if (c) buildChunkMesh(c)
    return
  }

  if (SCENARIO === 'traverse') {
    traversing = true
    traverseFixedClock = false
  }
}

// --------------------------------------------------------------------------
// 5c. probele negative — instrumentul TREBUIE sa poata iesi rosu
// --------------------------------------------------------------------------
//
// „Un harness care nu poate produce rosu n-are dreptul sa produca verde."
// Fiecare proba strica DELIBERAT ceva si se verifica faptul ca sonda o vede.
// Se ruleaza inaintea oricarei rulari de gate — bench/GATE.md §6.

/** Proba B: geometriile nu se mai elibereaza. Contorul trebuie sa creasca monoton. */
let leakProbeActive = false
/** Proba C: un blocaj de 120 ms la fiecare 5 secunde, care trebuie raportat ca stall. */
let lastStallMs = -1e9

function armNegativeProbe(): void {
  if (NEGATIVE_PROBE === null) return

  if (NEGATIVE_PROBE === 'drawcalls') {
    // 5.000 de mesh-uri separate, fiecare cu un singur triunghi: geometria e
    // neinsemnata, numarul de draw calls nu.
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
    for (let i = 0; i < 5000; i++) {
      const m = new THREE.Mesh(geo, terrainMaterial)
      m.position.set(settleCenterX + (i % 70), 60 + Math.floor(i / 70), settleCenterZ)
      scene.add(m)
    }
    return
  }

  if (NEGATIVE_PROBE === 'leak') {
    leakProbeActive = true
    return
  }
}

function stepNegativeProbe(): void {
  if (NEGATIVE_PROBE !== 'stall') return
  const now = performance.now()
  if (now - lastStallMs < 5000) return
  lastStallMs = now
  ballast.burnMs(120)
}

function tick(ts: number): void {
  requestAnimationFrame(tick)
  stepFrame(ts)
}

/**
 * Un cadru, fara `requestAnimationFrame`.
 *
 * Separat de `tick` dintr-un motiv practic: intr-o fereastra ascunsa rAF nu e
 * apelat DELOC, deci nici probele negative nu se pot verifica. Asa se poate pasi
 * cadru cu cadru din afara — exact ce trebuie ca sa dovedesti ca un instrument
 * chiar iese rosu cand trebuie.
 *
 * LIMITA, MASURATA, ca sa nu fie folosit gresit: pasirea SINCRONA nu e un mediu
 * de masurare a TIMPULUI. Chemand `render()` intr-o bucla stransa, lantul de
 * buffere se umple si browserul blocheaza pana la urmatorul vsync — 30 din 700
 * de cadre au iesit peste 100 ms, imprastiate, si toate erau multipli exacti de
 * 16,67 ms: 100 · 116,7 · 133,3 · 150 · 167 · 183,5. Alea sunt asteptari de
 * vsync, nu cost de cod.
 *
 * Deci: `stepFrame` verifica LOGICA (numar de draw calls, geometrii scurse,
 * stare), niciodata performanta. Cifrele de gate vin din rularea reala.
 */
function stepFrame(ts: number): void {
  const now = performance.now()
  const dt = now - last
  last = now

  frames.push(dt)
  if (frames.length > 240) frames.shift()

  const cpuStart = performance.now()
  driveScenario(frameIndex)
  stepNegativeProbe()
  stepTraverse(dt)
  controls.update()
  updateFocus()
  pumpBuildQueue()
  // Balastul si sarcina de bisectie se ard INAINTE de randare, ca sa concureze
  // cu ea pe acelasi cadru — exact ca simularea reala de la luna 10.
  ballast.burnFrame(frameIndex)
  if (bisector && !bisector.done) ballast.burnMs(bisector.currentX())
  renderer.render(scene, camera)
  const cpuEnd = performance.now()

  frameIndex++
  if (frameIndex > WARMUP_FRAMES) {
    const present = probe.record(ts, cpuStart, cpuEnd, renderer.info.render.calls, renderer.info.render.triangles, heapMB())
    // Bisectia primeste intervalul de PREZENTARE, nu delta de performance.now().
    // Primul cadru are present = 0 si n-are ce cauta in esantion.
    if (bisector && !bisector.done && present > 0) bisector.sample(present)
  }
  if (gateRun && !gateDone) {
    const enough = bisector ? bisector.done : probe.count >= MEASURED_FRAMES
    if (enough) finishGateRun()
  }

  hudTimer += dt
  if (hudTimer > 400) {
    hudTimer = 0
    const sorted = [...frames].sort((a, b) => a - b)
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 0
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0
    el('fps').textContent = mid > 0 ? (1000 / mid).toFixed(0) : '—'
    el('p99').textContent = `${p99.toFixed(1)} ms`
    const q = buildQueue.length > 0 ? `${buildQueue.length} · ${lastFocusMs.toFixed(1)} ms` : '—'
    const dir = traverseDir > 0 ? '→' : '←'
    el('queue').textContent = traversing ? `${q} · T ${dir} ${traverseFixedClock ? 'pas fix' : 'timp real'}` : q
    el('calls').textContent = String(renderer.info.render.calls)
    el('tris').textContent = renderer.info.render.triangles.toLocaleString('ro-RO')
    if (bisector) el('slice').textContent = bisector.progress
    if (probe.invalid) {
      el('spot').textContent = `INVALID · ${probe.invalid}`
      el('spot').className = 'warn'
    }
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

recount()
el('backend').textContent = `${gpuName()} · ${buildMs.toFixed(0)} ms build`
el('spot').textContent = `chunk ${FOCUS_CX}/${FOCUS_CY} · seed ${SEED}`
busy.remove()
hud.removeAttribute('hidden')
requestAnimationFrame(tick)

// Expus pentru masuratori din consola, nu pentru joc.
Object.assign(globalThis, { __kinstead: { world, renderer, scene, camera, controls, frames, probe, bisector, ballast, stepFrame, meshes } })
