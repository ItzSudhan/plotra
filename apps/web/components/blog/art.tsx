// The drawing that heads each post, and sits on its link card. Each is plain
// SVG on an 800 by 450 sheet, in the site's own colours, built from host
// elements only (no components, no <text>, no filters) so that the same
// drawing can be put into the Open Graph image.

const ink = "#161412";
const paper = "#f7f6f3";
const card = "#ffffff";
const well = "#ebe8e1";
const edge = "#dedad2";
const ember = "#e2602a";
const gold = "#b98021";
const violet = "#7556d6";
const teal = "#109a82";
const rose = "#d5467f";
const sky = "#2a86d1";

/** Lines of writing, as bars. `widths` are fractions of `w`. */
function lines(key: string, x: number, y: number, w: number, widths: number[], color = well, h = 8, gap = 18) {
  return widths.map((f, i) => <rect key={`${key}${i}`} x={x} y={y + i * gap} width={w * f} height={h} rx={h / 2} fill={color} />);
}

/** A sheet of paper lying on the desk, with the shadow it casts. */
function sheet(key: string, x: number, y: number, w: number, h: number, r = 14, turn = 0) {
  const transform = turn ? `rotate(${turn} ${x + w / 2} ${y + h / 2})` : undefined;
  return (
    <g key={key} transform={transform}>
      <rect x={x + 3} y={y + 6} width={w} height={h} rx={r} fill={ink} opacity={0.07} />
      <rect x={x} y={y} width={w} height={h} rx={r} fill={card} stroke={edge} strokeWidth={1.5} />
    </g>
  );
}

/** A co-writer's caret with its name flag. */
function caret(key: string, x: number, y: number, color: string, w: number) {
  return (
    <g key={key}>
      <rect x={x} y={y} width={3} height={26} rx={1.5} fill={color} />
      <rect x={x} y={y - 20} width={w} height={20} rx={5} fill={color} />
      <rect x={x + 8} y={y - 13} width={w - 16} height={6} rx={3} fill={card} opacity={0.9} />
    </g>
  );
}

// A story bible: one character's page, linked to the places, people and things around it.
function bible() {
  const around: [number, number, string, number][] = [
    [70, 60, teal, -4],
    [560, 48, violet, 3],
    [50, 270, gold, 3],
    [580, 262, rose, -3],
  ];
  return (
    <g>
      {around.map(([x, y], i) => (
        <path
          key={`l${i}`}
          d={`M400 225 Q ${(400 + x + 85) / 2} ${y + 60 + (i < 2 ? -50 : 50)} ${x + 85} ${y + 60}`}
          fill="none"
          stroke={ember}
          strokeWidth={2.5}
          strokeDasharray="2 9"
          strokeLinecap="round"
        />
      ))}
      {around.map(([x, y, color, turn], i) => (
        <g key={`c${i}`} transform={`rotate(${turn} ${x + 85} ${y + 60})`}>
          {sheet(`s${i}`, x, y, 170, 120)}
          <rect x={x + 16} y={y + 16} width={30} height={30} rx={9} fill={color} opacity={0.16} />
          <circle cx={x + 31} cy={y + 31} r={6} fill={color} />
          <rect x={x + 56} y={y + 26} width={80} height={10} rx={5} fill={ink} opacity={0.75} />
          {lines(`t${i}`, x + 16, y + 64, 138, [1, 0.8, 0.55], well, 7, 16)}
        </g>
      ))}
      {sheet("main", 285, 70, 230, 310, 18)}
      <circle cx={335} cy={122} r={26} fill={ember} opacity={0.14} />
      <circle cx={335} cy={114} r={9} fill={ember} />
      <path d="M319 138 a16 14 0 0 1 32 0 Z" fill={ember} />
      <rect x={375} y={104} width={104} height={13} rx={6.5} fill={ink} />
      <rect x={375} y={128} width={66} height={8} rx={4} fill={well} />
      <rect x={309} y={172} width={182} height={1.5} fill={edge} />
      {[0, 1, 2].map((i) => (
        <g key={`p${i}`}>
          <rect x={309} y={192 + i * 28} width={52} height={8} rx={4} fill={edge} />
          <rect x={377} y={192 + i * 28} width={[86, 60, 104][i]} height={8} rx={4} fill={i === 1 ? ember : well} opacity={i === 1 ? 0.7 : 1} />
        </g>
      ))}
      <rect x={309} y={282} width={182} height={1.5} fill={edge} />
      {lines("b", 309, 302, 182, [1, 0.92, 0.6], well, 8, 20)}
    </g>
  );
}

// An outline: scene cards on a board, one of them lifted to be moved.
function cards() {
  const stripes = [ember, violet, teal, gold];
  const grid: [number, number, number][] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) grid.push([c, r, (c + r * 3) % 4]);
  return (
    <g>
      {grid.map(([c, r, s], i) => {
        const x = 62 + c * 174;
        const y = 44 + r * 126;
        // The gap the lifted card came from.
        if (c === 2 && r === 1) {
          return <rect key={i} x={x} y={y} width={152} height={104} rx={12} fill="none" stroke={ink} strokeOpacity={0.18} strokeWidth={2} strokeDasharray="7 7" />;
        }
        return (
          <g key={i} transform={`rotate(${[-1.2, 0.8, -0.5, 1.4][(c + r) % 4]} ${x + 76} ${y + 52})`}>
            {sheet(`s${i}`, x, y, 152, 104, 12)}
            <rect x={x + 14} y={y + 14} width={34} height={7} rx={3.5} fill={stripes[s]} />
            <rect x={x + 14} y={y + 34} width={[96, 78, 110, 88][(c * 2 + r) % 4]} height={10} rx={5} fill={ink} opacity={0.78} />
            {lines(`t${i}`, x + 14, y + 58, 124, [1, 0.7], well, 7, 15)}
          </g>
        );
      })}
      <g transform="rotate(-9 506 180)">
        <rect x={436} y={142} width={152} height={104} rx={12} fill={ink} opacity={0.12} />
        <rect x={424} y={122} width={152} height={104} rx={12} fill={card} stroke={ember} strokeWidth={2.5} />
        <rect x={438} y={136} width={34} height={7} rx={3.5} fill={ember} />
        <rect x={438} y={156} width={102} height={10} rx={5} fill={ink} opacity={0.78} />
        {lines("lift", 438, 180, 124, [1, 0.7], well, 7, 15)}
      </g>
    </g>
  );
}

// A timeline: a lane for each character, and the day the story has reached.
function timeline() {
  const lanes: [string, [number, number][]][] = [
    [violet, [[110, 150], [300, 90], [470, 210]]],
    [teal, [[170, 110], [330, 200], [600, 110]]],
    [gold, [[110, 70], [230, 130], [520, 160]]],
  ];
  return (
    <g>
      {sheet("board", 50, 50, 700, 350, 20)}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={`d${i}`}>
          <rect x={110 + i * 130} y={84} width={1.5} height={286} fill={edge} />
          <rect x={118 + i * 130} y={78} width={46} height={8} rx={4} fill={i === 3 ? ember : edge} />
        </g>
      ))}
      {lanes.map(([color, bars], l) => (
        <g key={`l${l}`}>
          <circle cx={80} cy={152 + l * 78} r={11} fill={color} opacity={0.2} />
          <circle cx={80} cy={152 + l * 78} r={5} fill={color} />
          {bars.map(([x, w], b) => (
            <g key={b}>
              <rect x={x} y={134 + l * 78} width={w} height={36} rx={10} fill={color} opacity={0.14} />
              <rect x={x} y={134 + l * 78} width={5} height={36} rx={2.5} fill={color} />
              <rect x={x + 16} y={148 + l * 78} width={Math.min(w - 32, 90)} height={8} rx={4} fill={color} opacity={0.75} />
            </g>
          ))}
        </g>
      ))}
      <rect x={499} y={66} width={3} height={316} rx={1.5} fill={ember} />
      <circle cx={500.5} cy={66} r={7} fill={ember} />
    </g>
  );
}

// A plot hole: scenes on their threads, and the one thread that was dropped.
function thread() {
  const xs = [110, 255, 400, 545, 690];
  return (
    <g>
      <path d="M110 120 C 180 120 185 150 255 150 S 330 105 400 105 S 475 150 545 150 S 620 120 690 120" fill="none" stroke={violet} strokeWidth={5} strokeLinecap="round" />
      <path d="M110 330 C 180 330 185 300 255 300 S 330 340 400 340 S 475 305 545 305 S 620 330 690 330" fill="none" stroke={teal} strokeWidth={5} strokeLinecap="round" />
      <path d="M110 225 C 170 225 195 225 255 225 S 300 225 318 225" fill="none" stroke={ember} strokeWidth={5} strokeLinecap="round" />
      <path d="M482 225 L 545 225 S 630 225 690 225" fill="none" stroke={ember} strokeWidth={5} strokeLinecap="round" />
      <path d="M330 225 L 470 225" fill="none" stroke={ember} strokeWidth={4} strokeLinecap="round" strokeDasharray="1 13" opacity={0.6} />
      {xs.map((x, i) => (
        <g key={i}>
          {[[120, violet], [225, ember], [330, teal]].map(([y, color], t) => {
            const cy = (y as number) + (t === 0 ? [0, 30, -15, 30, 0][i] : t === 2 ? [0, -30, 10, -25, 0][i] : 0);
            const lost = t === 1 && i === 2;
            return lost ? null : (
              <g key={t}>
                <circle cx={x} cy={cy} r={15} fill={card} stroke={color as string} strokeWidth={4} />
                <circle cx={x} cy={cy} r={5} fill={color as string} />
              </g>
            );
          })}
        </g>
      ))}
      <circle cx={400} cy={225} r={40} fill={ember} opacity={0.12} />
      <circle cx={400} cy={225} r={26} fill={card} stroke={ember} strokeWidth={4} strokeDasharray="6 7" />
      <rect x={396.5} y={210} width={7} height={19} rx={3.5} fill={ember} />
      <circle cx={400} cy={238} r={4} fill={ember} />
    </g>
  );
}

// Co-writing: one page, two carets, and a suggestion waiting to be accepted.
function desk() {
  return (
    <g>
      {sheet("page", 150, 34, 500, 400, 18)}
      <rect x={196} y={76} width={210} height={16} rx={8} fill={ink} />
      {lines("a", 196, 122, 408, [1, 0.94, 0.98, 0.5], well, 9, 24)}
      <rect x={196} y={228} width={236} height={22} rx={5} fill={violet} opacity={0.16} />
      {lines("b", 196, 234, 408, [0.56], violet, 9, 24)}
      <rect x={444} y={234} width={150} height={9} rx={4.5} fill={well} />
      {lines("c", 196, 258, 408, [0.9, 1], well, 9, 24)}
      <rect x={196} y={306} width={120} height={9} rx={4.5} fill={ink} opacity={0.25} />
      <rect x={190} y={309.5} width={132} height={2.5} rx={1} fill={ember} />
      <rect x={328} y={300} width={168} height={21} rx={5} fill={ember} opacity={0.14} />
      <rect x={334} y={306} width={156} height={9} rx={4.5} fill={ember} opacity={0.8} />
      {lines("d", 196, 354, 408, [0.96, 0.4], well, 9, 24)}
      {caret("one", 432, 226, violet, 66)}
      {caret("two", 498, 298, ember, 46)}
    </g>
  );
}

// Beta readers: the page, and what readers left in its margin.
function margin() {
  const notes: [number, string, number][] = [
    [80, gold, 0.8],
    [196, rose, 0.6],
    [312, sky, 0.9],
  ];
  return (
    <g>
      {sheet("page", 70, 34, 420, 400, 18)}
      <rect x={110} y={74} width={170} height={15} rx={7.5} fill={ink} />
      {lines("a", 110, 118, 340, [1, 0.95], well, 9, 24)}
      <rect x={104} y={160} width={352} height={46} rx={7} fill={gold} opacity={0.2} />
      {lines("b", 110, 166, 340, [1, 0.72], gold, 9, 24)}
      {lines("c", 110, 214, 340, [0.97, 1, 0.45], well, 9, 24)}
      <rect x={104} y={292} width={230} height={22} rx={7} fill={rose} opacity={0.16} />
      {lines("d", 110, 298, 340, [0.64], rose, 9, 24)}
      {lines("e", 110, 322, 340, [1, 0.9, 0.6], well, 9, 24)}
      {notes.map(([y, color, w], i) => (
        <g key={i}>
          <path d={`M490 ${y + 34} L 530 ${y + 34}`} stroke={color} strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />
          {sheet(`n${i}`, 530, y, 200, 92, 14)}
          <circle cx={556} cy={y + 26} r={11} fill={color} opacity={0.22} />
          <circle cx={556} cy={y + 26} r={5} fill={color} />
          <rect x={576} y={y + 21} width={70} height={9} rx={4.5} fill={ink} opacity={0.7} />
          {lines(`t${i}`, 548, y + 50, 164, [1, w], well, 7, 16)}
        </g>
      ))}
      <g>
        <rect x={348} y={286} width={64} height={34} rx={17} fill={card} stroke={edge} strokeWidth={1.5} />
        <path d="M366 299 c0 -7 9 -7 9 -1 c0 -6 9 -6 9 1 c0 6 -9 11 -9 11 s-9 -5 -9 -11 Z" fill={rose} />
        <rect x={392} y={299} width={10} height={8} rx={4} fill={edge} />
      </g>
    </g>
  );
}

// A campaign: the game master's whole map, and the part the table has seen.
function map() {
  return (
    <g>
      {sheet("map", 50, 40, 700, 370, 20)}
      <path d="M50 180 C 160 150 200 250 300 230 S 420 120 500 160 S 640 300 750 250" fill="none" stroke={sky} strokeOpacity={0.3} strokeWidth={26} strokeLinecap="butt" />
      <path d="M50 180 C 160 150 200 250 300 230 S 420 120 500 160 S 640 300 750 250" fill="none" stroke={sky} strokeOpacity={0.55} strokeWidth={3} />
      {[[150, 300], [196, 318], [118, 330]].map(([x, y], i) => (
        <path key={`m${i}`} d={`M${x - 26} ${y + 22} L ${x} ${y - 22} L ${x + 26} ${y + 22} Z`} fill={well} stroke={ink} strokeOpacity={0.35} strokeWidth={2} strokeLinejoin="round" />
      ))}
      {[[556, 96], [600, 110], [640, 92]].map(([x, y], i) => (
        <path key={`n${i}`} d={`M${x - 22} ${y + 20} L ${x} ${y - 20} L ${x + 22} ${y + 20} Z`} fill={well} stroke={ink} strokeOpacity={0.35} strokeWidth={2} strokeLinejoin="round" />
      ))}
      <g>
        <rect x={216} y={108} width={22} height={34} fill={card} stroke={ink} strokeOpacity={0.6} strokeWidth={2} />
        <rect x={238} y={120} width={40} height={22} fill={card} stroke={ink} strokeOpacity={0.6} strokeWidth={2} />
        <path d="M212 108 L 227 88 L 242 108 Z" fill={ember} />
        <rect x={252} y={130} width={10} height={12} fill={ink} opacity={0.5} />
      </g>
      <path d="M262 160 C 300 200 340 200 372 176 S 450 240 520 232 S 590 300 628 318" fill="none" stroke={ink} strokeOpacity={0.6} strokeWidth={3} strokeDasharray="9 9" strokeLinecap="round" />
      <path d="M616 306 L 640 330 M640 306 L 616 330" stroke={ember} strokeWidth={5} strokeLinecap="round" />
      <circle cx={372} cy={176} r={8} fill={card} stroke={ink} strokeOpacity={0.6} strokeWidth={2.5} />
      {/* What the table has not reached: kept from them until its session. */}
      <path d="M452 40 L 730 40 Q 750 40 750 60 L 750 390 Q 750 410 730 410 L 404 410 Z" fill={paper} opacity={0.86} />
      <path d="M452 40 L 404 410" stroke={ember} strokeWidth={3} strokeDasharray="3 10" strokeLinecap="round" />
      {[0, 1, 2].map((i) => (
        <rect key={`r${i}`} x={[560, 500, 590][i]} y={[150, 250, 340][i]} width={[110, 84, 96][i]} height={12} rx={6} fill={edge} />
      ))}
      <g>
        <rect x={434} y={196} width={44} height={44} rx={22} fill={ember} />
        <path d="M444 218 q12 -13 24 0 q-12 13 -24 0 Z" fill="none" stroke={card} strokeWidth={2.5} strokeLinejoin="round" />
        <circle cx={456} cy={218} r={3.5} fill={card} />
        <path d="M446 230 L 466 206" stroke={card} strokeWidth={2.5} strokeLinecap="round" />
      </g>
    </g>
  );
}

const drawings = { bible, cards, timeline, thread, desk, margin, map };

export type ArtName = keyof typeof drawings;

/** The drawing as a bare <svg>, for the Open Graph image as well as the page. */
export function blogArt(name: ArtName, props?: React.SVGProps<SVGSVGElement>) {
  const draw = drawings[name] ?? drawings.cards;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" {...props}>
      <rect width={800} height={450} fill={paper} />
      {draw()}
    </svg>
  );
}

export function BlogArt({ name, className }: { name: ArtName; className?: string }) {
  return blogArt(name, { className, "aria-hidden": true });
}
