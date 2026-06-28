import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";

export type GeoUnit = {
  unit_name: string;
  also_known_as: string;
  expected_rocks: string[];
  expected_features: string[];
  engineering_note: string;
  mineral_note: string;
};

export type GeoData = {
  units: GeoUnit[];
  geo: GeoJSON.FeatureCollection;
};

let cache: GeoData | null = null;

export async function loadGeology(): Promise<GeoData> {
  if (cache) return cache;
  const [unitsRes, geoRes] = await Promise.all([
    fetch("/data/units.json"),
    fetch("/data/geology.geojson"),
  ]);
  const units = (await unitsRes.json()) as GeoUnit[];
  const geo = (await geoRes.json()) as GeoJSON.FeatureCollection;
  cache = { units, geo };
  return cache;
}

export function findUnitAt(lng: number, lat: number, geo: GeoJSON.FeatureCollection): string | null {
  const pt = point([lng, lat]);
  for (const f of geo.features) {
    const g = f.geometry;
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;
    try {
      if (booleanPointInPolygon(pt, f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>)) {
        return (f.properties?.unit_name as string) ?? null;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

export function unitByName(units: GeoUnit[], name: string | null): GeoUnit | null {
  if (!name) return null;
  return units.find((u) => u.unit_name === name) ?? null;
}
