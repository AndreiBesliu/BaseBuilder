/**
 * Agentii, pe ecran.
 *
 * Pana acum viewerul avea o lume, dar nu ii dadea niciodata `tick`: importa
 * `createWorld` si atat. Sapaturile si zidirile se vedeau fiindca sunt comenzi,
 * nu simulare. Oamenii nu s-au miscat niciodata.
 *
 * ## De ce interpoleaza randarea, si nu simularea
 *
 * Simularea muta agentii din centru in centru, DINTR-O DATA. Nu e o comoditate,
 * e consecinta unui defect: cat timp pozitia aluneca in milimetri intre doua
 * celule, `cellOf(x)` trece granita cu un tick inaintea lui `z`, iar pe o panta
 * tickul ala pune agentul in celula noua la cota veche — adica in piatra. Detalii
 * in `avanseaza`.
 *
 * Deci simularea e discreta si are dreptate sa fie. Netezimea se face AICI, din
 * doua informatii pe care le are deja: `progresMm`, cat a mers spre celula
 * urmatoare, si drumul, care spune care e celula aia. Plus fractiunea de tick
 * scursa, ca miscarea sa fie neteda si intre doua tickuri de 20 Hz, nu in trepte
 * de 50 ms.
 *
 * ## De ce NU ruleaza in scenariile de gate
 *
 * Gate-ul de motor masoara cadre, iar protocolul lui e pre-inregistrat. Daca as
 * adauga un tick de simulare in bucla masurata, as schimba tacit ce masoara — si
 * exact asta e felul de drift impotriva caruia exista `bench/GATE.md` si
 * `tools/check-gate-numbers.mjs`. Agentii merg numai in modul de privit liber.
 */

import * as THREE from 'three'
import type { Rules } from '../src/sim/content.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { cellOf } from '../src/sim/agents.ts'
import { Faction, FelJob, MM_PER_CELL, pasDeMers } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'
import { groundLevelM, materialAt } from '../src/sim/terrain/terrain.ts'

/** Pasi de simulare pe secunda. `ticksPerSecond` din content e sursa. */
function pasMs(rules: Rules): number {
  return 1000 / rules.ticksPerSecond
}

/**
 * Cate tickuri se recupereaza cel mult intr-un cadru.
 *
 * Fara plafon, o fereastra minimizata sau un breakpoint ar aduna secunde de
 * datorie si le-ar plati toate deodata la revenire — o inghetare lunga, exact
 * cand omul se uita din nou. Datoria peste plafon se ARUNCA: simularea ramane in
 * urma, ceea ce e vizibil si onest, in loc sa blocheze cadrul.
 */
const MAX_TICKURI_PE_CADRU = 5

export interface AgentLayer {
  readonly mesh: THREE.InstancedMesh
  /** Milisecunde nescurse din tickul curent. Pentru interpolare. */
  rest: number
  vii: number
}

export function createAgentLayer(scene: THREE.Scene, capacity: number): AgentLayer {
  // O capsula: ceva ce se citeste ca „om" la distanta de camera, fara model.
  const geo = new THREE.CapsuleGeometry(0.22, 0.9, 4, 8)
  // Originea capsulei e in centrul ei; o ridic ca talpa sa fie la y = 0, adica
  // pe podeaua celulei, nu infipta pana la jumatate in ea.
  geo.translate(0, 0.67, 0)
  // FARA `vertexColors`: in three 0.186 culoarea per-instanta vine din
  // `instanceColor`, iar `vertexColors: true` pune materialul sa caute un atribut
  // de culoare pe GEOMETRIE. Capsula nu are asa ceva, deci iesea negru — se vedea
  // ca niste lespezi intunecate pe iarba, nu ca oameni.
  const mat = new THREE.MeshLambertMaterial()
  const mesh = new THREE.InstancedMesh(geo, mat, capacity)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.count = 0
  mesh.frustumCulled = false
  scene.add(mesh)
  return { mesh, rest: 0, vii: 0 }
}

/**
 * Naste agenti pe sol, in jurul unui punct.
 *
 * „Pe sol" e explicit fiindca a fost defect: scenariul standard ii nastea la
 * z = 0, iar solul de sub ei era la -70 m. Un agent in aer nu ajunge in nicio
 * regiune, deci nu merge nicaieri — si costa o reconstructie de regiuni la
 * fiecare tick, la nesfarsit.
 */
export function spawnNear(world: World, wx: number, wy: number, raza: number, cati: number): number {
  let pusi = 0
  // Spirala patrata in jurul punctului: determinista si fara zar.
  for (let r = 0; r <= raza && pusi < cati; r++) {
    for (let d = -r; d <= r && pusi < cati; d++) {
      for (const [cx, cy] of [[wx + d, wy - r], [wx + d, wy + r], [wx - r, wy + d], [wx + r, wy + d]] as const) {
        if (pusi >= cati) break
        const g = groundLevelM(world.terrain, cx, cy)
        if (!g.ok) continue
        const sus = materialAt(world.terrain, cx, cy, g.value)
        if (!sus.ok || !isSolid(sus.value)) continue
        const out = applyCommand(world, {
          kind: 'spawnAgent',
          x: cx * MM_PER_CELL + MM_PER_CELL / 2,
          y: cy * MM_PER_CELL + MM_PER_CELL / 2,
          z: g.value + 1,
          faction: pusi % 6 === 0 ? Faction.JEFUITOR : Faction.ASEZARE,
        })
        if (out.ok) pusi++
      }
    }
  }
  return pusi
}

/** Avanseaza simularea cu pas FIX, indiferent de cadru. Intoarce cate tickuri au rulat. */
export function stepSim(
  layer: AgentLayer,
  world: World,
  rules: Rules,
  dtMs: number,
  simTick: (w: World, r: Rules) => void,
): number {
  const pas = pasMs(rules)
  layer.rest += dtMs
  let rulate = 0
  while (layer.rest >= pas && rulate < MAX_TICKURI_PE_CADRU) {
    simTick(world, rules)
    layer.rest -= pas
    rulate++
  }
  if (layer.rest >= pas) layer.rest = 0 // datoria peste plafon se arunca
  return rulate
}

// Trei culori pentru ai nostri, dupa STARE, nu doar dupa factiune: un pion care
// merge 90 de celule la lucru si unul care se plimba la intamplare aratau la fel,
// iar research-ul e explicit — „lipsa unei stari Idle vizibile: jucatorul
// presupune bug".
const culoareAsezare = new THREE.Color(0xd9c9a3)
const culoareMerge = new THREE.Color(0x8fb5cc)
const culoareLucreaza = new THREE.Color(0x8fbf6f)
// Si una pentru cine CARA ceva: marfa in mana e o stare pe care jucatorul trebuie s-o citeasca de la distanta.
const culoareCara = new THREE.Color(0xd08a5a)
const culoareJefuitor = new THREE.Color(0xb1553f)
// Mesele si somnul dureaza minute, nu secunde: se vad, deci au nevoie de culoare.
const culoareMananca = new THREE.Color(0xe8c24a)
const culoareDoarme = new THREE.Color(0x6f5fb0)
const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const unu = new THREE.Vector3(1, 1, 1)
const pozitie = new THREE.Vector3()

/**
 * Aseaza instantele. Se cheama la fiecare CADRU, nu la fiecare tick.
 *
 * Coordonate: lumea are x spre est, y spre sud si z in sus; scena are z acolo
 * unde lumea are y. Celula (cx, cy) ocupa patratul [cx, cx+1] x [cy, cy+1], deci
 * centrul ei e la +0,5, iar podeaua nivelului z e chiar la y = z.
 */
export function updateAgentLayer(layer: AgentLayer, world: World, rules: Rules): void {
  const a = world.agents
  const p = world.paths
  const mesh = layer.mesh
  // Fractiunea de tick scursa, ca miscarea sa fie neteda si intre doua tickuri.
  const alpha = Math.min(1, layer.rest / pasMs(rules))

  let n = 0
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 0) continue

    const cx = cellOf(a.x[i]!)
    const cy = cellOf(a.y[i]!)
    let fx = cx + 0.5
    let fy = cy + 0.5
    let fz = a.z[i]!

    // Daca are drum, se interpoleaza spre celula urmatoare. `progresMm` spune cat
    // a mers deja; `alpha` adauga cat s-a scurs din tickul care inca nu s-a dat.
    if (p.len[i]! > 0 && p.cursor[i]! < p.len[i]!) {
      const baza = i * p.maxCells * 3 + p.cursor[i]! * 3
      const t = Math.min(1, (a.progresMm[i]! + alpha * rules.agentStepMm) / MM_PER_CELL)
      fx += (p.cells[baza]! + 0.5 - fx) * t
      fy += (p.cells[baza + 1]! + 0.5 - fy) * t
      fz += (p.cells[baza + 2]! - fz) * t
    }

    pozitie.set(fx, fz, fy)
    m.compose(pozitie, q, unu)
    mesh.setMatrixAt(n, m)
    const culoare = a.faction[i] === Faction.JEFUITOR ? culoareJefuitor
      : a.jobKind[i] === FelJob.MANANCA ? culoareMananca
      : a.jobKind[i] === FelJob.DOARME ? culoareDoarme
      : a.caraCantitate[i]! > 0 ? culoareCara
      : a.jobKind[i] === 0 ? culoareAsezare
      : !pasDeMers(a.jobStep[i]!) ? culoareLucreaza
      : culoareMerge
    mesh.setColorAt(n, culoare)
    n++
  }

  mesh.count = n
  layer.vii = n
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
