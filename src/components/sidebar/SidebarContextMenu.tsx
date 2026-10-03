import React from "react";
import { Edit2, Plus, Share2, Trash2 } from "lucide-react";
import type { Collection } from "../../types";
import { useT } from "../../i18n/useT";

export type SidebarContextMenuState = {
  x: number;
  y: number;
  type: "item" | "background";
  id?: string;
};

interface SidebarContextMenuProps {
  contextMenu: SidebarContextMenuState;
  collections: Collection[];
  onClose: () => void;
  onCreateCollection: () => void;
  onRenameCollection: (collection: Collection) => void;
  onShareCollection: (id: string) => void;
  onDeleteCollection: (id: string) => void;
}

export const SidebarContextMenu: React.FC<SidebarContextMenuProps> = ({
  contextMenu,
  collections,
  onClose,
  onCreateCollection,
  onRenameCollection,
  onShareCollection,
  onDeleteCollection,
}) => {
  const { t } = useT();
  const { id: menuId } = contextMenu;
  return (
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
        className="fixed z-50 bg-white dark:bg-neutral-800 rounded-lg border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
        style={{ top: contextMenu.y, left: contextMenu.x }}
      >
        {contextMenu.type === "item" && menuId ? (
          <>
            <button
              onClick={() => {
                onShareCollection(menuId);
                onClose();
              }}
              className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
            >
              <Share2 size={14} /> {t("ctx.collection.share")}
            </button>
            <button
              onClick={() => {
                const collection = collections.find(
                  (c) => c.id === contextMenu.id,
                );
                if (collection) onRenameCollection(collection);
                onClose();
              }}
              className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
            >
              <Edit2 size={14} /> {t("ctx.collection.rename")}
            </button>
            <button
              onClick={() => {
                onDeleteCollection(menuId);
                onClose();
              }}
              className="w-full px-3 py-2 text-sm text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-2"
            >
              <Trash2 size={14} /> {t("ctx.collection.delete")}
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              onCreateCollection();
              onClose();
            }}
            className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
          >
            <Plus size={14} /> {t("ctx.collection.new")}
          </button>
        )}
      </div>
    </>
  );
};
