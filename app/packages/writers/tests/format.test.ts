import { describe, expect, it } from "vitest";
import { formatNumber } from "../src/index.ts";

describe("formatNumber", () => {
  it("rounds to the nearest 1/10000, ties to even", () => {
    expect(formatNumber(0.03125)).toBe("0.0312");
    expect(formatNumber(0.09375)).toBe("0.0938");
    expect(formatNumber(-0.03125)).toBe("-0.0312");
    expect(formatNumber(41.5771484375)).toBe("41.5771");
    expect(formatNumber(14.40234375)).toBe("14.4023");
  });

  it("writes integers, zero and large values without exponent", () => {
    expect(formatNumber(3)).toBe("3");
    expect(formatNumber(0.5)).toBe("0.5");
    expect(formatNumber(-0.00001)).toBe("0");
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(1e21)).toBe("1000000000000000000000");
  });

  it("refuses a non-finite value", () => {
    expect(() => formatNumber(Number.NaN)).toThrow(RangeError);
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
