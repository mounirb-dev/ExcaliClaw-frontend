export type PasswordPolicy = {
  minLength: number;
  maxLength: number;
  requiresComplexity: boolean;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  pattern?: RegExp;
  patternHtml?: string;
  requirementsText: string;
  validationMessage: string;
};

export type PasswordPolicyResponse = Pick<
  PasswordPolicy,
  | "minLength"
  | "maxLength"
  | "requireUppercase"
  | "requireLowercase"
  | "requireNumber"
  | "requireSymbol"
>;

export type PasswordRequirement = {
  id: "minLength" | "uppercase" | "lowercase" | "number" | "symbol";
  label: string;
  ok: boolean;
};

// skipcq: SCT-A000 — nombre de clave de localStorage, no es un secreto
const PASSWORD_RULES_CACHE_KEY = "excalidash-password-policy";

const DEFAULT_STRONG_POLICY: PasswordPolicyResponse = {
  minLength: 12,
  maxLength: 100,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
};

const DEFAULT_RELAXED_POLICY: PasswordPolicyResponse = {
  minLength: 8,
  maxLength: 100,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSymbol: false,
};


// `t` es opcional (funciones puras fuera de React no siempre tienen un
// useT() a mano) — sin él, cae al ingles via IDENTITY_T, nunca revienta.
type Translate = (key: string) => string;
const IDENTITY_T: Translate = (key) => FALLBACK_EN[key] ?? key;
const FALLBACK_EN: Record<string, string> = {
  "password.atLeastCharsPrefix": "at least",
  "password.charsSuffix": "characters",
  "password.oneUppercase": "one uppercase letter",
  "password.oneLowercase": "one lowercase letter",
  "password.oneNumber": "one number",
  "password.oneSymbol": "one symbol",
  "password.mustBePrefix": "Password must be",
  "password.n1Uppercase": "1 uppercase letter",
  "password.n1Lowercase": "1 lowercase letter",
  "password.n1Number": "1 number",
  "password.n1Symbol": "1 symbol",
  "password.mustBeAtMostPrefix": "Password must be at most",
  "password.charsLongSuffix": "characters long",
  "password.minLenLabel": "At least",
  "password.charsLabel": "characters",
  "password.oneUppercaseLabel": "One uppercase letter (A-Z)",
  "password.oneLowercaseLabel": "One lowercase letter (a-z)",
  "password.oneNumberLabel": "One number (0-9)",
  "password.oneSymbolLabel": "One symbol",
};

const buildPatternHtml = (policy: PasswordPolicyResponse): string => {
  const parts: string[] = [];
  if (policy.requireLowercase) parts.push("(?=.*[a-z])");
  if (policy.requireUppercase) parts.push("(?=.*[A-Z])");
  if (policy.requireNumber) parts.push("(?=.*\\d)");
  if (policy.requireSymbol) parts.push("(?=.*[^A-Za-z0-9])");
  return `${parts.join("")}.{${policy.minLength},${policy.maxLength}}`;
};

const buildPolicyMessage = (policy: PasswordPolicyResponse, t: Translate = IDENTITY_T): string => {
  const requirements = [`${t("password.atLeastCharsPrefix")} ${policy.minLength} ${t("password.charsSuffix")}`];
  if (policy.requireUppercase) requirements.push(t("password.oneUppercase"));
  if (policy.requireLowercase) requirements.push(t("password.oneLowercase"));
  if (policy.requireNumber) requirements.push(t("password.oneNumber"));
  if (policy.requireSymbol) requirements.push(t("password.oneSymbol"));
  return `${t("password.mustBePrefix")} ${requirements.join(", ")}`;
};

const buildRequirementsText = (policy: PasswordPolicyResponse, t: Translate = IDENTITY_T): string => {
  const requirements = [`${policy.minLength}-${policy.maxLength} ${t("password.charsSuffix")}`];
  if (policy.requireUppercase) requirements.push(t("password.n1Uppercase"));
  if (policy.requireLowercase) requirements.push(t("password.n1Lowercase"));
  if (policy.requireNumber) requirements.push(t("password.n1Number"));
  if (policy.requireSymbol) requirements.push(t("password.n1Symbol"));
  return `${requirements.join(", ")}.`;
};

const normalizePolicy = (raw: Partial<PasswordPolicyResponse> | null | undefined): PasswordPolicyResponse | null => {
  if (!raw) return null;
  const minLength = Number(raw.minLength);
  const maxLength = Number(raw.maxLength);
  if (!Number.isFinite(minLength) || minLength <= 0) return null;
  if (!Number.isFinite(maxLength) || maxLength < minLength) return null;
  return {
    minLength,
    maxLength,
    requireUppercase: Boolean(raw.requireUppercase),
    requireLowercase: Boolean(raw.requireLowercase),
    requireNumber: Boolean(raw.requireNumber),
    requireSymbol: Boolean(raw.requireSymbol),
  };
};

const readCachedPolicy = (): PasswordPolicyResponse | null => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(PASSWORD_RULES_CACHE_KEY);
    if (!raw) return null;
    return normalizePolicy(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const cachePasswordPolicy = (policy: Partial<PasswordPolicyResponse> | null | undefined): void => {
  const normalized = normalizePolicy(policy);
  if (!normalized) return;
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    // react-doctor-disable-next-line react-doctor/auth-token-in-web-storage -- false positive: `normalized` is password-policy shape (minLength/maxLength/requireUppercase/...), a public server-announced ruleset, not a credential; no field here can authenticate a request.
    window.localStorage.setItem(PASSWORD_RULES_CACHE_KEY, JSON.stringify(normalized));
  } catch {
    // localStorage puede no estar disponible en contextos de navegador restringidos.
  }
};

export const getPasswordPolicy = (opts?: { strong?: boolean; t?: Translate }): PasswordPolicy => {
  const strong = typeof opts?.strong === "boolean" ? opts.strong : true;
  const t = opts?.t ?? IDENTITY_T;
  const base = strong ? readCachedPolicy() ?? DEFAULT_STRONG_POLICY : DEFAULT_RELAXED_POLICY;
  const requiresComplexity =
    base.requireUppercase || base.requireLowercase || base.requireNumber || base.requireSymbol;
  const patternHtml = buildPatternHtml(base);

  return {
    ...base,
    requiresComplexity,
    pattern: new RegExp(`^${patternHtml}$`),
    patternHtml,
    requirementsText: buildRequirementsText(base, t),
    validationMessage: buildPolicyMessage(base, t),
  };
};

export const getPasswordRequirements = (
  password: string,
  policy: PasswordPolicy,
  t: Translate = IDENTITY_T,
): PasswordRequirement[] => {
  const value = typeof password === "string" ? password : "";
  const requirements: PasswordRequirement[] = [
    {
      id: "minLength",
      label: `${t("password.minLenLabel")} ${policy.minLength} ${t("password.charsLabel")}`,
      ok: value.length >= policy.minLength,
    },
  ];

  if (policy.requireUppercase) {
    requirements.push({ id: "uppercase", label: t("password.oneUppercaseLabel"), ok: /[A-Z]/.test(value) });
  }
  if (policy.requireLowercase) {
    requirements.push({ id: "lowercase", label: t("password.oneLowercaseLabel"), ok: /[a-z]/.test(value) });
  }
  if (policy.requireNumber) {
    requirements.push({ id: "number", label: t("password.oneNumberLabel"), ok: /\d/.test(value) });
  }
  if (policy.requireSymbol) {
    requirements.push({ id: "symbol", label: t("password.oneSymbolLabel"), ok: /[^A-Za-z0-9]/.test(value) });
  }

  return requirements;
};

export const validatePassword = (
  password: string,
  policy: PasswordPolicy,
  t: Translate = IDENTITY_T,
): string | null => {
  if (typeof password !== "string") return policy.validationMessage;
  if (password.length < policy.minLength) return policy.validationMessage;
  if (password.length > policy.maxLength)
    return `${t("password.mustBeAtMostPrefix")} ${policy.maxLength} ${t("password.charsLongSuffix")}`;
  if (policy.requireUppercase && !/[A-Z]/.test(password)) return policy.validationMessage;
  if (policy.requireLowercase && !/[a-z]/.test(password)) return policy.validationMessage;
  if (policy.requireNumber && !/\d/.test(password)) return policy.validationMessage;
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) return policy.validationMessage;
  return null;
};
