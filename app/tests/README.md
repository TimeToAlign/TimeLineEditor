# Workspace tests

Tests at this level prove properties of the workspace as a whole, not of one
package. The package tests live in `packages/*/tests`.

## The package ladder is enforced (`ladder.test.ts`)

`.dependency-cruiser.cjs` is the only encoding of the ladder, and `pnpm lint`
runs it. A configuration that silently matched nothing would pass every lint
run, so the test must show that the rules *fire*, not merely that the current
tree is clean.

What proves it:

1. A scratch workspace in a temporary directory holds a copy of the real
   `.dependency-cruiser.cjs` and `tsconfig.base.json` and two minimal
   packages, `packages/core/src/index.ts` and `packages/layout/src/index.ts`,
   each exporting its name and nothing else. Run on this tree, the real
   configuration reports **zero** violations (the positive control).
2. One forbidden import is written into `core` (`import
   "@timetoalign/tilie-layout"`). The same run now reports **exactly one**
   violation whose rule name is `core-imports-no-workspace-package`, whose
   `from` is `packages/core/src/index.ts` and whose `to` is the forbidden
   specifier, and the process exits with a non-zero status.
3. The forbidden import is replaced by `import "svelte"`. The run reports
   exactly one violation, `no-svelte-outside-arranger-and-editor`, and the
   process exits with a non-zero status.

The check runs the real `depcruise` executable as a subprocess with the
scratch directory as its working directory. The JSON reporter supplies named
violations but always exits successfully; a second invocation with the default
reporter proves the failing exit status that `pnpm lint` depends on. Together
these cover configuration, resolver settings and enforcement. The directory is removed after
each test; nothing in the real tree is touched.

Additional controls cover relative imports both with and without the target
file, installed Svelte and unresolved Svelte subpaths, DOM-only modules, and
every allowed and forbidden edge of the six-package ladder. A circular pair
inside core must fire `no-circular` even though both files share a package.
The installed-Svelte case links the real package into the scratch workspace.

Exact values only: rule names and exit statuses are compared against the
expected results; the full edge table is independent of the configuration.
