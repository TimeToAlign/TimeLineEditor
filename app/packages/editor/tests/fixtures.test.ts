/// <reference types="node" />
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { isLoadError, loadManifest, readWorkspace } from "@timetoalign/tilie-core";
import { SCHEMA_VERSION } from "@timetoalign/timetoshare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../src/fixtures.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The installed schema package's `fixtures/` directory. */
const ROOT = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timetoshare/package.json")),
  "fixtures",
);
/** The end-to-end workspaces. */
const E2E = path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures");

/** Every `*.yaml` below `directory` outside `skipped`, as its path below it without `.yaml`. */
function yamlBelow(directory: string, skipped: readonly string[] = []): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => file.endsWith(".yaml") && !skipped.some((top) => file.startsWith(`${top}/`)))
    .map((file) => file.slice(0, -".yaml".length));
}

/** The manifest fixtures of the version, the warning cases and the workspaces, labelled as the menu labels them. */
const manifests = yamlBelow(path.join(ROOT, SCHEMA_VERSION), ["drawings"]);
const warnings = yamlBelow(path.join(ROOT, "warnings", SCHEMA_VERSION)).map(
  (name) => `warnings/${name}`,
);
const workspaces = readdirSync(E2E)
  .filter((file) => file.endsWith(".tle.json"))
  .map((file) => `e2e/${file.slice(0, -".tle.json".length)}`);

const names = FIXTURES.map(({ label }) => label);

describe("the fixture menu", () => {
  it("lists every fixture once, under its path label, in code-unit order", () => {
    expect([manifests.length, warnings.length, workspaces.length]).toEqual([204, 18, 5]);
    expect(names).toEqual(
      [...manifests, ...warnings, "tables/manifest", ...workspaces].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    expect(new Set(names).size).toBe(228);
    expect(names.slice(0, 5)).toEqual([
      "bare",
      "bare.minimal",
      "bundles/bundle_arranged_conflict",
      "bundles/bundle_arranged_conflict.minimal",
      "bundles/bundle_arranged_roots",
    ]);
    expect(names.slice(-5)).toEqual([
      "warnings/several_depths",
      "warnings/support_policy",
      "warnings/timeline_class",
      "with_region",
      "with_region.minimal",
    ]);
    for (const name of ["bundles/corpus_tilia", "groups/corpus_tilia", "e2e/small"]) {
      expect(names).toContain(name);
    }
    expect(names.filter((name) => /^(drawings|rejections)\//.test(name))).toEqual([]);
    expect(FIXTURES.filter(({ source }) => source !== undefined).map(({ label }) => label)).toEqual(
      ["tables/manifest"],
    );
  });

  it("serves the table fixture's MatchClaim table alone", async () => {
    const fetched = vi.fn(async () => new Response("fetched"));
    vi.stubGlobal("fetch", fetched);
    const source = FIXTURES.find(({ label }) => label === "tables/manifest")?.source;
    expect(await source?.read("projections.parquet")).toBe(null);
    expect(fetched).not.toHaveBeenCalled();
  });
});

describe("an entry", () => {
  const imported = FIXTURES.filter(({ kind }) => kind === "manifest");
  const opened = FIXTURES.filter(({ kind }) => kind === "workspace");

  it("is a manifest for every manifest fixture and warning case, a workspace for every end-to-end file", () => {
    expect([imported.length, opened.length]).toEqual([223, 5]);
    expect(opened.map(({ label }) => label)).toEqual(workspaces);
  });

  it.each(imported)("$label is a manifest core reads", async ({ text }) => {
    const read = loadManifest(await text());
    expect(isLoadError(read) ? read.problems.map(({ code }) => code) : []).toEqual([]);
  });

  it.each(opened)("$label is a workspace the reader accepts", async ({ text }) => {
    const read = readWorkspace(await text());
    expect(isLoadError(read) ? read.problems.map(({ code }) => code) : []).toEqual([]);
  });
});
