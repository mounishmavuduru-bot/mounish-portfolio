import type { Metadata } from "next";
import { DM_Mono, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const dmMono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Mounish Mavuduru — OR",
  description:
    "Builder, researcher, and aspiring cardiothoracic surgeon.",
  openGraph: {
    title: "Mounish Mavuduru",
    description:
      "Builder, researcher, and aspiring cardiothoracic surgeon.",
    type: "website",
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
      className={`${dmMono.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-hidden bg-[#07090a] text-[#e8edec]">
        {children}
      </body>
    </html>
  );
}
