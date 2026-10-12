// @vitest-environment node
/// <reference types="node" />
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { licenceFile, NOTICES_FILE, packageOf, RULE, SUBRULE } from "../notices.ts";
import { ATTRIBUTIONS, FONT_LICENCE } from "../src/attributions.ts";

const editor = path.join(import.meta.dirname, "..");
let outDir: string;
/** Each bundled npm package and the directory it was bundled from. */
const bundled = new Map<string, string>();
let assets: string[];
let noticesText: string;

beforeAll(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), "tilie-attributions-"));
  await build({
    root: editor,
    configFile: path.join(editor, "vite.config.ts"),
    logLevel: "silent",
    build: { outDir, emptyOutDir: true, sourcemap: true },
  });
  const directory = path.join(outDir, "assets");
  assets = readdirSync(directory);
  noticesText = readFileSync(path.join(outDir, NOTICES_FILE), "utf8");
  for (const file of assets.filter((name) => name.endsWith(".js.map"))) {
    const map = JSON.parse(readFileSync(path.join(directory, file), "utf8")) as {
      sources: string[];
    };
    for (const source of map.sources) {
      const absolute = path.resolve(directory, source);
      const found = packageOf(absolute);
      if (found !== undefined) bundled.set(...found);
    }
  }
}, 120_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe("the attributions", () => {
  it("name exactly the npm packages in the bundle", () => {
    expect(
      ATTRIBUTIONS.filter((entry) => entry.package)
        .map((entry) => entry.name)
        .sort(),
    ).toEqual([...bundled.keys()].sort());
  });

  it("give each package's licence and every copyright line of its licence file", () => {
    for (const entry of ATTRIBUTIONS.filter((item) => item.package)) {
      const directory = bundled.get(entry.name) as string;
      const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")) as {
        license: string;
      };
      expect([entry.name, entry.licence]).toEqual([entry.name, manifest.license]);
      const text = readFileSync(licenceFile(directory) as string, "utf8");
      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("Copyright"));
      expect([entry.name, entry.copyright]).toEqual([entry.name, lines]);
    }
  });

  it("back the icons and the font", () => {
    const others = ATTRIBUTIONS.filter((item) => !item.package);
    expect(others.map((entry) => [entry.name, entry.licence])).toEqual([
      ["Icons of the canvas controls, from @xyflow/svelte", "MIT"],
      ["DejaVu Sans 2.37", FONT_LICENCE],
    ]);
    const flowLicence = readFileSync(
      licenceFile(bundled.get("@xyflow/svelte") as string) as string,
      "utf8",
    );
    expect(others[0]?.copyright.map((line) => flowLicence.includes(line))).toEqual([true]);
    expect(assets.filter((name) => /^DejaVuSans-.*\.ttf$/.test(name)).length).toBe(1);
    const licence = readFileSync(
      createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/fonts/LICENSE"),
      "utf8",
    );
    expect(others[1]?.copyright.length).toBe(2);
    for (const line of others[1]?.copyright ?? []) {
      expect([line, licence.includes(line)]).toEqual([line, true]);
    }
  });

  it("write every full licence text into the notices file", () => {
    const sections = noticesText
      .split(`${RULE}\n`)
      .slice(1)
      .map((part) => {
        const [heading, licence, rule, ...rest] = part.split("\n");
        expect(rule).toBe(SUBRULE);
        return { heading, licence, text: rest.join("\n") };
      });
    const packageSections = sections.slice(0, -2);
    const expected = [...bundled.keys()].sort().map((name) => {
      const directory = bundled.get(name) as string;
      const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")) as {
        version: string;
        license: string;
      };
      const text = readFileSync(licenceFile(directory) as string, "utf8");
      return {
        heading: `${name} ${manifest.version}`,
        licence: `License: ${manifest.license}`,
        // Sections are joined by an empty line, so every text but the last gains one newline.
        text: text.endsWith("\n") ? `${text}\n` : `${text}\n\n`,
      };
    });
    expect(packageSections).toEqual(expected);
    const flow = bundled.get("@xyflow/svelte") as string;
    const flowVersion = (
      JSON.parse(readFileSync(path.join(flow, "package.json"), "utf8")) as { version: string }
    ).version;
    const font = readFileSync(
      createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/fonts/LICENSE"),
      "utf8",
    );
    const flowText = readFileSync(licenceFile(flow) as string, "utf8");
    expect(sections.slice(-2)).toEqual([
      {
        heading: `Icons of the canvas controls, copied from @xyflow/svelte ${flowVersion}`,
        licence: "License: MIT",
        text: flowText.endsWith("\n") ? `${flowText}\n` : `${flowText}\n\n`,
      },
      {
        heading: "DejaVu Sans 2.37 (the bundled font, from @timetoalign/timeskeleton)",
        licence: `License: ${FONT_LICENCE}`,
        text: font.endsWith("\n") ? font : `${font}\n`,
      },
    ]);
  });
});
