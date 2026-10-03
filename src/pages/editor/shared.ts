import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { applyElementOrder, reconcileElements, type SyncElement } from "../../utils/sync";
import type { BinaryFileData, BinaryFiles, Collaborator, SocketId } from "@excalidraw/excalidraw/types";

export interface ElementVersionInfo {
  version: number;
  versionNonce: number;
  updated: number;
  contentSig: string;
}

const toFiniteNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const getElementContentSig = (element: SyncElement): string => {
  if (!element || typeof element !== "object") return "";
  const type = typeof element.type === "string" ? element.type : "";
  const isDeleted = element.isDeleted ? "1" : "0";
  const status = typeof element.status === "string" ? element.status : "";
  const x = toFiniteNumber(element.x);
  const y = toFiniteNumber(element.y);
  const w = toFiniteNumber(element.width);
  const h = toFiniteNumber(element.height);
  const angle = toFiniteNumber(element.angle);
  const fileId = typeof element.fileId === "string" ? element.fileId : "";
  const text = typeof element.text === "string" ? element.text : "";
  const textSig = text ? `t${text.length}:${text.slice(0, 64)}` : "";
  let pointsSig = "";
  if (Array.isArray(element.points)) {
    const pts = element.points;
    const len = pts.length;
    const last = len > 0 ? pts[len - 1] : null;
    const lastX = Array.isArray(last) ? toFiniteNumber(last[0]) : 0;
    const lastY = Array.isArray(last) ? toFiniteNumber(last[1]) : 0;
    pointsSig = `p${len}:${lastX},${lastY}`;
  }
  return `${type}|${isDeleted}|${status}|${x}|${y}|${w}|${h}|${angle}|${pointsSig}|${fileId}|${textSig}`;
};

/**
 * Coincide con CaptureUpdateAction.{NEVER,IMMEDIATELY} de
 * @excalidraw/excalidraw. Se mantiene como constantes locales para que
 * shared.ts no arrastre el bundle de UI completo de excalidraw, que rompe
 * las pruebas unitarias basadas en jsdom. Los valores del enum son las
 * cadenas literales "NEVER" / "IMMEDIATELY" (ver store.d.ts).
 */
const CAPTURE_UPDATE_NEVER = "NEVER" as const;
type CaptureMode = "NEVER" | "IMMEDIATELY";

type RemoteSceneUpdate =
  | {
      collaborators: Map<SocketId, Collaborator>;
      captureUpdate: CaptureMode;
    }
  | {
      elements: SyncElement[];
      files?: BinaryFiles;
      captureUpdate: CaptureMode;
    }
  | {
      files: BinaryFiles;
      captureUpdate: CaptureMode;
    };

type BuildRemoteSceneUpdateInput = {
  collaborators?: Map<SocketId, Collaborator>;
  localElements?: readonly SyncElement[];
  pendingElements?: readonly SyncElement[];
  elementOrder?: readonly string[] | null;
  lastSyncedFiles?: BinaryFiles;
  incomingFiles?: BinaryFiles;
  /**
   * Comportamiento de la pila de deshacer para actualizaciones de
   * elementos. Las ediciones de pares remotos por defecto son NEVER (no
   * deshacibles localmente); un lote de agente autooriginado reproducido de
   * vuelta al editor que lo solicitó pasa IMMEDIATELY para que el Ctrl+Z
   * nativo funcione (D5).
   */
  captureUpdate?: CaptureMode;
};

export const getPersistedAppState = (appState: Record<string, unknown> | null | undefined) => {
  const base: Record<string, unknown> = {
    viewBackgroundColor: appState?.viewBackgroundColor ?? "#ffffff",
    gridSize: appState?.gridSize ?? null,
  };
  if (appState?.gridStep != null) base.gridStep = appState.gridStep;
  if (appState?.gridModeEnabled != null) base.gridModeEnabled = appState.gridModeEnabled;
  return base;
};

export const buildRemoteSceneUpdate = ({
  collaborators,
  localElements = [],
  pendingElements = [],
  elementOrder = null,
  lastSyncedFiles = {},
  incomingFiles = {},
  captureUpdate = CAPTURE_UPDATE_NEVER,
}: BuildRemoteSceneUpdateInput): {
  sceneUpdate: RemoteSceneUpdate | null;
  mergedElements: SyncElement[] | null;
  nextFiles: BinaryFiles;
  shouldUpdateFiles: boolean;
} => {
  if (collaborators) {
    return {
      sceneUpdate: {
        collaborators,
        captureUpdate: CAPTURE_UPDATE_NEVER,
      },
      mergedElements: null,
      nextFiles: lastSyncedFiles,
      shouldUpdateFiles: false,
    };
  }

  const shouldUpdateFiles = Object.keys(incomingFiles).length > 0;
  const nextFiles = shouldUpdateFiles
    ? { ...lastSyncedFiles, ...incomingFiles }
    : lastSyncedFiles;
  const hasElementOrder = Array.isArray(elementOrder) && elementOrder.length > 0;
  const shouldUpdateElements = pendingElements.length > 0 || hasElementOrder;

  if (shouldUpdateElements) {
    let mergedElements = reconcileElements(localElements, pendingElements);
    if (hasElementOrder) {
      mergedElements = applyElementOrder(mergedElements, elementOrder);
    }

    return {
      sceneUpdate: {
        elements: mergedElements,
        ...(shouldUpdateFiles ? { files: nextFiles } : {}),
        captureUpdate,
      },
      mergedElements,
      nextFiles,
      shouldUpdateFiles,
    };
  }

  if (shouldUpdateFiles) {
    return {
      sceneUpdate: {
        files: nextFiles,
        captureUpdate: CAPTURE_UPDATE_NEVER,
      },
      mergedElements: null,
      nextFiles,
      shouldUpdateFiles,
    };
  }

  return {
    sceneUpdate: null,
    mergedElements: null,
    nextFiles,
    shouldUpdateFiles,
  };
};

export const haveSameElements = (a: readonly SyncElement[] = [], b: readonly SyncElement[] = []) => {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (left.id !== right.id) return false;
    if ((left.version ?? 0) !== (right.version ?? 0)) return false;
    if ((left.versionNonce ?? 0) !== (right.versionNonce ?? 0)) return false;
    // Algunas interacciones de Excalidraw (notablemente arrastrar/redimensionar)
    // pueden actualizar la geometría manteniendo version/versionNonce estables
    // hasta el commit; `updated` captura esos frames.
    const leftUpdated = typeof left.updated === "number" ? left.updated : Number(left.updated) || 0;
    const rightUpdated =
      typeof right.updated === "number" ? right.updated : Number(right.updated) || 0;
    if (leftUpdated !== rightUpdated) return false;
  }
  return true;
};

export const hasRenderableElements = (elements: readonly SyncElement[] = []): boolean =>
  elements.some((element) => !element?.isDeleted);

/**
 * Protege contra que instantáneas vacías transitorias (p. ej. condiciones
 * de carrera de hidratación/recarga) sobrescriban un dibujo no vacío
 * previamente persistido.
 */
export const isSuspiciousEmptySnapshot = (
  previousPersisted: readonly SyncElement[] = [],
  nextSnapshot: readonly SyncElement[] = []
): boolean => {
  if (!Array.isArray(nextSnapshot) || nextSnapshot.length > 0) return false;
  return hasRenderableElements(previousPersisted);
};

/**
 * Detecta una instantánea vacía obsoleta que es más antigua que la escena
 * actual en memoria. Esto evita condiciones de carrera donde un evento
 * `onChange` vacío desactualizado pueda sobrescribir una escena más nueva
 * no vacía.
 */
export const isStaleEmptySnapshot = (
  latestSnapshot: readonly SyncElement[] = [],
  candidateSnapshot: readonly SyncElement[] = []
): boolean => {
  if (!Array.isArray(candidateSnapshot) || candidateSnapshot.length > 0) return false;
  if (!hasRenderableElements(latestSnapshot)) return false;
  return !haveSameElements(latestSnapshot, candidateSnapshot);
};

/**
 * Detecta una instantánea obsoleta que no tiene elementos renderizables
 * mientras la escena más reciente en memoria todavía tiene contenido
 * renderizable.
 *
 * Esto cubre los casos donde Excalidraw emite una escena transitoria no
 * renderizable (p. ej. condición de carrera de hidratación) que no debería
 * sobrescribir contenido más nuevo.
 */
export const isStaleNonRenderableSnapshot = (
  latestSnapshot: readonly SyncElement[] = [],
  candidateSnapshot: readonly SyncElement[] = []
): boolean => {
  if (!Array.isArray(candidateSnapshot)) return false;
  if (hasRenderableElements(candidateSnapshot)) return false;
  if (!hasRenderableElements(latestSnapshot)) return false;
  return !haveSameElements(latestSnapshot, candidateSnapshot);
};

const buildFileSignature = (file: BinaryFileData): string => {
  const mimeType = typeof file?.mimeType === "string" ? file.mimeType : "";
  const id = typeof file?.id === "string" ? file.id : "";
  const dataURL = typeof file?.dataURL === "string" ? file.dataURL : "";
  const prefix = dataURL.slice(0, 32);
  const suffix = dataURL.slice(-32);
  return `${id}|${mimeType}|${dataURL.length}|${prefix}|${suffix}`;
};

export const getFilesDelta = (
  previous: BinaryFiles,
  next: BinaryFiles
): BinaryFiles => {
  const delta: BinaryFiles = {};
  const prev = previous || {};
  const nxt = next || {};

  for (const fileId of Object.keys(nxt)) {
    const nextFile = nxt[fileId];
    const nextHasDataUrl = typeof nextFile?.dataURL === "string" && nextFile.dataURL.length > 0;
    if (!nextHasDataUrl) continue;

    const prevFile = prev[fileId];
    if (!prevFile) {
      delta[fileId] = nextFile;
      continue;
    }

    if (buildFileSignature(prevFile) !== buildFileSignature(nextFile)) {
      delta[fileId] = nextFile;
    }
  }

  return delta;
};

/**
 * Mapa de fileId de Excalidraw → URL de referencia almacenada
 * (`/api/files/<drawingId>/<fileId>`) para imágenes que se han subido fuera
 * de banda vía el endpoint de subida por archivo. Consumido por
 * {@link applyUploadedFileRefs}.
 */
export type UploadedFileRefs = Record<string, string>;

/**
 * Reemplaza la dataURL base64 en línea de cualquier archivo ya subido por
 * una pequeña entrada de metadatos + referencia, para que los PUT de
 * escena y las emisiones por socket lleven KB, no MB.
 *
 * Solo se reescriben las entradas que (a) tienen una referencia registrada
 * y (b) todavía llevan una URL `data:` en línea — las entradas aún no
 * subidas conservan sus bytes en línea (el servidor las interna, así que
 * una condición de carrera de subida nunca pierde datos), y las entradas
 * que ya tienen forma de referencia pasan sin tocarse. Devuelve la entrada
 * sin cambios cuando no se sustituyó nada.
 */
export const applyUploadedFileRefs = (
  files: BinaryFiles | null | undefined,
  uploadedRefs: UploadedFileRefs | null | undefined,
): BinaryFiles => {
  if (!files || typeof files !== "object") return files ?? {};
  if (!uploadedRefs || Object.keys(uploadedRefs).length === 0) return files;

  let changed = false;
  const result: BinaryFiles = {};
  for (const [fileId, file] of Object.entries(files)) {
    const refUrl = uploadedRefs[fileId];
    const dataURL = file?.dataURL;
    if (
      refUrl &&
      file &&
      typeof dataURL === "string" &&
      dataURL.startsWith("data:")
    ) {
      changed = true;
      result[fileId] = {
        id: file.id ?? fileId,
        mimeType: file.mimeType,
        created: file.created,
        lastRetrieved: file.lastRetrieved ?? Date.now(),
        dataURL: refUrl as BinaryFileData["dataURL"],
      };
    } else {
      result[fileId] = file;
    }
  }
  return changed ? result : files;
};

export const UIOptions = {
  canvasActions: {
    saveToActiveFile: false,
    loadScene: false,
    // Diálogo de exportación nativo de Excalidraw (PNG/SVG, con un slider
    // de escala visible para el usuario hasta 30x) — reactivado para que
    // exportar gráficos no recaiga en la baja resolución que daría una
    // captura por defecto a escala:1.
    export: { saveFileToDisk: true },
    toggleTheme: true,
  },
} as const;

export { getInitialsFromName } from "../../utils/user";

export const getColorFromString = (str: string): string => {
  const COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#10b981",
    "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
    "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
};

/** Firma barata de una escena persistible (id+version por elemento, appState
 * persistido y claves de archivos). La comparten el guardado y el cargador: el
 * cargador la fija al abrir el dibujo para que el primer autoguardado no vuelva
 * a subir una escena idéntica a la que ya hay en el servidor. */
export const computeSceneSignature = (
  elements: readonly ExcalidrawElement[],
  appState: Record<string, unknown>,
  files: BinaryFiles,
): string => {
  const elementsSig = elements.map((el) => `${el.id}:${el.version ?? 0}`).join(",");
  const filesSig = Object.keys(files || {}).sort().join(",");
  return `${elementsSig}|${JSON.stringify(appState)}|${filesSig}`;
};
