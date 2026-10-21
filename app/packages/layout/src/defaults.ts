/** The default style layer (`docs/drawing.md` in TimeToShare, section 4) and a manifest's own. */

import type { Manifest } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";

/** The lowest layer of every drawing. */
export const DEFAULT_LAYER: Graphical = {
  styles: {
    "graphical-domain": { stroke: "#FF0000", fill: "#FF0000" },
    "logical-domain": { stroke: "#00CC00", fill: "#00CC00" },
    "physical-domain": { stroke: "#0050EF", fill: "#0050EF" },
  },
  statements: [
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
    {
      select: { element: "jump_from" },
      set: { stroke: "#000000", fill: "#000000", "stroke-width": 1, "stroke-dasharray": "1 1" },
    },
    {
      select: { element: "flow_marker" },
      set: { stroke: "#FF0000", "stroke-width": 1.5, "stroke-dasharray": "2 2" },
    },
    {
      select: { element: "boundary" },
      set: { stroke: "#000000", "stroke-width": 1, "stroke-dasharray": "none" },
    },
    { select: { element: "ancestor" }, set: { "stroke-width": 3, opacity: 0.35 } },
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
    { select: { inside: "ancestor" }, set: { opacity: 0.35 } },
    { select: { element: "label" }, set: { fill: "#000000", "font-size": 9 } },
    {
      select: { element: "name" },
      set: { fill: "#000000", "font-size": 11, "max-width": 160 },
    },
    {
      select: { element: "name", inside: "ancestor" },
      set: { fill: "#6B7280", "font-size": 9, opacity: 1 },
    },
    {
      select: { element: "band", facet: "markers", inside: "band" },
      set: { display: "none" },
    },
    {
      select: { element: "band", facet: "regions", inside: "band" },
      set: { display: "none" },
    },
    {
      select: { element: "band", facet: "flow_control", inside: "band" },
      set: { display: "none" },
    },
  ],
};

/**
 * A manifest's own layer, the highest of its drawing (section 1): its
 * `graphical` block's `styles` and `statements`, without its `order` (the
 * display orders of its groups and the band orders of its timelines);
 * `undefined` without a block.
 */
export function manifestLayer(manifest: Manifest): Graphical | undefined {
  if (manifest.graphical === undefined) return undefined;
  const { styles, statements } = manifest.graphical;
  return {
    ...(styles === undefined ? {} : { styles }),
    ...(statements === undefined ? {} : { statements }),
  };
}
