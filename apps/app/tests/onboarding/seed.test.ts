import { describe, expect, test } from "bun:test";
import { projectTypes } from "@plotra/db/schema";
import { seedFromAnswers } from "@/lib/onboarding/seed";
import { cleanAnswers, trackOf, type Answers } from "@/lib/onboarding/tracks";
import { buildSample } from "@/lib/samples/build";

// The Cold Open's answers become a project (onboarding-plan.md 2.1, 2.2).
// `buildSample` throws on a link, property or release that points nowhere, so
// building every track with and without each answer is the check that no
// combination of skipped questions leaves a dead reference.

const build = (answers: Answers) => {
  let n = 0;
  const seed = seedFromAnswers(cleanAnswers(answers));
  return { seed, built: buildSample(seed, { projectId: "project", userId: "user", newId: () => `id-${++n}` }) };
};

const full: Answers = { who: "Juliet Capulet", where: "Verona", drive: "They were married in secret. Nobody knows.", driveKind: "secret" };
const node = (built: ReturnType<typeof build>["built"], key: string) => built.nodes.find((n) => n.id === built.ids.get(key));

describe("seedFromAnswers", () => {
  test("every type builds, with every answer and with none", () => {
    for (const type of projectTypes) {
      for (const answers of [{ type }, { ...full, type }, { ...full, driveKind: "goal" as const, type }, { who: full.who, type }, { where: full.where, type }, { drive: full.drive, type }]) {
        const { seed, built } = build(answers);
        expect(seed.track).toBe(trackOf(type));
        expect(built.nodes.some((n) => n.id === built.openNodeId)).toBe(true);
      }
    }
  });

  test("with nothing answered it is an untitled project of one empty document", () => {
    const { seed, built } = build({});
    expect(seed.title).toBe("Untitled");
    expect(seed.type).toBe("novel");
    expect(built.nodes.filter((n) => n.kind === "scene")).toHaveLength(1);
    expect(built.nodes.some((n) => n.kind === "character" || n.kind === "location")).toBe(false);
    expect(built.links).toHaveLength(0);
  });

  test("a novel's first scene links to the character and the place", () => {
    const { seed, built } = build({ ...full, type: "novel", extra: { scope: "series", pov: "same" } });
    expect(seed.title).toBe("Untitled: Juliet Capulet in Verona");
    const scene = node(built, "first")!;
    const targets = built.links.filter((link) => link.sourceNodeId === scene.id && link.kind === "wiki").map((link) => link.targetNodeId);
    expect(targets).toEqual([built.ids.get("who")!, built.ids.get("where")!]);
    expect(scene.properties.pov).toBe(built.ids.get("who")!);
    expect(scene.canon).toBe("draft");
    // A series ships its first book, and the secret is one the character knows.
    expect(built.releases.map((r) => r.title)).toEqual(["Book 1"]);
    expect(node(built, "secret")!.title).toBe("They were married in secret");
    expect(built.knowledge).toHaveLength(1);
  });

  test("someone else's point of view becomes a second character", () => {
    const { built } = build({ ...full, type: "novel", extra: { pov: "other", povText: "Tybalt" } });
    expect(node(built, "pov")!.title).toBe("Tybalt");
    expect(node(built, "first")!.properties.pov).toBe(built.ids.get("pov")!);
  });

  test("a goal becomes a plot thread on the first scene, not a secret", () => {
    const { built } = build({ ...full, driveKind: "goal", type: "novel" });
    expect(built.ids.has("secret")).toBe(false);
    expect(built.threads).toHaveLength(1);
    expect(built.cells[0].nodeId).toBe(built.ids.get("first")!);
  });

  test("a campaign opens on session prep with a GM-only block and the players' characters", () => {
    const { built } = build({ ...full, type: "ttrpg", extra: { players: "Kestrel, Ansel, Kestrel", session: "They arrive at the ford." } });
    expect(node(built, "first")!.title).toBe("Session 1 prep");
    expect(built.nodes.filter((n) => n.synopsis === "Player character.").map((n) => n.title)).toEqual(["Kestrel", "Ansel"]);
    expect(built.facts.some((fact) => fact.reveal === "never")).toBe(true);
    expect(built.releases[0].kind).toBe("session");
  });

  test("a screenplay opens on a scene heading and cues the character", () => {
    const { built } = build({ ...full, type: "screenplay", extra: { form: "pilot", setting: "EXT." } });
    const scene = node(built, "first")!;
    expect(scene.settings.format).toBe("screenplay");
    expect(scene.content!.map((block) => block.type)).toEqual(["scene_heading", "action", "character", "dialogue"]);
    expect(scene.text).toContain("EXT. VERONA - DAY");
  });
});

describe("cleanAnswers", () => {
  test("keeps only strings, trimmed and cut to length, and drops what it doesn't know", () => {
    const answers = cleanAnswers({ who: `  ${"a".repeat(200)}  `, where: 42, type: "spaceship", driveKind: "other", extra: { scope: "trilogy" } });
    expect(answers.who).toHaveLength(80);
    expect(answers.where).toBeUndefined();
    expect(answers.type).toBeUndefined();
    expect(answers.driveKind).toBe("secret");
    expect(answers.extra).toEqual({});
  });

  test("keeps a track's answers only for the questions that track asks", () => {
    const answers = cleanAnswers({ type: "novel", who: "Juliet", extra: { scope: "series", pov: "other", povText: " Tybalt ", form: "film" } });
    expect(answers.extra).toEqual({ scope: "series", pov: "other", povText: "Tybalt" });
    expect(cleanAnswers("nonsense")).toEqual({ who: undefined, where: undefined, drive: undefined, driveKind: "secret", type: undefined, extra: {} });
  });
});
