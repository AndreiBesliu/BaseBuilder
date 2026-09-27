/**
 * Numele unui pion — PREZENTARE, nu simulare: sim-ul cunoaste doar `id`-ul. Functie pura de id,
 * deci acelasi om are acelasi nume in lumea continua, dupa o incarcare si pe alt calculator.
 *
 * Bijectie pe 48 × 48 = 2304 de nume: `i = id · 1103 mod 2304`, iar 1103 e prim cu 2304 (= 2^8 · 9),
 * deci doua id-uri sub 2304 nu primesc niciodata acelasi nume. Peste 2304 numele se repeta cu
 * perioada 2304 — `nextId` e comun cu desemnarile si mormanele, deci un pion nascut tarziu poate
 * avea id mare; doi oameni cu acelasi nume cer ca id-urile lor sa difere EXACT printr-un multiplu
 * de 2304.
 */

export const PRENUME: readonly string[] = [
  'Radu', 'Ilinca', 'Vlaicu', 'Dochia', 'Stanca', 'Mircea', 'Neagu', 'Tudora',
  'Voica', 'Bogdan', 'Sanda', 'Dragomir', 'Ruxanda', 'Calina', 'Paraschiva', 'Dan',
  'Ioana', 'Mihnea', 'Anca', 'Stan', 'Petru', 'Floarea', 'Maria', 'Gheorghe',
  'Rada', 'Iancu', 'Sofia', 'Luca', 'Zamfira', 'Vlad', 'Irina', 'Codrin',
  'Doina', 'Aurora', 'Matei', 'Elena', 'Horia', 'Ana', 'Sorin', 'Lia',
  'Tudor', 'Vera', 'Andrei', 'Oana', 'Ștefan', 'Smaranda', 'Nicoară', 'Veta',
]

export const FAMILII: readonly string[] = [
  'Mușat', 'Drăgan', 'Stoica', 'Olteanu', 'Cârstea', 'Voinea', 'Bratu', 'Pârvu',
  'Neagoe', 'Ursu', 'Lupu', 'Dobre', 'Tudose', 'Manea', 'Buzea', 'Stancu',
  'Sârbu', 'Costea', 'Gavrilă', 'Rusu', 'Dinu', 'Bucur', 'Ciobanu', 'Negru',
  'Grecu', 'Munteanu', 'Păun', 'Oprea', 'Moldovan', 'Florea', 'Zamfir', 'Enache',
  'Rotaru', 'Mocanu', 'Fieraru', 'Morar', 'Cojocaru', 'Lăutaru', 'Pescaru', 'Crăciun',
  'Iordache', 'Toma', 'Bălan', 'Stoian', 'Vâlcu', 'Surdu', 'Șerban', 'Tănase',
]

const SPATIU = 2304
const MULTIPLICATOR = 1103

export function numePion(id: number): string {
  const i = (((Math.trunc(id) % SPATIU) * MULTIPLICATOR) % SPATIU + SPATIU) % SPATIU
  return `${PRENUME[i % PRENUME.length]} ${FAMILII[Math.floor(i / PRENUME.length)]}`
}
