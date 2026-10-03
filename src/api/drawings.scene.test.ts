import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
vi.mock("./client", () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  isAxiosError: () => false,
  getCurrentUserId: () => "u1",
}));

import { getDrawing, prefetchDrawing } from "./drawings";
import { useFreshCacheStore } from "../utils/freshCache";
import { bumpDrawingsEpoch } from "../utils/drawingsEpoch";

const row = (overrides: Record<string, unknown> = {}) => ({
  $id: "d1",
  name: "Dibujo",
  version: 3,
  collectionId: null,
  $createdAt: "2026-01-01T00:00:00.000Z",
  $updatedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});

describe("getDrawing", () => {
  beforeEach(() => {
    mockGet.mockReset();
    useFreshCacheStore.getState().clear();
    bumpDrawingsEpoch();
  });

  it("no descarta elementos ni archivos con formas inusuales (si no, se borrarían al guardar)", async () => {
    const elements = [
      { id: "a", type: "rectangle", x: 1, y: 2, width: 3, height: 4 },
      { id: "b", type: "text", x: "10", y: null, width: "5" },
    ];
    const files = { f1: { id: "f1", dataURL: "data:image/png;base64,AAA", mimeType: "image/png" } };
    mockGet.mockResolvedValue({ data: row({ elements, files }) });
    const drawing = await getDrawing("d1");
    expect(drawing.elements).toEqual(elements);
    expect(drawing.files).toEqual(files);
  });

  it("devuelve listas/objetos vacíos si el servidor no manda escena", async () => {
    mockGet.mockResolvedValue({ data: row({ elements: "basura", files: 7 }) });
    const drawing = await getDrawing("d1");
    expect(drawing.elements).toEqual([]);
    expect(drawing.files).toEqual({});
  });

  it("consume la precarga una sola vez y no repite la petición", async () => {
    mockGet.mockResolvedValue({ data: row() });
    prefetchDrawing("d1");
    await getDrawing("d1");
    expect(mockGet).toHaveBeenCalledTimes(1);
    // La escena pedida queda en la copia local: reabrirla sin editar no pide nada.
    await getDrawing("d1");
    expect(mockGet).toHaveBeenCalledTimes(1);

  });

  it("si la precarga falla, repite la petición normal", async () => {
    mockGet.mockRejectedValueOnce(new Error("401")).mockResolvedValueOnce({ data: row() });
    prefetchDrawing("d1");
    const drawing = await getDrawing("d1");
    expect(drawing.name).toBe("Dibujo");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  describe("liveCollaboration (¿puede haber más gente editando a la vez?)", () => {
    const withAccess = (extra: Record<string, unknown>) => ({ data: row({ elements: [], files: {}, ...extra }) });

    it("es falso en un dibujo tuyo sin editores", async () => {
      mockGet.mockResolvedValue(withAccess({ userId: "u1", editors: [], $permissions: ['read("user:u1")'] }));
      expect((await getDrawing("d1")).liveCollaboration).toBe(false);
    });

    it("es verdadero si el dibujo no es tuyo", async () => {
      mockGet.mockResolvedValue(withAccess({ userId: "otra", editors: [], $permissions: [] }));
      expect((await getDrawing("d1")).liveCollaboration).toBe(true);
    });

    it("es verdadero si lo compartiste con un editor", async () => {
      mockGet.mockResolvedValue(withAccess({ userId: "u1", editors: ["u2"], $permissions: ['read("user:u1")'] }));
      expect((await getDrawing("d1")).liveCollaboration).toBe(true);
    });

    it("es verdadero con un permiso update de otra persona", async () => {
      mockGet.mockResolvedValue(
        withAccess({ userId: "u1", editors: [], $permissions: ['read("user:u1")', 'update("user:u2")'] }),
      );
      expect((await getDrawing("d1")).liveCollaboration).toBe(true);
    });

    it("un lector (read) de otra persona no cuenta: no puede producir cambios en vivo", async () => {
      mockGet.mockResolvedValue(
        withAccess({ userId: "u1", editors: [], $permissions: ['read("user:u1")', 'read("user:u2")', 'read("any")'] }),
      );
      expect((await getDrawing("d1")).liveCollaboration).toBe(false);
    });
  });
});
