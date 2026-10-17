<!-- Designul t.4 (confortul −8..34 °C), v1, scris inline pe harta din 17.10.2026 (research/confort-t4-harta.md), fără panou. Cifrele [Mn] se reproduc din research/masuratori-t4/; cele marcate „pe hârtie" sunt calcule din content, de verificat pe codul real. -->

# Confortul −8..34 °C — design v1 (S24-27, tăietura 4)

*17.10.2026. v1, înaintea panoului adversarial. Harta: [confort-t4-harta.md](confort-t4-harta.md) — [H1]…[H7], măsurătorile
[M1]…[M4]. Întrebările pe care v1 le lasă deschise, pentru panou, sunt la §13.*

## 0. Ce face felia

Al doilea efect al temperaturii, după hrană: **asupra oamenilor**. Două mecanici, amândouă pe banda **−8..34 °C** din PLAN:

1. **Alegerea locului** (regula Going Medieval din care vine banda; harta, rezumatul, punctul 1): un om nu-și alege un pat și nu stă
   degeaba într-un loc din afara benzii, dacă are un loc în bandă la care ajunge.
2. **Frigul ca stare**: cât stă sub −8 °C, omului i se face frig — o nevoie nouă, `FRIG`, care scade cu cât e mai frig și crește la
   loc oriunde e peste −8 °C. Sub prag merge să se încălzească în cel mai apropiat loc acoperit din bandă; sub pragul critic lasă munca
   pentru asta. Frigul trage dispoziția în jos prin două gânduri de stare, deci prin scara care există deja (lucrează mai încet →
   refuză munca → pleacă).

Ce schimbă jocul: **valul de frig** devine primul pericol pentru oameni. Afară, în ziua valului, ~16 h sub −8 °C [M1]; orice casă
sau pivniță ține omul peste prag: o casă 5×5 de piatră cu pivniță dedesubt nu coboară sub −4 °C, pivnița stă la 2,6–3,9 °C, iar
casele mici singure trec doar puțin sub −8 °C (5×5: −8,2 °C; 3×3: −9,3 °C), prea puțin ca frigul să ajungă la prag (§5) [M3].
Adăpostul nu mai e decor: fără el, colonia pierde ~7,5 h de muncă în ziua valului (§5); cu el, oamenii intră pe rând să se încălzească
și ies înapoi.

**Nu intră** (§12): vatra și orice sursă de căldură, arșița (peste 34 °C nu se poate ajunge azi, [M3]), sănătatea (hipotermia ca
boală, moartea din frig), îmbrăcămintea, o bandă mai strânsă, „cel mai cald" adăpost în loc de „cel mai apropiat", ușa la trecere,
somnul sincronizat cu noaptea.

**Un fapt care trebuie spus înainte de orice** [M2]: în jocul nou implicit, colonia pleacă de foame la 3,25–4,0 zile, iar iarna
începe la 3,667 zile și valul vine la 4,667 sau 5,667. **Fără producție de hrană, nimeni nu trăiește valul în jocul implicit.** Felia
se vede cu hrană adăugată (`&hrana=`, există) sau cu o pornire în ajunul valului (`&start=val`, nouă, §6). Decizia 8 (§10) întreabă
dacă t.4 se face acum (implicit) sau după S28-31.

## 1. Starea

| Câmp | Clasă | Note |
|---|---|---|
| `Nevoie.FRIG = 2`, `NEVOI = 3` | structură | rândul nou al tabelului de nevoi; valoarea în `nevoi[slot·3 + 2]`, 0..`nevoieMax`, MARE = încălzit |
| `nevoi[·FRIG]`, `nevoieReincercaLaTick[·FRIG]` | PERSISTED | aceleași tablouri; răcirea pe perechea (pion, FRIG) e și „căutarea de adăpost a eșuat recent" (§3.3, §8) |
| `NEVOIE_DE_MEDIU = [false, false, true]` | structură (state.ts) | FRIG nu scade singur: scade și crește după temperatura locului (§2); de aici forma rândului din content și pornirea plină |
| `Gand.INFRIGURAT = 7`, `Gand.INGHETAT = 8`, `GANDURI = 9` | structură | gânduri de STARE (din pragurile lui FRIG, nestocate); `GAND_PENTRU_NEVOIE[2]` = {prag: INFRIGURAT, critic: INGHETAT}. Adăugate la COADĂ: `gandFel` salvat (Uint8) rămâne valid |
| `FelJob.INCALZIRE = 6` | PERSISTED (`jobKind`) | locul în tuplul existent `jobWorkX/Y/Z`; `jobTarget = jobDest = jobCantitate = 0`; pașii `PasNevoie` (MERGE, CONSUMA) |
| `nevoi.FRIG` | content | `{ scurgerePeGrad: 6, refacere: 80, prag: 400, pragCritic: 150 }` — fără `scurgere` (§2) |
| `confort` | content | `{ tMinMc: −8000, tMaxMc: 34000, adapostPlafonCelule: 2048 }` |
| `INFRIGURAT`, `INGHETAT` | content | `{ valoare: −60, durata: 0 }`, `{ valoare: −300, durata: 0 }` |
| contoarele | TRANSIENT | în `RatiuneStore`: `frigFaraT` (citiri `null`), `cautariAdapost`, `adaposturiNegasite`, `pasiAdapost`, `adapostTaiat` (nu intră în hash) |

- **Pornirea**: FRIG pornește PLIN (`nevoieMax`), la naștere și la lărgirea din decode. `nevoiaInitiala` (state.ts:473) defazează
  nevoile ca valul de foame să se spargă; pentru o nevoie de mediu defazarea n-are obiect și ar porni oamenii la 401…1000 — deci
  `nevoiaInitiala(id, n, …)` întoarce `nevoieMax` când `NEVOIE_DE_MEDIU[n]` (o funcție, toate căile: naștere, decode, migrare).
- **Forma rândului din content** depinde de felul nevoii (structural, din `NEVOIE_DE_MEDIU`): o nevoie obișnuită are `{scurgere, prag,
  pragCritic}`, una de mediu `{scurgerePeGrad, refacere, prag, pragCritic}`; o cheie a celuilalt fel e refuzată. Nu se refolosește
  `scurgere` cu alt înțeles („pe grad" la FRIG, „pe tic" la FOAME): un câmp cu două meserii e exact tiparul pe care CLAUDE.md îl
  interzice.
- **Banda** e în `confort`, nu în rândul nevoii: o citesc și alegerea locului (§3.4) și căutarea adăpostului (§3.3), nu doar FRIG.

## 2. Frigul: unde se citește, cât de des, cu cât

- **Locul**: celula picioarelor, `cellOf(x)`, `cellOf(y)`, `z` — aceeași regulă ca a pasului termic și a lui `oameniPeComponente`
  (temperatura.ts:1382). **Temperatura**: `temperaturaCelulei(w, x, y, z, tAfara(seed, tick))` (temperatura.ts:1448) — aceeași funcție
  ca pentru mormane: în componentă, T-ul ei; în tocul ușii, partea mai caldă; sub cer, aerul [H2]. O funcție nouă, pură,
  `temperaturaPionului(w, slot)`, o împachetează: un singur loc pentru „unde stă omul și cât e acolo", citit de nevoie, de
  declanșator, de job, de ecran.
- **Cadența**: la tickul de nevoie al pionului (`(tick + id) % nevoiTicks`, 250), în `scurgeNevoile`, ca FOAME și ODIHNA — în
  `stepAgents`, deci pe indexul și T-urile de la capătul tickului trecut, cu ștampila validă (o săpătură din același tick nu e încă
  în index: o celulă tocmai săpată citește „sub cer" un tick; lumea încărcată citește la fel, fiindcă save-ul e între tickuri) [H2].
  Nu un pas nou la 1 Hz: nevoile au deja ceasul lor, iar ordinea tickului din CLAUDE.md rămâne neatinsă.
- **Cu cât** (Q16 °C, întregi; `tMin = tMinMc` în Q16):
  - `T < tMin`: `FRIG −= ceil(scurgerePeGrad · (tMin − T) / 2^16)` — cel puțin 1 pe tic sub bandă, oricât de puțin sub; produsul
    rămâne sub 2^53 (diferența e tăiată la ±1000 °C de plasa termică, `T_SIGURANTA`); jos la 0;
  - `T ≥ tMin`: `FRIG += refacere`, sus la `nevoieMax`. **Peste 34 °C tot se reface**: FRIG măsoară frigul, iar marginea de sus e
    doar a alegerii locului (§3.4) — arșița e în registru;
  - `T === null` (componentă fără T, ștampilă nevalidă — un invariant încălcat): nicio schimbare, `frigFaraT++`.
- **Nu depinde de job**: frigul scade și în somn și la masă, dacă locul e sub −8 °C. (ODIHNA rămâne singura nevoie pe care jobul o reface.)

## 3. Comportamentul

### 3.1 Declanșatorul (în `verificaNevoi`)

Bucla de azi rămâne (ordinea indexului: FOAME, ODIHNA, FRIG), cu ramificarea pe `FEL_PENTRU_NEVOIE[n]` scrisă ca `switch` cu `default`
care REFUZĂ (azi e `if MANANCA … else` somnul — un `else` care ar presupune DOARME pentru orice nevoie nouă, tiparul pe care tabelul de
drivere l-a scos din `lucreaza`). Pentru FRIG, pragul are o condiție în plus: **omul merge să se încălzească doar dacă e ACUM sub
−8 °C** (`temperaturaPionului < tMin`). Peste −8 °C frigul i se reface oricum, oriunde ar fi, iar un drum până la adăpost ar fi muncă
pierdută. Restul e regula de azi: sub `prag` pornește doar fără job; sub `pragCritic` întrerupe, cu mâna goală; ținta (adăpostul) se
caută ÎNAINTE de întrerupere; fără adăpost, răcirea pe pereche (`nevoieRetryTicks`) și `adaposturiNegasite++`.

Ordinea nu se schimbă: cât un om mănâncă sau doarme cu FOAME / ODIHNA sub prag, FRIG nu-l poate întrerupe (bucla iese la prima nevoie
care e deja jobul curent, joburi.ts:3931) [H1]. Mâncatul ține ~2 minute de joc; somnul în frig se întâmplă doar fără adăpost (§3.4) —
deci întreruperea n-ar avea unde să-l ducă. Se scrie, nu se repară (§13, întrebarea 5).

### 3.2 Jobul `INCALZIRE`

`pornesteIncalzire(w, rules, slot, loc)`: fără rezervare (mai mulți oameni pot sta în aceeași celulă, ca azi), `jobId = w.nextId++`,
`jobWorkX/Y/Z = loc`, MERGE → CONSUMA. `DRIVER_INCALZIRE` (rândul nou din tabel):
- `cereri` → `[]` (nimic de reconstruit la încărcare); `tinteVii` → acceptă (ținta e un loc, nu o entitate); `atingeZone: false`;
- `lucreaza` (CONSUMA): dacă nu e pe celula țintei → înapoi la MERGE, ca la `doarme`; dacă `temperaturaPionului` nu mai e în bandă
  (adăpostul s-a răcit — o casă mică în val) → `INTRERUPT`, iar declanșatorul caută altul la tickul următor; dacă FRIG ≥ `nevoieMax`
  → `TERMINAT`. Se încălzește până la capăt, ca somnul (decizia 11);
- `incheie` (INCOMPLET, după un drum refuzat): **răcirea pe perechea (pion, FRIG)** — fără ea, un drum refuzat spre același adăpost ar
  relua căutarea, ar găsi aceeași celulă și ar bucla (ținta nu e o entitate pe care să se scrie răcirea);
- `refaTinta`: `cautaAdapost` din nou; dacă dă aceeași celulă → `false`.

### 3.3 Căutarea adăpostului — o singură funcție

`cautaAdapost(w, rules, slot, banda = confort): Outcome<Loc>` — **cea mai apropiată celulă calcabilă a unei componente cu T în
bandă, în aceeași componentă de mers cu omul** (`regionAt` + `find`, ca `cautaPat`), la cel mult `nevoieScanRadiusCells` (96, raza
nevoilor — deja sub invariantul de acoperire din `parseRules`, deci fără coridoare noi, K05). Refuzul poartă cauza: `FARA_ADAPOST` cu
cel mai apropiat loc acoperit găsit și T-ul lui, sau `BUGET_DEPASIT` la plafon. O funcție pentru toți cititorii: declanșatorul (§3.1),
`refaTinta`, somnul (§3.4), hoinăreala (§3.4) și ecranul („n-au unde să se încălzească" și alerta valului, §8) — lecția recenziei din
25.09: „există X?" și „găsește X" scrise de două ori ajung doi predicați.

- **Parcurgerea, în ordine CANONICĂ**: componentele în ordinea ancorei (`listaComponente`, camere.ts:972), bucățile în ordinea lor,
  celulele unei bucăți în ordinea feliei. Ordinea de inserție a indexului diferă între lumea continuă și cea încărcată [H2]: cu un
  plafon, parcurgerea în ordinea Map-ului ar alege altă celulă după încărcare.
- **Alegerea**: cel mai mic `(d, cheieCelula)`, `d` Manhattan 3D — o ordine totală, deci rezultatul nu depinde de ordinea parcurgerii
  cât nu se atinge plafonul.
- **Tăierea**: componenta se sare dacă T-ul ei (din stare, `tDinStare`) e în afara benzii; bucata se sare dacă limita de jos a
  distanței până la dreptunghiul feliei ei e > rază sau > cel mai bun `d` de până acum; în bucată, celula se sare înainte de
  verificările scumpe dacă `d` nu bate cel mai bun. Plafonul `adapostPlafonCelule` (2.048) numără celulele EXAMINATE (după tăierea pe
  distanță), nu potrivirile; pașii intră în `raport.pasiNevoi` și în `pasiAdapost`.
- **Omul aflat deja într-o componentă în bandă** își găsește propria celulă (`d = 0`): se încălzește pe loc.
- **Ce NU e adăpost în v1**: aerul de afară (când afară e în bandă, frigul nu scade, deci nu e nevoie de adăpost — singurul caz lipsă
  e o încăpere mai rece de −8 °C cu afara peste −8: după val, câteva zeci de minute, casa mică rămâne în urmă [M3]); tocul ușii (nu e
  în nicio componentă; omul care stă acolo se încălzește oricum, la partea caldă).
- **Fără cache**: căutările sunt rare (doar sub −8 °C, cel mult una pe om la `nevoieRetryTicks` când eșuează). Costul se măsoară pe
  M10 la B; un index DERIVED al celulelor calcabile pe componentă intră doar dacă măsurătoarea îl cere.

### 3.4 Alegerea locului (regula benzii)

`locConfortabil(w, x, y, z, tA): Outcome<void>` — `tMin ≤ T ≤ tMax`, cu refuzul `PREA_FRIG` / `PREA_CALD` (T și marginea) sau
`INVARIANT_INCALCAT` pe `null`. Toate trei verificările de mai jos o cheamă pe ea.
- **Patul** (`cautaPat`): un pat din afara benzii se sare (după distanță, înainte de rezervare). Fără niciun pat în bandă, somnul pe loc.
- **Somnul pe loc** (`pornesteDoarme` cu `cs = −1`): dacă locul omului e în afara benzii și `cautaAdapost` găsește ceva, doarme ACOLO
  (merge întâi); altfel pe loc, ca azi. Regula „nu pe un șantier viu" se aplică după, pe locul ales.
- **Hoinăreala** (`alegeTinta`): (a) un om fără job aflat în afara benzii primește ca țintă adăpostul (`cautaAdapost`), fără job — doar
  `goal` (PERSISTED), cu răcirea pe perechea (pion, FRIG) când nu găsește; (b) altfel, o țintă aleatoare din afara benzii se respinge
  (încercarea următoare). Tragerile din `rng.agents` se fac ÎNAINTEA verificării, deci secvența se schimbă doar când se respinge ceva —
  într-o lume în bandă, identică.
- **Mâncatul și munca** nu se filtrează: se mănâncă pe morman (o masă ~2 minute de joc), iar munca e unde e munca. Frigul (§3.1) îi
  scoate de acolo când trebuie.

## 4. Dispoziția

Gândurile de stare ale lui FRIG, prin `GAND_PENTRU_NEVOIE` (cititorii — `tintaDispozitiei`, inspectorul, invariantul catalogului — sunt
deja generici):

| Gând | Când | Valoare | Ținta, singur |
|---|---|---|---|
| „Înfrigurat" | FRIG < 400 | −60 | 440 (×0,94 la muncă) |
| „Înghețat" | FRIG < 150 | −300 | 200: **refuză munca** (< 250), avertisment (< 150) nu, **nu pleacă** (> 60) |

- **Înghețat și înfometat pleacă** (200 − 450 < 60); înghețat și epuizat (200 − 200 = 0) pleacă; înghețat și obosit (120) nu.
- **Invariantul catalogului** (content.ts:1533) ia FRIG automat: minimul atins coboară de la −220 la −520 (≤ 60, trece).
- Ritmul barei (pe hârtie): de la ~490 la 250, ~0,9 h după „Înghețat"; înapoi de la 200 la 500, ~0,9 h după ce frigul trece de prag.

## 5. Calibrarea (pe hârtie, din content)

`scurgerePeGrad` 6 (pe °C sub −8, pe tic de nevoie), `refacere` 80, prag 400, critic 150; un tic de nevoie = 250 de tickuri = 8,9 min
de joc.

| T la picioare | scade pe tic | până la „Înfrigurat" (merge să se încălzească) | până la „Înghețat" (lasă munca) |
|---|---|---|---|
| −16,8 °C (afară, platoul valului) | 53 | 1,79 h | 2,53 h |
| −12 °C | 24 | 3,72 h | 5,36 h |
| −10 °C | 12 | 7,44 h | 10,57 h |
| −9,3 °C (casa 3×3 singură, la minim) | 8 | 11,2 h (stă sub −8 doar 6,6 h [M3]: nu ajunge) | — |
| −8,2 °C (casa 5×5 singură, la minim) | 2 | 44,6 h (nu ajunge) | — |

Încălzirea: de la prag la plin 1,19 h, de la critic 1,64 h, oriunde peste −8 °C. Drumul (250 mm pe tick) e neglijabil: 20 de celule în
80 de tickuri.

**Ziua valului, afară, fără adăpost** (pe hârtie, din profilul [M1]): sub −8 de la ~00:40; pe rampă (până la 03:00) frigul scade în
medie ~27 pe tic, apoi 53; „Înfrigurat" ~03:30, „Înghețat" ~04:15, refuză munca de pe la ~05:10; afară trece de −8 la ~12:00, „Înghețat"
dispare după ~20 de minute, dispoziția trece înapoi de 250 în încă ~20; fereastra de seară (~18:30–24:00, −8…−11 °C) nu ajunge la prag.
Adică **~7,5 h fără muncă pe toată colonia, fără plecări din frig singur**. **Cu un adăpost** în raza nevoilor: ~1,8 h afară, ~1,2 h
înăuntru, pe rând, în fereastra de dimineață — cam 60% din muncă.

**Oamenii încălzesc adăpostul** [M4]: 12 într-o casă 3×3×2 o duc de la −9,3 la ~−4,4 °C în prima oră; în 5×5×2, +9,2 °C la
echilibru. Ce face asta la o cămară din pivniță (+2,7 °C în 6 h cu 12 oameni, de la 3 °C peste pragul de 5 °C) se măsoară la B
(decizia 7).

Țintele acceptanței (§9) sunt cele din tabel, cu benzi; calibrarea se poate muta doar în content.

## 6. Jocul și lumea de azi

- **Scenariul standard și toate literalele rulează toamna** (afară ≥ −2,0 °C [M1]): niciun efect din §2–§4 nu le poate atinge.
  Literalele se mută O DATĂ, la format (A); la efect (B) **rămân identice** — dovada neutralității, ca la t.3.
- **Jocul nou implicit nu ajunge la val** [M2]. Ca să se poată vedea și verifica felia: **`createWorld(seed, rules, tickStart)`** —
  o lume nouă poate porni la alt tick decât 0 (ceasul e `w.tick`, deci calendarul vine singur), iar viewer-ul primește
  `&start=val` = 18:00 în ajunul zilei valului din anul 0. Iarna nu strică hrana (sub 5 °C afară), deci hrana de start ține ~3,5 zile
  întregi după pornire și oamenii trăiesc valul. Doar din URL (pentru verificare și ui-fum), nu în dialogul Joc nou (decizia 8). De
  verificat pe cod: nimic nu presupune `w.tick = 0` la o lume nouă (zerourile de „niciunul" din `scanLaTick`, `nevoieReincercaLaTick`,
  răcirile — toate sub orice tick > 0).
- **Cămara**: dacă cel mai apropiat adăpost în bandă e pivnița-cămară, oamenii o încălzesc (H7). Nu se interzice în v1; se măsoară la B
  (acceptanța „cămara în val"), iar dacă pierderea trece de banda din decizia 7, regula devine „cămara e ultimul adăpost".
- **Oamenii care refuză munca** (dispoziția < 250) nu cer de lucru, deci stau fără job: regula hoinărelii (§3.4 a) îi duce în adăpost.

## 7. Salvarea și hash-ul

**Schema 10.** Nevoile se scriu deja cu `nevoiFeluri` (save.ts:203), iar decode lărgește tabloul (save.ts:534) — un save de schema 9
(`nevoiFeluri: 2`) primește FRIG plin prin `nevoiaInitiala` (§1). `MIGRATIONS[9]` doar ridică schema (lărgirea e a lui decode), cu
**fixtura golden de schema 9 capturată ÎNAINTE** (regula „fiecare migrare cu fixtura ei"; `tools/captura-fixtura-schema9-*.mjs`), cu
oameni în mijlocul unui somn și al unei mese. Decode refuză FRIG în afara [0, `nevoieMax`] (ca pe celelalte) și un `jobKind` 6 cu
`jobTarget`/`jobDest` ≠ 0; encode aruncă pe aceleași condiții. Hash-ul primește FRIG prin `count·NEVOI` (hash.ts:140) — toate
literalele se mută o dată, la A, cu motivul scris (`c4a6c1dc`, `84be6e5e`, `f83bc5fb`, `82d32e8f`, `9b8cdbd4`, `505346b7`, plus
`EXPECTED` din ci.yml). Literal nou la B: **„S+ frig"** — o casă și o pivniță, oameni cu hrană, pornire în ajunul valului, prin val.

## 8. Ce vede jucătorul

- **Cardul omului**: bara „Frig" (sub Odihnă), cu pragurile ca la celelalte; rândul „La picioare: −14,2 °C · afară" (sau „· în casă",
  „· în tocul ușii"), din `temperaturaPionului`; gândurile „Înfrigurat" / „Înghețat" (NUME_GAND); activitatea „Merge să se încălzească" /
  „Se încălzește" (textActivitate). Tabelul Oameni: coloana „Frig" („Fri.").
- **„De ce stă în frig?"**: când căutarea a eșuat recent (răcirea pe perechea FRIG activă) și omul e sub −8 °C — „N-are unde să se
  încălzească: niciun loc acoperit peste −8 °C la mai puțin de 96 de celule" (sau cel mai apropiat, cu T-ul lui), din refuzul lui
  `cautaAdapost`, nu dintr-o a doua regulă.
- **Alertele**: (1) **„Vine un val de frig"** din ajunul zilei valului, cu minimul prognozat (funcție pură de seed și tick:
  `ziuaValului` + `tAfara`) și câți oameni n-au niciun loc acoperit la îndemână — `cautaAdapost` cu banda dată ca parametru (aici:
  orice T, fiindcă T-ul de mâine al casei nu se știe azi), o dată pe oră de joc, nu pe cadru; (2) **„N oameni n-au unde să se
  încălzească"** — clic: primul; (3) **„N oameni îngheață"** (FRIG < critic). Cheia listelor pe id-uri, textul scris pe loc (lecțiile t.3
  pentru alerte).
- **Bara de sus**: temperatura de afară marcată „frig pentru oameni" sub −8 °C. **U**: un rând în legendă pentru −8 °C (nimic nou pe
  hartă).
- **F3**: „frig: înfrigurați N · înghețați M · fără adăpost K · căutări S (pași P)".
- **ui-fum**: o pagină a frigului (`&start=val`, o casă zidită prin comenzi, timpul prin `__kinstead.avanseaza(n)`): bifele — bara pe
  card, „La picioare", alerta valului, omul care intră în casă, activitatea, „n-are unde" pe o lume fără casă, coloana din tabel; o
  probă negativă pe fiecare.

## 9. Porți

- **Formula, pe hârtie** (white-box): T = −16,8 / −10 / −8,0001 / −8 / +40 °C / `null` → scăderea exactă (53, 12, 1, refacere,
  refacere, 0 + contor), ceil-ul, tăierea la 0 și la `nevoieMax`.
- **Declanșatorul**: sub prag și sub −8 → pornește; sub prag și peste −8 → nu; ocupat și ne-critic → nu întrerupe; critic cu mâna goală
  → întrerupe; cu mâna plină → nu; fără adăpost → răcire + contor. **Jobul**: se încheie la plin; iese când adăpostul iese din bandă
  (T scris de test); drumul refuzat → răcire pe pereche (probă: fără răcire, bucla se măsoară); save/load în mijlocul lui:
  `1000 + save + load + 1000 == 2000` (tests/drivere.test.ts).
- **Căutarea**: cea mai apropiată celulă calcabilă în bandă; componentele în afara benzii sărite (T scris); alt `find` sărit; raza;
  plafonul numărat; **aceeași celulă în lumea continuă și în cea încărcată** pe o lume unde ordinea de inserție a indexului diferă, cu
  plafonul atins; omul deja înăuntru → propria celulă.
- **Alegerea locului**: patul în afara benzii sărit; somnul pe loc mutat în adăpost; ținta hoinărelii respinsă; omul fără job din frig
  dus în adăpost; secvența RNG neschimbată într-o lume în bandă. Marginea de SUS, pe un content cu `tMaxMc` 12.000 vara (singura cale
  de a o atinge): patul dintr-o casă de 16 °C sărit, FRIG neatins.
- **Dispoziția**: gândurile din praguri; „Înghețat" singur → refuză, nu pleacă (acceptanță cu oameni reali); catalogul.
- **Acceptanțele, pe drumul NATURAL** (oamenii își caută singuri adăpostul — lecția t.3: fixturile care pornesc jobul de mână scot
  scanerul din probă): (a) valul fără adăpost, 12 oameni cu hrană: toți ajung „Înghețat", refuză, 0 plecări din frig; (b) valul cu
  casă și pivniță (zidite prin comenzi, cu paturi): ciclul afară / înăuntru, timpul „Înghețat" ≈ 0, munca din fereastra de dimineață în
  banda din §5; (c) casa 3×3: oamenii o încălzesc (ΔT măsurat în banda lui [M4]); (d) cămara în val: pierderea de hrană măsurată.
- **Neutralitatea**: la B, standardul și toate literalele identice cu A; contoarele frigului 0 pe standard.
- **K05**: costul pe tick în scena valului (40 de oameni) și pe M10 cu oameni în val — căutările, pașii, p50 / p99; poarta pe contoare.
- **Mutațiile**: suita nouă `frig` (fiecare gardă de mai sus cu proba ei), tiparele `nevoi` re-rulate (se învechesc la editarea
  buclelor, [H6]); rularea completă într-o clonă.

## 10. Decizii pentru Andrei (implicitul în față)

1. **Banda e −8..34 °C**, cum scrie în plan. Azi o atinge doar valul de frig: afară ~16 h sub −8 °C; o casă cu pivniță dedesubt nu
   coboară sub −4 °C; doar o casă mică de piatră, singură, trece puțin sub −8 (3×3: 6,6 h, la cel mult −9,3 °C). Alternativă: o bandă
   mai strânsă (de ex. 0 °C jos — 74 h pe an sub 0 afară, 36 h într-o casă): fără vatră, oamenii ar sta iarna mai mult în pivniță decât
   la muncă — de luat odată cu vatra.
2. **Frigul e o stare care se adună**: afară, la −16 °C, un om rezistă ~1,8 h până merge să se încălzească și ~2,5 h până îngheață; la
   −10 °C, ~7,5 / ~10,5 h; într-o casă mică de −9 °C nu ajunge la prag. Se încălzește în ~1,2 h oriunde peste −8 °C.
3. **Unde se încălzesc**: în cel mai apropiat loc acoperit care e în bandă (casă, pivniță, șopron) și la care ajung. Nu dorm și nu stau
   degeaba într-un loc din afara benzii dacă au unde. Mănâncă și muncesc unde e mâncarea și munca.
4. **„Înghețat" refuză munca, dar nu pleacă din frig singur**; înghețat și înfometat (sau epuizat), pleacă. Fără adăpost, valul costă
   colonia ~7,5 h de muncă; cu adăpost, ~40% din dimineața valului. Alternativă: „Înghețat" ca „Înfometat" (−450), și o colonie fără
   adăpost pleacă în primul val.
5. **Nu se moare de frig** și nu există boală din frig (nu există încă sănătate).
6. **Peste 34 °C contează doar la alegerea locului**; fără „arșiță" — azi nu se poate ajunge acolo (nici vara, nici cu oameni, fără vatră).
7. **Oamenii care se adăpostesc încălzesc locul** (12 într-o casă 3×3: ~+5 °C în prima oră). Dacă cel mai apropiat adăpost e cămara, o
   încălzesc și pe ea; se măsoară, iar dacă pierderea de hrană e mai mare decât ~1% pe val, cămara devine ultimul adăpost.
8. **Felia se face acum**, deși jocul nou implicit nu ajunge la val (hrana de start ține ~3 zile; valul vine la 4,7–5,7): se vede cu
   `&hrana=…` sau cu `&start=val` (pornire în ajunul valului, doar din URL). Alternative: hrana de start dublă (12 oameni ar trăi
   primul val; prognoza și Primii pași se schimbă); sau t.4 după producția de hrană (S28-31), cu S28-31 acum.
9. **Alerte**: valul anunțat din ajun, cu minimul; „N oameni n-au unde să se încălzească"; „N oameni îngheață".
10. **Salvările vechi**: toți oamenii pornesc încălziți.
11. **Se încălzesc până la capăt** (bara plină), ca la somn — nu ies la jumătate.

## 11. Implementarea, în commit-uri

**A — formatul** (FRIG plin și inert; comportament identic, doar hash-ul proiectat): `Nevoie.FRIG`, `NEVOI` 3, `NEVOIE_DE_MEDIU`,
gândurile, `FelJob.INCALZIRE` cu driverul complet dar neatins, `verificaNevoi` cu `switch` și `default` care refuză, `nevoiaInitiala`
pentru nevoile de mediu, content (`nevoi.FRIG` cu forma lui, `confort`, gândurile) + validarea, schema 10 + fixtura de schema 9
(capturată întâi) + refuzurile decode/encode; literalele, o dată, cu proba „funcția de hash de dinainte pe lumea nouă = literalul vechi".
**B — efectul**: §2 în `scurgeNevoile`, `temperaturaPionului`, declanșatorul, `cautaAdapost`, jobul viu, `locConfortabil` în pat / somn /
hoinăreală, motivele și contoarele, `createWorld(…, tickStart)`, acceptanțele (a)–(d), neutralitatea (literalele neschimbate), K05,
literalul „S+ frig", suita de mutații `frig`.
**C — ecranul** (§8) și ui-fum, cu `&start=val`.

Apoi recenzia codului, DEVLOG, OWNER_VERIFY §19 (pașii rulați pe codul real înainte să fie scriși), PLAN, CLAUDE.md, HANDOFF.

## 12. Registru (nu intră)

Vatra (sursa de căldură; cu ea, o bandă mai strânsă și arșița, `NEVOIE_DE_MEDIU` mai are un rând); sănătatea (hipotermia, degerăturile,
moartea din frig); îmbrăcămintea (mută banda per om); „cel mai cald" adăpost în loc de „cel mai apropiat" (iarna pivnița e cu ~7 °C mai
caldă decât casa [M3]); împrăștierea pe celule în adăpost (toți aleg aceeași celulă cea mai apropiată); aerul de afară ca adăpost pentru
o încăpere mai rece decât afara; ordinea nevoilor (FRIG după FOAME și ODIHNA, §3.1); somnul noaptea (valul începe la 00:00); ușa la
trecere (azi trecerea omului nu deschide ușa termic; cu ea, fiecare intrare în adăpost l-ar răci); pornirea în iarnă ca alegere de joc în
dialog.

## 13. Întrebări deschise, pentru panou

1. **Nevoie sau stare separată?** DIGEST (:561) cere temperatura „ca stare, nu ca bară". v1 o face o nevoie fiindcă tabelul de nevoi,
   pragurile, răcirea, întreruperea cu mâna goală, gândurile de stare și lărgirea din decode există deja și sunt probate; „bara" e doar
   felul în care se arată severitatea. Ce se pierde?
2. **Eșantionul la tickul de nevoie (250, decalat)** în loc de un pas la 1 Hz după `pasTermic`: un om care iese 5 minute poate să nu fie
   eșantionat afară deloc. Media e nedeplasată; e și exploatabil?
3. **Declanșatorul „acum sub −8 °C"** în plus față de prag: oscilează cineva la marginea benzii (tocul ușii, o casă care stă la −8)?
4. **`cautaAdapost`**: `listaComponente` sortează toate componentele la fiecare căutare (M10: 677); plafonul pe celule examinate; limita
   de jos pe felie; ce se întâmplă cu o componentă cu celule calcabile în două componente de mers.
5. **Ordinea nevoilor**: un om care doarme în frig fără adăpost nu poate fi trezit de FRIG până nu trece ODIHNA de prag (~0,6 h).
6. **Refacerea peste 34 °C** (FRIG se reface oriunde peste −8): e coerent cu „locul din afara benzii nu e ales"?
7. **Neutralitatea** se sprijină pe „toate literalele rulează toamna": e adevărat pentru toate (de citit duratele scenariilor)?
8. **`createWorld(…, tickStart)`**: presupune ceva din simulare tickul 0 la o lume nouă?
9. **Cămara încălzită de oameni** (decizia 7): regula „cămara e ultimul adăpost" trebuie din prima?
