/**
 * Construcția — S20-23, tăietura 2.
 *
 * Deocamdată nu există nicio piesă și niciun job de construit. Ce e aici e
 * **poarta pe felul desemnării**, adică pasul 1 din ordinea pe care a scris-o
 * panoul de design — și motivul pentru care el e primul:
 *
 * Până la ea, `cautaJob` nu citea NICIODATĂ `d.kind`. Cu un singur fel, `else`
 * era corect; la al doilea devine o presupunere — aceeași familie cu cele cinci
 * `else` care presupuneau SAPA, reparate cu tabelul de drivere în S16-19. Panoul
 * a reprodus-o în lumea scenariului standard: o desemnare de alt fel e luată cu
 * `jobKind = SAPA`, iar la tickul 3047 desemnarea e ștearsă și celula e goală.
 * Jucătorul cere un perete, primește o groapă — zero refuzuri, zero cauze, și
 * niciun test existent nu se înroșește.
 *
 * Testele de aici pun felul DIRECT pe store, nu printr-o comandă: comanda care
 * creează un blueprint vine în pasul 6. Asta e deliberat — poarta trebuie probată
 * înainte să existe ce apără, altfel prima piesă se autodistruge.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { Desemnare, seSapaLa, slotDesemnare } from '../src/sim/desemnari.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { decode, encode } from '../src/sim/save.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { dig, fill, groundLevelM, materialAt } from '../src/sim/terrain/terrain.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { codMotiv, Reason } from '../src/sim/result.ts'
import { constructiaPosibila, poateSustine, suportDacaZidesc, suportLa } from '../src/sim/stabilitate.ts'
import { cellKey, decodeCell } from '../src/sim/path.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'
import { CATEGORII, Categorie, FelJob, Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { anuleazaDesemnare, celulaDeLucru, cerereCarat, comparaCandidati, constructiaPrevizualizata, esteEvitata, evitaTinta, lantAcopera, lastJobReport, pornesteConstruieste, pragRidicare, rezumatMaterial, unitatiDeMunca } from '../src/sim/joburi.ts'
import { Nevoie, NEVOI } from '../src/sim/state.ts'
import type { Rules } from '../src/sim/content.ts'
import { slotItem } from '../src/sim/iteme.ts'
import { indexZone } from '../src/sim/zone.ts'
import { elibereaza, rezervariPentru, rezervaToate, Strat } from '../src/sim/rezervari.ts'
import { find, regionAt } from '../src/sim/regions.ts'
import type { MaterialPentruPiesa } from '../src/sim/joburi.ts'
import { DetaliuMotiv } from '../src/sim/desemnari.ts'
import { Faction, Item } from '../src/sim/state.ts'
import { panaCand } from './fixturi.ts'
import { PasCara, PasConstruieste } from '../src/sim/state.ts'
import { asazaItem, itemLaCelula } from '../src/sim/iteme.ts'
import { lasaItem } from './fixturi.ts'
import { desemneaza, laSit, lume3000, marfaTotala, patratPlat, R, ruleaza, solid, solidLaDistanta } from './fixturi.ts'
import { createWorld } from '../src/sim/world.ts'
import { WORLD_CELLS } from '../src/sim/terrain/terrain.ts'

/**
 * Un petec de sol PLAT de `latura` celule, cautat pe mai multe mii de coloane.
 *
 * `patratPlat` din fixturi cauta doar pe cele patru directii dintr-un sit dat, si
 * la 9x9 nu gaseste nimic pe seedurile astea. Terenul plat nu e un moft de
 * fixtura aici: pe teren inclinat coloanele vecine au propriul lor sol, deci o
 * consola s-ar sprijini pe pamant in loc sa atarne — prima versiune a testului
 * n-a cerut-o si a patra celula a trecut, desi regula spune ca nu are voie.
 */
function sitPlat(seed: number, latura: number): { w: World; wx: number; wy: number; g: number } {
  const w = createWorld(seed)
  for (let k = 1; k <= 8000; k++) {
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(w.terrain, wx, wy)
    if (!g.ok) continue
    // Si USCAT. `groundLevelM` intoarce cota solului si sub apa, iar acolo celula
    // de la `g` e APA — care nu e solida, deci nu sustine nimic. Fara verificarea
    // asta, fixtura alegea un sit la -47 m si primul nivel al stalpului iesea
    // FARA_SPRIJIN. E aceeasi capcana pe care `pickSites` din scenariu o are deja
    // scrisa: „sub apa nu se sapa; situl se alege pe uscat".
    const sus = materialAt(w.terrain, wx, wy, g.value)
    if (!sus.ok || !isSolid(sus.value)) continue
    let plat = true
    for (let dx = -2; dx <= latura + 2 && plat; dx++) {
      for (let dy = -2; dy <= latura + 2; dy++) {
        const gg = groundLevelM(w.terrain, wx + dx, wy + dy)
        if (!gg.ok || gg.value !== g.value) { plat = false; break }
      }
    }
    if (plat) return { w, wx, wy, g: g.value }
  }
  assert.fail(`niciun sit plat de ${latura} la seed ${seed}`)
}

test('o desemnare care NU e de sapat nu e luata niciodata ca job de sapat', () => {
  const { w, sit } = laSit(12345, 4, [0, 0, 0, 0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)
  const { id } = desemneaza(w, tinta.wx, tinta.wy)
  const slot = slotDesemnare(w.desemnari, id)
  assert.notEqual(slot, -1, 'fixtura: desemnarea trebuie sa existe')

  // Felul se schimba direct pe store: comanda vine in pasul 6.
  w.desemnari.kind[slot] = Desemnare.CONSTRUIESTE

  const z = w.desemnari.z[slot]!
  const inainte = materialAt(w.terrain, tinta.wx, tinta.wy, z)
  assert.ok(inainte.ok && isSolid(inainte.value), 'fixtura: celula trebuie sa fie solida la inceput')

  // Oracolul e „niciun pion n-a avut VREODATA un job de sapat", nu
  // `joburiPornite`: ala numara toate felurile, iar pionii mananca si dorm.
  let sapaturi = 0
  ruleaza(w, 1000, R, (ww) => {
    for (let i = 0; i < ww.agents.count; i++) if (ww.agents.jobKind[i] === FelJob.SAPA) sapaturi++
  })

  assert.equal(sapaturi, 0, `poarta a lasat sa treaca ${sapaturi} tickuri de sapat pe o desemnare de alt fel`)
  assert.equal(w.desemnari.alive[slot], 1, 'desemnarea de alt fel n-are voie sa fie consumata de sapat')
  const dupa = materialAt(w.terrain, tinta.wx, tinta.wy, z)
  assert.ok(dupa.ok && isSolid(dupa.value), 'si nici celula ei sapata')
})

test('o desemnare de SAPAT din aceeasi fixtura CHIAR se sapa (controlul negativ)', () => {
  // Fara el, testul de mai sus ar trece si daca fixtura n-ar produce niciodata un
  // job — adica daca n-ar exercita nimic. „Un semnal verde nu e o masuratoare."
  const { w, sit } = laSit(12345, 4, [0, 0, 0, 0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)
  const { id } = desemneaza(w, tinta.wx, tinta.wy)
  const slot = slotDesemnare(w.desemnari, id)
  const z = w.desemnari.z[slot]!

  let sapaturi = 0
  ruleaza(w, 1000, R, (ww) => {
    for (let i = 0; i < ww.agents.count; i++) if (ww.agents.jobKind[i] === FelJob.SAPA) sapaturi++
  })

  assert.ok(sapaturi > 0, 'fixtura: aceeasi asezare trebuie sa produca tickuri de SAPAT cand felul e SAPA')
  const dupa = materialAt(w.terrain, tinta.wx, tinta.wy, z)
  assert.ok(dupa.ok && !isSolid(dupa.value), 'si celula chiar trebuie sapata')
})

test('podeaua unei desemnari de CONSTRUIT nu blocheaza locul de lucru', () => {
  // `celulaDeLucru` si `lucreazaSapa` intreaba „se sapa sub picioarele mele?" ca
  // sa nu puna pionul pe o podea care urmeaza sa dispara. Pana la `seSapaLa`
  // intrebau doar „exista o desemnare aici" — iar pentru o desemnare de CONSTRUIT
  // raspunsul e invers: podeaua ramane, si chiar se intareste.
  const { w, sit } = laSit(12345, 1, [0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)
  const { id } = desemneaza(w, tinta.wx, tinta.wy)
  const slot = slotDesemnare(w.desemnari, id)
  const z = w.desemnari.z[slot]!

  assert.equal(seSapaLa(w.desemnari, tinta.wx, tinta.wy, z), true, 'cat timp e SAPA, se sapa acolo')
  w.desemnari.kind[slot] = Desemnare.CONSTRUIESTE
  assert.equal(seSapaLa(w.desemnari, tinta.wx, tinta.wy, z), false, 'de indata ce e CONSTRUIESTE, nu se mai sapa')
  assert.equal(seSapaLa(w.desemnari, tinta.wx, tinta.wy, z + 3), false, 'si nici pe o celula fara desemnare')
  void R
})

test('un pion pus EXCLUSIV pe construit nu mai sapa', () => {
  // A treia categorie exista inainte de primul job de construit, si asta se poate
  // proba de pe acum: `exclusiv` se calculeaza peste TOATE categoriile. Cu maximul
  // luat doar peste sapat si carat, un pion pus exclusiv pe construit ar continua
  // sa sape — `pS` n-ar fi maxim, dar nici `exclusiv` n-ar fi adevarat, deci
  // poarta s-ar deschide.
  const { w, sit } = laSit(12345, 4, [0, 0, 0, 0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)
  desemneaza(w, tinta.wx, tinta.wy)

  for (let i = 0; i < w.agents.count; i++) {
    const out = applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[i]!, categorie: Categorie.CONSTRUIESTE, nivel: R.personalPriorityLevels }, R)
    assert.ok(out.ok, `a treia categorie trebuie acceptata de comanda: ${JSON.stringify(out)}`)
    assert.equal(w.agents.prioPersonala[i * CATEGORII + Categorie.CONSTRUIESTE], R.personalPriorityLevels)
  }

  let sapaturi = 0
  ruleaza(w, 1000, R, (ww) => {
    for (let i = 0; i < ww.agents.count; i++) if (ww.agents.jobKind[i] === FelJob.SAPA) sapaturi++
  })
  assert.equal(sapaturi, 0, `pionii pusi exclusiv pe construit au sapat ${sapaturi} tickuri`)
})

test('slotul reutilizat nu mostenește piesa desemnarii moarte', () => {
  // `hashWorld` parcurge `subarray(0, count)`, nu doar sloturile vii. Deci un camp
  // ramas de la o desemnare moarta muta hash-ul dintr-un slot pe care nimeni nu-l
  // mai citeste — o divergenta care apare la incarcare si nu are nicio cauza
  // vizibila in joc. Aceeasi grija ca la `reincercaLaTick`, unde o racire
  // mostenita facea desemnarea noua sa fie ignorata pana la un tick pe care nu-l
  // traise.
  const { w, sit } = laSit(12345, 1, [0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)

  const prima = desemneaza(w, tinta.wx, tinta.wy)
  const slot = slotDesemnare(w.desemnari, prima.id)
  w.desemnari.piesa[slot] = Piesa.PERETE
  const anulare = applyCommand(w, { kind: 'anuleazaDesemnarea', id: prima.id }, R)
  assert.ok(anulare.ok, `fixtura: anularea a fost refuzata: ${JSON.stringify(anulare)}`)

  const doua = desemneaza(w, tinta.wx, tinta.wy)
  const slot2 = slotDesemnare(w.desemnari, doua.id)
  assert.equal(slot2, slot, `fixtura: slotul trebuie REUTILIZAT, altfel testul nu probeaza nimic`)
  assert.equal(w.desemnari.piesa[slot2], Piesa.NICIUNA, `piesa mostenita de la desemnarea moarta: ${w.desemnari.piesa[slot2]}`)

  // Si proba care conteaza de fapt: hash-ul nu vede diferenta fata de o lume in
  // care prima desemnare n-a purtat niciodata o piesa.
  const curata = laSit(12345, 1, [0])
  const tintaCurata = solidLaDistanta(curata.w, curata.sit.wx, curata.sit.wy, curata.sit.g, 3, 8)
  const p1 = desemneaza(curata.w, tintaCurata.wx, tintaCurata.wy)
  assert.ok(applyCommand(curata.w, { kind: 'anuleazaDesemnarea', id: p1.id }, R).ok)
  desemneaza(curata.w, tintaCurata.wx, tintaCurata.wy)
  assert.equal(hashWorld(w), hashWorld(curata.w), 'o piesa ramasa intr-un slot mort muta hash-ul')
})

// ---------------------------------------------------------------------------
// stabilitatea la ZIDIRE (pasul 4)
// ---------------------------------------------------------------------------

test('nu se mai poate zidi in aer: golul principal al designului', () => {
  // Pana aici `fill` nu trecea DELOC prin regula de stabilitate. Panoul de design
  // a reprodus-o: un bloc la cinci metri deasupra solului, suport 0, supravietuia
  // si la 200 de tickuri si la save/load. Adica `suport(c) > 0` era un invariant
  // FALS pe starea salvata, iar momentul in care o piesa cadea ajungea sa depinda
  // de ce atinsese cineva alaturi, nu de teren.
  const { w, sit } = laSit(12345, 0)
  const g = groundLevelM(w.terrain, sit.wx, sit.wy)
  assert.ok(g.ok)
  if (!g.ok) return

  const sus = applyCommand(w, { kind: 'fill', wx: sit.wx, wy: sit.wy, z: g.value + 5, material: Material.PIATRA_CONSTRUITA }, R)
  assert.equal(sus.ok, false, 'un bloc la cinci metri in aer trebuie REFUZAT')
  if (!sus.ok) {
    assert.equal(sus.reason, Reason.FARA_SPRIJIN)
    assert.equal(sus.params.z, g.value + 5, 'refuzul poarta celula, ca sa se poata arata in „De ce nu?"')
    assert.equal(sus.params.raza, R.suportMax)
  }

  // CONTROLUL NEGATIV: pe sol se poate. Fara el, testul ar trece si daca poarta
  // ar refuza absolut orice zidire.
  const jos = applyCommand(w, { kind: 'fill', wx: sit.wx, wy: sit.wy, z: g.value + 1, material: Material.PIATRA_CONSTRUITA }, R)
  assert.ok(jos.ok, `zidirea pe sol a fost refuzata: ${JSON.stringify(jos)}`)
})

test('consola se intinde exact 3 celule, apoi cade: regula scrisa pentru jucator', () => {
  // „Cel mult 3 celule de orice sprijin" e propozitia pe care o citeste jucatorul,
  // si asta e testul ei pe partea de ZIDIRE (perechea 5-tine / 7-cade o probeaza
  // pe partea de sapat). Se ridica un stalp de doi, apoi se iese lateral in aer:
  // a patra celula e la distanta 4 de orice sprijin, deci suport 0.
  // Terenul trebuie sa fie PLAT, si nu e un amanunt de fixtura: pe teren inclinat
  // coloanele vecine au propriul lor sol, deci consola s-ar sprijini pe pamant, nu
  // pe ea insasi. Prima versiune a testului n-a cerut-o si a patra celula a trecut.
  const { w, wx, wy, g } = sitPlat(4242, 9)
  const cx = wx + 1
  const cy = wy + 4
  const z = g + 2

  assert.ok(applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z: g + 1, material: Material.PIATRA_CONSTRUITA }, R).ok, 'fixtura: primul nivel al stalpului')
  assert.ok(applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z, material: Material.PIATRA_CONSTRUITA }, R).ok, 'fixtura: al doilea nivel')

  for (let d = 1; d <= 3; d++) {
    const out = applyCommand(w, { kind: 'fill', wx: cx + d, wy: cy, z, material: Material.PIATRA_CONSTRUITA }, R)
    assert.ok(out.ok, `celula ${d} a consolei trebuia sa se poata zidi: ${JSON.stringify(out)}`)
    assert.equal(suportLa(w.terrain, R, cx + d, cy, z), R.suportMax - d, `suportul la ${d} pasi`)
  }
  const aPatra = applyCommand(w, { kind: 'fill', wx: cx + 4, wy: cy, z, material: Material.PIATRA_CONSTRUITA }, R)
  assert.equal(aPatra.ok, false, 'a patra celula a consolei e la distanta 4: n-are voie')
  if (!aPatra.ok) assert.equal(aPatra.reason, Reason.FARA_SPRIJIN)
})

test('`suportDacaZidesc` e OGLINDA: aceeasi cifra ca `suportLa` dupa ce chiar zidesti', () => {
  // Proprietatea care leaga cele doua functii. Fara ea, poarta ar putea raspunde
  // consecvent si GRESIT: ar refuza ce sta in picioare, sau ar lasa sa treaca ce
  // cade in acelasi tick.
  const s7 = sitPlat(777, 9)
  const w = s7.w
  const cx = s7.wx + 4
  const cy = s7.wy + 4
  const z = s7.g + 2

  // Un stalp, ca sa existe si celule cu suport PARTIAL in jur, nu doar 4 si 0.
  assert.ok(applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z: z - 1, material: Material.PIATRA_CONSTRUITA }, R).ok)
  assert.ok(applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z, material: Material.PIATRA_CONSTRUITA }, R).ok)

  let verificate = 0
  let partiale = 0
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const wx = cx + dx
      const wy = cy + dy
      const prezis = suportDacaZidesc(w.terrain, R, wx, wy, z)
      const poarta = poateSustine(w.terrain, R, wx, wy, z)
      assert.equal(poarta.ok, prezis > 0, `poarta si cifra nu spun acelasi lucru la ${dx},${dy}`)

      const zidit = applyCommand(w, { kind: 'fill', wx, wy, z, material: Material.PIATRA_CONSTRUITA }, R)
      if (!zidit.ok) {
        // Refuzul poate veni si din alt motiv decat sprijinul (celula deja plina).
        // Ce trebuie sa fie adevarat e ca FARA_SPRIJIN apare EXACT cand cifra e 0.
        assert.equal(zidit.reason === Reason.FARA_SPRIJIN, prezis === 0, `refuz ${zidit.reason} la prezis ${prezis}, la ${dx},${dy}`)
        continue
      }
      const real = suportLa(w.terrain, R, wx, wy, z)
      assert.equal(real, prezis, `la ${dx},${dy}: prezis ${prezis}, real ${real}`)
      if (real > 0 && real < R.suportMax) partiale++
      verificate++
      // NU se sapa inapoi: sapatul lasa un morman, iar urmatorul `fill` pe celula
      // aia ar fi refuzat cu CELULA_OCUPATA. Terenul se aduna, si e mai bine asa —
      // fiecare celula e judecata pe lumea reala din momentul ei, nu pe una
      // artificial curatata.
    }
  }
  // 15 din 49: restul sunt refuzate pe drept, fiindca nu se pot construi in ordinea
  // in care le scaneaza bucla. Ce conteaza e ca printre cele construite sa existe
  // si suporturi PARTIALE — altfel proprietatea s-ar verifica doar pe 4 si 0.
  assert.ok(verificate >= 12, `fixtura: doar ${verificate} celule verificate`)
  assert.ok(partiale > 0, 'fixtura: trebuie sa existe si celule cu suport PARTIAL, nu doar 4 si 0')
})

test('o celula deja plina raspunde CELULA_PLINA, nu FARA_SPRIJIN', () => {
  // Poarta de sprijin spune „da" pe ce e deja solid: nu se plaseaza nimic acolo,
  // deci refuzul trebuie sa vina de la teren, cu informatia utila. Un depozit plin
  // si o celula de roca cer actiuni complet diferite de la jucator.
  const { w, sit } = laSit(12345, 0)
  const g = groundLevelM(w.terrain, sit.wx, sit.wy)
  assert.ok(g.ok)
  if (!g.ok) return
  const out = applyCommand(w, { kind: 'fill', wx: sit.wx, wy: sit.wy, z: g.value, material: Material.PIATRA_CONSTRUITA }, R)
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.reason, Reason.CELULA_PLINA)

  // Si cazul care CHIAR leaga garda: un bloc deja PLUTITOR. Comanda nu-l mai poate
  // crea, dar un save de dinaintea taieturii poate sa-l contina — si atunci
  // raspunsul „n-are sprijin" ar fi adevarat si inutil, fiindca nu se plaseaza
  // nimic acolo. Se zideste prin editare directa de teren, ca in `carat.test.ts`.
  const zPlutitor = g.value + 5
  assert.ok(fill(w.terrain, sit.wx, sit.wy, zPlutitor, Material.PIATRA_CONSTRUITA).ok, 'fixtura: editare directa')
  assert.equal(suportLa(w.terrain, R, sit.wx, sit.wy, zPlutitor), 0, 'fixtura: blocul chiar atarna in aer')
  const peste = applyCommand(w, { kind: 'fill', wx: sit.wx, wy: sit.wy, z: zPlutitor, material: Material.PIATRA_CONSTRUITA }, R)
  assert.equal(peste.ok, false)
  if (!peste.ok) assert.equal(peste.reason, Reason.CELULA_PLINA, 'pe o celula plina raspunsul e ce E acolo, nu ce ar fi')
})

// ---------------------------------------------------------------------------
// inchiderea de constructie (pasul 5)
// ---------------------------------------------------------------------------

/** Perimetru de LxL pe `etaje` niveluri, plus podea deasupra. */
function casa(wx: number, wy: number, g: number, L: number, etaje: number): number[] {
  const out: number[] = []
  for (let e = 0; e < etaje; e++) {
    const z = g + 1 + e
    for (let dx = 0; dx < L; dx++) {
      for (let dy = 0; dy < L; dy++) {
        if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
        out.push(cellKey(wx + dx, wy + dy, z))
      }
    }
  }
  for (let dx = 0; dx < L; dx++) {
    for (let dy = 0; dy < L; dy++) out.push(cellKey(wx + dx, wy + dy, g + 1 + etaje))
  }
  return out
}

test('ACCEPTANTA: casa de 9x9 pe trei etaje — 176 din 177, si imposibila e centrul podelei', () => {
  // Cifra pe care panoul de design a masurat-o ca argument impotriva validatorului
  // per-celula: ala ar fi refuzat 145 din 177 la desenare, fiindca piesele care
  // inca nu exista nu se sprijina reciproc. Cu adevarat imposibila e UNA — centrul
  // podelei, la 4 pasi de orice perete.
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const plan = casa(wx, wy, g, 9, 3)
  assert.equal(plan.length, 177, `fixtura: casa trebuie sa aiba 177 de piese, are ${plan.length}`)

  const r = constructiaPosibila(w.terrain, R, plan)
  assert.equal(r.construibile.length, 176)
  assert.equal(r.imposibile.length, 1)
  const c = decodeCell(r.imposibile[0]!)
  assert.deepEqual(
    { dx: c.wx - wx, dy: c.wy - wy, dz: c.z - g },
    { dx: 4, dy: 4, dz: 4 },
    'imposibila trebuie sa fie exact centrul podelei'
  )
})

test('multi-etajul ARE o limita, si e o regula de joc, nu un accident', () => {
  // §5 din designul meu spunea „multi-etaj nu adauga nimic". E fals: o podea peste
  // o camera W×W lasa o gaura in mijloc, si gaura creste cu W. Cifrele astea
  // plafoneaza camera ACOPERITA la 9 lat — o decizie de joc care trebuie scrisa si
  // aratata prin previzualizare, nu descoperita dupa ce jucatorul a desenat.
  const { w, wx, wy, g } = sitPlat(12345, 21)
  for (const [L, asteptat] of [[9, 1], [15, 49]] as const) {
    const r = constructiaPosibila(w.terrain, R, casa(wx, wy, g, L, 3))
    assert.equal(r.imposibile.length, asteptat, `casa ${L}x${L}: ${r.imposibile.length} imposibile, asteptat ${asteptat}`)
  }
})

test('monotonia e o GARANTIE: aceeasi multime, patru ordini, acelasi raspuns', () => {
  // Riscul pe care il scrisesem in design — „aceeasi cladire se ridica sau nu,
  // dupa noroc, fiindca ordinea in care pionii iau joburile e emergenta" — e FALS,
  // si asta e testul care il inchide. Regula e monotona: a adauga un voxel poate
  // doar sa SCADA distantele pana la un sprijin, deci multimea construibila e o
  // inchidere, si inchiderea e unica.
  const { w, wx, wy, g } = sitPlat(4242, 13)
  const plan = casa(wx, wy, g, 9, 3)
  const ordini = [
    plan,
    [...plan].reverse(),
    [...plan].sort((a, b) => a - b),
    [...plan].sort((a, b) => (a % 7) - (b % 7) || a - b),
  ]
  const raspunsuri = ordini.map((o) => constructiaPosibila(w.terrain, R, o).construibile.join(','))
  assert.equal(new Set(raspunsuri).size, 1, `${new Set(raspunsuri).size} raspunsuri diferite pe 4 ordini`)
  assert.ok(raspunsuri[0]!.length > 0, 'fixtura: raspunsul nu poate fi gol')
})

test('o singura trecere peste planul TERMINAT supra-promite', () => {
  // Cealalta jumatate a argumentului. Chiar daca judeci planul ca si cum ar fi deja
  // ridicat tot — „ce suport ar avea fiecare piesa daca toate ar exista" — raspunsul
  // e prea optimist: promite piese care nu se pot construi INCREMENTAL, fiindca la
  // momentul lor sprijinul inca nu exista. Panoul a masurat supra-promisiune in 200
  // din 200 de planuri aleatoare.
  // Fixtura trebuie sa fie NEREGULATA, si asta am aflat-o gresind: pe o casa cele
  // doua raspunsuri sunt identice (344 si 344), fiindca o casa e stratificata si
  // fiecare piesa isi are sprijinul sub ea. Diferenta apare cand planul are goluri
  // — adica exact cum deseneaza un jucator care nu construieste un cub perfect.
  //
  // Masurat pe 200 de planuri pseudo-aleatoare intr-o cutie de 12x12x6: naivul
  // promite mai mult in 200 din 200 de cazuri, in medie 231,4 celule fata de 168,9,
  // cu un exces maxim de 138.
  const { w, wx, wy, g } = sitPlat(12345, 21)

  let maiMult = 0
  let incercate = 0
  for (let seed = 1; seed <= 20; seed++) {
    // Generator intreg DETERMINIST, nu un flux de RNG: e o fixtura de test, nu
    // stare de simulare.
    const plan: number[] = []
    let h = (seed * 2654435761) >>> 0
    for (let dx = 0; dx < 12; dx++) {
      for (let dy = 0; dy < 12; dy++) {
        for (let dz = 1; dz <= 6; dz++) {
          h = (h * 1664525 + 1013904223) >>> 0
          if ((h >>> 16) % 100 < 35) plan.push(cellKey(wx + dx, wy + dy, g + dz))
        }
      }
    }
    if (plan.length === 0) continue
    const toate = new Set(plan)
    let naiv = 0
    for (const cheie of plan) {
      const c = decodeCell(cheie)
      if (suportDacaZidesc(w.terrain, R, c.wx, c.wy, c.z, toate) > 0) naiv++
    }
    const real = constructiaPosibila(w.terrain, R, plan).construibile.length
    incercate++
    assert.ok(naiv >= real, `inchiderea a promis mai mult decat naivul la seed ${seed}: ${real} > ${naiv}`)
    if (naiv > real) maiMult++
  }
  assert.ok(incercate >= 15, `fixtura: doar ${incercate} planuri generate`)
  assert.equal(maiMult, incercate, `naivul trebuia sa supra-promita pe TOATE: ${maiMult} din ${incercate}`)
})

test('o celula deja solida nu e nici construibila, nici imposibila', () => {
  // Iese din multime de la inceput: nu e „de construit". Altfel un plan desenat
  // peste roca ar raporta cifre care nu inseamna nimic pentru jucator.
  const { w, wx, wy, g } = sitPlat(12345, 9)
  const subteran = cellKey(wx, wy, g - 2)
  const inAer = cellKey(wx, wy, g + 1)
  const r = constructiaPosibila(w.terrain, R, [subteran, inAer])
  assert.deepEqual(r.construibile, [inAer].sort((a, b) => a - b))
  assert.deepEqual(r.imposibile, [])
})

// ---------------------------------------------------------------------------
// desenarea unui blueprint (pasul 5b)
// ---------------------------------------------------------------------------

/** Deseneaza o casa intreaga ca desemnari de CONSTRUIT. Intoarce cate au intrat. */
function deseneaza(w: World, plan: readonly number[]): { acceptate: number; refuzuri: string[] } {
  let acceptate = 0
  const refuzuri: string[] = []
  for (const cheie of plan) {
    const c = decodeCell(cheie)
    const out = applyCommand(w, { kind: 'desemneaza', wx: c.wx, wy: c.wy, z: c.z, piesa: Piesa.PERETE }, R)
    if (out.ok) acceptate++
    else refuzuri.push(out.reason)
  }
  return { acceptate, refuzuri }
}

test('ACCEPTANTA: casa de 177 de piese se DESENEAZA intreaga, si previzualizarea spune care e imposibila', () => {
  // Cifra pe care o cerea panoul pentru pasul asta: 176 din 177 marcate
  // construibile la desen, 1 refuzata — nu 32 legale si 145 refuzate, cum ar fi
  // iesit cu un validator de sprijin per celula.
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const plan = casa(wx, wy, g, 9, 3)

  const { acceptate, refuzuri } = deseneaza(w, plan)
  assert.equal(acceptate, 177, `desenarea trebuia sa accepte TOT planul; refuzuri: ${[...new Set(refuzuri)].join(',')}`)

  const previz = constructiaPrevizualizata(w, R)
  assert.equal(previz.construibile.length, 176)
  assert.equal(previz.imposibile.length, 1)
  const c = decodeCell(previz.imposibile[0]!)
  assert.deepEqual({ dx: c.wx - wx, dy: c.wy - wy, dz: c.z - g }, { dx: 4, dy: 4, dz: 4 })
})

test('la DESENARE nu se verifica sprijinul, si asta e deliberat', () => {
  // O piesa singura, la cinci metri in aer: desenarea o ACCEPTA, iar
  // previzualizarea o da imposibila. Daca desenarea ar refuza-o, jucatorul n-ar
  // putea desena nicio casa — a doua piesa se sprijina pe prima, care inca nu
  // exista.
  const { w, wx, wy, g } = sitPlat(4242, 9)
  const out = applyCommand(w, { kind: 'desemneaza', wx, wy, z: g + 5, piesa: Piesa.PERETE }, R)
  assert.ok(out.ok, `desenarea n-are voie sa se uite la sprijin: ${JSON.stringify(out)}`)

  // Si o desemnare de SAPAT alaturi, ca previzualizarea sa aiba ce IGNORA.
  //
  // Nu e de ajuns una obisnuita: o desemnare de sapat sta mereu pe o celula SOLIDA,
  // iar inchiderea scoate celulele solide din multime de la inceput — deci inclusa
  // din greseala, n-ar schimba niciun numar, si proba filtrului a iesit RATATA
  // exact asa. Ii sapam celula pe sub ea, prin editare directa de teren: ramane o
  // desemnare de SAPAT pe AER, adica exact ce ar contamina raspunsul.
  const deSapat = applyCommand(w, { kind: 'desemneaza', wx: wx + 2, wy, z: g - 1 }, R)
  assert.ok(deSapat.ok, `fixtura: desemnarea de sapat a fost refuzata: ${JSON.stringify(deSapat)}`)
  assert.ok(dig(w.terrain, wx + 2, wy, g - 1).ok, 'fixtura: editare directa, ca desemnarea sa ramana pe aer')

  const previz = constructiaPrevizualizata(w, R)
  assert.equal(previz.construibile.length, 0, 'si totusi nu e construibila')
  assert.equal(
    previz.imposibile.length,
    1,
    'previzualizarea numara DOAR desemnarile de construit; cea de sapat n-are ce cauta in ea',
  )

  // Iar `fill` tot o refuza: poarta de la ZIDESTE ramane ultima.
  const zidit = applyCommand(w, { kind: 'fill', wx, wy, z: g + 5, material: Material.PIATRA_CONSTRUITA }, R)
  assert.equal(zidit.ok, false)
  if (!zidit.ok) assert.equal(zidit.reason, Reason.FARA_SPRIJIN)
})

test('ce SE verifica la desenare: celula plina, piesa necunoscuta, pion, morman', () => {
  // Proprietatile care NU depind de ordinea de constructie. Fiecare cu refuzul ei,
  // ca panoul „De ce nu?" sa aiba ce arata.
  const { w, sit } = laSit(506, 1)
  const cx = sit.wx + 3
  const cy = sit.wy
  const g = solid(w, cx, cy)!

  const plina = applyCommand(w, { kind: 'desemneaza', wx: cx, wy: cy, z: g, piesa: Piesa.PERETE }, R)
  assert.equal(plina.ok, false)
  if (!plina.ok) assert.equal(plina.reason, Reason.CELULA_PLINA)

  const necunoscuta = applyCommand(w, { kind: 'desemneaza', wx: cx, wy: cy, z: g + 1, piesa: 99 }, R)
  assert.equal(necunoscuta.ok, false)
  if (!necunoscuta.ok) {
    assert.equal(necunoscuta.reason, Reason.VALOARE_INVALIDA)
    assert.equal(necunoscuta.params.camp, 'piesa')
  }

  // Peste un morman: aceeasi garda ca la `fill`, si acum chiar e aceeasi functie.
  const id = lasaItem(w, 0, 10, cx, cy)
  const pesteMorman = applyCommand(w, { kind: 'desemneaza', wx: cx, wy: cy, z: g + 1, piesa: Piesa.PERETE }, R)
  assert.equal(pesteMorman.ok, false)
  if (!pesteMorman.ok) {
    assert.equal(pesteMorman.reason, Reason.CELULA_OCUPATA)
    assert.equal(pesteMorman.params.item, id)
  }

  // Peste un pion.
  const px = cellOf(w.agents.x[0]!)
  const py = cellOf(w.agents.y[0]!)
  const pestePion = applyCommand(w, { kind: 'desemneaza', wx: px, wy: py, z: w.agents.z[0]!, piesa: Piesa.PERETE }, R)
  assert.equal(pestePion.ok, false)
  if (!pestePion.ok) assert.equal(pestePion.reason, Reason.CELULA_OCUPATA)
})

test('o desemnare de CONSTRUIT poarta piesa, si supravietuieste unui save/load', () => {
  const { w, wx, wy, g } = sitPlat(777, 9)
  const out = applyCommand(w, { kind: 'desemneaza', wx, wy, z: g + 1, piesa: Piesa.SCARA }, R)
  assert.ok(out.ok)
  const slot = slotDesemnare(w.desemnari, out.ok ? out.value : -1)
  assert.equal(w.desemnari.kind[slot], Desemnare.CONSTRUIESTE)
  assert.equal(w.desemnari.piesa[slot], Piesa.SCARA)

  const incarcat = decode(encode(w), R)
  assert.ok(incarcat.ok, `refuzat: ${JSON.stringify(incarcat)}`)
  if (!incarcat.ok) return
  const slot2 = slotDesemnare(incarcat.value.desemnari, out.ok ? out.value : -1)
  assert.equal(incarcat.value.desemnari.piesa[slot2], Piesa.SCARA)
  assert.equal(hashWorld(incarcat.value), hashWorld(w))
})

// ---------------------------------------------------------------------------
// jobul de construit — vocabularul si cârligele (pasul 6a)
// ---------------------------------------------------------------------------

test('pasii de construit au ACELEASI numere ca cei de carat', () => {
  // `pasDeMers` raspunde pe PARITATE, deci numerele nu sunt decorative: daca
  // cineva le desincronizeaza, un pion care zideste ar fi crezut in mers, iar
  // tinta lui ar fi citita din alt camp.
  assert.equal(PasConstruieste.MERGE_SURSA, PasCara.MERGE_SURSA)
  assert.equal(PasConstruieste.RIDICA, PasCara.RIDICA)
  assert.equal(PasConstruieste.MERGE_SANTIER, PasCara.MERGE_DEST)
  assert.equal(PasConstruieste.ZIDESTE, PasCara.LASA)
  assert.equal(PasConstruieste.ZIDESTE % 2, 1, 'ultimul pas trebuie sa fie unul de OPRIRE')
})

test('`anuleazaDesemnare` intrerupe si jobul care tine desemnarea in `jobDest`', () => {
  // Un job de CONSTRUIT tine sursa in `jobTarget` si santierul in `jobDest` —
  // aceeasi orientare ca la carat, pastrata deliberat (altfel `mutaItem` n-ar mai
  // intrerupe constructorul cand mormanul-sursa se muta).
  //
  // Cu filtrul doar pe `jobTarget`, constructorul ramanea cu un job viu spre un id
  // MORT si o rezervare orfana; `reconstruiesteRezervari` il arunca la incarcare
  // in timp ce lumea continua il tine — adica M5 rosu din prima zidire.
  //
  // Tuplul se pune DIRECT pe agent: driverul vine in 6b, iar garda trebuie probata
  // inainte sa existe ce apara. Aceeasi metoda ca la poarta pe fel.
  const { w, sit } = laSit(12345, 1, [0])
  const tinta = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3, 8)
  const { id } = desemneaza(w, tinta.wx, tinta.wy)
  const ds = slotDesemnare(w.desemnari, id)
  assert.notEqual(ds, -1)

  const a = w.agents
  a.jobKind[0] = FelJob.CARA
  a.jobTarget[0] = 999999
  a.jobDest[0] = id

  anuleazaDesemnare(w, R, ds)
  assert.equal(a.jobKind[0], 0, `jobul care tinea desemnarea in jobDest a ramas viu (jobKind ${a.jobKind[0]})`)
})

test('marfa nu se lasa PE un santier', () => {
  // Constructorul sta LANGA celula pe care o zideste, deci celula aia e in ordinea
  // de cautare a lui `lasaLaPicioare`. Daca marfa ateriza acolo, propria lui
  // zidire ar fi refuzata cu CELULA_OCUPATA — de propriul lui material.
  const { w, wx, wy, g } = sitPlat(12345, 9)
  const santier = applyCommand(w, { kind: 'desemneaza', wx, wy, z: g + 1, piesa: Piesa.PERETE }, R)
  assert.ok(santier.ok, `fixtura: ${JSON.stringify(santier)}`)

  // Se incearca depunerea EXACT pe santier.
  const pus = asazaItem(w, R, 0, 10, wx, wy, g + 1)
  assert.equal(itemLaCelula(w.iteme, wx, wy, g + 1), -1, 'nimic n-are voie sa stea pe santier')
  assert.equal(pus.pus, 10, `marfa trebuia sa ajunga alaturi, nu sa se piarda: ${JSON.stringify(pus)}`)

  // Si chiar se poate zidi acolo dupa aceea.
  const zidit = applyCommand(w, { kind: 'fill', wx, wy, z: g + 1, material: Material.PIATRA_CONSTRUITA }, R)
  assert.ok(zidit.ok, `zidirea a fost blocata de propriul material: ${JSON.stringify(zidit)}`)
})

// ---------------------------------------------------------------------------
// jobul de construit, cap-coada (pasul 6b)
// ---------------------------------------------------------------------------

/** Un santier, un morman langa el, si un pion. Jobul se porneste explicit — scanerul vine in 6c. */
function santier(seed: number, fel: number = Item.PIATRA, cantitate = -1): {
  w: World; sx: number; sy: number; sz: number; idSantier: number; ds: number; is: number
} {
  const { w, wx, wy, g } = sitPlat(seed, 11)
  const sx = wx + 5
  const sy = wy + 5
  const sz = g + 1
  const sant = applyCommand(w, { kind: 'desemneaza', wx: sx, wy: sy, z: sz, piesa: Piesa.PERETE }, R)
  assert.ok(sant.ok, `fixtura: santierul: ${JSON.stringify(sant)}`)
  const idSantier = sant.ok ? sant.value : -1

  const cant = cantitate === -1 ? R.piese[Piesa.PERETE]!.cantitate : cantitate
  const idItem = lasaItem(w, fel, cant, wx + 1, wy + 5)
  const sp = applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 5) * 1000 + 500, z: g + 1, faction: 0 }, R)
  assert.ok(sp.ok, `fixtura: pionul: ${JSON.stringify(sp)}`)

  const ds = slotDesemnare(w.desemnari, idSantier)
  const is = slotItem(w.iteme, idItem)
  assert.notEqual(is, -1, 'fixtura: mormanul')
  return { w, sx, sy, sz, idSantier, ds, is }
}

test('ACCEPTANTA: pionul cara materialul si RIDICA peretele', () => {
  const { w, sx, sy, sz, idSantier, ds, is } = santier(12345)
  const spec = R.piese[Piesa.PERETE]!
  const rata = unitatiDeMunca(w, R, 0)
  assert.ok(pornesteConstruieste(w, R, 0, ds, is).ok)

  // Tickurile petrecute pe pasul ZIDESTE se NUMARA. Fara ele, „peretele a aparut"
  // ramane verde si cand munca e gratis: `lucru: 400` din rules.json ar fi o cifra
  // decorativa, iar jucatorul ar vedea zidurile aparand instantaneu.
  let ziditTickuri = 0
  let n = -1
  for (let i = 0; i < 4000; i++) {
    if (w.agents.jobKind[0] === 0) { n = i; break }
    if (w.agents.jobStep[0] === PasConstruieste.ZIDESTE) ziditTickuri++
    ruleaza(w, 1)
  }
  assert.notEqual(n, -1, 'jobul de construit trebuia sa se termine')
  assert.ok(
    ziditTickuri >= Math.ceil(spec.lucru / rata),
    `zidirea a costat ${ziditTickuri} tickuri, dar ${spec.lucru} unitati la ${rata}/tick cer cel putin ${Math.ceil(spec.lucru / rata)}`,
  )

  const m = materialAt(w.terrain, sx, sy, sz)
  assert.ok(m.ok && m.value === spec.material, `peretele: ${m.ok ? m.value : 'refuz'}, asteptat ${spec.material}`)
  assert.equal(slotDesemnare(w.desemnari, idSantier), -1, 'santierul dispare cand piesa e pusa')
  assert.equal(w.ratiune.unitatiZidite, spec.cantitate, 'materialul se CONSUMA, si se numara')
  assert.equal(w.ratiune.itemePierdute, 0, 'si nimic nu se pierde pe drum')
  assert.equal(w.agents.caraCantitate[0], 0, 'pionul nu ramane cu marfa in mana')

  // CONSERVAREA, nu un inlocuitor al ei. `caraCantitate === 0` arata la fel si
  // cand materialul se CONSUMA, si cand nu se consuma deloc: `terminaJob` lasa
  // orice mana plina jos, deci cele 20 de unitati ar ateriza langa perete si
  // contorul din mana ar fi tot zero. Materia s-ar tipari, si nimic nu s-ar
  // inrosi — masurat, exact asta a scapat de prima varianta a testului.
  assert.equal(marfaTotala(w) + w.ratiune.unitatiZidite, spec.cantitate, 'materia s-a tiparit sau s-a evaporat')
  assert.equal(w.iteme.vii, 0, `au ramas ${w.iteme.vii} mormane pe jos dupa ce peretele s-a ridicat`)
  assert.equal(w.rezervari.total, 0, 'si nicio rezervare nu ramane pe id-uri moarte')

  // Pionul NU e ingropat in propriul perete...
  const px = cellOf(w.agents.x[0]!)
  const py = cellOf(w.agents.y[0]!)
  const pe = materialAt(w.terrain, px, py, w.agents.z[0]!)
  assert.ok(pe.ok && !isSolid(pe.value), 'pionul a ramas in piatra')
  // ...si a zidit de LANGA santier, nu de la distanta. Fara verificarea de pozitie
  // din `zideste`, progresul s-ar aduna in timpul mersului si peretele ar aparea
  // in clipa in care pionul mai e la patru celule distanta.
  assert.equal(Math.max(Math.abs(px - sx), Math.abs(py - sy)), 1, `pionul a zidit de la (${px},${py}), santierul e la (${sx},${sy})`)
})

test('un morman de alt fel, sau sub PRAGUL de ridicare, se refuza la PORNIRE; unul de la prag in sus porneste cu count-ul lui', () => {
  // `ridica` ia `min(cerut, gasit)`: fara garda, un morman de praf ar trimite pionul
  // dupa 20 de ridicari. De la prag in sus, restul piesei vine din a doua sursa.
  const a = santier(12345, Item.LEMN)
  const r1 = pornesteConstruieste(a.w, R, 0, a.ds, a.is)
  assert.equal(r1.ok, false, 'lemnul nu e piatra')
  assert.equal(r1.ok ? '' : r1.reason, Reason.LIPSA_MATERIAL)

  const prag = pragRidicare(R, R.piese[Piesa.PERETE]!)
  assert.ok(prag < R.piese[Piesa.PERETE]!.cantitate, 'fixtura: pragul trebuie sa fie sub cantitatea piesei')
  const b = santier(12345, Item.PIATRA, prag - 1)
  const r2 = pornesteConstruieste(b.w, R, 0, b.ds, b.is)
  assert.equal(r2.ok, false, 'un morman sub prag nu merita drumul')
  assert.equal(r2.ok ? '' : r2.reason, Reason.LIPSA_MATERIAL)
  assert.equal(b.w.rezervari.total, 0, 'si un refuz nu lasa rezervari in urma')

  // Controlul: exact pragul porneste, cu count-ul pe SURSA, nu totalul piesei.
  const c = santier(12345, Item.PIATRA, prag)
  assert.ok(pornesteConstruieste(c.w, R, 0, c.ds, c.is).ok, 'un morman de exact prag trebuie sa porneasca')
  assert.equal(c.w.agents.jobCantitate[0], prag)
  assert.equal(c.w.rezervari.total, 2)
})

test('pionul mutat de pe locul de lucru nu zideste de la distanta', () => {
  // Pasul ZIDESTE e un pas de OPRIRE, deci pionul ajunge acolo prin masinaria de
  // mers si e pe pozitie din prima. Verificarea de pozitie din `zideste` apara
  // altceva: clipa in care pionul NU mai e unde era — i s-a sapat podeaua de sub
  // picioare, a cazut cu o prabusire, a fost impins. Fara ea, progresul curge mai
  // departe si peretele se ridica de la patru celule distanta.
  //
  // Se scrie direct pe agent fiindca exact asta face si lumea: `prabuseste` muta
  // pioni fara sa treaca prin vreun job.
  //
  // Prima varianta a testului punea asertiunea de distanta sub un
  // `if (peretele s-a ridicat)`. Peretele NU se ridica — `refaLoculDeLucru` cauta
  // desemnarea in `jobTarget`, care la construit e MORMANUL — deci ramura nu rula
  // niciodata si testul trecea in gol. O asertiune sub un `if` e o asertiune care
  // poate sa nu se intample; aici chiar nu se intampla, si nicio mutatie n-o
  // putea arata, fiindca mutatiile probeaza ce ating fixturile.
  const { w, sx, sy, sz, ds, is } = santier(12345)
  assert.ok(pornesteConstruieste(w, R, 0, ds, is).ok)
  const la = panaCand(w, 2000, (ww) => ww.agents.jobStep[0] === PasConstruieste.ZIDESTE && ww.agents.jobProgres[0]! > 0)
  assert.ok(la >= 0, 'fixtura: pionul n-a ajuns sa zideasca')

  w.agents.x[0] = (sx - 2) * 1000 + 500
  w.agents.y[0] = sy * 1000 + 500
  const n = panaCand(w, 3000, (ww) => ww.agents.jobKind[0] === 0)
  assert.ok(n >= 0, 'jobul trebuia sa se incheie intr-un fel')

  // Pionul trebuie sa se REFACA, nu sa abandoneze: alt loc de lucru langa ACELASI
  // santier, si peretele se ridica.
  const m = materialAt(w.terrain, sx, sy, sz)
  assert.ok(m.ok && isSolid(m.value), `pionul mutat de pe loc a abandonat santierul in loc sa-si refaca locul de lucru (material ${m.ok ? m.value : 'refuz'})`)
  assert.equal(w.ratiune.unitatiZidite, R.piese[Piesa.PERETE]!.cantitate)

  const px = cellOf(w.agents.x[0]!)
  const py = cellOf(w.agents.y[0]!)
  assert.equal(
    Math.max(Math.abs(px - sx), Math.abs(py - sy)), 1,
    `peretele s-a ridicat cu pionul la (${px},${py}), iar santierul e la (${sx},${sy})`,
  )
})

test('constructorul cu locul de lucru ocupat de un ostil isi alege altul', () => {
  // A doua cale de recuperare, si singura care trece prin `DRIVER_CONSTRUIESTE.refaTinta`:
  // drumul e REFUZAT (nu pionul e mutat), iar dispecerul cere driverului alta tinta.
  // Pana la reparatie, si calea asta cauta santierul in `jobTarget`, adica in morman.
  const { w, sx, sy, sz, ds, is } = santier(12345)
  assert.ok(pornesteConstruieste(w, R, 0, ds, is).ok)
  const la = panaCand(w, 2000, (ww) => ww.agents.jobStep[0] === PasConstruieste.MERGE_SANTIER)
  assert.ok(la >= 0, 'fixtura: pionul n-a pornit spre santier')
  const lx = w.agents.jobWorkX[0]!
  const ly = w.agents.jobWorkY[0]!
  const lz = w.agents.jobWorkZ[0]!

  const ostil = applyCommand(w, { kind: 'spawnAgent', x: lx * 1000 + 500, y: ly * 1000 + 500, z: lz, faction: Faction.SALBATIC }, R)
  assert.ok(ostil.ok, `fixtura: ostilul: ${JSON.stringify(ostil)}`)

  let n = -1
  for (let i = 0; i < 4000; i++) {
    // Ostilul nu pleaca. Fara pinuire, el se plimba, drumul se elibereaza singur,
    // si testul ar trece si pe codul nereparat — refuzul trebuie sa fie REPETAT,
    // ca `refaTinta` sa fie chemat, nu doar atins o data.
    w.agents.x[1] = lx * 1000 + 500
    w.agents.y[1] = ly * 1000 + 500
    w.agents.z[1] = lz
    if (w.agents.jobKind[0] === 0) { n = i; break }
    ruleaza(w, 1)
  }
  assert.notEqual(n, -1, 'jobul trebuia sa se incheie')

  const m2 = materialAt(w.terrain, sx, sy, sz)
  assert.ok(m2.ok && isSolid(m2.value), 'constructorul a abandonat santierul in loc sa-si aleaga alt loc de lucru')
  const fx = cellOf(w.agents.x[0]!)
  const fy = cellOf(w.agents.y[0]!)
  assert.ok(fx !== lx || fy !== ly, 'a zidit de pe celula pe care statea ostilul')
  assert.equal(Math.max(Math.abs(fx - sx), Math.abs(fy - sy)), 1, `a zidit de la (${fx},${fy}), santierul e la (${sx},${sy})`)
})

test('santierul de necontactat se refuza PE LOC, nu dupa o plimbare inutila', () => {
  // Pionul si mormanul sunt sigilati intr-o camera de o celula; santierul e afara.
  // Zidul are DOUA niveluri fiindca `maxStepM = 1`: cu unul singur pionul ar urca
  // pe el.
  //
  // Ce probeaza: la trecerea spre santier, locul de lucru se cauta in COMPONENTA
  // pionului. Fara filtru, `celulaDeLucru` intoarce prima celula calcabila din
  // ordinea fixa — una de afara — si pionul pleaca spre ea, arzand refuzuri de
  // drum. Cu filtru, nu exista niciuna si jobul se incheie pe loc.
  const { w, wx, wy, g } = sitPlat(12345, 11)
  const px = wx + 1
  const py = wy + 5
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    for (const dz of [1, 2]) {
      const out = applyCommand(w, { kind: 'fill', wx: px + dx, wy: py + dy, z: g + dz, material: Material.PIATRA_CONSTRUITA }, R)
      assert.ok(out.ok, `fixtura: zidul la (${px + dx},${py + dy},${g + dz}): ${JSON.stringify(out)}`)
    }
  }

  const idItem = lasaItem(w, Item.PIATRA, R.piese[Piesa.PERETE]!.cantitate, px, py)
  const sp = applyCommand(w, { kind: 'spawnAgent', x: px * 1000 + 500, y: py * 1000 + 500, z: g + 1, faction: 0 }, R)
  assert.ok(sp.ok, `fixtura: pionul: ${JSON.stringify(sp)}`)

  const sx = wx + 6
  const sy = wy + 5
  const sant = applyCommand(w, { kind: 'desemneaza', wx: sx, wy: sy, z: g + 1, piesa: Piesa.PERETE }, R)
  assert.ok(sant.ok, `fixtura: santierul: ${JSON.stringify(sant)}`)

  ruleaza(w, 5) // regiunile se aseaza dupa ziduri
  const ds2 = slotDesemnare(w.desemnari, sant.ok ? sant.value : -1)
  const is2 = slotItem(w.iteme, idItem)
  assert.ok(pornesteConstruieste(w, R, 0, ds2, is2).ok)

  // Fixtura trebuie sa fie VIE: pionul chiar ridica materialul, altfel testul ar
  // trece si daca jobul murea inainte sa ajunga la trecerea pe care o probam.
  let refuzuri = 0
  let n = -1
  for (let i = 0; i < 2000; i++) {
    if (w.agents.jobKind[0] === 0) { n = i; break }
    refuzuri += ruleaza(w, 1).refuzuriDrum
  }
  assert.notEqual(n, -1, 'jobul trebuia sa se incheie')
  // Fixtura VIE: mormanul original trebuie sa fi fost consumat, altfel jobul a murit
  // inainte de trecerea pe care o probam. Nu se poate observa pe `caraCantitate`:
  // ridicarea si incheierea se intampla in ACELASI tick, deci intre tickuri e mereu 0.
  assert.equal(slotItem(w.iteme, idItem), -1, 'fixtura moarta: pionul n-a apucat sa ridice mormanul')
  assert.equal(refuzuri, 0, `pionul a plecat spre un santier de necontactat si a ars ${refuzuri} refuzuri de drum`)
})

test('materialul disparut din mana nu se zideste din nimic', () => {
  // Garda e defensiva: intre RIDICA si ZIDESTE nimeni n-are cum sa ia marfa din
  // mana unui pion. Dar „n-are cum" e o presupunere despre restul sistemului, si
  // exact asta o face de probat — altfel ramane cod neverificat care intr-o zi
  // devine singurul lucru dintre jucator si un perete zidit din aer.
  const { w, sx, sy, sz, ds, is } = santier(12345)
  assert.ok(pornesteConstruieste(w, R, 0, ds, is).ok)
  assert.ok(panaCand(w, 2000, (ww) => ww.agents.caraCantitate[0]! > 0) >= 0)

  w.agents.caraCantitate[0] = R.piese[Piesa.PERETE]!.cantitate - 1
  const n = panaCand(w, 2000, (ww) => ww.agents.jobKind[0] === 0)
  assert.ok(n >= 0, 'jobul trebuia sa se incheie')
  const m = materialAt(w.terrain, sx, sy, sz)
  assert.ok(m.ok && !isSolid(m.value), 'peretele s-a ridicat din 19 unitati in loc de 20')
  assert.equal(w.ratiune.unitatiZidite, 0, 'si s-a si NUMARAT o zidire care n-a avut loc')
})

test('M5 peste o zidire in curs: save luat cu materialul in mana', () => {
  // Pasul periculos e cel de dupa RIDICA: sursa e moarta, materialul e in mana, si
  // tuplul de rezervare trebuie sa fie de ajuns ca `reconstruiesteRezervari` sa
  // refaca EXACT aceleasi rezervari. Un fel de job necunoscut celor cinci puncte
  // de dispecerizare ar fi anulat la incarcare in timp ce lumea continua il tine.
  const { w, ds, is } = santier(4242)
  assert.ok(pornesteConstruieste(w, R, 0, ds, is).ok)
  const pana = panaCand(w, 2000, (ww) => ww.agents.caraCantitate[0]! > 0)
  assert.ok(pana >= 0, 'fixtura: pionul n-a apucat sa ridice materialul')

  const incarcat = decode(encode(w), R)
  assert.ok(incarcat.ok, `refuzat: ${JSON.stringify(incarcat)}`)
  if (!incarcat.ok) return
  assert.equal(hashWorld(incarcat.value), hashWorld(w), 'lumea incarcata difera imediat dupa save')

  ruleaza(w, 800)
  ruleaza(incarcat.value, 800)
  assert.equal(hashWorld(incarcat.value), hashWorld(w), 'lumea incarcata a divergat de cea continua')
  assert.equal(w.ratiune.unitatiZidite, R.piese[Piesa.PERETE]!.cantitate, 'fixtura: zidirea trebuia sa se termine in 800 de tickuri')
})

test('santierul anulat in timpul zidirii nu lasa job orfan', () => {
  // Cazul pe care panoul l-a masurat ca M5 rosu la pasul 6a, cu tuplul pus cu mana.
  // Acum e un job REAL: sursa in `jobTarget`, santierul in `jobDest`.
  const { w, ds, is } = santier(777)
  assert.ok(pornesteConstruieste(w, R, 0, ds, is).ok)
  const pana = panaCand(w, 2000, (ww) => ww.agents.caraCantitate[0]! > 0)
  assert.ok(pana >= 0, 'fixtura: pionul n-a apucat sa ridice materialul')

  anuleazaDesemnare(w, R, ds)
  assert.equal(w.agents.jobKind[0], 0, 'jobul trebuie intrerupt, nu lasat sa arate spre un id mort')
  assert.equal(w.rezervari.total, 0, 'si rezervarile eliberate')

  // Marfa din mana ajunge pe jos, nu dispare.
  ruleaza(w, 50)
  assert.equal(w.ratiune.itemePierdute, 0, 'materialul carat s-a evaporat la anulare')
})

// ---------------------------------------------------------------------------
// scanerul alege singur santiere (pasul 6c)
// ---------------------------------------------------------------------------

/**
 * Un sir de N pereti, material cat trebuie in mormane separate, si `cati` pioni.
 * NIMENI nu porneste vreun job cu mana — asta e tot rostul.
 */
function santier6c(seed: number, pereti: number, cati: number, cuMaterial = true): {
  w: World; wx: number; wy: number; g: number; ids: number[]
} {
  const { w, wx, wy, g } = sitPlat(seed, 13)
  const ids: number[] = []
  for (let i = 0; i < pereti; i++) {
    const out = applyCommand(w, { kind: 'desemneaza', wx: wx + 3 + i, wy: wy + 6, z: g + 1, piesa: Piesa.PERETE }, R)
    assert.ok(out.ok, `fixtura: santierul ${i}: ${JSON.stringify(out)}`)
    if (out.ok) ids.push(out.value)
  }
  if (cuMaterial) {
    for (let i = 0; i < pereti; i++) lasaItem(w, Item.PIATRA, R.piese[Piesa.PERETE]!.cantitate, wx + 1, wy + 1 + i)
  }
  for (let i = 0; i < cati; i++) {
    const sp = applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 10 + i) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R)
    assert.ok(sp.ok, `fixtura: pionul ${i}: ${JSON.stringify(sp)}`)
  }
  // Fixtura VIE, verificata inainte sa se ruleze ceva: exista chiar desemnari de
  // CONSTRUIT. Scenariul standard n-are niciuna, si de-aia scanerul a putut fi
  // montat integral cu 376 din 376 de teste verzi.
  let viiConstr = 0
  for (let i = 0; i < w.desemnari.count; i++) {
    if (w.desemnari.alive[i] === 1 && w.desemnari.kind[i] === Desemnare.CONSTRUIESTE) viiConstr++
  }
  assert.equal(viiConstr, pereti, 'fixtura moarta: n-are desemnari de construit')
  return { w, wx, wy, g, ids }
}

test('ACCEPTANTA 6c: scanerul alege singur santiere, si sirul de pereti se ridica', () => {
  const PERETI = 5
  const { w, wx, wy, g, ids } = santier6c(12345, PERETI, 3)
  const spec = R.piese[Piesa.PERETE]!

  const n = panaCand(w, 6000, (ww) => ww.ratiune.unitatiZidite >= PERETI * spec.cantitate)
  assert.ok(n >= 0, `s-au zidit ${w.ratiune.unitatiZidite} din ${PERETI * spec.cantitate} de unitati in 6000 de tickuri`)

  for (let i = 0; i < PERETI; i++) {
    const m = materialAt(w.terrain, wx + 3 + i, wy + 6, g + 1)
    assert.ok(m.ok && m.value === spec.material, `peretele ${i}: ${m.ok ? m.value : 'refuz'}`)
  }
  for (const id of ids) assert.equal(slotDesemnare(w.desemnari, id), -1, 'un santier a ramas dupa ce piesa lui a fost pusa')

  // Conservarea peste TOT arcul, nu doar peste un job.
  assert.equal(marfaTotala(w) + w.ratiune.unitatiZidite, PERETI * spec.cantitate, 'materia s-a tiparit sau s-a evaporat')
  assert.equal(w.ratiune.itemePierdute, 0, 's-a pierdut material pe drum')
  assert.equal(w.rezervari.total, 0, 'au ramas rezervari pe id-uri moarte')
})

test('fara material, categoria se refuza O DATA pe fel, cu LIPSA_MATERIAL', () => {
  // Poarta de material sta in trecerea IEFTINA si raspunde pe FEL, nu pe santier:
  // 400 de santiere fara piatra trebuie sa coste un scalar, nu 400 de cautari.
  // Acopera si gaura de continut a SCARII, care cere LEMN intr-o lume in care
  // worldgen scrie doar apa, iarba, pamant si roca.
  const { w, wx, wy, g, ids } = santier6c(12345, 3, 2, false)
  const t = ruleaza(w, 400)

  // Observabilul e COSTUL, nu rezultatul: si fara scurtcircuit nu s-ar zidi nimic,
  // fiindca trecerea scumpa refuza oricum. Poarta exista ca 400 de santiere fara
  // piatra sa coste un scalar, nu 400 de evaluari scumpe care mananca plafonul.
  assert.equal(t.candidatiExaminati, 0, `s-au evaluat scump ${t.candidatiExaminati} candidati desi nu exista material`)

  const m = materialAt(w.terrain, wx + 3, wy + 6, g + 1)
  assert.ok(m.ok && !isSolid(m.value), 's-a zidit ceva fara material')
  assert.equal(w.ratiune.unitatiZidite, 0)
  for (const id of ids) assert.notEqual(slotDesemnare(w.desemnari, id), -1, 'un santier a disparut fara sa fie zidit')

  // Si cauza ajunge la jucator, nu se pierde.
  let cuLipsa = 0
  for (let i = 0; i < w.agents.count; i++) {
    if (w.agents.alive[i] === 1 && w.ratiune.motivFinal[i] === codMotiv(Reason.LIPSA_MATERIAL)) cuLipsa++
  }
  assert.ok(cuLipsa > 0, 'niciun pion nu raporteaza LIPSA_MATERIAL — cauza se pierde')
})

test('un pion cu CONSTRUIESTE pe 0 nu ia niciodata un santier', () => {
  // Poarta pe categorie, in oglinda testului „exclusiv pe construit nu mai sapa".
  const { w, wx, wy, g } = santier6c(12345, 3, 1)
  for (let i = 0; i < w.agents.count; i++) {
    if (w.agents.alive[i] !== 1) continue
    assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[i]!, categorie: Categorie.CONSTRUIESTE, nivel: 0 }, R).ok)
  }
  ruleaza(w, 1500)
  const m = materialAt(w.terrain, wx + 3, wy + 6, g + 1)
  assert.ok(m.ok && !isSolid(m.value), 'a zidit desi are CONSTRUIESTE pe 0')
  assert.equal(w.ratiune.unitatiZidite, 0)

  // Controlul negativ: cu prioritatea inapoi pe implicit, ACEEASI lume chiar zideste.
  for (let i = 0; i < w.agents.count; i++) {
    if (w.agents.alive[i] !== 1) continue
    assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: w.agents.id[i]!, categorie: Categorie.CONSTRUIESTE, nivel: R.personalPriorityDefault }, R).ok)
  }
  const n = panaCand(w, 4000, (ww) => ww.ratiune.unitatiZidite > 0)
  assert.ok(n >= 0, 'fixtura moarta: nici cu prioritatea repusa nu zideste nimeni')
})

test('un blueprint in AER nu trimite pe nimeni dupa material', () => {
  // Poarta de sprijin taie DRUMUL, nu doar zidirea. Fara ea, pionul cara 20 de
  // unitati, munceste 400 de tickuri si abia atunci `zidesteVoxel` refuza cu
  // FARA_SPRIJIN. Observabilul e deci munca CHELTUITA, nu peretele lipsa:
  // peretele lipseste in ambele cazuri.
  //
  // Cota e g+2, si conteaza: MASURAT, de la g+3 in sus `celulaDeLucru` nu mai
  // gaseste niciun vecin calcabil, deci poarta de sprijin devine redundanta —
  // accesibilitatea refuza prima si mutatia pe sprijin iese RATATA. La g+2
  // santierul e NEZIDIBIL (suport 0) dar ACCESIBIL (loc de lucru la g+1), adica
  // exact si numai cazul pe care poarta il apara.
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const sant = applyCommand(w, { kind: 'desemneaza', wx: wx + 5, wy: wy + 6, z: g + 2, piesa: Piesa.PERETE }, R)
  assert.ok(sant.ok, `fixtura: santierul in aer: ${JSON.stringify(sant)}`)
  // Fixtura VIE: nezidibil, DAR accesibil. Amandoua, altfel nu proba poarta.
  assert.equal(suportDacaZidesc(w.terrain, R, wx + 5, wy + 6, g + 2), 0, 'fixtura: santierul are sprijin, deci nu proba nimic')
  assert.notEqual(
    celulaDeLucru(w.terrain, w.regions, w.desemnari, wx + 5, wy + 6, g + 2, R), null,
    'fixtura moarta: santierul n-are loc de lucru, deci accesibilitatea refuza inaintea sprijinului',
  )
  lasaItem(w, Item.PIATRA, R.piese[Piesa.PERETE]!.cantitate, wx + 1, wy + 1)
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 2) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)

  ruleaza(w, 1200)
  assert.equal(w.ratiune.unitatiZidite, 0, 's-a zidit in aer')
  assert.equal(w.ratiune.tickuriDeLucru, 0, `s-au cheltuit ${w.ratiune.tickuriDeLucru} tickuri de munca pe un santier care nu se poate zidi`)
  assert.equal(w.agents.caraCantitate[0], 0, 'pionul a plecat cu material dupa un santier imposibil')
})

test('un santier peste care a cazut MOLOZ nu mai e candidat', () => {
  // `poateSustine` SINGUR nu ajunge: pe o celula deja solida raspunde `ok` prin
  // scurtcircuit, iar `zidesteVoxel` refuza cu CELULA_PLINA. Poarta e conjunctia.
  // Cazul e real — prabusirea depune moloz, si molozul poate ateriza peste un
  // blueprint desenat.
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const sant = applyCommand(w, { kind: 'desemneaza', wx: wx + 5, wy: wy + 6, z: g + 1, piesa: Piesa.PERETE }, R)
  assert.ok(sant.ok, `fixtura: ${JSON.stringify(sant)}`)
  assert.ok(applyCommand(w, { kind: 'fill', wx: wx + 5, wy: wy + 6, z: g + 1, material: Material.MOLOZ }, R).ok, 'fixtura: molozul')
  // Fixtura VIE: exact asimetria pe care o probam.
  assert.ok(poateSustine(w.terrain, R, wx + 5, wy + 6, g + 1).ok, 'fixtura: `poateSustine` ar trebui sa spuna DA pe o celula plina')

  lasaItem(w, Item.PIATRA, R.piese[Piesa.PERETE]!.cantitate, wx + 1, wy + 1)
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 2) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)

  ruleaza(w, 1200)
  assert.equal(w.ratiune.tickuriDeLucru, 0, `s-au cheltuit ${w.ratiune.tickuriDeLucru} tickuri pe un santier deja plin`)
  const m = materialAt(w.terrain, wx + 5, wy + 6, g + 1)
  assert.ok(m.ok && m.value === Material.MOLOZ, 'molozul a fost inlocuit')
})

/** Sigileaza celula (px, py) cu zid de DOUA niveluri pe toate cele opt vecinatati. */
function sigileaza(w: World, px: number, py: number, g: number): void {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    for (const dz of [1, 2]) {
      const out = applyCommand(w, { kind: 'fill', wx: px + dx, wy: py + dy, z: g + dz, material: Material.PIATRA_CONSTRUITA }, R)
      assert.ok(out.ok, `fixtura: zidul la (${px + dx},${py + dy},${g + dz}): ${JSON.stringify(out)}`)
    }
  }
}

/**
 * Un pion liber cu material si santier, plus unul SIGILAT care vede mormanul dar
 * nu ajunge la el. `prioIzolat` e prioritatea personala pe CONSTRUIESTE a celui
 * sigilat — controlul negativ o pune pe 0.
 */
function coloniaCuUnIzolat(seed: number, prioIzolat: number): { w: World; sx: number; sy: number; sz: number } {
  const { w, wx, wy, g } = sitPlat(seed, 13)
  const sx = wx + 6
  const sy = wy + 6
  const sz = g + 1
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: sx, wy: sy, z: sz, piesa: Piesa.PERETE }, R).ok)
  lasaItem(w, Item.PIATRA, R.piese[Piesa.PERETE]!.cantitate, wx + 4, wy + 6)

  // Pionul LIBER se naste PRIMUL, deci are id mai mic.
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 5) * 1000 + 500, y: (wy + 6) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)

  // Cel SIGILAT se naste ULTIMUL, si ordinea conteaza: `stepAgents` scaneaza la
  // `(tick + id) % jobRescanTicks === 0`, iar ciclul de re-inghetare lasa o fereastra
  // calda de 20 de tickuri pe care un id MAI MARE o castiga de fiecare data. Cu
  // izolatul nascut primul, testul da fals-verde chiar pe codul stricat.
  const px = wx + 1
  const py = wy + 1
  sigileaza(w, px, py, g)
  const sp = applyCommand(w, { kind: 'spawnAgent', x: px * 1000 + 500, y: py * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R)
  assert.ok(sp.ok, `fixtura: pionul sigilat: ${JSON.stringify(sp)}`)
  const idIzolat = sp.ok ? sp.value : -1
  assert.ok(applyCommand(w, { kind: 'setPrioritatePersonala', id: idIzolat, categorie: Categorie.CONSTRUIESTE, nivel: prioIzolat }, R).ok)

  ruleaza(w, 5)
  return { w, sx, sy, sz }
}

test('un pion IZOLAT nu are voie sa inghete materialul intregii colonii', () => {
  // Racirea pentru „mormanul nu e in componenta MEA" e o proprietate a PERECHII.
  // Scrisa pe morman, ea ascunde mormanul de toti — si fiindca `rezumatMaterial`
  // retine UN SINGUR morman per piesa si sare peste cele in racire, sterge tot
  // felul. Iar racirea (100) fiind mai lunga decat rescanarea (30), pionul blocat
  // o reinnoieste inainte sa expire: blocajul e PERMANENT, si pe un camp hasuit.
  const { w, sx, sy, sz } = coloniaCuUnIzolat(12345, R.personalPriorityDefault)
  const spec = R.piese[Piesa.PERETE]!

  const n = panaCand(w, 1500, (ww) => ww.ratiune.unitatiZidite >= spec.cantitate)
  assert.ok(n >= 0, `un pion sigilat a oprit constructia: ${w.ratiune.unitatiZidite} din ${spec.cantitate} de unitati in 1500 de tickuri`)
  const m = materialAt(w.terrain, sx, sy, sz)
  assert.ok(m.ok && m.value === spec.material, 'peretele nu s-a ridicat')
})

test('CONTROLUL NEGATIV: acelasi pion sigilat, dar fara categoria CONSTRUIESTE', () => {
  // Aceiasi pereti, aceleasi id-uri, acelasi seed — doar categoria stinsa. Daca si
  // asta ar pica, vinovata ar fi geometria fixturii, nu scanarea. Izoleaza cauza.
  const { w, sx, sy, sz } = coloniaCuUnIzolat(12345, 0)
  const spec = R.piese[Piesa.PERETE]!
  const n = panaCand(w, 1500, (ww) => ww.ratiune.unitatiZidite >= spec.cantitate)
  assert.ok(n >= 0, `fixtura e stricata, nu codul: nici cu categoria stinsa nu se zideste (${w.ratiune.unitatiZidite})`)
  const m = materialAt(w.terrain, sx, sy, sz)
  assert.ok(m.ok && m.value === spec.material)
})

/**
 * UN morman, DOUA santiere ale aceleiasi piese: unul langa morman, unul departe.
 * `intaiDeparte` spune care se DESENEAZA primul — adica cine ia id-ul mai mic.
 *
 * Materialul ajunge pentru UN singur perete, deliberat: atunci „care s-a ridicat"
 * e o proprietate permanenta a lumii finale, nu una tranzitorie pe care testul ar
 * trebui s-o prinda la tickul potrivit.
 */
function douaSantiere(seed: number, intaiDeparte: boolean, doarDeparte = false, sapaturaLa?: { dx: number; dy: number }): {
  w: World; aproape: { wx: number; wy: number }; departe: { wx: number; wy: number }; g: number
} {
  const { w, wx, wy, g } = sitPlat(seed, 13)
  const aproape = { wx: wx + 7, wy: wy + 6 }
  const departe = { wx: wx + 1, wy: wy + 6 }
  const ordine = doarDeparte ? [departe] : intaiDeparte ? [departe, aproape] : [aproape, departe]
  for (let k = 0; k < ordine.length; k++) {
    const c = ordine[k]!
    const out = applyCommand(w, { kind: 'desemneaza', wx: c.wx, wy: c.wy, z: g + 1, piesa: Piesa.PERETE }, R)
    assert.ok(out.ok, `fixtura: santierul la ${c.wx},${c.wy}: ${JSON.stringify(out)}`)
    // Sapatura se deseneaza INTRE cele doua santiere, deci primeste un id intre
    // ale lor. Ea e al treilea candidat, de alt FEL, si de ea atarna tot testul.
    if (sapaturaLa && k === 0) desemneaza(w, wx + sapaturaLa.dx, wy + sapaturaLa.dy)
  }
  lasaItem(w, Item.PIATRA, R.piese[Piesa.PERETE]!.cantitate, wx + 8, wy + 6)
  const sp = applyCommand(w, { kind: 'spawnAgent', x: (wx + 4) * 1000 + 500, y: (wy + 10) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R)
  assert.ok(sp.ok, `fixtura: pionul: ${JSON.stringify(sp)}`)
  return { w, aproape, departe, g }
}

test('intre doua santiere la fel de bune, se alege cel de langa MORMAN', () => {
  // `candDist` la constructie e distanta pana la MORMAN, si mormanul e acelasi
  // pentru toate santierele unei piese. Cu prioritati egale scorul iese identic pe
  // toata categoria, `maiBun` nu e strict, deci castiga primul examinat — adica
  // ordinea in care jucatorul le-a desenat. Nu e o departajare, e o coincidenta.
  const spec = R.piese[Piesa.PERETE]!

  // Jumatatea care DISCRIMINEAZA: cel departe are id-ul mai mic.
  {
    const { w, aproape, departe, g } = douaSantiere(12345, true)
    const n = panaCand(w, 6000, (ww) => ww.ratiune.unitatiZidite >= spec.cantitate)
    assert.ok(n >= 0, `nu s-a zidit nimic in 6000 de tickuri (${w.ratiune.unitatiZidite}/${spec.cantitate})`)
    const ma = materialAt(w.terrain, aproape.wx, aproape.wy, g + 1)
    const md = materialAt(w.terrain, departe.wx, departe.wy, g + 1)
    assert.ok(ma.ok && ma.value === spec.material, 's-a ridicat santierul DEPARTE: ordinea desenarii a decis, nu distanta')
    assert.ok(md.ok && !isSolid(md.value), 's-au ridicat amandoua: fixtura da material pentru unul singur')
  }

  // Oglinda: cu ordinea inversa raspunsul trebuie sa fie ACELASI. Singura ei
  // treaba e sa arate ca asertiunea de sus nu spune „mereu al doilea".
  {
    const { w, aproape, departe, g } = douaSantiere(12345, false)
    const n = panaCand(w, 6000, (ww) => ww.ratiune.unitatiZidite >= spec.cantitate)
    assert.ok(n >= 0, 'oglinda: nu s-a zidit nimic')
    const ma = materialAt(w.terrain, aproape.wx, aproape.wy, g + 1)
    const md = materialAt(w.terrain, departe.wx, departe.wy, g + 1)
    assert.ok(ma.ok && ma.value === spec.material, 'oglinda: s-a ridicat cel DEPARTE')
    assert.ok(md.ok && !isSolid(md.value), 'oglinda: s-au ridicat amandoua')
  }

  // Controlul de VIATA: santierul departe chiar se poate zidi. Fara el, testul de
  // sus ar trece la fel de bine daca „departe" ar fi inaccesibil sau nesustinut —
  // adica ar masura fixtura, nu departajarea.
  {
    const { w, departe, g } = douaSantiere(12345, true, true)
    const n = panaCand(w, 6000, (ww) => ww.ratiune.unitatiZidite >= spec.cantitate)
    assert.ok(n >= 0, 'control: singur pe lume, santierul departe tot nu se zideste')
    const md = materialAt(w.terrain, departe.wx, departe.wy, g + 1)
    assert.ok(md.ok && md.value === spec.material, 'control: santierul departe nu e zidibil, deci testul de sus nu masoara nimic')
  }
})

test('santierul care n-are din ce sa fie zidit poarta CAUZA, nu chihlimbar', () => {
  // Panoul coloreaza dupa `ultimulMotiv`: fara cauza, un santier blocat pe veci
  // arata exact ca unul sanatos care isi asteapta randul. Poarta de material statea
  // in trecerea ieftina si iesea din bucla cu `continue` inainte de orice scriere,
  // deci scria cauza pe PION si pe nimic altceva.
  const { w, ids } = santier6c(12345, 3, 2, false)
  ruleaza(w, 400)
  for (const id of ids) {
    const s = slotDesemnare(w.desemnari, id)
    assert.notEqual(s, -1, 'fixtura: santierul a disparut')
    assert.equal(w.desemnari.ultimulMotiv[s]!, codMotiv(Reason.LIPSA_MATERIAL),
      `santierul ${id} n-are cauza: panoul il picteaza chihlimbar`)
    assert.equal(w.desemnari.ultimulMotivDetaliu[s]!, DetaliuMotiv.NICIUNUL)
  }
})

test('materialul rezervat de ALT pion nu e „lipsa material" pentru santierul meu', () => {
  // Cauza pe desemnare are contract: „proprietate a desemnarii insesi, niciodata a
  // unui anume pion". `m.exista` din rezumat e per-pion — un morman rezervat de
  // altcineva il face fals — deci daca ea ar fi sursa cauzei, panoul ar picta
  // portocaliu exact santierele in plina constructie.
  const spec = R.piese[Piesa.PERETE]!
  const felItem = R.digYield[spec.material]!.fel
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const ids: number[] = []
  for (const c of [{ wx: wx + 3, wy: wy + 6 }, { wx: wx + 5, wy: wy + 6 }]) {
    const out = applyCommand(w, { kind: 'desemneaza', wx: c.wx, wy: c.wy, z: g + 1, piesa: Piesa.PERETE }, R)
    assert.ok(out.ok, `fixtura: santierul: ${JSON.stringify(out)}`)
    if (out.ok) ids.push(out.value)
  }
  // UN morman, cu material pentru doi pereti: rezervarea e pe MORMAN, cu un singur
  // pretendent, deci al doilea pion il vede ocupat desi e plin.
  lasaItem(w, Item.PIATRA, spec.cantitate * 2, wx + 1, wy + 1)
  for (let i = 0; i < 2; i++) {
    const sp = applyCommand(w, { kind: 'spawnAgent', x: (wx + 9) * 1000 + 500, y: (wy + 9 + i) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R)
    assert.ok(sp.ok, `fixtura: pionul ${i}: ${JSON.stringify(sp)}`)
  }

  let atinse = 0
  ruleaza(w, 900, R, (ww) => {
    // Exista in LUME un morman din care s-ar putea zidi?
    let morman = -1
    for (let i = 0; i < ww.iteme.count; i++) {
      if (ww.iteme.alive[i] !== 1) continue
      if (ww.iteme.kind[i] !== felItem || ww.iteme.cantitate[i]! < spec.cantitate) continue
      morman = i
      break
    }
    if (morman === -1) return
    const ocupat = rezervariPentru(ww.rezervari, ww.iteme.id[morman]!, Strat.CARAT).length > 0
    for (let i = 0; i < ww.desemnari.count; i++) {
      if (ww.desemnari.alive[i] !== 1 || ww.desemnari.kind[i] !== Desemnare.CONSTRUIESTE) continue
      if (ocupat && rezervariPentru(ww.rezervari, ww.desemnari.id[i]!, Strat.LUCRU).length === 0) atinse++
      assert.notEqual(ww.desemnari.ultimulMotiv[i]!, codMotiv(Reason.LIPSA_MATERIAL),
        `tickul ${ww.tick}: santierul ${ww.desemnari.id[i]} e „fara material" desi mormanul ${ww.iteme.id[morman]} exista`)
    }
  })

  // Fixtura chiar a trecut prin cazul care doare: morman rezervat de cineva, si un
  // santier liber langa el. Fara contorul asta, testul ar trece si intr-o lume in
  // care nimeni n-a rezervat nimic niciodata.
  assert.ok(atinse > 0, 'fixtura moarta: mormanul n-a fost niciodata rezervat cat timp un santier era liber')
  assert.ok(ids.length === 2)
})

test('mormanul evitat de pioni nu e „lipsa material" pe SANTIER', () => {
  // A doua jumatate a contractului, si cea care nu se vede din rezervari: evitarea
  // e stare PE PION (`a.evitaSloturi`), deci raspunsul „exista material?" difera de
  // la un pion la altul in ACELASI tick. Daca „exista in lume" s-ar afla dupa poarta
  // aia, un pion care tocmai a ocolit mormanul ar scrie „fara material" pe un santier
  // pe care altcineva il zideste — iar cauza ar palpai de la un scan la altul.
  //
  // Evitarea se IMPUNE, nu se asteapta. Prima versiune folosea fixtura pionului
  // sigilat, care chiar produce evitare — dar mormanul e ridicat de pionul liber
  // inainte ca sigilatul sa rescaneze, deci mutatia trecea neprinsa. Cu toti pionii
  // ocolind mormanul, nimeni nu-l ridica: starea pe care testul o descrie chiar tine
  // cat tine testul.
  const spec = R.piese[Piesa.PERETE]!
  const { w, wx, wy, g } = sitPlat(12345, 13)
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: wx + 6, wy: wy + 6, z: g + 1, piesa: Piesa.PERETE }, R).ok)
  const idMorman = lasaItem(w, Item.PIATRA, spec.cantitate, wx + 4, wy + 6)
  for (let i = 0; i < 2; i++) {
    assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 5 + i) * 1000 + 500, y: (wy + 8) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
  }
  const ocoleste = (ww: World): void => {
    for (let i = 0; i < ww.agents.count; i++) {
      if (ww.agents.alive[i] === 1) evitaTinta(ww, i, idMorman, ww.tick + 5)
    }
  }
  ocoleste(w)

  const t = ruleaza(w, 300, R, (ww) => {
    ocoleste(ww)
    for (let i = 0; i < ww.desemnari.count; i++) {
      if (ww.desemnari.alive[i] !== 1 || ww.desemnari.kind[i] !== Desemnare.CONSTRUIESTE) continue
      assert.notEqual(ww.desemnari.ultimulMotiv[i]!, codMotiv(Reason.LIPSA_MATERIAL),
        `tickul ${ww.tick}: santierul ${ww.desemnari.id[i]} e „fara material" desi mormanul ${idMorman} zace la doi pasi`)
    }
  })

  // Fixtura chiar a ajuns la poarta de material, si chiar cu mormanul indisponibil
  // pionului: `faraDepozit` se numara exact acolo. Fara contorul asta, testul ar trece
  // si intr-o lume in care nimeni n-a scanat niciodata.
  assert.ok(t.faraDepozit > 0, 'fixtura moarta: nicio scanare n-a ajuns la poarta de material')
  assert.equal(w.ratiune.unitatiZidite, 0, 'fixtura: s-a zidit, deci mormanul n-a fost ocolit de toti')
  const sm = slotItem(w.iteme, idMorman)
  assert.notEqual(sm, -1, 'fixtura: mormanul a disparut din lume')
  assert.ok(w.iteme.cantitate[sm]! >= spec.cantitate, 'fixtura: mormanul s-a subtiat sub cat cere piesa')
})

test('o SAPATURA desenata intre doua santiere nu are voie sa schimbe raspunsul', () => {
  // Comparatorul de candidati trebuie sa fie o ordine TOTALA. Prima varianta a
  // departajarii pe al doilea picior statea in comparator, cu garda „doar intre
  // candidati de acelasi fel" — si o departajare CONDITIONATA nu e tranzitiva:
  // cu trei candidati legati pe scor, iese X < S, S < Y si Y < X. `Array.sort` pe
  // un comparator inconsecvent da un rezultat definit de implementare, iar aici
  // dadea exact santierul departat de morman — adica fix regresia pe care
  // departajarea fusese scrisa s-o inchida.
  //
  // Testul nu cere tranzitivitatea, care nu se vede din afara. Cere consecinta ei:
  // o desemnare de ALT FEL, care n-are nicio legatura cu niciun santier, nu poate
  // schimba ce santier se ridica.
  const spec = R.piese[Piesa.PERETE]!
  const POZITII = [
    { dx: 4, dy: 1 }, { dx: 3, dy: 0 }, { dx: 8, dy: 5 }, { dx: 2, dy: 4 },
    { dx: 5, dy: 9 }, { dx: 10, dy: 2 }, { dx: 6, dy: 11 }, { dx: 11, dy: 8 },
  ]
  let verificate = 0
  for (const p of POZITII) {
    const { w, aproape, departe, g } = douaSantiere(12345, true, false, p)
    const n = panaCand(w, 6000, (ww) => ww.ratiune.unitatiZidite >= spec.cantitate)
    assert.ok(n >= 0, `sapatura la ${p.dx},${p.dy}: nu s-a zidit nimic in 6000 de tickuri`)
    const ma = materialAt(w.terrain, aproape.wx, aproape.wy, g + 1)
    const md = materialAt(w.terrain, departe.wx, departe.wy, g + 1)
    assert.ok(ma.ok && ma.value === spec.material,
      `sapatura la ${p.dx},${p.dy}: s-a ridicat santierul DEPARTE — o desemnare straina a rasturnat departajarea`)
    assert.ok(md.ok && !isSolid(md.value), `sapatura la ${p.dx},${p.dy}: s-au ridicat amandoua`)
    verificate++
  }
  assert.equal(verificate, POZITII.length)

  // Controlul de VIATA: sapaturile alea chiar exista si chiar sunt luate in seama.
  // Fara el, testul ar trece la fel de bine daca `desemneaza` ar fi fost refuzata
  // tacut si n-ar fi existat niciodata al treilea candidat.
  const { w } = douaSantiere(12345, true, false, POZITII[0]!)
  let sapaturiVii = 0
  for (let i = 0; i < w.desemnari.count; i++) {
    if (w.desemnari.alive[i] === 1 && w.desemnari.kind[i] === Desemnare.SAPA) sapaturiVii++
  }
  assert.equal(sapaturiVii, 1, 'fixtura moarta: sapatura nu exista, deci nu e al treilea candidat')
  const t = ruleaza(w, 200)
  assert.ok(t.candidatiExaminati > 0, 'fixtura moarta: nicio scanare n-a evaluat vreun candidat')
})

test('comparatorul de candidati e o ordine TOTALA — exhaustiv, nu pe esantion', () => {
  // Proprietatea pe care varianta veche o pierduse. Nu se vede din simulare: acolo
  // se vede doar consecinta (testul de deasupra). Aici se verifica direct, si
  // exhaustiv pe un domeniu mic — fiindca o ordine se strica la o TRIPLETA anume,
  // iar un esantion o poate rata exact pe aia.
  //
  // Semnatura nu primeste `fel`, deci forma gresita nu se mai poate nici scrie.
  // Testul apara asta pe alta cale: orice departajare care nu e o functie de
  // (scor, id) fie rupe antisimetria, fie face doi candidati cu id-uri diferite
  // sa iasa EGALI — si atunci ordinea nu mai e totala.
  const G = [1, 2, 4, 8, 16]
  const D = [0, 1, 3, 7]
  const ID = [1, 2, 3]
  const cand: Array<{ g: number; d: number; id: number }> = []
  for (const g of G) for (const d of D) for (const id of ID) cand.push({ g, d, id })

  type C = { g: number; d: number; id: number }
  const cmp = (a: C, b: C): number => comparaCandidati(a.g, a.d, a.id, b.g, b.d, b.id)
  const sgn = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0)
  const nume = (a: C): string => `(g${a.g} d${a.d} id${a.id})`

  let perechi = 0
  for (const a of cand) {
    for (const b of cand) {
      perechi++
      // `sgn(-x)`, nu `-sgn(x)`: sub `assert/strict` egalitatea e `Object.is`, iar
      // `Object.is(0, -0)` e FALS. Prima varianta pica pe un candidat comparat cu el
      // insusi — greseala testului, nu a comparatorului.
      assert.equal(sgn(cmp(a, b)), sgn(-cmp(b, a)), `antisimetrie rupta: ${nume(a)} vs ${nume(b)}`)
      if (sgn(cmp(a, b)) === 0) {
        assert.equal(a.id, b.id, `${nume(a)} si ${nume(b)} ies EGALI desi au id-uri diferite: ordinea nu e totala`)
      }
    }
  }

  let triple = 0
  let lanturi = 0
  for (const a of cand) {
    for (const b of cand) {
      if (sgn(cmp(a, b)) > 0) continue
      for (const c of cand) {
        triple++
        if (sgn(cmp(b, c)) > 0) continue
        lanturi++
        assert.ok(sgn(cmp(a, c)) <= 0,
          `tranzitivitate rupta: ${nume(a)} <= ${nume(b)} <= ${nume(c)}, dar ${nume(a)} > ${nume(c)}`)
      }
    }
  }

  // Contoarele de viata: domeniul chiar produce perechi legate pe scor si lanturi
  // de trei. Fara ele, un domeniu in care toate scorurile difera ar trece degeaba.
  assert.equal(perechi, cand.length * cand.length)
  assert.ok(lanturi > 10000, `doar ${lanturi} lanturi a <= b <= c: domeniul e prea sarac`)
  let legate = 0
  for (const a of cand) for (const b of cand) if (a.id !== b.id && a.g * (1 + b.d) === b.g * (1 + a.d)) legate++
  assert.ok(legate > 50, `doar ${legate} perechi legate pe scor: tocmai cazul care doare lipseste`)
})

test('cand materialul APARE in lume, cauza „lipsa material" se STERGE de pe santier', () => {
  // Ramura de stergere din bucla ieftina. Fara ea, un santier ramane portocaliu pe
  // veci dupa prima lipsa de material: panoul ar arata un blocaj care nu mai exista,
  // si exact asta face o lista de cauze sa nu mai fie citita de nimeni.
  //
  // Testul de deasupra („poarta CAUZA") nu poate lega ramura asta: acolo materialul
  // nu apare niciodata, deci stergerea nu se executa. Iar cel de dupa nu poate lega
  // punerea detaliului pe zero, fiindca detaliul PORNESTE de la zero.
  const spec = R.piese[Piesa.PERETE]!
  const { w, wx, wy, ids } = santier6c(12345, 3, 2, false)
  ruleaza(w, 400)
  for (const id of ids) {
    const s = slotDesemnare(w.desemnari, id)
    assert.notEqual(s, -1, 'fixtura: santierul a disparut')
    assert.equal(w.desemnari.ultimulMotiv[s]!, codMotiv(Reason.LIPSA_MATERIAL),
      'fixtura moarta: cauza nici n-a fost scrisa, deci n-are ce sa se stearga')
  }

  // Apare piatra. Dupa prima rescanare, cauza n-are voie sa mai stea acolo.
  for (let i = 0; i < 3; i++) lasaItem(w, Item.PIATRA, spec.cantitate, wx + 1, wy + 1 + i)
  ruleaza(w, 120)

  let vii = 0
  for (const id of ids) {
    const s = slotDesemnare(w.desemnari, id)
    if (s === -1) continue
    vii++
    assert.notEqual(w.desemnari.ultimulMotiv[s]!, codMotiv(Reason.LIPSA_MATERIAL),
      `santierul ${id} inca poarta „lipsa material" desi lumea are piatra`)
  }
  assert.ok(vii > 0, 'fixtura moarta: toate santierele s-au zidit, deci n-a ramas ce verifica')
})

test('cauza „lipsa material" nu mosteneste detaliul cauzei dinainte', () => {
  // Cauza si detaliul sunt doua campuri, iar panoul le citeste PERECHE. Trecerea
  // scumpa scrie INACCESIBIL + COMPONENTE_DIFERITE si o racire; cand racirea expira
  // si lumea a ramas fara material, trecerea ieftina scrie LIPSA_MATERIAL. Daca
  // detaliul nu se pune inapoi pe zero, panoul afiseaza o pereche imposibila:
  // „lipsa material, din cauza ca sunt in componente diferite".
  //
  // Detaliul se pune DIRECT pe store, ca in testele de poarta de mai sus: altfel
  // fixtura ar trebui sa produca o racire expirata, si atunci testul ar masura
  // rabdarea, nu garda.
  const { w, ids } = santier6c(12345, 3, 2, false)
  for (const id of ids) {
    const s = slotDesemnare(w.desemnari, id)
    w.desemnari.ultimulMotivDetaliu[s] = DetaliuMotiv.COMPONENTE_DIFERITE
  }
  ruleaza(w, 400)
  for (const id of ids) {
    const s = slotDesemnare(w.desemnari, id)
    assert.notEqual(s, -1)
    assert.equal(w.desemnari.ultimulMotiv[s]!, codMotiv(Reason.LIPSA_MATERIAL))
    assert.equal(w.desemnari.ultimulMotivDetaliu[s]!, DetaliuMotiv.NICIUNUL,
      `santierul ${id}: detaliul ${w.desemnari.ultimulMotivDetaliu[s]} a ramas agatat de cauza veche`)
  }
})

// ---------------------------------------------------------------------------
// logistica constructiei (S20-23, taietura 3)
// ---------------------------------------------------------------------------

/** Un santier de PERETE pe solul de la (wx, wy). */
function pereteLa(w: World, wx: number, wy: number, rules: Rules = R): number {
  const g = solid(w, wx, wy)
  assert.notEqual(g, null, `nu e sol la ${wx},${wy}`)
  const r = applyCommand(w, { kind: 'desemneaza', wx, wy, z: g! + 1, piesa: Piesa.PERETE }, rules)
  assert.ok(r.ok, `santier refuzat la ${wx},${wy}: ${JSON.stringify(r)}`)
  return r.ok ? r.value : -1
}

/**
 * Porneste explicit jobul pionului `p` pe sursa `idItem` pentru santierul `idSantier`.
 * Pionul HOINARESTE pana la prima lui scanare (`(tick + id) % jobRescanTicks`), deci
 * „cel mai apropiat morman de locul de spawn" nu e ce vede sonda 25 de tickuri mai
 * tarziu — masurat: 4 celule mai incolo. Cand testul e despre A DOUA sursa, prima se
 * fixeaza aici, iar a doua se alege determinist de la celula primei.
 */
function pornestePe(w: World, p: number, idSantier: number, idItem: number, rules: Rules = R): void {
  const ds = slotDesemnare(w.desemnari, idSantier)
  const is = slotItem(w.iteme, idItem)
  assert.ok(ds !== -1 && is !== -1, 'fixtura: santierul sau mormanul nu exista')
  const out = pornesteConstruieste(w, rules, p, ds, is)
  assert.ok(out.ok, `fixtura: pornirea pe ${idItem} refuzata: ${JSON.stringify(out)}`)
}

/** Cate santiere de construit mai sunt vii. */
function santiereVii(w: World): number {
  let n = 0
  for (let s = 0; s < w.desemnari.count; s++) if (w.desemnari.alive[s] === 1 && w.desemnari.kind[s] === Desemnare.CONSTRUIESTE) n++
  return n
}

/**
 * Trei constructori, trei pereti, si materialul fie intr-UN morman de 75, fie in
 * trei de 25. Intoarce tickurile pana la ultimul perete si cati claimanti a tinut
 * mormanul mare deodata, la maxim.
 */
function treiPereti(seed: number, unMorman: boolean, rules: Rules): { tickuri: number; maxClaimanti: number; refuzatLaStart: number } {
  const { w, sit } = laSit(seed, 0, [], rules)
  const T = patratPlat(w, sit, 6, 2, 30)
  assert.ok(T, 'fixtura: niciun patrat plat')
  const mormane: number[] = []
  if (unMorman) mormane.push(lasaItem(w, Item.PIATRA, R.itemStackMax, T!.x0, T!.y0, rules))
  else for (let k = 0; k < 3; k++) mormane.push(lasaItem(w, Item.PIATRA, 25, T!.x0, T!.y0 + k, rules))
  for (let k = 0; k < 3; k++) pereteLa(w, T!.x0 + 4, T!.y0 + k, rules)
  for (let i = 0; i < 3; i++) {
    const g = solid(w, T!.x0 + 2, T!.y0 + i)
    assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (T!.x0 + 2) * 1000 + 500, y: (T!.y0 + i) * 1000 + 500, z: g! + 1, faction: 0 }, rules).ok)
  }
  let maxClaimanti = 0
  let refuzatLaStart = 0
  const tickuri = panaCand(w, 3000, (w) => {
    refuzatLaStart += lastJobReport().refuzatLaStart
    for (const id of mormane) {
      const n = new Set(rezervariPentru(w.rezervari, id, Strat.CARAT).map((r) => r.claimant)).size
      if (n > maxClaimanti) maxClaimanti = n
    }
    return santiereVii(w) === 0
  }, rules)
  assert.ok(tickuri >= 0, 'peretii nu s-au ridicat in 3000 de tickuri')
  return { tickuri, maxClaimanti, refuzatLaStart }
}

test('trei constructori pe UN morman de 75: fara lacat pornesc toti; cu lacatul de dinainte se serializeaza', () => {
  // Masurat pe 25.09, INAINTE de reparatie: un morman 220/420/241 de tickuri,
  // trei mormane 112/112/120 — lacatul exclusiv pe morman plus `jobRescanTicks`.
  // Testul ruleaza AMBELE reguli: cea implicita trebuie sa arate mecanismul (doi
  // pe acelasi morman deodata) si sa nu piarda mai mult de un tact de rescanare
  // fata de varianta cu trei mormane; controlul cu `itemClaimantsMax: 1` trebuie
  // sa fie vizibil mai lent — altfel testul n-ar deosebi reparatia de nimic.
  const seed = 7
  const trei = treiPereti(seed, false, R)
  const unul = treiPereti(seed, true, R)
  const lacat = treiPereti(seed, true, { ...R, itemClaimantsMax: 1 })
  assert.ok(unul.maxClaimanti >= 2, `mormanul de 75 n-a fost tinut de doi constructori deodata (max ${unul.maxClaimanti})`)
  assert.ok(unul.tickuri <= trei.tickuri + R.jobRescanTicks, `un morman: ${unul.tickuri} tickuri, trei mormane: ${trei.tickuri} — mai mult de un tact de rescanare pierdut`)
  assert.equal(lacat.maxClaimanti, 1, 'controlul: cu itemClaimantsMax 1 nu incap doi')
  assert.ok(lacat.tickuri > unul.tickuri + R.jobRescanTicks, `controlul: lacatul (${lacat.tickuri}) nu e mai lent decat reparatia (${unul.tickuri})`)
  assert.equal(unul.refuzatLaStart + trei.refuzatLaStart + lacat.refuzatLaStart, 0, 'verificat la scan, refuzat la start')
})

test('doua mormane de 20, doi constructori: al doilea ia AL DOILEA morman, nu e refuzat la start pe primul', () => {
  // Sonda din `rezumatMaterial` trebuie sa se uite la ce e LIBER: primul constructor
  // tine mormanul A cu 20, deci pentru al doilea A are zero liber, si sonda ii da
  // B. O sonda care se uita la cat E in morman ar propune tot A, iar pornirea l-ar
  // refuza — „verificat la scan, refuzat la start", un scan pierdut pe fiecare.
  const { w, sit } = laSit(7, 0)
  const T = patratPlat(w, sit, 6, 2, 30)
  assert.ok(T)
  const a = lasaItem(w, Item.PIATRA, 20, T!.x0, T!.y0)
  const b = lasaItem(w, Item.PIATRA, 20, T!.x0, T!.y0 + 1)
  for (let k = 0; k < 2; k++) pereteLa(w, T!.x0 + 4, T!.y0 + k)
  for (let i = 0; i < 2; i++) {
    const g = solid(w, T!.x0 + 2, T!.y0 + i)
    assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (T!.x0 + 2) * 1000 + 500, y: (T!.y0 + i) * 1000 + 500, z: g! + 1, faction: 0 }, R).ok)
  }
  let refuzatLaStart = 0
  let ambii = -1
  const n = panaCand(w, 3000, (w) => {
    refuzatLaStart += lastJobReport().refuzatLaStart
    const tinte = [0, 1].filter((i) => w.agents.jobKind[i] === FelJob.CONSTRUIESTE).map((i) => w.agents.jobTarget[i]!)
    if (ambii === -1 && tinte.length === 2 && tinte[0] !== tinte[1]) ambii = w.tick
    return santiereVii(w) === 0
  })
  assert.ok(n >= 0)
  assert.ok(ambii >= 0 && ambii <= 2 * R.jobRescanTicks, `cei doi n-au tinut mormane DIFERITE in doua tacte de rescanare (${ambii})`)
  assert.equal(refuzatLaStart, 0, 'verificat la scan, refuzat la start')
  assert.ok(slotItem(w.iteme, a) === -1 && slotItem(w.iteme, b) === -1, 'ambele mormane trebuie consumate')
})

test('munca falsa: un drum refuzat spre morman NU trimite constructorul la santier cu mana goala', () => {
  // Masurat de panoul din 25.09, pe codul de dinainte: ostil pinuit pe morman →
  // `refaTinta` scria MERGE_SANTIER neconditionat → 73 din 74 de joburi in 3000 de
  // tickuri, 2586 de tickuri de „zidire" din nimic, niciun zavor tras.
  const { w, ds, is } = santier(12345)
  const idItem = w.iteme.id[is]!
  const lx = w.iteme.wx[is]!
  const ly = w.iteme.wy[is]!
  const lz = w.iteme.z[is]!
  const ostil = applyCommand(w, { kind: 'spawnAgent', x: lx * 1000 + 500, y: ly * 1000 + 500, z: lz, faction: Faction.SALBATIC }, R)
  assert.ok(ostil.ok)
  assert.ok(pornesteConstruieste(w, R, 0, ds, is).ok)
  let joburi = 1
  let ultimJob = w.agents.jobId[0]!
  let laSantierCuManaGoala = 0
  let refuzuri = 0
  for (let t = 0; t < 3000; t++) {
    w.agents.x[1] = lx * 1000 + 500
    w.agents.y[1] = ly * 1000 + 500
    w.agents.z[1] = lz
    refuzuri += ruleaza(w, 1).refuzuriDrum
    if (w.agents.jobKind[0] === FelJob.CONSTRUIESTE) {
      if (w.agents.jobId[0] !== ultimJob) { joburi++; ultimJob = w.agents.jobId[0]! }
      if (w.agents.caraCantitate[0] === 0 && w.agents.jobStep[0]! >= PasConstruieste.MERGE_SANTIER) laSantierCuManaGoala++
    }
  }
  assert.ok(refuzuri >= 1, 'fixtura: drumul spre morman nu a fost refuzat niciodata')
  assert.equal(laSantierCuManaGoala, 0, `constructorul a stat ${laSantierCuManaGoala} tickuri pe piciorul santierului cu mana goala`)
  assert.equal(w.ratiune.zidiriCuManaGoala, 0)
  assert.equal(w.ratiune.unitatiZidite, 0, 'fixtura: cu mormanul blocat nu se poate zidi nimic')
  // Marginit: o incercare la fiecare `jobRetryTicks`, nu o bucla la fiecare tick.
  assert.ok(joburi <= 2 + Math.ceil(3000 / R.jobRetryTicks), `${joburi} joburi pornite in 3000 de tickuri`)
  // Cauza e a PERECHII: pionul evita mormanul, dar mormanul NU e racit pentru toti.
  assert.ok(esteEvitata(w, 0, idItem), 'pionul ar trebui sa evite mormanul blocat')
  assert.ok(w.iteme.reincercaLaTick[slotItem(w.iteme, idItem)]! <= w.tick, 'mormanul a fost racit GLOBAL dintr-un job de construit')
})

test('zidirea cu mana goala se incheie pe loc, nu dupa 40 de tickuri de munca din nimic', () => {
  // Nicio cale corecta nu ajunge aici; e zavorul. Se simuleaza un pion la ZIDESTE
  // caruia i-a disparut materialul din mana (save editat, sau un defect viitor).
  const { w, ds, is } = santier(12345)
  assert.ok(pornesteConstruieste(w, R, 0, ds, is).ok)
  const la = panaCand(w, 2000, (ww) => ww.agents.jobStep[0] === PasConstruieste.ZIDESTE)
  assert.ok(la >= 0, 'fixtura: pionul n-a ajuns la ZIDESTE')
  w.agents.caraCantitate[0] = 0
  w.agents.caraKind[0] = 0
  const lucruInainte = w.ratiune.tickuriDeLucru
  const t = ruleaza(w, 2)
  assert.equal(w.agents.jobKind[0], 0, 'jobul trebuia sa se incheie in cel mult doua tickuri')
  assert.equal(w.ratiune.tickuriDeLucru, lucruInainte, 'a muncit cu mana goala')
  assert.equal(w.ratiune.zidiriCuManaGoala, 1, 'zavorul trebuia tras exact o data')
  assert.equal(w.ratiune.unitatiZidite, 0, 'peretele a iesit din nimic')
  void t
})

test('foamea critica nu arunca mana plina: constructorul zideste, APOI mananca', () => {
  // `poateFiIntrerupt` spunea „carat, de la MERGE_DEST incolo"; constructorul cu
  // 20 in mana la 390/400 era intrerupt, marfa cadea langa santier, progresul se
  // pierdea. Un adevar: mana plina, indiferent de fel.
  const { w, ds, is } = santier(12345)
  const sit = { wx: w.iteme.wx[is]! - 1, wy: w.iteme.wy[is]! }
  lasaItem(w, Item.HRANA, 75, sit.wx, sit.wy - 2)
  assert.ok(pornesteConstruieste(w, R, 0, ds, is).ok)
  const la = panaCand(w, 2000, (ww) => ww.agents.jobStep[0] === PasConstruieste.MERGE_SANTIER)
  assert.ok(la >= 0, 'fixtura: pionul n-a ridicat materialul')
  assert.equal(w.agents.caraCantitate[0], R.piese[Piesa.PERETE]!.cantitate)
  w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 20
  assert.ok(20 < R.nevoi[Nevoie.FOAME]!.pragCritic, 'fixtura: foamea trebuie sa fie sub pragul critic')
  const zidit = panaCand(w, 2000, (ww) => ww.ratiune.unitatiZidite > 0)
  assert.ok(zidit >= 0, 'peretele nu s-a ridicat: constructorul a fost intrerupt cu mana plina')
  assert.equal(lastJobReport().lasateLaPicioare, 0)
  assert.equal(w.ratiune.intreruperiDeNevoie, 0, 'a fost intrerupt de nevoie cu mana plina')
  // Si abia apoi mananca — nevoia nu s-a pierdut, s-a amanat.
  const mananca = panaCand(w, 2000, (ww) => ww.agents.jobKind[0] === FelJob.MANANCA)
  assert.ok(mananca >= 0, 'dupa perete, pionul flamand trebuia sa mearga sa manance')
  assert.equal(w.ratiune.itemePierdute, 0)
})

// ---------------------------------------------------------------------------
// ridicarea in mai multe randuri (logistica, 2b)
// ---------------------------------------------------------------------------

/** Un patrat plat de `latura` langa un sit, pe prima samanta care il are. */
function scenaPlata(seminte: readonly number[], latura: number, dMin = 2, dMax = 40): { w: World; T: { x0: number; y0: number; g: number } } {
  for (const seed of seminte) {
    const { w, sit } = laSit(seed, 0)
    const T = patratPlat(w, sit, latura, dMin, dMax)
    if (T) return { w, T }
  }
  assert.fail('fixtura: niciun patrat plat pe semintele date')
}

/** Un pion al asezarii pe solul de la (wx, wy). Intoarce slotul. */
function pionLa(w: World, wx: number, wy: number): number {
  const g = solid(w, wx, wy)
  assert.notEqual(g, null, `nu e sol la ${wx},${wy}`)
  const r = applyCommand(w, { kind: 'spawnAgent', x: wx * 1000 + 500, y: wy * 1000 + 500, z: g! + 1, faction: 0 }, R)
  assert.ok(r.ok, `pion refuzat la ${wx},${wy}: ${JSON.stringify(r)}`)
  return w.agents.count - 1
}

/** Ce sursa are pionul cand merge dupa a DOUA parte (prima e in mana). */
function aDouaSursa(w: World, slot: number): number {
  return w.agents.jobKind[slot] === FelJob.CONSTRUIESTE && w.agents.jobStep[slot] === PasConstruieste.MERGE_SURSA && w.agents.caraCantitate[slot]! > 0 ? w.agents.jobTarget[slot]! : -1
}

test('ridicarea in mai multe randuri: 30 de mormane de cate 10, fara depozit, ridica 3 pereti — si K05 ramane', () => {
  // Masurat inainte (25.09): 0 pereti in 20.000 de tickuri. `rezumatMaterial` cerea
  // toata piesa dintr-un SINGUR morman, iar singurul mecanism care contopea era
  // caratul spre depozit — deci o colonie fara depozit sau fara carausi statea.
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 9)
  // Un morman DEPARTE, primul in ordinea sloturilor, in afara discurilor de acoperire
  // dar in raza de scanare: nu e ales niciodata (cheia lui e de zeci de ori mai mare),
  // dar un coridor de acoperire intins spre el s-ar VEDEA in `regions.keys`. Pe un
  // patrat plat, fara el, totul e deja acoperit si K05 n-ar avea ce masura.
  const departe = solidLaDistanta(w, T.x0, T.y0, T.g, 60, 80)
  lasaItem(w, Item.PIATRA, 10, departe.wx, departe.wy)
  let puse = 0
  for (let dx = 0; dx < 6 && puse < 30; dx++) for (let dy = 0; dy < 5 && puse < 30; dy++) { lasaItem(w, Item.PIATRA, 10, T.x0 + dx, T.y0 + dy); puse++ }
  for (let k = 0; k < 3; k++) pereteLa(w, T.x0 + 7, T.y0 + k)
  for (let i = 0; i < 6; i++) pionLa(w, T.x0 + 8, T.y0 + (i % 5))
  ruleaza(w, 5) // regiunile se aseaza
  const blocuri = w.regions.keys.length
  let douaRidicari = 0
  const n = panaCand(w, 6000, (w) => {
    for (let i = 0; i < w.agents.count; i++) if (aDouaSursa(w, i) !== -1) douaRidicari++
    return santiereVii(w) === 0
  })
  assert.ok(n >= 0, 'peretii nu s-au ridicat din mormane de 10')
  assert.ok(douaRidicari > 0, 'fixtura: nimeni n-a mers dupa a doua sursa cu prima in mana')
  assert.equal(w.ratiune.zidiriCuManaGoala, 0)
  assert.equal(w.ratiune.unitatiZidite, 3 * R.piese[Piesa.PERETE]!.cantitate)
  assert.equal(w.ratiune.itemePierdute, 0)
  // Zero, nu „cel mult unu": un abandon cere ca a doua sursa sa dispara intre
  // scanare si retintire, si cu 30 de mormane pentru 6 pioni asta nu se intampla
  // (masurat 0). O banda de 1 ar fi ascuns un abandon nou sub pragul de o unitate.
  assert.equal(w.ratiune.ridicariAbandonate, 0, `${w.ratiune.ridicariAbandonate} ridicari abandonate cu material din belsug`)
  // K05: a doua sursa nu intinde coridoare. Acoperirea e cea de dupa asezare.
  assert.equal(w.regions.keys.length, blocuri, `acoperirea a crescut cu ${w.regions.keys.length - blocuri} blocuri in timpul constructiei`)
})

test('doi constructori, doua mormane de 10, UN santier, fara depozit: peretele se ridica', () => {
  // Fara suma LIBERA in raza, fiecare ar lua cate un morman, niciunul n-ar gasi
  // a doua sursa, si 20 de unitati ar zace la doua celule de santier pe veci.
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18], 6)
  lasaItem(w, Item.PIATRA, 10, T.x0, T.y0)
  lasaItem(w, Item.PIATRA, 10, T.x0, T.y0 + 2)
  pereteLa(w, T.x0 + 4, T.y0 + 1)
  pionLa(w, T.x0 + 2, T.y0)
  pionLa(w, T.x0 + 2, T.y0 + 2)
  let refuzatLaStart = 0
  const n = panaCand(w, 600, (w) => { refuzatLaStart += lastJobReport().refuzatLaStart; return santiereVii(w) === 0 })
  assert.ok(n >= 0, 'peretele nu s-a ridicat in 600 de tickuri: cei doi si-au impartit materialul')
  assert.equal(refuzatLaStart, 0)
  assert.equal(w.ratiune.zidiriCuManaGoala, 0)
  assert.equal(w.ratiune.itemePierdute, 0)
})

test('materialul de neatins nu porneste niciun job: 10 accesibile + (jobAvoidSlots + 1) x 10 sigilate, 2 pioni, 2 santiere', () => {
  // Recenzia din 25.09: cu suma LIBERA fara componenta, singura margine a buclei
  // ridica-lasa era inelul de evitare pe pereche din `refaSursa` — 4 sloturi. Cu
  // 5 mormane sigilate mereu unul ramanea neevitat, suma dadea 10 + 10 ≥ 20, si
  // pionul ridica si lasa acelasi morman la ~30 de tickuri, pe veci (66–126 de
  // cicluri in 3000–6000 de tickuri, `nextId` +2 fiecare, 0 zidit). Testul vechi
  // avea UN morman sigilat si era orb pe clasa ≥ jobAvoidSlots + 1. Acum sonda
  // numara doar mormanele din componenta pionului: niciun job nu porneste, deloc.
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const sigilate: number[] = []
  const celule = [[1, 1], [1, 4], [1, 7], [1, 10], [4, 1], [4, 10], [7, 10], [10, 10]] as const
  for (let k = 0; k < R.jobAvoidSlots + 1; k++) {
    const [dx, dy] = celule[k]!
    sigileaza(w, wx + dx, wy + dy, g)
    sigilate.push(lasaItem(w, Item.PIATRA, 10, wx + dx, wy + dy))
  }
  lasaItem(w, Item.PIATRA, 10, wx + 7, wy + 5)
  pereteLa(w, wx + 10, wy + 4)
  pereteLa(w, wx + 10, wy + 6)
  const p1 = pionLa(w, wx + 7, wy + 3)
  const p2 = pionLa(w, wx + 7, wy + 7)
  ruleaza(w, 5)
  // Fixtura chiar produce clasa: fiecare morman sigilat e in ALTA componenta decat
  // pionii, in raza lor, si toate impreuna cu cel accesibil ar acoperi de trei ori
  // peretele — o sonda fara componenta le-ar numara pe toate.
  for (const p of [p1, p2]) {
    const comp = find(w.regions, regionAt(w.regions, cellOf(w.agents.x[p]!), cellOf(w.agents.y[p]!), w.agents.z[p]!))
    for (const id of sigilate) {
      const s = slotItem(w.iteme, id)
      const r = regionAt(w.regions, w.iteme.wx[s]!, w.iteme.wy[s]!, w.iteme.z[s]!)
      assert.notEqual(find(w.regions, r), comp, `fixtura: mormanul ${id} nu e sigilat fata de pionul ${p}`)
      assert.ok(Math.abs(w.iteme.wx[s]! - cellOf(w.agents.x[p]!)) + Math.abs(w.iteme.wy[s]! - cellOf(w.agents.y[p]!)) <= R.jobScanRadiusCells, 'fixtura: sigilatul e in afara razei')
    }
  }
  assert.ok(lantAcopera(10 * (R.jobAvoidSlots + 2), 0, R.piese[Piesa.PERETE]!.cantitate, pragRidicare(R, R.piese[Piesa.PERETE]!)), 'fixtura: fara componenta, lantul ar acoperi')
  const nextId0 = w.nextId
  const marfa0 = marfaTotala(w)
  let porniri = 0
  const vazut = new Int32Array(w.agents.capacity)
  ruleaza(w, 3000, R, (w) => {
    for (let i = 0; i < w.agents.count; i++) if (w.agents.jobKind[i] === FelJob.CONSTRUIESTE && w.agents.jobId[i] !== vazut[i]) { vazut[i] = w.agents.jobId[i]!; porniri++ }
  })
  assert.equal(porniri, 0, `${porniri} joburi de construit pornite pe material de neatins`)
  assert.equal(w.ratiune.ridicariAbandonate, 0)
  assert.equal(w.nextId, nextId0, `nextId a crescut cu ${w.nextId - nextId0}: cineva a ridicat si a lasat`)
  assert.equal(marfaTotala(w), marfa0)
  assert.equal(w.ratiune.itemePierdute, 0)
  assert.equal(w.ratiune.unitatiZidite, 0, 'fixtura: cu 10 de neatins nu se poate zidi nimic')
})

test('abandonul LEGITIM: a doua sursa e luata de altii intre scanare si retintire — motiv REZERVAT, rescanare la un tact, si peretele se ridica dupa eliberare', () => {
  // Singura cale spre `ridicariAbandonate` e lumea care se schimba intre scanare si
  // retintire: sonda a numarat B, altcineva l-a luat. Contorul creste EXACT o data,
  // motivul e REZERVAT (era un morman bun, al altora), marfa e la picioare, si
  // rescanarea vine la un tact, nu la tickul urmator.
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 7)
  const idSantier = pereteLa(w, T.x0 + 6, T.y0 + 3)
  const idA = lasaItem(w, Item.PIATRA, 10, T.x0 + 1, T.y0 + 3)
  const idB = lasaItem(w, Item.PIATRA, 10, T.x0 + 3, T.y0 + 1)
  const p = pionLa(w, T.x0, T.y0 + 3)
  ruleaza(w, 5)
  assert.ok(rezumatMaterial(w, R, p)[Piesa.PERETE]!.exista, 'fixtura: sonda trebuia sa vada 10 + 10')
  pornestePe(w, p, idSantier, idA)
  const strain = { claimant: 990001, job: 880001 }
  assert.ok(rezervaToate(w.rezervari, strain.claimant, strain.job, [cerereCarat(R, idB, 10)]).ok, 'fixtura: rezervarea straina pe B')
  let lasate = 0
  const laAbandon = panaCand(w, 600, (w) => { lasate += lastJobReport().lasateLaPicioare; return w.ratiune.ridicariAbandonate === 1 })
  assert.ok(laAbandon >= 0, 'ridicarea nu s-a abandonat desi B era al altora')
  assert.equal(w.ratiune.motivFinal[p], codMotiv(Reason.REZERVAT), 'motivul retintirii esuate trebuie sa ajunga pe pion')
  assert.equal(lasate, 1, 'marfa din mana se lasa la picioare, o data')
  assert.equal(w.agents.caraCantitate[p], 0)
  assert.equal(w.agents.jobKind[p], 0)
  const tickAbandon = w.tick
  // B se elibereaza pe loc: acum sonda ar admite iar (10 lasate + 10 in B), deci
  // ce tine pionul pe loc e doar amanarea de rescanare a abandonului: nu la tickul
  // urmator (cum face orice alt sfarsit de job), ci la cadenta obisnuita — cel
  // mult un tact.
  elibereaza(w.rezervari, strain.claimant, strain.job)
  const laJob = panaCand(w, 600, (w) => w.agents.jobKind[p] === FelJob.CONSTRUIESTE)
  assert.ok(laJob >= 0, 'pionul nu a reluat constructia dupa eliberarea lui B')
  assert.ok(w.tick - tickAbandon > 1, 'abandonul a rescanat la tickul urmator, ca un sfarsit obisnuit de job')
  assert.ok(w.tick - tickAbandon <= R.jobRescanTicks, `a rescanat abia dupa ${w.tick - tickAbandon} tickuri; cadenta e ${R.jobRescanTicks}`)
  const n = panaCand(w, 2000, (w) => santiereVii(w) === 0)
  assert.ok(n >= 0, 'peretele nu s-a ridicat dupa eliberare')
  assert.equal(w.ratiune.ridicariAbandonate, 1)
  assert.equal(w.ratiune.itemePierdute, 0)
})

test('doua mormane de 10 la ±k celule de pion, la peste o raza unul de altul: peretele se ridica (a doua sursa se cauta de la SANTIER, la 2R)', () => {
  // Recenzia din 25.09: sonda admitea (ambele in raza pionului), `refaSursa` cauta
  // in raza celulei curente — de pe A, B era la 2k > R — si peretele nu se ridica
  // NICIODATA, pe 8 seminte din 8, cu 20 de piatra in lume si un pion liber.
  for (const seed of [7, 12345]) {
    const { w, sit } = laSit(seed, 0)
    const gaseste = (dir: number): { wx: number; wy: number } | null => {
      for (let k = 50; k <= 70; k++) {
        const x = sit.wx + dir * k
        if (x >= 0 && solid(w, x, sit.wy) !== null) return { wx: x, wy: sit.wy }
      }
      return null
    }
    const A = gaseste(1)
    const B = gaseste(-1)
    assert.ok(A && B, `fixtura: fara sol la ±50 pe semintea ${seed}`)
    let idSantier = -1
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1]] as const) {
      if (solid(w, sit.wx + dx, sit.wy + dy) === null) continue
      const r = applyCommand(w, { kind: 'desemneaza', wx: sit.wx + dx, wy: sit.wy + dy, z: solid(w, sit.wx + dx, sit.wy + dy)! + 1, piesa: Piesa.PERETE }, R)
      if (r.ok) { idSantier = r.value; break }
    }
    assert.notEqual(idSantier, -1, 'fixtura: niciun santier langa sit')
    const idA = lasaItem(w, Item.PIATRA, 10, A!.wx, A!.wy)
    const idB = lasaItem(w, Item.PIATRA, 10, B!.wx, B!.wy)
    const p = pionLa(w, sit.wx, sit.wy)
    ruleaza(w, 5)
    const sA = slotItem(w.iteme, idA)
    const sB = slotItem(w.iteme, idB)
    const dAB = Math.abs(w.iteme.wx[sA]! - w.iteme.wx[sB]!) + Math.abs(w.iteme.wy[sA]! - w.iteme.wy[sB]!) + Math.abs(w.iteme.z[sA]! - w.iteme.z[sB]!)
    assert.ok(dAB > R.jobScanRadiusCells, `fixtura: A si B la ${dAB} unul de altul, sub raza`)
    assert.ok(rezumatMaterial(w, R, p)[Piesa.PERETE]!.exista, 'fixtura: sonda trebuia sa admita 10 + 10 in raza ei')
    pornestePe(w, p, idSantier, idA)
    const n = panaCand(w, 6000, (w) => santiereVii(w) === 0)
    assert.ok(n >= 0, `semintea ${seed}: peretele nu s-a ridicat in 6000 de tickuri (abandonuri: ${w.ratiune.ridicariAbandonate})`)
    assert.equal(w.ratiune.ridicariAbandonate, 0, `semintea ${seed}`)
    assert.equal(w.ratiune.unitatiZidite, R.piese[Piesa.PERETE]!.cantitate)
    assert.equal(w.ratiune.itemePierdute, 0)
  }
})

test('raza de scanare LEAGA in sonda: un morman dincolo de ea nu e propus, unul in ea da', () => {
  // Garda `dist > jobScanRadiusCells` n-avea nicio proba (recenzia din 25.09: scoasa,
  // sonda propunea un morman la 101 celule si jobul pornea). Cu raza implicita ar
  // trebui un sit plat de 200; regula se ia mica, mecanismul e acelasi.
  const RZ: Rules = { ...R, jobScanRadiusCells: 6 }
  const { w, wx, wy } = sitPlat(12345, 15)
  pereteLa(w, wx + 3, wy + 7)
  const p = pionLa(w, wx + 1, wy + 7)
  ruleaza(w, 5, RZ)
  const px = cellOf(w.agents.x[p]!)
  const py = cellOf(w.agents.y[p]!)
  const idDeparte = lasaItem(w, Item.PIATRA, 20, px + RZ.jobScanRadiusCells + 2, py)
  assert.equal(rezumatMaterial(w, RZ, p)[Piesa.PERETE]!.slot, -1, `sonda a propus mormanul de la ${RZ.jobScanRadiusCells + 2} celule, raza fiind ${RZ.jobScanRadiusCells}`)
  const idAproape = lasaItem(w, Item.PIATRA, 20, px + RZ.jobScanRadiusCells - 2, py)
  const m = rezumatMaterial(w, RZ, p)[Piesa.PERETE]!
  assert.ok(m.exista && m.slot !== -1 && w.iteme.id[m.slot] === idAproape, `controlul: mormanul din raza trebuia propus (${idDeparte}, ${idAproape})`)
})

test('raza la A DOUA sursa e 2R de la SANTIER: un morman mai departe se refuza (abandon), unul mai aproape se ia', () => {
  const RZ: Rules = { ...R, jobScanRadiusCells: 6 }
  const scena = (dB: number): { w: World; p: number; idB: number; idSantier: number } => {
    const { w, wx, wy } = sitPlat(12345, 15)
    const idSantier = pereteLa(w, wx + 3, wy + 7)
    const idA = lasaItem(w, Item.PIATRA, 10, wx + 2, wy + 7)
    const idB = lasaItem(w, Item.PIATRA, 10, wx + 3 + dB, wy + 7)
    const p = pionLa(w, wx + 1, wy + 7)
    ruleaza(w, 5, RZ)
    pornestePe(w, p, idSantier, idA, RZ)
    return { w, p, idB, idSantier }
  }
  const departe = scena(2 * RZ.jobScanRadiusCells + 2)
  const la = panaCand(departe.w, 600, (w) => w.ratiune.ridicariAbandonate === 1 || aDouaSursa(w, departe.p) !== -1, RZ)
  assert.ok(la >= 0, 'fixtura: nici abandon, nici a doua sursa')
  assert.equal(departe.w.ratiune.ridicariAbandonate, 1, `mormanul de la ${2 * RZ.jobScanRadiusCells + 2} de santier a fost luat ca a doua sursa`)
  assert.equal(departe.w.ratiune.motivFinal[departe.p], codMotiv(Reason.LIPSA_MATERIAL))
  const aproape = scena(2 * RZ.jobScanRadiusCells - 2)
  const spreB = panaCand(aproape.w, 600, (w) => aDouaSursa(w, aproape.p) === aproape.idB, RZ)
  assert.ok(spreB >= 0, 'controlul: mormanul de sub 2R trebuia luat ca a doua sursa')
  const n = panaCand(aproape.w, 2000, (w) => santiereVii(w) === 0, RZ)
  assert.ok(n >= 0, 'controlul: peretele nu s-a ridicat')
  assert.equal(aproape.w.ratiune.ridicariAbandonate, 0)
})

test('lantul de ridicari: 15 + 5 si 19 + 1 se zidesc, 10 + 5 + 5 poarta MATERIAL_IMPRASTIAT pe santier si LIPSA_MATERIAL pe pion', () => {
  // Recenzia din 25.09: sonda cerea pragul intreg fiecarui morman din suma, deci
  // 15 + 5 nu pornea niciodata — desi `refaSursa` ar fi luat restul de 5 — iar
  // cauza de pe santier se stergea (un morman ≥ prag si suma bruta ≥ 20), deci
  // „De ce nu?" tacea. Un singur lant, `lantAcopera`, pentru sonda, retintire si
  // cauza: 10 + 5 + 5 nu-l acopera (dupa 10 lipsesc 10, si niciun morman n-are 10).
  const scena = (marimi: readonly number[]): { w: World; ds: number; p: number } => {
    const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 9)
    marimi.forEach((q, k) => lasaItem(w, Item.PIATRA, q, T.x0, T.y0 + 2 + 2 * k))
    const ds = slotDesemnare(w.desemnari, pereteLa(w, T.x0 + 5, T.y0 + 4))
    const p = pionLa(w, T.x0 + 2, T.y0 + 4)
    return { w, ds, p }
  }
  for (const marimi of [[15, 5], [19, 1]] as const) {
    const { w } = scena(marimi)
    const n = panaCand(w, 1500, (w) => santiereVii(w) === 0)
    assert.ok(n >= 0, `${marimi.join(' + ')}: peretele nu s-a ridicat`)
    assert.equal(w.ratiune.unitatiZidite, R.piese[Piesa.PERETE]!.cantitate)
    assert.equal(w.ratiune.ridicariAbandonate, 0)
    assert.equal(w.ratiune.itemePierdute, 0)
  }
  const { w, ds, p } = scena([10, 5, 5])
  const t = ruleaza(w, 400)
  assert.equal(t.joburiPornite, 0, '10 + 5 + 5 nu acopera 20: niciun job nu are voie sa porneasca')
  assert.equal(w.desemnari.ultimulMotiv[ds], codMotiv(Reason.LIPSA_MATERIAL), 'santierul trebuie sa poarte cauza')
  assert.equal(w.desemnari.ultimulMotivDetaliu[ds], DetaliuMotiv.MATERIAL_IMPRASTIAT, 'e destul ca suma, dar niciun lant nu-l aduna')
  assert.equal(w.ratiune.motivFinal[p], codMotiv(Reason.LIPSA_MATERIAL), 'pionul spune ce lipseste, nu FARA_DEPOZIT')
  assert.equal(w.ratiune.unitatiZidite, 0)
})

test('un morman cu locurile de claimant PLINE nu intra in suma sondei, chiar daca are liber peste prag', () => {
  // Recenzia din 25.09 (P4): patru claimanti a cate 5 pe un morman de 75 — 55 liber,
  // dar niciun loc. Suma il numara, `exista` iesea adevarat, jobul pornea pe
  // mormanul de 10 de alaturi, si retintirea refuza: 60 de porniri si 59 de
  // abandonuri in 2000 de tickuri, zero zidit.
  const scena = (claimanti: number): { m: MaterialPentruPiesa; idP: number; idA: number } => {
    const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 8)
    const idP = lasaItem(w, Item.PIATRA, R.itemStackMax, T.x0 + 5, T.y0 + 1)
    for (let k = 0; k < claimanti; k++) assert.ok(rezervaToate(w.rezervari, 990001 + k, 880001 + k, [cerereCarat(R, idP, 5)]).ok, 'fixtura: rezervarea straina')
    const idA = lasaItem(w, Item.PIATRA, 10, T.x0 + 2, T.y0 + 4)
    const p = pionLa(w, T.x0 + 2, T.y0 + 5)
    pereteLa(w, T.x0 + 2, T.y0 + 7)
    ruleaza(w, 5)
    return { m: rezumatMaterial(w, R, p)[Piesa.PERETE]!, idP, idA }
  }
  const plin = scena(R.itemClaimantsMax)
  assert.equal(plin.m.exista, false, 'mormanul plin de claimanti a fost numarat in suma')
  const loc = scena(R.itemClaimantsMax - 1)
  assert.ok(loc.m.exista, 'controlul: cu un loc liber, mormanul e sursa')
})

test('fragmentul VIU ramas cu destul liber ramane a doua sursa: dupa cadere, constructorul il realege, nu abandoneaza', () => {
  // Recenzia din 25.09: reconcilierea pasa id-ul viu drept „de evitat" catre
  // `refaSursa`, deci exact mormanul care ramasese cu 15 era exclus, si marfa
  // ajungea la picioare cu sursa buna la un pas.
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 7)
  const idSantier = pereteLa(w, T.x0 + 6, T.y0 + 3)
  const idA = lasaItem(w, Item.PIATRA, 10, T.x0 + 1, T.y0 + 3)
  const idB = lasaItem(w, Item.PIATRA, 20, T.x0 + 3, T.y0 + 1)
  const idD = lasaItem(w, Item.PIATRA, 70, T.x0 + 4, T.y0 + 1)
  const p = pionLa(w, T.x0, T.y0 + 3)
  evitaTinta(w, p, idD, w.tick + 100000)
  ruleaza(w, 5)
  pornestePe(w, p, idSantier, idA)
  const spreB = panaCand(w, 600, (w) => aDouaSursa(w, p) === idB)
  assert.ok(spreB >= 0, 'fixtura: a doua sursa trebuia sa fie B')
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: T.x0 + 3, wy: T.y0 + 1, z: T.g - 1 }, R).ok)
  assert.ok(applyCommand(w, { kind: 'dig', wx: T.x0 + 3, wy: T.y0 + 1, z: T.g }, R).ok)
  const sB = slotItem(w.iteme, idB)
  assert.ok(sB !== -1 && w.iteme.cantitate[sB]! < 20 && w.iteme.cantitate[sB]! >= pragRidicare(R, R.piese[Piesa.PERETE]!), `fixtura: B trebuia sa ramana viu, cu mai putin dar peste prag (are ${sB === -1 ? 'mort' : w.iteme.cantitate[sB]})`)
  assert.equal(aDouaSursa(w, p), idB, 'constructorul trebuia sa ramana pe fragmentul lui B')
  assert.equal(w.ratiune.ridicariAbandonate, 0)
  assert.equal(w.agents.caraCantitate[p], 10)
  const n = panaCand(w, 2000, (w) => santiereVii(w) === 0)
  assert.ok(n >= 0, 'peretele nu s-a ridicat')
  assert.equal(w.ratiune.itemePierdute, 0)
})

test('pragul la A DOUA ridicare e ce mai lipseste: un rest de 5 liber nu e sursa cand lipsesc 10, chiar daca e mai aproape', () => {
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 7)
  const idSantier = pereteLa(w, T.x0 + 6, T.y0 + 3)
  const idA = lasaItem(w, Item.PIATRA, 10, T.x0 + 1, T.y0 + 3)
  const idB = lasaItem(w, Item.PIATRA, 25, T.x0 + 1, T.y0 + 2)   // lipit de A, dar 20 din 25 sunt ale altuia
  const idC = lasaItem(w, Item.PIATRA, 10, T.x0 + 1, T.y0 + 6)   // mai departe, intreg
  assert.ok(rezervaToate(w.rezervari, 990001, 880001, [cerereCarat(R, idB, 20)]).ok)
  const p = pionLa(w, T.x0, T.y0 + 3)
  ruleaza(w, 5)
  pornestePe(w, p, idSantier, idA)
  const la = panaCand(w, 600, (w) => aDouaSursa(w, p) !== -1)
  assert.ok(la >= 0, 'fixtura: nicio a doua sursa')
  assert.equal(aDouaSursa(w, p), idC, `a doua sursa trebuia sa fie C, nu restul de 5 din B (${idB})`)
  const n = panaCand(w, 2000, (w) => santiereVii(w) === 0)
  assert.ok(n >= 0)
  assert.equal(w.iteme.cantitate[slotItem(w.iteme, idB)], 25, 'B trebuia sa ramana neatins')
})

test('ostil pe a doua sursa si NICIO alta: ridicarea se abandoneaza (contorizata), nu se lasa marfa prin drumul refuzat', () => {
  // Recenzia din 25.09: pe piciorul sursei, un drum refuzat fara alta sursa ajungea
  // in `drumRefuzat` → INCOMPLET pe morman, marfa la picioare, si `ridicariAbandonate`
  // ramanea 0 — aceeasi stare de joc, alta cifra.
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 7)
  const idSantier = pereteLa(w, T.x0 + 6, T.y0 + 3)
  const idA = lasaItem(w, Item.PIATRA, 10, T.x0 + 1, T.y0 + 3)
  const idB = lasaItem(w, Item.PIATRA, 10, T.x0 + 3, T.y0 + 1)
  const p = pionLa(w, T.x0, T.y0 + 3)
  ruleaza(w, 5)
  pornestePe(w, p, idSantier, idA)
  const ostil = applyCommand(w, { kind: 'spawnAgent', x: (T.x0 + 3) * 1000 + 500, y: (T.y0 + 1) * 1000 + 500, z: T.g + 1, faction: Faction.SALBATIC }, R)
  assert.ok(ostil.ok)
  const o = w.agents.count - 1
  let refuzuriCuMarfa = 0
  let lasate = 0
  let la = -1
  for (let t = 0; t < 600; t++) {
    w.agents.x[o] = (T.x0 + 3) * 1000 + 500
    w.agents.y[o] = (T.y0 + 1) * 1000 + 500
    w.agents.z[o] = T.g + 1
    // Refuzul si abandonul cad in ACELASI tick: marfa se numara dinainte.
    const caraInainte = w.agents.caraCantitate[p]!
    const r = ruleaza(w, 1)
    if (r.refuzuriDrum > 0 && caraInainte > 0) refuzuriCuMarfa += r.refuzuriDrum
    lasate += r.lasateLaPicioare
    if (w.ratiune.ridicariAbandonate === 1 || lasate > 0) { la = t; break }
  }
  assert.ok(la >= 0, 'fixtura: nici abandon, nici marfa lasata')
  assert.ok(refuzuriCuMarfa >= 1, 'fixtura: drumul spre B nu a fost refuzat cu marfa in mana')
  assert.equal(w.ratiune.ridicariAbandonate, 1, 'abandonul de pe drumul refuzat trebuie contorizat ca orice abandon')
  assert.equal(lasate, 1)
  assert.ok(esteEvitata(w, p, idB), 'sursa cu drumul refuzat se evita pe pereche')
  assert.equal(w.ratiune.zidiriCuManaGoala, 0)
  assert.equal(w.ratiune.itemePierdute, 0)
  void idA
})


test('a doua sursa moare sub constructor (contopire partiala): se retinteste, marfa ramane in mana', () => {
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 7)
  const idSantier = pereteLa(w, T.x0 + 6, T.y0 + 3)
  const idA = lasaItem(w, Item.PIATRA, 10, T.x0 + 1, T.y0 + 3)
  const idB = lasaItem(w, Item.PIATRA, 10, T.x0 + 3, T.y0 + 1)
  const idD = lasaItem(w, Item.PIATRA, 70, T.x0 + 4, T.y0 + 1)
  const idC = lasaItem(w, Item.PIATRA, 10, T.x0 + 3, T.y0 + 5)
  const p = pionLa(w, T.x0, T.y0 + 3)
  // D exista doar ca sa PRIMEASCA restul lui B la cadere; ca sursa ar fi luat
  // peretele intreg (70 ≥ 20, fara penalizare, cheie 6 < 11). Pionul il evita.
  evitaTinta(w, p, idD, w.tick + 100000)
  ruleaza(w, 5)
  pornestePe(w, p, idSantier, idA)
  const spreB = panaCand(w, 600, (w) => aDouaSursa(w, p) === idB)
  assert.ok(spreB >= 0, `fixtura: a doua sursa trebuia sa fie B (prima A=${idA}); acum tinta e ${w.agents.jobTarget[p]}`)
  // B cade (podeaua sapata, cu celula de dedesubt desemnata ca prima trecere s-o
  // sara): 5 se contopesc in D, restul pastreaza id-ul B cu mai putin decat avea.
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: T.x0 + 3, wy: T.y0 + 1, z: T.g - 1 }, R).ok)
  assert.ok(applyCommand(w, { kind: 'dig', wx: T.x0 + 3, wy: T.y0 + 1, z: T.g }, R).ok)
  const sB = slotItem(w.iteme, idB)
  assert.ok(sB !== -1 && w.iteme.cantitate[sB]! < 10, 'fixtura: B trebuia sa supravietuiasca cu mai putin')
  assert.equal(w.iteme.cantitate[slotItem(w.iteme, idD)], 75, 'fixtura: D trebuia sa primeasca restul')
  assert.equal(aDouaSursa(w, p), idC, 'constructorul trebuia retintit spre C, cu prima parte inca in mana')
  assert.equal(w.agents.caraCantitate[p], 10)
  assert.equal(lastJobReport().lasateLaPicioare, 0)
  const n = panaCand(w, 2000, (w) => santiereVii(w) === 0)
  assert.ok(n >= 0, 'peretele nu s-a ridicat dupa retintire')
  assert.equal(w.ratiune.itemePierdute, 0)
})

test('a doua sursa e in alta componenta: se sare fara niciun refuz de drum, si fara nicio urma pe pereche sau pe morman', () => {
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 7)
  const idSantier = pereteLa(w, T.x0 + 6, T.y0 + 3)
  const idA = lasaItem(w, Item.PIATRA, 10, T.x0 + 1, T.y0 + 3)
  const idB = lasaItem(w, Item.PIATRA, 10, T.x0 + 3, T.y0 + 1)
  const idC = lasaItem(w, Item.PIATRA, 10, T.x0 + 3, T.y0 + 5)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    for (const dz of [1, 2]) assert.ok(applyCommand(w, { kind: 'fill', wx: T.x0 + 3 + dx, wy: T.y0 + 1 + dy, z: T.g + dz, material: Material.PIATRA_CONSTRUITA }, R).ok)
  }
  const p = pionLa(w, T.x0, T.y0 + 3)
  ruleaza(w, 5)
  pornestePe(w, p, idSantier, idA)
  let refuzuri = 0
  let sursa2 = -1
  const n = panaCand(w, 2000, (w) => {
    refuzuri += lastJobReport().refuzuriDrum
    if (sursa2 === -1 && aDouaSursa(w, p) !== -1) sursa2 = aDouaSursa(w, p)
    return santiereVii(w) === 0
  })
  assert.ok(n >= 0, 'peretele nu s-a ridicat')
  assert.equal(sursa2, idC, 'a doua sursa trebuia sa fie C, nu mormanul sigilat')
  assert.equal(refuzuri, 0, 'pionul a plecat spre mormanul sigilat si a ars refuzuri de drum')
  // Niciun fel de stare pentru asta: mormanul de neatins nu e al pionului, atat.
  // Evitarea pe pereche (prima versiune) avea un inel de 4 sloturi drept singura
  // margine a buclei; racirea globala ar fi ascuns mormanul de toata colonia.
  assert.ok(!esteEvitata(w, p, idB), 'mormanul de neatins n-are voie sa fie evitat pe pereche: nu e o racire, e un filtru')
  assert.ok(w.iteme.reincercaLaTick[slotItem(w.iteme, idB)]! <= w.tick, 'mormanul de neatins a fost racit GLOBAL')
})

test('ostil pe a doua sursa: constructorul ia ALTA sursa, nu pleaca la santier cu mana goala', () => {
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 7)
  const idSantier = pereteLa(w, T.x0 + 6, T.y0 + 3)
  const idA = lasaItem(w, Item.PIATRA, 10, T.x0 + 1, T.y0 + 3)
  const idB = lasaItem(w, Item.PIATRA, 10, T.x0 + 3, T.y0 + 1)
  const idC = lasaItem(w, Item.PIATRA, 10, T.x0 + 3, T.y0 + 5)
  const p = pionLa(w, T.x0, T.y0 + 3)
  ruleaza(w, 5)
  pornestePe(w, p, idSantier, idA)
  const ostil = applyCommand(w, { kind: 'spawnAgent', x: (T.x0 + 3) * 1000 + 500, y: (T.y0 + 1) * 1000 + 500, z: T.g + 1, faction: Faction.SALBATIC }, R)
  assert.ok(ostil.ok)
  const o = w.agents.count - 1
  let refuzuriCuMarfa = 0
  let sursa2 = -1
  let sursa3 = -1
  let lasate = 0
  let n = -1
  for (let t = 0; t < 3000; t++) {
    w.agents.x[o] = (T.x0 + 3) * 1000 + 500
    w.agents.y[o] = (T.y0 + 1) * 1000 + 500
    w.agents.z[o] = T.g + 1
    const r = ruleaza(w, 1)
    if (r.refuzuriDrum > 0 && w.agents.caraCantitate[p]! > 0) refuzuriCuMarfa += r.refuzuriDrum
    lasate += r.lasateLaPicioare
    const s2 = aDouaSursa(w, p)
    if (sursa2 === -1 && s2 !== -1) sursa2 = s2
    if (sursa3 === -1 && s2 !== -1 && s2 !== sursa2) sursa3 = s2
    if (santiereVii(w) === 0) { n = t; break }
  }
  assert.notEqual(n, -1, 'peretele nu s-a ridicat')
  assert.equal(sursa2, idB, 'fixtura: a doua sursa aleasa intai trebuia sa fie B (cea cu ostilul)')
  assert.ok(refuzuriCuMarfa >= 1, 'fixtura: drumul spre B nu a fost refuzat cu marfa in mana')
  // Chiar ia ALTA sursa, cu marfa in mana — nu ajunge la perete prin marfa lasata
  // jos si o rescanare (recenzia din 25.09: testul trecea si fara sa mearga la C).
  assert.equal(sursa3, idC, `dupa refuz, a doua sursa trebuia sa devina C (${idC}), nu ${sursa3}`)
  assert.equal(lasate, 0, 'marfa din mana nu se lasa jos cand exista alta sursa')
  assert.equal(w.ratiune.ridicariAbandonate, 0)
  assert.equal(w.ratiune.zidiriCuManaGoala, 0)
  assert.equal(w.ratiune.itemePierdute, 0)
})

test('a doua sursa se alege dupa drumul curent → morman → santier, nu dupa cel mai apropiat de pion', () => {
  // Panoul a simulat regula „cel mai apropiat de celula curenta" pe 3000 de campuri:
  // 19% peste marginea de 2·dMin, pana la 12·dMin; cu santierul in cheie, 0.
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 7)
  const idSantier = pereteLa(w, T.x0 + 6, T.y0 + 3)
  const idA = lasaItem(w, Item.PIATRA, 10, T.x0 + 2, T.y0 + 3)
  const idB = lasaItem(w, Item.PIATRA, 10, T.x0, T.y0 + 3)      // in spatele lui A, mai aproape de A
  const idC = lasaItem(w, Item.PIATRA, 10, T.x0 + 4, T.y0 + 3)  // spre santier, la fel de departe de A
  const p = pionLa(w, T.x0 + 3, T.y0 + 3)
  ruleaza(w, 5)
  pornestePe(w, p, idSantier, idA)
  let sursa2 = -1
  const n = panaCand(w, 2000, (w) => {
    if (sursa2 === -1 && aDouaSursa(w, p) !== -1) sursa2 = aDouaSursa(w, p)
    return santiereVii(w) === 0
  })
  assert.ok(n >= 0)
  assert.equal(sursa2, idC, `a doua sursa trebuia sa fie C (spre santier), nu B=${idB} (in spate)`)
})

test('un morman de 10 la 3 celule pierde in fata unui morman de 20 la 5: o ridicare in plus costa cat mersul', () => {
  const { w, T } = scenaPlata([7, 12345, 12, 17, 18, 19, 23], 7)
  pereteLa(w, T.x0 + 6, T.y0 + 1)
  const id10 = lasaItem(w, Item.PIATRA, 10, T.x0 + 3, T.y0 + 3)
  const id20 = lasaItem(w, Item.PIATRA, 20, T.x0 + 5, T.y0 + 3)
  const p = pionLa(w, T.x0, T.y0 + 3)
  ruleaza(w, 5)
  // Sonda, intrebata direct din pozitia pionului: pana la prima lui scanare el
  // hoinareste, si „la 3 celule" ar deveni altceva.
  const m = rezumatMaterial(w, R, p)[Piesa.PERETE]!
  assert.ok(m.exista && m.slot !== -1, 'fixtura: sonda n-a gasit material')
  assert.equal(w.iteme.id[m.slot], id20, `a ales mormanul de 10 (${id10}) in loc de cel intreg`)
})

test('un morman sub prag nu e sursa: praful se lasa carausilor', () => {
  let scena: { w: World; wx: number; wy: number; g: number } | null = null
  for (const seed of [12345, 7, 12, 17, 18]) { try { scena = sitPlat(seed, 15); break } catch { /* alta samanta */ } }
  assert.ok(scena, 'fixtura: niciun sit plat de 15')
  const { w, wx, wy, g } = scena!
  const sant = applyCommand(w, { kind: 'desemneaza', wx: wx + 14, wy: wy + 9, z: g + 1, piesa: Piesa.PERETE }, R)
  assert.ok(sant.ok)
  const prag = pragRidicare(R, R.piese[Piesa.PERETE]!)
  const idPraf = lasaItem(w, Item.PIATRA, prag - 1, wx + 2, wy + 7)   // la o celula de pion
  const id20 = lasaItem(w, Item.PIATRA, 20, wx + 14, wy + 7)          // la 13 celule
  const p = pionLa(w, wx + 1, wy + 7)
  ruleaza(w, 5)
  const m = rezumatMaterial(w, R, p)[Piesa.PERETE]!
  assert.ok(m.exista && m.slot !== -1, 'fixtura: sonda n-a gasit material')
  assert.equal(w.iteme.id[m.slot], id20, `sonda a propus praful (${idPraf}) in loc de mormanul intreg`)
})

test('De ce nu? deosebeste „nu e destul" de „e destul, dar praf": LIPSA_MATERIAL cu detaliu NICIUNUL, respectiv MATERIAL_IMPRASTIAT', () => {
  const putin = santier(12345, Item.PIATRA, pragRidicare(R, R.piese[Piesa.PERETE]!))
  ruleaza(putin.w, 40)
  assert.equal(putin.w.desemnari.ultimulMotiv[putin.ds], codMotiv(Reason.LIPSA_MATERIAL), 'un singur morman de 10 nu ajunge pentru 20')
  assert.equal(putin.w.desemnari.ultimulMotivDetaliu[putin.ds], DetaliuMotiv.NICIUNUL)

  const praf = santier(12345, Item.PIATRA, 5)
  const { w, ds } = praf
  const px = w.iteme.wx[praf.is]!
  const py = w.iteme.wy[praf.is]!
  for (let k = 1; k <= 3; k++) lasaItem(w, Item.PIATRA, 5, px, py + k)
  ruleaza(w, 40)
  assert.equal(w.desemnari.ultimulMotiv[ds], codMotiv(Reason.LIPSA_MATERIAL))
  assert.equal(w.desemnari.ultimulMotivDetaliu[ds], DetaliuMotiv.MATERIAL_IMPRASTIAT, '20 de unitati in mormane de 5: destul, dar de la niciunul nu merita drumul')
  assert.equal(w.ratiune.unitatiZidite, 0)
})

test('SCARA cere 5, deci pragul ei e 5: porneste dintr-un morman de 5 lemn', () => {
  const { w, wx, wy, g } = sitPlat(12345, 11)
  const sant = applyCommand(w, { kind: 'desemneaza', wx: wx + 5, wy: wy + 5, z: g + 1, piesa: Piesa.SCARA }, R)
  assert.ok(sant.ok, JSON.stringify(sant))
  const idItem = lasaItem(w, Item.LEMN, R.piese[Piesa.SCARA]!.cantitate, wx + 1, wy + 5)
  const p = pionLa(w, wx + 2, wy + 5)
  const ds = slotDesemnare(w.desemnari, sant.ok ? sant.value : -1)
  const is = slotItem(w.iteme, idItem)
  assert.equal(pragRidicare(R, R.piese[Piesa.SCARA]!), R.piese[Piesa.SCARA]!.cantitate)
  assert.ok(pornesteConstruieste(w, R, p, ds, is).ok, 'scara nu porneste din singurul morman care o acopera intreg')
  assert.equal(w.agents.jobCantitate[p], R.piese[Piesa.SCARA]!.cantitate)
})

test('un morman cu prea putin LIBER nu e sursa, chiar daca are destul in el: 5 libere din 25 nu merita drumul', () => {
  // Cu `liber = 0` o sonda care s-ar uita la cat E in morman ar fi mascata de refuzul
  // cererilor de zero. Cu 5 libere (sub prag, dar peste zero) ar propune mormanul de
  // langa pion cu un count de 5, si jobul ar porni sub prag.
  let scena: { w: World; wx: number; wy: number; g: number } | null = null
  for (const seed of [12345, 7, 12, 17, 18]) { try { scena = sitPlat(seed, 15); break } catch { /* alta samanta */ } }
  assert.ok(scena, 'fixtura: niciun sit plat de 15')
  const { w, wx, wy, g } = scena!
  const idSantier = pereteLa(w, wx + 14, wy + 9)
  const idAproape = lasaItem(w, Item.PIATRA, 25, wx + 2, wy + 7)  // la o celula de al doilea pion
  const idDeparte = lasaItem(w, Item.PIATRA, 20, wx + 14, wy + 7) // la 13 celule
  const tine = pionLa(w, wx + 3, wy + 7)
  const p = pionLa(w, wx + 1, wy + 7)
  ruleaza(w, 5)
  pornestePe(w, tine, idSantier, idAproape)
  assert.equal(w.agents.jobCantitate[tine], R.piese[Piesa.PERETE]!.cantitate, 'fixtura: primul tine 20 din 25')
  const prag = pragRidicare(R, R.piese[Piesa.PERETE]!)
  assert.ok(25 - 20 < prag, 'fixtura: restul liber trebuie sa fie sub prag')
  void g
  const m = rezumatMaterial(w, R, p)[Piesa.PERETE]!
  assert.ok(m.exista && m.slot !== -1, 'fixtura: sonda n-a gasit material')
  assert.equal(w.iteme.id[m.slot], idDeparte, `sonda a propus mormanul cu 5 libere (${idAproape}) in loc de cel intreg`)
})

// ---------------------------------------------------------------------------
// costul nu creste cu numarul de mormane din lume (logistica, 3)
// ---------------------------------------------------------------------------

test('3000 de mormane: fara santiere, sonda de material nu face niciun pas', () => {
  // Masurat de panou pe codul dinainte: 42 µs/apel la 3000 de mormane, chemat la
  // fiecare scanare a fiecarui pion liber — cu 64 de pioni, tot bugetul de tick,
  // pentru o intrebare la care raspunsul era „niciun santier".
  const { w, sit, puse } = lume3000(12345)
  assert.ok(puse >= 2500, `fixtura: doar ${puse} mormane puse`)
  // O SAPATURA, departe: fara nicio desemnare scanarea iese din prima (`shouldSkip`)
  // si sonda n-ar fi atinsa oricum. Cu ea, scanarea merge pana la categoria de
  // construit, si acolo trebuie sa NU plateasca nimic.
  desemneaza(w, sit.wx + 35, sit.wy)
  const t = ruleaza(w, 200)
  assert.ok(t.scanari > 0, 'fixtura: nicio scanare')
  assert.ok(t.vizite > 0, 'fixtura: scanarea a iesit inainte de categorii')
  assert.equal(t.pasiRezumat, 0, `${t.pasiRezumat} pasi de sonda fara niciun santier`)
})

test('3000 de mormane: cu un santier de PIATRA, sonda parcurge doar mormanele de piatra', () => {
  const { w, sit, puse } = lume3000(12345, 3000, 20)
  assert.ok(puse >= 2500, `fixtura: doar ${puse} mormane puse`)
  let idSantier = -1
  // Dincolo de spirala de mormane (raza ~27 la 3020): pe o celula cu morman nu se deseneaza santier.
  for (let d = 30; d <= 45 && idSantier === -1; d++) {
    const g = solid(w, sit.wx + d, sit.wy)
    if (g === null) continue
    const r = applyCommand(w, { kind: 'desemneaza', wx: sit.wx + d, wy: sit.wy, z: g + 1, piesa: Piesa.PERETE }, R)
    if (r.ok) idSantier = r.value
  }
  assert.notEqual(idSantier, -1, 'fixtura: niciun santier')
  const piatra = indexZone(w, R).peFel[Item.PIATRA]!.length
  assert.ok(piatra >= 10 && piatra < 100, `fixtura: ${piatra} mormane de piatra`)
  const t = ruleaza(w, 120)
  assert.ok(t.scanari > 0 && t.pasiRezumat > 0, 'fixtura: sonda nu a rulat')
  assert.ok(t.pasiRezumat <= t.scanari * piatra, `${t.pasiRezumat} pasi in ${t.scanari} scanari, cu ${piatra} mormane de piatra: sonda a parcurs si pamantul`)
})
