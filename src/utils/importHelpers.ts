import { exportToSvg } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { JSZipObject } from "jszip";
import { api } from "../api";
import { convertMiroExport, isMiroExport } from "./migrationImporters";
import { forEachSequential } from "./sequential";

type ExcalidrawLikeData = {
  type?: unknown;
  version?: unknown;
  source?: unknown;
  elements?: unknown;
  appState?: unknown;
  files?: unknown;
  data?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type LegacyExportDrawing = {
  id?: string;
  name?: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files?: Record<string, unknown>;
  collectionId?: string | null;
  collectionName?: string | null;
  createdAt?: string | number;
  updatedAt?: string | number;
  preview?: string | null;
  version?: number;
};

type LegacyExportJson = {
  version?: string;
  exportedAt?: string;
  userId?: string;
  drawings: LegacyExportDrawing[];
};

export const isLegacyExportJson = (data: unknown): data is LegacyExportJson => {
  if (typeof data !== "object" || data === null) return false;
  const maybe = data as Record<string, unknown>;
  return Array.isArray(maybe.drawings);
};

export const coerceTimestamp = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
};

const parseOptionalJson = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof raw === "object" && raw !== null) return raw as T;
  return fallback;
};

export const extractDrawingData = (
  input: unknown
): { elements: ExcalidrawElement[]; appState: Partial<AppState>; files: BinaryFiles } | null => {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as ExcalidrawLikeData;
  const maybeNested = raw.data;
  const candidate: ExcalidrawLikeData =
    typeof maybeNested === "object" && maybeNested !== null ? (maybeNested as ExcalidrawLikeData) : raw;
  const elements = parseOptionalJson<unknown[]>(candidate.elements, []);
  const appState = parseOptionalJson<Record<string, unknown>>(candidate.appState, {});
  const files = parseOptionalJson<Record<string, unknown>>(candidate.files, {});
  if (!Array.isArray(elements)) return null;
  if (typeof appState !== "object" || appState === null) return null;
  if (typeof files !== "object" || files === null) return null;
  return {
    elements: elements as ExcalidrawElement[],
    appState: appState as Partial<AppState>,
    files: files as BinaryFiles,
  };
};

export const makeSvgPreview = async (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
) => {
  return exportToSvg({
    elements,
    appState: {
      ...appState,
      exportBackground: true,
      viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
    },
    files: files || {},
    exportPadding: 10,
  });
};

export const createCollectionResolver = () => {
  let existingCollectionsByLowerName: Map<string, string> | null = null;
  const ensureCollectionsIndex = async (): Promise<Map<string, string>> => {
    if (existingCollectionsByLowerName) return existingCollectionsByLowerName;
    const response = await api.get<{ id: string; name: string }[]>("/collections");
    const index = new Map<string, string>(
      (response.data || [])
        .filter((c) => c && typeof c.name === "string" && typeof c.id === "string")
        .map((c) => [c.name.trim().toLowerCase(), c.id])
    );
    existingCollectionsByLowerName = index;
    return index;
  };
  const getOrCreateCollectionIdByName = async (name: string) => {
    const index = await ensureCollectionsIndex();
    const key = name.trim().toLowerCase();
    const existing = index.get(key);
    if (existing) return existing;
    const created = await api.post<{ id: string; name: string }>("/collections", { name });
    index.set(key, created.data.id);
    return created.data.id;
  };
  return { getOrCreateCollectionIdByName };
};

const basenameWithoutExt = (filePath: string): string => {
  const base = filePath.split("/").pop() || filePath;
  return base.replace(/\.(json|excalidraw)$/, "");
};

interface BackupManifest {
  formatVersion?: number;
  exportedAt?: string;
  collections?: { id: string; name: string }[];
}

/** Lee un .excalidash generado por exportBackup en Settings.tsx: un zip con
 * `excalidash.manifest.json` (metadata + lista de colecciones) y un archivo
 * `drawings/<id>.json` por diseño. Las colecciones se resuelven por NOMBRE,
 * no por el id que traía el backup — ese id no existe en la cuenta que
 * importa (puede ser la misma cuenta tras un borrado, o una distinta);
 * mismo criterio que createCollectionResolver ya usa para el import legado
 * de más abajo: reutiliza una colección existente con ese nombre, o la
 * crea si no hay ninguna. */
export const importBackupZip = async (
  file: File,
  targetCollectionId: string | null,
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const errors: string[] = [];
  let success = 0;
  let failed = 0;
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestEntry = zip.file("excalidash.manifest.json");
  if (!manifestEntry) {
    return { success: 0, failed: 1, errors: [`${file.name}: Not an ExcaliClaw backup (missing excalidash.manifest.json).`] };
  }
  let manifest: BackupManifest = {};
  try {
    manifest = JSON.parse(await manifestEntry.async("string"));
  } catch {
    return { success: 0, failed: 1, errors: [`${file.name}: Backup manifest is invalid JSON.`] };
  }

  const collectionResolver = createCollectionResolver();
  const collectionIdMap = new Map<string, string | null>();
  // En orden y de una en una: el resolvedor crea la colección si no existe, y
  // en paralelo dos nombres iguales crearían duplicados.
  await forEachSequential(manifest.collections ?? [], async (c) => {
    if (c && typeof c.id === "string" && typeof c.name === "string" && c.name.trim()) {
      collectionIdMap.set(c.id, await collectionResolver.getOrCreateCollectionIdByName(c.name.trim()));
    }
  });

  const drawingEntries = Object.values(zip.files).filter(
    (e: JSZipObject) => !e.dir && e.name.startsWith("drawings/") && e.name.endsWith(".json"),
  );
  if (drawingEntries.length === 0) {
    return { success: 0, failed: 1, errors: [`${file.name}: Backup contains no drawings.`] };
  }

  // Secuencial a propósito (mismo criterio que importLegacyZip más abajo,
  // en este mismo archivo): un backup grande puede traer cientos de
  // diseños — lanzarlos todos en paralelo satura R2/Appwrite con cientos
  // de POST /drawings de golpe, cuando esto no tiene urgencia de latencia.
  for (const entry of drawingEntries) {
    const entryName = entry.name;
    try {
      const raw = await entry.async("string");
      const parsed = JSON.parse(raw) as {
        name?: unknown;
        collectionId?: unknown;
        elements?: unknown;
        appState?: unknown;
        files?: unknown;
      };
      const extracted = extractDrawingData(parsed);
      if (!extracted) throw new Error("Invalid structure (missing elements/appState)");

      let collectionId: string | null = null;
      if (targetCollectionId !== null) collectionId = targetCollectionId;
      else if (parsed.collectionId === "trash") collectionId = "trash";
      else if (typeof parsed.collectionId === "string") collectionId = collectionIdMap.get(parsed.collectionId) ?? null;

      const svg = await makeSvgPreview(extracted.elements, extracted.appState, extracted.files);
      const payload = {
        name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : "Imported Drawing",
        elements: extracted.elements,
        appState: extracted.appState,
        files: extracted.files || null,
        collectionId,
        preview: svg.outerHTML,
      };
      await api.post("/drawings", payload, { headers: { "X-Imported-File": "true" } });
      success += 1;
    } catch (err: unknown) {
      failed += 1;
      errors.push(`${file.name}:${entryName}: ${err instanceof Error ? err.message : "Failed to import drawing"}`);
    }
  }
  return { success, failed, errors };
};

/** Un único dibujo del array `drawings` de un export legado (JSON suelto o
 * dentro de un zip) — compartido por importLegacyZip y importSingleJsonFile
 * para no duplicar la resolución de colección/preview/POST. */
const importOneLegacyDrawing = async (
  d: LegacyExportDrawing,
  index: number,
  targetCollectionId: string | null,
  collectionResolver: ReturnType<typeof createCollectionResolver>,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const extracted = extractDrawingData(d);
  if (!extracted) {
    return { ok: false, error: `drawing ${index + 1}: Invalid structure (missing elements/appState)` };
  }
  let collectionId: string | null = null;
  if (targetCollectionId !== null) collectionId = targetCollectionId;
  else if (d.collectionId === "trash" || d.collectionName === "Trash") collectionId = "trash";
  else if (typeof d.collectionName === "string" && d.collectionName.trim()) {
    collectionId = await collectionResolver.getOrCreateCollectionIdByName(d.collectionName.trim());
  }
  try {
    const svg = await makeSvgPreview(extracted.elements, extracted.appState, extracted.files);
    const payload = {
      name: typeof d.name === "string" && d.name.trim().length > 0 ? d.name : `Imported Drawing ${index + 1}`,
      elements: extracted.elements,
      appState: extracted.appState,
      files: extracted.files || null,
      collectionId,
      createdAt: coerceTimestamp(d.createdAt),
      updatedAt: coerceTimestamp(d.updatedAt),
      preview: svg.outerHTML,
    };
    await api.post("/drawings", payload, { headers: { "X-Imported-File": "true" } });
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to import drawing" };
  }
};

export const importLegacyZip = async (
  file: File,
  targetCollectionId: string | null
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const errors: string[] = [];
  let success = 0;
  let failed = 0;
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((e: JSZipObject) => !e.dir);
  const hasExcalidashManifest = entries.some((e: JSZipObject) => e.name === "excalidash.manifest.json");
  if (hasExcalidashManifest) {
    return {
      success: 0,
      failed: 1,
      errors: [
        `${file.name}: This looks like a full backup (.excaliclaw). Use "Import Backup" instead of Legacy Import.`,
      ],
    };
  }
  const collectionResolver = createCollectionResolver();
  const drawableEntries = entries.filter((e: JSZipObject) => {
    const name = e.name;
    return name.endsWith(".excalidraw") || name.endsWith(".json");
  });
  if (drawableEntries.length === 0) {
    return { success: 0, failed: 1, errors: [`${file.name}: Zip contains no .excalidraw/.json drawings.`] };
  }
  for (const entry of drawableEntries) {
    const entryName = entry.name;
    try {
      const raw = await entry.async("string");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`Invalid JSON: ${entryName}`);
      }
      if (isLegacyExportJson(parsed)) {
        const exportJson = parsed;
        const drawings = Array.isArray(exportJson.drawings) ? exportJson.drawings : [];
        await forEachSequential(drawings, async (d, i) => {
          const result = await importOneLegacyDrawing(d as LegacyExportDrawing, i, targetCollectionId, collectionResolver);
          if (result.ok) success += 1;
          else {
            failed += 1;
            errors.push(`${file.name}:${entryName}: ${result.error}`);
          }
        });
        continue;
      }
      const extracted = extractDrawingData(parsed);
      if (!extracted) throw new Error(`Invalid drawing structure: ${entryName}`);
      let collectionId: string | null = null;
      if (targetCollectionId !== null) collectionId = targetCollectionId;
      else {
        const folder = entryName.includes("/") ? entryName.split("/")[0] : "";
        collectionId = folder && folder !== "Unorganized" ? await collectionResolver.getOrCreateCollectionIdByName(folder) : null;
      }
      const svg = await makeSvgPreview(extracted.elements, extracted.appState, extracted.files);
      const payload = {
        name: basenameWithoutExt(entryName) || basenameWithoutExt(file.name) || "Imported Drawing",
        elements: extracted.elements,
        appState: extracted.appState,
        files: extracted.files || null,
        collectionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preview: svg.outerHTML,
      };
      await api.post("/drawings", payload, { headers: { "X-Imported-File": "true" } });
      success += 1;
    } catch (err: unknown) {
      failed += 1;
      errors.push(`${file.name}:${entryName}: ${err instanceof Error ? err.message : "Failed to import zip entry"}`);
    }
  }
  return { success, failed, errors };
};

/** Import de un único .json suelto (no .excalidash/.zip): la vía de migración
 * para gente que trae un export de otra app. Reconoce, en este orden:
 *   1. Export legado de ExcaliClaw (`{ drawings: [...] }`)
 *   2. Export de tablero de Miro (heurística en migrationImporters.ts)
 *   3. Una escena suelta de Excalidraw (`elements`/`appState`, con o sin
 *      envoltorio `{ type: "excalidraw", ... }`)
 * Si ninguna encaja, falla con un mensaje explícito en vez de adivinar. */
export const importSingleJsonFile = async (
  file: File,
  targetCollectionId: string | null,
): Promise<{ success: number; failed: number; errors: string[] }> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { success: 0, failed: 1, errors: [`${file.name}: Invalid JSON.`] };
  }

  if (isLegacyExportJson(parsed)) {
    const drawings = Array.isArray(parsed.drawings) ? parsed.drawings : [];
    if (drawings.length === 0) return { success: 0, failed: 1, errors: [`${file.name}: No drawings found.`] };
    const collectionResolver = createCollectionResolver();
    let success = 0;
    const errors: string[] = [];
    await forEachSequential(drawings, async (d, i) => {
      const result = await importOneLegacyDrawing(d as LegacyExportDrawing, i, targetCollectionId, collectionResolver);
      if (result.ok) success += 1;
      else errors.push(`${file.name}: ${result.error}`);
    });
    return { success, failed: errors.length, errors };
  }

  if (isMiroExport(parsed)) {
    const { elements, skipped } = convertMiroExport(parsed);
    if (elements.length === 0) {
      return { success: 0, failed: 1, errors: [`${file.name}: No supported Miro items found (sticky notes, shapes, text, connectors).`] };
    }
    try {
      const appState = { viewBackgroundColor: "#ffffff" };
      const svg = await makeSvgPreview(elements, appState, {});
      const payload = {
        name: basenameWithoutExt(file.name) || "Imported from Miro",
        elements,
        appState,
        files: null,
        collectionId: targetCollectionId,
        preview: svg.outerHTML,
      };
      await api.post("/drawings", payload, { headers: { "X-Imported-File": "true" } });
      const errors = skipped > 0 ? [`${file.name}: ${skipped} unsupported Miro item(s) skipped (frames, images, embeds, etc.)`] : [];
      return { success: 1, failed: 0, errors };
    } catch (err: unknown) {
      return {
        success: 0,
        failed: 1,
        errors: [`${file.name}: ${err instanceof Error ? err.message : "Failed to import Miro board"}`],
      };
    }
  }

  const extracted = extractDrawingData(parsed);
  if (!extracted) {
    return { success: 0, failed: 1, errors: [`${file.name}: Unrecognized JSON format.`] };
  }
  try {
    const svg = await makeSvgPreview(extracted.elements, extracted.appState, extracted.files);
    const payload = {
      name: basenameWithoutExt(file.name) || "Imported Drawing",
      elements: extracted.elements,
      appState: extracted.appState,
      files: extracted.files || null,
      collectionId: targetCollectionId,
      preview: svg.outerHTML,
    };
    await api.post("/drawings", payload, { headers: { "X-Imported-File": "true" } });
    return { success: 1, failed: 0, errors: [] };
  } catch (err: unknown) {
    return {
      success: 0,
      failed: 1,
      errors: [`${file.name}: ${err instanceof Error ? err.message : "Failed to import drawing"}`],
    };
  }
};
