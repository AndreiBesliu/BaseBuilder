/**
 * Hrana sub 5 °C (S24-27 t.3), commit-ul B: CURBA si PASUL. research/hrana-t3.md §2 (unde si cat de des), §3 (curba),
 * §4 (stricata), §5 (a doua cautare de mancare), §7 (literalul „S+ hrana"), §9 (portile).
 *
 * Fiecare poarta are scena ei, cu contoare de viata, si o valoare pe hartie unde se poate: oracolul pasului nu cheama
 * functia de temperatura a codului (T-ul asteptat se ia din stare, din aerul de afara si, pentru toc, din vecinii numiti de
 * test), iar curba se compara cu parabola declarata, nu cu ea insasi.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { tick } from '../src/sim/world.ts'
import { FelJob, Item, NEVOI, Nevoie, ONE_ALTERARE } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { creeazaItem, itemLaCelula, slotItem } from '../src/sim/iteme.ts'
import { existaTinta, lastJobReport } from '../src/sim/joburi.ts'
import { rezervariPentru, Strat, verificaRezervari } from '../src/sim/rezervari.ts'
import { ALTERARE_BANDA_Q16, curbaAlterarii, lambdaPeCurba, parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { curbaReguli, lambdaAlterare, pasAlterare, statAlterare } from '../src/sim/alterare.ts'
import { tAfara } from '../src/sim/clima.ts'
import { componentaLa } from '../src/sim/camere.ts'
import { pasTermic, T_SIGURANTA, temperaturaCelulei } from '../src/sim/temperatura.ts'
import { indexZone } from '../src/sim/zone.ts'
import type { IndexZone } from '../src/sim/zone.ts'
import { ensureArea, find, isWalkable, materialFast, NO_REGION, regionAt } from '../src/sim/regions.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { laSit, lasaItem, picteaza, R, sitPlat, solidLaDistanta } from './fixturi.ts'
import { AN, faraCasa, geometriaFinala, regimPeriodic, tickLa } from './fixturi-pivnita.ts'
import type { GeometriaFinala } from './fixturi-pivnita.ts'

const ONE = ONE_ALTERARE
const H = Item.HRANA
const Q = 65536
const TPS = R.ticksPerSecond
const FISIER = (): Record<string, any> => JSON.parse(readFileSync(new URL('../content/rules.json', import.meta.url), 'utf8'))

/** Un generator determinist pentru S-urile scrise de teste (fara RNG-ul lumii). */
function lcg(seed: number): () => number {
  let x = seed >>> 0
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x / 4294967296
  }
}

/** Parabola DECLARATA a curbei implicite (decizia 1): λ(T) = ONE · ln2 / (4 · pasi pe zi) · ((T − 5 °C)/10)², T in Q16. */
function parabola(tQ16: number): number {
  const d = (tQ16 / Q - 5) / 10
  return d <= 0 ? 0 : ((ONE * Math.LN2) / (4 * (R.calendar.ziTicks / TPS))) * d * d
}

// ---------------------------------------------------------------------------
// curba (§3): tabelul din content, validarea, banda moarta, interpolarea
// ---------------------------------------------------------------------------

test('curba: tabelul implicit e parabola declarata (t½ la 15 °C = 4 zile) — pe TOATE valorile Q16 din [5,2; 45] °C, λ(tabel)/λ(parabola) intre 0,9 si 1,13', () => {
  // Grila deasa (0,1 °C pe [5; 6], 0,5 °C pe [6; 10], 5 °C de la 10 la 45): coardele stau deasupra parabolei, floor-ul pe λ
  // sub ea. Masurat: ×1,125 la 11,67 °C (coarda 10–15), ×0,934 la 5,20 °C (floor pe λ = 18). Un tabel la 5 °C (formatul
  // v1) da ×25 la 5,2 °C (verif-P2); un λ in trepte (fara interpolare) da ×0,47 la 5,29 °C.
  assert.equal(curbaReguli(R).tQ16.length, 26, 'grila deasa: 26 de puncte')
  let max = 0
  let min = Infinity
  let tMax = 0
  for (let t = Math.ceil(5.2 * Q); t <= 45 * Q; t++) {
    const r = lambdaAlterare(R, t) / parabola(t)
    if (r > max) { max = r; tMax = t }
    if (r < min) min = r
  }
  assert.ok(max <= 1.13, `raportul maxim ${max.toFixed(4)} la ${(tMax / Q).toFixed(3)} °C`)
  assert.ok(min >= 0.9, `raportul minim ${min.toFixed(4)}`)
  assert.ok(max >= 1.1 && tMax > 10 * Q && tMax < 15 * Q, `proba atinge coarda 10–15 °C: max ${max.toFixed(4)} la ${(tMax / Q).toFixed(3)} °C`)
})

test('curba: banda moarta — λ la prag si la prag + 1 Q16 e 0, primul λ ≥ 1 la 0,025 °C peste prag, λ la prag + 0,05 °C ≥ 1; parsarea refuza o curba cu banda mai lata si aceeasi curba cu pasi de o zi mai multi', () => {
  const prag = 5 * Q
  assert.equal(lambdaAlterare(R, prag - Q), 0)
  assert.equal(lambdaAlterare(R, prag), 0)
  assert.equal(lambdaAlterare(R, prag + 1), 0, 'banda moarta (floor pe λ): scrisa, nu ascunsa')
  let prim = -1
  for (let t = prag; t < prag + Q && prim === -1; t++) if (lambdaAlterare(R, t) >= 1) prim = t
  // Pe hartie: λ(5,1 °C) = floor(17 · 2^29 · 20 / (10^6 · 40.320)) = 4; T(5,1 °C) = 334.234 Q16, deci λ ≥ 1 cand
  // 4 · (T − 327.680) / 6.554 ≥ 1, adica T − 327.680 ≥ 1.639 (0,0250 °C).
  assert.equal(curbaReguli(R).lambda[1], 4)
  assert.equal(prim - prag, 1639)
  assert.equal(lambdaAlterare(R, prag + ALTERARE_BANDA_Q16), 2)
  // O curba care sta 0 pe zecimi de grad peste prag: [5 °C, 0], [6 °C, 10 ppm] → λ(6 °C) = 2, λ(5,05 °C) = 0.
  const f = FISIER()
  const lata = parseRules({ ...f, alterare: { pierderePeMilionZilnic: [[5000, 0], [6000, 10], [10000, 43322], [45000, 2772589]] } })
  assert.ok(!lata.ok && lata.params.camp === 'alterare.pierderePeMilionZilnic' && String(lata.params.motiv).startsWith('banda moarta'), JSON.stringify(lata))
  // Aceeasi curba implicita, cu 10.080.000 de pasi pe zi (ziTicks maxim, tps 1): λ(5,1 °C) = 0 — refuzata.
  const rara = parseRules({ ...f, ticksPerSecond: 1, calendar: { ...f.calendar, ziTicks: 10_080_000 } })
  assert.ok(!rara.ok && String(rara.params.motiv).startsWith('banda moarta'), JSON.stringify(rara))
  assert.ok(parseRules(f).ok, 'controlul: fisierul livrat trece')
})

test('curba: validarea — sectiunea obligatorie, cheile cunoscute, perechi de intregi in plaje, primul punct cu pierderea 0, T strict crescator, rate si pante nedescrescatoare, λ ≤ ONE; a doua raza de mancare nu sub prima', () => {
  const f = FISIER()
  const P = f.alterare.pierderePeMilionZilnic as [number, number][]
  const cu = (puncte: unknown, alte: Record<string, unknown> = {}) => parseRules({ ...f, ...alte, alterare: { pierderePeMilionZilnic: puncte } })
  const refuz = (out: ReturnType<typeof parseRules>, camp: string, motiv?: string): void => {
    assert.ok(!out.ok, `trebuia refuzat: ${camp}`)
    if (out.ok) return
    assert.equal(String(out.params.camp), camp)
    if (motiv) assert.ok(String(out.params.motiv).startsWith(motiv), `${camp}: ${String(out.params.motiv)}`)
  }
  const fara = { ...f }
  delete fara.alterare
  refuz(parseRules(fara), 'alterare')
  refuz(parseRules({ ...f, alterare: { ...f.alterare, prag: 5000 } }), 'alterare.prag')
  refuz(cu([[5000, 0]]), 'alterare.pierderePeMilionZilnic')
  refuz(cu([[5000, 0], [6000, 1.5]]), 'alterare.pierderePeMilionZilnic[1]')
  refuz(cu([[5000, 0], [6000]]), 'alterare.pierderePeMilionZilnic[1]')
  refuz(cu([[5000, 0], [100001, 5]]), 'alterare.pierderePeMilionZilnic[1][0]')
  refuz(cu([[5000, 0], [6000, 10_000_001]]), 'alterare.pierderePeMilionZilnic[1][1]')
  refuz(cu([[5000, 17], ...P.slice(1)]), 'alterare.pierderePeMilionZilnic[0]', 'primul punct')
  refuz(cu([P[0], P[2], P[1], ...P.slice(3)]), 'alterare.pierderePeMilionZilnic[2]', 'T-ul punctelor')
  refuz(cu([...P.slice(0, 25), [45000, 2122762]]), 'alterare.pierderePeMilionZilnic[25]', 'pierderea nu poate scadea')
  // Concava: panta 1 ppm/m°C pe [5; 6], apoi 0,5 — mai cald strica mai INCET pe grad.
  refuz(cu([[5000, 0], [6000, 1000], [7000, 1500], [45000, 2772589]]), 'alterare.pierderePeMilionZilnic[2]', 'pantele curbei')
  // λ > ONE: 10^7 ppm la 6 pasi pe zi (tps 240, ziTicks 1440): λ = 8,9e8.
  refuz(cu([[5000, 0], [100000, 10_000_000]], { ticksPerSecond: 240, calendar: { ...f.calendar, ziTicks: 1440 } }), 'alterare.pierderePeMilionZilnic[1]', 'mai mult de o unitate')
  refuz(parseRules({ ...f, mancareScanRadiusLargCells: f.nevoieScanRadiusCells - 1 }), 'mancareScanRadiusLargCells')
  assert.ok(parseRules({ ...f, mancareScanRadiusLargCells: f.nevoieScanRadiusCells }).ok, 'egala cu prima raza: fara a doua cautare, valid')
  assert.ok(cu([[5000, 0], [6000, 1000], [7000, 2000], [45000, 2772589]]).ok, 'controlul: o dreapta pe primele doua segmente (pante egale) trece')
})

test('curba: interpolarea pe λ e EXACTA la plafoanele continutului (Δλ = ONE pe 150 °C) — fata de BigInt pe 20.000 de T-uri; peste ultimul punct ramane valoarea lui, pana la plasa de 1000 °C', () => {
  // 6·10^6 ppm la 6 pasi pe zi: λ = 6·10^6 · 2^29 · 240 / (10^6 · 1440) = 2^29 = ONE, pe tot intervalul [−50; 100] °C.
  const c = curbaAlterarii([[-50000, 0], [100000, 6_000_000]], 240, 1440)
  assert.deepEqual(c.lambda, [0, ONE])
  const r = lcg(31)
  const t0 = BigInt(c.tQ16[0]!)
  const dT = BigInt(c.tQ16[1]! - c.tQ16[0]!)
  let mari = 0
  for (let n = 0; n < 20000; n++) {
    const t = c.tQ16[0]! + 1 + Math.floor(r() * (c.tQ16[1]! - c.tQ16[0]! - 1))
    const asteptat = Number((BigInt(ONE) * (BigInt(t) - t0)) / dT)
    assert.equal(lambdaPeCurba(c, t), asteptat, `T = ${t}`)
    if (ONE * (t - c.tQ16[0]!) > 2 ** 52) mari++
  }
  assert.ok(mari > 2000, `trageri cu produsul peste 2^52: ${mari}`)
  const ultim = curbaReguli(R).lambda[25]!
  assert.equal(lambdaAlterare(R, 45 * Q), ultim)
  assert.equal(lambdaAlterare(R, 60 * Q), ultim)
  assert.equal(lambdaAlterare(R, T_SIGURANTA), ultim)
})

/** Seriile T (°C, Q16 intreg) ale casei si pivnitei din regimul periodic (anul 3), pe aceeasi rulare. */
function seriiCasaPivnita(): { casa: Int32Array; piv: Int32Array } {
  const gf = geometriaFinala(0)
  const w = gf.w
  const ic = componentaLa(w.camere, ...gf.casa)!.id
  const ip = componentaLa(w.camere, ...gf.piv)!.id
  const casa = new Int32Array(AN / TPS)
  const piv = new Int32Array(AN / TPS)
  for (let tk = 0; tk < 3 * AN; tk += TPS) {
    w.tick = tk
    pasTermic(w, R)
    if (tk >= 2 * AN) {
      casa[(tk % AN) / TPS] = w.temperatura.slot.t[ic]!
      piv[(tk % AN) / TPS] = w.temperatura.slot.t[ip]!
    }
  }
  return { casa, piv }
}

/** Pierderea (%) pe fiecare anotimp (primavara, vara, toamna, iarna) a unui morman lasat acolo, pe λ-ul dat. */
function peAnotimpuri(reguli: Rules, tLa: (tk: number) => number): number[] {
  return [0, 1, 2, 3].map((a) => {
    let ramas = 1
    const start = tickLa(0, a, 1, 0)
    for (let k = 0; k < AN / 4 / TPS; k++) ramas *= 1 - lambdaAlterare(reguli, tLa(start + k * TPS)) / ONE
    return 100 * (1 - ramas)
  })
}

test('curba: pierderea pe ANOTIMPURI pe tabelul DIN CONTENT, in benzile parabolei (§3) — sub cer ~32/79/29/0%, casa ~6/47/20/0%, pivnita 0, pivnita +1 °C si fara casa cu 1 m toamna ≤ 0,35%; tabelul la 5 °C iese ROSU', () => {
  const { casa, piv } = seriiCasaPivnita()
  const fc = faraCasa(1)
  const s1 = regimPeriodic(fc.w, fc.piv)
  const idx = (tk: number) => Math.floor((tk % AN) / TPS)
  const afara = (tk: number) => tAfara(12345, tk, R)
  const casaT = (tk: number) => casa[idx(tk)]!
  const pivT = (tk: number) => piv[idx(tk)]!
  const pivPlus1 = (tk: number) => piv[idx(tk)]! + Q
  const faraCasa1 = (tk: number) => Math.round(s1(tk) * Q)
  const banda = (ce: string, v: number[], benzi: [number, number][]) => {
    for (let a = 0; a < 4; a++) assert.ok(v[a]! >= benzi[a]![0] && v[a]! <= benzi[a]![1], `${ce}, anotimpul ${a}: ${v[a]!.toFixed(3)}% in afara [${benzi[a]}] (${v.map((x) => x.toFixed(3)).join(' / ')})`)
  }
  // Benzile, in jurul parabolei din §3 (31,1/78,8/27,9/0; 5,9/45,3/19,1/0; 0; 0/0,09/0,28/0; 0/0,08/0,27/0). Masurat pe
  // tabelul din content: 31,97/79,34/28,85/0,002; 6,27/46,60/20,36/0; 0; 0/0,093/0,282/0,001; 0/0,079/0,269/0.
  banda('sub cer', peAnotimpuri(R, afara), [[30, 34], [77, 82], [27, 31], [0, 0.1]])
  banda('casa', peAnotimpuri(R, casaT), [[5, 8], [44, 49], [18, 22.5], [0, 0.1]])
  assert.deepEqual(peAnotimpuri(R, pivT), [0, 0, 0, 0], 'pivnita sub casa: NIMIC, pe orice anotimp')
  banda('pivnita +1 °C', peAnotimpuri(R, pivPlus1), [[0, 0.01], [0, 0.15], [0, 0.35], [0, 0.01]])
  banda('fara casa, 1 m', peAnotimpuri(R, faraCasa1), [[0, 0.01], [0, 0.15], [0, 0.35], [0, 0.01]])
  // Controlul: aceeasi parabola pe grila la 5 °C (formatul v1) — pivnita +1 °C toamna 2,09%, fara casa 1,88%: ROSU.
  const rara: Rules = { ...R, alterare: { pierderePeMilionZilnic: [[5000, 0], [10000, 43322], [15000, 173287], [20000, 389895], [25000, 693147], [30000, 1083042], [35000, 1559581], [40000, 2122763], [45000, 2772589]] } }
  assert.ok(peAnotimpuri(rara, pivPlus1)[2]! > 2 && peAnotimpuri(rara, faraCasa1)[2]! > 1.8, 'controlul: grila la 5 °C trece de 0,35%')
})

// ---------------------------------------------------------------------------
// pasul (§2): ordinea in tick, sursa T-ului, pragul, perisabilitatea, moartea, λ = 0, componenta fara T, K05
// ---------------------------------------------------------------------------

/** Hrana in casa, in pivnita, sub cer si in tocurile celor doua usi (puse direct: ca o usa zidita peste morman), plus piatra. */
function scenaLocuri(gf: GeometriaFinala): { ids: Record<string, number>; piatra: number } {
  const w = gf.w
  const ids: Record<string, number> = {}
  for (const [n, c] of [['casa', gf.casa], ['pivnita', gf.piv], ['afara', gf.afara]] as const) {
    const o = applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 75, wx: c[0], wy: c[1], z: c[2] }, R)
    assert.ok(o.ok, n)
    ids[n] = o.ok ? o.value : -1
  }
  for (const [n, c] of [['tocPivnita', gf.usaPivnitei], ['tocCasa', gf.usaCasei]] as const) {
    assert.equal(componentaLa(w.camere, ...c), null, `premisa: ${n} nu e in nicio componenta`)
    assert.equal(materialFast(w.terrain, ...c), Material.USA, `premisa: ${n} e chiar voxelul usii`)
    const id = w.nextId++
    assert.ok(creeazaItem(w.iteme, id, H, c[0], c[1], c[2], 75, 0).ok, n)
    ids[n] = id
  }
  const a = gf.afara
  const p = applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: 20, wx: a[0] + 2, wy: a[1], z: a[2] }, R)
  assert.ok(p.ok)
  return { ids, piatra: p.ok ? p.value : -1 }
}

test('pasul: ordinea in tick si sursa T-ului — la FIECARE tick % tps === 0, S-ul fiecarui morman creste EXACT cu q·λ(T-ul locului DUPA pasul termic): casa si pivnita din stare, sub cer T_afara, tocul partea mai calda (vecinii numiti); intre pasi nimic; piatra nu', () => {
  const gf = geometriaFinala(tickLa(0, 2, 1, 8))
  const w = gf.w
  const { ids, piatra } = scenaLocuri(gf)
  const ic = componentaLa(w.camere, ...gf.casa)!.id
  const ip = componentaLa(w.camere, ...gf.piv)!.id
  // Vecinii tocurilor, pe hartie: usa pivnitei sta intre rampa (casa) si pivnita; usa casei intre casa si cer.
  const vecini: Record<string, (tA: number) => number> = {
    casa: () => w.temperatura.slot.t[ic]!,
    pivnita: () => w.temperatura.slot.t[ip]!,
    afara: (tA) => tA,
    tocPivnita: () => Math.max(w.temperatura.slot.t[ic]!, w.temperatura.slot.t[ip]!),
    tocCasa: (tA) => Math.max(w.temperatura.slot.t[ic]!, tA),
  }
  const asteptat = new Map<string, { q: number; S: number }>()
  for (const n of Object.keys(ids).sort()) asteptat.set(n, { q: 75, S: 0 })
  let pasi = 0
  let stricate = 0
  let diferite = 0
  for (let t = 0; t < 6000; t++) {
    const tickPas = w.tick
    const hs0 = w.hranaStricata
    tick(w, R)
    const tA = tAfara(w.seed, tickPas, R)
    if (tickPas % TPS === 0) pasi++
    const ts = new Set<number>()
    for (const n of Object.keys(ids).sort()) {
      const e = asteptat.get(n)!
      if (tickPas % TPS === 0) {
        const T = vecini[n]!(tA)
        ts.add(T)
        e.S += e.q * lambdaAlterare(R, T)
        const k = Math.min(e.q, Math.floor(e.S / ONE))
        e.q -= k
        e.S -= k * ONE
        stricate += k
      }
      const s = slotItem(w.iteme, ids[n]!)
      assert.deepEqual([w.iteme.cantitate[s], w.iteme.alterare[s]], [e.q, e.S], `${n}, tickul ${tickPas}`)
    }
    if (ts.size >= 3) diferite++
    assert.equal(lastJobReport().unitatiStricate, w.hranaStricata - hs0, `unitatiStricate pe tickul ${tickPas}`)
    assert.equal(w.iteme.alterare[slotItem(w.iteme, piatra)], 0, 'piatra nu e perisabila')
  }
  assert.equal(pasi, 300)
  assert.ok(stricate >= 5 && w.hranaStricata === stricate, `unitati stricate: ${stricate} (total ${w.hranaStricata})`)
  // Casa, pivnita si aerul de afara difera la (aproape) fiecare pas; tocurile iau una din ele (partea mai calda).
  assert.ok(diferite >= 250, `pasi cu 3 T-uri diferite intre locuri: ${diferite}`)
})

test('pragul: un morman la EXACT 5,000 °C si unul la 5 °C + 1 Q16 nu strang nimic (banda moarta), la 5 °C + 0,05 °C strang q·λ = 75·2 — T-ul componentei scris in stare, pasul chemat direct', () => {
  const gf = geometriaFinala(tickLa(0, 2, 1, 8))
  const w = gf.w
  const ic = componentaLa(w.camere, ...gf.casa)!.id
  const o = applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 75, wx: gf.casa[0], wy: gf.casa[1], z: gf.casa[2] }, R)
  assert.ok(o.ok)
  const s = slotItem(w.iteme, o.ok ? o.value : -1)
  const S = () => w.iteme.alterare[s]!
  for (const [T, dS] of [[5 * Q, 0], [5 * Q + 1, 0], [5 * Q + ALTERARE_BANDA_Q16, 150], [5 * Q - 1, 0]] as const) {
    w.temperatura.slot.t[ic] = T
    const inainte = S()
    pasAlterare(w, R)
    assert.equal(S() - inainte, dS, `T = ${T} Q16`)
  }
})

test('pivnita sub casa, un anotimp intreg (toamna, regimul periodic): cantitatea si S raman EXACT 0; un morman cu S = 1,5·ONE dus acolo pierde o unitate la primul pas (λ = 0 realizeaza, P14) si apoi nimic', () => {
  const gf = geometriaFinala(0)
  const w = gf.w
  const toamna = AN + tickLa(0, 2, 1, 0)
  for (let tk = 0; tk < toamna; tk += TPS) { w.tick = tk; pasTermic(w, R) }
  w.tick = toamna
  const ip = componentaLa(w.camere, ...gf.piv)!.id
  const proaspat = applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 75, wx: gf.piv[0], wy: gf.piv[1], z: gf.piv[2] }, R)
  const unit = applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 75, wx: gf.piv[0] + 1, wy: gf.piv[1], z: gf.piv[2] }, R)
  assert.ok(proaspat.ok && unit.ok)
  const sp = slotItem(w.iteme, proaspat.ok ? proaspat.value : -1)
  const su = slotItem(w.iteme, unit.ok ? unit.value : -1)
  assert.notEqual(su, sp)
  w.iteme.alterare[su] = 1.5 * ONE
  let tMax = -Infinity
  const realizate0 = statAlterare(w).realizariFaraRata
  for (let t = 0; t < AN / 4; t++) {
    tick(w, R)
    if (w.tick % TPS === 1) tMax = Math.max(tMax, w.temperatura.slot.t[ip]!)
    if (t === 0) assert.deepEqual([w.iteme.cantitate[su], w.iteme.alterare[su]], [74, 0.5 * ONE], 'primul pas: o unitate realizata la λ = 0')
  }
  assert.ok(tMax <= 5 * Q && tMax > 4.5 * Q, `pivnita toamna: max ${(tMax / Q).toFixed(3)} °C (sub prag, aproape de el)`)
  assert.deepEqual([w.iteme.cantitate[sp], w.iteme.alterare[sp]], [75, 0], 'proaspat: nimic')
  assert.deepEqual([w.iteme.cantitate[su], w.iteme.alterare[su]], [74, 0.5 * ONE], 'dupa realizare: nimic')
  assert.equal(statAlterare(w).realizariFaraRata - realizate0, 1)
  assert.equal(w.hranaStricata, 1)
})

test('componenta fara T: mormanul SARE pasul (S neschimbat) si se numara — si tocul cu un vecin fara T; sub cer, pasul merge', () => {
  const gf = geometriaFinala(tickLa(0, 2, 1, 14))
  const w = gf.w
  const { ids } = scenaLocuri(gf)
  const ic = componentaLa(w.camere, ...gf.casa)!.id
  const S = (n: string) => w.iteme.alterare[slotItem(w.iteme, ids[n]!)]!
  w.temperatura.slot.are[ic] = 0
  const inainte = Object.fromEntries(Object.keys(ids).map((n) => [n, S(n)]))
  const faraT0 = statAlterare(w).faraT
  pasAlterare(w, R)
  // casa, tocul pivnitei (vecin: rampa = casa) si tocul casei (vecin: casa): sar; pivnita si afara: merg.
  for (const n of ['casa', 'tocPivnita', 'tocCasa']) assert.equal(S(n), inainte[n], `${n} a sarit pasul`)
  for (const n of ['pivnita', 'afara']) assert.ok(n === 'pivnita' || S(n) > inainte[n]!, `${n} a mers`)
  assert.equal(statAlterare(w).faraT - faraT0, 3)
  assert.equal(temperaturaCelulei(w, ...gf.casa, tAfara(w.seed, w.tick, R)), null, 'temperaturaCelulei: null, nu ghiceste')
})

test('K05 pe contoare: la fiecare pas, mormanele evaluate == mormanele PERISABILE vii, iar evaluarile de rata == componentele distincte + cerul + tocurile (o data pe componenta si trecere)', () => {
  const gf = geometriaFinala(tickLa(0, 2, 1, 8))
  const w = gf.w
  scenaLocuri(gf)
  // Inca un morman in casa si unul sub cer: aceeasi componenta, acelasi cer — nu inca o evaluare.
  for (const c of [[gf.casa[0] + 1, gf.casa[1], gf.casa[2]], [gf.afara[0] + 1, gf.afara[1], gf.afara[2]]] as const) {
    assert.ok(applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 30, wx: c[0], wy: c[1], z: c[2] }, R).ok)
  }
  let pasi = 0
  for (let t = 0; t < 2000; t++) {
    tick(w, R)
    if ((w.tick - 1) % TPS !== 0) continue
    pasi++
    let perisabile = 0
    for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1 && R.perisabil[w.iteme.kind[i]!]) perisabile++
    const st = statAlterare(w)
    assert.equal(st.mormaneUltimulPas, perisabile)
    assert.equal(st.mormaneUltimulPas, 7)
    // casa + pivnita + cer + 2 tocuri
    assert.equal(st.evaluariUltimulPas, 5, `pasul ${pasi}`)
  }
  assert.equal(pasi, 100)
})

test('moartea din alterare (P11): S scris = q·ONE − q·λ(T) + 1, cu rezervarile MANCAT si CARAT puse — mormanul moare in pas, mancatorul si carausul isi incheie jobul in acelasi tick, nicio rezervare orfana, iar lumea salvata merge la fel', () => {
  let morti = 0
  for (const seed of [4242, 12345]) {
    const { w, sit } = laSit(seed, 5)
    picteaza(w, sit.wx + 2, sit.wy + 3, 3)
    const c = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 9, 13)
    const id = lasaItem(w, H, 30, c.wx, c.wy)
    w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 100
    let gasit = false
    for (let t = 0; t < 3000 && !gasit; t++) {
      assert.notEqual(slotItem(w.iteme, id), -1, `seed ${seed}: mormanul a disparut inainte de scena`)
      if (w.tick % TPS === 0 && rezervariPentru(w.rezervari, id, Strat.MANCAT).length > 0 && rezervariPentru(w.rezervari, id, Strat.CARAT).length > 0) gasit = true
      else tick(w, R)
    }
    assert.ok(gasit, `seed ${seed}: nicio clipa cu MANCAT si CARAT pe acelasi morman`)
    const s = slotItem(w.iteme, id)
    const q = w.iteme.cantitate[s]!
    const lambda = lambdaAlterare(R, tAfara(w.seed, w.tick, R))
    assert.ok(lambda >= 2, `λ sub cer: ${lambda}`)
    w.iteme.alterare[s] = q * ONE - q * lambda + 1
    const pretendenti = [...rezervariPentru(w.rezervari, id, Strat.MANCAT), ...rezervariPentru(w.rezervari, id, Strat.CARAT)].map((r) => r.claimant)
    const m0 = statAlterare(w).morti
    const d0 = w.ratiune.alterareDisparuta
    tick(w, R)
    assert.equal(slotItem(w.iteme, id), -1, `seed ${seed}: mormanul n-a murit in pas`)
    assert.equal(statAlterare(w).morti - m0, 1)
    assert.equal(w.ratiune.alterareDisparuta - d0, 1, 'restul de S (1) iese numarat')
    const a = w.agents
    for (let i = 0; i < a.count; i++) {
      if (!pretendenti.includes(a.id[i]!)) continue
      assert.ok(a.jobKind[i] === 0 || a.jobTarget[i] !== id, `seed ${seed}: pionul ${i} are inca jobul (${a.jobKind[i]}) pe mormanul mort`)
    }
    assert.deepEqual([rezervariPentru(w.rezervari, id, Strat.MANCAT).length, rezervariPentru(w.rezervari, id, Strat.CARAT).length], [0, 0])
    const v = verificaRezervari(w.rezervari, w.agents, existaTinta(w))
    assert.ok(v.ok, JSON.stringify(v))
    const inc = decode(encode(w), R)
    assert.ok(inc.ok)
    if (!inc.ok) return
    for (let t = 0; t < 600; t++) { tick(w, R); tick(inc.value, R) }
    assert.equal(hashWorld(inc.value), hashWorld(w), `seed ${seed}: lumea salvata dupa moarte`)
    morti++
  }
  assert.equal(morti, 2)
})

// ---------------------------------------------------------------------------
// tocul usii (§2): regula permanenta, a treia trecere
// ---------------------------------------------------------------------------

test('tocul: regula PERMANENTA — un morman pe voxelul unei usi are T-ul PARTII MAI CALDE (vecinii cu componenta, si T_afara daca unul e sub cer); un vecin fara T da null', () => {
  const gf = geometriaFinala(tickLa(0, 2, 1, 14))
  const w = gf.w
  const ic = componentaLa(w.camere, ...gf.casa)!.id
  const ip = componentaLa(w.camere, ...gf.piv)!.id
  const tA = tAfara(w.seed, w.tick, R)
  const tP = w.temperatura.slot.t[ip]!
  assert.ok(tA > 10 * Q && tP < tA - 5 * Q, `premisa: afara ${(tA / Q).toFixed(2)} °C, pivnita ${(tP / Q).toFixed(2)} °C`)
  const T = (c: readonly [number, number, number]) => temperaturaCelulei(w, c[0], c[1], c[2], tA)
  // Casa RECE (2 °C, scris in stare): usa pivnitei ia pivnita, usa casei ia aerul de afara.
  w.temperatura.slot.t[ic] = 2 * Q
  assert.equal(T(gf.usaPivnitei), tP)
  assert.equal(T(gf.usaCasei), tA)
  // Casa CALDA (30 °C): amandoua iau casa.
  w.temperatura.slot.t[ic] = 30 * Q
  assert.equal(T(gf.usaPivnitei), 30 * Q)
  assert.equal(T(gf.usaCasei), 30 * Q)
  // Locurile obisnuite: componenta din stare, sub cer T_afara.
  assert.equal(T(gf.casa), 30 * Q)
  assert.equal(T(gf.piv), tP)
  assert.equal(T(gf.afara), tA)
  w.temperatura.slot.are[ic] = 0
  assert.equal(T(gf.usaPivnitei), null)
  assert.equal(T(gf.usaCasei), null)
})

test('asazaItem: tocul usii e a TREIA trecere — marfa lasata pe usa ajunge la vecin; cu vecinii plini de alt fel, ramane in toc, nimic pierdut', () => {
  /** Celulele pe care le cauta `asazaItem` in jurul usii (pasul 1 m), calcabile si care NU sunt voxelul unei usi. */
  const candidati = (w: World, x: number, y: number, z: number): [number, number, number][] => {
    const out: [number, number, number][] = []
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 0, -1], [-1, 0, -1], [0, 1, -1], [0, -1, -1]] as const) {
      if (isWalkable(w.terrain, x + dx, y + dy, z + dz, R) && materialFast(w.terrain, x + dx, y + dy, z + dz) !== Material.USA) out.push([x + dx, y + dy, z + dz])
    }
    return out
  }
  {
    const gf = geometriaFinala(0)
    const w = gf.w
    const [x, y, z] = gf.usaCasei
    assert.ok(isWalkable(w.terrain, x, y, z, R), 'premisa: pe usa se poate sta')
    assert.ok(applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 10, wx: x, wy: y, z }, R).ok)
    assert.equal(itemLaCelula(w.iteme, x, y, z), -1, 'nu pe usa: era loc langa ea')
    assert.equal(candidati(w, x, y, z).filter((c) => itemLaCelula(w.iteme, ...c) !== -1).length, 1, 'pe un vecin')
  }
  // Toti vecinii pe care i-ar cauta plini de PIATRA: hrana n-are alt loc decat tocul.
  const gf = geometriaFinala(0)
  const w = gf.w
  const [x, y, z] = gf.usaCasei
  const vecini = candidati(w, x, y, z)
  assert.ok(vecini.length >= 1, 'premisa: usa are vecini calcabili')
  for (const c of vecini) assert.ok(creeazaItem(w.iteme, w.nextId++, Item.PIATRA, c[0], c[1], c[2], R.itemStackMax, 0).ok)
  const pierdute0 = w.ratiune.itemePierdute
  const o2 = applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 10, wx: x, wy: y, z }, R)
  assert.ok(o2.ok, JSON.stringify(o2))
  const toc = itemLaCelula(w.iteme, x, y, z)
  assert.ok(toc !== -1 && w.iteme.kind[toc] === H && w.iteme.cantitate[toc] === 10, 'hrana in toc')
  assert.equal(w.ratiune.itemePierdute, pierdute0)
})

// ---------------------------------------------------------------------------
// indexul de zone (§2): predicatul EXACT X — oracolul de exactitate si costul pe contoare
// ---------------------------------------------------------------------------

interface Instantaneu {
  murdar: boolean; libere: number[][]; acceptante: Int32Array; maxLocLiber: Int32Array; maxPrioLibera: Int32Array
  depoziteOrdonate: number[]; paturiLibere: number[]; deMutat: number[]; comestibile: number[]; peFel: number[][]; peJosFaraDepozit: number
  ultimulMotiv: Uint8Array; ultimulMotivDetaliu: Uint8Array
}
function instantaneu(w: World): Instantaneu {
  const ix = w.zone.index
  return {
    murdar: ix.murdar, libere: ix.libere.map((l) => (l ? l.slice() : [])), acceptante: ix.acceptante.slice(), maxLocLiber: ix.maxLocLiber.slice(),
    maxPrioLibera: ix.maxPrioLibera.slice(), depoziteOrdonate: ix.depoziteOrdonate.slice(), paturiLibere: ix.paturiLibere.slice(), deMutat: ix.deMutat.slice(),
    comestibile: ix.comestibile.slice(), peFel: ix.peFel.map((l) => l.slice()), peJosFaraDepozit: ix.peJosFaraDepozit,
    ultimulMotiv: w.iteme.ultimulMotiv.slice(), ultimulMotivDetaliu: w.iteme.ultimulMotivDetaliu.slice(),
  }
}
function puneLaLoc(w: World, a: Instantaneu): void {
  const ix = w.zone.index as IndexZone & { murdar: boolean }
  ix.murdar = a.murdar
  for (let i = 0; i < a.libere.length; i++) { const l = ix.libere[i]; if (l) { l.length = 0; l.push(...a.libere[i]!) } }
  ix.acceptante.set(a.acceptante)
  ix.maxLocLiber.set(a.maxLocLiber)
  ix.maxPrioLibera.set(a.maxPrioLibera)
  for (const [l, v] of [[ix.depoziteOrdonate, a.depoziteOrdonate], [ix.paturiLibere, a.paturiLibere], [ix.deMutat, a.deMutat], [ix.comestibile, a.comestibile]] as const) { l.length = 0; l.push(...v) }
  for (let k = 0; k < a.peFel.length; k++) { ix.peFel[k]!.length = 0; ix.peFel[k]!.push(...a.peFel[k]!) }
  ix.peJosFaraDepozit = a.peJosFaraDepozit
  w.iteme.ultimulMotiv.set(a.ultimulMotiv)
  w.iteme.ultimulMotivDetaliu.set(a.ultimulMotivDetaliu)
}
const egale = (x: ArrayLike<number>, y: ArrayLike<number>) => x.length === y.length && Array.prototype.every.call(x, (v: number, i: number) => v === y[i])
function diferente(a: Instantaneu, b: Instantaneu, zone: number, iteme: number): string[] {
  const d: string[] = []
  for (let i = 0; i < zone; i++) if (!egale(a.libere[i] ?? [], b.libere[i] ?? [])) { d.push('libere'); break }
  if (!egale(a.acceptante.subarray(0, zone * 4), b.acceptante.subarray(0, zone * 4))) d.push('acceptante')
  if (!egale(a.maxLocLiber.subarray(0, zone * 4), b.maxLocLiber.subarray(0, zone * 4))) d.push('maxLocLiber')
  if (!egale(a.maxPrioLibera, b.maxPrioLibera)) d.push('maxPrioLibera')
  if (!egale(a.depoziteOrdonate, b.depoziteOrdonate)) d.push('depoziteOrdonate')
  if (!egale(a.deMutat, b.deMutat)) d.push('deMutat')
  if (!egale(a.comestibile, b.comestibile)) d.push('comestibile')
  for (let k = 0; k < a.peFel.length; k++) if (!egale(a.peFel[k]!, b.peFel[k]!)) { d.push('peFel'); break }
  if (a.peJosFaraDepozit !== b.peJosFaraDepozit) d.push('peJosFaraDepozit')
  void iteme
  return d
}

/** Pune un morman prin comanda si ii scrie S; intoarce slotul (sau −1). */
function pune(w: World, fel: number, q: number, x: number, y: number, z: number, S: number): number {
  const o = applyCommand(w, { kind: 'lasaItem', fel, cantitate: q, wx: x, wy: y, z }, R)
  if (!o.ok) return -1
  const s = itemLaCelula(w.iteme, x, y, z)
  if (s !== -1 && fel === H) w.iteme.alterare[s] = Math.min(S, w.iteme.cantitate[s]! * (ONE - 1))
  return s
}

/** Scena E (verif-P3): o „camara" prio 5 6×6 PLINA de hrana desincronizata, un depozit prio 3 20×20 cu hrana si piatra, 60 pe jos. */
function scenaE(seed: number): World {
  const { w, wx, wy, g } = sitPlat(7, 36)
  const z = g + 1
  const r = lcg(seed)
  assert.ok(applyCommand(w, { kind: 'picteazaZona', x0: wx, y0: wy, x1: wx + 5, y1: wy + 5, z, prioritate: 5 }, R).ok)
  assert.ok(applyCommand(w, { kind: 'picteazaZona', x0: wx + 10, y0: wy, x1: wx + 29, y1: wy + 19, z, prioritate: 3 }, R).ok)
  for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 6; dx++) pune(w, H, 75, wx + dx, wy + dy, z, Math.floor(r() * ONE))
  for (let dy = 0; dy < 20; dy++) for (let dx = 0; dx < 20; dx++) {
    const u = Math.floor(r() * 4)
    if (u === 0) continue
    pune(w, u === 1 ? Item.PIATRA : H, 1 + Math.floor(r() * 75), wx + 10 + dx, wy + dy, z, Math.floor(r() * ONE))
  }
  for (let k = 0; k < 60; k++) pune(w, k % 3 === 0 ? Item.PIATRA : H, 1 + Math.floor(r() * 75), wx + (k % 30), wy + 25 + Math.floor(k / 30) * 2, z, Math.floor(r() * ONE))
  return w
}

/** Scena F (verif-P3): un depozit 10×10 PLIN de hrana desincronizata si 40 de mormane de hrana pe jos, fara alt depozit. */
function scenaF(seed: number): World {
  const { w, wx, wy, g } = sitPlat(7, 36)
  const z = g + 1
  const r = lcg(seed)
  assert.ok(applyCommand(w, { kind: 'picteazaZona', x0: wx, y0: wy, x1: wx + 9, y1: wy + 9, z, prioritate: 3 }, R).ok)
  for (let dy = 0; dy < 10; dy++) for (let dx = 0; dx < 10; dx++) pune(w, H, 75, wx + dx, wy + dy, z, Math.floor(r() * ONE))
  for (let k = 0; k < 40; k++) pune(w, H, 1 + Math.floor(r() * 75), wx + 14 + (k % 20), wy + 2 + Math.floor(k / 20) * 3, z, Math.floor(r() * ONE))
  return w
}

/** Pasi de alterare chemati direct (lume fara pioni si fara incaperi: `tick` n-ar face altceva), cu un cititor dupa fiecare. */
function pasiCuCititor(w: World, tk: number, pasi: number, dupa: () => void): void {
  w.tick = tk
  indexZone(w, R)
  for (let k = 0; k < pasi; k++) {
    pasAlterare(w, R)
    w.tick += TPS
    indexZone(w, R)
    dupa()
  }
}

test('indexul de zone, predicatul EXACT (verif-P3): dupa FIECARE pas de alterare, indexul pastrat == indexul refacut de la zero — scenele E si F, vara 15:00 si toamna 12:00, 600 de pasi', () => {
  let stricate = 0
  let pasiCurati = 0
  let refaceri = 0
  for (const [n, tk] of [['vara', tickLa(0, 1, 2, 15)], ['toamna', tickLa(0, 2, 2, 12)]] as const) {
    for (const [nume, w] of [['E', scenaE(77)], ['F', scenaF(5)]] as const) {
      const ix = w.zone.index
      const r0 = ix.reconstructii
      const h0 = w.hranaStricata
      let invechite = 0
      const ce: Record<string, number> = {}
      pasiCuCititor(w, tk, 600, () => {
        if (!ix.murdar) pasiCurati++
        const pastrat = instantaneu(w)
        const pasi = ix.pasi
        const rec = ix.reconstructii
        ix.murdar = true
        indexZone(w, R)
        const adevar = instantaneu(w)
        ix.pasi = pasi
        ix.reconstructii = rec
        const d = diferente(pastrat, adevar, w.zone.count, w.iteme.count)
        if (d.length > 0) { invechite++; for (const x of d) ce[x] = (ce[x] ?? 0) + 1 }
        puneLaLoc(w, pastrat)
      })
      assert.equal(invechite, 0, `${nume} ${n}: ${invechite} pasi cu indexul invechit ${JSON.stringify(ce)}`)
      stricate += w.hranaStricata - h0
      refaceri += ix.reconstructii - r0
    }
  }
  // Contoarele de viata: s-a stricat hrana (deci predicatul a fost intrebat), iar indexul s-a si refacut si a si ramas curat.
  assert.ok(stricate > 1000 && refaceri > 20 && pasiCurati > 500, `stricate ${stricate}, refaceri ${refaceri}, citiri pe index curat ${pasiCurati}`)
})

test('K05 pe contoare (verif-P3): pasi de index pe tick < 30 pe un depozit CALD desincronizat de 1.296 de mormane si pe un depozit 48×48 cu 2.150 de mormane de piatra si 62 de hrana — vara 15:00, 600 de pasi', () => {
  const vara = tickLa(0, 1, 2, 15)
  // S1: 36×36, 1.296 de mormane de hrana, q in [1; 75], S in [0; ONE).
  {
    const { w, wx, wy, g } = sitPlat(7, 36)
    assert.ok(applyCommand(w, { kind: 'picteazaZona', x0: wx, y0: wy, x1: wx + 35, y1: wy + 35, z: g + 1, prioritate: 3 }, R).ok)
    const r = lcg(4242)
    for (let dy = 0; dy < 36; dy++) for (let dx = 0; dx < 36; dx++) pune(w, H, 1 + Math.floor(r() * 75), wx + dx, wy + dy, g + 1, Math.floor(r() * ONE))
    assert.equal(w.iteme.vii, 1296)
    const ix = w.zone.index
    const p0 = ix.pasi
    const h0 = w.hranaStricata
    pasiCuCititor(w, vara, 600, () => {})
    const pt = (ix.pasi - p0) / (600 * TPS)
    assert.ok(pt < 30, `S1: ${pt.toFixed(1)} pasi de index pe tick`)
    assert.ok(w.hranaStricata - h0 > 5000, `S1: stricate ${w.hranaStricata - h0} (depozitul chiar e cald)`)
  }
  // C: 48×48, 2.150 de mormane de piatra si pamant + 62 de hrana desincronizata, amestecate.
  {
    const L = 48
    const { w, wx, wy, g } = sitPlat(7, L)
    assert.ok(applyCommand(w, { kind: 'picteazaZona', x0: wx, y0: wy, x1: wx + L - 1, y1: wy + L - 1, z: g + 1, prioritate: 3 }, R).ok)
    const r = lcg(99)
    const cel: number[] = []
    for (let i = 0; i < L * L; i++) cel.push(i)
    for (let i = cel.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = cel[i]!; cel[i] = cel[j]!; cel[j] = t }
    let hrana = 0
    let alte = 0
    for (let p = 0; p < cel.length && (hrana < 62 || alte < 2150); p++) {
      const x = wx + (cel[p]! % L)
      const y = wy + Math.floor(cel[p]! / L)
      const eHrana = hrana < 62 && (alte >= 2150 || Math.floor(r() * 2212) < 62)
      const fel = eHrana ? H : Math.floor(r() * 2) === 0 ? Item.PIATRA : Item.PAMANT
      if (pune(w, fel, 1 + Math.floor(r() * 75), x, y, g + 1, Math.floor(r() * ONE)) === -1) continue
      if (eHrana) hrana++
      else alte++
    }
    assert.deepEqual([hrana, alte], [62, 2150])
    const ix = w.zone.index
    const p0 = ix.pasi
    const h0 = w.hranaStricata
    pasiCuCititor(w, vara, 600, () => {})
    const pt = (ix.pasi - p0) / (600 * TPS)
    assert.ok(pt < 30, `C: ${pt.toFixed(1)} pasi de index pe tick`)
    assert.ok(w.hranaStricata - h0 > 200, `C: stricate ${w.hranaStricata - h0}`)
  }
})

// ---------------------------------------------------------------------------
// a doua cautare de mancare (§5, J-8)
// ---------------------------------------------------------------------------

test('a doua cautare de mancare (J-8): un pion flamand fara hrana in 96 de celule o gaseste la ~150 (aceeasi componenta) si porneste sa manance; la peste 384, nu', () => {
  for (const [dMin, dMax, gaseste] of [[140, 160, true], [395, 420, false]] as const) {
    const { w, sit } = laSit(12345, 1)
    const c = solidLaDistanta(w, sit.wx, sit.wy, sit.g, dMin, dMax)
    const id = lasaItem(w, H, 40, c.wx, c.wy)
    // Regiunile pe tot dreptunghiul dintre pion si hrana (in joc le acopera umblatul si sapatul).
    const x0 = Math.min(sit.wx, c.wx)
    const x1 = Math.max(sit.wx, c.wx)
    const y0 = Math.min(sit.wy, c.wy)
    const y1 = Math.max(sit.wy, c.wy)
    for (let x = x0; x <= x1 + 16; x += 16) for (let y = y0; y <= y1 + 16; y += 16) ensureArea(w.terrain, w.regions, x, y, sit.g + 1, 1, R)
    const a = w.agents
    const rp = regionAt(w.regions, cellOf(a.x[0]!), cellOf(a.y[0]!), a.z[0]!)
    const rf = regionAt(w.regions, c.wx, c.wy, c.g + 1)
    assert.ok(rp !== NO_REGION && rf !== NO_REGION && find(w.regions, rp) === find(w.regions, rf), 'premisa: aceeasi componenta')
    a.nevoi[0 * NEVOI + Nevoie.FOAME] = 100
    let mananca = false
    for (let t = 0; t < 400 && !mananca; t++) {
      tick(w, R)
      mananca = a.jobKind[0] === FelJob.MANANCA && a.jobTarget[0] === id
    }
    const d = Math.abs(c.wx - cellOf(a.x[0]!)) + Math.abs(c.wy - cellOf(a.y[0]!))
    assert.ok(d > R.nevoieScanRadiusCells, `premisa: hrana la ${d} celule, dincolo de prima raza`)
    assert.equal(mananca, gaseste, `hrana la ~${dMin}–${dMax} celule`)
  }
})

// ---------------------------------------------------------------------------
// fragmentarea (STARE-7): nimic nu e gratuit
// ---------------------------------------------------------------------------

test('fragmentarea nu scapa de pierdere: 750 de mormane de 1 u si 10 de 75 u, 5 zile la 15 °C constant — VALOAREA fragmentata (~100 u) e sub cea unita (~315 u); pe hartie, fiecare morman de 1 u are S = 10.080·λ(15 °C) si nicio unitate stricata', () => {
  // Clima constanta: 15 °C, fara unda anului, a zilei si fara val de frig (T_afara exact 983.040 Q16).
  const cald: Rules = { ...R, clima: { ...R.clima, tMedieMc: 15000, amplitudineAnMc: 0, amplitudineZiMc: 0, valFrig: { ...R.clima.valFrig, amplitudineMc: 0 } } }
  const lambda = lambdaAlterare(cald, 15 * Q)
  assert.equal(lambda, 46147)
  const valoare = (w: World) => {
    let v = 0
    let u = 0
    for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1) { v += w.iteme.cantitate[i]! - w.iteme.alterare[i]! / ONE; u += w.iteme.cantitate[i]! }
    return { v, u }
  }
  const lumi: World[] = []
  for (const [cate, q] of [[750, 1], [10, 75]] as const) {
    const { w, wx, wy, g } = sitPlat(7, 30)
    for (let i = 0; i < cate; i++) assert.ok(applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: q, wx: wx + (i % 30), wy: wy + Math.floor(i / 30), z: g + 1 }, cald).ok)
    w.tick = 0
    for (let k = 0; k < 5 * 2016; k++) {
      assert.equal(tAfara(w.seed, w.tick, cald), 15 * Q)
      pasAlterare(w, cald)
      w.tick += TPS
    }
    lumi.push(w)
  }
  const [frag, unit] = lumi as [World, World]
  for (let i = 0; i < frag.iteme.count; i++) assert.deepEqual([frag.iteme.cantitate[i], frag.iteme.alterare[i]], [1, 10080 * lambda])
  const vf = valoare(frag)
  const vu = valoare(unit)
  assert.equal(vf.u, 750, 'fragmentat: unitatile vizibile mint (toate inca acolo)')
  assert.ok(Math.abs(vf.v - 750 * (1 - (10080 * lambda) / ONE)) < 1e-6 && vf.v > 99 && vf.v < 101, `valoarea fragmentata ${vf.v.toFixed(2)}`)
  assert.ok(vu.v > 305 && vu.v < 325, `valoarea unita ${vu.v.toFixed(2)} (exponentiala: 315)`)
  assert.ok(vf.v < vu.v, 'fragmentarea pierde MAI MULT (liniar, nu exponential) — niciodata mai putin')
})

// ---------------------------------------------------------------------------
// literalul „S+ hrana" (§7) si M5 pe pasul real
// ---------------------------------------------------------------------------

test('SALVARE scena S+ hrana (literalul dedicat, §7): hrana in casa, in pivnita, sub cer si in tocul pivnitei, peste o noapte de toamna (20:00 → 08:00) — stricata > 0 in casa, in toc si sub cer, 0 in pivnita; M5 salvat in afara grilei; hash-ul la capat', () => {
  const gf = geometriaFinala(tickLa(0, 2, 1, 20))
  const w = gf.w
  const { ids } = scenaLocuri(gf)
  const salvari: { text: string; de: number }[] = []
  for (let t = 0; t < 12 * 1680; t++) {
    if (t === 6 * 1680 + 7) salvari.push({ text: encode(w), de: w.tick })
    tick(w, R)
  }
  const stricate = (n: string) => 75 - w.iteme.cantitate[slotItem(w.iteme, ids[n]!)]!
  assert.ok(stricate('casa') >= 2 && stricate('afara') >= 1 && stricate('tocPivnita') >= 2, `stricate: casa ${stricate('casa')}, afara ${stricate('afara')}, toc ${stricate('tocPivnita')}`)
  assert.equal(stricate('tocPivnita'), stricate('casa'), 'tocul pivnitei are T-ul casei (partea mai calda)')
  assert.deepEqual([stricate('pivnita'), w.iteme.alterare[slotItem(w.iteme, ids['pivnita']!)]], [0, 0], 'pivnita: nimic, nici macar S')
  assert.ok(w.hranaStricata >= 6)
  // M5: salvat la 6 h + 7 tickuri (in afara grilei de 1 Hz), incarcat, dus pana la capat — acelasi hash.
  const s = salvari[0]!
  const inc = decode(s.text, R)
  assert.ok(inc.ok)
  if (!inc.ok) return
  while (inc.value.tick < w.tick) tick(inc.value, R)
  assert.equal(hashWorld(inc.value), hashWorld(w), 'M5 pe pasul real')
  // Literal NOU (t.3, commit-ul B): singurul hash care vede hrana intr-o INCAPERE (standardul n-are componente, acces-joc
  // tine hrana sub cer, S+ n-are hrana). Se muta la orice schimbare a curbei, a pasului, a tocului sau a regimului termic.
  assert.equal(hashWorld(w), '505346b7')
})
