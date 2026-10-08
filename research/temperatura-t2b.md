<!-- Designul t.2b al temperaturii (inertia, starea salvata, oamenii), dupa harta pe HEAD si panoul adversarial din 08.10.2026. Dovezile (scripturi, loguri) au stat in scratchpad-ul sesiunii; rezumatul lor intra in DEVLOG. Caile raport-B*.md / panou-*.md / panou/verif-*.md citate aici nu sunt in repo. -->

# Temperatura pe încăperi — t.2b, design v2 (S24-27, tăietura 2b)

*08.10.2026. v1 + panoul adversarial (5 lentile, 46 de constatări, 14 verificate independent; 5,97 M). Harta pe HEAD:
[B1]…[B6] (`raport-B*.md`); panoul: [NUM-n], [IDX-n], [SAV-n], [JOC-n], [UI-n] (`panou-*.md`, `panou/verif-*.md`).
Ce s-a schimbat față de v1 e marcat [v2: …].*

## 0. Ce face felia

Temperatura devine **stare**: fiecare componentă a indexului t.1 (încăperi și spații deschise) are `T` (Q16 °C) și
`rest`, salvate (schema 8), integrate la 1 Hz cu capacitatea aerului, a pereților și a solului, cu căldura oamenilor, cu
proveniența la orice schimbare a indexului, printr-un singur punct de sincronizare. Simularea încă nu CITEȘTE
temperatura (niciun efect — t.3), dar temperatura intră în salvare și în hash.

**Nu intră** (§12): efectele, vatra, clima pe sit, ușa la trecere, gheața, T pe bucată.

## 1. Starea

| Câmp | Clasă | Note |
|---|---|---|
| `w.temperatura.t[slot]`, `rest[slot]` | PERSISTED | Float64Array (întregi exacți); pe disc și în hash pe ANCORĂ |
| `w.temperatura.are[slot]` | TRANSIENT | invariant în AMBELE direcții: sloturi cu T == `comp.size`, fiecare componentă vie are T [IDX-6] |
| ștampila `(idx, vazute, epoca, epocaFete)` | TRANSIENT | `idx` = identitatea obiectului index (un index înlocuit repornește contoarele de la 0/1 — clasa L4-1) [IDX-6] |
| graful, C' pe nod, contoarele de capacitate | DERIVED/TRANSIENT | refăcute integral la decode |
| căldura oamenilor | DERIVED | eșantionată la pas, fără acumulator [B4] |

- Cheia pe disc și în hash e **ancora** (ușa scoasă și zidită prin comenzi inversează id-urile pe 3/3 semințe; cheia pe
  slot iese roșie 20/20) [B1][SAV]. Faza pasului e globală, `w.tick % tps === 0` (faza de la încărcare: 19/20 roșu) [B1].
- **Unitatea de masă** μ = `c_aer / 16` (75,6 J/K la implicite): masele pe clasă sunt întregi derivați la parsare
  (`round(c / μ)`, abatere < 0,01%), iar C' = Σ mase, EXACT, fără rotunjirea totalului [v2: C3 cere evidență exactă a
  maselor]. C' ≤ 2^28,6 pe mină → `rest` < 2^32 [SAV-4]. Marginile pasului (§5.3) se re-măsoară în μ.

## 2. Punctul unic de sincronizare

`sincronizeazaLumea(w, rules)` (src/sim/temperatura.ts): indexul (`sincronizeazaCamere` cu proveniență) → delta grafului
(§6) → proveniența temperaturii (§3) → ștampila. Locurile [B2]: `world.ts:85` cu ordinea
`stepAgents → sincronizeazaLumea → pasTermic (w.tick % tps === 0) → w.tick++` [B4]; `commands.ts:239`, `:277`;
`buildM10PeLume(w, rules, …)` (semnătura primește `rules`) și `viewer/main.ts:261`; decode (§7).

- **Invariantul** pe ștampila completă `(idx, vazute, epoca, epocaFete)` la intrarea în `sincronizeazaLumea`, la
  `pasTermic` și în `encode` → `INVARIANT_INCALCAT`. Perechea (epoca, epocaFete) se justifică prin GRAF (pământul pe
  acoperiș schimbă ΣG cu epoca pe loc), nu prin C' [IDX-2][SAV-1].
- **Plasa pe sursă** (test AST, după NUME, nu doar pe importuri) [IDX-5]: orice `Identifier` / `StringLiteral` numit
  `sincronizeazaCamere`, `reconstruiesteCamere`, `construiesteCamere`, `reconstruiesteFete`, `actualizeazaFete`,
  `indexCamere`, `incarcaTemperaturi`, `temperaturaLaEchilibru` în `src/`, `viewer/`, `bench/`, `tools/` (minus
  `tools/mutatii`) e refuzat în afara modulelor permise (camere.ts, fete.ts, temperatura.ts; `indexCamere` în world.ts;
  `incarcaTemperaturi` în save.ts; `temperaturaLaEchilibru` în save.ts și fixture-m10.ts); în modulele permise, numele
  apar doar ca definiție sau apel. Proba negativă e un fișier FĂRĂ prefixul `__` (umblarea IDX-5 sare `__*`).
- Testele care bat tickul, salvează sau citesc T trec pe `sincronizeazaLumea` (143 de apeluri directe în 10 fișiere
  [B2]); cele de index pur rămân pe `sincronizeazaCamere`.

## 3. Proveniența — regula C3 [v2: NUM-3, JOC-1, JOC-2, JOC-4, JOC-8, IDX-3, IDX-9, NUM-6]

**De ce nu v1.** Regula A (masa nouă la T-ul încăperii) face o pivniță săpată din casă să pornească de la T-ul casei:
vara 12,6–15,8 °C, sub 5 °C abia după 3,6–4,6 zile (anotimpul are 4), 0/63 de ore de vară sub 5 °C; o groapă acoperită
pornește de la T_afara (−6,1…+25,4 °C); o pivniță creează 185–327 MJ [NUM-3][JOC-1]. Regula B (masa nouă la T_sol,
ieșirea la T-ul încăperii) e o **pompă**: săpat + astupat repetat trage casa cu −10 °C vara / +8 °C iarna față de martor
(−1,5 kW) [JOC-2]. „C-ul" lentilei JOC (cu ponderile v1) pompează încă 42–166 W pe PODEA [verif-JOC-2].

**C3** (măsurată de verificatorul JOC-2; singura care trece și poarta pompei, și acceptanța pivniței):
- **Masa de sol natural și de apă intră ȘI iese la `T_sol(d, tick)`**, cu `d` al FIECĂREI fețe (nu al editării);
- orice altă masă care **dispare** (aerul unei celule zidite, o față construită care dispare) iese la T-ul sursei ei —
  nu schimbă T-ul celor rămase;
- orice altă masă care **apare** (construcția nouă, aerul unei celule alipite unei încăperi) ia T-ul REZULTAT și nu
  intră în ponderi;
- **ponderea unei surse = masa ei care PERSISTĂ** (în ambele geometrii, cu aceeași clasă), nu „capacitatea celulelor ei
  în geometria nouă".

Formal, pe un lot: pentru fiecare componentă veche s, `Ĥ_s = H_s − Σ_{sol care iese din s} m·T_sol(d) − (alte mase care
ies)·T_s` rămâne pe masa ei persistentă `P_s`; pentru fiecare componentă nouă Y, `H_Y = Σ_s (P_{s→Y}/P_s)·Ĥ_s +
Σ_{sol care intră în Y} m·T_sol(d)`, `W_Y = Σ_s P_{s→Y} + Σ m_sol`, iar masa care apare primește `T_Y = H_Y/W_Y`.
Dacă `W_Y = 0` (o casă de piatră acoperită: nimic persistent, niciun sol), aerul celulelor după origine: CER → `T_afara`,
SOL → `T_sol(d)`, NEC → regula solului natural [B2].

- **Aritmetica** [NUM-9][SAV-10][IDX-9][NUM-6]: H exact cu restul (fără `rest = 0`): `T_Y = floor(H_Y / C'_Y)`,
  `rest_Y = H_Y − T_Y·C'_Y`; împărțirea `P_{s→Y}/P_s` pe BigInt când produsele trec de 2^53; sursele în ordinea
  ancorelor; `rs` = rotunjire la cel mai apropiat, jumătatea departe de zero (impară), scrisă explicit [SAV-3].
- **De unde vin masele vechi**: jurnalul terenului primește materialul VECHI al fiecărei editări (Uint8Array paralel cu
  inelul, 64 KB; prima apariție a celulei în lot dă materialul de dinainte) [B2][verif-JOC-1]; fețele vechi și noi se
  evaluează LOCAL, pe vecinătatea de 6 a fiecărei celule editate și a celulelor care și-au schimbat acoperirea (CER ↔
  componentă). Pe ORICE lot — refaFelie, D+ și ieșirea devreme (o comandă `fill` pe apa de sub podeaua unei case
  schimbă C' cu epoca pe loc) [IDX-2][SAV-1]. Regula „(4) C' schimbat cu aceleași celule → rest = 0" din v1 dispare: e
  C3 pe o componentă fără celule schimbate.
- **Ponderile bucăților supraviețuitoare** se citesc DUPĂ `actualizeazaFete` (rulează după `componente()`); aserțiune la
  rulare `Σ P + Σ m_sol + Σ apărute == C'_Y` pe fiecare Y [IDX-3].
- **Recalculul** (lot > JURNAL_CAP): instantaneu ÎNAINTE de `golesteIndex` (nu `Object.assign` cu un index nou) [B2];
  partea validă a inelului dă materialele vechi; restul după solul natural (NEC).
- **Contractul** `SchimbareCamere = {felii, recalcul, moarte, noi (pe ancoră), peLoc, prov, mase, feteSchimbate}`:
  `peLoc` = „id păstrat", NU „aceeași încăpere" — calea rapidă dă id-ul unei case moarte unei case noi fără nicio celulă
  comună [IDX-7]; T vine numai din `prov`/`mase`.
- **Limita cunoscută**: un singur T pe componentă cât timp puțul e deschis — săpată încet (o celulă pe oră), pivnița se
  încălzește prin puț (6,4–6,9 °C la chepeng) cu orice regulă [verif-NUM-3]; la 9,3 h de săpat, 0/54 [verif-JOC-1].
  Varianta completă (T pe bucată) e în registru.
- **Prețul C3** (în decizia 2): fiecare celulă de pământ săpată sau astupată într-o casă mută T-ul casei cu ±2,3 °C
  (7×7) … ±4,8 °C (5×5); cât e puțul pivniței deschis, casa coboară vara 6–13 °C și revine în ~12–24 h (τ ≈ 9 h cu
  rampa); iarna simetric, urcă [verif-JOC-1][verif-JOC-2].
- **Unirea și despărțirea** (decizie scrisă, §10): unirea face media pe masă (energia se conservă), despărțirea păstrează
  T în ambele părți — deci ușa scoasă dintre casă și pivniță le egalizează pe loc (vara, casa −4…−15 °C, pivnița
  +1,2…+3,9 °C; cu 2 m de pământ pivnița rămâne sub 5 °C) [JOC-3]. Ciclul real cu pioni (ușa deschisă 0,07–0,12 h) e
  echivalent cu un tick.

## 4. Capacitatea și calibrarea [v2: NUM-1, NUM-2, JOC-5, IDX-1, SAV-6]

`C = V·c_aer + Σ_fețe c(prima celulă de pe normală)` (fețele SINE și MUCHIE incluse) [B3]:

| Prima celulă | masa pe față |
|---|---|
| construită (PIATRA_CONSTRUITA, GRINDA, USA, LEMN, MOLOZ) | `cConstrJPeK` |
| sol natural cu `d ≥ dSolMasivM` | `cSolJPeK` |
| sol natural cu `d < dSolMasivM` (stratul de suprafață, pământul zidit) | `cConstrJPeK` |
| apă | `cSolJPeK` (și ea intră/iese la T_sol, §3) |
| aer (DESCHISĂ) | 0 |

- **Implicit: cConstr 18.000, cSol 300.000 J/K, dSolMasiv 1 m, gDeschis 200 W/K, omW 100 W.** Ținta casei din
  pământ zidit devine RELATIVĂ (decizia 5 spune „masă cât una din piatră"): `C_pământ == C_piatră` pe aceeași geometrie
  (exact) și `τ_pământ ≥ 0,75·τ_piatră` (măsurat 0,79–0,82 — ΣG-ul pământului e mai mare); fereastra lui cConstr devine
  [15,8; 19,68] kJ/K (18 stă la 13,9% / 8,5% de capete) [verif-NUM-1]. Casa de pământ nu se poate construi azi (piesele
  sunt PIATRA, GRINDA, USA) [verif-NUM-1].
- **Contoarele pe bucată** (`nAer`, `nConstr`, `nSolMasiv`, `nApa`) sunt un CÂMP al înregistrării de rânduri a bucății —
  călătoresc structural la ramura (b) din `actualizeazaFete` (fete.ts:529-537, care mută rândurile pe un slot NOU fără
  `scrieRanduri`; cu contoarele pe slot, M5 diverge 7/10 pe M10 lărgit) [IDX-1]. Scrise din aceeași funcție
  `capacitateCelulei` (o funcție, un fapt). Indexul primește `dSolMasivM` la construire, ca K [SAV-6]; masele pe clasă
  (dependente de content) se aplică în graf.
- **Forma canonică a fețelor** poartă contoarele (oracolul „Σ capacitateCelulei == contoare" rulează gratis după fiecare
  lot în testele existente — pe defect se înroșesc 5) [IDX-1]; **forma canonică a grafului** poartă C' și contoarele pe
  nod [SAV-6].
- **Țintele** (τ_loc = C/ΣG și τ pe simulare): casa de piatră 5×5×2 cu ușă 3–8 h (3,58 h); etajul 3–8 h (4,03–4,95 h);
  casa 5×5×2 cu golul ușii ≤ 1 h (0,92 h; casele mai mari 1,25–2,10 h — scris); pivnițele 1–3 zile (1,23–1,48);
  casa de pământ relativă (mai sus) [NUM][verif-NUM-1].
- **Valul de frig** [NUM-2]: ziua valului e 2 sau 3 (pe 1.000 de semințe, 471 în ziua 2); în ziua 2, casa 5×5×2 nu
  coboară sub −8 °C la NICIO calibrare cu τ ≥ 3 h. Poarta se scrie pe case NUMITE, pe AMBELE zile (seed 12345: anul 0 →
  ziua 3, anul 3 → ziua 2), pe MINIM, cu bandă ±0,45 °C în jurul valorii la calibrarea aleasă, plus aserțiuni structurale
  (min ziua 3 < min ziua 2 cu ~0,85 °C; casa 3×3 < casa 5×5 cu ~1,15 °C); probele negative C×0,75 și C×1,5 ies din bandă
  [verif-NUM-2].

## 5. Pasul de 1 Hz

### 5.1 Unitățile
`H = C'·T + rest` (μ × Q16 °C). `g_pas = round(G_Q16 · tps · 86.400 / (ziTicks · μ))` pe bin și muchie, DERIVED,
fracția redusă la parsare. Oamenii: `ΔH_n = round(P_n · tps · 86.400 · 2^16 / (ziTicks · μ))`, `P_n` = Σ W întregi pe
nod, o singură conversie pe nod [B3][B4].

### 5.2 Forma ψ
1. Rezervoarele la tickul pasului.
2. Muchiile din T VECHI: `F = rs(g·(T_a − T_b), 2^16)` (rs impară → orientarea muchiei nu contează) [SAV-3].
3. Oamenii; normalizare. **`T*` = T după pasul 3** [NUM-7].
4. Rezervoarele: `S = Σ g_r`, `X = Σ g_r·(T_r − T*)`, `ψ = 2^16 − rs(2^16·S, C'·2^16 + S)`, `F_r = rs(rs(X, 2^16)·ψ, 2^16)`;
   normalizare (fără produsul C'·T).

Exact și independent de ordine pe graful real, un an [B3]; nodul fără rezervor dă ψ = 2^16, X = 0 [NUM].

### 5.3 Marginea, garda, refuzul
- Dinamică pe nod: `S·(M + |T*|) < 2^52` → Number, altfel BigInt; un contor `pasiBigInt` și un comutator de test
  (pragul la 0: TOATE nodurile pe BigInt, comparate bit cu bit cu Number pe M10, mină și casa cu etaj, un an) — mina la
  c_aer 460 stă la 4–6,5% de prag și s-ar putea stinge tăcut [NUM-5].
- Garda `6·g_max(MUCHIE) < 1` rămâne: e STABILĂ, nu monotonă (pe zăbrele bipartite fără masă T oscilează amortizat)
  [NUM-8]. Decode nu refuză un |T| mare.
- **Pasul nu aruncă niciodată din `tick()`**: un invariant încălcat → reface graful integral, numără în
  `statTermic().invarianti`, continuă. Viewer-ul citește contorul la fiecare cadru (alertă în Jurnal cu textul existent
  „Spune-i dezvoltatorului (Diagnostic, F3)", un `console.error` pe tip, contorul în F3); `stepFrame` prinde și
  raportează excepțiile din `stepSim` [UI-6].

### 5.4 Costul
Pasul p50 32–35 µs pe M10, ~85 µs în situ [B3][B4] — de re-măsurat în μ. Prima linie:
`if (w.camere.comp.size === 0) return`; scenariul standard: 0 componente în fiecare tick, contoarele pasului 0 [B4].

## 6. Graful incremental (ii), delta pe LOT [B5]

- Noduri STABILE, muchii DIRIJATE (simetria verificată la citire), `inreg[bucată]`, indexul invers.
- **Moștenirea** doar între sursele-componente vechi (SOL/CER/NEC nu concurează; fără sursă veche → nod nou); egalitățile
  geometric (ancora componentei noi, apoi ancora sursei de dinainte de lot) [IDX-8]. Nodul e o etichetă: nicio valoare
  nu depinde de el (lumea continuă și cea încărcată: T pe ancoră, forma grafului și |S| identice) [IDX].
- **Delta pe lot**, în `sincronizeazaLumea` (0,144 ms p50 pe lot) — graful == graful unui index nou după fiecare
  sincronizare; X din linia grafului [B5][UI].
- **La fiecare `encode`**: graful incremental comparat cu cel integral (9–15 ms pe M10); la diferență, înlocuire +
  contor + jurnal — altfel o deltă greșită fără asimetrie (binuri, C') face lumea continuă să integreze pe un graf
  greșit, iar M5 diverge fără alarmă [IDX-4].
- K05 cu egalitate EXACTĂ pe contoare, pe deltele de DUPĂ construcție, cu proba „fără moștenire" [B5][IDX-8].
- Iterarea peste Map/Set: sume întregi exacte, `determinism-ok` cu motiv.

## 7. Salvarea, migrarea, hash-ul

- **Schema 8**: `temperaturi: { ancora, t, rest, amprenta }`, strict crescător pe ancoră [B1]. `amprenta` = FNV u32
  peste VECTORUL C' (n, apoi C' hi/lo în ordinea ancorelor), nu intră în hash [verif-SAV-2].
- **Decode**: amprentă egală → validare STRICTĂ (`rest ≥ C'` = corupere → `VALOARE_INVALIDA`); amprentă diferită (content
  sau cod de capacitate schimbat) → `rest = 0` pe toate, T rămâne, contorul = n (în teste: 0 la același content —
  devine și un oracol „C' incremental == C' de la zero") [SAV-2]. T acceptat doar `Number.isSafeInteger` și în
  [−2^31, 2^31); rest `isSafeInteger` ≥ 0; ancoră fără componentă, ne-strict crescătoare, număr diferit de intrări, bloc
  în schema < 8 sau lipsă în 8 → refuz [SAV-4][B1]. `encode` aruncă pe aceleași condiții, pe rest ≥ C' și pe ștampilă.
- `MIGRATIONS[7] = (d) => d` (fără ea, orice salvare veche e refuzată) [B1]. Migrarea, decisă de `env.schema < 8`:
  `temperaturaLaEchilibru(w, rules, tick)` = `rezolvaRegim` direct, plafon 5.000 de treceri, la neconvergență ultima
  iterată + contor + jurnal (nu e echilibrul; pasul îl relaxează) [SAV-9]. Aceeași funcție inițializează lumea FĂRĂ
  ISTORIE în `buildM10PeLume` (un singur adevăr pentru „lume fără istorie"; NEC rămâne pentru proveniențele parțiale)
  [SAV-11].
- **Hash**: după blocurile de azi, `u32(n)`, apoi pe componentă în ordinea ancorelor `u32(ancoraHi), u32(ancoraLo),
  i32(T), u32(restHi), u32(restLo)`.
- **Literalele**: `52b16ed2` → hash-ul schemei 8 cu bloc gol (`b38229fd` în prototipul SAV; se calculează pe forma
  finală) [SAV-8] — orb la temperatură, acceptabil fiindcă CI rulează `npm test` (ci.yml:60), unde stă literalul dedicat;
  `3550c897` → se mută (vede căldura oamenilor); `0e0666c5` → hash-ul de după migrare. **Scena literalului dedicat S+**
  (într-un test), cu contoare de viață: surse SOL ≥ 1 și CER ≥ 1, o componentă deschisă la final, un lot C3 doar-fețe
  (fill pe apa de sub o podea) ≥ 1, rest ≠ 0, căldură umană > 0, ≥ 1 id diferit după decode [SAV-5].

## 8. Ce vede jucătorul [v2: UI-1, UI-2, UI-3, JOC-6]

- **Inspectorul, trei rânduri FIXE** (măsurate pe un rând în cazul cel mai lat) [UI-1]:
  1. „**6,2 °C** · afară 12 °C" — T din stare, la fiecare reîmprospătare;
  2. „trage spre 4,8 °C ↘" / „stabil" — `X_tot = X + P/ΣG`, cu P-ul afișat FILTRAT (se schimbă doar când ultimele 3 pași au
     același P; stare TRANZITORIE în viewer): săgeata arată încotro merge T chiar și cu oameni înăuntru [UI-2];
  3. „oameni: niciunul" / „oameni: 1 înăuntru" — numărul, nu „+X °C" (P/ΣG ar arăta efectul ca și cum ar sta acolo
     permanent, de 2–76 de ori peste cel real) [JOC-6].
  Descompunerea rămâne dedesubt, cu `min-height` de 3 rânduri ca plasă [verif-UI-1]. Oracolul: X din rânduri == X din
  linia grafului după fiecare pas.
- **Overlay-ul U** citește T din stare; recolorează la SCHIMBAREA valorilor (103 citiri, 0,4–0,6 µs), nu pe o cheie de
  tick (cheia `floor(tick/tps)` rămânea un pas în urmă în 92–95% din cadre) [UI-3]. Fără săgeată; legenda fără „la
  echilibru".
- **Pauza**: T stă, cu excepția editărilor din pauză (proveniența) — scris [UI-8].
- **Eroarea**: componenta fără T → rândul 1 „Temperatura nu se știe (eroare internă)", plus alerta de la §5.3 [UI-6].
- **ui-fum**: `__kinstead.avanseaza(n)` (aceeași cale ca `stepSim`) [UI]; bifele termice pe o lume cu contract scris
  (pagină dedicată sau editările citite din amprenta casei, din `terrain.jurnal`) [UI-5]; condițiile pe Q16 prin
  `__kinstead`, cu precondiții (|T_afara − T| ≥ 1 °C) [UI-7]; `incarca-m5`: după Ctrl+S, ambele pagini `avanseaza(1687)`
  și compară tickul și `hashWorld` [UI-4]; o bifă cu jocul pornit la 3×: cifra lui U == T din stare [UI-3]. Reparat și
  bug-ul vechi scos la iveală: `.ui-oameni { scrollbar-gutter: stable }` și lățimea sertarului 485 px („sertar-oameni"
  ieșea roșie cu pionii la lucru) [UI-5]. ui-fum: +6–9 s [UI-10].

## 9. Porți

- **Proveniența**: oracolul pe forță brută (A5/B2) ponderat pe masa PERSISTENTĂ; **oracolul energiei pe lot**
  (ΔE = schimbul la T_sol, toleranța rotunjirii); **poarta pompei**: N cicluri săpat→astupat pe același tick lasă
  (T, rest) neschimbate ±2 Q16 după primul ciclu, pe o casă 5×5 cu PODEA și cu PAMANT; probele negative B (ieșirea la
  T-ul încăperii) și „C cu ponderile v1" ies roșii [verif-JOC-2]; mutațiile „peLoc păstrează T" [IDX-7], „consumator
  intercalat" pe o scenă de recalcul cu o unire scrisă pe id-ul unei surse [IDX-10], „SOL↔CER", „adâncime+1", „moarte
  neșterse" [B2].
- **Acceptanța pivniței, RELATIVĂ** [verif-JOC-4]: pivnița sub casă săpată progresiv prin comenzi `dig` (vara 08:00 și
  15:00, iarna, prima toamnă …, 8 momente): la închiderea ușii `|T_piv − T_regim periodic(același tick)| ≤ 2 °C` (C3:
  marja minimă 0,65 °C; A iese până la +15 °C). Plus verdictul: 1 m fără casă, cu rampă + ușă, < 85% vara (50/96); 2 m
  fără casă 96/96 tot anul [JOC-4].
- **Graful**: oracolul după FIECARE lot (fuzz 7×400, lărgire20, mina20, zidul M10), forma canonică cu C'; K05 exact.
- **Numericul**: Number == BigInt (cu comutatorul); ΔΣH == ΣF_r + ΣP; orientarea inversată pe jumătate din muchii →
  identic (proba rs = floor) [SAV-3]; punctul fix ±2 Q16 față de regimPermanent pe scenele obișnuite, 2^7 pe hotel
  [NUM-4]; celula-cruce; `T*` fixat de un test [NUM-7].
- **M5**: (a) M5-faze pe scena S+ — ASIMETRICĂ și peste o graniță de bloc (simetria maschează permutările) [IDX-1];
  (b) M5-fețe pe o casă pe iaz cu O comandă `fill` PIATRA pe apa din podea, salvare la faza 15 — prinde „C3 neaplicat pe
  loturile doar-fețe" și „graf refăcut doar la epocă" [verif-IDX-2][verif-SAV-1]; plus scena pământ pe acoperiș (graful);
  (c) M5 imediat după comanda dig a ușii; (d) M5 la scara minei; (e) **M5-content**: salvare cu content A, încărcare cu
  B (c_sol −17%) → acceptată, contorul = n, 0 ≤ rest < C', două încărcări → același hash, N pași fără refuz; proba
  negativă: validarea strictă fără amprentă [SAV-2]. Proba „ocolirea punctului unic" stă la invariant și la oracolul
  provenienței pe T-ul CONSUMATORULUI după fiecare lot de comandă [SAV-7].
- **Migrarea**: fixtura de schema 7 → T pe ancoră + hash; 8→8 idempotent; rețeaua 3×3×3 finită; cele 7 fixturi se
  încarcă.
- **Calibrarea** (§4), **valul de frig** (benzile §4), **oamenii** (casa cu uși + DORMIT 3×3 + hrană, 4 pioni: ΔT parter
  [0,15; 0,35] °C, fără pat < 0,03; proba `omW = 0`) [B4], **ușa scoasă și pusă la loc** → T casă == T pivniță == media
  pe masă (fixează decizia 3) [verif-JOC-3], **scenariul standard** (0 componente, contoare 0), **testul AST**.

## 10. Decizii pentru Andrei (implicitul în față)

1. **Oamenii încălzesc imperceptibil** (100 W fiecare): ≤ 0,1 °C într-o cămară, 0,1–0,4 °C într-un dormitor cu 4 oameni
   [JOC-6]. Pârghia reală va fi vatra (t.3).
2. **Săpatul în pământ rece răcește încăperea**: pământul săpat intră cu temperatura solului, iar cel astupat iese tot așa
   (fără „pompă" de căldură). O pivniță nouă e rece imediat. Prețul: cât e deschis puțul pivniței, casa de deasupra se
   răcește vara cu 6–13 °C și își revine în ~12–24 h; fiecare celulă de pământ săpată sau astupată într-o casă mică o
   mută cu 2–5 °C. Alternativele, măsurate și respinse: pivnița pornește caldă și are nevoie de 4–5 zile vara; sau
   „sapă și astupă" devine aer condiționat gratuit (−10 °C).
3. **Ușa scoasă dintre două încăperi le amestecă pe loc** (casa și pivnița ajung la aceeași temperatură); un pion care
   scoate și pune la loc ușa pivniței vara o încălzește pentru 7–94 h. Ușa care se deschide la trecere (fără amestec) e
   pentru mai târziu.
4. **„Trage spre" ține cont de oamenii de acum** (filtrat, ca să nu sară la fiecare trecere); dedesubt, câți oameni sunt
   înăuntru.
5. **Ritmul**: casa ~3,6 h de joc (≈ 5 min la 1×, 1,7 min la 3×); pivnița 1,3–1,5 zile (≈ 45–50 min la 1×); casa cu
   golul ușii ~1 h (doar casele mici; una de 7×7 ~1,3 h) [NUM-10][UI-9].
6. **Pivnița**: sub o casă (cu 1 m de pământ) ține vara și toamna, chiar și cu golul ușii deschis; **fără casă îi trebuie
   2 m de pământ** — cu 1 m, vara ține ~50% din timp, toamna aproape deloc [JOC-4]. O pivniță săpată sub casă în PRIMA toamnă
   stă sub 5 °C ~70% din restul toamnei (69–76%) [verif-JOC-1][verif-JOC-4]; săpată încet (o celulă pe oră), pornește la ~6–7 °C.
7. **Valul de frig**: o casă de piatră 5×5 fără foc coboară la −7,3…−8,2 °C; una 3×3 stă sub −8 °C câteva ore [NUM-2].
8. **Casa din pământ zidit** are aceeași masă ca una din piatră (se încălzește cam cu 20% mai repede); azi nu se poate
   construi.
9. **O încăpere nouă dintr-un acoperiș** pornește de la aerul de afară (o casă de piatră) sau de la temperatura solului
   (o groapă acoperită) [JOC-8].
10. **Salvările vechi** se încarcă și pornesc de la echilibru.

## 11. Implementarea, în commit-uri

**Valul 1 — simularea:**
1. **Capacitatea**: content (`cConstrJPeK`, `cSolJPeK`, `dSolMasivM`, `omW`; μ și masele derivate) + validare;
   `capacitateCelulei`; contoarele în înregistrarea de rânduri; `dSolMasivM` în index; forma canonică a fețelor cu
   contoare; testele de τ și de valul de frig (benzi).
2. **Jurnalul cu materialul vechi** (terrain) + **proveniența C3** în camere.ts (`SchimbareCamere` cu `mase`, recalculul
   cu instantaneu); oracolele provenienței și al energiei, poarta pompei, probele.
3. **Graful (ii)** pe lot, C' pe nod, forma canonică cu C', K05, compararea la encode.
4. **temperatura.ts**: starea, `sincronizeazaLumea` (+ locurile, + migrarea testelor), `pasTermic`, invarianții, refuzul
   fără aruncare, testul AST, scenariul standard.
5. **Salvarea**: schema 8, amprenta, migrarea, `temperaturaLaEchilibru` (+ harnașamentul), hash-ul, literalele, S+, M5
   (a)–(e), acceptanța relativă a pivniței.

**Valul 2 — ecranul**: inspectorul (3 rânduri, X_tot filtrat), U din stare, erorile, `avanseaza`, bifele ui-fum (cu
contractul lumii), CSS-ul sertarului, testele viewer, mutațiile termic-ecran.

Apoi recenzia codului, DEVLOG, OWNER_VERIFY §17 RESCRIS (nu doar adăugat), PLAN, CLAUDE.md.

## 12. Registru (nu intră)

- **T pe bucată** (nodurile termice pe bucată): ar repara săpatul lent și amestecul de la ușă; schimbă starea și
  proveniența [verif-NUM-3][verif-JOC-3].
- **Ușa la trecere** = conductanță temporară pe muchia USA existentă, fără index nou; **golul unei uși scoase ca
  muchie** = schimbare t.1, cu tratament IMPLICIT (200 W/K pe față nu trece garda explicită) [verif-JOC-3].
- Pentru t.3: pivnița bună stă vara la 0,2–0,3 °C sub prag (o rată de alterare continuă în T, sau „max vara ≤ 4,5 °C" cu
  recalibrare); vatra de deasupra pivniței o duce peste prag; mormanul din tocul ușii (componentaLa = null) — regula
  (de ex. partea mai caldă) se decide acolo; acceptanța relativă a pivniței devine contractul t.2b → t.3 [JOC-7].
- Somnul nesincronizat cu noaptea [B4]; clima pe sit; vatra; gheața; tablouri tipate pentru graf (memorie) [B5].
