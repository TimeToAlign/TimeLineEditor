import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";

const health = { name: "tilie-server", version: "0.1.0", timetoalign: "1.2.0" };

function stubFetch(response: Response) {
  const fetchStub = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function text(selector: string): string[] {
  return Array.from(document.querySelectorAll(selector), (element) => element.textContent ?? "");
}

describe("App", () => {
  let app: ReturnType<typeof mount>;

  beforeEach(() => {
    window.history.replaceState({}, "", "/?token=abc");
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

  it("requests the health with the token from the URL and shows it", async () => {
    const fetchStub = stubFetch(Response.json(health));
    app = mount(App, { target: document.body });

    await vi.waitFor(() => {
      expect(text(".status")).toEqual(["tilie-server 0.1.0 (timetoalign 1.2.0)"]);
    });
    expect(fetchStub.mock.calls).toEqual([
      ["/api/health", { headers: { Authorization: "Bearer abc" } }],
    ]);
  });

  it("shows the HTTP error when the health request is rejected", async () => {
    stubFetch(new Response(null, { status: 401, statusText: "Unauthorized" }));
    app = mount(App, { target: document.body });

    await vi.waitFor(() => {
      expect(text(".status")).toEqual(["HTTP 401 Unauthorized"]);
    });
  });
});
