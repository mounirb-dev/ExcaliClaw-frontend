/* eslint-disable react-hooks/immutability -- el cargador actualiza refs mutables que coordinan el ciclo de vida de una escena. */
/* eslint-disable react-hooks/preserve-manual-memoization -- las dependencias manuales preservan la identidad de callbacks que trabajan con refs estables. */

import { useCallback, useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { MutableRefObject } from "react";
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState, LibraryItem } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { toast } from "sonner";
import * as api from "../../api";
import { rehydrateFilesProgressive } from "../../utils/rehydrateFiles";
import { computeSceneSignature, getPersistedAppState, hasRenderableElements } from "./shared";
import { GRID_DISABLED } from "../../utils/gridSize";
import { findStaleDraft, recoverDraft } from "../../utils/draftRecovery";
import { clearDraft } from "../../utils/draftStore";

type AccessLevel = "none" | "view" | "edit" | "owner";

type SceneLoaderParams = {
  id: string | undefined;
  user: unknown;
  location: {
    pathname: string;
    search: string;
    hash: string;
  };
  navigate: NavigateFunction;
  refs: {
    elementVersionMap: MutableRefObject<Map<string, unknown>>;
    saveQueue: MutableRefObject<Promise<void>>;
    latestElements: MutableRefObject<readonly ExcalidrawElement[]>;
    initialSceneElements: MutableRefObject<readonly ExcalidrawElement[]>;
    latestFiles: MutableRefObject<BinaryFiles>;
    isSyncing: MutableRefObject<boolean>;
    lastSyncedFiles: MutableRefObject<BinaryFiles>;
    lastSyncedElementOrderSig: MutableRefObject<string>;
    lastPersistedFiles: MutableRefObject<BinaryFiles>;
    currentDrawingVersion: MutableRefObject<number | null>;
    lastPersistedElements: MutableRefObject<readonly ExcalidrawElement[]>;
    lastPersistedSceneSignature: MutableRefObject<string | null>;
    suspiciousBlankLoad: MutableRefObject<boolean>;
    hasSceneChangesSinceLoad: MutableRefObject<boolean>;
    excalidrawAPI: MutableRefObject<ExcalidrawImperativeAPI | null>;
    latestAppState: MutableRefObject<Partial<AppState> | null>;
    isBootstrappingScene: MutableRefObject<boolean>;
    hasHydratedInitialScene: MutableRefObject<boolean>;
  };
  setAccessLevel: (accessLevel: AccessLevel) => void;
  setLiveCollaboration: (live: boolean) => void;
  /** Programa el guardado de lo recuperado de un borrador local (ver draftStore.ts). */
  scheduleRecoverySave?: (
    drawingId: string,
    elements: readonly ExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles,
  ) => void;
  setDrawingName: (name: string) => void;
  setInitialData: (data: ExcalidrawInitialDataState | null) => void;
  setIsReady: (ready: boolean) => void;
  setIsSceneLoading: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;
  recordElementVersion: (element: ExcalidrawElement) => void;
  computeElementOrderSig: (elements: readonly ExcalidrawElement[]) => string;
  normalizeImageElementStatus: (
    elements?: readonly ExcalidrawElement[],
    files?: BinaryFiles | null,
  ) => readonly ExcalidrawElement[];
};

const buildEmptyScene = () => ({
  elements: [],
  appState: {
    viewBackgroundColor: "#ffffff",
    gridSize: GRID_DISABLED,
    collaborators: new Map(),
  },
  files: {},
  scrollToContent: true,
});

export const useEditorSceneLoader = ({
  id,
  user,
  location,
  navigate,
  refs,
  setAccessLevel,
  setLiveCollaboration,
  scheduleRecoverySave,
  setDrawingName,
  setInitialData,
  setIsReady,
  setIsSceneLoading,
  setLoadError,
  recordElementVersion,
  computeElementOrderSig,
  normalizeImageElementStatus,
}: SceneLoaderParams) => {
  const resetRefs = useCallback(() => {
    refs.isBootstrappingScene.current = true;
    refs.hasHydratedInitialScene.current = false;
    refs.elementVersionMap.current.clear();
    refs.saveQueue.current = Promise.resolve();
    refs.latestElements.current = [];
    refs.initialSceneElements.current = [];
    refs.latestFiles.current = {};
    refs.lastSyncedFiles.current = {};
    refs.lastSyncedElementOrderSig.current = "";
    refs.lastPersistedFiles.current = {};
    refs.currentDrawingVersion.current = null;
    refs.lastPersistedElements.current = [];
    refs.lastPersistedSceneSignature.current = null;
    refs.suspiciousBlankLoad.current = false;
    refs.hasSceneChangesSinceLoad.current = false;
    refs.excalidrawAPI.current = null;
  }, [refs]);

  // Depender del valor escalar del id de usuario, no de la identidad del
  // objeto usuario: una nueva referencia de objeto para el mismo usuario
  // conectado no debe volver a ejecutar el loader (lo que resetearía los
  // refs y volvería a hacer fetch en mitad de la sesión).
  const userId =
    typeof user === "object" && user !== null && "id" in user
      ? (user as { id?: unknown }).id
      : undefined;
  const userIdKey = typeof userId === "string" ? userId : null;

  useEffect(() => {
    // Una carga lenta y obsoleta nunca debe escribir su resultado en los
    // refs de persistencia después de que el usuario haya navegado a otro
    // dibujo — así era como los datos de un dibujo terminaban filtrándose a
    // otro. La limpieza activa este flag y cada paso posterior a un await lo
    // comprueba para salir.
    let cancelled = false;
    resetRefs();
    setIsReady(false);
    setIsSceneLoading(true);
    setLoadError(null);
    setInitialData(null);

    const loadData = async () => {
      if (!id) {
        if (cancelled) return;
        setInitialData(buildEmptyScene());
        setIsSceneLoading(false);
        return;
      }
      try {
        const libraryItemsPromise = userIdKey
          ? api.getLibrary().catch((err): LibraryItem[] => {
              console.warn("Failed to load library, using empty:", err);
              return [];
            })
          : Promise.resolve<LibraryItem[]>([]);
        // La biblioteca (cientos de KB) NO bloquea el primer pintado: Excalidraw
        // acepta una promesa en `initialData.libraryItems` y la aplica al
        // resolverse, así que solo se espera al dibujo.
        const data = await api.getDrawing(id);
        if (cancelled) return;
        setDrawingName(data.name);
        // Sin dato (copia local antigua) se asume colaboración: es el caso seguro.
        setLiveCollaboration(data.liveCollaboration !== false);
        setAccessLevel(
          data.accessLevel === "view" ||
            data.accessLevel === "edit" ||
            data.accessLevel === "owner"
            ? data.accessLevel
            : "owner",
        );
        const rawElements = data.elements || [];
        // Pintar primero, transmitir imágenes después. En modo S3 (o db-ref)
        // los archivos cargados llevan referencias `/api/files/...` (o S3
        // público) en vez de URLs data: en línea. Ya no esperamos a volver a
        // convertirlas en línea antes del primer pintado — la escena se
        // renderiza inmediatamente con lo que ya esté en línea y los
        // archivos referenciados se transmiten al canvas a medida que cada
        // fetch llega. Los elementos de imagen en línea se marcan como
        // `saved` para que se rendericen de inmediato; los elementos
        // solo-referencia siguen como no guardados y muestran el propio
        // estado de carga de Excalidraw hasta que llegan sus bytes.
        const files: BinaryFiles = data.files || {};
        const serverElements = normalizeImageElementStatus(rawElements, files);
        // Cambios hechos y no guardados en el servidor (pestaña cerrada entre instantáneas).
        const recovered = await recoverDraft(id, data.version, serverElements);
        // Borrador de una versión anterior (el dibujo cambió desde otro sitio): se ofrece restaurar.
        const staleDraft = recovered ? null : await findStaleDraft(id, data.version, serverElements);
        if (cancelled) return;
        const elements = recovered ? normalizeImageElementStatus(recovered.elements, files) : serverElements;
        const hasPreview =
          typeof data.preview === "string" && data.preview.trim().length > 0;
        const loadedRenderable = hasRenderableElements(elements);
        refs.suspiciousBlankLoad.current = !loadedRenderable && hasPreview;
        refs.hasSceneChangesSinceLoad.current = false;
        refs.latestElements.current = elements;
        refs.initialSceneElements.current = elements;
        refs.latestFiles.current = files;
        refs.lastSyncedFiles.current = files;
        refs.lastPersistedFiles.current = files;
        refs.currentDrawingVersion.current =
          typeof data.version === "number" ? data.version : null;
        // La línea base de "lo que ya está en el servidor" es SIEMPRE lo cargado de él, aunque se
        // muestre un borrador recuperado: así lo recuperado cuenta como cambio pendiente.
        refs.lastPersistedElements.current = serverElements;
        serverElements.forEach((element) => recordElementVersion(element));
        // Orden base: sin esto el primer onChange tras abrir parecía un cambio de orden
        // y disparaba guardado + miniatura + mensaje de socket aunque no se tocara nada.
        refs.lastSyncedElementOrderSig.current = computeElementOrderSig(elements);
        const serverAppState = getPersistedAppState(data.appState || {});
        // Línea base del autoguardado: lo cargado ya está en el servidor, así que
        // el primer guardado sin cambios reales no debe volver a subirlo.
        refs.lastPersistedSceneSignature.current = computeSceneSignature(serverElements, serverAppState, files);
        const persistedAppState = recovered ? getPersistedAppState(recovered.appState) : serverAppState;
        const hydratedAppState = {
          ...persistedAppState,
          collaborators: new Map(),
        };
        refs.latestAppState.current = hydratedAppState;
        setInitialData({
          elements,
          appState: hydratedAppState,
          files,
          scrollToContent: true,
          libraryItems: libraryItemsPromise,
        });
        if (staleDraft) {
          const restore = () => {
            refs.excalidrawAPI.current?.updateScene({ elements: staleDraft.elements as ExcalidrawElement[] });
            refs.hasSceneChangesSinceLoad.current = true;
            scheduleRecoverySave?.(id, staleDraft.elements, hydratedAppState, files);
          };
          toast.warning("Unsaved local changes from an older version were not applied", {
            duration: 30_000,
            action: { label: "Restore", onClick: restore },
            // Sin decisión no se vuelve a preguntar en cada apertura.
            onDismiss: () => void clearDraft(id, Date.now()),
            onAutoClose: () => void clearDraft(id, Date.now()),
          });
        }
        if (recovered) {
          refs.hasSceneChangesSinceLoad.current = true;
          toast.info("Recovered unsaved changes from this device");
          scheduleRecoverySave?.(id, elements, hydratedAppState, files);
        }

        // Transmitir los archivos referenciados al canvas a medida que
        // llegan. Cada dataURL hidratada se escribe en latestFiles Y en
        // lastSyncedFiles/lastPersistedFiles para el mismo fileId en el
        // mismo paso: esto refleja cómo se maneja compressedFilesResult en
        // useEditorPersistence, para que los bytes recién puestos en línea
        // nunca sean detectados por getFilesDelta como un "archivo
        // cambiado" y se vuelvan a subir/guardar. `isSyncing` envuelve el
        // push de addFiles para que no dispare el bucle de
        // broadcast/guardado. Cada callback aborta si el efecto está
        // cancelado (guardia de carga obsoleta); los archivos que se
        // resuelven antes de que la API de Excalidraw esté registrada se
        // encolan y se vacían en cuanto aparece.
        const pendingCanvasFiles: BinaryFileData[] = [];
        let flushScheduled = false;
        const pushToCanvas = (batch: BinaryFileData[]): boolean => {
          const excalidrawApi = refs.excalidrawAPI.current;
          if (!excalidrawApi || typeof excalidrawApi.addFiles !== "function") {
            return false;
          }
          refs.isSyncing.current = true;
          try {
            excalidrawApi.addFiles(batch);
          } finally {
            refs.isSyncing.current = false;
          }
          return true;
        };
        const flushPendingCanvasFiles = () => {
          flushScheduled = false;
          if (cancelled || pendingCanvasFiles.length === 0) return;
          if (pushToCanvas(pendingCanvasFiles)) {
            pendingCanvasFiles.length = 0;
            return;
          }
          if (!flushScheduled) {
            flushScheduled = true;
            setTimeout(flushPendingCanvasFiles, 50);
          }
        };
        const handleFileReady = (
          fileId: string,
          hydratedFile: BinaryFileData,
        ) => {
          if (cancelled) return;
          refs.latestFiles.current = {
            ...refs.latestFiles.current,
            [fileId]: hydratedFile,
          };
          refs.lastSyncedFiles.current = {
            ...refs.lastSyncedFiles.current,
            [fileId]: hydratedFile,
          };
          refs.lastPersistedFiles.current = {
            ...refs.lastPersistedFiles.current,
            [fileId]: hydratedFile,
          };
          if (!pushToCanvas([hydratedFile])) {
            pendingCanvasFiles.push(hydratedFile);
            if (!flushScheduled) {
              flushScheduled = true;
              setTimeout(flushPendingCanvasFiles, 50);
            }
          }
        };
        void rehydrateFilesProgressive(
          files,
          handleFileReady,
          () => cancelled,
        );
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load drawing", err);
        let message = "Failed to load drawing";
        if (api.isAxiosError(err)) {
          const responseMessage =
            typeof err.response?.data?.message === "string"
              ? err.response.data.message
              : null;
          if (responseMessage) {
            message = responseMessage;
          } else if (err.response?.status === 403) {
            message = "You do not have access to this drawing";
          } else if (err.response?.status === 404) {
            message = "Drawing not found";
          }
          if (
            err.response?.status === 403 &&
            id &&
            location.pathname.startsWith("/app/editor/")
          ) {
            navigate(`/shared/${id}${location.search}${location.hash}`, {
              replace: true,
            });
            return;
          }
        }
        toast.error(message);
        refs.latestElements.current = [];
        refs.initialSceneElements.current = [];
        refs.latestFiles.current = {};
        refs.lastSyncedFiles.current = {};
        refs.lastSyncedElementOrderSig.current = "";
        refs.lastPersistedFiles.current = {};
        refs.currentDrawingVersion.current = null;
        refs.lastPersistedElements.current = [];
        refs.suspiciousBlankLoad.current = false;
        refs.hasSceneChangesSinceLoad.current = false;
        setLoadError(message);
        setInitialData(null);
      } finally {
        if (!cancelled) setIsSceneLoading(false);
      }
    };

    // react-doctor-disable-next-line react-doctor/no-pass-live-state-to-parent -- false positive: setDrawingName/setAccessLevel are genuinely shared lifted state, not a redundant copy — useEditorCommands.ts also writes setDrawingName independently (optimistic rename + rollback), so this can't just be a value returned from this hook alone.
    loadData();
    return () => {
      cancelled = true;
    };
  }, [
    id,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    normalizeImageElementStatus,
    recordElementVersion,
    computeElementOrderSig,
    refs,
    resetRefs,
    setAccessLevel,
    setDrawingName,
    setInitialData,
    setIsReady,
    setIsSceneLoading,
    setLiveCollaboration,
    scheduleRecoverySave,
    setLoadError,
    userIdKey,
  ]);
};
