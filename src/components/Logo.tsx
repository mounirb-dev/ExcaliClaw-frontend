import React from 'react';

/** Símbolo neutral de sustitución. El logo de ExcaliClaw (la mascota) no se distribuye en este
 * repositorio porque la marca no está licenciada; sustitúyelo por el tuyo. */
export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="Logo"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="24" height="24" rx="5" />
      <path d="M10 22 L22 10" />
      <path d="M10 14 L14 10" />
    </svg>
  );
};
