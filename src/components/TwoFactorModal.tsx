import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { X, ShieldCheck, Loader2, Copy, Check } from "lucide-react";
import { DrawablyButton, DrawablyInput } from "drawably/react";
import * as api from "../api";
import { useT } from "../i18n/useT";

type Props = {
  currentlyEnabled: boolean;
  onClose: () => void;
  onChanged: (enabled: boolean) => void;
};

type Step = "loading" | "enabled" | "has-factor" | "setup-qr" | "setup-codes" | "disabling";

// Montado solo mientras está abierto (ver Settings.tsx) — instancia nueva
// en cada apertura, así que esto posee su propio estado de registro
// multi-paso sin un efecto de reseteo.
export const TwoFactorModal: React.FC<Props> = ({ currentlyEnabled, onClose, onChanged }) => {
  const { t } = useT();
  const [step, setStep] = useState<Step>(currentlyEnabled ? "enabled" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [secret, setSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hasStartedSetupRef = useRef(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (step !== "loading") return;
    // Protege contra la doble invocación de efectos de React StrictMode en
    // dev, que de otro modo dispararía dos llamadas a createMfaAuthenticator
    // — la segunda invalida silenciosamente el secreto de la primera, así
    // que el QR mostrado podría dejar de coincidir con lo que el usuario ya
    // escaneó.
    if (hasStartedSetupRef.current) return;
    hasStartedSetupRef.current = true;
    let ignore = false;
    (async () => {
      try {
        // Un ciclo previo de registro+deshabilitación deja el factor TOTP
        // verificado en la cuenta aunque la aplicación forzada esté
        // apagada — Appwrite se niega a crear un segundo autenticador
        // ("already verified on the current user"), así que se comprueba
        // primero y se salta directo a volver a habilitar en vez de
        // mostrar un QR que nadie necesita escanear de nuevo.
        const factors = await api.mfaListFactors();
        if (ignore) return;
        if (factors.totp) {
          setStep("has-factor");
          return;
        }
        const { secret: newSecret, uri } = await api.mfaCreateAuthenticator();
        if (ignore) return;
        const dataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
        if (ignore) return;
        setSecret(newSecret);
        setQrDataUrl(dataUrl);
        setStep("setup-qr");
      } catch (err: unknown) {
        if (ignore) return;
        setError(api.isAxiosError(err) ? err.response?.data?.message ?? t("modal.twoFactor.errorStartSetup") : t("modal.twoFactor.errorStartSetup"));
      }
    })();
    return () => {
      ignore = true;
    };
  }, [step, t]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await api.mfaVerifyAuthenticator(otp);
      const { recoveryCodes: codes } = await api.mfaCreateRecoveryCodes();
      setRecoveryCodes(codes);
      setStep("setup-codes");
    } catch (err: unknown) {
      setError(api.isAxiosError(err) ? err.response?.data?.message ?? t("modal.twoFactor.errorInvalidCode") : t("modal.twoFactor.errorInvalidCode"));
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await api.mfaSetEnabled(true);
      onChanged(true);
      onClose();
    } catch (err: unknown) {
      setError(api.isAxiosError(err) ? err.response?.data?.message ?? t("modal.twoFactor.errorEnable") : t("modal.twoFactor.errorEnable"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseNewAuthenticator = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await api.mfaRemoveAuthenticator();
      hasStartedSetupRef.current = false;
      setStep("loading");
    } catch (err: unknown) {
      setError(api.isAxiosError(err) ? err.response?.data?.message ?? t("modal.twoFactor.errorReset") : t("modal.twoFactor.errorReset"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await api.mfaSetEnabled(false);
      onChanged(false);
      onClose();
    } catch (err: unknown) {
      setError(api.isAxiosError(err) ? err.response?.data?.message ?? t("modal.twoFactor.errorDisable") : t("modal.twoFactor.errorDisable"));
    } finally {
      setIsLoading(false);
    }
  };

  const copySecret = () => {
    void navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Two-factor authentication"
      className="z-50 m-auto max-w-[440px] w-full p-0 bg-transparent text-slate-900 dark:text-neutral-100 backdrop:bg-neutral-900/20 backdrop:backdrop-blur-sm"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="relative w-full bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] flex flex-col">
        <div className="px-6 py-4 flex items-center justify-between border-b-2 border-black dark:border-neutral-700">
          <h2 className="text-base font-bold text-slate-800 dark:text-neutral-100 flex items-center gap-2">
            <ShieldCheck size={18} className="text-indigo-600 dark:text-indigo-400" />
            {t("modal.twoFactor.title")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("modal.common.close")}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          {step === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8 text-slate-400 dark:text-neutral-500">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-xs font-bold">{t("modal.twoFactor.startingSetup")}</p>
            </div>
          )}

          {step === "enabled" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {t("modal.twoFactor.enabledDescription")}
              </div>
              <DrawablyButton
                key={t("modal.twoFactor.turnOff")}
                type="button"
                tone="danger"
                className="w-full"
                state={isLoading ? "loading" : "idle"}
                disabled={isLoading}
                onClick={handleDisable}
              >
                {t("modal.twoFactor.turnOff")}
              </DrawablyButton>
            </div>
          )}

          {step === "has-factor" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs font-semibold text-slate-600 dark:text-neutral-300">
                {t("modal.twoFactor.hasFactorDescription")}
              </div>
              <DrawablyButton
                key={t("modal.twoFactor.turnOn")}
                type="button"
                variant="solid"
                className="w-full"
                state={isLoading ? "loading" : "idle"}
                disabled={isLoading}
                onClick={handleFinish}
              >
                {t("modal.twoFactor.turnOn")}
              </DrawablyButton>
              <button
                type="button"
                onClick={handleUseNewAuthenticator}
                disabled={isLoading}
                className="w-full text-center text-xs font-semibold text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200"
              >
                {t("modal.twoFactor.useDifferentAuthenticator")}
              </button>
            </div>
          )}

          {step === "setup-qr" && (
            <form className="space-y-4" onSubmit={handleVerify}>
              <p className="text-xs font-semibold text-slate-500 dark:text-neutral-400">
                {t("modal.twoFactor.scanInstructions")}
              </p>
              {qrDataUrl && (
                <div className="flex justify-center">
                  <img
                    src={qrDataUrl}
                    alt={t("modal.twoFactor.qrAlt")}
                    className="rounded-xl border-2 border-black dark:border-neutral-700"
                    width={200}
                    height={200}
                  />
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 mb-1">
                  {t("modal.twoFactor.manualEntryLabel")}
                </p>
                <button
                  type="button"
                  onClick={copySecret}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 font-mono text-xs text-slate-700 dark:text-neutral-300 break-all text-left"
                >
                  <span className="break-all">{secret}</span>
                  {copied ? <Check size={14} className="shrink-0 text-emerald-600" /> : <Copy size={14} className="shrink-0" />}
                </button>
              </div>
              <div>
                <label htmlFor="mfa-setup-otp" className="text-xs font-bold text-slate-500 dark:text-neutral-400 mb-1 block">
                  {t("modal.twoFactor.enterCodeLabel")}
                </label>
                <DrawablyInput
                  id="mfa-setup-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  className="w-full text-center text-lg tracking-[0.5em]"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
              <DrawablyButton
                key={t("modal.twoFactor.verifyAndContinue")}
                type="submit"
                variant="solid"
                className="w-full"
                state={isLoading ? "loading" : "idle"}
                disabled={isLoading || otp.length < 6}
              >
                {t("modal.twoFactor.verifyAndContinue")}
              </DrawablyButton>
            </form>
          )}

          {step === "setup-codes" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300">
                {t("modal.twoFactor.recoveryCodesWarning")}
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                {recoveryCodes.map((code) => (
                  <div
                    key={code}
                    className="px-2 py-1.5 rounded-lg border-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-center text-slate-700 dark:text-neutral-300"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <DrawablyButton
                key={t("modal.twoFactor.savedCodesConfirm")}
                type="button"
                variant="solid"
                className="w-full"
                state={isLoading ? "loading" : "idle"}
                disabled={isLoading}
                onClick={handleFinish}
              >
                {t("modal.twoFactor.savedCodesConfirm")}
              </DrawablyButton>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
};
