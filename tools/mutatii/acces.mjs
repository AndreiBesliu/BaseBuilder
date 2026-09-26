/**
 * Mutatii: S20-23, taietura 5 — accesul vertical.
 *
 * Doua panouri de design au demontat primele doua versiuni (22 de CRITIC/MARE, apoi
 * inca 8): siguranta pionului depindea de desemnarile RAMASE, deci memoria decidea si
 * M5 se rupea; colturile etajelor n-aveau loc de lucru; regula de sigilare infometa
 * constructorul. Fiecare garda de aici are testul ei, iar numele probei spune ce apara.
 */

export const MUTATII = [
  // --- pasul 2: continutul ---
  {
    n: 'atingerea poate cobori SUB pas (invariantul pierde capatul de jos)',
    f: 'src/sim/content.ts',
    a: '  if (r.atingereSusM < r.maxStepM || r.atingereSusM > r.agentHeadroomM) {',
    b: '  if (r.atingereSusM > r.agentHeadroomM) {',
    t: 'tests/content.test.ts', e: 'atingerea la zidire: cel putin un pas',
  },
  {
    n: 'atingerea poate trece PESTE cap (invariantul pierde capatul de sus)',
    f: 'src/sim/content.ts',
    a: '  if (r.atingereSusM < r.maxStepM || r.atingereSusM > r.agentHeadroomM) {',
    b: '  if (r.atingereSusM < r.maxStepM) {',
    t: 'tests/content.test.ts', e: 'atingerea la zidire: cel putin un pas',
  },
  {
    n: 'pragul natural al accesului poate trece de plafonul total',
    f: 'src/sim/content.ts',
    a: '  if (r.accesPlafonNatural > r.accesPlafonTotal) {',
    b: '  if (r.accesPlafonNatural > r.accesPlafonTotal + 1000000) {',
    t: 'tests/content.test.ts', e: 'pragul natural al accesului nu poate trece',
  },
  {
    n: 'o piesa poate fi dintr-un material NATURAL',
    f: 'src/sim/content.ts',
    a: '    if (!esteMaterialDeStructura(mat[1])) {',
    b: '    if (!isSolid(mat[1])) {',
    t: 'tests/content.test.ts', e: 'o piesa dintr-un material NATURAL e refuzata',
  },
  {
    n: 'orice solid e „de structura" (roca, pamant, moloz numara ca zid)',
    f: 'src/sim/terrain/chunk.ts',
    a: '  return m === Material.PIATRA_CONSTRUITA || m === Material.GRINDA || m === Material.LEMN_CONSTRUIT',
    b: '  return isSolid(m)',
    t: 'tests/content.test.ts', e: 'o piesa dintr-un material NATURAL e refuzata',
  },
  {
    n: 'plafoanele de acces fara plafon de COST',
    f: 'src/sim/content.ts',
    a: '  accesPlafonTotal: { min: 1, max: 16384 },',
    b: '  accesPlafonTotal: { min: 1, max: 1000000 },',
    t: 'tests/content.test.ts', e: 'plafoanele accesului au un plafon de COST',
  },
  {
    n: 'pragul de ridicare nu se mai taie la cantitatea piesei',
    f: 'src/sim/joburi.ts',
    a: '  return Math.min(rules.constructPickupMinUnits, spec.cantitate)',
    b: '  return rules.constructPickupMinUnits',
    t: 'tests/constructie.test.ts', e: 'o piesa de 5 are pragul 5',
  },
  // --- pasul 3: modulul pur ---
  {
    n: 'pragul natural devine strict (o incinta de exact N celule naturale ramane punga)',
    f: 'src/sim/acces.ts',
    a: '        if (naturale >= pragN || celule.length > pragT) deschisa = true',
    b: '        if (naturale > pragN || celule.length > pragT) deschisa = true',
    t: 'tests/acces.test.ts', e: 'pragul NATURAL la granita',
  },
  {
    n: 'plafonul total devine nestrict (un acoperis de exact T celule e declarat deschis)',
    f: 'src/sim/acces.ts',
    a: '        if (naturale >= pragN || celule.length > pragT) deschisa = true',
    b: '        if (naturale >= pragN || celule.length >= pragT) deschisa = true',
    t: 'tests/acces.test.ts', e: 'pragul TOTAL la granita',
  },
  {
    n: 'graful stabil uita santierul din CELULA (se sta pe o piesa planificata)',
    f: 'src/sim/acces.ts',
    a: '      if (C.has(cellKey(x, y, z))) return false\n      if (!isSolid(materialCitit(r, x, y, z - 1))',
    b: '      if (!isSolid(materialCitit(r, x, y, z - 1))',
    t: 'tests/acces.test.ts', e: 'graful STABIL e exact',
  },
  {
    n: 'graful stabil uita santierul din CAP',
    f: 'src/sim/acces.ts',
    a: '        if (isSolid(materialCitit(r, x, y, z + h)) || C.has(cellKey(x, y, z + h))) return false',
    b: '        if (isSolid(materialCitit(r, x, y, z + h))) return false',
    t: 'tests/acces.test.ts', e: 'graful STABIL e exact',
  },
  {
    n: 'graful stabil nu vede podeaua zidita IPOTETIC',
    f: 'src/sim/acces.ts',
    a: '      if (!isSolid(materialCitit(r, x, y, z - 1)) && !(Z !== null && Z.has(cellKey(x, y, z - 1)))) return false',
    b: '      if (!isSolid(materialCitit(r, x, y, z - 1))) return false',
    t: 'tests/acces.test.ts', e: 'graful STABIL e exact',
  },
  {
    n: 'podeaua de STRUCTURA numara ca naturala (acoperisul fara scara devine „afara")',
    f: 'src/sim/acces.ts',
    a: '      const m = materialCitit(r, x, y, z - 1)\n      return isSolid(m) && !esteMaterialDeStructura(m)\n    },\n  }\n}\n\n/**\n * Graful lui W',
    b: '      const m = materialCitit(r, x, y, z - 1)\n      return isSolid(m)\n    },\n  }\n}\n\n/**\n * Graful lui W',
    t: 'tests/acces.test.ts', e: 'podeaua NATURALA',
  },
  {
    n: 'piesa zidita IPOTETIC numara ca podea naturala',
    f: 'src/sim/acces.ts',
    a: '      if (Z !== null && Z.has(cellKey(x, y, z - 1))) return false\n      const m = materialCitit(r, x, y, z - 1)',
    b: '      const m = materialCitit(r, x, y, z - 1)',
    t: 'tests/acces.test.ts', e: 'podeaua NATURALA',
  },
  {
    n: 'coloana nepromovata: pamantul coboara un nivel mai putin',
    f: 'src/sim/acces.ts',
    a: '      mat[l] = z > g ? Material.AER : z === g ? sus : z > g - 3 ? Material.PAMANT : Material.ROCA',
    b: '      mat[l] = z > g ? Material.AER : z === g ? sus : z > g - 2 ? Material.PAMANT : Material.ROCA',
    t: 'tests/acces.test.ts', e: 'citirea pe coloana spune EXACT',
  },
  {
    n: 'afara din lume e AER, nu stanca',
    f: 'src/sim/acces.ts',
    a: '  if (c.afara) return Material.ROCA',
    b: '  if (c.afara) return Material.AER',
    t: 'tests/acces.test.ts', e: 'citirea pe coloana spune EXACT',
  },
  {
    n: 'flood-ul merge doar pe acelasi nivel (pasul de 1 m nu leaga)',
    f: 'src/sim/acces.ts',
    a: '      for (let dz = -pas; dz <= pas && !deschisa; dz++) {',
    b: '      for (let dz = 0; dz <= 0 && !deschisa; dz++) {',
    t: 'tests/acces.test.ts', e: 'siguranta pura',
  },
  {
    n: 'diagonalele INAINTEA ortogonalelor (locul de lucru se muta fara motiv)',
    f: 'src/sim/acces.ts',
    a: 'const DIR8: readonly (readonly [number, number])[] = [...DIR4, [1, 1], [-1, 1], [1, -1], [-1, -1]]',
    b: 'const DIR8: readonly (readonly [number, number])[] = [[1, 1], [-1, 1], [1, -1], [-1, -1], ...DIR4]',
    t: 'tests/acces.test.ts', e: 'nivelurile si vecinatatea',
  },
  {
    n: 'zidirea nu mai ajunge deasupra capului (atingerea = pasul)',
    f: 'src/sim/acces.ts',
    a: '  const jos = fel === FelLucru.CONSTRUIESTE || fel === FelLucru.DECONSTRUIESTE ? Math.max(pas, rules.atingereSusM) : pas',
    b: '  const jos = pas',
    t: 'tests/acces.test.ts', e: 'nivelurile si vecinatatea',
  },
]
