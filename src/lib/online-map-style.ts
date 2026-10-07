import type { StyleSpecification } from "maplibre-gl";

/** Keep named landmarks readable even when their icon cannot be placed. */
export function withOnlineLandmarks(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (layer.type !== "symbol" || layer["source-layer"] !== "poi") return layer;
      return {
        ...layer,
        layout: {
          ...layer.layout,
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
