/**
 * Fixtures shipped by the installed `@timetoalign/timeskeleton` package, read
 * from disk; nothing here writes files or reaches the network.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { canonicalJson, parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import type {
  Block,
  Command,
  Manifest,
  TimelineFile,
  TimelineManifest,
  View,
} from "../src/index.ts";
import {
  apply,
  createView,
  isCommandError,
  isLoadError,
  loadManifest,
  manifestKind,
} from "../src/index.ts";
import type { JsonObject, PathSegment } from "../src/json.ts";

const packageDir = path.dirname(
  createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
);
const fixturesDir = path.join(packageDir, "fixtures");

export interface Fixture {
  readonly name: string;
  readonly text: string;
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

/** The fixtures directly in `fixtures/<version>/<subdirectory>`, named by their path below `fixtures/<version>/`. */
function fixturesIn(version: string, subdirectory = ""): Fixture[] {
  const dir = path.join(fixturesDir, version, subdirectory);
  return jsonFiles(dir).map((name) => ({
    name: subdirectory === "" ? name : `${subdirectory}/${name}`,
    text: readFileSync(path.join(dir, name), "utf8"),
  }));
}

/** Every timeline-file fixture of the installed schema version. */
export const manifestFixtures: readonly Fixture[] = fixturesIn(SCHEMA_VERSION);

/** Every group-file fixture of the installed schema version, named `groups/<file>`. */
export const groupFixtures: readonly Fixture[] = fixturesIn(SCHEMA_VERSION, "groups");

/** Every bundle-file fixture of the installed schema version, named `bundles/<file>`. */
export const bundleFixtures: readonly Fixture[] = fixturesIn(SCHEMA_VERSION, "bundles");

/** The fixtures of every file kind. */
export const allFixtures: readonly Fixture[] = [
  ...manifestFixtures,
  ...groupFixtures,
  ...bundleFixtures,
];

/** The timeline-file fixtures of an earlier schema version. */
export function olderFixtures(version: string): readonly Fixture[] {
  return fixturesIn(version);
}

export interface Rejection {
  readonly name: string;
  readonly text: string;
  readonly path: readonly PathSegment[];
}

export interface MigrationPair {
  readonly name: string;
  readonly before: string;
  readonly after: string;
}

/** Every migration pair `fixtures/migrations/<from>-to-<to>/`, its two texts. */
export const migrationPairs: readonly MigrationPair[] = readdirSync(
  path.join(fixturesDir, "migrations"),
)
  .sort()
  .map((name) => {
    const dir = path.join(fixturesDir, "migrations", name);
    const read = (file: string) => readFileSync(path.join(dir, file), "utf8");
    return { name, before: read("before.json"), after: read("after.json") };
  });

/** Every shared rejection case, its value rendered as text. */
export const rejections: readonly Rejection[] = readdirSync(path.join(fixturesDir, "rejections"))
  .sort()
  .flatMap((version) => {
    const dir = path.join(fixturesDir, "rejections", version);
    return jsonFiles(dir).map((name) => {
      const entry = parseJson(readFileSync(path.join(dir, name), "utf8")) as JsonObject;
      // The rejected value may be anything; its compact text keeps every
      // value and every array position, which is all a pinned path needs.
      return {
        name: `${version}/${name}`,
        text: canonicalJson((entry.manifest ?? entry.document) as never),
        path: entry.path as (string | number)[],
      };
    });
  });

/** Load a fixture of any kind (`groups/…`, `bundles/…`), failing loudly if it is refused. */
export function loadFile(name: string): Manifest {
  const fixture = allFixtures.find((item) => item.name === name);
  if (fixture === undefined) throw new Error(`no manifest fixture ${name}`);
  const manifest = loadManifest(fixture.text);
  if (isLoadError(manifest)) throw new Error(`${name} refused: ${JSON.stringify(manifest)}`);
  return manifest;
}

/** Load a timeline-file fixture, failing loudly if it is refused or of another kind. */
export function load(name: string): TimelineFile {
  const manifest = loadFile(name);
  if (manifestKind(manifest) !== "timeline") throw new Error(`${name} is no timeline file`);
  return manifest as TimelineFile;
}

/**
 * A timeline file of the latest version written as an earlier version
 * declares it: `is_segment_line` (0.7.0 on) removed from every timeline, the
 * declaration changed. Only for files without segment lines, whose migration
 * gives the latest file back.
 */
export function asVersion(manifest: TimelineFile, version: string): object {
  const older = (timeline: TimelineManifest): object => {
    const { is_segment_line: _, ...rest } = timeline;
    const children = Object.fromEntries(
      Object.entries(timeline.children).map(([key, entry]) => [
        key,
        { ...entry, timeline: older(entry.timeline) },
      ]),
    );
    return { ...rest, children };
  };
  if (version === SCHEMA_VERSION) return manifest;
  return {
    ...manifest,
    meta: { ...manifest.meta, schema_version: version },
    timeline: older(manifest.timeline),
  };
}

/** Freeze a value deeply, so any mutation of it throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export const A = "0000000000";
export const B = "0000000001";
export const C = "0000000002";

/** The view a command leaves, failing loudly if it is refused. */
export function changed(view: View, command: Command | object): View {
  const result = apply(view, command);
  if (isCommandError(result)) throw new Error(`${result.code} at ${JSON.stringify(result.path)}`);
  return result;
}

/** The `add` command of a block holding a manifest fixture of any kind at (0, 0). */
export function addBlock(id: string, fixture: string): Command {
  return { type: "add", into: "workspace", block: { id, manifest: loadFile(fixture), x: 0, y: 0 } };
}

/** An empty view with one block per `[id, fixture]` pair, added in that order. */
export function viewOf(...blocks: (readonly [string, string])[]): View {
  return blocks.reduce((view, [id, fixture]) => changed(view, addBlock(id, fixture)), createView());
}

export function block(view: View, id = A): Block {
  const found = view.blocks[id];
  if (found === undefined) throw new Error(`block ${id} is missing`);
  return found;
}

/** A clock from 2026-10-11T14:03:12.418Z on, one second later at every call. */
export function testClock(): () => Date {
  let calls = 0;
  return () => new Date(Date.UTC(2026, 9, 11, 14, 3, 12 + calls++, 418));
}

/** The code and path of a refusal, failing loudly if there was none. */
export function refusal(result: unknown): { code: string; path: readonly (string | number)[] } {
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, path: result.path };
}
