import { useCallback, useRef } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { getElementContentSig } from "./shared";
import type { ElementVersionInfo } from "./shared";

// `ref` guarda la identidad de OBJETO del elemento la última vez que se
// registró — no solo sus campos de versión. Excalidraw no muta elementos
// in-place: uno que no cambió entre dos onChange conserva la misma
// referencia de objeto, así que compararla es un atajo O(1) válido antes
// de reconstruir su firma de contenido entero. En un dibujo grande (miles
// de elementos), sin esto emitChanges (useEditorBroadcast.ts) reconstruye
// getElementContentSig para CADA elemento en CADA tick con throttle de
// 100ms mientras se arrastra/edita algo — aunque solo uno de esos miles
// realmente haya cambiado. Confirmado en vivo como el cuello de botella
// real detrás del congelamiento reportado con dibujos grandes.
type TrackedElement = ElementVersionInfo & { ref: unknown };

export const useEditorElementTracking = () => {
  const elementVersionMap = useRef<Map<string, TrackedElement>>(new Map());

  const recordElementVersion = useCallback((element: ExcalidrawElement) => {
    elementVersionMap.current.set(element.id, {
      ref: element,
      version: element.version ?? 0,
      versionNonce: element.versionNonce ?? 0,
      updated:
        typeof element?.updated === "number"
          ? element.updated
          : Number(element?.updated) || 0,
      contentSig: getElementContentSig(element),
    });
  }, []);

  const hasElementChanged = useCallback((element: ExcalidrawElement) => {
    const previous = elementVersionMap.current.get(element.id);
    if (!previous) return true;
    if (previous.ref === element) return false;
    const nextVersion = element.version ?? 0;
    const nextNonce = element.versionNonce ?? 0;
    const nextUpdated =
      typeof element?.updated === "number"
        ? element.updated
        : Number(element?.updated) || 0;
    const nextSig = getElementContentSig(element);
    return (
      previous.version !== nextVersion ||
      previous.versionNonce !== nextNonce ||
      previous.updated !== nextUpdated ||
      previous.contentSig !== nextSig
    );
  }, []);

  const computeElementOrderSig = useCallback((elements: readonly ExcalidrawElement[]) => {
    let hash = 2166136261;
    let count = 0;
    for (const el of elements) {
      const id = typeof el?.id === "string" ? el.id : "";
      if (!id) continue;
      count += 1;
      for (let i = 0; i < id.length; i++) {
        hash ^= id.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      hash ^= 124;
      hash = Math.imul(hash, 16777619);
    }
    return `${count}:${(hash >>> 0).toString(16)}`;
  }, []);

  return {
    computeElementOrderSig,
    elementVersionMap,
    hasElementChanged,
    recordElementVersion,
  };
};
