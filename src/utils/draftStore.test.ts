import { beforeEach, describe, expect, it, vi } from "vitest";

const persisted = new Map<string, unknown>();
vi.mock("./secureCache", () => ({
  getCached: async (key: string) => persisted.get(key),
  setCached: async (key: string, value: unknown) => {
    persisted.set(key, structuredClone(value));
  },
  deleteCached: async (key: string) => {
    persisted.delete(key);
  },
}));

import { clearDraft, readDraft, saveDraft, type Draft } from "./draftStore";
import { recoverDraft } from "./draftRecovery";

const el = (id: string, version: number) => ({ id, type: "rectangle", version }) as never;
const draft = (over: Partial<Draft> = {}): Draft => ({
  drawingId: "d1",
  baseVersion: 5,
  at: 1000,
  elements: [el("a", 2)],
  appState: {},
  ...over,
});

describe("draftStore", () => {
  beforeEach(() => persisted.clear());

  it("guarda y lee un borrador", async () => {
    await saveDraft(draft());
    expect((await readDraft("d1"))?.baseVersion).toBe(5);
  });

  it("clearDraft borra lo anterior a la instantánea pero conserva un borrador más nuevo", async () => {
    await saveDraft(draft({ at: 1000 }));
    await clearDraft("d1", 2000);
    expect(await readDraft("d1")).toBeUndefined();
    await saveDraft(draft({ at: 3000 }));
    await clearDraft("d1", 2000); // la instantánea es anterior a esta edición
    expect(await readDraft("d1")).toBeDefined();
  });

  it("no guarda borradores enormes", async () => {
    await saveDraft(draft({ elements: [{ id: "x", pad: "y".repeat(9_000_000) } as never] }));
    expect(await readDraft("d1")).toBeUndefined();
  });
});

describe("recoverDraft", () => {
  beforeEach(() => persisted.clear());

  it("recupera cuando el servidor sigue en la versión base y el contenido difiere", async () => {
    await saveDraft(draft({ baseVersion: 5, elements: [el("a", 3)] }));
    const recovered = await recoverDraft("d1", 5, [el("a", 2)]);
    expect(recovered?.elements).toHaveLength(1);
  });

  it("no recupera si el servidor ya va por delante (se prefiere lo guardado)", async () => {
    await saveDraft(draft({ baseVersion: 5, elements: [el("a", 3)] }));
    expect(await recoverDraft("d1", 6, [el("a", 2)])).toBeNull();
  });

  it("si coincide con el servidor el borrador sobra y se borra", async () => {
    await saveDraft(draft({ baseVersion: 5, elements: [el("a", 2)] }));
    expect(await recoverDraft("d1", 5, [el("a", 2)])).toBeNull();
    expect(await readDraft("d1")).toBeUndefined();
  });

  it("sin borrador no hace nada", async () => {
    expect(await recoverDraft("d1", 5, [])).toBeNull();
  });
});
