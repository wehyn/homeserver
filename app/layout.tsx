import type { Metadata, Viewport } from "next";
import { DM_Mono, Manrope } from "next/font/google";
import PwaRegister from "./pwa-register";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], variable: "--font-dm-mono", display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Nimbus · Home server",
  description: "A calm control room for your self-hosted apps.",
  applicationName: "Nimbus",
  openGraph: {
    title: "Nimbus · Home server",
    description: "A calm control room for your self-hosted apps.",
    type: "website",
  },
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
  themeColor: "#0f0f10",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${manrope.variable} ${dmMono.variable}`}><PwaRegister />{children}</body></html>;
}
