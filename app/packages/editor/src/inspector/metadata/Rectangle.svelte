<script lang="ts">
/**
 * One tile of the Metadata tab: one verb about one thing, collapsed to its
 * sentence (the verb in words and the thing's label, with a thumbnail where
 * the lookup finds one; for the first tile, `sentence`: what the element
 * is). One click on the expand button shows its pairs, property and value
 * as the file writes them, IRIs as slugs with the full IRI as their title,
 * each a separate row, each value a link out where it is a web address,
 * each with a Provenance button opening its paradata, its beliefs and the
 * actions on it (`Provenance`); then "＋ Add vocabulary". The empty "is a"
 * tile offers "State what it is". A pair without an entry is stated by the
 * manifest. Believing a stated pair false records the belief and leaves
 * the pair stated, so Remove stays an action of its own.
 */
import { canonicalText } from "@timetoalign/tilie-core";
import type { Belief } from "@timetoalign/timetoshare";
import { userOf } from "../../user.svelte.ts";
import Provenance from "../Provenance.svelte";
import { beliefOf } from "../provenance.ts";
import type { Frame, Pair, RectangleView } from "./frame.ts";
import { thumbnailsOf } from "./thumbnails.svelte.ts";

let {
  rectangle,
  frame,
  sentence,
  onbelieve,
  onremove,
  onvocabulary,
  onstate,
}: {
  rectangle: RectangleView;
  /** The element the rectangle is stated of. */
  frame: Frame;
  /** The first tile's sentence, in place of the verb and the label. */
  sentence?: string | undefined;
  onbelieve: (pair: Pair, belief: Belief) => void;
  onremove: (pair: Pair) => void;
  onvocabulary: () => void;
  /** The empty "is a" tile's "State what it is". */
  onstate?: () => void;
} = $props();

const uid = $props.id();
const thumbnails = thumbnailsOf();
const user = userOf();

/** Whether the pairs are shown. */
let expanded = $state(false);

const empty = $derived(rectangle.pairs.length === 0);
const keys = $derived(rectangle.pairs.map((pair) => canonicalText(pair)));
const thing = $derived(thumbnails.first(rectangle.things));
const image = $derived(thing === null ? null : thumbnails.imageOf(thing));
</script>

<div
  role="group"
  aria-labelledby="{uid}-heading"
  tabindex="-1"
  data-key={rectangle.key}
  class="rectangle"
  data-testid="metadata-rectangle"
  data-frame={frame.key}
>
  <h3 id="{uid}-heading" data-testid="metadata-heading">
    {#if empty}
      <span class="sentence">{sentence ?? rectangle.heading}</span>
    {:else}
      <button
        type="button"
        class="toggle"
        data-testid="metadata-expand"
        aria-expanded={expanded}
        aria-controls="{uid}-pairs"
        onclick={() => (expanded = !expanded)}
      >
        <svg class="chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
        {#if thing !== null}
          <span class="thumbnail" {@attach thumbnails.load(thing)}>
            {#if image !== null}<img src={image} alt="" width="28" height="28" />{/if}
          </span>
        {/if}
        {#if sentence !== undefined}
          <span class="sentence">{sentence}</span>
        {:else}
          <span class="words">
            <span class="verb">{rectangle.heading}</span>
            {#if rectangle.label !== null}
              <strong data-testid="metadata-label">{rectangle.label}</strong>
            {/if}
          </span>
        {/if}
      </button>
    {/if}
  </h3>
  {#if empty}
    <button type="button" data-testid="metadata-state" onclick={() => onstate?.()}
      >State what it is</button
    >
  {:else}
    <div id="{uid}-pairs" class="pairs" hidden={!expanded}>
      <ul data-testid="metadata-vocabulary">
        {#each rectangle.rows as row, index (keys[index])}
          {@const pair = rectangle.pairs[index]}
          {@const line = rectangle.entries[index] ?? null}
          <li>
            <span class="pair">
              <code class="property" title={row.property.iri ?? undefined}>{row.property.text}</code>
              {#if row.href !== null}
                <a href={row.href} title={row.value.iri ?? undefined} rel="noreferrer" target="_blank"
                  >{row.value.text} ↗</a
                >
              {:else}
                <code title={row.value.iri ?? undefined}>{row.value.text}</code>
              {/if}
            </span>
            {#if pair !== undefined}
              <Provenance
                subject="{row.property.text} {row.value.text}"
                {line}
                missing="No provenance entry: the manifest states it."
                mine={beliefOf(line, user.state.user)}
                onbelieve={(belief) => onbelieve(pair, belief)}
              >
                {#snippet actions()}
                  <button type="button" onclick={() => onremove(pair)}>Remove</button>
                {/snippet}
              </Provenance>
            {/if}
          </li>
        {/each}
      </ul>
      {#if rectangle.addable.length > 0}
        <button type="button" data-testid="metadata-add-vocabulary" onclick={onvocabulary}
          >＋ Add vocabulary</button
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  .rectangle {
    padding: 0.3rem 0.5rem;
    border: 1px solid #c8c8c8;
    border-radius: 4px;
    background: #fff;
  }

  .rectangle:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  h3 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: normal;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.1rem 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .chevron {
    flex: none;
    fill: none;
    stroke: #1d4f91;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 120ms ease-out;
  }

  .toggle[aria-expanded="true"] .chevron {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }

  .thumbnail:empty {
    display: none;
  }

  img {
    display: block;
    object-fit: cover;
    border-radius: 2px;
  }

  .pairs {
    margin-top: 0.3rem;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0 0 0.3rem;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.4rem;
    padding: 0.2rem 0.35rem;
    border: 1px solid #e2e2e2;
    border-radius: 3px;
    background: #fafafa;
    overflow-wrap: anywhere;
  }

  .pair {
    flex: 1 1 auto;
    min-width: 0;
    color: #3d3d3d;
  }

  .property {
    color: #595959;
  }

  code,
  a {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    font-size: 0.78rem;
  }

  a {
    color: #1d4f91;
  }

  button:not(.toggle) {
    padding: 0.1rem 0.45rem;
    border: 1px solid #bdbdbd;
    border-radius: 3px;
    background: #fff;
    font: inherit;
    font-size: 0.78rem;
    color: inherit;
    cursor: pointer;
  }

  button:focus-visible,
  a:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  [hidden] {
    display: none;
  }
</style>
