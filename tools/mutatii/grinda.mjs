/**
 * Mutatii: grinda (S20-23, taietura 4).
 *
 * Intai indexul DERIVED al grinzilor: tinut la zi in `editAt`, reconstruit la
 * incarcare. Un index care se desincronizeaza nu e un cost in plus — pe el se
 * sprijina regula, deci ar fi fizica diferita intre lumea continua si cea incarcata.
 *
 * Apoi regula stratificata: `s1` din grinzile ACTIVE, discurile de invalidare (a, b,
 * c), multimea care cade calculata INAINTE de sapat, memoria activitatii si coada
 * deduplicata (cele doua din urma sunt cost, nu corectitudine: le prind plafoanele
 * K05), grinzile planificate ale inchiderii, prefiltrul overlay-ului si „De ce nu?".
 */

export const MUTATII = [
  {
    n: 'indexul nu scoate grinda sapata (ramane o grinda-fantoma in lumea continua)',
    f: 'src/sim/terrain/terrain.ts',
    a: '  if (current.value === Material.GRINDA) scoateGrinda(t.grinzi, wx, wy, z)',
    b: '  void scoateGrinda',
    t: 'tests/grinda.test.ts', e: 'indexul de grinzi e DERIVED',
  },
  {
    n: 'indexul nu vede grinda zidita',
    f: 'src/sim/terrain/terrain.ts',
    a: '  if (material === Material.GRINDA) adaugaGrinda(t.grinzi, wx, wy, z)',
    b: '  void adaugaGrinda',
    t: 'tests/grinda.test.ts', e: 'indexul de grinzi e DERIVED',
  },
  {
    n: 'indexul nu se reconstruieste la incarcare (lumea incarcata n-are grinzi)',
    f: 'src/sim/save.ts',
    a: '  reconstruiesteGrinzi(terrain)',
    b: '  void reconstruiesteGrinzi',
    t: 'tests/grinda.test.ts', e: 'indexul de grinzi e DERIVED',
  },
  {
    n: 'lista unui chunk ramasa goala nu se sterge (indexul continuu difera ca forma de cel reconstruit)',
    f: 'src/sim/terrain/terrain.ts',
    a: '  if (lista.length === 0) index.delete(ck)',
    b: '  void ck',
    t: 'tests/grinda.test.ts', e: 'indexul de grinzi e DERIVED',
  },
  {
    n: 's1 ignorat la propagare: tot ce sta prin grinzi cade in previzualizare, nu si in oracol',
    f: 'src/sim/stabilitate.ts',
    a: '    : caveazaSpreAsezat(t, rules, wx, wy, z, ip.cazute, ip.zidite)\n  if (s0 >= plafon) return plafon\n  return Math.min(plafon, Math.max(s0, suportDinGrinzi(t, rules, wx, wy, z, ip)))',
    b: '    : caveazaSpreAsezat(t, rules, wx, wy, z, ip.cazute, ip.zidite)\n  if (s0 >= plafon) return plafon\n  return Math.min(plafon, s0)',
    t: 'tests/grinda.test.ts', e: 'PROPRIETATE: pe scene aleatoare',
  },
  {
    n: 's1 ignorat la zidire: grinda nu mai duce fasia dincolo de 3',
    f: 'src/sim/stabilitate.ts',
    a: '    : caveazaSpreAsezat(t, rules, wx, wy, z, null, ip.zidite)\n  if (s0 >= plafon) return plafon\n  return Math.min(plafon, Math.max(s0, suportDinGrinzi(t, rules, wx, wy, z, ip)))',
    b: '    : caveazaSpreAsezat(t, rules, wx, wy, z, null, ip.zidite)\n  if (s0 >= plafon) return plafon\n  return Math.min(plafon, s0)',
    t: 'tests/grinda.test.ts', e: 'fasia din zid',
  },
  {
    n: 'orice grinda in picioare e activa (una plutitoare tine podeaua)',
    f: 'src/sim/stabilitate.ts',
    a: '    if (!activa(t, rules, x, y, z, ip)) continue',
    b: '    void activa',
    t: 'tests/grinda.test.ts', e: 'o grinda plutitoare nu tine nimic',
  },
  {
    n: 'candidatul nu trebuie sa fie din material GRINDA (intrarea veche din index devine grinda-fantoma)',
    f: 'src/sim/stabilitate.ts',
    a: '  return materialFast(t, x, y, z) === Material.GRINDA',
    b: '  return true',
    t: 'tests/grinda.test.ts', e: 'o intrare VECHE in index',
  },
  {
    n: 'activitatea nu se memoreaza (un BFS per candidat per interogare)',
    f: 'src/sim/stabilitate.ts',
    a: '  if (ip.activ !== null && (a || !ip.doarPozitive)) ip.activ.set(k, a)',
    b: '  void k',
    t: 'tests/grinda.test.ts', e: 'K05: o grinda departe',
  },
  {
    n: 'inchiderea memoreaza si „inactiva" (o grinda activata mai tarziu de plan ramane inactiva)',
    f: 'src/sim/stabilitate.ts',
    a: '  if (ip.activ !== null && (a || !ip.doarPozitive)) ip.activ.set(k, a)',
    b: '  if (ip.activ !== null) ip.activ.set(k, a)',
    t: 'tests/grinda.test.ts', e: 'S6e: o grinda care se DEZACTIVEAZA',
  },
  {
    n: 'inchiderea ignora grinzile planificate',
    f: 'src/sim/stabilitate.ts',
    a: 'grinziPlan: grinzi.length > 0 ? plan : null',
    b: 'grinziPlan: null',
    t: 'tests/grinda.test.ts', e: 'inchiderea de constructie cu grinzi PLANIFICATE',
  },
  {
    n: 'coada din propaga nu se deduplica',
    f: 'src/sim/stabilitate.ts',
    a: '    if (inAsteptare.has(k)) return',
    b: '    if (inAsteptare.size < 0) return',
    t: 'tests/grinda.test.ts', e: 'K05: o grinda departe',
  },
  {
    n: 'discul (a) lipseste: grinda care cade nu re-verifica ce tinea',
    f: 'src/sim/stabilitate.ts',
    a: '    if (materialFast(t, x, y, z) === Material.GRINDA) discGrinda(x, y, z)',
    b: '    void Material',
    t: 'tests/grinda.test.ts', e: 'S6d: sapi grinda',
  },
  {
    n: 'discul (b) lipseste: grinzile care se dezactiveaza nu re-verifica ce tineau',
    f: 'src/sim/stabilitate.ts',
    a: '        if (activa(t, rules, bx, by, bz, ip) !== anterior) discGrinda(bx, by, bz)',
    b: '        activa(t, rules, bx, by, bz, ip)',
    t: 'tests/grinda.test.ts', e: 'S6e: o grinda care se DEZACTIVEAZA',
  },
  {
    n: 'discul (b) fara conditie: fiecare grinda din preajma isi emite discul',
    f: 'src/sim/stabilitate.ts',
    a: '        if (activa(t, rules, bx, by, bz, ip) !== anterior) discGrinda(bx, by, bz)',
    b: '        if (activa(t, rules, bx, by, bz, ip) !== anterior || true) discGrinda(bx, by, bz)',
    t: 'tests/grinda.test.ts', e: 'K05: o grinda departe',
  },
  {
    n: 'memoria activitatii nu se goleste la cadere (activitatea veche ascunde dezactivarea)',
    f: 'src/sim/stabilitate.ts',
    a: '        activ.delete(kb)',
    b: '        void kb',
    t: 'tests/grinda.test.ts', e: 'S6e: o grinda care se DEZACTIVEAZA',
  },
  {
    n: 'activitatea dinaintea sapaturii nu se tine minte (samanta nu schimba nimic, in aparenta)',
    f: 'src/sim/stabilitate.ts',
    a: '            anterior = inainte.get(kb) ?? false',
    b: '            anterior = s0Pozitiv(t, rules, bx, by, bz, ip)',
    t: 'tests/grinda.test.ts', e: 'S6e: o grinda care se DEZACTIVEAZA',
  },
  {
    n: 'discul (c) lipseste: un drum spre o grinda activa care trecea prin celula cazuta',
    f: 'src/sim/stabilitate.ts',
    a: '      discGrinda(x, y, z)\n      break',
    b: '      break',
    t: 'tests/grinda.test.ts', e: 'PROPRIETATE: pe scene aleatoare',
  },
  {
    n: 'multimea care cade se calculeaza DUPA sapat (grinda sapata a iesit deja din index)',
    f: 'src/sim/joburi.ts',
    a: '  const cad = multimeaCareCade(w.terrain, rules, wx, wy, z)\n  const out = dig(w.terrain, wx, wy, z)\n  if (!out.ok) return out',
    b: '  const out = dig(w.terrain, wx, wy, z)\n  if (!out.ok) return out\n  const cad = multimeaCareCade(w.terrain, rules, wx, wy, z)',
    t: 'tests/grinda.test.ts', e: 'S6d: sapi grinda',
  },
  {
    n: 'grinziInRaza nu taie chunk-urile la lume (grinda de la est apare la vest)',
    f: 'src/sim/terrain/terrain.ts',
    a: '  const cx0 = Math.max(0, Math.floor((wx - raza) / CHUNK_CELLS))',
    b: '  const cx0 = Math.floor((wx - raza) / CHUNK_CELLS)',
    t: 'tests/grinda.test.ts', e: 'grinziInRaza: doar cota ceruta',
  },
  {
    n: 'grinziInRaza intoarce si cota de deasupra',
    f: 'src/sim/terrain/terrain.ts',
    a: '      const sus = cheieLocala(CHUNK_CELLS - 1, lyMax, z)',
    b: '      const sus = cheieLocala(CHUNK_CELLS - 1, lyMax, z + 1)',
    t: 'tests/grinda.test.ts', e: 'grinziInRaza: doar cota ceruta',
  },
  {
    n: 'grinziInRaza nu filtreaza pe Manhattan (intoarce cutia)',
    f: 'src/sim/terrain/terrain.ts',
    a: '        if (Math.abs(x - wx) + Math.abs(y - wy) <= raza) out.push(x, y)',
    b: '        out.push(x, y)',
    t: 'tests/grinda.test.ts', e: 'grinziInRaza: doar cota ceruta',
  },
  {
    n: 'prefiltrul ramane pe raza de sol si langa grinzi',
    f: 'src/sim/stabilitate.ts',
    a: '  const raza = aproape.length > 0 ? Math.max(rules.suportMax, rules.suportRazaGrinda) : rules.suportMax',
    b: '  const raza = rules.suportMax',
    t: 'tests/grinda.test.ts', e: 'prefiltrul overlay-ului: langa o grinda',
  },
  {
    n: 'prefiltrul cauta grinzi doar in fereastra (nu si pe cele din afara, care tin celule din ea)',
    f: 'src/sim/stabilitate.ts',
    a: '  grinziInRaza(t.grinzi, x0 + jum, y0 + jum, zA, 2 * jum + rules.suportRazaGrinda, aproape)',
    b: '  grinziInRaza(t.grinzi, x0 + jum, y0 + jum, zA, jum, aproape)',
    t: 'tests/grinda.test.ts', e: 'prefiltrul overlay-ului: langa o grinda',
  },
  {
    n: '„De ce nu?" spune mereu ca grinda din raza e activa',
    f: 'src/sim/stabilitate.ts',
    a: 'grindaActiva: eActiva ? 1 : 0,',
    b: 'grindaActiva: 1,',
    t: 'tests/grinda.test.ts', e: '„De ce nu?" deosebeste',
  },
]
