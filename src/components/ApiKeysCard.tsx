import React, { useEffect, useRef, useState } from "react";
import { KeyRound, X, Copy, Check, Loader2, Trash2, Plus } from "lucide-react";
import { DrawablyButton, DrawablyInput } from "drawably/react";
import * as api from "../api";
import type { ApiKeyMetadata } from "../api";
import { ConfirmModal } from "./ConfirmModal";
import { useT } from "../i18n/useT";

type ModalStep = "list" | "create" | "reveal";
type Translate = (key: string) => string;

const formatDate = (iso: string | null, neverLabel: string): string => iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : neverLabel;

const ApiKeysListStep: React.FC<{ keys: ApiKeyMetadata[] | null; isLoading: boolean; t: Translate; onCreate: () => void; onRevoke: (key: ApiKeyMetadata) => void }> = ({ keys, isLoading, t, onCreate, onRevoke }) => (
  <div className="space-y-4">
    <p className="text-xs font-semibold text-slate-500 dark:text-neutral-400">{t("profile.apiKeys.description")}</p>
    {isLoading && keys === null && <div className="flex flex-col items-center gap-2 py-6 text-slate-400 dark:text-neutral-500"><Loader2 size={22} className="animate-spin" /></div>}
    {keys !== null && keys.length === 0 && !isLoading && <div className="p-3 rounded-xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs font-semibold text-slate-600 dark:text-neutral-300">{t("profile.apiKeys.empty")}</div>}
    {keys !== null && keys.length > 0 && <ul className="space-y-2">{keys.map((key) => <li key={key.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-bold text-slate-800 dark:text-neutral-100 truncate">{key.name}</span>{key.revokedAt && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">{t("profile.apiKeys.revokedBadge")}</span>}</div><div className="text-[11px] font-mono text-slate-500 dark:text-neutral-400 truncate">{key.prefix}••••••••</div><div className="text-[10px] text-slate-400 dark:text-neutral-500 mt-0.5">{t("profile.apiKeys.createdPrefix")} {formatDate(key.createdAt, t("profile.apiKeys.neverUsed"))} {t("profile.apiKeys.lastUsedSeparator")} {formatDate(key.lastUsedAt, t("profile.apiKeys.neverUsed"))}</div></div>{!key.revokedAt && <button onClick={() => onRevoke(key)} aria-label={`${t("profile.apiKeys.revokeAriaLabelPrefix")} ${key.name}`} className="shrink-0 p-2 rounded-lg text-rose-500 hover:text-white hover:bg-rose-600 transition-colors"><Trash2 size={16} /></button>}</li>)}</ul>}
    <DrawablyButton key={t("profile.apiKeys.createCta")} type="button" variant="solid" className="w-full flex items-center justify-center gap-2" onClick={onCreate}><Plus size={16} />{t("profile.apiKeys.createCta")}</DrawablyButton>
  </div>
);

const ApiKeyCreateStep: React.FC<{ name: string; isLoading: boolean; t: Translate; onNameChange: (name: string) => void; onSubmit: (event: React.FormEvent) => void; onCancel: () => void }> = ({ name, isLoading, t, onNameChange, onSubmit, onCancel }) => (
  <form className="space-y-4" onSubmit={onSubmit}><div><label htmlFor="api-key-name" className="text-xs font-bold text-slate-500 dark:text-neutral-400 mb-1 block">{t("profile.apiKeys.nameLabel")}</label><DrawablyInput id="api-key-name" required className="w-full" placeholder={t("profile.apiKeys.namePlaceholder")} value={name} onChange={(event) => onNameChange(event.target.value)} /></div><p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">{t("profile.apiKeys.createWarning")}</p><div className="flex gap-3"><DrawablyButton key={t("profile.apiKeys.createKeyCta")} type="submit" variant="solid" className="flex-1" state={isLoading ? "loading" : "idle"} disabled={isLoading || !name.trim()}>{t("profile.apiKeys.createKeyCta")}</DrawablyButton><button type="button" onClick={onCancel} disabled={isLoading} className="px-4 py-2 rounded-xl border-2 border-black dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-neutral-300">{t("profile.apiKeys.cancelCta")}</button></div></form>
);

const ApiKeyRevealStep: React.FC<{ newToken: string; copied: boolean; t: Translate; onCopy: () => void; onDone: () => void }> = ({ newToken, copied, t, onCopy, onDone }) => (
  <div className="space-y-4"><div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300">{t("profile.apiKeys.revealWarning")}</div><button type="button" onClick={onCopy} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 font-mono text-xs text-slate-700 dark:text-neutral-300 break-all text-left"><span className="break-all">{newToken}</span>{copied ? <Check size={14} className="shrink-0 text-emerald-600" /> : <Copy size={14} className="shrink-0" />}</button><DrawablyButton key={t("profile.apiKeys.doneCta")} type="button" variant="solid" className="w-full" onClick={onDone}>{t("profile.apiKeys.doneCta")}</DrawablyButton></div>
);

const ApiKeysModal: React.FC<{ onClose: () => void; onKeysChanged: (keys: ApiKeyMetadata[]) => void }> = ({ onClose, onKeysChanged }) => {
  const { t } = useT();
  const [step, setStep] = useState<ModalStep>("list");
  const [keys, setKeys] = useState<ApiKeyMetadata[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyMetadata | null>(null);
  const [revoking, setRevoking] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const loadKeys = async () => { setIsLoading(true); setError(null); try { const list = await api.listApiKeys(); setKeys(list); onKeysChanged(list); } catch (err: unknown) { setError(api.isAxiosError(err) ? err.response?.data?.message ?? t("profile.apiKeys.failedToLoad") : t("profile.apiKeys.failedToLoad")); } finally { setIsLoading(false); } };
  useEffect(() => { void loadKeys(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleCreate = async (event: React.FormEvent) => { event.preventDefault(); if (!name.trim()) return; setError(null); setIsLoading(true); try { const { token } = await api.createApiKey(name.trim()); setNewToken(token); setStep("reveal"); setName(""); await loadKeys(); } catch (err: unknown) { setError(api.isAxiosError(err) ? err.response?.data?.message ?? t("profile.apiKeys.failedToCreate") : t("profile.apiKeys.failedToCreate")); } finally { setIsLoading(false); } };
  const handleRevoke = async () => { if (!revokeTarget) return; setRevoking(true); try { await api.revokeApiKey(revokeTarget.id); setRevokeTarget(null); await loadKeys(); } catch (err: unknown) { setError(api.isAxiosError(err) ? err.response?.data?.message ?? t("profile.apiKeys.failedToRevoke") : t("profile.apiKeys.failedToRevoke")); } finally { setRevoking(false); } };
  const copyToken = () => { void navigator.clipboard.writeText(newToken).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };

  return <><dialog ref={dialogRef} aria-label={t("profile.apiKeys.title")} className="z-50 m-auto max-w-[520px] w-full p-0 bg-transparent text-slate-900 dark:text-neutral-100 backdrop:bg-neutral-900/20 backdrop:backdrop-blur-sm" onCancel={(event) => { event.preventDefault(); onClose(); }}><div className="relative w-full bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] flex flex-col max-h-[85vh]"><div className="px-6 py-4 flex items-center justify-between border-b-2 border-black dark:border-neutral-700 shrink-0"><h2 className="text-base font-bold text-slate-800 dark:text-neutral-100 flex items-center gap-2"><KeyRound size={18} className="text-indigo-600 dark:text-indigo-400" />{t("profile.apiKeys.title")}</h2><button onClick={onClose} aria-label={t("profile.apiKeys.closeAriaLabel")} className="p-1 rounded-lg text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors"><X size={18} /></button></div><div className="px-6 py-6 space-y-5 overflow-y-auto">{error && <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</div>}{step === "list" && <ApiKeysListStep keys={keys} isLoading={isLoading} t={t} onCreate={() => setStep("create")} onRevoke={setRevokeTarget} />}{step === "create" && <ApiKeyCreateStep name={name} isLoading={isLoading} t={t} onNameChange={setName} onSubmit={handleCreate} onCancel={() => { setStep("list"); setError(null); }} />}{step === "reveal" && <ApiKeyRevealStep newToken={newToken} copied={copied} t={t} onCopy={copyToken} onDone={() => setStep("list")} />}</div></div></dialog><ConfirmModal isOpen={revokeTarget !== null} title={t("profile.apiKeys.revokeModalTitle")} message={<>{t("profile.apiKeys.revokeModalMessagePrefix")} <strong>{revokeTarget?.name}</strong> {t("profile.apiKeys.revokeModalMessageSuffix")}</>} confirmText={revoking ? t("profile.apiKeys.revokeConfirmCtaLoading") : t("profile.apiKeys.revokeConfirmCta")} isDangerous onConfirm={() => void handleRevoke()} onCancel={() => setRevokeTarget(null)} /></>;
};

export const ApiKeysCard: React.FC = () => {
  const { t } = useT();
  const [showModal, setShowModal] = useState(false);
  const [keys, setKeys] = useState<ApiKeyMetadata[] | null>(null);
  useEffect(() => { let ignore = false; void api.listApiKeys().then((list) => { if (!ignore) setKeys(list); }).catch(() => { if (!ignore) setKeys([]); }); return () => { ignore = true; }; }, []);
  const activeCount = (keys ?? []).filter((key) => !key.revokedAt).length;
  const status = keys === null ? t("profile.apiKeys.loadingStatus") : activeCount === 0 ? t("profile.apiKeys.noActiveStatus") : `${activeCount} ${activeCount === 1 ? t("profile.apiKeys.activeKeySingular") : t("profile.apiKeys.activeKeyPlural")}`;
  return <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"><div className="flex items-center gap-3 min-w-0"><div className="w-12 h-12 shrink-0 bg-indigo-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700"><KeyRound size={24} className="text-indigo-600 dark:text-indigo-400" /></div><div className="min-w-0"><h2 className="text-2xl font-bold text-slate-900 dark:text-white truncate">{t("profile.apiKeys.title")}</h2><p className="text-sm font-medium text-slate-500 dark:text-neutral-400 truncate">{status}</p></div></div><button onClick={() => setShowModal(true)} className="shrink-0 w-full sm:w-auto px-4 py-2 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition duration-200">{t("profile.apiKeys.manageCta")}</button></div>{showModal && <ApiKeysModal onClose={() => setShowModal(false)} onKeysChanged={setKeys} />}</div>;
};
