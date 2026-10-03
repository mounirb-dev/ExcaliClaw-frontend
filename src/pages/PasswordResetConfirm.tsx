import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { DrawablyButton, DrawablyCard } from 'drawably/react';
import { Logo } from '../components/Logo';
import { authPasswordResetConfirm, isAxiosError } from '../api';
import { getPasswordPolicy, validatePassword } from '../utils/passwordPolicy';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { PasswordField } from '../components/PasswordField';
import { useT } from '../i18n/useT';

export const PasswordResetConfirm: React.FC = () => {
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // El enlace de recuperación de Appwrite lleva estos dos parámetros de consulta, no un único token.
  const userId = searchParams.get('userId');
  const secret = searchParams.get('secret');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const passwordPolicy = getPasswordPolicy({ t });
  const validLink = Boolean(userId && secret);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.passwordResetConfirm.errorMismatch'));
      return;
    }

    const passwordError = validatePassword(password, passwordPolicy, t);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (!userId || !secret) {
      setError(t('auth.passwordResetConfirm.errorInvalidLink'));
      return;
    }

    setLoading(true);

    try {
      await authPasswordResetConfirm(userId, secret, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: unknown) {
      let message = t('auth.passwordResetConfirm.errorGeneric');
      if (isAxiosError(err)) {
        if (err.response?.data?.message) message = err.response.data.message;
        else if (err.response?.data?.error) message = err.response.data.error;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="crayon-page">
        <div className="max-w-md w-full text-center space-y-4">
          <Logo className="mx-auto h-20 w-auto" />
          <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'var(--excalidash-display-font)' }}>
            {t('auth.passwordResetConfirm.successTitle')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('auth.passwordResetConfirm.successMessage')}
          </p>
          <Link to="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
            {t('auth.passwordResetConfirm.goToSignIn')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="crayon-page">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <Logo className="mx-auto h-20 w-auto" />
          <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'var(--excalidash-display-font)' }}>
            {t('auth.passwordResetConfirm.title')}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {t('auth.passwordResetConfirm.subtitle')}
          </p>
        </div>

        <DrawablyCard className="p-6 sm:p-8 bg-white dark:bg-gray-900">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
                <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
              </div>
            )}
            {!validLink && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-4">
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  {t('auth.passwordResetConfirm.invalidLinkWarning')}
                </div>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('auth.passwordResetConfirm.newPasswordLabel')}
                </label>
                <PasswordField
                  id="password"
                  name="password"
                  autoComplete="new-password"
                  required
                  minLength={passwordPolicy.minLength}
                  maxLength={passwordPolicy.maxLength}
                  pattern={passwordPolicy.patternHtml}
                  className="w-full"
                  placeholder={t('auth.passwordResetConfirm.newPasswordLabel')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <PasswordRequirements password={password} policy={passwordPolicy} className="text-gray-600 dark:text-gray-400 mt-2" />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('auth.passwordResetConfirm.confirmPasswordLabel')}
                </label>
                <PasswordField
                  id="confirmPassword"
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  minLength={passwordPolicy.minLength}
                  maxLength={passwordPolicy.maxLength}
                  className="w-full"
                  placeholder={t('auth.passwordResetConfirm.confirmPasswordLabel')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <DrawablyButton type="submit" variant="solid" className="w-full" state={loading ? 'loading' : 'idle'} disabled={loading || !validLink}>
              <span>{loading ? t('auth.passwordResetConfirm.submitCtaLoading') : t('auth.passwordResetConfirm.submitCta')}</span>
            </DrawablyButton>

            <div className="text-center">
              <Link to="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
                {t('auth.passwordResetConfirm.backToSignIn')}
              </Link>
            </div>
          </form>
        </DrawablyCard>
      </div>
    </div>
  );
};
