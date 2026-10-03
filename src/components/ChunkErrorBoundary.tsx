import React from "react";
import * as Sentry from "@sentry/react";
import { Loader2 } from "lucide-react";

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically imported module/i;

const RELOAD_GUARD_KEY = "excaliclaw_chunk_reload_at";
// Ventana mínima entre recargas automáticas: sin esto, si el chunk sigue
// faltando tras recargar (deploy real roto, no solo una pestaña vieja),
// entraríamos en un bucle infinito de recargas.
const RELOAD_GUARD_WINDOW_MS = 10_000;

type State = { hasChunkError: boolean; hasOtherError: boolean };

/**
 * Cada deploy nuevo cambia el hash de los archivos JS (ver vite build). Una
 * pestaña que quedó abierta desde antes del deploy todavía referencia los
 * chunks del build viejo — cuando React intenta cargar una ruta lazy
 * (App.tsx) con `import()`, ese chunk ya no existe en el servidor y la
 * promesa rechaza. Sin este boundary, React desmonta el árbol entero en
 * silencio: pantalla en blanco, sin log visible para el usuario, sin forma
 * de recuperarse salvo un F5 manual. Aquí se detecta ese caso específico y
 * se recarga una sola vez automáticamente (guardado en sessionStorage para
 * no entrar en bucle si el chunk sigue faltando después de recargar).
 */
export class ChunkErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasChunkError: false, hasOtherError: false };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    if (CHUNK_ERROR_PATTERN.test(message)) {
      // Transitorio (pestaña vieja tras un deploy) — no vale la pena
      // reportarlo a Sentry, se resuelve solo con la recarga de abajo.
      return { hasChunkError: true, hasOtherError: false };
    }
    Sentry.captureException(error);
    return { hasChunkError: false, hasOtherError: true };
  }

  componentDidUpdate(): void {
    if (!this.state.hasChunkError) return;
    let lastReload = 0;
    try {
      lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? "0");
    } catch {
      // sessionStorage bloqueado (ventana privada) — recarga igual, sin guardar el intento.
    }
    if (Date.now() - lastReload < RELOAD_GUARD_WINDOW_MS) return;
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
      // no bloquea la recarga si no se puede guardar
    }
    window.location.reload();
  }

  render() {
    if (this.state.hasOtherError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-neutral-950 text-slate-600 dark:text-neutral-300 text-sm font-semibold gap-2">
          Algo salió mal.
          <button
            onClick={() => window.location.reload()}
            className="underline text-indigo-600 dark:text-indigo-400"
          >
            Recargar
          </button>
        </div>
      );
    }
    if (this.state.hasChunkError) {
      // La recarga ya se dispara en componentDidUpdate — pero si la pestaña
      // está en segundo plano (o el navegador frena sus timers por
      // inactividad), esa recarga puede tardar en ejecutarse de verdad.
      // Antes esto devolvía null (pantalla en blanco) mientras tanto —
      // reportado como "me voy unos minutos y vuelvo con la web en
      // blanco, tengo que refrescar a mano". Un mensaje visible no acelera
      // la recarga, pero dice que hay algo pasando en vez de nada.
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-neutral-950 text-slate-500 dark:text-neutral-400 text-sm font-semibold gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Actualizando…
        </div>
      );
    }
    return this.props.children;
  }
}
