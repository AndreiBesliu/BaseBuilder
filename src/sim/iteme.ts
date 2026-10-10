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
import { ONE_ALTERARE } from './state.ts'
import { cellKey } from './path.ts'
import { seSapaLa } from './desemnari.ts'
import { isWalkable, materialFast } from './regions.ts'
import { Material } from './terrain/chunk.ts'
import { rezervariPentru, Strat } from './rezervari.ts'
import { celulaDeZonaLa, marcheazaZoneMurdare, scadereaSchimbaIndexul, subSantier } from './zone.ts'

// ---------------------------------------------------------------------------
// alterarea (S24-27 t.3, research/hrana-t3.md §1) — aritmetica, o functie pe fapt
// ---------------------------------------------------------------------------

/** O unitate intreaga de alterare (definita in state.ts, ca s-o citeasca si parsarea curbei; vezi acolo). */
export { ONE_ALTERARE }

/**
 * Partea de alterare care pleaca cu `k` din `q` unitati ale unui morman (sau ale unei maini) cu alterarea `S`:
 * `floor(S·k/q)`, calculat ca `floor(S/q)·k + floor((S mod q)·k/q)` — fiecare produs ramane sub 2^53 (S < q·ONE ≤
 * 10^6·2^29), deci exact fara BigInt. Toata la `k ≥ q`, nimic la `k ≤ 0`. Sursa pastreaza `S − parte`: suma e
 * exacta, deci nicio despartire nu creeaza si nu sterge prospetime (proba de proprietate: `|parte·q − S·k| < q`,
 * `parte·q ≤ S·k`). O SINGURA functie, pentru toate caile: depunerea, luatul, mutarea, mana, zidirea.
 */
export function parteDinAlterare(S: number, q: number, k: number): number {
  if (k >= q) return S
  if (k <= 0) return 0
  return Math.floor(S / q) * k + Math.floor(((S % q) * k) / q)
}

/**
 * Nutritia EFECTIVA a `luat` unitati care au dus cu ele `parte` din alterare (decizia 3: hrana pe jumatate
 * stricata hraneste pe jumatate): `luat·nut − ceil(parte·nut/ONE)`. Cu `ceil`, mancatorul nu castiga niciodata
 * restul (STARE-11), iar fragmentarea in mormane de 1 u nu mai scapa de pierdere. Fara depasire: `ceil(parte·nut/ONE)
 * = floor(parte/ONE)·nut + ceil((parte mod ONE)·nut/ONE)`. Niciodata negativa: `parte ≤ luat·(ONE − 1)`.
 */
export function nutritieEfectiva(luat: number, parte: number, nut: number): number {
  const intregi = Math.floor(parte / ONE_ALTERARE)
  const rest = parte - intregi * ONE_ALTERARE
  return luat * nut - (intregi * nut + Math.ceil((rest * nut) / ONE_ALTERARE))
}

/**
 * Cate unitati dintr-un morman (q, S) acopera o lipsa de nutritie, pe VALOARE (t.3 §1): cel mai mic `k ≤ q` cu
 * `nutritieEfectiva(k, parteDinAlterare(S, q, k), nut) ≥ lipsa`, altfel `q`. Cu S = 0 e exact formula de dinainte,
 * `min(q, ceil(lipsa/nut))` (si aceeasi valoare ≤ 0 cand nu lipseste nimic). Nutritia efectiva creste cu `k` (pasul
 * ei e `nut − Δceil ≥ 0`, fiindca `S ≤ q·(ONE − 1)`), deci cautarea e binara, pornind de la `ceil(lipsa/nut)`.
 */
export function unitatiPentruNutritie(S: number, q: number, nut: number, lipsa: number): number {
  let lo = Math.ceil(lipsa / nut)
  if (lo >= q) return q
  if (lo <= 0 || S === 0) return lo
  let hi = q
  while (lo < hi) {
    const k = Math.floor((lo + hi) / 2)
    if (nutritieEfectiva(k, parteDinAlterare(S, q, k), nut) >= lipsa) hi = k
    else lo = k + 1
  }
  return lo
}

/** Detaliul unui refuz memorat pe item. Pentru „De ce nu?". */
export const DetaliuItem = {
  NICIUNUL: 0,
  /** Nicio zona pictata care sa primeasca felul asta. Actionabil: picteaza un depozit. */
  NICIO_ZONA: 1,
  /** Exista zone, dar niciuna n-are loc pentru cantitatea asta. Actionabil: mareste. */
  DEPOZITE_PLINE: 2,
  /** Exista loc, dar nu in componenta pionului care a intrebat. Actionabil: leaga zonele. */
  COMPONENTE_DIFERITE: 3,
  /**
   * Exista depozite, dar niciunul nu PRIMESTE felul asta (filtrul, t.3 — camara „doar hrana"). Actionabil: schimba filtrul
   * unui depozit sau picteaza unul nou. Scris de `indexZone`; ecranul il citeste din `VedereFaraDepozit.primeste`.
   */
  FEL_REFUZAT: 4,
  /**
   * Exista loc pentru felul asta, dar numai dincolo de raza destinatiei (`haulDestRadiusCells`, masurata de la morman).
   * Actionabil: picteaza un depozit mai aproape. Inainte de t.3 se scria „pline" (H4 E10: pivnita avea 7 celule libere).
   */
  PREA_DEPARTE: 5,
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
  /**
   * PERSISTED (S24-27 t.3) — alterarea IN CURS a mormanului, in 1/`ONE_ALTERARE` dintr-o unitate: un intreg exact
   * intr-un Float64Array (trece de 2^31 la `itemStackMax` mare, ramane sub 2^53). EXTENSIVA: unirea aduna, despartirea
   * da portiunii `parteDinAlterare`, sursa pastreaza restul — nicio cale nu creeaza si nu sterge prospetime.
   * Invariantul: `0 ≤ S ≤ cantitate·(ONE − 1)` pe un morman viu, 0 pe un slot mort (`stergeItem` il pune pe 0),
   * 0 pe un fel neperisabil. `encode` arunca si `decode` refuza in afara lui (`valideazaAlterarea`).
   */
  readonly alterare: Float64Array
  /**
   * TRANSIENT — partea de alterare dusa de ultimul `iaDinItem`. Citita IMEDIAT dupa apel (RIDICA o pune in mana,
   * MANANCA o scade din nutritie); n-are alt sens si nu se salveaza.
   */
  ultimaParte: number
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
    alterare: new Float64Array(capacity),
    ultimaParte: 0,
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
 *
 * `alterare` e starea pe care o aduce marfa (t.3): argument OBLIGATORIU, nu implicit — un apelant care uita sa
 * spuna de unde vine marfa ar crea prospetime din nimic, iar `tsc` il opreste. 0 doar pentru marfa noua.
 */
export function creeazaItem(s: ItemStore, id: number, kind: number, wx: number, wy: number, z: number, cantitate: number, alterare: number): Outcome<number> {
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
  // SCRISA, nu adunata: slotul mort are 0 (`stergeItem`), dar starea vine de la apelant, nu din slot.
  s.alterare[slot] = alterare
  s.ultimulMotiv[slot] = 0
  s.ultimulMotivDetaliu[slot] = 0
  s.laCelula.set(key, slot)
  s.laId.set(id, slot)
  s.vii++
  return accept(slot)
}

/**
 * Omoara un item viu, la nivel de store. Rezervarile de pe el sunt treaba apelantului.
 *
 * Alterarea slotului se pune pe 0 (t.3): un slot mort nu tine stare, iar `decode` refuza unul cu S ≠ 0. Cine
 * muta mormanul (`mutaItem`) citeste S INAINTE de apel.
 */
export function stergeItem(s: ItemStore, slot: number): void {
  if (s.alive[slot] === 0) return
  s.alive[slot] = 0
  s.alterare[slot] = 0
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
 * … pana la ±maxStepM. Trei treceri peste aceeasi ordine: intai celulele a caror
 * podea NU e o desemnare vie (mormanul de acolo ar cadea la sapat), apoi si
 * alea — un al doilea strat desemnat dinainte n-are voie sa piarda yield-ul
 * primului —, iar la urma tocul usilor (t.3: hrana din toc are temperatura partii
 * mai calde). O celula e buna daca e calcabila, nu e destinatie rezervata de
 * altcineva, si e goala sau tine acelasi fel cu loc. Se contopeste cat incape,
 * restul merge pe urmatoarea celula din ordine. Ce nu incape nicaieri se numara
 * in `ratiune.itemePierdute` (zavor per lume).
 *
 * `id` nenul: primul morman NOU creat il primeste (un morman mutat de cârlig
 * isi pastreaza identitatea daca nu se contopeste); celelalte iau din `nextId`.
 *
 * `alterare` (t.3) e starea SURSEI — mana lasata la picioare, mormanul mutat, 0 pentru marfa noua —, argument
 * obligatoriu. Fiecare portiune isi ia `parteDinAlterare(S ramas, q ramas, pune)`, scazuta din sursa abia DUPA ce
 * portiunea a intrat (`creeazaItem` poate refuza pe capacitate); S-ul unitatilor care nu incap nicaieri se numara
 * pierdut (`alterarePierduta`), alaturi de unitatile lor (`itemePierdute`, si pe fel in `pierdutePeFel`).
 */
export function asazaItem(w: World, rules: Rules, kind: number, cantitate: number, wx: number, wy: number, z: number, id: number, alterare: number): Depunere {
  let ramas = cantitate
  // Starea sursei, ramasa: `ramas` unitati cu `sursaS` alterare. Se scade portiune cu portiune, exact.
  let sursaS = alterare
  let ultimulSlot = -1
  const pas = Math.max(0, Math.min(4, rules.maxStepM))
  // Trei treceri: a TREIA e tocul usilor (t.3 §2, STARE-5) — marfa ajunge pe celula unei usi doar daca nu e alt loc. Nu
  // e interzisa: cu laturile ocupate, interdictia pierdea marfa (un pion ucis in toc cu 50 de HRANA: +50 pierdute). Un
  // morman ramas in toc are temperatura partii mai calde (`tTocului`), regula care ramane oricum, fiindca o usa se
  // zideste si PESTE un morman.
  for (let trecere = 0; trecere < 3 && ramas > 0; trecere++) {
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
          // propria lui marfa. Nici SUB un santier (un buiandrug la z+1): `celulaLibera` il
          // refuza si la cap — aceeasi intrebare ca indexul de zone si `lasa` (recenzia
          // incaperilor, USA-5: „o functie, un adevar").
          if (subSantier(w, rules, nx, ny, zs)) continue
          const toc = materialFast(w.terrain, nx, ny, zs) === Material.USA
          if (trecere === 2 ? !toc : toc) continue
          if (trecere === 0 && podeaDesemnata) continue
          if (trecere === 1 && !podeaDesemnata) continue
          const loc = locPeCelula(w, rules, kind, nx, ny, zs)
          if (loc <= 0) continue
          if (!isWalkable(w.terrain, nx, ny, zs, rules)) continue
          if (rezervataCaDestinatie(w, nx, ny, zs)) continue
          const pune = Math.min(loc, ramas)
          const parte = parteDinAlterare(sursaS, ramas, pune)
          const it = itemLaCelula(w.iteme, nx, ny, zs)
          if (it !== -1) {
            w.iteme.cantitate[it] = w.iteme.cantitate[it]! + pune
            w.iteme.alterare[it] = w.iteme.alterare[it]! + parte
            ultimulSlot = it
          } else {
            const idNou = id !== 0 ? id : w.nextId
            const out = creeazaItem(w.iteme, idNou, kind, nx, ny, zs, pune, parte)
            if (!out.ok) continue // capacitate: se incearca contopirea in alta parte
            if (id !== 0) id = 0
            else w.nextId++
            ultimulSlot = out.value
          }
          ramas -= pune
          sursaS -= parte
          marcheazaZoneMurdare(w)
        }
      }
    }
  }
  if (ramas > 0) w.ratiune.itemePierdute += ramas
  if (ramas > 0) numaraPierdute(w, kind, ramas, sursaS)
  return { pus: cantitate - ramas, ultimulSlot }
}

/**
 * Unitati care n-au incaput nicaieri (sau mana unui mort la incarcare): pe fel, si S-ul lor. Contoarele sunt ale
 * oracolelor G1 (unitati pe fel) si G1S (S); `itemePierdute`, zavorul tuturor felurilor, il trage apelantul.
 */
export function numaraPierdute(w: World, kind: number, cantitate: number, alterare: number): void {
  w.ratiune.pierdutePeFel[kind] = w.ratiune.pierdutePeFel[kind]! + cantitate
  w.ratiune.alterarePierduta += alterare
}

/**
 * Ia `cantitate` din mormanul `slot`. Daca ramane gol, moare. Intoarce cat s-a
 * luat. Rezervarile de pe un morman mort sunt treaba apelantului.
 *
 * Alterarea (t.3): unitatile luate duc cu ele `parteDinAlterare(S, q, luat)` (toata, la `luat = q`), lasata in
 * `ultimaParte` pentru apelant; mormanul pastreaza restul.
 */
export function iaDinItem(w: World, rules: Rules, slot: number, cantitate: number): number {
  const s = w.iteme
  const luat = Math.min(cantitate, s.cantitate[slot]!)
  const parte = parteDinAlterare(s.alterare[slot]!, s.cantitate[slot]!, luat)
  s.alterare[slot] = s.alterare[slot]! - parte
  s.ultimaParte = parte
  scadeDinMorman(w, rules, slot, luat)
  return luat
}

/**
 * Realizarea alterarii (t.3 §1): `k` unitati intregi stricate pleaca din morman cu EXACT `k·ONE` din S — nu cu
 * regula de despartire a lui `iaDinItem`, care, luata literal, lasa S ≥ ONE si strica o unitate la aproape fiecare
 * pas (de 26 de ori mai repede: STARE-4). `k = min(q, floor(S/ONE))`; un `k` mai mare se taie acolo, deci S nu
 * ajunge niciodata negativ. Unitatile se numara in `w.hranaStricata`; daca mormanul moare, restul lui de S iese
 * numarat (`alterareDisparuta`). Imparte cu `iaDinItem` DOAR contabilitatea mortii (`scadeDinMorman`);
 * `reconciliazaTintaMoarta` e a apelantului, ca la `iaDinItem`. Intoarce cantitatea ramasa (0 = mort).
 *
 * Indexul de zone, pe un morman care SUPRAVIETUIESTE: se murdareste doar daca s-ar schimba (predicatul exact
 * `scadereaSchimbaIndexul`, verif-P3). Regula lui `iaDinItem` („orice unitate pe o celula de zona") e corecta, dar intr-un
 * depozit cald cu mormane desincronizate o unitate se strica in 599 de pasi din 600: 112–130 de pasi de index pe tick, de
 * 4 ori peste pragul care leaga azi (30); predicatul exact da 0–4,1, cu 0 pasi invechiti in 11.400.
 */
export function scadeStricate(w: World, rules: Rules, slot: number, k: number): number {
  const s = w.iteme
  const q = s.cantitate[slot]!
  const n = Math.min(k, q, Math.floor(s.alterare[slot]! / ONE_ALTERARE))
  if (n <= 0) return q
  s.alterare[slot] = s.alterare[slot]! - n * ONE_ALTERARE
  w.hranaStricata += n
  if (n === q) {
    w.ratiune.alterareDisparuta += s.alterare[slot]!
    s.alterare[slot] = 0
    scadeDinMorman(w, rules, slot, n)
    return 0
  }
  // Evaluat INAINTE de scadere, pe indexul de dinainte (curat = la zi cu lumea de dinainte).
  const schimba = scadereaSchimbaIndexul(w, rules, slot, q, q - n)
  s.cantitate[slot] = q - n
  if (schimba) marcheazaZoneMurdare(w)
  return q - n
}

/**
 * Contabilitatea de STORE a unei scaderi din morman, comuna lui `iaDinItem` si `scadeStricate`: cantitatea,
 * moartea (`stergeItem`) si murdarirea indexului de zone. Alterarea e a apelantului. `scadeStricate` o cheama doar la
 * moarte: pe un morman care supravietuieste stricaciunii, indexul are predicatul exact (`scadereaSchimbaIndexul`).
 */
function scadeDinMorman(w: World, rules: Rules, slot: number, luat: number): void {
  const s = w.iteme
  const inainte = s.cantitate[slot]!
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
}
