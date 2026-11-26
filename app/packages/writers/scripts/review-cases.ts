/**
 * The drawings of the review sheet: every manifest fixture of the installed
 * schema package but the corpus ones (`corpus_*`) at the default placement,
 * plus resized drawings of `nested` (among them its card at the spacings 0
 * and 8), two bundles with items at stated places, a bundle with a scaled
 * card, one with a scaled frame whose member's card requests a size, one
 * with a block spacing and a card spacing of their own, a frame with a
 * spacing of its own, a member's card with a spacing of its own,
 * three manifests whose ancestor cards, which the
 * defaults show, an application layer hides: a root reaching past its
 * member on both sides, one reaching past it to the right, and three roots
 * of three axes behind one frame; four manifests whose elided ancestor cards
 * a rule draws whole, `{element: elision}` hidden; one with its elisions
 * drawn for a smaller view; one whose ancestor card's derived elisions show
 * their name and coordinate labels, and the same card in the mode `custom`,
 * which draws it whole while no card elision is stored; a frame whose group
 * elisions its mode `full` leaves out; and a bundle whose second frame, at
 * the scale 1.5, draws the gap of the elision on its shared member; and
 * five arranged bundles: one under another in a stored order, and side by
 * side with every root that groups hang on drawn once behind the row, the
 * bundle "Arranged" in a stored order the row repairs, the LayerIt suite, a
 * bundle with a root member, and one whose groups overlap on their root, which
 * is refused and drawn one under another; `flow/virtual_cards` with its
 * three virtual timelines placed; and `flow/switched_card`, its card
 * switched to a FlowMap. Each is also a drawing fixture of the schema
 * package (`fixtures/<version>/drawings/`).
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
import { writeSvg, writeTikz } from "../src/index.ts";

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve("@timetoalign/timetoshare/package.json"));

/** The manifest fixtures of the installed schema version, sorted into the top, `groups/` and `bundles/`. */
export const fixturesDirectory = path.join(packageDir, "fixtures", SCHEMA_VERSION);

/** The directories of the manifest fixtures below `fixturesDirectory`, each read alone. */
export const MANIFEST_DIRECTORIES = ["", "groups", "bundles"] as const;

/**
 * The names of the manifest files directly in one of `MANIFEST_DIRECTORIES`,
 * sorted, without the minimal twins (`*.minimal.yaml`), which draw as their
 * complete fixtures do.
 */
export function manifestFiles(directory: string, subdirectory = ""): string[] {
  return readdirSync(path.join(directory, subdirectory))
    .filter((file) => file.endsWith(".yaml") && !file.endsWith(".minimal.yaml"))
    .sort();
}

/** The drawing fixtures of the installed schema version, one directory per review case. */
export const drawingsDirectory = path.join(fixturesDirectory, "drawings");

/** The installed package's `fonts/` directory, holding the drawing fonts, `FONT_FILES`. */
export const fontDirectory = path.join(packageDir, "fonts");

/** A manifest fixture by its path below `fixturesDirectory`, without `.yaml`. */
export function loadFixture(name: string): Manifest {
  const manifest = loadManifest(readFileSync(path.join(fixturesDirectory, `${name}.yaml`), "utf8"));
  if (isLoadError(manifest)) throw new Error(`${name}: ${manifest.problems[0]?.message}`);
  return manifest;
}

/**
 * A manifest drawn as every review case draws one: under the defaults, the
 * application's layers `settings` and the manifest's own layer, in that
 * order, with the schema package's font metrics.
 */
export function drawManifest(
  manifest: Manifest,
  placement: Placement,
  settings: readonly Graphical[] = [],
): Drawing {
  return draw(manifest, placement, [DEFAULT_LAYER, ...settings, manifestLayer(manifest)], metrics);
}

/** The SVG and the standalone TikZ document of a drawing placed at `(0, 0)` with `scale`. */
export function figures(drawing: Drawing, scale: number): { svg: string; tex: string } {
  const placed = [{ drawing, x: 0, y: 0, scale }];
  return { svg: writeSvg(placed), tex: writeTikz(placed) };
}

/** One drawing of the review sheet: the manifest, placement, layers and scale it is drawn from. */
export interface ReviewCase {
  /** The file name, without extension. */
  readonly name: string;
  /** The manifest's path below `fixturesDirectory`, without `.yaml`. */
  readonly manifest: string;
  readonly placement: Placement;
  /** The application's layers, between the defaults and the manifest's own layer. */
  readonly settings: readonly Graphical[];
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
    cases.push({
      name,
      manifest: manifestName,
      placement,
      settings: extra,
      scale,
      drawing: drawManifest(loadFixture(manifestName), placement, extra),
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
  // The virtual timelines of `flow/virtual_cards`, each placed at its default place.
  add(
    "flow__virtual_cards",
    "flow/virtual_cards",
    at({ places: { allegro_by_hand: {}, allegro_default: {}, allegro_single: {} } }),
  );
  // A card switched to a FlowMap (section 8.10).
  add("flow__switched_card", "flow/switched_card", DEFAULT_PLACEMENT);
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
  const hidden = (select: Selector): Graphical[] => [
    { rules: [{ select, set: { display: "none" } }] },
  ];
  for (const stem of ["group_parent_both", "group_parent_right", "group_parents_mixed"]) {
    add(
      `group__${stem}__ancestor-cards-hidden`,
      `groups/${stem}`,
      DEFAULT_PLACEMENT,
      1,
      hidden({ element: "ancestor_card" }),
    );
  }
  for (const stem of [
    "group_elided_inside",
    "group_grandchild",
    "group_grandchild_parent_on_top",
    "group_parents_mixed",
  ]) {
    add(
      `group__${stem}__full`,
      `groups/${stem}`,
      DEFAULT_PLACEMENT,
      1,
      hidden({ element: "elision" }),
    );
  }
  add(
    "bundle__bundle_elided_layerit__view-1024x640",
    "bundles/bundle_elided_layerit",
    at({ view: { width: 1024, height: 640 } }),
  );
  const piece = { addresses: [{ id: "piece", part: ["card"] }] } satisfies Selector;
  add("group__group_elided_inside__labels", "groups/group_elided_inside", DEFAULT_PLACEMENT, 1, [
    { rules: [{ select: piece, set: { "elision-display": "ellipsis name coordinate" } }] },
  ]);
  add("group__group_elided_inside__custom", "groups/group_elided_inside", DEFAULT_PLACEMENT, 1, [
    { rules: [{ select: piece, set: { "elision-mode": "custom" } }] },
  ]);
  add("group__group_elided_members__full", "groups/group_elided_members", DEFAULT_PLACEMENT, 1, [
    { rules: [{ select: { addresses: [{ id: "group_1" }] }, set: { "elision-mode": "full" } }] },
  ]);
  add(
    "bundle__bundle_groupstamp_shared_member__scaled",
    "bundles/bundle_groupstamp_shared_member",
    at({ places: { g2: { scale: 1.5 } } }),
  );
  const stored = ["page", "group_3", "group_1", "group_2"];
  add(
    "bundle__bundle_arranged_roots__vertical",
    "bundles/bundle_arranged_roots",
    at({ arrangement: { direction: "vertical", order: stored } }),
  );
  add(
    "bundle__bundle_arranged_roots__horizontal",
    "bundles/bundle_arranged_roots",
    at({ arrangement: { direction: "horizontal", order: stored } }),
  );
  for (const stem of [
    "bundle_elided_layerit",
    "bundle_shared_parent",
    "bundle_arranged_conflict",
  ]) {
    add(
      `bundle__${stem}__horizontal`,
      `bundles/${stem}`,
      at({ arrangement: { direction: "horizontal", order: [] } }),
    );
  }
  return cases;
}

/**
 * The text of a case's `inputs.json`, in pretty JSON: everything `draw` and
 * the writers need besides the files, the manifest named by its file; the
 * placement's `view` and `arrangement` only where the case states them.
 */
export function inputsText(item: ReviewCase): string {
  const { length, spacing, width, height, places, view, arrangement } = item.placement;
  return dumps(
    {
      manifest: `${item.manifest}.yaml`,
      placement: {
        length,
        spacing,
        width,
        height,
        places,
        ...(view === undefined ? {} : { view }),
        ...(arrangement === undefined || arrangement === null ? {} : { arrangement }),
      },
      scale: item.scale,
      layers: item.settings,
    },
    { serialization: "json" },
  );
}
