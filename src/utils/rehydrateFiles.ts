/**
 * Rehidratación de archivos en modo S3.
 *
 * En el modo de almacenamiento S3, `files[fileId].dataURL` de un dibujo no
 * es una URL `data:` base64 en línea sino una referencia almacenada — ya
 * sea un endpoint de redirección del mismo origen
 * `/api/files/<drawingId>/<fileId>` o una URL pública de S3. Excalidraw a
 * veces puede renderizar un `<img>` ráster desde esa URL, pero los
 * elementos de imagen SVG no se renderizan y, más importante, `exportToSvg`
 * incrusta la referencia desnuda como `<image href>`, así que las
 * miniaturas del dashboard pierden todas las imágenes (el sanitizador de
 * vistas previas descarta los hrefs que no son `data:`).
 *
 * La solución es obtener cada archivo referenciado y volver a ponerlo en
 * línea como una URL `data:` base64 antes de que los archivos lleguen a
 * Excalidraw — al cargar la escena y al recibir archivos por socket. En
 * modo no-S3 toda dataURL ya es una URL `data:`, así que
 * {@link filesNeedRehydration} corta el circuito y no se obtiene nada.
 */

import { authRefresh } from "../api/auth";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

/**
 * Un valor de dataURL que debe obtenerse y volver a ponerse en línea: una
 * cadena no vacía que todavía no es una URL `data:` en línea y apunta a
 * nuestro endpoint de archivos o a una URL http(s) absoluta (S3 público).
 */
const isRehydratableRef = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  !value.startsWith("data:") &&
  (value.startsWith("/api/files/") || /^https?:\/\//i.test(value));

type FileEntry = BinaryFileData;

export const filesNeedRehydration = (
  files: Record<string, FileEntry> | null | undefined,
): boolean => {
  if (!files || typeof files !== "object") return false;
  return Object.values(files).some((file) =>
    isRehydratableRef(file?.dataURL),
  );
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });

/**
 * Obtiene una referencia de archivo almacenada y la devuelve como una URL
 * `data:` base64, o null ante cualquier fallo (error de red, no-2xx, cuerpo
 * no legible). Mejor esfuerzo: un fetch fallido debe dejar la referencia
 * original intacta en vez de dejar la imagen en blanco.
 */
// Estas peticiones usan `fetch` directo (no pasan por el interceptor de axios que renueva el
// JWT de 15 min tras un 401). Como la app ya no pregunta /auth/me en cada entrada, el JWT
// puede estar caducado al cargar las imágenes: ante un 401 se renueva la sesión y se
// reintenta UNA vez (varias imágenes a la vez comparten una sola renovación).
let sessionRefreshInFlight: Promise<boolean> | null = null;
const refreshSessionOnce = (): Promise<boolean> => {
  sessionRefreshInFlight ??= authRefresh()
    .then(() => true, () => false)
    .finally(() => {
      sessionRefreshInFlight = null;
    });
  return sessionRefreshInFlight;
};

const fetchWithSessionRetry = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: "same-origin" });
  if (response.status !== 401) return response;
  if (!(await refreshSessionOnce())) return response;
  return fetch(url, { credentials: "same-origin" });
};

const fetchAsDataUrl = async (
  url: string,
  mimeType: unknown,
): Promise<string | null> => {
  try {
    const response = await fetchWithSessionRetry(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    // Cuando la respuesta no tiene Content-Type (o tiene uno genérico), el
    // MIME resultante queda vacío / application/octet-stream, que
    // Excalidraw no puede decodificar como imagen. Repararlo a partir del
    // mimeType de imagen declarado del archivo cuando lo tengamos.
    const producedMime = /^data:([^;,]*)[;,]/.exec(dataUrl)?.[1] ?? "";
    if (
      !/^image\//i.test(producedMime) &&
      typeof mimeType === "string" &&
      /^image\//i.test(mimeType)
    ) {
      return dataUrl.replace(/^data:[^;,]*(;base64,)/i, `data:${mimeType}$1`);
    }
    return dataUrl;
  } catch {
    return null;
  }
};

/**
 * Devuelve una copia de `files` con cada referencia almacenada vuelta a
 * poner en línea como una URL `data:` base64. Los archivos que ya están en
 * línea, o cuyo fetch falla, se conservan tal cual. Devuelve la entrada sin
 * cambios cuando nada necesita rehidratarse.
 *
 * Esto espera a cada fetch antes de resolverse — lo usan los llamadores de
 * recepción por socket que necesitan todo el lote en línea antes de
 * fusionarlo en la escena. Para la ruta de carga de escena, preferir
 * {@link rehydrateFilesProgressive}, que pinta primero y transmite cada
 * archivo al canvas a medida que llega.
 */
export const rehydrateFilesFromUrls = async (
  files: Record<string, FileEntry> | null | undefined,
): Promise<Record<string, FileEntry>> => {
  if (!files || typeof files !== "object") return files ?? {};
  if (!filesNeedRehydration(files)) return files;

  const result: Record<string, FileEntry> = { ...files };
  const entries = Object.entries(files).filter(([, file]) =>
    isRehydratableRef(file?.dataURL),
  );

  await Promise.all(
    entries.map(async ([fileId, file]) => {
      const dataURL = await fetchAsDataUrl(file.dataURL, file.mimeType);
      if (dataURL) {
        result[fileId] = { ...file, dataURL: dataURL as BinaryFileData["dataURL"] };
      }
    }),
  );

  return result;
};

/**
 * Límite de fetches de archivo concurrentes — coincide con las ~6
 * conexiones paralelas que un navegador abre por origen, para saturar la
 * tubería sin bloqueo de cabeza de línea detrás de un único blob lento.
 */
const REHYDRATE_CONCURRENCY = 6;

/**
 * Variante progresiva de {@link rehydrateFilesFromUrls}: en vez de esperar
 * a todo el lote, obtiene cada referencia almacenada con concurrencia
 * acotada e invoca `onFileReady(fileId, hydratedFile)` en el momento en que
 * ese archivo llega. Esto permite que la escena se pinte de inmediato y
 * transmita las imágenes al canvas una por una.
 *
 * - Las entradas en línea (`data:`) se omiten — ya se renderizan.
 * - Un archivo cuyo fetch falla se descarta silenciosamente (sin
 *   callback), dejando la referencia original en el canvas en vez de dejar
 *   la imagen en blanco.
 * - `isCancelled` se consulta antes de despachar cada fetch y de nuevo
 *   antes de cada callback, así que una carga obsoleta aborta sin tocar la
 *   escena nueva.
 */
export const rehydrateFilesProgressive = async (
  files: Record<string, FileEntry> | null | undefined,
  onFileReady: (fileId: string, file: FileEntry) => void,
  isCancelled?: () => boolean,
): Promise<void> => {
  if (!files || typeof files !== "object") return;
  const entries = Object.entries(files).filter(([, file]) =>
    isRehydratableRef(file?.dataURL),
  );
  if (entries.length === 0) return;

  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      if (isCancelled?.()) return;
      const [fileId, file] = entries[cursor++];
      const dataURL = await fetchAsDataUrl(file.dataURL, file.mimeType);
      if (isCancelled?.()) return;
      if (dataURL) {
        onFileReady(fileId, { ...file, dataURL: dataURL as BinaryFileData["dataURL"] });
      }
    }
  };

  const workerCount = Math.min(REHYDRATE_CONCURRENCY, entries.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
};
