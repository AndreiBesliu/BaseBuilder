/**
 * Grinda — S20-23, taietura 4.
 *
 * Designul a trecut printr-un panou care masoara (3 lentile, 24 de constatari, doua
 * CRITIC confirmate de cate doi verificatori): `scratchpad/design-grinda-v2.md` in
 * sesiunea din 25.09. Fisierul asta creste odata cu felia: intai indexul DERIVED al
 * grinzilor (regula de stabilitate inca neschimbata), apoi regula.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { adaugaGrinda, chunkKey, fill as fillTeren, grinziInRaza, listaGrinzi, materialAt, reconstruiesteGrinzi, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import type { IndexGrinzi } from '../src/sim/terrain/terrain.ts'
import { cadeDaca, constructiaPosibila, contoareStabilitate, esteAsezat, memorieSprijin, poateSustine, Prefiltru, prefiltruStabilitate, reseteazaContoareStabilitate, Sol, solLa, StareSapat, stareSapat, suportLa, sustinutAcum, sustinutAcumMemorat } from '../src/sim/stabilitate.ts'
import { cellKey, decodeCell } from '../src/sim/path.ts'
import { Reason } from '../src/sim/result.ts'
import { constructiaPrevizualizata } from '../src/sim/joburi.ts'
import type { World } from '../src/sim/state.ts'
import { Piesa } from '../src/sim/state.ts'
import { Item } from '../src/sim/state.ts'
import { laSit, lasaItem, panaCand, patratPlat, R, solid } from './fixturi.ts'

/** Un patrat plat de `latura` langa un sit, pe prima samanta care il are. */
function scena(latura: number): { w: World; x0: number; y0: number; g: number } {
  for (const seed of [12345, 7, 12, 17, 18, 19, 23]) {
    const { w, sit } = laSit(seed, 0)
    const T = patratPlat(w, sit, latura, 2, 40)
    if (T) return { w, x0: T.x0, y0: T.y0, g: T.g }
  }
  assert.fail(`fixtura: niciun patrat plat de ${latura}`)
}

/**
 * Indexul lumii ESTE cel reconstruit din voxeli: aceeasi lista si aceeasi forma a
 * Map-ului. `size` conteaza separat de lista — o lista ramasa goala dupa ultima
 * grinda sapata ar fi invizibila in lista, dar ar face indexul continuu diferit de
 * cel reconstruit.
 */
function indexulEReconstruit(w: World, unde: string): void {
  const out = decode(encode(w), R)
  assert.ok(out.ok, `${unde}: decode a refuzat propriul encode`)
  if (!out.ok) return
  assert.deepEqual(listaGrinzi(w.terrain.grinzi), listaGrinzi(out.value.terrain.grinzi), `${unde}: indexul continuu difera de cel reconstruit la incarcare`)
  assert.equal(w.terrain.grinzi.size, out.value.terrain.grinzi.size, `${unde}: forma indexului difera (o lista goala ramasa?)`)
  assert.equal(hashWorld(out.value), hashWorld(w), `${unde}: roundtrip-ul schimba lumea`)
}

test('indexul de grinzi e DERIVED: tinut la zi la zidire, la sapat si la prabusire, egal cu cel reconstruit la incarcare', () => {
  const { w, x0, y0, g } = scena(8)
  // Grinzi ASEZATE pe sol, pe doua randuri, cu o grinda pe cota a doua peste prima.
  for (let dx = 0; dx < 6; dx++) {
    for (const dy of [0, 3]) {
      assert.ok(applyCommand(w, { kind: 'fill', wx: x0 + dx, wy: y0 + dy, z: g + 1, material: Material.GRINDA }, R).ok, `fixtura: grinda la ${dx},${dy}`)
    }
  }
  assert.ok(applyCommand(w, { kind: 'fill', wx: x0, wy: y0, z: g + 2, material: Material.GRINDA }, R).ok)
  assert.equal(listaGrinzi(w.terrain.grinzi).length, 13, 'indexul trebuie sa vada fiecare grinda zidita')
  indexulEReconstruit(w, 'dupa zidire')

  // Sapat direct: grinda iese din index.
  assert.ok(applyCommand(w, { kind: 'dig', wx: x0 + 5, wy: y0 + 3, z: g + 1 }, R).ok)
  assert.equal(listaGrinzi(w.terrain.grinzi).length, 12)
  indexulEReconstruit(w, 'dupa sapat')

  // Prabusire: sapat sub grinda de la (x0, y0, g+1) — cea de deasupra ei (g+2)
  // ramane fara ancora si cade; molozul se aseaza, grinda moare din index pe calea
  // prabusirii, nu pe a comenzii.
  const inainte = listaGrinzi(w.terrain.grinzi).length
  assert.ok(applyCommand(w, { kind: 'dig', wx: x0, wy: y0, z: g + 1 }, R).ok)
  const m = materialAt(w.terrain, x0, y0, g + 2)
  assert.ok(m.ok && m.value !== Material.GRINDA, 'fixtura: grinda de pe cota a doua trebuia sa cada')
  assert.ok(listaGrinzi(w.terrain.grinzi).length <= inainte - 2, 'grinzile sapate si cazute trebuiau scoase din index')
  indexulEReconstruit(w, 'dupa prabusire')

  // Ultima grinda dintr-un chunk: lista lui se sterge, nu ramane goala.
  const ramase = listaGrinzi(w.terrain.grinzi)
  for (const s of ramase) {
    const [x, y, z] = s.split(',').map(Number) as [number, number, number]
    assert.ok(applyCommand(w, { kind: 'dig', wx: x, wy: y, z }, R).ok)
  }
  assert.equal(w.terrain.grinzi.size, 0, 'dupa ultima grinda sapata indexul trebuie sa fie gol, nu plin de liste goale')
  assert.equal(w.terrain.grinzi.get(chunkKey(Math.floor(x0 / 32), Math.floor(y0 / 32))), undefined)
  indexulEReconstruit(w, 'dupa ultima grinda')
})

test('un pion zideste o GRINDA prin job, din piatra, iar indexul o vede — si o vede si lumea incarcata', () => {
  const { w, x0, y0, g } = scena(8)
  const pusa = applyCommand(w, { kind: 'desemneaza', wx: x0 + 5, wy: y0 + 2, z: g + 1, piesa: Piesa.GRINDA }, R)
  assert.ok(pusa.ok, `desemnarea GRINDA refuzata: ${JSON.stringify(pusa)}`)
  lasaItem(w, Item.PIATRA, R.piese[Piesa.GRINDA]!.cantitate, x0 + 1, y0 + 2)
  const gp = solid(w, x0 + 2, y0 + 2)
  assert.notEqual(gp, null)
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (x0 + 2) * 1000 + 500, y: (y0 + 2) * 1000 + 500, z: gp! + 1, faction: 0 }, R).ok)
  let verificari = 0
  const n = panaCand(w, 3000, (w) => {
    if (w.tick % 50 === 0) { indexulEReconstruit(w, `tickul ${w.tick}`); verificari++ }
    const m = materialAt(w.terrain, x0 + 5, y0 + 2, g + 1)
    return m.ok && m.value === Material.GRINDA
  })
  assert.ok(n >= 0, 'grinda nu s-a zidit in 3000 de tickuri')
  assert.ok(verificari > 0)
  assert.deepEqual(listaGrinzi(w.terrain.grinzi), [`${x0 + 5},${y0 + 2},${g + 1}`])
  indexulEReconstruit(w, 'dupa zidirea prin job')
})

test('reconstructia din voxeli e aceeasi functie pe care o foloseste decode: pe lumea continua, nu schimba nimic', () => {
  const { w, x0, y0, g } = scena(6)
  for (let dx = 0; dx < 4; dx++) assert.ok(applyCommand(w, { kind: 'fill', wx: x0 + dx, wy: y0, z: g + 1, material: Material.GRINDA }, R).ok)
  const inainte = listaGrinzi(w.terrain.grinzi)
  const size = w.terrain.grinzi.size
  reconstruiesteGrinzi(w.terrain)
  assert.deepEqual(listaGrinzi(w.terrain.grinzi), inainte)
  assert.equal(w.terrain.grinzi.size, size)
})

// ---------------------------------------------------------------------------
// regula stratificata
// ---------------------------------------------------------------------------

/**
 * ORACOLUL: regula din definitie, prin recalcul complet pe o cutie — fara index, fara
 * `suportLa`, fara invalidare. Citeste terenul doar prin `solLa`/`esteAsezat` (stratul
 * de citire, nu regula) si materialul prin `materialAt`.
 *
 *   s0 = suportMax − d0, d0 = BFS multi-sursa din celulele ASEZATE, prin solid;
 *   grinda activa ⇔ material GRINDA si s0 > 0;
 *   s1 = suportRazaGrinda − d1, d1 = BFS multi-sursa din grinzile active, prin solid;
 *   suport = max(s0, s1); cade tot ce are suport 0, pana la punct fix.
 *
 * Doar celulele din cutia INTERIOARA (marginea `m` scoasa) se judeca: la marginea cutiei
 * un drum de sprijin poate iesi din ea.
 */
interface Cutie { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number }

function suportOracol(w: World, c: Cutie, cazute: Set<number>): Map<number, number> {
  const t = w.terrain
  const out = new Map<number, number>()
  for (let z = c.z0; z <= c.z1; z++) {
    const solid = (x: number, y: number): boolean => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1 && solLa(t, x, y, z, cazute) === Sol.SOLID
    const bfs = (surse: number[][], plafon: number): Map<number, number> => {
      const d = new Map<number, number>()
      let coada = surse
      for (const [x, y] of surse) d.set(cellKey(x!, y!, z), 0)
      for (let pas = 1; pas <= plafon && coada.length > 0; pas++) {
        const urm: number[][] = []
        for (const [x, y] of coada) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x! + dx
            const ny = y! + dy
            if (!solid(nx, ny) || d.has(cellKey(nx, ny, z))) continue
            d.set(cellKey(nx, ny, z), pas)
            urm.push([nx, ny])
          }
        }
        coada = urm
      }
      return d
    }
    const asezate: number[][] = []
    for (let x = c.x0; x <= c.x1; x++) for (let y = c.y0; y <= c.y1; y++) if (solid(x, y) && esteAsezat(t, x, y, z, cazute)) asezate.push([x, y])
    const d0 = bfs(asezate, R.suportMax)
    const active: number[][] = []
    for (let x = c.x0; x <= c.x1; x++) {
      for (let y = c.y0; y <= c.y1; y++) {
        if (!solid(x, y)) continue
        const m = materialAt(t, x, y, z)
        const dd = d0.get(cellKey(x, y, z))
        if (m.ok && m.value === Material.GRINDA && dd !== undefined && R.suportMax - dd > 0) active.push([x, y])
      }
    }
    const d1 = bfs(active, R.suportRazaGrinda)
    for (let x = c.x0; x <= c.x1; x++) {
      for (let y = c.y0; y <= c.y1; y++) {
        if (!solid(x, y)) continue
        const k = cellKey(x, y, z)
        const a = d0.has(k) ? Math.max(0, R.suportMax - d0.get(k)!) : 0
        const b = d1.has(k) ? Math.max(0, R.suportRazaGrinda - d1.get(k)!) : 0
        out.set(k, Math.max(a, b))
      }
    }
  }
  return out
}

function interior(c: Cutie, m: number): (x: number, y: number) => boolean {
  return (x, y) => x >= c.x0 + m && x <= c.x1 - m && y >= c.y0 + m && y <= c.y1 - m
}

/** Ce cade dupa oracol daca dispar `sapate`: punct fix pe cutie. Cheile sortate, fara sapate. */
function cadeOracol(w: World, c: Cutie, sapate: number[]): number[] {
  const cazute = new Set<number>(sapate)
  for (;;) {
    const s = suportOracol(w, c, cazute)
    let nou = false
    for (const [k, v] of s) if (v === 0 && !cazute.has(k)) { cazute.add(k); nou = true }
    if (!nou) break
  }
  const sap = new Set(sapate)
  return [...cazute].filter((k) => !sap.has(k)).sort((a, b) => a - b)
}

/** Celulele solide cu suport 0 dupa oracol, in cutia interioara — pe o stare care ar trebui sa fie punct fix. */
function plutitori(w: World, c: Cutie, m: number): number {
  const inauntru = interior(c, m)
  let n = 0
  for (const [k, v] of suportOracol(w, c, new Set())) {
    const x = k % WORLD_CELLS
    const y = Math.floor(k / WORLD_CELLS) % WORLD_CELLS
    if (v === 0 && inauntru(x, y)) n++
  }
  return n
}

/** Un zid asezat pe sol, pe randul x0, pana la cota zf. */
function zid(w: World, x0: number, y0: number, lung: number, g: number, zf: number): void {
  for (let dy = 0; dy < lung; dy++) {
    for (let z = g + 1; z <= zf; z++) assert.ok(applyCommand(w, { kind: 'fill', wx: x0, wy: y0 + dy, z, material: Material.PIATRA_CONSTRUITA }, R).ok, `fixtura: zidul la ${dy},${z}`)
  }
}

/**
 * Construieste un plan pe calea REALA (comanda `fill`, deci `poateSustine`), in ordinea
 * data, cu treceri repetate pana la punct fix. Intoarce ce s-a construit.
 */
function construiesteIncremental(w: World, plan: readonly (readonly [number, number, number, number])[]): Set<number> {
  const facute = new Set<number>()
  for (let adaugat = true; adaugat;) {
    adaugat = false
    for (const [x, y, z, mat] of plan) {
      const k = cellKey(x, y, z)
      if (facute.has(k)) continue
      if (applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: mat as 6 }, R).ok) { facute.add(k); adaugat = true }
    }
  }
  return facute
}

test('fasia din zid: 3 celule fara grinda; cu o grinda la x = 3 ajunge la 12, iar a 13-a e refuzata', () => {
  for (const cuGrinda of [false, true]) {
    const { w, x0, y0, g } = scena(16)
    const zf = g + 2
    zid(w, x0, y0, 1, g, zf)
    const plan: [number, number, number, number][] = []
    for (let dx = 1; dx <= 14; dx++) plan.push([x0 + dx, y0, zf, cuGrinda && dx === 3 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
    const facute = construiesteIncremental(w, plan)
    let pana = 0
    for (let dx = 1; dx <= 14; dx++) if (facute.has(cellKey(x0 + dx, y0, zf))) pana = dx
    assert.equal(facute.size, pana, 'fixtura: fasia trebuie sa fie continua')
    assert.equal(pana, cuGrinda ? 12 : 3, `${cuGrinda ? 'cu' : 'fara'} grinda: fasia ajunge la ${pana}`)
    assert.equal(plutitori(w, { x0: x0 - 16, y0: y0 - 16, x1: x0 + 30, y1: y0 + 16, z0: zf, z1: zf }, 14), 0)
  }
})

test('placa peste un stalp: 25 de celule fara grinda, 181 cu una PUSA PE stalp, 313 cu patru la 3 pasi — pe calea reala si in inchidere', () => {
  // Cazul-vitrina din OWNER_VERIFY 12 n-avea niciun test (recenzia din 26.09): grinda pusa PE
  // capul stalpului e ASEZATA, dar n-are niciun vecin asezat — toata placa din jur sta peste
  // aer. Scoasa scurtatura „asezat" din activitate, grinda devenea inactiva, iar placa scadea
  // la 25, cu toata suita verde.
  const { w: w0, sit } = laSit(12345, 0)
  let gmax = -1 << 20
  for (let dx = -12; dx <= 12; dx++) {
    for (let dy = -12; dy <= 12; dy++) {
      const gs = solid(w0, sit.wx + dx, sit.wy + dy)
      assert.notEqual(gs, null, 'fixtura: apa sub placa')
      if (gs! > gmax) gmax = gs!
    }
  }
  const zf = gmax + 3
  const cx = sit.wx
  const cy = sit.wy
  const cazuri: [string, (dx: number, dy: number) => boolean, number][] = [
    ['fara grinda', () => false, 25],
    ['o grinda pe capul stalpului', (dx, dy) => dx === 0 && dy === 0, 181],
    ['patru grinzi la 3 pasi', (dx, dy) => (Math.abs(dx) === 3 && dy === 0) || (Math.abs(dy) === 3 && dx === 0), 313],
  ]
  for (const [nume, eGrinda, asteptat] of cazuri) {
    const { w } = laSit(12345, 0)
    for (let z = solid(w, cx, cy)! + 1; z < zf; z++) assert.ok(applyCommand(w, { kind: 'fill', wx: cx, wy: cy, z, material: Material.PIATRA_CONSTRUITA }, R).ok, 'fixtura: stalpul')
    const plan: [number, number, number, number][] = []
    for (let dx = -12; dx <= 12; dx++) {
      for (let dy = -12; dy <= 12; dy++) plan.push([cx + dx, cy + dy, zf, eGrinda(dx, dy) ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
    }
    const celule = plan.map(([x, y, z]) => cellKey(x, y, z))
    const grinziPlan = plan.filter(([, , , m]) => m === Material.GRINDA).map(([x, y, z]) => cellKey(x, y, z))
    const { construibile } = constructiaPosibila(w.terrain, R, celule, grinziPlan)
    const facute = construiesteIncremental(w, plan)
    assert.equal(facute.size, asteptat, `${nume}: placa are ${facute.size} celule`)
    assert.deepEqual([...facute].sort((a, b) => a - b), construibile, `${nume}: inchiderea difera de constructia reala`)
    assert.equal(plutitori(w, { x0: cx - 14, y0: cy - 14, x1: cx + 14, y1: cy + 14, z0: zf, z1: zf }, 0), 0, `${nume}: plutitori`)
    if (asteptat === 181) assert.equal(suportLa(w.terrain, R, cx, cy, zf), R.suportRazaGrinda, 'grinda de pe stalp e activa si tine cu raza ei')
  }
})

test('suportLa e EXACT langa grinzi: grinda activa are suportRazaGrinda, fasia coboara cu cate unu, ca oracolul', () => {
  // Designul (punctul 7) cere `suportLa` exact = max(s0, s1). Testele se uitau doar la celule cu
  // s0 = 0; scurtatura „celula E o grinda activa -> R" se putea scoate (grinda raspundea 1), iar
  // overlay-ul arata atunci ULTIMA CELULA in loc de SIGUR pe sase celule ale fasiei.
  const { w, x0, y0, g } = scena(16)
  const zf = g + 2
  zid(w, x0, y0, 1, g, zf)
  const plan: [number, number, number, number][] = []
  for (let dx = 1; dx <= 12; dx++) plan.push([x0 + dx, y0, zf, dx === 3 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
  assert.equal(construiesteIncremental(w, plan).size, 12, 'fixtura: fasia intreaga')
  const oracol = suportOracol(w, { x0: x0 - 16, y0: y0 - 16, x1: x0 + 30, y1: y0 + 16, z0: zf, z1: zf }, new Set())
  assert.equal(suportLa(w.terrain, R, x0 + 3, y0, zf), R.suportRazaGrinda, 'grinda activa')
  for (let dx = 1; dx <= 12; dx++) {
    assert.equal(suportLa(w.terrain, R, x0 + dx, y0, zf), oracol.get(cellKey(x0 + dx, y0, zf)), `fasia la x = ${dx}`)
  }
  assert.equal(suportLa(w.terrain, R, x0 + 12, y0, zf), 1, 'capatul fasiei, la 9 pasi de grinda')
})

test('grinzile NU se tin una pe alta: o a doua grinda, tinuta doar de prima, nu duce fasia mai departe', () => {
  const { w, x0, y0, g } = scena(18)
  const zf = g + 2
  zid(w, x0, y0, 1, g, zf)
  const plan: [number, number, number, number][] = []
  for (let dx = 1; dx <= 17; dx++) plan.push([x0 + dx, y0, zf, dx === 3 || dx === 12 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
  const facute = construiesteIncremental(w, plan)
  assert.ok(facute.has(cellKey(x0 + 12, y0, zf)), 'fixtura: a doua grinda trebuia sa se poata zidi (o tine prima)')
  assert.ok(!facute.has(cellKey(x0 + 13, y0, zf)), 'a doua grinda, inactiva, a dus fasia mai departe: grinzile s-au inlantuit')
  assert.equal(suportLa(w.terrain, R, x0 + 12, y0, zf), 1, 'a doua grinda e tinuta de prima, la 9 pasi')
})

test('o grinda plutitoare nu tine nimic: 31 de grinzi puse direct in cer au suport 0, si nimic nu se zideste langa ele', () => {
  const { w, x0, y0, g } = scena(8)
  const z = g + 12
  for (let dx = 0; dx < 31; dx++) assert.ok(fillTeren(w.terrain, x0 + dx - 8, y0 + 4, z, Material.GRINDA).ok)
  for (let dx = 0; dx < 31; dx++) assert.equal(suportLa(w.terrain, R, x0 + dx - 8, y0 + 4, z), 0, `grinda plutitoare ${dx} are suport`)
  const langa = poateSustine(w.terrain, R, x0 + 3, y0 + 5, z)
  assert.equal(langa.ok, false, 'o piesa langa grinzile plutitoare trebuie refuzata')
})

test('„De ce nu?" deosebeste: nu atinge nimic; grinda INACTIVA care ar tine; grinda activa PREA DEPARTE pe drum; grinda nelegata; nicio grinda', () => {
  const caz = (o: ReturnType<typeof poateSustine>): string => (o.ok ? 'ok' : String(o.params.caz))
  // (a) Fasia din OWNER_VERIFY 12: grinda activa la x = 3, podea pana la 12. A 13-a e la
  //     10 pasi de grinda — raspunsul trebuie sa o NUMEASCA, cu distanta, nu „nicio grinda".
  {
    const { w, x0, y0, g } = scena(16)
    const zf = g + 2
    zid(w, x0, y0, 1, g, zf)
    const plan: [number, number, number, number][] = []
    for (let dx = 1; dx <= 12; dx++) plan.push([x0 + dx, y0, zf, dx === 3 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
    assert.equal(construiesteIncremental(w, plan).size, 12, 'fixtura: fasia de 12')
    const a13 = applyCommand(w, { kind: 'fill', wx: x0 + 13, wy: y0, z: zf, material: Material.PIATRA_CONSTRUITA }, R)
    assert.equal(a13.ok, false)
    if (!a13.ok) {
      assert.equal(a13.reason, Reason.FARA_SPRIJIN)
      assert.equal(caz(a13), 'GRINDA_PREA_DEPARTE')
      assert.equal(a13.params.grindaX, x0 + 3)
      assert.equal(a13.params.grindaD, 10)
      assert.equal(a13.params.grindaActiva, 1)
      assert.equal(a13.params.sprijinD, 13)
    }
    // (b) Celula fara niciun vecin solid la cota ei: grinda activa la Manhattan 4 NU e raspunsul.
    const faraDrum = poateSustine(w.terrain, R, x0 + 5, y0 + 2, zf)
    assert.equal(caz(faraDrum), 'NU_ATINGE')
    if (!faraDrum.ok) assert.equal(faraDrum.params.grindaX, undefined)
  }
  // (c) A doua grinda, tinuta doar de prima: e ea cea care ar tine a 13-a (la 1 pas), deci
  //     raspunsul e „grinda asta e inactiva", nu „grinda de la x = 3 e prea departe".
  {
    const { w, x0, y0, g } = scena(18)
    const zf = g + 2
    zid(w, x0, y0, 1, g, zf)
    const plan: [number, number, number, number][] = []
    for (let dx = 1; dx <= 12; dx++) plan.push([x0 + dx, y0, zf, dx === 3 || dx === 12 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
    assert.equal(construiesteIncremental(w, plan).size, 12, 'fixtura: fasia de 12 cu doua grinzi')
    const o = poateSustine(w.terrain, R, x0 + 13, y0, zf)
    assert.equal(caz(o), 'GRINDA_INACTIVA')
    if (!o.ok) {
      assert.equal(o.params.grindaX, x0 + 12)
      assert.equal(o.params.grindaD, 1)
      assert.equal(o.params.grindaActiva, 0)
    }
  }
  // (d) Doua fasii paralele din acelasi zid, cu aer intre ele. Cea mai apropiata grinda pe
  //     Manhattan e a fasiei B (3 pasi, nelegata, inactiva); cea care conteaza e a fasiei A.
  {
    const { w, x0, y0, g } = scena(18)
    const zf = g + 2
    zid(w, x0, y0, 5, g, zf)
    const plan: [number, number, number, number][] = []
    for (let dx = 1; dx <= 12; dx++) plan.push([x0 + dx, y0, zf, dx === 3 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
    for (let dx = 1; dx <= 12; dx++) plan.push([x0 + dx, y0 + 2, zf, dx === 3 || dx === 12 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
    assert.equal(construiesteIncremental(w, plan).size, 24, 'fixtura: doua fasii de 12')
    const o = poateSustine(w.terrain, R, x0 + 13, y0, zf)
    assert.equal(caz(o), 'GRINDA_PREA_DEPARTE')
    if (!o.ok) { assert.equal(o.params.grindaX, x0 + 3); assert.equal(o.params.grindaY, y0); assert.equal(o.params.grindaD, 10) }
  }
  // (e) Grinda in raza, dar nelegata prin solid; (f) nicio grinda: cel mai apropiat sprijin.
  {
    const { w, x0, y0, g } = scena(16)
    const zf = g + 2
    zid(w, x0, y0, 1, g, zf)
    zid(w, x0, y0 + 2, 1, g, zf)
    const plan: [number, number, number, number][] = []
    for (let dx = 1; dx <= 3; dx++) plan.push([x0 + dx, y0, zf, dx === 3 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
    for (let dx = 1; dx <= 3; dx++) plan.push([x0 + dx, y0 + 2, zf, Material.PIATRA_CONSTRUITA])
    for (let dx = 1; dx <= 3; dx++) plan.push([x0 + dx, y0 + 12, zf, Material.PIATRA_CONSTRUITA])
    zid(w, x0, y0 + 12, 1, g, zf)
    assert.equal(construiesteIncremental(w, plan).size, 9, 'fixtura: trei fasii de 3')
    const nelegata = poateSustine(w.terrain, R, x0 + 4, y0 + 2, zf)
    assert.equal(caz(nelegata), 'GRINDA_NELEGATA')
    if (!nelegata.ok) { assert.equal(nelegata.params.grindaX, x0 + 3); assert.equal(nelegata.params.grindaD, undefined); assert.equal(nelegata.params.sprijinD, 4) }
    const nicio = poateSustine(w.terrain, R, x0 + 4, y0 + 12, zf)
    assert.equal(caz(nicio), 'NICIO_GRINDA')
    if (!nicio.ok) { assert.equal(nicio.params.grindaX, undefined); assert.equal(nicio.params.sprijinD, 4) }
  }
})

test('poarta scanerului, din memorie: dupa o editare raspunde ca poarta calculata — grinda care devine ACTIVA, alt teren, alte reguli', () => {
  // Memoria (`sustinutAcumMemorat`) e cheiata pe (teren, reguli, epoca). Fiecare pas de
  // mai jos schimba EXACT o componenta a cheii si cere raspunsul calculat; o memorie
  // care uita una dintre ele raspunde cu cel vechi. Lumile continua si incarcata ar
  // diverge din asta: memoria nu se salveaza.
  const lumi = [scena(16), scena(16)]
  for (const { w, x0, y0, g } of lumi) {
    const zf = g + 2
    zid(w, x0, y0, 1, g, zf)
    // Consola cu doua grinzi: cea de la 3 e activa, cea de la 8 e INACTIVA (la 8 de zid),
    // tinuta de prima. Santierul de la 13 e la 10 de prima, deci imposibil.
    const plan: [number, number, number, number][] = []
    for (let dx = 1; dx <= 12; dx++) plan.push([x0 + dx, y0, zf, dx === 3 || dx === 8 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
    assert.equal(construiesteIncremental(w, plan).size, 12, 'fixtura: consola trebuia zidita pana la 12')
  }
  const [A, B] = lumi
  const zf = A.g + 2
  const santier = (L: { x0: number; y0: number }): [number, number, number] => [L.x0 + 13, L.y0, zf]
  const inainte = poateSustine(A.w.terrain, R, ...santier(A))
  assert.equal(inainte.ok, false, 'fixtura: santierul trebuia sa fie imposibil inainte de stalp')
  if (!inainte.ok) assert.equal(inainte.params.grindaActiva, 0, 'fixtura: grinda de la 8 trebuia sa fie inactiva')

  const m = memorieSprijin()
  assert.equal(sustinutAcumMemorat(A.w.terrain, R, ...santier(A), m), false)
  // Un stalp langa grinda de la 8 o face ACTIVA; pe B, stalpul e departe de ea. Acelasi
  // numar de editari pe ambele terenuri, deci aceeasi epoca.
  zid(A.w, A.x0 + 8, A.y0 + 1, 1, A.g, zf)
  zid(B.w, B.x0 + 8, B.y0 + 6, 1, B.g, zf)
  assert.equal(A.w.terrain.editari, B.w.terrain.editari, 'fixtura: cele doua terenuri trebuiau sa aiba aceeasi epoca')
  assert.equal(poateSustine(A.w.terrain, R, ...santier(A)).ok, true, 'fixtura: stalpul trebuia sa activeze grinda')
  assert.equal(poateSustine(B.w.terrain, R, ...santier(B)).ok, false, 'fixtura: pe B santierul ramane imposibil')
  const R5 = { ...R, suportRazaGrinda: 5 }
  assert.equal(poateSustine(A.w.terrain, R5, ...santier(A)).ok, false, 'fixtura: cu raza 5 santierul e la 5 de grinda, deci imposibil')

  assert.equal(sustinutAcumMemorat(A.w.terrain, R, ...santier(A), m), true, 'dupa stalp, memoria a raspuns cu refuzul (sau cu activitatea) de dinainte')
  assert.equal(sustinutAcumMemorat(B.w.terrain, R, ...santier(B), m), false, 'memoria a raspuns pentru terenul B cu raspunsul terenului A')
  assert.equal(sustinutAcumMemorat(A.w.terrain, R, ...santier(A), m), true)
  assert.equal(sustinutAcumMemorat(A.w.terrain, R5, ...santier(A), m), false, 'memoria a raspuns cu alte reguli')
})

test('K05: poarta scanerului pe o podea de grinzi cu centrul imposibil — activitatea doar unde ajunge drumul, o data pe epoca, apoi nimic', () => {
  // Masurat de lentila de cost (recenzia taieturii 4): pe o sala de 41×41 cu podea din
  // grinzi, o trecere a portii peste cele 225 de santiere imposibile facea 16.005 BFS-uri
  // de activitate — la fiecare scanare, fara nicio munca. Aici, o sala de 31: centrul de
  // 5×5 e la peste 12 de zid, deci imposibil.
  // Ca la tavanul de mai sus: podeaua deasupra celui mai inalt sol, zidul din sol pana la
  // ea — nu cere teren plat, doar uscat.
  const L = 31
  const { w, sit } = laSit(12345, 0)
  const x0 = sit.wx
  const y0 = sit.wy
  let gmax = -1 << 20
  for (let dx = 0; dx < L; dx++) {
    for (let dy = 0; dy < L; dy++) {
      const gs = solid(w, x0 + dx, y0 + dy)
      assert.notEqual(gs, null, 'fixtura: apa sub sala')
      if (gs! > gmax) gmax = gs!
    }
  }
  const zf = gmax + 2
  for (let dx = 0; dx < L; dx++) {
    for (let dy = 0; dy < L; dy++) {
      if (dx !== 0 && dy !== 0 && dx !== L - 1 && dy !== L - 1) continue
      for (let z = solid(w, x0 + dx, y0 + dy)! + 1; z <= zf; z++) assert.ok(fillTeren(w.terrain, x0 + dx, y0 + dy, z, Material.PIATRA_CONSTRUITA).ok)
    }
  }
  const plan: [number, number, number, number][] = []
  for (let dx = 1; dx < L - 1; dx++) for (let dy = 1; dy < L - 1; dy++) plan.push([x0 + dx, y0 + dy, zf, Material.GRINDA])
  const facute = construiesteIncremental(w, plan)
  const ramase = plan.filter(([x, y, z]) => !facute.has(cellKey(x, y, z)))
  assert.equal(ramase.length, 25, `fixtura: ${ramase.length} santiere imposibile, nu centrul de 5×5`)

  // (1) LENES: un santier fara niciun vecin solid nu calculeaza nicio activitate, desi
  // are ~180 de grinzi candidate in raza.
  const centru = ramase.find(([x, y]) => x === x0 + 15 && y === y0 + 15)!
  const candidati: number[] = []
  grinziInRaza(w.terrain.grinzi, centru[0], centru[1], zf, R.suportRazaGrinda - 1, candidati)
  assert.ok(candidati.length / 2 > 100, 'fixtura: centrul trebuia sa aiba grinzi candidate in raza')
  reseteazaContoareStabilitate()
  assert.equal(sustinutAcum(w.terrain, R, centru[0], centru[1], zf, null), false)
  assert.equal(contoareStabilitate.activitati, 0, `${contoareStabilitate.activitati} activitati pentru un santier la care nu duce niciun drum`)

  // (2) O trecere prin memorie: fiecare grinda cel mult o data, si doar dintre cele la
  // care ajunge BFS-ul (la ≤ 9 de un santier ramas).
  const aproape = new Set<number>()
  for (const [x, y] of ramase) {
    const l: number[] = []
    grinziInRaza(w.terrain.grinzi, x, y, zf, R.suportRazaGrinda - 1, l)
    for (let i = 0; i < l.length; i += 2) aproape.add(cellKey(l[i]!, l[i + 1]!, zf))
  }
  const m = memorieSprijin()
  reseteazaContoareStabilitate()
  for (const [x, y, z] of ramase) assert.equal(sustinutAcumMemorat(w.terrain, R, x, y, z, m), false)
  const oTrecere = contoareStabilitate.activitati
  assert.ok(oTrecere > 0, 'fixtura: marginea centrului trebuia sa ajunga la grinzi inactive')
  assert.ok(oTrecere <= aproape.size, `${oTrecere} activitati pe o trecere, peste cele ${aproape.size} grinzi din raza santierelor`)

  // (3) A doua trecere, pe acelasi teren: nimic.
  reseteazaContoareStabilitate()
  for (const [x, y, z] of ramase) assert.equal(sustinutAcumMemorat(w.terrain, R, x, y, z, m), false)
  assert.equal(contoareStabilitate.activitati, 0, 'a doua trecere pe acelasi teren a recalculat activitati')
  assert.equal(contoareStabilitate.interogariS1, 0, 'a doua trecere pe acelasi teren a reintrebat santierele')
})

test('S6d: sapi grinda, iar inelul de langa ea e tinut de un STALP — ce cade = previzualizarea = oracolul, zero plutitori', () => {
  // Defectul CRITIC al panoului, gasit de doua lentile: `sapaVoxel` sapa intai, deci
  // grinda iesea din index inainte ca invalidarea sa-i emita discul de 9. Cand inelul
  // de raza 3 din jurul ei e tinut de altceva, cascada nu porneste, si podeaua tinuta
  // doar de grinda ramane in aer: 58 de voxeli, cu previzualizarea spunand CADE.
  // Conditia exacta: nicio ALTA grinda la cel mult 9 pe cota ei (altfel discul 3 o
  // maschează), si stalpul la cel mult 3 pasi. Controlul fara stalp: cascada prinde tot.
  for (const cuStalp of [true, false]) {
    const { w, x0, y0, g } = scena(16)
    const zf = g + 2
    zid(w, x0, y0, 12, g, zf)
    if (cuStalp) assert.ok(applyCommand(w, { kind: 'fill', wx: x0 + 5, wy: y0 + 7, z: g + 1, material: Material.PIATRA_CONSTRUITA }, R).ok)
    const plan: [number, number, number, number][] = []
    for (let dx = 1; dx <= 14; dx++) {
      for (let dy = 0; dy < 12; dy++) plan.push([x0 + dx, y0 + dy, zf, dx === 3 && dy === 7 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
    }
    construiesteIncremental(w, plan)
    assert.deepEqual(listaGrinzi(w.terrain.grinzi), [`${x0 + 3},${y0 + 7},${zf}`], 'fixtura: exact o grinda, fara alta in raza')
    const cutie = { x0: x0 - 14, y0: y0 - 14, x1: x0 + 28, y1: y0 + 26, z0: zf, z1: zf }
    assert.equal(plutitori(w, cutie, 12), 0, 'fixtura: constructia porneste fara plutitori')
    const e = cellKey(x0 + 3, y0 + 7, zf)
    const previz = cadeDaca(w.terrain, R, [e])
    const oracol = cadeOracol(w, cutie, [e])
    // Multimi, nu ordini: `cadeDaca` sorteaza pe (z, x, y), oracolul pe cheie.
    assert.deepEqual([...previz].sort((a, b) => a - b), oracol, 'previzualizarea difera de oracol')
    assert.ok(previz.length > 0, 'fixtura: sapatul grinzii trebuia sa doboare ceva')
    assert.ok(applyCommand(w, { kind: 'dig', wx: x0 + 3, wy: y0 + 7, z: zf }, R).ok)
    assert.equal(plutitori(w, cutie, 12), 0, `${cuStalp ? 'cu' : 'fara'} stalp: dupa sapat au ramas voxeli cu suport 0 in aer`)
    for (const k of previz) {
      const x = k % WORLD_CELLS
      const y = Math.floor(k / WORLD_CELLS) % WORLD_CELLS
      const m = materialAt(w.terrain, x, y, zf)
      assert.ok(m.ok && m.value !== Material.PIATRA_CONSTRUITA, 'o celula din previzualizare n-a cazut')
    }
  }
})

test('S6e: o grinda care se DEZACTIVEAZA fara sa cada isi re-verifica discul — la sapat, in cascada si in inchidere', () => {
  // Discul (b) exista pentru un singur caz: o grinda B ramane in picioare (o tine prin
  // s1 alta grinda, B'), dar isi pierde activitatea. Ce tinea DOAR B, la 9 pasi de ea,
  // e la 10 de sapatura — in afara discului (c) — iar celulele de pe drum le tine un
  // stalp, deci nicio cascada nu ajunge acolo. Scena aleatoare nu o nimereste.
  //
  //   zid ── B'(3) ─────── B(11) ─ pinten(12)           (randul yr)
  //                         │
  //                  k (yr+1), S1 (yr+2, pe stalp)       (coloana x = 11)
  //                  yr−1 … yr−8 (S2 pe stalp la yr−5), h (yr−9)
  //
  // B e activa prin k → S1 (d0 = 2). h sta doar prin B (d1 = 9; S2 e la 4).
  const { w, x0, y0, g } = scena(16)
  const zf = g + 3
  const yr = y0 + 12
  const cx = x0 + 11
  zid(w, x0, yr, 1, g, zf)
  for (const sy of [yr + 2, yr - 5]) {
    for (let z = g + 1; z < zf; z++) assert.ok(applyCommand(w, { kind: 'fill', wx: cx, wy: sy, z, material: Material.PIATRA_CONSTRUITA }, R).ok, `fixtura: stalpul de la ${sy - yr}`)
  }
  // Ordinea din plan conteaza pentru inchidere: B se zideste (prin s1 din B') INAINTE ca
  // drumul ei spre S1 sa existe, deci prima ei activitate e „inactiva".
  const plan: [number, number, number, number][] = []
  for (let dx = 1; dx <= 11; dx++) plan.push([x0 + dx, yr, zf, dx === 3 || dx === 11 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
  for (let dy = 1; dy <= 9; dy++) plan.push([cx, yr - dy, zf, Material.PIATRA_CONSTRUITA])
  plan.push([cx, yr + 1, zf, Material.PIATRA_CONSTRUITA], [cx, yr + 2, zf, Material.PIATRA_CONSTRUITA], [cx + 1, yr, zf, Material.PIATRA_CONSTRUITA])
  const h = cellKey(cx, yr - 9, zf)

  // Inchiderea, pe lumea cu stalpii dar fara plan, = constructia incrementala.
  const celule = plan.map(([x, y, z]) => cellKey(x, y, z))
  const grinzi = [cellKey(x0 + 3, yr, zf), cellKey(cx, yr, zf)]
  const { construibile } = constructiaPosibila(w.terrain, R, celule, grinzi)
  assert.ok(construibile.includes(h), 'inchiderea nu promite capatul tinut doar de B: o activitate „inactiva" a ramas in memorie')
  const facute = construiesteIncremental(w, plan)
  assert.equal(facute.size, plan.length, 'fixtura: planul trebuia construit intreg')
  assert.deepEqual([...facute].sort((a, b) => a - b), construibile, 'inchiderea difera de constructia incrementala')
  const cutie = { x0: x0 - 14, y0: y0 - 14, x1: x0 + 28, y1: y0 + 28, z0: g + 1, z1: zf }
  assert.equal(plutitori(w, cutie, 12), 0, 'fixtura: constructia porneste fara plutitori')
  assert.equal(suportLa(w.terrain, R, cx, yr - 9, zf), 1, 'fixtura: h sta prin B, la d1 = 9')

  // La sapat: k e samanta; B se dezactiveaza, iar h trebuie sa cada.
  const k = cellKey(cx, yr + 1, zf)
  const laSapat = cadeDaca(w.terrain, R, [k])
  assert.deepEqual([...laSapat].sort((a, b) => a - b), cadeOracol(w, cutie, [k]), 'sapand k: previzualizarea difera de oracol')
  assert.ok(laSapat.includes(h), 'fixtura: sapand k, h trebuia sa cada')

  // In cascada: stalpul de sub S1 cade de la baza, iar B se dezactiveaza abia cand cade
  // celula de sub S1 — dupa ce activitatea ei a fost deja intrebata (si memorata) de
  // verificarile din jurul pintenului, sapat primul.
  const seminte = [cellKey(cx + 1, yr, zf), cellKey(cx, yr + 2, g + 1)]
  const inCascada = cadeDaca(w.terrain, R, seminte)
  assert.deepEqual([...inCascada].sort((a, b) => a - b), cadeOracol(w, cutie, seminte), 'pinten + baza stalpului: previzualizarea difera de oracol')
  assert.ok(inCascada.includes(cellKey(cx, yr + 2, zf)), 'fixtura: S1 trebuia sa cada odata cu stalpul')
})

/**
 * Scena S6e cu lantul ancorei de lungime `lant` (2 = fixtura din S6e: k, apoi S1 pe stalp). B se
 * zideste prin s1 din B', B e activa prin lant -> S1, h sta doar prin B. Stalpii au doua niveluri,
 * ca baza lor sa poata cadea IN CASCADA.
 */
function construiesteS6e(lant: number): { w: World; g: number; zf: number; yr: number; cx: number; yS1: number; h: number; cutie: Cutie } {
  const { w, x0, y0, g } = scena(16)
  const zf = g + 3
  const yr = y0 + 12
  const cx = x0 + 11
  const yS1 = yr + lant
  zid(w, x0, yr, 1, g, zf)
  for (const sy of [yS1, yr - 5]) {
    for (let z = g + 1; z < zf; z++) assert.ok(applyCommand(w, { kind: 'fill', wx: cx, wy: sy, z, material: Material.PIATRA_CONSTRUITA }, R).ok, `fixtura: stalpul de la ${sy - yr}`)
  }
  const plan: [number, number, number, number][] = []
  for (let dx = 1; dx <= 11; dx++) plan.push([x0 + dx, yr, zf, dx === 3 || dx === 11 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
  for (let dy = 1; dy <= 9; dy++) plan.push([cx, yr - dy, zf, Material.PIATRA_CONSTRUITA])
  for (let dy = 1; dy <= lant; dy++) plan.push([cx, yr + dy, zf, Material.PIATRA_CONSTRUITA])
  plan.push([cx + 1, yr, zf, Material.PIATRA_CONSTRUITA])
  assert.equal(construiesteIncremental(w, plan).size, plan.length, 'fixtura: planul S6e intreg')
  const cutie = { x0: x0 - 14, y0: y0 - 14, x1: x0 + 28, y1: y0 + 28, z0: g + 1, z1: zf }
  assert.equal(plutitori(w, cutie, 12), 0, 'fixtura: S6e porneste fara plutitori')
  assert.equal(suportLa(w.terrain, R, cx, yr - 9, zf), 1, 'fixtura: h sta prin B, la d1 = 9')
  return { w, g, zf, yr, cx, yS1, h: cellKey(cx, yr - 9, zf), cutie }
}

test('discul (b) pe fiecare ramura: grinda la z+1, la distanta 3, si caderea in cascada FARA memorie — previzualizarea = oracolul = sapatura reala', () => {
  // S6e exersa doar samanta la distanta 1 si cascada CU memorie. Instrumentat de recenzie
  // (26.09): ramura din cascada fara memorie — activitatea de dinaintea caderii, cu `k` scos o
  // clipa din ipoteza — rula de 0 ori in tot fisierul, iar patru mutatii care lasau voxeli in aer
  // dupa sapatura reala treceau toata suita.
  const cazuri: [string, number, (f: ReturnType<typeof construiesteS6e>) => number][] = [
    ['A: baza stalpului lui S1 — cascada, activitatea lui B neintrebata inainte', 2, (f) => cellKey(f.cx, f.yS1, f.g + 1)],
    ['B: varful stalpului de sub S1 — samanta, grinda B la z+1', 2, (f) => cellKey(f.cx, f.yS1, f.zf - 1)],
    ['C: S1 insasi, cu lantul de 3 — samanta, grinda B la distanta 3', 3, (f) => cellKey(f.cx, f.yS1, f.zf)],
    ['D: baza stalpului, cu lantul de 3 — cascada, distanta 3 la z+1', 3, (f) => cellKey(f.cx, f.yS1, f.g + 1)],
  ]
  for (const [nume, lant, samanta] of cazuri) {
    const f = construiesteS6e(lant)
    const e = samanta(f)
    const previz = cadeDaca(f.w.terrain, R, [e])
    assert.deepEqual([...previz].sort((a, b) => a - b), cadeOracol(f.w, f.cutie, [e]), `${nume}: previzualizarea difera de oracol`)
    assert.ok(previz.includes(f.h), `fixtura ${nume}: h trebuia sa cada`)
    const c = decodeCell(e)
    assert.ok(applyCommand(f.w, { kind: 'dig', wx: c.wx, wy: c.wy, z: c.z }, R).ok, `${nume}: sapatura`)
    assert.equal(plutitori(f.w, f.cutie, 12), 0, `${nume}: dupa sapatura reala au ramas plutitori`)
  }
})

test('previzualizarea pe MAI MULTE sapaturi nu depinde de ordinea lor: grinda dezactivata de a doua samanta isi re-verifica discul', () => {
  // Scena S6e plus un stalp izolat Q, la 6 pasi de B. Sapaturile desemnate: varful lui Q si k.
  // Recenzia (26.09): cu Q intai, discul (c) al lui Q memora activitatea lui B in starea de DUPA
  // ambele sapaturi, iar discul (b) al lui k o citea drept „inainte" — nicio schimbare, deci h,
  // tinut doar de B, lipsea din previzualizare. Cu k intai, era acolo. Ordinea e a sloturilor
  // de desemnare, adica a istoriei — aceeasi multime aratea sau ascundea prabusirea.
  for (const qIntai of [true, false]) {
    const f = construiesteS6e(2)
    const q = cellKey(f.cx + 6, f.yr, f.zf)
    for (let z = f.g + 1; z <= f.zf; z++) assert.ok(applyCommand(f.w, { kind: 'fill', wx: f.cx + 6, wy: f.yr, z, material: Material.PIATRA_CONSTRUITA }, R).ok, 'fixtura: stalpul Q')
    assert.equal(plutitori(f.w, f.cutie, 12), 0, 'fixtura: Q nu adauga plutitori')
    const k = cellKey(f.cx, f.yr + 1, f.zf)
    const seminte = qIntai ? [q, k] : [k, q]
    const previz = cadeDaca(f.w.terrain, R, seminte)
    assert.deepEqual([...previz].sort((a, b) => a - b), cadeOracol(f.w, f.cutie, seminte), `${qIntai ? 'Q' : 'k'} intai: previzualizarea difera de oracol`)
    assert.ok(previz.includes(f.h), `${qIntai ? 'Q' : 'k'} intai: h trebuia sa cada`)
  }
})

test('inchiderea: o grinda zidita INACTIVA devine activa cand se zideste celula asezata la 3 de ea — la cota ei si dedesubt (z+1)', () => {
  // Memoria inchiderii tine si „inactiva", iar o zidire o sterge doar pe raza `suportMax − 1`,
  // la cota zidirii si la cea de deasupra. Scenele verificatorului COST-2 (26.09): B e zidita
  // prin s1 din B', inactiva; o SONDA legata de ea prin solid re-memoreaza „inactiva" chiar
  // inaintea lui k; apoi k face B activa, iar ultimele celule stau doar prin B. Cu raza -1, fara
  // cota z, sau fara z+1, inchiderea le pierdea; testele de pana atunci treceau pe toate.
  const scena = (sus: number, B: number, kX: number): { w: World; plan: [number, number, number, number][]; cutie: Cutie } => {
    const { w, sit } = laSit(12345, 0)
    const x0 = sit.wx + 40
    const y0 = sit.wy + 40
    let gmax = -1 << 20
    for (let dx = -2; dx < 26; dx++) for (let dy = -3; dy < 4; dy++) gmax = Math.max(gmax, solid(w, x0 + dx, y0 + dy)!)
    const zf = gmax + 3
    const zB = zf + sus
    for (let z = solid(w, x0, y0)! + 1; z <= zB; z++) assert.ok(applyCommand(w, { kind: 'fill', wx: x0, wy: y0, z, material: Material.PIATRA_CONSTRUITA }, R).ok, 'fixtura: stalpul de langa B\'')
    const P = Material.PIATRA_CONSTRUITA
    const plan: [number, number, number, number][] = [[x0 + 1, y0, zB, Material.GRINDA]]
    for (let dx = 2; dx <= 10; dx++) plan.push([x0 + dx, y0, zB, dx === B ? Material.GRINDA : P])
    // Stalpul lui k, planificat din sol; k = varful lui (la cota lui B, sau sub ea).
    for (let z = solid(w, x0 + kX, y0)! + 1; z < zf; z++) plan.push([x0 + kX, y0, z, P])
    plan.push([x0 + 10, y0 + 1, zB, P]) // sonda, legata de B, fara sprijin pana la k
    plan.push([x0 + kX, y0, zf, P]) // k
    for (let dx = kX + 1; dx <= kX + 6; dx++) plan.push([x0 + dx, y0, zB, P])
    return { w, plan, cutie: { x0: x0 - 14, y0: y0 - 14, x1: x0 + 32, y1: y0 + 14, z0: zf - 3, z1: zB } }
  }
  for (const [nume, sus, B, kX] of [['A3: k la cota lui B, la 3 de ea', 0, 8, 11], ['B3: k sub celula de la 3 de B (invalidare la z+1)', 1, 7, 10]] as const) {
    const { w, plan, cutie } = scena(sus, B, kX)
    const celule = plan.map(([x, y, z]) => cellKey(x, y, z))
    const grinzi = plan.filter(([, , , m]) => m === Material.GRINDA).map(([x, y, z]) => cellKey(x, y, z))
    const { construibile } = constructiaPosibila(w.terrain, R, celule, grinzi)
    const facute = construiesteIncremental(w, plan)
    assert.equal(facute.size, plan.length, `fixtura ${nume}: planul se construieste intreg in realitate`)
    assert.deepEqual(construibile, [...facute].sort((a, b) => a - b), `${nume}: inchiderea difera de constructia reala`)
    assert.equal(plutitori(w, cutie, 12), 0, `fixtura ${nume}: plutitori`)
  }
})

/** Un generator determinist mic (LCG), ca scenele aleatoare sa fie aceleasi la fiecare rulare. */
function lcg(samanta: number): () => number {
  let s = samanta >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

test('PROPRIETATE: pe scene aleatoare cu grinzi, orice sapatura = oracolul, previzualizarea = realitatea, zero plutitori', () => {
  // Acoperirea discurilor din `propaga` (a: grinda care cade; b: grinzile a caror
  // activitate se schimba; c: drumurile prin celula cazuta) se probeaza aici, pe
  // configuratii pe care nu le-a desenat nimeni de mana: zid, stalpi, podea cu grinzi
  // presarate, construita pe calea reala pana la punct fix; apoi sapaturi aleatoare.
  let sapaturi = 0
  let cuCadere = 0
  let deGrinda = 0
  for (const samanta of [1, 2, 3, 4, 5, 6]) {
    const rnd = lcg(samanta)
    const { w, x0, y0, g } = scena(18)
    const zf = g + 2
    zid(w, x0, y0, 16, g, zf)
    for (let k = 0; k < 3; k++) {
      const sx = x0 + 3 + Math.floor(rnd() * 12)
      const sy = y0 + Math.floor(rnd() * 16)
      applyCommand(w, { kind: 'fill', wx: sx, wy: sy, z: g + 1, material: Material.PIATRA_CONSTRUITA }, R)
    }
    const plan: [number, number, number, number][] = []
    for (let dx = 1; dx <= 16; dx++) {
      for (let dy = 0; dy < 16; dy++) {
        if (rnd() < 0.08) continue
        plan.push([x0 + dx, y0 + dy, zf, rnd() < 0.05 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
      }
    }
    construiesteIncremental(w, plan)
    const cutie = { x0: x0 - 14, y0: y0 - 14, x1: x0 + 30, y1: y0 + 30, z0: zf, z1: zf }
    assert.equal(plutitori(w, cutie, 12), 0, `samanta ${samanta}: constructia porneste cu plutitori`)
    for (let pas = 0; pas < 14; pas++) {
      const solide: [number, number][] = []
      for (let dx = 1; dx <= 16; dx++) for (let dy = 0; dy < 16; dy++) if (solLa(w.terrain, x0 + dx, y0 + dy, zf) === Sol.SOLID) solide.push([x0 + dx, y0 + dy])
      if (solide.length === 0) break
      // Grinzile se sapa cu prioritate: acolo sunt discurile noi.
      const grinzi = solide.filter(([x, y]) => { const m = materialAt(w.terrain, x, y, zf); return m.ok && m.value === Material.GRINDA })
      const alese = grinzi.length > 0 && rnd() < 0.5 ? grinzi : solide
      const [x, y] = alese[Math.floor(rnd() * alese.length)]!
      const m = materialAt(w.terrain, x, y, zf)
      const e = cellKey(x, y, zf)
      const previz = cadeDaca(w.terrain, R, [e])
      assert.deepEqual([...previz].sort((a, b) => a - b), cadeOracol(w, cutie, [e]), `samanta ${samanta}, pasul ${pas}: previzualizarea difera de oracol la sapatul lui (${x - x0}, ${y - y0})`)
      assert.ok(applyCommand(w, { kind: 'dig', wx: x, wy: y, z: zf }, R).ok)
      assert.equal(plutitori(w, cutie, 12), 0, `samanta ${samanta}, pasul ${pas}: plutitori dupa sapatul lui (${x - x0}, ${y - y0})`)
      sapaturi++
      if (previz.length > 0) cuCadere++
      if (m.ok && m.value === Material.GRINDA) deGrinda++
    }
  }
  assert.ok(sapaturi >= 60 && cuCadere >= 5 && deGrinda >= 8, `fixtura: ${sapaturi} sapaturi, ${cuCadere} cu cadere, ${deGrinda} de grinda — prea putine ca sa probeze ceva`)
})

test('inchiderea de constructie cu grinzi PLANIFICATE promite exact ce se construieste incremental', () => {
  for (const cuGrinda of [true, false]) {
    const { w, x0, y0, g } = scena(16)
    const zf = g + 2
    zid(w, x0, y0, 1, g, zf)
    for (let dx = 1; dx <= 14; dx++) {
      const out = applyCommand(w, { kind: 'desemneaza', wx: x0 + dx, wy: y0, z: zf, piesa: cuGrinda && dx === 3 ? Piesa.GRINDA : Piesa.PODEA }, R)
      assert.ok(out.ok, `fixtura: desemnarea ${dx}: ${JSON.stringify(out)}`)
    }
    const { construibile, imposibile } = constructiaPrevizualizata(w, R)
    assert.equal(construibile.length, cuGrinda ? 12 : 3, `${cuGrinda ? 'cu' : 'fara'} grinda planificata: promite ${construibile.length}`)
    assert.equal(imposibile.length, 14 - construibile.length)
    // Si pe calea reala, alta lume identica: exact multimea promisa.
    const { w: w2 } = scena(16)
    zid(w2, x0, y0, 1, g, zf)
    const plan: [number, number, number, number][] = []
    for (let dx = 14; dx >= 1; dx--) plan.push([x0 + dx, y0, zf, cuGrinda && dx === 3 ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
    const facute = construiesteIncremental(w2, plan)
    assert.deepEqual([...facute].sort((a, b) => a - b), construibile)
  }
})

test('constructiaPosibila fara lista de grinzi planificate ar promite MAI PUTIN — lista e necesara', () => {
  const { w, x0, y0, g } = scena(16)
  const zf = g + 2
  zid(w, x0, y0, 1, g, zf)
  const celule: number[] = []
  for (let dx = 1; dx <= 14; dx++) celule.push(cellKey(x0 + dx, y0, zf))
  assert.equal(constructiaPosibila(w.terrain, R, celule).construibile.length, 3)
  assert.equal(constructiaPosibila(w.terrain, R, celule, [cellKey(x0 + 3, y0, zf)]).construibile.length, 12)
})

test('grinziInRaza: doar cota ceruta, doar raza ceruta, si nimic de la capatul opus al lumii', () => {
  const index: IndexGrinzi = new Map()
  adaugaGrinda(index, 100, 100, 5)
  adaugaGrinda(index, 100, 100, 6)
  adaugaGrinda(index, 100, 100, 4)
  adaugaGrinda(index, 109, 100, 5)
  adaugaGrinda(index, 110, 100, 5)
  const out: number[] = []
  grinziInRaza(index, 100, 100, 5, 9, out)
  assert.deepEqual(out, [100, 100, 109, 100], 'alta cota sau dincolo de raza a intrat in raspuns')
  // chunkKey(-1, 21) === chunkKey(511, 20): fara taiere la lume, o grinda de la estul
  // extrem ar aparea „la un pas" de marginea de vest.
  const est: IndexGrinzi = new Map()
  adaugaGrinda(est, WORLD_CELLS - 1, 20 * 32 + 29, 25)
  const vest: number[] = []
  grinziInRaza(est, 0, 21 * 32 + 29, 25, 9, vest)
  assert.deepEqual(vest, [], 'grinda de la estul lumii a aparut la vest')
  const control: number[] = []
  grinziInRaza(est, WORLD_CELLS - 3, 20 * 32 + 29, 25, 9, control)
  assert.deepEqual(control, [WORLD_CELLS - 1, 20 * 32 + 29])
})

test('grinziInRaza = forta bruta: pe marginile si colturile chunk-urilor, la raza care se termina pe granita, si pe cote NEGATIVE', () => {
  // Testul de mai sus pune grinzile intr-un singur chunk, la cote pozitive. Recenzia (26.09) a
  // gasit patru off-by-one care PIERD grinzi de pe marginile chunk-ului (lx = 0 pe primul rand,
  // lx = 31 pe ultimul, cx0 si cy1 cu un chunk mai putin) si o decodare gresita a cotelor
  // negative — toate verzi. Jumatate din lume are solul sub cota 0. Supra-includerea ar fi
  // benigna (o filtreaza materialul); sub-includerea scoate o grinda din regula.
  //
  // Intai cazurile exacte, fiecare pe granita pe care o apara o singura linie de cod:
  const exact: [string, number, number, number, number, number, number][] = [
    // [ce, grinda x, y, z, interogare x, y, raza]
    ['lx = 31 pe ultimul rand al intervalului', 31, 50, 5, 31, 41, 9],
    ['lx = 0 pe primul rand al intervalului', 32, 50, 5, 32, 59, 9],
    ['raza se termina pe granita de vest (cx0)', 63, 100, 5, 72, 100, 9],
    ['raza se termina pe granita de sud (cy1)', 100, 64, 5, 100, 55, 9],
    ['cota negativa', 100, 100, -5, 100, 100, 0],
    ['cota -1, pe coltul chunk-ului', 95, 96, -1, 99, 99, 7],
  ]
  for (const [ce, gx, gy, gz, qx, qy, raza] of exact) {
    const index: IndexGrinzi = new Map()
    adaugaGrinda(index, gx, gy, gz)
    const out: number[] = []
    grinziInRaza(index, qx, qy, gz, raza, out)
    assert.deepEqual(out, [gx, gy], `${ce}: grinda de la (${gx}, ${gy}, ${gz}) lipseste`)
  }
  // Apoi forta bruta, pe indexuri aleatoare cu jumatate din grinzi pe margini si colturi.
  const rnd = lcg(12345)
  const ri = (n: number): number => Math.floor(rnd() * n)
  let interogari = 0
  for (let runda = 0; runda < 120; runda++) {
    const index: IndexGrinzi = new Map()
    const toate: [number, number, number][] = []
    const bx = 32 * (1 + ri(6))
    const by = 32 * (1 + ri(6))
    for (let i = 0; i < 60; i++) {
      const peMargine = ri(2) === 0
      const x = peMargine ? bx + 32 * ri(3) + [0, 31][ri(2)]! : bx + ri(96)
      const y = peMargine ? by + 32 * ri(3) + [0, 31][ri(2)]! : by + ri(96)
      const z = -3 + ri(6)
      adaugaGrinda(index, x, y, z)
      toate.push([x, y, z])
    }
    for (let q = 0; q < 40; q++) {
      const wx = bx + ri(96)
      const wy = by + ri(96)
      const z = -3 + ri(6)
      const raza = 1 + ri(20)
      const out: number[] = []
      grinziInRaza(index, wx, wy, z, raza, out)
      const gasite: string[] = []
      for (let i = 0; i < out.length; i += 2) gasite.push(`${out[i]},${out[i + 1]}`)
      const asteptate = [...new Set(toate.filter(([x, y, zz]) => zz === z && Math.abs(x - wx) + Math.abs(y - wy) <= raza).map(([x, y]) => `${x},${y}`))]
      assert.deepEqual(gasite.sort(), asteptate.sort(), `runda ${runda}, interogarea (${wx}, ${wy}, ${z}) raza ${raza}`)
      interogari++
    }
  }
  assert.equal(interogari, 4800)
})

test('o intrare VECHE in index nu devine grinda: candidatul trebuie sa fie chiar din material GRINDA', () => {
  // Fara filtrul pe material, o desincronizare a indexului DERIVED ar fi devenit fizica
  // doar in lumea continua: masurat de panou, 9 celule zidite peste limita.
  const { w, x0, y0, g } = scena(16)
  const zf = g + 2
  zid(w, x0, y0, 1, g, zf)
  for (let dx = 1; dx <= 3; dx++) assert.ok(applyCommand(w, { kind: 'fill', wx: x0 + dx, wy: y0, z: zf, material: Material.PIATRA_CONSTRUITA }, R).ok)
  adaugaGrinda(w.terrain.grinzi, x0 + 3, y0, zf)
  assert.equal(poateSustine(w.terrain, R, x0 + 4, y0, zf).ok, false, 'piatra obisnuita a tinut ca o grinda')
})

test('K05: o grinda departe nu costa nimic; un tavan numai din grinzi are un plafon scris', () => {
  // Pe o cavitate 9×9 sapata langa sit: previzualizarea costa la fel cu si fara o grinda
  // la 400 de celule — prima amanare a grinzii a venit exact din contrariul (9,4 → 404,8 ms).
  const masoara = (cuGrinda: boolean): { s1: number; verificari: number } => {
    const { w, x0, y0, g } = scena(12)
    if (cuGrinda) {
      const gd = solid(w, x0 + 400, y0)
      assert.notEqual(gd, null, 'fixtura: sol la 400 de celule')
      assert.ok(fillTeren(w.terrain, x0 + 400, y0, gd! + 1, Material.GRINDA).ok)
    }
    const celule: number[] = []
    for (let dx = 0; dx < 9; dx++) for (let dy = 0; dy < 9; dy++) celule.push(cellKey(x0 + 1 + dx, y0 + 1 + dy, g - 3))
    reseteazaContoareStabilitate()
    cadeDaca(w.terrain, R, celule)
    return { s1: contoareStabilitate.interogariS1, verificari: contoareStabilitate.verificari }
  }
  const fara = masoara(false)
  const cu = masoara(true)
  assert.equal(cu.s1, 0, 'o grinda la 400 de celule a intrat in interogari')
  assert.equal(cu.verificari, fara.verificari)

  // Un tavan 21×21 numai din grinzi, ancorat de jur-imprejur: o sapatura sub el. Plafonul
  // pe activitati e ce face costul marginit de munca: fara memorie, ~160 de BFS de
  // activitate pe interogare (masurat de panou: 2,4 milioane la 441 de sapaturi).
  // Tavanul se ridica deasupra celui mai inalt sol din patrat, cu marginea zidita din
  // sol pana la el: nu cere teren plat, doar uscat.
  const { w, sit } = laSit(12345, 0)
  const x0 = sit.wx
  const y0 = sit.wy
  let gmax = -1 << 20
  for (let dx = 0; dx <= 22; dx++) {
    for (let dy = 0; dy <= 22; dy++) {
      const gs = solid(w, x0 + dx, y0 + dy)
      assert.notEqual(gs, null, 'fixtura: apa sub tavan')
      if (gs! > gmax) gmax = gs!
    }
  }
  const zf = gmax + 2
  for (let dx = 0; dx <= 22; dx++) {
    for (let dy = 0; dy <= 22; dy++) {
      const margine = dx === 0 || dy === 0 || dx === 22 || dy === 22
      if (margine) for (let z = solid(w, x0 + dx, y0 + dy)! + 1; z <= zf; z++) assert.ok(fillTeren(w.terrain, x0 + dx, y0 + dy, z, Material.PIATRA_CONSTRUITA).ok)
      else assert.ok(fillTeren(w.terrain, x0 + dx, y0 + dy, zf, Material.GRINDA).ok)
    }
  }
  reseteazaContoareStabilitate()
  const cad = cadeDaca(w.terrain, R, [cellKey(x0 + 11, y0 + 11, zf)])
  assert.equal(cad.length, 0, 'fixtura: tavanul de grinzi trebuia sa tina fara grinda din centru')
  // Marginile din GEOMETRIE, nu din cifra masurata (recenzia, 26.09: marginile de dinainte
  // erau „tot tavanul" si discuri numarate de doua ori, deci regresii reale treceau pe sub ele).
  //
  // Activitati: cu memoria, fiecare grinda se calculeaza cel mult o data pe propagare (nimic nu
  // cade aici). Candidatele sunt grinzile la <= R−1 de o celula verificata, iar celulele
  // verificate sunt la <= R−1 de sapatura — deci grinzile la <= 2(R−1) = 18 de centru: 429 din
  // cele 441 (colturile, la 20, nu). Plus starea „inainte" si „dupa" a celor <= 3 de samanta
  // (25 + 24). Masurat: 274. Fara memorie: 5.267.
  const grinzi18 = 21 * 21 - 12
  assert.ok(contoareStabilitate.activitati <= grinzi18 + 25 + 24, `${contoareStabilitate.activitati} calcule de activitate pentru o singura sapatura`)
  // Verificari: discul (c) de raza R−1 in jurul sapaturii (181, fara ea insasi) si discul de
  // sol de la cota de deasupra (25) — cel de la cota ei e inclus in (c). Masurat: 180. Cu
  // discul grinzii de raza R in loc de R−1: 220.
  assert.ok(contoareStabilitate.verificari <= 181 - 1 + 25, `${contoareStabilitate.verificari} verificari pentru o singura sapatura`)
  // Controlul pozitiv al primei parti: aici o grinda e in raza, deci interogarile se numara.
  // Fara el, un contor care nu mai numara nimic ar face „0 interogari s1" de mai sus adevarat gratis.
  assert.ok(contoareStabilitate.interogariS1 > 0, 'nicio interogare s1 sub un tavan de grinzi: contorul nu mai numara')
})

test('K05: cascada, inchiderea si previzualizarea pe multe sapaturi au plafoane scrise din geometrie', () => {
  // Plasa K05 de dinainte acoperea doar `cadeDaca` cu o singura samanta, fara nicio cadere
  // (recenzia, COST-7): scanerul, inchiderea, previzualizarea pe multe sapaturi si cascada
  // n-aveau buget, iar regresii de 3–20x treceau prin toate testele.
  //
  // (1) Stalpul cu 5 etaje, cate 4 grinzi la 3 pasi de el pe fiecare etaj; se sapa baza.
  const { w, sit } = laSit(12345, 0)
  const px = sit.wx + 12
  const py = sit.wy + 12
  let gmax = -1 << 20
  for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) gmax = Math.max(gmax, solid(w, px + dx, py + dy)!)
  const z1 = gmax + 3
  const etaje = [z1, z1 + 3, z1 + 6, z1 + 9, z1 + 12]
  const baza = solid(w, px, py)! + 1
  for (let z = baza; z <= etaje[4]!; z++) assert.ok(applyCommand(w, { kind: 'fill', wx: px, wy: py, z, material: Material.PIATRA_CONSTRUITA }, R).ok, 'fixtura: stalpul')
  const plan: [number, number, number, number][] = []
  for (const zf of etaje) {
    for (let dx = -12; dx <= 12; dx++) {
      for (let dy = -12; dy <= 12; dy++) {
        if ((dx === 0 && dy === 0) || Math.abs(dx) + Math.abs(dy) > 12) continue
        const g = (Math.abs(dx) === 3 && dy === 0) || (Math.abs(dy) === 3 && dx === 0)
        plan.push([px + dx, py + dy, zf, g ? Material.GRINDA : Material.PIATRA_CONSTRUITA])
      }
    }
  }
  construiesteIncremental(w, plan)
  assert.equal(listaGrinzi(w.terrain.grinzi).length, 20, 'fixtura: 4 grinzi pe fiecare dintre cele 5 etaje')
  reseteazaContoareStabilitate()
  const cad = cadeDaca(w.terrain, R, [cellKey(px, py, baza)])
  assert.ok(cad.length > 1000, `fixtura: sapand baza trebuia sa cada turnul (${cad.length})`)
  // O grinda se (re)calculeaza initial si apoi doar dupa o cadere la <= 3 de ea, la cota ei
  // (25 de celule) sau dedesubt (aici doar stalpul, 1): <= 27 de ori prin memorie, plus cel
  // mult o data pe cadere „starea de dinainte" din discul (b) (<= 26) — 53 pe grinda. Masurat:
  // 280. Cu memoria doar-pozitiva (forma de dinainte de recenzie): 3.180.
  assert.ok(contoareStabilitate.activitati <= 20 * 53, `${contoareStabilitate.activitati} calcule de activitate intr-o cascada cu 20 de grinzi`)
  // `stareSapat` cere doar „cade ceva?": se opreste la prima cadere, deci verifica cel mult
  // discurile semintei (50; nicio grinda la cota bazei). Masurat: 6. Fara oprire: 1.583.
  reseteazaContoareStabilitate()
  assert.equal(stareSapat(w.terrain, R, px, py, baza), StareSapat.CADE)
  assert.ok(contoareStabilitate.verificari <= 50, `${contoareStabilitate.verificari} verificari ca sa afle ca baza stalpului doboara ceva`)

  // (2) Inchiderea: o sala 25×25 cu zidurile zidite si podeaua PLANIFICATA, cu o cruce de grinzi
  // prin centru — ce deseneaza cine nu stie ca grinzile nu se tin una pe alta. O grinda
  // planificata se (re)calculeaza initial si apoi doar dupa o zidire la <= 3 de ea, la cota ei
  // (nimic nu se zideste dedesubt): <= 26 de ori. Masurat: 437. Memoria doar-pozitiva: 5.497.
  {
    const r = laSit(12345, 0)
    const x0 = r.sit.wx
    const y0 = r.sit.wy
    let gm = -1 << 20
    for (let dx = 0; dx < 27; dx++) for (let dy = 0; dy < 27; dy++) gm = Math.max(gm, solid(r.w, x0 + dx, y0 + dy)!)
    const zf = gm + 3
    const celule: number[] = []
    const grinzi: number[] = []
    for (let dx = 0; dx < 27; dx++) {
      for (let dy = 0; dy < 27; dy++) {
        if (dx === 0 || dy === 0 || dx === 26 || dy === 26) {
          for (let z = solid(r.w, x0 + dx, y0 + dy)! + 1; z <= zf; z++) assert.ok(fillTeren(r.w.terrain, x0 + dx, y0 + dy, z, Material.PIATRA_CONSTRUITA).ok)
          continue
        }
        const k = cellKey(x0 + dx, y0 + dy, zf)
        celule.push(k)
        if (dx === 13 || dy === 13) grinzi.push(k)
      }
    }
    reseteazaContoareStabilitate()
    const { construibile } = constructiaPosibila(r.w.terrain, R, celule, grinzi)
    assert.ok(construibile.length > 500, `fixtura: inchiderea promite ${construibile.length}`)
    assert.ok(contoareStabilitate.activitati <= grinzi.length * 26, `${contoareStabilitate.activitati} calcule de activitate pentru ${grinzi.length} grinzi planificate`)
  }

  // (3) Previzualizarea pe multe sapaturi: o pivnita 21×21×2 desemnata sub un tavan de roca
  // inlocuit cu grinzi (asezate). La insamantare nimic nu cade, deci fiecare grinda are cel
  // mult o stare „inainte" si una „dupa": <= 2 pe grinda. Masurat: 882 = 2 × 441. Cu memoria
  // golita la fiecare samanta (forma de dinainte de recenzie): 10.310.
  {
    const r = laSit(12345, 0)
    const x0 = r.sit.wx
    const y0 = r.sit.wy
    let gmin = 1 << 20
    for (let dx = -2; dx <= 22; dx++) for (let dy = -2; dy <= 22; dy++) gmin = Math.min(gmin, solid(r.w, x0 + dx, y0 + dy)!)
    const zc = gmin - 3
    for (let dx = 0; dx < 21; dx++) {
      for (let dy = 0; dy < 21; dy++) {
        assert.ok(applyCommand(r.w, { kind: 'dig', wx: x0 + dx, wy: y0 + dy, z: zc }, R).ok)
        assert.ok(applyCommand(r.w, { kind: 'fill', wx: x0 + dx, wy: y0 + dy, z: zc, material: Material.GRINDA }, R).ok)
      }
    }
    const seminte: number[] = []
    for (let dx = 0; dx < 21; dx++) for (let dy = 0; dy < 21; dy++) for (const z of [zc - 1, zc - 2]) seminte.push(cellKey(x0 + dx, y0 + dy, z))
    reseteazaContoareStabilitate()
    cadeDaca(r.w.terrain, R, seminte)
    assert.ok(contoareStabilitate.activitati <= 2 * 21 * 21, `${contoareStabilitate.activitati} calcule de activitate pentru o previzualizare sub 441 de grinzi`)
  }
})


test('prefiltrul overlay-ului: langa o grinda raza e a GRINZII — si grinda poate sta in afara ferestrei', () => {
  // Fixtura panoului (podea de doua straturi) o prinde acum sursa „solid neasezat",
  // nu raza. Aici doar raza o poate prinde. Grinda e ASEZATA in roca, cu roca si
  // deasupra; la est, tavanul unei pivnite de 7×7. Celula din mijlocul tavanului
  // (E+4) are s0 = 0 si sta DOAR prin grinda, la d1 = 9 exact, pe drumul drept. Doua
  // celule ingropate sunt periculoase, amandoua la mai mult de `suportMax` de orice
  // sursa: grinda (sapata, nu mai tine nimic) si vecina ei de pe drum (sapata, ocolul
  // are 11 pasi). Cu raza de sol ies SIGUR fara sa fie intrebate.
  //
  // A doua fereastra incepe CHIAR dupa grinda: vecina e inauntru, grinda afara. Fara
  // cautarea pe fereastra largita, prefiltrul n-ar sti ca exista vreo grinda.
  //
  // Nu cere teren plat, doar roca la zA si zA+1: cota se ia sub cel mai jos sol.
  const { w, sit } = laSit(12345, 0)
  const gx = sit.wx
  const yc = sit.wy
  const E = gx + 5
  const raza = 12
  const lat = 2 * raza + 1
  let gmin = 1 << 20
  for (let x = gx - raza; x <= gx + 1 + 2 * raza; x++) {
    for (let y = yc - raza; y <= yc + raza; y++) {
      const gs = solid(w, x, y)
      assert.notEqual(gs, null, 'fixtura: apa in fereastra')
      if (gs! < gmin) gmin = gs!
    }
  }
  const zA = gmin - 2
  assert.ok(applyCommand(w, { kind: 'dig', wx: gx, wy: yc, z: zA }, R).ok)
  assert.ok(applyCommand(w, { kind: 'fill', wx: gx, wy: yc, z: zA, material: Material.GRINDA }, R).ok, 'fixtura: grinda in roca')
  for (let x = E + 1; x <= E + 7; x++) {
    for (let y = yc - 3; y <= yc + 3; y++) assert.ok(applyCommand(w, { kind: 'dig', wx: x, wy: y, z: zA - 1 }, R).ok, `fixtura: pivnita la ${x - E},${y - yc}`)
  }
  for (let x = E + 1; x <= E + 7; x++) {
    for (let y = yc - 3; y <= yc + 3; y++) assert.ok(suportLa(w.terrain, R, x, y, zA) > 0, `fixtura: tavanul pluteste la ${x - E},${y - yc}`)
  }
  assert.equal(suportLa(w.terrain, R, E + 4, yc, zA), 1, 'fixtura: mijlocul tavanului sta prin grinda, la d1 = 9')

  const ascunse = (fx: number, fy: number): { periculoase: number; ascunse: number; filtru: Uint8Array } => {
    const filtru = prefiltruStabilitate(w.terrain, R, fx, fy, lat, zA)
    let p = 0
    let a = 0
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lat; j++) {
        if (solLa(w.terrain, fx + i, fy + j, zA) !== Sol.SOLID) continue
        const stare = stareSapat(w.terrain, R, fx + i, fy + j, zA)
        if (stare !== StareSapat.CADE && stare !== StareSapat.ULTIMA_CELULA) continue
        p++
        if (filtru[i * lat + j] !== Prefiltru.DE_SCANAT) a++
      }
    }
    return { periculoase: p, ascunse: a, filtru }
  }
  // Fixtura chiar cere raza grinzii: cea mai apropiata sursa (aer la zA/zA+1, sau
  // solid neasezat la zA) e mai departe de `suportMax`, si pentru grinda, si pentru
  // vecina ei; iar sapate, amandoua doboara tavanul.
  for (const x of [gx, gx + 1]) {
    let sursa = 1 << 20
    for (let i = -raza; i <= raza; i++) {
      for (let j = -raza; j <= raza; j++) {
        const e = solLa(w.terrain, x + i, yc + j, zA) !== Sol.SOLID || solLa(w.terrain, x + i, yc + j, zA + 1) !== Sol.SOLID || !esteAsezat(w.terrain, x + i, yc + j, zA)
        if (e) sursa = Math.min(sursa, Math.abs(i) + Math.abs(j))
      }
    }
    assert.ok(sursa > R.suportMax, `fixtura: celula ${x - gx} e la ${sursa} de o sursa, deci raza de sol ar prinde-o oricum`)
    assert.equal(stareSapat(w.terrain, R, x, yc, zA), StareSapat.CADE, `sapand celula ${x - gx} trebuia sa cada mijlocul tavanului`)
  }

  const peGrinda = ascunse(gx - raza, yc - raza)
  assert.equal(peGrinda.filtru[raza * lat + raza], Prefiltru.DE_SCANAT, 'grinda care tine tavanul a iesit SIGUR fara scanare')
  assert.equal(peGrinda.ascunse, 0, `fereastra pe grinda: ${peGrinda.ascunse} din ${peGrinda.periculoase} celule periculoase declarate SIGUR fara scanare`)

  const dupaGrinda = ascunse(gx + 1, yc - raza)
  assert.equal(dupaGrinda.filtru[raza], Prefiltru.DE_SCANAT, 'vecina grinzii, cu grinda in afara ferestrei, a iesit SIGUR fara scanare')
  assert.equal(dupaGrinda.ascunse, 0, `fereastra dupa grinda: ${dupaGrinda.ascunse} din ${dupaGrinda.periculoase} celule periculoase declarate SIGUR fara scanare`)
})
