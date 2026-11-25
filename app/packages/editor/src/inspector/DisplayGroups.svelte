<script lang="ts">
/**
 * The display toggles of a selected band or flow-control element in the
 * Properties tab (`display.ts`): one row per group, its key beside the
 * toggles the stamp tabs show a timestamp's display with
 * (`DisplayToggles`). A press sends one `style`, a rule in the block's
 * manifest (`toggleCommand`); a refusal is posted as information.
 */
import type { Block, Store, View } from "@timetoalign/tilie-core";
import { postOf } from "../messages.svelte.ts";
import type { ToggleGroup } from "./display.ts";
import { toggleCommand } from "./display.ts";
import DisplayToggles from "./stamps/DisplayToggles.svelte";

let {
  view,
  store,
  block,
  groups,
}: {
  view: View;
  store: Store;
  /** The block the band or the element lies in. */
  block: Block;
  groups: readonly ToggleGroup[];
} = $props();

const uid = $props.id();
const post = postOf();

/** Send the press of the toggle `word` of `group`. */
function press(group: ToggleGroup, word: string): void {
  const toggle = group.toggles.find((item) => item.word === word);
  if (toggle === undefined) return;
  const refusal = store.dispatch(toggleCommand(view, block, toggle));
  if (refusal !== null) post("info", refusal.message);
}
</script>

{#if groups.length > 0}
  <div class="groups" data-testid="display-toggles">
    {#each groups as group, index (group.key)}
      <span class="key" id="{uid}-{index}">{group.key}</span>
      <DisplayToggles
        words={group.toggles}
        display={group.toggles.filter((toggle) => toggle.pressed).map((toggle) => toggle.word)}
        disabled={false}
        labelledby="{uid}-{index}"
        ontoggle={(word) => press(group, word)}
      />
    {/each}
  </div>
{/if}

<style>
  /* Keys in one column, their toggles in the other, as the Timestamp tab's Properties. */
  .groups {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: baseline;
    gap: 0.4rem 0.75rem;
    margin-top: 0.5rem;
  }

  .key {
    color: #595959;
  }
</style>
