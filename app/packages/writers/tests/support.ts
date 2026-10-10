/** The golden geometry and figures of the installed timeskeleton package. */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { LosslessGeometry } from "@timetoalign/tilie-layout";
import { parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";

const packageDir = path.dirname(
  createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
);

export const geometryDir = path.join(packageDir, "fixtures", SCHEMA_VERSION, "geometry");

export function specimens(): string[] {
  return readdirSync(geometryDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function goldenPath(name: string, file: string): string {
  return path.join(geometryDir, name, file);
}

export function golden(name: string, file: string): string {
  return readFileSync(goldenPath(name, file), "utf8");
}

export function geometry(name: string): LosslessGeometry {
  return parseJson(golden(name, "geometry.json")) as unknown as LosslessGeometry;
}
