import type { AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { deleteCached, getCached, setCached } from "./secureCache";

/** Copia local de seguridad (borrador) de un dibujo en edición.
 *
 * Mientras editas, cada cambio se escribe aquí enseguida (IndexedDB cifrada con
 * WebCrypto, sin tocar el servidor); el servidor recibe una instantánea mucho más
 * espaciada. Si la pestaña se cierra o el navegador se cuelga entre instantáneas, al
 * volver a abrir el dibujo se recupera el borrador (ver useEditorSceneLoader).
 *
 * `baseVersion` es la versión del servidor sobre la que se hicieron los cambios: solo se
 * recupera un borrador si el servidor sigue exactamente en esa versión (nadie guardó
 * nada nuevo mientras tanto). */
export type Draft = {
  drawingId: string;
  baseVersion: number | null;
  /** Momento en que se escribió el borrador (ms). */
  at: number;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
};

// Por encima de este tamaño el borrador cuesta más de lo que protege: ese dibujo depende
// solo del guardado en el servidor.
export const DRAFT_MAX_CHARS = 8_000_000;
const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export const draftKey = (drawingId: string): string => `draft:${drawingId}`;

export const saveDraft = async (draft: Draft): Promise<void> => {
  try {
    if (JSON.stringify(draft).length > DRAFT_MAX_CHARS) return;
  } catch {
    return;
  }
  await setCached(draftKey(draft.drawingId), draft);
};

export const readDraft = async (drawingId: string): Promise<Draft | undefined> => {
  const draft = await getCached<Draft>(draftKey(drawingId), DRAFT_MAX_AGE_MS);
  return draft && draft.drawingId === drawingId && Array.isArray(draft.elements) ? draft : undefined;
};

/** Borra el borrador salvo que sea más nuevo que lo que se acaba de guardar
 * (`savedAt`): una edición posterior a la instantánea debe seguir protegida. */
export const clearDraft = async (drawingId: string, savedAt: number): Promise<void> => {
  const draft = await readDraft(drawingId);
  if (draft && draft.at > savedAt) return;
  await deleteCached(draftKey(drawingId));
};
