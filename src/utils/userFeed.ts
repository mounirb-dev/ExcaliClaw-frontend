import { bumpDrawingsEpoch } from "./drawingsEpoch";

/** Canal de avisos "tus datos cambiaron" (ver el backend).
 *
 * Mantiene UN WebSocket por pestaña con la oficina de este usuario en Cloudflare. Cuando
 * otra pestaña o dispositivo guarda algo, llega un aviso: se invalidan las copias locales
 * (época de escrituras y biblioteca) y se emite DATA_CHANGED_EVENT para que el panel se
 * refresque si está a la vista. Mientras no llegue ningún aviso, las copias locales se
 * siguen usando sin preguntar al servidor. */
export const DATA_CHANGED_EVENT = "excaliclaw:data-changed";

const PING_INTERVAL_MS = 50_000;
const MAX_BACKOFF_MS = 30_000;

type FeedMessage = { type?: string; kinds?: unknown };

export type UserFeedOptions = {
  url: string;
  /** Invalida la copia local de la biblioteca (otro dispositivo la cambió). */
  onLibraryChanged: () => void;
  /** Renueva la sesión (el upgrade del WebSocket no pasa por el interceptor de axios). */
  refreshSession: () => Promise<unknown>;
};

/** Arranca el canal; devuelve la función que lo detiene. */
export const startUserFeed = ({ url, onLibraryChanged, refreshSession }: UserFeedOptions): (() => void) => {
  let stopped = false;
  let socket: WebSocket | null = null;
  let hasConnectedBefore = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let refreshedForAccess = false;

  const announceChange = (kinds: readonly string[]) => {
    if (kinds.includes("library")) onLibraryChanged();
    if (kinds.includes("content") || kinds.length === 0) {
      bumpDrawingsEpoch();
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    }
  };

  const clearTimers = () => {
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    if (pingTimer !== null) clearInterval(pingTimer);
    reconnectTimer = null;
    pingTimer = null;
  };

  const scheduleReconnect = () => {
    if (stopped || document.hidden) return;
    const base = Math.min(1000 * 2 ** reconnectAttempt, MAX_BACKOFF_MS);
    reconnectAttempt += 1;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, base * 0.5 + Math.random() * base * 0.5);
  };

  function connect() {
    if (stopped) return;
    reconnectTimer = null;
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      reconnectAttempt = 0;
      refreshedForAccess = false;
      // Una reconexión significa que pudo haber avisos que no llegaron: se invalida todo por
      // si acaso. La primera conexión no, para no tirar copias locales vigentes al entrar.
      if (hasConnectedBefore) {
        onLibraryChanged();
        announceChange(["content"]);
      }
      hasConnectedBefore = true;
      if (pingTimer !== null) clearInterval(pingTimer);
      // "ping" lo contesta Cloudflare solo (sin despertar la Durable Object).
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, PING_INTERVAL_MS);
    };
    ws.onmessage = (event) => {
      if (event.data === "pong") return;
      try {
        const message = JSON.parse(String(event.data)) as FeedMessage;
        if (message.type !== "changed") return;
        announceChange(Array.isArray(message.kinds) ? message.kinds.map(String) : []);
      } catch {
        // mensaje que no es JSON: se ignora
      }
    };
    ws.onclose = (event) => {
      if (pingTimer !== null) clearInterval(pingTimer);
      pingTimer = null;
      if (stopped) return;
      // JWT caducado: el upgrade se rechaza y el navegador lo ve como 1006. Se renueva la
      // sesión y se reintenta una vez; si no es posible se sigue con la espera normal.
      if ((event.code === 1006 || event.code === 1008) && !refreshedForAccess) {
        refreshedForAccess = true;
        refreshSession().then(
          () => connect(),
          () => scheduleReconnect(),
        );
        return;
      }
      scheduleReconnect();
    };
  }

  // Pestaña oculta: no se insiste en reconectar; al volver a verse se reconecta ya.
  const onVisibility = () => {
    if (stopped || document.hidden) return;
    const state = socket?.readyState;
    if (state !== WebSocket.OPEN && state !== WebSocket.CONNECTING) {
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      connect();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  connect();

  return () => {
    stopped = true;
    clearTimers();
    document.removeEventListener("visibilitychange", onVisibility);
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.close();
    }
  };
};
