import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api';
import { USER_KEY } from '../../utils/impersonation';
import { getPasswordPolicy, validatePassword } from '../../utils/passwordPolicy';
import { getSafeReturnTo } from '../../utils/safeReturnTo';
import { MfaRequiredError } from '../../api/auth';
import { useT } from '../../i18n/useT';

// Redirige fuera de /login una vez que el estado de auth se resuelve —
// bootstrap, aplicación forzada de OIDC, onboarding y "ya conectado" pasan
// todos por aquí, así que Login en sí solo tiene que renderizar, no decidir
// dónde pertenece el usuario.
function useLoginRedirect(mustReset: boolean, oidcReturnTo: string, oidcErrorCode: string | null) {
  const navigate = useNavigate();
  const {
    authEnabled,
    authStatusError,
    authOnboardingRequired,
    bootstrapRequired,
    oidcEnforced,
    isAuthenticated,
    loading: authLoading,
  } = useAuth();

  useEffect(() => {
    if (authStatusError) return;
    if (authLoading || authEnabled === null) return;
    if (authOnboardingRequired) {
      navigate('/auth-setup', { replace: true });
      return;
    }
    if (!authEnabled) {
      navigate('/app', { replace: true });
      return;
    }
    if (bootstrapRequired) {
      navigate('/register', { replace: true });
      return;
    }
    if (oidcEnforced && !mustReset) {
      if (!oidcErrorCode) {
        api.startOidcSignIn(oidcReturnTo);
      }
      return;
    }
    if (isAuthenticated && !mustReset) {
      navigate('/app', { replace: true });
    }
  }, [
    authEnabled,
    authLoading,
    authOnboardingRequired,
    authStatusError,
    bootstrapRequired,
    isAuthenticated,
    mustReset,
    navigate,
    oidcEnforced,
    oidcErrorCode,
    oidcReturnTo,
  ]);
}

export function useLoginController() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');

  const {
    login,
    completeMfaLogin,
    logout,
    authEnabled,
    registrationEnabled,
    authStatusError,
    retryAuthStatus,
    oidcEnabled,
    oidcEnforced,
    oidcProvider,
    user,
  } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryMustReset = searchParams.get('mustReset') === '1';
  const oidcErrorCode = searchParams.get('oidcError');
  const oidcErrorMessage = searchParams.get('oidcErrorMessage');
  const oidcReturnTo = getSafeReturnTo(searchParams.get('returnTo'));
  const mustReset = Boolean(user?.mustResetPassword) || queryMustReset;
  const passwordPolicy = getPasswordPolicy({ t });

  useEffect(() => {
    if (!oidcErrorCode) return;
    setError(oidcErrorMessage || 'OIDC sign-in failed');
  }, [oidcErrorCode, oidcErrorMessage]);

  useLoginRedirect(mustReset, oidcReturnTo, oidcErrorCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      const stored = localStorage.getItem(USER_KEY);
      const storedUser = stored ? (JSON.parse(stored) as { mustResetPassword?: boolean } | null) : null;
      if (storedUser?.mustResetPassword) {
        setPassword('');
        return;
      }
      navigate('/app');
    } catch (err: unknown) {
      if (err instanceof MfaRequiredError) {
        try {
          const { challengeId } = await api.authMfaChallenge(err.mfaToken);
          setMfaToken(err.mfaToken);
          setMfaChallengeId(challengeId);
        } catch {
          setError('Could not start two-factor verification. Please try again.');
        }
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to login';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken || !mfaChallengeId) return;
    setError('');
    setLoading(true);
    try {
      await completeMfaLogin(mfaToken, mfaChallengeId, otp);
      navigate('/app');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid code';
      setError(message);
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  const handleMustReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newPassword || !confirmNewPassword) {
      setError('Please enter and confirm a new password');
      return;
    }
    const passwordError = validatePassword(newPassword, passwordPolicy, t);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await api.api.post<{
        user: { id: string; email: string; name: string; role?: string; mustResetPassword?: boolean };
      }>('/auth/must-reset-password', { newPassword });

      localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));

      window.location.href = '/';
    } catch (err: unknown) {
      let message = 'Failed to reset password';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const cancelMfa = () => {
    setMfaToken(null);
    setMfaChallengeId(null);
    setOtp('');
    setError('');
  };

  const switchUser = () => {
    setNewPassword('');
    setConfirmNewPassword('');
    logout();
  };

  return {
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
    authEnabled,
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
  };
}
