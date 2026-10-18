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
import { dumps, fontMetrics, parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";

export const metrics = fontMetrics;

const packageDir = path.dirname(
  createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
);

export const A = "0000000000";
export const B = "0000000001";
export const C = "0000000002";

function fixtureText(name: string): string {
  return readFileSync(path.join(packageDir, "fixtures", SCHEMA_VERSION, `${name}.json`), "utf8");
}

function loadText(text: string, name: string): Manifest {
  const manifest = loadManifest(text);
  if (isLoadError(manifest)) throw new Error(`${name} refused: ${manifest.problems[0]?.message}`);
  return manifest;
}

/** A manifest fixture of the installed schema version, failing loudly if it is refused. */
export function load(name: string): Manifest {
  return loadText(fixtureText(name), name);
}

/**
 * A manifest fixture with the timelines `ids` stating `locked: false` in the
 * file itself, before it is read: the way to unlock a segment line whose
 * lock no command lifts (one that is a child, a segment or a group member).
 */
export function loadUnlocked(name: string, ...ids: string[]): Manifest {
  const unlock = (timeline: Record<string, unknown>): Record<string, unknown> => ({
    ...timeline,
    ...(ids.includes(timeline.id as string) ? { locked: false } : {}),
    children: ((timeline.children ?? []) as Record<string, unknown>[]).map(unlock),
  });
  const value = parseJson(fixtureText(name)) as Record<string, unknown>;
  const timelines = (value.timelines as Record<string, unknown>[]).map(unlock);
  return loadText(dumps({ ...value, timelines }), name);
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

/** The fixture paths of the manifests with groups the tests use. */
export const NUMBERS = "groups/group_number_types";
export const CHILD_MEMBER = "groups/group_child_member";
export const MPM = "bundles/corpus_mpm";

/**
 * Block `id` holding `group_number_types` with `region_1` (2 to 4 quarters,
 * named "A") added to its root `score`, as the README's `numbers`.
 */
export function numbersView(id: string = A): View {
  const region = { id: "region_1", name: "A", start: [2, 1], end: [4, 1], meta: {} };
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

/** The fixture path of the bundle of two groups and an ungrouped root the editors' tests use. */
export const MIXED = "bundles/bundle_mixed";

/** The view with the place of item `key` of block `block` merged with `place`. */
export function placed(view: View, block: string, key: string, place: object): View {
  return changed(view, {
    type: "set",
    changes: [{ target: `${block}/${key}`, values: { place } }],
  });
}

/** Block A holding `bundle_mixed` at (40, 80). */
export function mixedPlain(): View {
  return viewOf({ id: A, fixture: MIXED, x: 40, y: 80 });
}

/**
 * `view` with `recording` made a member of `group_1` in block A's
 * `bundle_mixed`, by one `set` of the block's `manifest`: `group_1`'s
 * members `[performance, recording, score]`, displayed `[score,
 * performance, recording]`. `recording`'s card then draws its child
 * `excerpt`, which stays a member of `group_2`, as a child line.
 */
export function recordingInGroup1(view: View): View {
  const { manifest } = blockIn(view, A);
  const members = ["performance", "recording", "score"];
  return changed(view, {
    type: "set",
    changes: [
      {
        target: A,
        values: {
          manifest: {
            ...manifest,
            groups: manifest.groups.map((group) =>
              group.id === "group_1" ? { ...group, members } : group,
            ),
            graphical: {
              ...manifest.graphical,
              order: {
                ...manifest.graphical?.order,
                group_1: ["score", "performance", "recording"],
              },
            },
          },
        },
      },
    ],
  });
}

/**
 * The README's `mixed`: block A holding `bundle_mixed` at (40, 80) with the
 * child `dlt_1` (samples, offset 0, length 44100) added to `excerpt`.
 */
export function mixedView(): View {
  return changed(mixedPlain(), {
    type: "add",
    into: `${A}/excerpt`,
    child: { id: "dlt_1", offset: 0, unit: "samples", length: 44100 },
  });
}
