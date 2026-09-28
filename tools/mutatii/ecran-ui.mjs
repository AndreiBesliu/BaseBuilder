/**
 * Mutatii: recenzia incaperilor (28.09), partea de ecran si de UI — overlay-ul I (ECR-2), memoria si
 * frana inspectorului (EXP-4, ECR-3), textele explicatiei si usa propusa (EXP-7, ECR-12), textul usii
 * dintr-o groapa (USA-4). Fiecare proba pune la loc DEFECTUL (sau strica o garda a reparatiei) si cere
 * sa se inroseasca exact testul scris pentru ea. Ce se vede doar pe ecran (zona moarta a barei de jos,
 * ECR-4; bifele feliei, ECR-7; try/catch-ul bifelor, ECR-10) il leaga bench/ui-fum.mjs, rulat si pe
 * codul vechi / mutat (DEVLOG).
 */

const OV = 'tests/viewer-overlay-camere.test.ts'
const INC = 'tests/viewer-ui-incaperi.test.ts'

export const MUTATII = [
  // --- ECR-2: overlay-ul I ---
  {
    n: 'ECR-2: overlay-ul I se reface la orice epoca noua (fara amprenta nivelului)',
    f: 'viewer/overlay-camere.ts',
    a: '  if (acelasiNivel && amprenta !== null && o.amprenta !== null && aceeasiAmprenta(o.amprenta, amprenta)) {',
    b: '  if (false) {',
    t: OV, e: 'overlay I (ECR-2): editarile pe ALT nivel',
  },
  {
    n: 'ECR-2: goleste elibereaza iar materialele (programele GL se re-leaga la fiecare reconstructie)',
    f: 'viewer/overlay-camere.ts',
    a: '    ;(o as THREE.Mesh).geometry?.dispose()\n',
    b: '    ;(o as THREE.Mesh).geometry?.dispose()\n    ;((o as THREE.Mesh).material as THREE.Material).dispose()\n',
    t: OV, e: 'overlay I (ECR-2): editarile pe ALT nivel',
  },
  {
    n: 'ECR-2: tenta incaperilor nu intra in grup (mutatia a a lentilei ECR-7, in node)',
    f: 'viewer/overlay-camere.ts',
    a: '    o.group.add(m)\n',
    b: '    void m\n',
    t: OV, e: 'overlay I (ECR-2): editarile pe ALT nivel',
  },
  {
    n: 'ECR-2: amprenta nu compara tripletul componentelor (o incapere deschisa prin etaj ramane tentata jos)',
    f: 'viewer/overlay-camere.ts',
    a: '  for (let i = 0; i < a.comp.length; i++) if (a.comp[i] !== b.comp[i]) return false\n',
    b: '  void b.comp\n',
    t: OV, e: 'overlay I (ECR-2): o fereastra la etaj',
  },
  {
    n: 'ECR-2: amprenta nu compara identitatea feliilor (o felie refacuta cu aceleasi triplete nu se redeseneaza)',
    f: 'viewer/overlay-camere.ts',
    a: '  for (let i = 0; i < a.felii.length; i++) if (a.felii[i] !== b.felii[i]) return false\n',
    b: '  void b.felii\n',
    t: OV, e: 'overlay I (ECR-2): o fereastra la etaj',
  },
  {
    n: 'ECR-2: amprenta e luata pe nivelul de DEASUPRA celui desenat',
    f: 'viewer/overlay-camere.ts',
    a: '  const lo = primaPozitie(idx.chei, cheieFelie(0, 0, z))\n  const hi = primaPozitie(idx.chei, cheieFelie(0, 0, z + 1))\n',
    b: '  const lo = primaPozitie(idx.chei, cheieFelie(0, 0, z + 1))\n  const hi = primaPozitie(idx.chei, cheieFelie(0, 0, z + 2))\n',
    t: OV, e: 'overlay I (ECR-2): dupa fiecare editare dintr-un fuzz',
  },
  // --- EXP-4 / ECR-3: memoria inspectorului ---
  {
    n: 'EXP-4: memoria nu citeste jurnalul (valabila cat e aceeasi celula)',
    f: 'viewer/ui/memorie-incapere.ts',
    a: '  if (t.editari - a.editari > JURNAL_CAP || t.editari < a.editari) return false\n',
    b: '  return true\n',
    t: INC, e: 'inspector (EXP-4): o editare langa componenta fara epoca noua',
  },
  {
    n: 'EXP-4: amprenta fara marginea de un bloc (gura putului din blocul vecin nu se vede)',
    f: 'viewer/ui/memorie-incapere.ts',
    a: '  return { editari: w.terrain.editari, x, y, z, bx0: bx0 - 1, bx1: bx1 + 1, by0: by0 - 1, by1: by1 + 1 }',
    b: '  return { editari: w.terrain.editari, x, y, z, bx0, bx1, by0, by1 }',
    t: INC, e: 'inspector (EXP-4): o editare langa componenta fara epoca noua',
  },
  {
    n: 'EXP-4: amprenta doar pe blocul celulei selectate, nu pe componenta (capatul departe al galeriei)',
    f: 'viewer/ui/memorie-incapere.ts',
    a: '  if (c !== null) {\n    for (const b of c.bucati) {',
    b: '  if (c !== null && false) {\n    for (const b of c.bucati) {',
    t: INC, e: 'inspector (EXP-4): o editare langa componenta fara epoca noua',
  },
  {
    n: 'ECR-3: cheia veche — orice editare din lume invalideaza memoria (terrain.editari)',
    f: 'viewer/ui/memorie-incapere.ts',
    a: '  if (t.editari - a.editari > JURNAL_CAP || t.editari < a.editari) return false\n',
    b: '  if (t.editari !== a.editari) return false\n',
    t: INC, e: 'inspector (ECR-3): sapaturile sub acoperis in ALTA componenta',
  },
  {
    n: 'EXP-4: fara frana (minerii din mina intrebata o refac la fiecare reimprospatare)',
    f: 'viewer/ui/memorie-incapere.ts',
    a: '      if (aceeasi && !clic && acum < urmatorLa) return raspuns\n',
    b: '      void urmatorLa\n',
    t: INC, e: 'inspector (EXP-4): frana',
  },
  {
    n: 'EXP-4: frana doar pe 250 ms, fara costul calculului',
    f: 'viewer/ui/memorie-incapere.ts',
    a: '      urmatorLa = acum + Math.max(FRANA_MIN_MS, FRANA_COSTURI * cost)',
    b: '      urmatorLa = acum + FRANA_MIN_MS',
    t: INC, e: 'inspector (EXP-4): frana',
  },
  {
    n: 'EXP-4: un clic nu sare frana',
    f: 'viewer/ui/memorie-incapere.ts',
    a: '      if (aceeasi && !clic && acum < urmatorLa) return raspuns\n',
    b: '      if (aceeasi && acum < urmatorLa) return raspuns\n',
    t: INC, e: 'inspector (EXP-4): frana',
  },
  // --- EXP-7 / ECR-12: textele, usa propusa ---
  {
    n: 'EXP-7: textul numara iar celulele, nu golurile („Pune o ușă în gol (4 celule)" pentru doua usi)',
    f: 'viewer/ui/texte.ts',
    a: "        else actiune = `${n === 1 ? 'Pune o ușă în gol' : `Pune ${n} uși`} (${textCelule(e.usiPropuse.length)}): devine o încăpere de ${e.volumCuUsi} m³.`",
    b: "        else actiune = `Pune o ușă în gol (${textCelule(e.usiPropuse.length)}): devine o încăpere de ${e.volumCuUsi} m³.`",
    t: INC, e: 'incaperi (EXP-7): textul numara golurile',
  },
  {
    n: 'EXP-7: „1 celule" (fara singular)',
    f: 'viewer/ui/texte.ts',
    a: "  return n === 1 ? 'o celulă' : n === 2 ? 'două celule' : cant(n, 'celule')",
    b: "  return n === 2 ? 'două celule' : cant(n, 'celule')",
    t: INC, e: 'incaperi (EXP-7): textul numara golurile',
  },
  {
    n: 'EXP-7: golurile se lipesc si pe diagonala (vecinatate de 26, nu de 6)',
    f: 'viewer/ui/texte.ts',
    a: '        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) !== 1) continue',
    b: '        if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)) !== 1) continue',
    t: INC, e: 'incaperi (EXP-7): textul numara golurile',
  },
  {
    n: 'ECR-12: usa desemnata tot cere „Pune o ușă"',
    f: 'viewer/ui/texte.ts',
    a: '        if (usaDesemnata) actiune =',
    b: '        if (false) actiune =',
    t: INC, e: 'incaperi (EXP-7): textul numara golurile',
  },
  {
    n: 'ECR-12: textul CER („sub cerul liber") inviat',
    f: 'viewer/ui/texte.ts',
    a: "    case 'NU_E_AER':\n    case 'CER':\n      return { titlu: '', actiune: '', bine: true }",
    b: "    case 'NU_E_AER': return { titlu: '', actiune: '', bine: true }\n    case 'CER': return { titlu: `${pre}sub cerul liber.`, actiune: '', bine: true }",
    t: INC, e: 'incaperi (EXP-7): textul numara golurile',
  },
  {
    n: 'ECR-12: o jumatate desemnata ca PERETE trece drept usa desemnata',
    f: 'viewer/ui/memorie-incapere.ts',
    a: '    else if (d.kind[ds] === Desemnare.CONSTRUIESTE && d.piesa[ds] === Piesa.USA) usa++',
    b: '    else usa++',
    t: INC, e: 'incaperi (ECR-12): usa propusa fata de desemnari',
  },
  {
    n: 'ECR-12: indiciul Usii spune iar „(plin)"',
    f: 'viewer/ui/texte.ts',
    a: '  return `<b>Ușă</b>${unde} · clic pe un gol de perete sau pe o gaură de podea: o pune întreagă · trage = o ușă în fiecare gol din dreptunghi · P = altă piesă · Esc`',
    b: '  return `<b>Ușă</b>${unde} · trage = dreptunghi (plin) · P = altă piesă · Esc`',
    t: INC, e: 'incaperi (ECR-12): indiciul uneltei Usa',
  },
  // --- USA-4 ---
  {
    n: 'USA-4: usa cu FARA_LOC_SIGUR memorat primeste iar textul generic („Pune o scară sau o ușă")',
    f: 'viewer/ui/model.ts',
    a: '      : usa && cod === Reason.INACCESIBIL && d.ultimulMotivDetaliu[ds] === DetaliuMotiv.FARA_LOC_SIGUR',
    b: '      : false && usa && cod === Reason.INACCESIBIL && d.ultimulMotivDetaliu[ds] === DetaliuMotiv.FARA_LOC_SIGUR',
    t: INC, e: 'USA-4: o usa desemnata pe fundul unei gropi',
  },
]
