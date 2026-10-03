import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PreferencesProvider } from "../../context/PreferencesContext";
import { useDashboardSort } from "./useDashboardSort";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

describe("useDashboardSort", () => {
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

  it("hydrates the sort config already stored in localStorage on mount", () => {
    window.localStorage.setItem(
      "excalidash-preferences",
      JSON.stringify({ dashboardSortField: "name", dashboardSortDirection: "asc" }),
    );

    const { result } = renderHook(() => useDashboardSort(), { wrapper });

    expect(result.current.sortConfig).toEqual({
      field: "name",
      direction: "asc",
    });
  });

  it("falls back to the default sort when nothing is stored", () => {
    const { result } = renderHook(() => useDashboardSort(), { wrapper });

    expect(result.current.sortConfig).toEqual({
      field: "updatedAt",
      direction: "desc",
    });
  });

  it("persists a user-initiated sort change to localStorage", async () => {
    const { result } = renderHook(() => useDashboardSort(), { wrapper });

    act(() => {
      result.current.handleSortFieldChange("name");
    });

    expect(result.current.sortConfig).toEqual({
      field: "name",
      direction: "asc",
    });
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("excalidash-preferences") ?? "{}",
      );
      expect(stored).toMatchObject({
        dashboardSortField: "name",
        dashboardSortDirection: "asc",
      });
    });
  });
});
