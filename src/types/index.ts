import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type SceneElement = ExcalidrawElement;
export type SceneAppState = Partial<AppState>;
export type SceneFiles = BinaryFiles;

export interface DrawingSummary {
  id: string;
  name: string;
  collectionId: string | null;
  updatedAt: number;
  createdAt: number;
  version: number;
  preview?: string | null;
  accessLevel?: "none" | "view" | "edit" | "owner";
  creatorName?: string | null;
}
export interface Drawing extends DrawingSummary {
  elements: readonly SceneElement[];
  appState: SceneAppState;
  files: SceneFiles | null;
  /** ¿Puede haber otras personas editando a la vez (el dibujo no es tuyo o lo compartiste
   * con alguien que puede editar)? Si no, el editor no abre la sala de colaboración hasta
   * que interactúas con el dibujo. */
  liveCollaboration?: boolean;
}
export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  sharedRole?: "view" | "edit" | null;
  isOwner?: boolean;
  isShared?: boolean;
}

export type CollectionShareRole = "view" | "edit";

export interface CollectionShareUser {
  id: string;
  name: string;
  email: string;
}

export interface CollectionShareRow {
  id: string;
  /** Ausente para una fila de compartir de dibujo (resourceType="drawing"
   * de ShareCollectionModal — ver DrawingShareRow de api/drawings.ts, que
   * reutiliza esta misma forma). */
  collectionId?: string;
  granteeUserId: string;
  granteeUser: CollectionShareUser;
  role: CollectionShareRole;
  createdAt: string;
  updatedAt: string;
}
