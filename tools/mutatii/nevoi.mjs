/**
 * Mutatii: Taietura 3: nevoile (foame, odihna) si dispozitia.
 *
 * 31 de probe. Fiecare intrare: `n` numele, `f` fisierul, `a` tiparul cautat,
 * `b` cu ce se inlocuieste, `t` fisierul de teste care trebuie sa se inroseasca,
 * `e` inceputul numelui testului care trebuie sa pice. `e2` adauga editari.
 *
 * Tiparele se ancoreaza pe o linie UNICA, si de preferat una din CORPUL unei
 * functii, nu doar pe antetul ei: un tipar care se potriveste in doua locuri
 * otraveste primul, adica alta garda decat cea vizata, si „trece" fiindca strica
 * altceva. S-a intamplat.
 */

export const MUTATII = [
  // --- nevoile ---
  {
    n: 'nevoile pornesc toate la maxim (fara defazare)',
    f: 'src/sim/state.ts',
    a: '  return nevoieMax - (Math.abs(id * fazaPas + nevoie * 311) % fazaSpan)',
    b: '  void id\n  void fazaPas\n  void fazaSpan\n  void nevoie\n  return nevoieMax',
    t: 'tests/nevoi.test.ts', e: 'un pion se naste SATUL',
  },
  {
    n: 'un pion se naste cu nevoile la ZERO',
    f: 'src/sim/commands.ts',
    a: '        a.nevoi[slot * NEVOI + n] = nevoiaInitiala(id, n, rules.nevoieMax, rules.nevoieFazaPas, rules.nevoieFazaSpan)',
    b: '        a.nevoi[slot * NEVOI + n] = 0',
    t: 'tests/nevoi.test.ts', e: 'un pion se naste SATUL',
  },
  {
    n: 'pragurile se verifica doar la ticul de nevoie',
    f: 'src/sim/agents.ts',
    a: '      if ((w.tick + a.id[i]!) % rules.nevoiTicks === 0) scurgeNevoile(w, rules, i)\n      if (verificaNevoi(w, rules, i)) {',
    b: '      if ((w.tick + a.id[i]!) % rules.nevoiTicks === 0) scurgeNevoile(w, rules, i)\n      if ((w.tick + a.id[i]!) % rules.nevoiTicks === 0 && verificaNevoi(w, rules, i)) {',
    t: 'tests/nevoi.test.ts', e: 'foamea CRITICA intrerupe',
  },
  {
    n: 'jobul de nevoie se auto-intrerupe (fara „deja o rezolv")',
    f: 'src/sim/joburi.ts',
    a: '    if (a.jobKind[slot] === FEL_PENTRU_NEVOIE[n]) return true\n',
    b: '',
    t: 'tests/nevoi.test.ts', e: 'jobul de mancat NU se auto-intrerupe',
  },
  {
    n: 'nevoia nerezolvabila NU primeste racire',
    f: 'src/sim/joburi.ts',
    a: '    a.nevoieReincercaLaTick[baza + n] = w.tick + rules.nevoieRetryTicks\n',
    b: '',
    t: 'tests/nevoi.test.ts', e: 'un pion nu mananca dintr-un morman NECOMESTIBIL',
  },
  {
    n: 'si un carat cu mana plina se intrerupe pentru nevoi',
    f: 'src/sim/joburi.ts',
    a: '  return !(a.jobKind[slot] === FelJob.CARA && a.jobStep[slot]! >= PasCara.MERGE_DEST)',
    b: '  void a\n  return true',
    t: 'tests/nevoi.test.ts', e: 'un pion cu marfa in mana NU se intrerupe',
  },
  {
    n: 'pragul de preferinta intrerupe si el jobul',
    f: 'src/sim/joburi.ts',
    a: '    const critic = v < spec.pragCritic',
    b: '    const critic = v < spec.prag',
    t: 'tests/nevoi.test.ts', e: 'foamea sub prag (nu critica) NU intrerupe',
  },
  {
    n: 'nutritia e pe MORMAN, nu pe unitate',
    f: 'src/sim/joburi.ts',
    a: '  a.nevoi[baza] = Math.min(rules.nevoieMax, a.nevoi[baza]! + luat * rules.nutritie[fel]!)',
    b: '  a.nevoi[baza] = Math.min(rules.nevoieMax, a.nevoi[baza]! + rules.nutritie[fel]!)',
    t: 'tests/nevoi.test.ts', e: 'un pion flamand cauta mancare',
  },
  {
    n: 'odihna se reface si pe drumul spre pat',
    f: 'src/sim/joburi.ts',
    a: '    if (n === Nevoie.ODIHNA && a.jobKind[slot] === FelJob.DOARME && !pasDeMers(a.jobStep[slot]!)) {',
    b: '    if (n === Nevoie.ODIHNA && a.jobKind[slot] === FelJob.DOARME) {',
    t: 'tests/nevoi.test.ts', e: 'somnul REFACE odihna doar cand pionul chiar doarme',
  },
  {
    n: 'migrarea 4 -> 5 umple nevoile cu ZERO',
    f: 'src/sim/save.ts',
    a: '          : nevoiaInitiala(agents.id[i]!, n, rules.nevoieMax, rules.nevoieFazaPas, rules.nevoieFazaSpan)',
    b: '          : 0',
    t: 'tests/nevoi.test.ts', e: 'migrarea 4 -> 5',
  },
  {
    n: 'migrarea 4 -> 5 umple nevoile in LOCKSTEP',
    f: 'src/sim/save.ts',
    a: '          : nevoiaInitiala(agents.id[i]!, n, rules.nevoieMax, rules.nevoieFazaPas, rules.nevoieFazaSpan)',
    b: '          : rules.nevoieMax',
    t: 'tests/nevoi.test.ts', e: 'migrarea 4 -> 5',
  },
  {
    n: 'indexul de comestibile include orice morman',
    f: 'src/sim/zone.ts',
    a: '    if (rules.nutritie[it.kind[i]!]! > 0) ix.comestibile.push(i)',
    b: '    ix.comestibile.push(i)',
    t: 'tests/nevoi.test.ts', e: 'indexul de comestibile vede DOAR mancarea',
  },
  {
    n: 'invariantul „macar un fel comestibil" scos',
    f: 'src/sim/content.ts',
    a: "  if (!r.nutritie.some((n) => n > 0)) {\n    return refuse(Reason.VALOARE_INVALIDA, { camp: 'nutritie', motiv: 'niciun fel de item nu e comestibil' })\n  }\n",
    b: '',
    t: 'tests/nevoi.test.ts', e: 'regulile refuza o lume in care foamea',
  },
  {
    n: 'invariantul de defazare initiala scos',
    f: 'src/sim/content.ts',
    a: '    if (celMaiJos <= r.nevoi[n]!.prag) {',
    b: '    if (false && celMaiJos <= r.nevoi[n]!.prag) {',
    t: 'tests/nevoi.test.ts', e: 'regulile refuza praguri inversate',
  },

  // --- dispozitia ---
  {
    n: 'optimismul de inceput NU se acorda la nastere',
    f: 'src/sim/commands.ts',
    a: '      if (rules.ganduri[Gand.OPTIMISM_INITIAL]!.durata > 0) {',
    b: '      if (false && rules.ganduri[Gand.OPTIMISM_INITIAL]!.durata > 0) {',
    t: 'tests/dispozitie.test.ts', e: 'un pion se naste la baza',
  },
  {
    n: 'pragul si criticul aceleiasi nevoi se ADUNA',
    f: 'src/sim/joburi.ts',
    a: '    else if (v < spec.prag) t += rules.ganduri[par.prag]!.valoare',
    b: '    if (v < spec.prag) t += rules.ganduri[par.prag]!.valoare',
    t: 'tests/dispozitie.test.ts', e: 'tinta scade cu foamea',
  },
  {
    n: 'pasul barei NU se limiteaza la distanta ramasa',
    f: 'src/sim/joburi.ts',
    a: '  const pas = Math.min(rata, Math.abs(tinta - bara))',
    b: '  const pas = rata',
    t: 'tests/dispozitie.test.ts', e: 'bara urmareste tinta lent',
  },
  {
    n: 'bara se misca si in somn',
    f: 'src/sim/joburi.ts',
    a: '  if (a.jobKind[slot] === FelJob.DOARME && !pasDeMers(a.jobStep[slot]!)) return\n  const tinta = tintaDispozitiei(w, rules, slot)',
    b: '  const tinta = tintaDispozitiei(w, rules, slot)',
    t: 'tests/dispozitie.test.ts', e: 'bara NU se misca in somn',
  },
  {
    n: 'podeaua de munca e pe FACTOR, nu pe rezultat',
    f: 'src/sim/joburi.ts',
    a: '  return Math.max(1, Math.floor((rules.workUnitsPerTick * m) / 1000))',
    b: '  return Math.floor((rules.workUnitsPerTick * m) / 1000)',
    t: 'tests/dispozitie.test.ts', e: 'productivitatea urmeaza dispozitia',
  },
  {
    n: 'invariantul workUnitsPerTick x multiplicatorMin scos',
    f: 'src/sim/content.ts',
    a: '  if (r.workUnitsPerTick * r.multiplicatorMin < 1000) {',
    b: '  if (false && r.workUnitsPerTick * r.multiplicatorMin < 1000) {',
    t: 'tests/dispozitie.test.ts', e: 'regulile REFUZA un continut la care un pion nefericit',
  },
  {
    n: 'ratiunea NU se scrie la refuzul muncii',
    f: 'src/sim/agents.ts',
    a: '        w.ratiune.stare[i] = StareRatiune.REFUZA_MUNCA',
    b: '        void StareRatiune',
    t: 'tests/dispozitie.test.ts', e: 'sub pragul de refuz',
  },
  {
    n: 'plecarea nu se NUMARA',
    f: 'src/sim/joburi.ts',
    a: '  w.plecatiTotal++',
    b: '  void w',
    t: 'tests/dispozitie.test.ts', e: 'sub pragul de plecare',
  },
  {
    n: 'plecarea nu elibereaza rezervarile si nu lasa marfa',
    f: 'src/sim/joburi.ts',
    a: '  terminaJob(w, rules, slot, Sfarsit.INTRERUPT)\n  a.alive[slot] = 0\n  a.hasGoal[slot] = 0',
    b: '  void rules\n  a.alive[slot] = 0\n  a.hasGoal[slot] = 0',
    t: 'tests/dispozitie.test.ts', e: 'sub pragul de plecare',
  },
  {
    n: 'invariantul „catalogul atinge pragul de plecare" scos',
    f: 'src/sim/content.ts',
    a: '  if (minim > r.dispozitiePragPlecare) {',
    b: '  if (false && minim > r.dispozitiePragPlecare) {',
    t: 'tests/dispozitie.test.ts', e: 'regulile REFUZA un catalog de ganduri',
  },
  {
    n: 'ordinea pragurilor de dispozitie nu se verifica',
    f: 'src/sim/content.ts',
    a: '  if (!(r.dispozitiePragPlecare < r.dispozitiePragAvertisment && r.dispozitiePragAvertisment < r.dispozitiePragRefuz && r.dispozitiePragRefuz < r.dispozitieBaza && r.dispozitieBaza <= r.dispozitieMax)) {',
    b: '  if (false) {',
    t: 'tests/dispozitie.test.ts', e: 'regulile REFUZA praguri de dispozitie',
  },
  {
    n: 'evictia gandurilor ia termenul cel mai MARE',
    f: 'src/sim/state.ts',
    a: '    if (a.gandPanaLa[baza + i]! < a.gandPanaLa[baza + celMaiVechi]!) celMaiVechi = i',
    b: '    if (a.gandPanaLa[baza + i]! > a.gandPanaLa[baza + celMaiVechi]!) celMaiVechi = i',
    t: 'tests/dispozitie.test.ts', e: 'evictia gandurilor ia termenul cel mai MIC',
  },
  {
    n: 'acelasi gand ocupa un al doilea slot',
    f: 'src/sim/state.ts',
    a: '    if (a.gandFel[baza + i] === fel) { a.gandPanaLa[baza + i] = panaLa; return }\n    if (liber === -1 && (a.gandFel[baza + i] === 0 || a.gandPanaLa[baza + i]! <= tick)) liber = i\n    if (a.gandPanaLa[baza + i]! < a.gandPanaLa[baza + celMaiVechi]!) celMaiVechi = i\n  }\n  const i = liber === -1 ? celMaiVechi : liber\n  a.gandFel[baza + i] = fel\n  a.gandPanaLa[baza + i] = panaLa\n}',
    b: '    if (liber === -1 && (a.gandFel[baza + i] === 0 || a.gandPanaLa[baza + i]! <= tick)) liber = i\n    if (a.gandPanaLa[baza + i]! < a.gandPanaLa[baza + celMaiVechi]!) celMaiVechi = i\n  }\n  const i = liber === -1 ? celMaiVechi : liber\n  a.gandFel[baza + i] = fel\n  a.gandPanaLa[baza + i] = panaLa\n}',
    t: 'tests/dispozitie.test.ts', e: 'acelasi fel de gand isi REINNOIESTE',
  },
  {
    n: 'un save cu prea multe sloturi de gand e acceptat tacut',
    f: 'src/sim/save.ts',
    a: '    if (k > agents.ganduriSloturi) {',
    b: '    if (false && k > agents.ganduriSloturi) {',
    t: 'tests/dispozitie.test.ts', e: 'un save cu MAI MULTE sloturi de gand',
  },
  {
    n: 'migrarea 5 -> 6 pune dispozitia la ZERO',
    f: 'src/sim/save.ts',
    a: '    for (let i = 0; i < count; i++) agents.dispozitie[i] = disp ? disp[i]! : rules.dispozitieBaza',
    b: '    for (let i = 0; i < count; i++) agents.dispozitie[i] = disp ? disp[i]! : 0',
    t: 'tests/dispozitie.test.ts', e: 'migrarea 5 -> 6',
  },
  {
    n: 'dispozitia nu intra in hash',
    f: 'src/sim/hash.ts',
    a: '  h.ints(a.dispozitie, a.count)',
    b: '',
    t: 'tests/dispozitie.test.ts', e: 'dispozitia, gandurile si plecatii intra in hash',
  },
  {
    n: 'nevoile nu intra in hash',
    f: 'src/sim/hash.ts',
    a: '  h.ints(a.nevoi, a.count * NEVOI)\n',
    b: '',
    t: 'tests/nevoi.test.ts', e: 'nevoile intra in hash',
  },
]
