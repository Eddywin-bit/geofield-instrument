import { useEffect, useState } from "react";
import { GEOFIELD_MARK } from "../lib/logo";

const SPLASH_KEY = "geofield_splash_shown";

export function SplashScreen() {
  const [visible, setVisible] = useState(() => {
    try {
      return sessionStorage.getItem(SPLASH_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // ignore storage failures
    }
    const fadeTimer = setTimeout(() => setFading(true), 1800);
    const unmountTimer = setTimeout(() => setVisible(false), 2200);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center transition-opacity duration-[400ms] pointer-events-none"
      style={{ opacity: fading ? 0 : 1 }}
      aria-hidden="true"
    >
      <img src={GEOFIELD_MARK} alt="" className="h-24 w-auto" />
      <span className="mt-4 text-2xl font-bold tracking-tight text-foreground">GeoField</span>
    </div>
  );
}
