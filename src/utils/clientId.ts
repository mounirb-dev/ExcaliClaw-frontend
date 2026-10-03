/** Identificador de ESTA pestaña. Se manda en cada petición de la API (cabecera
 * `X-Client-Id`) y al abrir el canal de avisos, para que el servidor no avise a la pestaña
 * que acaba de escribir (ya conoce su propio cambio). */
export const CLIENT_ID: string =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;
