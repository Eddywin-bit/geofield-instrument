// Content for the About screen's sub-pages. Shared between the section list
// (src/routes/about.tsx) and the section detail route
// (src/routes/about.$section.tsx) so the two stay in sync from one source.
import type { ReactNode } from "react";
import {
  BookOpen,
  Cloud,
  Crosshair,
  Database,
  FileText,
  FlaskConical,
  Library,
  MapPin,
  Scale,
  ScrollText,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from "lucide-react";

// Shared with src/routes/about.tsx's footer. CHANNEL "Beta" while 0.x, clear
// this string at 1.0.0 - it also gates the pre-release warning below.
export const CHANNEL = "Beta";
export const EDITION = "Ghana Edition";

export type AboutSection = {
  slug: string;
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  content: ReactNode;
};

function Body({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-foreground/85">{children}</p>;
}

function Ref({ children }: { children: ReactNode }) {
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

function Row({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
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

export const ABOUT_SECTIONS: AboutSection[] = [
  {
    slug: "using-geofield",
    icon: Sparkles,
    title: "Using GeoField",
    subtitle: "Locate, Know, Log",
    content: (
      <div className="space-y-3">
        {CHANNEL && (
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
        )}
        <p className="text-sm leading-relaxed text-foreground/90">
          GeoField names the geological unit under your feet, gives you field-ready knowledge about
          it, and lets you capture notes, photos and voice memos on the spot. It is built to work
          with no signal, anywhere in Ghana.
        </p>
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
        <Row
          icon={Cloud}
          title="Back up"
          text="Copy your observations to your own Google Drive, so a lost phone does not lose your work."
        />
      </div>
    ),
  },
  {
    slug: "offline-behaviour",
    icon: WifiOff,
    title: "Offline behaviour",
    subtitle: "What works without a signal",
    content: (
      <div className="space-y-3">
        <Body>
          All geology and unit data ships inside the app. Once installed it needs no connection, and
          every log you take stays on your device.
        </Body>
        <Body>
          The Map tab offers two views. Offline draws Ghana from a base map stored on your phone,
          alongside the geology. Online fetches live street tiles and needs data. Offline is the
          field mode.
        </Body>
        <Body>
          Backing up and restoring are the only things that need a connection. Log all day in the
          field with no signal, then back up when you are back on Wi-Fi.
        </Body>
      </div>
    ),
  },
  {
    slug: "positioning-accuracy",
    icon: MapPin,
    title: "Positioning accuracy",
    subtitle: "What the GPS can and cannot do",
    content: (
      <div className="space-y-3">
        <Body>
          Accuracy depends on your phone's GPS and the sky above you. It is good enough to identify
          your unit almost everywhere. When a fix is weak GeoField tells you, and you can type
          coordinates in by hand.
        </Body>
        <Body>
          GeoField is not survey-grade. Do not use it to set boundaries, claims or engineering
          control points.
        </Body>
      </div>
    ),
  },
  {
    slug: "rock-identification",
    icon: ShieldCheck,
    title: "On rock identification",
    subtitle: "What this app will not guess",
    content: (
      <div className="space-y-3">
        <Body>
          GeoField points you to what is likely underfoot. It does not identify rocks from photos.
          Hardness, reaction to acid and texture cannot be seen by a camera, and an overconfident
          answer is worse than none.
        </Body>
        <Body>Confirm what you see with your hands, a lens and acid. The call is yours.</Body>
      </div>
    ),
  },
  {
    slug: "data-sources",
    icon: Database,
    title: "Data sources",
    subtitle: "Where the geology comes from",
    content: (
      <div className="space-y-3">
        <Body>
          Geology is drawn from Ghana's national geological mapping, dissolved to seventeen units
          and simplified for the field. Unit descriptions are compiled from published research on
          the Birimian, Tarkwaian and associated units.
        </Body>
        <Body>
          The offline base map is built from OpenStreetMap data, clipped to Ghana. Map rendering by
          MapLibre. Base map tiles by Protomaps.
        </Body>
      </div>
    ),
  },
  {
    slug: "privacy",
    icon: ScrollText,
    title: "Privacy",
    subtitle: "Nothing leaves your phone unless you back it up",
    content: (
      <div className="space-y-3">
        <Body>
          GeoField has no tracking and no analytics. Your notes, photos, voice memos and coordinates
          are stored on your device, and nothing is deleted unless you delete it.
        </Body>
        <Body>
          Backup is the one time your logs leave the phone, and only when you tap Back up now. They
          go to your own Google Drive, into a folder named GeoField Backups. There is no GeoField
          server and no one else receives a copy. GeoField can only see the files it created in your
          Drive, nothing else you keep there.
        </Body>
        <Body>
          Signing in is optional. Identifying units and recording logs work exactly the same without
          it.
        </Body>
        <Body>
          Location is read only while you are using the app, and only to identify your unit and
          stamp your logs.
        </Body>
      </div>
    ),
  },
  {
    slug: "attribution-licences",
    icon: Scale,
    title: "Attribution and licences",
    subtitle: "Data, software and typefaces",
    content: (
      <div className="space-y-3">
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
          <Credit name="World country borders" detail="Natural Earth · public domain" />
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
          Unit descriptions were compiled with the assistance of Google Gemini Pro Deep Research,
          drawing on the literature listed below. Where the research found nothing to support a
          claim, the field was left empty rather than filled. Five units carry no mineral note for
          exactly that reason.
        </Body>
      </div>
    ),
  },
  {
    slug: "references",
    icon: Library,
    title: "References",
    subtitle: "Sources cited for the unit descriptions",
    content: (
      <div className="space-y-2">
        <Ref>Abanyie et al. (2018). Petrography and geochemistry of granitoids.</Ref>
        <Ref>Abu et al. (2022). Voltaian Basin studies.</Ref>
        <Ref>Affaton et al. (1980). The Buem Structural Unit.</Ref>
        <Ref>Affaton et al. (1991). The Volta Basin.</Ref>
        <Ref>
          Amponsah (2016). High-pressure granulites and eclogites of the Dahomeyide suture zone.
        </Ref>
        <Ref>Anani (1999). Stratigraphy of the Volta Basin.</Ref>
        <Ref>
          Anani et al. (2017). Petrography of detrital zircons from sandstones of the Lower Devonian
          Accraian Formation.
        </Ref>
        <Ref>Asamoah. Geology of Ghana.</Ref>
        <Ref>
          Asiedu et al. (2005). Provenance of late Ordovician to early Cretaceous sedimentary rocks.
        </Ref>
        <Ref>
          Atta-Peters &amp; Garrey (2014). Source rock evaluation and hydrocarbon potential in the
          Tano Basin.
        </Ref>
        <Ref>Attoh et al. (1991). The Dahomeyide Orogen.</Ref>
        <Ref>Attoh &amp; Nude (2008). Tectonic significance of carbonatite.</Ref>
        <Ref>Carney et al. (2010). Lithostratigraphy of the Voltaian Supergroup.</Ref>
        <Ref>Chardon (2023). The Continental Terminal in West Africa.</Ref>
        <Ref>Crow (1952). The rocks of the Sekondi Series.</Ref>
        <Ref>Dampare et al. (2008). Geochemistry of Paleoproterozoic metavolcanic rocks.</Ref>
        <Ref>Hirdes &amp; Leube (1989). Orogenic gold mineralisation in the Kumasi Basin.</Ref>
        <Ref>Hirdes et al. (1996). Geology of the Birimian Supergroup in Ghana.</Ref>
        <Ref>Jones (1990). The Buem volcanic and associated sedimentary rocks.</Ref>
        <Ref>Junner (1940). Geology of the Gold Coast and Western Togoland.</Ref>
        <Ref>Junner &amp; Hirst (1946). The geology and hydrogeology of the Volta Basin.</Ref>
        <Ref>Kalsbeek et al. (2008). The Togo structural unit.</Ref>
        <Ref>Kesse (1985). Geology and mineral resources of Ghana.</Ref>
        <Ref>Kwayisi et al. (2020). Lithotectonic evolution of the Buem structural unit.</Ref>
        <Ref>Kwayisi et al. (2022). Petrogenesis of the Buem mafic suite.</Ref>
        <Ref>Mani (1978). The geology of the Dahomeyan of Ghana.</Ref>
        <Ref>McCallien (1962). Geology of the Accraian Series.</Ref>
        <Ref>Nelson (2024). Changing beach dynamics.</Ref>
        <Ref>Pigois et al. (2003). Tarkwaian palaeoplacer and lode-gold formation.</Ref>
      </div>
    ),
  },
];

export function aboutSectionBySlug(slug: string): AboutSection | undefined {
  return ABOUT_SECTIONS.find((s) => s.slug === slug);
}
