import { JetBrains_Mono } from "next/font/google";

/** Shared by public pages. Staff screens keep font-sans and do not use this class. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-jetbrains",
});
