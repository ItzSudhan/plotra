import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { trackOf, tracks, type Answers } from "@/lib/onboarding/tracks";

// The picture beside the Cold Open's questions (onboarding-plan.md 2.1): each
// answer becomes a note, and the notes are linked to the first document, which
// is what the project's real graph will show once it opens.

type GraphNode = { id: string; label: string; icon: IconName; x: number; y: number; main?: boolean };

const FIRST = "first";

function model(answers: Answers): { nodes: GraphNode[]; edges: Array<[string, string]> } {
  const extra = answers.extra ?? {};
  const nodes: GraphNode[] = [];
  const edges: Array<[string, string]> = [];
  const add = (node: GraphNode, to: string) => {
    nodes.push(node);
    edges.push([to, node.id]);
  };

  if (answers.who) add({ id: "who", label: answers.who, icon: "user-rounded-linear", x: 24, y: 24 }, FIRST);
  if (answers.where) add({ id: "where", label: answers.where, icon: "map-point-linear", x: 76, y: 24 }, FIRST);
  if (answers.drive) {
    const secret = answers.driveKind !== "goal";
    add({ id: "drive", label: answers.drive, icon: secret ? "incognito-linear" : "target-linear", x: 22, y: 76 }, answers.who ? "who" : FIRST);
  }
  if (extra.pov === "other" && extra.povText) add({ id: "pov", label: extra.povText, icon: "user-rounded-linear", x: 80, y: 74 }, FIRST);
  const players = (extra.players ?? "").split(",").map((name) => name.trim()).filter(Boolean).slice(0, 3);
  players.forEach((name, i) => add({ id: `pc${i}`, label: name, icon: "user-rounded-linear", x: 82, y: 58 + i * 14 }, FIRST));

  // The first document is there as soon as there is anything to link it to.
  if (nodes.length || answers.type) {
    const track = tracks[trackOf(answers.type ?? "novel")];
    nodes.unshift({ id: FIRST, label: answers.type ? track.firstDocument : "Your first page", icon: "pen-new-square-linear", x: 50, y: 50, main: true });
  }
  return { nodes, edges };
}

export function StoryGraph({ answers, className }: { answers: Answers; className?: string }) {
  const { nodes, edges } = model(answers);
  const at = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div aria-hidden className={cn("relative size-full dot-grid", className)}>
      {nodes.length === 0 && (
        <p className="absolute inset-0 grid place-items-center px-10 text-center font-display text-2xl text-faint">Your story takes shape here as you answer.</p>
      )}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full text-border">
        {edges.map(([from, to]) => {
          const a = at.get(from);
          const b = at.get(to);
          if (!a || !b) return null;
          return (
            <line
              key={`${from}-${to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              pathLength={1}
              strokeDasharray={1}
              stroke="currentColor"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              className="animate-draw [animation-duration:700ms] motion-reduce:animate-none"
            />
          );
        })}
      </svg>
      {nodes.map((node) => (
        // The outer element holds the position; the inner one rises into place.
        <div key={node.id} style={{ left: `${node.x}%`, top: `${node.y}%` }} className="absolute -translate-x-1/2 -translate-y-1/2">
          <div className="flex animate-rise flex-col items-center gap-1.5 motion-reduce:animate-none">
            <span
              className={cn(
                "grid place-items-center rounded-full border bg-card shadow-xs",
                node.main ? "size-14 border-ember/50 text-ember-ink" : "size-10 text-muted-foreground",
              )}
            >
              <Icon name={node.icon} className={node.main ? "size-6" : "size-[18px]"} />
            </span>
            <span className={cn("max-w-40 truncate rounded bg-background/80 px-1.5 text-ui-sm", node.main ? "font-medium" : "text-muted-foreground")}>{node.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
