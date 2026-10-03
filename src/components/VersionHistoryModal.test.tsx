import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderWithPreferences } from "../test/renderWithPreferences";
import { VersionHistoryModal } from "./VersionHistoryModal";

const getDrawingVersions = vi.fn();
const getDrawingVersionScene = vi.fn();
const restoreDrawingVersion = vi.fn();
vi.mock("../api", () => ({
  getDrawingVersions: (...a: unknown[]) => getDrawingVersions(...a),
  getDrawingVersionScene: (...a: unknown[]) => getDrawingVersionScene(...a),
  restoreDrawingVersion: (...a: unknown[]) => restoreDrawingVersion(...a),
}));
vi.mock("../utils/previewGenerate", () => ({ generatePreviewSvg: vi.fn(async () => "<svg xmlns='http://www.w3.org/2000/svg'></svg>") }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const VERSIONS = [
  { id: "1790000000000", at: 1790000000000, elementCount: 3, reason: "auto" as const },
  { id: "1789990000000r", at: 1789990000000, elementCount: 7, reason: "restore" as const },
];

const renderModal = (onBeforeRestore = vi.fn()) =>
  renderWithPreferences(
    <MemoryRouter>
      <VersionHistoryModal drawingId="d1" getFiles={() => ({})} onBeforeRestore={onBeforeRestore} onClose={vi.fn()} />
    </MemoryRouter>,
  );

describe("VersionHistoryModal", () => {
  const reload = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true });
    getDrawingVersionScene.mockResolvedValue({ elements: [{ id: "a" }], appState: {} });
    restoreDrawingVersion.mockResolvedValue({ version: 9 });
  });

  it("lista las versiones y avisa de la retención del plan con enlace para mejorarlo", async () => {
    getDrawingVersions.mockResolvedValue({ versions: VERSIONS, retentionDays: 1, planId: "free", canRestore: true });
    renderModal();
    expect(await screen.findByText(/3 elements/)).toBeTruthy();
    expect(screen.getByText(/Before a restore/)).toBeTruthy();
    expect(screen.getByText("Your plan keeps 1 day of history.", { exact: false })).toBeTruthy();
    expect(screen.getByText("Upgrade for longer history").getAttribute("href")).toBe("/app/plans");
  });

  it("sin límite de tiempo no ofrece mejorar el plan", async () => {
    getDrawingVersions.mockResolvedValue({ versions: VERSIONS, retentionDays: null, planId: "pro", canRestore: true });
    renderModal();
    expect(await screen.findByText("Your plan keeps the full history.", { exact: false })).toBeTruthy();
    expect(screen.queryByText("Upgrade for longer history")).toBeNull();
  });

  it("elegir una versión muestra su vista previa y restaurar pide confirmación, cancela guardados y recarga", async () => {
    getDrawingVersions.mockResolvedValue({ versions: VERSIONS, retentionDays: 30, planId: "starter", canRestore: true });
    const onBeforeRestore = vi.fn();
    renderModal(onBeforeRestore);
    fireEvent.click(await screen.findByText(/3 elements/));
    await waitFor(() => expect(screen.getByRole("img", { hidden: true })).toBeTruthy());
    expect(getDrawingVersionScene).toHaveBeenCalledWith("d1", "1790000000000");

    fireEvent.click(screen.getByText("Restore this version"));
    expect(restoreDrawingVersion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Yes, restore"));
    await waitFor(() => expect(restoreDrawingVersion).toHaveBeenCalledWith("d1", "1790000000000"));
    expect(onBeforeRestore).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("quien solo puede ver las ve pero no puede restaurar", async () => {
    getDrawingVersions.mockResolvedValue({ versions: VERSIONS, retentionDays: 30, planId: "starter", canRestore: false });
    renderModal();
    fireEvent.click(await screen.findByText(/3 elements/));
    await waitFor(() => expect(screen.getByRole("img", { hidden: true })).toBeTruthy());
    expect(screen.queryByText("Restore this version")).toBeNull();
    expect(screen.getByText("Only people who can edit this drawing can restore versions.")).toBeTruthy();
  });

  it("muestra un mensaje si no hay versiones o si falla la carga", async () => {
    getDrawingVersions.mockResolvedValueOnce({ versions: [], retentionDays: 1, planId: "free", canRestore: true });
    const first = renderModal();
    expect(await screen.findByText(/No versions saved yet/)).toBeTruthy();
    first.unmount();
    getDrawingVersions.mockRejectedValueOnce(new Error("boom"));
    renderModal();
    expect(await screen.findByText("Couldn't load the version history.")).toBeTruthy();
  });
});
