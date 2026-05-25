import "@/styles/globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { TopNav } from "@/components/chrome/TopNav";
import { BottomHud } from "@/components/chrome/BottomHud";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Exoproximo · Belt Explorer",
  description: "NEO spectra, orbits, and Kepler candidates.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${display.variable}`}>
      <body className="bg-bg text-fg font-mono antialiased">
        <TopNav />
        {children}
        <BottomHud />
      </body>
    </html>
  );
}
