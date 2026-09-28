/**
 * Modelul UI-ului — PUR fata de ecran: citeste `World`, nu atinge DOM-ul sau three.
 *
 * Tot ce arata UI-ul trece pe aici, ca sa poata fi testat in node pe lumi construite in test.
 * NU scrie in `World` (testul „modelul nu scrie in World" face un instantaneu complet inainte si
 * dupa): de aceea nu cheama `indexZone` si nici `sustinutAcumMemorat` (amandoua scriu memorii).
 * Nu importa din `viewer/overlay-*.ts`: acelea trag three dupa ele (testul „modulele pure nu trag
 * three").
 *
 * Singura memorie e a UI-ului, nu a lumii: previzualizarea constructiei (`Previzualizare`), tinuta
 * pe cheia `terrain.editari:desemnari.editariConstr`, ca in overlay-stabilitate.ts.
 */

import type { Rules } from '../../src/sim/content.ts'
import { CATEGORII, Faction, FelJob, Gand, GAND_PENTRU_NEVOIE, ITEME, NEVOI, Nevoie, pasDeMers, Piesa, slotOf } from '../../src/sim/state.ts'
import type { World } from '../../src/sim/state.ts'
import { Desemnare, desemnareLaCelula, DetaliuMotiv } from '../../src/sim/desemnari.ts'
import { DetaliuItem, itemLaCelula } from '../../src/sim/iteme.ts'
import { celulaDeZonaLa, prioritateaLocului, slotZona, vedereFaraDepozit, Zona } from '../../src/sim/zone.ts'
import type { VedereFaraDepozit } from '../../src/sim/zone.ts'
import { rezervariPentru, Strat } from '../../src/sim/rezervari.ts'
import { categoriiActive, constructiaPrevizualizata, StareRatiune, tintaDispozitiei } from '../../src/sim/joburi.ts'
import { CauzaAcces } from '../../src/sim/acces.ts'
import { sustinutAcum } from '../../src/sim/stabilitate.ts'
import { motivDinCod, Reason } from '../../src/sim/result.ts'
import { cellKey } from '../../src/sim/path.ts'
import { materialAt } from '../../src/sim/terrain/terrain.ts'
import { Material } from '../../src/sim/terrain/chunk.ts'
import { numePion } from './nume.ts'
import { cant, NUME_GAND, NUME_ITEM_MIC, NUME_PIESA, textActivitate, textMinute, textMotiv, textRatiunePion } from './texte.ts'
import type { Cifre, TextMotiv } from './texte.ts'
import type { Semnal, Tinta } from './alerte.ts'

export function cifreDinReguli(rules: Rules): Cifre {
  return {
    suportMax: rules.suportMax,
    suportRazaGrinda: rules.suportRazaGrinda,
    agentHeadroomM: rules.agentHeadroomM,
    maxStepM: rules.maxStepM,
    cantitatePiesa: rules.piese[Piesa.PERETE]?.cantitate ?? 20,
    pragRidicare: rules.constructPickupMinUnits,
    atingereSusM: rules.atingereSusM,
    razaLucru: rules.jobScanRadiusCells,
    razaNevoi: rules.nevoieScanRadiusCells,
  }
}

/** Marfa din mana sau dintr-un morman, in cuvinte: „50 de piatră". */
const textMarfa = (n: number, fel: number): string => cant(n, NUME_ITEM_MIC[fel] ?? 'marfă')

const esteColonist = (w: World, i: number): boolean => w.agents.alive[i] === 1 && w.agents.faction[i] === Faction.ASEZARE

// ---------------------------------------------------------------------------------------------
// resursele si hrana
// ---------------------------------------------------------------------------------------------

export interface Marfa {
  /** Mormanele din celule de DEPOZIT (`prioritateaLocului` > 0; un loc de dormit nu e depozit). */
  readonly inDepozit: number
  /** Mormanele din afara depozitelor. */
  readonly peJos: number
  /** Ce cara oamenii vii. */
  readonly inMaini: number
  /** Suma celor trei: cifra din bara de sus. Se conserva cat se cara (testul). */
  readonly total: number
}

export interface PrognozaHrana {
  /** Puncte de nutritie in lume (mormane + maini), `cantitate × nutritie[fel]`. */
  readonly puncte: number
  /** Cat consuma coloniștii vii pe minut de joc, in puncte. 0 = nimeni. */
  readonly consumPeMin: number
  /** Minute de joc pana se termina, sau Infinity cand nu consuma nimeni. */
  readonly minute: number
}

export interface RezumatColonie {
  /** Pe fel (`Item`). */
  readonly marfa: readonly Marfa[]
  readonly hrana: PrognozaHrana
  readonly colonisti: number
  readonly jefuitori: number
  readonly flamanzi: number
  readonly obositi: number
  /** Dispozitia sub pragul de refuz: nu mai muncesc. */
  readonly nefericiti: number
  /** Tinta dispozitiei sub pragul de avertisment: vor pleca daca nu se schimba ceva. */
  readonly pleacaCurand: number
  readonly plecati: number
}

/**
 * Hrana, pe PUNCTE de nutritie, nu pe unitati de HRANA: corecta si cand va exista alt fel de
 * mancare (panoul, JN-1). Consumul: fiecare colonist pierde `nevoi.FOAME.scurgere` la fiecare
 * `nevoiTicks`; un punct de nutritie reda un punct de nevoie. Masurat de panou: 12 oameni cu 600 de
 * hrana ⇒ 26,0 min prognozat, 27,9 min pana la 0 in simulare.
 */
export function prognozaHrana(w: World, rules: Rules): PrognozaHrana {
  let puncte = 0
  const it = w.iteme
  for (let i = 0; i < it.count; i++) {
    if (it.alive[i] !== 1) continue
    puncte += it.cantitate[i]! * (rules.nutritie[it.kind[i]!] ?? 0)
  }
  const a = w.agents
  let colonisti = 0
  for (let i = 0; i < a.count; i++) {
    if (!esteColonist(w, i)) continue
    colonisti++
    if (a.caraCantitate[i]! > 0) puncte += a.caraCantitate[i]! * (rules.nutritie[a.caraKind[i]!] ?? 0)
  }
  const consumPeMin = colonisti * rules.nevoi[Nevoie.FOAME]!.scurgere * rules.ticksPerSecond * 60 / rules.nevoiTicks
  return { puncte, consumPeMin, minute: consumPeMin > 0 ? puncte / consumPeMin : Infinity }
}

export function rezumatColonie(w: World, rules: Rules): RezumatColonie {
  const acc = Array.from({ length: ITEME }, () => ({ inDepozit: 0, peJos: 0, inMaini: 0 }))
  const it = w.iteme
  for (let i = 0; i < it.count; i++) {
    if (it.alive[i] !== 1) continue
    const m = acc[it.kind[i]!]
    if (!m) continue
    if (prioritateaLocului(w.zone, it.wx[i]!, it.wy[i]!, it.z[i]!) > 0) m.inDepozit += it.cantitate[i]!
    else m.peJos += it.cantitate[i]!
  }
  const a = w.agents
  let colonisti = 0, jefuitori = 0, flamanzi = 0, obositi = 0, nefericiti = 0, pleacaCurand = 0
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] !== 1) continue
    if (a.faction[i] === Faction.JEFUITOR) { jefuitori++; continue }
    if (a.faction[i] !== Faction.ASEZARE) continue
    colonisti++
    if (a.caraCantitate[i]! > 0) { const m = acc[a.caraKind[i]!]; if (m) m.inMaini += a.caraCantitate[i]! }
    // Insignele: cine mananca sau doarme deja nu e o problema de semnalat (aceeasi definitie ca alerta;
    // numarati si ei, insigna portocalie statea aprinsa 8–14% din timp pe o colonie sanatoasa).
    if (a.jobKind[i] !== FelJob.MANANCA && a.nevoi[i * NEVOI + Nevoie.FOAME]! < rules.nevoi[Nevoie.FOAME]!.prag) flamanzi++
    if (a.jobKind[i] !== FelJob.DOARME && a.nevoi[i * NEVOI + Nevoie.ODIHNA]! < rules.nevoi[Nevoie.ODIHNA]!.prag) obositi++
    if (a.dispozitie[i]! < rules.dispozitiePragRefuz) nefericiti++
    if (tintaDispozitiei(w, rules, i) < rules.dispozitiePragAvertisment) pleacaCurand++
  }
  const marfa = acc.map((m) => ({ ...m, total: m.inDepozit + m.peJos + m.inMaini }))
  return { marfa, hrana: prognozaHrana(w, rules), colonisti, jefuitori, flamanzi, obositi, nefericiti, pleacaCurand, plecati: w.plecatiTotal }
}

/** Asezarea s-a golit: niciun colonist viu si macar unul plecat. Stare DERIVATA: tine si dupa o incarcare. */
export function golita(w: World): boolean {
  if (w.plecatiTotal <= 0) return false
  for (let i = 0; i < w.agents.count; i++) if (esteColonist(w, i)) return false
  return true
}

/**
 * De ce s-a golit, din LUME: fara nicio hrana ramasa, foamea. Cauza se citea din jurnalul alertelor,
 * taiat la 50 de intrari; la o colonie de peste ~50 de oameni, plecarile impingeau „Nu mai e hrana"
 * afara din jurnal si cardul spunea „Au plecat toti." (recenzia UI-ului, MOD-8 / T-03).
 */
export function cauzaGolirii(w: World, rules: Rules): 'hrana' | 'plecati' {
  return prognozaHrana(w, rules).puncte <= 0 ? 'hrana' : 'plecati'
}

// ---------------------------------------------------------------------------------------------
// pionul
// ---------------------------------------------------------------------------------------------

/** O nevoie sau dispozitia, pe scara 0..max, cu pragurile ei. `stare`: 0 bine, 1 sub prag, 2 sub pragul critic. */
export interface Bara {
  readonly valoare: number
  readonly max: number
  readonly prag: number
  readonly pragCritic: number
  readonly stare: 0 | 1 | 2
  /** Unde se duce (doar la dispozitie: tinta ei); altfel = valoare. */
  readonly tinta: number
}

function bara(valoare: number, max: number, prag: number, pragCritic: number, tinta = valoare): Bara {
  return { valoare, max, prag, pragCritic, stare: valoare < pragCritic ? 2 : valoare < prag ? 1 : 0, tinta }
}

/** Prioritatea pe o categorie: nivelul stocat si daca pionul chiar o scaneaza (Exclusiv pe alta o opreste). */
export interface PrioritateCategorie {
  readonly nivel: number
  readonly activa: boolean
}

export interface RandOm {
  readonly slot: number
  readonly id: number
  readonly nume: string
  readonly activitate: string
  readonly foame: Bara
  readonly odihna: Bara
  readonly dispozitie: Bara
  /** Pe `Categorie`: SAPA, CARA, CONSTRUIESTE. */
  readonly prioritati: readonly PrioritateCategorie[]
  readonly wx: number
  readonly wy: number
  readonly z: number
}

/**
 * Ce face pionul, in cuvinte. Cu job: din (jobKind, jobStep), campuri PERSISTED — `ratiune` e
 * TRANSIENT si ramane in urma (panoul, CS-8). Fara job: DE CE sta, din `ratiune`.
 */
export function activitatePion(w: World, rules: Rules, slot: number): string {
  const a = w.agents
  const fel = a.jobKind[slot]!
  if (fel !== FelJob.NICIUNUL) {
    let ce = ''
    const mana = a.caraCantitate[slot]!
    if (fel === FelJob.CARA) {
      const n = mana > 0 ? mana : a.jobCantitate[slot]!
      const is = w.iteme.laId.get(a.jobTarget[slot]!)
      const felItem = mana > 0 ? a.caraKind[slot]! : is !== undefined ? w.iteme.kind[is]! : -1
      ce = n > 0 ? textMarfa(n, felItem) : NUME_ITEM_MIC[felItem] ?? 'marfă'
    }
    if (fel === FelJob.CONSTRUIESTE) {
      const ds = w.desemnari.laId.get(a.jobDest[slot]!)
      if (ds !== undefined) ce = (NUME_PIESA[w.desemnari.piesa[ds]!] ?? '').toLowerCase()
    }
    let t = textActivitate(fel, a.jobStep[slot]!, ce)
    if (fel === FelJob.DOARME && !pasDeMers(a.jobStep[slot]!) && a.jobDest[slot] === 0) t = 'Doarme pe jos'
    if (w.paths.len[slot] === 0 && pasDeMers(a.jobStep[slot]!) && w.paths.nextReplanTick[slot]! > w.tick) t += ' (drum refuzat, reîncearcă)'
    return t
  }
  const r = w.ratiune
  switch (r.stare[slot]) {
    case StareRatiune.NIMIC_DE_FACUT: return 'Stă: nimic de făcut'
    case StareRatiune.IN_ASTEPTARE: return 'Stă: lucrările sunt în așteptare'
    case StareRatiune.PLAFON: return 'Stă: prea multe lucrări de cântărit, reîncearcă'
    case StareRatiune.REFUZA_MUNCA: return 'Refuză munca: e prea nefericit'
    case StareRatiune.RESPINS:
    case StareRatiune.ASTEAPTA_DRUM: {
      const m = motivDinCod(r.motivFinal[slot]!)
      return m === null ? 'Stă' : textRatiunePion(m, cifreDinReguli(rules))
    }
    default: return 'Stă'
  }
}

function prioritati(w: World, rules: Rules, slot: number): PrioritateCategorie[] {
  const act = categoriiActive(w, rules, slot)
  const efectiv = [act.sapa, act.cara, act.construieste]
  const out: PrioritateCategorie[] = []
  for (let c = 0; c < CATEGORII; c++) out.push({ nivel: w.agents.prioPersonala[slot * CATEGORII + c]!, activa: efectiv[c] ?? false })
  return out
}

function randOm(w: World, rules: Rules, i: number): RandOm {
  const a = w.agents
  const fo = rules.nevoi[Nevoie.FOAME]!
  const od = rules.nevoi[Nevoie.ODIHNA]!
  return {
    slot: i,
    id: a.id[i]!,
    nume: numePion(a.id[i]!),
    activitate: activitatePion(w, rules, i),
    foame: bara(a.nevoi[i * NEVOI + Nevoie.FOAME]!, rules.nevoieMax, fo.prag, fo.pragCritic),
    odihna: bara(a.nevoi[i * NEVOI + Nevoie.ODIHNA]!, rules.nevoieMax, od.prag, od.pragCritic),
    dispozitie: bara(a.dispozitie[i]!, rules.dispozitieMax, rules.dispozitiePragRefuz, rules.dispozitiePragPlecare, tintaDispozitiei(w, rules, i)),
    prioritati: a.faction[i] === Faction.ASEZARE ? prioritati(w, rules, i) : [],
    wx: Math.floor(a.x[i]! / 1000),
    wy: Math.floor(a.y[i]! / 1000),
    z: a.z[i]!,
  }
}

export function randuriOameni(w: World, rules: Rules): RandOm[] {
  const out: RandOm[] = []
  for (let i = 0; i < w.agents.count; i++) if (esteColonist(w, i)) out.push(randOm(w, rules, i))
  return out
}

export interface InspectiePion extends RandOm {
  readonly factiune: number
  /** Gandurile active, cu valoarea lor (suma explica tinta dispozitiei). */
  readonly ganduri: readonly { readonly nume: string; readonly valoare: number }[]
  /** Ce are in mana, in cuvinte, sau ''. */
  readonly mana: string
  /** Categoriile oprite care AU de lucru: „N-are voie la Cara: ...". '' = nimic de spus. */
  readonly faraVoie: string
}

/** Selectia tine ID-ul (sloturile se refolosesc la `spawnAgent`); `null` = a plecat. */
export function inspecteazaPion(w: World, rules: Rules, id: number): InspectiePion | null {
  const slot = slotOf(w.agents, id)
  if (slot === -1) return null
  const a = w.agents
  const rand = randOm(w, rules, slot)
  const ganduri: { nume: string; valoare: number }[] = []
  for (let n = 0; n < NEVOI; n++) {
    const v = a.nevoi[slot * NEVOI + n]!
    const spec = rules.nevoi[n]!
    const par = GAND_PENTRU_NEVOIE[n]!
    const g = v < spec.pragCritic ? par.critic : v < spec.prag ? par.prag : Gand.NICIUNUL
    if (g !== Gand.NICIUNUL) ganduri.push({ nume: NUME_GAND[g] ?? '', valoare: rules.ganduri[g]!.valoare })
  }
  const k = a.ganduriSloturi
  for (let j = 0; j < k; j++) {
    const fel = a.gandFel[slot * k + j]!
    if (fel === Gand.NICIUNUL || a.gandPanaLa[slot * k + j]! <= w.tick) continue
    ganduri.push({ nume: NUME_GAND[fel] ?? '', valoare: rules.ganduri[fel]!.valoare })
  }
  const mana = a.caraCantitate[slot]! > 0 ? textMarfa(a.caraCantitate[slot]!, a.caraKind[slot]!) : ''
  let faraVoie = ''
  if (a.faction[slot] === Faction.ASEZARE) {
    const d = w.desemnari
    const sapat = d.vii - d.viiConstruieste > 0
    const construit = d.viiConstruieste > 0
    // Carat e de facut doar cu un DEPOZIT: `zone.vii` numara si locurile de dormit.
    let depozite = 0
    for (let i = 0; i < w.zone.count; i++) if (w.zone.alive[i] === 1 && w.zone.kind[i] === Zona.DEPOZIT) depozite++
    const carat = w.iteme.vii > 0 && depozite > 0
    const oprite: string[] = []
    const p = rand.prioritati
    if (sapat && !p[0]!.activa) oprite.push('Sapă')
    if (carat && !p[1]!.activa) oprite.push('Cară')
    if (construit && !p[2]!.activa) oprite.push('Construiește')
    if (oprite.length > 0) {
      const excl = p.findIndex((x) => x.nivel >= rules.personalPriorityLevels)
      faraVoie = `N-are voie la ${oprite.join(', ')}: ${excl >= 0 ? `e pe Exclusiv la ${['Sapă', 'Cară', 'Construiește'][excl]}` : 'prioritate 0'}.`
    }
  }
  return { ...rand, factiune: a.faction[slot]!, ganduri, mana, faraVoie }
}

// ---------------------------------------------------------------------------------------------
// previzualizarea constructiei (memoria UI-ului)
// ---------------------------------------------------------------------------------------------

export interface Previz {
  readonly cheie: string
  readonly imposibile: ReadonlySet<number>
  readonly faraAcces: ReadonlyMap<number, number>
  readonly construibile: ReadonlySet<number>
  /** Cat a costat calculul, ms (pentru Diagnostic si pentru rarirea recalcularii). */
  readonly ms: number
}

/**
 * Memoria previzualizarii constructiei, a UI-ului (nu a lumii). `ia` o recalculeaza doar cand s-a
 * schimbat terenul sau lista de santiere; `ceas` e injectat (testele numara recalcularile).
 */
export function creeazaPrevizualizare(ceas: () => number = () => 0): { ia(w: World, rules: Rules): Previz; calculari: () => number } {
  let ultima: Previz | null = null
  let n = 0
  return {
    ia(w, rules) {
      const cheie = `${w.terrain.editari}:${w.desemnari.editariConstr}:${w.desemnari.viiConstruieste}`
      if (ultima && ultima.cheie === cheie) return ultima
      const t0 = ceas()
      const p = constructiaPrevizualizata(w, rules)
      const faraAcces = new Map<number, number>()
      p.faraAcces.forEach((k, i) => faraAcces.set(k, p.cauze[i] ?? 0))
      n++
      ultima = { cheie, imposibile: new Set(p.imposibile), faraAcces, construibile: new Set(p.construibile), ms: ceas() - t0 }
      return ultima
    },
    calculari: () => n,
  }
}

/** Peste atat, o previzualizare e SCUMPA: nu se mai reface periodic, ca la stabilitate (S). */
export const PREVIZ_SCUMPA_MS = 8

/**
 * Se reface ACUM previzualizarea din memoria UI-ului (alertele, inspectorul)? Una ieftina, cel mult o
 * data pe secunda; una scumpa doar la o actiune a jucatorului, cand s-a schimbat PLANUL si in pauza.
 * „O data la 10 s" era, cat se zidea un plan mare, un inghet de 43–60 ms la 10 s: fiecare piesa
 * zidita ii schimba cheia (recenzia UI-ului, C2-2).
 */
export function refacePrevizualizarea(o: { readonly proaspat: boolean; readonly areMemorie: boolean; readonly planSchimbat: boolean; readonly pauza: boolean; readonly ultimaMs: number; readonly trecutMs: number }): boolean {
  if (o.proaspat || !o.areMemorie || o.planSchimbat || o.pauza) return true
  return o.ultimaMs <= PREVIZ_SCUMPA_MS && o.trecutMs >= 1_000
}

// ---------------------------------------------------------------------------------------------
// celula
// ---------------------------------------------------------------------------------------------

export type FelStare = 'lucru' | 'imposibila' | 'motiv' | 'faraAcces' | 'asteapta' | 'libera'

export interface StareDesemnare {
  readonly fel: FelStare
  readonly text: TextMotiv
}

export interface InspectieDesemnare {
  readonly id: number
  readonly wx: number
  readonly wy: number
  readonly z: number
  /** `Piesa`: NICIUNA = sapa. */
  readonly piesa: number
  readonly prioritate: number
  readonly stare: StareDesemnare
}

/** Teren natural (se sapa). Zidul construit NU: vecinii deja ziditi ai unei piese de etaj nu sunt o groapa. */
const esteNatural = (m: number): boolean => m === Material.ROCA || m === Material.PAMANT || m === Material.IARBA || m === Material.MOLOZ

const VECINI8: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]

/**
 * FARA_LOC_DE_LUCRU pe o piesa de CONSTRUIT. Textul de sapat („Sapă de sus în jos") e al sapaturii;
 * pe o piesa de etaj el trimitea jucatorul sa sape solul de langa un stalp — masurat: 4 sapaturi,
 * zero progres, iar o singura treapta rezolva (recenzia UI-ului, MOD-2). Raspunsul depinde de loc:
 * cu teren NATURAL langa piesa, la nivelul ei, piesa e intr-o groapa si se sapa langa ea (verificat:
 * un perete intr-o groapa 1×1 se zideste dupa o sapatura); altfel n-are pe ce sta nimeni si trebuie
 * o treapta. Cauza INALTIME a previzualizarii nu le desparte: apare in ambele.
 */
function textFaraLocDeZidit(w: World, wx: number, wy: number, z: number, cifre: Cifre): TextMotiv {
  let groapa = false
  for (const [dx, dy] of VECINI8) {
    const m = materialAt(w.terrain, wx + dx, wy + dy, z)
    if (m.ok && esteNatural(m.value)) { groapa = true; break }
  }
  return {
    titlu: `Niciun loc de stat lângă ea: omul zidește stând pe o celulă vecină, cu podea și ${cifre.agentHeadroomM} m liberi deasupra, cel mult ${cifre.maxStepM} m mai sus sau ${cifre.atingereSusM} m mai jos decât piesa.`,
    actiune: groapa ? 'Sapă lângă ea, de sus în jos.' : `Pune o treaptă sau o scară lângă ea, cel mult ${cifre.atingereSusM} m sub ea.`,
  }
}

/**
 * Starea unei desemnari, in ordinea precedentei (panoul, CS-2 / CS-3): o piesa care n-ar sta
 * in picioare nici dupa restul planului bate orice motiv memorat; o desemnare REZERVATA nu arata
 * un motiv vechi; un motiv memorat e „ultimul refuz", nu „a esuat acum" — un job intrerupt nu
 * scrie motiv, deci motivul poate fi mai vechi decat ultima pornire.
 */
export function stareDesemnare(w: World, rules: Rules, ds: number, previz: Previz | null): StareDesemnare {
  const d = w.desemnari
  const cifre = cifreDinReguli(rules)
  const construieste = d.kind[ds] === Desemnare.CONSTRUIESTE
  const k = cellKey(d.wx[ds]!, d.wy[ds]!, d.z[ds]!)
  if (construieste && previz?.imposibile.has(k)) {
    return { fel: 'imposibila', text: { titlu: `N-ar sta în picioare nici după ce se zidește restul planului: nimic așezat la mai puțin de ${cifre.suportMax} pași.`, actiune: 'Zidește mai aproape de ceva, pune o grindă prinsă de ceva așezat, sau anulează piesa.' } }
  }
  const rez = rezervariPentru(w.rezervari, d.id[ds]!, Strat.LUCRU)
  if (rez.length > 0) return { fel: 'lucru', text: { titlu: `În lucru — ${rez.map((r) => numePion(r.claimant)).join(', ')}.`, actiune: '' } }
  const cod = motivDinCod(d.ultimulMotiv[ds]!)
  if (cod !== null) {
    const piesa = d.piesa[ds]!
    const felMaterial = construieste && piesa !== Piesa.NICIUNA ? rules.digYield[rules.piese[piesa]!.material]?.fel ?? 0 : 0
    const t = construieste && cod === Reason.INACCESIBIL && d.ultimulMotivDetaliu[ds] === DetaliuMotiv.FARA_LOC_DE_LUCRU
      ? textFaraLocDeZidit(w, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, cifre)
      : textMotiv('desemnare', cod, d.ultimulMotivDetaliu[ds]!, undefined, cifre, felMaterial)
    const s = Math.ceil((d.reincercaLaTick[ds]! - w.tick) / rules.ticksPerSecond)
    return { fel: 'motiv', text: { titlu: s > 0 ? `${t.titlu} Reîncearcă în ${s} s.` : `Ultimul refuz memorat: ${t.titlu.replace(/^./, (c) => c.toLowerCase())} Se reverifică la următoarea scanare.`, actiune: t.actiune } }
  }
  if (construieste && previz) {
    const cauza = previz.faraAcces.get(k)
    if (cauza !== undefined) {
      return { fel: 'faraAcces', text: cauza === CauzaAcces.INCINTA
        ? { titlu: 'Nu ajunge nimeni la ea: locurile de lucru sunt într-o incintă fără ieșire.', actiune: 'Lasă o deschidere în perete (o coloană liberă de 2 niveluri).' }
        : { titlu: 'Nu ajunge nimeni la ea: nimic pe care să stea un om la înălțimea ei.', actiune: textFaraLocDeZidit(w, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, cifre).actiune } }
    }
    if (previz.construibile.has(k) && !sustinutAcum(w.terrain, rules, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, null)) {
      return { fel: 'asteapta', text: { titlu: 'Așteaptă piesa de dedesubt sau de alături: acum n-ar sta.', actiune: '' } }
    }
  }
  return { fel: 'libera', text: { titlu: 'Liberă: vine primul om care are voie la munca asta.', actiune: '' } }
}

export interface InspectieMorman {
  readonly id: number
  readonly fel: number
  readonly cantitate: number
  readonly rezervat: number
  readonly stare: TextMotiv
}

export interface InspectieCelula {
  readonly wx: number
  readonly wy: number
  /** Celula atinsa (solida, de regula); mormanul si zona se citesc de pe z+1, unde se sta. */
  readonly z: number
  readonly material: number | null
  readonly materialDeasupra: number | null
  readonly desemnari: readonly InspectieDesemnare[]
  readonly morman: InspectieMorman | null
  readonly zona: { readonly id: number; readonly fel: number; readonly prioritate: number } | null
}

/**
 * Starea unui morman. Ordinea: rezervat (de cine: un constructor il ia pentru zidit, nu spre depozit —
 * stratul CARAT e comun, MOD-9) > intr-un DEPOZIT (un loc de dormit nu e depozit, MOD-5) > un motiv cu
 * racire > fara depozit, din `vedereFaraDepozit` (MOD-1: inainte, „Pe jos: așteaptă un cărăuș" si la
 * mormanele pe care nu le va cara nimeni) > abia apoi „așteaptă un cărăuș".
 */
function stareMorman(w: World, rules: Rules, is: number, vedere: VedereFaraDepozit): TextMotiv {
  const it = w.iteme
  const cifre = cifreDinReguli(rules)
  const rez = rezervariPentru(w.rezervari, it.id[is]!, Strat.CARAT)
  if (rez.length > 0) {
    const constructor = rez.find((r) => { const s = slotOf(w.agents, r.claimant); return s !== -1 && w.agents.jobKind[s] === FelJob.CONSTRUIESTE })
    return { titlu: constructor ? `Luat pentru construit — ${numePion(constructor.claimant)}.` : 'În drum spre depozit.', actiune: '' }
  }
  if (prioritateaLocului(w.zone, it.wx[is]!, it.wy[is]!, it.z[is]!) > 0) return { titlu: 'În depozit.', actiune: '' }
  const cod = motivDinCod(it.ultimulMotiv[is]!)
  const s = Math.ceil((it.reincercaLaTick[is]! - w.tick) / rules.ticksPerSecond)
  if (cod !== null && s > 0) {
    const t = textMotiv('morman', cod, it.ultimulMotivDetaliu[is]!, undefined, cifre, it.kind[is]!)
    return { titlu: `${t.titlu} Reîncearcă în ${s} s.`, actiune: t.actiune }
  }
  if (vedere.esteFaraDepozit(is)) {
    return textMotiv('morman', Reason.FARA_DEPOZIT, vedere.depozite === 0 ? DetaliuItem.NICIO_ZONA : DetaliuItem.DEPOZITE_PLINE, undefined, cifre, it.kind[is]!)
  }
  return { titlu: 'Pe jos: așteaptă un cărăuș.', actiune: '' }
}

/**
 * Ce e in coloana (wx, wy) la z (celula atinsa) si z+1 (unde s-ar sta): desemnarile din ambele,
 * mormanul si zona de pe z+1.
 */
export function inspecteazaCelula(w: World, rules: Rules, wx: number, wy: number, z: number, previz: Previz | null): InspectieCelula {
  const mat = materialAt(w.terrain, wx, wy, z)
  const sus = materialAt(w.terrain, wx, wy, z + 1)
  const d = w.desemnari
  const desemnari: InspectieDesemnare[] = []
  // Celula atinsa intai; cea de deasupra (unde s-ar sta) doar cand pe cea atinsa nu e nimic. Cu
  // amandoua, un zid inalt arata doua „Lucrare" identice (recenzia UI-ului, ECR-11).
  for (const zz of [z, z + 1]) {
    const ds = desemnareLaCelula(d, wx, wy, zz)
    if (ds === -1) continue
    desemnari.push({ id: d.id[ds]!, wx, wy, z: zz, piesa: d.piesa[ds]!, prioritate: d.prioritate[ds]!, stare: stareDesemnare(w, rules, ds, previz) })
    break
  }
  let morman: InspectieMorman | null = null
  const is = itemLaCelula(w.iteme, wx, wy, z + 1)
  if (is !== -1) {
    const it = w.iteme
    let rezervat = 0
    for (const r of rezervariPentru(w.rezervari, it.id[is]!, Strat.CARAT)) rezervat += r.count
    for (const r of rezervariPentru(w.rezervari, it.id[is]!, Strat.MANCAT)) rezervat += r.count
    morman = { id: it.id[is]!, fel: it.kind[is]!, cantitate: it.cantitate[is]!, rezervat, stare: stareMorman(w, rules, is, vedereFaraDepozit(w)) }
  }
  let zona: InspectieCelula['zona'] = null
  const cs = celulaDeZonaLa(w.zone, wx, wy, z + 1)
  if (cs !== -1) {
    const zid = w.zone.celule.zonaId[cs]!
    const zs = slotZona(w.zone, zid)
    if (zs !== -1) zona = { id: zid, fel: w.zone.kind[zs]!, prioritate: w.zone.prioritate[zs]! }
  }
  return { wx, wy, z, material: mat.ok ? mat.value : null, materialDeasupra: sus.ok ? sus.value : null, desemnari, morman, zona }
}

// ---------------------------------------------------------------------------------------------
// semnalele alertelor
// ---------------------------------------------------------------------------------------------

const inactiv: Semnal = { activ: false, text: '', tinta: null }
const pion = (slot: number): Tinta => ({ fel: 'pion', slot })

/** Cat de aproape (Chebyshev) trebuie sa fie o lucrare in curs ca una blocata sa nu conteze. */
const RAZA_BLOCATE = 8

/**
 * Ce spune lumea ACUM despre fiecare regula din `REGULI_ALERTE`. Pragurile de CANTITATE sunt aici,
 * cele de TIMP in tabel. Cu asezarea golita, toate tac (`golita` are cardul ei).
 */
export function semnaleAlerte(w: World, rules: Rules, previz: Previz | null): Map<string, Semnal> {
  const m = new Map<string, Semnal>()
  const r = rezumatColonie(w, rules)
  if (r.colonisti === 0) return m
  const a = w.agents
  const fo = rules.nevoi[Nevoie.FOAME]!
  const hrana = r.hrana

  m.set('fara-hrana', hrana.puncte <= 0
    ? { activ: true, text: 'Nu mai e hrană. În versiunea asta hrana nu se poate produce; oamenii flămânzi vor pleca.', tinta: null }
    : inactiv)
  m.set('hrana-scade', hrana.puncte > 0 && hrana.minute < 10
    ? { activ: true, text: `Hrana ajunge ${textMinute(hrana.minute)} și nu se poate produce încă. După aceea oamenii pleacă.`, tinta: null }
    : inactiv)

  // Flamanzii care AU CAUTAT si n-au gasit (`nevoieReincercaLaTick`): cine mananca sau merge la
  // masa nu conteaza. Pe o colonie sanatoasa, „sub prag" singur se aprindea de 20 de ori in 30 de
  // minute (panoul, JN-5).
  let flamanzi = 0, primulFlamand = -1, infometati = 0, primulInfometat = -1, peJos = 0, primulPeJos = -1, pleaca = 0, primulPleaca = -1
  const pe = { sapa: false, cara: false, construieste: false }
  for (let i = 0; i < a.count; i++) {
    if (!esteColonist(w, i)) continue
    const v = a.nevoi[i * NEVOI + Nevoie.FOAME]!
    const mananca = a.jobKind[i] === FelJob.MANANCA
    if (!mananca && v < fo.pragCritic) { infometati++; if (primulInfometat < 0) primulInfometat = i }
    else if (!mananca && v < fo.prag && a.nevoieReincercaLaTick[i * NEVOI + Nevoie.FOAME]! > w.tick) { flamanzi++; if (primulFlamand < 0) primulFlamand = i }
    // Doarme pe jos ACUM (nu gandul DORMIT_PE_JOS, care tine 5 minute: alerta cerea „Pictează un loc
    // de dormit" si dupa ce se pictase, si cand paturile erau libere — recenzia UI-ului, MOD-4).
    if (a.jobKind[i] === FelJob.DOARME && !pasDeMers(a.jobStep[i]!) && a.jobDest[i] === 0) { peJos++; if (primulPeJos < 0) primulPeJos = i }
    if (tintaDispozitiei(w, rules, i) < rules.dispozitiePragAvertisment) { pleaca++; if (primulPleaca < 0) primulPleaca = i }
    const act = categoriiActive(w, rules, i)
    pe.sapa ||= act.sapa
    pe.cara ||= act.cara
    pe.construieste ||= act.construieste
  }
  m.set('infometati', infometati > 0 ? { activ: true, text: infometati === 1 ? 'Un om e înfometat și n-are ce mânca.' : `${cant(infometati, 'oameni')} înfometați.`, tinta: pion(primulInfometat) } : inactiv)
  // Fara nicio hrana, „fara-hrana" spune tot; „flamanzi" e pentru mancarea la care nu se AJUNGE.
  m.set('flamanzi', flamanzi > 0 && hrana.puncte > 0 ? { activ: true, text: `${flamanzi === 1 ? 'Un om flămând n-a găsit' : `${cant(flamanzi, 'oameni')} flămânzi n-au găsit`} mâncare la îndemână.`, tinta: pion(primulFlamand) } : inactiv)
  m.set('pleaca', pleaca > 0 ? { activ: true, text: pleaca === 1 ? 'Un om e pe cale să plece: e prea nefericit.' : `${cant(pleaca, 'oameni')} sunt pe cale să plece: sunt prea nefericiți.`, tinta: pion(primulPleaca) } : inactiv)
  if (peJos > 0) {
    // Cauza, dupa paturi: niciunul, prea putine, sau destule dar departe (masurat: pionii fara treaba
    // hoinaresc si la 89–126 de celule de paturi, peste raza in care cauta un pat).
    let paturi = 0
    const c = w.zone.celule
    for (let cs = 0; cs < c.count; cs++) {
      if (c.alive[cs] === 0) continue
      const zs = slotZona(w.zone, c.zonaId[cs]!)
      if (zs !== -1 && w.zone.kind[zs] === Zona.DORMIT) paturi++
    }
    const cine = peJos === 1 ? 'Un om doarme' : `${cant(peJos, 'oameni')} dorm`
    const cifre = cifreDinReguli(rules)
    const text = paturi === 0
      ? `${cine} pe jos: niciun loc de dormit. Pictează unul (Zone ▸ Loc de dormit).`
      : paturi < r.colonisti
        ? `${cine} pe jos: ${cant(paturi, 'paturi', 'un pat')} pentru ${cant(r.colonisti, 'oameni')}. Mărește locul de dormit.`
        : `${cine} pe jos, departe de paturi: le caută doar pe ${cant(cifre.razaNevoi, 'celule')} în jur. Pictează un loc de dormit lângă locul de muncă.`
    m.set('dorm-pe-jos', { activ: true, text, tinta: pion(primulPeJos) })
  } else m.set('dorm-pe-jos', inactiv)

  const d = w.desemnari
  const deSapat = d.vii - d.viiConstruieste
  m.set('nimeni-sapa', deSapat > 0 && !pe.sapa ? { activ: true, text: 'Nimeni n-are voie să sape (prioritate 0 sau Exclusiv pe altceva).', tinta: null } : inactiv)
  m.set('nimeni-construieste', d.viiConstruieste > 0 && !pe.construieste ? { activ: true, text: 'Nimeni n-are voie să construiască (prioritate 0 sau Exclusiv pe altceva).', tinta: null } : inactiv)
  // Pe jos = in afara unui DEPOZIT (un loc de dormit nu e depozit: MOD-5).
  const vedere = vedereFaraDepozit(w)
  const it = w.iteme
  let peJosIteme = 0
  for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && prioritateaLocului(w.zone, it.wx[i]!, it.wy[i]!, it.z[i]!) === 0) peJosIteme++
  m.set('nimeni-cara', peJosIteme > 0 && vedere.depozite > 0 && !pe.cara ? { activ: true, text: 'Nimeni n-are voie să care (prioritate 0 sau Exclusiv pe altceva).', tinta: null } : inactiv)

  // Blocate: nerezervate, cu motiv de blocaj, fara nicio lucrare IN CURS la cel mult 8 celule.
  //  - LIPSA_MATERIAL se scrie FARA racire (materialul poate aparea oricand) si se sterge la rescanare
  //    cand apare: cat e scris, e adevarat. Cerut cu racire, planul fara piatra nu aprindea niciodata
  //    alerta (recenzia UI-ului, MOD-3).
  //  - Celelalte au racirea lor, iar dupa ce expira raman valabile pana la urmatoarea scanare: inca
  //    doua ferestre de rescanare. Fara ele, o singura lucrare de neatins (racire 100 de tickuri <
  //    intarzierea de 15 s) stingea semnalul intre doua scanari si alerta nu aparea niciodata.
  const inLucru: number[] = []
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] === 1 && rezervariPentru(w.rezervari, d.id[i]!, Strat.LUCRU).length > 0) inLucru.push(i)
  }
  const blocaj = new Map<string, number>()
  let blocate = 0, primaBlocata = -1, imposibile = 0, primaImposibila = -1
  for (let i = 0; i < d.count; i++) {
    if (d.alive[i] !== 1) continue
    if (d.kind[i] === Desemnare.CONSTRUIESTE && previz?.imposibile.has(cellKey(d.wx[i]!, d.wy[i]!, d.z[i]!))) {
      imposibile++
      if (primaImposibila < 0) primaImposibila = i
      continue
    }
    const cod = motivDinCod(d.ultimulMotiv[i]!)
    if (cod === null) continue
    if (cod !== Reason.LIPSA_MATERIAL && d.reincercaLaTick[i]! + 2 * rules.jobRescanTicks <= w.tick) continue
    if (rezervariPentru(w.rezervari, d.id[i]!, Strat.LUCRU).length > 0) continue
    if (inLucru.some((j) => Math.max(Math.abs(d.wx[j]! - d.wx[i]!), Math.abs(d.wy[j]! - d.wy[i]!)) <= RAZA_BLOCATE)) continue
    blocate++
    if (primaBlocata < 0) primaBlocata = i
    const t = stareDesemnare(w, rules, i, previz).text.titlu.replace(/ (Reîncearcă|Se reverifică).*$/, '').replace(/^Ultimul refuz memorat: (.)/, (_, c: string) => c.toUpperCase())
    blocaj.set(t, (blocaj.get(t) ?? 0) + 1)
  }
  const celula = (i: number): Tinta => ({ fel: 'celula', wx: d.wx[i]!, wy: d.wy[i]!, z: d.z[i]! })
  let frecvent = ''
  let maxim = 0
  for (const [t, n] of [...blocaj].sort((x, y) => (x[0] < y[0] ? -1 : 1))) if (n > maxim) { maxim = n; frecvent = t }
  m.set('blocate', blocate > 0 ? { activ: true, text: `${blocate === 1 ? 'O lucrare stă' : `${cant(blocate, 'lucrări')} stau`}, fără nicio lucrare în curs lângă: ${frecvent}`, tinta: celula(primaBlocata) } : inactiv)
  m.set('imposibile', imposibile > 0 ? { activ: true, text: `${imposibile === 1 ? 'O piesă n-ar sta' : `${cant(imposibile, 'piese')} n-ar sta`} în picioare nici după restul planului.`, tinta: celula(primaImposibila) } : inactiv)

  // Mormane fara depozit: din `vedereFaraDepozit`, aceeasi functie ca inspectorul si Planul (MOD-1:
  // cerea o racire pe care sim-ul nu o scrie, deci alerta nu aparea niciodata).
  let faraDepozit = 0, primulMorman = -1
  for (let i = 0; i < it.count; i++) {
    if (!vedere.esteFaraDepozit(i)) continue
    faraDepozit++
    if (primulMorman < 0) primulMorman = i
  }
  m.set('fara-depozit', faraDepozit > 0
    ? { activ: true, text: vedere.depozite === 0 ? `${faraDepozit === 1 ? 'Un morman n-are unde fi dus' : `${cant(faraDepozit, 'mormane')} n-au unde fi duse`}: niciun depozit. Pictează unul (Zone ▸ Depozit).` : `${faraDepozit === 1 ? 'Un morman nu încape' : `${cant(faraDepozit, 'mormane')} nu încap`} în depozite. Mărește-le.`, tinta: { fel: 'celula', wx: it.wx[primulMorman]!, wy: it.wy[primulMorman]!, z: it.z[primulMorman]! - 1 } }
    : inactiv)
  return m
}

/** `slotOf` reexportat pentru panouri (selectia tine id-ul). */
export { slotOf }
