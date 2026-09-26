/**
 * Registrul suitelor de mutatii. UN singur loc.
 *
 * Sta separat de `ruleaza.mjs` fiindca il citesc doi consumatori: runner-ul si
 * `tools/check-mutatii.mjs`. Cu doua liste, verificatorul ar fi putut da verde
 * pentru o suita pe care runner-ul n-o ruleaza — sau invers.
 */

import { MUTATII as carat } from './carat.mjs'
import { MUTATII as drivere } from './drivere.mjs'
import { MUTATII as nevoi } from './nevoi.mjs'
import { MUTATII as stabilitate } from './stabilitate.mjs'
import { MUTATII as constructie } from './constructie.mjs'
import { MUTATII as render } from './render.mjs'
import { MUTATII as unelte } from './unelte.mjs'
import { MUTATII as grinda } from './grinda.mjs'
import { MUTATII as acces } from './acces.mjs'

export const SUITE = [
  { nume: 'carat', despre: 'taietura 2: iteme, carat, zone pictate', M: carat },
  { nume: 'drivere', despre: 'taietura 3: tabelul de drivere, felul zonei, costul luatului', M: drivere },
  { nume: 'nevoi', despre: 'taietura 3: foame, odihna, dispozitie', M: nevoi },
  { nume: 'stabil', despre: 'S20-23 t.1: stabilitate, prabusire, previzualizare', M: stabilitate },
  { nume: 'constr', despre: 'S20-23 t.2: constructia (pasii 1-5: poarta, schema, kit, sprijin, inchidere)', M: constructie },
  { nume: 'render', despre: 'S6-8: mesher-ul, ocluzia ambientala, scenariul S-DIG', M: render },
  { nume: 'grinda', despre: 'S20-23 t.4: grinda — indexul DERIVED si regula stratificata', M: grinda },
  { nume: 'acces', despre: 'S20-23 t.5: accesul vertical — atingerea pe fel, siguranta, sigilarea, previzualizarea', M: acces },
  { nume: 'unelte', despre: 'instrumentele: harnasamentul de mutatii (doar testul numit)', M: unelte },
]
