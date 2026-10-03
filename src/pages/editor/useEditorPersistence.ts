/* eslint-disable react-hooks/immutability -- los refs compartidos representan una cola y estado mutable intencional del guardado. */
/* eslint-disable react-hooks/use-memo -- debounce recibe una función creada por la utilidad del proyecto y necesita conservar su identidad. */
/* eslint-disable react-hooks/refs -- los callbacks diferidos leen refs estables fuera del render. */
/* eslint-disable react-hooks/exhaustive-deps -- las funciones debounce inspeccionan callbacks envueltos que solo leen refs estables; el detector no puede inferir esas dependencias. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, LibraryItem } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { generatePreviewSvg } from "../../utils/previewGenerate";
import debounce from "lodash/debounce";
import { toast } from "sonner";
import * as api from "../../api";
import { reloadAndReconcile } from "./reconcileSave";
import { compressExcalidrawFiles } from "../../utils/imageCompression";
import { clearDraft, saveDraft } from "../../utils/draftStore";
import {
  applyUploadedFileRefs,
  computeSceneSignature,
  getFilesDelta,
  getPersistedAppState,
  hasRenderableElements,
} from "./shared";
import type { UploadedFileRefs } from "./shared";

class DrawingSaveConflictError extends Error {
  constructor(message = "Drawing version conflict") {
    super(message);
    this.name = "DrawingSaveConflictError";
  }
}

const SAVE_DEBOUNCE_MS = 15_000;
const SAVE_MAX_WAIT_MS = 30_000;
// Con varios editores en la sala solo UNO guarda con la cadencia normal (el elige la sala);
// los demás guardan mucho más espaciado, solo como red de seguridad por si el que guarda se
// desconecta sin haber subido sus cambios (lo que editan ya le llega al guardador por el socket).
const FOLLOWER_SAVE_DEBOUNCE_MS = 60_000;
const FOLLOWER_SAVE_MAX_WAIT_MS = 120_000;
const DRAFT_DEBOUNCE_MS = 1_000;
const DRAFT_MAX_WAIT_MS = 3_000;

type PersistenceRefs = {
  currentDrawingVersion: MutableRefObject<number | null>;
  debouncedSave: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly ExcalidrawElement[],
        appState: Partial<AppState>,
        files?: BinaryFiles,
      ) => void)
    | null
  >;
  excalidrawAPI: MutableRefObject<ExcalidrawImperativeAPI | null>;
  isSaver: MutableRefObject<boolean>;
  isSyncing: MutableRefObject<boolean>;
  isUnmounting: MutableRefObject<boolean>;
  lastLocalChangeAt: MutableRefObject<number>;
  lastPersistedElements: MutableRefObject<readonly ExcalidrawElement[]>;
  lastPersistedFiles: MutableRefObject<BinaryFiles>;
  lastPersistedSceneSignature: MutableRefObject<string | null>;
  lastSyncedFiles: MutableRefObject<BinaryFiles>;
  latestAppState: MutableRefObject<Partial<AppState> | null>;
  latestElements: MutableRefObject<readonly ExcalidrawElement[]>;
  latestFiles: MutableRefObject<BinaryFiles>;
  saveQueue: MutableRefObject<Promise<void>>;
  suspiciousBlankLoad: MutableRefObject<boolean>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
};

type UseEditorPersistenceParams = {
  refs: PersistenceRefs;
  user: unknown;
  normalizeImageElementStatus: (
    elements?: readonly ExcalidrawElement[],
    files?: BinaryFiles | null,
  ) => readonly ExcalidrawElement[];
  resolveSafeSnapshot: (candidateSnapshot?: readonly ExcalidrawElement[]) => {
    snapshot: readonly ExcalidrawElement[];
    prevented: boolean;
    staleEmptySnapshot: boolean;
    staleNonRenderableSnapshot: boolean;
  };
};

export const useEditorPersistence = ({
  refs,
  user,
  normalizeImageElementStatus,
  resolveSafeSnapshot,
}: UseEditorPersistenceParams) => {
  const saveDataRef = useRef<
    | ((
        drawingId: string,
        elements: readonly ExcalidrawElement[],
        appState: Partial<AppState>,
        files?: BinaryFiles,
      ) => Promise<void>)
    | null
  >(null);
  const savePreviewRef = useRef<
    | ((
        drawingId: string,
        elements: readonly ExcalidrawElement[],
        appState: Partial<AppState>,
        files: BinaryFiles,
      ) => Promise<void>)
    | null
  >(null);
  const saveLibraryRef = useRef<((items: LibraryItem[]) => Promise<void>) | null>(null);
  const [autosaveFailing, setAutosaveFailing] = useState(false);
  const autosaveFailureCountRef = useRef(0);
  // Firma barata de la última escena efectivamente persistida (la fija el
  // cargador al abrir y este hook tras cada guardado) — evita repetir el
  // PATCH completo cuando el debounce dispara pero nada cambió de verdad.
  // `version`/`versionNonce` de cada elemento de Excalidraw ya cambian en
  // cualquier edición real, así que basta con id+version por elemento.
  const lastPersistedSceneSignatureRef = refs.lastPersistedSceneSignature;

  // Asignar el closure más reciente al ref ocurre en un efecto, no durante
  // el render: el render debe permanecer puro, y React puede llamarlo más
  // de una vez (StrictMode, renderizado concurrente) sin llegar a
  // confirmarlo nunca.
  useEffect(() => {
    saveDataRef.current = async (
      drawingId: string,
      elements: readonly ExcalidrawElement[],
      appState: Partial<AppState>,
      files?: BinaryFiles,
    ) => {
      if (!drawingId) return;
      // Todo borrador anterior a este instante queda cubierto por esta instantánea.
      const savedAt = Date.now();
    try {
      const persistableAppState = getPersistedAppState(appState);
      const candidateElements = Array.isArray(elements) ? elements : [];
      const {
        snapshot: safeElements,
        prevented,
        staleEmptySnapshot,
        staleNonRenderableSnapshot,
      } = resolveSafeSnapshot(candidateElements);
      const persistableElements = Array.from(safeElements);
      if (
        refs.suspiciousBlankLoad.current &&
        !hasRenderableElements(persistableElements)
      ) {
        console.warn(
          "[Editor] Blocking non-renderable save due to suspicious blank load",
          { drawingId, elementCount: persistableElements.length },
        );
        return;
      }
      if (staleEmptySnapshot || staleNonRenderableSnapshot) {
        console.warn("[Editor] Skipping stale snapshot save", {
          drawingId,
          candidateElementCount: candidateElements.length,
          fallbackElementCount: persistableElements.length,
          prevented,
          staleEmptySnapshot,
          staleNonRenderableSnapshot,
        });
        return;
      }
      let persistableFiles = files ?? refs.latestFiles.current ?? {};
      const compressedFilesResult =
        await compressExcalidrawFiles(persistableFiles);
      if (compressedFilesResult.changed) {
        persistableFiles = compressedFilesResult.files;
        if (
          refs.excalidrawAPI.current &&
          typeof refs.excalidrawAPI.current.addFiles === "function"
        ) {
          refs.isSyncing.current = true;
          try {
            refs.excalidrawAPI.current.addFiles(
              Object.values(persistableFiles),
            );
          } finally {
            refs.isSyncing.current = false;
          }
        }
        refs.latestFiles.current = persistableFiles;
        refs.lastSyncedFiles.current = persistableFiles;
      }
      // Reemplazar los bytes en línea por una referencia en cualquier archivo
      // ya subido fuera de banda, para que el PUT envíe KB, no MB. Los
      // archivos aún no subidos conservan su dataURL en línea y el servidor
      // los interna — sin pérdida de datos en una condición de carrera de
      // subida.
      const filesToPersist = applyUploadedFileRefs(
        persistableFiles,
        refs.uploadedRefs.current,
      );
      const filesChangedSincePersist =
        Object.keys(
          getFilesDelta(
            refs.lastPersistedFiles.current || {},
            filesToPersist || {},
          ),
        ).length > 0;
      const normalizedElementsForSave = Array.from(
        normalizeImageElementStatus(persistableElements, filesToPersist),
      );
      const sceneSignature = computeSceneSignature(normalizedElementsForSave, persistableAppState, filesToPersist);
      if (sceneSignature === lastPersistedSceneSignatureRef.current) {
        // Nada nuevo que subir: el borrador (si lo hay) ya no protege nada.
        void clearDraft(drawingId, savedAt);
        return;
      }
      const persistScene = async (
        attempt: number,
        elementsToSave: readonly ExcalidrawElement[],
        filesToSave: BinaryFiles,
        sendFiles: boolean,
      ): Promise<void> => {
        try {
          const updated = await api.updateDrawing(drawingId, {
            elements: Array.from(elementsToSave),
            appState: persistableAppState,
            ...(sendFiles ? { files: filesToSave } : {}),
            version: refs.currentDrawingVersion.current ?? undefined,
          });
          if (typeof updated.version === "number") {
            refs.currentDrawingVersion.current = updated.version;
          }
          refs.lastPersistedElements.current = elementsToSave;
          if (sendFiles) {
            refs.lastPersistedFiles.current = filesToSave;
          }
        } catch (err) {
          if (api.isAxiosError(err) && err.response?.status === 409) {
            if (attempt === 0) {
              const reconciled = await reloadAndReconcile(
                refs,
                drawingId,
                elementsToSave,
                filesToSave,
              );
              await persistScene(1, reconciled.elements, reconciled.files, true);
              return;
            }
            throw new DrawingSaveConflictError();
          }
          throw err;
        }
      };
      await persistScene(
        0,
        normalizedElementsForSave,
        filesToPersist,
        filesChangedSincePersist,
      );
      // Se recalcula sobre lo que persistScene realmente terminó guardando
      // (refs.lastPersistedElements/Files) en vez de reusar `sceneSignature`
      // tal cual: en un 409 el conflicto se resuelve con reconcileSave y el
      // contenido efectivamente guardado puede diferir del candidato original.
      lastPersistedSceneSignatureRef.current = computeSceneSignature(
        refs.lastPersistedElements.current,
        persistableAppState,
        refs.lastPersistedFiles.current || filesToPersist,
      );
      // Guardado en el servidor: el borrador local anterior a esta instantánea sobra.
      void clearDraft(drawingId, savedAt);
    } catch (err) {
      if (err instanceof DrawingSaveConflictError) {
        toast.error("Drawing changed in another tab. Refresh to load latest.");
        throw err;
      }
      console.error("Failed to save drawing", err);
      toast.error("Failed to save changes");
      throw err;
    }
    };
  });

  const enqueueSceneSave = useCallback(
    (
      drawingId: string,
      elements: readonly ExcalidrawElement[],
      appState: Partial<AppState>,
      files?: BinaryFiles,
      options?: { suppressErrors?: boolean },
    ) => {
      const suppressErrors = options?.suppressErrors ?? true;
      refs.saveQueue.current = refs.saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (!saveDataRef.current) return;
          try {
            await saveDataRef.current(drawingId, elements, appState, files);
            // Un guardado exitoso (autoguardado o explícito) limpia el indicador.
            if (autosaveFailureCountRef.current !== 0) {
              autosaveFailureCountRef.current = 0;
              setAutosaveFailing(false);
            }
          } catch (err) {
            if (suppressErrors) {
              // Autoguardado de mejor esfuerzo: tras fallos repetidos, se
              // levanta un indicador persistente de cambios sin guardar en
              // vez de descartar silenciosamente cada error.
              autosaveFailureCountRef.current += 1;
              if (autosaveFailureCountRef.current >= 2) {
                setAutosaveFailing(true);
              }
              return;
            }
            throw err;
          }
        });
      return refs.saveQueue.current;
    },
    [refs],
  );

  useEffect(() => {
    savePreviewRef.current = async (
      drawingId: string,
      elements: readonly ExcalidrawElement[],
      appState: Partial<AppState>,
      files: BinaryFiles,
    ) => {
    if (!drawingId) return;
    try {
      const snapshotFromArgs = Array.isArray(elements) ? elements : [];
      const snapshotFromRef = refs.latestElements.current ?? [];
      const candidateSnapshot =
        hasRenderableElements(snapshotFromArgs) ||
        !hasRenderableElements(snapshotFromRef)
          ? snapshotFromArgs
          : snapshotFromRef;
      const {
        snapshot: currentSnapshot,
        prevented: preventedPreviewOverwrite,
      } = resolveSafeSnapshot(candidateSnapshot);
      const currentFiles = refs.latestFiles.current ?? files;
      const normalizedSnapshot = normalizeImageElementStatus(
        currentSnapshot,
        currentFiles,
      );
      if (
        refs.suspiciousBlankLoad.current &&
        !hasRenderableElements(currentSnapshot)
      ) {
        return;
      }
      if (preventedPreviewOverwrite) {
        console.warn("[Editor] Prevented stale snapshot preview overwrite", {
          drawingId,
          fallbackElementCount: currentSnapshot.length,
        });
      }
      // Escenas pesadas -> miniatura raster acotada (ver previewGenerate.ts):
      // un exportToSvg vectorial de miles de elementos bloqueaba el editor
      // segundos y producía SVG de MB que el Worker rechaza (413 > 2 MB).
      const previewSvg = await generatePreviewSvg({
        elements: normalizedSnapshot,
        appState,
        files: currentFiles,
      });
      // Antes: updateDrawing(id, { preview }) — pero updateDrawing descarta
      // `preview` (solo envía name/collectionId/elements/appState/files), así
      // que la miniatura nunca llegaba al servidor y el dashboard mostraba
      // la primera que se generó, congelada.
      await api.putDrawingPreview(drawingId, previewSvg);
    } catch (err) {
      console.error("Failed to save preview", err);
    }
    };

    saveLibraryRef.current = async (items: LibraryItem[]) => {
      if (!user) return;
      try {
        await api.updateLibrary(items);
      } catch (err) {
        console.error("Failed to save library", err);
        if (api.isAxiosError(err) && err.response?.status === 401) return;
        toast.error("Failed to save library");
      }
    };
  });

  // Guardado en el servidor ESPACIADO: cada instantánea cuesta una petición al Worker, una
  // escritura en R2 y una lectura y una escritura en Appwrite, así que se agrupan los cambios:
  // se guarda a los SAVE_DEBOUNCE_MS de dejar de editar y, como mucho, cada SAVE_MAX_WAIT_MS
  // mientras se edita sin parar. Lo que no protege el servidor lo protege el borrador local
  // (draftStore), que se escribe casi al instante sin tocar la red; al abrir el dibujo se
  // recupera si la pestaña se cerró entre instantáneas. Además se vacía al ocultar la
  // pestaña y al desmontar. Antes: 2,5 s (~120 guardados en 10 min de edición).
  const debouncedSaveCore = useCallback(
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: the inner callback only calls enqueueSceneSave, which is already the sole dependency; the detector can't check a callback wrapped by debounce().
    debounce((drawingId, elements, appState, files) => {
      enqueueSceneSave(drawingId, elements, appState, files);
    }, SAVE_DEBOUNCE_MS, { maxWait: SAVE_MAX_WAIT_MS }),
    [enqueueSceneSave],
  );
  const debouncedFollowerSave = useCallback(
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: the inner callback only calls enqueueSceneSave, which is already the sole dependency; the detector can't check a callback wrapped by debounce().
    debounce((drawingId, elements, appState, files) => {
      enqueueSceneSave(drawingId, elements, appState, files);
    }, FOLLOWER_SAVE_DEBOUNCE_MS, { maxWait: FOLLOWER_SAVE_MAX_WAIT_MS }),
    [enqueueSceneSave],
  );
  const debouncedDraftWrite = useCallback(
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: the inner callback only reads refs (stable) and writes through saveDraft.
    debounce((drawingId: string, elements: readonly ExcalidrawElement[], appState: Partial<AppState>) => {
      if (refs.suspiciousBlankLoad.current && !hasRenderableElements(elements)) return;
      void saveDraft({
        drawingId,
        baseVersion: refs.currentDrawingVersion.current,
        // eslint-disable-next-line react-hooks/purity -- se ejecuta dentro del callback diferido (debounce), no durante el render.
        at: Date.now(),
        elements,
        appState: getPersistedAppState(appState),
      });
    }, DRAFT_DEBOUNCE_MS, { maxWait: DRAFT_MAX_WAIT_MS }),
    [refs],
  );
  const debouncedSave = useMemo(() => {
    const save = (
      drawingId: string,
      elements: readonly ExcalidrawElement[],
      appState: Partial<AppState>,
      files?: BinaryFiles,
    ) => {
      debouncedDraftWrite(drawingId, elements, appState);
      (refs.isSaver.current ? debouncedSaveCore : debouncedFollowerSave)(drawingId, elements, appState, files);
    };
    save.flush = () => {
      debouncedDraftWrite.flush();
      debouncedSaveCore.flush();
      debouncedFollowerSave.flush();
    };
    save.cancel = () => {
      debouncedDraftWrite.cancel();
      debouncedSaveCore.cancel();
      debouncedFollowerSave.cancel();
    };
    return save;
  }, [debouncedDraftWrite, debouncedSaveCore, debouncedFollowerSave, refs]);
  refs.debouncedSave.current = debouncedSave;

  // Pestaña oculta (cambio de pestaña, móvil en segundo plano, a punto de cerrarse): se
  // sube ya lo pendiente en vez de esperar al siguiente plazo, porque el navegador puede
  // congelar o descartar la página sin más aviso.
  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") debouncedSave.flush();
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => document.removeEventListener("visibilitychange", flushWhenHidden);
  }, [debouncedSave]);

  const debouncedSavePreview = useCallback(
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: the inner callback only reads through `refs` (already the sole dependency) and `savePreviewRef.current`; the detector can't check a callback wrapped by debounce().
    debounce((drawingId: string) => {
      if (!savePreviewRef.current || !drawingId) return;
      if (refs.isUnmounting.current || refs.isSyncing.current) return;
      const expectedChangeAt = refs.lastLocalChangeAt.current;
      const run = () => {
        if (!savePreviewRef.current) return;
        if (refs.isUnmounting.current || refs.isSyncing.current) return;
        if (refs.lastLocalChangeAt.current !== expectedChangeAt) return;
        const appState = refs.latestAppState.current;
        if (!appState) return;
        void savePreviewRef.current(
          drawingId,
          refs.latestElements.current,
          appState,
          refs.latestFiles.current || {},
        );
      };
      const w = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => void;
      };
      if (typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(run, { timeout: 2000 });
      } else {
        setTimeout(run, 0);
      }
    }, 30_000),
    [refs],
  );

  const debouncedSaveLibrary = useCallback(
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: the inner callback only reads saveLibraryRef.current (a ref, stable identity, correctly excluded); the detector can't check a callback wrapped by debounce().
    debounce((items: LibraryItem[]) => {
      if (saveLibraryRef.current) saveLibraryRef.current(items);
    }, 1000),
    [],
  );

  useEffect(() => {
    return () => {
      // Vaciar los guardados pendientes de escena/biblioteca al desmontar
      // para que una navegación rápida hacia otra página no pierda las
      // últimas ediciones con debounce del usuario. La vista previa es una
      // miniatura regenerable, así que es seguro cancelarla.
      debouncedSave.flush();
      debouncedSaveLibrary.flush();
      debouncedSavePreview.cancel();
    };
  }, [debouncedSave, debouncedSaveLibrary, debouncedSavePreview]);

  return {
    autosaveFailing,
    debouncedSave,
    debouncedSaveLibrary,
    debouncedSavePreview,
    enqueueSceneSave,
    saveDataRef,
    savePreviewRef,
  };
};

