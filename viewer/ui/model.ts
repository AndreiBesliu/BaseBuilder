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
import { CATEGORII, Faction, FelJob, Gand, GAND_PENTRU_NEVOIE, Item, ITEME, NEVOI, Nevoie, pasDeMers, Piesa, slotOf } from '../../src/sim/state.ts'
import type { World } from '../../src/sim/state.ts'
import type { Command } from '../../src/sim/commands.ts'
import { Desemnare, desemnareLaCelula, DetaliuMotiv } from '../../src/sim/desemnari.ts'
import { DetaliuItem, itemLaCelula } from '../../src/sim/iteme.ts'
import { celulaDeZonaLa, prioritateaLocului, primesteFel, rangZona, slotZona, subSantier, vedereFaraDepozit, Zona } from '../../src/sim/zone.ts'
import type { VedereFaraDepozit } from '../../src/sim/zone.ts'
import { rezervariPentru, Strat } from '../../src/sim/rezervari.ts'
import { categoriiActive, celulaDeZonaPosibila, constructiaPrevizualizata, StareRatiune, tintaDispozitiei } from '../../src/sim/joburi.ts'
import { groapaDeMoloz } from '../../src/sim/camara.ts'
import type { GroapaDeMoloz } from '../../src/sim/camara.ts'
import { mormanulDeHrana, pragAlterare, prognozaFaraAlterare, proiecteaza, rataZilnica, stareaHranei } from '../../src/sim/prognoza.ts'
import type { MormanHrana, Prognoza, StareHrana } from '../../src/sim/prognoza.ts'
import { tickuriPeAn } from '../../src/sim/calendar.ts'
import { CHUNK_CELLS, isSolid } from '../../src/sim/terrain/chunk.ts'
import { chunkKey, groundLevelM, voxelRangeM } from '../../src/sim/terrain/terrain.ts'
import { LOC_CER } from '../../src/sim/temperatura.ts'
import { CauzaAcces } from '../../src/sim/acces.ts'
import { sustinutAcum } from '../../src/sim/stabilitate.ts'
import { motivDinCod, Reason } from '../../src/sim/result.ts'
import { cellKey } from '../../src/sim/path.ts'
import { find, NO_REGION, regionAt } from '../../src/sim/regions.ts'
import { materialAt } from '../../src/sim/terrain/terrain.ts'
import { Material } from '../../src/sim/terrain/chunk.ts'
import { cititorCamere, componentaLa, esteAer, esteAerAcoperit } from '../../src/sim/camere.ts'
import type { Componenta } from '../../src/sim/camere.ts'
import { geometriaCanalelor } from '../../src/sim/termic.ts'
import type { GeometrieCanale } from '../../src/sim/termic.ts'
import { canaleAcum, oameniPeComponente, temperaturaAcum, tragerea, tragereCuOameni } from '../../src/sim/temperatura.ts'
import type { StatTermic } from '../../src/sim/temperatura.ts'
import { tAfara } from '../../src/sim/clima.ts'
import type { Outcome } from '../../src/sim/result.ts'
import { explicaCelula } from '../../src/sim/camere-explica.ts'
import type { Celula, Explicatie } from '../../src/sim/camere-explica.ts'
import { numePion } from './nume.ts'
import { cant, NUME_GAND, NUME_ITEM, NUME_ITEM_MIC, NUME_PIESA, TEXT_ALTERARE_NECUNOSCUTA, TEXT_TEMPERATURA_NECUNOSCUTA, TEXT_TRAGERE_NECUNOSCUTA, textActivitate, textAlertaAlterare, textAlterare, textCanale, textHranaScade, textJocNouHrana, textMolozInCamara, textMotiv, textOameni, textPasCamara, textRatiunePion, textStricaCamaraAreLoc, textTemperaturaAcum, textTooltipHrana, textTragere, textZile } from './texte.ts'
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
    razaDepozit: rules.haulDestRadiusCells,
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
  /**
   * VALOAREA hranei, in puncte de nutritie EFECTIVA (mormane + mainile oamenilor; `nutritieEfectiva`): „cat ne mai
   * hraneste". Cifra din bara ramane in UNITATI (ce se vede in mormane, ca inspectorul si capacitatea camarii); prognoza si
   * aceasta valoare sunt pe valoare — o hrana faramitata pastreaza unitatile vizibile, dar pierde valoare (masurat la B).
   */
  readonly puncte: number
  /** Puncte mancate pe zi de calendar de toata asezarea. 0 = nimeni. */
  readonly consumPeZi: number
  /** Zile de calendar pana se termina hrana (`proiecteaza`, src/sim/prognoza.ts), Infinity cand nu mananca nimeni. */
  readonly zile: number
  /** Peste plafon (un an): „peste un an". */
  readonly plafonat: boolean
  /** Aceeasi hrana fara alterare (tot stocul la rata 0) — „cat ar tine intr-o camara", tot prin `proiecteaza`. */
  readonly zileFaraAlterare: number
  readonly plafonatFaraAlterare: boolean
}

export interface RezumatColonie {
  /** Pe fel (`Item`). */
  readonly marfa: readonly Marfa[]
  readonly hrana: PrognozaHrana
  /** Starea hranei din care vine `hrana` (alerta alterarii, F3, tooltip-ul barei citesc din ea). */
  readonly hranaEcran: HranaEcran
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

// ---------------------------------------------------------------------------------------------
// hrana: prognoza, clasele alterarii, alerta (S24-27 t.3 §8)
// ---------------------------------------------------------------------------------------------

/**
 * Sub atata pierdere pe zi, hrana de peste prag „se pastreaza APROAPE" (UI-2, decizia 9): 0,1% pe zi — la 5,76 °C pe curba
 * implicita. Prag de PREZENTARE: clasa se calculeaza din rata simularii (`rataZilnica`), nu dintr-un °C scris aici.
 */
export const PRAG_APROAPE_ZI = 0.001
/** Alerta „Hrana se strică" se aprinde la o pierdere medie de peste 1% din stoc pe zi (decizia 10, UI-2). */
export const PRAG_ALERTA_ZI = 0.01
/**
 * Pragurile prognozei, in zile de calendar (UI-14), traduse din minutele reale de dinainte: atentie 30 min la 1× = 0,893
 * zile, critic si „hrana-scade" 10 min = 0,298 zile. Verif-UI-9: se aprind la ±2 h de adevar in toate cele 10 scene.
 */
export const PRAG_ATENTIE_ZILE = 0.893
export const PRAG_CRITIC_ZILE = 0.298

/** Cele trei clase ale alterarii (UI-2, UI-6), dupa rata EFECTIVA: indexul etichetei din `ETICHETA_ALTERARE` (texte.ts). */
export const Clasa = {
  /** La prag sau sub el (in incapere); sub cer: nimic in urmatoarele 24 h. */
  PASTREAZA: 0,
  /** Peste prag, dar sub `PRAG_APROAPE_ZI`: „se strica foarte incet". */
  APROAPE: 1,
  /** Cel putin `PRAG_APROAPE_ZI`. */
  STRICA: 2,
} as const
export type ClasaId = (typeof Clasa)[keyof typeof Clasa]

/** Clasa unui loc cu T-ul `tQ16` (o incapere, harta U): ≤ prag; peste, dupa rata CUANTIZATA a simularii. */
export function clasaLaT(rules: Rules, tQ16: number): ClasaId {
  if (tQ16 <= pragAlterare(rules)) return Clasa.PASTREAZA
  return rataZilnica(rules, tQ16) < PRAG_APROAPE_ZI ? Clasa.APROAPE : Clasa.STRICA
}

/**
 * Clasa unui morman de hrana: in incaperi si in toc, a T-ului locului (`clasaLaT`); sub cer, a pierderii URMATOARELOR 24 h
 * (UI-5: noaptea, „se pastreaza" cu T-ul de acum, iar ziua care vine pierdea 0,37–7,95 u). null = neperisabil sau loc fara T.
 */
export function clasaMormanului(rules: Rules, m: MormanHrana): ClasaId | null {
  if (rules.perisabil[m.kind] !== true) return null
  if (m.loc === LOC_CER) return m.rataZi === 0 ? Clasa.PASTREAZA : m.rataZi < PRAG_APROAPE_ZI ? Clasa.APROAPE : Clasa.STRICA
  if (m.tQ16 === null) return null
  return clasaLaT(rules, m.tQ16)
}

/** Tot ce arata ecranul despre hrana, dintr-o singura trecere (`stareaHranei`): prognoza, alerta, F3, tooltip-ul. */
export interface HranaEcran {
  readonly stare: StareHrana
  readonly prognoza: PrognozaHrana
  /** Mormanele care pierd cel putin 0,1% pe zi (clasa STRICA): N din alerta si „în pericol" din F3. */
  readonly pericol: number
  /** Pierderea medie a stocului, fractie pe zi (pierderea asteptata / valoare); 0 fara hrana. */
  readonly pierdereMedie: number
  /** Slotul mormanului care pierde cel mai mult (ținta alertei), sau -1. */
  readonly tinta: number
}

/**
 * Hrana, pe VALOARE (puncte de nutritie efectiva) si in ZILE DE CALENDAR, cu alterarea: `stareaHranei` + `proiecteaza`
 * (src/sim/prognoza.ts) — aceeasi functie pentru bara, „Primii pasi", alerta „hrana-scade" si dialogul „Joc nou" (UI-9).
 * Consumul: fiecare colonist pierde `nevoi.FOAME.scurgere` la fiecare `nevoiTicks`; un punct de nutritie reda un punct.
 */
export function hranaEcran(w: World, rules: Rules): HranaEcran {
  const s = stareaHranei(w, rules)
  const p = proiecteaza(s, rules)
  const f = prognozaFaraAlterare(s, rules)
  let pericol = 0
  let tinta = -1
  let max = 0
  for (const m of s.mormane) {
    if (clasaMormanului(rules, m) !== Clasa.STRICA) continue
    pericol++
    const pierdere = m.cantitate * (rules.nutritie[m.kind] ?? 0) * m.rataZi
    if (pierdere > max) { max = pierdere; tinta = m.slot }
  }
  return {
    stare: s,
    prognoza: { puncte: s.valoare, consumPeZi: s.consumPeTick * rules.calendar.ziTicks, zile: p.zile, plafonat: p.plafonat, zileFaraAlterare: f.zile, plafonatFaraAlterare: f.plafonat },
    pericol,
    pierdereMedie: s.valoare > 0 ? s.pierderePeZi / s.valoare : 0,
    tinta,
  }
}

/** Prognoza hranei (vezi `hranaEcran`). */
export function prognozaHrana(w: World, rules: Rules, h: HranaEcran = hranaEcran(w, rules)): PrognozaHrana {
  return h.prognoza
}

/** Textul prognozei din bara de sus: '' cand nu mananca nimeni sau nu mai e hrana (alerta critica spune tot). */
export function textPrognozaBara(p: PrognozaHrana): string {
  return Number.isFinite(p.zile) && p.puncte > 0 ? textZile(p.zile, p.plafonat) : ''
}

/** Randul de sub pasii din „Primii pasi": doar cand nu mai e hrana (prognoza sta in pasul camarii, `textPasulCamarii`). */
export function textPasiHrana(p: PrognozaHrana): string {
  return p.puncte <= 0 ? 'Nu mai ai hrană: în versiunea asta nu se poate produce.' : ''
}

/**
 * Pasul camarii din „Primii pasi" (UI-9: al patrulea cititor al prognozei), pentru `oameni` oameni: ~3 celule pe om
 * (`hranaPeOm / itemStackMax`), si cat tine hrana fara alterare fata de acum — aceeasi `PrognozaHrana` ca bara.
 */
export function textPasulCamarii(rules: Rules, oameni: number, hranaPeOm: number, p: PrognozaHrana): string {
  const n = Math.max(1, oameni)
  const are = p.puncte > 0 && Number.isFinite(p.zile)
  return textPasCamara(pragAlterare(rules), Math.ceil((n * hranaPeOm) / rules.itemStackMax), are ? textZile(p.zile, p.plafonat) : '', are ? textZile(p.zileFaraAlterare, p.plafonatFaraAlterare) : '')
}

/** Coada tooltip-ului randului Hrană (unitatile din bara + valoarea prognozei; un fapt, o functie: `hranaEcran`). */
export function tooltipHrana(rules: Rules, h: HranaEcran): string {
  const nut = rules.nutritie[Item.HRANA] ?? 0
  return nut > 0 && h.stare.valoare > 0 ? textTooltipHrana(Math.round(h.stare.valoare / nut), h.pierdereMedie, textPrognozaBara(h.prognoza)) : ''
}

/**
 * Prognoza dialogului „Joc nou" (UI-9): lumea nu exista inca, deci bazinele se scriu din formular — toata hrana sub cer, la
 * tickul 0 (startul jocului nou: toamna, ziua 1, 08:00), si aceeasi hrana intr-o camara (rata 0). Aceeasi `proiecteaza`.
 */
export function prognozaJocNou(rules: Rules, seed: number, oameni: number, hrana: number): { readonly subCer: Prognoza; readonly inCamara: Prognoza; readonly text: string } {
  const nut = rules.nutritie[Item.HRANA] ?? 0
  const v = hrana * nut
  const consumPeTick = (oameni * rules.nevoi[Nevoie.FOAME]!.scurgere) / rules.nevoiTicks
  const subCer = proiecteaza({ seed, tick: 0, subCer: { valoare: v, baza: rules.perisabil[Item.HRANA] === true ? v : 0 }, incaperi: { valoare: 0, pierderePeTick: 0 }, consumPeTick }, rules)
  const inCamara = proiecteaza({ seed, tick: 0, subCer: { valoare: 0, baza: 0 }, incaperi: { valoare: v, pierderePeTick: 0 }, consumPeTick }, rules)
  return { subCer, inCamara, text: textJocNouHrana(textZile(subCer.zile, subCer.plafonat), textZile(inCamara.zile, inCamara.plafonat)) }
}

/** Clasa barei: 'critic' sub `PRAG_CRITIC_ZILE`, 'atentie' sub `PRAG_ATENTIE_ZILE`, altfel ''. */
export function clasaPrognozei(p: PrognozaHrana): 'critic' | 'atentie' | '' {
  if (!Number.isFinite(p.zile) || p.plafonat || p.puncte <= 0) return ''
  return p.zile < PRAG_CRITIC_ZILE ? 'critic' : p.zile < PRAG_ATENTIE_ZILE ? 'atentie' : ''
}

/**
 * Memoria hranei a ecranului (nu a lumii): bara (4 Hz), „Primii pasi" (4 Hz) si alertele (2 Hz) citesc ACEEASI trecere — O(mormane)
 * —, refacuta cel mult o data pe SECUNDA DE JOC (pasul alterarii e de 1 Hz; ce se mananca intre doi pasi muta prognoza cu
 * minute de joc, nu cu zile) si la o schimbare in pauza (mormane si oameni prin comenzi): cheia e (lumea, ⌊tick / tps⌋,
 * iteme.count, iteme.vii, agents.count). La 1× asta e o trecere pe secunda reala, nu una pe citire. Nu scrie nimic in World.
 */
export function creeazaMemorieHrana(): { ia(w: World, rules: Rules): HranaEcran; calcule(): number } {
  let cheie = ''
  let lume: World | null = null
  let ultima: HranaEcran | null = null
  let n = 0
  return {
    ia(w, rules) {
      const k = `${Math.floor(w.tick / rules.ticksPerSecond)}|${w.iteme.count}|${w.iteme.vii}|${w.agents.count}`
      if (ultima !== null && lume === w && cheie === k) return ultima
      lume = w
      cheie = k
      ultima = hranaEcran(w, rules)
      n++
      return ultima
    },
    calcule: () => n,
  }
}

/** Textul alterarii unui morman perisabil, pentru inspector (scris PE LOC, in afara cheii: UI-10). */
export interface AlterareMorman {
  readonly clasa: ClasaId | null
  readonly eticheta: string
  readonly valoare: string
}

/** Randul de alterare al mormanului din slotul `slot`, din aceeasi functie ca prognoza (`mormanulDeHrana`); null = nu se strica. */
export function alterareaMormanului(w: World, rules: Rules, slot: number): AlterareMorman | null {
  const m = mormanulDeHrana(w, rules, slot)
  if (m === null || rules.perisabil[m.kind] !== true) return null
  const clasa = clasaMormanului(rules, m)
  if (clasa === null || m.tQ16 === null) return { clasa: null, ...TEXT_ALTERARE_NECUNOSCUTA }
  const prag = pragAlterare(rules)
  const t = textAlterare({
    clasa,
    cer: m.loc === LOC_CER,
    subPrag: m.tQ16 <= prag,
    tQ16: m.tQ16,
    pragQ16: prag,
    n: m.cantitate * Math.min(1, m.rataZi),
    zileAn: tickuriPeAn(rules) / rules.calendar.ziTicks,
  })
  return { clasa, ...t }
}

/** Ce scrie inspectorul PE LOC despre mormanul de pe (wx, wy, z + 1): cantitatea si alterarea; null = niciun morman. */
export function mormanPeLoc(w: World, rules: Rules, wx: number, wy: number, z: number): { readonly id: number; readonly cantitate: string; readonly alterare: AlterareMorman | null } | null {
  const is = itemLaCelula(w.iteme, wx, wy, z + 1)
  if (is === -1) return null
  const fel = w.iteme.kind[is]!
  return { id: w.iteme.id[is]!, cantitate: cant(w.iteme.cantitate[is]!, NUME_ITEM[fel]?.toLowerCase() ?? ''), alterare: alterareaMormanului(w, rules, is) }
}

// ---------------------------------------------------------------------------------------------
// camara (S24-27 t.3 §5, §8): presetul, comutatorul, groapa, „se strica aici"
// ---------------------------------------------------------------------------------------------

/** Filtrul camarii, ca masca REFUZATA (`setFiltruZona`): toate felurile in afara de HRANA. */
export const MASCA_DOAR_HRANA = ((1 << ITEME) - 1) & ~(1 << Item.HRANA)

/** E o camara: un depozit viu cu filtru (refuza ceva) care primeste hrana. */
export function esteCamara(w: World, zs: number): boolean {
  const s = w.zone
  return s.alive[zs] === 1 && s.kind[zs] === Zona.DEPOZIT && s.refuzate[zs]! !== 0 && primesteFel(s, zs, Item.HRANA)
}

/** Cate celule are zona `zs`. */
function celuleleZonei(w: World, zs: number): number {
  const c = w.zone.celule
  const id = w.zone.id[zs]!
  let n = 0
  for (let i = 0; i < c.count; i++) if (c.alive[i] === 1 && c.zonaId[i] === id) n++
  return n
}

/** Cati oameni hraneste o camara plina (J-11): celule × itemStackMax / hrana pe om. */
export function capacitateCamara(w: World, rules: Rules, zs: number, hranaPeOm: number): number {
  return hranaPeOm > 0 ? Math.floor((celuleleZonei(w, zs) * rules.itemStackMax) / hranaPeOm) : 0
}

/**
 * Locul pentru felul `fel` in zona `zs`, in unitati — aceeasi idee de celula libera ca indexul si groapa de moloz
 * (`groapaDeMoloz`): nerezervata ca destinatie (LUCRU), nu sub un santier viu; goala = `itemStackMax`, una partiala doar pe
 * felul ei. Citire pura (indexul nu se reconstruieste din UI).
 */
function locInZona(w: World, rules: Rules, zs: number, fel: number): number {
  const s = w.zone
  if (!primesteFel(s, zs, fel)) return 0
  const c = s.celule
  const id = s.id[zs]!
  const it = w.iteme
  let loc = 0
  for (let cs = 0; cs < c.count; cs++) {
    if (c.alive[cs] !== 1 || c.zonaId[cs] !== id) continue
    if (rezervariPentru(w.rezervari, c.id[cs]!, Strat.LUCRU).length > 0) continue
    if (subSantier(w, rules, c.wx[cs]!, c.wy[cs]!, c.z[cs]!)) continue
    const i = itemLaCelula(it, c.wx[cs]!, c.wy[cs]!, c.z[cs]!)
    if (i === -1) loc += rules.itemStackMax
    else if (it.kind[i] === fel && it.cantitate[i]! < rules.itemStackMax) loc += rules.itemStackMax - it.cantitate[i]!
  }
  return loc
}

/**
 * Cea mai buna camara (rang maxim, id mic) care are loc pentru `fel`, ALTA decat zona `faraZs` (cea in care sta deja
 * mormanul: o camara calda nu-si e singura sfat); prioritatea si rangul ei; null = niciuna.
 */
export function camaraCuLoc(w: World, rules: Rules, fel: number, faraZs = -1): { readonly zs: number; readonly rang: number; readonly prioritate: number; readonly loc: number } | null {
  const s = w.zone
  let best: { zs: number; rang: number; prioritate: number; loc: number } | null = null
  for (let zs = 0; zs < s.count; zs++) {
    if (zs === faraZs || !esteCamara(w, zs) || !primesteFel(s, zs, fel)) continue
    const rang = rangZona(s, zs)
    if (best !== null && (rang < best.rang || (rang === best.rang && s.id[zs]! > s.id[best.zs]!))) continue
    const loc = locInZona(w, rules, zs, fel)
    if (loc > 0) best = { zs, rang, prioritate: s.prioritate[zs]!, loc }
  }
  return best
}

/**
 * Groapa de moloz a CAMARII din slotul `zs` (`groapaDeMoloz`, src/sim/camara.ts); null daca zona nu e o camara. Doar camara
 * propune groapa (§5): inainte, orice depozit cu filtru — si groapa insasi („doar piatră"), cu hrana sau pamant lasate pe
 * ea si fara loc in alta parte — primea avertismentul si butonul, iar pe mormanul ei cauza „Cămara nu primește …"; butonul
 * picta pentru hrana o a doua camara, la suprafata (JOC-4). Inspectorul (avertismentul, butonul, clicul) si cauza de pe
 * moloz citesc de aici.
 */
export function groapaCamarei(w: World, rules: Rules, zs: number): GroapaDeMoloz | null {
  return esteCamara(w, zs) ? groapaDeMoloz(w, rules, w.zone.id[zs]!) : null
}

/** Groapa de moloz a zonei de pe celula (wx, wy, z), daca e o camara (`groapaCamarei`). */
function groapaZoneiLa(w: World, rules: Rules, wx: number, wy: number, z: number): { readonly zs: number; readonly g: GroapaDeMoloz } | null {
  const cs = celulaDeZonaLa(w.zone, wx, wy, z)
  if (cs === -1) return null
  const zs = slotZona(w.zone, w.zone.celule.zonaId[cs]!)
  if (zs === -1) return null
  const g = groapaCamarei(w, rules, zs)
  return g === null ? null : { zs, g }
}

/**
 * Solidul de sus al coloanei (wx, wy): pe un chunk promovat, din voxeli, de sus in jos (`groundLevelM` e relieful neatins:
 * nu stie de sapaturi si de ziduri); pe unul nepromovat, relieful. O functie pentru dreptunghiul din main.ts si groapa.
 */
export function suprafataColoanei(w: World, wx: number, wy: number): number | null {
  const iv = voxelRangeM(w.terrain, wx, wy)
  if (!iv.ok) return null
  const g = groundLevelM(w.terrain, wx, wy)
  const c = w.terrain.chunks.get(chunkKey(Math.floor(wx / CHUNK_CELLS), Math.floor(wy / CHUNK_CELLS)))
  if (!c || c.voxels === null) return g.ok ? g.value : null
  for (let z = iv.value.max; z >= iv.value.min; z--) {
    const r = materialAt(w.terrain, wx, wy, z)
    if (r.ok && isSolid(r.value)) return z
  }
  return null
}

/** Cat de departe (Chebyshev, in celule) de camara cauta `locGroapa` un patrat liber. */
export const RAZA_GROAPA = 24

/**
 * Unde se poate picta groapa de moloz (`latura` × `latura`), langa camara `zonaId`: primul patrat, pe inele tot mai largi in
 * jurul ei, in care fiecare celula e pe suprafata (aceeasi cota), poate tine o zona (`celulaDeZonaPosibila`, ca
 * `picteazaZona`), nu e deja intr-o zona, nu are o desemnare si e IN ACEEASI COMPONENTA de mers ca o celula a camarii
 * (`regionAt` + `find`, citiri de tablou): caraușii molozului trebuie sa ajunga din camara la ea. Fara asta, langa camara
 * geometriei H4 (pivnita sub casa) primul patrat „pe suprafata" era ACOPERISUL casei (z = g + 4), unde nu ajunge nimeni:
 * propunerea disparea (`loc` din `groapaDeMoloz` nu intreaba de acces), iar molozul ramanea in camara (JOC-1, JOC-2).
 * null = niciunul in `RAZA_GROAPA` (inspectorul spune ce sa faca). Citire pura; costul e al unui clic (cel mult ~(2R)² patrate).
 */
export function locGroapa(w: World, rules: Rules, zonaId: number, latura: number): { readonly x0: number; readonly y0: number; readonly z: number } | null {
  const s = w.zone
  const c = s.celule
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  // Componenta de mers a camarii: a primei celule ei care are o regiune (una pe care se poate sta).
  let comp = NO_REGION
  for (let i = 0; i < c.count; i++) {
    if (c.alive[i] !== 1 || c.zonaId[i] !== zonaId) continue
    x0 = Math.min(x0, c.wx[i]!); x1 = Math.max(x1, c.wx[i]!); y0 = Math.min(y0, c.wy[i]!); y1 = Math.max(y1, c.wy[i]!)
    if (comp === NO_REGION) {
      const r = regionAt(w.regions, c.wx[i]!, c.wy[i]!, c.z[i]!)
      if (r !== NO_REGION) comp = find(w.regions, r)
    }
  }
  if (!Number.isFinite(x0) || latura <= 0 || comp === NO_REGION) return null
  const bun = (ax: number, ay: number): number | null => {
    const s0 = suprafataColoanei(w, ax, ay)
    if (s0 === null) return null
    const z = s0 + 1
    for (let dy = 0; dy < latura; dy++) {
      for (let dx = 0; dx < latura; dx++) {
        const x = ax + dx, y = ay + dy
        if (suprafataColoanei(w, x, y) !== s0) return null
        if (!celulaDeZonaPosibila(w.terrain, x, y, z, rules) || celulaDeZonaLa(s, x, y, z) !== -1) return null
        if (desemnareLaCelula(w.desemnari, x, y, z) !== -1 || desemnareLaCelula(w.desemnari, x, y, s0) !== -1) return null
        const r = regionAt(w.regions, x, y, z)
        if (r === NO_REGION || find(w.regions, r) !== comp) return null
      }
    }
    return z
  }
  // Inelul d: patratele care incep la distanta d de dreptunghiul camarii (Chebyshev), in ordine fixa (y, apoi x).
  for (let d = 1; d <= RAZA_GROAPA; d++) {
    for (let ay = y0 - d - latura + 1; ay <= y1 + d; ay++) {
      for (let ax = x0 - d - latura + 1; ax <= x1 + d; ax++) {
        const dx = Math.max(x0 - (ax + latura - 1), ax - x1, 0)
        const dy = Math.max(y0 - (ay + latura - 1), ay - y1, 0)
        if (Math.max(dx, dy) !== d) continue
        const z = bun(ax, ay)
        if (z !== null) return { x0: ax, y0: ay, z }
      }
    }
  }
  return null
}

/**
 * Bucatile unei zone noi (legate de prima) si, pentru o CAMARA (`filtru` ≠ 0), filtrul ei — in ACELASI pas, fara niciun tick
 * intre ele (contractul C: niciun job nu apuca sa porneasca spre o camara fara filtru). `aplica` e `applyCommand` pe lumea
 * paginii. Filtrul se pune doar pe zona creata aici; un refuz al picturii nu trimite niciun filtru.
 */
export function aplicaZona(
  aplica: (c: Command) => Outcome<number>,
  bucati: readonly { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly z: number }[],
  fel: number,
  filtru: number,
): { zonaId: number | null; aplicate: number; refuzuri: Outcome<number>[] } {
  let zonaId: number | null = null
  let aplicate = 0
  const refuzuri: Outcome<number>[] = []
  for (const b of bucati) {
    const out = aplica({ kind: 'picteazaZona', x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, z: b.z, fel, zonaId: zonaId ?? undefined })
    if (out.ok) { zonaId = out.value; aplicate++ } else refuzuri.push(out)
  }
  if (zonaId !== null && filtru !== 0) {
    const out = aplica({ kind: 'setFiltruZona', id: zonaId, refuzate: filtru })
    if (out.ok) aplicate++
    else refuzuri.push(out)
  }
  return { zonaId, aplicate, refuzuri }
}

export function rezumatColonie(w: World, rules: Rules, h: HranaEcran = hranaEcran(w, rules)): RezumatColonie {
  const acc = Array.from({ length: ITEME }, () => ({ inDepozit: 0, peJos: 0, inMaini: 0 }))
  const it = w.iteme
  for (let i = 0; i < it.count; i++) {
    if (it.alive[i] !== 1) continue
    const m = acc[it.kind[i]!]
    if (!m) continue
    if (prioritateaLocului(w.zone, it.wx[i]!, it.wy[i]!, it.z[i]!, it.kind[i]!) > 0) m.inDepozit += it.cantitate[i]!
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
  return { marfa, hrana: h.prognoza, hranaEcran: h, colonisti, jefuitori, flamanzi, obositi, nefericiti, pleacaCurand, plecati: w.plecatiTotal }
}

/** O insigna a barei de sus, langa „Oameni": clasa (atentie / critic), textul si tooltip-ul ('' = fara). */
export interface Insigna {
  readonly clasa: 'atentie' | 'critic'
  readonly text: string
  readonly titlu: string
}

/**
 * Cate insigne incap DESPLIATE in bara de sus, pe latimea UI-ului (px CSS: `innerWidth / zoom`). Masurat pe bara reala
 * (ui-fum, „bara-sus"; recenzia t.2a, L4-6), in cazul cel mai rau — cel mai lat calendar, hrana „~12 h 59 min",
 * indicatorul de viteza, numere de doua cifre: la 1.100 px (LATIME_UI) incape UNA (raman 18 px; doua ies cu pana la
 * 53 px, chiar si „3 flămânzi" + „2 obosiți" nu mai incap langa o prognoza lunga); la 1.280 px incap trei (raman 54 px;
 * patru ies cu 14). Peste, ele se pliaza intr-una: „5 alerte", cu lista in tooltip.
 */
export function insigneDespliate(latimeCss: number): number {
  return latimeCss >= 1280 ? 3 : 1
}

/** Insignele barei de sus (flamanzi, obositi, refuza munca, plecati, jefuitori), pliate peste `insigneDespliate`. */
export function insigneBara(r: Pick<RezumatColonie, 'flamanzi' | 'obositi' | 'nefericiti' | 'plecati' | 'jefuitori'>, latimeCss: number): Insigna[] {
  const ins: Insigna[] = []
  if (r.flamanzi) ins.push({ clasa: 'atentie', text: cant(r.flamanzi, 'flămânzi'), titlu: '' })
  if (r.obositi) ins.push({ clasa: 'atentie', text: cant(r.obositi, 'obosiți'), titlu: '' })
  if (r.nefericiti) ins.push({ clasa: 'critic', text: `${r.nefericiti} refuză munca`, titlu: '' })
  if (r.plecati) ins.push({ clasa: 'critic', text: cant(r.plecati, 'plecați'), titlu: '' })
  if (r.jefuitori) ins.push({ clasa: 'atentie', text: cant(r.jefuitori, 'jefuitori'), titlu: '' })
  if (ins.length <= insigneDespliate(latimeCss)) return ins
  return [{ clasa: ins.some((x) => x.clasa === 'critic') ? 'critic' : 'atentie', text: cant(ins.length, 'alerte'), titlu: ins.map((x) => x.text).join(' · ') }]
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

/** O ușă nu scoate pe nimeni dintr-o groapă: sfatul pentru o ușă fără loc SIGUR, în ambele ramuri. */
const USA_NU_E_TREAPTA: TextMotiv = { titlu: 'o ușă nu e treaptă — nu scoate pe nimeni de acolo.', actiune: 'Pune o scară până la ea.' }

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
    const usa = construieste && piesa !== Piesa.NICIUNA && rules.piese[piesa]!.material === Material.USA
    // FARA_LOC_SIGUR pe o ușă: scanerul scrie motivul din prima încercare, deci textul generic („Pune o
    // scară sau o ușă") îi cerea jucătorului o ușă despre o ușă, chiar pe scena USA-1 (recenzia
    // încăperilor, USA-4). Același sfat ca în ramura previzualizării, mai jos.
    const t = construieste && cod === Reason.INACCESIBIL && d.ultimulMotivDetaliu[ds] === DetaliuMotiv.FARA_LOC_DE_LUCRU
      ? textFaraLocDeZidit(w, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, cifre)
      : usa && cod === Reason.INACCESIBIL && d.ultimulMotivDetaliu[ds] === DetaliuMotiv.FARA_LOC_SIGUR
        ? { titlu: `Niciun loc SIGUR de lucru: ${USA_NU_E_TREAPTA.titlu}`, actiune: USA_NU_E_TREAPTA.actiune }
        : textMotiv('desemnare', cod, d.ultimulMotivDetaliu[ds]!, undefined, cifre, felMaterial)
    const s = Math.ceil((d.reincercaLaTick[ds]! - w.tick) / rules.ticksPerSecond)
    return { fel: 'motiv', text: { titlu: s > 0 ? `${t.titlu} Reîncearcă în ${s} s.` : `Ultimul refuz memorat: ${t.titlu.replace(/^./, (c) => c.toLowerCase())} Se reverifică la următoarea scanare.`, actiune: t.actiune } }
  }
  if (construieste && previz) {
    const cauza = previz.faraAcces.get(k)
    if (cauza !== undefined) {
      // O ușă nu scoate pe nimeni dintr-o groapă (nu e treaptă): sfatul „pune o ușă" despre o ușă ar fi
      // fost fals (panoul camerelor, USA-1).
      if (rules.piese[d.piesa[ds]!]!.material === Material.USA) {
        return { fel: 'faraAcces', text: { titlu: `Nu ajunge nimeni la ea: ${USA_NU_E_TREAPTA.titlu}`, actiune: USA_NU_E_TREAPTA.actiune } }
      }
      return { fel: 'faraAcces', text: cauza === CauzaAcces.INCINTA
        ? { titlu: 'Nu ajunge nimeni la ea: locurile de lucru sunt într-o încăpere fără ieșire.', actiune: 'Pune o ușă în perete (un gol de 1 × 2 m). Un gol fără ușă merge și el, dar încăperea nu mai e închisă.' }
        : { titlu: 'Nu ajunge nimeni la ea: nimic pe care să stea un om la înălțimea ei.', actiune: textFaraLocDeZidit(w, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, cifre).actiune } }
    }
    if (previz.construibile.has(k) && !sustinutAcum(w.terrain, rules, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, null)) {
      return { fel: 'asteapta', text: { titlu: 'Așteaptă piesa de dedesubt sau de alături: acum n-ar sta.', actiune: '' } }
    }
  }
  return { fel: 'libera', text: { titlu: 'Liberă: vine primul om care are voie la munca asta.', actiune: '' } }
}

/**
 * Mormanul din inspector, FARA cantitate (UI-10): ea scade acum singura (alterarea), iar in cheia inspectorului (`JSON` al
 * inspectiei) reconstruia tot corpul — cu butoanele — de fiecare data. Cantitatea si randul de alterare se scriu PE LOC
 * (`mormanPeLoc`).
 */
export interface InspectieMorman {
  readonly id: number
  readonly fel: number
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
  /** `refuzate` = masca filtrului (t.3, camara; 0 = primeste tot) — scrisa PE LOC in inspector, deci scoasa din cheie. */
  readonly zona: { readonly id: number; readonly fel: number; readonly prioritate: number; readonly refuzate: number } | null
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
  const aici = prioritateaLocului(w.zone, it.wx[is]!, it.wy[is]!, it.z[is]!, it.kind[is]!)
  if (aici > 0) {
    // Se strica intr-un depozit, iar o camara are loc pe care caraușii nu-l folosesc: rangul ei nu e mai mare (UI-3).
    const m = rules.perisabil[it.kind[is]!] === true ? mormanulDeHrana(w, rules, is) : null
    if (m !== null && clasaMormanului(rules, m) === Clasa.STRICA) {
      const zs = slotZona(w.zone, w.zone.celule.zonaId[celulaDeZonaLa(w.zone, it.wx[is]!, it.wy[is]!, it.z[is]!)]!)
      const cam = camaraCuLoc(w, rules, it.kind[is]!, zs)
      if (cam !== null && cam.rang <= aici) return textStricaCamaraAreLoc(cam.prioritate, zs === -1 ? 0 : w.zone.prioritate[zs]!)
    }
    return { titlu: 'În depozit.', actiune: '' }
  }
  // Moloz pe o camara care nu-l primeste, cand ALT depozit ii primeste felul dar n-are loc: cauza cu cifrele gropii (§5,
  // verif-J-2), in locul lui „pline" — si inaintea racirii, care spunea doar „Reîncearcă". Cand niciun depozit nu-i
  // primeste felul, ramane FEL_REFUZAT („Schimbă filtrul…"): „nu mai e loc" ar fi fost fals (poarta-camara).
  if (((vedere.primeste >> it.kind[is]!) & 1) === 1) {
    const gz = groapaZoneiLa(w, rules, it.wx[is]!, it.wy[is]!, it.z[is]!)
    if (gz !== null && gz.g.propusa > 0 && ((gz.g.feluri >> it.kind[is]!) & 1) === 1) return textMolozInCamara(it.kind[is]!, gz.g)
  }
  const cod = motivDinCod(it.ultimulMotiv[is]!)
  const s = Math.ceil((it.reincercaLaTick[is]! - w.tick) / rules.ticksPerSecond)
  if (cod !== null && s > 0) {
    const t = textMotiv('morman', cod, it.ultimulMotivDetaliu[is]!, undefined, cifre, it.kind[is]!)
    return { titlu: `${t.titlu} Reîncearcă în ${s} s.`, actiune: t.actiune }
  }
  if (vedere.esteFaraDepozit(is)) {
    // Trei cauze, din `vedere` (un adevar cu alerta): niciun depozit; niciunul nu-i primeste felul (filtrul, t.3); pline.
    const detaliu = vedere.depozite === 0 ? DetaliuItem.NICIO_ZONA : ((vedere.primeste >> it.kind[is]!) & 1) === 0 ? DetaliuItem.FEL_REFUZAT : DetaliuItem.DEPOZITE_PLINE
    return textMotiv('morman', Reason.FARA_DEPOZIT, detaliu, undefined, cifre, it.kind[is]!)
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
    morman = { id: it.id[is]!, fel: it.kind[is]!, rezervat, stare: stareMorman(w, rules, is, vedereFaraDepozit(w, rules)) }
  }
  let zona: InspectieCelula['zona'] = null
  const cs = celulaDeZonaLa(w.zone, wx, wy, z + 1)
  if (cs !== -1) {
    const zid = w.zone.celule.zonaId[cs]!
    const zs = slotZona(w.zone, zid)
    if (zs !== -1) zona = { id: zid, fel: w.zone.kind[zs]!, prioritate: w.zone.prioritate[zs]!, refuzate: w.zone.refuzate[zs]! }
  }
  return { wx, wy, z, material: mat.ok ? mat.value : null, materialDeasupra: sus.ok ? sus.value : null, desemnari, morman, zona }
}

// ---------------------------------------------------------------------------------------------
// încăperea de la celula inspectată
// ---------------------------------------------------------------------------------------------

export interface IncapereLa {
  /** Aerul întrebat e SUB celula atinsă (s-a dat clic pe un acoperiș sau pe un tavan). */
  readonly sub: boolean
  readonly celula: Celula
  readonly e: Explicatie
}

/** Normala fetei atinse, în coordonatele lumii (x = wx, y = wy, z = cota): un versor pe o axă. */
export interface NormalaFetei {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Cât coboară inspectorul printr-un acoperiș gros (sau trece printr-un zid) până la aerul acoperit. */
export const GROSIME_MAX_INSPECTOR = 4

/** Vecinii din plan ai unei celule: întâi cei 4 pe axe, apoi diagonalele (colțul unei case). */
const VECINI_PLAN: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]

/**
 * Ce aer întreabă inspectorul despre încăpere, pentru un clic pe celula (wx, wy, z), în ordinea asta:
 *  1. aerul din FAȚA feței atinse (`n`, normala ei), dacă e acoperit — peretele, panoul ușii, tavanul privit
 *     de jos: tocmai obiectele care închid încăperea, pe care jucătorul dă clic, nu spuneau nimic despre ea
 *     (48 din 48 de celule de zid și ușă, recenzia explicației, EXP-6);
 *  2. celula de deasupra (unde s-ar sta), apoi celula însăși, dacă sunt aer acoperit;
 *  3. prin solid: în spatele feței (−n), apoi în jos pe coloană — un acoperiș, și unul gros —, cel mult
 *     `GROSIME_MAX_INSPECTOR` niveluri (fără normală, un clic pe acoperiș răspundea altfel „sub cerul liber"
 *     pe toată casa: panoul camerelor, JUC-7; la 2 m de acoperiș, tot nimic);
 *  4. vecinii din plan ai solidului: zidul și ușa întrebate fără normală (alertele, orice apelant care n-o
 *     are), colțul casei (atins de încăpere doar în diagonală).
 * `sub` = aerul întrebat e SUB celula atinsă. `null` = nimic acoperit aici. Pură: citește terenul și
 * indexul, la zi în afara tickului.
 */
export function incaperea(w: World, wx: number, wy: number, z: number, n: NormalaFetei | null = null): IncapereLa | null {
  const a = aerulIntrebat(w, wx, wy, z, n)
  return a === null ? null : { ...a, e: explicaCelula(w.terrain, w.camere, a.celula.x, a.celula.y, a.celula.z) }
}

/**
 * Aerul pe care îl întreabă `incaperea`, fără explicație: câteva citiri de teren. E cheia potrivită pentru
 * o memorare (explicația inundă până la scurgere; aerul întrebat nu e mereu la z ± 1).
 */
export interface AerIntrebat {
  readonly sub: boolean
  readonly celula: Celula
}

export function aerulIntrebat(w: World, wx: number, wy: number, z: number, n: NormalaFetei | null = null): AerIntrebat | null {
  const r = cititorCamere(w.terrain)
  const la = (x: number, y: number, zz: number): AerIntrebat => ({ sub: zz < z && x === wx && y === wy, celula: { x, y, z: zz } })
  if (n !== null && esteAerAcoperit(r, wx + n.x, wy + n.y, z + n.z)) return la(wx + n.x, wy + n.y, z + n.z)
  if (esteAerAcoperit(r, wx, wy, z + 1)) return la(wx, wy, z + 1)
  if (esteAer(r, wx, wy, z)) return esteAerAcoperit(r, wx, wy, z) ? la(wx, wy, z) : null
  const prin = (dx: number, dy: number, dz: number): AerIntrebat | null => {
    for (let k = 1; k <= GROSIME_MAX_INSPECTOR; k++) {
      const x = wx + k * dx, y = wy + k * dy, zz = z + k * dz
      if (esteAer(r, x, y, zz)) return esteAerAcoperit(r, x, y, zz) ? la(x, y, zz) : null
    }
    return null
  }
  const inSpate = n === null ? null : prin(-n.x, -n.y, -n.z)
  if (inSpate !== null) return inSpate
  const dedesubt = prin(0, 0, -1)
  if (dedesubt !== null) return dedesubt
  for (const [dx, dy] of VECINI_PLAN) if (esteAerAcoperit(r, wx + dx, wy + dy, z)) return la(wx + dx, wy + dy, z)
  return null
}

// ---------------------------------------------------------------------------------------------
// temperatura încăperii de la celula inspectată (t.2b §8: temperatura e STARE)
// ---------------------------------------------------------------------------------------------

/**
 * Ce scrie inspectorul despre temperatura componentei (research/temperatura-t2b.md §8): trei rânduri FIXE — fiecare pe
 * un singur rând în cazul cel mai lat (măsurat în ui.css), deci butoanele de sub ele nu sar — și descompunerea.
 */
export interface TermicLa {
  /** Componenta (id-ul din index). */
  readonly comp: number
  /** T din stare (Q16 °C); null = componenta n-are T (invariant încălcat). */
  readonly tQ16: number | null
  /** X_tot = X + P/ΣG (Q16 °C), cu P-ul arătat (`FiltruOameni`); null = linia grafului nu se poate citi. */
  readonly xTotQ16: number | null
  /** Oamenii arătați: eșantionul pasului, filtrat (F4). */
  readonly oameni: number
  /** Rândul 1: „6,2 °C · afară 12 °C" sau „Temperatura nu se știe (eroare internă)". */
  readonly linie: string
  /** Rândul 2: „trage spre 4,8 °C ↘" / „stabil" / „trage spre: nu se știe"; '' fără T. */
  readonly tragere: string
  /** Rândul 3: „oameni: niciunul" / „oameni: 1 înăuntru"; '' fără T. */
  readonly oameniText: string
  /** „66% sol (pereți 42%, podea 24%, ~4 °C) · 31% aer de afară prin acoperiș (…)" — vecinele la T-ul lor de acum; '' la refuz. */
  readonly canale: string
}

/**
 * Temperatura componentei care conține celula de aer `celula` (cea întrebată de explicație, `IncapereLa.celula`), din
 * starea de ACUM, la fiecare cerere (§8): T din `w.temperatura` (fără fereastra de o secundă a lui t.2a), X din linia
 * grafului simulării (`tragerea`: rezervoarele la tick, vecinele la T-ul lor de acum) plus oamenii arătați de filtru
 * (`filtru`; fără el, cei de acum), descompunerea din geometria canalelor (`geo`, memorată de apelant; fără ea, calculată
 * acum). NU stă în `IncapereLa` și nu trece prin memoria explicației (aceea întoarce același obiect cât nu se editează
 * lângă componentă: temperatura ar îngheța — panoul t.2a, L5-2). Nu scrie nimic și nu cere graful t.2a.
 */
export function termicLa(w: World, rules: Rules, celula: Celula, filtru: FiltruOameni | null = null, geo?: Outcome<GeometrieCanale>): TermicLa | null {
  const c = componentaLa(w.camere, celula.x, celula.y, celula.z)
  if (c === null) return null
  const t = temperaturaAcum(w, c.id)
  if (t === null) return { comp: c.id, tQ16: null, xTotQ16: null, oameni: 0, linie: TEXT_TEMPERATURA_NECUNOSCUTA, tragere: '', oameniText: '', canale: '' }
  const oameni = filtru === null ? (oameniPeComponente(w).get(c.id) ?? 0) : filtru.oameni(w, c.id)
  const tr = tragerea(w, rules, c.id)
  const x = tr.ok ? tragereCuOameni(tr.value, oameni * rules.termic.omW) : null
  const g = geo ?? geometriaCanalelor(w.camere, rules, c.id)
  const k = g.ok ? canaleAcum(w, rules, g.value) : g
  return {
    comp: c.id,
    tQ16: t,
    xTotQ16: x,
    oameni,
    linie: textTemperaturaAcum(t, tAfara(w.seed, w.tick, rules)),
    tragere: x === null ? TEXT_TRAGERE_NECUNOSCUTA : textTragere(t, x),
    oameniText: textOameni(oameni),
    canale: k.ok ? textCanale(k.value) : '',
  }
}

/**
 * Memoria inspectorului (§8): DOAR geometria canalelor (agregarea fețelor: 1,4–2,1 ms pe hub-ul M10, B6), valabilă pe
 * (OBIECTUL indexului, `epoca`, `epocaFete`, regulile, componenta). T, X, oamenii și temperaturile destinațiilor se citesc
 * la fiecare cerere — temperatura e stare, citirea ei e O(1), iar linia grafului 8,6–9,1 µs pe hub (B6). Fereastra de o
 * secundă a lui t.2a (L4-2) nu mai are de ce exista: ecranul nu mai cere graful.
 */
export interface MemorieTermica {
  ia(w: World, rules: Rules, celula: Celula | null, filtru: FiltruOameni | null): TermicLa | null
  /** Geometrii calculate (agregări de fețe). */
  geometrii(): number
}

export function creeazaMemorieTermica(): MemorieTermica {
  let cheie: { idx: World['camere']; epoca: number; epocaFete: number; comp: number; rules: Rules } | null = null
  let geo: Outcome<GeometrieCanale> | null = null
  let geometrii = 0
  return {
    ia(w, rules, celula, filtru) {
      if (celula === null) return null
      const c = componentaLa(w.camere, celula.x, celula.y, celula.z)
      if (c === null) return null
      const k = cheie
      if (geo === null || k === null || k.idx !== w.camere || k.epoca !== w.camere.epoca || k.epocaFete !== w.camere.epocaFete || k.comp !== c.id || k.rules !== rules) {
        geo = geometriaCanalelor(w.camere, rules, c.id)
        cheie = { idx: w.camere, epoca: w.camere.epoca, epocaFete: w.camere.epocaFete, comp: c.id, rules }
        geometrii++
      }
      return termicLa(w, rules, celula, filtru, geo)
    },
    geometrii: () => geometrii,
  }
}

/** Starea filtrului oamenilor pe o componentă: ultimele (cel mult 3) eșantioane ale pasului și ce se arată. */
export interface StareFiltru {
  readonly ultime: readonly number[]
  readonly afisat: number
}

/**
 * Un eșantion nou în filtru (§8, verif-UI-2 F4): ce se arată se schimbă doar când ultimele 3 eșantioane sunt egale; fără
 * istorie, eșantionul însuși. Un om care trece prin casă (1–3 pași) nu mută nici „trage spre", nici rândul oamenilor —
 * salturile rândului 2 scad la jumătate (verif-UI-2: 18,1–22,3 → 8,7–10,0 pe zi cu 4 locatari).
 */
export function pasFiltru(s: StareFiltru | undefined, n: number): StareFiltru {
  if (s === undefined) return { ultime: [n], afisat: n }
  const ultime = [...s.ultime, n].slice(-3)
  const egale = ultime.length === 3 && ultime[0] === n && ultime[1] === n
  return { ultime, afisat: egale ? n : s.afisat }
}

/**
 * Oamenii arătați de inspector (§8, UI-2 / F4): starea e TRANZITORIE, a ecranului — nimic în simulare, nimic salvat.
 * `dupaTick` se cheamă după FIECARE tick (main.ts împachetează `tick`): când pasul a rulat (`stat.pasi` a crescut),
 * eșantionează oamenii pe componente cu regula pasului (`oameniPeComponente`), din pozițiile pe care le-a folosit pasul
 * (pionii nu se mai mișcă după pas, în același tick). Ținut pe ANCORA componentei: id-urile se rotesc la orice epocă nouă
 * (o săpătură în mină), ancora nu. Istoria e valabilă doar pentru ACEEAȘI componentă — aceeași ancoră ȘI același volum
 * (recenzia t.2b, E1): unită cu pivnița de dedesubt, casa primește ancora pivniței, iar un zid nou lasă ancora casei uneia
 * dintre jumătăți; ținută doar pe ancoră, istoria celeilalte componente se arăta în pauză oricât („oameni: niciunul" cu 2
 * oameni înăuntru), și încă 2 pași jucând. O componentă fără istorie (nouă, unită, despărțită, închisă în pauză) arată
 * oamenii de acum.
 */
export interface FiltruOameni {
  dupaTick(w: World): void
  oameni(w: World, compId: number): number
  /** Eșantioane luate (pași văzuți). */
  esantioane(): number
}

/** Cheia istoriei filtrului: ANCORA componentei — id-urile se rotesc la orice epocă nouă, ancora nu. */
const cheieIstorie = (c: Componenta): number => c.ancora

export function creeazaFiltruOameni(): FiltruOameni {
  let stari = new Map<number, StareFiltru>()
  /** Volumul componentei de pe cheie, la eșantionul din `stari`: alt volum = altă componentă, fără istorie. */
  let volume = new Map<number, number>()
  /** Istoria lui `c`, doar dacă e a ACEEAȘI componente: aceeași ancoră și același volum. */
  const istoria = (c: Componenta): StareFiltru | undefined => (volume.get(cheieIstorie(c)) === c.volum ? stari.get(cheieIstorie(c)) : undefined)
  let stat: World['temperatura']['stat'] | null = null
  let pasi = 0
  let esantioane = 0
  return {
    dupaTick(w) {
      const st = w.temperatura.stat
      if (st !== stat) {
        // Altă lume (o încărcare): istoria veche nu e a ei.
        stat = st
        pasi = st.pasi
        stari = new Map()
        volume = new Map()
        return
      }
      if (st.pasi === pasi) return
      pasi = st.pasi
      const cate = oameniPeComponente(w)
      const noi = new Map<number, StareFiltru>()
      const vol = new Map<number, number>()
      for (const c of w.camere.comp.values()) {
        noi.set(cheieIstorie(c), pasFiltru(istoria(c), cate.get(c.id) ?? 0))
        vol.set(cheieIstorie(c), c.volum)
      }
      stari = noi
      volume = vol
      esantioane++
    },
    oameni(w, compId) {
      const c = w.camere.comp.get(compId)
      if (c === undefined) return 0
      const s = istoria(c)
      return s !== undefined ? s.afisat : (oameniPeComponente(w).get(compId) ?? 0)
    },
    esantioane: () => esantioane,
  }
}

/** Ce a văzut monitorul la o citire. */
export interface CitireMonitor {
  /** Invarianți noi de la citirea de dinainte. */
  readonly noi: number
  /** Tipuri (motive) văzute ACUM prima dată: câte un `console.error` și o alertă pe fiecare. */
  readonly tipuriNoi: readonly string[]
  readonly total: number
  readonly ultimul: string
}

/**
 * Monitorizarea erorilor temperaturii pe ecran (§5.3, UI-6): simularea nu aruncă din `tick()`, ci numără invarianții
 * încălcați (`statTermic(w).invarianti`, cu motivul ultimului). Viewer-ul citește contorul după FIECARE tick (tickul
 * observat) și la fiecare cadru (ce se numără în afara tickului: încărcarea, salvarea); un tip nou (motivul) dă o alertă în
 * Jurnal și UN `console.error` — nu unul pe cadru, nici unul pe pas —, iar contorul stă în F3.
 */
export interface MonitorTermic {
  verifica(w: World): CitireMonitor
}

/**
 * Tipurile (motivele) distincte ale invarianților, ținute de simulare (`StatTermic.tipuriInvarianti`, TRANSIENT; recenzia
 * t.2b, E5): două tipuri în același pas, sau în doi pași ai aceluiași cadru, se raportează amândouă la citirea de cadru.
 */
function tipuriInvarianti(st: StatTermic): Iterable<string> {
  return st.tipuriInvarianti
}

export function creeazaMonitorTermic(): MonitorTermic {
  let stat: World['temperatura']['stat'] | null = null
  let vazute = 0
  const tipuri = new Set<string>()
  return {
    verifica(w) {
      const st = w.temperatura.stat
      if (st !== stat) {
        stat = st
        vazute = 0
      }
      const total = st.invarianti
      const noi = total - vazute
      vazute = total
      const tipuriNoi: string[] = []
      if (noi > 0) {
        for (const tip of tipuriInvarianti(st)) {
          if (tipuri.has(tip)) continue
          tipuri.add(tip)
          tipuriNoi.push(tip)
        }
      }
      return { noi: Math.max(0, noi), tipuriNoi, total, ultimul: st.ultimulInvariant }
    },
  }
}

/**
 * Tickul observat al viewer-ului (main.ts): tickul simulării, apoi eșantionul filtrului oamenilor (recenzia t.2b, E3).
 * Orice avans al lumii din viewer trece pe aici (`stepSim`, `__kinstead.avanseaza`). Monitorul termic se citește o dată pe
 * cadru: simularea ține mulțimea tipurilor (E5), deci doi pași ai aceluiași cadru cu tipuri diferite nu pierd niciunul —
 * o citire și după fiecare tick ar fi fost o a doua cale pentru același lucru (mutantul ei ieșea echivalent).
 */
export function creeazaTickObservat(
  simTick: (w: World, r: Rules) => void,
  filtru: FiltruOameni,
): (w: World, r: Rules) => void {
  return (w, r) => {
    simTick(w, r)
    filtru.dupaTick(w)
  }
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
export function semnaleAlerte(w: World, rules: Rules, previz: Previz | null, h: HranaEcran = hranaEcran(w, rules)): Map<string, Semnal> {
  const m = new Map<string, Semnal>()
  const r = rezumatColonie(w, rules, h)
  if (r.colonisti === 0) return m
  const a = w.agents
  const fo = rules.nevoi[Nevoie.FOAME]!
  const hrana = r.hrana

  m.set('fara-hrana', hrana.puncte <= 0
    ? { activ: true, text: 'Nu mai e hrană. În versiunea asta hrana nu se poate produce; oamenii flămânzi vor pleca.', tinta: null }
    : inactiv)
  // Aceeasi prognoza si aceeasi unitate ca bara (UI-9): zile de calendar, pragul critic (UI-14).
  m.set('hrana-scade', hrana.puncte > 0 && !hrana.plafonat && hrana.zile < PRAG_CRITIC_ZILE
    ? { activ: true, text: textHranaScade(textZile(hrana.zile, hrana.plafonat)), tinta: null }
    : inactiv)
  // Hrana se strica (§8, UI-4): pierderea MEDIE a stocului peste 1% pe zi (sub cer, pe urmatoarele 24 h: nu clipeste cu ziua
  // si noaptea), N = mormanele care pierd cel putin 0,1% pe zi; tinta = mormanul care pierde cel mai mult, citita la clic.
  const tintaH = h.tinta
  m.set('hrana-se-strica', hrana.puncte > 0 && h.pericol > 0 && h.pierdereMedie > PRAG_ALERTA_ZI && tintaH !== -1
    ? { activ: true, text: textAlertaAlterare(h.pericol), tinta: { fel: 'celula', wx: w.iteme.wx[tintaH]!, wy: w.iteme.wy[tintaH]!, z: w.iteme.z[tintaH]! - 1 } }
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
  const vedere = vedereFaraDepozit(w, rules)
  const it = w.iteme
  let peJosIteme = 0
  for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && prioritateaLocului(w.zone, it.wx[i]!, it.wy[i]!, it.z[i]!, it.kind[i]!) === 0) peJosIteme++
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
  // Cu filtrul (t.3, verif-P4 V2): mormanele unui fel pe care NICIUN depozit nu-l primeste se numara separat, din
  // `vedere.primeste` (acelasi adevar ca inspectorul) — „Mărește-le" era un sfat gresit pentru ele.
  let faraDepozit = 0, primulMorman = -1, refuzate = 0
  for (let i = 0; i < it.count; i++) {
    if (!vedere.esteFaraDepozit(i)) continue
    faraDepozit++
    if (((vedere.primeste >> it.kind[i]!) & 1) === 0) refuzate++
    if (primulMorman < 0) primulMorman = i
  }
  const textFaraDepozit = vedere.depozite === 0
    ? `${faraDepozit === 1 ? 'Un morman n-are unde fi dus' : `${cant(faraDepozit, 'mormane')} n-au unde fi duse`}: niciun depozit. Pictează unul (Zone ▸ Depozit).`
    : refuzate === faraDepozit
      ? `${faraDepozit === 1 ? 'Un morman n-are niciun depozit care să-i primească felul' : `${cant(faraDepozit, 'mormane')} n-au niciun depozit care să le primească felul`}. Schimbă filtrul unui depozit sau pictează unul nou.`
      : refuzate > 0
        ? `${cant(faraDepozit, 'mormane')} n-au unde fi duse: ${cant(refuzate, 'mormane', 'unul')} de un fel pe care nu-l primește niciun depozit, restul nu încap. Schimbă filtrul sau mărește depozitele.`
        : `${faraDepozit === 1 ? 'Un morman nu încape' : `${cant(faraDepozit, 'mormane')} nu încap`} în depozite. Mărește-le.`
  m.set('fara-depozit', faraDepozit > 0
    ? { activ: true, text: textFaraDepozit, tinta: { fel: 'celula', wx: it.wx[primulMorman]!, wy: it.wy[primulMorman]!, z: it.z[primulMorman]! - 1 } }
    : inactiv)
  return m
}

/** `slotOf` reexportat pentru panouri (selectia tine id-ul). */
export { slotOf }
