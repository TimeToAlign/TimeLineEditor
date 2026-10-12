import { describe, expect, it } from "vitest";
import { blockOf, click } from "../src/index.ts";
import { A, B, C } from "./support.ts";

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
});

describe("blockOf", () => {
  it("gives the block of an address", () => {
    expect(blockOf(`${A}/clt_3/name`)).toBe(A);
    expect(blockOf(A)).toBe(A);
  });

  it("refuses the workspace", () => {
    expect(() => blockOf("workspace")).toThrow(RangeError);
  });
});
