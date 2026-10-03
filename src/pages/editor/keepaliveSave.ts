import { API_URL, getCsrfHeader } from "../../api";

/**
 * Dispara un guardado de escena de mejor esfuerzo que sobrevive al unload
 * de la página.
 *
 * La canalización de guardado normal de axios no puede ejecutarse de forma
 * fiable desde un manejador de `pagehide` (interceptores async,
 * desmontaje de la conexión), así que se usa `fetch` con
 * `keepalive: true`, que el navegador garantiza vaciar incluso mientras el
 * documento se está descartando. `navigator.sendBeacon` no se puede usar
 * aquí porque no puede establecer la cabecera CSRF ni emitir un PUT.
 *
 * Devuelve true si la petición se despachó, false si no se pudo.
 */
export const saveDrawingKeepalive = (
  drawingId: string,
  body: Record<string, unknown>,
): boolean => {
  if (!drawingId || typeof fetch !== "function") return false;
  try {
    const csrf = getCsrfHeader();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (csrf) headers[csrf.name] = csrf.token;
    void fetch(`${API_URL}/drawings/${drawingId}`, {
      // PATCH: es lo que acepta el Worker en /drawings/:id (un PUT no existe ahí y el
      // guardado al cerrar la pestaña nunca llegaba a guardar nada).
      method: "PATCH",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify(body),
    });
    return true;
  } catch {
    return false;
  }
};
