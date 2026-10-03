import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RefreshCw,
  Scissors,
  Trash2,
  Loader2,
  CheckCircle,
  AlertTriangle,
  HardDrive,
} from 'lucide-react';
import clsx from 'clsx';
import {
  getFilesDiff,
  trimDrawing,
  deleteOrphanFiles,
  type FilesDiffResult,
  type FileDiffEntry,
} from '../api';
import { useT } from '../i18n/useT';

interface StorageManageModalProps {
  drawingId: string;
  drawingName: string;
  onClose: () => void;
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '\u2014';
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function StatusIcon({ active, present }: { active?: boolean; present: boolean }) {
  const { t } = useT();
  if (active) {
    return <span className="text-emerald-600 dark:text-emerald-400 font-bold" title={t("modal.storage.statusActive")}>{'\u2713'}</span>;
  }
  if (present) {
    return <span className="text-amber-500 dark:text-amber-400 font-bold" title={t("modal.storage.statusHistoryOnly")}>{'\u25D0'}</span>;
  }
  return <span className="text-neutral-400 dark:text-neutral-500 font-bold" title={t("modal.storage.statusMissing")}>{'\u2717'}</span>;
}

function FileComparisonSection({
  loading,
  diffData,
  selectedIds,
  onRefresh,
  onToggleFile,
  onDeleteOrphansClick,
}: {
  loading: boolean;
  diffData: FilesDiffResult | null;
  selectedIds: Set<string>;
  onRefresh: () => void;
  onToggleFile: (fileId: string) => void;
  onDeleteOrphansClick: () => void;
}) {
  const { t } = useT();
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          {t("modal.storage.fileComparison")}
        </h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[1px_1px_0px_0px_rgba(255,255,255,0.08)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition duration-200 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={14} className={clsx(loading && 'animate-spin')} />
          {t("modal.storage.refresh")}
        </button>
      </div>

      {loading && !diffData ? (
        <div className="flex items-center justify-center py-12 text-neutral-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : diffData ? (
        <>
          {/* Resumen */}
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">
            {t("modal.storage.canvasRefs")}: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{diffData.summary.totalCanvasRefs}</span>
            {' \u00B7 '}{t("modal.storage.sqlite")}: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{diffData.summary.totalSqliteFiles}</span>
            {' \u00B7 '}{t("modal.storage.s3")}: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{diffData.summary.totalS3Files}</span>
          </p>

          {/* Tabla */}
          <div className="border-2 border-black dark:border-neutral-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-100 dark:bg-neutral-800 border-b-2 border-black dark:border-neutral-700">
                    <th className="w-10 px-3 py-2 text-center">
                      <span className="sr-only">{t("modal.storage.colSelect")}</span>
                    </th>
                    <th className="px-3 py-2 text-left font-bold text-neutral-700 dark:text-neutral-300">{t("modal.storage.colFileId")}</th>
                    <th className="px-3 py-2 text-center font-bold text-neutral-700 dark:text-neutral-300">{t("modal.storage.colCanvas")}</th>
                    <th className="px-3 py-2 text-center font-bold text-neutral-700 dark:text-neutral-300">{t("modal.storage.colSqlite")}</th>
                    <th className="px-3 py-2 text-center font-bold text-neutral-700 dark:text-neutral-300">{t("modal.storage.colS3")}</th>
                    <th className="px-3 py-2 text-right font-bold text-neutral-700 dark:text-neutral-300">{t("modal.storage.colSize")}</th>
                  </tr>
                </thead>
                <tbody>
                  {diffData.files.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-neutral-400">
                        {t("modal.storage.noFilesFound")}
                      </td>
                    </tr>
                  ) : (
                    diffData.files.map((file: FileDiffEntry) => (
                      <tr
                        key={file.fileId}
                        className="border-t border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(file.fileId)}
                            disabled={file.inCanvasActive}
                            onChange={() => onToggleFile(file.fileId)}
                            aria-label={`${t("modal.storage.selectFilePrefix")} ${file.fileId} ${t("modal.storage.selectFileSuffix")}`}
                            className="accent-rose-600 w-4 h-4 disabled:opacity-30"
                          />
                        </td>
                        <td className="px-3 py-2 text-neutral-900 dark:text-neutral-100 font-mono text-xs truncate max-w-[200px]" title={file.fileId}>
                          {file.fileId}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <StatusIcon active={file.inCanvasActive} present={file.inCanvas} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <StatusIcon present={file.inSqlite} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <StatusIcon present={file.inS3} />
                        </td>
                        <td className="px-3 py-2 text-right text-neutral-600 dark:text-neutral-400 tabular-nums">
                          {formatSize(file.s3SizeBytes)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leyenda */}
          <div className="flex gap-4 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span><span className="text-emerald-600 dark:text-emerald-400 font-bold">{'\u2713'}</span> {t("modal.storage.legendActive")}</span>
            <span><span className="text-amber-500 dark:text-amber-400 font-bold">{'\u25D0'}</span> {t("modal.storage.legendHistoryOnly")}</span>
            <span><span className="text-neutral-400 dark:text-neutral-500 font-bold">{'\u2717'}</span> {t("modal.storage.legendMissing")}</span>
          </div>

          {/* Botón de eliminar huérfanos */}
          <div className="mt-4">
            <button
              onClick={onDeleteOrphansClick}
              disabled={selectedIds.size === 0}
              className="px-4 py-2.5 font-bold rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition duration-200 bg-rose-600 text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0"
            >
              <Trash2 size={16} />
              {t("modal.storage.deleteSelectedOrphans")} ({selectedIds.size})
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ConfirmOverlay({
  confirmAction,
  drawingName,
  confirmInput,
  onConfirmInputChange,
  actionLoading,
  confirmMatch,
  onCancel,
  onConfirm,
}: {
  confirmAction: 'trim' | 'delete-orphans';
  drawingName: string;
  confirmInput: string;
  onConfirmInputChange: (value: string) => void;
  actionLoading: boolean;
  confirmMatch: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm">
      <div className="w-full max-w-sm p-6 space-y-4">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-300 border-2 border-rose-200 dark:border-rose-900/30">
            <AlertTriangle size={24} strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {confirmAction === 'trim' ? t("modal.storage.trimHistoryTitle") : t("modal.storage.deleteOrphanFilesTitle")}
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t("modal.storage.typeNameToConfirm")}
            <br />
            <span className="font-bold text-neutral-700 dark:text-neutral-200">{drawingName}</span>
          </p>
        </div>

        <input
          type="text"
          value={confirmInput}
          onChange={(e) => onConfirmInputChange(e.target.value)}
          placeholder={drawingName}
          // react-doctor-disable-next-line react-doctor/no-autofocus -- false positive: this only renders inside the native <dialog>'s showModal() focus trap (StorageManageModal), which the detector can't see across the component boundary; autofocusing the "type to confirm" field is the standard destructive-confirm UX.
          autoFocus
          className="w-full px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={actionLoading}
            className="flex-1 px-4 py-2.5 bg-emerald-50 dark:bg-neutral-800 text-emerald-700 dark:text-emerald-200 font-bold rounded-xl border-2 border-emerald-200 dark:border-neutral-700 hover:bg-emerald-100 dark:hover:bg-neutral-700 hover:border-emerald-300 dark:hover:border-neutral-600 hover:-translate-y-0.5 transition duration-200"
          >
            {t("modal.storage.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmMatch || actionLoading}
            className="flex-1 px-4 py-2.5 font-bold rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition duration-200 bg-rose-600 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0 flex items-center justify-center gap-2"
          >
            {actionLoading && <Loader2 size={16} className="animate-spin" />}
            {t("modal.storage.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Montado por el padre solo mientras está abierto (ver DrawingCard.tsx),
// con clave en drawingId, así que cada apertura es una instancia nueva con
// estado nuevo — no hace falta un efecto de "resetear el estado del
// formulario cuando esta prop cambia".
export const StorageManageModal: React.FC<StorageManageModalProps> = ({
  drawingId,
  drawingName,
  onClose,
}) => {
  const { t } = useT();
  const [diffData, setDiffData] = useState<FilesDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<'trim' | 'delete-orphans' | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const loadDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFilesDiff(drawingId);
      setDiffData(data);
      // Preseleccionar archivos donde inCanvasActive === false
      const preSelected = new Set<string>();
      for (const f of data.files) {
        if (!f.inCanvasActive) {
          preSelected.add(f.fileId);
        }
      }
      setSelectedIds(preSelected);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("modal.storage.errorLoadDiff");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [drawingId, t]);

  useEffect(() => {
    loadDiff();
  }, [loadDiff]);

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const handleToggle = (fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleTrim = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const result = await trimDrawing(drawingId, confirmInput);
      const trimmed = result.trimmed;
      setLastResult(
        `${t("modal.storage.trimComplete")}: ${trimmed.elementsRemoved} ${t("modal.storage.elementsRemoved")}, ${trimmed.filesRemoved} ${t("modal.storage.filesRemoved")}, ${trimmed.s3ObjectsDeleted} ${t("modal.storage.s3ObjectsDeleted")}.`
      );
      setConfirmAction(null);
      setConfirmInput('');
      await loadDiff();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("modal.storage.errorTrimFailed");
      setError(message);
      setConfirmAction(null);
      setConfirmInput('');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOrphans = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const result = await deleteOrphanFiles(drawingId, confirmInput, ids);
      setLastResult(
        `${result.deleted} ${t("modal.storage.orphanFilesDeleted")}.${result.errors > 0 ? ` ${result.errors} ${t("modal.storage.errorsSuffix")}` : ''}`
      );
      setConfirmAction(null);
      setConfirmInput('');
      await loadDiff();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("modal.storage.errorDeleteFailed");
      setError(message);
      setConfirmAction(null);
      setConfirmInput('');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmMatch = confirmInput === drawingName;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={`${t("modal.storage.title")}: ${drawingName}`}
      className="z-[100] m-auto max-w-3xl max-h-[90vh] w-full p-0 bg-transparent text-slate-900 dark:text-neutral-100 backdrop:bg-neutral-900/20 backdrop:backdrop-blur-sm"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="relative w-full max-h-[90vh] flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] animate-in fade-in zoom-in-95 duration-200">
        {/* Encabezado */}
        <div className="flex items-center gap-3 p-5 pb-4 border-b-2 border-black dark:border-neutral-700">
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300 border-2 border-indigo-200 dark:border-indigo-900/30">
            <HardDrive size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
              {t("modal.storage.title")}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
              {drawingName}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("modal.common.close")}
            className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Avisos */}
          {lastResult && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200 text-sm font-medium">
              <CheckCircle size={18} className="mt-0.5 shrink-0" />
              {lastResult}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border-2 border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 text-sm font-medium">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Recortar historial */}
          <div>
            <button
              onClick={() => {
                setConfirmAction('trim');
                setConfirmInput('');
              }}
              className="px-4 py-2.5 font-bold rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition duration-200 bg-rose-600 text-white flex items-center gap-2"
            >
              <Scissors size={16} />
              {t("modal.storage.trimHistoryTitle")}
            </button>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              {t("modal.storage.trimHistoryDescription")}
            </p>
          </div>

          <hr className="border-neutral-200 dark:border-neutral-700" />

          {/* Comparación de archivos */}
          <FileComparisonSection
            loading={loading}
            diffData={diffData}
            selectedIds={selectedIds}
            onRefresh={loadDiff}
            onToggleFile={handleToggle}
            onDeleteOrphansClick={() => {
              setConfirmAction('delete-orphans');
              setConfirmInput('');
            }}
          />
        </div>

        {/* Pie de página */}
        <div className="p-4 border-t-2 border-black dark:border-neutral-700 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-b-2xl">
          <AlertTriangle size={14} className="shrink-0" />
          {t("modal.storage.irreversibleWarning")}
        </div>

        {/* Overlay de confirmación */}
        {confirmAction && (
          <ConfirmOverlay
            confirmAction={confirmAction}
            drawingName={drawingName}
            confirmInput={confirmInput}
            onConfirmInputChange={setConfirmInput}
            actionLoading={actionLoading}
            confirmMatch={confirmMatch}
            onCancel={() => {
              setConfirmAction(null);
              setConfirmInput('');
            }}
            onConfirm={confirmAction === 'trim' ? handleTrim : handleDeleteOrphans}
          />
        )}
      </div>
    </dialog>,
    document.body
  );
};
