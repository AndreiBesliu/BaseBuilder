/**
 * Scena S+ a salvării temperaturii (S24-27 t.2b §7, panoul SAV-5): literalul dedicat și M5-faze stau pe ea.
 *
 * Pe un sit plat, peste o graniță de bloc (16 m) și ASIMETRICĂ (simetria ar masca permutările de sloturi):
 * - casa A (interior 4×3×2) și casa B (interior 3×3×2), cu un perete comun; un pion închis în B (căldura umană);
 * - ușa dintre A și B săpată și zidită la loc prin COMENZI (unirea și despărțirea: id-urile ies altfel după decode);
 * - o pivniță săpată de la zero prin comenzi, sub A (sursele SOL);
 * - un lot DOAR-FEȚE care schimbă C': podeaua pivniței (sol masiv, d 4) săpată și zidită la loc cu PIATRA în același lot —
 *   la nivelul ei nu e aer acoperit, deci nicio felie nu se reface, iar masa feței trece din sol în construcție (epoca pe
 *   loc). Varianta designului, `fill` pe apa de sub o podea, cere apă naturală (terenul nu umple cu APA): o face M5-fețe,
 *   pe iazul de la seed 4242;
 * - un șopron acoperit, cu laturile deschise (o componentă deschisă la final; acoperișul pus dintr-un lot: sursa CER).
 */

import assert from 'node:assert/strict'
import type { Command } from '../src/sim/commands.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { Faction } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill } from '../src/sim/terrain/terrain.ts'
import { sincronizeazaLumea } from '../src/sim/temperatura.ts'
import { tick } from '../src/sim/world.ts'
import { R, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

export interface ScenaSPlus {
  readonly w: World
  /** Colțul casei A, cota solului, granița de bloc. */
  readonly ax: number
  readonly ay: number
  readonly g: number
  readonly bx: number
  /** Celule de referință (x, y, z): A, B, pivnița, șopronul. */
  readonly rep: Readonly<Record<'A' | 'B' | 'pivnita' | 'sopron', readonly [number, number, number]>>
}

/** O comandă, reîncercată la tickul următor dacă e refuzată (un pion în celula de zidit); altfel testul pică. */
export function comanda(w: World, cmd: Command, maxTickuri = 200): void {
  for (let i = 0; i <= maxTickuri; i++) {
    const o = applyCommand(w, cmd, R)
    if (o.ok) return
    tick(w, R)
  }
  assert.fail(`comanda ${cmd.kind} refuzata ${maxTickuri} de tickuri`)
}

/** Avansează lumea cu tickuri până la `pana` (exclusiv). */
export function panaLa(w: World, pana: number): void {
  while (w.tick < pana) tick(w, R)
}

/** Construcția scenei, cu timpii ei: totul până la tickul 1.600; M5 și literalul rulează de acolo. */
export function scenaSPlus(): ScenaSPlus {
  const { w, wx, wy, g } = sitPlat(12345, 32)
  const t = w.terrain
  const bx = Math.ceil((wx + 6) / 16) * 16
  const ax = bx - 3
  const ay = wy + 3
  assert.ok(ax >= wx + 1 && ax + 16 <= wx + 32, 'fixtura: scena incape pe situl plat')
  // Casele A (x ax..ax+5) și B (x ax+5..ax+9), y ay..ay+4, pereții z g+1..g+2, acoperișul g+3.
  for (let z = g + 1; z <= g + 2; z++) for (let x = ax; x <= ax + 9; x++) for (let y = ay; y <= ay + 4; y++) {
    if (x === ax || x === ax + 5 || x === ax + 9 || y === ay || y === ay + 4) assert.ok(fill(t, x, y, z, P).ok)
  }
  for (let x = ax; x <= ax + 9; x++) for (let y = ay; y <= ay + 4; y++) assert.ok(fill(t, x, y, g + 3, P).ok)
  assert.ok(sincronizeazaLumea(w, R).ok)
  // Pionul, închis în B.
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (ax + 6) * 1000 + 500, y: (ay + 2) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
  // Ușa dintre A și B, deschisă și zidită la loc (USA) prin comenzi.
  panaLa(w, 100)
  comanda(w, { kind: 'dig', wx: ax + 5, wy: ay + 2, z: g + 1 })
  panaLa(w, 300)
  comanda(w, { kind: 'fill', wx: ax + 5, wy: ay + 2, z: g + 1, material: P })
  // Pivnița sub A: puțul prin podea (g, g − 1), apoi 3×3×2 la g − 3..g − 2, o celulă la 20 de tickuri.
  panaLa(w, 500)
  const celule: [number, number, number][] = [[ax + 1, ay + 2, g], [ax + 1, ay + 2, g - 1]]
  for (const z of [g - 2, g - 3]) for (let x = ax + 1; x <= ax + 3; x++) for (let y = ay + 1; y <= ay + 3; y++) celule.push([x, y, z])
  for (const [x, y, z] of celule) {
    comanda(w, { kind: 'dig', wx: x, wy: y, z })
    panaLa(w, w.tick + 20)
  }
  // Lotul doar-fețe: podeaua pivniței săpată și zidită la loc cu PIATRA în ACELAȘI lot (editările unui tick).
  panaLa(w, 1000)
  assert.ok(dig(t, ax + 2, ay + 2, g - 4).ok)
  assert.ok(fill(t, ax + 2, ay + 2, g - 4, P).ok)
  tick(w, R)
  // Șopronul: patru stâlpi și un acoperiș 3×3 dintr-un lot.
  panaLa(w, 1400)
  const sx = ax + 12
  for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]] as const) for (const z of [g + 1, g + 2]) assert.ok(fill(t, sx + dx, ay + 1 + dy, z, P).ok)
  for (let dx = 0; dx <= 2; dx++) for (let dy = 0; dy <= 2; dy++) assert.ok(fill(t, sx + dx, ay + 1 + dy, g + 3, P).ok)
  tick(w, R)
  panaLa(w, 1600)
  return { w, ax, ay, g, bx, rep: { A: [ax + 2, ay + 2, g + 1], B: [ax + 7, ay + 2, g + 1], pivnita: [ax + 2, ay + 2, g - 3], sopron: [sx + 1, ay + 2, g + 1] } }
}
