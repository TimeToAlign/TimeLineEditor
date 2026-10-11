/**
 * The review drawings' SVG parses as XML (Python's ElementTree) and their
 * TikZ compiles under LuaLaTeX with the bundled font.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeSvg, writeTikz } from "../src/index.ts";
import { fontDirectory, reviewCases } from "./support.ts";

const cases = reviewCases();

const PARSE = `
import sys, xml.etree.ElementTree as tree
for path in sys.argv[1:]:
    root = tree.parse(path).getroot()
    assert root.tag == "{http://www.w3.org/2000/svg}svg", (path, root.tag)
print(len(sys.argv) - 1)
`;

describe("the review SVG", () => {
  it("parses as XML with an SVG root, every drawing", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "tilie-svg-"));
    try {
      const files = cases.map((item) => {
        const file = path.join(directory, `${item.name}.svg`);
        writeFileSync(file, writeSvg([{ drawing: item.drawing, x: 0, y: 0, zoom: item.zoom }]));
        return file;
      });
      const result = spawnSync("python3", ["-c", PARSE, ...files], { encoding: "utf8" });
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe(`${files.length}\n`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const lualatex = spawnSync("lualatex", ["--version"], { encoding: "utf8" });
const available = lualatex.status === 0;
const required = process.env.TILIE_REQUIRE_LUALATEX !== undefined;

function compile(directory: string, name: string): Promise<{ status: number | null; log: string }> {
  return new Promise((resolve) => {
    const child = spawn("lualatex", ["-interaction=nonstopmode", "-halt-on-error", `${name}.tex`], {
      cwd: directory,
      env: { ...process.env, TEXMFCACHE: directory, TEXMFVAR: directory },
      stdio: "ignore",
    });
    child.on("close", (status) => {
      let log = "";
      try {
        log = readFileSync(path.join(directory, `${name}.log`), "utf8");
      } catch {}
      resolve({ status, log });
    });
  });
}

describe("the review TikZ", () => {
  it.runIf(required)("needs lualatex where it is required", () => {
    expect(available).toBe(true);
  });

  // Skipped where lualatex is absent and not required: a local machine without TeX.
  it.skipIf(!available)(
    "compiles under lualatex without a fontspec warning or a missing character, every drawing",
    async () => {
      const directory = mkdtempSync(path.join(tmpdir(), "tilie-tikz-"));
      try {
        for (const item of cases) {
          writeFileSync(
            path.join(directory, `${item.name}.tex`),
            writeTikz([{ drawing: item.drawing, x: 0, y: 0, zoom: item.zoom }], { fontDirectory }),
          );
        }
        // The first run builds the font cache; the others run four at a time.
        const results = [await compile(directory, (cases[0] as (typeof cases)[number]).name)];
        const rest = cases.slice(1).map((item) => item.name);
        while (rest.length > 0) {
          results.push(
            ...(await Promise.all(rest.splice(0, 4).map((name) => compile(directory, name)))),
          );
        }
        results.forEach((result, index) => {
          const name = (cases[index] as (typeof cases)[number]).name;
          expect(result.status, `${name}: ${result.log.slice(-2000)}`).toBe(0);
          expect(result.log.match(/^Package fontspec Warning.*$/m), name).toBe(null);
          expect(result.log.match(/^Missing character.*$/m), name).toBe(null);
        });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    600_000,
  );
});
