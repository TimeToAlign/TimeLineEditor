/**
 * `pnpm draw`, run as its own Node process on the manifest file a drawing
 * fixture names, writes that fixture's `figure.svg` and `figure.tex` byte
 * for byte, and refuses a wrong command line or a file holding no manifest
 * without writing anything.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dumps, loads } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { drawingsDirectory, fixturesDirectory } from "./support.ts";

const SCRIPT = fileURLToPath(new URL("../scripts/draw-manifest.ts", import.meta.url));

/** Each run starts a Node process that loads the layout; measured at about 0.7 s, three times that and more. */
const RUN_TIMEOUT = 10_000;

function run(...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

function scratch(): string {
  return mkdtempSync(path.join(tmpdir(), "draw-manifest-"));
}

function fixture(name: string, file: string): string {
  return readFileSync(path.join(drawingsDirectory, name, file), "utf8");
}

function output(directory: string, file: string): string {
  return readFileSync(path.join(directory, file), "utf8");
}

const CASES: readonly { manifest: string; drawing: string; options: readonly string[] }[] = [
  { manifest: "groups/group_parent_both", drawing: "group__group_parent_both", options: [] },
  {
    manifest: "bundles/bundle_elisions_stored",
    drawing: "bundle__bundle_elisions_stored",
    options: [],
  },
  { manifest: "nested", drawing: "nested__length-800", options: ["--length", "800"] },
  { manifest: "nested", drawing: "nested__scale-2", options: ["--scale", "2"] },
];

describe("pnpm draw", () => {
  for (const { manifest, drawing, options } of CASES) {
    it(
      `draws ${[`${manifest}.yaml`, ...options].join(" ")} as the fixture ${drawing}`,
      () => {
        const out = scratch();
        const result = run(
          path.join(fixturesDirectory, `${manifest}.yaml`),
          "--out",
          out,
          ...options,
        );
        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        const stem = path.basename(manifest);
        expect(readdirSync(out).sort()).toEqual([`${stem}.svg`, `${stem}.tex`]);
        expect(result.stdout.split("\n").slice(0, 2)).toEqual([
          path.join(out, `${stem}.svg`),
          path.join(out, `${stem}.tex`),
        ]);
        expect(output(out, `${stem}.svg`)).toBe(fixture(drawing, "figure.svg"));
        expect(output(out, `${stem}.tex`)).toBe(fixture(drawing, "figure.tex"));
      },
      RUN_TIMEOUT,
    );
  }

  it(
    "reads the manifest written as JSON, under the stem --name gives",
    () => {
      const out = scratch();
      const file = path.join(out, "manifest.json");
      const text = readFileSync(
        path.join(fixturesDirectory, "groups/group_parent_both.yaml"),
        "utf8",
      );
      writeFileSync(file, dumps(loads(text), { serialization: "json" }));
      const result = run(file, "--out", out, "--name", "figure");
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(output(out, "figure.svg")).toBe(fixture("group__group_parent_both", "figure.svg"));
      expect(output(out, "figure.tex")).toBe(fixture("group__group_parent_both", "figure.tex"));
    },
    RUN_TIMEOUT,
  );

  it(
    "refuses a file holding no manifest with status 1, writing nothing",
    () => {
      const directory = scratch();
      const file = path.join(directory, "empty.yaml");
      writeFileSync(file, 'timetoshare: "0.2.0"\n');
      const out = path.join(directory, "out");
      const result = run(file, "--out", out);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.startsWith(`${file}: `)).toBe(true);
      expect(existsSync(out)).toBe(false);
    },
    RUN_TIMEOUT,
  );

  it(
    "refuses a missing --out and a --length that is no positive number with status 2",
    () => {
      const directory = scratch();
      const manifest = path.join(fixturesDirectory, "nested.yaml");
      const out = path.join(directory, "out");
      for (const args of [
        [manifest],
        [manifest, "--out", out, "--length", "0"],
        [manifest, "--out", out, "--length", "many"],
      ]) {
        const result = run(...args);
        expect(result.status).toBe(2);
        expect(result.stdout).toBe("");
        expect(existsSync(out)).toBe(false);
      }
    },
    RUN_TIMEOUT,
  );
});
