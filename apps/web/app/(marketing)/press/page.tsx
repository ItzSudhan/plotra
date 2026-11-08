import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import { DocPage, DocTable } from "@/components/marketing/doc-page";
import { appUrl, contactEmail, discordUrl, docsUrl, repoUrl } from "@/lib/links";
import { mediaUrl, siteUrl } from "@/lib/site";
import editor from "@/public/press/plotra-editor.png";
import graph from "@/public/press/plotra-graph.png";
import mark from "@/public/press/plotra-mark-512.png";
import timeline from "@/public/press/plotra-timeline.png";
import poster from "@/public/press/plotra-trailer-poster.png";

export const metadata: Metadata = {
  title: "Press kit",
  description: "Plotra in a paragraph, the facts, the logo, screenshots and the trailer, free to use when you write about Plotra or show it.",
};

// The press kit: for creators, newsletters and podcasts. The files live in
// public/press, and the README shows the screenshots from there too.
// The two videos are served from media.plotra.ink in production (mediaUrl),
// with a Content-Disposition that makes the links download.
// Keep the facts in step with the README and the pricing page.

const short =
  "Plotra is an open-source writing app where a novel, a screenplay or a tabletop campaign lives in one linked project with its world: scenes, characters, places, a timeline and a plot grid. Co-writers write together live, and Plotra keeps track of canon, of who knows which secret, and of what readers know as of each book.";

const long = `${short} Its spoiler horizon shows the whole project as of any book or session, so a reader's wiki or a players' handout leaves out what isn't revealed yet. Continuity checks catch a character who appears after their death, or is in two places at once, with plain rules and no AI. It's free to use at app.plotra.ink, free to host yourself, and licensed under AGPL-3.0.`;

const facts: React.ReactNode[][] = [
  ["What", "A writing app for novels, screenplays and tabletop campaigns, with the world bible in the same linked project"],
  ["For", "Novelists, co-writers, screenwriters, game masters and worldbuilders"],
  ["Price", "Free plan with every feature. Pro, $10 a month per workspace, for more room, more collaborators and hosted AI"],
  ["Source", <>Open source, AGPL-3.0, on <a href={repoUrl}>GitHub</a></>],
  ["Runs", <>In the browser at <a href={appUrl}>{appUrl.replace(/^https?:\/\//, "")}</a>, and self-hosted with Docker. A desktop app for macOS, Windows and Linux has its first release coming</>],
  ["AI", "Off unless a workspace switches it on, and then on the writer's own key, a local model or hosted credits. A server can take it out entirely"],
  ["Made by", "One developer, Sudhan, in India"],
  ["Status", "Early. It hasn't been used by many people yet"],
];

function Shot({ src, name, alt, note }: { src: StaticImageData; name: string; alt: string; note: string }) {
  return (
    <figure className="mt-6">
      <a href={`/press/${name}`} download className="block overflow-hidden rounded-xl border border-hairline no-underline">
        <Image src={src} alt={alt} sizes="(min-width: 768px) 45rem, 100vw" quality={90} className="h-auto w-full" />
      </a>
      <figcaption className="mt-2 text-[13.5px] text-gray">
        {note} <a href={`/press/${name}`} download>Download ({src.width} × {src.height} PNG)</a>
      </figcaption>
    </figure>
  );
}

export default function PressPage() {
  return (
    <DocPage
      eyebrow="Press"
      title="Press kit"
      intro="Everything you need to write about Plotra or show it: what it is in a paragraph, the facts, the logo, screenshots and the trailer. Use any of it, no need to ask."
    >
      <h2 id="paragraph">Plotra in a paragraph</h2>
      <p>{short}</p>
      <h3>A longer one</h3>
      <p>{long}</p>

      <h2 id="facts">The facts</h2>
      <DocTable head={["", ""]} rows={facts} />

      <h2 id="trailer">The trailer</h2>
      <p>Two people writing one scene at once, the world around it, and the spoiler horizon: two and a half minutes, with sound.</p>
      <video controls preload="none" poster={poster.src} className="mt-6 aspect-video w-full rounded-xl border border-hairline bg-black">
        <source src={mediaUrl("/press/plotra-launch-trailer.mp4")} type="video/mp4" />
      </video>
      <ul>
        <li>
          <a href={mediaUrl("/press/plotra-launch-trailer.mp4")} download>
            The launch trailer
          </a>{" "}
          (2:30, MP4, 16 MB)
        </li>
        <li>
          <a href={mediaUrl("/press/plotra-promo.mp4")} download>
            The 30-second promo
          </a>{" "}
          (MP4, 7 MB)
        </li>
        <li>
          <a href="/press/plotra-trailer-poster.png" download>
            The trailer&apos;s still
          </a>{" "}
          ({poster.width} × {poster.height} PNG)
        </li>
      </ul>

      <h2 id="screenshots">Screenshots</h2>
      <p>The app on its fantasy-novel sample project, taken on 3 October 2026.</p>
      <Shot src={editor} name="plotra-editor.png" alt="The workspace: the binder on the left, a scene open in the editor, the inspector on the right" note="The workspace: the binder, a scene in the editor, the inspector." />
      <Shot src={graph} name="plotra-graph.png" alt="The graph view: scenes, characters, places and secrets, linked" note="The graph: scenes, characters, places and secrets, linked." />
      <Shot src={timeline} name="plotra-timeline.png" alt="The timeline: scenes and events in lanes by plot thread, on the story's own calendar" note="The timeline: lanes by plot thread, on the story's own calendar." />

      <h2 id="logo">The logo</h2>
      <div className="mt-6 flex flex-wrap items-center gap-6">
        <a href="/press/plotra-mark-512.png" download className="no-underline">
          <Image src={mark} alt="The Plotra mark" className="size-24 rounded-2xl border border-hairline" />
        </a>
        <div className="text-[15px]">
          <p className="!mt-0">
            <a href="/press/plotra-mark-512.png" download>
              The mark
            </a>{" "}
            ({mark.width} × {mark.height} PNG)
          </p>
          <p className="!mt-1 text-gray">The name is written Plotra, with a capital P. Please keep the mark&apos;s colours and proportions.</p>
        </div>
      </div>

      <h2 id="links">Links</h2>
      <ul>
        <li>
          The site: <a href={siteUrl}>{siteUrl.replace(/^https?:\/\//, "")}</a>
        </li>
        <li>
          The app, with a free plan: <a href={appUrl}>{appUrl.replace(/^https?:\/\//, "")}</a>
        </li>
        <li>
          The docs, self-hosting included: <a href={docsUrl}>{docsUrl.replace(/^https?:\/\//, "")}</a>
        </li>
        <li>
          The source: <a href={repoUrl}>{repoUrl.replace(/^https?:\/\//, "")}</a>
        </li>
        <li>
          The community: <a href={discordUrl}>Discord</a>
        </li>
      </ul>

      <h2 id="contact">Contact</h2>
      <p>
        For an interview, a demo, a project set up for your audience or anything not here, write to <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </DocPage>
  );
}
