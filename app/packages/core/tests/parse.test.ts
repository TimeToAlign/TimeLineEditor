/** Reading a typed value; the cases are listed in `README.md` ("Reading a typed value"). */

import type { NumberType } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import type { Problem } from "../src/errors.ts";
import { isCommandError } from "../src/errors.ts";
import { parseAxisValue } from "../src/number/parse.ts";
import { Rational } from "../src/number/rational.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

function read(text: string, numberType: NumberType): Rational | Problem {
  return parseAxisValue(text, numberType);
}

describe("parseAxisValue accepts", () => {
  it("on a fraction axis an integer, n/d, a b/c and a decimal", () => {
    const cases: readonly [string, Rational][] = [
      ["3", q(3)],
      ["-3", q(-3)],
      [" 3/4 ", q(3, 4)],
      ["6/8", q(3, 4)],
      ["-3/4", q(-3, 4)],
      ["13 11/16", q(219, 16)],
      ["-13 11/16", q(-219, 16)],
      ["1 3/2", q(5, 2)],
      ["0.75", q(3, 4)],
      [".5", q(1, 2)],
      ["2.", q(2)],
      ["0.1", q(1, 10)],
      ["1e-3", q(1, 1000)],
      ["-2.5E2", q(-250)],
    ];
    expect(cases.map(([text]) => read(text, "fraction"))).toEqual(cases.map(([, value]) => value));
  });

  it("on a float axis a decimal, read exactly", () => {
    const cases: readonly [string, Rational][] = [
      ["0.1", q(1, 10)],
      ["1e-07", q(1, 10000000)],
      ["3.0", q(3)],
      ["-2.5", q(-5, 2)],
      ["3", q(3)],
    ];
    expect(cases.map(([text]) => read(text, "float"))).toEqual(cases.map(([, value]) => value));
  });

  it("on an int axis the digits, plain or grouped by three", () => {
    const cases: readonly [string, Rational][] = [
      ["514041", q(514041)],
      ["514 041", q(514041)],
      ["-1 234 567", q(-1234567)],
      ["+7", q(7)],
    ];
    expect(cases.map(([text]) => read(text, "int"))).toEqual(cases.map(([, value]) => value));
  });
});

describe("parseAxisValue refuses", () => {
  it.each([
    ["fraction", ["", "abc", "1/0", "1 1/0", "1/-2", "3/4/5", "1,5", "0x10", "Infinity", "1e1001"]],
    ["float", ["3/4", "1 1/2", "inf", "nan", "1e", ""]],
    ["int", ["1.0", "1e3", "51 4041", "1/1", ""]],
  ] as const)("other text on a %s axis as invalid_value at []", (numberType, texts) => {
    for (const text of texts) {
      const result = read(text, numberType);
      expect(isCommandError(result) && [result.code, result.path]).toEqual(["invalid_value", []]);
    }
  });

  it("naming the text and what the axis accepts", () => {
    expect([read("1/0", "fraction"), read("inf", "float"), read("1.0", "int")]).toEqual([
      {
        code: "invalid_value",
        message: '"1/0" is no fraction value; write an integer, n/d, a b/c or a decimal',
        path: [],
      },
      {
        code: "invalid_value",
        message: '"inf" is no float value; write a decimal number',
        path: [],
      },
      { code: "invalid_value", message: '"1.0" is no int value; write an integer', path: [] },
    ]);
  });
});
