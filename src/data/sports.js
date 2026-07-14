// Förslagsuppsättningar per idrott. Tränaren kan alltid lägga till och ta
// bort egna moment per grupp – det här är bara startpunkter.
export const SPORTS = [
  {
    name: "Handboll",
    moments: ["Kantskott", "Straffkast", "Genombrott", "Nio meter", "Målvakt"],
  },
  {
    name: "Fotboll",
    moments: ["Avslut", "Frispark", "Straff", "Nick", "Passningsspel", "Målvakt"],
  },
  {
    name: "Innebandy",
    moments: ["Skott", "Frislag", "Straff", "Passningsspel", "Målvakt"],
  },
  {
    name: "Ishockey",
    moments: ["Skott", "Friläge", "Straff", "Passningsspel", "Målvakt"],
  },
  {
    name: "Basket",
    moments: ["Straffkast", "Trepoängare", "Layup", "Genombrott", "Passningsspel"],
  },
  {
    name: "Allmänt",
    moments: ["Teknik", "Skott", "Passning", "Fys", "Övrigt"],
  },
];

export const DEFAULT_MOMENTS = SPORTS[0].moments;

// Grupper skapade före momentfunktionen saknar moments-fältet
export const momentsOf = (group) =>
  group?.moments?.length ? group.moments : DEFAULT_MOMENTS;
