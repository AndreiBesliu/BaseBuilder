/**
 * Depozitul peste santiere — recenzia incaperilor, USA-5 (pre-existent, identic pe 2621d05).
 *
 * Un depozit pictat peste amprenta unei constructii (caz plauzibil: jucatorul picteaza depozitul pe
 * locul casei, inainte sau dupa ce o deseneaza) golea colonia: `indexZone` oferea drept destinatie
 * si celulele de pe santiere vii, carausii duceau marfa acolo, `celulaLibera` refuza piesa, iar
 * constructorul — neintreruptibil cu piatra in mana — astepta pe veci si pleca din asezare. Masurat
 * de verificator: zid drept 7×2, 4/4 pioni plecati pe 3/3 seminte, 4–8 piese din 14 nezidite la
 * 60.000 de tickuri; controlul (depozitul doar in fata zidului) gata la ~800.
 *
 * Reparatia are trei parti, fiecare cu testul ei: indexul nu ofera celula de sub un santier (la cota
 * ei sau la cap); carausul prins pe drum de o desemnare noua lasa marfa langa santier; iar un morman
 * ajuns totusi pe santier (o salvare veche, un buiandrug) e un refuz pe tinta, nu o asteptare.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyCommand } from '../src/sim/commands.ts'
import { slotDesemnare } from '../src/sim/desemnari.ts'
import { creeazaItem, itemLaCelula } from '../src/sim/iteme.ts'
import { lastJobReport } from '../src/sim/joburi.ts'
import { codMotiv, Reason } from '../src/sim/result.ts'
import { decode, encode } from '../src/sim/save.ts'
import { Faction, FelJob, Item, PasCara, Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { fill } from '../src/sim/terrain/terrain.ts'
import { indexZone, marcheazaZoneMurdare, slotCelulaDeZona, vedereFaraDepozit, Zona } from '../src/sim/zone.ts'
import { lasaItem, panaCand, R, ruleaza, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

/** Mormanele de pe santierele VII din `ids`: la cota santierului sau la cap (z−1). */
function mormanePeSantiere(w: World, ids: readonly number[]): number {
  const d = w.desemnari
  let n = 0
  for (const id of ids) {
    const ds = slotDesemnare(d, id)
    if (ds === -1) continue
    if (itemLaCelula(w.iteme, d.wx[ds]!, d.wy[ds]!, d.z[ds]!) !== -1 || itemLaCelula(w.iteme, d.wx[ds]!, d.wy[ds]!, d.z[ds]! - 1) !== -1) n++
  }
  return n
}

function pioni(w: World, wx: number, wy: number, g: number, cati: number): void {
  for (let i = 0; i < cati; i++) {
    assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 3) * 1000 + 500, y: (wy + 12 + i) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
  }
}

test('DEPOZIT PESTE SANTIER (USA-5): indexul nu ofera celula de depozit de sub un santier, la cota ei sau la cap', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const x = wx + 4, y = wy + 4
  // Trei celule de depozit pe un rand: A sub un PERETE la cota ei, B sub un buiandrug (santierul la
  // z+1, capul unui pion de pe B), C libera. Aici nu se zideste nimic: desenarea nu cere sprijin.
  const out = applyCommand(w, { kind: 'picteazaZona', x0: x, y0: y, x1: x + 2, y1: y, z: g + 1, fel: Zona.DEPOZIT }, R)
  assert.ok(out.ok, JSON.stringify(out))
  const zs = w.zone.laId.get(out.ok ? out.value : -1)!
  const libere = (): string[] => indexZone(w, R).libere[zs]!.map((cs) => `${w.zone.celule.wx[cs]! - x}`).sort()
  assert.deepEqual(libere(), ['0', '1', '2'], 'premisa: fara santiere, toate trei sunt libere')
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z: g + 1, piesa: Piesa.PERETE }, R).ok)
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: x + 1, wy: y, z: g + 2, piesa: Piesa.PERETE }, R).ok)
  assert.deepEqual(libere(), ['2'], 'A (santier la cota) si B (santier la cap) nu sunt destinatie')
})

test('DEPOZIT PESTE SANTIER (USA-5): indexul continuu = indexul incarcat, dupa o desemnare peste depozit si dupa anularea ei', () => {
  // Indexul citeste acum si desemnarile, deci fiecare schimbare a lor trebuie sa-l murdareasca. O
  // marcare lipsa lasa indexul continuu „curat si vechi", iar cel reconstruit la incarcare nu: doua
  // lumi. Proba pe hash (M5) NU prinde asta — verificatorul a aratat ca mutantii trec M5.
  const semn = (ww: World): string => JSON.stringify(indexZone(ww, R).libere.map((l) => l.length))
  const incarcat = (ww: World): World => { const d = decode(encode(ww), R); assert.ok(d.ok); return d.value }
  for (const seed of [12345, 777]) {
    const { w, wx, wy, g } = sitPlat(seed, 18)
    const x0 = wx + 5, y0 = wy + 4
    assert.ok(applyCommand(w, { kind: 'picteazaZona', x0: x0 + 1, y0: y0 - 1, x1: x0 + 5, y1: y0 + 3, z: g + 1, fel: Zona.DEPOZIT }, R).ok)
    pioni(w, wx, wy, g, 2)
    ruleaza(w, 50)
    indexZone(w, R)
    const ids: number[] = []
    for (let dx = 1; dx <= 5; dx++) {
      const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + dx, wy: y0 + 1, z: g + 1, piesa: Piesa.PERETE }, R)
      assert.ok(o.ok, JSON.stringify(o))
      if (o.ok) ids.push(o.value)
    }
    assert.equal(semn(w), semn(incarcat(w)), `seed ${seed}: dupa desemnare`)
    indexZone(w, R)
    for (const id of ids) assert.ok(applyCommand(w, { kind: 'anuleazaDesemnarea', id }, R).ok)
    assert.equal(semn(w), semn(incarcat(w)), `seed ${seed}: dupa anulare`)
  }
})

test('DEPOZIT PESTE SANTIER (USA-5): un zid drept cu depozitul pictat peste randul lui se termina, fara plecati si fara marfa pe santier', () => {
  // Scena verificatorului (verif-USA-5/scena.ts, `zid peste`), in ambele ordini: desemnarile intai,
  // apoi depozitul; si invers.
  for (const zonaIntai of [false, true]) {
    const { w, wx, wy, g } = sitPlat(12345, 18)
    const x0 = wx + 5, y0 = wy + 4
    const ids: number[] = []
    const desemneaza = (): void => {
      for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 7; dx++) {
        const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + dx, wy: y0, z, piesa: Piesa.PERETE }, R)
        assert.ok(o.ok, JSON.stringify(o))
        if (o.ok) ids.push(o.value)
      }
    }
    const picteaza = (): void => {
      assert.ok(applyCommand(w, { kind: 'picteazaZona', x0: x0 + 1, y0: y0 - 1, x1: x0 + 5, y1: y0, z: g + 1, fel: Zona.DEPOZIT }, R).ok)
    }
    if (zonaIntai) { picteaza(); desemneaza() } else { desemneaza(); picteaza() }
    let piatra = ids.length * 20
    for (let i = 0; piatra > 0; i++) { const c = Math.min(60, piatra); lasaItem(w, Item.PIATRA, c, wx - 2 + (i % 5), wy + ((i / 5) | 0)); piatra -= c }
    for (let i = 0; i < 10; i++) lasaItem(w, Item.HRANA, 75, wx + 14 + (i % 3), wy - 1 + ((i / 3) | 0))
    for (let i = 0; i < 6; i++) lasaItem(w, Item.PAMANT, 20, x0 + i, y0 - 4)
    pioni(w, wx, wy, g, 4)
    let maxPeSantier = 0
    const t = panaCand(w, 3000, (ww) => {
      if ((ww.tick & 15) === 0) maxPeSantier = Math.max(maxPeSantier, mormanePeSantiere(ww, ids))
      return ids.every((id) => slotDesemnare(ww.desemnari, id) === -1)
    })
    const ramase = ids.filter((id) => slotDesemnare(w.desemnari, id) !== -1).length
    assert.ok(t !== -1, `zonaIntai=${zonaIntai}: ${ramase}/${ids.length} piese nezidite in 3000 de tickuri (mormane pe santiere: ${maxPeSantier})`)
    assert.equal(maxPeSantier, 0, `zonaIntai=${zonaIntai}: marfa carata pe santier`)
    assert.equal(w.plecatiTotal, 0)
  }
})

test('DEPOZIT PESTE SANTIER (USA-5): cursa — un perete desemnat pe celula spre care merge deja un caraus se zideste; marfa ajunge langa, nu pe santier', () => {
  // verif-USA-5/cursa.ts: rezervarea destinatiei e dinaintea santierului, deci indexul singur nu
  // ajunge. Pe e063f40 si cu indexul reparat fara garda din `lasa`: morman pe santier 8/8, zidite 0/8.
  let prinse = 0
  for (const seed of [12345, 777, 4242]) {
    const { w, wx, wy, g } = sitPlat(seed, 18)
    const x0 = wx + 5, y0 = wy + 4
    assert.ok(applyCommand(w, { kind: 'picteazaZona', x0, y0, x1: x0 + 6, y1: y0, z: g + 1, fel: Zona.DEPOZIT }, R).ok)
    for (let i = 0; i < 4; i++) lasaItem(w, Item.PAMANT, 20, wx + 14 + i, wy + 14)
    for (let i = 0; i < 2; i++) lasaItem(w, Item.PIATRA, 60, wx - 2 + i, wy)
    for (let i = 0; i < 4; i++) lasaItem(w, Item.HRANA, 75, wx + 14 + i, wy - 1)
    for (let i = 0; i < 2; i++) assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 16) * 1000 + 500, y: (wy + 12 + i) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
    const a = w.agents
    let id = -1, cx = 0, cy = 0, cz = 0
    for (let t = 0; t < 3000 && id === -1; t++) {
      ruleaza(w, 1)
      for (let i = 0; i < a.count; i++) {
        if (a.alive[i] !== 1 || a.jobKind[i] !== FelJob.CARA || a.jobStep[i] !== PasCara.MERGE_DEST || a.caraKind[i] !== Item.PAMANT) continue
        const cs = slotCelulaDeZona(w.zone, a.jobDest[i]!)
        if (cs === -1) continue
        cx = w.zone.celule.wx[cs]!; cy = w.zone.celule.wy[cs]!; cz = w.zone.celule.z[cs]!
        const o = applyCommand(w, { kind: 'desemneaza', wx: cx, wy: cy, z: cz, piesa: Piesa.PERETE }, R)
        if (o.ok) { id = o.value; break }
      }
    }
    assert.notEqual(id, -1, `seed ${seed}: premisa — n-am prins un caraus pe drum spre depozit`)
    prinse++
    let peSantier = 0
    const t = panaCand(w, 6000, (ww) => {
      if (slotDesemnare(ww.desemnari, id) === -1) return true
      if (itemLaCelula(ww.iteme, cx, cy, cz) !== -1) peSantier++
      return false
    })
    assert.equal(peSantier, 0, `seed ${seed}: marfa lasata pe santier (${peSantier} tickuri)`)
    assert.ok(t !== -1, `seed ${seed}: peretele de pe destinatia carausului nezidit in 6000 de tickuri`)
  }
  assert.equal(prinse, 3)
})

test('DEPOZIT PESTE SANTIER (USA-5): un morman deja sub santier (buiandrug) e refuz pe tinta — CELULA_OCUPATA, marfa jos, fara asteptare', () => {
  // Plasa pentru ce ajunge pe santier altfel decat prin depozit: o salvare de dinainte de reparatie
  // (mormanul pus direct, ca la incarcare) sau o cadere. Pe e063f40 constructorul astepta cu piatra
  // in mana, la fiecare tick, pana pleca.
  const { w, wx, wy, g } = sitPlat(777, 18)
  const x = wx + 8, y = wy + 6
  for (const dx of [-1, 1]) for (const z of [g + 1, g + 2]) assert.ok(fill(w.terrain, x + dx, y, z, P).ok)
  const o = applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z: g + 2, piesa: Piesa.PERETE }, R)
  assert.ok(o.ok, JSON.stringify(o))
  const id = o.ok ? o.value : -1
  assert.ok(creeazaItem(w.iteme, w.nextId++, Item.PAMANT, x, y, g + 1, 20).ok)
  marcheazaZoneMurdare(w)
  assert.notEqual(itemLaCelula(w.iteme, x, y, g + 1), -1, 'premisa: mormanul e sub buiandrug')
  lasaItem(w, Item.PIATRA, 40, wx + 2, wy + 2)
  for (let i = 0; i < 10; i++) lasaItem(w, Item.HRANA, 75, wx + 14 + (i % 3), wy - 1 + ((i / 3) | 0))
  pioni(w, wx, wy, g, 2)
  let ocupat = 0
  let maxCuMarfa = 0
  const cuMarfa = new Map<number, number>()
  ruleaza(w, 3000, R, (ww) => {
    ocupat += lastJobReport().santierOcupat
    const a = ww.agents
    for (let i = 0; i < a.count; i++) {
      const n = a.alive[i] === 1 && a.jobKind[i] === FelJob.CONSTRUIESTE && a.caraCantitate[i]! > 0 ? (cuMarfa.get(i) ?? 0) + 1 : 0
      cuMarfa.set(i, n)
      if (n > maxCuMarfa) maxCuMarfa = n
    }
  })
  const ds = slotDesemnare(w.desemnari, id)
  assert.notEqual(ds, -1, 'santierul ramane (mormanul e tot acolo)')
  assert.equal(w.desemnari.ultimulMotiv[ds], codMotiv(Reason.CELULA_OCUPATA), 'cauza pe santier: CELULA_OCUPATA')
  assert.ok(ocupat < 100, `constructorul a asteptat langa santier ${ocupat} tickuri`)
  assert.ok(maxCuMarfa < 1000, `un constructor a tinut piatra in mana ${maxCuMarfa} tickuri la rand`)
})

test('DEPOZIT PESTE SANTIER (USA-5): marfa lasata la picioare nu ajunge sub un buiandrug desemnat (asazaItem intreaba subSantier)', () => {
  const { w, wx, wy, g } = sitPlat(12345, 12)
  const x = wx + 5, y = wy + 5
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z: g + 2, piesa: Piesa.PERETE }, R).ok)
  const m = applyCommand(w, { kind: 'lasaItem', fel: Item.PAMANT, cantitate: 20, wx: x, wy: y, z: g + 1 }, R)
  assert.ok(m.ok, JSON.stringify(m))
  assert.equal(itemLaCelula(w.iteme, x, y, g + 1), -1, 'celula de sub santier (capul constructorului) ramane libera')
  const s = w.iteme.laId.get(m.ok ? m.value : -1)!
  assert.equal(Math.max(Math.abs(w.iteme.wx[s]! - x), Math.abs(w.iteme.wy[s]! - y)), 1, 'mormanul sta langa, la indemana')
})

test('DEPOZIT PESTE SANTIER (USA-5): vederea UI-ului cu indexul murdar nu numara drept loc o celula de depozit de sub un santier', () => {
  // `vedereFaraDepozit`, cu indexul murdar, spunea „o celula de DEPOZIT goala primeste orice drum" —
  // si pentru o celula pe care indexul n-o mai ofera. UI-ul arata atunci „are depozit" exact cand
  // simularea scria FARA_DEPOZIT pe morman.
  const { w, wx, wy, g } = sitPlat(4242, 12)
  const x = wx + 4, y = wy + 4
  assert.ok(applyCommand(w, { kind: 'picteazaZona', x0: x, y0: y, x1: x, y1: y, z: g + 1, fel: Zona.DEPOZIT }, R).ok)
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: x, wy: y, z: g + 1, piesa: Piesa.PERETE }, R).ok)
  const m = lasaItem(w, Item.PIATRA, 20, wx + 8, wy + 8)
  const it = w.iteme.laId.get(m)!
  indexZone(w, R)
  assert.equal(vedereFaraDepozit(w, R).esteFaraDepozit(it), true, 'indexul la zi: singura celula de depozit e sub santier')
  marcheazaZoneMurdare(w)
  assert.equal(vedereFaraDepozit(w, R).esteFaraDepozit(it), true, 'indexul murdar: acelasi raspuns')
})
