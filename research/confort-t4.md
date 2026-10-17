<!-- Designul t.4 (confortul −8..34 °C), v2: v1 scris inline pe harta din 17.10.2026 (research/confort-t4-harta.md; v1 e în commit-ul 933cc96), apoi panoul adversarial din aceeași zi (4 lentile + 9 verificatori, 3,65 M). Rapoartele panoului (raport.md pe lentilă, verificare.md pe constatare, scripturile sondelor) au stat în scratchpad-ul sesiunii; rezumatul lor e în §13 și în DEVLOG. Cifrele [Mn] se reproduc din research/masuratori-t4/; cele marcate „pe hârtie" sunt calcule din content, de verificat pe codul real. -->

# Confortul −8..34 °C — design v2 (S24-27, tăietura 4)

*17.10.2026. v1 + panoul adversarial: 4 lentile (STARE, JOC, COST, ECRAN), 51 de constatări, 9 verificate independent (cele
CRITIC/MARE, cel mult 3 pe lentilă; JOC-4 și COST-4 au trecut de plafon și le-am verificat eu pe cod); 13 agenți, 3,65 M, 74 min.
Harta: [confort-t4-harta.md](confort-t4-harta.md) — [H1]…[H7], [M1]…[M4]; constatările: [STARE-n], [JOC-n], [COST-n], [ECRAN-n].
Ce s-a schimbat față de v1 e marcat [v2: …]; tabelul tuturor constatărilor e la §13.*

**Ce a schimbat panoul, pe scurt.** (1) O constatare CRITICĂ, găsită de două lentile independent și confirmată de doi verificatori:
căutarea adăpostului, cum era scrisă, făcea lumea încărcată să aleagă alt adăpost decât cea continuă — ordinea bucăților dintr-o
componentă vine din sloturi reciclate, deci din istoria indexului; căutarea se rescrie pe felii, în ordinea distanței, cu regiunile
citite o dată pe felie (§3.3). (2) Regula benzii aplicată fără condiție pedepsea colonia fără adăpost; acum se aplică doar când există
un loc în bandă (§3.4). (3) Somnul mutat în adăpost și drumul de hoinăreală spre adăpost n-aveau răcire la un drum refuzat — bucle
măsurate (37 și 504 de joburi de somn); acum o singură intrare, `adapostPentru`, cu o singură răcire (§3.3). (4) Raza de 96 a lăsat
oameni înghețați la 100–130 de celule de casă (lecția J-8 din t.3, a doua oară): o a doua trecere la 384. (5) Toți intrau deodată:
o toleranță la frig pe om, funcție pură de id (§2). (6) Cifrele de pe hârtie erau pesimiste: cu adăpost se păstrează ~75% din munca
dimineții valului, nu ~60%.

## 0. Ce face felia

Al doilea efect al temperaturii, după hrană: **asupra oamenilor**. Două mecanici, amândouă pe banda **−8..34 °C** din PLAN:

1. **Alegerea locului** (regula Going Medieval din care vine banda; harta, rezumatul, punctul 1): un om nu-și alege un pat și nu stă
   degeaba într-un loc din afara benzii, **dacă are un loc în bandă la care ajunge** [v2: JOC-1 — v1 o aplica și fără].
2. **Frigul ca stare**: cât stă sub −8 °C, omului i se face frig — o nevoie nouă, `FRIG`, care scade cu cât e mai frig și crește la
   loc oriunde e peste −8 °C. Sub prag merge să se încălzească în cel mai apropiat loc acoperit din bandă; sub pragul critic lasă munca
   pentru asta. Frigul trage dispoziția în jos prin două gânduri de stare, deci prin scara care există deja (lucrează mai încet →
   refuză munca → pleacă).

Ce schimbă jocul: **valul de frig** devine primul pericol pentru oameni. Afară, în ziua valului, ~16 h sub −8 °C [M1]. **Orice
încăpere închisă** (casă sau pivniță cu ușă) ține omul peste prag; o casă fără ușă sau un șopron stau în val aproape cât afară
(−14,6 / −15,8 °C), iar o mină sau o pivniță fără ușă, sub pământ, poate ține între −8,3 și −3 °C [v2: ECRAN-1, verificarea lui].
Măsurat pe un prototip al mecanicii (12 oameni, ziua valului) [v2: JOC-6]: fără adăpost se pierde ~1/3 din munca zilei (63–64% față
de 91,5% fără frig), cu o încăpere închisă aproape ~1/9 (80–81%); în fereastra de dimineață (01–12 h) se păstrează 35–40% fără adăpost
și 73–76% cu el. Mărimea și felul încăperii nu contează; contează să existe, să fie închisă și să se poată intra în ea.

**Nu intră** (§12): vatra și orice sursă de căldură, arșița (peste 34 °C nu se poate ajunge azi, [M3]), sănătatea (hipotermia ca
boală, moartea din frig), îmbrăcămintea, o bandă mai strânsă, „cel mai cald" adăpost în loc de „cel mai apropiat", ușa la trecere,
somnul sincronizat cu noaptea.

**Un fapt care trebuie spus înainte de orice** [M2]: în jocul nou implicit, colonia pleacă de foame la 3,25–4,0 zile, iar iarna
începe la 3,667 zile și valul vine la 4,667 sau 5,667. **Fără producție de hrană, nimeni nu trăiește valul în jocul implicit.** Felia
se vede cu `?joc=nou&hrana=20000` (singur, `&hrana=` pornește modul de verificare fără UI [v2: ECRAN-11]) sau cu
`?joc=nou&start=val&piatra=1500` — pornire la 12:00 în ajunul valului, cu piatră destulă pentru o casă închisă (§6). Decizia 8 (§10)
întreabă dacă t.4 se face acum (implicit) sau după S28-31.

## 1. Starea

| Câmp | Clasă | Note |
|---|---|---|
| `Nevoie.FRIG = 2`, `NEVOI = 3` | structură | rândul nou al tabelului de nevoi; valoarea în `nevoi[slot·3 + 2]`, 0..`nevoieMax`, MARE = încălzit |
| `nevoi[·FRIG]`, `nevoieReincercaLaTick[·FRIG]` | PERSISTED | aceleași tablouri; răcirea pe perechea (pion, FRIG) are UN înțeles: „căutarea sau drumul spre adăpost a eșuat recent" (§3.3) [v2: STARE-5] |
| `NEVOIE_DE_MEDIU = [false, false, true]` | structură (state.ts) | FRIG nu scade singur: scade și crește după temperatura locului (§2); consultat EXPLICIT în fiecare loc care iterează nevoile (§11 A) [v2: STARE-6] |
| `Gand.INFRIGURAT = 7`, `Gand.INGHETAT = 8`, `GANDURI = 9` | structură | gânduri de STARE (din pragurile lui FRIG, nestocate); `GAND_PENTRU_NEVOIE[2]` = {prag: INFRIGURAT, critic: INGHETAT}. Adăugate la COADĂ: `gandFel` salvat (Uint8) rămâne valid |
| `FelJob.INCALZIRE = 6` | PERSISTED (`jobKind`) | locul în tuplul existent `jobWorkX/Y/Z` (PERSISTED); `jobTarget = jobDest = jobCantitate = 0`; pașii `PasNevoie` (MERGE, CONSUMA) |
| `nevoi.FRIG` | content | `{ scurgerePeGrad: 6, refacere: 80, prag: 400, pragCritic: 150, tolerantaPromile: 250 }` — fără `scurgere` |
| `confort` | content | `{ tMinMc: −8000, tMaxMc: 34000, adapostRazaLargCelule: 384, adapostPlafonFelii: 2048, adapostPenalizareOcupant: 2 }` [v2: JOC-2, COST-3, JOC-5] |
| `INFRIGURAT`, `INGHETAT` | content | `{ valoare: −60, durata: 0 }`, `{ valoare: −270, durata: 0 }` [v2: JOC-10 — era −300] |
| `motivAdapost[slot]` | TRANSIENT (RatiuneStore) | cauza ultimului eșec al lui `adapostPentru` (cod din `MOTIVE`), pentru ecran; nu intră în hash, nu se salvează [v2: STARE-5, ECRAN-3] |
| contoarele | TRANSIENT (RatiuneStore) | `frigFaraT`, `cautariAdapost`, `adaposturiNegasite`, `pasiAdapost` (felii vizitate), `adapostTaiat`, `adapostFeliiFaraRegiuni`, `respingeriBanda` — scrise DOAR de învelișul simulării, niciodată de ecran [v2: STARE-10, ECRAN-4] |

- **Pornirea**: FRIG pornește PLIN (`nevoieMax`), la naștere și la lărgirea din decode: `nevoiaInitiala(id, n, …)` întoarce
  `nevoieMax` când `NEVOIE_DE_MEDIU[n]` (o funcție, toate căile: naștere, decode, migrare). Invariantul defazării din `parseRules`
  (content.ts:1486–1500) sare nevoile de mediu [v2: STARE-6].
- **Forma rândului din content** depinde de felul nevoii: o nevoie obișnuită are `{scurgere, prag, pragCritic}`, una de mediu
  `{scurgerePeGrad, refacere, prag, pragCritic, tolerantaPromile}`; o cheie a celuilalt fel e refuzată. Nu se refolosește `scurgere`
  cu alt înțeles (un câmp cu două meserii). Validare: `scurgerePeGrad ≥ 1`, `1 ≤ refacere ≤ nevoieMax`, `0 ≤ tolerantaPromile ≤ 500`,
  `tMinMc < tMaxMc`, `adapostRazaLargCelule ≥ nevoieScanRadiusCells` (ca `mancareScanRadiusLargCells`), `adapostPlafonFelii ≥ 1`.
- **Banda** e în `confort`, nu în rândul nevoii: o citesc și alegerea locului (§3.4), și căutarea (§3.3), nu doar FRIG.

## 2. Frigul: unde se citește, cât de des, cu cât

- **Locul**: celula picioarelor, `cellOf(x)`, `cellOf(y)`, `z` — aceeași regulă ca a pasului termic și a lui `oameniPeComponente`
  (temperatura.ts:1382). `temperaturaPionului(w, slot): { loc, tQ16, deschisa }` [v2: ECRAN-8], pură, peste
  `temperaturaCelulei(w, x, y, z, tAfara(seed, tick))` și `loculCelulei`: în componentă, T-ul ei (și `deschisa = deschise > 0`); în tocul
  ușii, partea mai caldă; sub cer, aerul [H2]. Un singur loc pentru „unde stă omul și cât e acolo": nevoia, declanșatorul, jobul,
  alegerea locului, ecranul.
- **Cadența**: la tickul de nevoie al pionului (`(tick + id) % nevoiTicks`, 250), în `scurgeNevoile`, ca FOAME și ODIHNA — în
  `stepAgents`, pe indexul și T-urile de la capătul tickului trecut, cu ștampila validă [H2]. **Măsurat pe prototip** [STARE, JOC-13]:
  8 din 8 salvări în mijlocul valului (job pe drum, în CONSUMA, somn mutat, hoinăreală, săpături în tick) ies identice; eșantionul e
  nedeplasat — 0,992 din integrala ideală (0,94–1,01 pe om), 97,6–98,3% din expunerea continuă cu adăpost, 100% fără; abaterea, ~2% în
  favoarea omului, e drumul spre adăpost numărat „cald". Ordinea tickului din CLAUDE.md rămâne neatinsă.
- **Toleranța pe om** [v2: JOC-4]: fără ea, FRIG e plin la toți când afară trece sub −8 și scade identic, deci 10 din 12 intră în
  aceeași oră și producția se oprește în bloc (măsurat), exact tiparul pe care `nevoiaInitiala` îl sparge la FOAME. O funcție pură de
  id, fără RNG: `tol(id) = 1000 − D + (id·137 mod (2D + 1))` promile, `D = tolerantaPromile` (250 → 750…1250). Ancora unei viitoare
  trăsături („rezistent la frig") — DESIGN §5.3: trăsăturile ca delte pe ratele nevoilor.
- **Cu cât** (Q16 °C, întregi; `tMin = tMinMc` în Q16):
  - `T < tMin`: `FRIG −= ceil(scurgerePeGrad · (tMin − T) · 1000 / (tol(id) · 2^16))` — cel puțin 1 pe tic sub bandă; produsul rămâne
    sub 2^53 (T tăiat la ±1000 °C de plasa termică, `T_SIGURANTA`); jos la 0;
  - `T ≥ tMin`: `FRIG += refacere`, sus la `nevoieMax`. Peste 34 °C tot se reface: FRIG măsoară frigul, iar marginea de sus e doar a
    alegerii locului (§3.4);
  - `T === null` (componentă fără T, ștampilă nevalidă): nicio schimbare, `frigFaraT++`.
- **Nu depinde de job**: frigul scade și în somn și la masă, dacă locul e sub −8 °C.

## 3. Comportamentul

### 3.1 Declanșatorul (în `verificaNevoi`)

Ramificarea pe `FEL_PENTRU_NEVOIE[n]` devine `switch` cu `default` care REFUZĂ (azi e `if MANANCA … else` somnul). Pentru FRIG, pragul
are o condiție în plus: **omul merge să se încălzească doar dacă e ACUM sub −8 °C**. Ținta vine din `adapostPentru` (§3.3), căutată
ÎNAINTE de întrerupere; fără ea, răcirea pe pereche și `adaposturiNegasite++`. Restul e regula de azi: sub `prag` pornește doar fără
job; sub `pragCritic` întrerupe, cu mâna goală.

Ordinea nevoilor rămâne indexul (FOAME, ODIHNA, FRIG). Precizarea [v2: JOC-3, verificarea lui]: bucla iese la nevoia care e deja jobul
curent DOAR cât acea nevoie e sub prag (joburi.ts:3926 stă înaintea lui :3931) — deci un om care doarme pe loc în frig poate fi trezit
de FRIG critic de îndată ce ODIHNA trece de 400, dar numai dacă `adapostPentru` găsește un adăpost; cu răcirea activă nu-l trezește.
Cu adăpost, somnul sub −8 °C e 0,3–1,2% din timp (somn început în bandă înainte de răcire, cel mult 1,5 h); fără adăpost, 3,9–4,3%,
oricum fără alternativă [JOC-14, Q5].

### 3.2 Jobul `INCALZIRE`

`pornesteIncalzire(w, rules, slot, loc)`: fără rezervare, `jobId = w.nextId++`, `jobWorkX/Y/Z = loc`, MERGE → CONSUMA.
`DRIVER_INCALZIRE`:
- `cereri` → `[]`; `tinteVii` → acceptă (ținta e un loc); `atingeZone: false`;
- `lucreaza` (CONSUMA): nu e pe celula țintei → MERGE, ca la `doarme`; `temperaturaPionului` în afara benzii → `INTRERUPT`; FRIG ≥
  `nevoieMax` → `TERMINAT` (se încălzește până la capăt, decizia 11). Calea INTRERUPT nu s-a atins pe nicio scenă (0 din ~200 de
  încălziri: oamenii încălzesc casele mici), deci poarta ei e white-box, cu T scris de test, declarată ca atare [v2: JOC-14];
- `incheie` (orice INCOMPLET): răcirea pe perechea (pion, FRIG);
- `refaTinta`: `adapostPentru` din nou; aceeași celulă → `false`.

### 3.3 Căutarea adăpostului — o singură intrare [v2: rescrisă — STARE-1, COST-1…3, COST-5, COST-9, COST-10, JOC-2, JOC-5]

**`adapostPentru(w, rules, slot): Outcome<Loc>`** e SINGURA intrare a simulării, pentru toți cititorii: declanșatorul (§3.1),
`refaTinta`, patul și somnul pe loc (§3.4), hoinăreala (§3.4). (1) Cu răcirea (pion, FRIG) activă → refuz `RACIRE`, fără căutare.
(2) Altfel, `cautaAdapost` cu învelișul care numără, și `motivAdapost[slot]` = cauza. Ecranul cheamă nucleul pur, nu intrarea
[v2: STARE-5, STARE-10, ECRAN-4].

**`cautaAdapostPur(w, rules, poz, optiuni) → { loc | refuz, pasi, celMaiApropiatAcoperit, inBandaInaccesibil, feliiFaraRegiuni }`** —
nucleul, PUR (nu scrie nimic). Opțiunile: banda (implicit `confort`; alerta valului dă „orice T, doar încăperi închise", §8), raza.

- **Ce caută**: cea mai apropiată celulă **calcabilă** a unei componente cu T în bandă, în **aceeași componentă de mers** cu omul.
- **Cum parcurge — V3, măsurat de COST** [COST-3]: feliile indexului de încăperi din cutia razei, în ordinea **(limita de jos a
  distanței până la dreptunghiul feliei, cheia feliei)** — o ordine canonică, fiindcă `idx.chei` e MEREU sortat și nu depinde de istoria
  sloturilor. Candidații se generează prin căutare binară pe (z, by) în `idx.chei`. Pentru fiecare felie: blocul de regiuni se citește
  O DATĂ (`REGION_SIZE = FELIE = 16`, aceeași așezare a celulelor; cheia se re-codează în `blockKey`); **felia fără bloc se sare
  întreagă** (numărată în `feliiFaraRegiuni`); în felie, celula cu bucată ≥ 0 trece, în ordine: regiunea (≠ `NO_REGION` implică
  „calcabil" între tickuri), componenta de mers (`find` == a omului), apoi banda pe T-ul componentei (memorat pe căutare). **Oprirea**:
  limita de jos a feliei următoare > cel mai bun `d`.
- **De ce nu „bucățile în ordinea lor"** (v1): `Componenta.bucati` e sortat pe SLOTUL bucății (camere.ts:588, :675), iar sloturile vin
  LIFO din istoria indexului (camere.ts:403–405); la încărcare indexul se reface de la zero, cu alte sloturi. Măsurat: pe o sală săpată
  prin comenzi de sus în jos, ordinea bucăților diferă după encode/decode pe 90 din 92 de poziții, iar la plafonul de 2.048 de celule
  lumea continuă dă `BUGET_DEPASIT` și cea încărcată `GASIT`, pe 10 din 10 poziții atingibile; cu tiparul „primul găsit câștigă la
  egalitate" (al lui `cautaPat`) diverge și fără plafon [STARE-1, COST-1 și verificatorii lor]. Ordinea de inserție a Map-ului `comp`
  (cum scria harta, H2) nu e problema: `listaComponente` o anulează deja.
- **Alegerea**: cel mai mic `(d', cheieCelula)`, cu `d' = d + adapostPenalizareOcupant · n`, `d` Manhattan 3D, `n` = oamenii care stau
  pe celulă sau o au ca `jobWork` de INCALZIRE (DERIVED din poziții și tuplul jobului, PERSISTED) — fără ea, 9 din 12 aleg aceeași
  celulă, 32 din 40 la 40 de oameni, iar A* prin casa plină își dublează nodurile [v2: JOC-5, COST-4]. Comparația e pe PERECHE, nu
  `d >= bestD` ca în `cautaPat` [verificarea STARE-1]. `d' ≥ d`, deci limita de jos rămâne validă.
- **Se sare** celula de sub un șantier care blochează (`desemnareLaCelula` cu CONSTRUIESTE — aceeași regulă ca la somnul pe loc,
  joburi.ts:3739–3745): cu oameni care se încălzesc pe ea, un perete s-a zidit în 2,71 h în loc de 0,19 h [v2: JOC-5].
- **Două treceri** [v2: JOC-2]: întâi la `nevoieScanRadiusCells` (96); dacă nu găsește nimic (nu și la plafon), a doua la
  `adapostRazaLargCelule` (384), ca la mâncare (joburi.ts:3607–3613) — munca se ia la 96 de celule de PION, deci colonia se întinde peste
  96 de casă: măsurat pe repo, până la 10 din 12 oameni la peste 96 de casă la începutul valului, toți în aceeași componentă de mers cu
  ea; cu 96, „Înghețat" 0,2–9,8% în 11 din 15 rulări, cu a doua trecere 0% în 15 din 15. NU o singură trecere la 384: plafonul, în
  ordinea distanței, s-ar consuma mai devreme. A doua trecere iese din discul de acoperire și se bizuie pe `regionAt` + `find`, ca hrana.
- **Plafonul**: `adapostPlafonFelii` (2.048) numără feliile VIZITATE (inclusiv generarea candidaților, munca dominantă) — o plasă,
  nu o calibrare: fortăreața cu 6 niveluri cere 405, M10 la 80 m 214, maximul geometric în raza 96 ~7.000. **La plafon cu un candidat
  în mână se întoarce candidatul** (`adapostTaiat++`); fără candidat, `BUGET_DEPASIT`, numărat separat și arătat „căutare tăiată",
  niciodată „n-are unde" [v2: COST-10, COST-6].
- **Ce mai ține căutarea** (pentru ecran, pe aceeași parcurgere): cea mai apropiată celulă acoperită VĂZUTĂ din componenta de mers a
  omului, cu T și `deschise` ei; cea mai apropiată celulă în bandă VĂZUTĂ dintr-o altă componentă de mers („e caldă, dar nu se ajunge la
  ea"); câte felii au fost sărite fără regiuni („loc acoperit fără drum cunoscut") [v2: ECRAN-3, COST-9, COST-11].
- **Costul, măsurat pe prototip** [COST]: pe M10 (677 de componente, 3.327 de felii), omul din cameră își găsește celula în prima felie
  (33–37 µs p50); o casă atingibilă la 4…80 m de suprafață e găsită la toate distanțele (88 µs p50, 173 p99); suprafața fără nimic
  atingibil 173–181 µs p50; V3 fără plafon dă aceeași celulă ca o căutare exhaustivă în ordinea distanței în 128/128 de cazuri. În
  colonie: 1–3 µs pe apel, ≤ 0,5 µs/tick pe căutări. Costul care contează în val e altul — hoinăreala (§3.4) și A* prin adăposturi
  aglomerate. Fără index DERIVED; dacă poarta K05 pe o fortăreață adâncă îl cere, „componenta de mers → blocurile ei" e varianta scrisă.
- **Ce NU e adăpost**: aerul de afară; tocul ușii (nu e în nicio componentă; omul din toc se încălzește oricum, la partea caldă).

### 3.4 Alegerea locului (regula benzii) [v2: condiționată — JOC-1, STARE-2…4, COST-4, COST-7]

`locConfortabil(w, x, y, z, tA): Outcome<void>` — `tMin ≤ T ≤ tMax`, cu refuzul `PREA_FRIG` / `PREA_CALD` sau `INVARIANT_INCALCAT` pe
`null`. Regula benzii se aplică **doar când există un loc în bandă** la care ajunge omul:
- **Patul** (`cautaPat`): când primul pat candidat e în afara benzii, `adapostPentru` se cheamă O DATĂ, leneș, pe decizia de somn. Cu
  adăpost: paturile din afara benzii se sar, iar dacă nu rămâne niciunul, omul doarme pe loc ÎN adăpost (rezultatul trece la
  `pornesteDoarme`, fără o a doua căutare). Fără adăpost: cel mai apropiat pat, ca azi — filtrul fără condiție dădea „Dormit pe jos" la
  13,4% din timp, fără niciun câștig termic (sub cer T e același peste tot) [JOC-1].
- **Somnul pe loc** (`pornesteDoarme` cu `cs = −1`): dacă locul omului e în afara benzii și `adapostPentru` dă un loc, doarme acolo
  (merge întâi); altfel pe loc, ca azi. **`DRIVER_DOARME.incheie` scrie răcirea (pion, FRIG) la orice INCOMPLET cu `jobDest = 0`**, ca la
  reluare omul să doarmă pe loc — invariantul „somnul reușește mereu" rămâne adevărat. Fără asta, cu un ostil ținut în ușă: 37 de joburi
  de somn în 6.000 de tickuri (azi 1), 1.719 tickuri dormite (azi 3.659); cu răcirea, 2–3 joburi și ~3.580 [v2: STARE-2, JOC-3].
- **Hoinăreala** (`alegeTinta`): (a) un om fără job aflat ACUM în afara benzii primește ca țintă adăpostul din `adapostPentru` — un
  `goal` (PERSISTED), nu un job, ca omul să-și ceară în continuare de lucru la tickul lui de scanare; fără adăpost (sau cu răcirea),
  ținta aleatoare de azi, NEFILTRATĂ. Un drum de hoinăreală refuzat cât omul e sub −8 °C pune răcirea (pion, FRIG) — fără ea, 245 de
  căutări și 257 de drumuri refuzate pe oră la 6 oameni cu ușa blocată [v2: STARE-4, COST-7]. (b) un om aflat ÎN bandă respinge o țintă
  din afara benzii, iar **la prima respingere `alegeTinta` se oprește pe tickul ăsta** (o încercare, două trageri) — respingerea pe
  eșantion (o casă de 25 de celule în pătratul de 49×49) eșua 88% și rula la fiecare tick, cu tickul scenei valului de la ~100 la
  141–182 µs [v2: STARE-3, COST-4]. Tragerile se fac înaintea verificării, deci într-o lume în bandă secvența RNG e identică (măsurat:
  standardul `c4a6c1dc` neschimbat cu filtrul activ, +0,4 µs/tick).
- **`coboaraDacaIzolat`** nu numără nevoile de mediu (joburi.ts:3370): frigul nu e un motiv să cobori dintr-o pungă [v2: STARE-12,
  ECRAN-14].
- **Mâncatul și munca** nu se filtrează.

## 4. Dispoziția

| Gând | Când | Valoare | Ținta, singur |
|---|---|---|---|
| „Înfrigurat" | FRIG < 400 | −60 | 440 (×0,94 la muncă) |
| „Înghețat" | FRIG < 150 | −270 [v2] | 230: **refuză munca** (< 250), **nu pleacă** (> 60) |

- **Podeaua, scrisă și păzită** [v2: JOC-10]: cea mai rea combinație admisă fără plecare — „Înghețat" + „Dormit pe jos" + cel mai rău gând
  de PRAG al altei nevoi („Obosit" −80) — dă 500 − 270 − 70 − 80 = **80 > 60**. Cu −300 (v1) era 50: un om înghețat, adormit pe jos și
  obosit pleca (măsurat de JOC-3, cu ușa blocată). Poartă în `parseRules`: combinația de mai sus rămâne peste `dispozitiePragPlecare`
  (orice gând de eveniment nou sub −20 o răstoarnă, și asta trebuie să se vadă la parsare, nu în joc). Înghețat și înfometat (−450),
  sau și epuizat (−200), pleacă.
- **Invariantul catalogului** (content.ts:1533) ia FRIG automat: minimul atins coboară de la −220 la −490 (≤ 60, trece).

## 5. Calibrarea

**Pe hârtie, din content** (`scurgerePeGrad` 6, `refacere` 80, prag 400, critic 150; tic de nevoie 250 de tickuri = 8,9 min de joc);
intervalul e pe toleranța de 750…1250‰:

| T la picioare | scade pe tic | până la „Înfrigurat" | până la „Înghețat" |
|---|---|---|---|
| −16,8 °C (afară, platoul valului) | 71…43 (53 la 1000‰) | 1,34…2,08 h | 1,79…2,98 h |
| −12 °C | 32…20 | 2,83…4,46 h | 4,02…6,40 h |
| −10 °C | 16…10 | 5,65…8,93 h | 8,04…12,65 h |
| −9,3 °C (casa 3×3 goală, la minim) | 11…7 | 8,2…12,8 h — stă sub −8 doar 6,6 h [M3]; cu oameni nici atât (min −5,9 °C) | — |

Încălzirea: de la prag la plin 1,19 h, de la critic 1,64 h.

**Măsurat pe prototip (v1, fără toleranță)** [JOC-6, JOC-7, ECRAN-7], ziua valului, 12 oameni cu hrană:

| | fără frig | fără adăpost | cu o încăpere închisă aproape |
|---|---|---|---|
| munca pe zi | 91,4–91,7% | 63,2–64,5% | 80,1–81,3% (3×3, 5×5 sau casă + pivniță: la fel) |
| munca în 01–12 h | — | 35,2–39,6% | 73,4–76,0% |
| „Înghețat" / refuz | — | 32–34% / 30–31% din zi; 0 plecări (și la 40 de oameni) | ~0 |

Ciclul cu adăpost: o încălzire ~1,33 h, drumul ~0,13 h (~218 tickuri, nu „80"), ~3,7 h între vizite. Fără adăpost: „Înfrigurat"
03:25–03:37, „Înghețat" 04:10–04:30, refuză munca 04:46–05:15, muncește iar 12:12–12:24 — 6,6–6,8 h de muncă pierdute pe om. Pivnița
de sub o casă nu e folosită (casa e mai aproape); singură ca adăpost, cu oamenii înăuntru pe rând, urcă de la 3,56 la 4,37 °C [JOC-12].
**De re-măsurat la B**, cu toleranța (§2): câți oameni intră în ora de vârf (ținta: ≤ jumătate din colonie).

## 6. Jocul și lumea de azi

- **Scenariul standard și toate literalele rulează toamna** (afară ≥ −2,0 °C [M1]). Măsurat [STARE-8]: pe prototip, cu funcția de hash
  veche proiectată, toate 6 literalele ies identice; costul standardului e același. Literalele se mută O DATĂ, la format (A); la efect
  (B) rămân identice — dovada neutralității.
- **Pornirea în ajunul valului**: `createWorld(seed, rules, tickStart)` — nimic din simulare nu presupune tickul 0 (grep în src/sim și
  viewer; peste 30 de teste pun deja `w.tick` pe lumi noi) [STARE-11]. `&start=val` = **12:00 în ajunul zilei valului** din anul 0 [v2:
  JOC-7, ECRAN-7, STARE-11]: „Început plin de speranță" (+250, 11,9 h) expiră înainte de val; pornit la 18:00 (v1), acoperea dimineața și
  arăta un val mai blând (refuz 24% în loc de 30%). Afară trece sub −8 °C la ~12,7 h după pornire (~6 min la 3×). Iarna nu strică hrana.
  `start` implică `joc=nou`; o valoare necunoscută se spune pe ecran, pe rândul „ignorate" [v2: ECRAN-11]. Piatra: o casă închisă cu
  interior 3×3×2 cere 57 de piese = 1.140 de piatră, peste cele 1.000 implicite — pașii owner-ului folosesc `&piatra=1500` [v2: ECRAN-2].
- **Viewer-ul și tickul de start** [v2: ECRAN-12]: „timp de joc" (`textTimp(w.tick)`, cinci locuri: numele salvărilor, jurnalul, cardul
  „s-a golit", tooltip-ul calendarului, numele fișierului) se socotește de la tickul de start, scris în meta salvării; slotul salvării
  automate e separat (`auto-<seed>-val`), ca o verificare să nu scrie peste jocul de pe același seed; Primii pași primesc un pas de
  adăpost când valul e la mai puțin de o zi.
- **Geometria casă + pivniță a fixturilor nu se poate intra pe jos** [v2: JOC-9, COST-8]: după ușa casei urmează rampa săpată (o treaptă
  de 3 m), deci casa și pivnița sunt altă componentă de mers decât afara. Cifra din M3 (casa cu pivniță nu coboară sub −4 °C) e termică;
  acceptanțele cu oameni cer o fixtură nouă, cu palier după ușă și `findPath` afară → casă → pivniță asertat ca precondiție.
- **Cămara** [v2: JOC-12]: nicio regulă în v1 (măsurat +0,8 °C în cel mai rău caz, sub 5 °C); acceptanța (d) rămâne ca măsurătoare.
- **Oamenii care refuză munca** stau fără job: hoinăreala (a) îi duce în adăpost.

## 7. Salvarea și hash-ul

**Schema 10.** Nevoile se scriu deja cu `nevoiFeluri` (save.ts:203), iar decode lărgește tabloul (save.ts:534): un save de schema 9
primește FRIG plin. `MIGRATIONS[9]` doar ridică schema, cu **fixtura golden de schema 9 capturată ÎNAINTE**, cu oameni în mijlocul unui
somn și al unei mese. [v2: STARE-9] Azi decode și encode nu validează VALORILE nevoilor; un refuz doar pe FRIG ar fi un al doilea predicat
— deci refuzul pe TOATE nevoile, în [0, `nevoieMax`], în decode ȘI în encode; pe `jobKind` 6, `jobTarget = jobDest = jobCantitate = 0`.
Hash-ul primește FRIG prin `count·NEVOI` (hash.ts:140): toate literalele se mută o dată, la A. **Proba neutralității cere o proiecție**
[v2: STARE-8]: nevoile sunt intercalate (`slot·NEVOI + n`), deci funcția veche, pe tabloul nou, citește alte elemente; proba
de-intercalează (o funcție de test, ca „schema proiectată pe 8" la t.3). Literal nou la B: **„S+ frig"** — casa și pivnița pe fixtura
nouă (§6), oameni cu hrană, pornire la 12:00 în ajun, prin val.

## 8. Ce vede jucătorul [v2: ECRAN-1…14]

- **Cardul omului**: bara **„Căldură"** (MARE = încălzit; „Frig" plină se citea invers [ECRAN-9]); rândul **„Unde stă: −14,2 °C · afară"**
  (sau „· într-o încăpere", „· sub acoperiș, deschis spre afară", „· în tocul ușii", „nu se știe (eroare internă)"), scris PE LOC, în
  afara cheii inspectorului — altfel cardul s-ar reface de 333 de ori pe zi și un clic între mousedown și mouseup s-ar pierde (UI-4 din
  t.3) [ECRAN-8]; gândurile „Înfrigurat" / „Înghețat"; activitatea „Merge să se încălzească" / „Se încălzește". Tabelul Oameni: coloana
  „Cald"; sertarul crește la ~531 px (azi 446 din 452 px ocupați) [ECRAN-6].
- **„De ce stă în frig?"** — o singură funcție de ecran, `deCeInFrig(w, rules, slot)`, pentru inspector și alertă [ECRAN-3], din nucleul
  pur și din `motivAdapost`: NIMIC_IN_RAZA („Niciun loc acoperit pe 384 de celule în jur: zidește o casă sau sapă o pivniță."),
  CEL_MAI_APROAPE_RECE (cu T și „deschisă spre afară — pune ușa" când `deschise > 0`, din `explicaCelula`), IN_BANDA_DAR_INACCESIBIL
  („Casa de la 8 celule are 3 °C, dar nu se ajunge la ea: pune o ușă sau o scară."), FARA_DRUM_CUNOSCUT (felii fără regiuni),
  CAUTARE_TAIATA, DRUM_REFUZAT (răcirea activă, căutarea de acum reușește: „reîncearcă în N s"), DOARME_IN_FRIG („doarme; frigul îl
  trezește când se odihnește destul"). Scurt în „Ce face": „Stă în frig: n-are unde să se încălzească".
- **Alertele** [ECRAN-10, ECRAN-1, COST-6]:
  1. **„Vine un val de frig la miezul nopții: până la −17 °C afară, o zi întreagă."** din 12:00 în ajun (după miezul nopții: „E val de
     frig până la miezul nopții"), cu oamenii în trei categorii, din același nucleu cu opțiunile „orice T, doar încăperi închise": (a) au o
     încăpere închisă — la adăpost; (b) au doar locuri acoperite deschise spre afară — „N oameni au doar locuri deschise spre afară (casa
     fără ușă, șopronul): în val pot fi aproape cât afară; o ușă le închide" (NU „vor fi cât afară": o mină fără ușă stă la −3 °C); (c) n-au
     niciun loc acoperit. Memorată pe (lume, ⌊tick / oră⌋, `camere.epoca`, `agents.count`) și calculată pe felii de oameni pe cadre — pe
     M10, toți oamenii într-un cadru ar costa 5,5 ms cu V3 (20–110 ms cu v1). `CAUTARE_TAIATA` nu se numără „fără loc".
  2. **„N oameni n-au găsit unde să se încălzească"** — ca „flămânzi": FRIG < prag, sub −8 °C ACUM, răcirea activă, nu în INCALZIRE;
     clic: primul.
  3. **„N oameni sunt înghețați: în curând nu mai muncesc."** — FRIG < critic, exclusivă cu 2, fără cei care se încălzesc acum.
  Severitatea, întârzierea, răcirea și ținta clicului intră în `REGULI_ALERTE`; cheia listelor pe id-uri, textul scris pe loc.
- **Bara de sus**: o clasă de culoare și tooltip-ul „sub −8 °C: oamenilor de afară li se face frig", pe predicatul simulării (T < tMin),
  nu pe cifra rotunjită (−8° apare și la −7,6 și la −8,4); fără text nou — la 1.100 px mai sunt 18 px [ECRAN-13]. **U**: un rând în legendă.
- **F3**: „frig: înfrigurați N · înghețați M · fără adăpost K · căutări S (felii P, tăiate T)".
- **ui-fum** — trei lumi scrise în contract [ECRAN-5]: (A) fără casă: bara sub prag după ~03:30, diferită de FOAME și ODIHNA (care pornesc
  defazate), gândurile, alertele 2 și 3, „De ce", refuzul muncii; (B) casă + muncă (desemnări de săpat la peste 20 de celule): jobul pe
  drumul natural, activitatea, intrarea la prag — fără muncă, hoinăreala (a) i-ar duce în casă înainte să scadă FRIG și bifa n-ar putea fi
  verde decât cu jobul pornit de mână; (C) casă fără ușă: alerta valului care nu tace, cauza „deschisă". „Unde stă" se verifică în trei
  locuri (sub cer, într-o încăpere cu |T − T_afara| ≥ 1 °C, în toc) și pe T necunoscut. Probele negative strică GESTUL (citirea înainte de
  val, clicul pe alt om, ușa lipsă, munca lipsă), nu produsul; timpul doar prin `avanseaza`, în pași mici (alertele cer două evaluări la
  500 ms reali).

## 9. Porți

- **Formula** (white-box): T = −16,8 / −10 / −8,0001 / −8 / +40 °C / `null`, la toleranțele 750 / 1000 / 1250‰ → scăderea exactă,
  ceil-ul, tăierea la 0 și la `nevoieMax`; toleranța: funcția de id pe hârtie.
- **Declanșatorul și jobul**: ca în v1 (sub prag + sub −8 → pornește; peste −8 → nu; ocupat ne-critic → nu întrerupe; critic cu mâna goală
  → întrerupe; cu mâna plină → nu; fără adăpost → răcire); jobul se încheie la plin; INTRERUPT white-box; save/load în mijlocul lui
  (tests/drivere.test.ts); **bucla de drum refuzat** — ostil ținut în singura ușă: ≤ 3 joburi de somn și ≥ 3.500 de tickuri dormite din
  6.000, ≤ 1 căutare pe om la `nevoieRetryTicks` pe hoinăreală; probele negative: fără răcire în `DOARME.incheie` / în hoinăreală, bucla se
  măsoară (37 de joburi; 245 de căutări pe oră) [STARE-2, STARE-4].
- **Căutarea**:
  - **determinismul sub plafon** [STARE-1, COST-1, verificatorii]: fixtura = o sală mare (≥ 40×36×4) săpată prin comenzi DE SUS ÎN JOS, o
    celulă pe tick, cu ușă; precondiție ASERTATĂ: ordinea pe slot a lui `c.bucati` diferă între lumea continuă și cea încărcată; apoi
    plafonul de la 1 la N — aceeași decizie (motiv + celulă) și aceeași numărătoare la plafon infinit; proba negativă: mutația „pe slot"
    înroșește. NU pe M10 zidit dintr-un lot (0 componente reordonate: poarta ar fi oarbă) și nu pe M10 cu camerele inaccesibile (0/5.169);
  - **egalitatea**: doi candidați la același `d'`, în bucăți cu ordine diferită — câștigă cheia mică;
  - **găsirea** [COST-2, COST-3]: pe M10 + o casă, oamenii de la suprafață la 4…80 m găsesc casa sub plafonul din content, aceeași celulă
    ca fără plafon (pică v1 și varianta „doar ordinea distanței"); aceeași probă pe o fortăreață cu ≥ 6 niveluri acoperite, cu regiuni la
    adâncime (altfel feliile fără bloc se sar gratis și poarta nu poate pica); pe o lume naturală cu o pivniță ≥ 32×32×3 sigilată în fața
    casei; omul din cameră → `d = 0`;
  - **a doua trecere** [JOC-2]: un om la 150 de celule de singura casă ajunge în ea pe fiecare cititor (hoinăreala, declanșatorul critic,
    somnul pe loc); proba negativă: cu raza largă egală cu prima, nu ajunge; cu un adăpost la ≤ 96, rezultatul nu se schimbă;
  - **împrăștierea și șantierul** [JOC-5]: 12 oameni se întind pe ≥ 4 celule; un perete desenat în adăpost se zidește în timpul valului;
  - plafonul cu candidat → candidatul; felia fără bloc numărată; nucleul pur nu schimbă lumea (instantaneu complet, ca în
    tests/viewer-ui-lume.test.ts:121) [ECRAN-4].
- **Alegerea locului, în PERECHE** [JOC-1 și verificarea lui]: (i) lume fără adăpost: patul de afară e ales, „Dormit pe jos" 0; aceeași lume
  cu o casă în bandă: patul de afară e sărit, omul doarme în casă (fără a doua jumătate, poarta trece și cu filtrul mort); (ii) lume fără
  adăpost, ziua valului: `incercariTinta` însumat rămâne în banda unei zile de toamnă (fără filtru ~7 mii; cu filtrul din v1 ~1,7 milioane);
  (iii) secvența RNG neschimbată într-o lume în bandă. Marginea de SUS, pe un content cu `tMaxMc` 12.000 vara.
- **Dispoziția**: gândurile din praguri; podeaua din §4 în `parseRules`; „Înghețat" singur → refuză, nu pleacă (acceptanță).
- **Acceptanțele, pe drumul NATURAL**, pe fixtura nouă în care se poate intra (§6): (a) valul fără adăpost, 12 oameni cu hrană: „Înghețat",
  refuz, 0 plecări; (b) valul cu o încăpere închisă aproape: munca dimineții 70–80%, „Înghețat" ≈ 0, ora de vârf a intrărilor ≤ jumătate
  din colonie (toleranța); (c) casa 3×3: oamenii o încălzesc (ΔT în banda [M4]); (d) cămara ca singur adăpost: T maxim sub 5 °C, pierderea
  măsurată; (e) un om departe (a doua trecere). Raportul eșantion / expunere continuă în [0,9; 1,1] pe scena valului [JOC-13].
- **Neutralitatea**: la B, standardul și toate literalele identice cu A; contoarele frigului 0 pe standard.
- **K05** [COST-4]: µs/tick pe scena valului (40 de oameni, două case) față de ACEEAȘI scenă cu banda oprită (control); `alegeTinta` pe
  tick și nodurile A* pe drum, cu bandă; căutările p50 / p99 pe M10 și pe fortăreața adâncă.
- **Completitudinea** [ECRAN-14]: `NUME_GAND` are un nume pentru fiecare `Gand` ≠ NICIUNUL; `textActivitate` dă alt text decât „Face
  ceva" pentru fiecare `FelJob`.
- **Mutațiile**: suita nouă `frig`; tiparele `nevoi` re-rulate; testele care devin vide cu NEVOI 3 (tests/nevoi.test.ts:503–509 refuză acum
  pe lungime, nu pe garda testată) se rescriu cu trei rânduri și aserțiune pe `params.camp` [STARE-7]; rularea completă într-o clonă.

## 10. Decizii pentru Andrei (implicitul în față)

1. **Banda e −8..34 °C**, cum scrie în plan. Azi o atinge doar valul de frig: afară ~16 h sub −8 °C; orice încăpere închisă ține omul
   peste prag; o casă fără ușă sau un șopron stau în val aproape cât afară. Alternativă: o bandă mai strânsă (de ex. 0 °C jos — 74 h pe an
   sub 0 afară): fără vatră, oamenii ar sta iarna mai mult înăuntru decât la muncă — de luat odată cu vatra.
2. **Frigul e o stare care se adună**, puțin diferit de la om la om: afară, la −16 °C, un om rezistă 1,3–2,1 h până merge să se încălzească
   și 1,8–3,0 h până îngheață; la −10 °C, 5,7–8,9 / 8,0–12,7 h. Se încălzește în ~1,2 h oriunde peste −8 °C. Cu toleranța, oamenii nu
   intră toți deodată. Alternativă: aceeași toleranță la toți (măsurat: 10 din 12 intră în aceeași oră, producția se oprește în bloc).
3. **Unde se încălzesc**: în cel mai apropiat loc acoperit care e în bandă și la care ajung — de obicei o casă sau o pivniță închisă; o
   mină sau o pivniță fără ușă, dacă e peste −8 °C. Se întind pe mai multe celule și nu stau pe un șantier. Îl caută întâi pe 96 de celule,
   apoi pe 384. Nu dorm și nu stau degeaba în afara benzii **dacă au unde**; dacă n-au, dorm în pat ca azi.
4. **„Înghețat" refuză munca, dar nu pleacă din frig** (nici înghețat, dormit pe jos și obosit); înghețat și înfometat, pleacă. Fără
   adăpost, valul costă ~1/3 din munca zilei; cu o încăpere închisă aproape, ~1/9. Alternativă: „Înghețat" ca „Înfometat" (−450), și o
   colonie fără adăpost pleacă în primul val.
5. **Nu se moare de frig** și nu există boală din frig (nu există încă sănătate).
6. **Peste 34 °C contează doar la alegerea locului**; fără „arșiță" — azi nu se poate ajunge acolo.
7. **Oamenii care se adăpostesc încălzesc locul** (12 într-o casă 3×3: ~+5 °C în prima oră). Cămara folosită ca adăpost se încălzește
   puțin (măsurat +0,8 °C, sub 5 °C), deci nicio regulă pentru ea.
8. **Felia se face acum**, deși jocul nou implicit nu ajunge la val: se vede cu `?joc=nou&hrana=20000` sau `?joc=nou&start=val&piatra=1500`
   (doar din URL). Alternative, măsurate [JOC-8]: hrana de start dublă NU ajunge la valul din ziua 3 (pe seed 12345 hrana se termină în
   dimineața valului și pleacă toți); jocul să înceapă cu trei zile mai târziu (`ziStart` 4): valul vine la 1,7–2,7 zile și colonia
   implicită îl trăiește, dar se mută toate literalele, alterarea și Primii pași, iar primul val vine după ~1 h reală la 1×; sau t.4 după
   producția de hrană (S28-31).
9. **Alerte**: valul anunțat din ajun (de la 12:00), cu minimul și cu cine n-are o încăpere închisă; „N oameni n-au găsit unde să se
   încălzească"; „N oameni sunt înghețați".
10. **Salvările vechi**: toți oamenii pornesc încălziți.
11. **Se încălzesc până la capăt** (bara plină), ca la somn.

## 11. Implementarea, în commit-uri [v2: listele — STARE-6, STARE-12, ECRAN-6]

**A — formatul** (FRIG plin și inert; comportament identic, doar hash-ul proiectat): `Nevoie.FRIG`, `NEVOI` 3, `NEVOIE_DE_MEDIU` consultat
în **fiecare** loc care iterează nevoile — `nevoiaInitiala`, `scurgeNevoile` (ramura de mediu, inertă la A: fără ea, `v − undefined` =
NaN → 0 și colonia e „Înghețat" la primul tic), `parseNevoi` (forma rândului), invariantul defazării, `coboaraDacaIzolat`, `verificaNevoi`
(`switch`); gândurile; `FelJob.INCALZIRE` cu driverul complet dar neatins; content + validarea; schema 10 + fixtura de schema 9 (capturată
întâi) + validarea nevoilor în decode/encode; literalele o dată, cu proba proiectată. Locurile care enumeră nevoile sau felurile de job de
nevoie, de atins aici sau în C: tests/agents.test.ts:98 și :148, tests/saveload.test.ts:216, tests/nevoi.test.ts:503–509, viewer/agenti.ts:279–280,
viewer/overlay-joburi.ts:370–371, viewer/ui/model.ts:538–539 și :1382–1388, bench/ui-fum.mjs:1847, tools/mutatii/acces.mjs:557.
**B — efectul**: §2 cu toleranța, `temperaturaPionului`, declanșatorul, `adapostPentru` + `cautaAdapostPur` (V3, două treceri, împrăștierea,
șantierul, plafonul cu candidat), jobul viu, regula benzii condiționată (pat, somn cu răcire în `DOARME.incheie`, hoinăreala a/b cu
răcirea la drum refuzat), `motivAdapost` și contoarele, podeaua în `parseRules`, `createWorld(…, tickStart)`, fixtura casă + pivniță în care
se poate intra, acceptanțele (a)–(e), neutralitatea, K05, literalul „S+ frig", suita `frig`.
**C — ecranul** (§8): `RandOm` (model.ts:618, :681), cardul (panouri.ts:794), tabelul (:924, :947, :949–953, :969–976, :988, sertarul din ui.css),
`NUME_GAND` (texte.ts:221), `textActivitate` (:386), `REGULI_ALERTE` (alerte.ts:130) și `semnaleAlerte`, overlay-joburi.ts:370, `deCeInFrig`,
„Unde stă", bara de sus, F3, `&start=val` (+ meta tickului de start, slotul automat, Primii pași), ui-fum (trei lumi).

Apoi recenzia codului, DEVLOG, OWNER_VERIFY §19 (pașii rulați pe codul real înainte să fie scriși, în minute reale la 3× de la pornire —
de re-măsurat cu pornirea la 12:00), PLAN, CLAUDE.md, HANDOFF.

## 12. Registru (nu intră)

Vatra (cu ea, o bandă mai strânsă și arșița — încă un rând în `NEVOIE_DE_MEDIU`); sănătatea (hipotermia, degerăturile, moartea din
frig); îmbrăcămintea (mută banda per om; toleranța din §2 e ancora); „cel mai cald" adăpost în loc de „cel mai apropiat" (iarna pivnița e
cu ~7 °C mai caldă decât casa [M3]); aerul de afară ca adăpost pentru o încăpere mai rece decât afara; o prognoză termică reală pentru
alerta valului (pasul rulat înainte pe o copie a stării — singura care desparte mina deschisă de casa deschisă; pe hârtie ~0,17 s pe oră
de joc, de măsurat pe M10) [verificarea ECRAN-1]; indexul DERIVED „componenta de mers → blocurile ei de regiuni", dacă K05 îl cere [COST-3];
ordinea nevoilor; somnul noaptea; ușa la trecere (azi trecerea omului nu deschide ușa termic); pornirea în iarnă ca alegere de joc în
dialog; `ziStart` 4 (decizia 8).

## 13. Panoul, constatare cu constatare

Severitatea după verificare acolo unde a existat una (V = verificată independent; ✓ confirmată, ½ parțial).

| id | sev. | ce | ce face v2 |
|---|---|---|---|
| STARE-1 / COST-1 | **CRITIC** V✓ ×2 | ordinea bucăților vine din sloturi reciclate: sub plafon, lumea încărcată alege alt adăpost | §3.3 pe felii în ordine canonică; poarta pe o sală săpată de sus în jos, cu precondiția asertată |
| COST-2 | MARE V½ | ordinea ancorei + plafonul pe celule: pe M10, 38/40 de oameni din camere și casa de la 4 m negăsite | V3: felii pe distanță, regiunea înaintea numărării |
| COST-3 | MEDIE V½ | plafonul consumat de celule neatingibile (51% felii fără regiuni, 48% necalcabile) | plafonul pe felii vizitate, plasă la 2.048; felia fără bloc sărită |
| COST-4 | MARE (verificată pe cod de mine) | hoinăreala cu respingere rulează la fiecare tick, 88% eșuate; tickul se dublează în val | (b) doar în bandă, oprire la prima respingere; împrăștierea; K05 față de control |
| JOC-1 | MARE V✓ | regula benzii fără condiție: „Dormit pe jos" 13%, oameni încremeniți | condiționată de `adapostPentru`; porți în pereche |
| JOC-2 | MARE V✓ | raza 96 lasă oameni înghețați la 100–130 de celule de casă | a doua trecere la 384 |
| JOC-4 | MARE (verificată pe cod de mine) | toți intră deodată: producția se oprește în bloc | toleranța pe om (§2) |
| STARE-2 / JOC-3 | MEDIE V½ ×2 | somnul mutat în adăpost buclează la un drum refuzat (37 / 504 de joburi) | răcirea în `DOARME.incheie`; `adapostPentru` o citește |
| JOC-10 | MEDIE | podeaua dispoziției 50 cu −300: înghețat + dormit pe jos + obosit pleacă | „Înghețat" −270, podeaua 80, poartă în `parseRules` |
| ECRAN-1 / JOC-11 | MEDIE V½ | alerta „orice T" numără casa fără ușă ca adăpost | trei categorii; textul nu promite „cât afară" |
| STARE-3, STARE-4, COST-7 | MEDIE | hoinăreala: (b) îngheață omul fără adăpost; (a) fără răcire la drum refuzat | (b) doar în bandă; răcirea la drum refuzat în frig |
| STARE-5, ECRAN-3 | MEDIE | răcirea cu trei scriitori și două cauze; „De ce" pe două fapte | `adapostPentru` + `motivAdapost`; `deCeInFrig` cu cauze |
| JOC-5 | MEDIE | toți pe aceeași celulă, și peste un șantier | penalizarea pe ocupanți; șantierul sărit |
| JOC-6 | MEDIE | cifrele ciclului pesimiste; felul adăpostului nu contează | §0, §5, deciziile 2 și 4 pe cifrele măsurate |
| JOC-7, ECRAN-7, STARE-11 | MEDIE / MICĂ | `&start=val` la 18:00: optimismul îmblânzește valul | pornirea la 12:00 în ajun |
| JOC-8 | MEDIE | alternativele deciziei 8 greșite | hrana dublă scoasă ca soluție; `ziStart` 4 adăugat |
| JOC-9, COST-8 | MEDIE | în fixtura casă + pivniță nu se poate intra | fixtură nouă, cu `findPath` asertat |
| COST-5, COST-6 | MEDIE | munca lui v1 nemărginită de plafon; alerta = cadre de 20–110 ms | V3; alerta memorată și pe cadre |
| ECRAN-2 | MEDIE | 1.000 de piatră nu închid nicio casă | `&piatra=1500` în pași |
| ECRAN-4, STARE-10 | MEDIE / MICĂ | ecranul ar scrie contoare în World | nucleu pur + înveliș care numără |
| ECRAN-5 | MEDIE | bife ui-fum care nu pot fi verzi, probe oarbe | trei lumi; probele strică gestul |
| ECRAN-6 | MEDIE | tabelul n-are loc; ~14 locuri atinse | sertarul la ~531 px; lista în §11 C |
| JOC-12 | MICĂ | cămara nu se încălzește cât se temea H7 | fără regulă; măsurătoare |
| JOC-13 | MICĂ | eșantionul e nedeplasat | cifra în §2; poartă pe raport |
| JOC-14 | MICĂ | INTRERUPT și somnul în frig nu se ating natural | white-box declarat; §3.1 corectat |
| STARE-6, STARE-12, ECRAN-14 | MICĂ | locuri nelistate (scurgeNevoile → NaN, coboaraDacaIzolat, teste, viewer) | listele din §11; două porți de completitudine |
| STARE-7 | MICĂ | trei aserțiuni devin vide cu NEVOI 3 | rescrise pe `params.camp` |
| STARE-8 | MICĂ | proba hash-ului cere o proiecție | scrisă în §7 |
| STARE-9 | MICĂ | decode nu validează azi nicio nevoie | validarea pe toate, decode și encode |
| COST-9 | MICĂ | adăpostul fără regiuni e invizibil; textul ar minți | `feliiFaraRegiuni`; „fără drum cunoscut" |
| COST-10, COST-11 | MICĂ | la plafon, ce se întoarce; golul ușii în text | candidatul; „deschisă spre cer" |
| ECRAN-8, ECRAN-9 | MICĂ | „La picioare" în cheia cardului; „Frig" citită invers | „Unde stă" pe loc; „Căldură" / „Cald"; textele |
| ECRAN-10 | MICĂ | regulile alertelor 2 și 3 nescrise | scrise în §8 |
| ECRAN-11, ECRAN-12 | MICĂ | URL-ul; viewer-ul presupune tickul 0 | §0, §6 |
| ECRAN-13 | MICĂ | semnul din bara de sus | clasă + tooltip pe predicatul simulării |

Ce a ținut din v1, confirmat de sonde: nevoia ca formă (Q1, toate lentilele), determinismul eșantionului în `stepAgents` (8/8),
neutralitatea literalelor (6/6, cu proiecția), `createWorld(…, tickStart)`, „Înghețat nu pleacă singur" (cu podeaua reparată), cămara fără
regulă, ordinea nevoilor.
