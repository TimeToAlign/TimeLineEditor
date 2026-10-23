/**
 * The Examples menu's manifests: a few manifest fixtures of the installed
 * schema package's version, chosen to show what the editor draws. Each is
 * a chunk of its own, loaded when it is chosen.
 */

import { SCHEMA_VERSION } from "@timetoalign/timetoshare";

export interface Example {
  /** The menu's label. */
  readonly label: string;
  /** The fixture's path in the schema package, e.g. `fixtures/0.1.0/flow_control.json`. */
  readonly file: string;
  /** The manifest's text, fetched on first use. */
  readonly text: () => Promise<string>;
}

/** The files a glob found: path → their text, loaded on demand. */
type Files = Record<string, () => Promise<string>>;

/** Each example's label and its fixture's path below `fixtures/<version>/`, without `.json`. */
const CHOSEN: readonly (readonly [label: string, fixture: string])[] = [
  ["Score, performance and facsimile", "bundles/bundle_mixed"],
  ["Sonata in two takes", "bundles/bundle_shared_parent"],
  ["Styled edition", "groups/group_styled"],
  ["Repeats and jumps", "flow_control"],
];

/** The examples in menu order, each read from the file of `SCHEMA_VERSION` among `files`. */
export function examples(files: Files): Example[] {
  return CHOSEN.map(([label, fixture]) => {
    const file = `fixtures/${SCHEMA_VERSION}/${fixture}.json`;
    const found = Object.entries(files).find(([path]) => path.endsWith(`/${file}`));
    if (found === undefined) throw new Error(`the example ${file} is missing`);
    return { label, file, text: found[1] };
  });
}

export const EXAMPLES: readonly Example[] = examples(
  import.meta.glob<string>(
    [
      "../node_modules/@timetoalign/timetoshare/fixtures/*/bundles/bundle_mixed.json",
      "../node_modules/@timetoalign/timetoshare/fixtures/*/bundles/bundle_shared_parent.json",
      "../node_modules/@timetoalign/timetoshare/fixtures/*/groups/group_styled.json",
      "../node_modules/@timetoalign/timetoshare/fixtures/*/flow_control.json",
    ],
    { query: "?raw", import: "default" },
  ),
);
