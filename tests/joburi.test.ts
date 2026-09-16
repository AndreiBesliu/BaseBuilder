import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RULES, parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { createWorld, tick } from '../src/sim/world.ts'
import { Faction, PasJob } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { codMotiv, Reason } from '../src/sim/result.ts'
import { isSolid, Material } from '../src/sim/terrain/chunk.ts'
import { groundLevelM, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { areConnected, blockKey, blockOfCell, isWalkable, NO_REGION, regionAt } from '../src/sim/regions.ts'
import { cellKey } from '../src/sim/path.ts'
import { DetaliuMotiv, slotDesemnare } from '../src/sim/desemnari.ts'
import { celulaDeLucru, drumRefuzat, esteEvitata, lastJobReport, maiBun, StareRatiune } from '../src/sim/joburi.ts'
import type { JobTickReport } from '../src/sim/joburi.ts'
import { lastAgentReport } from '../src/sim/agents.ts'
import { dumpRezervari, verificaRezervari } from '../src/sim/rezervari.ts'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'

const R = DEFAULT_RULES

// ---------------------------------------------------------------------------
// fixturi
// ---------------------------------------------------------------------------

/** Cota solului SOLID la (wx, wy), sau null (apa, in afara lumii). */
function solid(w: World, wx: number, wy: number): number | null {
  const g = groundLevelM(w.terrain, wx, wy)
  if (!g.ok) return null
  const m = materialAt(w.terrain, wx, wy, g.value)
  return m.ok && isSolid(m.value) ? g.value : null
}

interface Sit { readonly wx: number; readonly wy: number; readonly g: number }

/**
 * Agenti pe ACELASI sit, unul langa altul — forma in care apar joburile: o
 * asezare, nu 40 de oameni imprastiati pe 16 km. Fiecare se naste pe cota
 * celulei LUI (pe panta vecinii au alt sol).
 */
function laSit(seed: number, cati: number, factiuni: readonly number[] = []): { w: World; sit: Sit } {
  const w = createWorld(seed)
  let sit: Sit | null = null
  for (let k = 1; k <= 8000 && !sit; k++) {
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = solid(w, wx, wy)
    if (g === null) continue
    let uscat = true
    for (let dx = -2; dx <= 8 && uscat; dx++) for (let dy = -2; dy <= 8; dy++) if (solid(w, wx + dx, wy + dy) === null) { uscat = false; break }
    if (uscat) sit = { wx, wy, g }
  }
  assert.ok(sit, 'niciun sit pe uscat')
  let pusi = 0
  for (let i = 0; i < cati; i++) {
    const cx = sit.wx + (i % 6)
    const cy = sit.wy + Math.floor(i / 6)
    const g = solid(w, cx, cy)
    if (g === null) continue
    const out = applyCommand(w, { kind: 'spawnAgent', x: cx * 1000 + 500, y: cy * 1000 + 500, z: g + 1, faction: (factiuni[i] ?? Faction.ASEZARE) as 0 | 1 | 2 }, R)
    if (out.ok) pusi++
  }
  assert.equal(pusi, cati, `doar ${pusi} din ${cati} agenti asezati la sit`)
  return { w, sit }
}

/**
 * O celula de sol solid pe una din cele patru directii, la o distanta Manhattan
 * (cu tot cu cota) intre `dMin` si `dMax` de (cx, cy, cz).
 */
function solidLaDistanta(w: World, cx: number, cy: number, cz: number, dMin: number, dMax: number): { wx: number; wy: number; g: number } {
  for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    for (let k = dMin; k <= dMax; k++) {
      const wx = cx + ux * k
      const wy = cy + uy * k
      if (wx < 0 || wy < 0) continue
      const g = solid(w, wx, wy)
      if (g === null) continue
      const d = k + Math.abs(g - cz)
      if (d >= dMin && d <= dMax) return { wx, wy, g }
    }
  }
  assert.fail(`niciun sol solid intre ${dMin} si ${dMax} in jurul lui ${cx},${cy},${cz}`)
}

/** Desemneaza celula de sol de la (wx, wy). Pica testul daca nu se poate. */
function desemneaza(w: World, wx: number, wy: number, prioritate?: number, rules: Rules = R): { id: number; z: number } {
  const g = solid(w, wx, wy)
  assert.notEqual(g, null, `nu e sol solid la ${wx},${wy}`)
  const out = applyCommand(w, { kind: 'desemneaza', wx, wy, z: g!, prioritate }, rules)
  assert.ok(out.ok, `desemnarea la ${wx},${wy},${g} refuzata: ${JSON.stringify(out)}`)
  return { id: out.ok ? out.value : -1, z: g! }
}

interface Totaluri extends JobTickReport { refuzuriAgenti: number; maxScanariPeTick: number }

/** Ruleaza N tickuri si aduna raportul de joburi. */
function ruleaza(w: World, ticks: number, rules: Rules = R, laFiecareTick?: (w: World) => void): Totaluri {
  const t: Totaluri = {
    scanari: 0, vizite: 0, candidatiExaminati: 0, candidatiTaiati: 0, coridoare: 0, joburiPornite: 0, joburiTerminate: 0, joburiAnulate: 0,
    tickuriDeLucru: 0, locuriDeLucruRefacute: 0, refuzuriDrum: 0, faraMuncitor: 0, preaDeparte: 0, inaccesibil: 0, rezervat: 0,
    faraDepozit: 0, evaluariDestinatie: 0, itemeProduse: 0, unitatiProduse: 0, itemeMutate: 0, lasateLaPicioare: 0,
    joburiDeNevoie: 0, unitatiMancate: 0, pasiNevoi: 0, plecati: 0, voxeliPrabusiti: 0, pioniCazuti: 0,
    refuzuriAgenti: 0, maxScanariPeTick: 0,
  }
  for (let i = 0; i < ticks; i++) {
    tick(w, rules)
    const r = lastJobReport()
    t.scanari += r.scanari; t.candidatiExaminati += r.candidatiExaminati; t.candidatiTaiati += r.candidatiTaiati; t.coridoare += r.coridoare
    t.joburiPornite += r.joburiPornite; t.joburiTerminate += r.joburiTerminate; t.joburiAnulate += r.joburiAnulate
    t.tickuriDeLucru += r.tickuriDeLucru; t.locuriDeLucruRefacute += r.locuriDeLucruRefacute; t.refuzuriDrum += r.refuzuriDrum
    t.faraMuncitor += r.faraMuncitor; t.preaDeparte += r.preaDeparte; t.inaccesibil += r.inaccesibil; t.rezervat += r.rezervat
    t.faraDepozit += r.faraDepozit; t.evaluariDestinatie += r.evaluariDestinatie; t.itemeProduse += r.itemeProduse; t.itemeMutate += r.itemeMutate; t.lasateLaPicioare += r.lasateLaPicioare
    t.refuzuriAgenti += lastAgentReport().refuzuri
    if (r.scanari > t.maxScanariPeTick) t.maxScanariPeTick = r.scanari
    if (laFiecareTick) laFiecareTick(w)
  }
  return t
}

/** Ruleaza pana cand conditia e adevarata, cel mult `max` tickuri. Intoarce tickurile rulate sau -1. */
function panaCand(w: World, max: number, cond: (w: World) => boolean, rules: Rules = R): number {
  for (let i = 0; i < max; i++) {
    if (cond(w)) return i
    tick(w, rules)
  }
  return cond(w) ? max : -1
}

function cuJob(w: World): number[] {
  const out: number[] = []
  for (let i = 0; i < w.agents.count; i++) if (w.agents.alive[i] === 1 && w.agents.jobKind[i] !== 0) out.push(i)
  return out
}

// ---------------------------------------------------------------------------
// desemnarile
// ---------------------------------------------------------------------------

test('desemnarea: cele patru refuzuri, acceptarea cu id, duplicatul, anularea', () => {
  const { w, sit } = laSit(101, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!

  const aer = applyCommand(w, { kind: 'desemneaza', wx: cx, wy: cy, z: cz }, R)
  assert.equal(aer.ok, false)
  if (!aer.ok) assert.equal(aer.reason, Reason.LIPSA_MATERIAL)

  const afara = applyCommand(w, { kind: 'desemneaza', wx: -1, wy: cy, z: sit.g }, R)
  assert.equal(afara.ok, false)
  if (!afara.ok) assert.equal(afara.reason, Reason.IN_AFARA_LUMII)

  const g = solid(w, cx + 1, cy)!
  for (const p of [0, R.designationPriorityLevels + 1, 2.5]) {
    const out = applyCommand(w, { kind: 'desemneaza', wx: cx + 1, wy: cy, z: g, prioritate: p }, R)
    assert.equal(out.ok, false, `prioritatea ${p} a trecut`)
    if (!out.ok) assert.equal(out.reason, Reason.VALOARE_INVALIDA)
  }

  const idInainte = w.nextId
  const ok = applyCommand(w, { kind: 'desemneaza', wx: cx + 1, wy: cy, z: g }, R)
  assert.ok(ok.ok)
  const id = ok.ok ? ok.value : -1
  assert.equal(id, idInainte)
  assert.equal(w.desemnari.vii, 1)
  assert.equal(w.desemnari.prioritate[0], R.designationPriorityDefault)

  const dup = applyCommand(w, { kind: 'desemneaza', wx: cx + 1, wy: cy, z: g }, R)
  assert.equal(dup.ok, false)
  if (!dup.ok) {
    assert.equal(dup.reason, Reason.DEJA_DESEMNATA)
    assert.equal(dup.params.id, id)
  }
  assert.equal(w.nextId, idInainte + 1)

  assert.ok(applyCommand(w, { kind: 'anuleazaDesemnarea', id }, R).ok)
  assert.equal(w.desemnari.vii, 0)
  const iar = applyCommand(w, { kind: 'anuleazaDesemnarea', id }, R)
  assert.equal(iar.ok, false)
  if (!iar.ok) assert.equal(iar.reason, Reason.ENTITATE_INEXISTENTA)
})

test('o desemnare sub baza de voxeli a chunk-ului e refuzata: acolo nu exista nimic de sapat, nici dupa promovare', () => {
  // Pe chunk-ul ne-promovat `materialAt` spunea ROCA la orice adancime, pe cel
  // promovat AER sub `zBaseM`: o desemnare la 30 m sub sol era acceptata si nu
  // putea fi sapata niciodata, dupa ce intinsese 750 de blocuri de acoperire.
  const { w } = laSit(103, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const g = solid(w, cx + 1, cy)!
  const adanc = applyCommand(w, { kind: 'desemneaza', wx: cx + 1, wy: cy, z: g - 40 }, R)
  assert.equal(adanc.ok, false)
  if (!adanc.ok) assert.equal(adanc.reason, Reason.IN_AFARA_LUMII)
  const m = materialAt(w.terrain, cx + 1, cy, g - 40)
  assert.ok(m.ok && m.value === Material.AER, 'calea derivata spune altceva decat ar spune chunk-ul promovat')
  // Iar chiar deasupra bazei se poate.
  const baza = g - 40 + 1
  void baza
})

test('un slot de desemnare reutilizat nu mosteneste racirea celei moarte', () => {
  const { w } = laSit(102, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!
  const adanc = applyCommand(w, { kind: 'desemneaza', wx: cx + 1, wy: cy, z: cz - 6 }, R)
  assert.ok(adanc.ok)
  ruleaza(w, 31)
  assert.ok(w.desemnari.reincercaLaTick[0]! > w.tick, 'fixtura: desemnarea adanca n-a primit racire')
  assert.ok(applyCommand(w, { kind: 'anuleazaDesemnarea', id: adanc.ok ? adanc.value : -1 }, R).ok)

  const noua = desemneaza(w, cx + 2, cy)
  assert.equal(w.desemnari.id[0], noua.id, 'fixtura: slotul 0 nu s-a reutilizat')
  assert.equal(w.desemnari.reincercaLaTick[0], 0, 'racirea mortului a fost mostenita')
  assert.equal(w.desemnari.ultimulMotiv[0], 0)
})

// ---------------------------------------------------------------------------
// cap la cap
// ---------------------------------------------------------------------------

test('un pion sapa desemnarea de langa el: voxelul devine AER, desemnarea dispare, rezervarile raman goale', () => {
  const { w } = laSit(201, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { z } = desemneaza(w, cx + 2, cy)

  const t = ruleaza(w, 400)
  const m = materialAt(w.terrain, cx + 2, cy, z)
  assert.ok(m.ok && m.value === Material.AER, `voxelul nu e sapat: ${JSON.stringify(m)}`)
  assert.equal(w.desemnari.vii, 0)
  assert.equal(t.joburiPornite, 1)
  assert.equal(t.joburiTerminate, 1)
  assert.equal(t.joburiAnulate, 0)
  // EXACT cate tickuri cere content-ul, nu „cel putin": la jumatate din munca
  // ar fi tot „cel putin 40".
  assert.equal(t.tickuriDeLucru, R.digWorkUnits / R.workUnitsPerTick)
  assert.equal(w.rezervari.total, 0)
  assert.ok(verificaRezervari(w.rezervari, w.agents).ok)
  assert.equal(w.agents.jobKind[0], 0)
  assert.equal(w.ratiune.joburiFaraProgres, 0)
})

test('doi pioni, o desemnare: exact unul o ia, celalalt afla REZERVAT', () => {
  const { w } = laSit(202, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  desemneaza(w, cx + 3, cy + 1)

  ruleaza(w, 31)
  const ocupati = cuJob(w)
  assert.equal(ocupati.length, 1, `${ocupati.length} pioni cu job pe o singura desemnare`)
  assert.equal(w.rezervari.total, 1)
  assert.ok(verificaRezervari(w.rezervari, w.agents).ok)
  const liber = ocupati[0] === 0 ? 1 : 0
  assert.equal(w.ratiune.stare[liber], StareRatiune.RESPINS)
  assert.equal(w.ratiune.motivFinal[liber], codMotiv(Reason.REZERVAT), 'pionul liber nu stie ca tinta e rezervata')
})

test('un JEFUITOR nu cere de lucru: desemnarile jucatorului sunt ale asezarii', () => {
  // Scannerul nu se uita la factiune; reprodus de recenzie: un jefuitor singur
  // langa o desemnare o sapa in 109 tickuri. DESIGN §5.5 il pune sub un
  // Commander AI, nu la tabla de joburi.
  const { w } = laSit(203, 2, [Faction.JEFUITOR, Faction.ASEZARE])
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { id } = desemneaza(w, cx + 3, cy + 1)
  const t = ruleaza(w, 2 * R.jobRescanTicks + 1)
  assert.equal(w.agents.jobKind[0], 0, 'jefuitorul a luat un job')
  assert.equal(w.ratiune.ultimaScanareTick[0], -1, 'jefuitorul a scanat')
  assert.equal(w.agents.jobTarget[1], id, 'pionul asezarii n-a luat desemnarea')
  assert.ok(t.scanari > 0)
})

test('prioritatea personala 0 inseamna NICIODATA, si se vede in cauza', () => {
  const { w } = laSit(204, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { id } = desemneaza(w, cx + 3, cy + 1)
  assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[0]!, categorie: 0, nivel: 0 }, R).ok)
  const t = ruleaza(w, 2 * R.jobRescanTicks + 1)
  assert.equal(w.agents.jobKind[0], 0, 'pionul cu prioritate 0 a luat un job')
  assert.equal(w.ratiune.motivFinal[0], codMotiv(Reason.FARA_MUNCITOR))
  assert.ok(t.faraMuncitor > 0)
  assert.equal(w.agents.jobTarget[1], id, 'celalalt n-a luat-o')
  // Si proba inversa: cu 1, o ia (dupa ce celalalt termina si o elibereaza).
  const n = panaCand(w, 600, (w) => w.desemnari.vii === 0)
  assert.ok(n >= 0)
  const noua = desemneaza(w, cx + 3, cy + 2)
  assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[0]!, categorie: 0, nivel: 1 }, R).ok)
  assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[1]!, categorie: 0, nivel: 0 }, R).ok)
  const m = panaCand(w, 2 * R.jobRescanTicks + 1, (w) => w.agents.jobTarget[0] === noua.id && w.agents.jobKind[0] !== 0)
  assert.ok(m >= 0, 'cu prioritate 1 pionul n-a luat jobul')
})

test('fara loc de lucru: nimeni n-o ia, cauza INACCESIBIL cu detaliul ei sta pe desemnare, si primeste racire', () => {
  const { w } = laSit(205, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!
  const out = applyCommand(w, { kind: 'desemneaza', wx: cx + 1, wy: cy, z: cz - 6 }, R)
  assert.ok(out.ok, `roca de la -6 nu e desemnabila: ${JSON.stringify(out)}`)

  const t = ruleaza(w, R.jobRescanTicks + 1)
  assert.equal(cuJob(w).length, 0)
  assert.equal(w.desemnari.vii, 1)
  assert.ok(t.inaccesibil > 0, 'fixtura: nimeni n-a evaluat desemnarea')
  assert.equal(w.desemnari.ultimulMotiv[0], codMotiv(Reason.INACCESIBIL))
  assert.equal(w.desemnari.ultimulMotivDetaliu[0], DetaliuMotiv.FARA_LOC_DE_LUCRU)
  assert.ok(w.desemnari.reincercaLaTick[0]! > w.tick, 'proprietatea tintei nu s-a memorat pe tinta')
  assert.equal(w.ratiune.stare[0], StareRatiune.RESPINS)
  assert.equal(w.ratiune.motivFinal[0], codMotiv(Reason.INACCESIBIL))

  const t2 = ruleaza(w, R.jobRescanTicks)
  assert.equal(t2.candidatiExaminati, 0, 'desemnarea in racire a fost reevaluata scump')
  assert.equal(w.ratiune.stare[0], StareRatiune.IN_ASTEPTARE)
})

test('alta componenta: INACCESIBIL cu detaliul „componente diferite", memorat scurt pe tinta, dupa ce un coridor a probat golul', () => {
  const { w } = laSit(206, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const px = cx + 4
  const py = cy
  const gp = solid(w, px, py)!
  for (let d = 0; d < 3; d++) {
    const out = applyCommand(w, { kind: 'dig', wx: px, wy: py, z: gp - d }, R)
    assert.ok(out.ok, `sapatura ${d}: ${JSON.stringify(out)}`)
  }
  tick(w, R)
  assert.ok(isWalkable(w.terrain, px, py, gp - 2, R), 'fixtura: fundul gropii nu e calcabil')
  const out = applyCommand(w, { kind: 'desemneaza', wx: px + 1, wy: py, z: gp - 2 }, R)
  assert.ok(out.ok, JSON.stringify(out))

  const t = ruleaza(w, 60)
  assert.equal(cuJob(w).length, 0, 'un pion a luat o desemnare la care nu poate ajunge')
  assert.ok(t.inaccesibil > 0, 'fixtura: desemnarea n-a fost evaluata')
  assert.equal(w.desemnari.ultimulMotiv[0], codMotiv(Reason.INACCESIBIL))
  assert.equal(w.desemnari.ultimulMotivDetaliu[0], DetaliuMotiv.COMPONENTE_DIFERITE)
  // Se memoreaza pe tinta cu racire scurta: altfel 300 de asemenea pereti ar
  // consuma plafonul la fiecare scanare.
  assert.ok(w.desemnari.reincercaLaTick[0]! > 0)
})

test('locul de lucru se alege IN COMPONENTA pionului: o groapa izolata inaintea unei trepte nu ascunde treapta', () => {
  // Recenzia: primul vecin in ordinea fixa (+x) era fundul unei gropi izolate,
  // treapta legata de suprafata (-x) nu era privita niciodata, iar tinta era
  // respinsa cu „leaga zonele" pentru zone legate.
  // Un tronson plat de CINCI celule pe randul pionului (cu o treapta la x+2
  // groapa de la x+1 s-ar lega de suprafata si n-ar mai fi izolata). Terenul
  // nu-l garanteaza la un seed anume, deci se cauta.
  let w!: World
  let x = -1
  let g = 0
  let cx = 0
  let cy = 0
  for (const seed of [207, 240, 241, 242, 243, 244, 245, 246, 247, 248]) {
    const lume = laSit(seed, 1)
    cx = cellOf(lume.w.agents.x[0]!)
    cy = cellOf(lume.w.agents.y[0]!)
    for (let dx = 4; dx <= 16 && x === -1; dx++) {
      const g0 = solid(lume.w, cx + dx, cy)
      if (g0 === null) continue
      let plat = true
      for (let k = -2; k <= 2; k++) if (solid(lume.w, cx + dx + k, cy) !== g0) plat = false
      for (const dy of [-1, 1]) if (solid(lume.w, cx + dx + 1, cy + dy) !== g0) plat = false
      if (plat) { x = cx + dx; g = g0; w = lume.w }
    }
    if (x !== -1) break
  }
  assert.notEqual(x, -1, 'fixtura: niciun tronson plat la niciun seed')
  // Treapta la -x (o singura sapatura: celula devine calcabila, legata prin pas de 1).
  assert.ok(applyCommand(w, { kind: 'dig', wx: x - 1, wy: cy, z: g }, R).ok)
  // Groapa izolata la +x, de doua adancimi.
  assert.ok(applyCommand(w, { kind: 'dig', wx: x + 1, wy: cy, z: g }, R).ok)
  assert.ok(applyCommand(w, { kind: 'dig', wx: x + 1, wy: cy, z: g - 1 }, R).ok)
  tick(w, R)
  // Tinta: voxelul de sub (x, cy), la g-1: vecinul +x la dz=0 e fundul gropii.
  const out = applyCommand(w, { kind: 'desemneaza', wx: x, wy: cy, z: g - 1 }, R)
  assert.ok(out.ok, JSON.stringify(out))
  const comp = regionAt(w.regions, cx, cy, w.agents.z[0]!)
  assert.notEqual(comp, NO_REGION)
  const oricare = celulaDeLucru(w.terrain, w.regions, w.desemnari, x, cy, g - 1, R)
  assert.ok(oricare && oricare.wx === x + 1, 'fixtura: primul loc in ordinea fixa nu e groapa')
  const n = panaCand(w, 200, (w) => w.agents.jobKind[0] !== 0)
  assert.ok(n >= 0, `desemnarea cu loc legat n-a fost luata (motiv ${w.desemnari.ultimulMotiv[0]}/${w.desemnari.ultimulMotivDetaliu[0]})`)
  assert.equal(w.agents.jobWorkX[0], x - 1, 'locul de lucru ales nu e treapta legata')
})

// ---------------------------------------------------------------------------
// scorul
// ---------------------------------------------------------------------------

test('scor: +1 nivel de prioritate merita EXACT jumatate din drum, +1 personal un sfert', () => {
  assert.equal(maiBun(3, 1, 21, 2, 1, 10), false)
  assert.equal(maiBun(2, 1, 10, 3, 1, 21), false)
  assert.equal(maiBun(3, 1, 20, 2, 1, 10), true)
  assert.equal(maiBun(3, 1, 22, 2, 1, 10), false)
  assert.equal(maiBun(2, 2, 43, 2, 1, 10), false)
  assert.equal(maiBun(2, 2, 42, 2, 1, 10), true)
  assert.equal(maiBun(1, 1, 0, 1, 1, 1), true)
})

test('pionul alege desemnarea cu scorul mai mare, nu pe cea mai apropiata', () => {
  const { w } = laSit(208, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const aproape = desemneaza(w, cx + 2, cy, 1)
  const departe = desemneaza(w, cx + 7, cy, 5)
  const n = panaCand(w, 40, (w) => w.agents.jobKind[0] !== 0)
  assert.ok(n >= 0, 'pionul n-a luat niciun job')
  assert.equal(w.agents.jobTarget[0], departe.id, `a ales-o pe cea apropiata (${aproape.id}) in loc de cea prioritara (${departe.id})`)
})

test('sortarea pe margine + iesirea timpurie: cea mai buna e gasita chiar daca e ULTIMA in ordinea id-ului', () => {
  // Recenzia: cu candidatii in ordinea slotului, o desemnare aproape cu
  // prioritate 3 era evaluata prima, apoi una departe cu marginea sub scorul ei
  // declansa iesirea timpurie, iar cea de la mijloc cu prioritate 5 — cea mai
  // buna — nu era evaluata niciodata.
  const { w } = laSit(209, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const aproape = desemneaza(w, cx + 2, cy, 3)
  const departe = desemneaza(w, cx + 20, cy, 1)
  const mijloc = desemneaza(w, cx + 5, cy, 5)
  void aproape; void departe
  const n = panaCand(w, 40, (w) => w.agents.jobKind[0] !== 0)
  assert.ok(n >= 0)
  assert.equal(w.agents.jobTarget[0], mijloc.id, 'nu s-a ales candidatul cu scorul cel mai mare')
})

test('cauza cea mai AVANSATA castiga: o tinta REZERVATA bate una PREA_DEPARTE in ratiunea pionului', () => {
  const { w } = laSit(210, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  desemneaza(w, cx + 3, cy + 1)
  const loc = solidLaDistanta(w, cx, cy, w.agents.z[0]!, 150, 300)
  desemneaza(w, loc.wx, loc.wy)
  ruleaza(w, 31)
  const ocupati = cuJob(w)
  assert.equal(ocupati.length, 1)
  const liber = ocupati[0] === 0 ? 1 : 0
  assert.equal(w.ratiune.motivFinal[liber], codMotiv(Reason.REZERVAT), 'cauza afisata e cea mai putin utila')
})

test('PREA_DEPARTE leaga: peste raza nu se evalueaza nimic, la raza se evalueaza', () => {
  // Decizia „munca dincolo de jobScanRadiusCells nu exista" n-avea garda.
  const { w } = laSit(211, 1)
  tick(w, R)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!
  const loc = solidLaDistanta(w, cx, cy, cz, 150, 300)
  desemneaza(w, loc.wx, loc.wy)
  // Cu raza mica pionul nu se misca destul ca sa conteze hoinareala: scanam direct.
  const t = ruleaza(w, R.jobRescanTicks + 1)
  assert.ok(t.preaDeparte > 0)
  assert.equal(t.candidatiExaminati, 0, 's-a facut o evaluare scumpa pentru o tinta in afara razei')
  assert.equal(w.ratiune.motivFinal[0], codMotiv(Reason.PREA_DEPARTE))
  assert.equal(w.desemnari.ultimulMotiv[0], 0, 's-a scris o cauza pe o tinta neevaluata')
  // Perechea: aceeasi lume, raza marita peste distanta ⇒ evaluata.
  const larg = { ...R, jobScanRadiusCells: 400, jobRegionRadiusBlocks: 21 }
  const t2 = ruleaza(w, R.jobRescanTicks + 1, larg)
  assert.ok(t2.candidatiExaminati >= 1, 'in raza, tinta n-a fost evaluata')
  void cx; void cy
})

// ---------------------------------------------------------------------------
// ciclul de viata al jobului
// ---------------------------------------------------------------------------

test('pierderea celulei de lucru in MERGE nu omoara jobul: se cauta alta, progresul ramane', () => {
  const { w } = laSit(212, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { z } = desemneaza(w, cx + 3, cy)
  const n = panaCand(w, 40, (w) => w.agents.jobKind[0] !== 0)
  assert.ok(n >= 0)
  const wx = w.agents.jobWorkX[0]!
  const wy = w.agents.jobWorkY[0]!
  const wz = w.agents.jobWorkZ[0]!
  assert.ok(wx !== cx || wy !== cy, 'fixtura: celula de lucru e chiar celula pionului')
  for (let h = 0; h < R.agentHeadroomM; h++) {
    const out = applyCommand(w, { kind: 'fill', wx, wy, z: wz + h, material: Material.PIATRA_CONSTRUITA }, R)
    assert.ok(out.ok, `zidul la h=${h}: ${JSON.stringify(out)}`)
  }
  const t = ruleaza(w, 400)
  assert.ok(t.locuriDeLucruRefacute >= 1, 'celula de lucru pierduta n-a fost refacuta')
  assert.equal(t.joburiAnulate, 0, 'jobul a fost anulat desi tinta avea alte locuri de lucru')
  const m = materialAt(w.terrain, cx + 3, cy, z)
  assert.ok(m.ok && m.value === Material.AER, 'voxelul n-a fost sapat pana la urma')
})

test('pierderea celulei de lucru in LUCREAZA (podeaua sapata de sub pion): alt loc, progresul PASTRAT', () => {
  // Ramura pe care nimic n-o parcurgea: mutantul care anula jobul si pierdea
  // progresul trecea 193/193. `dig` manual n-are CELULA_OCUPATA, deci jucatorul
  // poate sapa podeaua de sub un pion care lucreaza.
  const { w } = laSit(213, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { z } = desemneaza(w, cx + 3, cy)
  const n = panaCand(w, 200, (w) => w.agents.jobStep[0] === PasJob.LUCREAZA)
  assert.ok(n >= 0)
  ruleaza(w, 10)
  const progres = w.agents.jobProgres[0]!
  assert.ok(progres >= 100, `fixtura: progres ${progres}`)
  const px = cellOf(w.agents.x[0]!)
  const py = cellOf(w.agents.y[0]!)
  const pz = w.agents.z[0]!
  assert.ok(applyCommand(w, { kind: 'dig', wx: px, wy: py, z: pz - 1 }, R).ok, 'fixtura: podeaua nu s-a sapat')

  const t = ruleaza(w, 300)
  assert.ok(t.locuriDeLucruRefacute >= 1, 'locul de lucru n-a fost refacut')
  assert.equal(t.joburiAnulate, 0, 'jobul a fost anulat')
  assert.equal(w.desemnari.ultimulMotiv[0], 0, 'pe desemnare s-a scris un motiv care minte')
  const m = materialAt(w.terrain, cx + 3, cy, z)
  assert.ok(m.ok && m.value === Material.AER, 'voxelul n-a fost sapat pana la urma')
  // Progresul a fost pastrat: tickurile de lucru totale nu depasesc cu mult munca ceruta.
  assert.ok(t.tickuriDeLucru <= R.digWorkUnits / R.workUnitsPerTick, `${t.tickuriDeLucru} tickuri de lucru dupa mutare: progresul s-a pierdut`)
})

test('BUGET_DEPASIT e plafonat: jobul se incheie, tinta ramane LIBERA, racirea pe pereche LEAGA si apoi EXPIRA', () => {
  // `agentGoalRadiusCells: 2`: pionul hoinareste doar in jurul lui, ca distanta
  // pana la tinta sa nu iasa din raza de scanare intre timp.
  const reguli = { ...R, maxPathNodes: 64, replanCooldownTicks: 5, jobMaxIncercari: 3, jobRetryTicks: 150, agentGoalRadiusCells: 2 }
  const { w } = laSit(214, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const loc = solidLaDistanta(w, cx, cy, w.agents.z[0]!, 60, 90)
  const { id } = desemneaza(w, loc.wx, loc.wy, undefined, reguli)

  const n = panaCand(w, 40, (w) => w.agents.jobKind[0] !== 0, reguli)
  assert.ok(n >= 0, 'fixtura: pionul n-a luat jobul')
  assert.equal(w.agents.jobIncercari[0], 1, 'fixtura: primul drum n-a fost refuzat cu buget')
  assert.equal(w.ratiune.stare[0], StareRatiune.ASTEAPTA_DRUM)
  assert.equal(w.ratiune.motivFinal[0], codMotiv(Reason.BUGET_DEPASIT))
  ruleaza(w, 2, reguli)
  assert.notEqual(w.agents.jobKind[0], 0, 'fixtura: jobul s-a incheiat inainte de plafon')

  const m = panaCand(w, 40, (w) => w.agents.jobKind[0] === 0, reguli)
  assert.ok(m >= 0, 'pionul a ramas parcat cu tinta rezervata')
  assert.equal(w.rezervari.total, 0)
  assert.ok(esteEvitata(w, 0, id), 'racirea nu s-a scris pe pereche')
  assert.equal(w.desemnari.reincercaLaTick[0], 0, 'racirea a fost pusa pe TINTA, desi era a pionului')
  assert.equal(w.desemnari.ultimulMotiv[0], codMotiv(Reason.BUGET_DEPASIT))
  assert.equal(w.ratiune.joburiFaraProgres, 1)

  // Racirea LEAGA: pe raport, nu pe stare la un moment in faza cu ciclul —
  // recenzia a aratat ca `jobKind === 0` dupa 60 de tickuri era verde si cu
  // scannerul ignorand racirea, fiindca fiecare reluare se incheia in 10 tickuri.
  const cat = ruleaza(w, reguli.jobRetryTicks - 15, reguli)
  assert.equal(cat.joburiPornite, 0, 'pionul a reluat tinta refuzata in timpul racirii')
  assert.equal(cat.refuzuriDrum, 0)
  // Si EXPIRA: dupa termen o reia (altfel o racire infinita ar fi si ea verde).
  const dupa = ruleaza(w, 60, reguli)
  assert.ok(dupa.joburiPornite >= 1, 'racirea nu expira niciodata')
})

test('doua tinte peste buget nu se sterg reciproc din racire: pionul nu alterneaza, si ia munca fezabila', () => {
  // Recenzia: cu un singur slot de racire, a doua tinta refuzata o stergea pe
  // prima si pionul le alterna pe viata — 59 de A*-uri esuate in 1200 de
  // tickuri, zero munca, chiar cu o a treia tinta fezabila la 6 celule.
  const reguli = { ...R, maxPathNodes: 64, replanCooldownTicks: 5, jobMaxIncercari: 3 }
  const { w } = laSit(215, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!
  const a = solidLaDistanta(w, cx, cy, cz, 60, 90)
  desemneaza(w, a.wx, a.wy, 5, reguli)
  const b = solidLaDistanta(w, cx, cy + 1, cz, 60, 90)
  assert.ok(b.wx !== a.wx || b.wy !== a.wy, 'fixtura: aceeasi celula')
  const idB = desemneaza(w, b.wx, b.wy, 5, reguli).id
  const idA = w.desemnari.id[0]!
  const buna = desemneaza(w, cx + 3, cy, 1, reguli)

  const t = ruleaza(w, 1200, reguli)
  assert.ok(esteEvitata(w, 0, idA) || w.desemnari.vii < 3, 'fixtura: A n-a fost niciodata refuzata')
  assert.ok(esteEvitata(w, 0, idB) || w.desemnari.vii < 3, 'fixtura: B n-a fost niciodata refuzata')
  // Doua tinte × 3 incercari = 6 refuzuri, cel mult inca o runda dupa expirare.
  assert.ok(t.refuzuriDrum <= 2 * reguli.jobMaxIncercari * 2, `${t.refuzuriDrum} refuzuri de drum: pionul alterneaza intre tintele refuzate`)
  // Si munca fezabila s-a facut.
  const m = materialAt(w.terrain, cx + 3, cy, buna.z)
  assert.ok(m.ok && m.value === Material.AER, 'tinta fezabila n-a fost sapata')
})

test('OCUPAT_DE_OSTIL (D7c): pionul blocat renunta la pereche, iar cel liber ia tinta imediat', () => {
  const reguli = { ...R, jobMaxIncercari: 2 }
  const { w } = laSit(216, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { id } = desemneaza(w, cx + 3, cy + 1, undefined, reguli)
  const n = panaCand(w, 40, (w) => cuJob(w).length === 1, reguli)
  assert.ok(n >= 0)
  const blocat = cuJob(w)[0]!
  const liber = blocat === 0 ? 1 : 0

  drumRefuzat(w, reguli, blocat, Reason.OCUPAT_DE_OSTIL)
  assert.notEqual(w.agents.jobKind[blocat], 0, 'a renuntat de la primul refuz')
  drumRefuzat(w, reguli, blocat, Reason.OCUPAT_DE_OSTIL)
  assert.equal(w.agents.jobKind[blocat], 0, 'plafonul de incercari nu leaga')
  assert.equal(w.rezervari.total, 0)
  assert.ok(esteEvitata(w, blocat, id))
  assert.equal(w.desemnari.reincercaLaTick[0], 0, 'tinta a primit racire pentru un refuz care era al pionului')

  const m = panaCand(w, 2 * reguli.jobRescanTicks + 1, (w) => w.agents.jobKind[liber] !== 0 && w.agents.jobTarget[liber] === id, reguli)
  assert.ok(m >= 0, 'pionul liber n-a luat tinta pe care celalalt n-o putea atinge')
})

test('un ostil care STA pe prima celula de lucru nu blocheaza desemnarea: se alege alta celula', () => {
  // Recenzia: 9 joburi pornite, 0 terminate, singura celula aleasa vreodata era
  // cea ocupata, desi tinta avea alte trei locuri de lucru.
  const { w } = laSit(217, 2, [Faction.ASEZARE, Faction.JEFUITOR])
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { z } = desemneaza(w, cx + 3, cy + 2)
  tick(w, R)
  const primul = celulaDeLucru(w.terrain, w.regions, w.desemnari, cx + 3, cy + 2, z, R)
  assert.ok(primul, 'fixtura: fara loc de lucru')
  // Ostilul e tinut pe prima celula de lucru, la fiecare tick.
  const ostil = 1
  const tine = (w: World): void => {
    w.agents.x[ostil] = primul.wx * 1000 + 500
    w.agents.y[ostil] = primul.wy * 1000 + 500
    w.agents.z[ostil] = primul.z
    w.agents.hasGoal[ostil] = 0
    w.paths.len[ostil] = 0
    w.paths.cursor[ostil] = 0
  }
  tine(w)
  const t = ruleaza(w, 600, R, tine)
  assert.equal(w.desemnari.vii, 0, 'desemnarea n-a fost sapata, desi avea alte locuri de lucru')
  assert.ok(t.joburiTerminate >= 1)
  const m = materialAt(w.terrain, cx + 3, cy + 2, z)
  assert.ok(m.ok && m.value === Material.AER)
})

test('scanarea e decalata pe id: 40 de pioni x 30 de tickuri = exact 40 de scanari, cel mult 2 pe tick', () => {
  const w = createWorld(218)
  let pusi = 0
  for (let k = 1; k <= 8000 && pusi < 40; k++) {
    const wx = (k * 1237 + 218) % WORLD_CELLS
    const wy = (k * 7919 + 218 * 31) % WORLD_CELLS
    const g = solid(w, wx, wy)
    if (g === null) continue
    if (applyCommand(w, { kind: 'spawnAgent', x: wx * 1000 + 500, y: wy * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok) pusi++
  }
  assert.equal(pusi, 40)
  const t = ruleaza(w, R.jobRescanTicks)
  assert.equal(t.scanari, 40, `${t.scanari} scanari in ${R.jobRescanTicks} tickuri`)
  // Decalajul insusi: fara el, toate 40 ar cadea in tickul 0 si totalul ar fi tot 40.
  assert.ok(t.maxScanariPeTick <= Math.ceil(40 / R.jobRescanTicks), `${t.maxScanariPeTick} scanari intr-un tick: nu e decalat`)
})

test('dupa un job incheiat pionul cere de lucru la tickul urmator, nu hoinareste pana la decalaj', () => {
  // Masurat de recenzie: 21,6% din timpul unei cariere se ducea pe plimbare
  // aleatoare intre doua joburi.
  const { w } = laSit(219, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  desemneaza(w, cx + 2, cy)
  desemneaza(w, cx + 2, cy + 1)
  const n = panaCand(w, 400, () => lastJobReport().joburiTerminate > 0)
  assert.ok(n >= 0)
  const tickTerminat = w.tick
  const m = panaCand(w, 5, (w) => w.agents.jobKind[0] !== 0)
  assert.ok(m >= 0 && w.tick - tickTerminat <= 2, `al doilea job a pornit la ${w.tick - tickTerminat} tickuri dupa primul`)
})

test('anularea de catre jucator in timpul lucrului: INTRERUPT, rezervare eliberata, pion liber', () => {
  const { w } = laSit(220, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { id } = desemneaza(w, cx + 2, cy)
  const n = panaCand(w, 200, (w) => w.agents.jobStep[0] === PasJob.LUCREAZA)
  assert.ok(n >= 0, 'pionul n-a ajuns sa lucreze')
  ruleaza(w, 5)
  assert.ok(w.agents.jobProgres[0]! > 0)

  assert.ok(applyCommand(w, { kind: 'anuleazaDesemnarea', id }, R).ok)
  assert.equal(w.agents.jobKind[0], 0)
  assert.equal(w.agents.hasGoal[0], 0)
  assert.equal(w.rezervari.total, 0)
  assert.equal(w.desemnari.vii, 0)
  assert.equal(lastJobReport().joburiAnulate, 1)
  assert.equal(w.ratiune.joburiFaraProgres, 0, 'un ordin al jucatorului a tras zavorul')
  assert.ok(verificaRezervari(w.rezervari, w.agents).ok)
})

test('sapatul manual pe o celula desemnata ia desemnarea si intrerupe jobul', () => {
  const { w } = laSit(221, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { z } = desemneaza(w, cx + 2, cy)
  const n = panaCand(w, 200, (w) => w.agents.jobStep[0] === PasJob.LUCREAZA)
  assert.ok(n >= 0)
  assert.ok(applyCommand(w, { kind: 'dig', wx: cx + 2, wy: cy, z }, R).ok)
  assert.equal(w.agents.jobKind[0], 0)
  assert.equal(w.desemnari.vii, 0)
  assert.equal(w.rezervari.total, 0)
})

test('killAgent elibereaza rezervarea; slotul reutilizat nu mosteneste jobul, prioritatea, nici racirile', () => {
  const { w } = laSit(222, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { id } = desemneaza(w, cx + 3, cy + 1)
  const n = panaCand(w, 40, (w) => cuJob(w).length === 1)
  assert.ok(n >= 0)
  const mort = cuJob(w)[0]!
  const idMort = w.agents.id[mort]!
  assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: idMort, categorie: 0, nivel: 0 }, R).ok)
  w.agents.evitaTinta[mort * w.agents.evitaSloturi] = 999
  w.agents.evitaPanaLa[mort * w.agents.evitaSloturi] = w.tick + 1000

  assert.ok(applyCommand(w, { kind: 'killAgent', id: idMort }, R).ok)
  assert.equal(w.rezervari.total, 0, 'mortul tine inca rezervarea')
  assert.ok(verificaRezervari(w.rezervari, w.agents).ok)
  assert.equal(w.desemnari.reincercaLaTick[0], 0, 'moartea a pus racire pe tinta')

  const g = solid(w, cx + 2, cy + 2)!
  const nou = applyCommand(w, { kind: 'spawnAgent', x: (cx + 2) * 1000 + 500, y: (cy + 2) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R)
  assert.ok(nou.ok)
  const slotNou = mort
  assert.equal(w.agents.id[slotNou], nou.ok ? nou.value : -1, 'fixtura: slotul mortului nu s-a reutilizat')
  assert.equal(w.agents.jobKind[slotNou], 0, 'nou-nascutul a mostenit jobul mortului')
  assert.equal(w.agents.prioPersonala[slotNou], R.personalPriorityDefault, 'nou-nascutul a mostenit prioritatea mortului')
  assert.equal(esteEvitata(w, slotNou, 999), false, 'nou-nascutul a mostenit racirile mortului')

  const m = panaCand(w, 2 * R.jobRescanTicks + 1, (w) => cuJob(w).some((i) => w.agents.jobTarget[i] === id))
  assert.ok(m >= 0, 'tinta mortului n-a fost reluata de nimeni')
})

test('doua desemnari vecine, doi pioni: nimeni nu sta pe voxelul desemnat al altuia, ambele se sapa fara anulari', () => {
  const { w } = laSit(223, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const a = desemneaza(w, cx + 3, cy)
  const b = desemneaza(w, cx + 4, cy)

  let peDesemnare = 0
  const t = ruleaza(w, 600, R, (w) => {
    for (let i = 0; i < w.agents.count; i++) {
      if (w.agents.alive[i] === 0 || w.agents.jobStep[i] !== PasJob.LUCREAZA) continue
      const k = cellKey(cellOf(w.agents.x[i]!), cellOf(w.agents.y[i]!), w.agents.z[i]! - 1)
      if (w.desemnari.laCelula.has(k)) peDesemnare++
    }
  })
  assert.equal(peDesemnare, 0, `de ${peDesemnare} ori un pion a lucrat stand pe un voxel desemnat`)
  assert.equal(t.joburiTerminate, 2)
  assert.equal(t.joburiAnulate, 0)
  assert.equal(w.ratiune.joburiFaraProgres, 0)
  assert.equal(w.desemnari.vii, 0)
  const ma = materialAt(w.terrain, cx + 3, cy, a.z)
  const mb = materialAt(w.terrain, cx + 4, cy, b.z)
  assert.ok(ma.ok && ma.value === Material.AER && mb.ok && mb.value === Material.AER)
})

test('INFOMETARE: 300 de desemnari fara loc de lucru inaintea uneia bune nu o ascund pe cea buna', () => {
  const reguli = { ...R, jobScanMaxCandidates: 256, jobInfeasibleRetryTicks: 100 }
  const { w } = laSit(224, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!
  let adanci = 0
  for (let dx = 0; dx < 10 && adanci < 300; dx++) {
    for (let dy = 0; dy < 30 && adanci < 300; dy++) {
      const g = solid(w, cx + 1 + dx, cy + 1 + dy)
      if (g === null) continue
      const out = applyCommand(w, { kind: 'desemneaza', wx: cx + 1 + dx, wy: cy + 1 + dy, z: g - 8 }, reguli)
      if (out.ok) adanci++
    }
  }
  assert.equal(adanci, 300, `doar ${adanci} desemnari adanci`)
  const loc = solidLaDistanta(w, cx, cy, cz, 52, 70)
  const buna = desemneaza(w, loc.wx, loc.wy, undefined, reguli)

  ruleaza(w, reguli.jobRescanTicks, reguli)
  assert.equal(w.ratiune.stare[0], StareRatiune.PLAFON, 'fixtura: prima scanare n-a atins plafonul')
  assert.ok(w.ratiune.taiati[0]! > 0)
  assert.equal(w.agents.jobKind[0], 0)

  const n = panaCand(w, 2 * reguli.jobRescanTicks + 1, (w) => w.agents.jobKind[0] !== 0, reguli)
  assert.ok(n >= 0, 'desemnarea buna a ramas ascunsa in spatele celor 300')
  assert.equal(w.agents.jobTarget[0], buna.id)
})

test('racirea pe tinta acopera TOATE desemnarile vii, nu doar o fereastra: cu 1700 fara loc, cea buna e tot evaluata', () => {
  // Recenzia: cu racire de 100 si 256 evaluari per scanare la 30 de tickuri,
  // exact 1024 desemnari primeau vreodata un motiv; primele expirau si reintrau
  // in fata. Racirea se deriva acum din cate desemnari vii sunt.
  // `agentGoalRadiusCells: 2`: pionul sta pe loc, ca raza de scanare sa nu
  // taie candidatii diferit de la o scanare la alta.
  const reguli = { ...R, jobScanMaxCandidates: 256, jobInfeasibleRetryTicks: 100, designationCapacity: 4096, agentGoalRadiusCells: 2 }
  const { w } = laSit(225, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!
  let adanci = 0
  for (let dx = 0; dx < 42 && adanci < 1700; dx++) {
    for (let dy = 0; dy < 42 && adanci < 1700; dy++) {
      const g = solid(w, cx + 1 + dx, cy + 1 + dy)
      if (g === null) continue
      if (applyCommand(w, { kind: 'desemneaza', wx: cx + 1 + dx, wy: cy + 1 + dy, z: g - 8 }, reguli).ok) adanci++
    }
  }
  assert.ok(adanci >= 1500, `doar ${adanci} desemnari adanci`)
  const loc = solidLaDistanta(w, cx, cy, cz, 80, 90)
  const buna = desemneaza(w, loc.wx, loc.wy, undefined, reguli)
  const scanariNecesare = Math.ceil((adanci + 1) / reguli.jobScanMaxCandidates)
  const n = panaCand(w, (scanariNecesare + 3) * reguli.jobRescanTicks, (w) => w.agents.jobKind[0] !== 0, reguli)
  assert.ok(n >= 0, `cea buna n-a fost evaluata in ${scanariNecesare + 3} scanari`)
  assert.equal(w.agents.jobTarget[0], buna.id)
})

// ---------------------------------------------------------------------------
// acoperirea
// ---------------------------------------------------------------------------

test('un pion nascut in discul altuia, la marginea lui, tot ajunge la o desemnare la 6 blocuri: coridorul inchide golul', () => {
  // Invariantul „discul pionului si al desemnarii se ating" presupunea pionul in
  // CENTRUL discului. Recenzia: pionul B nascut la un bloc de A n-are disc
  // propriu; o desemnare la 96 de celule de B cadea intr-un gol necalculat —
  // COMPONENTE_DIFERITE pe veci, drum real de 105 celule.
  // Geometria: A la blocul 0 (leaga 0..2, muchii pana la 3); B la blocul +2, in
  // discul lui A; D la ≥ 5 blocuri de B pe +x, deci ≥ 7 de A — discul lui D
  // (leaga 5..9, muchii de la 4) nu atinge muchiile lui A (3): gol la 3–4.
  // Terenul trebuie sa lase D in raza de 96 (cu tot cu cota): se cauta un seed.
  // `agentGoalRadiusCells: 2`: B sta pe loc, ca tinta sa ramana in raza lui.
  const reguli = { ...R, agentGoalRadiusCells: 2 }
  let gasit = false
  for (const seed of [226, 228, 229, 230, 231, 232, 233, 234]) {
    const { w } = laSit(seed, 1)
    tick(w, reguli)
    const ax = cellOf(w.agents.x[0]!)
    const ay = cellOf(w.agents.y[0]!)
    const bx = ax + 32
    const gb = solid(w, bx, ay)
    if (gb === null) continue
    const nou = applyCommand(w, { kind: 'spawnAgent', x: bx * 1000 + 500, y: ay * 1000 + 500, z: gb + 1, faction: Faction.ASEZARE }, reguli)
    if (!nou.ok) continue
    tick(w, reguli)
    const bb = blockOfCell(bx, ay)
    assert.ok(w.regions.legate.has(blockKey(bb.bx, bb.by, gb + 1)), 'fixtura: B nu e intr-un bloc legat')
    let dx = -1
    let gd = 0
    for (let k = 92; k >= 80; k--) {
      const g = solid(w, bx + k, ay)
      if (g !== null && k + Math.abs(g - (gb + 1)) <= reguli.jobScanRadiusCells - 4) { dx = bx + k; gd = g; break }
    }
    if (dx === -1) continue
    const out = applyCommand(w, { kind: 'desemneaza', wx: dx, wy: ay, z: gd }, reguli)
    if (!out.ok) continue
    const id = out.value
    const t = ruleaza(w, 4 * reguli.jobRescanTicks, reguli)
    const luata = cuJob(w).some((i) => w.agents.jobTarget[i] === id) || w.desemnari.vii === 0
    assert.ok(luata, `seed ${seed}: desemnarea de la ≥5 blocuri de B n-a fost luata (motiv ${w.desemnari.ultimulMotiv[0]}/${w.desemnari.ultimulMotivDetaliu[0]}, coridoare ${t.coridoare})`)
    assert.ok(t.coridoare >= 1, `seed ${seed}: s-a luat fara coridor — fixtura n-are gol de acoperire`)
    gasit = true
    break
  }
  assert.ok(gasit, 'fixtura: niciun seed cu geometria ceruta')
})

test('content: discul agentului si al desemnarii trebuie sa se atinga pe toata raza de scanare', () => {
  const rau = parseRules({ ...R, jobRegionRadiusBlocks: 1 })
  assert.equal(rau.ok, false)
  if (!rau.ok) {
    assert.equal(rau.reason, Reason.VALOARE_INVALIDA)
    assert.equal(rau.params.camp, 'jobRegionRadiusBlocks')
  }
  // Raza de scanare mai mica face configuratia valida din nou — dar numai daca
  // si raza de cautare a destinatiei scade: lantul marfa → depozit are propriul
  // invariant, si el se verifica pe discul MIC (al pionului sau al desemnarii).
  assert.equal(parseRules({ ...R, jobRegionRadiusBlocks: 1, jobScanRadiusCells: 80 }).ok, false)
  assert.equal(parseRules({ ...R, jobRegionRadiusBlocks: 1, jobScanRadiusCells: 80, haulDestRadiusCells: 64 }).ok, false)
  // Si lantul pion → mancare / pat are propriul invariant, cu propria raza: a
  // TREIA care trebuie sa coboare ca sa fie configuratia valida din nou.
  assert.ok(parseRules({ ...R, jobRegionRadiusBlocks: 1, jobScanRadiusCells: 80, haulDestRadiusCells: 64, nevoieScanRadiusCells: 64 }).ok)
  // Si leaga SINGUR, cu discurile implicite: 96 = 6 blocuri = 2 + 2 + 2.
  assert.ok(parseRules({ ...R, nevoieScanRadiusCells: 96 }).ok)
  const nevoiDeparte = parseRules({ ...R, nevoieScanRadiusCells: 112 })
  assert.equal(nevoiDeparte.ok, false)
  if (!nevoiDeparte.ok) {
    assert.equal(nevoiDeparte.reason, Reason.VALOARE_INVALIDA)
    assert.equal(nevoiDeparte.params.camp, 'nevoieScanRadiusCells')
  }
  // Si invariantul de carat leaga singur, cu discurile implicite: 96 de celule =
  // 6 blocuri = 2 + 2 + 2, deci un pas peste el trebuie refuzat.
  assert.ok(parseRules({ ...R, haulDestRadiusCells: 96 }).ok)
  const departe = parseRules({ ...R, haulDestRadiusCells: 112 })
  assert.equal(departe.ok, false)
  if (!departe.ok) {
    assert.equal(departe.reason, Reason.VALOARE_INVALIDA)
    assert.equal(departe.params.camp, 'haulDestRadiusCells')
  }
  assert.equal(parseRules({ ...R, designationPriorityDefault: 9 }).ok, false)
  assert.equal(parseRules({ ...R, personalPriorityDefault: 9 }).ok, false)
})

test('o desemnare la 6 blocuri e in COMPONENTA pionului: discurile de acoperire se ating', () => {
  const seed = 227
  const slab = { ...R, jobRegionRadiusBlocks: 1 }
  let gasit = false
  for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    const { w } = laSit(seed, 1)
    tick(w, R)
    const cx = cellOf(w.agents.x[0]!)
    const cy = cellOf(w.agents.y[0]!)
    const cz = w.agents.z[0]!
    const wx = cx + ux * 6 * 16
    const wy = cy + uy * 6 * 16
    if (wx < 0 || wy < 0) continue
    const g = solid(w, wx, wy)
    if (g === null) continue
    if (!applyCommand(w, { kind: 'desemneaza', wx, wy, z: g }, R).ok) continue
    const work = celulaDeLucru(w.terrain, w.regions, w.desemnari, wx, wy, g, R)
    if (!work) continue
    if (!areConnected(w.regions, cx, cy, cz, work.wx, work.wy, work.z)) continue

    const { w: w2 } = laSit(seed, 1)
    tick(w2, R)
    assert.ok(applyCommand(w2, { kind: 'desemneaza', wx, wy, z: g }, slab).ok)
    const work2 = celulaDeLucru(w2.terrain, w2.regions, w2.desemnari, wx, wy, g, slab)
    assert.ok(work2)
    assert.equal(areConnected(w2.regions, cx, cy, cz, work2.wx, work2.wy, work2.z), false, 'cu raza 1 discurile tot se ating: invariantul nu leaga')
    gasit = true
    break
  }
  assert.ok(gasit, 'fixtura: in nicio directie desemnarea de la 6 blocuri nu e legata de pion')
})

// ---------------------------------------------------------------------------
// save / load
// ---------------------------------------------------------------------------

function fixturaM5(seed: number): { w: World } {
  const { w } = laSit(seed, 3)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  desemneaza(w, cx + 3, cy)
  desemneaza(w, cx + 3, cy + 2, 5)
  desemneaza(w, cx + 5, cy + 1, 1)
  desemneaza(w, cx + 7, cy + 3)
  return { w }
}

test('M5 cu joburi in curs: save la un tick cu SAPATURA de job, apoi hash identic si aceleasi rezervari', () => {
  const continuu = fixturaM5(301).w
  const intrerupt = fixturaM5(301).w

  let tSave = -1
  for (let t = 0; t < 1500; t++) {
    tick(continuu, R)
    tick(intrerupt, R)
    if (lastJobReport().joburiTerminate > 0) { tSave = intrerupt.tick; break }
  }
  assert.ok(tSave > 0, 'fixtura: niciun job nu s-a terminat in 1500 de tickuri')
  assert.ok(cuJob(intrerupt).length > 0, 'fixtura: nimeni nu e in mijlocul unui job la save')
  assert.equal(intrerupt.regions.dirty.size, 0, 'tickul s-a incheiat cu blocuri murdare')

  const loaded = decode(encode(intrerupt))
  assert.ok(loaded.ok, 'incarcarea a esuat')
  assert.equal(hashWorld(loaded.value), hashWorld(intrerupt))
  assert.equal(dumpRezervari(loaded.value.rezervari), dumpRezervari(intrerupt.rezervari), 'rezervarile nu s-au reconstruit identic')
  assert.ok(dumpRezervari(loaded.value.rezervari).length > 0, 'fixtura: nicio rezervare la save')
  assert.equal(loaded.value.rezervari.anulateLaIncarcare, 0)
  assert.ok(verificaRezervari(loaded.value.rezervari, loaded.value.agents).ok)

  for (let t = 0; t < 500; t++) {
    tick(continuu, R)
    tick(loaded.value, R)
  }
  assert.equal(hashWorld(loaded.value), hashWorld(continuu))
})

test('M5 cu un save luat INTRE o comanda de teren si tickul urmator: blocurile murdare supravietuiesc', () => {
  // Exact ce face viewerul: click = applyCommand, tickul vine in cadrul urmator.
  // Recenzia a masurat: fara `murdare` in save, graful diverge dupa un tick in
  // 40 din 143 de cazuri si hash-ul in 5, cu hash EGAL la save.
  const continuu = fixturaM5(302).w
  const intrerupt = fixturaM5(302).w
  for (let t = 0; t < 120; t++) { tick(continuu, R); tick(intrerupt, R) }
  const cx = cellOf(intrerupt.agents.x[0]!)
  const cy = cellOf(intrerupt.agents.y[0]!)
  for (const dx of [1, 2, 3, 4]) {
    const g = solid(intrerupt, cx + dx, cy + 4)
    if (g === null) continue
    assert.ok(applyCommand(continuu, { kind: 'dig', wx: cx + dx, wy: cy + 4, z: g }, R).ok)
    assert.ok(applyCommand(intrerupt, { kind: 'dig', wx: cx + dx, wy: cy + 4, z: g }, R).ok)
  }
  assert.ok(intrerupt.regions.dirty.size > 0, 'fixtura: comanda n-a murdarit nimic')
  const loaded = decode(encode(intrerupt))
  assert.ok(loaded.ok)
  assert.equal(loaded.value.regions.dirty.size, intrerupt.regions.dirty.size, 'blocurile murdare nu s-au incarcat')
  assert.equal(hashWorld(loaded.value), hashWorld(intrerupt))
  for (let t = 0; t < 300; t++) {
    tick(continuu, R)
    tick(loaded.value, R)
    assert.equal(hashWorld(loaded.value), hashWorld(continuu), `divergenta la +${t + 1}`)
  }
})

test('M5 cu TOATE campurile noi nenule la save: incercari, raciri pe pereche, racire pe tinta, prioritate nedefault, scanare programata', () => {
  // Recenzia: sase mutatii in save.ts (cate un camp necitit sau nescris) treceau
  // 193/193, fiindca in fixturile de roundtrip campurile erau mereu zero.
  const reguli = { ...R, maxPathNodes: 64, replanCooldownTicks: 5, jobMaxIncercari: 3 }
  const construieste = (): World => {
    const { w } = laSit(303, 2)
    const cx = cellOf(w.agents.x[0]!)
    const cy = cellOf(w.agents.y[0]!)
    const cz = w.agents.z[0]!
    const departe = solidLaDistanta(w, cx, cy, cz, 60, 90)
    desemneaza(w, departe.wx, departe.wy, 5, reguli)             // peste buget → incercari, apoi racire pe pereche
    assert.ok(applyCommand(w, { kind: 'desemneaza', wx: cx + 1, wy: cy + 1, z: cz - 6 }, reguli).ok) // fara loc → racire pe tinta
    desemneaza(w, cx + 3, cy, 2, reguli)                          // fezabila
    assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[1]!, categorie: 0, nivel: 2 }, reguli).ok)
    return w
  }
  const continuu = construieste()
  const intrerupt = construieste()
  // Doua momente de save, fiindca nu pot fi toate nenule deodata: `jobIncercari`
  // e nenul cat jobul TRAIESTE si se reincearca; racirea pe pereche apare abia
  // dupa ce jobul a murit.
  const roundtrip = (cand: (w: World) => boolean, nume: string): void => {
    let gata = false
    for (let t = 0; t < 400 && !gata; t++) {
      tick(continuu, reguli)
      tick(intrerupt, reguli)
      gata = cand(intrerupt)
    }
    assert.ok(gata, `fixtura: ${nume} n-a devenit nenul`)
    const loaded = decode(encode(intrerupt))
    assert.ok(loaded.ok, JSON.stringify(loaded))
    assert.equal(hashWorld(loaded.value), hashWorld(intrerupt), `${nume}: hash diferit la incarcare`)
    for (let t = 0; t < 200; t++) {
      tick(continuu, reguli)
      tick(loaded.value, reguli)
      tick(intrerupt, reguli)
    }
    assert.equal(hashWorld(loaded.value), hashWorld(continuu), `${nume}: divergenta dupa incarcare`)
  }
  roundtrip((w) => {
    let da = false
    for (let i = 0; i < w.agents.count; i++) if (w.agents.jobIncercari[i]! > 0) da = true
    return da
  }, 'jobIncercari')
  roundtrip((w) => {
    const a = w.agents
    const d = w.desemnari
    let racirePereche = false
    for (let i = 0; i < a.count * a.evitaSloturi; i++) if (a.evitaPanaLa[i]! > w.tick) racirePereche = true
    let racireTinta = false
    for (let i = 0; i < d.count; i++) if (d.reincercaLaTick[i]! > w.tick) racireTinta = true
    return racirePereche && racireTinta
  }, 'racirile')
  // Scanarea programata e nenula exact un tick dupa ce se incheie un job: se
  // mai da o desemnare fezabila (identic in ambele lumi) si se prinde momentul.
  const cx = cellOf(intrerupt.agents.x[0]!)
  const cy = cellOf(intrerupt.agents.y[0]!)
  const g = solid(intrerupt, cx + 4, cy + 1)
  assert.notEqual(g, null)
  assert.ok(applyCommand(continuu, { kind: 'desemneaza', wx: cx + 4, wy: cy + 1, z: g!, prioritate: 4 }, reguli).ok)
  assert.ok(applyCommand(intrerupt, { kind: 'desemneaza', wx: cx + 4, wy: cy + 1, z: g!, prioritate: 4 }, reguli).ok)
  roundtrip((w) => {
    let scanare = false
    for (let i = 0; i < w.agents.count; i++) if (w.agents.scanLaTick[i]! >= w.tick) scanare = true
    return scanare
  }, 'scanarea programata')
})

test('un job orfan intr-un save editat e anulat la incarcare, cu raport, nu lasat tacut', () => {
  const { w } = fixturaM5(304)
  const n = panaCand(w, 200, (w) => cuJob(w).length >= 2)
  assert.ok(n >= 0)
  const [a, b] = cuJob(w)
  const raw = JSON.parse(encode(w)) as { data: { agents: Record<string, number[]>; desemnari: Record<string, number[]> } }
  const tintaA = w.agents.jobTarget[a!]!
  const slotTinta = raw.data.desemnari.id!.indexOf(tintaA)
  assert.ok(slotTinta >= 0)
  raw.data.desemnari.alive![slotTinta] = 0
  raw.data.agents.alive![b!] = 0

  const loaded = decode(JSON.stringify(raw))
  assert.ok(loaded.ok, JSON.stringify(loaded))
  assert.equal(loaded.value.rezervari.anulateLaIncarcare, 2)
  assert.equal(loaded.value.agents.jobKind[a!], 0)
  assert.equal(loaded.value.agents.jobKind[b!], 0)
  assert.ok(verificaRezervari(loaded.value.rezervari, loaded.value.agents).ok)
})

test('un save cu doua desemnari vii pe aceeasi celula, sau cu acelasi id, e refuzat', () => {
  const { w } = laSit(305, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  desemneaza(w, cx + 2, cy)
  const dubleaza = (): { data: { nextId: number; desemnari: Record<string, number | number[]> } } => {
    const raw = JSON.parse(encode(w)) as { data: { nextId: number; desemnari: Record<string, number | number[]> } }
    const d = raw.data.desemnari
    d.count = 2
    for (const camp of ['id', 'kind', 'wx', 'wy', 'z', 'prioritate', 'alive', 'reincercaLaTick'] as const) {
      const v = d[camp] as number[]
      v.push(v[0]!)
    }
    return raw
  }
  // Aceeasi celula, id diferit.
  const celula = dubleaza()
  ;(celula.data.desemnari.id as number[])[1] = celula.data.nextId
  celula.data.nextId++
  const out = decode(JSON.stringify(celula))
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.reason, Reason.DEJA_DESEMNATA)
  // Acelasi id, alta celula.
  const idem = dubleaza()
  ;(idem.data.desemnari.wx as number[])[1] = cx + 3
  const out2 = decode(JSON.stringify(idem))
  assert.equal(out2.ok, false)
  if (!out2.ok) {
    assert.equal(out2.reason, Reason.ENTITATE_INEXISTENTA)
    assert.equal(out2.params.id, w.desemnari.id[0])
  }
})

test('hash-ul vede FIECARE camp PERSISTED nou, si nu vede ce e TRANSIENT', () => {
  const { w } = laSit(306, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  desemneaza(w, cx + 2, cy)
  const n = panaCand(w, 200, (w) => w.agents.jobStep[0] === PasJob.LUCREAZA)
  assert.ok(n >= 0)
  const h0 = hashWorld(w)
  const salvat = encode(w)
  const probe: [string, (w: World) => void][] = [
    ['jobProgres', (w) => { w.agents.jobProgres[0] = w.agents.jobProgres[0]! + 1 }],
    ['jobKind', (w) => { w.agents.jobKind[0] = 0 }],
    ['jobId', (w) => { w.agents.jobId[0] = w.agents.jobId[0]! + 1 }],
    ['jobTarget', (w) => { w.agents.jobTarget[0] = w.agents.jobTarget[0]! + 1 }],
    ['jobStep', (w) => { w.agents.jobStep[0] = PasJob.MERGE }],
    ['jobWorkX', (w) => { w.agents.jobWorkX[0] = w.agents.jobWorkX[0]! + 1 }],
    ['jobWorkY', (w) => { w.agents.jobWorkY[0] = w.agents.jobWorkY[0]! + 1 }],
    ['jobWorkZ', (w) => { w.agents.jobWorkZ[0] = w.agents.jobWorkZ[0]! + 1 }],
    ['jobIncercari', (w) => { w.agents.jobIncercari[0] = 1 }],
    ['evitaTinta', (w) => { w.agents.evitaTinta[1] = 7 }],
    ['evitaPanaLa', (w) => { w.agents.evitaPanaLa[1] = 7 }],
    ['scanLaTick', (w) => { w.agents.scanLaTick[0] = 7 }],
    ['prioPersonala', (w) => { w.agents.prioPersonala[0] = 2 }],
    ['desemnari.count', (w) => { w.desemnari.count = w.desemnari.count + 1 }],
    ['desemnari.id', (w) => { w.desemnari.id[0] = w.desemnari.id[0]! + 1 }],
    ['desemnari.kind', (w) => { w.desemnari.kind[0] = 1 }],
    ['desemnari.wx', (w) => { w.desemnari.wx[0] = w.desemnari.wx[0]! + 1 }],
    ['desemnari.wy', (w) => { w.desemnari.wy[0] = w.desemnari.wy[0]! + 1 }],
    ['desemnari.z', (w) => { w.desemnari.z[0] = w.desemnari.z[0]! - 1 }],
    ['desemnari.prioritate', (w) => { w.desemnari.prioritate[0] = 5 }],
    ['desemnari.reincercaLaTick', (w) => { w.desemnari.reincercaLaTick[0] = 99 }],
    ['desemnari.alive', (w) => { w.desemnari.alive[0] = 0 }],
    ['regions.dirty', (w) => { w.regions.dirty.add(12345) }],
  ]
  for (const [nume, muta] of probe) {
    const copie = decode(salvat)
    assert.ok(copie.ok)
    assert.equal(hashWorld(copie.value), h0, 'fixtura: copia nu are hash-ul originalului')
    muta(copie.value)
    assert.notEqual(hashWorld(copie.value), h0, `hash-ul nu vede ${nume}`)
  }
  const copie = decode(salvat)
  assert.ok(copie.ok)
  copie.value.desemnari.ultimulMotiv[0] = 3
  copie.value.ratiune.motivFinal[0] = 3
  copie.value.ratiune.joburiFaraProgres = 9
  assert.equal(hashWorld(copie.value), h0, 'un camp TRANSIENT a intrat in hash')
})

// ---------------------------------------------------------------------------
// acceptanta
// ---------------------------------------------------------------------------

test('ACCEPTANTA: 12 pioni, o cariera de 900 de celule, 6000 de tickuri — invariantii tin sub munca continua', () => {
  const { w } = laSit(401, 12)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  let puse = 0
  for (let dx = 3; dx < 33; dx++) {
    for (let dy = 3; dy < 33; dy++) {
      const g = solid(w, cx + dx, cy + dy)
      if (g === null) continue
      if (applyCommand(w, { kind: 'desemneaza', wx: cx + dx, wy: cy + dy, z: g }, R).ok) puse++
    }
  }
  assert.ok(puse > 800, `doar ${puse} desemnari puse`)

  const t0 = performance.now()
  let murdare = 0
  let hoinari = 0
  let pioniTickuri = 0
  const t = ruleaza(w, 6000, R, (w) => {
    if (w.regions.dirty.size > 0) murdare++
    for (let i = 0; i < w.agents.count; i++) {
      if (w.agents.alive[i] === 0) continue
      pioniTickuri++
      if (w.agents.jobKind[i] === 0 && w.desemnari.vii > 0) hoinari++
    }
    if (w.tick % 1000 === 0) {
      const v = verificaRezervari(w.rezervari, w.agents)
      assert.ok(v.ok, `t=${w.tick}: ${JSON.stringify(v)}`)
    }
  })
  const ms = performance.now() - t0

  assert.equal(murdare, 0, `${murdare} tickuri s-au incheiat cu blocuri murdare`)
  assert.ok(t.joburiTerminate > 200, `doar ${t.joburiTerminate} joburi terminate`)
  assert.ok(t.inaccesibil > 0, 'fixtura: niciun refuz „fara loc de lucru" intr-o cariera plina')
  assert.ok(t.candidatiExaminati < t.scanari * 60, `${t.candidatiExaminati} evaluari scumpe la ${t.scanari} scanari: memorarea nu taie nimic`)
  assert.equal(w.ratiune.joburiFaraProgres, 0, 'joburi incheiate de lume fara nicio munca')
  // Hoinareala intre joburi: recenzia masurase 21,6%; acum pionul scaneaza la
  // tickul de dupa fiecare job.
  assert.ok(hoinari / pioniTickuri < 0.05, `${((100 * hoinari) / pioniTickuri).toFixed(1)}% din tickuri-pion fara job cu munca disponibila`)
  assert.ok(verificaRezervari(w.rezervari, w.agents).ok)
  for (let i = 0; i < w.agents.count; i++) {
    if (w.agents.jobStep[i] !== PasJob.LUCREAZA) continue
    assert.equal(cellOf(w.agents.x[i]!), w.agents.jobWorkX[i])
    assert.equal(cellOf(w.agents.y[i]!), w.agents.jobWorkY[i])
  }
  console.log(`  cariera: ${t.joburiTerminate} sapate, ${t.joburiAnulate} anulate, ${t.locuriDeLucruRefacute} locuri refacute, ${t.candidatiExaminati} evaluari scumpe, ${t.coridoare} coridoare, ${((100 * hoinari) / pioniTickuri).toFixed(1)}% hoinareala, ${(ms / 6000 * 1000).toFixed(0)} µs/tick`)
})

// ---------------------------------------------------------------------------
// plafonul de incercari acopera TOATE refuzurile de drum
// ---------------------------------------------------------------------------

test('INACCESIBIL numara o incercare si jobul se incheie: „refacut" inseamna ALTA celula, nu aceeasi', () => {
  // `findPath` intoarce INACCESIBIL si cand componenta e corecta (A*-ul pe celule
  // n-a incaput in banda de regiuni). Prima versiune sarea peste `jobIncercari++`
  // si chema `refaLoculDeLucru` fara `evita`, care intoarce prima celula in ordine
  // FIXA — exact cea de dinainte. Jobul nu se mai incheia niciodata: desemnarea
  // ramanea rezervata pentru toata colonia si pionul parcat pe viata.
  const { w } = laSit(230, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { id } = desemneaza(w, cx + 2, cy)
  const n = panaCand(w, 60, (w) => w.agents.jobKind[0] !== 0)
  assert.ok(n >= 0, 'fixtura: pionul n-a luat jobul')
  assert.equal(w.rezervari.total, 1)

  // Refuzuri de drum repetate, ca si cum banda de regiuni n-ar incapea niciodata.
  let apeluri = 0
  for (let k = 0; k < 50 && w.agents.jobKind[0] !== 0; k++) {
    drumRefuzat(w, R, 0, Reason.INACCESIBIL)
    apeluri++
  }
  assert.equal(w.agents.jobKind[0], 0, `jobul n-a murit dupa ${apeluri} de refuzuri INACCESIBIL`)
  assert.ok(apeluri <= R.jobMaxIncercari, `${apeluri} refuzuri pana la incheiere, plafonul e ${R.jobMaxIncercari}`)
  assert.equal(w.rezervari.total, 0, 'desemnarea a ramas rezervata')
  assert.notEqual(slotDesemnare(w.desemnari, id), -1, 'desemnarea a disparut; trebuia doar eliberata')
  // Si cauza ajunge undeva: fie pe tinta, fie pe pereche.
  assert.ok(w.desemnari.ultimulMotiv[0]! > 0 || esteEvitata(w, 0, id), 'niciun semnal dupa plafon')
})
