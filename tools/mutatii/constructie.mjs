/**
 * Mutatii: S20-23, taietura 2 — constructia.
 *
 * Pasul 1 (poarta pe felul desemnarii) e singurul livrat deocamdata. Probele lui
 * exista de pe acum dintr-un motiv pe care panoul de design l-a masurat: pana la
 * poarta, `cautaJob` nu citea niciodata `d.kind`, si o desemnare de alt fel era
 * luata ca job de SAPAT si stearsa. Cele 29 de probe ale taieturii 1 n-aveau cum
 * s-o vada — nu exista al doilea fel.
 *
 * E aceeasi lectie ca la recenzia taieturii 1, din partea cealalta: o mutatie
 * probeaza ce ating fixturile. Poarta asta a avut nevoie de un FEL nou ca sa
 * poata fi probata, si de-aia `Desemnare.CONSTRUIESTE` exista in cod inainte sa
 * existe o piesa.
 */

export const MUTATII = [
  {
    n: 'poarta pe fel scoasa: orice desemnare e luata ca job de SAPAT',
    f: 'src/sim/joburi.ts',
    a: '      if (d.kind[s] !== Desemnare.SAPA) continue',
    b: '      if (d.kind[s] === -1) continue',
    t: 'tests/constructie.test.ts', e: 'o desemnare care NU e de sapat',
  },
  {
    n: 'poarta mutata in trecerea SCUMPA (candidatii de alt fel mananca plafonul)',
    f: 'src/sim/joburi.ts',
    a: '      if (d.kind[s] !== Desemnare.SAPA) continue\n      raport.vizite++',
    b: '      raport.vizite++',
    t: 'tests/constructie.test.ts', e: 'o desemnare care NU e de sapat',
  },
  {
    n: '`seSapaLa` nu se uita la fel: orice desemnare blocheaza locul de lucru',
    f: 'src/sim/desemnari.ts',
    a: '  return slot !== undefined && d.kind[slot] === Desemnare.SAPA',
    b: '  return slot !== undefined',
    t: 'tests/constructie.test.ts', e: 'podeaua unei desemnari de CONSTRUIT',
  },

  // --- pasul 2: schema 7 ---
  {
    n: 'felul si piesa nu se verifica la incarcare (santinela devine decorativa)',
    f: 'src/sim/save.ts',
    a: '    if (eConstructie !== (felPiesa !== Piesa.NICIUNA)) {',
    b: '    if (false) {',
    t: 'tests/migrare.test.ts', e: 'felul si piesa trebuie sa se potriveasca',
  },
  {
    n: 'migrarea 6->7 nu scrie santinela (desemnarile vechi raman fara piesa)',
    f: 'src/sim/save.ts',
    a: "    return { ...d, desemnari: { ...des, piesa: des.piesa ?? new Array<number>(n).fill(Piesa.NICIUNA) } }",
    b: '    void n\n    return { ...d, desemnari: { ...des } }',
    t: 'tests/migrare.test.ts', e: 'migrarea 6 -> 7',
  },
  {
    n: 'slotul reutilizat mosteneste piesa desemnarii moarte',
    f: 'src/sim/desemnari.ts',
    a: '  d.piesa[slot] = piesa',
    b: '  void piesa',
    t: 'tests/constructie.test.ts', e: 'slotul reutilizat nu mosten',
  },
  {
    n: '`exclusiv` se calculeaza doar peste sapat si carat',
    f: 'src/sim/joburi.ts',
    a: '  const exclusiv = Math.max(pS, pC, pB) === rules.personalPriorityLevels',
    b: '  void pB\n  const exclusiv = Math.max(pS, pC) === rules.personalPriorityLevels',
    t: 'tests/constructie.test.ts', e: 'un pion pus EXCLUSIV pe construit',
  },

  // --- pasul 3: continutul ---
  {
    n: 'o piesa poate costa altceva decat da inapoi (zidire + sapare tipareste materie)',
    f: 'src/sim/content.ts',
    a: '    if (p.cantitate !== y.cantitate) {',
    b: '    if (false) {',
    t: 'tests/content.test.ts', e: 'o piesa care nu costa cat da inapoi',
  },
  {
    n: 'invariantul de cantitate devine un PLAFON in loc de egalitate',
    f: 'src/sim/content.ts',
    a: '    if (p.cantitate !== y.cantitate) {',
    b: '    if (p.cantitate < y.cantitate) {',
    t: 'tests/content.test.ts', e: 'o piesa care nu costa cat da inapoi',
  },
  {
    n: 'o piesa poate fi mai scumpa decat incape intr-o mana',
    f: 'src/sim/content.ts',
    a: '    if (p.cantitate > r.haulCarryMax) {',
    b: '    if (false) {',
    t: 'tests/content.test.ts', e: 'o piesa care nu incape intr-o mana',
  },
  {
    n: 'grinda poate sprijini mai putin decat solul',
    f: 'src/sim/content.ts',
    a: '  if (r.suportRazaGrinda < r.suportMax) {',
    b: '  if (false) {',
    t: 'tests/content.test.ts', e: 'o grinda nu poate sprijini mai putin',
  },
  {
    n: 'o piesa se poate face din AER',
    f: 'src/sim/content.ts',
    a: '    if (!isSolid(mat[1])) {',
    b: '    if (false) {',
    t: 'tests/content.test.ts', e: 'o piesa din AER sau APA',
  },

  // --- pasul 4: stabilitatea la zidire ---
  {
    n: '`fill` nu mai trece prin regula de stabilitate (se zideste in aer)',
    f: 'src/sim/joburi.ts',
    a: '  const sprijin = poateSustine(w.terrain, rules, wx, wy, z)\n  if (!sprijin.ok) return sprijin',
    b: '  void poateSustine',
    t: 'tests/constructie.test.ts', e: 'nu se mai poate zidi in aer',
  },
  {
    n: 'poarta accepta si suportul ZERO',
    f: 'src/sim/stabilitate.ts',
    a: '  if (suport > 0) return accept()',
    b: '  if (suport >= 0) return accept()',
    t: 'tests/constructie.test.ts', e: 'nu se mai poate zidi in aer',
  },
  {
    n: 'suportDacaZidesc crede ca orice celula noua e ASEZATA',
    f: 'src/sim/stabilitate.ts',
    a: '  if (sub === Sol.SOLID || sub === Sol.ANCORA) return rules.suportMax\n  return caveazaSpreAsezat(t, rules, wx, wy, z, null, zidite)',
    b: '  void sub\n  return rules.suportMax',
    t: 'tests/constructie.test.ts', e: 'nu se mai poate zidi in aer',
  },
  {
    n: 'suportDacaZidesc nu cauta lateral (doar asezat sau nimic)',
    f: 'src/sim/stabilitate.ts',
    a: '  return caveazaSpreAsezat(t, rules, wx, wy, z, null, zidite)',
    b: '  return 0',
    t: 'tests/constructie.test.ts', e: 'consola se intinde exact 3 celule',
  },
  {
    n: 'poarta refuza si pe o celula deja plina (mesajul devine inutil)',
    f: 'src/sim/stabilitate.ts',
    a: '  if (solLa(t, wx, wy, z) === Sol.SOLID) return accept()',
    b: '  if (false) return accept()',
    t: 'tests/constructie.test.ts', e: 'o celula deja plina raspunde CELULA_PLINA',
  },

  // --- pasul 5: inchiderea ---
  {
    n: 'inchiderea face O SINGURA trecere (nu mai e punct fix)',
    f: 'src/sim/stabilitate.ts',
    a: '  let adaugat = true\n  while (adaugat) {',
    b: '  let adaugat = true\n  for (let treceri = 0; treceri < 1 && adaugat; treceri++) {',
    t: 'tests/constructie.test.ts', e: 'ACCEPTANTA: casa de 9x9',
  },
  {
    n: 'canalul ipotetic nu se citeste: nimic nu se sprijina pe ce inca nu exista',
    f: 'src/sim/stabilitate.ts',
    a: '  if (zidite !== null && zidite.has(cellKey(wx, wy, z))) return Sol.SOLID',
    b: '  void zidite',
    t: 'tests/constructie.test.ts', e: 'ACCEPTANTA: casa de 9x9',
  },
  {
    n: '`suportDacaZidesc` nu duce ipotezele mai departe in BFS',
    f: 'src/sim/stabilitate.ts',
    a: '  return caveazaSpreAsezat(t, rules, wx, wy, z, null, zidite)',
    b: '  return caveazaSpreAsezat(t, rules, wx, wy, z, null, null)',
    t: 'tests/constructie.test.ts', e: 'ACCEPTANTA: casa de 9x9',
  },
  {
    n: 'celulele deja solide raman in multime (cifrele nu mai inseamna nimic)',
    f: 'src/sim/stabilitate.ts',
    a: '    if (solLa(t, c.wx, c.wy, c.z) === Sol.SOLID) ramase.delete(cheie)',
    b: '    void c',
    t: 'tests/constructie.test.ts', e: 'o celula deja solida nu e nici',
  },

  // --- pasul 5b: desenarea ---
  //
  // Prima proba e cea care conteaza: ea reintroduce EXACT greseala pe care panoul
  // de design a masurat-o — un validator de sprijin la desenare, care ar refuza 145
  // din 177 de piese ale unei case pe care se poate ridica.
  {
    n: 'desenarea verifica si SPRIJINUL (K07 in oglinda)',
    f: 'src/sim/commands.ts',
    a: '        const liber = celulaLibera(w, rules, cmd.wx, cmd.wy, cmd.z)\n        if (!liber.ok) return liber',
    b: '        const liber = celulaLibera(w, rules, cmd.wx, cmd.wy, cmd.z)\n        if (!liber.ok) return liber\n        const sprijin = poateSustine(w.terrain, rules, cmd.wx, cmd.wy, cmd.z)\n        if (!sprijin.ok) return sprijin',
    t: 'tests/constructie.test.ts', e: 'ACCEPTANTA: casa de 177 de piese',
  },
  {
    n: 'desenarea accepta o celula deja PLINA',
    f: 'src/sim/commands.ts',
    a: '        if (isSolid(mat.value)) {\n          return refuse(Reason.CELULA_PLINA, { material: mat.value, wx: cmd.wx, wy: cmd.wy, z: cmd.z })\n        }',
    b: '        void mat',
    t: 'tests/constructie.test.ts', e: 'ce SE verifica la desenare',
  },
  {
    n: 'desenarea nu verifica ocuparea (se deseneaza peste pion si morman)',
    f: 'src/sim/commands.ts',
    a: '        const liber = celulaLibera(w, rules, cmd.wx, cmd.wy, cmd.z)\n        if (!liber.ok) return liber',
    b: '        void celulaLibera',
    t: 'tests/constructie.test.ts', e: 'ce SE verifica la desenare',
  },
  {
    n: 'piesa nu se valideaza: orice numar trece',
    f: 'src/sim/commands.ts',
    a: '        if (!Number.isInteger(piesa) || piesa < 1 || piesa >= rules.piese.length) {',
    b: '        if (false) {',
    t: 'tests/constructie.test.ts', e: 'ce SE verifica la desenare',
  },
  {
    n: 'piesa nu se scrie pe desemnare (blueprintul uita ce era)',
    f: 'src/sim/desemnari.ts',
    a: '  d.piesa[slot] = piesa',
    b: '  d.piesa[slot] = Piesa.NICIUNA',
    t: 'tests/constructie.test.ts', e: 'o desemnare de CONSTRUIT poarta piesa',
  },
  {
    n: 'previzualizarea de constructie nu filtreaza pe fel',
    f: 'src/sim/joburi.ts',
    a: '    if (d.alive[i] === 1 && d.kind[i] === Desemnare.CONSTRUIESTE) celule.push(cellKey(d.wx[i]!, d.wy[i]!, d.z[i]!))',
    b: '    if (d.alive[i] === 1) celule.push(cellKey(d.wx[i]!, d.wy[i]!, d.z[i]!))',
    t: 'tests/constructie.test.ts', e: 'la DESENARE nu se verifica sprijinul',
  },

  // --- pasul 6a: vocabularul si carligele ---
  {
    n: '`anuleazaDesemnare` filtreaza doar pe `jobTarget` (job orfan, M5 rosu)',
    f: 'src/sim/joburi.ts',
    a: '    if (a.jobTarget[i] !== id && a.jobDest[i] !== id) continue',
    b: '    if (a.jobTarget[i] !== id) continue',
    t: 'tests/constructie.test.ts', e: '`anuleazaDesemnare` intrerupe si jobul',
  },
  {
    n: 'marfa se lasa si PE un santier (zidirea se blocheaza singura)',
    f: 'src/sim/iteme.ts',
    a: '          if (santier !== -1 && w.desemnari.kind[santier] === Desemnare.CONSTRUIESTE) continue',
    b: '          void santier',
    t: 'tests/constructie.test.ts', e: 'marfa nu se lasa PE un santier',
  },

  // --- pasul 6b: driverul de construit ---
  {
    n: "munca de zidit e gratis (peretele apare instantaneu)",
    f: "src/sim/joburi.ts",
    a: "  if (a.jobProgres[slot]! < spec.lucru) return",
    b: "  if (a.jobProgres[slot]! < 0) return",
    t: 'tests/constructie.test.ts', e: "ACCEPTANTA: pionul cara materialul si RIDICA peretele",
  },
  {
    n: "se zideste si fara materialul in mana",
    f: "src/sim/joburi.ts",
    a: "  // incheie pe loc.\n  if (a.caraCantitate[slot]! < spec.cantitate) {",
    b: "  // incheie pe loc.\n  if (false) {",
    t: 'tests/constructie.test.ts', e: "materialul disparut din mana nu se zideste din nimic",
  },
  {
    n: "materialul nu se consuma din mana (se multiplica)",
    f: "src/sim/joburi.ts",
    a: "  a.caraCantitate[slot] = a.caraCantitate[slot]! - spec.cantitate",
    b: "  a.caraCantitate[slot] = a.caraCantitate[slot]!",
    t: 'tests/constructie.test.ts', e: "ACCEPTANTA: pionul cara materialul si RIDICA peretele",
  },
  {
    n: "zidirea nu se numara (al treilea termen al conservarii lipseste)",
    f: "src/sim/joburi.ts",
    a: "  w.ratiune.unitatiZidite += spec.cantitate",
    b: "  w.ratiune.unitatiZidite += 0",
    t: 'tests/constructie.test.ts', e: "ACCEPTANTA: pionul cara materialul si RIDICA peretele",
  },
  {
    n: "santierul ramane dupa ce piesa e pusa",
    f: "src/sim/joburi.ts",
    a: "  raport.pieseZidite++\n  marcheazaZoneMurdare(w)\n  terminaJob(w, rules, slot, Sfarsit.TERMINAT)\n  stergeDesemnare(d, ds)",
    b: "  raport.pieseZidite++\n  marcheazaZoneMurdare(w)\n  terminaJob(w, rules, slot, Sfarsit.TERMINAT)",
    t: 'tests/constructie.test.ts', e: "ACCEPTANTA: pionul cara materialul si RIDICA peretele",
  },
  {
    n: "constructorul sta PE santier (isi blocheaza singur zidirea)",
    f: "src/sim/joburi.ts",
    a: "  if (a.jobKind[slot] === FelJob.CONSTRUIESTE) {",
    b: "  if (false) {",
    t: 'tests/constructie.test.ts', e: "ACCEPTANTA: pionul cara materialul si RIDICA peretele",
  },
  {
    n: "se zideste de la DISTANTA (pozitia de lucru nu conteaza)",
    f: "src/sim/joburi.ts",
    a: "  if (!peLoc || seSapaLa(d, cx, cy, cz - 1)) {",
    b: "  if (false) {",
    t: 'tests/constructie.test.ts', e: "pionul mutat de pe locul de lucru nu zideste de la distanta",
  },
  {
    n: "mormanul de alt fel e acceptat (perete de piatra din lemn)",
    f: "src/sim/joburi.ts",
    a: "  if (w.iteme.kind[is] !== cerut) {",
    b: "  if (false) {",
    t: 'tests/constructie.test.ts', e: "un morman de alt fel, sau sub PRAGUL",
  },
  {
    n: "mormanul prea mic e acceptat (drum irosit, refuz abia la final)",
    f: "src/sim/joburi.ts",
    a: "  if (liber < necesar) {",
    b: "  if (false) {",
    t: 'tests/constructie.test.ts', e: "un morman de alt fel, sau sub PRAGUL",
  },
  // --- logistica constructiei, commit 3: costul nu creste cu mormanele din lume (25.09.2026) ---
  {
    n: "rezumatMaterial se cheama si fara niciun santier viu (O(mormane) pentru nimic)",
    f: "src/sim/joburi.ts",
    a: "  if (activ.construieste && d.viiConstruieste > 0) {",
    b: "  if (activ.construieste) {",
    t: 'tests/constructie.test.ts', e: "3000 de mormane: fara santiere",
  },
  {
    n: "sonda parcurge TOATE itemele, nu doar felul cerut",
    f: "src/sim/joburi.ts",
    a: "    for (const s of ix.peFel[fel]!) {\n    if (it.alive[s] === 0) continue\n    raport.pasiRezumat++",
    b: "    for (let s = 0; s < it.count; s++) {\n    if (it.alive[s] === 0 || it.kind[s] !== fel) continue\n    raport.pasiRezumat++",
    t: 'tests/constructie.test.ts', e: "3000 de mormane: cu un santier",
  },
  {
    n: "viiConstruieste nu creste la desemnare (constructia nu mai porneste niciodata)",
    f: "src/sim/desemnari.ts",
    a: "  if (d.kind[slot] === Desemnare.CONSTRUIESTE) d.viiConstruieste++",
    b: "  void slot",
    t: 'tests/constructie.test.ts', e: "ridicarea in mai multe randuri",
  },
  // --- logistica constructiei, commit 2b: ridicarea in mai multe randuri (25.09.2026) ---
  {
    n: "ridica nu ADUNA: a doua ridicare rescrie mana (prima parte a piesei dispare)",
    f: "src/sim/joburi.ts",
    a: "  a.caraCantitate[slot] = a.caraCantitate[slot]! + luat",
    b: "  a.caraCantitate[slot] = luat",
    t: 'tests/constructie.test.ts', e: "ridicarea in mai multe randuri",
  },
  {
    n: "reconcilierea INTRERUPE constructorul cu marfa in mana in loc sa-l retinteasca",
    f: "src/sim/joburi.ts",
    a: "          if (!refaSursa(w, rules, i, id)) abandoneazaRidicarea(w, rules, i)",
    b: "          terminaJob(w, rules, i, Sfarsit.INTRERUPT)",
    t: 'tests/constructie.test.ts', e: "a doua sursa moare sub constructor",
  },
  {
    n: "refaSursa nu filtreaza pe componenta (a doua sursa poate fi peste prapastie)",
    f: "src/sim/joburi.ts",
    a: "    if (r === NO_REGION || find(w.regions, r) !== comp) {\n      evitaTinta(w, slot, it.id[s]!, w.tick + rules.jobRetryTicks)\n      continue\n    }\n    const liber = liberPeItem(w, s)",
    b: "    if (r === NO_REGION) continue\n    const liber = liberPeItem(w, s)",
    t: 'tests/constructie.test.ts', e: "a doua sursa e in alta componenta",
  },
  {
    n: "refaSursa ordonata dupa celula curenta, fara santier (pionul e tras inapoi)",
    f: "src/sim/joburi.ts",
    a: "    const cheie = d1 + Math.abs(it.wx[s]! - d.wx[ds]!) + Math.abs(it.wy[s]! - d.wy[ds]!) + Math.abs(it.z[s]! - d.z[ds]!)",
    b: "    const cheie = d1",
    t: 'tests/constructie.test.ts', e: "a doua sursa se alege dupa drumul curent",
  },
  {
    n: "refaSursa sare mormanul din alta componenta FARA sa-l evite (pompa: re-pornire la fiecare tact)",
    f: "src/sim/joburi.ts",
    a: "    if (r === NO_REGION || find(w.regions, r) !== comp) {\n      evitaTinta(w, slot, it.id[s]!, w.tick + rules.jobRetryTicks)\n      continue\n    }",
    b: "    if (r === NO_REGION || find(w.regions, r) !== comp) {\n      continue\n    }",
    t: 'tests/constructie.test.ts', e: "materialul de neatins nu produce un ciclu",
  },
  {
    n: "refaSursa intinde un coridor de acoperire spre morman (K05: acoperirea creste cu plimbarea)",
    f: "src/sim/joburi.ts",
    a: "    const r = regionAt(w.regions, it.wx[s]!, it.wy[s]!, it.z[s]!)\n    if (r === NO_REGION && w.regions.dirty.size > 0) continue\n    if (r === NO_REGION || find(w.regions, r) !== comp) {\n      evitaTinta",
    b: "    void acoperaCoridor(w, rules, ox, oy, oz, it.wx[s]!, it.wy[s]!, it.z[s]!)\n    const r = regionAt(w.regions, it.wx[s]!, it.wy[s]!, it.z[s]!)\n    if (r === NO_REGION && w.regions.dirty.size > 0) continue\n    if (r === NO_REGION || find(w.regions, r) !== comp) {\n      evitaTinta",
    t: 'tests/constructie.test.ts', e: "ridicarea in mai multe randuri",
  },
  {
    n: "pragul de sursa e 1: mormane de praf sunt surse",
    f: "src/sim/joburi.ts",
    a: "  return Math.min(lipsa, pragRidicare(rules, spec))",
    b: "  return Math.min(lipsa, 1)",
    t: 'tests/constructie.test.ts', e: "un morman sub prag nu e sursa",
  },
  {
    n: "penalizarea pentru un morman partial e zero (sonda prefera 10 la d unui 20 la d+1)",
    f: "src/sim/joburi.ts",
    a: "      const cheie = dist + (liber < spec.cantitate ? penalizare : 0)",
    b: "      const cheie = dist",
    t: 'tests/constructie.test.ts', e: "un morman de 10 la 3 celule",
  },
  {
    n: "m.exista nu cere suma LIBERA in raza (pompa: joburi pornite pe material de neatins)",
    f: "src/sim/joburi.ts",
    a: "    rezumatMat[p] = { exista: m.slot !== -1 && sumaLibera[p]! >= spec.cantitate, dMin: m.dMin, slot: m.slot }",
    b: "    rezumatMat[p] = { exista: m.slot !== -1, dMin: m.dMin, slot: m.slot }",
    // Testul cu doi constructori pe 2x10 trece si fara poarta (cei doi se descurca prin
    // lasat si reluat); ce o prinde e MARGINEA de pe materialul de neatins.
    t: 'tests/constructie.test.ts', e: "materialul de neatins nu produce un ciclu",
  },
  {
    n: "matOriunde nu cere suma bruta ≥ cantitate (un singur morman de 10 trece drept material destul)",
    f: "src/sim/joburi.ts",
    a: "    matOriunde[p] = existaMorman[p]! && sumaBruta[p]! >= spec.cantitate",
    b: "    matOriunde[p] = existaMorman[p]!",
    t: 'tests/constructie.test.ts', e: "De ce nu? deosebeste",
  },
  {
    n: "cauza IMPRASTIAT nu se mai deosebeste de lipsa",
    f: "src/sim/joburi.ts",
    a: "        d.ultimulMotivDetaliu[s] = matImprastiat[d.piesa[s]!]! ? DetaliuMotiv.MATERIAL_IMPRASTIAT : DetaliuMotiv.NICIUNUL",
    b: "        d.ultimulMotivDetaliu[s] = DetaliuMotiv.NICIUNUL",
    t: 'tests/constructie.test.ts', e: "De ce nu? deosebeste",
  },
  {
    n: "decode accepta un count pe sursa peste ce mai lipseste",
    f: "src/sim/save.ts",
    a: "      if (cant < 1 || cant > spec.cantitate - cara) {",
    b: "      if (false) {",
    t: 'tests/saveload.test.ts', e: "un count pe sursa in afara marginilor",
  },
  {
    n: "pragul de ridicare peste stiva nu e refuzat",
    f: "src/sim/content.ts",
    a: "  if (r.constructPickupMinUnits > r.itemStackMax) {",
    b: "  if (false) {",
    t: 'tests/content.test.ts', e: "pragul de ridicare",
  },
  // --- logistica constructiei, commit 2a: trei defecte pre-existente (25.09.2026) ---
  {
    n: "refaTinta ignora pasul: un drum refuzat spre morman trimite constructorul la santier cu mana goala",
    f: "src/sim/joburi.ts",
    a: "    if (a.jobStep[slot]! <= PasConstruieste.RIDICA) {\n      // Alta SURSA",
    b: "    if (false) {\n      // Alta SURSA",
    t: 'tests/constructie.test.ts', e: "munca falsa",
  },
  {
    n: "zideste verifica mana abia DUPA ce a muncit (zavorul nu se trage, peretele iese din nimic)",
    f: "src/sim/joburi.ts",
    a: "  if (a.caraCantitate[slot]! < spec.cantitate) {\n    w.ratiune.zidiriCuManaGoala++",
    b: "  if (false) {\n    w.ratiune.zidiriCuManaGoala++",
    t: 'tests/constructie.test.ts', e: "zidirea cu mana goala se incheie pe loc",
  },
  {
    n: "pe piciorul sursei, un drum refuzat raceste mormanul GLOBAL in loc de pereche",
    f: "src/sim/joburi.ts",
    a: "      if (slotItem(w.iteme, a.jobTarget[slot]!) !== -1) evitaTinta(w, slot, a.jobTarget[slot]!, w.tick + rules.jobRetryTicks)\n      return",
    b: "      { const is = slotItem(w.iteme, a.jobTarget[slot]!); if (is !== -1) memoreazaPeItem(w, rules, is, Reason.INACCESIBIL, DetaliuItem.COMPONENTE_DIFERITE) }\n      return",
    t: 'tests/constructie.test.ts', e: "munca falsa",
  },
  {
    n: "foamea critica intrerupe constructorul cu mana plina (predicatul vechi, doar pentru carat)",
    f: "src/sim/joburi.ts",
    a: "  return w.agents.caraCantitate[slot] === 0",
    b: "  return !(w.agents.jobKind[slot] === FelJob.CARA && w.agents.jobStep[slot]! >= PasCara.MERGE_DEST)",
    t: 'tests/constructie.test.ts', e: "foamea critica nu arunca mana plina",
  },
  // --- logistica constructiei, commit 1 (25.09.2026) ---
  {
    n: "itemClaimantsMax ignorat: lacatul exclusiv pe morman revine",
    f: "src/sim/joburi.ts",
    a: "  return { targetId: itemId, layer: Strat.CARAT, count, maxCount: rules.itemStackMax, maxClaimants: rules.itemClaimantsMax }",
    b: "  return { targetId: itemId, layer: Strat.CARAT, count, maxCount: rules.itemStackMax, maxClaimants: 1 }",
    t: 'tests/constructie.test.ts', e: "trei constructori pe UN morman",
  },
  {
    n: "sonda din rezumat se uita la cat E in morman, nu la cat e LIBER (verificat la scan, refuzat la start)",
    f: "src/sim/joburi.ts",
    a: "      if (liber < pragSursa(rules, spec, spec.cantitate)) continue",
    b: "      if (cant < pragSursa(rules, spec, spec.cantitate)) continue",
    // Cu liber = 0 mutatia e mascata de refuzul cererilor de zero; leaga doar cand
    // e liber CEVA sub prag — scenariul de mai jos, cu 5 libere din 25.
    t: 'tests/constructie.test.ts', e: "un morman cu prea putin LIBER",
  },
  {
    n: "sursa se verifica si DUPA ce materialul e in mana",
    f: "src/sim/joburi.ts",
    a: "    if (a.jobStep[slot]! <= PasConstruieste.RIDICA && slotItem(w.iteme, a.jobTarget[slot]!) === -1) {",
    b: "    if (slotItem(w.iteme, a.jobTarget[slot]!) === -1) {",
    t: 'tests/constructie.test.ts', e: "M5 peste o zidire in curs: save luat cu materialul in mana",
  },
  {
    n: "pasul RIDICA cade pe `zideste` (dispecerizarea pe pas e inversata)",
    f: "src/sim/joburi.ts",
    a: "    if (w.agents.jobStep[slot] === PasConstruieste.RIDICA) ridica(w, rules, slot)",
    b: "    if (w.agents.jobStep[slot] === PasConstruieste.ZIDESTE) ridica(w, rules, slot)",
    t: 'tests/constructie.test.ts', e: "ACCEPTANTA: pionul cara materialul si RIDICA peretele",
  },
  {
    n: "zidirea nu consuma mormanul sursa (materia se tipareste)",
    f: "src/sim/joburi.ts",
    a: "  if (a.caraCantitate[slot] === 0) a.caraKind[slot] = 0",
    b: "  a.caraCantitate[slot] = a.caraCantitate[slot]! + spec.cantitate",
    t: 'tests/constructie.test.ts', e: "ACCEPTANTA: pionul cara materialul si RIDICA peretele",
  },

  // --- blocantul gasit de panoul pasului 6c, in codul pasului 6b ---
  {
    n: "`refaLoculDeLucru` cauta desemnarea in `jobTarget` (adevarat doar la SAPAT)",
    f: "src/sim/joburi.ts",
    a: "  const ds = slotDesemnare(d, idDesemnare)",
    b: "  const ds = slotDesemnare(d, a.jobTarget[slot]!)",
    t: 'tests/constructie.test.ts', e: 'pionul mutat de pe locul de lucru nu zideste de la distanta',
  },
  {
    n: "constructorul refacut revine la pasul de mers al SAPATULUI (MERGE_SURSA)",
    f: "src/sim/joburi.ts",
    a: "    if (!refaLoculDeLucru(w, rules, slot, a.jobDest[slot]!, PasConstruieste.MERGE_SANTIER)) {",
    b: "    if (!refaLoculDeLucru(w, rules, slot, a.jobDest[slot]!, PasJob.MERGE)) {",
    t: 'tests/constructie.test.ts', e: 'pionul mutat de pe locul de lucru nu zideste de la distanta',
  },
  {
    n: "`DRIVER_CONSTRUIESTE.refaTinta` isi cauta santierul in `jobTarget`",
    f: "src/sim/joburi.ts",
    a: "    return refaLoculDeLucruEvitandCurentul(w, rules, slot, a.jobDest[slot]!, PasConstruieste.MERGE_SANTIER)",
    b: "    return refaLoculDeLucruEvitandCurentul(w, rules, slot, a.jobTarget[slot]!, PasConstruieste.MERGE_SANTIER)",
    t: 'tests/constructie.test.ts', e: 'constructorul cu locul de lucru ocupat de un ostil',
  },

  // --- 6c, pasii pregatitori ---
  {
    n: "locul de lucru de la santier se cauta in ORICE componenta",
    f: "src/sim/joburi.ts",
    a: "    const loc = celulaDeLucru(w.terrain, w.regions, d, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, rules, comp)",
    b: "    void comp\n    const loc = celulaDeLucru(w.terrain, w.regions, d, d.wx[ds]!, d.wy[ds]!, d.z[ds]!, rules)",
    t: 'tests/constructie.test.ts', e: 'santierul de necontactat se refuza PE LOC',
  },

  // --- 6c: scanerul ---
  {
    n: "categoria CONSTRUIESTE nu se activeaza niciodata",
    f: 'src/sim/joburi.ts',
    a: "    construieste: pB > 0 && (!exclusiv || pB === rules.personalPriorityLevels),",
    b: "    construieste: false,",
    t: 'tests/constructie.test.ts', e: "ACCEPTANTA 6c: scanerul alege singur santiere",
  },
  {
    n: "scanerul sare peste desemnarile de CONSTRUIT (poarta pe fel inversata)",
    f: 'src/sim/joburi.ts',
    a: "      if (d.kind[s] !== Desemnare.CONSTRUIESTE) continue",
    b: "      if (d.kind[s] !== Desemnare.SAPA) continue",
    t: 'tests/constructie.test.ts', e: "ACCEPTANTA 6c: scanerul alege singur santiere",
  },
  {
    n: "poarta de material nu taie nimic (santiere fara din ce, propuse oricum)",
    f: 'src/sim/joburi.ts',
    a: "      if (!m.exista) { lipsaMaterial = true; continue }",
    b: "      if (!m.exista) { lipsaMaterial = true }",
    t: 'tests/constructie.test.ts', e: "fara material, categoria se refuza O DATA pe fel",
  },
  {
    n: "poarta de sprijin scoasa: se cara material la santiere in AER",
    f: 'src/sim/joburi.ts',
    a: "      if (!poateSustine(w.terrain, rules, d.wx[s]!, d.wy[s]!, d.z[s]!).ok) {",
    b: "      if (false) {",
    t: 'tests/constructie.test.ts', e: "un blueprint in AER nu trimite pe nimeni dupa material",
  },
  {
    n: "poarta ramane doar `poateSustine`, fara verificarea de celula PLINA",
    f: 'src/sim/joburi.ts',
    a: "      if (solLa(w.terrain, d.wx[s]!, d.wy[s]!, d.z[s]!) === Sol.SOLID) continue",
    b: "      if (false) continue",
    t: 'tests/constructie.test.ts', e: "un santier peste care a cazut MOLOZ nu mai e candidat",
  },
  {
    n: "pionul cu CONSTRUIESTE pe 0 primeste totusi santiere",
    f: 'src/sim/joburi.ts',
    a: "    construieste: pB > 0 && (!exclusiv || pB === rules.personalPriorityLevels),",
    b: "    construieste: true,",
    t: 'tests/constructie.test.ts', e: "un pion cu CONSTRUIESTE pe 0 nu ia niciodata un santier",
  },

  // --- blocantul gasit de recenzia adversariala ---
  {
    n: "racirea de componenta se scrie pe MORMAN (un pion izolat opreste colonia)",
    f: "src/sim/joburi.ts",
    a: "        evitaTinta(w, slot, it.id[im]!, w.tick + rules.jobRetryTicks)",
    b: "        memoreazaPeItem(w, rules, im, Reason.INACCESIBIL, DetaliuItem.COMPONENTE_DIFERITE)",
    t: 'tests/constructie.test.ts', e: 'un pion IZOLAT nu are voie sa inghete materialul',
  },

  // --- constatarile 5 si 6 ale recenziei adversariale ---
  {
    n: "santierul se alege dupa ordinea desenarii (departajarea pe al doilea picior dispare)",
    f: "src/sim/joburi.ts",
    a: "      const maiAproapeDeMorman = egal",
    b: "      const maiAproapeDeMorman = false && egal",
    t: 'tests/constructie.test.ts', e: 'intre doua santiere la fel de bune',
  },
  {
    n: "comparatorul lasa doi candidati cu id-uri diferite sa iasa EGALI",
    f: "src/sim/joburi.ts",
    a: "  return idA - idB",
    b: "  return (idA % 2) - (idB % 2)",
    t: 'tests/constructie.test.ts', e: 'comparatorul de candidati e o ordine TOTALA',
  },
  {
    n: "comparatorul pierde antisimetria (spune „mai mic\" in ambele sensuri)",
    f: "src/sim/joburi.ts",
    a: "  if (la !== lb) return la > lb ? -1 : 1",
    b: "  if (la !== lb) return -1",
    t: 'tests/constructie.test.ts', e: 'comparatorul de candidati e o ordine TOTALA',
  },
  {
    n: "al doilea picior se raporteaza 0 la constructie (departajarea ramane, dar oarba)",
    f: "src/sim/joburi.ts",
    a: "      candDist2[n] = Math.abs(it.wx[m.slot]! - d.wx[s]!) + Math.abs(it.wy[m.slot]! - d.wy[s]!) + Math.abs(it.z[m.slot]! - d.z[s]!)",
    b: "      candDist2[n] = 0",
    t: 'tests/constructie.test.ts', e: 'intre doua santiere la fel de bune',
  },
  {
    n: "santierul fara material nu mai primeste cauza (panoul il picteaza sanatos)",
    f: "src/sim/joburi.ts",
    a: "      if (!matOriunde[d.piesa[s]!]!) {\n        d.ultimulMotiv[s] = codMotiv(Reason.LIPSA_MATERIAL)",
    b: "      if (false) {\n        d.ultimulMotiv[s] = codMotiv(Reason.LIPSA_MATERIAL)",
    t: 'tests/constructie.test.ts', e: 'santierul care n-are din ce sa fie zidit',
  },
  {
    n: "cauza pe desemnare vine din rezumatul PER-PION, nu din lume",
    f: "src/sim/joburi.ts",
    a: "      if (!matOriunde[d.piesa[s]!]!) {",
    b: "      if (!m.exista) {",
    t: 'tests/constructie.test.ts', e: 'materialul rezervat de ALT pion',
  },
  {
    n: 'exista in lume se afla DUPA portile per-pion (evitarea sterge felul)',
    f: "src/sim/joburi.ts",
    a: "      if (cant >= pragRidicare(rules, spec)) existaMorman[p] = true\n      if (!alMeu || !inRaza) continue",
    b: "      if (!alMeu || !inRaza) continue\n      if (cant >= pragRidicare(rules, spec)) existaMorman[p] = true",
    t: 'tests/constructie.test.ts', e: 'mormanul evitat de pioni',
  },

  // --- goluri gasite de a doua recenzie adversariala ---
  {
    n: 'decode nu verifica daca `piesa` exista in tabel (TypeError la prima scanare)',
    f: 'src/sim/save.ts',
    a: "    if (felPiesa < 0 || felPiesa >= rules.piese.length) {",
    b: "    if (false) {",
    t: 'tests/saveload.test.ts', e: 'o `piesa` din afara tabelului',
  },
  {
    n: 'ramura care STERGE cauza „lipsa material" dispare (santierul ramane portocaliu pe veci)',
    f: 'src/sim/joburi.ts',
    a: "      } else if (d.ultimulMotiv[s]! === codMotiv(Reason.LIPSA_MATERIAL)) {",
    b: "      } else if (false) {",
    t: 'tests/constructie.test.ts', e: 'cand materialul APARE in lume',
  },
  {
    n: 'detaliul nu se mai pune pe NICIUNUL, deci ramane agatat de cauza dinainte',
    f: 'src/sim/joburi.ts',
    a: "        d.ultimulMotivDetaliu[s] = matImprastiat[d.piesa[s]!]! ? DetaliuMotiv.MATERIAL_IMPRASTIAT : DetaliuMotiv.NICIUNUL",
    b: "        void matImprastiat",
    t: 'tests/constructie.test.ts', e: 'cauza „lipsa material" nu mosteneste',
  },
]
