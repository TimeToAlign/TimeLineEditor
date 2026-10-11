/** The 16 single-root legacy figures and their 0.4.0 manifest blocks. */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { type LosslessBlock, layout } from "@timetoalign/tilie-layout";

const packageDir = path.dirname(
  createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
);
export const fixturesDir = path.join(packageDir, "fixtures", "0.4.0");
const geometryDir = "/home/laser/git/tta/timeskeleton/fixtures/0.3.0/geometry";

export const specimens = [
  "bare",
  "contiguous",
  "continuous_graphical",
  "continuous_logical",
  "continuous_physical",
  "discrete_graphical",
  "discrete_logical",
  "discrete_physical",
  "corpus_audio_audio",
  "corpus_midi_score_midi",
  "corpus_score_ms3",
  "corpus_supra_iiif",
  "flow_control",
  "map",
  "nested",
  "with_region",
] as const;

export function figurePath(name: string, file: string): string {
  return path.join(geometryDir, name, file);
}

export function figureText(name: string, file: string): string {
  return readFileSync(figurePath(name, file), "utf8");
}

export function block(name: string): LosslessBlock {
  const text = readFileSync(path.join(fixturesDir, `${name}.json`), "utf8");
  const manifest = loadManifest(text);
  if (isLoadError(manifest)) throw new Error(`${name}: ${manifest.problems[0]?.message}`);
  return layout(manifest);
}
