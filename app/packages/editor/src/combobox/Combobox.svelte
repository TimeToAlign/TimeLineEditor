<script lang="ts" generics="T">
/**
 * An editable combobox with a list of options, after the WAI-ARIA Authoring
 * Practices "Combobox Pattern", example "Editable Combobox With List
 * Autocomplete": the user of the component gives the options for the text
 * (filtered or searched), typing never selects one, and the focus never
 * leaves the text field, which names the active option through
 * `aria-activedescendant`. The keys are `keys.ts`'s table.
 */
import type { Snippet } from "svelte";
import type { Attachment } from "svelte/attachments";
import { announcement, keyed, typed } from "./keys.ts";

interface Props {
  /** The accessible name of the field and the listbox, unless `labelledby` names them. */
  label: string;
  labelledby?: string | undefined;
  describedby?: string | undefined;
  /** The field's text; bind it, through a function binding to drive a search. */
  text: string;
  options: readonly T[];
  /** An option's key in the keyed list. */
  keyOf: (option: T) => string;
  /** A search for the text is running: the listbox is busy and "Searching…" announced. */
  loading?: boolean | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  /** An option's content; the flag says whether it is the active one. */
  option: Snippet<[T, boolean]>;
  /** Shown with the list, given the text, while it is open with text, no option and no search running. */
  empty?: Snippet<[string]> | undefined;
  onpick: (option: T) => void;
  /** Enter without an active option. */
  onenter?: ((text: string) => void) | undefined;
  /** Pasted text; answering `true` consumes the paste. */
  onpaste?: ((text: string) => boolean) | undefined;
  /** The status region's words for a count of options and whether a search runs. */
  announce?: ((count: number, loading: boolean) => string) | undefined;
}

let {
  label,
  labelledby,
  describedby,
  text = $bindable(),
  options,
  keyOf,
  loading = false,
  disabled = false,
  placeholder,
  option,
  empty,
  onpick,
  onenter,
  onpaste,
  announce = announcement,
}: Props = $props();

const id = $props.id();
let open = $state(false);
let active: number | null = $state(null);
/** The active option while it is one of the options: a list that shrank leaves none active. */
const current = $derived(active !== null && active < options.length ? active : null);
const expanded = $derived(
  !disabled && open && (options.length > 0 || loading || (empty !== undefined && text !== "")),
);
const emptyShown = $derived(expanded && !loading && options.length === 0 && text !== "");
const status = $derived(expanded && text !== "" ? announce(options.length, loading) : "");
/** The field, held by an attachment for `focus`; not reactive. */
let input: HTMLInputElement | undefined;

/** Focus the text field. */
export function focus(): void {
  input?.focus();
}

const held: Attachment<HTMLInputElement> = (element) => {
  input = element;
  return () => {
    input = undefined;
  };
};

/** Scroll option `index` into view whenever it becomes the active one. */
function visible(index: number): Attachment<HTMLElement> {
  return (element) => {
    if (current === index) element.scrollIntoView({ block: "nearest" });
  };
}

function close(): void {
  open = false;
  active = null;
}

function pick(chosen: T | undefined): void {
  close();
  if (chosen !== undefined) onpick(chosen);
}

/** The setter of the field's function binding: typing. */
function write(value: string): void {
  text = value;
  ({ open, active } = typed(value));
}

function onkeydown(event: KeyboardEvent): void {
  if (event.isComposing) return;
  const before = current;
  const answer = keyed(
    { open, active: current },
    event.key,
    event.altKey,
    options.length,
    text,
    expanded,
  );
  ({ open, active } = answer.state);
  if (answer.handled) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (answer.action === "pick" && before !== null) pick(options[before]);
  else if (answer.action === "enter") onenter?.(text);
  else if (answer.action === "clear") text = "";
}

function pasted(event: ClipboardEvent): void {
  if (onpaste?.(event.clipboardData?.getData("text") ?? "")) event.preventDefault();
}

function onfocusout(event: FocusEvent & { currentTarget: HTMLDivElement }): void {
  const to = event.relatedTarget;
  if (!(to instanceof Node && event.currentTarget.contains(to))) close();
}

/** Pressing anywhere in the popup, the options or the content for no results, keeps the focus in the field. */
const keepFocus: Attachment<HTMLElement> = (element) => {
  const kept = (event: Event) => event.preventDefault();
  element.addEventListener("pointerdown", kept);
  element.addEventListener("mousedown", kept);
  return () => {
    element.removeEventListener("pointerdown", kept);
    element.removeEventListener("mousedown", kept);
  };
};
</script>

<div class="combobox" {onfocusout}>
  <input
    {@attach held}
    id="{id}-input"
    type="text"
    role="combobox"
    autocomplete="off"
    aria-autocomplete="list"
    aria-expanded={expanded}
    aria-controls="{id}-listbox"
    aria-activedescendant={expanded && current !== null ? `${id}-option-${current}` : undefined}
    aria-label={labelledby === undefined ? label : undefined}
    aria-labelledby={labelledby}
    aria-describedby={describedby}
    {disabled}
    {placeholder}
    bind:value={() => text, write}
    {onkeydown}
    onpaste={pasted}
  />
  <!-- The options are picked by pointer here and by keys in the field, which keeps the focus. -->
  <div class="popup" hidden={!expanded} {@attach keepFocus}>
    <ul
      id="{id}-listbox"
      role="listbox"
      aria-label={labelledby === undefined ? label : undefined}
      aria-labelledby={labelledby}
      aria-busy={loading}
      hidden={!expanded}
    >
      {#each options as item, index (keyOf(item))}
        <li
          {@attach visible(index)}
          id="{id}-option-{index}"
          role="option"
          aria-selected={index === current}
          class={{ active: index === current }}
          onpointerup={(event) => {
            if (event.button === 0) pick(item);
          }}
        >
          {@render option(item, index === current)}
        </li>
      {/each}
    </ul>
    {#if emptyShown && empty !== undefined}
      <div class="empty">{@render empty(text)}</div>
    {/if}
  </div>
  <div class="visually-hidden" role="status">{status}</div>
</div>

<style>
  .combobox {
    position: relative;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    padding: 0.25rem 0.4rem;
    border: 1px solid #bdbdbd;
    border-radius: 4px;
    font: inherit;
    color: inherit;
    background: #fff;
  }

  input:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  /* Below the field, over what follows it; no portal, so it stays inside the drawer. */
  .popup {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    z-index: 1;
    max-height: 16rem;
    overflow-y: auto;
    border: 1px solid #bdbdbd;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }

  .popup[hidden],
  ul[hidden] {
    display: none;
  }

  ul {
    margin: 0;
    padding: 0.2rem 0;
    list-style: none;
  }

  li {
    padding: 0.25rem 0.5rem;
    cursor: pointer;
  }

  li:hover {
    background: #f0f0f0;
  }

  li.active {
    background: #dbeafe;
    outline: 1px solid #0a84ff;
    outline-offset: -1px;
  }

  .empty {
    padding: 0.35rem 0.5rem;
    color: #616161;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
