import type { PropertyType, PropertyValue } from "@plotra/db/schema";

// A property's value as a few words, for the places that show it beside
// something else: a corkboard card, a plot grid column. Pure.

/** The value as text; empty for nothing. A `node` property names its notes, by `titleOf` (undefined for one the reader can't see). */
export function propertyText(type: PropertyType, value: PropertyValue | undefined, titleOf: (id: string) => string | undefined): string {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return "";
  if (type === "checkbox") return value ? "Yes" : "No";
  if (type === "node") return (Array.isArray(value) ? value : [String(value)]).flatMap((id) => titleOf(id) ?? []).join(", ");
  if (type === "url") return String(value).replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return Array.isArray(value) ? value.join(", ") : String(value);
}
