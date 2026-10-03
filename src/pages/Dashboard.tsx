import React, { useEffect, useState, useRef } from "react";
import { Layout } from "../components/Layout";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDebounce } from "../hooks/useDebounce";
import { ShareCollectionModal } from "../components/ShareCollectionModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { DashboardConfirmModals } from "./dashboard/DashboardConfirmModals";
import { useUpload } from "../context/UploadContext";
import { DragOverlayPortal } from "./dashboard/shared";
import { DashboardToolbar } from "./dashboard/DashboardToolbar";
import {
  DragPreview,
  DrawingsGrid,
  FileDropOverlay,
  SelectionOverlay,
  ViewerActionToast,
} from "./dashboard/DashboardPanels";
import { useDashboardData } from "./dashboard/useDashboardData";
import { useDashboardCollectionActions } from "./dashboard/useDashboardCollectionActions";
import { useDashboardDrawingActions } from "./dashboard/useDashboardDrawingActions";
import { useDashboardSelection } from "./dashboard/useDashboardSelection";
import { useDashboardSort } from "./dashboard/useDashboardSort";
import { displayFontFamily } from "../utils/displayFont";
import { useT } from "../i18n/useT";
import { Toaster } from "sonner";
import { useDashboardPasteImport } from "./dashboard/useDashboardPasteImport";
import {
  useFileDragState,
  useInfiniteScrollTrigger,
  useSelectedCollection,
  useViewTitle,
} from "./dashboard/useDashboardView";
const PAGE_SIZE = 24;
export const Dashboard: React.FC = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const { selectedCollectionId, setSelectedCollectionId } = useSelectedCollection();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkMoveMenu, setShowBulkMoveMenu] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    sortConfig,
    sortOptions,
    currentSortOption,
    handleSortFieldChange: setSortField,
    handleSortDirectionToggle,
  } = useDashboardSort();
  const { uploadFiles } = useUpload();
  const resetSelection = React.useCallback(() => {
    setSelectedIds(new Set());
  }, []);
  // Panel y carpetas comparten el mismo componente (ver las rutas de App.tsx), así
  // que al cambiar de carpeta hay que reiniciar a mano lo que antes se perdía al
  // remontarse: búsqueda, selección y menús/diálogos abiertos. Sin esto una
  // selección de otra carpeta (que ya no se ve) seguiría activa para borrar o mover.
  useEffect(() => {
    setSearch("");
    setSelectedIds(new Set());
    setShowBulkMoveMenu(false);
    setShareModalOpen(false);
    setCollectionToDelete(null);
    setShowSortMenu(false);
  }, [selectedCollectionId]);
  const {
    drawings,
    setDrawings,
    setDrawingsQuiet,
    collections,
    setCollections,
    setTotalCount,
    isFetchingMore,
    isLoading,
    hasMore,
    refreshData,
    fetchMore,
  } = useDashboardData({
    debouncedSearch,
    selectedCollectionId,
    sortField: sortConfig.field,
    sortDirection: sortConfig.direction,
    pageSize: PAGE_SIZE,
    onRefreshSuccess: resetSelection,
  });
  useInfiniteScrollTrigger(loaderRef, hasMore, fetchMore);
  const { isDraggingFile, handleDragEnter, handleDragLeave, handleDragOver, resetDrag } = useFileDragState();
  // El servidor ya devuelve `drawings` ordenado (sortField/sortDirection se
  // envían en la petición — ver useDashboardData.ts), así que no hace falta
  // un .sort() más aquí; el alias se mantiene solo por claridad en el resto
  // de este archivo.
  const sortedDrawings = drawings;
  const selection = useDashboardSelection({
    drawings: sortedDrawings,
    selectedIds,
    setSelectedIds,
    searchInputRef,
  });
  const handleSortFieldChange = (field: typeof sortConfig.field) => {
    setSortField(field);
    setShowSortMenu(false);
  };
  const actions = useDashboardDrawingActions({
    drawings,
    setDrawings,
    setDrawingsQuiet,
    collections,
    selectedCollectionId,
    selectedIds,
    setSelectedIds,
    setTotalCount,
    uploadFiles,
    refreshData,
    navigate,
  });
  // Ctrl+V con una escena de otra app (Miro, Excalidraw...) crea un dibujo.
  useDashboardPasteImport({
    enabled: !actions.isSharedView && selectedCollectionId !== "trash",
    collectionId: selectedCollectionId === undefined || selectedCollectionId === "shared" ? null : selectedCollectionId,
    onImported: refreshData,
    messages: { imported: t("dashboard.paste.imported"), failed: t("dashboard.paste.failed") },
  });
  const collectionActions = useDashboardCollectionActions({
    selectedCollectionId,
    setSelectedCollectionId,
    setCollections,
    refreshData,
  });
  const viewTitle = useViewTitle(selectedCollectionId, collections, t);
  const visibleCollections = React.useMemo(
    () => collections.filter((c) => c.id !== "trash"),
    [collections],
  );
  return (
    <Layout
      collections={visibleCollections}
      selectedCollectionId={selectedCollectionId}
      onSelectCollection={setSelectedCollectionId}
      onCreateCollection={collectionActions.handleCreateCollection}
      onEditCollection={collectionActions.handleEditCollection}
      onDeleteCollection={collectionActions.handleDeleteCollection}
      onDrop={actions.isSharedView ? undefined : actions.handleDrop}
    >
      {" "}
      <DragPreview drawings={actions.dragPreviewDrawings} />{" "}
      <Toaster position="bottom-center" />
      {selection.isDragSelecting && selection.selectionBounds && (
        <DragOverlayPortal>
          <SelectionOverlay bounds={selection.selectionBounds} />
        </DragOverlayPortal>
      )}{" "}
      <h1
        className="text-3xl sm:text-5xl mb-6 sm:mb-8 text-slate-900 dark:text-white pl-1"
        style={{ fontFamily: displayFontFamily }}
      >
        {" "}
        {viewTitle}{" "}
      </h1>{" "}
      <ViewerActionToast message={actions.viewerActionError} />{" "}
      <DashboardToolbar
        search={search}
        searchInputRef={searchInputRef}
        sortConfig={sortConfig}
        sortOptions={sortOptions}
        currentSortOption={currentSortOption}
        showSortMenu={showSortMenu}
        sortedDrawingsCount={sortedDrawings.length}
        allSelected={selection.allSelected}
        hasSelection={selection.hasSelection}
        isTrashView={actions.isTrashView}
        isSharedView={actions.isSharedView}
        isSharedCollection={actions.isSharedCollection}
        currentCollection={actions.currentCollection}
        showBulkMoveMenu={showBulkMoveMenu}
        selectedCount={selectedIds.size}
        collections={collections}
        onSearchChange={setSearch}
        onShowSortMenuChange={setShowSortMenu}
        onSortFieldChange={handleSortFieldChange}
        onSortDirectionToggle={handleSortDirectionToggle}
        onSelectAll={selection.handleSelectAll}
        onBulkDeleteClick={actions.handleBulkDeleteClick}
        onBulkDuplicate={actions.handleBulkDuplicate}
        onShowBulkMoveMenuChange={setShowBulkMoveMenu}
        onBulkMove={actions.handleBulkMove}
        onImportDrawings={actions.handleImportDrawings}
        onCreateDrawing={actions.handleCreateDrawing}
        onViewerActionError={actions.handleViewerActionError}
        onShareCollection={
          actions.currentCollection ? () => setShareModalOpen(true) : undefined
        }
        onDeleteCollection={
          actions.currentCollection && !actions.isTrashView
            ? () => setCollectionToDelete(actions.currentCollection?.id ?? null)
            : undefined
        }
        exportProgress={actions.exportProgress}
        onBulkExport={(format) =>
          actions.handleBulkExport(format, {
            failedAll: t("dashboard.bulk.exportFailedAll"),
            failedSome: t("dashboard.bulk.exportFailedSome"),
          })
        }
      />{" "}
      <ConfirmModal
        isOpen={Boolean(collectionToDelete)}
        title={t("nav.deleteCollectionTitle")}
        message={t("nav.deleteCollectionMessage")}
        confirmText={t("nav.deleteCollectionTitle")}
        onConfirm={() => {
          if (collectionToDelete) {
            void collectionActions.handleDeleteCollection(collectionToDelete);
            setCollectionToDelete(null);
          }
        }}
        onCancel={() => setCollectionToDelete(null)}
      />{" "}
      {shareModalOpen && actions.currentCollection && (
        <ShareCollectionModal
          key={actions.currentCollection.id}
          collectionId={actions.currentCollection.id}
          collectionName={actions.currentCollection.name}
          onClose={() => setShareModalOpen(false)}
        />
      )}{" "}
      {/* react-doctor-disable-next-line react-doctor/no-static-element-interactions -- false positive: onMouseDown here only tracks a rubber-band drag-select origin over the grid; every actual action (open/select a drawing) lives on real buttons inside DrawingCard, each independently keyboard-reachable. */}
      <div
        className="min-h-full select-none relative"
        onMouseDown={selection.handleMouseDown}
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          resetDrag();
          const target =
            selectedCollectionId === undefined ? null : selectedCollectionId;
          if (actions.isSharedView) return;
          actions.handleDrop(e, target);
        }}
      >
        {" "}
        {isDraggingFile && <FileDropOverlay viewTitle={viewTitle} />}{" "}
        <DrawingsGrid
          drawings={sortedDrawings}
          collections={collections}
          selectedIds={selectedIds}
          search={search}
          isLoading={isLoading}
          isDraggingFile={isDraggingFile}
          isTrashView={actions.isTrashView}
          isSharedView={actions.isSharedView}
          isSharedCollection={actions.isSharedCollection}
          currentCollection={actions.currentCollection}
          onClearSearch={() => setSearch("")}
          onToggleSelection={selection.handleToggleSelection}
          onRename={actions.handleRenameDrawing}
          onDelete={actions.handleDeleteDrawing}
          onHide={actions.handleHideSharedDrawing}
          onDuplicate={actions.handleDuplicateDrawing}
          onMoveToCollection={actions.handleMoveToCollection}
          onOpenDrawing={(id) => navigate(`/app/editor/${id}`)}
          onMouseDown={actions.handleCardMouseDown}
          onDragStart={actions.handleCardDragStart}
          onPreviewGenerated={actions.handlePreviewGenerated}
        />{" "}
        <div
          ref={loaderRef}
          className="py-8 flex justify-center items-center h-20"
        >
          {" "}
          {isFetchingMore && (
            <div className="flex items-center gap-2 text-indigo-600 font-bold animate-in fade-in slide-in-from-bottom-2">
              {" "}
              <Loader2 size={24} className="animate-spin" />{" "}
              <span>Loading more...</span>{" "}
            </div>
          )}{" "}
        </div>{" "}
      </div>{" "}
      <DashboardConfirmModals actions={actions} selectedCount={selectedIds.size} />{" "}
    </Layout>
  );
};
