/**
 * Desemnarile — ce a cerut jucatorul sa se faca, pe o celula.
 *
 * O desemnare e o TINTA de job, nu un job: jobul apare abia cand un pion o
 * trage (pull) din scanner. Ea nu stie cine lucreaza la ea — asta e treaba
 * rezervarilor (K02: niciun `isBeingWorkedOn` pe entitate).
 *
 * SoA, sloturi stabile si reutilizate, exact ca la agenti. PERSISTED, cu
 * exceptiile etichetate mai jos.
 */

import type { Outcome } from './result.ts'
import { accept, refuse, Reason } from './result.ts'
import { cellKey } from './path.ts'

/** Felurile de desemnare. Un singur fel azi. */
export const Desemnare = {
  SAPA: 0,
  /**
   * Rezervat pentru S20-23 taietura 2. Exista DE PE ACUM fiindca poarta care
   * il separa de SAPA trebuie sa fie in cod si probata INAINTE sa apara prima
   * piesa: pana la ea, `cautaJob` nu citea niciodata `kind`, iar o desemnare
   * de alt fel era luata ca job de sapat si stearsa. Masurat de panoul de
   * design in scenariul standard: celula goala la tickul 3047.
   */
  CONSTRUIESTE: 1,
} as const
export type DesemnareKind = (typeof Desemnare)[keyof typeof Desemnare]

/**
 * Ce piesa se construieste. Tabelul cu materiale, cantitati si timpi sta in
 * `content/rules.json`; aici e doar indexul lui.
 *
 * **`NICIUNA = 0`, si piesele reale incep de la 1.** Zero e valoare VALIDA in
 * enumerarile vecine (`Item.PIATRA = 0`), deci o migrare care ar umple cu zero
 * ar preface fiecare desemnare de sapat dintr-un save vechi intr-un „perete de
 * piatra" pe care nimic nu l-ar putea detecta. Cu o santinela, contradictia
 * dintre fel si piesa se poate REFUZA la incarcare, si chiar se refuza.
 */
export const Piesa = {
  NICIUNA: 0,
  PERETE: 1,
  PODEA: 2,
  SCARA: 3,
} as const
export type PiesaId = (typeof Piesa)[keyof typeof Piesa]

/** Detaliul unui refuz INACCESIBIL memorat pe desemnare. Pentru „De ce nu?". */
export const DetaliuMotiv = {
  NICIUNUL: 0,
  /** Niciun vecin pe care sa se poata sta. Actionabil: sapa o rampa. */
  FARA_LOC_DE_LUCRU: 1,
  /** Are loc de lucru, dar nu in componenta pionului care a intrebat. Actionabil: leaga zonele. */
  COMPONENTE_DIFERITE: 2,
} as const

export interface DesignationStore {
  /** PERSISTED — sloturi folosite */ count: number
  /** PERSISTED */ capacity: number
  /** PERSISTED — din `w.nextId`; identitatea stabila a tintei */ readonly id: Int32Array
  /** PERSISTED */ readonly kind: Uint8Array
  /** PERSISTED — celula */ readonly wx: Int32Array
  /** PERSISTED */ readonly wy: Int32Array
  /** PERSISTED */ readonly z: Int32Array
  /** PERSISTED — 1..designationPriorityLevels */ readonly prioritate: Uint8Array
  /** PERSISTED — `Piesa.NICIUNA` pentru orice desemnare care nu e de construit. */ readonly piesa: Uint8Array
  /** PERSISTED — 0 = slot liber */ readonly alive: Uint8Array
  /**
   * PERSISTED — pana la tickul asta nimeni n-o evalueaza. Se scrie DOAR pentru
   * ce e o proprietate a desemnarii insesi (n-are niciun loc de lucru), niciodata
   * pentru ce tine de un anume pion (drumul LUI e blocat) — aia e racire pe
   * pereche si sta pe agent.
   *
   * Doua roluri: opreste bucla „ia, esueaza, ia iar" (research:
   * `markTargetInfeasible`) si face ca plafonul de evaluari scumpe al scanului sa
   * se cheltuie pe candidati NOI — fara memorare, 256 de desemnari fara loc de
   * lucru in sloturile mici ar ascunde pe veci tot ce e in sloturile mari.
   * Influenteaza deciziile, deci e stare.
   */
  readonly reincercaLaTick: Int32Array
  /**
   * TRANSIENT — codul ultimului motiv (`codMotiv`) si detaliul lui, pentru
   * „De ce nu?". Nu intra in hash, nu se salveaza; dupa incarcare sunt goale
   * pana la prima scanare.
   */
  readonly ultimulMotiv: Uint8Array
  readonly ultimulMotivDetaliu: Uint8Array
  /** DERIVED — celula → slot, pentru duplicat si pentru stergerea la sapat manual. */
  readonly laCelula: Map<number, number>
  /** DERIVED — id → slot. Driverul intreaba „mai exista tinta?" la fiecare tick; liniar ar fi O(pioni × D). */
  readonly laId: Map<number, number>
  /** DERIVED — cate sunt vii. `shouldSkip` in O(1). */
  vii: number
}

export function makeDesignationStore(capacity: number): DesignationStore {
  return {
    count: 0,
    capacity,
    id: new Int32Array(capacity),
    kind: new Uint8Array(capacity),
    wx: new Int32Array(capacity),
    wy: new Int32Array(capacity),
    z: new Int32Array(capacity),
    prioritate: new Uint8Array(capacity),
    piesa: new Uint8Array(capacity),
    alive: new Uint8Array(capacity),
    reincercaLaTick: new Int32Array(capacity),
    ultimulMotiv: new Uint8Array(capacity),
    ultimulMotivDetaliu: new Uint8Array(capacity),
    laCelula: new Map(),
    laId: new Map(),
    vii: 0,
  }
}

/** Slotul unui id viu, sau -1. O citire. */
export function slotDesemnare(d: DesignationStore, id: number): number {
  const s = d.laId.get(id)
  return s === undefined ? -1 : s
}

/** Slotul desemnarii de pe o celula, sau -1. */
export function desemnareLaCelula(d: DesignationStore, wx: number, wy: number, z: number): number {
  const s = d.laCelula.get(cellKey(wx, wy, z))
  return s === undefined ? -1 : s
}

/**
 * Adauga o desemnare. Validarile de TEREN (e ceva de sapat acolo?) sunt ale
 * comenzii; aici se verifica doar ce stie storeul: duplicat si capacitate.
 * Intoarce slotul. `id` vine de la apelant, din `w.nextId`.
 */
export function adaugaDesemnare(
  d: DesignationStore,
  id: number,
  kind: DesemnareKind,
  wx: number,
  wy: number,
  z: number,
  prioritate: number,
): Outcome<number> {
  const key = cellKey(wx, wy, z)
  const existent = d.laCelula.get(key)
  if (existent !== undefined) {
    return refuse(Reason.DEJA_DESEMNATA, { id: d.id[existent]!, wx, wy, z })
  }
  let slot = -1
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 0) { slot = i; break }
  }
  if (slot === -1) {
    if (d.count >= d.capacity) return refuse(Reason.CAPACITATE_DEPASITA, { capacitate: d.capacity })
    slot = d.count
    d.count++
  }
  d.id[slot] = id
  d.kind[slot] = kind
  d.wx[slot] = wx
  d.wy[slot] = wy
  d.z[slot] = z
  d.prioritate[slot] = prioritate
  d.alive[slot] = 1
  // Slotul se REUTILIZEAZA: nimic din desemnarea moarta nu are voie sa ramana.
  // O racire mostenita ar face ca noua desemnare sa fie ignorata pana la un tick
  // pe care nu l-a trait — acelasi defect reparat la agenti pentru `nextReplanTick`.
  d.reincercaLaTick[slot] = 0
  d.ultimulMotiv[slot] = 0
  d.ultimulMotivDetaliu[slot] = 0
  // Si piesa. `hashWorld` parcurge `subarray(0, count)`, nu doar sloturile vii,
  // deci un camp ramas de la o desemnare moarta ar muta hash-ul dintr-un slot
  // pe care nimeni nu-l mai citeste.
  d.piesa[slot] = Piesa.NICIUNA
  d.laCelula.set(key, slot)
  d.laId.set(id, slot)
  d.vii++
  return accept(slot)
}

/**
 * Se va SAPA celula (wx, wy, z)?
 *
 * Nu „exista o desemnare aici" — felul conteaza. Doua locuri din `joburi.ts`
 * intreaba asta ca sa nu puna un pion sa stea pe o podea pe care altcineva
 * urmeaza s-o sape; pentru o desemnare de CONSTRUIT sensul e invers, podeaua
 * ramane si chiar se intareste.
 *
 * Nu verifica `alive`, si sora ei `desemnareLaCelula` nu o face nici ea: `laCelula`
 * contine DOAR sloturi vii — `stergeDesemnare` sterge cheia, iar
 * `reindexeazaDesemnari` sare peste cele moarte. O verificare in plus aici ar arata
 * ca o garda si n-ar apara nimic; proba ei a iesit RATATA, si asta a fost raspunsul.
 */
export function seSapaLa(d: DesignationStore, wx: number, wy: number, z: number): boolean {
  const slot = d.laCelula.get(cellKey(wx, wy, z))
  return slot !== undefined && d.kind[slot] === Desemnare.SAPA
}

/** Sterge o desemnare vie. Rezervarile de pe ea sunt treaba apelantului. */
export function stergeDesemnare(d: DesignationStore, slot: number): void {
  if (d.alive[slot] === 0) return
  d.alive[slot] = 0
  d.laCelula.delete(cellKey(d.wx[slot]!, d.wy[slot]!, d.z[slot]!))
  d.laId.delete(d.id[slot]!)
  d.vii--
}

/**
 * Reconstruieste partea DERIVED dupa incarcare. Doua desemnari vii pe aceeasi
 * celula sau cu acelasi id inseamna un save editat sau corupt: refuz, nu
 * „ultima castiga" — o desemnare ascunsa ar produce un job irosit la fiecare
 * racire, la nesfarsit, invizibil.
 */
export function reindexeazaDesemnari(d: DesignationStore): Outcome<void> {
  d.laCelula.clear()
  d.laId.clear()
  d.vii = 0
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 0) continue
    const key = cellKey(d.wx[i]!, d.wy[i]!, d.z[i]!)
    if (d.laCelula.has(key)) {
      return refuse(Reason.DEJA_DESEMNATA, { camp: 'desemnari', motiv: 'doua desemnari vii pe aceeasi celula', slot: i, wx: d.wx[i]!, wy: d.wy[i]!, z: d.z[i]! })
    }
    if (d.laId.has(d.id[i]!)) {
      return refuse(Reason.ENTITATE_INEXISTENTA, { camp: 'desemnari.id', motiv: 'duplicat', id: d.id[i]! })
    }
    d.laCelula.set(key, i)
    d.laId.set(d.id[i]!, i)
    d.vii++
  }
  return accept()
}
