import type { Client } from "./api";

// The first run's server calls (apps/app/app/api/mobile/onboarding): a first
// workspace, and the sample projects a first project can be.

export type SampleChoice = { id: string; type: string; label: string; description: string };

export const onboardingSamples = (client: Client) => client.request<{ samples: SampleChoice[] }>("/api/mobile/onboarding").then((r) => r.samples);

export const createFirstWorkspace = (client: Client, name: string) =>
  client.request<{ slug: string; name: string }>("/api/mobile/onboarding", { method: "POST", body: { action: "workspace", name } });

export const createSampleProject = (client: Client, workspace: string, sampleId: string) =>
  client.request<{ projectId: string; title: string }>("/api/mobile/onboarding", { method: "POST", body: { action: "sample", workspace, sampleId } });

/** Project types a first project is most often (apps/app/lib/project-types.ts), in the order they're offered. */
export const firstProjectTypes = ["novel", "short_story", "screenplay", "web_serial", "ttrpg", "comic", "stage_play", "podcast", "game", "nonfiction", "franchise"] as const;
