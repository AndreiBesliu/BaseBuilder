import test from 'node:test'
import assert from 'node:assert/strict'
import { decode, encode, SAVE_BUILD } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { advance, createWorld } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { Faction, SCHEMA_VERSION } from '../src/sim/state.ts'
import { Reason } from '../src/sim/result.ts'
import { groundLevelM, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'
import { FelJob, PasConstruieste } from '../src/sim/state.ts'
import { Desemnare, slotDesemnare } from '../src/sim/desemnari.ts'
import { dumpRezervari, rezervariPentru, Strat, verificaRezervari } from '../src/sim/rezervari.ts'
import { existaTinta, lastJobReport, verificaCantitatiRezervate } from '../src/sim/joburi.ts'
import { slotItem } from '../src/sim/iteme.ts'
import { laSit, lasaItem, lumeBogata, lumeFragmentata, picteaza, R, solid, solidLaDistanta } from './fixturi.ts'
import { Item, Nevoie, NEVOI } from '../src/sim/state.ts'

/**
 * Agenti asezati PE SOL.
 *
 * Prima versiune ii nastea la `z = 0`, iar solul de sub ei e la zeci de metri
 * diferenta. Un agent in aer nu ajunge in nicio regiune, deci nu isi alege tinta,
 * nu cere drum, nu trage din RNG si nu se misca. Masurat pe fixtura veche: dupa
 * 2000 de tickuri, 0 din 12 agenti se mutasera, 0 trageri din fluxul `agents`,
 * 0 drumuri, 0 chunk-uri promovate.
 *
 * Adica testul central al lui M5 — „1000 + load + 1000 == 2000" — compara doua
 * lumi in care nu se intampla NIMIC. Nu poate deveni rosu. A stat asa de la
 * felia 1, si a fost declarat in DEVLOG drept „dovedit ca no-op observabil".
 */
function populated(seed: number, n = 12) {
  const w = createWorld(seed)
  let pusi = 0
  for (let k = 1; k <= 8000 && pusi < n; k++) {
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = groundLevelM(w.terrain, wx, wy)
    if (!g.ok) continue
    const sus = materialAt(w.terrain, wx, wy, g.value)
    if (!sus.ok || !isSolid(sus.value)) continue
    const r = applyCommand(w, {
      kind: 'spawnAgent',
      x: wx * 1000 + 500,
      y: wy * 1000 + 500,
      z: g.value + 1,
      faction: pusi % 4 === 0 ? Faction.JEFUITOR : Faction.ASEZARE,
    })
    if (r.ok) pusi++
  }
  assert.equal(pusi, n, 'fixtura n-a reusit sa aseze toti agentii pe sol')
  return w
}

test('roundtrip-ul de save e un no-op observabil: 1000 + load + 1000 == 2000', () => {
  // Testul central al lui M5. Daca pica, save-ul pierde stare ascunsa undeva.
  const continuous = populated(555)
  advance(continuous, 2000)

  const interrupted = populated(555)
  advance(interrupted, 1000)
  const loaded = decode(encode(interrupted))
  assert.ok(loaded.ok, 'incarcarea a esuat')
  advance(loaded.value, 1000)

  assert.equal(hashWorld(loaded.value), hashWorld(continuous))
})

test('salvarea in mijlocul unei rulari reproduce exact evolutia originala', () => {
  const original = populated(31337)
  advance(original, 137)
  const snapshot = encode(original)
  advance(original, 500)

  const restored = decode(snapshot)
  assert.ok(restored.ok)
  advance(restored.value, 500)

  assert.equal(hashWorld(restored.value), hashWorld(original))
})

test('starea fluxurilor de RNG supravietuieste salvarii', () => {
  const w = populated(77)
  advance(w, 250)
  const loaded = decode(encode(w))
  assert.ok(loaded.ok)
  assert.equal(loaded.value.rng.agents.draws, w.rng.agents.draws)
  assert.equal(loaded.value.rng.agents.s0, w.rng.agents.s0)
  assert.equal(loaded.value.rng.combat.s3, w.rng.combat.s3)
})

test('un save dintr-un build mai NOU e refuzat, nu interpretat pe ghicite', () => {
  const w = populated(1)
  const env = JSON.parse(encode(w)) as Record<string, unknown>
  env.build = SAVE_BUILD + 1
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.CAPACITATE_DEPASITA)
    assert.equal(out.params.camp, 'build')
  }
})

test('o schema mai noua decat cea cunoscuta e refuzata', () => {
  const w = populated(1)
  const env = JSON.parse(encode(w)) as Record<string, unknown>
  env.schema = SCHEMA_VERSION + 1
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.params.camp, 'schema')
})

test('un save de la alt joc e refuzat', () => {
  const w = populated(1)
  const env = JSON.parse(encode(w)) as Record<string, unknown>
  env.game = 'altceva'
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
})

test('identitatile duplicate sunt prinse la incarcare, nu descoperite peste o ora', () => {
  const w = populated(9, 5)
  const env = JSON.parse(encode(w)) as { data: { agents: { id: number[] } } }
  env.data.agents.id[1] = env.data.agents.id[0]!
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
  if (!out.ok) {
    assert.equal(out.reason, Reason.ENTITATE_INEXISTENTA)
    assert.equal(out.params.motiv, 'duplicat')
  }
})

test('un count mai mare decat capacitatea e refuzat', () => {
  const w = populated(9, 5)
  const env = JSON.parse(encode(w)) as { data: { agents: { count: number; capacity: number } } }
  env.data.agents.count = env.data.agents.capacity + 1
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.reason, Reason.CAPACITATE_DEPASITA)
})

test('un JSON stricat produce un refuz, nu o exceptie', () => {
  const out = decode('{ nu e json }')
  assert.equal(out.ok, false)
})

test('un flux de RNG lipsa e prins explicit', () => {
  const w = populated(2)
  const env = JSON.parse(encode(w)) as { data: { rng: Record<string, unknown> } }
  delete env.data.rng.combat
  const out = decode(JSON.stringify(env))
  assert.equal(out.ok, false)
  if (!out.ok) assert.equal(out.params.camp, 'rng.combat')
})

test('sloturile moarte nu se salveaza degeaba, dar indexii raman stabili', () => {
  const w = populated(12, 6)
  const second = w.agents.id[1]!
  applyCommand(w, { kind: 'killAgent', id: second })
  const loaded = decode(encode(w))
  assert.ok(loaded.ok)
  assert.equal(loaded.value.agents.count, 6)
  assert.equal(loaded.value.agents.alive[1], 0)
  assert.equal(hashWorld(loaded.value), hashWorld(w))
})



test('M5 pe o lume in care chiar se intampla ceva — si care se PROBEAZA ca atare', () => {
  // Acelasi enunt ca testul central de sus („1000 + load + 1000 == 2000"), dar pe o
  // lume care sapa, cara, mananca si zideste. Pe `populated` el nu putea deveni rosu:
  // acolo nu exista niciun job in afara de DOARME, deci orice camp PERSISTED al
  // taieturilor 2 si 3 putea lipsi din `encode` fara ca nimic sa se schimbe. Unul
  // CHIAR lipsea — `jobConsumat` — si a trecut neobservat pana pe 19.09.2026.
  const N = 400
  const continuu = lumeBogata(12345)
  const intrerupt = lumeBogata(12345)
  assert.equal(hashWorld(continuu), hashWorld(intrerupt), 'fixtura nu e determinista')

  advance(continuu, 2 * N, R)

  advance(intrerupt, N, R)
  const out = decode(encode(intrerupt), R)
  assert.ok(out.ok, `decode a refuzat propriul encode: ${JSON.stringify(out)}`)
  const incarcat = out.ok ? out.value : intrerupt
  advance(incarcat, N, R)

  assert.equal(hashWorld(incarcat), hashWorld(continuu),
    `${N} + save + load + ${N} difera de ${2 * N}: un camp PERSISTED nu supravietuieste salvarii`)
})

test('fixtura bogata ATINGE ce pretinde: toate felurile de job, marfa in mana, si masa', () => {
  // Contorul de viata al testului de deasupra, scris separat ca sa spuna EXACT ce
  // lipseste cand moare. `populated` a murit de doua ori: intai agentii se nasteau
  // la `z = 0` si nu se miscau deloc; apoi se miscau, dar in 2000 de tickuri singurul
  // fel de job pe care il luau vreodata era DOARME. A doua moarte a tinut doi ani.
  const w = lumeBogata(12345)
  const feluri = new Set<number>()
  let cuJobConsumat = 0
  let cuCaraCantitate = 0
  let cuIteme = 0
  let cuDesemnari = 0
  let cuZone = 0
  for (let t = 0; t < 800; t++) {
    advance(w, 1, R)
    for (let i = 0; i < w.agents.count; i++) {
      if (w.agents.alive[i] !== 1) continue
      feluri.add(w.agents.jobKind[i]!)
      if (w.agents.jobConsumat[i]! !== 0) cuJobConsumat++
      if (w.agents.caraCantitate[i]! !== 0) cuCaraCantitate++
    }
    for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1) { cuIteme++; break }
    for (let i = 0; i < w.desemnari.count; i++) if (w.desemnari.alive[i] === 1) { cuDesemnari++; break }
    for (let i = 0; i < w.zone.count; i++) if (w.zone.alive[i] === 1) { cuZone++; break }
  }
  for (const [nume, fel] of [['SAPA', FelJob.SAPA], ['CARA', FelJob.CARA], ['MANANCA', FelJob.MANANCA], ['CONSTRUIESTE', FelJob.CONSTRUIESTE]] as const) {
    assert.ok(feluri.has(fel), `fixtura moarta: niciun pion nu ia vreodata un job de ${nume}`)
  }
  assert.ok(cuJobConsumat > 0, 'fixtura moarta: `jobConsumat` e nul la fiecare tick — exact campul care lipsea din encode')
  assert.ok(cuCaraCantitate > 0, 'fixtura moarta: nimeni nu tine vreodata marfa in mana')
  assert.ok(cuIteme > 100, `fixtura moarta: iteme vii doar ${cuIteme} tickuri din 800`)
  assert.ok(cuDesemnari > 100, `fixtura moarta: desemnari vii doar ${cuDesemnari} tickuri din 800`)
  assert.ok(cuZone > 100, `fixtura moarta: zone vii doar ${cuZone} tickuri din 800`)
})

test('o `piesa` din afara tabelului e refuzata la USA, nu descoperita la prima scanare', () => {
  // Verificarea existenta cerea doar ca `piesa` sa fie diferita de santinela cand
  // felul e CONSTRUIESTE. Un `piesa` din afara tabelului trecea amandoua conditiile,
  // iar prima scanare care il folosea ca indice crapa cu TypeError — adica o
  // incarcare ACCEPTATA care omoara jocul cateva zeci de tickuri mai tarziu.
  const w = lumeBogata(12345)
  let k = -1
  for (let i = 0; i < w.desemnari.count; i++) {
    if (w.desemnari.alive[i] === 1 && w.desemnari.kind[i] === Desemnare.CONSTRUIESTE) { k = i; break }
  }
  assert.notEqual(k, -1, 'fixtura moarta: n-are nicio desemnare de construit')

  const brut = JSON.parse(encode(w)) as { data: { desemnari: { piesa: number[] } } }
  // Controlul: NEATINS, acelasi save se incarca.
  assert.ok(decode(JSON.stringify(brut), R).ok, 'fixtura: save-ul neatins nu se incarca')

  for (const valoare of [200, -1, R.piese.length]) {
    const stricat = JSON.parse(encode(w)) as { data: { desemnari: { piesa: number[] } } }
    stricat.data.desemnari.piesa[k] = valoare
    const out = decode(JSON.stringify(stricat), R)
    assert.equal(out.ok, false, `piesa ${valoare} a fost ACCEPTATA la incarcare`)
    if (!out.ok) {
      assert.equal(out.reason, Reason.VALOARE_INVALIDA, `piesa ${valoare}: refuzata, dar din alt motiv`)
    }
  }
  assert.ok(brut.data.desemnari.piesa.length > 0)
})

/** Semintele si lungimea pe care se masoara invariantii PER TICK. */
/** Oracolul SCUMP (encode+decode, ~15 ms pe granita) merge ingust... */
const SEMINTE_ROUNDTRIP = [12345, 7] as const
const TICKURI_ROUNDTRIP = 300
/** ...iar cel IEFTIN merge larg: verificarea rezervarilor nu serializeaza nimic. */
const SEMINTE_REZERVARI = [12345, 7, 12, 17, 18, 19] as const
const TICKURI_REZERVARI = 600

test('M5 la FIECARE tick, nu doar la unul ales', () => {
  // Enuntul TARE, pe care testul de deasupra nu-l putea cere pana pe 22.09.2026.
  //
  // Pana atunci, `ridica` si `mananca` omorau un morman fara sa incheie joburile care
  // il tinteau: `stergeItem` isi scrie contractul in docstring („rezervarile de pe un
  // morman mort sunt treaba apelantului"), dar din trei apelanti doar `mutaItem` si-l
  // respecta. Ramaneau un job VIU pe un id mort si o rezervare ORFANA, pana la 127 de
  // tickuri, iar lumea continua si cea incarcata NU re-convergeau.
  //
  // Masurat pe fixtura asta, 11 seminte x 600 de tickuri: **74 de granite rosii din
  // 6600** inainte, 0 dupa.
  //
  // Enuntul de mai sus („N + save + load + N == 2N") RAMANE, si nu e redundant: el ia
  // save-ul la un singur tick si lasa lumea sa mearga mai departe, deci prinde si ce
  // diverge DUPA incarcare, nu doar la granita.
  let granite = 0
  let mortiTintite = 0
  for (const seed of SEMINTE_ROUNDTRIP) {
    const w = lumeBogata(seed)
    for (let t = 0; t < TICKURI_ROUNDTRIP; t++) {
      // Contorul de VIATA: id-uri de item vii pe care CINEVA le tinteste acum.
      const tintite = new Set<number>()
      for (let i = 0; i < w.agents.count; i++) {
        if (w.agents.alive[i] === 1 && w.agents.jobKind[i] !== 0) tintite.add(w.agents.jobTarget[i]!)
      }
      const viiInainte = new Set<number>()
      for (let i = 0; i < w.iteme.count; i++) {
        if (w.iteme.alive[i] === 1 && tintite.has(w.iteme.id[i]!)) viiInainte.add(w.iteme.id[i]!)
      }

      advance(w, 1, R)
      granite++

      const viiAcum = new Set<number>()
      for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1) viiAcum.add(w.iteme.id[i]!)
      for (const id of viiInainte) if (!viiAcum.has(id)) mortiTintite++

      const out = decode(encode(w), R)
      assert.ok(out.ok, `seed ${seed}, tickul ${w.tick}: decode a refuzat propriul encode`)
      if (out.ok) {
        assert.equal(hashWorld(out.value), hashWorld(w),
          `seed ${seed}, tickul ${w.tick}: roundtrip-ul schimba lumea`)
      }
    }
  }
  assert.equal(granite, SEMINTE_ROUNDTRIP.length * TICKURI_ROUNDTRIP)
  // Fixtura ATINGE cazul: chiar mor mormane pe care cineva le tintea. Fara contorul
  // asta, testul ar trece si intr-o lume in care nimic nu moare sub picioarele nimanui.
  assert.ok(mortiTintite > 5,
    `doar ${mortiTintite} morti de morman tintit in ${granite} de granite: fixtura nu atinge cazul`)
})

test('nicio rezervare pe o tinta care nu mai exista, la FIECARE tick', () => {
  // A DOUA plasa, si nu decurge din prima: `src/sim/hash.ts` nu contine nicio
  // referinta la `w.rezervari`, deci hash-ul e ORB la o rezervare pe un id mort.
  // Masurat pe aceeasi rulare: 74 de granite rosii pe hash si 63 pe rezervari — doua
  // multimi diferite, nu una inclusa in cealalta.
  //
  // Invariantul e al codului, nu inventat aici: `verificaRezervari(..., existaTinta(w))`
  // e asertat deja in opt locuri din suita. Dar toate pe fixturi prea mici, iar cea
  // mai lunga il cheama doar la `tick % 100 === 0` — un esantion, nu un zavor.
  let granite = 0
  for (const seed of SEMINTE_REZERVARI) {
    const w = lumeBogata(seed)
    for (let t = 0; t < TICKURI_REZERVARI; t++) {
      advance(w, 1, R)
      granite++
      const v = verificaRezervari(w.rezervari, w.agents, existaTinta(w))
      assert.ok(v.ok, `seed ${seed}, tickul ${w.tick}: ${JSON.stringify(v)}`)
    }
  }
  assert.equal(granite, SEMINTE_REZERVARI.length * TICKURI_REZERVARI)
})

test('suma rezervata pe un morman nu depaseste ce e in el, la FIECARE tick — pe felurile necomestibile; pe HRANA se probeaza conservarea', () => {
  // A patra plasa, pe o alta axa decat storeul: `verificaRezervari` cere suma sub
  // PLAFONUL stratului (constant), asta cere suma sub CANTITATEA VIE. Pe HRANA
  // mancatul scade Q pe stratul MANCAT fara sa vada CARAT, si dupa ce mancatorul
  // TERMINA nimic nu reconciliaza — carausul tine legal mai mult decat e in morman
  // pana ajunge si ia `min`. Prima versiune „tolera" suma tinuta ACUM pe MANCAT si
  // era rosie exact pe starea aia (recenzia din 25.09); acum HRANA nu intra in
  // oracol, iar pe ea se cere conservarea. Contoare de viata la fiecare bloc: fara
  // ele, o fixtura in care nimeni nu imparte un morman ar trece fara sa probeze nimic.
  let doiPeAcelasi = 0
  let hranaPesteQ = 0
  for (const seed of [12345, 7, 12, 17, 18, 19]) {
    const w = lumeFragmentata(seed)
    for (let t = 0; t < 600; t++) {
      advance(w, 1, R)
      const v = verificaCantitatiRezervate(w, R)
      assert.ok(v.ok, `seed ${seed}, tickul ${w.tick}: ${JSON.stringify(v)}`)
      for (let s = 0; s < w.iteme.count; s++) {
        if (w.iteme.alive[s] === 0) continue
        const lista = rezervariPentru(w.rezervari, w.iteme.id[s]!, Strat.CARAT)
        if (new Set(lista.map((r) => r.claimant)).size >= 2) doiPeAcelasi++
        if (R.nutritie[w.iteme.kind[s]!]! > 0 && lista.reduce((a, r) => a + r.count, 0) > w.iteme.cantitate[s]!) hranaPesteQ++
      }
    }
  }
  assert.ok(doiPeAcelasi > 0, 'niciun morman n-a fost tinut de doi claimanti CARAT deodata: fixtura nu atinge ce pretinde')
  // Excluderea HRANEI se probeaza pe scenariul care produce SIGUR „CARAT peste Q cu
  // MANCAT inca tinut" (panoul, 25.09: fereastra de 26–60 de tickuri): un caraus la
  // 16–24 de celule, cu depozit langa el, si doi flamanzi lipiti de mormanul de
  // hrana. Pe lumeFragmentata coincidenta depinde de asezare, si o fixtura care
  // „se nimereste" nu e o proba.
  for (const seed of [12345, 7, 12, 99]) {
    const { w, sit } = laSit(seed, 1)
    picteaza(w, sit.wx + 2, sit.wy + 2, 3)
    const T = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 16, 24)
    lasaItem(w, Item.HRANA, 75, T.wx, T.wy)
    let flamanzi = 0
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      if (flamanzi === 2) break
      const g = solid(w, T.wx + dx, T.wy + dy)
      if (g === null) continue
      const out = applyCommand(w, { kind: 'spawnAgent', x: (T.wx + dx) * 1000 + 500, y: (T.wy + dy) * 1000 + 500, z: g + 1, faction: 0 }, R)
      if (!out.ok) continue
      w.agents.nevoi[(w.agents.count - 1) * NEVOI + Nevoie.FOAME] = 200
      flamanzi++
    }
    for (let t = 0; t < 600; t++) {
      advance(w, 1, R)
      const v = verificaCantitatiRezervate(w, R)
      assert.ok(v.ok, `HRANA, seed ${seed}, tickul ${w.tick}: ${JSON.stringify(v)}`)
      for (let s = 0; s < w.iteme.count; s++) {
        if (w.iteme.alive[s] === 0 || R.nutritie[w.iteme.kind[s]!]! === 0) continue
        if (rezervariPentru(w.rezervari, w.iteme.id[s]!, Strat.CARAT).reduce((a, r) => a + r.count, 0) > w.iteme.cantitate[s]!) hranaPesteQ++
      }
    }
  }
  assert.ok(hranaPesteQ > 0, 'niciun morman de HRANA n-a fost tinut pe CARAT peste cat avea: excluderea nu s-a probat')
  // Si starea pe care prima versiune o refuza: UN mancator (doi n-ar incapea pe
  // MANCAT: 41 + 41 > 75) care TERMINA inainte ca un caraus de la 60–80 de celule
  // sa ajunga — CARAT 50 pe un morman de 34, cu MANCAT 0. Legala: decode fara
  // anulari, marfa conservata, carausul ia 34. Recenzia a masurat-o pe 5 seminte
  // din 7; aici pe doua, cu contor de viata pe exact starea aia.
  let caratPesteQFaraMancat = 0
  for (const seed of [12345, 7]) {
    const { w, sit } = laSit(seed, 1)
    picteaza(w, sit.wx + 2, sit.wy + 2, 3)
    const T = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 60, 80)
    const idH = lasaItem(w, Item.HRANA, 75, T.wx, T.wy)
    let pus = false
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const g = solid(w, T.wx + dx, T.wy + dy)
      if (g === null) continue
      const out = applyCommand(w, { kind: 'spawnAgent', x: (T.wx + dx) * 1000 + 500, y: (T.wy + dy) * 1000 + 500, z: g + 1, faction: 0 }, R)
      if (!out.ok) continue
      w.agents.nevoi[(w.agents.count - 1) * NEVOI + Nevoie.FOAME] = 390
      pus = true
      break
    }
    assert.ok(pus, 'fixtura: flamandul')
    const hrana = (w: ReturnType<typeof lumeFragmentata>): number => {
      let s = 0
      for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1 && w.iteme.kind[i] === Item.HRANA) s += w.iteme.cantitate[i]!
      for (let i = 0; i < w.agents.count; i++) if (w.agents.caraKind[i] === Item.HRANA) s += w.agents.caraCantitate[i]!
      return s
    }
    let mancate = 0
    for (let t = 0; t < 400; t++) {
      advance(w, 1, R)
      mancate += lastJobReport().unitatiMancate
      const v = verificaCantitatiRezervate(w, R)
      assert.ok(v.ok, `HRANA cu un mancator, seed ${seed}, tickul ${w.tick}: ${JSON.stringify(v)}`)
      assert.equal(hrana(w) + mancate, 75, `seed ${seed}, tickul ${w.tick}: hrana nu se conserva`)
      const carat = rezervariPentru(w.rezervari, idH, Strat.CARAT).reduce((a, r) => a + r.count, 0)
      const mancat = rezervariPentru(w.rezervari, idH, Strat.MANCAT).reduce((a, r) => a + r.count, 0)
      const is = slotItem(w.iteme, idH)
      if (is !== -1 && mancat === 0 && carat > w.iteme.cantitate[is]!) {
        caratPesteQFaraMancat++
        const out = decode(encode(w), R)
        assert.ok(out.ok && out.value.rezervari.anulateLaIncarcare === 0, `seed ${seed}, tickul ${w.tick}: starea legala nu se incarca curat`)
      }
    }
    assert.equal(w.ratiune.itemePierdute, 0)
  }
  assert.ok(caratPesteQFaraMancat > 0, 'fixtura: mancatorul n-a terminat inaintea carausului pe niciun tick — starea pe care oracolul vechi o refuza nu s-a atins')
})

test('M5 la FIECARE tick pe lumea FRAGMENTATA: hash, tuplurile rezervarilor si zero anulari — cu surse partiale si a doua ridicare', () => {
  // A cincea plasa, si prima care compara TUPLURILE: hash-ul e orb la rezervari, iar
  // plasa a doua (`verificaRezervari`) ruleaza doar pe lumea continua. Cu count-uri
  // pe morman si retintire, un `jobCantitate` reconstruit gresit ar schimba hash-ul
  // abia tickuri mai tarziu — aici se vede la granita.
  let cuSursaPartiala = 0
  let cuDouaRidicari = 0
  let granite = 0
  for (const seed of [12345, 7]) {
    const w = lumeFragmentata(seed)
    for (let t = 0; t < 400; t++) {
      advance(w, 1, R)
      granite++
      for (let i = 0; i < w.agents.count; i++) {
        if (w.agents.alive[i] !== 1 || w.agents.jobKind[i] !== FelJob.CONSTRUIESTE || w.agents.jobStep[i]! > PasConstruieste.RIDICA) continue
        const ds = slotDesemnare(w.desemnari, w.agents.jobDest[i]!)
        if (ds !== -1 && w.agents.jobCantitate[i]! < R.piese[w.desemnari.piesa[ds]!]!.cantitate) cuSursaPartiala++
        if (w.agents.caraCantitate[i]! > 0) cuDouaRidicari++
      }
      const out = decode(encode(w), R)
      assert.ok(out.ok, `seed ${seed}, tickul ${w.tick}: decode a refuzat propriul encode: ${JSON.stringify(out)}`)
      if (out.ok) {
        assert.equal(hashWorld(out.value), hashWorld(w), `seed ${seed}, tickul ${w.tick}: roundtrip-ul schimba lumea`)
        assert.equal(dumpRezervari(out.value.rezervari), dumpRezervari(w.rezervari), `seed ${seed}, tickul ${w.tick}: tuplurile rezervarilor difera`)
        assert.equal(out.value.rezervari.anulateLaIncarcare, 0, `seed ${seed}, tickul ${w.tick}: joburi anulate la incarcare`)
      }
    }
  }
  assert.equal(granite, 800)
  assert.ok(cuSursaPartiala > 0, 'fixtura: niciun constructor n-a tinut o sursa PARTIALA in fereastra')
  assert.ok(cuDouaRidicari > 0, 'fixtura: niciun constructor n-a mers dupa a doua sursa cu prima in mana')
})

test('un count pe sursa in afara marginilor e REFUZAT la usa, nu reparat tacit', () => {
  const w = lumeFragmentata(12345)
  let slot = -1
  const la = panaCandLocal(w, 800, () => {
    for (let i = 0; i < w.agents.count; i++) {
      if (w.agents.alive[i] === 1 && w.agents.jobKind[i] === FelJob.CONSTRUIESTE && w.agents.jobStep[i]! <= PasConstruieste.RIDICA) { slot = i; return true }
    }
    return false
  })
  assert.ok(la >= 0 && slot !== -1, 'fixtura: niciun constructor pe piciorul sursei')
  const ds = slotDesemnare(w.desemnari, w.agents.jobDest[slot]!)
  assert.notEqual(ds, -1)
  const spec = R.piese[w.desemnari.piesa[ds]!]!
  const strica = (f: (a: Record<string, number[]>) => void): string => {
    const raw = JSON.parse(encode(w)) as { data: { agents: Record<string, number[]> } }
    f(raw.data.agents)
    return JSON.stringify(raw)
  }
  const preaMult = decode(strica((a) => { a.jobCantitate![slot] = spec.cantitate + 1 }), R)
  assert.equal(preaMult.ok, false, 'un count peste piesa trebuie refuzat')
  if (!preaMult.ok) assert.equal(preaMult.reason, Reason.VALOARE_INVALIDA)
  const zero = decode(strica((a) => { a.jobCantitate![slot] = 0 }), R)
  assert.equal(zero.ok, false, 'un count de zero pe piciorul sursei trebuie refuzat')
  const manaPlina = decode(strica((a) => { a.caraCantitate![slot] = spec.cantitate + 1 }), R)
  assert.equal(manaPlina.ok, false, 'mai mult in mana decat costa piesa trebuie refuzat')
  // Controlul negativ: neatins, se incarca.
  assert.equal(decode(strica(() => {}), R).ok, true)
})

/** Ruleaza pana cand conditia e adevarata, cel mult `max` tickuri. */
function panaCandLocal(w: ReturnType<typeof lumeFragmentata>, max: number, cond: () => boolean): number {
  for (let i = 0; i < max; i++) {
    if (cond()) return i
    advance(w, 1, R)
  }
  return cond() ? max : -1
}
