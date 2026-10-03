import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { PreferencesProvider } from "../context/PreferencesContext";

/** `render` con el proveedor de preferencias (idioma, tema...) puesto. Los
 * componentes que usan `useT()` leen el idioma de PreferencesContext y lanzan
 * error si no hay proveedor; en la app real lo pone main.tsx. */
export const renderWithPreferences = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  render(ui, { wrapper: PreferencesProvider, ...options });
