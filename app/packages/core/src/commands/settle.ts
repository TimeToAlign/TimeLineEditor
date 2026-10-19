/**
 * What every command leaves behind it: each manifest it changed in its
 * complete form and canonical order (an added element may leave out what has
 * a default), checked against the schema and the invariants, and the
 * block's places fitted to the drawing the manifest now makes.
 */

import type { CommandError } from "../errors.ts";
import { containersOf, keptPlace } from "../manifest/containers.ts";
import { checkOrdered } from "../manifest/invariants.ts";
import { completeOrdered, schemaProblems } from "../manifest/io.ts";
import type { Manifest } from "../manifest/types.ts";
import type { Block } from "../workspace/blocks.ts";
import type { View } from "../workspace/view.ts";
import type { ChangeSet } from "./mutations.ts";
import { withBlock } from "./mutations.ts";

/**
 * `places` with only the keys naming a frame or a card of `manifest`, each
 * place cut to the members its holder lets it state (`placeMembersOf`) and
 * dropped when nothing is left: a root that became a member keeps its card's
 * size and vertical stretch; `places` itself when nothing goes.
 */
function keptPlaces(places: Block["places"], manifest: Manifest): Block["places"] {
  const { byKey } = containersOf(manifest);
  let changed = false;
  const kept = Object.entries(places).flatMap(([key, place]) => {
    const container = byKey.get(key);
    const fitted = container === undefined ? undefined : keptPlace(container, place);
    if (fitted !== place) changed = true;
    return fitted === undefined ? [] : [[key, fitted] as const];
  });
  return changed ? Object.fromEntries(kept) : places;
}

/**
 * Settle each manifest `changes` names: complete it, order it and, with
 * `checked`, refuse its first schema or invariant problem, at `[<block id>,
 * "manifest", …]`; then fit its block's places to it. A block the command
 * removed is passed over.
 */
export function settle(view: View, changes: ChangeSet, checked: boolean): View | CommandError {
  let current = view;
  for (const id of changes.manifests) {
    const block = current.blocks[id];
    if (block === undefined) continue;
    const manifest = completeOrdered(block.manifest);
    if ("code" in manifest) return { ...manifest, path: [id, "manifest", ...manifest.path] };
    if (checked) {
      // The invariants read a manifest the schema accepts, so they run only then.
      const schema = schemaProblems(manifest);
      const [first] = schema.length > 0 ? schema : checkOrdered(manifest);
      if (first !== undefined) return { ...first, path: [id, "manifest", ...first.path] };
    }
    current = withBlock(current, {
      ...block,
      places: keptPlaces(block.places, manifest),
      manifest,
    });
  }
  return current;
}
