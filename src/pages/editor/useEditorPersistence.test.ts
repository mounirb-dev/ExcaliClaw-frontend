import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useEditorPersistence } from "./useEditorPersistence";

vi.mock("@excalidraw/excalidraw", () => ({ exportToSvg: vi.fn() }));
vi.mock("../../api", () => ({
  updateDrawing: vi.fn(),
  getDrawing: vi.fn(),
  isAxiosError: vi.fn(() => false),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("../../utils/imageCompression", () => ({
  compressExcalidrawFiles: vi.fn(async (files: unknown) => ({
    changed: false,
    files,
  })),
}));

const makeRefs = () => ({
  currentDrawingVersion: { current: 1 as number | null },
  debouncedSave: { current: null as unknown },
  excalidrawAPI: { current: null as unknown },
  isSaver: { current: true },
  isSyncing: { current: false },
  isUnmounting: { current: false },
  lastLocalChangeAt: { current: 0 },
  lastPersistedElements: { current: [] as readonly unknown[] },
  lastPersistedSceneSignature: { current: null as string | null },
  lastPersistedFiles: { current: {} as Record<string, unknown> },
  lastSyncedFiles: { current: {} as Record<string, unknown> },
  latestAppState: { current: {} as Record<string, unknown> },
  latestElements: { current: [] as readonly unknown[] },
  latestFiles: { current: {} as Record<string, unknown> },
  saveQueue: { current: Promise.resolve() },
  suspiciousBlankLoad: { current: false },
  uploadedRefs: { current: {} as Record<string, string> },
});

const params = (refs: ReturnType<typeof makeRefs>) => ({
  refs,
  user: { id: "u1" },
  normalizeImageElementStatus: (els?: readonly unknown[]) => els ?? [],
  resolveSafeSnapshot: (s?: readonly unknown[]) => ({
    snapshot: s ?? [],
    prevented: false,
    staleEmptySnapshot: false,
    staleNonRenderableSnapshot: false,
  }),
});

const els = [{ id: "a", type: "rectangle", version: 1 }];

describe("useEditorPersistence autosave indicator", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("raises autosaveFailing after repeated autosave failures and clears on success", async () => {
    updateDrawing.mockRejectedValue(new Error("network"));
    const refs = makeRefs();
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, {});
      await result.current.enqueueSceneSave("d1", els, {}, {});
    });

    await waitFor(() => expect(result.current.autosaveFailing).toBe(true));

    // Un guardado exitoso posterior limpia el indicador.
    updateDrawing.mockResolvedValue({ version: 2 } as unknown as Awaited<ReturnType<typeof updateDrawing>>);
    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, {});
    });
    await waitFor(() => expect(result.current.autosaveFailing).toBe(false));
  });
});

describe("useEditorPersistence file ref substitution", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
    updateDrawing.mockResolvedValue({ version: 2 } as unknown as Awaited<ReturnType<typeof updateDrawing>>);
  });

  const inlineFiles = (id: string) => ({
    [id]: {
      id,
      mimeType: "image/webp",
      created: 1,
      dataURL: "data:image/webp;base64,QUJD",
    },
  });

  const bodyOf = () => updateDrawing.mock.calls[0][1] as unknown as Record<string, unknown>;

  it("ships an uploaded file as a ref and drops the base64 bytes", async () => {
    const refs = makeRefs();
    refs.uploadedRefs.current = { a: "/api/files/d1/a" };
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, inlineFiles("a"), {
        suppressErrors: false,
      });
    });

    expect(updateDrawing).toHaveBeenCalledTimes(1);
    expect(bodyOf().files.a.dataURL).toBe("/api/files/d1/a");
    expect(bodyOf().files.a.dataURL.startsWith("data:")).toBe(false);
    // lastPersistedFiles registra la entrada con forma de referencia que realmente se envió.
    expect(refs.lastPersistedFiles.current.a.dataURL).toBe("/api/files/d1/a");
  });

  it("keeps inline bytes for a file that has not been uploaded", async () => {
    const refs = makeRefs(); // uploadedRefs vacío
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, inlineFiles("a"), {
        suppressErrors: false,
      });
    });

    expect(bodyOf().files.a.dataURL.startsWith("data:")).toBe(true);
  });

  it("falls back to inline when uploads are unsupported (old server)", async () => {
    // Cuando el endpoint de subida por archivo da 404, el hook de subida
    // nunca registra una referencia, así que uploadedRefs se queda vacío y
    // el PUT de escena conserva los bytes en línea exactamente como el
    // comportamiento actual — el servidor los interna.
    const refs = makeRefs();
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, inlineFiles("a"), {
        suppressErrors: false,
      });
    });

    expect(bodyOf().files.a.dataURL.startsWith("data:")).toBe(true);
  });
});

describe("useEditorPersistence unmount flush", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
    updateDrawing.mockResolvedValue({ version: 2 } as unknown as Awaited<ReturnType<typeof updateDrawing>>);
  });

  it("flushes a pending debounced save on unmount instead of cancelling it", async () => {
    const refs = makeRefs();
    const { result, unmount } = renderHook(() =>
      useEditorPersistence(params(refs)),
    );

    // Encolar un guardado con debounce; sin un vaciado al desmontar se perdería.
    act(() => {
      result.current.debouncedSave("d1", els, {}, {});
    });
    expect(updateDrawing).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(updateDrawing).toHaveBeenCalledTimes(1));
  });
});
