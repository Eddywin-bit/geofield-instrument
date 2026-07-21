import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Crosshair, DownloadCloud, FileText, Info, Layers, Map, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { GEOFIELD_MARK } from "../lib/logo";
import { runBackHandlers } from "../lib/back-button";
import {
  checkForUpdate,
  dismissVersion,
  getDismissedVersion,
  type UpdateInfo,
} from "../lib/update-check";
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
      <UpdateBanner />
      <main className="flex-1 pb-32">{children}</main>
      <BottomNav />
    </div>
  );
}

// Checked once per app session (see checkForUpdate's module-level cache).
// AppLayout isn't a persistent route wrapper - every screen re-renders it -
// so this mounts on every navigation, but only ever fetches version.json
// once. A dismissed version stays dismissed (via Preferences) until a newer
// one is published.
function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkForUpdate().then(async (result) => {
      if (cancelled || !result) return;
      const dismissed = await getDismissedVersion();
      if (cancelled || dismissed === result.version) return;
      setInfo(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-primary/15 border-b border-border text-xs">
      <DownloadCloud className="h-4 w-4 text-primary shrink-0" />
      <span className="flex-1 text-foreground/90">GeoField v{info.version} is available.</span>
      <a
        href={info.url}
        className="font-semibold text-primary underline underline-offset-2 shrink-0"
      >
        Download
      </a>
      <button
        type="button"
        onClick={() => {
          setInfo(null);
          void dismissVersion(info.version);
        }}
        aria-label="Dismiss"
        className="shrink-0"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
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
              {/* Icon carries the accent color; the label stays on foreground.
                  Primary only has ~1.7:1 contrast against the light panel
                  background, so the icon (an accent fill, not body text) is
                  the one place this active state still uses it directly. */}
              <Icon
                className={`h-[22px] w-[22px] ${active ? "text-primary" : "text-muted-foreground"}`}
                strokeWidth={active ? 2.5 : 2}
              />
              <span
                className={`text-[10px] tracking-[0.08em] font-semibold leading-none whitespace-nowrap ${
                  active ? "text-foreground" : "text-muted-foreground"
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
