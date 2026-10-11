/** Shared manifest fixtures, command builders, and exact geometry numbers. */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  apply,
  type Command,
  type CoordinateDict,
  createView,
  fromFloat,
  isCommandError,
  isLoadError,
  loadManifest,
  type Manifest,
  Rational,
} from "@timetoalign/tilie-core";
import { isJsonFloat, SCHEMA_VERSION } from "@timetoalign/timeskeleton";

const packageDir = path.dirname(
  createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
);

export const fixturesDir = path.join(packageDir, "fixtures", SCHEMA_VERSION);
export const legacyGeometryDir = "/home/laser/git/tta/timeskeleton/fixtures/0.3.0/geometry";
export const BLOCK = "0000000000";

export function manifestNames(): string[] {
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5))
    .sort();
}

export function manifestText(name: string): string {
  return readFileSync(path.join(fixturesDir, `${name}.json`), "utf8");
}

export function load(name: string): Manifest {
  const result = loadManifest(manifestText(name));
  if (isLoadError(result)) throw new Error(`${name}: ${result.problems[0]?.message}`);
  return result;
}

const CLASS_FIXTURE: Readonly<Record<string, string>> = {
  ContinuousLogicalTimeline: "bare",
  DiscreteLogicalTimeline: "discrete_logical",
  ContinuousPhysicalTimeline: "continuous_physical",
  DiscretePhysicalTimeline: "discrete_physical",
  ContinuousGraphicalTimeline: "continuous_graphical",
  DiscreteGraphicalTimeline: "discrete_graphical",
};

/** Build one manifest by creating a block and then applying manifest commands. */
export function build(first: Record<string, unknown>, ...commands: object[]): Manifest {
  if (first.type !== "createTimeline") throw new Error("the first test command creates the root");
  const fixture = CLASS_FIXTURE[first.class as string];
  if (fixture === undefined) throw new Error(`unknown timeline class ${String(first.class)}`);
  const source = load(fixture);
  const timeline = {
    ...source.timeline,
    id: first.id as string,
    name: (first.name ?? null) as string | null,
    class: first.class as Manifest["timeline"]["class"],
    unit: first.unit as Manifest["timeline"]["unit"],
    number_type: first.number_type as Manifest["timeline"]["number_type"],
    length: first.length as Manifest["timeline"]["length"],
    locked: false,
    meta: {},
    children: {},
    conversion_maps: [],
    regions: [],
    flow_control: { breaks: [], jumps: [], markers: {} },
    measure_map: null,
    metric_hierarchy: null,
  };
  let view = createView({ created: "2026-10-11T00:00:00Z", generator: "layout-tests" });
  const created = apply(view, {
    type: "createBlock",
    id: BLOCK,
    manifest: { meta: source.meta, timeline },
    x: 0,
    y: 0,
  });
  if (isCommandError(created)) throw new Error(`${created.code}: ${created.message}`);
  view = created;
  for (const command of commands) {
    const changed = apply(view, { block: BLOCK, ...command } as Command);
    if (isCommandError(changed)) throw new Error(`${changed.code}: ${changed.message}`);
    view = changed;
  }
  const record = view.records[BLOCK];
  if (record?.kind !== "block") throw new Error("the test block is missing");
  return record.manifest;
}

export function quarters(numerator: number, denominator = 1): CoordinateDict {
  return { unit: "quarters", number_type: "fraction", value: [numerator, denominator] };
}

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

export function exact(value: unknown): Rational {
  if (Array.isArray(value)) return Rational.of([value[0] as bigint, value[1] as bigint]);
  if (typeof value === "bigint") return Rational.of(value);
  if (isJsonFloat(value)) return fromFloat(value.value);
  if (typeof value === "number") {
    return Number.isInteger(value) ? Rational.of(BigInt(value)) : fromFloat(value);
  }
  throw new TypeError(`not a geometry number: ${String(value)}`);
}
