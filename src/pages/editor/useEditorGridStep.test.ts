import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { NEVER: "NEVER" },
}));

import { useEditorGridStep } from "./useEditorGridStep";

const makeApi = (currentGridStep: number | undefined) => ({
  updateScene: vi.fn(),
  getAppState: () => ({ gridStep: currentGridStep }),
});

describe("useEditorGridStep", () => {
  it("does nothing until the editor API is ready", () => {
    const api = makeApi(5);
    renderHook(() =>
      useEditorGridStep({
        excalidrawAPI: { current: api } as unknown,
        isReady: false,
        gridStep: 8,
      }),
    );
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it("pushes the preferred grid step into the scene once ready", () => {
    const api = makeApi(5);
    renderHook(() =>
      useEditorGridStep({
        excalidrawAPI: { current: api } as unknown,
        isReady: true,
        gridStep: 8,
      }),
    );
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { gridStep: 8 },
      captureUpdate: "NEVER",
    });
  });

  it("clamps out-of-range values before applying", () => {
    const api = makeApi(5);
    renderHook(() =>
      useEditorGridStep({
        excalidrawAPI: { current: api } as unknown,
        isReady: true,
        gridStep: 9999,
      }),
    );
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { gridStep: 100 },
      captureUpdate: "NEVER",
    });
  });

  it("skips the update when the scene already matches", () => {
    const api = makeApi(8);
    renderHook(() =>
      useEditorGridStep({
        excalidrawAPI: { current: api } as unknown,
        isReady: true,
        gridStep: 8,
      }),
    );
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it("re-applies when the preferred grid step changes", () => {
    const api = makeApi(5);
    const { rerender } = renderHook(
      ({ gridStep }) =>
        useEditorGridStep({
          excalidrawAPI: { current: api } as unknown,
          isReady: true,
          gridStep,
        }),
      { initialProps: { gridStep: 5 } },
    );
    // El valor inicial ya coincide con la escena, así que todavía no hay escritura.
    expect(api.updateScene).not.toHaveBeenCalled();
    rerender({ gridStep: 12 });
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { gridStep: 12 },
      captureUpdate: "NEVER",
    });
  });
});
