import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();
vi.mock("./client", () => ({
  api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), delete: (...a: unknown[]) => mockDelete(...a) },
  setCurrentUserId: vi.fn(),
  APPWRITE_ENDPOINT: "",
  APPWRITE_PROJECT_ID: "",
}));

import { createApiKey, listApiKeys, revokeApiKey } from "./auth";

const keys = [{ id: "k1", name: "uno" }];

describe("listApiKeys", () => {
  beforeEach(async () => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockDelete.mockReset();
    mockGet.mockResolvedValue({ data: { apiKeys: keys } });
    mockPost.mockResolvedValue({ data: { token: "t" } });
    mockDelete.mockResolvedValue({});
    await revokeApiKey("reset"); // invalida la caché entre tests
    mockGet.mockClear();
  });

  it("dos lecturas seguidas comparten una sola petición", async () => {
    const [a, b] = await Promise.all([listApiKeys(), listApiKeys()]);
    await listApiKeys();
    expect(a).toEqual(keys);
    expect(b).toEqual(keys);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("crear o revocar invalida la copia", async () => {
    await listApiKeys();
    await createApiKey("nueva");
    await listApiKeys();
    await revokeApiKey("k1");
    await listApiKeys();
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it("un fallo no se queda cacheado", async () => {
    mockGet.mockRejectedValueOnce(new Error("red"));
    await expect(listApiKeys()).rejects.toThrow("red");
    await new Promise((r) => setTimeout(r, 0));
    await expect(listApiKeys()).resolves.toEqual(keys);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
