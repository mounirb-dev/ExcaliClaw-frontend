import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDrawings = vi.fn();
vi.mock("../../api", () => ({ getDrawings: (...a: unknown[]) => getDrawings(...a), noteListedVersions: vi.fn() }));

const store = new Map<string, unknown>();
vi.mock("../../utils/secureCache", () => ({
  clearAllCached: async () => store.clear(),
  getCached: async (key: string) => store.get(key),
  setCached: async (key: string, value: unknown) => {
    store.set(key, structuredClone(value));
  },
}));

vi.mock("../../store/collectionsStore", () => {
  const state = { collections: [], setCollections: vi.fn(), hydrate: vi.fn(async () => undefined), refresh: vi.fn(async () => undefined) };
  return { useCollectionsStore: (selector: (s: typeof state) => unknown) => selector(state) };
});
vi.mock("./useDashboardLiveUpdates", () => ({ useDashboardLiveUpdates: vi.fn() }));

import { useDashboardData } from "./useDashboardData";
import { bumpDrawingsEpoch } from "../../utils/drawingsEpoch";
import { useFreshCacheStore } from "../../utils/freshCache";

const page = (id: string) => ({ drawings: [{ id, name: id, version: 1, collectionId: null, createdAt: 1, updatedAt: 1 }], totalCount: 1, limit: 24, offset: 0 });

type Props = { selectedCollectionId: string | null | undefined };
const render = (initial: Props) =>
  renderHook((props: Props) => useDashboardData({ debouncedSearch: "", sortField: "updatedAt", sortDirection: "desc", pageSize: 24, ...props }), {
    initialProps: initial,
  });

describe("useDashboardData reutilización de listas recientes", () => {
  beforeEach(() => {
    store.clear();
    useFreshCacheStore.getState().clear();
    bumpDrawingsEpoch(); // el estado de memoria del módulo no debe pasar de un test a otro
    getDrawings.mockReset();
    getDrawings.mockImplementation(async (_s: unknown, collectionId: string | null | undefined) => page(`d-${String(collectionId)}`));
  });

  it("volver a una carpeta consultada hace segundos no pide la lista otra vez", async () => {
    const { result, rerender } = render({ selectedCollectionId: "A" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-A"));
    rerender({ selectedCollectionId: "B" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-B"));
    expect(getDrawings).toHaveBeenCalledTimes(2);
    rerender({ selectedCollectionId: "A" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-A"));
    expect(getDrawings).toHaveBeenCalledTimes(2); // sin petición nueva
  });

  it("un refresco forzado (mover, borrar, evento en vivo) descarta las listas recordadas", async () => {
    const { result, rerender } = render({ selectedCollectionId: "A" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-A"));
    rerender({ selectedCollectionId: "B" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-B"));
    await act(async () => {
      await result.current.refreshData();
    });
    expect(getDrawings).toHaveBeenCalledTimes(3);
    rerender({ selectedCollectionId: "A" });
    await waitFor(() => expect(getDrawings).toHaveBeenCalledTimes(4)); // A ya no es "reciente"
  });

  it("cambiar la lista en local (setDrawings) también invalida las vistas recordadas", async () => {
    const { result, rerender } = render({ selectedCollectionId: "A" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-A"));
    rerender({ selectedCollectionId: "B" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-B"));
    act(() => result.current.setDrawings([]));
    rerender({ selectedCollectionId: "A" });
    await waitFor(() => expect(getDrawings).toHaveBeenCalledTimes(3));
  });

  it("una miniatura que llega (setDrawingsQuiet) no invalida las vistas recordadas", async () => {
    const { result, rerender } = render({ selectedCollectionId: "A" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-A"));
    rerender({ selectedCollectionId: "B" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-B"));
    act(() => result.current.setDrawingsQuiet((current) => current.map((d) => ({ ...d, preview: "<svg/>" }))));
    rerender({ selectedCollectionId: "A" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-A"));
    expect(getDrawings).toHaveBeenCalledTimes(2);
  });

  it("no vuelve a pedir la lista dentro del margen de seguridad mientras nadie edite", async () => {
    const { result, rerender } = render({ selectedCollectionId: "A" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-A"));
    rerender({ selectedCollectionId: "B" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-B"));
    const realNow = Date.now;
    Date.now = () => realNow() + 20 * 60 * 1000; // veinte minutos después (dentro del margen de seguridad)
    try {
      rerender({ selectedCollectionId: "A" });
      await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-A"));
    } finally {
      Date.now = realNow;
    }
    expect(getDrawings).toHaveBeenCalledTimes(2);
  });

  it("una escritura de la API (guardar, crear, mover, borrar) invalida las listas recordadas", async () => {
    const { result, rerender } = render({ selectedCollectionId: "A" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-A"));
    rerender({ selectedCollectionId: "B" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("d-B"));
    bumpDrawingsEpoch(); // p. ej. el editor guardó un cambio
    rerender({ selectedCollectionId: "A" });
    await waitFor(() => expect(getDrawings).toHaveBeenCalledTimes(3));
  });

  it("un panel que se desmonta y vuelve a montar sin ediciones reutiliza la lista", async () => {
    const first = render({ selectedCollectionId: "A" });
    await waitFor(() => expect(first.result.current.drawings[0]?.id).toBe("d-A"));
    first.unmount();
    const second = render({ selectedCollectionId: "A" });
    await waitFor(() => expect(second.result.current.drawings[0]?.id).toBe("d-A"));
    expect(getDrawings).toHaveBeenCalledTimes(1);
  });
});
