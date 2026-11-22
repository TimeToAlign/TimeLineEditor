/**
 * The schema package the editor's packages resolve (`@timetoalign/timetoshare`,
 * installed from npm or linked from a sibling checkout): its directory, its
 * schema version, the manifest fixtures of that version, and the bundled
 * face's metrics, which the editor's bundle holds too. Every spec reads them
 * from here, so the suite follows whichever schema package the build used.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type * as Schema from "@timetoalign/timetoshare";
import type { FontMetrics } from "@timetoalign/timetoshare";

/**
 * The schema package's directory, as `core` resolves it. The suite's
 * `tsconfig.json` maps the package's name to the same directory, so its
 * types are the package's own.
 */
export const packageDir = path.dirname(
  createRequire(path.join(import.meta.dirname, "../packages/core/package.json")).resolve(
    "@timetoalign/timetoshare/package.json",
  ),
);

/** The schema package's built entry, loaded from that directory. */
const schema: typeof Schema = await import(
  pathToFileURL(path.join(packageDir, "dist", "index.js")).href
);

/** The schema version whose fixtures the specs import. */
export const SCHEMA_VERSION = schema.SCHEMA_VERSION;

/** The bundled face's advance table: the package's own export, the data the editor draws with. */
export const FONT_METRICS: FontMetrics = schema.fontMetrics;

/** The package's writer and its reader of every serialization, as the editor uses them. */
export const { dumps, loads } = schema;

/**
 * The detail the package's validator gives for the manifest in `text` (a
 * schema refusal), which a refusal shown by the editor repeats; the specs take
 * it from here instead of stating the validator's wording.
 */
export function validatorDetail(text: string): string {
  try {
    schema.validate(schema.withFileIds(schema.loads(text)));
  } catch (error) {
    if (error instanceof schema.SchemaValidationError) return error.detail;
    throw error;
  }
  throw new Error("the manifest is valid");
}

/** The text of a manifest fixture by its path below the schema version's fixtures (`groups/group_styled`). */
export function manifestFixture(name: string): string {
  return readFileSync(path.join(packageDir, "fixtures", SCHEMA_VERSION, `${name}.yaml`), "utf8");
}

/** The text of a statement fixture by its name (`fixtures/<version>/statements/<name>.yaml`). */
export function statementsFixture(name: string): string {
  return manifestFixture(`statements/${name}`);
}
