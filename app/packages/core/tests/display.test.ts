import { JsonFloat } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  coordinateDict,
  copyValue,
  copyValueWithUnit,
  displayValue,
  exactDecimal,
  unitSymbol,
} from "../src/number/display.ts";
import { Rational } from "../src/number/rational.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

describe("displayValue", () => {
  it("shows a fraction mixed up to 2520, else as an exact decimal, else approximately", () => {
    const shown = (value: Rational) => displayValue(value, "fraction", 3);
    expect(
      [q(219, 16), q(-219, 16), q(1, 2520), q(2521, 2520), q(27, 2048), q(3)].map(shown),
    ).toEqual(["13 11/16", "-13 11/16", "1/2520", "1 1/2520", "27/2048", "3"]);
    expect([q(1, 4096), q(1, 2521), q(1, 5040)].map(shown)).toEqual([
      "0.000244140625",
      "≈ 0.000396667989",
      "≈ 0.000198412698",
    ]);
    expect(displayValue(q(219, 16), "fraction", 0)).toBe("13 11/16");
  });

  it("shows a float rounded to the given places as Python's repr", () => {
    const at = (x: number) => [0, 3, 6].map((places) => displayValue(x, "float", places));
    expect(at(6.71875)).toEqual(["7.0", "6.719", "6.71875"]);
    expect(at(312.48979591836735)).toEqual(["312.0", "312.49", "312.489796"]);
    expect(at(1e-5)).toEqual(["0.0", "0.0", "1e-05"]);
    expect(at(2.5)).toEqual(["2.0", "2.5", "2.5"]);
    expect(displayValue(6, "float", 3)).toBe("6.0");
  });

  it("groups the digits of an int at any places", () => {
    expect(displayValue(514041n, "int", 0)).toBe("514 041");
    expect(displayValue(514041n, "int", 6)).toBe("514 041");
    expect(displayValue(-1234567n, "int", 3)).toBe("-1 234 567");
    expect(displayValue(0n, "int", 3)).toBe("0");
  });
});

describe("copyValue and copyValueWithUnit", () => {
  it("copy the whole value", () => {
    expect([copyValue(q(219, 16), "fraction"), copyValue(q(3), "fraction")]).toEqual([
      "219/16",
      "3",
    ]);
    expect([0.1, 1e-7, 3, 6.71875, 1e16].map((x) => copyValue(x, "float"))).toEqual([
      "0.1",
      "1e-07",
      "3.0",
      "6.71875",
      "1e+16",
    ]);
    expect(copyValue(514041n, "int")).toBe("514041");
  });

  it("add the unit's symbol after a space", () => {
    expect([
      copyValueWithUnit(q(219, 16), "fraction", "quarters"),
      copyValueWithUnit(0.1, "float", "seconds"),
      copyValueWithUnit(1e-7, "float", "seconds"),
      copyValueWithUnit(514041n, "int", "samples"),
      copyValueWithUnit(q(3), "fraction", "whole_notes"),
    ]).toEqual(["219/16 ♩", "0.1 s", "1e-07 s", "514041 smp", "3 whole_notes"]);
  });

  it("refuse a value of another kind than the number type", () => {
    expect(() => displayValue(3n, "float", 3)).toThrow(TypeError);
    expect(() => copyValue(0.5, "fraction")).toThrow(TypeError);
    expect(() => copyValueWithUnit(q(1, 2), "int", "samples")).toThrow(TypeError);
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
