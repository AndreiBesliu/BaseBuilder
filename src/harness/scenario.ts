/**
 * Harness-ul headless.
 *
 * Ruleaza o lume din seed, aplica un log de comenzi la tickurile lor, si scoate
 * hash-ul starii. Fara motor, fara ecran, fara ceas de perete. Asta e ce face
 * posibila felia 20 — si e singurul lucru pe care il am si care le lipseste
 * majoritatii dezvoltatorilor solo din genul asta.
 */

import type { Rules } from '../sim/content.ts'
import { DEFAULT_RULES } from '../sim/content.ts'
import type { LoggedCommand } from '../sim/commands.ts'
import { applyCommand } from '../sim/commands.ts'
import { hashWorld } from '../sim/hash.ts'
import { describe } from '../sim/result.ts'
import { CHUNK_CELLS, isSolid, Material } from '../sim/terrain/chunk.ts'
import { createTerrain, groundLevelM, materialAt, WORLD_CELLS } from '../sim/terrain/terrain.ts'
import type { Terrain } from '../sim/terrain/terrain.ts'
import { isWalkable } from '../sim/regions.ts'
import type { World } from '../sim/state.ts'
import { Piesa, Item } from '../sim/state.ts'
import { Zona } from '../sim/zone.ts'
import { advance, createWorld, liveAgentCount, tick } from '../sim/world.ts'

export interface Scenario {
  readonly seed: number
  readonly ticks: number
  readonly rules?: Rules
  /** Comenzi, fiecare cu tickul la care se aplica. Se sorteaza dupa tick, stabil. */
  readonly commands?: readonly LoggedCommand[]
}

export interface RunReport {
  readonly world: World
  readonly hash: string
  readonly ticks: number
  readonly liveAgents: number
  /** Comenzile refuzate, cu motivul. Un scenariu sanatos are lista goala. */
  readonly refusals: readonly string[]
}

export function runScenario(s: Scenario): RunReport {
  const rules = s.rules ?? DEFAULT_RULES
  const w = createWorld(s.seed, rules)
  const refusals: string[] = []

  // Ordonare stabila pe tick: indexul original departajeaza, ca doua comenzi la
  // acelasi tick sa se aplice mereu in aceeasi ordine.
  const queue = [...(s.commands ?? [])]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.tick - b.c.tick) || (a.i - b.i))
    .map((e) => e.c)

  let next = 0
  for (let t = 0; t < s.ticks; t++) {
    while (next < queue.length && queue[next]!.tick === w.tick) {
      const entry = queue[next]!
      const out = applyCommand(w, entry.cmd, rules)
      if (!out.ok) refusals.push(`t=${entry.tick} ${entry.cmd.kind}: ${describe(out)}`)
      next++
    }
    tick(w, rules)
  }

  return {
    world: w,
    hash: hashWorld(w),
    ticks: w.tick,
    liveAgents: liveAgentCount(w),
    refusals,
  }
}

/**
 * Un scenariu standard, folosit de teste si de benchmark. Deterministic prin constructie.
 *
 * Contine DELIBERAT trei feluri de comenzi, nu unul singur:
 *  - agenti, ca sa miste `AgentStore` si `nextId`
 *  - `setFocus`, ca sa miste discul rezident (chunk-uri incarcate si aruncate)
 *  - sapaturi si zidiri, ca sa PROMOVEZE chunk-uri
 *
 * Ultimul punct e cel care conteaza si a lipsit pana acum. `hashWorld` include
 * numai chunk-urile promovate — decizie corecta, fiindca restul terenului e
 * DERIVED. Dar un scenariu care nu promoveaza nimic face din asta un oracol ORB:
 * hash-ul de referinta din CI acoperea zero teren. Dovedit prin mutatie:
 * cu `HEIGHT_SCALE_DM` mutat de la 1800 la 1900 — adica tot relieful lumii
 * schimbat cu 5,5% — hash-ul ramanea `5bc3ca4c`. O poarta care nu poate sa pice
 * nu e o poarta.
 */
export function standardScenario(seed: number, ticks: number, agents = 20): Scenario {
  const commands: LoggedCommand[] = []

  // Siturile se aleg INAINTE de agenti, fiindca agentii se nasc pe ele.
  const sites = pickSites(seed)

  // Agentii se nasc PE SOL, nu la cota zero.
  //
  // Pana la S12-15 n-a contat: un agent-substitut se plimba aleator si n-avea
  // nevoie de teren sub picioare. De cand merg pe drumuri, conteaza enorm —
  // solul la siturile astea e pe la -70 m, deci la z = 0 agentii pluteau in aer,
  // nu ajungeau niciodata intr-o regiune, si fiecare dintre ei cerea o
  // reconstructie completa de regiuni la fiecare tick. 200 de tickuri nu se
  // terminau in doua minute.
  //
  // Cota se citeste PER CELULA, nu se ia cea a sitului.
  //
  // Prima versiune imprastia agentii pe un patrat de 5x5 in jurul sitului dar le
  // dadea tuturor `sit.groundM + 1`. Pe teren inclinat, vecinii au alt sol — deci
  // majoritatea agentilor ajungeau in aer sau in piatra si nu faceau nimic. Cat
  // timp `spawnAgent` accepta orice pozitie, nimic nu se plangea: scenariul pe
  // care stau testele de determinism si hash-ul de referinta din CI era pe
  // jumatate populat cu agenti inerti.
  const scratch = createTerrain(seed, 1)
  for (let i = 0; i < agents; i++) {
    const sit = sites[i % Math.max(1, sites.length)]
    if (!sit) continue
    const loc = celulaBuna(scratch, sit.wx + (i % 5), sit.wy + (Math.floor(i / 5) % 5))
    if (!loc) continue
    commands.push({
      tick: i % 3,
      cmd: {
        kind: 'spawnAgent',
        x: loc.wx * 1000 + 500,
        y: loc.wy * 1000 + 500,
        z: loc.z,
        faction: i % 5 === 0 ? 2 : 0,
      },
    })
  }

  // Celulele pe care scenariul si le-a REZERVAT deja: zidul, mancarea, paturile.
  // Declarata inaintea buclei de teren fiindca zidul e primul care revendica una,
  // si fara asta mancarea ateriza peste el (`lasaItem: LOC_NECALCABIL`).
  const celuleFolosite = new Set<number>()

  // Terenul.
  let t = 100
  for (const s of sites) {
    commands.push({ tick: t, cmd: { kind: 'setFocus', cx: Math.floor(s.wx / CHUNK_CELLS), cy: Math.floor(s.wy / CHUNK_CELLS) } })
    // Trei voxeli in jos: garantat solizi, deci zero refuzuri.
    for (let d = 0; d < 3; d++) {
      commands.push({ tick: t + 1 + d, cmd: { kind: 'dig', wx: s.wx, wy: s.wy, z: s.groundM - d } })
    }
    // Si un zid. NU deasupra gropii pe care tocmai am sapat-o: acolo e gol, dar
    // e gol si DEDESUBT, deci blocul ar atarna in aer. Scenariul zidea asa de la
    // inceput, iar comentariul de aici spunea „garantat gol" — ceea ce e adevarat
    // si irelevant. Pana la poarta de plasare din taietura 2 nimic nu se plangea:
    // hash-ul de referinta din CI acoperea un bloc care incalca regula de
    // stabilitate a propriului joc.
    //
    // Se zideste pe o coloana VECINA, neatinsa de sapaturi si in afara patratului
    // de 5x5 in care se nasc pionii, pe propriul ei sol — cota se citeste per
    // celula, niciodata a sitului, exact ca la nasterea agentilor.
    const zid = celulaBuna(scratch, s.wx - 2, s.wy - 2)
    if (zid) {
      celuleFolosite.add(zid.wx * 100000 + zid.wy)
      commands.push({ tick: t + 4, cmd: { kind: 'fill', wx: zid.wx, wy: zid.wy, z: zid.z, material: Material.PIATRA_CONSTRUITA } })
    }
    t += 20
  }

  // Munca (S16-19). Desemnari de sapat langa fiecare sit, cu prioritati variate,
  // ca hash-ul de referinta din CI sa acopere joburile, nu doar drumurile: un
  // scanner care ar alege alt candidat, o rezervare care ar scapa, un job care
  // n-ar mai fi persistat — toate ar muta hash-ul. Celulele se verifica solide
  // pe terenul temporar, ca scenariul sa ramana fara refuzuri.
  let k = 0
  // `celulaBuna` cauta in jur, deci doua cereri vecine pot intoarce ACEEASI
  // celula; a doua comanda ar fi refuzata cu CELULA_OCUPATA. Scenariul trebuie sa
  // ramana fara refuzuri, altfel nu se mai vede cand apare unul real.

  for (const s of sites) {
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
      const wx = s.wx + dx
      const wy = s.wy + dy
      const g = groundLevelM(scratch, wx, wy)
      if (!g.ok) continue
      const sus = materialAt(scratch, wx, wy, g.value)
      if (!sus.ok || !isSolid(sus.value)) continue
      commands.push({ tick: t + (k % 7), cmd: { kind: 'desemneaza', wx, wy, z: g.value, prioritate: 1 + (k % 5) } })
      k++
    }
    // Si un depozit langa fiecare sit (taietura 2), ca hash-ul sa acopere si
    // caratul: itemele produse de sapaturi au unde sa mearga. Dreptunghiul se
    // valideaza celula cu celula in comanda; ce nu e calcabil se sare.
    const dz = celulaBuna(scratch, s.wx + 4, s.wy + 4)
    if (dz) commands.push({ tick: t + 8, cmd: { kind: 'picteazaZona', x0: s.wx + 4, y0: s.wy + 4, x1: s.wx + 6, y1: s.wy + 6, z: dz.z, prioritate: 1 + (k % 5) } })

    // Mancare si paturi (taietura 3). Fara ele, scenariul asta ar masura o
    // colonie care moare de foame si care doarme pe jos — iar cifrele de
    // referinta (hash, µs/tick, raportul drum/lucru) ar descrie starea aia, nu
    // jocul. Productia de hrana nu exista inca, deci mancarea se pune cu comanda,
    // exact ca mormanele de depanare.
    // ANCORAT pe celula pe care `celulaBuna` a validat-o, nu pe cea ceruta: ea
    // cauta in jur si poate intoarce o vecina, la alta cota. Cu coordonatele
    // cerute si cota ei, comanda cade pe LOC_NECALCABIL — iar scenariul asta
    // trebuie sa ramana fara refuzuri, altfel nu se mai vede cand apare unul real.
    // CAT trebuie, nu cat incape intr-un morman. Aritmetica, pentru rularea de
    // referinta (100.000 de tickuri, ~32 de pioni ai asezarii): fiecare pierde
    // `scurgere` la fiecare `nevoiTicks`, deci 6 x 400 = 2400 de foame de om,
    // adica ~77.000 in total; la 15 pe unitate sunt ~5100 de unitati, ~68 de
    // mormane pline. Cu un singur morman per sit, colonia manca tot in 25.000 de
    // tickuri si restul rularii masura o asezare care moare de foame — adica
    // exact ce nu trebuie sa descrie cifrele de referinta.
    //
    // Productia de hrana nu exista inca; pana atunci mancarea se pune cu comanda.
    for (let m = 0; m < 6; m++) {
      const hz = celulaBuna(scratch, s.wx - 3 - (m % 3), s.wy + 1 + Math.floor(m / 3))
      if (!hz) continue
      const cheie = hz.wx * 100000 + hz.wy
      if (celuleFolosite.has(cheie)) continue
      celuleFolosite.add(cheie)
      commands.push({ tick: t + 9, cmd: { kind: 'lasaItem', fel: Item.HRANA, cantitate: 75, wx: hz.wx, wy: hz.wy, z: hz.z } })
    }
    const pz = celulaBuna(scratch, s.wx - 5, s.wy - 5)
    if (pz) commands.push({ tick: t + 10, cmd: { kind: 'picteazaZona', x0: pz.wx, y0: pz.wy, x1: pz.wx + 1, y1: pz.wy + 1, z: pz.z, prioritate: 3, fel: Zona.DORMIT } })

    // Santiere si piatra pentru ele (taietura 2, pasul 6).
    //
    // Fara ele, hash-ul de referinta din CI nu atingea DELOC constructia. Masurat
    // pe 19.09.2026: zero desemnari de CONSTRUIESTE in tot scenariul, deci
    // `candDist2`, `matOriunde` si cauza „lipsa material" puteau fi schimbate —
    // si CHIAR au fost, in aceeasi zi — fara ca poarta de determinism sa observe.
    // Aceeasi deadness ca la fixtura pe care statea M5, gasita in aceeasi zi.
    //
    // Piatra se pune cu comanda, desi sapaturile produc si ele: asa santierul nu
    // depinde de cat de repede ajunge caratul, iar scenariul ramane fara refuzuri.
    for (let b = 0; b < 2; b++) {
      const sz = celulaBuna(scratch, s.wx + 7 + b * 2, s.wy - 2)
      if (!sz) continue
      const cheieS = sz.wx * 100000 + sz.wy
      if (celuleFolosite.has(cheieS)) continue
      celuleFolosite.add(cheieS)
      commands.push({ tick: t + 11, cmd: { kind: 'desemneaza', wx: sz.wx, wy: sz.wy, z: sz.z, piesa: Piesa.PERETE, prioritate: 2 } })
      const mz = celulaBuna(scratch, s.wx + 7 + b * 2, s.wy + 1)
      if (!mz) continue
      const cheieM = mz.wx * 100000 + mz.wy
      if (celuleFolosite.has(cheieM)) continue
      celuleFolosite.add(cheieM)
      commands.push({ tick: t + 12, cmd: { kind: 'lasaItem', fel: Item.PIATRA, cantitate: 20, wx: mz.wx, wy: mz.wy, z: mz.z } })
    }
  }

  return { seed, ticks, commands }
}

interface Site {
  readonly wx: number
  readonly wy: number
  readonly groundM: number
}

/** Cate situri de fiecare semn. Ambele semne conteaza: `Math.floor` pe centimetri negativi. */
const SITES_PER_SIGN = 6

/**
 * Alege situri de sapat: jumatate sub cota zero, jumatate peste.
 *
 * Ambele semne intentionat: cota se calculeaza cu `Math.floor(cm / 100)`, iar
 * `Math.floor` pe negative nu se comporta ca trunchierea. Un scenariu care sapa
 * numai pe deal nu ar prinde niciodata o regresie de semn.
 *
 * Ruleaza pe un teren TEMPORAR, aruncat imediat: alegerea trebuie sa fie o
 * functie pura de seed, nu sa depinda de starea lumii in care se ruleaza.
 */
function pickSites(seed: number): Site[] {
  const scratch = createTerrain(seed, 1)
  const below: Site[] = []
  const above: Site[] = []

  for (let k = 1; k <= 400; k++) {
    if (below.length >= SITES_PER_SIGN && above.length >= SITES_PER_SIGN) break
    // Doua numere prime mari, ca pasii sa nu se alinieze pe grila de chunk-uri.
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(scratch, wx, wy)
    if (!g.ok) continue
    // Sub apa nu se sapa. Pana la corectarea caii derivate, `materialAt` spunea
    // PAMANT si pe fundul lacului, deci scenariul „reusea" sa sape acolo; acum
    // primeste APA si e refuzat, cum e si corect. Situl se alege pe uscat.
    const sus = materialAt(scratch, wx, wy, g.value)
    if (!sus.ok || !isSolid(sus.value)) continue
    const site: Site = { wx, wy, groundM: g.value }
    if (g.value < 0 && below.length < SITES_PER_SIGN) below.push(site)
    else if (g.value >= 0 && above.length < SITES_PER_SIGN) above.push(site)
  }

  // Intercalate, ca ordinea sa nu grupeze toate promovarile de acelasi semn.
  const out: Site[] = []
  for (let i = 0; i < Math.max(below.length, above.length); i++) {
    if (i < below.length) out.push(below[i]!)
    if (i < above.length) out.push(above[i]!)
  }
  return out
}

export { advance, createWorld, hashWorld }

/**
 * O celula pe care se poate STA, cautata in spirala in jurul unui punct.
 *
 * Ordinea e fixa si marginita: fara ea, alegerea ar depinde de cat de departe
 * cauta, iar scenariul n-ar mai fi o functie pura de seed.
 */
function celulaBuna(t: Terrain, wx: number, wy: number): { wx: number; wy: number; z: number } | null {
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const cx = wx + dx
        const cy = wy + dy
        if (cx < 0 || cy < 0) continue
        const g = groundLevelM(t, cx, cy)
        if (!g.ok) continue
        if (!isWalkable(t, cx, cy, g.value + 1, DEFAULT_RULES)) continue
        return { wx: cx, wy: cy, z: g.value + 1 }
      }
    }
  }
  return null
}
