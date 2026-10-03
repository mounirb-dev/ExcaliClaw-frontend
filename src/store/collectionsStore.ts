// Estado compartido de colecciones (zustand) en vez de que cada página
// (Dashboard, el propietario del Sidebar, Profile, Settings) llame de
// forma independiente a api.getCollections() al montar. Se hidrata al
// instante desde la caché cifrada de IndexedDB (ver utils/secureCache.ts)
// para que los nombres de carpetas se pinten de inmediato al navegar,
// luego revalida desde la red en segundo plano — una petición real sigue
// ocurriendo, simplemente no bloquea el primer render ni se duplica en
// cada página que necesita la lista.
import { create } from "zustand";
import * as api from "../api";
import type { Collection } from "../types";
import { getFresh, setFresh } from "../utils/freshCache";

const CACHE_KEY = "collections:list";

type CollectionsState = {
  collections: Collection[];
  hasHydrated: boolean;
  isRefreshing: boolean;
  hydrate: () => Promise<void>;
  refresh: () => Promise<Collection[]>;
  setCollections: (update: Collection[] | ((prev: Collection[]) => Collection[])) => void;
};

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  hasHydrated: false,
  isRefreshing: false,

  hydrate: async () => {
    if (get().hasHydrated) return;
    const hit = await getFresh<Collection[]>(CACHE_KEY);
    if (hit) {
      // Copia local vigente (sin escrituras propias desde que se pidió y dentro del
      // margen de seguridad): no se pide nada al servidor.
      set({ collections: hit.value, hasHydrated: true });
      return;
    }
    set({ hasHydrated: true });
    // Sin copia vigente: una petición real. Sin sesión (401) o red caída: el fallo ya
    // lo gestiona quien muestre las colecciones; aquí no debe quedar como rechazo sin
    // capturar (acababa en Sentry como "AxiosError 401", ruido de usuarios sin sesión).
    get().refresh().catch(() => undefined);
  },

  refresh: async () => {
    set({ isRefreshing: true });
    try {
      const collections = await api.getCollections();
      set({ collections, isRefreshing: false });
      void setFresh(CACHE_KEY, collections);
      return collections;
    } catch (err) {
      set({ isRefreshing: false });
      throw err;
    }
  },

  setCollections: (update) => {
    const next = typeof update === "function" ? update(get().collections) : update;
    set({ collections: next });
    void setFresh(CACHE_KEY, next);
  },
}));
