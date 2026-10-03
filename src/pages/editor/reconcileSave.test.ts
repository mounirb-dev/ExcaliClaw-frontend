import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { reloadAndReconcile } from "./reconcileSave";

vi.mock("../../api", () => ({
  getDrawing: vi.fn(),
}));

const makeRefs = () => ({
  currentDrawingVersion: { current: 1 as number | null },
  excalidrawAPI: { current: null as unknown },
  isSyncing: { current: false },
  latestElements: { current: [] as readonly unknown[] },
  latestFiles: { current: {} as Record<string, unknown> },
  lastSyncedFiles: { current: {} as Record<string, unknown> },
});

describe("reloadAndReconcile (409 conflict recovery)", () => {
  const getDrawing = vi.mocked(api.getDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges local and remote elements and unions files instead of clobbering", async () => {
    // El remoto ganó el elemento R (de otro cliente) y el archivo remote-file.
    getDrawing.mockResolvedValue({
      version: 9,
      elements: [{ id: "R", version: 5 }],
      files: { "remote-file": { id: "remote-file", dataURL: "data:,R" } },
    } as unknown);

    const refs = makeRefs();
    const localElements = [{ id: "L", version: 3 }];
    const localFiles = { "local-file": { id: "local-file", dataURL: "data:,L" } };

    const result = await reloadAndReconcile(refs, "d1", localElements, localFiles);

    // Tanto los elementos locales como los remotos sobreviven a la fusión.
    expect(result.elements.map((e) => e.id).sort()).toEqual(["L", "R"]);
    // Los archivos se unen, no se reemplazan.
    expect(Object.keys(result.files).sort()).toEqual([
      "local-file",
      "remote-file",
    ]);
    // Adopta la versión autoritativa del servidor.
    expect(refs.currentDrawingVersion.current).toBe(9);
    // Los refs se actualizan para que el reintento se construya sobre el estado fusionado.
    expect(refs.latestElements.current).toBe(result.elements);
    expect(refs.latestFiles.current).toBe(result.files);
    expect(refs.lastSyncedFiles.current).toBe(result.files);
  });

  it("pushes the merged scene into the live editor under the sync guard", async () => {
    getDrawing.mockResolvedValue({
      version: 2,
      elements: [{ id: "R", version: 1 }],
      files: {},
    } as unknown);

    const updateScene = vi.fn();
    const addFiles = vi.fn();
    const refs = makeRefs();
    refs.excalidrawAPI.current = { updateScene, addFiles };

    await reloadAndReconcile(refs, "d1", [{ id: "L", version: 1 }], {
      f1: { id: "f1", dataURL: "data:,L" },
    });

    expect(addFiles).toHaveBeenCalledTimes(1);
    expect(updateScene).toHaveBeenCalledTimes(1);
    const scene = updateScene.mock.calls[0][0];
    expect(scene.elements.map((e) => e.id).sort()).toEqual(["L", "R"]);
    // isSyncing se vuelve a desactivar para que el onChange del editor no se trate como una edición del usuario.
    expect(refs.isSyncing.current).toBe(false);
  });
});
