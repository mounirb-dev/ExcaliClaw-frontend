import * as api from "../api";
import type { SceneElement, SceneFiles } from "../types";
import { rehydrateFilesFromUrls } from "./rehydrateFiles";

export type BulkExportFormat = "png" | "svg";

type ExportTarget = { id: string; name: string };

// Concurrencia baja a propósito: cada dibujo es un GET completo (escena +
// archivos) y el Worker tiene rate limit por usuario (ver rateLimit.ts).
const FETCH_CONCURRENCY = 3;
const PNG_SCALE = 2;

// Excalidraw pinta una imagen solo si el elemento está en estado "saved" y
// su archivo trae un dataURL en línea; mismo criterio que la miniatura del
// dashboard (useDrawingPreview.ts).
const markLoadedImagesSaved = (elements: readonly SceneElement[], files: SceneFiles): SceneElement[] =>
  elements.map((element) => {
    if (element?.type !== "image" || typeof element.fileId !== "string") return element;
    const dataURL = files[element.fileId]?.dataURL;
    const inline = typeof dataURL === "string" && dataURL.startsWith("data:image/");
    return inline && element.status !== "saved" ? { ...element, status: "saved" } : element;
  });

const safeFileName = (name: string): string =>
  Array.from(name || "drawing")
    .filter((char) => char.charCodeAt(0) >= 32)
    .join("")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "drawing";

/** Nombres únicos dentro del ZIP: dos dibujos llamados "Untitled Drawing"
 * no pueden pisarse el archivo. */
const makeUniqueNamer = () => {
  const used = new Map<string, number>();
  return (base: string, ext: string): string => {
    const key = `${base}.${ext}`.toLowerCase();
    const count = used.get(key) ?? 0;
    used.set(key, count + 1);
    return count === 0 ? `${base}.${ext}` : `${base} (${count + 1}).${ext}`;
  };
};

const renderDrawing = async (
  drawingId: string,
  format: BulkExportFormat,
): Promise<Blob> => {
  const drawing = await api.getDrawing(drawingId);
  const files = await rehydrateFilesFromUrls(drawing.files || {});
  const elements = markLoadedImagesSaved(drawing.elements || [], files);
  const appState = {
    ...(drawing.appState || {}),
    exportBackground: true,
    viewBackgroundColor: drawing.appState?.viewBackgroundColor || "#ffffff",
  };

  const { exportToSvg, exportToBlob } = await import("@excalidraw/excalidraw");
  if (format === "svg") {
    const svg = await exportToSvg({ elements, appState, files, exportPadding: 20 });
    return new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
  }
  return exportToBlob({
    elements,
    appState,
    files,
    mimeType: "image/png",
    exportPadding: 20,
    getDimensions: (width: number, height: number) => ({
      width: width * PNG_SCALE,
      height: height * PNG_SCALE,
      scale: PNG_SCALE,
    }),
  });
};

/** Descarga los dibujos indicados como PNG o SVG dentro de un único ZIP.
 * Un dibujo que falla no aborta el resto: se devuelve en `failed` para que
 * la UI lo avise, y el ZIP incluye los demás. */
export async function downloadDrawingsAsZip(
  targets: ExportTarget[],
  format: BulkExportFormat,
  onProgress?: (done: number, total: number) => void,
): Promise<{ exported: number; failed: string[] }> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const uniqueName = makeUniqueNamer();
  const failed: string[] = [];
  let done = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      try {
        const blob = await renderDrawing(target.id, format);
        zip.file(uniqueName(safeFileName(target.name), format), blob);
      } catch (error) {
        console.error("[bulkExport] failed:", target.id, error);
        failed.push(target.name);
      }
      onProgress?.(++done, targets.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, targets.length) }, () => worker()),
  );

  const exported = targets.length - failed.length;
  if (exported === 0) return { exported, failed };

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = `excaliclaw-${format}-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { exported, failed };
}
