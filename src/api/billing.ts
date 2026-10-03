import { api, getCurrentUserId } from "./client";
import { getFresh, setFresh } from "../utils/freshCache";

export { PAYMENT_REQUIRED_EVENT, PLAN_LIMIT_EVENT, type PlanLimitEventDetail } from "./client";

export type PlanId = "free" | "starter" | "pro" | "enterprise";
export type PaidPlanId = "starter" | "pro";

export type PlanLimits = {
  maxDesigns: number | null;
  maxSharedAtOnce: number | null;
  maxMembers: number | null;
  embedAllowed: boolean;
  /** Días que se conserva el historial de versiones de un dibujo; null = sin límite. */
  versionRetentionDays: number | null;
};

export type BillingInterval = "month" | "year";

export type SubscriptionInfo = {
  /** Mensual o anual del plan contratado; null sin plan de pago, o si el
   * Worker no pudo leerlo de Dodo (la UI asume mensual). */
  interval?: BillingInterval | null;
  /** Plan contratado (aunque esté en impago); "free" si no hay ninguno. */
  planId: PlanId;
  /** Límites efectivos — los de free si está bloqueado o cancelado. */
  limits: PlanLimits;
  extraSeats: number;
  status: string;
  /** true = impago (on_hold/past_due): toda la app queda bloqueada. */
  blocked: boolean;
  currentPeriodEnd: string | null;
};

// La suscripción casi nunca cambia entre dos cargas de la app: se guarda en la copia
// local cifrada (store de zustand + IndexedDB con WebCrypto), atada al usuario conectado,
// y se reutiliza dentro del margen de seguridad de FRESH_MAX_AGE_MS. `getSubscription`
// pide siempre la red (checkout, impago, registro) y deja el dato fresco para las
// siguientes lecturas cacheadas. El servidor sigue aplicando los límites y el bloqueo
// por impago en cada petición, así que una copia algo vieja solo afecta a lo que se muestra.
const subscriptionCacheKey = (userId: string): string => `subscription:${userId}`;

export const getSubscription = async (): Promise<SubscriptionInfo> => {
  const response = await api.get<SubscriptionInfo>("/billing/subscription");
  const userId = getCurrentUserId();
  if (userId) void setFresh(subscriptionCacheKey(userId), response.data);
  return response.data;
};

/** Como `getSubscription`, pero reutiliza la copia reciente del mismo usuario. */
export const getSubscriptionCached = async (): Promise<SubscriptionInfo> => {
  const userId = getCurrentUserId();
  if (userId) {
    const hit = await getFresh<SubscriptionInfo>(subscriptionCacheKey(userId), { useEpoch: false });
    if (hit) return hit.value;
  }
  return getSubscription();
};

export const createCheckoutSession = async (
  planId: PaidPlanId,
  extraSeats: number,
  interval: BillingInterval = "month",
): Promise<{ url: string }> => {
  const response = await api.post<{ url: string }>("/billing/checkout", { planId, extraSeats, interval });
  return response.data;
};

/** Pasa el plan contratado de mensual a anual (o al revés). Dodo cobra o
 * abona la diferencia al instante; si necesita un paso de pago devuelve
 * `paymentUrl` y hay que redirigir ahí. */
export const changeBillingInterval = async (
  interval: BillingInterval,
): Promise<{ interval?: BillingInterval; paymentUrl?: string }> => {
  const response = await api.post<{ interval?: BillingInterval; paymentUrl?: string }>("/billing/interval", { interval });
  return response.data;
};

/** Cambia los asientos extra del plan actual. Si Dodo necesita un paso de
 * pago devuelve `paymentUrl` y hay que redirigir ahí. */
export const updateSubscriptionSeats = async (
  extraSeats: number,
): Promise<{ extraSeats?: number; paymentUrl?: string }> => {
  const response = await api.post<{ extraSeats?: number; paymentUrl?: string }>("/billing/seats", { extraSeats });
  return response.data;
};

export const cancelSubscription = async (): Promise<void> => {
  await api.post("/billing/cancel");
};

/** Link para pagar una suscripción en impago. */
export const payOutstandingSubscription = async (): Promise<{ url: string }> => {
  const response = await api.post<{ url: string }>("/billing/pay");
  return response.data;
};

export const openBillingPortal = async (): Promise<{ url: string }> => {
  const response = await api.post<{ url: string }>("/billing/portal");
  return response.data;
};

export type LocalizedPrice = { currency: string; amount: number };
export type LocalizedPrices = {
  country: string;
  starter: LocalizedPrice;
  pro: LocalizedPrice;
  extraSeat: LocalizedPrice;
  /** Precios del plan anual (por año). Ausente en una respuesta antigua
   * cacheada en el navegador: la UI cae a los precios anuales estáticos. */
  annual?: { starter: LocalizedPrice; pro: LocalizedPrice; extraSeat: LocalizedPrice };
};

/** Precio real (moneda + monto) que Dodo cobraría a alguien facturando
 * desde el país de esta IP — la misma Adaptive Currency que usa su checkout
 * hospedado, consultada de antemano (ver el backend). Pública,
 * sin auth: la usa tanto Settings/Plans (con sesión) como la landing
 * pública, donde nadie tiene sesión todavía. */
export const getLocalizedPrices = async (): Promise<LocalizedPrices> => {
  const response = await api.get<LocalizedPrices>("/billing/localized-prices");
  return response.data;
};
