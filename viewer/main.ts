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

import { createWorld, tick as simTick } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { describe } from '../src/sim/result.ts'
import { CHUNK_CELLS, Material, VOXEL_LEVELS } from '../src/sim/terrain/chunk.ts'
import type { Chunk } from '../src/sim/terrain/chunk.ts'
import { groundLevelM, inWorld } from '../src/sim/terrain/terrain.ts'
import { Biome, MACRO_METERS, sampleMacro } from '../src/sim/terrain/macro.ts'
import { Face, meshChunk } from '../src/render/mesher.ts'
import type { ChunkNeighbours } from '../src/render/mesher.ts'
import { AO_FACTOR, quadColor, variatiaLocului } from '../src/render/palette.ts'
import { writeQuadIndices } from '../src/render/winding.ts'
import { Ballast, Bisector, checkGuards, clockGranularityMs, FrameProbe, heapMB } from './probe.ts'
import { createRegionOverlay, rebuildRegionOverlay } from './overlay-regions.ts'
import { createAmprentaOverlay, FORME, rebuildAmprentaOverlay } from './overlay-amprenta.ts'
import { createJobOverlay, rebuildJobOverlay, rezumatJoburi } from './overlay-joburi.ts'
import { createStabilityOverlay, rebuildStabilityOverlay } from './overlay-stabilitate.ts'
import { desemnareLaCelula } from '../src/sim/desemnari.ts'
import { celulaDeZonaLa } from '../src/sim/zone.ts'
import { decodeCell } from '../src/sim/path.ts'
import { createDensePanel, densePanelReport, PANEL_HZ, tickDensePanel } from './panel-dens.ts'
import { rebuildDirty } from '../src/sim/regions.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { meshHeightfield } from '../src/render/heightfield.ts'
import { createAgentLayer, spawnNear, stepSim, updateAgentLayer } from './agenti.ts'
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

/**
 * Agentii ruleaza NUMAI la privit liber.
 *
 * Gate-ul de motor masoara cadre pe un protocol pre-inregistrat. Un tick de
 * simulare in bucla masurata ar schimba tacit ce masoara — chiar felul de drift
 * impotriva caruia exista `bench/GATE.md` si garda lui.
 */
const AGENTI_ACTIVI = SCENARIO === null

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

if (AGENTI_ACTIVI) {
  spawnNear(world, baseX + 16, baseY + 16, 14, 24)
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

const agentLayer = createAgentLayer(scene, DEFAULT_RULES.agentCapacity)
agentLayer.mesh.visible = AGENTI_ACTIVI

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

/** Vecinii ortogonali ai unui chunk, pentru taierea fetelor de granita. */
function neighboursOf(chunk: Chunk): ChunkNeighbours {
  const at = (cx: number, cy: number) => world.terrain.chunks.get(cy * 512 + cx) ?? null
  return {
    xNeg: at(chunk.cx - 1, chunk.cy),
    xPos: at(chunk.cx + 1, chunk.cy),
    yNeg: at(chunk.cx, chunk.cy - 1),
    yPos: at(chunk.cx, chunk.cy + 1),
    // Diagonalele sunt DOAR pentru AO: coltul (-1,-1) al chunk-ului nu vine de la
    // niciunul dintre cei patru vecini de latura, iar fara el raman patru coloane
    // de colt mai luminoase decat trebuie — o cusatura, doar mai rara.
    xNegYNeg: at(chunk.cx - 1, chunk.cy - 1),
    xPosYNeg: at(chunk.cx + 1, chunk.cy - 1),
    xNegYPos: at(chunk.cx - 1, chunk.cy + 1),
    xPosYPos: at(chunk.cx + 1, chunk.cy + 1),
  }
}

function buildVoxelGeometry(chunk: Chunk): THREE.BufferGeometry | null {
  const mesh = meshChunk(chunk, neighboursOf(chunk))
  if (mesh.quadCount === 0) return null
  totalQuads += mesh.quadCount

  const positions = new Float32Array(mesh.quadCount * 4 * 3)
  const colors = new Float32Array(mesh.quadCount * 4 * 3)
  const normals = new Float32Array(mesh.quadCount * 4 * 3)
  const indices = new Uint32Array(mesh.quadCount * 6)
  const zBase = chunk.voxels!.zBaseM
  // Coltul chunk-ului in CELULE de lume: variatia se citeste din pozitia absoluta,
  // altfel s-ar repeta identic in fiecare chunk — adica exact tiparul pe care il combate.
  const originX = chunk.cx * CHUNK_CELLS
  const originY = chunk.cy * CHUNK_CELLS

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
      // Ocluzia inmulteste culoarea, nu o inlocuieste: e o proprietate a
      // GEOMETRIEI, nu a materialului, deci trebuie sa se vada la fel pe piatra si
      // pe iarba. Vine gata calculata din mesher, per varf.
      //
      // Variatia locului se inmulteste la fel, si se citeste din pozitia ABSOLUTA
      // a varfului — deci doua quaduri care se ating primesc aceeasi valoare, si
      // terasele vecine inceteaza sa mai fie identice.
      const k = AO_FACTOR[mesh.ao[q * 4 + v]!]!
        * variatiaLocului(originX + mesh.positions[src + v * 3]!, originY + mesh.positions[src + v * 3 + 1]!)
      colors[dst + v * 3] = r * k
      colors[dst + v * 3 + 1] = g * k
      colors[dst + v * 3 + 2] = b * k
      normals[dst + v * 3] = nx
      normals[dst + v * 3 + 1] = ny
      normals[dst + v * 3 + 2] = nz
    }
    // Winding-ul se CALCULEAZA, nu se presupune. Vezi `src/render/winding.ts`:
    // regula fixa de dinainte („pozitivele se inverseaza") era corecta pentru
    // majoritatea quadurilor si gresita pentru restul, iar cele gresite se vedeau
    // ca gauri prin care se zarea fundalul.
    writeQuadIndices(mesh, q, q * 4, indices, q * 6)
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
    // Normalele vin gata calculate, iar indicii sunt ACELASI buffer pentru toate
    // chunk-urile — deci `dispose()` nu are voie sa-i elibereze ca pe ceva propriu.
    // three.js nu elibereaza bufferele JS oricum, doar cele de pe GPU.
    geo.setAttribute('normal', new THREE.BufferAttribute(hf.normals, 3))
    geo.setIndex(new THREE.BufferAttribute(hf.indices, 1))
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

/**
 * Ce mesh-uri trebuie refacute dupa o editare la (wx, wy).
 *
 * Trei cazuri, si al treilea e NOU de cand mesher-ul taie fetele de granita:
 *  1. chunk-ul atins — evident;
 *  2. vecinii care tocmai au fost PROMOVATI de comanda (apron-ul de 3×3), fiindca
 *     au trecut de la heightfield la voxeli;
 *  3. vecinul de dincolo de granita, daca celula editata sta pe marginea
 *     chunk-ului. Fata lui catre noi era taiata pentru ca eram solizi acolo; daca
 *     tocmai am sapat, fata aia trebuie sa reapara — altfel ramane o GAURA prin
 *     care se vede fundalul.
 */
/** Cine e promovat ACUM. Se cheama INAINTE de o comanda, ca sa se vada diferenta. */
function promotedKeys(): Set<number> {
  const out = new Set<number>()
  for (const k of world.terrain.keys) {
    if (world.terrain.chunks.get(k)!.voxels !== null) out.add(k)
  }
  return out
}

function remeshAfterEdit(wx: number, wy: number, promotedBefore: Set<number>): void {
  const cx = Math.floor(wx / CHUNK_CELLS)
  const cy = Math.floor(wy / CHUNK_CELLS)
  const lx = wx - cx * CHUNK_CELLS
  const ly = wy - cy * CHUNK_CELLS

  const deRefacut = new Set<number>()
  deRefacut.add(cy * 512 + cx)

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = (cy + dy) * 512 + (cx + dx)
      if (world.terrain.chunks.has(key) && !promotedBefore.has(key)) deRefacut.add(key)
    }
  }

  // Cazul 3: numai laturile chiar atinse, nu toate patru.
  if (lx === 0) deRefacut.add(cy * 512 + (cx - 1))
  if (lx === CHUNK_CELLS - 1) deRefacut.add(cy * 512 + (cx + 1))
  if (ly === 0) deRefacut.add((cy - 1) * 512 + cx)
  if (ly === CHUNK_CELLS - 1) deRefacut.add((cy + 1) * 512 + cx)

  for (const key of deRefacut) {
    const c = world.terrain.chunks.get(key)
    if (c) buildChunkMesh(c)
  }
}

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
// 3b. overlay de regiuni — sistemele invizibile, facute vizibile
// --------------------------------------------------------------------------
//
// Research-ul numeste lipsa asta drept capcana: „regiuni, rezervari, job selection
// sunt INVIZIBILE — typecheck verde, teste verzi, joc rupt". Sistemul de regiuni a
// scos la iveala un defect de arhitectura in ziua in care a fost scris, fiindca a
// pus o intrebare noua. Overlay-ul e ca sa se poata si UITA cineva la urmatorul.
//
// Doua zone cu aceeasi culoare sunt, dupa graf, mutual accesibile. Culori diferite
// inseamna ca NU exista drum. Un zid care inchide o camera se vede instantaneu.

// UN SINGUR store de regiuni: chiar cel pe care merg agentii.
//
// Pana acum viewerul isi facea al doilea store, doar pentru overlay. Consecinta e
// tocmai ce trebuia sa previna K13: overlay-ul arata VERDE exact acolo unde
// simularea era rupta. Desenai o camera legata frumos, in timp ce agentii vedeau
// `NO_REGION` in ea, fiindca nimeni nu murdarea storeul LOR. Un admin vizual care
// se uita la altceva decat sistemul e mai rau decat lipsa lui.
const regions = world.regions
const regionOverlay = createRegionOverlay()
scene.add(regionOverlay.group)

// D20: cladirea asezata liber si celulele pe care le ocupa. Vezi overlay-amprenta.ts.
const amprentaOverlay = createAmprentaOverlay()
scene.add(amprentaOverlay.group)

// K13: desemnarile, rezervarile si drumurile spre lucru. Vezi overlay-joburi.ts.
const jobOverlay = createJobOverlay()
scene.add(jobOverlay.group)
const stabOverlay = createStabilityOverlay()
scene.add(stabOverlay.group)

/**
 * Nivelul pe care se judeca stabilitatea, si raza in jurul focusului.
 *
 * `sliceLevel - 1`, nu `sliceLevel`: planul de taiere pastreaza `y <= sliceLevel`,
 * iar voxelul de la nivelul L ocupa `y in [L, L+1]` — deci nivelul `sliceLevel` e
 * INTREG peste plan, si ultimul vizibil de sus e cel de sub el. Prima versiune
 * judeca stratul ascuns si desena peste plan, deci nu se vedea nimic.
 *
 * Cu slice-ul oprit nu exista nivel activ. Varianta veche lua
 * `Math.floor(camera.position.y)`, adica altitudinea CAMEREI — zeci de metri
 * deasupra terenului, unde nu e niciun voxel. `null` spune overlay-ului sa scrie
 * de ce tace, in loc sa deseneze zero patrate fara explicatie.
 */
function refaStabilitate(): void {
  const zActiv = sliceLevel >= VOXEL_LEVELS ? null : sliceLevel - 1
  rebuildStabilityOverlay(stabOverlay, world, DEFAULT_RULES, zActiv, focusCx * CHUNK_CELLS + 16, focusCy * CHUNK_CELLS + 16, 16)
}

function refreshAmprenta(): void {
  const wx = Math.floor(controls.target.x)
  const wy = Math.floor(controls.target.z)
  const g = groundLevelM(world.terrain, wx, wy)
  rebuildAmprentaOverlay(amprentaOverlay, wx, wy, (g.ok ? g.value : 0) + 1)
}

function refreshOverlay(): void {
  if (!regionOverlay.visible) return
  const wx = Math.floor(controls.target.x)
  const wy = Math.floor(controls.target.z)
  const g = groundLevelM(world.terrain, wx, wy)
  const z = (g.ok ? g.value : 0) + 1
  const t0 = performance.now()
  rebuildRegionOverlay(regionOverlay, world.terrain, regions, wx, wy, z, DEFAULT_RULES)
  lastOverlayMs = performance.now() - t0
  epocaDesenata = world.regions.epoca
}

let lastOverlayMs = 0
/** Epoca grafului la ultima desenare a overlay-ului de regiuni. */
let epocaDesenata = -1

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
// Tastele tinute apasate in timpul unui click: Z picteaza un depozit (doua
// clickuri = doua colturi), X sterge depozitul de sub click.
let tastaZ = false
let tastaX = false
let coltZona: { wx: number; wy: number; z: number } | null = null
window.addEventListener('keydown', (ev) => { if (ev.key === 'z' || ev.key === 'Z') tastaZ = true; if (ev.key === 'x' || ev.key === 'X') tastaX = true })
window.addEventListener('keyup', (ev) => { if (ev.key === 'z' || ev.key === 'Z') tastaZ = false; if (ev.key === 'x' || ev.key === 'X') tastaX = false })
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

  const promotedBefore = promotedKeys()

  // Click = DESEMNEAZA (un pion vine sa sape). Alt+click = sapa pe loc (unealta
  // de debug, si ce chema scenariul de gate S-DIG). Ctrl+click = retrage
  // desemnarea de pe celula. Shift+click = zideste, ca inainte.
  let out
  if (tastaZ) {
    // Depozitul se picteaza pe celula CALCABILA de deasupra solului atins.
    if (!coltZona) {
      coltZona = { wx, wy, z: z + 1 }
      el('spot').textContent = `depozit: coltul 1 la ${wx},${wy} — click cu Z pe coltul 2`
      return
    }
    out = applyCommand(world, { kind: 'picteazaZona', x0: coltZona.wx, y0: coltZona.wy, x1: wx, y1: wy, z: coltZona.z })
    coltZona = null
  } else if (tastaX) {
    const cs = celulaDeZonaLa(world.zone, wx, wy, z + 1)
    out = cs === -1
      ? applyCommand(world, { kind: 'stergeZona', id: -1 })
      : applyCommand(world, { kind: 'stergeZona', id: world.zone.celule.zonaId[cs]! })
  } else if (ev.shiftKey) {
    out = applyCommand(world, { kind: 'fill', wx, wy, z, material: Material.PIATRA_CONSTRUITA })
  } else if (ev.altKey) {
    out = applyCommand(world, { kind: 'dig', wx, wy, z })
  } else if (ev.ctrlKey) {
    const ds = desemnareLaCelula(world.desemnari, wx, wy, z)
    out = ds === -1
      ? applyCommand(world, { kind: 'anuleazaDesemnarea', id: -1 })
      : applyCommand(world, { kind: 'anuleazaDesemnarea', id: world.desemnari.id[ds]! })
  } else {
    out = applyCommand(world, { kind: 'desemneaza', wx, wy, z })
  }

  // Un refuz care nu se vede e un buton care „nu face nimic". Contractul de
  // Outcome poarta motivul — ar fi absurd sa-l arunc exact la capatul lantului.
  if (!out.ok) {
    console.warn(`refuzat la ${wx},${wy},${z}: ${describe(out)}`)
    el('spot').textContent = `refuzat: ${describe(out)}`
    return
  }
  if (!ev.altKey && !ev.shiftKey) {
    // Desemnarea si retragerea ei nu schimba terenul: nimic de remesh-uit.
    // (Zidirea DA — prima versiune iesea si pentru Shift+click, iar zidul exista
    // in simulare si nu se vedea. Exact punctul orb K13.)
    if (jobOverlay.visible) rebuildJobOverlay(jobOverlay, world)
    return
  }

  // Se reconstruieste chunk-ul atins plus vecinii care CHIAR s-au schimbat.
  //
  // `dig` promoveaza un apron de 3×3, dar numai prima data: la a doua sapatura
  // in acelasi chunk, vecinii sunt deja promovati si mesh-ul lor e neschimbat.
  // Varianta care remesh-uia mereu 3×3 platea 9× pretul pentru un singur chunk
  // murdar — 5,4 ms in loc de ~0,6 — si ar fi intrat in gate ca „limita stivei".
  remeshAfterEdit(wx, wy, promotedBefore)
  // Regiunile se intretin DOAR cat timp overlay-ul e deschis.
  //
  // Motivul e o cifra: `rebuildDirty` reconstruieste toate blocurile rezidente, iar
  // cu overlay-ul pornit alea sunt ~735, deci un click costa peste 150 ms. Adica
  // ~10 cadre pierdute la fiecare sapatura — introdus chiar de mine, in commit-ul
  // de overlay, si gasit de un panou care citea codul.
  //
  // Deocamdata regiunile sunt o unealta de inspectie, deci asta e corect. Cand vor
  // veni agentii vor cere intretinere permanenta, si ATUNCI reconstructia
  // incrementala devine obligatorie — nu inainte, si nu mai tarziu.
  // Murdarirea o face acum `applyCommand`; aici ramane doar reconstructia si
  // redesenarea, si numai cand overlay-ul e vizibil.
  if (regionOverlay.visible) {
    rebuildDirty(world.terrain, regions, DEFAULT_RULES)
    refreshOverlay()
  }
  recount()
})

window.addEventListener('keydown', (ev) => {
  // --- D20: amprenta unei cladiri asezate liber ---
  if (ev.key === 'b' || ev.key === 'B') {
    amprentaOverlay.visible = !amprentaOverlay.visible
    amprentaOverlay.group.visible = amprentaOverlay.visible
    refreshAmprenta()
    return
  }
  if (amprentaOverlay.visible) {
    if (ev.key === ',' || ev.key === '<') { amprentaOverlay.grade = (amprentaOverlay.grade + 355) % 360; refreshAmprenta(); return }
    if (ev.key === '.' || ev.key === '>') { amprentaOverlay.grade = (amprentaOverlay.grade + 5) % 360; refreshAmprenta(); return }
    if (ev.key === 'n' || ev.key === 'N') { amprentaOverlay.forma = (amprentaOverlay.forma + 1) % FORME.length; refreshAmprenta(); return }
    if (ev.key === 'm' || ev.key === 'M') { amprentaOverlay.ancorat = !amprentaOverlay.ancorat; refreshAmprenta(); return }
  }
  if (ev.key === 'g' || ev.key === 'G') {
    regionOverlay.visible = !regionOverlay.visible
    regionOverlay.group.visible = regionOverlay.visible
    refreshOverlay()
    return
  }
  if (ev.key === 'j' || ev.key === 'J') {
    jobOverlay.visible = !jobOverlay.visible
    jobOverlay.group.visible = jobOverlay.visible
    rebuildJobOverlay(jobOverlay, world)
    return
  }
  if (ev.key === 's' || ev.key === 'S') {
    stabOverlay.visible = !stabOverlay.visible
    stabOverlay.group.visible = stabOverlay.visible
    refaStabilitate()
    return
  }
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

// D1b — panoul dens. `?d1b=1` il porneste si il masoara.
//
// E criteriul pe care D1 si-l declara singur si golul nr. 2 din bench/GATE.md §12:
// fara el, un PASS de randare inchide D1a, nu D1. Ruleaza in ACELASI cadru cu
// randarea, fiindca asa va rula si in joc — masurat separat, ar fi alt numar.
const densePanel = params.get('d1b') === '1' ? createDensePanel() : null
let panelTick = 0
let panelAccMs = 0

function stepDensePanel(dtMs: number): void {
  if (!densePanel) return
  panelAccMs += dtMs
  const interval = 1000 / PANEL_HZ
  if (panelAccMs < interval) return
  panelAccMs -= interval
  tickDensePanel(densePanel, panelTick++)
}

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
    d1b: densePanel ? densePanelReport(densePanel) : null,
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
    // INAINTE de comanda, nu dupa. Varianta care citea multimea DUPA `dig` punea
    // in ea si chunk-urile tocmai promovate, deci `!promotedBefore.has(key)` nu se
    // declansa niciodata si apron-ul nou nu-si primea primul mesh. Adica S-DIG —
    // un scenariu de GATE — masura mai putina munca decat face jocul.
    const promotedBefore = promotedKeys()
    const out = applyCommand(world, { kind: 'dig', wx, wy, z: g.value - (digCursor % 5) })
    if (!out.ok) return
    remeshAfterEdit(wx, wy, promotedBefore)
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
  stepDensePanel(dt)
  if (AGENTI_ACTIVI) {
    // Sapaturile pionilor schimba terenul, si mesh-ul trebuie sa afle. Cine
    // poate sapa in cadrul asta e cine LUCREAZA acum: se retin celulele lor
    // inainte de pas, si dupa pas se remesh-uieste in jurul celor a caror
    // desemnare a disparut. Rar (o sapatura la cateva secunde) si local.
    //
    // Corect prin constructie, nu prin ghicit cine e in LUCREAZA: se compara
    // desemnarile vii inainte si dupa pas si se remesh-uieste in jurul celor
    // care au disparut. Un pion care sosea si sapa in acelasi cadru scapa
    // variantei „doar cei in LUCREAZA la inceputul cadrului".
    let cuJob = 0
    for (let i = 0; i < world.agents.count; i++) if (world.agents.alive[i] === 1 && world.agents.jobKind[i] !== 0) cuJob++
    const cheiInainte = cuJob > 0 ? new Set(world.desemnari.laCelula.keys()) : null
    const promotedInainte = cuJob > 0 ? promotedKeys() : null
    stepSim(agentLayer, world, DEFAULT_RULES, dt, simTick)
    updateAgentLayer(agentLayer, world, DEFAULT_RULES)
    if (cheiInainte && promotedInainte) {
      for (const k of cheiInainte) {
        if (world.desemnari.laCelula.has(k)) continue
        const c = decodeCell(k)
        remeshAfterEdit(c.wx, c.wy, promotedInainte)
      }
    }
    if (jobOverlay.visible && frameIndex % 6 === 0) rebuildJobOverlay(jobOverlay, world)
    // Mult mai rar decat overlay-ul de joburi: o celula care ajunge la scanarea
    // scumpa costa ~19 µs, iar prefiltrul o plateste doar langa goluri.
    if (stabOverlay.visible && frameIndex % 30 === 0) refaStabilitate()
    // Overlay-ul de regiuni (G) se reimprospateaza cand graful s-a schimbat —
    // sapaturile pionilor si acoperirea desemnarilor il schimba fara niciun click.
    if (regionOverlay.visible && world.regions.epoca !== epocaDesenata) refreshOverlay()
  }
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
    el('build').textContent = amprentaOverlay.visible
      ? `${FORME[amprentaOverlay.forma]!.nume} · ${amprentaOverlay.grade}° · ${amprentaOverlay.celule} cel. (×${amprentaOverlay.grasime.toFixed(2)}) · CENTRU ${amprentaOverlay.celuleCentru}${amprentaOverlay.ancorat ? ' · ancorat' : ''}`
      : 'B'
    el('agents').textContent = AGENTI_ACTIVI ? `${agentLayer.vii} · t${world.tick}` : 'oprit la gate'
    el('regions').textContent = regionOverlay.visible
      ? `${regionOverlay.cells.toLocaleString('ro-RO')} celule · ${regionOverlay.components} componente · ${lastOverlayMs.toFixed(0)} ms`
      : 'G'
    {
      const r = rezumatJoburi(world)
      const d = world.desemnari.vii
      const o = jobOverlay.visible ? ` · liber ${jobOverlay.desemnari - jobOverlay.rezervate - jobOverlay.faraLoc - jobOverlay.componente - jobOverlay.altRefuz} rez ${jobOverlay.rezervate} fara-loc ${jobOverlay.faraLoc} rupt ${jobOverlay.componente}` : ''
      const m = jobOverlay.visible ? ` · mormane ${jobOverlay.iteme} (rez ${jobOverlay.itemeRezervate} fara-depozit ${jobOverlay.itemeFaraDepozit} rupt ${jobOverlay.itemeInaccesibile}) · depozit ${jobOverlay.celuleOcupate}/${jobOverlay.celuleDepozit}` : ` · mormane ${world.iteme.vii} · depozit ${world.zone.celule.vii} cel.`
      // Nevoile si dispozitia. „Nefericit" si „refuza munca" sunt DOUA contoare,
      // fiindca nu sunt acelasi lucru; avertismentul de plecare se uita la TINTA.
      const n = r.flamanzi + r.obositi > 0 || r.refuza > 0 || r.plecati > 0
        ? ` · flamanzi ${r.flamanzi} obositi ${r.obositi} refuza ${r.refuza} plecati ${r.plecati}`
        : ''
      const av = r.pleacaCurand > 0 ? ` · ${r.pleacaCurand} pleaca in curand` : ''
      const fm = r.faraMancare ? ' · nu mai e mancare in asezare' : ''
      // Stabilitatea, doar cand overlay-ul e pornit: cifrele sunt scumpe de calculat.
      const st = !stabOverlay.visible
        ? ''
        : stabOverlay.piedica !== ''
          ? ` · ${stabOverlay.piedica}`
          : ` · ultima-celula ${stabOverlay.ultima} cade ${stabOverlay.cade}` +
            (stabOverlay.previzualizate > 0 ? ` · desemnarile ar prabusi ${stabOverlay.previzualizate}` : '')
      el('jobs').textContent = `${d} desemnari · idle ${r.idle} merg ${r.merg} lucreaza ${r.lucreaza} cara ${r.cara}${o}${m}${n}${av}${fm}${st}`
      el('jobs').className = r.faraMuncitori || r.faraCarausi ? 'warn' : ''
      if (r.faraMuncitori) el('jobs').textContent += ' · NIMENI NU SAPA'
      if (r.faraCarausi) el('jobs').textContent += ' · NIMENI NU CARA'
    }
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
Object.assign(globalThis, { __kinstead: { world, renderer, scene, camera, controls, frames, probe, bisector, ballast, stepFrame, meshes, densePanel, densePanelReport } })
