import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { documentProblems } from "../src/document/io.ts";
import { TIMELINE_KEYS } from "../src/document/types.ts";
import type { Command, Document } from "../src/index.ts";
import { apply, isCommandError, loadDocument, saveDocument } from "../src/index.ts";
import { createYDoc, toDocument } from "../src/yjs/index.ts";
import { commandFor, sequenceArbitrary } from "./generate.ts";
import { deepFreeze, goldenFixtures, load, manifestKeyOrders } from "./support.ts";

describe("any command sequence leaves a valid document", () => {
  it.each(goldenFixtures.map((fixture) => fixture.name))("from %s", (name) => {
    const start = deepFreeze(load(name));
    fc.assert(
      fc.property(sequenceArbitrary, (seeds) => {
        let document: Document = start;
        for (const seed of seeds) {
          const result = apply(document, commandFor(document, seed) as Command);
          // Every input is frozen, so a reducer that mutated it would throw;
          // a refusal therefore leaves the document exactly as it was.
          if (isCommandError(result)) continue;
          expect(documentProblems(result)).toEqual([]);
          const orders = manifestKeyOrders(result);
          expect(orders).toEqual(orders.map(() => [...TIMELINE_KEYS]));
          expect(saveDocument(toDocument(createYDoc(result)))).toBe(saveDocument(result));
          document = deepFreeze(result);
        }
        expect(loadDocument(saveDocument(document))).toEqual(document);
      }),
      { numRuns: 30 },
    );
  });
});

describe("the generator reaches every refusal a reducer can produce", () => {
  it("over every golden fixture", () => {
    const seen = new Set<string>();
    for (const fixture of goldenFixtures) {
      const start = load(fixture.name);
      for (const seeds of fc.sample(sequenceArbitrary, { numRuns: 40, seed: 20261010 })) {
        let document: Document = start;
        for (const seed of seeds) {
          const result = apply(document, commandFor(document, seed) as Command);
          if (isCommandError(result)) seen.add(result.code);
          else document = result;
        }
      }
    }
    expect([...seen].sort()).toEqual(
      [
        "child_exceeds_parent",
        "child_is_ancestor",
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
        "not_a_root",
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
