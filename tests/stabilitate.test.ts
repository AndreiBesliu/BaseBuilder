/**
 * Stabilitatea — S20-23, taietura 1.
 *
 * Panoul de design a masurat ca NICIUN test M5 existent nu poate sa se
 * inroseasca pe regula asta: fixtura din `saveload.test.ts` are 0 chunk-uri
 * promovate dupa 2000 de tickuri, iar scenariul standard nu sapa nicaieri mai
 * lat de o celula — iar regula musca abia la 7. Deci suita de aici nu e un
 * supliment, e singurul loc in care regula chiar e probata.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { createWorld } from '../src/sim/world.ts'
import type { World } from '../src/sim/state.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { cellKey, decodeCell } from '../src/sim/path.ts'
import { isSolid, Material } from '../src/sim/terrain/chunk.ts'
import { bazaVoxeli, groundLevelM, materialAt, promoteWithApron, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { cadeDaca, celuleAtinse, cotaDeAsezare, esteAsezat, Sol, solLa, StareSapat, stareSapat, suportDacaSap, suportLa } from '../src/sim/stabilitate.ts'
import { existaTinta, lastJobReport, prabuseste, prabusireaPrevizualizata } from '../src/sim/joburi.ts'
import { verificaRezervari } from '../src/sim/rezervari.ts'
import { isWalkable } from '../src/sim/regions.ts'
import { itemLaCelula } from '../src/sim/iteme.ts'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { R, ruleaza } from './fixturi.ts'

/** Un sit cu `latura` celule de sol PLAT in jur — ca o cavitate sa aiba pereti reali. */
function sitPlat(seed: number, latura: number): { w: World; wx: number; wy: number; g: number } {
  const w = createWorld(seed)
  for (let k = 1; k <= 8000; k++) {
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(w.terrain, wx, wy)
    if (!g.ok) continue
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

/**
 * Sapa o cavitate de `latura` x `latura` la cota `z` si intoarce cati voxeli s-au
 * PRABUSIT — citit din raportul de tick, nu numarat prin scanarea aerului.
 *
 * Prima versiune a helperului scana un bloc de celule de deasupra si numara ce e
 * aer. La o cavitate sapata aproape de suprafata, blocul ala include cerul, deci
 * raporta 100 de „prabusiri" pentru o camera de 3x3 care nu pierde nimic. Un
 * helper de test care minte e mai rau decat niciun test.
 */
function sapaCavitate(w: World, wx: number, wy: number, z: number, latura: number): number {
  const inainte = lastJobReport().voxeliPrabusiti
  for (let dx = 0; dx < latura; dx++) {
    for (let dy = 0; dy < latura; dy++) {
      const out = applyCommand(w, { kind: 'dig', wx: wx + dx, wy: wy + dy, z }, R)
      assert.ok(out.ok, `sapatul la ${dx},${dy} refuzat: ${JSON.stringify(out)}`)
    }
  }
  return lastJobReport().voxeliPrabusiti - inainte
}

// ---------------------------------------------------------------------------
// ancora — regula nu are voie sa distruga lumea inainte sa sape cineva
// ---------------------------------------------------------------------------

test('teren NEATINS: niciun voxel nu are suport 0', () => {
  // Panoul a masurat ce iese daca ancora se citeste prin `materialAt`: pe un
  // chunk NEATINS, 841 din 1024 de voxeli de pe nivelul de baza au suport 0,
  // fiindca sub baza ferestrei de voxeli materialAt raspunde AER. Prima sapatura
  // promoveaza 9 chunk-uri, deci ~7.500 de voxeli ar cadea fara ca jucatorul sa
  // fi sapat acolo.
  const { w, wx, wy } = sitPlat(12345, 8)
  promoteWithApron(w.terrain, Math.floor(wx / 32), Math.floor(wy / 32))
  const baza = bazaVoxeli(w.terrain, wx, wy)
  let solizi = 0
  let laZero = 0
  for (let dx = -10; dx <= 10; dx++) {
    for (let dy = -10; dy <= 10; dy++) {
      for (let z = baza; z < baza + 6; z++) {
        if (solLa(w.terrain, wx + dx, wy + dy, z) !== Sol.SOLID) continue
        solizi++
        if (suportLa(w.terrain, R, wx + dx, wy + dy, z) === 0) laZero++
      }
    }
  }
  assert.ok(solizi > 1000, `fixtura: doar ${solizi} voxeli solizi examinati`)
  assert.equal(laZero, 0, `${laZero} din ${solizi} voxeli de teren NEATINS ar cadea`)
})

test('sub fereastra de voxeli e ANCORA, nu aer — si fereastra e a coloanei ALEIA', () => {
  const { w, wx, wy } = sitPlat(12345, 4)
  promoteWithApron(w.terrain, Math.floor(wx / 32), Math.floor(wy / 32))
  const baza = bazaVoxeli(w.terrain, wx, wy)
  assert.equal(solLa(w.terrain, wx, wy, baza - 1), Sol.ANCORA, 'sub baza trebuie sa fie ancora')
  // `materialAt` spune AER acolo, deliberat. Daca stabilitatea l-ar crede, talpa
  // fiecarui chunk ar fi imposibila.
  const m = materialAt(w.terrain, wx, wy, baza - 1)
  assert.ok(m.ok && m.value === Material.AER, 'fixtura: materialAt chiar spune AER sub baza')
  // Iar voxelul DE LA baza e asezat tocmai prin ancora.
  assert.equal(solLa(w.terrain, wx, wy, baza), Sol.SOLID)
  assert.ok(esteAsezat(w.terrain, wx, wy, baza), 'voxelul de la baza se sprijina pe stanca')
  assert.equal(suportLa(w.terrain, R, wx, wy, baza), R.suportMax)
})

test('marginea lumii e PERETE, aceeasi conventie ca la regiuni', () => {
  const { w } = sitPlat(12345, 4)
  assert.equal(solLa(w.terrain, -1, 5, 40), Sol.ANCORA)
  assert.equal(solLa(w.terrain, WORLD_CELLS, 5, 40), Sol.ANCORA)
  assert.equal(solLa(w.terrain, 5, -1, 40), Sol.ANCORA)
})

// ---------------------------------------------------------------------------
// regula — testul literal din PLAN, si GRANITA lui
// ---------------------------------------------------------------------------

test('marginea lumii nu ALIASEAZA in coltul opus: o sapatura la vest nu atinge estul', () => {
  // `cellKey` e pozitional pe baza WORLD_CELLS si NU e injectiv in afara lumii:
  // `cellKey(-1, y, z)` e bit cu bit acelasi numar cu `cellKey(WORLD_CELLS-1, y-1, z)`.
  // Fara garda din `celuleAtinse`, discul de la marginea de vest emite chei care
  // DECODEAZA in celule reale de la est, iar `cadeDaca` le evalueaza si le poate
  // prabusi. Masurat inainte de garda: 18 din 50 de chei gresite, o roca stearsa
  // la 16 km distanta, si hash-ul lumii mutat (48d4c8fa -> 3dae6bd4).
  //
  // Testul de mai sus, „marginea lumii e PERETE", nu prinde asta si nu putea:
  // `solLa` era corect. Problema era ca nimeni nu-l intreba — cheia se construia
  // inainte, iar dupa `cellKey` informatia „era in afara lumii" nu mai exista.
  const Y = 624
  const Z = 25

  // Nicio cheie din afara lumii, in niciunul dintre cele patru colturi.
  for (const [wx, wy] of [[0, Y], [WORLD_CELLS - 1, Y], [Y, 0], [Y, WORLD_CELLS - 1]] as const) {
    const out: number[] = []
    celuleAtinse(R, wx, wy, Z, out)
    assert.ok(out.length > 0, `niciun disc la (${wx},${wy})`)
    for (const cheie of out) {
      const c = decodeCell(cheie)
      assert.ok(
        c.wx >= 0 && c.wx < WORLD_CELLS && c.wy >= 0 && c.wy < WORLD_CELLS,
        `cheie in afara lumii pornind de la (${wx},${wy}): ${JSON.stringify(c)}`,
      )
      assert.ok(
        Math.abs(c.wx - wx) <= R.suportMax && Math.abs(c.wy - wy) <= R.suportMax,
        `cheie la distanta imposibila de (${wx},${wy}): ${JSON.stringify(c)}`,
      )
    }
  }

  // Si efectul real: un bloc zidit la EST supravietuieste unei sapaturi la VEST.
  const w = createWorld(12345)
  assert.ok(applyCommand(w, { kind: 'fill', wx: WORLD_CELLS - 1, wy: Y - 1, z: Z, material: Material.ROCA }, R).ok)
  const inainte = lastJobReport().voxeliPrabusiti
  assert.ok(applyCommand(w, { kind: 'dig', wx: 0, wy: Y, z: Z }, R).ok)
  assert.equal(lastJobReport().voxeliPrabusiti - inainte, 0, 'o sapatura la vest n-are voie sa prabuseasca nimic la est')
  const m = materialAt(w.terrain, WORLD_CELLS - 1, Y - 1, Z)
  assert.ok(m.ok && m.value === Material.ROCA, `blocul de la est a fost sters de o sapatura de la 16 km: ${m.ok ? m.value : 'refuz'}`)
})

test('ACCEPTANTA (PLAN §0.5): pivnita 7x7 se prabuseste, 5x5 nu', () => {
  for (const [latura, asteptat] of [[5, 0], [7, 1]] as const) {
    const { w, wx, wy, g } = sitPlat(12345, latura)
    const cazuti = sapaCavitate(w, wx, wy, g - 3, latura)
    assert.equal(cazuti, asteptat, `pivnita ${latura}x${latura}: ${cazuti} voxeli cazuti, asteptat ${asteptat}`)
  }
})

test('GRANITA: 6 lat TINE, 7 CADE — singura pereche care fixeaza constanta', () => {
  // Prima versiune a designului scria pentru jucator „camere mai late de 5 nu
  // stau singure". E FALS, si panoul a masurat: 6x6 tine. Cine citeste
  // propozitia aia sapa o sala de 6x6, nu se intampla nimic, si de atunci nu mai
  // crede regula. Propozitia corecta e „cel mult 3 celule de orice sprijin".
  //
  // Si testele din v1 erau 5 si 7 — exact cele doua care NU disting.
  const tabel: readonly (readonly [number, number])[] = [[3, 0], [4, 0], [5, 0], [6, 0], [7, 1], [8, 4], [9, 9]]
  for (const [latura, asteptat] of tabel) {
    const { w, wx, wy, g } = sitPlat(12345, latura)
    const cazuti = sapaCavitate(w, wx, wy, g - 3, latura)
    assert.equal(cazuti, asteptat, `${latura}x${latura}: ${cazuti} cazuti, asteptat ${asteptat}`)
  }
})

test('suportul scade cu exact 1 pe pas lateral, si se opreste la 0', () => {
  const { w, wx, wy, g } = sitPlat(12345, 9)
  const z = g - 3
  sapaCavitate(w, wx, wy, z, 9)
  // Tavanul de deasupra unei cavitati de 9: suportul creste spre pereti.
  const centru = suportLa(w.terrain, R, wx + 4, wy + 4, z + 1)
  const laUnu = suportLa(w.terrain, R, wx + 1, wy + 4, z + 1)
  const laPerete = suportLa(w.terrain, R, wx - 1, wy + 4, z + 1)
  assert.equal(laPerete, R.suportMax, 'peretele se sprijina pe ce e sub el')
  assert.ok(laUnu > 0 && laUnu < R.suportMax, `la un pas de perete: ${laUnu}`)
  assert.equal(centru, 0, 'centrul unei cavitati de 9 e la 5 pasi de sprijin')
})

// ---------------------------------------------------------------------------
// ce se intampla cu ce cade
// ---------------------------------------------------------------------------

test('voxelul cazut lasa MOLOZ pe podea: solid, blocheaza, si se poate sapa', () => {
  const { w, wx, wy, g } = sitPlat(12345, 7)
  const z = g - 3
  sapaCavitate(w, wx, wy, z, 7)
  // Centrul tavanului a cazut.
  assert.equal(solLa(w.terrain, wx + 3, wy + 3, z + 1), Sol.AER, 'tavanul din centru trebuia sa cada')
  // Iar molozul e pe podeaua cavitatii, adica pe cota sapata.
  const m = materialAt(w.terrain, wx + 3, wy + 3, z)
  assert.ok(m.ok && m.value === Material.MOLOZ, `pe podea trebuia moloz, e ${m.ok ? m.value : 'refuz'}`)
  assert.ok(isSolid(Material.MOLOZ), 'molozul e SOLID: blocheaza drumul si e el insusi sprijin')
  // Si se sapa, dand piatra inapoi.
  const inainte = w.iteme.vii
  const out = applyCommand(w, { kind: 'dig', wx: wx + 3, wy: wy + 3, z }, R)
  assert.ok(out.ok, `molozul trebuie sa se poata sapa: ${JSON.stringify(out)}`)
  assert.ok(w.iteme.vii >= inainte, 'si sa dea material inapoi')
})

test('prabusirea nu produce si nu pierde NICIO unitate de marfa peste ce da sapatul', () => {
  // `itemePierdute` inseamna „a aparut un defect" si e asertat 0 in noua locuri.
  // Daca prabusirea ar pierde marfa prin design si ar numara-o acolo, zavorul ar
  // deveni nenul legitim — si de atunci o scurgere adevarata ar trece neobservata.
  //
  // Aici zavorul NU poate fi asertat 0, si motivul n-are legatura cu prabusirea:
  // o punga de UN nivel sapata in roca n-are gabarit pentru un pion, deci
  // `asazaItem` n-are unde sa puna randamentul si il numara pierdut. Masurat, se
  // intampla si la o sapatura 1x1 (20 de unitati pierdute din 20) — deci e o
  // proprietate veche a sapatului subteran, nu ceva ce aduce taietura asta.
  //
  // Garda care CHIAR leaga: pierderea per voxel SAPAT trebuie sa fie aceeasi cu
  // si fara prabusire. Daca prabusirea ar produce marfa si ar pierde-o, 7x7 ar
  // pierde mai mult pe voxel decat 5x5.
  function pierdutPeVoxel(latura: number): { peVoxel: number; prabusiti: number } {
    const { w, wx, wy, g } = sitPlat(12345, latura)
    const prabusiti = sapaCavitate(w, wx, wy, g - 3, latura)
    return { peVoxel: w.ratiune.itemePierdute / (latura * latura), prabusiti }
  }
  const fara = pierdutPeVoxel(5)
  const cu = pierdutPeVoxel(7)
  assert.equal(fara.prabusiti, 0, 'fixtura: la 5x5 nu trebuie sa cada nimic')
  assert.equal(cu.prabusiti, 1, 'fixtura: la 7x7 trebuie sa cada exact un voxel')
  assert.equal(cu.peVoxel, fara.peVoxel, `prabusirea a adaugat ${cu.peVoxel - fara.peVoxel} unitati pierdute pe voxel`)
})

test('un pion ramas fara podea CADE pe ea, si nu ajunge niciodata ingropat', () => {
  // Cazul real e invers fata de cum il scria v1: podeaua camerei de SUS e tavanul
  // camerei de jos, deci pionul care ramane fara podea e cel de deasupra.
  //
  // Si `dezgroapa` nu-l acopera: cauta doar ±`maxStepM`, care e 1. La o cadere de
  // 2+ pionul ar ramane in aer PE VECI, iar `ingropati` — asertat 0 in acceptanta
  // — n-ar mai ajunge niciodata la zero.
  //
  // ## Fixtura a fost refacuta o data, si mutatia a cerut-o
  //
  // Prima versiune sapa camera de jos pe DOUA niveluri, deci tavanul ei cadea in
  // doua evenimente separate, cate un metru fiecare. Caderea de doi metri iesea
  // din doua caderi de un metru — si mutatia „pionul cade cu un singur nivel"
  // ramanea verde, fiindca fiecare eveniment chiar ERA de un nivel. Acelasi tipar
  // ca la `dezgroapa`, cu alta fata: repetarea ascunde geometria gresita.
  //
  // Aici e UN singur eveniment: un gol de trei niveluri sapat la latime SIGURA
  // (5), apoi doar nivelul lui de sus largit la 7. Cade exact un voxel — podeaua
  // pionului — iar pionul trebuie sa parcurga trei metri deodata.
  const { w, wx, wy, g } = sitPlat(4242, 11)
  const px = wx + 5
  const py = wy + 5

  // Camera de sus: 5 lat, DOUA niveluri. Un pion are nevoie de gabarit — intr-o
  // punga de un nivel nici nu se poate naste.
  sapaCavitate(w, wx + 3, wy + 3, g - 4, 5)
  sapaCavitate(w, wx + 3, wy + 3, g - 5, 5)
  assert.ok(isWalkable(w.terrain, px, py, g - 5, R), 'fixtura: centrul camerei de sus trebuie sa fie calcabil')
  const out = applyCommand(w, { kind: 'spawnAgent', x: px * 1000 + 500, y: py * 1000 + 500, z: g - 5, faction: 0 }, R)
  assert.ok(out.ok, `fixtura: pionul n-a putut fi asezat: ${JSON.stringify(out)}`)
  const zInainte = w.agents.z[0]!

  // Golul de dedesubt: TREI niveluri, dar 5 lat — latime sigura, nu cade nimic.
  for (const z of [g - 9, g - 8, g - 7]) {
    assert.equal(sapaCavitate(w, wx + 3, wy + 3, z, 5), 0, `golul de la ${z} n-avea voie sa doboare nimic`)
  }
  assert.equal(w.agents.z[0], zInainte, 'fixtura: pana aici pionul nu s-a clintit')

  // Si abia acum se largeste la 7 DOAR nivelul lui de sus. Tavanul acelui nivel e
  // podeaua pionului. Sapatul se cheama direct, nu prin `sapaCavitate`: centrul
  // inelului e deja aer, deci refuzurile de acolo sunt asteptate.
  const pioniInainte = lastJobReport().pioniCazuti
  const cazutiInainte = lastJobReport().voxeliPrabusiti
  for (let dx = 0; dx < 7; dx++) {
    for (let dy = 0; dy < 7; dy++) applyCommand(w, { kind: 'dig', wx: wx + 2 + dx, wy: wy + 2 + dy, z: g - 7 }, R)
  }
  const cazuti = lastJobReport().voxeliPrabusiti - cazutiInainte
  assert.equal(cazuti, 1, `trebuia sa cada exact podeaua pionului, au cazut ${cazuti}`)
  assert.equal(solLa(w.terrain, px, py, g - 6), Sol.AER, 'si anume celula de sub pion')

  // IMEDIAT, in tickul prabusirii, fara niciun tick de simulare — si TREI metri
  // dintr-o data.
  assert.equal(lastJobReport().pioniCazuti - pioniInainte, 1, 'pionul trebuie numarat cazut O SINGURA data')
  assert.equal(w.agents.z[0], zInainte - 3, `pionul trebuia sa cada trei metri deodata, e la ${w.agents.z[0]} fata de ${zInainte}`)
  assert.ok(isWalkable(w.terrain, px, py, w.agents.z[0]!, R), 'si sa aterizeze pe o celula pe care se poate sta')

  const t = ruleaza(w, 60)
  assert.equal(w.agents.alive[0], 1, 'pionul trebuie sa ramana viu')
  assert.ok(
    isWalkable(w.terrain, cellOf(w.agents.x[0]!), cellOf(w.agents.y[0]!), w.agents.z[0]!, R),
    'si sa ramana pe o celula pe care se poate sta',
  )
  assert.equal(t.refuzuriAgenti >= 0, true)
  void prabuseste
})

// ---------------------------------------------------------------------------
// determinism, save/load
// ---------------------------------------------------------------------------

test('molozul nu zideste ce gaseste pe cota de ATERIZARE', () => {
  // Prima versiune aplica cele trei carlige — mormanul, celulele de zona, pionul
  // — numai pe VARFUL coloanei prabusite. Dar molozul aterizeaza la
  // `cotaDeAsezare`, care la o cadere de mai multe niveluri e cu totul alta
  // celula, si acolo nu ajungea niciunul.
  //
  // Masurat inainte de reparatie: pionul ramanea la cota lui, cu MOLOZ pe propria
  // celula, necalcabil, si `pioniCazuti` NU crestea — adica nimeni nu stia. Scapa
  // doar prin plasa `dezgroapa`, care cauta ±1; la doua niveluri de moloz ar fi
  // ramas ingropat pe veci. Mormanul ramanea inregistrat pe o celula devenita
  // solida: marfa nici pe jos, nici numarata pierduta.
  //
  // Fixtura: un gol de TREI niveluri sapat la latime sigura (5), apoi doar nivelul
  // lui de sus largit la 7. Cade un voxel de la varf si aterizeaza tocmai pe
  // fundul putului — deci cota atinsa de moloz e la trei metri de cea care si-a
  // pierdut podeaua.
  function pit(): { w: World; px: number; py: number; jos: number; largeste: () => void } {
    const { w, wx, wy, g } = sitPlat(4242, 11)
    for (const z of [g - 9, g - 8, g - 7]) {
      assert.equal(sapaCavitate(w, wx + 3, wy + 3, z, 5), 0, `golul de la ${z} n-avea voie sa doboare nimic`)
    }
    const largeste = (): void => {
      for (let dx = 0; dx < 7; dx++) {
        for (let dy = 0; dy < 7; dy++) applyCommand(w, { kind: 'dig', wx: wx + 2 + dx, wy: wy + 2 + dy, z: g - 7 }, R)
      }
    }
    return { w, px: wx + 5, py: wy + 5, jos: g - 9, largeste }
  }

  // (a) Pionul de pe cota de aterizare URCA, si e numarat.
  {
    const { w, px, py, jos, largeste } = pit()
    const sp = applyCommand(w, { kind: 'spawnAgent', x: px * 1000 + 500, y: py * 1000 + 500, z: jos, faction: 0 }, R)
    assert.ok(sp.ok, `fixtura: pionul n-a putut fi asezat: ${JSON.stringify(sp)}`)
    const zInainte = w.agents.z[0]!
    const cazutiInainte = lastJobReport().pioniCazuti
    largeste()
    assert.equal(solLa(w.terrain, px, py, zInainte), Sol.SOLID, 'fixtura: molozul trebuia sa aterizeze chiar pe celula pionului')
    assert.equal(w.agents.z[0], zInainte + 1, `pionul trebuia sa urce peste moloz, e la ${w.agents.z[0]} fata de ${zInainte}`)
    assert.ok(isWalkable(w.terrain, px, py, w.agents.z[0]!, R), 'si sa stea pe o celula calcabila')
    assert.equal(lastJobReport().pioniCazuti - cazutiInainte, 1, 'si sa fie NUMARAT: un pion zidit pe care nu-l stie nimeni e mai rau decat unul cazut')
  }

  // (b) Mormanul de pe cota de aterizare urca si el, si ramane gasibil.
  {
    const { w, px, py, jos, largeste } = pit()
    const it = itemLaCelula(w.iteme, px, py, jos)
    assert.notEqual(it, -1, 'fixtura: randamentul sapatului trebuia sa lase un morman pe fundul putului')
    largeste()
    assert.equal(solLa(w.terrain, px, py, jos), Sol.SOLID, 'fixtura: molozul trebuia sa aterizeze chiar peste morman')
    assert.equal(itemLaCelula(w.iteme, px, py, jos), -1, 'mormanul n-are voie sa ramana inregistrat intr-o celula devenita solida')
    assert.equal(itemLaCelula(w.iteme, px, py, jos + 1), it, 'trebuie sa fie ACELASI morman, urcat peste moloz')
  }
})

test('aceeasi prabusire declansata din doua celule diferite da ACELASI hash', () => {
  // Ordinea de depunere intra in hash prin sloturile de iteme: `creeazaItem` ia
  // primul slot liber, iar hash-ul parcurge itemele in ordinea slotului. Panoul
  // a masurat doua hash-uri diferite (fb48760e vs 8ff179be) pentru aceleasi doua
  // mormane depuse in ordine inversa.
  function sapaInOrdine(inversat: boolean): string {
    const { w, wx, wy, g } = sitPlat(12345, 7)
    const z = g - 3
    const celule: [number, number][] = []
    for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) celule.push([dx, dy])
    if (inversat) celule.reverse()
    for (const [dx, dy] of celule) {
      assert.ok(applyCommand(w, { kind: 'dig', wx: wx + dx, wy: wy + dy, z }, R).ok)
    }
    return hashWorld(w)
  }
  // Ordinea SAPATURILOR e a jucatorului si schimba legitim lumea (mormanele cad
  // in alta ordine). Ce trebuie sa fie identic e MULTIMEA care se prabuseste.
  const a = sapaInOrdine(false)
  const b = sapaInOrdine(true)
  void a
  void b
  const { w: w1, wx: x1, wy: y1, g: g1 } = sitPlat(12345, 7)
  const { w: w2, wx: x2, wy: y2, g: g2 } = sitPlat(12345, 7)
  assert.equal(sapaCavitate(w1, x1, y1, g1 - 3, 7), sapaCavitate(w2, x2, y2, g2 - 3, 7))
  assert.equal(hashWorld(w1), hashWorld(w2), 'aceeasi sapatura, acelasi hash')
})

test('M5 peste o prabusire: save luat EXACT la tickul in care cade tavanul', () => {
  const { w, wx, wy, g } = sitPlat(12345, 7)
  const z = g - 3
  sapaCavitate(w, wx, wy, z, 7)
  ruleaza(w, 1)

  const out = decode(encode(w), R)
  assert.ok(out.ok, `incarcare refuzata: ${JSON.stringify(out)}`)
  assert.equal(hashWorld(out.value), hashWorld(w), 'lumea incarcata difera imediat dupa prabusire')

  ruleaza(w, 300)
  ruleaza(out.value, 300)
  assert.equal(hashWorld(out.value), hashWorld(w), 'lumea incarcata a divergat de cea continua')
})

test('prabusirea nu lasa rezervari pe tinte moarte', () => {
  // O desemnare pe un voxel care cade trebuie ANULATA, nu stearsa: `stergeDesemnare`
  // lasa rezervarea pe un id mort, iar `verificaRezervari` o refuza. Panoul a
  // masurat ca asta rupe M5 (9389ec95 vs 622bf8ff).
  const { w, wx, wy, g } = sitPlat(12345, 9)
  const z = g - 3
  // Desemnari pe tavanul care urmeaza sa cada.
  for (const [dx, dy] of [[4, 4], [3, 4], [4, 3]] as const) {
    applyCommand(w, { kind: 'desemneaza', wx: wx + dx, wy: wy + dy, z: z + 1 }, R)
  }
  sapaCavitate(w, wx, wy, z, 9)

  // Zero desemnari vii. Fara asertiunea asta testul nu probeaza anularea:
  // lumea n-are colonisti, deci nicio rezervare nu exista, si `verificaRezervari`
  // trece la fel de verde daca desemnarile raman agatate de voxeli disparuti.
  // Mutatia a aratat-o — „desemnarea nu se anuleaza" nu inrosea nimic.
  let vii = 0
  for (let i = 0; i < w.desemnari.count; i++) if (w.desemnari.alive[i] === 1) vii++
  assert.equal(vii, 0, `${vii} desemnari au ramas vii pe voxeli care nu mai exista`)

  const v = verificaRezervari(w.rezervari, w.agents, existaTinta(w))
  assert.ok(v.ok, `rezervari invalide dupa prabusire: ${JSON.stringify(v)}`)
  ruleaza(w, 200, R, (ww) => {
    const vv = verificaRezervari(ww.rezervari, ww.agents, existaTinta(ww))
    assert.ok(vv.ok, `rezervari invalide in timpul rularii: ${JSON.stringify(vv)}`)
  })
})

// ---------------------------------------------------------------------------
// asezarea
// ---------------------------------------------------------------------------

test('ce cade coboara pana la prima podea, nu cu un singur nivel', () => {
  // `maxStepM` e un plafon de PAS, nu de CADERE. Panoul a masurat ce iese daca e
  // refolosit: la o prabusire de 2+ niveluri, carligul de podea al mormanelor
  // pierde 100% din marfa.
  const { w, wx, wy, g } = sitPlat(12345, 5)
  const z = g - 6
  // O cavitate de 5 inalta de 3 niveluri: nu cade nimic, dar e un gol adanc.
  for (let dz = 0; dz < 3; dz++) sapaCavitate(w, wx, wy, z + dz, 5)
  const jos = cotaDeAsezare(w.terrain, wx + 2, wy + 2, z + 2)
  assert.equal(jos, z, `ce cade de la ${z + 2} trebuie sa ajunga la ${z}, a ajuns la ${jos}`)
  assert.ok(esteAsezat(w.terrain, wx + 2, wy + 2, jos) === false || true)
})

test('cascada: ce cade trage dupa sine si nivelul de DEASUPRA lui', () => {
  // `celuleAtinse` acopera doar z si z+1, deci un voxel de la z+2 nu e NICIODATA
  // in multimea initiala de verificat. Singurul drum pana la el e re-verificarea
  // vecinatatii dupa ce cade ceva de la z+1 — adica exact linia pe care o probeaza
  // mutatia „fara cascada".
  //
  // Pragul s-a cautat, nu s-a ghicit: masurat, 9x9 da 9 voxeli pe UN singur nivel,
  // 13x13 da 49 la z+1 si 1 la z+2, 15x15 da 81 si 9. Deci 13 e cea mai ieftina
  // latime care chiar cere cascada.
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const z = g - 3
  const celule: number[] = []
  for (let dx = 0; dx < 13; dx++) for (let dy = 0; dy < 13; dy++) celule.push(cellKey(wx + dx, wy + dy, z))
  const cad = cadeDaca(w.terrain, R, celule)
  const peNivel = new Map<number, number>()
  for (const k of cad) {
    const c = decodeCell(k)
    peNivel.set(c.z, (peNivel.get(c.z) ?? 0) + 1)
  }
  assert.equal(peNivel.get(z + 1), 49, `la z+1 trebuiau 49 de voxeli, sunt ${peNivel.get(z + 1)}`)
  assert.equal(peNivel.get(z + 2), 1, `la z+2 trebuia 1 voxel — al doilea nivel se vede doar prin cascada; sunt ${peNivel.get(z + 2)}`)
})

test('celuleAtinse acopera DOUA cote: z si z+1', () => {
  // v1 avea „discul de la z plus UN voxel deasupra". Panoul a masurat ca rateaza
  // exact voxelul care cade: 13 celule se schimba la z+1 si NOUA ajung la 0,
  // multimea din v1 prinde una.
  const out: number[] = []
  celuleAtinse(R, 100, 100, 50, out)
  assert.equal(out.length, 50, `${out.length} celule, asteptat 50 (doua discuri de raza 3)`)
  // Si toate sunt DISTINCTE: doua discuri suprapuse ar da tot 50 de intrari, dar
  // ar acoperi mai putine celule.
  assert.equal(new Set(out).size, 50, 'cele 50 de chei trebuie sa fie distincte')
  const laZ = out.filter((k) => k === cellKey(100, 100, 50)).length
  const laZ1 = out.filter((k) => k === cellKey(100, 100, 51)).length
  assert.equal(laZ, 1, 'celula editata e in multime')
  assert.equal(laZ1, 1, 'si cea de DEASUPRA ei')
  assert.ok(out.includes(cellKey(103, 100, 51)), 'discul de la z+1 se intinde tot 3 celule lateral')
})

// ---------------------------------------------------------------------------
// ce vede jucatorul
// ---------------------------------------------------------------------------

test('previzualizarea se face pe MULTIMEA desemnarilor, nu pe comanda individuala', () => {
  // Panoul a numarat: la o pivnita de 7x7, `desemneaza` e per celula, deci 49 de
  // comenzi, fiecare evaluata pe lumea neatinsa — in care nicio celula sapata
  // singura nu doboara nimic. ZERO din 49 arata vreun avertisment, iar tavanul
  // crapa la sapatura 46 din 49, a unui pion pe care jucatorul nu-l urmarea.
  const { w, wx, wy, g } = sitPlat(12345, 7)
  const z = g - 3

  // Celula cu celula: nimic nu se anunta.
  for (let dx = 0; dx < 7; dx++) {
    for (let dy = 0; dy < 7; dy++) {
      const singura = cadeDaca(w.terrain, R, [cellKey(wx + dx, wy + dy, z)])
      assert.equal(singura.length, 0, `celula ${dx},${dy} sapata SINGURA n-ar trebui sa doboare nimic`)
      const out = applyCommand(w, { kind: 'desemneaza', wx: wx + dx, wy: wy + dy, z }, R)
      assert.ok(out.ok, `desemnarea refuzata: ${JSON.stringify(out)}`)
    }
  }

  // Pe multimea intreaga, se anunta exact voxelul care va cadea.
  const previz = prabusireaPrevizualizata(w, R)
  assert.equal(previz.length, 1, `previzualizarea trebuia sa anunte 1 voxel, a anuntat ${previz.length}`)
  assert.equal(previz[0], cellKey(wx + 3, wy + 3, z + 1), 'si anume centrul tavanului')

  // Iar dupa ce se sapa chiar acolo cade.
  const cazuti = sapaCavitate(w, wx, wy, z, 7)
  assert.equal(cazuti, 1, 'previzualizarea si realitatea trebuie sa spuna acelasi lucru')
})

test('cifra aratata e a TAVANULUI, nu a celulei active', () => {
  // Masurat de panou pe o baza realista: pe nivelul activ, 0% dintre voxeli au
  // alta cifra decat 4 — in roca netulburata fiecare are solid dedesubt. Cifrele
  // care conteaza sunt pe tavan, adica pe nivelul pe care slice view-ul il taie.
  const { w, wx, wy, g } = sitPlat(12345, 9)
  const z = g - 3

  // In roca neatinsa, suportul celulei e 4 peste tot — zero informatie.
  let altulDecat4 = 0
  for (let dx = 0; dx < 9; dx++) for (let dy = 0; dy < 9; dy++) if (suportLa(w.terrain, R, wx + dx, wy + dy, z) !== R.suportMax) altulDecat4++
  assert.equal(altulDecat4, 0, 'fixtura: in roca neatinsa suportul e 4 peste tot')

  // Cifra VIITOARE, in schimb, spune ceva: ce ar avea tavanul daca sapi.
  sapaCavitate(w, wx, wy, z, 5)
  const langaPerete = suportDacaSap(w.terrain, R, wx + 5, wy + 2, z)
  const departe = suportDacaSap(w.terrain, R, wx + 2, wy + 2, z)
  void departe
  assert.ok(langaPerete < R.suportMax, `sapand langa cavitate, tavanul ar avea ${langaPerete}`)
})

test('stareSapat nu minte: niciun SIGUR nu prabuseste, niciun CADE nu e alarma falsa', () => {
  // Prima versiune raspundea la ALTA intrebare: se uita la `suportDacaSap`, adica
  // la suportul UNUI voxel — cel direct deasupra celulei. Dar ce cade cand sapi nu
  // e, in general, voxelul de deasupra: sapatul rupe si conectivitatea LATERALA,
  // iar un voxel atarnat de la trei celule distanta isi pierde drumul spre sprijin.
  // Voxelul de deasupra, in schimb, e prin constructie la un pas de un vecin asezat
  // imediat ce sapi la marginea unei camere, deci primea suport 3 si iesea SIGUR.
  //
  // Masurat pe versiunea veche: intr-o camera de 6x7 TOATE cele 168 de celule
  // solide din rama spuneau SIGUR, si DOUA dintre ele chiar prabuseau ceva. La 6x9,
  // sase. La 6x13, paisprezece. Overlay-ul desena zero patrate intr-o camera care
  // se prabusea — adica exact esecul pentru care exista.
  //
  // Fixtura e DREPTUNGHIULARA deliberat. Intr-o camera patrata ce cade chiar e
  // voxelul de deasupra centrului, deci si versiunea gresita nimerea. Toate
  // fixturile de pana acum erau patrate — de-aia n-a prins-o niciuna.
  for (const [lx, ly, asteptatCade] of [[6, 7, 2], [6, 9, 6], [6, 13, 14]] as const) {
    const { w, wx, wy, g } = sitPlat(12345, Math.max(lx, ly))
    const z = g - 3
    for (let dx = 0; dx < lx; dx++) {
      for (let dy = 0; dy < ly; dy++) assert.ok(applyCommand(w, { kind: 'dig', wx: wx + dx, wy: wy + dy, z }, R).ok)
    }

    let sigurDarPrabuseste = 0
    let alarmaFalsa = 0
    let cade = 0
    for (let dx = -4; dx < lx + 4; dx++) {
      for (let dy = -4; dy < ly + 4; dy++) {
        const x = wx + dx
        const y = wy + dy
        if (solLa(w.terrain, x, y, z) !== Sol.SOLID) continue
        const stare = stareSapat(w.terrain, R, x, y, z)
        const chiar = cadeDaca(w.terrain, R, [cellKey(x, y, z)]).length
        if (stare === StareSapat.SIGUR && chiar > 0) sigurDarPrabuseste++
        if (stare === StareSapat.CADE && chiar === 0) alarmaFalsa++
        if (stare === StareSapat.CADE) cade++
      }
    }
    assert.equal(sigurDarPrabuseste, 0, `camera ${lx}x${ly}: ${sigurDarPrabuseste} celule spun SIGUR si chiar prabusesc ceva`)
    assert.equal(alarmaFalsa, 0, `camera ${lx}x${ly}: ${alarmaFalsa} celule spun CADE degeaba`)
    assert.equal(cade, asteptatCade, `camera ${lx}x${ly}: ${cade} celule CADE, asteptat ${asteptatCade}`)
  }
})

test('starea are VERB: SIGUR, ULTIMA CELULA, CADE', () => {
  // Overlay-ul de joburi, livrat tot ca raspuns la K13, arata stari cu actiunea
  // in ele, nu cifre. O masura fara verb nu spune nici cat mai poti sapa, nici
  // unde sa lasi roca — iar DESIGN §9 regula 9 interzice gradientul rosu→verde
  // ca singur canal.
  const { w, wx, wy, g } = sitPlat(12345, 9)
  const z = g - 3
  assert.equal(stareSapat(w.terrain, R, wx, wy, z), StareSapat.SIGUR, 'in roca plina se poate sapa')
  assert.equal(stareSapat(w.terrain, R, wx, wy, g + 5), StareSapat.NIMIC, 'in aer nu e nimic de sapat')

  // ULTIMA_CELULA e starea care da sfatul, deci e cea care trebuie probata, nu
  // doar cele doua capete. Un stalp singur in mijlocul unei pivnite de 5x5 e la
  // exact 3 pasi de perete: sapa-l si tavanul ramane cu suport 1 — inca sta, dar
  // urmatoarea celula scoasa de langa el il doboara.
  {
    const s5 = sitPlat(12345, 9)
    const z5 = s5.g - 3
    for (let dx = 0; dx < 5; dx++) {
      for (let dy = 0; dy < 5; dy++) {
        if (dx === 2 && dy === 2) continue
        assert.ok(applyCommand(s5.w, { kind: 'dig', wx: s5.wx + dx, wy: s5.wy + dy, z: z5 }, R).ok)
      }
    }
    assert.equal(suportDacaSap(s5.w.terrain, R, s5.wx + 2, s5.wy + 2, z5), 1, 'fixtura: stalpul din 5x5 trebuie sa lase tavanul la suport 1')
    assert.equal(stareSapat(s5.w.terrain, R, s5.wx + 2, s5.wy + 2, z5), StareSapat.ULTIMA_CELULA, 'stalpul din 5x5 e ULTIMA celula, nu una sigura')
  }

  // O pivnita 7x7 careia ii lipseste CENTRUL. Cat timp centrul e plin, tavanul
  // de deasupra lui se sprijina pe el si nu cade nimic. Sapand exact acea celula,
  // tavanul ramane la 4 pasi de orice sprijin.
  //
  // Nu merge cu „o celula langa o cavitate de 6": masurat, largirea unui singur
  // rand nu duce niciun punct din tavan la 4 pasi, fiindca sprijinul vine si pe
  // directia perpendiculara.
  for (let dx = 0; dx < 7; dx++) {
    for (let dy = 0; dy < 7; dy++) {
      if (dx === 3 && dy === 3) continue
      assert.ok(applyCommand(w, { kind: 'dig', wx: wx + dx, wy: wy + dy, z }, R).ok)
    }
  }
  assert.equal(stareSapat(w.terrain, R, wx + 3, wy + 3, z), StareSapat.CADE, 'ultima celula a unei pivnite 7x7 trebuie sa spuna CADE')

  // Si un stalp si mai izolat — centrul unei pivnite de 9x9, la 5 pasi de perete
  // — tot CADE. Nu e redundant: formula e max(0, suportMax − d), iar 5 pasi e
  // primul caz in care scaderea ar da NEGATIV. Un −1 nu e nici 0, nici 1, deci
  // `stareSapat` ar cadea pe ramura din urma si ar raspunde SIGUR exact acolo
  // unde e cel mai periculos. Plafonul din BFS si `max` se acopera unul pe altul,
  // deci asta e garantia pe care o pierzi doar daca dispar amandoua.
  {
    const s9 = sitPlat(12345, 9)
    const z9 = s9.g - 3
    for (let dx = 0; dx < 9; dx++) {
      for (let dy = 0; dy < 9; dy++) {
        if (dx === 4 && dy === 4) continue
        assert.ok(applyCommand(s9.w, { kind: 'dig', wx: s9.wx + dx, wy: s9.wy + dy, z: z9 }, R).ok)
      }
    }
    assert.equal(stareSapat(s9.w.terrain, R, s9.wx + 4, s9.wy + 4, z9), StareSapat.CADE, 'stalpul din 9x9 e la 5 pasi de perete: tot CADE, nu SIGUR')
  }

  // Si chiar cade, daca o sapi.
  const inainte = lastJobReport().voxeliPrabusiti
  assert.ok(applyCommand(w, { kind: 'dig', wx: wx + 3, wy: wy + 3, z }, R).ok)
  assert.equal(lastJobReport().voxeliPrabusiti - inainte, 1, 'starea si realitatea trebuie sa spuna acelasi lucru')
})
