/**
 * Pozitiile scenariului de gate S-DIG.
 *
 * Testul exista fiindca varianta veche a generatorului mintea in doua feluri
 * deodata si nimic n-o contrazicea: statea ca doua linii intr-un modul de browser,
 * deci n-avea cum sa fie rulata de `npm test`, iar singurul ei consumator era o
 * rulare de gate care raporta un numar de cadre, nu o acoperire.
 *
 * Ce urmeaza nu verifica implementarea, ci proprietatile pe care gate-ul le
 * presupune fara sa le ceara: sapaturile se imprastie peste asezare, chiar se fac
 * (nu doar se incearca), si ating terenul nepromovat.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { CHUNK_CELLS } from '../src/sim/terrain/chunk.ts'
import { dig, groundLevelM } from '../src/sim/terrain/terrain.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { makeM10, SETTLEMENT_CHUNKS } from '../src/harness/fixture-m10.ts'
import {
  pozitiaSapaturii, sapaturaUrmatoare, SDIG_MAX_INCERCARI, SDIG_OFFSET_CHUNKS,
  SDIG_OFFSET_INCALZIRE, SDIG_SPAN_INCALZIRE, sdigSpanCelule,
} from '../src/harness/sdig.ts'

/** Focusul e arbitrar: tot ce se verifica aici e relativ la el. */
const FCX = 250
const FCY = 250
/** 60 s x 20 de sapaturi/s — lungimea unei rulari de gate. */
const SAPATURI = 1200

test('pozitiile acopera patratul EXACT o data, pe toata perioada', () => {
  // Proprietatea tare, si cea care lipsea: generatorul e o bijectie pe patrat. Cel
  // vechi era o functie de `c mod span`, deci acoperea o linie de `span` celule
  // dintr-un plan de `span²` — iar testul lui natural, „nu se repeta nimic in 1200
  // de pasi", ar fi picat abia dupa 416. Se verifica perioada INTREAGA, nu un
  // esantion: o schimbare de pas care imparte `span²` scurteaza perioada tacut.
  const span = sdigSpanCelule()
  const n = span * span
  const bazaX = (FCX + SDIG_OFFSET_CHUNKS) * CHUNK_CELLS
  const bazaY = (FCY + SDIG_OFFSET_CHUNKS) * CHUNK_CELLS
  const vazute = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const { wx, wy } = pozitiaSapaturii(i, FCX, FCY)
    const lx = wx - bazaX
    const ly = wy - bazaY
    assert.ok(lx >= 0 && lx < span && ly >= 0 && ly < span, `pasul ${i} iese din patrat: ${lx},${ly}`)
    const k = ly * span + lx
    assert.equal(vazute[k], 0, `pasul ${i} repeta celula ${lx},${ly} inaintea sfarsitului perioadei`)
    vazute[k] = 1
  }
  let acoperite = 0
  for (let k = 0; k < n; k++) acoperite += vazute[k]!
  assert.equal(acoperite, n, 'perioada e intreaga, dar acoperirea nu: raman celule nevizitate')
})

test('o rulare de gate atinge 1200 de coloane distincte, nu 416', () => {
  // Enuntul in cifrele care conteaza pentru gate. Decurge din bijectie, dar bijectia
  // se poate pierde la o schimbare de pas fara ca cineva sa lege asta de „scenariul
  // nu mai masoara ce spune".
  const vazute = new Set<number>()
  for (let i = 0; i < SAPATURI; i++) {
    const { wx, wy } = pozitiaSapaturii(i, FCX, FCY)
    vazute.add(wy * 1_000_000 + wx)
  }
  assert.equal(vazute.size, SAPATURI, 'pozitiile se repeta: generatorul e o linie, nu un plan')
})

test('o parte din sapaturi cad in AFARA dreptunghiului promovat de fixtura', () => {
  // `buildM10` sapa `SETTLEMENT_CHUNKS` chunk-uri pornind din COLTUL focusului, iar
  // promovarea vine cu apron de 1 chunk: dreptunghiul promovat e -1..SETTLEMENT_CHUNKS.
  // Cat timp patratul sapat statea inauntru — si statea, fiindca `span` era scris tot
  // 13 — `remeshAfterEdit` nu putea ajunge niciodata pe ramura scumpa.
  const primulPromovat = -1
  let frontiera = 0
  for (let i = 0; i < SAPATURI; i++) {
    const { wx, wy } = pozitiaSapaturii(i, FCX, FCY)
    const cx = Math.floor(wx / CHUNK_CELLS) - FCX
    const cy = Math.floor(wy / CHUNK_CELLS) - FCY
    assert.ok(cx <= SETTLEMENT_CHUNKS && cy <= SETTLEMENT_CHUNKS, `pasul ${i} iese pe latura pozitiva: ${cx},${cy}`)
    if (cx < primulPromovat || cy < primulPromovat) frontiera++
  }
  // Banda e de 2 chunk-uri pe fiecare din cele doua laturi negative, dintr-un patrat
  // de 17: 1 - (15/17)² = 22,1%. Banda, nu egalitate — numarul exact depinde de unde
  // cade taietura la pasul 1200.
  assert.ok(frontiera > 220 && frontiera < 320, `${frontiera} din ${SAPATURI} ating frontiera, asteptat ~266`)
})

/** Cheile chunk-urilor promovate, in clipa asta. */
function promovate(t: Terrain): Set<number> {
  const out = new Set<number>()
  for (const k of t.keys) if (t.chunks.get(k)!.voxels !== null) out.add(k)
  return out
}

test('cele 1200 de sapaturi ale unei rulari se FAC, nu doar se incearca', () => {
  // „20 de sapaturi/s" e parametrul scenariului. Fara reincercare, o pozitie din
  // patru cadea pe aer — fixtura si-a sapat deja camerele — si gate-ul facea 13,1/s
  // raportand 20. Se foloseste `sapaturaUrmatoare`, adica exact bucla din viewer, nu
  // o rescriere a ei in test.
  const { terrain } = makeM10(20260913, FCX, FCY)
  let cursor = 0
  let facute = 0
  let respinse = 0
  for (let i = 0; i < SAPATURI; i++) {
    const f = sapaturaUrmatoare(
      cursor, FCX, FCY,
      (wx, wy) => { const g = groundLevelM(terrain, wx, wy); return g.ok ? g.value : null },
      (wx, wy, z) => dig(terrain, wx, wy, z).ok,
    )
    if (!f) break
    // Cursorul trebuie sa treaca PESTE pozitia rezolvata. Fara asertiunea asta, un
    // `cursor: c` in loc de `c + 1` — o schimbare plauzibila, „cursorul e pozitia
    // curenta" — face scenariul sa reincerce de fiecare data pozitia tocmai sapata:
    // aceleasi 1200 de sapaturi, dar de sapte ori mai multe comenzi respinse pe bucla
    // de constructie masurata de gate. Contorul `respinse` de mai jos NU o prinde, e
    // derivat din aceeasi aritmetica.
    assert.ok(f.cursor > cursor, `pasul ${i}: cursorul n-a avansat (${cursor} -> ${f.cursor})`)
    respinse += f.cursor - cursor - 1
    cursor = f.cursor
    facute++
  }
  assert.equal(facute, SAPATURI, `doar ${facute} din ${SAPATURI} de sapaturi s-au facut in cate ${SDIG_MAX_INCERCARI} incercari`)
  // Controlul de VIATA al reincercarii, ca BANDA: daca nimic n-ar fi respins, bucla
  // n-ar apara nimic; daca s-ar respinge de cateva ori mai mult, scenariul ar plati o
  // munca pe care n-o declara. Masurat pe configuratia livrata: 200.
  assert.ok(respinse > 100 && respinse < 600,
    `${respinse} pozitii respinse, asteptat ~200: sub 100 reincercarea nu e exercitata, peste 600 se reincearca degeaba`)
})

test('sapaturile promoveaza chunk-uri NOI, cu apron intreg', () => {
  // Ramura scumpa din `remeshAfterEdit` — chunk nou plus apron = 9 remeshate — se
  // declanseaza doar cand o sapatura promoveaza. Masurat pe scenariul vechi: 0
  // promovari din 1200, deci ramura aia n-a intrat NICIODATA intr-o rulare de gate.
  //
  // Se cere si valul de 9, nu doar „a promovat ceva": langa dreptunghiul promovat,
  // majoritatea vecinilor sunt deja promovati si valul e mic. Doar un chunk cu toti
  // cei 8 vecini nepromovati produce cazul pe care gate-ul trebuie sa-l masoare.
  const { terrain } = makeM10(20260913, FCX, FCY)
  let cursor = 0
  let promovari = 0
  let valMaxim = 0
  for (let i = 0; i < SAPATURI; i++) {
    const inainte = promovate(terrain)
    const f = sapaturaUrmatoare(
      cursor, FCX, FCY,
      (wx, wy) => { const g = groundLevelM(terrain, wx, wy); return g.ok ? g.value : null },
      (wx, wy, z) => dig(terrain, wx, wy, z).ok,
    )
    if (!f) break
    cursor = f.cursor
    const val = promovate(terrain).size - inainte.size
    if (val > 0) promovari++
    if (val > valMaxim) valMaxim = val
  }
  assert.ok(promovari > 20, `doar ${promovari} promovari din ${SAPATURI} de sapaturi`)
  assert.ok(valMaxim >= 9, `cel mai mare val de promovare a fost ${valMaxim}: ramura de 9 din remeshAfterEdit ramane nemasurata`)
})

/** 300 de cadre de incalzire / 3 cadre pe sapatura. Vezi `WARMUP_FRAMES` din viewer. */
const SAPATURI_IN_INCALZIRE = 100

test('incalzirea nu cheltuie valurile de promovare pe care fereastra le masoara', () => {
  // Ramura scumpa din `remeshAfterEdit` — chunk nou plus apron, 9 remeshate — cere un
  // chunk cu toti cei 8 vecini nepromovati. Asa ceva exista doar cat timp banda de
  // frontiera e NEATINSA: dupa cateva zeci de sapaturi ea e presarata cu chunk-uri
  // promovate si apronul le acopera vecinii.
  //
  // Masurat cand banda a fost adaugata: toate cele 4 valuri cadeau la sapaturile 0..3,
  // iar incalzirea le inghitea pe toate. Scenariul reparat continua sa nu masoare
  // ramura pe care fusese reparat s-o masoare — doar din alt motiv.
  const { terrain } = makeM10(20260913, FCX, FCY)
  const promovate = (): number => {
    let n = 0
    for (const k of terrain.keys) if (terrain.chunks.get(k)!.voxels !== null) n++
    return n
  }
  const cota = (wx: number, wy: number): number | null => {
    const g = groundLevelM(terrain, wx, wy)
    return g.ok ? g.value : null
  }
  const incearca = (wx: number, wy: number, z: number): boolean => dig(terrain, wx, wy, z).ok

  // 1. Incalzirea, pe patratul ei: sapa, deci incalzeste codul, dar nu promoveaza.
  let cursorIncalzire = 0
  let promovariInIncalzire = 0
  let facuteInIncalzire = 0
  for (let i = 0; i < SAPATURI_IN_INCALZIRE; i++) {
    const inainte = promovate()
    const f = sapaturaUrmatoare(cursorIncalzire, FCX, FCY, cota, incearca, SDIG_SPAN_INCALZIRE, SDIG_OFFSET_INCALZIRE)
    if (!f) break
    cursorIncalzire = f.cursor
    facuteInIncalzire++
    if (promovate() > inainte) promovariInIncalzire++
  }
  assert.equal(facuteInIncalzire, SAPATURI_IN_INCALZIRE, 'incalzirea n-a reusit sa sape tot')
  assert.equal(promovariInIncalzire, 0,
    `incalzirea a promovat ${promovariInIncalzire} chunk-uri: cheltuie evenimentul inainte sa inceapa masuratoarea`)

  // 2. Fereastra masurata, DUPA incalzire, pe patratul cu banda.
  let cursor = 0
  let valMaxim = 0
  let promovari = 0
  for (let i = 0; i < SAPATURI; i++) {
    const inainte = promovate()
    const f = sapaturaUrmatoare(cursor, FCX, FCY, cota, incearca)
    if (!f) break
    cursor = f.cursor
    const val = promovate() - inainte
    if (val > 0) promovari++
    if (val > valMaxim) valMaxim = val
  }
  assert.ok(promovari > 20, `doar ${promovari} promovari in fereastra masurata`)
  assert.ok(valMaxim >= 9,
    `dupa incalzire, cel mai mare val de promovare e ${valMaxim}: ramura de 9 ramane in afara ferestrei masurate`)
})
