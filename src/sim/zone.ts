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
import { Desemnare, desemnareLaCelula } from './desemnari.ts'
import { DEFAULT_RULES } from './content.ts'
import { blocheazaMersul } from './terrain/chunk.ts'

/**
 * Sta celula (wx, wy, z) sub un santier de CONSTRUIT viu — la cota ei sau in headroom-ul de
 * deasupra (z+1 .. z+H−1)? Atunci un morman pus aici ar opri zidirea: `celulaLibera` il refuza la
 * picioare si la cap. Recenzia incaperilor (USA-5): un depozit pictat peste amprenta unei
 * constructii primea marfa pe santier, iar constructorul astepta cu piatra in mana pana pleca din
 * asezare — 4/4 pioni plecati pe un zid de 7×2. O singura intrebare, citita de indexul de zone
 * (celula nu se ofera ca destinatie), de `lasa` (carausul prins pe drum), de `asazaItem` si de
 * vederea UI-ului.
 *
 * Doar santierele pieselor care BLOCHEAZA mersul: `celulaLibera` se cere numai pentru ele (USA-1), deci
 * un morman in tocul unei usi, sub usa de sus desemnata, nu opreste nimic — si o usa de jos zidita
 * trebuie sa-l poata primi (designul: itemele pot sta pe usa).
 */
export function subSantier(w: World, rules: Rules, wx: number, wy: number, z: number): boolean {
  for (let h = 0; h < rules.agentHeadroomM; h++) {
    const ds = desemnareLaCelula(w.desemnari, wx, wy, z + h)
    if (ds !== -1 && santierBlocant(w, rules, ds)) return true
  }
  return false
}

/** Desemnarea `ds` e un santier de CONSTRUIT al unei piese care blocheaza mersul (nu o usa)? */
function santierBlocant(w: World, rules: Rules, ds: number): boolean {
  const d = w.desemnari
  if (d.kind[ds] !== Desemnare.CONSTRUIESTE) return false
  const spec = rules.piese[d.piesa[ds]!]
  return spec !== undefined && blocheazaMersul(spec.material)
}

/**
 * Felurile de zona.
 *
 * Felul nu e decor: pana la taietura 3 nimic din index nu-l citea, iar panoul a
 * aratat ce s-ar fi intamplat la al DOILEA fel — dormitorul ar fi devenit
 * automat depozit. Carausii ar fi umplut paturile, `maxPrioLibera` ar fi ramas
 * sus (deci fiecare morman de pe jos ar fi ramas candidat la evaluare scumpa pe
 * veci — K05 pe usa din dos), iar un morman cazut in dormitor n-ar mai fi iesit
 * niciodata, fiindca `prioritateaLocului` i-ar fi dat prioritatea dormitorului.
 */
export const Zona = {
  DEPOZIT: 0,
  DORMIT: 1,
} as const
export type ZonaKind = (typeof Zona)[keyof typeof Zona]
export const ZONE_FELURI = 2

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
  /**
   * `slotZona * ITEME + fel`: cel mai mare loc liber de pe o celula a zonei,
   * pentru felul asta. Poarta ieftina intreaba „incape CAT car?", nu doar „e
   * loc?": un depozit cu 400 de celule la 74/75 trecea poarta si trimitea la
   * evaluare scumpa candidati care picau mereu, furand plafonul de la sapat.
   */
  maxLocLiber: Int32Array
  /** Per fel: prioritatea maxima a unei zone cu cel putin o celula acceptanta; 0 = niciuna. */
  readonly maxPrioLibera: Int32Array
  /**
   * Sloturile zonelor de DEPOZIT vii, in ordinea (prioritate desc, id asc).
   *
   * Numai DEPOZIT: lista asta e ordinea in care se cauta o destinatie de carat,
   * si un dormitor n-are ce cauta in ea. Vezi `Zona`.
   */
  readonly depoziteOrdonate: number[]
  /** Sloturile celulelor libere (nerezervate, fara pion pe ele) din zonele de DORMIT, in ordinea slotului. */
  readonly paturiLibere: number[]
  /** Sloturile itemelor care AU unde sa fie mutate (o zona strict mai buna decat locul lor), in ordinea slotului. */
  readonly deMutat: number[]
  /**
   * Sloturile mormanelor COMESTIBILE (`nutritie[fel] > 0`), in ordinea slotului.
   *
   * Sta aici, si nu intr-o structura proprie, ca sa mosteneasca exact garantia
   * lui `deMutat`: orice item care apare sau dispare murdareste deja indexul
   * (`asazaItem` si `iaDinItem` o fac), deci lista nu poate ramane stale fara ca
   * `deMutat` sa ramana si el. O a doua structura ar fi insemnat a doua lista de
   * locuri potrivite de tinut minte — exact ce a costat la taietura 2.
   *
   * Fara ea, fiecare cautare de mancare ar fi O(toate mormanele): cu 3000 de
   * mormane de piatra si unul de hrana, un pion flamand ar plati 3000 de pasi ca
   * sa gaseasca singura masa din asezare.
   */
  readonly comestibile: number[]
  /**
   * Sloturile mormanelor VII, pe fel, in ordinea slotului — inclusiv cele din
   * depozite. Sonda de material si a doua sursa parcurg doar felul cerut de piesa:
   * in scenariul standard majoritatea mormanelor sunt PAMANT, iar un perete cere
   * PIATRA. Aceeasi garantie ca `deMutat`: orice item care apare sau dispare
   * murdareste indexul.
   */
  readonly peFel: number[][]
  /** Cate iteme zac pe jos (nu intr-o zona) fara nicio zona care sa le primeasca. Pentru cauza pe pion. */
  peJosFaraDepozit: number
  /** Cate reconstructii s-au facut de la pornire. Pentru masuratori. */
  reconstructii: number
  /**
   * Cati PASI au costat reconstructiile de la pornire: o celula de zona sau un
   * slot de item atins = un pas. Numarul de reconstructii nu spune nimic despre
   * cost — o reconstructie peste 3000 de mormane costa de 60 de ori cat una peste
   * 50. Masurat: ~57 ns/celula si ~38 ns/morman, deci la tinta din DESIGN §10
   * (3000 de stive, 4096 de celule) o reconstructie e ~380 µs. Garda din
   * acceptanta se uita la pasi/tick; cand cifra din joc va cere, indexul devine
   * incremental (si atunci „DERIVED care poate ramane stale" trebuie re-probat).
   */
  pasi: number
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
      peFel: Array.from({ length: ITEME }, () => [] as number[]),
      libere: [],
      acceptante: new Int32Array(capacity * ITEME),
      maxLocLiber: new Int32Array(capacity * ITEME),
      maxPrioLibera: new Int32Array(ITEME),
      depoziteOrdonate: [],
      paturiLibere: [],
      deMutat: [],
      comestibile: [],
      peJosFaraDepozit: 0,
      reconstructii: 0,
      pasi: 0,
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

/**
 * Prioritatea DEPOZITULUI in care sta celula (wx, wy, z), sau 0.
 *
 * 0 si pentru o celula dintr-o zona de alt fel: „cat de bine e asezata marfa
 * aici" are sens doar intr-un depozit. Fara clauza asta, un morman cazut intr-un
 * dormitor ar mosteni prioritatea dormitorului, si cum scannerul cere o zona
 * STRICT mai buna decat locul, n-ar mai fi luat de acolo niciodata.
 */
export function prioritateaLocului(s: ZoneStore, wx: number, wy: number, z: number): number {
  const cs = celulaDeZonaLa(s, wx, wy, z)
  if (cs === -1) return 0
  const zs = slotZona(s, s.celule.zonaId[cs]!)
  if (zs === -1 || s.kind[zs] !== Zona.DEPOZIT) return 0
  return s.prioritate[zs]!
}

/**
 * Care mormane zac FARA un depozit care sa le primeasca — pentru UI (inspector, alerta, Planul).
 * O singura functie, ca sa nu spuna trei locuri trei lucruri (recenzia UI-ului, MOD-1: alerta cerea
 * o racire pe care `indexZone` nu o scrie, iar inspectorul promitea un caraus care nu venea).
 *
 * CITIRE PURA: nu reconstruieste indexul (`indexZone` scrie, iar UI-ul n-are voie). Cu indexul la
 * zi, raspunsul e al lui: pe jos (`prioritateaLocului` 0) si nu in `deMutat`. Cu indexul murdar
 * (intre o schimbare si urmatoarea citire a sim-ului; masurat: continuu cat se cara dupa ce se
 * picteaza un depozit), doua reguli, masurate de verificator pe patru scenarii fara clipire si fara
 * fals pozitiv: o celula de DEPOZIT goala si nerezervata primeste orice drum (`haulCarryMax <=
 * itemStackMax`), deci atunci niciun morman nu e fara depozit; altfel ramane cauza scrisa de sim
 * pe morman la ultima reconstructie. O celula de sub un santier viu (`subSantier`) nu se numara:
 * nici indexul nu o ofera.
 *
 * `rules` da headroom-ul pentru `subSantier`. Implicit `DEFAULT_RULES`, fiindca apelantii din
 * viewer (model.ts, overlay-joburi.ts) nu-l trec inca; au `rules` la indemana si ar trebui sa-l dea.
 */
export interface VedereFaraDepozit {
  /** Cate zone de DEPOZIT vii exista (0 ⇒ „niciun depozit", altfel „nu incap"). Dormitoarele nu conteaza. */
  readonly depozite: number
  esteFaraDepozit(item: number): boolean
}

export function vedereFaraDepozit(w: World, rules: Rules = DEFAULT_RULES): VedereFaraDepozit {
  const s = w.zone
  const ix = s.index
  const it = w.iteme
  let depozite = 0
  for (let i = 0; i < s.count; i++) if (s.alive[i] === 1 && s.kind[i] === Zona.DEPOZIT) depozite++
  const deMutat = ix.murdar ? null : new Set(ix.deMutat)
  let celulaGoala = false
  if (ix.murdar) {
    const c = s.celule
    for (let cs = 0; cs < c.count && !celulaGoala; cs++) {
      if (c.alive[cs] === 0) continue
      const zs = slotZona(s, c.zonaId[cs]!)
      if (zs === -1 || s.kind[zs] !== Zona.DEPOZIT) continue
      if (it.laCelula.has(cellKey(c.wx[cs]!, c.wy[cs]!, c.z[cs]!))) continue
      if (rezervariPentru(w.rezervari, c.id[cs]!, Strat.LUCRU).length > 0) continue
      // Aceeasi regula ca indexul: o celula de sub un santier viu nu primeste nimic (USA-5). Fara ea,
      // cu indexul murdar, vederea spunea „are depozit" exact cand simularea spunea FARA_DEPOZIT.
      if (subSantier(w, rules, c.wx[cs]!, c.wy[cs]!, c.z[cs]!)) continue
      celulaGoala = true
    }
  }
  return {
    depozite,
    esteFaraDepozit(i) {
      if (it.alive[i] !== 1) return false
      if (prioritateaLocului(s, it.wx[i]!, it.wy[i]!, it.z[i]!) !== 0) return false
      if (rezervariPentru(w.rezervari, it.id[i]!, Strat.CARAT).length > 0) return false
      if (deMutat !== null) return !deMutat.has(i)
      return !celulaGoala && it.ultimulMotiv[i] === codMotiv(Reason.FARA_DEPOZIT)
    },
  }
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
    // Un fel necunoscut e un save dintr-o versiune mai noua. Se REFUZA: tacut,
    // ar cadea pe ramura „nu e depozit" si dormitorul lui ar deveni inert.
    const f = s.kind[i]!
    if (f >= ZONE_FELURI) return refuse(Reason.VALOARE_INVALIDA, { camp: `zone.kind[${i}]`, valoare: f, min: 0, max: ZONE_FELURI - 1 })
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
/** Exista o zona strict mai buna decat `prioLoc` cu loc pentru `cant` din felul `kind`? */
function incapeUndeva(s: ZoneStore, ix: IndexZone, kind: number, cant: number, prioLoc: number): boolean {
  for (const zs of ix.depoziteOrdonate) {
    if (s.prioritate[zs]! <= prioLoc) return false
    if (ix.maxLocLiber[zs * ITEME + kind]! >= cant) return true
  }
  return false
}

/** TRANSIENT, scratch al lui `indexZone`: 1 = celula de zona (pe slot) de sub un santier viu. Rescris la fiecare reconstructie. */
let subSantierScratch = new Uint8Array(0)

export function indexZone(w: World, rules: Rules): IndexZone {
  const s = w.zone
  const ix = s.index
  if (!ix.murdar) return ix
  ix.murdar = false
  ix.reconstructii++

  // Depozitele vii, ordonate. Ordine TOTALA pe date persistate (prioritate, id).
  ix.depoziteOrdonate.length = 0
  for (let i = 0; i < s.count; i++) if (s.alive[i] === 1 && s.kind[i] === Zona.DEPOZIT) ix.depoziteOrdonate.push(i)
  ix.depoziteOrdonate.sort((a, b) => s.prioritate[b]! - s.prioritate[a]! || s.id[a]! - s.id[b]!)

  if (ix.acceptante.length < s.count * ITEME) ix.acceptante = new Int32Array(s.capacity * ITEME)
  if (ix.maxLocLiber.length < s.count * ITEME) ix.maxLocLiber = new Int32Array(s.capacity * ITEME)
  ix.acceptante.fill(0)
  ix.maxLocLiber.fill(0)
  ix.maxPrioLibera.fill(0)
  for (let i = 0; i < s.count; i++) {
    if (!ix.libere[i]) ix.libere[i] = []
    else ix.libere[i]!.length = 0
  }

  const c = s.celule
  const it = w.iteme
  ix.paturiLibere.length = 0
  // Celulele de zona de sub un santier de CONSTRUIT viu (`subSantier`), calculate INVERSAT: se
  // parcurg desemnarile, nu celulele de zona — O(desemnari × headroom). Masurat de verificatorul
  // USA-5 la 4096 de celule, 3000 de mormane si 2500 de desemnari: 438–506 µs pe reconstructie, in
  // zgomot; varianta cu `subSantier` pe fiecare celula costa +45–55%. Indexul citeste acum si
  // desemnarile, deci `desemneaza` (CONSTRUIESTE) si `anuleazaDesemnare` il murdaresc.
  if (subSantierScratch.length < c.capacity) subSantierScratch = new Uint8Array(c.capacity)
  else subSantierScratch.fill(0, 0, c.count)
  const d = w.desemnari
  for (let ds = 0; ds < d.count; ds++) {
    if (d.alive[ds] === 0 || !santierBlocant(w, rules, ds)) continue
    for (let h = 0; h < rules.agentHeadroomM; h++) {
      const cz = celulaDeZonaLa(s, d.wx[ds]!, d.wy[ds]!, d.z[ds]! - h)
      if (cz !== -1) subSantierScratch[cz] = 1
    }
  }
  for (let cs = 0; cs < c.count; cs++) {
    ix.pasi++
    if (c.alive[cs] === 0) continue
    const zs = slotZona(s, c.zonaId[cs]!)
    if (zs === -1) continue
    if (rezervariPentru(w.rezervari, c.id[cs]!, Strat.LUCRU).length > 0) continue
    // Felul zonei alege lista. O celula de dormit nu e loc de depozitare: daca
    // ar cadea in `libere`/`acceptante`, carausii ar umple paturile.
    if (s.kind[zs] !== Zona.DEPOZIT) {
      if (s.kind[zs] === Zona.DORMIT) ix.paturiLibere.push(cs)
      continue
    }
    // O celula de depozit de sub un santier viu nu e destinatie: marfa de acolo ar opri zidirea.
    if (subSantierScratch[cs] === 1) continue
    const item = it.laCelula.get(cellKey(c.wx[cs]!, c.wy[cs]!, c.z[cs]!))
    if (item === undefined) {
      ix.libere[zs]!.push(cs)
      for (let k = 0; k < ITEME; k++) {
        ix.acceptante[zs * ITEME + k]!++
        if (rules.itemStackMax > ix.maxLocLiber[zs * ITEME + k]!) ix.maxLocLiber[zs * ITEME + k] = rules.itemStackMax
      }
    } else if (it.cantitate[item]! < rules.itemStackMax) {
      const k = it.kind[item]!
      const loc = rules.itemStackMax - it.cantitate[item]!
      ix.libere[zs]!.push(cs)
      ix.acceptante[zs * ITEME + k]!++
      if (loc > ix.maxLocLiber[zs * ITEME + k]!) ix.maxLocLiber[zs * ITEME + k] = loc
    }
  }
  for (const zs of ix.depoziteOrdonate) {
    for (let k = 0; k < ITEME; k++) {
      if (ix.acceptante[zs * ITEME + k]! > 0 && s.prioritate[zs]! > ix.maxPrioLibera[k]!) ix.maxPrioLibera[k] = s.prioritate[zs]!
    }
  }

  ix.deMutat.length = 0
  ix.comestibile.length = 0
  for (const lista of ix.peFel) lista.length = 0
  ix.peJosFaraDepozit = 0
  for (let i = 0; i < it.count; i++) {
    ix.pasi++
    if (it.alive[i] === 0) continue
    ix.peFel[it.kind[i]!]!.push(i)
    // Comestibilele, in aceeasi trecere: lista mosteneste exact garantia lui
    // `deMutat`, fara sa ceara un al doilea loc de tinut minte.
    if (rules.nutritie[it.kind[i]!]! > 0) ix.comestibile.push(i)
    const prioLoc = prioritateaLocului(s, it.wx[i]!, it.wy[i]!, it.z[i]!)
    const cant = Math.min(it.cantitate[i]!, rules.haulCarryMax)
    if (ix.maxPrioLibera[it.kind[i]!]! > prioLoc && incapeUndeva(s, ix, it.kind[i]!, cant, prioLoc)) {
      ix.deMutat.push(i)
    } else if (prioLoc === 0) {
      // Pe jos si n-are unde. Cauza e TRANSIENT si se scrie aici, ca sa fie
      // vizibila fara ca vreun pion sa plateasca o evaluare pentru ea.
      ix.peJosFaraDepozit++
      it.ultimulMotiv[i] = codMotiv(Reason.FARA_DEPOZIT)
      // „Nicio zona" inseamna niciun DEPOZIT: cu un dormitor pictat si zero
      // depozite, cauza corecta ramane „n-ai unde pune", nu „depozitele sunt pline".
      it.ultimulMotivDetaliu[i] = ix.depoziteOrdonate.length === 0 ? DetaliuItem.NICIO_ZONA : DetaliuItem.DEPOZITE_PLINE
    }
  }
  return ix
}
