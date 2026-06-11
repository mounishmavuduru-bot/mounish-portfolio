import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Display face: variable font (wght 200–800) so 800 is available for bold
// 3D-letter headings without shipping a separate static weight.
const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

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
      className={`${plexMono.variable} ${bricolage.variable} h-full`}
    >
      <body className="min-h-full bg-[#070808] text-[#e8e3d8] antialiased">
        {children}
      </body>
    </html>
  );
}
