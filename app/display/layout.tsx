import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Yours Durham",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F7F3EC",
};

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="display-kiosk fixed inset-0 overflow-hidden bg-[var(--bg-main)] [&_*]:cursor-none">
      {children}
    </div>
  );
}
