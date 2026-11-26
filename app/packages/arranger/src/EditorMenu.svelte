<script lang="ts">
/**
 * The editors a long press lists (`editorsUnder`): a small menu at the
 * finger, one button per editor, innermost first. Choosing one opens it
 * (`onchoose`); Escape, a press outside the menu or a choice closes it
 * (`onclose`). It lies outside the canvas's element, so the canvas's keys
 * and pointer never see its own.
 */
import type { Attachment } from "svelte/attachments";
import type { EditorChoice } from "./editors.ts";
import { listen } from "./gesture.ts";

interface Props {
  readonly choices: readonly EditorChoice[];
  /** The client point the menu opens at: its top left corner. */
  readonly x: number;
  readonly y: number;
  onchoose: (choice: EditorChoice) => void;
  onclose: () => void;
}

let { choices, x, y, onchoose, onclose }: Props = $props();

/**
 * The menu takes the focus on its first item, and closes on a press
 * outside it, heard on the window before anything else sees it.
 */
const opened: Attachment<HTMLElement> = (menu) => {
  menu.querySelector("button")?.focus();
  return listen(
    window,
    "pointerdown",
    (event) => {
      if (!(event.target instanceof Node) || !menu.contains(event.target)) onclose();
    },
    { capture: true },
  );
};

/** Escape closes the menu; the arrows move the focus among its items. */
function onkeydown(event: KeyboardEvent & { currentTarget: HTMLElement }): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onclose();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const items = Array.from(event.currentTarget.querySelectorAll("button"));
  const focused = document.activeElement;
  const at = focused instanceof HTMLButtonElement ? items.indexOf(focused) : -1;
  const step = event.key === "ArrowDown" ? 1 : -1;
  items[(at + step + items.length) % items.length]?.focus();
}
</script>

<div
  class="editor-menu"
  role="menu"
  aria-label="Open an editor"
  data-testid="editor-menu"
  tabindex="-1"
  style:left="{x}px"
  style:top="{y}px"
  {onkeydown}
  {@attach opened}
>
  {#each choices as choice (choice.label)}
    <button
      type="button"
      role="menuitem"
      data-testid="editor-menu-item"
      onclick={() => {
        onchoose(choice);
        onclose();
      }}>{choice.label}</button
    >
  {/each}
</div>

<style>
  .editor-menu {
    position: fixed;
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 10rem;
    padding: 0.25rem 0;
    border: 1px solid #c8c8c8;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 2px 8px rgb(0 0 0 / 20%);
    font-size: 0.9rem;
  }

  button {
    padding: 0.5rem 0.75rem;
    border: none;
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button:hover,
  button:focus-visible {
    background: #e8f0fe;
    outline: none;
  }
</style>
