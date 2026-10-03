import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { UploadProvider } from './context/UploadContext';
import { AuthProvider } from './context/AuthContext';
import { UserFeedConnector } from './components/UserFeedConnector';
import { PreferencesProvider } from './context/PreferencesContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { prefetchDrawing } from './api/drawings';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';
import { Loader2 } from 'lucide-react';

// Complementa a ChunkErrorBoundary.tsx (que reacciona a un `import()` de
// chunk que ya falló): si la pestaña estuvo en segundo plano varios
// minutos mientras salía un deploy nuevo, y al volver nadie navega ni
// dispara un lazy import, ese boundary nunca se entera — la pestaña se
// queda corriendo el JS viejo sin que nada lo note, hasta que algo
// realmente falla (reportado como "vuelvo tras unos minutos y la web
// está en blanco, tengo que refrescar a mano"). Esto es proactivo en vez
// de reactivo: al recuperar visibilidad tras estar oculta más de
// STALE_TAB_THRESHOLD_MS, recarga directo, sin esperar a que algo se
// rompa primero. Guardado en sessionStorage para no recargar en bucle si
// alguien deja la pestaña abierta y oculta todo el día cambiando de
// pestaña cada pocos minutos.
const STALE_TAB_THRESHOLD_MS = 3 * 60_000;
// skipcq: SCT-A000 — nombre de clave de sessionStorage, no es un secreto
const HIDDEN_SINCE_KEY = 'excaliclaw_hidden_since';
// skipcq: SCT-A000 — nombre de clave de sessionStorage, no es un secreto
const RELOAD_GUARD_KEY = 'excaliclaw_visibility_reload_at';
const RELOAD_GUARD_WINDOW_MS = 60_000;

const useReloadStaleTabOnFocus = () => {
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        try {
          sessionStorage.setItem(HIDDEN_SINCE_KEY, String(Date.now()));
        } catch {
          // sessionStorage bloqueado — sin esto, simplemente no se recarga proactivamente.
        }
        return;
      }
      let hiddenSince = 0;
      let lastReload = 0;
      try {
        hiddenSince = Number(sessionStorage.getItem(HIDDEN_SINCE_KEY) ?? '0');
        lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0');
      } catch {
        return;
      }
      if (!hiddenSince || Date.now() - hiddenSince < STALE_TAB_THRESHOLD_MS) return;
      if (Date.now() - lastReload < RELOAD_GUARD_WINDOW_MS) return;
      // El editor puede tener cambios locales sin sincronizar todavía
      // (el debounce del broadcast en vivo, un undo/redo en curso) — una
      // recarga a ciegas ahí arriesga perderlos. Fuera del editor no hay
      // estado local que perder, así que es seguro recargar sin avisar.
      const { pathname } = window.location;
      if (pathname.startsWith('/app/editor/') || pathname === '/app/try' || pathname.startsWith('/shared/')) return;
      try {
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      } catch {
        // no bloquea la recarga si no se puede guardar
      }
      window.location.reload();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
};

// Enlace directo al editor: se arranca la descarga del chunk del editor y del
// dibujo mientras /auth/me sigue en vuelo, en vez de encadenarlos tras él.
const directEditorId = /^\/app\/editor\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
if (directEditorId && directEditorId !== 'new') {
  void import('./pages/Editor');
  prefetchDrawing(directEditorId);
}

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Editor = lazy(() => import('./pages/Editor').then(m => ({ default: m.Editor })));
const NewDrawingEditor = lazy(() => import('./pages/editor/NewDrawingEditor').then(m => ({ default: m.NewDrawingEditor })));
const AnonPlayground = lazy(() => import('./pages/AnonPlayground').then(m => ({ default: m.AnonPlayground })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Plans = lazy(() => import('./pages/Plans').then(m => ({ default: m.Plans })));
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then(m => ({ default: m.Register })));
const PasswordResetRequest = lazy(() => import('./pages/PasswordResetRequest').then(m => ({ default: m.PasswordResetRequest })));
const PasswordResetConfirm = lazy(() => import('./pages/PasswordResetConfirm').then(m => ({ default: m.PasswordResetConfirm })));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback').then(m => ({ default: m.OAuthCallback })));
const McpAuthorize = lazy(() => import('./pages/McpAuthorize').then(m => ({ default: m.McpAuthorize })));
const PublicView = lazy(() => import('./pages/PublicView').then(m => ({ default: m.PublicView })));

const PageLoader = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex items-center justify-center">
    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
  </div>
);

function App() {
  useReloadStaleTabOnFocus();
  return (
    <Router>
      <AuthProvider>
        <PreferencesProvider>
          <ThemeProvider>
            <UploadProvider>
            <ChunkErrorBoundary>
            <UserFeedConnector />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/reset-password" element={<PasswordResetRequest />} />
                <Route path="/reset-password-confirm" element={<PasswordResetConfirm />} />
                <Route path="/oauth-callback" element={<OAuthCallback />} />
                <Route path="/mcp/authorize" element={<McpAuthorize />} />
                {/* Panel y carpetas comparten UN elemento de ruta (layout sin Outlet): cambiar
                    de carpeta ya no desmonta el panel, así conserva su estado y sus listas
                    recientes en vez de empezar de cero y volver a pedirlo todo. */}
                <Route
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/app" element={null} />
                  <Route path="/app/collections" element={null} />
                </Route>
                <Route
                  path="/app/settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/plans"
                  element={
                    <ProtectedRoute>
                      <Plans />
                    </ProtectedRoute>
                  }
                />
                {/* Pública a propósito: pizarra sin cuenta, todo en el
                    navegador (ver AnonPlayground.tsx). */}
                <Route path="/app/try" element={<AnonPlayground />} />
                <Route
                  path="/app/editor/new"
                  element={
                    <ProtectedRoute>
                      <NewDrawingEditor />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/editor/:id"
                  element={
                    <ProtectedRoute>
                      <Editor />
                    </ProtectedRoute>
                  }
                />
                {/* Públicas, sin prefijo /app a propósito: enlaces de
                    compartir ya enviados a gente sin cuenta no deben
                    romperse por este cambio. */}
                <Route path="/shared/:id" element={<Editor />} />
                <Route path="/view/:id" element={<PublicView />} />
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Routes>
            </Suspense>
            </ChunkErrorBoundary>
            </UploadProvider>
          </ThemeProvider>
        </PreferencesProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
