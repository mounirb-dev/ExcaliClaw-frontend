import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorCollaboration } from "./useEditorCollaboration";

const authRefresh = vi.fn();
vi.mock("../../api", () => ({ authRefresh: () => authRefresh() }));
vi.mock("../../utils/rehydrateFiles", () => ({
  filesNeedRehydration: () => false,
  rehydrateFilesFromUrls: async (f: unknown) => f,
}));
vi.mock("./canvasZoomForwarding", () => ({ attachCanvasZoomForwarding: () => () => undefined }));

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
}

const isSaverRef = { current: true };
const baseInput = (onAccessDenied: () => void) => ({
  drawingId: "d1",
  me: { id: "u1", name: "Yo", initials: "Y", color: "#000" },
  isReady: true,
  excalidrawAPI: { current: null },
  editorContainerRef: { current: null },
  lastSyncedFilesRef: { current: {} },
  lastSyncedElementOrderSigRef: { current: "" },
  latestElementsRef: { current: [] },
  latestFilesRef: { current: {} },
  computeElementOrderSig: () => "",
  recordElementVersion: vi.fn(),
  onAccessDenied,
  eagerConnect: true,
  isSaverRef,
});

describe("socket de colaboración con el JWT caducado", () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    authRefresh.mockReset();
    vi.stubGlobal("WebSocket", FakeSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("un cierre 1006 renueva la sesión y reintenta UNA vez antes de dar el acceso por denegado", async () => {
    authRefresh.mockResolvedValue(undefined);
    const onAccessDenied = vi.fn();
    renderHook(() => useEditorCollaboration(baseInput(onAccessDenied) as never));
    expect(FakeSocket.instances).toHaveLength(1);

    FakeSocket.instances[0].onclose?.({ code: 1006 });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
    expect(authRefresh).toHaveBeenCalledTimes(1);
    expect(onAccessDenied).not.toHaveBeenCalled();
  });

  it("si tras renovar vuelve a cerrarse con 1006, entonces sí es acceso denegado", async () => {
    authRefresh.mockResolvedValue(undefined);
    const onAccessDenied = vi.fn();
    renderHook(() => useEditorCollaboration(baseInput(onAccessDenied) as never));
    FakeSocket.instances[0].onclose?.({ code: 1006 });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
    FakeSocket.instances[1].onclose?.({ code: 1006 });
    expect(onAccessDenied).toHaveBeenCalledTimes(1);
    expect(authRefresh).toHaveBeenCalledTimes(1);
  });

  it("si no se puede renovar la sesión es acceso denegado", async () => {
    authRefresh.mockRejectedValue(new Error("401"));
    const onAccessDenied = vi.fn();
    renderHook(() => useEditorCollaboration(baseInput(onAccessDenied) as never));
    FakeSocket.instances[0].onclose?.({ code: 1006 });
    await waitFor(() => expect(onAccessDenied).toHaveBeenCalledTimes(1));
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("tras abrirse correctamente se vuelve a permitir un reintento con renovación", async () => {
    authRefresh.mockResolvedValue(undefined);
    const onAccessDenied = vi.fn();
    renderHook(() => useEditorCollaboration(baseInput(onAccessDenied) as never));
    FakeSocket.instances[0].onclose?.({ code: 1006 });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
    FakeSocket.instances[1].onopen?.(); // conectó bien
    FakeSocket.instances[1].onclose?.({ code: 1006 });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(3));
    expect(authRefresh).toHaveBeenCalledTimes(2);
    expect(onAccessDenied).not.toHaveBeenCalled();
  });

  it("el mensaje 'saver' de la sala fija si este cliente guarda con la cadencia normal; sin conexión vuelve a ser true", async () => {
    isSaverRef.current = true;
    const onAccessDenied = vi.fn();
    renderHook(() => useEditorCollaboration(baseInput(onAccessDenied) as never));
    const socket = FakeSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ type: "saver", isSaver: false }) });
    expect(isSaverRef.current).toBe(false);
    socket.onmessage?.({ data: JSON.stringify({ type: "saver", isSaver: true }) });
    expect(isSaverRef.current).toBe(true);
    socket.onmessage?.({ data: JSON.stringify({ type: "saver", isSaver: false }) });
    socket.onclose?.({ code: 1001 }); // se cae la conexión: guarda él
    expect(isSaverRef.current).toBe(true);
  });
});
