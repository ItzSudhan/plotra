import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Inter, Newsreader } from "next/font/google";
import { Providers } from "@/components/providers";
import { motionScript } from "@/lib/motion";
import { themeScript } from "@/lib/themes";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: "Plotra", template: "%s · Plotra" },
  description: "The collaborative writing studio.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} ${newsreader.variable} ${instrumentSerif.variable} h-full`}
    >
      <head>
        {/* Before anything paints, so a page never animates for someone who switched animations off. */}
        <script dangerouslySetInnerHTML={{ __html: motionScript }} />
        {/* The person's theme (lib/themes.ts), from this device's copy, so no page flashes the default colours first. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
