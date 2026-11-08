import { getIconData, iconToSVG } from "@iconify/utils";
import type { IconifyJSON } from "@iconify/types";
import subset from "./solar-subset.json";
import type { IconName } from "./registry";

const collection = subset as IconifyJSON;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const data = getIconData(collection, name);
  if (!data) return null;
  const { attributes, body } = iconToSVG(data);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={attributes.viewBox}
      width="1em"
      height="1em"
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

export type { IconName };

/** An icon as a standalone SVG document in one colour, for places that can't take inline markup (drawn link cards). */
export function iconSvg(name: IconName, color: string): string | null {
  const data = getIconData(collection, name);
  if (!data) return null;
  const { attributes, body } = iconToSVG(data);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${attributes.viewBox}" width="96" height="96">${body.replaceAll("currentColor", color)}</svg>`;
}
