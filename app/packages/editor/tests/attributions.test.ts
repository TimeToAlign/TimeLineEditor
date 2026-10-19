// @vitest-environment node
/// <reference types="node" />
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { licenceFile, packageOf, RULE, SUBRULE } from "../notices.ts";
import {
  ATTRIBUTIONS,
  FONT_LICENCE,
  NOTICES_FILE,
  TITLE_FONT_LICENCE,
} from "../src/attributions.ts";
import configOf from "../vite.config.ts";

const editor = path.join(import.meta.dirname, "..");
/** The vendored title font and its licence. */
const titleFont = path.join(editor, "fonts", "IBMPlexMono-Regular.woff2");
const titleFontLicence = path.join(editor, "fonts", "LICENSE.txt");
let outDir: string;
/** Each bundled npm package and the directory it was bundled from. */
const bundled = new Map<string, string>();
let assets: string[];
let noticesText: string;
let indexHtml: string;

beforeAll(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), "tilie-attributions-"));
  // Vitest sets NODE_ENV to "test", which Vite reads as a development
  // build (with the test hook and the fixture files); the bundle checked
  // here is the production one, as `pnpm build` writes it for the wheel.
  const environment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  await build({
    root: editor,
    configFile: path.join(editor, "vite.config.ts"),
    logLevel: "silent",
    build: { outDir, emptyOutDir: true, sourcemap: true },
  }).finally(() => {
    process.env.NODE_ENV = environment;
  });
  const directory = path.join(outDir, "assets");
  assets = readdirSync(directory);
  noticesText = readFileSync(path.join(outDir, NOTICES_FILE), "utf8");
  indexHtml = readFileSync(path.join(outDir, "index.html"), "utf8");
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

  it("back the icons and the fonts", () => {
    const others = ATTRIBUTIONS.filter((item) => !item.package);
    expect(others.map((entry) => [entry.name, entry.licence])).toEqual([
      ["Icons of the canvas controls, from @xyflow/svelte", "MIT"],
      ["DejaVu Sans 2.37", FONT_LICENCE],
      ["IBM Plex Mono 2.5.0", TITLE_FONT_LICENCE],
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
    // The title font's licence names its copyright holder on the lines starting "Copyright ©".
    const titleLicence = readFileSync(titleFontLicence, "utf8");
    const holders = titleLicence
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("Copyright ©"));
    expect(others[2]?.copyright).toEqual(holders);
    expect(holders).toEqual(['Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"']);
  });

  it("ship the vendored title font unchanged, once", () => {
    const vendored = readFileSync(titleFont);
    expect([vendored.length, createHash("sha256").update(vendored).digest("hex")]).toEqual([
      49_248,
      "ba204497f16b6d334cee9d1e963a831b73e3a56e1d6300a8489d18df7214b350",
    ]);
    const emitted = assets.filter((name) => /^IBMPlexMono-Regular-.*\.woff2$/.test(name));
    expect(emitted.length).toBe(1);
    expect(readFileSync(path.join(outDir, "assets", emitted[0] as string)).equals(vendored)).toBe(
      true,
    );
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
    const packageSections = sections.slice(0, -3);
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
    const title = readFileSync(titleFontLicence, "utf8");
    expect(sections.slice(-3)).toEqual([
      {
        heading: `Icons of the canvas controls, copied from @xyflow/svelte ${flowVersion}`,
        licence: "License: MIT",
        text: flowText.endsWith("\n") ? `${flowText}\n` : `${flowText}\n\n`,
      },
      {
        heading: "DejaVu Sans 2.37 (the bundled font, from @timetoalign/timeskeleton)",
        licence: `License: ${FONT_LICENCE}`,
        text: font.endsWith("\n") ? `${font}\n` : `${font}\n\n`,
      },
      {
        heading: "IBM Plex Mono 2.5.0 (the bundled title font of the inspector)",
        licence: `License: ${TITLE_FONT_LICENCE}`,
        text: title.endsWith("\n") ? title : `${title}\n`,
      },
    ]);
  });
});

describe("the build", () => {
  it("writes no chunk of 500 kB or more", () => {
    const directory = path.join(outDir, "assets");
    const sizes = assets
      .filter((name) => name.endsWith(".js"))
      .map((name) => [name, statSync(path.join(directory, name)).size] as const);
    expect(sizes.length > 0).toBe(true);
    expect(sizes.filter(([, size]) => size >= 500_000)).toEqual([]);
  });

  it("preloads neither the YAML nor the TOML codec", () => {
    const preloaded = [...indexHtml.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)].map(
      (match) => path.basename(match[1] as string),
    );
    expect(preloaded.length > 0).toBe(true);
    expect(preloaded.filter((name) => /^(yaml|toml)-/.test(name))).toEqual([]);
  });

  it("carries no fixture and no code building fixture workspaces", () => {
    const bare = readFileSync(
      path.join(
        path.dirname(
          createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
        ),
        "fixtures",
        SCHEMA_VERSION,
        "bare.json",
      ),
      "utf8",
    );
    const generator = (JSON.parse(bare) as { meta: { generator: string } }).meta.generator;
    expect(generator.startsWith("timetoalign ")).toBe(true);
    // Source maps hold every module's source text, the dead branch included, and are not shipped.
    const written = readdirSync(outDir, { recursive: true, encoding: "utf8" })
      .filter((name) => !name.endsWith(".map"))
      .map((name) => path.join(outDir, name))
      .filter((file) => statSync(file).isFile());
    const found = written.filter((file) => {
      const text = readFileSync(file, "latin1");
      return text.includes(generator) || text.includes("Fixture Generator");
    });
    expect(written.length > 0).toBe(true);
    expect(found).toEqual([]);
  });

  it("lets the development server read the schema package", () => {
    const manifest = createRequire(import.meta.url).resolve(
      "@timetoalign/timeskeleton/package.json",
    );
    const config = configOf({ command: "serve", mode: "development" });
    expect(config.server?.fs?.allow).toEqual([
      path.join(editor, "..", ".."),
      path.dirname(realpathSync(manifest)),
    ]);
  });
});
