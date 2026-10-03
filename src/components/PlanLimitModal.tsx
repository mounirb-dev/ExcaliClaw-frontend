import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Lock, X } from "lucide-react";
import * as api from "../api";
import type { PlanLimitEventDetail, LocalizedPrices } from "../api/billing";
import { useT } from "../i18n/useT";
import { useSubscriptionInfo } from "../hooks/useSubscriptionInfo";
import { useLocalizedPricesOnce } from "../hooks/useLocalizedPricesOnce";

/** Igual formato que PricingPlans.tsx (centavos -> "9,00 €" según moneda/idioma). */
const formatMoney = (amountMinorUnits: number, currency: string, lang: string): string => {
  const amount = amountMinorUnits / 100;
  const isWhole = Number.isInteger(amount);
  return new Intl.NumberFormat(lang, {
    style: "currency",
    currency,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

type SeatChargeInfo = { currency: string; chargeTodayMinor: number; newMonthlyMinor: number };
type Subscription = ReturnType<typeof useSubscriptionInfo>["subscription"];

/** "Se te cobrará X ahora, Y/mes en adelante" para añadir EXACTAMENTE 1
 * asiento (addSeat suma sub.extraSeats + 1): el cargo es el precio completo
 * de ese asiento nuevo, al instante, más el nuevo total mensual con él ya
 * incluido. Null si falta algún dato (no se muestra el aviso). */
const computeSeatChargeInfo = (
  canAddSeat: boolean,
  subscription: Subscription,
  prices: LocalizedPrices | null,
): SeatChargeInfo | null => {
  if (!canAddSeat || !subscription || !prices) return null;
  const planPrices = subscription.planId === "starter" ? prices.starter : prices.pro;
  if (!planPrices) return null;
  return {
    currency: prices.extraSeat.currency,
    chargeTodayMinor: prices.extraSeat.amount,
    newMonthlyMinor: planPrices.amount + (subscription.extraSeats + 1) * prices.extraSeat.amount,
  };
};

const SeatChargeNotice: React.FC<{ info: SeatChargeInfo; lang: string }> = ({ info, lang }) => {
  const { t } = useT();
  return (
    <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed text-left bg-neutral-50 dark:bg-neutral-800 rounded-xl px-3 py-2">
      {t("plan.seats.confirmChargeToday")}{" "}
      <strong className="text-neutral-900 dark:text-white">{formatMoney(info.chargeTodayMinor, info.currency, lang)}</strong> (
      {t("plan.seats.confirmInstant")}) — {t("plan.seats.confirmMonthly")}{" "}
      <strong className="text-neutral-900 dark:text-white">{formatMoney(info.newMonthlyMinor, info.currency, lang)}</strong>.
    </p>
  );
};

const AddSeatSection: React.FC<{
  chargeInfo: SeatChargeInfo | null;
  lang: string;
  adding: boolean;
  onAdd: () => void;
}> = ({ chargeInfo, lang, adding, onAdd }) => {
  const { t } = useT();
  return (
    <>
      {chargeInfo && <SeatChargeNotice info={chargeInfo} lang={lang} />}
      <button
        onClick={onAdd}
        disabled={adding}
        className="w-full px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 transition duration-200 disabled:opacity-60 disabled:cursor-wait"
      >
        {adding ? t("planLimit.addingSeat") : t("planLimit.addSeatCta")}
      </button>
    </>
  );
};

/**
 * Popup global para un 403 `plan_limit_reached` (tope de diseños o de
 * miembros — ver index.ts): a diferencia de PaymentRequiredGate esto no
 * bloquea la app entera, solo informa de la acción concreta que chocó con
 * el límite y ofrece las dos salidas — subir de plan, o (solo si el tope
 * era de miembros y ya hay un plan de pago activo) pagar un asiento extra
 * ahí mismo, sin salir de la pantalla en la que se estaba.
 */
export const PlanLimitModal: React.FC = () => {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<PlanLimitEventDetail | null>(null);
  const [addingSeat, setAddingSeat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { subscription, refresh } = useSubscriptionInfo();
  const prices = useLocalizedPricesOnce();

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<PlanLimitEventDetail>;
      setError(null);
      setDetail(custom.detail);
      // Fuerza dato fresco (no el cacheado de hasta 60s): recién chocó con
      // el límite, así que si acaba de cambiar de plan justo antes,
      // "canAddSeat" abajo debe reflejarlo ya.
      if (custom.detail.limitType === "members") refresh();
    };
    window.addEventListener(api.PLAN_LIMIT_EVENT, handler);
    return () => window.removeEventListener(api.PLAN_LIMIT_EVENT, handler);
  }, [refresh]);

  // Solo tiene sentido ofrecer "pagar un asiento más" si ya hay una
  // suscripción de pago activa a la que añadírselo — en el plan Free la
  // única salida es subir de plan.
  const canAddSeat =
    detail?.limitType === "members" &&
    subscription !== null &&
    (subscription.planId === "starter" || subscription.planId === "pro") &&
    !subscription.blocked;

  const seatChargeInfo = computeSeatChargeInfo(canAddSeat, subscription, prices);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (detail && !dialog.open) dialog.showModal();
    if (!detail && dialog.open) dialog.close();
  }, [detail]);

  const close = () => setDetail(null);

  const goToPlans = () => {
    close();
    navigate("/app/plans");
  };

  const addSeat = async () => {
    setError(null);
    setAddingSeat(true);
    try {
      const sub = await api.getSubscription();
      const result = await api.updateSubscriptionSeats(sub.extraSeats + 1);
      if (result.paymentUrl) {
        window.location.assign(result.paymentUrl);
        return;
      }
      close();
      window.location.reload();
    } catch {
      setError(t("planLimit.addSeatError"));
    } finally {
      setAddingSeat(false);
    }
  };

  if (!detail) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={t("planLimit.title")}
      className="z-[100] m-auto max-w-md w-full p-0 bg-transparent text-slate-900 dark:text-neutral-100 backdrop:bg-neutral-900/20 backdrop:backdrop-blur-sm"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="relative w-full bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] p-6 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={close}
          aria-label={t("modal.common.close")}
          className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-300 border-2 border-amber-200 dark:border-amber-900/30">
            <Lock size={22} strokeWidth={2.5} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold tracking-tight">
              {detail.limitType === "members" ? t("planLimit.title.members") : t("planLimit.title.designs")}
            </h3>
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed">
              {detail.message || t("planLimit.genericBody")}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 w-full mt-2">
            {canAddSeat && <AddSeatSection chargeInfo={seatChargeInfo} lang={lang} adding={addingSeat} onAdd={() => void addSeat()} />}
            <button
              onClick={goToPlans}
              className="w-full px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0 transition duration-200"
            >
              {t("planLimit.upgradeCta")}
            </button>
            <button
              onClick={close}
              className="w-full px-4 py-2.5 bg-transparent text-neutral-500 dark:text-neutral-400 font-bold rounded-xl hover:text-neutral-800 dark:hover:text-neutral-200 transition"
            >
              {t("planLimit.dismissCta")}
            </button>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
