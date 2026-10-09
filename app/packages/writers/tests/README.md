# `@timetoalign/tilie-writers` tests

The package currently exports its name and nothing else. Three things prove
that it is linked into the workspace correctly:

1. **It exports its name.** `name.test.ts` imports `name` from
   `../src/index.ts` and asserts the exact string
   `"@timetoalign/tilie-writers"`. This proves the package resolves, compiles
   and runs under Vitest with the workspace configuration.
2. **It type-checks under strict settings.** `pnpm typecheck` runs `tsc` with
   `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) over `src` and
   `tests`. This is not a Vitest test; it is a gate of the same workflow.
3. **It respects the ladder.** This package is two rungs up: it may depend on `layout` and `core` only. The rule is
   encoded once in `.dependency-cruiser.cjs`, checked by `pnpm lint`, and
   its enforcement is proven by `tests/ladder.test.ts` at the workspace root.

When the package gains behaviour, this file states what would prove that
behaviour works before any test is written.
