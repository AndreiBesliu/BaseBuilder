/**
 * Capacitatea încăperilor — S24-27 t.2b, commit-ul 1 (research/temperatura-t2b.md §4).
 *
 * Trei feluri de probe. CONTOARELE pe hârtie și față de o numărătoare independentă (materialAt + groundLevelM +
 * bazaVoxeli, nu cititorul camerelor): masa unei fețe ține de prima celulă de pe normală. ORACOLUL: contoarele
 * ținute la zi == recalculul, după fiecare lot (forma canonică a fețelor le poartă). CALIBRAREA: τ_loc = C/ΣG pe
 * scenele numite și valul de frig pe benzi, pe modelul în FLOAT (tests/fixturi-temperatura.ts) — pasul pe
 * întregi vine în commit-ul 4, care re-ancorează testele pe el.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RULES, parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { Anotimp, momentul, panaLaAnotimp, tickuriPeAn } from '../src/sim/calendar.ts'
import { ziuaValului } from '../src/sim/clima.ts'
import type { Componenta } from '../src/sim/camere.ts'
import { celuleComponentei, componentaLa, construiesteCamere, decodeazaCelula, listaComponente, sincronizeazaCamere } from '../src/sim/camere.ts'
import type { ContoareMasa } from '../src/sim/fete.ts'
import { capacitateMu, contoareComponentei, D_SOL_MASIV_IMPLICIT, formaCanonicaFete, formaCanonicaFeteRecalculata } from '../src/sim/fete.ts'
import { decode, encode } from '../src/sim/save.ts'
import { regimPermanent, temperaturiRezervoare } from '../src/sim/termic.ts'
import type { World } from '../src/sim/state.ts'
import { eSolNatural, Material } from '../src/sim/terrain/chunk.ts'
import { bazaVoxeli, dig, fill, groundLevelM, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { createWorld } from '../src/sim/world.ts'
import type { CasaTermica } from './fixturi-temperatura.ts'
import { capacitateaComponentei, casaTermica, compLa, modelFloat, pasExp, Q16, tauLoc } from './fixturi-temperatura.ts'

const R = DEFAULT_RULES
const P = Material.PIATRA_CONSTRUITA
const ORA = 3600
const ZI = 86400

/** Contoarele componentei celulei (x, y, z), din index. */
function contoare(w: World, x: number, y: number, z: number): ContoareMasa {
  const c = componentaLa(w.camere, x, y, z)
  assert.ok(c, `(${x},${y},${z}) nu e aer acoperit`)
  const n = contoareComponentei(w.camere, c!)
  assert.ok(n.ok, JSON.stringify(n))
  return { nAer: n.value.nAer, nConstr: n.value.nConstr, nSolMasiv: n.value.nSolMasiv, nApa: n.value.nApa }
}

/**
 * Numărătoarea INDEPENDENTĂ a componentei (design §4, din materialAt și din heightfield): fiecare celulă, apoi
 * cei 6 vecini — sub baza ferestrei și în afara lumii stâncă (ROCA, în afara lumii adâncă), aerul n-are masă.
 */
function numaraIndependent(w: World, c: Componenta, dSolMasiv: number): ContoareMasa {
  const t = w.terrain
  const n = { nAer: 0, nConstr: 0, nSolMasiv: 0, nApa: 0 }
  const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const
  for (const kc of celuleComponentei(w.camere, c)) {
    n.nAer++
    const p = decodeazaCelula(kc)
    for (const [dx, dy, dz] of D6) {
      const x = p.x + dx, y = p.y + dy, z = p.z + dz
      const afara = x < 0 || y < 0 || x >= WORLD_CELLS || y >= WORLD_CELLS
      let m: number
      let d: number
      if (afara) {
        m = Material.ROCA
        d = 64
      } else {
        const g = groundLevelM(t, x, y)
        assert.ok(g.ok)
        d = Math.max(0, Math.min(64, g.value - z))
        if (z < bazaVoxeli(t, x, y)) m = Material.ROCA
        else {
          const mm = materialAt(t, x, y, z)
          assert.ok(mm.ok)
          m = mm.value
        }
      }
      if (m === Material.AER) continue
      if (m === Material.APA) n.nApa++
      else if (eSolNatural(m) && d >= dSolMasiv) n.nSolMasiv++
      else n.nConstr++
    }
  }
  return n
}

/** Toate componentele lumii: contoarele indexului == numărătoarea independentă. */
function egalCuNumaratoarea(w: World, dSolMasiv: number, mesaj: string): void {
  for (const c of listaComponente(w.camere)) {
    const n = contoareComponentei(w.camere, c)
    assert.ok(n.ok)
    assert.deepEqual({ ...n.value }, numaraIndependent(w, c, dSolMasiv), `${mesaj}: componenta ${c.ancora}`)
  }
}

/** Cache-ul de fețe (cu contoarele) == recalculul complet; indexul == un index nou. */
function egalCuRecalculul(w: World, mesaj: string): void {
  assert.deepEqual(formaCanonicaFete(w.camere), formaCanonicaFeteRecalculata(w.camere, w.terrain), mesaj)
}

// --- contoarele, pe hârtie ------------------------------------------------------------

test('CAPACITATE pe hartie: casa de piatra 5x5x2 cu usa — 50 de celule de aer si 90 de fete cu masa constructiei (65 de pereti, usa si acoperis + 25 de podea IARBA la d 0, stratul de suprafata), C\' = 50·16 + 90·238 = 22.220 μ', () => {
  const s = casaTermica()
  const [x, y, z] = s.rep.casa!
  assert.deepEqual(contoare(s.w, x, y, z), { nAer: 50, nConstr: 90, nSolMasiv: 0, nApa: 0 })
  assert.deepEqual(R.termic.mase, { aer: 16, constr: 238, sol: 3967 })
  assert.equal(capacitateaComponentei(s.w, compLa(s, 'casa'), R), 50 * 16 + 90 * 238)
  egalCuNumaratoarea(s.w, R.termic.dSolMasivM, 'casa')
})

test('CAPACITATE pe hartie: pivnita 5x5x2 sub IARBA — tavanul (25, IARBA la d 0) are masa constructiei, peretii PAMANT (d 1, 2) si podeaua ROCA (d 3) sunt sol masiv; forma canonica a fetelor poarta contoarele pe bucata', () => {
  // Scena din fete.test.ts (seed 20260913, colțul 10136,9070, sol natural la −7).
  const w = createWorld(20260913)
  const t = w.terrain
  const x = 10136, y = 9070, g = -7
  for (let j = 1; j < 6; j++) for (let i = 1; i < 6; i++) for (let dz = 1; dz <= 2; dz++) assert.ok(dig(t, x + i, y + j, g - dz).ok)
  sincronizeazaCamere(w.camere, t)
  assert.deepEqual(contoare(w, x + 3, y + 3, g - 1), { nAer: 50, nConstr: 25, nSolMasiv: 65, nApa: 0 })
  egalCuNumaratoarea(w, R.termic.dSolMasivM, 'pivnita sub iarba')
  // Forma canonică poartă contoarele, o linie pe bucată (pivnița trece peste granița unui bloc: 4 bucăți). Suma lor
  // pe cele două niveluri: sus 25 de celule, tavanul 25 la suprafață și pereții la d 1; jos 25, pereții la d 2 și
  // podeaua la d 3.
  const forma = formaCanonicaFete(w.camere)
  const peNivel = new Map<number, number[]>()
  for (const l of forma) {
    const m = /^(\d+)\|a(\d+) c(\d+) s(\d+) w(\d+)\|/.exec(l)
    assert.ok(m, `linia nu poarta contoarele: ${l}`)
    const z = decodeazaCelula(Number(m![1])).z
    const v = peNivel.get(z) ?? [0, 0, 0, 0]
    for (let k = 0; k < 4; k++) v[k] = v[k]! + Number(m![k + 2])
    peNivel.set(z, v)
  }
  assert.deepEqual([...peNivel].sort((p, q) => q[0] - p[0]), [[g - 1, [25, 25, 20, 0]], [g - 2, [25, 0, 45, 0]]])
  egalCuRecalculul(w, 'pivnita sub iarba')
})

test('CAPACITATE pe hartie: pivnita 3x3x2 sapata direct sub apa — cele 9 fete de sus au masa apei (nApa), restul e sol', () => {
  // Scena din fete.test.ts (seed 4242, 7816,7816): suprafața e APA la −40.
  const w = createWorld(4242)
  const t = w.terrain
  const x = 244 * 32 + 8, y = 244 * 32 + 8
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) for (let dz = 1; dz <= 2; dz++) assert.ok(dig(t, x + i, y + j, -40 - dz).ok)
  sincronizeazaCamere(w.camere, t)
  const n = contoare(w, x + 1, y + 1, -41)
  assert.equal(n.nAer, 18)
  assert.equal(n.nApa, 9)
  assert.equal(n.nConstr + n.nSolMasiv, 24 + 9, 'pereții (24) și podeaua (9)')
  egalCuNumaratoarea(w, R.termic.dSolMasivM, 'pivnita sub apa')
})

test('CAPACITATE pe hartie: convenția camerelor — sub baza ferestrei e stanca masiva (camera de la baza a doua chunk-uri), iar dincolo de marginea lumii stanca e adanca (d 64)', () => {
  // Scena din fete.test.ts: granița cx 300|301 (baze −30 | −21), camera 6×6×3 de la baza mai înaltă; 18 fețe JOS
  // dau sub bază (materialAt spune AER acolo).
  const w = createWorld(20260913)
  const t = w.terrain
  const b = bazaVoxeli(t, 301 * 32, 296 * 32)
  assert.equal(b, -21)
  const x0 = 301 * 32 - 3, y0 = 296 * 32 + 10
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) for (let dz = 0; dz < 3; dz++) assert.ok(dig(t, x0 + i, y0 + j, b + dz).ok)
  // Pivnița de la marginea de vest (x = 0), seed 12345 — altă lume.
  const w2 = createWorld(12345)
  for (let x = 0; x <= 2; x++) for (let y = 323; y <= 325; y++) for (const z of [-22, -21]) assert.ok(dig(w2.terrain, x, y, z).ok)
  for (const lume of [w, w2]) sincronizeazaCamere(lume.camere, lume.terrain)
  const baza = contoare(w, x0, y0, b)
  assert.equal(baza.nAer, 108)
  egalCuNumaratoarea(w, R.termic.dSolMasivM, 'baza ferestrei')
  const margine = contoare(w2, 1, 324, -21)
  assert.equal(margine.nAer, 18)
  egalCuNumaratoarea(w2, R.termic.dSolMasivM, 'marginea lumii')
})

test('CAPACITATE dSolMasivM vine din content: createWorld si decode construiesc indexul cu el; cu dSolMasivM 3, peretii pivnitei de sub IARBA (d 1, 2) au masa constructiei', () => {
  assert.equal(D_SOL_MASIV_IMPLICIT, R.termic.dSolMasivM, 'implicitul e numarul din content, nu o copie')
  const R3: Rules = { ...R, termic: { ...R.termic, dSolMasivM: 3 } }
  assert.ok(parseRules(R3).ok)
  const lumi = [createWorld(20260913), createWorld(20260913, R3)]
  const x = 10136, y = 9070, g = -7
  for (const w of lumi) {
    for (let j = 1; j < 6; j++) for (let i = 1; i < 6; i++) for (let dz = 1; dz <= 2; dz++) assert.ok(dig(w.terrain, x + i, y + j, g - dz).ok)
    sincronizeazaCamere(w.camere, w.terrain)
  }
  assert.equal(lumi[1]!.camere.fete.dSolMasiv, 3)
  assert.deepEqual(contoare(lumi[0]!, x + 3, y + 3, g - 1), { nAer: 50, nConstr: 25, nSolMasiv: 65, nApa: 0 })
  assert.deepEqual(contoare(lumi[1]!, x + 3, y + 3, g - 1), { nAer: 50, nConstr: 65, nSolMasiv: 25, nApa: 0 })
  egalCuNumaratoarea(lumi[1]!, 3, 'dSolMasiv 3')
  const d3 = decode(encode(lumi[1]!), R3)
  assert.ok(d3.ok)
  assert.equal(d3.value.camere.fete.dSolMasiv, 3)
  assert.deepEqual(formaCanonicaFete(d3.value.camere), formaCanonicaFete(lumi[1]!.camere))
})

test('CAPACITATE oracol: contoarele tinute la zi == recalculul dupa fiecare lot — pamant pe acoperis (D+, nicio felie refacuta), groapa in podea si astuparea ei, o pivnita largita sub casa', () => {
  const s = casaTermica()
  const { w, x0, y0, g } = s
  const t = w.terrain
  const [cx, cy] = s.rep.casa!
  const pas = (ce: string, f: () => void, asteptat: ContoareMasa | null): void => {
    f()
    sincronizeazaCamere(w.camere, t)
    egalCuRecalculul(w, ce)
    egalCuNumaratoarea(w, R.termic.dSolMasivM, ce)
    if (asteptat !== null) assert.deepEqual(contoare(w, cx, cy, g + 1), asteptat, ce)
  }
  // Pământul de pe acoperiș nu e prima celulă a niciunei fețe: contoarele rămân.
  pas('pamant pe acoperis', () => assert.ok(fill(t, x0 + 3, y0 + 3, g + 4, Material.PAMANT).ok), { nAer: 50, nConstr: 90, nSolMasiv: 0, nApa: 0 })
  // Groapa din podea: +1 aer; fața de jos a celulei de deasupra (IARBA, d 0) dispare; groapa are 4 fețe laterale
  // în IARBA (d 0, suprafața) și una în PAMANT (d 1, masiv).
  pas('groapa', () => assert.ok(dig(t, cx, cy, g).ok), { nAer: 51, nConstr: 93, nSolMasiv: 1, nApa: 0 })
  pas('astupata cu piatra', () => assert.ok(fill(t, cx, cy, g, P).ok), { nAer: 50, nConstr: 90, nSolMasiv: 0, nApa: 0 })
  // O pivniță 3×3×1 sub casă, prin podea (puțul e celula astupată), lărgită celulă cu celulă.
  pas('putul', () => { assert.ok(dig(t, cx, cy, g).ok); assert.ok(dig(t, cx, cy, g - 1).ok) }, null)
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx !== 0 || dy !== 0) pas(`pivnita ${dx},${dy}`, () => assert.ok(dig(t, cx + dx, cy + dy, g - 1).ok), null)
  assert.equal(contoare(w, cx, cy, g + 1).nAer, 50 + 1 + 9)
})

// --- calibrarea (§4 „Țintele") --------------------------------------------------------------

/** τ_loc al componentei de referință, în secunde. */
function tau(s: CasaTermica, cheie: string, rules: Rules = R): number {
  return tauLoc(modelFloat(s.w, rules), compLa(s, cheie))
}

test('CALIBRARE τ: casa de piatra 5x5x2 cu usa 3–8 h (3,58 h), etajul numai din piatra 3–8 h (4,03 h), casa 5x5x2 cu golul usii ≤ 1 h (0,92 h)', () => {
  // τ_loc = C/ΣG, C din contoare (C'·μ), ΣG din graful real. Cifrele măsurate pe implicite (18 / 300 kJ/K, d ≥ 1 m):
  // 3,5763 / 4,0257 / 0,9173 h — aceleași cu verif-NUM-1 (3,577 / 4,026 / 0,917), la rotunjirea în μ.
  const casa = tau(casaTermica(), 'casa') / ORA
  const etaj = tau(casaTermica({ etaj: true }), 'etaj') / ORA
  const gol = tau(casaTermica({ gol: true }), 'casa') / ORA
  assert.ok(casa >= 3 && casa <= 8, `casa ${casa} h`)
  assert.ok(etaj >= 3 && etaj <= 8, `etajul ${etaj} h`)
  assert.ok(gol <= 1, `golul ${gol} h`)
  assert.ok(Math.abs(casa - 3.5763) < 0.0005 && Math.abs(etaj - 4.0257) < 0.0005 && Math.abs(gol - 0.9173) < 0.0005, `${casa} / ${etaj} / ${gol}`)
})

test('CALIBRARE τ: pivnitele 3x3x2 sub casa si fara casa, cu 1 si 3 m de pamant deasupra, 1–3 zile (1,23–1,48)', () => {
  // Măsurat: sub casă 1 m 1,4847 z, 3 m 1,3599 z; fără casă 1 m 1,3381 z, 3 m 1,2329 z (verif-NUM-1: 1,485 / 1,360 /
  // 1,338 / 1,233).
  const z: number[] = []
  for (const o of [{ k: 1 }, { k: 3 }, { faraCasa: true, k: 1 }, { faraCasa: true, k: 3 }]) z.push(tau(casaTermica(o), 'pivnita') / ZI)
  for (const v of z) assert.ok(v >= 1 && v <= 3, `pivnita ${v} zile`)
  assert.ok(Math.abs(z[0]! - 1.4847) < 0.0005 && Math.abs(z[3]! - 1.2329) < 0.0005, z.join(' / '))
})

test('CALIBRARE casa din pamant zidit: C egal EXACT cu casa de piatra pe aceeasi geometrie (3x3x2 … 9x9x3), iar τ_pamant ≥ 0,75·τ_piatra (0,79–0,82)', () => {
  // Decizia 5: „masă cât una din piatră". Pereții de pământ de deasupra solului au d 0 (stratul de suprafață), deci
  // masa construcției; τ diferă doar prin ΣG (pereții de pământ sunt fețe SOL cu R/2). Raportul măsurat la 5×5×2:
  // 2,8750 / 3,5763 = 0,804.
  for (const [L, H] of [[3, 2], [5, 2], [7, 2], [5, 3], [9, 3]] as const) {
    const piatra = casaTermica({ L, H })
    const pamant = casaTermica({ L, H, perete: Material.PAMANT })
    assert.equal(capacitateaComponentei(pamant.w, compLa(pamant, 'casa'), R), capacitateaComponentei(piatra.w, compLa(piatra, 'casa'), R), `${L}x${L}x${H}: C egal`)
    const r = tau(pamant, 'casa') / tau(piatra, 'casa')
    assert.ok(r >= 0.75 && r < 0.85, `${L}x${L}x${H}: τ_pamant / τ_piatra = ${r}`)
  }
})

// --- valul de frig (§4, verif-NUM-2) --------------------------------------------------------

/** Minimul casei L×L×2 în iarna anului `an` (seed 12345), pe modelul în float; `scala` înmulțește toate capacitățile. */
function minimIarna(L: number, an: number, scala: number): number {
  const s = casaTermica({ L })
  const m = modelFloat(s.w, R, scala)
  const i = m.gr.nodDupaComp[compLa(s, 'casa')]!
  const tps = R.ticksPerSecond
  const iarna = panaLaAnotimp(0, Anotimp.IARNA, R) + an * tickuriPeAn(R)
  // Două zile de rodaj din regimul permanent (τ 3,6 h: urma pornirii e e^−13), apoi iarna întreagă, pas cu pas.
  const p0 = Math.ceil((iarna - 2 * R.calendar.ziTicks) / tps) * tps
  const r = regimPermanent(s.w, R, p0)
  assert.ok(r.ok)
  const T = Float64Array.from(r.value.t, (v) => v / Q16)
  let min = Number.POSITIVE_INFINITY
  for (let tk = p0 + tps; tk <= iarna + 4 * R.calendar.ziTicks; tk += tps) {
    pasExp(m, T, temperaturiRezervoare(12345, tk, R))
    const mo = momentul(tk, R)
    if (mo.anotimp === Anotimp.IARNA && mo.an === an && T[i]! < min) min = T[i]!
  }
  return min
}

test('VALUL DE FRIG pe benzi: casele 5x5x2 si 3x3x2 cu usa, seed 12345 anul 0 (valul in ziua 3) si anul 3 (ziua 2) — minimul in ±0,45 °C de valoarea calibrarii; ziua 3 sub ziua 2, casa mica sub cea mare; C×0,75 si C×1,5 ies din banda', () => {
  // Benzile, la implicite (verif-NUM-2 la v1: −8,191 / −7,316 / −9,327 / −8,527; aici, cu masele în μ): 5×5×2 ziua 3
  // −8,191, ziua 2 −7,317; 3×3×2 ziua 3 −9,327, ziua 2 −8,527 °C. Minimul pe pas, nu orele sub −8 (care depind de
  // faza eșantionului: 3 h la :00, 2 h la :30).
  assert.equal(ziuaValului(12345, 0, R), 3, 'fixtura: anul 0, ziua 3')
  assert.equal(ziuaValului(12345, 3, R), 2, 'fixtura: anul 3, ziua 2')
  const BANDA = 0.45
  const tinte = [[5, 0, -8.191], [5, 3, -7.317], [3, 0, -9.327], [3, 3, -8.527]] as const
  const min = new Map<string, number>()
  for (const [L, an, v] of tinte) {
    const m = minimIarna(L, an, 1)
    min.set(`${L}/${an}`, m)
    assert.ok(Math.abs(m - v) <= BANDA, `casa ${L}x${L}x2, anul ${an}: minimul ${m.toFixed(3)} in afara benzii ${v} ± ${BANDA}`)
    // Probele negative: capacitatea cu un sfert mai mică sau cu jumătate mai mare iese din bandă.
    for (const sc of [0.75, 1.5]) {
      const p = minimIarna(L, an, sc)
      assert.ok(Math.abs(p - v) > BANDA, `C×${sc} pe casa ${L}x${L}x2, anul ${an}: ${p.toFixed(3)} ramane in banda`)
    }
  }
  // Structurale, fără calibrare: ziua 3 (cea mai rece a anului) sub ziua 2 cu ~0,85 °C; casa mică sub cea mare cu ~1,15.
  for (const L of [5, 3]) {
    const d = min.get(`${L}/3`)! - min.get(`${L}/0`)!
    assert.ok(d > 0.6 && d < 1.1, `casa ${L}: ziua 2 − ziua 3 = ${d}`)
  }
  for (const an of [0, 3]) {
    const d = min.get(`5/${an}`)! - min.get(`3/${an}`)!
    assert.ok(d > 0.9 && d < 1.4, `anul ${an}: 5x5 − 3x3 = ${d}`)
  }
})

test('CAPACITATE content: masele pe clasa sunt intregi DERIVATI la parsare in μ = cAer/16 (16, 238, 3.967 la implicite, abatere sub 0,01%), iar recalculul lor din content da aceleasi mase ca indexul', () => {
  const mase = R.termic.mase
  const mu = R.termic.cAerJPeK / 16
  assert.deepEqual(mase, { aer: 16, constr: 238, sol: 3967 })
  assert.ok(Math.abs(mase.constr * mu - R.termic.cConstrJPeK) / R.termic.cConstrJPeK < 1e-4)
  assert.ok(Math.abs(mase.sol * mu - R.termic.cSolJPeK) / R.termic.cSolJPeK < 1e-4)
  // C' dintr-un index construit de la zero == același din contoarele ținute la zi.
  const s = casaTermica({ k: 1 })
  const nou = construiesteCamere(s.w.terrain)
  for (const c of listaComponente(s.w.camere)) {
    const a = contoareComponentei(s.w.camere, c)
    const b = contoareComponentei(nou, componentaLa(nou, ...decodeazaCelulaTriplu(c.ancora))!)
    assert.ok(a.ok && b.ok)
    assert.equal(capacitateMu(a.value, mase), capacitateMu(b.value, mase))
  }
})

function decodeazaCelulaTriplu(k: number): [number, number, number] {
  const p = decodeazaCelula(k)
  return [p.x, p.y, p.z]
}

