<script lang="ts">
/* A block node with the canvas's side of its edits set as the canvas sets it. */
import { fontMetrics } from "@timetoalign/timetoshare";
import BlockNode from "../src/BlockNode.svelte";
import { LEVELS } from "../src/containers.ts";
import { GestureSlot } from "../src/gesture.ts";
import { NO_PAINT } from "../src/matches.ts";
import type { BlockNodeData } from "../src/node.ts";
import type { NodeActions } from "../src/nodeActions.ts";
import { setNodeActions } from "../src/nodeActions.ts";

/** Actions that do nothing, for a node no test edits. */
const IDLE: NodeActions = {
  dispatch() {},
  edit() {},
  refuse() {},
  select() {},
  preview() {},
  metrics: fontMetrics,
  pane: () => undefined,
  view() {
    throw new Error("no test edits this node");
  },
  minter() {
    throw new Error("no test edits this node");
  },
  zoom: () => 1,
  rules: () => LEVELS.arranger,
  reducedMotion: () => false,
  previewing: () => false,
  coordinates: () => false,
  matches: () => false,
  matchPaint: () => NO_PAINT,
  gestures: new GestureSlot(),
};

let { data, actions }: { data: BlockNodeData; actions?: NodeActions } = $props();

const current = () => actions ?? IDLE;

// Every call reads the actions of the moment, as a node reads the canvas's.
setNodeActions({
  dispatch: (command) => current().dispatch(command),
  edit: (target, commands) => current().edit(target, commands),
  refuse: (message) => current().refuse(message),
  select: (address) => current().select(address),
  preview: (block, preview) => current().preview(block, preview),
  get metrics() {
    return current().metrics;
  },
  pane: () => current().pane(),
  view: () => current().view(),
  minter: () => current().minter(),
  zoom: () => current().zoom(),
  rules: () => current().rules(),
  reducedMotion: () => current().reducedMotion(),
  previewing: (block) => current().previewing(block),
  coordinates: () => current().coordinates(),
  matches: () => current().matches(),
  matchPaint: (block) => current().matchPaint(block),
  get gestures() {
    return current().gestures;
  },
});
</script>

<BlockNode {data} />
