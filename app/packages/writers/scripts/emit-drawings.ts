/**
 * Emit the drawing fixtures of the schema package into a timeskeleton
 * checkout: for every review case, `fixtures/<version>/drawings/<name>/`
 * holds `inputs.json`, `figure.svg` and `figure.tex`, the drawing placed at
 * `(0, 0)` with the case's scale. The cases are drawn from the installed
 * package's manifests, which must equal the checkout's.
 *
 * The SVGs of `HAND_DERIVED` are derived by hand from the specification and
 * are never written here: each is compared with the writer's output, and a
 * difference or a missing file is reported and fails the run. The fixtures
 * of a released version (tag `v<version>` in the checkout) are frozen, and a
 * directory that names no case is removed.
 *
 * Usage, from `app/packages/writers/`: `pnpm emit-drawings --into <timeskeleton checkout>`.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { writeSvg, writeTikz } from "../src/index.ts";
import {
  fixturesDirectory,
  inputsText,
  MANIFEST_DIRECTORIES,
  manifestFiles,
  reviewCases,
} from "./review-cases.ts";

/** The cases whose `figure.svg` is derived by hand from the specification. */
export const HAND_DERIVED: readonly string[] = [
  "bare",
  "nested",
  "map",
  "flow_control",
  "with_region",
  "styled__score",
  "nested__length-800-spacing-2",
  "segment_line",
  "segment_pages_accolades",
  "group__group_child_member",
  "group__group_parents_mixed",
  "group__group_grandchild",
  "unknown_length",
  "unknown_length_empty",
  "unknown_length_locked",
  "unknown_length_child",
  "group__group_unknown_length",
  "unknown_length_segments",
  "bundle_ungrouped__places",
  "styled__score__bands-timeline",
  "bundle_ungrouped__scale",
  "bundle_ungrouped__spacing",
];

/** Write `text` to `file` unless it already holds it; report whether it changed. */
function update(file: string, text: string): boolean {
  if (existsSync(file) && readFileSync(file, "utf8") === text) return false;
  writeFileSync(file, text);
  return true;
}

/** The first line on which two texts differ, both sides shown. */
function firstDifference(expected: string, actual: string): string {
  const left = expected.split("\n");
  const right = actual.split("\n");
  const index = left.findIndex((line, i) => line !== right[i]);
  const line = index === -1 ? left.length : index;
  return `line ${line + 1}:\n  file:   ${left[line] ?? "(none)"}\n  writer: ${right[line] ?? "(none)"}`;
}

/** The manifest files of a fixture directory and its `groups/` and `bundles/`, by path. */
function manifests(directory: string): Map<string, string> {
  return new Map(
    MANIFEST_DIRECTORIES.flatMap((subdirectory) =>
      manifestFiles(directory, subdirectory).map((file): [string, string] => {
        const name = path.join(subdirectory, file);
        return [name, readFileSync(path.join(directory, name), "utf8")];
      }),
    ),
  );
}

/** Emit every case's files into `checkout`; return the problems of the hand-derived SVGs. */
function emit(checkout: string): string[] {
  const fixtures = path.join(checkout, "fixtures", SCHEMA_VERSION);
  for (const required of [path.join(checkout, "schema"), fixtures, path.join(checkout, ".git")]) {
    if (!existsSync(required)) {
      throw new Error(`${checkout} is not a timeskeleton checkout: ${required} is missing`);
    }
  }
  const tag = `v${SCHEMA_VERSION}`;
  const tags = spawnSync("git", ["-C", checkout, "tag", "--list", tag], { encoding: "utf8" });
  if (tags.status !== 0) throw new Error(`git tag failed in ${checkout}: ${tags.stderr}`);
  const drawingsDirectory = path.join(fixtures, "drawings");
  if (tags.stdout.split(/\s+/).includes(tag)) {
    throw new Error(`${tag} is released; its drawing fixtures in ${drawingsDirectory} are frozen.`);
  }

  const installed = manifests(fixturesDirectory);
  const checked = manifests(fixtures);
  const stale = [...new Set([...installed.keys(), ...checked.keys()])].filter(
    (file) => installed.get(file) !== checked.get(file),
  );
  if (stale.length > 0) {
    throw new Error(
      `the installed manifests in ${fixturesDirectory} differ from ${fixtures} (${stale.join(", ")}); build the installed package first`,
    );
  }

  const cases = reviewCases();
  const names = new Set(cases.map((item) => item.name));
  mkdirSync(drawingsDirectory, { recursive: true });
  for (const entry of readdirSync(drawingsDirectory, { withFileTypes: true })) {
    if (entry.isDirectory() && !names.has(entry.name)) {
      rmSync(path.join(drawingsDirectory, entry.name), { recursive: true });
      console.log(`removed ${entry.name}: no such case`);
    }
  }

  const problems: string[] = [];
  let changed = 0;
  for (const item of cases) {
    const directory = path.join(drawingsDirectory, item.name);
    mkdirSync(directory, { recursive: true });
    const placed = [{ drawing: item.drawing, x: 0, y: 0, scale: item.scale }];
    if (update(path.join(directory, "inputs.json"), inputsText(item))) changed++;
    if (update(path.join(directory, "figure.tex"), writeTikz(placed))) changed++;
    const svg = writeSvg(placed);
    const figure = path.join(directory, "figure.svg");
    if (!HAND_DERIVED.includes(item.name)) {
      if (update(figure, svg)) changed++;
    } else if (!existsSync(figure)) {
      problems.push(`${item.name}: the hand-derived figure.svg is missing`);
    } else {
      const derived = readFileSync(figure, "utf8");
      if (derived !== svg) {
        problems.push(
          `${item.name}: figure.svg differs from the writer at ${firstDifference(derived, svg)}`,
        );
      }
    }
  }

  console.log(`${cases.length} drawings in ${drawingsDirectory}, ${changed} files written`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { into: { type: "string" } } });
  if (values.into === undefined)
    throw new Error("usage: emit-drawings --into <timeskeleton checkout>");
  const problems = emit(path.resolve(values.into));
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  }
}
