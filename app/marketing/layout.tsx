import { Suspense } from "react";
import MarketingShell from "@/components/marketing/MarketingShell";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <MarketingShell>{children}</MarketingShell>
    </Suspense>
  );
}
