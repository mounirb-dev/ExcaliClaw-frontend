import React from 'react';
import { Github } from 'lucide-react';
import { DrawablyButton, DrawablyDivider } from 'drawably/react';
import { startSocialSignIn, socialSignInAvailable, type SocialProvider } from '../api/auth';
import { useT } from '../i18n/useT';

const GoogleIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-4z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.4C29.6 35.3 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.6 5.4C41.4 35.8 44 30.3 44 24c0-1.3-.1-2.7-.4-3.5z" />
  </svg>
);

const providerLabel: Record<SocialProvider, string> = {
  google: 'Google',
  github: 'GitHub',
};

const providerIcon: Record<SocialProvider, React.ReactNode> = {
  google: <GoogleIcon />,
  github: <Github size={16} />,
};

export const SocialLoginButtons: React.FC<{ returnTo?: string }> = ({ returnTo = '/' }) => {
  const { t } = useT();
  if (!socialSignInAvailable()) return null;

  const providers: SocialProvider[] = ['google', 'github'];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <DrawablyDivider className="flex-1" />
        {t('auth.social.divider')}
        <DrawablyDivider className="flex-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {providers.map((provider) => (
          <DrawablyButton
            key={provider}
            type="button"
            tone="neutral"
            className="w-full"
            onClick={() => startSocialSignIn(provider, returnTo)}
          >
            <span className="inline-flex items-center justify-center gap-2">
              {providerIcon[provider]}
              {providerLabel[provider]}
            </span>
          </DrawablyButton>
        ))}
      </div>
    </div>
  );
};
