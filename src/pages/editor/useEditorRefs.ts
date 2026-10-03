import { useRef } from "react";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** All the plain mutable-ref containers ExcalidrawEditor wires through its
 * other hooks. Pulled out of Editor.tsx (a pure declaration block, no
 * logic) to keep that component under react-doctor's giant-component line
 * threshold. */
export const useEditorRefs = () => {
  const isBootstrappingScene = useRef(true);
  const hasHydratedInitialScene = useRef(false);
  const isUnmounting = useRef(false);
  const latestElementsRef = useRef<readonly ExcalidrawElement[]>([]);
  const initialSceneElementsRef = useRef<readonly ExcalidrawElement[]>([]);
  const latestFilesRef = useRef<BinaryFiles>({});
  const lastSyncedFilesRef = useRef<BinaryFiles>({});
  const lastSyncedElementOrderSigRef = useRef<string>("");
  const lastPersistedFilesRef = useRef<BinaryFiles>({});
  // fileId -> URL de referencia almacenada para imágenes subidas vía el endpoint por archivo.
  const uploadedFileRefsRef = useRef<Record<string, string>>({});
  const latestAppStateRef = useRef<Partial<AppState> | null>(null);
  const debouncedSaveRef = useRef<
    | ((
        drawingId: string,
        elements: readonly ExcalidrawElement[],
        appState: Partial<AppState>,
        files?: BinaryFiles,
      ) => void)
    | null
  >(null);
  const currentDrawingVersionRef = useRef<number | null>(null);
  const lastPersistedElementsRef = useRef<readonly ExcalidrawElement[]>([]);
  // react-doctor-disable-next-line react-doctor/rerender-lazy-ref-init -- false positive: Promise.resolve() is a pure-constant call that costs effectively nothing per render (explicitly called out as such in this rule's own docs); the suggested null-guarded lazy-init pattern was tried and reverted because it trips react-doctor/no-ref-current-in-render instead (a mutation-during-render error), despite that rule's own message claiming the pattern is supported.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const suspiciousBlankLoadRef = useRef(false);
  const hasSceneChangesSinceLoadRef = useRef(false);
  const lastLocalChangeAtRef = useRef<number>(0);
  const lastPersistedSceneSignatureRef = useRef<string | null>(null);
  // ¿Este cliente es el que guarda la escena con la cadencia normal? (lo decide la sala, ver
  // DrawingRoom.electSaver). Sin sala o sin socket, siempre sí.
  const isSaverRef = useRef(true);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const excalidrawAPI = useRef<ExcalidrawImperativeAPI | null>(null);

  return {
    isBootstrappingScene,
    hasHydratedInitialScene,
    isUnmounting,
    latestElementsRef,
    initialSceneElementsRef,
    latestFilesRef,
    lastSyncedFilesRef,
    lastSyncedElementOrderSigRef,
    lastPersistedFilesRef,
    uploadedFileRefsRef,
    latestAppStateRef,
    debouncedSaveRef,
    currentDrawingVersionRef,
    lastPersistedElementsRef,
    saveQueueRef,
    suspiciousBlankLoadRef,
    hasSceneChangesSinceLoadRef,
    lastLocalChangeAtRef,
    lastPersistedSceneSignatureRef,
    isSaverRef,
    editorContainerRef,
    excalidrawAPI,
  };
};
