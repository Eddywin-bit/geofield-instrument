import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // PERMANENT. Android identifies the app by this string. It can never change
  // without becoming a different app that cannot read the old app's data.
  appId: "com.eondesigns.geofield",
  appName: "GeoField",
  // Pinch-zoom off across the whole WebView UI. Capacitor defaults this to
  // false, but we set it explicitly so a future Capacitor default flip cannot
  // silently re-enable zooming on the nav bar and buttons. MapLibre sets
  // touch-action:none on its own canvas, so map gestures are unaffected.
  zoomEnabled: false,
  // TanStack Start emits client assets here. CI copies dist/client/_shell.html
  // to dist/client/index.html before `cap add android` runs.
  webDir: "dist/client",
  android: {
      // The WebView draws the full height of the screen, under both system bars.
      // Android 15 makes those bars transparent and ignores statusBarColor and
      // navigationBarColor, so the only way to colour them is to put our own
      // background behind them. "force" did the opposite: it inset the WebView
      // and left the bars showing the empty window, which looked like black bars.
      // AppLayout keeps the header and nav content clear with env(safe-area-inset-*).
      adjustMarginsForEdgeToEdge: "disable",
      // Painted behind the WebView, so overscroll and any first-paint gap match
      // the light theme's background instead of showing black or white.
      backgroundColor: "#F9FAFB",
  },
};

export default config;
