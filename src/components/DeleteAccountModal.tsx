import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { DrawablyButton, DrawablyInput } from "drawably/react";
import { PasswordField } from "./PasswordField";
import * as api from "../api";
import { isAxiosError } from "../api";
import { useT } from "../i18n/useT";

type Props = {
  onClose: () => void;
  onDeleted: () => void;
};

const CONFIRM_WORD = "DELETE";
type Step = "password" | "code";

type Translate = ReturnType<typeof useT>["t"];

/** Mensaje de error de una petición: el del servidor si lo trae, si no el genérico. */
const errorMessage = (err: unknown, t: Translate): string => {
  const generic = t("settings.deleteAccount.genericError");
  return isAxiosError(err) ? err.response?.data?.error ?? generic : generic;
};

const LABEL_CLASS = "text-xs font-bold text-slate-500 dark:text-neutral-400 mb-1 block";

const CancelButton: React.FC<{ onClick: () => void; disabled: boolean; label: string }> = ({ onClick, disabled, label }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="flex-1 px-4 py-2.5 bg-emerald-50 dark:bg-neutral-800 text-emerald-700 dark:text-emerald-200 font-bold rounded-xl border-2 border-emerald-200 dark:border-neutral-700 hover:bg-emerald-100 dark:hover:bg-neutral-700 transition disabled:opacity-60"
  >
    {label}
  </button>
);

/** Botón de envío rojo con estado de carga (mismo aspecto en los dos pasos). */
const DangerSubmit: React.FC<{ loading: boolean; disabled: boolean; idleLabel: string; loadingLabel: string }> = ({
  loading,
  disabled,
  idleLabel,
  loadingLabel,
}) => (
  <DrawablyButton
    key={loading ? loadingLabel : idleLabel}
    type="submit"
    variant="solid"
    tone="danger"
    className="flex-1"
    disabled={disabled}
    state={loading ? "loading" : "idle"}
  >
    {loading ? loadingLabel : idleLabel}
  </DrawablyButton>
);

const PasswordStep: React.FC<{
  password: string;
  onPasswordChange: (value: string) => void;
  isSending: boolean;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}> = ({ password, onPasswordChange, isSending, busy, onSubmit, onCancel }) => {
  const { t } = useT();
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label htmlFor="delete-account-password" className={LABEL_CLASS}>
          {t("settings.deleteAccount.passwordLabel")}
        </label>
        <PasswordField
          id="delete-account-password"
          required
          autoComplete="current-password"
          className="w-full"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
      </div>
      <div className="flex gap-3 pt-1">
        <CancelButton onClick={onCancel} disabled={busy} label={t("settings.deleteAccount.cancel")} />
        <DangerSubmit
          loading={isSending}
          disabled={!password.trim() || isSending}
          idleLabel={t("settings.deleteAccount.sendOtpCta")}
          loadingLabel={t("settings.deleteAccount.sendingOtp")}
        />
      </div>
    </form>
  );
};

const CodeStep: React.FC<{
  code: string;
  onCodeChange: (value: string) => void;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  isDeleting: boolean;
  canDelete: boolean;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}> = ({ code, onCodeChange, confirmText, onConfirmTextChange, isDeleting, canDelete, busy, onSubmit, onCancel }) => {
  const { t } = useT();
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label htmlFor="delete-account-code" className={LABEL_CLASS}>
          {t("settings.deleteAccount.codeLabel")}
        </label>
        <DrawablyInput
          id="delete-account-code"
          required
          inputMode="numeric"
          maxLength={6}
          className="w-full font-mono tracking-widest"
          placeholder="123456"
          value={code}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      <div>
        <label htmlFor="delete-account-confirm" className={LABEL_CLASS}>
          {t("settings.deleteAccount.confirmLabel").replace("{word}", CONFIRM_WORD)}
        </label>
        <DrawablyInput
          id="delete-account-confirm"
          required
          className="w-full"
          placeholder={CONFIRM_WORD}
          value={confirmText}
          onChange={(e) => onConfirmTextChange(e.target.value)}
        />
      </div>
      <div className="flex gap-3 pt-1">
        <CancelButton onClick={onCancel} disabled={busy} label={t("settings.deleteAccount.cancel")} />
        <DangerSubmit
          loading={isDeleting}
          disabled={!canDelete}
          idleLabel={t("settings.deleteAccount.confirmCta")}
          loadingLabel={t("settings.deleteAccount.deleting")}
        />
      </div>
    </form>
  );
};

/**
 * Última pantalla antes de un borrado irreversible, en dos pasos: (1)
 * contraseña actual — el Worker la reverifica y manda un código de 6
 * dígitos al email (POST /auth/account/delete-otp); (2) ese código +
 * escribir literalmente "DELETE" (para que no baste con un doble clic
 * accidental en un dispositivo con la sesión ya abierta). DELETE
 * /auth/account exige contraseña Y código — ambos viajan juntos en el
 * paso final. Montado solo mientras está abierto (mismo patrón que
 * TwoFactorModal) — instancia nueva cada vez, sin efecto de reseteo.
 */
export const DeleteAccountModal: React.FC<Props> = ({ onClose, onDeleted }) => {
  const { t } = useT();
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busy = isSendingOtp || isDeleting;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isSendingOtp) return;
    setError(null);
    setIsSendingOtp(true);
    try {
      await api.requestDeleteAccountOtp(password);
      setStep("code");
    } catch (err: unknown) {
      setError(errorMessage(err, t));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const canDelete = code.trim().length > 0 && confirmText.trim().toUpperCase() === CONFIRM_WORD && !isDeleting;

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canDelete) return;
    setError(null);
    setIsDeleting(true);
    try {
      await api.deleteAccount(password, code.trim());
      onDeleted();
    } catch (err: unknown) {
      setError(errorMessage(err, t));
    } finally {
      // También en éxito: onDeleted() navega a /login, pero resetear esto
      // en el mismo sitio siempre (no solo en el catch) es lo que pide
      // react-doctor/no-loading-flag-reset-outside-finally — y es inofensivo
      // aquí, el modal ya está a punto de desmontarse de todos modos.
      setIsDeleting(false);
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={t("settings.deleteAccount.title")}
      className="z-50 m-auto max-w-md w-full p-0 bg-transparent text-slate-900 dark:text-neutral-100 backdrop:bg-neutral-900/20 backdrop:backdrop-blur-sm"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="relative w-full bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] p-6">
        <button
          onClick={onClose}
          disabled={busy}
          aria-label={t("modal.common.close")}
          className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors disabled:opacity-50"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-300 border-2 border-rose-200 dark:border-rose-900/30 shrink-0">
            <AlertTriangle size={20} strokeWidth={2.5} />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t("settings.deleteAccount.title")}</h2>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
          {step === "password" ? t("settings.deleteAccount.warning") : t("settings.deleteAccount.codeSentDesc")}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {step === "password" ? (
          <PasswordStep
            password={password}
            onPasswordChange={setPassword}
            isSending={isSendingOtp}
            busy={busy}
            onSubmit={handleRequestOtp}
            onCancel={onClose}
          />
        ) : (
          <CodeStep
            code={code}
            onCodeChange={setCode}
            confirmText={confirmText}
            onConfirmTextChange={setConfirmText}
            isDeleting={isDeleting}
            canDelete={canDelete}
            busy={busy}
            onSubmit={handleDelete}
            onCancel={onClose}
          />
        )}
      </div>
    </dialog>,
    document.body,
  );
};
