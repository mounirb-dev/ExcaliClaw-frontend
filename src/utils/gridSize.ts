/** Excalidraw usa `null` en runtime para "sin cuadrícula" (ver `NullableGridSize`
 * en sus tipos), aunque `AppState.gridSize` esté tipado como `number`. Cambiarlo
 * a `undefined` haría que Excalidraw aplicara su tamaño por defecto. */
export const GRID_DISABLED = null as unknown as number;
