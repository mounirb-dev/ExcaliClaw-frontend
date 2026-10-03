// CRUD de dibujos contra el backend de Cloudflare Worker + Appwrite.
//
// NO MIGRADO (el backend de Worker/Appwrite aún no tiene equivalente, no es
// solo una brecha del lado del cliente): duplicateDrawing,
// setSharedDrawingHidden — siguen conectados a UI activa (acciones del menú
// contextual), así que se quedan como stubs que lanzan un error claro de
// "no disponible" hasta que se implementen, en vez de eliminarse y causar
// un 404 silencioso o un fallo en un llamador que todavía los invoca.
//
// El historial de versiones (getDrawingVersions/getDrawingVersionScene/
// restoreDrawingVersion) SÍ está migrado: GET/POST /drawings/:id/versions.
//
// El compartir con usuarios nombrados (getDrawingShares/addDrawingShare/
// updateDrawingShare/removeDrawingShare) y el compartir por enlace público
// (getPublicDrawing/setPublicSharing) SÍ están migrados — ver abajo,
// respaldados por GET/POST/PATCH/DELETE /drawings/:id/shares y
// /drawings/:id/public.

import type { Drawing, DrawingSummary } from "../types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { normalizePreviewSvg } from "../utils/previewSvg";
import { FRESH_MAX_AGE_MS, getFresh, invalidateFresh, setFresh } from "../utils/freshCache";
import { bumpDrawingsEpoch } from "../utils/drawingsEpoch";
import { clearDraft } from "../utils/draftStore";
import { api, getCurrentUserId, isAxiosError } from "./client";

let fileUploadSupported = true;
export const isFileUploadSupported = (): boolean => fileUploadSupported;
export type UploadedFileRef = { url: string };

/** PUT /files/:drawingId/:fileId — mismo contrato de subida por
 * direccionamiento de contenido que el backend antiguo, ahora respaldado por
 * R2 en vez de blobs de BD/S3. */
export const uploadDrawingFile = async (
  drawingId: string,
  fileId: string,
  body: ArrayBuffer | Uint8Array | Blob,
  mimeType: string,
): Promise<UploadedFileRef | null> => {
  if (!fileUploadSupported) return null;
  try {
    await api.put(`/files/${drawingId}/${fileId}`, body, {
      headers: { "Content-Type": mimeType || "application/octet-stream" },
    });
    return { url: `/files/${drawingId}/${fileId}` };
  } catch (err: unknown) {
    if (isAxiosError(err) && (err.response?.status === 404 || err.response?.status === 501)) {
      fileUploadSupported = false;
      return null;
    }
    throw err;
  }
};

interface AppwriteDrawingRow {
  $id: string;
  name: string;
  version: number;
  collectionId: string | null;
  $createdAt: string;
  $updatedAt: string;
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  /** Dueño y permisos de la fila (solo vienen en GET /drawings/:id). */
  userId?: string;
  editors?: string[] | null;
  $permissions?: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Normaliza la forma sin descartar nada: un filtro aquí borraría de forma permanente
 * elementos o archivos "raros" (importados, antiguos) en el siguiente guardado. */
const sceneElements = (value: unknown): readonly ExcalidrawElement[] =>
  Array.isArray(value) ? (value as ExcalidrawElement[]) : [];

const sceneFiles = (value: unknown): Record<string, BinaryFileData> =>
  isRecord(value) ? (value as Record<string, BinaryFileData>) : {};

// --- Copia local de escenas (store de zustand + IndexedDB cifrada con WebCrypto) ---
// Abrir un dibujo sin cambios no cuesta ninguna petición. La copia local de una
// escena vale mientras se cumpla UNA de estas dos pruebas de que sigue siendo la
// vigente:
//  1. Su `version` coincide con la que acaba de confirmar el listado del panel (o
//     cualquier respuesta de la red) dentro del margen de seguridad.
//  2. No hay versión conocida (p. ej. enlace directo tras recargar) pero no ha habido
//     ninguna escritura propia desde que se guardó (época de `bumpDrawingsEpoch`).
// Un dibujo que ya no está en tu listado (acceso revocado) con versión conocida
// distinta nunca se sirve de aquí. Cerrar sesión borra todo (clearAllLocalData).
// Margen de seguridad para cambios de otra persona o dispositivo: FRESH_MAX_AGE_MS.
const SCENE_CACHE_MAX_CHARS = 8_000_000;
const knownVersions = new Map<string, { version: number; at: number }>();
const sceneCacheKey = (id: string): string => `scene:${id}`;

const noteVersion = (id: string, version: number, at: number = Date.now()): void => {
  knownVersions.set(id, { version, at });
};

/** El listado del panel (recién pedido o recuperado de la copia local, `at` = cuándo se
 * pidió) confirma la versión vigente de cada dibujo. */
export const noteListedVersions = (drawings: readonly { id: string; version: number }[], at: number): void => {
  for (const drawing of drawings) noteVersion(drawing.id, drawing.version, at);
};

const rememberScene = (drawing: Drawing): void => {
  try {
    if (JSON.stringify(drawing).length > SCENE_CACHE_MAX_CHARS) return;
  } catch {
    return;
  }
  void setFresh(sceneCacheKey(drawing.id), drawing);
};

const fromRow = (row: AppwriteDrawingRow): DrawingSummary => {
  noteVersion(row.$id, row.version);
  return {
    id: row.$id,
    name: row.name,
    collectionId: row.collectionId,
    version: row.version,
    createdAt: Date.parse(row.$createdAt),
    updatedAt: Date.parse(row.$updatedAt),
  };
};

/** ¿Puede haber más gente editando este dibujo a la vez? Si no es tuyo, o hay editores
 * (campo `editors` o permisos `update("user:...")` de otra persona), sí. Sin saber quién
 * eres (usuario aún sin cargar) se asume que sí: es el caso seguro. */
const hasLiveCollaboration = (row: AppwriteDrawingRow): boolean => {
  const me = getCurrentUserId();
  if (!me || !row.userId) return true;
  if (row.userId !== me) return true;
  if (Array.isArray(row.editors) && row.editors.some((id) => id !== me)) return true;
  return (row.$permissions ?? []).some((permission) => {
    const match = /^update\("user:([^"]+)"\)$/.exec(permission);
    return Boolean(match && match[1] !== me);
  });
};

const fromRowFull = (row: AppwriteDrawingRow): Drawing => ({
  ...fromRow(row),
  elements: sceneElements(row.elements),
  appState: row.appState ?? {},
  files: sceneFiles(row.files),
  liveCollaboration: hasLiveCollaboration(row),
});

export interface PaginatedDrawings<T> {
  drawings: T[];
  totalCount: number;
  limit?: number;
  offset?: number;
}

export type DrawingSortField = "name" | "createdAt" | "updatedAt";
export type SortDirection = "asc" | "desc";

type DrawingQueryOptions = {
  includeData?: boolean;
  limit?: number;
  offset?: number;
  sortField?: DrawingSortField;
  sortDirection?: SortDirection;
};

// El filtro de texto se hace AQUÍ, en el cliente: la ruta de listado del
// Worker no filtra por nombre (Appwrite necesitaría un índice de texto) y
// hacerlo en cliente no cuesta nada en el servidor. Mientras hay texto se
// descarga la lista completa de ese conjunto (colección + orden) en páginas
// de 100 —la primera trae el total y el resto va en paralelo— y se filtra
// por nombre sin distinguir mayúsculas ni acentos. La lista se recuerda unos
// segundos para que cada letra nueva no vuelva a pedirla; cualquier listado
// normal (que es lo que se pide tras crear/mover/borrar) la descarta.
// sortField/sortDirection SÍ se aplican (ver SORT_FIELD_TO_ATTRIBUTE en
// el backend).
const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_ROWS = 2000;
const SEARCH_CACHE_TTL_MS = 20_000;
let searchCache: { key: string; at: number; rows: DrawingSummary[] } | null = null;

const foldText = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const matchesDrawingSearch = (name: string, term: string): boolean =>
  foldText(name).includes(foldText(term.trim()));

type DrawingsListResponse = { drawings: AppwriteDrawingRow[]; totalCount: number; limit: number; offset: number };

const fetchDrawingsPage = (
  collectionId: string | null | undefined,
  options: DrawingQueryOptions | undefined,
  limit?: number,
  offset?: number,
) =>
  api.get<DrawingsListResponse>("/drawings", {
    params: {
      limit,
      offset,
      collectionId: collectionId === undefined ? undefined : collectionId === null ? "null" : collectionId,
      sortField: options?.sortField,
      sortDirection: options?.sortDirection,
    },
  });

async function loadAllDrawingsForSearch(
  collectionId: string | null | undefined,
  options: DrawingQueryOptions | undefined,
): Promise<DrawingSummary[]> {
  const key = JSON.stringify([collectionId ?? "all", options?.sortField, options?.sortDirection]);
  if (searchCache && searchCache.key === key && Date.now() - searchCache.at < SEARCH_CACHE_TTL_MS) {
    return searchCache.rows;
  }
  const first = await fetchDrawingsPage(collectionId, options, SEARCH_PAGE_SIZE, 0);
  const total = Math.min(first.data.totalCount, SEARCH_MAX_ROWS);
  const offsets: number[] = [];
  for (let offset = SEARCH_PAGE_SIZE; offset < total; offset += SEARCH_PAGE_SIZE) offsets.push(offset);
  const rest = await Promise.all(offsets.map((offset) => fetchDrawingsPage(collectionId, options, SEARCH_PAGE_SIZE, offset)));
  const rows = [first, ...rest].flatMap((page) => page.data.drawings.map(fromRow));
  searchCache = { key, at: Date.now(), rows };
  return rows;
}

export async function getDrawings(
  search?: string,
  collectionId?: string | null,
  options?: DrawingQueryOptions,
): Promise<PaginatedDrawings<DrawingSummary>> {
  const term = search?.trim();
  if (term) {
    const matches = (await loadAllDrawingsForSearch(collectionId, options)).filter((drawing) =>
      matchesDrawingSearch(drawing.name, term),
    );
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? matches.length;
    return { drawings: matches.slice(offset, offset + limit), totalCount: matches.length, limit, offset };
  }
  searchCache = null;
  // collectionId se filtra del lado del servidor (no del lado del cliente
  // después de la petición) para que totalCount refleje el conjunto
  // filtrado — de lo contrario la aritmética de "hay más páginas" se rompe
  // para cualquier vista de colección/papelera más pequeña que el total sin
  // filtrar, causando un "Cargando más..." infinito (corregido tras
  // exactamente ese reporte de bug).
  const response = await fetchDrawingsPage(collectionId, options, options?.limit, options?.offset);
  return { ...response.data, drawings: response.data.drawings.map(fromRow) };
}

const fetchDrawing = async (id: string): Promise<Drawing> => {
  const response = await api.get<AppwriteDrawingRow>(`/drawings/${id}`);
  const drawing = fromRowFull(response.data);
  rememberScene(drawing);
  return drawing;
};

/** Copia local de la escena si coincide con la versión vigente que ya conocemos
 * de la red (ver caché local arriba); `undefined` si hay que pedirla. */
const readCachedScene = async (id: string): Promise<Drawing | undefined> => {
  const known = knownVersions.get(id);
  const knownValid = known && Date.now() - known.at < FRESH_MAX_AGE_MS ? known : undefined;
  if (knownValid) {
    const hit = await getFresh<Drawing>(sceneCacheKey(id), { useEpoch: false });
    return hit && hit.value.id === id && hit.value.version === knownValid.version ? hit.value : undefined;
  }
  const hit = await getFresh<Drawing>(sceneCacheKey(id));
  return hit && hit.value.id === id ? hit.value : undefined;
};

// Precarga de un dibujo al abrir un enlace directo al editor: la petición sale
// en paralelo a /auth/me (que tarda ~1-2 s) en vez de esperar a que termine
// la autenticación y se monte el editor. Se consume una sola vez y caduca.
const PREFETCH_TTL_MS = 15_000;
const prefetchedDrawings = new Map<string, { promise: Promise<Drawing>; at: number }>();

export const prefetchDrawing = (id: string): void => {
  // Primero la copia local (si sigue vigente no hay petición); si no, la red.
  const promise = readCachedScene(id).then((cached) => cached ?? fetchDrawing(id));
  promise.catch(() => undefined);
  prefetchedDrawings.set(id, { promise, at: Date.now() });
};

export const getDrawing = async (id: string): Promise<Drawing> => {
  const hit = prefetchedDrawings.get(id);
  prefetchedDrawings.delete(id);
  if (hit && Date.now() - hit.at < PREFETCH_TTL_MS) {
    try {
      return await hit.promise;
    } catch {
      // Si la precarga falló (p. ej. 401 antes de iniciar sesión) se repite normal.
    }
  }
  const cached = await readCachedScene(id);
  if (cached) return cached;
  return fetchDrawing(id);
};

interface PublicDrawingRow {
  id: string;
  name: string;
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

/** Lectura sin login de un dibujo cuyo propietario ha habilitado el enlace
 * público (ver setPublicSharing). Da 404 si no existe o si actualmente no es
 * público — los dos casos se ven idénticos a propósito, para que un enlace
 * deshabilitado no filtre "este dibujo existe pero no está compartido" a un
 * extraño que tenga la URL. */
export const getPublicDrawing = async (id: string, signal?: AbortSignal): Promise<Drawing> => {
  const response = await api.get<PublicDrawingRow>(`/drawings/${id}/public`, { signal });
  const row = response.data;
  return {
    id: row.id,
    name: row.name,
    collectionId: null,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    accessLevel: "view",
    elements: sceneElements(row.elements),
    appState: row.appState ?? {},
    files: sceneFiles(row.files),
  };
};

/** Alterna el enlace de vista pública del dibujo, que no requiere login.
 * Solo el propietario — el backend vuelve a comprobar la propiedad por sí
 * mismo sin importar lo que afirme el cliente. */
export const setPublicSharing = async (id: string, enabled: boolean): Promise<{ public: boolean }> => {
  const response = enabled
    ? await api.post<{ public: boolean }>(`/drawings/${id}/public`)
    : await api.delete<{ public: boolean }>(`/drawings/${id}/public`);
  void invalidateFresh(sceneCacheKey(id));
  return response.data;
};

/** GET /drawings/:id/preview — miniatura SVG guardada en el servidor
 * (cacheada por versión en el borde de Cloudflare, ver
 * el backend). null si nunca se guardó ninguna para este
 * drawing — el caller (useDrawingPreview.ts) cae entonces a generarla del
 * lado del cliente y, tras generarla, la sube con putDrawingPreview para
 * que la próxima carga (este dispositivo u otro) no tenga que regenerarla. */
export const getDrawingPreview = async (id: string, version?: number): Promise<string | null> => {
  try {
    // `v` solo rompe cualquier caché HTTP intermedia por versión; el
    // servidor ignora el query string.
    const response = await api.get<string>(`/drawings/${id}/preview`, {
      params: version === undefined ? undefined : { v: version },
    });
    return typeof response.data === "string" ? response.data : null;
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
};

/** PUT /drawings/:id/preview — guarda/sobrescribe la miniatura SVG. Best-
 * effort desde el llamador: si falla, la próxima carga simplemente vuelve
 * a generarla del lado del cliente, no hay nada que reintentar. */
export const putDrawingPreview = async (id: string, svg: string): Promise<void> => {
  await api.put(`/drawings/${id}/preview`, { svg });
};

export type ShareResolvedUser = { id: string; name: string; email: string };

/** Compartir con usuario nombrado para un solo dibujo — mismo modelo de
 * concesión instantánea y misma forma de datos que el compartir de
 * colecciones (getCollectionShares/addCollectionShare en
 * api/collections.ts), respaldado por GET/POST/PATCH/DELETE
 * /drawings/:id/shares. Reutiliza las formas de tipo
 * CollectionShareRow/Role/User (respuesta estructuralmente idéntica) para
 * que ShareCollectionModal pueda manejar cualquiera de los dos recursos sin
 * una jerarquía de tipos paralela. */
export type DrawingShareRole = "view" | "edit";
export type DrawingShareUser = ShareResolvedUser;
export type DrawingShareRow = {
  id: string;
  granteeUserId: string;
  granteeUser: DrawingShareUser;
  role: DrawingShareRole;
  createdAt: string;
  updatedAt: string;
};

export const resolveShareUsers = async (_drawingId: string, query: string): Promise<ShareResolvedUser[]> => {
  const response = await api.get<{ users: ShareResolvedUser[] }>("/users/search", { params: { q: query } });
  return response.data.users;
};

export const getDrawingShares = async (
  drawingId: string,
): Promise<{ shares: DrawingShareRow[]; owner: DrawingShareUser }> => {
  const response = await api.get<{ shares: DrawingShareRow[]; owner: DrawingShareUser }>(
    `/drawings/${drawingId}/shares`,
  );
  return response.data;
};

export const addDrawingShare = async (
  drawingId: string,
  email: string,
  role: DrawingShareRole,
): Promise<{ share: DrawingShareRow }> => {
  const response = await api.post<{ share: DrawingShareRow }>(`/drawings/${drawingId}/shares`, { email, role });
  void invalidateFresh(sceneCacheKey(drawingId));
  bumpDrawingsEpoch();
  return response.data;
};

export const updateDrawingShare = async (
  drawingId: string,
  userId: string,
  role: DrawingShareRole,
): Promise<{ success: true }> => {
  const response = await api.patch<{ success: true }>(`/drawings/${drawingId}/shares/${userId}`, { role });
  void invalidateFresh(sceneCacheKey(drawingId));
  bumpDrawingsEpoch();
  return response.data;
};

export const removeDrawingShare = async (drawingId: string, userId: string): Promise<{ success: true }> => {
  const response = await api.delete<{ success: true }>(`/drawings/${drawingId}/shares/${userId}`);
  void invalidateFresh(sceneCacheKey(drawingId));
  bumpDrawingsEpoch();
  return response.data;
};

/** "Ocultar" un dibujo compartido = dejar de verlo: el invitado se quita a sí
 * mismo de los colaboradores (DELETE /drawings/:id/shares/me). Es definitivo:
 * para volver a verlo, el dueño tiene que compartirlo otra vez, así que no
 * hay "mostrar" (hidden=false). */
export const setSharedDrawingHidden = async (
  drawingId: string,
  hidden: boolean,
): Promise<{ success: true; hidden: boolean }> => {
  if (!hidden) throw new Error("A shared drawing can only be hidden, not restored; ask the owner to share it again.");
  await api.delete<{ success: true }>(`/drawings/${drawingId}/shares/me`);
  void invalidateFresh(sceneCacheKey(drawingId));
  bumpDrawingsEpoch();
  return { success: true, hidden: true };
};

/** Una instantánea del historial de versiones de un dibujo (ver el backend). */
export interface DrawingVersion {
  id: string;
  /** Instante de la escena guardada, en ms desde epoch. */
  at: number;
  elementCount: number;
  /** "restore" = la escena que había justo antes de restaurar otra versión. */
  reason: "auto" | "restore";
}

export interface DrawingVersionList {
  versions: DrawingVersion[];
  /** Días que conserva el plan del dueño; null = sin límite. */
  retentionDays: number | null;
  planId: string;
  canRestore: boolean;
}

export const getDrawingVersions = async (drawingId: string): Promise<DrawingVersionList> => {
  const response = await api.get<DrawingVersionList>(`/drawings/${drawingId}/versions`);
  return response.data;
};

export const getDrawingVersionScene = async (
  drawingId: string,
  versionId: string,
): Promise<{ elements: readonly unknown[]; appState: Record<string, unknown> }> => {
  const response = await api.get<{ elements: readonly unknown[]; appState: Record<string, unknown> }>(
    `/drawings/${drawingId}/versions/${versionId}`,
  );
  return response.data;
};

/** Restaura una versión (el servidor guarda antes la escena actual como otra versión). Descarta la
 * copia local y el borrador de este dibujo: ya no coinciden con lo que hay en el servidor. */
export const restoreDrawingVersion = async (drawingId: string, versionId: string): Promise<{ version: number }> => {
  const response = await api.post<{ success: true; version: number }>(
    `/drawings/${drawingId}/versions/${versionId}/restore`,
  );
  void invalidateFresh(sceneCacheKey(drawingId));
  await clearDraft(drawingId, Date.now()).catch(() => undefined);
  bumpDrawingsEpoch();
  return { version: response.data.version };
};

export const createDrawing = async (
  name?: string,
  collectionId?: string | null,
  scene?: { elements?: readonly unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> },
): Promise<{ id: string }> => {
  const response = await api.post<AppwriteDrawingRow>("/drawings", {
    name: name || "Untitled Drawing",
    collectionId: collectionId ?? null,
    appState: scene?.appState ?? {},
    elements: scene?.elements ?? [],
    ...(scene?.files && Object.keys(scene.files).length > 0 ? { files: scene.files } : {}),
  });
  bumpDrawingsEpoch();
  return { id: response.data.$id };
};

/** "Copiar a mi cuenta" desde una vista pública/embebida — el bucle de
 * adquisición detrás de /view/:id y /embed/:id: un visitante conectado al
 * que le gusta lo que ve obtiene su propia copia editable con un clic, sin
 * tener que volver a dibujar. */
export const duplicatePublicDrawingToMyAccount = async (source: Drawing): Promise<{ id: string }> => {
  const response = await api.post<AppwriteDrawingRow>("/drawings", {
    name: source.name ? `${source.name} (copy)` : "Untitled Drawing",
    collectionId: null,
    elements: source.elements,
    appState: {},
    files: source.files ?? {},
  });
  bumpDrawingsEpoch();
  return { id: response.data.$id };
};

// Guardar una escena grande sube su JSON completo en cada autoguardado; en
// redes normales esa subida es lo que más tarda. El JSON de Excalidraw
// comprime ~10x, así que por encima de este tamaño se envía gzip (el Worker
// lo descomprime con tope, ver el backend). El umbral es bajo
// a propósito: un dibujo de ~50 KB de JSON bajaba a ~5 KB y antes viajaba sin
// comprimir; comprimir 4 KB cuesta menos de 1 ms. Por debajo no
// compensa el coste de comprimir.
const GZIP_MIN_JSON_CHARS = 4 * 1024;
let gzipUploadSupported = typeof CompressionStream !== "undefined";

const gzipJson = (json: string): Promise<Blob> =>
  new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).blob();

/** Tras guardar, la copia local pasa a la versión nueva con lo que acabamos de
 * enviar (así reabrir no necesita la red). Solo se actualiza una entrada que ya
 * existía: sin ella no se conocen los `files` que el guardado no reenvía. */
const rememberSavedScene = async (id: string, data: Partial<Drawing>, updated: Drawing): Promise<void> => {
  const hit = await getFresh<Drawing>(sceneCacheKey(id), { useEpoch: false });
  const cached = hit?.value;
  if (!cached || cached.id !== id) return;
  rememberScene({
    ...cached,
    name: data.name ?? cached.name,
    collectionId: data.collectionId !== undefined ? data.collectionId : cached.collectionId,
    version: updated.version,
    updatedAt: updated.updatedAt,
    elements: data.elements ?? cached.elements,
    appState: data.appState ?? cached.appState,
    files: data.files ?? cached.files,
  });
};

export const updateDrawing = async (id: string, data: Partial<Drawing>): Promise<Drawing> => {
  const { name, collectionId, elements, appState, files } = data;
  const json = JSON.stringify({ name, collectionId, elements, appState, files });
  const url = `/drawings/${id}`;
  const jsonHeaders = { "Content-Type": "application/json" };

  if (gzipUploadSupported && json.length >= GZIP_MIN_JSON_CHARS) {
    try {
      const body = await gzipJson(json);
      const response = await api.patch<AppwriteDrawingRow>(url, body, {
        headers: { ...jsonHeaders, "Content-Encoding": "gzip" },
      });
      const updated = fromRowFull(response.data);
      void rememberSavedScene(id, data, updated);
      bumpDrawingsEpoch();
      return updated;
    } catch (err: unknown) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      // Un intermediario/servidor que no entiende el cuerpo comprimido (400/
      // 415) o falla al procesarlo (5xx): se desactiva gzip para esta
      // sesión y se reintenta sin comprimir. Casi todo dibujo real supera
      // el umbral, así que gzip nunca debe ser lo que impida guardar. El
      // PATCH reemplaza la escena entera, por lo que reintentarlo es
      // idempotente.
      const gzipRejected = status === 400 || status === 415 || (typeof status === "number" && status >= 500);
      if (!gzipRejected) throw err;
      gzipUploadSupported = false;
    }
  }

  const response = await api.patch<AppwriteDrawingRow>(url, json, { headers: jsonHeaders });
  const updated = fromRowFull(response.data);
  void rememberSavedScene(id, data, updated);
  bumpDrawingsEpoch();
  return updated;
};

export const deleteDrawing = async (id: string): Promise<{ success: true }> => {
  await api.delete<{ success: true }>(`/drawings/${id}`);
  bumpDrawingsEpoch();
  return { success: true };
};

export const duplicateDrawing = async (..._args: unknown[]): Promise<Drawing> => {
  throw new Error("Duplicate is not available on this deployment.");
};

// Se conserva para los llamadores que todavía lo importan — ahora no hace
// nada, ya que normalizePreviewSvg solo se aplicaba a vistas previas
// provistas por el servidor, que este backend no envía.
export { normalizePreviewSvg };
