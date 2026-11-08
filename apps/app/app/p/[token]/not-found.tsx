"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { primaryAction, StatusPage } from "@/components/public/status-page";
import { publicPath } from "@/lib/public-link";

// A note that isn't in a link that works: taken out of what's shared, moved to
// the trash, or a made-up address. Shown inside the reader, beside its contents.

export default function NoteNotFound() {
  const { token } = useParams<{ token: string }>();
  return (
    <StatusPage
      fill={false}
      title="This page isn’t here"
      actions={
        <Link href={publicPath(token)} prefetch={false} className={primaryAction}>
          Back to the contents
        </Link>
      }
    >
      <p>The writer may have moved it or taken it out of what they share. Everything else is in the contents.</p>
    </StatusPage>
  );
}
