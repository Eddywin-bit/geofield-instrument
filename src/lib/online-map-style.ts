import type { StyleSpecification } from "maplibre-gl";

/** Use the bundled map font for labels and keep landmarks independent of icons. */
export function withOnlineLandmarks(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    // The same Latin glyphs used offline are packaged in the APK. Online text
    // should not depend on an additional font-server request succeeding.
    glyphs: "/fonts/{fontstack}/{range}.pbf",
    layers: style.layers.map((layer) => {
      if (layer.type !== "symbol" || layer.layout?.["text-field"] === undefined) return layer;
      const layout = { ...layer.layout, "text-font": ["Noto Sans Regular"] };
      if (layer["source-layer"] !== "poi") return { ...layer, layout };
      return {
        ...layer,
        layout: {
          ...layout,
          "icon-optional": true,
          "text-padding": 1,
          "text-variable-anchor": ["top", "bottom", "left", "right"],
          "text-offset": [0, 0],
          "text-radial-offset": 0.8,
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 12, 18, 14],
        },
      };
    }),
  };
}

export function locationZoom(currentZoom: number, online: boolean): number {
  return Math.max(currentZoom, online ? 17 : 12);
}
