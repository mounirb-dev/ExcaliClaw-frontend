import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { getFilesDelta } from "./shared";
import { useEditorSceneLoader } from "./useEditorSceneLoader";

vi.mock("../../api", () => ({
  getDrawing: vi.fn(),
  getLibrary: vi.fn().mockResolvedValue([]),
  isAxiosError: vi.fn(() => false),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
const recoverDraft = vi.fn(async (..._args: unknown[]) => null as unknown);
const findStaleDraft = vi.fn(async (..._args: unknown[]) => null as unknown);
vi.mock("../../utils/draftRecovery", () => ({
  recoverDraft: (...a: unknown[]) => recoverDraft(...a),
  findStaleDraft: (...a: unknown[]) => findStaleDraft(...a),
}));
const clearDraft = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("../../utils/draftStore", () => ({ clearDraft: (...a: unknown[]) => clearDraft(...a) }));

const makeRefs = () => ({
  elementVersionMap: { current: new Map<string, unknown>() },
  saveQueue: { current: Promise.resolve() },
  latestElements: { current: [] as readonly unknown[] },
  initialSceneElements: { current: [] as readonly unknown[] },
  latestFiles: { current: {} as Record<string, unknown> },
  isSyncing: { current: false },
  lastSyncedFiles: { current: {} as Record<string, unknown> },
  lastSyncedElementOrderSig: { current: "" },
  lastPersistedFiles: { current: {} as Record<string, unknown> },
  currentDrawingVersion: { current: null as number | null },
  lastPersistedElements: { current: [] as readonly unknown[] },
  lastPersistedSceneSignature: { current: null as string | null },
  suspiciousBlankLoad: { current: false },
  hasSceneChangesSinceLoad: { current: false },
  excalidrawAPI: { current: null as unknown },
  latestAppState: { current: null as unknown },
  isBootstrappingScene: { current: true },
  hasHydratedInitialScene: { current: false },
});

const makeParams = (over: Record<string, unknown> = {}) => ({
  id: "drawing-A",
  user: { id: "u1" },
  location: { pathname: "/editor/drawing-A", search: "", hash: "" },
  navigate: vi.fn(),
  refs: makeRefs(),
  setAccessLevel: vi.fn(),
  setLiveCollaboration: vi.fn(),
  setDrawingName: vi.fn(),
  setInitialData: vi.fn(),
  setIsReady: vi.fn(),
  setIsSceneLoading: vi.fn(),
  setLoadError: vi.fn(),
  recordElementVersion: vi.fn(),
  computeElementOrderSig: (elements: readonly { id?: string }[]) => elements.map((e) => e.id).join(","),
  normalizeImageElementStatus: (els?: readonly unknown[]) => els ?? [],
  ...over,
});

describe("useEditorSceneLoader", () => {
  const getDrawing = vi.mocked(api.getDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not write a stale load into refs after unmount (race guard)", async () => {
    let resolveDrawing: (value: unknown) => void = vi.fn();
    getDrawing.mockReturnValue(
      new Promise((resolve) => {
        resolveDrawing = resolve;
      }) as unknown,
    );

    const params = makeParams();
    const { unmount } = renderHook(() => useEditorSceneLoader(params));

    // Navegar fuera antes de que la carga lenta se resuelva.
    unmount();

    // La respuesta obsoleta para drawing-A llega tarde.
    resolveDrawing({
      name: "A",
      elements: [{ id: "leak", type: "rectangle", version: 1 }],
      files: { leaked: { id: "leaked", dataURL: "data:,x" } },
      appState: {},
      version: 3,
      accessLevel: "owner",
    });
    await Promise.resolve();
    await Promise.resolve();

    // Nada de la carga obsoleta se filtró en los refs de persistencia.
    expect(params.refs.latestElements.current).toEqual([]);
    expect(params.refs.latestFiles.current).toEqual({});
    expect(params.refs.currentDrawingVersion.current).toBeNull();
    expect(params.setInitialData).not.toHaveBeenCalledWith(
      expect.objectContaining({ elements: expect.anything() }),
    );
  });

  it("fija la firma base del autoguardado al cargar (el primer guardado sin cambios no debe subir nada)", async () => {
    getDrawing.mockResolvedValue({
      name: "A",
      elements: [{ id: "e1", type: "rectangle", version: 4 }],
      files: {},
      appState: { viewBackgroundColor: "#ffffff", gridSize: null },
      version: 2,
      accessLevel: "owner",
    } as unknown);
    const params = makeParams();
    renderHook(() => useEditorSceneLoader(params));
    await waitFor(() => expect(params.refs.lastPersistedSceneSignature.current).not.toBeNull());
    expect(params.refs.lastPersistedSceneSignature.current).toContain("e1:4|");
    // Y el orden base: el primer onChange tras abrir no debe contar como cambio de orden.
    expect(params.refs.lastSyncedElementOrderSig.current).toBe("e1");
  });

  it("recupera un borrador local: muestra lo recuperado pero la base 'ya guardada' sigue siendo el servidor", async () => {
    getDrawing.mockResolvedValue({
      name: "A",
      elements: [{ id: "e1", type: "rectangle", version: 4 }],
      files: {},
      appState: {},
      version: 7,
      accessLevel: "owner",
    } as unknown);
    recoverDraft.mockResolvedValueOnce({
      drawingId: "drawing-A",
      baseVersion: 7,
      at: 1,
      elements: [{ id: "e1", type: "rectangle", version: 6 }, { id: "e2", type: "ellipse", version: 1 }],
      appState: {},
    });
    const scheduleRecoverySave = vi.fn();
    const params = makeParams({ scheduleRecoverySave });
    renderHook(() => useEditorSceneLoader(params as never));
    await waitFor(() => expect(scheduleRecoverySave).toHaveBeenCalledTimes(1));
    expect(params.refs.latestElements.current).toHaveLength(2);
    expect(params.refs.lastPersistedElements.current).toHaveLength(1); // base = servidor
    expect(params.refs.hasSceneChangesSinceLoad.current).toBe(true);
    expect(params.refs.lastPersistedSceneSignature.current).toContain("e1:4|");
    expect(scheduleRecoverySave.mock.calls[0][1]).toHaveLength(2);
  });

  it("un borrador de una versión anterior no se aplica solo: se ofrece restaurarlo", async () => {
    getDrawing.mockResolvedValue({
      name: "A",
      elements: [{ id: "e1", type: "rectangle", version: 9 }],
      files: {},
      appState: {},
      version: 12,
      accessLevel: "owner",
    } as unknown);
    findStaleDraft.mockResolvedValueOnce({
      drawingId: "drawing-A",
      baseVersion: 7,
      at: 1,
      elements: [{ id: "e1", type: "rectangle", version: 6 }, { id: "e2", type: "ellipse", version: 1 }],
      appState: {},
    });
    const { toast } = await import("sonner");
    const scheduleRecoverySave = vi.fn();
    const params = makeParams({ scheduleRecoverySave });
    const updateScene = vi.fn();
    renderHook(() => useEditorSceneLoader(params as never));
    await waitFor(() => expect(vi.mocked(toast.warning)).toHaveBeenCalled());
    // Lo mostrado y la base son lo del servidor: nada se aplicó solo.
    expect(params.refs.latestElements.current).toHaveLength(1);
    expect(scheduleRecoverySave).not.toHaveBeenCalled();
    const options = vi.mocked(toast.warning).mock.calls[0][1] as { action: { onClick: () => void } };
    params.refs.excalidrawAPI.current = { updateScene }; // el editor ya está montado cuando el usuario decide
    options.action.onClick(); // el usuario elige restaurar
    expect(updateScene).toHaveBeenCalledTimes(1);
    expect(scheduleRecoverySave).toHaveBeenCalledTimes(1);
    expect(params.refs.hasSceneChangesSinceLoad.current).toBe(true);
  });

  it("sin borrador no programa ningún guardado", async () => {
    getDrawing.mockResolvedValue({ name: "A", elements: [], files: {}, appState: {}, version: 1, accessLevel: "owner" } as unknown);
    const scheduleRecoverySave = vi.fn();
    const params = makeParams({ scheduleRecoverySave });
    renderHook(() => useEditorSceneLoader(params as never));
    await waitFor(() => expect(params.setInitialData).toHaveBeenCalled());
    expect(scheduleRecoverySave).not.toHaveBeenCalled();
    expect(params.refs.hasSceneChangesSinceLoad.current).toBe(false);
  });

  it("does not reload when the user object identity changes but the id is stable", async () => {
    getDrawing.mockResolvedValue({
      name: "A",
      elements: [],
      files: {},
      appState: {},
      version: 1,
      accessLevel: "owner",
    } as unknown);

    // Mantener cada parámetro estable entre renders (como en producción,
    // donde vienen de useState/useCallback) y variar solo la identidad del
    // objeto usuario.
    const stable = makeParams();
    const { rerender } = renderHook(
      (props: { user: unknown }) =>
        useEditorSceneLoader({ ...stable, user: props.user }),
      { initialProps: { user: { id: "u1" } as unknown } },
    );

    await waitFor(() => expect(getDrawing).toHaveBeenCalledTimes(1));

    // Objeto nuevo, mismo id de usuario — no debe disparar una segunda carga.
    rerender({ user: { id: "u1" } });
    await Promise.resolve();
    expect(getDrawing).toHaveBeenCalledTimes(1);
  });

  describe("progressive file streaming", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const okPng = () => ({
      ok: true,
      blob: async () =>
        new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    });

    const drawingWithRef = () => ({
      name: "A",
      elements: [
        { id: "img", type: "image", fileId: "f1", version: 1, status: "saved" },
      ],
      files: { f1: { id: "f1", dataURL: "/api/files/dA/f1", mimeType: "image/png" } },
      appState: {},
      version: 2,
      accessLevel: "owner",
    });

    it("paints the scene without waiting for file fetches, then streams the file in via addFiles", async () => {
      let resolveFetch: (value: unknown) => void = vi.fn();
      fetchMock.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      );
      getDrawing.mockResolvedValue(drawingWithRef() as unknown as Awaited<ReturnType<typeof getDrawing>>);

      const params = makeParams();
      const addFiles = vi.fn();
      renderHook(() => useEditorSceneLoader(params));
      // La API de Excalidraw se registra después de que el loader resetea los refs.
      params.refs.excalidrawAPI.current = { addFiles };

      // El primer pintado ocurre con los archivos de solo referencia, antes de que el fetch se resuelva.
      await waitFor(() =>
        expect(params.setInitialData).toHaveBeenCalledWith(
          expect.objectContaining({
            files: expect.objectContaining({
              f1: expect.objectContaining({ dataURL: "/api/files/dA/f1" }),
            }),
          }),
        ),
      );
      expect(params.setIsSceneLoading).toHaveBeenCalledWith(false);
      expect(addFiles).not.toHaveBeenCalled();

      // El archivo llega tarde y se envía al canvas como una dataURL en línea.
      resolveFetch(okPng());
      await waitFor(() => expect(addFiles).toHaveBeenCalledTimes(1));
      const pushed = addFiles.mock.calls[0][0];
      expect(pushed[0].id).toBe("f1");
      expect(pushed[0].dataURL.startsWith("data:image/png;base64,")).toBe(true);

      // Los bytes hidratados no deben leerse como un archivo modificado que se vuelve a guardar.
      expect(params.refs.latestFiles.current.f1.dataURL).toBe(
        params.refs.lastPersistedFiles.current.f1.dataURL,
      );
      expect(
        Object.keys(
          getFilesDelta(
            params.refs.lastPersistedFiles.current,
            params.refs.latestFiles.current,
          ),
        ),
      ).toEqual([]);
    });

    it("aborts file callbacks when the load is cancelled mid-flight", async () => {
      let resolveFetch: (value: unknown) => void = vi.fn();
      fetchMock.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      );
      getDrawing.mockResolvedValue(drawingWithRef() as unknown as Awaited<ReturnType<typeof getDrawing>>);

      const params = makeParams();
      const addFiles = vi.fn();
      const { unmount } = renderHook(() => useEditorSceneLoader(params));
      params.refs.excalidrawAPI.current = { addFiles };

      await waitFor(() =>
        expect(params.setInitialData).toHaveBeenCalledWith(
          expect.objectContaining({ files: expect.anything() }),
        ),
      );

      // Navegar fuera, y luego dejar que el fetch en vuelo se resuelva.
      unmount();
      resolveFetch(okPng());
      await Promise.resolve();
      await Promise.resolve();

      // El archivo obsoleto no debe enviarse al canvas (ahora desmontado), y
      // latestFiles conserva la referencia intacta.
      expect(addFiles).not.toHaveBeenCalled();
      expect(params.refs.latestFiles.current.f1.dataURL).toBe(
        "/api/files/dA/f1",
      );
    });
  });
});
