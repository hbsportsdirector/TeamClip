# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.
(Nedgraderat från SDK 57 2026-07-14: användarens telefon kör Expo Go 54.0.8 som bara stödjer SDK 54.
Uppgradera med `npm install expo@^57 && npx expo install --fix` när telefonens Expo Go stödjer nyare SDK.
Obs: expo-status-bar får INTE stå i plugins-listan i app.json på SDK 54.)

# TeamClip

- Produktspec och byggordning: `TEAMCLIP-SPEC.md`. UI-referens (godkänd prototyp): `teamclip-prototyp.jsx`.
- Steg 1 (kameravy + kö-lägets kontinuerliga inspelning) är byggt: `src/screens/QueueRecordScreen.js`
  innehåller klipploopen (recordAsync → stopRecording vid "Skott klart" → nytt segment direkt).
  Klipp sparas till dokumentkatalogen `clips/` via `src/lib/clips.js` med spec:ens filnamnsformat.
- Steg 2 (struktur) är byggt: spelarregister + grupper i `src/state/AppContext.js` (persisteras till
  `appstate.json` via `src/lib/persist.js`), gruppvy med flikarna Förbered/Filma/Granska
  (`src/screens/GroupScreen.js` + `src/tabs/`), spontant läge (`src/screens/SpontRecordScreen.js`)
  och klippmetadata (spelar-id, grupp, moment, gästflagga, längd) i `clips-index.json`.
  Gästklipp kan flyttas till riktig spelare i Granska (filen döps om). Nästa: steg 3 (Drive).
- Moment är redigerbara per grupp med idrottsförslag (`src/data/sports.js`, editor i Förbered).
- Genomgångar (steg 4, utökad version): tränaren pratar över klippet, pausar och ritar
  (`src/screens/ReviewSessionScreen.js` + `src/lib/review.js`). Ljudet sparas som `<klippbas>.m4a`
  (spec:ens basnamnskonvention, laddas upp bredvid klippet i steg 3), händelser/ritning i
  `<klippbas>.review.json`. Synkad uppspelning sker i appen; inbränd exportvideo kräver ffmpeg
  och development build – medvetet framskjutet tills appen lämnar Expo Go.
- Fleklippsgenomgångar: en genomgång över alla en spelares klipp i följd (auto-hopp vid klippslut,
  "»"-knapp för manuellt byte). Sparas som `<bas>.m4a` + `<bas>.multireview.json` med egen
  klippinfo; 'clip'-händelser i loggen byter videokälla. Startas från spelarfiltret i Granska.
  OBS: 'clip'-index pekar på positioner i ursprungslistan – borttagna klipp blir null-platser.
- Steg 3 (Drive) är byggt och verifierat på telefon 2026-07-14: Google Sign-In
  (`@react-native-google-signin`, web-klient-id i `src/config.js`, scope drive.file),
  mappstruktur/delning/resumable uploads i `src/lib/drive.js`, lokal kö i
  `src/lib/uploadQueue.js` (status i uploads.json, mapp-cache i drive-state.json),
  kopplingsvy i `src/screens/DriveScreen.js`. OAuth-klienter ligger i användarens
  Google Cloud-projekt "TeamClip" (samtyckesskärm i Testing-läge – testanvändare krävs;
  publiceras inför steg 5, drive.file kräver ingen Google-granskning).
- Videoexport av genomgångar är byggd och verifierad 2026-07-14 (`src/lib/exportReview.js`):
  ffmpeg bygger `<klippbas>_genomgang.mp4` med pauser som frysta bilder och ljudmix
  (röst loudnorm I=-15 över originalljud på volume=0.3), laddas upp till spelarens mapp.
  ffmpeg-kit är pensionerat – binären ligger VENDRAD i `vendor/` (SHA-256 i CHECKSUMS.md),
  inlänkad via patches/ffmpeg-kit-react-native+*.patch (compileOnly) + plugins/withFfmpegAar.js
  (flatDir i appmodulen). full-gpl = GPL-kod i bygget; måste ses över före App Store.
  KVAR: ritning inbränd i exporten (kräver rastrering av strecken) och export av
  fleklippsgenomgångar ('clip'-händelser → flera inputs i filtergrafen).
- EAS UPDATE aktivt sedan 2026-07-15: JS-ändringar skickas OTA till testarna med
  `eas update --channel preview --message "..."` – ingen ny APK behövs utom vid
  native-ändringar (nya moduler/plugins → bygg om BÅDA profilerna och skicka ny länk).
  runtimeVersion-policy: appVersion (bumpa "version" i app.json vid native-ändringar).
- Testas numera i DEVELOPMENT BUILD via EAS (`eas build -p android --profile development`),
  inte Expo Go. Dev-flödet är detsamma: `npx expo start` + skanna QR (appen TeamClip).
  Detta låser upp ffmpeg-kit (inbrända exportgenomgångar) och react-native-vision-camera
  (äkta klippöverlapp) som framtida steg. iOS-klient + Apple Developer-konto väntar till
  TestFlight-fasen. OBS: `npx expo-doctor` efter paketändringar – SDK-dubbletter av
  native-moduler (t.ex. expo-asset) kraschar APK:n vid start.
