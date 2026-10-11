import { readFileSync } from "node:fs";
import path from "node:path";
import { compactJson, parseJson } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { layout } from "../src/index.ts";
import { legacyGeometryDir, load, manifestNames } from "./support.ts";

type Item = Record<string, unknown>;

function legacyName(name: string): string {
  if (name.startsWith("styled__")) return "styled";
  if (name.startsWith("conversion_maps__")) return "conversion_maps";
  if (name.startsWith("corpus_parangonar_parangonada__")) {
    return "corpus_parangonar_parangonada";
  }
  return name;
}

function expectedBlock(name: string, id: string): Item {
  const text = readFileSync(
    path.join(legacyGeometryDir, legacyName(name), "geometry.json"),
    "utf8",
  );
  const geometry = parseJson(text) as unknown as { blocks: Item[] };
  const block = geometry.blocks.find((item) => item.id === id);
  if (block === undefined) throw new Error(`${name}: block ${id} is absent`);
  return block;
}

describe("the 0.3.0 geometry regression", () => {
  it("covers exactly all 34 manifests", () => {
    expect(manifestNames().length).toBe(34);
  });

  it.each(manifestNames())("keeps every primitive of %s", (name) => {
    const manifest = load(name);
    expect(compactJson(layout(manifest) as never)).toBe(
      compactJson(expectedBlock(name, manifest.timeline.id) as never),
    );
  });
});
