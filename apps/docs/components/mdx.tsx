import defaultMdxComponents from 'fumadocs-ui/mdx';
import { ImageZoom, type ImageZoomProps } from 'fumadocs-ui/components/image-zoom';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import type { MDXComponents } from 'mdx/types';
import { signUpUrl } from '@/lib/shared';

/** The sign-up button a page ends a pitch with: `<StartWriting />`, or with its own words inside. */
function StartWriting({ children = 'Start writing for free' }: { children?: React.ReactNode }) {
  return (
    <p className="not-prose my-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <a
        href={signUpUrl}
        className="inline-flex items-center rounded-full bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
      >
        {children}
      </a>
      <span className="text-sm text-fd-muted-foreground">Every feature is on the Free plan. No card needed.</span>
    </p>
  );
}

/** A screenshot of the app, written as `![what it shows](/shots/name.webp)`. Click it to see it at full size. */
function Screenshot(props: React.ComponentProps<'img'>) {
  return <ImageZoom {...(props as ImageZoomProps)} className="my-6 rounded-xl border shadow-sm" />;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    img: Screenshot,
    StartWriting,
    // numbered walkthroughs: <Steps><Step>### A step …</Step></Steps>
    Steps,
    Step,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
