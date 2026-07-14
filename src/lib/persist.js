import { File, Paths } from "expo-file-system";

export function loadJSON(name, fallback) {
  try {
    const f = new File(Paths.document, name);
    if (!f.exists) return fallback;
    return JSON.parse(f.textSync());
  } catch (e) {
    console.warn(`Kunde inte läsa ${name}:`, e);
    return fallback;
  }
}

export function saveJSON(name, value) {
  try {
    new File(Paths.document, name).write(JSON.stringify(value));
  } catch (e) {
    console.warn(`Kunde inte spara ${name}:`, e);
  }
}
