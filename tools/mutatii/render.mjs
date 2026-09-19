/**
 * Mutatii: randarea.
 *
 * Prima suita din afara lui `src/sim/`. Exista fiindca ocluzia ambientala a venit
 * cu cinci teste si zero probe — adica exact situatia in care un test care nu mai
 * exercita nimic arata la fel cu unul care apara ceva.
 *
 * Fisierul de test se ruleaza INTREG la fiecare proba, deci si scurgerile intre
 * teste (starea reutilizata intre chunk-uri) se vad.
 */

export const MUTATII = [
  {
    n: 'ocuparea nu se goleste intre chunk-uri (scurgere de la chunk-ul anterior)',
    f: 'src/render/mesher.ts',
    a: '  occ.fill(0)',
    b: '  void occ',
    t: 'tests/mesher.test.ts', e: 'un cub izolat n-are nicio ocluzie',
  },
  {
    n: 'in afara ferestrei de voxeli se considera SOLID, nu aer',
    f: 'src/render/mesher.ts',
    a: '  if (level < 0 || level >= SZ) return 0\n  if (x < -1 || y < -1 || x > SX || y > SY) return 0',
    b: '  if (level < 0 || level >= SZ) return 1\n  if (x < -1 || y < -1 || x > SX || y > SY) return 0',
    t: 'tests/mesher.test.ts', e: 'un cub izolat n-are nicio ocluzie',
  },
  {
    n: 'regula celor doua laturi dispare: coltul e doar „putin mai inchis"',
    f: 'src/render/mesher.ts',
    a: '    const ao = s1 !== 0 && s2 !== 0 ? 0 : 3 - (s1 + s2 + colt)',
    b: '    const ao = 3 - (s1 + s2 + colt)',
    t: 'tests/mesher.test.ts', e: 'doua laturi ocupate inchid coltul COMPLET',
  },
  {
    n: 'coltul diagonal nu se citeste (ocluzia sare peste diagonala)',
    f: 'src/render/mesher.ts',
    a: '    const colt = occAt(px + ux + vx, py + uy + vy, pz + uz + vz)',
    b: '    const colt = 0',
    t: 'tests/mesher.test.ts', e: 'coltul chunk-ului are nevoie de vecinul DIAGONAL',
  },
  {
    n: 'apronul nu se umple: fiecare chunk isi calculeaza granita ca neocluzata',
    f: 'src/render/mesher.ts',
    a: '  if (neighbours) expandApron(chunk, neighbours)',
    b: '  void expandApron',
    t: 'tests/mesher.test.ts', e: 'AO se opreste la granita chunk-ului',
  },
  {
    n: 'vecinii diagonali nu intra in apron',
    f: 'src/render/mesher.ts',
    a: '  apronColumn(chunk, n.xPosYPos, 0, 0, SX, SY)',
    b: '  void n.xPosYPos',
    t: 'tests/mesher.test.ts', e: 'coltul chunk-ului are nevoie de vecinul DIAGONAL',
  },
  {
    n: 'AO nu intra in cheia de unire pe fetele orizontale (ocluzia se intinde gresit)',
    f: 'src/render/mesher.ts',
    a: '          grid[gbase + lx] = (row & (1 << lx)) !== 0\n            ? dense[denseIndex(lx, ly, level)]! | (aoPattern(face, lx, ly, level) << 8)\n            : 0',
    b: '          grid[gbase + lx] = (row & (1 << lx)) !== 0 ? dense[denseIndex(lx, ly, level)]! : 0',
    t: 'tests/mesher.test.ts', e: 'tiparul de AO intra in cheia de unire',
  },
  {
    n: 'ordinea varfurilor de AO e rotita (ocluzia apare pe muchia gresita)',
    f: 'src/render/mesher.ts',
    a: '  outAo[a + 1] = (tipar >>> 2) & 3',
    b: '  outAo[a + 1] = (tipar >>> 6) & 3',
    t: 'tests/mesher.test.ts', e: 'un vecin lateral intuneca exact doua varfuri',
  },
]
