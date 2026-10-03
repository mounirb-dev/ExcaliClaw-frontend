import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { StickyNote } from "lucide-react";
import { useT } from "../i18n/useT";
import { useTheme } from "../context/ThemeContext";
import { usePreference } from "../context/PreferencesContext";
import { getInitialLangCode, toExcalidrawLangCode } from "../utils/languagePreference";
import { DEFAULT_GRID_STEP } from "../utils/gridStep";
import { GridStepSelector } from "../components/GridStepSelector";
import { LanguageSelector } from "../components/LanguageSelector";
import { UIOptions } from "./editor/shared";
import { useEditorGridStep } from "./editor/useEditorGridStep";
import { addStickyNoteAtViewportCenter } from "../utils/stickyNote";

/** Pizarra para visitantes sin cuenta (/app/try). Todo vive en memoria del
 * navegador: no hay llamadas a la API (cero coste en Appwrite/R2/Worker por
 * visitante) y tampoco se escribe nada en localStorage/sessionStorage, así
 * que recargar o salir borra el dibujo. El banner de arriba invita a
 * registrarse para guardar de verdad. */
export const AnonPlayground: React.FC = () => {
  const { t } = useT();
  const { theme } = useTheme();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  // Mismas preferencias (idioma de Excalidraw y cuadrícula) que el editor de
  // /app, guardadas solo en el navegador como ya hacía el resto de la app.
  const [rawLangCode, setLangCode] = usePreference("language", getInitialLangCode());
  const [gridStep, setGridStep] = usePreference("gridStep", DEFAULT_GRID_STEP);
  const [isReady, setIsReady] = useState(false);
  useEditorGridStep({ excalidrawAPI: apiRef, isReady, gridStep });

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-neutral-950 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b-2 border-black dark:border-neutral-700 bg-indigo-50 dark:bg-neutral-900">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{t("anon.title")}</p>
          <p className="text-xs text-slate-600 dark:text-neutral-400">{t("anon.notice")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/login"
            className="px-3 py-1.5 rounded-lg text-sm font-bold border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-white"
          >
            {t("anon.login")}
          </Link>
          <Link
            to="/register"
            className="px-3 py-1.5 rounded-lg text-sm font-bold border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          >
            {t("anon.register")}
          </Link>
        </div>
      </header>
      <div className="flex-1 relative">
        {/* Sin "Web Embed" (carga webs de terceros; Excalidraw no ofrece una
            prop para quitarlo, de ahí el CSS — solo existe mientras esta
            página está montada) ni "Generate → Mermaid" (aiEnabled={false}). */}
        <style>{'[data-testid="toolbar-embeddable"]{display:none!important}'}</style>
        <Excalidraw
          theme={theme === "dark" ? "dark" : "light"}
          UIOptions={UIOptions}
          aiEnabled={false}
          langCode={toExcalidrawLangCode(rawLangCode)}
          excalidrawAPI={(api) => {
            apiRef.current = api;
            setIsReady(Boolean(api));
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.DefaultItems.Help />
            <MainMenu.Separator />
            <MainMenu.Item
              icon={<StickyNote size={16} />}
              onSelect={() => apiRef.current && addStickyNoteAtViewportCenter(apiRef.current)}
            >
              {t("editor.addStickyNoteMenu")}
            </MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.ItemCustom>
              <GridStepSelector gridStep={gridStep} onChange={setGridStep} />
            </MainMenu.ItemCustom>
            <MainMenu.ItemCustom>
              <LanguageSelector langCode={toExcalidrawLangCode(rawLangCode)} onChange={setLangCode} />
            </MainMenu.ItemCustom>
          </MainMenu>
        </Excalidraw>
      </div>
    </div>
  );
};
