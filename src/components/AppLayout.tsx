import { Link, useRouterState } from "@tanstack/react-router";
import { Crosshair, FileText, Info, Layers, Map } from "lucide-react";
import type { ReactNode } from "react";
import { GEOFIELD_MARK } from "../lib/logo";
import { SplashScreen } from "./SplashScreen";


export function AppLayout({ children }: { children: ReactNode }) {
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
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-center gap-2 px-4 h-11">
        <img src={GEOFIELD_MARK} alt="" className="h-[22px] w-auto" />
        <span className="text-lg font-bold tracking-tight text-foreground">GeoField</span>
      </div>
    </div>
  );
}

function QuickLogFab() {
  return (
    <Link
      to="/log"
      search={{ fresh: true }}
      className="fixed right-4 bottom-24 z-40 h-14 px-5 rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40 flex items-center gap-2 font-bold tracking-wide active:scale-95 transition-transform"
      aria-label="Quick log"
    >
      <Plus className="h-5 w-5" strokeWidth={3} />
      <span className="text-sm">QUICK LOG</span>
    </Link>
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
