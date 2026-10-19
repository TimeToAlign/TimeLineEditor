<script lang="ts">
/**
 * The header's fixture menu of development and test builds: the fixture
 * workspaces (`fixtures.ts`), one chosen and opened with Load. Why a
 * fixture could not be opened is shown beside the button.
 */
import { FIXTURES } from "./fixtures.ts";
import { messageOf } from "./messages.ts";

interface Props {
  /** Open the workspace file `text`; throws when it is refused. */
  onload: (text: string) => void;
}

let { onload }: Props = $props();

let fixture = $state(FIXTURES[0]?.name ?? "");
let problem = $state("");

/** Open the chosen fixture. */
async function load(): Promise<void> {
  const chosen = FIXTURES.find(({ name }) => name === fixture);
  if (chosen === undefined) return;
  try {
    onload(await chosen.text());
    problem = "";
  } catch (error) {
    problem = messageOf(error);
  }
}
</script>

{#if FIXTURES.length > 0}
<div class="fixtures">
  <label>
    Fixture
    <select data-testid="fixture-select" bind:value={fixture}>
      {#each FIXTURES as item (item.name)}
        <option value={item.name}>{item.name}</option>
      {/each}
    </select>
  </label>
  <button type="button" data-testid="fixture-load" onclick={load}>Load</button>
  <span class="problem" role="status">{problem}</span>
</div>
{/if}

<style>
  .fixtures {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }

  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
