import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import { MapView } from "../components/MapView";

export const Route = createFileRoute("/map")({
  head: () => ({ meta: [{ title: "GeoField — Map" }] }),
  component: MapScreen,
});

function MapScreen() {
  return (
    <AppLayout>
      <MapView />
    </AppLayout>
  );
}
