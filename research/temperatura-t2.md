<!-- Designul temperaturii pe incaperi (S24-27 t.2), dupa panoul adversarial din 01.10.2026. Dovezile (scripturi, loguri) au stat in scratchpad-ul sesiunii; rezumatul lor e in DEVLOG, intrarea „Pauza — 01.10.2026". Caile `panou-*.md` / `raport-A*.md` citate aici nu sunt in repo. -->

# Temperatura pe încăperi — design v2 (S24-27, tăietura 2)

*01.10.2026. v1 + panoul adversarial (5 lentile, 34 de constatări, 13 verificate de câte un verificator
independent; `panou-NUM/IDX/JOC/SAV/UI.md`). Ce s-a schimbat față de v1 e marcat [v2: <id>].*

## 0. Tăierea [v2: L5-6]

v1 cerea, într-o singură felie, tot ce a avut t.1 plus stare persistentă, schemă nouă și hash — iar ecranul
apărea abia la al patrulea commit, după ce fiecare recalibrare ar fi mutat hash-urile. Se taie în două:

- **t.2a — geometria, clima și regimul permanent (NEUTRĂ LA HASH, fără schemă nouă).** Ceasul, clima de
  afară, solul, fețele încăperilor (cache pe bucată, ținut la zi cu D+), graful, **temperatura de echilibru**
  a fiecărei încăperi (regimul permanent al rețelei la rezervoarele de acum) și ce vede jucătorul: bara de
  sus, inspectorul („pe ce stă temperatura"), overlay-ul Temperatură. Nimic din simulare nu citește
  temperaturile: hash-urile `52b16ed2`, `3550c897`, `0e0666c5` rămân. Andrei verifică pe ecran deciziile de
  climă și de sol înainte să existe stare.
- **t.2b — dinamica și persistența.** T + rest PERSISTED pe componentă, pasul de 1 Hz, capacitatea,
  proveniența la schimbările indexului, căldura oamenilor, schema 8, migrarea, hash-ul, M5. Reparațiile
  panoului pentru partea asta sunt scrise la §9 (nu se pierd).

## 1. Ceasul (calendarul) — DERIVED din `w.tick`

Content `calendar`: `ziTicks` 40.320 (24 h × 1.680 de tickuri; o oră = 84 s la 1×), `zilePeAnotimp` 4,
`anotimpStart` toamna, `ziStart` 1, `oraStart` 08:00. Anul = 16 zile = 645.120 de tickuri (8 h 58 min la 1×,
2 h 59 min la 3×). Ziua nevoilor e deja 40.500 (somnul la 162 × `nevoiTicks`): nimic din nevoi nu se mișcă.

`src/sim/calendar.ts`, pur: `momentul(tick, rules)` → {an, anotimp, zi (1..zilePeAnotimp), ora, minut,
`fazaAn` (Q16 de tură), `fazaZi` (Q16)}. Formula pe tick stă DOAR aici (când anotimpurile vor avea lungimi
variabile, ceasul va avea stare — DESIGN §5.5).

**Ritmul, scris cinstit** [v2: L3-6]: ținta PLAN „prima iarnă în 45–90 min" se atinge la 3× continuu; la 1×
prima iarnă e între 2 h 03 și 4 h 18 min. Hrana de start (3,55 zile) se termină înainte de prima iarnă la
orice viteză.

## 2. Clima de afară [v2: L3-2]

`T_afara(t) = T_medie + A_an·cos(2π(fazaAn − φ_an)) + A_zi·cos(2π(fazaZi − φ_zi)) + V(w.seed, t) + P(t)`

Content `clima`, toate ÎNTREGI cu unitatea în nume [v2: L4-5]: `tMedieMc` 9400 (m°C), `amplitudineAnMc`
11.200, `amplitudineZiMc` 5000, `ziCeaMaiRece` = mijlocul iernii (ziua 2 din 4, 12:00), `oraCeaMaiCalda`
15:00.

- **V — valul de frig** (vreme normală, NU „iarna grea" a directorului de presiune): o dată pe iarnă, ziua
  `ziMin + hash2(an, SARE_VAL, w.seed) mod (ziMax − ziMin + 1)` (funcție pură de seed și tick, fără stare,
  fără fluxul `evenimente`); trapez pe întregi: rampă `rampaOre`, platou `platouOre`, rampă înapoi, în aceeași
  zi, de la 00:00. Content `clima.valFrig = { amplitudineMc: −10000, platouOre: 18, rampaOre: 3, ziMin: 1,
  ziMax: 2 }`; `amplitudineMc: 0` îl oprește. Cu el: o zi pe an de joc cu Tmax < 0 și o noapte ≤ −10 °C
  (normalele: 1,1 și 0,7); afară −16,2…−16,8 °C. **Fără el, nimic nu coboară sub −6,8 °C** (9,4 − 11,2 − 5),
  deci nicio încăpere fără foc nu trece de −8 °C (teoremă: echilibrul e o medie ponderată a rezervoarelor).
- **P(t)** = 0 în t.2 (semnătura e pentru directorul de presiune, DESIGN §5.5).
- **Uniformă pe lume**: `World` nu știe „situl jucat". Clima pe sit (macro, cu panta reparată — `macro.ts:89-90`
  face 65 °C/km, de 10× prea abrupt; nu o citește nimeni) intră în registru.
- **Cosinusul pe întregi**: tabel Q14 de 257 de valori pentru un sfert de undă, cu interpolare (eroare
  0,00004), generat în `parseRules` prin înmulțiri întregi sau ca literal — NU Bhaskara (0,00163, la limită).
  [v2: L1-07] faza în Q16 de tură peste tot.

## 3. Solul [v2: L3-1, L2-3, L1-07]

`T_sol(d, t) = T_medie + ΔT_adanc·(1 − e^(−d/D_a)) + A_an·e^(−d/D_s)·cos(2π(fazaAn − φ_an) − LAG[d])`

- `d = clamp(g_natural(x, y) − z, 0, 64)` — **clampat ÎN funcția `tSol`** (singurul loc). O celulă deasupra
  solului natural (un turn, o placă zidită) are T_sol(0). Pe M10: 123 de fețe cu d = −8..−1; donjonul cu 11 m
  plini: d = −11 — fără clamp, amplitudinea ieșea 10^7 °C, iar tabelul citit la indice negativ dădea NaN.
- Tabelele pe adâncime 0..64 (`e^(−d/D_a)`, `e^(−d/D_s)`, `LAG[d] = round(d·Q / (2π·D_s))` în ture Q16) se
  calculează în `parseRules` prin înmulțiri întregi cu rotunjire (eroare ≤ 0,008 °C).
- **Sub pământ e frig — regulă de JOC** (fizic, ~10 °C). Implicit **ΔT_adanc = −9 °C, D_a = 2 m**: T_sol
  mediu 7,4 °C la 0,5 m, 4,7 la 1,5 m, **3,7 la 2 m**, 2,4 la 3 m, ~0,4 adânc. `D_s` = 0,8 m (unda anului,
  cu anul comprimat). **Decizie pentru Andrei.** Cu regula de la §4.2 (solul e rezervor la prima lui celulă),
  măsurat de lentilă și de verificator independent: o pivniță 3×3×2 sub casă, cu 1 m de pământ deasupra, stă
  vara la 3,7/4,5/5,1 °C (min/medie/max), sub 5 °C 89% din vară; cu 3 m, 100%. Fără casă, cu 1 m de pământ:
  59% (cu inerția din t.2b: 95%).

## 4. Fețele

### 4.1 Ce e o față

Celulă de aer acoperit a componentei + un vecin pe una din cele 6 direcții care nu e aer acoperit. Fețele
interioare nu există. Fiecare față are o **clasă de direcție** explicită: SUS / JOS / LAT [v2: L5-1].

### 4.2 Mersul și felul [v2: L3-1, L2-3, L2-4, L1-05]

DESCHISĂ (laterală, vecinul e aer sub cer): ventilație, `G_deschisMwk` pe față [P: 200 W/K; calibrat în t.2b].

Altfel, mersul pe normală prin hotar, **pe convenția camerelor** (`camere.ts:207-214`: sub bază = hotar, peste
fereastră = aer, în afara lumii = hotar; NU `materialAt`, care spune AER sub bază), cel mult **K celule de
hotar** (K = 8, content), oprindu-se la prima celulă care nu e hotar. Felul, în ordinea asta:

| Felul | Condiția | Rezervorul / ținta | Conductanța pe față (1 m²) |
|---|---|---|---|
| MUCHIE | drumul ajunge, în ≤ K celule de hotar, la aerul acoperit al ALTEI componente | cameră–cameră | `1/(R_si(d) + ΣR(toate celulele) + R_si(opus d))` — simetric, fără R_se |
| SINE | aceeași componentă | — se ignoră | — |
| SOL | altfel, dacă drumul trece printr-o celulă de **sol natural** (ROCA, PAMANT, IARBA, SUB_BAZA, MARGINE) | `T_sol(d_ef)` al PRIMEI celule de sol `s` | `1/(R_si(d) + ΣR(celulele construite dinaintea lui s) + R(s)/2)` |
| EXT | altfel, drumul ajunge la aer de afară | `T_afara` | `1/(R_si(d) + ΣR + R_se)` |
| APA | altfel, drumul ajunge la apă (sau fața dă direct în apă) | `T_sol(d)` al celulei de apă | `1/(R_si(d) + ΣR)` |
| ADÂNC | altfel (K celule construite, fără aer, fără sol — un zid plin de peste K) | `T_sol(0)` | `1/(R_si(d) + ΣR(K celule))` |

- `d_ef(s) = min(clamp(g_natural − z_s, 0, 64), n_aer − 1)`, unde `n_aer` = câte celule mai sunt de la `s`
  până la aerul de afară pe același drum (∞ dacă nu ajunge în K): un perete natural subțire spre un versant
  păstrează o urmă de aer de afară [v2: verificatorul L3-1].
- MUCHIE e decisă ÎNAINTEA solului: două pivnițe la 6 m în rocă rămân legate (cele 1.776 de muchii ale M10).
- O muchie cameră–cameră se ia **o singură dată**, din fețele capătului cu ancora mai mică; oracolul asertă că
  suma din celălalt capăt e identică (R_si simetric o face exact egală) [v2: L1-05]. Adunarea fețelor din
  ambele capete e interzisă.
- `R_si`: 0,13 lateral, 0,10 în sus, 0,17 în jos; `R_se` 0,04 (miimi de m²K/W în content).

### 4.3 Materialele [v2: L3-5, L2-3, L1-06, L5-7]

Tabel `termic.material` indexat cu `MaterialId` (ca `digYield`); `parseRules` refuză lungimea greșită și un
material solid cu R ≤ 0. R în miimi de m²K/W pe celula de 1 m:

| ROCA | PAMANT | IARBA | PIATRA_CONSTRUITA | GRINDA | USA | MOLOZ | LEMN_CONSTRUIT |
|---|---|---|---|---|---|---|---|
| 340 | 850 | 850 | 590 | 590 (e de piatră) | 300 (regulă de joc: ușa e subțire) | 2000 | 500 (regulă: lemnul nu izolează mai bine decât pământul, DESIGN §5.1) |

SUB_BAZA și MARGINE se citesc ca ROCA (în design, nu ca valori ale enumerării). Test: „nicio celulă
construită nu izolează mai bine decât 1 m de pământ" (R ≤ R(PAMANT)). Gardă la încărcare: `6·g_max(MUCHIE) < 1`
(pasul explicit din t.2b e doar pe muchiile cameră–cameră; rezervoarele intră implicit) — `R = min(2·R_si_lat,
R_si_sus + R_si_jos) + R_min`, fără R_se; probă negativă: c_aer 459 refuzat, 460 trece [recenzia t.2a, L2-2].

### 4.4 Cache-ul de fețe pe bucată (DERIVED, TRANSIENT) [v2: L1-02, L2-1, L4-1, L2-4, L2-5, L2-6, L5-1]

- Pe fiecare bucată, rândurile agregate pe (clasa de direcție, felul, conductanța, adâncimea `d_ef` / celula
  de dincolo pentru MUCHIE, id-ul compoziției — multisetul materialelor de pe drum, internat într-un tabel
  DERIVED, 37 de valori pe M10 —, materialul primei celule). Măsurat: 35.406 de rânduri pe M10; agregarea pe o
  componentă 0,9–2,5 ms pe hub și pe mină.
- **D+ rulează pe ORICE lot cu editări, ÎNAINTE de ieșirea devreme** `murdare.size === 0` (camere.ts:734):
  pământ pe acoperiș, o podea pe sol deasupra unei pivnițe, al doilea strat de acoperiș, un zid îngroșat pe
  blocul vecin — toate schimbă fețele fără să refacă vreo felie (169 din 169 de loturi de suprafață care
  schimbă fețe ies devreme). Garda: `felii.size === 0` (scenariul standard) → D+ se sare.
- **D+** = bucățile feliilor refăcute + drumurile din fiecare celulă editată și din rulajul de aer de sub ea,
  pe 6 direcții, de **K+1 pași** (K celule de hotar și celula de aer de la capăt; cu K pași rămân 29–105 bucăți
  vechi), făcute DUPĂ refacerea feliilor; fiecare marchează bucata primei celule de aer acoperit atinse.
  - (a) din rulajul de sub e se pleacă doar dacă deasupra lui e, în coloană, NU există după lot un hotar
    needitat în acest lot (acoperirea rulajului n-a mișcat altfel);
  - (b) o felie refăcută cu ACEEAȘI mulțime de celule și nemarcată de D+ își păstrează rândurile, remapate.
  Măsurat cu (a)+(b): o hală de 30 m — 2 felii reagregate în loc de 30, 111 µs p50 în loc de 1,3 ms; 0 bucăți
  vechi pe oracolul strict. Restricția „naivă" (sari rulajul dacă vârful e deasupra lui e) e GREȘITĂ pe
  loturile cu două editări în aceeași coloană.
- `sincronizeazaCamere` întoarce `{ felii: number[] (cheile murdare, sortate), recalcul: boolean }` (contractul
  minim; t.2b îl extinde cu proveniența). La `recalcul`, cache-ul de fețe se reface integral (60–144 ms pe M10,
  o dată, la un lot > 65.536 de editări); D+ nu citește inelul suprascris.
- **`epocaFete`** (TRANSIENT, monotonă, lângă `epoca`, nu se salvează, nu intră în hash) crește ori de câte ori
  D+ marchează cel puțin o bucată. `epoca` își păstrează sensul (aerul acoperit s-a schimbat): overlay-ul I și
  testele care asertă „epoca rămâne" nu se ating.

## 5. Graful și regimul permanent (t.2a)

- **Graful** (noduri = componente, Σg pe binurile de rezervor ținute într-un TABLOU CANONIC — exterior, apă,
  sol pe adâncime 0..64 —, muchiile rezolvate la componentă: celula de dincolo → bucată → componentă) e
  TRANSIENT, ținut pe index (nu variabilă de modul: `epoca` e 1 în orice lume nouă — L4-1). Se reface când
  (`epoca`, `epocaFete`) diferă de cele de la construire; altfel se refolosește. Invariant: celula de dincolo a
  unei muchii e aer acoperit (altfel aruncă în teste; `Outcome` cu cauza la rulare — nu `bComp[−1]`).
  Refacerea completă din cache: p50 2,3 ms pe M10 (bandă 1,7–4,9); în t.2a se face la cerere (viewer-ul,
  cel mult o dată pe secundă). Graful incremental cu noduri stabile e pentru t.2b (§9).
- **Regimul permanent** (`regimPermanent(w, rules, tick)`): Gauss–Seidel pe întregi, în ordinea ancorelor,
  pornind din `T_afara(tick)`: `T_i ← round((Σ_r g_r·T_r + Σ_j g_ij·T_j) / (Σ_r g_r + Σ_j g_ij))`, până la o
  trecere fără schimbare (plafon 1.000 de treceri, determinist). Numitorul e > 0 pentru orice componentă
  (lemă: fața de sus a celei mai înalte celule nu e SINE) și orice grup conex are un rezervor, deci soluția e
  unică. Măsurat pe M10: 7–9 treceri, 0,2–1,8 ms. **Câtul Σ g_r·T_r / Σ g_r fără muchii nu se folosește
  nicăieri** (0/0 pe debaraua din mijlocul unei case cu trei niveluri) [v2: L1-03].
- Unități: T în Q16 °C; g în Q16 W/K, calculat pe întregi din R în miimi (`g = floor(2^16·1000 / R_total)`).
  Pe nodurile mari, Σg·|T| trece de 2^53 (hub-ul M10 2^53,3, mina 2^55,4): marginea se calculează pe nod la
  construirea grafului, iar un nod peste 2^52 se rezolvă pe BigInt [corectat la livrare].
- **Fără oamenii** în t.2a: regimul permanent ar sări când un om intră sau iese (fără inerție). Căldura
  oamenilor vine în t.2b, cu ocuparea reală măsurată (~+0,3 °C într-o casă, nu „+3–6 °C") [v2: L3-3].
- `canaleTermice(w, comp)` — funcție PURĂ în src/sim, DATE nu text: rânduri {clasă de direcție → destinație
  (aer de afară / sol / apă / încăperi vecine) [+ușă], pondereQ16 în ΣG, tDestQ16 (medie pe G), compoziția și
  grosimea dominante}. Încăperile vecine se CONTOPESC într-un rând pe direcție. Ordinea după pondere
  (geometrică, stabilă între editări; ordinea după flux s-ar schimba de 1–6 ori pe zi). Cel mult 3 rânduri +
  „rest X%" (acoperă p50 92%, min 79% pe M10). O față ADÂNC în sus se numește „peste K m de <material>", nu
  „sol adânc".

## 6. Ce vede jucătorul (t.2a)

- **Bara de sus** [v2: L5-4]: „Toamnă 2/4 · 14:20 · 8° ↘" (≤ 130 px) — măsurat pe bara reală: textul v1 nu
  încăpea (1.223–1.355 px la 1.100). Marca KINSTEAD iese din bară (rămâne pe ecranul de titlu). Tooltip:
  „Iarna în 3 zile (≈ 41 min la 3×) · timp de joc 1:23:45". Bifă ui-fum: `.ui-sus` cu scrollWidth ≤
  clientWidth la 1.100 px și 2 insigne (prinde și depășirea preexistentă).
- **Inspectorul** [v2: L5-1, L5-2]: „Încăpere · 53 m³ · **~4,5 °C** (afară 12 °C) — la echilibru" și
  descompunerea: „66% sol (pereți 42%, podea 24%, ~4 °C) · 31% aer de afară prin acoperiș (3 m rocă+pământ) și
  ușă". Nicio etichetă „pierde/câștigă" (semnul se schimbă cu ziua). Cum ajung valorile:
  - explicația („Încăpere / De ce nu") rămâne în memoria de azi (celula + amprenta pe jurnal + frâna),
    NESCHIMBATĂ, fără nimic termic;
  - canalele se citesc din cache-ul de fețe al simulării (agregate pe bucățile componentei), nu prin mersul
    fețelor în viewer (30–250 ms pe componentele mari);
  - temperatura și ponderile se scriu PE LOC (`text(el, …)`), înainte de `if (!fortat && cheie ===
    inspectorCheie) return`, nu prin `replaceChildren` (care pierde clicul: 0/10 măsurat).
- **Overlay-ul Temperatură** pe tastă proprie [v2: L5-3] (DESIGN §9.5; libere: L, U, W, Y — X și Z sunt ale
  zonelor, T e traversarea): tentă pe luminozitate pe încăperile de la nivelul activ, legenda cu intervalul;
  cifre ca etichete DOM ancorate (`Vector3.project`), **o etichetă pe fiecare piesă 4-conexă a încăperii la
  nivel** (≥ 4 celule), în celula piesei cea mai apropiată de centrul ei (0 ancore în altă încăpere prin
  construcție; centrul de greutate al componentei cădea în altă încăpere sau în rocă pe 49 de perechi pe M10
  și 41 din 72 pe mină); sub ~10 px/celulă cifrele se ascund. **Nicio hașură, niciun prag de 5 °C** în t.2
  (pragul vine cu efectul, în t.3; I folosește deja hașura) [v2: L5-5].

## 7. Porți (t.2a)

- Oracolul fețelor: cache-ul incremental == recalculul complet, după FIECARE lot, pe: fuzz-ul de cutii, un
  **fuzz de SUPRAFAȚĂ** (umpleri și săpături pe vârful coloanei peste o pivniță și o cameră zidită, de-a
  curmezișul unei granițe de bloc — cutiile nu ating ramura de ieșire devreme: 0–1 loturi din 300), casa
  ridicată de pioni PESTE o pivniță, „puț în blocul vecin la 3 celule de perete", „casă, pivniță sub ea,
  acoperiș spart" (probă negativă: K pași în loc de K+1 iese roșu).
- Oracolul grafului: graful folosit == graful din recalculul complet (index nou + toate fețele).
- Teste pe hârtie: T_sol la adâncimi ancorate (tabelul de la §3), d < 0 clampat (donjonul, 9 fețe; M10, 123),
  debaraua MUCHIE 24/24 finită, pivnița sub iarbă (25/25 fețe SUS cu IARBA), camera la baza ferestrei
  (SUB_BAZA), pivnița sub apă, valul de frig (minimul, ziua din seed).
- Calibrarea ca acceptanță (pe regimul permanent): pivnița 3×3×2 sub casă cu ≥ 1 m de pământ stă sub 5 °C
  ≥ 85% din vară; casa de piatră de la suprafață, iarna, sub −8 °C doar în valul de frig.
- Content: `deepStrictEqual(parseRules(rules.json), parseRules(DEFAULT_RULES))` pe TOT obiectul (azi testul
  compară doar `piese`; trei mutații în rules.json trec 128 de teste) [v2: L4-5].
- Scanerul de disciplină: `Math.(sin|cos|tan|…|exp|log|pow|…)` și `**` interzise DUR în src/sim, cu probă
  negativă [v2: L4-7].
- K05 pe contoare: D+ și reagregarea, la aceeași sarcină, nu cresc cu mărimea așezării.
- Hash-urile neschimbate (nimic din sim nu citește temperaturile).

## 8. Decizii pentru Andrei (implicitul în față)

1. Ziua de 40.320 de tickuri, 4 zile pe anotimp, anul de 16 zile, start toamna (ținta „prima iarnă în 45–90
   min" — la 3×).
2. Sub pământ e frig: −9 °C față de media aerului la adâncime (3,7 °C la 2 m), ca o pivniță sub casă să țină
   hrana sub 5 °C vara. Fizic ar fi ~10 °C.
3. O singură climă pe toată lumea (o vale din România) plus un val de frig pe iarnă (−16 °C o zi).
4. Ușa e „subțire" (izolează puțin), grinda e de piatră, lemnul nu izolează mai bine decât pământul.
5. În t.2a se arată unde AR ajunge temperatura (echilibrul); inerția și oamenii vin în t.2b.
6. Marca KINSTEAD iese din bara de sus, ca să încapă ora și temperatura.

## 9. t.2b — ce trebuie să conțină (reparațiile panoului, ca să nu se piardă)

- **Un singur punct de sincronizare** `sincronizeazaLumea(w, rules)`: sincronizează indexul ȘI aplică
  `SchimbareCamere` pe temperaturi, în același apel — tick, dig, fill, `buildM10PeLume`; invariant
  `w.temperatura.epoca === w.camere.epoca` verificat la fiecare pas; scaner: `sincronizeazaCamere(` /
  `reconstruiesteCamere(` interzise în src/ și viewer/ în afara camere.ts + temperatura.ts [L4-3].
- **Proveniența** a2 (A5), ponderată pe CAPACITATE, nu pe celule (+15,8% energie creată la o unire altfel)
  [L2-7]; `prov` duce adâncimea celulelor SOL/NECUNOSCUT; SOL → `tSol(d clampat)`.
- **Numericul**: ORICE flux intră în H = C'·T + rest în unități H; forma ψ a verificatorului L4-2 (rezervoarele
  ca flux cu factorul Euler implicit ψ = C'/(C'+Σg) în Q16, fără bandă moartă) sau forma delta; marginea pe
  SUMA X < 2^52, nodurile peste ea pe BigInt (nu refuz); restul normalizat după fiecare operație; când C' se
  schimbă cu aceleași celule, T rămâne, rest = 0; `decode` normalizează restul [L1-01, L4-2, L1-04].
- **Capacitatea**: `c_constr` ≈ 25 kJ/K pe fața construită; `c_sol` ≈ 300 kJ/K pe fața de sol natural cu
  d ≥ 1 m (stratul de suprafață fără masă) — o singură calibrare atinge casa 3–8 h ȘI pivnița 1–3 zile
  (măsurat: 3,6 h; 1,3–1,45 z) [verificatorul L3-1]; ținte în plus: etajul numai din piatră 3–8 h, casa cu golul
  ușii ≤ 1 h [L3-4].
- **Graful incremental** cu noduri STABILE (moștenite de sursa cu cele mai multe celule), delta aplicată o dată
  pe pas, construcția integrală din perechi pe tablouri tipate (~1 ms pe M10); poartă K05 pe contoare [L2-2].
- **Migrarea 7→8** în `decode` (nu în `MIGRATIONS`, care lucrează pe JSON fără teren): regimul permanent de la
  §5, rest 0 [L1-03, L4-4]. Harnașamentul trece prin `sincronizeazaLumea` (recalculul cu proveniență + regula
  NECUNOSCUT după solul natural) — fără inițializator separat.
- **Porți**: M5-fețe (pământ pe acoperiș, fără epocă nouă, salvare între pași, 2 × 2016 pași), M5 cu ușa
  deschisă și zidită la loc prin comenzi, M5 pe o scenă de mărimea minei; al doilea hash literal în CI pe o
  scenă cu încăperi și pioni; probe negative pe fiecare [L4-6, L4-1].
- Inspectorul: „6,2 °C · trage spre X", cu X = echilibrul LOCAL (vecinii la T-ul lor de acum + oamenii).

## 10. Implementarea t.2a, în commit-uri

1. **Ceasul și clima** — `calendar.ts`, `clima.ts` (T_afara cu valul, tSol cu clamp, tabelele, cosinusul Q14),
   content `calendar` / `clima` / `termic` + validarea + testul pe tot obiectul; scanerul (transcendentale);
   bara de sus. Hash-uri neschimbate.
2. **Fețele** — cache-ul pe bucată în camere (sau `termic-fete.ts` lângă el), D+ cu (a)(b), `epocaFete`,
   contractul `{felii, recalcul}`; oracolul fețelor; K05.
3. **Graful și regimul permanent** — `termic.ts`: graful, `regimPermanent`, `canaleTermice`; oracolul grafului;
   testele pe hârtie și calibrarea de acceptanță.
4. **Viewer** — inspectorul (canale + echilibru, scris pe loc), overlay-ul Temperatură (tentă + etichete DOM),
   bife ui-fum.
5. DEVLOG, OWNER_VERIFY 17, PLAN, CLAUDE.md.
## 11. La livrare (08.10.2026): ce s-a schimbat față de v2

După implementare (două valuri) și recenzia codului (4 lentile + verificatori, 19 constatări, 2 MARE):

- **Fețele DESCHISE** (ventilația prin goluri) au invariantul lor: Σ fețelor DESCHISA din cache == `deschise` din
  index, în agregare și în graf. În canale, golul e **grupul lui**, numit „gol deschis" — nu se contopește cu
  zidurile (o casă cu golul ușii arăta „pereți 93%", deși 87% era golul).
- **Regimul se refuză la plafon** (`CAPACITATE_DEPASITA`), nu întoarce cifre neconvergente; convergența e probată
  pe un hotel de 400 de camere interioare (zeci de treceri).
- **Memoriile**: contribuția fiecărei bucăți se memorează pe identitatea rândurilor ei, valabilă pe (epoca,
  reguli) — o editare care schimbă doar fețele reface graful M10 în ~1,3 ms în loc de ~8; un singur regim pe
  (graf, seed, tick), împărțit de inspector și overlay. **Fără pornire caldă** a lui Gauss–Seidel: punctul fix
  pe întregi nu e unic (±1–5 Q16), iar regimul trebuie să rămână funcție a stării (migrarea din t.2b).
- **Inspectorul** recalculează temperatura cel mult o dată pe secundă (aceeași celulă / componentă); la o
  unire reală, ≤ 1 s se arată valoarea veche.
- **Overlay-ul U**: scara tentei cuprinde și aerul de afară (altfel 53 din 53 de niveluri M10 ieșeau gri);
  necunoscutul nu se desenează; cifrele legendei se scriu pe loc (clicurile nu se mai pierd).
- **Bara de sus**: o singură compunere pură (`baraDeSus`), comparată exact pe ecran; insignele se pliază în
  „N alerte" (peste 1 sub 1.280 px, peste 3 de la 1.280).
- **Scanerul de disciplină** citește AST-ul TypeScript: comentariile din trivia, `Math` doar pe o listă albă (fără
  `random`), `**` și `**=` din AST. Clasele nedeterministe mai vechi pe care nu le prinde (`Date()`, crypto,
  `for…in`, `Intl`) rămân o decizie separată.
- **Convenții fixate la implementare**: ziua cea mai rece = ziua anului (14, adică ziua 3 a iernii la 00:00);
  adâncimea solului se evaluează la centrul celulei (d + 0,5 m); MUCHIE și SINE se decid la citire (o unire
  departe nu atinge fețele); ADÂNC ia T_sol(d) al capătului (0 pentru tot ce e zidit deasupra solului);
  rândurile MUCHIE sunt pe celula de dincolo (88.577 pe M10).
