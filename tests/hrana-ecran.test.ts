/**
 * Ecranul hranei (S24-27 t.3 §8, commit-ul D; panoul UI-1 … UI-14): prognoza (o functie pura in src/sim, pe aerul viitor,
 * doua bazine, forma inchisa fara cer, plafonul de un an), clasele dupa rata EFECTIVA, inspectorul, alerta, F3, camara (presetul,
 * filtrul, groapa, „se strica aici"), harta U, memoria si cheile. Valorile se iau pe HARTIE (tabelul din content, λ-ul
 * cuantizat) sau dintr-un model independent (pas cu pas de 1 Hz, simularea reala); oracolul compara prognoza cu simularea
 * cu pioni care mananca si hrana care se strica.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { applyCommand } from '../src/sim/commands.ts'
import { tick } from '../src/sim/world.ts'
import { Faction, Item, ITEME, ONE_ALTERARE, slotOf } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import type { Command } from '../src/sim/commands.ts'
import { lambdaAlterare } from '../src/sim/alterare.ts'
import { mcLaQ16, tAfara } from '../src/sim/clima.ts'
import { tickuriPeAn, tickuriPeOra } from '../src/sim/calendar.ts'
import { nutritieEfectiva } from '../src/sim/iteme.ts'
import { groapaDeMoloz } from '../src/sim/camara.ts'
import { celulaDeZonaLa, slotZona, Zona } from '../src/sim/zone.ts'
import { celulaDeZonaPosibila } from '../src/sim/joburi.ts'
import { componentaLa } from '../src/sim/camere.ts'
import {
  fractiaSubCer, lnUnuPlus, mormanulDeHrana, pierdereaOreiSubCer, pragAlterare, prognozaFaraAlterare, prognozaHranei, proiecteaza,
  proiecteazaPeOre, rataZilnica, scadereOra, stareaHranei,
} from '../src/sim/prognoza.ts'
import type { Bazine } from '../src/sim/prognoza.ts'
import {
  alterareaMormanului, aplicaZona, capacitateCamara, Clasa, clasaLaT, clasaMormanului, clasaPrognozei, creeazaMemorieHrana, esteCamara,
  hranaEcran, inspecteazaCelula, locGroapa, MASCA_DOAR_HRANA, mormanPeLoc, PRAG_APROAPE_ZI, PRAG_ATENTIE_ZILE, PRAG_CRITIC_ZILE,
  prognozaJocNou, rezumatColonie, semnaleAlerte, suprafataColoanei, textPasiHrana, textPasulCamarii, textPrognozaBara,
} from '../viewer/ui/model.ts'
import { cheieListei } from '../viewer/ui/alerte.ts'
import type { StareAlerta } from '../viewer/ui/alerte.ts'
import { cheieInspectorCelula } from '../viewer/ui/memorie-incapere.ts'
import { textFeluri, textHranaF3, textPierdere, textPrimeste, textZecimi, textZile } from '../viewer/ui/texte.ts'
import { actualizeazaTemperaturaOverlay, ALFA_PUNCT, createTemperaturaOverlay, culoarePunct, NUME_PUNCTE, PUNCT_DESCHIS, PUNCT_INCHIS } from '../viewer/overlay-temperatura.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill } from '../src/sim/terrain/terrain.ts'
import { sincronizeazaLumea } from '../src/sim/temperatura.ts'
import { gasesteSit, laSit, lasaItem, patratPlat, picteaza, R, sitPlat, solid } from './fixturi.ts'
import { casaTermica, compLa } from './fixturi-temperatura.ts'
import { tickLa } from './fixturi-pivnita.ts'

const H = Item.HRANA
const NUT = R.nutritie[H]!
const ZI = R.calendar.ziTicks
const ORA = tickuriPeOra(R)
const AN = tickuriPeAn(R)
const TPS = R.ticksPerSecond
const Q = 65536
/** Consumul unui om pe tick, puncte (6 / 250). */
const OM = R.nevoi[0]!.scurgere / R.nevoiTicks

function bun<T>(o: { ok: boolean; value?: T }, ce: string): T {
  assert.ok(o.ok, `${ce}: ${JSON.stringify(o)}`)
  return o.value as T
}

/** Bazine: totul sub cer (proaspat), sau totul intr-o incapere cu rata zilnica `r`. */
function subCer(seed: number, tk: number, v: number, oameni: number): Bazine {
  return { seed, tick: tk, subCer: { valoare: v, baza: v }, incaperi: { valoare: 0, pierderePeTick: 0 }, consumPeTick: oameni * OM }
}
function inIncapere(v: number, oameni: number, rZi: number): Bazine {
  return { seed: 7, tick: 0, subCer: { valoare: 0, baza: 0 }, incaperi: { valoare: v, pierderePeTick: (v * rZi) / ZI }, consumPeTick: oameni * OM }
}

/**
 * Modelul INDEPENDENT al proiectiei: aceleasi bazine, dar pas cu pas de 1 Hz (ca simularea), cu λ-ul aerului la tickul
 * pasului — nu la mijlocul orei —, consumul pe tickurile pasului. Intoarce tickurile pana la golire (interpolat in pas).
 */
function proiectiaPe1Hz(b: Bazine): number {
  let vs = b.subCer.valoare
  let vr = b.incaperi.valoare
  const ks = vs > 0 ? b.subCer.baza / vs : 0
  const kr = vr > 0 ? b.incaperi.pierderePeTick / vr : 0
  for (let t = 0; t < AN; t += TPS) {
    const v = vs + vr
    const lam = ks > 0 ? lambdaAlterare(R, tAfara(b.seed, b.tick + t, R)) / ONE_ALTERARE : 0
    const ds = Math.min(vs, (b.consumPeTick * TPS * vs) / v + lam * ks * vs)
    const dr = (b.consumPeTick * TPS * vr) / v + kr * TPS * vr
    if (ds + dr >= v) return t + (TPS * v) / (ds + dr)
    vs -= ds
    vr -= dr
  }
  return AN
}

// --- 1. aritmetica si curba ------------------------------------------------------------------------------------------

test('HRANA ECRAN lnUnuPlus: ln(1 + x) doar cu + − × ÷, la cativa ulp de Math.log1p pe 1e-12 … 1e6', () => {
  let rau = 0
  for (const x of [1e-12, 3e-9, 1e-6, 0.001, 0.0137, 0.1, 0.5, 0.9999, 1, 1.5, 2, 3, 7.25, 10, 99, 1000, 123456, 1e6]) {
    const a = lnUnuPlus(x)
    const b = Math.log1p(x)
    const rel = Math.abs(a - b) / b
    if (rel > rau) rau = rel
    assert.ok(rel < 1e-14, `x = ${x}: ${a} vs ${b} (rel ${rel})`)
  }
  assert.equal(lnUnuPlus(0), 0)
  assert.equal(lnUnuPlus(-1), 0, 'negativ: 0, prognoza nu cere asa ceva')
})

test('HRANA ECRAN rata zilnica si pragul, din λ-ul CUANTIZAT al simularii: 15 °C pe hartie, banda moarta, pragul „aproape" la ~5,76 °C', () => {
  // Pragul e primul punct al tabelului din content (5 °C), nu un 5 scris in cod.
  assert.equal(pragAlterare(R), mcLaQ16(5000))
  // λ(15 °C) = 46.147 (nodul tabelului, val1-B); pe zi: λ · (ziTicks / tps) / ONE = 46.147 · 2.016 / 2^29.
  assert.equal(lambdaAlterare(R, mcLaQ16(15000)), 46147)
  assert.equal(rataZilnica(R, mcLaQ16(15000)), (46147 * 2016) / 536870912)
  // Banda moarta: 0 la prag si pana la prag + 1.638 Q16; λ = 1 de la prag + 1.639 Q16 (0,025 °C, val1-B).
  assert.equal(rataZilnica(R, pragAlterare(R)), 0)
  assert.equal(rataZilnica(R, pragAlterare(R) + 1638), 0)
  assert.equal(lambdaAlterare(R, pragAlterare(R) + 1639), 1)
  // Pragul clasei „aproape" (0,1% pe zi) cade la 377.450 Q16 = 5,759 °C (UI-2: 5,76 °C pe parabola).
  assert.ok(rataZilnica(R, 377449) < PRAG_APROAPE_ZI && rataZilnica(R, 377450) >= PRAG_APROAPE_ZI)
})

// --- 2. proiectia ----------------------------------------------------------------------------------------------------

test('HRANA ECRAN forma inchisa contra pasului orar, fara cer: aceeasi zi (sub 0,002 zile pana la 45 °C), iar la rata 0 exact V/C', () => {
  for (const tC of [6000, 10000, 15000, 25000, 45000]) {
    const r = rataZilnica(R, mcLaQ16(tC))
    const b = inIncapere(41400, 12, r)
    const inchisa = proiecteaza(b, R)
    const peOre = proiecteazaPeOre(b, R)
    assert.equal(inchisa.formaInchisa, true)
    assert.equal(peOre.formaInchisa, false)
    // Pe hartie: t = V·ln(1 + L/C)/L, cu Math.log1p (voie in teste).
    const L = b.incaperi.pierderePeTick
    const hartie = (41400 * Math.log1p(L / b.consumPeTick)) / L / ZI
    assert.ok(Math.abs(inchisa.zile - hartie) < 1e-12, `${tC}: ${inchisa.zile} vs ${hartie}`)
    // Masurat (scadereOra, Padé pe ora): −1,5·10^-9 zile la 6 °C, −1,2·10^-5 la 15 °C, −1,25·10^-4 la 25 °C, −9,3·10^-4 la 45 °C.
    // Cu Euler pe ora, −0,026 zile la 25 °C (prima versiune, rosie aici).
    assert.ok(Math.abs(peOre.zile - inchisa.zile) < 0.002, `${tC}: pe ore ${peOre.zile}, inchisa ${inchisa.zile}`)
    assert.ok(inchisa.zile < 41400 / b.consumPeTick / ZI, 'cu alterare, mai putin decat V/C')
  }
  // Rata 0: EXACT V/C, in ambele forme.
  const b0 = inIncapere(41400, 12, 0)
  assert.equal(proiecteaza(b0, R).zile, 41400 / (12 * OM) / ZI)
  assert.ok(Math.abs(proiecteazaPeOre(b0, R).zile - 41400 / (12 * OM) / ZI) < 1e-9)
  // Fara oameni: Infinity; fara hrana: 0.
  assert.equal(proiecteaza(inIncapere(41400, 0, 0.1), R).zile, Infinity)
  assert.equal(proiecteaza(inIncapere(0, 12, 0.1), R).zile, 0)
})

test('HRANA ECRAN pasul orar sub cer, pe AERUL VIITOR: la 0,005 zile de modelul pas cu pas de 1 Hz (toamna, primavara, vara); iarna fara pierdere = V/C exact', () => {
  const cazuri: [string, number, number][] = [['toamna, startul', 0, 12], ['toamna, 3× hrana', 0, 4], ['primavara', tickLa(0, 0, 1, 8), 12], ['vara', tickLa(0, 1, 2, 14), 12], ['vara, un om', tickLa(0, 1, 2, 14), 1]]
  for (const [nume, tk, oameni] of cazuri) {
    const b = subCer(7, tk, 41400, oameni)
    const p = proiecteaza(b, R)
    assert.equal(p.formaInchisa, false)
    const adevar = proiectiaPe1Hz(b) / ZI
    // Masurat: |dif| ≤ 0,0021 zile pe 16 cazuri (4 anotimpuri × 1/4/12 oameni, si un stoc amestecat). λ-ul de la inceputul
    // orei: pana la −0,136 zile (vara, un om); aerul de ACUM tinut constant (designul v1): zile intregi (UI-1).
    assert.ok(Math.abs(p.zile - adevar) < 0.005, `${nume}: prognoza ${p.zile}, modelul de 1 Hz ${adevar}`)
    assert.ok(p.zile < 41400 / (oameni * OM) / ZI, `${nume}: sub cer se strica`)
  }
  // Un stoc AMESTECAT (jumatate sub cer, jumatate intr-o casa la 8 °C): fractia de sub cer scade mai repede decat cea din casa.
  for (const [nume, tk] of [['amestec, toamna', 0], ['amestec, vara', tickLa(0, 1, 2, 14)]] as const) {
    const b: Bazine = { seed: 7, tick: tk, subCer: { valoare: 20000, baza: 20000 }, incaperi: { valoare: 21400, pierderePeTick: (21400 * rataZilnica(R, mcLaQ16(8000))) / ZI }, consumPeTick: 4 * OM }
    const p = proiecteaza(b, R)
    const adevar = proiectiaPe1Hz(b) / ZI
    assert.ok(Math.abs(p.zile - adevar) < 0.005, `${nume}: prognoza ${p.zile}, modelul de 1 Hz ${adevar}`)
  }
  // Iarna: o fereastra in care aerul nu trece de banda moarta 2 zile intregi — sub cer nu se pierde nimic, deci V/C.
  // Cautarea are PLAFON (PORTI-5): fara el, o clima cu +3 °C (nicio fereastra de 48 h tot anul, masurat) facea bucla
  // infinita — `node --test` n-are timeout implicit, deci `check` si CI atarnau in loc sa iasa rosii.
  const iarna0 = tickLa(0, 3, 1, 0)
  const zero = (t0: number): boolean => { for (let h = 0; h < 48; h++) if (pierdereaOreiSubCer(7, t0, R, h) > 0) return false; return true }
  let tk = iarna0
  for (; tk < iarna0 + 4 * ZI && !zero(tk); tk += ORA) { /* cauta fereastra */ }
  assert.ok(tk < iarna0 + 4 * ZI, 'fixtura: iarna are 2 zile fara pierdere sub cer')
  const C = 41400 / ZI
  const b = { seed: 7, tick: tk, subCer: { valoare: 41400, baza: 41400 }, incaperi: { valoare: 0, pierderePeTick: 0 }, consumPeTick: C }
  assert.ok(Math.abs(proiecteaza(b, R).zile - 1) < 1e-9, `iarna: ${proiecteaza(b, R).zile}`)
})

test('HRANA ECRAN monotonia: mai multa hrana — mai multe zile; mai multi oameni — mai putine; mai cald — mai putine; faramitata — mai putine', () => {
  let inainte = 0
  for (const v of [500, 2000, 8000, 20000, 41400, 80000, 150000]) {
    const z = proiecteaza(subCer(7, 0, v, 12), R).zile
    assert.ok(z > inainte, `hrana ${v}: ${z} ≤ ${inainte}`)
    inainte = z
  }
  inainte = Infinity
  for (const o of [1, 2, 4, 8, 12, 24, 48]) {
    const z = proiecteaza(subCer(7, 0, 41400, o), R).zile
    assert.ok(z < inainte, `${o} oameni: ${z} ≥ ${inainte}`)
    inainte = z
  }
  inainte = Infinity
  for (const tC of [4000, 5500, 7000, 10000, 15000, 20000, 30000]) {
    const z = proiecteaza(inIncapere(41400, 12, rataZilnica(R, mcLaQ16(tC))), R).zile
    assert.ok(z <= inainte, `${tC} m°C: ${z} > ${inainte}`)
    inainte = z
  }
  // Faramitata: aceeasi valoare, de 7,5 ori mai multe unitati (750 × 1 u cu 100 u de valoare, masurat la B): pierde pe
  // unitati, deci se termina mai repede.
  const intreaga = proiecteaza(subCer(7, 0, 1500, 1), R).zile
  const faramitata = proiecteaza({ ...subCer(7, 0, 1500, 1), subCer: { valoare: 1500, baza: 750 * NUT } }, R).zile
  assert.ok(faramitata < intreaga, `faramitata ${faramitata}, intreaga ${intreaga}`)
})

test('HRANA ECRAN cazurile limita ale pasului orar (ECRAN-3): e^(−a) nu cade la 0 la a = 2, faramitele pierd monoton, amestecul tine cel putin cat pivnita', () => {
  // scadereOra: sub PRAG_PADE exact Padé (continutul implicit); peste, injumatatita — nu 0 EXACT de la a = 2 (0,150 la 1,9:
  // Padé singur dadea 0,026). Eroarea absoluta, masurata: sub 0,0014 pana la a = 1000.
  for (const a of [0, 0.01, 0.1, 0.25]) assert.equal(scadereOra(a), (1 - a / 2) / (1 + a / 2), `a = ${a}`)
  let inainte = 1
  for (const a of [0.26, 0.5, 1, 1.9, 2, 2.5, 3, 5, 10, 30, 100, 700]) {
    const e = scadereOra(a)
    assert.ok(e > 0 && e < inainte, `a = ${a}: ${e} (inainte ${inainte})`)
    assert.ok(Math.abs(e - Math.exp(-a)) < 0.002, `a = ${a}: ${e} vs ${Math.exp(-a)}`)
    inainte = e
  }
  assert.equal(scadereOra(Infinity), 0)
  // Monotonia pe raportul baza/valoare (faramituri aproape stricate: masurat la B, 100 u de valoare in 750 de unitati): mai
  // multa baza — cel mult tot atatea zile, mereu un numar. Inainte: la 300 (toamna) si 100 (vara), f = 0/0 = NaN, alterarea
  // disparea si prognoza sarea la V/C (1,55 zile in loc de ~0,07).
  const pivnitaSingura = 750 / OM / ZI
  for (const [nume, tk] of [['toamna', 0], ['vara', tickLa(0, 1, 2, 14)]] as const) {
    let cer = Infinity
    let amestec = Infinity
    for (const ks of [1, 2, 7.5, 30, 100, 300, 1000, 1e5, 1e12]) {
      const zc = proiecteaza({ seed: 7, tick: tk, subCer: { valoare: 1500, baza: 1500 * ks }, incaperi: { valoare: 0, pierderePeTick: 0 }, consumPeTick: OM }, R).zile
      assert.ok(Number.isFinite(zc) && zc <= cer + 1e-12, `${nume}, cer, ks ${ks}: ${zc} (inainte ${cer})`)
      cer = zc
      // Jumatate sub cer, jumatate intr-o pivnita la rata 0: nu tine NICIODATA mai putin decat pivnita singura (consumul ia din
      // pivnita cel mult C pe tick), nici mai mult decat toata hrana fara alterare. Inainte: 0,04 zile la ks 1.000 (trapezul pe o
      // ora in care cerul se goleste strica si pivnita) si 2,77 la ks 300 (o fractie de 10^-17: (1 − E)/a = 0, fara consum).
      const b: Bazine = { seed: 7, tick: tk, subCer: { valoare: 750, baza: 750 * ks }, incaperi: { valoare: 750, pierderePeTick: 0 }, consumPeTick: OM }
      const za = proiecteaza(b, R).zile
      assert.ok(za >= pivnitaSingura - 1e-9 && za <= 1500 / OM / ZI + 1e-9, `${nume}, amestec, ks ${ks}: ${za} (pivnita singura ${pivnitaSingura})`)
      assert.ok(za <= amestec + 1e-12, `${nume}, amestec, ks ${ks}: ${za} (inainte ${amestec})`)
      amestec = za
      // Si contra modelului de 1 Hz, pana la ks 300 (masurat: |dif| ≤ 0,0012 zile; inainte pana la 1,52).
      if (ks <= 300) {
        const adevar = proiectiaPe1Hz(b) / ZI
        assert.ok(Math.abs(za - adevar) < 0.005, `${nume}, amestec, ks ${ks}: ${za} vs 1 Hz ${adevar}`)
        const bc: Bazine = { ...b, subCer: { valoare: 1500, baza: 1500 * ks }, incaperi: { valoare: 0, pierderePeTick: 0 } }
        const ac = proiectiaPe1Hz(bc) / ZI
        assert.ok(Math.abs(zc - ac) < 0.005, `${nume}, cer, ks ${ks}: ${zc} vs 1 Hz ${ac}`)
      }
    }
  }
})

test('HRANA ECRAN plafonul: un an de calendar („peste un an"), in ambele forme', () => {
  const pe = proiecteaza(subCer(7, 0, 5_000_000, 1), R)
  assert.deepEqual([pe.plafonat, pe.zile], [true, AN / ZI])
  const inc = proiecteaza(inIncapere(5_000_000, 1, 0), R)
  assert.deepEqual([inc.plafonat, inc.zile], [true, AN / ZI])
  assert.equal(textZile(pe.zile, pe.plafonat), 'peste un an')
  // Chiar sub plafon: nu.
  const sub = proiecteaza(inIncapere((AN - ZI) * OM, 1, 0), R)
  assert.equal(sub.plafonat, false)
})

/** Unitatile de mancare (nutritie > 0) ale lumii: pe mormane si in mainile oricui — fara nimic din prognoza.ts. */
function unitatiDeHrana(w: World): number {
  let n = 0
  const it = w.iteme
  for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && (R.nutritie[it.kind[i]!] ?? 0) > 0) n += it.cantitate[i]!
  const a = w.agents
  for (let i = 0; i < a.count; i++) if (a.alive[i] === 1 && a.caraCantitate[i]! > 0 && (R.nutritie[a.caraKind[i]!] ?? 0) > 0) n += a.caraCantitate[i]!
  return n
}

test('HRANA ECRAN oracolul: prognoza contra simularii reale (6 pioni mananca, hrana sub cer se strica), ora cu ora — eroare in ±0,25 zile', () => {
  const seed = 7
  const { w, sit } = laSit(seed, 6)
  let pus = 0
  for (let k = 0; pus < 1380 && k < 400; k++) {
    const x = sit.wx + (k % 10), y = sit.wy + 3 + Math.floor(k / 10)
    if (solid(w, x, y) === null) continue
    const c = Math.min(75, 1380 - pus)
    lasaItem(w, H, c, x, y)
    pus += c
  }
  const prog: [number, number][] = []
  const t0 = w.tick
  let fin = -1
  for (let t = 0; t < 8 * ZI; t++) {
    if (w.tick % ORA === 0) prog.push([w.tick, prognozaHranei(w, R).zile])
    tick(w, R)
    // Adevarul vine din LUME, nu din prognoza.ts (PORTI-3): `stareaHranei` e chiar intrarea prognozei, deci o valoare 0 acolo
    // dadea „0 zile" si „s-a terminat la 20 de tickuri" — eroare −0,0005, verde. Aici: unitatile de hrana ramase. Masurat pe
    // 7 / 42 / 2026: acelasi tick ca „valoarea ≤ 0" (un morman viu are valoare > 0).
    if (w.tick % TPS === 0 && unitatiDeHrana(w) === 0) { fin = w.tick; break }
  }
  // Simularea trebuie sa fi DURAT (masurat: 2,88–2,95 zile, 70–71 de ore prognozate): altfel oracolul compara nimic cu nimic.
  assert.ok(fin > 0 && fin - t0 > 2 * ZI && prog.length >= 48, `hrana trebuie sa se termine dupa peste 2 zile: fin ${fin}, ${prog.length} ore`)
  const erori = prog.map(([t, z]) => z - (fin - t) / ZI)
  // Masurat (seminte 7 / 42 / 2026, aceeasi scena): −0,166 … +0,172 zile; la t = 0, 2,852 prognozate, 2,882–2,947 reale
  // (restul e rezerva de foame a pionilor). Fara alterare ar fi 3,565: prognoza veche gresea cu +0,62…+0,68 zile.
  const min = Math.min(...erori), max = Math.max(...erori)
  assert.ok(min > -0.25 && max < 0.25, `eroarea ${min.toFixed(3)} … ${max.toFixed(3)} pe ${erori.length} ore`)
  assert.ok(Math.abs(erori[0]!) < 0.1, `la t = 0: ${erori[0]}`)
})

// --- 3. starea hranei a lumii ----------------------------------------------------------------------------------------

test('HRANA ECRAN stareaHranei: valoarea pe nutritia efectiva, baza pe unitati, mana la rata 0, incaperea cu T-ul ei, cerul pe 24 h', () => {
  const s = casaTermica()
  const w = s.w
  const comp = compLa(s, 'casa')
  w.temperatura.slot.t[comp] = mcLaQ16(15000)
  const [cx, cy, cz] = s.rep.casa!
  bun(applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 75, wx: cx, wy: cy, z: cz }, R), 'in casa')
  const afara = gasesteSit(w, 99)
  const iCer = w.iteme.laId.get(lasaItem(w, H, 40, afara.wx, afara.wy))!
  // S scris de test: 40 u cu S = 3,5·ONE (valoarea 36,5 u → 600 − ceil(3,5·15) = 547 puncte).
  w.iteme.alterare[iCer] = 3.5 * ONE_ALTERARE
  const iCasa = itemLaCelula(w, cx, cy, cz)
  const st = stareaHranei(w, R)
  assert.equal(st.valoare, 75 * NUT + nutritieEfectiva(40, 3.5 * ONE_ALTERARE, NUT))
  assert.equal(nutritieEfectiva(40, 3.5 * ONE_ALTERARE, NUT), 547)
  assert.deepEqual(st.subCer, { valoare: 547, baza: 40 * NUT })
  assert.equal(st.incaperi.valoare, 75 * NUT)
  assert.equal(st.incaperi.pierderePeTick, (75 * NUT * rataZilnica(R, mcLaQ16(15000))) / ZI)
  const mCasa = st.mormane.find((m) => m.slot === iCasa)!
  const mCer = st.mormane.find((m) => m.slot === iCer)!
  assert.deepEqual([mCasa.loc, mCasa.tQ16, mCasa.rataZi], [comp, mcLaQ16(15000), rataZilnica(R, mcLaQ16(15000))])
  assert.deepEqual([mCer.tQ16, mCer.rataZi], [tAfara(w.seed, w.tick, R), fractiaSubCer(w.seed, w.tick, R, 24)])
  assert.deepEqual(mormanulDeHrana(w, R, iCasa), mCasa, 'inspectorul: aceeasi evaluare ca trecerea')
  // Mana unui om al asezarii: valoare, la rata 0 (mana nu se strica); a unui jefuitor nu hraneste asezarea.
  const om = bun(applyCommand(w, { kind: 'spawnAgent', x: afara.wx * 1000 + 500, y: afara.wy * 1000 + 500, z: afara.g + 1, faction: Faction.ASEZARE }, R), 'om')
  const jef = bun(applyCommand(w, { kind: 'spawnAgent', x: afara.wx * 1000 + 1500, y: afara.wy * 1000 + 500, z: afara.g + 1, faction: Faction.JEFUITOR }, R), 'jefuitor')
  for (const id of [om, jef]) {
    const a = slotOf(w.agents, id)
    w.agents.caraKind[a] = H
    w.agents.caraCantitate[a] = 10
    w.agents.caraAlterare[a] = ONE_ALTERARE
  }
  const st2 = stareaHranei(w, R)
  assert.equal(st2.valoare, st.valoare + nutritieEfectiva(10, ONE_ALTERARE, NUT))
  assert.equal(st2.incaperi.valoare, st.incaperi.valoare + nutritieEfectiva(10, ONE_ALTERARE, NUT), 'mana: bazinul incaperilor')
  assert.equal(st2.subCer.valoare, st.subCer.valoare)
  assert.equal(st2.incaperi.pierderePeTick, st.incaperi.pierderePeTick)
  assert.equal(st2.colonisti, 1)
  assert.equal(st2.consumPeTick, OM)
})

/** Slotul mormanului de pe celula (x, y, z). */
function itemLaCelula(w: World, x: number, y: number, z: number): number {
  for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1 && w.iteme.wx[i] === x && w.iteme.wy[i] === y && w.iteme.z[i] === z) return i
  return -1
}

// --- 4. clasele si inspectorul ---------------------------------------------------------------------------------------

test('HRANA ECRAN clasele dupa rata EFECTIVA: ≤ prag se pastreaza, peste prag sub 0,1%/zi (si banda moarta) aproape, peste — se strica', () => {
  const p = pragAlterare(R)
  assert.equal(clasaLaT(R, p - 5 * Q), Clasa.PASTREAZA)
  assert.equal(clasaLaT(R, p), Clasa.PASTREAZA)
  assert.equal(clasaLaT(R, p + 1), Clasa.APROAPE, 'banda moarta (λ = 0) e peste prag: aproape, nu „se pastreaza"')
  assert.equal(clasaLaT(R, mcLaQ16(5300)), Clasa.APROAPE)
  assert.equal(clasaLaT(R, 377449), Clasa.APROAPE)
  assert.equal(clasaLaT(R, 377450), Clasa.STRICA)
  assert.equal(clasaLaT(R, mcLaQ16(12300)), Clasa.STRICA)
})

test('HRANA ECRAN inspectorul pe hartie, in casa: „Se păstrează | 4,7 °C · cu 0,3 sub prag", „Se păstrează aproape | ~1 la 87 de zile · la 5,3 °C", „Se strică | ~8 pe zi · la 12,3 °C"', () => {
  const s = casaTermica()
  const w = s.w
  const comp = compLa(s, 'casa')
  const [cx, cy, cz] = s.rep.casa!
  bun(applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 75, wx: cx, wy: cy, z: cz }, R), 'morman')
  const slot = itemLaCelula(w, cx, cy, cz)
  const la = (mc: number) => { w.temperatura.slot.t[comp] = mcLaQ16(mc); return alterareaMormanului(w, R, slot)! }
  assert.deepEqual(la(4700), { clasa: Clasa.PASTREAZA, eticheta: 'Se păstrează', valoare: '4,7 °C · cu 0,3 sub prag' })
  assert.deepEqual(la(4980), { clasa: Clasa.PASTREAZA, eticheta: 'Se păstrează', valoare: '5,0 °C · la prag' })
  // 5,3 °C e nodul tabelului: λ = 41; 75 × 41 × 2.016 / 2^29 = 0,01155 pe zi ⇒ una la 86,6 zile.
  assert.deepEqual(la(5300), { clasa: Clasa.APROAPE, eticheta: 'Se păstrează aproape', valoare: '~1 la 87 de zile · la 5,3 °C' })
  // In banda moarta: peste prag, λ = 0.
  assert.deepEqual(la(5010), { clasa: Clasa.APROAPE, eticheta: 'Se păstrează aproape', valoare: 'fără pierdere · la 5,0 °C' })
  // 12,3 °C: λ = 11.536 + ⌊34.611 · 150.733 / 327.680⌋ = 27.457 (interpolat intre 10 si 15 °C); 75 × 27.457 × 2.016 / 2^29 = 7,73.
  assert.equal(lambdaAlterare(R, mcLaQ16(12300)), 11536 + Math.floor((34611 * 150733) / 327680))
  assert.deepEqual(la(12300), { clasa: Clasa.STRICA, eticheta: 'Se strică', valoare: '~8 pe zi · la 12,3 °C' })
  // Cantitatea, pe loc (UI-10), din aceeasi citire.
  assert.deepEqual(mormanPeLoc(w, R, cx, cy, cz - 1)!.cantitate, '75 de hrană')
  // Fara T (stampila nevalida): nu se ghiceste.
  ;(w.temperatura.stampila as { epoca: number }).epoca = -5
  assert.deepEqual(alterareaMormanului(w, R, slot), { clasa: null, eticheta: 'Alterare', valoare: 'nu se știe (eroare internă)' })
})

test('HRANA ECRAN inspectorul sub cer: „~N azi · acum T" = ce se strica DE FAPT in urmatoarele 24 h (simularea, fara pioni), cu T-ul de acum separat', () => {
  // Primavara, ziua 2, 02:00: aerul de acum e la 0,6 °C, dar ziua care vine strica 3,7% (UI-5: cu T-ul de acum, „Se păstrează").
  for (const [nume, tk] of [['toamna 08:00', 0], ['toamna 20:00', tickLa(0, 2, 1, 20)], ['vara 14:00', tickLa(0, 1, 2, 14)], ['primavara 02:00, noaptea', tickLa(0, 0, 2, 2)]] as const) {
    const { w, sit } = laSit(4242, 0)
    w.tick = tk
    const id = lasaItem(w, H, 75, sit.wx + 2, sit.wy + 2)
    const slot = w.iteme.laId.get(id)!
    const a = alterareaMormanului(w, R, slot)!
    const n = 75 * fractiaSubCer(w.seed, w.tick, R, 24)
    const t = tAfara(w.seed, w.tick, R)
    assert.equal(a.valoare, `${textPierdere(n, 'azi', AN / ZI)} · acum ${textZecimi(t)} °C`)
    const inainte = w.hranaStricata
    for (let k = 0; k < ZI; k++) tick(w, R)
    const stricat = w.hranaStricata - inainte
    // Unitatile realizate de simulare in 24 h: in ±1 de „~N azi" (restul de S sub o unitate ramane pe morman).
    assert.ok(Math.abs(stricat - n) <= 1.05, `${nume}: prognozat ${n.toFixed(2)}, stricat ${stricat}`)
    assert.equal(a.clasa, n / 75 < PRAG_APROAPE_ZI ? (n === 0 ? Clasa.PASTREAZA : Clasa.APROAPE) : Clasa.STRICA)
    if (nume.endsWith('noaptea')) {
      assert.ok(t <= pragAlterare(R), `fixtura: aerul de acum sub prag (${t / Q})`)
      assert.equal(a.clasa, Clasa.STRICA, 'clasa e a urmatoarelor 24 h, nu a aerului de acum')
    }
  }
})

// --- 5. textele ------------------------------------------------------------------------------------------------------

test('HRANA ECRAN textele: zile de calendar, pierderea pe zi, F3, ce primeste un depozit', () => {
  assert.deepEqual([3.565, 2.875, 1, 0.99, 0.5, 0.04, 0.01, 12.5, 20, 9.96].map((z) => textZile(z, false)),
    ['~3,6 zile', '~2,9 zile', '~1,0 zile', '~1,0 zile', '~12 ore', '~1 oră', '< 1 oră', '~13 zile', '~20 de zile', '~10 zile'])
  assert.equal(textZile(16, true), 'peste un an')
  assert.equal(textZile(Infinity, false), '—')
  assert.deepEqual([13.4, 0.5, 0.0179, 0.0115, 0.005, 0.0004, 0].map((n) => textPierdere(n, 'azi', 16)),
    ['~13 azi', '~1 azi', '~1 la 56 de zile', '~1 la 87 de zile', '~1 în 13 ani', '~1 în 156 de ani', 'nimic azi'])
  assert.equal(textPierdere(0, 'pe zi', 16), 'fără pierdere')
  assert.equal(textPierdere(1 / 20, 'pe zi', 16), '~1 la 20 de zile')
  assert.equal(textHranaF3(1164, 12, 0.0314), 'stricat 1.164 · în pericol 12 · 3,1%/zi')
  assert.equal(textHranaF3(0, 0, 0), 'stricat 0 · în pericol 0 · 0,0%/zi')
  assert.equal(MASCA_DOAR_HRANA, ((1 << ITEME) - 1) & ~(1 << H))
  assert.deepEqual([0, MASCA_DOAR_HRANA, (1 << ITEME) - 1 & ~((1 << Item.PIATRA) | (1 << Item.PAMANT)), (1 << ITEME) - 1].map((m) => textPrimeste(m, ITEME)),
    ['tot', 'doar hrană', 'piatră și pământ', 'nimic'])
  assert.equal(textFeluri((1 << Item.PIATRA) | (1 << Item.PAMANT) | (1 << Item.LEMN)), 'piatră, pământ și lemn')
})

// --- 6. alerta, bara, un adevar --------------------------------------------------------------------------------------

/** O scena cu doi oameni si mormane de hrana intr-o casa la T-ul dat (Q16). */
function hranaInCasa(mc: number): { w: World; slots: number[] } {
  const s = casaTermica()
  const w = s.w
  w.temperatura.slot.t[compLa(s, 'casa')] = mcLaQ16(mc)
  const [cx, cy, cz] = s.rep.casa!
  const slots: number[] = []
  for (const [dx, q] of [[-1, 30], [0, 75], [1, 50]] as const) {
    bun(applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: q, wx: cx + dx, wy: cy, z: cz }, R), 'morman')
    slots.push(itemLaCelula(w, cx + dx, cy, cz))
  }
  for (const dx of [-1, 1]) bun(applyCommand(w, { kind: 'spawnAgent', x: (cx + dx) * 1000 + 500, y: (cy + 1) * 1000 + 500, z: cz, faction: Faction.ASEZARE }, R), 'om')
  return { w, slots }
}

test('HRANA ECRAN alerta „hrana se strica": N = mormanele peste 0,1%/zi, aprinsa doar la o pierdere medie peste 1%/zi, tinta = mormanul care pierde cel mai mult', () => {
  // 8 °C: λ = 4.153, 1,56%/zi > 1%: aprinsa, N = 3, tinta = mormanul de 75.
  const cald = hranaInCasa(8000)
  const h = hranaEcran(cald.w, R)
  assert.ok(Math.abs(h.pierdereMedie - rataZilnica(R, mcLaQ16(8000))) < 1e-12)
  const a = semnaleAlerte(cald.w, R, null).get('hrana-se-strica')!
  assert.deepEqual([a.activ, a.text], [true, 'Hrana se strică: 3 mormane.'])
  assert.deepEqual(a.tinta, { fel: 'celula', wx: cald.w.iteme.wx[cald.slots[1]!]!, wy: cald.w.iteme.wy[cald.slots[1]!]!, z: cald.w.iteme.z[cald.slots[1]!]! - 1 })
  // 6,5 °C: 0,39%/zi — toate trei „in pericol" (≥ 0,1%/zi), dar media sub 1%: stinsa.
  const caldut = hranaInCasa(6500)
  assert.equal(hranaEcran(caldut.w, R).pericol, 3)
  assert.equal(semnaleAlerte(caldut.w, R, null).get('hrana-se-strica')!.activ, false)
  // 5,3 °C (aproape) si 4 °C: N = 0, stinsa.
  for (const mc of [5300, 4000]) {
    const r = hranaInCasa(mc)
    assert.equal(hranaEcran(r.w, R).pericol, 0, `${mc}`)
    assert.equal(semnaleAlerte(r.w, R, null).get('hrana-se-strica')!.activ, false, `${mc}`)
  }
})

test('HRANA ECRAN cheia listei de alerte e pe id-uri: textul (N care curge) nu reface lista; alt set de alerte, da', () => {
  const st = (id: string, text: string): StareAlerta => ({ id, severitate: 1, adevaratDeLa: 0, afisata: true, racitaPanaLa: -1, semnal: { activ: true, text, tinta: null } })
  const a = [st('hrana-se-strica', 'Hrana se strică: 19 mormane.'), st('fara-depozit', 'Un morman nu încape în depozite. Mărește-le.')]
  const b = [st('hrana-se-strica', 'Hrana se strică: 18 mormane.'), st('fara-depozit', '2 mormane nu încap în depozite. Mărește-le.')]
  assert.equal(cheieListei(a), cheieListei(b))
  assert.notEqual(cheieListei(a), cheieListei([a[0]!]))
  assert.notEqual(cheieListei(a), cheieListei([a[1]!, a[0]!]))
})

test('HRANA ECRAN bara si „hrana-scade": aceeasi prognoza, in zile, pragurile 0,893 / 0,298 (UI-14)', () => {
  const p = (zile: number, plafonat = false) => ({ puncte: 1, consumPeZi: 1, zile, plafonat, zileFaraAlterare: zile, plafonatFaraAlterare: plafonat })
  assert.deepEqual([0.2, 0.297, 0.298, 0.5, 0.892, 0.893, 3, 16].map((z) => clasaPrognozei(p(z))), ['critic', 'critic', 'atentie', 'atentie', 'atentie', '', '', ''])
  assert.equal(clasaPrognozei(p(16, true)), '')
  assert.equal(clasaPrognozei({ ...p(0.1), puncte: 0 }), '', 'fara hrana: alerta critica spune tot')
  assert.deepEqual([PRAG_ATENTIE_ZILE, PRAG_CRITIC_ZILE], [0.893, 0.298])
  // 12 oameni: 150 de hrana ⇒ 0,19 zile (aprinsa), 400 ⇒ ~0,5 (stinsa); textul in aceeasi unitate ca bara.
  for (const [hrana, activ] of [[150, true], [400, false]] as const) {
    const { w, sit } = laSit(2024, 12)
    let pus = 0
    for (let k = 0; pus < hrana; k++) { const c = Math.min(75, hrana - pus); lasaItem(w, H, c, sit.wx + k, sit.wy + 4); pus += c }
    const r = rezumatColonie(w, R)
    const s = semnaleAlerte(w, R, null).get('hrana-scade')!
    assert.equal(s.activ, activ, `${hrana}: ${r.hrana.zile}`)
    if (activ) assert.equal(s.text, `Hrana ajunge ${textPrognozaBara(r.hrana)} și nu se poate produce încă. După aceea oamenii pleacă.`)
  }
})

test('HRANA ECRAN un adevar, patru cititori: bara, Primii pasi, „hrana-scade" si dialogul Joc nou pe aceeasi proiectie', () => {
  const seed = 7
  const { w, sit } = laSit(seed, 12)
  let pus = 0
  for (let k = 0; pus < 2760 && k < 400; k++) {
    const x = sit.wx + (k % 10), y = sit.wy + 3 + Math.floor(k / 10)
    if (solid(w, x, y) === null) continue
    const c = Math.min(75, 2760 - pus)
    lasaItem(w, H, c, x, y)
    pus += c
  }
  const h = hranaEcran(w, R)
  // Dialogul (fara lume): toata hrana sub cer, la tickul 0 — EXACT aceleasi bazine, deci aceeasi zi.
  const d = prognozaJocNou(R, seed, 12, 2760)
  assert.equal(d.subCer.zile, h.prognoza.zile)
  assert.equal(d.inCamara.zile, h.prognoza.zileFaraAlterare)
  assert.equal(d.text, `Hrana ajunge ${textZile(h.prognoza.zile, false)} de joc dacă stă sub cer, ${textZile(h.prognoza.zileFaraAlterare, false)} într-o cămară. Hrana nu se poate produce încă: după aceea oamenii pleacă.`)
  assert.equal(d.text.startsWith('Hrana ajunge ~2,9 zile de joc dacă stă sub cer, ~3,6 zile într-o cămară'), true, d.text)
  // Bara si Primii pasi.
  assert.equal(rezumatColonie(w, R).hrana.zile, h.prognoza.zile)
  assert.equal(textPrognozaBara(h.prognoza), '~2,9 zile')
  assert.equal(textPasulCamarii(R, 12, 230, h.prognoza), 'Cămară: Zone (K) ▸ Cămară în pivniță (sub 5 °C), ~37 de celule — hrana ține ~3,6 zile, nu ~2,9')
  assert.equal(textPasiHrana(h.prognoza), '')
  assert.equal(textPasiHrana({ ...h.prognoza, puncte: 0 }), 'Nu mai ai hrană: în versiunea asta nu se poate produce.')
  assert.equal(h.prognoza.zileFaraAlterare, prognozaFaraAlterare(h.stare, R).zile)
})

// --- 7. camara -------------------------------------------------------------------------------------------------------

test('HRANA ECRAN presetul Cămară: pictura si filtrul „doar hrană" in ACELASI pas (aplicaZona), fara niciun tick; un refuz nu trimite filtrul', () => {
  const { w, sit } = laSit(4242, 1)
  const c = patratPlat(w, sit, 3, 4, 12)!
  const g = solid(w, c.x0, c.y0)!
  const trimise: Command[] = []
  const t0 = w.tick
  const r = aplicaZona((cmd) => { trimise.push(cmd); return applyCommand(w, cmd, R) }, [{ x0: c.x0, y0: c.y0, x1: c.x0 + 2, y1: c.y0 + 2, z: g + 1 }], Zona.DEPOZIT, MASCA_DOAR_HRANA)
  assert.ok(r.zonaId !== null)
  assert.deepEqual(trimise.map((x) => x.kind), ['picteazaZona', 'setFiltruZona'])
  assert.equal(w.tick, t0)
  const zs = slotZona(w.zone, r.zonaId!)
  assert.equal(w.zone.refuzate[zs], MASCA_DOAR_HRANA)
  assert.equal(esteCamara(w, zs), true)
  // Capacitatea in oameni (J-11): 9 celule × 75 / 230 = 2.
  assert.equal(capacitateCamara(w, R, zs, 230), 2)
  // Un depozit general (filtru 0): o singura comanda.
  const d = patratPlat(w, sit, 2, 14, 30)!
  const trimise2: Command[] = []
  const r2 = aplicaZona((cmd) => { trimise2.push(cmd); return applyCommand(w, cmd, R) }, [{ x0: d.x0, y0: d.y0, x1: d.x0 + 1, y1: d.y0 + 1, z: d.g + 1 }], Zona.DEPOZIT, 0)
  assert.deepEqual(trimise2.map((x) => x.kind), ['picteazaZona'])
  assert.equal(esteCamara(w, slotZona(w.zone, r2.zonaId!)), false)
  // Pictura refuzata (in aer): niciun filtru trimis (id-ul n-ar fi fost al nimanui).
  const trimise3: Command[] = []
  const r3 = aplicaZona((cmd) => { trimise3.push(cmd); return applyCommand(w, cmd, R) }, [{ x0: c.x0, y0: c.y0, x1: c.x0, y1: c.y0, z: g + 9 }], Zona.DEPOZIT, MASCA_DOAR_HRANA)
  assert.equal(r3.zonaId, null)
  assert.deepEqual(trimise3.map((x) => x.kind), ['picteazaZona'])
  assert.equal(r3.refuzuri.length, 1)
})

test('HRANA ECRAN „Se strică aici; cămara are loc": doar pe hrana care se strica intr-un depozit pe care caraușii nu-l golesc spre camara', () => {
  const { w, sit } = laSit(4242, 1)
  const d = patratPlat(w, sit, 2, 4, 12)!
  const c = patratPlat(w, sit, 3, 14, 30)!
  const general = picteaza(w, d.x0, d.y0, 2, 4)
  const id = lasaItem(w, H, 75, d.x0, d.y0)
  const slot = w.iteme.laId.get(id)!
  const insp = () => inspecteazaCelula(w, R, d.x0, d.y0, w.iteme.z[slot]! - 1, null).morman!.stare
  assert.equal(insp().titlu, 'În depozit.', 'fara camara')
  const camara = picteaza(w, c.x0, c.y0, 3, 3)
  bun(applyCommand(w, { kind: 'setFiltruZona', id: camara, refuzate: MASCA_DOAR_HRANA }, R), 'filtrul')
  // Sub cer, toamna: se strica (17%/24 h); camara 3 (rang 7) ≤ generalul 4 (rang 8): caraușii n-o muta.
  assert.equal(clasaMormanului(R, mormanulDeHrana(w, R, slot)!), Clasa.STRICA)
  assert.deepEqual(insp(), { titlu: 'Se strică aici; cămara are loc.', actiune: 'Ridică prioritatea cămării peste a depozitului ăstuia (cămara 3, aici 4).' })
  // Camara la 4 (rang 9 > 8): caraușii o duc singuri — „În depozit.".
  bun(applyCommand(w, { kind: 'setPrioritateZona', id: camara, prioritate: 4 }, R), 'prioritatea')
  assert.equal(insp().titlu, 'În depozit.')
  // Iarna, cand aerul nu trece de prag 24 h: hrana nu se strica, deci niciun sfat.
  bun(applyCommand(w, { kind: 'setPrioritateZona', id: camara, prioritate: 3 }, R), 'prioritatea')
  assert.equal(insp().titlu, 'Se strică aici; cămara are loc.')
  const t0 = w.tick
  // Cautarea are PLAFON, un an (PORTI-5): o clima fara nicio zi de iarna sub prag ar fi facut-o infinita.
  const iarna0 = tickLa(0, 3, 1, 0)
  let iarna = iarna0
  for (; iarna < iarna0 + AN && fractiaSubCer(w.seed, iarna, R, 24) > 0; iarna += ORA) { /* cauta fereastra */ }
  assert.ok(iarna < iarna0 + AN, 'fixtura: un an are 24 h fara pierdere sub cer')
  w.tick = iarna
  assert.equal(clasaMormanului(R, mormanulDeHrana(w, R, slot)!), Clasa.PASTREAZA)
  assert.equal(insp().titlu, 'În depozit.', 'iarna: se pastreaza')
  w.tick = t0
  // Camara plina: nu mai are loc.
  for (let k = 0; k < 9; k++) lasaItem(w, H, 75, c.x0 + (k % 3), c.y0 + Math.floor(k / 3))
  assert.equal(insp().titlu, 'În depozit.')
  void general
  // Hrana care se strica IN camara (o camara de suprafata, toamna), cu loc in ea: camara nu-si e singura sfat (PORTI-4) —
  // fara `faraZs`, ea insasi „are loc" la rangul locului (7 ≤ 7) si inspectorul cerea „Ridică prioritatea cămării peste a
  // depozitului ăstuia (cămara 3, aici 3)".
  const s2 = laSit(4242, 1)
  const c2 = patratPlat(s2.w, s2.sit, 3, 14, 30)!
  const cam2 = picteaza(s2.w, c2.x0, c2.y0, 3, 3)
  bun(applyCommand(s2.w, { kind: 'setFiltruZona', id: cam2, refuzate: MASCA_DOAR_HRANA }, R), 'filtrul')
  const slot2 = s2.w.iteme.laId.get(lasaItem(s2.w, H, 75, c2.x0, c2.y0))!
  assert.equal(clasaMormanului(R, mormanulDeHrana(s2.w, R, slot2)!), Clasa.STRICA, 'sub cer, toamna: se strica')
  assert.deepEqual(inspecteazaCelula(s2.w, R, c2.x0, c2.y0, s2.w.iteme.z[slot2]! - 1, null).morman!.stare, { titlu: 'În depozit.', actiune: '' }, 'in camara: niciun sfat spre ea insasi')
})

test('HRANA ECRAN groapa de moloz dintr-un clic: locul langa camara, filtrul gropii, avertismentul si cauza pe moloz cu cifrele; dupa groapa, nimic', () => {
  const { w, sit } = laSit(4242, 1)
  const c = patratPlat(w, sit, 4, 4, 12)!
  const g = patratPlat(w, sit, 1, 14, 30)!
  const camara = picteaza(w, c.x0, c.y0, 4)
  bun(applyCommand(w, { kind: 'setFiltruZona', id: camara, refuzate: MASCA_DOAR_HRANA }, R), 'filtrul')
  // Un depozit general de o celula, plin de piatra: piatra e primita undeva, dar nu mai are loc.
  picteaza(w, g.x0, g.y0, 1)
  lasaItem(w, Item.PIATRA, 75, g.x0, g.y0)
  for (let k = 0; k < 3; k++) lasaItem(w, Item.PIATRA, 75, c.x0 + k, c.y0)
  const pm = lasaItem(w, Item.PAMANT, 60, c.x0 + 3, c.y0)
  const gr = groapaDeMoloz(w, R, camara)!
  assert.deepEqual([gr.unitati, gr.loc, gr.lipsa, gr.lipsaCelule, gr.latura], [285, 0, 285, 4, 3])
  // Cauza pe mormanul de piatra din camara: cifrele gropii.
  const iP = itemLaCelula(w, c.x0, c.y0, c.g + 1)
  const stare = inspecteazaCelula(w, R, c.x0, c.y0, c.g, null).morman!.stare
  assert.deepEqual(stare, { titlu: 'Cămara nu primește piatră, iar în depozite nu mai e loc: lipsesc 285 (4 celule).', actiune: 'Pictează groapa de moloz din inspectorul cămării, sau mărește un depozit.' })
  void iP
  // Locul: un patrat 3 × 3 liber, pe suprafata, langa camara, unde se poate picta. O zona (un pat) pusa in primul patrat al
  // cautarii il scoate din joc: groapa nu se picteaza peste alta zona.
  const primul = locGroapa(w, R, camara, gr.latura)!
  bun(applyCommand(w, { kind: 'picteazaZona', x0: primul.x0 + 1, y0: primul.y0 + 1, x1: primul.x0 + 1, y1: primul.y0 + 1, z: primul.z, fel: Zona.DORMIT }, R), 'patul')
  const loc = locGroapa(w, R, camara, gr.latura)!
  assert.ok(loc)
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    assert.equal(suprafataColoanei(w, loc.x0 + dx, loc.y0 + dy), loc.z - 1)
    assert.ok(celulaDeZonaPosibila(w.terrain, loc.x0 + dx, loc.y0 + dy, loc.z, R))
    assert.equal(celulaDeZonaLa(w.zone, loc.x0 + dx, loc.y0 + dy, loc.z), -1)
  }
  const dist = Math.max(c.x0 - (loc.x0 + 2), loc.x0 - (c.x0 + 3), c.y0 - (loc.y0 + 2), loc.y0 - (c.y0 + 3))
  assert.equal(dist, 1, 'primul inel: lipit de camara')
  const r = aplicaZona((cmd) => applyCommand(w, cmd, R), [{ x0: loc.x0, y0: loc.y0, x1: loc.x0 + 2, y1: loc.y0 + 2, z: loc.z }], Zona.DEPOZIT, gr.refuzate)
  const zs = slotZona(w.zone, r.zonaId!)
  assert.equal(textPrimeste(w.zone.refuzate[zs]!, ITEME), 'piatră și pământ')
  const dupa = groapaDeMoloz(w, R, camara)!
  assert.deepEqual([dupa.lipsa, dupa.propusa], [0, 0])
  assert.notEqual(inspecteazaCelula(w, R, c.x0, c.y0, c.g, null).morman!.stare.titlu.slice(0, 6), 'Cămara')
  void pm
  // Geometria CANONICA (H4), fara pioni: pivnita sub o casa. Primul patrat „pe suprafata" de langa camara e acoperisul casei
  // (z = g + 4), unde nu ajunge niciun caraus — butonul il alegea, propunerea disparea, molozul ramanea (JOC-1, JOC-2). Locul
  // trebuie sa fie pe sol (z = g + 1), in afara casei.
  const h = casaCuPivnita(1)
  const gh = groapaDeMoloz(h.w, R, h.camara)!
  assert.deepEqual([gh.unitati, gh.loc, gh.latura], [170, 0, 3], 'fixtura: molozul pivnitei n-are loc in generalul plin')
  const lh = locGroapa(h.w, R, h.camara, gh.latura)
  assert.ok(lh !== null, 'un loc langa pivnita')
  assert.equal(lh.z, h.g + 1, `groapa pe sol, nu pe acoperis: ${JSON.stringify({ dx: lh.x0 - h.hx, dy: lh.y0 - h.hy, dz: lh.z - h.g })}`)
  const peste = lh.x0 + gh.latura > h.hx && lh.x0 < h.hx + 7 && lh.y0 + gh.latura > h.hy && lh.y0 < h.hy + 7
  assert.equal(peste, false, 'in afara amprentei casei')
})

/**
 * Geometria H4 fara pioni (copia fixturii `camaraCuOameni` din camara.test.ts, cu sapatul gata): casa de piatra 7×7 (usa pe
 * sud, acoperis la g + 3), pivnita 3×3×2 sub ea cu chepengul (doua usi in podea), camara „doar hrana" pe fundul pivnitei cu
 * molozul sapaturii (170 de pamant), depozitul general 3×3 plin de piatra.
 */
function casaCuPivnita(seed: number): { w: World; hx: number; hy: number; g: number; camara: number } {
  const P = Material.PIATRA_CONSTRUITA
  const { w, wx, wy, g } = sitPlat(seed, 30)
  const hx = wx + 12, hy = wy + 12
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
    if (dx !== 0 && dx !== 6 && dy !== 0 && dy !== 6) continue
    bun(fill(w.terrain, hx + dx, hy + dy, z, dx === 3 && dy === 0 ? Material.USA : P), 'perete')
  }
  for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) bun(fill(w.terrain, hx + dx, hy + dy, g + 3, P), 'acoperis')
  const sapa: [number, number, number][] = [[hx + 5, hy + 2, g], [hx + 4, hy + 2, g], [hx + 4, hy + 2, g - 1]]
  for (const z of [g - 1, g - 2]) for (let dx = 2; dx <= 4; dx++) for (let dy = 3; dy <= 5; dy++) sapa.push([hx + dx, hy + dy, z])
  for (const [x, y, z] of sapa) bun(dig(w.terrain, x, y, z), 'sapatul')
  for (const [x, y] of [[hx + 5, hy + 2], [hx + 4, hy + 2]] as const) bun(fill(w.terrain, x, y, g, Material.USA), 'chepengul')
  bun(sincronizeazaLumea(w, R), 'sincronizarea')
  bun(applyCommand(w, { kind: 'picteazaZona', x0: hx - 14, y0: hy, x1: hx - 12, y1: hy + 2, z: g + 1 }, R), 'depozitul general')
  for (let k = 0; k < 9; k++) bun(applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: 75, wx: hx - 14 + (k % 3), wy: hy + Math.floor(k / 3), z: g + 1 }, R), 'piatra in general')
  const camara = bun(applyCommand(w, { kind: 'picteazaZona', x0: hx + 2, y0: hy + 3, x1: hx + 4, y1: hy + 5, z: g - 2 }, R), 'camara')
  bun(applyCommand(w, { kind: 'setFiltruZona', id: camara, refuzate: MASCA_DOAR_HRANA }, R), 'filtrul')
  for (const [k, q] of [[0, 75], [1, 75], [2, 20]] as const) bun(applyCommand(w, { kind: 'lasaItem', fel: Item.PAMANT, cantitate: q, wx: hx + 2 + k, wy: hy + 3, z: g - 2 }, R), 'molozul')
  return { w, hx, hy, g, camara }
}

// --- 8. harta U, memoria, cheia --------------------------------------------------------------------------------------

test('HRANA ECRAN harta U: puncte pe ≤ prag, slabe pe „aproape", niciunul peste; clasa urmeaza T-ul din stare', () => {
  const s = casaTermica()
  const w = s.w
  const comp = compLa(s, 'casa')
  const o = createTemperaturaOverlay()
  o.visible = true
  const z = s.rep.casa![2]
  const alfa = (): number[] => {
    const mp = o.group.getObjectByName(NUME_PUNCTE) as THREE.Mesh
    const a = mp.geometry.getAttribute('color').array as Float32Array
    const i = Array.from(o.quadComp).indexOf(comp)
    return [0, 1, 2, 3, 4, 5].map((k) => a[(i * 6 + k) * 4 + 3]!)
  }
  for (const [mc, clasa] of [[4000, Clasa.PASTREAZA], [5300, Clasa.APROAPE], [12000, Clasa.STRICA], [5000, Clasa.PASTREAZA]] as const) {
    w.temperatura.slot.t[comp] = mcLaQ16(mc)
    actualizeazaTemperaturaOverlay(o, w, R, z)
    assert.equal(o.clase.get(comp), clasa, `${mc}`)
    // Pe hartie: punct plin, punct slab, niciun punct (nu din constanta modulului, care s-ar strica odata cu el).
    assert.deepEqual(alfa(), new Array(6).fill(Math.fround([1, 0.45, 0][clasa]!)), `${mc}: alfa punctelor`)
    assert.equal(ALFA_PUNCT[clasa], [1, 0.45, 0][clasa])
    assert.equal(o.puncte[clasa], 1)
  }
  // Contrastul punctului cu tenta: inchis pe deschis, deschis pe inchis.
  assert.deepEqual(culoarePunct([1, 0.91, 0.72]), PUNCT_INCHIS)
  assert.deepEqual(culoarePunct([0.1, 0.15, 0.32]), PUNCT_DESCHIS)
})

test('HRANA ECRAN memoria hranei: o trecere pe secunda de joc, refacuta la o comanda in pauza (un morman nou)', () => {
  const { w, sit } = laSit(4242, 2)
  lasaItem(w, H, 75, sit.wx + 2, sit.wy + 3)
  const m = creeazaMemorieHrana()
  const a = m.ia(w, R)
  assert.equal(m.ia(w, R), a)
  assert.equal(m.calcule(), 1)
  lasaItem(w, H, 30, sit.wx + 3, sit.wy + 3)
  const b = m.ia(w, R)
  assert.notEqual(b, a)
  assert.equal(b.stare.valoare, 105 * NUT)
  // Tickurile din aceeasi secunda de joc refolosesc trecerea; secunda urmatoare o reface.
  for (let k = 0; k < TPS - 1; k++) { tick(w, R); m.ia(w, R) }
  assert.equal(m.calcule(), 2)
  tick(w, R)
  m.ia(w, R)
  assert.equal(m.calcule(), 3)
})

test('HRANA ECRAN cheia inspectorului: cantitatea mormanului si masca filtrului nu intra (scrise pe loc, UI-10)', () => {
  const { w, sit } = laSit(4242, 1)
  const d = patratPlat(w, sit, 2, 4, 12)!
  const zona = picteaza(w, d.x0, d.y0, 2)
  const id = lasaItem(w, H, 75, d.x0, d.y0)
  const slot = w.iteme.laId.get(id)!
  const usi = { lipsa: [], desemnata: false }
  const cheie = () => cheieInspectorCelula(inspecteazaCelula(w, R, d.x0, d.y0, d.g, null), 1, usi)
  const k0 = cheie()
  w.iteme.cantitate[slot] = 74
  assert.equal(cheie(), k0, 'cantitatea scade singura (se strica): nu reface corpul')
  assert.equal(mormanPeLoc(w, R, d.x0, d.y0, d.g)!.cantitate, '74 de hrană', 'dar se scrie pe loc')
  bun(applyCommand(w, { kind: 'setFiltruZona', id: zona, refuzate: MASCA_DOAR_HRANA }, R), 'filtrul')
  assert.equal(inspecteazaCelula(w, R, d.x0, d.y0, d.g, null).zona!.refuzate, MASCA_DOAR_HRANA)
  assert.equal(cheie(), k0, 'masca: comutatorul se scrie pe loc')
  bun(applyCommand(w, { kind: 'setPrioritateZona', id: zona, prioritate: 4 }, R), 'prioritatea')
  assert.notEqual(cheie(), k0, 'prioritatea ramane in cheie (butoanele ei se refac)')
})

test('HRANA ECRAN F3 si tooltip-ul: aceeasi trecere — stricat (salvat), in pericol, pierderea medie', () => {
  const cald = hranaInCasa(8000)
  cald.w.hranaStricata = 1164
  const h = hranaEcran(cald.w, R)
  assert.equal(textHranaF3(cald.w.hranaStricata, h.pericol, h.pierdereMedie), `stricat 1.164 · în pericol 3 · ${(Math.round(rataZilnica(R, mcLaQ16(8000)) * 1000) / 10).toFixed(1).replace('.', ',')}%/zi`)
  void componentaLa
})
