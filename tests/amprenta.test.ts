import test from 'node:test'
import assert from 'node:assert/strict'
import {
  Acoperire,
  amprenta,
  atingeCelula,
  cutiaAmprentei,
  DIR_ONE,
  verificaOrientare,
  verificaPoza,
} from '../src/sim/amprenta.ts'
import type { AcoperireId, Poza } from '../src/sim/amprenta.ts'
import { Reason } from '../src/sim/result.ts'

/**
 * Un vector de orientare din unghi.
 *
 * Trigonometria sta AICI, in test, si niciodata in simulare: `Math.cos` nu e
 * garantat bit-exact intre motoare JS. Ce trece granita spre `sim/` sunt doi
 * intregi.
 */
function dir(grade: number): { dirX: number; dirY: number } {
  const r = (grade * Math.PI) / 180
  return { dirX: Math.round(Math.cos(r) * DIR_ONE), dirY: Math.round(Math.sin(r) * DIR_ONE) }
}

function poza(x: number, y: number, halfW: number, halfH: number, grade: number): Poza {
  return { x, y, halfW, halfH, ...dir(grade) }
}

// --- orientarea -------------------------------------------------------------

test('o orientare nenormalizata e REFUZATA, cu motivul', () => {
  const bun = verificaOrientare(DIR_ONE, 0)
  assert.equal(bun.ok, true)

  const rau = verificaOrientare(DIR_ONE, DIR_ONE) // lungime 1,41, nu 1
  assert.equal(rau.ok, false)
  if (!rau.ok) {
    assert.equal(rau.reason, Reason.VALOARE_INVALIDA)
    assert.equal(rau.params.camp, 'dir')
  }

  // Toate unghiurile intregi rotunjite trebuie sa treaca — altfel contractul e
  // imposibil de respectat de cine cheama.
  for (let g = 0; g < 360; g++) {
    const d = dir(g)
    assert.equal(verificaOrientare(d.dirX, d.dirY).ok, true, `unghiul ${g} a fost refuzat`)
  }
})

// --- invariantii amprentei --------------------------------------------------

test('amprenta e in ordine FIXA: y crescator, apoi x', () => {
  const p = poza(12_500, 8_300, 2_400, 700, 31)
  const a = amprenta(p)
  assert.ok(a.length >= 8, 'amprenta e prea mica ca sa dovedeasca o ordine')
  for (let i = 2; i < a.length; i += 2) {
    const px = a[i - 2]!, py = a[i - 1]!, x = a[i]!, y = a[i + 1]!
    assert.ok(y > py || (y === py && x > px), `ordine rupta la ${i}: (${px},${py}) apoi (${x},${y})`)
  }
})

test('acelasi lucru intors cu 180 de grade acopera aceleasi celule', () => {
  // Un dreptunghi e simetric fata de centru, deci amprenta lui nu are voie sa
  // depinda de care capat e „in fata".
  for (const g of [0, 17, 45, 63, 90, 123]) {
    const a = amprenta(poza(10_000, 10_000, 1_800, 500, g))
    const b = amprenta(poza(10_000, 10_000, 1_800, 500, g + 180))
    assert.deepEqual([...a], [...b], `unghiul ${g} difera de ${g + 180}`)
  }
})

test('ORICE contine intotdeauna CENTRU', () => {
  // Daca n-ar fi asa, regula „conservatoare" n-ar fi conservatoare.
  for (const g of [0, 13, 45, 77, 90]) {
    const p = poza(7_300, 4_100, 2_000, 900, g)
    const larg = new Set<string>()
    const a = amprenta(p, Acoperire.ORICE)
    for (let i = 0; i < a.length; i += 2) larg.add(`${a[i]},${a[i + 1]}`)
    const b = amprenta(p, Acoperire.CENTRU)
    for (let i = 0; i < b.length; i += 2) {
      assert.ok(larg.has(`${b[i]},${b[i + 1]}`), `celula (${b[i]},${b[i + 1]}) e in CENTRU dar nu in ORICE, la ${g}`)
    }
  }
})

test('cutia chiar contine amprenta — nicio celula atinsa nu cade in afara', () => {
  // Cutia e calculata analitic; daca ar fi prea stramta, rasterizarea ar pierde
  // celule TACUT, si zidul ar curge exact pe la capete.
  for (const g of [0, 22, 45, 68, 90, 135]) {
    const p = poza(9_500, 11_500, 3_000, 400, g)
    const c = cutiaAmprentei(p)
    for (let cy = c.y0 - 3; cy <= c.y1 + 3; cy++) {
      for (let cx = c.x0 - 3; cx <= c.x1 + 3; cx++) {
        if (cx >= c.x0 && cx <= c.x1 && cy >= c.y0 && cy <= c.y1) continue
        assert.equal(atingeCelula(p, cx, cy), false, `(${cx},${cy}) atinsa in afara cutiei, la ${g}`)
      }
    }
  }
})

// --- intrebarea care decide totul -------------------------------------------

/**
 * Poate cineva sa treaca prin zid?
 *
 * Umple in latime, cu patru vecini, printre celulele LIBERE dintr-o zona, si
 * spune daca se ajunge de la un capat la celalalt.
 */
function seTrece(blocate: Set<string>, x0: number, y0: number, x1: number, y1: number,
                 startX: number, startY: number, tintaX: number, tintaY: number): boolean {
  const vazut = new Set<string>()
  const coada = [[startX, startY] as const]
  vazut.add(`${startX},${startY}`)
  while (coada.length > 0) {
    const [x, y] = coada.pop()!
    if (x === tintaX && y === tintaY) return true
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy
      if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue
      const k = `${nx},${ny}`
      if (vazut.has(k) || blocate.has(k)) continue
      vazut.add(k)
      coada.push([nx, ny] as const)
    }
  }
  return false
}

/** Zidul, rasterizat cu regula data, taie cutia in doua? */
function taie(grade: number, regula: AcoperireId): boolean {
  const X0 = 0, Y0 = 0, X1 = 39, Y1 = 39
  // Zidul trece prin centrul cutiei si e mai lung decat diagonala ei, ca sa nu
  // existe drum pe langa capete. Grosime 0,2 m: subtire, cum e un zid adevarat.
  const p = poza(20_000, 20_000, 40_000, 100, grade)
  const blocate = new Set<string>()
  const a = amprenta(p, regula)
  for (let i = 0; i < a.length; i += 2) blocate.add(`${a[i]},${a[i + 1]}`)

  // Doua puncte de o parte si de alta, pe perpendiculara zidului.
  const d = dir(grade + 90)
  const sx = Math.round(20_000 + (d.dirX * 12_000) / DIR_ONE)
  const sy = Math.round(20_000 + (d.dirY * 12_000) / DIR_ONE)
  const tx = Math.round(20_000 - (d.dirX * 12_000) / DIR_ONE)
  const ty = Math.round(20_000 - (d.dirY * 12_000) / DIR_ONE)
  const A = [Math.floor(sx / 1000), Math.floor(sy / 1000)] as const
  const B = [Math.floor(tx / 1000), Math.floor(ty / 1000)] as const

  assert.ok(!blocate.has(`${A[0]},${A[1]}`), `capatul A e chiar in zid, la ${grade}`)
  assert.ok(!blocate.has(`${B[0]},${B[1]}`), `capatul B e chiar in zid, la ${grade}`)
  return !seTrece(blocate, X0, Y0, X1, Y1, A[0], A[1], B[0], B[1])
}

test('ETANS: un zid rotit oricum NU curge, cu regula ORICE', () => {
  // Asta e proprietatea de care depinde tot. Un zid care arata continuu pe ecran
  // dar are goluri in grila inseamna agenti care trec prin pereti — si o cauza
  // pe care n-ai gasi-o niciodata privind zidul.
  for (let g = 0; g < 180; g += 3) {
    assert.ok(taie(g, Acoperire.ORICE), `zidul curge la ${g} de grade`)
  }
})

test('CURGE: acelasi zid, cu regula CENTRU, chiar are goluri', () => {
  // Proba negativa a testului de mai sus. Daca ASTA n-ar pica, „etans" n-ar
  // dovedi nimic: ar putea fi adevarat din intamplare, pentru orice regula.
  let curse = 0
  for (let g = 0; g < 180; g += 3) {
    if (!taie(g, Acoperire.CENTRU)) curse++
  }
  assert.ok(curse > 0, 'CENTRU n-a curs niciodata — testul de etanseitate nu dovedeste nimic')
})

// --- marginea de SUS --------------------------------------------------------

test('MARGINE: fiecare celula din amprenta e CHIAR atinsa de cladire', () => {
  // Toate probele de mai sus sunt margini INFERIOARE: amprenta sa nu fie prea
  // mica. Niciuna n-o marginea de sus. Daca o axa din testul SAT dispare la un
  // refactor, amprenta se umfla pana la cutia de incadrare — o cladire de 1 x 10 m
  // la 45 de grade ar ocupa 64 de celule in loc de 22 — iar agentii ar fi refuzati
  // pe pamant gol, la cativa metri de zid. Toate cele sapte teste ar ramane verzi.
  //
  // Oracolul e independent de codul testat: se esantioneaza puncte in celula si
  // se cere ca macar unul sa cada in dreptunghi, cu aritmetica in virgula mobila,
  // nu cu acelasi SAT intreg.
  const N = 24
  for (const [hw, hh] of [[2000, 1500], [500, 5000], [6000, 3500], [1000, 1000]] as const) {
    for (const g of [0, 17, 30, 45, 61, 90, 123]) {
      const p = poza(9_500, 7_500, hw, hh, g)
      const a = amprenta(p, Acoperire.ORICE)
      assert.ok(a.length > 0, `amprenta goala la ${hw}x${hh} @ ${g}`)

      const ux = p.dirX / DIR_ONE
      const uy = p.dirY / DIR_ONE
      for (let i = 0; i < a.length; i += 2) {
        const cx = a[i]!
        const cy = a[i + 1]!
        let atinsa = false
        for (let sy = 0; sy <= N && !atinsa; sy++) {
          for (let sx = 0; sx <= N && !atinsa; sx++) {
            const px = (cx + sx / N) * 1000 - p.x
            const py = (cy + sy / N) * 1000 - p.y
            const pe = Math.abs(px * ux + py * uy)
            const pn = Math.abs(-px * uy + py * ux)
            // O toleranta de o zecime de milimetru, pentru rotunjirea din Q14.
            if (pe <= hw + 0.1 && pn <= hh + 0.1) atinsa = true
          }
        }
        assert.ok(atinsa, `celula (${cx},${cy}) e in amprenta dar NU e atinsa de ${hw}x${hh} @ ${g}`)
      }
    }
  }
})

test('o dimensiune NEGATIVA e refuzata, si nu produce o amprenta goala', () => {
  // Un UI de constructie calculeaza jumatatea de dimensiune dintr-un drag. Primul
  // drag facut de la dreapta spre stanga da un `halfW` negativ. Pana acum
  // `verificaOrientare` era singura validare, iar o dimensiune negativa producea
  // o amprenta GOALA: cladirea se desena identic si nu bloca nimic.
  const rea: Poza = { ...poza(5_000, 5_000, 2_000, 1_000, 30), halfW: -2_000 }
  const out = verificaPoza(rea)
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.VALOARE_INVALIDA)
    assert.equal(out.params.camp, 'dimensiuni')
  }
  assert.equal(verificaPoza(poza(5_000, 5_000, 2_000, 1_000, 30)).ok, true, 'o poza buna a fost refuzata')

  // Si daca cineva ocoleste verificarea, modul de esec e conservator: amprenta
  // iese cel putin la fel de mare, niciodata goala.
  const bun = amprenta(poza(5_000, 5_000, 2_000, 1_000, 30)).length
  assert.equal(amprenta(rea).length, bun, 'o dimensiune negativa a schimbat amprenta')
})

test('toleranta de orientare e destul de STRANSA cat sa nu strice geometria', () => {
  // Axele proprii nu se normalizeaza in `atingeCelula`: proiectiile se compara cu
  // `halfW * DIR_ONE`, desi raza pe axa unitate e `halfW * L`. Banda de toleranta
  // devine deci eroare de geometrie, proportionala cu marimea cladirii.
  for (let g = 0; g < 360; g++) {
    const d = dir(g)
    assert.equal(verificaOrientare(d.dirX, d.dirY).ok, true, `unghiul intreg ${g} a fost refuzat`)
  }
  // Si pe unghiuri care nu sunt grade intregi — cine roteste cu mouse-ul.
  for (let k = 0; k < 500; k++) {
    const r = (k * 0.719) % (2 * Math.PI)
    const dx = Math.round(Math.cos(r) * DIR_ONE)
    const dy = Math.round(Math.sin(r) * DIR_ONE)
    assert.equal(verificaOrientare(dx, dy).ok, true, `vectorul rotunjit de la ${r} a fost refuzat`)
  }
  // Dar un vector vizibil nenormalizat nu trece.
  assert.equal(verificaOrientare(DIR_ONE + 40, 0).ok, false, 'un vector cu 0,25% mai lung a trecut')
})
