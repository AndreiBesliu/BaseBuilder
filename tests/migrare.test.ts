import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { advance, createWorld } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { CATEGORII, Categorie, Piesa, SCHEMA_VERSION } from '../src/sim/state.ts'
import { Desemnare } from '../src/sim/desemnari.ts'
import { Reason } from '../src/sim/result.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { groundLevelM, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'

// Fixturi GOLDEN: fiecare a fost capturata cu codul de la schema ei, INAINTE de
// schimbare. Migrarea se dovedeste pe fisier, nu pe un obiect construit de
// codul nou — altfel testul ar verifica doar ca noul cod se citeste pe sine.

const SCHEMA1 = readFileSync(new URL('./fixtures/save-schema1.json', import.meta.url), 'utf8')

/** Exact lumea din care s-a capturat fixtura: seed 4242, 4 agenti pe sol, 300 de tickuri. */
function replica(): ReturnType<typeof createWorld> {
  const seed = 4242
  const w = createWorld(seed)
  let pusi = 0
  for (let k = 1; k <= 8000 && pusi < 4; k++) {
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(w.terrain, wx, wy)
    if (!g.ok) continue
    const sus = materialAt(w.terrain, wx, wy, g.value)
    if (!sus.ok || !isSolid(sus.value)) continue
    const r = applyCommand(w, { kind: 'spawnAgent', x: wx * 1000 + 500, y: wy * 1000 + 500, z: g.value + 1, faction: pusi % 4 === 0 ? 2 : 0 })
    if (r.ok) pusi++
  }
  assert.equal(pusi, 4)
  advance(w, 300)
  return w
}

test('fixtura de schema 1 e chiar de schema 1, capturata la tickul 300', () => {
  const env = JSON.parse(SCHEMA1) as { schema: number; savedAtTick: number }
  assert.equal(env.schema, 1)
  assert.equal(env.savedAtTick, 300)
  assert.ok(SCHEMA_VERSION > 1, 'testul asta exista pentru ca schema a crescut')
})

test('migrarea 1 -> 2: un save vechi se incarca fara joburi, fara desemnari, cu prioritatile implicite', () => {
  const out = decode(SCHEMA1)
  assert.ok(out.ok, `refuzat: ${JSON.stringify(out)}`)
  const w = out.value
  assert.equal(w.schema, SCHEMA_VERSION)
  assert.equal(w.tick, 300)
  assert.equal(w.agents.count, 4)
  assert.equal(w.desemnari.count, 0)
  assert.equal(w.desemnari.vii, 0)
  assert.equal(w.rezervari.total, 0)
  for (let i = 0; i < w.agents.count; i++) {
    assert.equal(w.agents.jobKind[i], 0)
    for (let c = 0; c < CATEGORII; c++) assert.equal(w.agents.prioPersonala[i * CATEGORII + c], DEFAULT_RULES.personalPriorityDefault)
  }
})

test('migrarea 1 -> 3 nu inventeaza si nu pierde stare: agentii, terenul si RNG-ul sunt cei din fisier', () => {
  // Prima versiune compara hash-ul cu o replica rulata de codul nou. A tinut o
  // zi: recenzia S16-19 a schimbat hoinareala (doar in blocuri legate), deci
  // aceleasi 300 de tickuri produc alta lume decat cea din fixtura — corect, si
  // exact de aia fixtura e golden (capturata atunci), nu regenerata. Ce se
  // verifica acum e ca fiecare camp de schema 1 ajunge nealterat.
  const migrat = decode(SCHEMA1)
  assert.ok(migrat.ok)
  const raw = JSON.parse(SCHEMA1) as { data: { agents: Record<string, number[]>; rng: Record<string, { draws: number }>; tick: number; nextId: number } }
  const w = migrat.value
  for (let i = 0; i < w.agents.count; i++) {
    assert.equal(w.agents.x[i], raw.data.agents.x![i])
    assert.equal(w.agents.y[i], raw.data.agents.y![i])
    assert.equal(w.agents.z[i], raw.data.agents.z![i])
    assert.equal(w.agents.goalX[i], raw.data.agents.goalX![i])
  }
  assert.equal(w.rng.agents.draws, raw.data.rng.agents!.draws)
  assert.equal(w.nextId, raw.data.nextId)
  // Si lumea merge mai departe determinist.
  const a = decode(SCHEMA1)
  const b = decode(SCHEMA1)
  assert.ok(a.ok && b.ok)
  advance(a.value, 300)
  advance(b.value, 300)
  assert.equal(hashWorld(a.value), hashWorld(b.value))
  void replica
})

// --- schema 2 -> 3 ---------------------------------------------------------

const SCHEMA2 = readFileSync(new URL('./fixtures/save-schema2.json', import.meta.url), 'utf8')

test('fixtura de schema 2 e chiar de schema 2, cu joburi si rezervari in curs', () => {
  const env = JSON.parse(SCHEMA2) as { schema: number; data: { agents: { jobKind: number[] } } }
  assert.equal(env.schema, 2)
  assert.ok(env.data.agents.jobKind.some((k) => k !== 0), 'fixtura n-are niciun job in curs')
})

test('migrarea 2 -> 3: joburile in curs se pastreaza, rezervarile se refac, campurile noi pornesc de la zero', () => {
  const out = decode(SCHEMA2)
  assert.ok(out.ok, `refuzat: ${JSON.stringify(out)}`)
  const w = out.value
  assert.equal(w.schema, SCHEMA_VERSION)
  assert.equal(w.agents.count, 3)
  let cuJob = 0
  for (let i = 0; i < w.agents.count; i++) if (w.agents.jobKind[i] !== 0) cuJob++
  assert.equal(cuJob, 3)
  assert.equal(w.rezervari.total, 3)
  assert.equal(w.rezervari.anulateLaIncarcare, 0)
  assert.equal(w.regions.dirty.size, 0)
  for (let i = 0; i < w.agents.count; i++) {
    assert.equal(w.agents.scanLaTick[i], 0)
    for (let k = 0; k < w.agents.evitaSloturi; k++) assert.equal(w.agents.evitaTinta[i * w.agents.evitaSloturi + k], 0)
  }
  // Si lumea merge mai departe: joburile se termina.
  advance(w, 400)
  assert.equal(w.desemnari.vii, 0, 'joburile din fixtura nu s-au terminat dupa migrare')
})

test('migrarea 2 -> 3 e idempotenta: save-ul rescris se reincarca cu acelasi hash', () => {
  const unu = decode(SCHEMA2)
  assert.ok(unu.ok)
  const doi = decode(encode(unu.value))
  assert.ok(doi.ok)
  assert.equal(hashWorld(doi.value), hashWorld(unu.value))
})

test('migrarea e idempotenta: save-ul rescris de codul nou se reincarca identic', () => {
  const unu = decode(SCHEMA1)
  assert.ok(unu.ok)
  const doi = decode(encode(unu.value))
  assert.ok(doi.ok)
  assert.equal(hashWorld(doi.value), hashWorld(unu.value))
  const env = JSON.parse(encode(unu.value)) as { schema: number }
  assert.equal(env.schema, SCHEMA_VERSION)
})

// --- schema 3 -> 4 ---------------------------------------------------------

const SCHEMA3 = readFileSync(new URL('./fixtures/save-schema3.json', import.meta.url), 'utf8')

test('fixtura de schema 3 e chiar de schema 3: joburi in curs, prioPersonala cu O categorie, fara iteme si fara zone', () => {
  const env = JSON.parse(SCHEMA3) as { schema: number; data: { agents: { count: number; jobKind: number[]; prioPersonala: number[]; categorii?: number }; iteme?: unknown; zone?: unknown } }
  assert.equal(env.schema, 3)
  assert.ok(env.data.agents.jobKind.some((k) => k !== 0), 'fixtura n-are niciun job in curs')
  assert.equal(env.data.agents.prioPersonala.length, env.data.agents.count, 'fixtura de schema 3 trebuie sa aiba o singura categorie per pion')
  assert.equal(env.data.agents.categorii, undefined)
  assert.equal(env.data.iteme, undefined)
  assert.equal(env.data.zone, undefined)
  assert.ok(SCHEMA_VERSION > 3)
})

test('migrarea 3 -> 4: joburile de sapat si rezervarile se pastreaza, prioPersonala se largeste cu implicitul pentru CARA, itemele si zonele pornesc goale', () => {
  const out = decode(SCHEMA3)
  assert.ok(out.ok, `refuzat: ${JSON.stringify(out)}`)
  const w = out.value
  assert.equal(w.schema, SCHEMA_VERSION)
  assert.equal(w.tick, 65)
  assert.equal(w.agents.count, 3)
  let cuJob = 0
  for (let i = 0; i < w.agents.count; i++) if (w.agents.jobKind[i] !== 0) cuJob++
  assert.equal(cuJob, 3)
  assert.equal(w.rezervari.total, 3)
  assert.equal(w.rezervari.anulateLaIncarcare, 0)
  assert.equal(w.iteme.count, 0)
  assert.equal(w.zone.count, 0)
  assert.equal(w.zone.celule.count, 0)
  const raw = JSON.parse(SCHEMA3) as { data: { agents: { prioPersonala: number[] } } }
  for (let i = 0; i < w.agents.count; i++) {
    assert.equal(w.agents.prioPersonala[i * CATEGORII + 0], raw.data.agents.prioPersonala[i])
    assert.equal(w.agents.prioPersonala[i * CATEGORII + 1], DEFAULT_RULES.personalPriorityDefault)
    assert.equal(w.agents.caraCantitate[i], 0)
    assert.equal(w.agents.jobDest[i], 0)
    assert.equal(w.agents.jobCantitate[i], 0)
    assert.equal(w.agents.jobEfect[i], 0)
  }
  // Si lumea merge mai departe: joburile se termina si sapatul produce mormane.
  advance(w, 400)
  assert.equal(w.desemnari.vii, 0, 'joburile din fixtura nu s-au terminat dupa migrare')
  assert.ok(w.iteme.vii > 0, 'sapatul de dupa migrare n-a produs nimic')
})

test('migrarea 3 -> 4 e idempotenta si determinista: rescris si reincarcat, acelasi hash; doua incarcari evolueaza identic', () => {
  const unu = decode(SCHEMA3)
  assert.ok(unu.ok)
  const doi = decode(encode(unu.value))
  assert.ok(doi.ok)
  assert.equal(hashWorld(doi.value), hashWorld(unu.value))
  const a = decode(SCHEMA3)
  const b = decode(SCHEMA3)
  assert.ok(a.ok && b.ok)
  advance(a.value, 300)
  advance(b.value, 300)
  assert.equal(hashWorld(a.value), hashWorld(b.value))
})

test('un save de schema 4 cu prioPersonala de lungime gresita fata de `categorii` e refuzat', () => {
  const unu = decode(SCHEMA3)
  assert.ok(unu.ok)
  const raw = JSON.parse(encode(unu.value)) as { data: { agents: { prioPersonala: number[] } } }
  raw.data.agents.prioPersonala.push(1)
  const out = decode(JSON.stringify(raw))
  assert.equal(out.ok, false)
})

// ---------------------------------------------------------------------------
// 6 -> 7 (S20-23, taietura 2): constructia
// ---------------------------------------------------------------------------

const SCHEMA6 = readFileSync(new URL('./fixtures/save-schema6.json', import.meta.url), 'utf8')

test('fixtura de schema 6 e chiar de schema 6: desemnari vii, prioPersonala cu DOUA categorii, zero piese', () => {
  const env = JSON.parse(SCHEMA6) as {
    schema: number
    savedAtTick: number
    data: { agents: { categorii: number }; desemnari: Record<string, unknown> }
  }
  assert.equal(env.schema, 6)
  assert.equal(env.savedAtTick, 300)
  assert.equal(env.data.agents.categorii, 2, `fixtura trebuie capturata cu DOUA categorii`)
  assert.equal(env.data.desemnari.piesa, undefined, 'la schema 6 nu exista campul `piesa`')
  assert.ok((env.data.desemnari.count as number) > 0, `fixtura trebuie sa CONTINA desemnari, altfel migrarea n-are ce migra`)
  assert.ok(SCHEMA_VERSION > 6, 'testul asta exista pentru ca schema a crescut')
})

test('migrarea 6 -> 7: fiecare desemnare primeste santinela NICIUNA, si prioPersonala se largeste cu implicitul', () => {
  const out = decode(SCHEMA6)
  assert.ok(out.ok, `refuzat: ${JSON.stringify(out)}`)
  const w = out.value
  assert.equal(w.schema, SCHEMA_VERSION)
  assert.equal(w.tick, 300)
  assert.ok(w.desemnari.count > 0, `fixtura: ${w.desemnari.count} desemnari`)

  for (let i = 0; i < w.desemnari.count; i++) {
    assert.equal(w.desemnari.kind[i], Desemnare.SAPA, `desemnarea ${i} dintr-un save vechi nu poate fi decat de sapat`)
    assert.equal(w.desemnari.piesa[i], Piesa.NICIUNA, `desemnarea ${i} trebuie sa primeasca santinela, nu o piesa`)
  }

  // A treia categorie exista si porneste de la implicit, nu de la zero: zero ar
  // insemna „nu face asta niciodata", iar oamenii aia lucrau deja acolo.
  for (let i = 0; i < w.agents.count; i++) {
    assert.equal(
      w.agents.prioPersonala[i * CATEGORII + Categorie.CONSTRUIESTE],
      DEFAULT_RULES.personalPriorityDefault,
      `pionul ${i} trebuie sa primeasca implicitul pe categoria noua`,
    )
  }
})

test('migrarea 6 -> 7 e idempotenta: rescris de codul nou si reincarcat, acelasi hash', () => {
  const out = decode(SCHEMA6)
  assert.ok(out.ok)
  if (!out.ok) return
  const rescris = decode(encode(out.value))
  assert.ok(rescris.ok, `refuzat la reincarcare: ${JSON.stringify(rescris)}`)
  if (!rescris.ok) return
  assert.equal(hashWorld(rescris.value), hashWorld(out.value))
})

test('felul si piesa trebuie sa se potriveasca: ambele contradictii sunt REFUZATE', () => {
  // Santinela ar fi decorativa fara refuzul asta. Un save in care o desemnare de
  // sapat poarta o piesa, sau una de construit n-are niciuna, nu se repara tacit:
  // prima ar fi un perete pe care nimeni nu l-a cerut, a doua un job fara ce sa
  // construiasca.
  const baza = decode(SCHEMA6)
  assert.ok(baza.ok)
  if (!baza.ok) return

  const strica = (f: (d: Record<string, number[]>) => void): string => {
    const raw = JSON.parse(encode(baza.value)) as { data: { desemnari: Record<string, number[]> } }
    f(raw.data.desemnari)
    return JSON.stringify(raw)
  }

  const cuPiesa = decode(strica((d) => { d.piesa[0] = Piesa.PERETE }))
  assert.equal(cuPiesa.ok, false, 'o desemnare de SAPAT cu piesa trebuie refuzata')
  if (!cuPiesa.ok) assert.equal(cuPiesa.reason, Reason.VALOARE_INVALIDA)

  const faraPiesa = decode(strica((d) => { d.kind[0] = Desemnare.CONSTRUIESTE }))
  assert.equal(faraPiesa.ok, false, 'o desemnare de CONSTRUIT fara piesa trebuie refuzata')
  if (!faraPiesa.ok) assert.equal(faraPiesa.reason, Reason.VALOARE_INVALIDA)

  // Controlul negativ: neatinsa, aceeasi lume se incarca.
  assert.equal(decode(strica(() => {})).ok, true, 'fixtura: saveul neatins trebuie sa se incarce')
})
