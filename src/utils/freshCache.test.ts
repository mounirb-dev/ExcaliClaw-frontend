import { beforeEach, describe, expect, it, vi } from "vitest";

// IndexedDB cifrada sustituida por un Map (el cifrado WebCrypto se prueba en el navegador).
const persisted = new Map<string, unknown>();
vi.mock("./secureCache", () => ({
  getCached: async (key: string) => persisted.get(key),
  setCached: async (key: string, value: unknown) => {
    persisted.set(key, structuredClone(value));
  },
  clearAllCached: async () => persisted.clear(),
}));

import { clearAllLocalData, FRESH_MAX_AGE_MS, getFresh, setFresh, useFreshCacheStore } from "./freshCache";
import { bumpDrawingsEpoch, getDrawingsEpoch } from "./drawingsEpoch";

describe("freshCache (zustand + IndexedDB cifrada)", () => {
  beforeEach(() => {
    persisted.clear();
    useFreshCacheStore.getState().clear();
    bumpDrawingsEpoch();
  });

  it("devuelve lo guardado desde la memoria de la store", async () => {
    await setFresh("k", { a: 1 });
    persisted.clear(); // aunque IndexedDB no lo tenga, la store en memoria responde
    expect((await getFresh<{ a: number }>("k"))?.value).toEqual({ a: 1 });
  });

  it("si la memoria está vacía (recarga) lo recupera de IndexedDB y lo sube a la store", async () => {
    await setFresh("k", [1, 2, 3]);
    useFreshCacheStore.getState().clear();
    expect((await getFresh<number[]>("k"))?.value).toEqual([1, 2, 3]);
    expect(useFreshCacheStore.getState().entries["k"]).toBeDefined();
  });

  it("una escritura propia (época) invalida la copia", async () => {
    await setFresh("k", "x");
    bumpDrawingsEpoch();
    expect(await getFresh("k")).toBeUndefined();
    expect((await getFresh("k", { useEpoch: false }))?.value).toBe("x");
  });

  it("caduca pasado el margen de seguridad", async () => {
    await setFresh("k", "x");
    const realNow = Date.now;
    Date.now = () => realNow() + FRESH_MAX_AGE_MS + 1000;
    try {
      expect(await getFresh("k", { useEpoch: false })).toBeUndefined();
    } finally {
      Date.now = realNow;
    }
  });

  it("clearAllLocalData borra memoria e IndexedDB", async () => {
    await setFresh("k", "x");
    await clearAllLocalData();
    expect(await getFresh("k")).toBeUndefined();
    expect(persisted.size).toBe(0);
  });

  it("la época persiste en localStorage y vale entre pestañas", () => {
    const before = getDrawingsEpoch();
    bumpDrawingsEpoch();
    expect(Number(localStorage.getItem("excaliclaw:writeEpoch"))).toBe(before + 1);
    localStorage.setItem("excaliclaw:writeEpoch", String(before + 10)); // otra pestaña editó
    expect(getDrawingsEpoch()).toBe(before + 10);
  });
});
