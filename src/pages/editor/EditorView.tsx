import React from "react";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState, LibraryItems } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { UserIdentity } from "../../utils/identity";
import { EditorCanvasArea, EditorHeader, Toaster } from "./EditorViewSections";

interface Peer extends UserIdentity {
  isActive: boolean;
}

type EditorViewProps = {
  id?: string;
  getFiles: () => BinaryFiles;
  onBeforeVersionRestore: () => void;
  autoHideEnabled: boolean;
  autosaveFailing: boolean;
  canEdit: boolean;
  drawingName: string;
  editorContainerRef: React.RefObject<HTMLDivElement>;
  initialData: ExcalidrawInitialDataState | null;
  isHeaderVisible: boolean;
  isRenaming: boolean;
  isSavingOnLeave: boolean;
  isSceneLoading: boolean;
  langCode: string;
  loadError: string | null;
  me: UserIdentity;
  newName: string;
  peers: Peer[];
  theme: string;
  onBackClick: () => void;
  onCanvasChange: (elements: readonly ExcalidrawElement[], appState: AppState, files?: BinaryFiles) => void;
  onCanvasDropCapture: (event: React.DragEvent<HTMLDivElement>) => void;
  onExportClick: () => void;
  onLibraryChange: (items: LibraryItems) => void;
  onNavigateHome: () => void;
  onNewNameChange: (value: string) => void;
  onPointerUpdate: (payload: { pointer: unknown; button?: unknown }) => void;
  onRenameBlur: () => void;
  onRenameStart: () => void;
  onRenameSubmit: (event: React.FormEvent) => void;
  onSetExcalidrawAPI: (api: ExcalidrawImperativeAPI) => void;
  onSetLangCode: (langCode: string) => void;
  gridStep: number;
  onSetGridStep: (gridStep: number) => void;
  onToggleAutoHide: () => void;
  confirmDialog: React.ReactNode;
};

export const EditorView: React.FC<EditorViewProps> = ({
  id,
  getFiles,
  onBeforeVersionRestore,
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
  onBackClick,
  onCanvasChange,
  onCanvasDropCapture,
  onExportClick,
  onLibraryChange,
  onNavigateHome,
  onNewNameChange,
  onPointerUpdate,
  onRenameBlur,
  onRenameStart,
  onRenameSubmit,
  onSetExcalidrawAPI,
  onSetLangCode,
  gridStep,
  onSetGridStep,
  onToggleAutoHide,
  confirmDialog,
}) => (
  <div className="h-screen flex flex-col bg-white dark:bg-neutral-950 overflow-hidden">
    <EditorHeader
      isHeaderVisible={isHeaderVisible}
      isSavingOnLeave={isSavingOnLeave}
      isRenaming={isRenaming}
      drawingName={drawingName}
      newName={newName}
      id={id}
      getFiles={getFiles}
      onBeforeVersionRestore={onBeforeVersionRestore}
      canEdit={canEdit}
      autosaveFailing={autosaveFailing}
      autoHideEnabled={autoHideEnabled}
      me={me}
      peers={peers}
      onBackClick={onBackClick}
      onNewNameChange={onNewNameChange}
      onRenameBlur={onRenameBlur}
      onRenameStart={onRenameStart}
      onRenameSubmit={onRenameSubmit}
      onToggleAutoHide={onToggleAutoHide}
      onExportClick={onExportClick}
    />
    <div
      ref={editorContainerRef}
      className="flex-1 w-full relative transition duration-300"
      onDropCapture={onCanvasDropCapture}
      style={{
        height: isHeaderVisible ? "calc(100vh - 4rem)" : "100vh",
        marginTop: isHeaderVisible ? "4rem" : "0",
      }}
    >
      <EditorCanvasArea
        loadError={loadError}
        initialData={initialData}
        isSceneLoading={isSceneLoading}
        id={id}
        theme={theme}
        langCode={langCode}
        canEdit={canEdit}
        gridStep={gridStep}
        onNavigateHome={onNavigateHome}
        onCanvasChange={onCanvasChange}
        onPointerUpdate={onPointerUpdate}
        onLibraryChange={onLibraryChange}
        onSetExcalidrawAPI={onSetExcalidrawAPI}
        onSetLangCode={onSetLangCode}
        onSetGridStep={onSetGridStep}
      />
      <Toaster position="bottom-center" />
      {confirmDialog}
    </div>
  </div>
);
