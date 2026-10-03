import { useCallback } from "react";
import useSWR from "swr";
import * as api from "../api";
import type { SubscriptionInfo } from "../api/billing";

/** GET /billing/subscription compartido entre TODOS los consumidores
 * (BillingCard, PaymentRequiredGate, PricingPlans, PlanLimitModal...). SWR
 * hace lo que antes se montaba a mano: una sola petición en vuelo por clave,
 * caché en memoria compartida (nada de localStorage: no debe sobrevivir a una
 * recarga real) y reparto del dato nuevo a todos los componentes que lo usan.
 *
 *  - dedupingInterval 60 s: el mismo TTL de antes; varios componentes
 *    montados a la vez no disparan peticiones repetidas.
 *  - Sin revalidar al volver el foco: eso es justo lo que genera bucles de
 *    peticiones en visores embebidos; el dato se refresca con `refresh()`
 *    cuando hace falta (p. ej. tras un 402 de impago).
 *  - Sin reintentos automáticos: un 401 (sin sesión) no es transitorio. */
export const SUBSCRIPTION_KEY = "/billing/subscription";

// `refresh()` debe ignorar la copia reciente de sessionStorage (p. ej. tras pagar).
let forceNextFetch = false;

export const useSubscriptionInfo = () => {
  const { data, error, isLoading, mutate } = useSWR<SubscriptionInfo>(SUBSCRIPTION_KEY, () => {
    const force = forceNextFetch;
    forceNextFetch = false;
    return force ? api.getSubscription() : api.getSubscriptionCached();
  }, {
    dedupingInterval: 60_000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
  /** Fuerza dato fresco (ignora la caché de 60 s). Identidad estable (`mutate`
   * de SWR lo es): quien lo pone en las dependencias de un efecto no
   * resuscribe en cada render. */
  const refresh = useCallback(() => {
    forceNextFetch = true;
    void mutate();
  }, [mutate]);
  return { subscription: data ?? null, loading: isLoading, error: Boolean(error), refresh };
};
