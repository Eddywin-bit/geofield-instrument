// Shared formation colour mapping. Consumed by the map legend, the Know
// unit detail view, and the field-notebook log cards so all three screens
// speak the same visual language.

export const UNIT_COLORS: Record<string, string> = {
  "Birimian Sediments": "#3FB37F",
  "Birimian Volcanics": "#2BA29A",
  "Tarkwaian Group": "#D4A017",
  "Voltaian Sandstone": "#8B5E3C",
};

// Belt / "also known as" aliases → same colour, so cards keyed on belt
// stay in sync with the unit palette.
export const BELT_COLORS: Record<string, string> = {
  "Kumasi Basin": "#3FB37F",
  "Ashanti Greenstone Belt": "#2BA29A",
  "Banket Series": "#D4A017",
  "Obosum Beds": "#8B5E3C",
};

const FALLBACK = "#6B7280"; // neutral slate for unmapped units

export function colorForUnit(unitName?: string | null, belt?: string | null): string {
  if (unitName && UNIT_COLORS[unitName]) return UNIT_COLORS[unitName];
  if (belt && BELT_COLORS[belt]) return BELT_COLORS[belt];
  return FALLBACK;
}

export type LegendEntry = { unit: string; label: string; color: string };

export const LEGEND: LegendEntry[] = [
  { unit: "Birimian Sediments", label: "Birimian Sed.", color: UNIT_COLORS["Birimian Sediments"] },
  { unit: "Birimian Volcanics", label: "Birimian Volc.", color: UNIT_COLORS["Birimian Volcanics"] },
  { unit: "Tarkwaian Group", label: "Tarkwaian", color: UNIT_COLORS["Tarkwaian Group"] },
  { unit: "Voltaian Sandstone", label: "Voltaian", color: UNIT_COLORS["Voltaian Sandstone"] },
];
