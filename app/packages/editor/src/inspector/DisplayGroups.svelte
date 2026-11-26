<script lang="ts">
/**
 * The display controls of a selected band or flow-control element in the
 * Properties tab (`display.ts`): one row per group, its key beside the
 * toggles the stamp tabs show a timestamp's display with
 * (`DisplayToggles`). A control that changes nothing drawn now is
 * disabled, its reason its tooltip and a line below the group's toggles.
 * A press sends one `style`, a rule in the block's manifest
 * (`controlCommand`); a refusal is posted as information.
 */
import type { Block, Store, View } from "@timetoalign/tilie-core";
import { postOf } from "../messages.svelte.ts";
import type { ControlGroup } from "./display.ts";
import { controlCommand } from "./display.ts";
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
  groups: readonly ControlGroup[];
} = $props();

const uid = $props.id();
const post = postOf();

/** Send the press of the control `word` of `group`. */
function press(group: ControlGroup, word: string): void {
  const control = group.controls.find((item) => item.word === word);
  if (control === undefined || control.inert !== null) return;
  const refusal = store.dispatch(controlCommand(view, block, control));
  if (refusal !== null) post("info", refusal.message);
}
</script>

{#if groups.length > 0}
  <div class="groups" data-testid="display-toggles">
    {#each groups as group, index (group.key)}
      {@const inert = group.controls.filter((control) => control.inert !== null)}
      <span class="key" id="{uid}-{index}">{group.key}</span>
      <div class="controls">
        <DisplayToggles
          words={group.controls}
          display={group.controls.filter((control) => control.pressed).map((control) => control.word)}
          disabled={false}
          labelledby="{uid}-{index}"
          describedby={inert.length > 0 ? `${uid}-${index}-inert` : undefined}
          ontoggle={(word) => press(group, word)}
        />
        {#if inert.length > 0}
          <ul class="inert" id="{uid}-{index}-inert" data-testid="display-inert">
            {#each inert as control (control.word)}
              <li>{control.label}: {control.inert}</li>
            {/each}
          </ul>
        {/if}
      </div>
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

  /* Why a disabled control changes nothing: greyed text that stays readable. */
  .inert {
    margin: 0.2rem 0 0;
    padding: 0;
    list-style: none;
    color: #6b6b6b;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
</style>
