/**
 * The drawing fixtures' `figure.svg` parses as XML (Python's ElementTree) and
 * their `figure.tex` compiles under LuaLaTeX with the bundled font.
 * `fixtures.test.ts` pins both files to the writers' output.
 */

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { drawingsDirectory, fontDirectory } from "./support.ts";

const names = readdirSync(drawingsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const PARSE = `
import sys, xml.etree.ElementTree as tree
for path in sys.argv[1:]:
    root = tree.parse(path).getroot()
    assert root.tag == "{http://www.w3.org/2000/svg}svg", (path, root.tag)
print(len(sys.argv) - 1)
`;

describe("the fixture SVG", () => {
  it("parses as XML with an SVG root, every drawing", () => {
    const files = names.map((name) => path.join(drawingsDirectory, name, "figure.svg"));
    const result = spawnSync("python3", ["-c", PARSE, ...files], { encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`${files.length}\n`);
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

describe("the fixture TikZ", () => {
  it.runIf(required)("needs lualatex where it is required", () => {
    expect(available).toBe(true);
  });

  // Skipped where lualatex is absent and not required: a local machine without TeX.
  it.skipIf(!available)(
    "compiles under lualatex without a fontspec warning or a missing character, every drawing",
    async () => {
      const directory = mkdtempSync(path.join(tmpdir(), "tilie-tikz-"));
      try {
        // The fixtures name the font directory `.`: the font sits beside each document.
        copyFileSync(
          path.join(fontDirectory, "DejaVuSans.ttf"),
          path.join(directory, "DejaVuSans.ttf"),
        );
        for (const name of names) {
          copyFileSync(
            path.join(drawingsDirectory, name, "figure.tex"),
            path.join(directory, `${name}.tex`),
          );
        }
        // The first run builds the font cache; the others run four at a time.
        const results = [await compile(directory, names[0] as string)];
        const rest = names.slice(1);
        while (rest.length > 0) {
          results.push(
            ...(await Promise.all(rest.splice(0, 4).map((name) => compile(directory, name)))),
          );
        }
        results.forEach((result, index) => {
          const name = names[index] as string;
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
