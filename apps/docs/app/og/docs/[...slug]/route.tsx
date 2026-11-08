import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'takumi-js/response';
import { notFound } from 'next/navigation';
import { source } from '@/lib/source';
import { getPageImageUrl } from '@/lib/shared';

// The card a link to a docs page unfurls into, drawn by Takumi: the page's
// title lit like a sign over a night sky in the site's ember, with the name of
// its section set huge and hollow behind it.

export const revalidate = false;

const size = { width: 1200, height: 630 };
const ink = '#0d0705';
const ember = '#ff6a2b';
const gold = '#ffc46b';
const rose = '#ff3d77';
const line = 'rgba(255, 214, 170, 0.42)';
const floor = 250;

// Film grain, which also hides the banding in the gradients.
const grain = `url("data:image/svg+xml,${encodeURIComponent(
  '<filter xmlns="http://www.w3.org/2000/svg"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>',
)}")`;

const fill = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex' } as const;

export async function GET(_req: Request, { params }: RouteContext<'/og/docs/[...slug]'>) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  const [youngSerif, inter, logo] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/YoungSerif-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/Inter-Regular.ttf')),
    readFile(join(process.cwd(), 'public/logo.png')),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;
  const title = page.data.title;
  // "self-hosting" → "SELF HOSTING"; the front page has no section, so it gets the product's name.
  const section = (page.slugs[0] ?? 'plotra').replace(/-/g, ' ').toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          ...fill,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: ink,
          backgroundImage: [
            `radial-gradient(ellipse 70% 80% at 96% 104%, ${ember}, transparent 68%)`,
            `radial-gradient(ellipse 55% 60% at 60% 118%, ${rose}, transparent 68%)`,
            'radial-gradient(ellipse 50% 55% at 104% 20%, rgba(255, 196, 107, 0.55), transparent 68%)',
            'radial-gradient(ellipse 60% 70% at -6% -10%, rgba(126, 58, 242, 0.5), transparent 68%)',
          ].join(', '),
          color: '#fff6ec',
          fontFamily: 'Inter',
        }}
      >
        {/* a floor of ruled lines running off to the horizon: rays from a vanishing point, crossed by lines that close up with distance */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: floor,
            display: 'flex',
            backgroundImage: `repeating-conic-gradient(from 90deg at 79% 0%, ${line} 0deg, ${line} 0.35deg, transparent 0.35deg, transparent 6deg)`,
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 70%)',
          }}
        >
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                top: floor * ((i + 1) / 9) ** 2.2,
                width: '100%',
                height: 2,
                backgroundColor: line,
              }}
            />
          ))}
        </div>

        {/* the section, huge and hollow, tilted behind everything */}
        <div
          style={{
            position: 'absolute',
            top: 96,
            left: -30,
            display: 'flex',
            whiteSpace: 'nowrap',
            fontFamily: 'Young Serif',
            fontSize: 330,
            lineHeight: 1,
            letterSpacing: -10,
            color: 'transparent',
            WebkitTextStroke: '3px rgba(255, 214, 170, 0.2)',
            transform: 'rotate(-7deg)',
          }}
        >
          {section}
        </div>

        {/* the sun the floor runs toward, and its glow, which is its own layer so the stripes do not cut it */}
        <div
          style={{
            position: 'absolute',
            right: 10,
            bottom: floor - 110,
            width: 480,
            height: 480,
            backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255, 106, 43, 0.6), transparent 68%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 120,
            bottom: floor,
            width: 260,
            height: 260,
            borderRadius: 999,
            backgroundImage: `linear-gradient(to bottom, ${gold}, ${ember} 55%, ${rose})`,
            maskImage:
              'linear-gradient(to bottom, black 0%, black 52%, transparent 52%, transparent 56%, black 56%, black 66%, transparent 66%, transparent 72%, black 72%, black 80%, transparent 80%, transparent 88%, black 88%, black 93%, transparent 93%)',
          }}
        />

        <div
          style={{
            ...fill,
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '56px 68px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- drawn into an image, not a page */}
            <img src={logoSrc} width={60} height={60} alt="" />
            <div style={{ fontFamily: 'Young Serif', fontSize: 46, letterSpacing: -1 }}>Plotra</div>
            <div
              style={{
                display: 'flex',
                marginLeft: 8,
                padding: '8px 22px',
                borderRadius: 999,
                backgroundColor: gold,
                color: ink,
                fontSize: 24,
                letterSpacing: 4,
                transform: 'rotate(-4deg)',
                boxShadow: `6px 6px 0 ${rose}`,
              }}
            >
              DOCS
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 770 }}>
            <div
              style={{
                display: 'block',
                fontFamily: 'Young Serif',
                fontSize: title.length > 28 ? 76 : 100,
                lineHeight: 1.02,
                letterSpacing: -3,
                color: '#fff6ec',
                textShadow: `0 0 4px #fff6ec, 0 0 26px ${ember}, 0 0 70px ${ember}, 5px 5px 0 ${rose}`,
                lineClamp: 3,
              }}
            >
              {title}
            </div>
            {page.data.description && (
              <div
                style={{
                  display: 'block',
                  marginTop: 26,
                  maxWidth: 740,
                  fontSize: 28,
                  lineHeight: 1.35,
                  color: 'rgba(255, 240, 224, 0.86)',
                  lineClamp: 2,
                  textOverflow: 'ellipsis',
                }}
              >
                {page.data.description}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: 'rgba(255, 240, 224, 0.8)' }}>
            <div style={{ width: 44, height: 4, borderRadius: 4, backgroundColor: gold }} />
            Write your novel and build its world in one place.
          </div>
        </div>

        <div style={{ ...fill, filter: grain, mixBlendMode: 'overlay', opacity: 0.5 }} />
      </div>
    ),
    {
      ...size,
      format: 'webp',
      quality: 82,
      fonts: [
        { name: 'Young Serif', data: youngSerif, style: 'normal', weight: 400 },
        { name: 'Inter', data: inter, style: 'normal', weight: 400 },
      ],
    },
  );
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImageUrl(page).segments,
  }));
}
