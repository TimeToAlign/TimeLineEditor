/**
 * Shared test helpers: the timeskeleton fixtures of the installed package,
 * documents built through core's commands, and exact geometry numbers.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  apply,
  type Command,
  type CoordinateDict,
  type Document,
  fromFloat,
  isCommandError,
  isLoadError,
  loadDocument,
  Rational,
} from "@timetoalign/tilie-core";
import { isJsonFloat, SCHEMA_VERSION } from "@timetoalign/timeskeleton";

const packageDir = path.dirname(
  createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
);

/** The document fixtures of the installed schema version. */
export const fixturesDir = path.join(packageDir, "fixtures", SCHEMA_VERSION);

/** The golden geometry directories, by specimen name. */
export const geometryDir = path.join(fixturesDir, "geometry");

export function documentNames(): string[] {
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5))
    .sort();
}

export function documentText(name: string): string {
  return readFileSync(path.join(fixturesDir, `${name}.json`), "utf8");
}

export function load(name: string): Document {
  const result = loadDocument(documentText(name));
  if (isLoadError(result)) throw new Error(`${name}: ${JSON.stringify(result.problems)}`);
  return result;
}

/** A document built from the empty fixture by commands, each of which must be accepted. */
export function build(...commands: object[]): Document {
  let document = load("empty");
  for (const command of commands) {
    const result = apply(document, command as Command);
    if (isCommandError(result)) throw new Error(`${result.code}: ${result.message}`);
    document = result;
  }
  return document;
}

/** A Fraction coordinate on the quarters axis. */
export function quarters(numerator: number, denominator = 1): CoordinateDict {
  return { unit: "quarters", number_type: "fraction", value: [numerator, denominator] };
}

/** A new continuous quarters timeline with a Fraction axis. */
export function clt(id: string, length: number, name: string | null = null): object {
  return {
    id,
    class: "ContinuousLogicalTimeline",
    unit: "quarters",
    number_type: "fraction",
    length: quarters(length),
    name,
  };
}

/** The exact value of a number of the geometry. */
export function exact(value: unknown): Rational {
  if (Array.isArray(value)) return Rational.of([value[0] as bigint, value[1] as bigint]);
  if (typeof value === "bigint") return Rational.of(value);
  if (isJsonFloat(value)) return fromFloat(value.value);
  if (typeof value === "number") {
    return Number.isInteger(value) ? Rational.of(BigInt(value)) : fromFloat(value);
  }
  throw new TypeError(`not a geometry number: ${String(value)}`);
}
