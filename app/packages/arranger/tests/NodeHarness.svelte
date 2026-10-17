<script lang="ts">
/* A block node with the canvas's side of its edits set as the canvas sets it. */
import { TextMeasure } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timeskeleton";
import type { ComponentProps } from "svelte";
import BlockNode from "../src/BlockNode.svelte";
import type { NodeActions } from "../src/nodeActions.ts";
import { setNodeActions } from "../src/nodeActions.ts";
import type { BlockNodeData } from "../src/project.ts";

/** Actions that do nothing, for a node no test edits. */
const IDLE: NodeActions = {
  dispatch() {},
  select() {},
  preview() {},
  metrics: new TextMeasure(fontMetrics),
  view() {
    throw new Error("no test edits this node");
  },
  reducedMotion: () => false,
  zoom: () => 1,
};

let { data, actions }: { data: BlockNodeData; actions?: NodeActions } = $props();

// Every call reads the actions of the moment, as a node reads the canvas's.
setNodeActions({
  dispatch: (command) => (actions ?? IDLE).dispatch(command),
  select: (address) => (actions ?? IDLE).select(address),
  preview: (block, preview) => (actions ?? IDLE).preview(block, preview),
  get metrics() {
    return (actions ?? IDLE).metrics;
  },
  view: () => (actions ?? IDLE).view(),
  reducedMotion: () => (actions ?? IDLE).reducedMotion(),
  zoom: () => (actions ?? IDLE).zoom(),
});

// The node reads only `data`; the other node props are Svelte Flow's.
const nodeProps = $derived({ data } as unknown as ComponentProps<typeof BlockNode>);
</script>

<BlockNode {...nodeProps} />
