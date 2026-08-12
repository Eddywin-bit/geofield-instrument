import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import { Cloud, Mail } from "lucide-react";
import { EON_MARK } from "../lib/eon-mark";
import { GEOFIELD_MARK } from "../lib/logo";
import { ABOUT_SECTIONS, CHANNEL, EDITION } from "../lib/about-sections";
import { APP_VERSION } from "../lib/app-version";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [{ title: "GeoField — About" }, { name: "description", content: "About GeoField." }],
  }),
  component: AboutPage,
});

const CONTACT_EMAIL = "oegyasi@st.knust.edu.gh"; // baked into every build; keep this address alive

function AboutPage() {
  // /about/$section registers as a route with /about as its parent (any
  // route path is automatically the parent of a path it's a literal prefix
  // of, regardless of file-naming convention), so this component now has a
  // child. Without this check it always rendered the section list - the
  // URL changed on tap but nothing else ever appeared, since there was no
  // <Outlet /> to show the matched child. Rendering just the Outlet for any
  // deeper path hands the screen fully to the section page instead of
  // stacking both.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/about") {
    return <Outlet />;
  }

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
        </div>

        {/* Sections */}
        <div className="px-4 space-y-2.5">
          {ABOUT_SECTIONS.map(({ slug, title }) => (
            <Link
              key={slug}
              to="/about/$section"
              params={{ section: slug }}
              className="w-full flex items-center justify-start px-4 py-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold text-left active:scale-[0.99] transition-transform"
            >
              {title}
            </Link>
          ))}
        </div>

        {/* Backup & Restore */}
        <div className="px-4 mt-6 space-y-2.5">
          <h2 className="label-instrument px-1 pb-1">Your data</h2>
          <Link
            to="/backup"
            className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-panel shadow-md shadow-black/5 text-left active:scale-[0.99] transition-transform"
          >
            <span className="h-9 w-9 rounded-full bg-primary/35 flex items-center justify-center shrink-0">
              <Cloud className="h-4 w-4 text-foreground" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Backup &amp; Restore</div>
              <div className="text-[11px] text-muted-foreground">
                Save your observations to your Google Drive
              </div>
            </div>
          </Link>
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
              <img
                src={EON_MARK}
                alt="Eon Studios"
                className="h-10 w-10 rounded-lg border border-border shrink-0 object-cover"
              />
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground">Eon Studios</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Accra, Ghana</div>
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
            {CHANNEL ? ` · ${CHANNEL}` : ""} · {EDITION}
          </p>
          <p className="text-[11px] text-muted-foreground">&copy; 2026 Eon Studios</p>
        </footer>
      </div>
    </AppLayout>
  );
}
