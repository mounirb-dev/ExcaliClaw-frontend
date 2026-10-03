import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { History, X } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  getDrawingVersionScene,
  getDrawingVersions,
  restoreDrawingVersion,
  type DrawingVersion,
  type DrawingVersionList,
} from "../api";
import { generatePreviewSvg } from "../utils/previewGenerate";
import { useT } from "../i18n/useT";

type PreviewResult = { id: string; src: string | null };

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const svgToDataUri = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Lista de versiones del dibujo (o el error de carga). */
const useVersionList = (drawingId: string) => {
  const [list, setList] = useState<DrawingVersionList | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getDrawingVersions(drawingId)
      .then((result) => {
        if (!cancelled) setList(result);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [drawingId]);
  return { list, loadFailed };
};

/** Vista previa de la versión elegida: `src` null = no se pudo generar. Mientras el resultado no
 * corresponda a la versión elegida se considera "cargando". */
const useVersionPreview = (drawingId: string, selectedId: string | null, getFiles: () => BinaryFiles) => {
  const [result, setResult] = useState<PreviewResult | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    getDrawingVersionScene(drawingId, selectedId)
      .then(async (scene) => {
        const svg = await generatePreviewSvg({
          elements: scene.elements as readonly ExcalidrawElement[],
          appState: scene.appState as Record<string, unknown>,
          files: getFiles(),
        });
        if (!cancelled) setResult({ id: selectedId, src: svgToDataUri(svg) });
      })
      .catch(() => {
        if (!cancelled) setResult({ id: selectedId, src: null });
      });
    return () => {
      cancelled = true;
    };
  }, [drawingId, selectedId, getFiles]);
  if (!selectedId) return "idle" as const;
  if (!result || result.id !== selectedId) return "loading" as const;
  return result.src ?? ("error" as const);
};

const RetentionNote: React.FC<{ list: DrawingVersionList }> = ({ list }) => {
  const { t } = useT();
  let text = t("versions.retentionN").replace("{n}", String(list.retentionDays));
  if (list.retentionDays === null) text = t("versions.retentionUnlimited");
  else if (list.retentionDays === 1) text = t("versions.retentionOne");
  return (
    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
      {text}{" "}
      {list.retentionDays !== null && (
        <Link to="/app/plans" className="font-bold text-indigo-600 underline dark:text-indigo-300">
          {t("versions.upgrade")}
        </Link>
      )}
    </p>
  );
};

const VersionListPane: React.FC<{
  list: DrawingVersionList | null;
  loadFailed: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}> = ({ list, loadFailed, selectedId, onSelect }) => {
  const { t } = useT();
  const message = loadFailed
    ? { text: t("versions.loadError"), tone: "text-rose-600" }
    : !list
      ? { text: t("versions.loading"), tone: "text-neutral-500" }
      : list.versions.length === 0
        ? { text: t("versions.empty"), tone: "text-neutral-500" }
        : null;
  return (
    <ul className="max-h-64 space-y-1 overflow-y-auto pr-1 sm:max-h-[50vh]" aria-label={t("versions.title")}>
      {message && <li className={clsx("text-sm", message.tone)}>{message.text}</li>}
      {list?.versions.map((version: DrawingVersion) => (
        <li key={version.id}>
          <button
            type="button"
            onClick={() => onSelect(version.id)}
            className={clsx(
              "w-full rounded-lg border-2 px-3 py-2 text-left text-sm transition",
              version.id === selectedId
                ? "border-black bg-indigo-50 dark:border-neutral-500 dark:bg-neutral-800"
                : "border-transparent hover:border-black/40 hover:bg-slate-50 dark:hover:border-neutral-600 dark:hover:bg-neutral-800",
            )}
          >
            <span className="block font-bold">{dateFormatter.format(version.at)}</span>
            <span className="block text-xs text-neutral-500 dark:text-neutral-400">
              {version.reason === "restore" ? t("versions.reasonRestore") : t("versions.reasonAuto")} ·{" "}
              {t("versions.elements").replace("{n}", String(version.elementCount))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};

const PreviewBox: React.FC<{ preview: ReturnType<typeof useVersionPreview> }> = ({ preview }) => {
  const { t } = useT();
  const isImage = preview !== "idle" && preview !== "loading" && preview !== "error";
  const labels = { idle: "versions.pick", loading: "versions.previewLoading", error: "versions.previewError" } as const;
  return (
    <div className="flex flex-1 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-950">
      {isImage ? (
        <img src={preview} alt={t("versions.title")} className="max-h-[40vh] max-w-full object-contain" />
      ) : (
        <span className="text-sm text-neutral-500">{t(labels[preview])}</span>
      )}
    </div>
  );
};

const RestoreActions: React.FC<{
  canRestore: boolean;
  hasSelection: boolean;
  previewReady: boolean;
  restoring: boolean;
  onRestore: () => void;
}> = ({ canRestore, hasSelection, previewReady, restoring, onRestore }) => {
  const { t } = useT();
  const [confirming, setConfirming] = useState(false);
  // Al elegir otra versión se descarta una confirmación a medias (el padre remonta esto con `key`).
  if (!canRestore) return <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("versions.viewOnly")}</p>;
  if (!hasSelection) return null;
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={restoring || !previewReady}
        className="self-end rounded-xl border-2 border-black bg-indigo-600 px-4 py-2 font-bold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:-translate-y-0.5 disabled:opacity-50"
      >
        {t("versions.restore")}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
      <p className="text-sm">{t("versions.restoreConfirm")}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={restoring}
          className="rounded-lg border-2 border-neutral-300 px-3 py-1.5 text-sm font-bold dark:border-neutral-600"
        >
          {t("versions.cancel")}
        </button>
        <button
          type="button"
          onClick={onRestore}
          disabled={restoring}
          className="rounded-lg border-2 border-black bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {restoring ? t("versions.restoring") : t("versions.restoreYes")}
        </button>
      </div>
    </div>
  );
};

/** Historial de versiones de un dibujo: lista las instantáneas que conserva el plan del dueño,
 * muestra una vista previa de la elegida y permite restaurarla (solo con permiso de edición). */
export const VersionHistoryModal: React.FC<{
  drawingId: string;
  /** Archivos (imágenes) del dibujo abierto, para que las vistas previas los incluyan. */
  getFiles: () => BinaryFiles;
  /** Se llama justo antes de restaurar: el editor cancela sus guardados pendientes para que no
   * pisen la versión restaurada. */
  onBeforeRestore: () => void;
  onClose: () => void;
}> = ({ drawingId, getFiles, onBeforeRestore, onClose }) => {
  const { t } = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { list, loadFailed } = useVersionList(drawingId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const preview = useVersionPreview(drawingId, selectedId, getFiles);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const handleRestore = async () => {
    if (!selectedId) return;
    setRestoring(true);
    try {
      onBeforeRestore();
      await restoreDrawingVersion(drawingId, selectedId);
      toast.success(t("versions.restored"));
      // Recarga limpia: el editor vuelve a leer la escena restaurada del servidor.
      window.location.reload();
    } catch {
      toast.error(t("versions.restoreFailed"));
      setRestoring(false);
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={t("versions.title")}
      className="z-[100] m-auto w-full max-w-3xl p-0 bg-transparent text-slate-900 dark:text-neutral-100 backdrop:bg-neutral-900/20 backdrop:backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="relative flex max-h-[85vh] w-full flex-col rounded-2xl border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)]">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("modal.common.close")}
          className="absolute right-4 top-4 text-neutral-400 transition-colors hover:text-neutral-900 dark:hover:text-white"
        >
          <X size={20} />
        </button>
        <h3 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <History size={20} />
          {t("versions.title")}
        </h3>
        {list && <RetentionNote list={list} />}
        <div className="mt-4 grid min-h-0 flex-1 gap-4 sm:grid-cols-[14rem_1fr]">
          <VersionListPane list={list} loadFailed={loadFailed} selectedId={selectedId} onSelect={setSelectedId} />
          <div className="flex min-h-48 flex-col gap-3">
            <PreviewBox preview={preview} />
            {list && (
              <RestoreActions
                key={selectedId ?? "none"}
                canRestore={list.canRestore}
                hasSelection={selectedId !== null}
                previewReady={preview !== "idle" && preview !== "loading" && preview !== "error"}
                restoring={restoring}
                onRestore={handleRestore}
              />
            )}
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
