/**
 * The manifests the tests read: the fixtures shipped by the installed
 * `@timetoalign/timeskeleton` package, read from disk; nothing here writes
 * files or reaches the network.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { canonicalJson, dumps, parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import type { Block, Command, Manifest, View } from "../src/index.ts";
import { apply, createView, isCommandError, isLoadError, loadManifest } from "../src/index.ts";
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

/** A fixture with the text of its minimal twin (`<name>.minimal.json`). */
export interface FixtureWithTwin extends Fixture {
  readonly twin: string;
}

/** The fixtures directly in `fixtures/<version>/<subdirectory>`, named by their path below `fixtures/<version>/`. */
function fixturesIn(subdirectory = ""): FixtureWithTwin[] {
  const dir = path.join(fixturesDir, SCHEMA_VERSION, subdirectory);
  const read = (name: string) => readFileSync(path.join(dir, name), "utf8");
  return jsonFiles(dir)
    .filter((name) => !name.endsWith(".minimal.json"))
    .map((name) => ({
      name: subdirectory === "" ? name : `${subdirectory}/${name}`,
      text: read(name),
      twin: read(name.replace(/\.json$/, ".minimal.json")),
    }));
}

/** Every manifest fixture of the installed schema version, its own, `groups/…` and `bundles/…`, each with its twin. */
export const allFixtures: readonly FixtureWithTwin[] = [
  ...fixturesIn(),
  ...fixturesIn("groups"),
  ...fixturesIn("bundles"),
];

export interface Rejection {
  readonly name: string;
  readonly text: string;
  readonly path: readonly PathSegment[];
}

/** Every shared rejection case of the installed schema version, its value rendered as text. */
export const rejections: readonly Rejection[] = (() => {
  const dir = path.join(fixturesDir, "rejections", SCHEMA_VERSION);
  return jsonFiles(dir).map((name) => {
    const entry = parseJson(readFileSync(path.join(dir, name), "utf8")) as JsonObject;
    // The rejected value may be anything; its compact text keeps every
    // value and every array position, which is all a pinned path needs.
    return {
      name,
      text: canonicalJson((entry.manifest ?? entry.document) as never),
      path: entry.path as (string | number)[],
    };
  });
})();

/** The manifest fixture named by its path below `fixtures/<version>/`, e.g. `groups/group_styled.json`. */
export function fixture(name: string): FixtureWithTwin {
  const found = allFixtures.find((item) => item.name === name);
  if (found === undefined) throw new Error(`no manifest fixture ${name}`);
  return found;
}

/** The text of a manifest fixture, in the complete form. */
export function fixtureText(name: string): string {
  return fixture(name).text;
}

/** Load a manifest from its text, failing loudly if it is refused. */
export function loadText(text: string, name = "the manifest"): Manifest {
  const manifest = loadManifest(text);
  if (isLoadError(manifest)) throw new Error(`${name} refused: ${JSON.stringify(manifest)}`);
  return manifest;
}

/** Load a manifest fixture, failing loudly if it is refused. */
export function load(name: string): Manifest {
  return loadText(fixtureText(name), name);
}

/** The value of a manifest fixture's text, losslessly, to change before loading it. */
export function manifestValue(name: string): Record<string, unknown> {
  return parseJson(fixtureText(name)) as Record<string, unknown>;
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

/** The `add` command of a block holding a manifest fixture at (0, 0). */
export function addBlock(id: string, name: string): Command {
  return { type: "add", into: "workspace", block: { id, manifest: load(name), x: 0, y: 0 } };
}

/** An empty view with one block per `[id, name]` pair of a manifest fixture, added in that order. */
export function viewOf(...blocks: (readonly [string, string])[]): View {
  return blocks.reduce((view, [id, name]) => changed(view, addBlock(id, name)), createView());
}

/**
 * A view with block `A` holding a manifest fixture whose timelines `ids`
 * state `locked: false` before it is read, which reading keeps where no
 * command could lift the lock (a segment line that is a child, a segment or
 * a group member).
 */
export function unlockedView(name: string, ...ids: string[]): View {
  const unlock = (timeline: Record<string, unknown>): Record<string, unknown> => ({
    ...timeline,
    ...(ids.includes(timeline.id as string) ? { locked: false } : {}),
    children: (timeline.children as Record<string, unknown>[]).map(unlock),
  });
  const value = manifestValue(name);
  const manifest = loadText(
    dumps({ ...value, timelines: (value.timelines as Record<string, unknown>[]).map(unlock) }),
    name,
  );
  return changed(createView(), {
    type: "add",
    into: "workspace",
    block: { id: A, manifest, x: 0, y: 0 },
  });
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
