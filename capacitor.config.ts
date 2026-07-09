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
    // Inset the WebView clear of the status bar, camera cutout and navigation
    // bar on EVERY Android version, not just 15+. The strips left behind the
    // system bars are painted #121417 by the styles.xml patch in
    // .github/workflows/build-apk.yml, so the obsidian shell still reads as
    // edge-to-edge while the header never collides with the system clock.
    // Chose this over @capacitor-community/safe-area because Chromium < 140
    // reports env(safe-area-inset-top) as 0px, and stale WebViews are common
    // on the target devices.
    adjustMarginsForEdgeToEdge: "force",
  },
};

export default config;
