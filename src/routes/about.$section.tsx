import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "../components/AppLayout";
import { aboutSectionBySlug } from "../lib/about-sections";

export const Route = createFileRoute("/about/$section")({
  head: ({ params }) => {
    const section = aboutSectionBySlug(params.section);
    return {
      meta: [
        { title: `GeoField — ${section?.title ?? "About"}` },
        { name: "description", content: section?.subtitle ?? "About GeoField." },
      ],
    };
  },
  component: AboutSectionScreen,
});

function AboutSectionScreen() {
  const { section: slug } = Route.useParams();
  const router = useRouter();
  const section = aboutSectionBySlug(slug);

  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.history.back();
            } else {
              router.navigate({ to: "/about" });
            }
          }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      </div>

      {section ? (
        <>
          <div className="px-4">
            <div className="flex items-center gap-3">
              <section.icon className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight leading-tight text-foreground">
                  {section.title}
                </h1>
                {section.subtitle && (
                  <p className="text-sm text-muted-foreground mt-0.5">{section.subtitle}</p>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 mt-4">
            <div className="bg-panel border border-border rounded-lg p-4">{section.content}</div>
          </div>
        </>
      ) : (
        <div className="px-4">
          <p className="text-sm text-muted-foreground">
            This section could not be found. Go back and pick one from the list.
          </p>
        </div>
      )}
    </AppLayout>
  );
}
