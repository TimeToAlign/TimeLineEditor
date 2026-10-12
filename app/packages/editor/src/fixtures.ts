/**
 * The end-to-end workspaces (`app/e2e/fixtures/*.tle.json`), offered in the
 * header's fixture menu of development and test builds. A production build
 * contains neither the menu nor the files.
 */

export interface Fixture {
  /** The file's base name, e.g. `small`. */
  readonly name: string;
  /** The workspace file's text, fetched on first use. */
  readonly text: () => Promise<string>;
}

// The build flag is spelled out here rather than imported (`TEST_HOOK`), so
// the bundler sees a constant condition and leaves the files out of a
// production build.
export const FIXTURES: readonly Fixture[] =
  import.meta.env.DEV || import.meta.env.VITE_TILIE_TEST_HOOK === "1"
    ? Object.entries(
        import.meta.glob<string>("../../../e2e/fixtures/*.tle.json", {
          query: "?raw",
          import: "default",
        }),
      )
        .map(([path, text]) => ({
          name: path.slice(path.lastIndexOf("/") + 1, -".tle.json".length),
          text,
        }))
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    : [];
