// Ramas de renderizado independientes extraídas de EditorView.tsx: la
// barra de encabezado y el área del canvas son dos piezas de UI genuinamente
// separadas con su propia ramificación interna, que era lo que impulsaba la
// complejidad ciclomática/cognitiva de EditorView.
import React from "react";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState, LibraryItems } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { ArrowLeft, ChevronDown, ChevronUp, CloudOff, Download, History, Loader2, Link2, Link2Off, StickyNote, Users } from "lucide-react";
import clsx from "clsx";
import { DrawablyButton } from "drawably/react";
import { toast, Toaster } from "sonner";
import { LanguageSelector } from "../../components/LanguageSelector";
import { GridStepSelector } from "../../components/GridStepSelector";
import type { UserIdentity } from "../../utils/identity";
import { setPublicSharing } from "../../api/drawings";
import { ShareCollectionModal } from "../../components/ShareCollectionModal";
import { VersionHistoryModal } from "../../components/VersionHistoryModal";
import { UIOptions } from "./shared";
import { useT } from "../../i18n/useT";
import { ThemeToggle } from "../../components/ThemeToggle";
import { addStickyNoteAtViewportCenter } from "../../utils/stickyNote";
import { parseClipboardScene } from "../../utils/clipboardScene";

// Bibliotecas de iconos de la comunidad seleccionadas (de
// libraries.excalidraw.com) añadidas vía la propia API updateLibrary() de
// Excalidraw — el mismo mecanismo que sus botones "Add to Excalidraw" y la
// importación por URL ?addLibrary= ya existente en esta app (ver
// useLibraryImportFromUrl.ts). Disparar updateLibrary() activa el callback
// onLibraryChange de Excalidraw exactamente igual que lo haría una edición
// manual de arrastrar y soltar, que esta app ya tiene conectada para
// persistir en la cuenta del usuario — no hace falta una ruta de guardado
// separada aquí.
const CURATED_ICON_LIBRARIES: { label: string; url: string }[] = [
  { label: "Software logos (Redis, Docker, K8s, Postgres...)", url: "https://libraries.excalidraw.com/libraries/drwnio/drwnio.excalidrawlib" },
  { label: "AWS architecture icons", url: "https://libraries.excalidraw.com/libraries/childishgirl/aws-architecture-icons.excalidrawlib" },
  { label: "Azure cloud service icons", url: "https://libraries.excalidraw.com/libraries/youritjang/azure-cloud-services.excalidrawlib" },
];

async function enablePublicLink(drawingId: string) {
  try {
    await setPublicSharing(drawingId, true);
    const url = `${window.location.origin}/view/${drawingId}`;
    await navigator.clipboard.writeText(url).catch(() => { /* sin acción: copiar es opcional */ });
    toast.success("Public link enabled — copied to clipboard", { description: url });
  } catch {
    toast.error("Failed to enable the public link");
  }
}

async function disablePublicLink(drawingId: string) {
  try {
    await setPublicSharing(drawingId, false);
    toast.success("Public link disabled");
  } catch {
    toast.error("Failed to disable the public link");
  }
}

const CURATED_LIBRARIES_FLAG = "excaliclaw:curated-libraries-v1";

// Carga las bibliotecas de arriba como items "published" — que es lo que
// Excalidraw muestra en la sección "Excalidraw Library" del panel de
// biblioteca (antes salía siempre vacía: "No items added yet"). Una sola vez
// por navegador (bandera en localStorage) para que, si alguien borra items a
// mano, no reaparezcan en cada apertura. Silencioso: sin toasts ni abrir el
// panel. updateLibrary dispara onLibraryChange, que ya persiste la
// biblioteca en la cuenta.
async function loadCuratedLibraries(api: ExcalidrawImperativeAPI) {
  try {
    if (localStorage.getItem(CURATED_LIBRARIES_FLAG)) return;
  } catch {
    // localStorage bloqueado: se intenta igual, solo puede repetirse.
  }
  // En paralelo: son tres descargas independientes.
  const results = await Promise.all(
    CURATED_ICON_LIBRARIES.map(async (lib) => {
      try {
        const response = await fetch(lib.url, { credentials: "omit" });
        if (!response.ok) throw new Error(response.statusText);
        const blob = await response.blob();
        await api.updateLibrary({ libraryItems: blob, merge: true, defaultStatus: "published" });
        return true;
      } catch (err) {
        console.error("[Editor] Failed to load curated library:", lib.label, err);
        return false;
      }
    }),
  );
  const loaded = results.filter(Boolean).length;
  if (loaded === CURATED_ICON_LIBRARIES.length) {
    try {
      localStorage.setItem(CURATED_LIBRARIES_FLAG, "1");
    } catch {
      // ignorar
    }
  }
}

interface Peer extends UserIdentity {
  isActive: boolean;
}

export const UserAvatar = ({
  user,
  label,
  inactive = false,
}: {
  user: UserIdentity;
  label: string;
  inactive?: boolean;
}) => (
  <div className="relative group">
    <div
      className={clsx(
        "w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm transition duration-300",
        inactive && "opacity-30 grayscale",
      )}
      style={{ backgroundColor: user.color }}
    >
      {user.initials}
    </div>
    <div className="absolute top-full mt-2 right-0 bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
      {label}
    </div>
  </div>
);

// Botones de la barra del editor: mismo alto que los del dashboard (Drawably),
// ajustado a la barra de 64px. Solo icono: cuadrado; con texto: ancho libre.
const HEADER_BUTTON = "!h-[38px] whitespace-nowrap";
const HEADER_ICON_BUTTON = "!h-[38px] !w-[38px] !px-0";

const BackButton: React.FC<{ isSavingOnLeave: boolean; onBackClick: () => void }> = ({
  isSavingOnLeave,
  onBackClick,
}) => {
  const { t } = useT();
  return (
    <DrawablyButton
      type="button"
      onClick={onBackClick}
      disabled={isSavingOnLeave}
      aria-label={t("editor.backToDashboard")}
      className={isSavingOnLeave ? HEADER_BUTTON : HEADER_ICON_BUTTON}
    >
      <span className="flex items-center justify-center gap-2">
        {isSavingOnLeave ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>{t("editor.savingChanges")}</span>
          </>
        ) : (
          <ArrowLeft size={18} />
        )}
      </span>
    </DrawablyButton>
  );
};

const DrawingTitle: React.FC<{
  isRenaming: boolean;
  drawingName: string;
  newName: string;
  onNewNameChange: (value: string) => void;
  onRenameBlur: () => void;
  onRenameStart: () => void;
  onRenameSubmit: (event: React.FormEvent) => void;
}> = ({ isRenaming, drawingName, newName, onNewNameChange, onRenameBlur, onRenameStart, onRenameSubmit }) => {
  if (isRenaming) {
    return (
      <form onSubmit={onRenameSubmit}>
        <input
          autoFocus
          type="text"
          aria-label="Drawing name"
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
          onBlur={onRenameBlur}
          className="font-medium text-gray-900 dark:text-white bg-transparent px-2 py-1 border-2 border-indigo-500 rounded-md outline-none min-w-[200px]"
          style={{ width: `${Math.max(200, newName.length * 9 + 20)}px` }}
        />
      </form>
    );
  }
  return (
    <h1
      className="font-medium text-gray-900 dark:text-white px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded cursor-text"
      onDoubleClick={onRenameStart}
    >
      {drawingName}
    </h1>
  );
};

const AutosaveFailingBadge: React.FC<{ visible: boolean }> = ({ visible }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 border border-red-200 dark:border-red-800"
      title={t("editor.unsavedChangesTooltip")}
      role="status"
    >
      <CloudOff size={14} />
      {t("editor.unsavedChanges")}
    </span>
  );
};

const ReadOnlyBadge: React.FC<{ visible: boolean }> = ({ visible }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
      {t("editor.readOnly")}
    </span>
  );
};

/** Compartir con un clic para un solo dibujo — habilita el enlace público
 * sin login (ver setPublicSharing/getPublicDrawing en api/drawings.ts y
 * GET/POST /drawings/:id/public en el Worker) y lo copia. Antes esta
 * capacidad solo vivía dentro del menú hamburguesa principal como dos
 * elementos separados "Enable"/"Disable"; esta es la misma acción expuesta
 * como un botón visible en el encabezado para que compartir un dibujo no
 * requiera rebuscar en un menú. */
const ShareButton: React.FC<{ id?: string; visible: boolean }> = ({ id, visible }) => {
  const { t } = useT();
  const [busy, setBusy] = React.useState(false);
  if (!visible || !id) return null;

  const handleShare = async () => {
    setBusy(true);
    try {
      await setPublicSharing(id, true);
      const url = `${window.location.origin}/view/${id}`;
      await navigator.clipboard.writeText(url).catch(() => { /* sin acción: copiar es opcional */ });
      toast.success("Link copied — anyone with it can view this drawing", { description: url });
    } catch {
      toast.error("Failed to create the share link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawablyButton
      type="button"
      onClick={handleShare}
      disabled={busy}
      className={HEADER_BUTTON}
      title={t("editor.shareTooltip")}
    >
      <span className="flex items-center gap-1.5">
        <Link2 size={16} />
        {busy ? t("editor.sharing") : t("editor.share")}
      </span>
    </DrawablyButton>
  );
};

/** Compartir con usuario nombrado para este dibujo en concreto — reutiliza
 * exactamente el mismo modal con el que ya se comparten colecciones
 * (ShareCollectionModal, ahora generalizado vía resourceType="drawing") en
 * vez de construir una UI paralela, ya que el modelo subyacente (permisos
 * read()/update() de concesión instantánea) y la forma de datos son
 * idénticos entre los dos recursos — ver DrawingShareRow de drawings.ts y
 * las rutas /drawings/:id/shares del backend. */
const ShareWithUsersButton: React.FC<{ id?: string; name: string; visible: boolean }> = ({ id, name, visible }) => {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  if (!visible || !id) return null;

  return (
    <>
      <DrawablyButton
        type="button"
        onClick={() => setOpen(true)}
        className={HEADER_BUTTON}
        title={t("editor.shareWithPeopleTooltip")}
      >
        <span className="flex items-center gap-1.5">
          <Users size={16} />
          {t("editor.people")}
        </span>
      </DrawablyButton>
      {open && (
        <ShareCollectionModal
          resourceType="drawing"
          collectionId={id}
          collectionName={name}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

/** Historial de versiones: lista las instantáneas que conserva el plan del dueño y permite restaurar
 * (solo con permiso de edición; quien solo puede ver, las ve pero no las restaura). */
const VersionHistoryButton: React.FC<{
  id?: string;
  getFiles: () => BinaryFiles;
  onBeforeRestore: () => void;
}> = ({ id, getFiles, onBeforeRestore }) => {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  if (!id) return null;

  return (
    <>
      <DrawablyButton
        type="button"
        onClick={() => setOpen(true)}
        className={HEADER_BUTTON}
        title={t("editor.versionHistoryTooltip")}
      >
        <span className="flex items-center gap-1.5">
          <History size={16} />
          {t("editor.versionHistory")}
        </span>
      </DrawablyButton>
      {open && (
        <VersionHistoryModal
          drawingId={id}
          getFiles={getFiles}
          onBeforeRestore={onBeforeRestore}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

export const EditorHeader: React.FC<{
  id?: string;
  /** Con ambos, la cabecera muestra el historial de versiones (no existe en un dibujo aún sin crear). */
  getFiles?: () => BinaryFiles;
  onBeforeVersionRestore?: () => void;
  isHeaderVisible: boolean;
  isSavingOnLeave: boolean;
  isRenaming: boolean;
  drawingName: string;
  newName: string;
  canEdit: boolean;
  autosaveFailing: boolean;
  autoHideEnabled: boolean;
  me: UserIdentity;
  peers: Peer[];
  onBackClick: () => void;
  onNewNameChange: (value: string) => void;
  onRenameBlur: () => void;
  onRenameStart: () => void;
  onRenameSubmit: (event: React.FormEvent) => void;
  onToggleAutoHide: () => void;
  onExportClick: () => void;
}> = ({
  id,
  getFiles,
  onBeforeVersionRestore,
  isHeaderVisible,
  isSavingOnLeave,
  isRenaming,
  drawingName,
  newName,
  canEdit,
  autosaveFailing,
  autoHideEnabled,
  me,
  peers,
  onBackClick,
  onNewNameChange,
  onRenameBlur,
  onRenameStart,
  onRenameSubmit,
  onToggleAutoHide,
  onExportClick,
}) => {
  const { t } = useT();
  return (
  <header
    className={clsx(
      "h-16 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 flex items-center px-4 justify-between z-10 fixed top-0 left-0 right-0 transition-transform duration-300",
      isHeaderVisible ? "translate-y-0" : "-translate-y-full",
    )}
  >
    <div className="flex items-center gap-4">
      <BackButton isSavingOnLeave={isSavingOnLeave} onBackClick={onBackClick} />
      <DrawingTitle
        isRenaming={isRenaming}
        drawingName={drawingName}
        newName={newName}
        onNewNameChange={onNewNameChange}
        onRenameBlur={onRenameBlur}
        onRenameStart={onRenameStart}
        onRenameSubmit={onRenameSubmit}
      />
    </div>
    <div className="flex items-center gap-3">
      <AutosaveFailingBadge visible={canEdit && autosaveFailing} />
      <ReadOnlyBadge visible={!canEdit} />
      {/* Historial de versiones por dibujo (retención según el plan del dueño), compartir con
          personas concretas y compartir por enlace público de solo lectura (un solo clic). */}
      {getFiles && onBeforeVersionRestore && (
        <VersionHistoryButton id={id} getFiles={getFiles} onBeforeRestore={onBeforeVersionRestore} />
      )}
      <ShareWithUsersButton id={id} name={drawingName} visible={canEdit} />
      <ShareButton id={id} visible={canEdit} />
      <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
      <DrawablyButton
        type="button"
        onClick={onToggleAutoHide}
        className={HEADER_ICON_BUTTON}
        title={autoHideEnabled ? t("editor.disableAutoHide") : t("editor.enableAutoHide")}
        aria-label={autoHideEnabled ? t("editor.disableAutoHide") : t("editor.enableAutoHide")}
      >
        <span className="flex items-center justify-center">
          {autoHideEnabled ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </DrawablyButton>
      <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
      <ThemeToggle className="w-3 h-3" />
      <DrawablyButton
        type="button"
        onClick={onExportClick}
        className={HEADER_ICON_BUTTON}
        title={t("editor.exportDrawing")}
        aria-label={t("editor.exportDrawing")}
      >
        <span className="flex items-center justify-center">
          <Download size={18} />
        </span>
      </DrawablyButton>
      <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
      <div className="flex items-center">
        <UserAvatar user={me} label={`${me.name} ${t("editor.youSuffix")}`} />
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2" />
        <div className="flex items-center gap-2">
          {peers.map((peer) => (
            <UserAvatar key={peer.id} user={peer} label={peer.name} inactive={!peer.isActive} />
          ))}
        </div>
      </div>
    </div>
  </header>
  );
};

export const EditorCanvasArea: React.FC<{
  loadError: string | null;
  initialData: ExcalidrawInitialDataState | null;
  isSceneLoading: boolean;
  id?: string;
  theme: string;
  langCode: string;
  canEdit: boolean;
  gridStep: number;
  onNavigateHome: () => void;
  onCanvasChange: (elements: readonly ExcalidrawElement[], appState: AppState, files?: BinaryFiles) => void;
  onPointerUpdate: (payload: { pointer: unknown; button?: unknown }) => void;
  onLibraryChange: (items: LibraryItems) => void;
  onSetExcalidrawAPI: (api: ExcalidrawImperativeAPI) => void;
  onSetLangCode: (langCode: string) => void;
  onSetGridStep: (gridStep: number) => void;
}> = ({
  loadError,
  initialData,
  isSceneLoading,
  id,
  theme,
  langCode,
  canEdit,
  gridStep,
  onNavigateHome,
  onCanvasChange,
  onPointerUpdate,
  onLibraryChange,
  onSetExcalidrawAPI,
  onSetLangCode,
  onSetGridStep,
}) => {
  const { t } = useT();
  const apiRef = React.useRef<ExcalidrawImperativeAPI | null>(null);
  const handleSetApi = React.useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api;
      onSetExcalidrawAPI(api);
      if (api) void loadCuratedLibraries(api);
    },
    [onSetExcalidrawAPI],
  );

  // Ctrl+V con una escena de otra app (export de Miro, JSON de Excalidraw
  // de otra instancia...): se añaden sus elementos al lienzo y se encuadran.
  // Lo que no es una escena reconocida (texto, imágenes, elementos de
  // Excalidraw copiados dentro de la app) sigue el pegado normal de
  // Excalidraw: devolver true.
  const handlePaste = React.useCallback(
    (data: { text?: string }) => {
      const api = apiRef.current;
      if (!canEdit || !api || !data?.text) return true;
      const scene = parseClipboardScene(data.text);
      if (!scene) return true;
      const existing = api.getSceneElementsIncludingDeleted();
      api.updateScene({ elements: [...existing, ...scene.elements] });
      if (Object.keys(scene.files).length > 0) api.addFiles(Object.values(scene.files));
      api.scrollToContent(scene.elements, { fitToViewport: true, animate: true });
      return false;
    },
    [canEdit],
  );

  if (loadError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950 px-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t("editor.unableToOpen")}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{loadError}</p>
        </div>
        <button
          onClick={onNavigateHome}
          className="px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
        >
          {t("editor.backToDashboard")}
        </button>
      </div>
    );
  }

  if (!initialData) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
        <span className="text-sm font-medium">
          {isSceneLoading ? t("editor.loadingDrawing") : t("editor.preparingCanvas")}
        </span>
      </div>
    );
  }

  return (
    <>
    {/* Sin "Web Embed" (Excalidraw no ofrece prop para quitarlo, de ahí el
        CSS) ni "Generate → Mermaid" (aiEnabled={false}). */}
    <style>{'[data-testid="toolbar-embeddable"]{display:none!important}'}</style>
    <Excalidraw
      key={id}
      aiEnabled={false}
      theme={theme === "dark" ? "dark" : "light"}
      langCode={langCode}
      initialData={initialData}
      onChange={onCanvasChange}
      onPaste={handlePaste}
      onPointerUpdate={onPointerUpdate}
      onLibraryChange={onLibraryChange}
      excalidrawAPI={handleSetApi}
      UIOptions={UIOptions}
      viewModeEnabled={!canEdit}
    >
      <MainMenu>
        <MainMenu.DefaultItems.ToggleTheme />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.DefaultItems.Help />
        <MainMenu.Separator />
        {canEdit && (
          <MainMenu.Item
            icon={<StickyNote size={16} />}
            onSelect={() => apiRef.current && addStickyNoteAtViewportCenter(apiRef.current)}
          >
            {t("editor.addStickyNoteMenu")}
          </MainMenu.Item>
        )}
        <MainMenu.Separator />
        {canEdit && id && (
          <>
            <MainMenu.Item icon={<Link2 size={16} />} onSelect={() => enablePublicLink(id)}>
              {t("editor.enablePublicLinkMenu")}
            </MainMenu.Item>
            <MainMenu.Item icon={<Link2Off size={16} />} onSelect={() => disablePublicLink(id)}>
              {t("editor.disablePublicLinkMenu")}
            </MainMenu.Item>
            <MainMenu.Separator />
          </>
        )}
        <MainMenu.ItemCustom>
          <GridStepSelector gridStep={gridStep} onChange={onSetGridStep} />
        </MainMenu.ItemCustom>
        <MainMenu.ItemCustom>
          <LanguageSelector langCode={langCode} onChange={onSetLangCode} />
        </MainMenu.ItemCustom>
      </MainMenu>
    </Excalidraw>
    </>
  );
};

export { Toaster };
