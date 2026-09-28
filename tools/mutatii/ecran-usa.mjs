/**
 * Mutatii: unealta Usa si inspectorul, dupa recenzia pe ecran a incaperilor (ECR-1, ECR-5, ECR-6, ECR-8) si
 * recenzia explicatiei (EXP-6). Golul tintit PRIN raza, dreptunghiul fara nivel sub acoperis, usa retrasa
 * intreaga, panoul de sus zidit singur, inspectorul care intreaba aerul din fata fetei atinse.
 */

const T = 'tests/viewer-usa-tinta.test.ts'

export const MUTATII = [
  // --- ECR-1: golul vazut prin raza
  {
    n: 'ECR-1: fara parcurgerea razei — doar tinta generica (podeaua camerei, dincolo de gol)',
    f: 'viewer/usi.ts',
    a: '  const tMax = v !== null ? v.t : q.departeMax / lung\n',
    b: '  const tMax = -1\n',
    t: T, e: 'usa pe ecran (ECR-1): raza prin mijlocul golului',
  },
  {
    n: 'ECR-1: raza parcursa pe axele gresite (cota luata drept wy)',
    f: 'viewer/usi.ts',
    a: '      const u = q.celuleUsii(x, z, y)\n',
    b: '      const u = q.celuleUsii(x, y, z)\n',
    t: T, e: 'usa pe ecran (ECR-1): raza prin mijlocul golului',
  },
  {
    n: 'ECR-1: parcurgerea trece de primul impact (golul din spatele unui zid plin)',
    f: 'viewer/usi.ts',
    a: '  for (let n = 0; t <= tMax && n < PASI_MAX_RAZA; n++) {\n',
    b: '  for (let n = 0; n < PASI_MAX_RAZA; n++) {\n',
    t: T, e: 'usa pe ecran (ECR-1): pe peretele plin',
  },
  {
    n: 'ECR-1: raza fara impact (crapatura, cer prin gol) nu se mai parcurge',
    f: 'viewer/usi.ts',
    a: '  const { o, d } = q.raza\n',
    b: '  if (q.tinta === null) return null\n  const { o, d } = q.raza\n',
    t: T, e: 'usa pe ecran (ECR-1): raza care nu atinge nimic',
  },
  {
    n: 'ECR-1: nivelul pornit nu limiteaza cautarea (gol deasupra planului de taiere)',
    f: 'viewer/usi.ts',
    a: '    if (y <= zMax) {\n',
    b: '    if (y <= Infinity) {\n',
    t: T, e: 'usa pe ecran (ECR-1): cu nivelul pornit',
  },
  // --- ECR-5: dreptunghiul fara nivel
  {
    n: 'ECR-5: dreptunghiul Usa fara nivel nu coboara sub acoperis',
    f: 'viewer/ui/dreptunghi.ts',
    a: '  for (let k = 0; k < ACOPERIS_MAX_USA && lumea.solid(wx, wy, z); k++) z--\n',
    b: '  for (let k = 0; k < 0 && lumea.solid(wx, wy, z); k++) z--\n',
    t: T, e: 'usa pe ecran (ECR-5)',
  },
  // --- ECR-6: undo comun
  {
    n: 'ECR-6: usa se retrage cub cu cub (grupul nu creste)',
    f: 'viewer/usi.ts',
    a: '      if (esteUsa(nx, ny, nz)) out.push({ x: nx, y: ny, z: nz })\n',
    b: '      if (esteUsa(nx, ny, nz) && out.length < 0) out.push({ x: nx, y: ny, z: nz })\n',
    t: T, e: 'usa pe ecran (ECR-6)',
  },
  {
    n: 'ECR-6: grupul usii trece si pe diagonala (ia usa de alaturi)',
    f: 'viewer/usi.ts',
    a: '[[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]\n',
    b: '[[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 1]]\n',
    t: T, e: 'usa pe ecran (ECR-6)',
  },
  // --- ECR-8: orientarea panoului
  {
    n: 'ECR-8: fara regula zidului — usa de sus zidita singura iese chepeng',
    f: 'viewer/usi.ts',
    a: "  if (!vertical && inZid(1, 0)) return 'subtireY'\n",
    b: '',
    t: T, e: 'usa pe ecran (ECR-8)',
  },
  {
    n: 'ECR-8: regula zidului nu cere aer pe axa cealalta (chepengul peste un coridor iese vertical)',
    f: 'viewer/usi.ts',
    a: '    && !isSolid(m(x + ay, y + ax, z)) && !isSolid(m(x - ay, y - ax, z))\n',
    b: '    && true\n',
    t: T, e: 'usa pe ecran (ECR-8)',
  },
  {
    n: 'ECR-8: zidul nu trebuie sa continue in jos (gaura dintr-o pasarela iese vertical)',
    f: 'viewer/usi.ts',
    a: '  const zid = (a: number, b: number): boolean => isSolid(m(a, b, z)) && (isSolid(m(a, b, z - 1)) || m(a, b, z) === Material.USA)\n',
    b: '  const zid = (a: number, b: number): boolean => isSolid(m(a, b, z))\n',
    t: T, e: 'usa pe ecran (ECR-8)',
  },
  // --- ECR-11: stratul usilor din jurnal
  {
    n: 'ECR-11: tot terenul la fiecare editare (jurnalul ignorat)',
    f: 'viewer/usi.ts',
    a: '  if (u.teren !== t || noi < 0 || noi > JURNAL_CAP) {\n',
    b: '  if (true) {\n',
    t: T, e: 'usa pe ecran (ECR-11)',
  },
  {
    n: 'ECR-11: vecinii de peste granita nu se rescaneaza (usa din chunk-ul alaturat ramane cu orientarea veche)',
    f: 'viewer/usi.ts',
    a: '      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) atinse.add(chunkKey(Math.floor((wx + dx) / CHUNK_CELLS), Math.floor((wy + dy) / CHUNK_CELLS)))\n',
    b: '      atinse.add(chunkKey(Math.floor(wx / CHUNK_CELLS), Math.floor(wy / CHUNK_CELLS)))\n',
    t: T, e: 'usa pe ecran (ECR-11)',
  },
  {
    n: 'ECR-11: un chunk ramas fara usi isi pastreaza usile vechi',
    f: 'viewer/usi.ts',
    a: '      else u.harta.delete(k)\n',
    b: '',
    t: T, e: 'usa pe ecran (ECR-11)',
  },
  // --- EXP-6: inspectorul
  {
    n: 'EXP-6: inspectorul nu intreaba aerul din fata fetei atinse',
    f: 'viewer/ui/model.ts',
    a: '  if (n !== null && esteAerAcoperit(r, wx + n.x, wy + n.y, z + n.z)) return la(wx + n.x, wy + n.y, z + n.z)\n',
    b: '',
    t: T, e: 'inspector (EXP-6): un zid intre doua incaperi',
  },
  {
    n: 'EXP-6: prin acoperis se coboara un singur nivel (acoperisul gros tace)',
    f: 'viewer/ui/model.ts',
    a: '    for (let k = 1; k <= GROSIME_MAX_INSPECTOR; k++) {\n',
    b: '    for (let k = 1; k <= 1; k++) {\n',
    t: T, e: 'inspector (EXP-6): pe un acoperis gros',
  },
  {
    n: 'EXP-6: fara normala, zidul si usa nu intreaba vecinii din plan',
    f: 'viewer/ui/model.ts',
    a: '  for (const [dx, dy] of VECINI_PLAN) if (esteAerAcoperit(r, wx + dx, wy + dy, z)) return la(wx + dx, wy + dy, z)\n',
    b: '',
    t: T, e: 'inspector (EXP-6): clic pe fata interioara',
  },
  {
    n: 'EXP-6: normala fetei trece in lume pe axele scenei (wy luat drept cota)',
    f: 'viewer/tinta.ts',
    a: '  return { x: 0, y: i.n.z < 0 ? -1 : 1, z: 0 }\n',
    b: '  return { x: 0, y: 0, z: i.n.z < 0 ? -1 : 1 }\n',
    t: T, e: 'inspector (EXP-6): tinta de inspectie',
  },
]
