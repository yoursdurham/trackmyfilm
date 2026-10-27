"use client";

import { useEffect } from "react";
import { watchEmbedHeight } from "@/lib/embed-resize";

export default function EmbedResize() {
  useEffect(() => watchEmbedHeight(document, window.parent), []);
  return null;
}
