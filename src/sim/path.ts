/**
 * Pathfinding in DOUA straturi — S12-15.
 *
 * Research-ul e neechivoc si il citez fiindca a costat pe altii cinci ani:
 * *„Pathfinding in doua straturi de la primul commit: graf de regiuni peste A*
 * local. Nu incepe cu A* naiv pe grila 3D, pentru ca nu se poate retrofita."*
 * Going Medieval l-a rescris de patru ori intr-un studio de zece oameni si il
 * declara si azi, dupa 1.0, problema numarul unu.
 *
 * ## Cele doua straturi, si de ce ordinea lor e tot
 *
 * **Intai intrebi graful.** `areConnected` raspunde in O(1) — o citire de eticheta
 * de componenta. Daca zice NU, nu exista drum, si nu se porneste niciun A*.
 * Asta e singura aparare reala impotriva semnalului de alarma din research:
 * *„FPS-ul scade cand construiesti un zid, nu cand adaugi pioni"* — adica 15
 * pioni cauta simultan un drum inexistent, fiecare parcurgand toata harta.
 *
 * **Apoi cauti.** A* peste regiuni da un CORIDOR de regiuni; A* pe celule cauta
 * numai in interiorul coridorului. Fara coridor, o cautare intre doua capete ale
 * asezarii ar atinge zeci de mii de celule; cu el, atinge o banda.
 *
 * ## Ce spune un esec, si de ce conteaza
 *
 * Contractul `Outcome` cere ca un „nu" sa poarte MOTIVUL, iar aici motivele sunt
 * chiar informatia de joc:
 *
 *   `INACCESIBIL`     — nu exista drum, punct. Un zid, o prapastie, o insula.
 *   `OCUPAT_DE_OSTIL` — drumul EXISTA, dar e blocat de cineva ostil. Asta e D7c:
 *                       un raider intr-un coridor nu ingheata colonia, produce un
 *                       mesaj pe care jucatorul il poate citi si rezolva.
 *   `BUGET_DEPASIT`   — cautarea a atins plafonul de noduri. NU inseamna
 *                       „imposibil"; inseamna „prea scump acum", si cine intreaba
 *                       poate reincerca mai tarziu. Confuzia intre astea doua e
 *                       exact felul in care un pion se blocheaza pe viata.
 *
 * ## Aritmetica
 *
 * Totul in intregi, ca tot restul nucleului. Costurile sunt in sutimi de celula,
 * ca sa incapa penalizari fractionare fara virgula: un pas normal costa 100.
 */

import type { Rules } from './content.ts'
import type { Outcome } from './result.ts'
import { accept, refuse, Reason } from './result.ts'
import type { RegionStore } from './regions.ts'
import { canStep, find, isWalkable, NO_REGION, regionAt, REGION_SIZE } from './regions.ts'
import type { Terrain } from './terrain/terrain.ts'
import { WORLD_CELLS } from './terrain/terrain.ts'

/** Cheia unei celule din lume. Incape in interval sigur, nu in 32 de biti. */
const Z_OFFSET = 512
export function cellKey(wx: number, wy: number, z: number): number {
  return ((z + Z_OFFSET) * WORLD_CELLS + wy) * WORLD_CELLS + wx
}

export interface Celula { wx: number; wy: number; z: number }

export function decodeCell(key: number): Celula {
  const c: Celula = { wx: 0, wy: 0, z: 0 }
  decodeCellIn(key, c)
  return c
}

/**
 * Acelasi lucru, intr-un obiect DAT. Pentru bucle fierbinti: `propaga` decodeaza
 * cate 50 de chei per celula examinata, iar overlay-ul examineaza mii de celule
 * pe reconstructie — masurat, alocarea per iteratie era jumatate din cost.
 *
 * Formula sta intr-un singur loc, aici: doua copii ale ei s-ar desincroniza la
 * prima schimbare de `Z_OFFSET`.
 */
export function decodeCellIn(key: number, out: Celula): void {
  const wx = key % WORLD_CELLS
  const rest = (key - wx) / WORLD_CELLS
  const wy = rest % WORLD_CELLS
  out.wx = wx
  out.wy = wy
  out.z = (rest - wy) / WORLD_CELLS - Z_OFFSET
}

/**
 * Cine sta unde, din perspectiva cautarii.
 *
 * E DATE, nu un callback. Un callback ar face cautarea dependenta de cod din
 * afara nucleului si imposibil de reprodus dintr-un save; o multime de chei se
 * reconstruieste identic din stare.
 */
export interface Ocupare {
  /** Celule ocupate de cineva OSTIL. Impasabile — asta e regula D7. */
  readonly ostile: ReadonlySet<number>
  /** Celule ocupate de ai tai. Se poate trece, dar costa — vezi D7b. */
  readonly proprii: ReadonlySet<number>
}

export const OCUPARE_GOALA: Ocupare = { ostile: new Set(), proprii: new Set() }

export interface Path {
  /** Celulele drumului, cate trei numere (x, y, z), inclusiv capetele. */
  readonly cells: Int32Array
  /** Costul total, in sutimi de celula. */
  readonly cost: number
  /** Cate noduri a atins cautarea. Pentru buget si pentru masuratori. */
  readonly explorate: number
}

export function pathLength(p: Path): number {
  return p.cells.length / 3
}

// ---------------------------------------------------------------------------
// coada de prioritati
// ---------------------------------------------------------------------------

/**
 * Heap binar pe intregi, cu departajare EXPLICITA.
 *
 * Departajarea face iesirea independenta de ORDINEA DE INSERARE: aceleasi perechi
 * (f, cheie) impinse in orice ordine ies la fel. Fara ea, rezultatul ar depinde de
 * ordinea in care cautarea intalneste vecinii, adica de un detaliu de implementare
 * pe care un refactor il poate schimba tacut.
 *
 * Nota de onestitate, scrisa dupa o mutatie: intr-un SINGUR proces, un heap fara
 * departajare e la fel de determinist, fiindca ordinea din tablou e ea insasi
 * determinista. Deci testul de „acelasi drum de doua ori" NU dovedeste ca
 * departajarea e necesara — a trecut si cu ea scoasa. Ce o justifica e testul din
 * suita care insereaza aceleasi elemente in doua ordini diferite.
 */
export class Coada {
  private f: number[] = []
  private cheie: number[] = []
  /**
   * Departajarea, separata de identitate.
   *
   * Pentru celule, cheia E pozitia, deci merge ca departajare. Pentru REGIUNI,
   * cheia e un id venit dintr-un contor global — adica din istorie. Doua lumi cu
   * acelasi continut si istorii diferite departajau altfel si gaseau coridoare
   * diferite. Aici se paseaza ancora geometrica a regiunii.
   */
  private tie: number[] = []

  get size(): number {
    return this.f.length
  }

  clear(): void {
    this.f.length = 0
    this.cheie.length = 0
    this.tie.length = 0
  }

  private maiMic(a: number, b: number): boolean {
    return this.f[a]! < this.f[b]! || (this.f[a]! === this.f[b]! && this.tie[a]! < this.tie[b]!)
  }

  private schimba(a: number, b: number): void {
    const tf = this.f[a]!
    const tc = this.cheie[a]!
    const tt = this.tie[a]!
    this.f[a] = this.f[b]!
    this.cheie[a] = this.cheie[b]!
    this.tie[a] = this.tie[b]!
    this.f[b] = tf
    this.cheie[b] = tc
    this.tie[b] = tt
  }

  push(f: number, cheie: number, departajare: number = cheie): void {
    this.f.push(f)
    this.cheie.push(cheie)
    this.tie.push(departajare)
    let i = this.f.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.maiMic(i, p)) break
      this.schimba(i, p)
      i = p
    }
  }

  pop(): number {
    const varf = this.cheie[0]!
    const ultim = this.f.length - 1
    this.schimba(0, ultim)
    this.f.pop()
    this.cheie.pop()
    this.tie.pop()

    let i = 0
    for (;;) {
      const st = i * 2 + 1
      const dr = st + 1
      let mic = i
      if (st < this.f.length && this.maiMic(st, mic)) mic = st
      if (dr < this.f.length && this.maiMic(dr, mic)) mic = dr
      if (mic === i) break
      this.schimba(i, mic)
      i = mic
    }
    return varf
  }
}

// DOUA cozi, nu una partajata. Azi apelurile nu se suprapun — stratul de regiuni
// se termina inainte sa inceapa cel de celule — dar o coada partajata intre doua
// cautari e o capcana care asteapta prima imbricare. Costa doua obiecte.
const coadaRegiuni = new Coada()
const coadaCelule = new Coada()

// ---------------------------------------------------------------------------
// stratul 1: drum peste regiuni
// ---------------------------------------------------------------------------

/** Centrul blocului unei regiuni, in celule. Pentru euristica. */
function centruRegiune(s: RegionStore, regiune: number): { x: number; y: number; z: number } | null {
  const key = s.regionBlock.get(regiune)
  if (key === undefined) return null
  const z = (key % 1024) - Z_OFFSET
  const plat = Math.floor(key / 1024)
  const latime = WORLD_CELLS / REGION_SIZE
  const bx = plat % latime
  const by = Math.floor(plat / latime)
  return { x: bx * REGION_SIZE + REGION_SIZE / 2, y: by * REGION_SIZE + REGION_SIZE / 2, z }
}

function manhattan(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)
}

/**
 * A* peste graful de regiuni. Intoarce coridorul, adica MULTIMEA de regiuni prin
 * care poate trece drumul fin.
 *
 * Se intoarce o multime, nu o secventa, si nu din lene: A*-ul fin nu trebuie
 * fortat sa urmeze exact lantul de regiuni. Coridorul e o limita de cautare, nu
 * un traseu — altfel un obstacol mic ar respinge drumul in loc sa-l ocoleasca.
 */
export function coridorDeRegiuni(s: RegionStore, dinRegiune: number, inRegiune: number, plafon: number): Set<number> | null {
  if (dinRegiune === inRegiune) return new Set([dinRegiune])

  const tinta = centruRegiune(s, inRegiune)
  if (!tinta) return null

  // Departajarea se face pe ANCORA regiunii, nu pe id. Id-urile vin dintr-un
  // contor global, deci din ordinea istorica a calculului; ancora depinde numai
  // de geometrie. Fara asta, doua lumi cu acelasi continut si istorii diferite —
  // de exemplu una continua si una reincarcata dintr-un save — gasesc coridoare
  // diferite, si de acolo drumuri diferite si pozitii diferite.
  const anc = (r: number): number => s.ancora.get(r) ?? r

  const g = new Map<number, number>([[dinRegiune, 0]])
  const dinCine = new Map<number, number>()
  const inchise = new Set<number>()
  coadaRegiuni.clear()
  coadaRegiuni.push(0, dinRegiune, anc(dinRegiune))

  let atinse = 0
  while (coadaRegiuni.size > 0) {
    const cur = coadaRegiuni.pop()
    if (inchise.has(cur)) continue
    inchise.add(cur)
    if (++atinse > plafon) return null

    if (cur === inRegiune) {
      // Coridorul e lantul gasit plus TOTI vecinii lui: o banda, nu o linie.
      const banda = new Set<number>()
      let nod: number | undefined = cur
      while (nod !== undefined) {
        banda.add(nod)
        for (const v of s.adj.get(nod) ?? []) banda.add(v)
        nod = dinCine.get(nod)
      }
      return banda
    }

    const gCur = g.get(cur)!
    // determinism-ok: vecinii se sorteaza explicit inainte de parcurgere, tocmai
    // fiindca `Set` pastreaza ordinea de inserare si aia depinde de istoric.
    // Sortarea e pe ANCORA, din acelasi motiv ca departajarea din coada.
    for (const v of [...(s.adj.get(cur) ?? [])].sort((x, y) => anc(x) - anc(y))) {
      const c1 = centruRegiune(s, cur)
      const c2 = centruRegiune(s, v)
      const pas = c1 && c2 ? manhattan(c1, c2) : REGION_SIZE
      const nou = gCur + pas
      const vechi = g.get(v)
      if (vechi !== undefined && vechi <= nou) continue
      g.set(v, nou)
      dinCine.set(v, cur)
      const c = centruRegiune(s, v)
      coadaRegiuni.push(nou + (c ? manhattan(c, tinta) : 0), v, anc(v))
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// stratul 2: drum pe celule
// ---------------------------------------------------------------------------

const VECINI = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * Drumul complet, de la celula la celula.
 *
 * Ordinea operatiilor E algoritmul:
 *   1. capetele sunt in regiuni calculate? daca nu, nu stim — deci NU.
 *   2. sunt in aceeasi componenta? daca nu, INACCESIBIL, fara nicio cautare.
 *   3. coridor de regiuni.
 *   4. A* pe celule, marginit la coridor si la plafonul de noduri.
 */
export function findPath(
  t: Terrain,
  s: RegionStore,
  rules: Rules,
  from: { wx: number; wy: number; z: number },
  to: { wx: number; wy: number; z: number },
  ocupare: Ocupare = OCUPARE_GOALA,
): Outcome<Path> {
  const rDin = regionAt(s, from.wx, from.wy, from.z)
  const rIn = regionAt(s, to.wx, to.wy, to.z)
  if (rDin === NO_REGION || rIn === NO_REGION) {
    return refuse(Reason.INACCESIBIL, { motiv: 'capat in afara regiunilor calculate' })
  }

  // Pasul care apara tot restul: o intrebare O(1) inainte de orice cautare.
  if (find(s, rDin) !== find(s, rIn)) {
    return refuse(Reason.INACCESIBIL, { motiv: 'componente diferite' })
  }

  const coridor = coridorDeRegiuni(s, rDin, rIn, rules.maxRegionNodes)
  if (!coridor) return refuse(Reason.BUGET_DEPASIT, { strat: 'regiuni', plafon: rules.maxRegionNodes })

  const cheieStart = cellKey(from.wx, from.wy, from.z)
  const cheieTinta = cellKey(to.wx, to.wy, to.z)

  const g = new Map<number, number>([[cheieStart, 0]])
  const dinCine = new Map<number, number>()
  const inchise = new Set<number>()
  coadaCelule.clear()
  coadaCelule.push(0, cheieStart)

  let explorate = 0
  let vazutOstil = false

  while (coadaCelule.size > 0) {
    const cur = coadaCelule.pop()
    if (inchise.has(cur)) continue
    inchise.add(cur)
    explorate++
    if (explorate > rules.maxPathNodes) {
      return refuse(Reason.BUGET_DEPASIT, { strat: 'celule', plafon: rules.maxPathNodes, explorate })
    }

    if (cur === cheieTinta) return accept(reconstruieste(dinCine, cur, g.get(cur)!, explorate))

    const { wx, wy, z } = decodeCell(cur)
    const gCur = g.get(cur)!

    for (const [dx, dy] of VECINI) {
      const nx = wx + dx
      const ny = wy + dy
      // Pasul poate urca sau cobori; se incearca toate nivelurile admise.
      for (let dz = -rules.maxStepM; dz <= rules.maxStepM; dz++) {
        const nz = z + dz
        if (!canStep(t, wx, wy, z, nx, ny, nz, rules)) continue

        const rv = regionAt(s, nx, ny, nz)
        if (rv === NO_REGION || !coridor.has(rv)) continue

        const cheie = cellKey(nx, ny, nz)
        if (inchise.has(cheie)) continue

        if (ocupare.ostile.has(cheie)) {
          // D7: celula ostila e impasabila. Se retine, fiindca schimba MOTIVUL
          // unui esec din „nu exista drum" in „drumul e blocat de cineva".
          vazutOstil = true
          continue
        }

        let cost = rules.stepCost
        if (ocupare.proprii.has(cheie)) cost += rules.allyStepPenalty
        // Urcarea costa mai mult decat mersul pe plat. Fara asta, un drum care
        // urca si coboara inutil pare la fel de bun ca unul drept.
        if (dz !== 0) cost += rules.climbCost

        const nou = gCur + cost
        const vechi = g.get(cheie)
        if (vechi !== undefined && vechi <= nou) continue
        g.set(cheie, nou)
        dinCine.set(cheie, cur)
        const h = (Math.abs(nx - to.wx) + Math.abs(ny - to.wy) + Math.abs(nz - to.z)) * rules.stepCost
        coadaCelule.push(nou + h, cheie)
      }
    }
  }

  // Graful spunea ca exista drum, cautarea fina n-a gasit. Deci blocajul e
  // DINAMIC — si asta e exact cazul pe care D7c cere sa-l distingem.
  if (vazutOstil) {
    return refuse(Reason.OCUPAT_DE_OSTIL, { motiv: 'singurul drum trece prin cineva ostil', explorate })
  }
  return refuse(Reason.INACCESIBIL, { motiv: 'graful promitea un drum, celulele nu l-au confirmat', explorate })
}

function reconstruieste(dinCine: Map<number, number>, capat: number, cost: number, explorate: number): Path {
  const chei: number[] = []
  let nod: number | undefined = capat
  while (nod !== undefined) {
    chei.push(nod)
    nod = dinCine.get(nod)
  }
  chei.reverse()

  const cells = new Int32Array(chei.length * 3)
  for (let i = 0; i < chei.length; i++) {
    const c = decodeCell(chei[i]!)
    cells[i * 3] = c.wx
    cells[i * 3 + 1] = c.wy
    cells[i * 3 + 2] = c.z
  }
  return { cells, cost, explorate }
}

/** Celula pe care se poate sta cel mai aproape de o cota data. Pentru „du-te acolo". */
export function celulaDeMers(t: Terrain, s: RegionStore, wx: number, wy: number, zAproape: number, rules: Rules): number | null {
  for (let d = 0; d <= 8; d++) {
    for (const z of d === 0 ? [zAproape] : [zAproape + d, zAproape - d]) {
      if (isWalkable(t, wx, wy, z, rules) && regionAt(s, wx, wy, z) !== NO_REGION) return z
    }
  }
  return null
}
