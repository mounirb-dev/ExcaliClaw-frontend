import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  authStatus,
  authMe,
  authRefresh,
  authLogout,
  authLogin,
  authRegister,
  authMfaVerify,
  MfaRequiredError,
  isAxiosError,
} from '../api';
import { setCurrentUserId, SESSION_EXPIRED_EVENT } from '../api/client';
import { clearAllLocalData, FRESH_MAX_AGE_MS } from '../utils/freshCache';
import { useCollectionsStore } from '../store/collectionsStore';

interface User {
  id: string;
  username?: string | null;
  email: string;
  name: string;
  role?: "ADMIN" | "USER" | string;
  mustResetPassword?: boolean;
  mfaEnabled?: boolean;
  otpRequired?: boolean;
  emailVerified?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authEnabled: boolean | null;
  registrationEnabled: boolean;
  authStatusError: string | null;
  authMode: 'local' | 'hybrid' | 'oidc_enforced';
  oidcEnabled: boolean;
  oidcEnforced: boolean;
  oidcProvider: string | null;
  bootstrapRequired: boolean;
  authOnboardingRequired: boolean;
  authOnboardingMode: 'migration' | 'fresh' | null;
  login: (email: string, password: string) => Promise<void>;
  completeMfaLogin: (mfaToken: string, challengeId: string, otp: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    setupCode?: string,
  ) => Promise<{ emailOtpSent: boolean; otpRequired?: boolean; emailVerified?: boolean }>;
  logout: () => void;
  retryAuthStatus: () => Promise<void>;
  isAuthenticated: boolean;
}

// skipcq: JS-W1042 — undefined es el valor inicial idiomático de un contexto opcional
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// skipcq: SCT-A000 — nombre de clave de localStorage, no es un secreto
const USER_KEY = 'excalidash-user';
// skipcq: SCT-A000 — nombre de clave de localStorage, no es un secreto
const AUTH_ENABLED_CACHE_KEY = "excalidash-auth-enabled";
// Cuándo se confirmó por última vez con el servidor que la sesión sigue activa.
// skipcq: SCT-A000 — nombre de clave de localStorage, no es un secreto
const USER_VERIFIED_AT_KEY = 'excalidash-user-verified-at';

// Recuerda al usuario y cuándo se confirmó con el servidor (ver loadUser).
const storeUser = (userData: unknown): void => {
  localStorage.setItem(USER_KEY, JSON.stringify(userData));
  localStorage.setItem(USER_VERIFIED_AT_KEY, String(Date.now()));
};

const clearStoredUser = (): void => {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_VERIFIED_AT_KEY);
};

// Sesión confirmada con el servidor hace poco: al entrar no hace falta preguntar /auth/me.
// Si en realidad caducó, la primera petición lo descubre (401 y refresco fallido) y
// SESSION_EXPIRED_EVENT lleva al login. Pasado el margen se vuelve a preguntar.
const isRecentlyVerified = (userData: { id?: string } | null): boolean => {
  const verifiedAt = Number(localStorage.getItem(USER_VERIFIED_AT_KEY));
  return Boolean(userData?.id) && Number.isFinite(verifiedAt) && Date.now() - verifiedAt < FRESH_MAX_AGE_MS;
};

// Averigua quién es el usuario. Para los flujos de enlace compartido la autenticación se
// deriva SOLO del servidor: cargar un usuario obsoleto de localStorage causa una UI de
// "conectado" mientras el servidor devuelve 401, lo que dispara intentos de refresh
// ruidosos y guardados de biblioteca fallidos.
const resolveSessionUser = async (isShareFlow: boolean, showProvisional: (user: User) => void): Promise<User | null> => {
  if (!isShareFlow) {
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        showProvisional(userData);
        // Sesión confirmada hace poco: no se pregunta al servidor al entrar.
        if (isRecentlyVerified(userData)) {
          setCurrentUserId(userData.id);
          return userData;
        }
      } catch {
        clearStoredUser();
      }
    }
  }
  try {
    const response = await authMe();
    storeUser(response.user);
    return response.user;
  } catch {
    if (isShareFlow) {
      clearStoredUser();
      return null;
    }
    try {
      await authRefresh();
      const response = await authMe();
      storeUser(response.user);
      return response.user;
    } catch {
      clearStoredUser();
      return null;
    }
  }
};

// Una petición descubrió que la sesión caducó: se olvida el usuario recordado y todo lo
// local, y ProtectedRoute lleva al login.
const useSessionExpiredListener = (setUser: (user: null) => void): void => {
  useEffect(() => {
    const handler = () => {
      clearStoredUser();
      void clearAllLocalData();
      useCollectionsStore.setState({ collections: [], hasHydrated: false });
      setUser(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, [setUser]);
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // La comprobación "mío vs compartido" de collections.ts necesita el id de
  // usuario actual de forma síncrona y fuera de React; se refleja aquí en
  // vez de decodificarlo de un token (el token de sesión ya no está
  // disponible para JS en absoluto).
  useEffect(() => {
    setCurrentUserId(user?.id ?? null);
  }, [user]);
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [authStatusError, setAuthStatusError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'local' | 'hybrid' | 'oidc_enforced'>('local');
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcEnforced, setOidcEnforced] = useState(false);
  const [oidcProvider, setOidcProvider] = useState<string | null>(null);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [authOnboardingRequired, setAuthOnboardingRequired] = useState(false);
  const [authOnboardingMode, setAuthOnboardingMode] = useState<'migration' | 'fresh' | null>(null);
  const navigate = useNavigate();

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const isShareFlow = window.location.pathname.startsWith("/shared/");

      try {
        const statusResponse = await authStatus();
        setAuthStatusError(null);
        const enabled =
          typeof statusResponse?.authEnabled === "boolean"
            ? statusResponse.authEnabled
            : typeof statusResponse?.enabled === "boolean"
              ? statusResponse.enabled
              : true;
        setAuthEnabled(enabled);
        localStorage.setItem(AUTH_ENABLED_CACHE_KEY, String(enabled));
        setRegistrationEnabled(Boolean(statusResponse?.registrationEnabled));
        const nextAuthMode =
          statusResponse?.authMode === 'hybrid' || statusResponse?.authMode === 'oidc_enforced'
            ? statusResponse.authMode
            : 'local';
        setAuthMode(nextAuthMode);
        setOidcEnabled(Boolean(statusResponse?.oidcEnabled));
        setOidcEnforced(Boolean(statusResponse?.oidcEnforced));
        setOidcProvider(typeof statusResponse?.oidcProvider === 'string' ? statusResponse.oidcProvider : null);
        setBootstrapRequired(Boolean(statusResponse?.bootstrapRequired));
        setAuthOnboardingRequired(Boolean(statusResponse?.authOnboardingRequired));
        setAuthOnboardingMode(
          statusResponse?.authOnboardingMode === 'migration' || statusResponse?.authOnboardingMode === 'fresh'
            ? statusResponse.authOnboardingMode
            : null
        );

        if (!enabled) {
          clearStoredUser();
          setUser(null);
          return;
        }
      } catch {
        const cachedAuthEnabled = localStorage.getItem(AUTH_ENABLED_CACHE_KEY);
        if (cachedAuthEnabled === "false") {
          setAuthStatusError(null);
          setAuthEnabled(false);
          setRegistrationEnabled(false);
          setAuthMode('local');
          setOidcEnabled(false);
          setOidcEnforced(false);
          setOidcProvider(null);
          setBootstrapRequired(false);
          setAuthOnboardingRequired(false);
          setAuthOnboardingMode(null);
          clearStoredUser();
          setUser(null);
          return;
        }
        setAuthStatusError(
          "Unable to reach the backend API. Check BACKEND_URL, FRONTEND_URL, and your reverse proxy configuration."
        );
        setAuthEnabled(null);
        setRegistrationEnabled(false);
        setAuthMode('local');
        setOidcEnabled(false);
        setOidcEnforced(false);
        setOidcProvider(null);
        setBootstrapRequired(false);
        setAuthOnboardingRequired(false);
        setAuthOnboardingMode(null);
        clearStoredUser();
        setUser(null);
        return;
      }

      setUser(await resolveSessionUser(isShareFlow, setUser));
    } catch (error) {
      console.error('Failed to load user:', error);
      setAuthStatusError(
        "Unable to initialize authentication state. Check backend/API connectivity and refresh."
      );
      clearStoredUser();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useSessionExpiredListener(setUser);

  const login = useCallback(async (email: string, password: string) => {
    try {
      if (authEnabled === false) {
        throw new Error("Authentication is disabled");
      }
      const response = await authLogin(email, password);

      const { user: userData } = response;

      storeUser(userData);

      setAuthStatusError(null);
      setAuthEnabled(true);
      setUser(userData);
    } catch (error: unknown) {
      if (error instanceof MfaRequiredError) throw error;
      if (isAxiosError(error)) {
        const message =
          typeof error.response?.data === 'object' &&
          error.response.data !== null &&
          'message' in error.response.data &&
          typeof error.response.data.message === 'string'
            ? error.response.data.message
            : 'Login failed';
        throw new Error(message);
      }
      throw error instanceof Error ? error : new Error('Login failed');
    }
  }, [authEnabled]);

  const completeMfaLogin = useCallback(async (mfaToken: string, challengeId: string, otp: string) => {
    try {
      const { user: userData } = await authMfaVerify(mfaToken, challengeId, otp);
      storeUser(userData);
      setAuthStatusError(null);
      setAuthEnabled(true);
      setUser(userData);
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const message =
          typeof error.response?.data === 'object' &&
          error.response.data !== null &&
          'message' in error.response.data &&
          typeof error.response.data.message === 'string'
            ? error.response.data.message
            : 'Invalid code';
        throw new Error(message);
      }
      throw error instanceof Error ? error : new Error('Invalid code');
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, setupCode?: string) => {
    try {
      if (authEnabled === false) {
        throw new Error("Authentication is disabled");
      }
      const response = await authRegister(email, password, name, setupCode);

      const { user: userData, emailOtpSent } = response;

      storeUser(userData);

      setAuthStatusError(null);
      setAuthEnabled(true);
      setUser(userData);
      // Se devuelven junto a emailOtpSent (no solo vía el `user` del
      // contexto) porque quien llama a register() puede necesitarlos en el
      // mismo tick — leer `user` de useAuth() justo después de este await
      // daría el valor de ANTES del setUser de arriba (cierre obsoleto del
      // render previo), no el que se acaba de fijar.
      return { emailOtpSent, otpRequired: userData.otpRequired, emailVerified: userData.emailVerified };
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const message =
          typeof error.response?.data === 'object' &&
          error.response.data !== null &&
          'message' in error.response.data &&
          typeof error.response.data.message === 'string'
            ? error.response.data.message
            : 'Registration failed';
        throw new Error(message);
      }
      throw error instanceof Error ? error : new Error('Registration failed');
    }
  }, [authEnabled]);

  const logout = useCallback(() => {
    void authLogout().catch(() => undefined);
    clearStoredUser();
    // La siguiente cuenta no debe ver las listas de esta (caché local y
    // estado en memoria de colecciones).
    void clearAllLocalData();
    useCollectionsStore.setState({ collections: [], hasHydrated: false });
    setUser(null);
    setTimeout(() => {
      navigate('/login');
    }, 0);
  }, [navigate]);

  const value = useMemo(
    () => ({
      user,
      loading,
      authEnabled,
      registrationEnabled,
      authStatusError,
      authMode,
      oidcEnabled,
      oidcEnforced,
      oidcProvider,
      bootstrapRequired,
      authOnboardingRequired,
      authOnboardingMode,
      login,
      completeMfaLogin,
      register,
      logout,
      retryAuthStatus: loadUser,
      isAuthenticated: Boolean(user),
    }),
    [
      user,
      loading,
      authEnabled,
      registrationEnabled,
      authStatusError,
      authMode,
      oidcEnabled,
      oidcEnforced,
      oidcProvider,
      bootstrapRequired,
      authOnboardingRequired,
      authOnboardingMode,
      login,
      completeMfaLogin,
      register,
      logout,
      loadUser,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- este hook debe vivir junto al contexto para compartir su contrato de consumo.
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
