import { afterEach, describe, expect, test } from "bun:test";
import { aiRemoved, NOTICE_DAYS, promiseState } from "@/lib/agent/no-ai";

// A firm "no AI" (lib/agent/no-ai.ts): the server-wide switch, and how a
// workspace's promise stands over time once it's made and once it's lifted.

const DAY = 86_400_000;
const since = new Date("2026-10-01T10:00:00Z");

describe("a promise of no AI", () => {
  test("none made: nothing to show", () => {
    expect(promiseState({ since: null, liftedAt: null })).toBeNull();
  });

  test("made: in force for as long as it isn't lifted", () => {
    const state = promiseState({ since, liftedAt: null, byName: "Asha" }, since.getTime() + 400 * DAY);
    expect(state).toMatchObject({ active: true, byName: "Asha", liftedAt: null, endsAt: null, since: since.toISOString() });
  });

  test("lifted: AI stays off for the notice, then may come back; the lifting is shown for 30 days", () => {
    const liftedAt = new Date(since.getTime() + 10 * DAY);
    const during = promiseState({ since, liftedAt, liftedByName: "Asha" }, liftedAt.getTime() + DAY);
    expect(during).toMatchObject({ active: true, liftedByName: "Asha", liftedAt: liftedAt.toISOString() });
    expect(new Date(during!.endsAt!).getTime()).toBe(liftedAt.getTime() + NOTICE_DAYS * DAY);

    const after = promiseState({ since, liftedAt }, liftedAt.getTime() + NOTICE_DAYS * DAY);
    expect(after?.active).toBe(false);
    expect(after?.liftedAt).toBe(liftedAt.toISOString());

    expect(promiseState({ since, liftedAt }, liftedAt.getTime() + 30 * DAY)).toBeNull();
  });
});

describe("PLOTRA_NO_AI", () => {
  const before = process.env.PLOTRA_NO_AI;
  afterEach(() => {
    if (before === undefined) delete process.env.PLOTRA_NO_AI;
    else process.env.PLOTRA_NO_AI = before;
  });

  test("takes AI out when set to a yes, and not otherwise", () => {
    for (const value of ["1", "true", "YES", " on "]) {
      process.env.PLOTRA_NO_AI = value;
      expect(aiRemoved()).toBe(true);
    }
    for (const value of ["", "0", "false", "no"]) {
      process.env.PLOTRA_NO_AI = value;
      expect(aiRemoved()).toBe(false);
    }
    delete process.env.PLOTRA_NO_AI;
    expect(aiRemoved()).toBe(false);
  });
});
