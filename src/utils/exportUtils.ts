import type { Drawing, SceneAppState, SceneElement, SceneFiles } from "../types";
import { GRID_DISABLED } from "./gridSize";

// El atributo `download` solo nombra el archivo guardado (los navegadores
// no lo ejecutan), así que esto no es un vector de XSS — pero los
// separadores de ruta o caracteres de control en un nombre de dibujo dado
// por el usuario todavía pueden producir un nombre de archivo confuso o
// rechazado por el SO, así que se eliminan.
const hasControlChar = (ch: string): boolean => ch.charCodeAt(0) < 32;

const sanitizeFilename = (name: string): string =>
  Array.from(name.replace(/[\\/:*?"<>|]/g, "_"), (ch) => (hasControlChar(ch) ? "_" : ch))
    .join("")
    .trim() || "drawing";

export interface ExportData {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: readonly SceneElement[];
  appState: SceneAppState;
  files: SceneFiles;
}

/**
 * Exporta un dibujo a un archivo .excalidraw y dispara la descarga
 */
export const exportDrawingToFile = (
  drawing: Drawing,
  filename?: string
): void => {
  const exportData: ExportData = {
    type: "excalidraw",
    version: 2,
    source: window.location.origin,
    elements: drawing.elements || [],
    appState: {
      gridSize: drawing.appState?.gridSize ?? GRID_DISABLED,
      ...(drawing.appState?.gridStep != null && { gridStep: drawing.appState.gridStep }),
      ...(drawing.appState?.gridModeEnabled != null && { gridModeEnabled: drawing.appState.gridModeEnabled }),
      viewBackgroundColor: drawing.appState?.viewBackgroundColor ?? "#ffffff",
    },
    files: drawing.files || {},
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `${sanitizeFilename(drawing.name)}.excalidraw`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Exporta el dibujo desde el Editor con el estado actual
 */
export const exportFromEditor = (
  name: string,
  elements: readonly SceneElement[],
  appState: SceneAppState,
  files: SceneFiles,
): void => {
  const exportData: ExportData = {
    type: "excalidraw",
    version: 2,
    source: window.location.origin,
    elements: Array.from(elements),
    appState: {
      gridSize: appState?.gridSize ?? GRID_DISABLED,
      ...(appState?.gridStep != null && { gridStep: appState.gridStep }),
      ...(appState?.gridModeEnabled != null && { gridModeEnabled: appState.gridModeEnabled }),
      viewBackgroundColor: appState?.viewBackgroundColor ?? "#ffffff",
    },
    files: files || {},
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(name)}.excalidraw`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
