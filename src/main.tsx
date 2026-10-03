import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import '@excalidraw/excalidraw/index.css'
import 'drawably/style.css'
import 'drawably/font.css'
import './index.css'
import App from './App.tsx'
import { configureDisplayFont } from './utils/displayFont'

// Se inicializa antes que cualquier otra cosa para capturar errores incluso
// durante el arranque de App (fuentes, contextos, etc). Sin dsn en dev para
// no mezclar ruido local con el proyecto real de Sentry.
Sentry.init({
  dsn: import.meta.env.PROD
    ? 'https://48dbf7819811a07af8e827493a6a5d64@o4512137427091456.ingest.de.sentry.io/4512137436135504'
    : undefined,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
  // Un 401 de la API es lo normal para quien no tiene sesión (o la tiene
  // caducada): la app ya lo gestiona yendo a /login. No es un fallo de la app
  // y llenaba Sentry de avisos.
  beforeSend(event, hint) {
    const original = hint?.originalException as { isAxiosError?: boolean; response?: { status?: number } } | undefined;
    if (original?.isAxiosError && original.response?.status === 401) return null;
    return event;
  },
})

configureDisplayFont()

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("#root no encontrado");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
