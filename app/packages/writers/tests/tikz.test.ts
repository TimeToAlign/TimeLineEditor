/** The font directory of the TikZ profile; the expectations are derived in tests/README.md. */

import { describe, expect, it } from "vitest";
import { writeTikz } from "../src/index.ts";
import { bare } from "./support.ts";

const placed = [{ drawing: bare(), x: 0, y: 0, scale: 1 }];

/** Each refused character, the directory `/a<c>b` holding it, and that directory as a JSON string. */
const REFUSED: readonly (readonly [string, string])[] = [
  ["~", '"/a~b"'],
  ["\\", '"/a\\\\b"'],
  ['"', '"/a\\"b"'],
  ["%", '"/a%b"'],
  ["#", '"/a#b"'],
  ["{", '"/a{b"'],
  ["}", '"/a}b"'],
];

describe("the font directory", () => {
  it.each(REFUSED)(
    "is refused holding %s, in a document and in a picture alike",
    (character, json) => {
      const message = `the font directory ${json} holds '${character}', which a TikZ document cannot carry`;
      const fontDirectory = `/a${character}b`;
      expect(() => writeTikz(placed, { fontDirectory })).toThrow(new Error(message));
      expect(() => writeTikz(placed, { standalone: false, fontDirectory })).toThrow(
        new Error(message),
      );
    },
  );

  it("is written as given without them", () => {
    const pathOf = (fontDirectory: string) =>
      writeTikz(placed, { fontDirectory })
        .split("\n")
        .find((line) => line.startsWith("\\setsansfont"))
        ?.match(/Path=([^,]*),/)?.[1];
    expect(["/fonts", ".", "../fonts-2.37 (copy)"].map(pathOf)).toEqual([
      "/fonts/",
      "./",
      "../fonts-2.37 (copy)/",
    ]);
  });
});
