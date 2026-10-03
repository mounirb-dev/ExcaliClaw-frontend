// Ramas de renderizado independientes extraídas de DashboardToolbar.tsx:
// cada sección posee su propio bloque condicional en vez de que la barra
// de herramientas ramifique en cada combinación dentro de una sola función.
import React from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckSquare,
  ChevronDown,
  Copy,
  Download,
  Folder,
  Inbox,
  Loader2,
  Share2,
  Square,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { DrawablyButton } from "drawably/react";
import type { DrawingSortField, SortDirection } from "../../api";
import type { Collection } from "../../types";
import { useT } from "../../i18n/useT";

type SortOption = {
  field: DrawingSortField;
  label: string;
  icon: React.ReactNode;
};

export const SortMenu: React.FC<{
  sortConfig: { field: DrawingSortField; direction: SortDirection };
  sortOptions: SortOption[];
  currentSortOption: SortOption;
  showSortMenu: boolean;
  onShowSortMenuChange: (value: boolean) => void;
  onSortFieldChange: (field: DrawingSortField) => void;
  onSortDirectionToggle: () => void;
}> = ({
  sortConfig,
  sortOptions,
  currentSortOption,
  showSortMenu,
  onShowSortMenuChange,
  onSortFieldChange,
  onSortDirectionToggle,
}) => {
  const { t } = useT();
  return (
  <>
    <div className="relative">
      <DrawablyButton
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onShowSortMenuChange(!showSortMenu);
        }}
        className="!h-[42px] w-full sm:w-auto sm:min-w-[180px]"
      >
        <span className="flex items-center gap-2 w-full">
          <span className="text-indigo-600 dark:text-indigo-400 flex-shrink-0">
            {currentSortOption.icon}
          </span>
          <span className="whitespace-nowrap flex-1 text-left">
            {currentSortOption.label}
          </span>
          <ChevronDown
            size={16}
            className="text-slate-400 dark:text-neutral-500 flex-shrink-0"
          />
        </span>
      </DrawablyButton>
      {showSortMenu && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="fixed inset-0 z-40 appearance-none border-0 p-0 bg-transparent cursor-default"
            onClick={() => onShowSortMenuChange(false)}
          />
          <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-neutral-800 rounded-lg border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] py-1 min-w-[180px]">
            {sortOptions.map((option) => (
              <button
                key={option.field}
                onClick={(event) => {
                  event.stopPropagation();
                  onSortFieldChange(option.field);
                }}
                className={clsx(
                  "w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors",
                  sortConfig.field === option.field
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold"
                    : "text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 hover:text-indigo-600 dark:hover:text-indigo-400",
                )}
              >
                <span className="text-indigo-600 dark:text-indigo-400">
                  {option.icon}
                </span>
                <span>{option.label}</span>
                {sortConfig.field === option.field && (
                  <span className="ml-auto text-xs">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
    <DrawablyButton
      type="button"
      onClick={onSortDirectionToggle}
      className="!h-[42px] !w-[42px] !px-0"
      title={
        sortConfig.direction === "asc"
          ? t("dashboard.sort.ascending")
          : t("dashboard.sort.descending")
      }
      aria-label={
        sortConfig.direction === "asc"
          ? t("dashboard.sort.ascending")
          : t("dashboard.sort.descending")
      }
    >
      <span className="flex items-center justify-center text-indigo-600 dark:text-indigo-400">
        {sortConfig.direction === "asc" ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
      </span>
    </DrawablyButton>
  </>
  );
};

export const ShareCollectionButton: React.FC<{
  visible: boolean;
  onShareCollection: () => void;
}> = ({ visible, onShareCollection }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <button
      onClick={onShareCollection}
      className={clsx(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition border-2 border-black dark:border-neutral-700 h-[42px] whitespace-nowrap",
        "bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30",
      )}
      title={t("dashboard.share.tooltip")}
    >
      <Share2 size={18} />
      <span>{t("dashboard.share.button")}</span>
    </button>
  );
};

/** Botón visible para eliminar la colección abierta (antes solo existía en
 * el menú contextual de clic derecho de la barra lateral). Solo la dueña
 * puede borrarla; los dibujos pasan a "Sin organizar". */
export const DeleteCollectionButton: React.FC<{
  visible: boolean;
  onDeleteCollection: () => void;
}> = ({ visible, onDeleteCollection }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <DrawablyButton
      type="button"
      tone="danger"
      onClick={onDeleteCollection}
      title={t("dashboard.deleteCollection.tooltip")}
      className="!h-[42px] whitespace-nowrap"
    >
      <span className="flex items-center gap-2">
        <Trash2 size={18} />
        {t("dashboard.deleteCollection.button")}
      </span>
    </DrawablyButton>
  );
};

// Botón de icono compartido por la barra de acciones masivas: componente
// Drawably (trazo a mano) en vez de clases a medida. El hijo va en un <span>
// porque Drawably repinta el contenido del botón y un nodo suelto se perdía.
const BulkIconButton: React.FC<{
  enabled: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ enabled, danger, onClick, title, children }) => (
  <DrawablyButton
    type="button"
    tone={danger ? "danger" : "neutral"}
    onClick={onClick}
    disabled={!enabled}
    title={title}
    aria-label={title}
    className="!h-[42px] !w-[42px] !px-0"
  >
    <span className="flex items-center justify-center">{children}</span>
  </DrawablyButton>
);

const SelectAllButton: React.FC<{
  sortedDrawingsCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
}> = ({ sortedDrawingsCount, allSelected, onSelectAll }) => {
  const { t } = useT();
  return (
    <BulkIconButton
      enabled={sortedDrawingsCount > 0}
      onClick={onSelectAll}
      title={allSelected ? t("dashboard.bulk.deselectAll") : t("dashboard.bulk.selectAll")}
    >
      {allSelected ? <CheckSquare size={20} /> : <Square size={20} />}
    </BulkIconButton>
  );
};

const BulkDeleteButton: React.FC<{
  enabled: boolean;
  isTrashView: boolean;
  onBulkDeleteClick: () => void;
}> = ({ enabled, isTrashView, onBulkDeleteClick }) => {
  const { t } = useT();
  return (
    <BulkIconButton
      enabled={enabled}
      danger
      onClick={onBulkDeleteClick}
      title={isTrashView ? t("dashboard.bulk.deletePermanently") : t("dashboard.bulk.moveToTrash")}
    >
      <Trash2 size={20} />
    </BulkIconButton>
  );
};

const BulkDuplicateButton: React.FC<{ enabled: boolean; onBulkDuplicate: () => void }> = ({
  enabled,
  onBulkDuplicate,
}) => {
  const { t } = useT();
  return (
    <BulkIconButton enabled={enabled} onClick={onBulkDuplicate} title={t("dashboard.bulk.duplicateSelected")}>
      <Copy size={20} />
    </BulkIconButton>
  );
};

const BulkExportMenu: React.FC<{
  enabled: boolean;
  exportProgress: { done: number; total: number } | null;
  onBulkExport: (format: "png" | "svg") => void;
}> = ({ enabled, exportProgress, onBulkExport }) => {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const busy = exportProgress !== null;
  const active = enabled && !busy;
  return (
    <div className="relative">
      <BulkIconButton
        enabled={active}
        onClick={() => active && setOpen((value) => !value)}
        title={
          busy
            ? `${t("dashboard.bulk.exporting")} ${exportProgress.done}/${exportProgress.total}`
            : t("dashboard.bulk.exportSelected")
        }
      >
        {busy ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
      </BulkIconButton>
      {open && active && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="fixed inset-0 z-10 appearance-none border-0 p-0 bg-transparent cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-neutral-800 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] z-50 py-1">
            {(["png", "svg"] as const).map((format) => (
              <button
                key={format}
                onClick={() => {
                  setOpen(false);
                  onBulkExport(format);
                }}
                className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
              >
                <Download size={14} />
                {format === "png" ? t("dashboard.bulk.exportPng") : t("dashboard.bulk.exportSvg")}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const BulkMoveMenu: React.FC<{
  enabled: boolean;
  showBulkMoveMenu: boolean;
  selectedCount: number;
  collections: Collection[];
  onShowBulkMoveMenuChange: (value: boolean) => void;
  onBulkMove: (collectionId: string | null) => void;
}> = ({ enabled, showBulkMoveMenu, selectedCount, collections, onShowBulkMoveMenuChange, onBulkMove }) => {
  const { t } = useT();
  return (
    <div className="relative">
      <BulkIconButton
        enabled={enabled}
        onClick={() => enabled && onShowBulkMoveMenuChange(!showBulkMoveMenu)}
        title={t("dashboard.bulk.moveSelected")}
      >
        <div className="relative">
          <Folder size={20} />
          <ArrowRight
            size={12}
            className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 rounded-full border border-current"
            strokeWidth={3}
          />
        </div>
      </BulkIconButton>
      <BulkMoveOptionsList
        visible={showBulkMoveMenu && enabled}
        selectedCount={selectedCount}
        collections={collections}
        onClose={() => onShowBulkMoveMenuChange(false)}
        onBulkMove={onBulkMove}
      />
    </div>
  );
};

const BulkMoveOptionsList: React.FC<{
  visible: boolean;
  selectedCount: number;
  collections: Collection[];
  onClose: () => void;
  onBulkMove: (collectionId: string | null) => void;
}> = ({ visible, selectedCount, collections, onClose, onBulkMove }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="fixed inset-0 z-10 appearance-none border-0 p-0 bg-transparent cursor-default"
        onClick={onClose}
      />
      <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-neutral-800 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] z-50 py-1 max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
        <div className="px-3 py-2 text-[10px] font-bold uppercase text-slate-400 dark:text-neutral-500 tracking-wider border-b border-slate-100 dark:border-neutral-700 mb-1">
          {t("dashboard.bulk.movePrefix")} {selectedCount} {t("dashboard.bulk.itemsToSuffix")}
        </div>
        <button
          onClick={() => onBulkMove(null)}
          className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <Inbox size={14} /> {t("dashboard.bulk.unorganized")}
        </button>
        {collections
          .filter((collection) => collection.id !== "trash")
          .map((collection) => (
            <button
              key={collection.id}
              onClick={() => onBulkMove(collection.id)}
              className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
            >
              <Folder size={14} />
              <span className="truncate">{collection.name}</span>
            </button>
          ))}
      </div>
    </>
  );
};

export const BulkActionsGroup: React.FC<{
  sortedDrawingsCount: number;
  allSelected: boolean;
  hasSelection: boolean;
  canModifySelection: boolean;
  isTrashView: boolean;
  showBulkMoveMenu: boolean;
  selectedCount: number;
  collections: Collection[];
  onSelectAll: () => void;
  onBulkDeleteClick: () => void;
  onBulkDuplicate: () => void;
  onShowBulkMoveMenuChange: (value: boolean) => void;
  onBulkMove: (collectionId: string | null) => void;
  exportProgress: { done: number; total: number } | null;
  onBulkExport: (format: "png" | "svg") => void;
}> = ({
  sortedDrawingsCount,
  allSelected,
  hasSelection,
  canModifySelection,
  isTrashView,
  showBulkMoveMenu,
  selectedCount,
  collections,
  onSelectAll,
  onBulkDeleteClick,
  onBulkDuplicate,
  onShowBulkMoveMenuChange,
  onBulkMove,
  exportProgress,
  onBulkExport,
}) => {
  const enabled = hasSelection && canModifySelection;
  return (
    <div className="flex items-center gap-2 mr-2">
      <SelectAllButton
        sortedDrawingsCount={sortedDrawingsCount}
        allSelected={allSelected}
        onSelectAll={onSelectAll}
      />
      <BulkDeleteButton enabled={enabled} isTrashView={isTrashView} onBulkDeleteClick={onBulkDeleteClick} />
      <BulkDuplicateButton enabled={enabled && !isTrashView} onBulkDuplicate={onBulkDuplicate} />
      {/* Exportar solo lee: se permite también a quien solo ve (vista
          compartida) y desde la papelera; por eso usa hasSelection y no
          `enabled`. */}
      <BulkExportMenu enabled={hasSelection} exportProgress={exportProgress} onBulkExport={onBulkExport} />
      <BulkMoveMenu
        enabled={enabled}
        showBulkMoveMenu={showBulkMoveMenu}
        selectedCount={selectedCount}
        collections={collections}
        onShowBulkMoveMenuChange={onShowBulkMoveMenuChange}
        onBulkMove={onBulkMove}
      />
    </div>
  );
};
