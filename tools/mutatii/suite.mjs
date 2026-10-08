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
import { MUTATII as ui } from './ui.mjs'
import { MUTATII as resurse } from './resurse.mjs'
import { MUTATII as recenzieUi } from './recenzie-ui.mjs'
import { MUTATII as camere } from './camere.mjs'
import { MUTATII as usa } from './usa.mjs'

export const SUITE = [
  { nume: 'carat', despre: 'taietura 2: iteme, carat, zone pictate', M: carat },
  { nume: 'drivere', despre: 'taietura 3: tabelul de drivere, felul zonei, costul luatului', M: drivere },
  { nume: 'nevoi', despre: 'taietura 3: foame, odihna, dispozitie', M: nevoi },
  { nume: 'stabil', despre: 'S20-23 t.1: stabilitate, prabusire, previzualizare', M: stabilitate },
  { nume: 'constr', despre: 'S20-23 t.2: constructia (pasii 1-5: poarta, schema, kit, sprijin, inchidere)', M: constructie },
  { nume: 'render', despre: 'S6-8: mesher-ul, ocluzia ambientala, scenariul S-DIG', M: render },
  { nume: 'grinda', despre: 'S20-23 t.4: grinda — indexul DERIVED si regula stratificata', M: grinda },
  { nume: 'acces', despre: 'S20-23 t.5: accesul vertical — atingerea pe fel, siguranta, sigilarea, previzualizarea', M: acces },
  { nume: 'ui', despre: 'UI-ul de joc: pornirea, tastele, textele, dreptunghiul, alertele, salvarile, modelul', M: ui },
  { nume: 'recenzie-ui', despre: 'recenzia de cod a UI-ului: depozitul, construitul, blocatele, dormitul, textele, salvarea automata, tintirea fara UI', M: recenzieUi },
  { nume: 'resurse', despre: 'mormanele de resurse pe ecran: treapta, rotatia, instantele, culoarea din fisier', M: resurse },
  { nume: 'camere', despre: 'S24-27 t.1: incaperile — indexul pe bucati, apa, fantomele, colturile de chunk, punctele fixe', M: camere },
  { nume: 'usa', despre: 'S24-27 t.1: usa — mersul, privirea inainte, sigilarea, refugiul, previzualizarea, zonele, continutul', M: usa },
  { nume: 'explica', despre: 'recenzia incaperilor, B: explicatia (stalpul, acoperisul neterminat, cota gaurii, bugetul, chepengul, gropile, podeaua)', M: (await import('./explica.mjs')).MUTATII },
  { nume: 'ecran-usa', despre: 'recenzia pe ecran a incaperilor: golul tintit prin raza, dreptunghiul sub acoperis, usa retrasa intreaga, panoul de sus, inspectorul pe zid si pe usa', M: (await import('./ecran-usa.mjs')).MUTATII },
  { nume: 'ecran-ui', despre: 'recenzia incaperilor: overlay-ul I, memoria si frana inspectorului, textele, usa propusa, usa din groapa', M: (await import('./ecran-ui.mjs')).MUTATII },
  { nume: 'fete', despre: 'S24-27 t.2a: fetele incaperilor — D+ (K+1 pasi, iesirea devreme, restrictiile a si b), epocaFete, clasificarea pe hartie, agregarea', M: (await import('./fete.mjs')).MUTATII },
  { nume: 'unelte', despre: 'instrumentele: harnasamentul de mutatii (doar testul numit)', M: unelte },
  { nume: 'clima', despre: 'S24-27 t.2a: ceasul, clima de afara si a solului, continutul calendar/clima/termic, scanerul (transcendentele), bara de sus', M: (await import('./clima.mjs')).MUTATII },
  { nume: 'termic', despre: 'S24-27 t.2a: graful termic si regimul permanent — K din content, conductanta pe hartie, stampila grafului, muchia o data, lema, 2^53, canalele, calibrarea', M: (await import('./termic.mjs')).MUTATII },
  { nume: 'temperatura', despre: 'S24-27 t.2b: temperatura ca stare — capacitatea (masele, contoarele pe bucata, dSolMasivM, calibrarea, valul de frig), jurnalul cu materialul vechi, proveninta C3 (evidenta maselor, rezerva, recalculul, ordinea consumatorului, pompa)', M: (await import('./temperatura.mjs')).MUTATII },
  { nume: 'graf', despre: 'S24-27 t.2b: graful termic incremental (ii) — contributia memorata, indexul invers, sumele pe nod (C\'), mostenirea si egalitatile, K05, stampila, citirea, compararea cu integralul, bucatile lotului', M: (await import('./graf.mjs')).MUTATII },
  { nume: 'stare', despre: 'S24-27 t.2b: temperatura ca stare — punctul unic, invariantii (stampila completa, T in ambele directii, refuzul fara aruncare), pasul de 1 Hz (forma ψ, T*, oamenii, marginea dinamica, comutatorul BigInt, modelul memorat), echilibrul lumii fara istorie', M: (await import('./stare.mjs')).MUTATII },
  { nume: 'termic-ecran', despre: 'S24-27 t.2a + t.2b valul 2: temperatura pe ecran — inspectorul din stare (trei randuri, X_tot, filtrul oamenilor, geometria memorata, cheia de redesenare, textele), oracolul X, oamenii == caldura pasului, overlay-ul U din stare (fara cheie de tick; ancorele, densitatea, tenta), erorile (monitorul, stepSimSigur), avansul de proba (avanseazaSigur), tasta U', M: (await import('./termic-ecran.mjs')).MUTATII },
]
