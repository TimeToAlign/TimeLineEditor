/**
 * Draw the review sheet: every review drawing as SVG, rasterized at twice
 * the size (`rsvg-convert --zoom 2`) with only the bundled drawing font
 * available, listed on one `index.html` under `review/`.
 *
 * Usage, from `app/packages/writers/`: `pnpm review`.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSvg } from "../src/index.ts";
import { fontDirectory, reviewCases } from "./review-cases.ts";

const output = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "review");
const scratch = mkdtempSync(path.join(tmpdir(), "tilie-review-"));

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

try {
  const fontconfig = path.join(scratch, "fonts.conf");
  writeFileSync(
    fontconfig,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n<fontconfig>\n<dir>${fontDirectory}</dir>\n<cachedir>${path.join(scratch, "cache")}</cachedir>\n</fontconfig>\n`,
  );
  const env = { ...process.env, FONTCONFIG_FILE: fontconfig };
  // Refuse to rasterize unless the bundled font is the only font fontconfig sees.
  const fonts = spawnSync("fc-list", ["--format", "%{file}\\n"], { env, encoding: "utf8" });
  const expected = `${path.join(fontDirectory, "DejaVuSans.ttf")}\n`;
  if (fonts.status !== 0 || fonts.stdout !== expected) {
    throw new Error(`fontconfig sees ${JSON.stringify(fonts.stdout)}, not only ${expected}`);
  }
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const rows: string[] = [];
  for (const item of reviewCases()) {
    const svg = path.join(output, `${item.name}.svg`);
    const png = path.join(output, `${item.name}.png`);
    writeFileSync(svg, writeSvg([{ drawing: item.drawing, x: 0, y: 0, scale: item.scale }]));
    const result = spawnSync("rsvg-convert", ["--zoom", "2", "--output", png, svg], {
      env,
      encoding: "utf8",
    });
    if (result.status !== 0) throw new Error(`rsvg-convert failed on ${svg}: ${result.stderr}`);
    const { length, spacing, width, height, order } = item.placement;
    const placement = `length ${length}, spacing ${spacing}, width ${width}, height ${height}, order ${order.join(",")}, scale ${item.scale}`;
    const unmapped =
      item.drawing.unmapped.length === 0
        ? ""
        : `; unmapped code points ${item.drawing.unmapped.join(", ")}`;
    rows.push(
      `<figure>\n<figcaption><code>${escapeHtml(item.name)}.png</code> (${escapeHtml(item.manifest)}.json): ${placement}${unmapped}</figcaption>\n<img src="${escapeHtml(item.name)}.png" alt="${escapeHtml(item.name)}">\n</figure>`,
    );
  }
  writeFileSync(
    path.join(output, "index.html"),
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>TimeSkeleton drawings</title>\n<style>body{font-family:sans-serif;margin:16px}figure{margin:0 0 32px}img{display:block;margin-top:8px;border:1px solid #ccc}</style>\n</head>\n<body>\n<h1>TimeSkeleton drawings</h1>\n<p>Rasterized at twice the size (rsvg-convert --zoom 2) with only <code>${escapeHtml(path.join(fontDirectory, "DejaVuSans.ttf"))}</code> available.</p>\n${rows.join("\n")}\n</body>\n</html>\n`,
  );
  console.log(`${rows.length} drawings in ${path.join(output, "index.html")}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
