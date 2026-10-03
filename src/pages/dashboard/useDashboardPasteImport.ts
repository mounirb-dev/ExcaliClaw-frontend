import { useEffect } from "react";
import { toast } from "sonner";
import * as api from "../../api";

/** Ctrl+V en el panel: si el portapapeles trae una escena de otra app (JSON
 * de Excalidraw o tablero de Miro) se crea un dibujo nuevo con ella — la vía
 * rápida para quien migra: copiar en su app, pegar aquí. Se ignora cuando el
 * foco está en un campo de texto (buscador, renombrar...) para no robarle el
 * pegado normal. */
export function useDashboardPasteImport({
  enabled,
  collectionId,
  onImported,
  messages,
}: {
  enabled: boolean;
  collectionId: string | null;
  onImported: () => void;
  messages: { imported: string; failed: string };
}): void {
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      // Filtro barato y síncrono: solo texto que parece JSON. El parser (que
      // arrastra Excalidraw) se carga bajo demanda, no con el panel.
      const first = text.trimStart()[0];
      if (first !== "{" && first !== "[") return;
      event.preventDefault();
      void (async () => {
        try {
          const { parseClipboardScene } = await import("../../utils/clipboardScene");
          const scene = parseClipboardScene(text);
          if (!scene) return;
          await api.createDrawing(
            scene.source === "miro" ? "Imported from Miro" : "Pasted drawing",
            collectionId,
            { elements: scene.elements, appState: scene.appState, files: scene.files },
          );
          toast.success(messages.imported);
          onImported();
        } catch (error) {
          console.error("Paste import failed", error);
          toast.error(messages.failed);
        }
      })();
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enabled, collectionId, onImported, messages.imported, messages.failed]);
}
