import { beforeEach, describe, expect, it, vi } from "vitest";

const getCollections = vi.fn();
vi.mock("../api", () => ({ getCollections: (...a: unknown[]) => getCollections(...a) }));

const persisted = new Map<string, unknown>();
vi.mock("../utils/secureCache", () => ({
  getCached: async (key: string) => persisted.get(key),
  setCached: async (key: string, value: unknown) => {
    persisted.set(key, structuredClone(value));
  },
  clearAllCached: async () => persisted.clear(),
}));

import { useCollectionsStore } from "./collectionsStore";
import { useFreshCacheStore } from "../utils/freshCache";
import { bumpDrawingsEpoch } from "../utils/drawingsEpoch";

const folder = (id: string) => ({ id, name: id, createdAt: 1 });

describe("collectionsStore con copia local vigente", () => {
  beforeEach(() => {
    persisted.clear();
    useFreshCacheStore.getState().clear();
    bumpDrawingsEpoch();
    getCollections.mockReset();
    getCollections.mockResolvedValue([folder("A")]);
    useCollectionsStore.setState({ collections: [], hasHydrated: false, isRefreshing: false });
  });

  it("la primera vez pide la red y guarda la copia", async () => {
    await useCollectionsStore.getState().hydrate();
    await vi.waitFor(() => expect(useCollectionsStore.getState().collections).toHaveLength(1));
    expect(getCollections).toHaveBeenCalledTimes(1);
  });

  it("una carga posterior (recarga de la página) no pide nada mientras nadie edite", async () => {
    await useCollectionsStore.getState().hydrate();
    await vi.waitFor(() => expect(useCollectionsStore.getState().collections).toHaveLength(1));
    // Simula recargar: la store de colecciones vuelve a empezar, la copia local sigue.
    useCollectionsStore.setState({ collections: [], hasHydrated: false });
    await useCollectionsStore.getState().hydrate();
    expect(useCollectionsStore.getState().collections.map((c) => c.id)).toEqual(["A"]);
    expect(getCollections).toHaveBeenCalledTimes(1);
  });

  it("tras una escritura propia vuelve a pedir", async () => {
    await useCollectionsStore.getState().hydrate();
    await vi.waitFor(() => expect(useCollectionsStore.getState().collections).toHaveLength(1));
    bumpDrawingsEpoch();
    useCollectionsStore.setState({ collections: [], hasHydrated: false });
    await useCollectionsStore.getState().hydrate();
    await vi.waitFor(() => expect(getCollections).toHaveBeenCalledTimes(2));
  });
});
