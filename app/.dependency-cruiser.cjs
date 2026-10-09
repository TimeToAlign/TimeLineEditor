/**
 * The package ladder of the workspace, enforced by dependency-cruiser.
 *
 * Packages may only depend downwards:
 *
 *   core      -> nothing in the workspace; never svelte or anything DOM-only
 *   layout    -> core
 *   writers   -> layout, core
 *   arranger  -> layout, core          (may import svelte)
 *   client    -> core
 *   editor    -> any workspace package (may import svelte)
 *
 * A dependency is matched both by its resolved path (`packages/<name>/...`,
 * which pnpm's workspace links resolve to) and by its bare specifier
 * (`@timetoalign/tilie-<name>`), so a forbidden import is reported even when
 * it cannot be resolved. `tests/ladder.test.ts` proves that the rules fire.
 */

const PACKAGES = ["core", "layout", "writers", "arranger", "client", "editor"];

/** A regular expression matching imports of any of the given workspace packages. */
function workspacePackages(names) {
  const alternatives = names.join("|");
  return `^(packages/(${alternatives})/|@timetoalign/tilie-(${alternatives})($|/)|(\\.\\./)+(${alternatives})/)`;
}

/** Everything in the workspace except the given packages. */
function allExcept(...allowed) {
  return workspacePackages(PACKAGES.filter((name) => !allowed.includes(name)));
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "The ladder is a tree: no package may depend on itself through another.",
      from: {},
      to: { circular: true },
    },
    {
      name: "core-imports-no-workspace-package",
      severity: "error",
      comment: "core is the bottom of the ladder and depends on no other workspace package.",
      from: { path: "^packages/core/" },
      to: { path: allExcept("core") },
    },
    {
      name: "layout-imports-core-only",
      severity: "error",
      from: { path: "^packages/layout/" },
      to: { path: allExcept("layout", "core") },
    },
    {
      name: "writers-imports-layout-and-core-only",
      severity: "error",
      from: { path: "^packages/writers/" },
      to: { path: allExcept("writers", "layout", "core") },
    },
    {
      name: "arranger-imports-layout-and-core-only",
      severity: "error",
      from: { path: "^packages/arranger/" },
      to: { path: allExcept("arranger", "layout", "core") },
    },
    {
      name: "client-imports-core-only",
      severity: "error",
      from: { path: "^packages/client/" },
      to: { path: allExcept("client", "core") },
    },
    {
      name: "core-no-dom-modules",
      severity: "error",
      comment: "Keep DOM implementations, DOM helpers and components out of core.",
      from: { path: "^packages/core/" },
      to: {
        path: "(^|/)(node_modules/)?(react-dom|jquery|jsdom|happy-dom|@testing-library/(dom|react|svelte))($|/)|\\.svelte$",
      },
    },
    {
      name: "no-svelte-outside-arranger-and-editor",
      severity: "error",
      comment:
        "Only the two UI packages may depend on the framework; everything below is framework-free.",
      from: { path: "^(packages/|tests/)", pathNot: "^packages/(arranger|editor)/" },
      to: { path: "^(svelte($|/)|node_modules/svelte/|.*/node_modules/svelte/)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types"],
      extensions: [".ts", ".js", ".svelte", ".json"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
