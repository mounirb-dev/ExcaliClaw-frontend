import { convertMiroExport, isMiroExport } from "./migrationImporters";
import { extractDrawingData } from "./importHelpers";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** Una escena reconocida en el texto del portapapeles. */
export interface ClipboardScene {
  /** De qué app viene (para el nombre por defecto y los avisos). */
  source: "excalidraw" | "miro";
  elements: ExcalidrawElement[];
  appState: Record<string, unknown>;
  files: BinaryFiles;
  /** Elementos que no se pudieron convertir (solo Miro). */
  skipped: number;
}

/** Tope del texto que se intenta interpretar: pegar un texto enorme no debe
 * colgar la pestaña intentando hacer JSON.parse de él. */
const MAX_CLIPBOARD_CHARS = 20 * 1024 * 1024;

/** Intenta leer el texto pegado como una escena de otra app: JSON de
 * Excalidraw (envuelto o suelto) o export de tablero de Miro. Devuelve null
 * si no parece ninguna — así el pegado normal (texto, imágenes) no se toca.
 * Se reutiliza en el panel (Ctrl+V crea un dibujo) y en el editor (Ctrl+V
 * añade los elementos al lienzo). */
export function parseClipboardScene(text: string): ClipboardScene | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CLIPBOARD_CHARS) return null;
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (isMiroExport(parsed)) {
    const { elements, skipped } = convertMiroExport(parsed);
    if (elements.length === 0) return null;
    return {
      source: "miro",
      elements,
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
      skipped,
    };
  }

  const extracted = extractDrawingData(parsed);
  // Una escena de Excalidraw tiene `elements` con algo dentro; sin eso no
  // es algo que nos interese pegar.
  if (extracted && extracted.elements.length > 0) {
    return { source: "excalidraw", ...extracted, skipped: 0 };
  }
  return null;
}
