import DisplayPlayer from "@/components/display/DisplayPlayer";
import { getDisplayBySlug } from "@/lib/db";
import { publicPayloadWithFilm } from "@/lib/display-screen";
import { displayBuildId, isDisplaySlug, type DisplayOrientation, type DisplayPayload } from "@/lib/display";
import { FRONT_WINDOW_SLUG } from "@/lib/shop-hours";

export const dynamic = "force-dynamic";

function orientationForSlug(slug: string): DisplayOrientation {
  return slug === FRONT_WINDOW_SLUG ? "landscape" : "portrait";
}

export default async function DisplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const isPreview = preview === "1";
  let initial: DisplayPayload | null = null;
  let orientation = orientationForSlug(slug);

  // The TV paints from its saved copy and must not read Supabase on a reboot.
  // Staff preview is a person opening the screen, so it still loads the live row.
  if (isPreview && isDisplaySlug(slug)) {
    try {
      const row = await getDisplayBySlug(slug);
      if (row) {
        orientation = row.orientation === "landscape" ? "landscape" : "portrait";
        try {
          initial = await publicPayloadWithFilm(row);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("[/display/:slug]", message);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[/display/:slug]", message);
    }
  }

  return (
    <DisplayPlayer
      slug={slug}
      initial={initial}
      loadedBuildId={displayBuildId()}
      preview={isPreview}
      orientation={orientation}
    />
  );
}
