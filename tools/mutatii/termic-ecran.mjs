/**
 * Mutatii: temperatura pe ecran — t.2a commit-ul 4 (ancorele, densitatea, tenta, tasta U) si t.2b valul 2
 * (research/temperatura-t2b.md §8, §5.3): inspectorul cu trei randuri fixe din STARE (T, „trage spre X_tot", oamenii
 * filtrati), descompunerea pe geometria memorata, oracolul „X din randuri == X din linia grafului", oamenii ecranului ==
 * caldura pasului, overlay-ul U din stare (fara cheie de tick), erorile (monitorul invariantilor, `stepSimSigur`).
 * Recenzia t.2b: istoria filtrului pe aceeasi componenta (ancora si volumul; E1), filtrul pe ancora, nu pe id, si
 * componenta fara istorie (E2), legenda lui U cu eroarea (E2), garda simularii dupa o exceptie (E4, agenti.ts), tickul
 * observat care citeste monitorul dupa fiecare tick si multimea tipurilor (E5, model.ts), randul F3 (GRAF-1, SAV-R2).
 *
 * Probele t.2a ale mecanismului care a disparut (memoria termica cheiata pe tick, fereastra de o secunda L4-2, regimul
 * lui U cel mult o data pe secunda, valorile mutate prin celule, geometria necolorata pana la regimul urmator) au fost
 * INLOCUITE cu probe pe comportamentul nou: T citit din echilibru in loc de stare, X fara oameni, vecinele la echilibru
 * in loc de T-ul lor, pragul gresit pentru „stabil", U pe cheia de tick, filtrul scos, randul 3 cu „+X °C", alerta
 * neemisa.
 *
 * Ce NU e aici — in node nu exista DOM si nici bucla de cadre; le probeaza ui-fum (bench/ui-fum.mjs), pe pagina termica
 * (`paginaTermica`), fiecare cu bifa ei:
 * - scrisul PE LOC in DOM, inaintea comparatiei cheii (panouri.ts): „temperatura-fara-clic";
 * - stratul DOM al cifrelor (etichete-temperatura.ts): „temperatura-etichete", „temperatura-etichete-la-zi",
 *   „temperatura-U-la-3x" (cu proba negativa `U-la-3x`);
 * - excluderea I/U: „temperatura-exclude-I";
 * - bucla de cadre care hraneste filtrul (main.ts da `tickObservat` lui `stepSimSigur`): „filtru-bucla", cu proba negativa
 *   `filtru-bucla` (recenzia t.2b, E3: pana atunci nicio bifa n-o vedea — pionul paginii e sigilat, deci un filtru
 *   nehranit arata la fel);
 * - exceptia din tick pe pagina (main.ts: pauza, alerta, F3; garda — Spatiu si 3× refuzate, `avanseaza` 0 tickuri,
 *   Ctrl+S refuzat, salvarea automata suspendata): „exceptie-tick", cu proba negativa `exceptie-tick` (E3/E4: proba
 *   negativa veche „exceptie" arunca in pasul PROBEI, nu in simulare);
 * - randurile fixe ale inspectorului (ui.css; randul fara T, scris de panouri.ts fara clasa `num`): „latime-inspector", cu
 *   proba negativa `latime` (E6), pe descompunerile reale cele mai lungi (bench/canale-lungi.mjs, la fiecare rulare).
 * Aici: bucla avansului de proba (`avanseazaSigur`, agenti.ts), garda ei si a lui `stepSimSigur`, si tickul observat
 * (`creeazaTickObservat`, model.ts), pe care main.ts le leaga de `__kinstead.avanseaza` si de bucla de cadre.
 */

const T = 'tests/viewer-termic.test.ts'
const M = 'viewer/ui/model.ts'
const X = 'viewer/ui/texte.ts'
const O = 'viewer/overlay-temperatura.ts'
const K = 'viewer/ui/taste.ts'
const S = 'src/sim/temperatura.ts'
const F = 'src/sim/termic.ts'
const A = 'viewer/agenti.ts'

const E1 = 'TERMIC ECRAN inspectorul: N tickuri fara editari'
const E2 = 'TERMIC ECRAN inspectorul pe hartie: casa 5x5x2 cu usa'
const E3 = 'TERMIC ECRAN inspectorul: fata ADANC in sus'
const E4 = 'TERMIC ECRAN textele: zecimile si gradele'
const E4R = 'TERMIC ECRAN textele randurilor pe hartie'
const E5 = 'TERMIC ECRAN textele: descompunerea contopeste'
const EG = 'TERMIC ECRAN inspectorul pe hartie: casa 5x5x2 cu golul usii'
const EX = 'TERMIC ECRAN X_tot cu oameni'
const EF = 'TERMIC ECRAN filtrul oamenilor pe hartie'
const EFU = 'TERMIC ECRAN filtrul oamenilor la unire si despartire'
const EFR = 'TERMIC ECRAN filtrul oamenilor tinut pe ANCORA'
const EFI = 'TERMIC ECRAN filtrul oamenilor: o componenta fara esantion'
const EP = 'TERMIC ECRAN oamenii ecranului == caldura pasului'
const EO = 'TERMIC ECRAN oracolul X'
const EN = 'TERMIC ECRAN viewer-ul nu cere graful t.2a'
const ED = 'TERMIC ECRAN descompunerea: geometria memorata'
const ET = 'TERMIC ECRAN componenta fara T'
const ES = 'TERMIC ECRAN stepSimSigur'
const EA = 'TERMIC ECRAN avanseazaSigur'
const EGS = 'TERMIC ECRAN garda simularii'
const EM = 'TERMIC ECRAN monitorul citit dupa FIECARE tick'
const EF3 = 'TERMIC ECRAN randul F3 al temperaturii'
const EL = 'TERMIC ECRAN legenda lui U: aerul de afara'
const ELT = 'TERMIC ECRAN legenda lui U cu o componenta fara T'
const E7 = 'TERMIC ECRAN ancorele pe hartie'
const E8 = 'TERMIC ECRAN ancorele pe M10'
const E10 = 'TERMIC ECRAN densitatea'
const E11 = 'TERMIC ECRAN tenta'
const E12 = 'TERMIC ECRAN overlay-ul U din stare'
const E13 = 'TERMIC ECRAN tasta U'

/** T-ul unei vecine la ECHILIBRU (regimul permanent t.2a), scris cu ce importa deja temperatura.ts: graful t.2a + Gauss–Seidel. */
const VECINA_LA_REGIM = (comp) => `(() => { const gr = grafTermic(w.camere, rules); if (!gr.ok) return null; const tz = temperaturiRezervoare(w.seed, w.tick, rules); const sol = rezolvaRegim(gr.value, tz, tz[BIN_AFARA]!); const i = gr.value.nodDupaComp[${comp}] ?? -1; return i < 0 ? null : sol.t[i]! })()`

export const MUTATII = [
  // --- t.2b §8, randul 1: T din STARE, la fiecare cerere
  {
    n: 'T citit din echilibru (X, ca in t.2a), nu din stare',
    f: M,
    a: '  const t = temperaturaAcum(w, c.id)\n',
    b: '  const tr0 = tragerea(w, rules, c.id)\n  const t = tr0.ok ? tr0.value.xQ16 : null\n',
    t: T, e: E2,
  },
  {
    n: 'UI-6: componenta fara T scrisa ca T (randul 1 cu „0,0 °C", fara „nu se știe")',
    f: M,
    a: "  if (t === null) return { comp: c.id, tQ16: null, xTotQ16: null, oameni: 0, linie: TEXT_TEMPERATURA_NECUNOSCUTA, tragere: '', oameniText: '', canale: '' }\n",
    b: '',
    t: T, e: ET,
  },
  {
    n: 'temperaturaAcum fara stampila: dupa un lot sincronizat pe langa punctul unic, ecranul arata T-ul altei componente',
    f: S,
    a: '  if (!verificaStampila(w).ok) return null\n',
    b: '',
    t: T, e: ET,
  },
  // --- t.2b §8, randul 2: X din linia grafului (vecinele la T-ul de acum), X_tot cu oamenii aratati
  {
    n: 'X: vecinele la echilibrul lor (regimul t.2a), nu la T-ul lor de acum',
    f: S,
    a: '    const t = v === undefined ? null : temperaturaAcum(w, v.comp)\n',
    b: `    const t = v === undefined ? null : ${VECINA_LA_REGIM('v.comp')}\n`,
    t: T, e: EO,
  },
  {
    n: 'descompunerea: vecinele la echilibru, nu la T-ul de acum (X din randuri != X din linia grafului)',
    f: S,
    a: '  return canaleDinGeometrie(geo, tRez, (v) => temperaturaAcum(w, v), t, tRez[BIN_AFARA]!)',
    b: `  return canaleDinGeometrie(geo, tRez, (v) => ${VECINA_LA_REGIM('v')}, t, tRez[BIN_AFARA]!)`,
    t: T, e: EO,
  },
  {
    n: 'X: rezervoarele la tickul 0, nu la tickul lumii',
    f: S,
    a: '  const tRez = temperaturiRezervoare(w.seed, w.tick, rules)\n  let num = 0n\n',
    b: '  const tRez = temperaturiRezervoare(w.seed, 0, rules)\n  let num = 0n\n',
    t: T, e: E2,
  },
  {
    n: 'X din randuri fara vecine (doar primele grupuri / doar rezervoarele)',
    f: F,
    a: '      adaugaLa(gr.vecine, x.vecina, G)\n      adaugaLa(vecine, x.vecina, G)\n',
    b: '      adaugaLa(gr.vecine, x.vecina, G)\n',
    t: T, e: EO,
  },
  {
    n: 'UI-2: X fara oameni (X_tot = X): sageata arata invers fata de T cu oameni inauntru',
    f: M,
    a: '  const x = tr.ok ? tragereCuOameni(tr.value, oameni * rules.termic.omW) : null',
    b: '  const x = tr.ok ? tr.value.xQ16 : null',
    t: T, e: EX,
  },
  {
    n: 'UI-2: P/ΣG fara 2^32 (wati la numarator ca Q16)',
    f: S,
    a: 'BigInt(watti) * 4294967296n',
    b: 'BigInt(watti) * 65536n',
    t: T, e: EX,
  },
  // --- F4: P-ul afisat FILTRAT (stare tranzitorie a ecranului)
  {
    n: 'F4: oamenii de acum, nu cei filtrati (fiecare trecere muta „trage spre")',
    f: M,
    a: '  const oameni = filtru === null ? (oameniPeComponente(w).get(c.id) ?? 0) : filtru.oameni(w, c.id)',
    b: '  const oameni = oameniPeComponente(w).get(c.id) ?? 0',
    t: T, e: EX,
  },
  {
    n: 'F4: filtrul scos (se arata ultimul esantion)',
    f: M,
    a: '  return { ultime, afisat: egale ? n : s.afisat }',
    b: '  return { ultime, afisat: n }',
    t: T, e: EF,
  },
  {
    n: 'F4: filtrul pe 2 esantioane, nu pe 3',
    f: M,
    a: '  const egale = ultime.length === 3 && ultime[0] === n && ultime[1] === n',
    b: '  const egale = ultime[ultime.length - 2] === n',
    t: T, e: EF,
  },
  // --- recenzia t.2b, E1/E2: istoria filtrului e a ACELEIASI componente (ancora si volumul); fara istorie, oamenii de acum
  {
    n: 'E2: filtrul tinut pe ID, nu pe ancora (id-urile rotite in pauza dau unei case oamenii celeilalte)',
    f: M,
    a: 'const cheieIstorie = (c: Componenta): number => c.ancora',
    b: 'const cheieIstorie = (c: Componenta): number => c.id',
    t: T, e: EFR,
  },
  {
    n: 'E1: istoria fara volum (unita cu pivnita, casa ia istoria pivnitei goale; zidul nou lasa unei jumatati istoria casei intregi)',
    f: M,
    a: '(volume.get(cheieIstorie(c)) === c.volum ? stari.get(cheieIstorie(c)) : undefined)',
    b: 'stari.get(cheieIstorie(c))',
    t: T, e: EFU,
  },
  {
    n: 'E2: o componenta fara istorie (inchisa in pauza) arata 0, nu oamenii de acum',
    f: M,
    a: '      return s !== undefined ? s.afisat : (oameniPeComponente(w).get(compId) ?? 0)\n',
    b: '      return s !== undefined ? s.afisat : 0\n',
    t: T, e: EFI,
  },
  {
    n: 'F4: esantionul la fiecare tick, nu la pasul termic',
    f: M,
    a: '      if (st.pasi === pasi) return\n',
    b: '',
    t: T, e: EX,
  },
  // --- oamenii ecranului == caldura pasului (a doua scriere a regulii, tinuta de oracol)
  {
    n: 'oamenii ecranului: celula de sub picioare (z − 1), nu a picioarelor',
    f: S,
    a: '    const c = componentaLa(w.camere, cellOf(ag.x[s]!), cellOf(ag.y[s]!), ag.z[s]!)\n    if (c !== null) out.set(c.id, (out.get(c.id) ?? 0) + 1)\n',
    b: '    const c = componentaLa(w.camere, cellOf(ag.x[s]!), cellOf(ag.y[s]!), ag.z[s]! - 1)\n    if (c !== null) out.set(c.id, (out.get(c.id) ?? 0) + 1)\n',
    t: T, e: EP,
  },
  {
    n: 'oamenii ecranului: si pionii morti',
    f: S,
    a: '    if (ag.alive[s] !== 1) continue\n    const c = componentaLa(w.camere, cellOf(ag.x[s]!), cellOf(ag.y[s]!), ag.z[s]!)\n    if (c !== null) out.set',
    b: '    const c = componentaLa(w.camere, cellOf(ag.x[s]!), cellOf(ag.y[s]!), ag.z[s]!)\n    if (c !== null) out.set',
    t: T, e: EP,
  },
  // --- descompunerea: geometria memorata pe (index, epoca, epocaFete, componenta, reguli)
  {
    n: 'memoria geometriei fara epocaFete: pamantul pe acoperis lasa ponderile vechi',
    f: M,
    a: ' || k.epocaFete !== w.camere.epocaFete || k.comp !== c.id',
    b: ' || k.comp !== c.id',
    t: T, e: ED,
  },
  {
    n: 'memoria geometriei fara componenta: alta casa primeste descompunerea celei dinainte',
    f: M,
    a: ' || k.comp !== c.id || k.rules !== rules) {',
    b: ' || k.rules !== rules) {',
    t: T, e: EN,
  },
  // --- L5-2 (t.2a, ramane): temperatura NU intra in cheia de redesenare
  {
    n: 'L5-2: temperatura intra in cheia de redesenare (InspectieCelula poarta tickul): butoanele s-ar recrea',
    f: M,
    a: '  return { wx, wy, z, material: mat.ok ? mat.value : null, materialDeasupra: sus.ok ? sus.value : null, desemnari, morman, zona }',
    b: '  return { wx, wy, z, material: mat.ok ? mat.value : null, materialDeasupra: sus.ok ? sus.value : null, desemnari, morman, zona, tick: w.tick }',
    t: T, e: E1,
  },
  // --- §5.3, UI-6: monitorul invariantilor (o alerta si un console.error pe TIP nou), stepSimSigur
  {
    n: 'UI-6: alerta neemisa (tipul nou nu se raporteaza)',
    f: M,
    a: '          tipuriNoi.push(tip)\n',
    b: '',
    t: T, e: ET,
  },
  {
    n: 'UI-6: monitorul nu vede invariantii (noi = 0)',
    f: M,
    a: '      const noi = total - vazute\n',
    b: '      const noi = 0 as number\n',
    t: T, e: ET,
  },
  {
    n: 'UI-6: o alerta (si un console.error) la fiecare crestere, nu una pe tip',
    f: M,
    a: '          if (tipuri.has(tip)) continue\n',
    b: '',
    t: T, e: ET,
  },
  {
    n: 'UI-6: stepSimSigur fara catch — o exceptie din tick ingheata cadrul',
    f: A,
    a: '  try {\n    return stepSim(layer, world, rules, dtMs, simTick)\n  } catch (e) {\n    layer.rest = 0\n    opreste(garda, e, raporteaza)\n    return 0\n  }\n',
    b: '  return stepSim(layer, world, rules, dtMs, simTick)\n',
    t: T, e: ES,
  },
  {
    n: 'UI-6: datoria de timp pastrata dupa exceptie (cadrul urmator reia o rafala)',
    f: A,
    a: '    layer.rest = 0\n    opreste(garda, e, raporteaza)\n',
    b: '    opreste(garda, e, raporteaza)\n',
    t: T, e: ES,
  },
  // --- recenzia t.2b, E4: garda simularii — o exceptie dupa stepAgents nu se reia pe jumatatea ei de lume
  {
    n: 'E4: stepSimSigur ignora garda (Spatiu reia stepAgents pe acelasi tick)',
    f: A,
    a: '  if (garda.oprita !== null) {\n    layer.rest = 0\n    return 0\n  }\n',
    b: '',
    t: T, e: EGS,
  },
  {
    n: 'E4: exceptia nu inchide garda (se raporteaza, dar simularea poate porni din nou)',
    f: A,
    a: '  garda.oprita ??= e instanceof Error ? e.message : String(e)\n',
    b: '',
    t: T, e: EGS,
  },
  {
    n: 'E4: avanseazaSigur ignora garda (avansul de proba trece peste simularea oprita)',
    f: A,
    a: '  if (garda.oprita !== null) return 0\n',
    b: '',
    t: T, e: EGS,
  },
  // --- recenzia t.2b, E5: monitorul dupa fiecare tick, cu multimea tipurilor
  {
    n: 'E5: tickul observat fara monitor (citit doar pe cadru: doi pasi ai cadrului pierd primul tip)',
    f: M,
    a: '    const m = monitor.verifica(w)\n    for (const tip of m.tipuriNoi) tipNou(tip, m.total)\n',
    b: '',
    t: T, e: EM,
  },
  {
    n: 'E5: doar ultimul tip, nu multimea tipurilor tinuta de simulare (doua tipuri in acelasi pas)',
    f: M,
    a: '  return (st as StatTermic & { readonly tipuriInvarianti?: Iterable<string> }).tipuriInvarianti ?? [st.ultimulInvariant]',
    b: '  return [st.ultimulInvariant]',
    t: T, e: EM,
  },
  // --- recenzia t.2b, GRAF-1 / SAV-R2 (ecranul): randul F3 al temperaturii
  {
    n: 'F3: neconvergentele si resturile normalizate inversate',
    f: X,
    a: ' · neconvergente ${st.echilibreNeconvergente} · rest normalizat ${st.restNormalizat}',
    b: ' · neconvergente ${st.restNormalizat} · rest normalizat ${st.echilibreNeconvergente}',
    t: T, e: EF3,
  },
  {
    n: 'F3: graful diferit la salvare nu face randul rosu',
    f: X,
    a: ' || st.grafDiferitLaSalvare > 0',
    b: '',
    t: T, e: EF3,
  },
  {
    n: 'F3: taierile scrise 0 si cand simularea le numara',
    f: X,
    a: '  const taieri = (st as StatTermic & { readonly taieri?: number }).taieri ?? 0',
    b: '  const taieri = 0 as number',
    t: T, e: EF3,
  },
  {
    n: 'E4: alerta exceptiei spune iar „Spațiu o pornește din nou" (lumea pe jumatate de tick)',
    f: X,
    a: 'deci nu mai pornește și nu se mai salvează: încarcă ultima salvare (Meniu ▸ Încarcă…).`',
    b: 'Spațiu o pornește din nou.`',
    t: T, e: E4R,
  },
  // --- §8 (B6 rec. 9): avansul de proba al viewer-ului, `__kinstead.avanseaza(n)` = `avanseazaSigur` + remesh
  {
    n: 'avanseaza: un tick lipsa (bucla pana la n - 1)',
    f: A,
    a: '    for (; rulate < n; rulate++) simTick(world, rules)\n',
    b: '    for (; rulate < n - 1; rulate++) simTick(world, rules)\n',
    t: T, e: EA,
  },
  {
    n: 'avanseaza: timpul sarit (world.tick++, fara pas — ce facea ui-fum in t.2a)',
    f: A,
    a: '    for (; rulate < n; rulate++) simTick(world, rules)\n',
    b: '    for (; rulate < n; rulate++) world.tick++\n',
    t: T, e: EA,
  },
  {
    n: 'avanseaza: fara catch — o exceptie din tick scapa in pagina (jocul nu trece pe pauza, nu se raporteaza)',
    f: A,
    a: '  try {\n    for (; rulate < n; rulate++) simTick(world, rules)\n  } catch (e) {\n    opreste(garda, e, raporteaza)\n  }\n',
    b: '  for (; rulate < n; rulate++) simTick(world, rules)\n',
    t: T, e: EA,
  },
  {
    n: 'avanseaza: n nevalidat (doar NaN refuzat: un n fractionar ruleaza ceil(n) tickuri, unul negativ niciunul, tacut)',
    f: A,
    a: '  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(',
    b: '  if (n !== n) throw new RangeError(',
    t: T, e: EA,
  },
  // --- textele randurilor (pe hartie)
  {
    n: '„stabil" pe pragul gresit (|X − T| < 0,05 °C, nu zecimile textului)',
    f: X,
    a: "  if (x === textZecimi(tQ16)) return 'stabil'",
    b: "  if (Math.abs(xTotQ16 - tQ16) < 3277) return 'stabil'",
    t: T, e: E4R,
  },
  {
    n: 'sageata inversata',
    f: X,
    a: "${xTotQ16 < tQ16 ? '↘' : '↗'}",
    b: "${xTotQ16 < tQ16 ? '↗' : '↘'}",
    t: T, e: E4R,
  },
  {
    n: 'JOC-6: randul 3 cu „+X °C" (efectul permanent al omului), nu numarul',
    f: X,
    a: "  return n === 0 ? 'oameni: niciunul' : `oameni: ${n} înăuntru`",
    b: "  return n === 0 ? 'oameni: niciunul' : `oameni +${(0.77 * n).toFixed(1).replace('.', ',')} °C (${n} înăuntru)`",
    t: T, e: E4R,
  },
  {
    n: 'legenda lui U iar cu „la echilibru"',
    f: X,
    a: '  return `${interval} · afară ${textGradeIntregi(tAfaraQ16)} °C`',
    b: '  return `${interval} la echilibru · afară ${textGradeIntregi(tAfaraQ16)} °C`',
    t: T, e: E4R,
  },
  {
    n: 'UI-6: alerta fara textul existent al invariantului',
    f: X,
    a: '  return `Temperatura: ${t.titlu} ${t.actiune}`',
    b: '  return `Temperatura: eroare.`',
    t: T, e: E4R,
  },
  {
    n: 'zecimile: trunchiate, nu rotunjite (0,25 °C → „0,2")',
    f: X,
    a: '  const z = Math.round((Math.abs(q16) * 10) / 65536)',
    b: '  const z = Math.floor((Math.abs(q16) * 10) / 65536)',
    t: T, e: E4,
  },
  {
    n: 'zecimile: „−0,0" (minusul si pe ce se rotunjeste la zero)',
    f: X,
    a: '  return q16 < 0 && z > 0 ? `−${s}` : s',
    b: '  return q16 < 0 ? `−${s}` : s',
    t: T, e: E4,
  },
  {
    n: 'gradele: rotunjite pe valoarea cu semn (−0,5 °C → „0", nesimetric)',
    f: X,
    a: '  const g = Math.round(Math.abs(q16) / 65536)\n  return q16 < 0 && g > 0 ? `−${g}` : `${g}`',
    b: '  const g = Math.round(q16 / 65536) + 0\n  return g < 0 ? `−${-g}` : `${g}`',
    t: T, e: E4,
  },
  {
    n: 'procentele: sub 0,5% scris „0%"',
    f: X,
    a: "  return p === 0 && q16 > 0 ? '<1%' : `${p}%`",
    b: '  return `${p}%`',
    t: T, e: E4,
  },
  {
    n: 'drumul: materialele in ordinea id-ului, nu a celulelor',
    f: X,
    a: '  parti.sort((a, b) => b[1] - a[1] || a[0] - b[0])',
    b: '  parti.sort((a, b) => a[0] - b[0])',
    t: T, e: E4,
  },
  {
    n: 'descompunerea: randurile cu aceeasi destinatie nu se contopesc (solul pe doua grupuri)',
    f: X,
    a: '    let gr = grupuri.find((x) => x.dest === r.destinatie)',
    b: '    let gr = grupuri.find((x) => x.dest === r.destinatie && x.rs[0]!.clasa === r.clasa)',
    t: T, e: E5,
  },
  {
    n: 'descompunerea: grupurile in ordinea primului rand, nu a ponderii lor',
    f: X,
    a: '  grupuri.sort((a, b) => b.pondere - a.pondere)\n',
    b: '',
    t: T, e: E5,
  },
  {
    n: 'descompunerea: temperatura grupului medie pe randuri, nu pe g',
    f: X,
    a: '  for (const r of rs) { g += r.gQ16; gt += r.gQ16 * r.tDestQ16 }',
    b: '  for (const r of rs) { g += 1; gt += r.tDestQ16 }',
    t: T, e: E5,
  },
  {
    n: 'descompunerea: drumul scris si pe usa („1 m ușă")',
    f: X,
    a: '  const prinZid = (dest === Destinatie.AFARA || dest === Destinatie.INCAPERI) && !r0.usa',
    b: '  const prinZid = dest === Destinatie.AFARA || dest === Destinatie.INCAPERI',
    t: T, e: E5,
  },
  {
    n: 'descompunerea: restul omis (randurile nu se mai aduna la 100%)',
    f: X,
    a: '  if (c.rest.pondereQ16 > 0) bucati.push(`rest ${textProcent(c.rest.pondereQ16)}`)\n',
    b: '',
    t: T, e: E2,
  },
  {
    n: 'recenzia ECRAN L4-1: descompunerea numeste iar golul (fata DESCHISA) „pereți"',
    f: X,
    a: "  if (deschis) return 'gol deschis'\n",
    b: '',
    t: T, e: EG,
  },
  {
    n: 'descompunerea: SUS e „tavan" si spre cer (nu „acoperiș")',
    f: X,
    a: "  return dest === Destinatie.AFARA ? 'acoperiș' : 'tavan'",
    b: "  return 'tavan'",
    t: T, e: E2,
  },
  {
    n: 'L5-1: fata ADANC in sus numita dupa destinatie („zid gros"), nu „peste 8 m de piatră"',
    f: X,
    a: "  const cap = adanc ? `peste ${r0.grosime} m de ${NUME_MATERIAL_DRUM[r0.material] ?? 'zid'}` : NUME_DESTINATIE_TEXT[dest]!",
    b: '  const cap = NUME_DESTINATIE_TEXT[dest]!',
    t: T, e: E3,
  },
  // --- L5-3: ancorele cifrelor
  {
    n: 'L5-3: ancora pe celula care contine centrul piesei (poate cadea in afara ei)',
    f: O,
    a: '    const a = ancoraPiesei(p.celule)\n',
    b: '    const a = { x: Math.floor(p.celule.reduce((s, k) => s + (k % WORLD_CELLS), 0) / p.celule.length + 0.5), y: Math.floor(p.celule.reduce((s, k) => s + Math.floor(k / WORLD_CELLS), 0) / p.celule.length + 0.5) }\n',
    t: T, e: E8,
  },
  {
    n: 'L5-3: o singura ancora pe componenta (cea mai apropiata de centrul ei), pusa pe toate piesele',
    f: O,
    a: '    const a = ancoraPiesei(p.celule)\n',
    b: '    const a = ancoraPiesei(piese.filter((q) => q.comp === p.comp).flatMap((q) => q.celule))\n',
    t: T, e: E7,
  },
  {
    n: 'L5-3: piesele 8-conexe (doua piese pe diagonala devin una)',
    f: O,
    a: '      const vecini = [x + 1 < WORLD_CELLS ? k + 1 : -1, x > 0 ? k - 1 : -1, k + WORLD_CELLS, k - WORLD_CELLS]',
    b: '      const vecini = [x + 1 < WORLD_CELLS ? k + 1 : -1, x > 0 ? k - 1 : -1, k + WORLD_CELLS, k - WORLD_CELLS, k + WORLD_CELLS + 1, k + WORLD_CELLS - 1, k - WORLD_CELLS + 1, k - WORLD_CELLS - 1]',
    t: T, e: E7,
  },
  {
    n: 'L5-3: pragul piesei de 2 celule (si piesele marunte primesc cifra)',
    f: O,
    a: 'export const PIESA_MIN_CELULE = 4',
    b: 'export const PIESA_MIN_CELULE = 2',
    t: T, e: E7,
  },
  {
    n: 'L5-3: piesa unica a componentei, sub prag, ramane fara cifra',
    f: O,
    a: '    if (p.celule.length < PIESA_MIN_CELULE && nr.get(p.comp)! > 1) continue',
    b: '    if (p.celule.length < PIESA_MIN_CELULE) continue',
    t: T, e: E7,
  },
  {
    n: 'L5-3: la egalitate, ultima celula (nu cheia cea mai mica): ancora depinde de ordinea parcurgerii',
    f: O,
    a: '    if (d < bd || (d === bd && k < best)) {',
    b: '    if (d <= bd) {',
    t: T, e: E7,
  },
  // --- densitatea
  {
    n: 'densitatea: pragul de 10 px pe celula ignorat (cifrele se calca de departe)',
    f: O,
    a: '.filter((i) => p[i]!.inCadru && p[i]!.pxCelula >= prag)',
    b: '.filter((i) => p[i]!.inCadru)',
    t: T, e: E10,
  },
  {
    n: 'densitatea: fara filtrul lacom (cifrele suprapuse raman toate)',
    f: O,
    a: '      if (Math.abs(a.x - b.x) * 2 < a.latime + b.latime && Math.abs(a.y - b.y) * 2 < a.inaltime + b.inaltime) {',
    b: '      if (false) {',
    t: T, e: E10,
  },
  {
    n: 'densitatea: la suprapunere castiga prima in lista, nu piesa mai mare',
    f: O,
    a: '.sort((a, b) => p[b]!.prioritate - p[a]!.prioritate || a - b)',
    b: '.sort((a, b) => a - b)',
    t: T, e: E10,
  },
  // --- tenta (DESIGN §9.9)
  {
    n: 'tenta: capetele inversate (cald = inchis)',
    f: O,
    a: '  return [0, 1, 2].map((i) => CULOARE_RECE[i]! + f * (CULOARE_CALDA[i]! - CULOARE_RECE[i]!)) as [number, number, number]',
    b: '  return [0, 1, 2].map((i) => CULOARE_CALDA[i]! + f * (CULOARE_RECE[i]! - CULOARE_CALDA[i]!)) as [number, number, number]',
    t: T, e: E11,
  },
  {
    n: 'tenta: fara intervalul minim (0,3 °C intre doua incaperi = tot intervalul)',
    f: O,
    a: '  if (max - min >= INTERVAL_MIN_Q16) return { lo: min, hi: max }',
    b: '  return { lo: min, hi: max }',
    t: T, e: E11,
  },
  {
    n: 'L4-4: aerul de afara scos din intervalul tentei (totul cade iar langa mijlocul rampei)',
    f: O,
    a: '  return intervalTenta(Math.min(min, tAfara), Math.max(max, tAfara))',
    b: '  return intervalTenta(min, max)',
    t: T, e: E11,
  },
  // --- overlay-ul U din STARE (t.2b §8, UI-3)
  {
    n: 'UI-3: U pe cheia de tick floor(tick/tps) — cifrele raman un pas in urma (cheia se schimba inaintea pasului)',
    f: O,
    a: '  const citite = citesteValorile(o, w)\n',
    b: '  const cheieTick = Math.floor(w.tick / rules.ticksPerSecond)\n  const vechi = (o as unknown as { cheieTick?: number }).cheieTick\n  ;(o as unknown as { cheieTick?: number }).cheieTick = cheieTick\n  const citite = cheieTick !== vechi ? citesteValorile(o, w) : false\n',
    t: T, e: E12,
  },
  {
    n: 'U inghetat: valorile citite din stare doar la geometrie noua',
    f: O,
    a: '  const citite = citesteValorile(o, w)\n',
    b: '  const citite = geometrie ? citesteValorile(o, w) : false\n',
    t: T, e: E12,
  },
  {
    n: 'U: recolorarea la fiecare cadru (si in pauza), nu doar la schimbare',
    f: O,
    a: '  if (geometrie || citite || textZecimi(afara) !== textZecimi(o.tAfara)) {',
    b: '  if (true as boolean) {',
    t: T, e: E12,
  },
  {
    n: 'U: aerul de afara al scarii nu se mai reimprospateaza',
    f: O,
    a: '    o.tAfara = afara\n',
    b: '',
    t: T, e: E12,
  },
  {
    n: 'legenda lui U pe aerul SCARII (o.tAfara): alt grad decat inspectorul in 4,5% din tickuri',
    f: O,
    a: '  return textIntervalTemperatura(o.valori.size, o.min, o.max, tAfara(w.seed, w.tick, rules))',
    b: '  return textIntervalTemperatura(o.valori.size, o.min, o.max, o.tAfara)',
    t: T, e: EL,
  },
  {
    n: 'E2: legenda lui U fara eroare (cu o componenta fara T, intervalul celorlalte)',
    f: O,
    a: "  if (o.eroare !== '') return o.eroare\n",
    b: '',
    t: T, e: ELT,
  },
  {
    n: 'legenda lui U scrie cifre si fara nivel',
    f: O,
    a: "  if (!o.visible || o.nivel === null || o.nivel === undefined) return ''",
    b: "  if (!o.visible) return ''",
    t: T, e: EL,
  },
  {
    n: 'L4-4: recolorarea pe intervalul fara aerul de afara',
    f: O,
    a: '  const { lo, hi } = intervalCuAfara(o.min, o.max, o.tAfara)\n',
    b: '  const { lo, hi } = intervalTenta(o.min, o.max)\n',
    t: T, e: E12,
  },
  {
    n: 'UI-6: componenta fara T desenata (alfa 1, culoarea capatului rece)',
    f: O,
    a: '      culori.set(id, [0, 0, 0, 0])\n',
    b: '      culori.set(id, [0.1, 0.15, 0.32, 1])\n',
    t: T, e: ET,
  },
  {
    n: 'UI-6: componenta ramasa fara T pastreaza valoarea veche (cifra si culoarea unei stari pierdute)',
    f: O,
    a: '      if (o.valori.delete(id)) schimbat = true\n',
    b: '',
    t: T, e: ET,
  },
  {
    n: 'U: geometria noua nu goleste valorile (raman pe id-uri vechi, rotite)',
    f: O,
    a: '  o.valori.clear()\n  o.faraT = 0\n',
    b: '  o.faraT = 0\n',
    t: T, e: E12,
  },
  {
    n: 'L4-4: fara alphaTest (patratele cu alfa 0 scriu adancime)',
    f: O,
    a: 'opacity: 0.7, alphaTest: 0.01, depthTest: false',
    b: 'opacity: 0.7, depthTest: false',
    t: T, e: E12,
  },
  {
    n: 'overlay: nivelul nou nu reface geometria (cifrele altui nivel)',
    f: O,
    a: '  const nivelNou = o.nivel !== z\n',
    b: '  const nivelNou = o.nivel === undefined\n',
    t: T, e: E12,
  },
  {
    n: 'overlay: geometria refacuta la orice epoca noua (amprenta ignorata)',
    f: O,
    a: '    geometrie = o.amprenta === null || !aceeasiAmprenta(o.amprenta, amprenta)',
    b: '    geometrie = true',
    t: T, e: E12,
  },
  // --- tasta
  {
    n: 'tasta U lipsa',
    f: K,
    a: "    case 'u': return fa('overlayU')\n",
    b: '',
    t: T, e: E13,
  },
  {
    n: 'tasta U si pe o pagina de gate (printre tastele de azi)',
    f: K,
    a: "    case 'i': return fa('overlayI')\n",
    b: "    case 'i': return fa('overlayI')\n    case 'u': return fa('overlayU')\n",
    t: T, e: E13,
  },
]
