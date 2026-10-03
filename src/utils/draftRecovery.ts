import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { clearDraft, readDraft, type Draft } from "./draftStore";

const elementsSignature = (elements: readonly ExcalidrawElement[]): string =>
  elements.map((element) => `${element.id}:${element.version ?? 0}`).join(",");

/** Borrador local de una versión ANTERIOR del servidor (el dibujo se guardó desde otro sitio
 * mientras tanto) cuyo contenido difiere. No se aplica solo —pisaría lo guardado—, pero tampoco
 * se pierde en silencio: el editor ofrece restaurarlo. */
export const findStaleDraft = async (
  drawingId: string,
  serverVersion: unknown,
  serverElements: readonly ExcalidrawElement[],
): Promise<Draft | null> => {
  try {
    const draft = await readDraft(drawingId);
    if (!draft || draft.elements.length === 0) return null;
    if (typeof serverVersion !== "number" || draft.baseVersion === serverVersion) return null;
    if (elementsSignature(draft.elements) === elementsSignature(serverElements)) return null;
    return draft;
  } catch {
    return null;
  }
};

/** ¿Hay un borrador local que el servidor no tiene? (ver draftStore.ts)
 *
 * Solo se recupera si el servidor sigue EXACTAMENTE en la versión sobre la que se hicieron
 * los cambios locales (nadie guardó nada nuevo desde otro sitio) y el contenido difiere. Si
 * el servidor ya iba por delante no se pisa con el borrador: se prefiere lo guardado. Si
 * coincide con el servidor, el borrador sobra y se borra. */
export const recoverDraft = async (
  drawingId: string,
  serverVersion: unknown,
  serverElements: readonly ExcalidrawElement[],
): Promise<Draft | null> => {
  try {
    const draft = await readDraft(drawingId);
    if (!draft) return null;
    if (typeof serverVersion !== "number" || draft.baseVersion !== serverVersion) return null;
    if (draft.elements.length === 0) return null;
    if (elementsSignature(draft.elements) === elementsSignature(serverElements)) {
      await clearDraft(drawingId, Date.now());
      return null;
    }
    return draft;
  } catch {
    return null;
  }
};
