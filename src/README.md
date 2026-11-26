# Auvõlg OÜ veebilehe lähtefailid

Leht on eestikeelne staatiline veebisait, mida serveerib selle repositooriumi HAProxy seadistus.

## Veebilehe failid

- `src/index.html` — lehe sisu, navigeerimine ja kontaktvorm
- `src/privacy-policy.html` — täielikud privaatsustingimused (saadaval aadressil `/privacy-policy.html`)
- `js/src/script.ts` — menüü, vormi valideerimise ja e-posti mustandi TypeScript
- `js/src/styles.css` — kujunduse ja mobiilivaate lähtefail
- `src/script.js` ja `src/styles.css` — ehitatud failid HTML-failide kõrval (Gitis ignoreeritud)
- `assets/auvolg-logo.png` — veebilehe päise ja jaluse logo

Lehe põhivärv on logoga ühtlustatud `#00356d` (RGB 0, 53, 109); taustades on sobitatud helesiniseid halle ja valget. „Meist“ jaotis on menüüst leitav.

TypeScripti ja CSS-i töötleb juurkausta `compose.yml`-i Bun ehitusteenus. Ehitatud `script.js` ja `styles.css` serveeritakse staatiliste failidena.

Lehe otse failina avamiseks ehita failid enne juurkaustas käsuga `build.bat` (Windows) või `./build.sh` (macOS/Linux). `script.js` jääb loetavaks, `styles.css` minifitseeritakse. Mõlemad tekivad HTML-failide kõrval ja on Gitis ignoreeritud.

## Enne avaldamist

- Muuda `CONTACT_EMAIL` väärtus failis `js/src/script.ts` päris e-posti aadressiks.
- Kontrolli e-post, registrikood ja aadress `src/index.html` jaluses.
- Vaata üle privaatsustekst ja täpsusta andmetöötleja, säilitustähtaeg ning andmesubjekti õiguste taotlemise kord.
- Kontrolli, et ettevõtte teenuste kirjeldus ja ostutingimused vastaksid tegelikule tegevusele.

Vorm ei saada päringut automaatselt serverisse. See avab kasutaja e-posti rakenduses eeltäidetud `mailto:` kirja; saatmiseks peab kasutaja ise vajutama „Saada“. Kui soovid automaatset vormisaatmist, lisa hiljem serveripoolne vormiteenus või e-posti API.

## Käivitamine ja avaldamine

Kasuta repositooriumi juurkausta `README.md` juhiseid. Need kirjeldavad `.env` seadistamist, HAProxy sertifikaati ja teenuste käivitamist käsuga `docker compose up -d --build`.
