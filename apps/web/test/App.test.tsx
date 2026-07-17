import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(() => {
  if (root) {
    const mountedRoot = root;
    act(() => {
      mountedRoot.unmount();
    });
    root = undefined;
  }

  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("App", () => {
  it("renders the shell and a successful API health state", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(fetchResponse);
    const container = document.createElement("div");
    document.body.append(container);

    act(() => {
      root = createRoot(container);
      root.render(<App />);
    });

    const completeFetch = resolveFetch;

    if (!completeFetch) {
      throw new Error("The fetch test fixture was not initialized.");
    }

    await act(async () => {
      completeFetch(
        new Response(JSON.stringify({ status: "ok", environment: "development" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      await fetchResponse;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(container.textContent).toContain("Local development shell");
    expect(container.textContent).toContain("API connected");
    expect(container.textContent).toContain("development");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});
