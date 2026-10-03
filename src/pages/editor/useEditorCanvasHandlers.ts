import { useCallback, useEffect } from "react";
import type { MutableRefObject } from "react";
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { toast } from "sonner";
import {
  getDroppedImageFiles,
  loadDroppedImageData,
  MULTI_IMAGE_DROP_GAP,
} from "./droppedImages";
import {
  hasRenderableElements,
  haveSameElements,
  isStaleNonRenderableSnapshot,
  isSuspiciousEmptySnapshot,
} from "./shared";

// Con qué frecuencia sondeamos la API de Excalidraw en busca de archivos
// añadidos tardíamente (p. ej. imágenes pegadas que nunca surgen a través
// de onChange). Se mantiene bien por encima de 1s: la compresión ahora está
// memoizada, así que un intervalo más ajustado solo quema ciclos del hilo
// principal sin ninguna ganancia.
const FILES_POLL_INTERVAL_MS = 2500;

type CanvasHandlerRefs = {
  excalidrawAPI: MutableRefObject<ExcalidrawImperativeAPI | null>;
  hasHydratedInitialScene: MutableRefObject<boolean>;
  hasSceneChangesSinceLoad: MutableRefObject<boolean>;
  initialSceneElements: MutableRefObject<readonly ExcalidrawElement[]>;
  isBootstrappingScene: MutableRefObject<boolean>;
  isSyncing: MutableRefObject<boolean>;
  isUnmounting: MutableRefObject<boolean>;
  lastLocalChangeAt: MutableRefObject<number>;
  latestAppState: MutableRefObject<Partial<AppState> | null>;
  latestElements: MutableRefObject<readonly ExcalidrawElement[]>;
  latestFiles: MutableRefObject<BinaryFiles>;
  debouncedSave: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly ExcalidrawElement[],
        appState: Partial<AppState>,
        files?: BinaryFiles,
      ) => void)
    | null
  >;
  suspiciousBlankLoad: MutableRefObject<boolean>;
};

type UseEditorCanvasHandlersParams = {
  canEdit: boolean;
  debouncedSavePreview: (drawingId: string) => void;
  drawingId: string | undefined;
  emitFilesDeltaIfNeeded: (nextFiles: BinaryFiles) => boolean;
  isReady: boolean;
  refs: CanvasHandlerRefs;
  resolveSafeSnapshot: (candidateSnapshot?: readonly ExcalidrawElement[]) => {
    prevented: boolean;
    staleEmptySnapshot: boolean;
    staleNonRenderableSnapshot: boolean;
  };
  broadcastChanges: (
    elements: readonly ExcalidrawElement[],
    currentFiles?: BinaryFiles,
  ) => void;
};

export const useEditorCanvasHandlers = ({
  canEdit,
  debouncedSavePreview,
  drawingId,
  emitFilesDeltaIfNeeded,
  isReady,
  refs,
  resolveSafeSnapshot,
  broadcastChanges,
}: UseEditorCanvasHandlersParams) => {
  const {
    debouncedSave: debouncedSaveRef,
    excalidrawAPI: excalidrawAPIRef,
    hasHydratedInitialScene: hasHydratedInitialSceneRef,
    hasSceneChangesSinceLoad: hasSceneChangesSinceLoadRef,
    initialSceneElements: initialSceneElementsRef,
    isBootstrappingScene: isBootstrappingSceneRef,
    isSyncing: isSyncingRef,
    isUnmounting: isUnmountingRef,
    lastLocalChangeAt: lastLocalChangeAtRef,
    latestAppState: latestAppStateRef,
    latestElements: latestElementsRef,
    latestFiles: latestFilesRef,
    suspiciousBlankLoad: suspiciousBlankLoadRef,
  } = refs;

  const handleCanvasChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files?: BinaryFiles) => {
      if (!canEdit) return;
      if (isUnmountingRef.current) return;
      if (isSyncingRef.current) return;
      latestAppStateRef.current = appState;
      const currentFiles =
        files || excalidrawAPIRef.current?.getFiles() || {};
      if (Object.keys(currentFiles).length > 0) {
        latestFilesRef.current = currentFiles;
      }
      const allElements = excalidrawAPIRef.current
        ? excalidrawAPIRef.current.getSceneElementsIncludingDeleted()
        : elements;
      if (!hasHydratedInitialSceneRef.current) {
        const matchesInitialSnapshot = haveSameElements(
          allElements,
          initialSceneElementsRef.current,
        );
        const transientHydrationEmpty = isSuspiciousEmptySnapshot(
          initialSceneElementsRef.current,
          allElements,
        );
        const transientHydrationNonRenderable = isStaleNonRenderableSnapshot(
          initialSceneElementsRef.current,
          allElements,
        );
        if (transientHydrationEmpty || transientHydrationNonRenderable) return;
        hasHydratedInitialSceneRef.current = true;
        isBootstrappingSceneRef.current = false;
        if (matchesInitialSnapshot) return;
      }
      const { prevented: preventedCanvasOverwrite } =
        resolveSafeSnapshot(allElements);
      if (preventedCanvasOverwrite) return;
      const hasRenderable = hasRenderableElements(allElements);
      if (hasRenderable && suspiciousBlankLoadRef.current) {
        suspiciousBlankLoadRef.current = false;
      }
      if (isBootstrappingSceneRef.current && !hasRenderable) return;
      latestElementsRef.current = allElements;
      broadcastChanges(allElements, currentFiles);
    },
    [
      broadcastChanges,
      canEdit,
      excalidrawAPIRef,
      hasHydratedInitialSceneRef,
      initialSceneElementsRef,
      isBootstrappingSceneRef,
      isSyncingRef,
      isUnmountingRef,
      latestAppStateRef,
      latestElementsRef,
      latestFilesRef,
      resolveSafeSnapshot,
      suspiciousBlankLoadRef,
    ],
  );

  const handleCanvasDropCapture = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      if (!canEdit || !excalidrawAPIRef.current) return;
      const allDroppedFiles = Array.from(event.dataTransfer?.files || []);
      const droppedImages = getDroppedImageFiles(event.dataTransfer);
      if (
        droppedImages.length <= 1 ||
        droppedImages.length !== allDroppedFiles.length
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const appState = excalidrawAPIRef.current.getAppState?.();
      if (!appState) return;
      try {
        const dropPoint = viewportCoordsToSceneCoords(
          { clientX: event.clientX, clientY: event.clientY },
          appState,
        );
        const loadedImages = await Promise.all(
          droppedImages.map(loadDroppedImageData),
        );
        if (loadedImages.length === 0) return;
        excalidrawAPIRef.current.addFiles(
          loadedImages.map(({ fileId, mimeType, dataURL, created }) => ({
            id: fileId as FileId,
            mimeType: mimeType as BinaryFileData["mimeType"],
            dataURL: dataURL as BinaryFileData["dataURL"],
            created,
          })),
        );
        let nextY = dropPoint.y;
        const imageElements = convertToExcalidrawElements(
          loadedImages.map((image, index) => {
            const y = index === 0 ? dropPoint.y - image.height / 2 : nextY;
            nextY = y + image.height + MULTI_IMAGE_DROP_GAP;
            return {
              type: "image" as const,
              x: dropPoint.x - image.width / 2,
              y,
              width: image.width,
              height: image.height,
              fileId: image.fileId as FileId,
              scale: [1, 1] as [number, number],
              status: "saved" as const,
            };
          }),
        );
        excalidrawAPIRef.current.updateScene({
          elements: [
            ...excalidrawAPIRef.current.getSceneElementsIncludingDeleted(),
            ...imageElements,
          ],
          appState: {
            selectedElementIds: Object.fromEntries(
              imageElements.map((element) => [element.id, true]),
            ),
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      } catch (err) {
        console.error("[Editor] Failed to import dropped images", err);
        toast.error("Failed to import dropped images");
      }
    },
    [canEdit, excalidrawAPIRef],
  );

  useEffect(() => {
    if (!drawingId || !isReady) return;
    const interval = window.setInterval(() => {
      if (isUnmountingRef.current) return;
      if (isSyncingRef.current) return;
      if (!excalidrawAPIRef.current) return;
      const nextFiles = excalidrawAPIRef.current.getFiles?.() || {};
      const didEmit = emitFilesDeltaIfNeeded(nextFiles);
      if (
        didEmit &&
        latestAppStateRef.current &&
        debouncedSaveRef.current
      ) {
        hasSceneChangesSinceLoadRef.current = true;
        lastLocalChangeAtRef.current = Date.now();
        debouncedSaveRef.current(
          drawingId,
          latestElementsRef.current,
          latestAppStateRef.current,
          nextFiles,
        );
        debouncedSavePreview(drawingId);
      }
    }, FILES_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [
    debouncedSavePreview,
    debouncedSaveRef,
    drawingId,
    emitFilesDeltaIfNeeded,
    excalidrawAPIRef,
    hasSceneChangesSinceLoadRef,
    isReady,
    isSyncingRef,
    isUnmountingRef,
    lastLocalChangeAtRef,
    latestAppStateRef,
    latestElementsRef,
  ]);

  return { handleCanvasChange, handleCanvasDropCapture };
};
