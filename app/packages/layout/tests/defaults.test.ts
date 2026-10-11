import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseJson } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { DEFAULT_LAYER } from "../src/index.ts";

const packageDir = path.dirname(
  createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
);

/** The drawing specification: the package's own copy, else a linked checkout's. */
const specification = [
  path.join(packageDir, "docs", "drawing.md"),
  path.join(packageDir, "..", "docs", "drawing.md"),
].find((file) => existsSync(file));

/** The JSON block of the "Defaults" section of the drawing specification. */
function specifiedDefaults(file: string): unknown {
  const text = readFileSync(file, "utf8");
  const section = text.slice(text.indexOf("## 4. Defaults"));
  const start = section.indexOf("```json\n") + "```json\n".length;
  return parseJson(section.slice(start, section.indexOf("```", start)));
}

describe("DEFAULT_LAYER", () => {
  it.skipIf(specification === undefined)(
    specification === undefined
      ? "the installed timeskeleton package ships no drawing specification"
      : "equals the JSON block of the specification",
    () => {
      expect(DEFAULT_LAYER).toEqual(specifiedDefaults(specification as string));
    },
  );
});
