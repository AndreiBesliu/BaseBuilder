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
]
