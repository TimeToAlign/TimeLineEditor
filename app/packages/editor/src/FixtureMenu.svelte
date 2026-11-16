<script lang="ts">
/**
 * The header's fixture menu of development and test builds: the fixtures
 * (`fixtures.ts`), one chosen and opened with Open as the Examples menu
 * opens an example.
 */
import type { Example } from "./examples.ts";
import { FIXTURES } from "./fixtures.ts";

interface Props {
  /** Open the fixture `example` as the Examples menu opens one. */
  onopen: (example: Example) => Promise<void>;
}

let { onopen }: Props = $props();

let fixture = $state(FIXTURES[0]?.label ?? "");

/** Open the chosen fixture. */
function open(): void {
  const chosen = FIXTURES.find(({ label }) => label === fixture);
  if (chosen !== undefined) void onopen(chosen);
}
</script>

{#if FIXTURES.length > 0}
<div class="fixtures">
  <label>
    Fixture
    <select data-testid="fixture-select" bind:value={fixture}>
      {#each FIXTURES as item (item.label)}
        <option value={item.label}>{item.label}</option>
      {/each}
    </select>
  </label>
  <button type="button" data-testid="fixture-open" onclick={open}>Open</button>
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
