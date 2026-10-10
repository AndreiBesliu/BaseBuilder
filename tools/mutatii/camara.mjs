/**
 * Mutatii: S24-27 t.3 — commit-ul C, camara (research/hrana-t3.md §5, §6, §9): filtrul pe fel (`zone.refuzate`, comanda
 * `setFiltruZona`), rangul la prioritate egala, felul obligatoriu al lui `prioritateaLocului` si cititorii lui din viewer
 * (poarta-camara, verif-P4), `VedereFaraDepozit.primeste`, `FEL_REFUZAT`, `PREA_DEPARTE`, groapa de moloz, predicatul X al
 * indexului pe o camara filtrata si acceptanta cu oameni. Fiecare proba strica o garantie si numeste testul scris pentru ea.
 *
 * Probe omise ca echivalente (motivul in raport): iesirea timpurie a vederii (`goalaPeFel !== primeste`, V2b) si saltul
 * „nu aduce niciun fel nou" — doar cost, acelasi raspuns; „departe" fara verificarea locului pe celula de dincolo de raza — o
 * zona se viziteaza doar cu `maxLocLiber ≥ cant`, deci o celula cu loc exista oricum (aproape: se accepta; departe: tot
 * „departe"); poarta `maxRangLibera` scoasa din X sau din `deMutat` — `incapeUndeva` taie oricum la acelasi rang.
 *
 * Fiecare intrare: `n` numele, `f` fisierul, `a` tiparul, `b` inlocuirea, `t` fisierul de teste, `e` inceputul numelui
 * testului care trebuie sa pice, `e2` editari in plus.
 */

const T = 'tests/camara.test.ts'

export const MUTATII = [
  // --- rangul (zone.ts, joburi.ts) ---
  {
    n: 'rangul fara bonusul filtrului: camara la prioritate egala ramane dupa depozitul general (id-ul decide)',
    f: 'src/sim/zone.ts',
    a: '  return s.prioritate[zs]! * 2 + (s.refuzate[zs]! !== 0 ? 1 : 0)',
    b: '  return s.prioritate[zs]! * 2',
    t: T, e: 'rangul: ordinea depozitelor',
  },
  {
    n: 'rangul fara bonusul filtrului — acceptanta cu oameni: camara pictata dupa depozitul general nu primeste hrana',
    f: 'src/sim/zone.ts',
    a: '  return s.prioritate[zs]! * 2 + (s.refuzate[zs]! !== 0 ? 1 : 0)',
    b: '  return s.prioritate[zs]! * 2',
    t: T, e: 'acceptanta camarii cu oameni',
  },
  {
    n: 'depozitele sortate pe prioritate, nu pe rang',
    f: 'src/sim/zone.ts',
    a: '  ix.depoziteOrdonate.sort((a, b) => rangZona(s, b) - rangZona(s, a) || s.id[a]! - s.id[b]!)',
    b: '  ix.depoziteOrdonate.sort((a, b) => s.prioritate[b]! - s.prioritate[a]! || s.id[a]! - s.id[b]!)',
    t: T, e: 'rangul: ordinea depozitelor',
  },
  {
    n: 'incapeUndeva compara prioritatea zonei cu rangul locului (unitati amestecate)',
    f: 'src/sim/zone.ts',
    a: '    if (rangZona(s, zs) <= prioLoc) return false',
    b: '    if (s.prioritate[zs]! <= prioLoc) return false',
    t: T, e: 'rangul: ordinea depozitelor',
  },
  {
    n: 'poarta lui deMutat pe prioritate, nu pe rang',
    f: 'src/sim/zone.ts',
    a: '    if (ix.maxRangLibera[it.kind[i]!]! > prioLoc && incapeUndeva(s, ix, it.kind[i]!, cant, prioLoc)) {',
    b: '    if (ix.maxPrioLibera[it.kind[i]!]! > prioLoc && incapeUndeva(s, ix, it.kind[i]!, cant, prioLoc)) {',
    t: T, e: 'rangul: ordinea depozitelor',
  },
  {
    n: 'maxRangLibera tine prioritatea, nu rangul',
    f: 'src/sim/zone.ts',
    a: '      if (ix.acceptante[zs * ITEME + k]! > 0 && rang > ix.maxRangLibera[k]!) ix.maxRangLibera[k] = rang',
    b: '      if (ix.acceptante[zs * ITEME + k]! > 0 && rang > ix.maxRangLibera[k]!) ix.maxRangLibera[k] = s.prioritate[zs]!',
    t: T, e: 'rangul: ordinea depozitelor',
  },
  {
    n: 'prioritateaLocului intoarce prioritatea, nu rangul (generalul la 4 pierde hrana in camara la 3)',
    f: 'src/sim/zone.ts',
    a: '  if (!primesteFel(s, zs, fel)) return 0\n  return rangZona(s, zs)\n',
    b: '  if (!primesteFel(s, zs, fel)) return 0\n  return s.prioritate[zs]!\n',
    t: T, e: 'rangul: ordinea depozitelor',
  },
  {
    n: 'cautaDestinatie parcurge zonele pe prioritate: hrana din depozitul general (rang 6) nu mai gaseste camara (prioritate 3)',
    f: 'src/sim/joburi.ts',
    a: '    const prio = rangZona(s, zs)\n    if (prio <= prioLoc) break',
    b: '    const prio = s.prioritate[zs]!\n    if (prio <= prioLoc) break',
    t: T, e: 'rangul la egalitate cu pioni',
  },

  // --- filtrul in index si in prioritateaLocului (zone.ts) ---
  {
    n: 'prioritateaLocului ignora filtrul: piatra din camara e „in depozit"',
    f: 'src/sim/zone.ts',
    a: '  if (!primesteFel(s, zs, fel)) return 0\n',
    b: '',
    t: T, e: 'poarta-camara: rezumatul',
  },
  {
    n: 'indexZone: celula goala a camarii primeste orice fel',
    f: 'src/sim/zone.ts',
    a: '        if (!primesteFel(s, zs, k)) continue\n',
    b: '',
    t: T, e: 'indexZone: FEL_REFUZAT',
  },
  {
    n: 'indexZone: celula partiala cu un fel refuzat e loc pentru felul ei',
    f: 'src/sim/zone.ts',
    a: '    } else if (it.cantitate[item]! < rules.itemStackMax && primesteFel(s, zs, it.kind[item]!)) {',
    b: '    } else if (it.cantitate[item]! < rules.itemStackMax) {',
    t: T, e: 'indexZone: FEL_REFUZAT',
  },
  {
    n: 'indexZone nu scrie FEL_REFUZAT („pline" si pentru un fel pe care nu-l primeste nimeni)',
    f: 'src/sim/zone.ts',
    a: '        : primitDeVreunDepozit(s, ix, it.kind[i]!) ? DetaliuItem.DEPOZITE_PLINE : DetaliuItem.FEL_REFUZAT',
    b: '        : DetaliuItem.DEPOZITE_PLINE',
    t: T, e: 'indexZone: FEL_REFUZAT',
  },
  {
    n: 'primitDeVreunDepozit fals mereu: „fel refuzat" si cand un depozit plin il primeste',
    f: 'src/sim/zone.ts',
    a: '  for (const zs of ix.depoziteOrdonate) if (primesteFel(s, zs, fel)) return true\n',
    b: '',
    t: T, e: 'indexZone: FEL_REFUZAT',
  },

  // --- vederea (zone.ts) ---
  {
    n: 'vederea: primeste = toate felurile (inspectorul cere iar „Mărește")',
    f: 'src/sim/zone.ts',
    a: '      primeste |= TOATE & ~s.refuzate[i]!',
    b: '      primeste = TOATE',
    t: T, e: 'poarta-camara: inspectorul',
  },
  {
    n: 'vederea: regula celulei goale pe ORICE fel (V0), cu indexul murdar',
    f: 'src/sim/zone.ts',
    a: '      goalaPeFel |= aici\n',
    b: '      goalaPeFel = TOATE\n',
    t: T, e: 'poarta-camara: vederea',
  },
  {
    n: 'vederea intreaba locul cu un fel gresit (hrana), aritate corecta: tsc nu-l prinde',
    f: 'src/sim/zone.ts',
    a: '      if (prioritateaLocului(s, it.wx[i]!, it.wy[i]!, it.z[i]!, it.kind[i]!) !== 0) return false',
    b: '      if (prioritateaLocului(s, it.wx[i]!, it.wy[i]!, it.z[i]!, 3) !== 0) return false',
    t: T, e: 'poarta-camara: vederea',
  },

  // --- cititorii din viewer (model.ts, texte.ts) ---
  {
    n: 'inspectorul intreaba locul cu un fel gresit (hrana): piatra din camara „În depozit."',
    f: 'viewer/ui/model.ts',
    a: '  const aici = prioritateaLocului(w.zone, it.wx[is]!, it.wy[is]!, it.z[is]!, it.kind[is]!)\n',
    b: '  const aici = prioritateaLocului(w.zone, it.wx[is]!, it.wy[is]!, it.z[is]!, 3)\n',
    t: T, e: 'poarta-camara: inspectorul',
  },
  {
    n: 'rezumatul intreaba locul cu un fel gresit (hrana)',
    f: 'viewer/ui/model.ts',
    a: '    if (prioritateaLocului(w.zone, it.wx[i]!, it.wy[i]!, it.z[i]!, it.kind[i]!) > 0) m.inDepozit += it.cantitate[i]!',
    b: '    if (prioritateaLocului(w.zone, it.wx[i]!, it.wy[i]!, it.z[i]!, 3) > 0) m.inDepozit += it.cantitate[i]!',
    t: T, e: 'poarta-camara: rezumatul',
  },
  {
    n: '„nimeni-cara" intreaba locul cu un fel gresit (hrana): pamantul din camara nu mai e „pe jos"',
    f: 'viewer/ui/model.ts',
    a: '  for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && prioritateaLocului(w.zone, it.wx[i]!, it.wy[i]!, it.z[i]!, it.kind[i]!) === 0) peJosIteme++',
    b: '  for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && prioritateaLocului(w.zone, it.wx[i]!, it.wy[i]!, it.z[i]!, 3) === 0) peJosIteme++',
    t: T, e: 'poarta-camara: „nimeni-cara"',
  },
  {
    n: 'inspectorul nu citeste `primeste`: „pline / Mărește" pe un fel refuzat (m5)',
    f: 'viewer/ui/model.ts',
    a: '    const detaliu = vedere.depozite === 0 ? DetaliuItem.NICIO_ZONA : ((vedere.primeste >> it.kind[is]!) & 1) === 0 ? DetaliuItem.FEL_REFUZAT : DetaliuItem.DEPOZITE_PLINE',
    b: '    const detaliu = vedere.depozite === 0 ? DetaliuItem.NICIO_ZONA : DetaliuItem.DEPOZITE_PLINE',
    t: T, e: 'poarta-camara: inspectorul',
  },
  {
    n: 'alerta veche: „nu încap ... Mărește-le" si pentru mormanele cu fel refuzat (m8)',
    f: 'viewer/ui/model.ts',
    a: '    : refuzate === faraDepozit\n',
    b: '    : false\n',
    t: T, e: 'poarta-camara: alerta fara-depozit',
  },
  {
    n: 'alerta: amestecul (refuzate + pline) cere doar „Mărește-le"',
    f: 'viewer/ui/model.ts',
    a: '      : refuzate > 0\n',
    b: '      : false\n',
    t: T, e: 'poarta-camara: alerta fara-depozit',
  },
  {
    n: 'textul FEL_REFUZAT lipseste (cade pe „Niciun depozit pentru ...")',
    f: 'viewer/ui/texte.ts',
    a: "      if (detaliu === DetaliuItem.FEL_REFUZAT) return { titlu: `Niciun depozit nu primește ${NUME_ITEM_MIC[material] ?? 'marfa asta'}.`, actiune: 'Schimbă filtrul unui depozit sau pictează unul nou.' }\n",
    b: '',
    t: T, e: 'poarta-camara: inspectorul',
  },
  {
    n: 'textul PREA_DEPARTE lipseste',
    f: 'viewer/ui/texte.ts',
    a: "      if (detaliu === DetaliuItem.PREA_DEPARTE) return { titlu: `Depozitul cu loc e prea departe: cărăușii caută loc doar pe ${cant(cifre.razaDepozit, 'celule')} în jurul mormanului.`, actiune: 'Pictează un depozit mai aproape.' }\n",
    b: '',
    t: T, e: 'PREA_DEPARTE: singurul depozit',
  },

  // --- PREA_DEPARTE si felul in cautaJob (joburi.ts) ---
  {
    n: 'cautaDestinatie nu mai spune „departe" (H4 E10: „pline" cu pivnita libera)',
    f: 'src/sim/joburi.ts',
    a: "  if (departeCuLoc) return refuse(Reason.FARA_DEPOZIT, { detaliu: 'departe', zone: zoneCuLoc, raza: rules.haulDestRadiusCells })\n",
    b: '',
    t: T, e: 'PREA_DEPARTE: singurul depozit',
  },
  {
    n: 'cautaJob memoreaza „pline" si pentru „departe"',
    f: 'src/sim/joburi.ts',
    a: "dest.params.detaliu === 'departe' ? DetaliuItem.PREA_DEPARTE : DetaliuItem.DEPOZITE_PLINE",
    b: 'DetaliuItem.DEPOZITE_PLINE',
    t: T, e: 'PREA_DEPARTE: singurul depozit',
  },
  {
    n: 'cautaJob intreaba locul cu un fel gresit (hrana): piatra din camara pare „in depozit" si nu mai pleaca in groapa',
    f: 'src/sim/joburi.ts',
    a: '    const prioLoc = prioritateaLocului(w.zone, ixx, iy, iz, it.kind[s]!)',
    b: '    const prioLoc = prioritateaLocului(w.zone, ixx, iy, iz, 3)',
    t: T, e: 'groapaDeMoloz cu pioni',
  },

  // --- comanda (commands.ts) si salvarea ---
  {
    n: 'setFiltruZona primeste un dormitor',
    f: 'src/sim/commands.ts',
    a: "      if (w.zone.kind[zs] !== Zona.DEPOZIT) {\n        return refuse(Reason.VALOARE_INVALIDA, { camp: 'id', valoare: cmd.id, motiv: 'doar un depozit are filtru', fel: w.zone.kind[zs]! })\n      }\n",
    b: '',
    t: T, e: 'setFiltruZona: refuzurile',
  },
  {
    n: 'setFiltruZona primeste biti in afara felurilor',
    f: 'src/sim/commands.ts',
    a: '      if (!Number.isInteger(cmd.refuzate) || cmd.refuzate < 0 || (cmd.refuzate & ~feluri) !== 0) {',
    b: '      if (!Number.isInteger(cmd.refuzate) || cmd.refuzate < 0) {',
    t: T, e: 'setFiltruZona: refuzurile',
  },
  {
    n: 'setFiltruZona nu murdareste indexul (filtrul n-are efect pana la alta schimbare)',
    f: 'src/sim/commands.ts',
    a: '      // Premisa indexului (ce primeste zona, rangul ei) si a oricarui „n-are unde" tocmai s-a schimbat.\n      marcheazaZoneMurdare(w)\n',
    b: '      // Premisa indexului (ce primeste zona, rangul ei) si a oricarui „n-are unde" tocmai s-a schimbat.\n',
    t: T, e: 'setFiltruZona: refuzurile',
  },
  {
    n: 'setFiltruZona nu uita racirile de marfa',
    f: 'src/sim/commands.ts',
    a: "      uitaRacirileDeMarfa(w)\n      return accept(cmd.id)\n    }\n\n    case 'lasaItem'",
    b: "      return accept(cmd.id)\n    }\n\n    case 'lasaItem'",
    t: T, e: 'setFiltruZona: refuzurile',
  },
  {
    n: 'encode nu scrie filtrul: lumea incarcata are camara fara filtru',
    f: 'src/sim/save.ts',
    a: '        refuzate: Array.from(z.refuzate.subarray(0, z.count)),',
    b: '        refuzate: new Array(z.count).fill(0),',
    t: T, e: 'rangul si filtrul dupa decode',
  },

  // --- groapa de moloz (camara.ts) ---
  {
    n: 'groapa: unitatile promise unui caraus cer si ele loc',
    f: 'src/sim/camara.ts',
    a: '    const liber = Math.max(0, it.cantitate[i]! - sumaRezervata(w.rezervari, it.id[i]!, Strat.CARAT))',
    b: '    const liber = it.cantitate[i]!',
    t: T, e: 'groapaDeMoloz pe hartie',
  },
  {
    n: 'groapa: felurile PRIMITE de camara se numara ca moloz',
    f: 'src/sim/camara.ts',
    a: '    if (primesteFel(s, zc, k)) continue\n',
    b: '',
    t: T, e: 'groapaDeMoloz pe hartie',
  },
  {
    n: 'groapa: o celula goala a unui depozit care refuza molozul e loc',
    f: 'src/sim/camara.ts',
    a: '        if (primesteMoloz) loc += rules.itemStackMax',
    b: '        loc += rules.itemStackMax',
    t: T, e: 'groapaDeMoloz pe hartie',
  },
  {
    n: 'groapa: o celula promisa ca destinatie (LUCRU) e loc',
    f: 'src/sim/camara.ts',
    a: '      if (rezervariPentru(w.rezervari, c.id[cs]!, Strat.LUCRU).length > 0) continue\n',
    b: '',
    t: T, e: 'groapaDeMoloz pe hartie',
  },
  {
    n: 'groapa: o celula de sub un santier viu e loc',
    f: 'src/sim/camara.ts',
    a: '      if (subSantier(w, rules, c.wx[cs]!, c.wy[cs]!, c.z[cs]!)) continue\n',
    b: '',
    t: T, e: 'groapaDeMoloz pe hartie',
  },
  {
    n: 'groapa: o celula partiala da loc intreg',
    f: 'src/sim/camara.ts',
    a: '      if (((feluri >> k) & 1) === 1 && primesteFel(s, zs, k) && it.cantitate[i]! < rules.itemStackMax) loc += rules.itemStackMax - it.cantitate[i]!',
    b: '      if (((feluri >> k) & 1) === 1 && primesteFel(s, zs, k) && it.cantitate[i]! < rules.itemStackMax) loc += rules.itemStackMax',
    t: T, e: 'groapaDeMoloz pe hartie',
  },
  {
    n: 'groapa dimensionata pe lipsa, nu pe tot molozul (locul comun cu hrana o lasa prea mica)',
    f: 'src/sim/camara.ts',
    a: '  const propusa = lipsa > 0 ? Math.ceil(unitati / rules.itemStackMax) + rules.groapaMargineCelule : 0',
    b: '  const propusa = lipsa > 0 ? Math.ceil(lipsa / rules.itemStackMax) + rules.groapaMargineCelule : 0',
    t: T, e: 'groapaDeMoloz pe hartie',
  },
  {
    n: 'groapa fara margine',
    f: 'src/sim/camara.ts',
    a: '  const propusa = lipsa > 0 ? Math.ceil(unitati / rules.itemStackMax) + rules.groapaMargineCelule : 0',
    b: '  const propusa = lipsa > 0 ? Math.ceil(unitati / rules.itemStackMax) : 0',
    t: T, e: 'groapaDeMoloz pe hartie',
  },
  {
    n: 'groapa propusa si cand nu lipseste nimic',
    f: 'src/sim/camara.ts',
    a: '  const propusa = lipsa > 0 ? Math.ceil(unitati / rules.itemStackMax) + rules.groapaMargineCelule : 0',
    b: '  const propusa = true ? Math.ceil(unitati / rules.itemStackMax) + rules.groapaMargineCelule : 0',
    t: T, e: 'groapaDeMoloz pe hartie',
  },
  {
    n: 'groapa: latura cu o celula prea mult la patrat perfect',
    f: 'src/sim/camara.ts',
    a: '  while (latura * latura < propusa) latura++',
    b: '  while (latura * latura <= propusa) latura++',
    t: T, e: 'groapaDeMoloz cu pioni',
  },
  {
    n: 'groapa: filtrul propus primeste tot (si hrana)',
    f: 'src/sim/camara.ts',
    a: '    refuzate: ((1 << ITEME) - 1) & ~feluri,',
    b: '    refuzate: 0,',
    t: T, e: 'groapaDeMoloz pe hartie',
  },

  // --- predicatul X pe o camara filtrata (zone.ts) ---
  {
    n: 'X: clauzele (a)/(b) si pe un depozit care refuza felul (refaceri degeaba)',
    f: 'src/sim/zone.ts',
    a: '  if (zs !== -1 && s.kind[zs] === Zona.DEPOZIT && primesteFel(s, zs, k)) {',
    b: '  if (zs !== -1 && s.kind[zs] === Zona.DEPOZIT) {',
    t: T, e: 'indexul de zone pe o camara filtrata',
  },
  {
    n: 'X: clauza (c) judecata pe prioritate, nu pe rang (hrana din general isi schimba apartenenta nevazuta)',
    f: 'src/sim/zone.ts',
    a: '  const p = prioritateaLocului(s, it.wx[slot]!, it.wy[slot]!, it.z[slot]!, k)\n',
    b: '  const p = prioritateaLocului(s, it.wx[slot]!, it.wy[slot]!, it.z[slot]!, k) >> 1\n',
    t: T, e: 'indexul de zone pe o camara filtrata',
  },
  {
    n: 'X: poarta clauzei (c) pe maxPrioLibera',
    f: 'src/sim/zone.ts',
    a: '  const inainte = ix.maxRangLibera[k]! > p && incapeUndeva(s, ix, k, c0, p)\n  const dupa = ix.maxRangLibera[k]! > p && incapeUndeva(s, ix, k, c1, p)\n',
    b: '  const inainte = ix.maxPrioLibera[k]! > p && incapeUndeva(s, ix, k, c0, p)\n  const dupa = ix.maxPrioLibera[k]! > p && incapeUndeva(s, ix, k, c1, p)\n',
    t: T, e: 'indexul de zone pe o camara filtrata',
  },
]
