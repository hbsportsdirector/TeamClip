# TeamClip – Produktspecifikation

Mobilapp för idrottstränare (byggd av och för en handbollstränare) som filmar korta
teknikklipp på spelare under träning, klipper automatiskt, och laddar upp varje klipp
till spelarens egen delade Google Drive-mapp – med valfritt röstmemo som feedback.
Kärnvärdet: **noll efterarbete för tränaren.** Inget klippande efter passet.

Domän: teamclip.app (registrerad). Målplattform: iOS + Android.

## Teknikval

- React Native + Expo (en kodbas för båda plattformarna)
- Kamera: expo-camera. Ljud: expo-av / expo-audio. Lokal lagring + uppladdningskö.
- Google-inloggning: OAuth via expo-auth-session eller @react-native-google-signin
- Drive: Google Drive REST API med **enbart scope `drive.file`**
  (appen rör bara filer den själv skapat – enklare Google-verifiering)
- Ingen egen backend i MVP. Video går telefon → tränarens Drive direkt.
  Detta är ett medvetet integritetsval (ungdomar på film, GDPR-ytan minimal).

## Datamodell

- **Spelarregister (centralt):** en person = en post = en Drive-mapp.
  Fält: namn (använd efternamnsinitial vid dubbletter), e-post (spelare eller
  vårdnadshavare, används för Drive-delning).
- **Grupper:** t.ex. "Gymnasiet", "Dam", "Herr U". En grupp = lista av referenser
  till registret. Samma spelare kan tillhöra flera grupper (vanligt förekommande).
  Medlemskap kan redigeras från två håll: gruppens truppredigering (sök i registret
  med autocomplete; om namnet saknas: "Skapa ny spelare X") och spelarens rad i
  registret (toggla grupper som chips).
- **Pass (session):** grupp + närvarolista (bocka i vilka som är på golvet idag)
  + dagens moment (t.ex. Kantskott, Straffkast, Genombrott, Nio meter, Målvakt).
  Under passet visas ENDAST närvarande spelare – aldrig hela truppen.
- **Klipp:** video + metadata (spelare, grupp, moment, datum/tid, ev. gästflagga)
  + ev. röstmemo (separat ljudfil med samma basnamn).

## Flöden under passet

### Läge 1 – Spontant
1. Tränaren ser ett moment värt att filma → öppnar Filma-vyn
2. Trycker på spelarens namn (grid med endast närvarande) → kameran startar direkt
3. Trycker stopp → klippet sparas och köläggs för uppladdning
4. Direkt efteråt: valfri röstmemo-skärm ("Feedback till Olle?").
   Håll-inne-knapp: håll och prata, släpp för att spara. Eller "Ingen feedback →".
   Memot fästs vid klippet.

### Läge 2 – Kö (appens signaturfunktion)
1. Före start: sätt skjutordning (t.ex. Kalle, Olle, Peter, Samuel), flytta upp/ner
2. Tryck "Spela in kön" → kameran rullar KONTINUERLIGT
3. Ett tryck på den stora knappen = "skott klart": segmentet sedan förra trycket
   sparas som eget klipp på spelaren som just skjutit, och nästa i kön står på tur
4. Efter sista spelaren loopar kön automatiskt (varv 2, 3, …)
5. Ingen hindsight/pre-buffer behövs: kameran rullar ju redan, trycket är bara
   en klippmarkör. Lägg gärna 1–2 s överlapp runt klippgränsen så inget upphopp kapas.
6. Feedback ges EFTER kön: tränaren bläddrar igenom klippen i Granska-vyn medan
   spelarna fortsätter skjuta, spelar in memo per klipp, och ger sedan även
   muntlig feedback på plats. (Färsk feedback på passet + beständig i Drive.)

### Gäster
- I kön: "+ Lägg till gäst" → "Gäst 1" läggs var som helst i ordningen så att
  kön inte sabbas av utomstående. Gästklipp laddas upp till gruppens gästmapp
  (delas inte med någon).
- Gäst finns även som ruta i spontanläget.
- I Granska: gästklipp kan flyttas till en riktig spelare i efterhand
  ("Flytta till spelare…") – t.ex. provspelare som sedan börjar i klubben.

### Granska-vyn
- Filterchips per spelare + "Gäster". Klippkort med spelare, moment, tid, längd.
- Håll-inne-mikrofonknapp per klipp för röstmemo.
- Uppladdningsstatus per klipp ("Laddar upp…" → "✓ I Olles Drive-mapp").

## Drive-integration

- Mappstruktur skapas automatiskt: `TeamClip/Spelare/<Namn>/` + `TeamClip/<Grupp>/Gäster/`
- Delning: spelarens mapp delas EN gång med läsrättighet till e-posten i registret
  (Drive Permissions API). Spelaren behöver ingen app – bara Drive.
- Filnamn: `ÅÅÅÅ-MM-DD_<Grupp>_<Moment>_<Spelare>_<löpnr>.mp4`
  Röstmemo: samma basnamn `.m4a` bredvid (medvetet separat, inte inmixat).
- Uppladdning: resumable uploads + lokal kö. Hallar har dålig täckning –
  uppladdningen ska överleva avbrott och fortsätta i bakgrunden/efteråt.
- Lagring sker på tränarens konto. Korta klipp (3–5 s) ⇒ ~10–20 MB per pass.

## Design (från godkänd prototyp)

- Färger (Täby HBK, men gör temat utbytbart per klubb i settings):
  bg `#0B1233`, yta `#152052`, upphöjd yta `#1D2B66`, linjer `#EAF0FA`,
  accent klubbröd `#E0242B` (mörk `#A8121B`), REC-röd `#FF5A60`,
  grön `#3FC380`, dämpad text `#93A3CF`, dim `#5E6DA0`.
- Typografi: Barlow Condensed (rubriker/siffror, vikt 600–800) + Barlow (brödtext).
- Signaturelement: stor rund röd "hartsboll"-knapp i kö-läget ("Skott klart –
  klipp & nästa"). Bakgrundsmotiv: handbollsplan uppifrån (mållinje, målbur,
  heldragen 6 m, streckad 9 m, straffkastlinje) i låg opacitet.
- Navigering i grupp: tre flikar – Förbered / Filma / Granska. Hemvy: Grupper / Spelare.
- Prototypfil: `teamclip-prototyp.jsx` (React, all UI och interaktionslogik som referens).

## Byggordning

1. **Kärnan:** kameravy + kö-lägets kontinuerliga inspelning med klipp-vid-tryck.
   Tekniskt svåraste biten – bygg och halltesta först (svettiga fingrar, hallbelysning,
   batteri över ett helt pass).
2. **Struktur:** grupper, register, närvaro, moment. Klipp sparas lokalt med metadata.
3. **Drive:** OAuth, mappstruktur, delning, bakgrundsuppladdning med kö.
4. **Feedback:** röstmemon (efter spontanklipp + i Granska).
5. **TestFlight/intern testning:** en säsongsperiod med egna grupper, sedan 2–3 kollegor.

## App Store-noteringar

- Apple Developer 99 USD/år, Google Play 25 USD engångs. Integritetspolicy krävs
  (läggs på teamclip.app).
- Onboarding ska påminna om vårdnadshavarsamtycke (minderåriga filmas).
- Arkitekturargument vid granskning: ingen egen server, ingen central databas med
  barn på film – allt ligger i tränarens/klubbens egen Drive, delat person för person.
