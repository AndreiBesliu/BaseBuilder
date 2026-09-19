/**
 * Pozitiile scenariului de gate S-DIG.
 *
 * Sta aici, si nu in `viewer/main.ts`, fiindca e aritmetica pura si fiindca exact
 * asta a fost greseala: o functie de doua linii ingropata intr-un modul de browser
 * n-are cum sa aiba test, iar fara test a mintit doua lucruri deodata.
 *
 * ## Ce mintea
 *
 * Varianta veche scria `wx` si `wy` amandoua din ACELASI contor, reduse modulo
 * ACELASI span:
 *
 *     wx = base + (c * 1237) % span
 *     wy = base + (c * 7919) % span
 *
 * Comentariul de langa ea spunea „pozitii deterministe, imprastiate peste asezare
 * cu doua numere prime". Nu erau imprastiate: perechea `(wx, wy)` e o functie de
 * `c mod span`, deci are cel mult `span` valori — nu `span²`. Masurat pe scenariul
 * de 60 s: **416 coloane distincte dintr-o asezare de 416x416**, adica 0,24% din
 * ea, re-sapate de aproape trei ori. De acolo veneau si **415 refuzuri din 1200**:
 * a doua oara pe aceeasi coloana, la aceeasi adancime, nu mai e ce sapa. Gate-ul
 * declara 20 de sapaturi/s si facea 13,1.
 *
 * Acum indexul intra intr-un patrat de `span²` si se sparge in x si y de acolo,
 * deci e o permutare adevarata a planului. `PAS` e prim si nu divide `span²`
 * (544² = 2¹⁰ × 17²), deci perioada e intreaga: fiecare celula o data, si abia apoi
 * se reia. Proba e in `tests/sdig.test.ts` si merge pe perioada COMPLETA, nu pe un
 * esantion.
 *
 * ## De ce patratul nu mai e cel al asezarii
 *
 * `SPAN_CHUNKS` era 13, adica exact `SETTLEMENT_CHUNKS` — acelasi numar, acelasi
 * colt. Pentru ca promovarea vine cu apron de 1 chunk, dreptunghiul promovat de
 * fixtura e `-1..13` fata de focus, deci patratul sapat statea STRICT inauntru, cu
 * marginea de apron intreaga. Nicio sapatura nu promova un chunk nou, deci ramura
 * scumpa din `remeshAfterEdit` — promovare + apron = 9 chunk-uri remeshate — nu se
 * executa NICIODATA intr-o rulare de gate. Masurat: 0 promovari din 1200.
 *
 * Patratul incepe acum cu 3 chunk-uri inainte de focus, deci exista o banda de
 * frontiera. Masurat pe configuratia LIVRATA (cu reincercare): **52 de promovari
 * din 1200 de sapaturi, 4,3%**, iar ramura de 9 apare de 4 ori — era invizibila.
 *
 * (Cifra de aici a fost o vreme „52 din 897, 5,8%": aia era masuratoarea de
 * DINAINTE de bucla de reincercare, cand 303 din 1200 de pozitii se pierdeau.
 * Numaratorul a ramas acelasi, numitorul nu — si fisierul asta e facut anume ca sa
 * fie sursa de adevar pentru scenariu, deci o cifra invechita aici e mai scumpa
 * decat una intr-un comentariu oarecare.)
 *
 * ## De ce banda e doar pe latura negativa
 *
 * Motivul scris aici prima oara era FALS, si o recenzie adversariala l-a masurat:
 * spunea ca „pe latura pozitiva nu e teren streamuit in care sa se poata sapa".
 * Se poate: chunk-urile se creeaza la CERERE, deci o sapatura la +14 sau +20 de
 * chunk-uri fata de focus e acceptata si chiar promoveaza.
 *
 * Latura negativa ramane, dar ca ALEGERE, nu ca limita. Acolo chunk-urile sunt deja
 * rezidente si doar nepromovate, deci o sapatura masoara promovare + apron + remesh.
 * Pe latura pozitiva ar masura si generarea chunk-ului, care e alt cost si tine de
 * streaming, nu de bucla de constructie — adica exact ce masoara S-TRAVERSE.
 * Scenariile n-au voie sa se suprapuna pe acelasi cost: daca ar face-o, un verdict
 * n-ar mai spune care dintre ele l-a produs.
 */

import { CHUNK_CELLS } from '../sim/terrain/chunk.ts'

/** Coltul patratului, in chunk-uri fata de focus. Negativ = banda de frontiera. */
export const SDIG_OFFSET_CHUNKS = -3
/** Latura patratului, in chunk-uri. */
export const SDIG_SPAN_CHUNKS = 17
/**
 * Patratul folosit in INCALZIREA gate-ului: exact asezarea, fara banda de frontiera.
 *
 * Masurat dupa ce banda a fost adaugata: toate cele 4 valuri de 9 remesh-uri cad la
 * sapaturile 0, 1, 2 si 3, iar incalzirea (300 de cadre / 3 = 100 de sapaturi) le
 * inghitea pe toate. In fereastra MASURATA maximul ramanea 6, o singura data —
 * adica ramura scumpa continua sa nu fie masurata, doar din alt motiv decat inainte.
 *
 * Cauza nu e fereastra, e fizica scenariului: un val de 9 cere un chunk cu toti cei
 * 8 vecini nepromovati, si asa ceva exista doar cat timp banda e neatinsa. Dupa
 * cateva zeci de sapaturi ea e presarata cu chunk-uri promovate si apronul le
 * acopera vecinii. Deci banda trebuie sa ramana INTACTA pana incepe masuratoarea.
 *
 * Incalzirea sapa in patratul de dinainte de reparatie — cel despre care s-a probat
 * ca nu promoveaza niciodata nimic. Isi face treaba (incalzeste `dig`, `meshChunk`
 * si drumul de upload) fara sa cheltuie evenimentul pe care il masuram.
 */
export const SDIG_SPAN_INCALZIRE = 13
/** Coltul patratului de incalzire: chiar coltul asezarii. */
export const SDIG_OFFSET_INCALZIRE = 0
/** Pasul permutarii. Prim, si nu divide `(SPAN_CHUNKS * CHUNK_CELLS)²`. */
export const SDIG_PAS = 1237
/**
 * Cate pozitii se incearca pentru O sapatura.
 *
 * „20 de sapaturi/s" e un parametru al scenariului, deci trebuie sa fie 20
 * EFECTUATE. Fixtura si-a sapat deja camerele, deci o pozitie din patru cade pe
 * aer si comanda se refuza: masurat, 303 refuzuri din 1200. Numarate ca sapaturi,
 * gate-ul facea 13,1/s si scria 20 in propriul tabel.
 *
 * O pozitie refuzata costa o citire de cota si o comanda respinsa, nu un remesh.
 */
export const SDIG_MAX_INCERCARI = 16

/** Latura patratului in celule. */
export const sdigSpanCelule = (): number => SDIG_SPAN_CHUNKS * CHUNK_CELLS

/**
 * A `i`-a pozitie a scenariului. Deterministă, si bijectiva pe patrat pe toata
 * perioada `span²`.
 */
export function pozitiaSapaturii(
  i: number,
  focusCx: number,
  focusCy: number,
  spanChunks = SDIG_SPAN_CHUNKS,
  offsetChunks = SDIG_OFFSET_CHUNKS,
): { wx: number; wy: number } {
  const span = spanChunks * CHUNK_CELLS
  const baza = offsetChunks * CHUNK_CELLS
  const idx = (i * SDIG_PAS) % (span * span)
  return {
    wx: focusCx * CHUNK_CELLS + baza + (idx % span),
    wy: focusCy * CHUNK_CELLS + baza + Math.floor(idx / span),
  }
}

/**
 * Urmatoarea sapatura care CHIAR se face, sau `null` daca nu s-a gasit niciuna in
 * `SDIG_MAX_INCERCARI` pozitii.
 *
 * Terenul si comanda intra prin doua functii, nu prin `World`: aici e cod de banc,
 * si asa proba din `tests/sdig.test.ts` foloseste ACEASTA cautare, nu o copie a ei.
 * Bucla de reincercare e singurul loc in care „20 de sapaturi/s" devine adevarat,
 * deci ea e ce trebuie probat — nu o rescriere a ei in test.
 */
export function sapaturaUrmatoare(
  cursor: number,
  focusCx: number,
  focusCy: number,
  cotaSolului: (wx: number, wy: number) => number | null,
  incearca: (wx: number, wy: number, z: number) => boolean,
  spanChunks = SDIG_SPAN_CHUNKS,
  offsetChunks = SDIG_OFFSET_CHUNKS,
): { wx: number; wy: number; cursor: number } | null {
  for (let k = 0; k < SDIG_MAX_INCERCARI; k++) {
    const c = cursor + k
    const { wx, wy } = pozitiaSapaturii(c, focusCx, focusCy, spanChunks, offsetChunks)
    const cota = cotaSolului(wx, wy)
    if (cota === null) continue
    if (incearca(wx, wy, cota - (c % 5))) return { wx, wy, cursor: c + 1 }
  }
  return null
}
