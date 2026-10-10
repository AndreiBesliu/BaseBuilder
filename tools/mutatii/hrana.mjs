/**
 * Mutatii: S24-27 t.3 — commit-ul A, formatul alterarii (research/hrana-t3.md §1, §7, §9: S-ul il scriu testele, rata 0),
 * si commit-ul B, curba si pasul (§2, §3, §5: tabelul din content, pasul de 1 Hz, tocul, predicatul indexului, a doua
 * cautare de mancare). Fiecare proba strica o garantie si numeste testul scris pentru ea.
 *
 * Doua familii de porti de conservare, cu probe separate: G1S (oracolul pe S, cu contoare) prinde ce iese NENUMARAT din S
 * (despartirea fara parte, mancatul nenumarat), pompa (Σ S exact, fara contoare) prinde ce se pierde sau se dubleaza la
 * TRANSFER (unirea, mana, mutarea). Probele care ar fi echivalente nu exista aici, cu motivul in DEVLOG: `creeazaItem` care
 * ADUNA in loc sa scrie (slotul mort are deja 0), „tabelul perisabil lipsa trece" (parserul refuza oricum, cu acelasi camp).
 *
 * Fiecare intrare: `n` numele, `f` fisierul, `a` tiparul, `b` inlocuirea, `t` fisierul de teste, `e` inceputul numelui
 * testului care trebuie sa pice, `e2` editari in plus.
 */

const T = 'tests/hrana-format.test.ts'
const TP = 'tests/hrana-pas.test.ts'

export const MUTATII = [
  // --- aritmetica ---
  {
    n: 'parteDinAlterare naiva, in float: S·k trece de 2^53 si floor-ul iese gresit',
    f: 'src/sim/iteme.ts',
    a: '  return Math.floor(S / q) * k + Math.floor(((S % q) * k) / q)',
    b: '  return Math.floor((S * k) / q)',
    t: T, e: 'parteDinAlterare: proprietatea',
  },
  {
    n: 'parteDinAlterare fara termenul de rest (floor(S/q)·k)',
    f: 'src/sim/iteme.ts',
    a: '  return Math.floor(S / q) * k + Math.floor(((S % q) * k) / q)',
    b: '  return Math.floor(S / q) * k',
    t: T, e: 'nutritia pe hartie',
  },
  {
    n: 'nutritia NEREDUSE: hrana pe jumatate stricata hraneste intreg (decizia 3 tradata)',
    f: 'src/sim/joburi.ts',
    a: '  a.nevoi[baza] = Math.min(rules.nevoieMax, a.nevoi[baza]! + nutritieEfectiva(luat, parte, rules.nutritie[fel]!))',
    b: '  a.nevoi[baza] = Math.min(rules.nevoieMax, a.nevoi[baza]! + luat * rules.nutritie[fel]!)',
    t: T, e: 'nutritia pe hartie',
  },
  {
    n: 'nutritia cu floor: mancatorul castiga restul (STARE-11)',
    f: 'src/sim/iteme.ts',
    a: '  return luat * nut - (intregi * nut + Math.ceil((rest * nut) / ONE_ALTERARE))',
    b: '  return luat * nut - (intregi * nut + Math.floor((rest * nut) / ONE_ALTERARE))',
    t: T, e: 'nutritia pe hartie',
  },
  {
    n: 'nutritia redusa din S-ul INTREG al mormanului, nu din partea mancata',
    f: 'src/sim/joburi.ts',
    a: '  a.nevoi[baza] = Math.min(rules.nevoieMax, a.nevoi[baza]! + nutritieEfectiva(luat, parte, rules.nutritie[fel]!))',
    b: '  a.nevoi[baza] = Math.min(rules.nevoieMax, a.nevoi[baza]! + nutritieEfectiva(luat, parte + it.alterare[is]!, rules.nutritie[fel]!))',
    t: T, e: 'nutritia pe hartie',
  },
  {
    n: 'cautaMancare pe UNITATI, nu pe valoare: rezerva cat pe hrana proaspata',
    f: 'src/sim/joburi.ts',
    a: '    const cant = unitatiPentruNutritie(it.alterare[i]!, it.cantitate[i]!, nut, lipsa)',
    b: '    const cant = Math.min(it.cantitate[i]!, Math.ceil(lipsa / nut))',
    t: T, e: 'cautaMancare pe VALOARE',
  },

  // --- realizarea (functia proprie; la A o cheama doar testele) ---
  {
    n: 'scadeStricate cu regula despartirii lui iaDinItem (STARE-4: de 26 de ori mai repede)',
    f: 'src/sim/iteme.ts',
    a: '  s.alterare[slot] = s.alterare[slot]! - n * ONE_ALTERARE\n',
    b: '  s.alterare[slot] = s.alterare[slot]! - parteDinAlterare(s.alterare[slot]!, q, n)\n',
    t: T, e: 'scadeStricate: k unitati',
  },
  {
    n: 'scadeStricate nu taie k la floor(S/ONE): S ajunge negativ',
    f: 'src/sim/iteme.ts',
    a: '  const n = Math.min(k, q, Math.floor(s.alterare[slot]! / ONE_ALTERARE))',
    b: '  const n = Math.min(k, q)',
    t: T, e: 'scadeStricate: k unitati',
  },
  {
    n: 'scadeStricate: restul de S al mormanului mort din stricaciune dispare nenumarat',
    f: 'src/sim/iteme.ts',
    a: '    w.ratiune.alterareDisparuta += s.alterare[slot]!\n',
    b: '',
    t: T, e: 'scadeStricate: k unitati',
  },
  {
    n: 'scadeStricate nu numara unitatile stricate',
    f: 'src/sim/iteme.ts',
    a: '  w.hranaStricata += n\n',
    b: '',
    t: T, e: 'G1S + G1 la FIECARE tick',
  },
  {
    n: 'stergeItem lasa alterarea pe slotul mort',
    f: 'src/sim/iteme.ts',
    a: '  s.alive[slot] = 0\n  s.alterare[slot] = 0\n',
    b: '  s.alive[slot] = 0\n',
    t: T, e: 'stergeItem pune alterarea pe 0',
  },

  // --- caile: G1S (ce iese nenumarat din S) ---
  {
    n: 'iaDinItem fara parte: unitatile luate pleaca proaspete, S-ul ramas moare cu mormanul',
    f: 'src/sim/iteme.ts',
    a: '  const parte = parteDinAlterare(s.alterare[slot]!, s.cantitate[slot]!, luat)',
    b: '  const parte = 0',
    t: T, e: 'G1S + G1 la FIECARE tick',
  },
  {
    n: 'asazaItem: portiunile pleaca fara parte (lasat la picioare, mutat)',
    f: 'src/sim/iteme.ts',
    a: '          const parte = parteDinAlterare(sursaS, ramas, pune)',
    b: '          const parte = 0',
    t: T, e: 'G1S + G1 la FIECARE tick',
  },
  {
    n: 'lasaLaPicioare lasa marfa PROASPATA (mana isi pierde starea)',
    f: 'src/sim/joburi.ts',
    a: 'cellOf(a.y[slot]!), a.z[slot]!, 0, a.caraAlterare[slot]!)',
    b: 'cellOf(a.y[slot]!), a.z[slot]!, 0, 0)',
    t: T, e: 'G1S + G1 la FIECARE tick',
  },
  {
    n: 'mancatul nu numara S-ul mancat',
    f: 'src/sim/joburi.ts',
    a: '  w.ratiune.alterareMancata += parte\n',
    b: '',
    t: T, e: 'G1S + G1 la FIECARE tick',
  },
  {
    n: 'asazaItem: unirea pe un morman existent nu aduna partea',
    f: 'src/sim/iteme.ts',
    a: '            w.iteme.alterare[it] = w.iteme.alterare[it]! + parte\n',
    b: '',
    t: T, e: 'G1S + G1 la FIECARE tick',
  },

  // --- caile: pompa (transferul exact, fara contoare) ---
  {
    n: 'LASA uneste fara S-ul mainii',
    f: 'src/sim/joburi.ts',
    a: '    w.iteme.alterare[it] = w.iteme.alterare[it]! + a.caraAlterare[slot]!\n',
    b: '',
    t: T, e: 'poarta pompei de prospetime',
  },
  {
    n: 'LASA creeaza mormanul PROASPAT',
    f: 'src/sim/joburi.ts',
    a: '    const out = creeazaItem(w.iteme, w.nextId, kind, cx, cy, cz, cant, a.caraAlterare[slot]!)',
    b: '    const out = creeazaItem(w.iteme, w.nextId, kind, cx, cy, cz, cant, 0)',
    t: T, e: 'poarta pompei de prospetime',
  },
  {
    n: 'RIDICA: mana nu primeste partea',
    f: 'src/sim/joburi.ts',
    a: '  a.caraAlterare[slot] = a.caraAlterare[slot]! + it.ultimaParte\n',
    b: '',
    t: T, e: 'poarta pompei de prospetime',
  },
  {
    n: 'golesteMana uita alterarea (mana goala cu S, dublat in morman)',
    f: 'src/sim/state.ts',
    a: '  a.caraCantitate[slot] = 0\n  a.caraAlterare[slot] = 0\n}',
    b: '  a.caraCantitate[slot] = 0\n}',
    t: T, e: 'poarta pompei de prospetime',
  },
  {
    n: 'mutaItem muta mormanul PROASPAT (S citit dupa stergeItem)',
    f: 'src/sim/joburi.ts',
    a: '  const r = asazaItem(w, rules, kind, cant, wx, wy, z, id, S)',
    b: '  const r = asazaItem(w, rules, kind, cant, wx, wy, z, id, 0)',
    t: T, e: 'poarta pompei de prospetime',
  },
  {
    n: 'asazaItem scade partea din sursa INAINTE ca portiunea sa intre (o portiune refuzata pe capacitate o pierde)',
    f: 'src/sim/iteme.ts',
    a: '          const parte = parteDinAlterare(sursaS, ramas, pune)\n',
    b: '          const parte = parteDinAlterare(sursaS, ramas, pune)\n          sursaS -= parte\n',
    e2: [{ f: 'src/sim/iteme.ts', a: '          ramas -= pune\n          sursaS -= parte\n', b: '          ramas -= pune\n' }],
    t: T, e: 'asazaItem: o portiune refuzata pe capacitate',
  },

  // --- mana ---
  {
    // Commit-ul B: mutantul REAL (la A, fara pas, proba era o bucla inserata in tick). Testul ruleaza cu rata implicita.
    n: 'mana se strica: pasul de alterare strange S si pe mainile pline (bucla pe maini a prototipului H1)',
    f: 'src/sim/alterare.ts',
    a: '  // Faza 2: unitatile intregi strinse pleaca; moartea se reconciliaza acum.\n',
    b: '  for (let s = 0; s < w.agents.count; s++) if (w.agents.caraCantitate[s]! > 0 && rules.perisabil[w.agents.caraKind[s]!] === true) w.agents.caraAlterare[s] = w.agents.caraAlterare[s]! + w.agents.caraCantitate[s]! * Math.max(0, lambdaCer)\n  // Faza 2: unitatile intregi strinse pleaca; moartea se reconciliaza acum.\n',
    t: T, e: 'mana nu se strica',
  },
  {
    n: 'nasterea pe un slot refolosit nu goleste alterarea mainii',
    f: 'src/sim/commands.ts',
    a: '      golesteMana(a, slot)\n',
    b: '      a.caraKind[slot] = 0\n      a.caraCantitate[slot] = 0\n',
    t: T, e: 'nasterea pe un slot refolosit',
  },
  {
    n: 'zidirea nu numara S-ul materialului zidit',
    f: 'src/sim/joburi.ts',
    a: '  w.ratiune.alterareDisparuta += parteZidita\n',
    b: '',
    t: T, e: 'zidirea unui material PERISABIL',
  },

  // --- pierderile ---
  {
    n: 'numaraPierdute fara S-ul unitatilor pierdute',
    f: 'src/sim/iteme.ts',
    a: '  w.ratiune.alterarePierduta += alterare\n',
    b: '',
    t: T, e: 'pierderea: ce nu incape',
  },
  {
    n: 'numaraPierdute fara fel (G1 pe hrana orb la pierderi)',
    f: 'src/sim/iteme.ts',
    a: '  w.ratiune.pierdutePeFel[kind] = w.ratiune.pierdutePeFel[kind]! + cantitate\n',
    b: '',
    t: T, e: 'mortul de la incarcare',
  },
  {
    n: 'mortul de la incarcare: S-ul si felul nu se numara',
    f: 'src/sim/joburi.ts',
    a: '      numaraPierdute(w, a.caraKind[i]!, a.caraCantitate[i]!, a.caraAlterare[i]!)\n',
    b: '',
    t: T, e: 'mortul de la incarcare',
  },
  {
    n: 'lasaItem refuzat trage zavorul pe fel',
    f: 'src/sim/commands.ts',
    a: '        w.ratiune.pierdutePeFel[cmd.fel] = pierduteFelInainte\n',
    b: '',
    t: T, e: 'pierderea: ce nu incape',
  },

  // --- salvarea: M5, hash-ul ---
  {
    n: 'alterarea mormanelor nu se salveaza',
    f: 'src/sim/save.ts',
    a: '        alterare: Array.from(it.alterare.subarray(0, it.count)),',
    b: '        alterare: new Array(it.count).fill(0),',
    t: T, e: 'M5 cu alterare',
  },
  {
    n: 'alterarea mainilor nu se salveaza',
    f: 'src/sim/save.ts',
    a: '        caraAlterare: Array.from(a.caraAlterare.subarray(0, a.count)),',
    b: '        caraAlterare: new Array(a.count).fill(0),',
    t: T, e: 'M5 cu alterare',
  },
  {
    n: 'masca refuzata nu se salveaza',
    f: 'src/sim/save.ts',
    a: '        refuzate: Array.from(z.refuzate.subarray(0, z.count)),',
    b: '        refuzate: new Array(z.count).fill(0),',
    t: T, e: 'M5 cu alterare',
  },
  {
    n: 'totalul stricat nu se salveaza',
    f: 'src/sim/save.ts',
    a: '      hranaStricata: w.hranaStricata,',
    b: '      hranaStricata: 0,',
    t: T, e: 'M5 cu alterare',
  },
  {
    n: 'alterarea mormanelor nu intra in hash',
    f: 'src/sim/hash.ts',
    a: '  h.intregi(it.alterare, it.count)\n',
    b: '',
    t: T, e: 'hash-ul vede FIECARE camp PERSISTED nou al t.3',
  },
  {
    n: 'alterarea mainilor nu intra in hash',
    f: 'src/sim/hash.ts',
    a: '  h.intregi(a.caraAlterare, a.count)\n',
    b: '',
    t: T, e: 'hash-ul vede FIECARE camp PERSISTED nou al t.3',
  },
  {
    n: 'masca refuzata nu intra in hash',
    f: 'src/sim/hash.ts',
    a: '  h.bytes(z.refuzate, z.count)\n',
    b: '',
    t: T, e: 'hash-ul vede FIECARE camp PERSISTED nou al t.3',
  },
  {
    n: 'totalul stricat nu intra in hash',
    f: 'src/sim/hash.ts',
    a: '  h.hiLo(w.hranaStricata)\n',
    b: '',
    t: T, e: 'hash-ul vede FIECARE camp PERSISTED nou al t.3',
  },
  {
    n: 'hiLo taie la 32 de biti (o diferenta de 2^32 se pierde)',
    f: 'src/sim/hash.ts',
    a: '    return this.u32(Math.floor(v / 4294967296)).u32(v % 4294967296)',
    b: '    return this.u32(0).u32(v % 4294967296)',
    t: T, e: 'hash-ul vede FIECARE camp PERSISTED nou al t.3',
  },

  // --- refuzurile, fiecare cu cazul ei ---
  {
    n: 'S negativ pe un morman trece',
    f: 'src/sim/save.ts',
    a: '    if (!Number.isSafeInteger(S) || S < 0) return refuse(Reason.VALOARE_INVALIDA, { camp: `iteme.alterare[${i}]`',
    b: '    if (!Number.isSafeInteger(S)) return refuse(Reason.VALOARE_INVALIDA, { camp: `iteme.alterare[${i}]`',
    t: T, e: 'refuz: S NEGATIV pe un morman',
  },
  {
    n: 'S nesigur pe un morman trece',
    f: 'src/sim/save.ts',
    a: '    if (!Number.isSafeInteger(S) || S < 0) return refuse(Reason.VALOARE_INVALIDA, { camp: `iteme.alterare[${i}]`',
    b: '    if (S < 0) return refuse(Reason.VALOARE_INVALIDA, { camp: `iteme.alterare[${i}]`',
    t: T, e: 'refuz: S NESIGUR pe un morman',
  },
  {
    n: 'plafonul de la decode e q·ONE (v1), nu q·(ONE − 1)',
    f: 'src/sim/save.ts',
    a: '    const max = it.cantitate[i]! * (ONE_ALTERARE - 1)',
    b: '    const max = it.cantitate[i]! * ONE_ALTERARE',
    t: T, e: 'refuz: S peste cantitate·(ONE − 1) pe un morman viu',
  },
  {
    n: 'S pe un slot mort trece',
    f: 'src/sim/save.ts',
    a: "      if (S !== 0) return refuse(Reason.VALOARE_INVALIDA, { camp: `iteme.alterare[${i}]`, valoare: S, motiv: 'S pe un slot mort' })",
    b: '      void S',
    t: T, e: 'refuz: S pe un slot MORT',
  },
  {
    n: 'o mana goala cu S trece',
    f: 'src/sim/save.ts',
    a: "      if (S !== 0) return refuse(Reason.VALOARE_INVALIDA, { camp: `agents.caraAlterare[${i}]`, valoare: S, motiv: 'mana goala cu S ≠ 0' })",
    b: '      void S',
    t: T, e: 'refuz: o mana GOALA',
  },
  {
    n: 'plafonul mainii e q·ONE, nu q·(ONE − 1)',
    f: 'src/sim/save.ts',
    a: '    const max = q * (ONE_ALTERARE - 1)',
    b: '    const max = q * ONE_ALTERARE',
    t: T, e: 'refuz: o mana cu S peste',
  },
  {
    n: 'S negativ sau nesigur in mana trece',
    f: 'src/sim/save.ts',
    a: '    if (!Number.isSafeInteger(S) || S < 0) return refuse(Reason.VALOARE_INVALIDA, { camp: `agents.caraAlterare[${i}]`',
    b: '    if (false) return refuse(Reason.VALOARE_INVALIDA, { camp: `agents.caraAlterare[${i}]`',
    t: T, e: 'refuz: o mana cu S negativ sau nesigur',
  },
  {
    n: 'bitii in afara felurilor trec',
    f: 'src/sim/save.ts',
    a: '    if ((z.refuzate[i]! & ~feluri) !== 0)',
    b: '    if ((z.refuzate[i]! & ~255) !== 0)',
    t: T, e: 'refuz: masca refuzata cu biti in afara felurilor',
  },
  {
    n: 'masca refuzata convertita tacut intr-un octet',
    f: 'src/sim/save.ts',
    a: "    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) {",
    b: '    if (false) {',
    t: T, e: 'refuz: o masca refuzata care nu incape',
  },
  {
    n: 'alterarea convertita tacut in numar (un sir, null, un boolean)',
    f: 'src/sim/save.ts',
    a: "    if (typeof raw[i] !== 'number') return refuse",
    b: '    if (false) return refuse',
    t: T, e: 'refuz: o alterare care nu e un numar',
  },
  {
    n: 'totalul stricat negativ trece',
    f: 'src/sim/save.ts',
    a: '  if (!Number.isSafeInteger(hranaStricata) || hranaStricata < 0) return refuse',
    b: '  if (!Number.isSafeInteger(hranaStricata)) return refuse',
    t: T, e: 'refuz: totalul stricat',
  },
  {
    n: 'totalul stricat lipsa nu e refuzat ca LIPSA',
    f: 'src/sim/save.ts',
    a: "  if (typeof hranaStricata !== 'number') return refuse(Reason.LIPSA_MATERIAL, { camp: 'hranaStricata' })\n",
    b: '',
    t: T, e: 'refuz: totalul stricat',
  },
  {
    n: 'perisabilitatea nu se normalizeaza la decode',
    f: 'src/sim/save.ts',
    a: '  const normalizate = normalizeazaAlterarea(iteme.value, agents, rules)',
    b: '  const normalizate = 0',
    t: T, e: 'un fel NEPERISABIL cu S',
  },
  {
    n: 'normalizarea ignora perisabilitatea (pune pe 0 si hrana)',
    f: 'src/sim/save.ts',
    a: '    if (it.alterare[i] !== 0 && rules.perisabil[it.kind[i]!] !== true) { it.alterare[i] = 0; n++ }',
    b: '    if (it.alterare[i] !== 0) { it.alterare[i] = 0; n++ }',
    t: T, e: 'un fel NEPERISABIL cu S',
  },
  {
    n: 'encode nu valideaza alterarea (scrie ce decode refuza)',
    f: 'src/sim/save.ts',
    a: '  if (!alt.ok) throw new Error(`encode: alterarea nu se poate salva',
    b: '  if (false) throw new Error(`encode: alterarea nu se poate salva',
    t: T, e: 'encode arunca pe ACELEASI conditii',
  },

  // --- migrarea 8 -> 9 ---
  {
    n: 'migrarea 8 -> 9 nu umple alterarea mormanelor',
    f: 'src/sim/save.ts',
    a: '      ...(it ? { iteme: { ...it, alterare: it.alterare ?? zerouri(it.count) } } : {}),',
    b: '      ...(it ? { iteme: { ...it } } : {}),',
    t: T, e: 'migrarea 8 -> 9',
  },
  {
    n: 'migrarea 8 -> 9 nu umple alterarea mainilor',
    f: 'src/sim/save.ts',
    a: '      ...(a ? { agents: { ...a, caraAlterare: a.caraAlterare ?? zerouri(a.count) } } : {}),',
    b: '      ...(a ? { agents: { ...a } } : {}),',
    t: T, e: 'migrarea 8 -> 9',
  },
  {
    n: 'migrarea 8 -> 9 nu umple masca refuzata',
    f: 'src/sim/save.ts',
    a: '      ...(z ? { zone: { ...z, refuzate: z.refuzate ?? zerouri(z.count) } } : {}),',
    b: '      ...(z ? { zone: { ...z } } : {}),',
    t: T, e: 'migrarea 8 -> 9',
  },
  {
    n: 'migrarea 8 -> 9 nu scrie totalul stricat',
    f: 'src/sim/save.ts',
    a: '      hranaStricata: d.hranaStricata ?? 0,',
    b: '      hranaStricata: d.hranaStricata,',
    t: T, e: 'migrarea 8 -> 9',
  },

  // --- content, zone ---
  {
    n: 'perisabil accepta numere in loc de true/false',
    f: 'src/sim/content.ts',
    a: "    if (typeof v !== 'boolean') {",
    b: "    if (typeof v !== 'boolean' && typeof v !== 'number') {",
    t: T, e: 'content: tabelul `perisabil`',
  },
  {
    n: 'creeazaZona nu reseteaza masca refuzata (slotul refolosit o mosteneste)',
    f: 'src/sim/zone.ts',
    a: '  s.refuzate[slot] = 0\n',
    b: '',
    t: T, e: 'slotul de zona REFOLOSIT',
  },

  // =======================================================================================================
  // commit-ul B: curba si pasul (research/hrana-t3.md §2, §3, §5, §9)
  // =======================================================================================================

  // --- curba: validarea continutului (content.ts) ---
  {
    n: 'curba: primul punct cu pierdere nenula trece (pragul n-ar mai fi prag)',
    f: 'src/sim/content.ts',
    a: '  if (puncte[0]![1] !== 0) return refuse(',
    b: '  if (false) return refuse(',
    t: TP, e: 'curba: validarea',
  },
  {
    n: 'curba: T-ul punctelor nestrict crescator trece',
    f: 'src/sim/content.ts',
    a: '    if (tb <= ta) return refuse(',
    b: '    if (false) return refuse(',
    t: TP, e: 'curba: validarea',
  },
  {
    n: 'curba: o pierdere care scade cand T creste trece',
    f: 'src/sim/content.ts',
    a: '    if (pb < pa) return refuse(',
    b: '    if (false) return refuse(',
    t: TP, e: 'curba: validarea',
  },
  {
    n: 'curba: pantele descrescatoare trec (o curba concava)',
    f: 'src/sim/content.ts',
    a: '      if ((pa - p0) * (tb - ta) > (pb - pa) * (ta - t0)) {',
    b: '      if (false) {',
    t: TP, e: 'curba: validarea',
  },
  {
    n: 'curba: λ peste ONE trece (mai mult de o unitate pe unitate si pe pas)',
    f: 'src/sim/content.ts',
    a: '  if (c.lambda[c.lambda.length - 1]! > ONE_ALTERARE) {',
    b: '  if (false) {',
    t: TP, e: 'curba: validarea',
  },
  {
    n: 'curba: a doua raza de mancare sub prima trece',
    f: 'src/sim/content.ts',
    a: '  if (r.mancareScanRadiusLargCells < r.nevoieScanRadiusCells) {',
    b: '  if (false) {',
    t: TP, e: 'curba: validarea',
  },
  {
    n: 'curba: banda moarta nevalidata la parsare',
    f: 'src/sim/content.ts',
    a: '  if (laBanda < 1) {',
    b: '  if (false) {',
    t: TP, e: 'curba: banda moarta',
  },
  {
    n: 'curba: banda moarta judecata la 0,5 °C peste prag, nu la 0,05',
    f: 'src/sim/content.ts',
    a: '  const laBanda = lambdaPeCurba(c, c.tQ16[0]! + ALTERARE_BANDA_Q16)',
    b: '  const laBanda = lambdaPeCurba(c, c.tQ16[0]! + 10 * ALTERARE_BANDA_Q16)',
    t: TP, e: 'curba: banda moarta',
  },
  {
    n: 'curba: λ derivat cu pasii pe zi FICSI (ziTicks si tps ignorate)',
    f: 'src/sim/content.ts',
    a: '    lambda.push(Number((BigInt(ppm) * BigInt(ONE_ALTERARE) * BigInt(tps)) / numitor))',
    b: "    lambda.push(Number((BigInt(ppm) * BigInt(ONE_ALTERARE) * 20n) / (1_000_000n * 40320n)))",
    t: TP, e: 'curba: banda moarta',
  },

  // --- curba: interpolarea (content.ts) ---
  {
    n: 'curba: interpolarea cu round in loc de floor',
    f: 'src/sim/content.ts',
    a: '  return la + Math.floor(((c.lambda[hi]! - la) * (tQ16 - t[lo]!)) / (t[hi]! - t[lo]!))',
    b: '  return la + Math.round(((c.lambda[hi]! - la) * (tQ16 - t[lo]!)) / (t[hi]! - t[lo]!))',
    t: TP, e: 'curba: interpolarea pe λ e EXACTA',
  },
  {
    n: 'curba: λ in TREPTE (fara interpolare intre puncte)',
    f: 'src/sim/content.ts',
    a: '  return la + Math.floor(((c.lambda[hi]! - la) * (tQ16 - t[lo]!)) / (t[hi]! - t[lo]!))',
    b: '  return la',
    t: TP, e: 'curba: tabelul implicit e parabola declarata',
  },
  {
    n: 'curba: peste ultimul punct, rata 0 (cel mai cald loc nu se mai strica)',
    f: 'src/sim/content.ts',
    a: '  if (tQ16 >= t[n - 1]!) return c.lambda[n - 1]!',
    b: '  if (tQ16 >= t[n - 1]!) return 0',
    t: TP, e: 'curba: interpolarea pe λ e EXACTA',
  },
  {
    n: 'pragul mutat cu +0,1 °C (banda moarta de o zecime de grad)',
    f: 'src/sim/content.ts',
    a: '  if (n === 0 || tQ16 <= t[0]!) return 0',
    b: '  if (n === 0 || tQ16 <= t[0]! + 6554) return 0',
    t: TP, e: 'curba: banda moarta',
  },
  {
    n: 'pragul mutat cu −0,1 °C (sub prag se interpoleaza: λ negativ)',
    f: 'src/sim/content.ts',
    a: '  if (n === 0 || tQ16 <= t[0]!) return 0',
    b: '  if (n === 0 || tQ16 <= t[0]! - 6554) return 0',
    t: TP, e: 'pragul:',
  },

  // --- pasul: locul in tick (world.ts) ---
  {
    n: 'pasul de alterare lipseste din tick',
    f: 'src/sim/world.ts',
    a: '  if (w.tick % rules.ticksPerSecond === 0) pasAlterare(w, rules)\n',
    b: '',
    t: TP, e: 'pasul: ordinea in tick',
  },
  {
    n: 'pasul de alterare INAINTE de pasul termic (T-ul de dinaintea pasului, P10)',
    f: 'src/sim/world.ts',
    a: '  if (w.tick % rules.ticksPerSecond === 0) pasTermic(w, rules)\n  // Alterarea hranei',
    b: '  if (w.tick % rules.ticksPerSecond === 0) pasAlterare(w, rules)\n  if (w.tick % rules.ticksPerSecond === 0) pasTermic(w, rules)\n  // Alterarea hranei',
    e2: [{ f: 'src/sim/world.ts', a: '  if (w.tick % rules.ticksPerSecond === 0) pasAlterare(w, rules)\n  w.tick++', b: '  w.tick++' }],
    t: TP, e: 'pasul: ordinea in tick',
  },
  {
    n: 'faza pasului de alterare alta decat cea a pasului termic (% tps === 1)',
    f: 'src/sim/world.ts',
    a: '  if (w.tick % rules.ticksPerSecond === 0) pasAlterare(w, rules)',
    b: '  if (w.tick % rules.ticksPerSecond === 1) pasAlterare(w, rules)',
    t: TP, e: 'pasul: ordinea in tick',
  },

  // --- pasul (alterare.ts) ---
  {
    n: 'perisabilitatea ignorata: si piatra strange S',
    f: 'src/sim/alterare.ts',
    a: '    if (it.alive[i] !== 1 || rules.perisabil[it.kind[i]!] !== true) continue',
    b: '    if (it.alive[i] !== 1) continue',
    t: TP, e: 'pasul: ordinea in tick',
  },
  {
    n: 'pasul strange pe o cantitate gresita (q + 1)',
    f: 'src/sim/alterare.ts',
    a: '    const dS = q * lambda',
    b: '    const dS = (q + 1) * lambda',
    t: TP, e: 'pasul: ordinea in tick',
  },
  {
    n: 'unitatile stricate nu ajung in raportul tickului',
    f: 'src/sim/alterare.ts',
    a: '    raport.unitatiStricate += n\n',
    b: '',
    t: TP, e: 'pasul: ordinea in tick',
  },
  {
    n: 'S-ul strans de pas nu se numara in alterareAcumulata (G1S)',
    f: 'src/sim/alterare.ts',
    a: '    w.ratiune.alterareAcumulata += dS\n',
    b: '',
    t: T, e: 'G1S + G1 la FIECARE tick',
  },
  {
    n: 'rata evaluata pe fiecare MORMAN, nu o data pe componenta si trecere (J-3)',
    f: 'src/sim/alterare.ts',
    a: '      if (l === undefined) {',
    b: '      if (true) {',
    t: TP, e: 'K05 pe contoare: la fiecare pas',
  },
  {
    n: 'rata cerului evaluata pe fiecare morman de sub cer',
    f: 'src/sim/alterare.ts',
    a: '        if (lambdaCer < 0) {',
    b: '        if (true) {',
    t: TP, e: 'K05 pe contoare: la fiecare pas',
  },
  {
    n: 'componenta fara T: mormanul sare, dar nu se numara',
    f: 'src/sim/alterare.ts',
    a: '      if (l === null) { st.faraT++; continue }',
    b: '      if (l === null) continue',
    t: TP, e: 'componenta fara T',
  },
  {
    n: 'componenta fara T: se ghiceste T_afara',
    f: 'src/sim/alterare.ts',
    a: '        l = t === null ? null : lambdaPeCurba(curba, t)',
    b: '        l = lambdaPeCurba(curba, t ?? tAfara(w.seed, w.tick, rules))',
    t: TP, e: 'componenta fara T',
  },
  {
    n: 'tocul cu un vecin fara T: se ghiceste T_afara',
    f: 'src/sim/alterare.ts',
    a: '        if (t === null) { st.faraT++; continue }\n        lambda = lambdaPeCurba(curba, t)',
    b: '        lambda = lambdaPeCurba(curba, t ?? tA)',
    t: TP, e: 'componenta fara T',
  },
  {
    n: 'la λ = 0 nu se realizeaza S ≥ ONE (P14 neaplicat)',
    f: 'src/sim/alterare.ts',
    a: '    if (k > 0) {\n      ids.push(',
    b: '    if (k > 0 && lambda > 0) {\n      ids.push(',
    t: TP, e: 'pivnita sub casa, un anotimp intreg',
  },
  {
    n: 'moartea din alterare fara reconciliazaTintaMoarta (job zombi, rezervare orfana)',
    f: 'src/sim/alterare.ts',
    a: '      reconciliazaTintaMoarta(w, rules, id)\n',
    b: '',
    t: TP, e: 'moartea din alterare',
  },

  // --- tocul (temperatura.ts) si a treia trecere (iteme.ts) ---
  {
    n: 'tocul: regula ignorata (T_afara, ca la v1)',
    f: 'src/sim/temperatura.ts',
    a: '  return max ?? tA\n}',
    b: '  return tA\n}',
    t: TP, e: 'tocul: regula PERMANENTA',
  },
  {
    n: 'tocul: partea mai RECE in loc de cea mai calda',
    f: 'src/sim/temperatura.ts',
    a: '      if (max === null || t > max) max = t',
    b: '      if (max === null || t < max) max = t',
    t: TP, e: 'tocul: regula PERMANENTA',
  },
  {
    n: 'tocul: vecinul sub cer ignorat',
    f: 'src/sim/temperatura.ts',
    a: '      if (max === null || tA > max) max = tA\n',
    b: '',
    t: TP, e: 'tocul: regula PERMANENTA',
  },
  {
    n: 'tocul: un vecin fara T se sare (in loc de null)',
    f: 'src/sim/temperatura.ts',
    a: '      if (t === null) return null\n',
    b: '      if (t === null) continue\n',
    t: TP, e: 'tocul: regula PERMANENTA',
  },
  {
    n: 'asazaItem: tocul in prima trecere (marfa pe usa desi e loc langa)',
    f: 'src/sim/iteme.ts',
    a: '          if (trecere === 2 ? !toc : toc) continue\n',
    b: '          if (trecere === 2) continue\n',
    t: TP, e: 'asazaItem: tocul usii e a TREIA trecere',
  },
  {
    n: 'asazaItem: tocul interzis (v1: marfa se pierde cand vecinii sunt plini)',
    f: 'src/sim/iteme.ts',
    a: '          if (trecere === 2 ? !toc : toc) continue\n',
    b: '          if (toc) continue\n',
    t: TP, e: 'asazaItem: tocul usii e a TREIA trecere',
  },

  // --- indexul de zone: predicatul X (zone.ts) si costul (iteme.ts) ---
  {
    n: 'indexul (M): stricaciunea murdareste doar la moarte',
    f: 'src/sim/zone.ts',
    a: '  if (ix.murdar) return false\n  const it = w.iteme\n',
    b: '  return false\n  const it = w.iteme\n',
    t: TP, e: 'indexul de zone, predicatul EXACT',
  },
  {
    n: 'indexul: fara clauza (a) — mormanul PLIN de pe o celula de depozit',
    f: 'src/sim/zone.ts',
    a: '    if (q0 >= rules.itemStackMax) return true\n',
    b: '',
    t: TP, e: 'indexul de zone, predicatul EXACT',
  },
  {
    n: 'indexul: fara clauza (b) — locul nou peste maxLocLiber',
    f: 'src/sim/zone.ts',
    a: '    if (rules.itemStackMax - q1 > ix.maxLocLiber[zs * ITEME + k]!) return true\n',
    b: '',
    t: TP, e: 'indexul de zone, predicatul EXACT',
  },
  {
    n: 'indexul: fara clauza (c) — apartenenta proprie la deMutat',
    f: 'src/sim/zone.ts',
    a: '  return inainte !== dupa\n',
    b: '  return false\n',
    t: TP, e: 'indexul de zone, predicatul EXACT',
  },
  {
    n: 'indexul (D): orice unitate stricata murdareste indexul (112–130 de pasi de index pe tick)',
    f: 'src/sim/iteme.ts',
    a: '  if (schimba) marcheazaZoneMurdare(w)\n',
    b: '  marcheazaZoneMurdare(w)\n',
    t: TP, e: 'K05 pe contoare (verif-P3)',
  },

  // --- a doua cautare de mancare (joburi.ts) ---
  {
    n: 'a doua cautare de mancare lipseste (J-8)',
    f: 'src/sim/joburi.ts',
    a: '  return cautaMancareInRaza(w, rules, slot, rules.mancareScanRadiusLargCells)\n',
    b: '  return null\n',
    t: TP, e: 'a doua cautare de mancare',
  },
  {
    n: 'cautarea de mancare fara raza (toata lumea, si dincolo de a doua raza)',
    f: 'src/sim/joburi.ts',
    a: '    if (d > raza) continue\n',
    b: '',
    t: TP, e: 'a doua cautare de mancare',
  },
]
