/** The default style layer (`docs/drawing.md` in timeskeleton, section 4). */

import type { Graphical } from "@timetoalign/timeskeleton";

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
    { select: { element: "child" }, set: { side: "above" } },
    { select: { element: "map" }, set: { "stroke-width": 1, side: "above" } },
    {
      select: { element: "map", modality: "continuous" },
      set: { "stroke-dasharray": "none" },
    },
    { select: { element: "map", modality: "discrete" }, set: { "stroke-dasharray": "3 3" } },
    { select: { element: "wedge" }, set: { fill: "#000000" } },
    { select: { element: "region" }, set: { "stroke-width": 1 } },
    {
      select: { element: "jump" },
      set: { stroke: "#000000", fill: "#000000", "stroke-width": 1.5 },
    },
    {
      select: { element: "break" },
      set: { stroke: "#FF0000", "stroke-width": 1.5, "stroke-dasharray": "2 2" },
    },
    { select: { element: "label" }, set: { fill: "#000000", "font-size": 9 } },
    {
      select: { element: "name" },
      set: { fill: "#000000", "font-size": 11, "max-width": 160 },
    },
  ],
};
