# Auvõlg OÜ veebileht

Staatiline eestikeelne ühe lehe veebileht domeenile **auvolg.ee**. See eristab nõude müüki soovivaid ettevõtteid ja korteriühistuid eraisikutest, kes soovivad müüa vara, pärandiosa või kaasomandi osa. Auvõlg on sõnastatud nõuete ja varade ostjana, mitte tarbijalaenuandja ega tavapärase inkassoteenusena.

## Failid

- `index.html` — lehe sisu ja kontaktvorm
- `styles.css` — kujundus ja mobiilivaade
- `script.ts` — TypeScripti lähtekood
- `script.js` — brauseris käivitatav kompileeritud JavaScript
- `assets/auvolg-logo.png` — veebilehe päises ja jaluses kasutatav logo

Kujunduse põhivärv pärineb logofaili dokumendipaletist: **Pantone 2767 C**, RGB ligikaudu `#142142`. Selle kõrval kasutatakse logo valget ja neutraalseid halle toone. Logo algne CDR-fail on vektorfail; veebilehe PNG on sellest eraldatud eelvaate põhjal loodud rasterversioon. Terava trüki- ja suure eraldusvõimega kasutuse jaoks ekspordi algsest CDR-ist eraldi kvaliteetne SVG või suurem PNG.

Veebibrauser ei käivita TypeScripti otse. `script.js` on kaasas, nii et staatilist saiti saab avaldada ehitussammuta. TypeScripti muutmisel genereeri JavaScript uuesti, kasutades arvutisse paigaldatud `tsc` kompilaatorit:

```sh
tsc script.ts --target ES2020 --lib DOM,ES2020 --strict --outFile script.js
```

## Enne avaldamist

1. Muuda `CONTACT_EMAIL` väärtus failides `script.ts` ja `script.js` päris e-posti aadressiks. Lisa sama aadress `index.html` jalusesse ja `<noscript>` teatesse.
2. Asenda jaluses `[LISA REGISTRIKOOD]`, `[LISA AADRESS]` ja `[LISA E-POST]` tegelike andmetega. Neid pole välja mõeldud.
3. Vaata üle privaatsustekst ja täpsusta ettevõtte tegelik andmetöötleja, kontakt, andmete säilitamise tähtaeg ning andmesubjekti õiguste taotlemise kord. Lisa vajadusel eraldi privaatsusteatis.
4. Kinnita enne avaldamist, et teenuste kirjeldus ja ostutingimused vastavad ettevõtte tegelikule tegevusele.

## Vorm ja andmekaitse

Vorm ei saada andmeid serverisse ega salvesta neid veebilehel. Pärast nõutud väljade täitmist avab see kasutaja seadmes eeltäidetud `mailto:` kirja. Kasutaja peab kirja ise üle vaatama ja saatma. Kui kontakt-aadress on seadistamata, kuvatakse teade ning kirja ei avata. Automaatseks vormisaatmiseks on vaja eraldi serveripoolset vormiteenust või e-posti API-t; praegu seda ei väideta ega tehta.

Vorm küsib vastamiseks vajalikku kontaktinfot, teemat ja vabatahtlikku lühikirjeldust. Külastajal palutakse mitte lisada isikukoode, pangateavet ega dokumente. `mailto:` toimimine sõltub kasutaja e-posti rakenduse seadistusest.

## Avaldamine domeenile auvolg.ee

1. Vali staatilise veebimajutuse teenus, mis pakub HTTPS-i, ning laadi `index.html`, `styles.css`, `script.js` ja `assets/auvolg-logo.png` teenuse veebijuurkausta (sageli `public` või `www`). Säilita `assets` alamkausta asukoht. `script.ts` ja see juhend on lähtefailid; brauseris käivitamiseks neid üles laadima ei pea.
2. Lisa majutusteenuses domeen `auvolg.ee` (ja soovi korral `www.auvolg.ee`). Seadista domeeni DNS-kirjed majutusteenuse antud väärtustega. Väärtused sõltuvad valitud teenusepakkujast.
3. Lülita sisse TLS-sertifikaat ja HTTP ümbersuunamine HTTPS-ile. Soovi korral suuna `www.auvolg.ee` ühele põhiaadressile.
4. Ava avaldatud leht arvutis ja telefonis. Kontrolli navigeerimist, vormi valideerimist ning pärast päris e-posti aadressi lisamist e-kirja mustandi avanemist.

Leht on tavaline staatiline sait: serverirakendust, andmebaasi ega ehitussammu pole vaja.
