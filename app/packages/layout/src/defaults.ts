/** The default style layer (`docs/drawing.md` in TimeToShare, section 4) and a manifest's own. */

import type { Manifest } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";

/**
 * The opacity the defaults fade ancestor lines and what they hold to; the
 * opacity, too, of a groupstamp's drawing where it marks a position that
 * has no coordinate (section 6.6) and of a rejected flow-control element.
 */
export const FADED_OPACITY = 0.35;

/** The lowest layer of every drawing. */
export const DEFAULT_LAYER: Graphical = {
  styles: {
    "graphical-domain": { stroke: "#FF0000", fill: "#FF0000" },
    "logical-domain": { stroke: "#00CC00", fill: "#00CC00" },
    "physical-domain": { stroke: "#0050EF", fill: "#0050EF" },
  },
  rules: [
    { select: { element: "block" }, set: { fill: "#F3F4F6", rx: 10 } },
    { select: { domain: "graphical" }, set: "graphical-domain" },
    { select: { domain: "logical" }, set: "logical-domain" },
    { select: { domain: "physical" }, set: "physical-domain" },
    { select: { element: "timeline" }, set: { "stroke-width": 3 } },
    { select: { element: "child" }, set: { "stroke-width": 3 } },
    {
      select: { element: "timeline", modality: "continuous" },
      set: { "stroke-dasharray": "none" },
    },
    {
      select: { element: "timeline", modality: "discrete" },
      set: { "stroke-dasharray": "3 3" },
    },
    {
      select: { element: "child", modality: "continuous" },
      set: { "stroke-dasharray": "none" },
    },
    { select: { element: "child", modality: "discrete" }, set: { "stroke-dasharray": "3 3" } },
    { select: { element: "map" }, set: { "stroke-width": 1 } },
    {
      select: { element: "map", modality: "continuous" },
      set: { "stroke-dasharray": "none" },
    },
    { select: { element: "map", modality: "discrete" }, set: { "stroke-dasharray": "1 1" } },
    { select: { element: "wedge" }, set: { fill: "#000000" } },
    {
      select: { element: "region" },
      set: { stroke: "#000000", "stroke-width": 1, "stroke-dasharray": "none" },
    },
    { select: { element: "region", class: "tts:AtomicSection" }, set: { display: "none" } },
    { select: { element: "band", inside: "chunk" }, set: { display: "none" } },
    {
      select: { element: "jump" },
      set: {
        stroke: "#000000",
        fill: "#000000",
        "stroke-width": 1,
        "stroke-dasharray": "1 1",
        display: "none",
      },
    },
    {
      select: { element: "break" },
      set: { stroke: "#D62728", "stroke-width": 1.5, "stroke-dasharray": "1.5 1.5" },
    },
    {
      select: { element: "section_break" },
      set: { stroke: "#4B5563", "stroke-width": 1.5, "stroke-dasharray": "4 2" },
    },
    {
      select: { element: "barline" },
      set: { stroke: "#6B7280", "stroke-width": 1, "stroke-dasharray": "none" },
    },
    { select: { element: "symbol" }, set: { fill: "#000000", "font-size": 12 } },
    {
      select: { element: "fork" },
      set: {
        stroke: "#000000",
        "stroke-width": 1,
        "stroke-dasharray": "none",
        fill: "#000000",
        "font-size": 9,
      },
    },
    {
      select: { element: "leader" },
      set: { stroke: "#9CA3AF", "stroke-width": 0.5, "stroke-dasharray": "none" },
    },
    {
      select: { element: "boundary" },
      set: { stroke: "#000000", "stroke-width": 1, "stroke-dasharray": "none" },
    },
    {
      select: { element: "cross_section" },
      set: { stroke: "#1BA1E2", "stroke-width": 1, "stroke-dasharray": "3 3" },
    },
    {
      select: { element: "alignment_anchor" },
      set: { stroke: "#1BA1E2", "stroke-width": 1, "stroke-dasharray": "3 3" },
    },
    { select: { element: "ancestor" }, set: { "stroke-width": 3, opacity: FADED_OPACITY } },
    {
      select: { element: "ancestor", modality: "continuous" },
      set: { "stroke-dasharray": "none" },
    },
    {
      select: { element: "ancestor", modality: "discrete" },
      set: { "stroke-dasharray": "3 3" },
    },
    {
      select: { element: "frame" },
      set: { fill: "#FFFFFF", stroke: "#D1D5DB", "stroke-width": 1, rx: 6 },
    },
    {
      select: { element: "card" },
      set: {
        fill: "#FFFFFF",
        stroke: "#C4C9D1",
        "stroke-width": 0.75,
        rx: 5,
        shadow: "#B8BEC8",
      },
    },
    {
      select: { element: "ancestor_card" },
      set: {
        fill: "#FFFFFF",
        stroke: "#C4C9D1",
        "stroke-width": 0.75,
        rx: 5,
        shadow: "#B8BEC8",
      },
    },
    {
      select: { element: "elision" },
      set: { fill: "none", stroke: "#9CA3AF", "stroke-width": 1, "stroke-dasharray": "2 2" },
    },
    { select: { element: "ellipsis" }, set: { fill: "#000000" } },
    { select: { inside: "ancestor" }, set: { opacity: FADED_OPACITY } },
    { select: { element: "cross_section", inside: "ancestor" }, set: { opacity: 1 } },
    { select: { coordinates: "primary", inside: "ancestor" }, set: { opacity: 1 } },
    { select: { element: "label" }, set: { fill: "#000000", "font-size": 9 } },
    {
      select: { element: "name" },
      set: { fill: "#000000", "font-size": 11, "max-width": 160 },
    },
    { select: { addresses: [{ part: ["name"] }] }, set: { "max-width": "none" } },
    {
      select: { element: "name", inside: "ancestor" },
      set: { fill: "#6B7280", "font-size": 9, opacity: 1 },
    },
    { select: { element: "label", inside: "elision" }, set: { fill: "#6B7280" } },
    { select: { coordinates: "secondary" }, set: { display: "none", rotation: -45 } },
  ],
};

/**
 * A manifest's own layer, the highest of its drawing (section 1): its
 * `graphical` block's `styles` and `rules`, without its `order` (the
 * display orders of its groups and the band orders of its timelines);
 * `undefined` without a block.
 */
export function manifestLayer(manifest: Manifest): Graphical | undefined {
  if (manifest.graphical === undefined) return undefined;
  const { styles, rules } = manifest.graphical;
  return {
    ...(styles === undefined ? {} : { styles }),
    ...(rules === undefined ? {} : { rules }),
  };
}
