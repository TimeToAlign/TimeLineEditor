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
4. The canvas engine belongs to the arranger alone. A scratch `arranger`
   package importing `@xyflow/svelte` and `@xyflow/system` reports **zero**
   violations. The same two imports written into `layout` instead report
   exactly two violations, both `no-xyflow-outside-arranger`, from
   `packages/layout/src/index.ts` to `@xyflow/svelte` and to
   `@xyflow/system`, and the process exits with status 2. A package outside
   the ladder's rows is covered too: the same imports from `editor` report
   the same two violations.

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

Each case runs `depcruise` twice as a subprocess, which a loaded machine
slows past Vitest's default limit of 5 s. Measured alone, five times one
after the other at load averages of 1 to 3 on 12 cores, a case took 1.6
to 2.2 s; inside two whole `pnpm test` runs, at load averages of 2 to 6.5,
2.0 to 3.3 s; alone at load averages of 10 to 14, one case took 5.7 s, and at
load averages of 10 to 22 cases exceeded 5 s. The suite therefore gives
every case the explicit timeout `CRUISE_TIMEOUT` of 18 s, about three
times the slowest measurement.

## The end-to-end container sees the schema package (`container.ts`)

`e2e/run.ts` starts Playwright in a podman container that mounts only
`app/`. The packages resolve `@timetoalign/timetoshare` either from the
registry (its real directory then lies in `app/node_modules/.pnpm`, inside
the mount) or from a schema package linked from a sibling checkout, whose
real directory lies outside `app/` and would be missing in the container.
`podmanArguments` (`e2e/container.ts`) builds the `podman run` arguments
from the app directory, that real directory, the image, the names of the
host variables to pass into the container (`CI` and `TILIE_E2E_WORKERS`,
each only when set) and the Playwright arguments; it is a pure function, so
every case is pinned without starting a container.

What proves it, with app directory `/w/app` and image `img`:

1. **Package inside `app/`** (`/w/app/node_modules/.pnpm/x/node_modules/y`):
   the arguments are exactly `run --rm --init --network=host --ipc=host
   --volume=/w/app:/w/app:z --workdir=/w/app img node e2e/run.ts
   --project=chromium`, the command line `run.ts` built before the schema
   package could be linked. Each passed variable adds exactly one member
   `--env=<name>` (the name alone, so podman copies the host's value),
   right after `--workdir`, in the order given: with `CI` and
   `TILIE_E2E_WORKERS`, `--env=CI --env=TILIE_E2E_WORKERS`; with
   `TILIE_E2E_WORKERS` alone, only `--env=TILIE_E2E_WORKERS`, so a worker
   count set on the host reaches Playwright inside the container without CI
   being claimed.
2. **Package outside `app/`** (`/w/TimeToShare/js`): the same list with
   exactly one more member, `--volume=/w/TimeToShare/js:/w/TimeToShare/js:ro,z`,
   right after the app's volume: read-only, at the identical absolute path,
   so the links in `node_modules` resolve unchanged, and relabelled for the
   container (`z`) as the app's volume is, so that a host enforcing SELinux
   lets the container read it.
3. **A sibling whose name extends the app directory's** (`/w/app-schema`)
   is outside `app/` and is mounted; a prefix test on strings would miss it.
