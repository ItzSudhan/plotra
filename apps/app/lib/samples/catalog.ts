import type { ProjectType } from "@plotra/db/schema";
import type { IconName } from "@plotra/icons";

// What the welcome screen and the new-project dialog show for each sample
// project (plan.md Phase 8 "Onboarding"; one per launch audience, plan.md 8.1).
// Kept apart from the samples themselves so the browser gets these few lines
// and not every scene.

export type SampleCard = {
  id: string;
  type: ProjectType;
  label: string;
  description: string;
  icon: IconName;
  /** The mistake left in on purpose, in the words of the sample's try-out (lib/onboarding/steps.ts). */
  tryout: { problem: string; fix: string };
};

export const sampleCatalog = [
  {
    id: "romeo-and-juliet",
    type: "novel",
    label: "Romeo and Juliet",
    description: "A novel in two parts, with the world of Verona, a secret and who knows it, and one continuity slip to find.",
    icon: "book-2-bold-duotone",
    tryout: {
      problem: "It reports one problem: in “The Balcony”, Romeo thinks of himself as a husband, the night before “The Secret Wedding”.",
      fix: "Near the end of the scene he calls himself “a husband already, though no one could know it”. Delete that thought, or just the link in it: they aren't married yet.",
    },
  },
  {
    id: "ttrpg-campaign",
    type: "ttrpg",
    label: "Tabletop RPG campaign",
    description: "Three sessions, NPCs with GM-only notes, a player-safe view of the world, and a mistake in next session's prep.",
    icon: "map-bold-duotone",
    tryout: {
      problem: "It reports a contradiction: Old Gar dies in the mill fire in session 2, and the guest list for “The Reeve's Dinner” in session 3 still seats him.",
      fix: "Under “Who is at the table”, take Old Gar off the list.",
    },
  },
] as const satisfies readonly SampleCard[];

export type SampleId = (typeof sampleCatalog)[number]["id"];

export const isSampleId = (id: string): id is SampleId => sampleCatalog.some((s) => s.id === id);
