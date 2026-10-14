/// <reference types="node" />
/**
 * Views built from the manifest fixtures of the installed
 * `@timetoalign/timeskeleton` package through core's commands.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Block, Command, Manifest, View } from "@timetoalign/tilie-core";
import {
  apply,
  createView,
  isCommandError,
  isLoadError,
  loadManifest,
} from "@timetoalign/tilie-core";
import { fontMetrics, SCHEMA_VERSION } from "@timetoalign/timeskeleton";

export const metrics = fontMetrics;

const packageDir = path.dirname(
  createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
);

export const A = "0000000000";
export const B = "0000000001";
export const C = "0000000002";

/** A manifest fixture of the installed schema version, failing loudly if it is refused. */
export function load(name: string): Manifest {
  const text = readFileSync(
    path.join(packageDir, "fixtures", SCHEMA_VERSION, `${name}.json`),
    "utf8",
  );
  const manifest = loadManifest(text);
  if (isLoadError(manifest)) throw new Error(`${name} refused: ${manifest.problems[0]?.message}`);
  return manifest;
}

/** The view a command leaves, failing loudly if it is refused. */
export function changed(view: View, command: Command | object | null): View {
  const result = apply(view, command);
  if (isCommandError(result)) throw new Error(`${result.code} at ${JSON.stringify(result.path)}`);
  return result;
}

export interface Placed {
  readonly id: string;
  readonly fixture: string;
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
}

/** An empty view with the given blocks added in order, each at its position and scale. */
export function viewOf(...blocks: readonly Placed[]): View {
  return blocks.reduce((view, { id, fixture, x = 0, y = 0, scale }) => {
    const block = { id, manifest: load(fixture), x, y, ...(scale === undefined ? {} : { scale }) };
    return changed(view, { type: "add", into: "workspace", block });
  }, createView());
}

export function blockIn(view: View, id: string): Block {
  const found = view.blocks[id];
  if (found === undefined) throw new Error(`block ${id} is missing`);
  return found;
}

/** The fixture paths of the group and bundle files the tests use. */
export const NUMBERS = "groups/group_number_types";
export const CHILD_MEMBER = "groups/group_child_member";
export const MPM = "bundles/corpus_mpm";

/**
 * Block `id` holding `group_number_types` with `region_1` (2 to 4 quarters,
 * named "A") added to its root `score`, as the README's `numbers`.
 */
export function numbersView(id: string = A): View {
  const quarters = (n: number) => ({ unit: "quarters", number_type: "fraction", value: [n, 1] });
  const region = { id: "region_1", name: "A", start: quarters(2), end: quarters(4), meta: {} };
  return changed(viewOf({ id, fixture: NUMBERS }), {
    type: "add",
    into: `${id}/score`,
    region,
  });
}

/** The view with the grid set. */
export function withGrid(view: View, size: number, snap: boolean): View {
  return changed(view, {
    type: "set",
    changes: [{ target: "workspace", values: { grid: { size, snap } } }],
  });
}
