import { useMemo, useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import * as api from "../api";
import { useT } from "../i18n/useT";
import { useSubscriptionInfo } from "../hooks/useSubscriptionInfo";

/** Extraída de settings/SettingsMainGrid.tsx (vivía ahí junto al resto de
 * Ajustes) — se movió aquí para vivir junto al resto de contenido de plan
 * en pages/Plans.tsx, ahora que el plan tiene su propia página. */
export const BillingCard = () => {
  const { t, lang } = useT();
  const { subscription, loading, error: fetchError } = useSubscriptionInfo();
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState(false);

  const openPortal = async () => {
    setError(false);
    setOpeningPortal(true);
    try {
      const { url } = await api.openBillingPortal();
      window.location.assign(url);
    } catch {
      setError(true);
      setOpeningPortal(false);
    }
  };

  const planId = subscription?.planId ?? "free";
  // El portal de Dodo necesita un customer_id, que solo existe tras la
  // primera compra (POST /billing/portal devuelve 400 "No billing account
  // yet" si no) — en vez de dejar que el usuario Free le dé al botón y se
  // encuentre con un error genérico de "no se pudo abrir", ni se muestra:
  // se explica por qué no aplica todavía.
  const hasPaidPlan = planId === "starter" || planId === "pro";
  const planName = t(`plan.${planId}.name`);
  const statusKey = subscription?.status
    ? `settings.billing.status.${subscription.status}`
    : "settings.billing.status.free";
  const status = t(statusKey);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(lang, { dateStyle: "medium" }),
    [lang],
  );
  const periodEnd = subscription?.currentPeriodEnd
    ? dateFormatter.format(new Date(subscription.currentPeriodEnd))
    : t("settings.billing.noRenewal");

  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-violet-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-violet-100 dark:border-neutral-700">
        <CreditCard size={32} className="text-violet-600 dark:text-violet-400 hidden sm:block" />
        <CreditCard size={24} className="text-violet-600 dark:text-violet-400 sm:hidden" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          {t("settings.billing.title")}
        </h3>
        <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[240px] mx-auto">
          {t("settings.billing.desc")}
        </p>
      </div>
      <div className="w-full rounded-xl bg-slate-50 dark:bg-neutral-800 px-3 py-2.5 text-xs">
        {loading ? (
          <div className="space-y-2" aria-busy="true" aria-label={t("settings.billing.title")}>
            <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-neutral-700 animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-neutral-700 animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-slate-500 dark:text-neutral-400">{t("settings.billing.plan")}</span>
            <span className="text-right font-bold text-slate-900 dark:text-white">{planName}</span>
            <span className="text-slate-500 dark:text-neutral-400">{t("settings.billing.status")}</span>
            <span className="text-right font-bold text-emerald-600 dark:text-emerald-400">{status}</span>
            <span className="text-slate-500 dark:text-neutral-400">{t("settings.billing.periodEnd")}</span>
            <span className="text-right font-bold text-slate-900 dark:text-white">{periodEnd}</span>
          </div>
        )}
      </div>
      {!loading && !hasPaidPlan ? (
        <p className="text-center text-xs text-slate-500 dark:text-neutral-400 px-2">
          {t("settings.billing.noPlanNotice")}
        </p>
      ) : (
        <>
          {(error || fetchError) && (
            <p className="text-center text-xs font-semibold text-red-700 dark:text-red-300" role="alert">
              {t("settings.billing.error")}
            </p>
          )}
          <div className="w-full pt-2">
            <button
              type="button"
              onClick={() => void openPortal()}
              disabled={openingPortal}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-violet-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0"
            >
              {openingPortal ? t("settings.billing.opening") : t("settings.billing.manage")}
              {!openingPortal && <ExternalLink size={15} aria-hidden="true" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
