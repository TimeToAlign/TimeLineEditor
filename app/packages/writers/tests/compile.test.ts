/**
 * The drawing fixtures' `figure.svg`, and the SVG of a drawing holding every
 * kind of element, parse as XML (Python's ElementTree); their `figure.tex`,
 * and the TikZ of that drawing, compile under LuaLaTeX with the bundled
 * font. `fixtures.test.ts` pins the fixture files to the writers' output.
 */

import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeSvg, writeTikz } from "../src/index.ts";
import { drawingsDirectory, everything, fontDirectory } from "./support.ts";

const names = readdirSync(drawingsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** Every kind of element, written by the writers; compiled under this name. */
const EVERYTHING = "everything";
const placed = [{ drawing: everything(), x: 0, y: 0, scale: 1 }];

const PARSE = `
import sys, xml.etree.ElementTree as tree
for path in sys.argv[1:]:
    root = tree.parse(path).getroot()
    assert root.tag == "{http://www.w3.org/2000/svg}svg", (path, root.tag)
print(len(sys.argv) - 1)
`;

describe("the SVG", () => {
  it("parses as XML with an SVG root, every drawing and everything", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "tilie-svg-"));
    try {
      const own = path.join(directory, `${EVERYTHING}.svg`);
      writeFileSync(own, writeSvg(placed));
      const files = [own, ...names.map((name) => path.join(drawingsDirectory, name, "figure.svg"))];
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

describe("the TikZ", () => {
  it.runIf(required)("needs lualatex where it is required", () => {
    expect(available).toBe(true);
  });

  // Skipped where lualatex is absent and not required: a local machine without TeX.
  it.skipIf(!available)(
    "compiles under lualatex without a fontspec warning or a missing character, every drawing and everything",
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
        writeFileSync(path.join(directory, `${EVERYTHING}.tex`), writeTikz(placed));
        const documents = [EVERYTHING, ...names];
        // The first run builds the font cache; the others run four at a time.
        const results = [await compile(directory, EVERYTHING)];
        const rest = documents.slice(1);
        while (rest.length > 0) {
          results.push(
            ...(await Promise.all(rest.splice(0, 4).map((name) => compile(directory, name)))),
          );
        }
        results.forEach((result, index) => {
          const name = documents[index] as string;
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
