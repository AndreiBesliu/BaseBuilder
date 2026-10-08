/**
 * Recenzia încăperilor (28.09), partea UI-ului: memoria inspectorului (EXP-4, ECR-3), textele explicației
 * (EXP-7), ușa propusă și indiciul uneltei Ușă (ECR-12), textul ușii dintr-o groapă (USA-4). Pe lume
 * reală (fixturi.ts); memoria cu un ceas fals, ca frâna să se măsoare fără să se aștepte.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { sincronizeazaCamere } from '../src/sim/camere.ts'
import { constructiaPrevizualizata } from '../src/sim/joburi.ts'
import { DetaliuMotiv, slotDesemnare } from '../src/sim/desemnari.ts'
import { stergeItem } from '../src/sim/iteme.ts'
import { motivDinCod, Reason } from '../src/sim/result.ts'
import { Faction, Item, Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { isSolid, Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill, groundLevelM, materialAt } from '../src/sim/terrain/terrain.ts'
import type { Explicatie } from '../src/sim/camere-explica.ts'
import { incaperea, stareDesemnare } from '../viewer/ui/model.ts'
import type { IncapereLa } from '../viewer/ui/model.ts'
import { creeazaMemorieIncapere, usilePropuse } from '../viewer/ui/memorie-incapere.ts'
import { goluriUsi, textIncapere, textIndiciuUsa } from '../viewer/ui/texte.ts'
import { desemneaza, R, ruleaza, sitPlat } from './fixturi.ts'
import { sincronizeazaLumea } from '../src/sim/temperatura.ts'

const P = Material.PIATRA_CONSTRUITA

/** Aer acolo, oricum ar fi fost. */
function sapa(w: World, x: number, y: number, z: number): void {
  const m = materialAt(w.terrain, x, y, z)
  if (m.ok && m.value !== Material.AER) assert.ok(dig(w.terrain, x, y, z).ok, `sapa ${x},${y},${z}`)
}

/**
 * O mină (după verificatorul EXP-4): o hală N×N×H sub sol, cu K tuneluri 1×2 spre un șanț deschis la cer.
 * Deschisă, deci explicația inundă până la scurgere și caută ușile.
 */
function mina(seed: number, N: number, H: number, K: number): { w: World; wx: number; wy: number; g: number; Z0: number } {
  const { w, wx, wy, g } = sitPlat(seed, N + 8)
  const Z0 = g - 3 - H
  for (let z = Z0; z < Z0 + H; z++) for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) sapa(w, wx + x, wy + y, z)
  for (let x = N + 4; x <= N + 6; x++) for (let y = 0; y < N; y++) for (let z = g; z >= Z0; z--) sapa(w, wx + x, wy + y, z)
  for (let i = 0; i < K; i++) {
    const y = Math.floor(((i + 0.5) * N) / K)
    for (let x = N; x <= N + 3; x++) for (const z of [Z0, Z0 + 1]) sapa(w, wx + x, wy + y, z)
  }
  sincronizeazaLumea(w, R)
  return { w, wx, wy, g, Z0 }
}

/** O a doua hală, acoperită, departe: sub cel mai jos sol al ei. Întoarce locul și cota podelei. */
function halaDeparte(w: World, x0: number, y0: number): { x0: number; y0: number; z: number } {
  let jos = Infinity
  for (let a = -1; a <= 8; a++) for (let b = -1; b <= 8; b++) { const g = groundLevelM(w.terrain, x0 + a, y0 + b); assert.ok(g.ok); jos = Math.min(jos, g.value) }
  const z = jos - 5
  for (const zz of [z, z + 1]) for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) sapa(w, x0 + a, y0 + b, zz)
  sincronizeazaLumea(w, R)
  return { x0, y0, z }
}

const json = (i: IncapereLa | null): string => JSON.stringify(i)

// ---------------------------------------------------------------------------------------------
// EXP-4 / ECR-3: memoria inspectorului
// ---------------------------------------------------------------------------------------------

test('inspector (EXP-4): memoria incaperii — fuzz de editari aproape si departe: 0 raspunsuri invechite, iar editarile departe n-o invalideaza', () => {
  let s = 777
  const rnd = (n: number): number => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n }
  let apeluri = 0, reutilizari = 0, invechite = 0, departe = 0, reutilizariDeparte = 0, apeluriDeparte = 0
  for (const seed of [12345, 777, 4242]) {
    const N = 10 + rnd(4), H = 2 + rnd(3)
    const { w, wx, wy, g, Z0 } = mina(seed, N, H, 1 + rnd(3))
    const h = halaDeparte(w, wx + N + 40, wy)
    const celule: [number, number, number][] = []
    for (let i = 0; i < 6; i++) celule.push([wx + rnd(N + 8) - 1, wy + rnd(N + 2) - 1, Z0 - 1 + rnd(H + 2)])
    celule.push([h.x0 + 2, h.y0 + 2, h.z - 1])
    const memorii = celule.map(() => creeazaMemorieIncapere(() => 0))
    for (let i = 0; i < 150; i++) {
      const ldeparte = rnd(3) === 0
      let x: number, y: number, z: number
      if (ldeparte) { x = h.x0 - 1 + rnd(8); y = h.y0 - 1 + rnd(8); z = h.z - 1 + rnd(3) }
      else {
        x = wx - 12 + rnd(N + 24); y = wy - 12 + rnd(N + 24)
        const gg = groundLevelM(w.terrain, x, y)
        if (!gg.ok) continue
        z = rnd(3) === 0 ? Z0 - 1 + rnd(g - Z0 + 4) : gg.value - 1 + rnd(4)
      }
      const m = materialAt(w.terrain, x, y, z)
      if (!m.ok) continue
      const ok = isSolid(m.value) ? dig(w.terrain, x, y, z).ok : m.value === Material.AER ? fill(w.terrain, x, y, z, rnd(4) === 0 ? Material.USA : P).ok : false
      if (!ok) continue
      if (ldeparte) departe++
      sincronizeazaCamere(w.camere, w.terrain)
      celule.forEach(([cx, cy, cz], k) => {
        const mem = memorii[k]!
        const inainte = mem.calcule()
        // Clicul sare frâna: aici se măsoară doar memoria.
        const r = mem.ia(w, cx, cy, cz, true)
        apeluri++
        if (ldeparte && k < 6) apeluriDeparte++
        if (mem.calcule() === inainte) {
          reutilizari++
          if (ldeparte && k < 6) reutilizariDeparte++
          if (json(r) !== json(incaperea(w, cx, cy, cz))) invechite++
        }
      })
    }
  }
  assert.equal(invechite, 0, `${invechite} raspunsuri invechite din ${reutilizari} reutilizari`)
  assert.ok(reutilizari >= apeluri / 3, `memoria chiar tine: ${reutilizari} reutilizari din ${apeluri} apeluri`)
  assert.ok(departe >= 50 && reutilizariDeparte >= apeluriDeparte * 0.95, `editarile din hala departe (${departe}) nu invalideaza celulele minei: ${reutilizariDeparte} din ${apeluriDeparte}`)
})

test('inspector (ECR-3): sapaturile sub acoperis in ALTA componenta (epoca noua) si pionii care sapa departe nu refac explicatia', () => {
  const { w, wx, wy, Z0 } = mina(12345, 12, 3, 2)
  const h = halaDeparte(w, wx + 52, wy)
  let t = 0
  const mem = creeazaMemorieIncapere(() => t)
  const [x, y, z] = [wx + 2, wy + 6, Z0 - 1]
  assert.equal(mem.ia(w, x, y, z, true)?.e.fel, 'DESCHISA', 'mina e deschisa: explicatia e scumpa')
  // Hala de departe creste: fiecare sapatura muta epoca indexului (cheia veche, pe epoca, s-ar fi refacut).
  for (let i = 0; i < 10; i++) {
    const ep = w.camere.epoca
    sapa(w, h.x0 + 6, h.y0 + (i % 6), h.z + (i < 6 ? 0 : 1))
    sincronizeazaLumea(w, R)
    assert.notEqual(w.camere.epoca, ep, 'epoca noua')
    t += 250
    mem.ia(w, x, y, z, false)
  }
  assert.equal(mem.calcule(), 1, 'zece epoci noi in alta componenta: nicio recalculare')
  // Sase pioni care sapa la suprafata, la 50 m: 200 de tickuri (10 s), o reimprospatare la 5 tickuri.
  const px = wx + 50, py = wy + 30
  for (let dx = 0; dx < 6; dx++) for (let dy = 0; dy < 4; dy++) desemneaza(w, px + dx, py + dy)
  for (let i = 0; i < 6; i++) {
    const g = groundLevelM(w.terrain, px + i, py - 1)
    assert.ok(g.ok && applyCommand(w, { kind: 'spawnAgent', x: (px + i) * 1000 + 500, y: (py - 1) * 1000 + 500, z: g.value + 1, faction: Faction.ASEZARE }, R).ok)
  }
  const e0 = w.terrain.editari
  for (let p = 0; p < 40; p++) {
    ruleaza(w, 5)
    t += 250
    mem.ia(w, x, y, z, false)
  }
  assert.ok(w.terrain.editari - e0 >= 5, `pionii au sapat (${w.terrain.editari - e0} editari): altfel proba n-ar masura nimic`)
  assert.equal(mem.calcule(), 1, 'pionii de la 50 m: nicio recalculare')
  assert.equal(json(mem.ia(w, x, y, z, false)), json(incaperea(w, x, y, z)), 'raspunsul memorat e cel proaspat')
})

test('inspector (EXP-4): o editare langa componenta fara epoca noua (in fata tindei, in blocul vecin) si una la capatul departe al unei galerii lungi refac memoria', () => {
  // 1. Casa se termina la x = B−1 (B multiplu de 16), cu golul usii in zidul de est, sub acoperis; in fata
  //    lui, la x = B, o tinda fara acoperis intre doua cioturi de zid. Scurgerea e tinda: LATERAL (cer si
  //    spre est). Un bloc zidit la x = B+1, in blocul vecin, o inchide pe laturi — acum aerul iese doar
  //    in sus (SUS) —, fara sa atinga aer acoperit: nicio felie refacuta, epoca ramane. (Inainte de EXP-3,
  //    proba era cota gaurii langa gura unui put; cota se ia acum de pe drum, deci nu mai depinde de
  //    vecinii gurii.)
  {
    const { w, wx, wy, g } = sitPlat(777, 24)
    const B = Math.ceil((wx + 5) / 16) * 16
    const y0 = wy + 3, yu = wy + 5
    for (let z = g + 1; z <= g + 2; z++) {
      for (let x = B - 5; x <= B - 1; x++) for (let y = y0; y <= y0 + 4; y++) {
        const zid = x === B - 5 || x === B - 1 || y === y0 || y === y0 + 4
        if (zid && !(x === B - 1 && y === yu)) assert.ok(fill(w.terrain, x, y, z, P).ok)
      }
      assert.ok(fill(w.terrain, B, yu - 1, z, P).ok && fill(w.terrain, B, yu + 1, z, P).ok, 'cioturile tindei')
    }
    for (let x = B - 5; x <= B - 1; x++) for (let y = y0; y <= y0 + 4; y++) assert.ok(fill(w.terrain, x, y, g + 3, P).ok)
    sincronizeazaCamere(w.camere, w.terrain)
    const mem = creeazaMemorieIncapere(() => 0)
    const sel = [B - 3, yu, g] as const
    const e0 = mem.ia(w, ...sel, true)
    assert.ok(e0 && e0.e.fel === 'DESCHISA' && e0.e.directie === 'LATERAL' && e0.e.scurgere.x === B, json(e0))
    const ep = w.camere.epoca
    assert.ok(fill(w.terrain, B + 1, yu, g + 1, P).ok && fill(w.terrain, B + 1, yu, g + 2, P).ok)
    sincronizeazaCamere(w.camere, w.terrain)
    assert.equal(w.camere.epoca, ep, 'blocul din fata tindei nu atinge aer acoperit: epoca ramane')
    const proaspat = incaperea(w, ...sel)
    assert.ok(proaspat && proaspat.e.fel === 'DESCHISA' && proaspat.e.directie === 'SUS', `tinda inchisa pe laturi: aerul iese in sus (altfel proba n-ar masura nimic) — ${json(proaspat)}`)
    assert.equal(json(mem.ia(w, ...sel, true)), json(proaspat), 'memoria vede editarea din blocul vecin')
  }
  // 2. O galerie sigilata de 40 m (trei blocuri), intrebata la capatul de vest; un put la capatul de est.
  {
    const { w, wx, wy } = sitPlat(4242, 8)
    let jos = Infinity
    for (let x = wx - 1; x <= wx + 40; x++) for (let y = wy + 1; y <= wy + 3; y++) { const gg = groundLevelM(w.terrain, x, y); assert.ok(gg.ok); jos = Math.min(jos, gg.value) }
    const Z = jos - 5
    for (let x = wx; x < wx + 40; x++) for (const z of [Z, Z + 1]) sapa(w, x, wy + 2, z)
    sincronizeazaCamere(w.camere, w.terrain)
    const mem = creeazaMemorieIncapere(() => 0)
    const sel = [wx + 1, wy + 2, Z - 1] as const
    assert.equal(mem.ia(w, ...sel, true)?.e.fel, 'INCAPERE')
    const gEst = groundLevelM(w.terrain, wx + 39, wy + 2)
    assert.ok(gEst.ok)
    for (let z = gEst.value; z >= Z + 2; z--) sapa(w, wx + 39, wy + 2, z)
    sincronizeazaCamere(w.camere, w.terrain)
    assert.ok(Math.floor((wx + 39) / 16) - Math.floor((wx + 1) / 16) >= 2, 'putul e la cel putin doua blocuri de celula intrebata')
    assert.equal(mem.ia(w, ...sel, true)?.e.fel, 'DESCHISA', 'memoria acopera toata componenta, nu doar blocul celulei')
  }
})

test('inspector (EXP-6): acelasi zid intrebat pe doua fete — memoria tine si fata atinsa, nu doar celula', () => {
  const { w, wx, wy, g } = sitPlat(12345, 10)
  // Doua camere sub acelasi acoperis, despartite de zidul x = 3: A (x 1..2) are golul usii (1, 0), B (x 4..5) e inchisa.
  for (let z = g + 1; z <= g + 2; z++) for (let a = 0; a <= 6; a++) for (let b = 0; b <= 4; b++) {
    const zid = a === 0 || a === 3 || a === 6 || b === 0 || b === 4
    if (zid && !(a === 1 && b === 0)) assert.ok(fill(w.terrain, wx + a, wy + b, z, P).ok)
  }
  for (let a = 0; a <= 6; a++) for (let b = 0; b <= 4; b++) assert.ok(fill(w.terrain, wx + a, wy + b, g + 3, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const zid = [wx + 3, wy + 2, g + 1] as const
  const mem = creeazaMemorieIncapere(() => 0)
  const spreA = mem.ia(w, ...zid, true, { x: -1, y: 0, z: 0 })
  assert.equal(spreA?.e.fel, 'DESCHISA', `fata dinspre A: ${json(spreA)}`)
  const spreB = mem.ia(w, ...zid, true, { x: 1, y: 0, z: 0 })
  assert.equal(spreB?.e.fel, 'INCAPERE', `fata dinspre B, dupa A, pe aceeasi celula: ${json(spreB)}`)
  assert.equal(mem.calcule(), 2)
  assert.equal(json(mem.ia(w, ...zid, false, { x: 1, y: 0, z: 0 })), json(spreB), 'aceeasi fata: din memorie')
  assert.equal(mem.calcule(), 2)
})

test('inspector (EXP-4): frana — cu minerii in mina intrebata, o recalculare cel mult la max(250 ms, 20 × costul); un clic o sare', () => {
  const { w, wx, wy, Z0 } = mina(777, 10, 2, 1)
  const sel = [wx + 2, wy + 5, Z0 - 1] as const
  /** Un miner sapa, la fiecare 250 ms, un tunel spre vest din peretele minei (randul `y0`): fiecare editare e in componenta. */
  const ruleazaMinerii = (cost: number, y0: number): { calcule: number; vechi: number; mem: ReturnType<typeof creeazaMemorieIncapere>; avans: (ms: number) => void } => {
    let t = 0
    const mem = creeazaMemorieIncapere(() => t, (w2, x, y, z) => { t += cost; return incaperea(w2, x, y, z) })
    mem.ia(w, ...sel, true)
    let vechi = 0
    for (let p = 0; p < 40; p++) {
      sapa(w, wx - 1 - (p >> 1), wy + y0 + (p & 1), Z0)
      sincronizeazaCamere(w.camere, w.terrain)
      t += 250
      const c0 = mem.calcule()
      mem.ia(w, ...sel, false)
      if (mem.calcule() === c0) vechi++
    }
    return { calcule: mem.calcule(), vechi, mem, avans: (ms) => { t += ms } }
  }
  // Ieftina (5 ms): o recalculare la fiecare reimprospatare, ca inainte.
  const ieftin = ruleazaMinerii(5, 2)
  assert.equal(ieftin.calcule, 41)
  // Scumpa (40 ms): cel mult una la 800 ms — 10 s dau 11, nu 40.
  const scump = ruleazaMinerii(40, 6)
  assert.ok(scump.calcule >= 10 && scump.calcule <= 15, `${scump.calcule} recalculari in 10 s`)
  assert.ok(scump.vechi >= 25, `${scump.vechi} reimprospatari au aratat raspunsul de dinainte`)
  // Un clic (selectie, „Pune ușa") sare frana: intai unul care porneste fereastra, apoi o editare in ea.
  sapa(w, wx + 10, wy + 1, Z0 + 1)
  sincronizeazaCamere(w.camere, w.terrain)
  const c0 = scump.mem.calcule()
  scump.mem.ia(w, ...sel, true)
  assert.equal(scump.mem.calcule(), c0 + 1)
  sapa(w, wx + 10, wy + 2, Z0 + 1)
  sincronizeazaCamere(w.camere, w.terrain)
  scump.avans(10)
  scump.mem.ia(w, ...sel, false)
  assert.equal(scump.mem.calcule(), c0 + 1, 'fara clic, frana tine (raspunsul de dinainte)')
  scump.mem.ia(w, ...sel, true)
  assert.equal(scump.mem.calcule(), c0 + 2, 'clicul recalculeaza')
})

// ---------------------------------------------------------------------------------------------
// EXP-7 / ECR-12: textele, usa propusa, indiciul
// ---------------------------------------------------------------------------------------------

const deschisa = (usi: { x: number; y: number; z: number }[], volumCuUsi: number | null): Explicatie => {
  const c = { x: 0, y: 0, z: 1 }
  return { fel: 'DESCHISA', volum: 20, scurgere: c, dinainte: c, directie: 'LATERAL', gaura: { x: 0, y: 3, z: 1 }, pasi: 3, usiPropuse: usi, volumCuUsi }
}

test('incaperi (EXP-7): textul numara golurile, nu celulele — „o celulă", „Pune 2 uși"; usa desemnata nu mai cere „Pune ușa"; CER n-are text', () => {
  const c = { x: 0, y: 0, z: 1 }
  const t = (usi: { x: number; y: number; z: number }[], desemnata = false): string => textIncapere({ sub: false, celula: c, e: deschisa(usi, 18) }, desemnata).actiune
  assert.equal(t([{ x: 0, y: 3, z: 1 }]), 'Pune o ușă în gol (o celulă): devine o încăpere de 18 m³.')
  assert.equal(t([{ x: 0, y: 3, z: 1 }, { x: 0, y: 3, z: 2 }]), 'Pune o ușă în gol (două celule): devine o încăpere de 18 m³.')
  assert.equal(t([{ x: 0, y: 3, z: 1 }, { x: 1, y: 3, z: 1 }]), 'Pune o ușă în gol (două celule): devine o încăpere de 18 m³.', 'gol lat de 2: tot o usa')
  assert.equal(t([{ x: 0, y: 3, z: 1 }, { x: 0, y: 3, z: 2 }, { x: 5, y: 3, z: 1 }, { x: 5, y: 3, z: 2 }]), 'Pune 2 uși (4 celule): devine o încăpere de 18 m³.')
  assert.equal(goluriUsi([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }]), 2, 'pe diagonala: doua goluri')
  assert.equal(t([{ x: 0, y: 3, z: 1 }, { x: 0, y: 3, z: 2 }], true), 'Ușa e desemnată — o zidesc oamenii. Apoi devine o încăpere de 18 m³.')
  assert.match(t([{ x: 0, y: 3, z: 1 }, { x: 5, y: 3, z: 1 }], true), /^Ușile sunt desemnate — le zidesc oamenii\./)
  assert.equal(textIncapere({ sub: false, celula: c, e: { fel: 'CER' } }).titlu, '', 'incaperea() nu intoarce niciodata CER: ramura nu mai are text')
})

test('incaperi (ECR-12): usa propusa fata de desemnari — lipsa, apoi „desemnata" dupa „Pune ușa"; o jumatate desemnata altfel nu e usa', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  // Casa 5×5, ziduri pe g+1..g+2, acoperis, golul usii (2, 0) lasat deschis.
  for (let z = g + 1; z <= g + 2; z++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
    if ((a !== 0 && a !== 4 && b !== 0 && b !== 4) || (a === 2 && b === 0)) continue
    assert.ok(fill(w.terrain, wx + a, wy + b, z, P).ok)
  }
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) assert.ok(fill(w.terrain, wx + a, wy + b, g + 3, P).ok)
  sincronizeazaCamere(w.camere, w.terrain)
  const inc = incaperea(w, wx + 2, wy + 2, g)
  assert.ok(inc && inc.e.fel === 'DESCHISA' && inc.e.usiPropuse.length === 2, json(inc))
  const u0 = usilePropuse(w, inc)
  assert.deepEqual([u0.lipsa.length, u0.desemnata], [2, false])
  // O jumatate desemnata ca PERETE: nu e usa desemnata, iar „Pune ușa" ar pune doar cealalta.
  const perete = applyCommand(w, { kind: 'desemneaza', wx: wx + 2, wy, z: g + 2, piesa: Piesa.PERETE }, R)
  assert.ok(perete.ok)
  const u1 = usilePropuse(w, inc)
  assert.deepEqual([u1.lipsa.map((c) => c.z - g), u1.desemnata], [[1], false])
  // Cealalta jumatate desemnata USA: nimic lipsa, dar tot nu e o usa desemnata (sus e perete).
  const jos = applyCommand(w, { kind: 'desemneaza', wx: wx + 2, wy, z: g + 1, piesa: Piesa.USA }, R)
  assert.ok(jos.ok)
  const u2 = usilePropuse(w, inc)
  assert.deepEqual([u2.lipsa.length, u2.desemnata], [0, false], 'perete + usa nu e „Ușa e desemnată"')
  assert.ok(applyCommand(w, { kind: 'anuleazaDesemnarea', id: perete.value }, R).ok)
  assert.ok(applyCommand(w, { kind: 'anuleazaDesemnarea', id: jos.value }, R).ok)
  for (const c of u0.lipsa) assert.ok(applyCommand(w, { kind: 'desemneaza', wx: c.x, wy: c.y, z: c.z, piesa: Piesa.USA, prioritate: 5 }, R).ok)
  const u3 = usilePropuse(w, inc)
  assert.deepEqual([u3.lipsa.length, u3.desemnata], [0, true])
  assert.match(textIncapere(inc, u3.desemnata).actiune, /^Ușa e desemnată — o zidesc oamenii/)
})

test('incaperi (ECR-12): indiciul uneltei Usa nu spune „(plin)"/„(contur)" — spune ce face clicul si ce face dreptunghiul', () => {
  for (const cota of [null, 5]) {
    const s = textIndiciuUsa(cota)
    assert.doesNotMatch(s, /\((plin|contur)\)/)
    assert.match(s, /gol de perete/)
    assert.match(s, /trage = o ușă în fiecare gol/)
    assert.equal(/pe suprafață/.test(s), false, 'fara nivel, usa nu e „pe suprafață" (golul acoperit e sub varful coloanei)')
  }
  assert.match(textIndiciuUsa(5), /nivelul activ \(4 m\)/)
})

// ---------------------------------------------------------------------------------------------
// USA-4: usa dintr-o groapa, cu motivul memorat
// ---------------------------------------------------------------------------------------------

test('USA-4: o usa desemnata pe fundul unei gropi, cu FARA_LOC_SIGUR memorat — inspectorul spune „o ușă nu e treaptă", nu „Pune o scară sau o ușă"', () => {
  for (const seed of [12345, 777]) {
    // Groapa 3×3 de 2 m din tests/usa.test.ts, un pion pe fund, piatra, o USA pe fund.
    const { w, wx, wy, g } = sitPlat(seed, 18)
    const x0 = wx + 6, y0 = wy + 6
    for (const z of [g, g - 1]) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) applyCommand(w, { kind: 'dig', wx: x0 + dx, wy: y0 + dy, z }, R)
    const it = w.iteme
    for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && it.wx[i]! >= x0 - 1 && it.wx[i]! <= x0 + 3 && it.wy[i]! >= y0 - 1 && it.wy[i]! <= y0 + 3) stergeItem(it, i)
    assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (x0 + 1) * 1000 + 500, y: (y0 + 1) * 1000 + 500, z: g - 1, faction: Faction.ASEZARE }, R).ok)
    assert.ok(applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: 20, wx: x0, wy: y0, z: g - 1 }, R).ok)
    const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + 1, wy: y0 + 2, z: g - 1, piesa: Piesa.USA }, R)
    assert.ok(o.ok)
    ruleaza(w, 1500)
    const ds = slotDesemnare(w.desemnari, o.value)
    assert.equal(motivDinCod(w.desemnari.ultimulMotiv[ds]!), Reason.INACCESIBIL, `seed ${seed}: motivul memorat`)
    assert.equal(w.desemnari.ultimulMotivDetaliu[ds], DetaliuMotiv.FARA_LOC_SIGUR)
    const p = constructiaPrevizualizata(w, R)
    const previz = { cheie: 'x', imposibile: new Set(p.imposibile), faraAcces: new Map(p.faraAcces.map((k, i) => [k, p.cauze[i] ?? 0])), construibile: new Set(p.construibile), ms: 0 }
    const st = stareDesemnare(w, R, ds, previz)
    assert.equal(st.fel, 'motiv', 'ramura motivului memorat (inaintea previzualizarii)')
    assert.match(st.text.titlu, /o ușă nu e treaptă — nu scoate pe nimeni de acolo\./)
    assert.equal(st.text.actiune, 'Pune o scară până la ea.')
  }
})
