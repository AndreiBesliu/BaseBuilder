/**
 * Mutatii: usa (S24-27, t.1) — hotar pentru aer, trecere pentru pioni. Predicatele de mers, locurile
 * pe care v1 nu le numea (privirea inainte, sigilarea, refugiul), previzualizarea, zonele, continutul.
 */

const T = 'tests/usa.test.ts'
const TV = 'tests/viewer-camere.test.ts'

export const MUTATII = [
  {
    n: 'usa blocheaza mersul (e zid)',
    f: 'src/sim/terrain/chunk.ts',
    a: 'export function blocheazaMersul(m: number): boolean {\n  return isSolid(m) && m !== Material.USA',
    b: 'export function blocheazaMersul(m: number): boolean {\n  return isSolid(m)',
    t: T, e: 'USA: prin usa se trece',
  },
  {
    n: 'usa e podea (se sta pe ea)',
    f: 'src/sim/terrain/chunk.ts',
    a: 'export function ePodea(m: number): boolean {\n  return isSolid(m) && m !== Material.USA',
    b: 'export function ePodea(m: number): boolean {\n  return isSolid(m)',
    t: T, e: 'USA: prin usa se trece',
  },
  {
    n: 'isWalkable: celula usii blocheaza (orice nu e aer)',
    f: 'src/sim/regions.ts',
    a: '  if (blocheazaMersul(here) || here === Material.APA) return false',
    b: '  if (here !== Material.AER) return false',
    t: T, e: 'USA: prin usa se trece',
  },
  {
    n: 'santierele de usa intra in C (golul usii planificate arata zidit)',
    f: 'src/sim/acces.ts',
    a: '  return blocheazaMersul(rules.piese[piesa]!.material)',
    b: '  return rules.piese[piesa]!.material !== Material.AER',
    t: T, e: 'USA: un santier de usa nu inchide golul',
  },
  {
    n: 'previzualizarea pune usile in C',
    f: 'src/sim/joburi.ts',
    a: '  const plan = new Set(celule.filter((k) => !nuInC.has(k)))',
    b: '  const plan = new Set(celule)',
    t: T, e: 'USA: casa cu etaj, usa in gol si chepeng',
  },
  {
    n: 'USA-6: o usa fara acces e scoasa si din faraAcces (invizibila)',
    f: 'src/sim/joburi.ts',
    a: '  const faraAcces = sprijin.construibile.filter((k) => !cuAccesSet.has(k))',
    b: '  const faraAcces = sprijin.construibile.filter((k) => !cuAccesSet.has(k) && !faraPodea.has(k))',
    t: T, e: 'USA (USA-1): dintr-o groapa, o usa nu e scapare',
  },
  {
    n: 'USA-1: scanerul: o usa zidita e scapare din groapa (siguraDupaZidire)',
    f: 'src/sim/acces.ts',
    a: '  if (sp !== -1 && !ePodea(rules.piese[d.piesa[sp]!]!.material)) return false',
    b: '  void sp',
    t: T, e: 'USA (USA-1): dintr-o groapa, o usa nu e scapare',
  },
  {
    n: 'USA-1: in graful stabil, o usa din Z e podea',
    f: 'src/sim/acces.ts',
    a: '        if (!ziditaIpotetic(Z, inPlus, jos) || (FP !== null && FP.has(jos))) return false',
    b: '        if (!ziditaIpotetic(Z, inPlus, jos)) return false',
    t: T, e: 'USA (USA-1): in graful stabil, o usa zidita IPOTETIC',
  },
  {
    n: 'USA-2: regula de sigilare nu sare usa (o face solida si podea)',
    f: 'src/sim/acces.ts',
    a: '  if (!blocheazaMersul(material) && !ePodea(material)) {',
    b: '  if (material === -1) {',
    t: T, e: 'USA (USA-2): regula de sigilare',
  },
  {
    n: 'USA-2: sigilarea pe memorie nu citeste materialul piesei',
    f: 'src/sim/acces.ts',
    a: '  const material = s === -1 ? Material.PIATRA_CONSTRUITA : rules.piese[d.piesa[s]!]!.material',
    b: '  const material = s === -1 ? Material.PIATRA_CONSTRUITA : Material.PIATRA_CONSTRUITA',
    t: T, e: 'USA (USA-2): regula de sigilare',
  },
  {
    n: 'USA-3: refugiul iese din orice solid (urca pionul prin usa)',
    f: 'src/sim/joburi.ts',
    a: '  while (blocheazaMersul(materialFast(t, wx, wy, z))) z++',
    b: '  while (materialFast(t, wx, wy, z) !== Material.AER && materialFast(t, wx, wy, z) !== Material.APA) z++',
    t: T, e: 'USA (USA-3): podeaua de sub usa cade',
  },
  {
    n: 'zonele se picteaza si in golul usii',
    f: 'src/sim/joburi.ts',
    a: '  return isWalkable(t, x, y, z, rules) && materialFast(t, x, y, z) !== Material.USA',
    b: '  return isWalkable(t, x, y, z, rules)',
    t: T, e: 'USA: zonele nu se picteaza in golul unei usi',
  },
  {
    n: 'USA-2 (recenzia incaperilor): retragerea de dupa zidire intreaba doar „e calcabila?" (zona pictata inainte ramane in toc)',
    f: 'src/sim/joburi.ts',
    a: '    if (celulaDeZonaPosibila(w.terrain, wx, wy, zDeLa - h, rules)) continue',
    b: '    if (isWalkable(w.terrain, wx, wy, zDeLa - h, rules)) continue',
    t: T, e: 'USA zona (USA-2): o celula de zona pictata INAINTE de usa',
  },
  {
    n: 'CTR-9: garda de continut doar intr-un sens (un PERETE din USA trece)',
    f: 'src/sim/content.ts',
    a: '    if ((id === Piesa.USA) !== (mat[1] === Material.USA)) {',
    b: '    if (id === Piesa.USA && mat[1] !== Material.USA) {',
    t: T, e: 'USA: continutul leaga piesa USA de materialul USA',
  },
  {
    n: 'CTR-9: garda de continut doar in celalalt sens (o USA din piatra trece)',
    f: 'src/sim/content.ts',
    a: '    if ((id === Piesa.USA) !== (mat[1] === Material.USA)) {',
    b: '    if (mat[1] === Material.USA && id !== Piesa.USA) {',
    t: T, e: 'USA: continutul leaga piesa USA de materialul USA',
  },
  // --- recenzia incaperilor, USA-1: `celulaLibera` doar pentru piesele care blocheaza mersul, in trei
  // locuri. Polaritatea `true` = codul de pe e063f40 (celula libera ceruta si pentru usa).
  {
    n: 'USA-1 (recenzia incaperilor): zidirea cere celula libera si pentru usa (mormanul din toc opreste usa de sus)',
    f: 'src/sim/joburi.ts',
    a: '  if (blocheazaMersul(material)) {\n    const liber = celulaLibera(w, rules, wx, wy, z)',
    b: '  if (true) {\n    const liber = celulaLibera(w, rules, wx, wy, z)',
    t: T, e: 'USA toc (USA-1): usa de sus se zideste peste un morman din toc',
  },
  {
    n: 'USA-1 (recenzia incaperilor): constructorul asteapta celula libera si la usa (piatra in mana, pe veci)',
    f: 'src/sim/joburi.ts',
    a: '  if (blocheazaMersul(spec.material)) {\n    const liber = celulaLibera(w, rules, d.wx[ds]!, d.wy[ds]!, d.z[ds]!)',
    b: '  if (true) {\n    const liber = celulaLibera(w, rules, d.wx[ds]!, d.wy[ds]!, d.z[ds]!)',
    t: T, e: 'USA toc (USA-1): usa de sus se zideste peste un morman din toc',
  },
  {
    n: 'USA-1 (recenzia incaperilor): desenarea cere celula libera si pentru usa (golul sapat nu primeste usa)',
    f: 'src/sim/commands.ts',
    a: '        if (blocheazaMersul(rules.piese[piesa]!.material)) {',
    b: '        if (true) {',
    t: T, e: 'USA toc (USA-1): usa se deseneaza si se zideste intr-un gol sapat',
  },
  {
    n: 'USA-3 (recenzia incaperilor): piatra din usa desfacuta se asaza la cota ei (urca pe creasta gardului)',
    f: 'src/sim/joburi.ts',
    a: '    const cota = mat.value === Material.USA ? cotaDeRefugiu(w.terrain, wx, wy, z) : z',
    b: '    const cota = z',
    t: T, e: 'USA poarta (USA-3, recenzia incaperilor)',
  },
  // --- viewer-ul usii si al incaperilor (partea pura)
  {
    n: 'unealta Usa nu vede zidurile planificate (golul unui zid doar desenat nu e gol)',
    f: 'viewer/usi.ts',
    a: '      return p === null || p === Material.USA',
    b: '      return true',
    t: TV, e: 'viewer usa: un clic pe golul unui zid DOAR planificat',
  },
  {
    n: 'chepengul se deseneaza vertical',
    f: 'viewer/usi.ts',
    a: "    if (placa >= 2) return 'orizontala'",
    b: "    if (placa >= 5) return 'orizontala'",
    t: TV, e: 'viewer usa: in gaura unei placi',
  },
  {
    n: 'JUC-4: impactul pe panou e mereu pe aceeasi fata (clicul din spate tinteste aerul gresit)',
    f: 'viewer/usi.ts',
    a: '    const spre = directie.z > 0 ? -1 : 1',
    b: '    const spre = 1',
    t: TV, e: 'viewer usa (JUC-4)',
  },
  {
    n: 'mesher-ul deseneaza usa ca bloc',
    f: 'src/render/mesher.ts',
    a: '  return isSolid(m) && m !== Material.USA',
    b: '  return isSolid(m)',
    t: TV, e: 'viewer usa: mesher-ul nu deseneaza usa ca bloc',
  },
  {
    n: 'dreptunghiul cu usa nu numara coloanele fara gol',
    f: 'viewer/ui/dreptunghi.ts',
    a: '        if (u === null) { nepotrivite++; continue }',
    b: '        if (u === null) continue',
    t: TV, e: 'viewer usa: dreptunghiul cu piesa Usa',
  },
  {
    n: 'incaperile vecine primesc aceeasi culoare',
    f: 'viewer/overlay-camere.ts',
    a: '    while (folosite.has(c) && c < CULORI_INCAPERI.length - 1) c++',
    b: '    void folosite',
    t: TV, e: 'viewer incaperi: incaperile vecine',
  },
  {
    n: 'JUC-7: clicul pe acoperis nu intreaba de incaperea de dedesubt',
    f: 'viewer/ui/model.ts',
    a: '  if (!esteAer(r, wx, wy, z) && esteAerAcoperit(r, wx, wy, z - 1)) return { sub: true,',
    b: '  if (false) return { sub: true,',
    t: TV, e: 'viewer incaperi (JUC-7)',
  },
]
