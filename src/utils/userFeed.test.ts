import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DATA_CHANGED_EVENT, startUserFeed } from "./userFeed";
import { getDrawingsEpoch } from "./drawingsEpoch";

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
}

const open = (s: FakeSocket) => s.onopen?.();
const message = (s: FakeSocket, payload: unknown) => s.onmessage?.({ data: typeof payload === "string" ? payload : JSON.stringify(payload) });

describe("startUserFeed (canal de avisos por usuario)", () => {
  const onLibraryChanged = vi.fn();
  const refreshSession = vi.fn();
  const changed = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    onLibraryChanged.mockReset();
    refreshSession.mockReset();
    changed.mockReset();
    vi.stubGlobal("WebSocket", FakeSocket);
    window.addEventListener(DATA_CHANGED_EVENT, changed);
  });
  afterEach(() => {
    window.removeEventListener(DATA_CHANGED_EVENT, changed);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const start = () => startUserFeed({ url: "wss://x/feed/ws?cid=c1", onLibraryChanged, refreshSession });

  it("un aviso de contenido invalida las copias locales y avisa al panel", () => {
    const stop = start();
    open(FakeSocket.instances[0]);
    const before = getDrawingsEpoch();
    message(FakeSocket.instances[0], { type: "changed", kinds: ["content"] });
    expect(getDrawingsEpoch()).toBe(before + 1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(onLibraryChanged).not.toHaveBeenCalled();
    stop();
  });

  it("un aviso de biblioteca invalida solo la biblioteca", () => {
    const stop = start();
    open(FakeSocket.instances[0]);
    const before = getDrawingsEpoch();
    message(FakeSocket.instances[0], { type: "changed", kinds: ["library"] });
    expect(onLibraryChanged).toHaveBeenCalledTimes(1);
    expect(getDrawingsEpoch()).toBe(before);
    expect(changed).not.toHaveBeenCalled();
    stop();
  });

  it("la primera conexión no invalida nada, pero una reconexión sí (pudo haber avisos perdidos)", () => {
    const stop = start();
    open(FakeSocket.instances[0]);
    expect(changed).not.toHaveBeenCalled();
    FakeSocket.instances[0].onclose?.({ code: 1001 });
    vi.advanceTimersByTime(40_000);
    expect(FakeSocket.instances).toHaveLength(2);
    const before = getDrawingsEpoch();
    open(FakeSocket.instances[1]);
    expect(getDrawingsEpoch()).toBe(before + 1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(onLibraryChanged).toHaveBeenCalledTimes(1);
    stop();
  });

  it("manda un ping cada 50 s y ignora el pong", () => {
    const stop = start();
    open(FakeSocket.instances[0]);
    vi.advanceTimersByTime(50_000);
    expect(FakeSocket.instances[0].send).toHaveBeenCalledWith("ping");
    message(FakeSocket.instances[0], "pong");
    expect(changed).not.toHaveBeenCalled();
    stop();
  });

  it("con el JWT caducado (cierre 1006) renueva la sesión y reintenta una vez", async () => {
    refreshSession.mockResolvedValue(undefined);
    const stop = start();
    FakeSocket.instances[0].onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(10);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(FakeSocket.instances).toHaveLength(2);
    // si vuelve a fallar sin haber conectado, ya no renueva otra vez: espera con retroceso
    FakeSocket.instances[1].onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(10);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    stop();
  });

  it("ignora mensajes que no son avisos válidos", () => {
    const stop = start();
    open(FakeSocket.instances[0]);
    message(FakeSocket.instances[0], "no es json");
    message(FakeSocket.instances[0], { type: "otra-cosa" });
    expect(changed).not.toHaveBeenCalled();
    stop();
  });

  it("al detenerlo cierra el socket y no reconecta", () => {
    const stop = start();
    open(FakeSocket.instances[0]);
    stop();
    expect(FakeSocket.instances[0].close).toHaveBeenCalled();
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
