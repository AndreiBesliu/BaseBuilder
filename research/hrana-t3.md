<!-- Designul t.3 (hrana sub 5 °C), dupa harta pe HEAD si panoul adversarial din 10.10.2026. Dovezile (scripturi, loguri) au stat in scratchpad-ul sesiunii; rezumatul lor intra in DEVLOG. Caile raport-H*.md / panou-*.md / panou/verif-*.md citate aici nu sunt in repo. -->

# Hrana sub 5 °C — t.3, livrat (design v2 + §13; S24-27, tăietura 3)

*10.10.2026. v1 + panoul adversarial (4 lentile, 49 de constatări, 15 verificate independent; 4,91 M). Harta: [H1]…[H6];
panoul: [STARE-n], [J-n], [UI-n], [Pn] (`panou-*.md`, `panou/verif-*.md`). Ce s-a schimbat față de v1 e marcat [v2: …].*

*Livrat 11.10.2026 pe ramura `t3-sim` (20 de commit-uri peste `eae704d`): abaterile implementării, cifrele măsurate,
corecțiile și recenzia codului sunt în §13; deciziile, cu cifrele de la livrare, în OWNER_VERIFY 18.*

## 0. Ce face felia

Primul EFECT al temperaturii: **hrana se strică peste 5 °C**, treptat, cu o rată care crește convex cu temperatura; **la
5 °C și sub, nimic**. **Cămara** (un depozit cu filtrul „doar hrană", care la prioritate egală trage hrana și din depozitul
general) face din pivniță contrajocul. Fără producție de hrană, cămara e o lecție, nu o alegere: o știi și o faci [J-5].

**Nu intră** (§12): producția, confortul, gheața, vatra, „mănâncă întâi ce se strică", ușa la trecere, T pe bucată.

## 1. Starea

| Câmp | Clasă | Note |
|---|---|---|
| `iteme.alterare[slot]` | PERSISTED | Float64Array de întregi exacți, în `ONE = 2^29` dintr-o unitate [v2: STARE-6]; invariantul `S ≤ q·(ONE−1)` [STARE-10] |
| `agents.caraAlterare[slot]` | PERSISTED | mână goală ⇒ 0; o singură funcție `golesteMana` pentru cele 6 locuri (inclusiv spawn) [STARE-8] |
| `zone.refuzate[zona]` | PERSISTED | mască INVERSĂ: 0 = primește tot (zero-inițializarea e implicitul corect, felurile noi intră implicit, migrarea e no-op); resetată în `creeazaZona` [v2: STARE-9] |
| `w.hranaStricata` | PERSISTED | total unități stricate |
| `perisabil[fel]` | content | declarația explicită a perisabilității (azi doar HRANA) [STARE-8] |
| contoarele oracolului | TRANSIENT | `alterareAcumulata`, `alterareMancata`, `alterarePierduta`, `alterareDisparuta` în RatiuneStore (nu intră în hash) [v2: STARE-1, P1] |

- **Extensiv, conservat exact** [H1]: unirea adună; despărțirea dă porțiunii `parteDinAlterare(S, q, k) = floor(S/q)·k +
  floor((S mod q)·k/q)` (o funcție, toate căile; S < q·ONE ≤ 10^6·2^29 = 2^49, exact fără BigInt); sursa păstrează restul.
  Contracte: `mutaItem` citește S ÎNAINTE de `stergeItem`; în `asazaItem` partea se scade din sursă după ce porțiunea a
  intrat; S-ul porțiunii care nu încape nicăieri se numără ca pierdut [STARE-10].
- **Mâna nu se strică**, își poartă starea.
- **Realizarea** e o funcție proprie, `scadeStricate(slot, k)` cu `k = min(q, floor(S/ONE))`: `q −= k`, `S −= k·ONE` — NU
  regula de S a lui `iaDinItem` (luată literal, golea mormanul de 26× mai repede); împarte cu `iaDinItem` doar contabilitatea
  de store (zone, moarte, `reconciliazaTintaMoarta`) [v2: STARE-4]. Rulează la fiecare pas, și la λ = 0 [STARE-7].
- **Mâncatul** — obligatoriu, nu opțional: `luat·nut − ceil(parte·nut/ONE)` (mâncătorul nu câștigă niciodată restul;
  fragmentarea în mormane de 1 u nu mai scapă de pierdere) [v2: STARE-7, STARE-11]; calculul fără depășire:
  `floor(parte/ONE)·nut + ceil((parte mod ONE)·nut/ONE)`. Prognoza, bara și `cautaMancare` lucrează pe VALOARE
  (`q − S/ONE`), cu ceil pe nutriția efectivă.
- **Encode aruncă pe aceleași condiții ca decode** [STARE-8]; un fel neperisabil cu S ≠ 0 → S = 0 cu contor, nu refuz.

## 2. Unde și cât de des

- **`temperaturaCelulei(w, x, y, z, tA)`**, pură, fără nicio scriere în lume (întoarce null pentru o componentă fără T; doar
  pasul de alterare numără) [v2: UI-13]: componenta → `slot.t`; altfel `tA`.
- **Tocul ușii — regula e PERMANENTĂ**: o ușă se desenează și se zidește peste un morman (commands.ts:320, joburi.ts:2937),
  deci mormanul pe USA apare în joc oricât am interzice depunerea [v2: STARE-2]. Regula: maximul T al celulelor vecine pe cele
  6 direcții care au componentă; dacă una e sub cer, T_afara [STARE-12]. **`asazaItem` folosește USA doar ca a TREIA trecere**
  (după toate celelalte celule), nu o interzice — interdicția pierdea marfă și înroșea 2 teste [v2: STARE-5].
- **Cadența**: la fiecare pas de 1 Hz, după `pasTermic`, pe o linie proprie; rata evaluată o dată pe componentă și trecere
  [J-3]. Componentă fără T → mormanul sare pasul, numărat [STARE-12].
- **Două faze**: pierderile tuturor mormanelor, apoi `scadeStricate`. Moartea → `reconciliazaTintaMoarta`.
- **Indexul de zone — predicat EXACT** [v2: P3]: un morman care supraviețuiește murdărește indexul doar dacă (a) stătea plin pe
  o celulă de DEPOZIT, (b) `itemStackMax − q1 > maxLocLiber[zonă × fel]`, sau (c) `min(q, haulCarryMax)` se schimbă ȘI i se
  schimbă apartenența la `deMutat`; moartea murdărește ca azi. „≤ 1 refacere pe pas" nu putea pica (steagul e boolean); pe
  mormane desincronizate designul v1 dădea 112–130 de pași de index pe tick (pragul e 30); predicatul X dă 0–4,1, cu 0 pași
  învechiți în 11.400.

## 3. Curba [v2: STARE-3, J-3, P2]

`r(T) = 0` pentru `T ≤ 5 °C`; peste, convexă. **Tabel în content**, în `pierderePeMilionZilnic` (întreg; ‰ dădea o bandă
moartă de 0,5 °C), cu grila **deasă la prag**: pas 0,1 °C pe [5; 6], 0,5 °C pe [6; 10], 5 °C de la 10 la 45 (26 de puncte).
Un tabel la fiecare 5 °C cu interpolare liniară e o DREAPTĂ pe [5; 10] — exact forma „liniară" pe care v1 o respingea, iar
cifrele v1 erau ale parabolei: pivnița +1 °C toamna ar fi pierdut 2,08% în loc de 0,28%. Interpolarea se face pe λ, fără
depășire: `λa + floor((λb − λa)·(T − Ta)/ΔT)` [STARE-6].

**Implicit: pătratic, t½(15 °C) = 4 zile** (t½(20 °C) ≈ 1,8 zile). Grila deasă reproduce parabola: raportul maxim ×1,125 pe
toate valorile Q16 din [5,2; 45] °C; pe anotimp, exact cifrele parabolei [verif-P2]:

| Loc | Pierdere pe anotimp (primăvară / vară / toamnă / iarnă) |
|---|---|
| sub cer | 31,1 / 78,8 / 27,9 / 0% |
| casa de piatră | 5,9 / 45,3 / 19,1 / 0% |
| pivnița sub casă (1 m) | 0% |
| pivnița +1 °C (oameni deasupra) | 0 / 0,09 / 0,28 / 0% |
| pivnița fără casă (1 m) | 0 / 0,08 / 0,27 / 0% (pe an ~0,35%) |

- **Cuantizarea**: `ONE = 2^29` → λ ≥ 1 de la ~5,02 °C; parsarea refuză un content cu λ(5,05 °C) < 1 (legat de `ziTicks`,
  `tps`); banda moartă se probează [STARE-6][P2].
- **Validarea content-ului**: primul punct (5 °C, 0), rate și pante nedescrescătoare; plus un test pe content-ul IMPLICIT:
  raportul față de forma declarată pe toate valorile Q16 din [5,2; 45] ≤ ×1,13 [P2].
- **Pierderea e treptată** (unitățile dispar una câte una). Mormanele identice pierd sincron (aceeași cantitate, același T):
  acceptat și scris [UI-12].

## 4. Hrana stricată și conservarea

Dispare, numărată (`w.hranaStricata`, `unitatiStricate` pe tick). Două oracole, la fiecare tick, cu **bază** luată la pornire
și după fiecare decode (contoarele sunt TRANSIENT) [v2: STARE-1, P1]:
- **G1S** (pe S): Σ acumulat == Σ S (mormane + mâini) + ONE·stricat + S mâncat + S pierdut + S dispărut;
- **G1** (pe unități): pusă == mâncată + stricată + rămasă (mormane + mâini) + pierdută (pe fel).
G1 singur era orb la toți mutanții de S (0 roșii pe 8/8); G1S îi prinde pe toți 8, cu 0 pe design.

## 5. Cămara [v2: J-1, J-2, UI-3, P4]

- **Filtrul** (`zone.refuzate`, §1), citit în `indexZone`, și **felul e parametru OBLIGATORIU** al lui `prioritateaLocului`
  (fără valoare implicită): rezumatul, inspectorul, alerta și `vedereFaraDepozit` îl trec toate; cu indexul murdar, regula
  „celula goală primește orice" se filtrează pe fel. `VedereFaraDepozit.primeste` = felurile primite de vreun depozit viu; din
  ea citesc `stareMorman` (`FEL_REFUZAT`) și alerta („N mormane n-au niciun depozit care să le primească felul") — un singur
  adevăr. `PREA_DEPARTE` în locul lui `DEPOZITE_PLINE` când singurul depozit cu loc e dincolo de rază [H4][P4].
- **La prioritate egală câștigă depozitul specializat** [v2: verif-J-1, verif-UI-3]: rangul = `prioritate·2 + (1 dacă
  filtrul e îngust)`, folosit la sortare, în `incapeUndeva`, `cautaDestinatie`, `deMutat` și `prioritateaLocului(…, fel)`.
  Cămara pictată DUPĂ depozitul general, la prioritatea implicită, ia hrana și din el (2.457–2.583 u la +1 h, 47–67 stricate,
  față de 0 u în cămară); hash-ul standard rămâne identic; fără preset de prioritate și fără plafon.
- **Molozul** [J-2]: săpatul pivniței lasă pământ și piatră pe podeaua cămării. Unealta Cămară propune, dintr-un clic, o
  **„groapă de moloz"** — un depozit cu filtrul pe felurile refuzate prezente, de ⌈u/75⌉ celule plus o margine — când cămara
  are mormane de felurile refuzate și niciun depozit n-are loc pentru ele; aceeași funcție dă avertismentul („cât lipsește")
  și cauza de pe morman, vizibile și în inspectorul cămării (4×4 pictată odată cu cămara: 1,2–2,7% pierdere).
- „**Primii pași**" pun cămara ÎNAINTEA depozitului general; bifa se ține minte; „ține hrana a N oameni" [J-11].
- **Mâncatul**: dacă nu găsește nimic în raza de 96, o a doua căutare la rază × 4 — altfel pionii care hoinăresc departe
  pleacă de foame cu cămara plină [J-8].

## 6. Jocul și lumea de azi

- **Scenariul standard**: comentariul lui (scenario.ts:192-206) cere ca referința să nu descrie o colonie înfometată; cu h4
  plecările se dublează, toate din foame [J-6]. Implicit: **hrana scenariului × 1,25**, ca invariantul comentariului să rămână
  adevărat (se măsoară); alternativa: referința cu foamete, comentariul rescris. Standardul „vede" acum clima de afară.
- **Jocul nou**: hrana de start sub cer, start toamna z1 08:00 — 65% din pierderea primei toamne cade în primele 12 h (6 h de
  joc = 8,4 min la 1×); cu h4: 6,4% în 6 h, 12,5% în 12 h; hrana se termină la 99–101 min la 1× în loc de 120 [J-4][J-9].
- **Iarna păstrează gratuit tot ce e sub cer** (decizie scrisă; gheața în registru) [J-7].
- **Pompa C3 de răcire**, măsurată: dominată de cămară (0%), cere 4+ pioni fără altă treabă; plasa ±1000 °C rămâne [J-10].
- **Acceptanța cămării cu oameni** pe o geometrie JUCABILĂ: N pioni locuiesc în casa de deasupra și mănâncă din cămară, toamna
  și vara, ≥ 3 semințe; „plecați cu hrană în cămară" = 0; molozul tolerat prin re-desemnare [J-8][J-11].

## 7. Salvarea și hash-ul

Schema 9: `iteme.alterare`, `agents.caraAlterare`, `zone.refuzate`, `w.hranaStricata`; `MIGRATIONS[8]` = zerouri (hrana
veche pornește proaspătă; masca 0 = primește tot). Decode refuză S negativ, nesigur, > q·(ONE−1), pe un slot mort, o mână goală
cu S ≠ 0, biți în afara felurilor; encode aruncă pe aceleași condiții. Hash-ul primește câmpurile (hi/lo unde trec de 2^32).
Literal nou „**S+ hrană**" (hrană într-o casă, într-o pivniță, sub cer, peste o noapte; stricată > 0 în casă și sub cer, 0 în
pivniță).

## 8. Ce vede jucătorul [v2: UI-1…UI-14]

- **Prognoza hranei** — o singură funcție pură în src/sim, pentru TOȚI cei patru cititori (bara, Primii pași, alerta
  hrana-scade, dialogul Joc nou) [UI-9]: **proiecție pe aerul viitor** (`tAfara` e pură de tick), două bazine — sub cer cu
  `r(tAfara(t))`, în încăperi cu rata de acum —, pas de o oră, plafon 16 zile („peste un an"); când nimic nu e sub cer, forma
  închisă `ln(1 + r̄·Q/C)/r̄` (sau `Q/C` la r̄ = 0) [UI-1]. „Media pe 24 h" ținută constantă greșea cu zile întregi. **Unitatea:
  zile de calendar** („~3,6 zile", „~N de ore" sub o zi); pragurile atenție / critic / hrana-scade: 0,893 / 0,298 / 0,298 zile
  [UI-14].
- **Trei clase după rata EFECTIVĂ**, derivată din funcția de rată a simulării [UI-2, UI-6]: ≤ 5 °C („se păstrează"), „aproape"
  (T > 5 °C și r < 0,1%/zi — „se strică foarte încet"), peste. Pe U: puncte pe ≤ 5 °C, un semn mai slab pe „aproape", rând în
  legendă (element separat, nu lipit de cifre [UI-11]). În inspector: „Se păstrează | 4,7 °C · cu 0,3 sub prag", „Se păstrează
  aproape | ~1 la 56 de zile · la 5,3 °C", „Se strică | ~13 azi · acum 2,1 °C" — sub cer, din aceeași funcție ca prognoza
  (pierderea următoarelor 24 h), cu T-ul de acum separat [UI-5]. Textul se calculează din rata cuantizată a simulării.
- **Inspectorul**: cantitatea și rândul de alterare scrise PE LOC, scoase din cheia inspectorului (cantitatea scade acum
  singură) [UI-10].
- **Alerta** „Hrana se strică: N mormane" (N = mormanele cu r ≥ 0,1%/zi), la o pierdere medie de peste 1% pe zi; cheia listei pe
  id-uri, textul scris pe loc, ținta citită la clic [UI-4].
- **F3**: „hrana: stricat N · în pericol M · R%/zi". **Unealta Cămară** (presetul + comutatorul „Primește: tot · doar hrană"
  scris pe loc + groapa de moloz) și motivul „Se strică aici; cămara are loc".
- **ui-fum** — probele negative specificate [UI-7]: comparații pe S (nu pe unități); `bara-prognoza` sabotată cu textul fără
  alterare; `alterare-inspector` la 3×, precondiție ≥ 2 valori, până la 60 de citiri; `U-prag` sabotat pe gest; `alerta-alterare`
  pe o scenă proprie, cu N schimbat între mousedown și mouseup; `incarca-m5` cu precondiția „Σ S s-a schimbat în fereastră"
  [UI-8]; `joc-nou-marfa` rămâne cum e [UI-11].

## 9. Porți

- **G1S + G1** la fiecare tick, cu bază la pornire și după decode, pe o scenă care atinge DEVREME și în afara grilei de 1 Hz:
  ucideri cu marfă, abandon cu hrană în mână, săpat sub morman, slot refolosit, `mutaItem`, LASĂ, fragmentare în mormane de
  1 u [P1][STARE-7]. Proba de proprietate pe `parteDinAlterare`: `|parte·q − S·k| < q` și `parte·q ≤ S·k`.
- **Poarta pompei de prospețime**: S ≠ 0 SCRIS de test pe mormanele atinse de cicluri, λ ≡ 0, pionii sătui [P1].
- **Nutriția**, test white-box cu valorile pe hârtie (q = 30, S = 117.440.519 → credit 230, apoi 115; q = 1, S = ONE − 1 →
  credit 1; control S = 0 → 300 + 150) [P7]. **Mâna nu se strică**, poartă proprie [P8].
- **Pragul și sursa**: o pivniță sub casă un anotimp → cantitatea și S EXACT neschimbate; un morman la exact 5,000 °C și unul
  la 5 °C + 1 Q16; același morman în casă și sub cer; ordinea în tick [P9][P10].
- **Moartea din alterare**: S scris = ONE − q·λ(T) + 1, rezervările MANCAT și CARAT puse; proba: `reconciliazaTintaMoarta`
  scos [P11]. **λ = 0 cu S ≥ ONE** se realizează [P14].
- **Indexul de zone**: oracolul de exactitate (indexul păstrat == refăcut, după fiecare pas) pe scene calde, vara și toamna;
  costul pe contoare: pași/tick < 30 pe un depozit cald desincronizat (1.296 de mormane) și pe 48×48; probele M, I, fără
  (a)/(b)/(c), D [P3].
- **Cămara**: `poarta-camara` (index la zi și murdar, inspector, rezumat, alerte) [P4]; rangul la egalitate; groapa de moloz;
  slotul de zonă refolosit [STARE-9][P12]; acceptanța cu oameni (§6).
- **Curba**: validarea, testul pe content-ul implicit, banda moartă, acceptanța pe anotimpuri cu benzi din parabolă (pivnița
  +1 °C toamna ≤ 0,35%; fără casă 1 m toamna ≤ 0,35%) — tabelul la 5 °C ar ieși ROȘU (2,09 / 1,88).
- **Decode/encode**: refuzurile, fiecare cu cazul ei [P16]. **Tiparele de mutație rupte** se listează și se re-rulează
  (`stare.mjs:206, :210, :214`, `nevoi.mjs:66-70`) [P13][STARE-12].

## 10. Decizii pentru Andrei (implicitul în față)

1. **Curba**: pătratică (plată lângă 5 °C), t½ la 15 °C = 4 zile. Vara sub cer se strică ~80% pe anotimp, într-o casă ~45%;
   toamna ~28% / ~19%; pivnița bună 0. **Câștigul cămării**: fără ea, hrana de start a jocului nou ține ~100 min la 1×; cu o
   cămară la timp, aproape cât fără alterare (~120 min). Alternative: blândă (16 zile), aspră (1 zi), exponențială (pragul mai
   „tăios": o pivniță încălzită de oameni pierde 1–3% pe anotimp). Fără producție, cămara e o lecție, nu o alegere.
2. **Alterarea e treptată**; mormanele la fel pierd odată.
3. **Hrana pe jumătate stricată hrănește pe jumătate** (regulă, nu opțiune).
4. **Hrana din mâna unui om nu se strică.**
5. **Tocul ușii**: la cărat, hrana ajunge acolo doar dacă nu e alt loc; un morman rămas în toc (de exemplu sub o ușă zidită
   peste el) are temperatura părții mai calde.
6. **Cămara**: depozit „doar hrană"; la prioritate egală trage hrana și din depozitul general; unealta propune și o groapă
   pentru molozul săpat.
7. **Jocul nou rămâne la fel** (hrana sub cer, start toamna z1 08:00): primele 12 h iau ~12% din hrană — lecția costă. Alternativă:
   start la 20:00.
8. **Prognoza hranei** în zile de joc, cu alterarea, aceeași peste tot.
9. **Harta U**: puncte pe ce se păstrează, un semn slab pe „se strică foarte încet".
10. **Alerta** la o pierdere de peste 1% pe zi.
11. **Hrana stricată dispare**; totalul în F3.
12. **Scenariul de referință**: hrana × 1,25, ca să nu descrie o colonie înfometată.
13. **Iarna păstrează gratuit tot ce e sub cer** (gheața vine cu producția).
14. **Salvările vechi**: hrana pornește proaspătă.
15. Decizia 6 din §17, în hrană: sub casă cu 1 m sau fără casă cu 2 m, nimic pe un an; fără casă cu 1 m, ~0,35% pe an.

## 11. Implementarea, în commit-uri [v2: P5]

**A — formatul** (λ ≡ 0, dovada neutralității: comportamentul identic, doar hash-ul proiectat): starea §1 și toate căile,
`golesteMana`, `scadeStricate`, perisabilitatea, nutriția, schema 9, migrarea, hash-ul, refuzurile decode/encode, masca
inversă; contoarele + G1S/G1 cu bază; poarta pompei, testul nutriției, mâna. Literalele: o dată.
**B — curba și pasul**: tabelul + validarea + ONE, `temperaturaCelulei`, regula tocului + a treia trecere, pasul în două faze,
predicatul X al indexului, moartea, a doua căutare de mâncare, acceptanțele (anotimpuri, cămara cu oameni, fragmentarea,
moartea, pragul și sursa), K05 pe contoare, scenariul standard × 1,25. Literalele re-derivate O DATĂ.
**C — cămara**: rangul, comanda `setFiltruZona`, `FEL_REFUZAT`, `PREA_DEPARTE`, felul obligatoriu, `primeste`, groapa de moloz
(funcția), `poarta-camara`.
**D — ecranul** (§8) și ui-fum.

Apoi recenzia codului, DEVLOG, OWNER_VERIFY §18 + decizia 6 din §17, PLAN, CLAUDE.md.

## 12. Registru

Producția de hrană (de ea depind foamea sezonieră și decizia reală „cât sap"); gheața (iarna gratuită); „mănâncă întâi ce se
strică" (după ce plafonul de 64 nu mai merge în ordinea slotului); `haulCarryMax 50 < itemStackMax 75`; vatra; confortul; ușa la
trecere (traficul de mâncat în cămară); T pe bucată; capacitatea (o iarnă pentru 10 oameni ~6×6, la limita fără grindă);
mormanele care pierd sincron.

## 13. La livrare (11.10.2026): ce s-a schimbat față de v2

După implementare (valul 1, simularea: A, B, C; valul 2, ecranul: D1, D2), recenzia codului (5 lentile + verificatori,
14 constatări, toate confirmate, 1 MARE) și remediere (SIM și ECRAN în paralel; 9 commit-uri). 20 de commit-uri de cod peste
`eae704d`, pe ramura `t3-sim`. Porțile finale (HEAD `ea29bba`): 1.178 de teste; 1.334/1.334 de probe de mutație (35 min 22 s,
într-o clonă); `--izolare` 765/765; ui-fum 92/92 și 27/27 de probe negative exacte. Cifrele de mai jos înlocuiesc estimările
designului acolo unde diferă.

- **§1, starea:**
  - două contoare în plus față de listă: `pierdutePeFel` (termenul „pierdut" al lui G1 pe fel: `itemePierdute` e al tuturor
    felurilor și se resetează la un `lasaItem` refuzat) și `alterareNormalizata` (felurile neperisabile cu S ≠ 0, aduse la 0);
  - `iaDinItem` își păstrează semnătura și lasă partea în `ItemStore.ultimaParte` (TRANSIENT), citită imediat de RIDICĂ și
    MĂNÂNCĂ — ca să nu rupă API-ul și ancorele de mutație (`const luat = iaDinItem(...)` e tiparul a două probe);
  - `asazaItem(…, id, alterare)` și `creeazaItem(…, alterare)` fără valori implicite: un apelant care uită S-ul sursei nu
    compilează;
  - S-ul zidit merge în `alterareDisparuta` (designul nu spunea unde; azi niciun fel perisabil nu se zidește — calea e
    probată pe un content cu PIATRA perisabilă);
  - refuzuri de formă în plus la `decode`: o alterare care nu e număr (null / bool / șir s-ar fi convertit tăcut) și o mască
    peste 255 (Uint8 ar fi făcut 256 → 0 = „primește tot");
  - `cautaMancare` caută exact cel mai mic k cu nutriția efectivă ≥ lipsa (căutare binară), nu o formulă închisă: produsul
    `lipsa·q·ONE` trecea de 2^53 la maximele content-ului;
  - `ONE_ALTERARE` stă în `state.ts` (reexportat de `iteme.ts`): un import din `iteme.ts` la parsare făcea ciclul
    content → iteme → zone → content;
  - fixtură golden nouă, de schema 8 cu hrană în mâini (regula „fiecare migrare cu fixtura ei, capturată ÎNAINTE"; fixturile
    vechi n-aveau mâna plină), cu literalul ei, `9b8cdbd4`.
- **§1 și §9, nutriția pe hârtie — cifrele designului (230 / 115 și 1) erau ale lui ONE = 2^24 cu `floor`.** Cu ONE = 2^29 și
  `ceil` (STARE-11), la A: q = 30, S = 7·2^29 + 7 → **229, apoi 114**; q = 1, S = ONE − 1 → **0**; controlul S = 0 → 300 + 150.
  La B, pasul realizează orice S ≥ ONE la tickul 0 (și la λ = 0, P14), deci starea lui A nu mai trăiește până la o îmbucătură:
  testul final e pe S = 2^29 − 41 (același rest la 30) → **290, apoi 145**; mutanții familiei rămân distinși (floor 291 / 146,
  nereduse 300 / 150, S-ul întreg 285 / 145, fără rest 290 / 144). Rezervarea pe valoare: 68 de unități în testul funcției
  (q = 75, S = 30·ONE, lipsa 610; pe hrană proaspătă 41), 42 în lume (S = ONE − 1).
- **§2, unde și cât de des:**
  - **pragul e al content-ului**: primul punct al tabelului (pierderea 0), nu un 5 °C scris în cod; „λ(5,05 °C) ≥ 1" a devenit
    λ(prag + 0,05 °C) ≥ 1 (cu content-ul implicit, același lucru);
  - λ nu se scrie în content și nici în forma parsată: fișierul ține doar tabelul, λ se derivă la parsare (pentru banda moartă)
    și se memorează pe obiectul de reguli (WeakMap) pentru pas; un test poate da rata 0 cu un tabel pe zero scris direct (`R0`);
  - predicatul X doar pe stricăciune (`scadeStricate`), nu și pe `iaDinItem`: mâncatul și căratul își păstrează regula lor
    (corectă, mai largă), deci nicio cale existentă nu s-a mișcat;
  - tocul fără niciun vecin de aer → T_afara (designul nu spunea); un toc pe care un vecin îl are fără T → null;
  - santinela „fără T" a ratei pe componentă e `null`, nu −1: o rată negativă sub prag (mutantul „pragul −0,1 °C") se citea
    „fără T", iar mormanul sărea pasul tăcut;
  - **cele două faze rămân fără poartă**: varianta într-o fază e echivalentă pe content-ul implicit (măsurat: același hash
    standard, aceleași 124 de teste ale hranei verzi); o poartă ar cere material de construcție perisabil și un constructor care
    abandonează pe un morman.
- **§3, curba, măsurată pe tabelul din content:** λ ≥ 1 de la prag + 1.639 Q16 = **0,025 °C** (designul: ~5,02 °C);
  λ(15 °C) = 46.147, λ(≥ 45 °C) = 738.354; raportul față de parabolă **×0,934 … ×1,125** pe toate valorile Q16 din
  [5,2; 45] °C. Pe anotimpuri (primăvară / vară / toamnă / iarnă, %), înlocuind tabelul din §3:

  | loc | tabelul din content | parabola (§3) | grila la 5 °C (control) |
  |---|---|---|---|
  | sub cer | 31,97 / 79,34 / 28,85 / 0,002 | 31,1 / 78,8 / 27,9 / 0 | 32,54 / 79,34 / 29,48 / 0,03 |
  | casa de piatră | 6,27 / 46,60 / 20,36 / 0 | 5,9 / 45,3 / 19,1 / 0 | 7,52 / 46,60 / 21,35 / 0 |
  | pivnița sub casă (1 m) | 0 / 0 / 0 / 0 | 0 | 0 |
  | pivnița +1 °C | 0 / 0,093 / **0,282** / 0,001 | 0 / 0,09 / 0,28 / 0 | 0 / 0,89 / **2,09** / 0,03 |
  | fără casă, 1 m | 0 / 0,079 / **0,269** / 0 | 0 / 0,08 / 0,27 / 0 | 0 / 0,72 / **1,88** / 0 |

  Benzile porții (pivnița +1 °C și fără casă 1 m, toamna ≤ 0,35%) sunt verzi pe tabel și roșii pe grila la 5 °C. O pivniță
  un anotimp (regimul periodic, T max 4,802 °C): mormanul proaspăt rămâne exact (75, 0).
- **§4, oracolele:** G1S și G1 rulează pe scena cu ucideri, abandon, săpat sub morman, slot refolosit și LASĂ, și cu rata
  implicită (246 de unități stricate de pas, 39 de mormane omorâte de pas); pompa de prospețime pe `R0`, cu S scris sub o
  unitate și cu ce realizează pasul la λ = 0 după uniri numărat în bilanț.
- **§5, cămara:**
  - `prioritateaLocului(…, fel)` întoarce RANGUL (numele rămâne: e cel din design și din ancore); `maxRangLibera` e un câmp
    DERIVED al indexului (nu un scratch de modul), comparat de oracolul indexului;
  - „filtru îngust" = refuză măcar un fel; un depozit care refuză tot primește +1, dar nimic — stare inutilă, nu invalidă;
  - `setFiltruZona` refuză un dormitor (un filtru pe o zonă fără marfă ar fi citit de rang ca „specializat") și, după
    recenzie, verifică masca pe INTERVAL (`refuzate > feluri`), nu pe biți: `&` vedea 2^32 ca 0 = „primește tot" (STARE-1);
  - `PREA_DEPARTE` îl scrie doar evaluarea scumpă (`cautaDestinatie`, pe item, cu răcire), nu indexul, care nu știe de distanțe;
  - **groapa se dimensionează pe TOT molozul** (⌈u/75⌉ + `groapaMargineCelule` = 4, content, dintr-o singură măsurătoare),
    nu pe lipsă: `loc` e o margine superioară (celulele goale sunt comune și hranei), deci lipsa e una inferioară și decide doar
    DACĂ se propune. După recenzie (JOC-4), **doar cămara propune groapa, iar felurile perisabile nu sunt niciodată moloz** —
    înainte, o groapă „doar piatră" cu hrană pe ea își propunea o „groapă" pentru hrană, adică o a doua cămară, caldă;
  - presetul Cămară e un buton în Zone, nu o unealtă nouă; pictura și `setFiltruZona` pleacă în același pas JS
    (`aplicaZona`), fără tick între ele;
  - **groapa se pune singură** (`locGroapa`: primul pătrat liber pe sol, pe inele de până la 24 de celule în jurul cămării).
    D1 a scris-o FĂRĂ probă de acces (abaterea D1-12), pe motivul „regiunile: `find` comprimă drumurile, adică scrie".
    **Premisa era falsă**: `find` (`src/sim/regions.ts`:270–272) e citirea `s.component[a]`, iar `regionAt` e tot o citire pură.
    Pe geometria canonică (pivnița sub o casă cu acoperiș) primul pătrat „pe suprafață" era acoperișul: groapa ieșea la
    (0, 0, +4), unde nu ajunge nimeni, `groapaDeMoloz` număra acoperișul ca loc, iar propunerea dispărea cu molozul tot în
    cămară — singurul defect MARE al recenziei (JOC-1; ECRAN-1 e același). Acum fiecare celulă a gropii e în aceeași
    componentă de mers cu o celulă a cămării (`regionAt` + `find`); fără regiune, `null`. Pe H4: (dx −2, dy 7, dz +1), pe sol;
  - **acceptanța cu oameni**: geometria H4 (casa 7×7 cu chepeng, pivnița 3×3×2 sub 1 m, săpată de pioni), ușile chepengului
    puse prin `fill`, paturile = o zonă DORMIT, 4 pioni, 600 u, 3,5 zile, toamna și vara:

    | varianta | stricat | plecați cu hrană în cămară |
    |---|---|---|
    | cămară + groapă (6 semințe), toamna / vara | 0,5–1,0% / 1,3–1,5% | 0 |
    | fără filtru, toamna / vara | 13,8–16,3% / 26,8–29,0% | 0 |
    | fără cămară, toamna / vara | 16,0–16,5% / 29,8–30,3% | 0 |

    Rangul mută toată hrana din general în cămară în 250–350 de tickuri. A doua căutare de mâncare (J-8) NU e exercitată acolo
    (pionii dorm lângă cămară; are proba ei la B); 0 re-desemnări (nicio prăbușire la 3×3 sub 1 m), deci „molozul tolerat prin
    re-desemnare" s-a exercitat doar prin groapă. Testul inițial era orb la groapă (JOC-2: generalul avea loc pentru tot
    molozul, iar groapa era pusă de mână); acum groapa vine pe calea butonului, cu generalul plin: 6/6, molozul iese în
    497–801 de tickuri, cămara ajunge la 552–569, stricat 0–7 u; martorul fără groapă: molozul nu iese, stricat ≥ 5%;
  - **„Se strică aici; cămara are loc"** exclude zona mormanului și cere clasa „se strică"; după recenzie (ECRAN-2), locul se
    numără doar pe celulele cămării cu clasa mai bună decât „se strică" (o cămară „aproape" contează), iar când nici la
    prioritatea maximă cămara n-ar trece de rangul locului, textul e „Coboară prioritatea depozitului ăstuia sub a cămării".
- **§6, jocul:** scenariul × 1,25 e 563 pe sit (cele 6 mormane de 75 rămân pe loc, sfertul pe rândul al treilea), nu 6 × 94 —
  o lume cu 450 e exact cea veche, deci măsurătorile au martor. Plecații pe semințele 1 / 2 / 3 / 12345: 1 / 2 / 2 / 7 la
  referință, față de 2 / 3 / 2 / 8 fără alterare și 12 / 10 / 13 / 16 cu alterare și hrana veche (J-6 măsurase 1 / 1 / 1 / 7
  pe alt prototip); stricat 18,5–18,7%. A doua rază de mâncare e un câmp de content (`mancareScanRadiusLargCells` = 384,
  validat ≥ prima rază), nu „× 4" în cod. Jocul nou: prognoza la pornire 2,851 zile (fără alterare 3,565); cu pionii, hrana se
  termină la 2,869–2,910 zile.
- **§7, salvarea și hash-ul:** literalele s-au mutat o dată la format (A) și o dată la efect (B) — standard `b38229fd` →
  `fd188574` → `c4a6c1dc`; acces-joc `fe597a27` → `c62b4aee` → `84be6e5e`; migrare `65883f04` → `f83bc5fb`; S+ `84d14adc` →
  `82d32e8f`; noi: schema 8 cu hrană `9b8cdbd4` și „S+ hrană" `505346b7` (stricate: casa 3, tocul pivniței 3 — la T-ul
  casei —, tocul casei 3, afară 2, pivnița 0; M5 salvat la 6 h + 7 tickuri dă același hash).
- **§8, ecranul:**
  - pasul orar nu e Euler, ci soluția exactă pe oră la rată constantă (e^(−a) din Padé): Euler greșea cu −0,026 zile la
    25 °C; λ-ul orei e cel de la MIJLOCUL ei (Simpson a fost încercat și scos: nu câștigă nimic măsurabil). După recenzie
    (ECRAN-3): peste un exponent de 0,25 pe oră, ora se împarte în sub-pași (cel mult 1.024), iar consumul pasului e
    1/(1 + a/2) sub prag — înainte, `e^(−a)` cădea exact la 0 de la a = 2, cu tot stocul sub cer fracția devenea 0/0 și
    prognoza sărea la V/C (1,55 zile față de 0,07). Content-ul implicit stă sub prag (λ-ul unei ore la 45 °C e ~0,115);
  - **baza pierderii e pe unități** (`q·nut`), nu pe valoare: simularea strică q·λ pe pas, deci un morman fărâmițat pierde ca
    unitățile lui. Prognoza și toate cifrele „cât ne hrănește" sunt pe VALOARE; cifra din bară rămâne în UNITĂȚI, iar
    tooltip-ul le spune pe amândouă („hrănește cât … proaspete");
  - forma închisă când nimic PERISABIL nu e sub cer (nu „nimic sub cer"); mâinile la rata 0, tocul la T-ul părții calde;
  - plafonul e un an de calendar („peste un an");
  - pragurile de prezentare stau în viewer, nu în content: 0,1%/zi pentru clase (pragul „aproape" cade la 377.450 Q16 =
    5,759 °C), 1%/zi pentru alertă (întârziere 10 s, răcire 60 s de joc), 0,893 / 0,298 zile pentru bară;
  - Primii pași: prognoza stă în pasul cămării, iar rândul „Nu mai ai hrană" apare doar când nu mai e hrană — altfel cardul
    intra sub coloana Hărți (măsurat în pagină: 278 px față de 204);
  - o singură temă (ui.css are doar tema închisă), CSS-ul nou doar pe tokenuri;
  - F3 a urcat peste coloana stângă (`#hud`: `top: 50px`, `z-index: 16`, doar cu UI-ul de joc): eticheta „hrana" era
    acoperită de cardul Hărți, găsit de ui-fum;
  - prognoza contra simulării cu pioni (ora cu ora): jocul nou implicit −0,115 … +0,140 zile, 6 oameni −0,166 … +0,172,
    3 oameni −0,357 … +0,095 (restul erorii e rezerva de foame a pionilor); după ECRAN-3, față de modelul de 1 Hz pe
    fărâmituri, |dif| ≤ 0,0012 zile, iar pe 15.955 de cazuri ale jocului prognoza s-a mișcat cu cel mult 1,02·10⁻¹¹ zile.
- **§9, porțile:**
  - ui-fum rulează hrana pe două pagini ale ei (`paginaHranei`: jocul nou 12 / 1000 / 2760; `paginaAlterarii`: pivnițe
    săpate prin comenzi), timpul doar prin `__kinstead.avanseaza(n)`, lumea doar prin comenzi, comparațiile pe S (PERSISTED);
  - `alterare-inspector` compară fiecare SCRIERE a rândului cu funcția (`MutationObserver`), nu citirile: la 4 Hz, o citire
    vede DOM-ul cu până la 250 ms în urmă (~4,5% din citiri la 3×);
  - `bara-sus` probează cel mai lat dintre cele 122 de texte ale lui `textZile` („peste un an", 70,9 px), nu literalul
    „~12 h 59 min";
  - după recenzie: `groapa-clic` cere moloz nou în groapă (proba negativă `groapa` îi sapă podeaua), `bara-praguri` probează
    clasele barei sub praguri (PORTI-2), sabotajele `alterare-timp` și `se-misca` raportează N tickuri rulate (PORTI-1),
    oracolul prognozei ia sfârșitul hranei din lume (PORTI-3), garda „cămara nu-și e singură sfat" are testul ei (PORTI-4),
    buclele de iarnă au plafon (PORTI-5).
- **Recenzia codului, constatare cu constatare:**

  | id | sev. | ce | ce s-a făcut |
  |---|---|---|---|
  | JOC-1 | MARE | groapa dintr-un clic pe acoperișul casei | reparat (`4f032d4`): aceeași componentă de mers cu cămara; probat pe calea butonului |
  | ECRAN-1 | MEDIE | același defect, văzut din ecran | același commit |
  | JOC-2 | MEDIE | acceptanța cu oameni oarbă la groapă | testul nou cu generalul plin și groapa de la buton; `groapa-clic` cu moloz ajuns; negativa `groapa` |
  | JOC-3 | MICĂ | groapa (rang 7) trage pământul din depozitul general | **nereparat — decizie** (OWNER_VERIFY 18, decizia 19) |
  | JOC-4 | MICĂ | logica gropii pe orice depozit cu filtru; hrana numită „moloz" | `8608b91`: doar cămara; perisabilul nu e moloz |
  | STARE-1 | MICĂ | o mască ≥ 2^32 scrisă trunchiată (2^32 → „primește tot") | `817e111`: garda pe interval |
  | ECRAN-2 | MICĂ | „Se strică aici" spre o cămară care se strică la fel, sau o prioritate imposibilă | `c96c532`: doar spre o cămară care păstrează; „Coboară" |
  | ECRAN-3 | MICĂ | `scadereOra` = 0 de la a = 2; 0/0 cu tot stocul sub cer | `24ba63b`: sub-pași, consumul fără anulare |
  | ECRAN-4 | MICĂ | „a un om", „lipsesc 1", „5 °C" scris în cod | `f2b747a` |
  | PORTI-1 | MICĂ | sabotajul își inventa contorul | `b2bbd60` |
  | PORTI-2 | MICĂ | clasele barei, neatinse de scenă | `ea29bba`: bifa `bara-praguri` |
  | PORTI-3 | MICĂ | oracolul lua adevărul din aceeași funcție ca prognoza | `ae791d5` |
  | PORTI-4 | MICĂ | garda „cămara nu-și e singură sfat" prinsă întâmplător | `ae791d5` |
  | PORTI-5 | MICĂ | buclele de iarnă fără plafon: testul trecea sau atârna | `ae791d5` |

- **§12, registrul, la zi.** Rămân din design: producția de hrană, gheața, „mănâncă întâi ce se strică", `haulCarryMax 50 <
  itemStackMax 75`, vatra, confortul, ușa la trecere, T pe bucată, capacitatea, mormanele care pierd sincron. Noi:
  - **JOC-3**: groapa ca „haldă" pentru tot molozul (rang 7, azi: cu generalul plin de pământ trage 375 u din el; cu generalul
    gol, 120–140), ca preaplin (prioritatea implicită − 1: generalul rămâne neatins, dar 40–70 u fac cărat invers, iar molozul
    iese în 668–834 de tickuri în loc de 523–736; cere și un câmp de prioritate prin UI) sau bonusul de rang doar pentru
    filtrele care primesc un fel perisabil (schimbă regula din §5 pentru orice depozit specializat) — la owner;
  - **a doua plasă a gropii**: `groapaDeMoloz` să numere `loc` doar pe celulele de depozit accesibile din cămară — un bloc de
    regiune necalculat dă `NO_REGION`, deci locul ar ieși subnumărat (avertismente false); nemăsurat cât de des. Calea
    butonului e închisă; rămâne doar un depozit pictat de mână pe un acoperiș;
  - **costul F3** nu trece prin memoria hranei (doar cu HUD-ul vizibil, 2,5 Hz, ≤ 0,13 ms la 1.000 de mormane);
  - stratul DOM al lui JOC-4 fără bifă ui-fum proprie (ar cere o lume construită anume; logica e probată în node);
  - poarta celor două faze ale pasului (§2) și a doua căutare de mâncare în acceptanța cămării (§5).
