import type { MetadataRoute } from 'next';
import { docsUrl } from '@/lib/shared';
import { source } from '@/lib/source';

// Every page of the docs, so search engines find them without crawling the sidebar.
export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: `${docsUrl}${page.url}`,
    changeFrequency: 'weekly',
    priority: page.url === '/docs' ? 1 : 0.7,
  }));
}
