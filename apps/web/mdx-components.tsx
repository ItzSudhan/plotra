import type { MDXComponents } from "mdx/types";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { Cta } from "@/components/marketing/interactions";
import { docsUrl, signUpUrl } from "@/lib/links";

// What the blog's MDX is drawn with. Posts link to the docs as "/docs/…", the
// way the docs link to themselves, and the address is filled in here.

function A({ href = "", children, ...rest }: React.ComponentProps<"a">) {
  if (href.startsWith("/docs")) {
    return (
      <a href={`${docsUrl}${href}`} {...rest}>
        {children}
      </a>
    );
  }
  if (href.startsWith("/")) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

/** The sign-up button a post puts after it first shows how Plotra does the job. */
function StartWriting() {
  return (
    <div className="not-prose my-10 flex flex-col items-start gap-3 rounded-[24px] border border-hairline bg-canvas p-6 font-sans sm:flex-row sm:items-center sm:justify-between sm:p-7">
      <p className="max-w-md text-[15px] leading-relaxed text-fg/85">
        <span className="font-medium text-black">Try it on your own story.</span> Every feature is on the Free plan, and
        no card is needed.
      </p>
      <Cta href={signUpUrl} className="shrink-0 px-7 py-3 text-sm">
        Start writing for free
      </Cta>
    </div>
  );
}

/**
 * A screenshot of the app, wider than the text on a large screen. A post imports
 * the picture from content/blog/shots, which gives it its size and its blurred
 * placeholder: `import codex from "./shots/bible-codex.webp"`. Where the post has its
 * list of sections in the left margin, the picture widens into the right one only.
 */
function Screenshot({ src, alt, caption }: { src: StaticImageData; alt: string; caption?: string }) {
  return (
    <figure className="not-prose my-10 font-sans lg:-mx-32 xl:mr-[-17rem] xl:ml-0">
      {/* The app's text is small on a phone, so the picture opens at full size. */}
      <a href={src.src} target="_blank" rel="noopener" aria-label="Open the screenshot at full size">
        <Image
          src={src}
          alt={alt}
          quality={90}
          sizes="(max-width: 1024px) 100vw, 944px"
          placeholder="blur"
          className="h-auto w-full rounded-2xl border border-hairline"
        />
      </a>
      {caption && <figcaption className="mt-3 text-center text-[13px] leading-relaxed text-gray text-pretty">{caption}</figcaption>}
    </figure>
  );
}

const components: MDXComponents = {
  a: A,
  // A table scrolls sideways on a phone instead of squeezing its columns.
  table: (props) => (
    <div className="my-8 overflow-x-auto rounded-2xl border border-hairline font-sans">
      <table {...props} />
    </div>
  ),
  StartWriting,
  Screenshot,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
