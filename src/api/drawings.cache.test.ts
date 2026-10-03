import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();
vi.mock("./client", () => ({
  api: {
    get: (...a: unknown[]) => mockGet(...a),
    patch: (...a: unknown[]) => mockPatch(...a),
    post: (...a: unknown[]) => mockPost(...a),
    delete: (...a: unknown[]) => mockDelete(...a),
  },
  isAxiosError: () => false,
  getCurrentUserId: () => "u1",
}));

// Caché en memoria en lugar de IndexedDB cifrada.
const store = new Map<string, unknown>();
vi.mock("../utils/secureCache", () => ({
  getCached: async (key: string) => store.get(key),
  clearAllCached: async () => store.clear(),
  setCached: async (key: string, value: unknown) => {
    store.set(key, structuredClone(value));
  },
}));

import { createDrawing, deleteDrawing, getDrawing, getDrawings, updateDrawing } from "./drawings";
import { bumpDrawingsEpoch, getDrawingsEpoch } from "../utils/drawingsEpoch";
import { useFreshCacheStore } from "../utils/freshCache";

const row = (version: number, extra: Record<string, unknown> = {}) => ({
  $id: "d1",
  name: "Dibujo",
  version,
  collectionId: null,
  $createdAt: "2026-01-01T00:00:00.000Z",
  $updatedAt: "2026-01-02T00:00:00.000Z",
  ...extra,
});

const withScene = (version: number) => row(version, { elements: [{ id: "a", type: "rectangle" }], appState: {}, files: {} });

const serveList = (version: number) =>
  mockGet.mockImplementation(async (url: string) => {
    if (url === "/drawings") return { data: { drawings: [row(version)], totalCount: 1, limit: 24, offset: 0 } };
    return { data: withScene(version) };
  });

describe("caché local de escenas", () => {
  beforeEach(() => {
    store.clear();
    useFreshCacheStore.getState().clear();
    bumpDrawingsEpoch();
    mockGet.mockReset();
    mockPatch.mockReset();
  });

  it("abre sin pedir el dibujo si la copia local tiene la versión vigente del listado", async () => {
    serveList(3);
    await getDrawing("d1"); // primera apertura: red + guarda la copia
    await getDrawings(); // el listado confirma versión 3
    mockGet.mockClear();
    const drawing = await getDrawing("d1");
    expect(drawing.elements).toHaveLength(1);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("pide la red si el listado trae una versión más nueva que la copia", async () => {
    serveList(3);
    await getDrawing("d1");
    serveList(4);
    await getDrawings();
    mockGet.mockClear();
    mockGet.mockResolvedValue({ data: withScene(4) });
    const drawing = await getDrawing("d1");
    expect(drawing.version).toBe(4);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("sin versión conocida (enlace directo) usa la copia mientras no haya escrituras propias", async () => {
    serveList(3);
    await getDrawing("d1");
    vi.resetModules();
    const fresh = await import("./drawings");
    mockGet.mockClear();
    mockGet.mockResolvedValue({ data: withScene(3) });
    await fresh.getDrawing("d1");
    expect(mockGet).not.toHaveBeenCalled();
    // Una escritura propia desde que se guardó la copia: ya no vale sin versión que la confirme.
    bumpDrawingsEpoch();
    await fresh.getDrawing("d1");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("noteListedVersions (lista recuperada de la copia local) permite abrir sin petición", async () => {
    serveList(3);
    await getDrawing("d1");
    bumpDrawingsEpoch(); // la época no basta, pero la versión confirmada por el listado sí
    vi.resetModules();
    const fresh = await import("./drawings");
    fresh.noteListedVersions([{ id: "d1", version: 3 }], Date.now());
    mockGet.mockClear();
    await fresh.getDrawing("d1");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("tras guardar, la copia pasa a la versión nueva con lo enviado", async () => {
    serveList(3);
    await getDrawing("d1");
    mockPatch.mockResolvedValue({ data: row(4) });
    const elements = [{ id: "a", type: "rectangle" }, { id: "b", type: "ellipse" }];
    await updateDrawing("d1", { elements: elements as never, appState: {} });
    await new Promise((r) => setTimeout(r, 0));
    mockGet.mockClear();
    const drawing = await getDrawing("d1");
    expect(mockGet).not.toHaveBeenCalled();
    expect(drawing.version).toBe(4);
    expect(drawing.elements).toHaveLength(2);
  });

  it("solo las escrituras suben la época de cambios (leer o abrir no)", async () => {
    serveList(3);
    const start = getDrawingsEpoch();
    await getDrawings();
    await getDrawing("d1");
    expect(getDrawingsEpoch()).toBe(start);

    mockPatch.mockResolvedValue({ data: row(4) });
    await updateDrawing("d1", { name: "Nuevo" });
    expect(getDrawingsEpoch()).toBe(start + 1);

    mockPost.mockResolvedValue({ data: row(1) });
    await createDrawing("x");
    expect(getDrawingsEpoch()).toBe(start + 2);

    mockDelete.mockResolvedValue({});
    await deleteDrawing("d1");
    expect(getDrawingsEpoch()).toBe(start + 3);
  });
});
