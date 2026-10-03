import { convertToExcalidrawElements, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** Mismos colores/wrap que buildStickyNote en el backend
 * — se mantienen en sincronía a mano (son solo 5 tonos) para que una nota
 * puesta desde la UI y una puesta por un agente vía MCP se vean iguales. */
export const STICKY_NOTE_COLORS = ["yellow", "pink", "blue", "green", "orange"] as const;
export type StickyNoteColor = (typeof STICKY_NOTE_COLORS)[number];

const STICKY_BG: Record<StickyNoteColor, string> = {
  yellow: "#fff3bf",
  pink: "#ffc9de",
  blue: "#a5d8ff",
  green: "#b2f2bb",
  orange: "#ffd8a8",
};
const STICKY_BORDER: Record<StickyNoteColor, string> = {
  yellow: "#f08c00",
  pink: "#e64980",
  blue: "#1971c2",
  green: "#2f9e44",
  orange: "#e8590c",
};

/** Construye una notita (rectángulo coloreado con el texto como etiqueta
 * ligada, arriba a la izquierda) lista para insertar vía
 * excalidrawAPI.updateScene(). Se usa convertToExcalidrawElements, la vía
 * oficial de Excalidraw para crear elementos con etiqueta: mide y ajusta el
 * texto dentro del rectángulo. Antes el texto iba suelto con
 * restoreElements y se quedaba con altura ~0, visible solo como motas
 * oscuras en el borde superior de la nota. */
export const createStickyNoteElements = (
  text: string,
  opts: { x: number; y: number; color?: StickyNoteColor; width?: number; height?: number },
): ExcalidrawElement[] => {
  const color = opts.color ?? "yellow";
  return convertToExcalidrawElements([
    {
      type: "rectangle",
      x: opts.x,
      y: opts.y,
      width: opts.width ?? 220,
      height: opts.height ?? 220,
      backgroundColor: STICKY_BG[color],
      strokeColor: STICKY_BORDER[color],
      fillStyle: "solid",
      roundness: { type: 3 },
      label: {
        text,
        fontSize: 18,
        strokeColor: "#1e1e1e",
        textAlign: "left",
        verticalAlign: "top",
      },
    },
  ] as unknown as Parameters<typeof convertToExcalidrawElements>[0]) as unknown as ExcalidrawElement[];
};

/** Inserta una notita centrada en lo que el usuario está viendo ahora mismo
 * (no en el origen de la escena, que puede estar lejos de donde ha
 * scrolleado/hecho zoom) y la deja seleccionada, lista para arrastrar o
 * escribir encima. */
export function addStickyNoteAtViewportCenter(api: Pick<import("@excalidraw/excalidraw/types").ExcalidrawImperativeAPI, "getAppState" | "getSceneElementsIncludingDeleted" | "updateScene">) {
  const appState = api.getAppState();
  const centerScreen = { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
  const { x, y } = viewportCoordsToSceneCoords(centerScreen, appState);
  const width = 220;
  const height = 220;
  const elements = createStickyNoteElements("New note", { x: x - width / 2, y: y - height / 2, width, height });
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...elements],
    appState: { selectedElementIds: { [elements[0].id]: true } },
  });
}
