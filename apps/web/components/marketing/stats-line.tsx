import { appUrl, repoUrl } from "@/lib/links";

// The public stats line (plan.md Phase 8): stars on GitHub and people on the
// hosted version, as they are. Each number is asked for at most once an hour,
// and one that can't be had (the repo still private, the app not deployed) is
// left out rather than guessed. With neither, the line isn't there.

const HOUR = 60 * 60;

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const response = await fetch(url, { headers, next: { revalidate: HOUR }, signal: AbortSignal.timeout(4000) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export async function StatsLine() {
  // The dev fallback for the app's address means there is no hosted version to count.
  const hosted = appUrl.startsWith("https://");
  const [repo, stats] = await Promise.all([
    getJson<{ stargazers_count?: unknown }>(repoUrl.replace("https://github.com/", "https://api.github.com/repos/"), { accept: "application/vnd.github+json" }),
    hosted ? getJson<{ people?: unknown; writers?: unknown }>(`${appUrl}/api/stats`) : null,
  ]);
  const stars = count(repo?.stargazers_count);
  const people = count(stats?.people);
  const writers = count(stats?.writers);

  const parts = [
    stars !== null && plural(stars, "star on GitHub", "stars on GitHub"),
    people !== null && plural(people, "person on the hosted version", "people on the hosted version"),
    writers !== null && people !== null && writers > 0 && `${plural(writers, "has", "have")} written a first scene`,
  ].filter(Boolean);
  if (!parts.length) return null;

  return <p className="mt-6 text-[13px] text-gray">Today: {parts.join(" · ")}.</p>;
}
