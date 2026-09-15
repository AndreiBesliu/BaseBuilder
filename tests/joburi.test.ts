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
import { areConnected, isWalkable } from '../src/sim/regions.ts'
import { cellKey } from '../src/sim/path.ts'
import { DetaliuMotiv } from '../src/sim/desemnari.ts'
import { celulaDeLucru, drumRefuzat, lastJobReport, maiBun, StareRatiune } from '../src/sim/joburi.ts'
import type { JobTickReport } from '../src/sim/joburi.ts'
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
    // Un sit e bun daca si vecinatatea lui e pe uscat.
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
 * O celula de sol solid pe directia +x, la o distanta Manhattan (cu tot cu cota)
 * intre `dMin` si `dMax` de (cx, cy, cz). Pe teren inclinat cota intra in
 * distanta, deci „la 90 de celule" nu inseamna dx = 90.
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

/** Ruleaza N tickuri si aduna raportul de joburi. */
function ruleaza(w: World, ticks: number, rules: Rules = R, laFiecareTick?: (w: World) => void): JobTickReport {
  const t: JobTickReport = {
    scanari: 0, candidatiExaminati: 0, candidatiTaiati: 0, joburiPornite: 0, joburiTerminate: 0, joburiAnulate: 0,
    joburiFaraProgres: 0, tickuriDeLucru: 0, locuriDeLucruRefacute: 0, faraMuncitor: 0, preaDeparte: 0, inaccesibil: 0, rezervat: 0,
  }
  for (let i = 0; i < ticks; i++) {
    tick(w, rules)
    const r = lastJobReport()
    t.scanari += r.scanari; t.candidatiExaminati += r.candidatiExaminati; t.candidatiTaiati += r.candidatiTaiati
    t.joburiPornite += r.joburiPornite; t.joburiTerminate += r.joburiTerminate; t.joburiAnulate += r.joburiAnulate
    t.tickuriDeLucru += r.tickuriDeLucru; t.locuriDeLucruRefacute += r.locuriDeLucruRefacute
    t.faraMuncitor += r.faraMuncitor; t.preaDeparte += r.preaDeparte; t.inaccesibil += r.inaccesibil; t.rezervat += r.rezervat
    t.joburiFaraProgres = r.joburiFaraProgres
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

  // In aer nu e nimic de sapat.
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
  // Un refuz nu consuma id.
  assert.equal(w.nextId, idInainte + 1)

  assert.ok(applyCommand(w, { kind: 'anuleazaDesemnarea', id }, R).ok)
  assert.equal(w.desemnari.vii, 0)
  const iar = applyCommand(w, { kind: 'anuleazaDesemnarea', id }, R)
  assert.equal(iar.ok, false)
  if (!iar.ok) assert.equal(iar.reason, Reason.ENTITATE_INEXISTENTA)
})

test('un slot de desemnare reutilizat nu mosteneste racirea celei moarte', () => {
  // Acelasi defect reparat la agenti pentru `nextReplanTick`: fara reset, noua
  // desemnare ar fi ignorata pana la un tick pe care nu l-a trait.
  const { w } = laSit(102, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!
  // O desemnare in adancul rocii: e scanata, n-are loc de lucru, primeste racire.
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
  assert.ok(t.tickuriDeLucru >= R.digWorkUnits / R.workUnitsPerTick, `doar ${t.tickuriDeLucru} tickuri de lucru`)
  assert.equal(w.rezervari.total, 0)
  assert.ok(verificaRezervari(w.rezervari, w.agents).ok)
  assert.equal(w.agents.jobKind[0], 0)
})

test('doi pioni, o desemnare: exact unul o ia, celalalt afla REZERVAT', () => {
  const { w } = laSit(202, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  desemneaza(w, cx + 3, cy + 1)

  // Dupa 31 de tickuri amandoi au scanat cel putin o data.
  ruleaza(w, 31)
  const ocupati = cuJob(w)
  assert.equal(ocupati.length, 1, `${ocupati.length} pioni cu job pe o singura desemnare`)
  assert.equal(w.rezervari.total, 1)
  assert.ok(verificaRezervari(w.rezervari, w.agents).ok)
  const liber = ocupati[0] === 0 ? 1 : 0
  assert.equal(w.ratiune.stare[liber], StareRatiune.RESPINS)
  assert.equal(w.ratiune.motivFinal[liber], codMotiv(Reason.REZERVAT), 'pionul liber nu stie ca tinta e rezervata')
})

test('fara loc de lucru: nimeni n-o ia, cauza INACCESIBIL cu detaliul ei sta pe desemnare, si primeste racire', () => {
  const { w } = laSit(203, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!
  const out = applyCommand(w, { kind: 'desemneaza', wx: cx + 1, wy: cy, z: cz - 6 }, R)
  assert.ok(out.ok, `roca de la -6 nu e desemnabila: ${JSON.stringify(out)}`)

  // Prima scanare o evalueaza si o respinge, cu cauza pe amandoi.
  const t = ruleaza(w, R.jobRescanTicks + 1)
  assert.equal(cuJob(w).length, 0)
  assert.equal(w.desemnari.vii, 1)
  assert.ok(t.inaccesibil > 0, 'fixtura: nimeni n-a evaluat desemnarea')
  assert.equal(w.desemnari.ultimulMotiv[0], codMotiv(Reason.INACCESIBIL))
  assert.equal(w.desemnari.ultimulMotivDetaliu[0], DetaliuMotiv.FARA_LOC_DE_LUCRU)
  assert.ok(w.desemnari.reincercaLaTick[0]! > w.tick, 'proprietatea tintei nu s-a memorat pe tinta')
  assert.equal(w.ratiune.stare[0], StareRatiune.RESPINS)
  assert.equal(w.ratiune.motivFinal[0], codMotiv(Reason.INACCESIBIL))

  // A doua n-o mai evalueaza (e in racire): pionul stie ca ASTEAPTA, nu sta cu
  // ratiunea goala — si nu se mai plateste nicio evaluare scumpa.
  const t2 = ruleaza(w, R.jobRescanTicks)
  assert.equal(t2.candidatiExaminati, 0, 'desemnarea in racire a fost reevaluata scump')
  assert.equal(w.ratiune.stare[0], StareRatiune.IN_ASTEPTARE)
})

test('alta componenta: INACCESIBIL cu detaliul „componente diferite", si NU se memoreaza pe tinta', () => {
  const { w } = laSit(204, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  // O groapa de trei niveluri la patru celule: fundul ei e o insula.
  const px = cx + 4
  const py = cy
  const gp = solid(w, px, py)!
  for (let d = 0; d < 3; d++) {
    const out = applyCommand(w, { kind: 'dig', wx: px, wy: py, z: gp - d }, R)
    assert.ok(out.ok, `sapatura ${d}: ${JSON.stringify(out)}`)
  }
  tick(w, R)
  assert.ok(isWalkable(w.terrain, px, py, gp - 2, R), 'fixtura: fundul gropii nu e calcabil')
  // Voxelul de langa fundul gropii: singurul lui loc de lucru e IN groapa.
  const out = applyCommand(w, { kind: 'desemneaza', wx: px + 1, wy: py, z: gp - 2 }, R)
  assert.ok(out.ok, JSON.stringify(out))

  const t = ruleaza(w, 60)
  assert.equal(cuJob(w).length, 0, 'un pion a luat o desemnare la care nu poate ajunge')
  assert.ok(t.inaccesibil > 0, 'fixtura: desemnarea n-a fost evaluata')
  assert.equal(w.desemnari.ultimulMotiv[0], codMotiv(Reason.INACCESIBIL))
  assert.equal(w.desemnari.ultimulMotivDetaliu[0], DetaliuMotiv.COMPONENTE_DIFERITE)
  // Proprietate a perechii, nu a tintei: alt pion, din groapa, ar putea.
  assert.equal(w.desemnari.reincercaLaTick[0], 0)
})

// ---------------------------------------------------------------------------
// scorul
// ---------------------------------------------------------------------------

test('scor: +1 nivel de prioritate merita EXACT jumatate din drum, +1 personal un sfert', () => {
  // Pragurile de egalitate, nu doar sensul: 2^3/(1+21) == 2^2/(1+10).
  assert.equal(maiBun(3, 1, 21, 2, 1, 10), false)
  assert.equal(maiBun(2, 1, 10, 3, 1, 21), false)
  assert.equal(maiBun(3, 1, 20, 2, 1, 10), true)
  assert.equal(maiBun(3, 1, 22, 2, 1, 10), false)
  // Personal: 4^2/(1+43) == 4^1/(1+10).
  assert.equal(maiBun(2, 2, 43, 2, 1, 10), false)
  assert.equal(maiBun(2, 2, 42, 2, 1, 10), true)
  // Distanta zero e valida.
  assert.equal(maiBun(1, 1, 0, 1, 1, 1), true)
})

test('pionul alege desemnarea cu scorul mai mare, nu pe cea mai apropiata', () => {
  const { w } = laSit(205, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const aproape = desemneaza(w, cx + 2, cy, 1)
  const departe = desemneaza(w, cx + 7, cy, 5)
  // 2^5 / (1+~7) ≈ 4 fata de 2^1 / (1+~2) ≈ 0,7.
  const n = panaCand(w, 40, (w) => w.agents.jobKind[0] !== 0)
  assert.ok(n >= 0, 'pionul n-a luat niciun job')
  assert.equal(w.agents.jobTarget[0], departe.id, `a ales-o pe cea apropiata (${aproape.id}) in loc de cea prioritara (${departe.id})`)
})

// ---------------------------------------------------------------------------
// ciclul de viata al jobului
// ---------------------------------------------------------------------------

test('pierderea celulei de lucru nu omoara jobul: se cauta alta, progresul ramane', () => {
  const { w } = laSit(206, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { z } = desemneaza(w, cx + 3, cy)
  const n = panaCand(w, 40, (w) => w.agents.jobKind[0] !== 0)
  assert.ok(n >= 0)
  const wx = w.agents.jobWorkX[0]!
  const wy = w.agents.jobWorkY[0]!
  const wz = w.agents.jobWorkZ[0]!
  assert.ok(wx !== cx || wy !== cy, 'fixtura: celula de lucru e chiar celula pionului')

  // Zid pe celula de lucru, DUPA ce jobul a pornit.
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

test('BUGET_DEPASIT e plafonat: jobul se incheie, tinta ramane LIBERA, pionul nu ramane parcat', () => {
  // Plafonul de noduri e o constanta pe aceleasi intrari: „prea scump acum" e
  // „prea scump mereu" pana se schimba terenul. Fara plafon de reincercari,
  // pionul ar sta pe viata cu tinta rezervata si ar repeta la nesfarsit cea mai
  // scumpa cautare din joc.
  const reguli = { ...R, maxPathNodes: 64, replanCooldownTicks: 5, jobMaxIncercari: 3 }
  const { w } = laSit(207, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const loc = solidLaDistanta(w, cx, cy, w.agents.z[0]!, 60, 90)
  const { id } = desemneaza(w, loc.wx, loc.wy, undefined, reguli)

  // Jobul porneste si, in acelasi tick, primul drum e refuzat.
  const n = panaCand(w, 40, (w) => w.agents.jobKind[0] !== 0, reguli)
  assert.ok(n >= 0, 'fixtura: pionul n-a luat jobul')
  assert.equal(w.agents.jobIncercari[0], 1, 'fixtura: primul drum n-a fost refuzat cu buget')
  assert.equal(w.ratiune.stare[0], StareRatiune.ASTEAPTA_DRUM)
  assert.equal(w.ratiune.motivFinal[0], codMotiv(Reason.BUGET_DEPASIT))
  // Pana la plafon: are job si asteapta, in racire, fara sa hoinareasca.
  ruleaza(w, 2, reguli)
  assert.notEqual(w.agents.jobKind[0], 0, 'fixtura: jobul s-a incheiat inainte de plafon')

  const m = panaCand(w, 40, (w) => w.agents.jobKind[0] === 0, reguli)
  assert.ok(m >= 0, 'pionul a ramas parcat cu tinta rezervata')
  assert.equal(w.rezervari.total, 0)
  assert.equal(w.agents.tintaRefuzata[0], id, 'racirea nu s-a scris pe pereche')
  assert.ok(w.agents.refuzPanaLa[0]! > w.tick)
  assert.equal(w.desemnari.reincercaLaTick[0], 0, 'racirea a fost pusa pe TINTA, desi era a pionului')
  assert.equal(w.desemnari.ultimulMotiv[0], codMotiv(Reason.BUGET_DEPASIT))
  // Si racirea pe pereche leaga: el n-o mai ia cat tine.
  ruleaza(w, 60, reguli)
  assert.equal(w.agents.jobKind[0], 0, 'pionul a reluat tinta refuzata inainte de expirarea racirii')
})

test('OCUPAT_DE_OSTIL (D7c): pionul blocat renunta la pereche, iar cel liber ia tinta imediat', () => {
  // Refuzul de drum e al PERECHII: cooldown-ul pe tinta ar bloca munca celor de
  // dincolo de jefuitor — exact ce D7c interzice.
  const reguli = { ...R, jobMaxIncercari: 2 }
  const { w } = laSit(208, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { id } = desemneaza(w, cx + 3, cy + 1, undefined, reguli)
  const n = panaCand(w, 40, (w) => cuJob(w).length === 1, reguli)
  assert.ok(n >= 0)
  const blocat = cuJob(w)[0]!
  const liber = blocat === 0 ? 1 : 0

  // Lumea spune de doua ori „drumul tau e blocat de un ostil".
  drumRefuzat(w, reguli, blocat, Reason.OCUPAT_DE_OSTIL)
  assert.notEqual(w.agents.jobKind[blocat], 0, 'a renuntat de la primul refuz')
  assert.equal(w.ratiune.stare[blocat], StareRatiune.ASTEAPTA_DRUM)
  drumRefuzat(w, reguli, blocat, Reason.OCUPAT_DE_OSTIL)
  assert.equal(w.agents.jobKind[blocat], 0, 'plafonul de incercari nu leaga')
  assert.equal(w.rezervari.total, 0)
  assert.equal(w.agents.tintaRefuzata[blocat], id)
  assert.equal(w.desemnari.reincercaLaTick[0], 0, 'tinta a primit racire pentru un refuz care era al pionului')

  // Cel liber o ia la urmatoarea lui scanare, nu peste 600 de tickuri.
  const m = panaCand(w, 2 * reguli.jobRescanTicks + 1, (w) => w.agents.jobKind[liber] !== 0 && w.agents.jobTarget[liber] === id, reguli)
  assert.ok(m >= 0, 'pionul liber n-a luat tinta pe care celalalt n-o putea atinge')
})

test('scanarea e decalata pe id: 40 de pioni x 30 de tickuri = exact 40 de scanari', () => {
  const w = createWorld(209)
  let pusi = 0
  for (let k = 1; k <= 8000 && pusi < 40; k++) {
    const wx = (k * 1237 + 209) % WORLD_CELLS
    const wy = (k * 7919 + 209 * 31) % WORLD_CELLS
    const g = solid(w, wx, wy)
    if (g === null) continue
    if (applyCommand(w, { kind: 'spawnAgent', x: wx * 1000 + 500, y: wy * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok) pusi++
  }
  assert.equal(pusi, 40)
  const t = ruleaza(w, R.jobRescanTicks)
  assert.equal(t.scanari, 40, `${t.scanari} scanari in ${R.jobRescanTicks} tickuri`)
})

test('anularea de catre jucator in timpul lucrului: INTRERUPT, rezervare eliberata, pion liber', () => {
  const { w } = laSit(210, 1)
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
  assert.ok(verificaRezervari(w.rezervari, w.agents).ok)
})

test('sapatul manual pe o celula desemnata ia desemnarea si intrerupe jobul', () => {
  const { w } = laSit(211, 1)
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

test('killAgent elibereaza rezervarea; slotul reutilizat nu mosteneste jobul si nici prioritatea', () => {
  // Bug-urile 4, 9 si 10 din research: pionul moare carand, obiectul ramane
  // „ocupat" pe veci, deadlock tacut care supravietuieste in save.
  const { w } = laSit(212, 2)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const { id } = desemneaza(w, cx + 3, cy + 1)
  const n = panaCand(w, 40, (w) => cuJob(w).length === 1)
  assert.ok(n >= 0)
  const mort = cuJob(w)[0]!
  const idMort = w.agents.id[mort]!
  assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: idMort, categorie: 0, nivel: 0 }, R).ok)

  assert.ok(applyCommand(w, { kind: 'killAgent', id: idMort }, R).ok)
  assert.equal(w.rezervari.total, 0, 'mortul tine inca rezervarea')
  assert.ok(verificaRezervari(w.rezervari, w.agents).ok)
  assert.equal(w.desemnari.reincercaLaTick[0], 0, 'moartea a pus racire pe tinta')

  // Un nou-nascut in acelasi slot.
  const g = solid(w, cx + 2, cy + 2)!
  const nou = applyCommand(w, { kind: 'spawnAgent', x: (cx + 2) * 1000 + 500, y: (cy + 2) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R)
  assert.ok(nou.ok)
  const slotNou = mort
  assert.equal(w.agents.id[slotNou], nou.ok ? nou.value : -1, 'fixtura: slotul mortului nu s-a reutilizat')
  assert.equal(w.agents.jobKind[slotNou], 0, 'nou-nascutul a mostenit jobul mortului')
  assert.equal(w.agents.prioPersonala[slotNou], R.personalPriorityDefault, 'nou-nascutul a mostenit prioritatea mortului')

  // Tinta e libera si o ia cineva.
  const m = panaCand(w, 2 * R.jobRescanTicks + 1, (w) => cuJob(w).some((i) => w.agents.jobTarget[i] === id))
  assert.ok(m >= 0, 'tinta mortului n-a fost reluata de nimeni')
})

test('doua desemnari vecine, doi pioni: nimeni nu sta pe voxelul desemnat al altuia, ambele se sapa fara anulari', () => {
  // K01 intocmai: intr-o zona pictata, capacul vecinului e primul loc de lucru
  // in ordinea fixa. B il sapa de sub A, A cade si abandoneaza cu un motiv care
  // minte. Regula: podeaua celulei de lucru nu e o desemnare vie.
  const { w } = laSit(213, 2)
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
  assert.equal(w.desemnari.vii, 0)
  const ma = materialAt(w.terrain, cx + 3, cy, a.z)
  const mb = materialAt(w.terrain, cx + 4, cy, b.z)
  assert.ok(ma.ok && ma.value === Material.AER && mb.ok && mb.value === Material.AER)
})

test('INFOMETARE: 300 de desemnari fara loc de lucru inaintea uneia bune nu o ascund pe cea buna', () => {
  // Panoul de design: cu plafonul aplicat pe ordinea slotului si fara memorare,
  // o camera desemnata inaintea rampei ei nu s-ar sapa niciodata. Aici cele
  // 300 sunt mai APROAPE decat cea buna, deci sortarea pe margine le pune
  // primele; ce o salveaza pe cea buna e memorarea refuzului pe tinta.
  const reguli = { ...R, jobScanMaxCandidates: 256, jobInfeasibleRetryTicks: 100 }
  const { w } = laSit(214, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  const cz = w.agents.z[0]!
  // 300 de voxeli la 8 m sub solul FIECAREI celule: roca, fara niciun vecin pe
  // care sa se poata sta. Toate la sub 50 de celule; cea buna, la peste 50 —
  // deci marginea de scor le pune pe toate inaintea ei.
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

  // Prima scanare atinge plafonul si nu gaseste nimic: fixtura e adecvata.
  ruleaza(w, reguli.jobRescanTicks, reguli)
  assert.equal(w.ratiune.stare[0], StareRatiune.PLAFON, 'fixtura: prima scanare n-a atins plafonul')
  assert.ok(w.ratiune.taiati[0]! > 0)
  assert.equal(w.agents.jobKind[0], 0)

  // A doua ajunge la cea buna, fiindca cele 300 sunt in racire.
  const n = panaCand(w, 2 * reguli.jobRescanTicks + 1, (w) => w.agents.jobKind[0] !== 0, reguli)
  assert.ok(n >= 0, 'desemnarea buna a ramas ascunsa in spatele celor 300')
  assert.equal(w.agents.jobTarget[0], buna.id)
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
  // Cazul pe care testele M5 nu-l vazusera niciodata: murdaria produsa de un
  // pion IN tick. Daca ar ramane in `regions.dirty` la save, lumea continua ar
  // reconstrui la tickul urmator si ar lega vecini pe care cea incarcata nu i-ar
  // lega niciodata. Invariantul: la sfarsitul oricarui tick, `dirty` e gol.
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

test('un job orfan intr-un save editat e anulat la incarcare, cu raport, nu lasat tacut', () => {
  const { w } = fixturaM5(302)
  const n = panaCand(w, 200, (w) => cuJob(w).length >= 2)
  assert.ok(n >= 0)
  const [a, b] = cuJob(w)
  const raw = JSON.parse(encode(w)) as { data: { agents: Record<string, number[]>; desemnari: Record<string, number[]> } }
  // Tinta lui `a` dispare din save; `b` moare cu jobul in mana.
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

test('un save cu doua desemnari vii pe aceeasi celula e refuzat, nu „ultima castiga"', () => {
  const { w } = laSit(303, 1)
  const cx = cellOf(w.agents.x[0]!)
  const cy = cellOf(w.agents.y[0]!)
  desemneaza(w, cx + 2, cy)
  const raw = JSON.parse(encode(w)) as { data: { nextId: number; desemnari: Record<string, number | number[]> } }
  const d = raw.data.desemnari
  d.count = 2
  for (const camp of ['id', 'kind', 'wx', 'wy', 'z', 'prioritate', 'alive', 'reincercaLaTick'] as const) {
    const v = d[camp] as number[]
    v.push(v[0]!)
  }
  ;(d.id as number[])[1] = raw.data.nextId
  raw.data.nextId++
  const out = decode(JSON.stringify(raw))
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.reason, Reason.DEJA_DESEMNATA)
})

// ---------------------------------------------------------------------------
// content
// ---------------------------------------------------------------------------

test('content: discul agentului si al desemnarii trebuie sa se atinga pe toata raza de scanare', () => {
  // Altfel intre ele raman blocuri nelegate, si golul nu se inchide niciodata:
  // hoinareala nu iese din acoperire. 2 + 1 + 2 = 5 blocuri < ceil(96 / 16) = 6.
  const rau = parseRules({ ...R, jobRegionRadiusBlocks: 1 })
  assert.equal(rau.ok, false)
  if (!rau.ok) {
    assert.equal(rau.reason, Reason.VALOARE_INVALIDA)
    assert.equal(rau.params.camp, 'jobRegionRadiusBlocks')
  }
  assert.ok(parseRules({ ...R, jobRegionRadiusBlocks: 1, jobScanRadiusCells: 80 }).ok)
  assert.equal(parseRules({ ...R, designationPriorityDefault: 9 }).ok, false)
  assert.equal(parseRules({ ...R, personalPriorityDefault: 9 }).ok, false)
})

test('o desemnare la 6 blocuri e in COMPONENTA pionului: discurile de acoperire se ating', () => {
  // Invariantul din content, probat pe graf: pionul isi acopera 2 blocuri, iar
  // desemnarea 2; fiecare disc isi scrie muchiile un bloc mai departe decat
  // leaga, deci la 6 blocuri distanta se ating in blocul din mijloc. Cu raza 1
  // raman DOUA blocuri nelegate intre ele, fara nicio muchie intre ele, `find`
  // da componente diferite, si desemnarea e INACCESIBILA din motivul gresit.
  //
  // Perechea de asertii: cu raza 2 e legata, cu raza 1 (ocolind validarea din
  // content) NU e — altfel testul n-ar dovedi ca invariantul leaga. Terenul
  // real poate rupe legatura din alte motive (o apa), deci se cauta o directie
  // in care ambele jumatati tin; daca nu exista niciuna, fixtura e vinovata.
  const seed = 304
  const slab = { ...R, jobRegionRadiusBlocks: 1 }
  let gasit = false
  for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    const { w } = laSit(seed, 1)
    tick(w, R) // acoperirea pionului se calculeaza la primul tick
    const cx = cellOf(w.agents.x[0]!)
    const cy = cellOf(w.agents.y[0]!)
    const cz = w.agents.z[0]!
    // Exact 6 blocuri pe o axa, aceeasi pozitie in bloc.
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
// acceptanta
// ---------------------------------------------------------------------------

test('ACCEPTANTA: 12 pioni, o cariera de 900 de celule, 6000 de tickuri — invariantii tin sub munca continua', () => {
  // Scenariul standard isi consuma cele 48 de desemnari in 300 de tickuri si
  // apoi ruleaza 99,7% din timp fara nicio scanare: cifra lui de cost e tickul
  // de dinainte de joburi. Aici munca nu se termina si fiecare sapatura
  // murdareste graful — regimul care conteaza. (Plafonul de evaluari NU se
  // atinge aici: iesirea timpurie pe margine gaseste marginea carierei din
  // primele evaluari. Ca plafonul leaga o dovedeste testul de INFOMETARE.)
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
  const t = ruleaza(w, 6000, R, (w) => {
    if (w.regions.dirty.size > 0) murdare++
    if (w.tick % 1000 === 0) {
      const v = verificaRezervari(w.rezervari, w.agents)
      assert.ok(v.ok, `t=${w.tick}: ${JSON.stringify(v)}`)
    }
  })
  const ms = performance.now() - t0

  assert.equal(murdare, 0, `${murdare} tickuri s-au incheiat cu blocuri murdare`)
  assert.ok(t.joburiTerminate > 200, `doar ${t.joburiTerminate} joburi terminate`)
  // Interiorul carierei n-are loc de lucru pana nu se sapa marginea: memorarea
  // pe tinta trebuie sa fi lucrat, altfel fiecare scanare ar fi reevaluat sute.
  assert.ok(t.inaccesibil > 0, 'fixtura: niciun refuz „fara loc de lucru" intr-o cariera plina')
  assert.ok(t.candidatiExaminati < t.scanari * 60, `${t.candidatiExaminati} evaluari scumpe la ${t.scanari} scanari: memorarea nu taie nimic`)
  assert.ok(verificaRezervari(w.rezervari, w.agents).ok)
  // Nimeni nu ramane in LUCREAZA departe de celula lui de lucru.
  for (let i = 0; i < w.agents.count; i++) {
    if (w.agents.jobStep[i] !== PasJob.LUCREAZA) continue
    assert.equal(cellOf(w.agents.x[i]!), w.agents.jobWorkX[i])
    assert.equal(cellOf(w.agents.y[i]!), w.agents.jobWorkY[i])
  }
  console.log(`  cariera: ${t.joburiTerminate} sapate, ${t.joburiAnulate} anulate, ${t.locuriDeLucruRefacute} locuri refacute, ${t.candidatiExaminati} evaluari scumpe, ${(ms / 6000 * 1000).toFixed(0)} µs/tick`)
})
