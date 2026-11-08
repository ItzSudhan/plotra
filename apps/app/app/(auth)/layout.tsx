import { Young_Serif } from "next/font/google";
import { StoryScene } from "@/components/auth/story-scene";
import { LogoMark } from "@/components/logo";
import { inDesktopApp } from "@/lib/desktop";

// The sign-in pages are set the way plotra.ink is: its display face, its white
// page and its painted stories, so arriving from the site feels like turning a
// page rather than changing apps. They stay light in either theme (components/providers.tsx).
const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
});

/** The marketing site, when this instance has one. */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  // In the desktop app the logo is just the logo: the app isn't a way onto the website.
  const homeUrl = (await inDesktopApp()) ? null : siteUrl;
  const logo = (
    <span className="inline-flex items-center gap-2 text-black">
      <LogoMark className="size-7" />
      <span className="font-brand text-3xl leading-none tracking-tight">Plotra</span>
    </span>
  );

  return (
    <div className={`${youngSerif.variable} relative isolate flex min-h-dvh flex-1 flex-col overflow-hidden bg-white`}>
      <header className="px-6 pt-6 sm:px-12 sm:pt-8 lg:px-16 xl:px-24">
        {homeUrl ? (
          <a href={homeUrl} aria-label="Plotra home" className="inline-block">
            {logo}
          </a>
        ) : (
          logo
        )}
      </header>
      <main className="flex flex-1 flex-col justify-center px-6 py-14 sm:px-12 lg:px-16 xl:px-24">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
      {/* Under the form on a phone; the right of the page on a wide screen, rising out of the white as on the site. */}
      <StoryScene className="h-64 w-full object-[80%_100%] [mask-image:linear-gradient(to_bottom,transparent,black_45%)] sm:h-80 lg:absolute lg:inset-y-0 lg:right-0 lg:-z-10 lg:h-full lg:w-[55%] lg:object-right-bottom lg:[mask-image:linear-gradient(to_right,transparent,black_40%)] xl:w-[60%]" />
    </div>
  );
}
