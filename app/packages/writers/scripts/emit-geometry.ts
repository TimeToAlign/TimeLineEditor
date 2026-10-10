/**
 * Emit the golden geometry and figures of the timeskeleton repository.
 *
 * For every document fixture of the schema version this workspace depends on,
 * `fixtures/<version>/geometry/<name>/` in a timeskeleton checkout receives
 * `geometry.json` (written by `layout` and the standard writer), `figure.svg`
 * and `figure.tex` (written by the writers with their default options). The
 * geometry of the specimens listed in `HAND_DERIVED` is derived by hand in
 * that directory's README and never written here: the script refuses to run
 * when `layout` disagrees with it, and writes their figures from it. Once the
 * checkout has the tag `v<version>`, that version is released and its
 * goldens are frozen: the script refuses to write them.
 *
 *     node scripts/emit-geometry.ts ../../../../timeskeleton
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { layout } from "@timetoalign/tilie-layout";
import { writeSvg, writeTikz } from "@timetoalign/tilie-writers";
import { dumps, parse, parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";

/** The specimens whose geometry is derived by hand, one per kind of component. */
export const HAND_DERIVED = [
  "bare",
  "contiguous",
  "flow_control",
  "map",
  "nested",
  "styled",
  "with_region",
] as const;

function main(repository: string): void {
  const tag = `v${SCHEMA_VERSION}`;
  const tags = spawnSync("git", ["-C", repository, "tag", "--list", tag], { encoding: "utf8" });
  if (tags.status !== 0) throw new Error(`cannot list the tags of ${repository}: ${tags.stderr}`);
  if (tags.stdout.split(/\s+/).includes(tag)) {
    throw new Error(`${tag} is released; its golden geometry and figures are frozen`);
  }
  const documents = resolve(repository, "fixtures", SCHEMA_VERSION);
  const names = readdirSync(documents)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -5))
    .sort();
  for (const name of names) {
    const directory = resolve(documents, "geometry", name);
    const target = resolve(directory, "geometry.json");
    const computed = dumps(
      layout(parse(readFileSync(resolve(documents, `${name}.json`), "utf8")) as never) as never,
    );
    let text = computed;
    if ((HAND_DERIVED as readonly string[]).includes(name)) {
      if (!existsSync(target)) throw new Error(`${name}: the hand-derived geometry is missing`);
      text = readFileSync(target, "utf8");
      if (text !== computed)
        throw new Error(`${name}: layout disagrees with the hand-derived geometry`);
    } else {
      mkdirSync(directory, { recursive: true });
      writeFileSync(target, computed);
    }
    const geometry = parseJson(text) as never;
    writeFileSync(resolve(directory, "figure.svg"), writeSvg(geometry));
    writeFileSync(resolve(directory, "figure.tex"), writeTikz(geometry));
    console.log(
      `${name}: ${(HAND_DERIVED as readonly string[]).includes(name) ? "figures" : "geometry and figures"}`,
    );
  }
}

const repository = process.argv[2];
if (repository === undefined)
  throw new Error("usage: node scripts/emit-geometry.ts <timeskeleton checkout>");
main(resolve(repository));
