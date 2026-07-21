// Single source of truth for the app version. The APK build workflow greps
// this exact line, so keep the format `const APP_VERSION = "X.Y.Z";` on one
// line. Lives in its own module (not src/routes/about.tsx) so it can be
// imported without a cycle: about.tsx renders AppLayout, and AppLayout's
// update-check banner needs this value too.
const APP_VERSION = "0.6.5";
export { APP_VERSION };
