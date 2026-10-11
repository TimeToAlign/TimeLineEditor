import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Command, Manifest, View } from "../src/index.ts";
import {
  apply,
  checkWorkspace,
  createView,
  isCommandError,
  isLoadError,
  loadManifest,
  saveManifest,
} from "../src/index.ts";
import { commandFor, sequenceArbitrary } from "./generate.ts";
import { deepFreeze, load, manifestFixtures } from "./support.ts";

const BLOCK = "0000000000";

function manifest(view: View): Manifest {
  const record = view.records[BLOCK];
  if (record?.kind !== "block") throw new Error("the generated block is missing");
  return record.manifest;
}

describe("generated workspace edits", () => {
  it.each(manifestFixtures.map((fixture) => fixture.name))(
    "keep the view valid from %s",
    (name) => {
      let initial = createView({ created: "2026-10-11T00:00:00Z", generator: "properties" });
      const created = apply(initial, {
        type: "createBlock",
        id: BLOCK,
        manifest: load(name),
        x: 0,
        y: 0,
      });
      if (isCommandError(created)) throw new Error(created.message);
      initial = deepFreeze(created);
      fc.assert(
        fc.property(sequenceArbitrary, (seeds) => {
          let view = initial;
          for (const seed of seeds) {
            const current = manifest(view);
            const next = apply(view, {
              block: BLOCK,
              ...commandFor(current, seed),
            } as Command);
            if (isCommandError(next)) {
              expect(view).toBe(view);
              continue;
            }
            expect(checkWorkspace(next)).toEqual([]);
            const text = saveManifest(manifest(next));
            const loaded = loadManifest(text);
            expect(isLoadError(loaded)).toBe(false);
            expect(loaded).toEqual(manifest(next));
            if (!isLoadError(loaded)) expect(saveManifest(loaded)).toBe(text);
            view = deepFreeze(next);
          }
        }),
        { numRuns: 10 },
      );
    },
  );
});
