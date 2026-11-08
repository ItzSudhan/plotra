import { describe, expect, test } from 'bun:test';
import { brokenLinks } from '../scripts/check-links';

// Every link to a docs page, from the docs and from the marketing site and blog,
// must reach a page that exists, and a heading on it when it names one. The
// checking is in scripts/check-links.ts, which CI also runs on its own.

describe('docs links', () => {
  const { pages, broken } = brokenLinks();

  test('there are pages', () => {
    expect(pages.size).toBeGreaterThan(40);
  });

  test('every link reaches a page and a heading', () => {
    expect(broken).toEqual([]);
  });
});
