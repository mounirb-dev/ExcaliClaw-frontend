import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DrawablyButton, DrawablyCard, DrawablyInput } from 'drawably/react';
import { Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { api, isAxiosError, MfaRequiredError } from '../api';
import { useT } from '../i18n/useT';

// La pantalla de consentimiento en la que aterriza un cliente MCP (Claude,
// ChatGPT, o cualquier otro) después de /authorize — ver GET /authorize en
// el backend, que redirige aquí en vez de servir un formulario
// básico renderizado en el servidor. Si el visitante ya tiene una sesión de
// ExcaliClaw (AuthContext ya lo sabe — sin viaje de ida y vuelta extra), va
// directo a la pantalla de consentimiento; si no, primero ve un formulario
// de login, con el mismo estilo que el resto de la app en vez de una
// página HTML genérica. La lista de herramientas es fija y de solo
// lectura, la misma idea que la pantalla de consentimiento de conectores
// de n8n: el usuario ve exactamente lo que está concediendo, no puede
// elegir herramientas individuales.
const getToolDescriptions = (t: (key: string) => string): Array<{ name: string; description: string }> => [
  { name: t('auth.mcpAuthorize.toolListDesigns.name'), description: t('auth.mcpAuthorize.toolListDesigns.description') },
  { name: t('auth.mcpAuthorize.toolGetDesign.name'), description: t('auth.mcpAuthorize.toolGetDesign.description') },
  { name: t('auth.mcpAuthorize.toolCreateDesign.name'), description: t('auth.mcpAuthorize.toolCreateDesign.description') },
  { name: t('auth.mcpAuthorize.toolUpdateDesign.name'), description: t('auth.mcpAuthorize.toolUpdateDesign.description') },
  { name: t('auth.mcpAuthorize.toolDeleteDesign.name'), description: t('auth.mcpAuthorize.toolDeleteDesign.description') },
  { name: t('auth.mcpAuthorize.toolCollections.name'), description: t('auth.mcpAuthorize.toolCollections.description') },
  { name: t('auth.mcpAuthorize.toolGenerateDiagrams.name'), description: t('auth.mcpAuthorize.toolGenerateDiagrams.description') },
  { name: t('auth.mcpAuthorize.toolLiveCollab.name'), description: t('auth.mcpAuthorize.toolLiveCollab.description') },
];

type Step = 'loading' | 'expired' | 'login' | 'consent' | 'redirecting' | 'error';

export const McpAuthorize: React.FC = () => {
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const pendingId = searchParams.get('pending') ?? '';
  const { isAuthenticated, loading: authLoading, login } = useAuth();
  const TOOL_DESCRIPTIONS = getToolDescriptions(t);

  const [step, setStep] = useState<Step>('loading');
  const [redirectHost, setRedirectHost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pendingId) {
      setStep('expired');
      return;
    }
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ ok: boolean; redirectHost: string }>('/mcp/authorize/pending', { params: { id: pendingId } });
        if (cancelled) return;
        setRedirectHost(res.data.redirectHost);
        setStep(isAuthenticated ? 'consent' : 'login');
      } catch {
        if (!cancelled) setStep('expired');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingId, authLoading, isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      setStep('consent');
    } catch (err: unknown) {
      if (err instanceof MfaRequiredError) {
        setError(t('auth.mcpAuthorize.mfaRequiredError'));
      } else {
        setError(isAxiosError(err) ? err.response?.data?.error ?? t('auth.mcpAuthorize.invalidCredentials') : t('auth.mcpAuthorize.invalidCredentials'));
      }
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: 'allow' | 'deny') => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ redirectUrl: string }>('/mcp/authorize/decision', { pendingId, decision });
      // El paso "redirecting" sustituye los botones de decisión, así que
      // resetear `busy` en `finally` también al éxito no deja pulsar dos veces.
      setStep('redirecting');
      window.location.href = res.data.redirectUrl;
    } catch (err: unknown) {
      setError(isAxiosError(err) ? err.response?.data?.error ?? t('auth.mcpAuthorize.genericError') : t('auth.mcpAuthorize.genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="crayon-page">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <Logo className="mx-auto h-16 w-auto" />
        </div>

        {step === 'loading' && (
          <div className="flex justify-center py-8 text-slate-400 dark:text-neutral-500">
            <Loader2 size={28} className="animate-spin" />
          </div>
        )}

        {step === 'expired' && (
          <DrawablyCard className="p-6 sm:p-8 bg-white dark:bg-gray-900 text-center space-y-2">
            <p className="font-semibold text-slate-800 dark:text-neutral-100">{t('auth.mcpAuthorize.expiredTitle')}</p>
            <p className="text-sm text-slate-500 dark:text-neutral-400">{t('auth.mcpAuthorize.expiredSubtitle')}</p>
          </DrawablyCard>
        )}

        {step === 'login' && (
          <DrawablyCard className="p-6 sm:p-8 bg-white dark:bg-gray-900 space-y-4">
            <p className="text-sm text-center text-slate-500 dark:text-neutral-400">
              {t('auth.mcpAuthorize.signInPrefix')} <span className="font-semibold text-slate-700 dark:text-neutral-200">{redirectHost}</span> {t('auth.mcpAuthorize.signInSuffix')}
            </p>
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}
            <form className="space-y-3" onSubmit={handleLogin}>
              {/* skipcq: JS-0757 — el formulario de login debe enfocar el email al abrirse */}
              <DrawablyInput type="email" placeholder={t('auth.mcpAuthorize.emailPlaceholder')} required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              <DrawablyInput type="password" placeholder={t('auth.mcpAuthorize.passwordPlaceholder')} required value={password} onChange={(e) => setPassword(e.target.value)} />
              <DrawablyButton type="submit" variant="solid" className="w-full" state={busy ? 'loading' : 'idle'} disabled={busy}>
                <span>{t('auth.mcpAuthorize.signInCta')}</span>
              </DrawablyButton>
            </form>
          </DrawablyCard>
        )}

        {(step === 'consent' || step === 'redirecting') && (
          <DrawablyCard className="p-6 sm:p-8 bg-white dark:bg-gray-900 space-y-5">
            <div className="text-center space-y-1">
              <ShieldCheck size={28} className="mx-auto text-indigo-600 dark:text-indigo-400" />
              <p className="font-bold text-slate-800 dark:text-neutral-100">
                {t('auth.mcpAuthorize.connectPrefix')} <span className="text-indigo-600 dark:text-indigo-400">{redirectHost}</span> {t('auth.mcpAuthorize.connectSuffix')}
              </p>
              <p className="text-xs text-slate-500 dark:text-neutral-400">{t('auth.mcpAuthorize.consentSubtitle')}</p>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {TOOL_DESCRIPTIONS.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800"
                >
                  <Wrench size={14} className="mt-0.5 shrink-0 text-slate-400 dark:text-neutral-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-neutral-200">{tool.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-neutral-400">{tool.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <DrawablyButton
                type="button"
                variant="outline"
                tone="danger"
                className="flex-1"
                disabled={busy}
                onClick={() => decide('deny')}
              >
                <span>{t('auth.mcpAuthorize.deny')}</span>
              </DrawablyButton>
              <DrawablyButton
                type="button"
                variant="solid"
                className="flex-1"
                state={busy ? 'loading' : 'idle'}
                disabled={busy}
                onClick={() => decide('allow')}
              >
                <span>{t('auth.mcpAuthorize.allow')}</span>
              </DrawablyButton>
            </div>
          </DrawablyCard>
        )}
      </div>
    </div>
  );
};
