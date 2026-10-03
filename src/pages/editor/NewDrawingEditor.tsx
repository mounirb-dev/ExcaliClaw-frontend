import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ExcalidrawInitialDataState, ExcalidrawImperativeAPI, LibraryItem } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { toast } from "sonner";
import * as api from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { usePreference } from "../../context/PreferencesContext";
import { getInitialLangCode, toExcalidrawLangCode } from "../../utils/languagePreference";
import { DEFAULT_GRID_STEP } from "../../utils/gridStep";
import { useEditorIdentity } from "./useEditorIdentity";
import { EditorCanvasArea, EditorHeader, Toaster } from "./EditorViewSections";
import { getPersistedAppState } from "./shared";
import { GRID_DISABLED } from "../../utils/gridSize";

const DEFAULT_DRAWING_NAME = "Untitled Drawing";

/** Editor de un dibujo que todavía NO existe en el servidor (/app/editor/new).
 * "Nuevo dibujo" solía crear la fila al instante, antes de que el usuario
 * hiciera nada, y dejaba dibujos en blanco acumulándose (coste de Appwrite +
 * R2). Ahora el dibujo se crea en el momento en que hay algo que guardar: el
 * primer trazo/elemento o el primer nombre puesto. Entonces se hace POST con
 * esa escena y se pasa al editor normal (/app/editor/:id, con `replace` para
 * que "atrás" no vuelva a esta pantalla vacía). Salir sin tocar nada no
 * crea nada. */
export const NewDrawingEditor: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const collectionId = searchParams.get("collection");
  const { theme } = useTheme();
  const { user } = useAuth();
  const me = useEditorIdentity(user);
  const [rawLangCode, setLangCode] = usePreference("language", getInitialLangCode());
  const langCode = toExcalidrawLangCode(rawLangCode);
  const [gridStep, setGridStep] = usePreference("gridStep", DEFAULT_GRID_STEP);
  const [drawingName, setDrawingName] = useState(DEFAULT_DRAWING_NAME);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const excalidrawAPI = useRef<ExcalidrawImperativeAPI | null>(null);
  const creating = useRef(false);
  const latestName = useRef(DEFAULT_DRAWING_NAME);

  // Biblioteca del usuario para el panel de Excalidraw, igual que el editor
  // normal (useEditorSceneLoader). Si falla se sigue con la biblioteca vacía.
  // La escena vacía se pinta ya: la biblioteca llega como promesa y Excalidraw
  // la aplica al resolverse, sin bloquear el primer pintado.
  useEffect(() => {
    const libraryItems = user ? api.getLibrary().catch((): LibraryItem[] => []) : Promise.resolve<LibraryItem[]>([]);
    setInitialData({
      elements: [],
      appState: { viewBackgroundColor: "#ffffff", gridSize: GRID_DISABLED, collaborators: new Map() },
      files: {},
      scrollToContent: true,
      libraryItems,
    });
  }, [user]);

  // Crea el dibujo con la escena actual y salta al editor normal. Una sola
  // vez: `creating` evita un segundo POST si onChange vuelve a disparar
  // mientras la petición está en vuelo.
  const createNow = useCallback(async () => {
    if (creating.current || !excalidrawAPI.current) return;
    creating.current = true;
    try {
      const elements = excalidrawAPI.current.getSceneElementsIncludingDeleted();
      const appState = getPersistedAppState(excalidrawAPI.current.getAppState());
      const files = excalidrawAPI.current.getFiles() || {};
      const { id } = await api.createDrawing(latestName.current, collectionId, { elements, appState, files });
      navigate(`/app/editor/${id}`, { replace: true });
    } catch (err) {
      creating.current = false;
      console.error("Failed to create drawing", err);
      toast.error("Failed to create the drawing");
    }
  }, [collectionId, navigate]);

  const handleCanvasChange = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      if (elements.some((element) => !element.isDeleted)) void createNow();
    },
    [createNow],
  );

  const handleRenameSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = newName.trim();
      setIsRenaming(false);
      if (!trimmed || trimmed === DEFAULT_DRAWING_NAME) return;
      latestName.current = trimmed;
      setDrawingName(trimmed);
      void createNow();
    },
    [createNow, newName],
  );

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-neutral-950 overflow-hidden">
      <EditorHeader
        isHeaderVisible
        isSavingOnLeave={false}
        isRenaming={isRenaming}
        drawingName={drawingName}
        newName={newName}
        canEdit
        autosaveFailing={false}
        autoHideEnabled={false}
        me={me}
        peers={[]}
        onBackClick={() => navigate("/app")}
        onNewNameChange={setNewName}
        onRenameBlur={() => setIsRenaming(false)}
        onRenameStart={() => {
          setNewName(drawingName);
          setIsRenaming(true);
        }}
        onRenameSubmit={handleRenameSubmit}
        onToggleAutoHide={() => { /* sin acción: el editor nuevo no permite ocultar la cabecera */ }}
        onExportClick={() => { /* sin acción: todavía no existe un dibujo exportable */ }}
      />
      <div className="flex-1 w-full relative" style={{ height: "calc(100vh - 4rem)", marginTop: "4rem" }}>
        <EditorCanvasArea
          loadError={null}
          initialData={initialData}
          isSceneLoading={initialData === null}
          theme={theme}
          langCode={langCode}
          canEdit
          gridStep={gridStep}
          onNavigateHome={() => navigate("/app")}
          onCanvasChange={handleCanvasChange}
          onPointerUpdate={() => { /* sin acción: la colaboración empieza tras crear el dibujo */ }}
          onLibraryChange={(items) => {
            // La biblioteca se guarda en la cuenta igual que en el editor
            // normal; sin esto, las bibliotecas precargadas (ya marcadas
            // como cargadas en localStorage) se perderían.
            if (user) void api.updateLibrary([...items]).catch(() => { /* sin acción: la persistencia se reintenta al cambiar */ });
          }}
          onSetExcalidrawAPI={(apiInstance) => {
            excalidrawAPI.current = apiInstance;
          }}
          onSetLangCode={setLangCode}
          onSetGridStep={setGridStep}
        />
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
};
