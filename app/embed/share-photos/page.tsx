import type { Metadata } from "next";
import EmbedSharePhotos from "@/components/embed/EmbedSharePhotos";

export const metadata: Metadata = {
  title: "Share your photos",
  robots: { index: false, follow: false },
};

export default function EmbedSharePhotosPage() {
  return <EmbedSharePhotos />;
}
