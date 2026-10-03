import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { usePreference } from './PreferencesContext';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

// skipcq: JS-W1042 — undefined es el valor inicial idiomático de un contexto opcional
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Mismo criterio que el tema de la landing: si no hay preferencia
// guardada (ni en el servidor ni en localStorage), el default sigue al tema
// del sistema operativo/navegador en vez de forzar claro siempre.
const detectSystemTheme = (): Theme =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // El estado/persistencia (localStorage, sync entre pestañas/con la landing)
  // vive en PreferencesContext; este wrapper solo posee los efectos
  // secundarios del DOM para el tema resuelto.
  const [theme, setTheme] = usePreference('theme', detectSystemTheme());

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme(theme === 'light' ? 'dark' : 'light'),
    }),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- hook de consumo del contexto, intencionadamente junto al Provider.
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
