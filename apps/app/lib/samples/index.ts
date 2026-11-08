import type { SampleId } from "./catalog";
import { romeoAndJuliet } from "./romeo-and-juliet";
import { ttrpgCampaign } from "./ttrpg-campaign";
import type { Sample } from "./types";

/** The sample projects, by catalog id. Server-side only in practice: the browser imports ./catalog. */
export const samples: Record<SampleId, Sample> = {
  "romeo-and-juliet": romeoAndJuliet,
  "ttrpg-campaign": ttrpgCampaign,
};

export { buildSample, type BuiltSample } from "./build";
export { isSampleId, sampleCatalog, type SampleId } from "./catalog";
export type { Sample } from "./types";
