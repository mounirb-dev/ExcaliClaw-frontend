import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
vi.mock("./client", () => ({ api: { get: (...args: unknown[]) => mockGet(...args) } }));

import { getDrawings, matchesDrawingSearch } from "./drawings";

const row = (id: string, name: string) => ({
  $id: id,
  name,
  version: 1,
  collectionId: null,
  $createdAt: "2026-01-01T00:00:00.000Z",
  $updatedAt: "2026-01-02T00:00:00.000Z",
});

// Responde como el Worker: una página por (limit, offset) sobre `all`.
const serve = (all: ReturnType<typeof row>[]) =>
  mockGet.mockImplementation(async (_url: string, config: { params: { limit?: number; offset?: number } }) => {
    const { limit = 50, offset = 0 } = config.params;
    return { data: { drawings: all.slice(offset, offset + limit), totalCount: all.length, limit, offset } };
  });

describe("matchesDrawingSearch", () => {
  it("ignora mayúsculas y acentos", () => {
    expect(matchesDrawingSearch("9 ARIKETA - Hotel katea", "hotel")).toBe(true);
    expect(matchesDrawingSearch("Diseño Café", "cafe")).toBe(true);
    expect(matchesDrawingSearch("Diseño Café", "DISENO")).toBe(true);
  });

  it("no coincide si el texto no está", () => {
    expect(matchesDrawingSearch("10 ARIKETA - Lorezaintza enpresa", "hotel")).toBe(false);
  });
});

describe("getDrawings con texto de búsqueda", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("filtra por nombre y el total refleja los resultados", async () => {
    serve([row("1", "10 ARIKETA - Lorezaintza enpresa"), row("2", "9 ARIKETA - Hotel katea"), row("3", "Otro")]);
    const result = await getDrawings("hotel", undefined, { limit: 24, offset: 0 });
    expect(result.drawings.map((d) => d.id)).toEqual(["2"]);
    expect(result.totalCount).toBe(1);
  });

  it("pagina sobre los resultados filtrados", async () => {
    serve(Array.from({ length: 30 }, (_, i) => row(String(i), `plano ${i}`)));
    const first = await getDrawings("plano", "col-search-1", { limit: 24, offset: 0 });
    const second = await getDrawings("plano", "col-search-1", { limit: 24, offset: 24 });
    expect(first.drawings).toHaveLength(24);
    expect(second.drawings).toHaveLength(6);
    expect(first.totalCount).toBe(30);
  });

  it("descarga todas las páginas del servidor cuando hay más de 100 dibujos", async () => {
    serve(Array.from({ length: 230 }, (_, i) => row(String(i), i === 205 ? "buscado" : `otro ${i}`)));
    const result = await getDrawings("buscado", "col-search-2", {});
    expect(result.drawings.map((d) => d.id)).toEqual(["205"]);
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it("reutiliza la lista en la caché al teclear más letras", async () => {
    serve([row("1", "alfa"), row("2", "alfombra")]);
    await getDrawings("al", "col-search-3", {});
    await getDrawings("alf", "col-search-3", {});
    await getDrawings("alfo", "col-search-3", {});
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("sin texto pide la página normal al servidor", async () => {
    serve([row("1", "alfa")]);
    const result = await getDrawings("", undefined, { limit: 24, offset: 0 });
    expect(result.drawings).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith("/drawings", expect.objectContaining({ params: expect.objectContaining({ limit: 24, offset: 0 }) }));
  });
});
