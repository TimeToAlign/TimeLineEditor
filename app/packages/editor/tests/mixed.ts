/// <reference types="node" />
/** Three blocks of the bundle fixture `bundle_mixed`, named three ways (`README.md`, "Words"). */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Store, View } from "@timetoalign/tilie-core";
import { createStore, emptyWorkspace, isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { dumps, isJsonObject, parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";

/** The blocks: the fixture as it is; without its title, with the id `mixed` and two names dropped; without its title. */
export const MIXED = { A: "0000000000", B: "0000000001", C: "0000000002" } as const;

const FIXTURE = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
  "fixtures",
  SCHEMA_VERSION,
  "bundles",
  "bundle_mixed.json",
);

type Editable = { [key: string]: unknown };

/** `bundle_mixed`, changed by `edit` first. */
function mixed(edit: (manifest: Editable) => void = () => {}) {
  const value: unknown = parseJson(readFileSync(FIXTURE, "utf8"));
  if (!isJsonObject(value)) throw new Error("bundle_mixed is no JSON object");
  edit(value);
  const manifest = loadManifest(dumps(value));
  if (isLoadError(manifest)) throw new Error(manifest.problems[0]?.message);
  return manifest;
}

/** A store holding the three blocks, added by three `add`s. */
export function mixedStore(options: Parameters<typeof createStore>[1] = {}): Store {
  const store = createStore(emptyWorkspace(), options);
  const manifests = [
    [MIXED.A, mixed()],
    [
      MIXED.B,
      mixed((manifest) => {
        delete manifest.name;
        manifest.id = "mixed";
        const groups = manifest.groups as Editable[];
        delete (groups.find((group) => group.id === "group_2") as Editable).name;
        const roots = manifest.timelines as Editable[];
        delete (roots.find((root) => root.id === "score") as Editable).name;
      }),
    ],
    [
      MIXED.C,
      mixed((manifest) => {
        delete manifest.name;
      }),
    ],
  ] as const;
  for (const [id, manifest] of manifests) {
    const error = store.dispatch({
      type: "add",
      into: "workspace",
      block: { id, manifest, x: 0, y: 0 },
    });
    if (error !== null) throw new Error(error.message);
  }
  return store;
}

/** The view of `mixedStore`. */
export function mixedView(): View {
  return mixedStore().view;
}
