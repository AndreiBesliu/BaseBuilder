<!-- Designul t.3 (hrana sub 5 °C), dupa harta pe HEAD si panoul adversarial din 10.10.2026. Dovezile (scripturi, loguri) au stat in scratchpad-ul sesiunii; rezumatul lor intra in DEVLOG. Caile raport-H*.md / panou-*.md / panou/verif-*.md citate aici nu sunt in repo. -->

# Hrana sub 5 °C — t.3, design v2 (S24-27, tăietura 3)

*10.10.2026. v1 + panoul adversarial (4 lentile, 49 de constatări, 15 verificate independent; 4,91 M). Harta: [H1]…[H6];
panoul: [STARE-n], [J-n], [UI-n], [Pn] (`panou-*.md`, `panou/verif-*.md`). Ce s-a schimbat față de v1 e marcat [v2: …].*

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
