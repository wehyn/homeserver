import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nimbus · Home server",
  description: "A calm control room for your self-hosted apps.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><Script id="theme-init" strategy="beforeInteractive">{`try {
  if (window.localStorage.getItem("nimbus-theme") === "light") document.documentElement.dataset.theme = "light";
} catch {}`}</Script></head><body>{children}</body></html>;
}
