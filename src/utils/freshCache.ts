import { create } from "zustand";
import { getCached, setCached, clearAllCached } from "./secureCache";
import { getDrawingsEpoch } from "./drawingsEpoch";

/** Copias locales que se usan SIN preguntar al servidor mientras sigan "frescas": que
 * no haya habido ninguna escritura propia desde que se pidieron (época de
 * `drawingsEpoch`) y que no haya pasado el margen de seguridad. Ese margen existe solo
 * para cambios de otra persona o dispositivo, que este cliente no puede ver; pasado el
 * margen se vuelve a pedir una vez.
 *
 * Dos capas: una store de zustand en memoria (lectura inmediata, sin esperar a
 * IndexedDB) y, detrás, IndexedDB cifrada con la API WebCrypto (AES-GCM, ver
 * secureCache.ts) para que sobreviva a recargas y a cerrar la pestaña. */
export const FRESH_MAX_AGE_MS = 30 * 60 * 1000;

type FreshEntry<T> = { epoch: number; at: number; value: T };

export type FreshHit<T> = { value: T; at: number };

type FreshCacheState = {
  entries: Record<string, FreshEntry<unknown>>;
  put: (key: string, entry: FreshEntry<unknown>) => void;
  clear: () => void;
};

export const useFreshCacheStore = create<FreshCacheState>((set) => ({
  entries: {},
  put: (key, entry) => set((state) => ({ entries: { ...state.entries, [key]: entry } })),
  clear: () => set({ entries: {} }),
}));

const isFresh = <T>(entry: FreshEntry<T> | undefined, useEpoch: boolean): entry is FreshEntry<T> => {
  if (!entry || typeof entry.at !== "number") return false;
  if (Date.now() - entry.at >= FRESH_MAX_AGE_MS) return false;
  return !useEpoch || entry.epoch === getDrawingsEpoch();
};

/** `useEpoch: false` para datos que no dependen de las escrituras de dibujos
 * (p. ej. la biblioteca, que se actualiza a sí misma al guardarla). */
export const getFresh = async <T>(key: string, options?: { useEpoch?: boolean }): Promise<FreshHit<T> | undefined> => {
  const useEpoch = options?.useEpoch !== false;
  const inMemory = useFreshCacheStore.getState().entries[key] as FreshEntry<T> | undefined;
  if (isFresh(inMemory, useEpoch)) return { value: inMemory.value, at: inMemory.at };
  const stored = await getCached<FreshEntry<T>>(key, FRESH_MAX_AGE_MS);
  if (!isFresh(stored, useEpoch)) return undefined;
  useFreshCacheStore.getState().put(key, stored);
  return { value: stored.value, at: stored.at };
};

export const setFresh = <T>(key: string, value: T): Promise<void> => {
  const entry: FreshEntry<T> = { epoch: getDrawingsEpoch(), at: Date.now(), value };
  useFreshCacheStore.getState().put(key, entry);
  return setCached<FreshEntry<T>>(key, entry);
};

/** Marca una entrada como caducada (memoria + IndexedDB) sin borrar el resto. */
export const invalidateFresh = (key: string): Promise<void> => {
  const entry: FreshEntry<null> = { epoch: -1, at: 0, value: null };
  useFreshCacheStore.getState().put(key, entry);
  return setCached<FreshEntry<null>>(key, entry);
};

/** Borra toda la copia local (memoria + IndexedDB). Se llama al cerrar sesión o
 * cambiar de cuenta. */
export const clearAllLocalData = (): Promise<void> => {
  useFreshCacheStore.getState().clear();
  return clearAllCached();
};
