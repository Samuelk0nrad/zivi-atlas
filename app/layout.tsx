import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zivi Atlas — Finde deinen Zivildienst",
  description: "Entdecke Zivildienststellen in Österreich auf der Karte. Filtere nach Dienstbeginn, freien Plätzen und Tätigkeiten.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <head><link rel="stylesheet" href="/vendor/leaflet.css"/><link rel="stylesheet" href="/vendor/MarkerCluster.css"/></head>
      <body>{children}</body>
    </html>
  );
}
