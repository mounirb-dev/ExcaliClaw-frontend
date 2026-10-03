import React, { useState } from 'react';
import { DrawablyButton, DrawablyCard } from 'drawably/react';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import * as api from '../api';
import { getPasswordPolicy, validatePassword } from '../utils/passwordPolicy';
import { AuthStatusErrorPanel } from '../components/AuthStatusErrorPanel';
import { SocialLoginSection } from './login/LoginFormSections';
import { BootstrapOidcOption, RegisterFields, RegisterHeading } from './login/RegisterFormSections';
import { useBootstrapCommandCopy, useRegisterRedirect } from './login/useRegisterFlow';
import { useT } from '../i18n/useT';

export const Register: React.FC = () => {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const {
    register,
    authEnabled,
    authStatusError,
    retryAuthStatus,
    oidcEnabled,
    oidcEnforced,
    oidcProvider,
    bootstrapRequired,
    isAuthenticated,
    loading: authLoading,
  } = useAuth();
  const { redirectAfterAuth } = useRegisterRedirect();
  const passwordPolicy = getPasswordPolicy({ t });

  const { bootstrapLogsCommand, copiedBootstrapCmd, copyBootstrapCommand } = useBootstrapCommandCopy();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const passwordError = validatePassword(password, passwordPolicy, t);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (bootstrapRequired && setupCode.trim().length === 0) {
      setError(t('auth.register.setupCodeRequired'));
      return;
    }

    setLoading(true);

    try {
      const { emailOtpSent, otpRequired, emailVerified } = await register(
        email,
        password,
        name,
        bootstrapRequired ? setupCode : undefined,
      );
      if (!emailOtpSent) {
        // El primer intento de envío del código (en /auth/register, ver
        // el backend) falló — reintenta una vez en silencio antes
        // de mandar a EmailVerificationGate. No bloquea la navegación: si
        // este segundo intento también falla, el botón "Reenviar" de esa
        // pantalla ya muestra el error correctamente.
        void api.resendEmailVerification().catch(() => { /* sin acción: el aviso principal ya informa del fallo */ });
      }
      await redirectAfterAuth({ otpRequired, emailVerified });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth.register.failedGeneric');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOidcBootstrap = () => {
    setError('');
    api.startOidcSignIn('/');
  };

  if (authStatusError) {
    return <AuthStatusErrorPanel message={authStatusError} onRetry={retryAuthStatus} fullScreen />;
  }

  // El efecto de arriba ya decide a dónde mandar a quien llega aquí con
  // sesión activa (checkout, /app/plans, o safeRedirect) —
  // sin esta compuerta, el formulario de registro se pintaba un instante
  // antes de que ese efecto asíncrono (que puede esperar a getSubscription())
  // terminara de decidir, así que alguien ya logueado que clica el CTA de un
  // plan de pago veía el form saltar antes de llegar a Dodo.
  if (authLoading || authEnabled === null || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="crayon-page">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <Logo className="mx-auto h-20 w-auto" />
          <RegisterHeading
            bootstrapRequired={bootstrapRequired}
            bootstrapLogsCommand={bootstrapLogsCommand}
            copiedBootstrapCmd={copiedBootstrapCmd}
            onCopyBootstrapCommand={() => void copyBootstrapCommand()}
          />
        </div>
        <DrawablyCard className="p-6 sm:p-8 bg-white dark:bg-gray-900">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
                <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
              </div>
            )}

            <BootstrapOidcOption
              visible={bootstrapRequired && oidcEnabled && !oidcEnforced}
              loading={loading}
              oidcProvider={oidcProvider}
              onClick={handleOidcBootstrap}
            />

            <RegisterFields
              name={name}
              onNameChange={setName}
              email={email}
              onEmailChange={setEmail}
              password={password}
              onPasswordChange={setPassword}
              passwordPolicy={passwordPolicy}
              bootstrapRequired={bootstrapRequired}
              setupCode={setupCode}
              onSetupCodeChange={setSetupCode}
            />

            <DrawablyButton type="submit" variant="solid" className="w-full" state={loading ? 'loading' : 'idle'} disabled={loading}>
              <span>{loading ? t('auth.register.submitCtaLoading') : t('auth.register.submitCta')}</span>
            </DrawablyButton>

            <SocialLoginSection visible={!bootstrapRequired} />
          </form>
        </DrawablyCard>
      </div>
    </div>
  );
};
