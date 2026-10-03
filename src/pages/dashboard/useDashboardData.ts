import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { DrawingSortField, SortDirection } from "../../api";
import type { DrawingSummary } from "../../types";
import { isLatestRequest, mergeUniqueDrawings } from "./pagination";
import { useDashboardLiveUpdates } from "./useDashboardLiveUpdates";
import { useCollectionsStore } from "../../store/collectionsStore";
import { getFresh, setFresh } from "../../utils/freshCache";
import { bumpDrawingsEpoch } from "../../utils/drawingsEpoch";

// Cada vista (carpeta + orden) se pide UNA vez y se guarda en la copia local (store de
// zustand + IndexedDB cifrada con WebCrypto, ver utils/freshCache.ts). Entrar al panel,
// cambiar de carpeta, volver del editor o recargar la página la reutiliza SIN pedir nada
// mientras no haya habido una escritura propia (época de `bumpDrawingsEpoch`: guardar,
// crear, mover, borrar...) ni haya pasado el margen de seguridad de FRESH_MAX_AGE_MS
// (cambios de otras personas o dispositivos).
const drawingsCacheKey = (
  collectionId: SelectedCollectionId,
  sortField: DrawingSortField,
  sortDirection: SortDirection,
) => `drawings:${collectionId === undefined ? "all" : collectionId}:${sortField}:${sortDirection}`;

type DrawingsPage = { drawings: DrawingSummary[]; totalCount: number };

type SelectedCollectionId = string | null | undefined;

type UseDashboardDataOptions = {
  debouncedSearch: string;
  selectedCollectionId: SelectedCollectionId;
  sortField: DrawingSortField;
  sortDirection: SortDirection;
  pageSize: number;
  onRefreshSuccess?: () => void;
};

export const useDashboardData = ({
  debouncedSearch,
  selectedCollectionId,
  sortField,
  sortDirection,
  pageSize,
  onRefreshSuccess,
}: UseDashboardDataOptions) => {
  const [drawings, setDrawingsState] = useState<DrawingSummary[]>([]);
  // Las acciones del panel (mover, borrar, renombrar) modifican la lista en local:
  // eso también invalida las vistas recordadas de otras carpetas.
  const setDrawings = useCallback<typeof setDrawingsState>((value) => {
    bumpDrawingsEpoch();
    setDrawingsState(value);
  }, []);
  const collections = useCollectionsStore((s) => s.collections);
  const setCollections = useCollectionsStore((s) => s.setCollections);
  const hydrateCollections = useCollectionsStore((s) => s.hydrate);
  const refreshCollections = useCollectionsStore((s) => s.refresh);
  useEffect(() => {
    void hydrateCollections();
  }, [hydrateCollections]);
  const [totalCount, setTotalCount] = useState(0);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const listRequestVersionRef = useRef(0);
  const nextOffsetRef = useRef(0);

  const hasMore = drawings.length < totalCount;
  // fetchMore se usa como dependencia de efecto (el IntersectionObserver de
  // scroll infinito de abajo vuelve a observar cada vez que cambia de
  // identidad). Mantener isFetchingMore/hasMore/isLoading fuera de su
  // propio array de dependencias — leídos vía refs en su lugar — evita que
  // obtenga una nueva identidad en cada cambio de estado de carga, lo que
  // de otro modo recrearía el observer a mitad de vuelo; un
  // IntersectionObserver recién (re)creado dispara un callback inmediato
  // para un objetivo ya visible, lo que en cualquier lista corta o vacía
  // (p. ej. Papelera) volvía a ejecutar fetchMore en un bucle ajustado.
  const isFetchingMoreRef = useRef(isFetchingMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingRef = useRef(isLoading);
  useEffect(() => {
    isFetchingMoreRef.current = isFetchingMore;
    hasMoreRef.current = hasMore;
    isLoadingRef.current = isLoading;
  }, [isFetchingMore, hasMore, isLoading]);

  const refreshData = useCallback(async (options?: { reuseFresh?: boolean }) => {
    const requestVersion = ++listRequestVersionRef.current;
    const cacheKey = drawingsCacheKey(selectedCollectionId, sortField, sortDirection);
    const reuseFresh = options?.reuseFresh === true;
    // Refresco forzado (acción del usuario, evento en vivo, foco tras mucho rato):
    // se descarta lo recordado y se pide de nuevo.
    if (!reuseFresh) bumpDrawingsEpoch();

    if (reuseFresh && !debouncedSearch) {
      const hit = await getFresh<DrawingsPage>(cacheKey);
      if (hit) {
        if (isLatestRequest(requestVersion, listRequestVersionRef.current)) {
          setDrawingsState(hit.value.drawings);
          setTotalCount(hit.value.totalCount);
          nextOffsetRef.current = hit.value.drawings.length;
          // Con la lista vigente también sabemos la versión actual de cada dibujo: abrirlos
          // puede usar su copia local sin pedir la escena (ver api/drawings.ts).
          api.noteListedVersions(hit.value.drawings, hit.at);
          setIsLoading(false);
        }
        return;
      }
    }

    setIsLoading(true);
    try {
      // Las colecciones se cachean/comparten vía useCollectionsStore
      // (hidratadas una vez desde IndexedDB, revalidadas una vez por carga
      // de la app) en vez de volver a obtenerse en cada cambio de vista
      // aquí — los nombres de carpetas apenas cambian, así que esto solía
      // ser una petición redundante en cada cambio de búsqueda/orden/
      // colección.
      const drawingsResult = await api
        .getDrawings(debouncedSearch, selectedCollectionId, {
          limit: pageSize,
          offset: 0,
          sortField,
          sortDirection,
        })
        .then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason) => ({ status: "rejected" as const, reason }),
        );
      if (!isLatestRequest(requestVersion, listRequestVersionRef.current))
        return;

      if (drawingsResult.status === "fulfilled") {
        setDrawingsState(drawingsResult.value.drawings);
        setTotalCount(drawingsResult.value.totalCount);
        nextOffsetRef.current = drawingsResult.value.drawings.length;
        onRefreshSuccess?.();
        if (!debouncedSearch) {
          void setFresh<DrawingsPage>(cacheKey, {
            drawings: drawingsResult.value.drawings,
            totalCount: drawingsResult.value.totalCount,
          });
        }
      } else {
        console.error("Failed to fetch drawings:", drawingsResult.reason);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      if (isLatestRequest(requestVersion, listRequestVersionRef.current)) {
        // react-doctor-disable-next-line react-doctor/no-loading-flag-reset-outside-finally -- false positive: this IS in a finally block, so it always runs; the guard isn't "only reset on success", it's request-versioning (skip resetting when a newer request has already superseded this one, which will reset the flag itself when it completes).
        setIsLoading(false);
      }
    }
  }, [
    debouncedSearch,
    selectedCollectionId,
    pageSize,
    sortField,
    sortDirection,
    onRefreshSuccess,
  ]);

  const fetchMore = useCallback(async () => {
    if (isFetchingMoreRef.current || !hasMoreRef.current || isLoadingRef.current) return;
    const requestVersion = listRequestVersionRef.current;
    setIsFetchingMore(true);
    try {
      const drawingsRes = await api.getDrawings(debouncedSearch, selectedCollectionId, {
        limit: pageSize,
        offset: nextOffsetRef.current,
        sortField,
        sortDirection,
      });
      if (!isLatestRequest(requestVersion, listRequestVersionRef.current))
        return;
      setDrawingsState((prev) => mergeUniqueDrawings(prev, drawingsRes.drawings));
      setTotalCount(drawingsRes.totalCount);
      nextOffsetRef.current += drawingsRes.drawings.length;
    } catch (err) {
      console.error("Failed to fetch more data:", err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [debouncedSearch, selectedCollectionId, pageSize, sortField, sortDirection]);

  useEffect(() => {
    // Cambio de vista (carpeta, orden, búsqueda): puede reutilizar una lista reciente.
    void refreshData({ reuseFresh: true });
  }, [refreshData]);

  // Los dibujos creados en otro lugar (otra pestaña, un cliente MCP/API)
  // aparecen sin necesidad de recargar: el backend envía "drawings-changed"
  // por el mismo socket usado para la colaboración del editor cada vez que
  // invalida la caché de dibujos, así que esto vuelve a obtener datos con
  // ese evento en vez de hacer polling. Aprovecha el mismo disparador para
  // revalidar también las colecciones (fire-and-forget — una lista de
  // colecciones desactualizada tiene poco riesgo, no vale la pena su propio
  // ciclo de red).
  useDashboardLiveUpdates(
    useCallback(() => {
      refreshData();
      refreshCollections().catch(() => undefined);
    }, [refreshData, refreshCollections]),
  );

  return {
    drawings,
    setDrawings,
    // Cambios que no son del contenido de la lista (p. ej. llega la miniatura de una
    // tarjeta): no invalidan las vistas recordadas de otras carpetas.
    setDrawingsQuiet: setDrawingsState,
    collections,
    setCollections,
    totalCount,
    setTotalCount,
    isFetchingMore,
    isLoading,
    hasMore,
    refreshData,
    fetchMore,
  };
};
