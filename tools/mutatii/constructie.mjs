/**
 * Mutatii: S20-23, taietura 2 — constructia.
 *
 * Pasul 1 (poarta pe felul desemnarii) e singurul livrat deocamdata. Probele lui
 * exista de pe acum dintr-un motiv pe care panoul de design l-a masurat: pana la
 * poarta, `cautaJob` nu citea niciodata `d.kind`, si o desemnare de alt fel era
 * luata ca job de SAPAT si stearsa. Cele 29 de probe ale taieturii 1 n-aveau cum
 * s-o vada — nu exista al doilea fel.
 *
 * E aceeasi lectie ca la recenzia taieturii 1, din partea cealalta: o mutatie
 * probeaza ce ating fixturile. Poarta asta a avut nevoie de un FEL nou ca sa
 * poata fi probata, si de-aia `Desemnare.CONSTRUIESTE` exista in cod inainte sa
 * existe o piesa.
 */

export const MUTATII = [
  {
    n: 'poarta pe fel scoasa: orice desemnare e luata ca job de SAPAT',
    f: 'src/sim/joburi.ts',
    a: '      if (d.kind[s] !== Desemnare.SAPA) continue',
    b: '      if (d.kind[s] === -1) continue',
    t: 'tests/constructie.test.ts', e: 'o desemnare care NU e de sapat',
  },
  {
    n: 'poarta mutata in trecerea SCUMPA (candidatii de alt fel mananca plafonul)',
    f: 'src/sim/joburi.ts',
    a: '      if (d.kind[s] !== Desemnare.SAPA) continue\n      raport.vizite++',
    b: '      raport.vizite++',
    t: 'tests/constructie.test.ts', e: 'o desemnare care NU e de sapat',
  },
  {
    n: '`seSapaLa` nu se uita la fel: orice desemnare blocheaza locul de lucru',
    f: 'src/sim/desemnari.ts',
    a: '  return slot !== undefined && d.alive[slot] === 1 && d.kind[slot] === Desemnare.SAPA',
    b: '  return slot !== undefined && d.alive[slot] === 1',
    t: 'tests/constructie.test.ts', e: 'podeaua unei desemnari de CONSTRUIT',
  },
  {
    n: '`seSapaLa` ignora `alive`: o desemnare moarta blocheaza in continuare',
    f: 'src/sim/desemnari.ts',
    a: '  return slot !== undefined && d.alive[slot] === 1 && d.kind[slot] === Desemnare.SAPA',
    b: '  return slot !== undefined && d.kind[slot] === Desemnare.SAPA',
    t: 'tests/constructie.test.ts', e: 'podeaua unei desemnari de CONSTRUIT',
  },
]
