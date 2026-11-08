// The projects page's search box. Pure, so the tests can check it.

/** Lower case with accents taken off, so "écrit" finds "Ecrit" and the other way round. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The projects whose title holds the search text, accents and case ignored; all of them when it's blank. */
export function filterProjects<T extends { title: string }>(projects: T[], query: string): T[] {
  const q = fold(query.trim());
  if (!q) return projects;
  return projects.filter((project) => fold(project.title).includes(q));
}

/** Above this many projects the page offers a search box. */
export const SEARCH_FROM = 6;
