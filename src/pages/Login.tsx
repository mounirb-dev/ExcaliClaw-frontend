import React from 'react';
import { DrawablyCard } from 'drawably/react';
import { Logo } from '../components/Logo';
import { AuthStatusErrorPanel } from '../components/AuthStatusErrorPanel';
import { useLoginController } from './login/useLoginController';
import { LoginFormCard, MfaChallengeFields } from './login/LoginFormSections';

export const Login: React.FC = () => {
  const {
    email,
    setEmail,
    password,
    setPassword,
    newPassword,
    setNewPassword,
    confirmNewPassword,
    setConfirmNewPassword,
    error,
    loading,
    mfaToken,
    mfaChallengeId,
    otp,
    setOtp,
    mustReset,
    passwordPolicy,
    registrationEnabled,
    authStatusError,
    retryAuthStatus,
    oidcEnabled,
    oidcEnforced,
    oidcProvider,
    oidcReturnTo,
    handleSubmit,
    handleMfaSubmit,
    handleMustReset,
    cancelMfa,
    switchUser,
  } = useLoginController();

  if (authStatusError) {
    return <AuthStatusErrorPanel message={authStatusError} onRetry={retryAuthStatus} fullScreen />;
  }

  if (mfaToken && mfaChallengeId) {
    return (
      <div className="crayon-page">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center">
            <Logo className="mx-auto h-20 w-auto" />
          </div>
          <DrawablyCard className="p-6 sm:p-8 bg-white dark:bg-gray-900">
            <MfaChallengeFields
              visible
              otp={otp}
              error={error || null}
              loading={loading}
              onOtpChange={setOtp}
              onSubmit={handleMfaSubmit}
              onCancel={cancelMfa}
            />
          </DrawablyCard>
        </div>
      </div>
    );
  }

  return (
    <div className="crayon-page">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <Logo className="mx-auto h-20 w-auto" />
        </div>

        <LoginFormCard
          email={email}
          password={password}
          newPassword={newPassword}
          confirmNewPassword={confirmNewPassword}
          error={error}
          loading={loading}
          mustReset={mustReset}
          passwordPolicy={passwordPolicy}
          registrationEnabled={registrationEnabled}
          oidcEnabled={oidcEnabled}
          oidcEnforced={oidcEnforced}
          oidcProvider={oidcProvider}
          oidcReturnTo={oidcReturnTo}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onNewPasswordChange={setNewPassword}
          onConfirmNewPasswordChange={setConfirmNewPassword}
          onSubmit={handleSubmit}
          onMustReset={handleMustReset}
          onSwitchUser={switchUser}
        />
      </div>
    </div>
  );
};
