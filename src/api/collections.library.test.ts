import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockPut = vi.fn();
vi.mock("./client", () => ({
  api: { get: (...a: unknown[]) => mockGet(...a), put: (...a: unknown[]) => mockPut(...a) },
}));

import { getLibrary, updateLibrary } from "./collections";

const item = (id: string, version: number) => ({
  id,
  status: "published",
  elements: [{ id: `${id}-el`, version }],
});

describe("updateLibrary", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockPut.mockImplementation(async (_u: string, body: { items: unknown[] }) => ({ data: body.items }));
  });

  it("no vuelve a subir la biblioteca recién cargada (eco de onLibraryChange al abrir)", async () => {
    const items = [item("a", 1), item("b", 2)];
    mockGet.mockResolvedValue({ data: items });
    await getLibrary();
    await updateLibrary(items);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("sube cuando hay un cambio real y no repite el mismo contenido", async () => {
    mockGet.mockResolvedValue({ data: [item("a", 1)] });
    await getLibrary();
    await updateLibrary([item("a", 1), item("c", 1)]);
    expect(mockPut).toHaveBeenCalledTimes(1);
    await updateLibrary([item("a", 1), item("c", 1)]);
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it("si la carga falló y la biblioteca está vacía no pisa la del servidor", async () => {
    mockGet.mockResolvedValue({ data: [item("a", 1)] });
    await getLibrary();
    // Simula un módulo recién cargado sin biblioteca conocida.
    vi.resetModules();
    const fresh = await import("./collections");
    await fresh.updateLibrary([]);
    expect(mockPut).not.toHaveBeenCalled();
  });
});
