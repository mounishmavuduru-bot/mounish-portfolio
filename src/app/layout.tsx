import type { Metadata } from "next";
import { Archivo, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

// Display + body face: Archivo, a characterful grotesque — modern clinic ×
// specimen lab. Variable font; the weights the site uses.
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Tiny labels / meta / chart readouts.
const splineMono = Spline_Sans_Mono({
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
      className={`${splineMono.variable} ${archivo.variable} h-full`}
    >
      {/* No flat bg utility here — globals.css paints the matte cream gradient
          ground on html/body; every fixed layer above stays transparent. */}
      <body className="min-h-full text-[#1a1714] antialiased">
        {children}
      </body>
    </html>
  );
}
