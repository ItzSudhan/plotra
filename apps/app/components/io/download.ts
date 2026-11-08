"use client";

import { responseError } from "@/components/agent/response-error";

/** Fetches an export and saves it, so a failure shows as a message instead of a blank page. Returns the file's name. */
export async function download(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw await responseError(res, "The export didn't work. Try again.");
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "export";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await res.blob());
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  return name;
}
