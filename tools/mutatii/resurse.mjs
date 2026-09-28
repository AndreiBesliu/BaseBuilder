/**
 * Mutatii: mormanele de resurse pe ecran (viewer/resurse.ts). Contractul fisierelor din Blender il leaga
 * testul direct (tests/resurse.test.ts); aici, partea pura din care viewer-ul alege plasa si rotatia.
 */

const T = 'tests/resurse.test.ts'

export const MUTATII = [
  {
    n: 'treapta se taie cu < in loc de <= (un morman de 25 pare mediu)',
    f: 'viewer/resurse.ts',
    a: '  if (cantitate <= stackMax / 3) return 0',
    b: '  if (cantitate < stackMax / 3) return 0',
    t: T, e: 'resurse: treapta pe treimi din itemStackMax',
  },
  {
    n: 'mormanele moarte se deseneaza (sloturile libere raman pe ecran)',
    f: 'viewer/resurse.ts',
    a: '    if (it.alive[i] !== 1) continue\n    const cheie',
    b: '    const cheie',
    t: T, e: 'resurse: instantele din lume, pe plasa',
  },
  {
    n: 'rotatia nu depinde de wy (un rand intreg de mormane rotit la fel)',
    f: 'viewer/resurse.ts',
    a: '  let h = Math.imul(wx | 0, 0x27d4eb2d) ^ Math.imul(wy | 0, 0x165667b1)',
    b: '  let h = Math.imul(wx | 0, 0x27d4eb2d)',
    t: T, e: 'resurse: numele plasei si rotatia',
  },
  {
    n: 'culoarea din fisier trece cu exponentul intors (mormanele ies mult mai inchise decat solul)',
    f: 'viewer/resurse.ts',
    a: '  return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055',
    b: '  return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** 2.4 - 0.055',
    t: T, e: 'resurse: culoarea liniara din fisier',
  },
]
