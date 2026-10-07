import { expect, test } from "bun:test";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { StyleSpecification } from "maplibre-gl";
import { locationZoom, withOnlineLandmarks } from "../src/lib/online-map-style";

test("online POI names survive optional icons and keep collision avoidance", () => {
  const style: StyleSpecification = {
    version: 8,
    glyphs: "https://example.com/fonts/{fontstack}/{range}.pbf",
    sources: { openmaptiles: { type: "vector", tiles: ["https://example.com/{z}/{x}/{y}.pbf"] } },
    layers: [
      { id: "background", type: "background" },
      {
        id: "poi_r20",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "poi",
        minzoom: 17,
        filter: ["has", "name"],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Italic"] },
      },
    ],
  };
  const updated = withOnlineLandmarks(style);
  expect(validateStyleMin(updated)).toEqual([]);
  expect(updated.layers[0]).toBe(style.layers[0]);
  expect(updated.layers[1]).toMatchObject({
    minzoom: 17,
    filter: ["has", "name"],
    layout: { "icon-optional": true, "text-variable-anchor": ["top", "bottom", "left", "right"] },
  });
  expect(style.layers[1]).not.toHaveProperty("layout.icon-optional");
});

test("centre on location uses shop-level zoom online and retains wider offline view", () => {
  expect(locationZoom(12, true)).toBe(17);
  expect(locationZoom(19, true)).toBe(19);
  expect(locationZoom(8, false)).toBe(12);
  expect(locationZoom(15, false)).toBe(15);
});
