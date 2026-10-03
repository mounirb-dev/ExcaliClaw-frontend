import React, { useEffect, useMemo, useState } from 'react';
import { LogIn, RefreshCw, XCircle } from 'lucide-react';
import { api, isAxiosError } from '../api';
import { useAuth } from '../context/AuthContext';
import {
  IMPERSONATION_KEY,
  USER_KEY,
  readImpersonationState,
  stopImpersonation as restoreImpersonation,
  type ImpersonationState,
} from '../utils/impersonation';
import { useT } from '../i18n/useT';

type ImpersonationTarget = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
};

type ImpersonationTargetsResponse = {
  users: ImpersonationTarget[];
};

type AuthStatusResponse = {
  authenticated?: boolean;
  user?: {
    impersonatorId?: string;
  } | null;
};

type ImpersonateResponse = {
  user: {
    id: string;
    email: string;
    name: string;
  };
};

const normalizeTarget = (target: ImpersonationState['target']): ImpersonationTarget => ({
  id: target.id,
  email: target.email,
  name: target.name,
  role: 'USER',
  isActive: true,
});

export const ImpersonationBanner: React.FC = () => {
  const { t } = useT();
  const { authEnabled } = useAuth();
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);
  const [targets, setTargets] = useState<ImpersonationTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const clearLocalImpersonation = () => {
    localStorage.removeItem(IMPERSONATION_KEY);
    setImpersonation(null);
  };

  useEffect(() => {
    if (!authEnabled) {
      setImpersonation(null);
      return;
    }

    const sync = () => setImpersonation(readImpersonationState());
    sync();

      const verifyServerImpersonationState = async () => {
        try {
          const response = await api.get<AuthStatusResponse>('/auth/status');
          const serverImpersonating = Boolean(response.data?.authenticated && response.data?.user?.impersonatorId);
          if (!serverImpersonating && readImpersonationState()) {
            clearLocalImpersonation();
          }
        } catch {
          // Ignorar fallos transitorios de auth-status; el siguiente evento de poll/storage volverá a sincronizar.
        }
      };

    // Solo hay algo que contrastar con el servidor si existe una suplantación
    // guardada en local. Sin ella (lo normal) esta petición era puro gasto, y el
    // banner se monta dos veces en Layout: 2 GET /auth/status en cada carga.
    if (readImpersonationState()) void verifyServerImpersonationState();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [authEnabled]);

  const loadTargets = async (isCancelled: () => boolean = () => false) => {
    if (!authEnabled || !impersonation) return;

    setLoadingTargets(true);
    setError('');

    try {
      const response = await api.get<ImpersonationTargetsResponse>('/auth/impersonation-targets');
      if (isCancelled()) return;
      setTargets(response.data.users || []);
    } catch (err: unknown) {
      if (isCancelled()) return;
      let message = t('banner.loadTargetsFailed');
      if (isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
      setTargets([]);
    } finally {
      // react-doctor-disable-next-line react-doctor/no-loading-flag-reset-outside-finally -- false positive: this IS inside finally (always runs); the guard is a stale-effect cancellation check (React Strict Mode / re-run), not a success-only reset.
      if (!isCancelled()) setLoadingTargets(false);
    }
  };

  // react-doctor-disable-next-line react-doctor/no-set-state-after-await-in-effect -- false positive: the cancellation guard is inside loadTargets itself (isCancelled, checked before every setState after its await), the detector just can't trace it through the function call.
  useEffect(() => {
    let cancelled = false;
    void loadTargets(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authEnabled, impersonation?.target.id, impersonation?.impersonator.id]);

  const options = useMemo(() => {
    if (!impersonation) return [];
    const currentTarget = normalizeTarget(impersonation.target);
    const targetMap = new Map<string, ImpersonationTarget>();
    targetMap.set(currentTarget.id, currentTarget);
    for (const user of targets) {
      if (!user?.id) continue;
      targetMap.set(user.id, user);
    }
    return Array.from(targetMap.values()).sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      if (byName !== 0) return byName;
      return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
    });
  }, [impersonation, targets]);

  const stop = async () => {
    if (!impersonation || busy) return;
    setBusy(true);
    setError('');

    try {
      const response = await api.post<{ user?: { id: string; email: string; name: string } }>('/auth/stop-impersonation');
      restoreImpersonation();
      if (response.data?.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
      }
      window.location.reload();
    } catch (err: unknown) {
      let message = t('banner.stopImpersonationFailed');
      if (isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
        if (
          err.response?.status === 409 &&
          /not currently impersonating/i.test(message)
        ) {
          clearLocalImpersonation();
          window.location.reload();
          return;
        }
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const switchTarget = async (userId: string) => {
    if (!impersonation || busy || userId === impersonation.target.id) return;

    setBusy(true);
    setError('');

    try {
      const response = await api.post<ImpersonateResponse>('/auth/impersonate', { userId });
      const latest = readImpersonationState() || impersonation;
      const nextState: ImpersonationState = {
        ...latest,
        target: {
          id: response.data.user.id,
          email: response.data.user.email,
          name: response.data.user.name,
        },
        startedAt: new Date().toISOString(),
      };

      localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(nextState));
      localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
      window.location.reload();
    } catch (err: unknown) {
      let message = t('banner.switchImpersonationFailed');
      if (isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (!authEnabled || !impersonation) {
    return null;
  }

  return (
    <div className="sticky top-0 z-[45] -mt-2 mb-6 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50/80 dark:bg-red-950/30 backdrop-blur-md px-3 py-2 shadow-sm transition duration-200">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 flex-shrink-0">
            <LogIn size={14} strokeWidth={2.5} />
            <span className="text-[10px] font-black uppercase tracking-wider">{t('banner.impersonating')}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-red-900 dark:text-red-100 truncate">
              {impersonation.target.name}
            </span>
            <span className="hidden sm:inline text-xs font-medium text-red-800/60 dark:text-red-200/40 truncate">
              {impersonation.target.email}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="hidden lg:flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-red-700/60 dark:text-red-400/40">
            {t('banner.switch')}
          </div>
          <select
            value={impersonation.target.id}
            onChange={(e) => {
              void switchTarget(e.target.value);
            }}
            aria-label="Switch impersonation target"
            disabled={busy || loadingTargets || options.length === 0}
            className="h-8 min-w-[140px] max-w-[200px] px-2 rounded-lg border border-red-200 dark:border-red-800/50 bg-white/50 dark:bg-neutral-900/50 text-xs font-bold text-red-900 dark:text-red-100 outline-none hover:border-red-300 dark:hover:border-red-700 transition-colors disabled:opacity-50"
          >
            {options.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={stop}
            disabled={busy}
            className="h-8 flex items-center justify-center gap-1.5 px-3 rounded-lg bg-red-600 dark:bg-red-600/80 text-[11px] font-black uppercase tracking-wider text-white hover:bg-red-700 dark:hover:bg-red-500 transition disabled:opacity-50 shadow-sm shadow-red-900/10"
          >
            <XCircle size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">{t('banner.stop')}</span>
          </button>
        </div>
      </div>

      {(loadingTargets || error) && (
        <div className="mt-1.5 pt-1.5 border-t border-red-200/50 dark:border-red-800/20 flex items-center gap-3 text-[10px] font-bold text-red-800 dark:text-red-300">
          {loadingTargets ? (
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw size={10} className="animate-spin" />
              {t('banner.syncingTargets')}
            </span>
          ) : null}
          {error ? <span className="truncate">{error}</span> : null}
          {error ? (
            <button
              type="button"
              onClick={() => void loadTargets()}
              className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-700/50 hover:bg-red-200 transition-colors"
            >
              {t('banner.retry')}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};
