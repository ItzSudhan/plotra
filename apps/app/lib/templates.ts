import type { NodeKind, PropertyOptions, PropertyType } from "@plotra/db/schema";
import { researchKeys, sourceTypeChoices } from "./citations";

// Default templates per node kind (plan.md 2.4): the properties every new
// project starts with, and the starting body for a new note of that kind.

export type PropertyTemplate = { key: string; label: string; type: PropertyType; options?: PropertyOptions };

export const defaultProperties: Partial<Record<NodeKind, PropertyTemplate[]>> = {
  character: [
    {
      key: "role",
      label: "Role",
      type: "select",
      options: { choices: ["Protagonist", "Antagonist", "Supporting", "Minor"] },
    },
    { key: "age", label: "Age", type: "text" },
    { key: "arc", label: "Arc", type: "text" },
    { key: "first-appearance", label: "First appearance", type: "node", options: { nodeKinds: ["chapter", "scene"] } },
    // Story dates (in the timeline's calendar), read by the continuity checks.
    { key: "birth-date", label: "Born", type: "text" },
    { key: "death-date", label: "Died", type: "text" },
  ],
  location: [
    {
      key: "type",
      label: "Type",
      type: "select",
      options: { choices: ["World", "Region", "City", "Building", "Room", "Other"] },
    },
    { key: "region", label: "Region", type: "node", options: { nodeKinds: ["location"] } },
  ],
  scene: [
    { key: "pov", label: "POV", type: "node", options: { nodeKinds: ["character"] } },
    { key: "location", label: "Location", type: "node", options: { nodeKinds: ["location"] } },
    { key: "story-date", label: "Story date", type: "text" },
    { key: "duration", label: "Duration", type: "text" },
    { key: "plot-threads", label: "Plot threads", type: "multi_select", options: { choices: [] } },
  ],
  chapter: [{ key: "target-words", label: "Target words", type: "number" }],
  // A research note is a source: its title is the work's title and these make up
  // its reference (lib/citations.ts). "Year" also takes a full date, 2019-03-04.
  research: [
    { key: researchKeys.type, label: "Type", type: "select", options: { choices: [...sourceTypeChoices] } },
    { key: researchKeys.authors, label: "Authors", type: "text" },
    { key: researchKeys.container, label: "Published in", type: "text" },
    { key: researchKeys.publisher, label: "Publisher", type: "text" },
    { key: researchKeys.year, label: "Year", type: "text" },
    { key: researchKeys.volume, label: "Volume (issue)", type: "text" },
    { key: researchKeys.pages, label: "Pages", type: "text" },
    { key: researchKeys.url, label: "URL", type: "url" },
    { key: researchKeys.accessed, label: "Accessed", type: "date" },
    { key: researchKeys.identifier, label: "DOI / ISBN", type: "text" },
    { key: "verified", label: "Fact-checked", type: "checkbox" },
  ],
};

type Block = { type: string; children: Array<{ text: string }> };
const h2 = (text: string): Block => ({ type: "h2", children: [{ text }] });
const p = (text = ""): Block => ({ type: "p", children: [{ text }] });

/** The body of a note with no template. */
export const emptyDocument: Block[] = [p()];

/** The starting body for a new note of each kind (character sheet, location…). */
export const bodyTemplates: Partial<Record<NodeKind, Block[]>> = {
  character: [h2("Appearance"), p(), h2("Personality"), p(), h2("Backstory"), p(), h2("Wants and needs"), p()],
  location: [h2("Description"), p(), h2("History"), p(), h2("Who's here"), p()],
  research: [h2("Summary"), p(), h2("Notes"), p()],
};
