/**
 * Mutatii: S24-27 t.3 — commit-ul D, ecranul hranei (research/hrana-t3.md §8; panoul UI-1 … UI-14). Prognoza (src/sim/
 * prognoza.ts: ln-ul fara Math.log, rata zilnica cuantizata, pragul din content, scaderea pe ora, λ-ul mediu al orei,
 * fractia de sub cer, forma inchisa, plafonul, valoarea si baza, mainile, cerul pe 24 h, componenta fara T), clasele dupa
 * rata EFECTIVA, inspectorul (textele pe hartie, „azi" sub cer), alerta si cheia listei, bara si „hrana-scade" in zile, un
 * adevar pentru patru cititori, camara (presetul in acelasi pas, „Se strică aici", groapa: locul, cauza pe moloz), harta U
 * (punctele), memoria hranei si cheia inspectorului (UI-10). Fiecare proba strica o garantie si numeste testul scris pentru ea.
 *
 * Probe omise ca echivalente sau fara forma de mutatie (motivul in raportul D1): λ-ul orei din Simpson in loc de mijloc (≤ 0,0032
 * zile fata de ≤ 0,0021 — de aceea s-a pastrat mijlocul, de doua ori mai ieftin); ora in care se termina hrana interpolata
 * liniar in loc de ln (≤ 0,0005 zile, sub banda testului); conditia formei inchise pe `valoare` in loc de `baza` (aceeasi,
 * cata vreme nu exista hrana neperisabila); verificarea „aceeasi cota" a lui `locGroapa` (pe un sit plat si fara gropi,
 * `celulaDeZonaPosibila` o acopera); stratul DOM din panouri.ts (bara, butoanele alertelor, elementele scrise pe loc,
 * comutatorul, butonul gropii, legenda) — il proba ui-fum (D2).
 *
 * Fiecare intrare: `n` numele, `f` fisierul, `a` tiparul, `b` inlocuirea, `t` fisierul de teste, `e` inceputul numelui
 * testului care trebuie sa pice, `e2` editari in plus.
 */

const T = 'tests/hrana-ecran.test.ts'
const P = 'src/sim/prognoza.ts'
const M = 'viewer/ui/model.ts'
const X = 'viewer/ui/texte.ts'
const O = 'viewer/overlay-temperatura.ts'

export const MUTATII = [
  // --- prognoza: aritmetica si curba (src/sim/prognoza.ts) ---
  {
    n: 'lnUnuPlus fara ramura x mic: 1 + x pierde cifrele unui x de 1e-12',
    f: P,
    a: '  const s = k === 0 ? x / (2 + x) : (y - 1) / (y + 1)',
    b: '  const s = (y - 1) / (y + 1)',
    t: T, e: 'HRANA ECRAN lnUnuPlus',
  },
  {
    n: 'lnUnuPlus cu ln 2 trunchiat (0,693)',
    f: P,
    a: '  return k * LN2 + 2 * suma',
    b: '  return k * 0.693 + 2 * suma',
    t: T, e: 'HRANA ECRAN lnUnuPlus',
  },
  {
    n: 'rata zilnica pe tickurile zilei, nu pe pasii de 1 Hz (×20)',
    f: P,
    a: '  return rules.calendar.ziTicks / rules.ticksPerSecond',
    b: '  return rules.calendar.ziTicks',
    t: T, e: 'HRANA ECRAN rata zilnica si pragul',
  },
  {
    n: 'pragul luat din al doilea punct al tabelului (5,1 °C)',
    f: P,
    a: '  return curbaReguli(rules).tQ16[0]!',
    b: '  return curbaReguli(rules).tQ16[1]!',
    t: T, e: 'HRANA ECRAN rata zilnica si pragul',
  },
  {
    n: 'scaderea pe ora cu Euler (1 − a), nu e^(−a): −0,026 zile la 25 °C',
    f: P,
    a: '  return a >= 2 ? 0 : (1 - a / 2) / (1 + a / 2)',
    b: '  return a >= 1 ? 0 : 1 - a',
    t: T, e: 'HRANA ECRAN forma inchisa contra pasului orar',
  },
  {
    n: 'λ-ul orei de la inceputul ei, nu de la mijloc (pana la −0,136 zile)',
    f: P,
    a: '  return (ora) => lambdaAlterare(rules, tAfara(seed, tick + ora * H + jum, rules)) * pePas',
    b: '  return (ora) => lambdaAlterare(rules, tAfara(seed, tick + ora * H, rules)) * pePas',
    t: T, e: 'HRANA ECRAN pasul orar sub cer',
  },
  {
    n: 'UI-1: aerul de ACUM tinut constant pe tot orizontul (designul v1), nu aerul viitor',
    f: P,
    a: '  return (ora) => lambdaAlterare(rules, tAfara(seed, tick + ora * H + jum, rules)) * pePas',
    b: '  return (ora) => lambdaAlterare(rules, tAfara(seed, tick, rules)) * pePas',
    t: T, e: 'HRANA ECRAN pasul orar sub cer',
  },
  {
    n: 'fractia de sub cer nu scade: stocul amestecat pierde ca la inceput',
    f: P,
    a: '      f1 = (f * Ec) / (f * Ec + (1 - f) * Ei)',
    b: '      f1 = f',
    t: T, e: 'HRANA ECRAN pasul orar sub cer',
  },
  {
    n: 'rata medie a orei pe fractia de la inceputul orei, nu de la mijloc',
    f: P,
    a: '    const fm = (f + f1) / 2',
    b: '    const fm = f',
    t: T, e: 'HRANA ECRAN pasul orar sub cer',
  },
  {
    n: 'forma inchisa fara ln: V/(C + L) in loc de V·ln(1 + L/C)/L',
    f: P,
    a: '  return rezultat(L > 0 ? (V * lnUnuPlus(L / C)) / L : V / C, rules, true)',
    b: '  return rezultat(L > 0 ? V / (C + L) : V / C, rules, true)',
    t: T, e: 'HRANA ECRAN forma inchisa contra pasului orar',
  },
  {
    n: 'forma inchisa imparte la L si la L = 0 (NaN in loc de V/C)',
    f: P,
    a: '  return rezultat(L > 0 ? (V * lnUnuPlus(L / C)) / L : V / C, rules, true)',
    b: '  return rezultat(L >= 0 ? (V * lnUnuPlus(L / C)) / L : V / C, rules, true)',
    t: T, e: 'HRANA ECRAN forma inchisa contra pasului orar',
  },
  {
    n: 'plafonul la doi ani: „peste un an" nu mai apare',
    f: P,
    a: '  if (ticuri >= plafon) return { zile: plafon / rules.calendar.ziTicks, plafonat: true, formaInchisa }',
    b: '  if (ticuri >= 2 * plafon) return { zile: plafon / rules.calendar.ziTicks, plafonat: true, formaInchisa }',
    t: T, e: 'HRANA ECRAN plafonul',
  },
  {
    n: 'valoarea pe unitati (q·nut), nu pe nutritia efectiva',
    f: P,
    a: '  return { slot: i, id: it.id[i]!, kind, cantitate: q, valoare: nutritieEfectiva(q, it.alterare[i]!, nut), loc, tQ16: t, rataZi }',
    b: '  return { slot: i, id: it.id[i]!, kind, cantitate: q, valoare: q * nut, loc, tQ16: t, rataZi }',
    t: T, e: 'HRANA ECRAN stareaHranei',
  },
  {
    n: 'baza pierderii de sub cer pe valoare, nu pe unitati (faramitarea scapa)',
    f: P,
    a: '      if (rules.perisabil[m.kind] === true) bs += m.cantitate * nut',
    b: '      if (rules.perisabil[m.kind] === true) bs += m.valoare',
    t: T, e: 'HRANA ECRAN stareaHranei',
  },
  {
    n: 'mana unui jefuitor hraneste asezarea (si el mananca)',
    f: P,
    a: '    if (a.alive[i] !== 1 || a.faction[i] !== Faction.ASEZARE) continue',
    b: '    if (a.alive[i] !== 1) continue',
    t: T, e: 'HRANA ECRAN stareaHranei',
  },
  {
    n: 'mana in bazinul de sub cer (s-ar strica dupa aer)',
    f: P,
    a: '    valoare += v\n    vr += v\n',
    b: '    valoare += v\n    vs += v\n',
    t: T, e: 'HRANA ECRAN stareaHranei',
  },
  {
    n: 'UI-5: rata de sub cer cu T-ul de ACUM, nu pierderea urmatoarelor 24 h',
    f: P,
    a: '    if (perisabil) rataZi = cx.fCer',
    b: '    if (perisabil) rataZi = rataZilnica(rules, cx.tA)',
    t: T, e: 'HRANA ECRAN stareaHranei',
  },
  {
    n: 'UI-5, inspectorul: noaptea, sub cer, „Se păstrează" cu aerul de acum',
    f: P,
    a: '    if (perisabil) rataZi = cx.fCer',
    b: '    if (perisabil) rataZi = rataZilnica(rules, cx.tA)',
    t: T, e: 'HRANA ECRAN inspectorul sub cer',
  },
  {
    n: 'T-ul componentei citit si cu stampila nevalida (se ghiceste in loc de „nu se știe")',
    f: P,
    a: '        tc = cx.stampilaOk ? tDinStare(w, loc) : null',
    b: '        tc = tDinStare(w, loc)',
    t: T, e: 'HRANA ECRAN inspectorul pe hartie',
  },

  // --- clasele (viewer/ui/model.ts) ---
  {
    n: 'pragul „aproape" la 1%/zi in loc de 0,1%',
    f: M,
    a: 'export const PRAG_APROAPE_ZI = 0.001',
    b: 'export const PRAG_APROAPE_ZI = 0.01',
    t: T, e: 'HRANA ECRAN clasele dupa rata EFECTIVA',
  },
  {
    n: 'la prag fix: „aproape", nu „se păstrează" (< in loc de ≤)',
    f: M,
    a: '  if (tQ16 <= pragAlterare(rules)) return Clasa.PASTREAZA',
    b: '  if (tQ16 < pragAlterare(rules)) return Clasa.PASTREAZA',
    t: T, e: 'HRANA ECRAN clasele dupa rata EFECTIVA',
  },
  {
    n: 'clasa dintr-o formula paralela (parabola continua), nu din λ-ul cuantizat al simularii',
    f: M,
    a: '  return rataZilnica(rules, tQ16) < PRAG_APROAPE_ZI ? Clasa.APROAPE : Clasa.STRICA',
    b: '  return 0.1733 * ((tQ16 - pragAlterare(rules)) / 655360) * ((tQ16 - pragAlterare(rules)) / 655360) < PRAG_APROAPE_ZI ? Clasa.APROAPE : Clasa.STRICA',
    t: T, e: 'HRANA ECRAN clasele dupa rata EFECTIVA',
  },
  {
    n: 'clasa de sub cer dupa T-ul de acum (UI-5), nu dupa urmatoarele 24 h',
    f: M,
    a: '  if (m.loc === LOC_CER) return m.rataZi === 0 ? Clasa.PASTREAZA : m.rataZi < PRAG_APROAPE_ZI ? Clasa.APROAPE : Clasa.STRICA',
    b: '  if (m.loc === LOC_CER) return clasaLaT(rules, m.tQ16!)',
    t: T, e: 'HRANA ECRAN inspectorul sub cer',
  },

  // --- inspectorul (model.ts, texte.ts) ---
  {
    n: 'unitatile pe zi din valoare (puncte), nu din cantitate',
    f: M,
    a: '    n: m.cantitate * Math.min(1, m.rataZi),',
    b: '    n: m.valoare * Math.min(1, m.rataZi),',
    t: T, e: 'HRANA ECRAN inspectorul pe hartie',
  },
  {
    n: 'lânga prag: „cu 0,0 sub prag" in loc de „la prag" (UI-6)',
    f: X,
    a: "    return { eticheta, valoare: d === '0,0' ? `${t} · la prag` : `${t} · cu ${d} sub prag` }",
    b: "    return { eticheta, valoare: `${t} · cu ${d} sub prag` }",
    t: T, e: 'HRANA ECRAN inspectorul pe hartie',
  },
  {
    n: 'mormanul de pe celula atinsa, nu de deasupra (cantitatea pe loc lipseste)',
    f: M,
    a: '  const is = itemLaCelula(w.iteme, wx, wy, z + 1)\n  if (is === -1) return null\n',
    b: '  const is = itemLaCelula(w.iteme, wx, wy, z)\n  if (is === -1) return null\n',
    t: T, e: 'HRANA ECRAN inspectorul pe hartie',
  },
  {
    n: 'sub 0,5 pe zi tot „~0 pe zi" (fara „~1 la N zile")',
    f: X,
    a: '  if (n >= 0.5) return `~${textNumar(Math.round(n))} ${cand}`',
    b: '  if (n >= 0) return `~${textNumar(Math.round(n))} ${cand}`',
    t: T, e: 'HRANA ECRAN textele',
  },
  {
    n: 'anii de la 10 zile, nu de la 100',
    f: X,
    a: '  if (zile < 100) return `~1 la ${cant(zile, \'zile\')}`',
    b: '  if (zile < 10) return `~1 la ${cant(zile, \'zile\')}`',
    t: T, e: 'HRANA ECRAN textele',
  },
  {
    n: 'prognoza in zile intregi si sub 10 zile („~4 zile")',
    f: X,
    a: '  if (z < 100) return `~${Math.floor(z / 10)},${z % 10} zile`',
    b: '  if (z < 10) return `~${Math.floor(z / 10)},${z % 10} zile`',
    t: T, e: 'HRANA ECRAN textele',
  },
  {
    n: 'sub o zi tot in zile („~0,5 zile"), nu in ore',
    f: X,
    a: "  if (ore < 24) return ore === 1 ? '~1 oră' : `~${cant(ore, 'ore')}`",
    b: "  if (ore < 1) return ore === 1 ? '~1 oră' : `~${cant(ore, 'ore')}`",
    t: T, e: 'HRANA ECRAN textele',
  },
  {
    n: 'filtrul cu un singur fel primit scris fara „doar"',
    f: X,
    a: '  return (primite & (primite - 1)) === 0 ? `doar ${nume}` : nume',
    b: '  return nume',
    t: T, e: 'HRANA ECRAN textele',
  },

  // --- alerta, bara, un adevar ---
  {
    n: 'N din alerta numara si mormanele „aproape" (orice clasa cunoscuta)',
    f: M,
    a: '    if (clasaMormanului(rules, m) !== Clasa.STRICA) continue',
    b: '    if (clasaMormanului(rules, m) === null) continue',
    t: T, e: 'HRANA ECRAN alerta',
  },
  {
    n: 'tinta alertei: primul morman, nu cel care pierde cel mai mult',
    f: M,
    a: '    if (pierdere > max) { max = pierdere; tinta = m.slot }',
    b: '    if (tinta === -1) { max = pierdere; tinta = m.slot }',
    t: T, e: 'HRANA ECRAN alerta',
  },
  {
    n: 'alerta aprinsa la orice pierdere medie (fara pragul de 1%/zi)',
    f: M,
    a: "  m.set('hrana-se-strica', hrana.puncte > 0 && h.pericol > 0 && h.pierdereMedie > PRAG_ALERTA_ZI && tintaH !== -1",
    b: "  m.set('hrana-se-strica', hrana.puncte > 0 && h.pericol > 0 && tintaH !== -1",
    t: T, e: 'HRANA ECRAN alerta',
  },
  {
    n: 'pierderea medie raportata la zi in procente (×100): orice pierdere trece de 1%',
    f: M,
    a: '    pierdereMedie: s.valoare > 0 ? s.pierderePeZi / s.valoare : 0,',
    b: '    pierdereMedie: s.valoare > 0 ? (100 * s.pierderePeZi) / s.valoare : 0,',
    t: T, e: 'HRANA ECRAN alerta',
  },
  {
    n: 'UI-4: cheia listei de alerte poarta textul (N care curge reface lista)',
    f: 'viewer/ui/alerte.ts',
    a: "  return afisate.map((a) => a.id).join('\\n')",
    b: "  return afisate.map((a) => `${a.id}|${a.semnal.text}`).join('\\n')",
    t: T, e: 'HRANA ECRAN cheia listei de alerte',
  },
  {
    n: '„hrana-scade" la pragul de atentie (0,893 zile), nu la cel critic',
    f: M,
    a: "  m.set('hrana-scade', hrana.puncte > 0 && !hrana.plafonat && hrana.zile < PRAG_CRITIC_ZILE",
    b: "  m.set('hrana-scade', hrana.puncte > 0 && !hrana.plafonat && hrana.zile < PRAG_ATENTIE_ZILE",
    t: T, e: 'HRANA ECRAN bara si',
  },
  {
    n: 'bara: critic si atentie inversate',
    f: M,
    a: "  return p.zile < PRAG_CRITIC_ZILE ? 'critic' : p.zile < PRAG_ATENTIE_ZILE ? 'atentie' : ''",
    b: "  return p.zile < PRAG_CRITIC_ZILE ? 'atentie' : p.zile < PRAG_ATENTIE_ZILE ? 'critic' : ''",
    t: T, e: 'HRANA ECRAN bara si',
  },
  {
    n: 'UI-9: dialogul Joc nou fara alterare (hrana de start nu se strica)',
    f: M,
    a: '  const subCer = proiecteaza({ seed, tick: 0, subCer: { valoare: v, baza: rules.perisabil[Item.HRANA] === true ? v : 0 }, incaperi: { valoare: 0, pierderePeTick: 0 }, consumPeTick }, rules)',
    b: '  const subCer = proiecteaza({ seed, tick: 0, subCer: { valoare: v, baza: 0 }, incaperi: { valoare: 0, pierderePeTick: 0 }, consumPeTick }, rules)',
    t: T, e: 'HRANA ECRAN un adevar',
  },
  {
    n: 'UI-9: „fara alterare" luat din prognoza cu alterare (Primii pasi scriu aceeasi cifra de doua ori)',
    f: M,
    a: '    prognoza: { puncte: s.valoare, consumPeZi: s.consumPeTick * rules.calendar.ziTicks, zile: p.zile, plafonat: p.plafonat, zileFaraAlterare: f.zile, plafonatFaraAlterare: f.plafonat },',
    b: '    prognoza: { puncte: s.valoare, consumPeZi: s.consumPeTick * rules.calendar.ziTicks, zile: p.zile, plafonat: p.plafonat, zileFaraAlterare: p.zile, plafonatFaraAlterare: f.plafonat },',
    t: T, e: 'HRANA ECRAN un adevar',
  },
  {
    n: 'Primii pasi: pasul camarii fara prognoza cand prognozele difera',
    f: X,
    a: '  return cu === fara ? `${baza} — hrana ține ${cu}` : `${baza} — hrana ține ${fara}, nu ${acum}`',
    b: '  return cu === fara ? `${baza} — hrana ține ${cu}` : baza',
    t: T, e: 'HRANA ECRAN un adevar',
  },

  // --- camara ---
  {
    n: 'presetul fara filtru: camara pictata „primește tot"',
    f: M,
    a: '  if (zonaId !== null && filtru !== 0) {',
    b: '  if (zonaId !== null && filtru === -1) {',
    t: T, e: 'HRANA ECRAN presetul Cămară',
  },
  {
    n: 'filtrul trimis si pentru un depozit general (o comanda in plus, cu masca 0)',
    f: M,
    a: '  if (zonaId !== null && filtru !== 0) {',
    b: '  if (zonaId !== null) {',
    t: T, e: 'HRANA ECRAN presetul Cămară',
  },
  {
    n: 'masca „doar hrana" refuza hrana (bitul gresit)',
    f: M,
    a: 'export const MASCA_DOAR_HRANA = ((1 << ITEME) - 1) & ~(1 << Item.HRANA)',
    b: 'export const MASCA_DOAR_HRANA = ((1 << ITEME) - 1) & ~(1 << Item.PIATRA)',
    t: T, e: 'HRANA ECRAN presetul Cămară',
  },
  {
    n: 'orice depozit care primeste hrana e „camara" (fara filtru)',
    f: M,
    a: '  return s.alive[zs] === 1 && s.kind[zs] === Zona.DEPOZIT && s.refuzate[zs]! !== 0 && primesteFel(s, zs, Item.HRANA)',
    b: '  return s.alive[zs] === 1 && s.kind[zs] === Zona.DEPOZIT && primesteFel(s, zs, Item.HRANA)',
    t: T, e: 'HRANA ECRAN presetul Cămară',
  },
  {
    n: 'capacitatea camarii in celule, nu in oameni',
    f: M,
    a: '  return hranaPeOm > 0 ? Math.floor((celuleleZonei(w, zs) * rules.itemStackMax) / hranaPeOm) : 0',
    b: '  return celuleleZonei(w, zs)',
    t: T, e: 'HRANA ECRAN presetul Cămară',
  },
  {
    n: '„Se strică aici" si cand caraușii o duc singuri in camara (rangul ei mai mare)',
    f: M,
    a: '      if (cam !== null && cam.rang <= aici) return textStricaCamaraAreLoc(cam.prioritate, zs === -1 ? 0 : w.zone.prioritate[zs]!)',
    b: '      if (cam !== null) return textStricaCamaraAreLoc(cam.prioritate, zs === -1 ? 0 : w.zone.prioritate[zs]!)',
    t: T, e: 'HRANA ECRAN „Se strică aici',
  },
  {
    n: '„Se strică aici" si pe hrana care se pastreaza (iarna)',
    f: M,
    a: '    if (m !== null && clasaMormanului(rules, m) === Clasa.STRICA) {',
    b: '    if (m !== null) {',
    t: T, e: 'HRANA ECRAN „Se strică aici',
  },
  {
    n: 'locul din camara numara si celulele ocupate de alt fel (camara plina „are loc")',
    f: M,
    a: '    if (i === -1) loc += rules.itemStackMax\n',
    b: '    if (i === -1 || true) loc += rules.itemStackMax\n',
    t: T, e: 'HRANA ECRAN „Se strică aici',
  },
  {
    // Trimisa spre testul ei (PORTI-4): inainte o prindea doar cheia inspectorului, prin textul starii din JSON-ul cheii.
    n: 'camara isi e singura sfat: mormanul din camara calda „cămara are loc"',
    f: M,
    a: '    if (zs === faraZs || !esteCamara(w, zs) || !primesteFel(s, zs, fel)) continue',
    b: '    if (!esteCamara(w, zs) || !primesteFel(s, zs, fel)) continue',
    t: T, e: 'HRANA ECRAN „Se strică aici',
  },
  {
    n: 'cauza gropii si cand niciun depozit nu primeste felul („nu mai e loc" in loc de FEL_REFUZAT)',
    f: M,
    a: '  if (((vedere.primeste >> it.kind[is]!) & 1) === 1) {',
    b: '  if (((vedere.primeste >> it.kind[is]!) & 1) !== 2) {',
    t: 'tests/camara.test.ts', e: 'poarta-camara: inspectorul',
  },
  {
    n: 'cauza gropii si dupa ce groapa a facut loc (fara `propusa > 0`)',
    f: M,
    a: '    if (gz !== null && gz.g.propusa > 0 && ((gz.g.feluri >> it.kind[is]!) & 1) === 1) return textMolozInCamara(it.kind[is]!, gz.g)',
    b: '    if (gz !== null && ((gz.g.feluri >> it.kind[is]!) & 1) === 1) return textMolozInCamara(it.kind[is]!, gz.g)',
    t: T, e: 'HRANA ECRAN groapa de moloz',
  },
  {
    n: 'groapa peste alta zona (locul nu intreaba de zone)',
    f: M,
    a: '        if (!celulaDeZonaPosibila(w.terrain, x, y, z, rules) || celulaDeZonaLa(s, x, y, z) !== -1) return null',
    b: '        if (!celulaDeZonaPosibila(w.terrain, x, y, z, rules)) return null',
    t: T, e: 'HRANA ECRAN groapa de moloz',
  },
  {
    n: 'JOC-1: locGroapa fara proba de acces — langa pivnita de sub casa, primul patrat „pe suprafata" e acoperisul (z = g + 4)',
    f: M,
    a: '        if (r === NO_REGION || find(w.regions, r) !== comp) return null',
    b: '',
    t: T, e: 'HRANA ECRAN groapa de moloz',
  },
  {
    n: 'groapa departe: cautarea incepe la 5 celule de camara',
    f: M,
    a: '  for (let d = 1; d <= RAZA_GROAPA; d++) {',
    b: '  for (let d = 5; d <= RAZA_GROAPA; d++) {',
    t: T, e: 'HRANA ECRAN groapa de moloz',
  },

  // --- harta U, memoria, cheia ---
  {
    n: 'U: punctul „aproape" plin, ca la „se păstrează"',
    f: O,
    a: 'export const ALFA_PUNCT: readonly number[] = [1, 0.45, 0]',
    b: 'export const ALFA_PUNCT: readonly number[] = [1, 1, 0]',
    t: T, e: 'HRANA ECRAN harta U',
  },
  {
    n: 'U: clasa fixa (toate „se păstrează"), nu din T-ul componentei',
    f: O,
    a: '      o.clase.set(id, clasaLaT(rules, t))',
    b: '      o.clase.set(id, Clasa.PASTREAZA)',
    t: T, e: 'HRANA ECRAN harta U',
  },
  {
    n: 'U: punctul de aceeasi luminozitate ca tenta (contrast inversat)',
    f: O,
    a: '  return l > PRAG_LUMINA_PUNCT ? PUNCT_INCHIS : PUNCT_DESCHIS',
    b: '  return l > PRAG_LUMINA_PUNCT ? PUNCT_DESCHIS : PUNCT_INCHIS',
    t: T, e: 'HRANA ECRAN harta U',
  },
  {
    n: 'memoria hranei refacuta la fiecare tick (o trecere O(mormane) pe citire)',
    f: M,
    a: '      const k = `${Math.floor(w.tick / rules.ticksPerSecond)}|${w.iteme.count}|${w.iteme.vii}|${w.agents.count}`',
    b: '      const k = `${w.tick}|${w.iteme.count}|${w.iteme.vii}|${w.agents.count}`',
    t: T, e: 'HRANA ECRAN memoria hranei',
  },
  {
    n: 'memoria hranei oarba la o comanda in pauza (fara mormane in cheie)',
    f: M,
    a: '      const k = `${Math.floor(w.tick / rules.ticksPerSecond)}|${w.iteme.count}|${w.iteme.vii}|${w.agents.count}`',
    b: '      const k = `${Math.floor(w.tick / rules.ticksPerSecond)}|${w.agents.count}`',
    t: T, e: 'HRANA ECRAN memoria hranei',
  },
  {
    n: 'UI-10: cantitatea mormanului inapoi in inspectie (deci in cheie)',
    f: M,
    a: '    morman = { id: it.id[is]!, fel: it.kind[is]!, rezervat, stare: stareMorman(w, rules, is, vedereFaraDepozit(w, rules)) }',
    b: '    morman = { id: it.id[is]!, fel: it.kind[is]!, cantitate: it.cantitate[is]!, rezervat, stare: stareMorman(w, rules, is, vedereFaraDepozit(w, rules)) } as InspectieMorman',
    t: T, e: 'HRANA ECRAN cheia inspectorului',
  },
  {
    n: 'masca filtrului in cheia inspectorului (comutatorul reface corpul)',
    f: 'viewer/ui/memorie-incapere.ts',
    a: '  const c2 = c.zona === null ? c : { ...c, zona: { ...c.zona, refuzate: 0 } }',
    b: '  const c2 = c',
    t: T, e: 'HRANA ECRAN cheia inspectorului',
  },
  {
    n: 'F3: „în pericol" scrie totalul stricat',
    f: X,
    a: '  return `stricat ${textNumar(stricat)} · în pericol ${textNumar(pericol)} · ${textProcent1(pierdereZi)}/zi`',
    b: '  return `stricat ${textNumar(stricat)} · în pericol ${textNumar(stricat)} · ${textProcent1(pierdereZi)}/zi`',
    t: T, e: 'HRANA ECRAN F3',
  },

  // --- plasele testelor (recenzia t.3, SIM): un oracol cu adevar propriu; o fixtura care nu mai exista iese ROSIE, nu atarna ---
  {
    n: 'PORTI-3: evalueazaMorman da valoarea 0 — prognoza „0 zile"; oracolul care lua sfarsitul din stareaHranei trecea gol',
    f: P,
    a: '  return { slot: i, id: it.id[i]!, kind, cantitate: q, valoare: nutritieEfectiva(q, it.alterare[i]!, nut), loc, tQ16: t, rataZi }',
    b: '  return { slot: i, id: it.id[i]!, kind, cantitate: q, valoare: 0, loc, tQ16: t, rataZi }',
    t: T, e: 'HRANA ECRAN oracolul',
  },
  {
    n: 'PORTI-5: clima +3 °C — nicio fereastra de iarna de 48 h tot anul: cautarea din „pasul orar" (fara plafon atarna)',
    f: 'src/sim/content.ts',
    a: '    tMedieMc: 9400,',
    b: '    tMedieMc: 12400,',
    t: T, e: 'HRANA ECRAN pasul orar sub cer',
  },
  {
    n: 'PORTI-5: clima +3 °C fara valul de frig — nicio zi de iarna sub prag: cautarea din „Se strică aici" (fara plafon atarna)',
    f: 'src/sim/content.ts',
    a: '    tMedieMc: 9400,',
    b: '    tMedieMc: 12400,',
    e2: [{ f: 'src/sim/content.ts', a: '    valFrig: { amplitudineMc: -10000,', b: '    valFrig: { amplitudineMc: 0,' }],
    t: T, e: 'HRANA ECRAN „Se strică aici',
  },
]
