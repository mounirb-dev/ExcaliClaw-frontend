import type { MutableRefObject } from "react";
import type { BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import * as api from "../../api";
import { reconcileElements } from "../../utils/sync";

type ReconcileRefs = {
  currentDrawingVersion: MutableRefObject<number | null>;
  excalidrawAPI: MutableRefObject<ExcalidrawImperativeAPI | null>;
  isSyncing: MutableRefObject<boolean>;
  latestElements: MutableRefObject<readonly ExcalidrawElement[]>;
  latestFiles: MutableRefObject<BinaryFiles>;
  lastSyncedFiles: MutableRefObject<BinaryFiles>;
};

/**
 * Ante un conflicto de versión al guardar, recarga la escena autoritativa
 * del servidor y la fusiona con las ediciones locales (reconcileElements +
 * una unión de archivos) en vez de simplemente reenviar el estado obsoleto
 * sobre una versión más nueva — el antiguo reintento ciego podía
 * sobrescribir el trabajo concurrente de otro cliente. La escena fusionada
 * se empuja de vuelta al editor en vivo para que lo que el usuario ve
 * coincida con lo que se guarda.
 */
export const reloadAndReconcile = async (
  refs: ReconcileRefs,
  drawingId: string,
  localElements: readonly ExcalidrawElement[],
  localFiles: BinaryFiles,
): Promise<{ elements: readonly ExcalidrawElement[]; files: BinaryFiles }> => {
  const remote = await api.getDrawing(drawingId);
  const remoteElements = Array.isArray(remote.elements) ? remote.elements : [];
  const remoteFiles = remote.files || {};
  const mergedElements = reconcileElements(
    Array.from(localElements),
    remoteElements,
  );
  const mergedFiles = { ...remoteFiles, ...localFiles };
  if (typeof remote.version === "number") {
    refs.currentDrawingVersion.current = remote.version;
  }
  const editor = refs.excalidrawAPI.current;
  if (editor) {
    refs.isSyncing.current = true;
    try {
      if (typeof editor.addFiles === "function") {
        editor.addFiles(Object.values(mergedFiles));
      }
      if (typeof editor.updateScene === "function") {
        editor.updateScene({ elements: mergedElements });
      }
    } finally {
      refs.isSyncing.current = false;
    }
  }
  refs.latestElements.current = mergedElements;
  refs.latestFiles.current = mergedFiles;
  refs.lastSyncedFiles.current = mergedFiles;
  return { elements: mergedElements, files: mergedFiles };
};
