import { useEffect } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { clampGridStep } from "../../utils/gridStep";

interface UseEditorGridStepArgs {
  excalidrawAPI: React.RefObject<ExcalidrawImperativeAPI | null>;
  isReady: boolean;
  gridStep: number;
}

/**
 * Aplica el paso de cuadrícula preferido del usuario a la escena en vivo.
 * El editor Excalidraw embebido mantiene `gridStep` en appState pero no
 * tiene UI para él, así que empujamos la preferencia en cuanto la API está
 * lista y de nuevo cada vez que cambia. `NEVER` mantiene el ajuste fuera de
 * la pila de deshacer; el valor sigue viajando junto en la siguiente
 * instantánea de appState persistida.
 */
export const useEditorGridStep = ({
  excalidrawAPI,
  isReady,
  gridStep,
}: UseEditorGridStepArgs): void => {
  useEffect(() => {
    const api = excalidrawAPI.current;
    if (!isReady || !api || typeof api.updateScene !== "function") return;
    const next = clampGridStep(gridStep);
    if (api.getAppState?.().gridStep === next) return;
    api.updateScene({
      appState: { gridStep: next },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [excalidrawAPI, isReady, gridStep]);
};
