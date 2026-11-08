import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Inter, Newsreader, Young_Serif } from "next/font/google";
import { siteDescription, siteName, siteTitle, siteUrl } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
});

// The app's own display face, for the product mocks that show its headings.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteTitle, template: "%s · Plotra" },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "novel writing app",
    "worldbuilding app",
    "writing software for novelists",
    "collaborative writing",
    "co-writing",
    "story bible",
    "character and timeline tracker",
    "plot planner",
  ],
  // Each page is its own canonical address, resolved against its own path.
  alternates: { canonical: "./" },
  // No title or description here: each page's own are used for its card.
  openGraph: { type: "website", siteName, locale: "en_US", url: "./" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Lets Next jump to the top of a new page at once, instead of smooth-scrolling there mid-transition.
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${geistMono.variable} ${youngSerif.variable} ${newsreader.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
