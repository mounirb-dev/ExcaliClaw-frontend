import React from 'react';
import { languages, useI18n } from '@excalidraw/excalidraw';

interface LanguageSelectorProps {
  langCode: string;
  onChange: (code: string) => void;
}

/**
 * Selector de idioma renderizado dentro de los hijos de <Excalidraw> para
 * que `useI18n` pueda acceder al contexto i18n de Excalidraw.
 */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  langCode,
  onChange,
}) => {
  const { t } = useI18n();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // La persistencia (reflejo en localStorage + sincronización con el
    // servidor) la posee el contexto de preferencias compartido a través
    // del manejador onChange.
    onChange(e.target.value);
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
      <span style={{ fontSize: 13, flexShrink: 0 }}>
        {t('labels.language', null, 'Language')}
      </span>
      <select
        value={langCode}
        onChange={handleChange}
        style={{
          flex: 1,
          fontSize: 13,
          padding: '2px 4px',
          borderRadius: 4,
          border: '1px solid var(--color-surface-mid)',
          background: 'var(--color-surface-low)',
          color: 'var(--color-on-surface)',
          cursor: 'pointer',
        }}
        aria-label={t('labels.language', null, 'Language')}
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
};
