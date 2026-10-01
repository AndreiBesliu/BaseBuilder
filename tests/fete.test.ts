/**
 * Fețele încăperilor — S24-27, tăietura 2a (src/sim/fete.ts; design-temperatura-v2 §4.1, §4.2, §4.4, §7).
 *
 * Două feluri de probe. Pe HÂRTIE: scenele designului, cu cifrele măsurate de panou (pivnița sub iarbă,
 * donjonul, M10, camera de la baza ferestrei, pivnița sub apă, debaraua) — o valoare calculată altfel decât
 * de cod, nu „codul e de acord cu el însuși". ORACOLUL: cache-ul ținut incremental == recalculul complet
 * al fețelor, după FIECARE lot, pe scenele care ating ramurile regulii D+: ieșirea devreme (pământ pe
 * acoperiș), K+1 pași (casa cu pivnița sub ea și acoperișul spart), restricția (a) (două editări în aceeași
 * coloană), restricția (b) (hala de 30 m), plus un fuzz de SUPRAFAȚĂ — fuzz-ul de cutii din camere.test.ts
 * nu ajunge la ramura de ieșire devreme (0–1 loturi din 300, măsurat de panou).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildM10PeLume } from '../src/harness/fixture-m10.ts'
import { runScenario, standardScenario } from '../src/harness/scenario.ts'
import type { Componenta } from '../src/sim/camere.ts'
import { bucataLa, celuleComponentei, cheieCelula, cititorCamere, componentaLa, construiesteCamere, decodeazaCelula, esteAer, esteAerAcoperit, formaCanonica, listaComponente, sincronizeazaCamere, varfLa } from '../src/sim/camere.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { slotDesemnare } from '../src/sim/desemnari.ts'
import type { AgregareFete, StatFete } from '../src/sim/fete.ts'
import { agregaComponenta, cacheFete, FelFata, feteleCelulei, formaCanonicaFete, formaCanonicaFeteRecalculata, NUME_CLASA, NUME_FEL } from '../src/sim/fete.ts'
import { Reason } from '../src/sim/result.ts'
import type { World } from '../src/sim/state.ts'
import { Faction, Item, Piesa } from '../src/sim/state.ts'
import type { PiesaId } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { bazaVoxeli, dig, fill, groundLevelM, materialAt } from '../src/sim/terrain/terrain.ts'
import { createWorld, tick } from '../src/sim/world.ts'
import { lasaItem, R, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

/** Inelul de ziduri L×L pe [g+1, g+H] și acoperișul la g+H+1, zidite direct în teren (ca în camere.test.ts). */
function casa(t: Terrain, x0: number, y0: number, g: number, L: number, H: number): void {
  for (let z = g + 1; z <= g + H; z++) for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
    assert.ok(fill(t, x0 + dx, y0 + dy, z, P).ok)
  }
  for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) assert.ok(fill(t, x0 + dx, y0 + dy, g + H + 1, P).ok)
}

/** Oracolul: indexul == recalculul lui, iar cache-ul de fețe == recalculul complet al fețelor. */
function egalCuRecalculul(w: World, mesaj: string): void {
  assert.deepEqual(formaCanonica(w.camere), formaCanonica(construiesteCamere(w.terrain)), `${mesaj} (indexul)`)
  assert.deepEqual(formaCanonicaFete(w.camere), formaCanonicaFeteRecalculata(w.camere, w.terrain), `${mesaj} (fetele)`)
}

/** Rândurile agregate ale componentei celulei (x, y, z), ca text: „SUS SOL [3x1] p3 d0 x25". */
function randuri(w: World, x: number, y: number, z: number): { text: string[]; a: AgregareFete; c: Componenta } {
  const c = componentaLa(w.camere, x, y, z)
  assert.ok(c, `(${x},${y},${z}) nu e aer acoperit`)
  const a = agregaComponenta(w.camere, c!)
  assert.ok(a.ok, `agregarea: ${JSON.stringify(a)}`)
  const text = a.value.randuri.map((r) => {
    const loc = r.fel === FelFata.MUCHIE ? '' : r.adancime >= 0 ? ` d${r.adancime}` : ''
    return `${NUME_CLASA[r.clasa]} ${NUME_FEL[r.fel]} [${w.camere.fete.compCheie[r.compozitie]}] p${r.prima}${loc} x${r.fete}`
  })
  return { text: text.sort(), a: a.value, c: c! }
}

const stat = (w: World): StatFete => ({ ...w.camere.fete.stat })
function delta(a: StatFete, b: StatFete): Record<string, number> {
  const o: Record<string, number> = {}
  for (const k of Object.keys(b).sort() as (keyof StatFete)[]) o[k] = b[k] - a[k]
  return o
}

// --- pe hârtie ---------------------------------------------------------------------

test('FETE pe hartie: pivnita 5x5x2 sub IARBA — cele 25 de fete SUS sunt SOL cu prima celula IARBA, la d 0; peretii PAMANT la d 1 si 2, podeaua ROCA la d 3', () => {
  // Scena verificatorului L2-3 (seed 20260913, coltul 10136,9070, sol natural la −7): sub IARBA de la g sunt
  // PAMANT la g−1, g−2 și ROCA de la g−3 (profilul din camere.ts). Pivnița e la g−1..g−2, cu tavanul IARBA.
  const w = createWorld(20260913)
  const t = w.terrain
  const x = 10136, y = 9070, g = -7
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
    const gg = groundLevelM(t, x + i, y + j)
    assert.ok(gg.ok && gg.value === g, 'fixtura: sit plat la −7')
    const m = materialAt(t, x + i, y + j, g)
    assert.ok(m.ok && m.value === Material.IARBA, 'fixtura: suprafata IARBA')
  }
  for (let j = 1; j < 6; j++) for (let i = 1; i < 6; i++) for (let dz = 1; dz <= 2; dz++) assert.ok(dig(t, x + i, y + j, g - dz).ok)
  sincronizeazaCamere(w.camere, t)
  const { text, a } = randuri(w, x + 3, y + 3, g - 1)
  // 25 SUS + 25 JOS + 4 pereți × 5 × 2 = 90 de fețe; tavanul de 1 m: aerul de afară e la a doua celulă, deci d_ef = min(0, 0).
  assert.deepEqual(text, ['JOS SOL [1x1] p1 d3 x25', 'LAT SOL [2x1] p2 d1 x20', 'LAT SOL [2x1] p2 d2 x20', 'SUS SOL [3x1] p3 d0 x25'])
  assert.equal(a.fete, 90)
  assert.equal(a.sine, 0)
  egalCuRecalculul(w, 'pivnita sub iarba')
})

test('FETE pe hartie: donjonul — camera de la parter sub 11 m de piatra plina are 9 fete SUS ADANC cu capatul la 11 m deasupra solului natural, si adancimea clampata la 0', () => {
  // Scena verificatorului L2-3: o cameră 3×3×2 cu zid de 1 m, 11 m plini deasupra. Capătul fețelor SUS (a
  // K+1-a celulă) e la g+2+9 = g+11, adică d = −11 — fără clamp, tabelul s-ar citi la indice negativ.
  const { w, wx: x, wy: y, g } = sitPlat(20260913, 7)
  const t = w.terrain
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const zid = i === 0 || j === 0 || i === 4 || j === 4
    for (let h = 1; h <= 2; h++) if (zid) assert.ok(fill(t, x + i, y + j, g + h, P).ok)
    for (let h = 3; h <= 13; h++) assert.ok(fill(t, x + i, y + j, g + h, P).ok)
  }
  sincronizeazaCamere(w.camere, t)
  assert.equal(g - (g + 2 + 9), -11, 'pe hartie: capatul fetelor SUS e la 11 m deasupra solului natural')
  const sus = materialAt(t, x + 2, y + 2, g)
  assert.ok(sus.ok && sus.value === Material.PAMANT, 'fixtura: podeaua e solul natural, PAMANT')
  const { text } = randuri(w, x + 2, y + 2, g + 1)
  assert.deepEqual(text, ['JOS SOL [2x1] p2 d0 x9', 'LAT EXT [6x1] p6 x24', 'SUS ADANC [6x8] p6 d0 x9'])
  egalCuRecalculul(w, 'donjon')
})

/** Fețele lumii pe care drumul are K+1 celule de hotar, cu a K+1-a deasupra solului natural — mers independent. */
function capeteDeasupraSolului(w: World, K: number): { x: number; y: number; z: number; d: number }[] {
  const t = w.terrain
  const r = cititorCamere(t)
  const DIR = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const
  const apa = (x: number, y: number, z: number): boolean => {
    if (z < bazaVoxeli(t, x, y)) return false
    const m = materialAt(t, x, y, z)
    return m.ok && m.value === Material.APA
  }
  const out: { x: number; y: number; z: number; d: number }[] = []
  for (const c of listaComponente(w.camere)) for (const kc of celuleComponentei(w.camere, c)) {
    const p = decodeazaCelula(kc)
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = DIR[d]!
      if (esteAerAcoperit(r, p.x + dx, p.y + dy, p.z + dz)) continue
      let hotar = true
      for (let i = 1; i <= K + 1 && hotar; i++) if (esteAer(r, p.x + dx * i, p.y + dy * i, p.z + dz * i) || apa(p.x + dx * i, p.y + dy * i, p.z + dz * i)) hotar = false
      if (!hotar) continue
      const cx = p.x + dx * (K + 1), cy = p.y + dy * (K + 1), cz = p.z + dz * (K + 1)
      const gn = groundLevelM(t, cx, cy)
      assert.ok(gn.ok)
      if (gn.value - cz < 0) out.push({ x: p.x, y: p.y, z: p.z, d })
    }
  }
  return out
}

let m10Memo: World | null = null
/** M10 pe o lume (tests/fixture.test.ts): 677 de încăperi; construită o dată în fișier, doar citită. */
function m10(): World {
  if (m10Memo === null) {
    const w = createWorld(20260913)
    assert.ok(applyCommand(w, { kind: 'setFocus', cx: 300, cy: 300 }).ok)
    buildM10PeLume(w, 300, 300)
    m10Memo = w
  }
  return m10Memo
}

test('FETE pe hartie: M10 — 275.406 de fete, 74.846 ajung la aer acoperit; cele 123 al caror capat e deasupra solului natural (SUS 40, LAT 83) sunt SOL la d 0, si niciun rand nu iese din [0, 64]', () => {
  // Cifrele A2 / verificatorul L2-3, pe M10 (seed 20260913 @300): 275.406 de fețe, 74.846 ACOPERIT; 123 de
  // fețe cu a 9-a celulă deasupra solului natural (sub turnurile de 9 m și sub zidul de incintă, pe pantă).
  const w = m10()
  const idx = w.camere
  let fete = 0
  let acoperit = 0
  let inAfara = 0
  for (const kf of idx.chei) for (const b of idx.felii.get(kf)!.bucati) {
    const rr = idx.fete.randuri[b]
    assert.ok(rr, `bucata ${b} fara randuri`)
    for (const x of rr!) {
      fete += x.fete
      if (x.fel === FelFata.MUCHIE) acoperit += x.fete
      else if (x.fel !== FelFata.DESCHISA && x.fel !== FelFata.EXT && (x.adancime < 0 || x.adancime > 64)) inAfara++
    }
  }
  assert.equal(fete, 275406)
  assert.equal(acoperit, 74846)
  assert.equal(inAfara, 0, 'randuri SOL/APA/ADANC cu adancimea in afara tabelului 0..64')
  const capete = capeteDeasupraSolului(w, 8)
  const pe = { SUS: 0, JOS: 0, LAT: 0 }
  const r = cititorCamere(w.terrain)
  for (const c of capete) {
    pe[c.d === 4 ? 'SUS' : c.d === 5 ? 'JOS' : 'LAT']++
    const f = feteleCelulei(idx, r, c.x, c.y, c.z).find((q) => q.directie === c.d)
    assert.ok(f, `(${c.x},${c.y},${c.z}) dir ${c.d}: fata lipseste`)
    assert.equal(f!.fel, FelFata.SOL, `(${c.x},${c.y},${c.z}) dir ${c.d}: ${NUME_FEL[f!.fel]}`)
    assert.equal(f!.adancime, 0)
  }
  assert.deepEqual(pe, { SUS: 40, JOS: 0, LAT: 83 })
  // Invariantul muchiilor (celula de dincolo e aer acoperit), pe fiecare componentă.
  for (const c of listaComponente(idx)) assert.ok(agregaComponenta(idx, c).ok, `componenta ${c.ancora}`)
})

test('FETE pe hartie: camera sapata la baza ferestrei, pe granita a doua chunk-uri cu baze diferite — 18 fete JOS dau in stanca de SUB baza (materialAt spune AER acolo), si toate 36 sunt SOL pe ROCA', () => {
  // Scena verificatorului L2-3: granița cx 300|301 (baze −30 | −21), o cameră 6×6×3 săpată de la baza mai
  // înaltă; jumătatea din chunk-ul cu baza −21 are podeaua SUB bază.
  const w = createWorld(20260913)
  const t = w.terrain
  const cx = 300, cy = 296
  const a = bazaVoxeli(t, cx * 32, cy * 32), b = bazaVoxeli(t, (cx + 1) * 32, cy * 32)
  assert.deepEqual([a, b], [-30, -21], 'fixtura: bazele celor doua chunk-uri')
  const x0 = (cx + 1) * 32 - 3, y0 = cy * 32 + 10
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) for (let dz = 0; dz < 3; dz++) assert.ok(dig(t, x0 + i, y0 + j, b + dz).ok)
  sincronizeazaCamere(w.camere, t)
  const c = componentaLa(w.camere, x0, y0, b)
  assert.ok(c && c.volum === 108)
  const r = cititorCamere(t)
  let subBaza = 0
  let jos = 0
  for (const kc of celuleComponentei(w.camere, c!)) {
    const p = decodeazaCelula(kc)
    for (const f of feteleCelulei(w.camere, r, p.x, p.y, p.z)) {
      assert.notEqual(f.fel, FelFata.DESCHISA, 'o fata a camerei de la baza da in aer')
      assert.notEqual(f.fel, FelFata.EXT, 'o fata a camerei de la baza da in aer de afara')
      if (f.clasa !== 1) continue
      jos++
      assert.equal(f.fel, FelFata.SOL)
      assert.equal(f.prima, Material.ROCA)
      if (p.z - 1 < bazaVoxeli(t, p.x, p.y)) {
        subBaza++
        const m = materialAt(t, p.x, p.y, p.z - 1)
        assert.ok(m.ok && m.value === Material.AER, 'controlul: materialAt spune AER sub baza')
      }
    }
  }
  assert.equal(jos, 36)
  assert.equal(subBaza, 18)
  egalCuRecalculul(w, 'baza ferestrei')
})

test('FETE pe hartie: pivnita 3x3x2 sapata direct sub apa — cele 9 fete SUS sunt APA, cu prima celula APA si drumul gol', () => {
  // Scena verificatorului L2-3 (seed 4242, 7816,7816): suprafața e APA la −40. Fața direct spre apă n-are
  // nicio celulă solidă — apa e capăt de drum, ca aerul, nu „aer de afară prin apă".
  const w = createWorld(4242)
  const t = w.terrain
  const x = 244 * 32 + 8, y = 244 * 32 + 8
  const g = groundLevelM(t, x, y)
  assert.ok(g.ok && g.value === -40)
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const m = materialAt(t, x + i, y + j, -40)
    assert.ok(m.ok && m.value === Material.APA, 'fixtura: apa deasupra pivnitei')
    for (let dz = 1; dz <= 2; dz++) assert.ok(dig(t, x + i, y + j, -40 - dz).ok)
  }
  sincronizeazaCamere(w.camere, t)
  const { text } = randuri(w, x + 1, y + 1, -41)
  assert.ok(text.includes('SUS APA [] p4 d0 x9'), text.join(' | '))
  egalCuRecalculul(w, 'pivnita sub apa')
})

test('FETE pe hartie: debaraua de la etajul din mijloc al casei cu trei niveluri — 24 din 24 de fete sunt MUCHIE, spre trei componente', () => {
  // Scena verificatorului L1-03 (casa3): casă de piatră 9×9 pe 3 niveluri, plăci pline; la mijloc o debara
  // 2×2×2 cu pereți de 1 m și o ușă, în holul etajului. Fețele ei dau toate, prin hotar, în alte încăperi.
  const { w, wx, wy, g } = sitPlat(777, 14)
  const t = w.terrain
  const x0 = wx + 2, y0 = wy + 2, L = 9
  for (let z = g + 1; z <= g + 9; z++) {
    const placa = z === g + 3 || z === g + 6 || z === g + 9
    for (let x = 0; x < L; x++) for (let y = 0; y < L; y++) {
      if (placa || x === 0 || y === 0 || x === L - 1 || y === L - 1) assert.ok(fill(t, x0 + x, y0 + y, z, P).ok)
    }
  }
  for (let z = g + 4; z <= g + 5; z++) for (let x = 3; x <= 6; x++) for (let y = 3; y <= 6; y++) {
    if (x > 3 && x < 6 && y > 3 && y < 6) continue
    assert.ok(fill(t, x0 + x, y0 + y, z, x === 4 && y === 3 ? Material.USA : P).ok)
  }
  sincronizeazaCamere(w.camere, t)
  const { a, c } = randuri(w, x0 + 4, y0 + 4, g + 4)
  assert.equal(c.volum, 8)
  assert.equal(a.fete, 24)
  assert.equal(a.sine, 0)
  assert.ok(a.randuri.every((q) => q.fel === FelFata.MUCHIE), 'toate fetele debaralei sunt MUCHIE')
  const vecine = new Set(a.randuri.map((q) => q.vecina))
  const hol = componentaLa(w.camere, x0 + 2, y0 + 2, g + 4)!, parter = componentaLa(w.camere, x0 + 2, y0 + 2, g + 1)!, sus = componentaLa(w.camere, x0 + 2, y0 + 2, g + 7)!
  assert.deepEqual([...vecine].sort((p, q) => p - q), [hol.id, parter.id, sus.id].sort((p, q) => p - q))
  // Prin ușă: cele 2 fețe ale celulelor din dreptul ei, cu prima celulă USA.
  assert.equal(a.randuri.filter((q) => q.prima === Material.USA).reduce((s, q) => s + q.fete, 0), 2)
  egalCuRecalculul(w, 'debaraua')
})

test('FETE pe hartie: MUCHIE inaintea solului — doua pivnite in roca, la 3 m una de alta, raman legate prin 6 fete MUCHIE de fiecare parte', () => {
  // Ordinea din tabelul §4.2: drumul care ajunge, prin ≤ K celule de hotar, la aerul altei componente e
  // MUCHIE chiar dacă trece prin sol natural (cele 1.776 de muchii ale M10).
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const t = w.terrain
  for (const x of [1, 2, 3, 7, 8, 9]) for (let y = 1; y <= 3; y++) for (const z of [g - 5, g - 4]) assert.ok(dig(t, wx + x, wy + y, z).ok)
  sincronizeazaCamere(w.camere, t)
  const A = randuri(w, wx + 2, wy + 2, g - 4)
  const B = randuri(w, wx + 8, wy + 2, g - 4)
  assert.notEqual(A.c.id, B.c.id)
  assert.deepEqual(A.a.randuri.filter((q) => q.fel === FelFata.MUCHIE).map((q) => [q.vecina, q.fete, w.camere.fete.compCheie[q.compozitie]]), [[B.c.id, 6, '1x3']])
  assert.deepEqual(B.a.randuri.filter((q) => q.fel === FelFata.MUCHIE).map((q) => [q.vecina, q.fete, w.camere.fete.compCheie[q.compozitie]]), [[A.c.id, 6, '1x3']])
})

test('FETE pe hartie: un stalp de 1x1 in mijlocul unei pivnite — cele 8 fete laterale ale lui sunt SINE (drumul prin stalp se intoarce in pivnita) si ies din randuri', () => {
  // SINE nu stă în cache (antetul fete.ts): drumul ajunge la aer acoperit, iar agregarea vede că e al
  // aceleiași componente. Pivnița 5×5×2 sub 2 m de sol, cu stâlpul nesăpat în centru.
  const { w, wx, wy, g } = sitPlat(12345, 8)
  const t = w.terrain
  for (let dx = 1; dx <= 5; dx++) for (let dy = 1; dy <= 5; dy++) {
    if (dx === 3 && dy === 3) continue
    for (const z of [g - 4, g - 3]) assert.ok(dig(t, wx + dx, wy + dy, z).ok)
  }
  sincronizeazaCamere(w.camere, t)
  const { a } = randuri(w, wx + 1, wy + 1, g - 3)
  assert.equal(a.sine, 8)
  assert.equal(a.fete, 24 + 24 + 4 * 5 * 2 + 8, 'pe hartie: tavan si podea 24+24, pereti 40, stalpul 8')
  assert.ok(a.randuri.every((q) => q.fel !== FelFata.MUCHIE && q.fel !== FelFata.SINE), 'nicio muchie: pivnita e singura')
  egalCuRecalculul(w, 'stalpul')
})

test('FETE pe hartie: d_ef — un perete natural subtire spre un sant deschis pastreaza urma aerului de afara (d 0, 1, 2, 2 la 1, 2, 3, 4 m de pamant)', () => {
  // Verificatorul L3-1: d_ef(s) = min(d(s), n_aer − 1). O pivniță la g−2 (d = 2 pe peretele ei de PAMANT) lângă
  // un șanț deschis, la `l` metri de pământ: fața laterală spre șanț e SOL la min(2, l − 1).
  for (const [l, asteptat] of [[1, 0], [2, 1], [3, 2], [4, 2]] as const) {
    const { w, wx, wy, g } = sitPlat(12345, 12)
    const t = w.terrain
    const xs = wx + 2
    for (let y = 1; y <= 4; y++) for (let z = g - 3; z <= g; z++) assert.ok(dig(t, xs, wy + y, z).ok)
    const xc = xs + l + 1
    for (let x = xc; x <= xc + 1; x++) for (let y = 2; y <= 3; y++) assert.ok(dig(t, x, wy + y, g - 2).ok)
    sincronizeazaCamere(w.camere, t)
    const f = feteleCelulei(w.camere, cititorCamere(t), xc, wy + 2, g - 2).find((q) => q.directie === 1)
    assert.ok(f, `l ${l}: fata spre sant`)
    assert.equal(NUME_FEL[f!.fel], 'SOL', `l ${l}`)
    assert.equal(f!.adancime, asteptat, `l ${l}: d_ef`)
    egalCuRecalculul(w, `sant la ${l}`)
  }
})

// --- D+ și oracolul ---------------------------------------------------------------

test('FETE D+: pamant pe acoperisul unei case — lotul nu reface nicio felie si epoca ramane, dar fetele SUS trec din EXT in SOL: cache-ul == recalculul, iar epocaFete creste', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const t = w.terrain
  casa(t, wx, wy, g, 5, 2)
  sincronizeazaCamere(w.camere, t)
  assert.deepEqual(randuri(w, wx + 2, wy + 2, g + 1).text.filter((s) => s.startsWith('SUS')), ['SUS EXT [6x1] p6 x9'])
  const epoca = w.camere.epoca
  let epocaFete = w.camere.epocaFete
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    assert.ok(fill(t, wx + dx, wy + dy, g + 4, Material.PAMANT).ok)
    const rez = sincronizeazaCamere(w.camere, t)
    assert.deepEqual(rez.felii, [], 'pamantul pe acoperis a refacut o felie')
    assert.equal(w.camere.epoca, epoca, 'epoca s-a miscat')
    const peInterior = dx >= 1 && dx <= 3 && dy >= 1 && dy <= 3
    assert.equal(w.camere.epocaFete, epocaFete + (peInterior ? 1 : 0), `(${dx},${dy}): epocaFete`)
    epocaFete = w.camere.epocaFete
    egalCuRecalculul(w, `pamant (${dx},${dy})`)
  }
  // Pământul pus de jucător e sol (eSolNatural): T_sol(0), prin acoperișul de piatră.
  assert.deepEqual(randuri(w, wx + 2, wy + 2, g + 1).text.filter((s) => s.startsWith('SUS')), ['SUS SOL [2x1+6x1] p6 d0 x9'])
  // Controlul: o săpătură într-o carieră deschisă, departe de casă, nu atinge nicio față.
  const e0 = w.camere.epocaFete
  assert.ok(dig(t, wx + 10, wy + 10, g).ok)
  sincronizeazaCamere(w.camere, t)
  assert.equal(w.camere.epocaFete, e0, 'o sapatura fara nicio fata in preajma a mutat epocaFete')
})

test('FETE D+: casa, pivnita sub ea, acoperisul spart — drumul de K+1 pasi ajunge la pivnita de sub 8 celule de hotar', () => {
  // Verificatorul L2-4 (m5.ts, partea 2): pivnița cu tavan natural de 7 m sub podeaua casei: 8 celule de hotar
  // între ea și aerul casei, deci fețele ei SUS sunt MUCHIE. Spart acoperișul, aerul casei devine cer: cu
  // drumuri de K = 8 pași, 16 fețe rămâneau MUCHIE spre o celulă care nu mai e aer acoperit.
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const t = w.terrain
  const lot = (f: () => void, et: string): void => {
    f()
    sincronizeazaCamere(w.camere, t)
    egalCuRecalculul(w, et)
  }
  for (let dx = 0; dx <= 5; dx++) for (let dy = 0; dy <= 5; dy++) lot(() => assert.ok(fill(t, wx + dx, wy + dy, g + 1, P).ok), 'podeaua')
  for (let z = g + 2; z <= g + 3; z++) for (let dx = 0; dx <= 5; dx++) for (let dy = 0; dy <= 5; dy++) {
    if (dx === 0 || dy === 0 || dx === 5 || dy === 5) lot(() => assert.ok(fill(t, wx + dx, wy + dy, z, P).ok), 'zidul')
  }
  for (let dx = 0; dx <= 5; dx++) for (let dy = 0; dy <= 5; dy++) lot(() => assert.ok(fill(t, wx + dx, wy + dy, g + 4, P).ok), 'acoperisul')
  const c = g - 7
  lot(() => { for (let dx = 1; dx <= 4; dx++) for (let dy = 1; dy <= 4; dy++) for (const z of [c, c - 1]) assert.ok(dig(t, wx + dx, wy + dy, z).ok) }, 'pivnita')
  const inainte = randuri(w, wx + 2, wy + 2, c)
  const casaC = componentaLa(w.camere, wx + 2, wy + 2, g + 2)!
  assert.deepEqual(inainte.a.randuri.filter((q) => q.clasa === 0).map((q) => [NUME_FEL[q.fel], q.vecina, q.fete]), [['MUCHIE', casaC.id, 16]], 'pe hartie: 7 m de sol + podeaua, apoi aerul casei')
  for (let dx = 0; dx <= 5; dx++) for (let dy = 0; dy <= 5; dy++) lot(() => assert.ok(dig(t, wx + dx, wy + dy, g + 4).ok), 'acoperisul spart')
  assert.deepEqual(randuri(w, wx + 2, wy + 2, c).a.randuri.filter((q) => q.clasa === 0).map((q) => NUME_FEL[q.fel]), ['SOL'], 'casa fara acoperis e cer: tavanul pivnitei e sol')
})

test('FETE D+ (a): doua umpleri in aceeasi coloana, in acelasi lot, langa o casa — celula de sub umplerea de jos devine acoperita, iar fata casei spre ea trece din EXT in MUCHIE', () => {
  // Panoul, L2-5: restricția „naivă" (sari rulajul dacă vârful de după lot e deasupra editării) rata asta:
  // vârful nou e chiar cealaltă umplere. Peretele de est al casei e prima coloană a blocului următor, deci
  // nicio felie a casei nu se reface — fața ei se schimbă doar prin D+.
  const { w, wx, wy, g } = sitPlat(4242, 24)
  const t = w.terrain
  const xz = Math.ceil((wx + 6) / 16) * 16 // peretele de est, prima coloană a unui bloc
  const x0 = xz - 4
  casa(t, x0, wy, g, 5, 2)
  sincronizeazaCamere(w.camere, t)
  const fata = (): string => NUME_FEL[feteleCelulei(w.camere, cititorCamere(t), x0 + 3, wy + 2, g + 1).find((q) => q.directie === 0)!.fel]!
  assert.equal(fata(), 'EXT')
  assert.ok(fill(t, xz + 1, wy + 2, g + 2, P).ok)
  assert.ok(fill(t, xz + 1, wy + 2, g + 4, P).ok)
  const rez = sincronizeazaCamere(w.camere, t)
  assert.equal(fata(), 'MUCHIE', 'pe hartie: (xz+1, g+1) e acum sub acoperisul de la g+4')
  const felieCasei = w.camere.bFelie[bucataLa(w.camere, x0 + 3, wy + 2, g + 1)]!
  assert.ok(!rez.felii.includes(felieCasei), 'fixtura: felia casei s-a refacut — fata ei nu mai depinde doar de D+')
  egalCuRecalculul(w, 'doua umpleri in coloana')
})

test('FETE D+: put sapat in blocul vecin, la 3 celule de peretele unei pivnite — nicio felie refacuta, iar fata laterala a pivnitei trece de la d 4 la d_ef 2', () => {
  // Fața laterală a pivniței de la g−4 merge prin ROCA; puțul deschis la 3 celule de ea aduce aerul de afară
  // pe drum: d_ef = min(4, 3 − 1). Puțul e în alt bloc, fără felii la nivelul ăsta: lotul iese devreme.
  const { w, wx, wy, g } = sitPlat(12345, 24)
  const t = w.terrain
  const xc = Math.ceil((wx + 6) / 16) * 16 - 1 // ultima coloană a unui bloc
  for (let x = xc - 2; x <= xc; x++) for (let y = 2; y <= 4; y++) assert.ok(dig(t, x, wy + y, g - 4).ok)
  sincronizeazaCamere(w.camere, t)
  const fata = (): { fel: string; d: number } => {
    const f = feteleCelulei(w.camere, cititorCamere(t), xc, wy + 3, g - 4).find((q) => q.directie === 0)!
    return { fel: NUME_FEL[f.fel]!, d: f.adancime }
  }
  assert.deepEqual(fata(), { fel: 'SOL', d: 4 })
  const xs = xc + 4
  for (let z = g; z >= g - 5; z--) {
    assert.ok(dig(t, xs, wy + 3, z).ok)
    const rez = sincronizeazaCamere(w.camere, t)
    assert.deepEqual(rez.felii, [], `putul la ${z}: o felie refacuta`)
    egalCuRecalculul(w, `putul la ${z}`)
  }
  assert.deepEqual(fata(), { fel: 'SOL', d: 2 })
})

/** Casa 7×7 cu ușă (două USI în golul (3,0)) și placă, ridicată de pioni — ca santierul din usa.test.ts. */
function santierPestePivnita(seed: number): { w: World; ids: number[]; x0: number; y0: number; g: number } {
  const { w, wx, wy, g } = sitPlat(seed, 18)
  const x0 = wx + 5, y0 = wy + 4
  // Pivnița 7×7×2 sub toată amprenta casei, la d = 2..3 (tavan: 2 celule de sol), săpată înainte.
  for (let d = 2; d <= 3; d++) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) assert.ok(dig(w.terrain, x0 + x, y0 + y, g - d).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const piese: (readonly [number, number, number, PiesaId])[] = []
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
    if (dx !== 0 && dx !== 6 && dy !== 0 && dy !== 6) continue
    if (dx === 3 && dy === 0) continue
    piese.push([dx, dy, z, Piesa.PERETE])
  }
  piese.push([3, 0, g + 1, Piesa.USA], [3, 0, g + 2, Piesa.USA])
  for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) piese.push([dx, dy, g + 3, Piesa.PODEA])
  const ids: number[] = []
  for (const [dx, dy, z, p] of piese) {
    const out = applyCommand(w, { kind: 'desemneaza', wx: x0 + dx, wy: y0 + dy, z, piesa: p }, R)
    assert.ok(out.ok, `fixtura: santierul (${dx},${dy},${z - g})`)
    if (out.ok) ids.push(out.value)
  }
  let piatra = piese.length * 20
  for (let i = 0; piatra > 0; i++) {
    const c = Math.min(60, piatra)
    lasaItem(w, Item.PIATRA, c, wx - 2 + (i % 5), wy + ((i / 5) | 0))
    piatra -= c
  }
  for (let i = 0; i < 10; i++) lasaItem(w, Item.HRANA, 75, wx + 14 + (i % 3), wy - 1 + ((i / 3) | 0))
  for (let i = 0; i < 4; i++) assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 3) * 1000 + 500, y: (wy + 12 + i) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
  return { w, ids, x0, y0, g }
}

test('FETE D+: casa ridicata de pioni PESTE o pivnita — cache-ul == recalculul dupa fiecare tick care a editat terenul', () => {
  // Verificatorul L2-1: o casă peste o pivniță face 41–48 de loturi care schimbă fețe fără epocă nouă (ultimele
  // plăci peste pereți, podeaua peste solul de deasupra pivniței).
  const { w, ids, x0, y0, g } = santierPestePivnita(12345)
  let prec = w.terrain.editari
  let loturi = 0
  let faraEpoca = 0
  let gata = -1
  for (let i = 0; i < 12000 && (gata < 0 || i < gata + 300); i++) {
    const e0 = w.camere.epoca, f0 = w.camere.epocaFete
    tick(w, R)
    if (w.terrain.editari === prec) continue
    prec = w.terrain.editari
    loturi++
    if (w.camere.epoca === e0 && w.camere.epocaFete > f0) faraEpoca++
    egalCuRecalculul(w, `tickul ${w.tick}`)
    if (gata < 0 && ids.every((id) => slotDesemnare(w.desemnari, id) === -1)) gata = i
  }
  assert.ok(gata >= 0, 'casa n-a fost terminata')
  const pivnita = componentaLa(w.camere, x0 + 3, y0 + 3, g - 2)
  const parter = componentaLa(w.camere, x0 + 3, y0 + 3, g + 1)
  assert.ok(pivnita && parter && pivnita.id !== parter.id, 'fixtura: casa si pivnita sunt doua incaperi')
  // Măsurat: 96 de loturi (97 de piese), din care 42 schimbă fețe fără epocă nouă — exact cifra verificatorului.
  assert.ok(loturi >= 90, `doar ${loturi} loturi`)
  assert.ok(faraEpoca >= 30, `doar ${faraEpoca} loturi cu fete schimbate fara epoca noua — scena nu atinge ramura de iesire devreme`)
})

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

test('FETE fuzz de SUPRAFATA: umpleri si sapaturi pe varful coloanei peste o pivnita si o camera zidita, de-a curmezisul unei granite de bloc — cache-ul == recalculul dupa fiecare lot', () => {
  for (const seed of [12345, 777, 4242]) {
    const { w, wx, wy, g } = sitPlat(seed, 20)
    const t = w.terrain
    const gx = Math.ceil((wx + 9) / 16) * 16
    // Pivnița 4×4×2 la vest de graniță, sub 1 m de sol; camera zidită 5×5×2 la est.
    for (let x = gx - 5; x <= gx - 2; x++) for (let y = wy + 3; y <= wy + 6; y++) for (const z of [g - 2, g - 1]) assert.ok(dig(t, x, y, z).ok)
    casa(t, gx + 1, wy + 2, g, 5, 2)
    sincronizeazaCamere(w.camere, t)
    const rnd = lcg(seed)
    let loturi = 0
    let faraFelie = 0
    for (let p = 0; p < 400; ) {
      const n = 1 + Math.floor(rnd() * 4)
      for (let i = 0; i < n; i++, p++) {
        const x = gx - 7 + Math.floor(rnd() * 14)
        const y = wy + 1 + Math.floor(rnd() * 8)
        const v = varfLa(cititorCamere(t), x, y)
        const m = materialAt(t, x, y, v)
        if (rnd() < 0.55) fill(t, x, y, v + 1, rnd() < 0.5 ? P : Material.PAMANT)
        else if (m.ok && m.value !== Material.APA && v > g - 4) dig(t, x, y, v)
      }
      const f0 = w.camere.epocaFete
      const rez = sincronizeazaCamere(w.camere, t)
      loturi++
      if (rez.felii.length === 0 && w.camere.epocaFete > f0) faraFelie++
      egalCuRecalculul(w, `seed ${seed}, lotul ${loturi}`)
    }
    // Măsurat: 23, 22 și 14 din ~160 de loturi (fuzz-ul de cutii: 0–1 din 300, panoul).
    assert.ok(faraFelie >= 10, `seed ${seed}: doar ${faraFelie} loturi care schimba fete fara nicio felie refacuta — fuzz-ul nu atinge ramura de iesire devreme`)
  }
})

test('FETE hala de 30 m: un planseu pus si sapat sub acoperis — 2 bucati recalculate pe lot, nu 30; rulajul de sub editare nu se strabate (a), feliile refacute cu aceleasi celule isi pastreaza randurile (b)', () => {
  // Panoul, L2-5: fără (a) și (b), fiecare editare reagrega cele 30 de felii ale rulajului (1,3 ms p50); cu
  // ele, 2 felii (111 µs). Aici pe contoare: o umplere sub acoperiș are deasupra ei acoperișul (hotar
  // needitat), deci rulajul nu se strabate; din cele 29 de felii refăcute de sincronizare, una e marcată de D+
  // (cea de sub editare), restul își păstrează rândurile.
  const { w, wx, wy, g } = sitPlat(12345, 20)
  const t = w.terrain
  const H = 30, L = 14
  for (let z = g + 1; z <= g + H; z++) for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) if (dx === 0 || dy === 0 || dx === L - 1 || dy === L - 1) assert.ok(fill(t, wx + dx, wy + dy, z, P).ok)
  for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) assert.ok(fill(t, wx + dx, wy + dy, g + H + 1, P).ok)
  sincronizeazaCamere(w.camere, t)
  let loturi = 0
  const ed = (ok: boolean, et: string): void => {
    assert.ok(ok)
    const a = stat(w)
    const rez = sincronizeazaCamere(w.camere, t)
    const d = delta(a, stat(w))
    loturi++
    assert.equal(rez.felii.length, H, `${et}: feliile refacute de sincronizare (rulajul)`)
    assert.equal(d.drumuri, 6, `${et}: drumuri D+ (doar din editare)`)
    assert.equal(d.rulajeSarite, 1, `${et}: rulajul nesarit`)
    assert.ok(d.bucatiRecalculate! <= 3, `${et}: ${d.bucatiRecalculate} bucati recalculate`)
    assert.ok(d.bucatiPurtate! >= H - 3, `${et}: doar ${d.bucatiPurtate} bucati purtate`)
    egalCuRecalculul(w, et)
  }
  for (let dx = 1; dx < L - 1; dx++) for (let dy = 1; dy < 3; dy++) ed(fill(t, wx + dx, wy + dy, g + H, P).ok, `planseu (${dx},${dy})`)
  for (let dx = 1; dx < L - 1; dx++) for (let dy = 1; dy < 3; dy++) ed(dig(t, wx + dx, wy + dy, g + H).ok, `sapat (${dx},${dy})`)
  assert.equal(loturi, 48)
})

// --- K05 -------------------------------------------------------------------------

test('FETE K05: aceeasi sarcina costa la fel pe o casa singura si pe o asezare cu 100 de pivnite in plus — contoarele D+ si ale reagregarii sunt identice', () => {
  const sarcina = (pivnite: number): Record<string, number> => {
    const { w, wx, wy, g } = sitPlat(777, 12)
    const t = w.terrain
    casa(t, wx, wy, g, 5, 2)
    for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) assert.ok(dig(t, wx + dx, wy + dy, g - 3).ok)
    // Pivnițele în plus: departe (alte blocuri), sub sol, câte 3×3×2.
    for (let i = 0; i < pivnite; i++) {
      const x = wx + 40 + (i % 10) * 6, y = wy + 40 + ((i / 10) | 0) * 6
      const gg = groundLevelM(t, x, y)
      assert.ok(gg.ok)
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) for (const z of [gg.value - 3, gg.value - 2]) dig(t, x + dx, y + dy, z)
    }
    sincronizeazaCamere(w.camere, t)
    const a = stat(w)
    // Sarcina: pământ pe acoperiș, o gaură în perete și zidită la loc, o groapă în podea și umplută.
    for (let dx = 0; dx < 5; dx++) { fill(t, wx + dx, wy + 2, g + 4, Material.PAMANT); sincronizeazaCamere(w.camere, t) }
    for (const ok of [dig(t, wx, wy + 2, g + 1).ok, fill(t, wx, wy + 2, g + 1, P).ok, dig(t, wx + 2, wy + 2, g).ok, fill(t, wx + 2, wy + 2, g, P).ok]) {
      assert.ok(ok)
      sincronizeazaCamere(w.camere, t)
    }
    egalCuRecalculul(w, `${pivnite} pivnite`)
    return delta(a, stat(w))
  }
  const mica = sarcina(0)
  const mare = sarcina(100)
  assert.ok(mica.bucatiRecalculate! > 0 && mica.drumuri! > 0, 'sarcina nu atinge fetele')
  assert.deepEqual(mare, mica)
})

test('FETE K05: scenariul standard (0 componente) nu plateste nimic — garda sare D+ pe fiecare lot cu editari', () => {
  const r = runScenario(standardScenario(12345, 3000, 20))
  const s = r.world.camere.fete.stat
  assert.ok(r.world.terrain.editari > 0, 'scenariul sapa')
  assert.equal(s.loturiSarite, r.world.camere.stat.sincronizari, 'fiecare lot cu editari a trecut prin garda')
  assert.ok(s.loturiSarite > 0)
  assert.deepEqual([s.loturi, s.drumuri, s.celuleDrum, s.bucatiRecalculate, s.feteClasificate], [0, 0, 0, 0, 0])
})

// --- contractul și invariantul ------------------------------------------------------

test('FETE: agregarea refuza cu INVARIANT_INCALCAT o muchie a carei celula de dincolo nu e aer acoperit — nu o muchie spre nimic', () => {
  // Verificatorul L2-4: cu drumuri prea scurte, cache-ul ținea muchii spre celule care nu mai erau aer acoperit,
  // iar „celula de dincolo → bucată → componentă" dădea `bComp[−1]`, tăcut. Aici stricăciunea e făcută de mână:
  // un rând MUCHIE care arată în roca dintre două pivnițe.
  const { w, wx, wy, g } = sitPlat(12345, 10)
  const t = w.terrain
  for (const x of [1, 2, 4, 5]) for (const z of [g - 5, g - 4]) assert.ok(dig(t, wx + x, wy + 2, z).ok)
  sincronizeazaCamere(w.camere, t)
  const A = componentaLa(w.camere, wx + 1, wy + 2, g - 4)!
  const bun = agregaComponenta(w.camere, A)
  assert.ok(bun.ok && bun.value.randuri.some((q) => q.fel === FelFata.MUCHIE), 'fixtura: pivnitele sunt legate')
  const b = bucataLa(w.camere, wx + 1, wy + 2, g - 4)
  const vechi = w.camere.fete.randuri[b]
  w.camere.fete.randuri[b] = [...vechi!, { clasa: 2, fel: FelFata.MUCHIE, compozitie: 0, prima: Material.ROCA, adancime: -1, dincolo: cheieCelula(wx + 3, wy + 2, g - 4), fete: 1 }]
  try {
    const rau = agregaComponenta(w.camere, A)
    assert.ok(!rau.ok && rau.reason === Reason.INVARIANT_INCALCAT, JSON.stringify(rau))
  } finally {
    w.camere.fete.randuri[b] = vechi
  }
})

test('FETE: K al fetelor e un parametru intreg in [1, 64]; un index construit cu alt K are alt cache', () => {
  assert.throws(() => cacheFete(0), RangeError)
  assert.throws(() => cacheFete(65), RangeError)
  assert.throws(() => cacheFete(2.5), RangeError)
  const { w, wx, wy, g } = sitPlat(12345, 8)
  casa(w.terrain, wx, wy, g, 5, 2)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.equal(w.camere.fete.k, 8)
  const idx3 = construiesteCamere(w.terrain, 3)
  assert.equal(idx3.fete.k, 3)
  assert.deepEqual(formaCanonicaFete(idx3), formaCanonicaFeteRecalculata(idx3, w.terrain))
})
