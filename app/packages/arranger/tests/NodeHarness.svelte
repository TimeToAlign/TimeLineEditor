<script lang="ts">
/* A block node with the canvas's side of its edits set as the canvas sets it. */
import { fontMetrics } from "@timetoalign/timeskeleton";
import BlockNode from "../src/BlockNode.svelte";
import { LEVELS } from "../src/containers.ts";
import { GestureSlot } from "../src/gesture.ts";
import type { NodeActions } from "../src/nodeActions.ts";
import { setNodeActions } from "../src/nodeActions.ts";
import type { BlockNodeData } from "../src/project.ts";

/** Actions that do nothing, for a node no test edits. */
const IDLE: NodeActions = {
  dispatch() {},
  select() {},
  preview() {},
  metrics: fontMetrics,
  view() {
    throw new Error("no test edits this node");
  },
  zoom: () => 1,
  rules: () => LEVELS.arranger,
  reducedMotion: () => false,
  gestures: new GestureSlot(),
};

let { data, actions }: { data: BlockNodeData; actions?: NodeActions } = $props();

const current = () => actions ?? IDLE;

// Every call reads the actions of the moment, as a node reads the canvas's.
setNodeActions({
  dispatch: (command) => current().dispatch(command),
  select: (address) => current().select(address),
  preview: (block, preview) => current().preview(block, preview),
  get metrics() {
    return current().metrics;
  },
  view: () => current().view(),
  zoom: () => current().zoom(),
  rules: () => current().rules(),
  reducedMotion: () => current().reducedMotion(),
  get gestures() {
    return current().gestures;
  },
});
</script>

<BlockNode {data} />
