// @vitest-environment node
/// <reference types="node" />
import { EventEmitter } from "node:events";
import { OutgoingMessage } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import configOf from "../vite.config.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The `/api` proxy options of the development configuration, with `TILIE_PORT` at 8123. */
function apiProxy() {
  vi.stubEnv("TILIE_PORT", "8123");
  const proxy = configOf({ command: "serve", mode: "development" }).server?.proxy ?? {};
  expect(Object.keys(proxy)).toEqual(["/api"]);
  const api = proxy["/api"];
  if (typeof api !== "object") throw new Error("/api has no proxy options");
  return api;
}

/**
 * The headers a request leaves with, carrying `origin` (if any), after the
 * `/api` proxy's own `configure` hook has handled its `proxyReq` event for a
 * page the browser addressed as `localhost:5173`.
 */
function forwarded(origin?: string) {
  const api = apiProxy();
  if (api.configure === undefined) throw new Error("/api has no configure hook");
  const proxy = new EventEmitter();
  api.configure(proxy as unknown as Parameters<typeof api.configure>[0], api);
  const request = new OutgoingMessage();
  if (origin !== undefined) request.setHeader("Origin", origin);
  request.setHeader("Authorization", "Bearer abc");
  proxy.emit("proxyReq", request, { headers: { host: "localhost:5173" } });
  return request.getHeaders();
}

describe("the development proxy", () => {
  it("proxies /api to the server on TILIE_PORT", () => {
    expect(apiProxy().target).toBe("http://127.0.0.1:8123");
  });

  it("presents the target's origin in place of the development page's own", () => {
    expect(forwarded("http://localhost:5173")).toEqual({
      origin: "http://127.0.0.1:8123",
      authorization: "Bearer abc",
    });
  });

  it("passes a foreign origin unchanged, for the server to refuse", () => {
    expect(forwarded("https://example.org")).toEqual({
      origin: "https://example.org",
      authorization: "Bearer abc",
    });
  });

  it("leaves a request without an origin without one", () => {
    expect(forwarded()).toEqual({ authorization: "Bearer abc" });
  });
});
