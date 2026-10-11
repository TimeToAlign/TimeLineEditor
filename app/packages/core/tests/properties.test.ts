import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { Manifest, ManifestCommand } from "../src/index.ts";
import {
  applyToManifest,
  isCommandError,
  loadManifest,
  manifestProblems,
  saveManifest,
  TIMELINE_KEYS,
} from "../src/index.ts";
import { manifestMap, readManifest } from "../src/yjs/index.ts";
import { commandFor, sequenceArbitrary } from "./generate.ts";
import { deepFreeze, load, manifestFixtures, manifestKeyOrders } from "./support.ts";

const BLOCK = "0000000000";
const command = (manifest: Manifest, seed: Parameters<typeof commandFor>[1]): ManifestCommand =>
  ({ block: BLOCK, ...commandFor(manifest, seed) }) as ManifestCommand;

describe("any manifest-command sequence stays valid", () => {
  it.each(manifestFixtures.map((fixture) => fixture.name))("from %s", (name) => {
    const start = deepFreeze(load(name));
    fc.assert(
      fc.property(sequenceArbitrary, (seeds) => {
        let manifest: Manifest = start;
        for (const seed of seeds) {
          const result = applyToManifest(manifest, command(manifest, seed));
          if (isCommandError(result)) continue;
          expect(manifestProblems(result)).toEqual([]);
          const orders = manifestKeyOrders(result);
          expect(orders).toEqual(orders.map(() => [...TIMELINE_KEYS]));
          const ydoc = new Y.Doc();
          const map = manifestMap(result);
          ydoc.getMap("root").set("manifest", map);
          expect(saveManifest(readManifest(map))).toBe(saveManifest(result));
          manifest = deepFreeze(result);
        }
        expect(loadManifest(saveManifest(manifest))).toEqual(manifest);
      }),
      { numRuns: 30 },
    );
  });
});

describe("the generator reaches the manifest refusal catalogue", () => {
  it("over every manifest fixture", () => {
    const seen = new Set<string>();
    for (const fixture of manifestFixtures) {
      const start = load(fixture.name);
      for (const seeds of fc.sample(sequenceArbitrary, { numRuns: 40, seed: 20261010 })) {
        let manifest: Manifest = start;
        for (const seed of seeds) {
          const result = applyToManifest(manifest, command(manifest, seed));
          if (isCommandError(result)) seen.add(result.code);
          else manifest = result;
        }
      }
    }
    expect([...seen].sort()).toEqual(
      [
        "child_exceeds_parent",
        "child_unit_mismatch",
        "duplicate_map",
        "duplicate_region",
        "duplicate_timeline",
        "invalid_coordinate",
        "length_below_content",
        "locked",
        "map_source_unit_mismatch",
        "negative_length",
        "negative_offset",
        "not_a_child",
        "number_type_not_allowed",
        "off_axis",
        "region_end_before_start",
        "schema_violation",
        "unit_not_allowed",
        "unknown_break",
        "unknown_jump",
        "unknown_map",
        "unknown_marker",
        "unknown_region",
        "unknown_timeline",
      ].sort(),
    );
  });
});
