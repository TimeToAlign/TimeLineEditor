/**
 * The drawings of the review sheet: every manifest fixture of the installed
 * schema package but the corpus ones (`corpus_*`) at the default placement,
 * plus resized drawings of `nested` (among them its card at the spacings 0
 * and 8), two bundles with items at stated places, a bundle with a scaled
 * card, one with a scaled frame whose member's card requests a size, one
 * with a block spacing and a card spacing of their own, a frame with a
 * spacing of its own, a member's card with a spacing of its own, and
 * three manifests with bands the defaults hide shown by an application
 * layer: a child's regions band, every regions band, and a child's flow
 * control band. Each is also a drawing fixture of the schema package
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
import type { Graphical, Selector } from "@timetoalign/timetoshare";
import { dumps, fontMetrics as metrics, SCHEMA_VERSION } from "@timetoalign/timetoshare";

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve("@timetoalign/timetoshare/package.json"));

/** The manifest fixtures of the installed schema version, sorted into the top, `groups/` and `bundles/`. */
export const fixturesDirectory = path.join(packageDir, "fixtures", SCHEMA_VERSION);

/** The directories of the manifest fixtures below `fixturesDirectory`, each read alone. */
export const MANIFEST_DIRECTORIES = ["", "groups", "bundles"] as const;

/**
 * The names of the manifest files directly in one of `MANIFEST_DIRECTORIES`,
 * sorted, without the minimal twins (`*.minimal.json`), which draw as their
 * complete fixtures do.
 */
export function manifestFiles(directory: string, subdirectory = ""): string[] {
  return readdirSync(path.join(directory, subdirectory))
    .filter((file) => file.endsWith(".json") && !file.endsWith(".minimal.json"))
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
  for (const spacing of [0, 8]) {
    add(`nested__card-spacing-${spacing}`, "nested", at({ places: { clt_1: { spacing } } }));
  }
  add(
    "nested__length-800-card-spacing-8",
    "nested",
    at({ length: 800, places: { clt_1: { spacing: 8 } } }),
  );
  const natural = draw(loadFixture("nested"), DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
  add("nested__block", "nested", at({ width: natural.width + 120, height: natural.height + 60 }));
  add("nested__scale-2", "nested", DEFAULT_PLACEMENT, 2);
  for (const kind of ["group", "bundle"] as const) {
    for (const stem of stems(`${kind}s`)) {
      add(`${kind}__${stem}`, `${kind}s/${stem}`, DEFAULT_PLACEMENT);
    }
  }
  add(
    "bundle_mixed__places",
    "bundles/bundle_mixed",
    at({
      places: { group_2: { x: 40, y: 200, width: 700 }, annotations: { x: -30, length: 300 } },
    }),
  );
  add(
    "bundle_ungrouped__places",
    "bundles/bundle_ungrouped",
    at({ places: { score: { x: -60, y: -150, height: 120 } } }),
  );
  add(
    "bundle_ungrouped__scale",
    "bundles/bundle_ungrouped",
    at({ places: { recording: { scale: 1.5 } } }),
  );
  add(
    "bundle_mixed__cards",
    "bundles/bundle_mixed",
    at({
      places: { group_1: { scale: 1.25, cards: { performance: { width: 650, height: 120 } } } },
    }),
  );
  // `score` is the one root of the three whose card spacing shows; `pages` and `recording` draw
  // nothing a card spacing moves.
  add(
    "bundle_ungrouped__spacing",
    "bundles/bundle_ungrouped",
    at({ spacing: 24, places: { score: { spacing: 8 } } }),
  );
  // `score` is the member of `group_1` whose card has a gap for its spacing to widen (its jump's
  // depth); `performance` draws nothing a card spacing moves.
  add(
    "bundle_mixed__frame-spacing-16",
    "bundles/bundle_mixed",
    at({ places: { group_1: { spacing: 16 } } }),
  );
  add(
    "bundle_mixed__member-card-spacing-8",
    "bundles/bundle_mixed",
    at({ places: { group_1: { cards: { score: { spacing: 8 } } } } }),
  );
  const shown = (select: Selector): Graphical[] => [
    { statements: [{ select, set: { display: "inline" } }] },
  ];
  add(
    "unknown_length_child__regions-shown",
    "unknown_length_child",
    DEFAULT_PLACEMENT,
    1,
    shown({ addresses: [{ id: "movement", facet: "regions" }] }),
  );
  add(
    "unknown_length_segments__regions-shown",
    "unknown_length_segments",
    DEFAULT_PLACEMENT,
    1,
    shown({ element: "band", facet: "regions" }),
  );
  add(
    "child_flow_control__flow-shown",
    "child_flow_control",
    DEFAULT_PLACEMENT,
    1,
    shown({ addresses: [{ id: "verse", facet: "flow_control" }] }),
  );
  return cases;
}

/** The text of a case's `inputs.json`: everything `draw` and the writers need besides the files. */
export function inputsText(item: ReviewCase): string {
  const { length, spacing, width, height, places } = item.placement;
  return dumps({
    manifest: `${item.manifest}.json`,
    placement: { length, spacing, width, height, places },
    scale: item.scale,
    layers: item.settings,
  });
}
