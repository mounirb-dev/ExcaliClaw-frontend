import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockPut = vi.fn();
vi.mock("./client", () => ({
  api: { get: (...a: unknown[]) => mockGet(...a), put: (...a: unknown[]) => mockPut(...a) },
}));
const persisted = new Map<string, unknown>();
vi.mock("../utils/secureCache", () => ({
  getCached: async (key: string) => persisted.get(key),
  setCached: async (key: string, value: unknown) => {
    persisted.set(key, structuredClone(value));
  },
  clearAllCached: async () => persisted.clear(),
}));

import { getLibrary, updateLibrary } from "./collections";
import { useFreshCacheStore } from "../utils/freshCache";
import { bumpDrawingsEpoch } from "../utils/drawingsEpoch";

const item = (id: string) => ({ id, status: "published", elements: [{ id: `${id}-e`, version: 1 }] });

describe("biblioteca en la copia local", () => {
  beforeEach(() => {
    persisted.clear();
    useFreshCacheStore.getState().clear();
    mockGet.mockReset();
    mockPut.mockReset();
    mockPut.mockResolvedValue({ data: { success: true } });
  });

  it("no se vuelve a pedir mientras siga vigente, aunque se hayan guardado dibujos", async () => {
    mockGet.mockResolvedValue({ data: [item("a")] });
    await getLibrary();
    bumpDrawingsEpoch(); // guardar un dibujo no cambia la biblioteca
    const again = await getLibrary();
    expect(again).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("al guardarla se reescribe la copia local", async () => {
    mockGet.mockResolvedValue({ data: [item("a")] });
    await getLibrary();
    await updateLibrary([item("a"), item("b")]);
    useFreshCacheStore.getState().clear(); // recarga: lee de IndexedDB
    const lib = await getLibrary();
    expect(lib.map((i) => i.id)).toEqual(["a", "b"]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
