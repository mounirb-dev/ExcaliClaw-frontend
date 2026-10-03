import React, { useState } from "react";
import { Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import { isAxiosError } from "../api";
import { useT } from "../i18n/useT";

/** Pantalla completa, sin forma de saltársela ni cerrarla — sustituye por
 * completo al dashboard (ver ProtectedRoute.tsx: `requireEmailVerification`)
 * mientras user.otpRequired && !user.emailVerified. No hay "seguir sin
 * verificar": si no se verifica, la cuenta se borra sola a las 24h
 * (sweepUnverifiedAccounts en el Worker) y hay que volver a registrarse. */
export const EmailVerificationGate: React.FC = () => {
  const { t } = useT();
  const { user, retryAuthStatus, logout } = useAuth();
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setError(null);
    setIsVerifying(true);
    try {
      await api.verifyEmail(code.trim());
      await retryAuthStatus();
    } catch (err: unknown) {
      setError(isAxiosError(err) ? err.response?.data?.error ?? t("emailVerify.error") : t("emailVerify.error"));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setIsResending(true);
    try {
      await api.resendEmailVerification();
      setResent(true);
    } catch {
      setError(t("emailVerify.resendError"));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50 dark:bg-neutral-950 px-4">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6 sm:p-8">
        <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-300 border-2 border-amber-200 dark:border-amber-900/30 mb-4">
          <Mail size={26} strokeWidth={2.5} />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t("emailVerify.gateTitle")}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">
          {t("emailVerify.gateDesc")} <strong className="text-neutral-700 dark:text-neutral-200">{user?.email}</strong>
        </p>
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-6">{t("emailVerify.gateDeadline")}</p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}
        {resent && !error && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {t("emailVerify.resentBanner")}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-3">
          <input
            aria-label={t("settings.deleteAccount.codeLabel")}
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full px-4 py-3 text-lg font-mono tracking-[0.3em] text-center rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="submit"
            disabled={isVerifying || code.trim().length === 0}
            className="w-full px-4 py-2.5 bg-amber-600 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition disabled:opacity-60"
          >
            {isVerifying ? t("emailVerify.verifyingCta") : t("emailVerify.verifyCta")}
          </button>
        </form>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => void handleResend()}
            disabled={isResending}
            className="text-xs font-semibold text-amber-700 dark:text-amber-400 underline disabled:opacity-60"
          >
            {isResending ? t("emailVerify.sendingCta") : t("emailVerify.resendCta")}
          </button>
          <button onClick={logout} className="text-xs font-semibold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
            {t("nav.logout")}
          </button>
        </div>
      </div>
    </div>
  );
};
