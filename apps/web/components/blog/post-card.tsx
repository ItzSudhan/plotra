import Link from "next/link";
import { Icon } from "@plotra/icons";
import { formatDate, type Post } from "@/lib/blog";
import { PostCover } from "./cover";

/** A post as it appears in a list: its picture, what it is about, and when it was written. */
export function PostCard({ post, heading: Heading = "h2" }: { post: Post; heading?: "h2" | "h3" }) {
  return (
    <article className="group relative flex flex-col">
      <div className="overflow-hidden rounded-[24px] border border-hairline bg-canvas">
        <PostCover
          post={post}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
          className="block aspect-[16/9] w-full transition-[scale] duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-gray">
        {post.tag} · {post.minutes} min read
      </p>
      <Heading className="mt-2 font-display text-[26px] leading-[1.12] tracking-[-0.015em] text-black text-balance">
        {/* The whole card is the link. */}
        <Link href={post.path} className="after:absolute after:inset-0 group-hover:text-ember transition-colors">
          {post.title}
        </Link>
      </Heading>
      <p className="mt-3 text-[15px] leading-relaxed text-gray text-pretty">{post.description}</p>
      <time dateTime={post.date} className="mt-4 text-[13px] text-gray">
        {formatDate(post.date)}
      </time>
    </article>
  );
}

/** The newest post, across the width of the page: its picture beside what it is about. */
export function FeaturedPost({ post }: { post: Post }) {
  return (
    <article className="group relative grid items-center gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
      <div className="overflow-hidden rounded-[28px] border border-hairline bg-canvas">
        <PostCover
          post={post}
          sizes="(max-width: 1024px) 100vw, 680px"
          className="block aspect-[16/9] w-full transition-[scale] duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-gray">
          <span className="text-ember">Latest</span> · {post.tag} · {post.minutes} min read
        </p>
        <h2
          className="mt-3 font-display text-[clamp(2rem,3.4vw,2.75rem)] text-black text-balance"
          style={{ lineHeight: 1.06, letterSpacing: "-0.02em" }}
        >
          <Link href={post.path} className="transition-colors after:absolute after:inset-0 group-hover:text-ember">
            {post.title}
          </Link>
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-gray text-pretty">{post.description}</p>
        <p className="mt-6 flex items-center gap-3 text-[13px] text-gray">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden className="h-px w-6 bg-hairline" />
          <span className="inline-flex items-center gap-1.5 text-black">
            Read the guide
            <Icon name="arrow-right-linear" className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </p>
      </div>
    </article>
  );
}
