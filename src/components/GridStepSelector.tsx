import React from 'react';
import { useI18n } from '@excalidraw/excalidraw';
import { MIN_GRID_STEP, MAX_GRID_STEP, clampGridStep } from '../utils/gridStep';

interface GridStepSelectorProps {
  gridStep: number;
  onChange: (gridStep: number) => void;
}

/**
 * Control de paso de cuadrícula renderizado dentro de los hijos de
 * <Excalidraw> para que `useI18n` pueda leer el contexto i18n de
 * Excalidraw. El editor embebido expone `gridStep` en appState pero no
 * trae UI para él, así que exponemos la nuestra. La persistencia (reflejo
 * en localStorage + sincronización con el servidor) la posee el contexto
 * de preferencias a través del manejador `onChange`.
 */
export const GridStepSelector: React.FC<GridStepSelectorProps> = ({
  gridStep,
  onChange,
}) => {
  const { t } = useI18n();
  const label = t('labels.gridStep', null, 'Grid step');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseInt(e.target.value, 10);
    if (Number.isNaN(parsed)) return;
    onChange(clampGridStep(parsed));
  };

  return (
    <div
      style={{
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
      }}
    >
      <span style={{ fontSize: 13, flexShrink: 0 }}>{label}</span>
      <input
        type="number"
        min={MIN_GRID_STEP}
        max={MAX_GRID_STEP}
        step={1}
        value={gridStep}
        onChange={handleChange}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          padding: '2px 4px',
          borderRadius: 4,
          border: '1px solid var(--color-surface-mid)',
          background: 'var(--color-surface-low)',
          color: 'var(--color-on-surface)',
        }}
        aria-label={label}
      />
    </div>
  );
};
