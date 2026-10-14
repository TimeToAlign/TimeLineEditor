/**
 * The fixture menu of development and test builds: the end-to-end
 * workspaces (`app/e2e/fixtures/*.tle.json`), and one workspace per group
 * and bundle fixture of the installed schema package's version, built from
 * the manifest fixture on first use. Fixtures named `corpus_*` are loader
 * output, not drawings made to be looked at, and are left out. A production
 * build contains neither the menu nor the files.
 */

import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { manifestWorkspace } from "./fixtureWorkspace.ts";

export interface Fixture {
  /** The file's base name, e.g. `small` or `group_number_types`. */
  readonly name: string;
  /** The workspace file's text, fetched (and built) on first use. */
  readonly text: () => Promise<string>;
}

/** The files a glob found: path → their text, loaded on demand. */
type Files = Record<string, () => Promise<string>>;

function baseName(path: string, extension: string): string {
  return path.slice(path.lastIndexOf("/") + 1, -extension.length);
}

/**
 * The menu's entries, sorted by name: every workspace file, and every
 * manifest fixture of `SCHEMA_VERSION` not named `corpus_*`.
 */
export function fixtures(workspaces: Files, manifests: Files): Fixture[] {
  const version = `/fixtures/${SCHEMA_VERSION}/`;
  const entries: Fixture[] = Object.entries(workspaces).map(([path, text]) => ({
    name: baseName(path, ".tle.json"),
    text,
  }));
  for (const [path, text] of Object.entries(manifests)) {
    const name = baseName(path, ".json");
    if (!path.includes(version) || name.startsWith("corpus_")) continue;
    entries.push({ name, text: async () => manifestWorkspace(name, await text()) });
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
            "../node_modules/@timetoalign/timeskeleton/fixtures/*/groups/*.json",
            "../node_modules/@timetoalign/timeskeleton/fixtures/*/bundles/*.json",
          ],
          { query: "?raw", import: "default" },
        ),
      )
    : [];
