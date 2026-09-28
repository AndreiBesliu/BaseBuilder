/**
 * Mutatii: reparatiile recenziei de cod a UI-ului (28.09). Fiecare proba pune la loc DEFECTUL gasit de
 * lentile (id-ul din DEVLOG) si cere sa se inroseasca exact testul scris pentru reparatie. Reparatiile
 * din main.ts (interactiunea: INT-2..9, V3, V4) nu se pot proba in node; pe ele le leaga
 * bench/ui-fum.mjs, rulat o data si pe codul vechi (toate bifele lor rosii acolo, DEVLOG).
 */

const PUR = 'tests/viewer-ui.test.ts'
const LUME = 'tests/viewer-ui-lume.test.ts'
const REC = 'tests/viewer-ui-recenzie.test.ts'

export const MUTATII = [
  // --- MOD-1: mormanele fara depozit, o singura functie ---
  {
    n: 'MOD-1: cu indexul murdar, o celula de depozit goala nu mai conteaza (alerta ramane cat se cara)',
    f: 'src/sim/zone.ts',
    a: '      return !celulaGoala && it.ultimulMotiv[i] === codMotiv(Reason.FARA_DEPOZIT)',
    b: '      return it.ultimulMotiv[i] === codMotiv(Reason.FARA_DEPOZIT)',
    t: REC, e: 'MOD-1: depozit cu loc',
  },
  {
    n: 'MOD-1: cu indexul la zi, orice morman de pe jos e „fara depozit" (si cele care au unde merge)',
    f: 'src/sim/zone.ts',
    a: '      if (deMutat !== null) return !deMutat.has(i)',
    b: '      if (deMutat !== null) return true',
    t: REC, e: 'MOD-1: depozit cu loc',
  },
  {
    n: 'MOD-1: inspectorul nu mai intreaba de depozit (inapoi la „Pe jos: așteaptă un cărăuș")',
    f: 'viewer/ui/model.ts',
    a: '  if (vedere.esteFaraDepozit(is)) {',
    b: '  if (false) {',
    t: REC, e: 'MOD-1/MOD-5: doar un loc de dormit',
  },
  {
    n: 'MOD-1: alerta spune „niciun depozit" cand depozitele sunt doar pline',
    f: 'viewer/ui/model.ts',
    a: '    ? { activ: true, text: vedere.depozite === 0 ? `',
    b: '    ? { activ: true, text: vedere.depozite !== 0 ? `',
    t: REC, e: 'MOD-1: depozitul plin',
  },
  // --- MOD-5: un loc de dormit nu e depozit ---
  {
    n: 'MOD-5: bara de sus numara orice zona drept depozit (si locul de dormit)',
    f: 'viewer/ui/model.ts',
    a: '    if (prioritateaLocului(w.zone, it.wx[i]!, it.wy[i]!, it.z[i]!) > 0) m.inDepozit += it.cantitate[i]!',
    b: '    if (celulaDeZonaLa(w.zone, it.wx[i]!, it.wy[i]!, it.z[i]!) !== -1) m.inDepozit += it.cantitate[i]!',
    t: REC, e: 'MOD-5: un loc de dormit nu e depozit',
  },
  // --- MOD-2: construit fara loc de lucru ---
  {
    n: 'MOD-2: groapa si etajul primesc actiunile inversate',
    f: 'viewer/ui/model.ts',
    a: "    actiune: groapa ? 'Sapă lângă ea, de sus în jos.' : `Pune o treaptă sau o scară lângă ea, cel mult ${cifre.atingereSusM} m sub ea.`,",
    b: "    actiune: !groapa ? 'Sapă lângă ea, de sus în jos.' : `Pune o treaptă sau o scară lângă ea, cel mult ${cifre.atingereSusM} m sub ea.`,",
    t: REC, e: 'MOD-2: piesa de etaj',
  },
  {
    n: 'MOD-2: piesa de construit primeste iar textul sapaturii („Sapă de sus în jos")',
    f: 'viewer/ui/model.ts',
    a: '    const t = construieste && cod === Reason.INACCESIBIL && d.ultimulMotivDetaliu[ds] === DetaliuMotiv.FARA_LOC_DE_LUCRU',
    b: '    const t = false && construieste && cod === Reason.INACCESIBIL && d.ultimulMotivDetaliu[ds] === DetaliuMotiv.FARA_LOC_DE_LUCRU',
    t: REC, e: 'MOD-2: piesa de etaj',
  },
  // --- MOD-3: blocate ---
  {
    n: 'MOD-3: „blocate" cere iar racirea (lipsa de piatra si o lucrare de neatins nu mai aprind)',
    f: 'viewer/ui/model.ts',
    a: '    if (cod !== Reason.LIPSA_MATERIAL && d.reincercaLaTick[i]! + 2 * rules.jobRescanTicks <= w.tick) continue',
    b: '    if (d.reincercaLaTick[i]! <= w.tick) continue',
    t: REC, e: 'MOD-3: lipsa de piatra',
  },
  // --- MOD-4: dorm-pe-jos pe cauza ---
  {
    n: 'MOD-4: cu paturi cat oameni, alerta tot cere sa mareasca locul de dormit',
    f: 'viewer/ui/model.ts',
    a: '      : paturi < r.colonisti',
    b: '      : paturi <= r.colonisti',
    t: REC, e: 'MOD-4: „dorm-pe-jos"',
  },
  // --- MOD-6 / MOD-7: textele ---
  {
    n: 'MOD-6: pionul fara depozit primeste iar textul mormanului',
    f: 'viewer/ui/texte.ts',
    a: "    case Reason.FARA_DEPOZIT: return 'Stă: marfa de cărat n-are unde fi dusă — pictează sau mărește un depozit'",
    b: "    case Reason.FARA_DEPOZIT: return 'Stă: nu are unde fi dus'",
    t: REC, e: 'MOD-6/MOD-7: „Stă:"',
  },
  {
    n: 'MOD-7: „de" doar peste 20 (sutele rotunde pierd „de": „100 oameni")',
    f: 'viewer/ui/texte.ts',
    a: '  const de = Math.abs(Math.trunc(n)) >= 20 && (r === 0 || r >= 20)',
    b: '  const de = Math.abs(Math.trunc(n)) >= 20 && r >= 20',
    t: PUR, e: 'texte: acordul numeralelor',
  },
  {
    n: 'MOD-7: toastul zonei fara acord („576 celule de zonă")',
    f: 'viewer/ui/dreptunghi.ts',
    a: "    : unealta === Unealta.ZONA ? cant(n, 'celule de zonă') : `${n} desemnate`",
    b: "    : unealta === Unealta.ZONA ? `${n} celule de zonă` : `${n} desemnate`",
    t: PUR, e: 'dreptunghi: textul toastului',
  },
  // --- MOD-8, MOD-9, MOD-10 ---
  {
    n: 'MOD-8: golirea fara hrana deloc nu mai e „foamea"',
    f: 'viewer/ui/model.ts',
    a: "  return prognozaHrana(w, rules).puncte <= 0 ? 'hrana' : 'plecati'",
    b: "  return prognozaHrana(w, rules).puncte < 0 ? 'hrana' : 'plecati'",
    t: REC, e: 'MOD-8: cauza golirii',
  },
  {
    n: 'MOD-9: mormanul luat de un constructor e iar „în drum spre depozit"',
    f: 'viewer/ui/model.ts',
    a: "    return { titlu: constructor ? `Luat pentru construit",
    b: "    return { titlu: constructor && false ? `Luat pentru construit",
    t: REC, e: 'MOD-9: un morman',
  },
  {
    n: 'MOD-10: insigna „flămânzi" ii numara si pe cei care mananca',
    f: 'viewer/ui/model.ts',
    a: '    if (a.jobKind[i] !== FelJob.MANANCA && a.nevoi[i * NEVOI + Nevoie.FOAME]! < rules.nevoi[Nevoie.FOAME]!.prag) flamanzi++',
    b: '    if (a.nevoi[i * NEVOI + Nevoie.FOAME]! < rules.nevoi[Nevoie.FOAME]!.prag) flamanzi++',
    t: REC, e: 'MOD-10: insignele',
  },
  // --- T-04: garda „modelul nu scrie in World" vede si ramurile de construcție ---
  {
    n: 'T-04: ramura „așteaptă" scrie in lume (memoria sprijinului, ca `sustinutAcumMemorat`)',
    f: 'viewer/ui/model.ts',
    a: '    if (previz.construibile.has(k) && !sustinutAcum(w.terrain, rules, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, null)) {',
    b: '    if (previz.construibile.has(k) && !sustinutAcum(w.terrain, rules, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, null) && (w.desemnari.editariConstr++, true)) {',
    t: LUME, e: 'model: nu scrie in World',
  },
  {
    n: 'T-04: bucla „blocate" scrie in lume',
    f: 'viewer/ui/model.ts',
    a: '    blocate++\n',
    b: '    blocate++; w.desemnari.editariConstr++\n',
    t: LUME, e: 'model: nu scrie in World',
  },
  // --- INT-1: salvarea automata, T-13 ---
  {
    n: 'INT-1: demo-ul de sub titlu se salveaza iar singur',
    f: 'viewer/ui/salvari-plic.ts',
    a: "  return mod === 'joc-nou' || mod === 'incarca'",
    b: "  return mod !== 'verificare' && mod !== 'gate'",
    t: PUR, e: 'salvari: doar jocul jucatorului',
  },
  {
    n: 'INT-1: un singur slot automat pentru toate lumile (un joc nou il scrie peste altul)',
    f: 'viewer/ui/salvari-plic.ts',
    a: '  return `${ID_AUTOMATA}-${seed}`',
    b: '  return ID_AUTOMATA',
    t: PUR, e: 'salvari: doar jocul jucatorului',
  },
  {
    n: 'T-13: CELULA_OCUPATA promite iar o reincercare pe care n-o face nimeni',
    f: 'viewer/ui/texte.ts',
    a: "    case Reason.CELULA_OCUPATA: return { titlu: 'Cineva stă chiar acolo.', actiune: 'Încearcă din nou după ce pleacă.' }",
    b: "    case Reason.CELULA_OCUPATA: return { titlu: 'Cineva stă chiar acolo.', actiune: 'Se face după ce pleacă.' }",
    t: PUR, e: 'texte: CELULA_OCUPATA',
  },
  // --- INT-10: modul de verificare tinteste ca la 3613652 ---
  {
    n: 'INT-10: Z fara UI picteaza iar pe aerul de deasupra fetei',
    f: 'viewer/tinta.ts',
    a: "    return v === null ? faraTinta(q) : { ok: true, ...celulaLangaFata(v, -1), sursa: 'fata' }",
    b: "    return v === null ? faraTinta(q) : { ok: true, ...celulaLangaFata(v, 1), sursa: 'fata' }",
    t: PUR, e: 'tinta: fara UI (verificare)',
  },
  {
    n: 'INT-10: Ctrl fara cub, fara UI, ia solidul si cand e aleasa o piesa',
    f: 'viewer/tinta.ts',
    a: "    return alegeTinta({ ...q, mod: q.caAzi.cuPiesa ? 'piesa' : 'sapa', caAzi: undefined })",
    b: "    return alegeTinta({ ...q, mod: 'sapa', caAzi: undefined })",
    t: PUR, e: 'tinta: fara UI (verificare)',
  },
]
