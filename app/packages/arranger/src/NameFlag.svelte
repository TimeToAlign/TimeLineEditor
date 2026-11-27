<svelte:options namespace="svg" />

<script lang="ts">
/*
 * A cut name shown whole while the pointer is on it (`nameFlag.ts`): its
 * whole text on an opaque box, in the canvas's flag colours, covering what
 * lies behind. An overlay over a block's drawing, drawn without an address
 * and letting the pointer through, never part of the drawing or its exports.
 */
import { attributeText } from "@timetoalign/tilie-writers";
import type { NameFlag } from "./nameFlag.ts";

let { flag }: { flag: NameFlag } = $props();
</script>

<g class="tilie-name-flag" data-testid="name-flag" pointer-events="none" aria-hidden="true">
  <rect
    class="tilie-name-flag-box"
    x={attributeText(flag.box.x)}
    y={attributeText(flag.box.y)}
    width={attributeText(flag.box.width)}
    height={attributeText(flag.box.height)}
  />
  <text {...flag.attributes}>{flag.text}</text>
</g>
