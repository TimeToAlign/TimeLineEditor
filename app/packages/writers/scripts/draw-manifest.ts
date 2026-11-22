/**
 * Draw a manifest file, YAML or JSON, to SVG and TikZ exactly as the review
 * cases draw a manifest fixture: the defaults and the manifest's own layer,
 * the default placement (its length replaced when `--length` is given), the
 * schema package's font metrics, the drawing placed at `(0, 0)` with the
 * scale. Writes `<stem>.svg` and the standalone TikZ document `<stem>.tex`
 * into the output directory, the stem defaulting to the file's name without
 * its extension, and prints both paths and the drawing's size.
 *
 * Usage, from `app/packages/writers/`:
 * `pnpm draw <manifest> --out <directory> [--name <stem>] [--length <n>] [--scale <s>]`.
 * Exits with status 2 on a wrong command line and 1 when the file cannot be
 * read or holds no manifest the schema admits; nothing is written then.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { DEFAULT_PLACEMENT } from "@timetoalign/tilie-layout";
import { formatNumber } from "../src/index.ts";
import { drawManifest, figures } from "./review-cases.ts";

const USAGE =
  "usage: pnpm draw <manifest> --out <directory> [--name <stem>] [--length <n>] [--scale <s>]";

/** A wrong command line: reported with the usage, exit status 2. */
class UsageError extends Error {}

/** The option `name`'s text as a positive finite number. */
function positive(name: string, text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value) || value <= 0) {
    throw new UsageError(`--${name} takes a positive number, not '${text}'`);
  }
  return value;
}

/** The file's name without its last extension. */
function stemOf(file: string): string {
  const base = path.basename(file);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/** Draw the command line's manifest; return the exit status. */
function main(args: readonly string[]): number {
  let options: {
    file: string;
    out: string;
    name: string;
    length: number | undefined;
    scale: number;
  };
  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      allowPositionals: true,
      options: {
        out: { type: "string" },
        name: { type: "string" },
        length: { type: "string" },
        scale: { type: "string" },
      },
    });
    const [file, ...rest] = positionals;
    if (file === undefined || rest.length > 0) throw new UsageError("name one manifest file");
    if (values.out === undefined) throw new UsageError("--out is required");
    if (values.name !== undefined && (values.name === "" || /[/\\]/.test(values.name))) {
      throw new UsageError(`--name takes a file stem without a folder, not '${values.name}'`);
    }
    options = {
      file,
      out: values.out,
      name: values.name ?? stemOf(file),
      length: positive("length", values.length),
      scale: positive("scale", values.scale) ?? 1,
    };
  } catch (error) {
    if (!(error instanceof UsageError) && !(error instanceof TypeError)) throw error;
    console.error(`${error.message}\n${USAGE}`);
    return 2;
  }

  let text: string;
  try {
    text = readFileSync(options.file, "utf8");
  } catch (error) {
    console.error(`${options.file}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const manifest = loadManifest(text);
  if (isLoadError(manifest)) {
    for (const problem of manifest.problems) {
      console.error(
        `${options.file}: ${problem.code} at ${JSON.stringify(problem.path)}: ${problem.message}`,
      );
    }
    return 1;
  }

  const placement =
    options.length === undefined
      ? DEFAULT_PLACEMENT
      : { ...DEFAULT_PLACEMENT, length: options.length };
  const drawing = drawManifest(manifest, placement);
  const { svg, tex } = figures(drawing, options.scale);
  mkdirSync(options.out, { recursive: true });
  for (const [extension, text] of [
    ["svg", svg],
    ["tex", tex],
  ] as const) {
    const file = path.join(options.out, `${options.name}.${extension}`);
    writeFileSync(file, text);
    console.log(file);
  }
  console.log(`${formatNumber(drawing.width)} × ${formatNumber(drawing.height)}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
