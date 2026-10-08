import DisplayPlayer from "@/components/display/DisplayPlayer";
import { getDisplayBySlug } from "@/lib/db";
import { isDisplaySlug, publicPayloadForDisplay, type DisplayPayload } from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function DisplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  let initial: DisplayPayload | null = null;

  if (isDisplaySlug(slug)) {
    try {
      const row = await getDisplayBySlug(slug);
      if (row) initial = publicPayloadForDisplay(row);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[/display/:slug]", message);
    }
  }

  return (
    <DisplayPlayer
      slug={slug}
      initial={initial}
      preview={preview === "1"}
    />
  );
}
