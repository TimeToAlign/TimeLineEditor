import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";

const health = { name: "tilie-server", version: "0.1.0", timetoalign: "1.2.0" };

/** The page's path, query and fragment, as the address bar shows them. */
function address(): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

/** Stub `fetch`; each call also records the address at the time of the call. */
function stubFetch(response: Response) {
  const addresses: string[] = [];
  const fetchStub = vi.fn(async (_input: string, _init: RequestInit) => {
    addresses.push(address());
    return response;
  });
  vi.stubGlobal("fetch", fetchStub);
  return { fetchStub, addresses };
}

function text(selector: string): string[] {
  return Array.from(document.querySelectorAll(selector), (element) => element.textContent ?? "");
}

describe("App", () => {
  let app: ReturnType<typeof mount>;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    unmount(app);
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("renders the title, the three panes and the five linked packages", () => {
    stubFetch(Response.json(health));
    app = mount(App, { target: document.body });
    flushSync();

    expect(text("header h1")).toEqual(["TimeLineEditor"]);
    expect(text("main h2")).toEqual(["Arranger", "Inspector", "Diagnostics"]);
    expect(text("footer")).toEqual([
      "packages: @timetoalign/tilie-core, @timetoalign/tilie-layout, @timetoalign/tilie-writers, @timetoalign/tilie-arranger, @timetoalign/tilie-client",
    ]);
  });

  it("takes the token from the fragment, clears it and shows the health", async () => {
    window.history.replaceState({}, "", "/?view=a#token=abc");
    const entries = history.length;
    const { fetchStub, addresses } = stubFetch(Response.json(health));
    app = mount(App, { target: document.body });

    await vi.waitFor(() => {
      expect(text(".status")).toEqual(["tilie-server 0.1.0 (timetoalign 1.2.0)"]);
    });
    expect(fetchStub.mock.calls).toEqual([
      ["/api/health", { headers: { Authorization: "Bearer abc" } }],
    ]);
    expect(addresses).toEqual(["/?view=a"]);
    expect(location.hash).toBe("");
    expect(history.length).toBe(entries);
  });

  it("sends no token and leaves the URL alone without a fragment token", async () => {
    window.history.replaceState({}, "", "/?token=abc");
    const { fetchStub, addresses } = stubFetch(Response.json(health));
    app = mount(App, { target: document.body });

    await vi.waitFor(() => {
      expect(fetchStub.mock.calls).toEqual([
        ["/api/health", { headers: { Authorization: "Bearer " } }],
      ]);
    });
    expect(addresses).toEqual(["/?token=abc"]);
    expect(address()).toBe("/?token=abc");
  });

  it("shows the HTTP error when the health request is rejected", async () => {
    stubFetch(new Response(null, { status: 401, statusText: "Unauthorized" }));
    app = mount(App, { target: document.body });

    await vi.waitFor(() => {
      expect(text(".status")).toEqual(["HTTP 401 Unauthorized"]);
    });
  });
});
