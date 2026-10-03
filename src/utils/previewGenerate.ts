// Generación de miniaturas (vista previa) de un dibujo, compartida por el
// dashboard (useDrawingPreview.ts) y el editor (useEditorPersistence.ts).
//
// Un SVG vectorial crece linealmente con la escena: ~80 KB y ~365 nodos DOM
// para ~350 elementos, y con imágenes incrustadas en base64 llega a MB (el
// Worker rechaza más de 2 MB con 413, y el dashboard pinta hasta 24 de estas
// miniaturas a la vez con dangerouslySetInnerHTML). Para escenas pesadas se
// genera en su lugar una imagen raster de tamaño ACOTADO (lado mayor
// RASTER_MAX_SIDE, JPEG), envuelta en un SVG para que todo el resto del
// pipeline (sanitizado en el Worker, almacenamiento, render en la tarjeta)
// siga tratándola como cualquier otra vista previa.

import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** A partir de cuántos elementos vivos se prefiere raster: el SVG de ~350
 * elementos ya pesa ~80 KB; con 400+ el coste de DOM/parseo empieza a notarse
 * en una rejilla de 24 tarjetas. */
export const HEAVY_SCENE_ELEMENT_COUNT = 400;
/** Bytes de imágenes incrustadas (dataURL) a partir de los cuales se prefiere
 * raster: un SVG con esas imágenes en base64 se acerca al tope de 2 MB. */
export const HEAVY_SCENE_IMAGE_BYTES = 150 * 1024;
/** Tope del SVG vectorial: por encima se usa raster (~150 KB como mucho). */
export const MAX_VECTOR_SVG_CHARS = 200 * 1024;
export const RASTER_MAX_SIDE = 640;
const RASTER_JPEG_QUALITY = 0.85;

type PreviewSource = {
  elements: readonly ExcalidrawElement[];
  appState: Record<string, unknown>;
  files: BinaryFiles;
};

// Excalidraw pinta una imagen solo si el elemento está en estado "saved" y
// su archivo trae un dataURL en línea.
const markLoadedImagesSaved = (
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
): ExcalidrawElement[] =>
  elements.map((element) => {
    if (element?.type !== "image" || typeof element.fileId !== "string") return element;
    const dataURL = files[element.fileId]?.dataURL;
    const inline = typeof dataURL === "string" && dataURL.startsWith("data:image/");
    return inline && element.status !== "saved" ? ({ ...element, status: "saved" } as ExcalidrawElement) : element;
  });

/** ¿Conviene raster en vez de SVG vectorial para esta escena? Solo cuenta lo
 * que realmente se dibuja: elementos no borrados e imágenes referenciadas. */
export const isHeavyScene = (
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
): boolean => {
  let live = 0;
  let imageBytes = 0;
  for (const element of elements) {
    if (!element || element.isDeleted) continue;
    live++;
    if (element.type === "image" && typeof element.fileId === "string") {
      const dataURL = files[element.fileId]?.dataURL;
      if (typeof dataURL === "string") imageBytes += dataURL.length;
    }
  }
  return live > HEAVY_SCENE_ELEMENT_COUNT || imageBytes > HEAVY_SCENE_IMAGE_BYTES;
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });

/** Devuelve el markup SVG de la miniatura. Nunca produce algo mayor que
 * unas decenas de KB para escenas pesadas. */
export async function generatePreviewSvg({ elements, appState, files }: PreviewSource): Promise<string> {
  const normalizedElements = markLoadedImagesSaved(elements, files);
  const exportAppState = {
    ...appState,
    exportBackground: true,
    viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
  };
  const excalidraw = await import("@excalidraw/excalidraw");

  const heavy = isHeavyScene(normalizedElements, files);
  if (!heavy) {
    const svg = await excalidraw.exportToSvg({
      elements: normalizedElements,
      appState: exportAppState,
      files,
      exportPadding: 10,
      // Sin incrustar fuentes: el subsetting corre en un worker que falla en
      // producción ("document is not defined") y cae al hilo principal tras
      // 1 s de espera POR miniatura. En una miniatura da igual.
      skipInliningFonts: true,
    });
    const markup = svg.outerHTML;
    // El número de elementos no basta: 300 elementos con relleno "hachure"
    // ya dan ~390 KB de SVG. Si el vectorial se pasa del tope, raster.
    if (markup.length <= MAX_VECTOR_SVG_CHARS) return markup;
  }

  let outWidth = 0;
  let outHeight = 0;
  const blob = await excalidraw.exportToBlob({
    elements: normalizedElements,
    appState: exportAppState,
    files,
    mimeType: "image/jpeg",
    quality: RASTER_JPEG_QUALITY,
    exportPadding: 10,
    getDimensions: (width: number, height: number) => {
      const scale = Math.min(1, RASTER_MAX_SIDE / Math.max(width, height));
      outWidth = Math.max(1, Math.round(width * scale));
      outHeight = Math.max(1, Math.round(height * scale));
      return { width: outWidth, height: outHeight, scale };
    },
  });
  const dataUrl = await blobToDataUrl(blob);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${outWidth} ${outHeight}" ` +
    `width="${outWidth}" height="${outHeight}" preserveAspectRatio="xMidYMid meet">` +
    `<image width="${outWidth}" height="${outHeight}" href="${dataUrl}"/></svg>`
  );
}
