/**
 * Emit the SVG and TikZ drawings of the timeskeleton repository.
 *
 * For every manifest fixture of the schema version this workspace depends on,
 * `fixtures/<version>/drawings/<name>/` in a timeskeleton checkout receives
 * `figure.svg` (`writeSvg`) and `figure.tex` (`writeTikz`) of `layout(manifest)`
 * with the default options. From 0.4.0 on the drawing is pinned by these two
 * files alone: there is no geometry JSON.
 *
 * The hand-derived specimens are the SVG files that
 * `fixtures/<version>/drawings/README.md` lists, each as the code span
 * `<name>/figure.svg`. They were derived by hand from the specification and
 * are never overwritten here: the script writes nothing unless
 * `writeSvg(layout(manifest))` reproduces each of them byte for byte. Once the
 * checkout has the tag `v<version>`, that version is released and its fixtures
 * are frozen: the script refuses to write them.
 *
 *     node scripts/emit-geometry.ts ../../../../timeskeleton
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { layout } from "@timetoalign/tilie-layout";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { writeSvg, writeTikz } from "../src/index.ts";

/** The manifests whose `<name>/figure.svg` the drawings README lists, in order of first mention. */
export function handDerived(readme: string): string[] {
  const names = Array.from(readme.matchAll(/`([A-Za-z0-9_]+)\/figure\.svg`/g), (item) => item[1]);
  return [...new Set(names)] as string[];
}

/** Write the figures of every manifest of `version` into a timeskeleton checkout. */
export function emit(repository: string, version: string = SCHEMA_VERSION): string[] {
  if (version === "0.3.0") throw new Error("fixtures/0.3.0 is released and is never written");
  const manifests = resolve(repository, "fixtures", version);
  const drawings = resolve(manifests, "drawings");
  const readme = resolve(drawings, "README.md");
  if (!existsSync(readme)) throw new Error(`no hand-derived drawings for ${version}`);
  const tag = `v${version}`;
  const tags = spawnSync("git", ["-C", repository, "tag", "--list", tag], { encoding: "utf8" });
  if (tags.status !== 0) throw new Error(`cannot list the tags of ${repository}: ${tags.stderr}`);
  if (tags.stdout.split(/\s+/).includes(tag)) {
    throw new Error(`${tag} is released; its drawings are frozen`);
  }
  const names = readdirSync(manifests)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -5))
    .sort();
  const figures = new Map<string, { svg: string; tex: string }>();
  for (const name of names) {
    const manifest = loadManifest(readFileSync(resolve(manifests, `${name}.json`), "utf8"));
    if (isLoadError(manifest)) throw new Error(`${name}: ${manifest.problems[0]?.message}`);
    const block = layout(manifest);
    figures.set(name, { svg: writeSvg(block), tex: writeTikz(block) });
  }
  for (const name of handDerived(readFileSync(readme, "utf8"))) {
    const figure = figures.get(name);
    if (figure === undefined) throw new Error(`${name}: the README lists a drawing of no manifest`);
    const target = resolve(drawings, name, "figure.svg");
    if (!existsSync(target)) throw new Error(`${name}: the hand-derived figure.svg is missing`);
    if (readFileSync(target, "utf8") !== figure.svg) {
      throw new Error(`${name}: layout disagrees with the hand-derived figure.svg`);
    }
  }
  for (const [name, figure] of figures) {
    mkdirSync(resolve(drawings, name), { recursive: true });
    writeFileSync(resolve(drawings, name, "figure.svg"), figure.svg);
    writeFileSync(resolve(drawings, name, "figure.tex"), figure.tex);
  }
  return names;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repository = process.argv[2];
  if (repository === undefined) {
    throw new Error("usage: node scripts/emit-geometry.ts <timeskeleton checkout>");
  }
  for (const name of emit(resolve(repository))) console.log(`${name}: figure.svg figure.tex`);
}
