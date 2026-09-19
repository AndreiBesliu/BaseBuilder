/**
 * Itemele — mormanele de pe jos si din depozite. S16-19, taietura 2.
 *
 * Un item e o TINTA de job (sursa unui carat), exact ca o desemnare: nu stie cine
 * il cara, asta e treaba rezervarilor (K02). SoA, sloturi stabile si reutilizate.
 *
 * ## Un morman per celula
 *
 * Doua iteme de acelasi fel pe aceeasi celula se contopesc (pana la
 * `itemStackMax`); doua de feluri diferite nu pot sta pe aceeasi celula. Regula
 * simplifica depozitul (o celula = un morman) si face `laCelula` un index, nu o
 * lista. `reindexeazaIteme` REFUZA doua iteme vii pe o celula — un item ascuns
 * ar fi viu dar invizibil pentru contopiri si pentru scanner.
 *
 * ## O singura rutina de depunere
 *
 * Panoul de design a gasit patru locuri in care marfa DISPAREA tacut: lasatul la
 * picioare pe o celula cu morman de alt fel, un pion ucis pe o stiva plina,
 * yield-ul unui tunel de 2 m (celula sapata necalcabila, celula de lucru cu alt
 * fel), si podeaua sapata de sub un morman. Toate aveau aceeasi radacina:
 * fiecare loc isi improviza propria regula de „unde pun asta". Acum exista UNA,
 * `asazaItem`, cu cautare in ordine FIXA si cu pierderea NUMARATA intr-un zavor
 * per lume — nu „nu se intampla", ci „se intampla de N ori, si N e asertat 0".
 *
 * ## Un item zace MEREU pe o celula calcabila
 *
 * Nu e afirmat, e intretinut: `asazaItem` nu pune nimic pe o celula necalcabila,
 * iar `sapaVoxel` (joburi.ts) reaseaza mormanul de deasupra unui voxel sapat.
 * `fill` refuza sa zideasca peste un morman. Invariantul se aserteaza in
 * acceptanta.
 */

import type { Rules } from './content.ts'
import type { Outcome } from './result.ts'
import { accept, refuse, Reason } from './result.ts'
import type { World } from './state.ts'
import { cellKey } from './path.ts'
import { Desemnare, desemnareLaCelula, seSapaLa } from './desemnari.ts'
import { isWalkable } from './regions.ts'
import { rezervariPentru, Strat } from './rezervari.ts'
import { celulaDeZonaLa, marcheazaZoneMurdare } from './zone.ts'

/** Detaliul unui refuz memorat pe item. Pentru „De ce nu?". */
export const DetaliuItem = {
  NICIUNUL: 0,
  /** Nicio zona pictata care sa primeasca felul asta. Actionabil: picteaza un depozit. */
  NICIO_ZONA: 1,
  /** Exista zone, dar niciuna n-are loc pentru cantitatea asta. Actionabil: mareste. */
  DEPOZITE_PLINE: 2,
  /** Exista loc, dar nu in componenta pionului care a intrebat. Actionabil: leaga zonele. */
  COMPONENTE_DIFERITE: 3,
} as const

export interface ItemStore {
  /** PERSISTED — sloturi folosite */ count: number
  /** PERSISTED */ capacity: number
  /** PERSISTED — din `w.nextId`; identitatea stabila a tintei */ readonly id: Int32Array
  /** PERSISTED — `Item` */ readonly kind: Uint8Array
  /** PERSISTED — celula pe care zace */ readonly wx: Int32Array
  /** PERSISTED */ readonly wy: Int32Array
  /** PERSISTED */ readonly z: Int32Array
  /** PERSISTED — unitati; 1..itemStackMax cat e viu */ readonly cantitate: Int32Array
  /** PERSISTED — 0 = slot liber */ readonly alive: Uint8Array
  /**
   * PERSISTED — pana la tickul asta nimeni nu-l evalueaza scump. Se scrie DOAR
   * pentru ce e o proprietate a itemului (n-are unde, nu se ajunge), niciodata
   * pentru ce tine de un anume pion. Influenteaza plafonul de evaluari, deci e
   * stare — panoul a aratat ca nepersistat rupe `1000 + save + load + 1000`.
   */
  readonly reincercaLaTick: Int32Array
  /** TRANSIENT — `codMotiv` al ultimului refuz si detaliul lui (`DetaliuItem`). */
  readonly ultimulMotiv: Uint8Array
  readonly ultimulMotivDetaliu: Uint8Array
  /** DERIVED — celula → slot. Un singur morman per celula. */
  readonly laCelula: Map<number, number>
  /** DERIVED — id → slot. */
  readonly laId: Map<number, number>
  /** DERIVED — cate sunt vii. */
  vii: number
}

export function makeItemStore(capacity: number): ItemStore {
  return {
    count: 0,
    capacity,
    id: new Int32Array(capacity),
    kind: new Uint8Array(capacity),
    wx: new Int32Array(capacity),
    wy: new Int32Array(capacity),
    z: new Int32Array(capacity),
    cantitate: new Int32Array(capacity),
    alive: new Uint8Array(capacity),
    reincercaLaTick: new Int32Array(capacity),
    ultimulMotiv: new Uint8Array(capacity),
    ultimulMotivDetaliu: new Uint8Array(capacity),
    laCelula: new Map(),
    laId: new Map(),
    vii: 0,
  }
}

/** Slotul unui id viu, sau -1. */
export function slotItem(s: ItemStore, id: number): number {
  const i = s.laId.get(id)
  return i === undefined ? -1 : i
}

/** Slotul mormanului de pe o celula, sau -1. */
export function itemLaCelula(s: ItemStore, wx: number, wy: number, z: number): number {
  const i = s.laCelula.get(cellKey(wx, wy, z))
  return i === undefined ? -1 : i
}

/**
 * Creeaza un morman NOU pe o celula GOALA. Nu contopeste, nu cauta: e primitiva
 * de store. Validarile de teren sunt ale apelantului (`asazaItem`). `id` vine
 * din `w.nextId` si e consumat de apelant DOAR daca intra.
 */
export function creeazaItem(s: ItemStore, id: number, kind: number, wx: number, wy: number, z: number, cantitate: number): Outcome<number> {
  const key = cellKey(wx, wy, z)
  const existent = s.laCelula.get(key)
  if (existent !== undefined) return refuse(Reason.CELULA_OCUPATA, { id: s.id[existent]!, wx, wy, z })
  if (cantitate < 1) return refuse(Reason.VALOARE_INVALIDA, { camp: 'cantitate', valoare: cantitate })
  let slot = -1
  for (let i = 0; i < s.count; i++) {
    if (s.alive[i] === 0) { slot = i; break }
  }
  if (slot === -1) {
    if (s.count >= s.capacity) return refuse(Reason.CAPACITATE_DEPASITA, { capacitate: s.capacity })
    slot = s.count
    s.count++
  }
  s.id[slot] = id
  s.kind[slot] = kind
  s.wx[slot] = wx
  s.wy[slot] = wy
  s.z[slot] = z
  s.cantitate[slot] = cantitate
  s.alive[slot] = 1
  // Slotul se REUTILIZEAZA: nimic din itemul mort nu ramane (racirea mostenita
  // ar ascunde itemul nou pana la un tick pe care nu l-a trait).
  s.reincercaLaTick[slot] = 0
  s.ultimulMotiv[slot] = 0
  s.ultimulMotivDetaliu[slot] = 0
  s.laCelula.set(key, slot)
  s.laId.set(id, slot)
  s.vii++
  return accept(slot)
}

/** Omoara un item viu, la nivel de store. Rezervarile de pe el sunt treaba apelantului. */
export function stergeItem(s: ItemStore, slot: number): void {
  if (s.alive[slot] === 0) return
  s.alive[slot] = 0
  s.laCelula.delete(cellKey(s.wx[slot]!, s.wy[slot]!, s.z[slot]!))
  s.laId.delete(s.id[slot]!)
  s.vii--
}

/**
 * Reconstruieste partea DERIVED dupa incarcare. Doua iteme vii pe aceeasi
 * celula, un id duplicat sau o cantitate nevalida inseamna un save editat sau
 * corupt: refuz, nu „ultima castiga".
 */
export function reindexeazaIteme(s: ItemStore, rules: Rules): Outcome<void> {
  s.laCelula.clear()
  s.laId.clear()
  s.vii = 0
  for (let i = 0; i < s.count; i++) {
    if (s.alive[i] === 0) continue
    const key = cellKey(s.wx[i]!, s.wy[i]!, s.z[i]!)
    if (s.laCelula.has(key)) {
      return refuse(Reason.CELULA_OCUPATA, { camp: 'iteme', motiv: 'doua iteme vii pe aceeasi celula', slot: i, wx: s.wx[i]!, wy: s.wy[i]!, z: s.z[i]! })
    }
    if (s.laId.has(s.id[i]!)) {
      return refuse(Reason.ENTITATE_INEXISTENTA, { camp: 'iteme.id', motiv: 'duplicat', id: s.id[i]! })
    }
    const c = s.cantitate[i]!
    if (c < 1 || c > rules.itemStackMax) {
      return refuse(Reason.VALOARE_INVALIDA, { camp: `iteme.cantitate[${i}]`, valoare: c, min: 1, max: rules.itemStackMax })
    }
    s.laCelula.set(key, i)
    s.laId.set(s.id[i]!, i)
    s.vii++
  }
  return accept()
}

// ---------------------------------------------------------------------------
// depunerea — singura cale
// ---------------------------------------------------------------------------

const DIRECTII = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** Cat mai incape pe o celula pentru felul dat: `itemStackMax` daca e goala, restul daca e acelasi fel, 0 daca e alt fel. */
export function locPeCelula(w: World, rules: Rules, kind: number, wx: number, wy: number, z: number): number {
  const it = itemLaCelula(w.iteme, wx, wy, z)
  if (it === -1) return rules.itemStackMax
  if (w.iteme.kind[it] !== kind) return 0
  return rules.itemStackMax - w.iteme.cantitate[it]!
}

/**
 * O celula rezervata de cineva ca DESTINATIE de carat nu primeste nimic de la
 * altcineva: promisiunea „existent + cantitatea rezervata ≤ itemStackMax" facuta
 * la scanare trebuie sa tina pana la depunere, altfel rezervarea n-ar garanta
 * nimic si reconstructia ei la incarcare ar da alt raspuns.
 */
function rezervataCaDestinatie(w: World, wx: number, wy: number, z: number): boolean {
  const cs = celulaDeZonaLa(w.zone, wx, wy, z)
  if (cs === -1) return false
  return rezervariPentru(w.rezervari, w.zone.celule.id[cs]!, Strat.LUCRU).length > 0
}

export interface Depunere {
  /** Cate unitati au ajuns pe jos. Restul e in `ratiune.itemePierdute`. */
  readonly pus: number
  /** Slotul ultimului morman scris (nou sau contopit), sau -1. Pentru racirea „pe ce exista dupa lasat". */
  readonly ultimulSlot: number
}

/**
 * Depune `cantitate` unitati de felul `kind`, cat mai aproape de (wx, wy, z).
 *
 * Ordine FIXA: celula data, apoi cei 4 vecini orizontali la z, apoi la z+1, z−1,
 * … pana la ±maxStepM. Doua treceri peste aceeasi ordine: intai celulele a caror
 * podea NU e o desemnare vie (mormanul de acolo ar cadea la sapat), apoi si
 * alea — un al doilea strat desemnat dinainte n-are voie sa piarda yield-ul
 * primului. O celula e buna daca e calcabila, nu e destinatie rezervata de
 * altcineva, si e goala sau tine acelasi fel cu loc. Se contopeste cat incape,
 * restul merge pe urmatoarea celula din ordine. Ce nu incape nicaieri se numara
 * in `ratiune.itemePierdute` (zavor per lume).
 *
 * `id` nenul: primul morman NOU creat il primeste (un morman mutat de cârlig
 * isi pastreaza identitatea daca nu se contopeste); celelalte iau din `nextId`.
 */
export function asazaItem(w: World, rules: Rules, kind: number, cantitate: number, wx: number, wy: number, z: number, id = 0): Depunere {
  let ramas = cantitate
  let ultimulSlot = -1
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  for (let trecere = 0; trecere < 2 && ramas > 0; trecere++) {
    for (let dz = 0; dz <= pas && ramas > 0; dz++) {
      for (const zs of dz === 0 ? [z] : [z + dz, z - dz]) {
        for (const [dx, dy] of dz === 0 ? [[0, 0], ...DIRECTII] as const : DIRECTII) {
          if (ramas <= 0) break
          const nx = wx + dx
          const ny = wy + dy
          if (nx < 0 || ny < 0) continue
          // „Se SAPA sub ea?", nu „exista o desemnare acolo": pentru o desemnare de
          // CONSTRUIT podeaua ramane, si chiar se intareste. Al treilea cititor cu
          // problema asta; celelalte doua s-au reparat la pasul 1.
          const podeaDesemnata = seSapaLa(w.desemnari, nx, ny, zs - 1)
          // Si nu se lasa marfa PE un santier: constructorul sta langa celula pe
          // care o zideste, deci celula aia e in ordinea de cautare a lui
          // `lasaLaPicioare` — iar apoi zidirea ar fi refuzata cu CELULA_OCUPATA de
          // propria lui marfa.
          const santier = desemnareLaCelula(w.desemnari, nx, ny, zs)
          if (santier !== -1 && w.desemnari.kind[santier] === Desemnare.CONSTRUIESTE) continue
          if (trecere === 0 && podeaDesemnata) continue
          if (trecere === 1 && !podeaDesemnata) continue
          const loc = locPeCelula(w, rules, kind, nx, ny, zs)
          if (loc <= 0) continue
          if (!isWalkable(w.terrain, nx, ny, zs, rules)) continue
          if (rezervataCaDestinatie(w, nx, ny, zs)) continue
          const pune = Math.min(loc, ramas)
          const it = itemLaCelula(w.iteme, nx, ny, zs)
          if (it !== -1) {
            w.iteme.cantitate[it] = w.iteme.cantitate[it]! + pune
            ultimulSlot = it
          } else {
            const idNou = id !== 0 ? id : w.nextId
            const out = creeazaItem(w.iteme, idNou, kind, nx, ny, zs, pune)
            if (!out.ok) continue // capacitate: se incearca contopirea in alta parte
            if (id !== 0) id = 0
            else w.nextId++
            ultimulSlot = out.value
          }
          ramas -= pune
          marcheazaZoneMurdare(w)
        }
      }
    }
  }
  if (ramas > 0) w.ratiune.itemePierdute += ramas
  return { pus: cantitate - ramas, ultimulSlot }
}

/**
 * Ia `cantitate` din mormanul `slot`. Daca ramane gol, moare. Intoarce cat s-a
 * luat. Rezervarile de pe un morman mort sunt treaba apelantului.
 */
export function iaDinItem(w: World, rules: Rules, slot: number, cantitate: number): number {
  const s = w.iteme
  const inainte = s.cantitate[slot]!
  const luat = Math.min(cantitate, inainte)
  const dupa = inainte - luat
  s.cantitate[slot] = dupa

  // Indexul se murdareste doar cand luatul poate SCHIMBA indexul. Panoul
  // taieturii 3 a masurat de ce conteaza: mancatul cheama rutina asta la fiecare
  // imbucatura, iar o murdarire neconditionata ar plati o reconstructie
  // O(celule + iteme) de fiecare data — la tinta din DESIGN §10, ~114 pasi/tick
  // doar din mancat, de 3,8 ori peste pragul care leaga azi.
  //
  // Trei cauze, si atat:
  //   - mormanul moare: iese din `deMutat`, si celula lui de depozit se elibereaza;
  //   - sta pe o celula de zona: `libere`/`acceptante`/`maxLocLiber` se schimba;
  //   - `min(cantitate, haulCarryMax)` se schimba: alta cerere in `incapeUndeva`.
  // O imbucatura de 20 dintr-un morman de 75 de pe jos nu atinge niciuna.
  const peZona = celulaDeZonaLa(w.zone, s.wx[slot]!, s.wy[slot]!, s.z[slot]!) !== -1
  const caraSchimbat = Math.min(inainte, rules.haulCarryMax) !== Math.min(dupa, rules.haulCarryMax)
  if (dupa === 0) {
    stergeItem(s, slot)
    marcheazaZoneMurdare(w)
  } else if (peZona || caraSchimbat) {
    marcheazaZoneMurdare(w)
  }
  return luat
}
