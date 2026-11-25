# TypeScript API

The packages of the pnpm workspace in `app/`, in the order of the package
ladder: each package may depend only on those before it (see
[Architecture](architecture.md#packages-and-the-dependency-ladder)). Each
package has a page listing its modules, and each module a page of its own:
every `.ts` and `.svelte.ts` module under the package's `src/`. A package's
module named `index` is its entry point, the surface other packages import;
the editor's is `embed`.

Svelte components (`.svelte` files) are not documented here; where a
package's entry point exports one, it is listed as a variable holding the
component.

```{toctree}
:maxdepth: 1

api-ts/@timetoalign/tilie-core/index
api-ts/@timetoalign/tilie-layout/index
api-ts/@timetoalign/tilie-writers/index
api-ts/@timetoalign/tilie-client/index
api-ts/@timetoalign/tilie-arranger/index
api-ts/@timetoalign/tilie-editor/index
```
