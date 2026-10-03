import { clearAllLocalData } from "../utils/freshCache";
import { CLIENT_ID } from "../utils/clientId";
import axios from "axios";

// Apunta al backend de Cloudflare Worker (Appwrite + R2 + Durable
// Objects) en vez del antiguo servidor Express. La autenticación viaja en
// la cookie HttpOnly `excalidash_session` que el Worker establece en el
// login/registro (ver el backend) — ningún JWT toca nunca JS o
// Web Storage, así que `withCredentials` es todo lo que este cliente
// necesita hacer.
export const API_URL = import.meta.env.VITE_API_URL || "";

// Configuración pública del proyecto Appwrite (no es secreta — los mismos
// valores ya son visibles en las propias `vars` del Worker). Solo se usa
// para el arranque de OAuth2: el navegador habla directamente con Appwrite
// para ese único baile de redirección, y luego entrega el JWT resultante al
// Worker (ver OAuthCallback.tsx) para convertirse en la misma cookie de
// sesión HttpOnly que usa cualquier otro login.
export const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || "";
export const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID || "";

/** El id del usuario conectado, que se guarda solo para que las vistas de
 * lista puedan distinguir barato entre "mío" y "compartido conmigo" (ver
 * collections.ts) — toda lectura/escritura real sigue autorizándose del
 * lado del servidor sin importar lo que esto devuelva. Se establece a
 * partir de la respuesta de `/auth/me` (AuthContext), nunca se decodifica
 * de un token, ya que el propio token de sesión no está disponible para JS. */
let currentUserId: string | null = null;

// Las copias locales (IndexedDB cifrada) no llevan el usuario en la clave: si entra
// una cuenta distinta en este navegador (sesión caducada y otro login, p. ej.) se
// borran antes de que pueda verlas.
const CACHE_OWNER_KEY = "excaliclaw:cacheOwner";

export const setCurrentUserId = (userId: string | null): void => {
  currentUserId = userId;
  if (!userId) return;
  try {
    const owner = localStorage.getItem(CACHE_OWNER_KEY);
    if (owner && owner !== userId) void clearAllLocalData();
    localStorage.setItem(CACHE_OWNER_KEY, userId);
  } catch {
    // localStorage bloqueado: no hay dueño que comparar.
  }
};

export const getCurrentUserId = (): string | null => currentUserId;

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  // El servidor no avisa de una escritura a la pestaña que la hizo (ver utils/userFeed.ts).
  headers: { "X-Client-Id": CLIENT_ID },
});

// La cookie JWT tiene vida corta (~15min, impuesto por Appwrite del lado
// del servidor) pero la cookie de sesión subyacente de Appwrite dura mucho
// más — así que una pestaña abierta más de 15 minutos no debería empezar a
// dar 401 en cada petición sin más. Ante un 401, se emite un JWT nuevo a
// partir de esa sesión todavía válida (POST /auth/refresh) y se reintenta
// la petición original una vez. Los 401 concurrentes comparten un único
// refresh en vuelo en vez de disparar cada uno el suyo. Se saltan
// /auth/login, /auth/refresh y el propio /auth/me para que una sesión
// genuinamente expirada (o un intento de login con credenciales
// incorrectas) falle limpiamente en vez de entrar en bucle.
const NO_REFRESH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/mfa/challenge", "/auth/mfa/verify"];
let refreshInFlight: Promise<void> | null = null;
const RETRY_AFTER_DEFAULT_MS = 2000;

export const PAYMENT_REQUIRED_EVENT = "excaliclaw:payment-required";

/** El refresco de sesión falló: la sesión caducó de verdad. Como la app ya no pregunta
 * `/auth/me` en cada carga (se fía del usuario recordado un rato), este evento es lo que
 * lleva al login cuando una petición descubre que no hay sesión. */
export const SESSION_EXPIRED_EVENT = "excaliclaw:session-expired";

/** Un 403 `plan_limit_reached` (tope de diseños o de miembros del plan
 * gratis/actual — ver index.ts) — a diferencia del impago de arriba, esto
 * no bloquea la app entera, solo la acción concreta que se intentó.
 * PlanLimitModal escucha este evento y muestra un popup con el CTA de
 * subir de plan (y, si el tope era de miembros, también el de pagar un
 * asiento extra) en vez de dejar que cada sitio de la app tenga que saber
 * mostrar ese mensaje por su cuenta. */
export const PLAN_LIMIT_EVENT = "excaliclaw:plan-limit-reached";
export type PlanLimitEventDetail = { limitType: "designs" | "members"; message: string };

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config;
    const status = error?.response?.status;
    const path = (config?.url ?? "") as string;
    const alreadyRetried = config?._retriedAfterRefresh;
    // Impago (ver billingGate.ts en el Worker): PaymentRequiredGate escucha
    // este evento y pasa a la pantalla de "paga o cancela".
    if (status === 402 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(PAYMENT_REQUIRED_EVENT));
    }
    if (status === 403 && error?.response?.data?.code === "plan_limit_reached" && typeof window !== "undefined") {
      const detail: PlanLimitEventDetail = {
        limitType: error.response.data.limitType === "members" ? "members" : "designs",
        message: typeof error.response.data.error === "string" ? error.response.data.error : "",
      };
      window.dispatchEvent(new CustomEvent<PlanLimitEventDetail>(PLAN_LIMIT_EVENT, { detail }));
    }
    // 429: un solo reintento, respetando Retry-After si el servidor lo
    // manda (ver rateLimit.ts/rateLimitedResponse en el Worker), solo para
    // GET — nunca para un POST de creación sin Idempotency-Key (este
    // cliente no implementa ninguno todavía), para no arriesgar crear un
    // recurso duplicado si el primer intento en realidad sí llegó a
    // aplicarse del lado del servidor antes del 429.
    if (status === 429 && config && !config._retriedAfter429 && (config.method ?? "get").toLowerCase() === "get") {
      config._retriedAfter429 = true;
      const retryAfterHeader = error?.response?.headers?.["retry-after"];
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const waitMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : RETRY_AFTER_DEFAULT_MS;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return api.request(config);
    }
    if (status !== 401 || !config || alreadyRetried || NO_REFRESH_PATHS.some((p) => path.startsWith(p))) {
      throw error;
    }
    try {
      refreshInFlight ??= api.post("/auth/refresh").then(() => undefined).finally(() => {
        refreshInFlight = null;
      });
      await refreshInFlight;
    } catch {
      if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      throw error;
    }
    config._retriedAfterRefresh = true;
    return api.request(config);
  },
);

export { default as axios } from "axios";
export const isAxiosError = axios.isAxiosError;
