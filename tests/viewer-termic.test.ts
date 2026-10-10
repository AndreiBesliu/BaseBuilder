/**
 * Temperatura pe ecran — t.2a commit-ul 4 (ancorele, densitatea, tenta, tasta U) și t.2b valul 2 (research/temperatura-t2b.md
 * §8, §5.3): temperatura e STARE, iar ecranul o CITEȘTE, pe pași reali (`tick`, `sincronizeazaLumea`), nu pe `w.tick =`.
 *
 * INSPECTORUL, trei rânduri fixe: (1) T din stare și afară, (2) „trage spre X_tot" / „stabil", cu X din LINIA grafului
 * simulării (vecinele la T-ul lor de acum) și oamenii filtrați (F4), (3) câți oameni sunt înăuntru. Textele pe HÂRTIE
 * (conductanțele casei din tests/termic.test.ts, căldura omului din fracția regulilor), oracolul „X din rânduri == X din
 * linia grafului" după pași reali (casa cu etaj și pivniță, M10, mina), oamenii ecranului == căldura pasului, filtrul,
 * componenta fără T. Explicația rămâne în memoria ei și temperatura NU intră în cheia de redesenare (butoanele rămân
 * aceleași noduri — pe ecran, bench/ui-fum.mjs).
 *
 * OVERLAY-UL U: valorile == T din stare după FIECARE tick (fără cheie de tick, UI-3), recolorarea doar la schimbare,
 * componenta fără T nedesenată; ancorele cifrelor pe hârtie, pe M10 și pe mina de 192×192×3, densitatea, tenta pe
 * luminozitate. Ecranul NU cere graful t.2a (contoarele lui rămân 0) și nu mișcă contoarele grafului incremental.
 *
 * ERORILE (§5.3, UI-6): monitorul invarianților (o alertă și un `console.error` pe tip nou) și `stepSimSigur` (o excepție
 * din tick se raportează, cadrul nu aruncă). AVANSUL DE PROBĂ (`avanseazaSigur`, al lui `__kinstead.avanseaza`): tickuri
 * reale prin funcția dată, nu timp sărit. LEGENDA lui U: aerul de afară de la tickul lumii, ca inspectorul.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildM10PeLume } from '../src/harness/fixture-m10.ts'
import type { IndexCamere } from '../src/sim/camere.ts'
import { celuleLaNivel, componentaLa, decodeazaFelie, sincronizeazaCamere } from '../src/sim/camere.ts'
import { tAfara, tSol } from '../src/sim/clima.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { ClasaDir } from '../src/sim/fete.ts'
import { Faction } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill, groundLevelM, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { Destinatie, geometriaCanalelor, regimPermanent, statGraf, statMemorieTermica, temperaturaComponentei, temperaturiRezervoare } from '../src/sim/termic.ts'
import { canaleAcum, oameniPeComponente, pasTermic, sincronizeazaLumea, statTermic, temperaturaAcum, tragerea, tragereCuOameni } from '../src/sim/temperatura.ts'
import { createWorld, tick } from '../src/sim/world.ts'
import { creeazaFiltruOameni, creeazaMemorieTermica, creeazaMonitorTermic, inspecteazaCelula, pasFiltru, termicLa } from '../viewer/ui/model.ts'
import type { FiltruOameni, StareFiltru } from '../viewer/ui/model.ts'
import { cheieInspectorCelula, creeazaMemorieIncapere, usilePropuse } from '../viewer/ui/memorie-incapere.ts'
import {
  TEXT_TEMPERATURA_NECUNOSCUTA,
  TEXT_TRAGERE_NECUNOSCUTA,
  textCanale,
  textDrum,
  textEroareSimulare,
  textEroareTemperatura,
  textGradeIntregi,
  textIntervalTemperatura,
  textOameni,
  textProcent,
  textTemperaturaAcum,
  textTragere,
  textZecimi,
} from '../viewer/ui/texte.ts'
import type { CanalTermic } from '../src/sim/termic.ts'
import { actiuneTasta } from '../viewer/ui/taste.ts'
import { avanseazaSigur, stepSimSigur } from '../viewer/agenti.ts'
import { hashWorld } from '../src/sim/hash.ts'
import type { AgentLayer } from '../viewer/agenti.ts'
import {
  actualizeazaTemperaturaOverlay,
  alegeEtichete,
  cifreLegenda,
  ancoreLaNivel,
  CULOARE_CALDA,
  CULOARE_RECE,
  createTemperaturaOverlay,
  culoareTemperatura,
  intervalCuAfara,
  intervalTenta,
  PRAG_PX_CELULA,
} from '../viewer/overlay-temperatura.ts'
import type { AncoraEticheta, OverlayTemperatura, ProiectieEticheta } from '../viewer/overlay-temperatura.ts'
import { R, sitPlat } from './fixturi.ts'
import { bun, grafLumii, mina192 } from './fixturi-pas.ts'
import { casaTermica, compLa } from './fixturi-temperatura.ts'

const P = Material.PIATRA_CONSTRUITA
const Q = 65536
const WC = WORLD_CELLS

/** Casa 5×5×2 de piatră a testelor termice: ziduri pe [g+1, g+2], acoperiș la g+3, o celulă de USĂ la (2, 0, g+1). */
function casa(w: World, x0: number, y0: number, g: number, usa = true): void {
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    assert.ok(fill(w.terrain, x0 + dx, y0 + dy, z, usa && dx === 2 && dy === 0 && z === g + 1 ? Material.USA : P).ok)
  }
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(w.terrain, x0 + dx, y0 + dy, g + 3, P).ok)
}

/** rot(n / d), d > 0, jumătatea departe de zero — scrisă aici a doua oară, ca referință pe hârtie. */
function rot(n: bigint, d: bigint): number {
  const a = n < 0n ? -n : n
  let q = a / d
  if (2n * (a - q * d) >= d) q++
  return Number(n < 0n ? -q : q) + 0
}

/** Formatul de hârtie al testelor: zecimi și grade întregi, minusul tipografic, fără „−0". */
const zec = (q: number): string => { const z = Math.round((Math.abs(q) * 10) / Q); return `${q < 0 && z > 0 ? '−' : ''}${Math.floor(z / 10)},${z % 10}` }
const intreg = (q: number): string => { const g = Math.round(Math.abs(q) / Q); return `${q < 0 && g > 0 ? '−' : ''}${g}` }

/** Pași reali, cu filtrul oamenilor hrănit după fiecare tick (cum face main.ts, `tickObservat`). */
function avanseaza(w: World, n: number, filtru: FiltruOameni | null = null): void {
  for (let i = 0; i < n; i++) {
    tick(w, R)
    filtru?.dupaTick(w)
  }
}

/** X din linia nodului, scris AICI din nou din graful simulării: rezervoarele la tick, vecinele cu T-ul dat. */
function xDinGraf(w: World, compId: number, tVecina: (comp: number) => number): number {
  const g = grafLumii(w)
  const nod = g.noduri.get(g.nodComp.get(compId)!)!
  const tRez = temperaturiRezervoare(w.seed, w.tick, R)
  let num = 0n
  let S = 0n
  for (const [bin, G] of nod.bin) { num += BigInt(G) * BigInt(tRez[bin]!); S += BigInt(G) }
  for (const [e, G] of nod.vec) { num += BigInt(G) * BigInt(tVecina(g.noduri.get(e)!.comp)); S += BigInt(G) }
  return rot(num, S)
}

/** Căldura a `W` wați pe un pas, pe hârtie (§5.1): rs(W·2^16·tps·86.400·μ_aer / (ziTicks·c_aer)). */
function calduraPeHartie(W: number): number {
  return rot(BigInt(W) * 65536n * BigInt(R.ticksPerSecond * 86400 * R.termic.mase.aer), BigInt(R.calendar.ziTicks * R.termic.cAerJPeK))
}

// --- 1. inspectorul ------------------------------------------------------------------

test('TERMIC ECRAN inspectorul pe hartie: casa 5x5x2 cu usa — randul 1 din stare (proveninta: solul de sub podea), X din conductantele calculate de mana, randul 3, descompunerea; pe pasi reali, T si X se urmaresc', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  assert.equal(w.tick, 0, 'fixtura: lumea noua, tickul 0')
  const celula = { x: wx + 2, y: wy + 2, z: g + 1 }
  const id = componentaLa(w.camere, celula.x, celula.y, celula.z)!.id
  // Pe hârtie (tests/termic.test.ts, „casa 5x5x2 cu usa"): pereții 23 · 86.231 = 1.983.313, acoperișul 9 · 89.775 =
  // 807.975, ușa 1 · 139.438 — spre aer, 2.930.726 —; podeaua 9 · 110.144 = 991.296 spre sol (d 0). Σ 3.922.022.
  // Ponderile Q16 pe sume cumulate: pereți 33.141, podea 16.564, acoperiș 13.501, restul (ușa) 2.330.
  // T: proveniența C3 — singura masă persistentă a casei nou închise e solul podelei, deci aerul pornește de la T_sol(0)
  // (zidurile și acoperișul sunt masă APĂRUTĂ, iau T-ul rezultat). La tickul 0: 861.904 / 65.536 = 13,15 °C; afară
  // 978.098 = 14,92 °C; X = rot(2.930.726 · 978.098 + 991.296 · 861.904, 3.922.022) = 948.730 (14,48 °C) > T: „↗".
  assert.equal(tSol(0, 0, R), 861904)
  assert.equal(tAfara(w.seed, 0, R), 978098)
  assert.deepEqual(termicLa(w, R, celula), {
    comp: id,
    tQ16: 861904,
    xTotQ16: 948730,
    oameni: 0,
    linie: '13,2 °C · afară 15 °C',
    tragere: 'trage spre 14,5 °C ↗',
    oameniText: 'oameni: niciunul',
    canale: '71% aer de afară (pereți 51%, acoperiș 21%, ~15 °C) · 25% sol prin podea (~13 °C) · rest 4%',
  })
  // Pași reali: 12 × 420 de tickuri (21 de pași fiecare). La fiecare oprire, T e cel din stare, X e formula de hârtie la
  // tickul lumii (casa n-are vecine), iar rândurile se scriu din ele.
  const linii = new Set<string>()
  const tragere = new Set<string>()
  for (let p = 0; p < 12; p++) {
    avanseaza(w, 420)
    const ta = tAfara(w.seed, w.tick, R)
    const ts = tSol(0, w.tick, R)
    const X = rot(2930726n * BigInt(ta) + 991296n * BigInt(ts), 3922022n)
    const T = w.temperatura.slot.t[id]!
    const t = termicLa(w, R, celula)
    assert.ok(t)
    assert.equal(t.tQ16, T, `pasul ${p}: T din stare`)
    assert.equal(t.xTotQ16, X, `pasul ${p}: X pe hârtie (tickul ${w.tick})`)
    assert.equal(t.linie, `${zec(T)} °C · afară ${intreg(ta)} °C`)
    assert.equal(t.tragere, zec(X) === zec(T) ? 'stabil' : `trage spre ${zec(X)} °C ${X < T ? '↘' : '↗'}`)
    assert.equal(t.canale, `71% aer de afară (pereți 51%, acoperiș 21%, ~${intreg(ta)} °C) · 25% sol prin podea (~${intreg(ts)} °C) · rest 4%`)
    linii.add(t.linie)
    tragere.add(t.tragere)
  }
  assert.equal(statTermic(w).pasi, (12 * 420) / R.ticksPerSecond, 'fixtura: pasii au rulat (unul la 20 de tickuri, de la tickul 0)')
  assert.ok(linii.size >= 4 && tragere.size >= 4, `T si X s-au miscat: ${[...linii].join(' | ')} / ${[...tragere].join(' | ')}`)
  // Afară, sub cer: nicio componentă, nimic termic.
  assert.equal(termicLa(w, R, { x: wx + 8, y: wy + 8, z: g + 1 }), null)
})

test('TERMIC ECRAN inspectorul: N tickuri fara editari — textul temperaturii se schimba, explicatia ramane in memorie (1 calcul, acelasi obiect), cheia de redesenare nu se schimba', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const mem = creeazaMemorieIncapere(() => 0)
  const memT = creeazaMemorieTermica()
  // Clic pe podeaua casei: aerul întrebat e deasupra ei.
  const sel = [wx + 2, wy + 2, g] as const
  const inc0 = mem.ia(w, ...sel, true)
  assert.ok(inc0 && inc0.e.fel === 'INCAPERE', JSON.stringify(inc0))
  assert.doesNotMatch(JSON.stringify(inc0), /°C|echilibru|tQ16|canale|tragere/, 'explicatia nu poarta nimic termic')
  const cheie = (): string => cheieInspectorCelula(inspecteazaCelula(w, R, ...sel, null), mem.versiune(), usilePropuse(w, mem.ia(w, ...sel, false)))
  const cheie0 = cheie()
  const linii = new Set<string>()
  const t0 = memT.ia(w, R, inc0.celula, null)
  assert.ok(t0 && t0.tQ16 !== null)
  linii.add(t0.linie)
  for (let p = 0; p < 12; p++) {
    avanseaza(w, 420)
    const inc = mem.ia(w, ...sel, false)
    assert.equal(inc, inc0, `pasul ${p}: explicatia e acelasi obiect (memoria ei nu se invalideaza fara editari)`)
    const t = memT.ia(w, R, inc!.celula, null)
    assert.ok(t && t.tQ16 !== null)
    // Temperatura e a lumii de ACUM: starea, la fiecare cerere — fără fereastra de o secundă a lui t.2a.
    assert.equal(t.tQ16, temperaturaAcum(w, t.comp), `pasul ${p}: tickul ${w.tick}`)
    assert.deepEqual(t, termicLa(w, R, inc!.celula), 'memoria (doar geometria) == calculul fara memorie')
    linii.add(t.linie)
    assert.equal(cheie(), cheie0, `pasul ${p}: cheia de redesenare nu poarta temperatura (butoanele raman aceleasi noduri)`)
  }
  assert.equal(mem.calcule(), 1, 'un singur calcul al explicatiei in 3 ore de joc')
  assert.equal(memT.geometrii(), 1, 'o singura geometrie a descompunerii (nicio editare)')
  assert.ok(linii.size >= 4, `textul temperaturii s-a schimbat fara clic: ${[...linii].join(' | ')}`)
  // Un re-clic pe aceeași celulă: explicația tot din memorie (nicio editare).
  assert.equal(mem.ia(w, ...sel, true), inc0)
  assert.equal(mem.calcule(), 1)
})

test('TERMIC ECRAN textele randurilor pe hartie: T si afara, „stabil" doar cand zecimile coincid (pragul e TEXTUL), sageata, oamenii fara „+X °C", legenda fara „la echilibru", alertele', () => {
  // Rândul 1.
  assert.equal(textTemperaturaAcum(6 * Q + 13107, 12 * Q), '6,2 °C · afară 12 °C')
  assert.equal(textTemperaturaAcum(-12 * Q - 26214, -16 * Q), '−12,4 °C · afară −16 °C')
  assert.equal(TEXT_TEMPERATURA_NECUNOSCUTA, 'Temperatura nu se știe (eroare internă)')
  // Rândul 2: „stabil" exact când zecimile lui X_tot sunt ale lui T. Pe hârtie: 4,449 °C = 291.570 („4,4"), 4,451 °C =
  // 291.701 („4,5"): 0,002 °C, dar alt text — „trage spre". 4,40 °C = 288.358 și 4,449 °C: 0,049 °C, același text — „stabil".
  assert.equal(textTragere(291570, 291701), 'trage spre 4,5 °C ↗', '0,002 °C, dar alte zecimi: nu e „stabil"')
  assert.equal(textTragere(291701, 291570), 'trage spre 4,4 °C ↘')
  assert.equal(textTragere(288358, 291570), 'stabil', '0,049 °C, aceleasi zecimi')
  assert.equal(textTragere(291570, 288358), 'stabil')
  assert.equal(textTragere(6 * Q + 13107, 4 * Q + 52429), 'trage spre 4,8 °C ↘')
  assert.equal(textTragere(-12 * Q, -10 * Q - 52429), 'trage spre −10,8 °C ↗')
  assert.equal(textTragere(-2621, 2621), 'stabil', '−0,04 și +0,04 °C se scriu amândouă „0,0"')
  assert.equal(TEXT_TRAGERE_NECUNOSCUTA, 'trage spre: nu se știe')
  // Rândul 3: numărul, nu „+X °C" (JOC-6).
  assert.equal(textOameni(0), 'oameni: niciunul')
  assert.equal(textOameni(1), 'oameni: 1 înăuntru')
  assert.equal(textOameni(12), 'oameni: 12 înăuntru')
  // Legenda lui U: temperatura de acum, fără „la echilibru".
  assert.equal(textIntervalTemperatura(3, -12 * Q - 26214, -10 * Q - 52429, -16 * Q), '−12,4 … −10,8 °C · afară −16 °C')
  assert.equal(textIntervalTemperatura(1, 4 * Q, 4 * Q, 12 * Q), '~4,0 °C · afară 12 °C')
  assert.equal(textIntervalTemperatura(0, 0, 0, 12 * Q), 'Nimic acoperit pe nivelul ăsta · afară 12 °C')
  // Alertele (§5.3, UI-6): textul existent al invariantului, „Spune-i dezvoltatorului (Diagnostic, F3)".
  assert.equal(textEroareTemperatura(), 'Temperatura: Eroare internă (invariant). Spune-i dezvoltatorului (Diagnostic, F3).')
  assert.equal(textEroareSimulare(), 'Simularea s-a oprit: eroare internă. Spune-i dezvoltatorului (Diagnostic, F3). Spațiu o pornește din nou.')
})

test('TERMIC ECRAN textele: zecimile si gradele cu minus tipografic, rotunjire simetrica, fara „−0,0"; procentele; drumul', () => {
  // Pe hârtie, în Q16 (65.536 = 1 °C): 0,25 °C = 16.384 → zecimea 2,5 → jumătatea departe de zero.
  assert.equal(textZecimi(0), '0,0')
  assert.equal(textZecimi(16384), '0,3')
  assert.equal(textZecimi(-16384), '−0,3', 'simetric: rot(−x) = −rot(x)')
  assert.equal(textZecimi(-2621), '0,0', '−0,04 °C nu e „−0,0"')
  assert.equal(textZecimi(-3277), '−0,1', '−0,05 °C (3.276,8 pe Q16, rotunjit în sus)')
  assert.equal(textZecimi(291635), '4,4', '4,44999 °C')
  assert.equal(textZecimi(291636), '4,5', '4,45001 °C')
  assert.equal(textZecimi(-12 * Q - 26214), '−12,4')
  assert.equal(textGradeIntregi(-26214), '0', '−0,4 °C')
  assert.equal(textGradeIntregi(-32768), '−1', '−0,5 °C: departe de zero')
  assert.equal(textGradeIntregi(32768), '1')
  assert.equal(textGradeIntregi(12 * Q), '12')
  assert.equal(textProcent(0), '0%')
  assert.equal(textProcent(1), '<1%')
  assert.equal(textProcent(327), '<1%', '0,499%')
  assert.equal(textProcent(328), '1%', '0,5005%')
  assert.equal(textProcent(65536), '100%')
  assert.equal(textDrum(''), '')
  assert.equal(textDrum('6x1'), '1 m piatră')
  assert.equal(textDrum('1x1+2x2'), '3 m pământ+rocă', 'materialul cu mai multe celule intai')
  assert.equal(textDrum('1x2+2x1'), '3 m rocă+pământ')
})

test('TERMIC ECRAN textele: descompunerea contopeste randurile pe destinatie, in ordinea ponderii, cu restul', () => {
  const r = (clasa: number, destinatie: number, pondereQ16: number, gQ16: number, tDestQ16: number, o: Partial<CanalTermic> = {}): CanalTermic =>
    ({ clasa: clasa as CanalTermic['clasa'], destinatie: destinatie as CanalTermic['destinatie'], usa: false, deschis: false, pondereQ16, gQ16, tDestQ16, compozitie: '6x1', grosime: 1, material: P, fete: 1, ...o })
  // Pivnița designului: 42% pereți și 24% podea spre sol, 31% acoperiș spre aer, prin 3 m de rocă și pământ.
  const pivnita = {
    randuri: [
      r(ClasaDir.LAT, Destinatie.SOL, 27525, 3, 3 * Q),
      r(ClasaDir.SUS, Destinatie.AFARA, 20316, 2, 12 * Q, { compozitie: '1x2+2x1', grosime: 3, material: Material.ROCA }),
      r(ClasaDir.JOS, Destinatie.SOL, 15729, 1, 6 * Q),
    ],
    rest: { pondereQ16: 1966 },
  }
  // Solul, contopit: 27.525 + 15.729 = 43.254 → 66%; media pe g: (3 · 3 + 1 · 6) / 4 = 3,75 → ~4 °C.
  assert.equal(textCanale(pivnita), '66% sol (pereți 42%, podea 24%, ~4 °C) · 31% aer de afară prin acoperiș (3 m rocă+pământ, ~12 °C) · rest 3%')
  // Ordinea e a GRUPULUI: 40% aer prin pereți e primul rând, dar solul contopit (35% + 20% = 55%) trece înaintea lui.
  const grupat = {
    randuri: [
      r(ClasaDir.LAT, Destinatie.AFARA, 26214, 4, 10 * Q),
      r(ClasaDir.JOS, Destinatie.SOL, 22938, 2, 2 * Q),
      r(ClasaDir.LAT, Destinatie.SOL, 13107, 2, 4 * Q, { compozitie: '2x1' }),
    ],
    rest: { pondereQ16: 3277 },
  }
  assert.equal(textCanale(grupat), '55% sol (podea 35%, pereți 20%, ~3 °C) · 40% aer de afară prin pereți (1 m piatră, ~10 °C) · rest 5%')
  // Ușa e grupul ei: „ușă" în locul pereților, fără drum; chepengul e ușa din tavan sau din podea.
  assert.equal(textCanale({ randuri: [r(ClasaDir.LAT, Destinatie.AFARA, 65536, 1, -3 * Q, { usa: true, compozitie: '9x1', material: Material.USA })], rest: { pondereQ16: 0 } }), '100% aer de afară prin ușă (~−3 °C)')
  assert.equal(textCanale({ randuri: [r(ClasaDir.SUS, Destinatie.INCAPERI, 65536, 1, 0, { usa: true })], rest: { pondereQ16: 0 } }), '100% încăperi vecine prin chepeng (~0 °C)')
  // Un spațiu deschis: fețele DESCHISE sunt „gol deschis", fără drum (recenzia ECRAN, L4-1).
  assert.equal(textCanale({ randuri: [r(ClasaDir.LAT, Destinatie.AFARA, 65536, 1, 5 * Q, { compozitie: '', grosime: 0, material: -1, deschis: true })], rest: { pondereQ16: 0 } }), '100% aer de afară prin gol deschis (~5 °C)')
})

test('TERMIC ECRAN inspectorul: fata ADANC in sus e „peste 8 m de piatră", nu sol; nicio eticheta „pierde/câștigă"', () => {
  // Donjonul verificatorului L2-3: cameră 3×3×2 cu zid de 1 m, 11 m de piatră plină deasupra.
  const { w, wx, wy, g } = sitPlat(20260913, 7)
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const zid = i === 0 || j === 0 || i === 4 || j === 4
    for (let h = 1; h <= 2; h++) if (zid) assert.ok(fill(w.terrain, wx + i, wy + j, g + h, P).ok)
    for (let h = 3; h <= 13; h++) assert.ok(fill(w.terrain, wx + i, wy + j, g + h, P).ok)
  }
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const t = termicLa(w, R, { x: wx + 2, y: wy + 2, z: g + 1 })
  assert.ok(t)
  // Pe hârtie: pereții 24 · 86.231 = 2.069.544 spre aer, podeaua 9 · 110.144 = 991.296, tavanul 9 · 13.596 = 122.364.
  // Σ 3.183.204; cumulat: 42.608 (65,0%), 63.017 → 20.409 (31,1%), restul 2.519 (3,8%) — al treilea rând, nu „rest".
  assert.match(t.canale, /^65% aer de afară prin pereți \(1 m piatră, ~−?\d+ °C\) · 31% sol prin podea \(~−?\d+ °C\) · 4% tavan peste 8 m de piatră \(~−?\d+ °C\)$/u)
  assert.doesNotMatch(t.canale, /sol adânc|pierde|câștigă/)
  const geo = bun(geometriaCanalelor(w.camere, R, componentaLa(w.camere, wx + 2, wy + 2, g + 1)!.id), 'geometria')
  assert.deepEqual(geo.randuri.map((r) => r.pondereQ16), [42608, 20409, 2519])
  assert.equal(textCanale(bun(canaleAcum(w, R, geo), 'canaleAcum')), t.canale)
})

test('TERMIC ECRAN inspectorul pe hartie: casa 5x5x2 cu golul usii (2 celule) — golul e „gol deschis", nu „pereți"', () => {
  // Recenzia ECRAN, L4-1: DESCHISA și EXT au aceeași destinație (AFARA), deci fără `deschis` în cheia grupului golul
  // se contopea cu pereții, iar textul spunea „pereți 93%" pentru o componentă care stă 87% pe gol.
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g, false)
  for (let z = g + 1; z <= g + 2; z++) assert.ok(dig(w.terrain, wx + 2, wy, z).ok)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const celula = { x: wx + 2, y: wy + 2, z: g + 1 }
  // Pe hârtie: golul 2 · 13.107.200 = 26.214.400 (DESCHISĂ, 200 W/K); pereții spre aer 22 · 86.231 + 4 · 48.545 (2 m
  // de piatră, lângă gol: 130 + 1.180 + 40 = 1.350) = 2.091.262; podeaua 10 · 110.144 = 1.101.440; acoperișul
  // 10 · 89.775 = 897.750. Σ 30.304.852; cumulat: 56.690 (86,5%), 61.213 → 4.523 (6,9%), 63.595 → 2.382 (3,6%),
  // restul 1.941 (3,0%).
  const geo = bun(geometriaCanalelor(w.camere, R, componentaLa(w.camere, celula.x, celula.y, celula.z)!.id), 'geometria')
  assert.deepEqual(geo.randuri.map((r) => [r.clasa, r.destinatie, r.deschis, r.gQ16, r.pondereQ16, r.fete]), [
    [ClasaDir.LAT, Destinatie.AFARA, true, 26214400, 56690, 2],
    [ClasaDir.LAT, Destinatie.AFARA, false, 2091262, 4523, 26],
    [ClasaDir.JOS, Destinatie.SOL, false, 1101440, 2382, 10],
  ])
  assert.equal(geo.rest.pondereQ16, 1941)
  assert.equal(geo.sumaG, 30304852)
  assert.equal(w.tick, 0, 'fixtura: lumea noua, tickul 0 (afară 15 °C, solul 13 °C)')
  assert.equal(termicLa(w, R, celula)?.canale, '93% aer de afară (gol deschis 87%, pereți 7%, ~15 °C) · 4% sol prin podea (~13 °C) · rest 3%')
})

test('TERMIC ECRAN X_tot cu oameni: un pion inchis intr-o casa fara usa — „trage spre" tine cont de el (P/ΣG pe hartie), randul 3 il numara; dupa ce pleaca, filtrul il mai arata 2 pasi', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g, false)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const celula = { x: wx + 2, y: wy + 2, z: g + 1 }
  const id = componentaLa(w.camere, celula.x, celula.y, celula.z)!.id
  const om = applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 2) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R)
  assert.ok(om.ok, JSON.stringify(om))
  const f = creeazaFiltruOameni()
  // Pe hârtie: casa fără ușă — pereții 24 · 86.231 + acoperișul 9 · 89.775 = 2.877.519 spre aer, podeaua 9 · 110.144 =
  // 991.296 spre sol; Σ 3.868.815. Un om de 100 W: P · 2^32 la numărător (W → Q16 W/K × Q16 °C).
  const xTot = (W: number): number => rot(2877519n * BigInt(tAfara(w.seed, w.tick, R)) + 991296n * BigInt(tSol(0, w.tick, R)) + BigInt(W) * 4294967296n, 3868815n)
  // Primul tick (cu pasul de la tickul 0) doar arată filtrului lumea; al doilea pas e primul eșantion — fără istorie,
  // se arată chiar el.
  avanseaza(w, 21, f)
  assert.equal(f.esantioane(), 1)
  let t = termicLa(w, R, celula, f)
  assert.ok(t)
  assert.equal(t.oameni, 1)
  assert.equal(t.oameniText, 'oameni: 1 înăuntru')
  assert.equal(t.xTotQ16, xTot(100), 'X_tot = X + P/ΣG, pe hartie')
  assert.ok(t.xTotQ16! - xTot(0) > Q, `fixtura: un om muta X cu peste 1 °C intr-o casa de 18 m³ (${(t.xTotQ16! - xTot(0)) / Q})`)
  assert.equal(t.tragere, zec(t.xTotQ16!) === zec(t.tQ16!) ? 'stabil' : `trage spre ${zec(t.xTotQ16!)} °C ${t.xTotQ16! < t.tQ16! ? '↘' : '↗'}`)
  // Omul pleacă (moare): eșantioanele devin 0, dar ce se arată se schimbă abia după 3 eșantioane egale.
  assert.ok(applyCommand(w, { kind: 'killAgent', id: om.ok ? om.value : -1 }, R).ok)
  const aratati: number[] = []
  for (let k = 0; k < 4; k++) {
    avanseaza(w, 20, f)
    t = termicLa(w, R, celula, f)!
    aratati.push(t.oameni)
    assert.equal(t.xTotQ16, xTot(t.oameni * R.termic.omW), `pasul ${k}: X_tot cu oamenii ARATATI`)
    assert.equal(t.oameniText, textOameni(t.oameni))
  }
  assert.deepEqual(aratati, [1, 1, 0, 0], 'eșantioanele [1, 0] și [1, 0, 0] arată încă 1; [0, 0, 0] arată 0')
  assert.equal(oameniPeComponente(w).get(id) ?? 0, 0)
  // Fără filtru (inspectorul unei lumi fără ecran), oamenii de acum.
  assert.equal(termicLa(w, R, celula)!.oameni, 0)
})

test('TERMIC ECRAN filtrul oamenilor pe hartie: ce se arata se schimba doar dupa 3 esantioane egale; o trecere de 1–2 pasi nu se vede; fara istorie, esantionul', () => {
  const sir = (xs: readonly number[]): number[] => {
    let s: StareFiltru | undefined
    return xs.map((n) => { s = pasFiltru(s, n); return s.afisat })
  }
  assert.deepEqual(sir([0, 1, 0, 0, 1, 1, 1, 2, 2, 0, 0, 0]), [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0])
  assert.deepEqual(sir([3]), [3], 'fara istorie: esantionul insusi')
  assert.deepEqual(sir([2, 0, 0, 2, 2, 2]), [2, 2, 2, 2, 2, 2], 'o iesire de 2 pasi nu se vede')
  assert.deepEqual(pasFiltru({ ultime: [1, 1, 1], afisat: 1 }, 2), { ultime: [1, 1, 2], afisat: 1 })
})

/** Spawn al unui colonist in mijlocul celulei (x, y, z). */
function pune(w: World, x: number, y: number, z: number): void {
  const o = applyCommand(w, { kind: 'spawnAgent', x: x * 1000 + 500, y: y * 1000 + 500, z, faction: Faction.ASEZARE }, R)
  assert.ok(o.ok, JSON.stringify(o))
}

test('TERMIC ECRAN filtrul oamenilor la unire si despartire: istoria e a ACELEIASI componente (ancora si volumul) — chepengul scos in pauza nu da casei unite istoria pivnitei goale, zidul nou nu da jumatatii cu ancora veche istoria casei intregi', () => {
  // Recenzia t.2b, E1. Ancora unei componente e celula ei minima (z întâi): unită cu pivnița de dedesubt, casa primește
  // ancora PIVNIȚEI. Ținut doar pe ancoră, filtrul dădea componentei unite istoria pivniței goale: în pauză „oameni:
  // niciunul" cu 2 oameni înăuntru, oricât (niciun eșantion), și încă 2 pași jucând.
  const unire = (sus: number, jos: number): void => {
    const { w, wx, wy, g } = sitPlat(12345, 12)
    casa(w, wx, wy, g, false)
    // Pivnița 3×3×2 sub interior, cu chepengul (o celulă de UȘĂ) în podea, la (1, 1, g).
    for (const z of [g - 2, g - 1]) for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) assert.ok(dig(w.terrain, wx + dx, wy + dy, z).ok)
    assert.ok(dig(w.terrain, wx + 1, wy + 1, g).ok)
    assert.ok(fill(w.terrain, wx + 1, wy + 1, g, Material.USA).ok)
    bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
    for (let i = 0; i < sus; i++) pune(w, wx + 2 + (i % 2), wy + 3, g + 1)
    for (let i = 0; i < jos; i++) pune(w, wx + 2 + (i % 2), wy + 2, g - 2)
    const sus0 = { x: wx + 3, y: wy + 2, z: g + 1 }
    const jos0 = { x: wx + 2, y: wy + 2, z: g - 2 }
    const f = creeazaFiltruOameni()
    avanseaza(w, 81, f)
    const cs = componentaLa(w.camere, sus0.x, sus0.y, sus0.z)!
    const cp = componentaLa(w.camere, jos0.x, jos0.y, jos0.z)!
    assert.notEqual(cs.id, cp.id, 'fixtura: casa si pivnita sunt doua componente (chepengul e o usa)')
    assert.deepEqual([f.esantioane(), f.oameni(w, cs.id), f.oameni(w, cp.id)], [4, sus, jos], 'fixtura: filtrul are 4 esantioane pe fiecare (pasii 20…80)')
    // PAUZĂ: chepengul scos (o comandă), nimic nu mai avansează.
    const o = applyCommand(w, { kind: 'dig', wx: wx + 1, wy: wy + 1, z: g }, R)
    assert.ok(o.ok, JSON.stringify(o))
    const u = componentaLa(w.camere, sus0.x, sus0.y, sus0.z)!
    assert.equal(u.ancora, cp.ancora, 'fixtura: componenta unita are ancora pivnitei')
    assert.equal(u.id, componentaLa(w.camere, jos0.x, jos0.y, jos0.z)!.id)
    const adev = (): number => oameniPeComponente(w).get(componentaLa(w.camere, sus0.x, sus0.y, sus0.z)!.id) ?? 0
    assert.equal(adev(), sus + jos)
    const t = termicLa(w, R, sus0, f)!
    const tr = tragerea(w, R, u.id)
    assert.ok(tr.ok)
    assert.deepEqual([t.oameni, t.oameniText], [sus + jos, textOameni(sus + jos)], `in pauza, dupa unire (${sus} sus, ${jos} jos)`)
    assert.equal(t.xTotQ16, tragereCuOameni(tr.value, (sus + jos) * R.termic.omW), 'X_tot cu oamenii componentei unite')
    for (let k = 1; k <= 3; k++) {
      avanseaza(w, 20, f)
      assert.equal(termicLa(w, R, sus0, f)!.oameni, adev(), `dupa ${k} pasi (${sus} sus, ${jos} jos)`)
    }
  }
  unire(2, 0)
  unire(0, 2)

  // Despărțirea: un zid nou prin casă, în pauză. Partea cu ancora veche (x = 1) e goală; cea nouă (x = 3) are oamenii.
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g, false)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  pune(w, wx + 3, wy + 1, g + 1)
  pune(w, wx + 3, wy + 3, g + 1)
  const f = creeazaFiltruOameni()
  avanseaza(w, 81, f)
  const c0 = componentaLa(w.camere, wx + 1, wy + 1, g + 1)!
  assert.deepEqual([c0.volum, f.oameni(w, c0.id)], [18, 2], 'fixtura: casa intreaga, 2 oameni aratati')
  const a = w.agents
  for (let i = 0; i < a.count; i++) if (a.alive[i]) assert.equal(Math.floor(a.x[i]! / 1000), wx + 3, 'fixtura: pionii stau pe x = 3 (zidul vine pe x = 2)')
  for (let z = g + 1; z <= g + 2; z++) for (let dy = 1; dy <= 3; dy++) assert.ok(fill(w.terrain, wx + 2, wy + dy, z, P).ok)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const veche = { x: wx + 1, y: wy + 2, z: g + 1 }
  const noua = { x: wx + 3, y: wy + 2, z: g + 1 }
  const cv = componentaLa(w.camere, veche.x, veche.y, veche.z)!
  assert.deepEqual([cv.ancora, cv.volum], [c0.ancora, 6], 'fixtura: jumatatea x = 1 pastreaza ancora casei')
  for (let k = 0; k <= 3; k++) {
    if (k > 0) avanseaza(w, 20, f)
    const adev = oameniPeComponente(w)
    const tv = termicLa(w, R, veche, f)!
    const tn = termicLa(w, R, noua, f)!
    assert.deepEqual([tv.oameni, tn.oameni], [adev.get(tv.comp) ?? 0, adev.get(tn.comp) ?? 0], `${k === 0 ? 'in pauza, dupa zid' : `dupa ${k} pasi`}`)
    assert.deepEqual([tv.oameni, tn.oameni], [0, 2])
  }
})

test('TERMIC ECRAN filtrul oamenilor tinut pe ANCORA, nu pe id: in pauza, comenzile rotesc si refolosesc id-urile a doua case — fiecare isi pastreaza oamenii aratati', () => {
  // Recenzia t.2b, E2 (1): mutantul „filtrul pe id" trecea toate testele. Două case sigilate în aceeași felie, 2 oameni în
  // A, B goală; o piatră pusă și scoasă în fiecare casă (4 comenzi, în pauză) rotește id-urile: A primește id-ul lui B.
  const { w, wx, wy, g } = sitPlat(12345, 16)
  casa(w, wx, wy, g, false)
  casa(w, wx + 6, wy, g, false)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  pune(w, wx + 1, wy + 1, g + 1)
  pune(w, wx + 1, wy + 3, g + 1)
  const f = creeazaFiltruOameni()
  avanseaza(w, 81, f)
  const A = { x: wx + 2, y: wy + 2, z: g + 1 }
  const B = { x: wx + 9, y: wy + 2, z: g + 1 }
  const id = (c: typeof A): number => componentaLa(w.camere, c.x, c.y, c.z)!.id
  const ids0 = [id(A), id(B)]
  for (const c of [
    { kind: 'fill', wx: wx + 3, wy: wy + 2, z: g + 1, material: P }, { kind: 'fill', wx: wx + 8, wy: wy + 2, z: g + 1, material: P },
    { kind: 'dig', wx: wx + 3, wy: wy + 2, z: g + 1 }, { kind: 'dig', wx: wx + 8, wy: wy + 2, z: g + 1 },
  ] as const) {
    const o = applyCommand(w, c, R)
    assert.ok(o.ok, JSON.stringify(o))
  }
  assert.equal(id(A), ids0[1], `fixtura: A a primit id-ul de dinainte al lui B (${ids0} → ${[id(A), id(B)]})`)
  for (let k = 0; k <= 1; k++) {
    if (k > 0) avanseaza(w, 20, f)
    const adev = oameniPeComponente(w)
    const tA = termicLa(w, R, A, f)!
    const tB = termicLa(w, R, B, f)!
    assert.deepEqual([tA.oameniText, tB.oameniText], ['oameni: 2 înăuntru', 'oameni: niciunul'], k === 0 ? 'in pauza' : 'dupa un pas')
    assert.deepEqual([tA.oameni, tB.oameni], [adev.get(tA.comp) ?? 0, adev.get(tB.comp) ?? 0])
    const trB = tragerea(w, R, tB.comp)
    assert.ok(trB.ok)
    assert.equal(tB.xTotQ16, tragereCuOameni(trB.value, 0), 'X_tot al casei goale fara caldura altcuiva')
  }
})

test('TERMIC ECRAN filtrul oamenilor: o componenta fara esantion (inchisa in pauza, cu un om inauntru) arata oamenii de ACUM, nu 0', () => {
  // Recenzia t.2b, E2 (2). Cămara 3×3×2 de piatră cu acoperișul fără celula din mijloc (casa B din ui-fum): coloana ei de
  // aer e cer, deci nicio componentă; filtrul vede 4 pași fără ea. În pauză, un om intră (spawn) și acoperișul se închide:
  // componenta nouă n-are istorie, deci se arată eșantionul de acum. Casa de alături ține pasul viu (fără nicio componentă,
  // pasul nu rulează).
  const { w, wx, wy, g } = sitPlat(12345, 16)
  for (let z = g + 1; z <= g + 3; z++) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) if (dx !== 1 || dy !== 1) assert.ok(fill(w.terrain, wx + dx, wy + dy, z, P).ok)
  casa(w, wx + 6, wy, g, false)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const celula = { x: wx + 1, y: wy + 1, z: g + 1 }
  assert.equal(componentaLa(w.camere, celula.x, celula.y, celula.z), null, 'fixtura: camara deschisa spre cer nu e o componenta')
  const f = creeazaFiltruOameni()
  avanseaza(w, 81, f)
  assert.equal(f.esantioane(), 4)
  pune(w, wx + 1, wy + 1, g + 1)
  assert.ok(fill(w.terrain, wx + 1, wy + 1, g + 3, P).ok)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const c = componentaLa(w.camere, celula.x, celula.y, celula.z)
  assert.ok(c !== null)
  assert.equal(oameniPeComponente(w).get(c.id), 1, 'fixtura: omul e in componenta noua')
  assert.equal(f.oameni(w, c.id), 1)
  assert.equal(termicLa(w, R, celula, f)!.oameniText, 'oameni: 1 înăuntru')
})

test('TERMIC ECRAN oamenii ecranului == caldura pasului: oameniPeComponente pe pozitiile pasului da exact ΣP al lui (pionul inauntru, cel afara, cel mort)', () => {
  const { w, wx, wy, g } = sitPlat(12345, 16)
  casa(w, wx, wy, g, false)
  casa(w, wx + 8, wy, g, false)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const a = componentaLa(w.camere, wx + 2, wy + 2, g + 1)!.id
  const b = componentaLa(w.camere, wx + 10, wy + 2, g + 1)!.id
  const pune = (x: number, y: number): number => {
    const o = applyCommand(w, { kind: 'spawnAgent', x: x * 1000 + 500, y: y * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R)
    assert.ok(o.ok, JSON.stringify(o))
    return o.value
  }
  pune(wx + 1, wy + 1)
  pune(wx + 3, wy + 3)
  pune(wx + 10, wy + 2)
  pune(wx + 6, wy + 8)
  const mort = pune(wx + 11, wy + 3)
  assert.ok(applyCommand(w, { kind: 'killAgent', id: mort }, R).ok)
  // Pasul, chemat la faza lui (tickul 0, cum îl cheamă `tick`), pe aceleași poziții.
  assert.equal(w.tick % R.ticksPerSecond, 0)
  const cate = oameniPeComponente(w)
  assert.deepEqual([cate.get(a), cate.get(b), cate.size], [2, 1, 2], 'doi in casa A, unul in casa B; cel de afara si cel mort, nicaieri')
  const r = pasTermic(w, R)
  assert.ok(r)
  // Pe hârtie: o conversie pe nod — rs(W · 2^16 · tps · 86.400 · μ_aer / (ziTicks · c_aer)); 100 W = 3.713.965 (μ·Q16).
  assert.equal(calduraPeHartie(100), 3713965)
  let asteptat = 0
  for (const n of cate.values()) asteptat += calduraPeHartie(n * R.termic.omW)
  assert.equal(r.sumaP, asteptat, 'ΣP al pasului == caldura oamenilor numarati de ecran')
})

test('TERMIC ECRAN oracolul X: X din randuri (descompunerea) == X din linia grafului simularii, dupa pasi reali — casa cu etaj si pivnita (vecinele la T-ul lor de ACUM, nu la echilibru), M10, mina', () => {
  // 1. Casa cu etaj și pivniță (vecine prin placă și prin chepeng), 6 ore de pași reali de la proveniență: T-urile nu sunt
  //    la echilibru, deci X cu vecinele la regim e alt număr (controlul: proba are ce măsura).
  const s = casaTermica({ etaj: true, k: 1 })
  const w = s.w
  avanseaza(w, 6 * 1680)
  const ids = ['casa', 'etaj', 'pivnita'].map((k) => compLa(s, k))
  const reg = bun(regimPermanent(w, R, w.tick), 'regim')
  let controlDiferit = 0
  for (const id of ids) {
    const tr = bun(tragerea(w, R, id), 'tragerea')
    const k = bun(canaleAcum(w, R, bun(geometriaCanalelor(w.camere, R, id), 'geometria')), 'canaleAcum')
    assert.equal(k.xQ16, tr.xQ16, `componenta ${id}: X din randuri == X din linia grafului`)
    assert.equal(k.sumaG, tr.sumaG)
    assert.equal(k.tQ16, temperaturaAcum(w, id))
    assert.equal(tr.xQ16, xDinGraf(w, id, (c) => w.temperatura.slot.t[c]!), 'X == linia scrisa aici, cu vecinele la T-ul din stare')
    if (xDinGraf(w, id, (c) => temperaturaComponentei(reg, c)!) !== tr.xQ16) controlDiferit++
    assert.equal(tragereCuOameni(tr, 0), tr.xQ16, 'fara oameni, X_tot == X')
  }
  assert.ok(controlDiferit >= 2, `controlul: cu vecinele la echilibru, X iese altul pe ${controlDiferit} din 3`)
  // 2. M10 (677 de componente, hub-ul pe BigInt) după 3 pași, și mina 192×192×3 (un nod) după 2.
  for (const [nume, lume] of [['M10', lumeaM10()], ['mina', mina192(R)]] as const) {
    avanseaza(lume, 41)
    let n = 0
    for (const c of lume.camere.comp.values()) {
      const tr = bun(tragerea(lume, R, c.id), `${nume} tragerea`)
      const k = bun(canaleAcum(lume, R, bun(geometriaCanalelor(lume.camere, R, c.id), `${nume} geometria`)), `${nume} canaleAcum`)
      assert.equal(k.xQ16, tr.xQ16, `${nume}, componenta ${c.id}`)
      n++
    }
    assert.equal(n, nume === 'M10' ? 677 : 1)
  }
})

test('TERMIC ECRAN viewer-ul nu cere graful t.2a: inspectorul si overlay-ul U pe 3 ore de pasi reali — refacerile si regimurile t.2a raman 0; in pauza, contoarele grafului incremental nu se misca din ecran', () => {
  const { w, wx, wy, g } = sitPlat(12345, 16)
  casa(w, wx, wy, g)
  casa(w, wx + 8, wy, g, false)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const mem = creeazaMemorieTermica()
  const f = creeazaFiltruOameni()
  const o = createTemperaturaOverlay()
  o.visible = true
  const celule = [{ x: wx + 2, y: wy + 2, z: g + 1 }, { x: wx + 10, y: wy + 2, z: g + 1 }]
  for (let p = 0; p < 24; p++) {
    avanseaza(w, 210, f)
    for (const c of celule) for (let r = 0; r < 4; r++) assert.ok(mem.ia(w, R, c, f)?.tQ16 !== null)
    for (let k = 0; k < 10; k++) actualizeazaTemperaturaOverlay(o, w, R, g + 1)
  }
  assert.ok(statTermic(w).pasi >= 24 * 10, 'fixtura: pasii au rulat')
  const sg = statGraf(w.camere)
  assert.deepEqual([sg.refaceri, sg.refolosiri], [0, 0], 'graful t.2a nu s-a cerut niciodata')
  assert.deepEqual(statMemorieTermica(w.camere), { bucatiCalculate: 0, regimuriRezolvate: 0, regimuriRefolosite: 0 }, 'niciun regim permanent')
  assert.ok(sg.construiri >= 1 && sg.refaceriDeUrgenta === 0, 'graful incremental: construit de simulare, fara urgente')
  assert.equal(mem.geometrii(), 2 * 24, 'geometria descompunerii: una la fiecare schimbare de componenta (doua case alternate)')
  // Pauză: zeci de reîmprospătări ale ecranului nu mișcă niciun contor al grafului (nici al simulării).
  const inainte = JSON.stringify([statGraf(w.camere), statTermic(w)])
  for (let r = 0; r < 40; r++) {
    mem.ia(w, R, celule[0]!, f)
    actualizeazaTemperaturaOverlay(o, w, R, g + 1)
  }
  assert.equal(JSON.stringify([statGraf(w.camere), statTermic(w)]), inainte)
  assert.equal(mem.geometrii(), 2 * 24 + 1, 'in pauza, pe aceeasi casa: o singura geometrie (trecerea de la casa B)')
})

test('TERMIC ECRAN descompunerea: geometria memorata pe (index, epoca, epocaFete, componenta) — pamantul pe acoperis (doar fetele) o reface, pauza si tickurile nu; memoria == calculul fara memorie', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const mem = creeazaMemorieTermica()
  const celula = { x: wx + 2, y: wy + 2, z: g + 1 }
  const t0 = mem.ia(w, R, celula, null)!
  for (let i = 0; i < 5; i++) mem.ia(w, R, celula, null)
  avanseaza(w, 100)
  mem.ia(w, R, celula, null)
  assert.equal(mem.geometrii(), 1, 'pauza si tickurile fara editari: aceeasi geometrie')
  // Pământ pe acoperiș, printr-o comandă (punctul unic): fețele se schimbă cu epoca pe loc (`epocaFete`), ponderile la fel.
  const ep = w.camere.epoca
  const epF = w.camere.epocaFete
  assert.ok(applyCommand(w, { kind: 'fill', wx: wx + 2, wy: wy + 2, z: g + 4, material: Material.PAMANT }, R).ok)
  assert.equal(w.camere.epoca, ep, 'fixtura: epoca pe loc')
  assert.ok(w.camere.epocaFete > epF, 'fixtura: fetele s-au schimbat')
  const t1 = mem.ia(w, R, celula, null)!
  assert.equal(mem.geometrii(), 2, 'fetele noi: geometria se reface')
  assert.notEqual(t1.canale, t0.canale, `fixtura: descompunerea s-a schimbat (${t1.canale})`)
  assert.deepEqual(t1, termicLa(w, R, celula), 'memoria == calculul fara memorie')
})

test('TERMIC ECRAN componenta fara T: randul 1 „Temperatura nu se știe (eroare internă)", randurile 2–3 goale; U n-o deseneaza; pasul urmator o numara, iar monitorul da o alerta pe tip nou (nu una pe cadru)', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const celula = { x: wx + 2, y: wy + 2, z: g + 1 }
  const id = componentaLa(w.camere, celula.x, celula.y, celula.z)!.id
  const mon = creeazaMonitorTermic()
  assert.deepEqual(mon.verifica(w), { noi: 0, tipuriNoi: [], total: 0, ultimul: '' })
  const o = createTemperaturaOverlay()
  o.visible = true
  actualizeazaTemperaturaOverlay(o, w, R, g + 1)
  assert.equal(o.valori.get(id), temperaturaAcum(w, id))
  // Un invariant încălcat, simulat: slotul pierde T-ul (o stare pe care simularea nu o produce; o reface la pas).
  w.temperatura.slot.are[id] = 0
  assert.deepEqual(termicLa(w, R, celula), { comp: id, tQ16: null, xTotQ16: null, oameni: 0, linie: TEXT_TEMPERATURA_NECUNOSCUTA, tragere: '', oameniText: '', canale: '' })
  actualizeazaTemperaturaOverlay(o, w, R, g + 1)
  assert.equal(o.valori.has(id), false)
  assert.equal(o.faraT, 1)
  assert.equal(o.eroare, TEXT_TEMPERATURA_NECUNOSCUTA)
  assert.deepEqual(alfaPatratului(o, [...o.quadComp].indexOf(id)), [0, 0, 0, 0, 0, 0], 'nedesenata')
  // Pasul următor o numără și o reface (de la echilibru); monitorul vede tipul o dată.
  avanseaza(w, 20)
  const m1 = mon.verifica(w)
  assert.deepEqual([m1.noi, m1.tipuriNoi, m1.total], [1, ['componenta fara T'], 1])
  assert.deepEqual(mon.verifica(w), { noi: 0, tipuriNoi: [], total: 1, ultimul: 'componenta fara T' }, 'nimic nou: nicio alerta')
  assert.notEqual(temperaturaAcum(w, id), null, 'pasul a refacut T')
  actualizeazaTemperaturaOverlay(o, w, R, g + 1)
  assert.deepEqual([o.faraT, o.eroare, alfaPatratului(o, [...o.quadComp].indexOf(id))[0]], [0, '', 1])
  // Același tip încă o dată: contorul crește (F3), dar nu e un tip nou — niciun al doilea `console.error`, nicio alertă.
  w.temperatura.slot.are[id] = 0
  avanseaza(w, 20)
  const m2 = mon.verifica(w)
  assert.deepEqual([m2.noi, m2.tipuriNoi, m2.total], [1, [], 2])
  // Un lot sincronizat PE LÂNGĂ punctul unic (indexul refăcut, temperatura nu): id-urile pot fi ale altor componente, deci
  // ecranul nu arată nicio cifră până la pasul care repară; abia atunci, T din nou și un tip nou de alertă.
  assert.ok(fill(w.terrain, wx + 1, wy + 1, g + 2, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const id2 = componentaLa(w.camere, celula.x, celula.y, celula.z)!.id
  assert.equal(w.temperatura.slot.are[id2], 1, 'fixtura: slotul are inca un T (al starii vechi): doar stampila il opreste')
  assert.equal(temperaturaAcum(w, id2), null, 'starea nu e a indexului de acum: nu se stie')
  assert.equal(termicLa(w, R, celula)?.linie, TEXT_TEMPERATURA_NECUNOSCUTA)
  avanseaza(w, 20)
  assert.notEqual(temperaturaAcum(w, id2), null)
  assert.deepEqual(mon.verifica(w).tipuriNoi, ['indexul s-a sincronizat pe langa temperatura (punctul unic ocolit)'])
})

test('TERMIC ECRAN stepSimSigur: o exceptie din tick se raporteaza, cadrul nu arunca, datoria de timp se arunca; fara exceptie, tickurile ca stepSim', () => {
  const strat = { rest: 0 } as AgentLayer
  const w = {} as World
  const erori: unknown[] = []
  let tickuri = 0
  // Trei pași de timp (1.000 / tps ms fiecare): trei tickuri, sub plafonul pe cadru.
  const dt = (3 * 1000) / R.ticksPerSecond
  const n = stepSimSigur(strat, w, R, dt, () => { tickuri++ }, (e) => erori.push(e))
  assert.deepEqual([n, tickuri, erori.length], [3, 3, 0])
  let k = 0
  const n2 = stepSimSigur(strat, w, R, dt, () => { if (++k === 3) throw new Error('invariant de proba') }, (e) => erori.push(e))
  assert.equal(n2, 0)
  assert.equal(erori.length, 1)
  assert.match(String(erori[0]), /invariant de proba/)
  assert.equal(strat.rest, 0, 'datoria de timp se arunca: cadrul urmator nu reia o rafala')
})

test('TERMIC ECRAN avanseazaSigur: n tickuri REALE prin functia data (tickObservat) — pasii termici ruleaza, filtrul vede fiecare pas, lumea == tickurile scrise aici; o exceptie se raporteaza si opreste avansul; n nevalid refuzat', () => {
  // Doua lumi identice: casa fara usa cu un pion in ea. Una avanseaza prin `avanseazaSigur` (ca `__kinstead.avanseaza`), alta
  // prin `tick` scris aici. Proba de pe ecran (ui-fum) sarea timpul cu `world.tick +=`: T, care e stare, statea pe loc.
  const lume = (): { w: World; x: number; y: number; z: number } => {
    const { w, wx, wy, g } = sitPlat(12345, 12)
    casa(w, wx, wy, g, false)
    bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
    assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 2) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
    return { w, x: wx + 2, y: wy + 2, z: g + 1 }
  }
  const a = lume()
  const b = lume()
  const f = creeazaFiltruOameni()
  const erori: unknown[] = []
  const tickObservat = (w: World, r: typeof R): void => { tick(w, r); f.dupaTick(w) }
  const id = componentaLa(a.w.camere, a.x, a.y, a.z)!.id
  const t0 = temperaturaAcum(a.w, id)
  assert.ok(t0 !== null)
  // 61 de tickuri de la tickul 0: pasii la 0, 20, 40, 60 (4); filtrul ii esantioneaza pe ultimii 3 (primul tick doar ii
  // arata lumea — testul „X_tot cu oameni").
  assert.equal(avanseazaSigur(a.w, R, 61, tickObservat, (e) => erori.push(e)), 61)
  for (let i = 0; i < 61; i++) tick(b.w, R)
  assert.deepEqual([a.w.tick, statTermic(a.w).pasi, f.esantioane(), erori.length], [61, 4, 3, 0])
  assert.equal(hashWorld(a.w), hashWorld(b.w), 'aceeasi lume (cu temperatura) ca tickurile scrise aici')
  assert.equal(f.oameni(a.w, id), 1)
  assert.notEqual(temperaturaAcum(a.w, id), t0, 'avansul real muta T (timpul sarit nu l-ar misca)')
  // O exceptie la al 5-lea tick: raportata o data, avansul se opreste dupa 4, nimic nu arunca.
  let k = 0
  const n = avanseazaSigur(a.w, R, 10, (w, r) => { if (++k === 5) throw new Error('invariant de proba'); tick(w, r) }, (e) => erori.push(e))
  assert.deepEqual([n, a.w.tick, erori.length], [4, 65, 1])
  assert.match(String(erori[0]), /invariant de proba/)
  // n nevalid: refuzat inainte de orice tick (un n fractionar ar rula ceil(n) tickuri, NaN niciunul, tacut).
  for (const rau of [-1, 1.5, Number.NaN, 2 ** 53]) assert.throws(() => avanseazaSigur(a.w, R, rau, tick, () => {}), RangeError, String(rau))
  assert.deepEqual([avanseazaSigur(a.w, R, 0, tick, () => {}), a.w.tick], [0, 65])
})

// --- 2. ancorele cifrelor ------------------------------------------------------------

/** Piesele 4-conexe pe componentă la nivel, numărate AICI, independent de overlay: Map comp → seturi de chei. */
function pieseIndependente(idx: IndexCamere, z: number): Map<number, Set<number>[]> {
  const comp = new Map<number, number>()
  celuleLaNivel(idx, z, (x, y, c) => { comp.set(y * WC + x, c.id) })
  const out = new Map<number, Set<number>[]>()
  const vazut = new Set<number>()
  for (const [k0, id] of comp) {
    if (vazut.has(k0)) continue
    const p = new Set([k0])
    vazut.add(k0)
    const stiva = [k0]
    while (stiva.length > 0) {
      const k = stiva.pop()!
      const x = k % WC
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const kk = (Math.floor(k / WC) + dy) * WC + x + dx
        if (vazut.has(kk) || comp.get(kk) !== id) continue
        vazut.add(kk)
        p.add(kk)
        stiva.push(kk)
      }
    }
    const l = out.get(id) ?? []
    l.push(p)
    out.set(id, l)
  }
  return out
}

/**
 * Fiecare ancoră în piesa ei, o ancoră pe fiecare piesă care trebuie (≥ 4 celule, sau singura a componentei) și
 * niciuna pe celelalte. Întoarce câte etichete și câte perechi (componentă, nivel) are scena, plus controlul: de
 * câte ori centrul de greutate al componentei la nivel (celula care îl conține) NU e o celulă a ei.
 */
function verificaAncorele(idx: IndexCamere): { etichete: number; maxNivel: number; perechi: number; controlRau: number } {
  const nivele = [...new Set(idx.chei.map((k) => decodeazaFelie(k).z))].sort((a, b) => a - b)
  let etichete = 0, maxNivel = 0, perechi = 0, controlRau = 0
  for (const z of nivele) {
    const ancore = ancoreLaNivel(idx, z)
    const piese = pieseIndependente(idx, z)
    etichete += ancore.length
    maxNivel = Math.max(maxNivel, ancore.length)
    const peAncora = new Map<Set<number>, number>()
    for (const a of ancore) {
      const k = a.y * WC + a.x
      const p = (piese.get(a.comp) ?? []).find((s) => s.has(k))
      assert.ok(p, `nivelul ${z}: ancora (${a.x}, ${a.y}) nu e intr-o piesa a componentei ${a.comp}`)
      assert.equal(componentaLa(idx, a.x, a.y, z)?.id, a.comp, `nivelul ${z}: ancora in alta componenta`)
      assert.equal(a.celule, p.size)
      peAncora.set(p, (peAncora.get(p) ?? 0) + 1)
    }
    for (const [id, ps] of piese) {
      perechi++
      for (const p of ps) assert.equal(peAncora.get(p) ?? 0, p.size >= 4 || ps.length === 1 ? 1 : 0, `nivelul ${z}, componenta ${id}: piesa de ${p.size} celule`)
      let sx = 0, sy = 0, n = 0
      for (const p of ps) for (const k of p) { sx += k % WC; sy += Math.floor(k / WC); n++ }
      const cx = Math.floor(sx / n + 0.5), cy = Math.floor(sy / n + 0.5)
      if (!ps.some((p) => p.has(cy * WC + cx))) controlRau++
    }
  }
  return { etichete, maxNivel, perechi, controlRau }
}

/** Un tunel săpat la cota z: celulele (x, y) relative la (x0, y0). */
function sapaLa(w: World, x0: number, y0: number, z: number, celule: readonly (readonly [number, number])[]): void {
  for (const [x, y] of celule) assert.ok(dig(w.terrain, x0 + x, y0 + y, z).ok, `sapa ${x},${y},${z}`)
}

test('TERMIC ECRAN ancorele pe hartie: L-ul (centrul cade afara, ancora in L), pragul de 4 celule, piesa unica, 4-conex, egalitatea pe cheie', () => {
  const { w, wx, wy, g } = sitPlat(12345, 24)
  const z0 = g - 5
  // 1. Un L subțire, un nivel: bara x 0..6 pe y 0, piciorul x 0 pe y 1..6 — 13 celule. Centrul: (21/13, 21/13) =
  //    (1,62; 1,62), deci celula care îl conține e (2, 2): în afara L-ului. Cea mai apropiată celulă a lui: (2, 0) și
  //    (0, 2) la 0,385² + 1,615² = 2,757 (următoarele, (1, 0) și (0, 1), la 2,987); la egalitate, cheia mai mică
  //    (y·WORLD_CELLS + x): (2, 0).
  const L: [number, number][] = []
  for (let x = 0; x <= 6; x++) L.push([x, 0])
  for (let y = 1; y <= 6; y++) L.push([0, y])
  sapaLa(w, wx, wy, z0, L)
  // 2. Pe două niveluri, o singură componentă: jos (z0 − 4) un coridor x 0..5 pe y 0, cu (5, 1..4) și (0, 1), (0, 2), (1, 2);
  //    sus (z0 − 3) piesa A = x 0..4 pe y 0 (5 celule), piesa B = (5, 1..4) (4 celule, pe diagonală față de A — 4-conex,
  //    nu e A) și piesa C = (0, 2), (1, 2) (2 celule): A și B primesc cifră, C nu.
  const x2 = wx + 12, zj = z0 - 4
  const jos: [number, number][] = [[0, 1], [0, 2], [1, 2]]
  for (let x = 0; x <= 5; x++) jos.push([x, 0])
  for (let y = 1; y <= 4; y++) jos.push([5, y])
  sapaLa(w, x2, wy, zj, jos)
  const sus: [number, number][] = [[0, 2], [1, 2]]
  for (let x = 0; x <= 4; x++) sus.push([x, 0])
  for (let y = 1; y <= 4; y++) sus.push([5, y])
  sapaLa(w, x2, wy, zj + 1, sus)
  // 3. Un buzunar separat de 2 celule, la cota de jos: piesa UNICĂ a componentei lui — primește cifra oricât de mică.
  sapaLa(w, x2 + 8, wy, zj, [[0, 0], [1, 0]])
  sincronizeazaCamere(w.camere, w.terrain)
  const idx = w.camere
  const rel = (a: readonly AncoraEticheta[], x: number) => a.map((e) => [e.x - x, e.y - wy, e.celule]).sort((p, q) => p[0]! - q[0]! || p[1]! - q[1]!)

  const aL = ancoreLaNivel(idx, z0)
  assert.deepEqual(rel(aL, wx), [[2, 0, 13]])
  assert.equal(componentaLa(idx, wx + 2, wy + 2, z0), null, 'centrul L-ului cade in roca: ancora pe centrul de greutate ar fi gresit')

  // Sus: A ancorată la (2, 0) (centrul ei); B, (5, 1..4), are centrul (5; 2,5) — (5, 2) și (5, 3) egale, cheia mai mică: (5, 2).
  assert.deepEqual(rel(ancoreLaNivel(idx, zj + 1), x2), [[2, 0, 5], [5, 2, 4]])
  // Jos: componenta are o singură piesă, de 13 celule, cu centrul (36/13, 15/13) = (2,77; 1,15): cea mai apropiată e
  // (3, 0), la 0,23² + 1,15² = 1,38, înaintea lui (2, 0), la 1,92. Buzunarul: (0, 0) și (1, 0) egale — (0, 0).
  assert.deepEqual(rel(ancoreLaNivel(idx, zj), x2), [[3, 0, 13], [8, 0, 2]])
  const v = verificaAncorele(idx)
  assert.equal(v.etichete, 5)
})

/** M10 pe lume (seed 20260913 @300), cum îl construiesc testele termice. */
function lumeaM10(): World {
  const w = createWorld(20260913)
  assert.ok(applyCommand(w, { kind: 'setFocus', cx: 300, cy: 300 }).ok)
  buildM10PeLume(w, R, 300, 300)
  return w
}

test('TERMIC ECRAN ancorele pe M10: 3.727 de etichete (max 157 pe nivel), fiecare in piesa ei — controlul, centrul componentei, cade in alta incapere sau in roca', () => {
  const v = verificaAncorele(lumeaM10().camere)
  // Cifrele panoului (verif-UI-L5-3, v2.log), numărate de alt script: 3.727 de piese cu cifră, cel mult 157 pe un nivel,
  // pe 3.246 de perechi (componentă, nivel).
  assert.deepEqual([v.etichete, v.maxNivel, v.perechi], [3727, 157, 3246])
  // Controlul (panoul: 9 în altă componentă + 40 în rocă, cu celula care conține centrul): ancora pe centrul de
  // greutate al componentei ar fi greșit aici.
  assert.ok(v.controlRau >= 40, `controlul: ${v.controlRau} centre in afara componentei`)
})

/** Mina panoului (NUM, geom.ts): 192×192 cu stâlpi de 1×1 la fiecare 4 m, la 2–4 m sub sol, dintr-un lot. */
function mina(): World {
  const s = sitPlat(12345, 8)
  const t = s.w.terrain
  const x0 = s.wx + 2, y0 = s.wy + 2
  for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
    if (x % 4 === 0 && y % 4 === 0) continue
    const gg = groundLevelM(t, x0 + x, y0 + y)
    assert.ok(gg.ok)
    for (let d = 2; d <= 4; d++) dig(t, x0 + x, y0 + y, gg.value - d)
  }
  sincronizeazaCamere(s.w.camere, t)
  return s.w
}

test('TERMIC ECRAN ancorele pe mina 192x192x3: 72 de etichete, una pe nivel, fiecare in piesa ei — controlul cade in roca', () => {
  const v = verificaAncorele(mina().camere)
  assert.deepEqual([v.etichete, v.maxNivel, v.perechi], [72, 1, 72])
  // Panoul: 50 din 72 de centre în afara componentei (banda nivelului e curbă).
  assert.ok(v.controlRau >= 30, `controlul: ${v.controlRau} centre in afara componentei`)
})

// --- 3. densitatea și tenta ----------------------------------------------------------

/** Proiecția de sus a ancorelor la `s` px pe celulă; eticheta „−12,4°" (6 caractere: 50 × 16 px). */
function deSus(a: readonly AncoraEticheta[], s: number): ProiectieEticheta[] {
  return a.map((e) => ({ x: (e.x + 0.5) * s, y: (e.y + 0.5) * s, pxCelula: s, inCadru: true, latime: 50, inaltime: 16, prioritate: e.celule }))
}
function suprapuse(p: readonly ProiectieEticheta[], vede: readonly boolean[]): number {
  let n = 0
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
    if (!vede[i] || !vede[j]) continue
    if (Math.abs(p[i]!.x - p[j]!.x) * 2 < p[i]!.latime + p[j]!.latime && Math.abs(p[i]!.y - p[j]!.y) * 2 < p[i]!.inaltime + p[j]!.inaltime) n++
  }
  return n
}

test('TERMIC ECRAN densitatea: sub 10 px pe celula cifrele se ascund; peste, filtrul lacom — nicio suprapunere pe M10, piesele mari intai', () => {
  // Pe hârtie: pragul, și la o suprapunere rămâne piesa mai mare, oricare ar fi ordinea.
  const e = (x: number, px: number, prioritate: number): ProiectieEticheta => ({ x, y: 100, pxCelula: px, inCadru: true, latime: 40, inaltime: 16, prioritate })
  assert.equal(PRAG_PX_CELULA, 10)
  assert.deepEqual(alegeEtichete([e(100, 9.99, 5), e(300, 10, 5)]), [false, true])
  assert.deepEqual(alegeEtichete([e(100, 20, 4), e(120, 20, 50)]), [false, true], 'cea mare castiga si a doua')
  assert.deepEqual(alegeEtichete([e(120, 20, 50), e(100, 20, 4)]), [true, false])
  assert.deepEqual(alegeEtichete([e(100, 20, 4), e(141, 20, 50)]), [true, true], 'la 41 px: nu se ating')
  assert.deepEqual(alegeEtichete([{ ...e(100, 20, 4), inCadru: false }]), [false], 'in spatele camerei / fara valoare')
  // Pe M10, de sus: la 8 px pe celulă nicio cifră; de la 10 px în sus, cifrele care s-ar călca (le numărăm aici, fără
  // filtru) se ascund, cele rămase nu se ating.
  const w = lumeaM10()
  const nivele = [...new Set(w.camere.chei.map((k) => decodeazaFelie(k).z))].sort((a, b) => a - b)
  let toate = 0, laOpt = 0, faraFiltru = 0, cuFiltru = 0, ascunse = 0
  for (const z of nivele) {
    const a = ancoreLaNivel(w.camere, z)
    toate += a.length
    laOpt += alegeEtichete(deSus(a, 8)).filter((x) => x).length
    for (const s of [10, 14]) {
      const p = deSus(a, s)
      faraFiltru += suprapuse(p, p.map(() => true))
      const vede = alegeEtichete(p)
      cuFiltru += suprapuse(p, vede)
      ascunse += vede.filter((x) => !x).length
    }
  }
  assert.equal(laOpt, 0, 'sub 10 px pe celula ramane doar tenta')
  assert.ok(faraFiltru > 0, `fixtura: fara filtru, ${faraFiltru} perechi s-ar calca (altfel proba n-ar masura nimic)`)
  assert.equal(cuFiltru, 0)
  assert.ok(ascunse > 0 && ascunse <= faraFiltru, `${ascunse} cifre ascunse din ${2 * toate}`)
})

/** Luminanța relativă (sRGB → liniar, Rec. 709), scrisă aici, nu în overlay. */
function luminanta(c: readonly number[]): number {
  const l = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * l(c[0]!) + 0.7152 * l(c[1]!) + 0.0722 * l(c[2]!)
}

test('TERMIC ECRAN tenta: luminozitatea creste strict cu temperatura (nu rosu-verde); intervalul de cel putin 2 °C, cu aerul de afara in el', () => {
  const lo = -5 * Q, hi = 15 * Q
  let prec = -1
  for (let i = 0; i <= 40; i++) {
    const L = luminanta(culoareTemperatura(lo + ((hi - lo) * i) / 40, lo, hi))
    assert.ok(L > prec, `pasul ${i}: ${L} <= ${prec}`)
    prec = L
  }
  // Capetele se deosebesc fără culoare (contrastul WCAG între rece și cald ≥ 4,5:1).
  const contrast = (luminanta(CULOARE_CALDA) + 0.05) / (luminanta(CULOARE_RECE) + 0.05)
  assert.ok(contrast >= 4.5, `contrast ${contrast.toFixed(2)}`)
  assert.deepEqual(culoareTemperatura(-20 * Q, lo, hi), [...CULOARE_RECE], 'sub interval: capatul rece')
  assert.deepEqual(culoareTemperatura(40 * Q, lo, hi), [...CULOARE_CALDA])
  // Intervalul: [3, 4] °C se lărgește la 2 °C în jurul lui 3,5; [0, 10] rămâne.
  assert.deepEqual(intervalTenta(3 * Q, 4 * Q), { lo: 2.5 * Q, hi: 4.5 * Q })
  assert.deepEqual(intervalTenta(0, 10 * Q), { lo: 0, hi: 10 * Q })
  assert.deepEqual(intervalTenta(7 * Q, 7 * Q), { lo: 6 * Q, hi: 8 * Q })
  // Aerul de afară intră în scară (recenzia t.2a, L4-4: pe M10, 53 din 53 de niveluri aveau sub 2 °C între încăperi, deci
  // totul cădea lângă mijlocul rampei). Pe hârtie: încăperile [14, 15] °C cu afară 5 °C → [5, 15]; [3, 4] cu afară 15 →
  // [3, 15]; [14, 14,5] cu afară 15 → [14, 15], lărgit la 2 °C în jurul lui 14,5 → [13,5, 15,5]; afară între ele nu schimbă.
  assert.deepEqual(intervalCuAfara(14 * Q, 15 * Q, 5 * Q), { lo: 5 * Q, hi: 15 * Q })
  assert.deepEqual(intervalCuAfara(3 * Q, 4 * Q, 15 * Q), { lo: 3 * Q, hi: 15 * Q })
  assert.deepEqual(intervalCuAfara(14 * Q, 14.5 * Q, 15 * Q), { lo: 13.5 * Q, hi: 15.5 * Q })
  assert.deepEqual(intervalCuAfara(0, 10 * Q, 5 * Q), { lo: 0, hi: 10 * Q })
  // Două încăperi la 14,49 și 14,88 °C, afară 5 °C: amândouă la capătul cald, nu lângă mijloc.
  const s = intervalCuAfara(Math.round(14.49 * Q), Math.round(14.88 * Q), 5 * Q)
  assert.ok((Math.round(14.49 * Q) - s.lo) / (s.hi - s.lo) > 0.95)
})

// --- 4. overlay-ul și tasta ----------------------------------------------------------

/** Culoarea (liniară) a pătratului `i` din tenta overlay-ului: 6 vârfuri × (r, g, b, alfa). */
function culoareaPatratului(o: OverlayTemperatura, i: number): number[] {
  const m = o.group.children[0] as THREE.Mesh
  return Array.from((m.geometry.getAttribute('color').array as Float32Array).slice(i * 24, i * 24 + 3))
}
/** Alfa celor 6 vârfuri ale pătratului `i` (0 = nu se desenează: fără valoare). */
function alfaPatratului(o: OverlayTemperatura, i: number): number[] {
  const m = o.group.children[0] as THREE.Mesh
  const a = m.geometry.getAttribute('color').array as Float32Array
  return [0, 1, 2, 3, 4, 5].map((k) => a[(i * 6 + k) * 4 + 3]!)
}
function liniar(c: readonly number[]): number[] {
  const x = new THREE.Color().setRGB(c[0]!, c[1]!, c[2]!, THREE.SRGBColorSpace)
  return Array.from(new Float32Array([x.r, x.g, x.b]))
}

test('TERMIC ECRAN overlay-ul U din stare: valorile == T din stare dupa FIECARE tick (si in tickul pasului: fara cheie de tick), recolorarea doar la schimbare, pauza 0 recolorari; geometria la amprenta noua, o casa noua cu cifra din primul cadru', () => {
  const { w, wx, wy, g } = sitPlat(12345, 24)
  casa(w, wx, wy, g)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const o = createTemperaturaOverlay()
  o.visible = true
  const z = g + 1
  assert.ok(o.material.alphaTest > 0 && o.material.alphaTest < 0.7, 'patratele cu alfa 0 se arunca (nici culoare, nici adancime); cele cu valoare (alfa 0,7) raman')
  const casaId = componentaLa(w.camere, wx + 2, wy + 2, z)!.id
  actualizeazaTemperaturaOverlay(o, w, R, z)
  assert.deepEqual([o.reconstructii, o.recolorari], [1, 1])
  assert.equal(o.valori.get(casaId), w.temperatura.slot.t[casaId], 'T din stare')
  assert.equal(o.quadComp.length, 9, 'un patrat pe celula de aer a casei')
  assert.deepEqual(o.ancore.map((a) => [a.x - wx, a.y - wy, a.comp]), [[2, 2, casaId]])
  // Scara: valoarea casei ȘI aerul de afară de la ultima recolorare.
  assert.equal(o.tAfara, tAfara(w.seed, w.tick, R))
  const { lo, hi } = intervalCuAfara(o.min, o.max, o.tAfara)
  assert.deepEqual(culoareaPatratului(o, 0), liniar(culoareTemperatura(o.valori.get(casaId)!, lo, hi)))
  assert.deepEqual(alfaPatratului(o, 0), [1, 1, 1, 1, 1, 1])
  // Tick cu tick, trei pași (și tickurile dinaintea lor, unde o cheie `floor(tick / tps)` s-ar fi schimbat cu un tick prea
  // devreme — UI-3): după fiecare cadru, valoarea desenată e T-ul din stare. Recolorarea, doar când s-a schimbat ceva.
  let schimbari = 0
  for (let i = 0; i < 3 * R.ticksPerSecond + 5; i++) {
    const vechi = w.temperatura.slot.t[casaId]!
    const afaraVeche = textZecimi(o.tAfara)
    const rec0 = o.recolorari
    avanseaza(w, 1)
    actualizeazaTemperaturaOverlay(o, w, R, z)
    assert.equal(o.valori.get(casaId), w.temperatura.slot.t[casaId], `tickul ${w.tick}: valoarea de acum`)
    const trebuia = w.temperatura.slot.t[casaId] !== vechi || textZecimi(tAfara(w.seed, w.tick, R)) !== afaraVeche
    assert.equal(o.recolorari - rec0, trebuia ? 1 : 0, `tickul ${w.tick}: recolorare doar la schimbare`)
    if (w.temperatura.slot.t[casaId] !== vechi) schimbari++
  }
  assert.ok(schimbari >= 2, `fixtura: pasii au mutat T-ul casei (${schimbari})`)
  // T-ul arătat e STAREA, nu echilibrul (t.2a): casa pornită din solul podelei nu e la regim.
  const reg = bun(regimPermanent(w, R, w.tick), 'regim')
  assert.notEqual(o.valori.get(casaId), temperaturaComponentei(reg, casaId), 'fixtura: starea nu e echilibrul')
  // Pauză: lumea nu s-a schimbat — citiri, dar nicio recolorare.
  const [rec, cit] = [o.recolorari, o.citiri]
  for (let k = 0; k < 10; k++) actualizeazaTemperaturaOverlay(o, w, R, z)
  assert.deepEqual([o.recolorari - rec, o.citiri - cit], [0, 10], 'in pauza: zece citiri, nicio recolorare')
  // Alt nivel (o acțiune a jucătorului): geometrie și culori, imediat; înapoi, la fel.
  const re = o.reconstructii
  actualizeazaTemperaturaOverlay(o, w, R, z + 1)
  assert.deepEqual([o.reconstructii - re, o.nivel], [1, z + 1])
  actualizeazaTemperaturaOverlay(o, w, R, z)
  assert.equal(o.reconstructii - re, 2)
  assert.equal(o.valori.get(casaId), w.temperatura.slot.t[casaId])
  // O săpătură departe (altă componentă, alt nivel), prin comenzi: epoca se mișcă, amprenta nivelului nu — nicio geometrie nouă.
  const ep = w.camere.epoca
  const gd = groundLevelM(w.terrain, wx + 18, wy + 18)
  assert.ok(gd.ok)
  for (const zz of [gd.value - 6, gd.value - 5]) assert.ok(applyCommand(w, { kind: 'dig', wx: wx + 18, wy: wy + 18, z: zz }, R).ok)
  assert.notEqual(w.camere.epoca, ep, 'fixtura: epoca noua')
  actualizeazaTemperaturaOverlay(o, w, R, z)
  assert.equal(o.reconstructii - re, 2)
  // A doua casă pe același nivel (zidită direct în teren, sincronizată prin punctul unic): geometrie nouă, iar casa nouă
  // are valoare și cifră din PRIMUL cadru (proveniența i-a dat T la sincronizare) — nicio casă desenată fără valoare.
  casa(w, wx + 8, wy, g)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const ancoreVechi = o.ancore
  actualizeazaTemperaturaOverlay(o, w, R, z)
  const noua = componentaLa(w.camere, wx + 10, wy + 2, z)!.id
  const veche = componentaLa(w.camere, wx + 2, wy + 2, z)!.id
  assert.equal(o.reconstructii - re, 3)
  assert.notEqual(o.ancore, ancoreVechi, 'ancore noi: semnalul pentru stratul DOM')
  assert.deepEqual([...o.valori.keys()].sort((a, b) => a - b), o.comps, 'valorile sunt exact ale componentelor de acum (nicio valoare pe un id vechi)')
  for (const id of [noua, veche]) {
    assert.equal(o.valori.get(id), w.temperatura.slot.t[id], `componenta ${id}: T din stare, din primul cadru`)
    assert.deepEqual(alfaPatratului(o, [...o.quadComp].indexOf(id)), [1, 1, 1, 1, 1, 1], `componenta ${id}: desenata`)
    assert.ok(o.ancore.some((a) => a.comp === id), `componenta ${id}: are cifra`)
  }
  // Fără nivel: nimic desenat.
  actualizeazaTemperaturaOverlay(o, w, R, null)
  assert.deepEqual([o.group.children.length, o.ancore.length, o.nivel, o.valori.size], [0, 0, null, 0])
})

test('TERMIC ECRAN legenda lui U: aerul de afara de la tickul lumii (acelasi grad ca inspectorul), nu aerul scarii', () => {
  // Scara lui U tine aerul de afara de la ultima recolorare (o recolorare la o zecime noua); gradele intregi ale legendei
  // se scriu din tickul lumii, ca randul 1 al inspectorului si bara de sus. Masurat la valul 2: pe aerul scarii, in 4,5%
  // din tickuri legenda spunea alt grad decat inspectorul (ferestre de pana la 80 s la 1×).
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const o = createTemperaturaOverlay()
  o.visible = true
  const z = g + 1
  const celula = { x: wx + 2, y: wy + 2, z }
  actualizeazaTemperaturaOverlay(o, w, R, z)
  let gasit = false
  for (let i = 0; i < 8000 && !gasit; i++) {
    tick(w, R)
    actualizeazaTemperaturaOverlay(o, w, R, z)
    gasit = textGradeIntregi(o.tAfara) !== textGradeIntregi(tAfara(w.seed, w.tick, R))
  }
  assert.ok(gasit, 'fixtura: un tick la care scara si tickul dau grade diferite')
  const afara = textGradeIntregi(tAfara(w.seed, w.tick, R))
  assert.equal(cifreLegenda(o, w, R), textIntervalTemperatura(o.valori.size, o.min, o.max, tAfara(w.seed, w.tick, R)))
  assert.ok(cifreLegenda(o, w, R).endsWith(` · afară ${afara} °C`))
  assert.ok(termicLa(w, R, celula)!.linie.endsWith(` · afară ${afara} °C`), 'acelasi grad ca randul 1 al inspectorului')
  // Fara nivel, nimic.
  actualizeazaTemperaturaOverlay(o, w, R, null)
  assert.equal(cifreLegenda(o, w, R), '')
})

test('TERMIC ECRAN legenda lui U cu o componenta fara T: „Temperatura nu se știe (eroare internă)", nu intervalul celorlalte', () => {
  // Recenzia t.2b, E2 (3): UI-6 cere eroarea și în legendă; testul „componenta fara T" verifică `o.eroare`, nu legenda.
  // Două case la nivel: una pierde T-ul, cealaltă îl are — fără eroare, legenda ar scrie intervalul ei, cu aerul de afară.
  const { w, wx, wy, g } = sitPlat(12345, 16)
  casa(w, wx, wy, g)
  casa(w, wx + 8, wy, g)
  bun(sincronizeazaLumea(w, R), 'sincronizeazaLumea')
  const o = createTemperaturaOverlay()
  o.visible = true
  actualizeazaTemperaturaOverlay(o, w, R, g + 1)
  assert.equal(o.valori.size, 2, 'fixtura: doua componente desenate')
  assert.equal(cifreLegenda(o, w, R), textIntervalTemperatura(2, o.min, o.max, tAfara(w.seed, w.tick, R)), 'fara eroare: intervalul')
  const id = componentaLa(w.camere, wx + 2, wy + 2, g + 1)!.id
  w.temperatura.slot.are[id] = 0
  actualizeazaTemperaturaOverlay(o, w, R, g + 1)
  assert.deepEqual([o.faraT, o.valori.size], [1, 1], 'fixtura: una fara T, cealalta desenata')
  assert.equal(cifreLegenda(o, w, R), TEXT_TEMPERATURA_NECUNOSCUTA)
})

test('TERMIC ECRAN tasta U: overlay-ul Temperatura, doar cu UI; nu dintr-un camp de text', () => {
  const T = (key: string, mod: 'joc' | 'verificare' | 'faraUI', editabil = false) =>
    actiuneTasta({ key, ctrl: false, shift: false, alt: false, meta: false, editabil, compunere: false, modal: false, mod, amprenta: false }).actiune
  assert.equal(T('u', 'joc'), 'overlayU')
  assert.equal(T('U', 'joc'), 'overlayU')
  assert.equal(T('u', 'verificare'), 'overlayU')
  assert.equal(T('u', 'faraUI'), null, 'pe o pagina de gate, nicio tasta noua')
  assert.equal(T('u', 'joc', true), null)
  // T ramane traversarea, X si Z nu fac actiuni (sunt tinute de zone), I ramane Incaperi.
  assert.equal(T('t', 'joc'), 'traversare')
  assert.equal(T('i', 'joc'), 'overlayI')
  assert.equal(T('x', 'joc'), null)
  assert.equal(T('z', 'joc'), null)
})
