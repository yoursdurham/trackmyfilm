"use client";

import SharePhotosForm from "@/components/photos/SharePhotosForm";

export default function EmbedSharePhotos() {
  return (
    <main className="p-2" data-testid="embed-share-photos">
      <SharePhotosForm mode="public" cookieFreeUpload />
    </main>
  );
}
