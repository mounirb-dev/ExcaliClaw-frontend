import React from "react";
import { DrawablyCircle } from "drawably/react";
import { useTheme } from "../context/ThemeContext";
import { useT } from "../i18n/useT";

// Glifos de sol/luna dibujados a mano con jitter (no lucide) para que el
// interruptor se lea como dibujado con el mismo crayón que usa el resto
// del chrome de auth/app, no como un icono vectorial limpio soltado en un
// círculo esbozado. Cada trazo se duplica con un path gemelo ligeramente
// desplazado — eso es lo que le da al crayón su textura de garabato cerosa
// y ligeramente superpuesta en vez de una sola línea limpia.
const SunGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
    <g stroke="#d97706" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="11.8" cy="12.2" r="3.3" opacity="0.55" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 12 + Math.cos(rad) * 6.2;
        const y1 = 12 + Math.sin(rad) * 6.2;
        const x2 = 12 + Math.cos(rad) * 8.6;
        const y2 = 12 + Math.sin(rad) * 8.6;
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
    </g>
  </svg>
);

const MoonGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
    <path
      d="M18.6 14.1c-1.1 3.3-4.3 5.5-7.9 5.2-4.1-.3-7.3-3.9-7-8 .3-3.6 3-6.5 6.5-7.1-.9 1.2-1.4 2.7-1.3 4.3.3 3.6 3.4 6.3 7 6 .9-.1 1.8-.3 2.7-.4Z"
      stroke="#818cf8"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      fill="#818cf8"
      fillOpacity="0.18"
    />
    <path
      d="M18.3 13.9c-1.1 3.1-4.1 5.2-7.5 4.9-3.9-.3-6.9-3.7-6.6-7.6.3-3.4 2.8-6.1 6.1-6.7-.8 1.1-1.3 2.5-1.2 4 .3 3.4 3.2 6 6.6 5.7.9-.1 1.8-.3 2.6-.3Z"
      stroke="#818cf8"
      strokeWidth="1.1"
      strokeLinejoin="round"
      strokeLinecap="round"
      opacity="0.5"
    />
  </svg>
);

export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { theme, toggleTheme } = useTheme();
  const { t } = useT();
  const isLight = theme === "light";
  const label = isLight ? t("theme.switchToDark") : t("theme.switchToLight");

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex"
    >
      <DrawablyCircle
        stroke={isLight ? "#d97706" : "#818cf8"}
        width={1.4}
        className={`${className ?? "w-6 h-6"} flex items-center justify-center transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0`}
      >
        {isLight ? <SunGlyph /> : <MoonGlyph />}
      </DrawablyCircle>
    </button>
  );
};
