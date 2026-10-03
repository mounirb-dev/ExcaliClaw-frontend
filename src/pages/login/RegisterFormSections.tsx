// Ramas de renderizado independientes extraídas de Register.tsx, con el
// mismo razonamiento que LoginFormSections.tsx: cada sección posee su
// propia condición de visibilidad en vez de que el componente de página
// ramifique en cada combinación.
import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { DrawablyButton, DrawablyInput } from 'drawably/react';
import { useT } from '../../i18n/useT';
import { PasswordField } from '../../components/PasswordField';
import { PasswordRequirements } from '../../components/PasswordRequirements';
import type { getPasswordPolicy } from '../../utils/passwordPolicy';

export const RegisterHeading: React.FC<{
  bootstrapRequired: boolean;
  bootstrapLogsCommand: string;
  copiedBootstrapCmd: boolean;
  onCopyBootstrapCommand: () => void;
}> = ({ bootstrapRequired, bootstrapLogsCommand, copiedBootstrapCmd, onCopyBootstrapCommand }) => {
  const { t } = useT();
  return (
  <>
    <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'var(--excalidash-display-font)' }}>
      {bootstrapRequired ? t('auth.register.setUpAdminAccount') : t('auth.register.joinExcaliClaw')}
    </h2>
    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
      {bootstrapRequired ? (
        <span>
          {t('auth.register.bootstrapInstructions')}
        </span>
      ) : (
        <>
          {t('auth.register.alreadyHaveAccount')}{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">
            {t('auth.login.signIn')}
          </Link>
        </>
      )}
    </p>
    <BootstrapSetupCodeHelp
      visible={bootstrapRequired}
      bootstrapLogsCommand={bootstrapLogsCommand}
      copiedBootstrapCmd={copiedBootstrapCmd}
      onCopyBootstrapCommand={onCopyBootstrapCommand}
    />
  </>
  );
};

const BootstrapSetupCodeHelp: React.FC<{
  visible: boolean;
  bootstrapLogsCommand: string;
  copiedBootstrapCmd: boolean;
  onCopyBootstrapCommand: () => void;
}> = ({ visible, bootstrapLogsCommand, copiedBootstrapCmd, onCopyBootstrapCommand }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-900 dark:text-amber-200 text-left">
      <div className="font-semibold">{t('auth.register.oneTimeSetupCode')}</div>
      <div className="mt-1 text-amber-800 dark:text-amber-200/90">
        {t('auth.register.findInBackendLogs')} <code>[BOOTSTRAP SETUP]</code>:
      </div>
      <div className="mt-2 rounded bg-amber-100 dark:bg-amber-900/30 p-2">
        <div className="flex items-start gap-2">
          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[11px] leading-snug">
            <code className="select-all">{bootstrapLogsCommand}</code>
          </pre>
          <button
            type="button"
            onClick={onCopyBootstrapCommand}
            className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded border border-amber-200/80 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/35 text-amber-900 dark:text-amber-100 hover:bg-amber-50 dark:hover:bg-amber-900/50"
            aria-label={copiedBootstrapCmd ? t('auth.register.copiedDockerCommand') : t('auth.register.copyDockerCommand')}
            title={copiedBootstrapCmd ? t('auth.register.copied') : t('auth.register.copy')}
          >
            {copiedBootstrapCmd ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <div className="mt-2 text-amber-800 dark:text-amber-200/90">
        {t('auth.register.notUsingComposeProdPrefix')} <code>docker-compose.prod.yml</code>{t('auth.register.dropFlagSuffix')} <code>-f ...</code> {t('auth.register.flagSuffix')}
      </div>
    </div>
  );
};

export const BootstrapOidcOption: React.FC<{
  visible: boolean;
  loading: boolean;
  oidcProvider: string | null;
  onClick: () => void;
}> = ({ visible, loading, oidcProvider, onClick }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <div className="space-y-3">
      <DrawablyButton type="button" className="w-full" tone="neutral" disabled={loading} onClick={onClick}>
        <span>{t('auth.register.setUpAdminWithPrefix')} {oidcProvider || 'OIDC'}</span>
      </DrawablyButton>
      <div className="text-center text-xs text-gray-500 dark:text-gray-400">
        {t('auth.register.orCreateLocalAdmin')}
      </div>
    </div>
  );
};

export const SetupCodeField: React.FC<{
  visible: boolean;
  setupCode: string;
  onSetupCodeChange: (value: string) => void;
}> = ({ visible, setupCode, onSetupCodeChange }) => {
  const { t } = useT();
  if (!visible) return null;
  return (
    <div>
      <label htmlFor="setupCode" className="block text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">
        {t('auth.register.bootstrapSetupCode')}
      </label>
      <DrawablyInput
        id="setupCode"
        name="setupCode"
        type="text"
        autoComplete="one-time-code"
        required
        className="w-full uppercase tracking-widest"
        placeholder={t('auth.register.oneTimeSetupCode')}
        value={setupCode}
        onChange={(e) => onSetupCodeChange(e.target.value.toUpperCase())}
      />
    </div>
  );
};

const FIELD_LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

/** Campos del formulario de registro: nombre, email, contraseña (con sus
 * requisitos) y, solo en el primer arranque de un servidor autoalojado, el
 * código de configuración. */
export const RegisterFields: React.FC<{
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  passwordPolicy: ReturnType<typeof getPasswordPolicy>;
  bootstrapRequired: boolean;
  setupCode: string;
  onSetupCodeChange: (value: string) => void;
}> = ({
  name,
  onNameChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  passwordPolicy,
  bootstrapRequired,
  setupCode,
  onSetupCodeChange,
}) => {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="name" className={FIELD_LABEL_CLASS}>
          {t('auth.register.nameLabel')}
        </label>
        <DrawablyInput
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          className="w-full"
          placeholder={t('auth.register.namePlaceholder')}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="email" className={FIELD_LABEL_CLASS}>
          {t('auth.register.emailLabel')}
        </label>
        <DrawablyInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full"
          placeholder={t('auth.register.emailPlaceholder')}
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password" className={FIELD_LABEL_CLASS}>
          {t('auth.register.passwordLabel')}
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
          placeholder="••••••••"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
        <PasswordRequirements password={password} policy={passwordPolicy} className="text-gray-600 dark:text-gray-400 mt-2" />
      </div>
      <SetupCodeField visible={bootstrapRequired} setupCode={setupCode} onSetupCodeChange={onSetupCodeChange} />
    </div>
  );
};
