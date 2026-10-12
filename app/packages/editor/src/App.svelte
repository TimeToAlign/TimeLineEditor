<script lang="ts">
import type { ResizeMode, Selection } from "@timetoalign/tilie-arranger";
import { name as arranger, Canvas } from "@timetoalign/tilie-arranger";
import { name as client } from "@timetoalign/tilie-client";
import type { Store } from "@timetoalign/tilie-core";
import {
  name as core,
  createStore,
  createView,
  isLoadError,
  readWorkspace,
} from "@timetoalign/tilie-core";
import { name as layout } from "@timetoalign/tilie-layout";
import { name as writers } from "@timetoalign/tilie-writers";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { onMount } from "svelte";
import { FIXTURES } from "./fixtures.ts";
import type { TestHook, ViewportValue } from "./testHook.ts";
import { installTestHook, TEST_HOOK, WorkspaceRefusedError } from "./testHook.ts";

/** The body of `GET /api/health`. */
type Health = { name: string; version: string; timetoalign: string };

const packages = [core, layout, writers, arranger, client];

let status = $state("connecting to the server");

/** The open workspace. */
let store: Store = $state.raw(createStore({ view: createView(), journal: [] }));

// The viewer's own state: never written to the workspace.
let selection: Selection = $state.raw(new Set());
let locked = $state(false);
let mode: ResizeMode = $state("scale");
let viewport: ViewportValue = $state.raw({ x: 0, y: 0, zoom: 1 });

let canvas: ReturnType<typeof Canvas> | undefined = $state();

/** Open the workspace file `text` in a new store; throws when the file is refused. */
function openWorkspace(text: string): void {
  const workspace = readWorkspace(text);
  if (isLoadError(workspace)) throw new WorkspaceRefusedError(workspace.problems);
  selection = new Set();
  store = createStore(workspace);
}

let fixture = $state(FIXTURES[0]?.name ?? "");
let fixtureProblem = $state("");

/** Open the fixture chosen in the header's menu. */
async function loadFixture(): Promise<void> {
  const chosen = FIXTURES.find(({ name }) => name === fixture);
  if (chosen === undefined) return;
  try {
    openWorkspace(await chosen.text());
    fixtureProblem = "";
  } catch (error) {
    fixtureProblem = error instanceof Error ? error.message : String(error);
  }
}

if (TEST_HOOK) {
  /** What the end-to-end tests drive the editor through (`window.__tilie`). */
  const hook: TestHook = {
    load: openWorkspace,
    store: () => store,
    selection: () => [...selection],
    select(addresses) {
      selection = new Set(addresses);
    },
    viewport: () => ({ x: viewport.x, y: viewport.y, zoom: viewport.zoom }),
    setViewport(next) {
      canvas?.setViewport(next);
    },
    locked: () => locked,
    mode: () => mode,
  };
  $effect(() => installTestHook(hook));
}

/**
 * Take the run's token from the fragment `tilie` opens the editor with
 * (`/#token=…`) and remove it from the address bar and the history entry.
 * The fragment never reaches the server, so the token stays out of its logs.
 */
function takeToken(): string {
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  if (token === null) {
    return "";
  }
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  return token;
}

onMount(async () => {
  const token = takeToken();
  try {
    const response = await fetch("/api/health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      status = `HTTP ${response.status} ${response.statusText}`;
      return;
    }
    const health = (await response.json()) as Health;
    status = `${health.name} ${health.version} (timetoalign ${health.timetoalign})`;
  } catch (error) {
    status = `server unreachable: ${error instanceof Error ? error.message : String(error)}`;
  }
});
</script>

<header>
  <h1>TimeLineEditor</h1>
  <p class="status" aria-live="polite">{status}</p>
  {#if TEST_HOOK && FIXTURES.length > 0}
    <div class="fixtures">
      <label>
        Fixture
        <select data-testid="fixture-select" bind:value={fixture}>
          {#each FIXTURES as item (item.name)}
            <option value={item.name}>{item.name}</option>
          {/each}
        </select>
      </label>
      <button type="button" data-testid="fixture-load" onclick={loadFixture}>Load</button>
      <span class="problem" role="status">{fixtureProblem}</span>
    </div>
  {/if}
</header>

<main>
  <section class="pane arranger">
    <h2>Arranger</h2>
    <div class="canvas">
      <Canvas
        bind:this={canvas}
        {store}
        metrics={fontMetrics}
        bind:selection
        bind:locked
        bind:mode
        bind:viewport
      />
    </div>
  </section>
  <section class="pane inspector">
    <h2>Inspector</h2>
  </section>
  <section class="pane diagnostics">
    <h2>Diagnostics</h2>
  </section>
</main>

<footer>packages: {packages.join(", ")}</footer>

<style>
  :global(html, body, #app) {
    margin: 0;
    height: 100%;
  }

  :global(#app) {
    display: grid;
    grid-template-rows: auto 1fr auto;
    font-family: system-ui, sans-serif;
    color: #1a1a1a;
    background: #fafafa;
  }

  header,
  footer {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #d0d0d0;
  }

  footer {
    border-bottom: none;
    border-top: 1px solid #d0d0d0;
    font-size: 0.8rem;
    color: #555;
  }

  .fixtures {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-left: auto;
    font-size: 0.9rem;
  }

  h1 {
    margin: 0;
    font-size: 1.1rem;
  }

  .status {
    margin: 0;
    font-size: 0.9rem;
    color: #555;
  }

  main {
    display: grid;
    grid-template-columns: 3fr 1fr;
    grid-template-rows: 1fr 10rem;
    grid-template-areas:
      "arranger inspector"
      "diagnostics diagnostics";
    gap: 1px;
    background: #d0d0d0;
    min-height: 0;
  }

  .pane {
    background: #fff;
    padding: 0.5rem 1rem;
    overflow: auto;
  }

  .pane h2 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #666;
  }

  .arranger {
    grid-area: arranger;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .canvas {
    flex: 1;
    min-height: 0;
    margin: 0.5rem -1rem -0.5rem;
  }

  .inspector {
    grid-area: inspector;
  }

  .diagnostics {
    grid-area: diagnostics;
  }
</style>
