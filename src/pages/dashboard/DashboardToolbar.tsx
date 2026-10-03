import React from "react";
import { Search, Upload } from "lucide-react";
import { DrawablyButton, DrawablyInput } from "drawably/react";
import type { DrawingSortField, SortDirection } from "../../api";
import type { Collection } from "../../types";
import { NewDrawingControl } from "./NewDrawingControl";
import { BulkActionsGroup, DeleteCollectionButton, ShareCollectionButton, SortMenu } from "./DashboardToolbarSections";
import { useT } from "../../i18n/useT";

type SortOption = {
  field: DrawingSortField;
  label: string;
  icon: React.ReactNode;
};

type DashboardToolbarProps = {
  search: string;
  searchInputRef: React.RefObject<HTMLInputElement>;
  sortConfig: { field: DrawingSortField; direction: SortDirection };
  sortOptions: SortOption[];
  currentSortOption: SortOption;
  showSortMenu: boolean;
  sortedDrawingsCount: number;
  allSelected: boolean;
  hasSelection: boolean;
  isTrashView: boolean;
  isSharedView: boolean;
  isSharedCollection: boolean;
  currentCollection?: Collection;
  showBulkMoveMenu: boolean;
  selectedCount: number;
  collections: Collection[];
  onSearchChange: (value: string) => void;
  onShowSortMenuChange: (value: boolean) => void;
  onSortFieldChange: (field: DrawingSortField) => void;
  onSortDirectionToggle: () => void;
  onSelectAll: () => void;
  onBulkDeleteClick: () => void;
  onBulkDuplicate: () => void;
  onShowBulkMoveMenuChange: (value: boolean) => void;
  onBulkMove: (collectionId: string | null) => void;
  onImportDrawings: (files: FileList | null) => void;
  onCreateDrawing: () => void;
  onViewerActionError: (message: string) => void;
  onShareCollection?: () => void;
  onDeleteCollection?: () => void;
  exportProgress: { done: number; total: number } | null;
  onBulkExport: (format: "png" | "svg") => void;
};

export const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
  search,
  searchInputRef,
  sortConfig,
  sortOptions,
  currentSortOption,
  showSortMenu,
  sortedDrawingsCount,
  allSelected,
  hasSelection,
  isTrashView,
  isSharedView,
  isSharedCollection,
  currentCollection,
  showBulkMoveMenu,
  selectedCount,
  collections,
  onSearchChange,
  onShowSortMenuChange,
  onSortFieldChange,
  onSortDirectionToggle,
  onSelectAll,
  onBulkDeleteClick,
  onBulkDuplicate,
  onShowBulkMoveMenuChange,
  onBulkMove,
  onImportDrawings,
  onCreateDrawing,
  onViewerActionError,
  onShareCollection,
  onDeleteCollection,
  exportProgress,
  onBulkExport,
}) => {
  const { t } = useT();
  const canModifySelection =
    !isSharedView &&
    (!isSharedCollection || currentCollection?.sharedRole === "edit");

  const handleImportClick = () => {
    if (isSharedCollection && currentCollection?.sharedRole !== "edit") {
      onViewerActionError(t("dashboard.toolbar.viewerCantImport"));
      return;
    }
    document.getElementById("dashboard-import")?.click();
  };

  const canCreateDrawing = () => {
    if (isSharedCollection && currentCollection?.sharedRole !== "edit") {
      onViewerActionError(t("dashboard.toolbar.viewerCantCreate"));
      return false;
    }
    return true;
  };

  return (
    <div className="mb-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
      <div className="flex flex-1 w-full lg:w-auto gap-3 items-center flex-wrap">
        <div className="relative flex-1 group max-w-md transition duration-200 focus-within:-translate-y-0.5">
          <DrawablyInput
            ref={searchInputRef}
            type="text"
            placeholder={t("dashboard.search.placeholder")}
            aria-label={t("dashboard.search.ariaLabel")}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="block w-full"
            style={{ paddingLeft: "2.5rem" }}
          />
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-neutral-500 group-focus-within:text-indigo-500 dark:group-focus-within:text-neutral-300 transition-colors pointer-events-none"
            size={18}
          />
        </div>
        <div className="flex items-center gap-2 p-1 flex-wrap">
          <SortMenu
            sortConfig={sortConfig}
            sortOptions={sortOptions}
            currentSortOption={currentSortOption}
            showSortMenu={showSortMenu}
            onShowSortMenuChange={onShowSortMenuChange}
            onSortFieldChange={onSortFieldChange}
            onSortDirectionToggle={onSortDirectionToggle}
          />
          <ShareCollectionButton
            visible={Boolean(onShareCollection) && Boolean(currentCollection) && currentCollection?.isOwner !== false}
            onShareCollection={() => onShareCollection?.()}
          />
          <DeleteCollectionButton
            visible={Boolean(onDeleteCollection) && Boolean(currentCollection) && currentCollection?.isOwner !== false}
            onDeleteCollection={() => onDeleteCollection?.()}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 w-full lg:w-auto justify-start lg:justify-end flex-wrap">
        <BulkActionsGroup
          sortedDrawingsCount={sortedDrawingsCount}
          allSelected={allSelected}
          hasSelection={hasSelection}
          canModifySelection={canModifySelection}
          isTrashView={isTrashView}
          showBulkMoveMenu={showBulkMoveMenu}
          selectedCount={selectedCount}
          collections={collections}
          onSelectAll={onSelectAll}
          onBulkDeleteClick={onBulkDeleteClick}
          onBulkDuplicate={onBulkDuplicate}
          onShowBulkMoveMenuChange={onShowBulkMoveMenuChange}
          onBulkMove={onBulkMove}
          exportProgress={exportProgress}
          onBulkExport={onBulkExport}
        />
        <input
          type="file"
          multiple
          accept=".json,.excalidraw"
          aria-label={t("dashboard.toolbar.importAriaLabel")}
          className="hidden"
          id="dashboard-import"
          onChange={(event) => {
            onImportDrawings(event.target.files);
            event.target.value = "";
          }}
        />
        <DrawablyButton
          key={t("dashboard.toolbar.import")}
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={handleImportClick}
          disabled={isTrashView || isSharedView}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Upload size={18} strokeWidth={2.5} /> {t("dashboard.toolbar.import")}
          </span>
        </DrawablyButton>
        <NewDrawingControl
          disabled={isTrashView || isSharedView}
          onCreate={onCreateDrawing}
          canCreate={canCreateDrawing}
        />
      </div>
    </div>
  );
};
