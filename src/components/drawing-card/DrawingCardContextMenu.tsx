import React from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Copy,
  Download,
  EyeOff,
  FolderInput,
  HardDrive,
  Loader2,
  PenTool,
  Trash2,
} from "lucide-react";
import type { Collection, DrawingSummary } from "../../types";
import { CollectionMoveOptions } from "./CollectionMoveOptions";
import { useT } from "../../i18n/useT";

interface DrawingCardContextMenuProps {
  drawing: DrawingSummary;
  collections: Collection[];
  position: { x: number; y: number };
  isTrash: boolean;
  isShared: boolean;
  storageAvailable: boolean;
  isExporting: boolean;
  exportError: string | null;
  showMoveSubmenu: boolean;
  onShowMoveSubmenu: (show: boolean) => void;
  onClose: () => void;
  onRename: () => void;
  onMoveToCollection: (id: string, collectionId: string | null) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onHide?: (id: string) => void;
  onManageStorage: () => void;
  onExport: (e: React.MouseEvent) => Promise<void>;
}

// Cada elemento del menú posee su propia condición de visibilidad y
// devuelve null cuando no aplica, en vez de que el padre ramifique en cada
// combinación — eso era lo que subía la complejidad ciclomática/cognitiva
// del padre.

const RenameMenuItem: React.FC<{
  visible: boolean;
  onRename: () => void;
  t: (key: string) => string;
}> = ({ visible, onRename, t }) => {
  if (!visible) return null;
  return (
    <button
      onClick={onRename}
      className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
    >
      <PenTool size={14} /> {t("ctx.drawing.rename")}
    </button>
  );
};

const MoveToMenuItem: React.FC<{
  visible: boolean;
  collections: Collection[];
  drawing: DrawingSummary;
  showMoveSubmenu: boolean;
  onShowMoveSubmenu: (show: boolean) => void;
  onMoveToCollection: (id: string, collectionId: string | null) => void;
  onClose: () => void;
  t: (key: string) => string;
}> = ({
  visible,
  collections,
  drawing,
  showMoveSubmenu,
  onShowMoveSubmenu,
  onMoveToCollection,
  onClose,
  t,
}) => {
  if (!visible) return null;
  return (
    <div
      className="relative group/move"
      onMouseEnter={() => onShowMoveSubmenu(true)}
      onMouseLeave={() => onShowMoveSubmenu(false)}
    >
      <button className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center justify-between">
        <span className="flex items-center gap-2">
          <FolderInput size={14} /> {t("ctx.drawing.moveTo")}
        </span>
        <ArrowRight size={12} />
      </button>
      {showMoveSubmenu && (
        <div className="absolute left-full top-0 ml-1 w-40 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-lg py-1 max-h-64 overflow-y-auto">
          <CollectionMoveOptions
            collections={collections}
            currentCollectionId={drawing.collectionId}
            drawingId={drawing.id}
            onMoveToCollection={onMoveToCollection}
            onDone={onClose}
            optionClassName="w-full px-3 py-1.5 text-xs text-left flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 truncate"
            selectedClassName="text-neutral-900 dark:text-white font-medium"
            unselectedClassName="text-slate-600 dark:text-neutral-400"
            checkSize={10}
          />
        </div>
      )}
    </div>
  );
};

const DuplicateMenuItem: React.FC<{
  visible: boolean;
  onDuplicate: () => void;
  t: (key: string) => string;
}> = ({ visible, onDuplicate, t }) => {
  if (!visible) return null;
  return (
    <>
      <div className="border-t border-slate-50 dark:border-slate-800 my-1"></div>
      <button
        onClick={onDuplicate}
        className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
      >
        <Copy size={14} /> {t("ctx.drawing.duplicate")}
      </button>
    </>
  );
};

const ManageStorageMenuItem: React.FC<{
  visible: boolean;
  onManageStorage: () => void;
  t: (key: string) => string;
}> = ({ visible, onManageStorage, t }) => {
  if (!visible) return null;
  return (
    <>
      <button
        onClick={onManageStorage}
        className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
      >
        <HardDrive size={14} /> {t("ctx.drawing.manageStorage")}
      </button>
      <div className="border-t border-slate-50 dark:border-slate-800 my-1"></div>
    </>
  );
};

const ExportMenuItem: React.FC<{
  isExporting: boolean;
  exportError: string | null;
  onExport: (e: React.MouseEvent) => Promise<void>;
  t: (key: string) => string;
}> = ({ isExporting, exportError, onExport, t }) => (
  <>
    <button
      onClick={onExport}
      disabled={isExporting}
      className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isExporting ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Download size={14} />
      )}
      {isExporting ? t("ctx.drawing.exporting") : t("ctx.drawing.export")}
    </button>
    {exportError && (
      <div className="px-3 py-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20">
        {exportError}
      </div>
    )}
  </>
);

const DeleteMenuItem: React.FC<{
  visible: boolean;
  onDelete: () => void;
  t: (key: string) => string;
}> = ({ visible, onDelete, t }) => {
  if (!visible) return null;
  return (
    <>
      <div className="border-t border-slate-50 dark:border-slate-800 my-1"></div>
      <button
        onClick={onDelete}
        className="w-full px-3 py-2 text-sm text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-2"
      >
        <Trash2 size={14} /> {t("ctx.drawing.delete")}
      </button>
    </>
  );
};

const HideMenuItem: React.FC<{
  visible: boolean;
  onHide: () => void;
  t: (key: string) => string;
}> = ({ visible, onHide, t }) => {
  if (!visible) return null;
  return (
    <>
      <div className="border-t border-slate-50 dark:border-slate-800 my-1"></div>
      <button
        onClick={onHide}
        className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
      >
        <EyeOff size={14} /> {t("ctx.drawing.hide")}
      </button>
    </>
  );
};

export const DrawingCardContextMenu: React.FC<DrawingCardContextMenuProps> = ({
  drawing,
  collections,
  position,
  isTrash,
  isShared,
  storageAvailable,
  isExporting,
  exportError,
  showMoveSubmenu,
  onShowMoveSubmenu,
  onClose,
  onRename,
  onMoveToCollection,
  onDuplicate,
  onDelete,
  onHide,
  onManageStorage,
  onExport,
}) => {
  const { t } = useT();
  return createPortal(
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="fixed inset-0 z-50 appearance-none border-0 p-0 bg-transparent cursor-default"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-lg py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
        style={{ top: position.y, left: position.x }}
      >
        <RenameMenuItem
          visible={
            !isTrash &&
            (!isShared ||
              drawing.accessLevel === "edit" ||
              drawing.accessLevel === "owner")
          }
          onRename={onRename}
          t={t}
        />
        <MoveToMenuItem
          visible={!isShared}
          collections={collections}
          drawing={drawing}
          showMoveSubmenu={showMoveSubmenu}
          onShowMoveSubmenu={onShowMoveSubmenu}
          onMoveToCollection={onMoveToCollection}
          onClose={onClose}
          t={t}
        />
        <DuplicateMenuItem
          visible={!isShared}
          onDuplicate={() => {
            onDuplicate(drawing.id);
            onClose();
          }}
          t={t}
        />
        <ManageStorageMenuItem
          visible={!isShared && storageAvailable}
          onManageStorage={onManageStorage}
          t={t}
        />
        <ExportMenuItem
          isExporting={isExporting}
          exportError={exportError}
          onExport={onExport}
          t={t}
        />
        <DeleteMenuItem
          visible={!isShared}
          onDelete={() => {
            onDelete(drawing.id);
            onClose();
          }}
          t={t}
        />
        <HideMenuItem
          visible={isShared && Boolean(onHide)}
          onHide={() => {
            onHide?.(drawing.id);
            onClose();
          }}
          t={t}
        />
      </div>
    </>,
    document.body,
  );
};
