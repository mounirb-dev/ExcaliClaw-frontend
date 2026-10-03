/* eslint-disable react-hooks/immutability -- `refs` agrupa referencias mutables creadas con useRef para coordinar acciones del editor. */

import { useCallback, useEffect } from "react";
import type { FormEvent, MutableRefObject } from "react";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, LibraryItem } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as api from "../../api";
import { exportFromEditor } from "../../utils/exportUtils";
import {
  applyUploadedFileRefs,
  getPersistedAppState,
  hasRenderableElements,
} from "./shared";
import type { UploadedFileRefs } from "./shared";
import { saveDrawingKeepalive } from "./keepaliveSave";

type EditorCommandRefs = {
  currentDrawingVersion: MutableRefObject<number | null>;
  excalidrawAPI: MutableRefObject<ExcalidrawImperativeAPI | null>;
  hasSceneChangesSinceLoad: MutableRefObject<boolean>;
  latestFiles: MutableRefObject<BinaryFiles>;
  saveData: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly ExcalidrawElement[],
        appState: Partial<AppState>,
        files?: BinaryFiles,
      ) => Promise<void>)
    | null
  >;
  savePreview: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly ExcalidrawElement[],
        appState: Partial<AppState>,
        files: BinaryFiles,
      ) => Promise<void>)
    | null
  >;
  suspiciousBlankLoad: MutableRefObject<boolean>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
};

type UseEditorCommandsParams = {
  autoHideEnabled: boolean;
  canEdit: boolean;
  debouncedSaveLibrary: (items: LibraryItem[]) => void;
  drawingId: string | undefined;
  drawingName: string;
  isSavingOnLeave: boolean;
  newName: string;
  refs: EditorCommandRefs;
  resolveSafeSnapshot: (candidateSnapshot?: readonly ExcalidrawElement[]) => {
    snapshot: readonly ExcalidrawElement[];
    prevented: boolean;
    staleEmptySnapshot: boolean;
    staleNonRenderableSnapshot: boolean;
  };
  enqueueSceneSave: (
    drawingId: string,
    elements: readonly ExcalidrawElement[],
    appState: Partial<AppState>,
    files?: BinaryFiles,
    options?: { suppressErrors?: boolean },
  ) => Promise<void>;
  setAutoHideEnabled: (enabled: boolean) => void;
  setDrawingName: (name: string) => void;
  setIsHeaderVisible: (visible: boolean) => void;
  setIsRenaming: (isRenaming: boolean) => void;
  setIsSavingOnLeave: (isSaving: boolean) => void;
  setNewName: (name: string) => void;
  user: unknown;
};

/** ¿La escena está vacía del todo: sin elementos vivos ni imágenes? */
const isPristineScene = (excalidrawAPI: ExcalidrawImperativeAPI): boolean => {
  const elements: readonly ExcalidrawElement[] = excalidrawAPI.getSceneElements?.() ?? [];
  const files = excalidrawAPI.getFiles?.() ?? {};
  return elements.length === 0 && Object.keys(files).length === 0;
};

// Nombre con el que el Dashboard crea un dibujo nuevo (ver
// handleCreateDrawing en pages/dashboard/useDashboardDrawingActions.ts).
const DEFAULT_DRAWING_NAME = "Untitled Drawing";

export const useEditorCommands = ({
  autoHideEnabled,
  canEdit,
  debouncedSaveLibrary,
  drawingId,
  drawingName,
  enqueueSceneSave,
  isSavingOnLeave,
  newName,
  refs,
  resolveSafeSnapshot,
  setAutoHideEnabled,
  setDrawingName,
  setIsHeaderVisible,
  setIsRenaming,
  setIsSavingOnLeave,
  setNewName,
  user,
}: UseEditorCommandsParams) => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!canEdit) return;
        if (
          !(
            refs.excalidrawAPI.current &&
            refs.saveData.current &&
            refs.savePreview.current
          )
        ) {
          return;
        }
        if (!drawingId) return;
        const elements =
          refs.excalidrawAPI.current.getSceneElementsIncludingDeleted();
        const { snapshot: safeElements } = resolveSafeSnapshot(elements);
        const appState = refs.excalidrawAPI.current.getAppState();
        const files = refs.excalidrawAPI.current.getFiles() || {};
        refs.latestFiles.current = files;
        try {
          await enqueueSceneSave(drawingId, safeElements, appState, files, {
            suppressErrors: false,
          });
          refs.savePreview.current(drawingId, safeElements, appState, files);
          toast.success("Saved changes to server");
        } catch (err) {
          console.error("Failed to save on Ctrl+S", err);
          // enqueueSceneSave ya muestra su propio toast de conflicto/error;
          // evitar una falsa confirmación de "Guardado" cuando el guardado
          // realmente falló.
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canEdit, drawingId, enqueueSceneSave, refs, resolveSafeSnapshot]);

  useEffect(() => {
    // Vaciar la escena más reciente cuando la pestaña se está ocultando/
    // cerrando. El autoguardado con debounce puede tener ediciones
    // pendientes que de otro modo se perderían; un PUT keepalive sobrevive
    // al unload donde la canalización de guardado normal no puede.
    const handlePageHide = () => {
      if (!canEdit || !drawingId) return;
      const editor = refs.excalidrawAPI.current;
      if (!editor) return;
      if (!refs.hasSceneChangesSinceLoad.current) return;
      const elements = editor.getSceneElementsIncludingDeleted();
      const { snapshot: safeElements } = resolveSafeSnapshot(elements);
      if (
        refs.suspiciousBlankLoad.current &&
        !hasRenderableElements(safeElements)
      ) {
        return;
      }
      const appState = editor.getAppState();
      const files = editor.getFiles() || {};
      saveDrawingKeepalive(drawingId, {
        elements: Array.from(safeElements),
        appState: getPersistedAppState(appState),
        // La misma forma reducida que el guardado con debounce: las
        // imágenes subidas viajan como referencia, las no subidas se
        // quedan en línea (el servidor las interna al recibirlas).
        files: applyUploadedFileRefs(files, refs.uploadedRefs.current),
        version: refs.currentDrawingVersion.current ?? undefined,
      });
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [canEdit, drawingId, refs, resolveSafeSnapshot]);

  const handleRenameSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canEdit || !drawingId) return;
      const trimmed = newName.trim();
      // Nombre vacío o sin cambios: solo cerrar el editor, no guardar nada.
      if (!trimmed || trimmed === drawingName) {
        setIsRenaming(false);
        return;
      }
      const previousName = drawingName;
      // Mostrar el nombre recortado de forma optimista, pero revertir si el
      // guardado falla para que el encabezado nunca diverja de lo que
      // realmente está persistido.
      setDrawingName(trimmed);
      setNewName(trimmed);
      setIsRenaming(false);
      try {
        await api.updateDrawing(drawingId, { name: trimmed });
      } catch (err) {
        console.error("Failed to rename", err);
        setDrawingName(previousName);
        toast.error("Failed to rename drawing");
      }
    },
    [
      canEdit,
      drawingId,
      drawingName,
      newName,
      setDrawingName,
      setIsRenaming,
      setNewName,
    ],
  );

  const handleLibraryChange = useCallback(
    (items: readonly LibraryItem[]) => {
      if (!canEdit || !user) return;
      debouncedSaveLibrary([...items]);
    },
    [canEdit, debouncedSaveLibrary, user],
  );

  const handleBackClick = useCallback(async () => {
    if (isSavingOnLeave) return;
    setIsSavingOnLeave(true);
    let shouldNavigate = false;
    try {
      if (
        !(
          refs.excalidrawAPI.current &&
          refs.saveData.current &&
          refs.savePreview.current
        )
      ) {
        shouldNavigate = true;
      } else if (
        canEdit &&
        drawingId &&
        drawingName === DEFAULT_DRAWING_NAME &&
        isPristineScene(refs.excalidrawAPI.current)
      ) {
        // Dibujo en blanco y sin renombrar: no se guarda, se borra para no
        // acumular filas y objetos de R2 que nadie usa (el Dashboard lo crea
        // en el servidor al pulsar "Nuevo dibujo", antes de que se dibuje
        // nada). El borrado es solo del dueño; si un colaborador recibe 403
        // no pasa nada, el dibujo se queda como estaba.
        try {
          await api.deleteDrawing(drawingId);
        } catch (err) {
          console.error("Failed to discard blank drawing", err);
        }
        shouldNavigate = true;
      } else if (!canEdit || !refs.hasSceneChangesSinceLoad.current) {
        shouldNavigate = true;
      } else if (!drawingId) {
        shouldNavigate = true;
      } else {
        const elements =
          refs.excalidrawAPI.current.getSceneElementsIncludingDeleted();
        const { snapshot: safeElements } = resolveSafeSnapshot(elements);
        const appState = refs.excalidrawAPI.current.getAppState();
        const files = refs.excalidrawAPI.current.getFiles() || {};
        refs.latestFiles.current = files;
        if (
          refs.suspiciousBlankLoad.current &&
          !hasRenderableElements(safeElements)
        ) {
          toast.warning(
            "Blank scene detected on load. Skipping save to protect existing data.",
          );
          shouldNavigate = true;
        } else {
          // Solo la escena bloquea la salida: la miniatura es cosmética (el
          // servidor la invalida en cada guardado y se regenera sola), así
          // que generarla y subirla ya no hace esperar al usuario. Los
          // errores de la miniatura se registran dentro de savePreview.
          void refs.savePreview.current(drawingId, safeElements, appState, files);
          await enqueueSceneSave(drawingId, safeElements, appState, files, {
            suppressErrors: false,
          });
          shouldNavigate = true;
        }
      }
    } catch (err) {
      console.error("Failed to save on back navigation", err);
      toast.error("Failed to save changes. Please retry before leaving.");
    } finally {
      setIsSavingOnLeave(false);
    }
    if (shouldNavigate) navigate("/app");
  }, [
    canEdit,
    drawingId,
    drawingName,
    enqueueSceneSave,
    isSavingOnLeave,
    navigate,
    refs,
    resolveSafeSnapshot,
    setIsSavingOnLeave,
  ]);

  const handleExportClick = useCallback(() => {
    if (!refs.excalidrawAPI.current) return;
    const elements =
      refs.excalidrawAPI.current.getSceneElementsIncludingDeleted();
    const appState = refs.excalidrawAPI.current.getAppState();
    const files = refs.excalidrawAPI.current.getFiles() || {};
    exportFromEditor(drawingName, elements, appState, files);
    toast.success("Drawing exported");
  }, [drawingName, refs]);

  const handleToggleAutoHide = useCallback(() => {
    setAutoHideEnabled(!autoHideEnabled);
    setIsHeaderVisible(true);
  }, [autoHideEnabled, setAutoHideEnabled, setIsHeaderVisible]);

  const handleRenameStart = useCallback(() => {
    if (!canEdit) return;
    setNewName(drawingName);
    setIsRenaming(true);
  }, [canEdit, drawingName, setIsRenaming, setNewName]);

  return {
    handleBackClick,
    handleExportClick,
    handleLibraryChange,
    handleRenameStart,
    handleRenameSubmit,
    handleToggleAutoHide,
  };
};
