# Panoul de arhitectura — cele 4 propuneri



---

## 1. Sămânță & Bulă (Seed World + Hot Bubble)

**Teza:** Lumea deschisă și baza adâncă nu sunt două sisteme, ci două REPREZENTĂRI ale aceluiași teren de 1 m: lumea e infinită fiindcă e o funcție pură de seed (se generează, nu se stochează), iar adâncimea Going Medieval există integral, dar numai înăuntrul unei „bule fierbinți" de 256×256×48 celule ancorate de așezare — restul lumii e teren real, vizitabil și săpabil la suprafață, fără semantică de cameră.

### Teren
TREI FORMATE ALE ACELUIAȘI TEREN, cu un contract de conversie explicit. Grilă cubică 1 m. X/Z: int32, lume practic infinită, bordură logică la ±524.288 m (latură 1.048.576 m — același ordin ca lumea implicită Vintage Story de 1.024.000 blocuri). Y: int16 în [−128, +127] față de nivelul mării (span 256 m, tot ca Vintage Story, world height 256).

(0) COLD — nimic stocat. `column(seed,x,z)` → {surfaceY int16, rockY int16, soil u8, biome u8, moisture u8, riverDist u8} = 8 B calculați, 0 B pe disc. 4 octave noise 2D + 1 domain warp; estimez 30-60 ns/coloană în JS cu typed arrays ⇒ chunk 32×32 = 1024 coloane ≈ 0,05 ms; inel de 25×25 chunks ≈ 30 ms într-un Worker. (estimare, încredere scăzută pe constanta exactă)
DOVADA că delta-only e singura variantă: Vintage Story, care PERSISTĂ chunk-urile generate, ajunge la 3,71 GB pentru o hartă 10.000×10.000 blocuri complet explorată (măsurătoare de jucător, confirmată de staff: „10k x 10k ≈ 3-4 GB") ⇒ ~37 B per coloană de suprafață, comprimat. Cu regenerare din seed, 1.000 km² nevizitați costă 0 B.

(1) WARM — streamed, vizibil, fără semantică. Chunk = 32×32 XY × coloană verticală întreagă (ca Vintage Story: chunk 32×32×32, map region = 16×16 chunk columns). Stocare: RLE pe Y, `Run{yTop int16, material u8, flags u8}` = 4 B. Coloană naturală = 4-6 runs (aer / sol vegetal / subsol / rocă / filon / bedrock) ⇒ 16-24 B/coloană, 16-24 KB/chunk. Rază warm 12 chunks = 384 m ⇒ 25×25 = 625 chunks ≈ 12,5 MB rezidenți.

(2) HOT — bula de simulare, DENS, SoA în typed arrays. 256×256×48 = 3.145.728 celule:
 material Uint8Array 3,15 MB · flags Uint8Array 3,15 MB (walkable/support/sealed/roof/reserved) · regionId Uint16Array 6,29 MB · stability Uint8Array 3,15 MB · occupant Int16Array 6,29 MB (−1 = liberă; ĂSTA e suportul constrângerii 4). Total ≈ 22 MB + ~4 MB regiuni/camere/rute. 7 bytes/celulă.
 Fereastra Y a bulei: 48 de niveluri, `yBase = clamp(medianSurface − 32, −128, 79)` ⇒ 32 m de săpat sub sol, 15 m de construit deasupra.
 Scară comparativă: Going Medieval large = 266×266×16 ≈ 1,13 M celule (small 206×206; height 16; valori din MapSizes.json citate de jucători pe forumul Steam — ATENȚIE, contrazic cifra 250×250×16 din pasa anterioară de research; nu pot reconcilia, încredere medie pe 206/266, mare pe height=16). Bula noastră = 2,8× volumul unei hărți GM mari, pe amprentă XY aproape identică.
 Bule secundare pentru avanposturi: max 3 × (64×64×48 = 196.608 celule, ~1,4 MB fiecare).

(3) DELTA persistat: per chunk, `{ xzLocal u16, y i16, material u8, flags u8 }` = 6 B/celulă editată, RLE pe Y. Așezare matură ≈ 200.000 celule editate ≈ 1,2 MB; save cu 5 situri + 3.000 chunks atinse ≈ 10-20 MB total.

RANDARE ORGANICĂ PESTE GRILĂ (regula anti-Ostriv): vertexul de colț = media topurilor celor 4 coloane vecine, CLAMPATĂ la ±0,45 m față de topul celulei logice — suprafața vizibilă nu se depărtează niciodată cu mai mult de jumătate de celulă de cea logică. Diferențe > 1 celulă NU se netezesc: devin fețe de stâncă, cu 8 variante de mesh alese din hash(x,z). Fără texturi pe teren: flat shading + vertex color dintr-un LUT de 32 de culori.

### Lume
„Open world ca Sapiens" = patru ingrediente, din gura dev-ului și din pagina Steam, nu din impresii. Frampton: „Am creat o sferă la început, care era lumea. Apoi am rafinat-o 10 ani" și „elementul unic e lumea aia, mai mare decât Pământul, explorabilă și manipulabilă fără cusături, la nivelul solului". Steam: „mii de medii generate procedural pe o hartă mai mare decât Pământul".
Ingredientele sunt deci: (a) fără bordură vizibilă; (b) detaliu la nivelul solului ORIUNDE; (c) terenul se modifică oriunde; (d) poți pleca și întemeia tabere departe.
Toate patru se livrează din Tier 0+1. NICIUNA nu cere sferă. Deci: LUME PLATĂ, cu wrap toroidal opțional la ±524 km. Pierdem curbura, ocolul planetei, polii. Câștigăm coordonate întregi peste tot, chunks pătrate, LOD trivial, zero degenerare la poli, zero dublă precizie.
Silueta lumii: 3 inele de LOD — warm 384 m (mesh complet), medium 384 m→1,5 km (heightfield quadtree, 1 vertex/4 m), far 1,5→6 km (impostor + siluetă de relief). Peste 6 km: hartă strategică 2D, unde se mișcă partidele de călători și pulsează siturile.
SITURI PERSISTENTE (teza de produs, și pilonul care face lumea să pară vie fără a o simula): fiecare așezare părăsită se îngheață ca (delta de chunk comprimat + ~400 B de stare abstractă: populație, decădere, rată de jefuitori, stoc). Tick abstract o dată pe zi de joc, O(număr de situri). Revii la ea, se re-hidratează în bulă în câteva sute de ms și e ruină, avanpost sau cuib de jefuitori.
LECȚIA COMERCIALĂ, brutală: Sapiens, cu cea mai scumpă lume deschisă din categorie, are 1.385 de recenzii (79% pozitiv; RECENT 25% din 28) și ultimul update de dev de peste 12 luni, după 10 ani de un om. Going Medieval, cu hartă de 266×266 și zero open world, a făcut 175k în prima săptămână de EA și a ajuns la 1.0 pe 17.03.2026. Senzația de lume deschisă e un multiplicator de atmosferă, nu un motor de vânzări — se plătește exact atât cât face, adică Tier 0+1, nu o sferă.
CONTRADICȚIE DE SEMNALAT: wiki-ul de modding Sapiens dă „1 metru ≈ 0,00000023 unități în baseAltitude", ceea ce pe o sferă normalizată de rază 1 ar da rază ≈ 4.348 km — SUB Pământ (6.371 km) —, în timp ce pagina Steam spune „mai mare decât Pământul". Nu le pot reconcilia (probabil scara altitudinii ≠ scara razei). Încredere scăzută pe raza exactă; încredere mare pe faptul că terenul Sapiens e per-vertex pe o sferă subdivizată hexagonal (niveluri de subdiviziune 13-21, „river distance 1 ≈ 7650 hexagoane"), deci un heightfield sferic — fără caverne, fără overhang (ultima parte e inferență, nu afirmație din sursă).

### Constructie
HIBRID: grilă 1 m pentru LOGICĂ, organic doar la PREZENTARE. Constatarea centrală a research-ului rămâne în picioare: nu există joc livrat cu interioare simulate multi-etaj ȘI plasare fără grilă. Norland are interioare ⇒ e pe grilă. Foundation e fără grilă ⇒ n-are interioare și nici coliziune.

PIESE, nu volume: pereții și ușile stau pe MUCHIILE celulei, podelele pe fața de jos, acoperișurile pe fața de sus. Consecință: pereți de grosime logică 0 ⇒ o cameră de 2×2 funcționează, iar un zid nu fură celule de circulație.
Tipuri: floor · wall · door · window · stairs · support · roof · diagonalWall (piesă de clasa întâi, ocupă o celulă întreagă, tratată ca două jumătăți de muchie la 45°).
MULTI-ETAJ: +15 niveluri deasupra ancorei (5 etaje de 3 m sau 15 platforme de 1 m), −32 dedesubt. Slice view cu fade de acoperiș pe nivelul curent.
SUBTERAN: săpat liber în bulă; galerii, pivnițe, cripte. În afara bulei se poate săpa DOAR până la −4 (o groapă, o carieră) și fără piese de construcție — asta e granița pe care o plătesc conștient.

STABILITATE: sistemul prin decrement al Going Medieval, copiat cu numerele lui fiindcă e cel mai ieftin mecanism care produce decizii reale: 4 la sol, −1 per celulă de distanță, maxim 3 celule de consolă nesusținută, grinzi până la 10 celule. Recalculare BFS incrementală din celula schimbată, oprită când valoarea nu se mai modifică (tipic <200 de celule atinse, <0,1 ms). Precedent independent că decrementul supraviețuiește oricărei topologii: Valheim (graf de piese, maxSupport/minSupport, pierdere verticală vs orizontală; lemn 16 m, core-wood 24 m, wood-iron 50 m).

CLĂDIRI MARI / MONUMENTE: contractul de module al lui Foundation, dar redus la osul lui. La ei: BUILDING_PART (27 câmpuri) + attach nodes deduse din NUMELE nodului FBX, iar validarea monumentului e banală — `RequiredPartList = [{Category, Quantity}]` (ex. CORE×1, EXTENSION×2, DOOR×1). La noi: 6 tipuri de nod, aceeași validare, plus regula că nodurile se aliniază pe grilă (ceea ce omoară din start problema lor nerezolvată după 7 ani: alinierea pe înălțime pe teren înclinat, Devlog #20 feb. 2026, și snapping-ul pe proximitate „două puncte albe trebuie să se atingă").
ZIDURI PARAMETRICE, nu module: precedentul de aur pentru un dev fără artist e WALL_CONFIG din Foundation (Width, Height, CrenationDistance, UvTilingWall/Top, offset-uri) ⇒ mesh generat. Un singur sistem acoperă garduri, palisade, ziduri de incintă și creneluri.
ORGANIC LA PREZENTARE: variante de mesh din hash de coordonate · diagonale la 45° · props off-grid cu poziție float în celulă (ca Sims 4) · cărări din contoare de trafic per celulă (uint8 saturat, ca Ostriv unde drumul se uzează la trecere și jucătorul nu-l desenează). Diferența față de Ostriv, unde drumurile au rămas cvasi-cosmetice: la noi cărarea dă +15% viteză de mers, deci e un sistem de gameplay, nu un shader.
ECONOMIE ADÂNCĂ IEFTINĂ: trucul burgage plot din Manor Lords — atelierul e o EXTENSIE a locuinței, lanțul de producție trece PRIN casă. Adâncime economică fără clădiri noi de modelat.

### Camere si temperatura
Arhitectura RimWorld, portată pe 3D, cu numerele ei reale.
STRAT 1 — REGIUNI. Celulele se grupează în regiuni de maxim 12×12 pe UN singur nivel Z (RimWorld, wiki verbatim: harta e împărțită în chunk-uri de 12×12 numite map regions; o regiune nu se extinde niciodată dincolo de grila inițială de 12×12, se subdivide dacă nu e contiguă și fuzionează când se poate). Bula 256×256×48 ⇒ maxim 22×22×48 = 23.232 de regiuni, practic 3.000-6.000 nevide. Verticalitatea e o MUCHIE de regiune, nu o regiune 3D: scările și golurile de podea produc legături între regiuni de pe niveluri vecine.
STRAT 2 — CAMERE. Flood fill pe graful de regiuni, nu pe celule. RimWorld plafonează camera la 36 de regiuni (max 5.184 celule, 72×72); noi plafonăm la 48 de regiuni. Orice spațiu care atinge cerul sau marginea bulei e „exterior" și nu devine cameră.
STRAT 3 — TEMPERATURĂ: O SINGURĂ valoare per cameră, zero simulare per celulă. Modelul e literal `EqualizeTemperaturesThroughBuilding` din RimWorld: media temperaturilor camerelor adiacente, delta × rate, normalizată prin CellCount al grupului. Ușa/fereastra = conductanță mare, peretele = mică dar nenulă, podeaua spre subteran = conductanță spre temperatura solului.
RITM: un pas de egalizare la fiecare 15 tick-uri (0,75 s la 20 Hz) peste toate camerele. Cu ~150 de camere active, sub 0,05 ms/pas. Temperatura solului la adâncime NU se simulează: e o funcție de (adâncime, biom, anotimp) — de asta pivnița săpată la −6..−10 e o decizie de arhitectură a jucătorului, nu un accident de simulare.
PRAGUL DE 5 °C pentru conservarea hranei rămâne pilonul: e singurul lucru care leagă săpatul (Going Medieval) de supraviețuirea sezonieră.
COSTUL DE ÎNTREȚINERE, sincer: fiecare perete pus sau dărâmat invalidează 1-4 regiuni și forțează un re-flood al camerei afectate. Buget: dirty-set procesat amortizat, maxim 64 de regiuni recalculate per tick, restul la tickul următor. Un jucător care dărâmă 40 de pereți dintr-odată vede camerele stabilizându-se în ~3 tick-uri (150 ms), nu instantaneu — compromis acceptat.
CE SE RUPE ȘI RECUNOSC: o cameră nu are voie să traverseze granița bulei. Nu poți avea un tunel încălzit de 2 km între două așezări. Tunelul există ca teren săpat în warm; nu e cameră, n-are temperatură, nu conservă hrana.

### Coliziune intre agenti
`occupant: Int16Array` per celulă în bulă (−1 = liberă). Nicio suprapunere, niciodată — inclusiv pentru pionii nedrafted, ceea ce niciuna dintre referințe nu face (RimWorld are Cost_PawnCollision=175 doar la drafted; DF permite trecerea unul peste altul „mult mai încet"; Factorio a ELIMINAT coliziunea între biteri, FFF-316/317; Foundation n-are coliziune deloc).

PLANNER: PIBT, un singur pas per tick, 20 Hz. Numere: 8.000 de agenți în 0,021 s ⇒ ~2,6 µs/agent/pas ⇒ 40 de agenți ≈ 0,1 ms, adică 0,2% dintr-un tick de 50 ms. Rezolvă gratis push (priority inheritance) și rotațiile în ciclu, fără tabel de rezervări persistent. NU WHCA* (Silver, W=16, 100 agenți: costul continuu ajunge la ~50 ms = un tick întreg). NU CBS (se măsoară cu timeout de 30 s).

CAPCANA CARE DECIDE TOTUL: garanția PIBT e verbatim că toți agenții își ating destinația în timp finit „când mediul e un graf în care orice pereche de noduri adiacente aparține unui ciclu simplu (ex. biconex)". Un colony sim e numai fundături: dormitor, galerie, depozit. Garanția CADE. Rezolvarea mea, în 8 piese concrete:
1. Analiza de biconexiune NU rulează pe graful de celule, ci pe graful de REGIUNI 12×12 (~4.000 noduri, ~12.000 muchii).
2. Hopcroft–Tarjan (puncte de articulație + componente biconexe), O(V+E) ≈ 16.000 operații ≈ 0,2 ms, rulat DOAR când graful de regiuni se schimbă (perete/ușă/scară), nu per tick.
3. Fiecare ramură-arbore atârnată de un punct de articulație primește un TOKEN DE CAPACITATE = (celule walkable în ramură) − 1. Un agent nu intră fără token. O fundătură devine o resursă contabilizată, nu o capcană. (Extensiile PIBT-TP / PIBT-TP-TA tratează exact cazul „zonă biconexă + arbori atașați" — le folosesc ca justificare teoretică, nu ca implementare.)
4. Coridor de lățime 1 mai lung de 6 celule fără nișă de trecere ⇒ SEMAFOR one-way alternant (2 bytes: sens curent + contor de ocupanți), sensul comută când iese ultimul agent.
5. SCĂRILE = două transporturi UNIDIRECȚIONALE suprapuse (trucul ONI, care rezolvă scara bidirecțională cu un stâlp jos și o scară sus). Nu există swap pe scară fiindcă nu există muchie bidirecțională.
6. VALIDARE LA PLASARE, tip Ostriv hotfix 11 (23.01.2025, 3 săptămâni de muncă, a amânat Alpha 6): drum de la nodul de intrare până la FIECARE ușă, pat și atelier; clădirea care rupe accesibilitatea intră în fail state și UI-ul arată CE intrare a blocat.
7. ANTI-GOING-MEDIEVAL: o comandă de demolare nu poate viza celula-suport a propriului agent, iar rezervările trăiesc EXACT un tick (PIBT le are gratis). Bug-ul GM nu era coliziune — settlerul își demola scara de la mijloc și se zidea singur.
8. RUTA lungă: A* ierarhic pe regiuni (Going Medieval rulează A* pe regiuni de ~420 noduri; Songs of Syx are niveluri 8×8 → 16×16 → 32×32 → dimensiunea hărții, cu costuri de cluster recalculate doar când clusterul se schimbă). PIBT execută doar pasul următor de-a lungul rutei; ruta se re-planifică lazy când un cluster de pe traseu devine dirty (fixul pentru ONI, unde un path precalculat invalidat face dupe-ul să oscileze pe scară până moare).
SUPAPA, care NU încalcă constrângerea 4: un agent blocat >3 secunde își ANULEAZĂ sarcina și se reprogramează (backoff la nivel de task). Refuz explicit soluția DF (trecere unul peste altul cu penalizare) — e exact scurtătura pe care owner-ul a interzis-o.
CE PIERDEM CU EXCLUSIVITATEA: valoarea tactică a coridorului nu vine din corpuri. În DF vine din poduri mobile, capcane, plăci de presiune, fortificații. Punem acolo bugetul de design, nu în „gâtuituri blocate cu pioni".

### Realism
TREAPTA b+: low-poly stilizat, iluminare și atmosferă bune. NU realist. Nu e preferință, e consecință a trei constrângeri deja luate: (1) teren săpabil la runtime ⇒ fără lightmaps coapte, iar Nanite nu e făcut pentru geometrie generată la runtime; (2) slice view + fade de acoperiș se bate cu orice GI cu transparență complexă — chiar și în Going Medieval, stilizat, toggle-ul de acoperiș are buguri de hitbox rămas; (3) 60 FPS pe hardware modest, unde Lumen țintește 4 ms@60fps la 1080p, iar fiecare treaptă de calitate ≈ jumătate din costul celei de deasupra.
SPECIFICAȚIE CONCRETĂ: teren flat-shaded cu vertex color dintr-un LUT de 32 de culori, ZERO texturi de teren · module de clădire 300-1.200 triunghiuri, UN singur atlas 1024² pentru tot jocul, fără normal maps · agenți: 1 mesh de bază ~900 triunghiuri, 3 siluete, haine ca 5-8 mesh-uri atașate, GPU skinning · soare direcțional + ambient de cer + SSAO la jumătate de rezoluție · fără GI, fără SSR, fără ray tracing.
AGENȚII NU SUNT CONSTRÂNGEREA: UE5 Animation Budget Allocator duce 64 de personaje de la 14,2 ms la 4,0 ms; VAT+instancing a dus 6.072 de agenți de la 21.369 la 276 de draw calls. Noi avem 40. VAT-ul nu e necesar.
COSTUL REAL E AUTORAREA, nu randarea: 30-60 de clipuri de muncă + variante de haine + LOD-uri. De asta aleg ANIMAȚIE PROCEDURALĂ: IK cu 2 oase pe picioare, IK de mână pe unealtă, bob de bazin din faza pasului, plus doar 6 clipuri scurte cheie (lovitură de topor, ridicare, așezare, dormit, mâncat, cădere). La cameră izometrică, cu siluete de 40-60 px, e suficient. (încredere medie — judecată de design, nu sursă.)
BANI 2026: Megascans nu mai e gratuit ($0,99/asset, Bridge deprecat mai 2026) · KitBash3D $708/an cu doar ~2.000 din 20.000 de modele game-ready · Synty $10-150/pack DAR licența standard INTERZICE AI generativ · env artist freelance $25-45/h în Europa de Est · Steam Direct $100. Recomandarea: modelezi tu în Blender pe paleta de 32 de culori; un modul = 30-90 min, 40 de module ≈ 2 săptămâni. Un stil vădit făcut de mână e și apărarea reputațională (Party Animals: >800 recenzii negative în <24h, Very Positive → Mostly Negative; Shrine's Legacy lovit pe o acuzație FALSĂ; Steam a rescris formularul pe 16.01.2026, Pre-Generated vs Live-Generated, uneltele de dev exceptate).
ȚINTA DE HARDWARE: sub Sapiens, care cere minim GTX 970 / 8 GB RAM. Noi țintim GTX 1050 2GB / i5-4670 / 8 GB (min-spec-ul Manor Lords), ceea ce e realist FIINDCĂ nu avem skeletal crowd de 400 de săteni, ci 40 de agenți.

### De ce se simte ca Sapiens
Fiindcă livrează exact cele patru ingrediente pe care Frampton însuși le numește, și niciunul dintre cele pe care le-a plătit scump degeaba.
(a) FĂRĂ BORDURĂ: mergi 5 km în orice direcție și nu există „marginea hărții" — prima vină pe care o are Ostriv, unde lumea e 7 hărți hardcodate, zonă jucabilă 512×512, cu numele hărților în binar (nici modderii nu pot adăuga).
(b) DETALIU LA NIVELUL SOLULUI ORIUNDE: inelul warm de 384 m e mesh complet, identic ca fidelitate cu cel de sub așezare. Terenul de la 3 km nu e o textură, e același heightfield la LOD mai mic.
(c) TERENUL SE MODIFICĂ ORIUNDE: sapi și umpli în orice chunk warm (limitat la −4 în afara bulei), și modificarea PERSISTĂ ca delta. Sapiens face exact asta — terrain modification + seamless texturing — pe un heightfield per-vertex.
(d) PLECI ȘI ÎNTEMEIEZI: avanposturile primesc bule proprii de 64×64×48; așezarea veche rămâne ca sit persistent.
Plus un al cincilea pe care Sapiens NU îl are și care e teza noastră de produs: așezările abandonate rămân în lume ca ruină / avanpost / cuib de jefuitori, cu tick abstract zilnic de câțiva bytes. Asta e ce transformă „harta e mare" în „lumea ține minte".
ȘI AICI E DIFERENȚA DE COST: Frampton a construit o SFERĂ și a rafinat-o 10 ani. Eu construiesc un plan cu wrap și obțin (a)-(d) în pasul 2 din 12. Sfera nu era senzația; sfera era prețul senzației.

### De ce pastreaza adancimea Going Medieval
Fiindcă bula NU e o versiune diluată de Going Medieval, e o versiune mai mare pe axa care contează.
VOLUM: 256×256×48 = 3,15 M celule vs 266×266×16 ≈ 1,13 M la o hartă GM mare. De 3× mai multe niveluri Z (48 vs 16): 32 m de săpat în jos, 15 m de construit în sus. Toate mecanicile GM încap: etaje, subteran, camere închise, temperatură, stabilitate, lanțuri de producție.
STABILITATE: exact modelul GM prin decrement (4 la sol, −1/celulă, max 3 celule de consolă, grinzi 10 celule), cu recalculare BFS incrementală.
CAMERE + TEMPERATURĂ: modelul RimWorld (regiuni 12×12 → camere → o temperatură per cameră, egalizare ponderată cu CellCount), care e mai ieftin decât orice simulare pe celulă și e dovedit în producție la scări mai mari decât a noastră.
PATHFINDING: A* ierarhic pe regiuni, exact ca GM (regiuni de ~420 de noduri, penalizări bush 3000 / ground 1000 / floor 250 — le portez ca ordin de mărime al raportului, nu ca valori absolute).
CE FAC MAI BINE DECÂT GM: (1) 48 de niveluri în loc de 16; (2) rezolv explicit bug-ul lor cel mai citat — settlerul care își demolează propria scară și se zidește — prin interdicția de a viza celula-suport a propriului agent și prin rezervări care trăiesc un tick; (3) așezarea nu e singura din lume.
CE SACRIFIC: omogenitatea. La GM, ORICE celulă de pe hartă e la fel de capabilă ca oricare alta. La mine, nu. Vezi killerObjection.

### Ordinea de implementare
1. S1: Nucleu determinist + harness headless, zero randare. Grila 1 m, coloanele RLE, `column(seed,x,z)`, tickul de 20 Hz. Test de aur: 100.000 de tickuri, hash de stare identic pe două rulări; tot conținutul în JSON de la prima linie.
2. S2-S4: Streaming + LOD + cameră. Chunk 32×32, inel warm 25×25 (384 m), meshing greedy binar în 4 Workers, mesh de sol netezit cu clamp ±0,45 m, 3 inele de LOD. Criteriu de trecere: mergi 5 km fără cusătură, 60 FPS pe GTX 1050.
3. S5-S6: Ocupare exclusivă + PIBT, testate FĂRĂ joc. 40 de agenți într-un labirint generat procedural cu fundături; regiuni 12×12, Hopcroft-Tarjan pe graful de regiuni, tokeni de ramură, semafor de coridor. Criteriu: 100.000 de tickuri, zero deadlock, zero agent blocat >3 s.
4. S7-S8: Bula fierbinte. Conversia RLE↔dens la ancorare/dezancorare, fereastra Y, avanposturi 64×64×48. Criteriu: ancorezi, sapi 500 de celule, dezancorezi, revii — terenul e bit-identic (test de round-trip în harness).
5. S9-S11: Construcție + stabilitate. Piese pe muchii/fețe, multi-etaj +15, subteran −32, scări ca două transporturi unidirecționale, decrement GM cu BFS incremental, slice view cu fade de acoperiș.
6. S12-S14: Regiuni → camere → temperatură. Flood fill pe graful de regiuni, plafon 48 de regiuni/cameră, egalizare la fiecare 15 tickuri, temperatura solului ca funcție de adâncime, pragul de 5 °C pentru hrană, prima pivniță care chiar ține carnea.
7. S15-S17: Bucla de sarcini. Cerere → rezervare → rută ierarhică → pas PIBT. Validarea de accesibilitate la plasare (tip Ostriv hotfix 11) cu UI care arată CE intrare s-a blocat. Prioritizare per pion, 12 tipuri de muncă.
8. S18-S20: Lanț de producție vertical, tot în JSON: lemn → scânduri → mobilier; grâu → făină → pâine → hrană cu termen. Atelierul ca extensie de locuință (trucul burgage plot) ca să iau adâncime economică fără clădiri noi de modelat.
9. S21-S23: Situri persistente. Îngheț (delta comprimat + ~400 B stare abstractă), tick zilnic abstract, re-hidratare, decădere în ruină, jefuitori care se instalează. Harta strategică peste 6 km.
10. S24-S26: Combat defensiv pe ACEEAȘI buclă de sarcini (fără AI separat): un asediu de 8 atacatori, poartă, palisadă parametrică, capcane. Aici se testează dacă exclusivitatea celulei ține sub presiune.
11. S27-S29: Pasă de prezentare. Variante de mesh din hash, cărări din contoare de trafic cu +15% viteză, props off-grid, paleta de 32 de culori, animație procedurală IK + 6 clipuri, SSAO, ciclu zi/noapte și anotimpuri.
12. S30-S32: Vertical slice jucabil de 2 ore: 8 pioni, o iarnă completă, o pivniță care decide supraviețuirea, un raid, o așezare abandonată pe care o regăsești ca ruină. Apoi DECIZIA de continuare — nu înainte.

### Timp pana la vertical slice
1.100-1.600 de ore de lucru efectiv până la vertical slice-ul de la pasul 12. La 40 h/săptămână: 7-10 luni. La 20 h/săptămână (realist dacă rulează în paralel cu cele 5 aplicații live): 14-20 de luni.
ARGUMENTUL, în trei părți.
(1) DE CE ATÂT DE PUȚIN față de referințe: stackul e limba maternă a dev-ului (TypeScript, typed arrays, teste headless, CI — disciplină deja existentă), iar pașii 1, 5-6 și 12-14 sunt simulare pură, adică exact zona lui de forță. Partea grafică e deliberat sub-ambițioasă ca să nu ceară un artist.
(2) DE CE NU MAI PUȚIN: pașii 7-8 (conversia bulă↔lume) și 12-14 (regiuni→camere→temperatură incrementale) sunt sisteme cu stare, care se strică subtil și se depanează greu; bugetez 25-30% din total doar pentru ele. Plus ~2 săptămâni de modelat 40 de module în Blender.
(3) DE CE ESTIMAREA E OPTIMISTĂ ORICUM, cu dovezi: Going Medieval = 7-9 oameni, Unity, voxel. Foundation = 6 ani de Early Access cu ~18-20 de oameni și un motor propriu. Ostriv = solo din 2014, echipă din 2018, iar pe 07.09.2026 încă fără Alpha 6, adică 3,5 ani fără versiune majoră (cauza spusă de dev: întreținerea a două versiuni în același cod). Manor Lords = ~7 ani și NU e solo: codul e solo, dar arta, animația, mocapul, sunetul și consultanța istorică sunt contractori plătiți din Patreon + Epic MegaGrant. Sapiens = un om, 10 ani, și e blocat.
CONCLUZIA ONESTĂ: orizontul „prototip → vertical slice, apoi decizie" e corect tocmai fiindcă cifra de mai sus e cea mai optimistă compatibilă cu dovezile. Dacă pașii 1-6 depășesc 5 luni la 40 h/săptămână, proiectul e deja în afara traiectoriei și decizia trebuie luată atunci, nu la pasul 12.

### Obiectia proprie (killer objection)
BULA DESFIINȚEAZĂ EXACT PROMISIUNEA PE CARE O VINDE.
Propunerea creează DOUĂ CLASE DE TEREN într-o lume care arată omogenă. Jucătorului i se arată un orizont infinit și i se spune „construiește oriunde", dar în minutul 21 primește „prea departe de așezare" când încearcă să sape un tunel între două situri sau să ridice un turn de veghe cu o cameră caldă la 500 m de casă. Granița bulei e invizibilă, arbitrară și imposibil de explicat în ficțiune — nu există motiv diegetic pentru care o cameră poate exista la 120 m de vatră și nu la 200 m.
DE CE E UCIGAȘĂ, CONCRET: Going Medieval NU are problema asta — harta e mică, dar perfect OMOGENĂ: orice celulă e la fel de capabilă ca oricare alta, deci jucătorul nu întâlnește niciodată o regulă invizibilă. Sapiens nu o are nici el — nicio celulă n-are semantică specială, deci nu poate exista o graniță de semantică. Propunerea mea e SINGURA dintre cele trei care introduce o discontinuitate de reguli, iar jucătorii de colony sim detectează discontinuitățile de reguli instantaneu și le urăsc: plângerea #1 la Ostriv este exact de acest tip — „nu pot construi pe teren nici măcar ușor denivelat". E aceeași rană, doar mutată de pe pantă pe distanță. Iar rana e mai gravă la mine, fiindcă la Ostriv refuzul e VIZIBIL (vezi panta), la mine e invizibil (nu vezi raza).
RISCUL DE PRODUS: un vertical slice în care primele 20 de minute sunt magice și apoi jocul te învață că lumea deschisă era decor. Asta e mai rău decât o hartă mică onestă.
MITIGĂRILE, care NU o elimină: bula se poate re-ancora oricând (câteva sute de ms); avanposturile au bule proprii; raza poate urca la 384×384 pe hardware mai bun; UI-ul poate arăta permanent „domeniul așezării" ca un contur pe sol, transformând limita tehnică într-o regulă de gameplay declarată din prima (ca o rază de influență). Dar rămâne o graniță, iar dacă playtestul de la pasul 12 arată că jucătorii o lovesc des, singurul răspuns corect e să reduc lumea la un set de hărți mari legate printr-o hartă strategică — adică să renunț la cerința 2, nu s-o cârpesc.

### Ce sacrifica
- SFERA. Lume plată cu wrap toroidal la ±524 km, nu planetă. Fără curbură vizibilă, fără a înconjura globul, fără poli, fără geografie solară reală. (Sfera l-a costat pe Frampton 10 ani și nu e ingredientul senzației.)
- OMOGENITATEA GOING MEDIEVAL. Camere, temperatură, stabilitate și construcție multi-etaj există DOAR în bula de 256×256×48 (plus max 3 avanposturi de 64×64×48). În afara ei: teren real, săpat doar până la −4, zero piese de construcție, zero camere. Nu există fortăreață de 2 km și nici tunel încălzit între așezări.
- PLASAREA COMPLET FĂRĂ GRILĂ (Ostriv/Foundation). Grila de 1 m rămâne autoritatea logică; organicul e strict prezentare. Nu există joc livrat cu interioare simulate multi-etaj ȘI plasare fără grilă, iar un dev solo nu va fi primul — costul măsurat la Ostriv: trecerea la forme concave a cerut triangulare, refactor complet la picking ȘI la detecția de suprapunere, plus micro-pathfinding NOU pentru constructori; o singură clădire = 556 de piese modelate, ~5 luni.
- REALISMUL GRAFIC. Treapta b+ e plafon, nu punct de plecare. Fără GI, fără lightmaps (imposibile cu teren săpat la runtime), fără normal maps, fără texturi de teren, fără skeletal crowd.
- FLUIDE, GAZE, PRESIUNE, LUMINĂ VOLUMETRICĂ. Zero. Pânza freatică rămâne statică. Apa e teren cu flag, nu simulare.
- ANIMAȚIA AUTORATĂ. 6 clipuri cheie + IK procedural, nu 30-60 de clipuri de muncă. Se va vedea, și accept că se va vedea.
- MULTIPLAYER. Zero, nici măcar ca opțiune arhitecturală. (Sapiens l-a adăugat; noi nu ne permitem nici designul, nici determinismul în rețea.)
- RISCUL DE STACK, pe care îl numesc ca sacrificiu fiindcă e o pariere: TypeScript + three.js/WebGPU + Electron are precedent livrat pe Steam pentru un base builder (shapez: motor propriu JS, Electron, 96% din 8.380 de recenzii), DAR acel joc era 2D, iar ACELAȘI dev a trecut la Unity pentru Shapez 2 tocmai pentru 3D, etaje multiple și sute de mii de obiecte. Nu există colony sim 3D livrat pe stack web. Dacă GC-ul sau meshing-ul cedează la scară, migrarea nu e refactorizare, e rescriere. Mitigarea structurală e singura disponibilă: nucleul de simulare rămâne TypeScript PUR, zero dependințe, zero DOM, zero three.js — deci portabil; doar stratul de randare ar trebui rescris.
- CERTITUDINEA NUMERELOR DIN SURSE, în două locuri: (1) dimensiunile Going Medieval — pasa anterioară de research spune 250×250×16, forumul Steam citând MapSizes.json spune small 206×206 / large 266×266 / height 16; nu le pot reconcilia, folosesc 266×266×16 ca ordin de mărime. (2) scara lumii Sapiens — pagina Steam spune „mai mare decât Pământul", wiki-ul de modding implică o rază de ~4.348 km; contradicție nerezolvată, încredere scăzută.


---

## 2. Arhipelag de Grile (Grid Archipelago)

**Teza:** Lumea deschisă nu e o grilă mai mare, ci un heightfield continuu, infinit și NEsăpabil, pe care se ancorează dale de simulare voxel de 128×128×48 m — toată adâncimea Going Medieval trăiește ÎNTREG în interiorul unei dale, iar senzația Sapiens vine din faptul că dalele sunt practic infinite ca număr, alegibile oriunde, abandonabile, și rămân în lume ca ruine cu stare.

### Teren
DOUĂ straturi care nu se amestecă niciodată în aceeași structură de date.

STRATUL MACRO (lumea deschisă, negrilat, nesăpabil).
Heightfield procedural infinit, eșantion la 8 m. Macro-chunk = 128×128 eșantioane = 1024×1024 m. Generat la cerere, determinist din (seed, cx, cy) prin fBm cu domain warping + o pasă de eroziune hidraulică simplificată (nu simulare — un kernel fix de 40 de iterații pe chunk, rulat o dată la generare, pe worker). Nimic nu se salvează până nu e modificat; ce se modifică (uzura drumurilor, defrișări, ruine) se scrie ca delta sparse per macro-chunk.
Bytes per eșantion macro, SoA: height u16 (rezoluție 0,25 m, range 0–16.384 m) 2 B + biome u8 1 B + moisture u8 1 B + roadWear u8 1 B = 5 B → 81.920 B (80 KB) per macro-chunk rezident la rezoluție plină.
Wrap toroidal la 2048×2048 macro-chunks = 2.097 km × 2.097 km ≈ 4,4 milioane km² (≈43% din suprafața Europei; pentru comparație onestă, lumea Sapiens e 884.279.719 km², deci a mea e 0,5% din ea — dar nicio margine nu e vizibilă, ceea ce e singura proprietate care contează la nivelul ochiului). Coordonate întregi pe 32 biți, fără drift de float.
Randare: quadtree clipmap, rază 8 km, 4 niveluri LOD (8 m / 16 m / 32 m / 64 m per eșantion). La rezoluție plină sunt rezidente tipic 40–60 macro-chunks ≈ 3–5 MB.

STRATUL MICRO (dala de sit — aici e Going Medieval).
Lattice fix: lumea e împărțită în dale de 128×128 m (16.384 dale pe latură, 2,68×10⁸ dale potențiale). O dală activată = 128×128 celule de 1 m³ în XY × 48 niveluri Z, de la Z=−24 la Z=+23 → 786.432 celule. Chunk = 16×16×16 = 4.096 celule → 8×8×3 = 192 chunks per dală.
Bytes per celulă, SoA dens (fără compresie în RAM, ca indexarea să rămână O(1) fără decompresie pe calea fierbinte):
  material u16 (index în registrul JSON de materiale) — 2 B
  flags u8 (SOLID / FLOOR / WALL / RAMP / DOOR / NATURAL / CONSTRUCTED / ROOFED) — 1 B
  regionId u16 — 2 B
  stability u8 (0–100) — 1 B
  TOTAL 6 B/celulă → 4,72 MB per dală densă.
Grile derivate, tot dense: pathCost u8 (0,79 MB) + occupancy u16 (agentId sau 0xFFFF) (1,57 MB) → ~7,1 MB per dală fierbinte.
Set fierbinte maxim: 4 dale simultan la 20 Hz = 28,4 MB. Dalele reci se scriu pe disc palette-compressed per chunk (chunk uniform = 1 intrare în paletă + 0 biți de index) → tipic 0,4–1,2 MB per dală jucată intens.
Nivel freatic: constantă per dală, Z_water = −12 ± 4 derivat din macro moisture. Sub el nu se sapă fără zidărie impermeabilă (cost de materiale, NU simulare de fluide — decizia anterioară rămâne).

CUSĂTURA (apron). Inelul exterior de 4 celule al fiecărei dale e voxel dar NEmodificabil: înălțimea coloanei sale = round(macroHeight) eșantionat la 1 m prin interpolare bicubică din macro. Astfel dala se închide exact pe heightfield indiferent de LOD-ul macro (LOD-ul afectează doar mesh-ul macro, nu valoarea de la 1 m, care se recalculează din noise, nu din mesh).

RANDARE DIN ACELAȘI CÂMP, două regimuri:
— celulele NATURAL → Naive Surface Nets (netezire; Surface Nets face ~20 M triunghiuri/s pe un core i7 2,5 GHz) → dealuri organice, senzație Sapiens/Ostriv;
— celulele CONSTRUCTED → binary greedy meshing (cuburi crude, muchii clare) → arhitectură citibilă, senzație Going Medieval;
— cusătura între ele: vertexul Surface Nets se fixează la centrul muchiei când vecinul e CONSTRUCTED, deci nu apar goluri. Aleg Surface Nets, NU Dual Contouring, fiindcă DC cere date hermite (normale) și rezolvarea unui QEF care nu garantează că punctul rezultat cade în celulă — complexitate pe care o evit exact acolo unde nu am nevoie de muchii ascuțite (le obțin din regimul CONSTRUCTED).
Numere de meshing: binary greedy meshing măsurat 50–200 µs per chunk 32³ (74 µs mediu single-thread pe Ryzen 3800X, 108 µs în thread pool); chunk-ul meu 16³ e 1/8 din volum → ~10–25 µs. Remesh complet al unei dale (192 chunks) ≈ 4–8 ms pe worker; remesh incremental (1–4 chunks după o editare) ≈ 0,1 ms. Coliziunea NU se generează din mesh (documentația godot_voxel: crearea colliderului e de 3–5× mai scumpă decât meshing-ul) — coliziunea agenților e pur grilă, iar ray-picking-ul e DDA pe voxel.

SLICE VIEW fără bug-ul de hitbox: fiecare chunk-mesh se construiește cu triunghiurile sortate pe nivel Z și un tablou de 16 perechi (offset, count). Ascunderea nivelurilor de deasupra tăieturii = schimbare de draw-range, ZERO remesh. Ray-picking-ul citește ACELAȘI tablou → „hitbox rămas după fade-ul de acoperiș" (bug raportat în Going Medieval) devine imposibil prin construcție, nu prin disciplină.

### Lume
„Open world similar cu Sapiens" nu înseamnă suprafață — suprafața e ieftină (e noise). Înseamnă patru lucruri, și le livrez pe toate patru.

1. NICIO MARGINE. Te plimbi și terenul se generează. Sapiens face asta cu spHeightGet per-vertex din noise pe o sferă de rază 1 (subdiviziuni 13–21 pentru spawn de obiecte, altitudini tipice ±0,001 față de nivelul mării). Eu fac același lucru pe plan toroidal: aceeași senzație la nivelul ochiului, zero din cei ~7–10 ani pe care Dave Frampton i-a plătit pentru sferă. Confidence RIDICAT pe mecanismul Sapiens (documentat în wiki.sapiens.dev, API C oficial), MEDIU pe echivalența senzației.

2. SCARA E MĂSURABILĂ, NU DECLARATĂ. Rază de vizibilitate 8 km. O caravană merge 1,2 m/s → 1 km = 13,9 minute reale la viteză 1×. Traversarea a 8 km = ~1h50 real, ~3 zile-joc la compresia 1 oră-joc / 30 s. Distanța e un cost, nu un ecran de încărcare.

3. TU ALEGI UNDE E LUMEA. Prima dală de sit e gratis, oriunde pe lattice. Extinderea se face prin ANEXARE de dale vecine (1×1 → maxim 3×3 = 384×384 m per așezare). Locul dictează resursele — exact motorul lui Sapiens („locația așezării dictează abundența resurselor, ceea ce încurajează explorarea"). Granularitatea de 128 m e invizibilă la scara mersului pe jos.

4. LUMEA ARE MEMORIE — și aici depășesc Sapiens. Fiecare așezare abandonată rămâne: (a) datele voxel complete pe disc, (b) un mesh-siluetă bakuit (suprafața de sus + segmentele de zid rămase în picioare, un singur static mesh, vizibil de la 500 m), (c) un record de stare de ~200 B: decayLevel, ocupanți (ruină / avanpost / cuib de jefuitori), stoc de pradă, ownerFaction.
Dalele reci primesc UN coarse tick per zi-joc: populație, hrană, degradare, creșterea bandei de jefuitori. Cost O(număr de situri) × ~20 operații = sub 0,1 ms amortizat chiar și la 200 de situri. Reactivarea unei dale reci NU rulează 5 ani de simulare: aplică degradarea ca FUNCȚIE de Δticks (decay(material, Δt) tabelat în JSON) într-o singură pasă peste chunks-urile atinse. Asta face teza de produs deja decisă („așezările pe care le abandonezi RĂMÂN în lume") ieftină, deterministă și testabilă.

BONUS care leagă cele două straturi vizual: contoare de trafic pe stratul macro (furat din Ostriv, unde uzura drumurilor a fost implementată cu save/load în câteva zile, mai 2017 — raport valoare/efort confirmat). Caravanele tale gravează poteci reale între situri. Harta devine biografia ta. Ostriv le-a lăsat cvasi-cosmetice; eu le cuplez la două lucruri: viteza caravanei (+35% pe drum bătut) și raza de descoperire a jefuitorilor (un drum bătut e vizibil de la distanță).

### Constructie
GRILĂ CUBICĂ DE 1 m PENTRU LOGICĂ, STRAT ORGANIC DOAR LA PREZENTARE. Nu ating grila — e topologia spațială gratuită (enclosure, suport, vecinătate, rezervare), și research-ul arată clar de ce: nu există joc livrat cu interioare simulate multi-etaj ȘI plasare organică; Ostriv a plătit o clădire = 556 piese modelate + ~5 luni, Foundation a avut nevoie de un builder modular special doar pentru verticalitatea monumentelor, Norland are interioare exact fiindcă e pe grilă.

MULTI-ETAJ: 48 niveluri Z (−24 … +23) — de 3 ori adâncimea verticală a lui Going Medieval (250×250×16). Podeaua ocupă fața inferioară a celulei, nu celula; deci o celulă poate fi simultan „podea la nivelul n" și „tavan pentru n−1".

PIESE (toate în JSON, contract în stil Foundation BUILDING_PART dar cu noduri = fețe de celulă, deci potrivirea e o mască de 6 biți, nu geometrie):
FLOOR, WALL, ROOF, RAMP, STAIR, DOOR, BEAM, COLUMN, FURNITURE (multi-celulă, ancorată pe grilă), WORKSTATION.
Câmpuri per piesă: allowedFaces (bitmask), requiresSupportFrom (bitmask), stabilityCost, conductance (k), heatOutput (W), maxInstancePerRoom, buildCost[], workTicks.
ZIDURILE SUNT PARAMETRICE, NU MODELE. Copiez direct WALL_CONFIG din Foundation (Width, Height, CrenationDistance, UvTilingWall/Top, offset-uri) → un singur generator de mesh pentru toate materialele și grosimile. Ăsta e răspunsul structural la „solo fără artist" și antidotul la anti-tiparul Ostriv.

SĂPAT: designation pe celulă sau pe cutie (drag 3D). Rezultat: material NATURAL → AIR + drop de resursă din tabel. Săpatul e permis DOAR în interiorul dalelor activate; în afara lor lumea e traversabilă, nu modelabilă (vezi whatItSacrifices — e o concesie reală).

STABILITATE (decrement, calibrat pe valorile validate de Going Medieval):
  stabilitate = 100 pe rocă/sol natural și pe stâlp/COLUMN;
  propagare: stability(c) = max(stability(vecini susținători)) − cost;
  cost vertical (susținut direct de dedesubt) = 0;
  cost orizontal (consolă) = 34 → maxim 2 celule nesusținute lateral, a 3-a cade (Going Medieval: max 3 tile nesusținute);
  BEAM de lemn = 10/celulă → întinderea maximă 10 celule (Going Medieval: grinzi 10 tile);
  prăbușire la stability ≤ 0.
  Consecință calibrată: cameră fără stâlpi maxim 5×5; cu grinzi pe ambele axe 11×11. (Going Medieval prăbușește o pivniță de 7×7 — eu sunt puțin mai strict, deliberat, ca grinda să fie o decizie, nu un detaliu.)
  Recalcul: BFS incremental pornind din coloanele murdare + un halou de 3 celule. Tipic <2.000 celule atinse per editare, sub 0,2 ms. Event-driven, NICIODATĂ per tick.

SUBTERAN: până la Z=−24 (24 m sub nivelul solului dalei). Nivelul freatic la Z=−12±4 e un plafon dur: sub el trebuie zidărie impermeabilă (cost), altfel galeria se „inundă" ca STARE binară a camerei (nepracticabilă, pierde stocul), nu ca fluid simulat.

STRATUL ORGANIC DE PREZENTARE (ca să nu arate ca grilă, fără să coste nimic în logică):
— 4–6 variante de mesh per material, alese din hash(x,y,z,seed) → zidurile nu se repetă;
— colțuri teșite la 45° automat pe segmentele de zid ≥3 celule;
— props off-grid (găleți, rufe, unelte, paie) pe poziții continue în interiorul celulei, ca în Sims 4;
— terenul natural netezit prin Surface Nets peste treptele de 1 celulă;
— drumurile interioare apar din contoare de trafic, ca la Foundation, nu se desenează.

ADÂNCIME ECONOMICĂ IEFTINĂ (trucul Manor Lords): atelierul trăiește ÎN locuință. Extensiile de nivel 2 ale unei locuințe sunt ateliere (fierar, croitor, brutar, cizmar, armurier) — lanțul de producție trece PRIN casă, deci obții adâncime fără clădiri noi de modelat. Peste asta suprapun ceva ce Manor Lords nu poate: temperatura camerei e un INPUT de producție, nu doar o barieră (brânzărie 10–14 °C, malț 15–20 °C, uscător <60% umiditate implicită din temperatură, pivniță <5 °C). Asta e fuziunea reală dintre sistemul Going Medieval și economia adâncă.

### Camere si temperatura
IERARHIE ÎN PATRU NIVELURI: celulă → regiune → cameră → dală. Camerele NU se detectează prin flood fill pe celule; se detectează prin flood fill pe graful de REGIUNI. Asta e trucul care face sistemul ieftin.

REGIUNE = componentă conexă a celulelor traversabile dintr-un slab de 16×16×1 celule (256 celule). Precedent direct: RimWorld împarte harta în chunks de 12×12 care se subdivizează la obstacole și fuzionează când se poate. La mine: 8×8 slaburi per nivel Z × 48 niveluri = 3.072 slaburi per dală; tipic 1–3 regiuni per slab → 4.000–8.000 regiuni per dală. Comparativ, Going Medieval face A* pe regiuni de ~420 noduri — eu am o granulă mai fină și mai multe noduri, dar mai mult spațiu vertical.
PORTALURI: muchii pe cele 4 fețe laterale ale slabului + sus/jos (scări, rampe, găuri de podea). Graful regiune↔portal e simultan graful de pathfinding de nivel înalt ȘI scheletul detecției de camere. Un singur graf, două meserii — dar cu proprietăți disjuncte, ca să nu repet greșeala „variabilă cu două meserii".

CAMERĂ = componentă conexă de regiuni care nu conține nicio celulă cu flag ROOFED=0 și e delimitată doar de WALL/DOOR/FLOOR. Flood fill-ul rulează pe ~3 noduri pentru o cameră de 10×10×3 m, nu pe 300 de celule. Recalcul: o editare marchează slabul atins + cei 6 vecini → flood fill local pe ≤7 slaburi = ≤1.792 celule, apoi re-merge doar pe componenta atinsă. Buget <0,3 ms per editare, cu debounce de 2 tick-uri. Tipic 150–350 camere per dală matură.

TEMPERATURĂ — SISTEMUL FIZIC CONTINUU UNIC (decizia anterioară, păstrată integral). Un nod per cameră, plus trei tipuri de noduri speciale:
  AFARĂ: temperatură din curba climatică a dalei (sezon × oră × latitudine macro), capacitate termică infinită;
  ROCĂ[b]: câte un nod per bandă de 8 niveluri Z sub sol (3 benzi), temperatură = media anuală a climei + 0 °C la Z≥−4, +1 °C la −4>Z≥−16, +2 °C sub −16, cu capacitate uriașă (inerție de luni);
  APĂ: nod la temperatura mediei anuale, doar dacă dala are un corp de apă.
Rezolvare la 1 Hz (o dată la 20 tick-uri), Euler explicit, fixed-point Q16.16:
  T_i ← T_i + (Δt / C_i) · [ Σ_j k_ij · A_ij · (T_j − T_i) + Q_i ]
  A_ij = aria suprafeței comune în m², NUMĂRATĂ o singură dată la construirea camerei și actualizată incremental la fiecare editare (nu recalculată);
  k_ij din JSON: pământ 0,08 · piatră 0,15 · lemn 0,35 · ușă închisă 0,60 · deschidere liberă 8,0 (W/m²K, unități de joc);
  C_i = volum(m³) × 1,2 (aer) + masa mobilei × 0,1;
  Q_i: sobă +8 kW, cuptor de pâine +12 kW, forjă +18 kW, fiecare pion +0,10 kW, fiecare animal +0,15 kW. (Going Medieval confirmă exact acest model: „camerele se încălzesc una pe alta în funcție de ce e în ele — o bucătărie cu sobă încălzește camera de deasupra", și „totul, inclusiv animalele și colonii, emite căldură".)
COST: ~300 camere × ~6 vecini = 1.800 operații la 1 Hz → 0,05 ms/tick amortizat. Un sistem fizic întreg pentru 0,1% din bugetul de tick.

PRAGUL DE CONSERVARE: ≤5 °C pentru hrană (confirmat de comunitatea Going Medieval; ~2 °C considerat optim). Nodul ROCĂ produce pivnița rece FĂRĂ nicio simulare de fluide — și reproduce fidel paradoxul didactic al lui Going Medieval: pereții și podelele construite adaugă izolație, ceea ce în practică ÎNCĂLZEȘTE pivnița; pivnița bună e pământ gol adânc, nu zidărie. La mine asta cade din model, nu e o regulă cusută cu ață: zidăria reduce k și spre AFARĂ și spre ROCĂ, dar ROCA era sursa ta de frig.

TESTUL-FAR AL SISTEMULUI (harness headless, săptămâna 5): construiește o pivniță 7×7×3 la Z=−6, rulează 3 ani-joc (≈1,9 milioane de tick-uri), afirmă că T rămâne în [1 °C, 5 °C] în ≥95% din tick-uri și că hash-ul de stare e identic între două rulări. Dacă testul ăsta trece, sistemul fizic e livrat.

### Coliziune intre agenti
OCUPARE EXCLUSIVĂ, FĂRĂ SUPAPĂ: occupancy[cellIndex] = agentId sau 0xFFFF. Un agent = o celulă, inclusiv în combat (combatul defensiv rulează pe aceeași buclă de sarcini — decizie anterioară). Recunosc deschis ce cumpăr: NIMENI din referințe nu o are cu adevărat. Dwarf Fortress permite suprapunerea cu penalizare de viteză și sfătuiește oficial coridoare ≥2 tiles; RimWorld o are doar la pionii drafted și pune Cost_PawnCollision=175 (era 100 până în Alpha 17); Factorio a ELIMINAT coliziunea între biteri (FFF-316/317) din cauza „mating dance"-ului. Deci nu am voie la scurtătura nimănui și trebuie să rezolv problema pe bune.

TREI NIVELURI, STRICT SEPARATE:
(1) PLAN LUNG — A* pe graful de regiuni (4.000–8.000 noduri, ~25.000 muchii). Se stochează DOAR lista de portaluri, NICIODATĂ o cale per-celulă lungă. Ăsta e antidotul la bug-ul ONI (cale precalculată invalidată → dupe oscilează pe scară până moare): dacă o regiune devine murdară, doar segmentul afectat se replanifică. Buget: maxim 8 replanificări per tick, ~0,2 ms fiecare → 1,6 ms.
(2) PLAN SCURT — A* pe celule, dar DOAR în regiunea curentă + regiunea următoare (≤512 celule), cu ținta = portalul următor. Recalculat la schimbare de regiune sau la murdărire. Penalizări de cost calibrate pe Going Medieval (bush 3000 / ground 1000 / floor 250): podea construită 250, drum bătut 180, sol 1000, tufiș 3000, apă 4000, scară în sus 2000 / în jos 1200 (ONI: stâlp jos +400%, scară sus).
(3) PASUL DE TICK — PIBT (Priority Inheritance with Backtracking, Okumura, IJCAI-19 / AIJ-22). Un singur pas, priority inheritance pentru push, backtracking pentru cicluri (rotații), rezervări care trăiesc EXACT un tick. Măsurat: 8.000 agenți în 0,021 s (~2,6 µs/agent/pas) → 40 de agenți ≈ 0,1 ms/tick. NU folosesc WHCA* (Silver, W=16, 100 agenți: cost continuu până la ~50 ms = un tick întreg la 20 Hz) și NU folosesc CBS (optimal, dar se măsoară cu timeout de 30 s).

GAURA DIN PIBT ȘI CUM O ASTUP — asta e partea care decide arhitectura. Garanția PIBT e verbatim: toți agenții ajung la destinație în timp finit „dacă orice pereche de noduri adiacente aparține unui ciclu simplu (ex. biconex)"; în medii cu fundături / căi arborescente „PIBT poate cauza deadlock". Un colony sim e fundătură peste tot: dormitor, galerie, depozit. Fără remediu, 40 de agenți spre o cameră 3×3 = blocaj permanent.
Remediul, în trei piese:
  a) HOPCROFT–TARJAN O(V+E) pe graful de REGIUNI (nu pe celule): 8.000 noduri + 25.000 muchii ≈ 0,5–1 ms în TypeScript. NU folosesc biconectivitate dinamică (algoritmii fully-dynamic sunt grei și nu se amortizează la scara asta) — rerulez pe componenta conexă atinsă, cel mult o dată la 10 tick-uri (0,5 s), cu debounce. Rezultat: arborele bloc-tăietură + lista de punți.
  b) TURNICHET PE FIECARE PUNTE (muchie-bridge din graful de regiuni), starea { dir ∈ {LIBER, ÎNĂUNTRU, AFARĂ}, count, waiting[2], age }. Un agent traversează doar dacă dir==LIBER (o setează) sau dir==direcția lui; la ieșire count−−; la count==0 → dir=LIBER. Anti-înfometare: dacă tabăra opusă așteaptă >60 tick-uri (3 s), puntea intră în DRAINING (nu mai acceptă intrări noi) și se răstoarnă când count ajunge la 0. Ăsta e exact mecanismul PIBT-TP (Priority Inheritance with Temporary Priority, arXiv 2205.12504): prioritate temporară + „restrict agents' movements in the trees", cu rezultatul demonstrat „agents can always reach their delivery without deadlock" în medii cu căi arborescente.
  c) DESIGNUL PREDĂ REGULA: UI-ul de construcție afișează lățimea coridorului și marchează cu galben orice punte pe o rută cu >10 treceri/minut. O ușă simplă (1 celulă) E o punte, deci e un gât de sticlă serializat; ușa dublă (2 celule alăturate) face perechea biconexă și turnichetul dispare. La fel scara: o scară de 1 celulă e punte; scara dublă se declară ca pereche unidirecțională (stânga urcă, dreapta coboară) → biconexă. Asta transformă constrângerea owner-ului dintr-un defect într-o lecție de arhitectură pe care jucătorul o învață — exact mecanismul prin care Dwarf Fortress a făcut din coridoare o disciplină.

ANTI-AUTO-ZIDIRE (bug-ul Going Medieval în care settlerul își demolează singur scara de la mijloc și se zidește — ~80% din surse, ~5% incidență înainte de reworkul de pathing): înainte de a COMMITA orice editare de teren, o interogare O(1) pe arborele bloc-tăietură deja întreținut: dacă celula e singura legătură a unei regiuni care conține un agent, comanda NU se execută — sarcina rămâne în coadă și UI-ul spune „blocat: ar izola pe X". Nicio comandă de demolare nu poate viza celula-suport a propriului agent.

VALIDARE DE ACCESIBILITATE LA PLASARE (furat din Ostriv, hotfix 11, 23.01.2025, a costat 3 săptămâni și a amânat Alpha 6 — deci e ieftin de copiat, scump de descoperit): la plasarea oricărei clădiri/uși se verifică drum de la nodul-poartă al dalei la FIECARE intrare; clădirea care blochează intră în fail state și UI-ul arată CE intrare e blocată.

TESTUL-FAR (harness headless, săptămâna 4, înainte de orice gameplay): 40 de agenți cu ținte aleatoare într-o hartă generată cu 30 de fundături și 6 coridoare de lățime 1, 1.000.000 de tick-uri, aserțiune: ZERO agenți blocați >200 tick-uri și ZERO celule cu doi ocupanți. Dacă testul ăsta nu trece, constrângerea 4 nu e livrabilă și trebuie să te întorci la owner ÎNAINTE de luna 3, nu după.

### Realism
TREAPTA b+ : LOW-POLY STILIZAT + ILUMINARE ȘI ATMOSFERĂ BUNĂ. Nu realist. Nu negociez asta, fiindcă trei constrângeri deja luate interzic realismul, nu preferința mea.

DE CE, CONCRET:
1. Teren săpabil la runtime ⇒ fără lightmaps coapte, iar Nanite nu e făcut pentru geometrie generată la runtime. Exact cele două picioare pe care stă realismul UE5 sunt tăiate de cerința 1.
2. Slice view + interioare ⇒ Lumen are integrare limitată cu transparența complexă, deci fade-ul de acoperiș se bate cu GI. Manor Lords, Foundation și Ostriv NU au interioare deloc — ele evită problema, nu o rezolvă; nu le pot copia look-ul fără să le copiez și absența.
3. 60 FPS pe hardware modest: Lumen țintește 8 ms@30fps / 4 ms@60fps la 1080p, și fiecare treaptă de calitate costă ≈ jumătate din cea de deasupra. Bugetul meu total de frame e 16,6 ms.

SPECIFICAȚIE DE PRODUCȚIE:
— 300–1.500 triunghiuri per prop; un singur atlas 2048² per set de materiale; fără normal maps pe teren; shading cu ramp de gradient (2–3 trepte) + culoare de umbră caldă.
— Iluminare: o singură direcțională + cer gradient + SSAO puternic + ceață aeriană dependentă de distanță. Fără GI dinamic. Realismul pe care îl vinzi e ATMOSFERIC (ploaie, ceață de dimineață peste valea de la 3 km, lumină de foc pe pereții pivniței, zăpadă care se acumulează ca strat pe voxelii ROOFED), nu material.
— Agenți: UN schelet, 18–24 clipuri, 6 sloturi modulare (cap/tors/picioare/mâini/păr/unealtă), GPU instancing. Agenții NU sunt constrângerea: UE5 Animation Budget Allocator duce 64 personaje de la 14,2 ms la 4,0 ms și 128 de la 29,3 la 7,6 ms; VAT + instancing a dus 6.072 agenți de la 21.369 la 276 draw calls (GPU 32 → 17,5 ms). Costul real e AUTORAREA (30–60 clipuri de muncă + variante de haine + LOD-uri), nu randarea — de aceea tai la 18–24 de clipuri și la 6 sloturi.
— Buget de artă 2026: kituri stilizate tip Synty/KayKit ($10–150/pack; ATENȚIE, licența standard Synty INTERZICE AI generativ). NU Megascans — era liberă s-a închis la finalul lui 2024, acum $0,99/asset și Bridge deprecat mai 2026. NU KitBash3D ($708/an, din care doar ~2.000 din 20.000 de modele sunt game-ready). Un env artist freelance (Europa de Est $25–45/h) pentru 40–60 h DOAR la finalul vertical slice-ului, ca să ridice silueta și paleta — nu pentru texturi.
— Un stil vădit manual e și apărarea reputațională: Party Animals a fost review-bombed în mai 2026 cu >800 recenzii negative și a trecut Very Positive → Mostly Negative în <24h, iar Shrine's Legacy a fost lovit pe o acuzație FALSĂ. Steam a rescris formularul pe 16 ian. 2026 (Pre-Generated vs Live-Generated, uneltele de dev exceptate).

DOVADA CĂ VÂNZĂRILE NU CER REALISM: RimWorld 1M+, Dwarf Fortress 1M pe Steam, Going Medieval 175k în prima săptămână de EA cu 7–9 oameni. Referința ta de open world, Sapiens, e UN om, ~7–10 ani, și NU e realistă. Invers: Ostriv e solo din 2014, echipă din 2018, motor propriu, ÎNCĂ în EA; Foundation a avut nevoie de 6 ani de EA și ~18–20 de oameni; Manor Lords are „solo" doar la cod, iar arta, animația, mocap-ul și sunetul sunt contractori plătiți din Patreon și Epic MegaGrant.

### De ce se simte ca Sapiens
Fiindcă reproduc mecanismul, nu suprafața. Sapiens e deschis nu pentru că are 884 de milioane de km², ci pentru că: (a) nu vezi niciodată o margine — terenul se naște din noise sub picioarele tale (spHeightGet per-vertex, sferă de rază 1, subdiviziuni 13–21); (b) locul unde te așezi îți dictează resursele, deci explorarea e economie, nu turism; (c) poți lega triburi, expediții, rute de vânătoare și comerț între așezări; (d) scara e fizică — mergi mult și simți asta.

Eu livrez toate patru: un plan toroidal de 2.097 km fără margine vizibilă, generat la 8 m/eșantion din același tip de noise; 2,68×10⁸ dale de sit posibile, alese liber, cu resurse dictate de biome și de macro moisture; caravane reale între situri care lasă poteci gravate de contoare de trafic; și 8 km rază de vizibilitate cu 13,9 minute reale per kilometru parcurs.

Și adaug ce Sapiens NU are, ceea ce e teza de produs deja decisă: CONSECINȚA. La Sapiens, o așezare abandonată se estompează. La mine rămâne — datele voxel complete pe disc, un mesh-siluetă vizibil de la 500 m, un record de stare care evoluează cu un coarse tick pe zi-joc: ruina se degradează, jefuitorii se înmulțesc, avanpostul își trimite caravanele. Peste zece ani-joc, harta ta e un cimitir de decizii proprii pe care poți da din nou peste ele.

Asta e reformularea care face designul posibil: „open world" e PERSISTENȚĂ + CONSECINȚĂ + MOBILITATE, nu suprafață. Suprafața o cumperi cu o funcție de noise; persistența o cumperi cu un record de 200 B per sit și o funcție de degradare tabelată. Amândouă sunt ieftine. Ce e scump — simularea continuă a lumii — nu e nici măcar ce vrea jucătorul.

### De ce pastreaza adancimea Going Medieval
Pentru că nu am atins nimic din ce face Going Medieval adânc. Dala de sit ESTE Going Medieval, doar mai verticală.

— ETAJE: 48 niveluri Z (−24…+23) față de 16 la Going Medieval (250×250×16 = 1e6 voxeli; eu: 128×128×48 = 786.432 voxeli per dală, până la 4 dale fierbinți = 3,1e6). De trei ori adâncimea verticală.
— SĂPAT ȘI SUBTERAN: săpat liber pe celulă sau cutie, până la 24 m sub sol, cu nivel freatic ca plafon dur la Z=−12±4 (zidărie impermeabilă sub el = cost, nu simulare de fluide).
— CAMERE ÎNCHISE: flood fill pe graful de regiuni, 150–350 camere per dală matură, recalcul <0,3 ms per editare.
— TEMPERATURĂ: un nod per cameră + AFARĂ + trei benzi de ROCĂ, Euler la 1 Hz, conductanțe și surse de căldură din JSON, prag de conservare ≤5 °C. Reproduce fidel comportamentele documentate ale lui Going Medieval, inclusiv cel contraintuitiv (zidăria încălzește pivnița).
— STABILITATE: 100 pe natural, −34 per celulă de consolă (max 2 nesusținute), grindă 10 celule, stâlp = reset la 100; cameră fără stâlpi max 5×5, cu grinzi 11×11.
— LANȚURI DE PRODUCȚIE ADÂNCI: atelierul-în-locuință (tiparul Manor Lords: extensiile de nivel 2 sunt fierar/croitor/brutar/cizmar/armurier, deci lanțul trece prin casă și obții adâncime fără clădiri noi de modelat) PLUS ceva ce Manor Lords nu poate avea, fiindcă n-are interioare: temperatura ca input de producție (brânzărie 10–14 °C, malț 15–20 °C, pivniță <5 °C). Camera nu mai e doar container — e o mașină.
— COMBAT DEFENSIV pe aceeași buclă de sarcini, cu asediul care atacă STRUCTURA: un berbec care scoate un stâlp face stabilitatea să cadă și prăbușește etajul. Sistemul de stabilitate devine mecanică de luptă, nu decor — adâncime gratuită dintr-un sistem deja plătit.

Nimic din stratul macro nu intră vreodată în bucla de simulare a dalei. Dala nu știe că lumea există; vede doar un apron de 4 celule, o curbă climatică și o coadă de caravane. Ăsta e motivul pentru care deschiderea lumii nu scumpește adâncimea construcției: sunt două sisteme care comunică printr-o interfață de câteva zeci de bytes.

### Ordinea de implementare
1. PAS 0 — STIVA. Nucleu de simulare în TypeScript PUR (zero dependențe, typed arrays SoA, fixed-point Q16.16, PRNG xoshiro128** separat per subsistem, ZERO float în sim), randare WebGPU prin three.js r184+, împachetat Electron pentru Steam. Motiv: 5 aplicații live în TS + disciplină de teste headless și CI = exact ce cere determinismul; precedent de shipping: Vampire Survivors a fost construit în Phaser/JS și vândut pe Steam înainte de portul Unity 1.6; WebGPU e baseline în toate browserele majore, three.js r184 (martie 2026) a eliminat alocările per-frame care generau 240k–500k obiecte/secundă la 1.000 de mesh-uri. CONFIDENCE SCĂZUT pe stivă — nu am găsit NICIUN colony sim 3D voxel livrat pe ea; precedentele Electron/Steam sunt jocuri mici. PLAN B explicit: Godot 4 + C# + modulul godot_voxel al lui Zylann (meshing multi-thread, LOD octree; atenție, documentația lui spune că generarea de collider e de 3–5× mai scumpă decât meshing-ul). Nucleul fiind fără dependențe de motor, portul e o traducere mecanică de ~20k linii, nu un redesign.
2. PAS 1 (săpt. 1–3) — Harness determinist headless ÎNAINTE de orice pixel: tick fix 20 Hz, sim.step() × 100.000 → hash de stare pe 128 biți; două rulări cu același seed = același hash, pe Windows și pe CI. Registru de conținut JSON + validator de schemă. Fără asta, toate testele-far de mai jos sunt fictive.
3. PAS 2 (săpt. 3–6) — Dala de sit: 128×128×48 celule, chunks 16³, SoA 6 B/celulă, editare (săpat/umplut/construit), serializare palette-compressed. Test: 10.000 de editări aleatoare → save → load → hash identic; 1.000 de cicluri de save/load fără drift.
4. PAS 3 (săpt. 6–10) — Regiuni (slaburi 16×16×1) + portaluri + A* ierarhic + recalcul incremental pe slaburi murdare. Test de echivalență: după 1.000 de editări aleatoare, reachability pe graful de regiuni trebuie să fie IDENTICĂ cu BFS brut pe celule, pentru 10.000 de perechi aleatoare. (Aici se prinde clasa de bug-uri în care graful minte.)
5. PAS 4 (săpt. 10–14) — PIBT + ocupare exclusivă + Hopcroft–Tarjan pe graful de regiuni + turnichete pe punți + anti-auto-zidire + validare de accesibilitate la plasare. TEST-FAR: 40 de agenți, hartă cu 30 de fundături și 6 coridoare de lățime 1, 1.000.000 de tick-uri → zero agenți blocați >200 tick-uri, zero celule cu doi ocupanți. Dacă pică, te întorci la owner pe constrângerea 4 ACUM, nu în luna 8.
6. PAS 5 (săpt. 14–18) — Camere (flood fill pe graf de regiuni) + temperatură (Euler 1 Hz pe graful de camere, conductanțe și surse din JSON) + stabilitate (BFS incremental pe coloane murdare). TEST-FAR: pivnița 7×7×3 la Z=−6 stă în [1,5] °C ≥95% din 3 ani-joc; camera 6×6 fără stâlpi se prăbușește, cu grinzi nu; 5.000 de editări aleatoare nu produc niciodată o cameră cu arie de suprafață negativă sau un regionId orfan.
7. PAS 6 (săpt. 18–26) — RANDARE, pasul cel mai riscant tehnic pentru tine: Surface Nets pentru NATURAL + binary greedy meshing pentru CONSTRUCTED, cusute pe fața comună; meshing pe worker; slice view prin draw-range pe nivel Z cu picking din ACELAȘI tablou de offset-uri. Poartă de decizie dură: dacă la sfârșitul săptămânii 26 nu ai 60 FPS stabil pe o dală plină pe un GPU de clasă GTX 1060, comută pe PLAN B (Godot + godot_voxel) — nu continua.
8. PAS 7 (săpt. 26–34) — Bucla de muncă: sarcini din JSON, rezervare de sarcină ȘI de resursă (două rezervări distincte, nu una cu două meserii), nevoi (foame/somn/temperatură/moral), 40 de pioni. Aici jocul devine joc și aici afli dacă turnichetele sunt suportabile la trafic real.
9. PAS 8 (săpt. 34–40) — Lanțuri de producție + atelier-în-locuință (tiparul Manor Lords) + temperatura ca INPUT de producție (brânzărie, malț, uscător, pivniță). Aici se validează că sistemul fizic e economie, nu decor.
10. PAS 9 (săpt. 40–48) — STRATUL MACRO și CUSĂTURA: heightfield infinit la 8 m, quadtree LOD, rază 8 km, apronul de 4 celule ancorat exact pe macro prin interpolare bicubică. ATENȚIE — vezi killerObjection: dacă ai bani de o singură abatere de la ordinea asta, mută un prototip-schelet al cusăturii (doar generare + apron + o dală goală pe un versant de 15°) la săptămâna 8. Costă 2 săptămâni și îți poate salva 700 de ore.
11. PAS 10 (săpt. 48–54) — A doua dală: anexare de dală vecină (graful de regiuni al ambelor se reconstruiește fără să rupă turnichetele active), caravană reală pe stratul macro, uzura drumurilor din contoare de trafic (tiparul Ostriv, câteva zile de muncă).
12. PAS 11 (săpt. 54–60) — Abandon și persistență: mesh-siluetă bakuit, record de stare de ~200 B, coarse tick 1/zi-joc pe siturile reci, reactivare cu degradarea aplicată ca FUNCȚIE de Δticks într-o singură pasă. TEST-FAR: abandonezi un sit, treci 5 ani-joc, revii — starea e identică indiferent dacă ai stat în zonă sau la 2.000 km. Aici e livrat vertical slice-ul. PAS 12 (post-slice) — combat defensiv pe aceeași buclă de sarcini, cu asediu care atacă structura (berbec → scoate stâlpul → cade stabilitatea → se prăbușește etajul).

### Timp pana la vertical slice
10–12 luni full-time (1.600–2.000 h) pentru pașii 1–11 (vertical slice). 20–26 de luni dacă lucrezi part-time la 15–20 h/săptămână. Defalcare: pașii 1–5 (nucleul de simulare, 100% în zona ta de forță — TS, typed arrays, teste headless) 350–450 h; pasul 6 (randare voxel, zona ta cea mai slabă) 300–450 h; pașii 7–8 (gameplay și economie) 350–450 h; pașii 9–11 (macro, cusătură, persistență) 350–500 h; artă/UI/audio minim viabil 150–250 h.

ARGUMENTUL, cu cifrele referințelor:
— Going Medieval: 7–9 oameni, ~2 ani până la EA. Dar EA e un JOC, nu un slice. Un slice e poate 30% din sistemul acela, adică ~5 om-ani × 0,3 ≈ 1,6 om-ani. Un singur om, cu designul DEJA decis (nu mai iterezi la nesfârșit) și fără artă originală, taie coordonarea și jumătate din iterația de design → ~1 om-an e plauzibil, dar DOAR dacă nucleul e scris în limba în care ești cel mai rapid. De asta insist pe TypeScript la pasul 0: alegerea „corectă" (C# pe un motor pe care nu-l cunoști) îți dublează pașii 1–5, exact partea care e altfel garantată.
— Sapiens: UN om, ~7–10 ani. Dar el a construit sfera reală ȘI un motor propriu — eu tai amândouă și nu reconstruiesc o planetă.
— Ostriv: UN om, C++ fără motor terț, A1 după ~3 ani, A5p9 în sept. 2024 și încă fără Alpha 6 la 07.09.2026 (3,5 ani fără versiune majoră, cauza spusă de dev: întreținerea a două versiuni în același codebase). O singură clădire organică = 556 piese modelate + ~5 luni. Asta e exact prețul plasării organice, pe care eu NU îl plătesc — și e principalul motiv pentru care estimarea mea nu e fantezie.
— Foundation: ~18–20 de oameni, 6 ani de EA, și după 7 ani ÎNCĂ nu au rezolvat alinierea pe înălțime a pieselor de monument pe teren înclinat.

TREI PORȚI DE OPRIRE, cu criterii numerice (fiindcă orizontul angajat e prototip → slice → decizie, nu 3 ani):
Poarta 1, săptămâna 14: testul-far de deadlock (40 agenți / 1M tick-uri / 30 de fundături). Dacă pică, constrângerea „o celulă = un agent" nu e livrabilă solo și se renegociază cu owner-ul.
Poarta 2, săptămâna 26: 60 FPS pe o dală plină pe GPU de clasă GTX 1060. Dacă pică, comuți pe Godot + godot_voxel; pierzi ~8 săptămâni, nu proiectul.
Poarta 3, săptămâna 48: cusătura macro↔dală pe un versant de 15°. Dacă pică, tai deschiderea lumii la „hărți mari alese la început" (modelul Ostriv, 7 hărți) și păstrezi jocul. Dar atunci cerința 2 e moartă, și e mai bine să afli asta la săptămâna 8, nu la 48 — vezi killerObjection.

### Obiectia proprie (killer objection)
Propun uniunea a două jocuri pe care nimeni nu le-a unit, și am programat cel mai riscant sistem al uniunii — cusătura dintre dala voxel și heightfield-ul macro — abia la pasul 9, după ce ai investit 700–900 de ore. Propriul meu research spune că NU există joc livrat cu interioare simulate multi-etaj/subteran ȘI lume deschisă organică: Sapiens e gridless total dar n-are camere, temperatură sau stabilitate; Going Medieval are toate trei dar n-are lume; Foundation, după 7 ani și ~18–20 de oameni, ÎNCĂ n-a rezolvat alinierea pe înălțime a pieselor de monument pe teren înclinat (Devlog #20, feb. 2026) — iar aia e o problemă STRICT MAI SIMPLĂ decât a mea, fiindcă ei n-au nici interioare, nici săpat, nici etaje.

Concret, cusătura are patru moduri de eșec pe care nu le-am dovedit rezolvabile, doar plauzibile:
(1) GEOMETRIA MĂ POATE OMORÎ. O dală de 128 m pe un versant de 15° acoperă tan(15°)×128 = 34,3 m de cădere verticală. Din cele 48 de niveluri Z, 34 se duc pe pantă și nu-ți mai rămâne nimic nici sus, nici jos. Jocul devine nejucabil pe orice teren interesant — exact plângerea #1 a jucătorilor Ostriv („nu pot construi pe teren nici măcar ușor denivelat"). Contra-măsura mea (pre-terasarea dalei la activare + excluderea pantelor mari din lattice) e o soluție pe hârtie, NEMĂSURATĂ, și reduce libertatea de plasare exact în dimensiunea care face lumea să pară deschisă.
(2) APRONUL E O PROMISIUNE, NU O DOVADĂ. Apronul de 4 celule trebuie să se potrivească cu un heightfield care are 4 niveluri LOD. Susțin că LOD-ul afectează doar mesh-ul, nu valoarea de la 1 m — dar asta înseamnă că marginea dalei și terenul de lângă ea sunt randate din două pipeline-uri diferite, iar cusăturile între pipeline-uri de meshing diferite sunt clasa de bug-uri cel mai greu de închis într-un motor de voxeli (vezi literatura de seams & LOD pentru dual contouring chunked).
(3) ANEXAREA POATE RUPE TRAFICUL. Anexarea unei dale vecine reconstruiește graful de regiuni al AMBELOR dale și trebuie să nu invalideze turnichetele active pe punți în timp ce agenții sunt în tranzit. Nu am specificat migrarea stării turnichetelor — e exact tipul de „ce se întâmplă la limita dintre două sisteme corecte" care produce blocaje permanente în producție.
(4) REFUZUL ARBITRAR. Jucătorul VA vrea să sape în afara dalei. „Nu poți" e un refuz fără justificare în ficțiune, într-un joc care i-a promis lume deschisă. Manor Lords scapă cu zero terraforming pentru că nu promite niciodată altceva; eu promit.

Verdictul onest împotriva propriei propuneri: ordinea mea de implementare e optimizată ca să obții satisfacție devreme (dala funcționează la săptămâna 18, jocul e joc la 34) și amână validarea premisei centrale. Un arhitect mai dur ar muta un prototip-schelet al cusăturii la săptămâna 8 — doar generare macro + apron + o dală goală plantată pe un versant de 15° — și ar accepta 2 săptămâni de întârziere pentru a nu risca 700 de ore. Recomand să faci asta, chiar dacă îmi strică ordinea de mai sus.

### Ce sacrifica
- PLASAREA ORGANICĂ FĂRĂ GRILĂ (Ostriv/Foundation) — sacrificată complet la nivel de LOGICĂ. Nu vei avea case rotite la 17°, nici footprint-uri concave desenate liber. Se cumpără doar cosmetic: variante de mesh din hash, colțuri la 45°, props off-grid, teren netezit cu Surface Nets. Cine se uită atent vede grila. Motivul e măsurat: Ostriv a plătit 556 piese modelate + ~5 luni pentru O clădire organică, iar trecerea la forme concave (devlog 11.05.2026) a cerut triangulare, refactor la picking ȘI la detecția de suprapunere, plus un micro-pathfinding NOU pentru constructori.
- TERRAFORMAREA ÎN AFARA DALELOR. Lumea deschisă e privitoare și traversabilă, nu modelabilă. Asta contrazice PARȚIAL cerința 2 și o spun explicit: Sapiens te lasă să sapi și să umpli oriunde pe planetă; eu nu. Este cea mai mare concesie a propunerii.
- SFERA / PLANETA REALĂ. Plan toroidal de 2.097 km (4,4 mil. km², 0,5% din lumea Sapiens). Fără curbură a orizontului, fără poli, fără circumnavigație cu semnificație. Am tăiat asta deliberat: e taxa de mai mulți ani pe care a plătit-o Frampton.
- SIMULAREA DE FLUIDE, INUNDAȚIILE, APA CURGĂTOARE (decizie anterioară, confirmată). Nivelul freatic e o constantă per dală, iar 'galeria inundată' e o STARE binară a camerei, nu un fluid.
- COMBATUL OFENSIV, CAMPANIILE, DIPLOMAȚIA CA SISTEM PROPRIU. Doar defensiv, pe aceeași buclă de sarcini. Asediile atacă structura; tu nu ataci pe nimeni.
- REALISMUL GRAFIC. Nu vei arăta niciodată ca Manor Lords sau Ostriv, și nu trebuie: Manor Lords are mocap plătit și contractori de artă; Ostriv are un editor de modele propriu și 12 ani de muncă.
- UȘA SIMPLĂ ȘI SCARA SIMPLĂ CA ELEMENTE LIBERE DE DESIGN. Ocuparea exclusivă le transformă în punți cu turnichet, deci în gâturi de sticlă serializate. Jucătorul trebuie educat să construiască lat (Dwarf Fortress sfătuiește oficial coridoare ≥2 tiles). O parte din jucători vor numi asta bug, nu design, și vor avea dreptate afectiv chiar dacă nu tehnic.
- SUPAPA DE SUPRAPUNERE. RimWorld, Dwarf Fortress și Factorio au toate o supapă (penalizare de viteză, doar-drafted, sau eliminarea coliziunii). Noi n-o avem, deci ORICE bug de pathfinding se manifestă ca blocaj vizibil, nu ca încetinire discretă. Costul de QA al constrângerii 4 e permanent, nu unic.
- MAI MULT DE 4 DALE FIERBINȚI SIMULTAN, deci mai mult de ~3–4 așezări active la 20 Hz. Restul lumii trăiește la un coarse tick pe zi-joc și nu poate fi inspectat în detaliu fără reactivare.
- PORTUL PE CONSOLE, dacă mergi pe Electron (planul A). Steam Deck merge prin Proton, dar consolele sunt închise. Planul B (Godot) le redeschide.
- MODDINGUL PROFUND TIP SAPIENS (peste jumătate din codul lui e Lua suprascriptibil, plus plugin-uri C pentru terrain și particule). La noi moddingul e doar JSON de conținut, cel puțin în vertical slice.


---

## 3. STRATA

**Teza:** Nu există o grilă unică: terenul e un heightfield stratificat (continuu, fără cuburi), clădirea e un teanc de arrangement-uri planare în care camera = față de graf (nu flood fill), iar „celula” cerută de owner e un NOD dintr-o rețea hexagonală de 0,55 m generată din geometrie — PIBT e definit pe grafuri oarecare, nu pe grile, deci exclusivitatea se păstrează literal fără ca vreun cub să apară pe ecran.

### Teren
LAYERED HEIGHTFIELD („strata sheets”), nu voxel, nu heightfield simplu.

Chunk = 64 m × 64 m. Stratul 0 (solul): heightfield 65×65 sample-uri la 1 m (bordura partajată), înălțime int16 în cm (±327 m) = 4.225 × 2 B = 8,45 KB. Plus material u8 (4,2 KB) + flags u8 pentru fețe verticale tăiate (4,2 KB). Total strat 0 ≈ 17 KB/chunk = 4 bytes per coloană de 1 m².

Straturile 1-3 (goluri/overhang/subteran): SPARSE, tabel lateral per chunk cu intrări (columnIndex u16, bottom i16, top i16) = 6 B/interval. Maximum K=4 intervale solide per coloană ⇒ maximum 3 goluri suprapuse. O pivniță de 12×12 m pe 2 nivele = 144 coloane × 2 intervale = 288 intrări = 1,7 KB. Subteranul costă practic nimic pentru că e sparse.

MESHER HIBRID (aici e economia): stratul 0 se randează direct ca grilă de vârfuri — o editare rescrie un buffer float32, ~0,1 ms, zero algoritm. Naive Surface Nets la 0,5 m rulează DOAR pe coloanele cu >1 interval (peșteri, overhang, guri de galerie). Referință măsurată: fast-surface-nets face ~20 M triunghiuri/s pe un singur core de i7 2,5 GHz (Rust). În TS/WASM estimez 4-6 M tri/s (ÎNCREDERE SCĂZUTĂ — nemăsurat), deci un chunk cu ~8k triunghiuri de cavernă ≈ 1,5-2 ms, pe worker, în afara tickului.

Săpatul: brush continuu care editează înălțimile la 1 m, cu clamp de pantă. Sapiens face exact asta și confirmă limita: se poate săpa până la nivelul mării, dar plăcile adiacente nu pot fi cu mai mult de 2 nivele peste țintă — de aceea Sapiens NU are peșteri. Noi ridicăm restricția introducând al doilea interval în loc să coborâm înălțimea.

LUME: 512×512 chunkuri = 32,7 km × 32,7 km = 1.070 km², procedurală (noise + hidrologie), persistată ca DELTĂ față de generator, nu ca chunk întreg. Rezidente complet ~9×9 chunkuri (576 m). Comparație onestă cu Sapiens: suprafață declarată 884.279.719 km², subdiviziune geodezică pe nivelele 13-21, sample-uri de referință la 4 m — din care derivez ~4,4×10^13 vârfuri la nivelul 21 ⇒ spațiere ~4,8 m (DERIVAT de mine din două fapte confirmate, nu citat; încredere medie). Noi schimbăm suprafața pe rezoluție: 1 m e ~4,8× mai fin decât Sapiens, pe o fracțiune infimă din arie.

### Lume
Din senzația Sapiens rețin patru lucruri și le cumpăr pe fiecare separat, ieftin:

1. FĂRĂ ECRANE DE ÎNCĂRCARE — streaming de chunkuri de 64 m, teren procedural, orizont continuu. Anti-modelul e Ostriv: 7 hărți hardcodate (heightmap 1024×1024, zonă jucabilă 512×512, numele hărților în binar — nici modderii nu pot adăuga), iar plângerea #1 a jucătorilor e „nu pot construi nici pe teren ușor denivelat”. Lumea trebuie să fie mai mare decât ambiția jucătorului.

2. MIGRAȚIE, NU HARTĂ — poți pleca și întemeia altundeva. Asta e teza deja luată (așezările abandonate rămân) și e susținută mecanic de treptele de mai jos.

3. TREI TREPTE DE FIDELITATE:
   • T0 — Activ, EXACT O așezare: tick complet 20 Hz, agenți, camere, temperatură, producție. Rază 288 m (9×9 chunkuri), ~40 de pioni.
   • T1 — Cald, ≤6 așezări: tick 1 Hz agregat, fără agenți; stocuri/producție/populație ca ecuații pe totalurile grafului de camere. Estimez ~20 µs fiecare (ÎNCREDERE SCĂZUTĂ, nemăsurat).
   • T2 — Rece, nelimitat: fără tick. Doar o înregistrare cu `lastTickAt` și recuperare în formă închisă la vizitare (degradare de structuri, derivă de stocuri). Ruinele, avanposturile și cuiburile de jefuitori trăiesc aici, la cost zero.
   Promovarea unei așezări T1/T2 → T0 = reconstrucție de lattice + graf de camere din modelul poligonal salvat, 1-2 s.

4. JUSTIFICAREA CĂ O SINGURĂ AȘEZARE E T0: Sapiens însuși se degradează peste ~40 de populație și începe să greșească peste ~60 (oameni care stau, abandonează sarcini, se blochează în pereți — raportat de jucători). Ținta noastră de 40 de pioni E plafonul practic al referinței. A cere două colonii simultane la fidelitate completă înseamnă a cere de două ori ce nici referința nu livrează.

Ce NU import din Sapiens: sfera. Icosaedrul geodezic e elegant și costă un an de matematică de coordonate (seams, poli, LOD pe triunghiuri neuniforme). Un plan cu chunkuri pătrate dă aceeași senzație de nelimitat la 1/20 din efort. Sacrificiu declarat: nu poți înconjura lumea.

### Constructie
CLĂDIREA NU E TEREN. Asta e despărțirea care face totul posibil: Going Medieval bagă și terenul și clădirea în același voxel grid de 250×250×16 (10^6 voxeli); Foundation și Ostriv au doar teren și zero interioare. Noi le separăm în două structuri de date diferite.

O clădire = TEANC DE NIVELE. Un nivel are:
 • `baseY` (float, metri absoluți) și `height` (2,2-4,0 m)
 • un set de SEGMENTE DE PERETE — segmente 2D la unghi arbitrar (snap implicit la 15°, liber cu Alt — precedent Sims 4), grosime 0,15-0,80 m
 • un ARRANGEMENT PLANAR (DCEL / half-edge) construit din acele segmente
 • deschideri (ușă/fereastră) ca intervale parametrice pe muchia unui perete
 • plăci de pardoseală per față, acoperiș pe conturul exterior (straight skeleton)

RECONSTRUIEȘTE, NU ÎNTREȚINE INCREMENTAL. Ăsta e trucul care omoară obiecția „fără grilă întreții incremental 3 sisteme grele”. Un nivel are ≤400 segmente. Sweep Bentley-Ottmann + extragere de fețe (algoritmul Eberly de bază minimală de cicluri pe graf planar, geometrictools.com) pe 400 de segmente e sub milisecundă. Bugetul dur vine dintr-o măsurătoare vecină: CDT-JS triangulează 1.000 de puncte cu constrângeri în 5-8 ms (i7-4712HQ, V8), dar 10.000 de puncte cu 0,1N constrângeri în 232 ms și 100.000 în 26,5 s. Deci: PLAFON ABSOLUT 1.500 de vârfuri per nivel ⇒ ≤10 ms per reconstrucție, doar la editare, în afara tickului. Numărul ăsta bornează tot modelul de clădire.

IGIENĂ NUMERICĂ OBLIGATORIE: toate capetele de perete se rotunjesc pe un lattice întreg de 1 cm (i32 mm) și toate predicatele geometrice se fac pe întregi. Nu e o grilă de gameplay — e singura cale ca DCEL-ul să nu fie o fabrică de bug-uri.

MULTI-ETAJ: nivele libere în model; plafon practic 6 (Sims 4 livrează exact 6: 4 deasupra + 2 subsol — precedentul că „6 ajunge”). Fără plafonul de 16 z-levels al lui Going Medieval, dar și fără 8 nivele de mină.

SUBTERAN: un nivel subteran e un nivel cu `baseY` sub teren; plasarea lui SCRIE un interval în heightfield-ul stratificat (bottom = baseY-0,2, top = baseY+height). Mesherul produce automat gura de galerie. Limită dură: 3 nivele subterane (K=4 intervale).

STABILITATE: graf de piese cu decrement, model Valheim (maxSupport/minSupport, pierdere verticală + orizontală), NU grilă. Piese fondate pe rocă = 1,0; propagare cu pierdere orizontală 0,25/m pentru piatră (⇒ ~4 m deschidere, exact pragul Going Medieval de max 4 spații între suporți), 0,10/m pentru grinzi de lemn (⇒ ~10 m, exact grinzile de 10 tile din GM), 0,05 per nivel vertical. Constantele sunt CALIBRAREA MEA după pragurile GM, nu valori citate (ÎNCREDERE SCĂZUTĂ pe cifre, ÎNCREDERE MARE pe pragurile-țintă). ~3.000 de piese per așezare, relaxare BFS la editare: trivial.

PREZENTARE: zero clădiri modelate. Precedent direct și decisiv — Foundation, cu ~18-20 de oameni și motor propriu, a ales ZIDURI PARAMETRICE: WALL_CONFIG cu Width/Height/CrenationDistance/UvTilingWall/UvTilingTop ⇒ mesh generat. Un solo fără artist nu are scuză să modeleze pereți. Variația formei vine din parametri + hash de coordonate, nu din assets.

### Camere si temperatura
CAMERA = FAȚĂ MĂRGINITĂ A ARRANGEMENT-ULUI, plus predicatul „închisă?”: are placă de pardoseală, are tavan (placa nivelului de deasupra sau acoperiș) și fiecare muchie de contur e perete sau deschidere închisă.

Ăsta e cel mai puternic argument al propunerii. Research-ul anterior spune corect că flood fill-ul MOARE fără grilă. Corect — dar extragerea de fețe nu moare. Arrangement-ul ESTE testul de închidere, e exact, n-are rezoluție, n-are ambiguitate de scurgere pe diagonală (pe care flood fill-ul pe grilă o are și trebuie cârpită). Camera nu e aproximată, e calculată.

GRAFUL DE CAMERE: noduri = camere + „exterior” + „rocă” (fețe îngropate în teren). Muchii = pereți partajați și deschideri.
 • Conductanță muchie: C = U × ariaPartajată. U [W/m²K] din JSON: lemn 1,0 · piatră 2,0 · pământ bătut 0,6 · față naturală de rocă 0,15 · ușă închisă 2,5 · ușă deschisă 25,0 (schimb liber de aer) · fereastră 4,0.
 • Capacitate nod: Cp = volum_m³ × 1,2 kJ/m³K (aer) + ariaPardoselii × 60 kJ/m²K (masă termică). Al doilea termen e ce face pivnița lentă și e tot ce ne trebuie ca să înlocuim inerția termică fără simulare de fluide.
 • Integrare: backward Euler pe graful rar, la 1 Hz timp-de-joc (NU 20 Hz). ~200 de camere ⇒ sistem rar 200×200, conjugate gradient cu NUMĂR FIX de iterații (30) ca să rămână determinist. Estimez <0,3 ms (ÎNCREDERE SCĂZUTĂ, nemăsurat).
 • Frontiere: aer exterior din curba climatică + TEMPERATURA SOLULUI LA ADÂNCIME, statică: T(d) = T_mediuAnual + (T_suprafață − T_mediuAnual) · exp(−d / 3,2 m). La 4 m amplitudinea sezonieră scade la ~29%, la 8 m la ~8%. ASTA e ce face pivnița să atingă pragul de 5 °C pentru conservarea hranei — din geometrie și adâncime, nu dintr-o regulă arbitrară. E extensia naturală a deciziei „pânză freatică statică”.

DE CE E MAI BUN DECÂT GOING MEDIEVAL, NU DOAR DIFERIT: sistemul GM e reclamat ca neintuitiv — izolația construită „ridică mereu temperatura”, plăcile naturale sunt „izolație aproape perfectă”, orice construiești peste natural înrăutățește. E un model de gameplay, nu unul fizic, și de aceea nu poate fi explicat în UI. Al nostru e o rețea de conductanțe: panoul de cameră poate afișa literal „pierzi 340 W prin ușa spre exterior, 90 W prin acoperiș” și jucătorul învață fizică, nu trivia.

COSTUL DECLARAT: totul depinde de robustețea arrangement-ului. O cameră calculată greșit = temperatură greșită = mâncare stricată fără cauză vizibilă, iar jucătorul raportează „bug de temperatură” când bugul e la 4 straturi distanță. Vezi killerObjection.

### Coliziune intre agenti
„CELULA” DEVINE „NOD”, ȘI ASTA E REZOLVAREA, NU O EVAZIUNE.

Rețea hexagonală (triunghiulară) de noduri la 0,55 m, generată per suprafață navigabilă per chunk, clipată pe poligonul navigabil, 6-conexă. Densitate 1/((√3/2)·0,55²) = 3,82 noduri/m². Un chunk de 16×16 m ⇒ ~978 de noduri per suprafață; generare ~0,3-1 ms, invalidată doar la editare (ÎNCREDERE SCĂZUTĂ pe ms, nemăsurat). Rază de agent 0,275 m ⇒ corpurile nu se suprapun NICIODATĂ — constrângerea 4 e satisfăcută literal, spre deosebire de Ostriv și Foundation unde agenții se întrepătrund liber (Foundation n-are coliziune DELOC, nici măcar între clădiri).

MIȘCARE = PIBT, UN PAS PE TICK. Confirmat din sursă primară (kei18.github.io/pibt2): PIBT „can be applied to several domains”, se aplică pe GRAFURI GENERALE, nu pe grile; garanția verbatim e că toți agenții ajung la destinație în timp finit „when the environment is a graph such that all pairs of adjacent nodes belong to a simple cycle (e.g., biconnected)”. Cost: ~2,6 µs/agent/pas ⇒ 40 de agenți ≈ 0,1 ms din tickul de 50 ms = 0,2% din buget. WHCA* e exclus: W=16, 100 de agenți ⇒ până la 50 ms continuu, adică un tick întreg.

DE CE HEXAGONAL ȘI NU PĂTRAT — argument geometric, nu estetic: într-o rețea triunghiulară, ORICE două noduri adiacente din interior au un vecin comun, deci stau pe un ciclu de lungime 3. Precondiția PIBT e satisfăcută PRIN CONSTRUCȚIE în spațiu deschis. O grilă 4-conexă dă doar cicluri de 4, iar un coridor lat de o placă nu dă niciunul. La 0,55 m: o ușă de 1,0 m = 2 noduri lățime, un coridor de 2,2 m = 4 noduri. Aproape toată clădirea reală e biconexă automat. Organicul e aici STRICT mai bun decât cubicul.

UNDE GARANȚIA TOT CADE (fundături: alcov de pat, front de mină, colț de depozit, ușă de un nod) — trei straturi:
 1. Puncte de articulație precalculate (Hopcroft-Tarjan, O(V+E)) la fiecare reconstrucție de lattice. Subarborele tăiat = „ramură înfundată”.
 2. TOKEN PE RAMURĂ: o ramură de N noduri admite cel mult floor(N/2) agenți; intrarea cere un token. Fără token, ținta se AMÂNĂ, nu se încearcă. Asta omoară scenariul „40 de agenți spre o cameră 3×3 = blocaj permanent”.
 3. REGULĂ DURĂ DE LUME MUTABILĂ: un agent nu poate emite ordin de demolare/săpare pe celula-suport a propriului nod, iar o sarcină care ar tăia ultima rută non-ramură spre un nod ocupat de altcineva e REFUZATĂ la rezervare. Ăsta e bug-ul din Going Medieval în care settlerul își demolează scara de sub el și se zidește (surse ~80%, nu 100% — deci regulă de design, nu repro).

REZERVĂRILE TRĂIESC UN TICK. PIBT le dă gratis; niciun tabel persistent de rezervări.

SCĂRI: precedentul ONI (scară bidirecțională = strangulare; rezolvat cu două transporturi unidirecționale). La noi scara = DOUĂ lanțuri paralele de noduri (sus/jos), fiecare de lățime 1, ambele sub un pool comun de tokenuri. Direcționale ⇒ zero swap frontal pe scară.

RAZĂ LUNGĂ: două trepte. Grosier = graful de camere + graf de portaluri per chunk pentru A* (analog regiunilor de ~420 de noduri din GM). Fin = lattice-ul hexagonal, doar în coridorul activ. PIBT are nevoie doar de următorul nod, deci lattice-ul fin nu are niciodată nevoie de A* global.

COSTUL VIZUAL, DECLARAT: la 1 m/s un pion trece un nod la ~11 tickuri ⇒ mișcarea e discretă la bază. Poziția randată e un lerp cu amortizare, constantă de timp 0,18 s, plus un offset lateral per agent ≤0,12 m ca șirurile să nu arate ca un tren. Nodul e adevărul, mesh-ul minte cu până la ~0,3 m. E aceeași minciună pe care Ostriv o spune cu navmesh-ul intenționat inset — doar că explicită. CONSECINȚĂ OBLIGATORIE: hit-testul de selecție se face pe poziția LOGICĂ, altfel clickul ia alt pion decât cel de sub cursor.

DE FURAT DIN OSTRIV, NENEGOCIABIL: validarea de accesibilitate la plasare (hotfix 11, ian. 2025, 3 săptămâni de muncă) — drum de la nodul de spawn de pe marginea hărții la FIECARE intrare a FIECĂREI clădiri; clădirea care blochează intră în fail state și UI-ul arată CARE intrare e blocată. Cu ocupare exclusivă, asta nu e lux, e obligatoriu.

### Realism
RECOMANDARE: „REALISM DE MATERIAL, NU DE MODEL”. Între Foundation și Manor Lords pe iluminare/materiale, sub ambele pe densitate geometrică, cu ~1/20 din bugetul de artă — pentru că geometria e GENERATĂ, nu modelată. Contest parțial recomandarea anterioară de „low-poly stilizat (b+)”: stilizarea era propusă ca economie de artă, dar dacă nicio clădire nu e modelată, economia s-a făcut deja în altă parte, iar paleta sobră PBR nu costă mai mult decât cea stilizată. Costul realismului nu e în shader, e în numărul de assets unice — și noi îl aducem la ~zero.

CONCRET:
 • PBR, paletă sobră, proporții reale (tavan 2,2 m, ușă 0,9 m), fără contur, fără cel shading, fără saturație exagerată.
 • Buget de texturi: 2 trim sheets + 1 array de teren. Trim sheet 4096² × (albedo BC7 ≈ 11 MB + normal BC5 ≈ 5,5 MB + ORM BC7 ≈ 11 MB) = 27,5 MB fiecare; teren = array 1024² pe 8 straturi BC7 ≈ 8 MB. TOTAL SUB 80 MB. Tot ce se vede în lume e UV-uit în astea.
 • ILUMINARE: ZERO GI coaptă. Terenul se sapă la runtime ⇒ lightmaps imposibile — asta e constrângerea care ucide realismul UE5 și nu e negociabilă. În loc: un soare direcțional cu 3 cascade de umbră 2048², IBL din cer analitic (Hosek/Preetham), SSAO/GTAO și — trucul care merită — O SONDĂ SH-L1 PER CAMERĂ, actualizată când se schimbă deschiderile. Graful de camere există deja; e ambient gratuit și determinist, și e exact ce face interiorul să arate ca interior.
 • SLICE VIEW = CLIP PLANE, NU TRANSPARENȚĂ. Tăietură orizontală la tavanul nivelului activ: geometria de deasupra e CULLED, nu estompată, iar tăietura se capsulează cu stencil și o culoare de secțiune per material. Evită complet conflictul GI↔transparență (Lumen are integrare limitată cu transparența complexă) și evită clasa de bug „hitbox rămas” din toggle-ul de acoperiș al lui Going Medieval — pentru că la noi datele de navigație și coliziune sunt PER NIVEL oricum; nimic nu e „ascuns dar încă acolo”.
 • SINGURA ARTĂ LUCRATĂ DE MÂNĂ: personajele. 1 mesh de bază (~4k tri), 4 LOD-uri, ~30 de clipuri de muncă + 8 de locomoție, 4 seturi de haine prin swap de textură. Ăsta e singurul post pe care se plătește freelance: set PBR modular $1.500-2.500 la preț de piață, $25-45/h în Europa de Est ⇒ ~40-60 h. Atenție la licențe: pachetele Synty ($10-150) INTERZIC explicit AI generativ în licența standard.
 • RESPINS EXPLICIT: Nanite (nu e făcut pentru geometrie generată la runtime), Lumen (8 ms@30fps / 4 ms@60fps la 1080p = tot bugetul de cadru pe hardware modest), dependența de Megascans (era gratuită s-a închis la finalul lui 2024; acum $0,99/asset, Bridge deprecat mai 2026).
 • APĂRARE REPUTAȚIONALĂ: un stil vădit manual e singura apărare contra acuzației de AI (Party Animals, mai 2026: >800 recenzii negative, Very Positive → Mostly Negative în <24h; Shrine's Legacy lovit pe o acuzație FALSĂ). Geometria parametrică ajută aici — e demonstrabil cod, nu generare.

STACK RECOMANDAT (și e partea cea mai contestabilă): nucleu de simulare în TS pur, zero dependențe de motor (decizie deja luată), randare three.js/WebGPU, împachetare Electron + Steamworks.js. Precedent de TS-pe-Steam: Athena Crisis (Null Games / Nakazawa Tech, Steam 23.09.2024, Electron, >100k linii open-source). Riscuri reale: three.js WebGPU NU e universal mai rapid — issue mrdoob/three.js#31055 raportează WebGPU mai lent decât WebGL pentru geometrie ne-instanțiată, iar avantajul apare la număr mare de draw calls (10.000 draw calls: WebGPU ~50 FPS vs WebGL ~30 FPS) și la compute. Arhitectura noastră e instanțiere grea + mesh generat, adică exact profilul favorabil — dar asta e o PREDICȚIE, nu o măsurătoare (ÎNCREDERE SCĂZUTĂ). De aceea pasul 8 din plan are ca livrabil un NUMĂR măsurat, nu un screenshot.

### De ce se simte ca Sapiens
Pentru că livrează exact cele patru lucruri care produc senzația, și niciunul dintre cele scumpe care n-o produc.

1. LUMEA E MAI MARE DECÂT AMBIȚIA TA. 1.070 km² procedurali, streaming continuu, fără ecrane de încărcare, persistare ca deltă. Anti-modelul e Ostriv, care cu 7 hărți hardcodate (nici modderii nu pot adăuga, numele sunt în binar) produce senzația opusă — și plângerea #1 a jucătorilor lui e fix despre limitarea terenului.

2. PĂMÂNTUL E MATERIE, PESTE TOT. Sapiens te lasă să sapi și să umpli oriunde — cu o limită pe care el n-o depășește: se poate coborî până la nivelul mării, dar plăcile adiacente nu pot fi cu mai mult de 2 nivele peste țintă, deci Sapiens NU are peșteri și NU are subteran. Noi păstrăm „modelează toată lumea” și adăugăm ce el refuză, prin al doilea interval pe coloană. Senzația e a lui Sapiens, capacitatea e peste.

3. FIDELITATEA E LOCALĂ, LUMEA E GLOBALĂ. T0/T1/T2 înseamnă că lumea trăiește fără să coste: triburi vecine, rute, ruine. Sapiens face exact asta cu triburi simulate non-jucător cu care faci comerț. Și justificarea că doar O așezare e la fidelitate completă vine tot din Sapiens: peste ~40 de populație apare un cost greu, peste ~60 apar erori de comportament (oameni care stau, abandonează sarcini, se blochează în pereți). Ținta noastră de 40 e plafonul practic al referinței — nu ne prefacem că-l depășim, îl respectăm și cumpărăm restul lumii ieftin.

4. AȘEZĂRILE ABANDONATE RĂMÂN. Teza de produs deja luată devine mecanic gratuită: demotarea la T2 păstrează modelul poligonal și graful de camere, adaugă un ceas de degradare, permite re-promovare sau jefuire. Fără treapta T2 teza ar fi fost o promisiune de marketing; cu ea e o linie de cod.

CE NU IMPORT ȘI DE CE: sfera geodezică. Sapiens are 884.279.719 km² pentru că are un icosaedru subdivizat; asta aduce cu ea seam-uri, poli, LOD pe triunghiuri neuniforme și un sistem de coordonate care nu se aliniază cu niciun arrangement planar. Costul e un an de matematică pentru un beneficiu pe care jucătorul nu-l vede niciodată, pentru că nu înconjoară planeta. Plan cu chunkuri pătrate, aceeași senzație, 1/20 din efort. Sacrificiul e declarat: lumea are margine, chiar dacă la 32 km.

### De ce pastreaza adancimea Going Medieval
Pentru că separarea teren/clădire cumpără adâncimea GM fără voxel grid-ul lui, și în două locuri o depășește.

• MULTI-ETAJ: nivele libere în model, 6 practic. GM are 16 z-levels în total, împărțite 8 sus / 8 jos. Noi pierdem la subteran, nu la suprafață. (Sims 4 livrează 6 nivele — 4 + 2 subsol — ca precedent că 6 e suficient pentru joc, nu doar pentru demo.)

• SUBTERAN: real, săpat, cu gură de galerie, cu 3 nivele suprapuse. Nu e „clădire de suprafață care se cheamă mină” ca la Ostriv.

• CAMERE ÎNCHISE: aici DEPĂȘIM GM. Camera e o față a arrangement-ului planar — exactă, fără rezoluție, fără ambiguitatea de scurgere pe diagonală pe care orice flood fill pe grilă trebuie s-o cârpească. Nu aproximăm închiderea, o calculăm.

• TEMPERATURĂ: graf de camere cu conductanțe reale (U × arie), masă termică pe pardoseală, backward Euler 1 Hz, plus temperatura solului atenuată exponențial cu adâncimea (constantă 3,2 m). Pivnița la 4 m atinge pragul de 5 °C pentru conservarea hranei din GEOMETRIE ȘI ADÂNCIME. Aici iar depășim GM, al cărui sistem e reclamat ca neintuitiv — izolația construită „ridică mereu temperatura”, roca naturală e „izolație aproape perfectă”, orice construiești peste natural înrăutățește. Modelul nostru e explicabil în UI: „pierzi 340 W prin ușă, 90 W prin acoperiș”.

• STABILITATE STRUCTURALĂ: graf de piese cu decrement (Valheim), calibrat pe pragurile GM — deschidere de piatră ≤4 m între suporți (GM: max 4 spații de grilă), grinzi de lemn ≤10 m (GM: grinzi de 10 tile), pierdere verticală per nivel. Prăbușirea e un eveniment discret care re-rulează arrangement-ul și lattice-ul pe nivelul afectat. Research-ul anterior confirmă că stabilitatea prin decrement e exact sistemul care SUPRAVIEȚUIEȘTE fără grilă.

• LANȚURI DE PRODUCȚIE ADÂNCI: complet independente de geometrie, JSON pe pipeline-ul deja decis. Trucul de furat e din Manor Lords, nu din GM: extensiile de nivel 2 ale burgage plot-ului sunt ATELIERE (fierar, croitor, brutar, cizmar, armurier) — lanțul trece PRIN locuință. Adâncime economică fără nicio clădire nouă de desenat. Cu camere ca fețe de arrangement, „atelierul e o cameră a casei” e gratis la noi, nu e o mecanică specială.

• DEFENSIVA: pe aceeași buclă de sarcini (decizie luată). Onest: aici PIERDEM față de GM/DF — vezi whatItSacrifices.

### Ordinea de implementare
1. Săpt. 1-2 — Nucleu determinist + harness headless. Toată starea de simulare în întregi (poziții i32 mm, înălțimi i32 cm); tick 20 Hz; test golden-replay: aceeași sămânță + același jurnal de comenzi ⇒ același hash de stare la tickul 100.000. Zero dependențe de motor. Reproductibilitatea se dovedește ÎNAINTE de orice măsurătoare comparativă.
2. Săpt. 2-3 — Teren stratificat + mesher hibrid. Chunk 64 m, heightfield 65×65 @1 m i16 cm + tabel sparse de intervale (max 4/coloană). Stratul 0 randat direct ca grilă; Surface Nets 0,5 m doar pe coloanele cu >1 interval. Unealtă de săpat cu clamp de pantă. Poartă: 1.000 de editări aleatoare ⇒ mesh închis, fără NaN, remesh < 4 ms/chunk MĂSURAT.
3. Săpt. 3-4 — Arrangement planar. Snap pe lattice întreg de 1 cm, sweep Bentley-Ottmann, extragere de fețe (Eberly, bază minimală de cicluri). Camera = față. Plafon dur: ≤1.500 vârfuri/nivel, ≤10 ms. Fuzzer OBLIGATORIU: 10.000 de pereți aleatori ⇒ numărul de fețe și aria totală stabile. Dacă fuzzerul nu e verde în 10 zile lucrătoare, se abandonează arhitectura (vezi killerObjection).
4. Săpt. 4-5 — Rețea hexagonală + PIBT. Lattice 0,55 m clipat pe poligonul navigabil, 6-conex; puncte de articulație (Hopcroft-Tarjan) la fiecare reconstrucție; PIBT cu token pe ramuri înfundate; scări ca două lanțuri unidirecționale. Test adversarial: 40 de agenți cu țintă într-o cameră 3×3, 10.000 de tickuri ⇒ zero blocaje permanente, toți ating ținta.
5. Săpt. 5-6 — Graf de camere + temperatură. Conductanțe din JSON, backward Euler la 1 Hz, conjugate gradient cu 30 de iterații FIXE (determinism), temperatura solului exp(−d/3,2 m). Poartă: pivniță la 4 m adâncime ⇒ ≤5 °C în vârf de vară, ±0,5 °C, reproductibil peste 3 rulări.
6. Săpt. 6-7 — Stabilitate pe graf de piese. Decrement calibrat (piatră 0,25/m orizontal, lemn 0,10/m, 0,05/nivel). Prăbușirea re-rulează pașii 3 și 4 pe nivelul afectat. Test: pivniță de 7×7 fără stâlpi se prăbușește; cu stâlpi la 4 m rezistă.
7. Săpt. 7-8 — O singură buclă de sarcini. Construcție, transport, producție și apărare pe aceeași coadă (decizie luată). Rezervări de un tick. Regula „nu demola celula-suport a propriului agent” + refuzul sarcinii care taie ultima rută non-ramură. Plus validarea de accesibilitate la plasare, model Ostriv hotfix 11: rută de la marginea hărții la FIECARE intrare, cu UI care arată CARE intrare e blocată.
8. Săpt. 8-10 — Randare. three.js/WebGPU: instanțiere pentru pereți/props, mesh parametric pentru pereți/acoperișuri (model WALL_CONFIG), clip plane orizontal cu capac stencil pentru slice view, sondă SH-L1 per cameră, 3 cascade de umbră 2048². Poartă: 60 FPS la 1080p pe o placă de clasă GTX 1050, MĂSURAT pe hardware real, nu estimat.
9. Săpt. 10-11 — Streaming + cele 3 trepte. T0/T1/T2, promovare/demovare de așezare în ≤2 s, persistare ca DELTĂ față de generator. Test: părăsești o așezare, mergi 3 km, te întorci după 2 ani de joc ⇒ ruină coerentă, nu stare coruptă.
10. Săpt. 11-12 — O singură verticală de producție reală. Lut → cărămidă → cuptor → pivniță rece. 40 de pioni, 3 nivele supraterane + 1 subteran, o iarnă completă. Ăsta E vertical slice-ul; nimic în plus.
11. Săpt. 12 — Poarta de decizie, cu trei numere pe masă: (a) ms/tick la 40 de pioni cu toate sistemele pornite, (b) FPS la 1080p pe hardware modest, (c) timpul real de la „vreau o pivniță” la „pivnița e rece”. Dacă oricare cade, decizia se ia AICI, nu peste un an. Referințele externe spun de ce: Ostriv solo din 2014 e încă în EA, Foundation a stat 6 ani în EA cu ~18-20 de oameni, Sapiens ~7-10 ani cu un om.
12. (Doar dacă poarta trece) — Împachetare Electron + Steamworks.js, Steam Direct $100. E singurul drum verificat pentru TS pe Steam (Athena Crisis, 23.09.2024). Se face DUPĂ poartă, pentru că e o zi de muncă și zero informație decizională.

### Timp pana la vertical slice
10-14 săptămâni cu normă întreagă până la vertical slice, sau 5-7 luni la 15-20 h/săptămână.

ARGUMENTUL PENTRU: (1) nu se modelează niciun asset — toată geometria de clădire e parametrică, singura artă lucrată de mână e un personaj plus ~38 de clipuri, externalizabile; (2) nucleul e TypeScript pur, limba în care dezvoltatorul are 5 aplicații live și disciplină de teste headless și CI — nu e o curbă de învățare, e viteză maximă din ziua 1; (3) cele patru sisteme grele (arrangement, lattice+PIBT, graf de camere, graf de stabilitate) sunt fiecare sub ~800 de linii TOCMAI pentru că se RECONSTRUIESC per nivel/chunk în loc să fie întreținute incremental — ~400 de segmente și ~1.000 de noduri sunt numere mici, iar întreținerea incrementală e ce transformă geometria computațională într-un proiect de doi ani; (4) PIBT e ~150 de linii și e deja publicat cu pseudocod.

ARGUMENTUL ÎMPOTRIVA, pe care îl accept: reperele externe sunt brutale și niciunul nu e mai bun decât estimarea mea. Ostriv — solo din 2014, echipă din 2018, motor propriu, ÎNCĂ în Early Access, 3,5 ani fără versiune majoră; o singură clădire = 556 de piese modelate, ~26 KB de cod, ~5 luni. Foundation — 2 fondatori → ~18-20 de oameni, 6 ani de EA (feb. 2019 → ian. 2025), 9 ani de la fondare, iar alinierea pe înălțime a pieselor de monument pe teren înclinat e încă nerezolvată în devlogul #20 din feb. 2026. Sapiens — un om, ~7-10 ani. Manor Lords — ~7 ani, cu programatori suplimentari și un întreg departament de mocap plătit din Patreon + Epic MegaGrant, și autorul admite „dacă eu mă opresc, s-a terminat jocul”.

DECI, CITIT CORECT: 10-14 săptămâni e estimarea pentru SLICE — o verticală (lut→cărămidă→cuptor→pivniță rece), 40 de pioni, o iarnă, 4 nivele. JOCUL e o scară de ani, și exact de asta orizontul angajat se oprește la slice. Marja de eroare pe care o declar e asimetrică: ×1,0 în jos, ×3 în sus, iar tot riscul de ×3 stă concentrat într-un singur loc — pasul 3, arrangement-ul planar. Dacă pasul 3 intră în buget, restul e muncă previzibilă.

### Obiectia proprie (killer objection)
Nu există niciun joc livrat care să întrețină un arrangement planar robust ca SURSĂ DE ADEVĂR pentru camere într-o lume editabilă — iar eu pariez tot sistemul termic, deci toată bucla de supraviețuire, pe robustețea geometrică, adică fix pe partea care îl omoară statistic pe dezvoltatorul solo.

Flood fill-ul pe grilă e imposibil de stricat: e o coadă și un set de vizitate, îl scrii în 40 de linii și nu te mai uiți la el 3 ani. Un DCEL e o mașinărie de cazuri degenerate: doi pereți coliniari care se suprapun parțial; trei pereți care se ating într-un singur punct; un perete de 0,15 m grosime al cărui offset se auto-intersectează la un unghi ascuțit de 12°; o ușă plasată exact pe un vârf; un perete desenat de două ori peste el însuși. Niciunul dintre astea nu aruncă o excepție. Fiecare produce O CAMERĂ GREȘITĂ — deci o temperatură greșită, deci mâncare stricată fără cauză vizibilă — iar jucătorul raportează „bug de temperatură” când cauza e la patru straturi distanță și la trei ore de joc în urmă. E cea mai scumpă clasă de bug care există: tăcută, nedeterministă din perspectiva jucătorului, și imposibil de reprodus dintr-un screenshot.

Și am dovada că factura e reală, nu teoretică. Ostriv a plătit-o exact: trecerea la forme concave (devlog 11.05.2026, hotfix 55) a cerut triangulare, refactor COMPLET la picking ȘI la detecția de suprapunere, benzi de muchie ajustate pe elevație și un micro-pathfinding NOU pentru constructori, pentru că linia dreaptă depozit→punct nu mai era garantat liberă; propria formulare a devului e „Convex shapes math is much more simple than concave”. Foundation, cu ~18-20 de oameni și 7 ani, tot n-a rezolvat alinierea pe înălțime a pieselor pe teren înclinat, iar snap-ul pe proximitate („două puncte albe trebuie să se atingă”) e sursă de frustrare cronică. Iar research-ul e categoric: NU există joc livrat cu simultan interioare simulate multi-etaj/subteran ȘI plasare organică fără grilă. Eu propun exact lucrul pe care nimeni nu l-a livrat.

Contraargumentul meu — snap pe lattice întreg de 1 cm, predicate exacte pe întregi, reconstrucție completă per nivel în loc de întreținere incrementală — e corect. Dar e corect PE HÂRTIE. Riscul real nu e că algoritmul e greșit, e că săptămâna 3-4 din plan devine săptămâna 3-14, și atunci întregul argument de „10-14 săptămâni până la slice” cade, iar cu el cade motivul pentru care arhitectura asta e preferabilă unei grile logice de 1 m cu prezentare organică.

DE ACEEA PUN TESTUL CARE MĂ POATE UCIDE, ÎN PLAN, LA VEDERE: dacă în 10 zile lucrătoare nu am un fuzzer care plasează 10.000 de pereți aleatori (inclusiv toate degenerările de mai sus) și demonstrează că numărul de fețe și aria totală rămân stabile și deterministe, arhitectura STRATA se abandonează în favoarea grilei logice de 1 m. E mai ieftin să pierd 10 zile decât 10 luni, iar un arhitect care nu-și declară pragul de abandon nu propune o arhitectură, propune o speranță.

### Ce sacrifica
- Micro-terraformarea sub 1 m. Nu poți săpa un șanț de 40 cm — rezoluția orizontală a terenului e 1 m (0,5 m doar la randare). Sacrificiu conștient: la 0,25 m numărul de coloane crește ×16 și streamingul moare.
- Maximum 3 goluri suprapuse per coloană ⇒ maximum 3 nivele subterane. Going Medieval are 8. Un „Dwarf Fortress cu 20 de nivele de mină” e EXCLUS prin construcție, nu amânat.
- O singură așezare la fidelitate completă (T0) în orice moment. Nu poți privi două colonii lucrând simultan; comutarea costă 1-2 s. Atenuare: Sapiens însuși se degradează peste ~40 de populație, deci nu sacrificăm ceva ce referința livrează.
- Fără simulare de fluide și fără pânză freatică dinamică (decizie anterioară, păstrată și extinsă). Inundarea unei galerii e un eveniment discret pe graful de camere, nu o simulare. Consecință: nu există „sapi prea adânc și vine apa” ca fenomen emergent.
- Mișcarea agenților e discretă pe noduri de 0,55 m. Fluiditatea e cumpărată cu interpolare vizuală, deci poziția randată poate diferi de cea logică cu până la ~0,3 m. Consecință obligatorie de implementare: hit-testul de selecție trebuie făcut pe poziția LOGICĂ, altfel clickul ia alt pion decât cel de sub cursor.
- Zero clădiri unicat modelate de mână. Nicio catedrală, niciun castel-reper, nimic monumental. Foundation a avut nevoie de un builder MODULAR de monumente tocmai pentru că parametricul nu ajunge la monumental — noi renunțăm la monumental, nu îl amânăm.
- Realism fotografic: exclus definitiv. Fără Nanite (nu e făcut pentru geometrie generată la runtime), fără Lumen (4 ms@60fps la 1080p e tot bugetul de cadru pe hardware modest), fără GI coaptă (terenul se sapă la runtime). Realismul e de material și de lumină directă, niciodată de geometrie.
- Lumea are margine: 32,7 km × 32,7 km. Nu e sferă, nu o poți înconjura. Am tăiat intenționat icosaedrul geodezic al lui Sapiens ca economie de ~un an de matematică de coordonate.
- Tactica de coridor în apărare. Cu 1 agent/nod și tokenuri pe ramuri înfundate, o „ambuscadă pe coridor” devine o coadă, nu o tactică. În Dwarf Fortress valoarea chokepoint-ului nu vine oricum din corpuri, ci din poduri mobile, capcane, plăci de presiune și fortificații — deci calea e să construim ACELEA, dar ele nu sunt în slice și nu sunt în estimare.
- Stackul TS/WebGPU/Electron n-are editor și n-are precedent de colony sim 3D livrat. Athena Crisis dovedește TS-pe-Steam, nu TS-pe-colony-sim-3D; iar three.js WebGPU e raportat mai lent decât WebGL pentru geometrie ne-instanțiată (issue #31055). Dacă slice-ul ratează 60 FPS, portarea randării e o rescriere de 2-3 luni — protejată DOAR de faptul că nucleul de simulare n-are nicio dependență de motor. Asta e asigurarea, și e singura.
- Determinismul costă precizie fizică: temperatura se integrează cu un număr FIX de iterații de conjugate gradient (30), nu până la convergență. În camere patologice (30+ deschideri) rezultatul e aproximativ. Prefer aproximația reproductibilă exactității nereproductibile.


---

## 4. Grilă Promovată (Promoted Grid)

**Teza:** Grila cubică de 1 m este UNIVERSALĂ ca sistem de coordonate și de coliziune, dar STIVA verticală de voxeli există numai unde jucătorul a săpat sau a construit — restul lumii e un heightfield continuu streamed; „open world" se plătește în heightfield (ieftin), „adâncimea Going Medieval" se plătește în voxeli RLE (scump, dar rar), iar „organicul Ostriv/Foundation" se plătește exclusiv în stratul de prezentare, niciodată în date.

### Teren
TREI STRATURI, cu bytes exacți.

**L0 — harta macro, mereu rezidentă.** Lume plată (NU sferă), 16,384 km × 16,384 km, un sample la 16 m ⇒ 1024 × 1024 = 1.048.576 samples. Per sample 8 B: height int16 în decimetri (±3276,7 m), biome u8, sol u8, umiditate u8, temperaturăBază int8, flags u8, rezervă u8 ⇒ **8,4 MB rezidenți permanent**. Ăsta e și ecranul de hartă, și substratul pentru expediții. Generat din seed (noise), nu salvat — se salvează doar delta.

**L1 — chunk de teren, streamed.** Chunk = 32 m × 32 m footprint (32 ales ca să încapă o coloană într-un `Uint32Array` de 32 de biți — vezi mesherul). 512 × 512 = 262.144 chunkuri în lume, **rezidente 400** (un disc de ~360 m rază în jurul camerei). Per chunk: heightfield 1 m = 33×33 int16 cm (2.178 B) + material u8 per celulă 32×32 (1.024 B) + vegetație/props u8 (1.024 B) + header ⇒ **~4,3 KB**. 400 chunkuri = **1,7 MB**. Restul lumii nu există în RAM.

**L2 — promovare la voxeli (RARĂ).** Când jucătorul sapă, umple sau construiește într-un chunk, chunk-ul e PROMOVAT ireversibil la coloane de voxeli: 32 × 32 coloane × **64 niveluri de 1 m** (−24 m sub bază, +40 m deasupra). Stocare = **RLE pe coloană**, schema măsurată de Zeux pentru Roblox: run = {material 6 biți + flags 2 biți} u8 + lungime u8 = 2 B/run. Chunk proaspăt promovat ≈ 2 runs/coloană = 1.024 runs = **4 KB**; chunk de fortăreață săpată intens ≈ 8 runs/coloană = **16 KB**. Buget: **200 chunkuri promovate × 16 KB = 3,2 MB** — asta e TOATĂ așezarea, inclusiv subteranul.

Numerele de referință Zeux (sursă primară, măsurate pe ~1 miliard de voxeli ne-goi): memorie despachetată 2,97 B/voxel vs. **row-packed 0,49 B/voxel** (×6), disc RLE **0,07 B/voxel**, RLE+zstd 0,04 B/voxel. Un strat de un voxel grosime comprimă ×32 (64 KB → 2 KB). Deci 3 MB pe disc pentru o fortăreață e o cifră realistă, nu optimism.

Comparație de scară: Going Medieval e 250×250×16 = 1e6 voxeli, hartă FIXĂ și mărginită. Noi avem 200 chunkuri × 32×32×64 = 13,1 M sloturi de voxel, dar RLE-ul plătește doar discontinuitățile — costul real e sub al lui GM, în timp ce lumea din jur e de 268 km².

**Regula care ține totul:** grila de celule e DERIVATĂ peste tot (celula walkable a unei coloane ne-promovate = vârful heightfield-ului, una singură pe (x,z)); numai stiva verticală e rară. „Grila e universală, stiva e rară." Promovarea e chunk-granulară, permanentă, și include o **apron de 1 chunk** în jurul oricărei atingeri, ca seam-ul să fie o inel testabil, nu o suprafață.

### Lume
Ce anume din Sapiens contează, verificat din surse: (a) „you can now move as far away from your tribe as you like, exploring freely with limitless movement"; (b) „send sapiens over long distances and establish camps to gather far away resources"; (c) „the fact that you can explore everything you can see really adds to the immersion". Sapiens are 79% din 1.375 recenzii — deci senzația e livrată, dar nu e un jackpot; nu merită 7-10 ani.

Ce NU contează și unde s-au dus anii lui Frampton: planeta SFERICĂ. Wiki-ul de modding confirmă reprezentarea: `pointNormal` = punct normalizat pe o sferă de rază 1, obiecte generate pe **nivelurile de subdiviziune 13-21**, altitudini în intervalul −0,001..0,001 cu 1 metru = 0,00000023 unități, distanțe în hexagoane (river distance 1 ≈ 7650 hexagoane). Toate astea sunt sisteme de coordonate care se plătesc etern: pathfinding pe sferă, UI pe sferă, unelte pe sferă. **TAI SFERA.**

Propunerea concretă:
- **O singură lume plată continuă, 16 × 16 km (268 km²), din seed.** Pentru scară: Dwarf Fortress merge de la 32 km până la 481 km lățime (max 231.632 km²) — noi suntem deliberat între „arenă" și „planetă".
- **Zero loading screens.** Streaming de chunkuri pe distanță, camera zboară până la orizont, terenul modelat rămâne modelat.
- **UN singur sit rulează simularea la 20 Hz.** Celelalte situri sunt DATE: chunkuri RLE pe disc + un „site record" (proprietar, stocuri, ostilitate, tickul la care a fost părăsit). Avertismentul e RimWorld: max 5 colonii simultane, cu degradare de performanță și de balans recunoscută oficial — noi ocolim asta neexecutând niciodată două simulări.
- **Expedițiile** se rezolvă pe L0 ca o călătorie cronometrată (modelul caravanei din RimWorld), NU cu pathfinding per-tick. 4 pioni, 3 km, cost în ticks = f(distanță, teren, încărcătură).
- **Teza produsului devine aproape gratuită:** părăsești situl ⇒ chunkurile rămân pe disc (~3 MB); te întorci ⇒ încarci + aplici o funcție DETERMINISTĂ de decădere pe numărul de ticks scurse (fără simulare în absență). Dovadă că e dorit: modul „Persistent RimWorlds" există exact pentru „explore fallen colonies where pirates may lurk" — cerere de piață documentată pentru teza owner-ului, pe care jocul de bază NU o servește (ruinele din RimWorld nu pot fi recolonizate).

Redefinirea pe care o cer explicit: „open world" = **continuitate + persistență + libertate de a te muta**, nu **planetă**. Cele trei propoziții pozitive pe care le spun jucătorii lui Sapiens sunt satisfăcute toate de o lume plată de 268 km². Niciuna nu menționează sfericitatea.

### Constructie
**Grilă strictă de 1 m pentru LOGICĂ, organic doar la PREZENTARE.** Cercetarea a găsit că NU există joc livrat cu interioare simulate multi-etaj + plasare organică fără grilă; grila E topologia spațială gratuită (enclosure, suport, vecinătate, rezervare). Nu plătesc cele 3 sisteme incrementale grele (arrangement planar, navmesh incremental, graf de suport) ca să câștig un unghi.

**Verticalitate:** 64 de niveluri de 1 m per chunk promovat (−24/+40). UI-ul expune ~12 deasupra și ~12 dedesubt în slice view. Pereți/podele/acoperișuri/scări = celule stricte. Subteranul e prima clasă, nu un mod separat.

**Costul organicului măsurat, ca argument de tăiere:** Ostriv = o clădire înseamnă **556 piese modelate, ~26 KB cod, ~5 luni**; trecerea la forme concave (devlog 11.05.2026) a cerut triangulare + refactor complet de picking + detecție de suprapunere + micro-pathfinding NOU pentru constructori. Foundation, după 7 ani, ÎNCĂ n-a rezolvat alinierea pe înălțime a pieselor de monument pe teren înclinat (Devlog #20, feb. 2026). Un om singur fără artist nu are voie să intre acolo.

**Ce cumpăr în schimb, la preț de prezentare:**
1. **Pereți parametrici** — precedent direct Foundation `WALL_CONFIG` (Width, Height, CrenationDistance, UvTilingWall/Top, offseturi ⇒ mesh generat). Un material de perete = un generator, NU 556 piese.
2. **Variante de mesh din hash de coordonate** (x,y,z,seed ⇒ 1 din 4-6 variante) ca un zid de 20 de celule să nu citească 20 de cuburi identice.
3. **Piese de perete la 45°** ca excepție singulară de la grilă, tratate ca două celule cu un mesh comun.
4. **Props off-grid în interiorul celulei** (precedent Sims 4): poziție float + rotație liberă, dar celula rămâne unitatea de coliziune.
5. **Teren randat neted** — marching-squares pe suprafața superioară a coloanelor promovate, ca zona săpată să nu citească Minecraft; trepte de 1 m rămân în DATE, nu în pixeli.
6. **Poteci din contoare de trafic** (Ostriv: sistem procedural cu save/load făcut în CÂTEVA ZILE în mai 2017 — cel mai bun raport valoare/efort din tot research-ul). Uzură la trecere, jucătorul nu desenează drumuri.
7. **Zone pictate raster** pentru ferme/stocuri/pășuni (precedent Foundation: 9 tipuri de zonă, raster) — zero geometrie.
8. **Atelierul = ROL de cameră, nu clădire nouă.** O cameră închisă care conține un cuptor + o masă de lucru DEVINE brutărie. Precedent direct: Manor Lords, unde extensiile de nivel 2 ale burgage plot-ului sunt atelierele (fierar, croitor, brutar, cizmar, armurier) și lanțul de producție trece PRIN locuință. Asta cumpără lanțuri de producție de 3 niveluri fără niciun asset nou — exact ce-i trebuie unui om fără artist.

**Stabilitate structurală:** model de decrement pe grilă, calibrat cu cifrele lui Going Medieval ca punct de pornire — suport 4 la sol, −1 per bloc distanță, maxim 3 tile nesusținute, grinzi 10 tile, pivniță 7×7 se prăbușește (5×5 nu). `support:u8` per celulă solidă, recalcul prin BFS din celulele grounded DOAR în chunk-ul murdărit. Fallback dacă vreodată renunț la grilă: modelul de graf al lui Valheim (maxSupport/minSupport, vertical/horizontalLoss; lemn 16 m, core-wood 24 m, wood-iron 50 m) — singurul sistem care supraviețuiește fără grilă.

### Camere si temperatura
Graful de camere NU se construiește din celule brute — se construiește din REGIUNI, exact ca RimWorld (harta se împarte în chunkuri de 12×12, o regiune e o zonă contiguă în interiorul acelui pătrat, nicio regiune nu depășește grila inițială). Eu iau 16×16 per z-slice (256 de celule max/regiune), ca să se potrivească cu chunk-ul de 32 m împărțit în 4.

**Lanțul:** celule → regiuni (flood fill local, max 256 celule) → graf de regiuni → camere (componente conexe de regiuni legate prin muchii NE-etanșe). O ușă închisă = muchie etanșă. Un edit murdărește UN z-slice de 16×16 ⇒ reconstrucție prin flood fill pe 256 de celule (microsecunde) + re-derivarea camerei prin BFS pe **zeci de noduri de regiune**, nu pe mii de celule. Ăsta e singurul motiv pentru care camerele rămân ieftine într-o lume mutabilă.

**Pseudo-camera OUTDOOR:** orice cameră care atinge o celulă fără acoperiș în stiva promovată devine exterior — temperatură = curba de climă, fără acumulare. Ăsta e testul de „închis" și e gratuit din același flood fill.

**Temperatura:** un scalar per cameră, integrat Euler la **1 Hz**, nu 20 Hz. `dT = (Σ surse − Σ conducție_vecini) · dt / masăTermică`, cu `masăTermică ∝ numărul de celule`. Conducția pe fiecare frontieră comună = arie × valoare U a materialului, cu U DIFERIT pe perete / podea / acoperiș. Precedent verificat la Going Medieval: „temperature is calculated independently for each room", „rooms are only affected by heat sources inside that room", „walls, floors, and roofs now have different insulations, and the size of those rooms will also play a role", „heat gets trapped in smaller rooms". Sursele de căldură au trepte (brazierul lui GM: low/medium/high, cu consum de combustibil diferit) — copiez modelul, e testat pe jucători.

**Praguri (luate deja + furate de la GM, jucate):** conservarea hranei la **5 °C**; banda de confort **−8..34 °C** (GM: „settlers will not choose idle/eating/sleeping locations outside the comfortable temperature (-8 to 34C)"). Pivnița devine MECANICĂ, nu decor: sapi în deal, ai masă termică mare și U mic, ții sub 5 °C fără combustibil.

**Cost:** ~200 de camere × 4-6 vecini, la 1 Hz ⇒ sub 0,5 ms pe tickul în care rulează. Zero simulare de fluide, pânză freatică statică (decizii păstrate).

**Capcana pe care o închid explicit:** camera nu are voie să flood-fill-uiască în spațiu NE-promovat. De aia promovarea are apron de 1 chunk și construcția e interzisă la sub 1 m de un chunk ne-promovat. Fără regula asta, o cameră „scapă" în heightfield și temperatura devine nedeterministă.

### Coliziune intre agenti
Constrângerea 4 e o constrângere de GRILĂ și o accept ca atare — fără grilă ar deveni coliziune continuă (discuri + ORCA) și aș pierde primitivele discrete de swap/rotate care rezolvă deadlock-ul demonstrabil. Soluție în 8 straturi, toate cu sursă:

**1. PIBT ca executor de UN pas per tick.** NU WHCA* (Silver: W=16, 100 agenți, cost continuu până la ~50 ms = un tick întreg la 20 Hz), NU CBS (se măsoară cu timeout de 30 s). PIBT: 8000 de agenți în 0,021 s ≈ 2,6 µs/agent/pas în C++. Pentru 40 de agenți în TypeScript estimez ×5-10 ⇒ **0,5-1,0 ms/tick** din bugetul de 50 ms. *(Factorul de încetinire TS e ESTIMAREA MEA, confidence scăzut — de măsurat în săptămâna 12.)* PIBT rezolvă push-ul prin priority inheritance și rotațiile prin cicluri, fără tabel de rezervări persistent. Rezervările trăiesc exact un tick — gratuit.

**2. Punctele de articulație pe graful de REGIUNI, nu pe celule.** Garanția PIBT e verbatim: „all agents are guaranteed to reach their destination within a finite time when the environment is a graph such that all pairs of adjacent nodes belong to a simple cycle (e.g., biconnected)". Un colony sim e fundături peste tot ⇒ garanția CADE („if it contains dead-ends, such as tree-shaped paths, PIBT may cause deadlocks"). Fix: Tarjan O(V+E) pe ~2.400 de noduri de regiune (200 chunkuri × 4 z-slice-uri ocupate × ~3 regiuni) = zeci de µs, rerulat debounced o dată pe tick după orice edit topologic. Pe 1e6 de celule ar fi imposibil; pe 2.400 de regiuni e gratis.

**3. Token pe ramura înfundată** — precedent direct PIBT-TP / PIBT-TP-TA (Fujitani et al., KES 2022, arXiv 2205.12504): „allowing the agents to have temporary priorities and restricting agents' movements in the trees", cu rezultatul „agents can always reach their delivery without deadlock" pe zonă biconexă + arbori atașați. Implementare: semafor per muchie de articulație, capacitate = celule libere în ramură − 1, plus lock de direcție. Numărătoarea vine gratis din flood fill-ul care a construit regiunea.

**4. Ușa NU e o celulă normală:** capacitate 1 + token de direcție. Ușile de un tile sunt generatorul #1 de blocaj în DF („avoid single doors and single stairs"), AoE2 (blocaje cronice la porți) și Manor Lords (villagers blocați la uși, DEȘI ML permite suprapunerea).

**5. Scara = DOUĂ benzi unidirecționale** care ocupă același volum vizual (precedent ONI: scara bidirecțională rezolvată cu două transporturi unidirecționale). Fiecare bandă e un lanț de celule propriu. Ăsta e singurul loc unde relaxez „o celulă = un agent" și îl declar în sacrificii.

**6. Lățime minimă 2 ca UNEALTĂ DE UI, nu ca folclor.** Sfatul oficial DF („rute ≥2 tiles") devine un overlay live care colorează chokepoint-urile de lățime 1 și un warning la plasarea blueprintului. Plus validare de accesibilitate la plasare, furată de la Ostriv hotfix 11 (23.01.2025, 3 săptămâni de muncă, a amânat Alpha 6): drum de la nodul de spawn de pe marginea hărții la FIECARE intrare a FIECĂREI clădiri; clădirea care blochează intră în fail state și UI-ul arată CE intrare a blocat.

**7. Anti-auto-îngropare.** Bugul Going Medieval NU e coliziune — settlerul își demolează singur scara de la mijloc și se zidește. Regulă: o comandă de demolare/săpare nu poate viza celula-suport a propriului agent, nici un punct de articulație de pe drumul agentului spre casă dacă nu există alternativă. Și: ONI arată ce se întâmplă când path-ul precalculat e invalidat (dupe-ul oscilează pe scară până moare) ⇒ zero path-uri persistente, doar coridor de regiuni + un pas PIBT.

**8. Watchdog determinist.** Fără progres 60 de tickuri (3 s) cu goal activ ⇒ re-path; 120 ⇒ prioritate PIBT maximă (PIBT oricum crește prioritatea cu timpul de la ultimul progres); 200 ⇒ abandonează sarcina și scrie un rând de jurnal. Totul contorizat în ticks ⇒ determinismul se păstrează.

**Test de acceptanță (săptămâna 15):** 40 de agenți, 200 de goal-uri randomizate, 100.000 de ticks, seed fix — invariant hard `nicio pereche de agenți nu împarte o celulă, niciodată` + `zero blocaje permanente` + hash identic la reluare.

**Notă onestă:** exclusivitatea NU cumpără tactica de coridor. Valoarea chokepoint-ului în DF vine din poduri mobile, capcane, plăci de presiune și fortificații — nu din corpuri. Deci constrângerea 4 e plătită integral și beneficiul de gameplay trebuie construit separat.

### Realism
**Treapta b+ : low-poly stilizat cu iluminare și atmosferă bună. NU realist.** Și merg mai departe: paletă autorată manual + shading plat + lumină volumetrică/atmosferică puternică + cer pictat + un singur atlas 2048². Zero PBR scanat, zero megascans.

**Argumentul nu e estetic, e de constrângeri deja luate:**
1. Teren săpabil la runtime ⇒ fără lightmaps coapte, iar Nanite nu e făcut pentru geometrie generată la runtime. Realismul UE5 stă exact pe astea două.
2. Slice view + interioare ⇒ Lumen are integrare limitată cu transparența complexă, deci fade-ul de acoperiș se bate cu GI. Manor Lords, Foundation și Ostriv NU au interioare deloc — evită problema, n-o rezolvă. Chiar și în Going Medieval (stilizat) toggle-ul de acoperiș are buguri de hitbox rămas.
3. 60 FPS pe hardware modest: Lumen țintește 8 ms@30fps / 4 ms@60fps la 1080p, cu fiecare treaptă de calitate ≈ jumătate din costul celei de deasupra. Nu am bugetul ăsta lângă un tick de simulare.

**Agenții nu sunt constrângerea.** UE5 Animation Budget Allocator: 64 de personaje 14,2 ms → 4,0 ms; 128: 29,3 → 7,6 ms. VAT + instancing: 6.072 agenți, 21.369 → 276 draw calls, GPU 32 → 17,5 ms. 40 de pioni încap oriunde. Manor Lords chiar NU folosește skeletal animation — crowd simulation + Vertex Animation Textures pe instanced static meshes, de aia min-spec-ul e i5-4670 / GTX 1050 2GB. Costul real e AUTORAREA (30-60 de clipuri de muncă + variante de haine + LOD-uri), nu randarea. Spec concret: agent 600-1200 triunghiuri, **8 animații** autorate o dată și retargetate, haine prin vertex color + LUT de 8 culori.

**Vânzările nu cer realism, iar dovada s-a întărit în 2026:** RimWorld 1M+, Dwarf Fortress 1M pe Steam, Going Medieval a ieșit din EA pe 17.03.2026 cu **peste 1 milion de unități vândute înainte de 1.0** *(sursă secundară, confidence mediu)*, Timberborn 1.0 în martie 2026 cu **>25.000 CCU și 37.000 de recenzii în 4 zile** *(sursă secundară, confidence mediu)*. Toate stilizate. Echipe: Going Medieval 7-9 oameni, Timberborn 7→15, Against the Storm 5.

**Iar echipele „realiste" nu sunt solo.** Ostriv: solo din 2014, echipă din 2018, motor C++17/OpenGL propriu + editor propriu de modele, ÎNCĂ în Early Access, 3,5 ani fără versiune majoră. Foundation: 2 fondatori → ~18-20 de oameni, 6 ani de EA, 9 ani de la fondare. Manor Lords se autodescrie pe pagina Steam ca „grown through player support into a full team", cu departament de mocap și co-designer creditat, finanțat din Patreon + Epic MegaGrant; Arthur Bruno de la Farthest Frontier: „echipa lor e poate chiar mai mare decât a noastră". Ce cumperi cu realism e o echipă, nu un stil.

**Bani 2026, ca să nu existe iluzia „cumpăr assets":** Megascans nu mai e gratuit din finalul lui 2024 ($0,99/asset, $24,99/pack, Bridge deprecat mai 2026); KitBash3D $708/an dar doar ~2.000 din 20.000 de modele sunt game-ready; Synty $10-150/pack cu licență care INTERZICE AI generativ; env artist freelance $30-80/h. Un set PBR modular = $1.500-2.500 — adică bugetul de artă al unui slice, cheltuit pe un singur stil pe care nu-l poți extinde singur.

**Riscul reputațional AI e real:** Steam a rescris formularul pe 16.01.2026 (Pre-Generated vs Live-Generated); Party Animals a fost review-bombed în mai 2026 cu >800 de recenzii negative, Very Positive → Mostly Negative în sub 24h; Shrine's Legacy a fost lovit pe o acuzație FALSĂ. Un stil vădit manual, sistemic (pereți parametrici, variante din hash, paletă) e apărarea — și e exact ce poate produce un programator fără artist.

### De ce se simte ca Sapiens
Iau cele trei propoziții pe care le spun efectiv jucătorii și dev-ul lui Sapiens și le bifez una câte una, fără sferă:

1. **„Move as far away from your tribe as you like, exploring freely with limitless movement."** ⇒ Lume continuă de 16×16 km, streaming pe chunkuri de 32 m, **zero loading screens vreodată**. Camera zboară de la fortăreață până la orizont fără tranziție. 400 de chunkuri rezidente = 1,7 MB; streamingul e o problemă rezolvată, nu una de cercetare.
2. **„Send sapiens over long distances and establish camps to gather far away resources."** ⇒ Expediție de 4 pioni, rezolvată pe harta macro ca o călătorie cronometrată; la destinație PROMOVEZI chunkurile și campul e geometrie de voxeli reală, nu un marker. Te poți întoarce la el peste un an de joc și e acolo.
3. **„You can explore everything you can see."** ⇒ Heightfield continuu până la orizont, același sistem de teren la 3 km ca sub picioare; diferența e doar dacă stiva a fost promovată sau nu. Nu există „zonă jucabilă" desenată — contrastul e Ostriv, care are 7 hărți hardcodate, zonă jucabilă 512×512 px, nume de hărți în binar, pe care nici modderii nu le pot extinde, și a cărui plângere #1 e „nu pot construi pe teren nici măcar ușor denivelat".
4. **„A world you shape."** ⇒ Terraforming complet oriunde promovezi; Manor Lords, Ostriv și Foundation au ZERO terraforming (Foundation l-a respins explicit în 2019, Manor Lords refuză plasarea pe teren prea abrupt).

**Și adaug ceva ce Sapiens NU are, care servește exact teza owner-ului:** persistența așezărilor părăsite. Situl abandonat rămâne pe disc ca voxeli RLE (~3 MB) + un site record; întoarcerea aplică o funcție deterministă de decădere pe ticks-urile scurse. Dovada cererii: RimWorld permite max 5 colonii simultane cu degradare recunoscută, ruinele lăsate **nu pot fi recolonizate**, iar modul „Persistent RimWorlds" (explore fallen colonies where pirates may lurk) există tocmai ca să umple golul.

**Ce renunț conștient:** planeta. Wiki-ul de modding arată unde s-au dus anii — sferă de rază 1 cu `pointNormal`, subdiviziuni 13-21, altitudini în 0,00000023 unități/metru, distanțe măsurate în 7650 de hexagoane. Niciuna dintre cele patru propoziții de mai sus nu cere sfericitate. Sapiens = UN om, ~7-10 ani, 79% din 1.375 de recenzii. Cumpăr senzația, nu geometria.

### De ce pastreaza adancimea Going Medieval
Adâncimea lui GM stă în cinci sisteme, și toate cinci trăiesc ÎN chunkurile promovate, cu 1 m³ semantică completă:

1. **Multi-etaj real:** 64 de niveluri de 1 m per chunk (−24 sub bază, +40 deasupra). GM are 16 niveluri pe o hartă de 250×250 FIXĂ; eu am 64 pe o hartă care se extinde unde sapi. Slice view expune ~12 sus / ~12 jos.
2. **Săpat în teren și subteran ca cetățean de clasa I:** promovarea e declanșată de prima săpătură; pivnița, galeria, mina sunt același sistem ca etajul 3. Contrast: Ostriv are mina de fier ca *clădire de suprafață*, iar „rowhouse cu magazin la parter" e un MODEL, nu un nivel; Foundation și Manor Lords au zero subteran și zero etaje interioare.
3. **Camere închise + temperatură:** graf de camere derivat din regiuni, un scalar per cameră la 1 Hz, U-value distinct pe perete/podea/acoperiș, masă termică ∝ numărul de celule, surse de căldură cu trepte. Praguri jucate: conservare la **5 °C**, confort **−8..34 °C**. Pivnița săpată în deal devine o decizie de inginerie (masă termică mare + U mic ⇒ sub 5 °C fără combustibil), nu o cameră cu icon.
4. **Stabilitate structurală cu numerele lui GM ca prima calibrare:** suport 4 la sol, −1 per bloc distanță, maxim 3 tile nesusținute, grinzi de 10 tile. Test de acceptanță literal: **tavanul unei pivnițe 7×7 se prăbușește, 5×5 nu.** `support:u8` per celulă solidă, BFS doar în chunkul murdărit.
5. **Lanțuri de producție adânci fără cost de artă:** atelierul e un ROL de cameră (cameră închisă + stație ⇒ brutărie), model furat de la extensiile burgage plot din Manor Lords, unde lanțul trece prin locuință. Trei lanțuri de câte 3 trepte în slice (grâu→făină→pâine, minereu→lupă→unelte, piele→tăbăcit→haine), toate în JSON.

**Bonusul pe care GM nu-l are:** GM e mărginit la o hartă de 1e6 voxeli și atât. La mine, fortăreața de 3,2 MB stă într-o lume de 268 km², iar a doua fortăreață e la 3 km distanță și rămâne acolo când pleci.

**Pathfinding-ul rămâne la nivelul lui GM:** GM face A* pe regiuni de ~420 de noduri, cu penalizări bush 3000 / ground 1000 / floor 250. Eu fac regiuni de max 256 de celule (model RimWorld 12×12, eu 16×16), graf de regiuni + reachability prin union-find — ceea ce elimină patologia clasică RimWorld („încearcă să găsească drum, scanează pătrat după pătrat până acoperă toată harta" când nu există drum).

### Ordinea de implementare
1. S1-2 — HARNESS ÎNAINTE DE JOC. Buclă de tick determinist în TS pur (zero deps de motor), matematică pe întregi/fixed-point, PRNG cu seed (xoshiro128**), runner headless în Node, test de golden replay (același seed + același log de input ⇒ același hash al stării după 100k ticks), CI pe GitHub Actions, loader JSON cu validare de schemă. Dacă asta nu există în săptămâna 2, proiectul e deja pierdut.
2. S3-5 — TEREN. Harta macro 1024² @16 m din noise (8,4 MB); streamer de chunkuri 32 m cu 400 rezidente; heightfield 1 m per chunk (~4,3 KB); PROMOVAREA unui chunk la coloane RLE (2 B/run, 64 niveluri) cu apron de 1 chunk; operații dig/fill; save/load. Fuzz: 10k operații promovare→săpare→salvare→încărcare, hash stabil.
3. S6-8 — COLOANA VERTEBRALĂ DE RANDARE. three.js pe WebGPU în Electron; mesher în Worker cu binary greedy meshing pe măști Uint32 per coloană (de aia chunkul e lat de 32); suprafață superioară netezită cu marching-squares; un pass de InstancedMesh pentru props; slice view cu fade de acoperiș; cameră. Țintă măsurată: traversezi 16 km la 60 FPS cu 400 de chunkuri rezidente.
4. S9-11 — REGIUNI + REACHABILITY. Partiție 16×16 per z-slice, reconstrucție incrementală la edit, graf de regiuni, colorare de reachability prin union-find, puncte de articulație cu Tarjan pe ~2400 noduri, overlay de debug care desenează regiuni și cut vertices. Test: 10.000 de edituri aleatorii, invarianții rezistă.
5. S12-15 — AGENȚI ȘI COLIZIUNE. A* pe graful de regiuni + A* în interiorul regiunii; PIBT ca executor de un pas la 20 Hz; ocupare exclusivă; semafoare pe uși; token pe ramura înfundată (PIBT-TP); scări ca două benzi unidirecționale; watchdog de blocaj. Acceptanță: 40 de agenți, 200 de goal-uri, 100k ticks, ZERO celule împărțite, ZERO blocaje permanente. Aici se măsoară prima dată µs/agent/pas în TS — dacă depășește 25 µs, se mută PIBT în WASM.
6. S16-19 — JOBURI ȘI NEVOI. Tabel de priorități pe tipuri de muncă (model RimWorld), job giver cu buckets spațiale, hauling + stocuri ca zone pictate, foame/odihnă/dispoziție minimale. Prima dată când devine JOC — și prima dată când se joacă 30 de minute la rând.
7. S20-23 — CONSTRUCȚIE ȘI STABILITATE. Blueprints, joburi de construcție, materiale, multi-etaj, scări, acoperișuri; propagare de suport (4 / −1 / max 3 nesusținute / grinzi 10); prăbușire. Test literal: pivnița 7×7 se prăbușește, 5×5 nu.
8. S24-27 — CAMERE, TEMPERATURĂ, HRANĂ. Camere derivate din regiuni; uși etanșe; temperatură per cameră la 1 Hz cu U-value pe perete/podea/acoperiș; prag 5 °C pentru conservare; confort −8..34 °C; pivnița ca mecanică. Acum adâncimea Going Medieval e livrată.
9. S28-31 — LANȚURI DE PRODUCȚIE. Atelierul ca rol de cameră (cameră închisă + stație), trei lanțuri de câte 3 trepte, totul în JSON, zero assets noi. Balansarea se face prin fișiere, nu prin cod.
10. S32-35 — PASĂ DE ARTĂ ȘI UX. Pereți parametrici (model WALL_CONFIG), variante din hash de coordonate, piese la 45°, poteci din contoare de trafic, paletă + iluminare atmosferică; UI React complet (meniu de construcție, tabel de munci, inspector de cameră, alerte, tooltips). Prima dată când arată a joc — deliberat la luna 8, nu la luna 2.
11. S36-40 — STRATUL DE LUME. Expediții pe harta macro (călătorie cronometrată, model caravană); promovarea unui al doilea sit; abandonare + funcție deterministă de decădere pe ticks; întoarcerea la ruină; jefuitori cuibăriți într-un sit părăsit; combat DEFENSIV pe aceeași buclă de sarcini. Aici se livrează teza de produs.
12. S41-46 — ÎNTĂRIREA SLICE-ULUI. Bugete de performanță impuse în CI pe un save de benchmark fix (tick ≤ 8 ms, frame ≤ 16 ms), versionare de compatibilitate a save-urilor, 3 ore de conținut curat, 20 de testeri externi, pagină Steam + build de demo. Steam Direct $100, recuperabil la $1.000 AGR.

### Timp pana la vertical slice
**10-12 luni până la vertical slice, la 25 h/săptămână** (≈46 de săptămâni în planul de mai sus), cu risc asimetric spre dreapta: +3 luni dacă randarea trebuie mutată din Electron în Unity.

**Argumentul, cu cifrele din contra:** solo-iștii din genul ăsta NU livrează în 12 luni. Sapiens = un om, ~7-10 ani, motor propriu. Songs of Syx = un om, din 2015, motor Java propriu „Snake2d", ÎNCĂ în EA, 40.000 de unități simulate. Ostriv = solo din 2014, C++17 + OpenGL + editor propriu de modele, Alpha 5 în martie 2023 și **3,5 ani fără versiune majoră** după (61 de hotfixuri), motivul declarat de dev fiind „support both versions of the game in a single code base". Foundation = 6 ani de EA cu ~18-20 de oameni. Manor Lords = ~7 ani și o echipă cu departament de mocap.

**De ce eu cred totuși în 10-12 luni, și diferența e specifică, nu optimistă:**
- Toți cei de mai sus și-au scris MOTORUL. Eu cumpăr randarea (three.js), UI-ul (React — și owner-ul e expert React; UI-ul unui colony sim e 30-40% din muncă și aici are avantaj real, nu retoric), împachetarea (Electron + steamworks.js/greenworks — greenworks e în producție de la Game Dev Tycoon) și ALGORITMUL greu (PIBT e publicat, cu implementări de referință, inclusiv una minimală în Python).
- Livrez un SLICE, nu un joc. Ei livrau conținut de 200 de ore.
- Disciplina de teste headless + CI din săptămâna 1 e exact ce lipsește la solo-iștii din listă, și e motivul pentru care Ostriv a pierdut 3,5 ani pe compatibilitate între versiuni.
- Nu am pasă de artă până la luna 8, și artă sistemică (parametrică) când vine.

**Ce ar sparge estimarea, în ordinea probabilității:** (1) seam-ul heightfield↔voxel — vezi killerObjection, ±3 luni; (2) PIBT în TS peste 25 µs/agent/pas ⇒ rescriere în WASM, +3 săptămâni; (3) three.js/WebGPU în Electron nu ține 60 FPS cu 400 de chunkuri ⇒ decizie de motor la luna 3, +2-4 luni; (4) scope creep pe economie — se apără prin „tot conținutul în JSON".

**Gate-ul de decizie e la luna 3, nu la luna 12:** dacă la finalul S8 nu traversezi 16 km la 60 FPS cu terenul promovat randat, arhitectura de randare se schimbă atunci, când costă 2 luni, nu la luna 10 când costă tot.

### Obiectia proprie (killer objection)
**Granița de promovare heightfield↔voxel este un seam care trebuie să fie corect simultan în ȘASE subsisteme — randare, pathfinding, regiuni, camere, stabilitate, save/load — și fiecare dintre ele are o noțiune diferită despre ce e o celulă la graniță. Nimeni nu a livrat combinația asta.**

Cercetarea a găsit explicit că NU există joc livrat cu interioare simulate multi-etaj/subteran (camere + temperatură + stabilitate) ȘI lume deschisă continuă. Going Medieval evită problema făcând TOATĂ harta voxel, fixă și mărginită (250×250×16). Sapiens o evită neavând nici camere, nici temperatură, nici stabilitate. Foundation și Ostriv o evită neavând interioare deloc. Eu propun exact intersecția pe care toți au ocolit-o — și o propun cu o graniță mobilă, care se mută de fiecare dată când jucătorul sapă.

Clasa de bug pe care o creez e geometrică și emergentă, nu logică: un agent stând pe o celulă de heightfield ne-promovată lângă o coloană promovată la o înălțime derivată diferit; o cameră care flood-fill-uiește în spațiu ne-promovat și primește temperatură nedeterministă; un perete construit exact pe frontiera de chunk al cărui suport se calculează în două chunkuri cu reguli diferite; un mesh netezit cu marching-squares care nu coincide cu celula de coliziune, adică exact eroarea lui Ostriv (navmesh desincronizat de vizual, oamenii taie colțuri) dar la scară de teren. Astea sunt bugurile pe care un harness headless le prinde TÂRZIU, fiindcă sunt vizuale și de graniță, nu de invariant.

Mitigarea mea e reală dar SLABĂ: promovare chunk-granulară și **ireversibilă**, apron obligatoriu de 1 chunk în jurul oricărei atingeri, interdicție de construcție la sub 1 m de un chunk ne-promovat, plus un test de graniță care compară înălțimea derivată heightfield vs. top-ul coloanei promovate pe tot inelul. Asta transformă seam-ul dintr-o suprafață într-un inel testabil — dar nu-l elimină. Dacă arhitectura asta cade, aici cade, și costă 3 luni.

**Obiecția secundară, aproape la fel de tare:** stackul TypeScript/Electron/three.js nu are niciun precedent livrat în genul ăsta, iar singurul succes JS adiacent bine documentat — Vampire Survivors, lansat pe Phaser + Electron — a **migrat pe Unity la versiunea 1.6 pentru performanță**. Contra-argumentul meu (profilul nostru de încărcare e alt animal: 40 de agenți și mesh-uri chunky, nu mii de sprite-uri) e plauzibil, dar e un argument, nu o măsurătoare. De aia nucleul de simulare e TS pur cu typed arrays și zero dependențe de motor: e polița de asigurare, portabil în C# în săptămâni, nu în luni. Un arhitect care ar spune că riscul ăsta e zero ar minți.

### Ce sacrifica
- PLANETA SFERICĂ. Zero sfericitate, zero scară planetară, zero subdiviziune icosaedrică. Lumea e plată, 16×16 km. Ăsta e diferențiatorul tehnic al lui Sapiens și îl tai integral — păstrez doar continuitatea, persistența și libertatea de deplasare, care sunt singurele lucruri pe care le descriu jucătorii.
- PLASAREA ORGANICĂ REALĂ. Datele rămân pe grilă de 1 m. Organicul e strict prezentare: pereți parametrici, variante din hash de coordonate, piese la 45°, props off-grid în interiorul celulei, teren netezit peste trepte de 1 m. Nu vei putea roti o casă la 37°, cum poți în Ostriv sau Foundation. Preț plătit conștient: fără grilă aș întreține incremental arrangement planar pentru camere + navmesh incremental + graf de suport, iar Ostriv a plătit 556 de piese modelate și ~5 luni pentru O clădire.
- REALISMUL GRAFIC. Refuzat cu dovezi, nu din lene: teren săpabil la runtime interzice lightmaps coapte și e greșit pentru Nanite; slice view + interioare se bat cu Lumen pe transparență; bugetul Lumen (4 ms@60fps la 1080p) nu încape lângă tick.
- SIMULAREA SIMULTANĂ A MAI MULTOR SITURI. Un singur sit rulează la 20 Hz. Celelalte sunt date + o funcție de decădere aplicată la întoarcere. Nu vei putea comuta între două colonii vii, cum încearcă RimWorld (max 5, cu degradare recunoscută de performanță și balans).
- EXCLUSIVITATEA STRICTĂ A CELULEI, ÎNTR-UN SINGUR LOC: scările sunt modelate ca două benzi unidirecționale care împart același volum VIZUAL (precedent ONI). În date fiecare bandă are celulele ei și invariantul se ține; pe ecran doi agenți pot părea că se încrucișează pe scară. E singura excepție și o declar aici ca să nu fie descoperită ca bug.
- TERRAFORMING ÎN SĂLBĂTICIE. Nu poți remodela un deal la 3 km fără să promovezi chunkurile (cost de disc). Săpatul rămâne o decizie cu consecință de stocare, nu o gumă de șters infinită.
- FLUIDE, VREME DINAMICĂ, ECOLOGIE. Zero simulare de fluide, pânză freatică statică, clima e o curbă, animalele sunt un tabel de vânătoare. (Decizii deja luate, le confirm.)
- COMBAT OFENSIV. Doar defensiv, pe aceeași buclă de sarcini ca munca. Și, onest: exclusivitatea celulei NU cumpără tactica de coridor — în DF valoarea chokepoint-ului vine din poduri mobile, capcane, plăci de presiune și fortificații, nu din corpuri. Beneficiul trebuie construit separat, deci constrângerea 4 e cost pur în slice.
- MODDING, MULTIPLAYER, LOCALIZARE, CONSOLE. În afara slice-ului. Ostriv a pierdut 3,5 ani fix pe suportul a două versiuni în același cod base — nu deschid a doua axă de compatibilitate.
- ADÂNCIMEA ECONOMICĂ DE TIP OSTRIV. Fără 3 nutrienți per câmp, fără moștenire pe gospodărie, fără taxă pe suprafața grădinii. Economia slice-ului e pe PION, cu 3 lanțuri de câte 3 trepte. Ostriv a construit agricultura aia în ~9 ani; Foundation, după 6 ani de EA, tot are economie subțire recunoscută (fără readout producție/consum, lanțuri plate). Adâncimea economică e amânată explicit post-slice.
