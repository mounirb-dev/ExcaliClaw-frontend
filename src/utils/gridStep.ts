/** Número por defecto integrado de Excalidraw de celdas entre líneas de cuadrícula en negrita. */
export const DEFAULT_GRID_STEP = 5;
export const MIN_GRID_STEP = 1;
export const MAX_GRID_STEP = 100;

export const clampGridStep = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_GRID_STEP;
  return Math.min(MAX_GRID_STEP, Math.max(MIN_GRID_STEP, Math.round(value)));
};
