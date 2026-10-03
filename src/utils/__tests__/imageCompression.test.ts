import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compressDroppedImagePayload,
  compressExcalidrawFiles,
  resetImageCompressionMemo,
} from "../imageCompression";

// jsdom no trae un decodificador real de canvas/imagen, así que se simulan
// las piezas que toca el compresor. `toDataURLImpl` permite que cada
// prueba controle lo que el navegador "codifica".
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1200;
  naturalHeight = 900;
  width = 1200;
  height = 900;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

let toDataURLImpl: (type: string, quality?: number) => string;

const LARGE_INPUT = `data:image/png;base64,${"A".repeat(400_000)}`;

const toDataURLSpy = () =>
  HTMLCanvasElement.prototype.toDataURL as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetImageCompressionMemo();
  vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  })) as unknown as HTMLCanvasElement["getContext"];
  HTMLCanvasElement.prototype.toDataURL = vi.fn((type: string, quality?: number) =>
    toDataURLImpl(type, quality),
  ) as unknown as HTMLCanvasElement["toDataURL"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compression MIME detection", () => {
  it("labels the record with the MIME actually encoded, not the requested one", async () => {
    // Firefox devuelve una dataURL PNG incluso cuando se pidió codificación webp.
    toDataURLImpl = () => `data:image/png;base64,${"B".repeat(1000)}`;

    const result = await compressDroppedImagePayload({
      dataURL: LARGE_INPUT,
      mimeType: "image/png",
    });

    expect(result.changed).toBe(true);
    expect(result.mimeType).toBe("image/png");
  });

  it("keeps the webp label when the browser really encodes webp", async () => {
    toDataURLImpl = () => `data:image/webp;base64,${"B".repeat(1000)}`;

    const result = await compressDroppedImagePayload({
      dataURL: LARGE_INPUT,
      mimeType: "image/png",
    });

    expect(result.changed).toBe(true);
    expect(result.mimeType).toBe("image/webp");
  });
});

describe("compressExcalidrawFiles memoization", () => {
  it("does not re-encode an image whose compression yielded no improvement", async () => {
    // La salida codificada es más grande que la entrada → sin mejora, sin cambios.
    toDataURLImpl = () => `data:image/webp;base64,${"C".repeat(500_000)}`;
    const files = { a: { id: "a", dataURL: LARGE_INPUT, mimeType: "image/png" } };

    const first = await compressExcalidrawFiles(files);
    expect(first.changed).toBe(false);
    const callsAfterFirst = toDataURLSpy().mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await compressExcalidrawFiles(files);
    expect(second.changed).toBe(false);
    // Sin nuevos intentos de codificación en la segunda pasada — la memo lo cortocircuitó.
    expect(toDataURLSpy().mock.calls.length).toBe(callsAfterFirst);
  });

  it("does not re-encode a successfully compressed output on the next pass", async () => {
    toDataURLImpl = () => `data:image/webp;base64,${"D".repeat(1000)}`;
    const files = { a: { id: "a", dataURL: LARGE_INPUT, mimeType: "image/png" } };

    const first = await compressExcalidrawFiles(files);
    expect(first.changed).toBe(true);
    const compressedUrl = first.files.a.dataURL as string;
    const callsAfterFirst = toDataURLSpy().mock.calls.length;

    // La salida comprimida regresa a través del sondeo tras addFiles().
    const outputFiles = {
      a: { id: "a", dataURL: compressedUrl, mimeType: first.files.a.mimeType },
    };
    const second = await compressExcalidrawFiles(outputFiles);
    expect(second.changed).toBe(false);
    expect(toDataURLSpy().mock.calls.length).toBe(callsAfterFirst);
  });

  it("remembers images that threw during compression", async () => {
    toDataURLImpl = () => {
      throw new Error("encode failed");
    };
    const files = { a: { id: "a", dataURL: LARGE_INPUT, mimeType: "image/png" } };

    const first = await compressExcalidrawFiles(files);
    expect(first.changed).toBe(false);
    const callsAfterFirst = toDataURLSpy().mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await compressExcalidrawFiles(files);
    expect(second.changed).toBe(false);
    expect(toDataURLSpy().mock.calls.length).toBe(callsAfterFirst);
  });
});
