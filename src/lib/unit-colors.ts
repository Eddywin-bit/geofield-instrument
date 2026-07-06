// Shared formation colour mapping. Consumed by the map legend, the Know
// unit detail view, and the field-notebook log cards so all three screens
// speak the same visual language.

export const UNIT_COLORS: Record<string, string> = {
  // Birimian palette preserved from the original 4-unit map.
  "Birimian Sediments": "#3FB37F",
  "Birimian Volcanics": "#2BA29A",
  // New units from the full Ghana geology dataset (17 formations).
  "Recent": "#F5D76E",
  "Tertiary": "#E8A15A",
  "Eocene & Cretaceous": "#C97B4A",
  "Sekondian": "#A65C3B",
  "Accraian": "#8B4A2E",
  "Upper Voltaian": "#8B5E3C",
  "Obosum & Oti Beds": "#B08968",
  "Basal Sandstone": "#D4B483",
  "Buem Volcanics": "#7A3E9D",
  "Buem": "#9B6BC4",
  "Togo Series": "#4A6FA5",
  "Tarkwaian": "#D4A017",
  "Dahomeyan Acidic Gneiss": "#C94F7C",
  "Dahomeyan Basic Gneiss": "#8B2E5A",
  "Granitoid Undifferentiated": "#E85D75",
};

// Legacy aliases: older log entries and older "also known as" strings map
// to their modern unit colours so nothing in the notebook loses its stripe.
export const BELT_COLORS: Record<string, string> = {
  "Kumasi Basin": UNIT_COLORS["Birimian Sediments"],
  "Ashanti Greenstone Belt": UNIT_COLORS["Birimian Volcanics"],
  "Banket Series": UNIT_COLORS["Tarkwaian"],
  "Obosum Beds": UNIT_COLORS["Obosum & Oti Beds"],
  // Legacy unit names kept as aliases so old LogEntry rows still colour-match.
  "Tarkwaian Group": UNIT_COLORS["Tarkwaian"],
  "Voltaian Sandstone": UNIT_COLORS["Upper Voltaian"],
};

const FALLBACK = "#6B7280"; // neutral slate for unmapped units

export function colorForUnit(unitName?: string | null, belt?: string | null): string {
  if (unitName && UNIT_COLORS[unitName]) return UNIT_COLORS[unitName];
  if (unitName && BELT_COLORS[unitName]) return BELT_COLORS[unitName];
  if (belt && BELT_COLORS[belt]) return BELT_COLORS[belt];
  if (belt && UNIT_COLORS[belt]) return UNIT_COLORS[belt];
  return FALLBACK;
}

export type LegendEntry = { unit: string; label: string; color: string };

export const LEGEND: LegendEntry[] = [
  { unit: "Recent", label: "Recent", color: UNIT_COLORS["Recent"] },
  { unit: "Tertiary", label: "Tertiary", color: UNIT_COLORS["Tertiary"] },
  { unit: "Eocene & Cretaceous", label: "Eocene/Cret.", color: UNIT_COLORS["Eocene & Cretaceous"] },
  { unit: "Sekondian", label: "Sekondian", color: UNIT_COLORS["Sekondian"] },
  { unit: "Accraian", label: "Accraian", color: UNIT_COLORS["Accraian"] },
  { unit: "Upper Voltaian", label: "Upper Voltaian", color: UNIT_COLORS["Upper Voltaian"] },
  { unit: "Obosum & Oti Beds", label: "Obosum/Oti", color: UNIT_COLORS["Obosum & Oti Beds"] },
  { unit: "Basal Sandstone", label: "Basal Sst.", color: UNIT_COLORS["Basal Sandstone"] },
  { unit: "Buem Volcanics", label: "Buem Volc.", color: UNIT_COLORS["Buem Volcanics"] },
  { unit: "Buem", label: "Buem", color: UNIT_COLORS["Buem"] },
  { unit: "Togo Series", label: "Togo", color: UNIT_COLORS["Togo Series"] },
  { unit: "Tarkwaian", label: "Tarkwaian", color: UNIT_COLORS["Tarkwaian"] },
  { unit: "Birimian Volcanics", label: "Birimian Volc.", color: UNIT_COLORS["Birimian Volcanics"] },
  { unit: "Birimian Sediments", label: "Birimian Sed.", color: UNIT_COLORS["Birimian Sediments"] },
  { unit: "Dahomeyan Acidic Gneiss", label: "Dahom. Acidic", color: UNIT_COLORS["Dahomeyan Acidic Gneiss"] },
  { unit: "Dahomeyan Basic Gneiss", label: "Dahom. Basic", color: UNIT_COLORS["Dahomeyan Basic Gneiss"] },
  { unit: "Granitoid Undifferentiated", label: "Granitoid", color: UNIT_COLORS["Granitoid Undifferentiated"] },
];
