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
import { fill, groundLevelM, materialAt } from '../src/sim/terrain/terrain.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { Reason } from '../src/sim/result.ts'
import { poateSustine, suportDacaZidesc, suportLa } from '../src/sim/stabilitate.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'
import { CATEGORII, Categorie, FelJob, Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { desemneaza, laSit, R, ruleaza, solidLaDistanta } from './fixturi.ts'
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
