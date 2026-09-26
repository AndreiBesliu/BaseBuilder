# Ce așteaptă la tine

Lucrurile pe care nu le pot verifica sau decide singur. Fiecare are **ce te uiți**, **cum arată
bine** și **de ce nu pot eu**. Se șterge un rând când primește răspuns.

Starea completă e în [DEVLOG.md](DEVLOG.md); ăsta e doar capătul de listă.

---

## 1. D20 — așezarea liberă a clădirilor: e varianta asta ce voiai?

**Ce te uiți.** Pornește viewerul (`Kinstead.cmd`), apasă **B**. Rotește cu `,` și `.`, schimbă forma
cu **N**, pornește și oprește ancorarea cu **M**.

- **conturul alb** e clădirea adevărată, ce s-ar desena în joc
- **verde** sunt celulele pe care le acoperă oricum
- **chihlimbar** sunt celulele blocate *în plus* — acolo nu poți păși deși pe ecran e loc. **Aia e
  taxa, și ea e întrebarea.**

**Cum arată bine.** Te uiți la o hală rotită la 30–45° și chihlimbarul ți se pare acceptabil. Dacă
da, D20 se închide așa cum e propusă și pot construi mai departe pe ea.

**De ce nu pot eu.** E o judecată vizuală, nu una măsurabilă. Cifrele le am — hală 12×7 m de
1,24–1,33× aria reală, colibă 4×3 m de 2×, zid subțire între 1,13 și 2,38 celule pe metru — dar
niciuna nu răspunde la „arată prost?".

**Ce NU e negociabil, și de ce.** Regula de acoperire rămâne „orice atingere", chiar dacă pare
grasă. Alternativa („celula intră dacă centrul ei e înăuntru") arată mult mai fidel și **curge**:
apasă **N** de două ori până la *zid 0,2 × 8 m*, rotește la 30°, și citește în HUD coloana
`CENTRU`. Scrie **1**. Un zid de opt metri care oprește pe cineva într-un singur loc. Arată ca un
zid, nu e un zid — și n-ai găsi cauza niciodată privind zidul.

**Dacă răspunsul e „nu, vreau coliziune cu adevărat off-grid":** atunci se redeschide **D19**, nu
D20 — adică decizia de arhitectură închisă unanim, pe care stau pathfinding-ul, camerele,
stabilitatea și slice view-ul. E o discuție mult mai mare și merită purtată explicit.

---

## 2. Gate-ul de motor (D1) — rularea

**Ce faci.** Dublu-clic pe `bench\ruleaza-gate.cmd`, argument `fortress d1b`. Fereastra **nu
minimizată**, ~60 de secunde. Scoate un `.json`.

**Și încă două rulări, de pe 25.09 (Electron e instalat):** același script cu `fortress d1b electron`
și cu `fortress d1b electron-curat`. Aceeași regulă — fereastra vizibilă, nu minimizată. JSON-ul se
salvează în Downloads și titlul ferestrei spune unde. Așa avem în sfârșit ce livrăm (Electron cu
`--in-process-gpu`, cerut de overlay-ul Steam), nu doar Chrome curat; iar rularea „curat" separă
costul gazdei de costul flagului. Dacă flagul costă peste 5% din mediană, toate cifrele din GATE.md
se re-măsoară — e criteriul pre-înregistrat acolo, la §12.

**Cum arată bine.** Fiecare fișier există și nu conține `INVALID`. Numele începe cu gazda
(`gate-chrome-…`, `gate-electron-…`).

**De ce nu pot eu.** `requestAnimationFrame` nu rulează într-o fereastră ascunsă, iar sonda o
raportează corect ca `INVALID · pagina nu e vizibilă`. Măsurătoarea cere un ecran adevărat, vizibil.

---

## 3. Mașina-țintă (tot D1)

**Ce decizi.** Pe ce clasă de mașină trebuie să meargă jocul.

**De ce contează.** Mașina ta (7950X + RTX 3060) e de 2–5× peste clasa țintă plauzibilă. Din
[`bench/GATE.md`](bench/GATE.md): pe ea gate-ul **nu poate semna STAY**, doar STAY-PROVIZORIU.
**D1 nu se poate închide fără răspunsul ăsta** — e scris acolo, nu o inventez acum.

**De ce nu pot eu.** E o decizie de produs: pe cine vrei să ruleze jocul.

---

## 4. Spike-ul de aspect

**Ce te uiți.** `viewer/spike.html` — clădiri rotite liber, ziduri din pietre individuale, teren
neted, soare cu umbre moi. Tot procedural, zero fișiere de model.

**Cum arată bine.** Îți place direcția, sau îmi spui ce anume nu.

**De ce nu pot eu.** Era răspunsul la „nu-mi place că totul e construit din pătrate". Numai tu poți
spune dacă răspunde.

---

## 5. Petele de pe pantă — reparate, dar merită o privire

**Ce te uiți.** Panta de lângă fortăreață, în viewer.

**Cum arată bine.** Suprafețe continue, fără găuri prin care se vede fundalul.

**De ce îl las aici.** Era un defect real (fețe cu înfășurare inversată, eliminate de culling) și e
reparat, cu test. Dar ce se vede acum în locul găurilor sunt **contratreptele** terenului voxelizat
— adică exact aspectul „totul e din pătrate" de la punctul 4. Reparat nu înseamnă frumos.

---

## 6. Primii pioni care muncesc — se citește ce fac?

**Ce te uiți.** Viewerul, tasta **J**. Dă click pe teren de câteva ori (fiecare click = „săpați aici").
Pionii bej care merg spre o cerere devin albăstrui, cei care sapă devin verzi; o linie albă leagă
fiecare pion de locul lui de lucru. Cererile: chihlimbar = liberă, albastru = a luat-o cineva,
roșu = n-are niciun loc de unde s-o sapi (sapă o rampă), violet = are loc dar nu se ajunge,
portocaliu = un pion a renunțat la ea (un ostil în drum, drum prea scump) dar altul o poate lua.

**Cum arată bine.** Fără să citești nimic din ce am scris mai sus, îți dai seama cine ce face și de ce
o cerere nu e luată. Dacă trebuie să ghicești, spune-mi ce anume ai vrut să știi și n-ai găsit.

**De ce nu pot eu.** E lizibilitate, nu corectitudine: corectitudinea o acoperă 213 teste.
Research-ul spune că genul se câștigă în lizibilitatea a 200 de stări simultane; aici sunt primele.

---

## 7. Mormane și depozite — se vede unde se duce marfa?

**Ce te uiți.** Viewerul, tasta **J**. Dă click pe teren de câteva ori (cereri de săpat), apoi ține
**Z** apăsat și dă click de două ori, pe două colțuri ale unui dreptunghi de teren plat: ăla e
depozitul (pătrate verzi pe podea). Fiecare voxel săpat lasă un morman (un cub mic; cu cât e mai
înalt, cu atât e mai plin). Pionii arămii cară ceva; linia albă arată spre morman sau spre celula
de depozit. Pătratul devine mai luminos când se umple și albastru cât timp vine cineva spre el.
**X**+click pe depozit îl șterge (cine ducea ceva acolo lasă marfa la picioare).

**Cum arată bine.** Vezi mormanele apărând lângă săpături, pionii plecând cu ele spre depozit și
depozitul umplându-se dinspre partea apropiată de carieră. Un morman roșu = n-are unde (nu există
depozit sau e plin); violet = are unde, dar nu se ajunge. Dacă vezi un morman care stă roșu deși
depozitul are loc, sau un pion care ridică și lasă același morman la nesfârșit, aia e ce vreau să știu.

**De ce nu pot eu.** Corectitudinea o acoperă 261 de teste (marfa nu dispare, nimic nu se mută între
depozite egale, drumurile blocate nu produc bucle, iar suma cantităților se conservă în acceptanță).
Ce nu pot judeca e dacă se CITEȘTE.

**Și o întrebare separată, de ritm.** Măsurat: pionii petrec **de 4,7 ori mai multe tickuri pe drum
decât muncind**. Asta e pragul pentru „batching" (un cărăuș strânge mai multe mormane pe un drum, în
loc de unul singur) — research-ul cere decizia pe cifra asta, iar cifra există acum. Uită-te la
carieră cu **J** apăsat: dacă ți se pare că pionii mai mult umblă decât lucrează, îl fac; dacă ți se
pare normal pentru un colony sim, rămâne cum e. Costul dacă îl fac mai târziu: rescrierea driverului
de cărat (cei patru pași devin bucle cu cursor), a cererilor de rezervare și a reconstrucției de la
încărcare — deci nu e gratis, dar nici blocant.

---

## 8. Oamenii pleacă — se vede DE CE, și are sens?

**Ce te uiți.** Viewerul, tasta **J**. Rândul de sus arată acum și `flămânzi`, `obosiți`,
`refuză`, `plecați`, plus avertismentul „N pleacă în curând" și „nu mai e mâncare în așezare".
Pionii galbeni mănâncă, cei violeți dorm. Lasă o carieră să meargă câteva minute fără să pui mâncare.

**Cum arată bine.** Întâi apar flămânzi, apoi contorul de „refuză" crește, apoi avertismentul, și abia
după aia pleacă cineva. Fereastra dintre avertisment și plecare e de vreo **50 de secunde de joc** —
cât să apuci să reacționezi. Dacă îți par prea scurte sau prea lungi, cifrele sunt în
`content/rules.json` (`dispozitieTicks`, `dispozitieUrcare`, `dispozitieCoborare`, pragurile).

**De ce nu pot eu.** Corectitudinea o acoperă 315 teste și 89 de mutații: pragurile se ating,
plecarea eliberează tot, marfa nu pleacă cu omul. Ce nu pot judeca e dacă **ritmul** e cel al unui
joc — dacă ai timp să reacționezi, și dacă pierderea unui om se simte ca o consecință sau ca un
accident.

**Și o măsurătoare care cere o decizie.** Într-o colonie cu mâncare la fiecare sit, **8 din 32 de
pioni pleacă** în 100.000 de tickuri. Nu e un defect al nevoilor: pionii fără treabă **hoinăresc**
(plimbarea aleatoare rămasă din S12-15) și ajung la 3.000–6.000 de celule de cea mai apropiată hrană,
adică mult peste raza în care își caută de mâncare. Am încercat să-i opresc din hoinărit când sunt
flămânzi — au plecat 12 în loc de 8, fiindcă se depărtează înainte să flămânzească. Deci reparația
adevărată e **să nu mai hoinărească oriunde**: fie se întorc spre așezare, fie stau. Asta e o decizie
de joc, nu de cod: vrei ca un pion fără treabă să se plimbe prin toată valea, sau să rămână pe lângă
casă? Costul: mic acum (o ancoră în `alegeTinta`), mai mare după ce apar clădirile care ar putea-o
defini singure.

---

## 9. Stabilitatea — regula se citește de pe ecran, sau doar din text?

**Ce te uiți.** Viewerul, tasta **S** — și ai nevoie de **slice view pornit** (`Q`/`E`, `R` îl
oprește): fără el nu există un nivel activ de judecat, iar overlay-ul îți spune asta în rândul de
sus în loc să tacă. Desenează DOAR ce e acționabil: contur galben = *ultima celulă* (lasă rocă aici
sau pune stâlp), contur roșu = *cade*. Ce e sigur rămâne nedesenat, deliberat. Portocaliu, mai
strâmt, în interiorul celuilalt = ce s-ar prăbuși dacă s-ar săpa toate desemnările vii. Sapă o
cameră **lungă** (6×13, nu pătrată) și uită-te pe marginile ei; apoi desemnează o pivniță de 7×7 și
uită-te **înainte** să sape cineva.

**Cum arată bine.** Portocaliul arată voxelul din centrul tavanului încă de la desemnare — adică
jocul te-a avertizat înainte, nu la săpătura 46 din 49, a unui pion pe care nu-l urmăreai. Când
lărgești o cameră, apare galben pe ultimul rând de rocă dinainte să cedeze. **Cum arată rău:**
ecranul acoperit uniform, sau o prăbușire despre care nu se înțelege ce săpătură a provocat-o.

**De ce nu pot eu.** Corectitudinea o acoperă acum 22 de teste și 28 de mutații. Dar întrebarea e
mai onestă decât era: prima versiune a acestui punct îți cerea să te uiți la un overlay pe care nu-l
văzusem **niciodată** pe ecran — și o recenzie adversarială a măsurat că nu desena nimic, din trei
motive independente (pătratele cădeau peste planul de tăiere, nivelul era greșit cu unu, iar cu
slice-ul oprit se lua din altitudinea camerei). Plus unul mai rău: starea se calcula din suportul
voxelului de deasupra, deci într-o cameră de 6×13 toate cele 216 celule spuneau „sigur" și 14 chiar
prăbușeau ceva. Toate sunt reparate și legate cu teste.

Ce rămâne, și nu pot închide din cod: dacă **omul înțelege regula uitându-se la ecran**, fără s-o
citească nicăieri. Ăsta e chiar eșecul reclamat ani întregi la Foxy Voxel — regula era corectă și
invizibilă, iar jucătorii o trăiau ca arbitrariu. Și, tot vizual: overlay-ul reconstruiește o dată la
30 de cadre și costă ~19 µs pe celulă scanată; dacă simți un hopa când e pornit, spune-mi — am
măsurătoarea, dar nu pot judeca cum se simte.

## 10. Tavanul ferestrei de voxeli diferă între coloane vecine — se vede?

**Ce te uiți.** Sapă sau construiește **în sus**, până aproape de plafonul zonei de voxeli, peste o
graniță de chunk (una la fiecare 32 m). Un perete înalt care traversează granița.

**Cum arată bine.** Nu se vede nimic. **Cum arată rău:** peretele e tăiat de o linie invizibilă — pe
o parte a ei poți construi mai sus decât pe cealaltă, cu până la 18 m diferență.

**De ce nu pot eu.** E o judecată vizuală, și se manifestă numai la înălțime, unde încă nu s-a
construit nimic. Măsurat: `zBaseM` diferă pe **86,8%** dintre perechile de chunkuri vecine, în medie
**3,67 m**, maxim **18 m**. Jumătatea de jos a problemei e rezolvată în tăietura asta — stabilitatea
citește fereastra **coloanei**, nu a chunkului, deci ancora e corectă și aceeași cameră nu mai pierde
voxeli diferiți după cum cade pe o graniță. Tavanul nu e rezolvat: deasupra ferestrei chiar nu există
voxel și `setVoxel` refuză pe drept — dar refuzul cade pe cote diferite în coloane vecine. N-am
reparat fiindcă reparația e o decizie de arhitectură (fereastră globală vs. per coloană), nu un bug.

---

## 11. Ocluzia ambientală — cât de întunecate sunt colțurile?

**Ce te uiți.** Pornește viewerul (`Kinstead.cmd`) și privește terenul săpat din jurul așezării de la
20–40 m, din unghi, nu de sus: treptele de 1 m de lângă suprafețe plate, colțurile interioare ale unei
gropi, piciorul unui perete.

**Cum arată bine.** Colțurile se citesc ca adâncime: piciorul unei trepte e puțin mai închis decât
platoul ei, iar un colț interior, unde se întâlnesc trei fețe, e cel mai închis. **Cum arată rău, în
două feluri:** *prea tare* — muchiile arată murdare, ca un contur negru, iar piatra deschisă se face
gri în colțuri; *prea slab* — terenul săpat arată plat, iar treptele se citesc doar din lumină.

**Ce e numărul.** `AO_FACTOR = [0.52, 0.70, 0.86, 1.0]` în `src/render/palette.ts`: câtă culoare
păstrează un vârf după câți vecini îl acoperă (trei, doi, unul, niciunul). Colțul cel mai închis
păstrează **52%**.

**De ce nu pot eu.** E singurul număr din arcul de grafică ieșit dintr-o judecată vizuală, nu dintr-o
măsurătoare. Tot restul — pe ce fețe se aplică, continuitatea peste granițele de chunk, ordinea
vârfurilor — e probat de suita `render`. Dar „cât de închis" n-are o valoare corectă de găsit prin
măsurare.

**În același cadru, un lucru înrudit.** Terenul de departe (nepromovat) nu primește ocluzie deloc, deci
zona promovată e în medie cu **4,3%** mai închisă. E sub variația naturală a terenului (~8,7%), dar
granița e o linie dreaptă. Dacă o vezi, spune — reparația e un arc întreg, nu o constantă.

**Dacă răspunsul e „prea tare" sau „prea slab":** spune doar direcția; schimb eu și refac cadrul. Iar
dacă e greu de judecat fără o comparație, spune și pun o tastă care comută între trei scale pe loc.

---

## 12. Grinda — se citește regula, și sunt cifrele pe care le voiai?

*(Rescris după recenzia adversarială din 26.09: versiunea dinainte descria greșit regula pe
verticală, dădea o cifră de piatră falsă, promitea un overlay de „4 ms pe cadru" și avea pași care
nu se puteau urma în viewer.)*

**Ce te uiți — pașii, în viewer.** Pornește slice view-ul (**Q**/**E**) pe nivelul unde vrei podeaua.
1. **Shift+click** ridică un zid de 2–3 niveluri și primele 2 celule ale unei fâșii care iese din el,
   la nivelul podelei. *(Shift+click zidește pe loc, din nimic — e unealta de test.)*
2. **P** de patru ori (rândul „piesa" din HUD spune **grinda**), apoi **click** pe fața celulei a
   doua: grinda se desenează în celula de aer din fața ei, a treia de la zid.
3. **Alt+click** pe o rocă oarecare: săpătura lasă un morman de 20 de piatră, cât costă grinda. Un
   pion vine și o zidește (câteva zeci de secunde).
4. **Shift+click** mai departe pe fâșie, celulă cu celulă. Se oprește la a **12-a**; a 13-a e
   refuzată, iar rândul „loc" din HUD spune de ce: *cea mai apropiată grindă activă e la 10 pași prin
   solid; ține cel mult 9*.
5. **P** până când HUD-ul spune **podea**, apoi **click** pe fața ultimei celule: a 13-a se desenează, iar cu **S** pornit apare
   în **violet** („nu se poate zidi") imediat, fără să aștepte scanarea.
6. Sapă grinda (**Alt+click** pe ea) și uită-te ce cade.

**Regula, pe scurt** (în `content/rules.json`: `suportMax` 4, `suportRazaGrinda` 10). O grindă e
*activă* dacă e ea însăși ținută de ceva așezat, prin cel mult 3 celule. O grindă activă ține tot ce e
legat de ea prin cel mult 9 celule de solid **pe același nivel** — o grindă pusă *sub* o podea n-o
ține (drumul se numără la cota piesei). Grinzile **nu se țin una pe alta**: una ținută doar de altă
grindă stă, dar nu ține nimic.

**Cum arată bine.** Cifrele, măsurate pe codul livrat:
- fâșia din zid: **3** celule fără grindă, **12** cu o grindă la x = 3;
- o sală: **6×6** fără grinzi, **23×23** cu 4 grinzi (toate cele 529 de celule ale podelei stau);
- o placă peste un singur stâlp: **25** de celule fără grindă, **181** cu una pusă pe stâlp, **313** cu
  patru la 3 pași de el.

Grinda costă **20 de piatră, cât podeaua pe care o înlocuiește** — deci o sală cu grinzi nu costă nicio
piatră în plus, doar muncă (500 față de 300 pe piesă, +800 pentru 4 grinzi). Asta o face mai „magică"
decât părea: dacă vrei ca grinda să coste, e o decizie de conținut.

**„De ce nu?" are cinci răspunsuri**, și toate măsoară pe drumul prin solid, nu pe Manhattan: *nu
atinge nimic solid* · *grinda de la N pași ar ține, dar nu e prinsă de nimic așezat* · *cea mai
apropiată grindă activă e la N pași; ține cel mult 9* · *grinda din rază nu e legată de piesă prin
solid* · *nimic așezat aproape și nicio grindă legată*. **Cum arată rău:** grinda pare magică sau
inutilă, ori un răspuns „De ce nu?" nu se înțelege.

**Patru decizii care sunt ale tale:**
1. **Contra-intuiția regulii.** O grindă ține cel mai mult când e la **marginea** razei de sol (3
   celule de zid), nu lipită de zid. Alternativa: `s1 = 10 − d0(grindă) − d1` — raza se numără de la
   zid, grinda din zid e cea mai tare (cel mult 9 de la zid). Mai intuitivă și mai zgârcită.
2. **Grinda sub podea.** Azi nu ține podeaua de deasupra (regula e pe nivel). E poziția intuitivă
   pentru o grindă; o regulă care o acceptă e o schimbare de design, nu de cod.
3. **Grinda de lemn.** Se poate fără cod: materialul rămâne GRINDA, iar în `content/rules.json` se
   schimbă ce dă la săpat și deci ce costă — `digYield.GRINDA = {fel: LEMN, cantitate: 5}` și
   `piese.GRINDA.cantitate = 5`. O piesă GRINDA din alt material e refuzată la încărcare (ar fi arătat
   ca o grindă și n-ar fi ținut nimic).
4. **Grinzi în tavanele de rocă** nu se pot pune din interior: locul de lucru e la cel mult un pas pe
   verticală. Secvența care merge: galerie deasupra, grinzile puse de acolo, apoi lărgești dedesubt.

**De ce nu pot eu.** Regula e probată: un oracol prin forță brută, independent de cod, pe 3.200 de
configurații ale recenziei (1,39 milioane de celule, 28.917 săpături, 20.279 de previzualizări pe mai
multe săpături) și pe testele din repo; zeci de probe de mutație. Dar dacă cifrele fac jocul
interesant și dacă omul înțelege regula privind ecranul nu se măsoară din cod. **Și un lucru pe care
îl vei simți:** lângă grinzi, scanarea overlay-ului **S** e scumpă — o celulă costă 4–20 ms, deci cât
ține o trecere (3–6 s într-o sală cu grinzi) cadrele au 8–25 ms de lucru: o sacadare, nu un îngheț.
O trecere terminată nu se mai reia cât timp terenul nu se schimbă. Leacul întreg — calculul pe
câmpuri, ~30–47 ms pe o trecere, exact doar pe un nivel — e în registru; spune dacă sacadarea
contează.
