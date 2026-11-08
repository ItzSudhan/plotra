import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // The docs' own address, for link previews. Set NEXT_PUBLIC_DOCS_URL in production.
  metadataBase: new URL(process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3002'),
  title: { default: 'Plotra Docs', template: '%s | Plotra Docs' },
  description: 'How to write, plan and build a world in Plotra, from your first project to working with co-writers.',
  openGraph: { type: 'website', siteName: 'Plotra Docs', locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
