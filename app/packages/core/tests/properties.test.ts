import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Store, View } from "../src/index.ts";
import {
  apply,
  checkWorkspace,
  createStore,
  createView,
  isCommandError,
  isLoadError,
  loadManifest,
  readWorkspace,
  replay,
  saveManifest,
  writeWorkspace,
} from "../src/index.ts";
import { commandFor, sequenceArbitrary } from "./generate.ts";
import { A, addBlock, allFixtures, B, changed, testClock } from "./support.ts";

const BLOCKS = [A, B];

function started(fixture: string): Store {
  const store = createStore({ view: createView(), journal: [] }, { clock: testClock() });
  for (const command of [addBlock(A, fixture), addBlock(B, "bare.json")]) {
    expect(store.dispatch(command)).toBeNull();
  }
  return store;
}

const time = (call: number) => new Date(Date.UTC(2026, 9, 11, 14, 3, 12 + call, 418)).toISOString();

describe("generated command sequences", () => {
  it.each(allFixtures.map((fixture) => fixture.name))("keep every invariant from %s", (name) => {
    fc.assert(
      fc.property(sequenceArbitrary, (seeds) => {
        const store = started(name);
        const views: View[] = [store.view];
        for (const seed of seeds) {
          const before = store.view;
          const refused = store.dispatch(commandFor(before, BLOCKS, seed));
          if (refused !== null) {
            expect(store.view).toBe(before);
            continue;
          }
          const view = store.view;
          expect(checkWorkspace(view)).toEqual([]);
          for (const block of Object.values(view.blocks)) {
            const text = saveManifest(block.manifest);
            const loaded = loadManifest(text);
            expect(loaded).toEqual(block.manifest);
            if (!isLoadError(loaded)) expect(saveManifest(loaded)).toBe(text);
          }
          views.push(view);
        }
        const { journal } = store;
        expect(journal.map(({ author, time: at }) => [author, at])).toEqual(
          journal.map((_, index) => ["Gerhardt", time(index)]),
        );
        const replayed = replay(journal).at(-1) as View;
        expect(replayed.settings).toEqual(store.view.settings);
        expect(replayed.blocks).toEqual(store.view.blocks);
        const text = writeWorkspace({ view: store.view, journal });
        const read = readWorkspace(text);
        expect(read).toEqual({ view: store.view, journal });
        if (!isLoadError(read)) expect(writeWorkspace(read)).toBe(text);
        const last = views.length - 1;
        for (let k = last - 1; k >= 0; k -= 1) {
          store.undo();
          expect(store.view).toBe(views[k]);
        }
        for (let k = 1; k <= last; k += 1) {
          store.redo();
          expect(store.view).toBe(views[k]);
        }
      }),
      { numRuns: 10 },
    );
  });
});

describe("the generator reaches the refusal catalogue", () => {
  it("over every manifest fixture", () => {
    const seen = new Set<string>();
    for (const fixture of allFixtures) {
      const start = changed(
        changed(createView(), addBlock(A, fixture.name)),
        addBlock(B, "bare.json"),
      );
      for (const seeds of fc.sample(sequenceArbitrary, { numRuns: 100, seed: 20261011 })) {
        let view = start;
        for (const seed of seeds) {
          const result = apply(view, commandFor(view, BLOCKS, seed));
          if (isCommandError(result)) seen.add(result.code);
          else view = result;
        }
      }
    }
    expect([...seen].sort()).toEqual(
      [
        "child_exceeds_parent",
        "child_not_locked",
        "child_unit_mismatch",
        "duplicate_id",
        "duplicate_index",
        "id_not_settable",
        "invalid_address",
        "invalid_coordinate",
        "invalid_index",
        "invalid_order",
        "invalid_value",
        "length_below_content",
        "locked",
        "map_source_unit_mismatch",
        "negative_offset",
        "non_finite_number",
        "non_positive_number",
        "not_removable",
        "number_type_not_allowed",
        "off_axis",
        "region_end_before_start",
        "schema_violation",
        "unit_not_allowed",
        "unknown_property",
        "unknown_target",
        "unsupported_target",
        "wrong_target_kind",
      ].sort(),
    );
  });
});
