/**
 * Mutatii: Taietura 3, structura: tabelul de drivere, felul zonei, costul luatului.
 *
 * 12 de probe. Fiecare intrare: `n` numele, `f` fisierul, `a` tiparul cautat,
 * `b` cu ce se inlocuieste, `t` fisierul de teste care trebuie sa se inroseasca,
 * `e` inceputul numelui testului care trebuie sa pice. `e2` adauga editari.
 *
 * Tiparele se ancoreaza pe o linie UNICA, si de preferat una din CORPUL unei
 * functii, nu doar pe antetul ei: un tipar care se potriveste in doua locuri
 * otraveste primul, adica alta garda decat cea vizata, si „trece" fiindca strica
 * altceva. S-a intamplat.
 */

export const MUTATII = [
  // --- tabelul de drivere ---
  {
    n: 'driverPentru cade inapoi pe SAPA in loc sa refuze',
    f: 'src/sim/joburi.ts',
    a: '  return DRIVERE[fel]\n',
    b: '  return DRIVERE[fel] ?? DRIVER_SAPA\n',
    t: 'tests/drivere.test.ts', e: 'tabelul de drivere acopera',
  },
  {
    // Exact dispecerizarea de dinaintea tabelului: `if CARA ... else SAPA`.
    // Un fel necunoscut cade pe ramura SAPA, gaseste desemnarea, re-rezerva
    // linistit, si jobul SUPRAVIETUIESTE incarcarii cu un fel pe care nu-l
    // cunoaste nimeni.
    n: 'dispecerizarea binara la incarcare (else = SAPA)',
    f: 'src/sim/joburi.ts',
    a: "    } else if (drv === undefined) {\n      // Un fel de job pe care versiunea asta nu-l cunoaste (save mai nou, sau\n      // stare corupta). Se ANULEAZA cu raport — nu se executa ca sapat.\n      out = refuse(Reason.VALOARE_INVALIDA, { camp: 'jobKind', valoare: a.jobKind[i]!, motiv: 'fel de job fara driver' })\n    } else {\n      const vii = drv.tinteVii(w, i)\n      out = vii.ok ? rezervaToate(w.rezervari, a.id[i]!, a.jobId[i]!, drv.cereri(w, rules, i)) : vii\n    }",
    b: "    } else if (a.jobKind[i] === FelJob.CARA) {\n      const vii = DRIVER_CARA.tinteVii(w, i)\n      out = vii.ok ? rezervaToate(w.rezervari, a.id[i]!, a.jobId[i]!, DRIVER_CARA.cereri(w, rules, i)) : vii\n    } else {\n      void drv\n      const vii = DRIVER_SAPA.tinteVii(w, i)\n      out = vii.ok ? rezervaToate(w.rezervari, a.id[i]!, a.jobId[i]!, DRIVER_SAPA.cereri(w, rules, i)) : vii\n    }",
    t: 'tests/drivere.test.ts', e: 'un fel de job fara driver',
  },

  // --- felul zonei ---
  {
    // Prinsa de asertiunea STRUCTURALA (`depoziteOrdonate.length === 0`), nu de
    // rezultatul „marfa nu ajunge in dormitor": filtrul pe CELULE il apara
    // singur pe acela, fiindca `acceptante` ramane 0 pentru un dormitor si deci
    // `maxPrioLibera` nu creste. Cele doua filtre nu sunt redundante — al doilea
    // tine numele listei adevarat (de el depinde cauza NICIO_ZONA) si scuteste
    // `incapeUndeva` de intrari moarte — dar numai unul dintre ele schimba ce
    // fac carausii. Masurat, nu presupus.
    n: 'orice zona intra in lista de depozite',
    f: 'src/sim/zone.ts',
    a: '  for (let i = 0; i < s.count; i++) if (s.alive[i] === 1 && s.kind[i] === Zona.DEPOZIT) ix.depoziteOrdonate.push(i)',
    b: '  for (let i = 0; i < s.count; i++) if (s.alive[i] === 1) ix.depoziteOrdonate.push(i)',
    t: 'tests/drivere.test.ts', e: 'celulele unui dormitor',
  },
  {
    n: 'celulele nu se sorteaza pe felul zonei',
    f: 'src/sim/zone.ts',
    a: "    // Felul zonei alege lista. O celula de dormit nu e loc de depozitare: daca\n    // ar cadea in `libere`/`acceptante`, carausii ar umple paturile.\n    if (s.kind[zs] !== Zona.DEPOZIT) {\n      if (s.kind[zs] === Zona.DORMIT) ix.paturiLibere.push(cs)\n      continue\n    }\n",
    b: '',
    t: 'tests/drivere.test.ts', e: 'celulele unui dormitor',
  },
  {
    n: 'prioritateaLocului ignora felul zonei',
    f: 'src/sim/zone.ts',
    a: '  if (zs === -1 || s.kind[zs] !== Zona.DEPOZIT) return 0',
    b: '  if (zs === -1) return 0',
    t: 'tests/drivere.test.ts', e: 'un morman CAZUT intr-un dormitor',
  },
  {
    n: '„nicio zona" numara zone de orice fel',
    f: 'src/sim/zone.ts',
    a: '      it.ultimulMotivDetaliu[i] = ix.depoziteOrdonate.length === 0 ? DetaliuItem.NICIO_ZONA : DetaliuItem.DEPOZITE_PLINE',
    b: '      it.ultimulMotivDetaliu[i] = s.vii === 0 ? DetaliuItem.NICIO_ZONA : DetaliuItem.DEPOZITE_PLINE',
    t: 'tests/drivere.test.ts', e: '„nicio zona" inseamna niciun DEPOZIT',
  },
  {
    n: 'incarcarea nu valideaza felul zonei',
    f: 'src/sim/zone.ts',
    a: '    if (f >= ZONE_FELURI) return refuse(Reason.VALOARE_INVALIDA, { camp: `zone.kind[${i}]`, valoare: f, min: 0, max: ZONE_FELURI - 1 })\n',
    b: '',
    t: 'tests/drivere.test.ts', e: 'un fel de zona necunoscut',
  },

  // --- comanda de pictare ---
  {
    n: 'pictarea accepta orice fel',
    f: 'src/sim/commands.ts',
    a: "      if (!Number.isInteger(fel) || fel < 0 || fel >= ZONE_FELURI) {\n        return refuse(Reason.VALOARE_INVALIDA, { camp: 'fel', valoare: String(fel), min: 0, max: ZONE_FELURI - 1 })\n      }\n",
    b: '',
    t: 'tests/drivere.test.ts', e: 'pictarea refuza un fel necunoscut',
  },
  {
    n: 'pictarea accepta amestecul de feluri intr-o zona',
    f: 'src/sim/commands.ts',
    a: "      if (zs !== -1 && w.zone.kind[zs] !== fel) {\n        return refuse(Reason.VALOARE_INVALIDA, { camp: 'fel', valoare: String(fel), motiv: 'zona existenta e de alt fel', existent: w.zone.kind[zs]! })\n      }\n",
    b: '',
    t: 'tests/drivere.test.ts', e: 'pictarea refuza un fel necunoscut',
  },

  // --- costul luatului dintr-un morman ---
  {
    n: 'iaDinItem murdareste indexul neconditionat',
    f: 'src/sim/iteme.ts',
    a: '  if (dupa === 0) {\n    stergeItem(s, slot)\n    marcheazaZoneMurdare(w)\n  } else if (peZona || caraSchimbat) {\n    marcheazaZoneMurdare(w)\n  }',
    b: '  if (dupa === 0) stergeItem(s, slot)\n  void peZona\n  void caraSchimbat\n  marcheazaZoneMurdare(w)',
    t: 'tests/drivere.test.ts', e: 'luatul dintr-un morman murdareste indexul DOAR',
  },
  {
    n: 'iaDinItem uita celula de zona',
    f: 'src/sim/iteme.ts',
    a: '  } else if (peZona || caraSchimbat) {',
    b: '  } else if (caraSchimbat) {',
    t: 'tests/drivere.test.ts', e: 'luatul de pe o celula de zona',
  },
  {
    n: 'iaDinItem uita plafonul de carat',
    f: 'src/sim/iteme.ts',
    a: '  } else if (peZona || caraSchimbat) {',
    b: '  } else if (peZona) {',
    t: 'tests/drivere.test.ts', e: 'luatul dintr-un morman murdareste indexul DOAR',
  },
]
