import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { BinaryFiles, Collaborator, ExcalidrawImperativeAPI, SocketId } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { UserIdentity } from "../../utils/identity";
import { filesNeedRehydration, rehydrateFilesFromUrls } from "../../utils/rehydrateFiles";
import { buildRemoteSceneUpdate } from "./shared";
import { attachCanvasZoomForwarding } from "./canvasZoomForwarding";
import { authRefresh } from "../../api";

// Migrado de la versión con socket.io contra el backend Express a un
// WebSocket plano contra el Durable Object de este dibujo (ver
// el backend). La lógica de batching/RAF/rehidratación de
// archivos de abajo es agnóstica al transporte — ya operaba sobre payloads
// de mensajes planos, así que solo cambió la fontanería de
// conectar/enviar/recibir. Dos funciones exclusivas de socket.io no se
// trasladaron (sin equivalente del lado del DO, no solo una brecha del
// cliente): `user-activity` (presencia focus/blur) y
// `drawing-server-update` (aviso de recarga por migración de backend de
// almacenamiento, un concepto de Express/SQLite-vs-S3 que no aplica a R2).

interface Peer extends UserIdentity {
  isActive: boolean;
}

type UseEditorCollaborationInput = {
  drawingId?: string;
  me: UserIdentity;
  isReady: boolean;
  excalidrawAPI: MutableRefObject<ExcalidrawImperativeAPI | null>;
  editorContainerRef: RefObject<HTMLDivElement>;
  lastSyncedFilesRef: MutableRefObject<BinaryFiles>;
  lastSyncedElementOrderSigRef: MutableRefObject<string>;
  latestElementsRef: MutableRefObject<readonly ExcalidrawElement[]>;
  latestFilesRef: MutableRefObject<BinaryFiles>;
  computeElementOrderSig: (elements: readonly ExcalidrawElement[]) => string;
  recordElementVersion: (element: ExcalidrawElement) => void;
  onAccessDenied: () => void;
  /** `true` en dibujos compartidos contigo (la colaboración es el punto): el socket se abre
   * al entrar. `false` en los tuyos: solo se abre al interactuar con el dibujo (primer clic,
   * tecla o toque) o al producirse un cambio, y entrar solo a mirar no abre ninguna conexión. */
  eagerConnect: boolean;
  /** La sala decide qué editor guarda con la cadencia normal (ver DrawingRoom.electSaver). */
  isSaverRef: MutableRefObject<boolean>;
  /** Se llama cada vez que el socket se abre: el editor reenvía lo cambiado mientras no había conexión. */
  onSocketOpen?: () => void;
};

const getWorkerBaseUrl = () =>
  import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL !== "/api"
    ? import.meta.env.VITE_API_URL
    : window.location.origin;

const wsSend = (ws: WebSocket | null, payload: unknown) => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
};

export const useEditorCollaboration = ({
  drawingId,
  me,
  isReady,
  excalidrawAPI,
  editorContainerRef,
  lastSyncedFilesRef,
  lastSyncedElementOrderSigRef,
  latestElementsRef,
  latestFilesRef,
  computeElementOrderSig,
  recordElementVersion,
  onAccessDenied,
  eagerConnect,
  isSaverRef,
  onSocketOpen,
}: UseEditorCollaborationInput) => {
  const [interacted, setInteracted] = useState(false);
  const shouldConnect = eagerConnect || interacted;
  const onSocketOpenRef = useRef(onSocketOpen);
  useEffect(() => {
    onSocketOpenRef.current = onSocketOpen;
  }, [onSocketOpen]);
  const requestConnect = useCallback(() => setInteracted(true), []);
  // Entrar a un dibujo propio solo para mirarlo no abre el socket: se abre con la primera
  // interacción real. El socket tarda ~100 ms en abrirse y, al abrirse, el editor reenvía lo
  // que haya cambiado entretanto (onSocketOpen).
  useEffect(() => {
    if (!drawingId || !isReady || shouldConnect) return;
    const activate = () => setInteracted(true);
    const events = ["pointerdown", "keydown", "touchstart", "drop"] as const;
    for (const name of events) document.addEventListener(name, activate, { capture: true, once: true });
    return () => {
      for (const name of events) document.removeEventListener(name, activate, { capture: true });
    };
  }, [drawingId, isReady, shouldConnect]);
  // El reenvío del zoom con la rueda es de la interfaz, no de la colaboración: no depende del socket.
  useEffect(() => {
    if (!drawingId || !isReady) return;
    return attachCanvasZoomForwarding(editorContainerRef.current);
  }, [drawingId, isReady, editorContainerRef]);
  const socketMeRef = useRef<UserIdentity>(me);
  const [peers, setPeers] = useState<Peer[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const lastPresenceUsersRef = useRef<Peer[] | null>(null);
  const lastCursorEmit = useRef<number>(0);
  const cursorBuffer = useRef<Map<SocketId, Collaborator>>(new Map());
  const animationFrameId = useRef<number>(0);
  const isSyncing = useRef(false);
  const pendingRemoteElementsRef = useRef<Map<string, ExcalidrawElement>>(new Map());
  const pendingRemoteFilesRef = useRef<BinaryFiles>({});
  const pendingRemoteElementOrderRef = useRef<string[] | null>(null);
  const remoteFlushScheduledRef = useRef(false);
  const remoteFlushRafIdRef = useRef<number | null>(null);

  useEffect(() => {
    socketMeRef.current = me;
    // react-doctor-disable-next-line react-doctor/exhaustive-deps -- false positive: UserIdentity has exactly these 4 fields (id/name/initials/color), so this deps list is already fully exhaustive for `me`'s content; listing them individually (not the object) avoids re-running on every render when the caller passes a fresh `me` object with the same values.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la identidad se descompone en campos para evitar reconexiones por objetos nuevos equivalentes.
  }, [me.id, me.name, me.initials, me.color]);

  useEffect(() => {
    if (!drawingId || !isReady || !shouldConnect) return;

    // No hay token que adjuntar aquí: la cookie HttpOnly `excalidash_session`
    // viaja automáticamente con el upgrade de WS (mismo origen). El Worker
    // rechaza el upgrade si falta o no es válida — eso se manifiesta abajo
    // como un cierre anómalo (onAccessDenied).
    const wsUrl = `${getWorkerBaseUrl().replace(/^http/, "ws")}/rooms/${drawingId}/ws`;

    // Reconexión con backoff exponencial + jitter (antes no existía
    // ninguna: un drop de red dejaba al editor desconectado en silencio
    // hasta que cambiara alguna dep del efecto). Se pausa mientras la
    // pestaña está oculta (visibilitychange) y se reintenta al instante al
    // volver a estar visible — ver docs/WORKER_COST_OPTIMIZATION.md,
    // sección "Colaboración y WebSocket".
    let isTornDown = false;
    let reconnectAttempt = 0;
    let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let currentSocket: WebSocket | null = null;
    // Un WebSocket no pasa por el interceptor de axios que renueva el JWT (15 min) tras un
    // 401: si el JWT caducó (la app ya no pregunta /auth/me en cada entrada), el upgrade se
    // rechaza y el navegador lo ve como un cierre 1006, igual que un acceso denegado. Antes de
    // darlo por denegado se renueva la sesión y se reintenta UNA vez.
    let refreshedForAccess = false;

    const clearScheduledReconnect = () => {
      if (reconnectTimeoutId !== null) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }
    };

    const scheduleReconnect = () => {
      if (isTornDown || document.hidden) return;
      const attempt = reconnectAttempt;
      reconnectAttempt += 1;
      const base = Math.min(1000 * 2 ** attempt, 30000);
      const jitter = base * 0.5 + Math.random() * base * 0.5;
      clearScheduledReconnect();
      reconnectTimeoutId = setTimeout(() => {
        reconnectTimeoutId = null;
        connect();
      }, jitter);
    };

    function connect() {
      const socket = new WebSocket(wsUrl);
      currentSocket = socket;
      socketRef.current = socket;
      if (import.meta.env.DEV) {
        (window as Window & { __EXCALIDASH_SOCKET_STATUS__?: { connected: boolean } }).__EXCALIDASH_SOCKET_STATUS__ = { connected: false };
      }

      socket.onopen = () => {
        reconnectAttempt = 0;
        refreshedForAccess = false;
        if (import.meta.env.DEV) (window as Window & { __EXCALIDASH_SOCKET_STATUS__?: { connected: boolean } }).__EXCALIDASH_SOCKET_STATUS__ = { connected: true };
        wsSend(socket, { type: "presence-join", user: socketMeRef.current });
        onSocketOpenRef.current?.();
      };
      socket.onclose = (event) => {
        // Sin conexión con la sala nadie más recibe lo que este cliente cambia: guarda él.
        isSaverRef.current = true;
        if (import.meta.env.DEV) (window as Window & { __EXCALIDASH_SOCKET_STATUS__?: { connected: boolean } }).__EXCALIDASH_SOCKET_STATUS__ = { connected: false };
        // El Worker rechaza el upgrade (sin llegar nunca al DO) para un
        // dibujo que este usuario no puede leer/escribir — eso se manifiesta
        // aquí como un cierre anómalo en vez del antiguo evento "error" en
        // banda de socket.io. No tiene sentido reintentar ese caso: el
        // acceso no va a cambiar solo por reconectar.
        if (event.code === 1006 || event.code === 1008) {
          if (!refreshedForAccess && !isTornDown) {
            refreshedForAccess = true;
            authRefresh().then(
              () => {
                if (!isTornDown) connect();
              },
              () => onAccessDenied(),
            );
            return;
          }
          onAccessDenied();
          return;
        }
        if (!isTornDown) scheduleReconnect();
      };
      socket.onmessage = handleSocketMessage;
    }

    const handleVisibilityChange = () => {
      if (document.hidden || isTornDown) return;
      // Volvimos a la pestaña: si no hay socket vivo/conectando, reconectar
      // ya mismo en vez de esperar a que venza el backoff pendiente.
      const state = currentSocket?.readyState;
      if (state !== WebSocket.OPEN && state !== WebSocket.CONNECTING) {
        clearScheduledReconnect();
        connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const renderLoop = () => {
      if (cursorBuffer.current.size > 0 && excalidrawAPI.current) {
        const collaborators = new Map<SocketId, Collaborator>(
          excalidrawAPI.current.getAppState().collaborators || [],
        );
        cursorBuffer.current.forEach((data, userId) => {
          collaborators.set(userId, data);
        });
        cursorBuffer.current.clear();
        const { sceneUpdate } = buildRemoteSceneUpdate({ collaborators });
        if (sceneUpdate) {
          excalidrawAPI.current.updateScene(sceneUpdate);
        }
      }
      animationFrameId.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const hasNonEmptyArray = (value: unknown): value is unknown[] =>
      Array.isArray(value) && value.length > 0;
    const flushRemoteUpdates = () => {
      remoteFlushScheduledRef.current = false;
      remoteFlushRafIdRef.current = null;
      if (!excalidrawAPI.current) return;
      const hasPendingElements = pendingRemoteElementsRef.current.size > 0;
      const hasPendingFiles =
        Object.keys(pendingRemoteFilesRef.current || {}).length > 0;
      const pendingOrderRaw = pendingRemoteElementOrderRef.current;
      const hasPendingOrder = hasNonEmptyArray(pendingOrderRaw);
      if (!hasPendingElements && !hasPendingFiles && !hasPendingOrder) return;
      isSyncing.current = true;
      try {
        const pendingElements = Array.from(
          pendingRemoteElementsRef.current.values(),
        );
        pendingRemoteElementsRef.current.clear();
        const incomingFiles = pendingRemoteFilesRef.current || {};
        pendingRemoteFilesRef.current = {};
        const elementOrder = hasPendingOrder ? pendingOrderRaw : null;
        pendingRemoteElementOrderRef.current = null;
        const { sceneUpdate, mergedElements, nextFiles, shouldUpdateFiles } =
          buildRemoteSceneUpdate({
            localElements:
              excalidrawAPI.current.getSceneElementsIncludingDeleted(),
            pendingElements,
            elementOrder,
            lastSyncedFiles: lastSyncedFilesRef.current,
            incomingFiles,
          });
        if (
          shouldUpdateFiles &&
          typeof excalidrawAPI.current.addFiles === "function"
        ) {
          excalidrawAPI.current.addFiles(Object.values(incomingFiles));
        }
        if (mergedElements) {
          if (elementOrder) {
            lastSyncedElementOrderSigRef.current =
              computeElementOrderSig(mergedElements);
          }
          pendingElements.forEach((el) => {
            recordElementVersion(el);
          });
          if (sceneUpdate) excalidrawAPI.current.updateScene(sceneUpdate);
          latestElementsRef.current = mergedElements;
        } else if (sceneUpdate) {
          excalidrawAPI.current.updateScene(sceneUpdate);
        }
        if (shouldUpdateFiles) {
          latestFilesRef.current = nextFiles;
          lastSyncedFilesRef.current = nextFiles;
        }
      } finally {
        isSyncing.current = false;
      }
      const moreElements = pendingRemoteElementsRef.current.size > 0;
      const moreFiles =
        Object.keys(pendingRemoteFilesRef.current || {}).length > 0;
      const moreOrder = hasNonEmptyArray(pendingRemoteElementOrderRef.current);
      if (moreElements || moreFiles || moreOrder) {
        if (!remoteFlushScheduledRef.current) {
          remoteFlushScheduledRef.current = true;
          remoteFlushRafIdRef.current =
            requestAnimationFrame(flushRemoteUpdates);
        }
      }
    };
    const scheduleRemoteFlush = () => {
      if (remoteFlushScheduledRef.current) return;
      remoteFlushScheduledRef.current = true;
      remoteFlushRafIdRef.current = requestAnimationFrame(flushRemoteUpdates);
    };

    const handleSocketMessage = (event: MessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (typeof parsed !== "object" || parsed === null) return;
        msg = parsed as Record<string, unknown>;
      } catch {
        return;
      }

      if (msg.type === "saver") {
        // La sala decide quién guarda con la cadencia normal; los demás guardan espaciado.
        isSaverRef.current = msg.isSaver === true;
        return;
      }
      if (msg.type === "presence-update") {
        const users = Array.isArray(msg.users) ? (msg.users as Peer[]) : [];
        lastPresenceUsersRef.current = users;
        const selfId = socketMeRef.current.id;
        setPeers(users.filter((u) => u.id !== selfId));
        if (excalidrawAPI.current) {
          const collaborators = new Map<SocketId, Collaborator>(
            excalidrawAPI.current.getAppState().collaborators || [],
          );
          users.forEach((user) => {
            if (!user.isActive && user.id !== selfId) {
              collaborators.delete(user.id as SocketId);
            }
          });
          const { sceneUpdate } = buildRemoteSceneUpdate({ collaborators });
          if (sceneUpdate) {
            excalidrawAPI.current.updateScene(sceneUpdate);
          }
        }
        return;
      }

      if (msg.type === "cursor-move") {
          cursorBuffer.current.set(msg.userId as SocketId, {
          pointer: msg.pointer,
          button: msg.button || "up",
          selectedElementIds: msg.selectedElementIds || {},
          username: msg.username,
          color: { background: msg.color, stroke: msg.color },
          id: msg.userId,
          } as Collaborator);
        return;
      }

      if (msg.type === "element-update") {
        const { elements, files, elementOrder } = msg as {
          elements: ExcalidrawElement[];
          files?: BinaryFiles;
          elementOrder?: string[];
        };
        if (Array.isArray(elements)) {
          for (const el of elements) {
            const id = el?.id;
            if (typeof id === "string" && id.length > 0) {
              pendingRemoteElementsRef.current.set(id, el);
            }
          }
        }
        if (files && typeof files === "object") {
          const stage = (incoming: BinaryFiles) => {
            pendingRemoteFilesRef.current = { ...pendingRemoteFilesRef.current, ...incoming };
          };
          if (filesNeedRehydration(files)) {
            void rehydrateFilesFromUrls(files).then((hydrated) => { stage(hydrated); scheduleRemoteFlush(); });
          } else {
            stage(files);
          }
        }
        if (Array.isArray(elementOrder) && elementOrder.length > 0) {
          pendingRemoteElementOrderRef.current = elementOrder;
        }
        scheduleRemoteFlush();
      }
    };

    connect();

    const pendingRemoteElements = pendingRemoteElementsRef.current;
    return () => {
      isTornDown = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearScheduledReconnect();
      if (currentSocket) {
        currentSocket.onopen = null;
        currentSocket.onmessage = null;
        currentSocket.onclose = null;
        currentSocket.close();
      }
      if (remoteFlushRafIdRef.current !== null) {
        cancelAnimationFrame(remoteFlushRafIdRef.current);
        remoteFlushRafIdRef.current = null;
      }
      remoteFlushScheduledRef.current = false;
      pendingRemoteElements.clear();
      pendingRemoteFilesRef.current = {};
      pendingRemoteElementOrderRef.current = null;
      cancelAnimationFrame(animationFrameId.current);
    };
  }, [
    drawingId,
    me,
    isReady,
    excalidrawAPI,
    editorContainerRef,
    lastSyncedFilesRef,
    lastSyncedElementOrderSigRef,
    latestElementsRef,
    latestFilesRef,
    computeElementOrderSig,
    recordElementVersion,
    onAccessDenied,
    shouldConnect,
    isSaverRef,
  ]);

  const onPointerUpdate = useCallback(
    (payload: { pointer: unknown; button?: unknown }) => {
      const now = Date.now();
      if (now - lastCursorEmit.current > 50 && socketRef.current) {
        const self = socketMeRef.current;
        wsSend(socketRef.current, {
          type: "cursor-move",
          pointer: payload.pointer,
          button: payload.button,
          username: self.name,
          userId: self.id,
          drawingId,
          color: self.color,
        });
        lastCursorEmit.current = now;
      }
    },
    [drawingId],
  );

  return {
    peers,
    socketMeRef,
    socketRef,
    isSyncing,
    onPointerUpdate,
    requestConnect,
  };
};
