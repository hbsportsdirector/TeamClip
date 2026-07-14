// Web-klient-id från Google Cloud Console (skapas i steg 3-setupen).
// OAuth-klient av typen "Webbapplikation" – används av Google Sign-In på
// Android för att få id-/accesstoken. Ersätt platshållaren när klienten
// är skapad; appen visar "inte konfigurerad" tills dess.
export const GOOGLE_WEB_CLIENT_ID =
  "908746566063-2g4ohvdtb4ed4flk0fnb1rvct9ag64st.apps.googleusercontent.com";

export const isGoogleConfigured = () => !GOOGLE_WEB_CLIENT_ID.startsWith("REPLACE");
