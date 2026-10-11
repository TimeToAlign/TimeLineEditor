import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emit, handDerived } from "../scripts/emit-geometry.ts";
import { writeSvg, writeTikz } from "../src/index.ts";
import { block, fixturesDir } from "./support.ts";

const NAMES = ["bare", "nested"];

describe("handDerived", () => {
  it("lists each figure.svg code span once, in order of first mention", () => {
    const readme = [
      "# Drawings",
      "`nested/figure.svg` and `bare/figure.svg`,",
      "again `nested/figure.svg`; not `bare/figure.tex` nor `figure.svg`.",
    ].join("\n");
    expect(handDerived(readme)).toEqual(["nested", "bare"]);
  });
});

describe("emit", () => {
  let repository: string;
  const drawings = () => path.join(repository, "fixtures", SCHEMA_VERSION, "drawings");
  const git = (...args: string[]) => spawnSync("git", ["-C", repository, ...args]);

  beforeEach(() => {
    repository = mkdtempSync(path.join(tmpdir(), "tilie-emit-"));
    git("init", "-q");
    mkdirSync(drawings(), { recursive: true });
    for (const name of NAMES) {
      copyFileSync(
        path.join(fixturesDir, `${name}.json`),
        path.join(repository, "fixtures", SCHEMA_VERSION, `${name}.json`),
      );
    }
  });
  afterEach(() => rmSync(repository, { recursive: true, force: true }));

  it("refuses a version without a drawings README and writes nothing", () => {
    expect(() => emit(repository)).toThrow(`no hand-derived drawings for ${SCHEMA_VERSION}`);
    expect(readdirSync(drawings())).toEqual([]);
  });

  it("writes figure.svg and figure.tex of every manifest and nothing else", () => {
    writeFileSync(path.join(drawings(), "README.md"), "No hand-derived drawing.\n");
    expect(emit(repository)).toEqual(NAMES);
    for (const name of NAMES) {
      const directory = path.join(drawings(), name);
      expect(readdirSync(directory).sort()).toEqual(["figure.svg", "figure.tex"]);
      expect(readFileSync(path.join(directory, "figure.svg"), "utf8")).toBe(writeSvg(block(name)));
      expect(readFileSync(path.join(directory, "figure.tex"), "utf8")).toBe(writeTikz(block(name)));
    }
  });

  it("accepts a hand-derived figure that layout reproduces byte for byte", () => {
    writeFileSync(path.join(drawings(), "README.md"), "The specimen is `bare/figure.svg`.\n");
    mkdirSync(path.join(drawings(), "bare"));
    writeFileSync(path.join(drawings(), "bare", "figure.svg"), writeSvg(block("bare")));
    expect(emit(repository)).toEqual(NAMES);
    expect(existsSync(path.join(drawings(), "nested", "figure.svg"))).toBe(true);
  });

  it("refuses a hand-derived figure that layout does not reproduce and writes nothing", () => {
    writeFileSync(path.join(drawings(), "README.md"), "The specimen is `bare/figure.svg`.\n");
    mkdirSync(path.join(drawings(), "bare"));
    writeFileSync(path.join(drawings(), "bare", "figure.svg"), "<svg/>\n");
    expect(() => emit(repository)).toThrow(
      "bare: layout disagrees with the hand-derived figure.svg",
    );
    expect(readdirSync(path.join(drawings(), "bare"))).toEqual(["figure.svg"]);
    expect(existsSync(path.join(drawings(), "nested"))).toBe(false);
  });

  it("refuses a version whose tag exists", () => {
    writeFileSync(path.join(drawings(), "README.md"), "No hand-derived drawing.\n");
    const blob = spawnSync("git", ["-C", repository, "hash-object", "-w", "--stdin"], {
      input: "released\n",
      encoding: "utf8",
    }).stdout.trim();
    git("update-ref", `refs/tags/v${SCHEMA_VERSION}`, blob);
    expect(() => emit(repository)).toThrow(
      `v${SCHEMA_VERSION} is released; its drawings are frozen`,
    );
    expect(readdirSync(drawings())).toEqual(["README.md"]);
  });

  it("never writes under fixtures/0.3.0", () => {
    expect(() => emit(repository, "0.3.0")).toThrow(
      "fixtures/0.3.0 is released and is never written",
    );
  });
});
