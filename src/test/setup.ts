import "@testing-library/jest-dom/vitest";

// Estos son shims exclusivos de navegador. Las pruebas en entorno Node
// (p. ej. la comprobación de build de división de bundle, que ejecuta Vite
// mediante programación) comparten este archivo de configuración global
// pero no tienen `window`; se protege para que no fallen al cargar.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();

  global.fetch = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
});
