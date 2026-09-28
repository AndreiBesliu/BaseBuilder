/**
 * UI-ul de joc pe LUMI REALE: modelul (viewer/ui/model.ts) contra simularii, nu contra lui insusi.
 *
 * Ce se probeaza aici si nu se poate probea pe scene sintetice: cifrele din bara de sus se conserva
 * cat pionii cara; prioritatile se citesc pe pionul lor; modelul NU scrie in World (instantaneu
 * complet inainte si dupa); „De ce nu?" nu minte (o desemnare rezervata nu arata un motiv vechi, o
 * piesa fara sprijin nu spune „libera"); alerta de foame tace pe o colonie sanatoasa; modulele pure nu
 * trag three dupa ele; locul demo-ului e cel de azi.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { applyCommand } from '../src/sim/commands.ts'
import { Categorie, CATEGORII, Faction, FelJob, Item, NEVOI, Nevoie, Piesa } from '../src/sim/state.ts'
import { codMotiv, Reason } from '../src/sim/result.ts'
import { DetaliuMotiv } from '../src/sim/desemnari.ts'
import { tick } from '../src/sim/world.ts'
import type { World } from '../src/sim/state.ts'
import { Zona } from '../src/sim/zone.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { cauzaGolirii, creeazaPrevizualizare, golita, inspecteazaCelula, inspecteazaPion, prognozaHrana, randuriOameni, rezumatColonie, semnaleAlerte, stareDesemnare } from '../viewer/ui/model.ts'
import { locDemo, locJocNou } from '../viewer/ui/loc.ts'
import { planDreptunghi, normalizeaza, Unealta } from '../viewer/ui/dreptunghi.ts'
import { actualizeaza, creeazaAlerte, REGULI_ALERTE } from '../viewer/ui/alerte.ts'
import type { Semnal } from '../viewer/ui/alerte.ts'
import { laSit, lasaItem, lumeBogata, patratPlat, picteaza, R, ruleaza, solid } from './fixturi.ts'

test('model: resursele se conserva cat se cara (120 de piatra la FIECARE tick)', () => {
  const { w, sit } = laSit(12345, 6)
  for (let i = 0; i < 6; i++) lasaItem(w, Item.PIATRA, 20, sit.wx + 1 + i, sit.wy + 7)
  picteaza(w, sit.wx, sit.wy + 2, 3)
  let cuMarfa = 0
  for (let t = 0; t < 3000; t++) {
    tick(w, R)
    const p = rezumatColonie(w, R).marfa[Item.PIATRA]!
    // Valoarea e pe hartie: 6 × 20. Nu `marfaTotala`: aceea ar fi aceeasi suma, deci tautologie.
    assert.equal(p.total, 120, `tick ${w.tick}: ${JSON.stringify(p)}`)
    assert.equal(p.inDepozit + p.peJos + p.inMaini, p.total)
    if (p.inMaini > 0) cuMarfa++
  }
  assert.ok(cuMarfa > 0, 'nimeni n-a carat nimic: testul n-ar fi probat nimic')
})

test('model: prioritatile personale se citesc pe pionul lui, cu starea EFECTIVA (Exclusiv opreste restul)', () => {
  const { w } = laSit(4242, 3)
  const id1 = w.agents.id[1]!
  for (const [c, n] of [[Categorie.SAPA, 0], [Categorie.CARA, 2], [Categorie.CONSTRUIESTE, 3]] as const) {
    assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: id1, categorie: c, nivel: n }, R).ok)
  }
  const rs = randuriOameni(w, R)
  const r1 = rs.find((r) => r.id === id1)!
  assert.deepEqual(r1.prioritati.map((p) => p.nivel), [0, 2, 3])
  // Construieste e pe Exclusiv: CARA (2) e oprita, desi e nenula.
  assert.deepEqual(r1.prioritati.map((p) => p.activa), [false, false, true])
  const r0 = rs.find((r) => r.id === w.agents.id[0])!
  assert.deepEqual(r0.prioritati.map((p) => p.nivel), [1, 1, 1])
  assert.deepEqual(r0.prioritati.map((p) => p.activa), [true, true, true])
  assert.equal(CATEGORII, 3)
})

/** Un instantaneu COMPLET al lumii: fiecare TypedArray pe octeti, fiecare Map/Set sortat, fiecare primitiv. */
function instantaneu(x: unknown, cale = 'w', vazut = new Set<unknown>()): string[] {
  if (x === null || typeof x !== 'object') return typeof x === 'function' ? [] : [`${cale}=${String(x)}`]
  if (vazut.has(x)) return [`${cale}=<ref>`]
  vazut.add(x)
  if (ArrayBuffer.isView(x)) return [`${cale}=${Buffer.from(x.buffer, x.byteOffset, x.byteLength).toString('base64')}`]
  if (x instanceof Map) return [...x.entries()].map(([k, v]) => [String(k), v] as const).sort((a, b) => (a[0] < b[0] ? -1 : 1)).flatMap(([k, v]) => instantaneu(v, `${cale}[${k}]`, vazut))
  if (x instanceof Set) return [`${cale}={${[...x].map(String).sort().join(',')}}`]
  return Object.keys(x).sort().flatMap((k) => instantaneu((x as Record<string, unknown>)[k], `${cale}.${k}`, vazut))
}

/** O trecere a TOT UI-ului peste lume: fiecare cititor, pe fiecare desemnare, morman si celula de zona. */
function trecereUI(w: World): Map<string, Semnal> {
  const previz = creeazaPrevizualizare().ia(w, R)
  rezumatColonie(w, R)
  randuriOameni(w, R)
  for (let i = 0; i < w.agents.count; i++) if (w.agents.alive[i]) inspecteazaPion(w, R, w.agents.id[i]!)
  const d = w.desemnari
  for (let i = 0; i < d.count; i++) if (d.alive[i]) { inspecteazaCelula(w, R, d.wx[i]!, d.wy[i]!, d.z[i]!, previz); inspecteazaCelula(w, R, d.wx[i]!, d.wy[i]!, d.z[i]! - 1, previz) }
  for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i]) inspecteazaCelula(w, R, w.iteme.wx[i]!, w.iteme.wy[i]!, w.iteme.z[i]! - 1, previz)
  const zc = w.zone.celule
  for (let i = 0; i < zc.count; i++) if (zc.alive[i]) inspecteazaCelula(w, R, zc.wx[i]!, zc.wy[i]!, zc.z[i]! - 1, previz)
  const semnale = semnaleAlerte(w, R, previz)
  prognozaHrana(w, R)
  golita(w)
  cauzaGolirii(w, R)
  const s = { wx: w.agents.x[0]! / 1000 | 0, wy: w.agents.y[0]! / 1000 | 0 }
  const lumea = {
    solid: () => true, suprafata: () => 1, calcabil: () => true, desemnare: () => -1, inZona: () => false,
    desemnariIn: () => [], zoneIn: () => [],
  }
  planDreptunghi(normalizeaza(s.wx, s.wy, s.wx + 5, s.wy + 5), { unealta: Unealta.SAPA, piesa: 0, zonaFel: 0, contur: false, unStrat: false, prioritate: 3, zActiv: null, inaltimeOm: 2, locDesemnari: 10, locZone: 10 }, lumea)
  return semnale
}

function faraScriere(w: World, ce: string): Map<string, Semnal> {
  const inainte = instantaneu(w)
  const semnale = trecereUI(w)
  const dupa = instantaneu(w)
  assert.equal(dupa.length, inainte.length, ce)
  const diferite = inainte.filter((v, i) => v !== dupa[i])
  assert.deepEqual(diferite.map((v) => v.split('=')[0]), [], `campuri scrise de model (${ce})`)
  return semnale
}

test('model: nu scrie in World (instantaneu complet inainte si dupa o trecere a tot UI-ului)', () => {
  const w = lumeBogata(12345)
  ruleaza(w, 150)
  // Fixtura nu e vida: exista desemnari, mormane, zone, pioni cu ganduri.
  assert.ok(w.desemnari.vii > 0 && w.iteme.vii > 0 && w.zone.vii > 0)
  assert.ok(w.agents.gandFel.some((g) => g !== 0), 'niciun gand: inspectorul n-ar citi nimic')
  // Si fiecare RAMURA a „De ce nu?" (recenzia UI-ului, T-04: garda nu vedea tocmai ramurile cu tentatia
  // cea mai mare — previzualizarea, sprijinul de acum, blocatele): o podea imposibila, un perete peste
  // alt perete nezidit, o podea fara acces langa un stalp zidit, un refuz proaspat departe de orice.
  const sit = { wx: w.agents.x[0]! / 1000 | 0, wy: w.agents.y[0]! / 1000 | 0, g: 0 }
  const p = patratPlat(w, sit, 3, 14, 60)!
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: p.x0, wy: p.y0, z: p.g + 5, piesa: Piesa.PODEA }, R).ok)
  const q = patratPlat(w, sit, 3, 20, 70)!
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: q.x0, wy: q.y0, z: q.g + 1, piesa: Piesa.PERETE }, R).ok)
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: q.x0, wy: q.y0, z: q.g + 2, piesa: Piesa.PERETE }, R).ok)
  for (let h = 1; h <= 4; h++) assert.ok(applyCommand(w, { kind: 'fill', wx: q.x0 + 2, wy: q.y0 + 2, z: q.g + h, material: Material.PIATRA_CONSTRUITA }, R).ok)
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: q.x0 + 2, wy: q.y0 + 1, z: q.g + 4, piesa: Piesa.PODEA }, R).ok)
  const r = patratPlat(w, sit, 1, 30, 90)!
  const refuz = applyCommand(w, { kind: 'desemneaza', wx: r.x0, wy: r.y0, z: r.g }, R)
  assert.ok(refuz.ok)
  const dr = w.desemnari.laId.get(refuz.value as number)!
  w.desemnari.ultimulMotiv[dr] = codMotiv(Reason.INACCESIBIL)
  w.desemnari.ultimulMotivDetaliu[dr] = DetaliuMotiv.FARA_LOC_DE_LUCRU
  w.desemnari.reincercaLaTick[dr] = w.tick + 100
  const previz = creeazaPrevizualizare().ia(w, R)
  const d = w.desemnari
  const feluri = new Set<string>()
  for (let i = 0; i < d.count; i++) if (d.alive[i]) feluri.add(stareDesemnare(w, R, i, previz).fel)
  assert.deepEqual([...feluri].sort(), ['asteapta', 'faraAcces', 'imposibila', 'libera', 'lucru', 'motiv'], 'fixtura nu atinge fiecare ramura')
  const semnale = faraScriere(w, 'lumea bogata')
  for (const id of ['imposibile', 'blocate']) assert.equal(semnale.get(id)?.activ, true, id)

  // Mormane fara depozit, cu indexul zonelor MURDAR (tocmai pictat) si apoi la zi: ambele ramuri ale
  // lui `vedereFaraDepozit`, fara ca vreuna sa-l reconstruiasca.
  const f = laSit(4242, 2)
  for (let i = 0; i < 4; i++) lasaItem(f.w, Item.PIATRA, 50, f.sit.wx + i, f.sit.wy + 6)
  const pat = patratPlat(f.w, f.sit, 2, 10, 60)!
  picteaza(f.w, pat.x0, pat.y0, 2, undefined, R, Zona.DORMIT)
  // Un depozit de o celula (75) pentru 200 de piatra: pionii il folosesc, deci indexul se reconstruieste.
  const dep = patratPlat(f.w, f.sit, 1, 14, 70)!
  picteaza(f.w, dep.x0, dep.y0, 1)
  assert.equal(f.w.zone.index.murdar, true)
  faraScriere(f.w, 'index murdar')
  let t = 0
  do { ruleaza(f.w, 1) } while ((f.w.zone.index.murdar || f.w.tick < 40) && t++ < 400)
  assert.equal(f.w.zone.index.murdar, false, 'indexul n-a ajuns la zi')
  assert.equal(faraScriere(f.w, 'index la zi').get('fara-depozit')?.activ, true)
})

test('model: prognoza hranei pe puncte de nutritie (12 oameni, 600 de hrana ⇒ 26,0 min)', () => {
  const { w, sit } = laSit(777, 12)
  for (let i = 0; i < 8; i++) lasaItem(w, Item.HRANA, 75, sit.wx + i, sit.wy + 9)
  const p = prognozaHrana(w, R)
  // Pe hartie: 600 × 15 = 9.000 de puncte; 12 × 6 × (20 × 60 / 250) = 345,6 pe minut.
  assert.equal(p.puncte, 9000)
  assert.ok(Math.abs(p.consumPeMin - 345.6) < 1e-9, String(p.consumPeMin))
  assert.ok(Math.abs(p.minute - 26.04) < 0.01, String(p.minute))
  assert.equal(rezumatColonie(w, R).hrana.minute, p.minute)
})

test('model: o desemnare rezervata nu arata un motiv vechi; o piesa fara sprijin nu spune „libera"', () => {
  const { w, sit } = laSit(31337, 1)
  const g = solid(w, sit.wx + 2, sit.wy)!
  const id = applyCommand(w, { kind: 'desemneaza', wx: sit.wx + 2, wy: sit.wy, z: g }, R)
  assert.ok(id.ok)
  let t = 0
  while (w.agents.jobKind[0] !== FelJob.SAPA && t++ < 400) tick(w, R)
  assert.equal(w.agents.jobKind[0], FelJob.SAPA, 'pionul n-a luat sapatul')
  const ds = w.desemnari.laId.get(id.value as number)!
  // Un motiv memorat ramas de la alt refuz (TRANSIENT, scris de test).
  w.desemnari.ultimulMotiv[ds] = codMotiv(Reason.INACCESIBIL)
  w.desemnari.ultimulMotivDetaliu[ds] = DetaliuMotiv.FARA_LOC_DE_LUCRU
  const s = stareDesemnare(w, R, ds, null)
  assert.equal(s.fel, 'lucru')
  assert.doesNotMatch(s.text.titlu, /loc/)

  // O podea la sol+5, fara nimic in jur: n-ar sta in picioare nici dupa restul planului.
  const px = sit.wx + 6, py = sit.wy + 6
  const gp = solid(w, px, py)!
  const podea = applyCommand(w, { kind: 'desemneaza', wx: px, wy: py, z: gp + 5, piesa: Piesa.PODEA }, R)
  assert.ok(podea.ok)
  const dp = w.desemnari.laId.get(podea.value as number)!
  const previz = creeazaPrevizualizare().ia(w, R)
  assert.equal(stareDesemnare(w, R, dp, previz).fel, 'imposibila')
  // ...si bate orice motiv memorat, inclusiv „lipseste piatra".
  w.desemnari.ultimulMotiv[dp] = codMotiv(Reason.LIPSA_MATERIAL)
  assert.equal(stareDesemnare(w, R, dp, previz).fel, 'imposibila')
  // Fara previzualizare (motivul memorat singur): motivul, nu „libera".
  assert.equal(stareDesemnare(w, R, dp, null).fel, 'motiv')
})

test('model: previzualizarea se recalculeaza doar cand s-a schimbat terenul sau planul', () => {
  const { w, sit } = laSit(55555, 1)
  const g = solid(w, sit.wx + 3, sit.wy)!
  applyCommand(w, { kind: 'desemneaza', wx: sit.wx + 3, wy: sit.wy, z: g + 1, piesa: Piesa.PERETE }, R)
  const p = creeazaPrevizualizare()
  p.ia(w, R)
  p.ia(w, R)
  assert.equal(p.calculari(), 1)
  applyCommand(w, { kind: 'desemneaza', wx: sit.wx + 4, wy: sit.wy, z: g + 1, piesa: Piesa.PERETE }, R)
  p.ia(w, R)
  assert.equal(p.calculari(), 2)
})

test('model: asezarea golita e stare DERIVATA, iar alertele tac', () => {
  const { w } = laSit(99, 3)
  assert.equal(golita(w), false)
  for (let i = 0; i < w.agents.count; i++) applyCommand(w, { kind: 'killAgent', id: w.agents.id[i]! }, R)
  assert.equal(golita(w), false, 'morti, dar niciunul plecat: nu e „golita"')
  w.plecatiTotal = 3
  assert.equal(golita(w), true)
  assert.equal(semnaleAlerte(w, R, null).size, 0)
})

test('model: alerta de foame tace cat mancarea e la indemana si apare cand nu se ajunge la ea', () => {
  // Patru flamanzi, mancare destula (fiecare mananca ~44 de unitati; 75 pentru patru NU ajung — asa ar
  // fi o lipsa reala), pe doua mormane: unii mananca, altii asteapta sa se elibereze un loc — normal.
  const cu = laSit(2024, 4)
  lasaItem(cu.w, Item.HRANA, 75, cu.sit.wx + 2, cu.sit.wy + 2)
  lasaItem(cu.w, Item.HRANA, 75, cu.sit.wx + 3, cu.sit.wy + 2)
  lasaItem(cu.w, Item.HRANA, 75, cu.sit.wx + 4, cu.sit.wy + 2)
  // Aceiasi patru, cu mancarea la 150 de celule: dincolo de raza in care cauta un om.
  const departe = laSit(2024, 4)
  let dx = 150
  while (solid(departe.w, departe.sit.wx + dx, departe.sit.wy) === null) dx++
  lasaItem(departe.w, Item.HRANA, 75, departe.sit.wx + dx, departe.sit.wy)
  for (const w of [cu.w, departe.w]) for (let i = 0; i < w.agents.count; i++) w.agents.nevoi[i * NEVOI + Nevoie.FOAME] = R.nevoi[Nevoie.FOAME]!.prag - 50
  // Definitia, direct: sub prag, dar fara sa fi CAUTAT (un om care lucreaza si mananca dupa job — viata
  // normala), semnalul tace. Abia dupa o cautare esuata (`nevoieReincercaLaTick` in viitor) se aprinde.
  assert.equal(semnaleAlerte(cu.w, R, null).get('flamanzi')?.activ, false, 'flamand care n-a cautat inca')
  cu.w.agents.nevoieReincercaLaTick[0 * NEVOI + Nevoie.FOAME] = cu.w.tick + 100
  assert.equal(semnaleAlerte(cu.w, R, null).get('flamanzi')?.activ, true, 'a cautat si n-a gasit')
  cu.w.agents.nevoieReincercaLaTick[0 * NEVOI + Nevoie.FOAME] = 0
  const aCu = creeazaAlerte()
  const aDeparte = creeazaAlerte()
  let aMancat = 0
  let vazutaCu = 0
  let vazutaDeparte = 0
  for (let t = 0; t < 1600; t++) {
    tick(cu.w, R)
    tick(departe.w, R)
    for (let i = 0; i < cu.w.agents.count; i++) if (cu.w.agents.jobKind[i] === FelJob.MANANCA) aMancat++
    if (t % 10 !== 0) continue
    if (actualizeaza(aCu, REGULI_ALERTE, semnaleAlerte(cu.w, R, null), cu.w.tick, R.ticksPerSecond).some((x) => x.id === 'flamanzi')) vazutaCu++
    if (actualizeaza(aDeparte, REGULI_ALERTE, semnaleAlerte(departe.w, R, null), departe.w.tick, R.ticksPerSecond).some((x) => x.id === 'flamanzi')) vazutaDeparte++
  }
  assert.ok(aMancat > 0, 'nimeni n-a mancat: prima jumatate n-ar proba nimic')
  assert.equal(vazutaCu, 0, 'alerta de foame intr-o colonie cu mancare la doi pasi')
  assert.ok(vazutaDeparte > 0, 'mancarea de neatins trebuie sa aprinda alerta')
  assert.equal(semnaleAlerte(departe.w, R, null).get('fara-hrana')?.activ, false, 'mancare exista: nu e „fara hrana"')
})

test('model: alerta „nimeni-cara" pe categorii EFECTIVE (Sapa pe Exclusiv la toti)', () => {
  const { w, sit } = laSit(8080, 3)
  lasaItem(w, Item.PIATRA, 20, sit.wx + 3, sit.wy + 6)
  picteaza(w, sit.wx, sit.wy + 3, 2)
  assert.equal(semnaleAlerte(w, R, null).get('nimeni-cara')?.activ, false)
  for (let i = 0; i < w.agents.count; i++) applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[i]!, categorie: Categorie.SAPA, nivel: R.personalPriorityLevels }, R)
  // Cara are tot 1 (nenul) la toti — dar Exclusiv pe Sapa o opreste. „> 0" ar fi tacut.
  assert.equal(semnaleAlerte(w, R, null).get('nimeni-cara')?.activ, true)
})

test('modulele pure nu trag three (si proba negativa: overlay-joburi.ts il trage)', () => {
  const rad = resolve(import.meta.dirname, '..')
  const pure = ['viewer/ui/texte.ts', 'viewer/ui/nume.ts', 'viewer/ui/model.ts', 'viewer/ui/alerte.ts', 'viewer/ui/dreptunghi.ts', 'viewer/ui/salvari-plic.ts', 'viewer/ui/pornire.ts', 'viewer/ui/taste.ts', 'viewer/ui/loc.ts', 'viewer/ui/memorie-incapere.ts', 'viewer/tinta.ts']
  const cod = (f: string) => `import { registerHooks } from 'node:module'
registerHooks({ resolve(s, c, next) { if (s === 'three' || s.startsWith('three/')) throw new Error('TRAGE_THREE'); return next(s, c) } })
try { await import(${JSON.stringify(pathToFileURL(resolve(rad, f)).href)}); console.log('CURAT') } catch (e) { console.log(String(e.message).includes('TRAGE_THREE') ? 'THREE' : 'EROARE ' + e.message) }`
  const ruleaza = (f: string) => spawnSync(process.execPath, ['--input-type=module', '-e', cod(f)], { encoding: 'utf8' }).stdout.trim()
  for (const f of pure) assert.equal(ruleaza(f), 'CURAT', f)
  assert.equal(ruleaza('viewer/overlay-joburi.ts'), 'THREE', 'proba negativa: carligul trebuie sa vada three')
})

test('loc: demo-ul ramane pe locul de azi, iar jocul nou gaseste unul plat', () => {
  // 389/144 e locul pe care stau coordonatele din OWNER_VERIFY 13 (casa la 12388..12394, 4600..4606).
  assert.deepEqual(locDemo(20260913), { cx: 389, cy: 144 })
  const n = locJocNou(20260913)
  assert.ok(n.plate >= 400, `doar ${n.plate} ferestre plate din 676`)
  assert.ok(n.wx >= n.cx * 32 && n.wx < n.cx * 32 + 32 && n.wy >= n.cy * 32 && n.wy < n.cy * 32 + 32)
})

test('jefuitorii nu intra in randurile de oameni si nici in resurse', () => {
  const { w } = laSit(6060, 3, [Faction.ASEZARE, Faction.JEFUITOR, Faction.ASEZARE])
  assert.equal(randuriOameni(w, R).length, 2)
  const r = rezumatColonie(w, R)
  assert.equal(r.colonisti, 2)
  assert.equal(r.jefuitori, 1)
  const j = inspecteazaPion(w, R, w.agents.id[1]!)!
  assert.equal(j.factiune, Faction.JEFUITOR)
  assert.deepEqual(j.prioritati, [])
})

