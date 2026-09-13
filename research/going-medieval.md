# going-medieval — Going Medieval (Foxy Voxel), demontat mecanica cu mecanica: teren vertical, settleri, temperatura, productie, asedii, progresie, receptie si istoric de productie

## Rezumat

Going Medieval a stat in Early Access de la 1 iunie 2021 pana la 1.0 in martie 2026, cu o echipa de circa 10 oameni din Novi Sad, 16 update-uri majore si 87 de devblog-uri saptamanale; deci circa 50 de om-ani pentru un colony sim vertical. Asta e reperul de scara pentru un dezvoltator solo. Sistemele care fac jocul special sunt surprinzator de ieftine: stabilitatea e un intreg mic (4 la sol, minus 1 per pas de departare), iar temperatura nu se simuleaza pe tile, ci pe CAMERA, camerele incalzindu-se reciproc prin izolatia podelei. Conservarea hranei e un singur prag (sub 5 grade Celsius nu putrezeste), si din acel prag rezulta emergent toata arhitectura de pivnita pentru care jocul e laudat. In schimb, sistemele scumpe sunt exact cele pe care le-au reparat cinci ani: pathfinding-ul 3D multi-agent (rescris in 2022 cu A star, penalitati pe nod si regiuni de 420 de noduri) si programarea job-urilor, pe care studioul le declara si azi, dupa 1.0, drept problema numarul unu. Raidurile au fost salvate de o idee arhitecturala, nu de mai multa AI: un Commander AI unic per raid emite ordine (construieste scari, sparge poarta, sapa prin munte), iar unitatile devin agenti independenti doar cand sunt atacate. Receptia e buna dar in scadere: 88 la suta din 8.668 recenzii in general, dar doar 78 la suta din 119 in ultimele 30 de zile. Reclamatiile constante nu tin de simulare, ci de NAVIGARE si de FRECARE: camera care sare intre straturi, micromanagementul fara comenzi in masa, si un endgame cu trei obiective care se incheie, in cuvintele jucatorilor, in tacere. Performanta se degradeaza raportat de la 6-8 settleri pe configuratii slabe, oficial ar trebui sa tina 10-15, iar la 17 plus pe harti mari apar cazuri de circa 5 FPS. Concluzia pentru planul de productie: copiaza modelele de simulare pe CAMERA si pe INTREGI MICI, si nu porni de la un pathfinder 3D naiv.

## Constatări (31)

### Stabilitatea structurala e un singur intreg mic, nu o simulare fizica

- **Detaliu:** Structurile asezate pe sol pornesc cu stabilitate 4. Fiecare structura atasata pierde 1 punct pe masura ce se departeaza de punctul de sprijin. Exemplu dat de dezvoltatori: un zid plus o podea pe el iti permite inca 3 podele adiacente. Apa subterana poate reduce neasteptat stabilitatea unei structuri de deasupra. Grinzile de lemn (deblocate de prima cercetare, Architecture) reintroduc puncte de sprijin; regula practica din comunitate e maximum 3 tile-uri nesustinute de la orice zid sau grinda. In 2026 au adaugat un vizualizator care deseneaza cifra 0-4 direct in lume, implementat ca markeri orientati spre camera care indexeaza regiuni dintr-o SINGURA textura, ca sa nu creeze cate un element de UI pentru fiecare numar.
- **Sursă:** https://foxyvoxel.io/2026/05/25/mmt78/ si https://foxyvoxel.io/2026/07/09/quality-of-life-update/ · încredere: ridicat
- **Implicație:** Implementeaza stabilitatea ca propagare de intreg mic (BFS de la sursele de sprijin, valoare maxima 4-5), verificata in O(1) la plasare. NU simula forte. Si livreaza vizualizatorul numeric ODATA cu regula, nu doi ani mai tarziu: la Foxy Voxel absenta lui a fost reclamata ani intregi, sistemul aratand doar un mesaj de eroare la esec.

### Pathfinding-ul e A star pe grila cu penalitati pe nod, accelerat prin regiuni de 420 de noduri si agenti diferentiati

- **Detaliu:** Sistemul vechi era foarte scump pe CPU pentru ca lua in calcul fiecare celula si penalitatea ei la fiecare calcul, si producea mers in zig-zag pe diagonala. Rescrierea din 2022 introduce agenti: settlerii si negustorii evita capcanele si prefera podelele construite, inamicii si animalele salbatice trec prin capcane si ignora rutele optimizate pentru oameni. Penalitatile de nod publicate: tufis 3000, sol 1000, podea 250. Optimizarea ierarhica imparte harta in regiuni de cate 420 de noduri, iar pathfinder-ul ia in calcul doar regiunile necesare, nu harta completa.
- **Sursă:** https://foxyvoxel.io/2022/03/14/mmt18/ · încredere: ridicat
- **Implicație:** Proiecteaza de la inceput doua straturi: un graf de regiuni (portaluri intre chunk-uri, inclusiv pe verticala) peste A star local. Costul pe tile trebuie sa fie un camp de date per-agent (o masca de tip agent), nu cod ramificat. Bugetul: recalcularea regiunilor la fiecare sapare/constructie e operatia critica, nu cautarea in sine.

### Conservarea hranei e un singur prag, 5 grade Celsius, si din el rezulta toata arhitectura de pivnita

- **Detaliu:** Sub 5 grade Celsius hrana nu putrezeste deloc. Peste, viteza creste cu temperatura. Masuratori facute de comunitate in joc: 23,9 grade (camp deschis) - 2 zile pana la putrezire; 11,5 grade (afara, ploaie) - 4 zile; 19,4 grade (casa de lemn) - 5 zile; 7,2 grade (subteran) - 20 de zile; 4,4 grade si -1,8 grade (subteran adanc) - niciodata. Rafturile de depozitare se deblocheaza prin cercetarea Preserving Food.
- **Sursă:** https://steamcommunity.com/sharedfiles/filedetails/?id=2506438750 si https://eip.gg/going-medieval/guides/how-to-stop-food-from-spoiling/ · încredere: mediu
- **Implicație:** Un singur prag, nu o curba complicata, e suficient ca sa nasca un intreg comportament de constructie. Codifica spoilage ca rata continua cu prag dur, si expune NUMARUL (grade si zile ramase) in tooltip, pentru ca jucatorii sa poata experimenta. Neliniaritatea (7,2 grade = 20 de zile vs 11,5 grade = 4 zile) e ceea ce face sapatul in plus sa merite.

### Temperatura NU e simulata pe tile, ci pe CAMERA, cu propagare intre camere prin izolatia podelei

- **Detaliu:** Sistemul vechi avea doar doua categorii, interior si exterior, si distribuia o valoare mediana a surselor de caldura uniform in toata camera. Refactorizarea din 2023 face ca incaperile sa se incalzeasca reciproc in functie de continut: o bucatarie cu cuptor si torte incalzeste dormitorul de deasupra daca podeaua dintre ele are izolatie mica. TOT emite caldura: mobilier, cladiri, animale, settleri. Dezvoltatorii citeaza explicit practica medievala de a tine vitele in camera de sub locuinta. Iarna e mai aspra pe hartile de munte decat pe cele de vale. Exista overlay de temperatura.
- **Sursă:** https://foxyvoxel.io/2022/11/21/mmt29/ (productie) si https://foxyvoxel.io/2023/05/01/mmt35/ (temperatura) · încredere: ridicat
- **Implicație:** Modeleaza temperatura ca graf de camere (noduri = volume inchise detectate prin flood fill, muchii = pereti/podele cu coeficient de izolatie), rezolvat la un tick rar (o data pe ora de joc). Costul scaleaza cu numarul de CAMERE, nu de voxeli. Asta e cea mai buna afacere pret/efect din tot jocul si trebuie copiata prima.

### Ce conteaza pentru racire e ce se afla DEASUPRA camerei, nu adancimea absoluta, iar podelele construite incalzesc

- **Detaliu:** Ghidul cel mai detaliat din comunitate insista ca factorul determinant e stratul de deasupra: un strat gros de pamant izoleaza mai bine decat o podea de lemn. Podelele de lemn subterane genereaza caldura (efect care nu apare la suprafata), iar indepartarea podelei inutile scade temperatura camerei cu cateva grade. Camerele mari se racesc mai bine decat cele mici (in cele mici caldura ramane captiva), iar extinderea pe ORIZONTALA raceste mai eficient decat pe verticala, care mediaza temperatura intre etaje. O camera la doua niveluri sub sol ajunge la circa 4 grade cand la suprafata sunt 22,5. O usa langa scarile de acces coboara sensibil temperatura de dedesubt. Blocurile de gheata duc camera la circa 2 grade.
- **Sursă:** https://steamcommunity.com/sharedfiles/filedetails/?id=2506438750 si https://eip.gg/going-medieval/guides/how-to-stop-food-from-spoiling/ · încredere: mediu
- **Implicație:** Regula de aur de copiat: izolatia e o proprietate a SUPRAFETEI care delimiteaza camera, iar materialele construite au izolatie mai proasta decat pamantul nederanjat. Asta pedepseste constructia lenesa si recompenseaza sapatul, exact inversul intuitiei uzuale. Atentie: efectul contra-intuitiv (podeaua de lemn incalzeste) e si sursa celor mai multe fire de forum confuze; are nevoie de feedback vizual explicit.

### Blocurile de gheata sunt si unealta de racire, si marfa sezoniera

- **Detaliu:** O cladire de productie fabrica blocuri de gheata cand temperatura ambientala e sub zero. Blocurile se pun in camera ca sa o raceasca, dar se pot si vinde negustorilor, cu valoare sezoniera: aproape fara valoare iarna, mult mai scumpe vara.
- **Sursă:** https://foxyvoxel.io/2021/11/29/mmt11/ · încredere: ridicat
- **Implicație:** Un obiect cu DOUA meserii (unealta de sistem si marfa cu pret sezonier) e mai ieftin decat doua sisteme separate si creeaza singur o decizie economica: consum sau vand. Tipar de reutilizat pentru orice resursa produsa doar intr-un anotimp.

### Raidurile sunt conduse de un Commander AI unic, nu de N agenti care gandesc identic

- **Detaliu:** Problema vechiului sistem: fiecare inamic era un ganditor individual, toti ajungeau la acelasi obiectiv si se blocau unul pe altul stand pe loc. Commander AI e un proces care acceseaza harta, pathfind-uieste catre obiectiv si, cand intalneste obstacole, distribuie ordine diferite in functie de compozitia grupului de raideri SI a asezarii: asalt direct pe zid, construirea de scari, fortarea portilor, sau sapare prin munte daca raiderii au tarnacoape si pathfinding-ul spune ca e optim. In timp ce unii construiesc scari sau sapa, altii ii acopera. Un inamic atacat direct iese din ordinul comandantului si redevine actor independent.
- **Sursă:** https://foxyvoxel.io/2025/02/17/mmt59/ · încredere: ridicat
- **Implicație:** Separa strategia de executie: UN planificator per raid face un singur pathfind scump si emite ordine; unitatile ruleaza o masina de stare ieftina. Castigi simultan lizibilitate tactica si CPU. Conditia de intoarcere la comportament individual (fiind atacat) e ce impiedica armata sa para teleghidata.

### Ordinea de implementare a sistemelor de asediu e o dependenta dura, recunoscuta public de dezvoltatori

- **Detaliu:** Cand au introdus portile si portcullis-urile (2024), au amanat explicit podurile mobile spunand ca au nevoie ca inamicii sa stie sa construiasca, sa sape si sa escaladeze ziduri INAINTE de a integra asa ceva. Portile existente au o limitare grosolana: pot fi setate doar pe mereu deschis sau blocat, iar inchiderea manuala de catre un settler ia timp, ceea ce transforma planificarea apararii intr-o problema de logistica.
- **Sursă:** https://foxyvoxel.io/2024/07/29/mmt49/ · încredere: ridicat
- **Implicație:** Nu livra elemente defensive care presupun o AI inamica pe care nu ai construit-o. Ordinea corecta: mai intai capabilitatile inamicului (sapa, urca, sparge), apoi contramasurile jucatorului. Invers, produci fortificatii care par sa functioneze doar pentru ca inamicul e prost.

### Armele de asediu au esuat ca design: sunt letale, AI-ul le abandoneaza, iar jocul ofera o bifa de dezactivare

- **Detaliu:** Trebusetele distrug orice structura dintr-o singura lovitura si ucid pe oricine e inauntru, dar AI-ul inamic prefera lupta directa si le abandoneaza rapid pentru melee. O recenzie negativa foarte votata noteaza ca optiunea ca inamicii sa foloseasca arme de asediu e o bifa chiar in fata in setari, pentru ca nu s-au simtit niciodata bine.
- **Sursă:** https://screenrant.com/survive-raids-guide-going-medieval/ si https://steamcommunity.com/app/1029780/negativereviews/?browsefilter=toprated · încredere: mediu
- **Implicație:** O mecanica al carei rezultat e binar (structura distrusa intr-o lovitura) nu poate fi echilibrata prin frecventa. Daca faci arme de asediu, fa-le sa produca BRESE (distrug un segment, deschid o cale), nu anihilare. Si trateaza bifa de dezactivare din setari drept ce este: marturia ca sistemul nu a fost salvat.

### Voxelul NU e exclusiv pentru unitati, si asta anuleaza sensul tactic al fortificatiilor

- **Detaliu:** Din recenziile negative cele mai votate: mai multi settleri pot ocupa acelasi voxel, ceea ce face punctele de strangulare ineficiente; comanda Stand Ground se dezactiveaza singura cand inamicii se apropie; jucatorii se plang ca sunt impinsi intr-un singur stil de joc, kiting in jurul turnurilor de arcasi, in loc de aparare variata. Merlonii protejeaza arcasii doar probabilistic si nu blocheaza deplasarea in melee.
- **Sursă:** https://steamcommunity.com/app/1029780/negativereviews/?browsefilter=toprated · încredere: mediu
- **Implicație:** Decide devreme daca o celula e ocupabila exclusiv. Daca jocul tau vinde constructia de fortificatii, ocuparea exclusiva a celulei este mecanica de baza, nu detaliu: fara ea, zidul si coridorul devin decor. E o decizie care nu se poate schimba tarziu fara sa rescrii combatul si pathfinding-ul.

### Sistemul de prioritati de munca are o capcana de design recunoscuta: un job care nu e pe lista nimanui nu se face NICIODATA

- **Detaliu:** Settlerii aleg intotdeauna job-ul cu prioritatea cea mai mare pe care il pot gasi. Numere mici inseamna prioritate mare; la egalitate se decide de la stanga la dreapta in tabel. Daca un settler are abilitate foarte joasa la un job, e mai bine sa i-l dezactivezi complet, altfel exista sansa sa il ia si sa esueze.
- **Sursă:** https://eip.gg/going-medieval/guides/settlers/ si rezumatul wiki-ului Going Medieval (Job, Schedule) · încredere: mediu
- **Implicație:** Matricea de prioritati e lizibila dar are un mod de esec tacut. Adauga o garda: daca o categorie de job are 0 settleri asignati si exista munca in asteptare de peste X ore, ridica o alerta in UI. E cateva ore de munca si taie cel mai frecvent fir de suport.

### Programul e pe 24 de sloturi orare cu patru tipuri, plus un al cincilea pentru roluri

- **Detaliu:** Fiecare settler are 24 de sloturi configurabile: Sleep, Work, Leisure, Anything. Nevoile urgente (mancat, dormit) intrerup programul. In 2024 au adaugat tipul de ora Role Duties, ca settlerii cu rol sa isi prioritizeze sarcina de rol in intervalul desemnat. Recomandarea de baza din ghiduri: 2 ore leisure, 6 ore somn, restul munca.
- **Sursă:** https://foxyvoxel.io/2024/04/29/mmt45/ si https://eip.gg/going-medieval/guides/settlers/ · încredere: ridicat
- **Implicație:** Programul pe 24 de sloturi e ieftin de implementat si da jucatorului parghia de care are nevoie ca sa nu micromanageze nevoile. Dar fiecare tip nou de ora e o coloana noua in UI: pastreaza tipurile la 4-5 maximum si rezolva restul prin prioritati, nu prin orar.

### Preferintele de job au si polaritate NEGATIVA, iar rolurile le costa pe cele pozitive

- **Detaliu:** Peste stelele pozitive (o stea galbena Eager, doua Passion) au adaugat preferinte negative: o stea rosie Unwilling, doua Resentful, care reduc castigul de XP si aduc modificatori negativi de dispozitie. Rolurile implementate sunt Bard (ridica moralul la evenimente ca ospetele), Chaplain (calmeaza settlerii care intra in capela) si Druid (echivalentul pentru settlerii pagani), cate unul singur pe asezare, cu conditii de eligibilitate. Asumarea unui rol face settlerul fericit, dar il face sa PIARDA preferinte de job; un bard poate ajunge sa deteste caratul. Scoaterea rolului produce tristete si modificatori negativi.
- **Sursă:** https://foxyvoxel.io/2024/04/29/mmt45/ · încredere: ridicat
- **Implicație:** Preferintele negative sunt mai ieftine decat trasaturile de caracter si produc acelasi efect: settleri care nu sunt interschimbabili. Iar cuplarea rol-pierdere de preferinta e tiparul corect de cost: rolul nu se plateste in resurse, se plateste in FLEXIBILITATE. Copiaza structura, nu lista de roluri.

### Starile de dispozitie sunt o masina de stare cu numere publicate, recalibrata agresiv dupa 1.0

- **Detaliu:** La mood 0 settlerul paraseste asezarea. Patch-ul 1.1.7 a modificat exact: durata starii Rebellious 18 ore -> 6 ore; durata Merry 12 ore -> 24 ore; viteza de schimbare a dispozitiei 2 pe ora -> 8 pe ora; pragul de activare 15% -> 20%. Modificatori rebalansati: uncomfortable de la -2 la -6, very uncomfortable de la -4 la -10, cadavre de la -10 la -50, oase de la -30 la -45. Statisticile de start: entertainment si religion de la circa 75% la circa 50%, confort de la circa 50% la circa 10%. In acelasi patch viteza de constructie a fost scazuta cu circa 50%, abilitatile mici fiind afectate mai tare.
- **Sursă:** https://foxyvoxel.io/2026/07/09/quality-of-life-update/ · încredere: ridicat
- **Implicație:** Scoate TOATE aceste valori intr-un fisier de configurare incarcat la rulare, de la primul commit. Foxy Voxel a schimbat 12 constante intr-un singur patch la patru luni dupa 1.0; daca sunt in cod, fiecare iteratie de balans costa un build. Si observa directia: au facut starile pozitive de 4 ori mai lungi decat cele negative, adica au ales sa reduca spirala de nefericire, nu sa o faca mai realista.

### Rata de knock-out scaleaza invers cu marimea coloniei, ca amortizor anti-spirala

- **Detaliu:** In patch-ul 1.1.7: la 1-3 settleri, 100% dintre loviturile fatale devin knock-out; la 20 sau mai multi settleri, 0%. Tot atunci: raiderii infranti fura resurse si settleri care nu sunt in War chests sau in zone imprejmuite, iar draftarea e dezactivata temporar cand raiderii pleaca dupa infrangere.
- **Sursă:** https://foxyvoxel.io/2026/07/09/quality-of-life-update/ · încredere: ridicat
- **Implicație:** Asta e cel mai elegant amortizor din tot jocul: letalitatea e o functie de dimensiunea coloniei, nu o constanta de dificultate. O colonie mica nu poate fi stearsa de o singura tura proasta, una mare plateste pretul intreg. Copiaza formula exact si expune-o ca panta configurabila, nu ca doua praguri.

### Job-urile de constructie, demolare si minerit au primit un planificator de POZITIE, inspirat dintr-un mod de RimWorld

- **Detaliu:** Problema: settlerii executau ordinele intr-o secventa care ii bloca sau ii inchidea in perimetre proprii, iar complexitatea crestea cu marimea hartii si numarul de settleri. Solutia: sistemul calculeaza pozitia de lucru care nu afecteaza celelalte ordine; settlerii prefera job-urile care NU blocheaza, si le iau pe cele blocante doar cand nu mai raman altele; se evita crearea de regiuni inchise; la demolare, fundatiile se distrug inaintea zidurilor, in cascada. Dezvoltatorii precizeaza ca sistemul tot nu e perfect.
- **Sursă:** https://foxyvoxel.io/2025/10/06/mmt67/ · încredere: ridicat
- **Implicație:** Un job de constructie nu e o tinta, e o pereche (tinta, pozitie de lucru valida). Alegerea pozitiei trebuie sa consulte graful de regiuni al pathfinder-ului si sa respinga pozitiile care ar deconecta o regiune. Planifica asta de la inceput; retrofitat, a durat pana in al cincilea an de dezvoltare.

### Arhitectura cladirilor a fost rescrisa din mostenire in componente descrise prin JSON

- **Detaliu:** Sistemul vechi avea o clasa-parinte BaseBuildableObject din care mostenea totul, cu instante separate pentru cladiri si mobilier; orice tip nou de obiect cerea extinderea clasei parinte, adaugand cod accesibil din toate clasele derivate. Noul sistem: un singur BaseBuildingRepository.json care stocheaza definitiile de cladiri FARA functionalitate, plus componente separate (BedComponent, ProductionComponent, DoorComponent), fiecare tip de componenta cu propriul fisier JSON. Refactorizarea nu a stricat salvarile si a fost motivata si de modding.
- **Sursă:** https://foxyvoxel.io/2024/08/12/mmt50/ · încredere: ridicat
- **Implicație:** Porneste direct cu definitii de cladiri ca DATE (JSON) plus componente, nu cu ierarhie de clase. Pentru cineva cu experienta TypeScript asta e teren cunoscut, si e singura structura care iti permite sa adaugi al 40-lea banc de lucru fara sa atingi cod. Bonus: deschide modding-ul gratis.

### Productia se comanda cu moduri de repetare si un flux explicit de carat dupa terminare

- **Detaliu:** Cladirile de productie accepta modul Until you have X, care opreste automat productia cand se atinge cantitatea tinta. Refactorizarea din 2022: settlerii isi umplu intai capacitatea de inventar cu lemn INAINTE sa care spre depozite sau bancuri, in loc sa care bucata cu bucata; dupa ce termina productia la un banc cu hauling activat, iau imediat rezultatul si il duc la depozit. Prioritatile intrerup acum sarcini in desfasurare. Update-ul a RESETAT toate comenzile de productie existente ale jucatorilor. Cercetarea cere resursa Chronicles, fabricata la Basic Research Table; de exemplu Agriculture cere cel putin 15. Depozitul implicit are minimum 6x6, iar obiectele marcate Forbidden nu sunt folosite pana la permitere manuala.
- **Sursă:** https://foxyvoxel.io/2022/11/21/mmt29/ si https://eip.gg/going-medieval/guides/beginners-guide/ · încredere: mediu
- **Implicație:** Trei lucruri de copiat exact: (1) modul Until you have X ca implicit, nu ca optiune ascunsa; (2) capacitatea de inventar care face caratul in loturi, altfel numarul de drumuri explodeaza si cu el costul de pathfinding; (3) cercetarea platita cu un OBIECT fabricat, nu cu puncte abstracte, ca sa lege progresia de lantul de productie si de hrana.

### Scarile verticale sunt elemente voxel folosite si de inamici, cu reguli de adiacenta stricte

- **Detaliu:** Scarile permit deplasarea intre straturi si sunt folosite de settleri, raideri, pisici, sobolani si dihori. Se pot stivui si construi langa podele, ziduri, usi, ferestre. Pe scara se poate: livra material, construi, ridica resurse, lupta, incuia usi, alimenta cladiri. Restrictii: nu se pot pune ziduri, acoperisuri sau podele deasupra lor, nu se pot pune sub grinzi, nu exista deplasare laterala, si sunt accesibile doar din fata (5 pozitii apropiate), niciodata din spate. In lupta pe scara: settlerii trec unii prin altii dar nu pe langa raideri, armele cu o mana sunt mai bune decat cele cu doua maini, scuturile se echipeaza pe spate si blocheaza sageti.
- **Sursă:** https://foxyvoxel.io/2023/04/03/mmt33/ · încredere: ridicat
- **Implicație:** Fiecare element de traversare verticala e simultan o muchie in graful de navigatie SI o suprafata de lupta cu reguli proprii. Numara asta in buget: o scara nu e o piesa de mobilier, e un caz special in pathfinding, in combat, in constructie si in plasare. Limiteaza-te la doua tipuri (rampa si scara verticala) si defineste de la inceput cine le poate folosi.

### Optimizarea reala a fost contabilitate de memorie si de evenimente, nu algoritmi exotici

- **Detaliu:** Simptome: incarcarea jocului peste 2 minute, peste 40 de secunde in editorul Unity pana la meniul principal. Cauze identificate cu Unity Profiler, Project Auditor si JetBrains Profiler: cod fundational prost structurat cu sisteme interconectate, prea mult garbage temporar care producea sughituri, event listeners care ramaneau in memorie mai mult decat trebuia, procesare ineficienta de string-uri. Remedii: inlocuirea uneltelor fistichii cu alternative simple, accelerarea buclelor care ruleaza de mii de ori pe secunda, curatarea sistemului de evenimente de mesaje inutile, si inlocuirea detectiei de vizibilitate prin flood fill cu monitorizarea doar a ce INTRA si IESE din raza de perceptie. Rezultat: editorul a ajuns la 5-10 secunde. Problema e CPU, nu GPU.
- **Sursă:** https://foxyvoxel.io/2025/06/02/mmt62/ · încredere: ridicat
- **Implicație:** Trei reguli practice: (1) nicio alocare in bucla de tick; (2) sistemul de evenimente sa fie punct-la-punct, nu broadcast, altfel devine el insusi bugetul; (3) inlocuieste orice recalculare pe zona cu urmarirea diferentelor la frontiera. Si masoara cu profiler de la inceput, nu cand incepe sa doara.

### Pragul de performanta raportat: degradare de la 6-8 settleri in cazuri slabe, tinta oficiala 10-15, colaps la 17 plus pe harti mari

- **Detaliu:** Din firul de discutie cel mai votat pe tema: degradare raportata la 6-8 pawns si la 8-10 pawns de mai multi utilizatori; un jucator raporteaza lag dupa 8 ore de joc cu doar 4 pawns. Dezvoltatorul afirma ca jocul ar trebui sa tina 10-15 settleri fara probleme pe hardware adecvat, neaga ca ruleaza pe un singur nucleu si atribuie lag-ul de final de joc task-urilor. Masuratori: GTX 1050 Ti la 1920x1080 cu grafica maxima si circa 12 settleri da 30 si ceva FPS; alte rapoarte 20-30 FPS pe setari minime; cazuri de circa 5 FPS la 17 plus settleri pe harti mari. Jocul revine la 165 FPS cand e pus pe pauza sau cand settlerii nu se misca, ceea ce indica agentii, nu randarea.
- **Sursă:** https://steamcommunity.com/app/1029780/discussions/0/3055112595734909559/ · încredere: mediu
- **Implicație:** Fixeaza tinta de scara ca CERINTA masurata, nu ca speranta: de exemplu 30 de agenti la 60 FPS pe un laptop de gama medie, cu un benchmark automat rulat la fiecare commit. Faptul ca jocul face 165 FPS pe pauza spune ca bugetul e in AI si job-uri; deci bugeteaza timpul per tick pe agent si taie prin planificare amanata, nu prin randare.

### Receptia e buna in ansamblu dar in SCADERE dupa 1.0

- **Detaliu:** Steam: Very Positive, 88% din 8.668 recenzii in general, dar Mostly Positive, 78% din 119 recenzii in ultimele 30 de zile. Metacritic 76, OpenCritic 83% recomandare din doar 6 recenzii. Pret 29,99 euro. Early Access 1 iunie 2021.
- **Sursă:** https://store.steampowered.com/app/1029780/Going_Medieval/ si https://en.wikipedia.org/wiki/Going_Medieval · încredere: ridicat
- **Implicație:** Un decalaj de 10 puncte intre scorul general si cel recent, dupa lansarea 1.0, e semnalul ca asteptarile la 1.0 sunt alta categorie decat cele din Early Access. Daca lansezi in Early Access, planifica bugetul de QoL si de endgame INAINTE de 1.0, nu dupa.

### Endgame-ul e trei obiective care se incheie in tacere si pot fi atinse in trei ani de joc

- **Detaliu:** Exista trei evenimente de final: University, Trade Hub si Religious Pilgrimage. Jucatorul alege unul, apar niste NPC-uri in vizita, si scenariul se incheie (jocul continua fara obiective). Reclamatii concrete: universitatea nu are sali de clasa sau camine si nimeni nu beneficiaza de ea; hub-ul comercial nu genereaza venit si negustorii nu tranzactioneaza efectiv; situl religios nu are mecanici de pelerinaj; nu se pot rula doua evenimente simultan desi nu se contrazic; un jucator a atins finalul in anul 1356 dintr-un joc care incepe in 1353; finalul nu e marcat de niciun ospat sau comentariu, trece in tacere literala.
- **Sursă:** https://steamcommunity.com/app/1029780/discussions/0/800093196998909895/ · încredere: mediu
- **Implicație:** Un obiectiv de final care nu schimba nicio regula de simulare nu e endgame, e un ecran de victorie. Daca faci obiective de final, fiecare trebuie sa DESCHIDA un sistem (universitatea sa produca settleri cu abilitati mari, hub-ul sa schimbe tabelul de negustori). Altfel platesti pentru continut si primesti zero retentie.

### Cele mai constante reclamatii nu sunt despre simulare, ci despre NAVIGARE si FRECARE

- **Detaliu:** Din recenziile negative cele mai votate. Straturi si camera: camera sare involuntar in pivnita, suprapunerile transparente ascund vizibilitatea, navigarea intre etaje cere derulare obositoare cu rotita. Micromanagement: atribuirea hainelor individual pe sezon, restrictii manuale de plantare toamna si iarna, pozitionare de lupta unul cate unul, gestionarea tarcurilor de animale descrisa drept iad pe pamant. Lipsesc: comenzi in masa, cozi de job-uri, coordonare automata a sarcinilor, si functia de reparare la starea initiala dupa distrugere. Comportamentul settlerilor: sapa gauri in jurul lor si raman blocati, si abandoneaza sarcini prioritare (recolteaza, apoi taie un copac in celalalt capat al hartii fara sa ia lemnul, apoi mineaza un bloc, apoi se intorc la recoltat).
- **Sursă:** https://steamcommunity.com/app/1029780/negativereviews/?browsefilter=toprated · încredere: mediu
- **Implicație:** Bugeteaza de la inceput un STRAT DE AUTOMATIZARE (comenzi in masa, sabloane de echipament pe sezon, cozi de constructie, reconstruieste-cum-a-fost) si un mod de camera pe straturi cu selectie explicita a nivelului. Aceste doua lucruri decid mai mult din nota decat oricare sistem de simulare nou.

### Istoricul de productie: circa 5 ani, 16 update-uri majore, 87 devblog-uri, echipa de circa 10 oameni

- **Detaliu:** Early Access 1 iunie 2021. Echipa lucreaza la proiect de la sfarsitul lui 2018. Foxy Voxel e o echipa de zece oameni din Novi Sad; jocul e cel mai de succes joc PC sarbesc, cu peste un milion de copii vandute. La 1.0 anuntau 16 update-uri majore si 75 de Medieval Monday Talks; in septembrie 2026 ajunsesera la numarul 87. Dupa 1.0 au continuat cu patch-uri dese: 1.1.2 pana la 1.1.19 intre sfarsitul lui iunie si mijlocul lui august 2026, cu ramura experimentala separata.
- **Sursă:** https://en.wikipedia.org/wiki/Going_Medieval, https://sga.rs/en/news/going-medieval-the-most-successful-serbian-pc-game-is-now-fully-available/, https://foxyvoxel.io/news/ · încredere: mediu
- **Implicație:** Raportul de scara e brutal: circa 50 de om-ani. Pentru un solo asta inseamna ca lista de sisteme trebuie taiata la o treime si ca fiecare sistem pastrat trebuie sa aiba versiunea ieftina identificata dinainte (camera in loc de tile, intreg mic in loc de fizica, un comandant in loc de N creiere). Modelul de livrare merita copiat integral: ramura experimentala publica plus patch-uri saptamanale plus un devblog regulat.

### Contradictie intre surse pe data de lansare 1.0 si pe cifra de un milion

- **Detaliu:** Anuntul oficial de pe foxyvoxel.io si presa din februarie 2026 dau 12 martie 2026 ca data de lansare 1.0; Wikipedia si pagina de magazin Steam dau 17 martie 2026. Separat: un comunicat de presa titreaza un milion de unitati vandute in Early Access, in timp ce anuntul dezvoltatorului vorbeste despre peste un milion de wishlist-uri pe Steam. Nu am reusit sa reconciliez niciuna dintre cele doua perechi din surse primare.
- **Sursă:** https://foxyvoxel.io/2026/02/25/release-date-announcement/ vs https://en.wikipedia.org/wiki/Going_Medieval si https://store.steampowered.com/app/1029780/Going_Medieval/ · încredere: scazut
- **Implicație:** Daca cifrele astea intra in planul de afaceri (comparatii de vanzari, estimari de conversie wishlist-vanzare), verifica-le independent inainte. Data probabil corecta e 17 martie (amanare de 5 zile fata de anunt), dar nu am dovada.

### Numerele de XP pentru abilitati NU sunt confirmate

- **Detaliu:** Un rezumat de cautare atribuie wiki-ului valorile 350 XP pentru nivelul 1, crescand pana la 8000 XP pentru nivelul 50, si afirma ca preferintele de job modifica atat castigul de XP cat si modificatorii de dispozitie. Nu am putut deschide pagina de wiki (Fandom returneaza 402 la acces automat), deci nu am verificat.
- **Sursă:** memorie/rezumat de cautare, pagina Fandom Settlers inaccesibila · încredere: scazut
- **Implicație:** Trateaza scara 350-8000 doar ca ordin de marime: circa 23 de ori mai mult XP pentru ultimul nivel decat pentru primul, pe 50 de niveluri. Daca vrei o curba concreta, proiecteaza-o singur; nu importa aceste numere ca fapt.

### Raspunsul la scalarea fortei de munca e forta de munca TEMPORARA, nu populatie mai mare

- **Detaliu:** In august 2026 au anuntat Hired Hands: grupuri de NPC apar periodic si ofera servicii temporare; negociezi cu liderul, platesti in monede de aur si ii angajezi pe durata limitata. Exista muncitori (minerit, constructie, strans resurse), luptatori (lupta, vanatoare, escorta de caravane) si tipuri hibride. Angajatii au nevoi proprii: loc de dormit, mancare, loc de rugaciune, loc de relaxare, iar echipamentul lor se degradeaza. Exista si mercenari legati de o locatie (tabere de banditi, ambuscade) pentru o singura batalie. Disponibilitatea variaza dupa anotimp si pozitie pe harta lumii. Motivatia declarata: proiectele mari intind settlerii prea subtire, plus nevoia de a da o utilizare reala monedelor de aur.
- **Sursă:** https://foxyvoxel.io/2026/08/31/mmt86/ · încredere: ridicat
- **Implicație:** Asta rezolva DOUA probleme cu un sistem: varfurile de munca si inflatia de bani. Si e compatibil cu un buget de simulare fix: forta de munca creste temporar fara sa creasca permanent numarul de agenti simulati. Daca ai un plafon dur de agenti, angajatii temporari sunt calea corecta de a-l respecta si de a-l face sa para o alegere.

### Idle-ul a fost reincadrat ca activitate de agrement, nu ca semnal de eroare

- **Detaliu:** Inainte, settlerii fara sarcini stateau pe loc cu animatie minima. Update-ul din 2026 adauga: se sprijina de ziduri, se odihnesc pe scaune, vorbesc intre ei, se aseaza pe jos, mangaie animale (bonus de dispozitie si de socializare). NPC-urile fac la fel: negustorii stau langa taraba, garzile lor se sprijina de ziduri sau folosesc mobilierul apropiat, NPC-urile din sali comune se aseaza. Obiectivul declarat e comportament de tip Sims si reincadrarea inactivitatii drept forma de agrement, nu semnal de neglijenta.
- **Sursă:** https://foxyvoxel.io/2026/06/22/mmt81/ si https://foxyvoxel.io/2026/07/09/quality-of-life-update/ · încredere: ridicat
- **Implicație:** Un set de 5-6 animatii de idle ancorate de mobilier schimba perceptia de calitate mai mult decat orice sistem de simulare in plus, si costa mult mai putin. Pentru un dezvoltator fara echipa de arta asta e argumentul de a investi in ANIMATIE de idle inainte de modele noi.

### Terraforming-ul e legat de o resursa minata si respecta aceleasi reguli de stabilitate

- **Detaliu:** Ridicarea terenului consuma dirt obtinut prin minerit; solul stancos da mai putin dirt decat pamantul obisnuit. Se pot crea atat pante de pamant cat si teren plat, si ambele respecta regulile de stabilitate ale jocului. Pamantul nou creat e apt pentru culturi.
- **Sursă:** https://foxyvoxel.io/2022/10/17/mmt27/ · încredere: ridicat
- **Implicație:** Conservarea masei (sapi ca sa ridici) leaga terraforming-ul de economie si il impiedica sa devina unealta gratuita de aplatizare a hartii. Si faptul ca terenul construit intra in ACELASI sistem de stabilitate ca zidurile inseamna un singur rezolvator, nu doua: proiecteaza stabilitatea ca proprietate a celulei, indiferent daca e roca, pamant sau perete.

### Apa e un sistem transversal care atinge stabilitatea si cladirile

- **Detaliu:** Devblogurile din 2023 acopera apa in trei episoade (Wet Interactions, Shape of Water, Point of Impact, Damp Challenges): apa interactioneaza cu cladirile si cu structurile de productie si produce efecte de umezeala. Separat, postarea despre stabilitate din 2026 noteaza ca apa subterana poate reduce neasteptat stabilitatea, obligand jucatorul sa inspecteze nivelurile inferioare.
- **Sursă:** https://foxyvoxel.io/2023/09/18/mmt39/ si https://foxyvoxel.io/2026/05/25/mmt78/ · încredere: mediu
- **Implicație:** Apa e sistemul cu cel mai prost raport valoare/cost dintre toate: atinge stabilitatea, temperatura, agricultura, pathfinding-ul si randarea. Pentru solo: amana apa dinamica complet. Daca vrei apa, fa-o STATICA (nivel de panza freatica pe harta, care modifica stabilitatea si temperatura), fara curgere.

## Implicații de design

- Simuleaza pe CAMERE, nu pe celule. Temperatura, calitatea aerului, frumusetea si apartenenta la incapere pot fi toate rezolvate pe un graf de camere detectate prin flood fill, la un tick rar. Costul scaleaza cu numarul de incaperi (zeci), nu de voxeli (milioane). Asta e cea mai buna lectie tehnica din tot Going Medieval.
- Stabilitatea se modeleaza ca intreg mic care se propaga si scade cu 1 pe pas (baza 4 la sol). Se verifica in O(1) la plasare, e explicabila intr-o propozitie, si acopera in acelasi rezolvator roca, pamantul terraformat si zidurile construite. Livreaza vizualizatorul numeric in aceeasi sarcina cu regula.
- Conservarea hranei = un singur prag de temperatura (5 grade) plus o rata care creste neliniar peste el. Din atat rezulta pivnita, sapatul, blocurile de gheata, ciclul sezonier al foamei si jumatate din arhitectura bazei. Cel mai mare efect emergent pe cel mai mic cod.
- Un planificator unic per grup ostil (Commander AI) care emite ordine catre agenti cu masini de stare ieftine. Rezolva simultan lizibilitatea tactica si bugetul de CPU. Regula de intoarcere la comportament individual: unitatea atacata direct iese din ordin.
- Pathfinding in doua straturi de la primul commit: graf de regiuni/portaluri (inclusiv muchii verticale pentru scari si rampe) peste A star local, cu cost per tile ca DATE indexate pe tipul de agent. Nu incepe cu A star naiv pe grila 3D, pentru ca nu se poate retrofita.
- Un job de constructie e perechea (tinta, pozitie de lucru), nu doar tinta. Alegerea pozitiei trebuie sa consulte graful de regiuni si sa respinga pozitiile care ar inchide o regiune sau ar bloca alte ordine. La Foxy Voxel asta a venit in anul cinci si tot e cea mai citata problema.
- Definitiile de cladiri si obiecte ca DATE (JSON) plus componente, niciodata ca ierarhie de clase. Pentru cineva cu profil TypeScript e teren cunoscut si deschide modding-ul fara efort suplimentar.
- TOATE constantele de balans (praguri de dispozitie, durate de stari, modificatori, rate de knock-out, viteze de constructie) intr-un fisier de configurare incarcat la rulare, de la inceput. Foxy Voxel a schimbat 12 dintre ele intr-un singur patch la 4 luni dupa 1.0.
- Letalitatea ca functie de marimea coloniei, nu ca constanta de dificultate (100% knock-out la 1-3 settleri, 0% la 20 plus). Cel mai ieftin amortizor anti-spirala din joc.
- Decide DEVREME daca o celula e ocupabila exclusiv de o unitate. Daca jocul vinde fortificatii, exclusivitatea e mecanica de baza; fara ea, coridorul si poarta devin decor. Nu se poate schimba tarziu fara sa rescrii combatul si pathfinding-ul.
- Bugeteaza de la inceput un strat de automatizare: comenzi in masa, sabloane de echipament pe sezon, cozi de constructie, reconstruieste-cum-a-fost, si o alerta cand o categorie de munca nu e asignata nimanui. Frecarea, nu adancimea simularii, domina recenziile negative.
- Camera pe straturi verticale cu selectie EXPLICITA a nivelului si fara sarituri automate. E cea mai repetata reclamatie de uzabilitate din tot jocul si e o problema de UI, nu de simulare.
- Obiectivele de final trebuie sa DESCHIDA un sistem, nu sa afiseze un ecran. Un endgame care nu schimba nicio regula de simulare nu produce retentie, indiferent cat continut ii pui in spate.
- Forta de munca temporara platita (mercenari, zilieri) ca supapa pentru varfurile de munca, in locul cresterii populatiei permanente. Iti respecta plafonul de agenti simulati si transforma limita tehnica intr-o alegere de joc.
- 5-6 animatii de idle ancorate de mobilier (sprijinit de zid, asezat langa foc, mangaiat animalul, vorbit) schimba perceptia de calitate mai mult decat orice sistem nou, si costa cel mai putin pentru cineva fara echipa de arta.

## Riscuri

- Pathfinding 3D multi-agent e groapa fara fund: un studio de 10 oameni l-a rescris in 2022, l-a reoptimizat in 2025, i-a rescris ordonarea job-urilor in 2025, si dupa 1.0 in 2026 il declara in continuare problema numarul unu, cu formularea ca nu exista o solutie unica pentru toate cazurile limita. Semnal de alarma: prima data cand scrii cod care cauta o pozitie de lucru libera in jurul unei tinte.
- Colapsul de performanta apare la un numar de agenti DUREROS de mic. Rapoarte de degradare de la 6-8 settleri, tinta oficiala doar 10-15, cazuri de circa 5 FPS la 17 plus pe harti mari, cu jocul revenind la 165 FPS pe pauza. Semnal de alarma: cand FPS-ul depinde de numarul de agenti in miscare si nu de ce e pe ecran, bugetul e in AI si nu se rezolva prin optimizare de randare.
- Navigarea prin verticalitate poate anula valoarea verticalitatii. Camera care sare in pivnita, suprapunerile transparente si derularea cu rotita apar in recenziile negative mai des decat orice bug de simulare. Semnal de alarma: daca la testare te prinzi ca eviti sa construiesti la mai multe niveluri pentru ca e enervant de privit, jucatorul va face la fel.
- Datoria de micromanagement se acumuleaza invizibil: fiecare sistem nou (haine, culturi, animale, echipament, tarcuri) naste o cerere de comenzi in masa, iar Going Medieval a platit factura abia in 1.1, dupa 1.0. Semnal de alarma: al doilea sistem in care jucatorul trebuie sa dea acelasi ordin de mai multe ori la rand.
- Continutul de endgame e cel mai prost raport efort/retentie. Trei obiective de final, dupa cinci ani de dezvoltare, sunt descrise de jucatori ca trecand in tacere, atinse uneori in trei ani de joc dintr-o campanie, cu recunoasterea ca dupa aceea nu mai exista motiv sa construiesti. Semnal de alarma: cand un obiectiv de final nu schimba nicio regula de simulare.
- Armele de asediu si distrugerea structurilor sunt greu de echilibrat pana la nefunctionare. Trebusetele distrug orice dintr-o lovitura, AI-ul le abandoneaza pentru melee, iar jocul ofera o bifa de dezactivare chiar in fata in setari. Semnal de alarma: cand mecanica ta are rezultat binar, nu o poti echilibra prin frecventa.
- Apa e sistemul cu cel mai prost raport valoare/cost: atinge stabilitatea, temperatura, agricultura, pathfinding-ul si randarea deodata, si a consumat patru devbloguri in 2023. Semnal de alarma: momentul in care iti spui ca ar fi frumos sa curga.
- Dependentele intre sisteme de asediu se rasuca invers: Foxy Voxel a amanat public podurile mobile pana cand inamicii au invatat sa construiasca, sa sape si sa escaladeze. Semnal de alarma: livrezi un element defensiv care pare sa functioneze doar pentru ca AI-ul inamic nu stie sa il ocoleasca.
- Decizia despre ocuparea exclusiva a celulei e ireversibila tarziu. In Going Medieval mai multi settleri incap in acelasi voxel, ceea ce a distrus valoarea tactica a punctelor de strangulare si a impins jucatorii intr-un singur stil de joc. Semnal de alarma: primul test de aparare in care coridorul de 1 tile nu incetineste inamicul.
- Prapastia de asteptari intre Early Access si 1.0 e masurabila: 88 la suta in general fata de 78 la suta in ultimele 30 de zile dupa lansarea completa. Semnal de alarma: planifici sa lasi QoL-ul si endgame-ul pentru dupa 1.0.

## Întrebări deschise

- Cate niveluri verticale (z-levels) are efectiv o harta de Going Medieval, si cat de adanc se poate sapa? Nu am gasit numarul in nicio sursa primara, desi e cifra care determina direct costul de memorie si de randare pentru un clon.
- Cum e stocat concret terenul: chunk-uri de voxeli, sau straturi 2D stivuite cu tip de material per celula? Devblogurile vorbesc despre elemente voxel dar nu descriu structura de date. Diferenta schimba complet bugetul de meshing si de salvare.
- Cum se face meshing-ul si randarea terenului taiat pe niveluri, si cat costa re-meshing-ul la fiecare bloc sapat? E probabil cel mai mare cost ascuns intr-un clon si nu exista nicio sursa publica despre el.
- Care e formula exacta de propagare a temperaturii intre camere: valori de izolatie per material, frecventa de tick, si cum se calculeaza contributia surselor de caldura si a settlerilor/animalelor? Devblogurile descriu principiul dar nu dau nicio constanta.
- Care e lista completa de nevoi ale settlerilor si valorile lor de scadere pe ora? Am doar dispozitia, confortul, divertismentul si religia mentionate; nu am gasit tabelul complet.
- Cum functioneaza concret sistemul de sanatate: rani pe parti ale corpului, sangerare, infectie, boli, ingrijire, cicatrici, moarte? Este singura zona din brief pe care nu am putut-o documenta din surse primare (paginile de wiki Fandom returneaza 402 la acces automat).
- Cate tehnologii are arborele de cercetare, pe cate ramuri si tiere, si care e curba de cost in Chronicles? Am confirmat doar mecanismul (Chronicles fabricate la Basic Research Table, 15 pentru Agriculture) si doua nume de cercetari (Architecture, Preserving Food).
- Cum se scaleaza raidurile: formula de putere in functie de populatie, avere, zi de joc, si daca exista un storyteller ca in RimWorld sau un simplu cronometru? Sursele spun doar ca raidurile escaladeaza cu cresterea asezarii si ca exista circa o ora de joc de pregatire inainte de sarja.
- Cat costa efectiv o zi de joc la 10, 20 si 30 de settleri, defalcat pe pathfinding, job scheduling, temperatura si randare? Fara profilul asta, orice tinta de performanta pentru un clon e o presupunere.
- Care e structura reala a echipei de 10 oameni (cati programatori, cati artisti, cati pe design si comunitate)? Raportul conteaza mai mult decat numarul total pentru estimarea unui proiect solo.
- Data exacta a lansarii 1.0 (12 vs 17 martie 2026) si cifra reala de vanzari (un milion de unitati vs un milion de wishlist-uri) raman neconfirmate.
- Exista un plafon dur de populatie codificat in joc, sau doar unul practic impus de performanta? Rapoartele sugereaza doar degradare treptata, nu o limita.

## Recomandări

- CELE 3 SISTEME DE COPIAT CA IDEE. Unu: temperatura pe graf de CAMERE cu propagare prin izolatia suprafetelor, plus un prag unic de conservare a hranei (sub 5 grade). Costa putin (zeci de noduri, tick rar) si produce singur pivnita, sapatul, gheata, foamea sezoniera si jumatate din arhitectura bazei. Doi: stabilitatea ca intreg mic propagat (4 la sol, minus 1 pe pas), cu vizualizator numeric livrat odata cu regula. Verificare O(1), regula explicabila intr-o propozitie, acelasi rezolvator pentru roca, pamant terraformat si ziduri. Trei: Commander AI, un singur planificator per grup ostil care emite ordine (sparge poarta, ridica scari, sapa prin munte), cu agenti pe masini de stare ieftine si intoarcere la comportament individual cand sunt atacati direct.
- CELE 3 CAPCANE DE PRODUCTIE PENTRU SOLO. Unu: pathfinding 3D multi-agent plus programarea job-urilor. Cinci ani si patru rescrieri intr-un studio de 10 oameni, si tot e problema declarata numarul unu dupa 1.0. Nu porni de la A star naiv pe grila 3D; daca nu ai ierarhie de regiuni si pozitii de lucru validate din prima zi, vei rescrie tot. Doi: camera si UI-ul pentru straturi verticale. Reclamatia cea mai constanta din recenziile negative nu e simularea, e navigarea prin ea; e o problema de UI care poate anula complet valoarea feature-ului tau principal. Trei: datoria de QoL si micromanagement. Fiecare sistem nou naste o cerere de comenzi in masa; Going Medieval a platit factura abia dupa 1.0 si a pierdut 10 puncte de scor recent. Bugeteaza stratul de automatizare ca sistem de sine statator, nu ca lustruire finala.
- Fixeaza un plafon dur de agenti simulati ca cerinta de produs (propunere: 30 de agenti la 60 FPS pe laptop de gama medie) si scrie un benchmark automat care il verifica la fiecare commit. Foxy Voxel a descoperit pragul din reclamatii, nu din masuratori, si dupa 1.0 tot nu il pot promite peste 10-15.
- Proiecteaza forta de munca temporara (zilieri, mercenari platiti cu bani) ca supapa pentru varfurile de munca, ca sa poti respecta plafonul de agenti permanenti fara ca jucatorul sa simta o limita arbitrara. Foxy Voxel a ajuns la solutia asta abia in august 2026.
- Pune toate constantele de balans intr-un fisier de configurare incarcat la rulare inca din primul sprint, si adauga un panou de debug care le editeaza live. Patch-ul 1.1.7 al lui Going Medieval a modificat 12 valori de dispozitie deodata; tu vei face acelasi lucru de zeci de ori.
- Decide in prima saptamana daca celula e ocupabila exclusiv. Daca vinzi fortificatii, raspunsul e da, si atunci combatul, pathfinding-ul si impingerea unitatilor se proiecteaza in jurul acestei reguli. E singura decizie din lista care nu se poate schimba tarziu.
- Amana complet apa dinamica. Daca vrei apa, implementeaza o panza freatica STATICA pe harta care modifica stabilitatea si temperatura la sapare. Primesti decizia interesanta (sapi prea adanc, pierzi stabilitate si castigi frig) fara simularea de fluid.
- Copiaza modelul de livrare, nu doar mecanicile: ramura experimentala publica, patch-uri saptamanale numerotate, si un devblog regulat cu detalii tehnice. Foxy Voxel a scris 87 de devbloguri si acelea sunt, masurabil, motorul comunitatii care le-a dus jocul la un milion de unitati.
- Proiecteaza obiectivele de final astfel incat fiecare sa deschida un sistem de simulare (universitatea genereaza settleri cu abilitati inalte, hub-ul comercial schimba tabelul de negustori si preturile, situl de pelerinaj aduce un flux de vizitatori cu nevoi). Un ecran de victorie nu e endgame.
- Investeste in 5-6 animatii de idle ancorate de mobilier inainte de orice model nou. E cea mai mare crestere de calitate perceputa pe unitate de efort artistic pentru cineva care lucreaza singur, si a fost livrata de Foxy Voxel abia in 2026 ca imbunatatire vizibila.
- Verifica independent cifrele comerciale inainte sa le folosesti in planul de afaceri: sursele se contrazic intre un milion de UNITATI vandute si un milion de WISHLIST-uri, si intre 12 si 17 martie 2026 ca data de lansare 1.0.

