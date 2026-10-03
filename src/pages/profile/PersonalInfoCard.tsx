import React from "react";
import { User, Save, X } from "lucide-react";
import { useT } from "../../i18n/useT";

type Props = {
  mustResetPassword: boolean;
  name: string;
  onNameChange: (name: string) => void;
  email: string;
  onEmailChange: (email: string) => void;
  authUserEmail: string | undefined;
  authUserName: string | undefined;
  showEmailForm: boolean;
  onShowEmailFormChange: (show: boolean) => void;
  emailCurrentPassword: string;
  onEmailCurrentPasswordChange: (value: string) => void;
  emailLoading: boolean;
  loading: boolean;
  onUpdateEmail: () => void;
  onUpdateName: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

/** La tarjeta de "Personal Information" en la página de Perfil: email +
 * nombre visible, cada uno con su propio flujo de guardar/cancelar.
 * Extraída para mantener esa página por debajo del umbral de líneas de
 * componente gigante de react-doctor. */
export const PersonalInfoCard: React.FC<Props> = ({
  mustResetPassword,
  name,
  onNameChange,
  email,
  onEmailChange,
  authUserEmail,
  authUserName,
  showEmailForm,
  onShowEmailFormChange,
  emailCurrentPassword,
  onEmailCurrentPasswordChange,
  emailLoading,
  loading,
  onUpdateEmail,
  onUpdateName,
  onError,
  onSuccess,
}) => {
  const { t } = useT();
  // No hay campos firstName/lastName separados en el backend (solo `name`) —
  // se divide/combina en el primer espacio para no tener que tocar el
  // esquema de Appwrite solo por esta conveniencia de UI.
  const spaceIdx = name.indexOf(" ");
  const firstName = spaceIdx === -1 ? name : name.slice(0, spaceIdx);
  const lastName = spaceIdx === -1 ? "" : name.slice(spaceIdx + 1);
  const setFirstName = (value: string) => onNameChange(lastName ? `${value} ${lastName}` : value);
  const setLastName = (value: string) => onNameChange(value ? `${firstName} ${value}` : firstName);
  return (
  <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
    <div className="flex items-center gap-3 mb-6">
      <div className="w-12 h-12 bg-indigo-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700">
        <User size={24} className="text-indigo-600 dark:text-indigo-400" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('profile.personalInfo.title')}</h2>
    </div>

    {mustResetPassword && (
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
        <p className="text-amber-900 dark:text-amber-200 font-bold">
          {t('profile.personalInfo.resetRequiredTitle')}
        </p>
        <p className="text-sm text-amber-800 dark:text-amber-200/80 font-medium mt-1">
          {t('profile.personalInfo.resetRequiredMessage')}
        </p>
      </div>
    )}
    <div className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          {t('profile.personalInfo.emailLabel')}
        </label>
        <div className="flex gap-3">
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            disabled={!showEmailForm}
            className={
              showEmailForm
                ? "flex-1 px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 font-medium"
                : "flex-1 px-4 py-3 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-600 dark:text-neutral-400 cursor-not-allowed"
            }
          />
          {!showEmailForm && (
            <button
              onClick={() => {
                onShowEmailFormChange(true);
                onEmailCurrentPasswordChange('');
                onError('');
                onSuccess('');
              }}
              disabled={mustResetPassword}
              className="px-6 py-3 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition duration-200"
            >
              {t('profile.personalInfo.changeCta')}
            </button>
          )}
        </div>

        {showEmailForm && (
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="emailCurrentPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                {t('profile.personalInfo.currentPasswordLabel')}
              </label>
              <input
                id="emailCurrentPassword"
                type="password"
                value={emailCurrentPassword}
                onChange={(e) => onEmailCurrentPasswordChange(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 font-medium"
                placeholder={t('profile.personalInfo.currentPasswordPlaceholder')}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={onUpdateEmail}
                disabled={
                  emailLoading ||
                  !email.trim() ||
                  !emailCurrentPassword ||
                  email.trim() === authUserEmail
                }
                className="flex-1 px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailLoading ? t('profile.personalInfo.savingCta') : t('profile.personalInfo.saveEmailCta')}
              </button>
              <button
                onClick={() => {
                  onShowEmailFormChange(false);
                  onEmailChange(authUserEmail || '');
                  onEmailCurrentPasswordChange('');
                  onError('');
                }}
                disabled={emailLoading}
                className="px-6 py-3 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <X size={18} />
                {t('profile.personalInfo.cancelCta')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
              {t('profile.personalInfo.firstNameLabel')}
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 font-medium"
              placeholder={t('profile.personalInfo.firstNamePlaceholder')}
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
              {t('profile.personalInfo.lastNameLabel')}
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 font-medium"
              placeholder={t('profile.personalInfo.lastNamePlaceholder')}
            />
          </div>
        </div>
        <div className="flex gap-3 mt-3">
          <button
            onClick={onUpdateName}
            disabled={mustResetPassword || loading || !name.trim() || name === authUserName}
            className="px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:disabled:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] flex items-center gap-2"
          >
            <Save size={18} />
            {t('profile.personalInfo.saveCta')}
          </button>
        </div>
      </div>
    </div>
  </div>
  );
};
