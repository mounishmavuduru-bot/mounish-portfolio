import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500"],
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
      className={`${plexMono.variable} ${fraunces.variable} h-full`}
    >
      <body className="min-h-full bg-[#070808] text-[#e8e3d8] antialiased">
        {children}
      </body>
    </html>
  );
}
