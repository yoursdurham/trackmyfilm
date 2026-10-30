"use client";

import { useEffect } from "react";

/** Last resort if the player itself throws. Stay on black instead of the cream site error page. */
export default function DisplayError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(retry, 5000);
    return () => window.clearTimeout(timer);
  }, [retry]);

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-black px-8 text-center font-jetbrains text-[#f4f1ea]">
      <p className="text-[clamp(1.5rem,4vh,3rem)] leading-tight font-bold">The screen will try again in a moment.</p>
    </div>
  );
}
