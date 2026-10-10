/**
 * Mutatii: S24-27 t.3, commit-ul A — formatul alterarii (research/hrana-t3.md §1, §7, §9). Rata e 0 peste tot: S-ul il
 * scriu testele, iar fiecare proba strica o garantie a FORMATULUI si numeste testul scris pentru ea.
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
    n: 'mana se strica (bucla pe maini a prototipului H1, la 1 Hz)',
    f: 'src/sim/world.ts',
    a: '  if (w.tick % rules.ticksPerSecond === 0) pasTermic(w, rules)\n',
    b: '  if (w.tick % rules.ticksPerSecond === 0) pasTermic(w, rules)\n  if (w.tick % rules.ticksPerSecond === 0) for (let i = 0; i < w.agents.count; i++) if (w.agents.caraCantitate[i]! > 0) w.agents.caraAlterare[i] = w.agents.caraAlterare[i]! + w.agents.caraCantitate[i]!\n',
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
]
