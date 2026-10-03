import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { applyUploadedFileRefs, getFilesDelta } from "./shared";
import type { UploadedFileRefs } from "./shared";

type UseEditorSceneApiParams = {
  drawingId: string | undefined;
  excalidrawAPIRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  isSyncing: MutableRefObject<boolean>;
  socketRef: MutableRefObject<WebSocket | null>;
  /** Pide abrir el socket (en dibujos propios no se abre hasta que hay interacción). */
  requestConnect?: () => void;
  socketMeRef: MutableRefObject<{ id: string }>;
  lastSyncedFilesRef: MutableRefObject<BinaryFiles>;
  latestFilesRef: MutableRefObject<BinaryFiles>;
  latestElementsRef: MutableRefObject<readonly ExcalidrawElement[]>;
  latestAppStateRef: MutableRefObject<Partial<AppState> | null>;
  debouncedSaveRef: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly ExcalidrawElement[],
        appState: Partial<AppState>,
        files?: BinaryFiles,
      ) => void)
    | null
  >;
  hasSceneChangesSinceLoadRef: MutableRefObject<boolean>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
  scanFileUploads: () => void;
  setIsReady: (ready: boolean) => void;
};

/**
 * Owns the Excalidraw imperative-API registration and the direct file-delta
 * socket emit. Extracted from Editor to keep that component lean; behavior is
 * unchanged. The `addFiles` monkeypatch broadcasts new files (as refs when
 * already uploaded), schedules a save, and kicks off the per-file upload scan.
 */
export const useEditorSceneApi = ({
  drawingId,
  excalidrawAPIRef,
  isSyncing,
  socketRef,
  requestConnect,
  socketMeRef,
  lastSyncedFilesRef,
  latestFilesRef,
  latestElementsRef,
  latestAppStateRef,
  debouncedSaveRef,
  hasSceneChangesSinceLoadRef,
  uploadedRefs,
  scanFileUploads,
  setIsReady,
}: UseEditorSceneApiParams) => {
  const patchedAddFilesApisRef = useRef<WeakSet<object>>(new WeakSet());

  const emitFilesDeltaIfNeeded = useCallback(
    (nextFiles: BinaryFiles) => {
      if (!drawingId) return false;
      const filesDelta = getFilesDelta(
        lastSyncedFilesRef.current,
        nextFiles || {},
      );
      if (Object.keys(filesDelta).length === 0) return false;
      latestFilesRef.current = nextFiles;
      // Sin socket abierto (aún sin interacción o abriéndose) no se da por enviado: se pide el
      // socket y se reintenta en el siguiente ciclo, ya con la conexión lista.
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        if (!socketRef.current) requestConnect?.();
        return true;
      }
      lastSyncedFilesRef.current = nextFiles;
      if (socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: "element-update",
            drawingId,
            elements: [],
            files: applyUploadedFileRefs(filesDelta, uploadedRefs.current),
            userId: socketMeRef.current.id,
          }),
        );
      }
      return true;
    },
    [
      drawingId,
      lastSyncedFilesRef,
      latestFilesRef,
      requestConnect,
      socketMeRef,
      socketRef,
      uploadedRefs,
    ],
  );

  const setExcalidrawAPI = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      excalidrawAPIRef.current = api;
      if (import.meta.env.DEV) {
        (window as Window & { __EXCALIDASH_EXCALIDRAW_API__?: ExcalidrawImperativeAPI }).__EXCALIDASH_EXCALIDRAW_API__ = api;
      }
      if (
        api &&
        typeof api.addFiles === "function" &&
        !patchedAddFilesApisRef.current.has(api as object)
      ) {
        patchedAddFilesApisRef.current.add(api as object);
        const originalAddFiles = api.addFiles.bind(api);
        api.addFiles = (filesInput: BinaryFiles | BinaryFileData[]) => {
          const normalizedFiles = Array.isArray(filesInput)
            ? filesInput
            : Object.values(filesInput || {});
          originalAddFiles(normalizedFiles);
          if (isSyncing.current) return;
          const nextFiles = api.getFiles?.() || {};
          const didEmit = emitFilesDeltaIfNeeded(nextFiles);
          if (
            didEmit &&
            drawingId &&
            latestAppStateRef.current &&
            debouncedSaveRef.current
          ) {
            hasSceneChangesSinceLoadRef.current = true;
            debouncedSaveRef.current(
              drawingId,
              latestElementsRef.current,
              latestAppStateRef.current,
              latestFilesRef.current || {},
            );
          }
          // Subir de inmediato cualquier imagen recién insertada para que
          // el guardado con debounce 1s después pueda enviar una
          // referencia en vez de bytes en línea.
          void scanFileUploads();
        };
      }
      setIsReady(true);
    },
    [
      debouncedSaveRef,
      drawingId,
      emitFilesDeltaIfNeeded,
      excalidrawAPIRef,
      hasSceneChangesSinceLoadRef,
      isSyncing,
      latestAppStateRef,
      latestElementsRef,
      latestFilesRef,
      scanFileUploads,
      setIsReady,
    ],
  );

  return { emitFilesDeltaIfNeeded, setExcalidrawAPI };
};
