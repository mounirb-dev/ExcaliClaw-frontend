/* eslint-disable react-hooks/immutability -- el estado del editor se coordina mediante refs mutables creados por hooks especializados. */
/* eslint-disable react-hooks/refs -- los builders solo empaquetan refs estables para callbacks y no leen su valor durante el render. */
/* eslint-disable react-hooks/exhaustive-deps -- este hook compone refs estables de hooks propios; añadirlos al array recrearía bundles y reconexiones sin cambiar su identidad. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import * as React from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { getInitialLangCode, toExcalidrawLangCode } from "../../utils/languagePreference";
import type { UserIdentity } from "../../utils/identity";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { usePreference } from "../../context/PreferencesContext";
import { useEditorChrome } from "./useEditorChrome";
import { useEditorAutoHide } from "./useEditorAutoHide";
import { useEditorIdentity } from "./useEditorIdentity";
import { useLibraryImportFromUrl } from "./useLibraryImportFromUrl";
import { useEditorSnapshotGuards } from "./useEditorSnapshotGuards";
import { useEditorSceneLoader } from "./useEditorSceneLoader";
import { useEditorCollaboration } from "./useEditorCollaboration";
import { useEditorPersistence } from "./useEditorPersistence";
import { useEditorCanvasHandlers } from "./useEditorCanvasHandlers";
import { useEditorCommands } from "./useEditorCommands";
import { useEditorElementTracking } from "./useEditorElementTracking";
import { useEditorBroadcast } from "./useEditorBroadcast";
import { useEditorFileUploads } from "./useEditorFileUploads";
import { useEditorSceneApi } from "./useEditorSceneApi";
import { useEditorGridStep } from "./useEditorGridStep";
import { useEditorRefs } from "./useEditorRefs";
import {
  buildPersistenceRefs,
  buildSceneLoaderRefs,
  buildCanvasHandlerRefs,
  buildCommandRefs,
} from "./editorRefBundles";
import { DEFAULT_GRID_STEP } from "../../utils/gridStep";

/** Todo el cableado de hooks de ExcalidrawEditor — refs, colaboración,
 * persistencia, carga de escena, manejadores de canvas, comandos —
 * ensamblado en exactamente las props que EditorView necesita. Extraído de
 * Editor.tsx (que se convierte en un delgado `useExcalidrawEditorState()` +
 * `<EditorView {...state} />`) para mantener ese componente por debajo del
 * umbral de líneas de componente gigante de react-doctor. */
export const useExcalidrawEditorState = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [accessLevel, setAccessLevel] = useState<
    "none" | "view" | "edit" | "owner"
  >("none");
  const canEdit = accessLevel === "edit" || accessLevel === "owner";
  // Hasta saber lo contrario se asume que puede haber más gente en la sala.
  const [liveCollaboration, setLiveCollaboration] = useState(true);
  const [drawingName, setDrawingName] = useState("Drawing Editor");
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [isSceneLoading, setIsSceneLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingOnLeave, setIsSavingOnLeave] = useState(false);
  const { autoHideEnabled, setAutoHideEnabled } = useEditorAutoHide(id);
  const [rawLangCode, setLangCode] = usePreference("language", getInitialLangCode());
  const langCode = toExcalidrawLangCode(rawLangCode);
  const [gridStep, setGridStep] = usePreference("gridStep", DEFAULT_GRID_STEP);
  const { isHeaderVisible, setIsHeaderVisible } = useEditorChrome({
    drawingName,
    autoHideEnabled,
    isRenaming,
  });
  const me: UserIdentity = useEditorIdentity(user);
  const [isReady, setIsReady] = useState(false);
  const {
    computeElementOrderSig,
    elementVersionMap,
    hasElementChanged,
    recordElementVersion,
  } = useEditorElementTracking();
  const {
    isBootstrappingScene,
    hasHydratedInitialScene,
    isUnmounting,
    latestElementsRef,
    initialSceneElementsRef,
    latestFilesRef,
    lastSyncedFilesRef,
    lastSyncedElementOrderSigRef,
    lastPersistedFilesRef,
    lastPersistedSceneSignatureRef,
    isSaverRef,
    uploadedFileRefsRef,
    latestAppStateRef,
    debouncedSaveRef,
    currentDrawingVersionRef,
    lastPersistedElementsRef,
    saveQueueRef,
    suspiciousBlankLoadRef,
    hasSceneChangesSinceLoadRef,
    lastLocalChangeAtRef,
    editorContainerRef,
    excalidrawAPI,
  } = useEditorRefs();
  const { resolveSafeSnapshot, normalizeImageElementStatus } =
    useEditorSnapshotGuards({
      lastPersistedElementsRef,
      initialSceneElementsRef,
      latestElementsRef,
    });
  useEffect(() => {
    isUnmounting.current = false;
    return () => {
      isUnmounting.current = true;
    };
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: isUnmounting is a stable ref returned from useEditorRefs(); the detector only recognizes direct useRef() calls in scope as exempt, not refs passed through a custom hook wrapper.
  }, []);
  const handleSocketAccessDenied = useCallback(() => {
    if (!id || !location.pathname.startsWith("/app/editor/")) return;
    navigate(`/shared/${id}${location.search}${location.hash}`, {
      replace: true,
    });
  }, [id, location.hash, location.pathname, location.search, navigate]);
  // Al abrirse el socket se reenvía lo cambiado mientras no había conexión (lo rellena el
  // efecto de más abajo, una vez existe broadcastChanges).
  const socketOpenHandlerRef = useRef<(() => void) | null>(null);
  const handleSocketOpen = useCallback(() => socketOpenHandlerRef.current?.(), []);
  const { peers, socketMeRef, socketRef, isSyncing, onPointerUpdate, requestConnect } =
    useEditorCollaboration({
      drawingId: id,
      me,
      isReady,
      excalidrawAPI,
      editorContainerRef,
      lastSyncedFilesRef,
      lastSyncedElementOrderSigRef,
      latestElementsRef,
      latestFilesRef,
      computeElementOrderSig,
      recordElementVersion,
      onAccessDenied: handleSocketAccessDenied,
      // Hay (o puede haber) más gente editando: conecta al entrar. Tuyo y sin editores
      // compartidos: solo al interactuar con el dibujo.
      eagerConnect: liveCollaboration,
      isSaverRef,
      onSocketOpen: handleSocketOpen,
    });
  const { scanNow: scanFileUploads } = useEditorFileUploads({
    drawingId: id,
    isReady,
    excalidrawAPI,
    isSyncing,
    latestFiles: latestFilesRef,
    uploadedRefs: uploadedFileRefsRef,
  });
  const { emitFilesDeltaIfNeeded, setExcalidrawAPI } = useEditorSceneApi({
    drawingId: id,
    excalidrawAPIRef: excalidrawAPI,
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
    uploadedRefs: uploadedFileRefsRef,
    scanFileUploads,
    setIsReady,
  });
  const { confirmDialog } = useLibraryImportFromUrl({ excalidrawAPIRef: excalidrawAPI, isReady, user });
  useEditorGridStep({ excalidrawAPI, isReady, gridStep });
  const persistenceRefs = React.useMemo(
    () =>
      buildPersistenceRefs({
        currentDrawingVersionRef,
        debouncedSaveRef,
        excalidrawAPI,
        isSyncing,
        isUnmounting,
        lastLocalChangeAtRef,
        lastPersistedElementsRef,
        isSaverRef,
        lastPersistedFilesRef,
        lastPersistedSceneSignatureRef,
        lastSyncedFilesRef,
        latestAppStateRef,
        latestElementsRef,
        latestFilesRef,
        saveQueueRef,
        suspiciousBlankLoadRef,
        uploadedFileRefsRef,
      }),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: these are stable refs returned from useEditorRefs()/useEditorPersistence(); the detector only recognizes direct useRef() calls in scope as exempt, not refs passed through a custom hook wrapper.
    [isSyncing],
  );
  const {
    autosaveFailing,
    debouncedSave,
    debouncedSaveLibrary,
    debouncedSavePreview,
    enqueueSceneSave,
    saveDataRef,
    savePreviewRef,
  } = useEditorPersistence({
    refs: persistenceRefs,
    user,
    normalizeImageElementStatus,
    resolveSafeSnapshot,
  });
  const markSceneChangedSinceLoad = useCallback(() => {
    hasSceneChangesSinceLoadRef.current = true;
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: hasSceneChangesSinceLoadRef is a stable ref returned from useEditorRefs(); the detector only recognizes direct useRef() calls in scope as exempt, not refs passed through a custom hook wrapper.
  }, []);
  const broadcastChanges = useEditorBroadcast({
    drawingId: id,
    excalidrawAPI,
    lastLocalChangeAtRef,
    lastSyncedElementOrderSigRef,
    lastSyncedFilesRef,
    latestAppStateRef,
    latestFilesRef,
    socketMeRef,
    socketRef,
    requestConnect,
    uploadedRefs: uploadedFileRefsRef,
    debouncedSave,
    debouncedSavePreview,
    computeElementOrderSig,
    hasElementChanged,
    normalizeImageElementStatus,
    recordElementVersion,
    setHasSceneChangesSinceLoad: markSceneChangedSinceLoad,
  });
  useEffect(() => {
    socketOpenHandlerRef.current = () => {
      if (latestElementsRef.current.length > 0 || Object.keys(latestFilesRef.current).length > 0) {
        broadcastChanges(latestElementsRef.current, latestFilesRef.current);
      }
    };
    return () => {
      socketOpenHandlerRef.current = null;
    };
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: latestElementsRef/latestFilesRef son refs estables de useEditorRefs(); el detector no los reconoce a través del hook.
  }, [broadcastChanges]);
  const sceneLoaderRefs = React.useMemo(
    () =>
      buildSceneLoaderRefs({
        elementVersionMap,
        saveQueueRef,
        latestElementsRef,
        initialSceneElementsRef,
        latestFilesRef,
        isSyncing,
        lastSyncedFilesRef,
        lastSyncedElementOrderSigRef,
        lastPersistedFilesRef,
        currentDrawingVersionRef,
        lastPersistedElementsRef,
        lastPersistedSceneSignatureRef,
        suspiciousBlankLoadRef,
        hasSceneChangesSinceLoadRef,
        excalidrawAPI,
        latestAppStateRef,
        isBootstrappingScene,
        hasHydratedInitialScene,
      }),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: these are stable refs returned from useEditorRefs(); the detector only recognizes direct useRef() calls in scope as exempt, not refs passed through a custom hook wrapper.
    [elementVersionMap, isSyncing],
  );
  useEditorSceneLoader({
    id,
    user,
    location,
    navigate,
    refs: sceneLoaderRefs,
    setAccessLevel,
    setLiveCollaboration,
    scheduleRecoverySave: debouncedSave,
    setDrawingName,
    setInitialData,
    setIsReady,
    setIsSceneLoading,
    setLoadError,
    recordElementVersion,
    computeElementOrderSig,
    normalizeImageElementStatus,
  });
  const canvasHandlerRefs = React.useMemo(
    () =>
      buildCanvasHandlerRefs({
        debouncedSaveRef,
        excalidrawAPI,
        hasHydratedInitialScene,
        hasSceneChangesSinceLoadRef,
        initialSceneElementsRef,
        isBootstrappingScene,
        isSyncing,
        isUnmounting,
        lastLocalChangeAtRef,
        latestAppStateRef,
        latestElementsRef,
        latestFilesRef,
        suspiciousBlankLoadRef,
      }),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: these are stable refs returned from useEditorRefs(); the detector only recognizes direct useRef() calls in scope as exempt, not refs passed through a custom hook wrapper.
    [isSyncing],
  );
  const { handleCanvasChange, handleCanvasDropCapture } =
    useEditorCanvasHandlers({
      canEdit,
      debouncedSavePreview,
      drawingId: id,
      emitFilesDeltaIfNeeded,
      isReady,
      refs: canvasHandlerRefs,
      resolveSafeSnapshot,
      broadcastChanges,
    });
  const commandRefs = React.useMemo(
    () =>
      buildCommandRefs({
        currentDrawingVersionRef,
        excalidrawAPI,
        hasSceneChangesSinceLoadRef,
        latestFilesRef,
        saveDataRef,
        savePreviewRef,
        suspiciousBlankLoadRef,
        uploadedFileRefsRef,
      }),
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: these are stable refs returned from useEditorRefs()/useEditorPersistence(); the detector only recognizes direct useRef() calls in scope as exempt, not refs passed through a custom hook wrapper.
    [saveDataRef, savePreviewRef],
  );
  const {
    handleBackClick,
    handleExportClick,
    handleLibraryChange,
    handleRenameStart,
    handleRenameSubmit,
    handleToggleAutoHide,
  } = useEditorCommands({
    autoHideEnabled,
    canEdit,
    debouncedSaveLibrary,
    drawingId: id,
    drawingName,
    enqueueSceneSave,
    isSavingOnLeave,
    newName,
    refs: commandRefs,
    resolveSafeSnapshot,
    setAutoHideEnabled,
    setDrawingName,
    setIsHeaderVisible,
    setIsRenaming,
    setIsSavingOnLeave,
    setNewName,
    user,
  });

  // Historial de versiones: antes de restaurar se cancelan los guardados pendientes (si no, un
  // autoguardado atrasado pisaría la versión restaurada) y las vistas previas necesitan los archivos.
  const prepareVersionRestore = useCallback(() => {
    debouncedSave.cancel();
  }, [debouncedSave]);
  const getEditorFiles = useCallback(() => excalidrawAPI.current?.getFiles() ?? {}, [excalidrawAPI]);

  return {
    id,
    prepareVersionRestore,
    getEditorFiles,
    autoHideEnabled,
    autosaveFailing,
    canEdit,
    drawingName,
    editorContainerRef,
    initialData,
    isHeaderVisible,
    isRenaming,
    isSavingOnLeave,
    isSceneLoading,
    langCode,
    loadError,
    me,
    newName,
    peers,
    theme,
    handleBackClick,
    handleCanvasChange,
    handleCanvasDropCapture,
    handleExportClick,
    handleLibraryChange,
    navigate,
    setNewName,
    onPointerUpdate,
    setIsRenaming,
    handleRenameStart,
    handleRenameSubmit,
    setExcalidrawAPI,
    setLangCode,
    gridStep,
    setGridStep,
    handleToggleAutoHide,
    confirmDialog,
  };
};

