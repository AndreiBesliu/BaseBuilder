/**
 * Mutatii: instrumentele. Deocamdata doar modul „doar testul numit" al harnasamentului
 * (26.09.2026), fiindca fiecare garda a lui, stricata, ar schimba TOATE verdictele
 * deodata fara ca vreo proba de joc sa se inroseasca: RATATA pe tot (filtrul nu mai
 * prinde nimic) sau un harnasament care crede ca a rulat un test pe care nu l-a rulat.
 */

export const MUTATII = [
  {
    n: 'numele de test nu se scapa pentru `--test-name-pattern` (un nume cu `?` nu se mai potriveste cu el insusi)',
    f: 'tools/mutatii/harnasament.mjs',
    a: "  const literal = prefix.replace(/[.*+?^${}()|[\\]\\\\/]/g, '\\\\$&')",
    b: '  const literal = prefix',
    t: 'tests/mutatii.test.ts', e: 'harnasamentul ruleaza DOAR testul numit',
  },
  {
    n: 'un filtru de nume care nu prinde nimic trece drept rulare (RATATA pe cod corect)',
    f: 'tools/mutatii/harnasament.mjs',
    a: "eroare: rulate < 1 ? `filtrul de nume nu prinde niciun test din ${fisierDeTest}` : null }",
    b: 'eroare: null }',
    t: 'tests/mutatii.test.ts', e: 'harnasamentul ruleaza DOAR testul numit',
  },
  {
    n: 'testele rulate se numara din tot raportul, nu dupa nume (fisierul insusi apare ca test)',
    f: 'tools/mutatii/harnasament.mjs',
    a: '  const rulate = new Set(rezultate.map((x) => x[2]).filter((n) => n.startsWith(prefix))).size',
    b: '  const rulate = rezultate.length',
    t: 'tests/mutatii.test.ts', e: 'harnasamentul ruleaza DOAR testul numit',
  },
]
