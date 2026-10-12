import { describe, expect, it } from "vitest";
import { GRID_FREE, MIN_LENGTH, MIN_SCALE, MIN_SPACING, quantize } from "../src/index.ts";

describe("quantize", () => {
  it.each([
    [19, 8, 16],
    [20, 8, 24],
    [-20, 8, -16],
    [19.999999999999943, 1 / 2048, 20],
    [478.5771484375, 1 / 64, 478.578125],
    [478.5771484375, 1 / 2048, 478.5771484375],
    [101.3, 1 / 2048, 101.2998046875],
  ])("quantizes %d to a multiple of %d", (value, step, expected) => {
    expect(quantize(value, step)).toBe(expected);
  });

  it("never gives −0", () => {
    expect(Object.is(quantize(-0.001, 8), 0)).toBe(true);
  });

  it("has the constants", () => {
    expect([GRID_FREE, MIN_SCALE, MIN_LENGTH, MIN_SPACING]).toEqual([1 / 2048, 1 / 8, 8, 1 / 4]);
  });
});
