"use client";

import PublicErrorScreen from "@/components/PublicErrorScreen";

export default function LoginError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <PublicErrorScreen error={error} retry={retry} />;
}
