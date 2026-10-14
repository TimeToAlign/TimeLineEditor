import { manifestElements } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { blockOf, click, existing } from "../src/index.ts";
import { A, B, C, CHILD_MEMBER, load, numbersView, viewOf } from "./support.ts";

describe("click", () => {
  it("selects the element only", () => {
    expect(click(new Set(), `${A}/clt_3`, false)).toEqual(new Set([`${A}/clt_3`]));
  });

  it("replaces the selection without Shift", () => {
    expect(click(new Set([A, B]), C, false)).toEqual(new Set([C]));
  });

  it("toggles with Shift and never mutates its input", () => {
    const start = new Set([A]);
    const added = click(start, `${B}/clt_1`, true);
    expect(added).toEqual(new Set([A, `${B}/clt_1`]));
    expect(click(added, A, true)).toEqual(new Set([`${B}/clt_1`]));
    expect(start).toEqual(new Set([A]));
    expect(added).toEqual(new Set([A, `${B}/clt_1`]));
  });

  it("selects a timeline by a press on its card, and every other part as pressed", () => {
    expect(click(new Set(), `${A}/bare/card`, false)).toEqual(new Set([`${A}/bare`]));
    const recording = click(new Set(), `${A}/recording/card`, false);
    expect(recording).toEqual(new Set([`${A}/recording`]));
    expect(click(recording, `${A}/recording/card`, true)).toEqual(new Set());
    expect(click(new Set(), `${A}/recording/start`, false)).toEqual(
      new Set([`${A}/recording/start`]),
    );
    expect(click(new Set(), `${A}/card`, false)).toEqual(new Set([`${A}/card`]));
    expect(click(new Set(), `${A}/card/card`, false)).toEqual(new Set([`${A}/card`]));
    expect(click(new Set(), A, false)).toEqual(new Set([A]));
  });

  it("presses addresses the drawings carry", () => {
    for (const [fixture, card, timeline] of [
      ["bare", "bare/card", "bare"],
      [CHILD_MEMBER, "recording/card", "recording"],
    ] as const) {
      const keys = manifestElements(load(fixture)).map((key) => key.address);
      expect(keys).toContain(card);
      expect(keys).toContain(timeline);
    }
  });
});

describe("blockOf", () => {
  it("gives the block of an address", () => {
    expect(blockOf(`${A}/clt_3/name`)).toBe(A);
    expect(blockOf(A)).toBe(A);
    expect(blockOf(`${A}/score/region_1/label`)).toBe(A);
  });

  it("refuses the workspace", () => {
    expect(() => blockOf("workspace")).toThrow(RangeError);
  });
});

describe("existing", () => {
  const view = viewOf({ id: A, fixture: "nested" });

  it("drops addresses whose block or element is gone, parts with their element", () => {
    const selection = new Set([
      A,
      `${A}/clt_3`,
      `${A}/clt_3/name`,
      `${A}/clt_9`,
      `${A}/clt_9/name`,
      B,
      `${B}/clt_1`,
    ]);
    expect([...existing(view, selection)]).toEqual([A, `${A}/clt_3`, `${A}/clt_3/name`]);
  });

  it("returns the selection itself when everything exists", () => {
    const selection = new Set([A, `${A}/clt_2`]);
    expect(existing(view, selection)).toBe(selection);
    const none = new Set<string>();
    expect(existing(view, none)).toBe(none);
  });

  it("reads the addresses of a group or bundle block with elementOf", () => {
    const selection = new Set([
      `${A}/score/region_1/label`,
      `${A}/score/region_2/label`,
      `${A}/score/name`,
      `${A}/group_1/name`,
      `${A}/page/start`,
      `${A}/nobody/region_1`,
    ]);
    expect([...existing(numbersView(), selection)]).toEqual([
      `${A}/score/region_1/label`,
      `${A}/score/name`,
      `${A}/group_1/name`,
      `${A}/page/start`,
    ]);
  });
});
