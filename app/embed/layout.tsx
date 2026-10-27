import type { ReactNode } from "react";
import EmbedResize from "@/components/embed/EmbedResize";

export const EMBED_PAGE_STYLE = `html.h-full,
body.min-h-full {
  height: auto !important;
  min-height: 0 !important;
  background-color: #FFF6D3;
  background-color: transparent;
}`;

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{EMBED_PAGE_STYLE}</style>
      <EmbedResize />
      {children}
    </>
  );
}
