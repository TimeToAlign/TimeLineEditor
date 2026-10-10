import { readFileSync } from "node:fs";
import path from "node:path";
import { dumps, parse } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { layout } from "../src/index.ts";
import { documentNames, documentText, geometryDir } from "./support.ts";

const HAND_DERIVED = [
  "bare",
  "contiguous",
  "flow_control",
  "map",
  "nested",
  "styled",
  "with_region",
];

describe("the golden geometry", () => {
  it("exists for every document fixture, seven of them derived by hand", () => {
    expect(documentNames()).toHaveLength(20);
    for (const name of HAND_DERIVED) expect(documentNames()).toContain(name);
  });

  it.each(documentNames())("is reproduced byte for byte for %s", (name) => {
    const golden = readFileSync(path.join(geometryDir, name, "geometry.json"), "utf8");
    expect(dumps(layout(parse(documentText(name)) as never) as never)).toBe(golden);
  });
});
