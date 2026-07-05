import { Link, useRouterState } from "@tanstack/react-router";
import { Crosshair, FileText, Layers, Map, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { SplashScreen } from "./SplashScreen";

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMap = pathname === "/map";
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SplashScreen />
      <StatusBar />
      <main className="flex-1 pb-32">{children}</main>
      {!isMap && <QuickLogFab />}
      <BottomNav />
    </div>
  );
}

function StatusBar() {
  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-center gap-2 px-4 h-11">
        <img src="/geofield-mark.svg" alt="" className="h-[22px] w-auto" />
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
  ] as const;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-panel border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
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
                className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
                strokeWidth={active ? 2.5 : 2}
              />
              <span
                className={`text-[10px] tracking-[0.14em] font-semibold ${
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
