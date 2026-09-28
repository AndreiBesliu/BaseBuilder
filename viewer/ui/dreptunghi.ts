/**
 * Uneltele-dreptunghi — PUR: ce comenzi da un dreptunghi tras cu o unealta.
 *
 * Registrul S20-23 avea „linie/dreptunghi" deschis; DESIGN §9 regula 6: „fiecare unealta fara
 * echivalent de masa devine click click click". Lumea se intreaba prin functii, ca in
 * viewer/tinta.ts, ca testele sa poata construi scene fara teren.
 *
 * ## Pe ce cota (panoul de design, I3 / JN-4)
 *
 * v1 fixa cota celulei de start si lua planul orizontal al ei. Pe locul de start — o panta de
 * ~27 m pe 40 m — un depozit iesea o fasie de 13 din 100 de celule, iar o sapatura lasa celule
 * ingropate sau dadea in aer, dupa colt. Acum:
 *  - **nivelul pornit** (slice): nivelul ACTIV, in toata cutia. Sapa = solidele de la zActiv, plus
 *    cat mai trebuie deasupra ca sa treaca un om (`inaltimeOm`, dezactivabil cu „Un strat");
 *    Construieste = aerul de la zActiv; Zone = celulele calcabile de la zActiv. Asa se face o
 *    pivnita, un tunel, un etaj;
 *  - **nivelul oprit**: SOLUL, pe fiecare coloana. Sapa = solidul de sus al coloanei; Construieste =
 *    celula de aer de deasupra lui; Zone = aceeasi celula, cand e calcabila.
 * Coltul al doilea e coloana pe care o arata cubul alb sub cursor (aceeasi functie de tinta), nu
 * intersectia cu un plan: pe panta, planul punea coltul pana la 14 celule de cursor.
 */

import type { Command } from '../../src/sim/commands.ts'
import { Piesa } from '../../src/sim/state.ts'
import { cant } from './texte.ts'

export const Unealta = {
  SELECTEAZA: 0,
  SAPA: 1,
  CONSTRUIESTE: 2,
  ANULEAZA: 3,
  ZONA: 4,
  STERGE_ZONA: 5,
} as const
export type UnealtaId = (typeof Unealta)[keyof typeof Unealta]

export interface Dreptunghi {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/** Colturile in orice ordine → dreptunghiul cu x0 <= x1, y0 <= y1. */
export function normalizeaza(ax: number, ay: number, bx: number, by: number): Dreptunghi {
  return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) }
}

export function latime(d: Dreptunghi): number { return d.x1 - d.x0 + 1 }
export function inaltime(d: Dreptunghi): number { return d.y1 - d.y0 + 1 }
export function arie(d: Dreptunghi): number { return latime(d) * inaltime(d) }

/**
 * Coloanele dreptunghiului, rand cu rand, FARA dubluri. `contur` = doar marginea: pe o latura de 1,
 * conturul e tot dreptunghiul, iar numarul e w·h − max(0, w−2)·max(0, h−2), nu 2(w+h)−4 (formula
 * aia numara de doua ori zidul drept: panoul, T4).
 */
export function coloane(d: Dreptunghi, contur: boolean): { wx: number; wy: number }[] {
  const out: { wx: number; wy: number }[] = []
  for (let y = d.y0; y <= d.y1; y++) {
    for (let x = d.x0; x <= d.x1; x++) {
      if (contur && x !== d.x0 && x !== d.x1 && y !== d.y0 && y !== d.y1) continue
      out.push({ wx: x, wy: y })
    }
  }
  return out
}

/** Ce stie planul despre lume. */
export interface Lumea {
  solid(wx: number, wy: number, z: number): boolean
  /** Cota solidului de sus al coloanei, sau null (in afara lumii). */
  suprafata(wx: number, wy: number): number | null
  /** Se poate sta in celula (podea dedesubt, loc de cap)? Ca `picteazaZona`, care sare restul. */
  calcabil(wx: number, wy: number, z: number): boolean
  /** Id-ul desemnarii vii din celula, sau -1. */
  desemnare(wx: number, wy: number, z: number): number
  /** Celula e deja intr-o zona? */
  inZona(wx: number, wy: number, z: number): boolean
  /** Desemnarile vii cu (x, y) in dreptunghi si z <= zMax. */
  desemnariIn(d: Dreptunghi, zMax: number): readonly { id: number; wx: number; wy: number; z: number }[]
  /** Zonele cu macar o celula in dreptunghi la z <= zMax: id-ul si cate celule are zona IN TOTAL. */
  zoneIn(d: Dreptunghi, zMax: number): readonly { id: number; celule: number; celuleInDreptunghi: number }[]
  /**
   * Usa: celulele golului (sau ale gaurii din placa) care contine celula, in lumea planului; null = nu e
   * un gol de usa. Fara ea, piesa Usa nu se pune cu dreptunghiul.
   */
  celuleUsii?(wx: number, wy: number, z: number): readonly { x: number; y: number; z: number }[] | null
}

export interface Optiuni {
  readonly unealta: UnealtaId
  /** `Piesa`, pentru Construieste. */
  readonly piesa: number
  /** `Zona`, pentru Zone. */
  readonly zonaFel: number
  /** Doar marginea (zidurile). */
  readonly contur: boolean
  /** Sapa doar nivelul, fara locul de cap. */
  readonly unStrat: boolean
  /** Prioritatea desemnarilor noi (1..designationPriorityLevels). */
  readonly prioritate: number
  /** Nivelul activ (slice pornit), sau null = urmeaza solul. */
  readonly zActiv: number | null
  /** `agentHeadroomM`: cat de inalta e o sapatura prin care trece un om. */
  readonly inaltimeOm: number
  /** Cate desemnari mai incap (`designationCapacity − vii`). */
  readonly locDesemnari: number
  /** Cate celule de zona mai incap (`zoneCellCapacity − celule vii`). */
  readonly locZone: number
}

/** O bucata de zona: un rand (sau un dreptunghi) la o cota. Prima creeaza zona, restul o extind. */
export interface BucataZona {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly z: number
}

export interface PlanDreptunghi {
  /** Desemnari, retrageri, stergeri de zona — in ordine. */
  readonly comenzi: readonly Command[]
  /** Pentru Zone: bucatile, in ordine; aplicatorul leaga `zonaId` de la prima. */
  readonly zone: readonly BucataZona[]
  /** Celulele care VOR primi comanda (fantomele previzualizarii). */
  readonly celule: readonly { wx: number; wy: number; z: number }[]
  /** Pe cate cote diferite. */
  readonly niveluri: number
  readonly sarite: { readonly deja: number; readonly nepotrivite: number }
  /** Pentru Sterge zona: cate celule se sterg IN AFARA dreptunghiului (zonele se sterg intregi). */
  readonly celuleInAfara: number
  /** Nu se aplica deloc: motivul pentru jucator. */
  readonly refuz: string | null
  /** Planul pune usi (textul „sarite" spune altceva). */
  readonly usa?: boolean
}

export function planDreptunghi(d: Dreptunghi, o: Optiuni, lumea: Lumea): PlanDreptunghi {
  const comenzi: Command[] = []
  const zone: BucataZona[] = []
  const celule: { wx: number; wy: number; z: number }[] = []
  const cote = new Set<number>()
  let deja = 0
  let nepotrivite = 0
  let celuleInAfara = 0
  const zMax = o.zActiv ?? Infinity

  if (o.unealta === Unealta.SAPA || o.unealta === Unealta.CONSTRUIESTE) {
    const construieste = o.unealta === Unealta.CONSTRUIESTE
    if (construieste && o.piesa === Piesa.USA) {
      // Usa: pe fiecare coloana a dreptunghiului, golul intreg care o contine (o jumatate de usa lasa
      // incaperea deschisa — panoul camerelor, JUC-6), fara dubluri; o coloana fara gol e „nepotrivita".
      const puse = new Set<string>()
      for (const c of coloane(d, false)) {
        const u = o.zActiv !== null ? (lumea.celuleUsii?.(c.wx, c.wy, o.zActiv) ?? null) : golulColoanei(lumea, c.wx, c.wy)
        if (u === null) { nepotrivite++; continue }
        for (const g of u) {
          const k = `${g.x},${g.y},${g.z}`
          if (puse.has(k)) continue
          puse.add(k)
          if (lumea.desemnare(g.x, g.y, g.z) !== -1) { deja++; continue }
          comenzi.push({ kind: 'desemneaza', wx: g.x, wy: g.y, z: g.z, prioritate: o.prioritate, piesa: Piesa.USA })
          celule.push({ wx: g.x, wy: g.y, z: g.z })
          cote.add(g.z)
        }
      }
    } else for (const c of coloane(d, construieste && o.contur)) {
      let zs: number[]
      if (o.zActiv !== null) {
        zs = [o.zActiv]
        if (!construieste && !o.unStrat) for (let h = 1; h < o.inaltimeOm; h++) zs.push(o.zActiv + h)
      } else {
        const s = lumea.suprafata(c.wx, c.wy)
        if (s === null) { nepotrivite++; continue }
        zs = [construieste ? s + 1 : s]
      }
      for (const z of zs) {
        if (lumea.desemnare(c.wx, c.wy, z) !== -1) { deja++; continue }
        if (lumea.solid(c.wx, c.wy, z) === construieste) { nepotrivite++; continue }
        comenzi.push(construieste
          ? { kind: 'desemneaza', wx: c.wx, wy: c.wy, z, prioritate: o.prioritate, piesa: o.piesa }
          : { kind: 'desemneaza', wx: c.wx, wy: c.wy, z, prioritate: o.prioritate })
        celule.push({ wx: c.wx, wy: c.wy, z })
        cote.add(z)
      }
    }
    if (comenzi.length > o.locDesemnari) {
      return { comenzi: [], zone: [], celule, niveluri: cote.size, sarite: { deja, nepotrivite }, celuleInAfara: 0, refuz: `Prea multe: ${comenzi.length} lucrări noi, mai încap ${Math.max(0, o.locDesemnari)}.` }
    }
  } else if (o.unealta === Unealta.ANULEAZA) {
    for (const x of lumea.desemnariIn(d, zMax)) {
      comenzi.push({ kind: 'anuleazaDesemnarea', id: x.id })
      celule.push({ wx: x.wx, wy: x.wy, z: x.z })
      cote.add(x.z)
    }
  } else if (o.unealta === Unealta.ZONA) {
    // Pe randuri: o bucata = o fuga de coloane consecutive cu aceeasi cota. Exact celulele numarate,
    // nu un dreptunghi de incadrare pe cota (acela ar fi prins si celule de pestera de la aceeasi cota).
    for (let y = d.y0; y <= d.y1; y++) {
      let start = -1
      let zStart = 0
      const inchide = (xFinal: number) => { if (start >= 0) zone.push({ x0: start, y0: y, x1: xFinal, y1: y, z: zStart }); start = -1 }
      for (let x = d.x0; x <= d.x1; x++) {
        let z: number | null
        if (o.zActiv !== null) z = o.zActiv
        else { const s = lumea.suprafata(x, y); z = s === null ? null : s + 1 }
        const bun = z !== null && lumea.calcabil(x, y, z) && !lumea.inZona(x, y, z)
        if (z !== null && lumea.calcabil(x, y, z) && lumea.inZona(x, y, z)) deja++
        else if (!bun) nepotrivite++
        if (!bun || (start >= 0 && z !== zStart)) inchide(x - 1)
        if (bun && start < 0) { start = x; zStart = z! }
        if (bun) { celule.push({ wx: x, wy: y, z: z! }); cote.add(z!) }
      }
      inchide(d.x1)
    }
    if (celule.length > o.locZone) {
      return { comenzi: [], zone: [], celule, niveluri: cote.size, sarite: { deja, nepotrivite }, celuleInAfara: 0, refuz: `Prea multe: ${celule.length} celule de zonă, mai încap ${Math.max(0, o.locZone)}.` }
    }
  } else if (o.unealta === Unealta.STERGE_ZONA) {
    for (const z of lumea.zoneIn(d, zMax)) {
      comenzi.push({ kind: 'stergeZona', id: z.id })
      celuleInAfara += z.celule - z.celuleInDreptunghi
    }
  }
  return { comenzi, zone, celule, niveluri: cote.size, sarite: { deja, nepotrivite }, celuleInAfara, refuz: null, usa: o.unealta === Unealta.CONSTRUIESTE && o.piesa === Piesa.USA }
}

/** Cat coboara dreptunghiul Usa, fara nivel, printr-un acoperis (sau un buiandrug) ca sa ajunga la gol. */
export const ACOPERIS_MAX_USA = 4

/**
 * Golul de usa de pe coloana, fara nivel: pe SUPRAFATA (aerul de deasupra solidului de sus — un zid doar
 * desenat pe teren gol), altfel sub stratul de sus al coloanei: primul aer de sub acoperis sau buiandrug,
 * cel mult `ACOPERIS_MAX_USA` niveluri mai jos. Numai cota suprafetei cadea deasupra acoperisului, unde nu
 * e niciun gol: casele zidite — cazul obisnuit — nu primeau usi cu dreptunghiul (recenzia pe ecran, ECR-5).
 * Nu cota coltului de start: pe o panta, casele unui dreptunghi stau pe cote diferite.
 */
export function golulColoanei(lumea: Lumea, wx: number, wy: number): readonly { x: number; y: number; z: number }[] | null {
  if (!lumea.celuleUsii) return null
  const s = lumea.suprafata(wx, wy)
  if (s === null) return null
  const pe = lumea.celuleUsii(wx, wy, s + 1)
  if (pe !== null) return pe
  let z = s
  for (let k = 0; k < ACOPERIS_MAX_USA && lumea.solid(wx, wy, z); k++) z--
  return lumea.solid(wx, wy, z) ? null : lumea.celuleUsii(wx, wy, z)
}

/** Piesele pe care dreptunghiul le deseneaza implicit pe contur (dreptunghi gol): peretele. */
export function conturImplicit(piesa: number): boolean {
  return piesa === Piesa.PERETE
}

/** Textul rezultatului, pentru toast: „96 desemnate pe 2 niveluri · 41 sărite: aer". */
export function textPlan(p: PlanDreptunghi, unealta: UnealtaId): string {
  if (p.refuz) return p.refuz
  const n = unealta === Unealta.ZONA ? p.celule.length : p.comenzi.length
  // Substantivele primesc „de" de la 20 in sus (`cant`); participiile eliptice („96 desemnate") nu.
  const cati = unealta === Unealta.ANULEAZA ? `${n} retrase`
    : unealta === Unealta.STERGE_ZONA ? (n === 1 ? '1 zonă ștearsă' : cant(n, 'zone șterse'))
    : unealta === Unealta.ZONA ? cant(n, 'celule de zonă') : `${n} desemnate`
  const bucati = [`${cati}${p.niveluri > 1 ? ` pe ${p.niveluri} niveluri` : ''}`]
  if (p.sarite.deja > 0) bucati.push(`${p.sarite.deja} aveau deja`)
  if (p.sarite.nepotrivite > 0) {
    const cum = unealta === Unealta.SAPA ? 'aer' : unealta === Unealta.CONSTRUIESTE ? (p.usa ? 'nu e un gol de ușă' : 'plin') : 'nu se poate sta'
    bucati.push(`${p.sarite.nepotrivite} sărite: ${cum}`)
  }
  if (p.celuleInAfara > 0) bucati.push(`${cant(p.celuleInAfara, 'celule')} în afara dreptunghiului`)
  return bucati.join(' · ')
}
