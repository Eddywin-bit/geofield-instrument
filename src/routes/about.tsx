import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import { Building2, ChevronRight, FlaskConical, Mail } from "lucide-react";
import { GEOFIELD_MARK } from "../lib/logo";
import { ABOUT_SECTIONS } from "../lib/about-sections";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [{ title: "GeoField — About" }, { name: "description", content: "About GeoField." }],
  }),
  component: AboutPage,
});

// Single source of truth for the app version. The APK build workflow greps this
// exact line, so keep the format `const APP_VERSION = "X.Y.Z";` on one line.
const APP_VERSION = "0.6.4";
const CHANNEL = "Beta"; // "Beta" while 0.x. Clear this string at 1.0.0.
const EDITION = "Ghana Edition";
const CONTACT_EMAIL = "ogstudios14@gmail.com"; // baked into every build; keep this address alive

function AboutPage() {
  return (
    <AppLayout>
      <div className="pb-28">
        {/* Masthead */}
        <div className="px-4 pt-8 pb-6 flex flex-col items-center text-center">
          <div className="h-16 w-16 rounded-2xl border border-border bg-panel flex items-center justify-center shadow-lg shadow-black/40">
            <img src={GEOFIELD_MARK} alt="" className="h-9 w-auto" />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">GeoField</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Offline-first field geology for Ghana
          </p>
          <div className="mt-3 flex items-center justify-center flex-wrap gap-2">
            <span className="mono text-[10px] font-semibold tracking-wider uppercase text-foreground border border-border rounded-full px-2.5 py-1">
              v{APP_VERSION}
            </span>
            {/* Solid fill, not flat text on the tint: primary only has
                ~1.7:1 contrast against the light background, well under
                readable-text standards, so both pills use the same
                bg-primary/text-primary-foreground pairing as the app's
                buttons rather than colored text on a transparent tint. */}
            {CHANNEL && (
              <span className="mono text-[10px] font-semibold tracking-wider uppercase bg-primary text-primary-foreground rounded-full px-2.5 py-1">
                {CHANNEL}
              </span>
            )}
            <span className="mono text-[10px] font-semibold tracking-wider uppercase bg-primary text-primary-foreground rounded-full px-2.5 py-1">
              {EDITION}
            </span>
          </div>
        </div>

        {CHANNEL && (
          <div className="px-4 pb-4">
            <div className="border border-primary/30 bg-primary/[0.06] rounded-lg p-3.5 flex items-start gap-3">
              <FlaskConical className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">Pre-release build</div>
                <p className="text-[13px] leading-relaxed text-foreground/80 mt-1">
                  This is a testing release. Features and data may change, and behaviour is not yet
                  final. Do not rely on it as your only record of a traverse. Report anything that
                  looks wrong.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Statement */}
        <div className="px-4">
          <div className="bg-panel border border-border rounded-lg p-4">
            <p className="text-sm leading-relaxed text-foreground/90">
              GeoField names the geological unit under your feet, gives you field-ready knowledge
              about it, and lets you capture notes, photos and voice memos on the spot. It is built
              to work with no signal, anywhere in Ghana.
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="px-4 mt-6 space-y-2.5">
          <h2 className="label-instrument px-1 pb-1">The App</h2>

          {ABOUT_SECTIONS.map(({ slug, icon: Icon, title, subtitle }) => (
            <Link
              key={slug}
              to="/about/$section"
              params={{ section: slug }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left bg-panel border border-border rounded-lg active:bg-panel-2 transition-colors"
            >
              <Icon className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground leading-tight">{title}</div>
                {subtitle && (
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {subtitle}
                  </div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>

        {/* Contact */}
        <div className="px-4 mt-6 space-y-2.5">
          <h2 className="label-instrument px-1 pb-1">Contact</h2>
          <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <div className="text-sm font-semibold text-foreground">
                Found a bug, or a unit described wrong?
              </div>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85">
              Field reports keep the data honest. If a boundary is off or a description does not
              match the outcrop, say so.
            </p>
            {CONTACT_EMAIL ? (
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold tracking-[1px] active:scale-95 transition-transform"
              >
                <Mail className="h-4 w-4" />
                Send feedback
              </a>
            ) : (
              <p className="mono text-[11px] text-muted-foreground">
                Contact channel opening with the next release.
              </p>
            )}
          </div>
        </div>

        {/* Built by */}
        <div className="px-4 mt-6 space-y-2.5">
          <h2 className="label-instrument px-1 pb-1">Built by</h2>
          <div className="bg-panel border border-border rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg border border-border bg-panel-2 flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground">Eon Designs</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Accra, Ghana</div>
                <div className="mt-2 pt-2 border-t border-border/60">
                  <div className="text-sm font-semibold text-foreground">Edwin Gyasi Owusu</div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    Founder and lead. Geological Engineering, KNUST.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="px-4 mt-8 text-center space-y-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            GeoField is a field aid, not a substitute for professional geological assessment or
            survey-grade positioning.
          </p>
          <p className="mono text-[10px] tracking-wider uppercase text-muted-foreground">
            v{APP_VERSION}
            {CHANNEL ? ` ${CHANNEL}` : ""} · {EDITION}
          </p>
          <p className="text-[11px] text-muted-foreground">&copy; 2026 Eon Designs</p>
        </footer>
      </div>
    </AppLayout>
  );
}
