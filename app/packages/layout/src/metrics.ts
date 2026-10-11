/**
 * Text measured from the advance widths of the drawing font
 * (`docs/drawing.md` in timeskeleton, section 5.1).
 */

import type { FontMetrics } from "@timetoalign/timeskeleton";

/** A text with every code point from U+0000 to U+001F replaced by a space. */
export function cleanText(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the specification replaces exactly these.
  return text.replace(/[\u0000-\u001F]/g, " ");
}

/** Measures texts with one font; collects the code points it measured with `fallback`. */
export class TextMeasure {
  readonly metrics: FontMetrics;
  readonly unmapped = new Set<number>();

  constructor(metrics: FontMetrics) {
    this.metrics = metrics;
  }

  /** `w(text, s) = A × s / units_per_em`, `A` the integer sum of the advances. */
  width(text: string, size: number): number {
    let sum = 0;
    for (const character of text) {
      const point = character.codePointAt(0) as number;
      const advance = this.metrics.advances[String(point)];
      if (advance === undefined) {
        this.unmapped.add(point);
        sum += this.metrics.fallback;
      } else sum += advance;
    }
    return (sum * size) / this.metrics.units_per_em;
  }

  /** `a(s)`. */
  ascent(size: number): number {
    return (this.metrics.ascender * size) / this.metrics.units_per_em;
  }

  /** `d(s)`. */
  descent(size: number): number {
    return (this.metrics.descender * size) / this.metrics.units_per_em;
  }

  /** `h(s)`, ascender plus descender. */
  lineHeight(size: number): number {
    return ((this.metrics.ascender + this.metrics.descender) * size) / this.metrics.units_per_em;
  }
}
