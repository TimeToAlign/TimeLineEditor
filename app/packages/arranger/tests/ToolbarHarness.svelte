<script lang="ts">
/* The resize toolbar inside a Svelte Flow canvas of one node, the block it resizes. */
import type { Node } from "@xyflow/svelte";
import { SvelteFlow } from "@xyflow/svelte";
import type { ComponentProps } from "svelte";
import ResizeToolbar from "../src/ResizeToolbar.svelte";

let { toolbar }: { toolbar: ComponentProps<typeof ResizeToolbar> } = $props();

let nodes: Node[] = $derived([
  { id: toolbar.block.id, position: { x: 0, y: 0 }, data: {}, width: 100, height: 50 },
]);
</script>

<div style="width: 800px; height: 600px">
  <SvelteFlow bind:nodes edges={[]}>
    <ResizeToolbar {...toolbar} />
  </SvelteFlow>
</div>
