import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "../components/AppLayout";
import {
  BookOpen,
  Building2,
  ChevronDown,
  Crosshair,
  Database,
  FileText,
  Library,
  Mail,
  MapPin,
  Scale,
  ScrollText,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { GEOFIELD_MARK } from "../lib/logo";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "GeoField — About" },
      { name: "description", content: "About GeoField." },
    ],
  }),
  component: AboutPage,
});

const APP_VERSION = "1.0.0";
const EDITION = "Ghana Edition";
const CONTACT_EMAIL = ""; // set to enable the Send feedback button

type SectionProps = {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

function Section({ icon: Icon, title, subtitle, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-panel border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-panel-2 transition-colors"
        aria-expanded={open}
      >
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground leading-tight">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{subtitle}</div>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/60 space-y-3">{children}</div>
      )}
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-foreground/85">{children}</p>;
}

function Ref({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground pl-3 -indent-3">{children}</p>
  );
}

function Credit({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-foreground/90 shrink-0">{name}</span>
      <span className="mono text-[10px] text-muted-foreground text-right">{detail}</span>
    </div>
  );
}

function Row({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

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
          <div className="mt-3 flex items-center gap-2">
            <span className="mono text-[10px] font-semibold tracking-wider uppercase text-foreground border border-border rounded-full px-2.5 py-1">
              v{APP_VERSION}
            </span>
            <span className="mono text-[10px] font-semibold tracking-wider uppercase text-primary border border-primary/40 rounded-full px-2.5 py-1">
              {EDITION}
            </span>
          </div>
        </div>

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

          <Section icon={Sparkles} title="Using GeoField" subtitle="Locate, Know, Log" defaultOpen>
            <Row
              icon={Crosshair}
              title="Locate"
              text="A GPS fix run against Ghana's geology names the unit where you stand."
            />
            <Row
              icon={BookOpen}
              title="Know"
              text="Expected rocks, structures, mineral and engineering notes for every mapped unit."
            />
            <Row
              icon={FileText}
              title="Log"
              text="Fast field notes with coordinates, photos and voice, saved on your phone."
            />
            <Row
              icon={MapPin}
              title="Map"
              text="The full geological map with an offline base map of Ghana's roads, rivers and towns."
            />
          </Section>

          <Section icon={WifiOff} title="Offline behaviour" subtitle="What works without a signal">
            <Body>
              All geology and unit data ships inside the app. Once installed it needs no connection,
              and every log you take stays on your device.
            </Body>
            <Body>
              The Map tab offers two views. Offline draws Ghana from a base map stored on your phone,
              alongside the geology. Online fetches live street tiles and needs data. Offline is the
              field mode.
            </Body>
          </Section>

          <Section icon={MapPin} title="Positioning accuracy" subtitle="What the GPS can and cannot do">
            <Body>
              Accuracy depends on your phone's GPS and the sky above you. It is good enough to
              identify your unit almost everywhere. When a fix is weak GeoField tells you, and you
              can type coordinates in by hand.
            </Body>
            <Body>
              GeoField is not survey-grade. Do not use it to set boundaries, claims or engineering
              control points.
            </Body>
          </Section>

          <Section icon={ShieldCheck} title="On rock identification" subtitle="What this app will not guess">
            <Body>
              GeoField points you to what is likely underfoot. It does not identify rocks from
              photos. Hardness, reaction to acid and texture cannot be seen by a camera, and an
              overconfident answer is worse than none.
            </Body>
            <Body>
              Confirm what you see with your hands, a lens and acid. The call is yours.
            </Body>
          </Section>

          <Section icon={Database} title="Data sources" subtitle="Where the geology comes from">
            <Body>
              Geology is drawn from Ghana's national geological mapping, dissolved to seventeen units
              and simplified for the field. Unit descriptions are compiled from published research on
              the Birimian, Tarkwaian and associated units.
            </Body>
            <Body>
              The offline base map is built from OpenStreetMap data, clipped to Ghana. Map rendering
              by MapLibre. Base map tiles by Protomaps.
            </Body>
          </Section>

          <Section icon={ScrollText} title="Privacy" subtitle="Your logs stay on your phone">
            <Body>
              GeoField has no account, no tracking and no analytics. Your notes, photos, voice memos
              and coordinates are stored on your device only. Nothing is uploaded, and nothing is
              deleted unless you delete it.
            </Body>
            <Body>
              Location is read only while you are using the app, and only to identify your unit and
              stamp your logs.
            </Body>
          </Section>

          <Section icon={Scale} title="Attribution and licences" subtitle="Data, software and typefaces">
            <div>
              <div className="label-instrument pb-1.5">Geological data</div>
              <Credit name="Geological map of Ghana" detail="Ghana Geological Survey Authority" />
              <Credit name="Coordinate transformation" detail="Leigon → WGS 84 (EPSG)" />
            </div>
            <div className="pt-1">
              <div className="label-instrument pb-1.5">Base map data</div>
              <Credit name="Roads, rivers, towns" detail="© OpenStreetMap contributors · ODbL" />
              <Credit name="Vector tile build" detail="Protomaps" />
              <Credit name="World coastlines" detail="Natural Earth · public domain" />
            </div>
            <div className="pt-1">
              <div className="label-instrument pb-1.5">Software</div>
              <Credit name="MapLibre GL JS" detail="BSD-3-Clause" />
              <Credit name="PMTiles" detail="BSD-3-Clause" />
              <Credit name="Turf.js" detail="MIT" />
              <Credit name="proj4js" detail="MIT" />
              <Credit name="React · TanStack Router" detail="MIT" />
              <Credit name="Lucide icons" detail="ISC" />
              <Credit name="Noto Sans" detail="SIL Open Font License 1.1" />
            </div>
            <Body>
              Unit descriptions were compiled with the assistance of Google Gemini Pro Deep Research.
              Every claim is traced to the primary literature listed below. No description was
              accepted on the strength of the model alone.
            </Body>
          </Section>

          <Section icon={Library} title="References" subtitle="Primary literature behind the unit descriptions">
            <Ref>
              Davis, D. W., Hirdes, W., Schaltegger, U., &amp; Nunoo, E. A. (1994). U-Pb age
              constraints on deposition and provenance of Birimian and gold-bearing Tarkwaian
              sediments in Ghana, West Africa. Precambrian Research, 67(1-2), 89-107.
            </Ref>
            <Ref>
              Feybesse, J.-L., Billa, M., Guerrot, C., Duguey, E., Lescuyer, J.-L., Milesi, J.-P.,
              &amp; Bouchot, V. (2006). The Paleoproterozoic Ghanaian province: Geodynamic model and
              ore controls. Precambrian Research, 149(3-4), 149-196.
            </Ref>
            <Ref>
              John, T., Klemd, R., Hirdes, W., &amp; Loh, G. (1999). The metamorphic evolution of the
              Paleoproterozoic (Birimian) volcanic Ashanti belt (Ghana, West Africa). Precambrian
              Research, 98(1-2), 11-30.
            </Ref>
            <Ref>
              Kesse, G. O. (1985). The mineral and rock resources of Ghana. Rotterdam: A. A. Balkema.
            </Ref>
            <Ref>
              Leube, A., Hirdes, W., Mauer, R., &amp; Kesse, G. O. (1990). The Early Proterozoic
              Birimian Supergroup of Ghana and some aspects of its associated gold mineralization.
              Precambrian Research, 46(1-2), 139-165.
            </Ref>
            <Ref>
              Oberthür, T., Weiser, T., Amanor, J. A., &amp; Chryssoulis, S. L. (1997). Mineralogical
              siting and distribution of gold in the Ashanti belt of Ghana. Mineralium Deposita,
              32(1), 2-15.
            </Ref>
            <Ref>
              Oberthür, T., Vetter, U., Davis, D. W., &amp; Amanor, J. A. (1998). Age constraints on
              gold mineralization and Paleoproterozoic crustal evolution in the Ashanti belt of
              southern Ghana. Precambrian Research, 89(3-4), 129-143.
            </Ref>
            <Ref>
              Perrouty, S., Ailleres, L., Jessell, M. W., Baratoux, L., Bourassa, Y., &amp; Crawford,
              B. (2012). Revised Eburnean geodynamic evolution of the gold-rich southern Ashanti
              Belt, Ghana. Precambrian Research, 204-205, 12-39.
            </Ref>
            <Ref>
              Pigois, J.-P., Groves, D. I., Fletcher, I. R., McNaughton, N. J., &amp; Snee, L. W.
              (2003). Age constraints on Tarkwaian palaeoplacer and lode-gold formation in the
              Tarkwa-Damang district, southwest Ghana. Mineralium Deposita, 38(6), 695-714.
            </Ref>
            <Ref>
              Sylvester, P. J., &amp; Attoh, K. (1992). Lithostratigraphy and composition of 2.1 Ga
              greenstone belts of the West African Craton and their bearing on crustal evolution and
              the Archean-Proterozoic boundary. The Journal of Geology, 100(4), 377-393.
            </Ref>
            <Ref>
              Taylor, P. N., Moorbath, S., Leube, A., &amp; Hirdes, W. (1992). Early Proterozoic
              crustal evolution in the Birimian of Ghana: Constraints from geochronology and isotope
              geochemistry. Precambrian Research, 56(1-2), 97-111.
            </Ref>
          </Section>
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
