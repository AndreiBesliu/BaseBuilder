# teren-lume — Reprezentarea terenului, construcția verticală și generarea lumii pentru un base-building / colony sim inspirat din Going Medieval și Sapiens

## Rezumat

Premisa briefului conține o eroare pe care am confirmat-o: Sapiens NU folosește tetraedri. Documentația de modding a jocului vorbește despre o sferă de rază 1, eșantionată pe vertecși, cu niveluri de subdiviziune 13-21 și cu distanțe măsurate în „hexagoane" — adică o sferă subdivizată tip Goldberg, nu o plasă tetraedrică. Argumentul „tetraedrii bat voxelii" există, dar vine dintr-un articol de opinie din 2015 al unui proiect (Nowhere) care nu s-a livrat niciodată; niciun colony sim comercial cunoscut nu îl folosește. Going Medieval, în schimb, e Unity + grilă voxel cubică, a stat 5 ani în Early Access (1 iunie 2021 → 1.0 pe 17 martie 2026) cu o echipă mică, iar Sapiens a costat 10 ani de dezvoltare solo pornind de la un simplu world renderer. Astea sunt cifrele de producție care trebuie să domine planul, nu eleganța algoritmului. Pe partea tehnică, numerele sunt încurajatoare: greedy meshing binar face 74 µs per chunk de 64³ pe un Ryzen 3800X, un chunk 32³ ține 32768 celule × 2 bytes = 64 KB, iar un vertex bit-packed încape într-un singur uint de 4 bytes. Re-meshing-ul la săpat e ieftin dacă chunk-ul e mic — 16³ re-meshează în ~415 µs pentru 50 de chunk-uri/frame, 32³ costă 2820 µs pentru aceleași 50. Dacă terenul e neted, Surface Nets bate Marching Cubes de 2.2x la timp (124 ms vs 275 ms) și produce cu 75% mai puține primitive, iar Transvoxel (fără brevete) rezolvă crăpăturile între LOD-uri. Râurile sunt punctul dureros și ambele surse primare converg: eroziunea hidraulică particulară pe 256² merge la ~1 µs per particulă dar nu garantează râuri conectate și „nu reușește canioane", motiv pentru care Frampton a inversat problema — construiește întâi râurile, apoi terenul peste ele. Construcția verticală are reguli simple și copiabile în Going Medieval: stabilitate 4 la sol, -1 per tile depărtare, 0 = imposibil de plasat, maximum 3 tile-uri nesusținute, grinda are rază 10. Iar cea mai prost rezolvată parte în toate jocurile din genul ăsta e vizibilitatea pe niveluri: jucătorii Going Medieval se plâng explicit că la jumătăți de nivel (pașii de 0.5 ai camerei) se văd obiectele de pe etajul de deasupra, ceea ce face verticalitatea greu de folosit în practică.

## Constatări (26)

### Sapiens NU folosește reprezentare tetraedrică — folosește o sferă subdivizată cu fețe hexagonale

- **Detaliu:** Documentația de modding descrie eșantionarea pe o sferă de rază 1 centrată în origine, cu `pointNormal` normalizat, `spHeightGet` care determină înălțimile pe vertecși, și funcția `spBiomeGetTransientGameObjectTypesForFaceSubdivision` care operează pe niveluri de subdiviziune 13-21. Unitățile sunt date explicit în hexagoane: `riverDistance` de 1 unitate ≈ ~7650 hexagoane distanță. Structura e o sferă geodezică subdivizată recursiv (Goldberg/icosaedru trunchiat), nu o plasă de tetraedri.
- **Sursă:** https://wiki.sapiens.dev/docs/scripting/worldgen.html · încredere: ridicat
- **Implicație:** Nu porni de la ipoteza tetraedrilor. Dacă vrei modelul Sapiens, ceea ce copiezi e: (a) evaluare LAZY a terenului dintr-o funcție de noise, nu stocare, și (b) LOD prin nivel de subdiviziune. Pentru un joc cu hartă finită, ambele sunt inutile — deci modelul Sapiens NU e modelul tău.

### Argumentul pro-tetraedri există, dar vine dintr-un proiect nelivrat și niciun colony sim nu îl folosește

- **Detaliu:** Articolul de pe Game Developer (originar de pe blog.duangle.com, 2015) susține că stocarea tetraedrică „crește independent de spațiul acoperit, depinde doar de complexitatea topologică", că voxelii scalează cubic („de fiecare dată când dublezi latura, stocarea crește de 8 ori"), că voxelii cer un „mixdown" în triunghiuri deci ții informația de două ori în memorie, și că transformările (scalare/forfecare/rotație) sunt fără pierdere pe tetraedri. CONTRADICȚIE explicită: proiectul autorului (Nowhere) nu a fost lansat niciodată, iar Sapiens — dat ca exemplu în brief — nu folosește tetraedri.
- **Sursă:** https://www.gamedeveloper.com/design/towards-realtime-deformable-worlds-why-tetrahedra-rule-voxels-drool · încredere: mediu
- **Implicație:** RESPINGE tetraedrii pentru acest proiect. Argumentul e valid teoretic dar nu are nicio implementare livrată de referință, deci costul de cercetare e nemărginit pentru un om singur. Pune-l în „respins, cu motiv" în documentul de design ca să nu revii la el peste 6 luni.

### Going Medieval a stat aproape 5 ani în Early Access cu o echipă (nu un om)

- **Detaliu:** Unity, dezvoltat de Foxy Voxel (studio indie sârbesc), publicat de Mythwright. Early Access 1 iunie 2021, lansare completă 17 martie 2026. Înainte de EA: alpha mai 2020, beta închis august 2020, al doilea beta închis februarie 2021, beta deschis cu 2 săptămâni înainte de lansare. Între faze, echipa a petrecut „în jur de două săptămâni" doar citind feedback.
- **Sursă:** https://en.wikipedia.org/wiki/Going_Medieval + https://screenrant.com/foxy-voxel-interview-going-medieval-early-access/ · încredere: ridicat
- **Implicație:** Calibrează scopul brutal. Un studio a avut nevoie de ~6 ani de la primul devlog (mai 2019) la 1.0. Pentru un om singur, planul realist e: an 1 = teren + construcție + un pawn care merge și sapă; an 2 = gameplay. Orice plan care promite „colony sim complet în 12 luni" e fals.

### Sapiens a costat 10 ani de dezvoltare solo, pornind ca simplu world renderer

- **Detaliu:** Frampton: „Cu Sapiens, am creat o sferă la început, care era lumea. Apoi am rafinat-o timp de 10 ani." A construit motor propriu, controale de cameră nestandard, interfață de multi-select 2D, pathfinding și AI proprii, sisteme proprii de resurse și ownership pentru multiplayer. Lucrează solo dar externalizează: a contractat muzica, iar la maturitatea proiectului „se uită acum la angajarea unui modeler/animator".
- **Sursă:** https://premortem.games/2024/09/09/sapiens-solo-developer-dave-frampton-an-online-community-is-a-massive-help/ · încredere: ridicat
- **Implicație:** Externalizarea artei e modelul dovedit pentru un dev solo, NU construirea propriului pipeline de artă. Bugetează bani pentru modele/animații de la început. Și nu construi motor propriu: cei 10 ani ai lui Frampton includ motorul.

### Harta originală Going Medieval: 250×250 unități lățime, 16 unități înălțime, generată din brushmap-uri

- **Detaliu:** Devlog #1 (mai 2019): „Harta de 16 unități înălțime și 250×250 unități lățime e generată de un număr nelimitat de brushmap-uri plasate aleator care determină tipul, forma, culoarea și gradientul terenului." Tipuri de teren: Dirt, Grass, Sand, Mud, Iron, Limestone, Granite, Gold, Silver. Aceleași brushmap-uri plasează și props (copaci, pietre, plante), cu un număr total plafonat la generarea hărții. Terenurile se leagă prin pante generate aleator, unele zone fiind inițial inaccesibile.
- **Sursă:** https://foxyvoxel.itch.io/going-medieval/devlog/82027/devlog-1-terrain-creation · încredere: ridicat
- **Implicație:** 250×250×16 = 1.000.000 de celule. La 2 bytes/celulă = 2 MB de date brute de teren. Asta e ORDINUL DE MĂRIME corect pentru un colony sim vertical — nu e o problemă de memorie, e o problemă de meshing și de AI. Bugetează memoria pentru straturi suplimentare (temperatură, lumină, stabilitate), nu pentru voxeli.

### CONTRADICȚIE între devlog-ul din 2019 și ghidurile de joc despre înălțimea hărții

- **Detaliu:** Devlog-ul spune 16 unități înălțime. Ghidurile ulterioare spun că se sapă până la nivelul 1.0 (bedrock, „odată ce ajungi la 1.0 nu mai poți săpa") și se construiește „până la nivelul 5.0". Camera se mișcă în incremente de 0.5. Cele două nu se împacă: fie sistemul s-a schimbat între 2019 și lansare, fie „unitatea" din devlog nu e nivelul de joc (posibil 0.5 unități per nivel vizibil).
- **Sursă:** https://www.slythergames.com/2021/06/04/going-medieval-how-to-build-underground/ vs https://foxyvoxel.itch.io/going-medieval/devlog/82027/devlog-1-terrain-creation · încredere: mediu
- **Implicație:** Nu copia „16 straturi" ca număr magic. Decide TU bugetul de straturi din constrângerea de UX (câte niveluri poate un jucător să țină în cap), nu din constrângerea tehnică. Propunere: 8-12 straturi total, din care 4-6 sub sol. Peste atât, slice view-ul devine inutilizabil, cum arată chiar plângerile jucătorilor Going Medieval.

### Regula de stabilitate structurală din Going Medieval e un număr întreg simplu cu decrement pe distanță

- **Detaliu:** O structură așezată pe sol are valoarea de stabilitate 4. Fiecare structură atașată de ea primește -1 stabilitate cu cât e plasată mai departe (dacă nu e și ea pe sol). Nu poți plasa o structură cu stabilitate 0. Practic: maximum 3 tile-uri nesusținute de la orice perete sau grindă de susținere. Grinda de lemn are rază maximă de 10 spații de grilă și costă fix 15 lemn indiferent de distanța dintre pereți. Consensul jucătorilor pentru tuneluri: lățime 4 tile-uri sigură, 5 riscant, lungimea e nelimitată.
- **Sursă:** https://goingmedieval.fandom.com/wiki/Stability (via rezumat de căutare) + https://steamcommunity.com/app/1029780/discussions/0/3055111535922874430/ · încredere: mediu
- **Implicație:** IMPLEMENTEAZĂ EXACT ASTA. Un câmp int8 de „stabilitate" per celulă, propagat cu BFS de la celulele de sol, e O(celule atinse) și dă gameplay citibil. Costă ~1 săptămână, nu necesită fizică. NU face simulare de forțe — e nedebuggabilă și jucătorii nu o pot prezice.

### Vizibilitatea pe niveluri e nerezolvată chiar și în Going Medieval — jucătorii se plâng explicit

- **Detaliu:** Camera se mișcă în pași de 0.5 nivele: Z ridică cu 0.5, X coboară cu 0.5, Ctrl+rotița mouse-ului ajustează cu 0.5. Plângerea documentată: la jumătățile de nivel camera afișează obiectele care stau pe sol de la nivelul de DEASUPRA, ceea ce face construcția verticală nepractică. La nivel întreg se văd obiectele de la sol și pereții foarte scunzi, dar ordinele de minat afectează nivelul de dedesubt.
- **Sursă:** https://steamcommunity.com/app/1029780/discussions/0/3055111535922602464 + https://www.slythergames.com/2021/06/04/going-medieval-how-to-build-underground/ · încredere: mediu
- **Implicație:** Nu inventa jumătăți de nivel. Regula trebuie să fie una singură și declarată: „nivelul activ N afișează solid tot ce e la N, afișează estompat/fantomă tot ce e sub N, ascunde complet tot ce e peste N; toate ordinele se aplică la N". Un singur invariant, testabil. Bugetează 2-3 săptămâni doar pentru asta și testeaz-o cu oameni reali.

### Definiția „camerei" în Going Medieval e mai complicată decât un flood fill și scările sparg etanșeitatea

- **Detaliu:** Camerele sunt spații închise cu pereți și uși. Scările NU separă camerele — dacă sapi în jos, totul contează ca o singură cameră și etajul de jos are aceeași temperatură cu cel de sus, temperatura fiind media tuturor etajelor conectate. Măsurători de jucători: cameră 3×3 subterană = -2.2°C fără podea, dar 1.1°C CU podea de lemn (lemnul încălzește subteran). Ținta pentru conservarea alimentelor: ≤5°C. Camerele mari rețin frigul mai bine decât cele mici (19.5°C într-o cameră mare vs 21.9°C în echivalentul mic). Ghidul menționează și că sistemul numără materialele pe o rază de 2 blocuri dincolo de peretele vizibil.
- **Sursă:** https://steamcommunity.com/sharedfiles/filedetails/?id=2506438750 · încredere: mediu
- **Implicație:** Camera trebuie să fie un flood fill 3D (6-conectat), nu 2D per etaj. Consecință de design: o scară deschisă unifică termic două etaje — asta e o MECANICĂ, nu un bug, și o poți exploata (hornuri, curenți de aer, pivnițe). Dar înseamnă că flood fill-ul trebuie re-rulat la fiecare plasare/distrugere de celulă solidă → cachează ID-ul camerei per celulă și invalidează doar componenta atinsă.

### Greedy meshing plătește enorm pe suprafețe plane și aproape deloc pe teren zgomotos

- **Detaliu:** Cifre exacte pe un cub plin 8×8×8: metoda naivă 3072 quads, culling 384 quads, greedy 6 quads. Dar pe teren zgomotos: naiv 2198 → greedy 1670 (doar ~24% câștig). Pe o sferă: 4770 → 2100. Pe o formă neregulată dar plană: 690 → 22. Autorul avertizează: „performanța se înrăutățește pe măsură ce curbura și numărul de componente ale datelor cresc", iar greedy e „de aproximativ 3 ori mai lent" decât culling. Merge-ul se rupe dacă quad-urile au texturi, valori de lumină sau tipuri de bloc diferite.
- **Sursă:** https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/ · încredere: ridicat
- **Implicație:** Aplică greedy meshing SELECTIV: pe construcțiile jucătorului (pereți, podele, straturi de rocă uniformă) unde câștigul e 50-500x; NU pe stratul de suprafață zgomotos unde câștigi 24% și plătești 3x timp. Asta e o decizie de arhitectură: doi meshers, nu unul.

### Re-meshing-ul la săpat costă zeci până la sute de microsecunde per chunk — e neglijabil dacă chunk-ul e mic

- **Detaliu:** Binary greedy meshing v2 (chunk max 64³): medie 74 µs per chunk single-threaded, 108 µs cu thread pool, interval 50-200 µs, pe Ryzen 3800X. Quad-ul ocupă 8 bytes (poziție 6 biți/axă + lățime/înălțime 6 biți + tip). Randarea: vertex pulling și TOATE chunk-urile într-un singur draw call prin glMultiDrawElementsIndirect. Comparativ, re-meshing dinamic cu 50 de chunk-uri per frame: la 16³ voxeli costă 550 µs naiv / 415 µs cu vertex pooling; la 32³ costă 4200 µs naiv / 2820 µs cu pooling.
- **Sursă:** https://github.com/cgerikj/binary-greedy-meshing + https://nickmcd.me/2021/04/04/high-performance-voxel-engine/ · încredere: ridicat
- **Implicație:** ALEGE 16³ pentru chunk, nu 32³. Într-un colony sim, zeci de celule se schimbă simultan (o echipă care sapă un tunel), iar 16³ costă de ~7x mai puțin la re-mesh. Bugetul tău: la 60 FPS ai 16 ms; 50 de chunk-uri de 16³ re-meshate = 415 µs = 2.5% din frame. Confortabil.

### Un chunk de 32³ ține 64 KB de date brute, iar un vertex încape în 4 bytes prin bit-packing

- **Detaliu:** Chunk 32×32×32 = 32.768 blocuri × 2 bytes/bloc (1 byte tip + 1 byte „health") = 64 KB. Vertexul e un singur uint (4 bytes): 18 biți poziție (6 biți per axă, 64 poziții), 5 biți unitate de textură, 4 biți health, 3 biți normală/orientare de față. Generarea mesh-ului a scăzut de la 5.15 ms la 0.89 ms per chunk (5.7x) prin: array-uri unidimensionale (+20%), reference locals pentru structuri (+5%), acces direct la chunk-urile vecine (+10%), Array.Clear în loc de realocare (+10%), indici precalculați și operații pe biți (+5%). 807 chunk-uri inițializate în 722 ms.
- **Sursă:** https://vercidium.com/blog/voxel-world-optimisations/ · încredere: ridicat
- **Implicație:** Rezervă de la început 2 bytes per celulă (tip + un byte de stare) și bit-packing pe vertex. Nota cea mai utilă: câștigurile mari vin din structura datelor (array plat, acces direct la vecini), nu din algoritm. Într-un limbaj cu GC (C#), Array.Clear în loc de realocare e 10% gratuit.

### Pentru teren NETED, Surface Nets bat Marching Cubes de ~2.2x la timp și produc cu 75% mai puține primitive

- **Detaliu:** Pe aceeași sferă de test: Marching Cubes 1140 vertecși / 572 fețe; Marching Tetrahedra 4200 / 1272 (de 3-4x mai multă geometrie); Surface Nets 272 vertecși / 270 fețe. Timp la frecvență 10: Surface Nets 124.3 ms, Marching Cubes 274.6 ms, Marching Tetrahedra 1420 ms. Complexitate de implementare: MC are 256 de cazuri și e „foarte greu de făcut de la zero"; MT are doar 16 cazuri și e garantat manifold; Surface Nets e „ușor" dar poate produce vertecși non-manifold.
- **Sursă:** https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/ · încredere: ridicat
- **Implicație:** Dacă vreodată alegi teren neted, NU scrie Marching Cubes de la zero — e cel mai prost raport efort/rezultat din cele trei. Surface Nets e alegerea pentru un om singur. Dar vertecșii non-manifold rup unele librării de fizică — verifică asta ÎNAINTE, nu după.

### Transvoxel rezolvă crăpăturile între LOD-uri de teren și e liber de brevete

- **Detaliu:** Inventat de Eric Lengyel în 2009. Inserează celule de tranziție speciale între celulele normale la granițele de LOD. În loc să trateze ~1.2 milioane de cazuri din combinarea datelor de rezoluție întreagă și înjumătățită, ia doar nouă eșantioane din datele de înaltă rezoluție → 512 cazuri, colapsate în 73 de clase de echivalență. Funcționează prin lookup tables, ca Marching Cubes. „Algoritmul Transvoxel e liber de revendicări de brevet." Tabelele complete și codul sunt pe GitHub.
- **Sursă:** https://transvoxel.org/ · încredere: ridicat
- **Implicație:** Dacă terenul e neted ȘI ai LOD, folosește Transvoxel — problema e rezolvată, tabelele sunt publice, nu ai niciun motiv să inventezi. Dacă terenul e blocky (voxeli cubici) și harta e finită, NU AI NEVOIE DE LOD deloc — ceea ce elimină complet clasa asta de probleme. Încă un argument pentru blocky.

### godot_voxel oferă gratuit tot stack-ul de teren voxel editabil cu LOD — blocky greedy + Transvoxel + octree + streaming

- **Detaliu:** Blocurile („chunk-urile") sunt tipic cuburi de 16×16×16 voxeli. Trei meshers: VoxelMesherBlocky (tip Minecraft, cu batching pe tipuri de voxel, suportă cuburi și forme custom), VoxelMesherTransvoxel (suprafață netedă pe valori SDF, generează și transition meshes pentru cusătura LOD), VoxelMesherCubes (voxeli colorați). Două sisteme de teren: VoxelTerrain (încărcare pe grilă, distanță de vedere limitată) și VoxelLodTerrain (stocare pe octree, voxeli la mai multe niveluri de detaliu, distanțe mult mai mari). Editare în timp real prin VoxelTool cu re-meshing DOAR pe regiunile modificate. Canale configurabile TYPE/SDF/COLOR pe 8/16/32/64 biți. Fizică, raycasting, generare procedurală și persistență pe disc incluse.
- **Sursă:** https://voxel-tools.readthedocs.io/en/latest/overview/ · încredere: ridicat
- **Implicație:** Asta e cea mai mare economie de timp identificată în tot research-ul: ~6-12 luni de muncă deja scrise și testate. Dacă ești dispus să treci pe Godot, pornești de la ziua 1 cu teren editabil cu LOD. Contra-argumentul e real: nu cunoști Godot, iar C++/GDExtension e alt pipeline. Decizie de cântărit explicit, nu de ignorat.

### Voxel Plugin 2 pentru Unreal țintește exact UE 5.6/5.7 dar își recunoaște singur instabilitatea

- **Detaliu:** Documentația oficială: plugin-ul e „țintit exclusiv către Unreal Engine 5.6 și 5.7". Aceeași documentație spune despre produs că „poate fi buggy uneori" și că „funcționalitățile și schimbările noi s-ar putea să nu fie încă arătate în documentație". Licențiere pe tiers. Distribuit prin installer propriu sau GitHub, cu suport pe Discord.
- **Sursă:** https://docs.voxelplugin.com/ · încredere: mediu
- **Implicație:** E singura cale rapidă spre teren voxel în Unreal, unde ai deja experiență (UE 5.7 pe prototipul naval). Dar pui nucleul jocului pe o dependență terță plătită care se auto-descrie ca instabilă. Dacă mergi pe ea: izolează-o în spatele unei interfețe proprii de la prima zi, ca să poți înlocui implementarea fără să rescrii gameplay-ul. Asta costă o săptămână și e cea mai bună asigurare din plan.

### World Partition din Unreal rezolvă streaming-ul doar pentru actori, nu pentru chunk-uri voxel proprii

- **Detaliu:** Exemplu din documentație: Cell Size 256m × 256m × 256m, Loading Range rază de 768 metri în jurul unei surse de streaming. Un fișier per actor. HLOD generat prin commandlet. Avertisment explicit: „folosirea a mai mult de un grid poate afecta negativ performanța" — recomandarea e un singur 2D runtime hash grid. Actorii cu „Is Spatially Loaded" dezactivat se încarcă indiferent de proximitate.
- **Sursă:** https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine · încredere: ridicat
- **Implicație:** Dacă terenul tău e o structură de date proprie (voxel), World Partition NU îl va streama — trebuie să scrii tu încărcarea/descărcarea de chunk-uri. Beneficiul rămâne pentru props, clădiri instanțiate și decor. Consecință: nu alege Unreal PENTRU streaming dacă terenul e custom; alege-l pentru randare, tooling și pentru că îl cunoști.

### Frampton a rezolvat problema râurilor inversând-o: întâi râurile, apoi terenul peste ele

- **Detaliu:** Devlog Sapiens, 23 august 2019: „Râurile pot fi o problemă cu terenul procedural, așa că în loc să încerc să calculez râuri peste teren bazat pe perlin noise, am pornit de la râuri și am construit terenul de la ele în sus." În structura de date rezultată, SPVec4 ține înălțimea pe prima componentă și `riverDistance` pe a doua — adică distanța la râu e un câmp de primă clasă, propagat peste tot, nu un post-procesare.
- **Sursă:** https://www.playsapiens.com/page3/ + https://wiki.sapiens.dev/docs/scripting/worldgen.html · încredere: ridicat
- **Implicație:** ASTA E DECIZIA CHEIE PENTRU RÂURI. Generează întâi graful hidrografic (surse → confluențe → gura de vărsare), apoi coboară terenul de-a lungul lui. Garantezi conectivitate și monotonie descendentă prin construcție. Alternativa (eroziune peste noise) nu garantează nimic. Și ține `riverDistance` ca un câmp per-celulă — îl vei folosi la biomi, la fertilitate, la plasarea așezărilor.

### Eroziunea hidraulică particulară e ieftină de rulat dar își recunoaște limitele — nu produce râuri garantate

- **Detaliu:** Implementare pe heightmap 256×256, cu trei array-uri plate: heightmap[256*256], waterstream[256*256], waterpool[256*256]. Particula are poziție 2D, viteză, volum, sediment, frecare, rată de evaporare, volumeFactor 100.0. Operațiile descend și flood costă ~1 µs per particulă; flood scalează cu dimensiunea bazinului și e pasul cel mai scump. Limitări declarate de autor: nu reușește canioane („ar cere o simulare foarte lentă, pe termen foarte lung"), nivelul apei „sare" lângă punctele de drenaj la aflux mare, nu există flux în interiorul bazinului (particulele sunt transportate instantaneu la ieșire), criteriul de trecere particulă→bazin e „oarecum arbitrar", iar normalele calculate pe vecinătăți mici produc artefacte de creastă.
- **Sursă:** https://nickmcd.me/2020/04/15/procedural-hydrology/ · încredere: ridicat
- **Implicație:** Folosește eroziunea ca PAS DE ÎNFRUMUSEȚARE offline la generarea hărții (câteva secunde, o singură dată), nu ca sursă de adevăr pentru hidrologie. Sursa de adevăr rămâne graful de râuri construit explicit. 256² e dimensiunea dovedită — se potrivește perfect peste o hartă de colony sim de 250×250.

### Wave Function Collapse e bun local și prost la scară mare — autorul o spune explicit

- **Detaliu:** WFC (Gumin, bazat pe Merrell) e un solver de constrângeri: fiecare celulă ține un domeniu de tile-uri posibile, alegi o celulă incertă, alegi un tile, propagi constrângerile. „Cu o alegere rezonabilă de tile-uri și o rutină de randomizare sensibilă, rareori e necesar backtracking-ul." Contradicțiile (domeniu gol) cer backtracking. Complexitate exponențială: optimizările „pot face diferența între a obține un răspuns azi și a-l obține în 5000 de ani". Slăbiciunea declarată: „WFC constrânge doar tile-urile apropiate, rareori generează structuri la scară mare, ceea ce poate da nivelurilor mari un aspect omogen, neplanificat". Funcționează pe grile hexagonale, 3D și topologii neobișnuite.
- **Sursă:** https://www.boristhebrave.com/2020/04/13/wave-function-collapse-explained/ · încredere: ridicat
- **Implicație:** Folosește WFC DOAR pentru conținut local mic: layout-ul unui sat abandonat, o ruină, o rețea de peșteri, mobilarea unei camere. NU pentru forma continentului, biomi sau râuri — acolo ai nevoie exact de structura la scară mare pe care WFC nu o dă. Și nu e o prioritate pentru versiunea 1.

### Generarea Voronoi/poligonală (mapgen2) e o alternativă matură dar autorul avertizează că e specifică jocului lui

- **Detaliu:** Folosește Voronoi + Delaunay prin librăria Delaunator; puncte generate prin jittered grid sau blue noise (Poisson disc), cu puncte de graniță adăugate pe margini. Elevație din Simplex noise cu amplitudine implicită 0.2, length 4, seed 12345. Râuri: parametru `numRivers: 30` implicit, plus `drainageSeed` și `riverSeed`. Biomi din distanța la coastă și distanța la apă. Structură de date „struct of arrays", nu array de obiecte. Licență Apache-2.0. Autorul avertizează explicit că alegerile sunt legate de jocul lui: „Proiectul ăsta avea nevoie ca liniile de coastă să fie forme interesante de insulă... munții în centrul insulei".
- **Sursă:** https://www.redblobgames.com/maps/mapgen2/ + https://github.com/redblobgames/mapgen2 · încredere: ridicat
- **Implicație:** Codul e sub Apache-2.0, deci poți porni de la el. Dar tehnica e pentru harta de LUME (nivel strategic, regiuni), nu pentru harta de joc de 250×250 celule unde jucătorul sapă. Dacă faci modelul RimWorld (hartă de lume + hartă de regiune), Voronoi e potrivit exact pentru stratul de sus.

### Modelul „open world" al RimWorld e o hartă de lume cu zeci de mii de tile-uri și o hartă de joc finită, iar acoperirea globului costă performanță

- **Detaliu:** „O lume generată ține zeci de mii de tile-uri." Acoperirea globului (globe coverage) e un procent reglabil: mai mare = lume mai plină, dar încărcare mai lentă și impact pe sisteme slabe. Comparativ cu 30%, o lume 100% deschide harta mai încet și autosave-urile zilnice sacadează vizibil pe unele sisteme. Fiecare tile de lume are un tip de teren (Flat, Small Hills, Large Hills, Mountains) care determină cât munte se generează pe harta de joc, plus medii proprii de temperatură (altitudinea mai mare și distanța de ecuator = mai rece).
- **Sursă:** https://rimworldaccess.com/starting/world-map-site/ + rezumat al https://rimworldwiki.com/wiki/World_generation (pagina blocată 403 la acces direct) · încredere: mediu
- **Implicație:** ADOPTĂ MODELUL ĂSTA. Două reprezentări separate: (1) harta de lume = graf de tile-uri cu biom/altitudine/temperatură, ieftină, generată o dată; (2) harta de joc = grilă voxel finită, generată DIN tile-ul ales. Îți dă „open world" perceput fără streaming continuu — adică elimini cea mai scumpă clasă de bug-uri pentru un dev solo. Dimensiunea exactă a hărții de joc RimWorld (250×250) NU am putut-o confirma din sursă primară.

### Sapiens a mutat fizica și generarea de teren pe thread-uri separate ca soluție de performanță

- **Detaliu:** Devlog: „muncă mutată de pe thread-ul principal pentru a îmbunătăți frame rate-ul", fizica și generarea de teren pe thread-uri diferite. În aceeași perioadă a obținut 75 fps stabil în VR pe Oculus Rift DK2 — indiciu că bugetul de frame era deja foarte strâns.
- **Sursă:** https://wiki.playsapiens.com/index.php/Sapiens_Devlog_6 · încredere: mediu
- **Implicație:** Proiectează generarea și meshing-ul chunk-urilor ca job-uri pe worker threads DE LA ÎNCEPUT, cu un queue și aplicarea mesh-ului pe thread-ul principal. Retrofitarea threading-ului peste cod care atinge direct structuri partajate e una dintre cele mai scumpe refactorizări posibile. Costul inițial: ~2 săptămâni. Costul retrofitării: luni.

### GPU instancing-ul din Unity NU acoperă personajele animate și intră în conflict cu SRP Batcher

- **Detaliu:** Mesh Renderer da, Skinned Mesh Renderer NU — personajele cu schelet sunt excluse explicit din GPU instancing. GPU instancing funcționează cu shadere custom doar dacă SRP Batcher e dezactivat sau shaderul e făcut incompatibil cu el. Instanțierea merge cu obiecte dinamice pe Light Probes și cu obiecte statice pe lightmaps dacă împart aceeași textură de lightmap.
- **Sursă:** https://docs.unity3d.com/Manual/GPUInstancing.html · încredere: ridicat
- **Implicație:** Cei „300 de agenți" nu se rezolvă cu instancing naiv. Ai două opțiuni reale: (a) animație coaptă în textură (vertex animation textures) + instancing — agenții devin mesh-uri statice animate în shader; (b) BatchRendererGroup / Entities Graphics. Pentru un dev solo, (a) e mult mai ieftină și e tehnica standard pentru mulțimi. Bugetează ~3 săptămâni pentru pipeline-ul de coacere a animațiilor.

### Mass Entity din Unreal e framework-ul pentru mulțimi de agenți, cu LOD stocat la nivel de chunk de memorie

- **Detaliu:** Framework data-oriented în UE5: Fragments (bucăți atomice de date), Entities (colecții de fragmente), Archetypes (grupuri de entități cu compoziție identică). Entitățile sunt organizate în chunk-uri de memorie pentru performanță la citirea fragmentelor din același arhetip. ChunkFragments sunt folosite pentru date per-chunk în procesare managerială, „cum ar fi calculele de Level of Detail (LOD)". Processors operează pe batch-uri prin EntityQueries, fără să atingă identificatori individuali. Documentația NU dă cifre de agenți.
- **Sursă:** https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-entity-in-unreal-engine · încredere: mediu
- **Implicație:** LOD-ul de AI (nu doar de randare) e conceptul de reținut: agenții departe de cameră sau în afara nivelului vizibil rulează la tick redus sau simulat statistic. Într-un colony sim cu slice view, agenții de pe etajele ascunse sunt candidații evidenți pentru tick redus — și asta nu costă nimic vizual, pentru că oricum nu sunt desenați.

### Rezervorul de unități de pe hartă e plafonat la generare în Going Medieval, nu regenerat dinamic

- **Detaliu:** Devlog #1: brushmap-urile plasează props (copaci, pietre, plante) iar „numărul total al acestor unități nu poate fi mai mare decât cel predeterminat la generarea hărții". Sistemul de floră care să permită regenerarea independentă (de ex. copacii) era la momentul devlog-ului doar PLANIFICAT.
- **Sursă:** https://foxyvoxel.itch.io/going-medieval/devlog/82027/devlog-1-terrain-creation · încredere: ridicat
- **Implicație:** Un plafon fix pe props e o decizie de performanță ȘI de gameplay (resursele hărții sunt finite → presiune de expansiune). Adopt-o: e mai ieftin de implementat decât regenerarea și dă tensiune economică gratuit. Regenerarea o adaugi mai târziu, ca sistem separat, exact cum au făcut și ei.

## Implicații de design

- Reprezentarea terenului se decide O SINGURĂ DATĂ și nu se mai poate schimba — e fundația pe care stau camerele, stabilitatea, pathfinding-ul, temperatura și slice view-ul. Fixeaz-o în prima lună, cu un prototip care sapă și construiește, înainte de orice gameplay.
- Terenul blocky (voxeli cubici) nu e un compromis de calitate, e o alegere care DEBLOCHEAZĂ gameplay: camere prin flood fill, stabilitate prin decrement pe grilă, pathfinding pe tile, slice view prin ascunderea straturilor. Terenul neted le complică pe toate cinci simultan și îți cere un al doilea strat logic de grilă oricum — adică plătești de două ori.
- Adoptă separarea RimWorld: hartă de lume (graf de tile-uri, ieftin, Voronoi/noise) + hartă de joc finită (grilă voxel, generată din tile-ul ales). Asta îți dă senzația de „open world" fără streaming continuu — și elimină cea mai scumpă clasă de bug-uri pentru un om singur.
- Chunk de 16³, nu 32³. Într-un colony sim se schimbă zeci de celule simultan, iar re-meshing-ul la 16³ costă de ~7x mai puțin (415 µs vs 2820 µs pentru 50 de chunk-uri).
- Doi mesheri, nu unul: greedy meshing pe construcții și straturi de rocă uniformă (câștig 50-500x), culling simplu pe stratul de suprafață zgomotos (unde greedy dă doar 24% și costă 3x mai mult timp).
- Râurile se generează ÎNAINTEA terenului, nu peste el. Ține `riverDistance` ca un câmp per-celulă de primă clasă — îl refolosești la biomi, fertilitate și plasarea așezărilor. Eroziunea hidraulică rămâne un pas cosmetic offline, nu sursa de adevăr.
- Slice view-ul are nevoie de UN SINGUR invariant declarat, testabil: nivelul activ N = solid, sub N = estompat, peste N = ascuns, toate ordinele se aplică la N. Jumătățile de nivel din Going Medieval sunt sursa unei plângeri documentate de jucători — nu le copia.
- Camera (room) e un flood fill 3D, nu 2D per etaj. Scările unifică termic etajele — tratează asta ca mecanică (hornuri, pivnițe, curenți), nu ca bug. Cachează ID-ul camerei per celulă și invalidează doar componenta atinsă.
- Stabilitatea structurală se implementează ca int8 propagat prin BFS de la sol (4 la sol, -1 per pas, 0 = imposibil), NU ca simulare de forțe. E prezicibil de jucător, debuggabil de tine și costă o săptămână.
- Agenții animați nu se instanțiază naiv în niciun motor. Bugetează pipeline-ul de vertex animation textures (~3 săptămâni) sau acceptă un plafon de agenți mult sub 300 pentru versiunea 1.
- LOD-ul de AI contează mai mult decât LOD-ul de randare: agenții de pe etajele ascunse de slice view pot rula la tick redus fără niciun cost vizual, pentru că oricum nu sunt desenați.
- Threading-ul pentru generare și meshing se proiectează de la început (~2 săptămâni). Retrofitarea lui peste cod care atinge direct structuri partajate costă luni.
- Externalizează arta (modele, animații), nu construi pipeline propriu — e modelul dovedit al lui Frampton, singurul dev solo din referințe care a livrat un joc din genul ăsta.
- Plafonează numărul de props la generarea hărții. E mai ieftin decât regenerarea dinamică și îți dă gratuit presiune economică de expansiune.

## Riscuri

- Scopul. Going Medieval: ~6 ani de la primul devlog la 1.0, cu studio. Sapiens: 10 ani solo, motor propriu. Semnal de alarmă: dacă la 6 luni nu ai încă un pawn care sapă un tunel și construiește un perete stabil deasupra, planul e de 3x prea mare și trebuie tăiat, nu accelerat.
- Dublarea reprezentării. Dacă alegi teren neted pentru vizual dar ai nevoie de grilă pentru logică (camere, stabilitate, pathfinding), ajungi cu două surse de adevăr care divergează. Semnal: primul bug de tip „peretele arată că e acolo dar pawn-ul trece prin el".
- Dependența de Voxel Plugin 2 în Unreal. Documentația proprie spune „poate fi buggy uneori" și că funcționalitățile noi nu sunt documentate. Semnal: un update de UE sau de plugin care îți rupe terenul și nu ai interfață proprie în spatele căreia să-l înlocuiești.
- Slice view-ul care se transformă în groapă fără fund de UX. E problema nerezolvată elegant în tot genul, dovedit de plângerile despre jumătățile de nivel din Going Medieval. Semnal: te trezești adăugând al treilea mod de vizualizare ca să repari al doilea.
- Râurile generate prin eroziune peste noise. Nu garantează conectivitate, nu garantează monotonie descendentă, iar autorul implementării de referință recunoaște că „nu reușește canioane" și că nivelul apei sare la punctele de drenaj. Semnal: un râu care curge în sus sau se termină în mijlocul unui deal.
- Flood fill-ul de camere rulat pe toată harta la fiecare modificare de celulă. La 1.000.000 de celule și o echipă care sapă un tunel, asta e o buclă de milisecunde care devine secunde. Semnal: sacadare corelată cu ordinele de construcție, nu cu numărul de pawn-uri.
- Greedy meshing aplicat orbește pe tot. Pe teren zgomotos câștigi 24% și plătești 3x timp de meshing — pierdere netă. Semnal: timpii de re-mesh cresc când sapi în stratul de suprafață și scad când sapi în rocă.
- „300 de agenți" ca țintă nediscutată. Skinned Mesh Renderer nu se instanțiază în Unity; fără pipeline de animație în textură, ținta e nerealistă. Semnal: framerate care scade liniar cu numărul de pawn-uri, nu în trepte — înseamnă că plătești per draw call.
- Adâncimea hărții aleasă din constrângere tehnică, nu din UX. Dacă ai 16 straturi și jucătorul poate ține în cap 4, ai plătit pentru complexitate pe care nimeni nu o folosește. Semnal: telemetrie (sau propriile sesiuni de test) care arată că nimeni nu coboară sub nivelul 3.
- Motorul ales pentru motivul greșit. Unreal nu îți streamează chunk-urile voxel proprii (World Partition e pentru actori); Unity nu are nimic first-party pentru voxeli; Godot are godot_voxel complet dar nu-l cunoști. Semnal: la 3 luni te lupți cu motorul în loc cu jocul.

## Întrebări deschise

- Nu am putut confirma din sursă primară dimensiunea hărții de joc RimWorld (250×250 e din memorie, neconfirmat — rimworldwiki.com returnează 403). Merită verificat direct în joc înainte să calibrezi.
- Contradicție neelucidată: devlog-ul Going Medieval din 2019 spune „16 unități înălțime", ghidurile de joc spun bedrock la nivelul 1.0 și construcție până la 5.0. Nu știu dacă sistemul s-a schimbat sau dacă „unitatea" ≠ „nivelul". Trebuie verificat în jocul curent (1.0, martie 2026).
- Nu am găsit nicio sursă publică despre cum face Going Medieval iluminarea și umbrele la săpat — dacă re-calculează lumina pe chunk, dacă folosește AO coapt sau lumini dinamice. E o întrebare cu impact mare pe buget și nu am răspuns.
- Nu am putut confirma cifre concrete de agenți pentru Unreal Mass Entity — documentația oficială nu dă niciun număr. Ținta de 300 de agenți rămâne neverificată în orice motor.
- Nu am reușit să accesez detalii tehnice despre Voxel Plugin 2 (meshing, LOD, streaming, performanță) — documentația publică e subțire. Înainte de orice decizie de motor bazată pe el, trebuie testat un prototip real.
- Nu știu cum rezolvă Sapiens digging-ul volumetric pe o sferă cu fețe hexagonale — documentația de modding acoperă worldgen, nu modificarea terenului în timp real. Dacă modelul Sapiens rămâne pe masă, asta e golul de umplut.
- Nu am date despre cât costă flood fill-ul de camere la scara ta (256×256×12) cu invalidare incrementală. Trebuie măsurat în prototip, nu estimat.
- Nu am verificat licențierea godot_voxel — documentația nu o menționează, deși proiectul e open source. De confirmat înainte de orice decizie de motor.

## Recomandări

- Alege grila voxel cubică cu rampe (modelul Going Medieval) și scrie asta în documentul de design ca decizie ÎNCHISĂ, cu motivele: deblochează camere, stabilitate, pathfinding și slice view simultan, la o memorie de ~2-4 MB pentru o hartă de 250×250×16.
- Fixează dimensiunile: hartă de joc 256×256×12 celule (8 deasupra solului, 4 sub), chunk 16×16×16, 2 bytes per celulă (tip + stare). Dă 96 de chunk-uri pe orizontală × pași verticali — un buget de re-mesh confortabil sub 1 ms per operație de săpat.
- Construiește în prima lună un prototip vertical care face EXACT patru lucruri: generează harta, sapă o celulă cu re-mesh, construiește un perete, calculează stabilitatea. Fără AI, fără UI, fără artă. Dacă asta nu merge fluid, nimic din restul nu contează.
- Implementează stabilitatea ca int8 propagat cu BFS: 4 la sol, -1 per pas de la o sursă de suport, 0 = nu se poate plasa, grinda are rază 10. Copiază numerele Going Medieval — sunt testate pe sute de mii de jucători.
- Generează râurile PRIMUL: graf de surse → confluențe → vărsare, apoi coboară terenul de-a lungul lor, apoi rulează eroziune particulară pe 256² ca pas cosmetic offline. Ține `riverDistance` ca un câmp per-celulă.
- Adoptă modelul cu două hărți (lume + regiune). Harta de lume: Voronoi/noise, zeci de mii de tile-uri, cu biom + altitudine + temperatură per tile. Harta de joc: generată din tile-ul ales. Asta e „open world"-ul tău și costă de 10x mai puțin decât streaming continuu.
- Decide slice view-ul cu un singur invariant scris în cod ca test: nivel activ solid, sub = estompat, peste = ascuns, ordinele merg la nivelul activ. Fără jumătăți de nivel. Testează cu 3 oameni reali înainte să construiești altceva peste.
- Fă camerele cu flood fill 3D 6-conectat, cu ID de cameră cachat per celulă și invalidare doar pe componenta atinsă. Acceptă că scările unifică termic etajele și transformă asta în mecanică.
- Proiectează generarea și meshing-ul ca job-uri pe worker threads din prima zi, cu un queue și aplicarea mesh-ului pe main thread. Nu amâna — retrofitarea costă luni.
- Pentru motor, cântărește explicit trei variante și scrie decizia: (a) Unreal 5.7 + Voxel Plugin 2 — folosești ce știi, dar dependență plătită și auto-declarat instabilă, deci OBLIGATORIU izolată în spatele unei interfețe proprii; (b) Godot + godot_voxel — economisești 6-12 luni de cod de teren, dar înveți un motor nou; (c) Unity — ce a folosit Going Medieval, dar scrii terenul de la zero. Dacă terenul e riscul principal, (b) îl elimină; dacă familiaritatea e riscul principal, (a) cu izolare.
- Bugetează explicit un pipeline de vertex animation textures pentru agenți (~3 săptămâni) SAU coboară ținta de agenți la 60-80 pentru versiunea 1 și ridic-o mai târziu. Nu lăsa „300 de agenți" nedecis.
- Aplică greedy meshing selectiv (construcții și rocă uniformă) și culling simplu pe stratul de suprafață. Măsoară ambele înainte să decizi — pe date reale, nu pe intuiție.
- NU implementa: teren neted cu Marching Cubes scris de la zero, LOD de teren (harta e finită, nu ai nevoie), WFC pentru generarea continentului, simulare de forțe pentru stabilitate, reprezentare tetraedrică. Fiecare dintre astea e un risc de luni fără câștig de gameplay.
- Rezervă de la început câmpuri per-celulă pentru: tip, stare, ID cameră, stabilitate, lumină. E mult mai ieftin să ai byte-ii acolo de la început decât să lărgești structura după ce ai 20.000 de linii de cod care o citesc.

