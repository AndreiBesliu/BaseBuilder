/**
 * Mutatii: usa (S24-27, t.1) — hotar pentru aer, trecere pentru pioni. Predicatele de mers, locurile
 * pe care v1 nu le numea (privirea inainte, sigilarea, refugiul), previzualizarea, zonele, continutul.
 */

const T = 'tests/usa.test.ts'

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
    t: T, e: 'USA: casa cu etaj, usa in gol si chepeng',
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
    n: 'USA-1: previzualizarea: privirea inainte si pe usa',
    f: 'src/sim/acces.ts',
    a: '      if (faraPodea !== null && faraPodea.has(cheie)) return false',
    b: '      void faraPodea',
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
    f: 'src/sim/commands.ts',
    a: '  return !(m.ok && m.value === Material.USA)',
    b: '  return m.ok',
    t: T, e: 'USA: zonele nu se picteaza in golul unei usi',
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
]
