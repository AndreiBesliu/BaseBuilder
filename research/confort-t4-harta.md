<!-- Harta t.4 (confortul −8..34 °C) pe HEAD 6611cc2, 17.10.2026, scrisă inline (fără agenți). Măsurătorile se reproduc din research/masuratori-t4/ (node <script>, din dosarul lui). -->

# Confortul −8..34 °C — harta pe HEAD (S24-27, tăietura 4)

*17.10.2026, pe `6611cc2`. Ce există azi în cod și în lume pentru „efectul temperaturii asupra oamenilor", cu locul exact și cu
cifrele măsurate. Designul care stă pe hartă: [confort-t4.md](confort-t4.md). Etichetele [Hn] / [Mn] sunt citate de acolo.*

## Rezumat — cinci lucruri care decid designul

1. **Banda vine din Going Medieval și e despre ALEGEREA LOCULUI**: „settlers will not choose idle/eating/sleeping locations outside
   the comfortable temperature (−8 to 34 °C)" (`research/_propuneri.md`:619, citat de PLAN S24-27). Nu e o bară și nu e un prag de
   rănire; DIGEST (:561) cere temperatura „ca stare, nu ca bară".
2. **Clima de azi atinge DOAR marginea de jos, și doar în ziua valului de frig** [M1]: afară, pe un an, 15,7–16,3 h sub −8 °C, toate
   în ziua valului (min −16,2…−16,8 °C); 0 h peste 34 °C (max 25,5 °C). Fără val, nimic nu coboară sub −6,8 °C (clima.ts:218).
3. **Aproape orice adăpost ține banda** [M3]: o casă de piatră 5×5×2 cu o pivniță dedesubt (legată prin chepeng) nu coboară sub
   −3,95 °C în val; pivnița stă la 2,6–3,9 °C toată iarna. Aceeași casă, singură pe pământ, stă la limită: 5×5×2 la −8,19 °C (2,5 h
   sub −8), 3×3×2 la −9,32 °C (6,6 h). Diferența o face pivnița (o încăpere de +3 °C legată de casă; τ-ul casei urcă de la 3,6 la 9,1 h).
4. **Oamenii încălzesc adăpostul, și nu imperceptibil** [M4]: ΔT la echilibru = P/ΣG — 12 oameni într-o casă 3×3×2 dau +19,8 °C
   (τ 3,56 h, deci ~+5 °C după o oră), într-o casă 5×5×2 +9,2 °C, în pivnița 3×3×2 +15,6 °C (τ 34 h). Decizia 7 din OWNER_VERIFY 17
   („imperceptibil") era pentru 4 oameni care dorm, mediați în timp, într-o casă 7×7.
5. **Jocul nou implicit nu ajunge la iarnă** [M2]: hrana (230/om) se termină la ~3,0 zile, cei 12 pleacă de foame la 3,25–4,0 zile;
   iarna începe la 3,667 zile, valul la 4,667 sau 5,667 zile. Cu `&hrana=20000`, toți 12 trăiesc valul, 100% sub cer, 16 h sub −8 °C
   (192 de ore-om). Fără producție de hrană, efectul t.4 se vede doar cu hrană adăugată sau cu o pornire mai târzie — ca și cămara
   din t.3, o lecție pe care jocul implicit nu o poate trăi încă.

## H1. Nevoile și dispoziția de azi

**Starea** (toată PERSISTED, `src/sim/state.ts`):

| Câmp | Loc | Note |
|---|---|---|
| `Nevoie` = {FOAME 0, ODIHNA 1}, `NEVOI = 2` | state.ts:119–124 | lista de STRUCTURĂ; „o nevoie nouă e un rând de tabel" |
| `nevoi[slot·NEVOI + n]` | state.ts:411 | 0..`nevoieMax` (1000), MARE = bine; se UMPLE la creare (zero nu e neutru) |
| `nevoieReincercaLaTick[slot·NEVOI + n]` | state.ts:431 | răcirea pe perechea (pion, nevoie) când nevoia nu se poate rezolva acum |
| `dispozitie[slot]` | state.ts:445 | bara (PERSISTED); ținta e DERIVED |
| `gandFel` / `gandPanaLa` (4 sloturi) | state.ts:455–457 | doar gândurile de EVENIMENT; evicția termenului minim |
| `FelJob` = {SAPA 1, CARA 2, MANANCA 3, DOARME 4, CONSTRUIESTE 5} | state.ts:102 | `PasNevoie` = {MERGE 0, CONSUMA 1} (:130) |
| `Gand` = 6 feluri, `GANDURI = 7`; `GAND_PENTRU_NEVOIE` | state.ts:148–171 | de STARE (din praguri, nestocate) vs de EVENIMENT (stocate, cu termen) |

**Ceasurile** (`src/sim/agents.ts`:323–334, doar `Faction.ASEZARE`):
- scurgerea la `(tick + id) % nevoiTicks === 0` (250) — `scurgeNevoile` (joburi.ts:3873): fiecare nevoie scade cu `scurgere`, CU
  O EXCEPȚIE scrisă în buclă: ODIHNA crește cu `odihnaPeTicDeNevoie` (60) cât pionul doarme (nu în pasul de mers);
- verificarea pragurilor la FIECARE tick — `verificaNevoi` (joburi.ts:3921), în ordinea indexului nevoii: sub `prag` PREFERĂ (doar
  un pion fără job pornește nevoia), sub `pragCritic` ÎNTRERUPE jobul — doar cu mâna goală (`poateFiIntrerupt`, :3902); ținta se
  caută ÎNAINTE de întrerupere; fără țintă, răcirea pe pereche (`nevoieRetryTicks` 500) și `w.ratiune.nevoiNerezolvate++`. Somnul
  reușește mereu (fără pat, „pe loc"). **Bucla iese la prima nevoie care e deja jobul curent** (:3931): cât un pion mănâncă cu
  FOAME sub prag, nicio nevoie de după FOAME nu-l mai poate întrerupe;
- dispoziția la `(tick + id) % dispozitieTicks === 0` (500) — `miscaDispozitia` (:4007): bara urmărește ținta cu +120 / −80 pe
  pas, limitat la distanță; **nu se mișcă în somn**; ținta (`tintaDispozitiei`, :3976) = 500 + gândurile de stare (pragul și
  criticul se EXCLUD) + gândurile de eveniment, tăiată la [0, 1000];
- treptele (`rules.json`:79–97): sub 250 refuză munca (`refuzaMunca`, :4038; scris în `ratiune` înaintea porții), sub 150 avertisment
  (doar ecran), sub 60 PLEACĂ (`verificaPlecarea`, :4049; `plecatiTotal` PERSISTED); productivitatea liniară 0,5×…1,5× pe bară
  (`multiplicatorDeMunca`, :4019; podeaua pe rezultat, :4032).

**Conținutul** (`content/rules.json`:54–97): FOAME și ODIHNA {scurgere 6 / 4, prag 400, critic 150}; gândurile FLAMAND −50, INFOMETAT −450,
OBOSIT −80, EPUIZAT −200 (de stare, `durata` 0), DORMIT_PE_JOS −70 / 6000 tickuri, OPTIMISM_INITIAL +250 / 20.000 (de eveniment).

**Invarianții de parsare** (`src/sim/content.ts`):
- `parseNevoi` (:806) refuză o nevoie cu `scurgere < 1` („o nevoie care nu scade niciodată e un sistem mort", :849), `pragCritic ≥ prag`,
  `prag > nevoieMax`, chei necunoscute; cere un rând pentru fiecare nume din `NUME_NEVOI`;
- ordinea treptelor (:1501) și **catalogul care poate atinge pragul de plecare** (:1533–1560): minimul REAL = baza + cel mai negativ din
  fiecare pereche de stare + toate negativele de eveniment ≤ `dispozitiePragPlecare`; un gând de stare cu `durata ≠ 0` și unul de
  eveniment cu `durata = 0` sunt refuzate.

**Joburile de nevoie** (tabelul de drivere, joburi.ts:4096): `FEL_PENTRU_NEVOIE = [MANANCA, DOARME]` (:3581) leagă nevoia de driver.
`DRIVER_DOARME` (:4255): fără rezervare pe loc (`jobDest = 0`), patul pe stratul LUCRU; `tinteVii` acceptă „pe loc"; `refaTinta` caută
alt pat. Locul jobului e tuplul PERSISTAT `jobWorkX/Y/Z`. `pornesteDoarme` (:3727): „pe loc" nu înseamnă pe un șantier viu — atunci pe
primul vecin calcabil din componentă (`celulaDeLucru`). Căutările de nevoie: `cautaMancare` (:3607; rază 96, apoi 384), `cautaPat`
(:3655; rază 96, plafon 64 de intrări PARCURSE, aceeași componentă de mers prin `regionAt` + `find`, `poateRezervaToate`), ambele pe
indexul de zone DERIVED (`indexZone`, liste `comestibile` / `paturiLibere`), cu pașii numărați (`raport.pasiNevoi`, `candidatiTaiati`).

**Hoinăreala** (agents.ts:119 `alegeTinta`, :370): fără job și fără țintă, o țintă aleatoare în raza `agentGoalRadiusCells`, două trageri
din `rng.agents` pe încercare, doar în blocuri LEGATE (altfel acoperirea crește cu plimbarea — K05). Nimic nu citește temperatura.

**Salvarea și hash-ul** (`src/sim/save.ts`, `src/sim/hash.ts`):
- schema 9 (state.ts:52); nevoile se scriu cu `nevoiFeluri: NEVOI` (save.ts:203), iar **decode LĂRGEȘTE tabloul** (:534–553): o nevoie
  care lipsește din save se umple cu `nevoiaInitiala(id, n, …)` (state.ts:473) = `nevoieMax − |id·137 + n·311| mod 600` — DEFAZATĂ,
  ca valul de foame să se spargă. Mecanismul pentru „o nevoie nouă" există deja; defazarea nu e potrivită pentru o nevoie care nu scade
  singură (ar porni oamenii la 401…1000);
- la naștere (`spawnAgent`, commands.ts:160) aceeași `nevoiaInitiala` pentru fiecare nevoie, plus OPTIMISM_INITIAL (:172);
- hash-ul cuprinde `nevoi` și `nevoieReincercaLaTick` pe `count·NEVOI` (hash.ts:140–145): NEVOI 2 → 3 mută toate literalele (o dată, la
  format). Literalele azi: `c4a6c1dc` (standard, ci.yml + tools/check-hash.mjs), `84be6e5e`, `f83bc5fb`, `82d32e8f`, `9b8cdbd4`, `505346b7`.

## H2. Ce poate citi t.4 din temperatură

- **`temperaturaCelulei(w, x, y, z, tA)`** (`src/sim/temperatura.ts`:1448), PURĂ: componenta celulei → T din stare (Q16 °C); în tocul
  unei uși → T-ul părții mai calde (`tTocului`, :1427); sub cer → `tA` (T_afara, dat de apelant). `null` doar pe o componentă fără T
  sau cu ștampila nevalidă (invariant încălcat). Clasificarea locului e `loculCelulei` (:1406: id de componentă / `LOC_CER` / `LOC_TOC`).
- **Celula pionului** e regula pasului termic și a lui `oameniPeComponente` (:1382): `cellOf(x)`, `cellOf(y)`, `z` — celula picioarelor.
  Același triplet dă și căldura oamenilor (100 W pe om, `termic.omW`), deci un om care caută căldura o și aduce.
- **Ștampila în timpul lui `stepAgents`**: `verificaStampila` (:514) compară (idx, vazute, epoca, epocaFete) ale INDEXULUI, care se
  schimbă doar la `sincronizeazaLumea`. În `stepAgents` (înaintea sincronizării, world.ts:88) ștampila e validă, iar indexul și T-urile
  sunt cele de la capătul tickului trecut; o săpătură făcută mai devreme în același tick nu e încă în index (o celulă tocmai săpată
  citește „sub cer" un tick). Un save se face între tickuri, cu indexul la zi, deci lumea încărcată citește aceleași valori.
- **Costul unei citiri**: `bucataLa` (un `Map.get` pe felie + un index de tablou) + `comp.get` + `verificaStampila` (patru comparații)
  — O(1). `tAfara(seed, tick, rules)` (clima.ts:221) e pură, din tabele de cosinus pe întregi.
- **Componentele** (`src/sim/camere.ts`:271): {id, ancora, volum, deschise, bucati}; `deschise > 0` = spațiu acoperit cu o față laterală
  spre cer (are și el T, ventilat spre afară). Nu există bbox pe componentă și nici o listă de celule calcabile: `celuleComponentei`
  (:977) e O(volum + 256·bucăți), `listaComponente` (:972) sortează pe ancoră (ordinea canonică, independentă de istoria indexului).
  Ordinea de inserție a `idx.comp` DIFERĂ între lumea continuă și cea încărcată (indexul se reface la încărcare): orice parcurgere care
  se taie la un plafon trebuie să meargă în ordinea canonică, altfel lumea încărcată alege altceva. **[Corectat de panou, 17.10 —
  STARE-1, COST-1: sursa reală e alta. `listaComponente` anulează deja ordinea Map-ului; necanonică e ordinea bucăților DIN componentă —
  `Componenta.bucati` e sortat pe slotul bucății (camere.ts:588, :675), iar sloturile vin LIFO din istoria indexului (camere.ts:403–405).
  Măsurat: pe o sală săpată de sus în jos, ordinea diferă după encode/decode pe 90 din 92 de poziții. Designul v2 parcurge pe felii.]**
- **Valul de frig e prognozabil**: `ziuaValului(seed, an, rules)` (clima.ts:188) și `valDeFrig` (:198) sunt pure de (seed, tick) —
  ecranul poate anunța valul oricât de devreme.

## H3. Tickul și ordinea

`tick` (world.ts:82): `stepAgents` → `sincronizeazaLumea` → `pasTermic` (1 Hz, `w.tick % 20 === 0`) → `pasAlterare` (aceeași fază, linia
ei) → `w.tick++`. Nevoile și dispoziția rulează în `stepAgents`, decalat pe id. CLAUDE.md fixează ordinea ca regulă de nucleu; un pas
nou se scrie acolo.

## H4. Cine alege un loc, și unde ar intra banda

| Alegere | Azi | Ce ar însemna regula GM |
|---|---|---|
| patul (`cautaPat`, joburi.ts:3655) | cel mai apropiat pat liber accesibil | sare paturile din afara benzii |
| somnul pe loc (`pornesteDoarme`, :3727) | unde stă (sau vecinul, dacă e pe un șantier) | nu doarme în afara benzii dacă are un loc în bandă |
| mâncatul (`cautaMancare`, :3607) | pe morman; 60 de tickuri pe porție | nu se aplică: locul e al mormanului, iar o masă durează ~2 min de joc |
| hoinăreala (`alegeTinta`, agents.ts:119) | țintă aleatoare | nu hoinărește spre un loc din afara benzii |
| munca | unde e munca | nu se aplică (GM nu o aplică nici el) |

Nu există azi nicio căutare de „cel mai apropiat loc acoperit": paturile sunt pe indexul de zone, mâncarea pe mormane, iar indexul de
încăperi nu ține celule calcabile.

## H5. Ecranul de azi pentru oameni

- `RandOm` (`viewer/ui/model.ts`:618) are câmpuri NUMITE `foame` / `odihna` / dispoziția, nu o listă de nevoi; cardul pionului desenează
  barele pe nume (`viewer/ui/panouri.ts`:778, :794), tabelul Oameni are coloanele Foa. / Odi. / Disp. (:924).
- Gândurile: `inspecteazaPion` (model.ts:716) recalculează gândurile de stare din nevoi prin `GAND_PENTRU_NEVOIE` (generic) și adaugă
  pe cele de eveniment; numele în `NUME_GAND` (`viewer/ui/texte.ts`:221). Activitatea: `textActivitate` (texte.ts:386), un `switch`
  pe `FelJob` cu `default` „Face ceva".
- Temperatura: bara de sus (anotimp, oră, T afară), inspectorul încăperii (3 rânduri), overlay-ul U. Nicio temperatură „la picioarele
  pionului", nicio alertă de vreme.
- Jocul nou: `parametriJocNou` (`viewer/ui/pornire.ts`:67) — `oameni` 12, `piatra` 1000, `hrana` = `HRANA_PE_OM` (230, :65) × oameni,
  toate din URL (`hrana` până la 100.000). Ora de pornire e a content-ului (toamna z1 08:00); nu există un parametru de start.

## H6. Porțile, mutațiile, costul

- `npm run check` ~2,5 min (1.178 de teste); mutațiile complete 1.334 de probe ~35 min DOAR într-o clonă; suita `nevoi`
  (`tools/mutatii/nevoi.mjs`) are tipare pe `scurgeNevoile` / `verificaNevoi` (`nevoi.mjs`:66–70 au fost rupte o dată la t.3) — orice
  editare a buclelor de nevoi le poate învechi (`TIPAR LIPSA` = eșec).
- Testele care ating nevoile: `tests/nevoi.test.ts`, `tests/dispozitie.test.ts`, `tests/drivere.test.ts` (save/load la mijlocul unui job
  de nevoie), `tests/saveload.test.ts`, `tests/migrare.test.ts`, `tests/content.test.ts`; ecranul: `tests/viewer-ui*.test.ts`.
- **Costul simulării**: jocul nou cu 12 oameni, 7 zile (282.240 de tickuri) în 4,5–8,1 s pe mașina asta, sub ~29 µs/tick [M2]. Scenariul
  standard: 79–92 µs/tick (40 de pioni).
- **Neutralitatea pe scenariile existente** (predicție din M1): toate literalele rulează toamna, iar toamna afară nu coboară sub −2,0 °C
  — un efect legat de banda −8..34 nu le poate atinge; ele se mută doar la schimbarea de format.

## H7. Ce leagă t.4 de felii vecine

- **Hrana (t.3)**: cămara stă de obicei în pivniță, cel mai cald loc al iernii (2,6–3,9 °C). Oamenii care s-ar strânge acolo o încălzesc
  (+15,6 °C la echilibru cu 12; τ 34 h, deci +2,7 °C în 6 h) — o pivniță de 3 °C ar trece de pragul de 5 °C al alterării.
- **Vatra** (registrul S24-27): singura cale spre >34 °C și spre o iarnă confortabilă; fără ea, marginea de sus a benzii nu are în joc
  nicio cale naturală.
- **Producția de hrană** (S28-31): fără ea colonia jocului nou nu trăiește prima iarnă [M2].
- **Somnul nesincronizat cu noaptea** (registrul t.2b): oamenii dorm pe ture, nu noaptea; valul începe la 00:00 și ține 24 h.

## Măsurătorile

Toate din `research/masuratori-t4/` (`node <script>`, din dosarul lui), pe `6611cc2`, content-ul implicit.

**[M1] Clima pe un an** (`m1-clima.ts`, șase semințe, pas de 1 minut de joc): min −16,15…−16,79 °C, max 25,48 °C, **0 h peste 34 °C**.
Ore pe an sub prag (seed 12345; celelalte diferă doar în ziua valului): < −12: 7,1 · < −10: 10,6 · **< −8: 15,7** (seed 7: 16,3) ·
< −6: 25,1 · < −4: 38,6 · < −2: 57,4 · < 0: 73,8 · < 5: 139,6 · < 10: 199,6 · < 16: 281,5 · < 18: 310,0 (din 384). Pe anotimp
(min / medie / max): iarna −16,8 / −2,9 / 5,4; primăvara −3,1 / 9,4 / 21,1; toamna −2,0 / 9,4 / 20,2; vara 12,7 / 19,5 / 25,5.
Iarna începe la 3,667 zile de la pornire; valul în ziua 2 sau 3 a iernii (4,667 / 5,667 zile; seed 12345 și 20260913: ziua 3, seed 7:
ziua 2). Ziua valului, la 2 h: 0h −5,3 · 2h −13,3 · 4h −16,6 · 6h −15,3 · 8h −13,0 · 10h −10,4 · 12h −8,0 · 14h −6,7 · 16h −6,6 ·
18h −7,8 · 20h −9,9 · 22h −9,0 — două ferestre sub −8 (≈ 01–12 h și ≈ 18–24 h), cu o pauză după-amiaza.

**[M2] Jocul nou** (`m2-jocnou.ts <seed> <oameni> <hrana> <zile>`, replica jocului nou al viewer-ului în node: aceleași comenzi, același
loc): cu 12 oameni și 2.760 de hrană, hrana se termină între 2,75 și 3,0 zile, plecații: 0–1 / 8–9 / 10–11 / 12 la 3,25 / 3,5 / 3,75 /
4,0 zile (seed 20260913 și 7) — **nimeni nu ajunge la a doua zi a iernii**, deci nici la val. Cu 20.000 de hrană: toți 12 trăiesc
valul, 100% din timp sub cer (nimeni nu zidește nimic fără jucător), 192 de ore-om sub −8 °C, dispoziția medie 478–494 (nimic nu citește
frigul).

**[M3] Casele și pivnița în iarnă** (`m3-casa-pivnita.ts`, pasul real pe întregi, de la echilibru cu două zile de rodaj, seed 12345):

| Loc | iarna anului 0 (valul în ziua 3) | iarna anului 3 (ziua 2) |
|---|---|---|
| casa 7×7 (5×5×2) pe pământ, cu pivniță dedesubt | min −3,95 °C, 0 h sub −8, 36 h sub 0 | min −3,44 °C, 0 h sub −8 |
| pivnița 3×3×2 sub 1 m, sub aceeași casă | 2,61…3,94 °C | 2,74…3,94 °C |
| casa 5×5×2 singură (`casaTermica`) | min −8,19 °C, **2,5 h sub −8** | (t.2b: −7,31) |
| casa 3×3×2 singură | min −9,32 °C, **6,6 h sub −8** | (t.2b: −8,52) |
| afară | −16,79 °C, 15,7 h sub −8 | −16,15 °C, 16,3 h sub −8 |

Vara: casa cu pivniță 11,0…16,3 °C, pivnița 3,5…4,7 °C, afară 12,7…25,5 °C. Nicio încăpere fără foc nu trece de 34 °C (echilibrul e o
medie ponderată a rezervoarelor, iar cel mai cald rezervor e aerul de 25,5 °C).

**[M4] Căldura oamenilor într-un adăpost** (`m4-oameni.ts`, ΣG din linia grafului simulării, C din contoare):

| Încăpere | ΣG (W/K) | τ (h) | ΔT la echilibru cu 4 / 12 oameni |
|---|---|---|---|
| casa 5×5×2 singură | 130,5 | 3,58 | +3,1 / +9,2 °C |
| casa 3×3×2 singură | 60,7 | 3,56 | +6,6 / +19,8 °C |
| casa 5×5×2 peste pivniță | 156,2 | 9,09 | +2,6 / +7,7 °C |
| pivnița 3×3×2 sub 1 m | 76,8 | 34,4 | +5,2 / +15,6 °C |

ΔT(t) = ΔT_eq·(1 − e^(−t/τ)): 12 oameni într-o casă 3×3×2 o duc de la −9,3 la ~−4,4 °C în prima oră.
