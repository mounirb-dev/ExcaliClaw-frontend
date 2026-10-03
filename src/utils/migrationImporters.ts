/** Conversores "best effort" de formatos de otras apps a elementos de Excalidraw.
 * Miro no expone un botón nativo de "exportar a JSON de Excalidraw" — un usuario
 * que migra trae el JSON crudo de la API de tableros de Miro (GET .../items,
 * opcionalmente con GET .../connectors pegado en el mismo array o bajo una
 * clave "connectors"/"widgets"). No hay forma de fidelidad 1:1 (formas, texto y
 * conectores mapean razonablemente; frames/imágenes/embeds se ignoran), así que
 * esto es deliberadamente heurístico: mejor una migración aproximada e inmediata
 * que ninguna. `restoreElements` (del propio paquete de Excalidraw) rellena todos
 * los campos que un ExcalidrawElement real necesita a partir de estos objetos
 * parciales — no hace falta fabricar id/seed/version a mano aquí. */
import { restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

interface MiroPosition {
  x?: number;
  y?: number;
}

interface MiroGeometry {
  width?: number;
  height?: number;
  rotation?: number;
}

interface MiroStyle {
  fillColor?: string;
  borderColor?: string;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number | string;
}

interface MiroItem {
  id?: string;
  type?: string;
  position?: MiroPosition;
  geometry?: MiroGeometry;
  data?: { content?: string; shape?: string; title?: string };
  style?: MiroStyle;
}

interface MiroConnector {
  id?: string;
  startItem?: { position?: MiroPosition };
  endItem?: { position?: MiroPosition };
  style?: MiroStyle;
}

const stripHtml = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

/** Miro usa nombres de color con token ("light_yellow", "blue") en vez de hex
 * en la mayoría de exports — no hay tabla oficial pública, así que se ignoran
 * (el elemento cae al color por defecto) en vez de adivinar mal. */
const resolveColor = (value: unknown, fallback: string): string => (isHexColor(value) ? value : fallback);

const shapeTypeFor = (miroShape: string | undefined): "rectangle" | "ellipse" | "diamond" => {
  const s = (miroShape || "").toLowerCase();
  if (s.includes("circle") || s.includes("ellipse")) return "ellipse";
  if (s.includes("rhombus") || s.includes("diamond")) return "diamond";
  return "rectangle";
};

/** Heurística de detección: un export de Miro trae ítems con `type` de la API
 * de tableros de Miro (sticky_note/shape/text/...) y una `position`/`geometry`
 * con esa forma — no coincide con nada de lo que produce Excalidraw ni con
 * nuestro export legado (que usa `elements`/`appState`). */
export const isMiroExport = (data: unknown): boolean => {
  const items = extractMiroItems(data);
  if (items.length === 0) return false;
  return items.some(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as MiroItem).type === "string" &&
      typeof (item as MiroItem).position === "object",
  );
};

const extractMiroItems = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data;
  if (typeof data !== "object" || data === null) return [];
  const maybe = data as Record<string, unknown>;
  const buckets = [maybe.data, maybe.items, maybe.widgets].filter(Array.isArray) as unknown[][];
  return buckets.flat();
};

const extractMiroConnectors = (data: unknown): MiroConnector[] => {
  if (typeof data !== "object" || data === null) return [];
  const maybe = data as Record<string, unknown>;
  const raw = Array.isArray(maybe.connectors) ? maybe.connectors : [];
  return raw as MiroConnector[];
};

export const convertMiroExport = (
  data: unknown,
): { elements: ExcalidrawElement[]; skipped: number } => {
  const rawItems = extractMiroItems(data);
  const connectors = extractMiroConnectors(data);
  const partials: Partial<ExcalidrawElement>[] = [];
  let skipped = 0;

  for (const raw of rawItems) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as MiroItem;
    const px = item.position?.x;
    const py = item.position?.y;
    if (typeof px !== "number" || typeof py !== "number") {
      skipped += 1;
      continue;
    }
    const width = item.geometry?.width && item.geometry.width > 0 ? item.geometry.width : 200;
    const height = item.geometry?.height && item.geometry.height > 0 ? item.geometry.height : 100;
    // Miro reporta el centro del ítem, Excalidraw espera la esquina superior izquierda.
    const x = px - width / 2;
    const y = py - height / 2;
    const angle = item.geometry?.rotation ? (item.geometry.rotation * Math.PI) / 180 : 0;
    const text = typeof item.data?.content === "string" ? stripHtml(item.data.content) : "";

    switch (item.type) {
      case "sticky_note": {
        partials.push({
          type: "rectangle",
          x,
          y,
          width,
          height,
          angle,
          backgroundColor: resolveColor(item.style?.fillColor, "#fff9b1"),
          strokeColor: "transparent",
          fillStyle: "solid",
        } as Partial<ExcalidrawElement>);
        if (text) {
          partials.push({
            type: "text",
            x: x + 10,
            y: y + 10,
            width: width - 20,
            height: height - 20,
            text,
            fontSize: 20,
            strokeColor: resolveColor(item.style?.color, "#1e1e1e"),
          } as Partial<ExcalidrawElement>);
        }
        break;
      }
      case "shape": {
        partials.push({
          type: shapeTypeFor(item.data?.shape),
          x,
          y,
          width,
          height,
          angle,
          backgroundColor: resolveColor(item.style?.fillColor, "transparent"),
          strokeColor: resolveColor(item.style?.borderColor, "#1e1e1e"),
          fillStyle: "solid",
        } as Partial<ExcalidrawElement>);
        if (text) {
          partials.push({
            type: "text",
            x: x + 10,
            y: y + 10,
            width: width - 20,
            height: height - 20,
            text,
            fontSize: 16,
            strokeColor: resolveColor(item.style?.color, "#1e1e1e"),
          } as Partial<ExcalidrawElement>);
        }
        break;
      }
      case "text": {
        partials.push({
          type: "text",
          x,
          y,
          width,
          height,
          angle,
          text: text || " ",
          fontSize: 20,
          strokeColor: resolveColor(item.style?.color, "#1e1e1e"),
        } as Partial<ExcalidrawElement>);
        break;
      }
      default:
        // frame/image/embed/document/mindmap/app_card/card/unsupported: sin
        // mapeo razonable a un tipo de Excalidraw — se descartan en vez de
        // fabricar algo engañoso.
        skipped += 1;
    }
  }

  for (const connector of connectors) {
    const sx = connector.startItem?.position?.x;
    const sy = connector.startItem?.position?.y;
    const ex = connector.endItem?.position?.x;
    const ey = connector.endItem?.position?.y;
    if (typeof sx !== "number" || typeof sy !== "number" || typeof ex !== "number" || typeof ey !== "number") {
      skipped += 1;
      continue;
    }
    const x = Math.min(sx, ex);
    const y = Math.min(sy, ey);
    partials.push({
      type: "arrow",
      x,
      y,
      width: Math.abs(ex - sx) || 1,
      height: Math.abs(ey - sy) || 1,
      points: [
        [sx - x, sy - y],
        [ex - x, ey - y],
      ],
      strokeColor: resolveColor(connector.style?.strokeColor, "#1e1e1e"),
    } as Partial<ExcalidrawElement>);
  }

  if (partials.length === 0) return { elements: [], skipped };

  // Miro usa el sistema de coordenadas del tablero (puede tener cualquier
  // origen, incluso muy negativo) — se normaliza para que el dibujo aparezca
  // visible cerca de (0,0) al abrirlo, en vez de fuera del viewport inicial.
  let minX = Infinity;
  let minY = Infinity;
  for (const p of partials) {
    if (typeof p.x === "number") minX = Math.min(minX, p.x);
    if (typeof p.y === "number") minY = Math.min(minY, p.y);
  }
  const offsetX = Number.isFinite(minX) ? minX - 40 : 0;
  const offsetY = Number.isFinite(minY) ? minY - 40 : 0;
  const normalized = partials.map((p) => ({
    ...p,
    x: typeof p.x === "number" ? p.x - offsetX : p.x,
    y: typeof p.y === "number" ? p.y - offsetY : p.y,
  }));

  // restoreElements acepta elementos incompletos y los completa (version, seed, etc.): ese es su cometido.
  const restored = restoreElements(normalized as unknown as Parameters<typeof restoreElements>[0], null);
  return { elements: [...restored], skipped };
};
