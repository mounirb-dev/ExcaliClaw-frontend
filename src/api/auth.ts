// Autenticación contra el backend de Cloudflare Worker + Appwrite. Migrado del
// antiguo auth.ts basado en Express — se mantuvieron los mismos nombres
// exportados para que los llamadores (AuthContext, Dashboard, Editor, ...) no
// tuvieran que cambiar, pero el alcance se redujo bastante: Appwrite gestiona
// las sesiones/JWT por sí mismo, así que no hay baile de token CSRF, no hay
// cookie de refresh-token, no hay una sonda "auth enabled" separada, no hay
// OIDC y no hay flujo de onboarding del lado del servidor.
//
// NO MIGRADO (necesitaría trabajo real en el lado del Worker/Appwrite, no
// solo un cambio de cliente — se marca aquí en vez de dejarlo roto en
// silencio):
//   - Inicio de sesión OIDC (startOidcSignIn) — lanza una excepción.
//   - Elección de onboarding de auth (authOnboardingChoice) — lanza una
//     excepción; los proyectos de Appwrite no tienen el concepto de "primera
//     ejecución, elegir modo de auth".
//
// La gestión de claves API (listApiKeys/createApiKey/revokeApiKey) SÍ está
// implementada, respaldada por la propia tabla TablesDB `apiKeys` del Worker
// (no las claves API de solo administrador de proyecto de Appwrite) — ver las
// rutas /auth/api-keys del backend y createApiKeyRow etc. de
// appwrite.ts. Emite tokens de solo lectura (drawings:read/collections:read)
// para scripts de backup.

import type { DrawingSortField, SortDirection } from "./drawings";
import { api, setCurrentUserId, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from "./client";
import { Account, Client, OAuthProvider } from "appwrite";

// Login social (Google, GitHub) mediante los proveedores OAuth2 integrados de
// Appwrite. Esto es una redirección real del navegador de nivel superior (las
// pantallas de consentimiento de Google/GitHub no pueden ejecutarse dentro de
// un fetch), así que no puede pasar por la API con JWT-bearer del Worker. El
// baile es: navegador -> Appwrite (OAuth con el proveedor) -> Appwrite
// establece su propia cookie de sesión -> redirige a /oauth-callback -> esa
// página llama a Appwrite directamente (credentials: "include", el mismo
// mecanismo que usa el SDK Web oficial de Appwrite) para emitir un JWT, y
// después de eso todo sigue el flujo normal de Bearer-JWT.
export type SocialProvider = "google" | "github";

export const socialSignInAvailable = (): boolean =>
  Boolean(APPWRITE_ENDPOINT && APPWRITE_PROJECT_ID);

// SDK oficial de Appwrite en vez de montar la URL a mano: construye bien la
// petición (proyecto, parámetros, codificación) y sigue el contrato de la
// API si cambia. `createOAuth2Token` redirige a Appwrite -> proveedor y vuelve
// a `success` con `userId` + `secret` en la URL; el Worker los canjea por una
// sesión (POST /auth/oauth-token). No depende de cookies de Appwrite en el
// navegador (que los navegadores bloquean entre sitios), que era justo lo
// que hacía que la sesión nueva no llegara y se colara la de otra cuenta.
const OAUTH_PROVIDERS: Record<SocialProvider, OAuthProvider> = {
  google: OAuthProvider.Google,
  github: OAuthProvider.Github,
};

export const startSocialSignIn = async (provider: SocialProvider, returnTo = "/"): Promise<void> => {
  if (!socialSignInAvailable()) {
    throw new Error("Social sign-in is not configured on this deployment.");
  }
  const account = new Account(new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID));
  // Si el navegador conserva una sesión de Appwrite de un login anterior,
  // createOAuth2Token ADJUNTA la identidad nueva a esa cuenta en vez de
  // entrar con la nueva. Se cierra antes (si no hay ninguna, falla y se ignora).
  await account.deleteSession({ sessionId: "current" }).catch(() => undefined);
  account.createOAuth2Token({
    provider: OAUTH_PROVIDERS[provider],
    success: `${window.location.origin}/oauth-callback?returnTo=${encodeURIComponent(returnTo)}`,
    failure: `${window.location.origin}/login?oidcError=1&oidcErrorMessage=${encodeURIComponent(
      `${provider === "google" ? "Google" : "GitHub"} sign-in failed`,
    )}`,
  });
};

export interface AuthStatusResponse {
  authEnabled?: boolean;
  enabled?: boolean;
  registrationEnabled?: boolean;
  authMode?: "local" | "hybrid" | "oidc_enforced";
  oidcEnabled?: boolean;
  oidcEnforced?: boolean;
  oidcProvider?: string;
  oidcJitProvisioningEnabled?: boolean;
  bootstrapRequired?: boolean;
  authOnboardingRequired?: boolean;
  authOnboardingMode?: "migration" | "fresh";
  authOnboardingRecommended?: "enable" | null;
}

export interface AuthUser {
  id: string;
  username?: string | null;
  email: string;
  name: string;
  role?: string;
  mustResetPassword?: boolean;
  mfaEnabled?: boolean;
  /** Solo cuentas registradas con el flujo de OTP obligatorio (ver
   * markOtpRequired en el backend) llevan estos dos campos con
   * sentido — cuentas de antes de esta feature vienen con ambos undefined,
   * nunca deben tratarse como "sin verificar". */
  otpRequired?: boolean;
  emailVerified?: boolean;
}

export interface UserPreferences {
  theme?: "light" | "dark";
  dashboardSortField?: DrawingSortField;
  dashboardSortDirection?: SortDirection;
  language?: string;
  gridStep?: number;
}

export interface ApiKeyMetadata {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKeyMetadata;
  token: string;
}

// Sin token CSRF: la cookie de sesión es `SameSite=Lax`/`None` sin requerir
// una cabecera personalizada para leerla (es HttpOnly), así que no hay nada
// que un token CSRF pueda añadir aquí que los atributos de la cookie no
// cubran ya para la forma de lectura/escritura de esta API.
export const getCsrfHeader = (): { name: string; token: string } | null => null;

// Appwrite siempre está "habilitado" desde el punto de vista de esta app —
// no hay modo de bootstrap con auth deshabilitada local, no hay
// aplicación forzada de OIDC, no hay compuerta de onboarding de primera
// ejecución. Se mantiene como una sonda de estado async (en vez de una
// constante) para que la forma de llamada existente de AuthContext no
// tenga que cambiar.
export const authStatus = async (): Promise<AuthStatusResponse> => ({
  authEnabled: true,
  registrationEnabled: true,
  authMode: "local",
  oidcEnabled: false,
  oidcEnforced: false,
  bootstrapRequired: false,
  authOnboardingRequired: false,
});

export const startOidcSignIn = (..._args: unknown[]): void => {
  throw new Error("OIDC sign-in is not available on this deployment.");
};

export const authMe = async (): Promise<{ user: AuthUser }> => {
  // Ya no hay atajo del lado del cliente para "¿estoy conectado?" — la
  // sesión vive en una cookie HttpOnly que este código no puede leer, así
  // que la llamada al servidor es la única forma de saberlo. Una cookie
  // faltante/expirada se manifiesta como el propio 401 de esta petición.
  const response = await api.get<{ user: { id: string; email: string; name: string; mfaEnabled?: boolean } }>(
    "/auth/me",
  );
  // Se fija ya (no en el efecto de AuthContext, que corre DESPUÉS de los efectos de
  // los hijos): las cachés atadas al usuario lo necesitan en la primera petición.
  setCurrentUserId(response.data.user.id);
  return { user: response.data.user };
};


// Emite una cookie JWT nueva a partir de la cookie de sesión de Appwrite de
// larga duración (ver /auth/refresh en el backend) — el JWT en sí
// realmente tiene vida corta (~15min, impuesto por Appwrite), así que esto
// es lo que evita que una pestaña abierta más tiempo que eso empiece a dar
// 401 de repente en cada acción. También lo llama directamente el
// interceptor de respuesta de api/client.ts.
export const authRefresh = async (): Promise<void> => {
  await api.post("/auth/refresh");
};

export const authLogout = async (): Promise<void> => {
  setCurrentUserId(null);
  // El Worker limpia la cookie de sesión en esta respuesta sin importar el
  // resultado, pero que un fallo de red no bloquee el logout del lado del
  // cliente.
  await api.post("/auth/logout").catch(() => undefined);
};

/** Irreversible: borra la cuenta y TODOS sus datos (dibujos, colecciones,
 * claves API, biblioteca, suscripción — ver DELETE /auth/account en
 * index.ts). Exige la contraseña actual Y un código de verificación de 6
 * dígitos (pedido antes con requestDeleteAccountOtp) — el Worker
 * reverifica ambos antes de tocar nada. */
export const deleteAccount = async (password: string, code: string): Promise<void> => {
  await api.delete("/auth/account", { data: { password, code } });
  setCurrentUserId(null);
};

/** Reverifica la contraseña y manda el código de 6 dígitos que deleteAccount
 * exige — llamar esto primero, mostrar el campo de código, luego
 * deleteAccount con la misma contraseña + el código recibido. */
export const requestDeleteAccountOtp = async (password: string): Promise<void> => {
  await api.post("/auth/account/delete-otp", { password });
};

/** Consume el código de 6 dígitos enviado al registrarse (o por
 * resendEmailVerification) — obligatorio para que la cuenta no caiga en el
 * barrido automático de las 24h (ver sweepUnverifiedAccounts en index.ts). */
export const verifyEmail = async (code: string): Promise<void> => {
  await api.post("/auth/verify-email", { code });
};

export const resendEmailVerification = async (): Promise<void> => {
  await api.post("/auth/resend-verification");
};

// Lanzado por authLogin cuando la cuenta tiene TOTP habilitado y necesita un
// segundo paso — Login.tsx captura esto específicamente (no como un fallo
// genérico) y cambia a la vista de "introduce tu código" en vez de mostrar
// un error.
export class MfaRequiredError extends Error {
  mfaToken: string;
  constructor(mfaToken: string) {
    super("Two-factor code required");
    this.name = "MfaRequiredError";
    this.mfaToken = mfaToken;
  }
}

export const authLogin = async (email: string, password: string): Promise<{ user: AuthUser }> => {
  const response = await api.post<{
    user?: { id: string; email: string; name: string };
    mfaRequired?: boolean;
    mfaToken?: string;
    error?: string;
  }>("/auth/login", { email, password });
  if (response.data.mfaRequired && response.data.mfaToken) {
    throw new MfaRequiredError(response.data.mfaToken);
  }
  const { user } = response.data;
  if (!user) throw new Error(response.data.error ?? "Login response without user");
  setCurrentUserId(user.id);
  return { user };
};

/** Inicia el segundo factor después de que authLogin lanzara MfaRequiredError. */
export const authMfaChallenge = async (mfaToken: string): Promise<{ challengeId: string }> => {
  const response = await api.post<{ challengeId: string }>("/auth/mfa/challenge", {
    mfaToken,
    factor: "totp",
  });
  return response.data;
};

/** Completa el segundo factor y termina el login (establece la cookie de
 * sesión, igual que un authLogin sin MFA). */
export const authMfaVerify = async (
  mfaToken: string,
  challengeId: string,
  otp: string,
): Promise<{ user: AuthUser }> => {
  const response = await api.post<{ user: { id: string; email: string; name: string } }>("/auth/mfa/verify", {
    mfaToken,
    challengeId,
    otp,
  });
  return { user: response.data.user };
};

export interface MfaFactors {
  totp: boolean;
  email: boolean;
  phone: boolean;
}

export const mfaListFactors = async (): Promise<MfaFactors> => {
  const response = await api.get<MfaFactors>("/auth/mfa/factors");
  return response.data;
};

/** Inicia el registro de TOTP: `uri` es un enlace otpauth:// (renderizar
 * como código QR para Google Authenticator / Authy / 1Password etc.),
 * `secret` es lo mismo escrito para introducción manual. */
export const mfaCreateAuthenticator = async (): Promise<{ secret: string; uri: string }> => {
  const response = await api.post<{ secret: string; uri: string }>("/auth/mfa/authenticator");
  return response.data;
};

/** Confirma el registro con un código de la app recién configurada. */
export const mfaVerifyAuthenticator = async (otp: string): Promise<void> => {
  await api.put("/auth/mfa/authenticator", { otp });
};

export const mfaRemoveAuthenticator = async (): Promise<void> => {
  await api.delete("/auth/mfa/authenticator");
};

/** Códigos de respaldo de un solo uso — llamar una vez justo después del
 * registro y mostrarlos exactamente una vez; Appwrite no los devolverá de
 * nuevo. */
export const mfaCreateRecoveryCodes = async (): Promise<{ recoveryCodes: string[] }> => {
  const response = await api.post<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes");
  return response.data;
};

/** Activa/desactiva la aplicación forzada de MFA para la cuenta; Appwrite
 * requiere al menos un factor verificado (p. ej. la app TOTP de arriba)
 * antes de que `enabled: true` tenga efecto. */
export const mfaSetEnabled = async (enabled: boolean): Promise<void> => {
  await api.patch("/auth/mfa", { enabled });
};

export const authRegister = async (
  email: string,
  password: string,
  name: string,
  _setupCode?: string, // sin concepto de código de bootstrap en Appwrite; se ignora
): Promise<{ user: AuthUser; emailVerificationRequired: boolean; emailOtpSent: boolean }> => {
  const response = await api.post<{
    user: { id: string; email: string; name: string };
    emailVerificationRequired?: boolean;
    emailOtpSent?: boolean;
  }>("/auth/register", { email, password, name });
  return {
    user: response.data.user,
    emailVerificationRequired: response.data.emailVerificationRequired ?? false,
    emailOtpSent: response.data.emailOtpSent ?? false,
  };
};

// Entrar en Ajustes pedía la lista dos veces seguidas (la tarjeta se monta de
// nuevo al resolverse el resto de la página). Se comparte la petición en vuelo
// y la respuesta durante unos segundos; crear o revocar una clave la invalida.
const API_KEYS_TTL_MS = 5_000;
let apiKeysCache: { at: number; promise: Promise<ApiKeyMetadata[]> } | null = null;

export const listApiKeys = (): Promise<ApiKeyMetadata[]> => {
  if (apiKeysCache && Date.now() - apiKeysCache.at < API_KEYS_TTL_MS) return apiKeysCache.promise;
  const promise = api.get<{ apiKeys: ApiKeyMetadata[] }>("/auth/api-keys").then((response) => response.data.apiKeys);
  apiKeysCache = { at: Date.now(), promise };
  // Un fallo no se queda cacheado: el siguiente intento vuelve a pedirla.
  promise.catch(() => {
    if (apiKeysCache?.promise === promise) apiKeysCache = null;
  });
  return promise;
};

export const createApiKey = async (name: string): Promise<CreateApiKeyResponse> => {
  apiKeysCache = null;
  const response = await api.post<CreateApiKeyResponse>("/auth/api-keys", { name });
  return response.data;
};

export const revokeApiKey = async (id: string): Promise<void> => {
  apiKeysCache = null;
  await api.delete(`/auth/api-keys/${encodeURIComponent(id)}`);
};

export const authOnboardingChoice = async (..._args: unknown[]): Promise<{
  authEnabled: boolean;
  authOnboardingCompleted: boolean;
  bootstrapRequired: boolean;
}> => {
  throw new Error("Auth onboarding is not applicable on this deployment.");
};

// El flujo de recuperación real de Appwrite: la solicitud envía por correo
// un enlace (si el SMTP está configurado en esta instancia) que lleva los
// parámetros de consulta userId+secret, que la página de confirmación lee
// para completar el restablecimiento.
export const authPasswordResetRequest = async (email: string): Promise<void> => {
  await api.post("/auth/recovery", { email });
};

export const authPasswordResetConfirm = async (
  userId: string,
  secret: string,
  password: string,
): Promise<void> => {
  await api.put("/auth/recovery", { userId, secret, password });
};
