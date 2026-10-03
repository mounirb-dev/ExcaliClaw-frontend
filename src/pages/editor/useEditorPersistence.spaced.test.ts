import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useEditorPersistence } from "./useEditorPersistence";

vi.mock("@excalidraw/excalidraw", () => ({ exportToSvg: vi.fn() }));
vi.mock("../../api", () => ({
  updateDrawing: vi.fn(),
  getDrawing: vi.fn(),
  isAxiosError: vi.fn(() => false),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("../../utils/imageCompression", () => ({
  compressExcalidrawFiles: vi.fn(async (files: unknown) => ({ changed: false, files })),
}));
const saveDraft = vi.fn(async (_draft: unknown) => undefined);
const clearDraft = vi.fn(async (_id: string, _at: number) => undefined);
vi.mock("../../utils/draftStore", () => ({
  saveDraft: (d: unknown) => saveDraft(d),
  clearDraft: (id: string, at: number) => clearDraft(id, at),
}));

const makeRefs = () => ({
  currentDrawingVersion: { current: 3 as number | null },
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

const scene = (v: number) => [{ id: "a", type: "rectangle", version: v, isDeleted: false }];

describe("guardado espaciado + borrador local", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    updateDrawing.mockResolvedValue({ version: 4 } as unknown as Awaited<ReturnType<typeof updateDrawing>>);
  });
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const refs = makeRefs();
    const { result, unmount } = renderHook(() => useEditorPersistence(params(refs) as never));
    return { refs, result, unmount };
  };

  it("el borrador local se escribe casi al instante y el servidor no se toca todavía", async () => {
    const { result } = setup();
    act(() => result.current.debouncedSave("d1", scene(2) as never, {}, {}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft.mock.calls[0][0]).toMatchObject({ drawingId: "d1", baseVersion: 3 });
    expect(updateDrawing).not.toHaveBeenCalled();
  });

  it("el servidor recibe UNA instantánea a los 15 s de dejar de editar, y el borrador se borra", async () => {
    const { result } = setup();
    act(() => result.current.debouncedSave("d1", scene(2) as never, {}, {}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_000);
    });
    expect(updateDrawing).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(updateDrawing).toHaveBeenCalledTimes(1);
    expect(clearDraft).toHaveBeenCalledWith("d1", expect.any(Number));
  });

  it("editando sin parar se guarda como mucho cada 30 s (no se acumula sin límite)", async () => {
    const { result } = setup();
    for (let i = 0; i < 40; i++) {
      act(() => result.current.debouncedSave("d1", scene(i + 2) as never, {}, {}));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000); // un cambio por segundo durante 40 s
      });
    }
    expect(updateDrawing.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(updateDrawing.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("al ocultar la pestaña se sube ya lo pendiente", async () => {
    const { result } = setup();
    act(() => result.current.debouncedSave("d1", scene(2) as never, {}, {}));
    expect(updateDrawing).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(updateDrawing).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("no escribe borrador de una carga en blanco sospechosa", async () => {
    const { refs, result } = setup();
    refs.suspiciousBlankLoad.current = true;
    act(() => result.current.debouncedSave("d1", [] as never, {}, {}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("un editor que NO es el guardador de la sala guarda mucho más espaciado (60 s), no a los 15 s", async () => {
    const { refs, result } = setup();
    refs.isSaver.current = false;
    act(() => result.current.debouncedSave("d1", scene(2) as never, {}, {}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(updateDrawing).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(updateDrawing).toHaveBeenCalledTimes(1);
  });

  it("el borrador local se escribe igual sea o no el guardador", async () => {
    const { refs, result } = setup();
    refs.isSaver.current = false;
    act(() => result.current.debouncedSave("d1", scene(2) as never, {}, {}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });
});
