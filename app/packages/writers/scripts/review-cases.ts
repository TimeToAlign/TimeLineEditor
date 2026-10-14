/**
 * The drawings of the review sheet: every timeline, group and bundle fixture
 * of the installed schema package but the corpus ones (`corpus_*`) at the
 * default placement, plus resized
 * drawings of `nested` and `map` with its child's map moved below the child.
 * Each is also a drawing fixture of the schema package
 * (`fixtures/<version>/drawings/`).
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { isLoadError, loadManifest, type Manifest } from "@timetoalign/tilie-core";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  manifestLayer,
  type Placement,
} from "@timetoalign/tilie-layout";
import type { Graphical } from "@timetoalign/timeskeleton";
import { dumps, fontMetrics as metrics, SCHEMA_VERSION } from "@timetoalign/timeskeleton";

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve("@timetoalign/timeskeleton/package.json"));

/** The manifest fixtures of the installed schema version: timeline files, `groups/`, `bundles/`. */
export const fixturesDirectory = path.join(packageDir, "fixtures", SCHEMA_VERSION);

/** The directories of the manifest fixtures below `fixturesDirectory`, each read alone. */
export const MANIFEST_DIRECTORIES = ["", "groups", "bundles"] as const;

/** The names of the manifest files directly in one of `MANIFEST_DIRECTORIES`, sorted. */
export function manifestFiles(directory: string, subdirectory = ""): string[] {
  return readdirSync(path.join(directory, subdirectory))
    .filter((file) => file.endsWith(".json"))
    .sort();
}

/** The drawing fixtures of the installed schema version, one directory per review case. */
export const drawingsDirectory = path.join(fixturesDirectory, "drawings");

/** The installed package's `fonts/` directory, holding the drawing font `DejaVuSans.ttf`. */
export const fontDirectory = path.join(packageDir, "fonts");

/** A manifest fixture by its path below `fixturesDirectory`, without `.json`. */
export function loadFixture(name: string): Manifest {
  const manifest = loadManifest(readFileSync(path.join(fixturesDirectory, `${name}.json`), "utf8"));
  if (isLoadError(manifest)) throw new Error(`${name}: ${manifest.problems[0]?.message}`);
  return manifest;
}

export interface ReviewCase {
  /** The file name, without extension. */
  readonly name: string;
  /** The manifest's path below `fixturesDirectory`, without `.json`. */
  readonly manifest: string;
  readonly placement: Placement;
  /** The application's layers, between the defaults and the manifest's own layer. */
  readonly settings: readonly Graphical[];
  readonly layers: readonly (Graphical | undefined)[];
  readonly scale: number;
  readonly drawing: Drawing;
}

/** Every review drawing, in the order the sheet lists them. */
export function reviewCases(): ReviewCase[] {
  const cases: ReviewCase[] = [];
  const add = (
    name: string,
    manifestName: string,
    placement: Placement,
    scale = 1,
    extra: readonly Graphical[] = [],
  ) => {
    const manifest = loadFixture(manifestName);
    const layers = [DEFAULT_LAYER, ...extra, manifestLayer(manifest)];
    cases.push({
      name,
      manifest: manifestName,
      placement,
      settings: extra,
      layers,
      scale,
      drawing: draw(manifest, placement, layers, metrics),
    });
  };
  // The corpus manifests stay out: they are the library's real data, too large to review here.
  const stems = (subdirectory: string) =>
    manifestFiles(fixturesDirectory, subdirectory)
      .map((file) => file.slice(0, -5))
      .filter((stem) => !stem.startsWith("corpus_"));
  for (const name of stems("")) add(name, name, DEFAULT_PLACEMENT);
  const at = (changes: Partial<Placement>): Placement => ({ ...DEFAULT_PLACEMENT, ...changes });
  for (const length of [200, 400, 800]) add(`nested__length-${length}`, "nested", at({ length }));
  for (const spacing of [0.5, 1, 2]) add(`nested__spacing-${spacing}`, "nested", at({ spacing }));
  add("nested__length-800-spacing-2", "nested", at({ length: 800, spacing: 2 }));
  const natural = draw(loadFixture("nested"), DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
  add("nested__box", "nested", at({ width: natural.width + 120, height: natural.height + 60 }));
  add("nested__scale-2", "nested", DEFAULT_PLACEMENT, 2);
  add(
    "nested__order-flow-regions-children",
    "nested",
    at({ order: ["flow", "regions", "children"] }),
  );
  add("map__child-map-below", "map", DEFAULT_PLACEMENT, 1, [
    { statements: [{ select: { ids: ["ticks"] }, set: { side: "below" } }] },
  ]);
  for (const kind of ["group", "bundle"] as const) {
    for (const stem of stems(`${kind}s`)) {
      add(`${kind}__${stem}`, `${kind}s/${stem}`, DEFAULT_PLACEMENT);
    }
  }
  return cases;
}

/** The text of a case's `inputs.json`: everything `draw` and the writers need besides the files. */
export function inputsText(item: ReviewCase): string {
  const { length, spacing, width, height, order } = item.placement;
  return dumps({
    manifest: `${item.manifest}.json`,
    placement: { length, spacing, width, height, order },
    scale: item.scale,
    layers: item.settings,
  });
}
