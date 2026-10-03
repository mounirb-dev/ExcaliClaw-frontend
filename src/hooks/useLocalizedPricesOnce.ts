import useSWRImmutable from "swr/immutable";
import * as api from "../api";
import type { LocalizedPrices } from "../api/billing";

/** Cotización localizada de los planes (precio real de Dodo para el país de
 * esta IP). Se pide una vez y se comparte entre quien la use; `immutable`
 * porque el tipo de cambio no hace falta refrescarlo mientras la página está
 * abierta. Si falla (Dodo caído, red) queda en null y quien la usa cae a sus
 * precios base estáticos. */
export const useLocalizedPricesOnce = (): LocalizedPrices | null => {
  const { data } = useSWRImmutable<LocalizedPrices>("/billing/localized-prices", () => api.getLocalizedPrices(), {
    shouldRetryOnError: false,
  });
  return data ?? null;
};
