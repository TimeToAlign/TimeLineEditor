/**
 * Fixtures shipped by the installed `@timetoalign/timeskeleton` package, read
 * from disk; nothing here writes files or reaches the network.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { canonicalJson, parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
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

/** Every manifest fixture of the installed schema version. */
export const manifestFixtures: readonly Fixture[] = jsonFiles(
  path.join(fixturesDir, SCHEMA_VERSION),
).map((name) => ({
  name,
  text: readFileSync(path.join(fixturesDir, SCHEMA_VERSION, name), "utf8"),
}));

export interface Rejection {
  readonly name: string;
  readonly text: string;
  readonly path: readonly PathSegment[];
}

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

/** Load a manifest fixture, failing loudly if it is refused. */
export function load(name: string): Manifest {
  const fixture = manifestFixtures.find((item) => item.name === name);
  if (fixture === undefined) throw new Error(`no manifest fixture ${name}`);
  const manifest = loadManifest(fixture.text);
  if (isLoadError(manifest)) throw new Error(`${name} refused: ${JSON.stringify(manifest)}`);
  return manifest;
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
export function addBlock(id: string, fixture: string): Command {
  return { type: "add", into: "workspace", block: { id, manifest: load(fixture), x: 0, y: 0 } };
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
