/**
 * Proveniența temperaturii — S24-27 t.2b, commit-ul 2 (research/temperatura-t2b.md §3, §9).
 *
 * ORACOLUL pe forță brută, independent de evidența din fete.ts: înainte și după fiecare lot, materialele cutiei
 * scenei (materialAt, sub bază stâncă) și componentele unui index construit DE LA ZERO; masa fiecărui articol (aerul
 * unei celule, fiecare față) clasificată din nou, după tabelul designului (§4). De aici: (1) evidența C3 a lotului
 * — masa care persistă de la fiecare componentă veche la fiecare nouă, solul care intră și iese pe adâncime, restul
 * care apare și iese — comparată EXACT cu `SchimbareCamere.mase`; (2) T-ul fiecărei componente noi, calculat în
 * float din (T, rest) de dinainte, comparat cu `provenientaTemperaturii`; (3) energia: ΔE = schimbul la T_sol + masa
 * apărută la T-ul rezultat − masa ieșită la T-ul sursei (± rotunjirea). Între loturi, T-urile se „relaxează" la
 * valori distincte, ca orice confuzie de surse să se vadă.
 *
 * Plus POARTA POMPEI (C3 n-are pompă: săpat + astupat pe același tick întoarce T-ul), rezerva W_Y = 0 (CER / SOL),
 * jurnalul cu materialul vechi și „Number == BigInt".
 *
 * Loturile se fac direct pe teren + `sincronizeazaCamere` (o comandă `dig` / `fill` e exact un lot), cu proveniența
 * aplicată de bancă pe starea ei. Banca „lume" (commit-ul 4, SAV-7) face loturile prin COMENZI (`applyCommand`, deci prin
 * punctul unic `sincronizeazaLumea`) și compară cu oracolul T-ul CONSUMATORULUI — `w.temperatura`, după fiecare comandă.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { Anotimp, panaLaAnotimp, tickuriPeOra } from '../src/sim/calendar.ts'
import { tAfara, tSol } from '../src/sim/clima.ts'
import type { SchimbareCamere } from '../src/sim/camere.ts'
import { celuleComponentei, cheieCelula, componentaLa, construiesteCamere, decodeazaCelula, listaComponente, sincronizeazaCamere } from '../src/sim/camere.ts'
import type { ContoareMasa, EvidentaMase } from '../src/sim/fete.ts'
import { capacitateMu, contoareComponentei } from '../src/sim/fete.ts'
import type { TemperaturiSlot } from '../src/sim/temperatura.ts'
import { provenientaTemperaturii, sincronizeazaLumea, statTermic, temperaturiGoale, verificaStampila } from '../src/sim/temperatura.ts'
import { applyCommand } from '../src/sim/commands.ts'
import type { World } from '../src/sim/state.ts'
import type { MaterialId } from '../src/sim/terrain/chunk.ts'
import { eSolNatural, Material } from '../src/sim/terrain/chunk.ts'
import { bazaVoxeli, dig, fill, groundLevelM, JURNAL_CAP, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { createWorld } from '../src/sim/world.ts'
import { sitPlat } from './fixturi.ts'
import { casaTermica } from './fixturi-temperatura.ts'

const R = DEFAULT_RULES
const Q = 65536
const P = Material.PIATRA_CONSTRUITA
const MASE = R.termic.mase
/**
 * Vara, ziua 2, 15:00 — a anului 1 (jocul începe toamna, deci prima vară e în anul 1): T_afara 25,48 °C, T_sol pe
 * d 0 / 1 / 2 / 3: 11,70 / 3,90 / 2,49 / 1,94 °C, ca o adâncime greșită sau o origine schimbată să se vadă.
 */
const TICK = panaLaAnotimp(0, Anotimp.VARA, R) + R.calendar.ziTicks + 15 * tickuriPeOra(R)

// --- oracolul ------------------------------------------------------------------------------

/** Cutia scenei, cu marginea de o celulă (vecinii celulelor componentelor). */
interface Cutie {
  readonly x0: number
  readonly y0: number
  readonly z0: number
  readonly x1: number
  readonly y1: number
  readonly z1: number
}

/** Materialul pe convenția designului: în afara lumii și sub baza ferestrei stâncă, peste ea aer (materialAt). */
function materialConv(w: World, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || x >= WORLD_CELLS || y >= WORLD_CELLS) return Material.ROCA
  if (z < bazaVoxeli(w.terrain, x, y)) return Material.ROCA
  const m = materialAt(w.terrain, x, y, z)
  assert.ok(m.ok)
  return m.value
}

function adancime(w: World, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || x >= WORLD_CELLS || y >= WORLD_CELLS) return 64
  const g = groundLevelM(w.terrain, x, y)
  assert.ok(g.ok)
  return Math.max(0, Math.min(64, g.value - z))
}

/** Clasa de masă, scrisă din nou după tabelul §4: 0 nimic, 1 construit, 2 sol de suprafață, 3 sol masiv, 4 apă. */
function clasaOracol(m: number, d: number): number {
  if (m === Material.AER) return 0
  if (m === Material.APA) return 4
  if (eSolNatural(m)) return d >= R.termic.dSolMasivM ? 3 : 2
  return 1
}

type Vec = [number, number, number, number]
const vecGol = (): Vec => [0, 0, 0, 0]
function adunaVec(v: Vec, k: number, s = 1): void {
  if (k === 1 || k === 2) v[1] += s
  else if (k === 3) v[2] += s
  else if (k === 4) v[3] += s
}
const mu = (v: Vec): number => v[0] * MASE.aer + v[1] * MASE.constr + (v[2] + v[3]) * MASE.sol
const deLaContoare = (c: ContoareMasa): Vec => [c.nAer, c.nConstr, c.nSolMasiv, c.nApa]

interface Instantaneu {
  /** Materialul fiecărei celule din cutie. */
  readonly mat: Map<number, number>
  /** Celula de aer acoperit → ancora componentei ei, dintr-un index construit de la zero. */
  readonly anc: Map<number, number>
}

function instantaneu(w: World, c: Cutie): Instantaneu {
  const mat = new Map<number, number>()
  for (let z = c.z0; z <= c.z1; z++) for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) mat.set(cheieCelula(x, y, z), materialConv(w, x, y, z))
  const idx = construiesteCamere(w.terrain)
  const anc = new Map<number, number>()
  for (const comp of listaComponente(idx)) for (const k of celuleComponentei(idx, comp)) anc.set(k, comp.ancora)
  return { mat, anc }
}

/** Evidența pe forță brută a unui lot, pe ancore. */
interface Contabilitate {
  /** ancora nouă → ancora veche → masa persistentă */
  readonly P: Map<number, Map<number, Vec>>
  readonly solIn: Map<number, Map<number, Vec>>
  readonly apare: Map<number, Vec>
  readonly solOut: Map<number, Map<number, Vec>>
  readonly altaOut: Map<number, Vec>
  /** C' vechi / nou pe ancoră, din aceeași clasificare. */
  readonly cVechi: Map<number, Vec>
  readonly cNou: Map<number, Vec>
  /** ancora nouă → T-urile de origine ale celulelor noi (Q16): cer → T_afara, plină → T_sol(d). */
  readonly origine: Map<number, number[]>
}

const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const

function get2(m: Map<number, Map<number, Vec>>, a: number, b: number): Vec {
  let m2 = m.get(a)
  if (m2 === undefined) {
    m2 = new Map()
    m.set(a, m2)
  }
  let v = m2.get(b)
  if (v === undefined) {
    v = vecGol()
    m2.set(b, v)
  }
  return v
}
function get1(m: Map<number, Vec>, a: number): Vec {
  let v = m.get(a)
  if (v === undefined) {
    v = vecGol()
    m.set(a, v)
  }
  return v
}

function contabilitate(w: World, c: Cutie, vechi: Instantaneu, nou: Instantaneu, tick: number): Contabilitate {
  const K: Contabilitate = { P: new Map(), solIn: new Map(), apare: new Map(), solOut: new Map(), altaOut: new Map(), cVechi: new Map(), cNou: new Map(), origine: new Map() }
  const celule = new Set<number>([...vechi.anc.keys(), ...nou.anc.keys()])
  const inCutie = (x: number, y: number, z: number): boolean => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1 && z >= c.z0 && z <= c.z1
  for (const k of [...celule].sort((a, b) => a - b)) {
    const { x, y, z } = decodeazaCelula(k)
    const sv = vechi.anc.get(k)
    const yn = nou.anc.get(k)
    const fete: [number, number, number][] = []
    for (const [dx, dy, dz] of D6) {
      const nx = x + dx, ny = y + dy, nz = z + dz
      assert.ok(inCutie(nx, ny, nz), `cutia scenei e prea mica: (${nx},${ny},${nz})`)
      const kn = cheieCelula(nx, ny, nz)
      const d = adancime(w, nx, ny, nz)
      fete.push([sv === undefined ? 0 : clasaOracol(vechi.mat.get(kn)!, d), yn === undefined ? 0 : clasaOracol(nou.mat.get(kn)!, d), d])
    }
    if (sv !== undefined) {
      const cv = get1(K.cVechi, sv)
      cv[0]++
      for (const [kv] of fete) adunaVec(cv, kv)
    }
    if (yn !== undefined) {
      const cn = get1(K.cNou, yn)
      cn[0]++
      for (const [, kn] of fete) adunaVec(cn, kn)
    }
    if (sv !== undefined && yn !== undefined) get2(K.P, yn, sv)[0]++
    else if (sv !== undefined) get1(K.altaOut, sv)[0]++
    else if (yn !== undefined) {
      get1(K.apare, yn)[0]++
      const mv = vechi.mat.get(k)!
      let o = K.origine.get(yn)
      if (o === undefined) {
        o = []
        K.origine.set(yn, o)
      }
      o.push(mv === Material.AER ? tAfara(w.seed, tick, R) : tSol(adancime(w, x, y, z), tick, R))
    }
    for (const [kv, kn, d] of fete) {
      if (kv === kn && kv !== 0) {
        adunaVec(get2(K.P, yn!, sv!), kv)
        continue
      }
      if (kv !== 0) {
        if (kv >= 2) adunaVec(get2(K.solOut, sv!, d), kv)
        else adunaVec(get1(K.altaOut, sv!), kv)
      }
      if (kn !== 0) {
        if (kn >= 2) adunaVec(get2(K.solIn, yn!, d), kn)
        else adunaVec(get1(K.apare, yn!), kn)
      }
    }
  }
  return K
}

const nenul = (v: Vec): boolean => v[0] !== 0 || v[1] !== 0 || v[2] !== 0 || v[3] !== 0
const listaD = (m: Map<number, Vec> | undefined): [number, Vec][] => (m === undefined ? [] : [...m].filter(([, v]) => nenul(v)).sort((a, b) => a[0] - b[0]))

/** Evidența lotului == forța brută, exact (pe ancore), și completă (orice componentă atinsă apare). */
function comparaEvidenta(m: EvidentaMase, K: Contabilitate, ce: string): void {
  assert.equal(m.abateri, 0, `${ce}: abateri in evidenta`)
  const raportateNoi = new Set<number>()
  for (const y of m.noi) {
    raportateNoi.add(y.ancora)
    assert.deepEqual(deLaContoare(y.capacitate), K.cNou.get(y.ancora) ?? vecGol(), `${ce}: C' nou ${y.ancora}`)
    const asteptat = [...(K.P.get(y.ancora) ?? new Map<number, Vec>())].filter(([, v]) => nenul(v)).sort((a, b) => a[0] - b[0])
    assert.deepEqual(y.surse.map((s) => [s.ancora, deLaContoare(s.masa)]), asteptat, `${ce}: sursele lui ${y.ancora}`)
    assert.deepEqual(y.solIntra.map((s) => [s.d, deLaContoare(s.masa)]), listaD(K.solIn.get(y.ancora)), `${ce}: solul care intra in ${y.ancora}`)
    assert.deepEqual(deLaContoare(y.aparuta), K.apare.get(y.ancora) ?? vecGol(), `${ce}: masa aparuta in ${y.ancora}`)
  }
  // Completă: o componentă nouă cu altă sursă decât ea însăși, cu sol care intră sau masă apărută e raportată.
  for (const [a, cn] of K.cNou) {
    const p = K.P.get(a)
    const doarEa = p !== undefined && p.size === 1 && p.has(a) && mu(p.get(a)!) === mu(cn)
    if (!doarEa) assert.ok(raportateNoi.has(a), `${ce}: componenta ${a} s-a schimbat si nu e raportata`)
  }
  const raportateVechi = new Set<number>()
  for (const v of m.vechi) {
    raportateVechi.add(v.ancora)
    assert.deepEqual(deLaContoare(v.capacitate), K.cVechi.get(v.ancora) ?? vecGol(), `${ce}: C' vechi ${v.ancora}`)
    assert.deepEqual(v.solIese.map((s) => [s.d, deLaContoare(s.masa)]), listaD(K.solOut.get(v.ancora)), `${ce}: solul care iese din ${v.ancora}`)
    assert.deepEqual(deLaContoare(v.altaIese), K.altaOut.get(v.ancora) ?? vecGol(), `${ce}: alta masa iesita din ${v.ancora}`)
  }
  for (const [a, cv] of K.cVechi) {
    let pers = 0
    for (const pm of K.P.values()) if (pm.has(a)) pers += mu(pm.get(a)!)
    const intreaga = pers === mu(cv) && K.P.get(a)?.has(a) === true && mu(K.P.get(a)!.get(a)!) === mu(cv)
    if (!intreaga) assert.ok(raportateVechi.has(a), `${ce}: componenta veche ${a} si-a schimbat masa si nu e raportata`)
  }
}

// --- banca: lot după lot, cu oracolul -------------------------------------------------------

interface OptiuniBanca {
  /** Relaxează T-urile la valori distincte după fiecare lot (implicit da). */
  readonly relaxare?: boolean
  readonly tick?: number
  /** Loturile vin prin COMENZI (punctul unic): starea e `w.temperatura`, iar oracolul compară T-ul consumatorului (SAV-7). */
  readonly lume?: boolean
}

class Banca {
  readonly w: World
  readonly cutie: Cutie
  readonly tick: number
  readonly relaxare: boolean
  readonly lume: boolean
  stare: TemperaturiSlot = temperaturiGoale()
  inst: Instantaneu
  pas = 0
  loturi = 0
  readonly ev = { noi: 0, peLoc: 0, moarte: 0, rezerva: 0, recalcul: 0, doarFete: 0, bigInt: 0, uniri: 0 }

  constructor(w: World, cutie: Cutie, o: OptiuniBanca = {}) {
    this.w = w
    this.cutie = cutie
    this.tick = o.tick ?? TICK
    this.relaxare = o.relaxare ?? true
    this.lume = o.lume ?? false
    if (this.lume) {
      w.tick = this.tick
      assert.ok(sincronizeazaLumea(w, R).ok)
    } else sincronizeazaCamere(w.camere, w.terrain)
    this.relaxeaza()
    this.inst = instantaneu(w, cutie)
  }

  /** C' (μ) al componentei vii `id`, din contoare. */
  cap(id: number): number {
    const c = this.w.camere.comp.get(id)!
    const n = contoareComponentei(this.w.camere, c)
    assert.ok(n.ok)
    return capacitateMu(n.value, MASE)
  }

  /** T-uri distincte pe toate componentele vii (Q16 °C, −10…+30), rest în [0, C'). */
  relaxeaza(): void {
    this.pas++
    const n = this.w.camere.cUrmator
    const s = temperaturiGoale(n)
    for (const c of this.w.camere.comp.values()) {
      s.t[c.id] = (((c.ancora % 9973) * 7919 + this.pas * 104729) % (40 * Q)) - 10 * Q
      s.rest[c.id] = (c.ancora + this.pas * 31) % this.cap(c.id)
      s.are[c.id] = 1
    }
    this.stare = s
    if (this.lume) this.w.temperatura.slot = s
  }

  /** T-ul real al componentei (Q16), din (T, rest). */
  tReal(id: number): number {
    return this.stare.t[id]! + this.stare.rest[id]! / this.cap(id)
  }

  /** Un lot: editările, sincronizarea, oracolul, proveniența, verificările. */
  lot(editeaza: () => void, ce: string, muta?: (s: SchimbareCamere) => SchimbareCamere): SchimbareCamere {
    const w = this.w
    // H și C' de dinainte, pe ancoră (din starea pe slot și contoarele indexului de dinainte).
    const hVechi = new Map<number, number>()
    const tVechi = new Map<number, number>()
    for (const c of w.camere.comp.values()) {
      const C = this.cap(c.id)
      hVechi.set(c.ancora, C * this.stare.t[c.id]! + this.stare.rest[c.id]!)
      tVechi.set(c.ancora, this.stare.t[c.id]! + this.stare.rest[c.id]! / C)
    }
    const eVechi = [...hVechi.values()].reduce((a, b) => a + b, 0)
    const lot0 = statTermic(w).loturi
    editeaza()
    this.loturi++
    const nou = instantaneu(w, this.cutie)
    const K = contabilitate(w, this.cutie, this.inst, nou, this.tick)
    let sch: SchimbareCamere | null = null
    if (this.lume) {
      // Consumatorul e lumea: comanda a trecut prin punctul unic (ștampila la zi, nicio sursă fără T, niciun invariant).
      assert.ok(verificaStampila(w).ok, `${ce}: stampila`)
      assert.equal(statTermic(w).invarianti, 0, `${ce}: ${statTermic(w).ultimulInvariant}`)
      assert.ok(statTermic(w).loturi > lot0 || w.camere.comp.size === 0, `${ce}: comanda n-a trecut prin proveninta`)
      this.stare = w.temperatura.slot
    } else {
      sch = sincronizeazaCamere(w.camere, w.terrain)
      comparaEvidenta(sch.mase, K, `${ce} (lotul ${this.loturi})`)
      if (muta) sch = muta(sch)
      const rez = provenientaTemperaturii(this.stare, sch, this.tick, w.seed, R)
      // Number == BigInt, bit cu bit.
      const big = provenientaTemperaturii(this.stare, sch, this.tick, w.seed, R, true)
      assert.deepEqual([...big.stare.t], [...rez.stare.t], `${ce}: T pe BigInt`)
      assert.deepEqual([...big.stare.rest], [...rez.stare.rest], `${ce}: rest pe BigInt`)
      assert.equal(rez.surseFaraT, 0, `${ce}: surse fara T`)
      this.stare = rez.stare
      this.ev.noi += sch.noi.length
      this.ev.peLoc += sch.peLoc.length
      this.ev.moarte += sch.moarte.length
      this.ev.rezerva += rez.rezerva
      this.ev.bigInt += rez.bigInt
      if (sch.recalcul) this.ev.recalcul++
      if (sch.felii.length === 0 && !sch.recalcul && sch.mase.noi.length > 0) this.ev.doarFete++
      for (const y of sch.mase.noi) if (y.surse.length >= 2) this.ev.uniri++
    }
    // Fiecare componentă vie are T, niciun alt slot n-are (moartele s-au golit).
    const vii = new Set<number>()
    for (const c of w.camere.comp.values()) vii.add(c.id)
    for (let s = 0; s < this.stare.are.length; s++) assert.equal(this.stare.are[s], vii.has(s) ? 1 : 0, `${ce}: slotul ${s} ${vii.has(s) ? 'viu fara T' : 'mort cu T'}`)
    for (const id of vii) assert.ok(id < this.stare.are.length, `${ce}: componenta ${id} fara slot`)

    // Cu evidența modificată (probele negative ale porților) oracolul de T și de energie nu se aplică.
    if (muta === undefined) {
      // T-ul așteptat, în float, din evidența pe forță brută (§3).
      const tSolQ = (d: number): number => tSol(d, this.tick, R)
      const hRamas = new Map<number, number>()
      const persPeSursa = new Map<number, number>()
      for (const pm of K.P.values()) for (const [s, v] of pm) persPeSursa.set(s, (persPeSursa.get(s) ?? 0) + mu(v))
      for (const [s, cv] of K.cVechi) {
        const C = mu(cv)
        let S = 0
        let eSol = 0
        for (const [d, v] of K.solOut.get(s) ?? new Map<number, Vec>()) {
          S += mu(v)
          eSol += mu(v) * tSolQ(d)
        }
        hRamas.set(s, (hVechi.get(s)! * ((persPeSursa.get(s) ?? 0) + S)) / C - eSol)
      }
      let dE = 0
      for (const comp of w.camere.comp.values()) {
        const a = comp.ancora
        assert.equal(this.cap(comp.id), mu(K.cNou.get(a)!), `${ce}: C' din contoare == C' pe forta bruta, ${a}`)
        let H = 0
        let W = 0
        for (const [s, v] of K.P.get(a) ?? new Map<number, Vec>()) {
          H += (hRamas.get(s)! * mu(v)) / persPeSursa.get(s)!
          W += mu(v)
        }
        for (const [d, v] of K.solIn.get(a) ?? new Map<number, Vec>()) {
          H += mu(v) * tSolQ(d)
          W += mu(v)
          dE += mu(v) * tSolQ(d)
        }
        let tAst: number
        if (W > 0) tAst = H / W
        else {
          const o = K.origine.get(a)!
          tAst = o.reduce((p, q) => p + q, 0) / o.length
        }
        const tAre = this.tReal(comp.id)
        assert.ok(Math.abs(tAre - tAst) <= 1, `${ce}: T-ul lui ${a} e ${(tAre / Q).toFixed(4)} °C, oracolul ${(tAst / Q).toFixed(4)} °C`)
        dE += mu(K.apare.get(a) ?? vecGol()) * tAre
      }
      // Energia (§9): ΔE = solul care intră (la T_sol) + masa apărută (la T-ul rezultat) − solul care iese (la T_sol)
      // − masa care iese la T-ul sursei − ce rămâne pe o sursă din care nu persistă nimic (dispare cu ea).
      for (const [s] of K.cVechi) {
        for (const [d, v] of K.solOut.get(s) ?? new Map<number, Vec>()) dE -= mu(v) * tSolQ(d)
        dE -= mu(K.altaOut.get(s) ?? vecGol()) * tVechi.get(s)!
        if ((persPeSursa.get(s) ?? 0) === 0) dE -= hRamas.get(s)!
      }
      let eNou = 0
      for (const comp of w.camere.comp.values()) eNou += this.cap(comp.id) * this.stare.t[comp.id]! + this.stare.rest[comp.id]!
      const termeni = K.cVechi.size + K.cNou.size + [...K.P.values()].reduce((p, m) => p + m.size, 0)
      assert.ok(Math.abs(eNou - eVechi - dE) <= termeni + 1e-9 * Math.abs(eVechi), `${ce}: energia ${eNou - eVechi} fata de schimb ${dE}`)

    }
    this.inst = nou
    if (this.relaxare) this.relaxeaza()
    return sch!
  }
}

/** Cutia din jurul unei scene, cu marginea de o celulă. */
function cutie(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Cutie {
  return { x0: x0 - 1, y0: y0 - 1, z0: z0 - 1, x1: x1 + 1, y1: y1 + 1, z1: z1 + 1 }
}

function ok(o: { ok: boolean }, ce: string): void {
  assert.ok(o.ok, `${ce}: ${JSON.stringify(o)}`)
}

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// --- jurnalul ------------------------------------------------------------------------------

test('JURNAL: materialul VECHI al fiecarei editari, paralel cu inelul — dig da materialul sapat, fill aerul (sau apa) inlocuit; in lot conteaza PRIMA aparitie a celulei', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  const t = w.terrain
  const e0 = t.editari
  const sus = materialAt(t, wx + 1, wy + 1, g)
  assert.ok(sus.ok && eSolNatural(sus.value), 'fixtura: suprafata e sol natural')
  ok(dig(t, wx + 1, wy + 1, g), 'dig')
  ok(fill(t, wx + 1, wy + 1, g, P), 'fill')
  ok(dig(t, wx + 1, wy + 1, g), 'dig din nou')
  ok(fill(t, wx + 2, wy + 1, g + 1, Material.LEMN_CONSTRUIT), 'fill in aer')
  assert.equal(t.editari, e0 + 4)
  assert.deepEqual([...t.jurnalMat.slice(e0 % JURNAL_CAP, (e0 % JURNAL_CAP) + 4)], [sus.value, Material.AER, P, Material.AER])
  // Prima apariție: o celulă din casă zidită și săpată la loc în ACELAȘI lot n-a schimbat nimic; ultima apariție
  // (săpatul, cu materialul vechi PIATRA) ar face din ea un zid care dispare, cu fețele lui.
  const s = casaTermica()
  const [cx, cy, z1] = s.rep.casa!
  const b = new Banca(s.w, cutie(s.x0, s.y0, z1 - 2, s.x0 + 6, s.y0 + 6, z1 + 3))
  const sch = b.lot(() => {
    ok(fill(s.w.terrain, cx, cy, z1, P), 'zidit')
    ok(dig(s.w.terrain, cx, cy, z1), 'sapat la loc')
  }, 'zidit si sapat in acelasi lot')
  for (const y of sch.mase.noi) assert.deepEqual([y.solIntra.length, y.aparuta.nAer + y.aparuta.nConstr], [0, 0], 'nimic nu apare')
})

// --- oracolul pe scene ------------------------------------------------------------------------

test('PROVENIENTA oracol: usa dintre doua pivnite deschisa si zidita la loc de 20 de ori (unire, despartire) — evidenta C3 == forta bruta, T == oracolul, energia se conserva la rotunjire, sloturile moarte golite', () => {
  for (const seed of [20261001, 777]) {
    const { w, wx, wy, g } = sitPlat(seed, 12)
    // Două pivnițe 3×3×2 lipite, zidul comun pe x = wx+5, săpate înainte de bancă.
    for (const z of [g - 2, g - 3]) for (let dy = 2; dy <= 4; dy++) {
      for (let dx = 2; dx <= 4; dx++) ok(dig(w.terrain, wx + dx, wy + dy, z), 'pivnita A')
      for (let dx = 6; dx <= 8; dx++) ok(dig(w.terrain, wx + dx, wy + dy, z), 'pivnita B')
    }
    const b = new Banca(w, cutie(wx + 1, wy + 1, g - 4, wx + 9, wy + 5, g + 1))
    for (let k = 0; k < 20; k++) {
      const u = b.lot(() => ok(dig(w.terrain, wx + 5, wy + 3, g - 3), 'usa'), `seed ${seed} usa ${k}`)
      assert.equal(listaComponente(w.camere).length, 1, 'unite')
      assert.equal(u.mase.noi.length, 1)
      b.lot(() => ok(fill(w.terrain, wx + 5, wy + 3, g - 3, P), 'zid'), `seed ${seed} zid ${k}`)
      assert.equal(listaComponente(w.camere).length, 2, 'despartite')
    }
    assert.ok(b.ev.uniri >= 20 && b.ev.moarte > 0, JSON.stringify(b.ev))
  }
})

test('PROVENIENTA oracol: casa peste pivnita — pivnita sapata, casa zidita peste ea (acoperisul o inchide: rezerva sau sol), putul prin podea (unirea, sol care intra la d 0..2), chepengul (despartirea), groapa si astuparea in podea (peLoc)', () => {
  const { w, wx, wy, g } = sitPlat(4242, 14)
  const t = w.terrain
  const x0 = wx + 2, y0 = wy + 2
  const b = new Banca(w, cutie(x0, y0, g - 4, x0 + 6, y0 + 6, g + 4))
  // Pivnița 3×3×2 sub mijloc, cu 1 m de pământ deasupra, celulă cu celulă (fiecare un lot).
  for (const z of [g - 2, g - 3]) for (let dx = 2; dx <= 4; dx++) for (let dy = 2; dy <= 4; dy++) b.lot(() => ok(dig(t, x0 + dx, y0 + dy, z), 'pivnita'), `pivnita ${dx},${dy},${z}`)
  // Casa 5×5×2 de piatră, cu ușă, zidită piesă cu piesă; ultimul lot al acoperișului o închide.
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
    if (dx !== 0 && dx !== 6 && dy !== 0 && dy !== 6) continue
    b.lot(() => ok(fill(t, x0 + dx, y0 + dy, z, dx === 3 && dy === 0 ? Material.USA : P), 'perete'), `perete ${dx},${dy},${z}`)
  }
  for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) b.lot(() => ok(fill(t, x0 + dx, y0 + dy, g + 3, P), 'acoperis'), `acoperis ${dx},${dy}`)
  assert.ok(componentaLa(w.camere, x0 + 3, y0 + 3, g + 1), 'casa e o componenta')
  // Puțul prin podea (g, g − 1), apoi chepengul; groapa și astuparea în podea (calea rapidă).
  b.lot(() => ok(dig(t, x0 + 3, y0 + 3, g), 'put'), 'put sus')
  b.lot(() => ok(dig(t, x0 + 3, y0 + 3, g - 1), 'put'), 'put jos (unirea)')
  b.lot(() => ok(fill(t, x0 + 3, y0 + 3, g, Material.USA), 'chepeng'), 'chepengul (despartirea)')
  for (let k = 0; k < 4; k++) {
    b.lot(() => ok(dig(t, x0 + 1, y0 + 5, g), 'groapa'), `groapa ${k}`)
    b.lot(() => ok(fill(t, x0 + 1, y0 + 5, g, k % 2 === 0 ? P : Material.PAMANT), 'astupat'), `astupat ${k}`)
  }
  assert.ok(b.ev.peLoc > 0 && b.ev.uniri > 0 && b.ev.moarte > 0, JSON.stringify(b.ev))
})

test('PROVENIENTA oracol: fuzzul de SUPRAFATA — umpleri si sapaturi in loturi de 1–4, pe varful coloanelor peste o pivnita si o camera zidita, de-a curmezisul unei granite de bloc', () => {
  for (const seed of [12345, 777]) {
    const { w, wx, wy, g } = sitPlat(seed, 24)
    const t = w.terrain
    // Granița de bloc b (multiplu de 16) cade între x0 și x0 + 9: cutia trece peste ea, pe situl plat.
    const bl = Math.ceil((wx + 6) / 16) * 16
    const x0 = bl - 5, y0 = wy + 1
    for (let dx = 2; dx <= 6; dx++) for (let dy = 2; dy <= 6; dy++) for (const z of [g - 2, g - 3]) ok(dig(t, x0 + dx, y0 + dy, z), 'pivnita')
    for (let z = g + 1; z <= g + 2; z++) for (let dx = 4; dx <= 8; dx++) for (let dy = 0; dy <= 3; dy++) if (dx === 4 || dx === 8 || dy === 0 || dy === 3) ok(fill(t, x0 + dx, y0 + dy, z, P), 'camera')
    for (let dx = 4; dx <= 8; dx++) for (let dy = 0; dy <= 3; dy++) ok(fill(t, x0 + dx, y0 + dy, g + 3, P), 'tavan')
    const b = new Banca(w, cutie(x0, y0, g - 4, x0 + 9, y0 + 9, g + 5))
    const rnd = lcg(seed)
    for (let lot = 0; lot < 150; lot++) {
      const n = 1 + Math.floor(rnd() * 4)
      b.lot(() => {
        for (let i = 0; i < n; i++) {
          const x = x0 + Math.floor(rnd() * 9), y = y0 + Math.floor(rnd() * 9)
          // Vârful coloanei (cel mai înalt solid din cutie) sau celula de deasupra lui.
          let z = g + 4
          while (z > g - 4 && materialConv(w, x, y, z) === Material.AER) z--
          if (rnd() < 0.5) {
            if (z > g - 4 && materialConv(w, x, y, z) !== Material.APA) dig(t, x, y, z)
          } else if (z + 1 <= g + 4) fill(t, x, y, z + 1, rnd() < 0.5 ? P : Material.PAMANT)
        }
      }, `seed ${seed} lotul ${lot}`)
    }
    assert.ok(b.ev.noi > 0, JSON.stringify(b.ev))
  }
})

test('PROVENIENTA oracol: pe un lot DOAR-FETE (fill PIATRA pe apa de sub podeaua unei case zidite pe iaz) masa se schimba cu epoca pe loc — fata de apa iese la T_sol, piatra apare la T-ul rezultat', () => {
  // Seed 4242, iazul de la 7808 + (10..14, 0..4): apa la −40, un singur strat. Casa 3×3×2 cu pereții și
  // acoperișul de piatră stă pe apă: podeaua ei e apa. Un `fill` pe apa de sub podea nu schimbă nicio acoperire,
  // deci nicio felie nu se reface (ieșirea devreme), dar fața de jos trece din APA în PIATRA.
  const w = createWorld(4242)
  const t = w.terrain
  const x0 = 244 * 32 + 10, y0 = 244 * 32
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    const m = materialAt(t, x0 + dx, y0 + dy, -40)
    assert.ok(m.ok && m.value === Material.APA, 'fixtura: apa la -40')
  }
  for (let z = -39; z <= -38; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) if (dx === 0 || dy === 0 || dx === 4 || dy === 4) ok(fill(t, x0 + dx, y0 + dy, z, P), 'perete')
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) ok(fill(t, x0 + dx, y0 + dy, -37, P), 'acoperis')
  const b = new Banca(w, cutie(x0, y0, -40, x0 + 4, y0 + 4, -37))
  const epoca = w.camere.epoca
  const sch = b.lot(() => ok(fill(t, x0 + 2, y0 + 2, -40, P), 'fill pe apa'), 'fill pe apa')
  assert.equal(w.camere.epoca, epoca, 'fixtura: lotul nu reface nicio felie')
  assert.deepEqual([sch.felii.length, sch.noi.length, sch.feteSchimbate.length, sch.mase.noi.length], [0, 0, 1, 1])
  assert.deepEqual(deLaContoare(sch.mase.noi[0]!.aparuta), [0, 1, 0, 0], 'piatra apare')
  assert.deepEqual(sch.mase.vechi[0]!.solIese.map((v) => [v.d, v.masa.nApa]), [[0, 1]], 'apa iese la T_sol(0)')
})

test('PROVENIENTA depasirea: un lot de peste JURNAL_CAP editari care uneste doua pivnite — recalculul cu instantaneul indexului vechi; unirea primeste id-ul unei surse citite apoi de alta componenta (ordinea consumatorului)', () => {
  const { w, wx, wy, g } = sitPlat(31337, 12)
  const t = w.terrain
  // P la y + 40 (alt bloc, mai departe în ordinea (by, bx)), Q și R la y + 2, săpate în ordinea P, Q, R (id 0, 1, 2).
  const pivnita = (x0: number, y0: number): void => {
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      const gg = groundLevelM(t, x0 + dx, y0 + dy)
      assert.ok(gg.ok)
      for (const z of [g - 4, g - 3]) ok(dig(t, x0 + dx, y0 + dy, z), 'pivnita')
    }
    sincronizeazaCamere(w.camere, t)
  }
  pivnita(wx + 2, wy + 40)
  pivnita(wx + 2, wy + 2)
  pivnita(wx + 6, wy + 2)
  const P0 = componentaLa(w.camere, wx + 3, wy + 41, g - 3)!, Qc = componentaLa(w.camere, wx + 3, wy + 3, g - 3)!, Rc = componentaLa(w.camere, wx + 7, wy + 3, g - 3)!
  assert.deepEqual([P0.id, Qc.id, Rc.id], [0, 1, 2], 'fixtura: id-urile in ordinea sapaturii')
  const b = new Banca(w, cutie(wx + 2, wy + 2, g - 5, wx + 8, wy + 42, g - 2))
  const departe = wx + 300
  const gd = groundLevelM(t, departe, wy)
  assert.ok(gd.ok)
  const sch = b.lot(() => {
    for (let i = 0; i < JURNAL_CAP / 2 + 8; i++) {
      dig(t, departe, wy, gd.value)
      fill(t, departe, wy, gd.value, P)
    }
    // Tunelul dintre Q și R, ultimul: e în partea validă a inelului.
    ok(dig(t, wx + 5, wy + 3, g - 3), 'tunel')
  }, 'depasirea')
  assert.ok(sch.recalcul, 'fixtura: lotul trece de JURNAL_CAP')
  const U = componentaLa(w.camere, wx + 3, wy + 3, g - 3)!, P1 = componentaLa(w.camere, wx + 3, wy + 41, g - 3)!
  assert.equal(componentaLa(w.camere, wx + 7, wy + 3, g - 3)!.id, U.id, 'fixtura: Q si R unite')
  assert.equal(U.id, P0.id, 'fixtura: unirea scrie pe slotul vechi al lui P')
  assert.ok(U.ancora < P1.ancora, 'fixtura: unirea se calculeaza inaintea lui P')
  assert.deepEqual(sch.moarte, [0, 1, 2])
  // Tunelul e în partea validă a inelului: materialul lui vechi se știe (nu e NEC, după solul natural).
  const u = sch.mase.noi.find((y) => y.id === U.id)!
  assert.deepEqual([u.origine.cer, u.origine.nec, u.origine.sol.map((o) => o.celule)], [0, 0, [1]])
})

test('PROVENIENTA prin COMENZI (SAV-7): usa dintre doua pivnite deschisa si zidita la loc de 10 ori prin applyCommand dig / fill — T-ul CONSUMATORULUI (w.temperatura) == oracolul pe forta bruta dupa fiecare comanda, energia la rotunjire', () => {
  const { w, wx, wy, g } = sitPlat(20261001, 12)
  for (const z of [g - 2, g - 3]) for (let dy = 2; dy <= 4; dy++) {
    for (let dx = 2; dx <= 4; dx++) ok(dig(w.terrain, wx + dx, wy + dy, z), 'pivnita A')
    for (let dx = 6; dx <= 8; dx++) ok(dig(w.terrain, wx + dx, wy + dy, z), 'pivnita B')
  }
  const b = new Banca(w, cutie(wx + 1, wy + 1, g - 4, wx + 9, wy + 5, g + 1), { lume: true })
  for (let k = 0; k < 10; k++) {
    b.lot(() => ok(applyCommand(w, { kind: 'dig', wx: wx + 5, wy: wy + 3, z: g - 3 }, R), 'dig'), `usa ${k}`)
    assert.equal(listaComponente(w.camere).length, 1, 'unite')
    b.lot(() => ok(applyCommand(w, { kind: 'fill', wx: wx + 5, wy: wy + 3, z: g - 3, material: P }, R), 'fill'), `zid ${k}`)
    assert.equal(listaComponente(w.camere).length, 2, 'despartite')
  }
  assert.ok(statTermic(w).loturi >= 20, JSON.stringify(statTermic(w)))
})

test('PROVENIENTA prin COMENZI, lot DOAR-FETE (§3, IDX-2): comanda fill PIATRA pe apa de sub podeaua casei de pe iaz — T-ul consumatorului (w.temperatura) == oracolul: apa iese la T_sol, piatra apare la T-ul rezultat', () => {
  const w = createWorld(4242)
  const t = w.terrain
  const x0 = 244 * 32 + 10, y0 = 244 * 32
  for (let z = -39; z <= -38; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) if (dx === 0 || dy === 0 || dx === 4 || dy === 4) ok(fill(t, x0 + dx, y0 + dy, z, P), 'perete')
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) ok(fill(t, x0 + dx, y0 + dy, -37, P), 'acoperis')
  const b = new Banca(w, cutie(x0, y0, -40, x0 + 4, y0 + 4, -37), { lume: true })
  const epoca = w.camere.epoca
  const doarFete = statTermic(w).loturiDoarFete
  b.lot(() => ok(applyCommand(w, { kind: 'fill', wx: x0 + 2, wy: y0 + 2, z: -40, material: P }, R), 'fill pe apa'), 'fill pe apa')
  assert.equal(w.camere.epoca, epoca, 'fixtura: lotul nu reface nicio felie')
  assert.equal(statTermic(w).loturiDoarFete, doarFete + 1, 'un lot doar-fete prin punctul unic')
})

// --- poarta pompei (§9) ------------------------------------------------------------------------

/** N cicluri săpat → astupat pe ACELAȘI tick, în podeaua casei 5×5×2; T-ul (cu restul) după fiecare ciclu. */
function pompa(umplutura: MaterialId, n: number, muta?: (s: SchimbareCamere) => SchimbareCamere): number[] {
  const s = casaTermica()
  const { w } = s
  const [cx, cy, z1] = s.rep.casa!
  const b = new Banca(w, cutie(s.x0, s.y0, z1 - 3, s.x0 + 6, s.y0 + 6, z1 + 3), { relaxare: false })
  const id = componentaLa(w.camere, cx, cy, z1)!.id
  b.stare.t[id] = 20 * Q
  b.stare.rest[id] = 0
  const out: number[] = []
  for (let k = 0; k < n; k++) {
    b.lot(() => ok(dig(w.terrain, cx, cy, z1 - 1), 'groapa'), `groapa ${k}`, muta)
    b.lot(() => ok(fill(w.terrain, cx, cy, z1 - 1, umplutura), 'astupat'), `astupat ${k}`, muta)
    out.push(b.tReal(componentaLa(w.camere, cx, cy, z1)!.id))
  }
  return out
}

test('POARTA POMPEI: 20 de cicluri sapat → astupat in podeaua casei 5x5x2, pe acelasi tick, cu PODEA (piatra) si cu PAMANT — T si restul raman ±2 Q16 dupa primul ciclu; varianta B (solul iese la T-ul incaperii) pompeaza', () => {
  // Vara, casa la 20 °C, T_sol(0) / T_sol(1) mai reci: B trage casa spre sol la fiecare ciclu (verif-JOC-2: −9,78 °C
  // pe 100 de cicluri pe 7×7). C3: primul ciclu înlocuiește o dată IARBA podelei cu piatra (+0,090 °C) sau cu pământul
  // zidit (0), apoi geometria revine identică și T-ul la fel. Măsurat: ciclurile 2..20 la 0 Q16 de primul; saltul la
  // săpat −2,68 °C, la astupat +2,68 °C; B: 20,00 → 5,67 °C în 20 de cicluri (PODEA), 5,97 (PAMANT).
  for (const um of [P, Material.PAMANT] as MaterialId[]) {
    const ts = pompa(um, 20)
    for (let k = 1; k < ts.length; k++) assert.ok(Math.abs(ts[k]! - ts[0]!) <= 2, `${um === P ? 'PODEA' : 'PAMANT'}: ciclul ${k + 1} la ${ts[k]! - ts[0]!} Q16 de primul`)
  }
  // Proba negativă a porții: B, scris pe evidență (solul care iese mutat în „altă masă", la T-ul sursei).
  const B = (s: SchimbareCamere): SchimbareCamere => ({
    ...s,
    mase: {
      ...s.mase,
      vechi: s.mase.vechi.map((v) => {
        const alta = { ...v.altaIese }
        for (const x of v.solIese) {
          alta.nConstr += x.masa.nConstr
          alta.nSolMasiv += x.masa.nSolMasiv
          alta.nApa += x.masa.nApa
        }
        return { ...v, solIese: [], altaIese: alta }
      }),
    },
  })
  const tsB = pompa(P, 6, B)
  assert.ok(tsB[0]! - tsB[5]! > 1 * Q, `B trebuie sa pompeze: ${(tsB[0]! / Q).toFixed(2)} → ${(tsB[5]! / Q).toFixed(2)} °C`)
})

// --- rezerva W_Y = 0 ----------------------------------------------------------------------------

test('PROVENIENTA rezerva: o casa de piatra cu podea de piatra, acoperita intr-un singur lot, porneste de la aerul de afara (CER); o camera scobita intr-un bloc de piatra, de la T_sol al adancimii ei (SOL)', () => {
  const { w, wx, wy, g } = sitPlat(12345, 14)
  const t = w.terrain
  const x0 = wx + 1, y0 = wy + 1
  // Placa de piatră la g+1, pereții la g+2..g+3, acoperișul la g+4: totul construit, niciun sol. Acoperișul
  // dintr-o bucată (un lot): înainte, interiorul e cer întreg — nimic nu persistă, niciun sol nu intră (W_Y = 0).
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) ok(fill(t, x0 + dx, y0 + dy, g + 1, P), 'placa')
  for (let z = g + 2; z <= g + 3; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) if (dx === 0 || dy === 0 || dx === 4 || dy === 4) ok(fill(t, x0 + dx, y0 + dy, z, P), 'perete')
  // Blocul plin 5×5×4 alături, pe sol.
  const bx = x0 + 6
  for (let z = g + 1; z <= g + 4; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) ok(fill(t, bx + dx, y0 + dy, z, P), 'bloc')
  const b = new Banca(w, cutie(x0, y0, g, bx + 4, y0 + 4, g + 5), { relaxare: false })
  const cer = b.lot(() => {
    for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) ok(fill(t, x0 + dx, y0 + dy, g + 4, P), 'acoperis')
  }, 'acoperisul')
  const casa = componentaLa(w.camere, x0 + 2, y0 + 2, g + 2)!
  assert.equal(cer.mase.noi.length, 1)
  assert.deepEqual(cer.mase.noi[0]!.origine, { cer: 18, sol: [], nec: 0 })
  assert.ok(Math.abs(b.tReal(casa.id) - tAfara(w.seed, TICK, R)) <= 1, 'CER → T_afara')
  const sol = b.lot(() => ok(dig(t, bx + 2, y0 + 2, g + 2), 'scobitura'), 'scobitura')
  const cam = componentaLa(w.camere, bx + 2, y0 + 2, g + 2)!
  assert.deepEqual(sol.mase.noi.find((y) => y.id === cam.id)!.origine, { cer: 0, sol: [{ d: 0, celule: 1 }], nec: 0 })
  assert.ok(Math.abs(b.tReal(cam.id) - tSol(0, TICK, R)) <= 1, 'SOL → T_sol(0)')
  assert.ok(Math.abs(tAfara(w.seed, TICK, R) - tSol(0, TICK, R)) > Q, 'fixtura: T_afara si T_sol(0) difera')
  assert.equal(b.ev.rezerva, 2)
})

// --- aritmetica ----------------------------------------------------------------------------------

test('PROVENIENTA aritmetica: Number == BigInt (comutatorul), si o casa la 30.000 °C trece singura pe BigInt (H·P peste 2^53), cu acelasi rezultat', () => {
  const s = casaTermica({ k: 1 })
  const { w } = s
  const [cx, cy, z1] = s.rep.casa!
  const b = new Banca(w, cutie(s.x0, s.y0, z1 - 5, s.x0 + 6, s.y0 + 6, z1 + 3), { relaxare: false })
  const id = componentaLa(w.camere, cx, cy, z1)!.id
  b.stare.t[id] = 30000 * Q
  b.stare.rest[id] = 12345
  // Lotul unește casa cu pivnița (chepengul săpat): Ĥ_casa · P pe Number ar trece de 2^53.
  const [px, py] = s.rep.pivnita!
  b.lot(() => ok(dig(w.terrain, px - 1, py - 1, z1 - 1), 'chepeng'), 'unirea casei fierbinti')
  assert.ok(b.ev.bigInt > 0, 'fixtura: un produs a trecut de 2^53')
})
