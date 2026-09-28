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
import type { Refusal } from '../src/sim/result.ts'
import { CHUNK_CELLS, isSolid, Material, promotedBaseM, VOXEL_LEVELS } from '../src/sim/terrain/chunk.ts'
import type { Chunk } from '../src/sim/terrain/chunk.ts'
import { groundLevelM, inWorld, materialAt, voxelRangeM } from '../src/sim/terrain/terrain.ts'
import { Face, meshChunk } from '../src/render/mesher.ts'
import type { ChunkNeighbours } from '../src/render/mesher.ts'
import { AO_FACTOR, quadColor, variatiaLocului } from '../src/render/palette.ts'
import { writeQuadIndices } from '../src/render/winding.ts'
import { chunkuriDeRefacut } from '../src/render/remesh.ts'
import { Ballast, Bisector, checkGuards, clockGranularityMs, FrameProbe, heapMB } from './probe.ts'
import { createRegionOverlay, rebuildRegionOverlay } from './overlay-regions.ts'
import { createAmprentaOverlay, FORME, rebuildAmprentaOverlay } from './overlay-amprenta.ts'
import { createJobOverlay, rebuildJobOverlay, rezumatJoburi } from './overlay-joburi.ts'
import { actualizeazaInchise, avanseazaStabilitate, createStabilityOverlay, pornesteStabilitate, progresStabilitate, redeseneazaStabilitate } from './overlay-stabilitate.ts'
import { Item, Piesa } from '../src/sim/state.ts'
import { desemnareLaCelula, slotDesemnare } from '../src/sim/desemnari.ts'
import type { CelulaJ, Impact, Raza } from './tinta.ts'
import { celulaDeZonaLa } from '../src/sim/zone.ts'
import { cellKey } from '../src/sim/path.ts'
import { createDensePanel, densePanelReport, PANEL_HZ, tickDensePanel } from './panel-dens.ts'
import { isWalkable, rebuildDirty } from '../src/sim/regions.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { meshHeightfield } from '../src/render/heightfield.ts'
import { createAgentLayer, spawnNear, stepSim, updateAgentLayer } from './agenti.ts'
import { buildM10 } from '../src/harness/fixture-m10.ts'
import { SDIG_MAX_INCERCARI, SDIG_OFFSET_INCALZIRE, SDIG_SPAN_INCALZIRE, sapaturaUrmatoare } from '../src/harness/sdig.ts'
import { decode, encode } from '../src/sim/save.ts'
import type { Command } from '../src/sim/commands.ts'
import type { World } from '../src/sim/state.ts'
import { Faction, slotOf } from '../src/sim/state.ts'
import { JURNAL_CAP } from '../src/sim/terrain/terrain.ts'
import { alegeTinta } from './tinta.ts'
import type { ModTinta } from './tinta.ts'
import { modPornire, parametriJocNou } from './ui/pornire.ts'
import { locDemo, locJocNou } from './ui/loc.ts'
import { actiuneTasta, tintaEditabila } from './ui/taste.ts'
import type { Actiune } from './ui/taste.ts'
import { normalizeaza, planDreptunghi, textPlan, Unealta } from './ui/dreptunghi.ts'
import type { Lumea, PlanDreptunghi, UnealtaId } from './ui/dreptunghi.ts'
import { textMotiv } from './ui/texte.ts'
import { cifreDinReguli } from './ui/model.ts'
import { citesteSalvare, listaSalvari, scrieSalvare, stergeSalvare } from './ui/salvari-idb.ts'
import { FORMAT_SALVARE, numeFisier, valideazaSalvare } from './ui/salvari-plic.ts'
import type { Salvare } from './ui/salvari-plic.ts'
import type { ContextUI, UI } from './ui/panouri.ts'
import { previzInvechita } from './overlay-stabilitate.ts'
import { actualizeazaStratResurse, creeazaStratResurse } from './strat-resurse.ts'

/** Lumea demo-ului, a modului de verificare si a gate-ului. Un joc nou isi alege seed-ul. */
const SEED_DEMO = 20260913
/** Cate chunk-uri in jurul focusului se deseneaza. 11 = discul rezident intreg. */
const VIEW_RADIUS = 11

// Parametrii de rulare se citesc din URL, nu din taste: o rulare de gate trebuie
// sa poata fi repornita identic si sa-si scrie propriile metadate.
const params = new URLSearchParams(location.search)
/** Scenariul de gate. Absent = explorare libera, cu fortareata mica. */
const SCENARIO = params.get('scenario')
/** Proba negativa ceruta: instrumentul TREBUIE sa iasa rosu pe ea. */
const NEGATIVE_PROBE = params.get('probe')
/**
 * Modul paginii (viewer/ui/pornire.ts, testat pe fiecare URL al lansatoarelor de gate): gate, ecranul
 * de titlu cu demo-ul, joc nou, incarcare, verificare. UI-ul de joc NU se monteaza pe nicio pagina de
 * masura — nici DOM, nici stil, nici ascultatori.
 */
const MOD = modPornire(params)

/**
 * Modul de pornire pentru verificarile pe ecran (OWNER_VERIFY 13), tot din URL:
 *   ?cam=X,Y    camera deasupra celulei (X, Y) a lumii
 *   ?slice=L    slice-ul pornit la L m (nivelul activ = L - 1)
 *   ?piatra=N   N unitati de piatra, in mormane in jurul tintei camerei
 *   ?hrana=N    la fel, hrana
 *   ?pauza=1    pionii pornesc in pauza (Spatiu ii porneste): cu piatra langa casa, un plan se
 *               zideste pe masura ce se deseneaza, iar un pas de verificare de tipul „sterge o
 *               treapta" nu mai gaseste treapta ca desemnare — e deja zidita
 * Motivul e o cifra: lumea viewer-ului are ~440 de piatra si nicio hrana, iar casa cu doua etaje
 * cere 193 de piese × 20 de piatra (recenzia accesului vertical, `m1-teren.ts` / `m3-casa.ts`).
 * DOAR la privit liber: o rulare de gate nu citeste nimic de aici, ca sa ramana reproductibila.
 * Mormanele intra PRIN COMENZI (`lasaItem`), ca orice schimbare a lumii.
 */
interface Pornire {
  readonly cam: { readonly x: number; readonly y: number } | null
  readonly slice: number | null
  readonly piatra: number
  readonly hrana: number
  readonly pauza: boolean
  /** Parametrii care n-au putut fi cititi — se spun pe randul „loc", nu se inghit. */
  readonly ignorate: readonly string[]
}

function citestePornirea(): Pornire | null {
  // Doar modul de verificare: la un joc nou, `piatra` si `hrana` sunt ale jocului, nu ale probei.
  if (MOD.mod !== 'verificare') return null
  const ignorate: string[] = []
  const intreg = (nume: string, min: number): number | null => {
    const v = params.get(nume)
    if (v === null) return null
    const n = Number(v)
    if (v.trim() === '' || !Number.isInteger(n) || n < min) { ignorate.push(`${nume}=${v}`); return null }
    return n
  }
  let cam: { x: number; y: number } | null = null
  const c = params.get('cam')
  if (c !== null) {
    const [x, y, ...rest] = c.split(',').map((s) => Number(s.trim()))
    if (rest.length === 0 && Number.isInteger(x) && Number.isInteger(y)) cam = { x: x!, y: y! }
    else ignorate.push(`cam=${c}`)
  }
  const p = params.get('pauza')
  if (p !== null && p !== '0' && p !== '1') ignorate.push(`pauza=${p}`)
  return { cam, slice: intreg('slice', -1e6), piatra: intreg('piatra', 0) ?? 0, hrana: intreg('hrana', 0) ?? 0, pauza: p === '1', ignorate }
}
const PORNIRE = citestePornirea()
/** Pionii stau (Spatiu). Doar la privit liber; o rulare de gate n-are pioni. */
let simPauza = PORNIRE?.pauza ?? false

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
// Alegerea locului sta acum in viewer/ui/loc.ts (`locDemo`, neschimbata — testul o ancoreaza pe
// 389/144 —, si `locJocNou`, care cauta un loc PLAT printre primii 30 de candidati).

/** Ce spune pornirea cand n-a mers cum s-a cerut (o salvare care nu se poate incarca). */
let mesajPornireUI = ''
let salvareIncarcata: Salvare | null = null
let lumeIncarcata: World | null = null
if (MOD.mod === 'incarca') {
  // Singurul `await` inainte de lume, si doar aici: o pagina de gate nu trece niciodata pe aici.
  try {
    const r = await citesteSalvare(params.get('incarca') ?? '')
    if (!r.ok) mesajPornireUI = r.motiv
    else {
      const d = decode(r.value.lume, DEFAULT_RULES)
      if (!d.ok) mesajPornireUI = textMotiv('incarcare', d.reason, 0, d.params).titlu
      else { lumeIncarcata = d.value; salvareIncarcata = r.value }
    }
  } catch (e) {
    mesajPornireUI = `Salvările nu se pot citi: ${e instanceof Error ? e.message : String(e)}`
  }
}
// Un joc incarcat porneste IN PAUZA, cu viteza lui (recenzia UI-ului, INT-9: pornea la 1× si rula,
// deci pionii lucrau inainte ca jucatorul sa vada unde e; `meta.viteza` era scris si niciodata citit).
if (salvareIncarcata !== null) simPauza = true
const JOC_NOU = MOD.mod === 'joc-nou' ? parametriJocNou(params, DEFAULT_RULES.agentCapacity, SEED_DEMO) : null
/** Modul in care chiar ruleaza pagina: o incarcare care n-a mers cade pe ecranul de titlu, cu motivul. */
const MOD_JOC: 'gate' | 'titlu' | 'joc-nou' | 'incarca' | 'verificare' = MOD.mod === 'incarca' && lumeIncarcata === null ? 'titlu' : MOD.mod
const SEED = lumeIncarcata?.seed ?? JOC_NOU?.seed ?? SEED_DEMO
const LOC_NOU = JOC_NOU ? locJocNou(SEED) : null
const spot = lumeIncarcata !== null ? { cx: lumeIncarcata.terrain.focusCx, cy: lumeIncarcata.terrain.focusCy } : LOC_NOU ?? locDemo(SEED)
const FOCUS_CX = spot.cx
const FOCUS_CY = spot.cy

const world = lumeIncarcata ?? createWorld(SEED)
if (lumeIncarcata === null) applyCommand(world, { kind: 'setFocus', cx: FOCUS_CX, cy: FOCUS_CY })

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
if (SCENARIO !== null) {
  buildM10(world.terrain, FOCUS_CX, FOCUS_CY)
} else if (lumeIncarcata === null && JOC_NOU === null) {
  // Demo, verificare si bisectie: fortareata, ca inainte. Un joc nou porneste pe un loc neatins.
  buildFortress()
}

if (AGENTI_ACTIVI && lumeIncarcata === null) {
  if (JOC_NOU !== null && LOC_NOU !== null) spawnNear(world, LOC_NOU.wx, LOC_NOU.wy, 4, JOC_NOU.oameni, true)
  else spawnNear(world, baseX + 16, baseY + 16, 14, 24)
}

const camCeruta = PORNIRE?.cam ?? null
const camInLume = camCeruta !== null && inWorld(Math.floor(camCeruta.x / CHUNK_CELLS), Math.floor(camCeruta.y / CHUNK_CELLS))
/** Tinta camerei din salvare, in celule. */
const tintaSalvata = salvareIncarcata !== null ? { x: Math.floor(salvareIncarcata.meta.camera.tinta[0]), y: Math.floor(salvareIncarcata.meta.camera.tinta[2]) } : null
/** Unde priveste camera la pornire, in celule de lume: `?cam`, salvarea, locul jocului nou, altfel fortareata. */
const TINTA_START = camInLume ? camCeruta! : tintaSalvata ?? (LOC_NOU !== null ? { x: LOC_NOU.wx, y: LOC_NOU.wy } : { x: baseX + 16, y: baseY + 16 })
/** Chunk-ul focusului la pornire. Cu `?cam`, cel de sub camera — si sim-ul il afla prin `setFocus`. */
const START_CX = Math.floor(TINTA_START.x / CHUNK_CELLS)
const START_CY = Math.floor(TINTA_START.y / CHUNK_CELLS)
// O lume incarcata are doar chunk-urile promovate: `decode` nu reface discul rezident (377 → 21,
// masurat de panou, CS-12). `setFocus` il reface — deci si cand focusul e acelasi.
if (lumeIncarcata !== null || START_CX !== FOCUS_CX || START_CY !== FOCUS_CY) applyCommand(world, { kind: 'setFocus', cx: START_CX, cy: START_CY })

/**
 * Cate celule (pe distanta Chebyshev) raman libere in jurul tintei camerei. Casa din OWNER_VERIFY
 * 13 are 7×7 (±3); inelul de la 6 lasa doua celule libere pe unde lucreaza constructorii.
 */
const RAZA_LIBERA = 6

/** Cata marfa de felul dat e in lume. Pentru mesajul de pornire: cat s-a pus DE FAPT, nu cat s-a cerut. */
function marfaInLume(fel: number): number {
  let s = 0
  for (let i = 0; i < world.iteme.count; i++) if (world.iteme.alive[i] === 1 && world.iteme.kind[i] === fel) s += world.iteme.cantitate[i]!
  return s
}

/** Pune `total` unitati in mormane pline, pe inele tot mai largi in jurul lui (cx, cy), prin `lasaItem`. */
function lasaMormane(fel: number, total: number, cx: number, cy: number): { pus: number; mormane: number } {
  const inainte = marfaInLume(fel)
  let cerut = 0
  let mormane = 0
  for (let r = RAZA_LIBERA; r <= RAZA_LIBERA + 30 && cerut < total; r++) {
    for (let dy = -r; dy <= r && cerut < total; dy++) {
      for (let dx = -r; dx <= r && cerut < total; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const g = groundLevelM(world.terrain, cx + dx, cy + dy)
        if (!g.ok) continue
        const c = Math.min(DEFAULT_RULES.itemStackMax, total - cerut)
        if (applyCommand(world, { kind: 'lasaItem', fel, cantitate: c, wx: cx + dx, wy: cy + dy, z: g.value + 1 }).ok) {
          cerut += c
          mormane++
        }
      }
    }
  }
  return { pus: marfaInLume(fel) - inainte, mormane }
}

/** Ce a facut modul de pornire, pentru randul „loc". Gol = nimic de spus. */
const mesajPornire: string[] = []
if (PORNIRE !== null) {
  if (PORNIRE.piatra > 0) {
    const r = lasaMormane(Item.PIATRA, PORNIRE.piatra, TINTA_START.x, TINTA_START.y)
    mesajPornire.push(`piatra ${r.pus}/${PORNIRE.piatra} in ${r.mormane} mormane`)
  }
  if (PORNIRE.hrana > 0) {
    const r = lasaMormane(Item.HRANA, PORNIRE.hrana, TINTA_START.x, TINTA_START.y)
    mesajPornire.push(`hrana ${r.pus}/${PORNIRE.hrana} in ${r.mormane} mormane`)
  }
  const ignorate = [...PORNIRE.ignorate, ...(camCeruta !== null && !camInLume ? [`cam=${camCeruta.x},${camCeruta.y} (in afara lumii)`] : [])]
  if (ignorate.length > 0) mesajPornire.push(`IGNORAT: ${ignorate.join(', ')}`)
}
if (JOC_NOU !== null && LOC_NOU !== null) {
  // Mormanele jocului nou, prin comenzi, ca orice schimbare a lumii; inelele incep la 6 celule de
  // centru, deci oamenii (nascuti la cel mult 4) nu stau pe ele.
  const rp = lasaMormane(Item.PIATRA, JOC_NOU.piatra, LOC_NOU.wx, LOC_NOU.wy)
  const rh = lasaMormane(Item.HRANA, JOC_NOU.hrana, LOC_NOU.wx, LOC_NOU.wy)
  mesajPornire.push(`joc nou · seed ${SEED} · ${LOC_NOU.plate}/676 ferestre plate · piatra ${rp.pus} · hrana ${rh.pus}`)
}
if (lumeIncarcata !== null) mesajPornire.push(`incarcat · ${salvareIncarcata?.nume ?? ''}`)

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
/**
 * Mormanele de resurse (plasele din Blender, tools/assets/resurse.py). Nu si in gate: o geometrie in
 * plus in bucla masurata ar fi drift. URL-ul e relativ la pagina, ca sa mearga si pe build.
 */
const stratResurse = MOD.mod === 'gate' ? null : creeazaStratResurse(scene, new URL('resurse/mormane.glb', document.baseURI).href)

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
  // Netezirea suprafetei neatinse: panta redevine panta, treptele raman doar
  // acolo unde a sapat cineva.
  const mesh = meshChunk(chunk, neighboursOf(chunk), true)
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
      // Mesher-ul da CENTIMETRI locali; scena lucreaza in metri.
      positions[dst + v * 3] = mesh.positions[src + v * 3]! / 100
      // Nivelul 0 al stivei sta la cota zBase, nu la zero.
      positions[dst + v * 3 + 1] = mesh.positions[src + v * 3 + 2]! / 100 + zBase
      positions[dst + v * 3 + 2] = mesh.positions[src + v * 3 + 1]! / 100
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
        * variatiaLocului(originX + mesh.positions[src + v * 3]! / 100, originY + mesh.positions[src + v * 3 + 1]! / 100)
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
  const d2 = (chunk.cx - START_CX) ** 2 + (chunk.cy - START_CY) ** 2
  if (d2 > VIEW_RADIUS * VIEW_RADIUS) continue
  buildChunkMesh(chunk)
}
const buildMs = performance.now() - buildStart

// Camera peste fortareata, nu peste mijlocul geometric al discului — sau peste `?cam`.
const centerX = TINTA_START.x + (camInLume ? 0.5 : 0)
const centerZ = TINTA_START.y + (camInLume ? 0.5 : 0)
const gCenter = groundLevelM(world.terrain, TINTA_START.x, TINTA_START.y)
const centerY = gCenter.ok ? gCenter.value : 0
controls.target.set(centerX, centerY + 4, centerZ)
camera.position.set(centerX - 46, centerY + 34, centerZ + 46)
// Un joc nou incepe aproape de oameni: de la 72 m, un pion avea 4×13 pixeli.
if (JOC_NOU !== null) { controls.target.set(centerX + 0.5, centerY + 1, centerZ + 0.5); camera.position.set(centerX - 18, centerY + 17, centerZ + 19) }
if (salvareIncarcata !== null) {
  const c = salvareIncarcata.meta.camera
  controls.target.set(c.tinta[0], c.tinta[1], c.tinta[2])
  camera.position.set(c.pos[0], c.pos[1], c.pos[2])
}
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

let focusCx = START_CX
let focusCy = START_CY
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

/** Multimea se reutilizeaza intre editari: `chunkuriDeRefacut` o goleste la intrare. */
const deRefacut = new Set<number>()

function remeshAfterEdit(wx: number, wy: number, promotedBefore: Set<number>): void {
  chunkuriDeRefacut(
    wx, wy,
    (key) => world.terrain.chunks.has(key),
    (key) => promotedBefore.has(key),
    deRefacut,
  )
  for (const key of deRefacut) {
    const c = world.terrain.chunks.get(key)
    if (c) buildChunkMesh(c)
  }
}

/**
 * Mesh-urile de refacut dupa editarile de teren de la ultima trecere, din JURNALUL terenului
 * (`terrain.jurnal`, ultimele `JURNAL_CAP` editari). Inainte, fiecare cadru cu un pion la lucru lua
 * un instantaneu al tuturor cheilor de desemnare (0,3 ms mediana, 2 ms la 4096 de desemnari — panoul
 * UI-ului, CG-7) si refacea doar in jurul desemnarilor disparute: o prabusire declansata de o sapatura
 * edita celule care nu fusesera desemnate. Jurnalul le are pe toate, si costa 0 cand nu se sapa nimic.
 *
 * „Era promovat" = mesh-ul lui e deja de voxeli, sau chunk-ul n-are voxeli: se refac doar vecinii
 * promovati ACUM (apron-ul) si chunk-urile atinse, ca in `remeshAfterEdit`.
 */
let editariVazute = world.terrain.editari
const deRemesh = new Set<number>()
const deRemeshEditare = new Set<number>()
function remeshDinJurnal(): void {
  const t = world.terrain
  const noi = t.editari - editariVazute
  if (noi === 0) return
  deRemesh.clear()
  if (noi > JURNAL_CAP) {
    for (const key of meshes.keys()) deRemesh.add(key)
  } else {
    const eraPromovat = (key: number): boolean => meshes.get(key)?.material === voxelMaterial || t.chunks.get(key)?.voxels === null
    for (let n = editariVazute; n < t.editari; n++) {
      const j = (n % JURNAL_CAP) * 3
      chunkuriDeRefacut(t.jurnal[j]!, t.jurnal[j + 1]!, (key) => t.chunks.has(key), eraPromovat, deRemeshEditare)
      for (const k of deRemeshEditare) deRemesh.add(k)
    }
  }
  editariVazute = t.editari
  for (const key of deRemesh) {
    const c = t.chunks.get(key)
    if (c) buildChunkMesh(c)
  }
  recount()
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

/**
 * Cota planului de taiere, in METRI DE LUME: se pastreaza y <= sliceLevel, iar nivelul activ e
 * `sliceLevel - 1`. `null` = slice-ul oprit.
 *
 * Plaja e fereastra de voxeli a chunk-ului focusului, nu [0, 64] m: cota e in lume, iar o vale sub
 * 0 m sau un deal peste 64 m nu se puteau lua ca nivel activ deloc (recenzia: sub −1 m nu se putea
 * desena). Vezi `plajaSlice`.
 */
let sliceLevel: number | null = null
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
/** Cursorul-fantoma trebuie recalculat (s-a miscat mouse-ul, camera, slice-ul, piesa...). Vezi sectiunea 4. */
let fantomaMurdara = false

/**
 * Cotele posibile ale planului: nivelul activ merge pe toate cele VOXEL_LEVELS niveluri ale ferestrei
 * chunk-ului focusului (`promotedBaseM` — si pe un chunk ne-promovat, e fereastra pe care ar avea-o).
 */
function plajaSlice(): { readonly lo: number; readonly hi: number } {
  const c = world.terrain.chunks.get(focusCy * 512 + focusCx)
  const base = c ? promotedBaseM(c) : 0
  return { lo: base + 1, hi: base + VOXEL_LEVELS }
}

// Planul e MEREU activ, si cand slice-ul e oprit: impins atat de sus incat nu
// taie nimic. Motivul e de masuratoare, nu de randare — numarul de clipping
// planes intra in cheia de program a shaderului, deci comutarea 0↔1 forteaza o
// recompilare, adica un cadru lung care arata exact ca un hiccup de streaming.
// Cu planul constant, un cadru lung la schimbarea de nivel e o constatare reala.
const SLICE_OFF = 1e6

function applySlice(): void {
  if (sliceLevel === null) {
    clipPlane.constant = SLICE_OFF
    el('slice').textContent = 'toate'
  } else {
    clipPlane.constant = sliceLevel
    el('slice').textContent = `${sliceLevel} m · activ ${sliceLevel - 1}`
  }
  fantomaMurdara = true
}
renderer.localClippingEnabled = true
renderer.clippingPlanes = [clipPlane]
if (PORNIRE?.slice != null) {
  const { lo, hi } = plajaSlice()
  sliceLevel = Math.max(lo, Math.min(hi, PORNIRE.slice))
  if (sliceLevel !== PORNIRE.slice) mesajPornire.push(`slice=${PORNIRE.slice} in afara ferestrei [${lo}, ${hi}], pus la ${sliceLevel}`)
}
if (salvareIncarcata !== null && salvareIncarcata.meta.slice !== null) {
  const { lo, hi } = plajaSlice()
  sliceLevel = Math.max(lo, Math.min(hi, salvareIncarcata.meta.slice))
}
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
 * Cat lucru de stabilitate intra intr-un cadru, in ms, plus celula din curs. Langa
 * grinzi o trecere intreaga costa secunde (3,2 s intr-o sala 23×23 cu 4 grinzi, masurat
 * la S20-23 t.4); feliata, se intinde pe cateva sute de cadre in loc sa inghete unul.
 */
const BUGET_STABILITATE_MS = 4

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
  const zActiv = sliceLevel === null ? null : sliceLevel - 1
  pornesteStabilitate(stabOverlay, world, DEFAULT_RULES, zActiv, focusCx * CHUNK_CELLS + 16, focusCy * CHUNK_CELLS + 16, 16)
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
// Piesa aleasa cu P, FARA UI (rularile de gate): pe NICIUNA, click-ul cere o SAPATURA; pe o piesa,
// cere piesa. Cu UI, piesa e a uneltei (`ui.unealta`, `ui.piesa`) — vezi `piesaCurenta`.
const PIESE_VIEWER: readonly number[] = [Piesa.NICIUNA, Piesa.PERETE, Piesa.PODEA, Piesa.SCARA, Piesa.GRINDA]
const NUME_PIESA_VIEWER: Readonly<Record<number, string>> = {
  [Piesa.NICIUNA]: 'sapa (P)',
  [Piesa.PERETE]: 'perete',
  [Piesa.PODEA]: 'podea',
  [Piesa.SCARA]: 'scara',
  [Piesa.GRINDA]: 'grinda',
}
let piesaAleasa: number = Piesa.NICIUNA
/** UI-ul de joc, montat la final (import dinamic) — `null` pe paginile de gate. */
let ui: UI | null = null
const cifre = cifreDinReguli(DEFAULT_RULES)

/** Tinta evenimentului e un camp de text: tastele de joc nu au voie sa-l fure (panoul, I6). */
function inCamp(ev: Event): boolean {
  const t = ev.target as HTMLElement | null
  return tintaEditabila(t?.tagName, t?.isContentEditable ?? false)
}
window.addEventListener('keydown', (ev) => {
  if (inCamp(ev) || ev.ctrlKey || ev.metaKey || ev.altKey || (ui?.modalDeschis() ?? false)) return
  if (ev.key === 'z' || ev.key === 'Z') tastaZ = true
  if (ev.key === 'x' || ev.key === 'X') tastaX = true
})
window.addEventListener('keyup', (ev) => { if (ev.key === 'z' || ev.key === 'Z') tastaZ = false; if (ev.key === 'x' || ev.key === 'X') tastaX = false })
// Un Alt+Tab cu Z tinut nu mai trimite keyup: fara asta, urmatorul click ar picta un depozit.
window.addEventListener('blur', () => { tastaZ = false; tastaX = false })
let downX = 0
let downY = 0
let moved = 0

/**
 * Cat de departe de camera poate cadea planul de rezerva al nivelului activ (viewer/tinta.ts,
 * regula 3). Cat sa cuprinda o casa privita de la distanta de pornire a camerei (~72 m), fara sa
 * desemneze o piesa pe cer, la sute de metri.
 */
const DEPARTE_MAX_M = 150

interface Modificatori {
  readonly ctrl: boolean
  readonly shift: boolean
  readonly alt: boolean
}

type TintaClick =
  | { readonly ok: true; readonly wx: number; readonly wy: number; readonly z: number }
  | { readonly ok: false; readonly mesaj: string }

/** Cuburile J DESENATE — deci nimic cand overlay-ul e oprit: ce nu se vede nu se tinteste. */
function cuburiJ(): CelulaJ[] {
  if (!jobOverlay.visible) return []
  const d = world.desemnari
  const out: CelulaJ[] = []
  for (let i = 0; i < d.count; i++) if (d.alive[i] === 1) out.push({ wx: d.wx[i]!, wy: d.wy[i]!, z: d.z[i]! })
  return out
}

/** Unealta in vigoare: a UI-ului, sau — fara UI — cea pe care o implica piesa aleasa cu P. */
function unealtaCurenta(): UnealtaId {
  if (ui !== null) return ui.unealta
  return piesaAleasa === Piesa.NICIUNA ? Unealta.SAPA : Unealta.CONSTRUIESTE
}

/** Piesa pe care o deseneaza click-ul simplu acum (`Piesa.NICIUNA` = sapa). */
function piesaCurenta(): number {
  if (ui !== null) return ui.unealta === Unealta.CONSTRUIESTE ? ui.piesa : Piesa.NICIUNA
  return piesaAleasa
}

/**
 * Felul tintei, din modificatori si unealta. Modificatorii de azi castiga peste orice unealta:
 * Z/X tinute = zona, Ctrl = retrage, Alt = sapa pe loc (solidul), Shift = zideste pe loc (fata).
 */
function modTinta(m: Modificatori): ModTinta {
  if (tastaZ || tastaX) return 'zona'
  if (m.ctrl && !m.shift && !m.alt) return 'retrage'
  if (m.alt) return 'sapa'
  if (m.shift) return 'fata'
  switch (unealtaCurenta()) {
    case Unealta.SAPA: return 'sapa'
    case Unealta.CONSTRUIESTE: return 'piesa'
    case Unealta.ANULEAZA: return 'retrage'
    case Unealta.ZONA:
    case Unealta.STERGE_ZONA: return 'zona'
    default: return 'inspecteaza'
  }
}

/**
 * Celula pe care o tinteste un click la pixelul dat, cu modificatorii dati. O singura functie
 * pentru click, pentru cursorul-fantoma si pentru colturile dreptunghiului: ce arata fantoma e ce
 * face click-ul. Ramificarea e in viewer/tinta.ts (`alegeTinta`, testata); aici doar raycast-ul.
 * La `zona`, celula intoarsa e solidul: zona se picteaza pe celula de deasupra lui.
 */
function tintaLa(px: number, py: number, m: Modificatori): TintaClick {
  pointer.x = (px / window.innerWidth) * 2 - 1
  pointer.y = -(py / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const o = raycaster.ray.origin
  const d = raycaster.ray.direction
  const raza: Raza = { o: { x: o.x, y: o.y, z: o.z }, d: { x: d.x, y: d.y, z: d.z } }
  const impacturi: Impact[] = raycaster.intersectObjects(group.children, false).map((h) => ({
    t: h.distance,
    p: { x: h.point.x, y: h.point.y, z: h.point.z },
    // Mesh-urile de chunk sunt doar translatate, deci normala fetei e deja in lume.
    n: h.face ? { x: h.face.normal.x, y: h.face.normal.y, z: h.face.normal.z } : { x: 0, y: 1, z: 0 },
  }))
  const zActiv = sliceLevel === null ? 0 : sliceLevel - 1
  return alegeTinta({
    mod: modTinta(m), raza, impacturi, slice: sliceLevel, cuburi: cuburiJ(), departeMax: DEPARTE_MAX_M,
    // Fara UI (verificare, gate): Z/X si Ctrl tintesc ca viewer-ul de la 3613652 (recenzia UI-ului, INT-10).
    caAzi: ui === null ? { cuPiesa: piesaCurenta() !== Piesa.NICIUNA } : undefined,
    desemnataPeNivel: (wx, wy) => desemnareLaCelula(world.desemnari, wx, wy, zActiv) !== -1,
    plinaPeNivel: (wx, wy) => { const r = materialAt(world.terrain, wx, wy, zActiv); return r.ok && isSolid(r.value) },
  })
}

// --- cursorul-fantoma: celula pe care o va tinti click-ul, INAINTE de click ----------------
//
// Fara el, jucatorul afla unde s-a pus piesa abia dupa click — iar cu paralaxa de dinainte afla
// ca s-a pus cu doua celule mai incolo. Un cub de linii putin mai lat decat celula (cuburile J sunt
// retrase in ea, deci se deosebesc), putin mai scund, ca muchiile de sus sa nu cada pe planul de
// taiere; alb pentru o comanda, rosu pentru retragere, albastru-gheata pentru Selecteaza. Desenat
// peste tot, ca si overlay-urile.
const fantoma = (() => {
  const a = -0.04, b = 1.04, y0 = 0.02, y1 = 0.98
  const c = [[a, y0, a], [b, y0, a], [b, y0, b], [a, y0, b], [a, y1, a], [b, y1, a], [b, y1, b], [a, y1, b]]
  const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
  const pos: number[] = []
  for (const [i, j] of e) pos.push(...c[i!]!, ...c[j!]!)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  const linii = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }))
  linii.visible = false
  linii.renderOrder = 10
  return linii
})()
scene.add(fantoma)
const CULOARE_FANTOMA = 0xffffff
const CULOARE_FANTOMA_RETRAGE = 0xff5a3c
const CULOARE_FANTOMA_INSPECTEAZA = 0x9fd3e0

/** Ultima pozitie a mouse-ului peste canvas, cu modificatorii ei; `null` = in afara lui. */
let ultimPointer: { x: number; y: number; m: Modificatori } | null = null
let butonApasat = false

function actualizeazaFantoma(): void {
  fantomaMurdara = false
  if (ultimPointer === null || (butonApasat && moved > DRAG_PX) || dreptunghiActiv() || (ui?.modalDeschis() ?? false)) { ascundeFantoma(); return }
  const m = ultimPointer.m
  const t = tintaLa(ultimPointer.x, ultimPointer.y, m)
  if (!t.ok) { ascundeFantoma(t.mesaj); return }
  const mod = modTinta(m)
  // Depozitul (Z, Zone) si stergerea lui (X) lucreaza pe celula calcabila de DEASUPRA celei atinse.
  const z = mod === 'zona' ? t.z + 1 : t.z
  fantoma.position.set(t.wx, z, t.wy)
  const retrage = mod === 'retrage'
  fantoma.userData.retrage = retrage
  ;(fantoma.material as THREE.LineBasicMaterial).color.setHex(retrage ? CULOARE_FANTOMA_RETRAGE : mod === 'inspecteaza' ? CULOARE_FANTOMA_INSPECTEAZA : CULOARE_FANTOMA)
  fantoma.visible = true
  // Celula in cifre, pe randul „cursor": pasii de verificare pot spune „du cursorul pe 12391,4604".
  el('cursor').textContent = `${t.wx},${t.wy} · z ${z}${retrage ? ' · retrage' : ''}`
}

function ascundeFantoma(dece = '—'): void {
  fantoma.visible = false
  el('cursor').textContent = dece
}

function modificatori(ev: MouseEvent | KeyboardEvent): Modificatori {
  return { ctrl: ev.ctrlKey, shift: ev.shiftKey, alt: ev.altKey }
}

// --- dreptunghiul: o unealta trasa peste mai multe celule ------------------------------------
//
// Registrul S20-23: „linie/dreptunghi". Coltul 1 = tinta de la apasare, coltul 2 = tinta de sub
// cursor (aceeasi functie ca fantoma); cota o decide `planDreptunghi` (viewer/ui/dreptunghi.ts):
// nivelul activ cu slice-ul pornit, solul pe coloana cu slice-ul oprit. Porneste doar pe butonul
// stang, doar cand coltul 2 iese din celula de start; Esc sau click-dreapta renunta.

interface Tragere {
  readonly unealta: UnealtaId
  /** Felul zonei, fixat la APASARE: Z eliberat inaintea butonului picta altceva decat arata (INT-11). */
  readonly zonaFel: number
  readonly start: { readonly wx: number; readonly wy: number; readonly z: number }
  readonly m: Modificatori
  colt: { wx: number; wy: number } | null
  activ: boolean
  plan: PlanDreptunghi | null
}
let tragere: Tragere | null = null
function dreptunghiActiv(): boolean { return tragere !== null && tragere.activ }

/** Unealta dreptunghiului, din modificatorii de la apasare: Ctrl = anuleaza, Z = depozit, X = sterge zona. */
function unealtaTragerii(m: Modificatori): UnealtaId | null {
  if (m.shift || m.alt) return null
  if (tastaZ) return Unealta.ZONA
  if (tastaX) return Unealta.STERGE_ZONA
  if (m.ctrl) return Unealta.ANULEAZA
  const u = unealtaCurenta()
  // In modul de verificare, tragerea simpla roteste camera, ca in OWNER_VERIFY 12 si 13; dreptunghiul
  // se face doar cu modificatori. In joc, orice unealta care nu e Selecteaza trage dreptunghiuri.
  if (MOD_JOC === 'verificare' || ui === null) return null
  return u === Unealta.SELECTEAZA ? null : u
}

/** Butonul stang al camerei: `null` cat o unealta trage dreptunghiuri, altfel rotire (ca azi). */
function butoaneCamera(m: Modificatori | null): void {
  if (ui === null) return
  const rect = m !== null && unealtaTragerii(m) !== null
  controls.mouseButtons.LEFT = rect ? null : THREE.MOUSE.ROTATE
  // Rotita apasata roteste in ORICE mod, ca sa ramana o rotire si sub o unealta (panoul, I2).
  controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE
}

/** Lumea, pentru `planDreptunghi`. */
const lumeaDreptunghiului: Lumea = {
  solid: (wx, wy, z) => { const r = materialAt(world.terrain, wx, wy, z); return r.ok && isSolid(r.value) },
  suprafata: (wx, wy) => suprafata(wx, wy),
  calcabil: (wx, wy, z) => isWalkable(world.terrain, wx, wy, z, DEFAULT_RULES),
  desemnare: (wx, wy, z) => { const s = desemnareLaCelula(world.desemnari, wx, wy, z); return s === -1 ? -1 : world.desemnari.id[s]! },
  inZona: (wx, wy, z) => celulaDeZonaLa(world.zone, wx, wy, z) !== -1,
  desemnariIn: (d, zMax) => {
    const out: { id: number; wx: number; wy: number; z: number }[] = []
    const ds = world.desemnari
    for (let i = 0; i < ds.count; i++) {
      if (ds.alive[i] !== 1 || ds.z[i]! > zMax) continue
      if (ds.wx[i]! < d.x0 || ds.wx[i]! > d.x1 || ds.wy[i]! < d.y0 || ds.wy[i]! > d.y1) continue
      out.push({ id: ds.id[i]!, wx: ds.wx[i]!, wy: ds.wy[i]!, z: ds.z[i]! })
    }
    return out
  },
  zoneIn: (d, zMax) => {
    const c = world.zone.celule
    const total = new Map<number, number>()
    const inD = new Map<number, number>()
    for (let i = 0; i < c.count; i++) {
      if (c.alive[i] !== 1) continue
      const id = c.zonaId[i]!
      total.set(id, (total.get(id) ?? 0) + 1)
      if (c.z[i]! > zMax + 1 || c.wx[i]! < d.x0 || c.wx[i]! > d.x1 || c.wy[i]! < d.y0 || c.wy[i]! > d.y1) continue
      inD.set(id, (inD.get(id) ?? 0) + 1)
    }
    return [...inD.keys()].sort((a, b) => a - b).map((id) => ({ id, celule: total.get(id)!, celuleInDreptunghi: inD.get(id)! }))
  },
}

/**
 * Solidul de sus al coloanei. Pe un chunk promovat, din voxeli, de sus in jos (`groundLevelM` e
 * relieful neatins: nu stie de sapaturi si de ziduri); pe unul nepromovat, relieful.
 */
function suprafata(wx: number, wy: number): number | null {
  const iv = voxelRangeM(world.terrain, wx, wy)
  if (!iv.ok) return null
  const g = groundLevelM(world.terrain, wx, wy)
  const c = world.terrain.chunks.get(Math.floor(wy / CHUNK_CELLS) * 512 + Math.floor(wx / CHUNK_CELLS))
  if (!c || c.voxels === null) return g.ok ? g.value : null
  for (let z = iv.value.max; z >= iv.value.min; z--) {
    const r = materialAt(world.terrain, wx, wy, z)
    if (r.ok && isSolid(r.value)) return z
  }
  return null
}

function optiuniDreptunghi(u: UnealtaId, zonaFel?: number): Parameters<typeof planDreptunghi>[1] {
  const r = DEFAULT_RULES
  return {
    unealta: u,
    piesa: ui?.piesa ?? piesaAleasa,
    zonaFel: zonaFel ?? (u === Unealta.ZONA && tastaZ ? 0 : ui?.zonaFel ?? 0),
    contur: ui?.contur ?? true,
    unStrat: ui?.unStrat ?? false,
    prioritate: ui?.prioritate ?? r.designationPriorityDefault,
    zActiv: sliceLevel === null ? null : sliceLevel - 1,
    inaltimeOm: r.agentHeadroomM,
    locDesemnari: r.designationCapacity - world.desemnari.vii,
    locZone: r.zoneCellCapacity - world.zone.celule.vii,
  }
}

/** Cuburile-fantoma ale dreptunghiului: prealocate, rescrise cel mult o data pe cadru. */
const FANTOME_MAX = 1024
const fantomeDreptunghi = (() => {
  const pos = new Float32Array(FANTOME_MAX * 24 * 3)
  const geo = new THREE.BufferGeometry()
  const a = new THREE.BufferAttribute(pos, 3)
  a.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', a)
  geo.setDrawRange(0, 0)
  const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }))
  l.frustumCulled = false
  l.renderOrder = 9
  l.visible = false
  return l
})()
scene.add(fantomeDreptunghi)
let fantomeMurdare = false

function scrieFantomeDreptunghi(): void {
  fantomeMurdare = false
  const t = tragere
  if (t === null || !t.activ || t.plan === null) { fantomeDreptunghi.visible = false; return }
  const pos = (fantomeDreptunghi.geometry.getAttribute('position') as THREE.BufferAttribute)
  const arr = pos.array as Float32Array
  let n = 0
  const rosu = t.plan.refuz !== null || t.unealta === Unealta.ANULEAZA || t.unealta === Unealta.STERGE_ZONA
  const cel = t.plan.celule
  const muchii = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]
  for (let k = 0; k < cel.length && k < FANTOME_MAX; k++) {
    const c = cel[k]!
    const x0 = c.wx + 0.06, x1 = c.wx + 0.94, y0 = c.z + 0.04, y1 = c.z + 0.96, z0 = c.wy + 0.06, z1 = c.wy + 0.94
    const col = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]
    for (const e of muchii) { const v = col[e]!; arr[n * 3] = v[0]!; arr[n * 3 + 1] = v[1]!; arr[n * 3 + 2] = v[2]!; n++ }
  }
  fantomeDreptunghi.geometry.setDrawRange(0, n)
  pos.clearUpdateRanges()
  if (n > 0) { pos.addUpdateRange(0, n * 3); pos.needsUpdate = true }
  ;(fantomeDreptunghi.material as THREE.LineBasicMaterial).color.setHex(rosu ? CULOARE_FANTOMA_RETRAGE : CULOARE_FANTOMA)
  fantomeDreptunghi.visible = true
}

function actualizeazaTragerea(px: number, py: number): void {
  const t = tragere
  if (t === null) return
  const c = tintaLa(px, py, t.m)
  // Fara tinta (cer, teren taiat): coltul ramane ultimul valid.
  if (c.ok) t.colt = { wx: c.wx, wy: c.wy }
  if (t.colt === null) return
  if (!t.activ && (t.colt.wx !== t.start.wx || t.colt.wy !== t.start.wy)) t.activ = true
  if (!t.activ) return
  const d = normalizeaza(t.start.wx, t.start.wy, t.colt.wx, t.colt.wy)
  t.plan = planDreptunghi(d, optiuniDreptunghi(t.unealta, t.zonaFel), lumeaDreptunghiului)
  ui?.indiciuDreptunghi(`${d.x1 - d.x0 + 1} × ${d.y1 - d.y0 + 1} · ${textPlan(t.plan, t.unealta)} · Esc / clic dreapta = renunță`, t.plan.refuz !== null)
  fantomeMurdare = true
  fantomaMurdara = true
}

function renuntaLaTragere(): void {
  if (tragere === null) return
  tragere = null
  // Butonul e inca apasat (Esc sau clic-dreapta in timpul tragerii): eliberarea lui aduce un `click`,
  // care altfel ar desemna celula de sub cursor — exact ce jucatorul a vrut sa nu se intample.
  if (butonApasat) clickConsumat = true
  ui?.indiciuDreptunghi(null)
  fantomeMurdare = true
  fantomaMurdara = true
}

/** Comenzile unui dreptunghi se aplica feliat: cel mult atatea pe cadru (~21 µs pe celula, masurat de panou). */
const COMENZI_PE_CADRU = 512
interface Aplicare {
  readonly unealta: UnealtaId
  readonly plan: PlanDreptunghi
  cursor: number
  aplicate: number
  readonly refuzuri: Map<string, number>
  /** Id-urile desemnarilor create: „Anuleaza" din toast le retrage exact pe ele. */
  readonly create: number[]
  zonaId: number | null
}
let aplicare: Aplicare | null = null

function aplicaDreptunghi(t: Tragere): void {
  // Un dreptunghi tras cat cel de dinainte inca se aplica feliat il taia in tacere: al doilea
  // suprascria aplicarea in curs (recenzia UI-ului, INT-4: 1.552 de sapaturi pierdute, fara toast).
  // Cel vechi se termina acum, sincron (~21 µs pe celula), iar planul celui nou se reface peste el.
  if (aplicare !== null) {
    while (aplicare !== null) pasAplicare()
    if (t.plan !== null && t.colt !== null) t.plan = planDreptunghi(normalizeaza(t.start.wx, t.start.wy, t.colt.wx, t.colt.wy), optiuniDreptunghi(t.unealta, t.zonaFel), lumeaDreptunghiului)
  }
  const plan = t.plan
  if (plan === null) return
  if (plan.refuz !== null) { ui?.toast(plan.refuz, true); return }
  if (t.unealta === Unealta.STERGE_ZONA && plan.celuleInAfara > 20
    && !window.confirm(`Zonele atinse se șterg ÎNTREGI: ${plan.celuleInAfara} celule sunt în afara dreptunghiului. Continui?`)) return
  aplicare = { unealta: t.unealta, plan, cursor: 0, aplicate: 0, refuzuri: new Map(), create: [], zonaId: null }
  // Zonele: bucatile, legate de prima (o zona), dintr-o data — sunt putine comenzi.
  for (const b of plan.zone) {
    const out = applyCommand(world, { kind: 'picteazaZona', x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, z: b.z, fel: t.zonaFel, zonaId: aplicare.zonaId ?? undefined })
    if (out.ok) { aplicare.zonaId = out.value; aplicare.aplicate++ } else noteazaRefuz(aplicare, out)
  }
}

function noteazaRefuz(a: Aplicare, out: Refusal): void {
  const t = textMotiv('comanda', out.reason, 0, out.params, cifre).titlu
  a.refuzuri.set(t, (a.refuzuri.get(t) ?? 0) + 1)
  el('spot').textContent = `refuzat: ${describe(out)}`
}

/** O felie de comenzi pe cadru; la capat, toastul si o singura redesenare. */
function pasAplicare(): void {
  const a = aplicare
  if (a === null) return
  const cmds = a.plan.comenzi
  const pana = Math.min(cmds.length, a.cursor + COMENZI_PE_CADRU)
  for (; a.cursor < pana; a.cursor++) {
    const out = applyCommand(world, cmds[a.cursor]!)
    if (out.ok) {
      a.aplicate++
      if (cmds[a.cursor]!.kind === 'desemneaza') a.create.push(out.value as number)
    } else noteazaRefuz(a, out)
  }
  if (a.cursor < cmds.length) { ui?.indiciuDreptunghi(`Se aplică… ${a.cursor} / ${cmds.length}`); return }
  aplicare = null
  ui?.indiciuDreptunghi(null)
  dupaComenzi(cmds.length > 0 ? cmds : a.plan.zone.length > 0 ? [{ kind: 'picteazaZona', x0: 0, y0: 0, x1: 0, y1: 0, z: 0 }] : [])
  const refuz = [...a.refuzuri].map(([t, n]) => `${n} refuzate: ${t}`).join(' · ')
  let text = textPlan(a.plan, a.unealta)
  if (refuz) text += ` · ${refuz}`
  if (a.unealta === Unealta.CONSTRUIESTE && a.create.length > 0 && ui !== null) {
    // Ce n-ar sta in picioare nici dupa restul planului, numarat DOAR pe piesele noi (panoul, CS-3).
    const p = ui.previz()
    let n = 0
    for (const id of a.create) {
      const s = slotDesemnare(world.desemnari, id)
      if (s !== -1 && p.imposibile.has(cellKey(world.desemnari.wx[s]!, world.desemnari.wy[s]!, world.desemnari.z[s]!))) n++
    }
    if (n > 0) text += ` · ${n} n-ar sta în picioare (pornește S)`
  }
  const create = a.create
  const zonaNoua = a.zonaId
  ui?.toast(text, refuz !== '' && a.aplicate === 0, create.length > 0 || zonaNoua !== null ? {
    eticheta: 'Anulează',
    f: () => {
      const inapoi: Command[] = create.map((id) => ({ kind: 'anuleazaDesemnarea', id }))
      if (zonaNoua !== null) inapoi.push({ kind: 'stergeZona', id: zonaNoua })
      for (const c of inapoi) applyCommand(world, c)
      dupaComenzi(inapoi)
    },
  } : undefined)
}

/**
 * Dupa comenzi care nu editeaza terenul (desemnari, zone, prioritati): overlay-urile o singura data,
 * si „Primii pasi". Comenzile de teren (Alt/Shift+click) se refac din jurnalul terenului.
 */
function dupaComenzi(cmds: readonly Command[]): void {
  if (cmds.length === 0) return
  for (const c of cmds) {
    if (c.kind === 'desemneaza') ui?.noteaza(c.piesa === undefined || c.piesa === Piesa.NICIUNA ? 'sapa' : 'piesa')
  }
  if (jobOverlay.visible) rebuildJobOverlay(jobOverlay, world)
  // „Imposibil", „fara acces" si previzualizarea de prabusire se refac pe loc, la fiecare actiune
  // a jucatorului (cu S pornit) — o data pe click sau pe dreptunghi, nu pe celula.
  redeseneazaStabilitate(stabOverlay, world, DEFAULT_RULES)
}

renderer.domElement.addEventListener('pointerdown', (ev) => {
  downX = ev.clientX
  downY = ev.clientY
  moved = 0
  butonApasat = true
  // O apasare noua: un `click` consumat de la apasarea trecuta (eliberata in afara canvasului) nu mai vine.
  if (ev.button === 0) { clickConsumat = false; apasareCuUnealta = false }
  // Click-dreapta in timpul tragerii = renunta (convenția RimWorld / Going Medieval).
  if (ev.button === 2 && tragere !== null) { renuntaLaTragere(); return }
  if (ev.button !== 0 || ui === null || ui.modalDeschis()) return
  const m = modificatori(ev)
  const u = unealtaTragerii(m)
  if (u === null) return
  const t = tintaLa(ev.clientX, ev.clientY, m)
  // Apasarea pe cer nu porneste nimic.
  if (!t.ok) return
  tragere = { unealta: u, zonaFel: optiuniDreptunghi(u).zonaFel, start: { wx: t.wx, wy: t.wy, z: t.z }, m, colt: { wx: t.wx, wy: t.wy }, activ: false, plan: null }
  apasareCuUnealta = true
})
// Butoanele camerei se aleg INAINTE ca OrbitControls sa vada apasarea (el asculta pe canvas, fara
// capture): o unealta trage dreptunghiuri pe butonul stang, Selecteaza roteste, ca azi.
window.addEventListener('pointerdown', (ev) => { butoaneCamera(modificatori(ev)) }, { capture: true })
window.addEventListener('pointerup', (ev) => {
  butonApasat = false
  fantomaMurdara = true
  const t = tragere
  if (t === null || ev.button !== 0) return
  tragere = null
  ui?.indiciuDreptunghi(null)
  fantomeMurdare = true
  if (t.activ) {
    // Tragerea s-a facut dreptunghi: click-ul care urmeaza nu mai desemneaza nimic.
    clickConsumat = true
    aplicaDreptunghi(t)
  }
})
// Clic-dreapta CU stangul tinut nu da `pointerdown` (Pointer Events: un buton in plus e un
// `pointermove` „chorded"), deci renuntarea se prinde pe `buttons`. Fara asta, gestul promis de indiciu
// („clic dreapta = renunță") APLICA dreptunghiul la eliberare (recenzia UI-ului, INT-2). Pe `window`,
// cu capture, ca eliberarea: nu depinde de elementul de sub cursor.
window.addEventListener('pointermove', (ev) => { if (tragere !== null && (ev.buttons & 2) !== 0) renuntaLaTragere() }, { capture: true })
renderer.domElement.addEventListener('contextmenu', (ev) => { if (tragere !== null) ev.preventDefault() })
renderer.domElement.addEventListener('pointermove', (ev) => {
  const dx = ev.clientX - downX
  const dy = ev.clientY - downY
  moved = Math.max(moved, Math.hypot(dx, dy))
  ultimPointer = { x: ev.clientX, y: ev.clientY, m: modificatori(ev) }
  fantomaMurdara = true
  if (tragere !== null) actualizeazaTragerea(ev.clientX, ev.clientY)
})
renderer.domElement.addEventListener('pointerleave', () => { ultimPointer = null; fantomaMurdara = true })
// Ctrl/Shift/Alt/Z/X schimba tinta fara sa miste mouse-ul; la fel P, Q/E, J, S.
for (const tip of ['keydown', 'keyup'] as const) {
  window.addEventListener(tip, (ev) => {
    if (ultimPointer !== null) ultimPointer = { ...ultimPointer, m: modificatori(ev) }
    fantomaMurdara = true
  })
}
// Camera se misca si dupa ce s-a oprit mouse-ul (amortizarea OrbitControls): tinta de sub el se muta.
controls.addEventListener('change', () => { fantomaMurdara = true })

/** Pixelii in care un click prinde un pion: un pion are ~4×13 px la 720p, deci raza pe mesh ar rata. */
const PION_PX = 14
const m4 = new THREE.Matrix4()
const v3 = new THREE.Vector3()

/**
 * Pionul de sub cursor, in spatiul ECRANULUI: cel mai apropiat de pixel, pe cel mult `PION_PX`,
 * dintre cei VAZUTI — sub planul de taiere si nu in spatele terenului atins de raza. Raycast-ul pe
 * `InstancedMesh` rata 21 din 24 de pioni dupa 10 s: sfera de incadrare se calculeaza o data, la
 * primul cadru (panoul, I4). Intoarce id-ul agentului.
 */
function pionSubCursor(px: number, py: number): number | null {
  pointer.x = (px / window.innerWidth) * 2 - 1
  pointer.y = -(py / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const teren = raycaster.intersectObjects(group.children, false).find((h) => sliceLevel === null || h.point.y <= sliceLevel + 1e-3)
  let best: number | null = null
  let bestD = PION_PX * PION_PX
  for (let k = 0; k < agentLayer.vii; k++) {
    agentLayer.mesh.getMatrixAt(k, m4)
    v3.setFromMatrixPosition(m4)
    if (sliceLevel !== null && v3.y >= sliceLevel) continue
    v3.y += 0.7
    const dist = v3.distanceTo(camera.position)
    if (teren && dist > teren.distance + 1.5) continue
    v3.project(camera)
    if (v3.z > 1) continue
    const sx = (v3.x + 1) / 2 * window.innerWidth
    const sy = (1 - v3.y) / 2 * window.innerHeight
    const d = (sx - px) ** 2 + (sy - py) ** 2
    if (d <= bestD) { bestD = d; best = world.agents.id[agentLayer.sloturi[k]!]! }
  }
  return best
}

/** Tragerea tocmai s-a aplicat ca dreptunghi: evenimentul `click` care vine dupa ea nu mai face nimic. */
let clickConsumat = false
/**
 * Apasarea a armat un dreptunghi (o unealta, pe teren). Decide, la `click`, daca o tragere mai lunga
 * de DRAG_PX mai e clic: din APASARE, nu din modificatorii de la eliberare — o apasare pe cer, sau
 * o panoramare cu Shift eliberat primul, lasau o lucrare sub cursor (recenzia UI-ului, INT-3).
 */
let apasareCuUnealta = false

renderer.domElement.addEventListener('click', (ev) => {
  if (clickConsumat) { clickConsumat = false; return }
  if (ui?.modalDeschis()) return
  // O tragere mica, ramasa in celula de start: cu o unealta de dreptunghi, tot click e.
  if (moved > DRAG_PX && !apasareCuUnealta) return
  const m = modificatori(ev)
  const mod = modTinta(m)
  fantomaMurdara = true
  if (mod === 'inspecteaza' && ui !== null) {
    const pion = pionSubCursor(ev.clientX, ev.clientY)
    if (pion !== null) { ui.inspecteazaPion(pion); return }
  }
  const t = tintaLa(ev.clientX, ev.clientY, m)
  // Un click care nu face nimic trebuie sa spuna de ce (cer, sau doar teren taiat sub cursor).
  if (!t.ok) {
    el('spot').textContent = t.mesaj
    return
  }
  const { wx, wy, z } = t
  if (mod === 'inspecteaza') { ui?.inspecteazaCelula(wx, wy, z); return }
  const u = unealtaCurenta()

  // Click = DESEMNEAZA (un pion vine sa sape sau sa zideasca). Alt+click = sapa pe loc (unealta de
  // debug, si ce chema scenariul de gate S-DIG). Ctrl+click (si Anuleaza) = retrage desemnarea de pe
  // celula. Shift+click = zideste pe loc. Z/X tinute = depozit / sterge zona, ca inainte; uneltele
  // Zone ale UI-ului picteaza o celula pe click (dreptunghiul se trage).
  let out
  let dinTeren = false
  if (tastaZ) {
    // Depozitul se picteaza pe celula CALCABILA de deasupra solului atins.
    if (!coltZona) {
      coltZona = { wx, wy, z: z + 1 }
      el('spot').textContent = `depozit: coltul 1 la ${wx},${wy} — click cu Z pe coltul 2`
      ui?.indiciuDreptunghi(`Depozit: colțul 1 la ${wx}, ${wy} — clic cu Z pe colțul 2 · Esc = renunță`)
      return
    }
    out = applyCommand(world, { kind: 'picteazaZona', x0: coltZona.wx, y0: coltZona.wy, x1: wx, y1: wy, z: coltZona.z })
    coltZona = null
    ui?.indiciuDreptunghi(null)
  } else if (tastaX || (mod === 'zona' && u === Unealta.STERGE_ZONA)) {
    const cs = celulaDeZonaLa(world.zone, wx, wy, z + 1)
    out = cs === -1
      ? applyCommand(world, { kind: 'stergeZona', id: -1 })
      : applyCommand(world, { kind: 'stergeZona', id: world.zone.celule.zonaId[cs]! })
  } else if (mod === 'zona') {
    out = applyCommand(world, { kind: 'picteazaZona', x0: wx, y0: wy, x1: wx, y1: wy, z: z + 1, fel: ui?.zonaFel ?? 0 })
  } else if (m.shift) {
    out = applyCommand(world, { kind: 'fill', wx, wy, z, material: Material.PIATRA_CONSTRUITA })
    dinTeren = true
  } else if (m.alt) {
    out = applyCommand(world, { kind: 'dig', wx, wy, z })
    dinTeren = true
  } else if (mod === 'retrage') {
    const ds = desemnareLaCelula(world.desemnari, wx, wy, z)
    out = ds === -1
      ? applyCommand(world, { kind: 'anuleazaDesemnarea', id: -1 })
      : applyCommand(world, { kind: 'anuleazaDesemnarea', id: world.desemnari.id[ds]! })
  } else {
    const piesa = piesaCurenta()
    out = applyCommand(world, { kind: 'desemneaza', wx, wy, z, piesa: piesa === Piesa.NICIUNA ? undefined : piesa, prioritate: ui?.prioritate })
  }

  // Un refuz care nu se vede e un buton care „nu face nimic". Contractul de Outcome poarta motivul —
  // ar fi absurd sa-l arunc exact la capatul lantului. Diagnosticul pastreaza sirul brut.
  if (!out.ok) {
    console.warn(`refuzat la ${wx},${wy},${z}: ${describe(out)}`)
    el('spot').textContent = `refuzat: ${describe(out)}`
    const tx = textMotiv('comanda', out.reason, 0, out.params, cifre)
    ui?.toast(tx.actiune ? `${tx.titlu} ${tx.actiune}` : tx.titlu, true)
    return
  }
  if (!dinTeren) {
    // Desemnarea, retragerea si zonele nu schimba terenul: doar overlay-urile, o data.
    const piesa = piesaCurenta()
    dupaComenzi(mod === 'sapa' || mod === 'piesa'
      ? [{ kind: 'desemneaza', wx, wy, z, piesa: piesa === Piesa.NICIUNA ? undefined : piesa }]
      : [{ kind: 'anuleazaDesemnarea', id: -1 }])
    return
  }

  // Zidirea si sapatul pe loc schimba terenul: mesh-urile se refac din JURNALUL terenului (fiecare
  // celula editata, si prabusirile pe care le-a declansat), nu doar in jurul celulei atinse.
  remeshDinJurnal()
  // O actiune a jucatorului: previzualizarile lui S se refac (ca dupa `dupaComenzi`), oricat ar costa.
  // Fara asta, in modul de verificare HUD-ul spunea „89 fara acces" dupa ce treapta fusese zidita
  // (recenzia UI-ului, V3).
  redeseneazaStabilitate(stabOverlay, world, DEFAULT_RULES)
  // Regiunile se intretin DOAR cat timp overlay-ul e deschis: `rebuildDirty` reconstruieste toate
  // blocurile rezidente (~735 cu overlay-ul pornit, peste 150 ms pe click).
  if (regionOverlay.visible) {
    rebuildDirty(world.terrain, regions, DEFAULT_RULES)
    refreshOverlay()
  }
  recount()
})

// --- tastele: un singur dispecer (viewer/ui/taste.ts) ------------------------------------------

/** Planul a fost stins de amprenta (B) si se reaprinde la iesirea din ea. */
let jStinsDeAmprenta = false
function comutaG(): void {
  regionOverlay.visible = !regionOverlay.visible
  regionOverlay.group.visible = regionOverlay.visible
  refreshOverlay()
}
function comutaJ(): void {
  jobOverlay.visible = !jobOverlay.visible
  jobOverlay.group.visible = jobOverlay.visible
  rebuildJobOverlay(jobOverlay, world)
}
function comutaS(): void {
  stabOverlay.visible = !stabOverlay.visible
  stabOverlay.group.visible = stabOverlay.visible
  refaStabilitate()
}

/** Nivelul, cu plaja lui: Q porneste slice-ul in varful ferestrei si coboara; E urca, iar peste varf il opreste. */
function seteazaNivel(cota: number | null): void {
  const { lo, hi } = plajaSlice()
  sliceLevel = cota === null ? null : Math.max(lo, Math.min(hi, cota))
  applySlice()
  // Alt nivel = alta intrebare: trecerea veche se lasa, desenul ei se sterge.
  refaStabilitate()
}
function nivelJos(): void {
  const { lo, hi } = plajaSlice()
  seteazaNivel(sliceLevel === null ? hi : Math.max(lo, Math.min(hi, sliceLevel - 1)))
}
function nivelSus(): void {
  const { lo, hi } = plajaSlice()
  seteazaNivel(sliceLevel === null ? null : sliceLevel >= hi ? null : Math.max(lo, sliceLevel + 1))
}

/** Muta camera cu `pas` metri pe sol, in directia privirii (nord) sau lateral (est). */
function mutaCamera(inainte: number, lateral: number): void {
  // Sagetile sunt o cerere a jucatorului: urmarirea s-ar fi tras camera inapoi in 2 s (INT-5).
  urmaritId = null
  const f = new THREE.Vector3().subVectors(controls.target, camera.position)
  f.y = 0
  if (f.lengthSq() === 0) return
  f.normalize()
  const r = new THREE.Vector3(-f.z, 0, f.x)
  const d = f.multiplyScalar(inainte).add(r.multiplyScalar(lateral))
  controls.target.add(d)
  camera.position.add(d)
}

function executa(a: Actiune, ev: KeyboardEvent): void {
  switch (a) {
    // --- D20: amprenta unei cladiri asezate liber ---
    case 'amprenta':
      amprentaOverlay.visible = !amprentaOverlay.visible
      amprentaOverlay.group.visible = amprentaOverlay.visible
      refreshAmprenta()
      // Planul (J) foloseste aceleasi culori (chihlimbar, rosu): in joc, unde e aprins, amprenta se
      // judeca peste zeci de mormane rosii (recenzia UI-ului, V4). Se stinge cat e ea aprinsa.
      if (amprentaOverlay.visible && jobOverlay.visible) { jStinsDeAmprenta = true; comutaJ() }
      else if (!amprentaOverlay.visible && jStinsDeAmprenta) { jStinsDeAmprenta = false; if (!jobOverlay.visible) comutaJ() }
      return
    case 'amprentaStanga': amprentaOverlay.grade = (amprentaOverlay.grade + 355) % 360; refreshAmprenta(); return
    case 'amprentaDreapta': amprentaOverlay.grade = (amprentaOverlay.grade + 5) % 360; refreshAmprenta(); return
    case 'amprentaForma': amprentaOverlay.forma = (amprentaOverlay.forma + 1) % FORME.length; refreshAmprenta(); return
    case 'amprentaAncora': amprentaOverlay.ancorat = !amprentaOverlay.ancorat; refreshAmprenta(); return
    case 'piesa':
      if (ui !== null) ui.ciclezaPiesa()
      else piesaAleasa = PIESE_VIEWER[(PIESE_VIEWER.indexOf(piesaAleasa) + 1) % PIESE_VIEWER.length]!
      el('piesa').textContent = ui?.numePiesa() ?? NUME_PIESA_VIEWER[piesaAleasa]!
      return
    case 'pauza': seteazaPauza(!simPauza); return
    case 'ciclulH': {
      // Trei stari: tot → doar HUD-ul → nimic. La 1280×720, cu J si S pornite, HUD-ul si ajutorul
      // acopereau 90% din ecran (recenzia, `p10-hud.mjs`); HUD-ul ramane cand ajutorul nu mai trebuie.
      const keys = el('keys')
      if (!keys.hidden) keys.hidden = true
      else if (!hud.hidden) hud.hidden = true
      else { hud.hidden = false; keys.hidden = false }
      return
    }
    case 'overlayG': comutaG(); return
    case 'overlayJ': comutaJ(); return
    case 'overlayS': comutaS(); return
    case 'traversare': traversing = !traversing; return
    case 'traversareSens': traverseDir = -traverseDir; return
    case 'ceas': traverseFixedClock = !traverseFixedClock; return
    case 'nivelJos': nivelJos(); return
    case 'nivelSus': nivelSus(); return
    case 'nivelOprit': seteazaNivel(null); return
    case 'selecteaza': ui?.alegeUnealta(Unealta.SELECTEAZA); return
    case 'sapa': ui?.alegeUnealta(Unealta.SAPA); return
    case 'construieste': ui?.alegeUnealta(Unealta.CONSTRUIESTE); return
    case 'anuleaza': ui?.alegeUnealta(Unealta.ANULEAZA); return
    case 'zona': ui?.alegeUnealta(ui.unealta === Unealta.ZONA ? Unealta.STERGE_ZONA : Unealta.ZONA); return
    case 'oameni': ui?.comutaOameni(); return
    case 'viteza1': case 'viteza2': case 'viteza3':
      seteazaViteza(Number(a.slice(-1)))
      seteazaPauza(false)
      return
    case 'salveaza': ui?.salveazaAcum(); return
    case 'ajutor': ui?.arataAjutorul(); return
    case 'diagnostic': hud.hidden = !hud.hidden; return
    case 'esc':
      // Ordinea (panoul, I9): dreptunghiul in curs, coltul Z, apoi UI-ul (fereastra, unealta, selectia, meniul).
      if (tragere !== null) { renuntaLaTragere(); return }
      if (coltZona !== null) { coltZona = null; ui?.indiciuDreptunghi(null); el('spot').textContent = 'depozit: colțul 1 șters'; return }
      ui?.esc()
      return
    case 'cameraVest': mutaCamera(0, -4); return
    case 'cameraEst': mutaCamera(0, 4); return
    case 'cameraNord': mutaCamera(4, 0); return
    case 'cameraSud': mutaCamera(-4, 0); return
  }
  void ev
}

window.addEventListener('keydown', (ev) => {
  const iesire = actiuneTasta({
    key: ev.key, ctrl: ev.ctrlKey, shift: ev.shiftKey, alt: ev.altKey, meta: ev.metaKey,
    editabil: inCamp(ev), compunere: ev.isComposing, modal: ui?.modalDeschis() ?? false,
    mod: ui === null ? 'faraUI' : MOD_JOC === 'verificare' ? 'verificare' : 'joc',
    amprenta: amprentaOverlay.visible,
  })
  if (iesire.consuma) ev.preventDefault()
  if (iesire.actiune !== null) executa(iesire.actiune, ev)
})

/** Viteza simularii (1×, 2×, 3×). `stepSim` primeste `dt × viteza`; plafonul de tickuri pe cadru ramane. */
let viteza = salvareIncarcata !== null ? Math.max(1, Math.min(3, Math.round(salvareIncarcata.meta.viteza))) : 1
function seteazaPauza(p: boolean): void {
  if (p !== simPauza) golesteVitezaEfectiva()
  simPauza = p
  // In pauza, previzualizarile scumpe ale lui S se refac o data: costul nu se mai vede (panoul, CG-2).
  if (p && stabOverlay.visible && previzInvechita(stabOverlay, world)) redeseneazaStabilitate(stabOverlay, world, DEFAULT_RULES)
}
/**
 * Viteza REALA, pe ferestre de 2 s: tickuri rulate pe secunda / `ticksPerSecond`. DESIGN §10: „3× e
 * best effort, cu indicator in UI" — cand un tick costa 2–3 ms si cadrele se lungesc, plafonul de
 * `MAX_TICKURI_PE_CADRU` arunca datoria, iar jucatorul trebuie sa vada ca 3× nu mai e 3×.
 */
let efTickuri = 0
let efMs = 0
let vitezaEfectiva = 0
/**
 * La pauza si la schimbarea vitezei fereastra incepe din nou: amestecand cadrele de pauza si pe cele
 * de la viteza veche, indicatorul spunea „≈0,4×" ~2 s dupa fiecare Spatiu, exact cand se uita
 * jucatorul (recenzia UI-ului, INT-8). 0 = inca nemasurata; UI-ul nu arata nimic atunci.
 */
function golesteVitezaEfectiva(): void {
  efTickuri = 0
  efMs = 0
  vitezaEfectiva = 0
}
function seteazaViteza(v: number): void {
  if (v !== viteza) golesteVitezaEfectiva()
  viteza = v
}
function noteazaTickuri(n: number, dtMs: number): void {
  efTickuri += n
  efMs += dtMs
  if (efMs < 2000) return
  vitezaEfectiva = efTickuri / (efMs / 1000) / DEFAULT_RULES.ticksPerSecond
  efTickuri = 0
  efMs = 0
}

/** Pionul urmarit de camera (id); `null` = nimeni. Orice tragere a camerei il opreste. */
let urmaritId: number | null = null
controls.addEventListener('start', () => { urmaritId = null })
const vUrm = new THREE.Vector3()
function urmareste(): void {
  if (urmaritId === null) return
  const slot = slotOf(world.agents, urmaritId)
  if (slot === -1) { urmaritId = null; return }
  for (let k = 0; k < agentLayer.vii; k++) {
    if (agentLayer.sloturi[k] !== slot) continue
    agentLayer.mesh.getMatrixAt(k, m4)
    vUrm.setFromMatrixPosition(m4)
    vUrm.y += 0.5
    vUrm.sub(controls.target).multiplyScalar(0.12)
    controls.target.add(vUrm)
    camera.position.add(vUrm)
    return
  }
}

/** Camera la celula (wx, wy, z), cu aceeasi distanta si acelasi unghi; nivelul, daca se cere sau daca lucrul e taiat. */
function duLa(wx: number, wy: number, z: number, slice: number | null): void {
  // „Du-mă la el", randul unui om, o alerta: camera merge unde s-a cerut. Cu un alt om urmarit,
  // urmarirea o tragea inapoi in 2 s, iar inspectorul arata pe altcineva (recenzia UI-ului, INT-5).
  urmaritId = null
  const d = new THREE.Vector3(wx + 0.5, z + 1, wy + 0.5).sub(controls.target)
  controls.target.add(d)
  camera.position.add(d)
  if (slice !== null) seteazaNivel(slice)
  else if (sliceLevel !== null && z + 1 > sliceLevel) seteazaNivel(z + 2)
  fantomaMurdara = true
}

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
      // Gazda (GATE.md §12, golul 3): Chrome curat sau Electron cu flagurile de
      // livrare. UA-ul e al browserului — nu se poate declara din URL. `hostFlags` e
      // doar ce SPUNE lansatorul ca a pus pe linia de comanda; Chrome nu declara nimic.
      userAgent: navigator.userAgent,
      hostFlags: params.get('flags') ?? 'nedeclarate',
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
  // Gazda in nume, ca doua rulari identice pe Chrome si pe Electron sa nu se
  // suprascrie si sa nu se confunde. Derivata din UA, nu din URL.
  const gazda = /Electron\//.test(navigator.userAgent) ? 'electron' : 'chrome'
  a.download = `gate-${gazda}-${result.meta.scenario}-${probe.count}cadre.json`
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
/** Cursor separat pentru incalzire: patratul ei e altul, deci si secventa. */
let digCursorIncalzire = 0

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
      // 18 m de LUME, ca inainte de plaja pe fereastra chunk-ului: protocolul de gate nu se schimba.
      sliceLevel = sliceLevel === null ? 18 : null
      applySlice()
    }
    return
  }

  if (SCENARIO === 'dig') {
    // Camera sta; se masoara bucla de constructie, nu cea de privit.
    if (frame % Math.round(60 / DIGS_PER_SECOND) !== 0) return

    // „20 de sapaturi/s" inseamna 20 EFECTUATE, nu 20 incercate. Fixtura si-a sapat
    // deja camerele, deci o pozitie din patru cade pe aer si comanda se refuza —
    // masurat, 415 din 1200. Numarate ca sapaturi, gate-ul facea 13,1/s si raporta
    // 20, adica masura cu o treime mai putina munca decat scrie in propriul tabel.
    // Se reincearca, marginit: o pozitie refuzata costa un `groundLevelM` si o
    // comanda respinsa, nu un remesh.
    //
    // Pozitiile vin din `src/harness/sdig.ts`, ca sa poata avea test — vezi acolo
    // ce mintea varianta care statea aici.
    // Multimea promovata se ia INAINTE de comanda, nu dupa. Varianta care o citea
    // DUPA `dig` punea in ea si chunk-urile tocmai promovate, deci
    // `!promotedBefore.has(key)` nu se declansa niciodata si apron-ul nou nu-si
    // primea primul mesh. Adica S-DIG — un scenariu de GATE — masura mai putina
    // munca decat face jocul.
    // Incalzirea sapa in ALT patrat — chiar asezarea, fara banda de frontiera — si cu
    // propriul cursor. Vezi `SDIG_SPAN_INCALZIRE`: altfel cele 4 valuri de 9 remesh-uri,
    // care cad la sapaturile 0..3, s-ar consuma inainte sa inceapa masuratoarea.
    const inIncalzire = frameIndex <= WARMUP_FRAMES
    let promotedBefore = new Set<number>()
    const facut = sapaturaUrmatoare(
      inIncalzire ? digCursorIncalzire : digCursor, FOCUS_CX, FOCUS_CY,
      (wx, wy) => { const g = groundLevelM(world.terrain, wx, wy); return g.ok ? g.value : null },
      (wx, wy, z) => {
        promotedBefore = promotedKeys()
        return applyCommand(world, { kind: 'dig', wx, wy, z }).ok
      },
      inIncalzire ? SDIG_SPAN_INCALZIRE : undefined,
      inIncalzire ? SDIG_OFFSET_INCALZIRE : undefined,
    )
    if (inIncalzire) digCursorIncalzire = facut ? facut.cursor : digCursorIncalzire + SDIG_MAX_INCERCARI
    else digCursor = facut ? facut.cursor : digCursor + SDIG_MAX_INCERCARI
    if (facut) remeshAfterEdit(facut.wx, facut.wy, promotedBefore)
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
    // In pauza (Spatiu) simularea nu avanseaza deloc: nicio comanda nu se pierde, doar nu se misca nimeni.
    if (!simPauza) {
      noteazaTickuri(stepSim(agentLayer, world, DEFAULT_RULES, dt * viteza, simTick), dt)
      remeshDinJurnal()
    }
    // Si in pauza: pornit cu `?pauza=1`, stratul pionilor n-ar fi fost desenat niciodata (HUD: „0").
    updateAgentLayer(agentLayer, world, DEFAULT_RULES)
    // Mormanele se schimba doar cand pionii sapa, cara sau zidesc: la 10 cadre ajunge (O(mormane)).
    if (stratResurse !== null && frameIndex % 10 === 0) actualizeazaStratResurse(stratResurse, world, DEFAULT_RULES.itemStackMax)
    if (jobOverlay.visible && frameIndex % 6 === 0) rebuildJobOverlay(jobOverlay, world)
    // Mult mai rar decat overlay-ul de joburi. Cererea nu reporneste trecerea din curs,
    // nici una terminata pe acelasi teren (vezi `ceFacCuTrecerea`): o celula ajunsa la
    // scanarea scumpa costa zeci de µs departe de grinzi, dar 4–20 ms langa ele.
    if (stabOverlay.visible && frameIndex % 30 === 0) refaStabilitate()
    // „PLANUL INCHIDE" pe pionii de acum: pungile planului raman, se intreaba din nou (O(1) pe celula).
    if (stabOverlay.visible && frameIndex % 30 === 15) actualizeazaInchise(stabOverlay, world)
    // Overlay-ul de regiuni (G) se reimprospateaza cand graful s-a schimbat —
    // sapaturile pionilor si acoperirea desemnarilor il schimba fara niciun click.
    if (regionOverlay.visible && world.regions.epoca !== epocaDesenata) refreshOverlay()
  }
  // Trecerea de stabilitate, feliata: cel mult bugetul pe cadru, si doar cu overlay-ul pornit.
  avanseazaStabilitate(stabOverlay, world, DEFAULT_RULES, BUGET_STABILITATE_MS, ui === null)
  // UI-ul de joc: nimic din asta nu exista intr-o rulare de gate (`ui === null`).
  if (ui !== null) {
    pasAplicare()
    if (fantomeMurdare) scrieFantomeDreptunghi()
    urmareste()
    ui.cadru(dt)
  }
  // Cursorul-fantoma: cel mult o raza pe cadru, si doar cand s-a schimbat ceva. Niciodata intr-o
  // rulare de gate — acolo nu misca nimeni mouse-ul, iar un draw call in plus ar fi drift de masura.
  if (fantomaMurdara && !gateRun) actualizeazaFantoma()
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
    el('agents').textContent = AGENTI_ACTIVI ? `${agentLayer.vii} · t${world.tick}${simPauza ? ' · PAUZA (Spatiu)' : ` · ${viteza}×${vitezaEfectiva > 0 && vitezaEfectiva < viteza * 0.9 ? ` (real ${vitezaEfectiva.toFixed(2)}×)` : ''}`}` : 'oprit la gate'
    el('piesa').textContent = ui?.numePiesa() ?? NUME_PIESA_VIEWER[piesaAleasa]!
    el('regions').textContent = regionOverlay.visible
      ? `${regionOverlay.cells.toLocaleString('ro-RO')} celule · ${regionOverlay.components} componente · ${lastOverlayMs.toFixed(0)} ms`
      : 'G'
    {
      const r = rezumatJoburi(world)
      const d = world.desemnari.vii
      const o = jobOverlay.visible ? ` · liber ${jobOverlay.desemnari - jobOverlay.rezervate - jobOverlay.faraLoc - jobOverlay.faraLocSigur - jobOverlay.inchide - jobOverlay.componente - jobOverlay.altRefuz} rez ${jobOverlay.rezervate} fara-loc ${jobOverlay.faraLoc} nesigur ${jobOverlay.faraLocSigur} ar-inchide ${jobOverlay.inchide} rupt ${jobOverlay.componente}` : ''
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
          : (stabOverlay.ultimaScanare === null ? ' · ultima-celula ? cade ?' : ` · ultima-celula ${stabOverlay.ultima} cade ${stabOverlay.cade}`) +
            (stabOverlay.previzualizate > 0 ? ` · desemnarile ar prabusi ${stabOverlay.previzualizate}` : '') +
            (stabOverlay.imposibile > 0 ? ` · ${stabOverlay.imposibile} piese NU se pot zidi` : '') +
            (stabOverlay.faraAcces > 0 ? ` · ${stabOverlay.faraAcces} fara acces (${stabOverlay.faraAccesInaltime} scara, ${stabOverlay.faraAcces - stabOverlay.faraAccesInaltime} usa)` : '') +
            (stabOverlay.inchise !== '' ? ` · PLANUL INCHIDE ${stabOverlay.inchise}` : '') +
            (progresStabilitate(stabOverlay) !== null ? ` · scanare ${Math.floor(100 * progresStabilitate(stabOverlay)!)}%` : '')
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
el('spot').textContent = `chunk ${FOCUS_CX}/${FOCUS_CY} · seed ${SEED}` + (mesajPornire.length > 0 ? ` · ${mesajPornire.join(' · ')}` : '')
busy.remove()
hud.removeAttribute('hidden')

// --------------------------------------------------------------------------
// 6. UI-ul de joc — doar in afara rularilor de gate, si doar prin import dinamic
// --------------------------------------------------------------------------

/** Plicul unei salvari: lumea (`encode`) si ce e al viewer-ului. Intoarce si cat a costat `encode`. */
function plicSalvare(id: string, nume: string, primiPasi: readonly boolean[]): { s: Salvare; ms: number } {
  let oameni = 0
  for (let i = 0; i < world.agents.count; i++) if (world.agents.alive[i] === 1 && world.agents.faction[i] === Faction.ASEZARE) oameni++
  const t0 = performance.now()
  const lume = encode(world)
  const ms = performance.now() - t0
  return {
    ms,
    s: {
      format: FORMAT_SALVARE, id, nume, salvatLa: new Date().toISOString(), tick: world.tick, seed: world.seed, oameni,
      meta: {
        camera: { pos: [camera.position.x, camera.position.y, camera.position.z], tinta: [controls.target.x, controls.target.y, controls.target.z] },
        slice: sliceLevel, viteza, primiPasi: [...primiPasi],
      },
      lume,
    },
  }
}

/** Tickul ultimei salvari (manuale sau automate) a lumii de acum: dupa el, plecarea cere confirmare. */
let tickUltimaSalvare = world.tick
let plecareAprobata = false
if (MOD_JOC === 'joc-nou' || MOD_JOC === 'incarca') {
  // Inapoi, butonul lateral al mouse-ului, F5, inchiderea tabului: fara asta jocul pleca fara nicio
  // intrebare, cu tot ce era dupa ultima salvare automata (recenzia UI-ului, INT-6).
  window.addEventListener('beforeunload', (ev) => {
    if (plecareAprobata || world.tick === tickUltimaSalvare) return
    ev.preventDefault()
    ev.returnValue = ''
  })
}

/** O alta lume inseamna alta pagina: lumea se construieste o singura data pe pagina, ca inainte. */
function navigheaza(cautare: string): void {
  if ((MOD_JOC === 'joc-nou' || MOD_JOC === 'incarca') && world.tick !== tickUltimaSalvare
    && !window.confirm('Jocul de acum se închide. Ce n-ai salvat se pierde (salvarea automată e la cel mult câteva minute în urmă). Continui?')) return
  // Confirmat aici: `beforeunload` nu mai intreaba o data.
  plecareAprobata = true
  location.search = cautare
}

function cifreOverlay(o: 'J' | 'S' | 'G'): string {
  if (o === 'G') return regionOverlay.visible ? `${regionOverlay.components} componente · ${regionOverlay.cells.toLocaleString('ro-RO')} celule` : ''
  if (o === 'J') {
    const j = jobOverlay
    if (!j.visible) return ''
    const liber = j.desemnari - j.rezervate - j.faraLoc - j.faraLocSigur - j.inchide - j.componente - j.altRefuz
    const bucati = [`${j.desemnari} lucrări: ${j.rezervate} în lucru, ${liber} libere`]
    const blocate = j.faraLoc + j.faraLocSigur + j.inchide + j.componente + j.altRefuz
    if (blocate > 0) bucati.push(`${blocate} blocate`)
    bucati.push(`${j.iteme} mormane${j.itemeFaraDepozit > 0 ? ` (${j.itemeFaraDepozit} fără depozit)` : ''}`)
    if (j.celuleDepozit > 0) bucati.push(`depozit ${j.celuleOcupate}/${j.celuleDepozit}`)
    return bucati.join(' · ')
  }
  const st = stabOverlay
  if (!st.visible) return ''
  if (st.piedica !== '') return ''
  const bucati: string[] = []
  if (st.ultimaScanare !== null) bucati.push(`ultima celulă ${st.ultima} · cade ${st.cade}`)
  if (st.previzualizate > 0) bucati.push(`lucrările ar prăbuși ${st.previzualizate}`)
  if (st.imposibile > 0) bucati.push(`${st.imposibile} piese n-ar sta`)
  if (st.faraAcces > 0) bucati.push(`${st.faraAcces} fără acces (${st.faraAccesInaltime} scară, ${st.faraAcces - st.faraAccesInaltime} deschidere)`)
  if (st.inchise !== '') bucati.push(`PLANUL ÎNCHIDE ${st.inchise}`)
  const pr = progresStabilitate(st)
  if (pr !== null) bucati.push(`scanare ${Math.floor(100 * pr)}%`)
  return bucati.join(' · ')
}

if (!MOD.faraUI && MOD_JOC !== 'gate') {
  const modUI = MOD_JOC
  const { monteazaUI } = await import('./ui/panouri.ts')
  const ctx: ContextUI = {
    world,
    rules: DEFAULT_RULES,
    mod: modUI,
    mesajPornire: mesajPornireUI,
    primiPasi: salvareIncarcata?.meta.primiPasi ?? null,
    pauza: () => simPauza,
    seteazaPauza,
    viteza: () => viteza,
    seteazaViteza,
    vitezaEfectiva: () => (simPauza ? 0 : vitezaEfectiva),
    aplica: (cmds) => {
      const refuzuri: string[] = []
      let aplicate = 0
      for (const c of cmds) {
        const out = applyCommand(world, c)
        if (out.ok) { aplicate++; continue }
        refuzuri.push(textMotiv('comanda', out.reason, 0, out.params, cifre).titlu)
        el('spot').textContent = `refuzat: ${describe(out)}`
      }
      dupaComenzi(cmds)
      if (refuzuri.length > 0) ui?.toast(refuzuri[0]!, true)
      return { aplicate, refuzuri }
    },
    nivel: () => {
      const { lo, hi } = plajaSlice()
      const g = groundLevelM(world.terrain, Math.floor(controls.target.x), Math.floor(controls.target.z))
      return { cota: sliceLevel, lo, hi, sol: g.ok ? g.value : null }
    },
    seteazaNivel,
    overlayPornit: (o) => (o === 'J' ? jobOverlay.visible : o === 'S' ? stabOverlay.visible : regionOverlay.visible),
    comutaOverlay: (o) => { if (o === 'J') comutaJ(); else if (o === 'S') comutaS(); else comutaG() },
    cifreOverlay,
    stabilitateInvechita: () => previzInvechita(stabOverlay, world),
    refaStabilitatea: () => redeseneazaStabilitate(stabOverlay, world, DEFAULT_RULES),
    duLa,
    urmareste: (id) => { urmaritId = id },
    distantaLaCamera: (wx, wy, z) => Math.hypot(wx + 0.5 - controls.target.x, z - controls.target.y, wy + 0.5 - controls.target.z),
    comutaDiagnostic: () => { hud.hidden = !hud.hidden },
    tragere: () => tragere !== null || aplicare !== null,
    salveaza: async (id, nume, primiPasi) => {
      const { s, ms } = plicSalvare(id, nume, primiPasi)
      await scrieSalvare(s)
      tickUltimaSalvare = s.tick
      el('spot').textContent = `salvat „${nume}" · encode ${ms.toFixed(1)} ms · ${(s.lume.length / 1024).toFixed(0)} KiB`
      return ms
    },
    descarca: (primiPasi) => {
      const { s } = plicSalvare(`fisier-${world.tick}`, `Kinstead · lumea ${world.seed}`, primiPasi)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify(s)], { type: 'application/json' }))
      a.download = numeFisier(s, DEFAULT_RULES.ticksPerSecond)
      a.click()
      URL.revokeObjectURL(a.href)
    },
    listaSalvari,
    incarca: (id) => navigheaza(`?incarca=${encodeURIComponent(id)}`),
    stergeSalvarea: stergeSalvare,
    incarcaFisier: async (f) => {
      let x: unknown
      try { x = JSON.parse(await f.text()) } catch { return 'Fișierul nu e o salvare Kinstead.' }
      const v = valideazaSalvare(x)
      if (!v.ok) return v.motiv
      const d = decode(v.value.lume, DEFAULT_RULES)
      if (!d.ok) return textMotiv('incarcare', d.reason, 0, d.params).titlu
      const id = `f${Date.now().toString(36)}`
      await scrieSalvare({ ...v.value, id, nume: `${v.value.nume} (din fișier)` })
      navigheaza(`?incarca=${id}`)
      return null
    },
    jocNou: (q) => navigheaza(`?joc=nou&seed=${q.seed}&oameni=${q.oameni}&piatra=${q.piatra}&hrana=${q.hrana}`),
  }
  ui = monteazaUI(ctx)
  if (modUI !== 'verificare') {
    // In joc, Diagnosticul si ajutorul vechi pornesc ascunse (F3; Ajutorul UI-ului pe F1 / H), iar
    // Planul (J) aprins: fara el, ce desenezi nu se vede (panoul, JN-3). In verificare, ca azi.
    hud.hidden = true
    el('keys').hidden = true
    if (!jobOverlay.visible) comutaJ()
  }
  butoaneCamera(null)
  el('piesa').textContent = ui.numePiesa()
  if (salvareIncarcata !== null) ui.toast(`Încărcat: ${salvareIncarcata.nume}. Jocul e în pauză — Spațiu pornește.`)
}

requestAnimationFrame(tick)

// Expus pentru masuratori din consola, nu pentru joc.
Object.assign(globalThis, { __kinstead: { world, renderer, scene, camera, controls, frames, probe, bisector, ballast, stepFrame, meshes, densePanel, densePanelReport, fantoma, jobOverlay, stabOverlay, ui, mod: MOD_JOC, agentLayer, tintaLa, suprafata, stratResurse, stare: () => ({ viteza, pauza: simPauza }) } })
