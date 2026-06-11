import type { Metadata } from "next";
import { Spectral, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Display + body face: Spectral, an old-style serif in the spirit of an 1800s
// anatomy plate. Spectral ships as static weights, so we request the range the
// atlas uses (300–600) plus italics for emphasis.
const spectral = Spectral({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

// Tiny labels / meta / chart readouts.
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const DESCRIPTION =
  "Builder, researcher, and aspiring cardiothoracic surgeon. Projects, research, and positions.";

export const metadata: Metadata = {
  title: "Mounish Mavuduru",
  description: DESCRIPTION,
  openGraph: {
    title: "Mounish Mavuduru",
    description: DESCRIPTION,
    url: "https://mounishmavuduru.vercel.app",
    siteName: "Mounish Mavuduru",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Mounish Mavuduru",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexMono.variable} ${spectral.variable} h-full`}
    >
      {/* No flat bg utility here — globals.css paints the matte cream gradient
          ground on html/body; every fixed layer above stays transparent. */}
      <body className="min-h-full text-[#1a1714] antialiased">
        {children}
      </body>
    </html>
  );
}
