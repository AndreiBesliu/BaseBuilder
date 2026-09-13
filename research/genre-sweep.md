# genre-sweep — Maparea spațiului de design al genului base-building / colony sim / open world / strategy, prin comparație între 12+ jocuri de referință — cu accent pe prețul tehnic plătit de fiecare și pe ce poate duce realist un dezvoltator solo

## Rezumat

Genul nu se diferențiază prin „feature-uri", ci prin ce anume alege fiecare joc să simuleze la nivel de tile și ce alege să simuleze la nivel de agent — iar cele două costuri sunt aproape ortogonale. Dwarf Fortress și Oxygen Not Included plătesc pentru simularea per-celulă (fluide, temperatură, gaze) și ajung amândouă limitate de un singur fir de execuție; DF chiar declară că peste 60% din timpul de procesare într-o fortăreață mare e consumat de agenți care își iau tura, din care sub 10% e pathfinding — deci costul real e AI-ul de agent, nu A*. Songs of Syx demonstrează opusul: cu pathfinding ierarhic pe grilă 8×8 → 16×16 → 32×32 → dimensiunea hărții și căi pre-cache-uite între clustere, un singur om în Java duce zeci de mii de cetățeni simulați individual și până la 50.000 de unități în bătălie — cu prețul acceptat explicit al „căilor ciudate". Timberborn arată tiparul cel mai valoros pentru un solo: apa NU e simulare 3D, ci un model 2D de „țevi virtuale" (o adâncime per tile, nivelare între vecini) care rulează pe tick la câteva sute de milisecunde, complet decuplat de randare — iar înotul castorilor a fost adăugat pentru că pathfinding-ul făcea lag spikes la inundații, adică o mecanică de gameplay născută dintr-o constrângere tehnică. Pe partea de producție, cifrele sunt brutal de clare: Banished = 5.500+ ore solo pe ~30 de luni, Kenshi = 12 ani (5-7 singur, cu job de noapte), Ostriv = din 2014 și încă în alpha, Manor Lords = ~7 ani solo dar cu 9 dezvoltatori + QLOC DUPĂ succes. Piața a învățat două lecții repetate: (a) toate city-builder-ele „pure" mor de plictiseală în late-game — critica standard la Banished („fără endgame, dificultatea scade pe măsură ce populația crește") e identică cu cea la Manor Lords zece ani mai târziu; (b) Against the Storm a rezolvat exact asta cu o buclă dublă de roguelite — rulare de 30 min–3 ore, Resource Points care EXPIRĂ la Blightstorm ca să prevină „ore de plictiseală și grind", Progression Points care persistă. Frostpunk arată că presiunea morală se poate transforma în sistem cu doar două contoare independente (speranță + nemulțumire) plus o lege binară ireversibilă la fiecare 24 de ore de joc — dar plătește cu replayability zero, pentru că scenariile sunt scriptate. Pentru un dezvoltator solo fără echipă de artă, spațiul cel mai ieftin și cel mai puțin ocupat este: scară medie (sute, nu zeci de mii), verticalitate reală, un SINGUR sistem fizic profund propriu (nu trei), lume deschisă persistentă în stilul „world states" din Kenshi în loc de poveste scriptată, și o buclă de presiune ciclică în stil Against the Storm ca antidot la moartea prin plictiseală.

## Constatări (39)

### Dwarf Fortress: costul dominant nu e pathfinding-ul, ci agenții care își iau tura

- **Detaliu:** Wiki-ul oficial de optimizare afirmă că majoritatea covârșitoare a timpului de procesare e consumată de unități care își iau tura — peste 60% în fortărețe mari — din care mai puțin de 10% e efectiv legat de pathfinding. Restul e logica de nevoi, sarcini, inventar, gânduri.
- **Sursă:** https://dwarffortresswiki.org/index.php/DF2014:Maximizing_framerate · încredere: ridicat
- **Implicație:** NU investi primele luni în A* exotic. Bugetează profilarea pe bucla de decizie a agentului (nevoi → sarcină → rezervare) și proiectează-o din start cu buget de tick amortizat: fiecare agent se gândește o dată la N tick-uri, nu în fiecare tick.

### Dwarf Fortress nu e multithreaded în niciun mod semnificativ

- **Detaliu:** Wiki-ul afirmă direct: „DF is not multi-threaded in any significant way", motiv pentru care sfaturile de performanță ajung la prioritatea procesului și la oprirea indexării de fișiere (Spotlight consumă 60-70% CPU indexând salvările DF, recuperarea fiind de peste 30 FPS).
- **Sursă:** https://dwarffortresswiki.org/index.php/DF2014:Maximizing_framerate · încredere: ridicat
- **Implicație:** Decizia de arhitectură #1: separă de la primul commit `SimWorld` (date pure, fără referințe la render) de stratul de prezentare, și rulează simularea pe un thread propriu cu double-buffer pe snapshot. Retrofitarea threading-ului peste o simulare cu obiecte împletite cu randarea e practic imposibilă — DF e dovada vie.

### Temperatura per-tile e cel mai scump sistem opțional din DF: dezactivarea ei dublează framerate-ul

- **Detaliu:** Wiki-ul raportează „an FPS increase of 100% or better when disabling" calculele de temperatură. Fluidele sunt a doua sursă: fiecare actualizare de tile cascadează la vecini și pe z-levels; râurile naturale costă la intrare și la ieșire, iar după îndiguiri și pompe „it gets worse".
- **Sursă:** https://dwarffortresswiki.org/index.php/DF2014:Maximizing_framerate · încredere: ridicat
- **Implicație:** Alege UN SINGUR sistem fizic continuu per-tile (apă SAU temperatură SAU aer) ca semnătură a jocului. Două sisteme continue înseamnă că bugetul tău de CPU se împarte la doi înainte să ai vreun agent pe hartă. Fă-l de la început comutabil/reglabil în opțiuni — ca sistem de scalare a performanței, nu ca setare de debug.

### În DF, costul scalează cu complexitatea conectivității, nu cu volumul săpat

- **Detaliu:** Wiki-ul notează că numărul de z-levels săpate NU are efect semnificativ asupra vitezei — complexitatea pathfinding-ului contează, nu distanța pe verticală. În schimb, reducerea embark-ului de la 4×4 la 2×2 (25% din suprafață) are „an enormous impact". Creaturile care încearcă repetat să intre din caverne și ușile impasabile pentru animale generează pathfind-uri continue eșuate; holurile aglomerate forțează „dodging", adică și mai multe pathfind-uri.
- **Sursă:** https://dwarffortresswiki.org/index.php/DF2014:Maximizing_framerate · încredere: ridicat
- **Implicație:** Limitează SUPRAFAȚA hărții agresiv (verticalitatea e ieftină, întinderea e scumpă) și implementează de la început regiuni de conectivitate (connected components) actualizate incremental, ca o cerere de drum imposibilă să fie respinsă în O(1) în loc să declanșeze o căutare eșuată pe toată harta.

### Dwarf Fortress separă generarea lumii de simularea de joc: istoria e un joc de strategie cu zero jucători, rulat înainte de start

- **Detaliu:** Dimensiuni de lume: Pocket 17×17 până la Large 257×257 region tiles (fiecare region tile = 16×16 blocuri locale de 48×48 tile-uri; lumea maximă ≈ suprafața statului Minnesota). Istoria pre-generată: 5 / 125 / 250 / 550 / 1050 ani. Pe o lume Medium: 24 (Very Low) până la 80 (Very High) civilizații, 36 megabeasts + 74 semi-megabeasts + 18 titani, până la 2.000 de situri.
- **Sursă:** https://dwarffortresswiki.org/index.php/DF2014:World_generation · încredere: ridicat
- **Implicație:** Adâncimea narativă se cumpără OFFLINE, nu în runtime. Investește în worldgen + istorie simulată o singură dată la start (buget: câteva zeci de secunde), apoi citește din ea în timpul jocului. E cel mai bun raport profunzime/cost de CPU din tot genul și e perfect pentru un solo: cod, nu artă.

### Songs of Syx: un singur dezvoltator, în Java, duce zeci de mii de cetățeni simulați individual și până la 50.000 de unități în bătălie

- **Detaliu:** Pagina Steam afirmă „tens of thousands of individually simulated citizens and slaves", fiecare cu viață, religie, temeri și dorințe, și „up to 50,000 individual units" în bătălii. Dezvoltat de Jake (Gamatron AB) din 2015, în Early Access din 21 septembrie 2020, cerințe de sistem „Java 8 compliant".
- **Sursă:** https://store.steampowered.com/app/1162750/Songs_of_Syx/ · încredere: ridicat
- **Implicație:** Scara extremă NU cere C++ și nici ECS la modă — cere ca datele per-entitate să fie mici și omogene. Dacă vrei scară, proiectează cetățeanul ca indici în array-uri paralele (SoA), nu ca obiect cu 40 de câmpuri. Java a fost suficient; TypeScript în browser nu va fi — asta e argumentul decisiv pentru un limbaj nativ sau C#.

### Songs of Syx folosește pathfinding ierarhic pe grile suprapuse cu căi pre-cache-uite între clustere

- **Detaliu:** Dezvoltatorul, pe forumul Steam: „I've added levels to the grid, starting from 8x8 tiles, then 16x16, 32x32 ... map size x map size." Căile optime între clustere vecine sunt pre-calculate, permițând pathfinding la diferite niveluri de detaliu (LOD). Dezvoltatorul admite deschis că metoda produce „imperfect or weird paths" în funcție de configurație.
- **Sursă:** https://steamcommunity.com/app/1162750/discussions/3/3419934814481362952/ · încredere: ridicat
- **Implicație:** Copiază tiparul direct: grilă ierarhică cu factor 2 (8→16→32→…), căi între clustere cache-uite și invalidate doar la modificarea terenului în clusterul afectat. Și copiază compromisul: acceptă căi sub-optime. Un colonist care merge cu 10% ocol e invizibil pentru jucător; un joc care îngheață la 300 de coloniști nu e.

### Timberborn NU face simulare 3D de fluide — e un model 2D de „țevi virtuale", adaptat dintr-o lucrare academică

- **Detaliu:** Deep dive-ul dezvoltatorilor: fiecare tile e conectat la cei 4 vecini prin „virtual pipes" și are o valoare care reprezintă adâncimea apei; sistemul încearcă să niveleze aceste valori între vecini. Curentul (momentum) se calculează comparând cât s-a mutat între tick-uri. Au ales varianta 2D explicit pentru că „3D models are useful for modeling deep oceanic waters" — inutil pentru nevoile lor. Umezeala solului e un sistem SEPARAT, cu aceeași logică de revărsare, dar cu o scădere mult mai abruptă când tile-ul vecin e la elevație mai mare.
- **Sursă:** https://www.gamedeveloper.com/design/deep-dive-timberborn-s-water-mechanics · încredere: ridicat
- **Implicație:** Aceasta e rețeta ta pentru apă, dacă alegi apa ca sistem-semnătură: un float per coloană de tile + 4 conexiuni + nivelare iterativă. Se implementează într-o săptămână, nu într-un trimestru, și e determinist. NU porni de la Navier-Stokes, nici de la cellular automata cu presiune — Timberborn a vândut milioane cu modelul simplu.

### Timberborn rulează simularea apei la tick-uri de „câteva sute de milisecunde", decuplat de randare

- **Detaliu:** Dezvoltatorii descriu tick-uri „every couple hundred ms" (≈3-10 Hz) pentru calcule, în timp ce „visuals need to be rendered continuously" — deci o abordare hibridă cu interpolare vizuală peste stare discretă.
- **Sursă:** https://www.gamedeveloper.com/design/deep-dive-timberborn-s-water-mechanics · încredere: ridicat
- **Implicație:** Stabilește DOUĂ frecvențe de la început: sim tick fix (ex. 5 Hz pentru fluide/umiditate, 10 Hz pentru agenți) și render la 60 FPS cu interpolare. Asta îți dă și determinism pentru save/load și replay, și îți permite să rulezi simularea pe alt thread. E decizia care face diferența între „merge la 200 de agenți" și „merge la 2000".

### Timberborn a inventat o mecanică de gameplay (castorii înoată) ca soluție la o problemă de performanță

- **Detaliu:** Dezvoltatorii spun că pathfinding-ul fără înot producea „lag spikes" când apa acoperea zone mari din hartă, așa că au făcut castorii să înoate automat când drumurile sunt inundate.
- **Sursă:** https://www.gamedeveloper.com/design/deep-dive-timberborn-s-water-mechanics · încredere: ridicat
- **Implicație:** Regulă de lucru: când un sistem e prea scump, prima întrebare nu e „cum îl optimizez", ci „ce regulă de joc face problema să dispară". Ex.: dacă un colonist nu poate ajunge la destinație, nu recalcula pe toată harta — dă-i o stare „blocat/rătăcit" vizibilă jucătorului. Costul zero, plus feedback.

### Timberborn a lăsat intenționat exploit-uri în joc și a stins un perpetuum mobile cu un patch de o linie, nu cu rescrierea modelului

- **Detaliu:** Water dump-urile pe tile-uri dinamitate băteau clădirile de irigare intenționate — „needed to leave that as it was for the time being". Roțile de apă alimentate de apă pompată creau bucle infinite de energie; au adăugat „innate water resistance" roților ca să facă ideea „almost impossible". Au abandonat rescrierea completă a modelului pentru că era „very time-consuming" cu rezultate nesatisfăcătoare.
- **Sursă:** https://www.gamedeveloper.com/design/deep-dive-timberborn-s-water-mechanics · încredere: ridicat
- **Implicație:** Bugetează explicit „datorie de simulare acceptată". Într-un proiect solo, un exploit care nu strică distracția majorității e un non-bug. Scrie-le într-un fișier EXPLOITS_ACCEPTATE.md în loc să le repari — și adaugă frâne locale (rezistență, randament sub-unitar) în loc de reproiectări globale.

### Banished: 5.500+ ore de muncă solo, din august 2011 până pe 18 februarie 2014 — cod, artă ȘI audio de un singur om

- **Detaliu:** Dezvoltarea a început în august 2011 ca Shining Rock Software, proprietate individuală a lui Luke Hodorowicz, care avea în spate experiență de programator de motoare grafice și fizică în industria de console. A investit peste 5.500 de ore. Metacritic 73/100.
- **Sursă:** https://en.wikipedia.org/wiki/Banished_(video_game) · încredere: ridicat
- **Implicație:** Calibrarea ta de buget: ~5.500 ore ≈ 2,5 ani la 40h/săptămână, sau ~5 ani la 20h/săptămână, pentru un joc cu scop DELIBERAT MIC (o hartă, fără combat, fără verticalitate). Orice plan care adaugă lume deschisă + verticalitate + combat peste asta trebuie să taie altceva în mod egal, altfel devine un Kenshi de 12 ani.

### Banished a exclus combatul deliberat, inspirat de seria Anno — și a devenit celebru tocmai pentru asta

- **Detaliu:** Designerul a exclus intenționat combatul din versiunea de lansare, citând Anno ca inspirație. Pericolele sunt vremea aspră, incendiile, depresia, foametea și îmbătrânirea populației.
- **Sursă:** https://en.wikipedia.org/wiki/Banished_(video_game) · încredere: ridicat
- **Implicație:** Combatul e opțional în acest gen și e cel mai scump sistem raportat la valoarea percepută (animații, AI de luptă, balans, UI de comandă). Dacă tai combatul, trebuie să înlocuiești presiunea cu ALTCEVA măsurabil — la Banished: iarna, incendiul, piramida de vârstă. Asta e o decizie de luat în primele două săptămâni, nu în anul doi.

### Critica standard a genului, identică la 10 ani distanță: „fără endgame, dificultatea scade pe măsură ce populația crește"

- **Detaliu:** Banished (2014) a fost criticat pentru „no proper end game goal to keep players engaged", „lack of feedback for player actions" și scăderea dificultății odată cu creșterea populației. Manor Lords (2024) primește exact aceleași reproșuri: lipsă de provocare în endgame, lipsă de narativ, conținut consumat rapid, insuficiente motive de angajament pe termen lung.
- **Sursă:** https://en.wikipedia.org/wiki/Banished_(video_game) + https://en.wikipedia.org/wiki/Manor_Lords · încredere: ridicat
- **Implicație:** Nu e un bug de balans, e un defect STRUCTURAL al buclei „acumulare fără reset". Trebuie proiectat un mecanism anti-plateu ÎN documentul de design, nu adăugat ulterior: fie escaladare ciclică (Timberborn: secete tot mai lungi), fie reset parțial (Against the Storm), fie migrare/nomadism, fie o lume care se mișcă singură (Kenshi world states).

### Hodorowicz, după Banished: „Writing a game engine really needs a game to go with it. Otherwise I'm just guessing."

- **Detaliu:** El descrie că a încălcat KISS și YAGNI construind sisteme prea generice în izolare, ceea ce a cerut refacere substanțială când a ajuns la cerințele concrete ale jocului. Aproximativ 65% din codul Banished e reutilizat în proiectul următor. Motorul propriu genera terenuri procedurale de „giant 250sq km" cu eroziune simulată, munți, oceane, câmpii și râuri.
- **Sursă:** https://shiningrocksoftware.com/2018-09-19-new-stuff/ · încredere: ridicat
- **Implicație:** Nu construi „engine" înainte de „joc". Scrie vertical slice-ul cu cod urât și specific, apoi extrage. Și notează cifra: 65% reutilizare între două jocuri din același gen — deci investiția în motor propriu se amortizează DOAR dacă intenționezi al doilea joc.

### Manor Lords: „dezvoltator solo" e adevărat doar până la lansare — după succes, echipa a ajuns la 9 oameni plus QA extern (QLOC)

- **Detaliu:** Wikipedia descrie Slavic Magic ca dezvoltator solo (Grzegorz Styczeń), iar interviul Unreal descrie ~7 ani de muncă în mare parte singur. Dar articolele de la un an după lansare spun că echipa are 9 dezvoltatori plus ajutor QA de la QLOC. CONTRADICȚIE APARENTĂ pe care o semnalez explicit: ambele sunt adevărate, dar în momente diferite — narativul „un singur om a făcut Manor Lords" descrie faza de EA, nu starea actuală.
- **Sursă:** https://en.wikipedia.org/wiki/Manor_Lords + https://www.gamesradar.com/games/city-builder/i-remember-uploading-the-build-crossing-my-fingers-that-things-wouldnt-immediately-fall-apart-a-year-later-city-builder-mega-hit-manor-lords-has-a-bigger-dev-team-teasing-big-updates/ · încredere: ridicat
- **Implicație:** Nu folosi Manor Lords ca dovadă că un om poate întreține un joc de asemenea amploare. Planifică un punct de lansare pe care îl poți susține SINGUR post-lansare (patch-uri, suport, mod support), pentru că a angaja nu e garantat.

### Manor Lords a migrat de la Unreal Engine 4 la Unreal Engine 5 ÎN mijlocul Early Access, iar dezvoltatorul a avut nevoie de pauză după

- **Detaliu:** Migrarea a fost făcută între iunie 2024 și 22 august 2024. Presa a relatat imediat după că dezvoltatorul își ia o pauză binemeritată „amid its Unreal Engine 5 move".
- **Sursă:** https://en.wikipedia.org/wiki/Manor_Lords + https://www.gamesradar.com/games/city-builder/manor-lords-is-still-moving-forward-even-as-the-city-builders-creator-takes-a-well-deserved-minibreak-amid-its-unreal-engine-5-move/ · încredere: ridicat
- **Implicație:** Dacă alegi Unreal (ai deja C++/UE 5.7 din prototipul naval), PINEAZĂ versiunea majoră pentru toată durata dezvoltării și a primului an de EA. O migrare majoră de engine costă ~2-3 luni de om și nu produce nicio valoare vizibilă pentru jucător.

### Manor Lords: cererea de piață pentru genul ăsta e enormă — 3M+ wishlist-uri înainte de lansare, 1M copii în primul weekend, 3M până în februarie 2025

- **Detaliu:** Ținta inițială a fost de 14.000 de wishlist-uri; a ajuns la 2 milioane în ianuarie 2024 și peste 3 milioane la lansare, fiind cel mai wishlist-uit joc de pe Steam. Lansare EA: 26 aprilie 2024.
- **Sursă:** https://en.wikipedia.org/wiki/Manor_Lords · încredere: ridicat
- **Implicație:** Validare de piață: nu ai nevoie de un joc terminat ca să validezi. Construiește pagina Steam devreme și măsoară wishlist-urile ca semnal primar de go/no-go la 6 și 12 luni — e cel mai ieftin test de ipoteză din tot planul de producție.

### Manor Lords: „burgage plots" — jucătorul desenează zone, locuitorii construiesc; casele se extind cu anexe în curtea din spate

- **Detaliu:** Pagina Steam: construcție fără grilă, cu libertate totală de plasare și rotație; sistemul de burgage plots înseamnă „Assign areas for housing and watch your residents build" conform subdivizării istorice în funcție de drumuri și spațiu. Lanțuri de producție în mai multe etape, rute comerciale, degradare de mediu (migrarea cerbilor, scăderea fertilității solului, defrișare), regiuni multiple specializate.
- **Sursă:** https://store.steampowered.com/app/1363080/Manor_Lords/ · încredere: ridicat
- **Implicație:** „Zonă desenată + construcție emergentă" e superioară pentru un solo față de „clădiri plasate una câte una": reduce numărul de asset-uri unice necesare (o casă + N anexe combinatorii, în loc de 20 de clădiri distincte) și produce varietate vizuală gratuit. Adoptă acest tipar ca strategie de economisire de ARTĂ, nu doar de design.

### Foundation duce ideea mai departe: zero grilă + pictare de zone + monumente construite din module de jucător

- **Detaliu:** Foundation e „a grid-less, sprawling medieval city building simulation with a heavy focus on organic development, monument construction". Are un instrument de pictare prin care jucătorul definește zone pentru case, drumuri pavate, patrule, extracție forestieră. Monumentele (abații, biserici, castele) se construiesc din module cu un instrument proprietar bazat pe noduri, în loc să fie clădiri fixe plasate. Motor propriu, numit Hurricane. Early Access în 2019, versiunea 1.0 pe 31 ianuarie 2025 — deci ~6 ani în EA.
- **Sursă:** https://wiki.polymorph.games/foundation/Foundation + https://store.steampowered.com/app/690830/Foundation/ · încredere: ridicat
- **Implicație:** Constructorul modular de monumente e cea mai bună soluție cunoscută la problema „nu am echipă de artă": jucătorul devine artistul. 15-25 de module (ziduri, arce, turnuri, acoperișuri) generează mii de clădiri unice. Pune-l în FAZA 1 dacă vrei diferențiere vizuală ieftină — dar știi că e și un sistem de UI/gizmo costisitor, nu doar de mesh-uri.

### Against the Storm rezolvă explicit problema plictiselii din late-game printr-o buclă DUBLĂ de roguelite

- **Detaliu:** Devlog-ul Eremite: sistemul e „a compromise between the sense of rebuilding... and the design need for roguelite features". Stratul de City Builder e diferit la fiecare rulare; la câteva așezări construite, starea hărții lumii (dar nu progresul de cont) se resetează. Un Cycle = trecerea a trei anotimpuri de ploaie (Drizzle, Clearance, Storm). Numărătoarea inversă spre Blightstorm măsoară totalul de Cycles consumate pe toate așezările.
- **Sursă:** https://eremitegames.com/devlog-4-meta-progression-new-biome-and-more/ · încredere: ridicat
- **Implicație:** Adoptă ideea de „două straturi cu ritmuri diferite": un strat tactic care se resetează (așezarea/expediția) și un strat strategic care persistă (imperiul/cunoașterea). Rezolvă simultan trei probleme de solo dev: conținut infinit fără conținut scris, sesiuni scurte care cresc retenția, și scuză narativă pentru a NU simula o hartă uriașă simultan.

### Against the Storm face punctele de resursă să EXPIRE, ca să forțeze consumul și să prevină grind-ul

- **Detaliu:** Resource Points se câștigă în stratul de city builder și se cheltuie pe dezvoltarea Citadelei; dacă nu sunt cheltuite înainte de Blightstorm, se pierd definitiv. Progression Points, obținute în funcție de reputația câștigată, se acumulează spre Progression Level și deblochează upgrade-uri liniar. Motivul declarat: împiedică „many hours of boredom and grind, where nothing changes".
- **Sursă:** https://eremitegames.com/devlog-4-meta-progression-new-biome-and-more/ · încredere: ridicat
- **Implicație:** Două monede cu comportamente opuse (una perisabilă, una permanentă) e un tipar reutilizabil ieftin. Perisabila creează urgență și decizii; permanenta creează sentimentul de progres pe termen lung. Implementarea costă ~200 de linii; efectul asupra retenției e disproporționat.

### Against the Storm: rulare de 30 de minute până la 3 ore, cu 5 specii jucabile și 6 biomuri

- **Detaliu:** Fiecare rulare durează între 30 de minute și 3 ore, în funcție de dificultate și biom; rulările de tutorial sunt mai scurte, iar nivelurile mari de Prestige pot depăși 2 ore. Cinci specii (oameni, castori, șopârle, vulpi, harpii, plus broaște prin DLC), fiecare cu nevoi de locuire, preferințe culinare, lux și recreere diferite. Early Access 1 noiembrie 2022, lansare completă 8 decembrie 2023 — doar ~13 luni de EA.
- **Sursă:** https://store.steampowered.com/app/1336490/Against_the_Storm/ + https://www.switchbladegaming.com/strategy-games/against-the-storm/beginners-guide-21/ · încredere: ridicat
- **Implicație:** Țintește o sesiune de 45-90 de minute ca unitate de design, nu „o fortăreață eternă". Și notează contrastul: Against the Storm a stat 13 luni în EA, Foundation 6 ani, Timberborn 4,5 ani. Un scop strâns iese din EA de 5 ori mai repede.

### Kenshi: lume deschisă de 870 km², construită de un om în 12 ani, pe motorul OGRE

- **Detaliu:** Suprafață jucabilă de 870 km² (340 mile pătrate), doar pe Windows. Dezvoltarea a început în 2006-2008; Chris Hunt a lucrat singur 5-7 ani, cu un job de paznic de noapte pe salariul minim. Echipă mică din 2013, Early Access martie 2013, lansare completă 6 decembrie 2018. Kenshi 2 se face pe Unreal Engine.
- **Sursă:** https://en.wikipedia.org/wiki/Kenshi_(video_game) · încredere: ridicat
- **Implicație:** Lumea deschisă mare NU e imposibilă solo, dar costă un DECENIU dacă e umplută manual. Dacă vrei open world, obligatoriu procedural + streaming pe chunk-uri, cu poate 10-20 de locații autorate manual. Și: faptul că Kenshi 2 migrează pe Unreal e un vot împotriva motorului propriu la a doua iterație.

### Kenshi înlocuiește povestea scriptată cu un sistem de „world states" care reacționează la moartea figurilor importante

- **Detaliu:** Sistemul de world states creează reacții la moartea unor personaje notabile, putând genera locații noi sau muta controlul între facțiuni. Jocul se concentrează pe sandbox cu libertate totală în loc de poveste liniară. Mantra declarată a lui Hunt: se consideră inamicul jucătorului; „too many games let their players succeed" — pentru el „that's mind-numbingly boring".
- **Sursă:** https://en.wikipedia.org/wiki/Kenshi_(video_game) + https://www.pcgamer.com/games/survival-crafting/too-many-games-let-their-players-succeed-says-developer-of-notoriously-tough-survival-rpg-kenshi-and-thats-mind-numbingly-boring-to-me/ · încredere: ridicat
- **Implicație:** „World states" e cel mai ieftin sistem narativ existent pentru un solo: un set de flag-uri globale + reguli de tranziție între ele, zero dialog scris, zero cutscene. Proiectează-l ca o mașină de stări pe facțiuni și regiuni de la început — e imposibil de adăugat retroactiv peste o lume statică.

### Kenshi confirmă că genul are coadă lungă de vânzări: 1 milion de copii în 2020, 3 milioane până în mai 2026

- **Detaliu:** Vândut 1 milion în septembrie 2020 (mai puțin de 2 ani de la lansarea completă) și 3 milioane până în mai 2026. Metacritic 75/100, PC Gamer 84/100.
- **Sursă:** https://en.wikipedia.org/wiki/Kenshi_(video_game) · încredere: ridicat
- **Implicație:** Modelul financiar nu trebuie să presupună un vârf la lansare. Jocurile din gen vând ani întregi, deci investiția în mod support și în stabilitate pe termen lung (save compatibility!) are randament direct. Planifică formatul de save versionat din prima zi — e exact lecția pe care o ai deja din Warlord.

### Frostpunk transformă presiunea morală în sistem cu doar două contoare independente și o lege binară la fiecare 24 de ore de joc

- **Detaliu:** Două bare separate: speranță (hope) și nemulțumire (discontent) — pot fi ambele pline sau ambele goale, sunt influențate de lucruri diferite. La fiecare 24 de ore de joc poți semna o lege, de obicei situații „either/or"; odată aleasă o variantă, cealaltă e permanent inaccesibilă. Dezvoltatorii au ajuns la speranță după cercetare despre supraviețuirea în condiții extreme: „the most important thing was hope". Designul reflectă deliberat „creeping normality" — eroziuni etice incrementale care normalizează măsuri extreme.
- **Sursă:** https://www.gamedeveloper.com/design/frostpunk-an-analysis-of-emotional-narrative-engagement + https://www.pcgamer.com/frostpunk-developers-on-hope-misery-and-the-ultimately-terrifying-book-of-laws/ · încredere: ridicat
- **Implicație:** Copiază arhitectura, nu tema: DOUĂ contoare care nu sunt inversul unuia celuilalt (ex. „legitimitate" și „epuizare"), plus o decizie ireversibilă la interval fix. Ireversibilitatea e ce transformă un slider într-o poveste. Costul de implementare: mic. Costul de balans: mare — bugetează testare.

### Prețul plătit de Frostpunk: scenarii scriptate înseamnă zero emergență la a doua rulare

- **Detaliu:** Analiza de design constată că „on the second or third... playthrough the story is no longer emergent. The scouts you send out to discover the wasteland will always meet the same challenges, often with the same outcomes." Mai mult, apare un paradox nedorit: jucătorii care optimizează pentru supraviețuire trăiesc „the emotionless sense of beating a game over experiencing it", ceea ce subminează impactul etic intenționat.
- **Sursă:** https://www.gamedeveloper.com/design/frostpunk-an-analysis-of-emotional-narrative-engagement · încredere: ridicat
- **Implicație:** Dacă adopți presiunea morală, sursa dilemelor trebuie să fie PROCEDURALĂ (generată din starea simulării: cine a murit, cine e înfometat, ce facțiune e nemulțumită), nu un script. Altfel plătești costul de scriere narativă (scump pentru solo) și primești replayability zero în schimb.

### Oxygen Not Included separă simularea într-un DLL nativ propriu, rulat pe un al doilea thread, peste Unity

- **Detaliu:** SimDLL e o bibliotecă nativă pentru transfer de căldură, curgere de fluide și alte aspecte de simulare. Jocul folosește două thread-uri: unul pentru programul principal (duplicanți, creaturi, plante, clădiri) și unul pentru simulare (transfer termic, mișcarea fluidelor). Comunitatea identifică mișcarea gazelor și mișcarea temperaturii drept principalii vinovați de încetinire. Unity ca engine, Klei; EA 15 februarie 2017, lansare 30 iulie 2019.
- **Sursă:** https://en.wikipedia.org/wiki/Oxygen_Not_Included + https://forums.kleientertainment.com/forums/topic/167854-infrequent-features-of-simdll/ · încredere: ridicat
- **Implicație:** Tiparul „engine comercial pentru render/UI + modul nativ propriu pentru simulare" e exact potrivit pentru tine dacă mergi pe Unreal: gameplay-ul și fizica de tile într-un modul C++ fără dependențe de UE, comunicând prin buffere. Îți dă testabilitate headless (poți rula simularea în teste fără editor) — ceea ce, dat fiind că știi deja cât de mult minte Unreal-ul headless, e un avantaj direct.

### Oxygen Not Included scalează prin ADÂNCIME de sisteme, nu prin populație: începi cu 3 duplicanți

- **Detaliu:** Jocul pornește cu trei coloniști numiți duplicanți, fiecare cu statistici individuale care afectează eficiența sarcinilor și abilități care se dezvoltă prin practică. Complexitatea vine din gaze, lichide, temperatură, presiune, germeni și biomuri procedurale — nu din numărul de agenți.
- **Sursă:** https://en.wikipedia.org/wiki/Oxygen_Not_Included · încredere: ridicat
- **Implicație:** Există o cale legitimă de a face un colony sim profund cu 10-40 de agenți în loc de 10.000. Asta elimină complet problema de pathfinding la scară și îți permite să cheltui tot bugetul pe UN sistem fizic bogat. E strategia cu cel mai mic risc tehnic pentru un solo.

### Farthest Frontier: rotația culturilor pe 3 ani ca sistem tactic, nu ca decor

- **Detaliu:** Câmpurile funcționează pe o rotație de 3 ani, fiecare linie indicând ce culturi se plantează în ce ordine. Fiecare cultură schimbă fertilitatea: consumatorii mari (grâu, secară, praz, varză) o epuizează rapid; trifoiul, fasolea și mazărea o refac; compostul o completează. Câmpurile trebuie curățate de buruieni și pietre, iar plantarea aceleiași familii de culturi prea des invită bolile.
- **Sursă:** https://www.pcgamer.com/farthest-frontier-crop-rotation-guide/ + https://www.farthestfrontier.com/guide/gameplay/farming/ · încredere: ridicat
- **Implicație:** Un sistem cu 3 variabile per parcelă (fertilitate, buruieni, istoric de familie de culturi) produce decizii reale, se implementează în câteva zile și e complet invizibil pentru CPU. Asta e forma de „adâncime" pe care un solo trebuie să o prefere: adâncime de REGULI, nu adâncime de calcul.

### Ostriv: drumurile nu se construiesc — se bat prin mers; jucătorul nu plasează clădiri, ci alocă locuri

- **Detaliu:** „The player cannot build a house or a road but only arranges places for new buildings, and peasants will make them floor by floor and beat tracks as they find it most comfortable." Layout organic fără grilă și fără restricții de unghi, pe un peisaj tridimensional. Peste 60 de clădiri, 7 hărți, rotația culturilor și aratul, ferme private, comerț terestru și fluvial, anotimpuri dinamice.
- **Sursă:** https://ostrivgame.com/home/ · încredere: ridicat
- **Implicație:** Drumurile emergente (traficul erodează terenul și creează poteci) sunt un sistem cu raport spectaculos de valoare/cost: un singur float „uzură" per tile, incrementat la trecere și decăzut în timp, plus o regulă de cost de deplasare care scade cu uzura. Produce orașe care arată vii, fără nicio unealtă de editare. RECOMAND puternic pentru faza 1.

### Ostriv e un avertisment de scope: din 2014, încă în alpha, cu motor propriu

- **Detaliu:** Yevhen din Harkov dezvoltă singur din 2014, în timpul liber, iar din 2018 a început să adune oameni în jur. EA din 2017, pe Steam din 2020, iar site-ul oficial spune în continuare „currently in development" cu versiune alpha și avertizarea „some of the described features may be not fully implemented". Cerințele de sistem (OpenGL 4.3+, GTX 770) indică motor propriu.
- **Sursă:** https://ostrivgame.com/home/ + https://en.ain.ua/2023/04/05/ukrainian-develops-city-building-strategy-game-ostriv-by-himself/ · încredere: mediu
- **Implicație:** 12 ani fără 1.0, cu motor propriu și simulare ambițioasă. Semnalul de alarmă concret pentru planul tău: dacă la 12 luni de la start nu ai o buclă jucabilă de 30 de minute, ești pe traiectoria Ostriv, nu pe traiectoria Against the Storm.

### Sapiens — una dintre cele două inspirații declarate — pare STAGNAT: ultima actualizare Steam de peste 12 luni

- **Detaliu:** Sapiens (Majic Jungle) a intrat în Early Access pe 26 iulie 2022, cu estimare „a couple of years or more". Pagina Steam indică ultima actualizare acum peste 12 luni. Harta e „larger than Earth itself" cu mii de medii generate procedural; suport extensiv de moduri prin Steam Workshop, în Lua; patru triburi orientate pe comerț (unelte de piatră, pâine, ceramică, bronz); progresie tehnologică pe mii de ani.
- **Sursă:** https://store.steampowered.com/app/1060230/Sapiens/ · încredere: mediu
- **Implicație:** Dacă una dintre inspirațiile tale declarate a încetinit, e o oportunitate DE PIAȚĂ (nișa „colony sim preistoric, lume imensă, moddabil" e slab servită) dar și un avertisment: „hartă mai mare decât Pământul" e exact genul de ambiție care omoară un proiect solo. Ia estetica și tema, refuză scara.

### Sapiens dovedește că modding-ul în Lua e cel mai bun multiplicator de conținut pentru un solo

- **Detaliu:** „Extensive mod support through Steam Workshop" folosind limbajul de scripting Lua.
- **Sursă:** https://store.steampowered.com/app/1060230/Sapiens/ · încredere: ridicat
- **Implicație:** Expune definițiile de conținut (clădiri, resurse, rețete, specii, evenimente) ca DATE (JSON/Lua/CSV) încă din prototip, nu ca cod. Efect dublu: iterezi de 10 ori mai repede singur, și primești mod support aproape gratuit — care e, la Songs of Syx, motorul principal al longevității.

### Going Medieval — cealaltă inspirație declarată — a ieșit din Early Access pe 17 martie 2026, după aproape 5 ani

- **Detaliu:** Early Access 1 iunie 2021, lansare completă 17 martie 2026. Dezvoltator Foxy Voxel, editor Mythwright. Confirmă verticalitatea: „multi-storey forts to winding underground caverns", hartă multi-nivel, și terraformare: „Terraform the earth and water for construction, design, or military strategy. Build up or dig down." Valuri de raiders, nevoi de coloniști (îmbrăcăminte, religie, foame).
- **Sursă:** https://store.steampowered.com/app/1029780/Going_Medieval/ · încredere: ridicat
- **Implicație:** Nișa ta directă tocmai s-a „terminat" — Going Medieval a livrat 1.0, Timberborn a livrat 1.0 pe 12 martie 2026. Asta înseamnă simultan: (a) publicul e activ și caută următorul joc, (b) nu mai poți paria pe faptul că sunt neterminate. Diferențierea trebuie să fie pe o axă pe care ele NU o ocupă — vezi harta spațiului de design.

### Timberborn a ieșit din Early Access pe 12 martie 2026, după ~4,5 ani; Mechanistry e o echipă, nu un solo

- **Detaliu:** Early Access 15 septembrie 2021, lansare completă 12 martie 2026, dezvoltator și editor Mechanistry. Confirmă arhitectura verticală („stack lodges and workshops on top of each other", platforme și poduri), fizica 3D de apă cu terraformare, anotimpuri umede/uscate/toxice, și două facțiuni de castori (Folktails vs Iron Teeth) cu clădiri, tehnologii și trăsături de gameplay distincte.
- **Sursă:** https://store.steampowered.com/app/1062090/Timberborn/ · încredere: ridicat
- **Implicație:** Cele două facțiuni care partajează simularea dar diferă la clădiri/tehnologii sunt o formă ieftină de a dubla conținutul perceput. Dacă adopți asta, definește diferența ca DATE (liste diferite de clădiri și rate) peste aceeași simulare, niciodată ca ramuri de cod.

### CONTRADICȚIE de semnalat: rata de evaporare din Timberborn

- **Detaliu:** O sursă terță (wiki comunitar) dă o cifră precisă: evaporare de 0,045 metri pe zi, cu durate de secetă de 2-3 zile la început și peste 10 zile mai târziu pe dificultate normală. Însă deep dive-ul oficial al dezvoltatorilor spune explicit că nu au dezvăluit ratele de evaporare și nici formulele de decădere a umidității — calculele rămân proprietare.
- **Sursă:** https://timberborn.org/articles/water-physics-fluids-guide (comunitar) vs https://www.gamedeveloper.com/design/deep-dive-timberborn-s-water-mechanics (oficial) · încredere: scazut
- **Implicație:** Nu prelua cifrele de balans ale altcuiva ca adevăr. Ce e util e FORMA sistemului (evaporare liniară per zi + durată de secetă care crește progresiv), nu valoarea. Valoarea se calibrează pe jocul tău, iar escaladarea progresivă a secetei e exact mecanismul anti-plateu pe care Banished îl rata.

### Pathfinding pe z-levels: problema reală nu e algoritmul, ci flag-urile de traversare verticală

- **Detaliu:** Un dezvoltator care a implementat pathfinding 3D inspirat de Dwarf Fortress descrie că miezul problemei a fost ca actorii să nu treacă prin structuri solide: tile-urile trebuie să marcheze separat dacă blochează deplasarea în sus și dacă blochează deplasarea în jos. Un bug aparent de „mers prin pereți" s-a dovedit a fi de fapt un actor care sărea și „crashed through the roof", iar cauza vizuală era că sprite-ul nu corespundea z-levelului traversat. Redarea prin copierea și modificarea valorilor RGB per cadru „hurt the framerate too much"; soluția a fost suprapunerea de tile-uri translucide per z-level.
- **Sursă:** https://www.goodreads.com/author_blog_posts/17215109-implementation-of-pathfinding-with-z-levels · încredere: mediu
- **Implicație:** Concret pentru implementare: fiecare tile are nevoie de un bitmask de traversabilitate cu 6 direcții (4 laterale + sus + jos), nu de un simplu boolean „solid". Și: rezervă timp pentru VIZUALIZAREA z-levelurilor (straturi translucide, decolorare pe adâncime) — e o problemă de lizibilitate pe care jucătorii o resimt mai tare decât corectitudinea pathfinding-ului. Notă: sursa e un dezvoltator terț, nu Tarn Adams; nu am confirmat implementarea internă a DF.

## Implicații de design

- AXA 1 — SCARĂ (agenți simulați simultan). Ocupat: 10-40 (Oxygen Not Included), 20-100 (Going Medieval, Banished, RimWorld-like), 200-2.000 (Manor Lords, Foundation, Farthest Frontier), 10.000-50.000 (Songs of Syx), nelimitat-dar-lent (Dwarf Fortress). DECIZIE: alege 50-300 de agenți simulați individual. E singurul interval unde poți avea agenți cu personalitate vizibilă FĂRĂ pathfinding ierarhic complex, și unde poți afișa nume, relații și istorii — care e exact vânzarea emoțională a genului.
- AXA 2 — ADÂNCIMEA SIMULĂRII PER TILE. Ocupat: zero fizică (Banished, Against the Storm), un sistem (Timberborn = apă, Farthest Frontier = sol), trei-plus sisteme (Oxygen Not Included = gaze+lichide+temperatură+germeni, Dwarf Fortress = tot). DECIZIE: exact UN sistem fizic continuu, ales ca semnătură a jocului, rulat pe tick separat de 5 Hz, pe thread propriu. Dwarf Fortress dovedește că al doilea sistem (temperatura) dublează costul; ONI dovedește că trei sisteme cer un DLL nativ dedicat.
- AXA 3 — COMBAT. Ocupat: absent (Banished, Timberborn, Foundation în mare parte, Ostriv), asediu defensiv (Going Medieval, Against the Storm indirect, Farthest Frontier), tactic la scară (Manor Lords, Songs of Syx), RPG per-personaj (Kenshi). DECIZIE: combat DOAR defensiv, cu agenți care folosesc aceeași buclă de sarcini ca muncitorii (o sarcină „luptă" în loc de un sistem paralel). Costul unui sistem de combat separat e cel mai prost raport valoare/efort din tot genul — Manor Lords, cu 9 dezvoltatori, e criticat exact pentru combat.
- AXA 4 — SURSA PRESIUNII. Ocupat: sezonieră ciclică și escaladantă (Timberborn: secete tot mai lungi; Against the Storm: Storm), morală și legislativă (Frostpunk), demografică (Banished: piramida de vârstă), ostilitate externă (Going Medieval, Farthest Frontier), autoimpusă/absentă (Foundation, Ostriv, Sapiens). DECIZIE: presiune ciclică ESCALADANTĂ ca sursă primară (rezolvă problema plateului identificată la Banished ȘI la Manor Lords), plus un al doilea contor social independent în stil Frostpunk (nu inversul primului).
- AXA 5 — DESCHIDEREA LUMII. Ocupat: o hartă fixă (majoritatea), regiuni multiple cu așezări specializate (Manor Lords, Songs of Syx), hartă-lume cu așezări succesive (Against the Storm), open world continuu (Kenshi, Sapiens). LOC LIBER: „base-building cu bază MOBILĂ / migrație" — niciun joc mainstream din listă nu obligă abandonarea și mutarea bazei ca mecanică centrală (Shining Rock lucrează la „sate nomade care călătoresc între insule", deci ideea e validată dar neocupată). DECIZIE: ia deschiderea prin regiuni discrete + world states în stil Kenshi, NU prin teren continuu streamuit.
- AXA 6 — VERTICALITATE. Ocupat: 2D pur (Banished, Foundation, Manor Lords, Ostriv, Against the Storm), 2D cu secțiune verticală (Oxygen Not Included), z-levels reale cu săpat și construit (Dwarf Fortress, Going Medieval, Timberborn). DECIZIE: verticalitatea e OBLIGATORIE dat fiind că Going Medieval e inspirația declarată — dar limiteaz-o numeric (ex. 12-16 z-levels, nu 200 ca DF) și limitează SUPRAFAȚA, pentru că wiki-ul DF arată clar că întinderea orizontală costă enorm mai mult decât adâncimea.
- AXA 7 — SURSA CONȚINUTULUI VIZUAL. Ocupat: artă autorată (Manor Lords, Going Medieval, Timberborn — toate au echipe sau buget de artă), pixel art 2D (Songs of Syx, Dwarf Fortress), module compuse de jucător (Foundation), zone desenate cu construcție emergentă (Manor Lords burgage plots, Ostriv). DECIZIE PENTRU UN SOLO FĂRĂ ECHIPĂ DE ARTĂ: combină ultimele două — zone desenate + set mic de module combinabile. 20 de module bine făcute bat 60 de clădiri mediocre și sunt de 3 ori mai puțin de muncă.
- GOLUL CEL MAI PROMIȚĂTOR din harta de mai sus: un colony sim cu verticalitate reală (Going Medieval), UN sistem fizic propriu bogat (lecția Timberborn), scară de 50-300 de agenți cu identitate vizibilă, presiune ciclică escaladantă care forțează abandonarea și RECONSTRUIREA bazei într-o lume persistentă cu world states (Kenshi + Against the Storm), și construcție prin zone + module. Niciun joc din listă nu ocupă simultan verticalitatea și resetul ciclic — Against the Storm e plat, Going Medieval nu are reset.
- Arhitectura tehnică implicată de toate cele de mai sus: nucleu de simulare pur, determinist, fără dependențe de engine (testabil headless, ca modulul SimDLL al ONI), pe thread propriu, cu tick fix; strat de prezentare care interpolează; tot conținutul (clădiri, resurse, rețete, evenimente) ca date externe de la primul prototip; save versionat explicit din prima zi.
- Alegerea de engine, dedusă din constatări: Unreal 5.x pentru render/UI + un modul C++ propriu, izolat, pentru simulare. Motiv: ai deja C++/UE 5.7, Kenshi 2 migrează de la motor propriu la Unreal, iar Banished dovedește că motorul propriu se amortizează doar la al doilea joc. Pinează versiunea majoră de UE pe toată durata — migrarea UE4→UE5 a costat Manor Lords ~3 luni în mijlocul EA.

## Riscuri

- Moartea prin plictiseală în late-game — riscul #1 al genului, confirmat de critici identice la Banished (2014) și Manor Lords (2024). Semnal de alarmă: în playtest, jucătorii se opresc după 4-6 ore și spun „nu mai am ce face", nu „e prea greu". Dacă mecanismul anti-plateu nu e în vertical slice, nu va fi adăugat niciodată.
- Două sisteme fizice continue în loc de unul. Dwarf Fortress arată că oprirea temperaturii dublează FPS-ul. Semnal de alarmă: în profiler, două sisteme diferite apar fiecare peste 15% din timpul de frame. Consecință: ești blocat pe 50 de agenți în loc de 300 și nu mai poți repara fără a tăia un sistem întreg.
- Scope de 12 ani în loc de 3. Ostriv (din 2014, încă alpha) și Kenshi (12 ani) sunt precedentele. Semnal de alarmă concret: la 12 luni de la start nu ai o buclă jucabilă de 30 de minute de la zero la o așezare funcțională. Banished a costat 5.500 ore pentru un scop DELIBERAT MIC — orice plan mai mare decât Banished trebuie justificat cu ce anume se taie.
- Construirea unui engine înainte de a avea un joc. Hodorowicz: „Writing a game engine really needs a game to go with it. Otherwise I'm just guessing" — și recunoaște că a încălcat KISS și YAGNI, ceea ce a cerut refacere substanțială. Semnal de alarmă: scrii sisteme „generice" cu un singur consumator, sau petreci mai mult de o săptămână pe tooling fără o schimbare vizibilă în joc.
- Pathfinding perfect ca obsesie. Songs of Syx duce 50.000 de unități tocmai pentru că acceptă „imperfect or weird paths". Semnal de alarmă: petreci mai mult de 2 săptămâni pe calitatea căilor. Iar din DF: sub 10% din timpul de procesare e pathfinding — optimizezi ce nu doare.
- Migrarea de versiune majoră de engine în mijlocul dezvoltării. Manor Lords: UE4→UE5 între iunie și august 2024, urmată de o pauză a dezvoltatorului. Semnal de alarmă: tentația de a trece la o versiune nouă „pentru Nanite/Lumen". Consecință pentru un solo: 2-3 luni fără valoare livrată.
- Nișa tocmai s-a maturizat: Timberborn 1.0 (12 martie 2026) și Going Medieval 1.0 (17 martie 2026), amândouă în aceeași lună. Nu mai concurezi cu jocuri neterminate. Semnal de alarmă: pagina ta Steam nu ajunge la câteva mii de wishlist-uri în primele 3 luni — la Manor Lords, wishlist-urile au fost indicatorul care a prezis 1 milion de copii în primul weekend.
- Presiune morală scriptată în loc de procedurală. Frostpunk e criticat pentru că la a doua rulare povestea nu mai e emergentă, și pentru paradoxul „beating a game over experiencing it". Semnal de alarmă: dilemele tale sunt într-un fișier de text scris de mână, nu generate din starea simulării. Pentru un solo, asta e dublu-cost: scrii mult și primești zero replayability.
- Amestecarea simulării cu randarea. Dwarf Fortress e blocată pe un fir de execuție pentru totdeauna; ONI a avut nevoie de un DLL nativ separat ca să scape. Semnal de alarmă: orice tip de date de simulare care are o referință la un Actor, un mesh sau un component de engine. Verificare: poți rula 1.000 de tick-uri într-un test fără editor? Dacă nu, e deja prea târziu.

## Întrebări deschise

- Nu am putut confirma din sursă primară detaliile tehnice interne ale Going Medieval (reprezentarea voxel, limita de z-levels, integritatea structurală, engine-ul, plafonul de coloniști) — paginile de wiki au returnat 401/403. Este inspirația ta declarată #1 și merită o pasă dedicată pe devlog-urile Steam ale Foxy Voxel și pe subredditul jocului.
- Nu am putut confirma din sursă primară detaliile tehnice ale Sapiens (engine propriu?, reprezentarea planetei sferice, câți sapiens simulează, de ce s-a oprit dezvoltarea) — blogul majicjungle.com/blog a returnat 404. De verificat direct devlog-urile de pe Steam și canalul de YouTube al lui David Frampton.
- Cifrele de balans ale Timberborn (evaporare 0,045 m/zi, durate de secetă) provin dintr-un wiki comunitar, în timp ce dezvoltatorii declară explicit că nu au publicat aceste valori. Rămâne neverificat dacă cifra e derivată din datamining sau inventată.
- Nu am obținut numere concrete pentru sistemul de Hostility / Queen's Impatience din Against the Storm (praguri, valori per nivel) — sursele wiki au cerut plată. Merită, pentru că e exact mecanismul de presiune escaladantă pe care îl recomand.
- Nu am confirmat dacă Songs of Syx rulează simularea multithreaded sau pe un singur fir — dezvoltatorul a discutat doar pathfinding-ul ierarhic. Diferența contează enorm pentru a decide dacă 50-300 de agenți e o limită reală sau o alegere de design.
- Nu am putut deschide interviul video complet cu Luke Hodorowicz despre Banished (conținutul articolului era gol) — acolo probabil se află argumentația lui directă despre excluderea combatului și despre controlul de scop ca solo. Sursa e pe YouTube.
- Nu am verificat dacă mecanica de burgage plots din Manor Lords are cerințe numerice de suprafață și niveluri de upgrade (wiki-urile au returnat 401/402). Numerele ar fi utile ca punct de plecare pentru calibrarea propriului sistem de parcele.
- Întrebare de design, nu de cercetare: dacă adopți resetul ciclic în stil Against the Storm, cum se împacă asta cu verticalitatea din Going Medieval? O fortăreață săpată pe 14 niveluri reprezintă zeci de ore de investiție a jucătorului — abandonarea ei ar putea fi devastatoare, nu eliberatoare. Posibil răspuns de testat: ceea ce se resetează e REGIUNEA, iar fortăreața abandonată rămâne pe hartă ca ruină explorabilă (world state), nu dispare.

## Recomandări

- Fixează ACUM poziția pe cele 7 axe (scară, adâncime de simulare, combat, presiune, deschidere, verticalitate, sursă vizuală) ca prima pagină a documentului de design, cu valori numerice: ex. „120-250 agenți, UN sistem fizic (apă), combat doar defensiv pe bucla de sarcini, presiune ciclică escaladantă, 5-9 regiuni discrete, 14 z-levels, hartă 128×128 tile-uri". Fiecare cifră devine un test de regresie de performanță, nu o aspirație.
- Construiește nucleul de simulare ca modul C++ pur, fără niciun include de Unreal, cu tick fix (ex. 10 Hz agenți / 5 Hz fizică) și API prin buffere. Criteriul de acceptanță: o suită de teste care rulează 10.000 de tick-uri fără editor, în sub 30 de secunde, cu rezultat bit-identic la două rulări. Asta îți rezolvă simultan threading-ul, determinismul, save/load-ul și problema pe care o cunoști deja — că Unreal-ul headless minte.
- Alege apa ca sistem-semnătură și implementeaz-o exact ca Timberborn: o adâncime per coloană de tile, 4 conexiuni de „țevi virtuale" către vecini, nivelare iterativă, momentum derivat din diferența între tick-uri. Buget: 1-2 săptămâni. Nu porni de la fizică reală. Adaugă un al doilea câmp derivat (umiditatea solului) cu aceeași logică de revărsare, dar cu scădere abruptă la urcare — ai gratis fertilitate, vegetație și agricultură.
- Implementează pathfinding ierarhic de la început, după rețeta Songs of Syx: grile suprapuse 8×8 → 16×16 → 32×32, căi între clustere pre-calculate și invalidate doar în clusterul modificat. Adaugă separat regiuni de conectivitate pentru a respinge în O(1) cererile imposibile. Și scrie în documentul de design, explicit, propoziția „acceptăm căi sub-optime" — ca să nu revii la subiect peste 6 luni.
- Proiectează mecanismul anti-plateu ÎNAINTE de a scrie prima clădire, ca sistem, nu ca DLC. Recomandarea concretă: buclă dublă — stratul de așezare cu durată țintă de 60-90 de minute până la o criză majoră, plus un strat de imperiu/cunoaștere care persistă. Adaugă cele două monede din Against the Storm: una perisabilă (forțează decizii, expiră la ciclu) și una permanentă (dă sentiment de progres). Cost de implementare: mic. Efect pe retenție: cel mai mare din toată lista.
- Rezolvă problema de artă prin combinație de zone desenate + module: jucătorul desenează o parcelă (burgage plot, în stil Manor Lords/Ostriv), agenții construiesc singuri, iar clădirile mari se compun din 15-25 de module (ziduri, arce, acoperișuri, turnuri) în stilul constructorului de monumente din Foundation. Ținta: sub 40 de mesh-uri unice pentru întregul joc la lansare.
- Adaugă drumurile emergente din Ostriv ca sistem de faza 1: un float de „uzură" per tile, incrementat la fiecare trecere și decăzut lent, care scade costul de deplasare și schimbă materialul vizual. Cost: ~1 zi de implementare. Efect: orașul arată locuit fără niciun asset suplimentar și fără nicio unealtă de editare — cel mai bun raport valoare/efort din toată lista.
- Înlocuiește narativul scriptat cu „world states" în stil Kenshi: o mașină de stări pe facțiuni și regiuni, cu tranziții declanșate de evenimente din simulare (o figură importantă moare, o regiune e abandonată, o resursă se epuizează). Zero dialog scris, zero cutscene, replayability nelimitată. Proiecteaz-o de la început — e imposibil de retrofitat peste o lume statică.
- Externalizează TOT conținutul ca date (clădiri, resurse, rețete, specii, evenimente, reguli de world state) încă din prototip, cu un loader simplu. Sapiens și Songs of Syx arată că modding-ul e principalul motor de longevitate în acest gen. Bonus imediat, mai important decât modding-ul: iterezi de câteva ori mai repede pe balans, singur.
- Creează pagina Steam la 4-6 luni de la start, cu un GIF care arată sistemul-semnătură (apa care sparge un dig și inundă nivelele inferioare ale fortăreței). Folosește wishlist-urile ca poartă de decizie la 6 și 12 luni. Manor Lords a țintit 14.000 și a ajuns la 3 milioane — indicatorul funcționează, e gratuit, și e singurul test de piață pe care îl poți rula înainte de a avea joc.
- Bugetează producția pe baza numerelor confirmate, nu pe optimism: Banished = 5.500 ore pentru un scop mic; Against the Storm = 13 luni de EA cu scop strâns; Timberborn = 4,5 ani de EA cu echipă; Foundation = 6 ani de EA; Ostriv = 12 ani fără 1.0. Ținta rezonabilă pentru tine: vertical slice jucabil la 6 luni, Early Access la 18-24 de luni, 1.0 la 36. Dacă planul curent nu încape, taie o axă întreagă (cel mai probabil: open world sau combat), nu câte 10% din fiecare.

