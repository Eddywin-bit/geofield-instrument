import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // PERMANENT. Android identifies the app by this string. It can never change
  // without becoming a different app that cannot read the old app's data.
  appId: "com.eondesigns.geofield",
  appName: "GeoField",
  // TanStack Start emits client assets here. CI copies dist/client/_shell.html
  // to dist/client/index.html before `cap add android` runs.
  webDir: "dist/client",
  android: {
    // Keep the WebView background matched to the app shell so there is no
    // white flash between splash and first paint.
    backgroundColor: "#121417",
    // Android 15+ enforces edge-to-edge. Without this the WebView renders behind
    // the status bar and the app header collides with the system clock.
    adjustMarginsForEdgeToEdge: "auto",
  },
};

export default config;
