import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getUserIdentity } from "../identity";
import { getInitialsFromName } from "../user";

describe("getUserIdentity", () => {
  const makeMemoryLocalStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => {
        const value = store.get(key);
        return value === undefined ? null : value;
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    };
  };

  let originalLocalStorage: Storage;

  beforeEach(() => {
    // Nuestro entorno de Vitest provee un stub mínimo de localStorage (sin clear/removeItem).
    // Se sobrescribe con una implementación estándar en memoria para estas pruebas.
    originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: makeMemoryLocalStorage(),
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
    });
  });

  it("normalizes stored initials to match the stored name", () => {
    localStorage.setItem(
      "excalidash-user-id",
      JSON.stringify({
        id: "device-1",
        name: "Scourge",
        initials: "LO",
        color: "#123456",
      })
    );

    const identity = getUserIdentity();
    expect(identity).toEqual({
      id: "device-1",
      name: "Scourge",
      initials: "SC",
      color: "#123456",
    });
  });

  it("is deterministic from the browser fingerprint", () => {
    localStorage.setItem("excalidash-device-id", "device-abc");

    const first = getUserIdentity();
    expect(first.initials).toBe(getInitialsFromName(first.name));

    // Borrar solo el user-id no debería cambiar la identidad calculada.
    localStorage.removeItem("excalidash-user-id");
    const second = getUserIdentity();

    expect(second).toEqual(first);
  });
});
