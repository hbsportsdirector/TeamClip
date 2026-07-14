import { GOOGLE_WEB_CLIENT_ID, isGoogleConfigured } from "../config";

// Google Sign-In är en native-modul som inte finns i Expo Go – därför
// laddas den lazy och alla anrop är no-ops tills modulen finns.
// Scope drive.file: appen ser bara filer den själv skapat (medvetet
// minimalt för Googles verifiering och GDPR-ytan).
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let GoogleSignin = null;
let configured = false;

function getModule() {
  if (GoogleSignin) return GoogleSignin;
  try {
    GoogleSignin = require("@react-native-google-signin/google-signin").GoogleSignin;
    return GoogleSignin;
  } catch {
    return null;
  }
}

export function isAvailable() {
  return getModule() !== null && isGoogleConfigured();
}

export function isModuleMissing() {
  return getModule() === null;
}

function ensureConfigured() {
  const gs = getModule();
  if (!gs || !isGoogleConfigured()) return null;
  if (!configured) {
    gs.configure({
      scopes: [DRIVE_SCOPE],
      webClientId: GOOGLE_WEB_CLIENT_ID,
    });
    configured = true;
  }
  return gs;
}

export async function signIn() {
  const gs = ensureConfigured();
  if (!gs) throw new Error("Google Sign-In är inte tillgängligt i den här appversionen.");
  await gs.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await gs.signIn();
  return res?.data?.user ?? res?.user ?? null;
}

export async function getCurrentUser() {
  const gs = ensureConfigured();
  if (!gs) return null;
  try {
    const res = await gs.signInSilently();
    return res?.data?.user ?? res?.user ?? null;
  } catch {
    return null;
  }
}

export async function getAccessToken() {
  const gs = ensureConfigured();
  if (!gs) return null;
  try {
    const { accessToken } = await gs.getTokens();
    return accessToken ?? null;
  } catch {
    return null;
  }
}

export async function signOut() {
  const gs = ensureConfigured();
  if (!gs) return;
  try {
    await gs.signOut();
  } catch {}
}
