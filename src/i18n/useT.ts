import { useCallback } from "react";
import { usePreferences } from "../context/PreferencesContext";
import { DEFAULT_LANG, SUPPORTED_LANGS, translations, type Lang } from "./translations";

/**
 * Deriva el idioma del shell de la app a partir de la preferencia guardada
 * (que usa los códigos de Excalidraw, tipo "es" o "es-ES" — ver
 * LanguageSelector.tsx), tomando solo el prefijo de idioma. Cualquier código
 * no soportado cae a `DEFAULT_LANG` en vez de romper la UI.
 */
const resolveLang = (raw: string | undefined): Lang => {
  const primary = raw?.split("-")[0]?.toLowerCase();
  return (SUPPORTED_LANGS as string[]).includes(primary ?? "")
    ? (primary as Lang)
    : DEFAULT_LANG;
};

/**
 * Hook de traducción del shell de la app (Dashboard, Settings, planes...).
 * Independiente del `useI18n` de Excalidraw, que solo cubre el lienzo del
 * editor. Cae al inglés si falta la clave en el idioma actual, y a la
 * clave cruda si falta en ambos — nunca deja un hueco en blanco.
 */
export const useT = () => {
  const { preferences } = usePreferences();
  const lang = resolveLang(preferences.language);

  const t = useCallback(
    (key: string): string =>
      translations[lang][key] ?? translations[DEFAULT_LANG][key] ?? key,
    [lang],
  );

  return { t, lang };
};
