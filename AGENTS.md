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
- Testas i Expo Go (`npx expo start`), därför inga bibliotek med egna native-moduler utanför Expo SDK.
