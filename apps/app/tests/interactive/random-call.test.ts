import { describe, expect, test } from "bun:test";
import { checkDialogue } from "@/lib/interactive/check";
import { toInk, toJson, toTwee, toYarn } from "@/lib/interactive/export";
import { MAX_CALL_DEPTH, orderedNodes } from "@/lib/interactive/model";
import { choose, continuePlay, nextRandom, startPlay, type PlayState } from "@/lib/interactive/play";
import { barks, errands, graph } from "./fixtures";

const lines = (state: PlayState) => state.transcript.flatMap((e) => (e.kind === "line" ? [e.text] : []));
const onward = (g: ReturnType<typeof graph>, state: PlayState) => {
  let s = state;
  for (let i = 0; i < 50 && s.status === "line"; i++) s = continuePlay(g, s);
  return s;
};
const texts = (g: ReturnType<typeof graph>) => checkDialogue(g).map((p) => `${p.nodeId ?? "-"}: ${p.severity}: ${p.text}`);

describe("Random cards in the play-through", () => {
  test("a seed always picks the same, and stepping on from a kept state picks the same again", () => {
    const g = barks();
    const first = startPlay(g, { seed: 7 });
    expect(startPlay(g, { seed: 7 })).toEqual(first);
    expect(continuePlay(g, first)).toEqual(continuePlay(g, first));
    expect(first.transcript[0]).toMatchObject({ kind: "flow", nodeId: "r" });
  });

  test("every way is taken about as often as the others", () => {
    const g = barks();
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 3000; seed++) {
      const said = lines(startPlay(g, { seed }))[0];
      counts.set(said, (counts.get(said) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(["Halt!", "Stop right there.", "Who goes there?"]);
    for (const n of counts.values()) expect(Math.abs(n - 1000)).toBeLessThan(150);
  });

  test("the generator gives numbers in [0, 1) and moves on", () => {
    let seed = 1;
    for (let i = 0; i < 100; i++) {
      const roll = nextRandom(seed);
      expect(roll.value).toBeGreaterThanOrEqual(0);
      expect(roll.value).toBeLessThan(1);
      expect(roll.seed).not.toBe(seed);
      seed = roll.seed;
    }
  });

  test("landing on a choice offers it; with no jumps it stops", () => {
    const g = graph({ start: { type: "start" }, r: { type: "random" }, ch: { type: "choice", sid: "a_0001", text: "Run" } }, [
      ["start", "r"],
      ["r", "ch"],
    ]);
    expect(startPlay(g, { seed: 1 }).options.map((o) => o.text)).toEqual(["Run"]);
    const none = graph({ start: { type: "start" }, r: { type: "random" } }, [["start", "r"]]);
    expect(startPlay(none, { seed: 1 })).toMatchObject({ status: "ended", ending: "open" });
  });
});

describe("Call and Return cards in the play-through", () => {
  test("calls inside calls come back to where they were made", () => {
    const g = errands();
    let state = onward(g, startPlay(g));
    expect(state.calls).toEqual(["call1"]);
    expect(state.options.map((o) => o.text)).toEqual(["Any news?", "Nod.", "Leave for good."]);
    state = onward(g, choose(g, state, "ch1"));
    expect(lines(state)).toEqual(["Morning.", "Greetings. You've met me 1 times.", "Rain again.", "Off you go, then."]);
    expect(state).toMatchObject({ ending: "end", calls: [], variables: { met: 1 } });
  });

  test("an End inside a call ends the whole dialogue", () => {
    const g = errands();
    const state = onward(g, choose(g, onward(g, startPlay(g)), "ch3"));
    expect(lines(state)).toEqual(["Morning.", "Greetings. You've met me 1 times."]);
    expect(state).toMatchObject({ ending: "end", calls: ["call1"] });
  });

  test("a Return with nothing to go back to ends it, and says so", () => {
    const g = graph({ start: { type: "start" }, ret: { type: "return" } }, [["start", "ret"]]);
    const state = startPlay(g);
    expect(state.ending).toBe("end");
    expect(state.transcript).toEqual([{ kind: "problem", nodeId: "ret", text: "A Return with no Call to go back to, so the dialogue ends here." }]);
  });

  test("a call of nothing is passed by", () => {
    const g = graph({ start: { type: "start" }, c: { type: "call", target: "gone" }, l: { type: "line", sid: "a_0001", text: "After." } }, [
      ["start", "c"],
      ["c", "l"],
    ]);
    const state = startPlay(g);
    expect(state.transcript.map((e) => e.kind)).toEqual(["problem", "line"]);
  });

  test(`calls stop at ${MAX_CALL_DEPTH} inside one another`, () => {
    const g = graph({ start: { type: "start" }, c: { type: "call", target: "l" }, l: { type: "line", sid: "a_0001", text: "Again." } }, [
      ["start", "c"],
      ["l", "c"],
    ]);
    const state = onward(g, startPlay(g));
    expect(state.ending).toBe("stuck");
    expect(state.calls).toHaveLength(MAX_CALL_DEPTH);
    expect(lines(state)).toHaveLength(MAX_CALL_DEPTH);
    expect(state.transcript.at(-1)).toMatchObject({ kind: "problem", text: expect.stringContaining(`More than ${MAX_CALL_DEPTH} calls`) });
  });

  test("a called branch counts as reached, in reading order after its call", () => {
    const order = orderedNodes(errands());
    expect(order.indexOf("g0")).toBe(order.indexOf("call1") + 1);
  });
});

describe("checking Random and Call cards", () => {
  test("a finished dialogue with calls has nothing to report", () => {
    expect(texts(errands())).toEqual([]);
    expect(texts(barks())).toEqual([]);
  });

  test("a Random card with no jump, or only one", () => {
    const g = graph({ start: { type: "start" }, r: { type: "random" }, r2: { type: "random" }, e: { type: "end" } }, [
      ["start", "r"],
      ["start", "r2"],
      ["r2", "e"],
    ]);
    expect(texts(g)).toEqual([
      "r: error: A Random card needs jumps to pick from; this one has none.",
      "r2: warning: A Random card with only one jump always takes it. Add another for it to pick from.",
    ]);
  });

  test("calls of nothing, of a deleted card, of a branch with no Return; Returns without a call; calls of themselves", () => {
    const g = graph(
      {
        start: { type: "start" },
        a: { type: "call" },
        b: { type: "call", target: "gone" },
        c: { type: "call", target: "l" },
        ret: { type: "return" },
        l: { type: "line", sid: "a_0001", text: "No way back." },
        e: { type: "end" },
        d: { type: "call", target: "d" },
      },
      [
        ["start", "a"],
        ["a", "b"],
        ["b", "c"],
        ["c", "ret"],
        ["l", "e"],
        ["start", "d"],
        ["d", "e"],
      ],
    );
    expect(texts(g)).toEqual([
      "a: error: This Call card doesn't call any card yet. Pick one in its panel.",
      "b: error: The card this calls has been deleted. Pick another in its panel.",
      "c: warning: The branch this calls never reaches a Return card, so play never comes back here.",
      "ret: warning: Start reaches this Return without going through a Call, and there it ends the dialogue.",
      "d: warning: The branch this calls never reaches a Return card, so play never comes back here.",
      `d: warning: This call can end up calling itself. A play-through stops after ${MAX_CALL_DEPTH} calls inside one another.`,
    ]);
  });
});

describe("exporting Random and Call cards", () => {
  test("Ink: a shuffle of diverts, tunnels and ->->", () => {
    expect(toInk(barks(), { title: "T" })).toContain("=== random_r ===\n{~-> line_abcd_0001|-> line_abcd_0002|-> line_abcd_0003}");
    const ink = toInk(errands(), { title: "T" });
    expect(ink).toContain("Mae: Morning. # id:abcd_0001\n-> set_g0 ->\n-> line_abcd_0002");
    expect(ink).toContain("=== call_call2 ===\n-> line_abcd_0007 ->\n-> return_ret1");
    expect(ink).toContain("=== return_ret1 ===\n->->");
  });

  test("Yarn: a chain of dice tests, detours, and jumps that keep the way back inside a call", () => {
    expect(toYarn(barks(), { title: "T" })).toContain(
      "<<if dice(3) == 1>>\n    <<jump line_abcd_0001>>\n<<elseif dice(2) == 1>>\n    <<jump line_abcd_0002>>\n<<else>>\n    <<jump line_abcd_0003>>\n<<endif>>",
    );
    const yarn = toYarn(errands(), { title: "T" });
    // Outside any call, a plain jump.
    expect(yarn).toContain("Mae: Morning. #line:abcd_0001\n<<detour set_g0>>\n<<jump line_abcd_0002>>");
    // Inside one, a jump that keeps where to return to.
    expect(yarn).toContain("-> Nod. #line:abcd_0005\n    <<detour return_ret1>>\n    <<return>>");
    expect(yarn).toContain("title: return_ret1\nposition: 110,1100\n---\n<<return>>\n===");
  });

  test("Twine: either() for a Random card, a call stack in a story variable for calls", () => {
    expect(toTwee(barks(), { title: "T" })).toContain('<<set _pick to either("line_abcd_0001", "line_abcd_0002", "line_abcd_0003")>><<goto _pick>>');
    const twee = toTwee(errands(), { title: "T" });
    expect(twee).toContain(":: StoryInit\n<<set $met to 0>>\n<<set $plotra_calls to []>>");
    // After a line, Continue leads to a passage that makes the call.
    expect(twee).toContain("[[Continue->line_abcd_0001_next]]");
    expect(twee).toContain(':: line_abcd_0001_next {"position":"180,260"}\n<<run $plotra_calls.push("line_abcd_0002")>><<goto "set_g0">>');
    expect(twee).toContain('<<set _back to $plotra_calls.length ? $plotra_calls.pop() : "TheEnd">><<goto _back>>');
    // A variable of the dialogue's own with that name keeps it.
    expect(toTwee({ ...errands(), variables: { ...errands().variables, x: { name: "plotra_calls", value: 0, order: 9 } } }, { title: "T" })).toContain(
      "<<set $plotra_calls_2 to []>>",
    );
  });

  test("JSON keeps what a Call card calls", () => {
    const data = JSON.parse(toJson(errands(), { title: "T" }));
    expect(data.nodes.find((n: { id: string }) => n.id === "call1")).toMatchObject({ type: "call", target: "g0" });
  });
});
