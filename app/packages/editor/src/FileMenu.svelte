<script module lang="ts">
/** One entry of the menu. */
export interface MenuItem {
  readonly label: string;
  /** The shortcut as shown, e.g. `Ctrl+S`. */
  readonly shortcut?: string;
  /** The shortcut in `aria-keyshortcuts` form, e.g. `Control+S`. */
  readonly keys?: string;
  readonly disabled?: boolean;
  readonly run: () => void;
}
</script>

<script lang="ts">
/**
 * A menu button (the WAI-ARIA menu button pattern): a click, Enter, Space
 * or ArrowDown open the menu on its first item, ArrowUp on its last; arrows,
 * Home and End move between the items, Escape closes and returns the focus
 * to the button, Tab or a press elsewhere closes. A disabled item takes the
 * focus but does nothing.
 */
import { tick } from "svelte";

interface Props {
  label: string;
  items: readonly MenuItem[];
}

let { label, items }: Props = $props();

let open = $state(false);
let button: HTMLButtonElement | undefined = $state();
let menu: HTMLElement | undefined = $state();
const id = $props.id();

function entries(): HTMLElement[] {
  return menu === undefined ? [] : [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

async function show(at: "first" | "last"): Promise<void> {
  open = true;
  await tick();
  const all = entries();
  (at === "first" ? all[0] : all.at(-1))?.focus();
}

function close(refocus: boolean): void {
  open = false;
  if (refocus) button?.focus();
}

function choose(item: MenuItem): void {
  if (item.disabled) return;
  close(true);
  item.run();
}

function onbuttonkeydown(event: KeyboardEvent): void {
  // Enter and Space press the button, whose click opens the menu on its first item.
  if (event.key === "ArrowDown") {
    event.preventDefault();
    void show("first");
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    void show("last");
  }
}

function onmenukeydown(event: KeyboardEvent): void {
  const all = entries();
  const at = all.indexOf(document.activeElement as HTMLElement);
  const focus = (index: number) => all[(index + all.length) % all.length]?.focus();
  switch (event.key) {
    case "ArrowDown":
      focus(at + 1);
      break;
    case "ArrowUp":
      focus(at - 1);
      break;
    case "Home":
      focus(0);
      break;
    case "End":
      focus(all.length - 1);
      break;
    case "Escape":
      close(true);
      break;
    case "Tab":
      close(false);
      return;
    default:
      return;
  }
  event.preventDefault();
  event.stopPropagation();
}

/** A press outside the button and the menu closes it. */
function onwindowpointerdown(event: PointerEvent): void {
  if (!open || !(event.target instanceof Node)) return;
  if (button?.contains(event.target) || menu?.contains(event.target)) return;
  close(false);
}
</script>

<svelte:window onpointerdown={onwindowpointerdown} />

<div class="menu-button">
  <button
    type="button"
    id="{id}-button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls="{id}-menu"
    bind:this={button}
    onclick={() => (open ? close(true) : show("first"))}
    onkeydown={onbuttonkeydown}>{label}</button
  >
  <ul
    id="{id}-menu"
    role="menu"
    aria-labelledby="{id}-button"
    hidden={!open}
    bind:this={menu}
    onkeydown={onmenukeydown}
  >
    {#each items as item (item.label)}
      <li role="none">
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          aria-disabled={item.disabled ? "true" : undefined}
          aria-keyshortcuts={item.keys}
          onclick={() => choose(item)}
        >
          <span>{item.label}</span>
          {#if item.shortcut}<kbd>{item.shortcut}</kbd>{/if}
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .menu-button {
    position: relative;
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

  [aria-haspopup] {
    padding: 0.1rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    font-size: 0.85rem;
  }

  [aria-haspopup]:hover,
  [aria-expanded="true"] {
    background: #ececec;
  }

  ul {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 30;
    min-width: 15rem;
    margin: 0;
    padding: 0.25rem 0;
    border: 1px solid #c4c4c4;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    list-style: none;
  }

  ul[hidden] {
    display: none;
  }

  [role="menuitem"] {
    display: flex;
    justify-content: space-between;
    gap: 1.5rem;
    width: 100%;
    padding: 0.3rem 0.75rem;
    border: none;
    background: none;
    font-size: 0.85rem;
    text-align: left;
  }

  [role="menuitem"]:hover,
  [role="menuitem"]:focus {
    background: #e8f0fe;
  }

  [role="menuitem"][aria-disabled="true"] {
    color: #6b6b6b;
    cursor: default;
  }

  kbd {
    font-family: inherit;
    color: #595959;
  }
</style>
