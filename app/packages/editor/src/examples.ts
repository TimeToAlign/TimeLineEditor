/**
 * The Examples menu: a few manifest fixtures of the installed schema
 * package's version, chosen to show what the editor draws, each imported as
 * one more block; then workspaces written by the end-to-end fixture
 * generator into `examples/`, each opened as the workspace. Every file is a
 * chunk of its own, loaded when it is chosen.
 */

import { SCHEMA_VERSION } from "@timetoalign/timetoshare";

/** How an example is read: a manifest imported as a block, or a workspace opened. */
export type ExampleKind = "manifest" | "workspace";

export interface Example {
  /** The menu's label. */
  readonly label: string;
  readonly kind: ExampleKind;
  /** The file's text, fetched on first use. */
  readonly text: () => Promise<string>;
}

/** The files a glob found: path → their text, loaded on demand. */
type Files = Record<string, () => Promise<string>>;

/** Each manifest example's label and its fixture's path below `fixtures/<version>/`, without `.yaml`. */
const MANIFESTS: readonly (readonly [label: string, fixture: string])[] = [
  ["Score, performance and facsimile", "bundles/bundle_mixed"],
  ["Sonata in two takes", "bundles/bundle_shared_parent"],
  ["Styled edition", "groups/group_styled"],
  ["Repeats and jumps", "flow_control"],
];

/** Each workspace example's label and its file below `examples/`. */
const WORKSPACES: readonly (readonly [label: string, file: string])[] = [
  ["Timestamps", "timestamps.tle.json"],
];

/** The text of the file among `files` whose path ends in `/<file>`. */
function found(files: Files, file: string): () => Promise<string> {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${file}`));
  if (entry === undefined) throw new Error(`the example ${file} is missing`);
  return entry[1];
}

/**
 * The examples in menu order: the manifests, each read from the fixture of
 * `SCHEMA_VERSION` among `fixtures`, then the workspaces among `workspaces`.
 */
export function examples(fixtures: Files, workspaces: Files): Example[] {
  return [
    ...MANIFESTS.map(([label, fixture]) => ({
      label,
      kind: "manifest" as const,
      text: found(fixtures, `fixtures/${SCHEMA_VERSION}/${fixture}.yaml`),
    })),
    ...WORKSPACES.map(([label, file]) => ({
      label,
      kind: "workspace" as const,
      text: found(workspaces, `examples/${file}`),
    })),
  ];
}

export const EXAMPLES: readonly Example[] = examples(
  import.meta.glob<string>(
    [
      "../node_modules/@timetoalign/timetoshare/fixtures/*/bundles/bundle_mixed.yaml",
      "../node_modules/@timetoalign/timetoshare/fixtures/*/bundles/bundle_shared_parent.yaml",
      "../node_modules/@timetoalign/timetoshare/fixtures/*/groups/group_styled.yaml",
      "../node_modules/@timetoalign/timetoshare/fixtures/*/flow_control.yaml",
    ],
    { query: "?raw", import: "default" },
  ),
  import.meta.glob<string>("../examples/*.tle.json", { query: "?raw", import: "default" }),
);
