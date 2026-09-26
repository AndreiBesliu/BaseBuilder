/**
 * Scanarea overlay-ului de stabilitate, feliata pe cadre (viewer/scanare-stabilitate.ts).
 *
 * Doua garantii: felierea NU schimba ce se deseneaza, iar un apel nu depaseste
 * bugetul cu mai mult de o celula — si nici nu sta pe loc.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { Prefiltru, prefiltruStabilitate, Sol, solLa, StareSapat, stareSapat } from '../src/sim/stabilitate.ts'
import { aceeasiScanare, avanseazaScanare, ceFacCuTrecerea, pornesteScanare, Trecere } from '../viewer/scanare-stabilitate.ts'
import type { Scanare } from '../viewer/scanare-stabilitate.ts'
import type { World } from '../src/sim/state.ts'
import { laSit, R, solid } from './fixturi.ts'

/** O pivnita de 7×7 sub sit: pe nivelul tavanului, celule ULTIMA si CADE. */
function pivnita(): { w: World; cx: number; cy: number; zA: number } {
  const { w, sit } = laSit(12345, 0)
  let gmin = 1 << 20
  for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) gmin = Math.min(gmin, solid(w, sit.wx + dx, sit.wy + dy)!)
  const zP = gmin - 4
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) assert.ok(applyCommand(w, { kind: 'dig', wx: sit.wx + dx, wy: sit.wy + dy, z: zP }, R).ok)
  }
  return { w, cx: sit.wx, cy: sit.wy, zA: zP + 1 }
}

/** Ruleaza trecerea pana la capat, cu un plafon de apeluri: o trecere care nu avanseaza pica, nu atarna. */
function panaLaCapat(s: Scanare, w: World, ceas: () => number, buget: number): number {
  const plafon = s.filtru.length + 2
  for (let apel = 1; apel <= plafon; apel++) if (avanseazaScanare(s, w, R, ceas, buget)) return apel
  assert.fail(`trecerea nu s-a terminat in ${plafon} apeluri`)
}

test('felierea nu schimba trecerea: o felie sau cate o celula pe apel, acelasi desen si aceleasi numere', () => {
  const { w, cx, cy, zA } = pivnita()
  const raza = 12
  const intreaga = pornesteScanare(w, R, zA, cx, cy, raza)
  assert.equal(panaLaCapat(intreaga, w, () => 0, Infinity), 1)
  let t = 0
  const feliata = pornesteScanare(w, R, zA, cx, cy, raza)
  const apeluri = panaLaCapat(feliata, w, () => t++, 1)

  // Referinta INDEPENDENTA de scanare: `stareSapat` pe FIECARE celula solida a ferestrei, in
  // ordinea ei, iar numarul de celule scumpe dintr-un prefiltru calculat aici, pe fereastra
  // corecta. Prima versiune citea filtrul chiar din trecerea testata: un filtru calculat pe o
  // fereastra decalata cu o celula trecea testul si lasa nedesenata o celula periculoasa din 56.
  const lat = 2 * raza + 1
  const filtru = prefiltruStabilitate(w.terrain, R, cx - raza, cy - raza, lat, zA)
  const marcate: number[] = []
  let scanate = 0
  for (let k = 0; k < lat * lat; k++) {
    if (filtru[k] === Prefiltru.DE_SCANAT) scanate++
    const wx = cx - raza + Math.floor(k / lat)
    const wy = cy - raza + (k % lat)
    if (solLa(w.terrain, wx, wy, zA) !== Sol.SOLID) continue
    const st = stareSapat(w.terrain, R, wx, wy, zA)
    if (st === StareSapat.ULTIMA_CELULA || st === StareSapat.CADE) marcate.push(wx, wy, st)
  }
  assert.ok(marcate.length > 0, 'fixtura: pivnita n-are nicio celula periculoasa pe tavan')
  assert.deepEqual(intreaga.marcate, marcate, 'trecerea intreaga difera de referinta')
  for (const s of [intreaga, feliata]) {
    assert.deepEqual(s.marcate, marcate)
    assert.equal(s.scanate, scanate)
  }
  assert.deepEqual([feliata.sigur, feliata.ultima, feliata.cade], [intreaga.sigur, intreaga.ultima, intreaga.cade])
  // Cu bugetul de o bataie de ceas, fiecare apel judeca exact o celula scumpa.
  assert.ok(apeluri >= scanate && apeluri <= scanate + 1, `${apeluri} apeluri pentru ${scanate} celule scumpe`)
  assert.equal(feliata.felii, apeluri)
})

test('bugetul se respecta: un apel judeca cel mult cat incape, si macar o celula', () => {
  const { w, cx, cy, zA } = pivnita()
  const s = pornesteScanare(w, R, zA, cx, cy, 12)
  let t = 0
  let inainte = 0
  let gata = false
  for (let apel = 0; !gata; apel++) {
    assert.ok(apel <= s.filtru.length, 'trecerea nu avanseaza')
    gata = avanseazaScanare(s, w, R, () => t++, 3)
    const acum = s.scanate - inainte
    inainte = s.scanate
    assert.ok(acum <= 3, `un apel cu bugetul de 3 batai a judecat ${acum} celule scumpe`)
    if (!gata) assert.ok(acum >= 1, 'un apel neterminat n-a judecat nimic')
  }
  assert.ok(s.felii > 1, 'fixtura: trecerea a incaput intr-un singur apel, bugetul n-a fost pus la proba')
})

test('cererea periodica nu reporneste trecerea din curs, iar una TERMINATA nu se reporneste fara editari de teren', () => {
  // Bucla viewer-ului, fara THREE: la fiecare 30 de cadre, cererea; la fiecare cadru, o felie de
  // o celula. Recenzia (26.09): garda „din curs" statea in overlay fara niciun test — scoasa,
  // langa grinzi trecerea nu se mai termina; iar una terminata se relua la 30 de cadre si
  // platea iar celula cea mai scumpa, cu terenul neatins.
  const { w, cx, cy, zA } = pivnita()
  let inCurs: Scanare | null = null
  let ultima: Scanare | null = null
  let t = 0
  let porniri = 0
  for (let cadru = 0; cadru < 20000 && ultima === null; cadru++) {
    if (cadru % 30 === 0) {
      const d = ceFacCuTrecerea(inCurs, ultima, w.terrain, zA, cx, cy, 12)
      if (d === Trecere.PORNESTE || d === Trecere.UITA_SI_PORNESTE) { inCurs = pornesteScanare(w, R, zA, cx, cy, 12); porniri++ }
    }
    if (inCurs !== null && avanseazaScanare(inCurs, w, R, () => t++, 1)) { ultima = inCurs; inCurs = null }
  }
  assert.ok(ultima !== null, 'trecerea n-a ajuns la capat: cererea periodica o reporneste')
  assert.equal(porniri, 1, 'fixtura: o singura trecere pentru o singura intrebare')
  assert.ok(ultima!.felii > 30, 'fixtura: trecerea trebuia sa treaca prin mai multe cereri periodice')
  assert.equal(ceFacCuTrecerea(null, ultima, w.terrain, zA, cx, cy, 12), Trecere.GATA, 'terminata, pe acelasi teren: nimic de refacut')
  assert.equal(ceFacCuTrecerea(null, ultima, w.terrain, zA + 1, cx, cy, 12), Trecere.UITA_SI_PORNESTE, 'alt nivel: alta intrebare')
  const alta = pivnita()
  assert.equal(ceFacCuTrecerea(null, ultima, alta.w.terrain, zA, cx, cy, 12), Trecere.PORNESTE, 'alt teren (alta lume, aceeasi epoca): trecerea veche nu raspunde')
  // O editare de teren, oriunde: trecerea se reface.
  const g = solid(w, cx + 20, cy + 20)
  assert.ok(g !== null && applyCommand(w, { kind: 'dig', wx: cx + 20, wy: cy + 20, z: g }, R).ok, 'fixtura: o sapatura departe')
  assert.equal(ceFacCuTrecerea(null, ultima, w.terrain, zA, cx, cy, 12), Trecere.PORNESTE, 'dupa o editare de teren trecerea terminata e veche')
})

test('trecerea din curs nu se reporneste pentru aceleasi intrebari, si se reporneste pentru altele', () => {
  const { w, cx, cy, zA } = pivnita()
  const s = pornesteScanare(w, R, zA, cx, cy, 12)
  assert.equal(aceeasiScanare(s, zA, cx, cy, 12), true)
  assert.equal(aceeasiScanare(s, zA + 1, cx, cy, 12), false, 'alt nivel de slice')
  assert.equal(aceeasiScanare(s, zA, cx + 32, cy, 12), false, 'alt focus')
  assert.equal(aceeasiScanare(s, zA, cx, cy - 32, 12), false, 'alt focus')
  assert.equal(aceeasiScanare(s, zA, cx, cy, 16), false, 'alta raza')
})
