import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorBroadcast } from "./useEditorBroadcast";

const el = (id: string, version: number) => ({ id, type: "rectangle", version, isDeleted: false }) as never;

type Socket = { readyState: number; send: ReturnType<typeof vi.fn> };
const openSocket = (): Socket => ({ readyState: WebSocket.OPEN, send: vi.fn() });
const connectingSocket = (): Socket => ({ readyState: WebSocket.CONNECTING, send: vi.fn() });

const setup = (socket: Socket | null, changed: (e: { id: string }) => boolean = () => true, orderSig = "") => {
  const socketRef = { current: socket as unknown as WebSocket | null };
  const params = {
    drawingId: "d1",
    excalidrawAPI: { current: { getFiles: () => ({}) } as never },
    lastLocalChangeAtRef: { current: 0 },
    lastSyncedElementOrderSigRef: { current: orderSig },
    lastSyncedFilesRef: { current: {} },
    latestAppStateRef: { current: {} },
    latestFilesRef: { current: {} },
    socketMeRef: { current: { id: "u1" } },
    socketRef,
    requestConnect: vi.fn(),
    uploadedRefs: { current: {} },
    debouncedSave: vi.fn(),
    debouncedSavePreview: vi.fn(),
    computeElementOrderSig: (elements: readonly { id: string }[]) => elements.map((e) => e.id).join(","),
    hasElementChanged: vi.fn((e: { id: string }) => changed(e)),
    normalizeImageElementStatus: (elements?: readonly unknown[]) => elements ?? [],
    recordElementVersion: vi.fn(),
    setHasSceneChangesSinceLoad: vi.fn(),
  };
  const { result } = renderHook(() => useEditorBroadcast(params as never));
  return { params, socketRef, broadcast: result.current };
};

describe("useEditorBroadcast con el socket abierto bajo demanda", () => {
  beforeEach(() => vi.useRealTimers());

  it("sin socket y con un cambio real: pide el socket, guarda y NO da por enviado nada", () => {
    const { params, broadcast } = setup(null);
    act(() => broadcast([el("a", 2)], {}));
    expect(params.requestConnect).toHaveBeenCalledTimes(1);
    expect(params.setHasSceneChangesSinceLoad).toHaveBeenCalled();
    expect(params.debouncedSave).toHaveBeenCalled();
    expect(params.recordElementVersion).not.toHaveBeenCalled(); // sigue pendiente de enviar
  });

  it("sin socket y sin cambios (onChange al cargar, scroll, zoom): no pide el socket", () => {
    // El orden base ya coincide (lo fija el cargador al abrir): no hay nada que enviar.
    const { params, broadcast } = setup(null, () => false, "a");
    act(() => broadcast([el("a", 1)], {}));
    expect(params.requestConnect).not.toHaveBeenCalled();
    expect(params.debouncedSave).not.toHaveBeenCalled();
  });

  it("con el socket abriéndose no se da por enviado y no se vuelve a pedir", () => {
    const socket = connectingSocket();
    const { params, broadcast } = setup(socket);
    act(() => broadcast([el("a", 2)], {}));
    expect(socket.send).not.toHaveBeenCalled();
    expect(params.recordElementVersion).not.toHaveBeenCalled();
    expect(params.requestConnect).not.toHaveBeenCalled();
    expect(params.debouncedSave).toHaveBeenCalled();
  });

  it("con el socket abierto envía y registra lo enviado", () => {
    const socket = openSocket();
    const { params, broadcast } = setup(socket);
    act(() => broadcast([el("a", 2)], {}));
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(socket.send.mock.calls[0][0] as string).elements[0].id).toBe("a");
    expect(params.recordElementVersion).toHaveBeenCalledTimes(1);
  });

  it("al abrirse el socket se reenvía lo que cambió mientras no había conexión", () => {
    const { params, socketRef, broadcast } = setup(null);
    act(() => broadcast([el("a", 2)], {}));
    const socket = openSocket();
    socketRef.current = socket as unknown as WebSocket;
    // El editor llama de nuevo a broadcastChanges al abrirse (onSocketOpen); pasado el throttle de 100 ms.
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        act(() => broadcast([el("a", 2)], {}));
        expect(socket.send).toHaveBeenCalledTimes(1);
        expect(params.recordElementVersion).toHaveBeenCalledTimes(1);
        resolve();
      }, 150),
    );
  });
});
