import { Suspense } from "react";
import { JetBrains_Mono } from "next/font/google";
import RecoverySessionRedirect from "@/components/RecoverySessionRedirect";
import MilesSavedSection from "@/components/MilesSavedSection";
import TrackingHome from "./TrackingHome";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-jetbrains",
});

export const revalidate = 3600;

export default function TrackingPage() {
  return (
    <div className={jetbrainsMono.variable}>
      <Suspense fallback={null}>
        <RecoverySessionRedirect />
        <TrackingHome
          milesSaved={
            <Suspense fallback={null}>
              <MilesSavedSection />
            </Suspense>
          }
        />
      </Suspense>
    </div>
  );
}
