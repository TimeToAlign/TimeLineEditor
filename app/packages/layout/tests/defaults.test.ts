import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseJson } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { DEFAULT_LAYER } from "../src/index.ts";

/** The drawing specification the installed timeskeleton package ships. */
const specification = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
  "docs",
  "drawing.md",
);

/** The JSON block of the "Defaults" section of the drawing specification. */
function specifiedDefaults(file: string): unknown {
  const text = readFileSync(file, "utf8");
  const section = text.slice(text.indexOf("## 4. Defaults"));
  const start = section.indexOf("```json\n") + "```json\n".length;
  return parseJson(section.slice(start, section.indexOf("```", start)));
}

describe("DEFAULT_LAYER", () => {
  it("equals the JSON block of the specification", () => {
    expect(DEFAULT_LAYER).toEqual(specifiedDefaults(specification));
  });
});
