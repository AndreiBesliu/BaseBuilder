/**
 * Stratul de comenzi.
 *
 * NIMIC din afara simularii nu are voie sa scrie direct in `World`. Orice
 * schimbare intra printr-o comanda, iar comenzile se pot inregistra intr-un log.
 * Din asta ies gratuit trei lucruri care nu se adauga retroactiv:
 *   - replay determinist din save-urile jucatorilor (raportezi un bug, trimit logul)
 *   - undo
 *   - un drum spre co-op, daca vreodata se deschide subiectul
 *
 * Auditul unui prototip anterior a gasit exact golul asta: UI-ul muta starea
 * direct, deci nu exista replay, nu exista undo, si nu exista drum spre multiplayer.
 */

import type { Outcome } from './result.ts'
import { accept, refuse, Reason } from './result.ts'
import type { World, FactionId } from './state.ts'
import { slotOf } from './state.ts'
import { cellOf, clearPath } from './agents.ts'
import type { Rules } from './content.ts'
import { DEFAULT_RULES } from './content.ts'
import { markDirty } from './regions.ts'
import type { MaterialId } from './terrain/chunk.ts'
import { CHUNK_GRID, dig, fill, inWorld, setFocus } from './terrain/terrain.ts'

export type Command =
  | { readonly kind: 'spawnAgent'; readonly x: number; readonly y: number; readonly z: number; readonly faction: FactionId }
  | { readonly kind: 'moveAgent'; readonly id: number; readonly dx: number; readonly dy: number }
  | { readonly kind: 'killAgent'; readonly id: number }
  /** Muta centrul discului de chunk-uri rezidente. Coordonate in chunk-uri. */
  | { readonly kind: 'setFocus'; readonly cx: number; readonly cy: number }
  /** Sapa un voxel. Promoveaza chunk-ul si apron-ul lui daca e nevoie. */
  | { readonly kind: 'dig'; readonly wx: number; readonly wy: number; readonly z: number }
  /** Umple un voxel gol. */
  | { readonly kind: 'fill'; readonly wx: number; readonly wy: number; readonly z: number; readonly material: MaterialId }

/** O comanda, plus tickul la care a fost emisa. Asta e unitatea de replay. */
export interface LoggedCommand {
  readonly tick: number
  readonly cmd: Command
}

/**
 * Singura poarta prin care se schimba lumea.
 *
 * `rules` are implicit, ca `tick`. Nu e decor: `markDirty` are nevoie de
 * `agentHeadroomM` si `maxStepM` ca sa stie cate niveluri atinge o editare, iar
 * alea sunt continut, nu constante.
 */
export function applyCommand(w: World, cmd: Command, rules: Rules = DEFAULT_RULES): Outcome<number> {
  switch (cmd.kind) {
    case 'spawnAgent': {
      const a = w.agents
      if (cmd.x < 0 || cmd.y < 0 || cmd.x >= w.bounds.w || cmd.y >= w.bounds.h) {
        return refuse(Reason.IN_AFARA_LUMII, { x: cmd.x, y: cmd.y, latime: w.bounds.w, inaltime: w.bounds.h })
      }
      let slot = -1
      for (let i = 0; i < a.count; i++) {
        if (a.alive[i] === 0) {
          slot = i
          break
        }
      }
      if (slot === -1) {
        if (a.count >= a.capacity) {
          return refuse(Reason.CAPACITATE_DEPASITA, { capacitate: a.capacity })
        }
        slot = a.count
        a.count++
      }
      const id = w.nextId++
      a.id[slot] = id
      a.x[slot] = cmd.x
      a.y[slot] = cmd.y
      a.z[slot] = cmd.z
      a.faction[slot] = cmd.faction
      a.alive[slot] = 1
      // Slotul se REUTILIZEAZA, deci tot ce tine de agentul dinainte se sterge
      // explicit. Fara asta, un agent nou se nastea cu tinta mortului si pornea
      // spre ea — un defect care nu se vede in nicio rulare scurta, fiindca cere
      // ca un slot sa fi murit intai.
      a.goalX[slot] = 0
      a.goalY[slot] = 0
      a.goalZ[slot] = 0
      a.hasGoal[slot] = 0
      a.progresMm[slot] = 0
      clearPath(w.paths, slot)
      // Si racirea. Fara asta, un slot reutilizat mostenea racirea mortului si
      // agentul nou statea degeaba pana la un tick pe care nu l-a trait nimeni.
      w.paths.nextReplanTick[slot] = 0
      return accept(id)
    }

    case 'moveAgent': {
      const a = w.agents
      const slot = slotOf(a, cmd.id)
      if (slot === -1) return refuse(Reason.ENTITATE_INEXISTENTA, { id: cmd.id })
      const nx = a.x[slot]! + cmd.dx
      const ny = a.y[slot]! + cmd.dy
      if (nx < 0 || ny < 0 || nx >= w.bounds.w || ny >= w.bounds.h) {
        return refuse(Reason.IN_AFARA_LUMII, { x: nx, y: ny, latime: w.bounds.w, inaltime: w.bounds.h })
      }
      a.x[slot] = nx
      a.y[slot] = ny
      return accept(cmd.id)
    }

    case 'killAgent': {
      const a = w.agents
      const slot = slotOf(a, cmd.id)
      if (slot === -1) return refuse(Reason.ENTITATE_INEXISTENTA, { id: cmd.id })
      a.alive[slot] = 0
      return accept(cmd.id)
    }

    case 'setFocus': {
      if (!inWorld(cmd.cx, cmd.cy)) {
        return refuse(Reason.IN_AFARA_LUMII, { cx: cmd.cx, cy: cmd.cy, limita: CHUNK_GRID })
      }
      setFocus(w.terrain, cmd.cx, cmd.cy)
      return accept(0)
    }

    // Sapatul si ziditul MURDARESC graful de regiuni.
    //
    // Pana acum nu o faceau, si nimeni n-a observat: `markDirty` exista, era bine
    // scris, si nu era chemat niciodata pe `w.regions`. Singurul apel din tot
    // proiectul era in viewer, pe un AL DOILEA store, folosit doar de overlay si
    // doar cand overlay-ul era vizibil. Consecinta: graful pe care merg agentii
    // nu afla NICIODATA de sapaturile jucatorului. O camera sapata ramanea
    // `NO_REGION` pe veci, deci nimeni nu tintea in ea; un zid zidit ramanea
    // marcat ca regiune valida, deci `findPath` pornea A*-uri pe promisiuni false
    // — exact „FPS-ul scade cand construiesti un zid", pe care stratul de regiuni
    // exista ca sa-l previna.
    case 'dig': {
      const out = dig(w.terrain, cmd.wx, cmd.wy, cmd.z)
      if (!out.ok) return out
      markDirty(w.regions, cmd.wx, cmd.wy, cmd.z, rules)
      return accept(0)
    }

    case 'fill': {
      // Nu se zideste peste un om.
      //
      // Alternativa e sa-l ingropi: agentul ramane intr-o celula devenita solida,
      // poarta din `stepAgents` nu-l mai scoate, iar singurul semnal pe care il
      // produce e `INACCESIBIL` — un motiv care MINTE, fiindca problema nu e ca
      // nu exista drum, ci ca pionul e in piatra. Un refuz explicit e si corect,
      // si lizibil pentru jucator.
      const a = w.agents
      for (let i = 0; i < a.count; i++) {
        if (a.alive[i] === 0) continue
        if (a.z[i] !== cmd.z) continue
        if (cellOf(a.x[i]!) !== cmd.wx || cellOf(a.y[i]!) !== cmd.wy) continue
        return refuse(Reason.CELULA_OCUPATA, { id: a.id[i], wx: cmd.wx, wy: cmd.wy, z: cmd.z })
      }
      const out = fill(w.terrain, cmd.wx, cmd.wy, cmd.z, cmd.material)
      if (!out.ok) return out
      markDirty(w.regions, cmd.wx, cmd.wy, cmd.z, rules)
      return accept(0)
    }

    default: {
      // Exhaustivitate verificata de compilator: daca adaugi un kind si uiti un case,
      // atribuirea de mai jos nu compileaza.
      const never: never = cmd
      void never
      return refuse(Reason.COMANDA_NECUNOSCUTA, { kind: String((cmd as { kind: string }).kind) })
    }
  }
}
