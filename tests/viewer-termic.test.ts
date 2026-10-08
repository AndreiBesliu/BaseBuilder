/**
 * Temperatura pe ecran — S24-27, tăietura 2a, commit-ul 4 (design-temperatura-v2 §6, §10.4; panoul, L5-1/L5-2/L5-3).
 *
 * INSPECTORUL: explicația rămâne în memoria ei (același obiect, un singur calcul), temperatura se calculează la
 * fiecare reîmprospătare din graful simulării și NU intră în cheia de redesenare — altfel butoanele s-ar recrea
 * la fiecare schimbare (nodul lor în DOM se probează pe ecran, bench/ui-fum.mjs, „temperatura-fara-clic"). Textele
 * pe HÂRTIE: ponderile casei cu ușă din conductanțele calculate de mână (tests/termic.test.ts), zecimile.
 *
 * OVERLAY-UL U: ancorele cifrelor pe hârtie (un L al cărui centru cade afară), pe M10 și pe mina de 192×192×3
 * (fiecare ancoră în piesa ei, numărate independent: cifrele panoului, 3.727 și 72), densitatea (pragul de 10 px
 * pe celulă, filtrul lacom), tenta pe luminozitate, ritmul regimului (cel mult o dată pe secundă) cu un ceas fals.
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
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill, groundLevelM, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { canaleTermice, Destinatie, regimPermanent, statGraf, temperaturaComponentei } from '../src/sim/termic.ts'
import type { CanalTermic } from '../src/sim/termic.ts'
import { createWorld } from '../src/sim/world.ts'
import { creeazaMemorieTermica, inspecteazaCelula, termicLa } from '../viewer/ui/model.ts'
import { cheieInspectorCelula, creeazaMemorieIncapere, usilePropuse } from '../viewer/ui/memorie-incapere.ts'
import { textCanale, textDrum, textEchilibru, textGradeIntregi, textProcent, textZecimi } from '../viewer/ui/texte.ts'
import { actiuneTasta } from '../viewer/ui/taste.ts'
import {
  actualizeazaTemperaturaOverlay,
  alegeEtichete,
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
import { R, ruleaza, sitPlat } from './fixturi.ts'

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

// --- 1. inspectorul ------------------------------------------------------------------

test('TERMIC ECRAN inspectorul: N tickuri fara editari — textul temperaturii se schimba, explicatia ramane in memorie (1 calcul, acelasi obiect), cheia de redesenare nu se schimba', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g)
  sincronizeazaCamere(w.camere, w.terrain)
  const mem = creeazaMemorieIncapere(() => 0)
  const memT = creeazaMemorieTermica()
  // Clic pe podeaua casei: aerul întrebat e deasupra ei.
  const sel = [wx + 2, wy + 2, g] as const
  const inc0 = mem.ia(w, ...sel, true)
  assert.ok(inc0 && inc0.e.fel === 'INCAPERE', JSON.stringify(inc0))
  assert.doesNotMatch(JSON.stringify(inc0), /°C|echilibru|tQ16|canale/, 'explicatia nu poarta nimic termic')
  const cheie = (): string => cheieInspectorCelula(inspecteazaCelula(w, R, ...sel, null), mem.versiune(), usilePropuse(w, mem.ia(w, ...sel, false)))
  const cheie0 = cheie()
  const linii = new Set<string>()
  const t0 = memT.ia(w, R, inc0.celula, 0)
  assert.ok(t0 && t0.tQ16 !== null)
  linii.add(t0.linie)
  for (let p = 0; p < 12; p++) {
    ruleaza(w, 420)
    const inc = mem.ia(w, ...sel, false)
    assert.equal(inc, inc0, `pasul ${p}: explicatia e acelasi obiect (memoria ei nu se invalideaza fara editari)`)
    // Ceasul viewer-ului merge odata cu jocul: 420 de tickuri = 21 s la 1× (fereastra de o secunda a memoriei e depasita).
    const t = memT.ia(w, R, inc!.celula, (p + 1) * 21000)
    assert.ok(t && t.tQ16 !== null)
    // Temperatura e a lumii de ACUM: regimul permanent la tickul ei.
    const r = regimPermanent(w, R, w.tick)
    assert.ok(r.ok)
    assert.equal(t.tQ16, temperaturaComponentei(r.value, t.comp), `pasul ${p}: tickul ${w.tick}`)
    assert.equal(t.linie, textEchilibru(t.tQ16, tAfara(w.seed, w.tick, R)))
    linii.add(t.linie)
    assert.equal(cheie(), cheie0, `pasul ${p}: cheia de redesenare nu poarta temperatura (butoanele raman aceleasi noduri)`)
  }
  assert.equal(mem.calcule(), 1, 'un singur calcul al explicatiei in 3 ore de joc')
  assert.ok(linii.size >= 4, `textul temperaturii s-a schimbat fara clic: ${[...linii].join(' | ')}`)
  // Un re-clic pe aceeași celulă: explicația tot din memorie (nicio editare), temperatura tot cea de acum.
  assert.equal(mem.ia(w, ...sel, true), inc0)
  assert.equal(mem.calcule(), 1)
  assert.equal(termicLa(w, R, inc0.celula)?.linie, memT.ia(w, R, inc0.celula, 12 * 21000 + 500)?.linie)
})

test('TERMIC ECRAN inspectorul pe hartie: casa 5x5x2 cu usa — linia echilibrului si descompunerea pe destinatii, din ponderile calculate de mana', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g)
  sincronizeazaCamere(w.camere, w.terrain)
  const celula = { x: wx + 2, y: wy + 2, z: g + 1 }
  // Pe hârtie (tests/termic.test.ts, „casa 5x5x2 cu usa"): pereții 23 · 86.231 = 1.983.313, acoperișul 9 · 89.775 =
  // 807.975, ușa 1 · 139.438 — spre aer, 2.930.726 —; podeaua 9 · 110.144 = 991.296 spre sol (d 0). Σ 3.922.022.
  // Ponderile Q16 pe sume cumulate: pereți 33.141, podea 16.564, acoperiș 13.501, restul (ușa) 2.330. Procentele:
  // aer de afară (33.141 + 13.501) · 100 / 65.536 = 71,2 → 71; pereți 50,6 → 51; acoperiș 20,6 → 21; podea 25,3 → 25;
  // restul 3,6 → 4.
  for (const tick of [0, 100000, 400000]) {
    w.tick = tick
    const ta = tAfara(w.seed, tick, R)
    const ts = tSol(0, tick, R)
    const T = rot(2930726n * BigInt(ta) + 991296n * BigInt(ts), 3922022n)
    const t = termicLa(w, R, celula)
    assert.ok(t)
    assert.equal(t.tQ16, T, `tickul ${tick}`)
    assert.equal(t.linie, `~${zec(T)} °C la echilibru (afară ${intreg(ta)} °C)`)
    assert.equal(t.canale, `71% aer de afară (pereți 51%, acoperiș 21%, ~${intreg(ta)} °C) · 25% sol prin podea (~${intreg(ts)} °C) · rest 4%`)
  }
  // Tickul 0, citit: 948.730 / 65.536 = 14,48 °C; afară 15, solul de suprafață 13.
  w.tick = 0
  assert.deepEqual(termicLa(w, R, celula), {
    comp: componentaLa(w.camere, celula.x, celula.y, celula.z)!.id,
    tQ16: 948730,
    linie: '~14,5 °C la echilibru (afară 15 °C)',
    canale: '71% aer de afară (pereți 51%, acoperiș 21%, ~15 °C) · 25% sol prin podea (~13 °C) · rest 4%',
  })
  // Afară, sub cer: nicio componentă, nimic termic.
  assert.equal(termicLa(w, R, { x: wx + 8, y: wy + 8, z: g + 1 }), null)
})

test('TERMIC ECRAN inspectorul: fata ADANC in sus e „peste 8 m de piatră", nu sol; nicio eticheta „pierde/câștigă"', () => {
  // Donjonul verificatorului L2-3: cameră 3×3×2 cu zid de 1 m, 11 m de piatră plină deasupra.
  const { w, wx, wy, g } = sitPlat(20260913, 7)
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const zid = i === 0 || j === 0 || i === 4 || j === 4
    for (let h = 1; h <= 2; h++) if (zid) assert.ok(fill(w.terrain, wx + i, wy + j, g + h, P).ok)
    for (let h = 3; h <= 13; h++) assert.ok(fill(w.terrain, wx + i, wy + j, g + h, P).ok)
  }
  sincronizeazaCamere(w.camere, w.terrain)
  const t = termicLa(w, R, { x: wx + 2, y: wy + 2, z: g + 1 })
  assert.ok(t)
  // Pe hârtie: pereții 24 · 86.231 = 2.069.544 spre aer, podeaua 9 · 110.144 = 991.296, tavanul 9 · 13.596 = 122.364.
  // Σ 3.183.204; cumulat: 42.608 (65,0%), 63.017 → 20.409 (31,1%), restul 2.519 (3,8%) — al treilea rând, nu „rest".
  assert.match(t.canale, /^65% aer de afară prin pereți \(1 m piatră, ~−?\d+ °C\) · 31% sol prin podea \(~−?\d+ °C\) · 4% tavan peste 8 m de piatră \(~−?\d+ °C\)$/u)
  assert.doesNotMatch(t.canale, /sol adânc|pierde|câștigă/)
  const o = canaleTermice(w, R, componentaLa(w.camere, wx + 2, wy + 2, g + 1)!.id, w.tick)
  assert.ok(o.ok)
  assert.deepEqual(o.value.randuri.map((r) => r.pondereQ16), [42608, 20409, 2519])
  assert.equal(textCanale(o.value), t.canale)
})

test('TERMIC ECRAN inspectorul pe hartie: casa 5x5x2 cu golul usii (2 celule) — golul e „gol deschis", nu „pereți"', () => {
  // Recenzia ECRAN, L4-1: DESCHISA și EXT au aceeași destinație (AFARA), deci fără `deschis` în cheia grupului golul
  // se contopea cu pereții, iar textul spunea „pereți 93%" pentru o componentă care stă 87% pe gol.
  const { w, wx, wy, g } = sitPlat(12345, 12)
  casa(w, wx, wy, g, false)
  for (let z = g + 1; z <= g + 2; z++) assert.ok(dig(w.terrain, wx + 2, wy, z).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const celula = { x: wx + 2, y: wy + 2, z: g + 1 }
  // Pe hârtie: golul 2 · 13.107.200 = 26.214.400 (DESCHISĂ, 200 W/K); pereții spre aer 22 · 86.231 + 4 · 48.545 (2 m
  // de piatră, lângă gol: 130 + 1.180 + 40 = 1.350) = 2.091.262; podeaua 10 · 110.144 = 1.101.440; acoperișul
  // 10 · 89.775 = 897.750. Σ 30.304.852; cumulat: 56.690 (86,5%), 61.213 → 4.523 (6,9%), 63.595 → 2.382 (3,6%),
  // restul 1.941 (3,0%).
  const o = canaleTermice(w, R, componentaLa(w.camere, celula.x, celula.y, celula.z)!.id, 0)
  assert.ok(o.ok)
  assert.deepEqual(o.value.randuri.map((r) => [r.clasa, r.destinatie, r.deschis, r.gQ16, r.pondereQ16, r.fete]), [
    [ClasaDir.LAT, Destinatie.AFARA, true, 26214400, 56690, 2],
    [ClasaDir.LAT, Destinatie.AFARA, false, 2091262, 4523, 26],
    [ClasaDir.JOS, Destinatie.SOL, false, 1101440, 2382, 10],
  ])
  assert.equal(o.value.rest.pondereQ16, 1941)
  w.tick = 0
  assert.equal(termicLa(w, R, celula)?.canale, '93% aer de afară (gol deschis 87%, pereți 7%, ~15 °C) · 4% sol prin podea (~13 °C) · rest 3%')
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
  assert.equal(textEchilibru(4 * Q + 32768, 12 * Q), '~4,5 °C la echilibru (afară 12 °C)')
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

test('TERMIC ECRAN memoria termica: in pauza (acelasi tick) niciun calcul; un tick nou sau alta componenta, unul', () => {
  const { w, wx, wy, g } = sitPlat(12345, 16)
  casa(w, wx, wy, g)
  casa(w, wx + 8, wy, g, false)
  sincronizeazaCamere(w.camere, w.terrain)
  const m = creeazaMemorieTermica()
  const a = { x: wx + 2, y: wy + 2, z: g + 1 }
  const b = { x: wx + 10, y: wy + 2, z: g + 1 }
  const ta = m.ia(w, R, a, 0)
  for (let i = 0; i < 10; i++) assert.equal(m.ia(w, R, a, 250 * i), ta, 'pauza: acelasi raspuns')
  assert.equal(m.calcule(), 1)
  const tb = m.ia(w, R, b, 2500)
  assert.ok(tb && ta && tb.comp !== ta.comp)
  assert.equal(m.calcule(), 2, 'alta componenta')
  w.tick += 1
  m.ia(w, R, b, 3500)
  assert.equal(m.calcule(), 3, 'un tick nou, dupa o secunda')
  assert.equal(m.ia(w, R, null, 3600), null)
  assert.equal(m.ia(w, R, { x: wx + 20, y: wy + 20, z: g + 1 }, 3600), null, 'aer sub cer: nimic')
  assert.equal(m.calcule(), 3)
})

test('TERMIC ECRAN ritmul memoriei termice: jocul mergand si fetele schimbandu-se la fiecare reimprospatare — cel mult un calcul (si o refacere de graf) pe secunda; pauza 0; alta casa imediat, chiar cu id-ul celei dinainte', () => {
  // Recenzia t.2a, L4-2: cheiata doar pe tick, memoria recalcula la fiecare reimprospatare (4 Hz), iar orice sapatura
  // langa aer acoperit muta stampila grafului: graful se refacea de pana la 4 ori pe secunda (designul §5: cel mult o
  // data). Aici: pamant pe acoperis la fiecare reimprospatare (epocaFete creste), cu tickul mergand.
  const { w, wx, wy, g } = sitPlat(12345, 16)
  casa(w, wx, wy, g)
  casa(w, wx + 8, wy, g, false)
  sincronizeazaCamere(w.camere, w.terrain)
  const m = creeazaMemorieTermica()
  const a = { x: wx + 2, y: wy + 2, z: g + 1 }
  const aSus = { x: wx + 2, y: wy + 2, z: g + 2 }
  const b = { x: wx + 10, y: wy + 2, z: g + 1 }
  const ta = m.ia(w, R, a, 0)
  const ref0 = statGraf(w.camere).refaceri
  const pamant = (x: number, y: number): void => {
    const ep = w.camere.epocaFete
    assert.ok(fill(w.terrain, x, y, g + 4, Material.PAMANT).ok)
    sincronizeazaCamere(w.camere, w.terrain)
    assert.ok(w.camere.epocaFete > ep, 'fixtura: pamantul pe acoperis schimba fetele')
    w.tick += 5
  }
  for (let i = 1; i <= 3; i++) {
    pamant(wx + i, wy + 1)
    assert.equal(m.ia(w, R, a, 250 * i), ta, `reimprospatarea ${i}: raspunsul de acum ${250 * i} ms`)
  }
  // Alt clic in ACEEASI incapere (alta celula, aceeasi componenta, aceeasi epoca a indexului), sub o secunda.
  pamant(wx + 1, wy + 2)
  assert.equal(m.ia(w, R, aSus, 900), ta, 'aceeasi incapere, alta celula, sub o secunda')
  assert.equal(m.calcule(), 1, 'sub o secunda: niciun calcul nou')
  assert.equal(statGraf(w.camere).refaceri - ref0, 0, 'sub o secunda: nicio refacere de graf')
  m.ia(w, R, a, 1000)
  assert.equal(m.calcule(), 2, 'dupa o secunda: un calcul')
  for (let t = 1250; t <= 6000; t += 250) m.ia(w, R, a, t)
  assert.equal(m.calcule(), 2, 'pauza (acelasi tick): niciun calcul, oricat timp')
  // Aceeasi celula, id-ul componentei ROTIT (o celula din interior umpluta si sapata la loc reface indexul: casa A
  // trece de la id-ul 0 la 1, casa B de la 1 la 0): sub o secunda, raspunsul de acum.
  w.tick += 5
  const t3 = m.ia(w, R, a, 6100)
  assert.equal(m.calcule(), 3)
  const idA = componentaLa(w.camere, a.x, a.y, a.z)!.id
  const idB = componentaLa(w.camere, b.x, b.y, b.z)!.id
  assert.ok(fill(w.terrain, wx + 1, wy + 3, g + 1, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.ok(dig(w.terrain, wx + 1, wy + 3, g + 1).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  w.tick += 5
  assert.equal(componentaLa(w.camere, b.x, b.y, b.z)!.id, idA, 'fixtura: casa B a primit id-ul casei A')
  assert.notEqual(componentaLa(w.camere, a.x, a.y, a.z)!.id, idA, 'fixtura: id-ul casei A s-a rotit')
  assert.notEqual(idA, idB)
  assert.equal(m.ia(w, R, a, 6350), t3, 'aceeasi celula, id rotit, sub o secunda: raspunsul de acum')
  assert.equal(m.calcule(), 3)
  // Clic pe casa B, sub o secunda: alta componenta — imediat, chiar daca are acum id-ul pe care il avea A.
  const tb = m.ia(w, R, b, 6400)
  assert.equal(m.calcule(), 4, 'alta casa: imediat')
  assert.ok(tb && t3 && tb.tQ16 !== null)
  assert.equal(tb.tQ16, termicLa(w, R, b)!.tQ16, 'raspunsul e al casei B, nu cel al casei A cu acelasi id')
  assert.notEqual(tb.tQ16, t3.tQ16, 'fixtura: casele (cu usa si fara) au alt echilibru')
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
  buildM10PeLume(w, 300, 300)
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
/** Alfa celor 6 vârfuri ale pătratului `i` (0 = nu se desenează: încă fără valoare). */
function alfaPatratului(o: OverlayTemperatura, i: number): number[] {
  const m = o.group.children[0] as THREE.Mesh
  const a = m.geometry.getAttribute('color').array as Float32Array
  return [0, 1, 2, 3, 4, 5].map((k) => a[(i * 6 + k) * 4 + 3]!)
}
function liniar(c: readonly number[]): number[] {
  const x = new THREE.Color().setRGB(c[0]!, c[1]!, c[2]!, THREE.SRGBColorSpace)
  return Array.from(new Float32Array([x.r, x.g, x.b]))
}

test('TERMIC ECRAN overlay-ul U: geometria la amprenta noua, regimul cel mult o data pe secunda si doar pe lume noua, la nivel nou imediat', () => {
  const { w, wx, wy, g } = sitPlat(12345, 24)
  casa(w, wx, wy, g)
  sincronizeazaCamere(w.camere, w.terrain)
  const o = createTemperaturaOverlay()
  o.visible = true
  const z = g + 1
  assert.ok(o.material.alphaTest > 0 && o.material.alphaTest < 0.7, 'patratele cu alfa 0 se arunca (nici culoare, nici adancime); cele cu valoare (alfa 0,7) raman')
  const casaId = componentaLa(w.camere, wx + 2, wy + 2, z)!.id
  const T = (): number => { const r = regimPermanent(w, R, w.tick); assert.ok(r.ok); return temperaturaComponentei(r.value, casaId)! }
  actualizeazaTemperaturaOverlay(o, w, R, z, 0)
  assert.deepEqual([o.reconstructii, o.regimuri], [1, 1])
  assert.equal(o.valori.get(casaId), T())
  assert.equal(o.quadComp.length, 9, 'un patrat pe celula de aer a casei')
  assert.deepEqual(o.ancore.map((a) => [a.x - wx, a.y - wy, a.comp]), [[2, 2, casaId]])
  // Scara: valoarea casei ȘI aerul de afară de la tickul regimului.
  assert.equal(o.tAfara, tAfara(w.seed, w.tick, R))
  const { lo, hi } = intervalCuAfara(o.min, o.max, o.tAfara)
  assert.deepEqual(culoareaPatratului(o, 0), liniar(culoareTemperatura(o.valori.get(casaId)!, lo, hi)))
  assert.deepEqual(alfaPatratului(o, 0), [1, 1, 1, 1, 1, 1])
  // Lumea merge: sub o secundă, aceleași valori; la o secundă, regimul la tickul de acum.
  const v0 = o.valori.get(casaId)
  ruleaza(w, 1680)
  actualizeazaTemperaturaOverlay(o, w, R, z, 999)
  assert.deepEqual([o.reconstructii, o.regimuri, o.valori.get(casaId)], [1, 1, v0], 'sub o secunda: nimic nou')
  actualizeazaTemperaturaOverlay(o, w, R, z, 1000)
  assert.deepEqual([o.reconstructii, o.regimuri], [1, 2])
  assert.equal(o.valori.get(casaId), T())
  assert.notEqual(o.valori.get(casaId), v0, 'fixtura: o ora de joc a mutat echilibrul casei')
  // Pauză: lumea nu s-a schimbat, deci nici la 5 s nu se recalculează.
  actualizeazaTemperaturaOverlay(o, w, R, z, 5000)
  assert.equal(o.regimuri, 2, 'in pauza: niciun regim')
  // Alt nivel (o acțiune a jucătorului): geometrie și regim, imediat; înapoi, la fel.
  actualizeazaTemperaturaOverlay(o, w, R, z + 1, 5100)
  assert.deepEqual([o.reconstructii, o.regimuri, o.nivel], [2, 3, z + 1])
  actualizeazaTemperaturaOverlay(o, w, R, z, 5200)
  assert.deepEqual([o.reconstructii, o.regimuri], [3, 4])
  // O săpătură departe (altă componentă, alt nivel): epoca se mișcă, amprenta nivelului nu — nicio geometrie nouă.
  const ep = w.camere.epoca
  const gd = groundLevelM(w.terrain, wx + 18, wy + 18)
  assert.ok(gd.ok)
  for (const zz of [gd.value - 6, gd.value - 5]) assert.ok(dig(w.terrain, wx + 18, wy + 18, zz).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.notEqual(w.camere.epoca, ep, 'fixtura: epoca noua')
  actualizeazaTemperaturaOverlay(o, w, R, z, 5300)
  assert.deepEqual([o.reconstructii, o.regimuri], [3, 4])
  // A doua casă pe același nivel, sub o secundă: geometrie nouă, colorată cu valorile vechi; ea NU se desenează (alfa 0)
  // și n-are cifră până la regimul următor — nu un gri care se confundă cu mijlocul rampei.
  const vVeche = o.valori.get(casaId)
  assert.ok(vVeche !== undefined)
  casa(w, wx + 8, wy, g)
  sincronizeazaCamere(w.camere, w.terrain)
  const ancoreVechi = o.ancore
  actualizeazaTemperaturaOverlay(o, w, R, z, 5400)
  const noua = componentaLa(w.camere, wx + 10, wy + 2, z)!.id
  assert.deepEqual([o.reconstructii, o.regimuri], [4, 4])
  assert.notEqual(o.ancore, ancoreVechi, 'ancore noi: semnalul pentru stratul DOM')
  assert.equal(o.valori.get(noua), undefined)
  const iNoua = [...o.quadComp].indexOf(noua)
  assert.deepEqual(alfaPatratului(o, iNoua), [0, 0, 0, 0, 0, 0])
  // Casa veche: reconstrucția indexului i-a rotit id-ul, iar valoarea ei a trecut pe id-ul nou prin celule — rămâne
  // desenată, cu culoarea și cifra de dinainte (cheiate pe id-ul vechi, tot nivelul ar fi rămas fără valoare).
  const veche = componentaLa(w.camere, wx + 2, wy + 2, z)!.id
  assert.notEqual(veche, casaId, 'fixtura: id-ul casei vechi s-a rotit')
  assert.equal(o.valori.get(veche), vVeche, 'casa veche: valoarea de dinainte, pe id-ul nou')
  assert.deepEqual(alfaPatratului(o, [...o.quadComp].indexOf(veche)), [1, 1, 1, 1, 1, 1], 'casa veche: desenata')
  assert.ok(o.ancore.some((a) => a.comp === veche && o.valori.has(a.comp)), 'casa veche: cifra ramane')
  actualizeazaTemperaturaOverlay(o, w, R, z, 6300)
  assert.equal(o.regimuri, 5)
  assert.ok(o.valori.has(noua))
  assert.deepEqual(alfaPatratului(o, iNoua), [1, 1, 1, 1, 1, 1], 'cu valoarea ei: desenata')
  // Fără nivel: nimic desenat.
  actualizeazaTemperaturaOverlay(o, w, R, null, 6400)
  assert.deepEqual([o.group.children.length, o.ancore.length, o.nivel], [0, 0, null])
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
