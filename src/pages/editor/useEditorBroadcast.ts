import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { applyUploadedFileRefs, getFilesDelta } from "./shared";
import type { UploadedFileRefs } from "./shared";

type UseEditorBroadcastParams = {
  drawingId: string | undefined;
  excalidrawAPI: MutableRefObject<ExcalidrawImperativeAPI | null>;
  lastLocalChangeAtRef: MutableRefObject<number>;
  lastSyncedElementOrderSigRef: MutableRefObject<string>;
  lastSyncedFilesRef: MutableRefObject<BinaryFiles>;
  latestAppStateRef: MutableRefObject<Partial<AppState> | null>;
  latestFilesRef: MutableRefObject<BinaryFiles>;
  socketMeRef: MutableRefObject<{ id: string }>;
  socketRef: MutableRefObject<WebSocket | null>;
  /** Pide abrir el socket (en dibujos propios no se abre hasta que hay interacción). */
  requestConnect?: () => void;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
  debouncedSave: (
    drawingId: string,
    elements: readonly ExcalidrawElement[],
    appState: Partial<AppState>,
    files?: BinaryFiles,
  ) => void;
  debouncedSavePreview: (drawingId: string) => void;
  computeElementOrderSig: (elements: readonly ExcalidrawElement[]) => string;
  hasElementChanged: (element: ExcalidrawElement) => boolean;
  normalizeImageElementStatus: (
    elements?: readonly ExcalidrawElement[],
    files?: BinaryFiles | null,
  ) => readonly ExcalidrawElement[];
  recordElementVersion: (element: ExcalidrawElement) => void;
  setHasSceneChangesSinceLoad: () => void;
};

export const useEditorBroadcast = ({
  drawingId,
  excalidrawAPI,
  lastLocalChangeAtRef,
  lastSyncedElementOrderSigRef,
  lastSyncedFilesRef,
  latestAppStateRef,
  latestFilesRef,
  socketMeRef,
  socketRef,
  requestConnect,
  uploadedRefs,
  debouncedSave,
  debouncedSavePreview,
  computeElementOrderSig,
  hasElementChanged,
  normalizeImageElementStatus,
  recordElementVersion,
  setHasSceneChangesSinceLoad,
}: UseEditorBroadcastParams) => {
  const timeoutRef = useRef<number | null>(null);
  const lastRunAtRef = useRef(0);
  const trailingArgsRef = useRef<
    [readonly ExcalidrawElement[], BinaryFiles | undefined] | null
  >(null);

  const emitChanges = useCallback(
    (elements: readonly ExcalidrawElement[], currentFiles?: BinaryFiles) => {
      if (!drawingId) return;
      // Sin socket (dibujo propio aún sin interacción) o con el socket abriéndose: el
      // guardado y el resto del flujo siguen igual, pero NO se da por enviado lo que no
      // se envía. Al abrirse el socket el editor vuelve a llamar aquí (onSocketOpen) y
      // se reenvía todo lo cambiado entretanto.
      const socketOpen = socketRef.current?.readyState === WebSocket.OPEN;
      const changes: ExcalidrawElement[] = [];
      const nextFiles = currentFiles || excalidrawAPI.current?.getFiles() || {};
      const normalizedElements = normalizeImageElementStatus(
        elements,
        nextFiles,
      );
      const nextOrderSig = computeElementOrderSig(normalizedElements);
      const shouldSyncOrder =
        nextOrderSig !== lastSyncedElementOrderSigRef.current;
      if (shouldSyncOrder && socketOpen) {
        lastSyncedElementOrderSigRef.current = nextOrderSig;
      }
      normalizedElements.forEach((el) => {
        if (hasElementChanged(el)) {
          changes.push(el);
          if (socketOpen) recordElementVersion(el);
        }
      });
      const filesDelta = getFilesDelta(lastSyncedFilesRef.current, nextFiles);
      const shouldSyncFiles = Object.keys(filesDelta).length > 0;
      if (Object.keys(nextFiles || {}).length > 0) {
        latestFilesRef.current = nextFiles;
      }
      if (shouldSyncFiles && socketOpen) {
        lastSyncedFilesRef.current = nextFiles;
      }
      if (changes.length > 0 || shouldSyncFiles || shouldSyncOrder) {
        // Hay un cambio real: si aún no hay socket (dibujo propio sin interacción), se pide.
        if (!socketRef.current) requestConnect?.();
        setHasSceneChangesSinceLoad();
        lastLocalChangeAtRef.current = new Date().getTime();
        // Los pares reciben referencias para cualquier imagen subida (KB,
        // no MB por el socket); su ruta de rehidratación ya obtiene las
        // referencias `/files/...`.
        if (socketOpen && socketRef.current) {
          socketRef.current.send(
            JSON.stringify({
              type: "element-update",
              drawingId,
              elements: changes.length > 0 ? changes : [],
              files: shouldSyncFiles
                ? applyUploadedFileRefs(filesDelta, uploadedRefs.current)
                : undefined,
              elementOrder: shouldSyncOrder
                ? normalizedElements.map((el) => el?.id).filter(Boolean)
                : undefined,
              userId: socketMeRef.current.id,
            }),
          );
        }
        const appState = latestAppStateRef.current;
        if (appState) {
          debouncedSave(drawingId, normalizedElements, appState, nextFiles);
          debouncedSavePreview(drawingId);
        }
      }
    },
    [
      computeElementOrderSig,
      debouncedSave,
      debouncedSavePreview,
      drawingId,
      excalidrawAPI,
      hasElementChanged,
      lastLocalChangeAtRef,
      lastSyncedElementOrderSigRef,
      lastSyncedFilesRef,
      latestAppStateRef,
      latestFilesRef,
      normalizeImageElementStatus,
      recordElementVersion,
      setHasSceneChangesSinceLoad,
      socketRef,
      socketMeRef,
      requestConnect,
      uploadedRefs,
    ],
  );

  const broadcastChanges = useCallback(
    (elements: readonly ExcalidrawElement[], currentFiles?: BinaryFiles) => {
      const now = new Date().getTime();
      const elapsed = now - lastRunAtRef.current;

      if (elapsed >= 100) {
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          trailingArgsRef.current = null;
        }
        lastRunAtRef.current = now;
        emitChanges(elements, currentFiles);
        return;
      }

      trailingArgsRef.current = [elements, currentFiles];
      if (timeoutRef.current) return;

      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        const args = trailingArgsRef.current;
        trailingArgsRef.current = null;
        if (!args) return;
        lastRunAtRef.current = new Date().getTime();
        emitChanges(...args);
      }, 100 - elapsed);
    },
    [emitChanges],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  return broadcastChanges;
};
