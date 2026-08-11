import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { DM_Mono, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], variable: "--font-dm-mono", display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Nimbus · Home server",
  description: "A calm control room for your self-hosted apps.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nimbus",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0e13",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><Script id="theme-init" strategy="beforeInteractive">{`try {
  if (window.localStorage.getItem("nimbus-theme") === "light") document.documentElement.dataset.theme = "light";
} catch {}`}</Script></head><body className={`${manrope.variable} ${dmMono.variable}`}>{children}</body></html>;
}