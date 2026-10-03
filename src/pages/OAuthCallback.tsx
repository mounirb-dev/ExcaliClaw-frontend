import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Logo } from '../components/Logo';
import { api, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from '../api/client';
import { getSafeReturnTo } from '../utils/safeReturnTo';
import { useT } from '../i18n/useT';
import { USER_KEY } from '../utils/impersonation';
import { clearAllLocalData } from '../utils/freshCache';

// Appwrite ya ha creado una sesión (cookie en su propio dominio) y
// redirigido el navegador aquí. Emitir un JWT a partir de esa sesión —
// esta llamada va directa a Appwrite con las credenciales incluidas, de la
// misma forma que lo hace el SDK Web de Appwrite — y luego se le entrega
// al /auth/session del Worker para que se convierta en nuestra propia
// cookie HttpOnly. El JWT solo vive en esta variable local, nunca en Web
// Storage.
export const OAuthCallback: React.FC = () => {
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const returnTo = getSafeReturnTo(searchParams.get('returnTo'));
    let cancelled = false;

    (async () => {
      try {
        // Cambio de cuenta: fuera lo que quedara de la anterior (usuario
        // guardado y listas en caché) antes de cargar la nueva.
        try {
          localStorage.removeItem(USER_KEY);
        } catch {
          // Sin localStorage no hay nada que limpiar.
        }
        await clearAllLocalData();

        // Vía nueva (createOAuth2Token): Appwrite devuelve userId + secret y el
        // Worker crea la sesión y pone las cookies. Ver /auth/oauth-token.
        const tokenUserId = searchParams.get('userId');
        const tokenSecret = searchParams.get('secret');
        if (tokenUserId && tokenSecret) {
          await api.post('/auth/oauth-token', { userId: tokenUserId, secret: tokenSecret });
          if (cancelled) return;
          window.location.href = returnTo;
          return;
        }

        // Vía anterior (cookie de sesión de Appwrite en su dominio).
        const res = await fetch(`${APPWRITE_ENDPOINT}/account/jwts`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-Appwrite-Project': APPWRITE_PROJECT_ID,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          throw new Error(t('auth.oauthCallback.errorCouldNotComplete'));
        }
        const data = (await res.json()) as { jwt: string };
        if (cancelled) return;
        await api.post('/auth/session', { jwt: data.jwt });
        window.location.href = returnTo;
      } catch (err: unknown) {
        if (cancelled) return;
        // El Worker explica el rechazo (p. ej. identidad que se iba a enlazar a
        // otra cuenta): se muestra tal cual en vez del mensaje genérico.
        const serverMessage = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
        setError(
          typeof serverMessage === 'string'
            ? serverMessage
            : err instanceof Error
              ? err.message
              : t('auth.oauthCallback.errorSignInFailed'),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="crayon-page">
      <div className="max-w-md w-full text-center space-y-4">
        <Logo className="mx-auto h-20 w-auto" />
        {error ? (
          <>
            <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
            <a href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
              {t('auth.login.backToSignIn')}
            </a>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t('auth.oauthCallback.signingYouIn')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
