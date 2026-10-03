import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CreditCard, XCircle } from "lucide-react";
import { DrawablyButton } from "drawably/react";
import * as api from "../api";
import { useT } from "../i18n/useT";
import { ConfirmModal } from "./ConfirmModal";
import { useSubscriptionInfo } from "../hooks/useSubscriptionInfo";

/**
 * Bloqueo por impago: si la suscripción de pago está en on_hold/past_due,
 * el Worker ya rechaza todo lo de contenido con 402 (ver billingGate.ts).
 * Esto es la otra mitad — en vez de una app llena de errores, una sola
 * pantalla con las dos salidas posibles: pagar o cancelar el plan (y
 * perder sus beneficios). Se re-evalúa al montar y cada vez que alguna
 * request devuelve 402 (evento que emite el interceptor de api/client.ts)
 * — en ese caso se fuerza `refresh()` (invalida la caché compartida del
 * hook) porque aquí sí hace falta el dato más fresco posible, no el
 * cacheado de hasta 60s que basta para el resto de consumidores.
 */
export const PaymentRequiredGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useT();
  const { subscription, refresh } = useSubscriptionInfo();
  const [busy, setBusy] = useState<"pay" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // El listener lee siempre el `refresh` más reciente desde una ref: así la
  // suscripción al evento se hace una sola vez y no se rehace cada vez que
  // `refresh` cambia de identidad.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    const onPaymentRequired = () => refreshRef.current();
    window.addEventListener(api.PAYMENT_REQUIRED_EVENT, onPaymentRequired);
    return () => window.removeEventListener(api.PAYMENT_REQUIRED_EVENT, onPaymentRequired);
  }, []);

  const blockedPlan = subscription?.blocked ? subscription.planId : null;
  if (!blockedPlan) return children;

  const pay = async () => {
    setError(null);
    setBusy("pay");
    try {
      const { url } = await api.payOutstandingSubscription();
      window.location.assign(url);
    } catch {
      setError(t("billing.blocked.payError"));
      setBusy(null);
    }
  };

  const cancel = async () => {
    setConfirmCancel(false);
    setError(null);
    setBusy("cancel");
    try {
      await api.cancelSubscription();
      window.location.reload();
    } catch {
      setError(t("billing.blocked.cancelError"));
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-neutral-950 px-4">
      <div className="max-w-md w-full p-6 sm:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] text-center">
        <div className="mx-auto w-14 h-14 mb-4 bg-amber-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-amber-200 dark:border-neutral-700">
          <AlertTriangle size={28} className="text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t("billing.blocked.title")}</h1>
        <p className="text-sm text-slate-600 dark:text-neutral-300 mb-6">
          {t("billing.blocked.bodyPrefix")} <strong>{t(`plan.${blockedPlan}.name`)}</strong>
          {t("billing.blocked.bodySuffix")}
        </p>
        {error && (
          <p role="alert" className="mb-4 text-xs font-semibold text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-3">
          {/* Contenido dentro de un <span>: ver el comentario en PricingPlans.tsx. */}
          <DrawablyButton
            type="button"
            variant="solid"
            state={busy === "pay" ? "loading" : "idle"}
            onClick={() => void pay()}
            disabled={busy !== null}
            className="w-full"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <CreditCard size={16} />
              {busy === "pay" ? t("billing.blocked.paying") : t("billing.blocked.pay")}
            </span>
          </DrawablyButton>
          <DrawablyButton
            type="button"
            tone="danger"
            state={busy === "cancel" ? "loading" : "idle"}
            onClick={() => setConfirmCancel(true)}
            disabled={busy !== null}
            className="w-full"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <XCircle size={16} />
              {busy === "cancel" ? t("billing.cancel.canceling") : t("billing.cancel.button")}
            </span>
          </DrawablyButton>
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmCancel}
        title={t("billing.cancel.confirmTitle")}
        message={t("billing.cancel.confirmBody")}
        confirmText={t("billing.cancel.confirmCta")}
        cancelText={t("billing.cancel.keep")}
        onConfirm={() => void cancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
};
