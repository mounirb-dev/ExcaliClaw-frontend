import type { useEditorRefs } from "./useEditorRefs";
import type { useEditorPersistence } from "./useEditorPersistence";
import type { useEditorCollaboration } from "./useEditorCollaboration";
import type { useEditorElementTracking } from "./useEditorElementTracking";

type EditorRefs = ReturnType<typeof useEditorRefs> &
  Pick<ReturnType<typeof useEditorPersistence>, "saveDataRef" | "savePreviewRef"> &
  Pick<ReturnType<typeof useEditorCollaboration>, "isSyncing">;
type EditorRefsWithTracking = EditorRefs &
  Pick<ReturnType<typeof useEditorElementTracking>, "elementVersionMap">;

/** Construye el paquete de refs que necesita el hook de persistencia. */
export const buildPersistenceRefs = (
  refs: Pick<EditorRefs, "currentDrawingVersionRef" | "debouncedSaveRef" | "excalidrawAPI" | "isSyncing" | "isUnmounting" | "lastLocalChangeAtRef" | "lastPersistedElementsRef" | "isSaverRef" | "lastPersistedFilesRef" | "lastPersistedSceneSignatureRef" | "lastSyncedFilesRef" | "latestAppStateRef" | "latestElementsRef" | "latestFilesRef" | "saveQueueRef" | "suspiciousBlankLoadRef" | "uploadedFileRefsRef">,
) => ({
  currentDrawingVersion: refs.currentDrawingVersionRef,
  debouncedSave: refs.debouncedSaveRef,
  excalidrawAPI: refs.excalidrawAPI,
  isSyncing: refs.isSyncing,
  isSaver: refs.isSaverRef,
  isUnmounting: refs.isUnmounting,
  lastLocalChangeAt: refs.lastLocalChangeAtRef,
  lastPersistedElements: refs.lastPersistedElementsRef,
  lastPersistedFiles: refs.lastPersistedFilesRef,
  lastPersistedSceneSignature: refs.lastPersistedSceneSignatureRef,
  lastSyncedFiles: refs.lastSyncedFilesRef,
  latestAppState: refs.latestAppStateRef,
  latestElements: refs.latestElementsRef,
  latestFiles: refs.latestFilesRef,
  saveQueue: refs.saveQueueRef,
  suspiciousBlankLoad: refs.suspiciousBlankLoadRef,
  uploadedRefs: refs.uploadedFileRefsRef,
});

/** Construye el paquete de refs que necesita el cargador de escenas. */
export const buildSceneLoaderRefs = (
  refs: Pick<EditorRefsWithTracking, "elementVersionMap" | "saveQueueRef" | "latestElementsRef" | "initialSceneElementsRef" | "latestFilesRef" | "isSyncing" | "lastSyncedFilesRef" | "lastSyncedElementOrderSigRef" | "lastPersistedFilesRef" | "currentDrawingVersionRef" | "lastPersistedElementsRef" | "lastPersistedSceneSignatureRef" | "suspiciousBlankLoadRef" | "hasSceneChangesSinceLoadRef" | "excalidrawAPI" | "latestAppStateRef" | "isBootstrappingScene" | "hasHydratedInitialScene">,
) => ({
  elementVersionMap: refs.elementVersionMap,
  saveQueue: refs.saveQueueRef,
  latestElements: refs.latestElementsRef,
  initialSceneElements: refs.initialSceneElementsRef,
  latestFiles: refs.latestFilesRef,
  isSyncing: refs.isSyncing,
  lastSyncedFiles: refs.lastSyncedFilesRef,
  lastSyncedElementOrderSig: refs.lastSyncedElementOrderSigRef,
  lastPersistedFiles: refs.lastPersistedFilesRef,
  currentDrawingVersion: refs.currentDrawingVersionRef,
  lastPersistedElements: refs.lastPersistedElementsRef,
  lastPersistedSceneSignature: refs.lastPersistedSceneSignatureRef,
  suspiciousBlankLoad: refs.suspiciousBlankLoadRef,
  hasSceneChangesSinceLoad: refs.hasSceneChangesSinceLoadRef,
  excalidrawAPI: refs.excalidrawAPI,
  latestAppState: refs.latestAppStateRef,
  isBootstrappingScene: refs.isBootstrappingScene,
  hasHydratedInitialScene: refs.hasHydratedInitialScene,
});

/** Construye el paquete de refs para los manejadores del canvas. */
export const buildCanvasHandlerRefs = (
  refs: Pick<EditorRefs, "debouncedSaveRef" | "excalidrawAPI" | "hasHydratedInitialScene" | "hasSceneChangesSinceLoadRef" | "initialSceneElementsRef" | "isBootstrappingScene" | "isSyncing" | "isUnmounting" | "lastLocalChangeAtRef" | "latestAppStateRef" | "latestElementsRef" | "latestFilesRef" | "suspiciousBlankLoadRef">,
) => ({
  debouncedSave: refs.debouncedSaveRef,
  excalidrawAPI: refs.excalidrawAPI,
  hasHydratedInitialScene: refs.hasHydratedInitialScene,
  hasSceneChangesSinceLoad: refs.hasSceneChangesSinceLoadRef,
  initialSceneElements: refs.initialSceneElementsRef,
  isBootstrappingScene: refs.isBootstrappingScene,
  isSyncing: refs.isSyncing,
  isUnmounting: refs.isUnmounting,
  lastLocalChangeAt: refs.lastLocalChangeAtRef,
  latestAppState: refs.latestAppStateRef,
  latestElements: refs.latestElementsRef,
  latestFiles: refs.latestFilesRef,
  suspiciousBlankLoad: refs.suspiciousBlankLoadRef,
});

/** Construye el paquete de refs para los comandos del editor. */
export const buildCommandRefs = (
  refs: Pick<EditorRefs, "currentDrawingVersionRef" | "excalidrawAPI" | "hasSceneChangesSinceLoadRef" | "latestFilesRef" | "saveDataRef" | "savePreviewRef" | "suspiciousBlankLoadRef" | "uploadedFileRefsRef">,
) => ({
  currentDrawingVersion: refs.currentDrawingVersionRef,
  excalidrawAPI: refs.excalidrawAPI,
  hasSceneChangesSinceLoad: refs.hasSceneChangesSinceLoadRef,
  latestFiles: refs.latestFilesRef,
  saveData: refs.saveDataRef,
  savePreview: refs.savePreviewRef,
  suspiciousBlankLoad: refs.suspiciousBlankLoadRef,
  uploadedRefs: refs.uploadedFileRefsRef,
});
