/**
 * The 0.3.0 SVG figures parse as XML (Python's ElementTree) and the 0.3.0 TikZ
 * figures compile under LuaLaTeX.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { figurePath, specimens } from "./support.ts";

const PARSE = `
import sys, xml.etree.ElementTree as tree
for path in sys.argv[1:]:
    root = tree.parse(path).getroot()
    assert root.tag == "{http://www.w3.org/2000/svg}svg", (path, root.tag)
print(len(sys.argv) - 1)
`;

describe("the 0.3.0 SVG figures", () => {
  it("parses as XML with an SVG root, every file", () => {
    const files = specimens.map((name) => figurePath(name, "figure.svg"));
    const result = spawnSync("python3", ["-c", PARSE, ...files], { encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`${files.length}\n`);
  });
});

const lualatex = spawnSync("lualatex", ["--version"], { encoding: "utf8" });
const available = lualatex.status === 0;
const required = process.env.TILIE_REQUIRE_LUALATEX !== undefined;

describe("the 0.3.0 TikZ figures", () => {
  it.runIf(required)("needs lualatex where it is required", () => {
    expect(available).toBe(true);
  });

  // Skipped where lualatex is absent and not required: a local machine without TeX.
  it.skipIf(!available).each(specimens)(
    "compiles under lualatex: %s",
    (name) => {
      const directory = mkdtempSync(path.join(tmpdir(), "tilie-tikz-"));
      try {
        copyFileSync(figurePath(name, "figure.tex"), path.join(directory, "figure.tex"));
        const result = spawnSync(
          "lualatex",
          ["-interaction=nonstopmode", "-halt-on-error", "figure.tex"],
          {
            cwd: directory,
            encoding: "utf8",
            env: {
              ...process.env,
              TEXMFCACHE: tmpdir(),
              TEXMFVAR: tmpdir(),
            },
          },
        );
        expect(result.status, result.stdout.slice(-2000)).toBe(0);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
