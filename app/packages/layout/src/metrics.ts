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

/** A text's code points and the integer advance sums of its first 0, 1, … of them, in font units. */
export interface TextAdvances {
  readonly points: readonly string[];
  readonly prefixes: readonly number[];
}

/** Measures texts with one font; collects the code points it measured with `fallback`. */
export class TextMeasure {
  readonly metrics: FontMetrics;
  readonly unmapped = new Set<number>();
  readonly #advances = new Map<string, TextAdvances>();

  constructor(metrics: FontMetrics) {
    this.metrics = metrics;
  }

  /** A text's advances, read from the font's advance table once per text. */
  advances(text: string): TextAdvances {
    return this.#advances.get(text) ?? this.remember(text, this.#read(text));
  }

  /** Record the advances of a text assembled from measured ones; the font is not read again. */
  remember(text: string, advances: TextAdvances): TextAdvances {
    this.#advances.set(text, advances);
    return advances;
  }

  #read(text: string): TextAdvances {
    const points = Array.from(text);
    const prefixes = [0];
    let sum = 0;
    for (const character of points) {
      const point = character.codePointAt(0) ?? 0;
      const advance = this.metrics.advances[String(point)];
      if (advance === undefined) {
        this.unmapped.add(point);
        sum += this.metrics.fallback;
      } else sum += advance;
      prefixes.push(sum);
    }
    return { points, prefixes };
  }

  /** An integer advance sum `A` at font size `size`: `A × size / units_per_em`. */
  widthOf(advance: number, size: number): number {
    return (advance * size) / this.metrics.units_per_em;
  }

  /** `w(text, s) = A × s / units_per_em`, `A` the integer sum of the text's advances. */
  width(text: string, size: number): number {
    return this.widthOf(this.advances(text).prefixes.at(-1) ?? 0, size);
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
