import { useCallback, useEffect, useRef, useState } from "react";
import type { Drawing, DrawingSummary, SceneAppState, SceneElement, SceneFiles } from "../../types";
import { previewHasEmbeddedImages } from "../../utils/previewSvg";
import * as api from "../../api";
import { deleteCachedByPrefixExcept, getCached, setCached } from "../../utils/secureCache";
import { generatePreviewSvg } from "../../utils/previewGenerate";

// El servidor SÍ persiste la vista previa ahora (GET/PUT
// /drawings/:id/preview, ver el backend) — antes
// api.getDrawingPreview era un stub que siempre devolvía null, así que sin
// esto CADA montaje del dashboard, en CADA dispositivo/sesión sin caché
// local, repetía para CADA tarjeta visible: un GET completo del dibujo
// (elements/appState/files enteros, no solo el resumen de la lista) más un
// exportToSvg del lado del cliente — hasta 24 fetches + exports de golpe
// cada vez que se volvía de editar un dibujo o se abría el dashboard en un
// dispositivo nuevo, que es exactamente el "se tarda mucho en cargar"
// reportado. Ahora, cuando el servidor no tiene ninguna vista previa
// guardada (primera vez para ese drawing), se genera aquí del lado del
// cliente como siempre Y se sube con putDrawingPreview — así la próxima
// carga (este dispositivo u otro) la trae ya hecha en vez de regenerarla.
// Cacheado en localStorage/IndexedDB por id+version además: cuando el
// dibujo cambia de verdad, version avanza y la clave cambia sola, sin
// necesidad de invalidar nada a mano.
// Cola global con concurrencia acotada para el trabajo de red/CPU de las
// miniaturas: 24 tarjetas montadas a la vez disparaban 24 GET simultáneos
// (y, si no había preview guardada, otros 24 GET de dibujo completo + PUT),
// lo que agotaba el rate limit del Worker (429) y dejaba tarjetas sin
// miniatura además de tardar mucho en cargar.
const PREVIEW_CONCURRENCY = 4;
let activePreviewJobs = 0;
const pendingPreviewJobs: Array<() => void> = [];
const runPreviewJob = async <T>(job: () => Promise<T>, isCancelled: () => boolean): Promise<T | undefined> => {
  if (activePreviewJobs >= PREVIEW_CONCURRENCY) {
    await new Promise<void>((resolve) => pendingPreviewJobs.push(resolve));
  }
  activePreviewJobs++;
  try {
    if (isCancelled()) return undefined;
    return await job();
  } finally {
    activePreviewJobs--;
    pendingPreviewJobs.shift()?.();
  }
};

const previewCacheKey = (drawingId: string, version: number) => `preview-svg-v2:${drawingId}:${version}`; // v2: descarta miniaturas congeladas cacheadas antes del fix del editor
const PREVIEW_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Guarda la miniatura de esta versión y borra las de versiones anteriores del mismo dibujo:
// la clave lleva la versión, así que sin esto cada edición dejaba una entrada más (decenas por dibujo).
const rememberPreview = async (drawingId: string, cacheKey: string, svg: string): Promise<void> => {
  await setCached(cacheKey, svg);
  await deleteCachedByPrefixExcept(`preview-svg-v2:${drawingId}:`, cacheKey);
};

export type HydratedDrawingData = {
  elements: readonly SceneElement[];
  appState: SceneAppState;
  files: SceneFiles;
};

export const useDrawingPreview = (
  drawing: DrawingSummary,
  onPreviewGenerated?: (id: string, preview: string) => void,
) => {
  // Solo para el fallback generado de forma asíncrona/obtenido del
  // servidor: cuando el dibujo ya lleva una vista previa, ese valor se usa
  // directamente (abajo) en vez de copiarse primero al estado.
  const [generatedPreviewSvg, setGeneratedPreviewSvg] = useState<string | null>(null);
  const previewSvg = drawing.preview ?? generatedPreviewSvg;
  const [fullData, setFullData] = useState<HydratedDrawingData | null>(null);

  const fullDataRef = useRef(fullData);
  const fullDataPromiseRef = useRef<Promise<HydratedDrawingData> | null>(null);
  const drawingIdRef = useRef(drawing.id);
  useEffect(() => {
    fullDataRef.current = fullData;
  }, [fullData]);
  useEffect(() => {
    drawingIdRef.current = drawing.id;
  }, [drawing.id]);

  const ensureFullData = useCallback(async (): Promise<HydratedDrawingData> => {
    if (fullDataRef.current) {
      return fullDataRef.current;
    }
    if (fullDataPromiseRef.current) {
      return fullDataPromiseRef.current;
    }
    const currentDrawingId = drawingIdRef.current;
    const promise = api
      .getDrawing(currentDrawingId)
      .then((fullDrawing) => {
        const payload: HydratedDrawingData = {
          elements: fullDrawing.elements || [],
          appState: fullDrawing.appState || {},
          files: fullDrawing.files || {},
        };
        setFullData(payload);
        fullDataPromiseRef.current = null;
        return payload;
      })
      .catch((error) => {
        fullDataPromiseRef.current = null;
        throw error;
      });
    fullDataPromiseRef.current = promise;
    return promise;
  }, []);

  // El callback llega recreado en cada render del Dashboard (no está
  // memoizado); si entrara en las dependencias del efecto, cada miniatura
  // lista re-renderizaba el padre y relanzaba la carga de TODAS las tarjetas
  // (se veían los 24 GET /preview repetidos 3 veces y 429 del rate limit).
  const onPreviewGeneratedRef = useRef(onPreviewGenerated);
  useEffect(() => {
    onPreviewGeneratedRef.current = onPreviewGenerated;
  }, [onPreviewGenerated]);

  useEffect(() => {
    let cancelled = false;
    if (drawing.preview) return;
    const generatePreview = async () => {
      // Primero la caché local (IndexedDB, la misma que usa la lista de
      // dibujos) — evita por completo el GET del dibujo completo y el
      // exportToSvg cuando ya se generó una vez para esta versión exacta.
      const cacheKey = previewCacheKey(drawing.id, drawing.version);
      const cachedSvg = await getCached<string>(cacheKey, PREVIEW_CACHE_MAX_AGE_MS);
      if (cancelled) return;
      if (cachedSvg) {
        setGeneratedPreviewSvg(cachedSvg);
        onPreviewGeneratedRef.current?.(drawing.id, cachedSvg);
        return;
      }

      // Las vistas previas ya no se incrustan en las respuestas de lista.
      // Preferir el endpoint barato de vista previa por dibujo, cacheable
      // con ETag; recurrir a la generación del lado del cliente (que
      // obtiene los datos completos) solo cuando el servidor no tiene
      // ninguna vista previa almacenada para este dibujo (404). Un error
      // distinto (429, red) NO cae al fallback: cargaría el dibujo completo
      // y empeoraría justo el problema que causó el error.
      let stored: string | null | undefined;
      try {
        stored = await runPreviewJob(
          () => api.getDrawingPreview(drawing.id, drawing.version),
          () => cancelled,
        );
      } catch {
        return;
      }
      if (cancelled) return;
      if (stored) {
        setGeneratedPreviewSvg(stored);
        onPreviewGeneratedRef.current?.(drawing.id, stored);
        void rememberPreview(drawing.id, cacheKey, stored);
        return;
      }
      if (stored === undefined) return;
      try {
        // La generación (CPU, hilo principal) entra en la misma cola que las
        // peticiones: sin esto, 24 exports pesados se solapaban y congelaban
        // la página. Ver previewGenerate.ts (escenas pesadas -> raster acotado).
        const previewHtml = await runPreviewJob(async () => {
          const data = await ensureFullData();
          if (cancelled || !data?.elements || !data?.appState) return undefined;
          return generatePreviewSvg({
            elements: data.elements,
            appState: data.appState,
            files: data.files || {},
          });
        }, () => cancelled);
        if (cancelled || !previewHtml) return;
        setGeneratedPreviewSvg(previewHtml);
        onPreviewGeneratedRef.current?.(drawing.id, previewHtml);
        void rememberPreview(drawing.id, cacheKey, previewHtml);
        // Best-effort: si el que mira este drawing solo tiene acceso de
        // lectura (compartido view-only), el servidor rechaza el PUT con
        // 403 — esperado, no hay nada que reintentar ni reportar, la
        // próxima persona con acceso de edición que lo vea la sube por su
        // cuenta.
        void api.putDrawingPreview(drawing.id, previewHtml).catch(() => {});
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to generate preview", e);
        }
      }
    };
    generatePreview();
    return () => {
      cancelled = true;
    };
  }, [drawing.id, drawing.version, drawing.preview, ensureFullData]);

  const buildExportDrawing = useCallback(async (): Promise<Drawing> => {
    const data = await ensureFullData();
    return {
      ...drawing,
      elements: data.elements || [],
      appState: data.appState || {},
      files: data.files || {},
    };
  }, [drawing, ensureFullData]);

  return {
    previewSvg,
    hasEmbeddedImages: previewHasEmbeddedImages(previewSvg),
    buildExportDrawing,
  };
};
