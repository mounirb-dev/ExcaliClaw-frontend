import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthMe = vi.fn();
const mockAuthRefresh = vi.fn();

// authStatus es una constante en esta app (Appwrite siempre está habilitado,
// sin modo "auth desactivada" ni sonda de backend): se simula igual que la
// real. authMe/authRefresh son lo que de verdad decide si hay sesión.
vi.mock("../api", () => ({
  authStatus: async () => ({ authEnabled: true, registrationEnabled: true }),
  authMe: () => mockAuthMe(),
  authRefresh: () => mockAuthRefresh(),
  authLogout: vi.fn(),
  authLogin: vi.fn(),
  authRegister: vi.fn(),
  authMfaVerify: vi.fn(),
  MfaRequiredError: class MfaRequiredError extends Error {},
  isAxiosError: () => false,
}));
vi.mock("../api/client", () => ({ setCurrentUserId: vi.fn(), SESSION_EXPIRED_EVENT: "excaliclaw:session-expired" }));

import { AuthProvider, useAuth } from "./AuthContext";

const USER_KEY = "excalidash-user";
const alice = { id: "u1", email: "alice@example.com", name: "Alice" };

const Probe = () => {
  const { loading, authEnabled, authStatusError, user, retryAuthStatus } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="auth-enabled">{String(authEnabled)}</span>
      <span data-testid="auth-status-error">{String(authStatusError)}</span>
      <span data-testid="user-email">{user?.email ?? "none"}</span>
      <button data-testid="retry" onClick={() => void retryAuthStatus()}>
        retry
      </button>
    </div>
  );
};

const renderProvider = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );

const waitForLoaded = () =>
  waitFor(() => {
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("always reports auth as enabled, with no status error", async () => {
    mockAuthMe.mockRejectedValue(new Error("401"));
    mockAuthRefresh.mockRejectedValue(new Error("401"));

    renderProvider();
    await waitForLoaded();

    expect(screen.getByTestId("auth-enabled").textContent).toBe("true");
    expect(screen.getByTestId("auth-status-error").textContent).toBe("null");
  });

  it("loads the signed-in user from /auth/me and stores it", async () => {
    mockAuthMe.mockResolvedValue({ user: alice });

    renderProvider();
    await waitForLoaded();

    expect(screen.getByTestId("user-email").textContent).toBe("alice@example.com");
    expect(JSON.parse(localStorage.getItem(USER_KEY) ?? "{}").id).toBe("u1");
    expect(mockAuthRefresh).not.toHaveBeenCalled();
  });

  it("falls back to /auth/refresh when /auth/me fails, then loads the user", async () => {
    mockAuthMe.mockRejectedValueOnce(new Error("401")).mockResolvedValueOnce({ user: alice });
    mockAuthRefresh.mockResolvedValue(undefined);

    renderProvider();
    await waitForLoaded();

    expect(mockAuthRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("user-email").textContent).toBe("alice@example.com");
  });

  it("clears the stored user when /auth/me and the refresh both fail", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(alice));
    mockAuthMe.mockRejectedValue(new Error("401"));
    mockAuthRefresh.mockRejectedValue(new Error("401"));

    renderProvider();
    await waitForLoaded();

    expect(screen.getByTestId("user-email").textContent).toBe("none");
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });

  it("recovers the session when retrying after a failure", async () => {
    mockAuthMe.mockRejectedValueOnce(new Error("401")).mockResolvedValueOnce({ user: alice });
    mockAuthRefresh.mockRejectedValueOnce(new Error("401"));

    renderProvider();
    await waitForLoaded();
    expect(screen.getByTestId("user-email").textContent).toBe("none");

    fireEvent.click(screen.getByTestId("retry"));
    await waitFor(() => {
      expect(screen.getByTestId("user-email").textContent).toBe("alice@example.com");
    });
  });

  it("no pregunta /auth/me al entrar si la sesión se confirmó hace poco", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(alice));
    localStorage.setItem("excalidash-user-verified-at", String(Date.now()));
    renderProvider();
    await waitForLoaded();
    expect(screen.getByTestId("user-email").textContent).toBe("alice@example.com");
    expect(mockAuthMe).not.toHaveBeenCalled();
  });

  it("vuelve a preguntar /auth/me cuando la confirmación es antigua", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(alice));
    localStorage.setItem("excalidash-user-verified-at", String(Date.now() - 2 * 60 * 60 * 1000));
    mockAuthMe.mockResolvedValue({ user: alice });
    renderProvider();
    await waitForLoaded();
    expect(mockAuthMe).toHaveBeenCalledTimes(1);
  });

  it("olvida al usuario recordado cuando una petición descubre que la sesión caducó", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(alice));
    localStorage.setItem("excalidash-user-verified-at", String(Date.now()));
    renderProvider();
    await waitForLoaded();
    window.dispatchEvent(new Event("excaliclaw:session-expired"));
    await waitFor(() => expect(screen.getByTestId("user-email").textContent).toBe("none"));
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });
});
