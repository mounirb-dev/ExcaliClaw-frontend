// Vista de solo lectura, sin login, de un dibujo cuyo propietario habilitó
// el enlace público (ver getPublicDrawing/setPublicSharing en
// api/drawings.ts y GET /drawings/:id/public en el backend).
// Deliberadamente una página pequeña e independiente en vez de reutilizar
// Editor.tsx: la pila del editor (autoguardado, websocket de colaboración,
// carga de biblioteca, renombrado, etc.) es toda maquinaria de usuario
// autenticado que no aplica aquí — esta página solo lee una vez y
// renderiza.
//
// También es el punto de aterrizaje del bucle de adquisición: un visitante
// que llegó a través de un diagrama embebido (ver EmbedView.tsx) y le gusta
// lo que ve obtiene un "Copiar a mi cuenta" de un clic (si está conectado)
// o un CTA de registro (si no lo está) que redirige de vuelta aquí para
// completar la copia después de registrarse.
import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import { Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import { getPublicDrawing, duplicatePublicDrawingToMyAccount } from "../api/drawings";
import { useAuth } from "../context/AuthContext";
import type { Drawing } from "../types";
import { useT } from "../i18n/useT";

const loadPublicDrawing = (
  id: string,
  signal: AbortSignal,
  onSuccess: (drawing: Drawing) => void,
  onError: () => void,
): void => {
  void getPublicDrawing(id, signal)
    .then((drawing) => {
      if (!signal.aborted) onSuccess(drawing);
    })
    .catch(() => {
      if (!signal.aborted) onError();
    });
};

export const PublicView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useT();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    loadPublicDrawing(id, controller.signal, setDrawing, () => setError(t("public.drawingUnavailable")));
    return () => controller.abort();
  }, [id, t]);

  const handleCopy = async () => {
    if (!drawing) return;
    if (!isAuthenticated) {
      navigate(`/register?redirect=${encodeURIComponent(`/view/${id}?copy=1`)}`);
      return;
    }
    setCopying(true);
    try {
      const { id: newId } = await duplicatePublicDrawingToMyAccount(drawing);
      toast.success(t("public.copiedToAccount"));
      navigate(`/app/editor/${newId}`);
    } catch {
      toast.error(t("public.copyFailed"));
      setCopying(false);
    }
  };

  // Volviendo del registro con ?copy=1 — terminar la copia que el visitante
  // pidió antes de ser enviado a registrarse, en vez de hacerle hacer clic
  // de nuevo. Encadenado con then/catch (en vez de delegar a handleCopy,
  // que es async/await) y comprobando `aborted` tras el await, para que un
  // desmontaje a mitad de la copia (navegación rápida) no dispare
  // setCopying/toast/navigate sobre un componente que ya no está en pantalla.
  useEffect(() => {
    if (authLoading || !isAuthenticated || !drawing || searchParams.get("copy") !== "1") return;
    const controller = new AbortController();
    setCopying(true);
    void duplicatePublicDrawingToMyAccount(drawing)
      .then(({ id: newId }) => {
        if (controller.signal.aborted) return;
        toast.success(t("public.copiedToAccount"));
        navigate(`/app/editor/${newId}`);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        toast.error(t("public.copyFailed"));
        setCopying(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, drawing]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-950 px-6">
        <p className="text-gray-600 dark:text-gray-400 text-center">{error}</p>
      </div>
    );
  }

  if (!drawing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-950">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <Excalidraw
        initialData={{ elements: drawing.elements, appState: drawing.appState, files: drawing.files ?? {}, scrollToContent: true }}
        viewModeEnabled
        UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false, export: { saveFileToDisk: true }, toggleTheme: true } }}
      >
        {/* Menú propio en vez del predeterminado de Excalidraw: ese trae el
            bloque "Excalidraw links" (GitHub, X, Discord) y promo de
            Excalidraw+. Aquí solo van las acciones útiles para quien mira. */}
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
      <button
        onClick={() => void handleCopy()}
        disabled={copying}
        className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold shadow-lg transition-colors"
      >
        <Copy size={16} />
        {copying ? t("public.copying") : isAuthenticated ? t("public.copyToAccount") : t("public.signUpToSave")}
      </button>
    </div>
  );
};
