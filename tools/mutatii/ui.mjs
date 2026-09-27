/**
 * Mutatii: UI-ul de joc (viewer/ui/*.ts si viewer/tinta.ts). Fiecare proba strica o garantie pe
 * care panoul de design al UI-ului a aratat-o fragila, si cere sa se inroseasca EXACT testul scris
 * pentru ea (tests/viewer-ui.test.ts, tests/viewer-ui-lume.test.ts).
 */

const PUR = 'tests/viewer-ui.test.ts'
const LUME = 'tests/viewer-ui-lume.test.ts'

export const MUTATII = [
  // --- pornirea: garda gate-ului (CG-1, T1) ---
  {
    n: 'un parametru de masura lipseste din garda (?probe singur ar monta UI-ul in gate)',
    f: 'viewer/ui/pornire.ts',
    a: "export const PARAMETRI_DE_MASURA: readonly string[] = ['scenario', 'bisect', 'd1b', 'probe', 'ballast']",
    b: "export const PARAMETRI_DE_MASURA: readonly string[] = ['scenario', 'bisect', 'd1b', 'ballast']",
    t: PUR, e: 'pornire: orice URL al lansatoarelor de gate e gate',
  },
  {
    n: '`masoara` se largeste peste d1b (o bisectie ar schimba ce masoara gate-ul)',
    f: 'viewer/ui/pornire.ts',
    a: "  const masoara = p.has('scenario') || p.get('bisect') === '1'",
    b: "  const masoara = p.has('scenario') || p.get('bisect') === '1' || p.has('d1b')",
    t: PUR, e: 'pornire: masoara si lumeDeGate raman cele de azi',
  },
  {
    n: 'verificarea castiga peste incarcare (un ?incarca cu ?cam ar sari salvarea)',
    f: 'viewer/ui/pornire.ts',
    a: "  if (p.has('incarca')) return { mod: 'incarca', faraUI: false, masoara, lumeDeGate }",
    b: "  if (p.has('incarca') && !PARAMETRI_DE_VERIFICARE.some((n) => p.has(n))) return { mod: 'incarca', faraUI: false, masoara, lumeDeGate }",
    t: PUR, e: 'pornire: incarca > joc nou > verificare > titlu',
  },
  {
    n: 'modul de verificare monteaza UI-ul de joc peste HUD-ul si ajutorul vechi (OWNER_VERIFY 12/13 nu se mai citesc)',
    f: 'viewer/ui/pornire.ts',
    a: "  if (PARAMETRI_DE_VERIFICARE.some((n) => p.has(n))) return { mod: 'verificare', faraUI: true, masoara, lumeDeGate }",
    b: "  if (PARAMETRI_DE_VERIFICARE.some((n) => p.has(n))) return { mod: 'verificare', faraUI: false, masoara, lumeDeGate }",
    t: PUR, e: 'pornire: incarca > joc nou > verificare > titlu',
  },
  {
    n: 'hrana implicita a jocului nou nu mai creste cu oamenii (600: colonia goala in ~56 min)',
    f: 'viewer/ui/pornire.ts',
    a: "    hrana: intreg('hrana', 0, 100_000, HRANA_PE_OM * oameni),",
    b: "    hrana: intreg('hrana', 0, 100_000, 600),",
    t: PUR, e: 'pornire: jocul nou citeste si margineste parametrii',
  },
  // --- tastele (I6, T6) ---
  {
    n: 'tastele se iau si din campurile de text („Kinstead" tastat porneste traversarea)',
    f: 'viewer/ui/taste.ts',
    a: '  if (t.editabil || t.compunere) return NIMIC',
    b: '  if (t.compunere) return NIMIC',
    t: PUR, e: 'taste: nimic dintr-un camp de text',
  },
  {
    n: 'Ctrl nu opreste literele (Ctrl+S ar comuta si stabilitatea)',
    f: 'viewer/ui/taste.ts',
    a: "  if (t.ctrl || t.meta) return cuUI && k === 's' && !t.alt ? fa('salveaza', true) : NIMIC",
    b: "  if (t.meta) return cuUI && k === 's' && !t.alt ? fa('salveaza', true) : NIMIC",
    t: PUR, e: 'taste: Ctrl+S salveaza',
  },
  {
    n: 'o fereastra modala nu opreste tastele de joc',
    f: 'viewer/ui/taste.ts',
    a: '  if (t.modal) return NIMIC',
    b: "  if (t.modal && k === '') return NIMIC",
    t: PUR, e: 'taste: cu o fereastra deschisa trec doar Esc, F1, F3',
  },
  {
    n: 'tastele noi merg si fara UI (pe o pagina de gate)',
    f: 'viewer/ui/taste.ts',
    a: '  if (!cuUI) return NIMIC',
    b: '  if (!cuUI && k === \'\') return NIMIC',
    t: PUR, e: 'taste: fara UI (gate), doar tastele de azi',
  },
  // --- textele „De ce nu?" (T5, I7, CS-1) ---
  {
    n: 'FARA_LOC_SIGUR cade pe textul generic INACCESIBIL',
    f: 'viewer/ui/texte.ts',
    a: '      if (detaliu === DetaliuMotiv.FARA_LOC_SIGUR) return',
    b: '      if (detaliu === DetaliuMotiv.FARA_LOC_SIGUR + 100) return',
    t: PUR, e: 'texte: detaliul se citeste pe enumul SURSEI',
  },
  {
    n: 'detaliul mormanului se citeste pe enumul desemnarilor (DEPOZITE_PLINE = 2 = COMPONENTE_DIFERITE)',
    f: 'viewer/ui/texte.ts',
    a: '      if (detaliu === DetaliuItem.DEPOZITE_PLINE) return',
    b: '      if (detaliu === DetaliuMotiv.MATERIAL_IMPRASTIAT) return',
    t: PUR, e: 'texte: detaliul se citeste pe enumul SURSEI',
  },
  {
    n: 'grinda prea departe citeaza raza de sprijin in loc de raza grinzii',
    f: 'viewer/ui/texte.ts',
    a: "o grindă ține cel mult ${razaGrinda - 1}.`",
    b: "o grindă ține cel mult ${raza - 1}.`",
    t: PUR, e: 'texte: FARA_SPRIJIN pe caz',
  },
  {
    n: 'un cod din Reason ramane fara text (AR_INCHIDE)',
    f: 'viewer/ui/texte.ts',
    a: "    case Reason.AR_INCHIDE: return { titlu: 'Ar închide pe cineva sau ceva înăuntru.',",
    b: "    case Reason.AR_INCHIDE + 'x': return { titlu: 'Ar închide pe cineva sau ceva înăuntru.',",
    t: PUR, e: 'texte: fiecare valoare din Reason are titlu',
  },
  {
    n: 'nivelul maxim al prioritatii se afiseaza ca cifra, nu ca Exclusiv',
    f: 'viewer/ui/texte.ts',
    a: "  if (nivel >= maxim) return { eticheta: 'Excl.'",
    b: "  if (nivel > maxim) return { eticheta: 'Excl.'",
    t: PUR, e: 'texte: prioritatea maxima e Exclusiv',
  },
  // --- dreptunghiul (T4, I3, JN-4, CS-5) ---
  {
    n: 'conturul pierde o latura (5×5 da 13, nu 16)',
    f: 'viewer/ui/dreptunghi.ts',
    a: '      if (contur && x !== d.x0 && x !== d.x1 && y !== d.y0 && y !== d.y1) continue',
    b: '      if (contur && x !== d.x0 && x !== d.x1 && y !== d.y0) continue',
    t: PUR, e: 'dreptunghi: conturul are exact marginea',
  },
  {
    n: 'cu nivelul oprit, Sapa ia cota coltului, nu solul fiecarei coloane (v1: panta ingropata)',
    f: 'viewer/ui/dreptunghi.ts',
    a: '        zs = [construieste ? s + 1 : s]',
    b: '        zs = [construieste ? s + 1 : lumea.suprafata(d.x0, d.y0)!]',
    t: PUR, e: 'dreptunghi: cu nivelul oprit, Sapa urmeaza solul',
  },
  {
    n: 'Sapa cu nivelul pornit uita locul de cap (tunel de 1 m, prin care nu trece nimeni)',
    f: 'viewer/ui/dreptunghi.ts',
    a: '        if (!construieste && !o.unStrat) for (let h = 1; h < o.inaltimeOm; h++) zs.push(o.zActiv + h)',
    b: '        if (!construieste && o.unStrat) for (let h = 1; h < o.inaltimeOm; h++) zs.push(o.zActiv + h)',
    t: PUR, e: 'dreptunghi: cu nivelul pornit, Sapa ia nivelul activ',
  },
  {
    n: 'plafonul se compara cu aria, nu cu ce primeste comanda',
    f: 'viewer/ui/dreptunghi.ts',
    a: '    if (comenzi.length > o.locDesemnari) {',
    b: '    if (arie(d) > o.locDesemnari) {',
    t: PUR, e: 'dreptunghi: plafonul e locul LIBER',
  },
  {
    n: 'Anuleaza retrage si ce e taiat de slice (ce nu se vede)',
    f: 'viewer/ui/dreptunghi.ts',
    a: '  const zMax = o.zActiv ?? Infinity',
    b: '  const zMax = Infinity',
    t: PUR, e: 'dreptunghi: Anuleaza retrage doar ce se vede',
  },
  {
    n: 'prioritatea aleasa nu ajunge in desemnari',
    f: 'viewer/ui/dreptunghi.ts',
    a: "          ? { kind: 'desemneaza', wx: c.wx, wy: c.wy, z, prioritate: o.prioritate, piesa: o.piesa }",
    b: "          ? { kind: 'desemneaza', wx: c.wx, wy: c.wy, z, piesa: o.piesa }",
    t: PUR, e: 'dreptunghi: Construieste pune piesa doar in aer, cu prioritatea aleasa',
  },
  // --- alertele (T10, JN-5) ---
  {
    n: 'intarzierea se citeste in tickuri, nu in secunde (alerta apare de 20 de ori mai repede)',
    f: 'viewer/ui/alerte.ts',
    a: '      if (!st.afisata && tick - st.adevaratDeLa >= r.intarziereS * ticksPerSecond && tick >= st.racitaPanaLa) {',
    b: '      if (!st.afisata && tick - st.adevaratDeLa >= r.intarziereS && tick >= st.racitaPanaLa) {',
    t: PUR, e: 'alerte: apare exact dupa intarziere',
  },
  {
    n: 'racirea nu mai opreste reaparitia',
    f: 'viewer/ui/alerte.ts',
    a: '      if (!st.afisata && tick - st.adevaratDeLa >= r.intarziereS * ticksPerSecond && tick >= st.racitaPanaLa) {',
    b: '      if (!st.afisata && tick - st.adevaratDeLa >= r.intarziereS * ticksPerSecond) {',
    t: PUR, e: 'alerte: dupa ce dispare, nu reapare in racire',
  },
  {
    n: 'jurnalul nu mai e marginit la 50',
    f: 'viewer/ui/alerte.ts',
    a: '  if (a.jurnal.length > JURNAL_MAX) a.jurnal.splice(0, a.jurnal.length - JURNAL_MAX)',
    b: '  if (a.jurnal.length > JURNAL_MAX * 2) a.jurnal.splice(0, a.jurnal.length - JURNAL_MAX)',
    t: PUR, e: 'alerte: cele critice primele; jurnalul tine ultimele 50',
  },
  {
    n: 'alertele se evalueaza inainte de armare (dupa o incarcare, pe memorii goale)',
    f: 'viewer/ui/alerte.ts',
    a: '  if (tick < a.armataLa) return []',
    b: '  if (tick < 0) return []',
    t: PUR, e: 'alerte: pauza (tick neschimbat) nu scoate nimic',
  },
  {
    n: 'alerta de foame nu mai asteapta cat reincercarea unui om (4 flamanzi la un morman o aprind)',
    f: 'viewer/ui/alerte.ts',
    a: "  { id: 'flamanzi', severitate: Severitate.ATENTIE, intarziereS: 30, racireS: 30 },",
    b: "  { id: 'flamanzi', severitate: Severitate.ATENTIE, intarziereS: 10, racireS: 30 },",
    t: LUME, e: 'model: alerta de foame tace cat mancarea e la indemana',
  },
  {
    n: 'semnalul de foame nu cere ca omul sa fi cautat si sa nu fi gasit (sub prag e viata normala)',
    f: 'viewer/ui/model.ts',
    a: '    else if (!mananca && v < fo.prag && a.nevoieReincercaLaTick[i * NEVOI + Nevoie.FOAME]! > w.tick) { flamanzi++; if (primulFlamand < 0) primulFlamand = i }',
    b: '    else if (!mananca && v < fo.prag) { flamanzi++; if (primulFlamand < 0) primulFlamand = i }',
    t: LUME, e: 'model: alerta de foame tace cat mancarea e la indemana',
  },
  // --- salvarile (T8, JN-2) ---
  {
    n: 'salvarea automata scrie si peste o colonie golita (slotul „auto" ar pastra lumea goala)',
    f: 'viewer/ui/salvari-plic.ts',
    a: '  if (m.golita || m.tragere) return false',
    b: '  if (m.tragere) return false',
    t: PUR, e: 'salvari: salvarea automata merge pe tickuri',
  },
  {
    n: 'o salvare dintr-o versiune mai noua trece drept „nu e o salvare"',
    f: 'viewer/ui/salvari-plic.ts',
    a: "    return { ok: false, motiv: esteNumar(s.format) && s.format > FORMAT_SALVARE ? 'Salvarea e dintr-o versiune mai nouă a jocului.' : 'Nu e o salvare Kinstead.' }",
    b: "    return { ok: false, motiv: 'Nu e o salvare Kinstead.' }",
    t: PUR, e: 'salvari: plicul valid trece',
  },
  // --- tinta clicului (I5, T9) ---
  {
    n: 'instanta n e luata drept slotul n (clicul arata alt pion dupa prima plecare)',
    f: 'viewer/tinta.ts',
    a: '    out[n] = i\n',
    b: '    out[n] = n\n',
    t: PUR, e: 'tinta: slotul de sub instanta dupa o plecare',
  },
  {
    n: 'Anuleaza ia cubul J doar cand in spatele lui nu e teren (lovea solul de dupa cub)',
    f: 'viewer/tinta.ts',
    a: "    if (j !== null) return { ok: true, ...j.c, sursa: 'cub' }",
    b: "    if (j !== null && v === null) return { ok: true, ...j.c, sursa: 'cub' }",
    t: PUR, e: 'tinta: Anuleaza si Selecteaza iau cubul J vazut',
  },
  // --- modelul pe lumi reale (T3, T13, CS-1, CS-2, CS-3, JN-1, JN-2) ---
  {
    n: 'resursele nu numara ce e in mainile oamenilor (cifra scade cat se cara)',
    f: 'viewer/ui/model.ts',
    a: '    if (a.caraCantitate[i]! > 0) { const m = acc[a.caraKind[i]!]; if (m) m.inMaini += a.caraCantitate[i]! }',
    b: '',
    t: LUME, e: 'model: resursele se conserva cat se cara',
  },
  {
    n: 'prioritatile se citesc cu indexul plat (categoria altui pion)',
    f: 'viewer/ui/model.ts',
    a: '  for (let c = 0; c < CATEGORII; c++) out.push({ nivel: w.agents.prioPersonala[slot * CATEGORII + c]!, activa: efectiv[c] ?? false })',
    b: '  for (let c = 0; c < CATEGORII; c++) out.push({ nivel: w.agents.prioPersonala[slot + c]!, activa: efectiv[c] ?? false })',
    t: LUME, e: 'model: prioritatile personale se citesc pe pionul lui',
  },
  {
    n: 'prioritatea efectiva ignora Exclusiv (o categorie oprita pare activa)',
    f: 'viewer/ui/model.ts',
    a: '  const efectiv = [act.sapa, act.cara, act.construieste]',
    b: '  const efectiv = [true, true, true]',
    t: LUME, e: 'model: prioritatile personale se citesc pe pionul lui',
  },
  {
    n: 'prognoza hranei uita tickurile pe secunda',
    f: 'viewer/ui/model.ts',
    a: '  const consumPeMin = colonisti * rules.nevoi[Nevoie.FOAME]!.scurgere * rules.ticksPerSecond * 60 / rules.nevoiTicks',
    b: '  const consumPeMin = colonisti * rules.nevoi[Nevoie.FOAME]!.scurgere * 60 / rules.nevoiTicks',
    t: LUME, e: 'model: prognoza hranei pe puncte de nutritie',
  },
  {
    n: 'o desemnare rezervata arata motivul memorat vechi',
    f: 'viewer/ui/model.ts',
    a: "  if (rez.length > 0) return { fel: 'lucru',",
    b: "  if (rez.length > 99) return { fel: 'lucru',",
    t: LUME, e: 'model: o desemnare rezervata nu arata un motiv vechi',
  },
  {
    n: 'un motiv memorat bate „n-ar sta in picioare"',
    f: 'viewer/ui/model.ts',
    a: '  if (construieste && previz?.imposibile.has(k)) {',
    b: '  if (construieste && previz?.imposibile.has(k) && d.ultimulMotiv[ds] === 0) {',
    t: LUME, e: 'model: o desemnare rezervata nu arata un motiv vechi',
  },
  {
    n: 'memoria previzualizarii nu mai tine: fiecare citire recalculeaza (120–185 ms pe plan mare)',
    f: 'viewer/ui/model.ts',
    a: '      if (ultima && ultima.cheie === cheie) return ultima',
    b: '      if (ultima && ultima.cheie === cheie && n < 0) return ultima',
    t: LUME, e: 'model: previzualizarea se recalculeaza doar',
  },
  {
    n: 'asezarea e „golita" si cu zero plecati (morti, dar nimeni plecat)',
    f: 'viewer/ui/model.ts',
    a: '  if (w.plecatiTotal <= 0) return false',
    b: '  if (w.plecatiTotal < 0) return false',
    t: LUME, e: 'model: asezarea golita e stare DERIVATA',
  },
  {
    n: '„nimeni nu cara" se decide pe prioritatea bruta, nu pe cea efectiva',
    f: 'viewer/ui/model.ts',
    a: '    pe.cara ||= act.cara',
    b: '    pe.cara ||= w.agents.prioPersonala[i * CATEGORII + 1]! > 0',
    t: LUME, e: 'model: alerta „nimeni-cara"',
  },
  {
    n: 'jocul nou ia primul candidat (panta demo-ului), nu pe cel mai plat',
    f: 'viewer/ui/loc.ts',
    a: '    if (!best || plate > best.plate) {',
    b: '    if (!best) {',
    t: LUME, e: 'loc: demo-ul ramane pe locul de azi',
  },
]
