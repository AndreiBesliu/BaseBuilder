/**
 * Mutatii: grinda (S20-23, taietura 4).
 *
 * Intai indexul DERIVED al grinzilor: tinut la zi in `editAt`, reconstruit la
 * incarcare. Un index care se desincronizeaza nu e un cost in plus — pe el se
 * sprijina regula, deci ar fi fizica diferita intre lumea continua si cea incarcata.
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
]
