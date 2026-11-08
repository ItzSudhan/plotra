import Image from "next/image";
import { Icon } from "@plotra/icons";
import { cn } from "@/lib/cn";
import type { ViewId } from "./layouts";
import { sketches } from "./sketches";
import { kinds, sceneSpots, type StoryScene } from "./story";

// What a scene looks like in each view, drawn the way the app draws it
// (apps/app/components/views). The box around it is the showcase's to move.

type FaceProps = { scene: StoryScene; i: number; picked: boolean; compact: boolean };

/** The app's selection ring. */
const ring = "ring-2 ring-ember/60";

function Manuscript({ scene, picked, compact }: FaceProps) {
  return (
    <div
      className={cn(
        "h-full overflow-hidden border-l-2 pl-4 transition-colors duration-500",
        picked ? "border-ember" : "border-transparent",
      )}
    >
      <p className="font-display text-[19px] leading-tight text-fg">{scene.title}</p>
      <p
        className={cn(
          "mt-1 line-clamp-2 font-prose leading-[1.55] text-fg/75",
          compact ? "text-[14px]" : "text-[15.5px]",
        )}
      >
        {scene.prose.map((part, i) =>
          typeof part === "string" ? (
            part
          ) : (
            <span key={i} className="font-medium text-ember underline decoration-ember/35 decoration-dotted underline-offset-4">
              {part.link}
            </span>
          ),
        )}
      </p>
    </div>
  );
}

function Corkboard({ scene, i, picked, compact }: FaceProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-sm bg-card shadow-[0_1px_2px_rgb(0_0_0/0.08),0_6px_16px_-8px_rgb(0_0_0/0.25)] transition-shadow duration-500",
        picked && ring,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-rose/30 px-3 py-2">
        <span className="text-[11px] text-faint tabular-nums">{i + 1}</span>
        {!compact && <Icon name="clapperboard-text-linear" className="size-3.5 shrink-0 text-muted" />}
        <span className={cn("min-w-0 flex-1 truncate font-display leading-tight", compact ? "text-[14px]" : "text-[15.5px]")}>
          {scene.title}
        </span>
        <span className="size-2 shrink-0 rounded-full bg-gold" />
      </div>
      <p
        className="flex-1 px-3 py-[7px] font-prose text-[14.5px] leading-[22px] text-fg/85"
        style={{ backgroundImage: "repeating-linear-gradient(transparent 0 21px, rgb(16 154 130 / 0.14) 21px 22px)" }}
      >
        {scene.synopsis}
      </p>
    </div>
  );
}

function Grid({ scene, picked }: FaceProps) {
  return (
    <div
      className={cn(
        "h-full overflow-hidden border-r border-b border-fg/10 px-3 py-2 transition-colors duration-500",
        picked && "bg-ember/[0.07]",
      )}
    >
      <p className="flex items-center gap-1.5 text-[13px] font-medium">
        <span className="size-1.5 shrink-0 rounded-full bg-gold" />
        <span className="truncate">{scene.title}</span>
      </p>
      <p className="mt-0.5 line-clamp-2 pl-3 text-xs leading-snug text-muted">{scene.synopsis}</p>
    </div>
  );
}

function Timeline({ scene, picked }: FaceProps) {
  return (
    <div
      className={cn(
        "flex h-full items-center gap-1.5 overflow-hidden rounded-md border border-ember/40 bg-[#fbe1d6] px-1.5 text-xs transition-shadow duration-500",
        picked && cn(ring, "shadow-lg"),
      )}
    >
      <span className="h-4 w-1 shrink-0 rounded-full bg-ember" />
      <Icon name="clapperboard-text-linear" className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{scene.title}</span>
    </div>
  );
}

function Storyboard({ scene, i, picked }: FaceProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border border-fg/15 bg-card shadow-sm transition-shadow duration-500",
        picked && ring,
      )}
    >
      <div className="relative min-h-0 flex-1 bg-well">
        <Image
          src={sketches[i]}
          alt=""
          fill
          sizes="(max-width: 640px) 45vw, 210px"
          draggable={false}
          className={cn("object-cover transition-opacity duration-500", !picked && "opacity-80")}
        />
        <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-px text-[10px] font-medium text-white">
          {scene.shot}
        </span>
      </div>
      <p className="shrink-0 truncate px-2.5 py-1.5 text-xs leading-snug">{scene.title}</p>
    </div>
  );
}

/** A note in the graph: a dot in its kind's colour, named beside it. */
export function GraphNode({
  label,
  color,
  fx,
  lit,
  big,
  compact,
}: {
  label: string;
  color: string;
  /** How far across the canvas it sits: notes on the right are named on their left, so the name stays on the canvas. */
  fx: number;
  lit: boolean;
  big?: boolean;
  compact: boolean;
}) {
  return (
    <div className="relative size-full">
      <span
        className={cn("block size-full rounded-full transition-[background-color,scale] duration-500", big && "scale-[1.3]")}
        // Faded towards the page rather than made see-through, so the links behind it don't show.
        style={{ backgroundColor: lit ? color : `color-mix(in oklab, ${color} 38%, var(--color-canvas))` }}
      />
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 text-[11px] leading-tight font-medium transition-opacity duration-500",
          fx > 0.6 ? "right-full mr-1.5 text-right" : "left-full ml-1.5",
          compact ? "w-max max-w-24" : "whitespace-nowrap",
          !lit && "opacity-40",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function Graph({ scene, i, picked, compact }: FaceProps) {
  return <GraphNode label={scene.title} color={kinds.scene.color} fx={sceneSpots[i][0]} lit={picked} big={picked} compact={compact} />;
}

export const faces: Record<ViewId, (props: FaceProps) => React.ReactNode> = {
  manuscript: Manuscript,
  corkboard: Corkboard,
  grid: Grid,
  timeline: Timeline,
  storyboard: Storyboard,
  graph: Graph,
};
