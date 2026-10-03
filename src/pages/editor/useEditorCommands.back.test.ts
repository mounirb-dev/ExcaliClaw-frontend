import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorCommands } from "./useEditorCommands";

const navigate = vi.fn();

vi.mock("../../api", () => ({ updateDrawing: vi.fn(), isAxiosError: vi.fn(() => false) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("../../utils/exportUtils", () => ({ exportFromEditor: vi.fn() }));
vi.mock("./keepaliveSave", () => ({ saveDrawingKeepalive: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const rect = { id: "e1", type: "rectangle", version: 2, isDeleted: false };

const makeParams = (savePreview: () => Promise<void>, enqueueSceneSave: () => Promise<void>) => ({
  autoHideEnabled: false,
  canEdit: true,
  debouncedSaveLibrary: vi.fn(),
  drawingId: "d1",
  drawingName: "Mi dibujo",
  enqueueSceneSave,
  isSavingOnLeave: false,
  newName: "",
  refs: {
    currentDrawingVersion: { current: 1 as number | null },
    excalidrawAPI: {
      current: {
        getSceneElementsIncludingDeleted: () => [rect],
        getAppState: () => ({}),
        getFiles: () => ({}),
      } as unknown,
    },
    hasSceneChangesSinceLoad: { current: true },
    latestFiles: { current: {} as Record<string, unknown> },
    saveData: { current: vi.fn() as unknown },
    savePreview: { current: savePreview as unknown },
    suspiciousBlankLoad: { current: false },
    uploadedRefs: { current: {} as Record<string, string> },
  },
  resolveSafeSnapshot: (s?: readonly unknown[]) => ({
    snapshot: s ?? [],
    prevented: false,
    staleEmptySnapshot: false,
    staleNonRenderableSnapshot: false,
  }),
  setAutoHideEnabled: vi.fn(),
  setDrawingName: vi.fn(),
  setIsHeaderVisible: vi.fn(),
  setIsRenaming: vi.fn(),
  setIsSavingOnLeave: vi.fn(),
  setNewName: vi.fn(),
  user: { id: "u1" },
});

describe("useEditorCommands volver", () => {
  beforeEach(() => navigate.mockClear());

  it("sale en cuanto se guarda la escena, sin esperar a la miniatura", async () => {
    const savePreview = vi.fn(() => new Promise<void>(() => undefined)); // nunca termina
    const enqueueSceneSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEditorCommands(makeParams(savePreview, enqueueSceneSave) as never));

    await act(async () => {
      await result.current.handleBackClick();
    });

    expect(enqueueSceneSave).toHaveBeenCalledTimes(1);
    expect(savePreview).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/app");
  });

  it("no sale si el guardado de la escena falla", async () => {
    const enqueueSceneSave = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useEditorCommands(makeParams(vi.fn().mockResolvedValue(undefined), enqueueSceneSave) as never),
    );

    await act(async () => {
      await result.current.handleBackClick();
    });

    expect(navigate).not.toHaveBeenCalled();
  });
});
