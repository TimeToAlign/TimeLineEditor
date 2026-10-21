/**
 * Fixture workspaces built through the store's commands: the end-to-end
 * workspaces (`app/e2e/fixtures/generate.ts`) and the fixture menu's
 * workspaces of one manifest fixture (`fixtures.ts`). The module reads no
 * build flag, so the generator runs it under Node.
 */

import type { Manifest } from "@timetoalign/tilie-core";
import {
  createStore,
  emptyWorkspace,
  isLoadError,
  loadManifest,
  writeWorkspace,
} from "@timetoalign/tilie-core";

/** The author of every journal entry of a fixture workspace. */
export const FIXTURE_AUTHOR = "Fixture Generator";
/** The time of a fixture workspace's first journal entry. */
export const FIXTURE_TIME = "2026-10-12T09:00:00.000Z";
/** The block holding a manifest fixture in the fixture menu's workspace. */
export const FIXTURE_BLOCK = "fixture000";

/** One block of a fixture workspace: id, manifest, x, y. */
export type FixtureBlock = readonly [id: string, manifest: Manifest, x: number, y: number];

/**
 * The workspace text of `blocks`, journalled as one `add` each in their
 * order by `FIXTURE_AUTHOR`, the first at `FIXTURE_TIME` and each next one
 * second later.
 */
export function fixtureWorkspace(blocks: Iterable<FixtureBlock>): string {
  let calls = 0;
  const store = createStore(emptyWorkspace(), {
    author: FIXTURE_AUTHOR,
    clock: () => new Date(Date.parse(FIXTURE_TIME) + 1000 * calls++),
  });
  for (const [id, manifest, x, y] of blocks) {
    const refusal = store.dispatch({
      type: "add",
      into: {},
      block: { id, manifest, x, y },
    });
    if (refusal !== null) throw new Error(`adding ${id} is refused: ${refusal.code}`);
  }
  return writeWorkspace(store.snapshot());
}

/** The workspace text of one block `FIXTURE_BLOCK` at (0, 0) holding the manifest `text`. */
export function manifestWorkspace(name: string, text: string): string {
  const manifest = loadManifest(text);
  if (isLoadError(manifest)) {
    const codes = manifest.problems.map(({ code }) => code).join(", ");
    throw new Error(`the fixture ${name} is refused: ${codes}`);
  }
  return fixtureWorkspace([[FIXTURE_BLOCK, manifest, 0, 0]]);
}
