<script lang="ts">
/**
 * "Other property…": a property the catalogue does not know, as a compact
 * IRI with a prefix the manifest or the catalogue declares or in full, and
 * its value: a thing (an IRI), a text, a text in a language, or a date.
 */
import type { ComposerState, OtherKind } from "./composer.svelte.ts";
import type { Frame } from "./frame.ts";

let { frame, state: composer }: { frame: Frame; state: ComposerState } = $props();

const uid = $props.id();

const KINDS: readonly { readonly kind: OtherKind; readonly label: string }[] = [
  { kind: "thing", label: "a thing (IRI)" },
  { kind: "text", label: "a text" },
  { kind: "language", label: "a text in a language" },
  { kind: "date", label: "a date" },
];
</script>

<div class="other" data-frame={frame.key}>
  <label for="{uid}-property">Property</label>
  <input
    id="{uid}-property"
    type="text"
    placeholder="dcterms:subject"
    bind:value={composer.other.property}
  />
  <fieldset>
    <legend>Value kind</legend>
    {#each KINDS as { kind, label } (kind)}
      <label class="choice">
        <input type="radio" name="{uid}-kind" value={kind} bind:group={composer.other.kind} />
        {label}
      </label>
    {/each}
  </fieldset>
  <label for="{uid}-value">Value</label>
  <input
    id="{uid}-value"
    type="text"
    placeholder={composer.other.kind === "date" ? "YYYY-MM-DD" : ""}
    bind:value={composer.other.text}
  />
  {#if composer.other.kind === "language"}
    <label for="{uid}-language">Language</label>
    <input id="{uid}-language" type="text" placeholder="en" bind:value={composer.other.language} />
  {/if}
</div>

<style>
  .other {
    display: grid;
    gap: 0.2rem;
  }

  label {
    font-weight: 600;
  }

  .choice {
    display: block;
    font-weight: normal;
  }

  fieldset {
    margin: 0.2rem 0;
    padding: 0.2rem 0.4rem;
    border: 1px solid #d0d0d0;
    border-radius: 3px;
  }

  input[type="text"] {
    box-sizing: border-box;
    width: 100%;
    padding: 0.25rem 0.4rem;
    border: 1px solid #bdbdbd;
    border-radius: 4px;
    font: inherit;
  }

  input:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
