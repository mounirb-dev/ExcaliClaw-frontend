import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { Copy, Check, Plug, X } from "lucide-react";
import { useT } from "../i18n/useT";
import { ClaudeLogo, CursorLogo, VsCodeLogo, OpenAiLogo, OpenCodeLogo, OpenClawLogo } from "./mcpClientLogos";

type Props = {
  onClose: () => void;
  /** El botón que abrió el modal — si se pasa, la animación de apertura
   * escala desde su posición en vez del centro de la pantalla, como el
   * efecto "genio" de macOS al abrir una app desde el Dock. */
  anchorRef?: React.RefObject<HTMLElement | null>;
};

type ClientId = "claudeCode" | "claudeDesktop" | "cursor" | "codex" | "vscode" | "opencode" | "openclaw";

/** El servidor MCP del backend solo acepta el Bearer OAuth que
 * mcpOauth.ts emite tras el login del cliente — las claves de API de
 * ApiKeysCard son para la REST API directa, no sirven aquí. Por eso ninguna
 * pestaña pide clave: cada cliente hace el flujo OAuth solo con la URL,
 * abriendo un navegador para el login la primera vez. */
const CLIENT_IDS: ClientId[] = ["claudeCode", "claudeDesktop", "cursor", "codex", "vscode", "opencode", "openclaw"];

/** Logo real de cada marca (ver mcpClientLogos.tsx) en vez de un icono
 * genérico de lucide-react — mismo tratamiento monocromo/currentColor que
 * el resto de iconos del modal para que no desentone. Codex CLI es de
 * OpenAI, así que usa su logo. */
const CLIENT_ICONS: Record<ClientId, React.FC<{ size?: number; className?: string }>> = {
  claudeCode: ClaudeLogo,
  claudeDesktop: ClaudeLogo,
  cursor: CursorLogo,
  vscode: VsCodeLogo,
  codex: OpenAiLogo,
  opencode: OpenCodeLogo,
  openclaw: OpenClawLogo,
};

type Snippet =
  | { kind: "code"; value: string }
  | { kind: "steps" }
  | { kind: "badge"; badgeUrl: string; deepLink: string; config: string };

/** Los badges oficiales "Install MCP Server" de Cursor y VS Code — mismo
 * patrón exacto usado por los README reales de servidores MCP publicados
 * (Context7, GitHub MCP Server, etc., confirmado contra sus READMEs en
 * vivo). Ambos apuntan a una página HTTPS del propio proveedor
 * (cursor.com/en/install-mcp, insiders.vscode.dev/redirect/mcp/install) que
 * a su vez dispara el protocolo cursor://·vscode:// — un <a href> HTTPS
 * normal, sin depender de un esquema de protocolo crudo que el navegador
 * podría no reconocer. El JSON de abajo del botón es el mismo config, por
 * si el enlace no abre la app (usuario sin la app instalada). */
const buildSnippet = (id: ClientId, mcpUrl: string): Snippet => {
  switch (id) {
    case "claudeCode":
      return {
        kind: "code",
        value: `claude mcp add excaliclaw --transport http ${mcpUrl}\nclaude "/mcp" # select "excaliclaw", then "Authenticate"`,
      };
    case "claudeDesktop":
      return { kind: "steps" };
    case "cursor": {
      const b64 = window.btoa(JSON.stringify({ url: mcpUrl }));
      return {
        kind: "badge",
        badgeUrl: "https://cursor.com/deeplink/mcp-install-dark.svg",
        deepLink: `https://cursor.com/en/install-mcp?name=excaliclaw&config=${encodeURIComponent(b64)}`,
        config: `{ "url": "${mcpUrl}" }`,
      };
    }
    case "vscode": {
      const config = `{ "type": "http", "url": "${mcpUrl}" }`;
      return {
        kind: "badge",
        badgeUrl: "https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white",
        deepLink: `https://insiders.vscode.dev/redirect/mcp/install?name=excaliclaw&config=${encodeURIComponent(config)}`,
        config,
      };
    }
    case "codex":
      return {
        kind: "code",
        value: `codex mcp add excaliclaw --url ${mcpUrl}\ncodex mcp login excaliclaw`,
      };
    case "opencode":
      return {
        kind: "code",
        value: `{\n  "mcpServers": {\n    "excaliclaw": { "url": "${mcpUrl}" }\n  }\n}`,
      };
    case "openclaw":
      return {
        kind: "code",
        value: `{\n  "mcpServers": {\n    "excaliclaw": { "url": "${mcpUrl}" }\n  }\n}`,
      };
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
};

export const McpConnectModal: React.FC<Props> = ({ onClose, anchorRef }) => {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [activeClient, setActiveClient] = useState<ClientId>("claudeCode");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mcpUrl = `${window.location.origin}/mcp`;
  const snippet = useMemo(() => buildSnippet(activeClient, mcpUrl), [activeClient, mcpUrl]);

  useEffect(() => {
    dialogRef.current?.showModal();
    const panel = panelRef.current;
    if (!panel) return;
    // Efecto "genio" estilo macOS: escala desde el botón que abrió el
    // modal (el círculo del sidebar) en vez de desde su propio centro —
    // transform-origin se calcula a partir de dónde cae ese botón sobre
    // el panel ya centrado por el <dialog>.
    const anchor = anchorRef?.current;
    let originX = "50%";
    let originY = "0%";
    if (anchor) {
      const anchorRect = anchor.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      originX = `${anchorRect.left + anchorRect.width / 2 - panelRect.left}px`;
      originY = `${anchorRect.top + anchorRect.height / 2 - panelRect.top}px`;
    }
    gsap.fromTo(
      panel,
      { opacity: 0, scale: 0.2, transformOrigin: `${originX} ${originY}` },
      { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.7)" },
    );
  }, [anchorRef]);

  const copySnippet = (value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const codeBox = (value: string) => (
    <div className="relative rounded-lg border border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 overflow-hidden">
      <button
        type="button"
        onClick={() => copySnippet(value)}
        className="absolute right-2 top-2 flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-300 hover:-translate-y-0.5 transition"
      >
        {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
        {t("profile.mcp.copyCta")}
      </button>
      <pre className="p-3 pr-20 text-xs font-mono text-slate-800 dark:text-neutral-200 whitespace-pre-wrap break-all">{value}</pre>
    </div>
  );

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={t("profile.mcp.title")}
      className="z-50 m-auto max-w-3xl max-h-[85vh] w-full p-0 overflow-hidden bg-transparent text-slate-900 dark:text-neutral-100 backdrop:bg-neutral-900/20 backdrop:backdrop-blur-sm"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {/* El propio elemento <dialog> nativo trae `overflow: auto` en el
       * user-agent stylesheet — sin overflow-hidden aquí, el navegador le
       * pone su propia barra de scroll horizontal/vertical alrededor de
       * TODO el modal en cuanto el contenido roza el borde, aunque el div
       * interno de abajo ya maneje su propio scroll. flex-col + max-h en el
       * panel: solo el bloque central hace scroll (si hace falta),
       * cabecera/selector/footer quedan fijos, con no-scrollbar igual que
       * el resto de la app. */}
      <div
        ref={panelRef}
        className="relative w-full max-h-[85vh] flex flex-col bg-white dark:bg-neutral-900 rounded-xl border border-black dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-black dark:border-neutral-700 shrink-0">
          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/30 shrink-0">
            <Plug size={14} strokeWidth={2} />
          </div>
          <h2 className="flex-1 min-w-0 text-sm font-semibold text-slate-900 dark:text-white leading-tight">{t("profile.mcp.title")}</h2>
          <button
            onClick={onClose}
            aria-label={t("modal.common.close")}
            className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-neutral-500 mb-1.5">
              {t("profile.mcp.clientsLabel")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CLIENT_IDS.map((id) => {
                const Icon = CLIENT_ICONS[id];
                const isActive = activeClient === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveClient(id)}
                    aria-pressed={isActive}
                    className={`inline-flex items-center gap-1.5 rounded-md border border-black dark:border-neutral-700 px-2 py-1 transition ${
                      isActive
                        ? "bg-indigo-600 text-white"
                        : "bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:-translate-y-0.5"
                    }`}
                  >
                    <Icon size={13} />
                    <span className="text-[11px] font-medium whitespace-nowrap">{t(`profile.mcp.client.${id}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {snippet.kind === "code" && (
            <div>
              {codeBox(snippet.value)}
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">{t(`profile.mcp.client.${activeClient}.note`)}</p>
            </div>
          )}

          {snippet.kind === "badge" && (
            <div>
              <a href={snippet.deepLink} className="inline-block">
                <img src={snippet.badgeUrl} alt={t(`profile.mcp.client.${activeClient}.oneClickCta`)} height={28} />
              </a>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2 mb-3">{t(`profile.mcp.client.${activeClient}.note`)}</p>
              <p className="text-xs font-medium text-slate-500 dark:text-neutral-400 mb-1">{t("profile.mcp.manualConfigLabel")}</p>
              {codeBox(snippet.config)}
            </div>
          )}

          {snippet.kind === "steps" && (
            <div className="text-sm">
              <ol className="list-decimal pl-5 space-y-0.5 text-slate-600 dark:text-neutral-400 mb-3">
                <li>{t("profile.mcp.claudeStep1")}</li>
                <li>{t("profile.mcp.claudeStep2")}</li>
                <li>{t("profile.mcp.claudeStep3")}</li>
              </ol>
              <p className="text-xs font-medium text-slate-500 dark:text-neutral-400 mb-1">{t("profile.mcp.urlLabel")}</p>
              {codeBox(mcpUrl)}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-black dark:border-neutral-700 shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 text-sm font-medium rounded-lg border border-black dark:border-neutral-700 hover:-translate-y-0.5 transition"
          >
            {t("profile.mcp.closeCta")}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
