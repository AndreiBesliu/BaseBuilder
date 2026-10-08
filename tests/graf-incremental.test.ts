/**
 * Graful termic incremental (ii) — S24-27 t.2b, valul 1, commit-ul 3 (research/temperatura-t2b.md §6; harta B5, panoul
 * IDX).
 *
 * Nodurile sunt ETICHETE stabile (moștenite de la sursa-componentă veche cu cele mai multe celule), muchiile dirijate
 * (fiecare capăt cu fețele lui, simetria verificată la citire), delta aplicată pe LOT din `SchimbareCamere` (bucățile
 * moarte, născute, rescrise, proveniența). ORACOLUL: graful incremental == graful construit integral pe un index NOU (și
 * prefixul == graful t.2a, iar C' pe nod == contoarele componentei), după FIECARE lot — fuzz-ul de despărțiri și uniri (7
 * semințe × 400 de loturi), zidul M10, mina cu 20 de pioni (aici pe același index la fiecare lot și pe unul nou la 100);
 * lărgire20 și K05 sunt în graf-k05.test.ts. PE HÂRTIE: moștenirea la unire și despărțire, egalitățile rupte pe ancore
 * (nu pe etichete), lumea continuă față de cea încărcată (alte etichete, același graf, același |S|), ștampila, compararea
 * cu integralul (encode), simetria la citire, loturile doar-fețe.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { componentaLa, decodeazaFelie, sincronizeazaCamere } from '../src/sim/camere.ts'
import { capacitateMu, contoareComponentei } from '../src/sim/fete.ts'
import { decode, encode } from '../src/sim/save.ts'
import type { World } from '../src/sim/state.ts'
import type { MaterialId } from '../src/sim/terrain/chunk.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill, materialAt } from '../src/sim/terrain/terrain.ts'
import { actualizeazaGraful, comparaGrafulCuIntegral, construiesteGrafIncremental, formaCanonicaGrafIncremental, grafulIncremental, refaGrafulDeUrgenta, statGraf } from '../src/sim/termic.ts'
import { createWorld } from '../src/sim/world.ts'
import { R, sitPlat } from './fixturi.ts'
import { bun, canonic, delta, egalCuIndexulNou, egalCuIntegralul, faraUrgente, gAt, graf, lot, lotGraf, lumeM10, lumeMina, tickCuGraf, zidLangaCamere } from './fixturi-graf.ts'

const P = Material.PIATRA_CONSTRUITA

/** Celulele unui paralelipiped [x0, x1] × [y0, y1] × [z0, z1], săpate (sau zidite cu `m`) într-un singur lot. */
function cutie(w: World, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: MaterialId | null = null): void {
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    bun(m === null ? dig(w.terrain, x, y, z) : fill(w.terrain, x, y, z, m), `${m === null ? 'dig' : 'fill'} ${x},${y},${z}`)
  }
}

function nodulLui(w: World, x: number, y: number, z: number): number {
  const c = componentaLa(w.camere, x, y, z)
  assert.ok(c, `nicio componenta la ${x},${y},${z}`)
  const s = graf(w).nodComp.get(c!.id)
  assert.ok(s !== undefined, 'componenta fara nod')
  return s!
}

// --- moștenirea, pe hârtie ----------------------------------------------------------------

test('GRAF mostenirea pe hartie: usa dintre o pivnita de 48 de celule si una de 12 — la unire nodul celei MARI ramane, bucatile supravietuitoare ale celei mici se muta; la despartire cea mare isi pastreaza nodul, cea mica primeste unul nou si isi parcurge DOAR bucatile ei', () => {
  const { w, wx, wy, g } = sitPlat(12345, 16)
  cutie(w, wx + 2, wx + 5, wy + 2, wy + 4, g - 5, g - 2) // A: 4×3×4
  cutie(w, wx + 7, wx + 8, wy + 2, wy + 4, g - 3, g - 2) // B: 2×3×2, zidul pe x = wx+6
  lot(w)
  const nA = nodulLui(w, wx + 2, wy + 2, g - 3), nB = nodulLui(w, wx + 7, wy + 2, g - 3)
  const B = componentaLa(w.camere, wx + 7, wy + 2, g - 3)!
  // Ușa la g−3: felia ei se reface; bucățile de la g−2 supraviețuiesc.
  let st = statGraf(w.camere)
  assert.ok(dig(w.terrain, wx + 6, wy + 3, g - 3).ok)
  const u = lot(w)
  const supravietuitoareB = B.bucati.filter((b) => !u.bucatiMoarte.includes(b)).length
  assert.ok(supravietuitoareB > 0, 'fixtura: B are bucati care supravietuiesc lotului')
  assert.equal(nodulLui(w, wx + 7, wy + 2, g - 3), nA, 'unite, pe nodul lui A (48 de celule)')
  assert.ok(!graf(w).noduri.has(nB), 'nodul lui B a disparut')
  let d = delta(w, st)
  assert.deepEqual([d.mosteniri, d.noduriNoi, d.mutate], [1, 0, supravietuitoareB], JSON.stringify(d))
  egalCuIndexulNou(w, 'unirea')
  // Ușa zidită la loc: A' (48) moștenește nodul unirii, B' (12) primește unul nou și își mută toate bucățile — le
  // parcurge pe ale EI, nu membrii nodului unirii (A la g−5, g−4, g−2 și B la g−2 supraviețuiesc lotului: cel puțin unul
  // în plus față de B').
  st = statGraf(w.camere)
  let supravietuitoareUnire = 0
  for (const b of graf(w).noduri.get(nA)!.membri) if (decodeazaFelie(w.camere.bFelie[b]!).z !== g - 3) supravietuitoareUnire++
  assert.ok(fill(w.terrain, wx + 6, wy + 3, g - 3, P).ok)
  lot(w)
  assert.equal(nodulLui(w, wx + 2, wy + 2, g - 3), nA, 'A isi pastreaza nodul')
  const Bn = componentaLa(w.camere, wx + 7, wy + 2, g - 3)!
  assert.ok(supravietuitoareUnire > Bn.bucati.length, `fixtura: nodul unirii are mai multe bucati supravietuitoare (${supravietuitoareUnire}) decat B' (${Bn.bucati.length})`)
  d = delta(w, st)
  assert.deepEqual([d.mosteniri, d.noduriNoi, d.parcurseMostenire], [1, 1, Bn.bucati.length], JSON.stringify(d))
  egalCuIndexulNou(w, 'despartirea')
  faraUrgente(w, 'usa')
})

/**
 * Două pivnițe EGALE (3×3×2), A la vest (ancora mai mică) și B la est, cu D la nord de A (1 m de rocă: o muchie A–D, niciuna
 * B–D). Săpate în ordinea B, A, D pe un graf deja construit: etichetele lor sunt 0, 1, 2 — invers față de ancore la A și B.
 */
function treiPivnite(): { w: World; wx: number; wy: number; g: number } {
  const s = sitPlat(12345, 16)
  const { w, wx, wy, g } = s
  lot(w) // graful, gol
  cutie(w, wx + 6, wx + 8, wy + 2, wy + 4, g - 3, g - 2)
  lot(w)
  cutie(w, wx + 2, wx + 4, wy + 2, wy + 4, g - 3, g - 2)
  lot(w)
  cutie(w, wx + 2, wx + 4, wy + 6, wy + 8, g - 3, g - 2)
  lot(w)
  return s
}

test('GRAF egalitatile se rup GEOMETRIC: doua pivnite egale unite prin usa — nodul ramane al celei cu ancora mai mica, nu al etichetei mai mici; despartite simetric, jumatatea cu ancora mai mica il mosteneste', () => {
  const { w, wx, wy, g } = treiPivnite()
  const A = componentaLa(w.camere, wx + 2, wy + 2, g - 3)!, B = componentaLa(w.camere, wx + 6, wy + 2, g - 3)!
  const nA = nodulLui(w, wx + 2, wy + 2, g - 3), nB = nodulLui(w, wx + 6, wy + 2, g - 3)
  assert.ok(A.ancora < B.ancora && nB < nA, `fixtura: etichetele invers fata de ancore (A ${nA}, B ${nB})`)
  assert.equal(A.volum, B.volum, 'fixtura: egale')
  assert.ok(dig(w.terrain, wx + 5, wy + 3, g - 3).ok)
  lot(w)
  assert.equal(nodulLui(w, wx + 6, wy + 2, g - 3), nA, 'unite pe nodul lui A (ancora mai mica), nu pe eticheta mai mica')
  egalCuIndexulNou(w, 'unirea egalelor')
  assert.ok(fill(w.terrain, wx + 5, wy + 3, g - 3, P).ok)
  lot(w)
  assert.equal(nodulLui(w, wx + 2, wy + 2, g - 3), nA, 'despartirea simetrica: jumatatea de vest (ancora mai mica) pastreaza nodul')
  assert.notEqual(nodulLui(w, wx + 6, wy + 2, g - 3), nA)
  egalCuIndexulNou(w, 'despartirea egalelor')
  faraUrgente(w, 'egalitati')
})

test('GRAF etichetele nu poarta valori: lumea continua (etichete din istorie) si cea incarcata (etichete pe ancore) dau, lot cu lot, acelasi graf canonic si acelasi |S|', () => {
  const { w, wx, wy, g } = treiPivnite()
  const w2 = bun(decode(encode(w), R), 'decode')
  lot(w2) // graful lumii încărcate: construit integral, etichetele pe ancore
  const nA = nodulLui(w, wx + 2, wy + 2, g - 3), nB = nodulLui(w, wx + 6, wy + 2, g - 3)
  const mA = nodulLui(w2, wx + 2, wy + 2, g - 3), mB = nodulLui(w2, wx + 6, wy + 2, g - 3)
  assert.ok(nB < nA && mA < mB, `fixtura: ordinea etichetelor difera intre lumi (${nA}/${nB} fata de ${mA}/${mB})`)
  const pasi: ((x: World) => void)[] = [
    (x) => assert.ok(dig(x.terrain, wx + 5, wy + 3, g - 3).ok), // unirea egalelor
    (x) => assert.ok(fill(x.terrain, wx + 5, wy + 3, g - 3, P).ok), // despărțirea
    (x) => assert.ok(dig(x.terrain, wx + 5, wy + 3, g - 3).ok),
    (x) => assert.ok(dig(x.terrain, wx + 3, wy + 5, g - 2).ok), // D se unește cu A ∪ B
    (x) => assert.ok(fill(x.terrain, wx + 5, wy + 3, g - 3, P).ok),
    (x) => assert.ok(fill(x.terrain, wx + 3, wy + 5, g - 2, P).ok),
  ]
  for (let i = 0; i < pasi.length; i++) {
    const s1 = statGraf(w.camere), s2 = statGraf(w2.camere)
    pasi[i]!(w)
    pasi[i]!(w2)
    lot(w)
    lot(w2)
    assert.deepEqual(canonic(w.camere, graf(w)), canonic(w2.camere, graf(w2)), `pasul ${i}: graful canonic`)
    const d1 = delta(w, s1), d2 = delta(w2, s2)
    assert.deepEqual([d1.S, d1.mutate, d1.parcurseMostenire], [d2.S, d2.mutate, d2.parcurseMostenire], `pasul ${i}: |S|, mutate, parcurse — continua ${JSON.stringify(d1)}, incarcata ${JSON.stringify(d2)}`)
  }
  egalCuIndexulNou(w, 'continua')
  faraUrgente(w, 'continua')
  faraUrgente(w2, 'incarcata')
})

test('GRAF mostenirea: o componenta fara sursa veche (casa acoperita dintr-un lot: aerul ei vine din CER) primeste nod nou — SOL, CER si NEC nu concureaza', () => {
  const { w, wx, wy, g } = sitPlat(4242, 12)
  lot(w)
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    assert.ok(fill(w.terrain, wx + dx, wy + dy, z, dx === 2 && dy === 0 ? Material.USA : P).ok)
    lot(w)
  }
  assert.equal(w.camere.comp.size, 0, 'fixtura: pana la acoperis nu e niciun aer acoperit')
  const st = statGraf(w.camere)
  // Tot acoperișul într-un lot: aerul de sub el era cer.
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(w.terrain, wx + dx, wy + dy, g + 3, P).ok)
  const sch = lot(w)
  assert.equal(sch.noi.length, 1)
  const surse = [...sch.prov.get(sch.noi[0]!)!.keys()]
  assert.ok(surse.length > 0 && surse.every((s) => s < 0), `fixtura: doar surse SOL/CER (${surse})`)
  const d = delta(w, st)
  assert.deepEqual([d.noduriNoi, d.mosteniri], [1, 0], JSON.stringify(d))
  egalCuIndexulNou(w, 'casa inchisa')
  faraUrgente(w, 'casa inchisa')
})

// --- ștampila, compararea, citirea ----------------------------------------------------------

test('GRAF stampila: un lot pe care graful nu l-a vazut (sincronizare fara delta) — grafulIncremental refuza, lotul urmator reface integral, DE URGENTA, iar graful e iar cel integral', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  cutie(w, wx + 2, wx + 4, wy + 2, wy + 4, g - 3, g - 2)
  lot(w)
  const st = statGraf(w.camere)
  assert.ok(dig(w.terrain, wx + 5, wy + 3, g - 3).ok)
  const ascuns = sincronizeazaCamere(w.camere, w.terrain)
  assert.ok(ascuns.felii.length > 0, 'fixtura: lotul ascuns schimba indexul')
  const o = grafulIncremental(w.camere, R)
  assert.ok(!o.ok && o.params.motiv === 'graful incremental nu e la zi cu indexul', o.ok ? 'acceptat' : JSON.stringify(o))
  assert.ok(dig(w.terrain, wx + 6, wy + 3, g - 3).ok)
  lotGraf(w)
  assert.deepEqual([delta(w, st).refaceriDeUrgenta, delta(w, st).loturi], [1, 0], 'refacerea de urgenta, nu o delta pe un graf vechi')
  egalCuIndexulNou(w, 'dupa lotul ascuns')
  // Refacerea de urgență cerută explicit (pasul, la un graf care nu e la zi): același graf, contorul +1.
  const inainte = canonic(w.camere, graf(w))
  assert.ok(refaGrafulDeUrgenta(w.camere, R).ok)
  assert.deepEqual(canonic(w.camere, graf(w)), inainte)
  assert.equal(delta(w, st).refaceriDeUrgenta, 2)
})

test('GRAF compararea cu integralul (encode): graful egal ramane, fara contor; o delta stricata FARA asimetrie (un bin) se refuza, graful integral il inlocuieste, refaceriDeUrgenta + 1', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  cutie(w, wx + 2, wx + 4, wy + 2, wy + 4, g - 3, g - 2)
  cutie(w, wx + 6, wx + 8, wy + 2, wy + 4, g - 3, g - 2)
  lot(w)
  const st = statGraf(w.camere)
  const vechi = graf(w)
  const egal = comparaGrafulCuIntegral(w.camere, R)
  assert.ok(egal.ok && egal.value === vechi, 'egale: acelasi obiect')
  assert.equal(delta(w, st).refaceriDeUrgenta, 0)
  const corect = canonic(w.camere, vechi)
  // Un bin cu 1 Q16 în plus: simetria, volumul și fețele deschise rămân, deci citirea nu-l vede.
  const n = [...vechi.noduri.values()][0]! as unknown as { bin: Map<number, number> }
  const [k, v] = [...n.bin.entries()].sort((a, b) => a[0] - b[0])[0]!
  n.bin.set(k, v + 1)
  assert.ok(formaCanonicaGrafIncremental(w.camere, vechi).ok, 'fixtura: deriva nu se vede la citire')
  const o = comparaGrafulCuIntegral(w.camere, R)
  assert.ok(!o.ok && o.params.motiv === 'graful incremental difera de cel integral', o.ok ? 'acceptat' : JSON.stringify(o))
  assert.equal(delta(w, st).refaceriDeUrgenta, 1)
  assert.notEqual(graf(w), vechi, 'inlocuit')
  assert.deepEqual(canonic(w.camere, graf(w)), corect)
})

test('GRAF simetria la citire: o muchie cu alta suma intr-un capat se refuza (muchie asimetrica), nu se citeste', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  cutie(w, wx + 2, wx + 4, wy + 2, wy + 4, g - 3, g - 2)
  cutie(w, wx + 6, wx + 8, wy + 2, wy + 4, g - 3, g - 2)
  lot(w)
  const gr = graf(w)
  const a = nodulLui(w, wx + 2, wy + 2, g - 3), b = nodulLui(w, wx + 6, wy + 2, g - 3)
  const na = gr.noduri.get(a)! as unknown as { vec: Map<number, number> }
  const G = na.vec.get(b)
  assert.ok(G !== undefined && G > 0, 'fixtura: pivnitele au o muchie')
  na.vec.set(b, G! + 7)
  const o = formaCanonicaGrafIncremental(w.camere, gr)
  assert.ok(!o.ok && o.params.motiv === 'muchie asimetrica', o.ok ? 'acceptat' : JSON.stringify(o))
  na.vec.set(b, G!)
  assert.ok(formaCanonicaGrafIncremental(w.camere, gr).ok)
})

// --- loturile doar-fețe -----------------------------------------------------------------------

test('GRAF doar fete: pamant pe acoperisul casei, celula cu celula — loturi fara nicio felie refacuta, cu bucatile rescrise de D+; graful == indexul nou dupa fiecare lot', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) if (dx === 0 || dy === 0 || dx === 4 || dy === 4) assert.ok(fill(w.terrain, wx + dx, wy + dy, z, P).ok)
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(w.terrain, wx + dx, wy + dy, g + 3, P).ok)
  lot(w)
  let rescrise = 0
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    assert.ok(fill(w.terrain, wx + dx, wy + dy, g + 4, Material.PAMANT).ok)
    const sch = lot(w)
    assert.deepEqual([sch.felii.length, sch.bucatiMoarte.length, sch.bucatiNascute.length], [0, 0, 0], 'fixtura: doar fete')
    rescrise += sch.bucatiRescrise.length
    egalCuIndexulNou(w, `pamant ${dx},${dy}`)
  }
  assert.ok(rescrise >= 9, `fixtura: doar ${rescrise} bucati rescrise`)
  faraUrgente(w, 'pamant pe acoperis')
})

test('GRAF doar fete: C\' pe nod urmeaza contoarele si pe un lot fara nicio felie refacuta — fill PIATRA pe apa de sub podeaua casei de pe iaz (fata de apa devine constructie: −3.729 μ)', () => {
  // Scena lui S1 (provenienta.test.ts): iazul de la 7808 + (10..14, 0..4), apa la −40.
  const w = createWorld(4242)
  const t = w.terrain
  const x0 = 244 * 32 + 10, y0 = 244 * 32
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    const m = materialAt(t, x0 + dx, y0 + dy, -40)
    assert.ok(m.ok && m.value === Material.APA, 'fixtura: apa la -40')
  }
  for (let z = -39; z <= -38; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) if (dx === 0 || dy === 0 || dx === 4 || dy === 4) assert.ok(fill(t, x0 + dx, y0 + dy, z, P).ok)
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(t, x0 + dx, y0 + dy, -37, P).ok)
  lot(w)
  const cap = (): number => {
    const c = componentaLa(w.camere, x0 + 2, y0 + 2, -39)!
    const n = graf(w).noduri.get(graf(w).nodComp.get(c.id)!)!
    const k = contoareComponentei(w.camere, c)
    assert.ok(k.ok)
    assert.equal(capacitateMu(n, R.termic.mase), capacitateMu(k.value, R.termic.mase), "C' pe nod == C' din contoarele componentei")
    return capacitateMu(n, R.termic.mase)
  }
  const inainte = cap()
  assert.ok(fill(t, x0 + 2, y0 + 2, -40, P).ok)
  const sch = lot(w)
  assert.deepEqual([sch.felii.length, sch.bucatiRescrise.length], [0, 1], 'fixtura: lotul doar-fete rescrie bucata podelei')
  assert.equal(cap() - inainte, R.termic.mase.constr - R.termic.mase.sol, 'o fata de apa (masa solului) devine constructie')
  egalCuIndexulNou(w, 'fill pe apa')
  faraUrgente(w, 'iazul')
})

// --- oracolul pe scene ------------------------------------------------------------------------

test('GRAF oracol: fuzz de despartiri si uniri — sapaturi si umpleri (piatra, usa) in loturi de 1..6, intr-o cutie de 24x24x4 cu 16 pivnite; 7 seminte × 400 de loturi, graful == indexul nou dupa FIECARE lot', () => {
  for (let seed = 1; seed <= 7; seed++) {
    let s = (seed * 2654435761) % 4294967296
    const rnd = (n: number): number => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0
      return (s >>> 8) % n
    }
    const { w, wx, wy } = sitPlat(12345, 16)
    const t = w.terrain
    const x0 = wx + 4, y0 = wy + 4, L = 24
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 4; dy++) {
      const xx = x0 + i * 6 + dx, yy = y0 + j * 6 + dy, gg = gAt(w, xx, yy)
      for (const z of [gg - 4, gg - 3]) dig(t, xx, yy, z)
    }
    lot(w)
    let uniri = 0, despartiri = 0
    for (let l = 0; l < 400; l++) {
      const n0 = w.camere.comp.size
      const k = 1 + rnd(6)
      for (let e = 0; e < k; e++) {
        const x = x0 + rnd(L), y = y0 + rnd(L), z = gAt(w, x, y) - 5 + rnd(4)
        if (rnd(3) === 0) fill(t, x, y, z, rnd(4) === 0 ? Material.USA : P)
        else dig(t, x, y, z)
      }
      lot(w)
      if (w.camere.comp.size < n0) uniri++
      if (w.camere.comp.size > n0) despartiri++
      egalCuIndexulNou(w, `seed ${seed}, lotul ${l}`)
    }
    // Măsurat: 65–80 de loturi cu mai puține componente, 109–118 cu mai multe (semințele 1–3).
    assert.ok(uniri >= 30 && despartiri >= 30, `seed ${seed}: ${uniri} uniri, ${despartiri} despartiri`)
    faraUrgente(w, `seed ${seed}`)
  }
})

test('GRAF oracol: zidul M10 — 90 de sapaturi in peretii a 30 de camere si 30 de umpleri cu pamant peste ele, fiecare un lot; graful == integralul dupa fiecare lot, == indexul nou la fiecare al 10-lea', () => {
  const w = lumeM10()
  let loturi = 0
  const verifica = (ce: string): void => {
    loturi++
    egalCuIntegralul(w, ce)
    if (loturi % 10 === 0) egalCuIndexulNou(w, ce)
  }
  let i = 0
  for (const [x, y, z] of zidLangaCamere(w, 30)) {
    assert.ok(dig(w.terrain, x, y, z).ok)
    lot(w)
    verifica(`sapatura ${x},${y},${z}`)
    if (i++ % 3 !== 2) continue
    assert.ok(fill(w.terrain, x - 5, y, gAt(w, x - 5, y) + 1, Material.PAMANT).ok)
    lot(w)
    verifica(`pamant ${x - 5},${y}`)
  }
  assert.equal(loturi, 120)
  egalCuIndexulNou(w, 'zidul, la final')
  faraUrgente(w, 'zidul')
})

test('GRAF oracol: mina 128x128x3 cu 20 de pioni, 3.000 de tickuri — graful == integralul dupa fiecare lot, == indexul nou la fiecare al 100-lea si la final', () => {
  const w = lumeMina(128, 20)
  let loturi = 0
  for (let k = 0; k < 3000; k++) {
    const e0 = w.terrain.editari
    tickCuGraf(w)
    if (w.terrain.editari === e0) continue
    loturi++
    egalCuIntegralul(w, `tickul ${w.tick}`)
    if (loturi % 100 === 0) egalCuIndexulNou(w, `tickul ${w.tick}`)
  }
  // Măsurat: 827 de loturi cu editări.
  assert.ok(loturi >= 400, `fixtura: doar ${loturi} loturi`)
  egalCuIndexulNou(w, 'mina, la final')
  faraUrgente(w, 'mina')
})

test('GRAF primul lot construieste graful integral (construiri 1); un lot fara schimbari nu atinge nimic; un recalcul al indexului (alt teren) reconstruieste', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  cutie(w, wx + 2, wx + 4, wy + 2, wy + 4, g - 3, g - 2)
  sincronizeazaCamere(w.camere, w.terrain)
  assert.ok(!grafulIncremental(w.camere, R).ok, 'inainte de primul lot: niciun graf')
  const st = statGraf(w.camere)
  lotGraf(w)
  assert.deepEqual([delta(w, st).construiri, delta(w, st).loturi], [1, 0])
  const g0 = graf(w)
  lotGraf(w)
  assert.equal(graf(w), g0)
  assert.deepEqual([delta(w, st).construiri, delta(w, st).loturi, delta(w, st).S], [1, 0, 0], 'NIMIC: nicio delta')
  // Alt teren: sincronizarea e un recalcul, graful se reconstruiește pe indexul nou.
  const alta = sitPlat(777, 10).w
  const sch = sincronizeazaCamere(w.camere, alta.terrain)
  assert.ok(sch.recalcul)
  assert.ok(actualizeazaGraful(w.camere, sch, R).ok)
  assert.equal(delta(w, st).construiri, 2)
  assert.equal(graf(w).noduri.size, w.camere.comp.size)
  const i = construiesteGrafIncremental(w.camere, R)
  assert.ok(i.ok)
  assert.deepEqual(canonic(w.camere, graf(w)), canonic(w.camere, i.value))
  faraUrgente(w, 'recalcul')
})
