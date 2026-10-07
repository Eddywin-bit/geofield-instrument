import type { LayerSpecification, StyleSpecification, SymbolLayerSpecification } from "maplibre-gl";

/** Use the bundled map font for labels and keep landmarks independent of icons. */
export function withOnlineLandmarks(style: StyleSpecification): StyleSpecification {
  const poi = style.layers.find((layer) => layer.type === "symbol" && layer["source-layer"] === "poi");
  const layers: LayerSpecification[] = [];
  let landmarksAdded = false;
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || layer["source-layer"] !== "poi") {
      layers.push(layer.type === "symbol" && layer.layout?.["text-field"] !== undefined
        ? { ...layer, layout: { ...layer.layout, "text-font": ["Noto Sans Regular"] } }
        : layer);
      continue;
    }
    if (landmarksAdded || !poi || poi.type !== "symbol") continue;
    landmarksAdded = true;
    // A single named-landmark layer avoids the provider's zoom 15/16/17 rank
    // gates. Text and dots work without downloading a sprite or finding an icon.
    const common: Pick<SymbolLayerSpecification, "source" | "source-layer" | "minzoom" | "filter"> = {
      source: poi.source,
      "source-layer": "poi",
      minzoom: 14,
      filter: ["all", ["==", ["geometry-type"], "Point"],
        ["!=", ["coalesce", ["get", "name_en"], ["get", "name"], ""], ""]],
    };
    layers.push({
      ...common, id: "geofield-landmark-dots", type: "circle",
      paint: { "circle-radius": 3, "circle-color": "#a66b10", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 },
    });
    layers.push({
      ...common, id: "geofield-landmark-names", type: "symbol",
      layout: {
        "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-padding": 2,
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": 0.7,
        "text-size": ["interpolate", ["linear"], ["zoom"], 14, 11, 18, 14],
        "text-max-width": 10,
      },
      paint: { "text-color": "#423729", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
  }
  return {
    ...style,
    // The same Latin glyphs used offline are packaged in the APK. Online text
    // should not depend on an additional font-server request succeeding.
    glyphs: "/fonts/{fontstack}/{range}.pbf",
    layers,
  };
}

export function locationZoom(currentZoom: number, online: boolean): number {
  return Math.max(currentZoom, online ? 17 : 12);
}
