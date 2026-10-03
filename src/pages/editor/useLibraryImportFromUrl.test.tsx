import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLibraryImportFromUrl } from "./useLibraryImportFromUrl";

vi.mock("../../api", () => ({ updateLibrary: vi.fn() }));
vi.mock("../../components/ConfirmModal", () => ({
  ConfirmModal: ({ isOpen, onConfirm, onCancel }: { isOpen: boolean; onConfirm: () => void; onCancel: () => void }) =>
    isOpen ? (
      <div>
        <button onClick={onConfirm}>accept</button>
        <button onClick={onCancel}>cancel</button>
      </div>
    ) : null,
}));

describe("useLibraryImportFromUrl", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/app/editor/test#addLibrary=https%3A%2F%2Fexample.com%2Flibrary.excalidrawlib");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["library"])),
    }));
  });

  it("importa la biblioteca solo al aceptar la confirmación", async () => {
    const apiRef = { current: { updateLibrary: vi.fn(), getAppState: () => ({ libraryItems: [] }) } };
    const Harness = () => useLibraryImportFromUrl({ excalidrawAPIRef: apiRef, isReady: true, user: null }).confirmDialog;
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(fetch).not.toHaveBeenCalled();

    window.history.replaceState(null, "", "/app/editor/test#addLibrary=https%3A%2F%2Fexample.com%2Flibrary.excalidrawlib");
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "accept" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "accept" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(apiRef.current.updateLibrary).toHaveBeenCalled();
  });
});
