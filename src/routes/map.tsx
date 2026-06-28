import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import { Map as MapIcon } from "lucide-react";

export const Route = createFileRoute("/map")({
  head: () => ({ meta: [{ title: "GeoField — Map" }] }),
  component: MapScreen,
});

function MapScreen() {
  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Map</h1>
          <span className="label-instrument">SCREEN 04</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center px-6 pt-10 pb-20 text-center">
        <div className="rounded-2xl border border-border bg-panel p-8 flex flex-col items-center gap-5 w-full max-w-sm">
          <MapIcon className="h-12 w-12 text-muted-foreground opacity-40" strokeWidth={1.5} />

          <div className="space-y-1">
            <span className="label-instrument block">COMING SOON</span>
            <p className="text-base font-bold tracking-tight">Geological map view</p>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            See your geological units as coloured layers with your live GPS position. Arriving in a
            future update.
          </p>

          <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              OFFLINE / ONLINE
            </span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
