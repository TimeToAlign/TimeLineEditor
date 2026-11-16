/**
 * The fixture menu of development and test builds. It offers every fixture
 * there is: each manifest fixture of the installed schema package's
 * version, at the top of `fixtures/<version>/` or below it, corpus fixtures
 * and minimal twins included, built into a workspace of one block on first
 * use; the manifest of each warning case of that version; and the
 * end-to-end workspaces (`app/e2e/fixtures/*.tle.json`). The rejection
 * cases, refused by design, and the drawings, which are no manifests, are
 * left out. A production build contains neither the menu nor the files.
 */

import { dumps, parseJson, SCHEMA_VERSION } from "@timetoalign/timetoshare";
import { manifestWorkspace } from "./fixtureWorkspace.ts";

export interface Fixture {
  /**
   * The menu's label, unique: a manifest fixture's path below the version's
   * directory without `.json` (`bare`, `bare.minimal`,
   * `groups/corpus_tilia`), `warnings/<name>` for a warning case and
   * `e2e/<name>` for an end-to-end workspace.
   */
  readonly name: string;
  /** The workspace file's text, fetched (and built) on first use. */
  readonly text: () => Promise<string>;
}

/** The files a glob found: path → their text, loaded on demand. */
type Files = Record<string, () => Promise<string>>;

/** Where the schema package's fixtures lie in a path the glob found. */
const FIXTURE_ROOT = "/timetoshare/fixtures/";

/** The manifest of a warning case `{manifest, unknown_keys}`, as text. */
function caseManifest(name: string, text: string): string {
  const value = parseJson(text);
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("manifest" in value)
  ) {
    throw new Error(`the warning case ${name} holds no manifest`);
  }
  return dumps(value.manifest);
}

/**
 * The menu's entries in code-unit order of their labels: every workspace
 * file, every manifest fixture of `SCHEMA_VERSION` and every warning case
 * of that version among `manifests`; files of other versions are skipped.
 */
export function fixtures(workspaces: Files, manifests: Files): Fixture[] {
  const entries: Fixture[] = Object.entries(workspaces).map(([path, text]) => ({
    name: `e2e/${path.slice(path.lastIndexOf("/") + 1, -".tle.json".length)}`,
    text,
  }));
  const version = `${SCHEMA_VERSION}/`;
  const warnings = `warnings/${SCHEMA_VERSION}/`;
  for (const [path, text] of Object.entries(manifests)) {
    const below = path.slice(path.indexOf(FIXTURE_ROOT) + FIXTURE_ROOT.length, -".json".length);
    if (below.startsWith(version)) {
      const name = below.slice(version.length);
      entries.push({ name, text: async () => manifestWorkspace(name, await text()) });
    } else if (below.startsWith(warnings)) {
      const name = `warnings/${below.slice(warnings.length)}`;
      entries.push({
        name,
        text: async () => manifestWorkspace(name, caseManifest(name, await text())),
      });
    }
  }
  return entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}

// The build flag is spelled out here rather than imported (`TEST_HOOK`), so
// the bundler sees a constant condition and leaves the files out of a
// production build.
export const FIXTURES: readonly Fixture[] =
  import.meta.env.DEV || import.meta.env.VITE_TILIE_TEST_HOOK === "1"
    ? fixtures(
        import.meta.glob<string>("../../../e2e/fixtures/*.tle.json", {
          query: "?raw",
          import: "default",
        }),
        import.meta.glob<string>(
          [
            "../node_modules/@timetoalign/timetoshare/fixtures/**/*.json",
            "!../node_modules/@timetoalign/timetoshare/fixtures/rejections/**",
            "!../node_modules/@timetoalign/timetoshare/fixtures/*/drawings/**",
          ],
          { query: "?raw", import: "default" },
        ),
      )
    : [];
