import { bumpDrawingsEpoch } from "../utils/drawingsEpoch";
import { getFresh, invalidateFresh, setFresh } from "../utils/freshCache";
import type { LibraryItem as ExcalidrawLibraryItem } from "@excalidraw/excalidraw/types";
// Colecciones contra el backend de Cloudflare Worker + Appwrite,
// incluyendo renombrar/eliminar y compartir. El compartir no tiene una
// tabla "shares" separada — una concesión es un permiso `read()`/`update()`
// que el Worker añade directamente a la fila de la colección (y se
// propaga en cascada a sus dibujos); ver las rutas
// /collections/:id/shares del backend.

import type {
  Collection,
  CollectionShareRole,
  CollectionShareRow,
  CollectionShareUser,
} from "../types";
import { api, getCurrentUserId } from "./client";

export type { CollectionShareRole, CollectionShareRow, CollectionShareUser };

interface AppwriteCollectionRow {
  $id: string;
  name: string;
  userId: string;
  $createdAt: string;
  $permissions?: string[];
  /** Colaboradores con rol edit (ver el backend). */
  editors?: string[] | null;
}

const fromRow = (row: AppwriteCollectionRow): Collection => {
  const viewerUserId = getCurrentUserId();
  const isOwner = !viewerUserId || row.userId === viewerUserId;
  const permissions = row.$permissions ?? [];

  if (isOwner) {
    // Solo las entradas "read(...)" denotan un usuario con acceso concedido
    // — "update(...)"/"delete(...)" también están presentes para los
    // permisos propios del propietario y de otro modo darían un falso
    // positivo aquí (el .exec() de la regex sobre esas devuelve null, y
    // null?.[1] !== row.userId es true, contándolas incorrectamente como
    // "otra persona").
    const hasOtherGrantees = permissions.some((p) => {
      const match = /^read\("user:([^"]+)"\)$/.exec(p);
      return match !== null && match[1] !== row.userId;
    });
    return {
      id: row.$id,
      name: row.name,
      createdAt: Date.parse(row.$createdAt),
      isOwner: true,
      isShared: hasOtherGrantees,
    };
  }

  // El rol edit vive en `editors`; `update("user:x")` es el formato
  // heredado de filas aún no migradas (003_access_model.mjs).
  const sharedRole =
    (row.editors ?? []).includes(viewerUserId) || permissions.some((p) => p === `update("user:${viewerUserId}")`)
      ? "edit"
      : "view";
  return {
    id: row.$id,
    name: row.name,
    createdAt: Date.parse(row.$createdAt),
    isOwner: false,
    isShared: false,
    sharedRole,
  };
};

export const getCollections = async (): Promise<Collection[]> => {
  const response = await api.get<AppwriteCollectionRow[]>("/collections");
  return response.data.map(fromRow);
};

export const createCollection = async (name: string): Promise<Collection> => {
  const response = await api.post<AppwriteCollectionRow>("/collections", { name });
  bumpDrawingsEpoch();
  return fromRow(response.data);
};

export const updateCollection = async (id: string, name: string): Promise<{ success: true }> => {
  await api.patch<AppwriteCollectionRow>(`/collections/${id}`, { name });
  bumpDrawingsEpoch();
  return { success: true };
};

export const deleteCollection = async (id: string): Promise<{ success: true }> => {
  await api.delete<{ success: true }>(`/collections/${id}`);
  // Sus dibujos cambian de carpeta: las listas recordadas del panel ya no valen.
  bumpDrawingsEpoch();
  return { success: true };
};

type LibraryItem = ExcalidrawLibraryItem;

// Firma barata de la biblioteca (ids, estado, nombre y versiones de sus
// elementos). Excalidraw dispara onLibraryChange al CARGAR la biblioteca, no
// solo al editarla: sin esta firma cada apertura de un dibujo volvía a subir
// la biblioteca entera (varios MB) y, si la carga había fallado y quedaba
// vacía, habría pisado la del servidor.
const librarySignature = (items: readonly LibraryItem[]): string =>
  items
    .map((item) => {
      const elements = Array.isArray(item.elements) ? item.elements : [];
      let versions = 0;
      for (const el of elements) versions += el?.version ?? 0;
      return `${item.id}|${item.status}|${item.name}|${elements.length}|${versions}`;
    })
    .join(";");

let lastKnownLibrarySignature: string | null = null;

/** Otro dispositivo cambió la biblioteca: se olvida la copia local y se volverá a pedir. */
export const invalidateLibraryCache = (): void => {
  lastKnownLibrarySignature = null;
  void invalidateFresh("library:items");
};

// La biblioteca (varios MB) se guarda en la copia local cifrada y no se vuelve a pedir
// mientras siga vigente (margen de seguridad de FRESH_MAX_AGE_MS): solo la cambia este
// cliente al guardarla (updateLibrary la reescribe), así que no depende de la época de
// escrituras de dibujos.
const LIBRARY_CACHE_KEY = "library:items";

export const getLibrary = async (): Promise<LibraryItem[]> => {
  const hit = await getFresh<LibraryItem[]>(LIBRARY_CACHE_KEY, { useEpoch: false });
  if (hit) {
    lastKnownLibrarySignature = librarySignature(hit.value);
    return hit.value;
  }
  const response = await api.get<LibraryItem[]>("/library");
  lastKnownLibrarySignature = librarySignature(response.data);
  void setFresh(LIBRARY_CACHE_KEY, response.data);
  return response.data;
};

export const updateLibrary = async (items: readonly LibraryItem[]): Promise<readonly LibraryItem[]> => {
  // Sin biblioteca conocida (la carga falló) y vacía: no hay nada que guardar y subirla pisaría la del servidor.
  if (lastKnownLibrarySignature === null && items.length === 0) return items;
  const signature = librarySignature(items);
  if (signature === lastKnownLibrarySignature) return items;
  await api.put<{ success: boolean }>("/library", { items });
  lastKnownLibrarySignature = signature;
  void setFresh(LIBRARY_CACHE_KEY, items);
  return items;
};

export const getCollectionShares = async (
  collectionId: string,
): Promise<{ shares: CollectionShareRow[]; owner: CollectionShareUser }> => {
  const response = await api.get<{ shares: CollectionShareRow[]; owner: CollectionShareUser }>(
    `/collections/${collectionId}/shares`,
  );
  return response.data;
};

export const resolveCollectionShareUsers = async (
  _collectionId: string,
  query: string,
): Promise<CollectionShareUser[]> => {
  const response = await api.get<{ users: CollectionShareUser[] }>("/users/search", {
    params: { q: query },
  });
  return response.data.users;
};

export const addCollectionShare = async (
  collectionId: string,
  email: string,
  role: CollectionShareRole,
): Promise<{ share: CollectionShareRow }> => {
  const response = await api.post<{ share: CollectionShareRow }>(
    `/collections/${collectionId}/shares`,
    { email, role },
  );
  return response.data;
};

export const updateCollectionShare = async (
  collectionId: string,
  userId: string,
  role: CollectionShareRole,
): Promise<{ success: true }> => {
  await api.patch<{ success: true }>(`/collections/${collectionId}/shares/${userId}`, { role });
  return { success: true };
};

export const removeCollectionShare = async (
  collectionId: string,
  userId: string,
): Promise<{ success: true }> => {
  await api.delete<{ success: true }>(`/collections/${collectionId}/shares/${userId}`);
  return { success: true };
};
