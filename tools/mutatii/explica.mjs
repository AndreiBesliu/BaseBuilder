/**
 * Mutatii: recenzia explicatiei „De ce nu e incapere?" (src/sim/camere-explica.ts) si a uneltei Usa
 * (viewer/usi.ts) — EXP-1..EXP-8, ECR-9. Fiecare proba strica o garda a reparatiei si numeste testul
 * scris pentru ea.
 */

const E = 'src/sim/camere-explica.ts'
const U = 'viewer/usi.ts'
const TE = 'tests/camere-explica.test.ts'
const TV = 'tests/viewer-camere.test.ts'

export const MUTATII = [
  // --- EXP-1: golul de langa un stalp nu e usa
  {
    n: 'EXP-1: laturile golului nu se cer zid (coltul dintre stalp si zid e „usa")',
    f: E,
    a: '        if (!golInZid(lume, g, dx, dy)) continue',
    b: '        void golInZid',
    t: TE, e: 'explica (EXP-1): un stalp langa zid',
  },
  {
    n: 'EXP-1: orice solid e zid (pragul de 3 celule lipseste, stalpul trece drept latura)',
    f: E,
    a: '  if (q.aer(x, y, z)) return false\n  const vazut = new Set<number>([cheieCelula(x, y, z)])\n  const stiva',
    b: '  if (q.aer(x, y, z)) return false\n  return true\n  const vazut = new Set<number>([cheieCelula(x, y, z)])\n  const stiva',
    t: TE, e: 'explica (EXP-1): sala 13x13 cu grila de stalpi',
  },
  {
    n: 'EXP-1: montantul dintre doua goluri nu tine loc de zid (doua usi despartite de o celula raman fara sfat)',
    f: E,
    a: '    return !dinCap && zid(q, ax, ay, z)',
    b: '    return false',
    t: TE, e: 'explica (EXP-1): doua goluri despartite de o celula de zid',
  },
  {
    n: 'EXP-1: un stalp in linie cu un perete vazut din capat trece drept montant',
    f: E,
    a: '    return !dinCap && zid(q, ax, ay, z)',
    b: '    return zid(q, ax, ay, z)',
    t: TE, e: 'explica (EXP-1): un stalp langa zid',
  },
  {
    n: 'EXP-1: usile de prisos nu se scot (o usa langa stalp, pe langa golul casei)',
    f: E,
    a: '      if (!proba.inchisa) continue',
    b: '      if (proba.inchisa || !proba.inchisa) continue',
    t: TE, e: 'explica (EXP-1): un stalp langa zid',
  },
  // --- EXP-2: acoperisul neterminat
  {
    n: 'EXP-2: umplerea cerului nu se intreaba (acoperisul neterminat ramane „gol in perete")',
    f: E,
    a: "  if (directie === 'LATERAL' && usi.length === 0 && cerInchisDeAcoperis(r, L)) {",
    b: '  if (false) {',
    t: TE, e: 'explica (EXP-2): acoperisul neterminat',
  },
  {
    n: 'EXP-2: umplerea decide si cu un gol de usa pe drum (streasina din curte iese SUS)',
    f: E,
    a: "  if (directie === 'LATERAL' && usi.length === 0 && cerInchisDeAcoperis(r, L)) {",
    b: "  if (directie === 'LATERAL' && cerInchisDeAcoperis(r, L)) {",
    t: TE, e: 'explica (EXP-2): golul usii spre o curte inchisa, sub o streasina',
  },
  {
    n: 'EXP-2: regula sfertului lipseste (orice cer inchis e gaura in acoperis)',
    f: E,
    a: '  return acoperit * 4 >= acoperit + plin',
    b: '  return true',
    t: TE, e: 'explica (EXP-2): o deschidere lata de 3',
  },
  // --- EXP-3: cota gaurii
  {
    n: 'EXP-3: cota gaurii din coloana de dincolo de scurgere (varful turnului)',
    f: E,
    a: '  const v = varfLa(r, dinainte.x, dinainte.y)',
    b: '  const v = varfLa(r, 2 * L.x - dinainte.x, 2 * L.y - dinainte.y)',
    t: TE, e: 'explica (EXP-3)',
  },
  // --- EXP-4: bugetul
  {
    n: 'EXP-4: bugetul e pe inundare, nu pe explicatie',
    f: E,
    a: '    if (cost.celule >= EXPLICA_BUGET) break',
    b: '    if (cap >= EXPLICA_BUGET) break',
    t: TE, e: 'explica (EXP-4)',
  },
  {
    n: 'EXP-4: fara buget (o mina imensa se inunda toata)',
    f: E,
    a: '    if (cost.celule >= EXPLICA_BUGET) break',
    b: '    void 0',
    t: TE, e: 'explica (EXP-4)',
  },
  // --- EXP-5: chepengul langa zid
  {
    n: 'EXP-5: un zid care urca peste placa refuza chepengul',
    f: E,
    a: '      } else if (q.aer(nx, ny, z + 1)) {\n        placa++\n      }',
    b: '      } else if (!q.aer(nx, ny, z + 1)) {\n        return null\n      } else {\n        placa++\n      }',
    t: TV, e: 'viewer usa (EXP-5): chepengul langa zidul care urca',
  },
  {
    n: 'EXP-5: golul de perete are intaietate fata de gaura din placa (usa verticala de 3 peste un coridor)',
    f: E,
    a: '  const h = gauraDinPlaca(q, x, y, z)\n  if (h) return h\n  for (const [dx, dy] of [[0, 1], [1, 0]] as const) {\n    const g = golDeUsa(q, { x, y, z }, dx, dy)\n    if (g) return g\n  }\n  return null',
    b: '  for (const [dx, dy] of [[0, 1], [1, 0]] as const) {\n    const g = golDeUsa(q, { x, y, z }, dx, dy)\n    if (g) return g\n  }\n  return gauraDinPlaca(q, x, y, z)',
    t: TV, e: 'viewer usa (EXP-5, EXP-8): gaura unei placi peste un coridor ingust',
  },
  {
    n: 'EXP-5: o gaura fara nicio vecina placa e chepeng (fundul unui put)',
    f: E,
    a: '  if (placa === 0) return null',
    b: '  void placa',
    t: TV, e: 'viewer usa (EXP-8, ECR-9): o groapa',
  },
  // --- EXP-8 / ECR-9: gropi, sapaturi desemnate
  {
    n: 'EXP-8: golul nu cere trecere (o groapa in sol e gol de usa)',
    f: E,
    a: '  if (cuTrecere && !(q.aer(c.x + dx, c.y + dy, zlo) && q.aer(c.x - dx, c.y - dy, zlo))) return null',
    b: '  void cuTrecere',
    t: TV, e: 'viewer usa (EXP-8, ECR-9): o groapa',
  },
  {
    n: 'EXP-8: ingustarea de dinaintea golului cere si ea trecere (usa in mijlocul pivnitei late de 2)',
    f: E,
    a: '        const inainte = ingustare(lume, a, dx, dy, false)',
    b: '        const inainte = ingustare(lume, a, dx, dy, true)',
    t: TE, e: 'explica: o pivnita lata de 2',
  },
  {
    n: 'EXP-8: lumea planului nu vede sapaturile desemnate',
    f: U,
    a: '      if (m !== Material.AER && m !== Material.USA) return sapat(x, y, z)',
    b: '      if (m !== Material.AER && m !== Material.USA) return false',
    t: TV, e: 'viewer usa (EXP-8, ECR-9): golul unei pivnite desemnate',
  },
  // --- EXP-7 (c): podeaua pe niveluri
  {
    n: 'EXP-7: aerul de deasupra treptelor e un nivel de podea („podea pe 4 niveluri")',
    f: E,
    a: '  return niveluri.filter(([, n]) => n >= prag)',
    b: '  return niveluri',
    t: TE, e: 'explica (EXP-7, JUC-12)',
  },
  {
    n: 'EXP-7: chepengul (USA) e podea',
    f: E,
    a: '    if (jos.ok && ePodea(jos.value)) pe.set(z, (pe.get(z) ?? 0) + 1)',
    b: '    if (jos.ok && jos.value !== Material.AER) pe.set(z, (pe.get(z) ?? 0) + 1)',
    t: TE, e: 'explica (EXP-7, JUC-12)',
  },
]
