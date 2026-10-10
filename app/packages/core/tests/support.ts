/**
 * Fixtures shipped by the installed `@timetoalign/timeskeleton` package, read
 * from disk; nothing here writes files or reaches the network.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { canonicalJson, parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import type { Document } from "../src/index.ts";
import { isLoadError, loadDocument } from "../src/index.ts";
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

/** Every golden document of the installed schema version. */
export const goldenFixtures: readonly Fixture[] = jsonFiles(
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

/** Every shared rejection case, its document rendered as text. */
export const rejections: readonly Rejection[] = readdirSync(path.join(fixturesDir, "rejections"))
  .sort()
  .flatMap((version) => {
    const dir = path.join(fixturesDir, "rejections", version);
    return jsonFiles(dir).map((name) => {
      const entry = parseJson(readFileSync(path.join(dir, name), "utf8")) as JsonObject;
      // The rejected document may be anything; its compact text keeps every
      // value and every array position, which is all a pinned path needs.
      return {
        name: `${version}/${name}`,
        text: canonicalJson(entry.document as never),
        path: entry.path as (string | number)[],
      };
    });
  });

export interface MigrationPair {
  readonly name: string;
  readonly target: string;
  readonly before: string;
  readonly after: string;
}

export const migrationPairs: readonly MigrationPair[] = readdirSync(
  path.join(fixturesDir, "migrations"),
)
  .sort()
  .map((name) => {
    const dir = path.join(fixturesDir, "migrations", name);
    return {
      name,
      target: name.split("-to-")[1] as string,
      before: readFileSync(path.join(dir, "before.json"), "utf8"),
      after: readFileSync(path.join(dir, "after.json"), "utf8"),
    };
  });

/** Load a golden fixture, failing loudly if it is refused. */
export function load(name: string): Document {
  const fixture = goldenFixtures.find((item) => item.name === name);
  if (fixture === undefined) throw new Error(`no golden fixture ${name}`);
  const document = loadDocument(fixture.text);
  if (isLoadError(document)) throw new Error(`${name} refused: ${JSON.stringify(document)}`);
  return document;
}

/** Freeze a value deeply, so any mutation of it throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

/** The member order of every timeline manifest of a document, at every depth. */
export function manifestKeyOrders(document: Document): string[][] {
  const orders: string[][] = [];
  const walk = (timeline: Document["manifest"]["timelines"][string]) => {
    orders.push(Object.keys(timeline));
    for (const entry of Object.values(timeline.children)) walk(entry.timeline);
  };
  for (const timeline of Object.values(document.manifest.timelines)) walk(timeline);
  return orders;
}
