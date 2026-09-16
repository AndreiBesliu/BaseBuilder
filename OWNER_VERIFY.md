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

**Cum arată bine.** Fișierul există și nu conține `INVALID`.

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
