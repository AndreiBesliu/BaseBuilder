/**
 * Zonele pictate — depozitele. S16-19, taietura 2.
 *
 * O zona e o multime de celule pictate + un fel (DEPOZIT) + o prioritate.
 * Celulele sunt ENTITATI cu id propriu, din `w.nextId`: celula de depozit e a
 * doua tinta a unui job de carat si intra in tuplul de rezervare, iar
 * `evitaTinta` e un Int32Array — o cheie de celula (≈ 2^38) n-ar incapea.
 *
 * ## Indexul DERIVED, sub un steag murdar
 *
 * Scannerul are nevoie de trei raspunsuri ieftine: „care e cea mai buna
 * prioritate cu loc pentru felul asta?" (poarta strict-mai-bun), „ce celule
 * libere are zona asta?" (cautarea destinatiei), si „ce iteme au unde sa fie
 * mutate?" (trecerea ieftina). Toate trei se REconstruiesc din stare, o data, la
 * prima citire de dupa o schimbare — nu se intretin „in locurile potrivite",
 * fiindca panoul a aratat ca lista locurilor potrivite e exact lista pe care o
 * uiti (lasatul la picioare pe ultima celula libera, `iaItem` care elibereaza o
 * celula, stergerea ultimei libere). Un DERIVED care poate ramane stale nu e
 * DERIVED. Reconstructia e o functie pura de stare persistata, deci lumea
 * incarcata si cea continua o fac identic.
 *
 * Costul: O(celule de zona + iteme) per murdarire, platit doar la citire. Cu o
 * carieră activa e sub o reconstructie pe tick; se masoara in acceptanta.
 * Colonia in repaus (nimic nu se misca) costa zero — asta e raspunsul la K05.
 */

import type { Rules } from './content.ts'
import type { Outcome } from './result.ts'
import { accept, codMotiv, refuse, Reason } from './result.ts'
import type { World } from './state.ts'
import { ITEME } from './state.ts'
import { cellKey } from './path.ts'
import { rezervariPentru, Strat } from './rezervari.ts'
import { DetaliuItem } from './iteme.ts'

/** Felurile de zona. Un singur fel azi. */
export const Zona = {
  DEPOZIT: 0,
} as const
export type ZonaKind = (typeof Zona)[keyof typeof Zona]

export interface ZoneCellStore {
  /** PERSISTED */ count: number
  /** PERSISTED */ capacity: number
  /** PERSISTED — din `w.nextId`; tinta rezervarii de destinatie */ readonly id: Int32Array
  /** PERSISTED — id-ul zonei din care face parte */ readonly zonaId: Int32Array
  /** PERSISTED */ readonly wx: Int32Array
  /** PERSISTED */ readonly wy: Int32Array
  /** PERSISTED */ readonly z: Int32Array
  /** PERSISTED — 0 = slot liber */ readonly alive: Uint8Array
  /** DERIVED — celula → slot */ readonly laCelula: Map<number, number>
  /** DERIVED — id → slot */ readonly laId: Map<number, number>
  /** DERIVED */ vii: number
}

/** Ce stie scannerul despre zone fara sa le parcurga. Se reconstruieste cand `murdar`. */
export interface IndexZone {
  /** TRANSIENT — trebuie reconstruit inainte de urmatoarea citire. `true` la incarcare. */
  murdar: boolean
  /** Per slot de zona: sloturile celulelor nepline si nerezervate ca destinatie, in ordinea slotului. */
  readonly libere: number[][]
  /** `slotZona * ITEME + fel`: cate celule libere ar primi felul (goale, sau acelasi fel cu loc). */
  acceptante: Int32Array
  /** Per fel: prioritatea maxima a unei zone cu cel putin o celula acceptanta; 0 = niciuna. */
  readonly maxPrioLibera: Int32Array
  /** Sloturile zonelor vii, in ordinea (prioritate desc, id asc). */
  readonly zoneOrdonate: number[]
  /** Sloturile itemelor care AU unde sa fie mutate (o zona strict mai buna decat locul lor), in ordinea slotului. */
  readonly deMutat: number[]
  /** Cate iteme zac pe jos (nu intr-o zona) fara nicio zona care sa le primeasca. Pentru cauza pe pion. */
  peJosFaraDepozit: number
  /** Cate reconstructii s-au facut de la pornire. Pentru masuratori. */
  reconstructii: number
}

export interface ZoneStore {
  /** PERSISTED — sloturi folosite */ count: number
  /** PERSISTED */ capacity: number
  /** PERSISTED — din `w.nextId` */ readonly id: Int32Array
  /** PERSISTED — `Zona` */ readonly kind: Uint8Array
  /** PERSISTED — 1..zonePriorityLevels */ readonly prioritate: Uint8Array
  /** PERSISTED — 0 = slot liber */ readonly alive: Uint8Array
  /** DERIVED — id → slot */ readonly laId: Map<number, number>
  /** DERIVED */ vii: number
  /** PERSISTED — celulele tuturor zonelor */ readonly celule: ZoneCellStore
  /** DERIVED */ readonly index: IndexZone
}

export function makeZoneStore(capacity: number, cellCapacity: number): ZoneStore {
  return {
    count: 0,
    capacity,
    id: new Int32Array(capacity),
    kind: new Uint8Array(capacity),
    prioritate: new Uint8Array(capacity),
    alive: new Uint8Array(capacity),
    laId: new Map(),
    vii: 0,
    celule: {
      count: 0,
      capacity: cellCapacity,
      id: new Int32Array(cellCapacity),
      zonaId: new Int32Array(cellCapacity),
      wx: new Int32Array(cellCapacity),
      wy: new Int32Array(cellCapacity),
      z: new Int32Array(cellCapacity),
      alive: new Uint8Array(cellCapacity),
      laCelula: new Map(),
      laId: new Map(),
      vii: 0,
    },
    index: {
      murdar: true,
      libere: [],
      acceptante: new Int32Array(capacity * ITEME),
      maxPrioLibera: new Int32Array(ITEME),
      zoneOrdonate: [],
      deMutat: [],
      peJosFaraDepozit: 0,
      reconstructii: 0,
    },
  }
}

export function slotZona(s: ZoneStore, id: number): number {
  const i = s.laId.get(id)
  return i === undefined ? -1 : i
}

export function slotCelulaDeZona(s: ZoneStore, id: number): number {
  const i = s.celule.laId.get(id)
  return i === undefined ? -1 : i
}

/** Slotul celulei de zona de pe (wx, wy, z), sau -1. */
export function celulaDeZonaLa(s: ZoneStore, wx: number, wy: number, z: number): number {
  const i = s.celule.laCelula.get(cellKey(wx, wy, z))
  return i === undefined ? -1 : i
}

/** Prioritatea zonei in care sta celula (wx, wy, z), sau 0 daca nu e in nicio zona. */
export function prioritateaLocului(s: ZoneStore, wx: number, wy: number, z: number): number {
  const cs = celulaDeZonaLa(s, wx, wy, z)
  if (cs === -1) return 0
  const zs = slotZona(s, s.celule.zonaId[cs]!)
  return zs === -1 ? 0 : s.prioritate[zs]!
}

export function marcheazaZoneMurdare(w: World): void {
  w.zone.index.murdar = true
}

/** Creeaza o zona goala. `id` vine de la apelant si se consuma doar la succes. */
export function creeazaZona(s: ZoneStore, id: number, kind: ZonaKind, prioritate: number): Outcome<number> {
  let slot = -1
  for (let i = 0; i < s.count; i++) {
    if (s.alive[i] === 0) { slot = i; break }
  }
  if (slot === -1) {
    if (s.count >= s.capacity) return refuse(Reason.CAPACITATE_DEPASITA, { camp: 'zone', capacitate: s.capacity })
    slot = s.count
    s.count++
  }
  s.id[slot] = id
  s.kind[slot] = kind
  s.prioritate[slot] = prioritate
  s.alive[slot] = 1
  s.laId.set(id, slot)
  s.vii++
  s.index.murdar = true
  return accept(slot)
}

/** Adauga o celula la o zona vie. Validarile de teren sunt ale comenzii; aici: duplicat si capacitate. */
export function adaugaCelulaDeZona(s: ZoneStore, id: number, zonaId: number, wx: number, wy: number, z: number): Outcome<number> {
  const c = s.celule
  const key = cellKey(wx, wy, z)
  const existent = c.laCelula.get(key)
  if (existent !== undefined) return refuse(Reason.DEJA_DESEMNATA, { camp: 'zona', zonaId: c.zonaId[existent]!, wx, wy, z })
  let slot = -1
  for (let i = 0; i < c.count; i++) {
    if (c.alive[i] === 0) { slot = i; break }
  }
  if (slot === -1) {
    if (c.count >= c.capacity) return refuse(Reason.CAPACITATE_DEPASITA, { camp: 'zoneCelule', capacitate: c.capacity })
    slot = c.count
    c.count++
  }
  c.id[slot] = id
  c.zonaId[slot] = zonaId
  c.wx[slot] = wx
  c.wy[slot] = wy
  c.z[slot] = z
  c.alive[slot] = 1
  c.laCelula.set(key, slot)
  c.laId.set(id, slot)
  c.vii++
  s.index.murdar = true
  return accept(slot)
}

/** Sterge o celula de zona vie, la nivel de store. Rezervarile de pe ea sunt treaba apelantului. */
export function stergeCelulaDeZona(s: ZoneStore, slot: number): void {
  const c = s.celule
  if (c.alive[slot] === 0) return
  c.alive[slot] = 0
  c.laCelula.delete(cellKey(c.wx[slot]!, c.wy[slot]!, c.z[slot]!))
  c.laId.delete(c.id[slot]!)
  c.vii--
  s.index.murdar = true
}

/** Sterge o zona vie (fara celule — apelantul le sterge intai, ca sa le trateze rezervarile). */
export function stergeZona(s: ZoneStore, slot: number): void {
  if (s.alive[slot] === 0) return
  s.alive[slot] = 0
  s.laId.delete(s.id[slot]!)
  s.vii--
  s.index.murdar = true
}

/**
 * Reconstruieste partea DERIVED dupa incarcare. Duplicatele (celula, id) si
 * celulele orfane (zona lor nu exista) sunt refuz, nu tacere.
 */
export function reindexeazaZone(s: ZoneStore, rules: Rules): Outcome<void> {
  s.laId.clear()
  s.vii = 0
  for (let i = 0; i < s.count; i++) {
    if (s.alive[i] === 0) continue
    if (s.laId.has(s.id[i]!)) return refuse(Reason.ENTITATE_INEXISTENTA, { camp: 'zone.id', motiv: 'duplicat', id: s.id[i]! })
    const p = s.prioritate[i]!
    if (p < 1 || p > rules.zonePriorityLevels) return refuse(Reason.VALOARE_INVALIDA, { camp: `zone.prioritate[${i}]`, valoare: p, min: 1, max: rules.zonePriorityLevels })
    s.laId.set(s.id[i]!, i)
    s.vii++
  }
  const c = s.celule
  c.laCelula.clear()
  c.laId.clear()
  c.vii = 0
  for (let i = 0; i < c.count; i++) {
    if (c.alive[i] === 0) continue
    const key = cellKey(c.wx[i]!, c.wy[i]!, c.z[i]!)
    if (c.laCelula.has(key)) return refuse(Reason.DEJA_DESEMNATA, { camp: 'zoneCelule', motiv: 'doua celule de zona vii pe aceeasi celula', slot: i })
    if (c.laId.has(c.id[i]!)) return refuse(Reason.ENTITATE_INEXISTENTA, { camp: 'zoneCelule.id', motiv: 'duplicat', id: c.id[i]! })
    if (!s.laId.has(c.zonaId[i]!)) return refuse(Reason.ENTITATE_INEXISTENTA, { camp: 'zoneCelule.zonaId', motiv: 'zona inexistenta', id: c.zonaId[i]! })
    c.laCelula.set(key, i)
    c.laId.set(c.id[i]!, i)
    c.vii++
  }
  s.index.murdar = true
  return accept()
}

// ---------------------------------------------------------------------------
// indexul
// ---------------------------------------------------------------------------

/**
 * Indexul, reconstruit daca e murdar. Singura cale de citire.
 *
 * O celula e LIBERA daca nu tine un morman plin si nu e rezervata de nimeni ca
 * destinatie. Ea ACCEPTA un fel daca e goala (orice fel) sau tine acelasi fel cu
 * loc. `maxPrioLibera[fel]` e strans pe fel — panoul a aratat ca un singur numar
 * orb la fel trimitea toate mormanele de piatra dintr-un depozit slab la
 * evaluari scumpe, pe viata, fiindca depozitul bun avea loc doar in mormane de
 * pamant.
 *
 * `deMutat` sunt itemele pe care scannerul are voie sa le vada: cele cu o zona
 * strict mai buna decat locul lor. Un item rezervat ca sursa ramane in lista;
 * scannerul il respinge ieftin cu `poateRezerva`.
 */
export function indexZone(w: World, rules: Rules): IndexZone {
  const s = w.zone
  const ix = s.index
  if (!ix.murdar) return ix
  ix.murdar = false
  ix.reconstructii++

  // Zonele vii, ordonate. Ordine TOTALA pe date persistate (prioritate, id).
  ix.zoneOrdonate.length = 0
  for (let i = 0; i < s.count; i++) if (s.alive[i] === 1) ix.zoneOrdonate.push(i)
  ix.zoneOrdonate.sort((a, b) => s.prioritate[b]! - s.prioritate[a]! || s.id[a]! - s.id[b]!)

  if (ix.acceptante.length < s.count * ITEME) ix.acceptante = new Int32Array(s.capacity * ITEME)
  ix.acceptante.fill(0)
  ix.maxPrioLibera.fill(0)
  for (let i = 0; i < s.count; i++) {
    if (!ix.libere[i]) ix.libere[i] = []
    else ix.libere[i]!.length = 0
  }

  const c = s.celule
  const it = w.iteme
  for (let cs = 0; cs < c.count; cs++) {
    if (c.alive[cs] === 0) continue
    const zs = slotZona(s, c.zonaId[cs]!)
    if (zs === -1) continue
    if (rezervariPentru(w.rezervari, c.id[cs]!, Strat.LUCRU).length > 0) continue
    const item = it.laCelula.get(cellKey(c.wx[cs]!, c.wy[cs]!, c.z[cs]!))
    if (item === undefined) {
      ix.libere[zs]!.push(cs)
      for (let k = 0; k < ITEME; k++) ix.acceptante[zs * ITEME + k]!++
    } else if (it.cantitate[item]! < rules.itemStackMax) {
      ix.libere[zs]!.push(cs)
      ix.acceptante[zs * ITEME + it.kind[item]!]!++
    }
  }
  for (const zs of ix.zoneOrdonate) {
    for (let k = 0; k < ITEME; k++) {
      if (ix.acceptante[zs * ITEME + k]! > 0 && s.prioritate[zs]! > ix.maxPrioLibera[k]!) ix.maxPrioLibera[k] = s.prioritate[zs]!
    }
  }

  ix.deMutat.length = 0
  ix.peJosFaraDepozit = 0
  for (let i = 0; i < it.count; i++) {
    if (it.alive[i] === 0) continue
    const prioLoc = prioritateaLocului(s, it.wx[i]!, it.wy[i]!, it.z[i]!)
    if (ix.maxPrioLibera[it.kind[i]!]! > prioLoc) {
      ix.deMutat.push(i)
    } else if (prioLoc === 0) {
      // Pe jos si n-are unde. Cauza e TRANSIENT si se scrie aici, ca sa fie
      // vizibila fara ca vreun pion sa plateasca o evaluare pentru ea.
      ix.peJosFaraDepozit++
      it.ultimulMotiv[i] = codMotiv(Reason.FARA_DEPOZIT)
      it.ultimulMotivDetaliu[i] = s.vii === 0 ? DetaliuItem.NICIO_ZONA : DetaliuItem.DEPOZITE_PLINE
    }
  }
  return ix
}
