import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { DrawablyButton, DrawablyInput, DrawablyCard } from 'drawably/react';
import { Logo } from '../components/Logo';
import { authPasswordResetRequest } from '../api';
import { useT } from '../i18n/useT';

export const PasswordResetRequest: React.FC = () => {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authPasswordResetRequest(email.trim());
    } finally {
      // Mostrar siempre la misma confirmación, tenga o no una cuenta ese
      // email — el Worker deliberadamente no revela cuál es el caso.
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <div className="crayon-page">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <Logo className="mx-auto h-20 w-auto" />
          <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'var(--excalidash-display-font)' }}>
            {t('auth.passwordResetRequest.title')}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {t('auth.passwordResetRequest.subtitle')}
          </p>
        </div>

        <DrawablyCard className="p-6 sm:p-8 bg-white dark:bg-gray-900">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('auth.passwordResetRequest.confirmationPrefix')} <strong>{email}</strong>
                {t('auth.passwordResetRequest.confirmationSuffix')}
              </p>
              <Link to="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
                {t('auth.passwordResetRequest.backToSignIn')}
              </Link>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('auth.passwordResetRequest.emailLabel')}
                </label>
                <DrawablyInput
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full"
                  placeholder={t('auth.passwordResetRequest.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <DrawablyButton type="submit" variant="solid" className="w-full" state={loading ? 'loading' : 'idle'} disabled={loading}>
                <span>{loading ? t('auth.passwordResetRequest.submitCtaLoading') : t('auth.passwordResetRequest.submitCta')}</span>
              </DrawablyButton>
              <div className="text-center">
                <Link to="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
                  {t('auth.passwordResetRequest.backToSignIn')}
                </Link>
              </div>
            </form>
          )}
        </DrawablyCard>
      </div>
    </div>
  );
};
