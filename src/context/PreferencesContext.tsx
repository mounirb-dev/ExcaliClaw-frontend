import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { UserPreferences } from '../api';

type Preferences = UserPreferences;
type PreferenceKey = keyof Preferences;

const STORAGE_KEY = 'excalidash-preferences';

// Claves conocidas del blob de preferencias — cualquier campo fuera de este
// conjunto (de una versión vieja/nueva conviviendo) se ignora al leer, para
// que algo obsoleto no se cuele.
const KNOWN_KEYS: PreferenceKey[] = [
  'theme',
  'dashboardSortField',
  'dashboardSortDirection',
  'language',
  'gridStep',
];

const pickKnown = (source: Partial<Preferences>): Preferences => {
  const out: Preferences = {};
  for (const key of KNOWN_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
};

// Migración única de las claves de localStorage previas al contexto, para
// que una actualización nunca pierda el tema/orden/idioma ya elegidos por
// el usuario.
const readLegacyPreferences = (): Preferences => {
  const legacy: Preferences = {};
  try {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark' || theme === 'light') legacy.theme = theme;
  } catch {
    /* ignorar almacenamiento no disponible */
  }
  try {
    const lang = localStorage.getItem('excalidash-lang');
    if (lang) legacy.language = lang;
  } catch {
    /* ignorar */
  }
  try {
    const rawSort = localStorage.getItem('excalidash-dashboard-sort');
    if (rawSort) {
      const parsed = JSON.parse(rawSort) as {
        field?: unknown;
        direction?: unknown;
      };
      if (typeof parsed.field === 'string') {
        legacy.dashboardSortField = parsed.field as Preferences['dashboardSortField'];
      }
      if (typeof parsed.direction === 'string') {
        legacy.dashboardSortDirection =
          parsed.direction as Preferences['dashboardSortDirection'];
      }
    }
  } catch {
    /* ignorar */
  }
  return pickKnown(legacy);
};

const readStoredPreferences = (): Preferences => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      return pickKnown(parsed);
    }
  } catch {
    /* continuar hacia la migración legacy */
  }
  return readLegacyPreferences();
};

interface PreferencesContextType {
  preferences: Preferences;
  updatePreferences: (partial: Partial<Preferences>) => void;
  setPreference: <K extends PreferenceKey>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(
  undefined,
);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [preferences, setPreferences] = useState<Preferences>(
    readStoredPreferences,
  );

  // Reflejar en localStorage para que las sesiones anónimas/sin conexión y
  // la siguiente recarga conserven los últimos valores conocidos.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Ignorar almacenamiento no disponible en contextos privados/embebidos.
    }
  }, [preferences]);

  // La landing ( mismo origen) escribe en
  // esta misma clave cuando cambian el tema desde ahí. Sin esto, volver a
  // /app tras tocarlo en la landing no se enteraba hasta una recarga a
  // mano: `storage` cubre otra pestaña/ventana escribiendo la clave;
  // `pageshow` con `persisted` cubre volver aquí con atrás/adelante del
  // navegador, que restaura la página desde bfcache sin remontar.
  useEffect(() => {
    const syncFromStorage = () => {
      const stored = readStoredPreferences();
      if (Object.keys(stored).length > 0) {
        setPreferences((prev) => ({ ...prev, ...stored }));
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) syncFromStorage();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) syncFromStorage();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  const updatePreferences = useCallback((partial: Partial<Preferences>) => {
    const known = pickKnown(partial);
    if (Object.keys(known).length === 0) return;
    setPreferences((prev) => ({ ...prev, ...known }));
  }, []);

  const setPreference = useCallback(
    <K extends PreferenceKey>(key: K, value: Preferences[K]) => {
      updatePreferences({ [key]: value } as Partial<Preferences>);
    },
    [updatePreferences],
  );

  const value = useMemo(
    () => ({ preferences, updatePreferences, setPreference }),
    [preferences, updatePreferences, setPreference],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- hook de consumo del contexto, intencionadamente exportado junto al Provider.
export const usePreferences = (): PreferencesContextType => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};

/**
 * Lee/escribe una sola preferencia, persistida en localStorage bajo
 * STORAGE_KEY (sin backend real — ver el comentario al inicio del archivo).
 * Devuelve una tupla `[value, setValue]`; `value` recurre a `defaultValue`
 * hasta que la clave se establezca.
 */
// eslint-disable-next-line react-refresh/only-export-components -- helper tipado de preferencias que depende del mismo contexto.
export const usePreference = <K extends PreferenceKey>(
  key: K,
  defaultValue: NonNullable<Preferences[K]>,
): readonly [NonNullable<Preferences[K]>, (value: Preferences[K]) => void] => {
  const { preferences, setPreference } = usePreferences();
  const value = (preferences[key] ??
    defaultValue) as NonNullable<Preferences[K]>;
  const setValue = useCallback(
    (next: Preferences[K]) => setPreference(key, next),
    [key, setPreference],
  );
  return [value, setValue] as const;
};
