<script lang="ts" generics="Word extends string">
/**
 * The toggles of what a stamp's line shows (a timestamp's `display`, an
 * alignment anchor's): one button per word, in the order given, pressed
 * while `display` holds its word. A press reports the word (`ontoggle`);
 * the caller sends the command. Disabled, the toggles show greyed; a word
 * with a reason it changes nothing (`inert`) is disabled alone, the reason
 * its button's tooltip.
 */

interface Props {
  /** The words, each with its button's label and the reason it is disabled, if any, in their order. */
  words: readonly {
    readonly word: Word;
    readonly label: string;
    readonly inert?: string | null;
  }[];
  /** The words shown now. */
  display: readonly Word[];
  disabled: boolean;
  /** The group's name, where no element names it (`labelledby`). */
  label?: string | undefined;
  /** The ID of the element naming the group. */
  labelledby?: string | undefined;
  /** The IDs of what describes the group. */
  describedby?: string | undefined;
  ontoggle: (word: Word) => void;
}

let { words, display, disabled, label, labelledby, describedby, ontoggle }: Props = $props();
</script>

<div
  class="toggles"
  role="group"
  aria-label={label}
  aria-labelledby={labelledby}
  aria-describedby={describedby}
>
  {#each words as { word, label: text, inert = null } (word)}
    <button
      type="button"
      class="toggle"
      aria-pressed={display.includes(word)}
      disabled={disabled || inert !== null}
      title={inert ?? undefined}
      onclick={() => ontoggle(word)}>{text}</button
    >
  {/each}
</div>

<style>
  .toggles {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .toggle {
    padding: 0.1rem 0.4rem;
    border: 1px solid #c8c8c8;
    border-radius: 3px;
    background: #fff;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .toggle[aria-pressed="true"] {
    border-color: #0a84ff;
    background: #e8f0fe;
    color: #0b3d91;
  }

  .toggle:hover:enabled {
    border-color: #0a84ff;
  }

  .toggle:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  .toggle:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
