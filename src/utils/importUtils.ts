import { api, isAxiosError } from "../api";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { type UploadStatus } from "../context/UploadContext";
import {
  coerceTimestamp,
  createCollectionResolver,
  extractDrawingData,
  importLegacyZip,
  importSingleJsonFile,
  isLegacyExportJson,
  makeSvgPreview,
  type LegacyExportDrawing,
} from "./importHelpers";
import { convertMiroExport, isMiroExport } from "./migrationImporters";

export const importDrawings = async (
  files: File[],
  targetCollectionId: string | null,
  onSuccess?: () => void | Promise<void>,
  onProgress?: (
    fileIndex: number,
    status: UploadStatus,
    progress: number,
    error?: string
  ) => void
) => {
  const drawingFiles = files.filter(
    (f) => f.name.endsWith(".json") || f.name.endsWith(".excalidraw")
  );

  if (drawingFiles.length === 0) {
    return { success: 0, failed: 0, errors: ["No supported files found."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  const originalIndexMap = new Map<number, number>();
  drawingFiles.forEach((df, i) => {
    const originalIndex = files.indexOf(df);
    originalIndexMap.set(i, originalIndex);
  });

  // importSingleJsonFile (importHelpers.ts) reconoce, en este orden, un
  // export legado de ExcaliClaw (`{ drawings: [...] }`), un export de
  // tablero de Miro, o una escena suelta de Excalidraw — así este botón de
  // "Import" del dashboard (el que dispara importDrawings vía uploadFiles)
  // también sirve como vía de migración desde otras apps, no solo para
  // archivos .excalidraw/.json de Excalidraw.
  await Promise.all(
    drawingFiles.map(async (file, drawingIndex) => {
      const fileIndex = originalIndexMap.get(drawingIndex) ?? drawingIndex;
      try {
        if (onProgress) onProgress(fileIndex, 'processing', 0);
        const result = await importSingleJsonFile(file, targetCollectionId);
        successCount += result.success;
        failCount += result.failed;
        errors.push(...result.errors);
        if (onProgress) {
          onProgress(
            fileIndex,
            result.failed > 0 && result.success === 0 ? 'error' : 'success',
            100,
            result.failed > 0 ? result.errors.join("\n") : undefined,
          );
        }
      } catch (err: unknown) {
        console.error(`Failed to import ${file.name}:`, err);
        failCount++;
        const errorMessage = isAxiosError(err)
          ? err.response?.data?.message || err.response?.data?.error || err.message || "Upload failed"
          : err instanceof Error ? err.message : "Upload failed";
        errors.push(`${file.name}: ${errorMessage}`);
        if (onProgress) onProgress(fileIndex, 'error', 0, errorMessage);
      }
    })
  );

  if (successCount > 0 && onSuccess) {
    await onSuccess();
  }

  return { success: successCount, failed: failCount, errors };
};

/**
 * Ayudante de importación heredado.
 * - Soporta dibujos individuales `.excalidraw` / `.json` de Excalidraw (igual que importDrawings)
 * - Soporta el export heredado `.json` de ExcaliDash con `{ drawings: [...] }`
 */
export const importLegacyFiles = async (
  files: File[],
  targetCollectionId: string | null,
  onSuccess?: () => void | Promise<void>,
  onProgress?: (
    fileIndex: number,
    status: UploadStatus,
    progress: number,
    error?: string
  ) => void
) => {
  const drawingFiles = files.filter(
    (f) =>
      f.name.endsWith(".json") ||
      f.name.endsWith(".excalidraw") ||
      f.name.endsWith(".zip")
  );

  if (drawingFiles.length === 0) {
    return { success: 0, failed: 0, errors: ["No supported files found."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  const originalIndexMap = new Map<number, number>();
  drawingFiles.forEach((df, i) => {
    const originalIndex = files.indexOf(df);
    originalIndexMap.set(i, originalIndex);
  });

  const collectionResolver = createCollectionResolver();

  await Promise.all(
    drawingFiles.map(async (file, drawingIndex) => {
      const fileIndex = originalIndexMap.get(drawingIndex) ?? drawingIndex;
      try {
        if (onProgress) onProgress(fileIndex, "processing", 0);

        if (file.name.endsWith(".zip")) {
          const result = await importLegacyZip(file, targetCollectionId);
          successCount += result.success;
          failCount += result.failed;
          errors.push(...result.errors);
          if (onProgress) onProgress(fileIndex, result.failed > 0 ? "error" : "success", 100, result.failed > 0 ? result.errors.join("\n") : undefined);
          return;
        }

        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;

        if (isLegacyExportJson(parsed)) {
          const exportJson = parsed;
          const drawings = Array.isArray(exportJson.drawings)
            ? exportJson.drawings
            : [];

          if (drawings.length === 0) {
            throw new Error("Legacy export JSON contains no drawings.");
          }

          for (let i = 0; i < drawings.length; i += 1) {
            const d = drawings[i] as LegacyExportDrawing;
            const extracted = extractDrawingData(d);
            if (!extracted) {
              failCount += 1;
              errors.push(
                `${file.name}: drawing ${i + 1}: Invalid structure (missing elements/appState)`
              );
              continue;
            }

            let collectionId: string | null = null;
            if (targetCollectionId !== null) {
              collectionId = targetCollectionId;
            } else if (d.collectionId === "trash" || d.collectionName === "Trash") {
              collectionId = "trash";
            } else if (typeof d.collectionName === "string" && d.collectionName.trim()) {
              collectionId = await collectionResolver.getOrCreateCollectionIdByName(d.collectionName.trim());
            } else {
              collectionId = null;
            }

            const svg = await makeSvgPreview(extracted.elements, extracted.appState, extracted.files);

            const payload = {
              name:
                typeof d.name === "string" && d.name.trim().length > 0
                  ? d.name
                  : `Imported Drawing ${i + 1}`,
              elements: extracted.elements,
              appState: extracted.appState,
              files: extracted.files || null,
              collectionId,
              createdAt: coerceTimestamp(d.createdAt),
              updatedAt: coerceTimestamp(d.updatedAt),
              preview: svg.outerHTML,
            };

            await api.post("/drawings", payload, {
              headers: {
                "X-Imported-File": "true",
              },
            });

            successCount += 1;
          }

          if (onProgress) onProgress(fileIndex, "success", 100);
          return;
        }

        if (isMiroExport(parsed)) {
          const { elements, skipped } = convertMiroExport(parsed);
          if (elements.length === 0) {
            throw new Error("No supported Miro items found (sticky notes, shapes, text, connectors).");
          }
          const appState = { viewBackgroundColor: "#ffffff" };
          const svg = await makeSvgPreview(elements as ExcalidrawElement[], appState, {});
          const payload = {
            name: file.name.replace(/\.json$/, "") || "Imported from Miro",
            elements,
            appState,
            files: null,
            collectionId: targetCollectionId,
            preview: svg.outerHTML,
          };
          await api.post("/drawings", payload, { headers: { "X-Imported-File": "true" } });
          successCount += 1;
          if (skipped > 0) {
            errors.push(`${file.name}: ${skipped} unsupported Miro item(s) skipped (frames, images, embeds, etc.)`);
          }
          if (onProgress) onProgress(fileIndex, "success", 100);
          return;
        }

        if (
          typeof parsed === "object" &&
          parsed !== null &&
          extractDrawingData(parsed)
        ) {
          const mappedOnProgress = onProgress
            ? (_idx: number, status: UploadStatus, progress: number, error?: string) =>
                onProgress(fileIndex, status, progress, error)
            : undefined;
          const result = await importDrawings(
            [file],
            targetCollectionId,
            undefined,
            mappedOnProgress
          );
          successCount += result.success;
          failCount += result.failed;
          errors.push(...result.errors);
          return;
        }

        throw new Error(`Invalid file structure: ${file.name}`);
      } catch (err: unknown) {
        console.error(`Failed to import ${file.name}:`, err);
        failCount += 1;
        const errorMessage = isAxiosError(err)
          ? err.response?.data?.message || err.response?.data?.error || err.message || "Upload failed"
          : err instanceof Error ? err.message : "Upload failed";
        errors.push(`${file.name}: ${errorMessage}`);
        if (onProgress) onProgress(fileIndex, "error", 0, errorMessage);
      }
    })
  );

  if (successCount > 0 && onSuccess) {
    await onSuccess();
  }

  return { success: successCount, failed: failCount, errors };
};
