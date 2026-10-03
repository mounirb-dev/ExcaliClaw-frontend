import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
let currentUser: string | null = "u1";
vi.mock("./client", () => ({
  api: { get: (...a: unknown[]) => mockGet(...a) },
  getCurrentUserId: () => currentUser,
  PAYMENT_REQUIRED_EVENT: "payment-required",
  PLAN_LIMIT_EVENT: "plan-limit",
}));

import { getSubscription, getSubscriptionCached } from "./billing";
import { useFreshCacheStore } from "../utils/freshCache";

const sub = (planId: string) => ({ data: { planId, status: "free", limits: {}, blocked: false } });

describe("getSubscriptionCached", () => {
  beforeEach(() => {
    useFreshCacheStore.getState().clear();
    mockGet.mockReset();
    currentUser = "u1";
  });

  it("reutiliza la copia reciente del mismo usuario", async () => {
    mockGet.mockResolvedValue(sub("pro"));
    await getSubscriptionCached();
    await getSubscriptionCached();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("no reutiliza la copia de otra cuenta", async () => {
    mockGet.mockResolvedValue(sub("pro"));
    await getSubscriptionCached();
    currentUser = "u2";
    await getSubscriptionCached();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("getSubscription siempre pide la red y refresca la copia", async () => {
    mockGet.mockResolvedValueOnce(sub("free")).mockResolvedValueOnce(sub("pro"));
    await getSubscriptionCached();
    const fresh = await getSubscription();
    expect(fresh.planId).toBe("pro");
    expect((await getSubscriptionCached()).planId).toBe("pro");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("sin usuario conectado no cachea", async () => {
    currentUser = null;
    mockGet.mockResolvedValue(sub("free"));
    await getSubscriptionCached();
    await getSubscriptionCached();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
