import { describe, expect, it, vi } from "vitest";

// restoreElements real necesita canvas; aquí basta con que devuelva lo que recibe.
vi.mock("@excalidraw/excalidraw", () => ({ restoreElements: (elements: unknown) => elements }));

import { parseClipboardScene } from "./clipboardScene";

describe("parseClipboardScene", () => {
  it("ignora texto normal", () => {
    expect(parseClipboardScene("hola mundo")).toBeNull();
    expect(parseClipboardScene("")).toBeNull();
    expect(parseClipboardScene("{ esto no es json")).toBeNull();
  });

  it("reconoce una escena de Excalidraw con envoltorio", () => {
    const text = JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
      appState: { viewBackgroundColor: "#fff" },
      files: {},
    });
    const scene = parseClipboardScene(text);
    expect(scene?.source).toBe("excalidraw");
    expect(scene?.elements).toHaveLength(1);
  });

  it("reconoce un export de tablero de Miro", () => {
    const text = JSON.stringify({
      data: [
        {
          id: "1",
          type: "sticky_note",
          position: { x: 100, y: 100 },
          geometry: { width: 200, height: 200 },
          data: { content: "<p>Hola</p>" },
          style: { fillColor: "yellow" },
        },
      ],
    });
    const scene = parseClipboardScene(text);
    expect(scene?.source).toBe("miro");
    expect(scene?.elements.length).toBeGreaterThan(0);
  });

  it("no toma una escena vacía por válida", () => {
    expect(parseClipboardScene(JSON.stringify({ elements: [], appState: {} }))).toBeNull();
  });
});
