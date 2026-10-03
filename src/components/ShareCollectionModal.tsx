import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Plus, AlertTriangle, RefreshCw, Search } from "lucide-react";
import * as api from "../api";
import type {
  CollectionShareRole,
  CollectionShareRow,
  CollectionShareUser,
} from "../types";
import { useAuth } from "../context/AuthContext";
import { RoleSelect } from "./RoleSelect";
import { SharesList } from "./SharesList";
import { useT } from "../i18n/useT";

type Props = {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
  /** Qué recurso está compartiendo este modal — mismo modelo de compartir
   * con concesión instantánea y misma forma de datos en ambos casos (ver
   * api/collections.ts y DrawingShareRow de api/drawings.ts), solo cambia
   * el conjunto de endpoints. Por defecto es "collection" para que ningún
   * sitio de llamada existente se vea afectado. */
  resourceType?: "collection" | "drawing";
};

// Montado por el padre solo mientras está abierto (ver Dashboard.tsx /
// EditorViewSections.tsx), con clave en el id del recurso, así que cada
// apertura es una instancia nueva con estado nuevo — no hace falta un
// efecto de "resetear el estado del formulario cuando esta prop cambia".
export const ShareCollectionModal: React.FC<Props> = ({
  collectionId,
  collectionName,
  onClose,
  resourceType = "collection",
}) => {
  const { t } = useT();
  const isDrawing = resourceType === "drawing";
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shares, setShares] = useState<CollectionShareRow[]>([]);
  // El propietario real del recurso (puede no ser el visor — un usuario con
  // acceso concedido que abre este modal en un dibujo/colección compartido
  // por otra persona igual necesita ver quién es realmente el propietario,
  // no a sí mismo). Recurre al visor solo hasta que se resuelve la primera
  // carga.
  const [owner, setOwner] = useState<CollectionShareUser | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CollectionShareUser[]>([]);
  const [addRole, setAddRole] = useState<CollectionShareRole>("view");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = isDrawing
        ? await api.getDrawingShares(collectionId)
        : await api.getCollectionShares(collectionId);
      setShares(data.shares);
      setOwner(data.owner);
    } catch (err: unknown) {
      let msg = t("modal.share.errorLoad");
      if (api.isAxiosError(err)) {
        const s = err.response?.data?.message;
        if (typeof s === "string") msg = s;
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [collectionId, isDrawing, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Búsqueda de usuarios con debounce. El backend solo resuelve emails
  // exactos (una búsqueda parcial permitía enumerar el directorio de
  // usuarios), así que no se consulta hasta que parece un email completo.
  useEffect(() => {
    const q = query.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const users = isDrawing
          ? await api.resolveShareUsers(collectionId, q)
          : await api.resolveCollectionShareUsers(collectionId, q);
        if (!cancelled) setResults(users);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, collectionId, isDrawing]);

  const handleAdd = async (u: CollectionShareUser) => {
    setIsLoading(true);
    setError(null);
    try {
      if (isDrawing) await api.addDrawingShare(collectionId, u.email, addRole);
      else await api.addCollectionShare(collectionId, u.email, addRole);
      await refresh();
      setQuery("");
      setResults([]);
    } catch (err: unknown) {
      let msg = t("modal.share.errorAddUser");
      if (api.isAxiosError(err)) {
        const s = err.response?.data?.message ?? err.response?.data?.error;
        if (typeof s === "string") msg = s;
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, val: string) => {
    if (val === "remove") {
      await handleRemove(userId);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (isDrawing) await api.updateDrawingShare(collectionId, userId, val as CollectionShareRole);
      else await api.updateCollectionShare(collectionId, userId, val as CollectionShareRole);
      await refresh();
    } catch {
      setError(t("modal.share.errorUpdateRole"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (isDrawing) await api.removeDrawingShare(collectionId, userId);
      else await api.removeCollectionShare(collectionId, userId);
      await refresh();
    } catch {
      setError(t("modal.share.errorRemoveUser"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={`${t("modal.share.titlePrefix")} "${collectionName}"`}
      className="z-50 m-auto max-w-[500px] w-full p-0 bg-transparent text-slate-900 dark:text-neutral-100 backdrop:bg-neutral-900/20 backdrop:backdrop-blur-sm"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="relative w-full bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] flex flex-col animate-in fade-in zoom-in-95 duration-200">

        {/* Encabezado */}
        <div className="px-6 py-4 flex items-center justify-between border-b-2 border-black dark:border-neutral-700">
          <h2
            className="text-base font-bold text-slate-800 dark:text-neutral-100 truncate pr-4"
            title={collectionName}
          >
            {t("modal.share.titlePrefix")} &quot;{collectionName}&quot;
          </h2>
          <button
            onClick={onClose}
            aria-label={t("modal.common.close")}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 px-6 py-5 space-y-6 overflow-visible">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-3">
              <AlertTriangle size={16} strokeWidth={2} />
              {error}
            </div>
          )}

          {/* Buscador + selector de rol */}
          <section className="relative">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1 group">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                  <Search size={16} strokeWidth={2} />
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("modal.share.searchPlaceholder")}
                  aria-label={t("modal.share.searchAriaLabel")}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 transition text-sm font-semibold placeholder:text-slate-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)]"
                />
              </div>
              {/* Selector de rol para nuevas incorporaciones */}
              <div className="shrink-0 border-2 border-black dark:border-neutral-700 rounded-xl px-1 bg-white dark:bg-neutral-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)]">
                <RoleSelect
                  value={addRole}
                  onChange={(v) => setAddRole(v as CollectionShareRole)}
                />
              </div>
            </div>

            {results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 border-2 border-black dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] overflow-hidden z-[200] animate-in fade-in slide-in-from-top-2">
                {results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleAdd(u)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group border-b last:border-b-0 border-slate-100 dark:border-neutral-800"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs border-2 border-black dark:border-neutral-600">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-neutral-100 truncate">
                        {u.name}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 dark:text-neutral-400 truncate">
                        {u.email}
                      </div>
                    </div>
                    <Plus
                      size={16}
                      className="text-slate-400 group-hover:text-indigo-600 transition-colors"
                      strokeWidth={2}
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <SharesList
            owner={owner ?? user}
            isViewerOwner={owner ? owner.id === user?.id : true}
            shares={shares}
            onRoleChange={handleRoleChange}
          />
        </div>

        {/* Pie de página */}
        <div className="px-6 py-4 flex items-center justify-end border-t-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/50 rounded-b-[14px]">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white border-2 border-black font-bold text-xs hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          >
            {t("modal.share.done")}
          </button>
        </div>

        {/* Overlay de carga */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/20 dark:bg-black/10 backdrop-blur-[1px] flex items-center justify-center z-[300] pointer-events-none rounded-[14px]">
            <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 p-4 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <RefreshCw
                size={24}
                strokeWidth={2.5}
                className="animate-spin text-indigo-600 dark:text-indigo-400"
              />
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};
