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
- Testas i Expo Go (`npx expo start`), därför inga bibliotek med egna native-moduler utanför Expo SDK.
