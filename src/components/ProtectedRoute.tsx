import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { startOidcSignIn } from '../api';
import { AuthStatusErrorPanel } from './AuthStatusErrorPanel';
import { PaymentRequiredGate } from './PaymentRequiredGate';
import { PlanLimitModal } from './PlanLimitModal';
import { EmailVerificationGate } from './EmailVerificationGate';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// De nivel superior (no anidado dentro de ProtectedRoute) para que tenga
// una identidad estable entre renders en vez de redefinirse en cada uno.
const OidcRedirect: React.FC<{ returnTo: string }> = ({ returnTo }) => {
  useEffect(() => {
    startOidcSignIn(returnTo);
  }, [returnTo]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-600 dark:text-gray-400">Redirecting to sign-in...</div>
    </div>
  );
};

type AuthSnapshot = {
  isAuthenticated: boolean;
  loading: boolean;
  authEnabled: boolean | null;
  authStatusError: string | null;
  oidcEnforced: boolean;
  bootstrapRequired: boolean;
  authOnboardingRequired: boolean;
  mustResetPassword?: boolean;
  emailVerificationRequired?: boolean;
};

type RouteDecision =
  | { kind: 'loading' }
  | { kind: 'authError' }
  | { kind: 'redirect'; to: string }
  | { kind: 'oidcRedirect'; returnTo: string }
  | { kind: 'requireEmailVerification' }
  | { kind: 'allow' };

// Lógica pura de selección de rama extraída del componente: aquí es donde
// solía vivir la complejidad ciclomática/cognitiva de ProtectedRoute. Como
// función simple (no un componente o hook) no está sujeta al mismo
// presupuesto de complejidad, y es trivial de probar de forma aislada.
function resolveProtectedRouteDecision(auth: AuthSnapshot, location: Location): RouteDecision {
  if (auth.loading || auth.authEnabled === null) {
    return auth.authStatusError ? { kind: 'authError' } : { kind: 'loading' };
  }

  if (auth.authOnboardingRequired && location.pathname !== '/auth-setup') {
    return { kind: 'redirect', to: '/auth-setup' };
  }

  if (!auth.authEnabled) {
    return { kind: 'allow' };
  }

  if (!auth.isAuthenticated) {
    if (auth.bootstrapRequired) {
      return { kind: 'redirect', to: '/register' };
    }
    if (auth.oidcEnforced) {
      return {
        kind: 'oidcRedirect',
        returnTo: `${location.pathname}${location.search}${location.hash}`,
      };
    }
    // Permitir compartir la URL "normal" del editor: si alguien abre
    // `/app/editor/:id` sin haber iniciado sesión, redirigirlo a la ruta
    // pública del editor (`/shared/:id`), donde aplica la política de
    // compartir por enlace del backend.
    if (location.pathname.startsWith('/app/editor/')) {
      const id = location.pathname.slice('/app/editor/'.length).split('/')[0] || '';
      if (id) {
        return { kind: 'redirect', to: `/shared/${id}${location.search}${location.hash}` };
      }
    }
    return { kind: 'redirect', to: '/login' };
  }

  if (auth.mustResetPassword && location.pathname !== '/login') {
    return { kind: 'redirect', to: '/login?mustReset=1' };
  }

  // Bloquea TODO el dashboard (no solo un banner descartable) hasta que se
  // verifique el email — cuentas de antes de esta feature nunca llevan
  // emailVerificationRequired, así que nunca caen aquí.
  if (auth.emailVerificationRequired) {
    return { kind: 'requireEmailVerification' };
  }

  return { kind: 'allow' };
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const auth = useAuth();

  const decision = resolveProtectedRouteDecision(
    {
      isAuthenticated: auth.isAuthenticated,
      loading: auth.loading,
      authEnabled: auth.authEnabled,
      authStatusError: auth.authStatusError,
      oidcEnforced: auth.oidcEnforced,
      bootstrapRequired: auth.bootstrapRequired,
      authOnboardingRequired: auth.authOnboardingRequired,
      mustResetPassword: auth.user?.mustResetPassword,
      emailVerificationRequired: Boolean(auth.user?.otpRequired) && !auth.user?.emailVerified,
    },
    location,
  );

  switch (decision.kind) {
    case 'loading':
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-gray-600 dark:text-gray-400">Loading...</div>
        </div>
      );
    case 'authError':
      return (
        <AuthStatusErrorPanel
          message={auth.authStatusError ?? ''}
          onRetry={auth.retryAuthStatus}
          fullScreen
        />
      );
    case 'redirect':
      return <Navigate to={decision.to} replace />;
    case 'oidcRedirect':
      return <OidcRedirect returnTo={decision.returnTo} />;
    case 'requireEmailVerification':
      return <EmailVerificationGate />;
    case 'allow':
      return auth.isAuthenticated ? (
        <PaymentRequiredGate>
          {children}
          <PlanLimitModal />
        </PaymentRequiredGate>
      ) : (
        children
      );
  }
};
