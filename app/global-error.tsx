"use client";

import "./globals.css";
import { jetbrainsMono } from "@/lib/fonts";
import PublicErrorScreen from "@/components/PublicErrorScreen";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body>
        <PublicErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
