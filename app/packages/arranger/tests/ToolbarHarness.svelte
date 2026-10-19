<script lang="ts">
/* The resize toolbar inside a Svelte Flow canvas of one node, the block it resizes, with the canvas's actions set. */
import type { Node } from "@xyflow/svelte";
import { SvelteFlow } from "@xyflow/svelte";
import type { ComponentProps } from "svelte";
import type { NodeActions } from "../src/nodeActions.ts";
import { setNodeActions } from "../src/nodeActions.ts";
import ResizeToolbar from "../src/ResizeToolbar.svelte";

let { toolbar, actions }: { toolbar: ComponentProps<typeof ResizeToolbar>; actions: NodeActions } =
  $props();

// Set once with the actions the harness is made with: a test makes a harness per case.
// svelte-ignore state_referenced_locally
setNodeActions(actions);

let nodes: Node[] = $derived([
  { id: toolbar.block.id, position: { x: 0, y: 0 }, data: {}, width: 100, height: 50 },
]);
</script>

<div style="width: 800px; height: 600px">
  <SvelteFlow bind:nodes edges={[]}>
    <ResizeToolbar {...toolbar} />
  </SvelteFlow>
</div>
