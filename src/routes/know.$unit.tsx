import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "../components/AppLayout";
import { loadGeology, unitByName, type GeoUnit } from "../lib/geology";
import { colorForUnit } from "../lib/unit-colors";

export const Route = createFileRoute("/know/$unit")({
  head: ({ params }) => ({
    meta: [
      { title: `GeoField — ${decodeURIComponent(params.unit)}` },
      {
        name: "description",
        content: `Pocket field guide notes for ${decodeURIComponent(params.unit)}.`,
      },
    ],
  }),
  component: KnowScreen,
});

function KnowScreen() {
  const { unit: unitParam } = Route.useParams();
  const unitName = decodeURIComponent(unitParam);
  const router = useRouter();
  const [unit, setUnit] = useState<GeoUnit | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadGeology().then((g) => {
      if (cancelled) return;
      setUnit(unitByName(g.units, unitName));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [unitName]);

  const color = colorForUnit(unit?.unit_name ?? unitName, unit?.also_known_as);

  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.history.back();
            } else {
              router.navigate({ to: "/" });
            }
          }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      </div>

      <div className="px-4">
        <div className="rounded-lg border border-border bg-panel overflow-hidden">
          <div className="flex items-stretch">
            <div className="w-1.5" style={{ backgroundColor: color }} />
            <div className="flex-1 p-4">
              <div className="label-instrument">Unit</div>
              <h1 className="text-2xl font-bold tracking-tight leading-tight mt-1">
                {unit?.unit_name ?? unitName}
              </h1>
              {unit?.also_known_as && (
                <p className="text-sm text-muted-foreground mt-1">{unit.also_known_as}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {!loaded && (
          <p className="text-sm text-muted-foreground">Loading unit notes…</p>
        )}
        {loaded && !unit && (
          <p className="text-sm text-muted-foreground">
            No field guide entry available for this unit.
          </p>
        )}
        {unit && unit.expected_rocks && unit.expected_rocks.length > 0 && (
          <Section title="Expected rocks">
            <ul className="space-y-2">
              {unit.expected_rocks.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {unit && unit.expected_features && unit.expected_features.length > 0 && (
          <Section title="Structures / features">
            <ul className="space-y-2">
              {unit.expected_features.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {unit && unit.mineral_note && (
          <Section title="Mineral potential">
            <p className="text-sm leading-relaxed text-foreground/90">{unit.mineral_note}</p>
          </Section>
        )}
        {unit && unit.engineering_note && (
          <Section title="Engineering notes">
            <p className="text-sm leading-relaxed text-foreground/90">{unit.engineering_note}</p>
          </Section>
        )}
      </div>
    </AppLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="label-instrument mb-2">{title}</div>
      {children}
    </div>
  );
}
