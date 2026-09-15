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
import { CATEGORII, slotOf } from './state.ts'
import { cellOf, clearPath } from './drumuri.ts'
import type { Rules } from './content.ts'
import { DEFAULT_RULES } from './content.ts'
import { isWalkable, markDirty } from './regions.ts'
import { isSolid, type MaterialId } from './terrain/chunk.ts'
import { CHUNK_GRID, fill, inWorld, materialAt, setFocus, voxelRangeM, WORLD_CELLS } from './terrain/terrain.ts'
import { adaugaDesemnare, Desemnare, slotDesemnare } from './desemnari.ts'
import { acoperaDesemnarea, anuleazaDesemnare, sapaManual, Sfarsit, terminaJob, uitaTintele } from './joburi.ts'

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
  /** Cere sa se sape un voxel. Un pion liber va veni sa-l sape. `prioritate` lipsa = implicitul din content. */
  | { readonly kind: 'desemneaza'; readonly wx: number; readonly wy: number; readonly z: number; readonly prioritate?: number | undefined }
  /** Retrage o desemnare. Cine lucra la ea e intrerupt. */
  | { readonly kind: 'anuleazaDesemnarea'; readonly id: number }
  /** Prioritatea personala a unui pion pe o categorie: 0 = niciodata. */
  | { readonly kind: 'setPrioritatePersonala'; readonly id: number; readonly categorie: number; readonly nivel: number }

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
      // Si ca se poate STA acolo.
      //
      // Pana acum singura validare era cutia lumii. Un agent asezat in piatra sau
      // in aer nu ajunge niciodata intr-o regiune, deci e oprit pe viata de poarta
      // din `stepAgents` — inert, si tacut. Costul real nu e agentul pierdut, ci
      // ca fixturile de test se umplu cu el fara sa se vada: in testul D7c, 15 din
      // 40 de agenti cadeau pe celule necalcabile si stateau nemiscati toate cele
      // 20.000 de tickuri, iar testul trecea.
      {
        const cx = cellOf(cmd.x)
        const cy = cellOf(cmd.y)
        if (!isWalkable(w.terrain, cx, cy, cmd.z, rules)) {
          return refuse(Reason.LOC_NECALCABIL, { wx: cx, wy: cy, z: cmd.z })
        }
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
      // Si jobul: mortul si-a eliberat rezervarile la `killAgent`, dar campurile
      // raman scrise in slot. Un nou-nascut cu `jobKind` al mortului ar „lucra"
      // la o tinta pe care n-a rezervat-o niciodata.
      a.jobKind[slot] = 0
      a.jobId[slot] = 0
      a.jobTarget[slot] = 0
      a.jobStep[slot] = 0
      a.jobProgres[slot] = 0
      a.jobWorkX[slot] = 0
      a.jobWorkY[slot] = 0
      a.jobWorkZ[slot] = 0
      a.jobIncercari[slot] = 0
      a.scanLaTick[slot] = 0
      uitaTintele(w, slot)
      for (let c = 0; c < CATEGORII; c++) a.prioPersonala[slot * CATEGORII + c] = rules.personalPriorityDefault
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
      // Un mort nu tine rezervari. Fara asta, tinta lui ramane „ocupata" pe veci:
      // deadlock tacut, care supravietuieste si in save (research, bug-ul 4).
      terminaJob(w, rules, slot, Sfarsit.INTRERUPT)
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
      // Aceeasi cale ca sapatul facut de un pion (joburi.ts). In plus, sapatul
      // manual ia si desemnarea de pe celula si intrerupe jobul cui o tinea.
      const out = sapaManual(w, cmd.wx, cmd.wy, cmd.z, rules)
      if (!out.ok) return out
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

    case 'desemneaza': {
      if (cmd.wx < 0 || cmd.wy < 0 || cmd.wx >= WORLD_CELLS || cmd.wy >= WORLD_CELLS) {
        return refuse(Reason.IN_AFARA_LUMII, { x: cmd.wx, y: cmd.wy, limita: WORLD_CELLS })
      }
      const prioritate = cmd.prioritate ?? rules.designationPriorityDefault
      if (!Number.isInteger(prioritate) || prioritate < 1 || prioritate > rules.designationPriorityLevels) {
        return refuse(Reason.VALOARE_INVALIDA, { camp: 'prioritate', valoare: String(prioritate), min: 1, max: rules.designationPriorityLevels })
      }
      // E ceva de sapat acolo? Aceeasi intrebare pe care o pune `dig`, pusa
      // ACUM, nu cand ajunge pionul: o desemnare in aer ar fi o tinta pe care
      // toata lumea o ia si nimeni n-o poate termina. Si in intervalul in care
      // chunk-ul are (sau ar avea) voxeli: sub baza lui nu exista nimic de sapat,
      // nici acum, nici dupa promovare.
      const interval = voxelRangeM(w.terrain, cmd.wx, cmd.wy)
      if (!interval.ok) return interval
      if (cmd.z < interval.value.min || cmd.z > interval.value.max) {
        return refuse(Reason.IN_AFARA_LUMII, { z: cmd.z, min: interval.value.min, max: interval.value.max })
      }
      const mat = materialAt(w.terrain, cmd.wx, cmd.wy, cmd.z)
      if (!mat.ok) return mat
      if (!isSolid(mat.value)) {
        return refuse(Reason.LIPSA_MATERIAL, { motiv: 'nu e nimic de sapat', material: mat.value, wx: cmd.wx, wy: cmd.wy, z: cmd.z })
      }
      // Id-ul se consuma DOAR daca desemnarea intra. Un refuz nu muta `nextId`.
      const out = adaugaDesemnare(w.desemnari, w.nextId, Desemnare.SAPA, cmd.wx, cmd.wy, cmd.z, prioritate)
      if (!out.ok) return out
      const id = w.nextId++
      acoperaDesemnarea(w, rules, cmd.wx, cmd.wy, cmd.z)
      return accept(id)
    }

    case 'anuleazaDesemnarea': {
      const ds = slotDesemnare(w.desemnari, cmd.id)
      if (ds === -1) return refuse(Reason.ENTITATE_INEXISTENTA, { id: cmd.id })
      anuleazaDesemnare(w, rules, ds)
      return accept(cmd.id)
    }

    case 'setPrioritatePersonala': {
      const a = w.agents
      const slot = slotOf(a, cmd.id)
      if (slot === -1) return refuse(Reason.ENTITATE_INEXISTENTA, { id: cmd.id })
      if (!Number.isInteger(cmd.categorie) || cmd.categorie < 0 || cmd.categorie >= CATEGORII) {
        return refuse(Reason.VALOARE_INVALIDA, { camp: 'categorie', valoare: String(cmd.categorie), min: 0, max: CATEGORII - 1 })
      }
      if (!Number.isInteger(cmd.nivel) || cmd.nivel < 0 || cmd.nivel > rules.personalPriorityLevels) {
        return refuse(Reason.VALOARE_INVALIDA, { camp: 'nivel', valoare: String(cmd.nivel), min: 0, max: rules.personalPriorityLevels })
      }
      a.prioPersonala[slot * CATEGORII + cmd.categorie] = cmd.nivel
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
