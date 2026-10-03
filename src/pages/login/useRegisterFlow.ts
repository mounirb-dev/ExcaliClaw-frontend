import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api';
import type { PaidPlanId } from '../../api';
import { toDodoCheckoutUrl } from '../../utils/checkoutUrl';

/** Lógica de navegación del registro: a dónde mandar a quien llega (con o sin
 * sesión) y qué hacer tras autenticar (checkout de un plan, /app/plans o el
 * destino normal). Extraído de Register.tsx para que el componente solo
 * pinte el formulario. */
export const useRegisterRedirect = () => {
  const {
    authEnabled,
    registrationEnabled,
    authStatusError,
    oidcEnforced,
    bootstrapRequired,
    authOnboardingRequired,
    isAuthenticated,
    loading: authLoading,
    user,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  const safeRedirect = redirectTo?.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/app';
  // Viene del CTA de un plan de pago en la página de precios de la landing (?plan=starter|pro) —
  // ver la página de precios de la landing. null para el free/enterprise, o
  // cuando se llega aquí por cualquier otro camino (login normal, etc.).
  const planParam = searchParams.get('plan');
  const requestedPlan: PaidPlanId | null =
    planParam === 'starter' || planParam === 'pro' ? planParam : null;
  // Periodo elegido en el selector mensual/anual de la landing
  // (?interval=year); cualquier otro valor o ausencia = mensual.
  const requestedInterval: 'month' | 'year' = searchParams.get('interval') === 'year' ? 'year' : 'month';

  // Tras autenticar: si venía de un CTA de plan de pago, mandar a checkout
  // de una — pero solo si todavía no tiene un plan de pago (el backend
  // rechaza contratar un segundo plan con 409 already_subscribed) Y ya
  // verificó el email. El checkout manda a Dodo directo, sin pasar nunca
  // por una ruta protegida — así que sin esta comprobación, alguien recién
  // registrado podía pagar sin haber visto nunca EmailVerificationGate.
  // Si ya tiene uno, o todavía no verificó, llevarlo a la app normal
  // (safeRedirect, que si hace falta ya muestra el formulario de
  // verificación vía ProtectedRoute). Sin `plan` en la URL, el
  // comportamiento de siempre.
  //
  // `otpOverride` cubre el registro recién hecho: leer `user` del contexto
  // justo después de `register()` daría el cierre del render anterior
  // (obsoleto), así que handleSubmit pasa el resultado fresco de
  // register() en vez de confiar en `user`. La rama de "ya logueado" (el
  // efecto de abajo) sí puede confiar en `user`, que ya está al día ahí.
  const redirectAfterAuth = useCallback(async (otpOverride?: { otpRequired?: boolean; emailVerified?: boolean }) => {
    if (!requestedPlan) {
      navigate(safeRedirect, { replace: true });
      return;
    }
    const otpRequired = otpOverride?.otpRequired ?? user?.otpRequired ?? false;
    const emailVerified = otpOverride?.emailVerified ?? user?.emailVerified ?? false;
    if (otpRequired && !emailVerified) {
      navigate(safeRedirect, { replace: true });
      return;
    }
    try {
      const sub = await api.getSubscription();
      if (sub.planId === 'starter' || sub.planId === 'pro') {
        navigate('/app/plans', { replace: true });
        return;
      }
      const { url } = await api.createCheckoutSession(requestedPlan, 0, requestedInterval);
      const checkoutUrl = toDodoCheckoutUrl(url);
      if (!checkoutUrl) throw new Error('Unexpected checkout URL');
      window.location.assign(checkoutUrl);
    } catch {
      // Sin sesión leíble todavía, red caída, o el checkout falló — no
      // dejar a la persona varada en /register, mandarla al destino normal.
      navigate(safeRedirect, { replace: true });
    }
  }, [navigate, requestedPlan, requestedInterval, safeRedirect, user]);

  useEffect(() => {
    if (authStatusError) return;
    if (authLoading || authEnabled === null) return;
    if (authOnboardingRequired) {
      navigate('/auth-setup', { replace: true });
      return;
    }
    if (oidcEnforced) {
      api.startOidcSignIn('/app');
      return;
    }
    if (!authEnabled) {
      navigate('/app', { replace: true });
      return;
    }
    if (!bootstrapRequired && !registrationEnabled) {
      navigate('/login', { replace: true });
      return;
    }
    if (isAuthenticated) {
      void redirectAfterAuth();
    }
  }, [
    authEnabled,
    authLoading,
    authOnboardingRequired,
    authStatusError,
    bootstrapRequired,
    isAuthenticated,
    navigate,
    oidcEnforced,
    registrationEnabled,
    safeRedirect,
    redirectAfterAuth,
  ]);

  return { redirectAfterAuth };
};

/** Copia al portapapeles el comando para ver el código de arranque del
 * servidor autoalojado, con aviso "copiado" durante 1,5 s. */
export const useBootstrapCommandCopy = () => {
  const [copiedBootstrapCmd, setCopiedBootstrapCmd] = useState(false);
  const bootstrapLogsCommand =
    'docker compose -f docker-compose.prod.yml logs backend --tail=200 | grep "BOOTSTRAP SETUP"';

  const copyBootstrapCommand = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(bootstrapLogsCommand);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = bootstrapLogsCommand;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedBootstrapCmd(true);
      window.setTimeout(() => setCopiedBootstrapCmd(false), 1500);
    } catch {
      // El navegador puede denegar el acceso al portapapeles; el comando sigue visible.
    }
  };

  return { bootstrapLogsCommand, copiedBootstrapCmd, copyBootstrapCommand };
};
