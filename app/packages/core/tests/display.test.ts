import { JsonFloat } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  coordinateDict,
  copyValue,
  displayValue,
  exactDecimal,
  unitSymbol,
} from "../src/number/display.ts";
import { Rational } from "../src/number/rational.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

describe("displayValue and copyValue", () => {
  it("shows a fraction mixed, as an exact decimal, or approximately", () => {
    expect(displayValue(q(219, 16), "fraction")).toBe("13 11/16");
    expect(displayValue(q(-219, 16), "fraction")).toBe("-13 11/16");
    expect(displayValue(q(1, 64), "fraction")).toBe("1/64");
    expect(displayValue(q(3), "fraction")).toBe("3");
    expect(displayValue(q(27, 2048), "fraction")).toBe("0.01318359375");
    expect(displayValue(q(1, 192), "fraction")).toBe("≈ 0.005208333333");
    expect(displayValue(q(1, 65), "fraction")).toBe("≈ 0.015384615385");
    expect(copyValue(q(219, 16), "fraction")).toBe("219/16");
    expect(copyValue(q(3), "fraction")).toBe("3");
  });

  it("shows a float rounded to three places, and copies it whole", () => {
    expect(displayValue(6.71875, "float")).toBe("6.719");
    expect(displayValue(6, "float")).toBe("6.0");
    expect(displayValue(1e-5, "float")).toBe("0.0");
    expect(displayValue(312.48979591836735, "float")).toBe("312.49");
    expect(copyValue(6.71875, "float")).toBe("6.71875");
  });

  it("groups the digits of an int", () => {
    expect(displayValue(514041n, "int")).toBe("514 041");
    expect(displayValue(-1234567n, "int")).toBe("-1 234 567");
    expect(displayValue(0n, "int")).toBe("0");
    expect(copyValue(514041n, "int")).toBe("514041");
  });

  it("refuses a value of another kind than the number type", () => {
    expect(() => displayValue(3n, "float")).toThrow(TypeError);
    expect(() => copyValue(0.5, "fraction")).toThrow(TypeError);
    expect(() => coordinateDict(q(1, 2), "samples", "int")).toThrow(TypeError);
  });
});

describe("coordinateDict", () => {
  it("writes the value as a bare value of its number type", () => {
    expect(coordinateDict(q(219, 16), "quarters", "fraction")).toEqual({
      unit: "quarters",
      number_type: "fraction",
      value: [219, 16],
    });
    expect(coordinateDict(6, "seconds", "float")).toEqual({
      unit: "seconds",
      number_type: "float",
      value: new JsonFloat(6),
    });
    expect(coordinateDict(514041n, "samples", "int")).toEqual({
      unit: "samples",
      number_type: "int",
      value: 514041,
    });
  });
});

describe("unitSymbol", () => {
  it("gives the drawing specification's symbols, any other unit its name", () => {
    expect(
      (["quarters", "seconds", "samples", "ticks", "pixels", "whole_notes", "points"] as const).map(
        unitSymbol,
      ),
    ).toEqual(["♩", "s", "smp", "ticks", "px", "whole_notes", "points"]);
  });
});

describe("exactDecimal", () => {
  it("writes a terminating decimal exactly and gives none for any other", () => {
    expect(
      [q(1, 200), q(-3, 8), q(3), q(27, 2048), q(1, 3)].map((value) => exactDecimal(value)),
    ).toEqual(["0.005", "-0.375", "3", "0.01318359375", undefined]);
  });
});
