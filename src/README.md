# Auvõlg OÜ veebilehe lähtefailid

Leht on eestikeelne staatiline veebisait, mida serveerib selle repositooriumi HAProxy seadistus.

## Veebilehe failid

- `src/index.html` — lehe sisu, navigeerimine ja kontaktvorm
- `src/styles.css` — kujundus ja mobiilivaade
- `js/src/script.ts` — menüü, vormi valideerimise ja e-posti mustandi TypeScript
- `assets/auvolg-logo.png` — veebilehe päise ja jaluse logo

Lehe põhivärv on logoga ühtlustatud `#00356d` (RGB 0, 53, 109); taustades on sobitatud helesiniseid halle ja valget. „Meist“ jaotis on menüüst leitav.

TypeScripti töötleb juurkausta `compose.yml`-i Bun ehitusteenus. Ehitatud `script.js` serveeritakse staatilise failina; seda ei hallata käsitsi `src`-kaustas.

## Enne avaldamist

- Muuda `CONTACT_EMAIL` väärtus failis `js/src/script.ts` päris e-posti aadressiks.
- Lisa tegelik e-post, registrikood ja aadress `src/index.html` jalusesse.
- Vaata üle privaatsustekst ja täpsusta andmetöötleja, säilitustähtaeg ning andmesubjekti õiguste taotlemise kord.
- Kontrolli, et ettevõtte teenuste kirjeldus ja ostutingimused vastaksid tegelikule tegevusele.

Vorm ei saada päringut automaatselt serverisse. See avab kasutaja e-posti rakenduses eeltäidetud `mailto:` kirja; saatmiseks peab kasutaja ise vajutama „Saada“. Kui soovid automaatset vormisaatmist, lisa hiljem serveripoolne vormiteenus või e-posti API.

## Käivitamine ja avaldamine

Kasuta repositooriumi juurkausta `README.md` juhiseid. Need kirjeldavad `.env` seadistamist, HAProxy sertifikaati ja teenuste käivitamist käsuga `docker compose up -d --build`.
