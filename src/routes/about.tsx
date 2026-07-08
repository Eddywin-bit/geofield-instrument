import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import {
  MapPin,
  BookOpen,
  FileText,
  WifiOff,
  Crosshair,
  Layers,
  Mail,
  Building2,
} from "lucide-react";
import { GEOFIELD_MARK } from "../lib/logo";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "GeoField Companion — About" },
      { name: "description", content: "About GeoField." },
    ],
  }),
  component: AboutPage,
});

const APP_VERSION = "v2";
const CONTACT_EMAIL = ""; // set to enable the Send feedback button

function AboutPage() {
  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-28 space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <img src={GEOFIELD_MARK} alt="" className="h-10 w-auto" />
          <h1 className="text-2xl font-bold tracking-tight">GeoField</h1>
          <p className="text-sm text-muted-foreground">
            Offline-first field geology for Ghana
          </p>
          <p className="text-xs text-muted-foreground">{APP_VERSION}</p>
        </div>

        {/* About */}
        <section className="bg-panel border border-border rounded-lg p-4 space-y-2">
          <h2 className="label-instrument">About</h2>
          <p className="text-sm leading-relaxed text-foreground/90">
            GeoField names the geological unit under your feet, gives you field-ready knowledge about it, and lets you capture notes, photos and voice memos on the spot. It is built to work with no signal, anywhere in Ghana.
          </p>
        </section>

        {/* What it does */}
        <section className="space-y-3">
          <h2 className="label-instrument px-1">What it does</h2>
          <div className="bg-panel border border-border rounded-lg p-4 flex items-start gap-3">
            <Crosshair className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold">Locate</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A GPS fix run against Ghana's geology names your unit where you stand.
              </p>
            </div>
          </div>
          <div className="bg-panel border border-border rounded-lg p-4 flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold">Know</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Expected rocks, structures, mineral and engineering notes for every mapped unit.
              </p>
            </div>
          </div>
          <div className="bg-panel border border-border rounded-lg p-4 flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold">Log</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Fast field notes with coordinates, photos and voice, saved on your phone.
              </p>
            </div>
          </div>
        </section>

        {/* Works offline */}
        <section className="bg-panel border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-primary" />
            <h2 className="label-instrument">Works offline</h2>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            All geology and unit data ships inside the app. Once installed it needs no connection, and every log you take stays on your device.
          </p>
        </section>

        {/* Positioning accuracy */}
        <section className="bg-panel border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h2 className="label-instrument">Positioning accuracy</h2>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            Accuracy depends on your phone's GPS and the sky above you. It is good enough to identify your unit almost everywhere. When a fix is weak GeoField tells you, and you can type coordinates in by hand.
          </p>
        </section>

        {/* On rock identification */}
        <section className="bg-panel border border-border rounded-lg p-4 space-y-2">
          <h2 className="label-instrument">On rock identification</h2>
          <p className="text-sm leading-relaxed text-foreground/90">
            GeoField points you to what is likely underfoot. It does not identify rocks from photos. Confirm what you see with your hands, a lens and acid. The call is yours.
          </p>
        </section>

        {/* Data sources */}
        <section className="bg-panel border border-border rounded-lg p-4 space-y-2">
          <h2 className="label-instrument">Data sources</h2>
          <p className="text-sm leading-relaxed text-foreground/90">
            Geology is drawn from Ghana's national geological mapping, simplified for the field. Unit descriptions are compiled from published research on the Birimian, Tarkwaian and associated units.
          </p>
        </section>

        {/* Credits */}
        <section className="bg-panel border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="label-instrument">Credits</h2>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            Built by Eon Designs. Founder and lead, Edwin Gyasi Owusu, Geological Engineering, KNUST.
          </p>
        </section>

        {/* Feedback */}
        <section className="bg-panel border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="label-instrument">Feedback</h2>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            Feedback keeps the field data honest.
          </p>
          {CONTACT_EMAIL && (
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold tracking-wide active:scale-95 transition-transform"
            >
              <Mail className="h-4 w-4" />
              Send feedback
            </a>
          )}
        </section>

        {/* Footer */}
        <footer className="text-center space-y-2 pt-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            GeoField is a field aid, not a substitute for professional geological assessment or survey-grade positioning.
          </p>
          <p className="text-xs text-muted-foreground">
            &copy; 2026 Eon Designs
          </p>
        </footer>
      </div>
    </AppLayout>
  );
}
