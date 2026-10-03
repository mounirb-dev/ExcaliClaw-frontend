import { useEffect, useState } from "react";
import { Check, Minus, Sparkles, Users } from "lucide-react";
import { DrawablyAlert, DrawablyBadge, DrawablyButton } from "drawably/react";
import { useT } from "../i18n/useT";
import * as api from "../api";
import type { BillingInterval, PlanId as ApiPlanId, LocalizedPrices } from "../api/billing";
import { ConfirmModal } from "./ConfirmModal";
import { useSubscriptionInfo } from "../hooks/useSubscriptionInfo";
import { useLocalizedPricesOnce } from "../hooks/useLocalizedPricesOnce";
import { displayFontFamily } from "../utils/displayFont";

/** Formatea un monto en unidad mínima de moneda (centavos) con Intl, en vez
 * de un símbolo puesto a mano — así "1021 USD" sale "$10.21" y "900 EUR"
 * sale "9,00 €" según corresponda, sin decimales de más cuando el monto es
 * un entero exacto de la moneda. */
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

/**
 * Datos de planes: borrador de precios acordado (ver diseño de referencia en
 * el artifact de Claude). MCP/IA siempre ilimitado en todos los planes — es
 * la ventaja AI-native del producto — y el único límite real es cuántos
 * diseños puedes tener compartidos/en vivo a la vez.
 *
 * Todo el texto visible pasa por `useT()` (ver ../i18n) — nada aquí queda
 * fijo en español, para que coincida con el idioma del resto de la app.
 */
export type PlanId = "free" | "starter" | "pro" | "enterprise";

type PlanFeature = {
  labelKey: string;
  included: boolean;
  emphasis?: boolean;
};

type Plan = {
  id: PlanId;
  nameKey: string;
  price: string | null;
  priceKey?: string;
  priceUnit?: string;
  taglineKey?: string;
  featured?: boolean;
  ctaKey: string;
  features: PlanFeature[];
  /** Solo para planes de pago: precio base mensual y asientos incluidos
   * antes de que un asiento extra empiece a cobrar — usados para el
   * selector de cantidad de miembros (ver SeatStepper) y deben coincidir
   * con PLAN_LIMITS/DODO_PRODUCT_IDS en el backend. */
  basePrice?: number;
  includedSeats?: number;
};

const EXTRA_SEAT_PRICE = 3;

// Anual = 2 meses gratis (10 mensualidades al año). Fallback estático en EUR
// mientras no cargue la cotización real de /billing/localized-prices — debe
// coincidir con los productos anuales de Dodo.
const ANNUAL_BASE_PRICE: Record<"starter" | "pro", number> = { starter: 90, pro: 290 };
const EXTRA_SEAT_ANNUAL_PRICE = 30;

const PLANS: Plan[] = [
  {
    id: "free",
    nameKey: "plan.free.name",
    price: "€0",
    taglineKey: "plan.free.tagline",
    ctaKey: "plan.free.cta",
    features: [
      { labelKey: "plan.feat.designs200", included: true },
      { labelKey: "plan.feat.live2", included: false },
      { labelKey: "plan.feat.members1", included: false },
      { labelKey: "plan.feat.history1", included: true },
      { labelKey: "plan.feat.mcp", included: true, emphasis: true },
      { labelKey: "plan.feat.publicLink", included: true },
      { labelKey: "plan.feat.embed", included: false },
      { labelKey: "plan.feat.emailSupport", included: true },
    ],
  },
  {
    id: "starter",
    nameKey: "plan.starter.name",
    price: "€9",
    priceUnit: "/mo",
    taglineKey: "plan.starter.tagline",
    ctaKey: "plan.starter.cta",
    basePrice: 9,
    includedSeats: 5,
    features: [
      { labelKey: "plan.feat.designsUnlimited", included: true },
      { labelKey: "plan.feat.live10", included: true },
      { labelKey: "plan.feat.members5", included: true },
      { labelKey: "plan.feat.history30", included: true },
      { labelKey: "plan.feat.mcp", included: true, emphasis: true },
      { labelKey: "plan.feat.publicLink", included: true },
      { labelKey: "plan.feat.embed", included: false },
      { labelKey: "plan.feat.emailSupport", included: true },
    ],
  },
  {
    id: "pro",
    nameKey: "plan.pro.name",
    price: "€29",
    priceUnit: "/mo",
    taglineKey: "plan.pro.tagline",
    featured: true,
    ctaKey: "plan.pro.cta",
    basePrice: 29,
    includedSeats: 20,
    features: [
      { labelKey: "plan.feat.designsUnlimited", included: true },
      { labelKey: "plan.feat.live50", included: true },
      { labelKey: "plan.feat.members20", included: true },
      { labelKey: "plan.feat.historyUnlimited", included: true, emphasis: true },
      { labelKey: "plan.feat.mcp", included: true, emphasis: true },
      { labelKey: "plan.feat.publicLink", included: true },
      { labelKey: "plan.feat.embedMd", included: true, emphasis: true },
      { labelKey: "plan.feat.prioritySupport", included: true },
    ],
  },
  {
    id: "enterprise",
    nameKey: "plan.enterprise.name",
    price: null,
    priceKey: "plan.enterprise.price",
    ctaKey: "plan.enterprise.cta",
    features: [
      { labelKey: "plan.feat.designsUnlimited", included: true },
      { labelKey: "plan.feat.liveUnlimited", included: true },
      { labelKey: "plan.feat.membersUnlimited", included: true },
      { labelKey: "plan.feat.historyUnlimited", included: true },
      { labelKey: "plan.feat.mcp", included: true, emphasis: true },
      { labelKey: "plan.feat.publicLink", included: true },
      { labelKey: "plan.feat.sla", included: true },
    ],
  },
];

const FeatureRow = ({ feature, t }: { feature: PlanFeature; t: (key: string) => string }) => (
  <li
    className={`flex items-start gap-2 text-sm ${
      feature.included
        ? "text-slate-700 dark:text-neutral-200"
        : "text-slate-400 dark:text-neutral-500"
    }`}
  >
    <span className="mt-0.5 flex-none">
      {feature.included ? (
        <Check size={16} className="text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Minus size={16} />
      )}
    </span>
    <span className={feature.emphasis ? "font-bold" : undefined}>{t(feature.labelKey)}</span>
  </li>
);

// Selector de "cuantas personas" al estilo Claude Team: el numero que se
// elige es el TOTAL de asientos deseados (cupo base incluido + extra), no
// solo la parte extra — igual que al elegir un plan de equipo en
// claude.ai, donde se ve un contador con el total de puestos y el precio
// sube en vivo según se mueve. `seats` sube en pasos de 1, con minimo en
// `includedSeats` (no tiene sentido pedir menos de lo que el plan ya trae
// gratis).
const SeatStepper = ({
  seats,
  includedSeats,
  onChange,
  t,
}: {
  seats: number;
  includedSeats: number;
  onChange: (next: number) => void;
  t: (key: string) => string;
}) => (
  <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-black dark:border-neutral-700 px-3 py-2 bg-slate-50 dark:bg-neutral-800">
    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-neutral-300">
      <Users size={14} />
      {t("plan.seats.label")}
    </span>
    <div className="flex items-center gap-2">
      <DrawablyButton
        type="button"
        tone="neutral"
        onClick={() => onChange(Math.max(includedSeats, seats - 1))}
        disabled={seats <= includedSeats}
        aria-label={t("plan.seats.decrease")}
        className="w-8 !px-0"
      >
        <span>−</span>
      </DrawablyButton>
      <span className="w-6 text-center text-sm font-bold text-slate-900 dark:text-white tabular-nums">
        {seats}
      </span>
      <DrawablyButton
        type="button"
        tone="neutral"
        onClick={() => onChange(seats + 1)}
        aria-label={t("plan.seats.increase")}
        className="w-8 !px-0"
      >
        <span>+</span>
      </DrawablyButton>
    </div>
  </div>
);

type Translate = ReturnType<typeof useT>["t"];

type PlanViewContext = {
  t: Translate;
  prices: LocalizedPrices | null;
  isYearly: boolean;
  currentPlanId: ApiPlanId;
  currentExtraSeats: number;
  currentInterval: BillingInterval;
  seatsByPlan: Record<"starter" | "pro", number>;
  hasPaidPlan: boolean;
  intervalDiffers: boolean;
  loadingPlanId: PlanId | null;
  canceling: boolean;
  changingInterval: boolean;
};

/** Todo lo que la tarjeta de un plan necesita saber, ya calculado. */
type PlanView = {
  isCurrent: boolean;
  isPaidPlan: boolean;
  lockedOut: boolean;
  seats: number;
  extraSeats: number;
  currency: string;
  totalAmountMinor: number | null;
  extraSeatAmountMinor: number;
  showSwitch: boolean;
  seatsChanged: boolean;
  busy: boolean;
  label: string;
  disabled: boolean;
};

/** Precios, estado y texto del botón de UN plan en el contexto actual
 * (plan contratado, periodo elegido, asientos). Función pura: la tarjeta solo
 * pinta lo que devuelve. */
const computePlanView = (plan: Plan, ctx: PlanViewContext): PlanView => {
  const { t, prices, isYearly, currentPlanId, currentExtraSeats, currentInterval, seatsByPlan } = ctx;
  const isCurrent = currentPlanId === plan.id;
  const isPaidPlan = plan.id === "starter" || plan.id === "pro";
  const lockedOut = ctx.hasPaidPlan && !isCurrent;
  const seats = isPaidPlan ? seatsByPlan[plan.id as "starter" | "pro"] : 0;
  const extraSeats = isPaidPlan ? Math.max(0, seats - (plan.includedSeats ?? 0)) : 0;
  // localizedBase viene de /billing/localized-prices (cotización real de Dodo
  // para el país de esta IP) — mientras no cargue, se cae al precio base en
  // EUR (basePrice, en unidades enteras) para no dejar la card en blanco.
  // `currency`/unidad-mínima se recalculan juntos para no mezclar un monto de
  // una moneda con el símbolo de otra. Free no tiene producto en Dodo que
  // cotizar ($0 en cualquier moneda), pero se muestra en la moneda detectada:
  // si no, destacaba como la única card en euros. `prices.annual` falta en una
  // respuesta antigua cacheada: entonces se usa el fallback estático anual.
  const priceSet = isYearly ? prices?.annual : prices;
  const localizedBase = plan.id === "starter" ? priceSet?.starter : plan.id === "pro" ? priceSet?.pro : null;
  const detectedCurrency = prices?.starter.currency ?? prices?.pro.currency;
  const currency = localizedBase?.currency ?? detectedCurrency ?? "EUR";
  const staticBase = plan.basePrice
    ? (isYearly && isPaidPlan ? ANNUAL_BASE_PRICE[plan.id as "starter" | "pro"] : plan.basePrice) * 100
    : null;
  const baseAmountMinor = localizedBase?.amount ?? (plan.id === "free" && detectedCurrency ? 0 : staticBase);
  const extraSeatAmountMinor = priceSet?.extraSeat.amount ?? (isYearly ? EXTRA_SEAT_ANNUAL_PRICE : EXTRA_SEAT_PRICE) * 100;
  const totalAmountMinor = baseAmountMinor !== null ? baseAmountMinor + extraSeats * extraSeatAmountMinor : null;
  // El plan actual con el OTRO periodo a la vista: su botón pasa a ser
  // "Cambiar a anual/mensual". Mientras se ve otro periodo no se ofrece
  // cambiar asientos (el cambio de asientos es del periodo contratado).
  const showSwitch = isCurrent && isPaidPlan && ctx.intervalDiffers;
  const seatsChanged = isCurrent && isPaidPlan && !ctx.intervalDiffers && extraSeats !== currentExtraSeats;
  const busy = ctx.loadingPlanId !== null || ctx.canceling || ctx.changingInterval;

  let label: string;
  if (lockedOut) label = t("plan.cancelToSwitch");
  else if (ctx.loadingPlanId === plan.id) label = t("plan.checkoutLoading");
  else if (showSwitch && ctx.changingInterval) label = t("plan.checkoutLoading");
  else if (showSwitch) label = t(isYearly ? "plan.interval.switchToYearly" : "plan.interval.switchToMonthly");
  else if (seatsChanged) label = t("plan.seats.updateCta");
  else if (isCurrent) {
    const extras = currentExtraSeats > 0 ? ` (+${currentExtraSeats})` : "";
    const period = currentInterval === "year" ? ` · ${t("plan.interval.currentYearly")}` : "";
    label = `${t("plan.currentPlan")}${extras}${period}`;
  } else label = t(plan.ctaKey);

  const disabled = busy || lockedOut || (isCurrent && !seatsChanged && !showSwitch) || plan.id === "free" || !isPaidPlan;
  return {
    isCurrent,
    isPaidPlan,
    lockedOut,
    seats,
    extraSeats,
    currency,
    totalAmountMinor,
    extraSeatAmountMinor,
    showSwitch,
    seatsChanged,
    busy,
    label,
    disabled,
  };
};

/** Precio del plan (con la unidad y el aviso de "facturado anualmente"). */
const PlanPrice: React.FC<{ plan: Plan; view: PlanView; isYearly: boolean; lang: string; t: Translate }> = ({
  plan,
  view,
  isYearly,
  lang,
  t,
}) => {
  const { isPaidPlan, totalAmountMinor, currency } = view;
  const yearlyPaid = isYearly && isPaidPlan;
  const amountText =
    totalAmountMinor !== null ? formatMoney(totalAmountMinor, currency, lang) : plan.price ?? (plan.priceKey ? t(plan.priceKey) : "");
  return (
    <>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-black text-slate-900 dark:text-white">{amountText}</span>
        {plan.priceUnit && (
          <span className="text-sm text-slate-500 dark:text-neutral-400">{yearlyPaid ? t("plan.perYear") : plan.priceUnit}</span>
        )}
      </div>
      {yearlyPaid && <p className="-mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">{t("plan.billedYearly")}</p>}
    </>
  );
};

/** Botón principal del plan y, si es el plan contratado, el de cancelar. */
const PlanActions: React.FC<{
  plan: Plan;
  view: PlanView;
  t: Translate;
  loading: boolean;
  canceling: boolean;
  onAction: () => void;
  onCancelClick: () => void;
}> = ({ plan, view, t, loading, canceling, onAction, onCancelClick }) => {
  const { isCurrent, isPaidPlan, showSwitch, seatsChanged, busy, label, disabled } = view;
  const highlighted = (seatsChanged || showSwitch) && !plan.featured;
  return (
    <>
      {/* El texto va en un <span> (ver el selector de periodo arriba): así
          React lo actualiza al cambiar de idioma o de estado ("Redirigiendo…")
          sin que Drawably se lo lleve por delante. */}
      <DrawablyButton
        type="button"
        variant={plan.featured ? "solid" : "outline"}
        state={loading ? "loading" : "idle"}
        disabled={disabled}
        onClick={onAction}
        className={`w-full text-sm ${highlighted ? "!bg-indigo-600 !text-white" : ""}`}
      >
        <span>{label}</span>
      </DrawablyButton>
      {isCurrent && isPaidPlan && (
        <DrawablyButton
          type="button"
          tone="danger"
          state={canceling ? "loading" : "idle"}
          onClick={onCancelClick}
          disabled={busy}
          className="w-full text-xs"
        >
          <span>{canceling ? t("billing.cancel.canceling") : t("billing.cancel.button")}</span>
        </DrawablyButton>
      )}
    </>
  );
};

const PlanCard: React.FC<{
  plan: Plan;
  view: PlanView;
  isYearly: boolean;
  lang: string;
  t: Translate;
  loadingPlanId: PlanId | null;
  changingInterval: boolean;
  canceling: boolean;
  onAction: () => void;
  onSeatsChange: (next: number) => void;
  onCancelClick: () => void;
}> = ({ plan, view, isYearly, lang, t, loadingPlanId, changingInterval, canceling, onAction, onSeatsChange, onCancelClick }) => {
  const { isPaidPlan, lockedOut, seats } = view;
  return (
      <div
          className={`relative flex flex-col gap-4 p-5 sm:p-6 rounded-2xl border-2 bg-white dark:bg-neutral-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] ${
          plan.featured
            ? "border-indigo-600 dark:border-indigo-400"
            : "border-black dark:border-neutral-700"
        } ${lockedOut ? "opacity-70" : ""}`}
      >
        {plan.featured && (
          <div className="absolute -top-3 left-5 flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-wide">
            <Sparkles size={12} />
            {t("plan.pro.badge")}
          </div>
        )}
        <div>
          {/* Misma tipografía que el título "Tu plan" (Excalifont, que solo
              tiene peso normal: sin font-bold para no sintetizar negrita). */}
          <h3
            className="text-2xl text-slate-900 dark:text-white"
            style={{ fontFamily: displayFontFamily }}
          >
            {t(plan.nameKey)}
          </h3>
          {plan.taglineKey && (
            <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium mt-0.5">
              {t(plan.taglineKey)}
            </p>
          )}
        </div>
        <PlanPrice plan={plan} view={view} isYearly={isYearly} lang={lang} t={t} />
        {isPaidPlan && plan.id === "pro" && plan.includedSeats !== undefined && !lockedOut && (
          <SeatStepper
            seats={seats}
            includedSeats={plan.includedSeats}
            onChange={onSeatsChange}
            t={t}
          />
        )}
        <ul className="flex flex-col gap-2 flex-1">
          {plan.features.map((feature) => (
            <FeatureRow key={feature.labelKey} feature={feature} t={t} />
          ))}
        </ul>
        <PlanActions
          plan={plan}
          view={view}
          t={t}
          loading={loadingPlanId === plan.id || (view.showSwitch && changingInterval)}
          canceling={canceling}
          onAction={onAction}
          onCancelClick={onCancelClick}
        />
      </div>

  );
};

/** Selector mensual/anual: solo cambia lo que se VE, no cobra nada. */
const IntervalSelector: React.FC<{
  interval: BillingInterval;
  disabled: boolean;
  onSelect: (option: BillingInterval) => void;
  t: Translate;
}> = ({ interval, disabled, onSelect, t }) => (
  <div role="group" aria-label={t("plan.interval.label")} className="mb-6 flex flex-wrap items-center gap-2">
    {(["month", "year"] as const).map((option) => (
      // Variante FIJA (outline) y el activo se marca con aria-pressed:
      // Drawably fija el color del texto al montar según la variante y no lo
      // recalcula si la prop `variant` cambia (el botón que pasaba de solid a
      // outline se quedaba con texto blanco sobre blanco). Mismo patrón que
      // el selector de idioma de Ajustes.
      <DrawablyButton
        key={option}
        type="button"
        variant="outline"
        tone="neutral"
        aria-pressed={interval === option}
        disabled={disabled}
        onClick={() => onSelect(option)}
        className="px-4 text-sm rounded-lg aria-pressed:bg-indigo-600 aria-pressed:text-white"
      >
        <span>{option === "month" ? t("plan.interval.monthly") : t("plan.interval.yearly")}</span>
      </DrawablyButton>
    ))}
    <DrawablyBadge variant="outline" className="text-xs">
      <span>{t("plan.interval.save")}</span>
    </DrawablyBadge>
  </div>
);

type PendingSeatChange = {
  plan: Plan;
  extraSeats: number;
  chargeTodayMinor: number;
  /** Nuevo total RECURRENTE (mensual o anual según el plan contratado). */
  newRecurringMinor: number;
  interval: BillingInterval;
  currency: string;
};

/** Cuerpo de la confirmación de cambio de asientos: qué se cobra ahora y el
 * nuevo total recurrente. */
const SeatChangeMessage: React.FC<{ change: PendingSeatChange; lang: string; t: Translate }> = ({ change, lang, t }) => (
  <div className="flex flex-col gap-2 text-left">
    {change.chargeTodayMinor > 0 && (
      <p>
        {t("plan.seats.confirmChargeToday")}{" "}
        <strong className="text-neutral-900 dark:text-white">{formatMoney(change.chargeTodayMinor, change.currency, lang)}</strong>.{" "}
        {t("plan.seats.confirmInstant")}
      </p>
    )}
    <p>
      {change.interval === "year" ? t("plan.seats.confirmYearly") : t("plan.seats.confirmMonthly")}{" "}
      <strong className="text-neutral-900 dark:text-white">{formatMoney(change.newRecurringMinor, change.currency, lang)}</strong>.
    </p>
  </div>
);

export const PricingPlans = () => {
  const { t, lang } = useT();
  const [currentPlanId, setCurrentPlanId] = useState<ApiPlanId>("free");
  const [currentExtraSeats, setCurrentExtraSeats] = useState(0);
  const [seatsByPlan, setSeatsByPlan] = useState<Record<"starter" | "pro", number>>({
    starter: 5,
    pro: 20,
  });
  const prices = useLocalizedPricesOnce();
  // Periodo que el usuario elige para un plan NUEVO. Con un plan de pago ya
  // contratado manda el de esa suscripción (ver `interval` más abajo).
  const [chosenInterval, setChosenInterval] = useState<BillingInterval>("month");
  const [currentInterval, setCurrentInterval] = useState<BillingInterval>("month");
  // Periodo al que quiere pasar quien YA paga (abre la confirmación: Dodo
  // cobra la diferencia al instante) y flag mientras se aplica.
  const [pendingInterval, setPendingInterval] = useState<BillingInterval | null>(null);
  const [changingInterval, setChangingInterval] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<PlanId | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  // Confirmación antes de subir/bajar asientos: Dodo cobra la diferencia AL
  // INSTANTE (proration_billing_mode: "difference_immediately" en
  // changeSubscriptionSeats, ver dodo.ts) — no al final del periodo, no
  // prorrateado por los días que quedan. Sin avisar antes, alguien podía
  // mover el stepper sin darse cuenta de que eso dispara un cargo real ya
  // mismo a su tarjeta.
  const [pendingSeatChange, setPendingSeatChange] = useState<PendingSeatChange | null>(null);

  // Volver de Dodo (checkout cancelado o incompleto) con atrás/adelante del
  // navegador restaura esta página desde el bfcache con el estado de React
  // congelado tal cual estaba antes de irse — si el click que llevó al
  // checkout dejó loadingPlanId puesto, el botón se queda en "Redirigiendo
  // al pago..." para siempre, sin que ningún efecto vuelva a correr para
  // limpiarlo (mismo problema que ya se arregló para sesión/plan en
  // useAuthState.ts/useSubscriptionState.ts, pero ese fetch periódico no
  // toca este estado de UI local). Sin esto había que refrescar a mano.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setLoadingPlanId(null);
      setCanceling(false);
      setCheckoutError(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const { subscription } = useSubscriptionInfo();

  useEffect(() => {
    // Sin sesión (anónimo) o error de red: el hook deja `subscription` en
    // null y esto se queda en el estado "Free" por defecto, no bloquea ver
    // los precios.
    if (!subscription) return;
    setCurrentPlanId(subscription.planId);
    setCurrentExtraSeats(subscription.extraSeats);
    const subscriptionInterval: BillingInterval = subscription.interval === "year" ? "year" : "month";
    setCurrentInterval(subscriptionInterval);
    // Quien ya paga arranca viendo los precios de SU periodo (luego puede
    // mirar el otro con el selector).
    if (subscription.planId === "starter" || subscription.planId === "pro") setChosenInterval(subscriptionInterval);
    // Si ya tiene el plan activo, el stepper arranca en su cantidad real
    // de asientos en vez de en el cupo base — para que reabrir Settings
    // muestre lo que de verdad tiene contratado.
    if (subscription.planId === "starter" || subscription.planId === "pro") {
      setSeatsByPlan((prev) => ({
        ...prev,
        [subscription.planId]: (prev[subscription.planId as "starter" | "pro"] ?? 0) + subscription.extraSeats,
      }));
    }
  }, [subscription]);

  // Con un plan de pago activo no se puede cambiar a otro (ni subir de
  // Starter a Pro): primero hay que cancelar. El backend lo rechaza igual
  // (409 already_subscribed); esto solo evita ofrecer el botón.
  const hasPaidPlan = currentPlanId === "starter" || currentPlanId === "pro";
  // El selector solo cambia lo que se VE: los planes con precio mensual o
  // anual. Quien ya paga ve así cuánto costaría el otro periodo y, desde el
  // botón de su plan ("Cambiar a anual"), inicia el cambio (que termina en
  // el checkout, o en un change-plan confirmado). Nada se cobra al pulsar el
  // selector.
  const interval: BillingInterval = chosenInterval;
  const isYearly = interval === "year";
  const intervalDiffers = hasPaidPlan && chosenInterval !== currentInterval;

  const handleSelectInterval = (option: BillingInterval) => setChosenInterval(option);

  // Contrata el mismo plan y asientos en el periodo elegido pasando por el
  // checkout de Dodo. Se usa cuando la suscripción actual no se puede
  // cambiar con change-plan (Dodo no la conoce o su periodo no se pudo leer).
  const startIntervalCheckout = async (target: BillingInterval) => {
    if (currentPlanId !== "starter" && currentPlanId !== "pro") return;
    setCheckoutError(null);
    setNotice(null);
    setChangingInterval(true);
    try {
      const { url } = await api.createCheckoutSession(currentPlanId, currentExtraSeats, target);
      window.location.assign(url);
    } catch {
      setCheckoutError(t("plan.checkoutError"));
      setChangingInterval(false);
    }
  };

  // Botón del plan actual con el otro periodo a la vista. Si se conoce el
  // periodo de la suscripción, es un change-plan (pide confirmación porque
  // Dodo cobra la diferencia al instante); si no, checkout directo.
  const handleSwitchInterval = (target: BillingInterval) => {
    if (subscription?.interval) setPendingInterval(target);
    else void startIntervalCheckout(target);
  };

  const handleChangeInterval = async (target: BillingInterval) => {
    setCheckoutError(null);
    setNotice(null);
    setChangingInterval(true);
    try {
      const result = await api.changeBillingInterval(target);
      if (result.paymentUrl) {
        window.location.assign(result.paymentUrl);
        return;
      }
      setCurrentInterval(target);
      setNotice(t("plan.interval.changed"));
    } catch (err) {
      const code = api.isAxiosError(err) ? err.response?.data?.code : undefined;
      // Dodo no conoce esta suscripción (resto de cuando estaba en modo
      // pruebas): no hay nada que cambiar, así que se contrata de verdad el
      // mismo plan y asientos en el periodo elegido. El Worker deja hacerlo
      // aunque la fila diga "activa" (ver /billing/checkout).
      if (code === "subscription_not_found") {
        await startIntervalCheckout(target);
        return;
      }
      setCheckoutError(t(code === "subscription_unreadable" ? "plan.billing.unreadable" : "plan.interval.changeError"));
    } finally {
      setChangingInterval(false);
    }
  };

  const handleSelectPlan = async (plan: Plan) => {
    if (plan.id !== "starter" && plan.id !== "pro") return;
    setCheckoutError(null);
    setLoadingPlanId(plan.id);
    try {
      const extraSeats = Math.max(0, seatsByPlan[plan.id] - (plan.includedSeats ?? 0));
      const { url } = await api.createCheckoutSession(plan.id, extraSeats, interval);
      window.location.assign(url);
    } catch {
      setCheckoutError(t("plan.checkoutError"));
      setLoadingPlanId(null);
    }
  };

  const handleUpdateSeats = async (plan: Plan, extraSeats: number) => {
    setCheckoutError(null);
    setNotice(null);
    setLoadingPlanId(plan.id);
    try {
      const result = await api.updateSubscriptionSeats(extraSeats);
      if (result.paymentUrl) {
        window.location.assign(result.paymentUrl);
        return;
      }
      setCurrentExtraSeats(result.extraSeats ?? extraSeats);
      setNotice(t("plan.seats.updated"));
    } catch (err) {
      const unreadable = api.isAxiosError(err) && err.response?.data?.code === "subscription_unreadable";
      setCheckoutError(t(unreadable ? "plan.billing.unreadable" : "plan.seats.updateError"));
    } finally {
      setLoadingPlanId(null);
    }
  };

  const handleCancelPlan = async () => {
    setConfirmCancel(false);
    setCheckoutError(null);
    setCanceling(true);
    try {
      await api.cancelSubscription();
      window.location.reload();
    } catch {
      setCheckoutError(t("billing.blocked.cancelError"));
      setCanceling(false);
    }
  };

  const viewContext: PlanViewContext = {
    t,
    prices,
    isYearly,
    currentPlanId,
    currentExtraSeats,
    currentInterval,
    seatsByPlan,
    hasPaidPlan,
    intervalDiffers,
    loadingPlanId,
    canceling,
    changingInterval,
  };

  return (
    <div>
      <p className="text-sm text-slate-500 dark:text-neutral-400 mb-4 max-w-2xl">
        {t("plan.intro")}
      </p>
      {checkoutError && (
        <DrawablyAlert key={checkoutError} role="alert" stroke="#dc2626" className="mb-4 text-sm text-red-800 dark:text-red-200">
          {checkoutError}
        </DrawablyAlert>
      )}
      {notice && (
        <DrawablyAlert key={notice} role="status" stroke="#059669" className="mb-4 text-sm text-emerald-800 dark:text-emerald-200">
          {notice}
        </DrawablyAlert>
      )}
      <IntervalSelector interval={interval} disabled={changingInterval} onSelect={handleSelectInterval} t={t} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        {PLANS.map((plan) => {
          const view = computePlanView(plan, viewContext);
          const onAction = view.showSwitch
            ? () => handleSwitchInterval(interval)
            : view.seatsChanged
            ? () =>
                setPendingSeatChange({
                  plan,
                  extraSeats: view.extraSeats,
                  chargeTodayMinor: Math.max(0, view.extraSeats - currentExtraSeats) * view.extraSeatAmountMinor,
                  newRecurringMinor: view.totalAmountMinor ?? 0,
                  interval,
                  currency: view.currency,
                })
            : () => void handleSelectPlan(plan);
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              view={view}
              isYearly={isYearly}
              lang={lang}
              t={t}
              loadingPlanId={loadingPlanId}
              changingInterval={changingInterval}
              canceling={canceling}
              onAction={onAction}
              onSeatsChange={(next) => setSeatsByPlan((prev) => ({ ...prev, [plan.id as "starter" | "pro"]: next }))}
              onCancelClick={() => setConfirmCancel(true)}
            />
          );
        })}
      </div>
      <ConfirmModal
        isOpen={confirmCancel}
        title={t("billing.cancel.confirmTitle")}
        message={t("billing.cancel.confirmBody")}
        confirmText={t("billing.cancel.confirmCta")}
        cancelText={t("billing.cancel.keep")}
        onConfirm={() => void handleCancelPlan()}
        onCancel={() => setConfirmCancel(false)}
      />
      <ConfirmModal
        isOpen={pendingInterval !== null}
        title={pendingInterval === "year" ? t("plan.interval.confirmYearlyTitle") : t("plan.interval.confirmMonthlyTitle")}
        message={pendingInterval === "year" ? t("plan.interval.confirmYearlyBody") : t("plan.interval.confirmMonthlyBody")}
        isDangerous={false}
        variant="warning"
        confirmText={t("plan.interval.confirmCta")}
        cancelText={t("modal.confirm.cancelDefault")}
        onCancel={() => setPendingInterval(null)}
        onConfirm={() => {
          if (!pendingInterval) return;
          const target = pendingInterval;
          setPendingInterval(null);
          void handleChangeInterval(target);
        }}
      />
      <ConfirmModal
        isOpen={pendingSeatChange !== null}
        title={t("plan.seats.confirmTitle")}
        isDangerous={false}
        variant="warning"
        confirmText={t("plan.seats.confirmCta")}
        cancelText={t("modal.confirm.cancelDefault")}
        onCancel={() => setPendingSeatChange(null)}
        onConfirm={() => {
          if (!pendingSeatChange) return;
          const { plan, extraSeats } = pendingSeatChange;
          setPendingSeatChange(null);
          void handleUpdateSeats(plan, extraSeats);
        }}
        message={pendingSeatChange && <SeatChangeMessage change={pendingSeatChange} lang={lang} t={t} />}
      />
    </div>
  );
};
