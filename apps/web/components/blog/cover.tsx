import Image from "next/image";
import { covers } from "@/content/blog/art";
import type { Post } from "@/lib/blog";
import { BlogArt } from "./art";

/** The picture at the head of a post: its illustration if it has one, else its drawing. */
export function PostCover({
  post,
  className,
  sizes,
  priority,
}: {
  post: Pick<Post, "slug" | "art">;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  const cover = covers[post.slug];
  if (!cover) return <BlogArt name={post.art} className={className} />;
  return (
    <Image
      src={cover.src}
      alt={cover.alt}
      sizes={sizes}
      placeholder="blur"
      quality={85}
      {...(priority ? { loading: "eager" as const, fetchPriority: "high" as const } : {})}
      className={`${className ?? ""} h-auto object-cover`}
    />
  );
}
