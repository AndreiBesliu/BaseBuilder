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

export type Command =
  | { readonly kind: 'spawnAgent'; readonly x: number; readonly y: number; readonly z: number; readonly faction: FactionId }
  | { readonly kind: 'moveAgent'; readonly id: number; readonly dx: number; readonly dy: number }
  | { readonly kind: 'killAgent'; readonly id: number }

/** O comanda, plus tickul la care a fost emisa. Asta e unitatea de replay. */
export interface LoggedCommand {
  readonly tick: number
  readonly cmd: Command
}

export function applyCommand(w: World, cmd: Command): Outcome<number> {
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

    default: {
      // Exhaustivitate verificata de compilator: daca adaugi un kind si uiti un case,
      // atribuirea de mai jos nu compileaza.
      const never: never = cmd
      void never
      return refuse(Reason.COMANDA_NECUNOSCUTA, { kind: String((cmd as { kind: string }).kind) })
    }
  }
}
