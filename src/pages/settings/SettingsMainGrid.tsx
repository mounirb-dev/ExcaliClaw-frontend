import {
  Archive,
  Globe,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { DrawablyButton } from "drawably/react";
import { useT } from "../../i18n/useT";
import { usePreference } from "../../context/PreferencesContext";
import { SUPPORTED_LANGS, type Lang } from "../../i18n/translations";
import { ApiKeysCard } from "../../components/ApiKeysCard";

/** Causa real (el intento anterior — retrasar el montaje un frame — no la
 * atacaba, seguía pasando): drawablyButton() (node_modules/drawably)
 * inserta su <svg> del borde dibujado a mano con `el.prepend(svg)` —
 * DIRECTO en el DOM, fuera de lo que React rastrea como hijos de este
 * <button>. React solo conoce UN hijo: el texto (`children`). Cuando
 * cambia el idioma, t() devuelve un string nuevo y React intenta
 * actualizar "el único hijo de texto" del botón — pero en el DOM real ese
 * hijo está en la posición 1, no 0 (la posición 0 es el <svg> que
 * drawably metió por su cuenta). React actualiza mal el nodo equivocado:
 * el texto nuevo no llega bien, y en el problema puede arrastrar también
 * al <svg> del borde. No pasa con variant/tone (esos si están en las
 * deps de useSketch y SÍ se re-atachean correctamente) — pasa con
 * CUALQUIER DrawablyButton cuyo texto dependa de t(), aunque variant/tone
 * sean fijos, en CUALQUIER tarjeta de la página, no solo Export/Import.
 * Fix: `key={lang}` en cada uno de esos botones — al cambiar de idioma,
 * React ve una key distinta y hace unmount+mount limpio (un <button>
 * nuevo de verdad) en vez de intentar parchear en el sitio un DOM que la
 * librería ya modificó por fuera. */

// Los nombres de idioma se muestran siempre en su propio idioma nativo
// (convención estándar de selector de idioma) — nunca pasan por t(),
// para que alguien que no lea el idioma actual igual reconozca el suyo.
const LANG_NATIVE_NAMES: Record<Lang, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};

const LanguageCard = () => {
  const { t } = useT();
  const [language, setLanguage] = usePreference("language", "en");
  const activeLang: Lang = (SUPPORTED_LANGS as string[]).includes(language.split("-")[0])
    ? (language.split("-")[0] as Lang)
    : "en";

  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-rose-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-rose-100 dark:border-neutral-700">
        <Globe size={32} className="text-rose-600 dark:text-rose-400 hidden sm:block" />
        <Globe size={24} className="text-rose-600 dark:text-rose-400 sm:hidden" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          {t("settings.language.title")}
        </h3>
        <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
          {t("settings.language.desc")}
        </p>
      </div>
      {/* Bug real encontrado reproduciendo en producción (no era Google
       * Translate, esa teoría inicial era incorrecta — se descartó
       * reproduciendo con el traductor apagado): drawablyButton() de la
       * librería `drawably` (node_modules/drawably/dist/controls.js) hace
       * `el.classList.add("drawably-button--" + variant)` en cada cambio de
       * variant/tone pero NUNCA quita la clase vieja — su destroy() de
       * cleanup solo saca el <svg> y "drawably-host", no
       * "drawably-button--solid"/"--outline". Resultado: un botón que pasa
       * de solid→outline se queda con AMBAS clases a la vez, y
       * ".drawably-button--solid { color: var(--drawably-paper, #fff) }"
       * (definida después de ".drawably-button--neutral" en su CSS) gana
       * por orden de cascada — texto blanco sobre fondo blanco, invisible
       * pero presente en el DOM (confirmado inspeccionando los childNodes).
       *
       * Un `key` distinto por variant/tone (intento anterior) arreglaba el
       * texto pero forzaba un remount COMPLETO de los 3 botones en cada
       * click — con clicks rápidos seguidos eso desestabilizaba la propia
       * librería más allá de esta tarjeta (ResizeObserver/listeners
       * creándose y destruyéndose en ráfaga), reportado como el botón de
       * Exportar/Importar copia de seguridad —una tarjeta hermana, sin
       * relación directa— quedándose sin el borde dibujado a mano.
       *
       * Fix de verdad: variant/tone/className quedan FIJOS siempre (nunca
       * cambian entre renders), así que useSketch en react.js del paquete
       * nunca vuelve a llamar destroy()+attach() para estos botones — el
       * bug de la librería nunca se dispara porque su condición (un cambio
       * de variant/tone) deja de ocurrir. El estado "activo" se pinta con
       * Tailwind puro sobre el atributo aria-pressed (que si cambia, pero
       * no está en las deps de useSketch, así que no dispara nada). */}
      <div className="w-full pt-2 flex gap-2" translate="no">
        {SUPPORTED_LANGS.map((lang) => (
          <DrawablyButton
            key={lang}
            type="button"
            variant="outline"
            tone="neutral"
            className="flex-1 px-2 text-xs notranslate rounded-lg aria-pressed:bg-indigo-600 aria-pressed:text-white"
            onClick={() => setLanguage(lang)}
            aria-pressed={activeLang === lang}
          >
            {LANG_NATIVE_NAMES[lang]}
          </DrawablyButton>
        ))}
      </div>
    </div>
  );
};

const TwoFactorCard = ({
  twoFactorEnabled,
  onOpenTwoFactor,
}: {
  twoFactorEnabled: boolean;
  onOpenTwoFactor: () => void;
}) => {
  const { t } = useT();
  return (
    <button
      onClick={onOpenTwoFactor}
      className="w-full flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition duration-200 group"
    >
      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-emerald-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-emerald-100 dark:border-neutral-700 group-hover:border-emerald-200 dark:group-hover:border-neutral-600 transition-colors">
        {twoFactorEnabled ? (
          <ShieldCheck size={32} className="text-emerald-600 dark:text-emerald-400 hidden sm:block" />
        ) : (
          <ShieldOff size={32} className="text-emerald-600 dark:text-emerald-400 hidden sm:block" />
        )}
        {twoFactorEnabled ? (
          <ShieldCheck size={24} className="text-emerald-600 dark:text-emerald-400 sm:hidden" />
        ) : (
          <ShieldOff size={24} className="text-emerald-600 dark:text-emerald-400 sm:hidden" />
        )}
      </div>
      <div className="text-center">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          {t("settings.mfa.title")}
        </h3>
        <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
          {twoFactorEnabled ? t("settings.mfa.on") : t("settings.mfa.off")}
        </p>
      </div>
    </button>
  );
};

type SettingsMainGridProps = {
  exportBackup: () => void;
  onImportBackup: () => void;
  isImporting: boolean;
  twoFactorEnabled: boolean;
  onOpenTwoFactor: () => void;
};

export const SettingsMainGrid = ({
  exportBackup,
  onImportBackup,
  isImporting,
  twoFactorEnabled,
  onOpenTwoFactor,
}: SettingsMainGridProps) => {
  const { t, lang } = useT();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700">
          <Archive
            size={32}
            className="text-indigo-600 dark:text-indigo-400 hidden sm:block"
          />
          <Archive
            size={24}
            className="text-indigo-600 dark:text-indigo-400 sm:hidden"
          />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
            {t("settings.export.title")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
            {t("settings.export.desc")}
          </p>
        </div>
        <div className="w-full pt-2 flex flex-col gap-2">
          <DrawablyButton key={`export-${lang}`} type="button" variant="solid" className="w-full" onClick={exportBackup}>
            {t("settings.export.cta")}
          </DrawablyButton>
          <DrawablyButton
            key={`import-${lang}`}
            type="button"
            tone="neutral"
            className="w-full"
            onClick={onImportBackup}
            disabled={isImporting}
            state={isImporting ? "loading" : "idle"}
          >
            {isImporting ? t("settings.import.importing") : t("settings.import.cta")}
          </DrawablyButton>
        </div>
      </div>
      <TwoFactorCard twoFactorEnabled={twoFactorEnabled} onOpenTwoFactor={onOpenTwoFactor} />
      <LanguageCard />
      {/* A diferencia de las otras 3 tarjetas, esta ocupa la fila entera en
       * escritorio (md:col-span-2 lg:col-span-3) — antes quedaba sola en
       * una fila nueva del grid de 3 columnas, con 2/3 de espacio vacío al
       * lado y su propio contenido apretado sin necesidad. */}
      <div className="md:col-span-2 lg:col-span-3">
        <ApiKeysCard />
      </div>
    </div>
  );
};
