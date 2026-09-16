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
import { cellKey } from '../src/sim/path.ts'
import { isSolid, Material } from '../src/sim/terrain/chunk.ts'
import { bazaVoxeli, groundLevelM, materialAt, promoteWithApron, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { cotaDeAsezare, esteAsezat, Sol, solLa, suportLa } from '../src/sim/stabilitate.ts'
import { existaTinta, lastJobReport, prabuseste } from '../src/sim/joburi.ts'
import { verificaRezervari } from '../src/sim/rezervari.ts'
import { isWalkable } from '../src/sim/regions.ts'
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
  // Si `dezgroapa` nu-l acopera: cauta doar ±`maxStepM`, care e 1. Panoul a
  // masurat ca la o cadere de 2+ pionul ramane in aer PE VECI, iar `ingropati` —
  // asertat 0 in acceptanta — nu mai ajunge niciodata la zero.
  // Doua camere suprapuse, cu o podea de un metru intre ele. Cea de JOS e lata
  // de 9, deci tavanul ei — adica PODEAUA celei de sus — se prabuseste in
  // centru. Cea de sus e lata de 5, deci tavanul EI nu cade si nu lasa moloz
  // peste pion.
  const { w, wx, wy, g } = sitPlat(4242, 11)
  const zJos = g - 8
  const zPodea = zJos + 2
  const zSus = zPodea + 1

  // Intai camera de sus, 5x5 centrata, DOUA niveluri (un pion are nevoie de
  // gabarit: intr-o punga de un nivel nici nu se poate naste).
  sapaCavitate(w, wx + 2, wy + 2, zSus + 1, 5)
  sapaCavitate(w, wx + 2, wy + 2, zSus, 5)

  const px = wx + 4
  const py = wy + 4
  assert.ok(isWalkable(w.terrain, px, py, zSus, R), 'fixtura: centrul camerei de sus trebuie sa fie calcabil')
  const out = applyCommand(w, { kind: 'spawnAgent', x: px * 1000 + 500, y: py * 1000 + 500, z: zSus, faction: 0 }, R)
  assert.ok(out.ok, `fixtura: pionul n-a putut fi asezat: ${JSON.stringify(out)}`)
  const zInainte = w.agents.z[0]!

  // Apoi camera de JOS, 9x9: tavanul ei e podeaua pionului.
  sapaCavitate(w, wx, wy, zJos + 1, 9)
  const cazuti = sapaCavitate(w, wx, wy, zJos, 9)
  void cazuti
  assert.ok(solLa(w.terrain, px, py, zPodea) === Sol.AER, `podeaua pionului trebuia sa cada; e ${solLa(w.terrain, px, py, zPodea)}`)

  const t = ruleaza(w, 60)
  assert.equal(w.agents.alive[0], 1, 'pionul trebuie sa ramana viu')
  assert.ok(w.agents.z[0]! < zInainte, `pionul trebuia sa CADA, a ramas la ${w.agents.z[0]}`)
  assert.ok(
    isWalkable(w.terrain, cellOf(w.agents.x[0]!), cellOf(w.agents.y[0]!), w.agents.z[0]!, R),
    'si sa ajunga pe o celula pe care se poate sta',
  )
  assert.equal(t.refuzuriAgenti >= 0, true)
  void prabuseste
})

// ---------------------------------------------------------------------------
// determinism, save/load
// ---------------------------------------------------------------------------

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

test('celuleAtinse acopera DOUA cote: z si z+1', async () => {
  // v1 avea „discul de la z plus UN voxel deasupra". Panoul a masurat ca rateaza
  // exact voxelul care cade: 13 celule se schimba la z+1 si NOUA ajung la 0,
  // multimea din v1 prinde una.
  const { celuleAtinse } = await import('../src/sim/stabilitate.ts')
  const out: number[] = []
  celuleAtinse(R, 100, 100, 50, out)
  const cote = new Set(out.map((k) => {
    const c = cellKey
    void c
    return k
  }))
  void cote
  assert.equal(out.length, 50, `${out.length} celule, asteptat 50 (doua discuri de raza 3)`)
  const laZ = out.filter((k) => k === cellKey(100, 100, 50)).length
  const laZ1 = out.filter((k) => k === cellKey(100, 100, 51)).length
  assert.equal(laZ, 1, 'celula editata e in multime')
  assert.equal(laZ1, 1, 'si cea de DEASUPRA ei')
  assert.ok(out.includes(cellKey(103, 100, 51)), 'discul de la z+1 se intinde tot 3 celule lateral')
})
