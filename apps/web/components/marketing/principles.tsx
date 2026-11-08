import { Icon, type IconName } from "@plotra/icons";
import { Reveal } from "./reveal";

const items: [IconName, string, string][] = [
  ["heart-bold-duotone", "Nothing locked", "Every view and module is on the Free plan. Pro is more room, more collaborators and hosted AI, at one price for the whole workspace."],
  ["export-bold-duotone", "Leave any time", "Export everything whenever you like. No limit ever blocks it, and going back to Free deletes nothing."],
  ["document-text-bold-duotone", "Yours", "You own what you write. We never train AI on it."],
  ["cloud-check-bold-duotone", "Keeps your edits", "Edits are cached in your browser and merged when you reconnect, and versions can be restored."],
];

export function Principles() {
  return (
    <section className="px-4 py-16">
      <div className="mx-auto grid max-w-6xl gap-px overflow-hidden rounded-[28px] border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([icon, title, body], i) => (
          <Reveal key={title} delay={i * 0.06} className="group bg-white p-7">
            <Icon
              name={icon}
              className="origin-bottom-left text-3xl text-black transition-[rotate,scale,color] duration-300 ease-out group-hover:scale-110 group-hover:-rotate-6 group-hover:text-ember"
            />
            <p className="mt-4 font-display text-3xl text-black">{title}</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-gray">{body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
