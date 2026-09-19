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
    t: 'tests/mesher.test.ts', e: 'la marginea ferestrei de voxeli, dincolo e AER',
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
    a: '          const cheie = dense[denseIndex(lx, ly, level)]! | (aoPattern(face, lx, ly, level) << 8)',
    b: '          const cheie = dense[denseIndex(lx, ly, level)]!',
    t: 'tests/mesher.test.ts', e: 'tiparul de AO intra in cheia de unire',
  },
  {
    n: 'ordinea varfurilor de AO e rotita (ocluzia apare pe muchia gresita)',
    f: 'src/render/mesher.ts',
    a: '  outAo[a + 1] = (tipar >>> 2) & 3',
    b: '  outAo[a + 1] = (tipar >>> 6) & 3',
    t: 'tests/mesher.test.ts', e: 'un vecin lateral intuneca exact doua varfuri',
  },

  // --- netezirea suprafetei neatinse ---
  {
    n: "fetele de sus naturale nu se mai netezesc (raman la metri intregi)",
    f: "src/render/mesher.ts",
    a: "          if (face === Face.Z_POS && natAt(lx, ly) === level) {",
    b: "          if (false) {",
    t: 'tests/mesher.test.ts', e: 'netezirea aseaza fetele de sus EXACT',
  },
  {
    n: "peretii de treapta nu se mai suprima (panta ramane scara)",
    f: "src/render/mesher.ts",
    a: "  return level <= natAt(x, y) && level > natAt(nx, ny)",
    b: "  return false",
    t: 'tests/mesher.test.ts', e: 'netezirea sterge peretii de treapta',
  },

  // --- fusta, si garda pe care ea o face probabila ---
  {
    n: "fusta nu se emite (banda de fundal la marginea suprafetei netezite)",
    f: "src/render/mesher.ts",
    a: "            pushFusta(cheie, lx, ly, varfBuf, (level + 1) * CM)",
    b: "            void pushFusta",
    t: 'tests/mesher.test.ts', e: 'INVELISUL NETEZIT e ETANS',
  },
  {
    n: "peretele se suprima chiar daca vecina a fost SAPATA (gaura in panta)",
    f: "src/render/mesher.ts",
    a: "  if (!suprafataNaturala(x, y) || !suprafataNaturala(nx, ny)) return false",
    b: "  if (!suprafataNaturala(x, y)) return false",
    t: 'tests/mesher.test.ts', e: 'INVELISUL NETEZIT e ETANS',
  },

  // --- geometria si ocluzia fetelor NETEZITE ---
  {
    n: "cota unui colt se ia de la ALT colt (suprafata se rupe pe diagonala)",
    f: 'src/render/mesher.ts',
    a: "  out[1] = v[ly * VERTS + lx + 1]! - z0",
    b: "  out[1] = v[ly * VERTS + lx]! - z0",
    t: 'tests/mesher.test.ts', e: "netezirea aseaza fetele de sus EXACT pe cotele",
  },
  {
    n: "colturile 2 si 3 inversate (quaduri rasucite)",
    f: 'src/render/mesher.ts',
    a: "  out[2] = v[(ly + 1) * VERTS + lx + 1]! - z0\n  out[3] = v[(ly + 1) * VERTS + lx]! - z0",
    b: "  out[3] = v[(ly + 1) * VERTS + lx + 1]! - z0\n  out[2] = v[(ly + 1) * VERTS + lx]! - z0",
    t: 'tests/mesher.test.ts', e: "netezirea aseaza fetele de sus EXACT pe cotele",
  },
  {
    n: "baza stivei nu se scade (toata suprafata la zeci de metri sub locul ei)",
    f: 'src/render/mesher.ts',
    a: "  const z0 = chunk.voxels!.zBaseM * 100",
    b: "  const z0 = 0",
    t: 'tests/mesher.test.ts', e: "netezirea aseaza fetele de sus EXACT pe cotele",
  },
  {
    n: "axele x inversate la emitere (geometria ramane coerenta, dar rasucita)",
    f: 'src/render/mesher.ts',
    a: "  const x0 = lx * CM, x1 = (lx + 1) * CM, y0 = ly * CM, y1 = (ly + 1) * CM\n  pushQuadCm(Face.Z_POS, cheie, x0, y0, cm[0]!, x1, y0, cm[1]!, x1, y1, cm[2]!, x0, y1, cm[3]!)",
    b: "  const x0 = (lx + 1) * CM, x1 = lx * CM, y0 = ly * CM, y1 = (ly + 1) * CM\n  pushQuadCm(Face.Z_POS, cheie, x0, y0, cm[0]!, x1, y0, cm[1]!, x1, y1, cm[2]!, x0, y1, cm[3]!)",
    t: 'tests/mesher.test.ts', e: "doua fete netezite vecine impart doua varfuri",
  },
  {
    n: "fetele netezite pierd ocluzia (tiparul de AO nu ajunge pe calea lor)",
    f: 'src/render/mesher.ts',
    a: "            pushFataNetezita(cheie, lx, ly, varfBuf)",
    b: "            pushFataNetezita(cheie & 0xff, lx, ly, varfBuf)",
    t: 'tests/mesher.test.ts', e: "fetele NETEZITE primesc ocluzie",
  },

  // --- scenariul de gate S-DIG: constatarea 7 a recenziei adversariale ---
  {
    n: 'generatorul de pozitii revine la forma 1D (x si y din acelasi contor)',
    f: 'src/harness/sdig.ts',
    a: "  const idx = (i * SDIG_PAS) % (span * span)\n  return {\n    wx: focusCx * CHUNK_CELLS + baza + (idx % span),\n    wy: focusCy * CHUNK_CELLS + baza + Math.floor(idx / span),\n  }",
    b: "  return {\n    wx: focusCx * CHUNK_CELLS + baza + ((i * SDIG_PAS) % span),\n    wy: focusCy * CHUNK_CELLS + baza + ((i * 7919) % span),\n  }",
    t: 'tests/sdig.test.ts', e: 'pozitiile acopera patratul EXACT o data',
  },
  {
    n: 'pasul permutarii imparte span patrat (perioada se scurteaza tacut)',
    f: 'src/harness/sdig.ts',
    a: "export const SDIG_PAS = 1237",
    b: "export const SDIG_PAS = 1234",
    t: 'tests/sdig.test.ts', e: 'pozitiile acopera patratul EXACT o data',
  },
  {
    n: 'patratul sapat revine peste asezare, fara banda de frontiera (0 promovari)',
    f: 'src/harness/sdig.ts',
    a: "export const SDIG_OFFSET_CHUNKS = -3",
    b: "export const SDIG_OFFSET_CHUNKS = 0",
    t: 'tests/sdig.test.ts', e: 'o parte din sapaturi cad in AFARA',
  },
  {
    n: 'reincercarea dispare (o pozitie refuzata devine o sapatura pierduta)',
    f: 'src/harness/sdig.ts',
    a: "export const SDIG_MAX_INCERCARI = 16",
    b: "export const SDIG_MAX_INCERCARI = 1",
    t: 'tests/sdig.test.ts', e: 'cele 1200 de sapaturi ale unei rulari se FAC',
  },
  {
    n: 'incalzirea sapa in patratul CU banda, deci cheltuie valurile de 9 inainte de masuratoare',
    f: 'src/harness/sdig.ts',
    a: "export const SDIG_SPAN_INCALZIRE = 13",
    b: "export const SDIG_SPAN_INCALZIRE = 17",
    t: 'tests/sdig.test.ts', e: 'incalzirea nu cheltuie valurile de promovare',
  },
  {
    n: 'incalzirea porneste din coltul benzii, nu din coltul asezarii',
    f: 'src/harness/sdig.ts',
    a: "export const SDIG_OFFSET_INCALZIRE = 0",
    b: "export const SDIG_OFFSET_INCALZIRE = -3",
    t: 'tests/sdig.test.ts', e: 'incalzirea nu cheltuie valurile de promovare',
  },
  {
    n: 'cursorul nu trece peste pozitiile respinse (se reincearca aceleasi la nesfarsit)',
    f: 'src/harness/sdig.ts',
    a: "    if (incearca(wx, wy, cota - (c % 5))) return { wx, wy, cursor: c + 1 }",
    b: "    if (incearca(wx, wy, cota - (c % 5))) return { wx, wy, cursor: cursor + 1 }",
    t: 'tests/sdig.test.ts', e: 'cele 1200 de sapaturi ale unei rulari se FAC',
  },

  // --- fusta „papion", gasita de a doua recenzie adversariala ---
  {
    n: 'fusta nu se mai taie la cota plata (un singur quad, care iese papion)',
    f: 'src/render/mesher.ts',
    a: "  if (za < plat) {\n    tri(ax, ay, plat, cx, cy, plat, ax, ay, za)\n    tri(cx, cy, plat, bx, by, zb, bx, by, plat)\n  } else {\n    tri(ax, ay, za, cx, cy, plat, ax, ay, plat)\n    tri(cx, cy, plat, bx, by, plat, bx, by, zb)\n  }",
    b: "  void cx\n  void cy\n  pushQuadCm(face, cheie, ax, ay, plat, bx, by, plat, bx, by, zb, ax, ay, za)",
    t: 'tests/mesher.test.ts', e: 'niciun quad NETEZIT nu e',
  },
  {
    n: 'varfurile suprapuse ajung PRIMELE, deci quadFlipped nu mai poate afla infasurarea',
    f: 'src/render/mesher.ts',
    a: "    pushQuadCm(face, cheie, p1x, p1y, p1z, p2x, p2y, p2z, p3x, p3y, p3z, p3x, p3y, p3z)",
    b: "    pushQuadCm(face, cheie, p1x, p1y, p1z, p1x, p1y, p1z, p2x, p2y, p2z, p3x, p3y, p3z)",
    t: 'tests/mesher.test.ts', e: 'niciun quad NETEZIT nu e',
  },
  {
    n: 'partea de DEASUPRA cotei plate se arunca (gauri la mal)',
    f: 'src/render/mesher.ts',
    a: "    if (zb === plat) tri(ax, ay, za, bx, by, plat, ax, ay, plat)\n    else if (za === plat) tri(ax, ay, plat, bx, by, zb, bx, by, plat)\n    else pushQuadCm(face, cheie, ax, ay, za, bx, by, zb, bx, by, plat, ax, ay, plat)\n    return",
    b: "    return",
    t: 'tests/mesher.test.ts', e: 'INVELISUL NETEZIT e ETANS',
  },

  // --- x, y si ocluzia fetei netezite: goluri gasite de a doua recenzie ---
  {
    n: 'varful 2 al fetei netezite trece de pe y1 pe y0 (fata devine TRIUNGHI, 37,5% din suprafata dispare)',
    f: 'src/render/mesher.ts',
    a: "  pushQuadCm(Face.Z_POS, cheie, x0, y0, cm[0]!, x1, y0, cm[1]!, x1, y1, cm[2]!, x0, y1, cm[3]!)",
    b: "  pushQuadCm(Face.Z_POS, cheie, x0, y0, cm[0]!, x1, y0, cm[1]!, x1, y0, cm[2]!, x0, y1, cm[3]!)",
    t: 'tests/mesher.test.ts', e: 'netezirea aseaza fetele de sus EXACT',
  },
  {
    n: 'x0 si x1 inversate pe fata netezita',
    f: 'src/render/mesher.ts',
    a: "function pushFataNetezita(cheie: number, lx: number, ly: number, cm: Int32Array): void {\n  const x0 = lx * CM, x1 = (lx + 1) * CM",
    b: "function pushFataNetezita(cheie: number, lx: number, ly: number, cm: Int32Array): void {\n  const x0 = (lx + 1) * CM, x1 = lx * CM",
    t: 'tests/mesher.test.ts', e: 'netezirea aseaza fetele de sus EXACT',
  },
  {
    n: 'tiparul de AO rotit cu 180 de grade DOAR pe fetele netezite',
    f: 'src/render/mesher.ts',
    a: "function pushFataNetezita(cheie: number, lx: number, ly: number, cm: Int32Array): void {\n  const x0 = lx * CM",
    b: "function pushFataNetezita(cheie0: number, lx: number, ly: number, cm: Int32Array): void {\n  const rot = (cheie0 >>> 8) & 0xff\n  const cheie = (cheie0 & 0xff) | ((((rot >>> 4) | (rot << 4)) & 0xff) << 8)\n  const x0 = lx * CM",
    t: 'tests/mesher.test.ts', e: 'doua fete netezite vecine impart doua varfuri',
  },

  {
    n: 'cursorul ramane PE pozitia rezolvata, deci o reincearca la fiecare sapatura',
    f: 'src/harness/sdig.ts',
    a: "    if (incearca(wx, wy, cota - (c % 5))) return { wx, wy, cursor: c + 1 }",
    b: "    if (incearca(wx, wy, cota - (c % 5))) return { wx, wy, cursor: c }",
    t: 'tests/sdig.test.ts', e: 'cele 1200 de sapaturi ale unei rulari se FAC',
  },

  // --- `chunkuriDeRefacut`: iesita din viewer pe 19.09, deci probabila ---
  {
    n: 'multimea de remesh nu se mai goleste (editarile se aduna intre ele)',
    f: 'src/render/remesh.ts',
    a: "  out.clear()",
    b: "  void out",
    t: 'tests/remesh.test.ts', e: 'multimea data se GOLESTE la intrare',
  },
  {
    n: 'vecinii deja promovati se remesheaza si ei (fiecare editare costa noua)',
    f: 'src/render/remesh.ts',
    a: "      if (exista(key) && !eraPromovat(key)) out.add(key)",
    b: "      if (exista(key)) out.add(key)",
    t: 'tests/remesh.test.ts', e: 'un vecin DEJA promovat',
  },
  {
    n: 'cusatura nu mai verifica existenta vecinului (chei fantoma in multime)',
    f: 'src/render/remesh.ts',
    a: "    if (exista(key)) out.add(key)\n  }\n  if (lx === 0) cusatura(cx - 1, cy)",
    b: "    out.add(key)\n  }\n  if (lx === 0) cusatura(cx - 1, cy)",
    t: 'tests/remesh.test.ts', e: 'cusatura nu cere un vecin care NU EXISTA',
  },
  {
    n: 'cusatura se cere pe TOATE cele patru laturi, nu doar pe cele atinse',
    f: 'src/render/remesh.ts',
    a: "  if (lx === 0) cusatura(cx - 1, cy)",
    b: "  cusatura(cx, cy + 1)\n  if (lx === 0) cusatura(cx - 1, cy)",
    t: 'tests/remesh.test.ts', e: 'o editare in MIJLOCUL unui chunk',
  },
]
