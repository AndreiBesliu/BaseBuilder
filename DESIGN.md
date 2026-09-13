# KINSTEAD — descrierea jocului

> **Numele.** *Kin* (neamul) + *stead* (locul, gospodăria, vatra unei așezări). **Locul neamului.**
> Și, citit invers, exact teza jocului: când tribul pleacă mai departe, neamul rămâne neam — locul
> rămâne doar loc. Ales de owner în sesiunea 1 (D14).

Statut: **descriere de proiect, nimic implementat.** Documentul ăsta e rezultatul unei pase de research
pe 17 lentile (17 agenți, 437 de constatări cu surse — vezi `research/`). Fiecare decizie de mai jos are
în spate o constatare, nu o preferință; unde sursele s-au contrazis, am scris contradicția.

---

## 1. Propoziția de 15 secunde

> **Un popor care sapă adânc și ale cărui așezări îi supraviețuiesc.**
> Construiești o fortăreață pe niveluri într-o vale. Generațiile trec, oamenii îmbătrânesc și mor,
> iernile se lungesc, solul obosește, filonul se termină. Când valea nu te mai ține, o parte din trib
> pleacă mai departe cu ce știe — nu cu ce a zidit. Așezarea rămâne pe hartă: ruină de jefuit,
> avanpost de aprovizionat, sau locul în care te întorci peste trei generații.

Asta e „X"-ul — sistemul care trebuie să se vadă într-un singur GIF și care mă desparte de RimWorld.
Piața e explicită pe punctul ăsta: dacă nu poți explica în 15 secunde ce faci tu și RimWorld nu face,
nu există mecanism de descoperire, indiferent cât de bună e simularea.

## 2. De ce combinația asta, și de ce nu există deja

Cele două inspirații sunt puternice exact unde cealaltă e slabă:

| | Sapiens | Going Medieval |
|---|---|---|
| Lume | planetă continuă, 1,73× Pământul | hartă locală finită |
| Construcție | săracă (heightfield, fără peșteri, fără etaje) | **pilonul jocului**: voxeli, etaje, subteran |
| Oameni | skill-uri per individ, generații, descoperire prin practică | settleri cu nevoi, fără moștenire între generații |
| Rezultat comercial | 2.187 recenzii, 19 jucători medii, dezvoltare oprită sept. 2026 | 21.424 recenzii, ~175.000 copii în prima săptămână |

Harta genului (12+ jocuri analizate) arată o celulă **neocupată**: verticalitate reală **+** presiune
ciclică escaladantă care forțează abandonarea și reconstruirea bazei **+** lume persistentă.
Against the Storm are resetul dar e plat; Going Medieval are verticalitatea dar n-are reset;
Kenshi are lumea persistentă dar n-are bază serioasă. Nimeni nu le are pe toate trei.

Și rezolvă, prin construcție, riscul #1 al genului — **moartea prin plictiseală în late-game** —
fără să arunce colonia de care s-a atașat jucătorul (greșeala pe care roguelite-ul o face).

### Inspirațiile adăugate: Ostriv și Foundation — și tensiunea pe care o aduc

Owner-ul le-a adăugat ca referințe în sesiunea 1. Amândouă contribuie ceva ce lipsea:
**Ostriv** — plasare fără grilă, drumuri emergente din uzură, simulare economică și agricolă densă,
estetică realistă, făcut de un singur om. **Foundation** — zone desenate în loc de clădiri plasate,
construcție organică, și un *monument builder* din module combinabile care e exact tiparul propus
pentru clădirile noastre.

Dar amândouă sunt **fără grilă** și **mai realiste** decât Going Medieval, iar asta intră în conflict
frontal cu decizia de teren voxel. Nu e un detaliu de gust: adâncimea lui Going Medieval *vine din*
grilă — camerele se detectează prin flood fill, stabilitatea prin decrement pe grilă, slice view-ul
prin ascunderea straturilor, iar ocuparea exclusivă a celulei (decisă de owner) presupune celule.
Aspectul organic al lui Ostriv, Foundation și Manor Lords vine tocmai din absența grilei.

> **Cele trei decizii redeschise s-au închis** în panoul de arhitectură (4 arhitecți independenți,
> 3 judecători, verdict unanim). Rezultatul, pe scurt: **grila rămâne — dar numai pentru logică.**
> Panoul a căutat și n-a găsit niciun joc livrat cu interioare simulate multi-etaj ȘI plasare organică
> fără grilă; grila *este* topologia spațială gratuită. Organicul se cumpără integral la nivel de
> prezentare — pereți parametrici, variante din hash, poteci din uzură — pentru că alternativa e
> măsurată: Ostriv a plătit **556 de piese modelate și ~5 luni pentru o singură clădire**.
> Detaliile în [PLAN.md §0.5](PLAN.md).

## 3. Lumea

**O lume plată continuă, nu o planetă și nu o hartă finită.** Decizie închisă în panou.

**16 × 16 km — 268 km² — zero loading screens, vreodată.** Camera zboară de la fortăreață până la
orizont fără tranziție. Terenul e streamed în chunkuri de 32 m (400 rezidente în jurul camerei,
1,7 MB), iar sub el o hartă macro de 8,4 MB ține toată lumea la o rezoluție de 16 m.

Ce face lumea adâncă e că **stiva verticală de voxeli există numai unde ai săpat sau ai construit**.
Un chunk atins e *promovat* ireversibil la 64 de niveluri de 1 m (−24 sub bază, +40 deasupra),
stocate RLE. O fortăreață intens săpată, cu tot subteranul ei, ocupă ~3,2 MB. Restul celor 268 km²
e heightfield ieftin. Regula, într-o propoziție: **grila e universală, stiva e rară.**

Sapiens a plătit pentru sferă trei sisteme de coordonate, o origine glisantă, distorsiune la poli și
un fir de execuție separat doar pentru globul din meniu — și tot nu poți face zoom la planetă în joc.
Renunțăm la sferă. Argumentul e verificat, nu estetic: cele trei propoziții pe care le spun **efectiv**
jucătorii lui Sapiens — *„move as far away from your tribe as you like"*, *„send sapiens over long
distances and establish camps"*, *„you can explore everything you can see"* — sunt satisfăcute toate
de o lume plată. **Niciuna nu menționează sfericitatea.** Cumpărăm senzația, nu geometria.

**Un singur sit rulează simularea la 20 Hz.** Celelalte așezări sunt date pe disc plus un *site
record* — proprietar, stocuri, ostilitate, tickul la care a fost părăsit. Când te întorci, se aplică
o funcție deterministă de decădere pe ticks-urile scurse; nu se simulează nimic în absență. Așa teza
produsului devine aproape gratuită, iar RimWorld arată de ce contează: permite maximum 5 colonii
simultane cu degradare recunoscută oficial, ruinele lăsate **nu pot fi recolonizate**, iar modul
„Persistent RimWorlds" există tocmai ca să umple golul ăsta.

**Râurile se generează înaintea reliefului** (graf surse → confluențe → vărsare, apoi terenul coboară
de-a lungul lor). Eroziunea rămâne pas cosmetic offline. `riverDistance` e câmp per-celulă de primă
clasă — se refolosește la biomi, fertilitate și plasarea așezărilor.

**Stările lumii** (modelul Kenshi, zero dialog scris): fiecare regiune și fiecare facțiune e o mașină
de stări cu tranziții declanșate de simulare — o figură importantă moare, o regiune se golește, un
filon se epuizează, o așezare a ta e abandonată. Asta e sursa de narativ. Replayability nelimitată,
cost de scriere aproape zero — singura variantă viabilă pentru un om singur.

## 4. Bucla principală

```
așezare  →  săpat și construit pe verticală  →  producție și transport
    ↑                                                     ↓
întoarcere / reîntemeiere  ←  migrație  ←  valea obosește  ←  iarna și raidul
```

Ciclul mic (minute): cineva are nevoie de ceva, cineva îl face, cineva îl cară.
Ciclul mediu (o oră): anul de 48 de zile — patru sezoane × 12 zile, o zi ≈ 4 minute reale,
deci **un an ≈ 3,2 ore**. Primele trei ore de joc = exact primul an. Presiunea se proiectează pe
un obiect unitar, nu pe o axă vagă de timp.
Ciclul mare (10-20 de ore): generația. Oamenii îmbătrânesc, valea se epuizează, tribul se desparte.

**Decizia repetată** e: *unde trimit următorul om și următorul lot de materiale* — și răspunsul se
schimbă cu distanța, adâncimea, sezonul și ce-a mai rămas în vale.

## 5. Sistemele — și de ce exact astea

### 5.1. Sistemul-semnătură: graful de camere

**Un singur sistem fizic continuu, nu trei.** Dwarf Fortress dovedește că al doilea sistem dublează
costul; Oxygen Not Included a avut nevoie de un DLL nativ pentru trei. Al nostru e **camera**.

O cameră e un volum închis detectat prin flood fill 3D, 6-conectat. Din el ies, gratuit, cinci lucruri:

- **Temperatura** se rezolvă pe un graf de camere (zeci de noduri), nu pe celule (milioane), la un
  tick rar. Camerele se încălzesc reciproc prin izolația suprafeței care le desparte. Tot ce e
  înăuntru emite căldură: cuptorul, torța, animalul, omul.
- **Conservarea hranei** e **un singur prag**: sub 5 °C nu putrezește; peste, rata crește neliniar.
  Din atât rezultă pivnița, săpatul, gheața, foamea sezonieră și jumătate din arhitectura bazei.
  Cel mai mare efect emergent pe cel mai mic cod din tot genul.
- Apartenența, curățenia, frumusețea și rolul camerei — aceeași structură, alți derivați.

Regula de aur, verificată: ce contează la răcire e **ce se află deasupra camerei**, nu adâncimea
absolută. Pământul izolează mai bine decât o podea de lemn. Scările unifică termic etajele — e
mecanică (hornuri, pivnițe, curenți), nu bug.

**Pânza freatică e statică**, nu fluid simulat. Sapi prea adânc → pierzi stabilitate și câștigi frig.
Primești decizia interesantă fără simularea de lichide, care e sistemul cu cel mai prost raport
valoare/cost din tot genul (patru devbloguri la Foxy Voxel, atinge stabilitate + temperatură +
agricultură + pathfinding + randare deodată).

### 5.2. Construcția verticală

- **Stabilitatea** e un întreg mic propagat prin BFS de la sol: **4 la sol, −1 pe pas, 0 = imposibil**,
  grinda reintroduce un punct de sprijin cu rază 10. Nu simulare de forțe. Verificare O(1) la plasare,
  regulă explicabilă într-o propoziție, același rezolvator pentru rocă, pământ terraformat și ziduri.
- **Vizualizatorul numeric se livrează în aceeași sarcină cu regula.** La Foxy Voxel absența lui a fost
  reclamată ani întregi — sistemul arăta doar un mesaj de eroare la eșec.
- **Clădirile sunt un kit modular** pe aceeași grilă cu terenul, cu un contract unic de conexiune
  (perete / colț / ușă / fereastră / podea / scară / acoperiș). Nu modelez case; modelez 15-25 de
  piese și las jucătorul să compună. 20 de module bune bat 60 de clădiri mediocre.
- **Slice view cu un singur invariant, testabil**: nivelul activ = solid, sub = estompat, peste =
  ascuns, toate ordinele se aplică la nivelul activ. **Fără jumătăți de nivel** — sunt sursa unei
  plângeri documentate la Going Medieval și ar anula valoarea propriei mele funcționalități principale.

### 5.3. Oamenii

Aici intră partea Sapiens, și e ce face migrația să doară.

- **Skill-uri per individ, învățate prin practică.** Maximum ~15, cu lanțurile de procesare grupate.
  30 de skill-uri învățate individual, ca în Sapiens, produc muncă administrativă, nu profunzime.
- **Ucenicia e mecanică explicită**: veteran lângă novice = învățare accelerată. Exact acolo Sapiens
  promite și nu livrează, și exact acolo moartea unui specialist capătă greutate.
- **Vârstă și moarte.** Două ceasuri cu nume DIFERITE în cod, UI și save: *sezon* (climă) și *vârstă*
  (îmbătrânire). Sapiens le amestecă și propria documentație se contrazice — e tiparul „variabilă cu
  două meserii" care produce bug-uri tăcute.
- **Nevoi, v1**: hrană, odihnă, recreere, confort, temperatură. Igiena și socialul se amână.
  Nevoile modifică productivitatea printr-un **multiplicator explicit de până la ±50%**, afișat pe
  cardul pionului — fericirea e economie, nu fățuță tristă.
- **Dispoziția** e două valori: ținta instant (suma gândurilor) și bara lentă care o urmărește, cu rate
  asimetrice. Întârzierea ESTE mecanica — ea dă jucătorului fereastră de reacție între veste proastă
  și prăbușire.
- **Consecința la moral scăzut**: modelul Going Medieval (trepte de refuz → lucrează mai încet →
  refuză ordine → refuză orice → pleacă), nu catalogul complet de mental breaks. Semnificativ mai
  ieftin și mai lizibil.
- **Trăsături** ca delte pe stats existente (moodTarget, viteza de schimbare, rata de consum per nevoie,
  multiplicator XP), niciodată ca ramuri de cod.

### 5.4. Munca

Inima genului și locul unde mor proiectele. Arhitectura e **pull, nu push**: munca nu se împinge
către pioni, pionul cere job când e liber.

- **Rezervarea e un tuplu** `(claimant, jobId, targetId, layer, count, maxClaimants)` — niciodată un
  boolean. Cele trei dimensiuni trebuie să existe din prima versiune; adăugate ulterior cer rescrierea
  fiecărui JobDriver. Primul `isBeingWorkedOn: boolean` pe o entitate e semnalul de oprire.
- **Scor continuu, nu sortare lexicografică**: `2^prioritateTask × 4^prioritatePersonală / (1 + costDrum)`.
  Regula pentru jucător: *„+1 nivel de prioritate merită jumătate din drum"*. Asta elimină din start
  defectul structural al RimWorld și ONI — pionul care traversează harta pentru o bucată de lemn.
- **Scannerul returnează `Fail(cauză, detaliu)`, nu `null`.** Cinci cauze acoperă practic tot:
  LIPSĂ MATERIAL · INACCESIBIL · FĂRĂ MUNCITOR · PRIORITATE PREA JOASĂ · REZERVAT.
- **Panoul „De ce nu?"** iese gratuit din regula de mai sus și e cel mai bun raport valoare/efort din
  tot research-ul. Comunitatea Going Medieval a fost nevoită să scrie o pagină de wiki numită
  *„Why Can't — Checklist"*; ăla e semnalul că jocul nu se explică singur.
- **Automatizarea intră în vertical slice, nu în roadmap-ul de final**: praguri de stoc cu histerezis
  (oprește la N, repornește la N/2), zone de recoltare permanentă, producție continuă, coadă de ordine
  anulabilă în masă. Sunt patru sisteme mici care rezolvă reclamația numărul unu a genului
  („e tedios să faci orice" — Sapiens) și care, adăugate târziu, cer rescrierea planificatorului.
- **Modul „Auto" e IMPLICIT**, grila manuală e pentru avansați. O grilă de 16 munci × 5 niveluri ×
  N pioni = 80 de celule per colonist; playtesterii o ating o dată și renunță.

### 5.5. Presiunea

**Nu se leagă de avuție.** Scalarea pe bogăție produce stimulul pervers documentat: jucătorii buni
se auto-sărăcesc și nu mai construiesc nimic frumos — exact opusul unui base-builder. Scorul de
presiune e `max(avuție normalizată și plafonată, progres de capitole, timp scurs)`, iar obiectele
decorative contribuie **zero**.

Două piste separate, cu toți parametrii în JSON:
- **majoră** (iarna grea, raidul, boala) pe ciclu on/off cu `minSpacing`,
- **minoră** pe interval mediu.

Curba: `roll(min,max) × handicap(ciclu)`, handicapul urcând liniar de la 0,2 la 1,0 în ~15 cicluri.
Plus **regula anti-streak**: după 5 repetări ale aceluiași tip, forțează alt tip. Fără `minSpacing` și
anti-streak, jucătorul primește două raiduri la o zi distanță și citește asta ca nedreptate.

**Raidul are un Commander AI unic** care emite ordine (sparge poarta, ridică scări, sapă prin deal),
iar unitățile sunt mașini de stare ieftine care ies din ordin doar când sunt atacate direct.
Rezolvă simultan lizibilitatea tactică și bugetul de CPU.

**Combatul e doar defensiv**, pe aceeași buclă de sarcini ca munca — o sarcină „luptă", nu un sistem
paralel. Un sistem de combat separat e cel mai prost raport valoare/efort din tot genul; Manor Lords,
cu 9 dezvoltatori, e criticat exact pentru combat.

### 5.6. Migrația — mecanica-semnătură

Ce face valea să obosească, în ordinea în care se simte:
1. **Filonul se epuizează** — resursele sunt finite per regiune, plafonate la generarea hărții.
2. **Solul obosește** — fertilitatea scade unde s-a cultivat prea mult, se reface lent.
3. **Iernile se lungesc** — handicapul ciclic, același care duce presiunea.
4. **Așezarea îmbătrânește** — oamenii mor, tinerii nu mai încap, distanțele cresc.

Când tribul se desparte, **cunoașterea pleacă, piatra rămâne**. Așezarea veche devine o intrare în
starea lumii: ruină, avanpost aprovizionat dacă ai drum până acolo, sau cuib de jefuitori dacă n-ai.
Te poți întoarce. O poți reîntemeia. Poate te atacă de acolo.

> Asta e și punctul în care jocul trebuie testat cel mai devreme și cel mai dur. Dacă migrația se simte
> ca o pedeapsă, e greșită. Trebuie să se simtă ca **un capitol care se închide**.

### 5.7. Cercetarea

**Research point = obiect fizic** produs, depozitat, transportabil, distrugibil și vandabil
(modelul Chronicles/Textbooks din Going Medieval). Asta face biblioteca o țintă de raid și leagă
cercetarea de forța de muncă și de comerț.

Arborele se bugetează ca **rampă de 12-20 de ore, NU ca sursă de longevitate**. Sapiens dovedește
că 8-11 ore de deblocare urmate de gol înseamnă joc mort. Fiecare tehnologie primește un **cost
permanent sau un dezavantaj** (întreținere, epuizare de sol, vulnerabilitate sezonieră), ca arborele
să fie șir de decizii cu regret, nu listă de bifat.

## 6. Cele patru surse de longevitate — și numai ele

Orice funcționalitate care nu servește una dintre astea **nu intră**:

1. **Atașamentul față de pioni** — identitate persistentă, consecințe ireversibile, jurnal per om,
   memorial. Zero cinematice, zero portrete desenate, zero dialog scris: doar sloturi de interpretare.
2. **Presiunea adaptivă cu ritm vizibil** — anotimpuri cu rol mecanic distinct, nu doar temperatură
   diferită.
3. **Progresia ca economie fizică** — munca produce bunuri; bunurile finanțează infrastructura;
   cunoașterea se plătește în timp și oameni, nu în puncte.
4. **Modabilitate** — tot conținutul în JSON de la prima zi. Singura sursă de conținut care scalează
   fără muncă de la mine. (Beneficiul imediat, mai important decât modding-ul: iterez de zeci de ori
   mai repede pe balans, singur.)

## 7. Ce e explicit ÎN AFARA v1 — gardul de scop

Lista asta e o decizie, nu o listă de dorințe. Ce e aici se parchează fără discuție.

- Planetă sferică, lume continuă streamuită, mai multe biomuri jucabile simultan.
- **Apă dinamică / simulare de fluide.** Pânza freatică e statică. Punct.
- Multiplayer, co-op, porturi, controller.
- API de modding în cod (Lua/C#/Harmony). v1 = modding de **conținut** (JSON + pachete de asset-uri).
- Catalogul complet de mental breaks; relații sociale și opinii între pioni; genealogie completă.
- Chirurgie și model medical pe părți de corp. (Infecția ca cursă severitate-vs-imunitate, da —
  e 80% din tensiunea medicală la 20% din efort. Chirurgia, nu.)
- Diplomație cu slidere. (Contracte cu întârziere de un sezon + un tabu per facțiune, atât.)
- Erou controlat direct, interioare detaliate, campanie narativă scrisă.
- Motor propriu. Sub nicio formă.
- Orice backend cloud pentru gameplay. Save local, zero dependențe recurente.

## 8. Prezentarea

> ⚠ **Secțiunea asta e sub revizuire (D16).** A fost scrisă înainte ca Ostriv și Foundation să intre
> ca inspirații. Argumentul de mai jos rămâne valabil ca *limită inferioară de cost*, dar treapta de
> realism se alege pe baza panoului de arhitectură, nu de aici.

**Low-poly stilizat pe grilă**, cu geometria lumii GENERATĂ din date, nu desenată. Costul artistic
devine numărul de **materiale** (20-40), nu numărul de clădiri — ăsta e singurul motiv real pentru
care Going Medieval arată bogat cu o echipă mică.

Identitatea vizuală trăiește în **shading și lumină**, nu în mesh-uri: un singur shader parametrizat
(vertex color + ramp de lumină + overlay de anotimp), ciclu zi/noapte, anotimpuri, vreme, fog.
Cu geometrie simplă, astea produc mai multă variație percepută decât orice pachet de assets — și e
singura zonă în care un programator bate un artist.

Pionii sunt **pioni, nu eroi**: low-poly 3-10K tris, 8-10 animații, starea internă comunicată prin UI
deasupra capului. RimWorld a vândut 4M+ de copii cu personaje 2D fără picioare și fără fețe.

Target hardware declarat ca **constrângere, nu aspirație**: GTX 1050 Ti / i5-9400F / 8 GB RAM,
profil CPU-bound. Asta interzice geometria grea și mută tot bugetul de optimizare în simulare.

**Riscul, spus direct:** low-poly stilizat e stilul cel mai aglomerat de pe Steam, iar asset-urile CC0
sunt recunoscute instantaneu de jucătorii de gen. Nu mă salvează geometria, mă salvează shading-ul.
Fără paletă și shader propriu, jocul va fi citit ca asset flip indiferent cât de bună e simularea.

## 9. UI — avantajul competitiv, nu corvoada

Un colony sim se câștigă în lizibilitatea a 200 de stări simultane, și acolo am 10 ani de reflex din
React. Datele de retenție sunt brutale: în Going Medieval doar 86,5% dintre posesori supraviețuiesc
primei zile și 70,3% ajung la ziua 7; în Against the Storm doar 50,8% câștigă prima partidă.
Cauza nu e lipsa de funcționalități, e **lipsa de feedback**.

Zece reguli adoptate din prima zi:

1. **Fiecare „nu" are un motiv vizibil.** Acțiunea blocată rămâne pe ecran (disabled, nu ascunsă) și
   spune în tooltip exact ce lipsește, cu valori. Toate verificările returnează `{ok, reasonCode, params}`
   de la prima linie de cod — retroactiv înseamnă rescrierea tuturor sistemelor.
2. **Fantome înainte de clădiri.** Plasarea creează o entitate-fantomă persistentă cu stare proprie.
   Din ea derivă gratuit Plan Mode, blueprints, copierea de plan, coada de construcție și diagnosticul.
3. **Alertele au prag, debounce și cooldown**, definite în date. Click pe alertă = camera pe cauză.
   Sunet doar pentru severitate critică.
4. **Panou Alerts Overview din prima zi**, nu la 1.0.
5. **Overlay-urile sunt un registru de date**, cu tastă dedicată. Primele 7: teren/fertilitate,
   temperatură, camere, zone, accesibilitate, lumină, resurse.
6. **Acțiune în masă peste tot**: drag-linie, drag-dreptunghi, „select all of this type", aplicare pe
   coloană în grila de priorități. Fiecare unealtă fără echivalent de masă devine „click click click".
7. **Grila de coloniști în două vizualizări** (tabel + un om pe rând), cu coloană de DISTANȚĂ.
8. **Layout stabil** (zonele tranzitorii jos) + **o singură căutare globală** fuzzy pe inițiale.
9. **Niciun canal unic**: nicio stare doar prin culoare; overlay-uri cu gradient de luminozitate, nu
   roșu→verde; UI scale și taste remapabile.
10. **Prima oră se instrumentează separat** de restul jocului, cu telemetrie locală pe praguri explicite.

Și, ca regulă de camera într-o lume pe niveluri: **„du-mă la nivelul acestui obiect"** și
**„ascunde acoperișurile"** sunt funcții de bază, nu QoL. Fără ele, construcția interioară e oarbă.

## 10. Ținta de scară — scrisă ca număr, nu ca aspirație

| | v1 |
|---|---|
| Pioni | **40** (soft cap), cu forță de muncă temporară plătită ca supapă pentru vârfuri |
| Creaturi | 150 |
| Stack-uri de iteme | 3.000, cu merge automat și plafon global |
| Hartă | 256 × 256 × 12 |
| Tick de simulare | **20 Hz** (50 ms buget — de 3× mai mult decât RimWorld din prima zi) |
| Viteze | 1× / 2× / 3×, unde 3× e declarat „best effort" cu indicator în UI |
| Țintă | 60 FPS pe un echivalent Ryzen 5 3600 |

Argumentul, nu optimismul: **Going Medieval, cu echipă, Unity și 7 ani de lucru, se îneacă la ~20 de
coloniști**; RimWorld, cu 10 ani de optimizare, e greu peste ~50 de pioni + 200 de animale. O țintă
peste RimWorld, de la un om singur, e o promisiune pe care n-o pot ține.

Numărul de pioni **nu e metrica de scară** — bugetez ENTITĂȚI SIMULATE. În toate jocurile studiate,
animalele și itemele de pe jos au fost la fel de scumpe ca pionii. Itemele de pe jos sunt cauza #1 de
degradare-în-timp în Dwarf Fortress și ONI: TPS-ul scade cu VECHIMEA coloniei, nu cu populația ei.

---

## Anexă — contradicțiile pe care research-ul NU le-a rezolvat

Le las la vedere, ca să nu le citesc peste șase luni ca pe fapte.

1. **Ce e bottleneck-ul.** Comunitatea ONI spune „pathfinding = 80% din frame time"; comunitatea
   Dwarf Fortress spune că pathfinding-ul e ~5-6% și vinovate sunt vectorul de iteme și verificările
   de line-of-sight; Foxy Voxel spune că la ei era garbage temporar și listeneri nedezabonați.
   → Concluzia utilă nu e „optimizează pathfinding-ul", ci **„orice sistem care face o scanare
   O(hartă) per agent per tick te omoară, indiferent cum se numește"**. De aici: profiler pe sisteme
   din ziua 1, nu intuiție.
2. **Cifra „hauling = 60-80% din muncă"** nu e confirmată de nicio sursă primară. Nu calibrez economia
   pe ea. O măsor eu.
3. **Cifrele comerciale ale lui Going Medieval** se contrazic între un milion de UNITĂȚI și un milion
   de WISHLIST-uri, și între 12 și 17 martie 2026 ca dată de 1.0.
4. **Multiplicatorul recenzii → copii** e între 30× și 63× în funcție de sursă — o diferență de 2× în
   orice plan financiar. Calibrarea pe anunțuri oficiale susține 30-40×.
5. **Motorul.** 17 lentile, patru recomandări diferite. Vezi PLAN.md, D1 — și de ce Faza 0 e
   proiectată ca măsurătoare, nu ca preferință.
