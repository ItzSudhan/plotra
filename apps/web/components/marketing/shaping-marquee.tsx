import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@/lib/cn";

// What a project can be given, and what about it can be changed: nothing here is on until it's asked for.
const rowA: [IconName, string][] = [
  ["earth-bold-duotone", "World bible"],
  ["rocket-bold-duotone", "Releases & reveals"],
  ["eye-bold-duotone", "Who knows what"],
  ["shield-check-bold-duotone", "Continuity checks"],
  ["square-academic-cap-bold-duotone", "Research & sources"],
  ["clipboard-list-bold-duotone", "Review & editorial"],
  ["export-bold-duotone", "Publishing"],
];
const rowB: [IconName, string][] = [
  ["widget-4-bold-duotone", "Your own ribbon"],
  ["document-text-bold-duotone", "Your own words for things"],
  ["sticker-square-bold-duotone", "Colour labels"],
  ["calendar-bold-duotone", "Custom calendars"],
  ["planet-bold-duotone", "Your own entity types"],
  ["flag-bold-duotone", "Your own workflow"],
  ["folder-with-files-bold-duotone", "Project templates"],
];

function Row({ items, reverse }: { items: [IconName, string][]; reverse?: boolean }) {
  const doubled = [...items, ...items, ...items, ...items];
  return (
    <div className="flex overflow-hidden mask-fade-x">
      {/* The row stops under the pointer, so a medium can be read. */}
      <div
        className={cn(
          "flex w-max shrink-0 gap-3 py-1.5 hover:[animation-play-state:paused]",
          reverse ? "animate-marquee-reverse" : "animate-marquee",
        )}
      >
        {doubled.map(([icon, label], i) => (
          <span
            key={i}
            className="group flex items-center gap-3 rounded-full border border-hairline bg-white px-5 py-3 text-[15px] whitespace-nowrap text-gray transition-[color,border-color,translate] duration-300 hover:-translate-y-0.5 hover:border-black/20 hover:text-black"
          >
            <Icon name={icon} className="text-xl text-black transition-[color,rotate] duration-300 group-hover:-rotate-12 group-hover:text-ember" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ShapingMarquee() {
  return (
    <section className="relative py-16">
      <div className="space-y-3">
        <Row items={rowA} />
        <Row items={rowB} reverse />
      </div>
      <p className="mx-auto mt-10 max-w-xl px-6 text-center text-[14.5px] leading-relaxed text-gray text-pretty">
        Script formats, branching dialogue and translation tools are in the app too, off until you switch them on.
      </p>
    </section>
  );
}
