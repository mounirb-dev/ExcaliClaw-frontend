import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PreferencesProvider, usePreference } from "./PreferencesContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

describe("PreferencesContext", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
      },
    });
  });

  it("hydrates a preference already stored in localStorage on mount", () => {
    window.localStorage.setItem(
      "excalidash-preferences",
      JSON.stringify({ language: "fr-FR" }),
    );

    const { result } = renderHook(() => usePreference("language", "en"), {
      wrapper,
    });

    expect(result.current[0]).toBe("fr-FR");
  });

  it("falls back to defaultValue when nothing is stored", () => {
    const { result } = renderHook(() => usePreference("language", "en"), {
      wrapper,
    });

    expect(result.current[0]).toBe("en");
  });

  it("persists a user-initiated change to localStorage", async () => {
    const { result } = renderHook(() => usePreference("language", "en"), {
      wrapper,
    });

    act(() => {
      result.current[1]("es-ES");
    });

    expect(result.current[0]).toBe("es-ES");
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("excalidash-preferences") ?? "{}",
      );
      expect(stored.language).toBe("es-ES");
    });
  });

  it("re-reads localStorage on a 'storage' event from another tab", async () => {
    const { result } = renderHook(() => usePreference("theme", "light"), {
      wrapper,
    });
    expect(result.current[0]).toBe("light");

    window.localStorage.setItem(
      "excalidash-preferences",
      JSON.stringify({ theme: "dark" }),
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "excalidash-preferences" }),
      );
    });

    await waitFor(() => {
      expect(result.current[0]).toBe("dark");
    });
  });
});
