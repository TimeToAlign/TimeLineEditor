/**
 * The fixture menu of development and test builds. It offers every fixture
 * there is as an example (`examples.ts`), opened as the Examples menu opens
 * one: each manifest fixture of the installed schema package's version, at
 * the top of `fixtures/<version>/` or below it, corpus fixtures and minimal
 * twins included, the manifest of each warning case of that version and
 * the manifest of the table fixture (`tables/<version>/manifest.yaml`), whose
 * MatchClaim table is served beside it, so it can be read from where the
 * manifest came from (the other resources it names are not served: the
 * editor reads none), each imported as one more block; and the
 * end-to-end workspaces
 * (`app/e2e/fixtures/*.tle.json`), each opened as the workspace. The
 * rejection cases, refused by design, and the drawings, which are no
 * manifests, are left out. A production build contains neither the menu
 * nor the files.
 *
 * An entry's label is unique: a manifest fixture's path below the
 * version's directory without `.yaml` (`bare`, `bare.minimal`,
 * `groups/corpus_tilia`), `warnings/<name>` for a warning case,
 * `tables/manifest` for the table fixture and `e2e/<name>` for an
 * end-to-end workspace.
 */

import { dumps, loads, SCHEMA_VERSION } from "@timetoalign/timetoshare";
import type { Example } from "./examples.ts";
import type { ManifestSource } from "./matchClaims.svelte.ts";

/** The files a glob found: path → their text, loaded on demand. */
type Files = Record<string, () => Promise<string>>;

/** Where the schema package's fixtures lie in a path the glob found. */
const FIXTURE_ROOT = "/timetoshare/fixtures/";

/** The table fixture's directory below the fixtures' root. */
const TABLES = `tables/${SCHEMA_VERSION}`;

/**
 * Where the table fixture's files are served: the location `url` resolved
 * against the fixture's directory, read from the one of `served` (path →
 * the URL it is served at) whose path is that file's; `null` for a file
 * that is not served.
 */
export function servedSource(served: Files): ManifestSource {
  return {
    async read(url) {
      const name = new URL(url, `file:///${TABLES}/`).pathname.slice(1);
      const entry = Object.entries(served).find(([path]) =>
        path.endsWith(`${FIXTURE_ROOT}${name}`),
      );
      if (entry === undefined) return null;
      const response = await fetch(await entry[1]());
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
      return response.blob();
    },
  };
}

/** The manifest of a warning case `{manifest, unknown_keys}`, as canonical YAML. */
function caseManifest(name: string, text: string): string {
  const value = loads(text);
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
 * of that version among `manifests`, and the table fixture's manifest of
 * that version with its MatchClaim table read from `tables` (`servedSource`); files of
 * other versions are skipped.
 */
export function fixtures(workspaces: Files, manifests: Files, tables: Files): Example[] {
  const entries: Example[] = Object.entries(workspaces).map(([path, text]) => ({
    label: `e2e/${path.slice(path.lastIndexOf("/") + 1, -".tle.json".length)}`,
    kind: "workspace",
    text,
  }));
  const version = `${SCHEMA_VERSION}/`;
  const warnings = `warnings/${SCHEMA_VERSION}/`;
  for (const [path, text] of Object.entries(manifests)) {
    const below = path.slice(path.indexOf(FIXTURE_ROOT) + FIXTURE_ROOT.length, -".yaml".length);
    if (below.startsWith(version)) {
      entries.push({ label: below.slice(version.length), kind: "manifest", text });
    } else if (below === `${TABLES}/manifest`) {
      entries.push({
        label: "tables/manifest",
        kind: "manifest",
        text,
        source: servedSource(tables),
      });
    } else if (below.startsWith(warnings)) {
      const label = `warnings/${below.slice(warnings.length)}`;
      entries.push({
        label,
        kind: "manifest",
        text: async () => caseManifest(label, await text()),
      });
    }
  }
  return entries.sort((left, right) =>
    left.label < right.label ? -1 : left.label > right.label ? 1 : 0,
  );
}

// The build flag is spelled out here rather than imported (`TEST_HOOK`), so
// the bundler sees a constant condition and leaves the files out of a
// production build.
/** The fixture menu's entries, sorted by label; empty in a production build. */
export const FIXTURES: readonly Example[] =
  import.meta.env.DEV || import.meta.env.VITE_TILIE_TEST_HOOK === "1"
    ? fixtures(
        import.meta.glob<string>("../../../e2e/fixtures/*.tle.json", {
          query: "?raw",
          import: "default",
        }),
        import.meta.glob<string>(
          [
            "../node_modules/@timetoalign/timetoshare/fixtures/**/*.yaml",
            "!../node_modules/@timetoalign/timetoshare/fixtures/rejections/**",
            "!../node_modules/@timetoalign/timetoshare/fixtures/serializations/**",
            "!../node_modules/@timetoalign/timetoshare/fixtures/*/drawings/**",
          ],
          { query: "?raw", import: "default" },
        ),
        import.meta.glob<string>(
          "../node_modules/@timetoalign/timetoshare/fixtures/tables/*/match_claims.parquet",
          { query: "?url", import: "default" },
        ),
      )
    : [];
