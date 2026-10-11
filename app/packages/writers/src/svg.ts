/**
 * `writeSvg(placed)`: the SVG profile (`docs/drawing.md` in timeskeleton,
 * section 7.3).
 */

import {
  type AttributeValue,
  type Descriptor,
  type PathCommand,
  toDescriptors,
} from "./descriptors.ts";
import { formatNumber, type Placed, page } from "./page.ts";

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(text: string): string {
  return escapeXml(text).replace(/"/g, "&quot;");
}

function isPath(value: AttributeValue): value is readonly PathCommand[] {
  return Array.isArray(value) && value.length > 0 && !Array.isArray(value[0]);
}

/** An attribute value as SVG writes it. */
export function attributeText(value: AttributeValue): string {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return escapeAttribute(value);
  if (isPath(value)) {
    return value
      .map(
        ({ command, points }) =>
          `${command}${points.map(([x, y]) => `${formatNumber(x)} ${formatNumber(y)}`).join(" ")}`,
      )
      .join("");
  }
  return (value as readonly (readonly [number, number])[])
    .map(([x, y]) => `${formatNumber(x)},${formatNumber(y)}`)
    .join(" ");
}

/** One descriptor as one line of SVG. */
export function descriptorSvg({ tag, attrs, text }: Descriptor): string {
  const attributes = attrs.map(([name, value]) => ` ${name}="${attributeText(value)}"`).join("");
  return text === null
    ? `<${tag}${attributes}/>`
    : `<${tag}${attributes}>${escapeXml(text)}</${tag}>`;
}

/** Write placed drawings as one SVG page. */
export function writeSvg(placed: readonly Placed[]): string {
  const sheet = page(placed);
  const width = formatNumber(sheet.width);
  const height = formatNumber(sheet.height);
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="DejaVu Sans" style="font-kerning:none;font-variant-ligatures:none">`,
  ];
  for (const item of sheet.drawings) {
    const scale = item.zoom === 1 ? "" : ` scale(${formatNumber(item.zoom)})`;
    lines.push(
      `<g transform="translate(${formatNumber(item.pageX)} ${formatNumber(item.pageY)})${scale}">`,
      ...toDescriptors(item.drawing).map(descriptorSvg),
      "</g>",
    );
  }
  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}
