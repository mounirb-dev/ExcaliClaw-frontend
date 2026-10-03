// Ramas de renderizado independientes extraídas de Login.tsx: cada sección
// posee su propia condición de visibilidad (devuelve null cuando no
// aplica) en vez de que el componente de página ramifique en cada
// combinación — esa ramificación era lo que impulsaba la complejidad
// ciclomática/cognitiva de Login.
import React from 'react';
import { Link } from 'react-router-dom';
import { DrawablyButton, DrawablyCard, DrawablyInput } from 'drawably/react';
import { SocialLoginButtons } from '../../components/SocialLoginButtons';
import { PasswordField } from '../../components/PasswordField';
import { PasswordRequirements } from '../../components/PasswordRequirements';
import * as api from '../../api';
import type { PasswordPolicy } from '../../utils/passwordPolicy';
import { useT } from '../../i18n/useT';

export const LoginHeading: React.FC<{
  mustReset: boolean;
  oidcEnforced: boolean;
  oidcProvider: string | null;
  registrationEnabled: boolean;
}> = ({ mustReset, oidcEnforced, oidcProvider, registrationEnabled }) => {
  const { t } = useT();
  let subtitle: React.ReactNode;
  if (mustReset) {
    subtitle = (
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {t('auth.login.setNewPasswordBeforeContinuing')}
      </p>
    );
  } else if (oidcEnforced) {
    subtitle = (
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {t('auth.login.redirectedToPrefix')} {oidcProvider || t('auth.login.yourIdentityProvider')}.
      </p>
    );
  } else if (registrationEnabled) {
    subtitle = (
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {t('auth.login.newHere')}{' '}
        <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
          {t('auth.login.createFreeAccount')}
        </Link>
      </p>
    );
  } else {
    subtitle = (
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {t('auth.login.signInToKeepSketching')}
      </p>
    );
  }

  return (
    <>
      <h2
        className="mt-4 text-3xl font-bold text-gray-900 dark:text-white"
        style={{ fontFamily: 'var(--excalidash-display-font)' }}
      >
        {mustReset
          ? t('auth.login.resetYourPassword')
          : oidcEnforced
            ? `${t('auth.login.signInWithPrefix')} ${oidcProvider || 'OIDC'}`
            : t('auth.login.welcomeBack')}
      </h2>
      {subtitle}
    </>
  );
};

export const SignInFields: React.FC<{
  visible: boolean;
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}> = ({ visible, email, password, onEmailChange, onPasswordChange }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('auth.login.emailAddress')}
        </label>
        <DrawablyInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('auth.login.password')}
        </label>
        <PasswordField
          id="password"
          name="password"
          autoComplete="current-password"
          required
          className="w-full"
          placeholder="••••••••"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
      </div>
    </>
  );
};

export const MustResetFields: React.FC<{
  visible: boolean;
  newPassword: string;
  confirmNewPassword: string;
  passwordPolicy: PasswordPolicy;
  onNewPasswordChange: (value: string) => void;
  onConfirmNewPasswordChange: (value: string) => void;
}> = ({
  visible,
  newPassword,
  confirmNewPassword,
  passwordPolicy,
  onNewPasswordChange,
  onConfirmNewPasswordChange,
}) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <>
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('auth.login.newPassword')}
        </label>
        <PasswordField
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={passwordPolicy.minLength}
          maxLength={passwordPolicy.maxLength}
          pattern={passwordPolicy.patternHtml}
          className="w-full"
          placeholder={t('auth.login.newPassword')}
          value={newPassword}
          onChange={(e) => onNewPasswordChange(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('auth.login.confirmNewPassword')}
        </label>
        <PasswordField
          id="confirmNewPassword"
          name="confirmNewPassword"
          autoComplete="new-password"
          required
          minLength={passwordPolicy.minLength}
          maxLength={passwordPolicy.maxLength}
          className="w-full"
          placeholder={t('auth.login.confirmNewPassword')}
          value={confirmNewPassword}
          onChange={(e) => onConfirmNewPasswordChange(e.target.value)}
        />
      </div>
    </>
  );
};

export const OidcOnlyButton: React.FC<{
  visible: boolean;
  oidcProvider: string | null;
  onClick: () => void;
}> = ({ visible, oidcProvider, onClick }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <DrawablyButton type="button" variant="solid" className="w-full" onClick={onClick}>
      <span>{t('auth.login.continueWithPrefix')} {oidcProvider || 'OIDC'}</span>
    </DrawablyButton>
  );
};

export const ForgotPasswordLink: React.FC<{ visible: boolean }> = ({ visible }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <div className="flex justify-end -mt-2">
      <Link to="/reset-password" className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
        {t('auth.login.forgotPassword')}
      </Link>
    </div>
  );
};

export const SubmitButton: React.FC<{
  visible: boolean;
  mustReset: boolean;
  loading: boolean;
}> = ({ visible, mustReset, loading }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <DrawablyButton type="submit" variant="solid" className="w-full" state={loading ? 'loading' : 'idle'} disabled={loading}>
      {/* Un hijo de texto plano cuyo valor cambia hace que React use
          `button.textContent =` para actualizarlo, lo que borra todos los
          hijos del botón — incluido el <svg> que drawably inyecta fuera del
          seguimiento de React — y el borde/relleno dibujado a mano nunca
          vuelve. Envolverlo en un elemento estable mantiene la
          actualización de texto acotada a este span. */}
      <span>
        {mustReset
          ? (loading ? t('auth.login.updating') : t('auth.login.setNewPassword'))
          : (loading ? t('auth.login.signingIn') : t('auth.login.signIn'))}
      </span>
    </DrawablyButton>
  );
};

export const OidcOptionalButton: React.FC<{
  visible: boolean;
  oidcProvider: string | null;
  onClick: () => void;
}> = ({ visible, oidcProvider, onClick }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <DrawablyButton type="button" className="w-full" tone="neutral" onClick={onClick}>
      <span>{t('auth.login.continueWithPrefix')} {oidcProvider || 'OIDC'}</span>
    </DrawablyButton>
  );
};

export const SocialLoginSection: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;
  return <SocialLoginButtons />;
};

export const MfaChallengeFields: React.FC<{
  visible: boolean;
  otp: string;
  error: string | null;
  loading: boolean;
  onOtpChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}> = ({ visible, otp, error, loading, onOtpChange, onSubmit, onCancel }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="text-center space-y-1">
        <h2
          className="text-2xl font-bold text-gray-900 dark:text-white"
          style={{ fontFamily: 'var(--excalidash-display-font)' }}
        >
          {t('auth.login.enterYourCode')}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('auth.login.openAuthenticatorApp')}
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
        </div>
      )}

      <div>
        <label htmlFor="otp" className="sr-only">
          {t('auth.login.authenticationCode')}
        </label>
        <DrawablyInput
          id="otp"
          name="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          required
          className="w-full text-center text-lg tracking-[0.5em]"
          placeholder="000000"
          value={otp}
          onChange={(e) => onOtpChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </div>

      <DrawablyButton
        type="submit"
        variant="solid"
        className="w-full"
        state={loading ? 'loading' : 'idle'}
        disabled={loading || otp.length < 6}
      >
        <span>{loading ? t('auth.login.verifying') : t('auth.login.verify')}</span>
      </DrawablyButton>

      <div className="text-center">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
        >
          {t('auth.login.backToSignIn')}
        </button>
      </div>
    </form>
  );
};

export const SwitchUserButton: React.FC<{ visible: boolean; onClick: () => void }> = ({
  visible,
  onClick,
}) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <div className="text-center">
      <button
        type="button"
        onClick={onClick}
        className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
      >
        {t('auth.login.signInAsDifferentUser')}
      </button>
    </div>
  );
};

// El cuerpo del formulario de sign-in/OIDC/must-reset, extraído entero de
// Login.tsx — por sí solo poseía la mayor parte de la ramificación de
// Login (cada campo y botón aquí es condicional a
// mustReset/oidcEnforced/oidcEnabled), así que moverlo a su propio
// componente es lo que lleva la complejidad de flujo de control de Login
// por debajo del umbral de react-doctor en vez de solo recortarla.
export const LoginFormCard: React.FC<{
  email: string;
  password: string;
  newPassword: string;
  confirmNewPassword: string;
  error: string;
  loading: boolean;
  mustReset: boolean;
  passwordPolicy: PasswordPolicy;
  registrationEnabled: boolean;
  oidcEnabled: boolean;
  oidcEnforced: boolean;
  oidcProvider: string | null;
  oidcReturnTo: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmNewPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onMustReset: (e: React.FormEvent) => void;
  onSwitchUser: () => void;
}> = ({
  email,
  password,
  newPassword,
  confirmNewPassword,
  error,
  loading,
  mustReset,
  passwordPolicy,
  registrationEnabled,
  oidcEnabled,
  oidcEnforced,
  oidcProvider,
  oidcReturnTo,
  onEmailChange,
  onPasswordChange,
  onNewPasswordChange,
  onConfirmNewPasswordChange,
  onSubmit,
  onMustReset,
  onSwitchUser,
}) => {
  return (
    <>
      <div className="text-center">
        <LoginHeading
          mustReset={mustReset}
          oidcEnforced={oidcEnforced}
          oidcProvider={oidcProvider}
          registrationEnabled={registrationEnabled}
        />
      </div>

      <DrawablyCard className="p-6 sm:p-8 bg-white dark:bg-gray-900">
        <form className="space-y-5" onSubmit={mustReset ? onMustReset : onSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}

          <OidcOnlyButton
            visible={oidcEnforced && !mustReset}
            oidcProvider={oidcProvider}
            onClick={() => api.startOidcSignIn(oidcReturnTo)}
          />

          {(!oidcEnforced || mustReset) && (
            <div className="space-y-4">
              <SignInFields
                visible={!mustReset}
                email={email}
                password={password}
                onEmailChange={onEmailChange}
                onPasswordChange={onPasswordChange}
              />
              <MustResetFields
                visible={mustReset}
                newPassword={newPassword}
                confirmNewPassword={confirmNewPassword}
                passwordPolicy={passwordPolicy}
                onNewPasswordChange={onNewPasswordChange}
                onConfirmNewPasswordChange={onConfirmNewPasswordChange}
              />
            </div>
          )}
          {mustReset && (
            <PasswordRequirements
              password={newPassword}
              policy={passwordPolicy}
              className="text-gray-600 dark:text-gray-400"
            />
          )}

          <ForgotPasswordLink visible={!mustReset && !oidcEnforced} />

          <SubmitButton visible={!oidcEnforced || mustReset} mustReset={mustReset} loading={loading} />

          <OidcOptionalButton
            visible={!mustReset && oidcEnabled && !oidcEnforced}
            oidcProvider={oidcProvider}
            onClick={() => api.startOidcSignIn('/')}
          />

          <SocialLoginSection visible={!mustReset && !oidcEnforced} />

          <SwitchUserButton visible={mustReset} onClick={onSwitchUser} />
        </form>
      </DrawablyCard>
    </>
  );
};
