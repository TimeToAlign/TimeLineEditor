<script lang="ts">
/*
 * The Arrange menu: how the contents of the canvas's level are arranged, in
 * the look of the resize modes (`ModeMenu`). On the arranger it arranges
 * the blocks (Free, Vertical, Horizontal, Matrix and, for a matrix, its
 * number of columns); in a bundle editor the edited block's items (Free,
 * Vertical, Horizontal), Horizontal refused with its reason where the
 * items cannot stand side by side. What a choice stores is the canvas's.
 */
import type { CanvasDirection } from "@timetoalign/tilie-core";
import ModeMenu from "./ModeMenu.svelte";

/** A choice of the menu: no arrangement, or a direction. */
type Choice = "free" | CanvasDirection;

interface Props {
  /** Whose contents are arranged: the arranger's blocks, or a bundle editor's items. */
  level: "arranger" | "bundle";
  /** The arrangement stated now. */
  chosen: Choice;
  /** A matrix's number of columns, shown while Matrix is chosen. */
  columns: number;
  /** Why the items cannot stand side by side; `null` where they can. */
  refused: string | null;
  /** While disabled no choice is taken: a locked or read-only canvas. */
  disabled: boolean;
  onchoose: (choice: Choice) => void;
  oncolumns: (columns: number) => void;
}

let { level, chosen, columns, refused, disabled, onchoose, oncolumns }: Props = $props();

const what = $derived(level === "arranger" ? "blocks" : "items");

const entries = $derived([
  { value: "free" as const, label: "Free", hint: `each of the ${what} at its own place` },
  { value: "vertical" as const, label: "Vertical", hint: `the ${what} one under another` },
  {
    value: "horizontal" as const,
    label: "Horizontal",
    hint:
      level === "arranger"
        ? "the blocks side by side"
        : "the items side by side, each parent timeline drawn once behind them",
    ...(refused === null ? {} : { refused }),
  },
  ...(level === "arranger"
    ? [{ value: "matrix" as const, label: "Matrix", hint: "the blocks in rows and columns" }]
    : []),
]);
</script>

<div class="arrange-menu">
  <ModeMenu
    label="Arrange the {what}"
    {entries}
    pressed={(value) => chosen === value}
    {disabled}
    testid="arrange"
    onpress={onchoose}
  >
    {#if chosen === "matrix"}
      <div class="tilie-menu columns" role="group" aria-label="Columns">
        <span class="count" data-testid="arrange-columns">Columns {columns}</span>
        <button
          type="button"
          class="tilie-menu-item"
          data-testid="arrange-columns-fewer"
          aria-label="Fewer columns"
          disabled={disabled || columns <= 1}
          onclick={() => oncolumns(columns - 1)}>−</button
        >
        <button
          type="button"
          class="tilie-menu-item"
          data-testid="arrange-columns-more"
          aria-label="More columns"
          {disabled}
          onclick={() => oncolumns(columns + 1)}>+</button
        >
      </div>
    {/if}
    {#if refused !== null}
      <p class="refused" data-testid="arrange-refused">Horizontal: {refused}</p>
    {/if}
  </ModeMenu>
</div>

<style>
  .arrange-menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 22rem;
  }

  .columns {
    align-items: center;
    margin-top: 4px;
  }

  .count {
    padding: 0 0.4rem;
    font-size: 0.85rem;
  }

  .refused {
    margin: 4px 0 0;
    padding: 4px 6px;
    background: #fff;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #595959;
  }
</style>
