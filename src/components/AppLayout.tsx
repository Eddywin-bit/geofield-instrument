import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Crosshair, FileText, Info, Layers, Map } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { GEOFIELD_MARK } from "../lib/logo";
import { runBackHandlers } from "../lib/back-button";
import { SplashScreen } from "./SplashScreen";

/**
 * Android hardware back / back-swipe. Without this listener the WebView lets
 * the press fall through to the OS and the activity is destroyed, so back
 * anywhere in the app killed it outright.
 *
 * Order: an open overlay consumes the press, then in-app history, then the app
 * is backgrounded. The app is never killed, so an in-flight GPS cycle and any
 * unsaved observation survive.
 */
function useHardwareBackButton() {
  const router = useRouter();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", () => {
        if (runBackHandlers()) return;
        const history = router.history as { canGoBack?: () => boolean; back: () => void };
        const canGoBack =
          typeof history.canGoBack === "function"
            ? history.canGoBack()
            : typeof window !== "undefined" && window.history.length > 1;
        if (canGoBack) {
          history.back();
          return;
        }
        void App.minimizeApp();
      });
      if (cancelled) {
        void handle.remove();
        return;
      }
      cleanup = () => void handle.remove();
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);
}

export function AppLayout({ children }: { children: ReactNode }) {
  useHardwareBackButton();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SplashScreen />
      <StatusBar />
      <main className="flex-1 pb-32">{children}</main>
      <BottomNav />
    </div>
  );
}

function StatusBar() {
  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-center gap-2 px-4 h-11">
        <img src={GEOFIELD_MARK} alt="" className="h-[22px] w-auto" />
        <span className="text-lg font-bold tracking-tight text-foreground">GeoField</span>
      </div>
    </div>
  );
}


function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/", label: "LOCATE", icon: Crosshair, exact: true },
    { to: "/log", label: "LOG", icon: FileText, exact: false },
    { to: "/my-logs", label: "MY LOGS", icon: Layers, exact: false },
    { to: "/map", label: "MAP", icon: Map, exact: false },
    { to: "/about", label: "ABOUT", icon: Info, exact: false },
  ] as const;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-panel border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className="flex flex-col items-center justify-center gap-1 h-16 relative"
            >
              {active && <span className="absolute top-0 inset-x-6 h-[2px] bg-primary" />}
              <Icon
                className={`h-[22px] w-[22px] ${active ? "text-primary" : "text-muted-foreground"}`}
                strokeWidth={active ? 2.5 : 2}
              />
              <span
                className={`text-[10px] tracking-[0.08em] font-semibold leading-none whitespace-nowrap ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {it.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
