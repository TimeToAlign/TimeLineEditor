/** The texts of a coordinate; the expected values are derived in `README.md` ("The texts of a coordinate"). */

import type { TimeUnit } from "@timetoalign/timetoshare";
import { JsonFloat } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  coordinateDict,
  copyValue,
  prettyText,
  prettyUnit,
  rawText,
} from "../src/number/display.ts";
import { Rational } from "../src/number/rational.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

/** Every unit with its pretty unit, in the schema's order. */
const UNITS: readonly (readonly [TimeUnit, string])[] = [
  ["number", "number"],
  ["floating_measures", "floating_measures"],
  ["whole_notes", "𝅝"],
  ["quarters", "♩"],
  ["ticks", "ticks"],
  ["milliseconds", "ms"],
  ["seconds", "s"],
  ["minutes", "min"],
  ["samples", "smp"],
  ["frames", "frames"],
  ["pixels", "px"],
  ["meters", "m"],
  ["centimeters", "cm"],
  ["millimeters", "mm"],
  ["inches", "in"],
  ["points", "pt"],
  ["css_pixels", "css_pixels"],
  ["user_units", "uu"],
];

describe("copyValue", () => {
  it("copies the whole value", () => {
    expect([copyValue(q(219, 16), "fraction"), copyValue(q(3), "fraction")]).toEqual([
      "219/16",
      "3",
    ]);
    expect([0.1, 1e-7, 3, 6.71875, 1e16].map((x) => copyValue(x, "float"))).toEqual([
      "0.1",
      "1.0e-07",
      "3.0",
      "6.71875",
      "1.0e+16",
    ]);
    expect(copyValue(514041n, "int")).toBe("514041");
  });
});

describe("rawText", () => {
  it("writes the copy text and the unit's schema name for every unit", () => {
    expect(UNITS.map(([unit]) => rawText(q(219, 16), "fraction", unit))).toEqual(
      UNITS.map(([unit]) => `219/16 ${unit}`),
    );
    expect([
      rawText(0.1, "float", "seconds"),
      rawText(q(3), "fraction", "whole_notes"),
      rawText(514041n, "int", "samples"),
    ]).toEqual(["0.1 seconds", "3 whole_notes", "514041 samples"]);
  });
});

describe("prettyUnit and the pretty text of every unit", () => {
  it("gives each unit its symbol or abbreviation, else its name", () => {
    expect(UNITS.map(([unit]) => prettyUnit(unit))).toEqual(UNITS.map(([, pretty]) => pretty));
  });

  it("writes the pretty number and the pretty unit, seconds split, no unit the number alone", () => {
    expect(UNITS.map(([unit]) => prettyText(q(219, 16), "fraction", unit))).toEqual(
      UNITS.map(([unit, pretty]) => (unit === "seconds" ? "13 11/16″" : `13 11/16 ${pretty}`)),
    );
    expect(prettyText(q(219, 16), "fraction", null)).toBe("13 11/16");
  });
});

describe("prettyText, exact", () => {
  it("mixes a fraction whatever its denominator, never grouping its digits", () => {
    expect(
      [q(219, 16), q(-219, 16), q(-3, 8), q(3), q(1, 2521), q(5043, 2521), q(1, 4096)].map(
        (value) => prettyText(value, "fraction", "quarters"),
      ),
    ).toEqual(["13 11/16 ♩", "-13 11/16 ♩", "-3/8 ♩", "3 ♩", "1/2521 ♩", "2 1/2521 ♩", "1/4096 ♩"]);
    expect(prettyText(q(123457, 2), "fraction", null)).toBe("61728 1/2");
  });

  it("groups an int by three", () => {
    expect(
      [514041n, -1234567n, 1000n, 999n, 0n].map((x) => prettyText(x, "int", "samples")),
    ).toEqual(["514 041 smp", "-1 234 567 smp", "1 000 smp", "999 smp", "0 smp"]);
  });

  it("writes a float as TimeToShare spells it", () => {
    expect([0.1, 6.71875, 1e-7, 1e16, 0.1 + 0.2].map((x) => prettyText(x, "float", null))).toEqual([
      "0.1",
      "6.71875",
      "1.0e-07",
      "1.0e+16",
      "0.30000000000000004",
    ]);
  });

  it("splits float seconds on the digits of their spelling", () => {
    expect(
      [42.5, 5.241, 75.5, 3725.0, 3605.25, 60.0, 0.0, -75.5, 75.1, 0.1 + 0.2, 1e-5, 1e16].map((x) =>
        prettyText(x, "float", "seconds"),
      ),
    ).toEqual([
      "42.5″",
      "5.241″",
      "1′15.5″",
      "1h02′05″",
      "1h00′05.25″",
      "1′00″",
      "0″",
      "-1′15.5″",
      "1′15.1″",
      "0.30000000000000004″",
      "0.00001″",
      "2777777777777h46′40″",
    ]);
  });

  it("splits fraction and int seconds exactly", () => {
    expect(
      [q(151, 2), q(121, 2), q(1, 2), q(7201, 2)].map((x) => prettyText(x, "fraction", "seconds")),
    ).toEqual(["1′15 1/2″", "1′00 1/2″", "1/2″", "1h00′00 1/2″"]);
    expect([3725n, 59n, -3600n].map((x) => prettyText(x, "int", "seconds"))).toEqual([
      "1h02′05″",
      "59″",
      "-1h00′00″",
    ]);
  });
});

describe("prettyText, rounded", () => {
  it("rounds a float to the given places as Python's round, spelled as TimeToShare spells it", () => {
    const at = (x: number) => [0, 3, 6].map((places) => prettyText(x, "float", null, places));
    expect(at(6.71875)).toEqual(["7.0", "6.719", "6.71875"]);
    expect(at(312.48979591836735)).toEqual(["312.0", "312.49", "312.489796"]);
    expect(at(1e-5)).toEqual(["0.0", "0.0", "1.0e-05"]);
    expect(at(2.5)).toEqual(["2.0", "2.5", "2.5"]);
    expect(prettyText(6, "float", null, 3)).toBe("6.0");
  });

  it("mixes a fraction up to 2520, else writes its exact decimal, else approximates it", () => {
    const shown = (value: Rational) => prettyText(value, "fraction", "quarters", 3);
    expect([q(219, 16), q(1, 2520), q(2521, 2520), q(27, 2048)].map(shown)).toEqual([
      "13 11/16 ♩",
      "1/2520 ♩",
      "1 1/2520 ♩",
      "27/2048 ♩",
    ]);
    expect([q(1, 4096), q(1, 2521), q(1, 5040), q(1, 2550), q(-1, 2550)].map(shown)).toEqual([
      "0.000244140625 ♩",
      "≈ 0.000396667989 ♩",
      "≈ 0.000198412698 ♩",
      "≈ 0.000392156863 ♩",
      "≈ -0.000392156863 ♩",
    ]);
    expect(prettyText(q(219, 16), "fraction", null, 0)).toBe("13 11/16");
  });

  it("groups an int at any places", () => {
    expect([0, 6].map((places) => prettyText(514041n, "int", null, places))).toEqual([
      "514 041",
      "514 041",
    ]);
  });

  it("rounds seconds before splitting them", () => {
    expect([
      prettyText(59.9996, "float", "seconds", 3),
      prettyText(3599.9996, "float", "seconds", 3),
      prettyText(3725.0004, "float", "seconds", 3),
      prettyText(75.1, "float", "seconds", 0),
      prettyText(q(151, 2), "fraction", "seconds", 3),
      prettyText(q(1, 4096), "fraction", "seconds", 3),
      prettyText(q(153001, 2550), "fraction", "seconds", 3),
    ]).toEqual([
      "1′00″",
      "1h00′00″",
      "1h02′05″",
      "1′15″",
      "1′15 1/2″",
      "0.000244140625″",
      "≈ 1′00.000392156863″",
    ]);
  });
});

describe("negative zero", () => {
  it("is written unsigned in a pretty text and kept in Copy and the raw text", () => {
    expect([
      prettyText(-0.0, "float", "seconds"),
      prettyText(-0.0, "float", "quarters"),
      prettyText(-0.0, "float", null),
      prettyText(-0.0004, "float", "seconds", 3),
      prettyText(-0.0004, "float", "quarters", 3),
      prettyText(q(-1, 30000000000000), "fraction", "quarters", 3),
    ]).toEqual(["0″", "0.0 ♩", "0.0", "0″", "0.0 ♩", "≈ 0.000000000000 ♩"]);
    expect([copyValue(-0.0, "float"), rawText(-0.0, "float", "seconds")]).toEqual([
      "-0.0",
      "-0.0 seconds",
    ]);
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

describe("a value of another kind than the number type", () => {
  it("is refused", () => {
    expect(() => prettyText(3n, "float", "seconds")).toThrow(TypeError);
    expect(() => copyValue(0.5, "fraction")).toThrow(TypeError);
    expect(() => rawText(q(1, 2), "int", "samples")).toThrow(TypeError);
    expect(() => coordinateDict(q(1, 2), "samples", "int")).toThrow(TypeError);
  });
});
