/* eslint-disable react-hooks/immutability -- estas referencias vienen de useRef y se actualizan durante la subida para conservar el estado mutable del editor. */

import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { isFileUploadSupported, uploadDrawingFile } from "../../api";
import { compressExcalidrawFiles } from "../../utils/imageCompression";
import type { UploadedFileRefs } from "./shared";

// Con qué frecuencia (ms) recorremos el conjunto de archivos activos
// buscando imágenes recién insertadas que todavía necesitan subirse. Un
// intervalo corto mantiene el primer guardado de escena solo-metadatos
// cerca justo después de la inserción; el parche de addFiles también llama
// a scanNow directamente para inserciones programáticas/de arrastre, así
// que las subidas normalmente empiezan antes de que el sondeo haga tick.
const SCAN_INTERVAL_MS = 800;
const UPLOAD_CONCURRENCY = 3;
const UPLOAD_ATTEMPTS = 2;

type UseEditorFileUploadsParams = {
  drawingId: string | undefined;
  isReady: boolean;
  excalidrawAPI: MutableRefObject<ExcalidrawImperativeAPI | null>;
  isSyncing: MutableRefObject<boolean>;
  latestFiles: MutableRefObject<BinaryFiles>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
};

/** Decodifica una URL `data:` en base64/plana a bytes crudos más su MIME declarado. */
const dataUrlToBytes = (
  dataURL: string,
): { bytes: Uint8Array; mimeType: string } | null => {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataURL);
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  try {
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, mimeType };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), mimeType };
  } catch {
    return null;
  }
};

/** Ejecuta fábricas de tareas con un número acotado en vuelo a la vez. */
const runWithConcurrency = async (
  tasks: Array<() => Promise<void>>,
  limit: number,
): Promise<void> => {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- false positive: this IS the bounded-concurrency fix already — `limit` workers (below) run this loop in parallel via Promise.all, each pulling its own tasks sequentially off the shared cursor.
      await task();
    }
  });
  await Promise.all(workers);
};

/**
 * Vigila el conjunto de archivos del dibujo y sube cada imagen recién
 * insertada al endpoint por archivo (comprimiendo primero, exactamente como
 * hace la ruta de guardado, para que los bytes almacenados coincidan). Las
 * subidas exitosas se registran en `uploadedRefs`, que las rutas de
 * persistencia / broadcast / keepalive usan para intercambiar la dataURL en
 * línea por una pequeña referencia `/api/files/...`. Las subidas son
 * idempotentes y con clave por contenido, así que un escaneo duplicado es
 * un no-op barato. Contra un backend más antiguo, el flag de capacidad se
 * desactiva tras el primer 404/501 y este hook se vuelve inerte.
 */
export const useEditorFileUploads = ({
  drawingId,
  isReady,
  excalidrawAPI,
  isSyncing,
  latestFiles,
  uploadedRefs,
}: UseEditorFileUploadsParams) => {
  const inFlightRef = useRef<Set<string>>(new Set());

  const scanNow = useCallback(async () => {
    if (!drawingId || !isFileUploadSupported()) return;
    const editor = excalidrawAPI.current;
    const files = (editor?.getFiles?.() ||
      latestFiles.current ||
      {}) as BinaryFiles;

    const candidateIds = Object.keys(files).filter((id) => {
      const file = files[id];
      return (
        file &&
        typeof file.dataURL === "string" &&
        file.dataURL.startsWith("data:") &&
        !uploadedRefs.current[id] &&
        !inFlightRef.current.has(id)
      );
    });
    if (candidateIds.length === 0) return;
    candidateIds.forEach((id) => inFlightRef.current.add(id));

    // Comprimir (idempotente/memoizado) y escribir el resultado de vuelta en
    // el editor para que los bytes subidos sean los mismos que usarán los
    // guardados y vistas previas posteriores.
    let filesToUpload = files;
    try {
      const compressed = await compressExcalidrawFiles(files);
      if (compressed.changed) {
        filesToUpload = compressed.files;
        if (editor && typeof editor.addFiles === "function") {
          isSyncing.current = true;
          try {
            editor.addFiles(Object.values(filesToUpload));
          } finally {
            isSyncing.current = false;
          }
        }
        latestFiles.current = filesToUpload;
      }
    } catch {
      // Conservar los bytes originales ante un fallo de compresión; la subida continúa abajo.
    }

    const uploadOne = async (id: string): Promise<void> => {
      const file = filesToUpload[id];
      const dataURL = file?.dataURL;
      if (typeof dataURL !== "string" || !dataURL.startsWith("data:")) {
        inFlightRef.current.delete(id);
        return;
      }
      const parsed = dataUrlToBytes(dataURL);
      if (!parsed) {
        inFlightRef.current.delete(id);
        return;
      }
      for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt++) {
        try {
          const result = await uploadDrawingFile(
            drawingId,
            id,
            parsed.bytes,
            (typeof file?.mimeType === "string" && file.mimeType) ||
              parsed.mimeType,
          );
          // null => al backend le falta el endpoint; dejar de intentarlo por esta sesión.
          if (result) uploadedRefs.current[id] = result.url;
          inFlightRef.current.delete(id);
          return;
        } catch {
          if (attempt === UPLOAD_ATTEMPTS - 1) {
            // Desistir por ahora; un escaneo posterior reintentará (el servidor lo interna mientras tanto).
            inFlightRef.current.delete(id);
          }
        }
      }
    };

    await runWithConcurrency(
      candidateIds.map((id) => () => uploadOne(id)),
      UPLOAD_CONCURRENCY,
    );
  }, [drawingId, excalidrawAPI, isSyncing, latestFiles, uploadedRefs]);

  useEffect(() => {
    if (!drawingId || !isReady) return;
    const interval = window.setInterval(() => {
      void scanNow();
    }, SCAN_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [drawingId, isReady, scanNow]);

  return { scanNow };
};
