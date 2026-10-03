import { languages } from '@excalidraw/excalidraw';

const STORAGE_KEY = 'excalidash-lang';

function detectLanguage(): string {
  const browserLangs = Array.from(navigator.languages ?? [navigator.language]);
  const supported = new Set(languages.map((l) => l.code));
  for (const bl of browserLangs) {
    if (supported.has(bl)) return bl;
    const prefix = bl.split('-')[0];
    const match = languages.find((l) => l.code.startsWith(prefix));
    if (match) return match.code;
  }
  return 'en';
}

export function getInitialLangCode(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? detectLanguage();
  } catch {
    return detectLanguage();
  }
}

/** El selector de idioma de la app (Settings.tsx) guarda un código plano
 * ("es", "fr") porque así están indexadas nuestras traducciones propias
 * (translations.ts) — pero el catálogo de Excalidraw usa códigos completos
 * ("es-ES", "fr-FR"; ver `languages` importado arriba). Sin este mapeo, el
 * prop `langCode` que le pasamos a <Excalidraw> no matchea ninguna entrada
 * de su catálogo y su UI propia (menú contextual, barra de herramientas)
 * cae en inglés en silencio, aunque el resto de la app sí se traduzca bien
 * (useT() sí normaliza el prefijo en la otra dirección). */
const EXCALIDRAW_LANG_CODE_OVERRIDES: Record<string, string> = {
  es: 'es-ES',
  fr: 'fr-FR',
};

export function toExcalidrawLangCode(code: string): string {
  return EXCALIDRAW_LANG_CODE_OVERRIDES[code] ?? code;
}
