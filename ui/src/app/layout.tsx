import "@/styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exoproximo · Belt Explorer",
  description: "NEO spectra, orbits, and Kepler candidates.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-fg font-mono antialiased">{children}</body>
    </html>
  );
}
