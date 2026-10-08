/**
 * Graful termic și regimul permanent — S24-27, tăietura 2a, commit-ul 3 (src/sim/termic.ts; design-temperatura-v2
 * §4.2, §5, §7).
 *
 * Pe HÂRTIE: conductanțele din R-urile content-ului (calculate de mână în comentarii, nu de cod), graful și
 * regimul unor scene mici (casa, pivnița sub iarbă, debaraua de la etajul din mijloc) din acele g-uri, canalele cu
 * ponderile lor. ORACOLUL: graful folosit (refolosit cât timp ștampila nu s-a mișcat) == graful unui index nou,
 * după fiecare lot — aici pe pământul pus pe acoperiș; în camere.test.ts și fete.test.ts pe toate scenele lor
 * (fuzz-ul de cutii, fuzz-ul de suprafață, casa ridicată de pioni peste o pivniță). EXACTITATEA: un nod sintetic
 * pe care Number ar greși, mina de 192×192×3 pe BigInt. ACCEPTANȚA: calibrarea de la §7, pe un an de joc.
 * K05: graful se reface doar la ștampila schimbată.
 *
 * Recenzia t.2a: VENTILAȚIA pe hârtie (casa cu golul ușii, în regim și în canale) și invariantul fețelor DESCHISE;
 * CONVERGENȚA pe un graf lent (hotelul 10x10x4, la ±3 Q16 de soluția în float) și refuzul la plafon; MEMORIILE
 * (contribuția pe bucată, regimul pe (graf, tick)) pe contoarele lor și pe oracol, inclusiv la o epocă nouă.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildM10PeLume } from '../src/harness/fixture-m10.ts'
import { runScenario, standardScenario } from '../src/harness/scenario.ts'
import type { IndexCamere } from '../src/sim/camere.ts'
import { bucataLa, cheieCelula, componentaLa, construiesteCamere, listaComponente, sincronizeazaCamere } from '../src/sim/camere.ts'
import { Anotimp, momentul, tickuriPeAn, tickuriPeOra } from '../src/sim/calendar.ts'
import { tAfara, tSol, ziuaValului } from '../src/sim/clima.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { agregaComponenta, ClasaDir, FelFata, formaCanonicaFete, K_FETE_IMPLICIT, NUME_CLASA, NUME_FEL } from '../src/sim/fete.ts'
import type { ClasaDirId, FelFataId } from '../src/sim/fete.ts'
import { Reason } from '../src/sim/result.ts'
import { decode, encode } from '../src/sim/save.ts'
import type { World } from '../src/sim/state.ts'
import { Material, MATERIAL_MAX } from '../src/sim/terrain/chunk.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { dig, fill, groundLevelM } from '../src/sim/terrain/terrain.ts'
import type { GrafTermic } from '../src/sim/termic.ts'
import {
  BIN_AFARA,
  BIN_APA,
  BIN_SOL,
  canaleTermice,
  conductantaFetei,
  Destinatie,
  formaCanonicaGraf,
  grafTermic,
  margineTemperaturi,
  NUME_DESTINATIE,
  PONDERE_TOTALA,
  regimPermanent,
  rezolvaRegim,
  statGraf,
  statMemorieTermica,
  temperaturaComponentei,
} from '../src/sim/termic.ts'
import { createWorld } from '../src/sim/world.ts'
import { R, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA
const Q = 65536

/** Inelul de ziduri L×L pe [g+1, g+H] și acoperișul la g+H+1, zidite direct în teren; `usa` = celulele USA. */
function casa(t: Terrain, x0: number, y0: number, g: number, L: number, H: number, usa: readonly (readonly [number, number, number])[] = []): void {
  for (let z = g + 1; z <= g + H; z++) for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
    const u = usa.some(([a, b, c]) => a === dx && b === dy && c === z - g)
    assert.ok(fill(t, x0 + dx, y0 + dy, z, u ? Material.USA : P).ok)
  }
  for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) assert.ok(fill(t, x0 + dx, y0 + dy, g + H + 1, P).ok)
}

/** Graful folosit de index (refolosit dacă ștampila nu s-a mișcat); în teste, un refuz aruncă. */
function graf(idx: IndexCamere, rules: Rules = R): GrafTermic {
  const g = grafTermic(idx, rules)
  assert.ok(g.ok, `graful: ${JSON.stringify(g)}`)
  return g.value
}

/** Oracolul grafului: cel folosit == cel al unui index nou (recalculul complet: index, fețe, graf). */
function egalCuGrafulNou(w: World, mesaj: string): void {
  assert.deepEqual(formaCanonicaGraf(graf(w.camere)), formaCanonicaGraf(graf(construiesteCamere(w.terrain))), `${mesaj} (graful)`)
}

/** Numărările unei compoziții: { material: celule }. */
function num(m: Partial<Record<number, number>>): number[] {
  const out = new Array<number>(MATERIAL_MAX + 1).fill(0)
  for (const [k, v] of Object.entries(m).sort()) out[Number(k)] = v!
  return out
}

/** rot(n / d), d > 0, jumătatea departe de zero — pe BigInt, scrisă aici a doua oară, ca referință pe hârtie. */
function rot(n: bigint, d: bigint): number {
  const a = n < 0n ? -n : n
  let q = a / d
  if (2n * (a - q * d) >= d) q++
  return Number(n < 0n ? -q : q) + 0
}

function randuriText(w: World, x: number, y: number, z: number): string[] {
  const c = componentaLa(w.camere, x, y, z)
  assert.ok(c)
  const a = agregaComponenta(w.camere, c!)
  assert.ok(a.ok)
  return a.value.randuri.map((r) => `${NUME_CLASA[r.clasa]} ${NUME_FEL[r.fel]} [${w.camere.fete.compCheie[r.compozitie]}]${r.fel === FelFata.MUCHIE ? '' : r.adancime >= 0 ? ` d${r.adancime}` : ''} x${r.fete}`).sort()
}

/** Donjonul verificatorului L2-3: cameră 3×3×2 cu zid de 1 m, 11 m de piatră plină deasupra. */
function donjon(t: Terrain, x: number, y: number, g: number): void {
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const zid = i === 0 || j === 0 || i === 4 || j === 4
    for (let h = 1; h <= 2; h++) if (zid) assert.ok(fill(t, x + i, y + j, g + h, P).ok)
    for (let h = 3; h <= 13; h++) assert.ok(fill(t, x + i, y + j, g + h, P).ok)
  }
}

const cuK = (k: number): Rules => ({ ...R, termic: { ...R.termic, kCelule: k } })

/** Casa 5×5×2 de piatră cu golul ușii NEÎNCHIS: inelul fără (2, 0) pe ambele niveluri, acoperișul întreg. */
function casaCuGol(t: Terrain, x0: number, y0: number, g: number): void {
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    if (dx === 2 && dy === 0) continue // golul de 1x2, fără ușă
    assert.ok(fill(t, x0 + dx, y0 + dy, z, P).ok)
  }
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(t, x0 + dx, y0 + dy, g + 3, P).ok)
}

/**
 * Hotelul recenziei GRAF (L3-3): un bloc de piatră (2N+1)×(2N+1)×(2H+1) peste sol, cu o cameră de o celulă la
 * fiecare (impar, impar, par) — N²·H încăperi interioare, legate între ele prin 1 m de piatră. Gauss–Seidel cere
 * aici zeci de treceri (diametrul grafului), nu cele 7–9 ale M10.
 */
function hotel(N: number, H: number): World {
  const s = sitPlat(777, 10)
  const t = s.w.terrain
  const x0 = s.wx + 2, y0 = s.wy + 2
  // Fundația de piatră până la cel mai înalt sol de sub bloc.
  let g = Number.NEGATIVE_INFINITY
  for (let x = 0; x <= 2 * N; x++) for (let y = 0; y <= 2 * N; y++) {
    const gg = groundLevelM(t, x0 + x, y0 + y)
    assert.ok(gg.ok)
    g = Math.max(g, gg.value)
  }
  for (let x = 0; x <= 2 * N; x++) for (let y = 0; y <= 2 * N; y++) {
    const gg = groundLevelM(t, x0 + x, y0 + y)
    assert.ok(gg.ok)
    for (let z = gg.value + 1; z <= g; z++) assert.ok(fill(t, x0 + x, y0 + y, z, P).ok)
  }
  for (let z = 1; z <= 2 * H + 1; z++) for (let x = 0; x <= 2 * N; x++) for (let y = 0; y <= 2 * N; y++) {
    if (x % 2 === 1 && y % 2 === 1 && z % 2 === 0) continue // camera
    assert.ok(fill(t, x0 + x, y0 + y, g + z, P).ok)
  }
  sincronizeazaCamere(s.w.camere, t)
  return s.w
}

/** Soluția sistemului grafului în float64 (iterată până la 1e-9 Q16): referința din afara întregilor. */
function solutieExacta(gr: GrafTermic, tRez: ArrayLike<number>): Float64Array {
  const n = gr.n
  const num0 = new Float64Array(n)
  for (let i = 0; i < n; i++) for (let k = gr.rezStart[i]!; k < gr.rezStart[i + 1]!; k++) num0[i] += gr.rezG[k]! * tRez[gr.rezBin[k]!]!
  const T = new Float64Array(n).fill(tRez[BIN_AFARA]!)
  for (let iter = 0; iter < 1_000_000; iter++) {
    let maxd = 0
    for (let i = 0; i < n; i++) {
      let s = num0[i]!
      for (let k = gr.vecStart[i]!; k < gr.vecStart[i + 1]!; k++) s += gr.vecG[k]! * T[gr.vecNod[k]!]!
      const v = s / gr.sumaG[i]!
      maxd = Math.max(maxd, Math.abs(v - T[i]!))
      T[i] = v
    }
    if (maxd < 1e-9) return T
  }
  assert.fail('referinta in float nu converge')
}

// --- 1. K din content -----------------------------------------------------------------

test('TERMIC K: indexul unei lumi e construit cu termic.kCelule din reguli — createWorld si decode; cu K 3 donjonul are alte fete (ADANC [6x3] in loc de [6x8])', () => {
  assert.equal(K_FETE_IMPLICIT, R.termic.kCelule, 'implicitul fetelor e numarul din content, nu o copie')
  const { w, wx, wy, g } = sitPlat(20260913, 7)
  const R3 = cuK(3)
  const w3 = createWorld(20260913, R3)
  assert.equal(w.camere.fete.k, 8)
  assert.equal(w3.camere.fete.k, 3)
  for (const lume of [w, w3]) {
    donjon(lume.terrain, wx, wy, g)
    sincronizeazaCamere(lume.camere, lume.terrain)
  }
  // Pe hârtie: drumul în sus trece prin K celule de piatră și a K+1-a e tot piatră.
  assert.deepEqual(randuriText(w, wx + 2, wy + 2, g + 1), ['JOS SOL [2x1] d0 x9', 'LAT EXT [6x1] x24', 'SUS ADANC [6x8] d0 x9'])
  assert.deepEqual(randuriText(w3, wx + 2, wy + 2, g + 1), ['JOS SOL [2x1] d0 x9', 'LAT EXT [6x1] x24', 'SUS ADANC [6x3] d0 x9'])
  // decode: K-ul e al regulilor cu care se încarcă, nu al salvării (cache-ul de fețe e DERIVED).
  const d3 = decode(encode(w3), R3)
  assert.ok(d3.ok)
  assert.equal(d3.value.camere.fete.k, 3)
  assert.deepEqual(formaCanonicaFete(d3.value.camere), formaCanonicaFete(w3.camere))
  const d8 = decode(encode(w3), R)
  assert.ok(d8.ok)
  assert.equal(d8.value.camere.fete.k, 8)
  assert.deepEqual(randuriText(d8.value, wx + 2, wy + 2, g + 1), ['JOS SOL [2x1] d0 x9', 'LAT EXT [6x1] x24', 'SUS ADANC [6x8] d0 x9'])
})

// --- 2. conductanța, pe hârtie ------------------------------------------------------

test('TERMIC conductanta pe hartie: g = floor(2^16·1000 / R_total), R in miimi din content, pe clasa, fel si compozitie', () => {
  const t = R.termic
  const g = (c: ClasaDirId, f: FelFataId, m: Partial<Record<number, number>>): number => conductantaFetei(t, c, f, num(m))
  // Perete de piatră de 1 m spre afară: R = 130 + 590 + 40 = 760 → 65.536.000 / 760 = 86.231,57.
  assert.equal(g(ClasaDir.LAT, FelFata.EXT, { [P]: 1 }), 86231)
  // Acoperiș de piatră de 1 m: 100 + 590 + 40 = 730 → 89.775,34.
  assert.equal(g(ClasaDir.SUS, FelFata.EXT, { [P]: 1 }), 89775)
  // Pământ pe un acoperiș de piatră (SOL, s = PAMANT): 100 + 590 + 850/2 = 1.115 → 58.776,68.
  assert.equal(g(ClasaDir.SUS, FelFata.SOL, { [P]: 1, [Material.PAMANT]: 1 }), 58776)
  // Tavanul de iarbă al unei pivnițe, direct (SOL, s = IARBA): 100 + 850/2 = 525 → 124.830,48.
  assert.equal(g(ClasaDir.SUS, FelFata.SOL, { [Material.IARBA]: 1 }), 124830)
  // Podeaua de rocă a unei pivnițe (SOL, s = ROCA): 170 + 340/2 = 340 → 192.752,94.
  assert.equal(g(ClasaDir.JOS, FelFata.SOL, { [Material.ROCA]: 1 }), 192752)
  // Muchie printr-o ușă, laterală: 130 + 300 + 130 = 560 → 117.028,57 (simetric, fără R_se).
  assert.equal(g(ClasaDir.LAT, FelFata.MUCHIE, { [Material.USA]: 1 }), 117028)
  // Chepeng (muchie verticală prin ușă): 100 + 300 + 170 = 570 → 114.975,44 — ACEEAȘI din ambele capete.
  assert.equal(g(ClasaDir.SUS, FelFata.MUCHIE, { [Material.USA]: 1 }), 114975)
  assert.equal(g(ClasaDir.JOS, FelFata.MUCHIE, { [Material.USA]: 1 }), 114975)
  // Fața direct în apă: doar R_si = 100 → 655.360.
  assert.equal(g(ClasaDir.SUS, FelFata.APA, {}), 655360)
  // ADÂNC: 8 m de piatră deasupra, fără R_se: 100 + 8 · 590 = 4.820 → 13.596,68.
  assert.equal(g(ClasaDir.SUS, FelFata.ADANC, { [P]: 8 }), 13596)
  // DESCHISĂ: ventilația, 200.000 mW/K = 200 W/K → 200 · 65.536.
  assert.equal(g(ClasaDir.LAT, FelFata.DESCHISA, {}), 13107200)
  // Nu sunt fețe cu conductanță: SINE, și un rând SOL cu două celule de sol (cache-ul ar fi stricat).
  assert.equal(g(ClasaDir.LAT, FelFata.SINE, { [P]: 1 }), -1)
  assert.equal(g(ClasaDir.SUS, FelFata.SOL, { [Material.PAMANT]: 1, [Material.IARBA]: 1 }), -1)
})

// --- 3. graful și regimul, pe hârtie -----------------------------------------------

test('TERMIC graful pe hartie: pivnita 5x5x2 sub IARBA — binurile de sol pe adancime au sumele calculate de mana, fara muchii', () => {
  // Scena din fete.test.ts: tavan IARBA (d 0), pereți PAMANT la d 1 și 2, podea ROCA la d 3.
  const w = createWorld(20260913)
  const t = w.terrain
  const x = 10136, y = 9070, g = -7
  for (let j = 1; j < 6; j++) for (let i = 1; i < 6; i++) for (let dz = 1; dz <= 2; dz++) assert.ok(dig(t, x + i, y + j, g - dz).ok)
  sincronizeazaCamere(w.camere, t)
  const gr = graf(w.camere)
  assert.equal(gr.n, 1)
  assert.equal(gr.muchieA.length, 0)
  const bins: string[] = []
  for (let k = gr.rezStart[0]!; k < gr.rezStart[1]!; k++) bins.push(`${gr.rezBin[k]}:${gr.rezG[k]}`)
  // SUS: 25 · 124.830; pereții: 20 · 118.082 pe fiecare adâncime (130 + 850/2 = 555 → 118.082,88); JOS: 25 · 192.752.
  assert.deepEqual(bins, [`${BIN_SOL + 0}:3120750`, `${BIN_SOL + 1}:2361640`, `${BIN_SOL + 2}:2361640`, `${BIN_SOL + 3}:4818800`])
  assert.equal(gr.sumaG[0], 12662830)
})

test('TERMIC regimul pe hartie: casa 5x5x2 de piatra — T = rot((G_afara·T_afara + G_sol·T_sol(0)) / ΣG) pe tot anul, in doua treceri', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w.terrain, wx, wy, g, 5, 2)
  sincronizeazaCamere(w.camere, w.terrain)
  const c = componentaLa(w.camere, wx + 2, wy + 2, g + 1)!
  // Aer: 9 fețe SUS · 89.775 + 24 LAT · 86.231 = 2.877.519; sol: 9 fețe JOS · 110.144 (170 + 850/2 = 595).
  const gr = graf(w.camere)
  assert.equal(gr.sumaG[0], 2877519 + 991296)
  const an = tickuriPeAn(R)
  for (let tick = 0; tick < an; tick += an / 16 + 1234) {
    const r = regimPermanent(w, R, tick)
    assert.ok(r.ok)
    const asteptat = rot(2877519n * BigInt(tAfara(w.seed, tick, R)) + 991296n * BigInt(tSol(0, tick, R)), 3868815n)
    assert.equal(temperaturaComponentei(r.value, c.id), asteptat, `tickul ${tick}`)
    assert.ok(r.value.convergent)
    assert.ok(r.value.treceri <= 2, 'un nod fara muchii: o trecere care il scrie, una care nu mai schimba nimic')
  }
})

test('TERMIC regimul: apa e rezervor la temperatura SOLULUI de la adancimea ei — pivnita sapata sub un iaz', () => {
  const w = createWorld(4242)
  const t = w.terrain
  const x = 244 * 32 + 8, y = 244 * 32 + 8
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) for (let dz = 1; dz <= 2; dz++) assert.ok(dig(t, x + i, y + j, -40 - dz).ok)
  sincronizeazaCamere(w.camere, t)
  const gr = graf(w.camere)
  let apa = 0
  for (let k = gr.rezStart[0]!; k < gr.rezStart[1]!; k++) if (gr.rezBin[k] === BIN_APA + 0) apa = gr.rezG[k]!
  assert.equal(apa, 9 * 655360, 'cele 9 fete SUS direct in apa, cu doar R_si')
  for (const tick of [0, 300000]) {
    const r = regimPermanent(w, R, tick)
    assert.ok(r.ok)
    for (let d = 0; d <= 64; d++) assert.equal(r.value.tRez[BIN_APA + d], tSol(d, tick, R))
    assert.equal(r.value.tRez[BIN_AFARA], tAfara(w.seed, tick, R))
  }
})

/** Scena verificatorului L1-03 (casa3): casă de piatră 9×9 pe 3 niveluri, la mijloc o debara 2×2×2 cu ușă. */
function casa3(): { w: World; x0: number; y0: number; g: number } {
  const { w, wx, wy, g } = sitPlat(777, 14)
  const t = w.terrain
  const x0 = wx + 2, y0 = wy + 2, L = 9
  for (let z = g + 1; z <= g + 9; z++) {
    const placa = z === g + 3 || z === g + 6 || z === g + 9
    for (let x = 0; x < L; x++) for (let y = 0; y < L; y++) if (placa || x === 0 || y === 0 || x === L - 1 || y === L - 1) assert.ok(fill(t, x0 + x, y0 + y, z, P).ok)
  }
  for (let z = g + 4; z <= g + 5; z++) for (let x = 3; x <= 6; x++) for (let y = 3; y <= 6; y++) {
    if (x > 3 && x < 6 && y > 3 && y < 6) continue
    assert.ok(fill(t, x0 + x, y0 + y, z, x === 4 && y === 3 ? Material.USA : P).ok)
  }
  sincronizeazaCamere(w.camere, t)
  return { w, x0, y0, g }
}

test('TERMIC lema: debaraua MUCHIE 24/24 — fara niciun rezervor, numitorul e > 0, iar echilibrul ei e intreg, finit si media ponderata a vecinilor ±1', () => {
  // Panoul, L1-03: Σg_r / Σg_r = 0/0 pe debara. Regimul ia muchiile: numitorul e Σ g_ij > 0.
  const { w, x0, y0, g } = casa3()
  const deb = componentaLa(w.camere, x0 + 4, y0 + 4, g + 4)!
  const gr = graf(w.camere)
  const i = gr.nodDupaComp[deb.id]!
  assert.equal(gr.rezStart[i], gr.rezStart[i + 1], 'debaraua n-are niciun rezervor')
  // Pe hârtie: 4 fețe SUS și 4 JOS prin placa de 1 m (100 + 590 + 170 = 860 → 76.204), 14 laterale prin zidul de
  // 1 m (130 + 590 + 130 = 850 → 77.101) și 2 prin ușă (560 → 117.028).
  assert.equal(gr.sumaG[i], 8 * 76204 + 14 * 77101 + 2 * 117028)
  assert.equal(gr.vecStart[i + 1]! - gr.vecStart[i]!, 3, 'trei vecine: holul, parterul, etajul de sus')
  const an = tickuriPeAn(R)
  for (const tick of [0, an / 4, an / 2, (3 * an) / 4]) {
    const r = regimPermanent(w, R, tick)
    assert.ok(r.ok)
    assert.ok(r.value.convergent)
    const T = r.value.t
    assert.ok(Number.isInteger(T[i]!))
    let numar = 0n
    for (let k = gr.vecStart[i]!; k < gr.vecStart[i + 1]!; k++) numar += BigInt(gr.vecG[k]!) * BigInt(T[gr.vecNod[k]!]!)
    const den = BigInt(gr.sumaG[i]!)
    assert.equal(T[i], rot(numar, den), `tickul ${tick}: punctul fix al nodului`)
    // ±1 față de media exactă (rațională).
    const dif = BigInt(T[i]!) * den - numar
    assert.ok((dif < 0n ? -dif : dif) <= den, `tickul ${tick}: departe de media vecinilor`)
    // Și nu „câtul rezervoarelor": vecinele au alte temperaturi decât aerul de afară.
    assert.notEqual(T[i], r.value.tAfaraQ16)
  }
})

test('TERMIC muchia o singura data: debaraua si vecinele ei — g-ul muchiei e suma fetelor dintr-un capat, egala cu cea din celalalt, si nu se aduna de doua ori', () => {
  const { w, x0, y0, g } = casa3()
  const gr = graf(w.camere)
  const deb = componentaLa(w.camere, x0 + 4, y0 + 4, g + 4)!
  const t = R.termic
  // Din fiecare capăt, pe rândurile lui (g pe față din conductanță), spre celălalt.
  const sumaSpre = (dela: number, spre: number): number => {
    const a = agregaComponenta(w.camere, w.camere.comp.get(dela)!)
    assert.ok(a.ok)
    let s = 0
    for (const x of a.value.randuri) if (x.fel === FelFata.MUCHIE && x.vecina === spre) s += x.fete * conductantaFetei(t, x.clasa, x.fel, w.camere.fete.compNumarari[x.compozitie]!)
    return s
  }
  let total = 0
  for (let e = 0; e < gr.muchieA.length; e++) {
    const a = gr.comp[gr.muchieA[e]!]!, b = gr.comp[gr.muchieB[e]!]!
    assert.ok(gr.ancora[gr.muchieA[e]!]! < gr.ancora[gr.muchieB[e]!]!, 'muchia e scrisa din capatul cu ancora mai mica')
    assert.equal(gr.muchieG[e], sumaSpre(a, b))
    assert.equal(gr.muchieG[e], sumaSpre(b, a), 'suma din celalalt capat e identica')
    if (a === deb.id || b === deb.id) total += gr.muchieG[e]!
  }
  assert.equal(total, gr.sumaG[gr.nodDupaComp[deb.id]!], 'Σg al debaralei = muchiile ei, o data')
  const perechi = new Set<string>()
  for (let e = 0; e < gr.muchieA.length; e++) perechi.add(`${gr.muchieA[e]}-${gr.muchieB[e]}`)
  assert.equal(perechi.size, gr.muchieA.length, 'o pereche apare o singura data')
})

test('TERMIC invariantul muchiei: o muchie spre o celula care nu e aer acoperit si o muchie asimetrica se refuza cu INVARIANT_INCALCAT — nu bComp[-1], nu un g dublu', () => {
  const { w, wx, wy, g } = sitPlat(12345, 10)
  const t = w.terrain
  for (const x of [1, 2, 4, 5]) for (const z of [g - 5, g - 4]) assert.ok(dig(t, wx + x, wy + 2, z).ok)
  sincronizeazaCamere(w.camere, t)
  const idx = w.camere
  graf(idx)
  const b = bucataLa(idx, wx + 1, wy + 2, g - 4)
  const vechi = idx.fete.inreg[b]!
  try {
    // (1) Un rând MUCHIE care arată în roca dintre cele două pivnițe.
    idx.fete.inreg[b] = { ...vechi, randuri: [...vechi.randuri, { clasa: ClasaDir.LAT, fel: FelFata.MUCHIE, compozitie: 0, prima: Material.ROCA, adancime: -1, dincolo: cheieCelula(wx + 3, wy + 2, g - 4), fete: 1 }] }
    idx.epocaFete++
    const rau = grafTermic(idx, R)
    assert.ok(!rau.ok && rau.reason === Reason.INVARIANT_INCALCAT && String(rau.params.motiv).startsWith('celula de dincolo'), JSON.stringify(rau))
    // (2) O față în plus spre cealaltă pivniță, doar din capătul ăsta: sumele din cele două capete diferă.
    const m = vechi.randuri.find((x) => x.fel === FelFata.MUCHIE)!
    idx.fete.inreg[b] = { ...vechi, randuri: vechi.randuri.map((x) => (x === m ? { ...x, fete: x.fete + 1 } : x)) }
    idx.epocaFete++
    const asim = grafTermic(idx, R)
    assert.ok(!asim.ok && asim.reason === Reason.INVARIANT_INCALCAT && asim.params.motiv === 'muchie asimetrica', JSON.stringify(asim))
    const r = regimPermanent(w, R, 0)
    assert.ok(!r.ok, 'regimul nu ruleaza pe un graf refuzat')
  } finally {
    idx.fete.inreg[b] = vechi
    idx.epocaFete++
  }
  graf(idx)
})

test('TERMIC muchia vazuta doar din capatul MIC: un rand MUCHIE spre o pivnita departata, in bucata pivnitei cu ancora mai mica, se refuza — nu o cuplare fantoma pe care celalalt capat n-o are', () => {
  // Recenzia GRAF, L3-4: testul de mai sus prinde asimetria din capătul MARE; o muchie văzută numai din capătul cu
  // ancora MICĂ o prinde doar numărătoarea muchiilor verificate. Fără ea, CSR-ul o pune în ambele sensuri, iar
  // vara pivnița de la suprafață coboară de la 4,4 la 2,2 °C fără nicio față spre cealaltă.
  const { w, wx, wy, g } = sitPlat(12345, 16)
  const t = w.terrain
  for (const x of [1, 2]) for (const z of [g - 2, g - 1]) assert.ok(dig(t, wx + x, wy + 2, z).ok)
  for (const x of [14, 15]) for (const z of [g - 12, g - 11]) assert.ok(dig(t, wx + x, wy + 2, z).ok)
  sincronizeazaCamere(w.camere, t)
  const A = componentaLa(w.camere, wx + 1, wy + 2, g - 1)!, B = componentaLa(w.camere, wx + 14, wy + 2, g - 11)!
  assert.ok(B.ancora < A.ancora, 'fixtura: B e capatul mic')
  graf(w.camere)
  const b = bucataLa(w.camere, wx + 14, wy + 2, g - 11)
  const vechi = w.camere.fete.inreg[b]!
  try {
    w.camere.fete.inreg[b] = { ...vechi, randuri: [...vechi.randuri, { clasa: ClasaDir.LAT, fel: FelFata.MUCHIE, compozitie: 0, prima: Material.ROCA, adancime: -1, dincolo: cheieCelula(wx + 1, wy + 2, g - 1), fete: 40 }] }
    w.camere.epocaFete++
    const o = grafTermic(w.camere, R)
    assert.ok(!o.ok && o.reason === Reason.INVARIANT_INCALCAT && o.params.motiv === 'muchie vazuta dintr-un singur capat', JSON.stringify(o))
  } finally {
    w.camere.fete.inreg[b] = vechi
    w.camere.epocaFete++
  }
  graf(w.camere)
})

test('TERMIC invariantul fetelor DESCHISE: un rand DESCHISA scris EXT in cache se refuza cu INVARIANT_INCALCAT, in graf si in agregare — nu o ventilatie pierduta tacut', () => {
  // Recenzia FETE, L1-1: oracolul grafului e autoconsistent pe clasificare, iar ventilația (200 W/K pe față) luată
  // drept perete EXT (~5,9 W/K) mută temperatura oricărei componente deschise. Fețele DESCHISA din rânduri se
  // compară cu `deschise` al componentei, numărat de index (camere.ts) pe altă cale.
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casaCuGol(w.terrain, wx, wy, g)
  sincronizeazaCamere(w.camere, w.terrain)
  const idx = w.camere
  const c = componentaLa(idx, wx + 2, wy + 2, g + 1)!
  assert.equal(c.deschise, 2, 'fixtura: golul de 1x2')
  graf(idx)
  assert.ok(agregaComponenta(idx, c).ok)
  const b = bucataLa(idx, wx + 2, wy, g + 1)
  const vechi = idx.fete.inreg[b]!
  const d = vechi.randuri.find((x) => x.fel === FelFata.DESCHISA)
  assert.ok(d, 'fixtura: bucata golului are un rand DESCHISA')
  try {
    idx.fete.inreg[b] = { ...vechi, randuri: vechi.randuri.map((x) => (x === d ? { ...x, fel: FelFata.EXT } : x)) }
    idx.epocaFete++
    const o = grafTermic(idx, R)
    assert.ok(!o.ok && o.reason === Reason.INVARIANT_INCALCAT && o.params.motiv === 'fetele DESCHISA nu sunt fetele deschise ale componentei', JSON.stringify(o))
    const a = agregaComponenta(idx, c)
    assert.ok(!a.ok && a.reason === Reason.INVARIANT_INCALCAT && a.params.motiv === 'fetele DESCHISA nu sunt fetele deschise ale componentei', JSON.stringify(a))
  } finally {
    idx.fete.inreg[b] = vechi
    idx.epocaFete++
  }
  graf(idx)
})

test('TERMIC lema e o garda: cu R-uri in afara domeniului din content (g = 0 prin piatra si prin usa), etajele casei raman fara nicio fata conductiva — refuz, nu NaN', () => {
  const { w } = casa3()
  const material = [...R.termic.material]
  material[P] = 2 ** 40
  material[Material.USA] = 2 ** 40
  const rau: Rules = { ...R, termic: { ...R.termic, material } }
  const o = grafTermic(w.camere, rau)
  assert.ok(!o.ok && o.reason === Reason.INVARIANT_INCALCAT && String(o.params.motiv).startsWith('numitorul'), JSON.stringify(o))
})

// --- 4. Gauss–Seidel: rotunjirea, 2^53 -----------------------------------------------

/** Un graf de un nod, fără muchii, cu binurile date (g pe bin) și alegerea Number / BigInt. */
function nodSintetic(binuri: readonly (readonly [number, number])[], mare: 0 | 1): GrafTermic {
  let suma = 0
  for (const [, g] of binuri) suma += g
  return {
    epoca: 0, epocaFete: 0, reguli: R, n: 1,
    comp: Int32Array.of(0), ancora: Float64Array.of(0), volum: Int32Array.of(1), nodDupaComp: Int32Array.of(0),
    rezStart: Int32Array.of(0, binuri.length), rezBin: Uint8Array.from(binuri.map((b) => b[0])), rezG: Float64Array.from(binuri.map((b) => b[1])),
    muchieA: new Int32Array(0), muchieB: new Int32Array(0), muchieG: new Float64Array(0),
    vecStart: Int32Array.of(0, 0), vecNod: new Int32Array(0), vecG: new Float64Array(0),
    sumaG: Float64Array.of(suma), mare: Uint8Array.of(mare), margineT: margineTemperaturi(R),
  }
}

test('TERMIC rotunjirea e simetrica: jumatatea se rotunjeste departe de zero, pe Number si pe BigInt (rot(-x) = -rot(x))', () => {
  const t = new Int32Array(131)
  for (const mare of [0, 1] as const) {
    const gr = nodSintetic([[0, 1], [1, 1]], mare)
    t[0] = 0
    t[1] = 1
    assert.equal(rezolvaRegim(gr, t, 7).t[0], 1, `+0,5 (mare ${mare})`)
    t[1] = -1
    assert.equal(rezolvaRegim(gr, t, 7).t[0], -1, `−0,5 (mare ${mare})`)
    t[0] = -2
    t[1] = -3
    assert.equal(rezolvaRegim(gr, t, 7).t[0], -3, `−2,5 (mare ${mare})`)
    // 2 · (−1) + 1 · 0 = −2, pe 3: −0,67 → −1; 1 · (−1) + 2 · 0 = −1, pe 3: −0,33 → 0 (nu −0).
    const g2 = nodSintetic([[0, 2], [1, 1]], mare)
    t[0] = -1
    t[1] = 0
    assert.equal(rezolvaRegim(g2, t, 7).t[0], -1)
    const g3 = nodSintetic([[0, 1], [1, 2]], mare)
    assert.ok(Object.is(rezolvaRegim(g3, t, 7).t[0], 0))
  }
})

test('TERMIC 2^53: un nod cu Σg ≈ 2^34 la 38 °C — pe Number fara garda, Σ g·T (2^55) iese rotunjit in sus; nodul marcat mare se rezolva pe BigInt, exact', () => {
  // Pe hârtie: g1 = (D + 1)/2, g2 = (D − 1)/2, D = 17.864.561.145, T2 = T1 + 1. Media = T1 + g2/D = T1 + 0,49999999997,
  // deci rot = T1. Σ g·T = 44.508.616.203.307.387 ≈ 2^55,3: în double, ulp-ul e 8, iar rotunjirea sumei trece de jumătate.
  const g1 = 8932280573, g2 = 8932280572, T1 = 2491447
  const t = new Int32Array(131)
  t[0] = T1
  t[1] = T1 + 1
  const binuri = [[0, g1], [1, g2]] as const
  assert.equal(rezolvaRegim(nodSintetic(binuri, 1), t, 0).t[0], T1, 'BigInt: exact')
  assert.equal(rezolvaRegim(nodSintetic(binuri, 0), t, 0).t[0], T1 + 1, 'controlul: Number fara garda greseste aici')
  assert.ok((g1 + g2) * margineTemperaturi(R) >= 2 ** 52, 'nodul trece de margine, deci constructia grafului l-ar marca mare')
})

test('TERMIC 2^53: marginea temperaturilor e o margine — niciun rezervor nu iese din ea, pe un an, si cu o clima extrema', () => {
  const extrema: Rules = { ...R, clima: { ...R.clima, tMedieMc: -5000, amplitudineAnMc: 20000, amplitudineZiMc: 10000, valFrig: { ...R.clima.valFrig, amplitudineMc: -30000 } } }
  for (const rules of [R, extrema]) {
    const M = margineTemperaturi(rules)
    const an = tickuriPeAn(rules)
    let max = 0
    for (let tick = 0; tick < an; tick += tickuriPeOra(rules) / 4) {
      for (const v of [tAfara(12345, tick, rules), tSol(0, tick, rules), tSol(1, tick, rules), tSol(64, tick, rules)]) max = Math.max(max, Math.abs(v))
    }
    assert.ok(max <= M, `max ${max / Q} °C > M ${M / Q} °C`)
  }
})

test('TERMIC 2^53: fiecare termen al marginii e necesar — intr-o clima in care el singur domina, |T| ajunge la 3 °C de M, pe toate adancimile 0..64', () => {
  // Recenzia GRAF, L3-5: clima „extremă" de mai sus are toți termenii deodată și M iese larg (45,6 °C față de un
  // |T| real de 26,8 °C), deci M rămâne margine și fără un termen. Aici fiecare termen e singur (plus media, unde
  // el e o abatere de la ea): fără el, |T| trece de M.
  const c = R.clima
  const zero = { ...c, tMedieMc: 0, amplitudineAnMc: 0, amplitudineZiMc: 0, valFrig: { ...c.valFrig, amplitudineMc: 0 }, deltaAdancMc: 0 }
  const clime: [string, Rules][] = [
    ['deltaAdanc', { ...R, clima: { ...zero, tMedieMc: -50000, deltaAdancMc: -50000 } }],
    ['amplitudineZi', { ...R, clima: { ...zero, amplitudineZiMc: 50000 } }],
    ['amplitudineAn', { ...R, clima: { ...zero, amplitudineAnMc: 50000 } }],
    ['valFrig', { ...R, clima: { ...zero, valFrig: { ...c.valFrig, amplitudineMc: -50000 } } }],
  ]
  for (const [nume, rules] of clime) {
    const M = margineTemperaturi(rules)
    let max = 0
    for (let tick = 0; tick < tickuriPeAn(rules); tick += tickuriPeOra(rules) / 4) {
      max = Math.max(max, Math.abs(tAfara(12345, tick, rules)))
      for (let d = 0; d <= 64; d++) max = Math.max(max, Math.abs(tSol(d, tick, rules)))
    }
    assert.ok(max <= M, `${nume}: max ${max / Q} °C > M ${M / Q} °C`)
    assert.ok(max > M - 3 * Q, `${nume}: termenul nu domina (max ${max / Q} °C, M ${M / Q} °C)`)
  }
})

test('TERMIC 2^53: mina de 192x192x3 — Σg ≈ 2^34, nodul e pe BigInt, iar regimul e acelasi cu cel calculat totul pe BigInt si cu cel pe Number', () => {
  // Mina panoului (NUM, geom.ts): 192×192 cu stâlpi de 1×1 la fiecare 4 m, la 2–4 m sub sol, săpată dintr-un lot.
  const s = sitPlat(12345, 8)
  const w = s.w
  const t = w.terrain
  const x0 = s.wx + 2, y0 = s.wy + 2, N = 192
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (x % 4 === 0 && y % 4 === 0) continue
    const gg = groundLevelM(t, x0 + x, y0 + y)
    assert.ok(gg.ok)
    for (let d = 2; d <= 4; d++) dig(t, x0 + x, y0 + y, gg.value - d)
  }
  sincronizeazaCamere(w.camere, t)
  const gr = graf(w.camere)
  assert.equal(gr.n, 1)
  assert.equal(gr.volum[0], 103680)
  assert.ok(gr.sumaG[0]! > 2 ** 33, `Σg = ${gr.sumaG[0]}`)
  assert.equal(gr.mare[0], 1, 'nodul minei trece de 2^52 cu marginea temperaturilor')
  const numar = { ...gr, mare: new Uint8Array(1) }
  const ora = tickuriPeOra(R)
  for (let tick = 0; tick < tickuriPeAn(R); tick += 7 * ora) {
    const r = regimPermanent(w, R, tick)
    assert.ok(r.ok)
    assert.equal(r.value.t[0], rezolvaRegim(gr, r.value.tRez, r.value.tAfaraQ16, true).t[0], `tickul ${tick}: BigInt`)
    assert.equal(r.value.t[0], rezolvaRegim(numar, r.value.tRez, r.value.tAfaraQ16).t[0], `tickul ${tick}: Number`)
  }
  // Controlul: o casă mică nu e pe BigInt.
  const { w: w2, wx, wy, g } = sitPlat(12345, 12)
  casa(w2.terrain, wx, wy, g, 5, 2)
  sincronizeazaCamere(w2.camere, w2.terrain)
  assert.equal(graf(w2.camere).mare[0], 0)
})

test('TERMIC M10: 677 de noduri si 1.776 de muchii (cifrele hartii), hub-ul pe BigInt, Gauss–Seidel converge in cel mult 9 treceri si da exact regimul calculat totul pe BigInt', () => {
  const w = createWorld(20260913)
  assert.ok(applyCommand(w, { kind: 'setFocus', cx: 300, cy: 300 }).ok)
  buildM10PeLume(w, 300, 300)
  const gr = graf(w.camere)
  assert.equal(gr.n, 677)
  assert.equal(gr.muchieA.length, 1776)
  let mari = 0
  for (let i = 0; i < gr.n; i++) mari += gr.mare[i]!
  assert.equal(mari, 1, 'doar hub-ul de coridoare')
  for (const tick of [0, 233520, 576240]) {
    const r = regimPermanent(w, R, tick)
    assert.ok(r.ok)
    assert.ok(r.value.convergent && r.value.treceri <= 9, `tickul ${tick}: ${r.value.treceri} treceri`)
    assert.deepEqual([...r.value.t], [...rezolvaRegim(gr, r.value.tRez, r.value.tAfaraQ16, true).t])
    // Punctul fix pe întregi NU e unic (recenzia GRAF, L3-3: pe un hotel, 1–5 Q16 între porniri), deci pornit din 0
    // regimul nu e cerut identic, ci la ±1 Q16 pe fiecare nod.
    const din0 = rezolvaRegim(gr, r.value.tRez, 0).t
    for (let i = 0; i < gr.n; i++) assert.ok(Math.abs(r.value.t[i]! - din0[i]!) <= 1, `tickul ${tick}, nodul ${i}: ${r.value.t[i]} fata de ${din0[i]}`)
  }
})

test('TERMIC convergenta: hotelul 10x10x4 (400 de camere interioare) cere zeci de treceri — regimul converge si fiecare nod e la ±3 Q16 de solutia in float; la plafon, refuz CAPACITATE_DEPASITA, nu cifre neconvergente', () => {
  // Recenzia GRAF, L3-3: cea mai lentă scenă din suite era M10 (7–9 treceri), deci plafonul putea coborî la 10 cu
  // toate testele verzi, iar un regim neconvergent ajungea pe ecran (la plafonul 20, 3,9 °C eroare pe 30x30x10).
  const w = hotel(10, 4)
  const tick = 576240
  const r = regimPermanent(w, R, tick)
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(r.value.graf.n, 400)
  assert.ok(r.value.treceri > 40, `fixtura: doar ${r.value.treceri} treceri`)
  assert.ok(r.value.convergent)
  const ex = solutieExacta(r.value.graf, r.value.tRez)
  for (let i = 0; i < r.value.graf.n; i++) assert.ok(Math.abs(r.value.t[i]! - ex[i]!) <= 3, `nodul ${i}: ${r.value.t[i]} fata de ${ex[i]}`)
  // Plafonul: 5 treceri nu ajung la punctul fix — refuz, cu trecerile făcute; plafonul e în cheia memoriei regimului.
  const p = regimPermanent(w, R, tick, 5)
  assert.ok(!p.ok && p.reason === Reason.CAPACITATE_DEPASITA && p.params.treceri === 5, JSON.stringify(p))
  assert.ok(regimPermanent(w, R, tick).ok, 'cu plafonul obisnuit, tot convergent')
})

// --- 5. canalele ---------------------------------------------------------------------

/** Rândurile canalelor, ca text: „JOS SOL 24940 [1x1] g1". */
function canale(w: World, compId: number, tick: number): { text: string[]; c: ReturnType<typeof canaleTermice> } {
  const c = canaleTermice(w, R, compId, tick)
  assert.ok(c.ok, JSON.stringify(c))
  let suma = c.value.rest.pondereQ16
  for (const r of c.value.randuri) suma += r.pondereQ16
  assert.equal(suma, PONDERE_TOTALA, 'ponderile + restul = 100%')
  assert.ok(c.value.randuri.length <= 3)
  return { text: c.value.randuri.map((r) => `${NUME_CLASA[r.clasa]} ${NUME_DESTINATIE[r.destinatie]}${r.usa ? '+usa' : ''}${r.deschis ? '+gol' : ''} ${r.pondereQ16} [${r.compozitie}] g${r.grosime}`), c }
}

test('TERMIC canale pe hartie: pivnita 5x5x2 sub IARBA — podeaua, peretii, tavanul, cu ponderile in ΣG si solul fiecaruia', () => {
  const w = createWorld(20260913)
  const t = w.terrain
  const x = 10136, y = 9070, g = -7
  for (let j = 1; j < 6; j++) for (let i = 1; i < 6; i++) for (let dz = 1; dz <= 2; dz++) assert.ok(dig(t, x + i, y + j, g - dz).ok)
  sincronizeazaCamere(w.camere, t)
  const c = componentaLa(w.camere, x + 3, y + 3, g - 1)!
  const tick = 300000
  const { text, c: o } = canale(w, c.id, tick)
  // Pe hârtie: G = 4.818.800 (podeaua) / 4.723.280 (pereții) / 3.120.750 (tavanul), Σ 12.662.830; ponderile pe sume
  // cumulate: rot(4.818.800 · 65.536 / Σ) = 24.940; rot(9.542.080 · 65.536 / Σ) = 49.385 → 24.445; restul 16.151.
  assert.deepEqual(text, ['JOS SOL 24940 [1x1] g1', 'LAT SOL 24445 [2x1] g1', 'SUS SOL 16151 [3x1] g1'])
  assert.deepEqual(o.ok && o.value.rest, { pondereQ16: 0, grupuri: 0 })
  assert.ok(o.ok)
  const r = o.value.randuri
  assert.equal(r[0]!.tDestQ16, tSol(3, tick, R))
  assert.equal(r[1]!.tDestQ16, rot(BigInt(tSol(1, tick, R)) + BigInt(tSol(2, tick, R)), 2n), 'peretii: media pe G a solului de la 1 si 2 m')
  assert.equal(r[2]!.tDestQ16, tSol(0, tick, R))
  assert.equal(o.value.sumaG, 12662830)
  assert.equal(o.value.tQ16, rot(4818800n * BigInt(tSol(3, tick, R)) + 2361640n * BigInt(tSol(1, tick, R) + tSol(2, tick, R)) + 3120750n * BigInt(tSol(0, tick, R)), 12662830n))
})

test('TERMIC canale pe hartie: casa 5x5x2 cu usa — peretii, podeaua, acoperisul, iar usa e un grup separat, in rest', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w.terrain, wx, wy, g, 5, 2, [[2, 0, 1]])
  sincronizeazaCamere(w.camere, w.terrain)
  const c = componentaLa(w.camere, wx + 2, wy + 2, g + 1)!
  // Pe hârtie: 23 de pereți · 86.231 = 1.983.313; podeaua 9 · 110.144 = 991.296; acoperișul 9 · 89.775 = 807.975;
  // ușa 1 · 139.438 (130 + 300 + 40 = 470). Σ 3.922.022. Cumulat: 33.141; 49.705 → 16.564; 63.206 → 13.501; rest 2.330.
  const unu = canale(w, c.id, 100000)
  assert.deepEqual(unu.text, ['LAT AFARA 33141 [6x1] g1', 'JOS SOL 16564 [3x1] g1', 'SUS AFARA 13501 [6x1] g1'])
  assert.ok(unu.c.ok)
  assert.deepEqual(unu.c.value.rest, { pondereQ16: 2330, grupuri: 1 })
  assert.equal(unu.c.value.randuri[0]!.tDestQ16, tAfara(w.seed, 100000, R))
  // Ordinea e geometrică: la alt tick (altă vreme, alt echilibru), aceleași rânduri, aceleași ponderi.
  const doi = canale(w, c.id, 400000)
  assert.deepEqual(doi.text, unu.text)
  assert.ok(doi.c.ok && doi.c.value.tQ16 !== unu.c.value.tQ16, 'fixtura: temperatura s-a schimbat intre cele doua tickuri')
})

test('TERMIC pe hartie: casa 5x5x2 cu golul usii NEINCHIS — cele 2 fete ale golului sunt ventilatie (G_deschis 200 W/K fiecare) spre AFARA, in regim si in canale, grupul lor (nu al peretilor)', () => {
  // Recenzia FETE, L1-1 (verificatorul): nicio probă nu conținea o față DESCHISA, deci ventilația clasificată EXT (în
  // fețe) sau dusă pe ramura solului (în canale) trecea toată suita. Recenzia ECRAN, L4-1: golul e grupul lui.
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casaCuGol(w.terrain, wx, wy, g)
  sincronizeazaCamere(w.camere, w.terrain)
  const c = componentaLa(w.camere, wx + 2, wy + 2, g + 1)!
  assert.equal(c.deschise, 2, 'fixtura: golul de 1x2 e deschis')
  // Pe hârtie (R în miimi: R_si lat 130, sus 100, jos 170; R_se 40; piatra 590; pământul 850): golul 2 fețe DESCHISA
  // · 200 W/K = 2 · 13.107.200; pereții 22 · 86.231 (2R = 260 + 1.180 + 80 = 1.520); laturile golului prin 2 m de zid
  // 4 · 48.545 (2R = 260 + 2.360 + 80 = 2.700); acoperișul 10 · 89.775; podeaua 10 · 110.144 (2R = 340 + 850 =
  // 1.190). G_afara = 29.203.412, G_sol(0) = 1.101.440, Σ 30.304.852.
  const an = tickuriPeAn(R)
  for (let tick = 0; tick < an; tick += an / 8 + 777) {
    const r = regimPermanent(w, R, tick)
    assert.ok(r.ok)
    const asteptat = rot(29203412n * BigInt(tAfara(w.seed, tick, R)) + 1101440n * BigInt(tSol(0, tick, R)), 30304852n)
    assert.equal(temperaturaComponentei(r.value, c.id), asteptat, `tickul ${tick}`)
  }
  // Canalele: golul (26.214.400) e grupul lui, cu drumul gol; pereții spre aer (2.091.262) alt grup. Cumulat:
  // rot(26.214.400 · 65.536 / Σ) = 56.690; + pereții → 61.213 (4.523); + podeaua → 63.595 (2.382); restul, acoperișul, 1.941.
  const k = canale(w, c.id, 100000)
  assert.deepEqual(k.text, ['LAT AFARA+gol 56690 [] g0', 'LAT AFARA 4523 [6x1] g1', 'JOS SOL 2382 [3x1] g1'])
  assert.ok(k.c.ok)
  const gol = k.c.value.randuri[0]!
  assert.deepEqual([gol.gQ16, gol.fete, gol.material, gol.tDestQ16], [26214400, 2, -1, tAfara(w.seed, 100000, R)])
  assert.deepEqual(k.c.value.rest, { pondereQ16: 1941, grupuri: 1 })
})

test('TERMIC canale: un sopron (acoperis pe un stalp) cu gDeschis 0, content valid — fetele DESCHISE nu poarta nimic si nu intra in niciun grup; canalele raspund, nu arunca', () => {
  // Recenzia GRAF, L3-1: cu gDeschis 0 grupul golului avea g = 0, iar temperatura destinației lui împărțea la 0n
  // (RangeError în inspector, la fiecare reîmprospătare). Specificația termică permite minimul 0.
  const brut = JSON.parse(readFileSync(new URL('../content/rules.json', import.meta.url), 'utf8'))
  brut.termic.gDeschisMilliWPeK = 0
  const pr = parseRules(brut)
  assert.ok(pr.ok, `gDeschis 0 e content valid: ${JSON.stringify(pr)}`)
  const R0 = pr.value
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const t = w.terrain
  for (let z = g + 1; z <= g + 2; z++) assert.ok(fill(t, wx + 1, wy + 1, z, P).ok)
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) assert.ok(fill(t, wx + dx, wy + dy, g + 3, P).ok)
  sincronizeazaCamere(w.camere, t)
  const c = componentaLa(w.camere, wx, wy, g + 1)!
  // 8 celule pe nivel: 12 fețe laterale spre cer pe nivel (DESCHISA), 4 spre stâlp (SINE).
  assert.deepEqual([c.volum, c.deschise], [16, 24], 'fixtura: sopronul')
  const o = canaleTermice(w, R0, c.id, 1000)
  assert.ok(o.ok, JSON.stringify(o))
  // Pe hârtie: podeaua 8 · 110.144 = 881.152 spre sol, acoperișul 8 · 89.775 = 718.200 spre aer; Σ 1.599.352, iar
  // golul, cu g 0, nu e nici rând, nici „rest".
  assert.deepEqual(o.value.randuri.map((r) => [NUME_CLASA[r.clasa], NUME_DESTINATIE[r.destinatie], r.deschis, r.gQ16, r.fete]), [
    ['JOS', 'SOL', false, 881152, 8],
    ['SUS', 'AFARA', false, 718200, 8],
  ])
  assert.deepEqual(o.value.rest, { pondereQ16: 0, grupuri: 0 })
  assert.equal(o.value.sumaG, 1599352)
})

test('TERMIC canale: o galerie intre alte doua, prin 1 m de roca — vecinele se contopesc intr-un singur rand LAT INCAPERI, cu temperatura medie pe G', () => {
  // Trei galerii paralele, lungi de 6 m, înalte de 2, la 4–5 m sub sol: vestul lată de 3, mijlocul de 1, estul de 1.
  const { w, wx, wy, g } = sitPlat(12345, 16)
  const t = w.terrain
  for (const x of [1, 2, 3, 5, 7]) for (let y = 1; y <= 6; y++) for (const z of [g - 5, g - 4]) assert.ok(dig(t, wx + x, wy + y, z).ok)
  sincronizeazaCamere(w.camere, t)
  const vest = componentaLa(w.camere, wx + 2, wy + 2, g - 4)!, mij = componentaLa(w.camere, wx + 5, wy + 2, g - 4)!, est = componentaLa(w.camere, wx + 7, wy + 2, g - 4)!
  assert.equal(new Set([vest.id, mij.id, est.id]).size, 3)
  const tick = 200000
  const reg = regimPermanent(w, R, tick)
  assert.ok(reg.ok)
  const tv = temperaturaComponentei(reg.value, vest.id)!, te = temperaturaComponentei(reg.value, est.id)!
  assert.notEqual(tv, te, 'fixtura: vecinele au temperaturi diferite')
  const { text, c: o } = canale(w, mij.id, tick)
  assert.ok(o.ok)
  // Pe hârtie: 12 fețe spre fiecare vecină, prin 1 m de rocă (130 + 340 + 130 = 600 → 109.226); 24 · 109.226 =
  // 2.621.424 — mai mult decât tavanul (6 · 242.725: 100 + 170 = 270), podeaua (6 · 192.752) și capetele (4 · 218.453:
  // 130 + 170 = 300). Σ 6.108.098; cumulat: 28.126; 43.752 → 15.626; 56.161 → 12.409; restul 9.375.
  assert.deepEqual(text, ['LAT INCAPERI 28126 [1x1] g1', 'SUS SOL 15626 [1x1] g1', 'JOS SOL 12409 [1x1] g1'])
  const r = o.value.randuri[0]!
  assert.equal(r.destinatie, Destinatie.INCAPERI)
  assert.equal(r.fete, 24, 'ambele vecine, intr-un rand')
  assert.equal(r.gQ16, 24 * 109226)
  assert.equal(r.tDestQ16, rot(BigInt(tv) + BigInt(te), 2n), 'media pe G (G-uri egale): media celor doua')
  assert.deepEqual(o.value.rest, { pondereQ16: 9375, grupuri: 1 })
})

test('TERMIC canale: donjonul — fata ADANC in sus e numita separat (destinatia ADANC, 8 m de piatra), nu „sol"', () => {
  const { w, wx, wy, g } = sitPlat(20260913, 7)
  donjon(w.terrain, wx, wy, g)
  sincronizeazaCamere(w.camere, w.terrain)
  const c = componentaLa(w.camere, wx + 2, wy + 2, g + 1)!
  const o = canaleTermice(w, R, c.id, 0)
  assert.ok(o.ok)
  const sus = o.value.randuri.find((r) => r.clasa === ClasaDir.SUS)
  assert.ok(sus, JSON.stringify(o.value))
  assert.deepEqual([NUME_DESTINATIE[sus!.destinatie], sus!.compozitie, sus!.grosime, sus!.material], ['ADANC', '6x8', 8, P])
  // Rezervorul fețelor ADÂNC e solul de la capătul lor (aici d 0): pe hârtie, podeaua 9 · 110.144 (170 + 850/2), pereții
  // 24 · 86.231 spre aer, tavanul 9 · 13.596 (100 + 8 · 590).
  for (const tick of [0, 300000]) {
    const T = rot(BigInt(9 * 110144 + 9 * 13596) * BigInt(tSol(0, tick, R)) + BigInt(24 * 86231) * BigInt(tAfara(w.seed, tick, R)), BigInt(9 * 110144 + 24 * 86231 + 9 * 13596))
    const r = regimPermanent(w, R, tick)
    assert.ok(r.ok)
    assert.equal(temperaturaComponentei(r.value, c.id), T, `tickul ${tick}`)
  }
  const id = canaleTermice(w, R, 99999, 0)
  assert.ok(!id.ok && id.reason === Reason.ENTITATE_INEXISTENTA)
})

// --- 6. oracolul și K05 -------------------------------------------------------------

test('TERMIC oracol: pamant pe acoperisul unei case — fara epoca noua, graful folosit == graful unui index nou dupa fiecare lot, iar echilibrul casei coboara', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const t = w.terrain
  casa(t, wx, wy, g, 5, 2)
  sincronizeazaCamere(w.camere, t)
  egalCuGrafulNou(w, 'casa')
  const c = componentaLa(w.camere, wx + 2, wy + 2, g + 1)!
  const vara = 576240
  const inainte = regimPermanent(w, R, vara)
  assert.ok(inainte.ok)
  const epoca = w.camere.epoca
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    assert.ok(fill(t, wx + dx, wy + dy, g + 4, Material.PAMANT).ok)
    sincronizeazaCamere(w.camere, t)
    assert.equal(w.camere.epoca, epoca, 'fixtura: pamantul pe acoperis nu misca epoca')
    egalCuGrafulNou(w, `pamant (${dx},${dy})`)
  }
  const dupa = regimPermanent(w, R, vara)
  assert.ok(dupa.ok)
  // Vara, acoperișul spre aerul de 25 °C devine sol la ~13 °C: echilibrul casei scade.
  assert.ok(temperaturaComponentei(dupa.value, c.id)! < temperaturaComponentei(inainte.value, c.id)! - Q, 'echilibrul n-a coborat cu un grad')
})

test('TERMIC K05: graful se reface doar cand stampila (epoca, epocaFete, regulile) se schimba — o sapatura departe de orice fata nu-l reface', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const t = w.terrain
  casa(t, wx, wy, g, 5, 2)
  sincronizeazaCamere(w.camere, t)
  assert.deepEqual(statGraf(w.camere), { refaceri: 0, refolosiri: 0 })
  graf(w.camere)
  graf(w.camere)
  assert.ok(regimPermanent(w, R, 0).ok)
  assert.deepEqual(statGraf(w.camere), { refaceri: 1, refolosiri: 2 })
  // O săpătură într-o carieră deschisă, departe: nicio față, nicio felie.
  assert.ok(dig(t, wx + 10, wy + 10, g).ok)
  sincronizeazaCamere(w.camere, t)
  graf(w.camere)
  assert.deepEqual(statGraf(w.camere), { refaceri: 1, refolosiri: 3 })
  // Pământ pe acoperiș, deasupra interiorului: doar fețele (epocaFete).
  assert.ok(fill(t, wx + 2, wy + 2, g + 4, Material.PAMANT).ok)
  sincronizeazaCamere(w.camere, t)
  graf(w.camere)
  assert.deepEqual(statGraf(w.camere), { refaceri: 2, refolosiri: 3 })
  // Alte reguli (alt R al pietrei): alt graf.
  const material = [...R.termic.material]
  material[P] = 400
  const alte: Rules = { ...R, termic: { ...R.termic, material } }
  const ga = graf(w.camere, alte)
  assert.deepEqual(statGraf(w.camere), { refaceri: 3, refolosiri: 3 })
  assert.notEqual(ga.sumaG[0], graf(w.camere).sumaG[0])
})

test('TERMIC K05: scenariul standard (0 componente) nu plateste nimic — simularea nu cere graful, iar cerut, e gol', () => {
  const r = runScenario(standardScenario(12345, 3000, 20))
  assert.deepEqual(statGraf(r.world.camere), { refaceri: 0, refolosiri: 0 })
  const reg = regimPermanent(r.world, R, r.world.tick)
  assert.ok(reg.ok)
  assert.equal(reg.value.t.length, 0)
  assert.equal(reg.value.treceri, 1)
})

test('TERMIC slot liber: o pivnita astupata lasa un slot liber sub cUrmator — temperatura lui e null, nu a nodului 0', () => {
  // Recenzia GRAF, L3-6: fără `fill(-1)` pe `nodDupaComp`, un id eliberat (dar sub cUrmator) primea nodul 0, iar
  // overlay-ul ar fi colorat o încăpere cu temperatura alteia.
  const { w, wx, wy, g } = sitPlat(12345, 16)
  const t = w.terrain
  for (const x of [1, 2]) for (const z of [g - 5, g - 4]) assert.ok(dig(t, wx + x, wy + 2, z).ok)
  for (const x of [10, 11]) for (const z of [g - 5, g - 4]) assert.ok(dig(t, wx + x, wy + 2, z).ok)
  sincronizeazaCamere(w.camere, t)
  const A = componentaLa(w.camere, wx + 1, wy + 2, g - 4)!
  for (const x of [1, 2]) for (const z of [g - 5, g - 4]) assert.ok(fill(t, wx + x, wy + 2, z, P).ok)
  sincronizeazaCamere(w.camere, t)
  assert.ok(!w.camere.comp.has(A.id) && A.id < w.camere.cUrmator, 'fixtura: slotul lui A e liber, sub cUrmator')
  const r = regimPermanent(w, R, 0)
  assert.ok(r.ok)
  assert.equal(r.value.graf.n, 1)
  assert.equal(temperaturaComponentei(r.value, A.id), null)
})

test('TERMIC memoria contributiilor: pamant pe acoperisul casei cu trei niveluri — la refacere se calculeaza doar bucatile cu randuri noi, iar graful == cel al unui index nou', () => {
  // Recenzia GRAF, L3-2: refacerea grafului după o editare care schimbă doar fețele costa 7–18 ms pe M10, într-un
  // singur cadru; contribuția fiecărei bucăți se memorează acum pe identitatea tabloului ei de rânduri.
  const { w, x0, y0, g } = casa3()
  const idx = w.camere
  graf(idx)
  let bucati = 0
  for (const c of listaComponente(idx)) bucati += c.bucati.length
  assert.equal(statMemorieTermica(idx).bucatiCalculate, bucati, 'prima refacere calculeaza fiecare bucata')
  for (const [dx, dy] of [[4, 4], [1, 1], [7, 2]] as const) {
    const inainte = [...idx.fete.inreg]
    const st = statMemorieTermica(idx).bucatiCalculate
    const epoca = idx.epoca
    assert.ok(fill(w.terrain, x0 + dx, y0 + dy, g + 10, Material.PAMANT).ok)
    sincronizeazaCamere(idx, w.terrain)
    assert.equal(idx.epoca, epoca, 'fixtura: pamantul pe acoperis schimba doar fetele')
    let noi = 0
    for (const c of listaComponente(idx)) for (const b of c.bucati) if (idx.fete.inreg[b] !== inainte[b]) noi++
    assert.ok(noi > 0 && noi < bucati, `fixtura: ${noi} din ${bucati} bucati cu randuri noi`)
    egalCuGrafulNou(w, `pamant (${dx},${dy})`)
    assert.equal(statMemorieTermica(idx).bucatiCalculate - st, noi, `pamant (${dx},${dy}): doar bucatile cu randuri noi`)
  }
})

test('TERMIC memoria contributiilor tine cat epoca: doua galerii lungi, unite la un capat — capatul celalalt (aceleasi randuri) nu pastreaza vecina de dinainte', () => {
  // Contribuția unei bucăți ține componenta de dincolo a muchiilor ei; la o epocă nouă componentele se renumerotează
  // (unirea: amândouă mor, una nouă se naște), deși rândurile capătului departat rămân ACELAȘI tablou.
  const { w, wx, wy, g } = sitPlat(12345, 16)
  const t = w.terrain
  for (const y of [2, 4]) for (let x = 1; x <= 18; x++) for (const z of [g - 5, g - 4]) assert.ok(dig(t, wx + x, wy + y, z).ok)
  sincronizeazaCamere(w.camere, t)
  const A = componentaLa(w.camere, wx + 18, wy + 2, g - 4)!, B = componentaLa(w.camere, wx + 18, wy + 4, g - 4)!
  assert.notEqual(A.id, B.id)
  egalCuGrafulNou(w, 'doua galerii')
  assert.equal(graf(w.camere).muchieA.length, 1, 'fixtura: galeriile sunt legate printr-o muchie')
  const departe = bucataLa(w.camere, wx + 18, wy + 2, g - 4)
  const rr = w.camere.fete.inreg[departe]!.randuri
  assert.ok(rr.some((x) => x.fel === FelFata.MUCHIE), 'fixtura: capatul departat are muchii spre galeria vecina')
  const epoca = w.camere.epoca
  for (const z of [g - 5, g - 4]) assert.ok(dig(t, wx + 1, wy + 3, z).ok)
  sincronizeazaCamere(w.camere, t)
  assert.ok(w.camere.epoca > epoca)
  assert.equal(w.camere.fete.inreg[departe]!.randuri, rr, 'fixtura: randurile capatului departat sunt acelasi tablou')
  const U = componentaLa(w.camere, wx + 18, wy + 2, g - 4)!
  assert.equal(componentaLa(w.camere, wx + 18, wy + 4, g - 4)!.id, U.id, 'fixtura: galeriile s-au unit')
  egalCuGrafulNou(w, 'galeriile unite')
  // Pe hârtie: unite, drumurile prin zid se întorc în aceeași componentă (SINE) — niciun nod vecin, nicio muchie.
  const gr = graf(w.camere)
  assert.deepEqual([gr.n, gr.muchieA.length], [1, 0])
})

test('TERMIC un regim pe (graf, tick): overlay-ul si inspectorul (canaleTermice pe doua incaperi) impart o singura rezolvare; alt tick sau fete noi rezolva din nou', () => {
  // Recenzia GRAF, L3-2: `canaleTermice` refăcea regimul întregii lumi pentru o singură încăpere, iar overlay-ul îl
  // refăcea încă o dată pentru același tick.
  const { w, x0, y0, g } = casa3()
  const idx = w.camere
  const deb = componentaLa(idx, x0 + 4, y0 + 4, g + 4)!, parter = componentaLa(idx, x0 + 2, y0 + 2, g + 1)!
  const st = (): number[] => {
    const s = statMemorieTermica(idx)
    return [s.regimuriRezolvate, s.regimuriRefolosite]
  }
  const r = regimPermanent(w, R, 1000)
  assert.ok(r.ok)
  assert.deepEqual(st(), [1, 0])
  assert.ok(canaleTermice(w, R, deb.id, 1000).ok)
  assert.ok(canaleTermice(w, R, parter.id, 1000).ok)
  assert.equal(regimPermanent(w, R, 1000), r, 'acelasi regim, acelasi obiect')
  assert.deepEqual(st(), [1, 3])
  // Rezolvarea împărțită e cea proaspătă (pornită din T_afara, nu din soluția altei cereri).
  assert.deepEqual([...r.value.t], [...rezolvaRegim(r.value.graf, r.value.tRez, r.value.tAfaraQ16).t])
  assert.ok(regimPermanent(w, R, 1001).ok)
  assert.deepEqual(st(), [2, 3])
  // Fețe noi (pământ pe acoperiș): alt graf, la același tick.
  assert.ok(fill(w.terrain, x0 + 4, y0 + 4, g + 10, Material.PAMANT).ok)
  sincronizeazaCamere(idx, w.terrain)
  const dupa = regimPermanent(w, R, 1001)
  assert.ok(dupa.ok && r.ok && dupa.value.graf !== r.value.graf)
  assert.deepEqual(st(), [3, 3])
})

// --- 7. calibrarea ca acceptanță (§7) ------------------------------------------------

/**
 * Casa de piatră 7×7 (interior 5×5×2), ușa 1×2 pe peretele de sud, acoperiș de piatră; opțional pivnița 3×3×2
 * sub mijlocul ei, cu 1 m de pământ deasupra (tavanul = celula de suprafață) și un chepeng USA într-un colț.
 * Scena verificatorului L3-1 (model.mjs), pe terenul jocului. `cuUsa` = false: golul ușii lăsat NEÎNCHIS.
 */
function scenaCalibrare(cuPivnita: boolean, cuUsa = true): { w: World; casaId: number; pivnitaId: number } {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const t = w.terrain
  const x0 = wx + 2, y0 = wy + 2
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
    if (dx !== 0 && dx !== 6 && dy !== 0 && dy !== 6) continue
    if (!cuUsa && dx === 3 && dy === 0) continue
    assert.ok(fill(t, x0 + dx, y0 + dy, z, dx === 3 && dy === 0 ? Material.USA : P).ok)
  }
  for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) assert.ok(fill(t, x0 + dx, y0 + dy, g + 3, P).ok)
  if (cuPivnita) {
    for (const z of [g - 2, g - 1]) for (let dx = 2; dx <= 4; dx++) for (let dy = 2; dy <= 4; dy++) assert.ok(dig(t, x0 + dx, y0 + dy, z).ok)
    assert.ok(dig(t, x0 + 2, y0 + 2, g).ok)
    assert.ok(fill(t, x0 + 2, y0 + 2, g, Material.USA).ok)
  }
  sincronizeazaCamere(w.camere, t)
  const casaC = componentaLa(w.camere, x0 + 3, y0 + 3, g + 1)!
  const piv = cuPivnita ? componentaLa(w.camere, x0 + 3, y0 + 3, g - 1)! : null
  if (piv) assert.deepEqual(randuriText(w, x0 + 3, y0 + 3, g - 1), ['JOS SOL [1x1] d3 x9', 'LAT SOL [2x1] d1 x12', 'LAT SOL [2x1] d2 x12', 'SUS MUCHIE [3x1] x8', 'SUS MUCHIE [9x1] x1'], 'fixtura: pivnita are 1 m de iarba deasupra si chepengul')
  return { w, casaId: casaC.id, pivnitaId: piv ? piv.id : -1 }
}

/** Orele de vară (regimul permanent, un an, la fiecare oră) și câte dintre ele are pivnița sub 5 °C. */
function oreDeVaraSub5(w: World, pivnitaId: number): { vara: number; sub: number } {
  const ora = tickuriPeOra(R)
  let vara = 0
  let sub = 0
  for (let tick = 0; tick < tickuriPeAn(R); tick += ora) {
    if (momentul(tick, R).anotimp !== Anotimp.VARA) continue
    const r = regimPermanent(w, R, tick)
    assert.ok(r.ok)
    vara++
    if (temperaturaComponentei(r.value, pivnitaId)! < 5 * Q) sub++
  }
  return { vara, sub }
}

test('TERMIC acceptanta: pivnita 3x3x2 sub o casa de piatra, cu 1 m de pamant deasupra, sta sub 5 °C cel putin 85% din vara (regimul permanent, un an, la fiecare ora) — cu USA in gol; cu golul usii neinchis NU tine (75%), verdict explicit', () => {
  const cuUsa = scenaCalibrare(true)
  const { vara, sub } = oreDeVaraSub5(cuUsa.w, cuUsa.pivnitaId)
  assert.equal(vara, 96)
  // Măsurat: 93 din 96 de ore (96,9%), între 3,53 și 5,02 °C (design §3: 89%, cu inerție).
  assert.ok(sub >= Math.ceil(0.85 * vara), `doar ${sub} din ${vara} ore de vara sub 5 °C`)
  // Varianta golului (recenzia GRAF, L3-7): pivnița e legată de casă prin MUCHIE (1 m de iarbă și chepengul), iar
  // casa cu golul neînchis (2 fețe DESCHISE, 2 × 200 W/K) urmărește aerul de afară. Pivnița stă sub 5 °C doar 72
  // din 96 de ore — SUB ținta de 85%. Nu se calibrează aici: decizia 2 a lui Andrei spune „o pivniță sub casă ține
  // hrana sub 5 °C vara" fără condiții, deci ori ținta numește ușa închisă, ori golul intră în calibrarea t.2b
  // (designul are deja „casa cu golul ușii ≤ 1 h"). Testul fixează verdictul de azi: când se mișcă, se re-decide.
  const gol = scenaCalibrare(true, false)
  const vg = oreDeVaraSub5(gol.w, gol.pivnitaId)
  assert.equal(vg.vara, 96)
  assert.equal(vg.sub, 72, `golul usii: ${vg.sub} din 96 de ore sub 5 °C (masurat 72, 75%)`)
  assert.ok(vg.sub < Math.ceil(0.85 * vg.vara), 'verdictul: cu golul usii neinchis pivnita NU tine tinta de 85%')
})

test('TERMIC acceptanta: casa de piatra 5x5x2 de la suprafata coboara iarna sub −8 °C doar in ziua valului de frig; fara val, niciodata', () => {
  const { w, casaId } = scenaCalibrare(false)
  const ora = tickuriPeOra(R)
  const faraVal: Rules = { ...R, clima: { ...R.clima, valFrig: { ...R.clima.valFrig, amplitudineMc: 0 } } }
  for (const [rules, cuVal] of [[R, true], [faraVal, false]] as const) {
    let subInVal = 0
    for (let tick = 0; tick < tickuriPeAn(rules); tick += ora) {
      const m = momentul(tick, rules)
      if (m.anotimp !== Anotimp.IARNA) continue
      const r = regimPermanent(w, rules, tick)
      assert.ok(r.ok)
      if (temperaturaComponentei(r.value, casaId)! >= -8 * Q) continue
      assert.ok(cuVal, `fara val, ${m.zi} ${m.ora}:00 sub −8 °C`)
      assert.equal(m.zi, ziuaValului(w.seed, m.an, rules), `ziua ${m.zi} ${m.ora}:00 sub −8 °C, in afara valului`)
      subInVal++
    }
    // Măsurat cu valul: 7 ore, minimul −10,62 °C.
    if (cuVal) assert.ok(subInVal >= 1, 'casa nu coboara sub −8 °C nici in valul de frig')
  }
})
