/**
 * Mutatii: temperatura, taietura 2a, commit-ul 1 — ceasul (calendar.ts), clima (clima.ts), continutul
 * `calendar` / `clima` / `termic` cu validarea lui, testul pe TOT obiectul, scanerul (transcendentele si
 * `**`), textele barei de sus. Fiecare proba numeste testul scris pentru garantia ei (design temperatura
 * v2, §1–§4.3, §6, §7).
 *
 * Recenzia t.2a (08.10): scanerul pe AST (L2-1: `Math` doar ca `Math.<permis>`, `**` din AST, comentariile din
 * trivia — un '/*' dintr-un sir nu mai orbeste regulile), garda termica pe MUCHIE (L2-2), bara de sus intr-o singura
 * compunere, `baraDeSus` (L2-3), valul de frig in ziua ANULUI lui (L2-4).
 */

const CA = 'src/sim/calendar.ts'
const CL = 'src/sim/clima.ts'
const CO = 'src/sim/content.ts'
const RJ = 'content/rules.json'
const SC = 'tools/check-sim-discipline.mjs'
const TX = 'viewer/ui/texte.ts'
const MO = 'viewer/ui/model.ts'
const TCA = 'tests/calendar.test.ts'
const TCL = 'tests/clima.test.ts'
const TCO = 'tests/content.test.ts'
const TD = 'tests/discipline.test.ts'
const TB = 'tests/viewer-bara-sus.test.ts'

export const MUTATII = [
  // --- ceasul ---
  {
    n: 'calendar: tickul 0 nu se decaleaza la startul din continut (jocul ar incepe primavara, la 00:00)',
    f: CA, a: '  const t = tick + tickDeStart(rules)', b: '  const t = tick',
    t: TCA, e: 'momentul: tickul 0 e toamna',
  },
  {
    n: 'calendar: ziua din anotimp numarata de la 0',
    f: CA, a: '    zi: ziInAn - anotimp * c.zilePeAnotimp + 1,', b: '    zi: ziInAn - anotimp * c.zilePeAnotimp,',
    t: TCA, e: 'momentul: tickul 0 e toamna',
  },
  {
    n: 'calendar: minutul rotunjit, nu trunchiat (14:21 vine cu un tick prea devreme)',
    f: CA, a: '  const minuteZi = Math.floor((tickInZi * MINUTE_PE_ZI) / zi)', b: '  const minuteZi = Math.round((tickInZi * MINUTE_PE_ZI) / zi)',
    t: TCA, e: 'momentul: „Toamnă 2/4 · 14:20"',
  },
  {
    n: 'calendar: anul cu trunchiere (tickurile negative cad in anul 0, cu tickInAn negativ)',
    f: CA, a: '  const an = Math.floor(t / lungimeAn)', b: '  const an = Math.trunc(t / lungimeAn)',
    t: TCA, e: 'momentul: tickurile negative',
  },
  {
    n: 'calendar: faza anului din ziua intreaga, nu din tick (sare cate o zi)',
    f: CA, a: '    fazaAn: Math.floor((tickInAn * TURA_Q16) / lungimeAn),', b: '    fazaAn: Math.floor((ziInAn * zi * TURA_Q16) / lungimeAn),',
    t: TCA, e: 'momentul: fazele in Q16',
  },
  {
    n: 'calendar: pana la anotimp fara modulo pozitiv (in iarna, urmatoarea iarna e „in trecut")',
    f: CA, a: '  return (((inceput - tickInAn) % lungimeAn) + lungimeAn) % lungimeAn', b: '  return inceput - tickInAn',
    t: TCA, e: 'panaLaAnotimp: prima iarna',
  },

  // --- cosinusul pe intregi ---
  {
    n: 'cosQ14: fara interpolare intre valorile tabelului (eroare 0,006)',
    f: CL, a: '  return a + (((COS_SFERT[i + 1]! - a) * f + 32) >> 6)', b: '  return a',
    t: TCL, e: 'cosQ14: eroarea fata de cosinusul real',
  },
  {
    n: 'cosQ14: al treilea sfert cu semnul gresit',
    f: CL, a: '    case 2: return 0 - sfert(r)', b: '    case 2: return sfert(r)',
    t: TCL, e: 'cosQ14: eroarea fata de cosinusul real',
  },
  {
    n: 'cosQ14: al doilea sfert citit din capatul gresit al tabelului (sinus in loc de cosinus)',
    f: CL, a: '    case 1: return 0 - sfert(UNU_Q14 - r)', b: '    case 1: return 0 - sfert(r)',
    t: TCL, e: 'cosQ14: eroarea fata de cosinusul real',
  },

  // --- tabelele solului ---
  {
    n: 'tabelele solului la adancimea d, nu la centrul celulei (d + ½)',
    f: CL, a: '    let v = expMinusQ60(500n, D) // e^(−0,5 m / D)', b: '    let v = UNU_Q60',
    t: TCL, e: 'tabelele solului',
  },
  {
    n: 'intarzierea solului din d, nu din d + ½',
    f: CL, a: '    const numarator = BigInt(2 * d + 1) * 1000n * BigInt(TURA_Q16) * UNU_Q64', b: '    const numarator = BigInt(2 * d) * 1000n * BigInt(TURA_Q16) * UNU_Q64',
    t: TCL, e: 'tabelele solului',
  },
  {
    n: 'tSolMediu: ΔT_adanc inmultit cu e^ in loc de (1 − e^) (solul adanc ar fi cald)',
    f: CL, a: '(mcLaQ16(c.deltaAdancMc) * (GRAD_Q16 - c.tabele.expAdancQ16[k]!))', b: '(mcLaQ16(c.deltaAdancMc) * c.tabele.expAdancQ16[k]!)',
    t: TCL, e: 'tSolMediu: media solului pe hartie',
  },
  {
    n: 'tSol: unda anului neamortizata cu adancimea',
    f: CL, a: '  const unda = mcLaQ16(c.amplitudineAnMc) * c.tabele.expSezonQ16[k]! * cosQ14(', b: '  const unda = mcLaQ16(c.amplitudineAnMc) * GRAD_Q16 * cosQ14(',
    t: TCL, e: 'tSol: media pe un an e tSolMediu',
  },
  {
    n: 'tSol: intarzierea adunata (solul s-ar raci inaintea aerului)',
    f: CL, a: 'cosQ14(m.fazaAn - fazaCeaMaiRece(rules) - c.tabele.lagQ16[k]!)', b: 'cosQ14(m.fazaAn - fazaCeaMaiRece(rules) + c.tabele.lagQ16[k]!)',
    t: TCL, e: 'tSol: unda anului intarzie',
  },
  {
    n: 'tSol: fara intarziere (pivnita se raceste odata cu aerul)',
    f: CL, a: 'cosQ14(m.fazaAn - fazaCeaMaiRece(rules) - c.tabele.lagQ16[k]!)', b: 'cosQ14(m.fazaAn - fazaCeaMaiRece(rules))',
    t: TCL, e: 'tSol: unda anului intarzie',
  },
  {
    n: 'tSol: d neclampat (donjonul, d = −11, da NaN)',
    f: CL, a: '  return d <= 0 ? 0 : d >= ADANCIME_MAX ? ADANCIME_MAX : d | 0', b: '  return d | 0',
    t: TCL, e: 'tSol: d se clampeaza IN functie',
  },
  {
    n: 'tSol: d clampat doar in jos (peste 64, tabelul citit in afara lui)',
    f: CL, a: '  return d <= 0 ? 0 : d >= ADANCIME_MAX ? ADANCIME_MAX : d | 0', b: '  return d <= 0 ? 0 : d | 0',
    t: TCL, e: 'tSol: d se clampeaza IN functie',
  },

  // --- aerul de afara si valul de frig ---
  {
    n: 'tAfara: unda anului cu semnul gresit (iarna cea mai calda)',
    f: CL, a: 'Math.round((zi - an) / UNU_Q14)', b: 'Math.round((zi + an) / UNU_Q14)',
    t: TCL, e: 'tAfara: fara val, minimul anului',
  },
  {
    n: 'tAfara: ora cea mai calda ignorata (varful zilei la miezul noptii)',
    f: CL, a: '  const zi = mcLaQ16(c.amplitudineZiMc) * cosQ14(m.fazaZi - fazaCeaMaiCalda(rules))', b: '  const zi = mcLaQ16(c.amplitudineZiMc) * cosQ14(m.fazaZi)',
    t: TCL, e: 'tAfara: fara val, minimul anului',
  },
  {
    n: 'tAfara: fara valul de frig (nimic nu coboara sub −6,8 °C)',
    f: CL, a: ' + valDeFrig(seed, m, rules) + 0', b: ' + 0',
    t: TCL, e: 'tAfara: cu val, minimul',
  },
  {
    n: 'valul de frig: fara rampa (plin de la 00:00)',
    f: CL, a: '  if (t < rampa) return Math.trunc((amp * t) / rampa) + 0', b: '  if (t < rampa) return amp',
    t: TCL, e: 'valul de frig: trapez in ziua lui',
  },
  {
    n: 'valul de frig: fara rampa inapoi (se opreste brusc la 21:00)',
    f: CL, a: '  if (t < sfarsit) return Math.trunc((amp * (sfarsit - t)) / rampa) + 0', b: '',
    t: TCL, e: 'valul de frig: trapez in ziua lui',
  },
  {
    n: 'valul de frig: in orice anotimp, in ziua cu acelasi numar',
    f: CL, a: ' || m.anotimp !== Anotimp.IARNA || ', b: ' || ',
    t: TCL, e: 'valul de frig: trapez in ziua lui',
  },
  {
    n: 'ziua valului fara ziMin (cade in prima zi a iernii sau inaintea ei)',
    f: CL, a: '  return v.ziMin + (hash2(an, SARE_VAL, seed) % (v.ziMax - v.ziMin + 1))', b: '  return hash2(an, SARE_VAL, seed) % (v.ziMax - v.ziMin + 1)',
    t: TCL, e: 'ziua valului: in [ziMin, ziMax]',
  },
  {
    n: 'ziua valului nu depinde de seed (aceeasi zi in fiecare lume)',
    f: CL, a: '  return v.ziMin + (hash2(an, SARE_VAL, seed) % (v.ziMax - v.ziMin + 1))', b: '  return v.ziMin + (hash2(an, SARE_VAL, 0) % (v.ziMax - v.ziMin + 1))',
    t: TCL, e: 'ziua valului: in [ziMin, ziMax]',
  },
  {
    n: 'ziua valului nu depinde de an (aceeasi zi in fiecare iarna)',
    f: CL, a: '  return v.ziMin + (hash2(an, SARE_VAL, seed) % (v.ziMax - v.ziMin + 1))', b: '  return v.ziMin + (hash2(0, SARE_VAL, seed) % (v.ziMax - v.ziMin + 1))',
    t: TCL, e: 'ziua valului: in [ziMin, ziMax]',
  },
  {
    n: 'valul de frig: in fiecare an in ziua anului 0 (consumatorul ignora anul; recenzia t.2a, L2-4)',
    f: CL, a: 'm.zi !== ziuaValului(seed, m.an, rules)', b: 'm.zi !== ziuaValului(seed, 0, rules)',
    t: TCL, e: 'valul de frig vine in ziua ANULUI lui',
  },

  // --- continutul: validarea sectiunilor noi ---
  {
    n: 'calendar/clima/termic: o cheie necunoscuta trece tacut',
    f: CO, a: '    if (!cunoscute.includes(key) && !alte.includes(key)) {', b: '    if (false) {',
    t: TCO, e: 'calendar, clima, termic: o cheie NECUNOSCUTA',
  },
  {
    n: 'calendar/clima/termic: un numar cu virgula trece (starea n-ar mai fi pe intregi)',
    f: CO,
    a: "    if (typeof v !== 'number' || !Number.isInteger(v)) return refuse(Reason.LIPSA_MATERIAL, { camp: `${sectiune}.${key}`",
    b: "    if (typeof v !== 'number') return refuse(Reason.LIPSA_MATERIAL, { camp: `${sectiune}.${key}`",
    t: TCO, e: 'clima: un numar cu virgula e refuzat',
  },
  {
    n: 'clima: tabelele din forma parsata nu se compara cu cele recalculate (un tabel atins e crezut)',
    f: CO, a: '  if (obj.tabele !== undefined) {', b: '  if (false) {',
    t: TCO, e: 'clima: tabelele solului sunt DERIVATE',
  },
  {
    n: 'valul de frig: rampa + platou + rampa pot trece de o zi',
    f: CO, a: '  if (2 * v.rampaOre! + v.platouOre! > 24) {', b: '  if (2 * v.rampaOre! + v.platouOre! > 25) {',
    t: TCO, e: 'clima.valFrig: rampa + platou',
  },
  {
    n: 'valul de frig: ziMax peste zilele anotimpului',
    f: CO, a: '  if (v.ziMin! > v.ziMax! || v.ziMax! > cal.zilePeAnotimp) {', b: '  if (v.ziMin! > v.ziMax!) {',
    t: TCO, e: 'clima.valFrig: rampa + platou',
  },
  {
    n: 'clima: ziua cea mai rece poate cadea dupa sfarsitul anului',
    f: CO, a: '  if (c.value.ziCeaMaiRece! >= zileAn) {', b: '  if (c.value.ziCeaMaiRece! > zileAn) {',
    t: TCO, e: 'clima.valFrig: rampa + platou',
  },
  {
    n: 'calendar: o zi fara un numar intreg de tickuri pe minut trece',
    f: CO, a: '  if (v.ziTicks! % MINUTE_PE_ZI !== 0) {', b: '  if (false) {',
    t: TCO, e: 'calendar: minutul e un numar intreg',
  },
  {
    n: 'calendar: ziua de start peste zilele anotimpului trece',
    f: CO, a: '  if (v.ziStart! > v.zilePeAnotimp!) {', b: '  if (false) {',
    t: TCO, e: 'calendar: minutul e un numar intreg',
  },
  {
    n: 'calendar: anotimpStart numeric in afara 0..3 trece',
    f: CO, a: "  } else if (typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < ANOTIMPURI) {", b: "  } else if (typeof a === 'number') {",
    t: TCO, e: 'calendar: minutul e un numar intreg',
  },
  {
    n: 'termic.material: lungimea tabloului neverificata',
    f: CO, a: "    if (raw.length !== NUME_MATERIALE.length) return refuse(Reason.VALOARE_INVALIDA, { camp: 'termic.material', lungime: raw.length, asteptat: NUME_MATERIALE.length })", b: '',
    t: TCO, e: 'termic.material: lungimea gresita',
  },
  {
    n: 'termic.material: R ≤ 0 pe un material solid trece (o usa fara rezistenta)',
    f: CO, a: "    if (v <= 0) return refuse(Reason.VALOARE_INVALIDA, { camp: `termic.material.${nume}`", b: "    if (v < 0) return refuse(Reason.VALOARE_INVALIDA, { camp: `termic.material.${nume}`",
    t: TCO, e: 'termic.material: fiecare material SOLID',
  },
  {
    n: 'termic.material: un material solid lipsa primeste tacut R = 0',
    f: CO, a: '    if (v === undefined) return refuse(Reason.LIPSA_MATERIAL, { camp: `termic.material.${nume}` })', b: '    if (v === undefined) { out[id] = 0; continue }',
    t: TCO, e: 'termic.material: fiecare material SOLID',
  },
  {
    n: 'termic: garda 6·g_max < 1 lipsa',
    f: CO, a: '    if (stanga >= dreapta) {', b: '    if (false) {',
    t: TCO, e: 'termic: garda 6·g_max < 1',
  },
  {
    n: 'termic: garda pe fata EXT veche (R_si min + R_se + R_min), nu pe MUCHIE',
    f: CO, a: '    const rFata = Math.min(2 * t.rSiLateralMiimi, t.rSiSusMiimi + t.rSiJosMiimi) + rMin', b: '    const rFata = Math.min(t.rSiLateralMiimi, t.rSiSusMiimi, t.rSiJosMiimi) + t.rSeMiimi + rMin',
    t: TCO, e: 'termic: garda 6·g_max < 1',
  },
  {
    n: 'termic: garda pe fata EXT veche — prinsa si de oracolul conductantaFetei',
    f: CO, a: '    const rFata = Math.min(2 * t.rSiLateralMiimi, t.rSiSusMiimi + t.rSiJosMiimi) + rMin', b: '    const rFata = Math.min(t.rSiLateralMiimi, t.rSiSusMiimi, t.rSiJosMiimi) + t.rSeMiimi + rMin',
    t: TCO, e: 'termic: garda == cea mai conductiva MUCHIE',
  },
  {
    n: 'termic: garda cu perechea R_si MAXIMA (muchia cea mai conductiva ratata)',
    f: CO, a: '    const rFata = Math.min(2 * t.rSiLateralMiimi, t.rSiSusMiimi + t.rSiJosMiimi) + rMin', b: '    const rFata = Math.max(2 * t.rSiLateralMiimi, t.rSiSusMiimi + t.rSiJosMiimi) + rMin',
    t: TCO, e: 'termic: garda 6·g_max < 1',
  },
  {
    n: 'termic: garda doar pe perechea laterala (perechea verticala minima ratata)',
    f: CO, a: '    const rFata = Math.min(2 * t.rSiLateralMiimi, t.rSiSusMiimi + t.rSiJosMiimi) + rMin', b: '    const rFata = 2 * t.rSiLateralMiimi + rMin',
    t: TCO, e: 'termic: garda 6·g_max < 1',
  },
  {
    n: 'termic: garda fara R_min (prea stricta)',
    f: CO, a: '    const rFata = Math.min(2 * t.rSiLateralMiimi, t.rSiSusMiimi + t.rSiJosMiimi) + rMin', b: '    const rFata = Math.min(2 * t.rSiLateralMiimi, t.rSiSusMiimi + t.rSiJosMiimi)',
    t: TCO, e: 'termic: garda 6·g_max < 1',
  },
  {
    n: 'termic: garda cu ziua fixa (pasul nu se mai scaleaza cu ziTicks)',
    f: CO, a: '    const dreapta = BigInt(r.calendar.ziTicks) * BigInt(t.cAerJPeK) * BigInt(rFata)', b: '    const dreapta = 40320n * BigInt(t.cAerJPeK) * BigInt(rFata)',
    t: TCO, e: 'termic: garda 6·g_max < 1',
  },
  {
    n: 'DEFAULT_RULES: lemnul izoleaza mai bine decat pamantul (R 900 > 850)',
    f: CO, a: '    material: [0, 340, 850, 850, 0, 500, 590, 2000, 590, 300],', b: '    material: [0, 340, 850, 850, 0, 900, 590, 2000, 590, 300],',
    t: TCO, e: 'nicio celula construita nu izoleaza',
  },

  // --- testul pe TOT obiectul (panoul, L4-5): fisierul diverge de DEFAULT_RULES ---
  {
    n: 'rules.json: clima.tMedieMc 9401 (jocul ruleaza pe DEFAULT_RULES, fisierul spune altceva)',
    f: RJ, a: '    "tMedieMc": 9400,', b: '    "tMedieMc": 9401,',
    t: TCO, e: 'fisierul de reguli si DEFAULT_RULES dau ACELASI obiect',
  },
  {
    n: 'rules.json: nevoiTicks 251 (mutatia panoului, verde inainte pe 128 de teste)',
    f: RJ, a: '  "nevoiTicks": 250,', b: '  "nevoiTicks": 251,',
    t: TCO, e: 'fisierul de reguli si DEFAULT_RULES dau ACELASI obiect',
  },
  {
    n: 'rules.json: termic.material.USA 299',
    f: RJ, a: '      "USA": 300', b: '      "USA": 299',
    t: TCO, e: 'fisierul de reguli si DEFAULT_RULES dau ACELASI obiect',
  },

  // --- scanerul de disciplina (panoul, L4-7; recenzia t.2a, L2-1: Math si ** pe AST, comentariile din trivia) ---
  {
    n: 'scanerul: Math.cos in lista alba',
    f: SC, a: "'fround', 'sqrt',", b: "'fround', 'sqrt', 'cos',",
    t: TD, e: 'checker-ul PRINDE functiile transcendente',
  },
  {
    n: 'scanerul: operatorul ** permis',
    f: SC, a: 'if (ts.isBinaryExpression(node) && (', b: 'if (false && ts.isBinaryExpression(node) && (',
    t: TD, e: 'checker-ul PRINDE functiile transcendente',
  },
  {
    n: 'scanerul: Math.random in lista alba (Math?.random() si aliasul ar trece)',
    f: SC, a: "'fround', 'sqrt',", b: "'fround', 'sqrt', 'random',",
    t: TD, e: 'checker-ul chiar PRINDE o incalcare',
  },
  {
    n: 'scanerul: Math judecat doar dupa numele membrului (aliasul, destructurarea si indexarea trec)',
    f: SC, a: '      if (!tip && !(nume && MATH_PERMIS.has(nume))) {', b: '      if (!tip && nume !== null && !MATH_PERMIS.has(nume)) {',
    t: TD, e: 'checker-ul PRINDE ocolirile',
  },
  {
    n: 'scanerul: comentariile citite doar la pos/end de nod (f(/* x */) ramane cod)',
    f: SC, a: 'const kids = n.getChildren(sf)\n    if (kids.length === 0) { sterge(n.pos); return }\n    for (const c of kids) frunze(c)', b: 'sterge(n.pos); sterge(n.end); ts.forEachChild(n, frunze)',
    t: TD, e: 'checker-ul PRINDE ocolirile',
  },
  {
    n: "scanerul: comentariile din indexOf('/*') pe linii (un '/*' dintr-un sir orbeste regulile)",
    f: SC, a: "  return { sf, lines: ch.join('').split(/\\r?\\n/) }",
    b: "  let inB = false\n  return { sf, lines: text.split(/\\r?\\n/).map((line) => { let out = ''; let i = 0; while (i < line.length) { if (inB) { const e = line.indexOf('*/', i); if (e === -1) return out; inB = false; i = e + 2; continue } const lc = line.indexOf('//', i); const bs = line.indexOf('/*', i); if (lc !== -1 && (bs === -1 || lc < bs)) return out + line.slice(i, lc); if (bs !== -1) { out += line.slice(i, bs); inB = true; i = bs + 2; continue } return out + line.slice(i) } return out }) }",
    t: TD, e: 'checker-ul PRINDE ocolirile',
  },
  {
    n: 'joburi: puterile scorului din 3, nu din 2 (inlocuitorul lui ** nu e exact)',
    f: 'src/sim/joburi.ts', a: '  for (let k = 1; k <= 52; k++) t.push(t[k - 1]! * 2)', b: '  for (let k = 1; k <= 52; k++) t.push(t[k - 1]! * 3)',
    t: 'tests/joburi.test.ts', e: 'scor: +1 nivel de prioritate merita EXACT jumatate',
  },

  // --- bara de sus (design §6) ---
  {
    n: 'bara de sus: minus de cratima in loc de minusul tipografic',
    f: TX, a: '  return g < 0 ? `−${-g}°` : `${g}°`', b: '  return g < 0 ? `-${-g}°` : `${g}°`',
    t: TB, e: 'textGrade: grade intregi',
  },
  {
    n: 'bara de sus: sageata fara prag (tremura la varful si in valea zilei)',
    f: TX, a: "  if (deltaQ16 >= PRAG_TENDINTA_Q16) return '↗'", b: "  if (deltaQ16 > 0) return '↗'",
    t: TB, e: 'textTendinta: un sfert de grad',
  },
  {
    n: 'bara de sus: ora fara zero in fata (8:00 in loc de 08:00, latimea sare)',
    f: TX, a: "  const ora = `${String(m.ora).padStart(2, '0')}:", b: '  const ora = `${String(m.ora)}:',
    t: TB, e: 'bara de sus: „Toamnă 2/4',
  },
  {
    n: 'tooltip-ul calendarului: in iarna tot „Iarna în …" (pana la iarna de la anul)',
    f: TX, a: '  const iarna = p.moment.anotimp === Anotimp.IARNA', b: '  const iarna = false',
    t: TB, e: 'tooltip-ul calendarului',
  },
  {
    n: 'tooltip-ul calendarului: minutele reale ignora viteza',
    f: TX, a: '  const reale = textMinuteReale(t / p.ticksPerSecond / p.viteza / 60)', b: '  const reale = textMinuteReale(t / p.ticksPerSecond / 60)',
    t: TB, e: 'tooltip-ul calendarului',
  },
  {
    n: 'tooltip-ul calendarului: zilele rotunjite in sus („Iarna în 4 zile" la start)',
    f: TX, a: '  const zile = Math.floor(tickuri / ziTicks)', b: '  const zile = Math.ceil(tickuri / ziTicks)',
    t: TB, e: 'textPesteZile si textMinuteReale',
  },
  // --- compunerea barei: o singura functie, baraDeSus (recenzia t.2a, L2-3: testul copia compunerea din panouri.ts) ---
  {
    n: 'bara de sus: sageata inversata (acum − peste o ora)',
    f: TX, a: '    text: textCalendar(m, rules.calendar.zilePeAnotimp, acum, pesteOra - acum),', b: '    text: textCalendar(m, rules.calendar.zilePeAnotimp, acum, acum - pesteOra),',
    t: TB, e: 'bara de sus: „Toamnă 2/4',
  },
  {
    n: 'tooltip-ul calendarului: in iarna, socotit pana la URMATOAREA iarna',
    f: TX, a: '      panaLaPrimavara: panaLaAnotimp(tick, Anotimp.PRIMAVARA, rules),', b: '      panaLaPrimavara: panaLaAnotimp(tick, Anotimp.IARNA, rules),',
    t: TB, e: 'tooltip-ul calendarului',
  },
  {
    n: 'bara de sus: clima altei lumi (seed 0: valul de frig in alta zi)',
    f: TX, a: '  const acum = tAfara(seed, tick, rules)', b: '  const acum = tAfara(0, tick, rules)',
    t: TB, e: 'bara de sus: „Toamnă 2/4',
  },
  // --- insignele barei (recenzia t.2a, L4-6: cinci insigne scoteau butoanele de viteza din fereastra) ---
  {
    n: 'insignele: fara pliere (cinci insigne scot butoanele de viteza din bara)',
    f: MO, a: '  if (ins.length <= insigneDespliate(latimeCss)) return ins\n', b: '  return ins\n',
    t: TB, e: 'bara de sus: insignele',
  },
  {
    n: 'insignele: doua despliate la 1.100 px (in cazul cel mai rau ies cu 53 px)',
    f: MO, a: '  return latimeCss >= 1280 ? 3 : 1', b: '  return latimeCss >= 1280 ? 3 : 2',
    t: TB, e: 'bara de sus: insignele',
  },
  {
    n: 'insignele: una singura si pe ecranele late (pragul de 1.280 ignorat)',
    f: MO, a: '  return latimeCss >= 1280 ? 3 : 1', b: '  return 1',
    t: TB, e: 'bara de sus: insignele',
  },
  {
    n: 'insigna pliata: rosul pierdut (o alerta critica ascunsa intr-un „N alerte" portocaliu)',
    f: MO, a: "clasa: ins.some((x) => x.clasa === 'critic') ? 'critic' : 'atentie'", b: "clasa: 'atentie'",
    t: TB, e: 'bara de sus: insignele',
  },
]
