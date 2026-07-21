import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import { BackupPanel } from "../components/BackupPanel";

export const Route = createFileRoute("/backup")({
  head: () => ({ meta: [{ title: "GeoField — Backup & Restore" }] }),
  component: BackupScreen,
});

function BackupScreen() {
  return (
    <AppLayout>
      <BackupPanel />
    </AppLayout>
  );
}
