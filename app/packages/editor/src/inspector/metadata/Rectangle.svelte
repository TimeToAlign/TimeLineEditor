<script lang="ts">
/**
 * One rectangle of the Metadata tab: one verb about one thing. Its first
 * line, highlighted, gives the verb in words and the thing's label, with a
 * thumbnail where the lookup finds one; below, muted, one row per
 * vocabulary that states it, property and value as the file writes them,
 * each value a link out where it is a web address; then who stated it, how
 * and when, its status as text, the details of every annotation, Reject,
 * Remove and "＋ vocabulary". Rejecting is a button of its own, named with
 * the statement, never a choice in a list, which a key could make on the
 * way through. The empty "is a" rectangle offers "State what it is".
 */
import type { Frame, RectangleView } from "./frame.ts";
import { rectangleWords } from "./frame.ts";
import { thumbnailsOf } from "./thumbnails.svelte.ts";

let {
  rectangle,
  frame,
  onremove,
  onreject,
  onvocabulary,
  onstate,
}: {
  rectangle: RectangleView;
  /** The element the rectangle is stated of. */
  frame: Frame;
  onremove: () => void;
  onreject: () => void;
  onvocabulary: () => void;
  /** The empty "is a" rectangle's "State what it is". */
  onstate?: () => void;
} = $props();

const uid = $props.id();
const thumbnails = thumbnailsOf();

/** Whether the annotations' details are shown. */
let detailed = $state(false);

const empty = $derived(rectangle.pairs.length === 0);
const thing = $derived(thumbnails.first(rectangle.things));
const image = $derived(thing === null ? null : thumbnails.imageOf(thing));
/** "method · who · date" of the first pair with an annotation. */
const provenance = $derived.by(() => {
  const line = rectangle.entries.find((entry) => entry !== null);
  if (line === undefined || line === null) return "no annotation";
  return [line.method, line.who, line.date].filter((part) => part !== null).join(" · ");
});
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
    {#if thing !== null}
      <span class="thumbnail" {@attach thumbnails.load(thing)}>
        {#if image !== null}<img src={image} alt="" width="32" height="32" />{/if}
      </span>
    {/if}
    <span class="verb">{rectangle.heading}</span>
    {#if rectangle.label !== null}
      <strong data-testid="metadata-label">{rectangle.label}</strong>
    {/if}
  </h3>
  {#if empty}
    <p class="empty">Not stated yet.</p>
    <button type="button" data-testid="metadata-state" onclick={() => onstate?.()}
      >State what it is</button
    >
  {:else}
    <ul data-testid="metadata-vocabulary">
      {#each rectangle.rows as row, index (index)}
        <li>
          <code>{row.property}</code>
          {#if row.href !== null}
            <a href={row.href} rel="noreferrer" target="_blank">{row.value} ↗</a>
          {:else}
            <code>{row.value}</code>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="provenance" data-testid="metadata-provenance">{provenance}</p>
    <div class="actions">
      <span class="status" data-testid="metadata-status">Status: confirmed</span>
      <button type="button" aria-label="Reject {rectangleWords(rectangle)}" onclick={onreject}
        >Reject</button
      >
      <button
        type="button"
        aria-expanded={detailed}
        aria-controls="{uid}-details"
        onclick={() => (detailed = !detailed)}>Details</button
      >
      <button type="button" onclick={onremove}>Remove</button>
      {#if rectangle.addable.length > 0}
        <button type="button" data-testid="metadata-add-vocabulary" onclick={onvocabulary}
          >＋ vocabulary</button
        >
      {/if}
    </div>
    <div id="{uid}-details" hidden={!detailed}>
      {#each rectangle.rows as row, index (index)}
        {@const line = rectangle.entries[index] ?? null}
        <dl>
          <dt>pair</dt>
          <dd><code>{row.property}</code> <code>{row.value}</code></dd>
          {#if line === null}
            <dt>annotation</dt>
            <dd>none</dd>
          {:else}
            {#if line.who !== null}<dt>stated by</dt><dd>{line.who}</dd>{/if}
            {#if line.method !== null}<dt>method</dt><dd>{line.method}</dd>{/if}
            {#if line.service !== null}<dt>service</dt><dd><code>{line.service}</code></dd>{/if}
            {#if line.basis.length > 0}<dt>basis</dt><dd>{line.basis.join(", ")}</dd>{/if}
            {#if line.match !== null}<dt>match</dt><dd>{line.match}</dd>{/if}
            {#if line.note !== null}<dt>note</dt><dd>{line.note}</dd>{/if}
            {#if line.date !== null}<dt>date</dt><dd>{line.date}</dd>{/if}
          {/if}
        </dl>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rectangle {
    padding: 0.4rem 0.5rem;
    border: 1px solid #c8c8c8;
    border-radius: 4px;
    background: #fff;
  }

  .rectangle:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: -0.4rem -0.5rem 0.3rem;
    padding: 0.3rem 0.5rem;
    border-radius: 4px 4px 0 0;
    background: #eef4fb;
    font-size: 0.85rem;
    font-weight: normal;
  }

  .thumbnail:empty {
    display: none;
  }

  img {
    display: block;
    object-fit: cover;
    border-radius: 2px;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    color: #555;
  }

  li {
    overflow-wrap: anywhere;
  }

  code,
  a {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    font-size: 0.78rem;
  }

  a {
    color: #1d4f91;
  }

  p {
    margin: 0.25rem 0;
  }

  .empty,
  .provenance,
  .status {
    color: #595959;
    font-size: 0.78rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
  }

  button {
    padding: 0.1rem 0.45rem;
    border: 1px solid #bdbdbd;
    border-radius: 3px;
    background: #fafafa;
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

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0 0.5rem;
    margin: 0.3rem 0 0;
    font-size: 0.78rem;
  }

  dt {
    color: #595959;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  [hidden] {
    display: none;
  }
</style>
