/**
 * Fixture workspaces built through the store's commands: the end-to-end
 * workspaces (`app/e2e/fixtures/generate.ts`) and the tests' workspaces.
 * The module reads no build flag, so the generator runs it under Node.
 */

import type { Manifest } from "@timetoalign/tilie-core";
import {
  createIdMinter,
  createStore,
  emptyWorkspace,
  writeWorkspace,
} from "@timetoalign/tilie-core";

/** The author of every journal entry of a fixture workspace. */
export const FIXTURE_AUTHOR = "Fixture Generator";
/** The time of a fixture workspace's first journal entry. */
export const FIXTURE_TIME = "2026-10-12T09:00:00.000Z";
/** The seed of the minter of every fixture workspace, so a generator writes the same IDs each run. */
export const FIXTURE_SEED = 20261012n;

/** One block of a fixture workspace: id, manifest, x, y. */
export type FixtureBlock = readonly [id: string, manifest: Manifest, x: number, y: number];

/**
 * The workspace text of `blocks`, journalled as one `add` each in their
 * order by `FIXTURE_AUTHOR`, the first at `FIXTURE_TIME` and each next one
 * second later, every ID a command creates minted by a minter of
 * `FIXTURE_SEED`.
 */
export function fixtureWorkspace(blocks: Iterable<FixtureBlock>): string {
  let calls = 0;
  const store = createStore(emptyWorkspace(), {
    author: FIXTURE_AUTHOR,
    clock: () => new Date(Date.parse(FIXTURE_TIME) + 1000 * calls++),
    minter: createIdMinter({ seed: FIXTURE_SEED }),
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
