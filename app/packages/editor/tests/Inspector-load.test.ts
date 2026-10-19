/** A failed import of a codec is shown in the panel; derived in `README.md` ("The manifest as text"). */

import { liveStore } from "@timetoalign/tilie-arranger";
import { flushSync, mount, tick, unmount } from "svelte";
import { expect, it, vi } from "vitest";
import { loadCodec } from "../src/inspector/formats.svelte.ts";
import Inspector from "../src/inspector/Inspector.svelte";
import { blockId, storeOf } from "./support.ts";

vi.mock("../src/inspector/toml.ts", () => {
  throw new Error("network down");
});

it("shows a failed codec import as an alert and keeps JSON working", async () => {
  const store = storeOf("bare");
  const id = blockId(0);
  const app = mount(Inspector, {
    target: document.body,
    props: { live: liveStore(store), selection: new Set([id]) },
  });
  flushSync();
  const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
  tabs.find((tab) => tab.textContent === "Manifest")?.click();
  flushSync();
  (document.querySelector('input[value="toml"]') as HTMLInputElement).click();
  flushSync();
  const failure = await loadCodec("toml").then(
    () => null,
    (reason: unknown) => (reason as Error).message,
  );
  expect(failure).not.toBe(null);
  await tick();
  flushSync();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    `TOML could not be loaded (${failure}).`,
  );
  expect(document.querySelector("textarea")).toBe(null);
  (document.querySelector('input[value="json"]') as HTMLInputElement).click();
  flushSync();
  expect(document.querySelector('[role="alert"]')).toBe(null);
  expect(document.querySelector("textarea")?.value.startsWith("{\n")).toBe(true);
  unmount(app);
  document.body.innerHTML = "";
});
