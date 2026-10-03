import React from "react";
import { EditorView } from "./editor/EditorView";
import { useExcalidrawEditorState } from "./editor/useExcalidrawEditorState";

export const Editor: React.FC = () => {
  return <ExcalidrawEditor />;
};

const ExcalidrawEditor: React.FC = () => {
  const state = useExcalidrawEditorState();

  return (
    <EditorView
      id={state.id}
      onBeforeVersionRestore={state.prepareVersionRestore}
      getFiles={state.getEditorFiles}
      autoHideEnabled={state.autoHideEnabled}
      autosaveFailing={state.autosaveFailing}
      canEdit={state.canEdit}
      drawingName={state.drawingName}
      editorContainerRef={state.editorContainerRef}
      initialData={state.initialData}
      isHeaderVisible={state.isHeaderVisible}
      isRenaming={state.isRenaming}
      isSavingOnLeave={state.isSavingOnLeave}
      isSceneLoading={state.isSceneLoading}
      langCode={state.langCode}
      loadError={state.loadError}
      me={state.me}
      newName={state.newName}
      peers={state.peers}
      theme={state.theme}
      onBackClick={state.handleBackClick}
      onCanvasChange={state.handleCanvasChange}
      onCanvasDropCapture={state.handleCanvasDropCapture}
      onExportClick={state.handleExportClick}
      onLibraryChange={state.handleLibraryChange}
      onNavigateHome={() => state.navigate("/app")}
      onNewNameChange={state.setNewName}
      onPointerUpdate={state.onPointerUpdate}
      onRenameBlur={() => state.setIsRenaming(false)}
      onRenameStart={state.handleRenameStart}
      onRenameSubmit={state.handleRenameSubmit}
      onSetExcalidrawAPI={state.setExcalidrawAPI}
      onSetLangCode={state.setLangCode}
      gridStep={state.gridStep}
      onSetGridStep={state.setGridStep}
      onToggleAutoHide={state.handleToggleAutoHide}
      confirmDialog={state.confirmDialog}
    />
  );
};
